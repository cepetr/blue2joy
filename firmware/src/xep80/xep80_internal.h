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

#pragma once

#include <zephyr/kernel.h>
#include <zephyr/sys/ring_buffer.h>

#define XEP80_COL_COUNT 80
#define XEP80_ROW_COUNT 25

#define XEP80_ROW_SIZE 256

#define XEP80_STATUS_LINE         (XEP80_ROW_COUNT - 1)
#define XEP80_UPDATE_CLIENT_COUNT (CONFIG_BT_MAX_CONN + 1)

typedef struct {
    uint8_t x;
    uint8_t y;
} cursor_t;

typedef struct {
    // External RAM (25 rows * 256 chars per row, 80 chars for tabs, rest is for printer buffer)
    uint8_t vram[8192];

    // NCP405 registers
    uint8_t tcp[16];
    uint8_t scr;
    uint8_t vcr;
    uint16_t home;
    uint16_t begd;
    uint16_t endd;
    uint16_t srow;
    uint8_t attr0;
    uint8_t attr1;
    uint16_t curs;

    // Internal RAM
    uint8_t rows[XEP80_ROW_COUNT];
    uint8_t x_scroll;
} xep80_state_t;

typedef struct xep80_update_client {
    bool in_use;
    void (*callback)(void *context);
    void *context;
    xep80_state_t synced_state;
    size_t synced_ofs;
} xep80_update_client_t;

#define VRAM_TAB_OFFSET 0x1900

typedef struct {
    bool active;

    // Work item for processing received data
    struct k_work rx_work;
    // Ring buffer for received data
    struct ring_buf rx_rb;
    // Buffer for received data (used by ring buffer)
    uint8_t rx_buffer[2 * 32];

    // Video RAM (25 rows * 256 chars per row, 80 chars for tabs, rest is for printer buffer)
    xep80_state_t state;
    bool burst_mode;

    // the next char will be printed and not processed as special char
    bool escape_next;
    // all subsequent chars will be printed and not be processed as special chars
    bool escape_mode;

    bool printer_mode;

    // Whether the cursor is currently on or off
    bool cursor_on;
    // Current cursor position
    cursor_t cur;
    // Cursor position synchronized with Atari
    cursor_t synced_cur;

    // Left margin
    uint8_t l_margin;
    // Right margin
    uint8_t r_margin;

    // Most recently receive character with 9th bit not set
    char last_char;

    // TCP register index
    uint8_t tcp_register;

    // Mutex for synchronizing access to XEP80 state and update callback
    struct k_mutex mutex;

    // Registered update listeners, each with its own synchronization state.
    xep80_update_client_t update_clients[XEP80_UPDATE_CLIENT_COUNT];

} xep80_t;

extern xep80_t g_xep80;

void xep80_reset(xep80_t *xep);

char xep80_vram_get(xep80_t *xep, uint8_t x, uint8_t y);
void xep80_vram_set(xep80_t *xep, uint8_t x, uint8_t y, char ch);
void xep80_sync_cursor(xep80_t *xep);
bool xep80_last_row_in_line(xep80_t *xep, uint8_t y);

void xep80_process_cmd(xep80_t *xep, uint16_t cmd);
void xep80_process_char(xep80_t *xep, char ch);
