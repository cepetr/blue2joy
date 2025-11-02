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

#include <zephyr/logging/log.h>
#include <zephyr/drivers/gpio.h>

#include <nrfx_timer.h>

#include "joystick.h"

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

static const struct gpio_dt_spec joy_d0 = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d0), gpios);
static const struct gpio_dt_spec joy_d1 = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d1), gpios);
static const struct gpio_dt_spec joy_d2 = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d2), gpios);
static const struct gpio_dt_spec joy_d3 = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d3), gpios);
static const struct gpio_dt_spec joy_trig = GPIO_DT_SPEC_GET(DT_ALIAS(joy_trig), gpios);

static const struct gpio_dt_spec joy_d0_fb = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d0_fb), gpios);
static const struct gpio_dt_spec joy_d1_fb = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d1_fb), gpios);
static const struct gpio_dt_spec joy_d2_fb = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d2_fb), gpios);
static const struct gpio_dt_spec joy_d3_fb = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d3_fb), gpios);

static const nrfx_timer_t timer = NRFX_TIMER_INSTANCE(3);

typedef struct {
    atomic_t enabled;
    atomic_t queued_steps;
    uint8_t state;
} encoder_t;

typedef struct {
    encoder_t x_enc;
    encoder_t y_enc;
} joystick_drv_t;

static joystick_drv_t g_joystick_drv;

static void process_encoder_steps(encoder_t *enc, const struct gpio_dt_spec *pin_a,
                                  const struct gpio_dt_spec *pin_b)
{
    if (atomic_get(&enc->enabled)) {
        uint8_t prev_state = enc->state;

        // Process queued steps
        if (atomic_get(&enc->queued_steps) > 0) {
            enc->state = (enc->state + 1) % 4;
            atomic_dec(&enc->queued_steps);
        } else if (atomic_get(&enc->queued_steps) < 0) {
            enc->state = (enc->state - 1 + 4) % 4;
            atomic_inc(&enc->queued_steps);
        }

        // Update outputs if state changed
        if (enc->state != prev_state) {
            bool a = (enc->state & 0x01) != 0;
            bool b = (enc->state & 0x02) != 0;
            gpio_pin_set_dt(pin_a, b ? 1 : 0);
            gpio_pin_set_dt(pin_b, a ^ b ? 1 : 0);
        }
    }
}

// TIMER handler for quadrature encoding
static void timer_handler(nrf_timer_event_t event_type, void *p_context)
{
    joystick_drv_t *drv = &g_joystick_drv;

    if (event_type == NRF_TIMER_EVENT_COMPARE3) {
        process_encoder_steps(&drv->x_enc, &joy_d0, &joy_d1);
        process_encoder_steps(&drv->y_enc, &joy_d2, &joy_d3);
    }
}

void joystick_init(void)
{
    joystick_drv_t *drv = &g_joystick_drv;

    memset(drv, 0, sizeof(*drv));

    gpio_pin_configure_dt(&joy_d0, GPIO_OUTPUT_HIGH);
    gpio_pin_configure_dt(&joy_d1, GPIO_OUTPUT_HIGH);
    gpio_pin_configure_dt(&joy_d2, GPIO_OUTPUT_HIGH);
    gpio_pin_configure_dt(&joy_d3, GPIO_OUTPUT_HIGH);
    gpio_pin_configure_dt(&joy_trig, GPIO_OUTPUT_HIGH);

    gpio_pin_configure_dt(&joy_d0_fb, GPIO_INPUT | GPIO_PULL_UP);
    gpio_pin_configure_dt(&joy_d1_fb, GPIO_INPUT | GPIO_PULL_UP);
    gpio_pin_configure_dt(&joy_d2_fb, GPIO_INPUT | GPIO_PULL_UP);
    gpio_pin_configure_dt(&joy_d3_fb, GPIO_INPUT | GPIO_PULL_UP);

    // Initialize TIMER3 used for quadrature encoding timing
    nrfx_timer_config_t timer_config = NRFX_TIMER_DEFAULT_CONFIG(NRFX_MHZ_TO_HZ(1));
    timer_config.mode = NRF_TIMER_MODE_TIMER;
    timer_config.bit_width = NRF_TIMER_BIT_WIDTH_16;

    int err = nrfx_timer_init(&timer, &timer_config, timer_handler);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_timer_init error: %08x", err);
        return;
    }

    IRQ_CONNECT(TIMER3_IRQn, IRQ_PRIO_LOWEST, nrfx_isr, nrfx_timer_3_irq_handler, 0)

    const int freq = 1000; // 1 kHz timer for quadrature updates
    nrfx_timer_extended_compare(&timer, NRF_TIMER_CC_CHANNEL3, 1000000 / freq,
                                NRF_TIMER_SHORT_COMPARE3_CLEAR_MASK, true);

    nrfx_timer_enable(&timer);
}

void joystick_set_up(bool active)
{
    joystick_drv_t *drv = &g_joystick_drv;

    if (active) {
        atomic_set(&drv->x_enc.enabled, false);
    }

    if (!atomic_get(&drv->x_enc.enabled)) {
        gpio_pin_set_dt(&joy_d0, active ? 0 : 1);
    }
}

void joystick_set_down(bool active)
{
    joystick_drv_t *drv = &g_joystick_drv;

    if (active) {
        atomic_set(&drv->x_enc.enabled, false);
    }

    if (!atomic_get(&drv->x_enc.enabled)) {
        gpio_pin_set_dt(&joy_d1, active ? 0 : 1);
    }
}

void joystick_set_left(bool active)
{
    joystick_drv_t *drv = &g_joystick_drv;

    if (active) {
        atomic_set(&drv->y_enc.enabled, false);
    }

    if (!atomic_get(&drv->y_enc.enabled)) {
        gpio_pin_set_dt(&joy_d2, active ? 0 : 1);
    }
}

void joystick_set_right(bool active)
{
    joystick_drv_t *drv = &g_joystick_drv;

    if (active) {
        atomic_set(&drv->y_enc.enabled, false);
    }

    if (!atomic_get(&drv->y_enc.enabled)) {
        gpio_pin_set_dt(&joy_d3, active ? 0 : 1);
    }
}

void joystick_set_trig(bool active)
{
    gpio_pin_set_dt(&joy_trig, active ? 0 : 1);
}

void joystick_queue_x_steps(int delta)
{
    joystick_drv_t *drv = &g_joystick_drv;

    if (delta != 0) {
        if (!atomic_set(&drv->x_enc.enabled, true)) {
            atomic_set(&drv->x_enc.queued_steps, 0);
            drv->x_enc.state = 0;
        }
        atomic_add(&drv->x_enc.queued_steps, delta);
    }
}

void joystick_queue_y_steps(int delta)
{
    joystick_drv_t *drv = &g_joystick_drv;

    if (delta != 0) {
        if (!atomic_set(&drv->y_enc.enabled, true)) {
            atomic_set(&drv->y_enc.queued_steps, 0);
            drv->y_enc.state = 0;
        }
        atomic_add(&drv->y_enc.queued_steps, delta);
    }
}
