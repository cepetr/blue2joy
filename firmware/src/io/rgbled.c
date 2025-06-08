/*
 * This file is part of the Blue2Joy project
 * (https://github.com/cepetr/blue2joy).
 * Copyright (c) 2025
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

#include <math.h>

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include <zephyr/drivers/led.h>
#include <zephyr/drivers/led_strip.h>

#include "rgbled.h"

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

K_THREAD_STACK_DEFINE(g_rgbled_drv_stack, 2048);

typedef struct {
    struct k_thread thread;
    struct k_mutex mutex;

    struct {
        const rgbled_seq_t *state_seq;
        const rgbled_seq_t *ev_seq;
        uint8_t brightness;
    } sync;

} rgbled_drv_t;

rgbled_drv_t g_rgbled_drv;

#define STRIP_NODE       DT_ALIAS(led_strip)
#define STRIP_NUM_PIXELS DT_PROP(DT_ALIAS(led_strip), chain_length)

static const struct device *const strip = DEVICE_DT_GET(STRIP_NODE);

static void rgbled_thread(void *p1, void *p2, void *p3);

int led_rgb_cmp(const struct led_rgb a, const struct led_rgb b)
{
    return memcmp(&a, &b, sizeof(struct led_rgb));
}

int rgbled_init(void)
{
    rgbled_drv_t *drv = &g_rgbled_drv;

    memset(drv, 0, sizeof(rgbled_drv_t));

    drv->sync.brightness = 5; // Default brightness

    k_thread_create(&drv->thread, g_rgbled_drv_stack, K_THREAD_STACK_SIZEOF(g_rgbled_drv_stack),
                    rgbled_thread, NULL, NULL, NULL, K_LOWEST_APPLICATION_THREAD_PRIO, 0,
                    K_NO_WAIT);

    return 0;
}

void rgbled_set_brightness(uint8_t brightness)
{
    rgbled_drv_t *drv = &g_rgbled_drv;

    k_mutex_lock(&drv->mutex, K_FOREVER);
    drv->sync.brightness = brightness;
    k_mutex_unlock(&drv->mutex);
}

static inline float ease_in_out_quad(float t)
{
    return (t < 0.5f) ? 2.0f * t * t : 1.0f - 2.0f * (1.0f - t) * (1.0f - t);
}

static struct led_rgb interpolate(const struct led_rgb c0, const struct led_rgb c1, int64_t t0,
                                  int64_t t1, int64_t t, uint8_t brightness)
{
    if (t0 == t1) {
        return c0;
    }

    float brightness_factor = (float)CLAMP(brightness, 0, 10) / 10.0f;

    float factor = (float)(t - t0) / (t1 - t0);
    factor = CLAMP(factor, 0.0f, 1.0f);

    factor = ease_in_out_quad(factor);

    const float gamma = 2.2f;
    const float inv_gamma = 1.0f / gamma;

    float r0 = powf(c0.r / 255.0f, inv_gamma);
    float g0 = powf(c0.g / 255.0f, inv_gamma);
    float b0 = powf(c0.b / 255.0f, inv_gamma);

    float r1 = powf(c1.r / 255.0f, inv_gamma);
    float g1 = powf(c1.g / 255.0f, inv_gamma);
    float b1 = powf(c1.b / 255.0f, inv_gamma);

    float r = (r0 + factor * (r1 - r0)) * brightness_factor;
    float g = (g0 + factor * (g1 - g0)) * brightness_factor;
    float b = (b0 + factor * (b1 - b0)) * brightness_factor;

    r = powf(r, gamma);
    g = powf(g, gamma);
    b = powf(b, gamma);

    struct led_rgb color;
    color.r = (uint8_t)(CLAMP(r, 0.0f, 1.0f) * 255.0f);
    color.g = (uint8_t)(CLAMP(g, 0.0f, 1.0f) * 255.0f);
    color.b = (uint8_t)(CLAMP(b, 0.0f, 1.0f) * 255.0f);

    return color;
}

static void rgbled_thread(void *p1, void *p2, void *p3)
{
    rgbled_drv_t *drv = &g_rgbled_drv;

    struct led_rgb cur_color = COLOR_OFF;
    struct led_rgb start_color = COLOR_OFF;
    struct led_rgb end_color = COLOR_OFF;

    const rgbled_seq_t *seq = NULL;

    int64_t start_time = k_uptime_get();
    int64_t end_time = k_uptime_get();

    for (;;) {
        int64_t now = k_uptime_get();

        k_mutex_lock(&drv->mutex, K_FOREVER);
        uint8_t brightness = drv->sync.brightness;
        k_mutex_unlock(&drv->mutex);

        if (now >= end_time) {
            // No sequence or end of sequence reached?
            if (seq == NULL || seq->duration == 0) {
                k_mutex_lock(&drv->mutex, K_FOREVER);
                if (drv->sync.ev_seq != NULL) {
                    // If there is an event sequence, use it
                    seq = drv->sync.ev_seq;
                    drv->sync.ev_seq = NULL;
                } else if (drv->sync.state_seq != NULL) {
                    // If there is a state sequence, use it
                    seq = drv->sync.state_seq;
                } else {
                    seq = NULL;
                }
                k_mutex_unlock(&drv->mutex);
            }

            if (seq != NULL) {
                start_color = seq->color;
                start_time = now;

                if (seq->duration > 0) {
                    end_color = start_color;
                    end_time = start_time + seq->duration;
                } else {
                    end_color = seq[1].color;
                    end_time = start_time - seq->duration;
                }

                ++seq;
            } else {
                start_color = COLOR_OFF;
                end_color = COLOR_OFF;
                start_time = now;
                end_time = now + 100;
            }
        }

        struct led_rgb color =
            interpolate(start_color, end_color, start_time, end_time, now, brightness);

        if (led_rgb_cmp(color, cur_color) != 0) {
            cur_color = color;
            led_strip_update_rgb(strip, &color, 1);
        }

        k_sleep(K_MSEC(MIN(end_time - now, 20)));
    }
}

void rgbled_set_state(const rgbled_seq_t *seq)
{
    rgbled_drv_t *drv = &g_rgbled_drv;

    k_mutex_lock(&drv->mutex, K_FOREVER);
    drv->sync.state_seq = seq;
    k_mutex_unlock(&drv->mutex);
}

void rgbled_set_event(const rgbled_seq_t *seq)
{
    rgbled_drv_t *drv = &g_rgbled_drv;

    k_mutex_lock(&drv->mutex, K_FOREVER);
    drv->sync.ev_seq = seq;
    k_mutex_unlock(&drv->mutex);
}
