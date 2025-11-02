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

#include <assert.h>
#include <stddef.h>
#include <string.h>
#include <stdlib.h>

#include <zephyr/logging/log.h>
#include <hw_id.h>
#include <app_version.h>

#include <devmgr/devmgr.h>
#include <mapper/mapper.h>

#include "btjp.h"
#include "btjp_utils.h"
#include "btjp_msg.h"

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

#define CHECK_REQ_SIZE(req, expected_size)                                                         \
    do {                                                                                           \
        if ((req)->hdr.size != (expected_size)) {                                                  \
            return BTJP_ERR_INVALID_REQ;                                                           \
        }                                                                                          \
    } while (0)

#define CHECK_REQ_ARG(condition)                                                                   \
    do {                                                                                           \
        if (!(condition)) {                                                                        \
            return BTJP_ERR_INVALID_ARG;                                                           \
        }                                                                                          \
    } while (0)

static void hw_id_get_bytes(uint8_t *buff, size_t buff_size)
{
    assert(buff_size == 8);

    memset(buff, 0, buff_size);

    // Get hexadecimal representation of HW ID
    char str[HW_ID_LEN];
    if (hw_id_get(str, sizeof(str)) != 0) {
        return;
    }

    // Parse hex string into bytes
    // (assumes valid hex string)
    for (size_t i = 0; i < buff_size; i++) {
        char byte_str[3] = {str[i * 2], str[i * 2 + 1], 0};
        buff[i] = (uint8_t)strtol(byte_str, NULL, 16);
    }
}

static btjp_status_t btjp_handle_request(const btjp_req_t *req, btjp_rsp_t *rsp)
{
    switch (req->hdr.msg_id) {
    case BTJP_MSG_GET_API_VERSION: {
        CHECK_REQ_SIZE(req, 0);
        rsp->hdr.size = sizeof(rsp->get_api_version);
        rsp->get_api_version.major = 1;
        rsp->get_api_version.minor = 0;
    } break;

    case BTJP_MSG_GET_SYS_INFO: {
        CHECK_REQ_SIZE(req, 0);
        rsp->hdr.size = sizeof(rsp->get_sys_info);
        hw_id_get_bytes(rsp->get_sys_info.hw_id, sizeof(rsp->get_sys_info.hw_id));
        rsp->get_sys_info.sw_version = APPVERSION;
        rsp->get_sys_info.hw_version = 0;
    } break;

    case BTJP_MSG_SET_DEV_CONFIG: {
        CHECK_REQ_SIZE(req, sizeof(req->set_dev_config));

        bt_addr_le_t addr;
        dev_addr_to_bt_addr_le(&req->set_dev_config.addr, &addr);

        devmgr_device_config_t config = {0};
        config.profile = req->set_dev_config.profile;

        int err = devmgr_set_device_config(&addr, &config, true);
        if (err != 0) {
            return BTJP_ERR_INVALID_ARG;
        }
    } break;

    case BTJP_MSG_SET_PIN_CONFIG: {
        CHECK_REQ_SIZE(req, sizeof(req->set_pin_config));

        mapper_profile_t profile;
        int err = mapper_get_profile(req->set_pin_config.profile, &profile);
        if (err != 0) {
            LOG_ERR("Invalid profile #%d", req->set_pin_config.profile);
            return BTJP_ERR_INVALID_ARG;
        }

        mapper_pin_config_t *config = profile_pin(&profile, req->set_pin_config.pin_id);
        if (config == NULL) {
            LOG_ERR("Invalid pin ID %d", req->set_pin_config.pin_id);
            return BTJP_ERR_INVALID_ARG;
        }

        config->source = req->set_pin_config.source;
        config->invert = req->set_pin_config.invert ? true : false;
        config->hat_switch = req->set_pin_config.hat_switch;
        config->threshold = req->set_pin_config.threshold;
        config->hysteresis = req->set_pin_config.hysteresis;

        err = mapper_set_profile(req->set_pin_config.profile, &profile, true);
        if (err != 0) {
            return BTJP_ERR_INVALID_ARG;
        }
    } break;

    case BTJP_MSG_SET_POT_CONFIG: {
        CHECK_REQ_SIZE(req, sizeof(req->set_pot_config));

        mapper_profile_t profile;
        int err = mapper_get_profile(req->set_pot_config.profile, &profile);
        if (err != 0) {
            LOG_ERR("Invalid profile #%d", req->set_pot_config.profile);
            return BTJP_ERR_INVALID_ARG;
        }

        mapper_pot_config_t *config = profile_pot(&profile, req->set_pot_config.pin_id);
        if (config == NULL) {
            LOG_ERR("Invalid pin ID %d", req->set_pot_config.pin_id);
            return BTJP_ERR_INVALID_ARG;
        }

        config->source = req->set_pot_config.source;
        config->low = req->set_pot_config.low;
        config->high = req->set_pot_config.high;
        config->int_speed = req->set_pot_config.int_speed;

        err = mapper_set_profile(req->set_pot_config.profile, &profile, true);
        if (err != 0) {
            return BTJP_ERR_INVALID_ARG;
        }
    } break;

    case BTJP_MSG_SET_ENC_CONFIG: {
        CHECK_REQ_SIZE(req, sizeof(req->set_enc_config));

        mapper_profile_t profile;
        int err = mapper_get_profile(req->set_enc_config.profile, &profile);
        if (err != 0) {
            LOG_ERR("Invalid profile #%d", req->set_enc_config.profile);
            return BTJP_ERR_INVALID_ARG;
        }

        mapper_enc_config_t *config = profile_enc(&profile, req->set_enc_config.enc_id);
        if (config == NULL) {
            LOG_ERR("Invalid encoder ID %d", req->set_enc_config.enc_id);
            return BTJP_ERR_INVALID_ARG;
        }

        config->source = req->set_enc_config.source;

        err = mapper_set_profile(req->set_enc_config.profile, &profile, true);
        if (err != 0) {
            return BTJP_ERR_INVALID_ARG;
        }
    } break;

    case BTJP_MSG_SET_MODE: {
        CHECK_REQ_SIZE(req, sizeof(req->set_mode));
        CHECK_REQ_ARG(req->set_mode.mode <= DEVMGR_MODE_MANUAL);

        devmgr_mode_t mode = (devmgr_mode_t)req->set_mode.mode;
        bool restart = req->set_mode.restart ? true : false;

        devmgr_set_mode(mode, restart);
    } break;

    case BTJP_MSG_SET_PROFILE: {
        CHECK_REQ_SIZE(req, sizeof(req->set_profile));

        mapper_profile_t profile = {0};

        for (int i = 0; i < ARRAY_SIZE(req->set_profile.pins); i++) {
            mapper_pin_config_t *pin = profile_pin(&profile, i);
            pin->source = req->set_profile.pins[i].source;
            pin->invert = req->set_profile.pins[i].invert ? true : false;
            pin->hat_switch = req->set_profile.pins[i].hat_switch;
            pin->threshold = req->set_profile.pins[i].threshold;
            pin->hysteresis = req->set_profile.pins[i].hysteresis;
        }

        for (int i = 0; i < ARRAY_SIZE(req->set_profile.pots); i++) {
            mapper_pot_config_t *pot = profile_pot(&profile, i);
            pot->source = req->set_profile.pots[i].source;
            pot->low = req->set_profile.pots[i].low;
            pot->high = req->set_profile.pots[i].high;
            pot->int_speed = req->set_profile.pots[i].int_speed;
        }

        for (int i = 0; i < ARRAY_SIZE(req->set_profile.encs); i++) {
            mapper_enc_config_t *enc = profile_enc(&profile, i);
            enc->source = req->set_profile.encs[i].source;
        }

        // Save updated profile
        int err = mapper_set_profile(req->set_profile.profile, &profile, true);
        if (err) {
            return BTJP_ERR_INVALID_ARG;
        }
    }

    case BTJP_MSG_FACTORY_RESET: {
    } break;

    case BTJP_MSG_START_SCANNING: {
        CHECK_REQ_SIZE(req, 0);

        int err = devmgr_start_scanning();
        if (err != 0) {
            return BTJP_ERR_INVALID_ARG;
        }
    } break;

    case BTJP_MSG_STOP_SCANNING: {
        CHECK_REQ_SIZE(req, 0);

        devmgr_stop_scanning();
    } break;

    case BTJP_MSG_CONNECT_DEVICE: {
        CHECK_REQ_SIZE(req, sizeof(req->connect_device));

        bt_addr_le_t addr;
        dev_addr_to_bt_addr_le(&req->connect_device.addr, &addr);

        int err = devmgr_connect(&addr);
        if (err != 0) {
            return BTJP_ERR_INVALID_ARG;
        }
    } break;

    case BTJP_MSG_DELETE_DEVICE: {
        CHECK_REQ_SIZE(req, sizeof(req->delete_device));

        bt_addr_le_t addr;
        dev_addr_to_bt_addr_le(&req->delete_device.addr, &addr);

        int err = devmgr_delete_device(&addr);
        if (err != 0) {
            return BTJP_ERR_INVALID_ARG;
        }
    } break;

    default:
        return BTJP_ERR_UNKNOWN_MSG;
    }

    return BTJP_ERR_NONE;
}

