/*
 * This file is part of the Blue2Joy project - an interface converter
 * between a Bluetooth gamepad and a retro console joystick
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

#include <stdio.h>
#include <atari.h>

#include "spi.h"

int main()
{
    uint8_t tx[4] = {0xAA, 0x01, 0x02, 0x55};
    uint8_t rx[4]; // = {0};

    for (;;)
    {
        spi_transfer(0, tx, rx, sizeof(tx));
        printf("Received: %02x %02x %02x %02x\n", rx[0], rx[1], rx[2], rx[3]);
        spi_transfer(1, tx, rx, sizeof(tx));
    }

    return 0;
}