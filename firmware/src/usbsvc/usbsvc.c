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

#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/ring_buffer.h>

#include <btjp/btjp.h>
#include <btjp/btjp_msg.h>
#include <event/event_bus.h>
#include <event/event_queue.h>
#include <usbd/usbd_webusb.h>
#include <xep80/xep80.h>

#include "usbsvc.h"

LOG_MODULE_REGISTER(btj_usbsvc, LOG_LEVEL_DBG);

#define USBSVC_FRAME_HEADER_SIZE     2
#define USBSVC_MAX_BTJP_SIZE         (sizeof(btjp_msg_header_t) + UINT8_MAX)
#define USBSVC_MAX_FRAME_SIZE        (USBSVC_FRAME_HEADER_SIZE + USBSVC_MAX_BTJP_SIZE)
#define USBSVC_RX_RING_SIZE          (2 * USBSVC_MAX_FRAME_SIZE)
#define USBSVC_XEP80_UPDATE_DELAY_MS 50

typedef struct {
    atomic_t configured;
    atomic_t session_started;

    // Worker processing USB status changes
    struct k_work status_work;

    // RX worker processing incoming USB data and assembling frames
    struct k_work rx_work;
    // RX ring buffer for incoming USB data
    struct ring_buf rx_ring_buf;
    uint8_t rx_ring_buf_storage[USBSVC_RX_RING_SIZE];
    // Received frame being assembled from the stream
    uint8_t rx_frame[USBSVC_MAX_FRAME_SIZE];
    size_t rx_frame_size;

    // Event worker for sending BTJP events to the host
    struct k_work_delayable event_work;
    event_queue_t evq;

    struct k_work_delayable xep80_update_work;
    atomic_t xep80_update_pending;
    xep80_update_client_t *xep80_client;
} usbsvc_t;

static usbsvc_t g_usbsvc;

static int usbsvc_send_frame(const uint8_t *payload, size_t payload_len)
{
    uint8_t frame[USBSVC_MAX_FRAME_SIZE];

    if (payload == NULL || payload_len == 0 || payload_len > USBSVC_MAX_BTJP_SIZE) {
        return -EINVAL;
    }

    sys_put_le16(payload_len, frame);
    memcpy(frame + USBSVC_FRAME_HEADER_SIZE, payload, payload_len);

    return btj_webusb_send(frame, USBSVC_FRAME_HEADER_SIZE + payload_len);
}

static void usbsvc_start_session(usbsvc_t *svc)
{
    // Restart event queue and repopulate it with the current state
    // so the client gets an immediate update upon connection
    event_queue_reset(&svc->evq);
    btjp_populate_event_queue(&svc->evq);
    k_work_reschedule(&svc->event_work, K_NO_WAIT);

    xep80_client_reset_sync_state(svc->xep80_client);
}

static void usbsvc_handle_request(usbsvc_t *svc, const uint8_t *payload, size_t payload_len)
{
    uint8_t tx_buf[USBSVC_MAX_BTJP_SIZE];

    size_t tx_size = btjp_handle_message(payload, payload_len, tx_buf, sizeof(tx_buf));
    if (tx_size == 0) {
        return;
    }

    int err = usbsvc_send_frame(tx_buf, tx_size);
    if (err != 0) {
        LOG_ERR("Failed to send BTJP response (err %d)", err);
    }

    if (atomic_cas(&svc->session_started, false, true) ||
        btjp_is_sync_request(payload, payload_len)) {
        usbsvc_start_session(svc);
    }
}

static void usbsvc_process_rx_chunk(usbsvc_t *svc, const uint8_t *data, size_t len)
{
    for (size_t i = 0; i < len; i++) {
        if (svc->rx_frame_size < sizeof(svc->rx_frame)) {
            svc->rx_frame[svc->rx_frame_size] = data[i];
        }

        ++svc->rx_frame_size;

        if (svc->rx_frame_size >= USBSVC_FRAME_HEADER_SIZE) {
            uint16_t msg_size = sys_get_le16(svc->rx_frame);

            // Oversized frames are drained using the advertised length so the
            // stream stays aligned even though only a prefix fits locally.
            if (svc->rx_frame_size == msg_size + USBSVC_FRAME_HEADER_SIZE) {

                if (svc->rx_frame_size <= sizeof(svc->rx_frame)) {
                    // Complete frame received, process it
                    usbsvc_handle_request(svc, svc->rx_frame + USBSVC_FRAME_HEADER_SIZE, msg_size);
                } else {
                    // Frame too large to fit in buffer, drop it
                    LOG_ERR("Dropped oversized USB frame of size %u", svc->rx_frame_size);
                }

                svc->rx_frame_size = 0;
            }
        }
    }
}

static void usbsvc_rx_work_handler(struct k_work *work)
{
    usbsvc_t *svc = CONTAINER_OF(work, usbsvc_t, rx_work);
    uint8_t chunk[64];
    uint32_t read_len;

    if (!atomic_get(&g_usbsvc.configured)) {
        return;
    }

    while ((read_len = ring_buf_get(&svc->rx_ring_buf, chunk, sizeof(chunk))) > 0) {
        usbsvc_process_rx_chunk(svc, chunk, read_len);
    }
}

static void usbsvc_rx_callback(void *context, const uint8_t *data, size_t len)
{
    usbsvc_t *svc = (usbsvc_t *)context;

    if (data == NULL || len == 0) {
        return;
    }

    uint32_t written = ring_buf_put(&svc->rx_ring_buf, data, len);
    if (written != len) {
        LOG_ERR("USB RX ring buffer overflow (%u/%u)", written, len);
    }

    k_work_submit(&svc->rx_work);
}