size_t btjp_handle_message(const void *inbuff, size_t insize, void *outbuff, size_t outsize)
{
    if (insize < sizeof(btjp_msg_header_t) || outsize < sizeof(btjp_rsp_t)) {
        LOG_ERR("Invalid buffer size");
        return 0;
    }

    btjp_req_t *req = (btjp_req_t *)inbuff;
    btjp_rsp_t *rsp = (btjp_rsp_t *)outbuff;

    if ((req->hdr.flags & BTJP_MSG_TYPE_MASK) != BTJP_MSG_TYPE_REQUEST) {
        // Not a request message
        LOG_ERR("Not a request message");
        return 0;
    }

    LOG_HEXDUMP_INF(inbuff, insize, "Received message");

    memset(rsp, 0, outsize);
    rsp->hdr.seq = req->hdr.seq;
    rsp->hdr.msg_id = req->hdr.msg_id;
    rsp->hdr.flags = BTJP_MSG_TYPE_RESPONSE;

    btjp_status_t status = btjp_handle_request(req, rsp);

    if (status != BTJP_ERR_NONE) {
        LOG_ERR("Request handling error {status: %d}", status);
        rsp->hdr.flags = BTJP_MSG_TYPE_ERROR;
        rsp->error.code = status;
        rsp->hdr.size = sizeof(rsp->error);
    }

    LOG_HEXDUMP_INF(outbuff, sizeof(btjp_msg_header_t) + rsp->hdr.size, "Sending response");

    return sizeof(btjp_msg_header_t) + rsp->hdr.size;
}
