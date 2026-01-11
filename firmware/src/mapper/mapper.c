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

#include <event/event_bus.h>

#include "mapper.h"
#include "settings.h"

#include <stdlib.h>
#include <assert.h>

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

typedef struct {
    bool last_value;
} mapper_pin_state_t;

typedef struct {
    // Last analog value 1..228
    uint8_t last_value;
} mapper_pot_state_t;

typedef struct {
    // Deviation from center in steps (Q17.14 format)
    // (applied each tick to the pos)
    int32_t delta;
    // Accumulated position (Q17.14 format)
    int32_t pos;
} mapper_intg_state_t;

// Mapper state
typedef struct {
    mapper_pin_state_t pin[IO_PIN_COUNT];
    mapper_pot_state_t pot[IO_POT_COUNT];
    mapper_intg_state_t intg[IO_ENC_COUNT];
} mapper_state_t;

typedef struct {
    struct k_mutex mutex;

    struct k_timer timer;
    struct k_work tick_work;

    struct k_work_delayable save_work;

    struct {
        // Stored profiles
        mapper_profile_t profiles[MAPPER_MAX_PROFILES];
        // Profile used for periodic updates
        int active_profile;
    } sync;

    // Current state
    mapper_state_t state;
} mapper_t;

static mapper_t g_mapper;

static void mapper_tick_cb(struct k_work *work);
static void mapper_timer_cb(struct k_timer *timer_id);

int mapper_init(void)
{
    mapper_t *mapper = &g_mapper;

    // Initialize the mapper state
    memset(mapper, 0, sizeof(mapper_t));

    mapper->sync.active_profile = -1;

    // Initialize mutex
    int err = k_mutex_init(&mapper->mutex);
    if (err) {
        LOG_ERR("Failed to initialize mutex {err: %d}", err);
        return err;
    }

    k_work_init(&mapper->tick_work, mapper_tick_cb);

    k_timer_init(&mapper->timer, mapper_timer_cb, NULL);
    k_timer_start(&mapper->timer, K_MSEC(10), K_MSEC(10));

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
    bool out = config->invert ? !state->last_value : state->last_value;

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

    state->last_value = config->invert ? !out : out;
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

    int32_t out = map_linear(in, field->logical_min, field->logical_max, config->low, config->high);

    state->last_value = CLAMP(out, 1, 228);
}

// Requires mapper->mutex to be locked
static void mapper_integrate_delta(uint8_t intg_idx, int32_t delta)
{
    mapper_t *mapper = &g_mapper;

    assert(intg_idx < ARRAY_SIZE(mapper->state.intg));

    if (mapper->sync.active_profile < 0 || mapper->sync.active_profile >= MAPPER_MAX_PROFILES) {
        return;
    }

    const mapper_profile_t *profile = &mapper->sync.profiles[mapper->sync.active_profile];
    const mapper_intg_config_t *intg_config = &profile->intg[intg_idx];
    mapper_intg_state_t *intg_state = &mapper->state.intg[intg_idx];

    io_pin_update_encoder(intg_idx, delta, intg_config->max);

    intg_state->pos =
        CLAMP(intg_state->pos + delta, -intg_config->max << 14, intg_config->max << 14);

    for (int pot_idx = 0; pot_idx < ARRAY_SIZE(mapper->state.pot); pot_idx++) {
        const mapper_pot_config_t *pot_config = &profile->pot[pot_idx];

        hrm_usage_t source = pot_config->source;

        if (!HRM_USAGE_IS_INTG(source) || HRM_USAGE_GET_INTG_IDX(source) != intg_idx) {
            continue;
        }

        if (HRM_USAGE_IS_INTG_ABS(source)) {
            mapper_pot_state_t *pot_state = &mapper->state.pot[pot_idx];

            int32_t out = map_linear(intg_state->pos, -intg_config->max << 14,
                                     intg_config->max << 14, pot_config->low, pot_config->high);

            pot_state->last_value = CLAMP(out, 1, 228);

            io_pot_set(pot_idx, pot_state->last_value);

        } else if (HRM_USAGE_IS_INTG_ENC(source)) {
            io_pot_update_encoder(pot_idx, delta, intg_config->max);
        }
    }
}

