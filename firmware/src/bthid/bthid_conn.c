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

#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/hci.h>

#include "bthid_internal.h"

LOG_MODULE_DECLARE(btj_bthid, LOG_LEVEL_DBG);

static void mtu_exchanged(struct bt_conn *conn, uint8_t err, struct bt_gatt_exchange_params *params)
{
    uint16_t mtu = bt_gatt_get_mtu(conn);

    if (err) {
        LOG_ERR("MTU exchange failed {err: %d, mtu: %d}", err, mtu);
    } else {
        LOG_INF("MTU exchanged {mtu: %d}", mtu);
    }
}

static struct bt_conn *take_device_conn(bthid_device_t *dev)
{
    struct bt_conn *conn;

    k_mutex_lock(&bthid.mutex, K_FOREVER);
    conn = dev->conn;
    dev->conn = NULL;
    k_mutex_unlock(&bthid.mutex);

    return conn;
}

static void disconnect_conn(struct bt_conn *conn)
{
    int err = bt_conn_disconnect(conn, BT_HCI_ERR_REMOTE_USER_TERM_CONN);
    if (err) {
        LOG_ERR("Failed to disconnect {err: %d}", err);
    }

    bt_conn_unref(conn);

    LOG_INF("Disconnected");
}

static void connected(struct bt_conn *conn, uint8_t err)
{
    bthid_device_t *dev = bthid_device_find(conn);

    if (dev == NULL) {
        return;
    }

    char addr_str[BT_ADDR_LE_STR_LEN];
    bt_addr_le_to_str(bt_conn_get_dst(conn), addr_str, sizeof(addr_str));

    if (err) {
        LOG_ERR("Connection failed {peer: %s, err: %u %s}", addr_str, err, bt_hci_err_to_str(err));

        bthid.cb->conn_error(dev);
        return;
    }

    LOG_INF("Connected {peer: %s}", addr_str);

    static struct bt_gatt_exchange_params exchange_params;
    exchange_params = (struct bt_gatt_exchange_params){
        .func = mtu_exchanged,
    };

    err = bt_gatt_exchange_mtu(conn, &exchange_params);
    if (err) {
        LOG_ERR("Failed to exchange MTU {err: %d}", err);
        bthid.cb->conn_error(dev);
        return;
    }

    // Request security level 2 (encrypted)
    err = bt_conn_set_security(conn, BT_SECURITY_L2);
    if (err) {
        LOG_ERR("Failed to set security level {err: %d}", err);
        bthid.cb->conn_error(dev);
        return;
    }

    bthid.cb->conn_opened(dev);
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
    k_mutex_lock(&bthid.mutex, K_FOREVER);
    bthid_device_t *dev = bthid_device_find_locked(conn);
    if (dev != NULL) {
        dev->conn = NULL;
    }
    k_mutex_unlock(&bthid.mutex);

    if (dev == NULL) {
        return;
    }

    char addr[BT_ADDR_LE_STR_LEN];
    bt_addr_le_to_str(bt_conn_get_dst(conn), addr, sizeof(addr));

    LOG_INF("Disconnected {peer: %s, reason: 0x%02x %s", addr, reason, bt_hci_err_to_str(reason));

    bthid.cb->conn_closed(dev);
    bt_conn_unref(conn);
}

static void security_changed(struct bt_conn *conn, bt_security_t level, enum bt_security_err err)
{
    bthid_device_t *dev = bthid_device_find(conn);

    if (dev == NULL) {
        return;
    }

    if (err) {
        LOG_ERR("Security level change failed {level: %u, err: %d}", level, err);
        bthid.cb->conn_error(dev);
        return;
    }

    LOG_INF("Security level changed {level: %u}", level);

    if (level >= BT_SECURITY_L2) {
        bthid.cb->conn_secured(dev);
    }
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
    .connected = connected,
    .disconnected = disconnected,
    .security_changed = security_changed,
};

int bthid_connect(int slot, const bt_addr_le_t *addr)
{
    assert(slot >= 0 && slot < BTHID_MAX_DEVICES);

    k_mutex_lock(&bthid.mutex, K_FOREVER);

    bthid_device_t *dev = &bthid.devices[slot];

    if (dev->conn != NULL) {
        LOG_ERR("Device already connected");
        k_mutex_unlock(&bthid.mutex);
        return -EBUSY;
    }

    memset(dev, 0, sizeof(*dev));
    bt_addr_le_copy(&dev->addr, addr);

    int err = bt_conn_le_create(addr, BT_CONN_LE_CREATE_CONN, BT_LE_CONN_PARAM_DEFAULT, &dev->conn);

    k_mutex_unlock(&bthid.mutex);

    char addr_str[BT_ADDR_LE_STR_LEN];
    bt_addr_le_to_str(addr, addr_str, sizeof(addr_str));

    if (err) {
        LOG_ERR("Connecting failed {peer: %s, err: %d}", addr_str, err);
        return err;
    } else {
        LOG_INF("Connecting... {peer: %s}", addr_str);
    }

    return err;
}

void bthid_disconnect(int slot)
{
    assert(slot >= 0 && slot < BTHID_MAX_DEVICES);

    bthid_device_t *dev = &bthid.devices[slot];
    struct bt_conn *conn = take_device_conn(dev);

    if (conn != NULL) {
        bthid.cb->conn_closed(dev);
        disconnect_conn(conn);
    }
}

void bthid_device_disconnect(bthid_device_t *dev)
{
    struct bt_conn *conn = take_device_conn(dev);

    if (conn != NULL) {
        disconnect_conn(conn);
    }
}

bool bthid_device_is_secure(bthid_device_t *dev)
{
    struct bt_conn *conn = bthid_device_conn_ref(dev);

    if (conn == NULL) {
        return false;
    }

    bool is_secure = bt_conn_get_security(conn) >= BT_SECURITY_L2;
    bt_conn_unref(conn);

    return is_secure;
}
