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

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <hw_id.h>

#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/hci.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/bluetooth/gatt.h>

#include <zephyr/sys/byteorder.h>

#include <event/event_bus.h>
#include <event/event_queue.h>
#include <btjp/btjp_msg.h>
#include <btjp/btjp.h>

#include "btsvc.h"

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

// ------------------------------------------------------------------
// btjp connection context
// ------------------------------------------------------------------

typedef struct {
    struct bt_conn *conn;

    struct k_work request_work;
    struct k_work_delayable event_work;

    size_t rx_size;
    uint8_t rx_buf[256];

    atomic_t txq_ready;
    event_queue_t evq;

} btjp_session_t;

typedef struct {
    // Session contexts for each possible connection
    btjp_session_t session[CONFIG_BT_MAX_CONN];
    // Indicates if advertising is currently enabled
    atomic_t is_advertising;
    // Work item to stop advertising after timeout
    struct k_work_delayable adv_timeout_work;
} btsvc_t;

static btsvc_t g_btsvc;

// ------------------------------------------------------------------
// btjp service UUIDs
// ------------------------------------------------------------------

struct bt_uuid_128 btjp_svc_uuid =
    BT_UUID_INIT_128(BT_UUID_128_ENCODE(0x1C3B0000, 0x03F0, 0x5B46, 0x7A5A, 0x10A4D8EB5964));

static struct bt_uuid_128 btjp_rxq_uuid =
    BT_UUID_INIT_128(BT_UUID_128_ENCODE(0x1C3B0002, 0x03F0, 0x5B46, 0x7A5A, 0x10A4D8EB5964));

static struct bt_uuid_128 btjp_txq_uuid =
    BT_UUID_INIT_128(BT_UUID_128_ENCODE(0x1C3B0003, 0x03F0, 0x5B46, 0x7A5A, 0x10A4D8EB5964));

static ssize_t btjp_rxq_write(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                              const void *buf, uint16_t len, uint16_t offset, uint8_t flags)
{
    btjp_session_t *session = &g_btsvc.session[bt_conn_index(conn)];

    if (k_work_busy_get(&session->request_work)) {
        // previous request is still being processed
        LOG_ERR("Previous request is still being processed");
        return BT_GATT_ERR(BT_ATT_ERR_PREPARE_QUEUE_FULL);
    }

    if (offset >= sizeof(session->rx_buf)) {
        LOG_ERR("Invalid offset");
        return BT_GATT_ERR(BT_ATT_ERR_INVALID_OFFSET);
    }

    if (offset + len >= sizeof(session->rx_buf)) {
        LOG_ERR("Invalid attribute length");
        return BT_GATT_ERR(BT_ATT_ERR_INVALID_ATTRIBUTE_LEN);
    }

    memcpy(&session->rx_buf[offset], buf, len);
    session->rx_size = offset + len;

    if (session->rx_size >= sizeof(btjp_msg_header_t)) {
        btjp_msg_header_t *hdr = (btjp_msg_header_t *)session->rx_buf;
        if (session->rx_size == sizeof(btjp_msg_header_t) + hdr->size) {
            // complete message received
            k_work_submit(&session->request_work);
        }
    }

    return len;
}

static void btjp_txq_ccc_update(const struct bt_gatt_attr *attr, uint16_t value)
{
    LOG_INF("TXQ CCC updated: %u", value);
}

// ------------------------------------------------------------------
// btjp service definition
// --------

