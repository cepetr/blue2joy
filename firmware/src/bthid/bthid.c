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
    bthid.cb = callbacks;

    int err;

    err = k_mutex_init(&bthid.mutex);
    if (err) {
        return err;
    }

    err = bthid_bonds_init();
    if (err) {
        return err;
    }

    return 0;
}

bthid_device_t *bthid_device_find(struct bt_conn *conn)
{
    for (int dev_idx = 0; dev_idx < ARRAY_SIZE(bthid.devices); ++dev_idx) {
        if (bthid.devices[dev_idx].conn == conn) {
            return &bthid.devices[dev_idx];
        }
    }

    return NULL;
}

void bthid_device_get_addr(bthid_device_t *dev, bt_addr_le_t *addr)
{
    struct bt_conn_info info;
    bt_conn_get_info(dev->conn, &info);
    bt_addr_le_copy(addr, info.le.dst);
}
