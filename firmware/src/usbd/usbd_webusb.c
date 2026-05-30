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
#include <zephyr/net_buf.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/drivers/usb/udc.h>

#include <zephyr/logging/log.h>

#include "usbd_webusb.h"

LOG_MODULE_REGISTER(btj_webusb, LOG_LEVEL_DBG);

#define WEBUSB_EP_IN  0x83
#define WEBUSB_EP_OUT 0x02
#define WEBUSB_EP_MPS 64

// WebUSB Class-specific Interface Descriptor
struct webusb_if_descriptor {
    struct usb_if_descriptor if0;
    struct usb_ep_descriptor in_ep;
    struct usb_ep_descriptor out_ep;
} __packed;

// WebUSB Device Data
struct webusb_data {
    struct usbd_class_data *c_data;
    const struct device *dev;
    atomic_t enabled;
    webusb_rx_callback_t rx_callback;
    webusb_status_callback_t status_callback;
    void *callback_context;
};

// Forward declarations for descriptor arrays
static struct usb_desc_header *webusb_fs_desc[];

// Forward declarations
static int webusb_request(struct usbd_class_data *const c_data, struct net_buf *buf, int err);
static void webusb_enable(struct usbd_class_data *const c_data);
static void webusb_disable(struct usbd_class_data *const c_data);
static int webusb_control_to_dev(struct usbd_class_data *const c_data,
                                 const struct usb_setup_packet *const setup,
                                 const struct net_buf *const buf);
static void *webusb_get_desc(struct usbd_class_data *const c_data, const enum usbd_speed speed);
static int webusb_init(struct usbd_class_data *const c_data);
static void webusb_shutdown(struct usbd_class_data *const c_data);
static int webusb_queue_out(struct usbd_class_data *const c_data);

// Class API structure
static struct usbd_class_api g_webusb_api = {
    .request = webusb_request,
    .enable = webusb_enable,
    .disable = webusb_disable,
    .control_to_dev = webusb_control_to_dev,
    .get_desc = webusb_get_desc,
    .init = webusb_init,
    .shutdown = webusb_shutdown,
};

// Handles endpoint request completion
static int webusb_request(struct usbd_class_data *const c_data, struct net_buf *buf, int err)
{
    struct udc_buf_info *bi = udc_get_buf_info(buf);
    struct webusb_data *data = usbd_class_get_private(c_data);
    struct usbd_context *ctx = usbd_class_get_ctx(c_data);
    const struct device *dev = (ctx != NULL) ? ctx->dev : NULL;

    if (dev == NULL) {
        LOG_ERR("USB device context is NULL in request callback");
        net_buf_unref(buf);
        return -ENODEV;
    }

    if (err) {
        LOG_ERR("Request error on EP 0x%02x: %d", bi->ep, err);
        return err;
    }

    if (USB_EP_DIR_IS_OUT(bi->ep)) {
        LOG_DBG("OUT transfer completed on EP 0x%02x, len %u", bi->ep, buf->len);

        if (data->rx_callback != NULL) {
            data->rx_callback(data->callback_context, buf->data, buf->len);
        }

        net_buf_reset(buf);
        bi->owner = c_data;

        if (udc_ep_enqueue(dev, buf) != 0) {
            udc_ep_buf_free(dev, buf);
        }

    } else {
        LOG_DBG("IN transfer completed on EP 0x%02x", bi->ep);
        udc_ep_buf_free(dev, buf);
    }

    return 0;
}

// Enables WebUSB function
static void webusb_enable(struct usbd_class_data *const c_data)
{
    struct webusb_data *data = usbd_class_get_private(c_data);

    LOG_INF("WebUSB function enabled");

    atomic_set(&data->enabled, true);

    if (data->status_callback != NULL) {
        data->status_callback(data->callback_context, true);
    }

    if (webusb_queue_out(c_data) != 0) {
        LOG_WRN("Failed to queue initial OUT buffer");
    }
}

// Disables WebUSB function
static void webusb_disable(struct usbd_class_data *const c_data)
{
    struct webusb_data *data = usbd_class_get_private(c_data);

    LOG_INF("WebUSB function disabled");

    atomic_set(&data->enabled, false);

    if (data->status_callback != NULL) {
        data->status_callback(data->callback_context, false);
    }
}

// Handles control transfer to device (host-to-device)
static int webusb_control_to_dev(struct usbd_class_data *const c_data,
                                 const struct usb_setup_packet *const setup,
                                 const struct net_buf *const buf)
{
    ARG_UNUSED(c_data);
    ARG_UNUSED(buf);

    LOG_DBG("Control to dev: bRequest=0x%02x, wValue=0x%04x", setup->bRequest, setup->wValue);

    // Handle host-to-device control transfers
    errno = -ENOTSUP;
    return 0;
}

// Gets descriptor for the class
static void *webusb_get_desc(struct usbd_class_data *const c_data, const enum usbd_speed speed)
{
    ARG_UNUSED(c_data);
    ARG_UNUSED(speed);

    return webusb_fs_desc;
}

