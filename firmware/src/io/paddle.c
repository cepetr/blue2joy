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

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/drivers/gpio.h>

#include <nrfx_comp.h>
#include <nrfx_timer.h>
#include <nrfx_ppi.h>
#include <nrfx_gpiote.h>

#include <zephyr/drivers/pwm.h>

#include "paddle.h"

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

static const nrfx_timer_t timer = NRFX_TIMER_INSTANCE(2);
static const nrfx_gpiote_t gpiote = NRFX_GPIOTE_INSTANCE(0);

static const struct gpio_dt_spec joy_p0_chg = GPIO_DT_SPEC_GET(DT_ALIAS(joy_p0_chg), gpios);

typedef struct {
    uint8_t gpiote_p0_chg; // GPIOTE channel for POT0 charging
    uint8_t gpiote_p1_chg; // GPIOTE channel for POT1 charging

    nrf_ppi_channel_t ppi_start_cycle; // PPI channel to start the timer cycle
    nrf_ppi_channel_t ppi_p0_charge;   // PPI channel for POT0 charging
    nrf_ppi_channel_t ppi_p1_charge;   // PPI channel for POT1 charging
    nrf_ppi_channel_t ppi_end_cycle;   // PPI channel to end the timer cycle

    // Simple averaging filter state
    struct {
        uint8_t buf[10];
        uint8_t pos;
        uint16_t sum;
        uint32_t time;
    } filter;

    // Measured period in milliseconds
    atomic_t period;

    atomic_t cc0_value;
    atomic_t cc1_value;

} paddle_drv_t;

paddle_drv_t g_paddle_drv;

static void comparator_handler(nrf_comp_event_t event)
{
    paddle_drv_t *drv = &g_paddle_drv;

    uint32_t now = k_uptime_get_32();

    if (drv->filter.time > 0) {
        uint32_t diff = now - drv->filter.time;

        // Calculate moving average
        drv->filter.sum -= drv->filter.buf[drv->filter.pos];
        drv->filter.buf[drv->filter.pos] = diff;
        drv->filter.sum += drv->filter.buf[drv->filter.pos];
        drv->filter.pos = (drv->filter.pos + 1) % ARRAY_SIZE(drv->filter.buf);
    }

    atomic_set(&drv->period, (drv->filter.sum / ARRAY_SIZE(drv->filter.buf)));

    drv->filter.time = now;
}

static void timer_handler(nrf_timer_event_t event_type, void *p_context)
{
    paddle_drv_t *drv = &g_paddle_drv;

    // Since TIMER CC registers are not double buffered, we need to
    // update them in the timer interrupt handler - just after the
    // compare event has occurred.

    if (event_type == NRF_TIMER_EVENT_COMPARE0) {
        uint32_t cc0_value = atomic_get(&drv->cc0_value);
        nrfx_timer_compare(&timer, NRF_TIMER_CC_CHANNEL0, cc0_value, true);
    } else if (event_type == NRF_TIMER_EVENT_COMPARE1) {
        uint32_t cc1_value = atomic_get(&drv->cc1_value);
        nrfx_timer_compare(&timer, NRF_TIMER_CC_CHANNEL1, cc1_value, true);
    }
}

