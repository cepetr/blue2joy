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

#include <stdint.h>

#define BTJP_MSG_TYPE_MASK 0x03

#define BTJP_MSG_TYPE_REQUEST  0
#define BTJP_MSG_TYPE_EVENT    1
#define BTJP_MSG_TYPE_RESPONSE 2
#define BTJP_MSG_TYPE_ERROR    3

typedef struct {
    uint8_t flags;
    uint8_t msg_id;
    uint8_t seq;
    uint8_t size;

} btjp_msg_header_t;

typedef struct {
    uint8_t code;
} btjp_rsp_error_t;

typedef enum {
    BTJP_ERR_NONE = 0,
    BTJP_ERR_UNKNOWN_MSG = 1,
    BTJP_ERR_INVALID_REQ = 2,
    BTJP_ERR_INVALID_ARG = 3,
} btjp_status_t;

// Message identifiers
typedef enum {
    BTJP_MSG_GET_API_VERSION = 0,
    BTJP_MSG_GET_SYS_INFO = 1,
    BTJP_MSG_SET_DEV_CONFIG = 2,
    BTJP_MSG_SET_PIN_CONFIG = 3,
    BTJP_MSG_SET_POT_CONFIG = 4,
    BTJP_MSG_SET_PROFILE = 5,
    BTJP_MSG_SET_MODE = 6,
    BTJP_MSG_START_SCANNING = 7,
    BTJP_MSG_STOP_SCANNING = 8,
    BTJP_MSG_CONNECT_DEVICE = 9,
    BTJP_MSG_DELETE_DEVICE = 10,
    BTJP_MSG_FACTORY_RESET = 11,

    // Events
    BTJP_MSG_EVT_SYS_STATE_UPDATE = 64,
    BTJP_MSG_EVT_IO_PORT_UPDATE = 65,
    BTJP_MSG_EVT_ADV_LIST_UPDATE = 66,
    BTJP_MSG_EVT_DEV_LIST_UPDATE = 67,
    BTJP_MSG_EVT_PROFILE_UPDATE = 68,

} btjp_msg_id_t;

// Pin identifiers
typedef enum {
    BTJP_PIN_UP = 0,
    BTJP_PIN_DOWN = 1,
    BTJP_PIN_LEFT = 2,
    BTJP_PIN_RIGHT = 3,
    BTJP_PIN_TRIGGER = 4,
} btjp_pin_id_t;

// Potentiometer identifiers
typedef enum {
    BTJP_POT_1 = 0,
    BTJP_POT_2 = 1,
} btjp_pot_id_t;

// Device address (mac address + type)
typedef struct {
    uint8_t val[7];
} btjp_dev_addr_t;

// --------------------------------------------------------------------------

typedef struct {
    uint8_t major;
    uint8_t minor;
} btjp_rsp_get_api_version_t;

// --------------------------------------------------------------------------

typedef struct {
    uint8_t hw_id[8];
    uint32_t hw_version;
    uint32_t sw_version;
} btjp_rsp_get_sys_info_t;

// --------------------------------------------------------------------------

typedef struct {
    btjp_dev_addr_t addr;
    uint8_t profile;
} btjp_req_set_dev_config_t;

// --------------------------------------------------------------------------

typedef struct {
    uint8_t profile;
    uint8_t pin_id;
    uint8_t _reserved[2];
    uint32_t source;
    uint8_t invert;
    uint8_t hat_switch;
    uint8_t threshold;
    uint8_t hysteresis;
} btjp_req_set_pin_config_t;

// --------------------------------------------------------------------------

typedef struct {
    uint8_t profile;
    uint8_t pin_id;
    uint8_t _reserved[2];
    uint32_t source;
    int16_t low;
    int16_t high;
    int16_t int_speed;
} btjp_req_set_pot_config_t;

// --------------------------------------------------------------------------

typedef struct {
    uint32_t source;
    uint8_t invert;
    uint8_t hat_switch;
    uint8_t threshold;
    uint8_t hysteresis;
} btjp_pin_config_t;

typedef struct {
    uint32_t source;
    int16_t low;
    int16_t high;
    int16_t int_speed;
    uint8_t _reserved[2];
} btjp_pot_config_t;

typedef struct {
    uint8_t profile;
    uint8_t _reserved[3];
    btjp_pin_config_t pins[5];
    btjp_pot_config_t pots[2];
} btjp_req_set_profile_t;

// --------------------------------------------------------------------------

typedef struct {
    uint8_t mode;
    uint8_t restart;
} btjp_req_set_mode_t;

// --------------------------------------------------------------------------

typedef struct {
    btjp_dev_addr_t addr;
} btjp_req_connect_device_t;

// --------------------------------------------------------------------------

typedef struct {
    btjp_dev_addr_t addr;
} btjp_req_delete_device_t;

// --------------------------------------------------------------------------

typedef struct {
    uint8_t scanning;
    uint8_t mode;
} btjp_evt_sys_state_update_t;

// --------------------------------------------------------------------------

typedef struct {
    uint8_t deleted;
    btjp_dev_addr_t addr;
    int8_t rssi;
    char name[30 + 1];
} btjp_evt_adv_list_update_t;

// --------------------------------------------------------------------------

typedef struct {
    uint8_t deleted;
    btjp_dev_addr_t addr;
    uint8_t conn_state;
    uint8_t profile;
} btjp_evt_dev_list_update_t;

// --------------------------------------------------------------------------

typedef struct {
    uint8_t profile;
    uint8_t _reserved;
    btjp_pin_config_t pins[5];
    btjp_pot_config_t pots[2];
} btjp_evt_profile_update_t;

// --------------------------------------------------------------------------

typedef struct {
    btjp_msg_header_t hdr;
    union {
        btjp_rsp_error_t error;
        btjp_rsp_get_api_version_t get_api_version;
        btjp_rsp_get_sys_info_t get_sys_info;
    };
} btjp_rsp_t;

typedef struct {
    btjp_msg_header_t hdr;
    union {
        btjp_req_set_dev_config_t set_dev_config;
        btjp_req_set_pin_config_t set_pin_config;
        btjp_req_set_pot_config_t set_pot_config;
        btjp_req_set_profile_t set_profile;
        btjp_req_set_mode_t set_mode;
        btjp_req_connect_device_t connect_device;
        btjp_req_delete_device_t delete_device;
    };
} btjp_req_t;

typedef struct {
    btjp_msg_header_t hdr;
    union {
        btjp_evt_sys_state_update_t sys_state_update;
        btjp_evt_adv_list_update_t adv_list_update;
        btjp_evt_dev_list_update_t dev_list_update;
        btjp_evt_profile_update_t profile_update;
    };

} btjp_evt_t;
