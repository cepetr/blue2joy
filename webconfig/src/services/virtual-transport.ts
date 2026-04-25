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
import { BinaryReader, BinaryWriter } from "../utils/binary-io.js";
import {
  BtjFrameType,
  decodeBtjFrame,
  encodeBtjFrame,
  type BtjDisconnectHandler,
  type BtjFrameHandler,
  type BtjTransport,
} from "./btj-transport";

type VirtualResponder = (
  frame: Uint8Array,
  emit: (frame: Uint8Array) => void,
) => void | Promise<void>;

export class VirtualBtjTransport implements BtjTransport {
  private isOpen = false;
  private frameHandler: BtjFrameHandler | null = null;
  private disconnectHandler: BtjDisconnectHandler | null = null;

  constructor(
    private readonly responder: VirtualResponder,
    private readonly onOpen?: (emit: (frame: Uint8Array) => void) => void,
  ) {}

  setFrameHandler(handler: BtjFrameHandler | null): void {
    this.frameHandler = handler;
  }

  setDisconnectHandler(handler: BtjDisconnectHandler | null): void {
    this.disconnectHandler = handler;
  }

  async open(): Promise<void> {
    this.isOpen = true;
    this.onOpen?.((frame) => this.emit(frame));
  }

  async close(): Promise<void> {
    this.isOpen = false;
  }

  async sendFrame(frame: Uint8Array): Promise<void> {
    if (!this.isOpen) {
      throw new Error("Virtual transport is not open");
    }
    await this.responder(frame, (responseFrame) => this.emit(responseFrame));
  }

  disconnect(reason?: unknown): void {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.disconnectHandler?.(reason);
  }

  private emit(frame: Uint8Array): void {
    if (!this.isOpen || !this.frameHandler) {
      return;
    }
    this.frameHandler(frame);
  }
}

export function createDemoTransport(): BtjTransport {
  let sysMode = Btj.SysMode.AUTO;
  let scanning = false;
  let joyPortMode = Btj.JoyPortMode.NORMAL;

  const emitSysState = (emit: (frame: Uint8Array) => void) => {
    const payload = new BinaryWriter().bool(scanning).uint8(sysMode).result;
    emit(
      encodeBtjFrame(
        BtjFrameType.EVENT,
        Btj.MsgId.EVT_SYS_STATE_UPDATE,
        0,
        payload,
      ),
    );
  };

  const emitJoyPort = (emit: (frame: Uint8Array) => void) => {
    const payload = new BinaryWriter()
      .uint8(joyPortMode)
      .uint8(0)
      .uint8(228)
      .uint8(228).result;
    emit(
      encodeBtjFrame(
        BtjFrameType.EVENT,
        Btj.MsgId.EVT_JOY_PORT_UPDATE,
        0,
        payload,
      ),
    );
  };

  return new VirtualBtjTransport(
    async (frame, emit) => {
      const decoded = decodeBtjFrame(frame);
      if (!decoded || decoded.type !== BtjFrameType.REQUEST) {
        return;
      }

      let payload: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
      let responseType = BtjFrameType.RESPONSE;

      switch (decoded.msgId) {
        case Btj.MsgId.GET_API_VERSION:
          payload = copyBytes(new BinaryWriter().uint8(1).uint8(0).result);
          break;
        case Btj.MsgId.GET_SYS_INFO:
          payload = copyBytes(
            new BinaryWriter()
              .bytes(
                new Uint8Array([
                  0xde, 0xad, 0xbe, 0xef, 0x42, 0x4a, 0x01, 0x00,
                ]),
              )
              .uint32((1 << 24) | (0 << 16) | (0 << 8))
              .uint32((1 << 24) | (0 << 16) | (0 << 8)).result,
          );
          break;
        case Btj.MsgId.SET_MODE: {
          const reader = new BinaryReader(decoded.payload);
          sysMode = reader.uint8();
          reader.bool();
          reader.assertDone("SetMode request");
          emitSysState(emit);
          break;
        }
        case Btj.MsgId.START_SCANNING:
          scanning = true;
          emitSysState(emit);
          break;
        case Btj.MsgId.STOP_SCANNING:
          scanning = false;
          emitSysState(emit);
          break;
        case Btj.MsgId.SET_JOY_PORT_MODE: {
          const reader = new BinaryReader(decoded.payload);
          joyPortMode = reader.uint8();
          reader.assertDone("SetJoyPortMode request");
          emitJoyPort(emit);
          break;
        }
        case Btj.MsgId.SET_PIN_CONFIG:
        case Btj.MsgId.SET_POT_CONFIG:
        case Btj.MsgId.SET_INTG_CONFIG:
        case Btj.MsgId.CONNECT_DEVICE:
        case Btj.MsgId.DELETE_DEVICE:
        case Btj.MsgId.SET_DEV_CONFIG:
        case Btj.MsgId.FACTORY_RESET:
          break;
        default:
          responseType = BtjFrameType.ERROR;
          break;
      }

      emit(encodeBtjFrame(responseType, decoded.msgId, decoded.seq, payload));
    },
    (emit) => {
      emitSysState(emit);
      emitJoyPort(emit);
    },
  );
}

function copyBytes(
  bytes: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBufferLike> {
  return new Uint8Array(Array.from(bytes));
}
