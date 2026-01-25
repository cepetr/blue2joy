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

#define IO_POT_MIN_VAL 2
#define IO_POT_MAX_VAL 228

// Number of emulated analog potentiometers
#define IO_POT_COUNT 2

// Pot operation modes
typedef enum {
    IO_PIN_NORMAL,  // Normal operation
    IO_PIN_ENCODER, // Use as encoder output
} io_pot_mode_t;

// Initializes joystick analog potentiometer outputs
int io_pot_init(void);

// Sets potentiometer value (IO_POT_MIN_VAL .. IO_POT_MAX_VAL)
void io_pot_set(uint8_t pot_idx, int value);

// Adds or subtracts steps from the encoder position
// delta - change in steps in Q17.14 format
// max - maximum absolute value
void io_pot_update_encoder(uint8_t pot_idx, int32_t delta, int32_t max);