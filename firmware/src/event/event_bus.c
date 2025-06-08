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

#include "event_bus.h"

#define EVENT_BUS_MAX_SUBSCRIBERS 8

typedef struct {
    event_bus_cb_t callback;
    void *context;
} event_bus_subscriber_t;

typedef struct {
    struct k_mutex mutex;
    size_t subs_count;
    event_bus_subscriber_t subs[EVENT_BUS_MAX_SUBSCRIBERS];

} event_bus_t;

static event_bus_t g_evrouter;

int event_bus_init(void)
{
    event_bus_t *router = &g_evrouter;

    memset(router, 0, sizeof(event_bus_t));

    int err = k_mutex_init(&router->mutex);
    if (err) {
        return err;
    }

    return 0;
}

void event_bus_publish(const event_t *ev)
{
    event_bus_t *router = &g_evrouter;

    k_mutex_lock(&router->mutex, K_FOREVER);
    for (size_t i = 0; i < router->subs_count; i++) {
        event_bus_subscriber_t *sub = &router->subs[i];
        if (sub->callback) {
            sub->callback(sub->context, ev);
        }
    }
    k_mutex_unlock(&router->mutex);
}

int event_bus_subscribe(event_bus_cb_t callback, void *context)
{
    event_bus_t *router = &g_evrouter;

    k_mutex_lock(&router->mutex, K_FOREVER);

    if (router->subs_count >= EVENT_BUS_MAX_SUBSCRIBERS) {
        k_mutex_unlock(&router->mutex);
        return -ENOMEM;
    }

    event_bus_subscriber_t *sub = &router->subs[router->subs_count];
    sub->callback = callback;
    sub->context = context;
    router->subs_count++;

    k_mutex_unlock(&router->mutex);

    return 0;
}

void event_bus_unsubscribe(event_bus_cb_t callback, void *context)
{
    event_bus_t *router = &g_evrouter;

    k_mutex_lock(&router->mutex, K_FOREVER);
    for (size_t i = 0; i < router->subs_count; i++) {
        event_bus_subscriber_t *sub = &router->subs[i];
        if (sub->callback == callback && sub->context == context) {
            memmove(sub, sub + 1, (router->subs_count - i - 1) * sizeof(event_bus_subscriber_t));
            router->subs_count--;
            break;
        }
    }
    k_mutex_unlock(&router->mutex);
}
