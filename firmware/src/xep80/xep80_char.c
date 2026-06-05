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

#include "xep80_internal.h"

static void move_up(xep80_t *xep)
{
    if (xep->cur.y >= XEP80_STATUS_LINE) {
        return;
    }

    if (xep->cur.y > 0) {
        --xep->cur.y;
    } else {
        xep->cur.y = XEP80_STATUS_LINE - 1;
    }
}

static void move_down(xep80_t *xep)
{
    if (xep->cur.y >= XEP80_STATUS_LINE) {
        return;
    }

    if (xep->cur.y < XEP80_STATUS_LINE - 1) {
        ++xep->cur.y;
    } else {
        xep->cur.y = 0;
    }
}

static void move_left(xep80_t *xep)
{
    if (xep->cur.x > xep->l_margin) {
        --xep->cur.x;
    } else {
        xep->cur.x = xep->r_margin;
    }
}

static void move_right(xep80_t *xep)
{
    if (xep80_vram_get(xep, xep->cur.x, xep->cur.y) == 0x9B) {
        xep80_vram_set(xep, xep->cur.x, xep->cur.y, 0x20);
    }

    if (xep->cur.x >= xep->r_margin) {
        xep->cur.x = xep->l_margin;
    } else {
        ++xep->cur.x;
    }
}

static void clear_row(xep80_t *xep, uint8_t y)
{
    for (uint8_t x = 0; x < XEP80_COL_COUNT; x++) {
        xep80_vram_set(xep, x, y, 0x9B);
    }
}

static void clear_screen(xep80_t *xep)
{
    xep->cur.x = xep->l_margin;
    xep->cur.y = 0;
    for (int i = 0; i < XEP80_STATUS_LINE; i++) {
        clear_row(xep, i);
    }
}

// Move cursor back iside the current logical line, replace the char at the new cursor with space.
// Does nothing if the cursor is at the start of the logical line.
static void back_space(xep80_t *xep)
{
    if (xep->cur.x <= xep->l_margin) {
        if (xep->cur.y == 0 || xep80_last_row_in_line(xep, xep->cur.y - 1)) {
            return;
        }
        xep->cur.y--;
        xep->cur.x = xep->r_margin;
    } else {
        --xep->cur.x;
    }

    xep80_vram_set(xep, xep->cur.x, xep->cur.y, 0x20);
}

// Move all rows up from start_row, clear the last line
static void delete_row_and_scroll(xep80_t *xep, uint8_t row)
{
    if (row >= XEP80_STATUS_LINE) {
        return;
    }

    int row_count = XEP80_ROW_COUNT - 1;

    uint8_t tmp = xep->state.rows[row];
    for (int i = row; i < row_count - 1; i++) {
        xep->state.rows[i] = xep->state.rows[i + 1];
    }
    xep->state.rows[row_count - 1] = tmp;

    clear_row(xep, row_count - 1);
}

static void insert_row_and_scroll(xep80_t *xep, uint8_t row)
{
    if (row >= XEP80_STATUS_LINE) {
        return;
    }

    int row_count = XEP80_ROW_COUNT - 1;

    uint8_t tmp = xep->state.rows[row_count - 1];
    for (int i = row_count - 1; i > row; i--) {
        xep->state.rows[i] = xep->state.rows[i - 1];
    }
    xep->state.rows[row] = tmp;

    clear_row(xep, row);
}

// Insert new line at current line, move all lines down, clear the current line
static void insert_line(xep80_t *xep)
{
    if (xep->cur.y >= XEP80_STATUS_LINE) {
        return;
    }

    insert_row_and_scroll(xep, xep->cur.y);

    xep->cur.x = xep->l_margin;
}

static void delete_line(xep80_t *xep)
{
    if (xep->cur.y >= XEP80_STATUS_LINE) {
        return;
    }

    bool eol = false;

    while (!eol) {
        eol = xep80_last_row_in_line(xep, xep->cur.y);
        delete_row_and_scroll(xep, xep->cur.y);
    }
}

static void end_line(xep80_t *xep)
{
    xep->cur.x = xep->l_margin;

    if (xep->cur.y >= XEP80_STATUS_LINE) {
        return;
    }

    if (xep->cur.y < XEP80_STATUS_LINE - 1) {
        xep->cur.y++;
    } else {
        delete_row_and_scroll(xep, 0);
    }
}

// Insert char at current position, move all chars to right.
// Return the char that is moved out of the line
static char insert_char_into_row(xep80_t *xep, uint8_t x, uint8_t y, char ch)
{
    for (uint8_t i = x; i <= xep->r_margin; i++) {
        char next = xep80_vram_get(xep, i, y);
        xep80_vram_set(xep, i, y, ch);
        ch = next;
    }

    return ch;
}

