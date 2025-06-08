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

#include <stdbool.h>

void joystick_init(void);

typedef enum {
    JOYSTICK_IO_MODE_NORMAL,
    JOYSTICK_IO_MODE_SPI,
    JOYSTICK_IO_MODE_UART,
} joystick_mode_t;

void joystick_set_mode(joystick_mode_t mode);

void joystick_set_up(bool active);
void joystick_set_down(bool active);
void joystick_set_left(bool active);
void joystick_set_right(bool active);
void joystick_set_trig(bool active);
