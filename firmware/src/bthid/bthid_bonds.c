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

#include "bthid_internal.h"

static void pairing_complete(struct bt_conn *conn, bool bonded)
{
    char addr_str[BT_ADDR_LE_STR_LEN];
    bt_addr_le_to_str(bt_conn_get_dst(conn), addr_str, sizeof(addr_str));

    LOG_INF("Pairing complete {peer: %s, bonded: %s}", addr_str, bonded ? "yes" : "no");
}

static void pairing_failed(struct bt_conn *conn, enum bt_security_err reason)
{
    char addr_str[BT_ADDR_LE_STR_LEN];
    bt_addr_le_to_str(bt_conn_get_dst(conn), addr_str, sizeof(addr_str));

    LOG_ERR("Pairing failed {peer: %s, reason: %d}", addr_str, reason);
}

static void bond_deleted(uint8_t id, const bt_addr_le_t *peer)
{
    char addr_str[BT_ADDR_LE_STR_LEN];
    bt_addr_le_to_str(peer, addr_str, sizeof(addr_str));

    LOG_INF("Bond deleted {bond: %d, peer: %s}", id, addr_str);
}

static void print_bond_info(const struct bt_bond_info *info, void *user_data)
{
    char addr_str[BT_ADDR_LE_STR_LEN];
    bt_addr_le_to_str(&info->addr, addr_str, sizeof(addr_str));

    LOG_INF("Known bond: %s", addr_str);
}

int bthid_bonds_init(void)
{
    // List all known bonds
    bt_foreach_bond(BT_ID_DEFAULT, print_bond_info, NULL);

    static struct bt_conn_auth_info_cb conn_auth_info_cb = {
        .pairing_complete = pairing_complete,
        .pairing_failed = pairing_failed,
        .bond_deleted = bond_deleted,
    };

    // Register the callbacks for pairing and bonding
    int err = bt_conn_auth_info_cb_register(&conn_auth_info_cb);
    if (err) {
        LOG_ERR("Failed to register auth info callback {err: %d}", err);
    }

    static const struct bt_conn_auth_cb conn_auth_cb = {
        .passkey_display = NULL,
        .passkey_entry = NULL,
        .passkey_confirm = NULL,
        .pairing_confirm = NULL,
    };

    // Register the callbacks for pairing confirmation and passkey entry
    // (gamepads use Just Works pairing, so these are set to NULL)
    err = bt_conn_auth_cb_register(&conn_auth_cb);
    if (err) {
        LOG_ERR("Failed to register auth callback {err: %d}", err);
    }

    return err;
}

int bthid_bonds_delete(void)
{
    int err = bt_unpair(BT_ID_DEFAULT, NULL);
    if (err) {
        LOG_ERR("Failed to delete all bonds {err: %d}", err);
    } else {
        LOG_INF("All bonds deleted");
    }

    return err;
}
