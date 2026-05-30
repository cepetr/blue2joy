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

#include <zephyr/device.h>
#include <zephyr/usb/usbd.h>

#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(btj_usbd, LOG_LEVEL_DBG);

// Registered Blue2Joy PID at https://pid.codes/
#define BTJ_USB_DEVICE_VID 0x1209
#define BTJ_USB_DEVICE_PID 0xB2A8

// USB Device instance definition
USBD_DEVICE_DEFINE(btj_usbd, DEVICE_DT_GET(DT_NODELABEL(zephyr_udc0)), BTJ_USB_DEVICE_VID,
                   BTJ_USB_DEVICE_PID);

// USB Device Descriptors
USBD_DESC_LANG_DEFINE(btj_usbd_lang);
USBD_DESC_MANUFACTURER_DEFINE(btj_usbd_mfr, "cepetr");
USBD_DESC_PRODUCT_DEFINE(btj_usbd_product, "Blue2Joy");

IF_ENABLED(CONFIG_HWINFO, (USBD_DESC_SERIAL_NUMBER_DEFINE(btj_usbd_sn)));

static const uint8_t attributes =
    (false ? USB_SCD_SELF_POWERED : 0) | (false ? USB_SCD_REMOTE_WAKEUP : 0);

// Full speed configuration
USBD_DESC_CONFIG_DEFINE(fs_cfg_desc, "FS Configuration");
USBD_CONFIGURATION_DEFINE(btj_usbd_fs_config, attributes, 125, &fs_cfg_desc);

int btj_usbd_init(void)
{
    int err;

    err = usbd_add_descriptor(&btj_usbd, &btj_usbd_lang);
    if (err) {
        LOG_ERR("Failed to initialize language descriptor (%d)", err);
        return err;
    }

    err = usbd_add_descriptor(&btj_usbd, &btj_usbd_mfr);
    if (err) {
        LOG_ERR("Failed to initialize manufacturer descriptor (%d)", err);
        return err;
    }

    err = usbd_add_descriptor(&btj_usbd, &btj_usbd_product);
    if (err) {
        LOG_ERR("Failed to initialize product descriptor (%d)", err);
        return err;
    }

    IF_ENABLED(CONFIG_HWINFO, (err = usbd_add_descriptor(&btj_usbd, &btj_usbd_sn);));

    if (err) {
        LOG_ERR("Failed to initialize SN descriptor (%d)", err);
        return err;
    }

    err = usbd_add_configuration(&btj_usbd, USBD_SPEED_FS, &btj_usbd_fs_config);
    if (err) {
        LOG_ERR("Failed to add Full-Speed configuration");
        return err;
    }

    err = usbd_register_all_classes(&btj_usbd, USBD_SPEED_FS, 1);
    if (err) {
        LOG_ERR("Failed to register classes (%d)", err);
        return err;
    }

    err = usbd_init(&btj_usbd);
    if (err) {
        LOG_ERR("Failed to initialize device support");
        return err;
    }

    err = usbd_enable(&btj_usbd);
    if (err) {
        LOG_ERR("Failed to enable device support");
        return err;
    }

    return 0;
}
