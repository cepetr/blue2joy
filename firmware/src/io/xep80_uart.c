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
#include <zephyr/irq.h>

#include <nrfx_uart.h>
#include <nrfx_uarte.h>
#include <nrfx_pwm.h>
#include <hal/nrf_gpio.h>

#include "xep80_uart.h"

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

#define XEP_UART_TX_PIN NRF_GPIO_PIN_MAP(1, 15)
#define XEP_UART_RX_PIN NRF_GPIO_PIN_MAP(1, 13)

#define UART_BAUDRATE_BAUDRATE_Baud15625 (0x00400000UL)

typedef struct {
    uint16_t data[16];
    size_t tail;
    size_t head;
} tx_queue_t;

typedef struct {
    // UART instance for RX
    nrfx_uarte_t rx_uart;
    // PWM instance for TX
    nrfx_pwm_t tx_pwm;

    // Receive buffer
    uint8_t rx_buf[1];

    // Transmit queue
    tx_queue_t tx_queue;

    nrf_pwm_values_common_t tx_seq_vals[12]; // 1 start + 9 data + 2 stop
    nrf_pwm_sequence_t tx_seq;

    // Set if transmission is currently in progress
    bool tx_pending;

    // Next received byte has parity error
    bool parity_error;

    xep80_uart_rx_callback_t callback;
    void *callback_context;
} xep80_uart_t;

static xep80_uart_t g_xep80_uart;

// Forward declarations
static void xep80_rx_uart_event_handler(nrfx_uarte_event_t const *event, void *context);
static void xep80_tx_pwm_event_handler(nrfx_pwm_evt_type_t event_type, void *context);
static void xep80_uart_restart_rx(void);

int xep80_uart_init(xep80_uart_rx_callback_t callback, void *callback_context)
{
    xep80_uart_t *drv = &g_xep80_uart;

    memset(drv, 0, sizeof(xep80_uart_t));
    drv->callback = callback;
    drv->callback_context = callback_context;

    // XEP80 uses 9-bit UART communication, but the nRF52 UART peripheral does not
    // support 9-bit mode. Fortunatelly we can work around this limitation as follows:
    //
    // During reception, we use the parity bit to emulate the ninth bit. The ninth bit
    // is calculated from the parity of the first 8 bits and the parity error flag.
    //
    // During transmission, we cannot use UART at all since the nRF52 supports
    // only even parity so there's no way to set the parity bit to the desired value.
    // Instead, we use PWM peripheral and emulate the UART protocol with it.

    drv->rx_uart = (const nrfx_uarte_t)NRFX_UARTE_INSTANCE(0);

    nrfx_uarte_config_t rx_config = NRFX_UARTE_DEFAULT_CONFIG(NRF_UART_PSEL_DISCONNECTED, // TXD
                                                              XEP_UART_RX_PIN);           // RXD

    rx_config.baudrate = UART_BAUDRATE_BAUDRATE_Baud15625;
    rx_config.config.parity = NRF_UARTE_PARITY_INCLUDED;
    rx_config.config.stop = NRF_UARTE_STOP_ONE;

    if (nrfx_uarte_init(&drv->rx_uart, &rx_config, xep80_rx_uart_event_handler) != NRFX_SUCCESS) {
        LOG_ERR("UART init failed");
        return -EIO;
    }

    IRQ_CONNECT(NRFX_IRQ_NUMBER_GET(NRF_UARTE_INST_GET(0)), IRQ_PRIO_LOWEST,
                NRFX_UARTE_INST_HANDLER_GET(0), 0, 0);

    // This call is needed to avoid automatically stopping reception on error
    nrfx_uarte_rx_enable(&drv->rx_uart, 0);

    // Start reception
    xep80_uart_restart_rx();

    drv->tx_pwm = (const nrfx_pwm_t)NRFX_PWM_INSTANCE(0);

    nrfx_pwm_config_t cfg =
        NRFX_PWM_DEFAULT_CONFIG(XEP_UART_TX_PIN, NRF_PWM_PIN_NOT_CONNECTED,
                                NRF_PWM_PIN_NOT_CONNECTED, NRF_PWM_PIN_NOT_CONNECTED);

    cfg.base_clock = NRF_PWM_CLK_16MHz;
    cfg.top_value = 16000000 / 15625; // 1024
    cfg.count_mode = NRF_PWM_MODE_UP;
    cfg.load_mode = NRF_PWM_LOAD_COMMON;
    cfg.step_mode = NRF_PWM_STEP_AUTO;

    if (nrfx_pwm_init(&drv->tx_pwm, &cfg, xep80_tx_pwm_event_handler, drv) != NRFX_SUCCESS) {
        LOG_ERR("PWM init failed");
        nrfx_uarte_uninit(&drv->rx_uart);
        return -EIO;
    }

    IRQ_CONNECT(NRFX_IRQ_NUMBER_GET(NRF_PWM_INST_GET(0)), IRQ_PRIO_LOWEST,
                NRFX_PWM_INST_HANDLER_GET(0), 0, 0);

    drv->tx_seq.values.p_common = drv->tx_seq_vals;
    drv->tx_seq.length = ARRAY_SIZE(drv->tx_seq_vals);
    drv->tx_seq.repeats = 0;
    drv->tx_seq.end_delay = 0;

    nrf_gpio_pin_set(XEP_UART_TX_PIN);

    return 0;
}

