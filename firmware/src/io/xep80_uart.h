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

#pragma once

#include <stdint.h>
#include <stdbool.h>

// Callback function type for received data (9-bit word)
// Is called from interrupt context
typedef void (*xep80_uart_rx_callback_t)(void *context, uint16_t data);

// Initializes XEP80 UART communication
// (9-bit UART emulation, 15625 baud, D0=RX, D1=TX)
int xep80_uart_init(xep80_uart_rx_callback_t callback, void *callback_context);

// Deinitializes XEP80 UART communication on D0/D1 pins
void xep80_uart_uninit(void);

// Sends 9-bit data word over XEP80 UART.
// The function is non-blocking.
int xep80_uart_send(const uint16_t data);

// Sets the level of the UART TXD line when not transmitting
void xep80_uart_set_txd(bool high);
