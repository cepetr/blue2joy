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

typedef enum {
    IO_PIN_UP,
    IO_PIN_DOWN,
    IO_PIN_LEFT,
    IO_PIN_RIGHT,
    IO_PIN_TRIG,
} io_pin_t;

void joystick_set_mode(joystick_mode_t mode);

// Sets joystick direction buttons

void joystick_set(io_pin_t pin, bool active);

// Queues movement steps for horizontal and vertical quadrature encoder.
// Joystick module will process these steps in the timer interrupt
// and generate appropriate quadrature signals.
void joystick_queue_x_steps(int delta);
void joystick_queue_y_steps(int delta);