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

export const MSG_TYPE_MASK = 0x03;

export enum BtjFrameType {
  REQUEST = 0,
  EVENT = 1,
  RESPONSE = 2,
  ERROR = 3,
}

const OFFSET_FLAGS = 0;
const OFFSET_MSGID = 1;
const OFFSET_SEQ = 2;
const OFFSET_SIZE = 3;
export const HEADER_SIZE = 4;

export type BtjFrame = {
  type: BtjFrameType;
  msgId: number;
  seq: number;
  payload: DataView;
};

export type BtjFrameHandler = (frame: Uint8Array<ArrayBufferLike>) => void;
export type BtjDisconnectHandler = (reason?: unknown) => void;

export interface BtjTransport {
  open(): Promise<void>;
  close(): Promise<void>;
  sendFrame(frame: Uint8Array<ArrayBufferLike>): Promise<void>;
  setFrameHandler(handler: BtjFrameHandler | null): void;
  setDisconnectHandler(handler: BtjDisconnectHandler | null): void;
}

export function decodeBtjFrame(
  frame: Uint8Array<ArrayBufferLike>,
): BtjFrame | null {
  if (!(frame instanceof Uint8Array) || frame.length < HEADER_SIZE) {
    return null;
  }

  const flags = frame[OFFSET_FLAGS];
  const msgId = frame[OFFSET_MSGID];
  const seq = frame[OFFSET_SEQ];
  const size = frame[OFFSET_SIZE];

  if (frame.length < HEADER_SIZE + size) {
    return null;
  }

  return {
    type: flags & MSG_TYPE_MASK,
    msgId,
    seq,
    payload: new DataView(frame.buffer, frame.byteOffset + HEADER_SIZE, size),
  };
}

export function encodeBtjFrame(
  type: BtjFrameType,
  msgId: number,
  seq: number,
  payload: Uint8Array<ArrayBufferLike> = new Uint8Array(0),
): Uint8Array<ArrayBufferLike> {
  const frame = new Uint8Array(HEADER_SIZE + payload.length);
  frame[OFFSET_FLAGS] = type;
  frame[OFFSET_MSGID] = msgId;
  frame[OFFSET_SEQ] = seq & 0xff;
  frame[OFFSET_SIZE] = payload.length & 0xff;
  if (payload.length > 0) {
    frame.set(payload, HEADER_SIZE);
  }
  return frame;
}
