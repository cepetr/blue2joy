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

export const XEP80_RAM_SIZE = 8192;
export const XEP80_REGS_SIZE = 64;
export const XEP80_STATE_SIZE = XEP80_RAM_SIZE + XEP80_REGS_SIZE;

export function decodeXep80Update(data: Uint8Array, state: Uint8Array): void {
  let idx = 0;
  let addr = 0;

  const writeByte = (value: number) => {
    if (addr >= 0 && addr < XEP80_STATE_SIZE) {
      state[addr] = value & 0xff;
    }
    addr += 1;
  };

  while (idx < data.length) {
    const cmd = data[idx++];
    if (cmd === 0xff) {
      break;
    }

    const op = cmd & 0xf0;
    const low = cmd & 0x0f;
    switch (op) {
      case 0x80: {
        // 8X YY - repeat byte YY for X + 1 times
        if (idx >= data.length) return;
        const value = data[idx++];
        const count = low + 1;
        for (let i = 0; i < count; i++) {
          writeByte(value);
        }
        break;
      }
      case 0x90: {
        // 9X XX YY - repeat byte YY for XXX + 1 times
        if (idx + 1 >= data.length) return;
        const count = ((low << 8) | data[idx++]) + 1;
        const value = data[idx++];
        for (let i = 0; i < count; i++) {
          writeByte(value);
        }
        break;
      }
      case 0xa0: {
        // AX - literal copy next X + 1 bytes
        const count = low + 1;
        for (let i = 0; i < count; i++) {
          if (idx >= data.length) return;
          writeByte(data[idx++]);
        }
        break;
      }
      case 0xb0: {
        // BX XX - literal copy next XXX + 1 bytes
        if (idx >= data.length) return;
        const count = ((low << 8) | data[idx++]) + 1;
        for (let i = 0; i < count; i++) {
          if (idx >= data.length) return;
          writeByte(data[idx++]);
        }
        break;
      }
      default:
        if ((op & 0x80) == 0) {
          if (idx >= data.length) return;
          addr = ((op + low) << 8) | data[idx++];
          break;
        }
        // Invalid command, ignore and continue
        return;
    }
  }
}
