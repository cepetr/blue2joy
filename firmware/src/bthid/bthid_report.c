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

#include "bthid_internal.h"

static uint8_t hid_report_received(struct bt_conn *conn, struct bt_gatt_subscribe_params *params,
                                   const void *data, uint16_t length)
{
    bthid_device_t *dev = bthid_device_find(conn);
    assert(dev != NULL);

    bthid.cb->report_received(dev, data, length);

    return BT_GATT_ITER_CONTINUE;
}

static void hid_report_subscribed(struct bt_conn *conn, uint8_t err,
                                  struct bt_gatt_subscribe_params *params)
{
    bthid_device_t *dev = bthid_device_find(conn);
    assert(dev != NULL);

    if (err) {
        LOG_ERR("HID report subscription failed {err: %d}", err);
        bthid.cb->report_subscribe_error(dev);
    } else {
        LOG_INF("Subscribed to HID report notifications");
        bthid.cb->report_subscribe_completed(dev);
    }
}

int bthid_device_subscribe(bthid_device_t *dev)
{
    // Command to wake up the gamepad (write to HID Control Point)
    static const uint8_t wake_up_command[] = {
        0x01, // Exit from suspend mode
    };

    int err = bt_gatt_write_without_response(dev->conn, dev->handles.control_point, wake_up_command,
                                             sizeof(wake_up_command), false);
    if (err) {
        LOG_ERR("Failed to send wake-up command {err: %d}", err);
    } else {
        LOG_INF("Wake-up command sent");
    }

    static struct bt_gatt_subscribe_params subscribe_params;
    subscribe_params = (struct bt_gatt_subscribe_params){
        .subscribe = hid_report_subscribed,
        .notify = hid_report_received,
        .value = BT_GATT_CCC_NOTIFY,
        .value_handle = dev->handles.report,
        .ccc_handle = dev->handles.report_ccc,
        .flags = BIT(BT_GATT_SUBSCRIBE_FLAG_VOLATILE) | BIT(BT_GATT_SUBSCRIBE_FLAG_NO_RESUB),
    };

    err = bt_gatt_subscribe(dev->conn, &subscribe_params);

    if (err) {
        if (err == -EALREADY) {
            LOG_INF("Already subscribed to HID report notifications");
        } else {
            LOG_ERR("Failed to subscribe to HID report notifications {err: %d}", err);
        }
    } else {
        LOG_INF("Subscribing to HID report notifications...");
    }

    return err;
}