// Initializes WebUSB class instance
static int webusb_init(struct usbd_class_data *const c_data)
{
    struct webusb_data *data = usbd_class_get_private(c_data);
    struct usbd_context *ctx = usbd_class_get_ctx(c_data);

    LOG_INF("Initializing WebUSB class instance %p", c_data);

    atomic_set(&data->enabled, false);

    data->c_data = c_data;
    data->dev = ctx ? ctx->dev : NULL;

    return 0;
}

// Shuts down WebUSB class instance
static void webusb_shutdown(struct usbd_class_data *const c_data)
{
    struct webusb_data *data = usbd_class_get_private(c_data);

    bool was_enabled = atomic_set(&data->enabled, false);

    LOG_INF("Shutting down WebUSB class instance");

    data->c_data = c_data;
    data->dev = NULL;

    if (was_enabled && data->status_callback != NULL) {
        data->status_callback(data->callback_context, false);
    }
}

static int webusb_queue_out(struct usbd_class_data *const c_data)
{
    struct usbd_context *ctx = usbd_class_get_ctx(c_data);
    const struct device *dev = (ctx != NULL) ? ctx->dev : NULL;

    if (dev == NULL) {
        LOG_ERR("USB device context is NULL in queue out callback");
        return -ENODEV;
    }

    struct net_buf *buf = udc_ep_buf_alloc(dev, WEBUSB_EP_OUT, WEBUSB_EP_MPS);
    if (!buf) {
        return -ENOMEM;
    }

    struct udc_buf_info *bi = udc_get_buf_info(buf);
    bi->owner = c_data;

    return udc_ep_enqueue(dev, buf);
}

// WebUSB descriptor definition
static struct webusb_if_descriptor g_webusb_desc = {
    .if0 =
        {
            .bLength = sizeof(struct usb_if_descriptor),
            .bDescriptorType = USB_DESC_INTERFACE,
            .bInterfaceNumber = 0,
            .bAlternateSetting = 0,
            .bNumEndpoints = 2,
            .bInterfaceClass = USB_BCC_VENDOR,
            .bInterfaceSubClass = 0,
            .bInterfaceProtocol = 0,
            .iInterface = 0,
        },
    .in_ep =
        {
            .bLength = sizeof(struct usb_ep_descriptor),
            .bDescriptorType = USB_DESC_ENDPOINT,
            .bEndpointAddress = WEBUSB_EP_IN,
            .bmAttributes = USB_EP_TYPE_BULK,
            .wMaxPacketSize = sys_cpu_to_le16(WEBUSB_EP_MPS),
            .bInterval = 0,
        },
    .out_ep =
        {
            .bLength = sizeof(struct usb_ep_descriptor),
            .bDescriptorType = USB_DESC_ENDPOINT,
            .bEndpointAddress = WEBUSB_EP_OUT,
            .bmAttributes = USB_EP_TYPE_BULK,
            .wMaxPacketSize = sys_cpu_to_le16(WEBUSB_EP_MPS),
            .bInterval = 0,
        },
};

// Descriptor array for Full Speed
static struct usb_desc_header *webusb_fs_desc[] = {
    (struct usb_desc_header *)&g_webusb_desc.if0,
    (struct usb_desc_header *)&g_webusb_desc.in_ep,
    (struct usb_desc_header *)&g_webusb_desc.out_ep,
    (struct usb_desc_header *)NULL,
};

// WebUSB data
static struct webusb_data g_webusb_data = {
    .dev = NULL, // Will be set during device initialization
    .enabled = false,
};

// Define the WebUSB class
USBD_DEFINE_CLASS(g_webusb, &g_webusb_api, &g_webusb_data, NULL);

struct usbd_class_data *btj_webusb_get_class_data(void)
{
    return &g_webusb;
}

bool btj_webusb_is_enabled(void)
{
    return atomic_get(&g_webusb_data.enabled);
}

int btj_webusb_send(const uint8_t *data, size_t len)
{
    struct webusb_data *wdata = &g_webusb_data;

    if (data == NULL || len == 0) {
        return -EINVAL;
    }

    if (!atomic_get(&wdata->enabled) || wdata->c_data == NULL) {
        return -EACCES;
    }

    struct usbd_context *ctx = usbd_class_get_ctx(wdata->c_data);
    const struct device *dev = (ctx != NULL) ? ctx->dev : NULL;

    if (dev == NULL) {
        return -ENODEV;
    }

    struct net_buf *buf = udc_ep_buf_alloc(dev, WEBUSB_EP_IN, len);
    if (buf == NULL) {
        return -ENOMEM;
    }

    struct udc_buf_info *bi = udc_get_buf_info(buf);
    bi->owner = wdata->c_data;

    net_buf_add_mem(buf, data, len);

    int err = udc_ep_enqueue(dev, buf);
    if (err) {
        udc_ep_buf_free(dev, buf);
        return err;
    }

    return 0;
}

int btj_webusb_register_callbacks(webusb_rx_callback_t rx_cb, webusb_status_callback_t status_cb,
                                  void *context)
{
    struct webusb_data *wdata = &g_webusb_data;

    wdata->rx_callback = rx_cb;
    wdata->status_callback = status_cb;
    wdata->callback_context = context;

    return 0;
}