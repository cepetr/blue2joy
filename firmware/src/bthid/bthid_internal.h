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

#include <zephyr/logging/log.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>

#include "report_map.h"
#include "bthid.h"

typedef struct {
    uint16_t decl_handle;
    uint16_t value_handle;
    uint16_t ccc_handle;
    uint16_t ref_handle;
    uint8_t report_id;
    uint8_t report_type;
} report_char_t;

// HID device state
struct bthid_device {
    // Lower layer connection to the device
    struct bt_conn *conn;

    // Peer Bluetooth address
    bt_addr_le_t addr;

    // Indicates whether handles and report map are valid
    bool discovered;

    // Currently discovered report characteristic
    int report_index;

    // Handles of the HID service characteristics
    struct {
        uint16_t control_point;
        uint16_t report_map;

        // Last handle of the HID service
        uint16_t service_end;
        // Last handle of report characteristics
        uint16_t report_end;

        // Number of HID report characteristics found
        uint16_t report_count;
        // Report characteristic handles
        report_char_t report[16];
    } handles;

    // Received report map data
    uint8_t report_map_raw[512];
    // Report map data size
    size_t report_map_raw_size;
    // Parameters for reading HID report map. Must remain valid while request is in flight.
    struct bt_gatt_read_params report_map_read_params;

    // Parsed report map
    hrm_t report_map;
};

// Driver state
typedef struct {
    // List of connected devices
    bthid_device_t devices[BTHID_MAX_DEVICES];
    // Mutex for synchronizing access to the device list
    struct k_mutex mutex;
    // Indicates whether mutex/callback state is initialized
    bool initialized;
    // High-level callbacks for bthid events
    const bthid_callbacks_t *cb;
} bthid_drv_t;

// Global HID driver instance
extern bthid_drv_t bthid;

// Initialize pairing/bonding state machine
int bthid_bonds_init(void);

// Finds a device structure by its connection while caller holds bthid.mutex
bthid_device_t *bthid_device_find_locked(struct bt_conn *conn);

// Finds a device structure by its connection
bthid_device_t *bthid_device_find(struct bt_conn *conn);

// Returns a referenced connection for the device, or NULL if disconnected
struct bt_conn *bthid_device_conn_ref(bthid_device_t *dev);
