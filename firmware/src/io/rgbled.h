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

#include <zephyr/drivers/led_strip.h>

// Item in the RGB LED sequence
typedef struct {
    // Step duration in milliseconds
    // > 0  => hold color
    // < 0  => transition to the next color
    // == 0 => end of sequence
    int duration;
    // Color to set
    struct led_rgb color;
} rgbled_seq_t;

#define COLOR_OFF    ((const struct led_rgb){.r = 0x00, .g = 0x00, .b = 0x00})
#define COLOR_RED    ((const struct led_rgb){.r = 0xFF, .g = 0x00, .b = 0x00})
#define COLOR_GREEN  ((const struct led_rgb){.r = 0x00, .g = 0xFF, .b = 0x00})
#define COLOR_BLUE   ((const struct led_rgb){.r = 0x00, .g = 0x00, .b = 0xFF})
#define COLOR_YELLOW ((const struct led_rgb){.r = 0xFF, .g = 0xFF, .b = 0x00})
#define COLOR_PURPLE ((const struct led_rgb){.r = 0xFF, .g = 0x00, .b = 0xFF})
#define COLOR_CYAN   ((const struct led_rgb){.r = 0x00, .g = 0xFF, .b = 0xFF})
#define COLOR_WHITE  ((const struct led_rgb){.r = 0xFF, .g = 0xFF, .b = 0xFF})

// Initialize the RGB LED driver
int rgbled_init(void);

// Set global RGB LED brightness
// Brightness is a value from 0 to 10, where 0 is off and 10 is full brightness
void rgbled_set_brightness(uint8_t brightness);

// Set permanent RGB LED state for a specific device state
void rgbled_set_state(const rgbled_seq_t *seq);

// Set temporary RGB LED state for an event
void rgbled_set_event(const rgbled_seq_t *seq);
