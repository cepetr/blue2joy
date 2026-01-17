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

#include "io_pin.h"

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

typedef struct {
    // Current position (Q17.14 format)
    int32_t pos;
    // Encoder state (00, 01, 11, 10)
    uint8_t state;
} io_pin_encoder_t;

typedef struct {
    nrfx_timer_t timer;

    io_pin_config_t config[IO_PIN_COUNT];

    // Quadrature encoders state
    io_pin_encoder_t enc[IO_ENC_COUNT];

} io_pin_driver_t;

static io_pin_driver_t g_io_pin_drv;

static void timer_handler(nrf_timer_event_t event_type, void *p_context);

int io_pin_init(void)
{
    io_pin_driver_t *drv = &g_io_pin_drv;

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

    // Initialize TIMER3 used for encoder updates
    drv->timer = (nrfx_timer_t)NRFX_TIMER_INSTANCE(3);
    nrfx_timer_config_t timer_config = NRFX_TIMER_DEFAULT_CONFIG(NRFX_MHZ_TO_HZ(1));
    timer_config.mode = NRF_TIMER_MODE_TIMER;
    timer_config.bit_width = NRF_TIMER_BIT_WIDTH_16;

    int err = nrfx_timer_init(&drv->timer, &timer_config, timer_handler);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_timer_init error: %08x", err);
        return -EIO;
    }

    IRQ_CONNECT(TIMER3_IRQn, IRQ_PRIO_LOWEST, nrfx_isr, nrfx_timer_3_irq_handler, 0)

    const int freq = 1000; // 1 kHz timer for quadrature updates
    nrfx_timer_extended_compare(&drv->timer, NRF_TIMER_CC_CHANNEL3, 1000000 / freq,
                                NRF_TIMER_SHORT_COMPARE3_CLEAR_MASK, true);

    nrfx_timer_enable(&drv->timer);

    return 0;
}

void io_pin_configure(io_pin_t pin, const io_pin_config_t *config)
{
    io_pin_driver_t *drv = &g_io_pin_drv;

    if (pin >= IO_PIN_COUNT) {
        return;
    }

    unsigned int key = irq_lock();
    drv->config[pin] = *config;
    irq_unlock(key);
}

void io_pin_set(io_pin_t pin, bool active)
{
    switch (pin) {
    case IO_PIN_UP:
        gpio_pin_set_dt(&joy_d0, active ? 0 : 1);
        break;
    case IO_PIN_DOWN:
        gpio_pin_set_dt(&joy_d1, active ? 0 : 1);
        break;
    case IO_PIN_LEFT:
        gpio_pin_set_dt(&joy_d2, active ? 0 : 1);
        break;
    case IO_PIN_RIGHT:
        gpio_pin_set_dt(&joy_d3, active ? 0 : 1);
        break;
    case IO_PIN_TRIG:
        gpio_pin_set_dt(&joy_trig, active ? 0 : 1);
        break;
    default:
        break;
    }
}

static void timer_handler(nrf_timer_event_t event_type, void *p_context)
{
    io_pin_driver_t *drv = &g_io_pin_drv;

    if (event_type != NRF_TIMER_EVENT_COMPARE3) {
        return;
    }

    // Read & update encoders

    for (int enc_idx = 0; enc_idx < IO_ENC_COUNT; enc_idx++) {
        io_pin_encoder_t *enc = &drv->enc[enc_idx];

        uint8_t state = enc->state;

        if (enc->pos >= 16384) {
            enc->pos -= 16384;
            state = (state + 1) & 0x03;
        } else if (enc->pos <= -16384) {
            enc->pos += 16384;
            state = (state + 3) & 0x03;
        }

        if (enc->state == state) {
            continue;
        }

        enc->state = state;

        for (int i = 0; i < IO_PIN_COUNT; i++) {
            const io_pin_config_t *cfg = &drv->config[i];
            if (cfg->mode == IO_PIN_MODE_ENCODER && cfg->enc_idx == enc_idx) {
                const uint8_t map[4] = {0, 2, 3, 1};
                io_pin_set(i, map[state] & (1 << cfg->enc_phase) ? false : true);
            }
        }
    }
}

void io_pin_update_encoder(uint8_t enc_idx, int32_t delta, int32_t max)
{
    io_pin_driver_t *drv = &g_io_pin_drv;

    if (enc_idx >= ARRAY_SIZE(drv->enc)) {
        return;
    }

    io_pin_encoder_t *enc = &drv->enc[enc_idx];

    unsigned int key = irq_lock();
    enc->pos = CLAMP(enc->pos + delta, -max << 14, max << 14);
    irq_unlock(key);
}
