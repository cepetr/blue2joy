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
#include <zephyr/logging/log.h>

#include <io/joystick.h>
#include <io/paddle.h>
#include <event/event_bus.h>

#include "mapper.h"
#include "settings.h"

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

typedef struct {
    bool state;
} mapper_pin_state_t;

#define ANALOG_FP_MULT 256

typedef struct {
    // Analog value multiplied by 256 (UQ8.8)
    uint16_t value;
} mapper_pot_state_t;

typedef struct {
    // Accumulated delta since last update
    int16_t delta;
} mapper_enc_state_t;

// Mapper state
typedef struct {
    mapper_pin_state_t up;
    mapper_pin_state_t down;
    mapper_pin_state_t left;
    mapper_pin_state_t right;
    mapper_pin_state_t trigger;
    mapper_pot_state_t pot0;
    mapper_pot_state_t pot1;
    mapper_enc_state_t enc0;
    mapper_enc_state_t enc1;
} mapper_state_t;

typedef struct {
    struct k_mutex mutex;
    struct k_work_delayable save_work;

    struct {
        mapper_profile_t profiles[MAPPER_MAX_PROFILES];
    } sync;

    mapper_state_t state;
} mapper_t;

static mapper_t g_mapper;

int mapper_init(void)
{
    mapper_t *mapper = &g_mapper;

    // Initialize the mapper state
    memset(mapper, 0, sizeof(mapper_t));

    // Initialize mutex
    int err = k_mutex_init(&mapper->mutex);
    if (err) {
        LOG_ERR("Failed to initialize mutex {err: %d}", err);
        return err;
    }

    k_work_init_delayable(&mapper->save_work, mapper_save_settings);

    LOG_INF("Mapper initialized");

    return 0;
}

int mapper_get_profile(int idx, mapper_profile_t *profile)
{
    mapper_t *mapper = &g_mapper;

    if (idx < 0 || idx >= MAPPER_MAX_PROFILES) {
        return -EINVAL;
    }

    k_mutex_lock(&mapper->mutex, K_FOREVER);
    *profile = mapper->sync.profiles[idx];
    k_mutex_unlock(&mapper->mutex);

    return 0;
}

int mapper_set_profile(int idx, const mapper_profile_t *profile, bool save)
{
    mapper_t *mapper = &g_mapper;

    if (idx < 0 || idx >= MAPPER_MAX_PROFILES) {
        return -EINVAL;
    }

    bool changed = false;

    k_mutex_lock(&mapper->mutex, K_FOREVER);

    mapper_profile_t *stored_profile = &mapper->sync.profiles[idx];
    if (memcmp(stored_profile, profile, sizeof(*profile)) != 0) {
        *stored_profile = *profile;
        changed = true;
    }

    if (changed) {
        event_t ev = {
            .subject = EV_SUBJECT_PROFILE,
            .action = EV_ACTION_UPDATE,
            .idx = idx,
        };
        event_bus_publish(&ev);
    }

    k_mutex_unlock(&mapper->mutex);

    if (save && changed) {
        LOG_INF("Scheduling profile settings save");
        k_work_reschedule(&mapper->save_work, K_SECONDS(3));
    }

    return 0;
}

static int32_t map_linear(int32_t value, int32_t in_min, int32_t in_max, int32_t out_min,
                          int32_t out_max)
{
    if (in_min == in_max) {
        return out_min;
    }

    return out_min + (value - in_min) * (out_max - out_min) / (in_max - in_min);
}

