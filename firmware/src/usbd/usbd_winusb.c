/*
 * This file is part of the Blue2Joy project
 * (https://github.com/cepetr/blue2joy).
 * Copyright (c) 2026
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

#include <zephyr/net_buf.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/util.h>
#include <zephyr/usb/bos.h>
#include <zephyr/usb/msos_desc.h>

#include <zephyr/logging/log.h>

#include "usbd_winusb.h"

LOG_MODULE_REGISTER(btj_winusb, LOG_LEVEL_INF);

// Purpose:
// Expose Microsoft OS 2.0 descriptors so Windows binds the vendor USB interface
// to WinUSB automatically (no INF/Zadig). WebUSB in the browser then talks to
// that interface via the OS-provided WinUSB driver.

// Vendor request code used by Windows to fetch the MS OS 2.0 descriptor set.
#define BTJ_MSOS2_VENDOR_CODE 0x20U

// Windows version 10.0
#define BTJ_MSOS2_WINDOWS_VERSION 0x0A000000UL

// Interface number 2 is the vendor-specific WebUSB interface in current composition.
#define BTJ_WINUSB_INTERFACE_NUMBER 0x02U

// Device interface GUID: {0545F801-C5AF-465D-8F4E-742528CEC8E8}
#define BTJ_DEVICE_INTERFACE_GUID                                                                  \
    '{', 0x00, '0', 0x00, '5', 0x00, '4', 0x00, '5', 0x00, 'F', 0x00, '8', 0x00, '0', 0x00, '1',   \
        0x00, '-', 0x00, 'C', 0x00, '5', 0x00, 'A', 0x00, 'F', 0x00, '-', 0x00, '4', 0x00, '6',    \
        0x00, '5', 0x00, 'D', 0x00, '-', 0x00, '8', 0x00, 'F', 0x00, '4', 0x00, 'E', 0x00, '-',    \
        0x00, '7', 0x00, '4', 0x00, '2', 0x00, '5', 0x00, '2', 0x00, '8', 0x00, 'C', 0x00, 'E',    \
        0x00, 'C', 0x00, '8', 0x00, 'E', 0x00, '8', 0x00, '}', 0x00, 0x00, 0x00, 0x00, 0x00

struct btj_msosv2_descriptor {
    struct msosv2_descriptor_set_header header;
    struct msosv2_function_subset_header function_subset;
    struct msosv2_compatible_id compatible_id;
    struct msosv2_guids_property guids_property;
} __packed;

static const struct btj_msosv2_descriptor g_msosv2_desc = {
    .header =
        {
            .wLength = sizeof(struct msosv2_descriptor_set_header),
            .wDescriptorType = MS_OS_20_SET_HEADER_DESCRIPTOR,
            .dwWindowsVersion = sys_cpu_to_le32(BTJ_MSOS2_WINDOWS_VERSION),
            .wTotalLength = sizeof(g_msosv2_desc),
        },
    .function_subset =
        {
            .wLength = sizeof(struct msosv2_function_subset_header),
            .wDescriptorType = MS_OS_20_SUBSET_HEADER_FUNCTION,
            .bFirstInterface = BTJ_WINUSB_INTERFACE_NUMBER,
            .wSubsetLength = sizeof(struct msosv2_function_subset_header) +
                             sizeof(struct msosv2_compatible_id) +
                             sizeof(struct msosv2_guids_property),
        },
    .compatible_id =
        {
            .wLength = sizeof(struct msosv2_compatible_id),
            .wDescriptorType = MS_OS_20_FEATURE_COMPATIBLE_ID,
            .CompatibleID = {'W', 'I', 'N', 'U', 'S', 'B', 0x00, 0x00},
        },
    .guids_property =
        {
            .wLength = sizeof(struct msosv2_guids_property),
            .wDescriptorType = MS_OS_20_FEATURE_REG_PROPERTY,
            .wPropertyDataType = MS_OS_20_PROPERTY_DATA_REG_MULTI_SZ,
            .wPropertyNameLength = 42,
            .PropertyName = {DEVICE_INTERFACE_GUIDS_PROPERTY_NAME},
            .wPropertyDataLength = 80,
            .bPropertyData = {BTJ_DEVICE_INTERFACE_GUID},
        },
};

struct btj_bos_msosv2_descriptor {
    struct usb_bos_platform_descriptor platform;
    struct usb_bos_capability_msos cap;
} __packed;

static const struct btj_bos_msosv2_descriptor g_bos_msosv2_desc = {
    .platform =
        {
            .bLength =
                sizeof(struct usb_bos_platform_descriptor) + sizeof(struct usb_bos_capability_msos),
            .bDescriptorType = USB_DESC_DEVICE_CAPABILITY,
            .bDevCapabilityType = USB_BOS_CAPABILITY_PLATFORM,
            .bReserved = 0,
            /* Microsoft OS 2.0 Platform Capability UUID. */
            .PlatformCapabilityUUID =
                {
                    0xDF,
                    0x60,
                    0xDD,
                    0xD8,
                    0x89,
                    0x45,
                    0xC7,
                    0x4C,
                    0x9C,
                    0xD2,
                    0x65,
                    0x9D,
                    0x9E,
                    0x64,
                    0x8A,
                    0x9F,
                },
        },
    .cap =
        {
            .dwWindowsVersion = sys_cpu_to_le32(BTJ_MSOS2_WINDOWS_VERSION),
            .wMSOSDescriptorSetTotalLength = sys_cpu_to_le16(sizeof(g_msosv2_desc)),
            .bMS_VendorCode = BTJ_MSOS2_VENDOR_CODE,
            .bAltEnumCode = 0x00,
        },
};

static int btj_msosv2_to_host_cb(const struct usbd_context *const usbd_ctx,
                                 const struct usb_setup_packet *const setup,
                                 struct net_buf *const buf)
{
    ARG_UNUSED(usbd_ctx);

    if (setup->bRequest != BTJ_MSOS2_VENDOR_CODE || setup->wIndex != MS_OS_20_DESCRIPTOR_INDEX) {
        return -ENOTSUP;
    }

    net_buf_add_mem(buf, &g_msosv2_desc, MIN(net_buf_tailroom(buf), sizeof(g_msosv2_desc)));

    return 0;
}

USBD_DESC_BOS_VREQ_DEFINE(bos_vreq_msosv2, sizeof(g_bos_msosv2_desc), &g_bos_msosv2_desc,
                          BTJ_MSOS2_VENDOR_CODE, btj_msosv2_to_host_cb, NULL);

int btj_usbd_register_winusb(struct usbd_context *const usbd_ctx)
{
    return usbd_add_descriptor(usbd_ctx, &bos_vreq_msosv2);
}
