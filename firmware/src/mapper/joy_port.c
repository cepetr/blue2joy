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

#include <zephyr/kernel.h>

#include <event/event_bus.h>

#include "joy_port.h"

typedef struct {
    joy_port_mode_t mode;
} joy_port_t;

static joy_port_t g_joy_port;

int joy_port_init(void)
{
    joy_port_t *port = &g_joy_port;

    memset(port, 0, sizeof(joy_port_t));

    return 0;
}

void joy_port_get_state(event_joy_port_t *state)
{
    joy_port_t *port = &g_joy_port;

    state->mode = port->mode;

    // Gather pin states
    for (int i = 0; i < IO_PIN_COUNT; i++) {
        if (io_pin_get(i)) {
            state->pins |= (1 << i);
        }
    }

    // Gather pot states
    for (int i = 0; i < IO_POT_COUNT; i++) {
        state->pots[i] = io_pot_get(i);
    }
}

static void joy_port_publish_state(void)
{
    event_t ev = {
        .subject = EV_SUBJECT_JOY_PORT_STATE,
        .action = EV_ACTION_UPDATE,
    };

    joy_port_get_state(&ev.joy_port);

    event_bus_publish(&ev);
}

int joy_port_set_mode(uint8_t mode)
{
    joy_port_t *port = &g_joy_port;

    if (mode >= JOY_PORT_MODE_MAX) {
        return -EINVAL;
    }

    if (mode != port->mode) {
        port->mode = mode;

        // !@# todo

        joy_port_publish_state();
    }

    return 0;
}

void joy_port_set_pin(io_pin_t pin, bool active)
{
    bool prev_state = io_pin_get(pin);

    if (prev_state != active) {
        io_pin_set(pin, active);
        joy_port_publish_state();
    }
}

void joy_port_set_pot(uint8_t pot_idx, int value)
{
    int prev_state = io_pot_get(pot_idx);

    if (prev_state != value) {
        io_pot_set(pot_idx, value);
        joy_port_publish_state();
    }
}

void joy_port_configure_pin(io_pin_t pin, const io_pin_config_t *config)
{
    io_pin_configure(pin, config);
}

void joy_port_update_pin_encoder(uint8_t enc_idx, int32_t delta, int32_t max)
{
    io_pin_update_encoder(enc_idx, delta, max);
}

void joy_port_update_pot_encoder(uint8_t pot_idx, int32_t delta, int32_t max)
{
    io_pot_update_encoder(pot_idx, delta, max);
}
