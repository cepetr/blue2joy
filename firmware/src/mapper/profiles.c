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

#include <io/io_pin.h>

#include "profiles.h"

// Xbox wireless controller buttons
//  1 - A   5 - Y   9 -        13 - GUIDE
//  2 - B   6 -     10 -       14 - LSB
//  3 -     7 - LB  11 - VIEW  15 - RSB
//  4 - X   8 - RB  12 - MENU  16 -

// Joystick emulation with a gamepad
// Left gamepad joystick -> up/down/left/right intputs
// Right trigger-> trigger input
const mapper_profile_t profile_joy_analog = {
    .pin[IO_PIN_UP] = {.source = HRM_USAGE_Y, .threshold = 30, .hysteresis = 2, .invert = true},
    .pin[IO_PIN_DOWN] = {.source = HRM_USAGE_Y, .threshold = 70, .hysteresis = 2},
    .pin[IO_PIN_LEFT] = {.source = HRM_USAGE_X, .threshold = 30, .hysteresis = 2, .invert = true},
    .pin[IO_PIN_RIGHT] = {.source = HRM_USAGE_X, .threshold = 70, .hysteresis = 2},
    .pin[IO_PIN_TRIG] = {.source = HRM_USAGE_ACCELL, .threshold = 20, .hysteresis = 2},
    .pot[0] = {.source = HRM_USAGE_Z, .low = 0, .high = 228},
    .pot[1] = {.source = HRM_USAGE_RZ, .low = 0, .high = 228},
};

// Joystick emulation with a gamepad hat switch
// Hat switch -> up/down/left/right intputs
// Main button (button 1) -> trigger input
const mapper_profile_t profile_joy_hatswitch = {
    .pin[IO_PIN_UP] = {.source = HRM_USAGE_HAT_SWITCH, .hat_switch = HAT_SWITCH_UP},
    .pin[IO_PIN_DOWN] = {.source = HRM_USAGE_HAT_SWITCH, .hat_switch = HAT_SWITCH_DOWN},
    .pin[IO_PIN_LEFT] = {.source = HRM_USAGE_HAT_SWITCH, .hat_switch = HAT_SWITCH_LEFT},
    .pin[IO_PIN_RIGHT] = {.source = HRM_USAGE_HAT_SWITCH, .hat_switch = HAT_SWITCH_RIGHT},
    .pin[IO_PIN_TRIG] = {.source = HRM_USAGE_BUTTON_1},
};

// Emulation of paddles with a gamepad (tested with Arkanoid)
// (direct mapping of joystick to paddle values)
const mapper_profile_t profile_arkanoid = {
    .pin[IO_PIN_UP] = {.source = HRM_USAGE_BUTTON_2},
    .pin[IO_PIN_DOWN] = {.source = HRM_USAGE_BUTTON_4},
    .pin[IO_PIN_LEFT] = {.source = HRM_USAGE_BUTTON_5},
    .pin[IO_PIN_RIGHT] = {.source = HRM_USAGE_BUTTON_8},
    .pin[IO_PIN_TRIG] = {.source = HRM_USAGE_BUTTON_1},
    .pot[0] = {.source = HRM_USAGE_X, .low = 228, .high = 114},
    .pot[1] = {.source = HRM_USAGE_Y, .low = 228, .high = 114},
};

// Emulation of CX77 touch pad with a gamepad
// (joystick deflection is integrated)
const mapper_profile_t profile_cx77 = {
    .pin[IO_PIN_UP] = {.source = HRM_USAGE_BUTTON_2},
    .pin[IO_PIN_DOWN] = {.source = HRM_USAGE_BUTTON_4},
    .pin[IO_PIN_LEFT] = {.source = HRM_USAGE_BUTTON_5},
    .pin[IO_PIN_RIGHT] = {.source = HRM_USAGE_BUTTON_8},
    .pin[IO_PIN_TRIG] = {.source = HRM_USAGE_BUTTON_1},
    .pot[0] = {.source = HRM_USAGE_X, .low = 1, .high = 228},
    .pot[1] = {.source = HRM_USAGE_Y, .low = 1, .high = 228},
};

// Mouse
const mapper_profile_t profile_mouse = {
    .pin[IO_PIN_UP] = {.source = HRM_USAGE_BUTTON_2},
    .pin[IO_PIN_DOWN] = {.source = HRM_USAGE_BUTTON_3},
    .pin[IO_PIN_LEFT] = {.source = HRM_USAGE_BUTTON_4},
    .pin[IO_PIN_RIGHT] = {.source = HRM_USAGE_BUTTON_5},
    .pin[IO_PIN_TRIG] = {.source = HRM_USAGE_BUTTON_1},
    .pot[0] = {.source = HRM_USAGE_X, .low = -1710, .high = 1938},
    .pot[1] = {.source = HRM_USAGE_Y, .low = -1710, .high = 1938},
};
