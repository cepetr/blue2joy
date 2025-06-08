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

import { Btj } from './btj-messages';

const SERVICE_UUID = '1c3b0000-03f0-5b46-7a5a-10a4d8eb5964';
const REQUEST_CHAR_UUID = '1c3b0002-03f0-5b46-7a5a-10a4d8eb5964';
const RESPONSE_CHAR_UUID = '1c3b0003-03f0-5b46-7a5a-10a4d8eb5964';

const MSG_TYPE_MASK = 0x03;
const MSG_TYPE_REQUEST = 0;
const MSG_TYPE_EVENT = 1;
const MSG_TYPE_RESPONSE = 2;
const MSG_TYPE_ERROR = 3;

const OFFSET_FLAGS = 0;
const OFFSET_MSGID = 1;
const OFFSET_SEQ = 2;
const OFFSET_SIZE = 3;
const HEADER_SIZE = 4;

export class BtjConnection {
  private device: BluetoothDevice;
  private requestChar: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private readyPromise: Promise<void> | null = null;

  private notifyHandler: ((e: Event) => void) | null = null;
  private eventHandler: ((msgId: number, payload: DataView) => void) | null = null;

  private reqSeq = 1;
  private reqQueue: Array<() => void> = [];
  private reqPending: any = null;
  private timeoutMs = 3000;

  constructor(device: BluetoothDevice, eventHandler?: (msgId: number, payload: DataView) => void) {
    this.device = device;
    this.eventHandler = eventHandler ?? null;
  }

  async connect(): Promise<void> {
    // Already initialized ?
    if (this.requestChar && this.notifyChar) return;

    // Connecting in progress?
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = (async () => {
      const server = await this.device.gatt?.connect();
      if (!server) throw new Error('Device is not connected');

      const service = await server.getPrimaryService(SERVICE_UUID);
      if (!service) throw new Error('Failed to get primary service');

      this.requestChar = await service.getCharacteristic(REQUEST_CHAR_UUID);
      if (!this.requestChar) throw new Error('Failed to get request characteristic');

      this.notifyChar = await service.getCharacteristic(RESPONSE_CHAR_UUID);
      if (!this.notifyChar) throw new Error('Failed to get notify characteristic');

      // Store handler so we can remove it when disconnecting
      this.notifyHandler = (e: Event) => {
        const value = (e.target as BluetoothRemoteGATTCharacteristic).value;
        if (value) {
          this.processMessage(new Uint8Array(value.buffer));
        }
      };
      this.notifyChar.addEventListener('characteristicvaluechanged', this.notifyHandler);
      await this.notifyChar.startNotifications();
    })().catch(err => {
      // Reset so a future connect() can retry
      this.readyPromise = null;
      throw err;
    });

    return this.readyPromise;
  }

  // Physically disconnect the GATT connection and stop notifications.
  // Safe to call multiple times.
  async disconnect(): Promise<void> {
    // Reject any pending command
    if (this.reqPending) {
      try {
        clearTimeout(this.reqPending.timeout);
        this.reqPending.reject(new Error('Connection closed'));
      } catch (_) {
        // Ignore errors
      }
      this.reqPending = null;
    }

    // Clear queued commands
    this.reqQueue = [];

    // Stop notifications and remove handler
    try {
      if (this.notifyChar) {
        try {
          await this.notifyChar.stopNotifications();
        } catch (e) {
          // Ignore stop errors
        }
        if (this.notifyHandler) {
          this.notifyChar.removeEventListener('characteristicvaluechanged', this.notifyHandler);
        }
        this.notifyChar = null;
        this.notifyHandler = null;
      }
    } catch (err) {
      // Ignore errors
    }

    // Disconnect GATT server if connected
    try {
      const server = this.device.gatt;
      if (server && server.connected) {
        server.disconnect();
      }
    } catch (err) {
      // Ignore errors
    }

    // Reset cached state
    this.requestChar = null;
    this.readyPromise = null;
  }

