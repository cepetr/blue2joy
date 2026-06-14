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

#pragma once

#include <stdint.h>
#include <stddef.h>

/** Sends and/or receives data over SPI
 *
 * @param port The SPI port to use (0 or 1)
 * @param tx Pointer to the data to send (can be NULL if no data is sent)
 * @param rx Pointer to the buffer to store received data (can be NULL if no data is received)
 * @param len The number of bytes to transfer
 *
 * */
void spi_transfer(uint8_t port, const uint8_t *tx, uint8_t *rx, size_t len);