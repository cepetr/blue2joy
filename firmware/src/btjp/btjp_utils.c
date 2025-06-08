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

#include "btjp_utils.h"

void dev_addr_to_bt_addr_le(const btjp_dev_addr_t *src, bt_addr_le_t *dst)
{
    _Static_assert(sizeof(*src) == sizeof(*dst), "Invalid btjp_addr_t size");
    memcpy(dst, src, sizeof(*dst));
}

void dev_addr_from_bt_addr_le(btjp_dev_addr_t *dst, const bt_addr_le_t *src)
{
    _Static_assert(sizeof(*src) == sizeof(*dst), "Invalid btjp_addr_t size");
    memcpy(dst, src, sizeof(*dst));
}

mapper_pin_config_t *profile_pin(mapper_profile_t *profile, uint8_t pin_id)
{
    switch (pin_id) {
    case BTJP_PIN_UP:
        return &profile->up;
    case BTJP_PIN_DOWN:
        return &profile->down;
    case BTJP_PIN_LEFT:
        return &profile->left;
    case BTJP_PIN_RIGHT:
        return &profile->right;
    case BTJP_PIN_TRIGGER:
        return &profile->trigger;
    default:
        return NULL;
    }
}

mapper_pot_config_t *profile_pot(mapper_profile_t *profile, uint8_t pin_id)
{
    switch (pin_id) {
    case BTJP_POT_1:
        return &profile->pot0;
    case BTJP_POT_2:
        return &profile->pot1;
    default:
        return NULL;
    }
}
