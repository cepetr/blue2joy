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
#include <stdlib.h>

#include "event_queue.h"

int event_queue_init(event_queue_t *q)
{
    memset(q, 0, sizeof(event_queue_t));

    int err = k_mutex_init(&q->mutex);
    if (err) {
        return err;
    }

    return 0;
}

bool event_queue_is_empty(event_queue_t *q)
{
    k_mutex_lock(&q->mutex, K_FOREVER);
    bool is_empty = (q->head == q->tail);
    k_mutex_unlock(&q->mutex);
    return is_empty;
}

static bool events_matches(const event_t *a, const event_t *b)
{
    if (a->subject != b->subject) {
        return false;
    }

    switch (a->subject) {
    case EV_SUBJECT_ADV_LIST:
    case EV_SUBJECT_DEV_LIST:
    case EV_SUBJECT_CONN_ERROR:
        return bt_addr_le_cmp(&a->addr, &b->addr) == 0;
    case EV_SUBJECT_PROFILE:
        return a->idx == b->idx;
    default:
        return true;
    }

    return false;
}

int event_queue_push(event_queue_t *q, const event_t *ev)
{
    k_mutex_lock(&q->mutex, K_FOREVER);

    // Check for existing event with the same id
    size_t pos = q->head;
    while (pos != q->tail) {
        if (events_matches(&q->items[pos], ev)) {
            // Found existing event
            if (ev->action == EV_ACTION_DELETE && q->items[pos].action == EV_ACTION_CREATE) {
                // Remove existing event
                size_t read_pos = (pos + 1) % EVQ_CAPACITY;
                size_t write_pos = pos;

                while (read_pos != q->tail) {
                    q->items[write_pos] = q->items[read_pos];
                    write_pos = (write_pos + 1) % EVQ_CAPACITY;
                    read_pos = (read_pos + 1) % EVQ_CAPACITY;
                }

                q->tail = write_pos;
            } else {
                // Update existing event
                q->items[pos] = *ev;
            }

            k_mutex_unlock(&q->mutex);
            return 0;
        }
        pos = (pos + 1) % EVQ_CAPACITY;
    }

    // No existing event found, add new event
    size_t next_tail = (q->tail + 1) % EVQ_CAPACITY;
    if (next_tail == q->head) {
        // Queue full
        k_mutex_unlock(&q->mutex);
        return -ENOMEM;
    }

    q->items[q->tail] = *ev;
    q->tail = next_tail;

    k_mutex_unlock(&q->mutex);
    return 0;
}

void event_queue_remove(event_queue_t *q, const event_t *ev)
{
    k_mutex_lock(&q->mutex, K_FOREVER);

    size_t read_pos = q->head;
    size_t write_pos = q->head;

    while (read_pos != q->tail) {
        if (events_matches(&q->items[read_pos], ev)) {
            // keep this item
            if (write_pos != read_pos) {
                q->items[write_pos] = q->items[read_pos];
            }
            write_pos = (write_pos + 1) % EVQ_CAPACITY;
        }
        read_pos = (read_pos + 1) % EVQ_CAPACITY;
    }

    q->tail = write_pos;

    k_mutex_unlock(&q->mutex);
}

bool event_queue_pop(event_queue_t *q, event_t *ev)
{
    k_mutex_lock(&q->mutex, K_FOREVER);

    if (q->head == q->tail) {
        // queue empty
        k_mutex_unlock(&q->mutex);
        return false;
    }

    *ev = q->items[q->head];
    q->head = (q->head + 1) % EVQ_CAPACITY;

    k_mutex_unlock(&q->mutex);
    return true;
}
