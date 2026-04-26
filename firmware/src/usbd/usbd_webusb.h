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

#include <zephyr/usb/usbd.h>

// Gets WebUSB class data for registration with USB device stack
// Returns pointer to USB device class data structure
struct usbd_class_data *btj_webusb_get_class_data(void);

// Sends data via WebUSB
int btj_webusb_send(const uint8_t *data, size_t len);

// Returns true when the WebUSB interface is configured by the host.
bool btj_webusb_is_enabled(void);

// Callback is invoked in the context of usbd thread
typedef void (*webusb_rx_callback_t)(void *context, const uint8_t *data, size_t len);

// Callback is invoked in the context of usbd thread when the host configures or disables WebUSB.
typedef void (*webusb_status_callback_t)(void *context, bool enabled);

// Registers callback for received WebUSB data
// Returns 0 on success, negative errno on failure
int btj_webusb_register_rx_callback(webusb_rx_callback_t cb, void *context);

// Registers callback for WebUSB status changes.
// The callback is invoked immediately with the current state.
int btj_webusb_register_status_callback(webusb_status_callback_t cb, void *context);