  async invoke<T extends Btj.Command>(cmd: T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => this._invoke(cmd, resolve, reject);
      if (this.reqPending) {
        this.reqQueue.push(run);
      } else {
        run();
      }
    });
  }

  private async _invoke<T extends Btj.Command>(
    cmd: T,
    resolve: (value: T) => void,
    reject: (reason?: any) => void
  ) {
    const seq = this.reqSeq++ & 0xff;
    const reqBuf = this.serializeRequest({ msgId: cmd.msgId, data: { serialize: () => new Uint8Array(cmd.serializeRequest()) } }, seq);
    this.reqPending = {
      seq,
      msgId: cmd.msgId,
      resolve,
      reject,
      timeout: setTimeout(() => this.handleTimeout(), this.timeoutMs),
      parseResponse: cmd.parseResponse.bind(cmd),
      cmd
    };
    try {
      await this.sendRawRequest(reqBuf);
    } catch (err) {
      this.handleError(err);
    }
  }

  private handleTimeout() {
    if (this.reqPending) {
      this.reqPending.reject(new Error('Command timeout'));
      this.reqPending = null;
      this.nextCommand();
    }
  }

  private handleError(err: any) {
    if (this.reqPending) {
      this.reqPending.reject(err);
      clearTimeout(this.reqPending.timeout);
      this.reqPending = null;
      this.nextCommand();
    }
  }

  private nextCommand() {
    if (this.reqQueue.length > 0) {
      const next = this.reqQueue.shift();
      if (next) next();
    }
  }

  private handleEvent(msgId: number, payload: DataView) {
    globalThis.console.log('Received event from device', msgId);
    try {
      if (this.eventHandler) {
        this.eventHandler(msgId, payload);
      }
    } catch (err) {
      console.error('Event handler threw', err);
    }
  }

  private processMessage(buf: Uint8Array) {
    if (!(buf instanceof Uint8Array) || buf.length < HEADER_SIZE) return;
    const flags = buf[OFFSET_FLAGS];
    const msgId = buf[OFFSET_MSGID];
    const seq = buf[OFFSET_SEQ];
    const size = buf[OFFSET_SIZE];

    const type = flags & MSG_TYPE_MASK;
    const payload = new DataView(buf.buffer, buf.byteOffset + HEADER_SIZE, size);

    switch (type) {
      case MSG_TYPE_REQUEST:
        // Ignore incoming request from device
        break;
      case MSG_TYPE_EVENT:
        // Handle incoming event from device
        this.handleEvent(msgId, payload);
        break;

      case MSG_TYPE_RESPONSE:
      case MSG_TYPE_ERROR:
        if (this.reqPending && seq === this.reqPending.seq && msgId === this.reqPending.msgId) {
          clearTimeout(this.reqPending.timeout);

          if (type == MSG_TYPE_RESPONSE) {
            try {
              const resp = this.reqPending.parseResponse(payload);
              // Attach response to the command instance
              this.reqPending.cmd.response = resp;
              this.reqPending.resolve(this.reqPending.cmd);
            } catch (err) {
              this.reqPending.reject(err);
            }
          } else {
            this.reqPending.reject(new Error('Received error response from device'));
          }
          this.reqPending = null;
          this.nextCommand();
        } else {
          // Unmatched response
          console.warn('Unmatched response seq', seq, 'msgId', msgId);
        }
        break;
    }
  }

  private async sendRawRequest(request: Uint8Array): Promise<void> {
    // Ensure we are connected and notifications are ready to receive responses
    await this.connect();
    const safeRequest = new Uint8Array(Array.from(request));
    return await this.requestChar!.writeValue(safeRequest);
  }

  private serializeRequest(req: { msgId: Btj.MsgId; data: { serialize(): Uint8Array } }, seq: number): Uint8Array {
    const payload = req.data.serialize();
    const buf = new Uint8Array(HEADER_SIZE + payload.length);
    buf[OFFSET_FLAGS] = MSG_TYPE_REQUEST;
    buf[OFFSET_MSGID] = req.msgId;
    buf[OFFSET_SEQ] = seq;
    buf[OFFSET_SIZE] = payload.length;
    if (payload.length > 0) buf.set(payload, HEADER_SIZE);
    return buf;
  }
}

export async function scanAndSelect(): Promise<BluetoothDevice> {
  if (!('bluetooth' in navigator)) {
    throw new Error('Web Bluetooth is not supported in this browser.');
  }

  const isSecureContext = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  if (!isSecureContext) {
    throw new Error('Web Bluetooth requires a secure context (https or localhost).');
  }

  return await navigator.bluetooth.requestDevice({
    filters: [{
      services: [SERVICE_UUID]
    }],
    optionalServices: [],
  });
}
