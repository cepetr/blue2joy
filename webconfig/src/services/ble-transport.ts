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

const SERVICE_UUID = "1c3b0000-03f0-5b46-7a5a-10a4d8eb5964";
const REQUEST_CHAR_UUID = "1c3b0002-03f0-5b46-7a5a-10a4d8eb5964";
const RESPONSE_CHAR_UUID = "1c3b0003-03f0-5b46-7a5a-10a4d8eb5964";

type WebBluetoothNavigator = {
  requestDevice(options: {
    filters?: Array<{ services?: Array<string | number> }>;
    optionalServices?: Array<string | number>;
  }): Promise<BluetoothDevice>;
};

export class BleTransport implements BtjTransport {
  private requestChar: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private readyPromise: Promise<void> | null = null;
  private frameHandler: BtjFrameHandler | null = null;
  private disconnectHandler: BtjDisconnectHandler | null = null;
  private notifyListener: ((e: Event) => void) | null = null;
  private disconnectListener: (() => void) | null = null;

  constructor(private readonly device: BluetoothDevice) { }

  setFrameHandler(handler: BtjFrameHandler | null): void {
    this.frameHandler = handler;
  }

  setDisconnectHandler(handler: BtjDisconnectHandler | null): void {
    this.disconnectHandler = handler;
  }

  async open(): Promise<void> {
    if (this.requestChar && this.notifyChar) {
      return;
    }

    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = (async () => {
      const server = await this.device.gatt?.connect();
      if (!server) throw new Error("Device is not connected");

      const service = await server.getPrimaryService(SERVICE_UUID);
      this.requestChar = await service.getCharacteristic(REQUEST_CHAR_UUID);
      this.notifyChar = await service.getCharacteristic(RESPONSE_CHAR_UUID);

      this.notifyListener = (event: Event) => {
        const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
        if (!value || !this.frameHandler) {
          return;
        }
        this.frameHandler(new Uint8Array(value.buffer.slice(0)));
      };

      this.disconnectListener = () => {
        this.cleanupGattState();
        this.disconnectHandler?.(new Error("Bluetooth device disconnected"));
      };

      this.notifyChar.addEventListener(
        "characteristicvaluechanged",
        this.notifyListener,
      );
      await this.notifyChar.startNotifications();
      this.device.addEventListener(
        "gattserverdisconnected",
        this.disconnectListener,
      );
    })().catch((err) => {
      this.cleanupGattState();
      throw err;
    });

    return this.readyPromise;
  }

  async close(): Promise<void> {
    try {
      if (this.notifyChar) {
        try {
          await this.notifyChar.stopNotifications();
        } catch {
          // Ignore stop errors during shutdown.
        }
      }
    } finally {
      this.cleanupGattState();
      try {
        const server = this.device.gatt;
        if (server?.connected) {
          server.disconnect();
        }
      } catch {
        // Ignore disconnect errors during shutdown.
      }
    }
  }

  async sendFrame(frame: Uint8Array): Promise<void> {
    await this.open();
    await this.requestChar!.writeValue(new Uint8Array(Array.from(frame)));
  }

  private cleanupGattState(): void {
    if (this.notifyChar && this.notifyListener) {
      this.notifyChar.removeEventListener(
        "characteristicvaluechanged",
        this.notifyListener,
      );
    }
    if (this.disconnectListener) {
      this.device.removeEventListener(
        "gattserverdisconnected",
        this.disconnectListener,
      );
    }
    this.notifyListener = null;
    this.disconnectListener = null;
    this.requestChar = null;
    this.notifyChar = null;
    this.readyPromise = null;
  }
}

export async function scanAndSelectBluetoothTransport(): Promise<BtjTransport> {
  const bluetooth = getNavigatorBluetooth();
  if (!bluetooth) {
    throw new Error("Web Bluetooth is not supported in this browser.");
  }

  const isSecureContext =
    window.isSecureContext ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";

  if (!isSecureContext) {
    throw new Error(
      "Web Bluetooth requires a secure context (https or localhost).",
    );
  }

  const device = await bluetooth.requestDevice({
    filters: [
      {
        services: [SERVICE_UUID],
      },
    ],
    optionalServices: [],
  });

  return new BleTransport(device);
}

function getNavigatorBluetooth(): WebBluetoothNavigator | null {
  const nav = navigator as Navigator & { bluetooth?: WebBluetoothNavigator };
  return nav.bluetooth ?? null;
}
