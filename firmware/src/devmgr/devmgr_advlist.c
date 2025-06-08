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

void devmgr_clear_adv_list(void)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);
    for (int i = devmgr->sync.adv.count - 1; i >= 0; i--) {
        devmgr_adv_entry_t *entry = &devmgr->sync.adv.entry[i];
        --devmgr->sync.adv.count;
        devmgr_notify(EV_SUBJECT_ADV_LIST, &entry->addr, EV_ACTION_DELETE);
    }
    k_mutex_unlock(&devmgr->mutex);
}

void devmgr_add_to_adv_list(const bt_addr_le_t *addr, int8_t rssi, const char *name)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);

    // Check if already in the scan list
    for (size_t i = 0; i < devmgr->sync.adv.count; i++) {
        devmgr_adv_entry_t *entry = &devmgr->sync.adv.entry[i];
        if (bt_addr_le_eq(&entry->addr, addr)) {
            // Update RSSI and name
            entry->rssi = rssi;
            if (name != NULL) {
                strncpy(entry->name, name, sizeof(entry->name) - 1);
                entry->name[sizeof(entry->name) - 1] = '\0';
            }
            devmgr_notify(EV_SUBJECT_ADV_LIST, addr, EV_ACTION_UPDATE);
            k_mutex_unlock(&devmgr->mutex);
            return;
        }
    }

    // Add new entry if there's space
    if (devmgr->sync.adv.count < DEVMGR_MAX_CONFIG_ENTRIES) {
        devmgr_adv_entry_t *entry = &devmgr->sync.adv.entry[devmgr->sync.adv.count++];
        memset(entry, 0, sizeof(devmgr_adv_entry_t));
        bt_addr_le_copy(&entry->addr, addr);
        entry->rssi = rssi;
        if (name != NULL) {
            strncpy(entry->name, name, sizeof(entry->name) - 1);
            entry->name[sizeof(entry->name) - 1] = '\0';
        }
        devmgr_notify(EV_SUBJECT_ADV_LIST, addr, EV_ACTION_CREATE);
    }

    k_mutex_unlock(&devmgr->mutex);
}

int devmgr_get_advertising_devices(devmgr_adv_entry_t *list)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);
    size_t count = devmgr->sync.adv.count;
    memcpy(list, devmgr->sync.adv.entry, sizeof(devmgr_adv_entry_t) * count);
    k_mutex_unlock(&devmgr->mutex);

    return count;
}

int devmgr_get_adv_device(const bt_addr_le_t *addr, devmgr_adv_entry_t *entry_)
{
    devmgr_t *devmgr = &g_devmgr;

    k_mutex_lock(&devmgr->mutex, K_FOREVER);

    for (size_t i = 0; i < devmgr->sync.adv.count; i++) {
        devmgr_adv_entry_t *entry = &devmgr->sync.adv.entry[i];
        if (bt_addr_le_eq(&entry->addr, addr)) {
            *entry_ = *entry;
            k_mutex_unlock(&devmgr->mutex);
            return 0;
        }
    }

    k_mutex_unlock(&devmgr->mutex);
    return -ENOENT;
}
