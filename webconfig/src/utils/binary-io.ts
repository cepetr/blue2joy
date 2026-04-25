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

export class BinaryReader {
  private pos = 0;
  constructor(private view: DataView) {}

  private assertAvailable(size: number, what = "payload"): void {
    const remaining = this.view.byteLength - this.pos;
    if (remaining < size) {
      throw new Error(
        `Invalid ${what} length: need ${size} byte(s), have ${remaining}`,
      );
    }
  }

  uint8(): number {
    this.assertAvailable(1);
    return this.view.getUint8(this.pos++);
  }

  int8(): number {
    this.assertAvailable(1);
    return this.view.getInt8(this.pos++);
  }

  bool(): boolean {
    return this.uint8() !== 0;
  }

  uint16(): number {
    this.assertAvailable(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  int16(): number {
    this.assertAvailable(2);
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }

  uint32(): number {
    this.assertAvailable(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  skip(n: number): this {
    this.assertAvailable(n);
    this.pos += n;
    return this;
  }

  bytes(n: number): Uint8Array {
    this.assertAvailable(n);
    const arr = new Uint8Array(
      this.view.buffer,
      this.view.byteOffset + this.pos,
      n,
    );
    this.pos += n;
    return arr;
  }

  assertDone(what = "payload"): void {
    const remaining = this.view.byteLength - this.pos;
    if (remaining !== 0) {
      throw new Error(`Invalid ${what} length: ${remaining} trailing byte(s)`);
    }
  }
}

export class BinaryWriter {
  private _buf: number[] = [];

  uint8(v: number): this {
    this._buf.push(v & 0xff);
    return this;
  }

  bool(v: boolean): this {
    return this.uint8(v ? 1 : 0);
  }

  int16(v: number): this {
    this._buf.push(v & 0xff, (v >> 8) & 0xff);
    return this;
  }

  uint32(v: number): this {
    this._buf.push(
      v & 0xff,
      (v >> 8) & 0xff,
      (v >> 16) & 0xff,
      (v >>> 24) & 0xff,
    );
    return this;
  }

  skip(n: number): this {
    for (let i = 0; i < n; i++) this._buf.push(0);
    return this;
  }

  bytes(src: Uint8Array): this {
    for (let i = 0; i < src.length; i++) this._buf.push(src[i]);
    return this;
  }

  get result(): Uint8Array {
    return new Uint8Array(this._buf);
  }
}
