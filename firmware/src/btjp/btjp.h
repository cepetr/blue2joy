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

#include <event/event_queue.h>

// Handles an incoming btjp message and prepares a response
size_t btjp_handle_message(const void *inbuff, size_t insize, void *outbuff, size_t outsize);

// Pops an event from the event queue and builds a btjp event message
size_t btjp_build_evt_message(void *outbuff, size_t outsize, event_queue_t *evq);

// Populates the event queue with initial events
void btjp_populate_event_queue(event_queue_t *evq);