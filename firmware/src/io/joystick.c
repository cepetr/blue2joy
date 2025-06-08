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

#include <zephyr/logging/log.h>
#include <zephyr/drivers/gpio.h>

#include "joystick.h"

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

static const struct gpio_dt_spec joy_d0 = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d0), gpios);
static const struct gpio_dt_spec joy_d1 = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d1), gpios);
static const struct gpio_dt_spec joy_d2 = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d2), gpios);
static const struct gpio_dt_spec joy_d3 = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d3), gpios);
static const struct gpio_dt_spec joy_trig = GPIO_DT_SPEC_GET(DT_ALIAS(joy_trig), gpios);

static const struct gpio_dt_spec joy_d0_fb = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d0_fb), gpios);
static const struct gpio_dt_spec joy_d1_fb = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d1_fb), gpios);
static const struct gpio_dt_spec joy_d2_fb = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d2_fb), gpios);
static const struct gpio_dt_spec joy_d3_fb = GPIO_DT_SPEC_GET(DT_ALIAS(joy_d3_fb), gpios);

void joystick_init(void)
{
    gpio_pin_configure_dt(&joy_d0, GPIO_OUTPUT_HIGH);
    gpio_pin_configure_dt(&joy_d1, GPIO_OUTPUT_HIGH);
    gpio_pin_configure_dt(&joy_d2, GPIO_OUTPUT_HIGH);
    gpio_pin_configure_dt(&joy_d3, GPIO_OUTPUT_HIGH);
    gpio_pin_configure_dt(&joy_trig, GPIO_OUTPUT_HIGH);

    gpio_pin_configure_dt(&joy_d0_fb, GPIO_INPUT | GPIO_PULL_UP);
    gpio_pin_configure_dt(&joy_d1_fb, GPIO_INPUT | GPIO_PULL_UP);
    gpio_pin_configure_dt(&joy_d2_fb, GPIO_INPUT | GPIO_PULL_UP);
    gpio_pin_configure_dt(&joy_d3_fb, GPIO_INPUT | GPIO_PULL_UP);
}

void joystick_set_up(bool active)
{
    gpio_pin_set_dt(&joy_d0, active ? 0 : 1);
}

void joystick_set_down(bool active)
{
    gpio_pin_set_dt(&joy_d1, active ? 0 : 1);
}

void joystick_set_left(bool active)
{
    gpio_pin_set_dt(&joy_d2, active ? 0 : 1);
}

void joystick_set_right(bool active)
{
    gpio_pin_set_dt(&joy_d3, active ? 0 : 1);
}

void joystick_set_trig(bool active)
{
    gpio_pin_set_dt(&joy_trig, active ? 0 : 1);
}
