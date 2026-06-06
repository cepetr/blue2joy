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

import type {
  BtjDisconnectHandler,
  BtjFrameHandler,
  BtjTransport,
} from "./btj-transport";

const BLUE2JOY_USB_VENDOR_ID = 0x1209;
const BLUE2JOY_USB_PRODUCT_ID = 0xb2a8;
const USB_INTERFACE_CLASS_VENDOR_SPECIFIC = 0xff;
const PACKET_HEADER_SIZE = 2;

type WebUsbNavigator = Navigator & {
  usb?: USB;
};

export class UsbTransport implements BtjTransport {
  private deviceOpened = false;
  private claimedInterfaceNumber: number | null = null;
  private inEndpointNumber: number | null = null;
  private inPacketSize = 64;
  private outEndpointNumber: number | null = null;
  private frameHandler: BtjFrameHandler | null = null;
  private disconnectHandler: BtjDisconnectHandler | null = null;
  private disconnectListener: ((event: USBConnectionEvent) => void) | null =
    null;
  private readLoopPromise: Promise<void> | null = null;
  private closing = false;
  private rxBuffer = new Uint8Array(0);

  constructor(private readonly device: USBDevice) { }

  setFrameHandler(handler: BtjFrameHandler | null): void {
    this.frameHandler = handler;
  }

  setDisconnectHandler(handler: BtjDisconnectHandler | null): void {
    this.disconnectHandler = handler;
  }