// Insert space at current position, move all chars in the logical line to right.
// Current position is not changed.
static void insert_char(xep80_t *xep)
{
    if (xep->cur.y >= XEP80_STATUS_LINE) {
        return;
    }

    uint8_t x = xep->cur.x;
    uint8_t y = xep->cur.y;

    char ch = 0x20;

    while (y < XEP80_STATUS_LINE) {
        ch = insert_char_into_row(xep, x, y, ch);
        if (ch == 0x9B) {
            if (!xep80_last_row_in_line(xep, y)) {
                insert_row_and_scroll(xep, y + 1);
            }
            break;
        }
        x = xep->l_margin;
        ++y;
    }
}

// Deletes char from the row,
// moves all chars in the row left and
// inserts the given char at  the end of the row
static void delete_char_from_row(xep80_t *xep, uint8_t x, uint8_t y, char ch)
{
    for (uint8_t i = x; i < xep->r_margin; i++) {
        char next = xep80_vram_get(xep, i + 1, y);
        xep80_vram_set(xep, i, y, next);
    }
    xep80_vram_set(xep, xep->r_margin, y, ch);
}

// Delete char at current position, move all chars in the logical line to the left.
// Current position is not changed.
static void delete_char(xep80_t *xep)
{
    if (xep->cur.y >= XEP80_STATUS_LINE) {
        return;
    }

    uint8_t x = xep->cur.x;
    uint8_t y = xep->cur.y;

    while (y < XEP80_STATUS_LINE) {

        if (xep80_last_row_in_line(xep, y)) {
            delete_char_from_row(xep, x, y, 0x9B);
            break;
        } else {
            // char at the start of the next row is moved
            // to the end of the current row
            char ch = xep80_vram_get(xep, xep->l_margin, y + 1);
            delete_char_from_row(xep, x, y, ch);
            // If we shifted the EOL char, the next row becomes empty
            // and we can delete it
            if (ch == 0x9B) {
                delete_row_and_scroll(xep, y + 1);
                break;
            }
        }

        x = xep->l_margin;
        ++y;
    }
}

void write_char(xep80_t *xep, char ch)
{
    bool eol_overwrote = xep80_vram_get(xep, xep->cur.x, xep->cur.y) == 0x9B;

    xep80_vram_set(xep, xep->cur.x, xep->cur.y, ch);

    if (xep->cur.x < xep->r_margin) {
        xep->cur.x++;
    } else {
        // End of the row
        xep->cur.x = xep->l_margin;

        if (xep->cur.y >= XEP80_STATUS_LINE) {
            // In status line, do not advance to next line
        } else {
            if (xep->cur.y == XEP80_STATUS_LINE - 1) {
                // Last row inside scrolling region
                delete_row_and_scroll(xep, 0);
            } else if (eol_overwrote) {
                // Extend the logical line
                insert_row_and_scroll(xep, xep->cur.y + 1);
                xep->cur.y++;
            }
        }
    }
}

static void clear_tab(xep80_t *xep)
{
    xep->state.vram[VRAM_TAB_OFFSET + xep->cur.x] = 0;
}

static void set_tab(xep80_t *xep)
{
    xep->state.vram[VRAM_TAB_OFFSET + xep->cur.x] = 1;
}

static void apply_tab(xep80_t *xep)
{
    do {
        write_char(xep, 0x20);
    } while (!xep->state.vram[VRAM_TAB_OFFSET + xep->cur.x]);
}

static bool xep80_process_special_char(xep80_t *xep, char ch)
{
    switch (ch) {
    case 0x1B:
        xep->escape_next = true;
        break;

    case 0x1C:
        move_up(xep);
        break;

    case 0x1D:
        move_down(xep);
        break;

    case 0x1E:
        move_left(xep);
        break;

    case 0x1F:
        move_right(xep);
        break;

    case 0x7D:
        clear_screen(xep);
        break;

    case 0x7E:
        back_space(xep);
        break;

    case 0x7F:
        apply_tab(xep);
        break;

    case 0x9B:
        end_line(xep);
        break;

    case 0x9C:
        delete_line(xep);
        break;

    case 0x9D:
        insert_line(xep);
        break;

    case 0x9E:
        clear_tab(xep);
        break;

    case 0x9F:
        set_tab(xep);
        break;

    case 0xFD:
        // Bell - ignore
        break;

    case 0xFE:
        delete_char(xep);
        break;

    case 0xFF:
        insert_char(xep);
        break;

    default:
        // Not a special character
        return false;
    }

    return true;
}

void xep80_process_char(xep80_t *xep, char ch)
{
    if (xep->printer_mode) {
        // Printer mode not implemented
        return;
    }

    bool process_special = !xep->escape_next && (!xep->escape_mode || ch == (char)0x9B);

    if (process_special && xep80_process_special_char(xep, ch)) {
        // Special char processed, do not write to screen
        return;
    }

    write_char(xep, ch);
    xep->escape_next = false;
}
