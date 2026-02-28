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
size_t xep80_build_update_message(uint8_t *buf, size_t buf_size);

// Registers a callback to be called when XEP80 state is updated and
// an update notification should be sent to the client
void xep80_set_update_callback(void (*callback)(void *context), void *context);
