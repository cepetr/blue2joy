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

#include "devmgr_internal.h"

int devmgr_get_devices(bt_addr_le_t *addrs)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);
    size_t count = devmgr->sync.dev.count;
    for (size_t i = 0; i < count; i++) {
        bt_addr_le_copy(&addrs[i], &devmgr->sync.dev.entry[i].addr);
    }
    k_mutex_unlock(&devmgr->mutex);

    return count;
}

bool devmgr_is_connecting(void)
{
    devmgr_t *devmgr = &g_devmgr;

    bool connecting = false;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);

    for (size_t i = 0; i < devmgr->sync.dev.count; i++) {
        devmgr_conn_state_t conn_state = devmgr->sync.dev.entry[i].state.conn_state;

        if (conn_state == DEVMGR_CONN_CONNECTING || conn_state == DEVMGR_CONN_CONNECTED) {
            connecting = true;
            break;
        }
    }
    k_mutex_unlock(&devmgr->mutex);

    return connecting;
}

bool devmgr_is_ready(void)
{
    devmgr_t *devmgr = &g_devmgr;

    bool ready = false;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);

    for (size_t i = 0; i < devmgr->sync.dev.count; i++) {
        devmgr_conn_state_t conn_state = devmgr->sync.dev.entry[i].state.conn_state;

        if (conn_state == DEVMGR_CONN_READY) {
            ready = true;
            break;
        }
    }
    k_mutex_unlock(&devmgr->mutex);

    return ready;
}

// Must be called with devmgr->mutex locked
devmgr_entry_t *devmgr_find_entry(const bt_addr_le_t *addr)
{
    devmgr_t *devmgr = &g_devmgr;

    for (size_t i = 0; i < devmgr->sync.dev.count; i++) {
        devmgr_entry_t *entry = &devmgr->sync.dev.entry[i];
        if (bt_addr_le_eq(&entry->addr, addr)) {
            return entry;
        }
    }

    return NULL;
}

// Must be called with devmgr->mutex locked
devmgr_entry_t *devmgr_ensure_entry(const bt_addr_le_t *addr, bool save)
{
    devmgr_t *devmgr = &g_devmgr;

    devmgr_entry_t *first = &devmgr->sync.dev.entry[0];
    devmgr_entry_t *entry = devmgr_find_entry(addr);

    bool changed = false;

    if (entry != NULL) {
        // make it the first entry
        if (entry != first) {
            devmgr_entry_t temp = *entry;
            memmove(first + 1, first, (entry - first) * sizeof(*first));
            *first = temp;
            changed = true;
        }
    } else {
        if (devmgr->sync.dev.count == DEVMGR_MAX_CONFIG_ENTRIES) {
            // remove the last entry
            devmgr_entry_t *last = &devmgr->sync.dev.entry[DEVMGR_MAX_CONFIG_ENTRIES - 1];
            devmgr->sync.dev.count--;
            devmgr_notify(EV_SUBJECT_DEV_LIST, &last->addr, EV_ACTION_DELETE);
        }

        // create new entry at the beginning
        if (devmgr->sync.dev.count > 0) {
            size_t nitems = MIN(devmgr->sync.dev.count, DEVMGR_MAX_CONFIG_ENTRIES - 1);
            memmove(first + 1, first, nitems * sizeof(*first));
        }

        devmgr->sync.dev.count++;

        entry = first;
        memset(entry, 0, sizeof(devmgr_entry_t));
        bt_addr_le_copy(&entry->addr, addr);

        devmgr_notify(EV_SUBJECT_DEV_LIST, addr, EV_ACTION_CREATE);

        changed = true;
    }

    if (changed && save) {
        LOG_INF("Scheduling devmgr settings save");
        k_work_reschedule(&devmgr->save_work, K_SECONDS(3));
    }

    return first;
}

int devmgr_create_device(const bt_addr_le_t *addr, bool save)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);

    devmgr_entry_t *entry = devmgr_ensure_entry(addr, save);

    k_mutex_unlock(&devmgr->mutex);

    return entry != NULL ? 0 : -ENOMEM;
}

int devmgr_delete_device(const bt_addr_le_t *addr)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);

    // !@# disconnect if connected

    devmgr_entry_t *entry = devmgr_find_entry(addr);

    if (entry != NULL) {
        // remove entry
        devmgr_entry_t *end = &devmgr->sync.dev.entry[devmgr->sync.dev.count];
        memmove(entry, entry + 1, (end - entry - 1) * sizeof(devmgr_entry_t));
        devmgr->sync.dev.count--;

        devmgr_notify(EV_SUBJECT_DEV_LIST, addr, EV_ACTION_DELETE);
    }

    k_mutex_unlock(&devmgr->mutex);

    if (entry != NULL) {
        // bthid_bonds_delete(); !@# TODO
        LOG_INF("Scheduling devmgr settings save");
        k_work_reschedule(&devmgr->save_work, K_SECONDS(3));
    }

    return entry != NULL ? 0 : -ENOENT;
}

int devmgr_get_device_state(const bt_addr_le_t *addr, devmgr_device_state_t *state)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);

    devmgr_entry_t *entry = devmgr_find_entry(addr);

    if (entry != NULL) {
        *state = entry->state;
    }

    k_mutex_unlock(&devmgr->mutex);

    return entry != NULL ? 0 : -ENOENT;
}

int devmgr_get_device_config(const bt_addr_le_t *addr, devmgr_device_config_t *config)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);

    devmgr_entry_t *entry = devmgr_find_entry(addr);

    if (entry != NULL) {
        *config = entry->config;
    }

    k_mutex_unlock(&devmgr->mutex);

    return entry != NULL ? 0 : -ENOENT;
}

int devmgr_set_device_config(const bt_addr_le_t *addr, const devmgr_device_config_t *config,
                             bool save)
{
    devmgr_t *devmgr = &g_devmgr;

    bool changed = false;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);

    devmgr_entry_t *entry = devmgr_find_entry(addr);

    if (entry != NULL) {
        if (memcmp(&entry->config, config, sizeof(*config)) != 0) {
            changed = true;
            entry->config = *config;
        }
    }

    if (changed) {
        devmgr_notify(EV_SUBJECT_DEV_LIST, addr, EV_ACTION_UPDATE);
    }

    k_mutex_unlock(&devmgr->mutex);

    if (changed && save) {
        LOG_INF("Scheduling devmgr settings save");
        k_work_reschedule(&devmgr->save_work, K_SECONDS(3));
    }

    return entry != NULL ? 0 : -ENOENT;
}
