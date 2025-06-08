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
#include <assert.h>

#include <mapper/mapper.h>
#include <bthid/bthid.h>
#include <event/event_bus.h>

#include "devmgr_internal.h"
#include "settings.h"

// Global device manager instance
devmgr_t g_devmgr;

// forward declarations
static const bthid_callbacks_t bthid_callbacks;

int devmgr_init(void)
{
    devmgr_t *devmgr = &g_devmgr;

    memset(devmgr, 0, sizeof(devmgr_t));

    int err;

    err = k_mutex_init(&devmgr->mutex);
    if (err) {
        return err;
    }

    k_work_init_delayable(&devmgr->save_work, devmgr_save_settings);

    err = bthid_init(&bthid_callbacks);
    if (err) {
        return err;
    }

    return 0;
}

void devmgr_notify(event_subject_t subject, const bt_addr_le_t *addr, event_action_t action)
{
    event_t ev = {
        .subject = subject,
        .action = action,
    };

    if (addr != NULL) {
        bt_addr_le_copy(&ev.addr, addr);
    }

    event_bus_publish(&ev);
}

void devmgr_set_mode(devmgr_mode_t mode, bool restart)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);
    devmgr->sync.mode = mode;
    devmgr_notify(EV_SUBJECT_SYS_STATE, NULL, EV_ACTION_UPDATE);
    k_mutex_unlock(&devmgr->mutex);

    if (restart) {
        bthid_disconnect(BTHID_DEFAULT_SLOT);

        if (mode != DEVMGR_MODE_MANUAL) {
            int err = devmgr_start_scanning();
            (void)err;
        }
    }
}

void devmgr_get_state(devmgr_state_t *state)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);
    state->mode = devmgr->sync.mode;
    state->scanning = devmgr->sync.scanning;
    k_mutex_unlock(&devmgr->mutex);
}

int devmgr_start_scanning(void)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);
    bool scanning = devmgr->sync.scanning;
    devmgr_clear_adv_list();
    k_mutex_unlock(&devmgr->mutex);

    int err = 0;

    if (!scanning) {
        err = bthid_scan_start();

        k_mutex_lock(&devmgr->mutex, K_FOREVER);
        devmgr->sync.scanning = (err == 0);
        devmgr_notify(EV_SUBJECT_SYS_STATE, NULL, EV_ACTION_UPDATE);
        k_mutex_unlock(&devmgr->mutex);
    }

    return err;
}

void devmgr_stop_scanning(void)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);
    bool scanning = devmgr->sync.scanning;
    k_mutex_unlock(&devmgr->mutex);

    if (scanning) {
        bthid_scan_stop();

        k_mutex_lock(&devmgr->mutex, K_FOREVER);
        devmgr->sync.scanning = false;
        devmgr_notify(EV_SUBJECT_SYS_STATE, NULL, EV_ACTION_UPDATE);
        k_mutex_unlock(&devmgr->mutex);
    }
}

int devmgr_connect(const bt_addr_le_t *addr)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);
    bool scanning = devmgr->sync.scanning;
    k_mutex_unlock(&devmgr->mutex);

    if (scanning) {
        bthid_scan_stop();

        k_mutex_lock(&devmgr->mutex, K_FOREVER);
        devmgr->sync.scanning = false;
        devmgr_notify(EV_SUBJECT_SYS_STATE, NULL, EV_ACTION_UPDATE);
        k_mutex_unlock(&devmgr->mutex);
    }

    int err = bthid_connect(BTHID_DEFAULT_SLOT, addr);
    if (!err) {
        // Create device entry if it doesn't exist
        k_mutex_lock(&devmgr->mutex, K_FOREVER);
        devmgr_entry_t *entry = devmgr_ensure_entry(addr, true);
        entry->state.conn_state = DEVMGR_CONN_CONNECTING;
        devmgr_notify(EV_SUBJECT_DEV_LIST, &entry->addr, EV_ACTION_UPDATE);
        k_mutex_unlock(&devmgr->mutex);
    } else {
        if (scanning) {
            // restart scanning
            devmgr_start_scanning();
        }
    }

    return err;
}

static void devmgr_update_device_state(bthid_device_t *dev, devmgr_conn_state_t state)
{
    devmgr_t *devmgr = &g_devmgr;

    bt_addr_le_t addr;
    bthid_device_get_addr(dev, &addr);

    k_mutex_lock(&devmgr->mutex, K_FOREVER);

    bool new = (state == DEVMGR_CONN_CONNECTING) || (state == DEVMGR_CONN_CONNECTED);

    devmgr_entry_t *entry = new ? devmgr_ensure_entry(&addr, false) : devmgr_find_entry(&addr);

    if (entry != NULL) {
        entry->state.conn_state = state;
        devmgr_notify(EV_SUBJECT_DEV_LIST, &addr, EV_ACTION_UPDATE);
    }

    if (state == DEVMGR_CONN_ERROR) {
        devmgr_notify(EV_SUBJECT_CONN_ERROR, &addr, EV_ACTION_UPDATE);
    }

    k_mutex_unlock(&devmgr->mutex);
}

// ------------------------ bthid callbacks -----------------------

static void restart(void)
{
    devmgr_t *devmgr = &g_devmgr;

    if (devmgr->sync.mode != DEVMGR_MODE_MANUAL) {
        int err = devmgr_start_scanning();
        (void)err;
    }
}

