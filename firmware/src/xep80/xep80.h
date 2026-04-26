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

#include <stddef.h>
#include <stdint.h>

typedef struct xep80_update_client xep80_update_client_t;
typedef void (*xep80_update_callback_t)(void *context);

// Initializes XEP80 support
int xep80_init(void);

// Activates XEP80 functionality
// (starts serial communication on D0/D1 pins)
int xep80_activate(void);

// Deactivates XEP80 functionality
// (releases D0/D1 pins for other uses)
void xep80_deactivate(void);

// Builds an XEP80 update message to be sent to the client
// Returns the size of the message in bytes, or 0 if there is nothing to send
size_t xep80_build_update_message(uint8_t *buf, size_t buf_size, xep80_update_client_t *client);

// Registers a callback to be called when XEP80 state is updated and
// an update notification should be sent to the client.
// Returns 0 on success or -ENOMEM when no client slots are available.
int xep80_register_update_callback(xep80_update_callback_t callback, void *context,
                                   xep80_update_client_t **client);

// Unregisters a previously registered update callback.
void xep80_unregister_update_callback(xep80_update_client_t *client);
