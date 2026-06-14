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

#include <io/io_pin.h>
#include <io/io_pot.h>
#include <event/event.h>

// `joy_port` is an abstraction over the physical joystick port.
//
// It manages all available modes (normal GPIO, SPI, UART) and provides interface
// to set pin and pot states.
//
// Instead of calling io_pin/io_pot functions directly, the mapper and other modules
// should use joy_port functions.

int joy_port_init(void);

typedef enum {
    JOY_PORT_MODE_NORMAL = 0,
    JOY_PORT_MODE_SPI = 1,
    JOY_PORT_MODE_UART = 2,
    JOY_PORT_MODE_MAX
} joy_port_mode_t;

int joy_port_set_mode(joy_port_mode_t mode);

void joy_port_set_pin(io_pin_t pin, bool active);

void joy_port_configure_pin(io_pin_t pin, const io_pin_config_t *config);

void joy_port_update_pin_encoder(uint8_t enc_idx, int32_t delta, int32_t max);

void joy_port_set_pot(uint8_t pot_idx, int value);

void joy_port_update_pot_encoder(uint8_t pot_idx, int32_t delta, int32_t max);

void joy_port_get_state(event_joy_port_t *state);

void joy_port_send_keypress(uint8_t keycode);