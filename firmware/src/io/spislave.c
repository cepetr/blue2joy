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

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/logging/log.h>
#include <zephyr/drivers/spi.h>

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

static const struct device *spi_dev = DEVICE_DT_GET(DT_NODELABEL(spi1));

static int spi_slave_continue(void);

int spi_slave_init(void)
{
    if (device_is_ready(spi_dev)) {
        // Device was already initialized
    } else {
        int err = device_init(spi_dev);
        if (err < 0) {
            LOG_ERR("Failed to initialize SPI slave {err: %d}", err);
            return err;
        } else {
            LOG_INF("SPI slave initialized successfully");
        }
    }

    return spi_slave_continue();
}

void spi_slave_deinit(void)
{
}

static void spi_callback(const struct device *dev, int result, void *data)
{
    if (result < 0) {
        LOG_ERR("SPI transfer failed with error: %d", result);
    } else {
        LOG_INF("SPI transfer completed %02x %02x %02x %02x", ((uint8_t *)data)[0],
                ((uint8_t *)data)[1], ((uint8_t *)data)[2], ((uint8_t *)data)[3]);
    }

    spi_slave_continue();
}

static int spi_slave_continue(void)
{
    static const struct spi_config config = {
        .operation =
            SPI_OP_MODE_SLAVE | SPI_WORD_SET(8) | SPI_TRANSFER_MSB | SPI_MODE_CPHA | SPI_MODE_CPOL,
        .frequency = 4000000,
        .slave = 0,
    };

    static uint8_t tx_data[4] = {0x10, 0x21, 0x32, 0x43};
    static uint8_t rx_data[4] = {0};

    tx_data[0] = 0x55;
    tx_data[1] = 0x55;
    tx_data[2] = 0x55;
    tx_data[3] = 0x00;

    static const struct spi_buf tx_buf = {
        .buf = tx_data,
        .len = sizeof(tx_data),
    };

    static const struct spi_buf rx_buf = {
        .buf = rx_data,
        .len = sizeof(rx_data),
    };

    static const struct spi_buf_set tx_bufs = {
        .buffers = &tx_buf,
        .count = 1,
    };

    static const struct spi_buf_set rx_bufs = {
        .buffers = &rx_buf,
        .count = 1,
    };

    int err = spi_transceive_cb(spi_dev, &config, &tx_bufs, &rx_bufs, spi_callback, rx_data);

    if (err < 0) {
        LOG_ERR("SPI transceive failed {err: %d}", err);
    }

    return err;
}
