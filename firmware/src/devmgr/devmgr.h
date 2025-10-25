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
 * along with this program. If not, see <http://wwwEINVAL.gnu.org/licenses/>.
 */

#pragma once

#include <stdbool.h>
#include <stdint.h>

#include <zephyr/bluetooth/addr.h>

#define DEVMGR_MAX_CONFIG_ENTRIES  4
#define DEVMGR_MAX_ADVLIST_ENTRIES 4

typedef enum {
    // Automatically starts scanning and connects to
    // known devices when they are advertising
    DEVMGR_MODE_AUTO = 0,
    // Automatically starts scanning and pairs with
    // the first advertising device
    DEVMGR_MODE_PAIRING = 1,
    // Manual mode - scanning and connection must be
    // initiated by the BTJ protocol from the configuration app
    DEVMGR_MODE_MANUAL = 2,
} devmgr_mode_t;

typedef struct {
    // Scanning is in progress
    bool scanning;
    // Current device manager mode
    devmgr_mode_t mode;
} devmgr_state_t;

typedef enum {
    DEVMGR_CONN_CLOSED = 0,
    DEVMGR_CONN_ERROR = 1,
    DEVMGR_CONN_CONNECTING = 2,
    DEVMGR_CONN_CONNECTED = 3,
    DEVMGR_CONN_READY = 4,
} devmgr_conn_state_t;

typedef struct {
    devmgr_conn_state_t conn_state;
    int8_t rssi;
    char name[30];
} devmgr_device_state_t;

typedef struct {
    // io mapper profile
    uint8_t profile;
} devmgr_device_config_t;

typedef struct {
    bt_addr_le_t addr;
    int8_t rssi;
    char name[30 + 1];
} devmgr_adv_entry_t;

// Initializes the device manager
int devmgr_init(void);

void devmgr_set_mode(devmgr_mode_t mode, bool restart);

void devmgr_get_state(devmgr_state_t *state);

// Returns true if any device is connecting
bool devmgr_is_connecting(void);

// Returns true if any device is ready
bool devmgr_is_ready(void);

// Start scanning for devices
int devmgr_start_scanning(void);

// Stop scanning for devices
void devmgr_stop_scanning(void);

// Retrieves list of all advertising devices
// Returns the number of devices written to addrs array (up to DEVMGR_MAX_ADVLIST_ENTRIES)
int devmgr_get_advertising_devices(devmgr_adv_entry_t *list);

// Retrieves advertising device state
int devmgr_get_adv_device(const bt_addr_le_t *addr, devmgr_adv_entry_t *entry);

// Retrieves list of all known devices
// Returns the number of devices written to addrs array (up to DEVMGR_MAX_CONFIG_ENTRIES)
int devmgr_get_devices(bt_addr_le_t *addrs);

// Connects to a device with given MAC address
// Returns 0 on success, -ENOENT if device not advertising
int devmgr_connect(const bt_addr_le_t *addr);

// Ensures device entry exists, creates if not
// Return 0 on success, -ENOMEM if no space
int devmgr_create_device(const bt_addr_le_t *addr, bool save);

// Deletes device from
// Returns 0 on success, -ENOENT if device not found
int devmgr_delete_device(const bt_addr_le_t *addr);

// Gets state of a device with given MAC address
// Returns 0 on success, -ENOENT if device not found
int devmgr_get_device_state(const bt_addr_le_t *addr, devmgr_device_state_t *state);

// Gets configuration of a device with given MAC address
// Returns 0 on success, -ENOENT if device not found
int devmgr_get_device_config(const bt_addr_le_t *addr, devmgr_device_config_t *config);

// Sets configuration of a device with given MAC address
// Returns 0 on success, -ENOENT if device not found
int devmgr_set_device_config(const bt_addr_le_t *addr, const devmgr_device_config_t *config,
                             bool save);