static void usbsvc_event_callback(void *context, const event_t *ev)
{
    usbsvc_t *svc = (usbsvc_t *)context;

    if (event_queue_push(&svc->evq, ev) != 0) {
        LOG_WRN("USB event queue is full");
        return;
    }

    k_work_reschedule(&svc->event_work, K_MSEC(20));
}

static void usbsvc_event_work_handler(struct k_work *work)
{
    struct k_work_delayable *dwork = (struct k_work_delayable *)work;
    usbsvc_t *svc = CONTAINER_OF(dwork, usbsvc_t, event_work);
    uint8_t tx_buf[USBSVC_MAX_BTJP_SIZE];

    while (atomic_get(&svc->session_started)) {
        size_t tx_size = btjp_build_evt_message(tx_buf, sizeof(tx_buf), &svc->evq);
        if (tx_size == 0) {
            return;
        }

        int err = usbsvc_send_frame(tx_buf, tx_size);
        if (err != 0) {
            LOG_ERR("Failed to send BTJP event (err %d)", err);
            return;
        }
    }
}

static void usbsvc_xep80_update_cb(void *context)
{
    usbsvc_t *svc = (usbsvc_t *)context;

    if (!atomic_set(&svc->xep80_update_pending, true)) {
        k_work_reschedule(&svc->xep80_update_work, K_MSEC(USBSVC_XEP80_UPDATE_DELAY_MS));
    }
}

static void usbsvc_xep80_update_work_handler(struct k_work *work)
{
    struct k_work_delayable *dwork = (struct k_work_delayable *)work;
    usbsvc_t *svc = CONTAINER_OF(dwork, usbsvc_t, xep80_update_work);

    atomic_set(&svc->xep80_update_pending, false);

    if (!atomic_get(&svc->session_started)) {
        return;
    }

    while (true) {
        struct {
            btjp_msg_header_t hdr;
            uint8_t buf[BTJP_MAX_PAYLOAD_SIZE];
        } tx_msg;

        size_t tx_size =
            xep80_build_update_message(tx_msg.buf, sizeof(tx_msg.buf), svc->xep80_client);

        if (tx_size == 0) {
            break;
        }

        LOG_DBG("Built XEP80 update message of size %u", tx_size);

        tx_msg.hdr.flags = BTJP_MSG_TYPE_EVENT;
        tx_msg.hdr.msg_id = BTJP_MSG_EVT_XEP80_UPDATE;
        tx_msg.hdr.seq = 0;
        tx_msg.hdr.size = (uint8_t)tx_size;

        int err = usbsvc_send_frame((const uint8_t *)&tx_msg, sizeof(tx_msg.hdr) + tx_msg.hdr.size);
        if (err != 0) {
            LOG_ERR("Failed to send XEP80 update (err %d)", err);
            return;
        }
    }
}

static void usbsvc_status_work_handler(struct k_work *work)
{
    usbsvc_t *svc = CONTAINER_OF(work, usbsvc_t, status_work);
    bool configured = btj_webusb_is_enabled();

    if (!configured) {
        atomic_set(&svc->configured, false);

        event_bus_unsubscribe(usbsvc_event_callback, svc);
        xep80_unregister_update_callback(svc->xep80_client);
        svc->xep80_client = NULL;

        k_work_cancel(&svc->rx_work);
        k_work_cancel_delayable(&svc->event_work);
        k_work_cancel_delayable(&svc->xep80_update_work);

        ring_buf_reset(&svc->rx_ring_buf);
        svc->rx_frame_size = 0;

        atomic_set(&svc->session_started, false);
        atomic_set(&svc->xep80_update_pending, false);

        LOG_INF("USB service deactivated");
    } else {
        ring_buf_reset(&svc->rx_ring_buf);
        svc->rx_frame_size = 0;

        event_queue_reset(&svc->evq);

        int err = event_bus_subscribe(usbsvc_event_callback, svc);
        if (err != 0) {
            LOG_ERR("Failed to subscribe USB service to event bus");
            return;
        }

        err = xep80_register_update_callback(usbsvc_xep80_update_cb, svc, &svc->xep80_client);
        if (err != 0) {
            LOG_ERR("Failed to register USB XEP80 callback (err %d)", err);
            return;
        }

        atomic_set(&svc->session_started, false);
        atomic_set(&svc->xep80_update_pending, false);

        // Start accepting USB requests immediately
        atomic_set(&svc->configured, true);
        LOG_INF("USB service activated");
    }
}

static void usbsvc_status_callback(void *context, bool enabled)
{
    usbsvc_t *svc = (usbsvc_t *)context;
    k_work_submit(&svc->status_work);
}

int usbsvc_init(void)
{
    usbsvc_t *svc = &g_usbsvc;
    int err;

    memset(svc, 0, sizeof(*svc));

    ring_buf_init(&svc->rx_ring_buf, sizeof(svc->rx_ring_buf_storage), svc->rx_ring_buf_storage);
    k_work_init(&svc->status_work, usbsvc_status_work_handler);
    k_work_init(&svc->rx_work, usbsvc_rx_work_handler);
    k_work_init_delayable(&svc->event_work, usbsvc_event_work_handler);
    k_work_init_delayable(&svc->xep80_update_work, usbsvc_xep80_update_work_handler);

    err = event_queue_init(&svc->evq);
    if (err != 0) {
        return err;
    }

    err = btj_webusb_register_callbacks(usbsvc_rx_callback, usbsvc_status_callback, svc);
    if (err != 0) {
        return err;
    }

    return 0;
}