// clang-format off
BT_GATT_SERVICE_DEFINE(btjp_svc,
	BT_GATT_PRIMARY_SERVICE(&btjp_svc_uuid),
	BT_GATT_CHARACTERISTIC(&btjp_rxq_uuid.uuid, BT_GATT_CHRC_WRITE,
		BT_GATT_PERM_WRITE, NULL, btjp_rxq_write, NULL),
	BT_GATT_CHARACTERISTIC(&btjp_txq_uuid.uuid, BT_GATT_CHRC_NOTIFY,
		BT_GATT_PERM_NONE, NULL, NULL, NULL),
	BT_GATT_CCC(btjp_txq_ccc_update, BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
);
// clang-format on

const struct bt_gatt_attr *btjp_svc_txq_attr;

// Flag to suppress event notifications about config changes caused
// by request processed in btsvc connection context
static __thread bool handling_own_request = false;

// Processes a received request and sends a response
static void request_work_handler(struct k_work *work)
{
    btjp_session_t *session = CONTAINER_OF(work, btjp_session_t, request_work);

    uint8_t tx_buf[CONFIG_BT_L2CAP_TX_MTU];

    if (!atomic_set(&session->txq_ready, true)) {
        k_work_reschedule(&session->event_work, K_MSEC(0));
    }

    handling_own_request = true;

    size_t tx_size = btjp_handle_message(session->rx_buf, session->rx_size, tx_buf, sizeof(tx_buf));

    handling_own_request = false;

    if (tx_size == 0) {
        // Nothing to send
        return;
    }

    int err = bt_gatt_notify(session->conn, btjp_svc_txq_attr, tx_buf, tx_size);
    if (err) {
        LOG_ERR("Failed to notify response: %d", err);
    }
}

// Callback invoked when a notification has been sent
// (it used to schedule sending next event if any)
static void notify_sent_cb(struct bt_conn *conn, void *user_data)
{
    btjp_session_t *session = (btjp_session_t *)user_data;

    if (!event_queue_is_empty(&session->evq)) {
        // Schecdule sending next event
        k_work_reschedule(&session->event_work, K_MSEC(0));
    }
}

// Wrapper for sending notification with the callback
static int send_notify(btjp_session_t *session, const void *data, size_t len)
{
    struct bt_gatt_notify_params params;

    memset(&params, 0, sizeof(params));

    params.attr = btjp_svc_txq_attr;
    params.data = data;
    params.len = len;
    params.func = notify_sent_cb;
    params.user_data = session;

    return bt_gatt_notify_cb(session->conn, &params);
}

// Work handler for sending event notifications
static void event_work_handler(struct k_work *work_)
{
    struct k_work_delayable *work = (struct k_work_delayable *)work_;

    btjp_session_t *session = CONTAINER_OF(work, btjp_session_t, event_work);

    uint8_t tx_buf[CONFIG_BT_L2CAP_TX_MTU];

    size_t tx_size = btjp_build_evt_message(tx_buf, sizeof(tx_buf), &session->evq);

    LOG_INF("Sending event(size=%d)", tx_size);

    if (tx_size == 0) {
        // Nothing to send
        return;
    }

    int err = send_notify(session, tx_buf, tx_size);
    if (err) {
        LOG_ERR("Failed to notify event: %d", err);
    }
}

// Called from when a new event occurs on event bus
// (invoked from arbitrary thread context)
static void event_callback(void *context, const event_t *ev)
{
    btjp_session_t *session = (btjp_session_t *)context;

    /* if (handling_own_request || config_changed) {
        continue;
    }*/

    event_queue_push(&session->evq, ev);

    if (atomic_get(&session->txq_ready)) {
        k_work_reschedule(&session->event_work, K_MSEC(20));
    }
}

// ------------------------------------------------------------------
// Connection management
// ------------------------------------------------------------------

static void btsvc_publish_change_event(void)
{
    event_t ev = {
        .subject = EV_SUBJECT_BTSVC_STATE,
        .action = EV_ACTION_UPDATE,
    };

    event_bus_publish(&ev);
}

static void mtu_exchanged(struct bt_conn *conn, uint8_t err, struct bt_gatt_exchange_params *params)
{
    uint16_t mtu = bt_gatt_get_mtu(conn);

    if (err) {
        LOG_ERR("MTU exchange failed {err: %d, mtu: %d}", err, mtu);
    } else {
        LOG_INF("MTU exchanged {mtu: %d}", mtu);
    }
}

static void connected(struct bt_conn *conn, uint8_t err)
{
    struct bt_conn_info info;

    bt_conn_get_info(conn, &info);

    if (info.role != BT_CONN_ROLE_PERIPHERAL) {
        // Ignore connection initiated by us (central role)
        return;
    }

    char addr_str[BT_ADDR_LE_STR_LEN];
    bt_addr_le_to_str(bt_conn_get_dst(conn), addr_str, sizeof(addr_str));

    if (err) {
        LOG_ERR("Connection failed {peer: %s, err: %u %s}", addr_str, err, bt_hci_err_to_str(err));
        return;
    }

    if (atomic_set(&g_btsvc.is_advertising, false)) {
        btsvc_publish_change_event();
    }

    btjp_session_t *session = &g_btsvc.session[bt_conn_index(conn)];
    if (session->conn != NULL) {
        LOG_ERR("Connection already exists {peer: %s}", addr_str);
        session = NULL;
        goto error;
    }

    memset(session, 0, sizeof(btjp_session_t));
    session->conn = bt_conn_ref(conn);

    k_work_init(&session->request_work, request_work_handler);
    k_work_init_delayable(&session->event_work, event_work_handler);

    if (event_queue_init(&session->evq) != 0) {
        LOG_ERR("Failed to create event queue");
        goto error;
    }

    btjp_populate_event_queue(&session->evq);

    err = event_bus_subscribe(event_callback, session);
    if (err) {
        LOG_ERR("Failed to register device manager listener (err %d)", err);
        goto error;
    }

    static struct bt_gatt_exchange_params exchange_params;
    exchange_params = (struct bt_gatt_exchange_params){
        .func = mtu_exchanged,
    };

    err = bt_gatt_exchange_mtu(conn, &exchange_params);
    if (err) {
        LOG_ERR("Failed to exchange MTU {err: %d}", err);
        return;
    }

    LOG_INF("Connected {peer: %s}", addr_str);
    return;

error:
    if (session != NULL) {
        if (session->conn != NULL) {
            bt_conn_unref(session->conn);
        }
        memset(session, 0, sizeof(btjp_session_t));
    }

    bt_conn_disconnect(conn, BT_HCI_ERR_REMOTE_USER_TERM_CONN);
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
    btjp_session_t *session = &g_btsvc.session[bt_conn_index(conn)];

    if (session->conn != conn) {
        return;
    }

    char addr_str[BT_ADDR_LE_STR_LEN];
    bt_addr_le_to_str(bt_conn_get_dst(conn), addr_str, sizeof(addr_str));

    LOG_INF("Disconnected {peer: %s}", addr_str);

    event_bus_unsubscribe(event_callback, session);

    k_work_cancel(&session->request_work);         // !@# sync???
    k_work_cancel_delayable(&session->event_work); // !@# sync???

    bt_conn_unref(session->conn);
    memset(session, 0, sizeof(btjp_session_t));

    btsvc_start_advertising();
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
    .connected = connected,
    .disconnected = disconnected,
};

// ------------------------------------------------------------------
// Advertising
// ------------------------------------------------------------------

// BLE advertising data
static const struct bt_data adv_data[] = {
    BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
    BT_DATA(BT_DATA_UUID128_ALL, btjp_svc_uuid.val, sizeof(btjp_svc_uuid.val)),
};

static struct bt_le_ext_adv *adv;

static int btsvc_set_name(void)
{
    char hwid[HW_ID_LEN];
    char name[32];

    int err = hw_id_get(hwid, sizeof(hwid));
    if (err) {
        LOG_ERR("Failed to get HW ID (err %d)", err);
        return err;
    }

    snprintf(name, sizeof(name), "Blue2Joy-%s", hwid);

    err = bt_set_name(name);
    if (err) {
        LOG_ERR("Failed to set device name (err %d)", err);
    }

    return 0;
}

int btsvc_start_advertising(void)
{
    btsvc_t *svc = &g_btsvc;

    int err = bt_le_ext_adv_start(adv, BT_LE_EXT_ADV_START_DEFAULT);

    if (err) {
        LOG_ERR("Advertising failed to start (err %d)", err);
    } else {
        LOG_INF("Advertising successfully started");

        if (!atomic_set(&svc->is_advertising, true)) {
            btsvc_publish_change_event();

            // Start timer to stop advertising after timeout
            k_work_reschedule(&svc->adv_timeout_work, K_SECONDS(15));
        }
    }

    return err;
}

void btsvc_stop_advertising(void)
{
    btsvc_t *svc = &g_btsvc;

    int err = bt_le_ext_adv_stop(adv);

    if (err) {
        LOG_ERR("Advertising failed to stop (err %d)", err);
    } else {
        LOG_INF("Advertising successfully stopped");
    }

    if (atomic_set(&svc->is_advertising, false)) {
        btsvc_publish_change_event();
    }
}

bool btsvc_is_advertising(void)
{
    btsvc_t *svc = &g_btsvc;

    return atomic_get(&svc->is_advertising);
}

static void adv_timeout_handler(struct k_work *work)
{
    LOG_INF("Advertising timeout, stopping advertising");
    btsvc_stop_advertising();
}

int btsvc_init(void)
{
    btsvc_t *svc = &g_btsvc;

    static const struct bt_le_adv_param adv_param = {
        .options = BT_LE_ADV_OPT_CONN,
        .interval_min = BT_GAP_ADV_FAST_INT_MIN_2,
        .interval_max = BT_GAP_ADV_FAST_INT_MAX_2,
        .peer = NULL,
    };

    for (int i = 0; i < btjp_svc.attr_count; i++) {
        if (bt_uuid_cmp(btjp_svc.attrs[i].uuid, &btjp_txq_uuid.uuid) == 0) {
            btjp_svc_txq_attr = &btjp_svc.attrs[i];
            break;
        }
    }

    int err;

    err = btsvc_set_name();
    if (err) {
        return err;
    }

    err = bt_le_ext_adv_create(&adv_param, NULL, &adv);
    if (err) {
        LOG_ERR("Failed to create advertising set (err %d)", err);
        return err;
    }

    err = bt_le_ext_adv_set_data(adv, adv_data, ARRAY_SIZE(adv_data), NULL, 0);
    if (err) {
        LOG_ERR("Failed to set advertising data (err %d)", err);
        return err;
    }

    k_work_init_delayable(&svc->adv_timeout_work, adv_timeout_handler);

    return 0;
}
