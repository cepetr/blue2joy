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

typedef struct __attribute__((packed)) {
    uint32_t source;
    bool invert;
    uint8_t hat_switch;
    uint8_t threshold;
    uint8_t hysteresis;
} mapper_pin_config_dto_v1_t;

typedef struct __attribute__((packed)) {
    uint32_t source;
    int16_t low;
    int16_t high;
    int16_t int_speed;
} mapper_pot_config_dto_v1_t;

typedef struct __attribute__((packed)) {
    mapper_pin_config_dto_v1_t up;
    mapper_pin_config_dto_v1_t down;
    mapper_pin_config_dto_v1_t left;
    mapper_pin_config_dto_v1_t right;
    mapper_pin_config_dto_v1_t trigger;
    mapper_pot_config_dto_v1_t pot0;
    mapper_pot_config_dto_v1_t pot1;
} mapper_profile_dto_v1_t;

typedef struct __attribute__((packed)) {
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
    config->int_speed = dto->int_speed;
}

static void profile_dto_v1_parse(const mapper_profile_dto_v1_t *dto, mapper_profile_t *profile)
{
    pin_config_dto_v1_parse(&dto->up, &profile->up);
    pin_config_dto_v1_parse(&dto->down, &profile->down);
    pin_config_dto_v1_parse(&dto->left, &profile->left);
    pin_config_dto_v1_parse(&dto->right, &profile->right);
    pin_config_dto_v1_parse(&dto->trigger, &profile->trigger);
    pot_config_dto_v1_parse(&dto->pot0, &profile->pot0);
    pot_config_dto_v1_parse(&dto->pot1, &profile->pot1);
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
        if (data_size != sizeof(dto->version) + sizeof(dto->v1)) {
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
    dto->int_speed = config->int_speed;
}

static ssize_t profile_dto_build(const mapper_profile_t *profile, mapper_profile_dto_t *dto)
{
    dto->version = 1;
    pin_config_dto_v1_build(&profile->up, &dto->v1.up);
    pin_config_dto_v1_build(&profile->down, &dto->v1.down);
    pin_config_dto_v1_build(&profile->left, &dto->v1.left);
    pin_config_dto_v1_build(&profile->right, &dto->v1.right);
    pin_config_dto_v1_build(&profile->trigger, &dto->v1.trigger);
    pot_config_dto_v1_build(&profile->pot0, &dto->v1.pot0);
    pot_config_dto_v1_build(&profile->pot1, &dto->v1.pot1);

    return sizeof(dto->version) + sizeof(dto->v1);
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
