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
        LOG_INF("Report map read complete {size: %zu}", dev->report_map_raw_size);
        LOG_HEXDUMP_INF(dev->report_map_raw, dev->report_map_raw_size, "Report map");

        // Parse the report map
        hrm_parse(&dev->report_map, dev->report_map_raw, dev->report_map_raw_size);

        dev->discovered = true;

        bthid.cb->discovery_completed(dev);
        return BT_GATT_ITER_STOP;
    }

    return BT_GATT_ITER_CONTINUE;
}

static int start_report_map_read(bthid_device_t *dev)
{
    static struct bt_gatt_read_params read_report_map_params;
    read_report_map_params = (struct bt_gatt_read_params){
        .func = report_map_read_cb,
        .handle_count = 1,
        .single.handle = dev->handles.report_map,
    };

    int err = bt_gatt_read(dev->conn, &read_report_map_params);
    if (err) {
        LOG_ERR("Failed to read HID report map {err: %d}", err);
    } else {
        LOG_INF("Reading report map...");
    }

    return err;
}

static uint8_t report_ref_read_cb(struct bt_conn *conn, uint8_t err,
                                  struct bt_gatt_read_params *params, const void *data,
                                  uint16_t length)
{
    bthid_device_t *dev = bthid_device_find(conn);
    assert(dev);

    if (err || data == NULL || length < 2) {
        LOG_ERR("  ReportRef read failed {err: %u len: %u}", err, length);
        bthid.cb->discovery_error(dev);
        return BT_GATT_ITER_STOP;
    }

    report_char_t *report_char = NULL;

    for (uint8_t i = 0; i < dev->handles.report_count; i++) {
        if (dev->handles.report[i].ref_handle == params->single.handle) {
            report_char = &dev->handles.report[i];
            break;
        }
    }

    if (report_char == NULL) {
        LOG_ERR("  ReportRef read - for unknown report handle {handle: %u}", params->single.handle);
        bthid.cb->discovery_error(dev);
        return BT_GATT_ITER_STOP;
    }

    report_char->report_id = ((const uint8_t *)data)[0];
    report_char->report_type = ((const uint8_t *)data)[1];

    LOG_INF("  ReportRef read {report_handle: %u, id: %u, type: %u}", report_char->value_handle,
            report_char->report_id, report_char->report_type);

    return BT_GATT_ITER_STOP;
}

static int start_read_report_ref(struct bt_conn *conn, const struct bt_gatt_attr *attr)
{
    bthid_device_t *dev = bthid_device_find(conn);
    assert(dev);

    static struct bt_gatt_read_params rp;
    rp = (struct bt_gatt_read_params){
        .func = report_ref_read_cb,
        .handle_count = 1,
        .single.handle = attr->handle,
    };

    int err = bt_gatt_read(conn, &rp);
    if (err) {
        LOG_ERR("  Failed to queue ReportRef read {err: %d}", err);
        bthid.cb->discovery_error(dev);
    }

    return BT_GATT_ITER_STOP;
}

static int start_report_descriptor_discovery(bthid_device_t *dev);

static uint8_t on_report_desc(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                              struct bt_gatt_discover_params *params)
{
    bthid_device_t *dev = bthid_device_find(conn);
    assert(dev);

    if (attr == NULL) {
        /* Move to next report characteristic */
        dev->report_index++;
        if (dev->report_index >= dev->handles.report_count) {
            LOG_INF("Report descriptor discovery complete");
            int err = start_report_map_read(dev);
            if (err) {
                bthid.cb->discovery_error(dev);
            }
            return BT_GATT_ITER_STOP;
        }

        // Start descriptor discovery for next report
        int err = start_report_descriptor_discovery(dev);
        if (err) {
            bthid.cb->discovery_error(dev);
        }
        return BT_GATT_ITER_STOP;
    }

    int i = dev->report_index;

    // Identify descriptor by UUID
    if (0 == bt_uuid_cmp(attr->uuid, BT_UUID_GATT_CCC)) {
        dev->handles.report[i].ccc_handle = attr->handle;
        LOG_INF("  CCCD found {report_handle: %u, cccd: %u}", dev->handles.report[i].value_handle,
                attr->handle);
    } else if (0 == bt_uuid_cmp(attr->uuid, BT_UUID_HIDS_REPORT_REF)) {
        dev->handles.report[i].ref_handle = attr->handle;
        LOG_INF("  ReportRef found {report_handle: %u, handle: %u}",
                dev->handles.report[i].value_handle, attr->handle);

        int err = start_read_report_ref(conn, attr);
        if (err) {
            bthid.cb->discovery_error(dev);
            return BT_GATT_ITER_STOP;
        }
    }

    return BT_GATT_ITER_CONTINUE;
}

