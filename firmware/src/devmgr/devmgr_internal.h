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

#include <event/event.h>

#include "devmgr.h"

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

#define DEVMGR_MAX_EVENT_LISTENERS 2

typedef struct {
    bt_addr_le_t addr;
    devmgr_device_state_t state;
    devmgr_device_config_t config;
} devmgr_entry_t;

typedef struct {
    struct k_work_delayable save_work;
    struct k_mutex mutex;

    struct {
        devmgr_mode_t mode;

        // Known devices
        struct {
            size_t count;
            devmgr_entry_t entry[DEVMGR_MAX_CONFIG_ENTRIES];
        } dev;

        bool scanning;

        // Currently advertising devices
        struct {
            size_t count;
            devmgr_adv_entry_t entry[DEVMGR_MAX_ADVLIST_ENTRIES];
        } adv;

    } sync;
} devmgr_t;

// Global device manager instance
extern devmgr_t g_devmgr;

// Notifies all registered listeners about an event
void devmgr_notify(event_subject_t subject, const bt_addr_le_t *addr, event_action_t action);

// Adds or updates an advertising device in the list
void devmgr_add_to_adv_list(const bt_addr_le_t *addr, int8_t rssi, const char *name);

// Clears the advertising device list
void devmgr_clear_adv_list(void);

// Find device entry by address
// Returns NULL if not found
// Must be called with devmgr->mutex locked
devmgr_entry_t *devmgr_find_entry(const bt_addr_le_t *addr);

// Finds a device entry by address
// Returns NULL if not found
// Must be called with devmgr->mutex locked
devmgr_entry_t *devmgr_ensure_entry(const bt_addr_le_t *addr, bool save);