static void update_pin_state(mapper_pin_state_t *state, const mapper_pin_config_t *config,
                             const hrm_report_t *report, const uint8_t *data)
{
    const hrm_field_t *field = hrm_report_find_field(report, config->source);

    if (field == NULL) {
        return;
    }

    int32_t in = hrm_field_extract(field, data);
    bool out = config->invert ? !state->state : state->state;

    if (field->logical_min == 0 && field->logical_max == 1) {
        // Boolean field, logical min is 0 and max is 1
        out = in != 0;
    } else if (field->usage == HRM_USAGE_HAT_SWITCH) {
        // Hat switch field, with logical min 0 and max 8
        static const uint8_t hat_lookup[8] = {
            [0] = HAT_SWITCH_UP,    [1] = HAT_SWITCH_UP | HAT_SWITCH_RIGHT,
            [2] = HAT_SWITCH_RIGHT, [3] = HAT_SWITCH_DOWN | HAT_SWITCH_RIGHT,
            [4] = HAT_SWITCH_DOWN,  [5] = HAT_SWITCH_DOWN | HAT_SWITCH_LEFT,
            [6] = HAT_SWITCH_LEFT,  [7] = HAT_SWITCH_UP | HAT_SWITCH_LEFT,
        };

        in -= field->logical_min;
        if (in < sizeof(hat_lookup)) {
            // Hat switch value is in range 0-7
            // Check if the bitmask matches the configured hat switch
            out = (hat_lookup[in] & config->hat_switch) != 0;
        } else {
            // Out of range, treat as inactive
            out = false;
        }
    } else {
        // Numeric field
        // TODO: negative values handling
        in = CLAMP(in, field->logical_min, field->logical_max);

        int32_t threshold_up = map_linear(config->threshold + config->hysteresis, 0, 100,
                                          field->logical_min, field->logical_max);

        int32_t threshold_down = map_linear(config->threshold - config->hysteresis, 0, 100,
                                            field->logical_min, field->logical_max);

        if (in > threshold_up) {
            out = true;
        } else if (in <= threshold_down) {
            out = false;
        }
    }

    state->state = config->invert ? !out : out;
}

static void update_pot_state(mapper_pot_state_t *state, const mapper_pot_config_t *config,
                             const hrm_report_t *report, const uint8_t *data)
{
    const hrm_field_t *field = hrm_report_find_field(report, config->source);

    if (field == NULL) {
        return;
    }

    int32_t in = hrm_field_extract(field, data);
    in = CLAMP(in, field->logical_min, field->logical_max);

    int32_t out = state->value;

    if (config->int_speed == 0) {
        // Direct mapping
        out = ANALOG_FP_MULT *
              map_linear(in, field->logical_min, field->logical_max, config->low, config->high);
    } else {
        // Use input as a delta
        int32_t diff =
            map_linear(in, field->logical_min, field->logical_max, -ANALOG_FP_MULT, ANALOG_FP_MULT);

        // Apply integration speed
        out += (diff * config->int_speed) >> 8;

        // Clamp the output to the configured range
        out = CLAMP(out, ANALOG_FP_MULT * config->low, ANALOG_FP_MULT * config->high);
    }

    state->value = CLAMP(out, ANALOG_FP_MULT * 1, ANALOG_FP_MULT * 228);
}

static void update_enc_state(mapper_enc_state_t *state, const mapper_enc_config_t *config,
                             const hrm_report_t *report, const uint8_t *data)
{
    const hrm_field_t *field = hrm_report_find_field(report, config->source);

    if (field == NULL) {
        return;
    }

    int32_t in = hrm_field_extract(field, data);
    in = CLAMP(in, field->logical_min, field->logical_max);

    state->delta = in;
}

static void update_outputs(const mapper_state_t *state)
{
    joystick_set_up(state->up.state);
    joystick_set_down(state->down.state);
    joystick_set_left(state->left.state);
    joystick_set_right(state->right.state);
    joystick_set_trig(state->trigger.state);

    paddle_set_pot0(state->pot0.value / ANALOG_FP_MULT);
    paddle_set_pot1(state->pot1.value / ANALOG_FP_MULT);

    joystick_queue_x_steps(state->enc0.delta);
    joystick_queue_y_steps(state->enc1.delta);
}

// Callback invoked from bt layer when a report is received
void mapper_process_report(int profile_idx, const uint8_t *data, const hrm_report_t *report)
{
    mapper_t *mapper = &g_mapper;

    mapper_profile_t profile;

    if (mapper_get_profile(profile_idx, &profile) != 0) {
        return;
    }

    mapper_state_t *state = &mapper->state;

    update_pin_state(&state->up, &profile.up, report, data);
    update_pin_state(&state->down, &profile.down, report, data);
    update_pin_state(&state->left, &profile.left, report, data);
    update_pin_state(&state->right, &profile.right, report, data);
    update_pin_state(&state->trigger, &profile.trigger, report, data);
    update_pot_state(&state->pot0, &profile.pot0, report, data);
    update_pot_state(&state->pot1, &profile.pot1, report, data);
    update_enc_state(&state->enc0, &profile.enc0, report, data);
    update_enc_state(&state->enc1, &profile.enc1, report, data);

    update_outputs(state);

    // Reset encoder deltas after processing
    state->enc0.delta = 0;
    state->enc1.delta = 0;
}
