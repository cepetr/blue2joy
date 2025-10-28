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

#include <zephyr/drivers/gpio.h>
#include <zephyr/logging/log.h>
#include <zephyr/input/input.h>

#include <devmgr/devmgr.h>
#include <btsvc/btsvc.h>

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

static const struct gpio_dt_spec button1 = GPIO_DT_SPEC_GET(DT_ALIAS(button_1), gpios);
static const struct gpio_dt_spec button2 = GPIO_DT_SPEC_GET(DT_ALIAS(button_2), gpios);

static void input_cb(struct input_event *evt, void *user_data)
{
    ARG_UNUSED(user_data);

    bool pressed = evt->value != 0;
    int keycode = evt->code;

    if (pressed) {
        LOG_INF("Button pressed {keycode: %d}", keycode);
    } else {
        LOG_INF("Button released {keycode: %d}", keycode);
    }

    if (pressed && keycode == INPUT_KEY_R) {
        // Disconnect from all devices first and start scanning
        devmgr_set_mode(DEVMGR_MODE_AUTO, true);
    } else if (pressed && keycode == INPUT_KEY_P) {
        // Disconnect from all devices first and start scanning in pairing mode
        devmgr_set_mode(DEVMGR_MODE_PAIRING, true);
    } else if (pressed && keycode == INPUT_KEY_A) {
        // Enable/disable advertising
        if (btsvc_is_advertising()) {
            btsvc_stop_advertising();
        } else {
            btsvc_start_advertising();
        }
    } else if (pressed && keycode == INPUT_KEY_B) {
        // Switch profiles if connected
        // !@# TODO
    }
}

INPUT_CALLBACK_DEFINE(NULL, input_cb, NULL);

bool factory_reset_detected(void)
{
    bool pressed = gpio_pin_get_dt(&button1) != 0 && gpio_pin_get_dt(&button2) != 0;
    return pressed;
}