  async open(): Promise<void> {
    if (this.deviceOpened && this.claimedInterfaceNumber !== null) {
      return;
    }

    const usb = getNavigatorUsb();

    this.closing = false;
    await this.device.open();
    this.deviceOpened = true;

    if (this.device.configuration === null) {
      await this.device.selectConfiguration(1);
    }

    const endpoints = this.findInterfaceEndpoints();
    this.claimedInterfaceNumber = endpoints.interfaceNumber;
    this.inEndpointNumber = endpoints.inEndpointNumber;
    this.inPacketSize = endpoints.inPacketSize;
    this.outEndpointNumber = endpoints.outEndpointNumber;

    await this.device.claimInterface(this.claimedInterfaceNumber);

    if (usb && !this.disconnectListener) {
      this.disconnectListener = (event: USBConnectionEvent) => {
        if (event.device !== this.device || this.closing) {
          return;
        }
        void this.handleDisconnect(new Error("USB device disconnected"));
      };
      usb.addEventListener("disconnect", this.disconnectListener);
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    this.removeDisconnectListener();

    const readLoopPromise = this.readLoopPromise;
    this.readLoopPromise = null;

    try {
      if (this.claimedInterfaceNumber !== null) {
        try {
          await this.device.releaseInterface(this.claimedInterfaceNumber);
        } catch {
          // Ignore release failures during shutdown.
        }
      }

      if (this.device.opened) {
        await this.device.close();
      }
    } finally {
      this.resetState();
      await readLoopPromise?.catch(() => { });
    }
  }

  async sendFrame(frame: Uint8Array): Promise<void> {
    await this.open();

    if (this.outEndpointNumber === null) {
      throw new Error("WebUSB OUT endpoint is not available");
    }

    if (frame.length > 0xffff) {
      throw new Error("BTJP frame is too large for WebUSB transport");
    }

    const packet = new Uint8Array(PACKET_HEADER_SIZE + frame.length);
    packet[0] = frame.length & 0xff;
    packet[1] = (frame.length >>> 8) & 0xff;
    packet.set(frame, PACKET_HEADER_SIZE);

    const result = await this.device.transferOut(
      this.outEndpointNumber,
      packet,
    );
    if (result.status !== "ok") {
      throw new Error(`USB write failed: ${result.status}`);
    }

    if (!this.readLoopPromise) {
      this.readLoopPromise = this.readLoop().catch((err) => {
        if (this.closing || isTransferCancelled(err)) {
          return;
        }
        void this.handleDisconnect(err);
      });
    }
  }

  private async readLoop(): Promise<void> {
    while (!this.closing) {
      if (this.inEndpointNumber === null) {
        throw new Error("WebUSB IN endpoint is not available");
      }

      const result = await this.device.transferIn(
        this.inEndpointNumber,
        this.inPacketSize,
      );

      if (result.status === "stall") {
        await this.device.clearHalt("in", this.inEndpointNumber);
        continue;
      }

      if (result.status !== "ok") {
        throw new Error(`USB read failed: ${result.status}`);
      }

      const view = result.data;
      if (!view || view.byteLength === 0) {
        continue;
      }

      const chunk = new Uint8Array(
        view.buffer,
        view.byteOffset,
        view.byteLength,
      );
      this.rxBuffer = concatUint8Arrays(this.rxBuffer, chunk);
      this.drainPackets();
    }
  }

  private drainPackets(): void {
    while (this.rxBuffer.length >= PACKET_HEADER_SIZE) {
      const size = this.rxBuffer[0] | (this.rxBuffer[1] << 8);
      const packetLength = PACKET_HEADER_SIZE + size;
      if (this.rxBuffer.length < packetLength) {
        return;
      }

      const frame = this.rxBuffer.slice(PACKET_HEADER_SIZE, packetLength);
      this.rxBuffer = this.rxBuffer.slice(packetLength);
      this.frameHandler?.(frame);
    }
  }

  private findInterfaceEndpoints(): {
    interfaceNumber: number;
    inEndpointNumber: number;
    inPacketSize: number;
    outEndpointNumber: number;
  } {
    const configuration = this.device.configuration;
    if (!configuration) {
      throw new Error("USB device has no active configuration");
    }

    for (const iface of configuration.interfaces) {
      for (const alternate of iface.alternates) {
        if (alternate.interfaceClass !== USB_INTERFACE_CLASS_VENDOR_SPECIFIC) {
          continue;
        }

        const inEndpoint = alternate.endpoints.find(
          (endpoint) => endpoint.type === "bulk" && endpoint.direction === "in",
        );
        const outEndpoint = alternate.endpoints.find(
          (endpoint) =>
            endpoint.type === "bulk" && endpoint.direction === "out",
        );

        if (!inEndpoint || !outEndpoint) {
          continue;
        }

        return {
          interfaceNumber: iface.interfaceNumber,
          inEndpointNumber: inEndpoint.endpointNumber,
          inPacketSize: inEndpoint.packetSize,
          outEndpointNumber: outEndpoint.endpointNumber,
        };
      }
    }

    throw new Error("Blue2Joy WebUSB interface was not found");
  }

  private async handleDisconnect(reason: unknown): Promise<void> {
    try {
      await this.close();
    } finally {
      this.disconnectHandler?.(reason);
    }
  }

  private removeDisconnectListener(): void {
    const usb = getNavigatorUsb();
    if (usb && this.disconnectListener) {
      usb.removeEventListener("disconnect", this.disconnectListener);
    }
    this.disconnectListener = null;
  }

  private resetState(): void {
    this.deviceOpened = false;
    this.claimedInterfaceNumber = null;
    this.inEndpointNumber = null;
    this.inPacketSize = 64;
    this.outEndpointNumber = null;
    this.rxBuffer = new Uint8Array(0);
  }
}

export async function scanAndSelectWebUsbTransport(): Promise<BtjTransport> {
  const usb = getNavigatorUsb();
  if (!usb) {
    throw new Error("WebUSB is not supported in this browser.");
  }

  const isSecureContext =
    window.isSecureContext ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";

  if (!isSecureContext) {
    throw new Error("WebUSB requires a secure context (https or localhost).");
  }

  const device = await usb.requestDevice({
    filters: [
      {
        vendorId: BLUE2JOY_USB_VENDOR_ID,
        productId: BLUE2JOY_USB_PRODUCT_ID,
      },
    ],
  });

  return new UsbTransport(device);
}

function getNavigatorUsb(): USB | null {
  return (navigator as WebUsbNavigator).usb ?? null;
}

function concatUint8Arrays(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.length === 0) {
    return right.slice();
  }
  if (right.length === 0) {
    return left;
  }

  const merged = new Uint8Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
}

function isTransferCancelled(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "AbortError" || err.name === "NetworkError")
  );
}
