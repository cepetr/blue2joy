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

#include <devmgr/devmgr.h>

#define SETTINGS_KEY_PREFIX "blue2joy/dev"

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

typedef struct {
    uint8_t addr[7];
    uint8_t profile;
} dev_config_dto_v1_t;

typedef struct {
    uint8_t version;
    dev_config_dto_v1_t v1;
} dev_config_dto_t;

static void dev_config_dto_v1_parse(const dev_config_dto_v1_t *dto, bt_addr_le_t *addr,
                                    devmgr_device_config_t *config)
{
    _Static_assert(sizeof(dto->addr) == sizeof(*addr), "Invalid address size");
    memcpy(addr, dto->addr, sizeof(*addr));
    config->profile = dto->profile;
}

static int dev_config_dto_parse(const void *data, size_t data_size, bt_addr_le_t *addr,
                                devmgr_device_config_t *config)
{
    memset(config, 0, sizeof(*config));

    const dev_config_dto_t *dto = (const dev_config_dto_t *)data;
    if (data_size < sizeof(dto->version)) {
        return -1;
    }

    switch (dto->version) {
    case 1:
        if (data_size != sizeof(dto->version) + sizeof(dto->v1)) {
            return -1;
        }

        dev_config_dto_v1_parse(&dto->v1, addr, config);
        return 0;

    default:
        return -1;
    }
}

static void dev_config_dto_v1_build(const bt_addr_le_t *addr, const devmgr_device_config_t *config,
                                    dev_config_dto_v1_t *dto)
{
    _Static_assert(sizeof(dto->addr) == sizeof(*addr), "Invalid address size");
    memcpy(dto->addr, addr, sizeof(dto->addr));
    dto->profile = config->profile;
}

static ssize_t dev_config_dto_build(const bt_addr_le_t *addr, const devmgr_device_config_t *config,
                                    dev_config_dto_t *dto)
{
    dto->version = 1;
    dev_config_dto_v1_build(addr, config, &dto->v1);

    return sizeof(dto->version) + sizeof(dto->v1);
}

void devmgr_save_settings(struct k_work *work)
{
    LOG_INF("Saving devmgr settings");
    settings_save_subtree(SETTINGS_KEY_PREFIX);
}

static int _settings_set(const char *key, size_t len, settings_read_cb read_cb, void *cb_arg)
{
    LOG_INF("Importing devmgr settings {key=%s, len=%d}", key, len);

    bt_addr_le_t addr;

    char *endptr;

    int idx = strtol(key, &endptr, 10);

    if (*endptr != '\0') {
        LOG_ERR("Invalid key format");
        return -EINVAL;
    }

    if (idx < 0 || idx >= DEVMGR_MAX_CONFIG_ENTRIES) {
        LOG_ERR("Device index out of range (idx=%d)", idx);
        return -EINVAL;
    }

    dev_config_dto_t dto;

    if (read_cb(cb_arg, &dto, len) != len) {
        LOG_ERR("Failed to read setting value");
        return -EINVAL;
    }

    devmgr_device_config_t dev_config;

    if (dev_config_dto_parse(&dto, len, &addr, &dev_config) != 0) {
        LOG_ERR("Failed to parse device configuration");
        return -EINVAL;
    }

    if (devmgr_create_device(&addr, false) != 0) {
        LOG_ERR("Failed to create device entry");
        return -EINVAL;
    };

    // Ensure the device entry exists
    // !@# TODO use devmgr_set_device_config_at()
    if (devmgr_set_device_config(&addr, &dev_config, false) != 0) {
        LOG_ERR("Failed to set device configuration");
        return -EINVAL;
    }

    return 0;
}

static int _settings_export(int (*export_func)(const char *name, const void *val, size_t val_len))
{
    LOG_INF("Exporting devmgr settings");

    bt_addr_le_t addrs[DEVMGR_MAX_CONFIG_ENTRIES];
    int addr_count = devmgr_get_devices(addrs);

    for (int i = 0; i < addr_count; i++) {
        bt_addr_le_t *addr = &addrs[i];

        char key[32];
        snprintf(key, sizeof(key), SETTINGS_KEY_PREFIX "/%d", i);

        devmgr_device_config_t dev_config;
        if (devmgr_get_device_config(addr, &dev_config) != 0) {
            LOG_ERR("Failed to get device configuration {idx=%d}", i);
            continue;
        }

        dev_config_dto_t dto;
        ssize_t dto_size = dev_config_dto_build(addr, &dev_config, &dto);
        if (dto_size >= 0) {
            export_func(key, &dto, dto_size);
        }
    }

    return 0;
}

SETTINGS_STATIC_HANDLER_DEFINE(devmgr, SETTINGS_KEY_PREFIX, NULL, _settings_set, NULL,
                               _settings_export);
