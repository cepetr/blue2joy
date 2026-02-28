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

#include <io/xep80_uart.h>

#include "xep80_internal.h"

// Moves cursor vertically up to the start of the current logical line
// (horizonal position is not changed)
static void move_to_logical_start(xep80_t *xep)
{
    while (xep->cur.y > 0 && !xep80_last_row_in_line(xep, xep->cur.y - 1)) {
        xep->cur.y--;
    }
}

// Reads character at current cursor position and
// advances cursor to the next position,
static void read_char_and_advance(xep80_t *xep)
{
    xep80_uart_send(xep80_vram_get(xep, xep->cur.x, xep->cur.y));

    if (xep->cur.x < xep->r_margin) {
        xep->cur.x++;
    } else {
        xep->cur.x = xep->l_margin;
        if (xep->cur.y < XEP80_STATUS_LINE) {
            xep->cur.y++;
        } else {
            xep->cur.y = 0;
        }
    }

    xep80_sync_cursor(xep);
}

static void set_character_set(xep80_t *xep, uint8_t charset)
{
    if (charset > 2) {
        return;
    }

    xep->state.srow = xep->state.rows[XEP80_STATUS_LINE] * XEP80_ROW_SIZE;

    if (charset < 2) {
        xep->state.vcr |= 0x80; // External charset
    } else {
        xep->state.vcr &= ~0x80; // Internal charset
    }

    for (int i = 0; i < XEP80_ROW_COUNT; i++) {
        xep->state.rows[i] = (xep->state.rows[i] & 0x9F) | (charset << 5);
    }
}

void xep80_process_cmd(xep80_t *xep, uint16_t cmd)
{
    switch (cmd) {
    case 0x199: // Set graphics
        break;

    case 0x19A: // Modify graphics to 50Hz
        break;

    case 0x1C0:
        read_char_and_advance(xep);
        break;

    case 0x1C1:
        // Read horizontal position
        xep80_uart_send(xep->cur.x);
        break;

    case 0x1C2:
        // Master reset
        xep80_reset(xep);
        xep80_uart_send(0x01);
        break;

    case 0x1C3:
        // Get printer status
        xep80_uart_send(0x01);
        break;

    case 0x1C4:
        // Fill VRAM with the most recently received character
        memset(xep->state.vram, xep->last_char, sizeof(xep->state.vram));
        xep80_uart_send(0x01);
        break;

    case 0x1C5:
        // Fill VRAM with spaces
        memset(xep->state.vram, 0x20, sizeof(xep->state.vram));
        xep80_uart_send(0x01);
        break;

    case 0x1C6:
        // Fill VRAM with EOL (0x9B)
        memset(xep->state.vram, 0x9B, sizeof(xep->state.vram));
        xep80_uart_send(0x01);
        break;

    case 0x1C7:
        // Read char at cursor position without advancing cursor
        xep80_uart_send(xep80_vram_get(xep, xep->cur.x, xep->cur.y));
        break;

    case 0x1D0:
        // Clear list flag
        xep->escape_mode = false;
        break;

    case 0x1D1:
        xep->escape_mode = true;
        break;

    case 0x1D2:
        // Disable burst mode
        xep->burst_mode = false;
        xep->printer_mode = false;
        break;

    case 0x1D3:
        // Enable burst mode
        xep->burst_mode = true;
        xep->printer_mode = false;
        break;

    case 0x1D4:
        // Set ATASCII character set
        set_character_set(xep, 0);
        break;

    case 0x1D5:
        // Set international character set
        set_character_set(xep, 1);
        break;

    case 0x1D6:
        // Set internal character set
        set_character_set(xep, 2);
        break;

    case 0x1D7:
        // Modify text display to 50Hz
        // !@# TODO
        break;

    case 0x1D8:
        // Cursor off
        // !@# TODO
        break;

    case 0x1D9:
        // Cursor on
        // !@# TODO
        break;

    case 0x1DA:
        // Cursor blink off
        // !@# TODO
        break;

    case 0x1DB:
        move_to_logical_start(xep);
        break;

    case 0x1DC:
        // Scroll window`
        // !@# TODO
        break;

    case 0x1DD:
        // Redirect character output to printer
        xep->printer_mode = true;
        xep->burst_mode = true;
        break;

    case 0x1DE:
        // White on black
        xep->state.vcr &= ~0x08; // Reverse video flag
        break;

    case 0x1DF:
        // Black on white
        xep->state.vcr |= 0x08; // Reverse video flag
        break;

    case 0x1F4:
        // Set attribute latch 0
        xep->state.attr0 = xep->last_char;
        break;

    case 0x1F5:
        // Set attribute latch 1
        xep->state.attr1 = xep->last_char;
        break;

    default:
        if (cmd >= 0x100 && cmd <= 0x14F) {
            // Set horizontal position (0-79)
            xep->cur.x = cmd & 0xFF;
            xep->synced_cur = xep->cur;
        } else if (cmd >= 0x150 && cmd <= 0x15F) {
            // Set horizontal cur position
            xep->cur.x = (xep->cur.x & 0x0F) | ((cmd & 0xF) << 4);
            xep->synced_cur = xep->cur;
        } else if (cmd >= 0x160 && cmd <= 0x16F) {
            // Set left margin (low nibble)
            xep->l_margin = cmd & 0xF;
        } else if (cmd >= 0x170 && cmd <= 0x17F) {
            // Set left margin (high nibble)
            xep->l_margin = (xep->l_margin & 0x0F) | ((cmd & 0xF) << 4);
        } else if (cmd >= 0x180 && cmd <= 0x197) {
            // Set vertical position (0-23)
            xep->cur.y = cmd & 0x1F;
            xep->synced_cur = xep->cur;
        } else if (cmd == 0x198) {
            // Set status line

            // XEP80.SYS driver occasinaly sends unexpected 0x198 command
            // that completely messes up the screen, so ignore it for now.
            // TODO: investigate and fix the root cause.

            // xep->cur.y = XEP80_STATUS_LINE;
            // xep->synced_cur = xep->cur;
        } else if (cmd >= 0x1A0 && cmd <= 0x1AF) {
            // Set right margin (low nibble)
            xep->r_margin = 0x40 + (cmd & 0xF);
        } else if (cmd >= 0x1B0 && cmd <= 0x1BF) {
            // Set right margin (high nibble)
            xep->r_margin = (xep->r_margin & 0x0F) | ((cmd & 0xF) << 4);
        }
    }
}
