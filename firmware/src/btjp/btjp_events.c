#include <zephyr/logging/log.h>

#include <devmgr/devmgr.h>
#include <mapper/mapper.h>

#include "btjp.h"
#include "btjp_utils.h"

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

static size_t btjp_build_evt_sys_state_update(btjp_evt_t *evt)
{
    evt->hdr.msg_id = BTJP_MSG_EVT_SYS_STATE_UPDATE;
    evt->hdr.size = sizeof(evt->sys_state_update);

    devmgr_state_t state;
    devmgr_get_state(&state);

    evt->sys_state_update.scanning = state.scanning ? 1 : 0;
    evt->sys_state_update.mode = (uint8_t)state.mode;

    return sizeof(btjp_msg_header_t) + evt->hdr.size;
}

static size_t btjp_build_evt_adv_list_update(btjp_evt_t *evt, bt_addr_le_t *addr)
{
    evt->hdr.msg_id = BTJP_MSG_EVT_ADV_LIST_UPDATE;
    evt->hdr.size = sizeof(evt->adv_list_update);

    dev_addr_from_bt_addr_le(&evt->adv_list_update.addr, addr);

    devmgr_adv_entry_t entry;
    int err = devmgr_get_adv_device(addr, &entry);

    if (!err) {
        evt->adv_list_update.deleted = false;
        evt->adv_list_update.rssi = entry.rssi;
        strncpy(evt->adv_list_update.name, entry.name, sizeof(evt->adv_list_update.name) - 1);
    } else {
        evt->adv_list_update.deleted = true;
    }

    return sizeof(btjp_msg_header_t) + evt->hdr.size;
}

static size_t btjp_build_evt_dev_list_update(btjp_evt_t *evt, bt_addr_le_t *addr)
{
    evt->hdr.msg_id = BTJP_MSG_EVT_DEV_LIST_UPDATE;
    evt->hdr.size = sizeof(evt->dev_list_update);

    dev_addr_from_bt_addr_le(&evt->dev_list_update.addr, addr);

    devmgr_device_state_t state;
    devmgr_device_config_t config = {0};

    int err = devmgr_get_device_state(addr, &state);

    if (!err) {
        devmgr_get_device_config(addr, &config);
    }

    if (!err) {
        evt->dev_list_update.deleted = false;
        evt->dev_list_update.conn_state = (uint8_t)state.conn_state;
        evt->dev_list_update.bonded = state.bonded ? 1 : 0;
        evt->dev_list_update.profile = config.profile;
    } else {
        evt->dev_list_update.deleted = true;
    }

    return sizeof(btjp_msg_header_t) + evt->hdr.size;
}

static size_t btjp_build_evt_profile_update(btjp_evt_t *evt, uint8_t idx)
{
    evt->hdr.msg_id = BTJP_MSG_EVT_PROFILE_UPDATE;
    evt->hdr.size = sizeof(evt->profile_update);

    mapper_profile_t profile;

    int err = mapper_get_profile(idx, &profile);
    if (err != 0) {
        LOG_ERR("Invalid profile index %d", idx);
        return 0;
    }

    evt->profile_update.profile = idx;

    for (int i = 0; i < ARRAY_SIZE(evt->profile_update.pins); i++) {
        mapper_pin_config_t *pin = profile_pin(&profile, i);
        evt->profile_update.pins[i].source = pin->source;
        evt->profile_update.pins[i].invert = pin->invert ? 1 : 0;
        evt->profile_update.pins[i].hat_switch = pin->hat_switch;
        evt->profile_update.pins[i].threshold = pin->threshold;
        evt->profile_update.pins[i].hysteresis = pin->hysteresis;
    }

    for (int i = 0; i < ARRAY_SIZE(evt->profile_update.pots); i++) {
        mapper_pot_config_t *pot = profile_pot(&profile, i);
        evt->profile_update.pots[i].source = pot->source;
        evt->profile_update.pots[i].low = pot->low;
        evt->profile_update.pots[i].high = pot->high;
        evt->profile_update.pots[i].int_speed = pot->int_speed;
    }

    return sizeof(btjp_msg_header_t) + evt->hdr.size;
}

size_t btjp_build_evt_message(void *outbuff, size_t outsize, event_queue_t *evq)
{
    event_t ev;

    memset(outbuff, 0, outsize);

    if (outsize < sizeof(btjp_evt_t)) {
        LOG_ERR("Output buffer too small");
        return 0;
    }

    btjp_evt_t *evt = (btjp_evt_t *)outbuff;

    evt->hdr.seq = 0;
    evt->hdr.flags = BTJP_MSG_TYPE_EVENT;

    if (event_queue_pop(evq, &ev) != 0) {
        switch (ev.subject) {
        case EV_SUBJECT_SYS_STATE:
            return btjp_build_evt_sys_state_update(evt);
        case EV_SUBJECT_ADV_LIST:
            return btjp_build_evt_adv_list_update(evt, &ev.addr);
        case EV_SUBJECT_DEV_LIST:
            return btjp_build_evt_dev_list_update(evt, &ev.addr);
        case EV_SUBJECT_PROFILE:
            return btjp_build_evt_profile_update(evt, ev.idx);
        default:
            LOG_ERR("Unhandled event subject %d", ev.subject);
        }
    }

    return 0;
}

void btjp_populate_event_queue(event_queue_t *evq)
{
    event_t ev;

    // System state update
    ev.subject = EV_SUBJECT_SYS_STATE;
    ev.action = EV_ACTION_UPDATE;
    event_queue_push(evq, &ev);

    // Device list update
    bt_addr_le_t addrs[DEVMGR_MAX_CONFIG_ENTRIES];
    int n = devmgr_get_devices(addrs);
    for (int i = 0; i < n; i++) {
        ev.subject = EV_SUBJECT_DEV_LIST;
        ev.action = EV_ACTION_CREATE;
        bt_addr_le_copy(&ev.addr, &addrs[i]);
        event_queue_push(evq, &ev);
    }

    // Profiles update
    for (uint8_t i = 0; i < MAPPER_MAX_PROFILES; i++) {
        ev.subject = EV_SUBJECT_PROFILE;
        ev.action = EV_ACTION_CREATE;
        ev.idx = i;
        event_queue_push(evq, &ev);
    }
}
