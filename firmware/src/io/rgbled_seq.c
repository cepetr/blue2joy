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

#include <io/rgbled_seq.h>

// clang-format off
const rgbled_seq_t led_seq_error[] = {
    {100, COLOR_RED},
    {100, COLOR_OFF},
    {100, COLOR_RED},
    {100, COLOR_OFF},
    {100, COLOR_RED},
    {100, COLOR_OFF},
    {0},
};

const rgbled_seq_t led_seq_factory_reset[] = {
    {100, COLOR_YELLOW},
    {100, COLOR_OFF},
    {100, COLOR_YELLOW},
    {100, COLOR_OFF},
    {100, COLOR_YELLOW},
    {100, COLOR_OFF},
    {0},
};


const rgbled_seq_t led_seq_manual[] = {
    {0, COLOR_PURPLE},
};

const rgbled_seq_t led_seq_scanning[] = {
    {-1000, COLOR_CYAN},
    {-1000, COLOR_OFF},
    {0, COLOR_CYAN},
};

const rgbled_seq_t led_seq_pairing[] = {
    {-300, COLOR_CYAN},
    {-300, COLOR_OFF},
    {0, COLOR_CYAN},
};

const rgbled_seq_t led_seq_connecting[] = {
    {300, COLOR_GREEN},
    {300, COLOR_OFF},
    {0},
};

const rgbled_seq_t led_seq_ready[] = {
    {100, COLOR_GREEN},
    {0},
};

const rgbled_seq_t led_seq_idle[] = {
    {0, COLOR_WHITE},
};
// clang-format on
