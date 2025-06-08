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

#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/settings/settings.h>
#include <zephyr/storage/flash_map.h>

#include <zephyr/logging/log.h>
#include <app_version.h>

#include <bthid/bthid.h>
#include <btsvc/btsvc.h>
#include <io/buttons.h>
#include <io/rgbled_seq.h>
#include <io/joystick.h>
#include <io/paddle.h>
#include <io/spislave.h>
#include <mapper/mapper.h>
#include <mapper/profiles.h>
#include <devmgr/devmgr.h>
#include <event/event_bus.h>

LOG_MODULE_REGISTER(blue2joy);

static int erase_storage_partition(void)
{
    const struct flash_area *fa;
    int err = flash_area_open(FIXED_PARTITION_ID(storage_partition), &fa);
    if (err) {
        return err;
    }
    err = flash_area_erase(fa, 0, fa->fa_size); /* erase the whole partition */
    flash_area_close(fa);
    return err;
}

static void event_callback(void *context, const event_t *ev)
{
    if (ev->subject == EV_SUBJECT_SYS_STATE || ev->subject == EV_SUBJECT_DEV_LIST) {
        devmgr_state_t state;
        devmgr_get_state(&state);

        if (state.mode == DEVMGR_MODE_MANUAL) {
            rgbled_set_state(led_seq_manual);
        } else if (state.scanning) {
            if (state.mode == DEVMGR_MODE_PAIRING) {
                rgbled_set_state(led_seq_pairing);
            } else {
                rgbled_set_state(led_seq_scanning);
            }
        } else if (devmgr_is_connecting()) {
            rgbled_set_state(led_seq_connecting);
        } else if (devmgr_is_ready()) {
            rgbled_set_state(led_seq_ready);
        } else {
            rgbled_set_state(led_seq_idle);
        }
    } else if (ev->subject == EV_SUBJECT_CONN_ERROR) {
        rgbled_set_event(led_seq_error);
    }
}

int main(void)
{
    int err;

    LOG_INF("Blue2Joy %s", APP_VERSION_STRING);

    err = rgbled_init();
    if (err) {
        LOG_ERR("RGB LED init failed {err: %d}", err);
        return 0;
    }

    bool factory_reset = factory_reset_detected();

    if (factory_reset) {
        LOG_INF("Performing factory reset");
        err = erase_storage_partition();
        if (!err) {
            rgbled_set_event(led_seq_factory_reset);
        } else {
            LOG_ERR("Failed to erase storage partition {err: %d}", err);
        }
    }

    err = event_bus_init();
    if (err) {
        LOG_ERR("Event bus init failed {err: %d}", err);
        return 0;
    }

    err = event_bus_subscribe(event_callback, NULL);
    if (err) {
        LOG_ERR("Event bus subscribe failed {err: %d}", err);
        return 0;
    }

    joystick_init();
    paddle_init();

    err = mapper_init();
    if (err) {
        LOG_ERR("I/O mapper init failed {err: %d}", err);
        return 0;
    }

    mapper_set_profile(0, &profile_joy_analog, false);
    // mapper_set_profile(0, &profile_mouse, false);

    err = bt_enable(NULL);
    if (err) {
        LOG_ERR("Bluetooth stack init failed {err: %d}", err);
        return 0;
    }

    err = devmgr_init();
    if (err) {
        LOG_ERR("Device manager init failed {err: %d}", err);
        return 0;
    }

    err = settings_load();
    if (err) {
        LOG_ERR("Failed to load settings {err: %d}", err);
    }

    err = btsvc_init();
    if (err) {
        LOG_ERR("Bluetooth service init failed {err: %d}", err);
        return 0;
    }

    btsvc_start_advertising();

    devmgr_set_mode(DEVMGR_MODE_PAIRING, true);

    return 0;
}
