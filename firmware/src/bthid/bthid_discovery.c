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

static uint8_t report_map_read_cb(struct bt_conn *conn, uint8_t err,
                                  struct bt_gatt_read_params *params, const void *data,
                                  uint16_t length)
{
    bthid_device_t *dev = bthid_device_find(conn);
    assert(dev != NULL);

    if (err) {
        LOG_ERR("Report map read failed {err: %d}", err);
        bthid.cb->discovery_error(dev);
        return BT_GATT_ITER_STOP;
    }

    if (params->single.offset + length > sizeof(dev->report_map_raw)) {
        LOG_ERR("Report map too large");
        bthid.cb->discovery_error(dev);
        return BT_GATT_ITER_STOP;
    }

    if (length > 0) {
        memcpy(&dev->report_map_raw[params->single.offset], data, length);
        dev->report_map_raw_size = params->single.offset + length;
    }

    if (length == 0) {
        LOG_INF("Report map read complete {size=%zu}", dev->report_map_raw_size);
        LOG_HEXDUMP_INF(dev->report_map_raw, dev->report_map_raw_size, "Report map");

        // Parse the report map
        hrm_parse(&dev->report_map, dev->report_map_raw, dev->report_map_raw_size);

        dev->discovered = true;

        bthid.cb->discovery_completed(dev);
        return BT_GATT_ITER_STOP;
    }

    return BT_GATT_ITER_CONTINUE;
}

static uint8_t on_hid_characteristic(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                                     struct bt_gatt_discover_params *params)
{
    bthid_device_t *dev = bthid_device_find(conn);
    assert(dev != NULL);

    if (attr == NULL) {
        static struct bt_gatt_read_params read_report_map_params;
        read_report_map_params = (struct bt_gatt_read_params){
            .func = report_map_read_cb,
            .handle_count = 1,
            .single.handle = dev->handles.report_map,
        };

        int err = bt_gatt_read(conn, &read_report_map_params);
        if (err) {
            LOG_ERR("Failed to read HID report map {err: %d}", err);
        } else {
            LOG_INF("Reading report map...");
        }

        return BT_GATT_ITER_STOP;
    }

    if (params->type == BT_GATT_DISCOVER_CHARACTERISTIC) {
        struct bt_gatt_chrc *chrc = (struct bt_gatt_chrc *)attr->user_data;

        char uuid_str[BT_UUID_STR_LEN];
        bt_uuid_to_str(chrc->uuid, uuid_str, sizeof(uuid_str));

        LOG_INF("Characteristics {uuid: %s, handle: %u, props: 0x%02x}", uuid_str, attr->handle,
                chrc->properties);

        if (0 == bt_uuid_cmp(chrc->uuid, BT_UUID_HIDS_CTRL_POINT)) {
            dev->handles.control_point = chrc->value_handle;
        } else if (0 == bt_uuid_cmp(chrc->uuid, BT_UUID_HIDS_REPORT_MAP)) {
            LOG_INF("HID report map characteristic found");
            dev->handles.report_map = chrc->value_handle;
        } else if (0 == bt_uuid_cmp(chrc->uuid, BT_UUID_HIDS_REPORT)) {
            if (chrc->properties & BT_GATT_CHRC_NOTIFY) {
                if (dev->handles.report_count == 0) {
                    LOG_INF("HID report characteristic found");
                    dev->handles.report = chrc->value_handle;
                    // !@# TODO: retrieve ccc handle correctly
                    dev->handles.report_ccc = chrc->value_handle + 1;
                }
            }
            dev->handles.report_count++;
        }
    }

    return BT_GATT_ITER_CONTINUE;
}

static uint8_t on_primary_service(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                                  struct bt_gatt_discover_params *params)
{
    bthid_device_t *dev = bthid_device_find(conn);
    assert(dev != NULL);

    if (attr == NULL) {
        LOG_INF("HID service not found");
        bthid.cb->discovery_error(dev);
        return BT_GATT_ITER_STOP;
    }

    if (params->type == BT_GATT_DISCOVER_PRIMARY) {
        struct bt_gatt_service_val *service = (struct bt_gatt_service_val *)attr->user_data;

        char uuid_str[BT_UUID_STR_LEN];
        bt_uuid_to_str(service->uuid, uuid_str, sizeof(uuid_str));

        LOG_INF("Service {uuid=%s, handles: %u - %u}", uuid_str, attr->handle, service->end_handle);

        if (0 == bt_uuid_cmp(service->uuid, BT_UUID_HIDS)) {
            static struct bt_gatt_discover_params discover_params;
            discover_params = (struct bt_gatt_discover_params){
                .uuid = NULL,
                .func = on_hid_characteristic,
                .start_handle = attr->handle + 1,
                .end_handle = service->end_handle,
                .type = BT_GATT_DISCOVER_CHARACTERISTIC,
            };

            int err = bt_gatt_discover(conn, &discover_params);
            if (err) {
                LOG_ERR("Cannot start HID service discovery {err: %d}", err);
                bthid.cb->discovery_error(dev);
            } else {
                LOG_INF("Discovering HID service...");
            }
            return BT_GATT_ITER_STOP;
        }
    }

    return BT_GATT_ITER_CONTINUE;
}

int bthid_device_discover(bthid_device_t *dev)
{
    dev->discovered = false;

    static struct bt_gatt_discover_params discover_params;
    discover_params = (struct bt_gatt_discover_params){
        .uuid = NULL,
        .func = on_primary_service,
        .start_handle = BT_ATT_FIRST_ATTRIBUTE_HANDLE,
        .end_handle = BT_ATT_LAST_ATTRIBUTE_HANDLE,
        .type = BT_GATT_DISCOVER_PRIMARY,
    };

    int err = bt_gatt_discover(dev->conn, &discover_params);
    if (err) {
        LOG_ERR("Cannot start service discovery {err: %d}", err);
    } else {
        LOG_INF("Discovering services...");
    }

    return err;
}

hrm_t *bthid_device_get_report_map(bthid_device_t *dev)
{
    return dev->discovered ? &dev->report_map : NULL;
}