void paddle_init(void)
{
    paddle_drv_t *drv = &g_paddle_drv;

    nrfx_gpiote_pin_t pin_p0_chg = NRF_GPIO_PIN_MAP(0, 15); // Pin for POT0 charging
    nrfx_gpiote_pin_t pin_p1_chg = NRF_GPIO_PIN_MAP(0, 19); // Pin for POT1 charging

    // Get pin/port from joy_p0_chg
    gpio_pin_configure_dt(&joy_p0_chg, GPIO_OUTPUT_LOW);

    // -------------------------------------------------------------------------------
    // Initialize the analog comparator
    //
    // V+ = (Vcap + 5V) / 4 - when POT0 charging is active
    // V+ = Vcap / 2 - when POT0 charging is inactive
    // V- = 1.4V (Upper threshold) or 1.3V (Lower threshold)
    //
    // The comparator is used to monitor the POT0 voltage in order to detect
    // when the POKEY chip releases its discharge transistors,
    // indicating that the POKEY counter has been reset and starts counting.
    //
    // The comparator is automatically stopped after the UP event
    // and is started again at the end of the cycle (which is set to 17 ms).
    // -------------------------------------------------------------------------------

    nrfx_comp_config_t comp_config = NRFX_COMP_DEFAULT_CONFIG(NRF_COMP_INPUT_4);

    comp_config.reference = NRF_COMP_REF_INT_2V4;
    comp_config.main_mode = NRF_COMP_MAIN_MODE_SE;
    comp_config.threshold.th_down = NRFX_COMP_VOLTAGE_THRESHOLD_TO_INT(1.3, 2.4);
    comp_config.threshold.th_up = NRFX_COMP_VOLTAGE_THRESHOLD_TO_INT(1.4, 2.4);
    comp_config.speed_mode = NRF_COMP_SP_MODE_HIGH;
    comp_config.hyst = NRF_COMP_HYST_NO_HYST;

    nrfx_err_t err;

    err = nrfx_comp_init(&comp_config, comparator_handler);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_comp_init error: %08x", err);
        return;
    }

    // Connect COMP_IRQ to nrfx_comp_irq_handler - TODO: do we need this??
    IRQ_CONNECT(COMP_LPCOMP_IRQn, IRQ_PRIO_LOWEST, nrfx_isr, nrfx_comp_irq_handler, 0);

    nrfx_comp_start(NRF_COMP_INT_UP_MASK, NRFX_COMP_SHORT_STOP_AFTER_UP_EVT);

    // -------------------------------------------------------------------------------
    // Initialize the timer
    //
    // The timer is used to precisely control the charging outputs
    // of the POT0 and POT1 capacitors. It is started a few microseconds after
    // we detect that the POKEY chip has released its discharge transistors.
    //
    // Two compare channels are used to control the time when we
    // activate the MOSFETs that rapidly charge the POT0 and POT1 capacitors.
    //
    // Channel 0 - triggers POT0 charging
    // Channel 1 - triggers POT1 charging
    // Channel 2 - starts comparator
    // Channel 3 - resets the timer
    // -------------------------------------------------------------------------------

    nrfx_timer_config_t timer_config = NRFX_TIMER_DEFAULT_CONFIG(NRFX_MHZ_TO_HZ(1));
    timer_config.mode = NRF_TIMER_MODE_TIMER;
    timer_config.bit_width = NRF_TIMER_BIT_WIDTH_16;

    err = nrfx_timer_init(&timer, &timer_config, timer_handler);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_timer_init error: %08x", err);
        return;
    }

    IRQ_CONNECT(TIMER2_IRQn, IRQ_PRIO_LOWEST, nrfx_isr, nrfx_timer_2_irq_handler, 0)

    uint32_t initial_cc_value = 16000; // => 228

    atomic_set(&drv->cc0_value, initial_cc_value);
    atomic_set(&drv->cc1_value, initial_cc_value);

    nrfx_timer_compare(&timer, NRF_TIMER_CC_CHANNEL0, initial_cc_value, true);
    nrfx_timer_compare(&timer, NRF_TIMER_CC_CHANNEL1, initial_cc_value, true);

    nrfx_timer_compare(&timer, NRF_TIMER_CC_CHANNEL2, 17000, false); // 17ms

    nrfx_timer_extended_compare(&timer, NRF_TIMER_CC_CHANNEL3, 25000,
                                NRF_TIMER_SHORT_COMPARE3_CLEAR_MASK, false);

    nrfx_timer_enable(&timer);

    // -------------------------------------------------------------------------------
    // Outputs for capacitor charging
    //
    // The POT0 and POT1 charging outputs are controlled by GPIOTE,
    // allowing us to activate them via PPI channels.
    // -------------------------------------------------------------------------------

    // POT0 charging

    err = nrfx_gpiote_channel_alloc(&gpiote, &drv->gpiote_p0_chg);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_gpiote_channel_alloc error: %08x", err);
        return;
    }

    nrfx_gpiote_output_config_t out_config = NRFX_GPIOTE_DEFAULT_OUTPUT_CONFIG;

    nrfx_gpiote_task_config_t task_config = {
        .task_ch = drv->gpiote_p0_chg,
        .polarity = GPIOTE_CONFIG_POLARITY_LoToHi,
        .init_val = NRF_GPIOTE_INITIAL_VALUE_LOW,
    };

    err = nrfx_gpiote_output_configure(&gpiote, pin_p0_chg, &out_config, &task_config);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_gpiote_out_init error: %08x", err);
        return;
    }

    nrfx_gpiote_out_task_enable(&gpiote, pin_p0_chg);

    // POT1 charging

    err = nrfx_gpiote_channel_alloc(&gpiote, &drv->gpiote_p1_chg);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_gpiote_channel_alloc error: %08x", err);
        return;
    }

    nrfx_gpiote_output_config_t out_config2 = NRFX_GPIOTE_DEFAULT_OUTPUT_CONFIG;

    nrfx_gpiote_task_config_t task_config2 = {
        .task_ch = drv->gpiote_p1_chg,
        .polarity = GPIOTE_CONFIG_POLARITY_LoToHi,
        .init_val = NRF_GPIOTE_INITIAL_VALUE_LOW,
    };

    err = nrfx_gpiote_output_configure(&gpiote, pin_p1_chg, &out_config2, &task_config2);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_gpiote_out_init error: %08x", err);
        return;
    }

    nrfx_gpiote_out_task_enable(&gpiote, pin_p1_chg);

    // -------------------------------------------------------------------------------
    // PPI channels
    //
    // PPI channels connect the analog comparator, timer, and GPIOTE peripherals.
    //
    // PPI usage:
    // 1. COMP_UP event -> TIMER_CLEAR task & GPIOTE_CLR task (disable POT0 charging)
    // 2. TIMER_COMPARE0 event -> GPIOTE_SET task (enable POT0 charging)
    // 3. TIMER_COMPARE1 event -> GPIOTE_SET task (enable POT1 charging)
    // 4. TIMER_COMPARE3 event -> COMP_START task (restart comparator)
    // -------------------------------------------------------------------------------

    uint32_t eep;
    uint32_t tep;

    // --------------------------------------------------------------------
    // ppi_start_cycle
    //
    // Comparator UP event:
    //   -> clears the timer
    //   -> disables the POT0 charging output

    err = nrfx_ppi_channel_alloc(&drv->ppi_start_cycle);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_ppi_channel_alloc error: %08x", err);
        return;
    }

    eep = nrfx_comp_event_address_get(NRF_COMP_EVENT_UP);
    tep = nrfx_timer_task_address_get(&timer, NRF_TIMER_TASK_CLEAR);

    err = nrfx_ppi_channel_assign(drv->ppi_start_cycle, eep, tep);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_ppi_channel_assign error: %08x", err);
        return;
    }

    tep = nrfx_gpiote_clr_task_address_get(&gpiote, pin_p0_chg);
    err = nrfx_ppi_channel_fork_assign(drv->ppi_start_cycle, tep);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_ppi_channel_fork_assign error: %08x", err);
        return;
    }

    err = nrfx_ppi_channel_enable(drv->ppi_start_cycle);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("Failed enabling ppi channel: %08x", err);
        return;
    }

    // --------------------------------------------------------------------
    // ppi_p0_charge
    //
    // Timer COMPARE0 event:
    //   -> enables the POT0 charging output

    err = nrfx_ppi_channel_alloc(&drv->ppi_p0_charge);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_ppi_channel_alloc error: %08x", err);
        return;
    }

    eep = nrfx_timer_event_address_get(&timer, NRF_TIMER_EVENT_COMPARE0);
    tep = nrfx_gpiote_set_task_address_get(&gpiote, pin_p0_chg);

    err = nrfx_ppi_channel_assign(drv->ppi_p0_charge, eep, tep);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_ppi_channel_assign error: %08x", err);
        return;
    }

    err = nrfx_ppi_channel_enable(drv->ppi_p0_charge);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("Failed enabling ppi channel: %08x", err);
        return;
    }

    // --------------------------------------------------------------------
    // ppi_p1_charge
    //
    // Timer COMPARE1 event:
    //   -> enables the POT1 charging output

    err = nrfx_ppi_channel_alloc(&drv->ppi_p1_charge);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_ppi_channel_alloc error: %08x", err);
        return;
    }

    eep = nrfx_timer_event_address_get(&timer, NRF_TIMER_EVENT_COMPARE1);
    tep = nrfx_gpiote_set_task_address_get(&gpiote, pin_p1_chg);

    err = nrfx_ppi_channel_assign(drv->ppi_p1_charge, eep, tep);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_ppi_channel_assign error: %08x", err);
        return;
    }

    err = nrfx_ppi_channel_enable(drv->ppi_p1_charge);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("Failed enabling ppi channel: %08x", err);
        return;
    }

    // --------------------------------------------------------------------
    // ppi_end_cycle
    //
    // Timer COMPARE2 event:
    //   -> restarts the comparator (which was automatically stopped on UP event)
    //   -> disables the POT1 charging output

    err = nrfx_ppi_channel_alloc(&drv->ppi_end_cycle);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_ppi_channel_alloc error: %08x", err);
        return;
    }

    eep = nrfx_timer_event_address_get(&timer, NRF_TIMER_EVENT_COMPARE2);
    tep = nrfx_comp_task_address_get(NRF_COMP_TASK_START);

    err = nrfx_ppi_channel_assign(drv->ppi_end_cycle, eep, tep);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_ppi_channel_assign error: %08x", err);
        return;
    }

    tep = nrfx_gpiote_clr_task_address_get(&gpiote, pin_p1_chg);
    err = nrfx_ppi_channel_fork_assign(drv->ppi_end_cycle, tep);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("nrfx_ppi_channel_fork_assign error: %08x", err);
        return;
    }

    err = nrfx_ppi_channel_enable(drv->ppi_end_cycle);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("Failed enabling ppi channel: %08x", err);
        return;
    }

    LOG_INF("Paddle outputs initialized");
}

void paddle_set(int pot_idx, int value)
{
    paddle_drv_t *drv = &g_paddle_drv;

    if (value < 1) {
        value = 1;
    } else if (value > 228) {
        value = 228;
    }

    if (pot_idx == 0) {
        atomic_set(&drv->cc0_value, 64 * value);
    } else if (pot_idx == 1) {
        atomic_set(&drv->cc1_value, 64 * value);
    }
}
