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

#include "xep80.h"
#include "xep80_internal.h"

// RLE protocol:
//
// 0X XX - set XXXth address
// 1X XX - set 4096 + XXX address
// 2X XX - set XXXth register
// 8X YY - repeat byte YY for XX + 1  times
// 9X XX YY - repeat byte YY for XXX + 1times
// AX - literal copy next X + 1 bytes
// BX XX - literal copy next XXX + 1 bytes
// FF - end of update => refresh display

typedef struct {
    uint8_t *start;
    uint8_t *end;
    uint8_t *pos;
    size_t ofs;
} rle_buff_t;

static inline size_t rle_remains(rle_buff_t *buff)
{
    return buff->end - buff->pos;
}

static inline void rle_emit(rle_buff_t *buff, uint8_t byte)
{
    if (buff->pos < buff->end) {
        *buff->pos++ = byte;
    }
}

size_t rle_encode(rle_buff_t *rle, const uint8_t *data, uint8_t *synced_data, size_t ofs,
                  size_t size)
{
    while (ofs < size && rle_remains(rle) >= 2) {

        // Skip unchanged bytes
        while (ofs < size && data[ofs] == synced_data[ofs]) {
            ofs++;
        }

        if (ofs == size) {
            break;
        }

        if (ofs != rle->ofs) {
            // Emit address update if we skipped any unchanged bytes since last update
            if (rle_remains(rle) < 4) {
                // Do not emit address update if we could not
                // emit any data since last address update
                break;
            }
            // Emit address update
            rle_emit(rle, 0x00 | ((ofs >> 8) & 0x7F));
            rle_emit(rle, ofs & 0xFF);
            rle->ofs = ofs;
        }

        size_t limit;
        size_t count;

        // Calculate number of same consecutive changed bytes

        limit = rle_remains(rle) == 2 ? 16 : 4096;
        limit = MIN(limit, size - ofs);

        count = 0;
        while (count < limit && data[ofs + count] == data[ofs] &&
               data[ofs + count] != synced_data[ofs + count]) {
            count++;
        }

        // Emit run if we have at least 2 same consecutive changed bytes
        if (count > 1) {
            if (count <= 16) {
                // Emit short run
                rle_emit(rle, 0x80 | (count - 1));
                rle_emit(rle, data[ofs]);
            } else {
                // Emit long run
                rle_emit(rle, 0x90 | ((count - 1) >> 8));
                rle_emit(rle, (count - 1) & 0xFF);
                rle_emit(rle, data[ofs]);
            }
            memset(&synced_data[ofs], data[ofs], count);
            ofs += count;
            rle->ofs = ofs;
            continue;
        }

        // Calculate number of consecutive changed bytes up to limit

        limit = rle_remains(rle) <= 17 ? rle_remains(rle) - 1 : rle_remains(rle) - 2;
        limit = MIN(limit, size - ofs);

        count = 0;
        while (count < limit && data[ofs + count] != synced_data[ofs + count]) {
            if (count >= 2 && data[ofs + count] == data[ofs + count - 1] &&
                data[ofs + count] == data[ofs + count - 2]) {
                count -= 2; // Do not include these 3 same bytes in literal copy
                break;
            }
            count++;
        }

        if (count > 0) {
            if (count <= 16) {
                // Emit short literal copy
                rle_emit(rle, 0xA0 | (count - 1));
                for (size_t i = 0; i < count; i++) {
                    rle_emit(rle, data[ofs + i]);
                }
            } else {
                // Emit long literal copy
                rle_emit(rle, 0xB0 | ((count - 1) >> 8));
                rle_emit(rle, (count - 1) & 0xFF);
                for (size_t i = 0; i < count; i++) {
                    rle_emit(rle, data[ofs + i]);
                }
            }

            memcpy(&synced_data[ofs], &data[ofs], count);
            ofs += count;
            rle->ofs = ofs;
            continue;
        }

        break;
    }

    return ofs;
}

size_t xep80_build_update_message(uint8_t *buf, size_t buf_size, xep80_update_client_t *client)
{
    xep80_t *xep = &g_xep80;

    if (client == NULL || !client->in_use) {
        return 0;
    }

    k_mutex_lock(&xep->mutex, K_FOREVER);

    if (!client->in_use) {
        // No callback registered, nothing to do
        k_mutex_unlock(&xep->mutex);
        return 0;
    }

    rle_buff_t rle_buff = {
        .start = buf,
        .end = buf + buf_size,
        .pos = buf,
        .ofs = 0,
    };

    const uint8_t *data = (const uint8_t *)&xep->state;
    uint8_t *synced_data = (uint8_t *)&client->synced_state;

    size_t next_ofs =
        rle_encode(&rle_buff, data, synced_data, client->synced_ofs, sizeof(xep->state));

    // If this pass produced no payload and we started mid-buffer,
    // wrap once to catch updates before synced_ofs (e.g., register-only changes).
    if (rle_buff.pos == rle_buff.start && client->synced_ofs != 0) {
        rle_buff.ofs = 0;
        next_ofs = rle_encode(&rle_buff, data, synced_data, 0, sizeof(xep->state));
    }

    client->synced_ofs = (next_ofs < sizeof(xep->state)) ? next_ofs : 0;

    k_mutex_unlock(&xep->mutex);

    return rle_buff.pos - rle_buff.start;
}

int xep80_register_update_callback(xep80_update_callback_t callback, void *context,
                                   xep80_update_client_t **client)
{
    xep80_t *xep = &g_xep80;
    int err = -ENOMEM;

    if (client == NULL) {
        return -EINVAL;
    }

    *client = NULL;

    k_mutex_lock(&xep->mutex, K_FOREVER);

    for (size_t i = 0; i < ARRAY_SIZE(xep->update_clients); i++) {
        xep80_update_client_t *slot = &xep->update_clients[i];

        if (slot->in_use) {
            continue;
        }

        memset(slot, 0, sizeof(*slot));
        slot->in_use = true;
        slot->callback = callback;
        slot->context = context;

        *client = slot;
        err = 0;
        break;
    }

    k_mutex_unlock(&xep->mutex);

    return err;
}

void xep80_unregister_update_callback(xep80_update_client_t *client)
{
    xep80_t *xep = &g_xep80;

    if (client == NULL) {
        return;
    }

    k_mutex_lock(&xep->mutex, K_FOREVER);

    if (client->in_use) {
        memset(client, 0, sizeof(*client));
    }

    k_mutex_unlock(&xep->mutex);
}

void xep80_client_reset_sync_state(xep80_update_client_t *client)
{
    if (client == NULL) {
        return;
    }

    k_mutex_lock(&g_xep80.mutex, K_FOREVER);

    client->synced_ofs = 0;
    memset(&client->synced_state, 0, sizeof(client->synced_state));

    client->callback(client->context);

    k_mutex_unlock(&g_xep80.mutex);
}