void xep80_uart_set_txd(bool high)
{
    if (high) {
        nrf_gpio_pin_set(XEP_UART_TX_PIN);
    } else {
        nrf_gpio_pin_clear(XEP_UART_TX_PIN);
    }
}

void xep80_uart_uninit(void)
{
    xep80_uart_t *drv = &g_xep80_uart;

    nrfx_uarte_uninit(&drv->rx_uart);
    nrfx_pwm_uninit(&drv->tx_pwm);

    // Return TX pin to GPIO so it can be used by regular joystick output logic
    nrf_gpio_cfg_output(XEP_UART_TX_PIN);
    nrf_gpio_pin_set(XEP_UART_TX_PIN);
}

static bool tx_queue_write(tx_queue_t *q, uint16_t word)
{
    size_t next_tail = (q->tail + 1) % ARRAY_SIZE(q->data);

    if (next_tail == q->head) {
        // Queue is full
        return false;
    }

    q->data[q->tail] = word;
    q->tail = next_tail;

    return true;
}

static bool tx_queue_read(tx_queue_t *q, uint16_t *word)
{
    if (q->head == q->tail) {
        // Queue is empty
        return false;
    }

    *word = q->data[q->head];
    q->head = (q->head + 1) % ARRAY_SIZE(q->data);

    return true;
}

static void xep80_uart_restart_tx(xep80_uart_t *drv);

static void xep80_tx_pwm_event_handler(nrfx_pwm_evt_type_t event_type, void *context)
{
    xep80_uart_t *drv = (xep80_uart_t *)context;

    if (event_type == NRFX_PWM_EVT_STOPPED) {
        drv->tx_pending = false;
        // Start next transmission
        xep80_uart_restart_tx(drv);
    }
}

static inline uint16_t duty_for_level(bool high)
{
    return high ? 0 : 1024;
}

static void xep80_uart_restart_tx(xep80_uart_t *drv)
{
    uint16_t word;

    if (!tx_queue_read(&drv->tx_queue, &word)) {
        // No more data to send
        return;
    }

    nrf_pwm_values_common_t *vals = drv->tx_seq_vals;

    // Encode 9-bit words into a pwm sequence according to the UART protocol:
    //
    // Start bit (1) + Data bits (8) + 9th bit (1) + Stop bits (2) = 12 bits

    vals[0] = duty_for_level(false); // Start bit

    for (int i = 0; i < 9; i++) {
        vals[i + 1] = duty_for_level((word & 0x1) != 0);
        word >>= 1;
    }

    vals[10] = duty_for_level(true); // Stop bit 1
    vals[11] = duty_for_level(true); // Stop bit 2

    drv->tx_pending = true;

    nrfx_pwm_simple_playback(&drv->tx_pwm, &drv->tx_seq, 1, NRFX_PWM_FLAG_STOP);
}

int xep80_uart_send(uint16_t word)
{
    xep80_uart_t *drv = &g_xep80_uart;

    unsigned int key = irq_lock();

    if (!tx_queue_write(&drv->tx_queue, word)) {
        // Queue is full, drop the word
        irq_unlock(key);
        return -ENOMEM;
    }

    if (!drv->tx_pending) {
        xep80_uart_restart_tx(drv);
    }

    irq_unlock(key);

    return 0;
}

static void xep80_uart_restart_rx(void)
{
    xep80_uart_t *drv = &g_xep80_uart;

    if (nrfx_uarte_rx(&drv->rx_uart, drv->rx_buf, sizeof(drv->rx_buf)) != NRFX_SUCCESS) {
        LOG_ERR("UART RX start failed");
    }
}

static void xep80_rx_uart_event_handler(nrfx_uarte_event_t const *event, void *context)
{
    xep80_uart_t *drv = &g_xep80_uart;

    if (event->type == NRFX_UARTE_EVT_RX_DONE) {
        // Read received byte
        uint32_t word = event->data.rx.p_buffer[0];
        // Calculate parity of the first 8 bits (sum of 1 bits modulo 2)
        bool parity = __builtin_parity(word);
        // Calculate ninth bit (based on parity error flag)
        bool ninth_bit = drv->parity_error ? !parity : parity;
        // Clear parity error flag for next reception
        drv->parity_error = false;

        if (ninth_bit) {
            word |= 0x100;
        }

        // Restart reception (we have just one byte buffer)
        xep80_uart_restart_rx();

        if (drv->callback) {
            drv->callback(drv->callback_context, word);
        }

    } else if (event->type == NRFX_UARTE_EVT_ERROR) {
        // Remember that next received byte has parity error
        drv->parity_error = (event->data.error.error_mask & NRF_UARTE_ERROR_PARITY_MASK) != 0;
    }
}
