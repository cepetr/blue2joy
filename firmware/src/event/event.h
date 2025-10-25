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

#include <zephyr/bluetooth/addr.h>

// Describes how a subject changed.
// For pure notifications, use UPDATE or ignore.
typedef enum {
    EV_ACTION_UPDATE, // Subject's state changed
    EV_ACTION_CREATE, // New subject instance appeared
    EV_ACTION_DELETE, // Subject instance was removed
} event_action_t;

// Describes what changed or what happened.
// Used to route events to interested parts of the system.
typedef enum {
    EV_SUBJECT_SYS_STATE,  // System state changed
    EV_SUBJECT_ADV_LIST,   // Scan results list changed
    EV_SUBJECT_DEV_LIST,   // Manager HID devices
    EV_SUBJECT_PROFILE,    // Mapping/profile changed
    EV_SUBJECT_IO_STATE,   // Joystick/paddle output state changed
    EV_SUBJECT_CONN_ERROR, // A connection-related error occurred
} event_subject_t;

typedef struct {
    // What the event is about
    event_subject_t subject;
    // How it changed (CREATE/DELETE only for subjects that support lifecycle; otherwise UPDATE)
    event_action_t action;
    // Identifier of the affected entity:
    // - use addr for ADV_LIST, DEV_LIST, CONN_ERROR
    // - use idx for PROFILE, IO_STATE
    union {
        bt_addr_le_t addr;
        uint8_t idx;
    };
} event_t;
