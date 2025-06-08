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

#include <zephyr/bluetooth/addr.h>

#include "report_map.h"

// Max connected devices (slots)
#define BTHID_MAX_DEVICES 1

#define BTHID_DEFAULT_SLOT 0

typedef struct bthid_device bthid_device_t;

// Note to `dev` argument in the callbacks:
// Callback must not save the pointer to `dev` for later use.
// It's ensured that the pointer is valid only during the callback execution.

typedef struct {
    // A device found during scanning
    void (*device_found)(const bt_addr_le_t *addr, int8_t rssi, const char *name);

    void (*conn_opened)(bthid_device_t *dev);
    void (*conn_secured)(bthid_device_t *dev);
    void (*conn_closed)(bthid_device_t *dev);
    void (*conn_error)(bthid_device_t *dev);

    void (*discovery_completed)(bthid_device_t *dev);
    void (*discovery_error)(bthid_device_t *dev);

    void (*report_subscribe_completed)(bthid_device_t *dev);
    void (*report_subscribe_error)(bthid_device_t *dev);
    void (*report_received)(bthid_device_t *dev, const uint8_t *data, size_t length);
} bthid_callbacks_t;

// Initializes the bthid stack
// Callback structure needs to be valid for the lifetime of the bthid stack
int bthid_init(const bthid_callbacks_t *callbacks);

// Deletes all stored bonds from the persistent storage
int bthid_bonds_delete(void);

// Starts scanning for devices that advertise as gamepads
int bthid_scan_start(void);

// Stops scanning for devices
int bthid_scan_stop(void);

// Initiates a connection to a device at the specified slot
int bthid_connect(int slot, const bt_addr_le_t *addr);

// Disconnects from a device at the specified slot
// If the slot is not connected, this function does nothing
void bthid_disconnect(int slot);

// Disconnects the device and removes it from the list of connected devices
// After returning from this function the dev structure no longer represents a valid device
void bthid_device_disconnect(bthid_device_t *dev);

// Checks if the device is connected and the connection is secured
bool bthid_device_is_secure(bthid_device_t *dev);

// Starts discovery of the HID service on the device
// This function discovers the HID service and its characteristics and finally reads the report map
int bthid_device_discover(bthid_device_t *dev);

// Subscribes to HID report notifications for the device
int bthid_device_subscribe(bthid_device_t *dev);

// Get reference to the report map of the device
hrm_t *bthid_device_get_report_map(bthid_device_t *dev);

// Gets device's Bluetooth address
void bthid_device_get_addr(bthid_device_t *dev, bt_addr_le_t *addr);
