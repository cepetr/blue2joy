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
#include <stddef.h>

// HID report usage definitions
typedef enum {
    HRM_USAGE_X = 0x010030,
    HRM_USAGE_Y = 0x010031,
    HRM_USAGE_Z = 0x010032,
    HRM_USAGE_RX = 0x010033,
    HRM_USAGE_RY = 0x010034,
    HRM_USAGE_RZ = 0x010035,
    HRM_USAGE_HAT_SWITCH = 0x010039,
    HRM_USAGE_ACCELL = 0x0200C4,
    HRM_USAGE_BRAKE = 0x0200C5,
    HRM_USAGE_BUTTON_1 = 0x090001,
    HRM_USAGE_BUTTON_2 = 0x090002,
    HRM_USAGE_BUTTON_3 = 0x090003,
    HRM_USAGE_BUTTON_4 = 0x090004,
    HRM_USAGE_BUTTON_5 = 0x090005,
    HRM_USAGE_BUTTON_6 = 0x090006,
    HRM_USAGE_BUTTON_7 = 0x090007,
    HRM_USAGE_BUTTON_8 = 0x090008,
    HRM_USAGE_BUTTON_9 = 0x090009,
    HRM_USAGE_BUTTON_10 = 0x09000A,
    HRM_USAGE_BUTTON_11 = 0x09000B,
    HRM_USAGE_BUTTON_12 = 0x09000C,
    HRM_USAGE_BUTTON_13 = 0x09000D,
    HRM_USAGE_BUTTON_14 = 0x09000E,
    HRM_USAGE_BUTTON_15 = 0x09000F,
    HRM_USAGE_BUTTON_16 = 0x090010,
    HRM_USAGE_BUTTON_17 = 0x090011,
    HRM_USAGE_BUTTON_18 = 0x090012,
    HRM_USAGE_BUTTON_19 = 0x090013,
    HRM_USAGE_BUTTON_20 = 0x090014,
    HRM_USAGE_BUTTON_21 = 0x090015,
    HRM_USAGE_BUTTON_22 = 0x090016,
    HRM_USAGE_BUTTON_23 = 0x090017,
    HRM_USAGE_BUTTON_24 = 0x090018,
    HRM_USAGE_BUTTON_25 = 0x090019,
    HRM_USAGE_BUTTON_26 = 0x09001A,
    HRM_USAGE_BUTTON_27 = 0x09001B,
    HRM_USAGE_BUTTON_28 = 0x09001C,
    HRM_USAGE_BUTTON_29 = 0x09001D,
    HRM_USAGE_BUTTON_30 = 0x09001E,
    HRM_USAGE_BUTTON_31 = 0x09001F,
    HRM_USAGE_BUTTON_32 = 0x090020,
    HRM_USAGE_BUTTON_PLAY = 0x0C00CD,
    HRM_USAGE_BUTTON_VOL_INC = 0x0C00E9,
    HRM_USAGE_BUTTON_VOL_DEC = 0x0C00EA,
} hrm_usage_t;

// HID report field definition
typedef struct {
    // Bit offset from the start of the report
    uint16_t bit_offset;
    // Size of the field in bits
    uint8_t bit_size;
    // Usage of the field, composed of usage page and usage ID
    hrm_usage_t usage;
    // Field logical minimum value
    int32_t logical_min;
    // Field logical maximum value
    int32_t logical_max;
} hrm_field_t;

// HID report definition
typedef struct {
    // ID of the report (found at the start of the report)
    uint8_t id;
    // Sum of the bit size of all fields in the report
    uint16_t bit_size;
    // Array of fields in the report
    hrm_field_t fields[32];
    // Number of fields in the report
    size_t field_count;
} hrm_report_t;

// HID report map definition
typedef struct {
    // List of reports
    hrm_report_t reports[4];
    // Number of reports in the report map
    size_t report_count;
} hrm_t;

// Parse HID report map into the list of reports and fields
void hrm_parse(hrm_t *hrm, const uint8_t *data, size_t size);

// Find a report by its ID in the report map
const hrm_report_t *hrm_find_report(const hrm_t *hrm, uint8_t report_id);

// Find a field by its usage ID in the report
const hrm_field_t *hrm_report_find_field(const hrm_report_t *report, hrm_usage_t usage);

// Extract the value of a field from the report data
int32_t hrm_field_extract(const hrm_field_t *field, const uint8_t *data);