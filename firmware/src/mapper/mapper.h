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

#include <stdbool.h>

#include <bthid/report_map.h>

#include <io/io_pin.h>
#include <io/io_pot.h>

#define HAT_SWITCH_UP    0x01
#define HAT_SWITCH_DOWN  0x02
#define HAT_SWITCH_LEFT  0x04
#define HAT_SWITCH_RIGHT 0x08

// Configuration of digital inputs
typedef struct {
    // Source field in the HID report
    hrm_usage_t source;
    // Invert the logical value or direction
    bool invert;
    // Hat switch mask (HAT_SWITCH_xxx)
    // Only used if the source is HRM_USAGE_HAT_SWITCH
    uint8_t hat_switch;
    // Threshold in percent to determine the logical value
    uint8_t threshold;
    // Hysteresis in percent
    uint8_t hysteresis;
} mapper_pin_config_t;

// Configuration of analog inputs (potentiometers)
typedef struct {
    // Source field
    hrm_usage_t source;
    // Pot value for logical min (IO_POT_MIN_VAL .. IO_POT_MAX_VAL)
    int16_t low;
    // Pot value for logical max (IO_POT_MIN_VAL .. IO_POT_MAX_VAL)
    int16_t high;
} mapper_pot_config_t;

typedef enum {
    // Interpret source as relative value (i.e. change since last report)
    MAPPER_INTG_MODE_REL = 0,
    // Interpret source as absolute value (i.e. deviation from center)
    MAPPER_INTG_MODE_ABS = 1,
} mapper_intr_mode_t;

// Configuration of integrators
typedef struct {
    // Source field
    hrm_usage_t source;
    // Source interpretation mode
    mapper_intr_mode_t mode;
    // Dead zone around 0 to prevent drift (in percent, 0..100)
    // The dead zone is only applied in ABS mode
    uint8_t dead_zone;
    // Gain applied to integrated delta values (Q7.8 format)
    // (may be negative for reverse direction)
    int16_t gain;
    // Maximum accumulated delta in steps
    int16_t max;
} mapper_intg_config_t;

// Configuration for all inputs of joystick port
typedef struct {
    mapper_pin_config_t pin[IO_PIN_COUNT];
    mapper_pot_config_t pot[IO_POT_COUNT];
    mapper_intg_config_t intg[IO_ENC_COUNT];
} mapper_profile_t;

#define MAPPER_MAX_PROFILES 4

// Initialize the HID mapper
//
// Returns 0 on success, error code otherwise
int mapper_init(void);

// Get profile at index
//
// Returns 0 on success, error code otherwise
int mapper_get_profile(int idx, mapper_profile_t *profile);

// Set profile at index
//
// Returns 0 on success, error code otherwise
int mapper_set_profile(int idx, const mapper_profile_t *profile, bool save);

// Processes a report received from a HID device
void mapper_process_report(int profile_idx, const uint8_t *data, const hrm_report_t *report);
