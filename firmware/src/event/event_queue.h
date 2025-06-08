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

#include <zephyr/kernel.h>

#include "event.h"

// Effective capacity of the event queue is EVQ_CAPACITY - 1
#define EVQ_CAPACITY 32

typedef struct {
    // Mutex to protect access to the queue
    struct k_mutex mutex;

    size_t head;
    size_t tail;
    event_t items[EVQ_CAPACITY];

} event_queue_t;

// Initializes the event queue structure
// Returns 0 on success, error code otherwise
int event_queue_init(event_queue_t *q);

// Inserts an event to the queue
//
// - If there's no event with the same id, a new event is added
// - If there's a event with the same id, it is updated or deleted
//
// Returns 0 on success, -ENOMEM if the queue is full
int event_queue_push(event_queue_t *q, const event_t *ev);

// Retrieves the oldest event from the queue
//
// Returns true if an event was popped, false if the queue is empty
bool event_queue_pop(event_queue_t *q, event_t *ev);

// Removes event with the specified id from the queue
/// If the event is not found, does nothing
void event_queue_remove(event_queue_t *q, const event_t *ev);

// Checks if the event queue is empty
bool event_queue_is_empty(event_queue_t *q);
