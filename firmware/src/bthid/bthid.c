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

#include <assert.h>

#include "bthid_internal.h"

bthid_drv_t bthid;

int bthid_init(const bthid_callbacks_t *callbacks)
{
    assert(callbacks != NULL);
    memset(&bthid, 0, sizeof(bthid_drv_t));

    int err;

    err = k_mutex_init(&bthid.mutex);
    if (err) {
        return err;
    }

    bthid.cb = callbacks;
    bthid.initialized = true;

    err = bthid_bonds_init();
    if (err) {
        bthid.initialized = false;
        bthid.cb = NULL;
        return err;
    }

    return 0;
}

static bthid_device_t *find_device_by_conn(struct bt_conn *conn)
{
    for (int dev_idx = 0; dev_idx < ARRAY_SIZE(bthid.devices); ++dev_idx) {
        if (bthid.devices[dev_idx].conn == conn) {
            return &bthid.devices[dev_idx];
        }
    }

    return NULL;
}

bthid_device_t *bthid_device_find_locked(struct bt_conn *conn)
{
    return find_device_by_conn(conn);
}

bthid_device_t *bthid_device_find(struct bt_conn *conn)
{
    bthid_device_t *dev;

    if (!bthid.initialized) {
        return NULL;
    }

    k_mutex_lock(&bthid.mutex, K_FOREVER);
    dev = find_device_by_conn(conn);
    k_mutex_unlock(&bthid.mutex);

    return dev;
}

struct bt_conn *bthid_device_conn_ref(bthid_device_t *dev)
{
    struct bt_conn *conn = NULL;

    if (!bthid.initialized) {
        return NULL;
    }

    k_mutex_lock(&bthid.mutex, K_FOREVER);
    if (dev->conn != NULL) {
        conn = bt_conn_ref(dev->conn);
    }
    k_mutex_unlock(&bthid.mutex);

    return conn;
}

void bthid_device_get_addr(bthid_device_t *dev, bt_addr_le_t *addr)
{
    bt_addr_le_copy(addr, &dev->addr);
}
