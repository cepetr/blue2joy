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

#include <zephyr/sys/byteorder.h>

#include "bthid_internal.h"

// Checks if the advertisement data comes from a hid gamepad, mouse, keyboard, etc.
static bool is_hid_advertisement(struct net_buf_simple *adv)
{
    size_t i = 0;

    while (i < adv->len - 2) {
        uint8_t el_len = adv->data[i];
        uint8_t el_type = adv->data[i + 1];

        if (el_type == BT_DATA_GAP_APPEARANCE) {
            uint16_t appearance = sys_get_le16(&adv->data[i + 2]);

            if (appearance == BT_APPEARANCE_HID_GAMEPAD || appearance == BT_APPEARANCE_HID_MOUSE ||
                appearance == BT_APPEARANCE_HID_KEYBOARD ||
                appearance == BT_APPEARANCE_HID_JOYSTICK) {
                return true;
            }
        }
        i += el_len + 1;
    }

    return false;
}

static bool parse_name_callback(struct bt_data *data, void *user_data)
{
    char *name = (char *)user_data;

    if (data->type == BT_DATA_NAME_COMPLETE || data->type == BT_DATA_NAME_SHORTENED) {
        size_t len = MIN(data->data_len, 30);
        memcpy(name, data->data, len);
        name[len] = '\0';
        return false; // Stop parsing
    }

    return true; // Continue parsing
}

static void device_found(const bt_addr_le_t *addr, int8_t rssi, uint8_t type,
                         struct net_buf_simple *adv)
{
    // We're only interested in connectable events
    if (type != BT_GAP_ADV_TYPE_ADV_IND && type != BT_GAP_ADV_TYPE_ADV_DIRECT_IND) {
        return;
    }

    if (!is_hid_advertisement(adv)) {
        return;
    }

    char addr_str[BT_ADDR_LE_STR_LEN];
    bt_addr_le_to_str(addr, addr_str, sizeof(addr_str));

    if (rssi < -65) {
        LOG_DBG("Device found, signal too weak {addr: %s, rssi: %d}", addr_str, rssi);
        return;
    }

    LOG_INF("Device found {addr: %s, rssi: %d}", addr_str, rssi);

    LOG_HEXDUMP_INF(adv->data, adv->len, "Advertisement data");

    char name[30 + 1] = {0};
    bt_data_parse(adv, parse_name_callback, name);

    bthid.cb->device_found(addr, rssi, name);
}

int bthid_scan_start(void)
{
    int err = bt_le_scan_start(BT_LE_SCAN_PASSIVE, device_found);
    if (err) {
        LOG_ERR("Scanning failed to start {err: %d}", err);
        return err;
    }

    LOG_INF("Scanning...");
    return err;
}

int bthid_scan_stop(void)
{
    int err = bt_le_scan_stop();
    if (err) {
        LOG_ERR("Failed to stop scanning {err: %d}", err);
    } else {
        LOG_INF("Scanning stopped");
    }
    return err;
}
