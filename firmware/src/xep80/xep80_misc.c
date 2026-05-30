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

#include <io/xep80_uart.h>

#include "xep80_internal.h"

void xep80_reset(xep80_t *xep)
{
    memset(xep->state.vram, 0, sizeof(xep->state.vram));
    memset(xep->state.vram, 0x9B, XEP80_ROW_COUNT * XEP80_ROW_SIZE);

    xep->cur.x = 0;
    xep->cur.y = 0;
    xep->synced_cur = xep->cur;
    xep->l_margin = 0;
    xep->r_margin = XEP80_COL_COUNT - 1;
    xep->escape_next = false;
    xep->burst_mode = false;
    xep->printer_mode = false;
    xep->escape_mode = false;

    xep->state.vcr = 0x00;
    xep->state.attr0 = 0xFF;
    xep->state.attr1 = 0xFF;

    xep->state.x_scroll = 0;

    for (int i = 0; i < XEP80_ROW_COUNT; i++) {
        xep->state.rows[i] = i;
    }

    memset(&xep->state.vram[VRAM_TAB_OFFSET], 0, XEP80_ROW_SIZE);
    xep->state.vram[VRAM_TAB_OFFSET + 2] = 1;
    for (int i = 7; i < XEP80_ROW_SIZE; i += 8) {
        xep->state.vram[VRAM_TAB_OFFSET + i] = 1;
    }
}

char xep80_vram_get(xep80_t *xep, uint8_t x, uint8_t y)
{
    uint8_t remaped_y = xep->state.rows[y] & 0x1F;
    uint8_t remaped_x = x + xep->state.x_scroll;

    return xep->state.vram[remaped_y * XEP80_ROW_SIZE + remaped_x];
}

void xep80_vram_set(xep80_t *xep, uint8_t x, uint8_t y, char ch)
{
    uint8_t remaped_y = xep->state.rows[y] & 0x1F;
    uint8_t remaped_x = x + xep->state.x_scroll;

    xep->state.vram[remaped_y * XEP80_ROW_SIZE + remaped_x] = ch;
}

void xep80_sync_cursor(xep80_t *xep)
{
    bool x_changed = xep->cur.x != xep->synced_cur.x;
    bool y_changed = xep->cur.y != xep->synced_cur.y;

    uint8_t x = MIN(xep->cur.x, XEP80_COL_COUNT - 1);
    uint8_t y = MIN(xep->cur.y, XEP80_ROW_COUNT - 1);

    if (x_changed && y_changed) {
        xep80_uart_send(0x180 | x);
        xep80_uart_send(0x1E0 | y);
    } else if (y_changed) {
        xep80_uart_send(0x1E0 | y);
    } else {
        xep80_uart_send(0x100 | x);
    }

    xep->synced_cur = xep->cur;
}

bool xep80_last_row_in_line(xep80_t *xep, uint8_t y)
{
    return y >= XEP80_STATUS_LINE || xep80_vram_get(xep, xep->r_margin, y) == 0x9B;
}
