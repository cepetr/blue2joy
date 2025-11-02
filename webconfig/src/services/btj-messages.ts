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

export namespace Btj {
  export class Error extends globalThis.Error {
    readonly code: number;

    constructor(code: number, message?: string) {
      super(message ?? `Device error: code ${code}`);
      this.name = 'BtjError';
      this.code = code;
    }
  }

  function assertPresent<T>(value: T | undefined, msg = 'No response available'): T {
    if (value === undefined) throw new globalThis.Error(msg);
    return value;
  }

  function assertPayloadLength(view: DataView, expected: number): void {
    if (view.byteLength !== expected) throw new globalThis.Error(`Invalid payload length`);
  }

  function hexString(view: DataView, offset: number, length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += view.getUint8(offset + i).toString(16).padStart(2, '0');
    }
    return result;
  }

  function versionString(version: number): string {
    const major = (version >> 24) & 0xff;
    const minor = (version >> 16) & 0xff;
    const patch = (version >> 8) & 0xff;
    return `${major}.${minor}.${patch}`;
  }

  export enum MsgId {
    GET_API_VERSION = 0,
    GET_SYS_INFO = 1,
    SET_DEV_CONFIG = 2,
    SET_PIN_CONFIG = 3,
    SET_POT_CONFIG = 4,
    SET_ENC_CONFIG = 5,
    SET_PROFILE = 6,
    SET_MODE = 7,
    START_SCANNING = 8,
    STOP_SCANNING = 9,
    CONNECT_DEVICE = 10,
    DELETE_DEVICE = 11,
    FACTORY_RESET = 12,

    EVT_SYS_STATE_UPDATE = 64,
    EVT_IO_PORT_UPDATE = 65,
    EVT_ADV_LIST_UPDATE = 66,
    EVT_DEV_LIST_UPDATE = 67,
    EVT_PROFILE_UPDATE = 68,
  }

  export interface Command {
    readonly msgId: MsgId;
    serializeRequest(): ArrayBuffer;
    parseResponse(view: DataView): void;
  }


  export type ApiVersion = {
    major: number;
    minor: number;
  };

  export class GetApiVersion implements Command {
    readonly msgId = MsgId.GET_API_VERSION;
    private _data?: ApiVersion;

    constructor() { }

    serializeRequest(): ArrayBuffer {
      return new ArrayBuffer(0);
    }

    parseResponse(view: DataView) {
      assertPayloadLength(view, 2);
      const major = view.getUint8(0);
      const minor = view.getUint8(1);
      this._data = { major, minor };
    }

    get data(): ApiVersion {
      return assertPresent(this._data);
    }
  }

  export type SysInfo = {
    hw_id: string;
    hw_version: string;
    sw_version: string;
  }

  export class GetSysInfo implements Command {
    readonly msgId = MsgId.GET_SYS_INFO;
    private _data?: SysInfo;

    constructor() { }

    serializeRequest(): ArrayBuffer {
      return new ArrayBuffer(0);
    }

    parseResponse(view: DataView) {
      assertPayloadLength(view, 16);
      const hw_id = hexString(view, 0, 8);
      const hw_version = versionString(view.getUint32(8, true));
      const sw_version = versionString(view.getUint32(12, true));
      this._data = { hw_id, hw_version, sw_version };
    }

    get data(): SysInfo {
      return assertPresent(this._data);
    }
  }

  export enum SysMode {
    AUTO = 0,
    PAIRING = 1,
    MANUAL = 2,
  }

  export type SysState = {
    scanning: boolean;
    mode: SysMode;
  };

  export type IoPortState = {
    pins: number;
    pots: Array<number>;
  };

  export class DevAddr {
    static readonly LENGTH = 7;
    private _bytes: Uint8Array;

    constructor(bytes: ArrayLike<number>) {
      if (bytes.length !== DevAddr.LENGTH) {
        throw new globalThis.Error(`DevAddr must be exactly ${DevAddr.LENGTH} bytes`);
      }
      this._bytes = new Uint8Array(bytes);
      this._bytes.forEach((b, i) => {
        if (b < 0 || b > 255 || !Number.isInteger(b)) {
          throw new globalThis.Error(`DevAddr byte must be in 0..255`);
        }
        this._bytes[i] = b;
      });
    }

    equals(other: DevAddr): boolean {
      if (this === other) return true;
      for (let i = 0; i < DevAddr.LENGTH; i++) {
        if (this._bytes[i] !== other._bytes[i]) return false;
      }
      return true;
    }

    toString(): string {
      const type_suffix = this._bytes[0] === 0 ? '' : ' (random)';

      return Array.from(this._bytes)
        .reverse().slice(0, 6)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(':') + type_suffix;
    }

    static copyFrom(offset: number, view: DataView): DevAddr {
      return new DevAddr(new Uint8Array(view.buffer, view.byteOffset + offset, DevAddr.LENGTH));
    }

    copyTo(offset: number, view: DataView) {
      for (let i = 0; i < DevAddr.LENGTH; i++) {
        view.setUint8(offset + i, this._bytes[i]);
      }
    }
  }

  export type AdvData = {
    addr: DevAddr;
    rssi: number;
    name: string;
  }

  export enum ConnState {
    DISCONNECTED = 0,
    ERROR = 1,
    CONNECTING = 2,
    CONNECTED = 3,
    READY = 4,
  }

  export type DevState = {
    connState: ConnState;
  };

  export type DevConfig = {
    profile: number;
  };

  export class SetDevConfig implements Command {
    readonly msgId = MsgId.SET_DEV_CONFIG;

    constructor(private _addr: DevAddr, private _data: DevConfig) { }
    serializeRequest(): ArrayBuffer {
      const buf = new ArrayBuffer(DevAddr.LENGTH + 1);
      const view = new DataView(buf);
      this._addr.copyTo(0, view);
      view.setUint8(DevAddr.LENGTH, this._data.profile);
      return buf;
    }

    parseResponse(view: DataView) {
      assertPayloadLength(view, 0);
    }

    get addr(): DevAddr {
      return this._addr;
    }

    get data(): DevConfig {
      return this._data;
    }
  }


  export class PinConfig {
    source: number = 0;
    invert: boolean = false;
    hatSwitch: number = 0;
    threshold: number = 0;
    hysteresis: number = 0;

    static default(): PinConfig {
      return new PinConfig();
    }
  }

  export class SetPinConfig implements Command {
    readonly msgId = MsgId.SET_PIN_CONFIG;

    constructor(private _profile: number, private _id: number, private _data: PinConfig) { }
    serializeRequest(): ArrayBuffer {
      const buf = new ArrayBuffer(4 + 8);
      const view = new DataView(buf);
      view.setUint8(0, this._profile);
      view.setUint8(1, this._id);
      view.setUint32(4, this._data.source, true);
      view.setUint8(8, this._data.invert ? 1 : 0);
      view.setUint8(9, this._data.hatSwitch);
      view.setUint8(10, this._data.threshold);
      view.setUint8(11, this._data.hysteresis);
      return buf;
    }

    parseResponse(view: DataView) {
      assertPayloadLength(view, 0);
    }

    get profile(): number {
      return this._profile;
    }

    get id(): number {
      return this._id;
    }

    get data(): PinConfig {
      return this._data;
    }
  }


  export class PotConfig {
    source: number = 0;
    low: number = 0;
    high: number = 0;
    intSpeed: number = 0;

    static default(): PotConfig {
      return new PotConfig();
    }
  }

  export class SetPotConfig implements Command {
    readonly msgId = MsgId.SET_POT_CONFIG;

    constructor(private _profile: number, private _id: number, private _data: PotConfig) { }
    serializeRequest(): ArrayBuffer {
      const buf = new ArrayBuffer(4 + 12);
      const view = new DataView(buf);
      view.setUint8(0, this._profile);
      view.setUint8(1, this._id);
      view.setUint32(4, this._data.source, true);
      view.setInt16(8, this._data.low, true);
      view.setInt16(10, this._data.high, true);
      view.setInt16(12, this._data.intSpeed, true);
      return buf;
    }

    parseResponse(view: DataView) {
      assertPayloadLength(view, 0);
    }

    get profile(): number {
      return this._profile;
    }

    get id(): number {
      return this._id;
    }

    get data(): PotConfig {
      return this._data;
    }
  }

  export class EncConfig {
    source: number = 0;

    static default(): EncConfig {
      return new EncConfig();
    }
  }

  export class SetEncConfig implements Command {
    readonly msgId = MsgId.SET_ENC_CONFIG;

    constructor(private _profile: number, private _id: number, private _data: EncConfig) { }

    serializeRequest(): ArrayBuffer {
      const buf = new ArrayBuffer(4 + 4);
      const view = new DataView(buf);
      view.setUint8(0, this._profile);
      view.setUint8(1, this._id);
      view.setUint32(4, this._data.source, true);
      return buf;
    }

    parseResponse(view: DataView) {
      assertPayloadLength(view, 0);
    }

    get profile(): number {
      return this._profile;
    }

    get id(): number {
      return this._id;
    }

    get data(): EncConfig {
      return this._data;
    }
  }

  export class SetMode implements Command {
    readonly msgId = MsgId.SET_MODE;

    constructor(private _mode: SysMode, private _restart: boolean) { }

    serializeRequest(): ArrayBuffer {
      const buf = new ArrayBuffer(2);
      const view = new DataView(buf);
      view.setUint8(0, this._mode);
      view.setUint8(1, this._restart ? 1 : 0);
      return buf;
    }

    parseResponse(view: DataView) {
      assertPayloadLength(view, 0);
    }

    get mode(): SysMode {
      return this._mode;
    }

    get restart(): boolean {
      return this._restart;
    }
  }

  export class StartScanning implements Command {
    readonly msgId = MsgId.START_SCANNING;

    constructor() { }
    serializeRequest(): ArrayBuffer {
      return new ArrayBuffer(0);
    }

    parseResponse(view: DataView) {
      assertPayloadLength(view, 0);
    }
  }

  export class StopScanning implements Command {
    readonly msgId = MsgId.STOP_SCANNING;

    constructor() { }

    serializeRequest(): ArrayBuffer {
      return new ArrayBuffer(0);
    }

    parseResponse(view: DataView) {
      assertPayloadLength(view, 0);
    }
  }

  export class ConnectDevice implements Command {
    readonly msgId = MsgId.CONNECT_DEVICE;

    constructor(private _addr: DevAddr) { }
    serializeRequest(): ArrayBuffer {
      const buf = new ArrayBuffer(DevAddr.LENGTH);
      const view = new DataView(buf);
      this._addr.copyTo(0, view);
      return buf;
    }

    parseResponse(view: DataView) {
      assertPayloadLength(view, 0);
    }

    get addr(): DevAddr {
      return this._addr;
    }
  }

  export class DeleteDevice implements Command {
    readonly msgId = MsgId.DELETE_DEVICE;

    constructor(private _addr: DevAddr) { }
    serializeRequest(): ArrayBuffer {
      const buf = new ArrayBuffer(DevAddr.LENGTH);
      const view = new DataView(buf);
      this._addr.copyTo(0, view);
      return buf;
    }

    parseResponse(view: DataView) {
      assertPayloadLength(view, 0);
    }

    get addr(): DevAddr {
      return this._addr;
    }
  }

  export class FactoryReset implements Command {
    readonly msgId = MsgId.FACTORY_RESET;

    constructor() { }
    serializeRequest(): ArrayBuffer {
      return new ArrayBuffer(0);
    }

    parseResponse(view: DataView) {
      assertPayloadLength(view, 0);
    }
  }

  export class SysStateUpdateEvent {
    readonly msgId = MsgId.EVT_SYS_STATE_UPDATE;

    private _data?: SysState;

    parseMessage(view: DataView) {
      assertPayloadLength(view, 2);
      const scanning = view.getUint8(0) != 0;
      const mode = view.getUint8(1);
      this._data = { scanning, mode };
    }

    get data(): SysState {
      return assertPresent(this._data);
    }
  }

  export class AdvListUpdateEvent {
    readonly msgId = MsgId.EVT_ADV_LIST_UPDATE;
    private _data?: AdvData;
    private _deleted?: boolean;

    parseMessage(view: DataView) {
      assertPayloadLength(view, 1 + DevAddr.LENGTH + 1 + 31);
      const deleted = view.getUint8(0) ? true : false;
      const addr = DevAddr.copyFrom(1, view);
      const rssi = view.getInt8(8);
      const name = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + 9, 31)).replace(/\0.*$/, '');
      this._data = { addr, rssi, name };
      this._deleted = deleted;
    }

    get data(): AdvData {
      return assertPresent(this._data);
    }

    get deleted(): boolean {
      return assertPresent(this._deleted);
    }
  }

  export class DevListUpdateEvent {
    readonly msgId = MsgId.EVT_DEV_LIST_UPDATE;

    private _deleted?: boolean;
    private _addr?: DevAddr;
    private _state?: DevState;
    private _config?: DevConfig;

    parseMessage(view: DataView) {
      assertPayloadLength(view, 1 + DevAddr.LENGTH + 1 + 1);
      const deleted = view.getUint8(0) ? true : false;
      const addr = DevAddr.copyFrom(1, view);
      const connState = view.getInt8(8);
      const profile = view.getUint8(9);
      this._deleted = deleted;
      this._addr = addr;
      this._state = { connState };
      this._config = { profile };
    }

    get deleted(): boolean {
      return assertPresent(this._deleted);
    }

    get addr(): DevAddr {
      return assertPresent(this._addr);
    }

    get state(): DevState {
      return assertPresent(this._state);
    }

    get config(): DevConfig {
      return assertPresent(this._config);
    }
  }

  export class ProfileUpdateEvent {
    readonly msgId = MsgId.EVT_PROFILE_UPDATE;

    private _profile?: number;

    private _pins: Map<number, PinConfig> = new Map();
    private _pots: Map<number, PotConfig> = new Map();
    private _encs: Map<number, EncConfig> = new Map();

    parseMessage(view: DataView) {
      assertPayloadLength(view, 4 + 5 * 8 + 2 * 12 + 2 * 4);
      this._profile = view.getUint8(0);

      for (let i = 0; i < 5; i++) {
        const offset = 4 + i * 8;
        const source = view.getUint32(offset, true);
        const invert = Boolean(view.getUint8(offset + 4));
        const hatSwitch = view.getUint8(offset + 5);
        const threshold = view.getUint8(offset + 6);
        const hysteresis = view.getUint8(offset + 7);
        this._pins.set(i, { source, invert, hatSwitch, threshold, hysteresis });
      }

      for (let i = 0; i < 2; i++) {
        const offset = 4 + 5 * 8 + i * 12;
        const source = view.getUint32(offset, true);
        const low = view.getInt16(offset + 4, true);
        const high = view.getInt16(offset + 6, true);
        const intSpeed = view.getInt16(offset + 8, true);
        this._pots.set(i, { source, low, high, intSpeed });
      }

      for (let i = 0; i < 2; i++) {
        const offset = 4 + 5 * 8 + 2 * 12 + i * 4;
        const source = view.getUint32(offset, true);
        this._encs.set(i, { source });
      }
    }

    get profile(): number {
      return assertPresent(this._profile);
    }

    get pins(): Map<number, PinConfig> {
      return this._pins;
    }

    get pots(): Map<number, PotConfig> {
      return this._pots;
    }

    get encs(): Map<number, EncConfig> {
      return this._encs;
    }
  }

}
