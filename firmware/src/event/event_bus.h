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

#include "event.h"

// Callback function type for event subscribers
typedef void (*event_bus_cb_t)(void *context, const event_t *ev);

// Initialize the event bus
// Returns 0 on success, error code otherwise
int event_bus_init(void);

// Publish an event to all subscribers
void event_bus_publish(const event_t *ev);

// Subscribe to all events on the event bus
// Returns 0 on success, -ENOMEM if the subscriber list is full
int event_bus_subscribe(event_bus_cb_t callback, void *context);

// Unsubscribe from events on the event bus
// If the subscriber is not found, does nothing
void event_bus_unsubscribe(event_bus_cb_t callback, void *context);