static int32_t update_intg_state(mapper_intg_state_t *state, const mapper_intg_config_t *config,
                                 const hrm_report_t *report, const uint8_t *data)
{
    const hrm_field_t *field = hrm_report_find_field(report, config->source);

    if (field == NULL) {
        return 0;
    }

    int32_t in = hrm_field_extract(field, data);
    in = CLAMP(in, field->logical_min, field->logical_max);

    if (config->mode == MAPPER_INTG_MODE_REL) {
        // Input value is a relative value

        // Convert input value to Q17.14
        int32_t delta = in << 14;

        // Apply scaling Q8.7 gain, result in Q17.14
        delta = (delta * config->gain) >> 8;

        // Do not periodic accumulation
        state->delta = 0;

        // Delta for immediate accumulation
        return delta;

    } else if (config->mode == MAPPER_INTG_MODE_ABS) {
        // Input is a new absolute value (deviation from center)

        // Convert the value to Q1.14 format first
        int32_t delta = map_linear(in, field->logical_min, field->logical_max, -16384, 16384);

        // Apply dead zone
        if (abs(delta) <= (config->dead_zone * 16384) / 100) {
            delta = 0;
        }

        // Apply gain Q8.7 format, result in Q17.14
        delta = (delta * config->gain) >> 8;

        // Store delta for later periodic accumulation
        state->delta = delta;

        // No immediate accumulation
        return 0;
    }

    return 0;
}

// Routine called every 10ms from thread context
static void mapper_tick_cb(struct k_work *work)
{
    mapper_t *mapper = &g_mapper;

    k_mutex_lock(&mapper->mutex, K_FOREVER);

    // Do periodic accumulation
    for (int i = 0; i < ARRAY_SIZE(mapper->state.intg); i++) {
        mapper_intg_state_t *state = &mapper->state.intg[i];
        mapper_integrate_delta(i, state->delta);
    }

    k_mutex_unlock(&mapper->mutex);
}

// Timer callback every 10ms (interrupt context)
static void mapper_timer_cb(struct k_timer *timer_id)
{
    ARG_UNUSED(timer_id);
    k_work_submit(&g_mapper.tick_work);
}

// Sets the active profile used during timer ticks
static void mapper_set_active_profile(int profile_idx)
{
    mapper_t *mapper = &g_mapper;

    k_mutex_lock(&mapper->mutex, K_FOREVER);

    if (mapper->sync.active_profile != profile_idx) {

        mapper->sync.active_profile = profile_idx;

        const mapper_profile_t *profile = &mapper->sync.profiles[profile_idx];

        for (int i = 0; i < ARRAY_SIZE(profile->pin); i++) {
            const mapper_pin_config_t *pin_config = &profile->pin[i];

            io_pin_config_t io_config = {
                .mode = IO_PIN_MODE_NORMAL,
            };

            if (HRM_USAGE_IS_INTG(pin_config->source)) {
                io_config.mode = IO_PIN_MODE_ENCODER;
                io_config.enc_idx = HRM_USAGE_GET_INTG_IDX(pin_config->source);
                io_config.enc_phase = HRM_USAGE_GET_INTG_PHASE(pin_config->source);
            };
            io_pin_configure(i, &io_config);
        }
    }

    k_mutex_unlock(&mapper->mutex);
}

// Callback invoked from bt layer when a report is received
void mapper_process_report(int profile_idx, const uint8_t *data, const hrm_report_t *report)
{
    mapper_t *mapper = &g_mapper;

    if (profile_idx < 0 || profile_idx >= MAPPER_MAX_PROFILES) {
        return;
    }

    mapper_set_active_profile(profile_idx);

    mapper_state_t *state = &mapper->state;
    mapper_profile_t *profile = &mapper->sync.profiles[profile_idx];

    k_mutex_lock(&mapper->mutex, K_FOREVER);

    for (int i = 0; i < ARRAY_SIZE(state->pin); i++) {
        mapper_pin_state_t *pin_state = &state->pin[i];
        const mapper_pin_config_t *pin_config = &profile->pin[i];
        update_pin_state(pin_state, pin_config, report, data);
        io_pin_set(i, pin_state->last_value);
    }

    for (int i = 0; i < ARRAY_SIZE(state->pot); i++) {
        mapper_pot_state_t *pot_state = &state->pot[i];
        const mapper_pot_config_t *pot_config = &profile->pot[i];
        update_pot_state(pot_state, pot_config, report, data);
        io_pot_set(i, pot_state->last_value);
    }

    for (int i = 0; i < ARRAY_SIZE(state->intg); i++) {
        mapper_intg_state_t *intg_state = &state->intg[i];
        const mapper_intg_config_t *intg_config = &profile->intg[i];
        int32_t delta = update_intg_state(intg_state, intg_config, report, data);
        mapper_integrate_delta(i, delta);
    }

    k_mutex_unlock(&mapper->mutex);
}