// A device found during scanning
static void on_device_found(const bt_addr_le_t *addr, int8_t rssi, const char *name)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);
    bool known = devmgr_find_entry(addr) != NULL;
    devmgr_mode_t mode = devmgr->sync.mode;
    k_mutex_unlock(&devmgr->mutex);

    if (mode == DEVMGR_MODE_MANUAL) {
        // add device to the scan list
        devmgr_add_to_adv_list(addr, rssi, name);

    } else if (known || mode == DEVMGR_MODE_PAIRING) {
        int err = devmgr_connect(addr);

        if (!err) {
            k_mutex_lock(&devmgr->mutex, K_FOREVER);
            devmgr->sync.mode = DEVMGR_MODE_AUTO;
            k_mutex_unlock(&devmgr->mutex);
        } else {
            LOG_ERR("Failed to connect to device: {err = %d}", err);
        }
    }
}

// Connection with the gamepad opened
static void on_conn_opened(bthid_device_t *dev)
{
    int err = bthid_device_discover(dev);

    if (!err) {
        devmgr_update_device_state(dev, DEVMGR_CONN_CONNECTED);
    } else {
        devmgr_update_device_state(dev, DEVMGR_CONN_ERROR);
        bthid_device_disconnect(dev);
        restart();
    }
}

// Subscribe to HID report notifications.
// Two conditions must be met:
// 1. The connection must be secured
// 2. The HID service must be fully discovered
static void try_subscribe(bthid_device_t *dev)
{
    hrm_t *hrm = bthid_device_get_report_map(dev);

    if (hrm == NULL) {
        // Not discovered yet
        return;
    }

    if (!bthid_device_is_secure(dev)) {
        // Not secured yet
        return;
    }

    int err = bthid_device_subscribe(dev);
    if (err && err != -EALREADY) {
        devmgr_update_device_state(dev, DEVMGR_CONN_ERROR);
        bthid_device_disconnect(dev);
        restart();
    }

    // !@# shouldn't we update state if err == -EALREADY ?
}

// Connection secured (security level >= 2)
static void on_conn_secured(bthid_device_t *dev)
{
    try_subscribe(dev);
}

// Connection closed (controller disconnected)
static void on_conn_closed(bthid_device_t *dev)
{
    devmgr_update_device_state(dev, DEVMGR_CONN_CLOSED);
    restart();
}

// Connection disconnected due to an error
static void on_conn_error(bthid_device_t *dev)
{
    devmgr_update_device_state(dev, DEVMGR_CONN_ERROR);
    bthid_device_disconnect(dev);
    restart();
}

// HID service discovery succeeded
static void on_discovery_completed(bthid_device_t *dev)
{
    try_subscribe(dev);
}

// HID service discovery failed
static void on_discovery_error(bthid_device_t *dev)
{
    devmgr_update_device_state(dev, DEVMGR_CONN_ERROR);
    bthid_device_disconnect(dev);
    restart();
}

// HID report subscription succeeded
static void on_report_subscribe_completed(bthid_device_t *dev)
{
    devmgr_update_device_state(dev, DEVMGR_CONN_READY);
}

// HID report subscription failed
static void on_report_subscribe_error(bthid_device_t *dev)
{
    devmgr_update_device_state(dev, DEVMGR_CONN_ERROR);
    bthid_device_disconnect(dev);
    restart();
}

// HID report received
static void on_report_received(bthid_device_t *dev, const uint8_t *data, size_t length)
{
    if (data != NULL) {
        LOG_HEXDUMP_INF(data, length, "HID report");
    } else {
        LOG_ERR("HID report data is NULL");
    }

    const hrm_t *hrm = bthid_device_get_report_map(dev);

    bt_addr_le_t addr;
    bthid_device_get_addr(dev, &addr);

    devmgr_device_config_t config;
    if (devmgr_get_device_config(&addr, &config) != 0) {
        LOG_ERR("No device configuration, ignoring the report");
        return;
    }

    if (hrm != NULL) {
        if (hrm->report_count == 0) {
            // Report map is invalid
            LOG_ERR("Report map is empty, no reports to process");
        } else if (/*hrm->report_count == 1*/ true) {
            // Report map contains only one report
            mapper_process_report(config.profile, data, &hrm->reports[0]);
        } else {
            // The first byte of the report is the report ID, if
            // the report map contains multiple reports.
            uint8_t report_id = *data++;

            // Find the report in the report map
            const hrm_report_t *report = hrm_find_report(hrm, report_id);

            if (report != NULL) {
                mapper_process_report(config.profile, data, report);
            } else {
                LOG_WRN("Report with ID %d not found in report map", report_id);
            }
        }
    }
}

static const bthid_callbacks_t bthid_callbacks = {
    .device_found = on_device_found,
    .conn_opened = on_conn_opened,
    .conn_secured = on_conn_secured,
    .conn_closed = on_conn_closed,
    .conn_error = on_conn_error,
    .discovery_completed = on_discovery_completed,
    .discovery_error = on_discovery_error,
    .report_subscribe_completed = on_report_subscribe_completed,
    .report_subscribe_error = on_report_subscribe_error,
    .report_received = on_report_received,
};
