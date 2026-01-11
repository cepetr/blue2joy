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

#include <stdlib.h>

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/settings/settings.h>

#include <mapper/mapper.h>

#define SETTINGS_KEY_PREFIX "blue2joy/profile"

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

typedef struct {
    uint32_t source;
    bool invert;
    uint8_t hat_switch;
    uint8_t threshold;
    uint8_t hysteresis;
} mapper_pin_config_dto_v1_t;

typedef struct {
    uint32_t source;
    int16_t low;
    int16_t high;
} mapper_pot_config_dto_v1_t;

typedef struct {
    uint32_t source;
    uint8_t mode;
    uint8_t dead_zone;
    int16_t gain;
    int16_t max;
} mapper_intg_config_dto_v1_t;

typedef struct {
    mapper_pin_config_dto_v1_t pin[5];
    mapper_pot_config_dto_v1_t pot[2];
    mapper_intg_config_dto_v1_t intg[2];
} mapper_profile_dto_v1_t;

typedef struct {
    uint8_t version;
    mapper_profile_dto_v1_t v1;
} mapper_profile_dto_t;

static void pin_config_dto_v1_parse(const mapper_pin_config_dto_v1_t *dto,
                                    mapper_pin_config_t *config)
{
    config->source = (hrm_usage_t)dto->source;
    config->invert = dto->invert;
    config->hat_switch = dto->hat_switch;
    config->threshold = dto->threshold;
    config->hysteresis = dto->hysteresis;
}

static void pot_config_dto_v1_parse(const mapper_pot_config_dto_v1_t *dto,
                                    mapper_pot_config_t *config)
{
    config->source = (hrm_usage_t)dto->source;
    config->low = dto->low;
    config->high = dto->high;
}

static void intg_config_dto_v1_parse(const mapper_intg_config_dto_v1_t *dto,
                                     mapper_intg_config_t *config)
{
    config->source = (hrm_usage_t)dto->source;
    config->mode = (mapper_intr_mode_t)dto->mode;
    config->dead_zone = dto->dead_zone;
    config->gain = dto->gain;
    config->max = dto->max;
}

static void profile_dto_v1_parse(const mapper_profile_dto_v1_t *dto, mapper_profile_t *profile)
{
    for (int i = 0; i < ARRAY_SIZE(dto->pin); i++) {
        pin_config_dto_v1_parse(&dto->pin[i], &profile->pin[i]);
    }

    for (int i = 0; i < ARRAY_SIZE(dto->pot); i++) {
        pot_config_dto_v1_parse(&dto->pot[i], &profile->pot[i]);
    }

    for (int i = 0; i < ARRAY_SIZE(dto->intg); i++) {
        intg_config_dto_v1_parse(&dto->intg[i], &profile->intg[i]);
    }
}

static int profile_dto_parse(const void *data, size_t data_size, mapper_profile_t *profile)
{
    memset(profile, 0, sizeof(*profile));

    const mapper_profile_dto_t *dto = (const mapper_profile_dto_t *)data;
    if (data_size < sizeof(dto->version)) {
        return -1;
    }

    switch (dto->version) {
    case 1:
        if (data_size != offsetof(mapper_profile_dto_t, v1) + sizeof(dto->v1)) {
            return -1;
        }

        profile_dto_v1_parse(&dto->v1, profile);
        return 0;

    default:
        return -1;
    }
}

static void pin_config_dto_v1_build(const mapper_pin_config_t *config,
                                    mapper_pin_config_dto_v1_t *dto)
{
    dto->source = (uint32_t)config->source;
    dto->invert = config->invert;
    dto->hat_switch = config->hat_switch;
    dto->threshold = config->threshold;
    dto->hysteresis = config->hysteresis;
}

static void pot_config_dto_v1_build(const mapper_pot_config_t *config,
                                    mapper_pot_config_dto_v1_t *dto)
{
    dto->source = (uint32_t)config->source;
    dto->low = config->low;
    dto->high = config->high;
}

static void intg_config_dto_v1_build(const mapper_intg_config_t *config,
                                     mapper_intg_config_dto_v1_t *dto)
{
    dto->source = (uint32_t)config->source;
    dto->mode = (uint8_t)config->mode;
    dto->dead_zone = config->dead_zone;
    dto->gain = config->gain;
    dto->max = config->max;
}

static ssize_t profile_dto_build(const mapper_profile_t *profile, mapper_profile_dto_t *dto)
{
    dto->version = 1;

    for (int i = 0; i < ARRAY_SIZE(dto->v1.pin); i++) {
        pin_config_dto_v1_build(&profile->pin[i], &dto->v1.pin[i]);
    }

    for (int i = 0; i < ARRAY_SIZE(dto->v1.pot); i++) {
        pot_config_dto_v1_build(&profile->pot[i], &dto->v1.pot[i]);
    }

    for (int i = 0; i < ARRAY_SIZE(dto->v1.intg); i++) {
        intg_config_dto_v1_build(&profile->intg[i], &dto->v1.intg[i]);
    }

    return offsetof(mapper_profile_dto_t, v1) + sizeof(dto->v1);
}

void mapper_save_settings(struct k_work *work)
{
    LOG_INF("Saving mapper settings");
    settings_save_subtree(SETTINGS_KEY_PREFIX);
}

static int _settings_set(const char *key, size_t len, settings_read_cb read_cb, void *cb_arg)
{
    LOG_INF("Importing profile settings {key=%s, len=%d}", key, len);

    char *endptr;

    int idx = strtol(key, &endptr, 10);

    if (*endptr != '\0') {
        LOG_ERR("Invalid key format");
        return -EINVAL;
    }

    if (idx < 0 || idx >= MAPPER_MAX_PROFILES) {
        LOG_ERR("Profile index out of range (idx=%d)", idx);
        return -EINVAL;
    }

    mapper_profile_dto_t dto;

    if (read_cb(cb_arg, &dto, len) != len) {
        LOG_ERR("Failed to read setting value");
        return -EINVAL;
    }

    mapper_profile_t profile;

    if (profile_dto_parse(&dto, len, &profile) != 0) {
        LOG_ERR("Failed to parse profile configuration");
        return -EINVAL;
    }

    if (mapper_set_profile(idx, &profile, false) != 0) {
        LOG_ERR("Failed to set profile");
        return -EINVAL;
    }

    return 0;
}

static int _settings_export(int (*export_func)(const char *name, const void *val, size_t val_len))
{
    LOG_INF("Exporting profile settings");

    for (int i = 0; i < MAPPER_MAX_PROFILES; i++) {
        char key[32];
        snprintf(key, sizeof(key), SETTINGS_KEY_PREFIX "/%d", i);

        mapper_profile_t profile;

        if (mapper_get_profile(i, &profile) != 0) {
            LOG_ERR("Failed to get profile {idx=%d}", i);
            continue;
        }

        mapper_profile_dto_t dto;
        ssize_t dto_size = profile_dto_build(&profile, &dto);
        if (dto_size >= 0) {
            export_func(key, &dto, dto_size);
        }
    }

    return 0;
}

SETTINGS_STATIC_HANDLER_DEFINE(mapper, SETTINGS_KEY_PREFIX, NULL, _settings_set, NULL,
                               _settings_export);
