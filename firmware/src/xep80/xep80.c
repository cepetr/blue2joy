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

#include <io/xep80_uart.h>

#include "xep80.h"
#include "xep80_internal.h"

LOG_MODULE_REGISTER(btj_xep80, LOG_LEVEL_DBG);

// XEP80 state
xep80_t g_xep80;

static void xep80_rx_callback(void *context, uint16_t rx_data);
static void xep80_rx_work_handler(struct k_work *work);
static void xep80_reset_update_clients_locked(xep80_t *xep);
static void xep80_notify_update_clients_locked(xep80_t *xep);

int xep80_init(void)
{
    xep80_t *xep = &g_xep80;

    memset(xep, 0, sizeof(xep80_t));

    int err = k_mutex_init(&xep->mutex);

    if (err) {
        LOG_ERR("Failed to initialize XEP80 update mutex: %d", err);
        return err;
    }

    k_work_init(&xep->rx_work, xep80_rx_work_handler);

    ring_buf_init(&xep->rx_rb, sizeof(xep->rx_buffer), xep->rx_buffer);

    xep80_reset(xep);

    return 0;
}

int xep80_activate(void)
{
    xep80_t *xep = &g_xep80;

    if (!xep->active) {
        int err = xep80_uart_init(xep80_rx_callback, xep);
        if (err) {
            LOG_ERR("XEP80 UART init failed: %d", err);
            return err;
        }

        xep->active = true;

        LOG_INF("XEP80 activated");
    }

    // Synchronize state with PC

    k_mutex_lock(&xep->mutex, K_FOREVER);

    xep80_reset_update_clients_locked(xep);
    xep80_notify_update_clients_locked(xep);

    k_mutex_unlock(&xep->mutex);

    return 0;
}

void xep80_deactivate(void)
{
    xep80_t *xep = &g_xep80;

    if (!xep->active) {
        return;
    }

    xep80_uart_uninit();

    LOG_INF("XEP80 deactivated");

    xep->active = false;
}

static void xep80_process_word(xep80_t *xep, uint16_t word)
{
    k_mutex_lock(&xep->mutex, K_FOREVER);

    if (word & 0x100) {
        // Command (ninth bit is set)
        xep80_process_cmd(xep, word);
    } else {
        // Regular character
        xep80_process_char(xep, word & 0xFF);
        xep80_sync_cursor(xep);

        xep->last_char = word & 0xFF;
    }

    // Update cursor address
    xep->state.curs =
        (xep->state.rows[xep->cur.y] & 0x1F) * XEP80_ROW_SIZE + xep->cur.x + xep->state.x_scroll;

    // LOG_INF("Cursor position: x=%d y=%d r_m=%d (curs=0x%03X)", xep->cur.x, xep->cur.y,
    //         xep->r_margin, xep->state.curs);

    xep80_notify_update_clients_locked(xep);

    k_mutex_unlock(&xep->mutex);
}

static void xep80_rx_work_handler(struct k_work *work)
{
    xep80_t *xep = CONTAINER_OF(work, xep80_t, rx_work);

    uint16_t data;

    // Drain the ring buffer and process all received words
    while (ring_buf_get(&xep->rx_rb, (uint8_t *)&data, sizeof(data)) == sizeof(data)) {
        xep80_process_word(xep, data);
    }

    // If new data arrived while we were processing, schedule another work item
    if (!ring_buf_is_empty(&xep->rx_rb)) {
        k_work_submit(&xep->rx_work);
    }
}

static void xep80_rx_callback(void *context, uint16_t word)
{
    xep80_t *xep = (xep80_t *)context;

    // Put received word into the ring buffer
    uint32_t written = ring_buf_put(&xep->rx_rb, (const uint8_t *)&word, sizeof(word));

    // If we successfully put the word into the buffer, schedule deferred processing
    if (written == sizeof(word)) {
        k_work_submit(&xep->rx_work);
    } else {
        LOG_ERR("XEP80 RX ring buffer full, dropping data");
    }
}

static void xep80_reset_update_clients_locked(xep80_t *xep)
{
    for (size_t i = 0; i < ARRAY_SIZE(xep->update_clients); i++) {
        xep80_update_client_t *client = &xep->update_clients[i];

        if (!client->in_use) {
            continue;
        }

        memset(&client->synced_state, 0, sizeof(client->synced_state));
        client->synced_ofs = 0;
    }
}

static void xep80_notify_update_clients_locked(xep80_t *xep)
{
    for (size_t i = 0; i < ARRAY_SIZE(xep->update_clients); i++) {
        xep80_update_client_t *client = &xep->update_clients[i];

        if (client->in_use && client->callback != NULL) {
            client->callback(client->context);
        }
    }
}
