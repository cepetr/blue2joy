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

#include <atari.h>

#include "spi.h"

#define SPI_CS(port)   ((port) ? 0x10 : 0x01)
#define SPI_CLK(port)  ((port) ? 0x20 : 0x02)
#define SPI_MOSI(port) ((port) ? 0x40 : 0x04)
#define SPI_MISO(Port) ((port) ? 0x80 : 0x08)

static void spi_io_init(uint8_t port)
{
    // Set all outputs to 1 to prevent glitches
    PIA.pactl |= 4;
    PIA.porta = 0xFF;

    // Set CS, CLK and MOSI as outputs, MISO as input
    PIA.pactl &= ~4;
    PIA.porta = (PIA.porta | (SPI_CS(port) | SPI_CLK(port) | SPI_MOSI(port))) & ~SPI_MISO(port);
    PIA.pactl |= 4;
}

static void spi_io_deinit(uint8_t port)
{
    // Set CS, CLK and MISO as inputs
    PIA.pactl &= ~4;
    PIA.porta = PIA.porta & ~(SPI_CS(port) | SPI_CLK(port) | SPI_MOSI(port));
    PIA.pactl |= 4;
}

static void spi_wait()
{
    ANTIC.wsync = 0;
}

static uint8_t spi_transfer_8bit(uint8_t port, uint8_t tx_byte)
{
    uint8_t porta = 0xFF & ~SPI_CS(port);
    uint8_t rx_byte = 0;

    for (size_t i = 0; i < 8; i++) {
        if (tx_byte & 0x80) {
            porta |= SPI_MOSI(port);
        } else {
            porta &= ~SPI_MOSI(port);
        }
        tx_byte <<= 1;

        // CLK falling edge
        spi_wait();
        PIA.porta = porta & ~SPI_CLK(port);

        // CLK rising edge
        spi_wait();
        PIA.porta = porta | SPI_CLK(port);
        rx_byte = (rx_byte << 1) | ((PIA.porta & SPI_MISO(port)) ? 1 : 0);
    }

    spi_wait();

    return rx_byte;
}

void spi_transfer(uint8_t port, const uint8_t *tx, uint8_t *rx, size_t len)
{
    spi_io_init(port);
    spi_wait();

    // Set CS low to start the SPI transaction
    PIA.porta = 0xFF & ~SPI_CS(port);
    spi_wait();

    // Transfer data byte by byte
    for (size_t i = 0; i < len; i++) {
        uint8_t tx_byte = (tx != NULL) ? tx[i] : 0x00;
        uint8_t rx_byte = spi_transfer_8bit(port, tx_byte);
        if (rx != NULL) {
            rx[i] = rx_byte;
        }
    }

    // Set CS high to end the SPI transaction
    spi_wait();
    spi_io_deinit(port);
}