static int start_report_descriptor_discovery(bthid_device_t *dev)
{
    uint8_t i = dev->report_index;

    uint16_t start = dev->handles.report[i].value_handle + 1;
    uint16_t end;

    if (dev->report_index >= dev->handles.report_count - 1) {
        end = dev->handles.report_end;
        if (end == 0) {
            end = dev->handles.service_end;
        }
    } else {
        end = dev->handles.report[i + 1].decl_handle - 1;
    }

    static struct bt_gatt_discover_params dp;
    dp = (struct bt_gatt_discover_params){
        .uuid = NULL, // discover all descriptors in range
        .func = on_report_desc,
        .start_handle = start,
        .end_handle = end,
        .type = BT_GATT_DISCOVER_DESCRIPTOR,
    };

    int err = bt_gatt_discover(dev->conn, &dp);
    if (err) {
        LOG_ERR("Failed to start descriptor discovery {err: %d}", err);
        bthid.cb->discovery_error(dev);
    } else {
        LOG_INF("Discovering report descriptors {idx: %u, range: %u - %u}", i, start, end);
    }

    return err;
}

static uint8_t on_hid_characteristic(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                                     struct bt_gatt_discover_params *params)
{
    bthid_device_t *dev = bthid_device_find(conn);
    assert(dev != NULL);

    if (attr == NULL) {
        if (dev->handles.report_count > 0) {
            LOG_INF("%d HID report characteristics found", dev->handles.report_count);
            dev->report_index = 0;
            int err = start_report_descriptor_discovery(dev);
            if (err) {
                bthid.cb->discovery_error(dev);
            }
        } else {
            LOG_ERR("No HID reports found");
            bthid.cb->discovery_error(dev);
        }

        return BT_GATT_ITER_STOP;
    }

    if (params->type == BT_GATT_DISCOVER_CHARACTERISTIC) {
        struct bt_gatt_chrc *chrc = (struct bt_gatt_chrc *)attr->user_data;
        char uuid_str[BT_UUID_STR_LEN];
        bt_uuid_to_str(chrc->uuid, uuid_str, sizeof(uuid_str));

        if (dev->handles.report_end == 0) {
            dev->handles.report_end = attr->handle - 1;
        }

        LOG_INF("Characteristics {uuid: %s, handle: %u, props: 0x%02x}", uuid_str, attr->handle,
                chrc->properties);

        if (0 == bt_uuid_cmp(chrc->uuid, BT_UUID_HIDS_CTRL_POINT)) {
            dev->handles.control_point = chrc->value_handle;
        } else if (0 == bt_uuid_cmp(chrc->uuid, BT_UUID_HIDS_REPORT_MAP)) {
            LOG_INF("HID report map characteristic found");
            dev->handles.report_map = chrc->value_handle;
        } else if (0 == bt_uuid_cmp(chrc->uuid, BT_UUID_HIDS_REPORT)) {
            if (dev->handles.report_count < ARRAY_SIZE(dev->handles.report)) {
                report_char_t *report_char = &dev->handles.report[dev->handles.report_count];
                memset(report_char, 0, sizeof(*report_char));
                report_char->decl_handle = attr->handle;
                report_char->value_handle = chrc->value_handle;
                dev->handles.report_count++;
                dev->handles.report_end = 0;
            }
        }
    }

    return BT_GATT_ITER_CONTINUE;
}

static int start_hid_characteristic_discovery(bthid_device_t *dev, uint16_t start_handle,
                                              uint16_t end_handle)
{
    static struct bt_gatt_discover_params discover_params;
    discover_params = (struct bt_gatt_discover_params){
        .uuid = NULL,
        .func = on_hid_characteristic,
        .start_handle = start_handle,
        .end_handle = end_handle,
        .type = BT_GATT_DISCOVER_CHARACTERISTIC,
    };

    int err = bt_gatt_discover(dev->conn, &discover_params);
    if (err) {
        LOG_ERR("Cannot start HID characteristic discovery {err: %d}", err);
    } else {
        LOG_INF("Discovering HID characteristics...");
    }

    return err;
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

        LOG_INF("Service {uuid: %s, handles: %u - %u}", uuid_str, attr->handle,
                service->end_handle);

        dev->handles.service_end = service->end_handle;

        if (0 == bt_uuid_cmp(service->uuid, BT_UUID_HIDS)) {
            int err = start_hid_characteristic_discovery(dev, attr->handle, service->end_handle);
            if (err) {
                bthid.cb->discovery_error(dev);
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
