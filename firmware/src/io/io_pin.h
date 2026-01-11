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
#include <stdint.h>

// Number of emulated digital pins
#define IO_PIN_COUNT 5
// Number of quadrature encoders
#define IO_ENC_COUNT 2

typedef enum {
    IO_PIN_MODE_NORMAL,
    IO_PIN_MODE_ENCODER,
} io_pin_mode_t;

typedef struct {
    // Pin mode
    io_pin_mode_t mode;
    // Encoder index (if mode == IO_PIN_MODE_ENCODER)
    uint8_t enc_idx;
    // Encoder phase (0 => A, 1 => B)
    uint8_t enc_phase;
} io_pin_config_t;

// Initializes joystick digital pin outputs
int io_pin_init(void);

typedef enum {
    IO_PIN_UP,
    IO_PIN_DOWN,
    IO_PIN_LEFT,
    IO_PIN_RIGHT,
    IO_PIN_TRIG,
} io_pin_t;

// Sets joystick direction buttons
void io_pin_set(io_pin_t pin, bool active);

// Sets pin configuration
void io_pin_configure(io_pin_t pin, const io_pin_config_t *config);

// Adds or subtracts steps from the encoder position
// delta - change in steps in Q17.14 format
// max - maximum absolute value
void io_pin_update_encoder(uint8_t enc_idx, int32_t delta, int32_t max);
