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

import { Btj } from "./btj-messages";
import {
  BtjFrameType,
  decodeBtjFrame,
  encodeBtjFrame,
  type BtjTransport,
} from "./btj-transport";

type PendingRequest = {
  seq: number;
  msgId: Btj.MsgId;
  resolve: (value: Btj.Command) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  parseResponse: (view: DataView) => void;
  cmd: Btj.Command;
};

export class BtjConnection {
  private readyPromise: Promise<void> | null = null;
  private eventHandler: ((msgId: number, payload: DataView) => void) | null =
    null;
  private disconnectHandler: ((reason?: unknown) => void) | null = null;
  private isDisconnecting = false;

  private reqSeq = 1;
  private reqQueue: Array<() => void> = [];
  private reqPending: PendingRequest | null = null;
  private timeoutMs = 3000;

  constructor(
    private transport: BtjTransport,
    eventHandler?: (msgId: number, payload: DataView) => void,
    disconnectHandler?: (reason?: unknown) => void,
  ) {
    this.eventHandler = eventHandler ?? null;
    this.disconnectHandler = disconnectHandler ?? null;
  }

  async connect(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = (async () => {
      this.transport.setFrameHandler((frame) => this.processMessage(frame));
      this.transport.setDisconnectHandler((reason) => {
        if (this.isDisconnecting) {
          return;
        }
        const disconnectReason = toError(reason, "Connection closed");
        console.error("Transport disconnected", disconnectReason);
        this.resetConnectionState(disconnectReason);
        this.disconnectHandler?.(disconnectReason);
      });
      await this.transport.open();
    })().catch((err) => {
      console.error("Failed to open transport", err);
      this.transport.setFrameHandler(null);
      this.transport.setDisconnectHandler(null);
      this.readyPromise = null;
      throw err;
    });

    return this.readyPromise;
  }

  // Physically disconnect the GATT connection and stop notifications.
  // Safe to call multiple times.
  async disconnect(): Promise<void> {
    this.isDisconnecting = true;
    try {
      await this.transport.close();
    } finally {
      this.transport.setFrameHandler(null);
      this.transport.setDisconnectHandler(null);
      this.resetConnectionState(new Error("Connection closed"));
      this.isDisconnecting = false;
    }
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
    reject: (reason?: unknown) => void,
  ) {
    const seq = this.reqSeq++ & 0xff;
    const reqBuf = this.serializeRequest(
      { msgId: cmd.msgId, data: { serialize: () => cmd.serializeRequest() } },
      seq,
    );
    this.reqPending = {
      seq,
      msgId: cmd.msgId,
      resolve: resolve as (value: Btj.Command) => void,
      reject,
      timeout: setTimeout(() => this.handleTimeout(), this.timeoutMs),
      parseResponse: cmd.parseResponse.bind(cmd),
      cmd,
    };
    try {
      await this.sendRawRequest(reqBuf);
    } catch (err) {
      this.handleError(err);
    }
  }

  private handleTimeout() {
    if (this.reqPending) {
      const err = new Error("Command timeout");
      console.error("BTJ command timed out", err);
      this.reqPending.reject(err);
      this.reqPending = null;
      this.nextCommand();
    }
  }

  private handleError(err: unknown) {
    console.error("BTJ request failed", err);
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
    globalThis.console.log("Received event from device", msgId);
    try {
      if (this.eventHandler) {
        this.eventHandler(msgId, payload);
      }
    } catch (err) {
      console.error("Event handler threw", err);
    }
  }

  private processMessage(buf: Uint8Array) {
    const frame = decodeBtjFrame(buf);
    if (!frame) return;

    switch (frame.type) {
      case BtjFrameType.REQUEST:
        // Ignore incoming request from device
        break;
      case BtjFrameType.EVENT:
        // Handle incoming event from device
        this.handleEvent(frame.msgId, frame.payload);
        break;

      case BtjFrameType.RESPONSE:
      case BtjFrameType.ERROR:
        if (
          this.reqPending &&
          frame.seq === this.reqPending.seq &&
          frame.msgId === this.reqPending.msgId
        ) {
          clearTimeout(this.reqPending.timeout);

          if (frame.type === BtjFrameType.RESPONSE) {
            try {
              this.reqPending.parseResponse(frame.payload);
              this.reqPending.resolve(this.reqPending.cmd);
            } catch (err) {
              this.reqPending.reject(err);
            }
          } else {
            this.reqPending.reject(
              new Error("Received error response from device"),
            );
          }
          this.reqPending = null;
          this.nextCommand();
        } else {
          // Unmatched response
          console.warn(
            "Unmatched response seq",
            frame.seq,
            "msgId",
            frame.msgId,
          );
        }
        break;
    }
  }

  private async sendRawRequest(request: Uint8Array): Promise<void> {
    await this.connect();
    await this.transport.sendFrame(new Uint8Array(Array.from(request)));
  }

  private serializeRequest(
    req: { msgId: Btj.MsgId; data: { serialize(): Uint8Array } },
    seq: number,
  ): Uint8Array {
    return encodeBtjFrame(
      BtjFrameType.REQUEST,
      req.msgId,
      seq,
      req.data.serialize(),
    );
  }

  private resetConnectionState(reason: Error): void {
    if (this.reqPending) {
      clearTimeout(this.reqPending.timeout);
      this.reqPending.reject(reason);
      this.reqPending = null;
    }
    this.reqQueue = [];
    this.readyPromise = null;
  }
}

function toError(reason: unknown, fallbackMessage: string): Error {
  if (reason instanceof Error) {
    return reason;
  }

  if (typeof reason === "string" && reason.length > 0) {
    return new Error(reason);
  }

  return new Error(fallbackMessage);
}
