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

import { BinaryReader, BinaryWriter } from "../utils/binary-io.js";

export namespace Btj {
  export class Error extends globalThis.Error {
    readonly code: number;

    constructor(code: number, message?: string) {
      super(message ?? `Device error: code ${code}`);
      this.name = "BtjError";
      this.code = code;
    }
  }

  function assertPresent<T>(
    value: T | undefined,
    msg = "No response available",
  ): T {
    if (value === undefined) throw new globalThis.Error(msg);
    return value;
  }

  function hexString(bytes: Uint8Array): string {
    let result = "";
    for (const b of bytes) {
      result += b.toString(16).padStart(2, "0");
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
    SET_INTG_CONFIG = 5,
    SET_PROFILE = 6,
    SET_MODE = 7,
    START_SCANNING = 8,
    STOP_SCANNING = 9,
    CONNECT_DEVICE = 10,
    DELETE_DEVICE = 11,
    FACTORY_RESET = 12,
    SET_JOY_PORT_MODE = 13,

    EVT_SYS_STATE_UPDATE = 64,
    EVT_JOY_PORT_UPDATE = 65,
    EVT_ADV_LIST_UPDATE = 66,
    EVT_DEV_LIST_UPDATE = 67,
    EVT_PROFILE_UPDATE = 68,
    EVT_XEP80_UPDATE = 69,
  }

  export interface Command {
    readonly msgId: MsgId;
    serializeRequest(): Uint8Array;
    parseResponse(view: DataView): void;
  }

  export type ApiVersion = {
    major: number;
    minor: number;
  };

  export class GetApiVersion implements Command {
    readonly msgId = MsgId.GET_API_VERSION;
    private _data?: ApiVersion;

    constructor() {}

    serializeRequest(): Uint8Array {
      return new Uint8Array(0);
    }

    parseResponse(view: DataView) {
      const r = new BinaryReader(view);
      this._data = { major: r.uint8(), minor: r.uint8() };
      r.assertDone("GetApiVersion response");
    }

    get data(): ApiVersion {
      return assertPresent(this._data);
    }
  }

  export type SysInfo = {
    hw_id: string;
    hw_version: string;
    sw_version: string;
  };

  export class GetSysInfo implements Command {
    readonly msgId = MsgId.GET_SYS_INFO;
    private _data?: SysInfo;

    constructor() {}

    serializeRequest(): Uint8Array {
      return new Uint8Array(0);
    }

    parseResponse(view: DataView) {
      const r = new BinaryReader(view);
      const hw_id = hexString(r.bytes(8));
      const hw_version = versionString(r.uint32());
      const sw_version = versionString(r.uint32());
      this._data = { hw_id, hw_version, sw_version };
      r.assertDone("GetSysInfo response");
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

  export enum JoyPortMode {
    NORMAL = 0,
    SPI = 1,
    UART = 2,
  }

  export type JoyPortState = {
    mode: JoyPortMode;
    pins: Array<boolean>;
    pots: Array<number>;
  };

  export class DevAddr {
    static readonly LENGTH = 7;
    private _bytes: Uint8Array;

    constructor(bytes: ArrayLike<number>) {
      if (bytes.length !== DevAddr.LENGTH) {
        throw new globalThis.Error(
          `DevAddr must be exactly ${DevAddr.LENGTH} bytes`,
        );
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
      const type_suffix = this._bytes[0] === 0 ? "" : " (random)";

      return (
        Array.from(this._bytes)
          .reverse()
          .slice(0, 6)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(":") + type_suffix
      );
    }

    static decode(r: BinaryReader): DevAddr {
      return new DevAddr(r.bytes(DevAddr.LENGTH));
    }

    encode(w: BinaryWriter): void {
      w.bytes(this._bytes);
    }
  }

  export type AdvData = {
    addr: DevAddr;
    rssi: number;
    name: string;
  };

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

    constructor(
      private _addr: DevAddr,
      private _data: DevConfig,
    ) {}

    serializeRequest(): Uint8Array {
      const w = new BinaryWriter();
      this._addr.encode(w);
      w.uint8(this._data.profile);
      return w.result;
    }

    parseResponse(view: DataView) {
      new BinaryReader(view).assertDone("SetDevConfig response");
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

    // Wire layout: source(4) + invert(1) + hatSwitch(1) + threshold(1) + hysteresis(1) = 8 bytes
    static decode(r: BinaryReader): PinConfig {
      const cfg = new PinConfig();
      cfg.source = r.uint32();
      cfg.invert = r.bool();
      cfg.hatSwitch = r.uint8();
      cfg.threshold = r.uint8();
      cfg.hysteresis = r.uint8();
      return cfg;
    }

    static encode(w: BinaryWriter, cfg: PinConfig): void {
      w.uint32(cfg.source);
      w.bool(cfg.invert);
      w.uint8(cfg.hatSwitch);
      w.uint8(cfg.threshold);
      w.uint8(cfg.hysteresis);
    }
  }

  export class SetPinConfig implements Command {
    readonly msgId = MsgId.SET_PIN_CONFIG;

    constructor(
      private _profile: number,
      private _id: number,
      private _data: PinConfig,
    ) {}

    serializeRequest(): Uint8Array {
      const w = new BinaryWriter();
      w.uint8(this._profile).uint8(this._id).skip(2);
      PinConfig.encode(w, this._data);
      return w.result;
    }

    parseResponse(view: DataView) {
      new BinaryReader(view).assertDone("SetPinConfig response");
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

    static default(): PotConfig {
      return new PotConfig();
    }

    // Wire layout: source(4) + low(2) + high(2) = 8 bytes
    static decode(r: BinaryReader): PotConfig {
      const cfg = new PotConfig();
      cfg.source = r.uint32();
      cfg.low = r.int16();
      cfg.high = r.int16();
      return cfg;
    }

    static encode(w: BinaryWriter, cfg: PotConfig): void {
      w.uint32(cfg.source);
      w.int16(cfg.low);
      w.int16(cfg.high);
    }
  }

  export class SetPotConfig implements Command {
    readonly msgId = MsgId.SET_POT_CONFIG;

    constructor(
      private _profile: number,
      private _id: number,
      private _data: PotConfig,
    ) {}

    serializeRequest(): Uint8Array {
      const w = new BinaryWriter();
      w.uint8(this._profile).uint8(this._id).skip(2);
      PotConfig.encode(w, this._data);
      return w.result;
    }

    parseResponse(view: DataView) {
      new BinaryReader(view).assertDone("SetPotConfig response");
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

  export enum IntgMode {
    RELATIVE = 0,
    ABSOLUTE = 1,
  }

  export class IntgConfig {
    source: number = 0;
    mode: IntgMode = IntgMode.RELATIVE;
    deadZone: number = 0;
    gain: number = 0;
    max: number = 0;

    static default(): IntgConfig {
      return new IntgConfig();
    }

    // Wire layout: source(4) + mode(1) + deadZone(1) + gain/Q7.8(2) + max(2) + pad(2) = 12 bytes
    static decode(r: BinaryReader): IntgConfig {
      const cfg = new IntgConfig();
      cfg.source = r.uint32();
      cfg.mode = r.uint8();
      cfg.deadZone = r.uint8();
      cfg.gain = r.int16() / 256.0;
      cfg.max = r.int16();
      r.skip(2);
      return cfg;
    }

    static encode(w: BinaryWriter, cfg: IntgConfig): void {
      w.uint32(cfg.source);
      w.uint8(cfg.mode);
      w.uint8(cfg.deadZone);
      w.int16(Math.round(cfg.gain * 256.0));
      w.int16(cfg.max);
      w.skip(2);
    }
  }

  export class SetIntgConfig implements Command {
    readonly msgId = MsgId.SET_INTG_CONFIG;

    constructor(
      private _profile: number,
      private _id: number,
      private _data: IntgConfig,
    ) {}

    serializeRequest(): Uint8Array {
      const w = new BinaryWriter();
      w.uint8(this._profile).uint8(this._id).skip(2);
      IntgConfig.encode(w, this._data);
      return w.result;
    }

    parseResponse(view: DataView) {
      new BinaryReader(view).assertDone("SetIntgConfig response");
    }

    get profile(): number {
      return this._profile;
    }

    get id(): number {
      return this._id;
    }

    get data(): IntgConfig {
      return this._data;
    }
  }

  export class SetMode implements Command {
    readonly msgId = MsgId.SET_MODE;

    constructor(
      private _mode: SysMode,
      private _restart: boolean,
    ) {}

    serializeRequest(): Uint8Array {
      const w = new BinaryWriter();
      w.uint8(this._mode).bool(this._restart);
      return w.result;
    }

    parseResponse(view: DataView) {
      new BinaryReader(view).assertDone("SetMode response");
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

    constructor() {}

    serializeRequest(): Uint8Array {
      return new Uint8Array(0);
    }

    parseResponse(view: DataView) {
      new BinaryReader(view).assertDone("StartScanning response");
    }
  }

  export class StopScanning implements Command {
    readonly msgId = MsgId.STOP_SCANNING;

    constructor() {}

    serializeRequest(): Uint8Array {
      return new Uint8Array(0);
    }

    parseResponse(view: DataView) {
      new BinaryReader(view).assertDone("StopScanning response");
    }
  }

  export class ConnectDevice implements Command {
    readonly msgId = MsgId.CONNECT_DEVICE;

    constructor(private _addr: DevAddr) {}

    serializeRequest(): Uint8Array {
      const w = new BinaryWriter();
      this._addr.encode(w);
      return w.result;
    }

    parseResponse(view: DataView) {
      new BinaryReader(view).assertDone("ConnectDevice response");
    }

    get addr(): DevAddr {
      return this._addr;
    }
  }

  export class DeleteDevice implements Command {
    readonly msgId = MsgId.DELETE_DEVICE;

    constructor(private _addr: DevAddr) {}

    serializeRequest(): Uint8Array {
      const w = new BinaryWriter();
      this._addr.encode(w);
      return w.result;
    }

    parseResponse(view: DataView) {
      new BinaryReader(view).assertDone("DeleteDevice response");
    }

    get addr(): DevAddr {
      return this._addr;
    }
  }

  export class FactoryReset implements Command {
    readonly msgId = MsgId.FACTORY_RESET;

    constructor() {}

    serializeRequest(): Uint8Array {
      return new Uint8Array(0);
    }

    parseResponse(view: DataView) {
      new BinaryReader(view).assertDone("FactoryReset response");
    }
  }

  export class SetJoyPortMode implements Command {
    readonly msgId = MsgId.SET_JOY_PORT_MODE;

    constructor(private _mode: JoyPortMode) {}

    serializeRequest(): Uint8Array {
      const w = new BinaryWriter();
      w.uint8(this._mode);
      return w.result;
    }

    parseResponse(view: DataView) {
      new BinaryReader(view).assertDone("SetJoyPortMode response");
    }

    get mode(): JoyPortMode {
      return this._mode;
    }
  }

  export class SysStateUpdateEvent {
    readonly msgId = MsgId.EVT_SYS_STATE_UPDATE;

    private _data?: SysState;

    parseMessage(view: DataView) {
      const r = new BinaryReader(view);
      this._data = { scanning: r.bool(), mode: r.uint8() };
      r.assertDone("SysStateUpdate event");
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
      const r = new BinaryReader(view);
      const deleted = r.bool();
      const addr = DevAddr.decode(r);
      const rssi = r.int8();
      const name = new TextDecoder().decode(r.bytes(31)).replace(/\0.*$/, "");
      this._data = { addr, rssi, name };
      this._deleted = deleted;
      r.assertDone("AdvListUpdate event");
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
      const r = new BinaryReader(view);
      this._deleted = r.bool();
      this._addr = DevAddr.decode(r);
      this._state = { connState: r.int8() };
      this._config = { profile: r.uint8() };
      r.assertDone("DevListUpdate event");
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
    private _intgs: Map<number, IntgConfig> = new Map();

    parseMessage(view: DataView) {
      const r = new BinaryReader(view);
      this._profile = r.uint8();
      r.skip(3);
      for (let i = 0; i < 5; i++) this._pins.set(i, PinConfig.decode(r));
      for (let i = 0; i < 2; i++) this._pots.set(i, PotConfig.decode(r));
      for (let i = 0; i < 2; i++) this._intgs.set(i, IntgConfig.decode(r));
      r.assertDone("ProfileUpdate event");
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

    get intgs(): Map<number, IntgConfig> {
      return this._intgs;
    }
  }

  export class JoyPortUpdateEvent {
    readonly msgId = Btj.MsgId.EVT_JOY_PORT_UPDATE;

    private _data?: Btj.JoyPortState;

    parseMessage(view: DataView) {
      const r = new BinaryReader(view);
      const mode = r.uint8();
      const pinMask = r.uint8();
      const pins = Array.from(
        { length: 5 },
        (_, i) => (pinMask & (1 << i)) !== 0,
      );
      const pots = [r.uint8(), r.uint8()];
      this._data = { mode, pins, pots };
      r.assertDone("JoyPortUpdate event");
    }

    get data(): Btj.JoyPortState {
      return assertPresent(this._data);
    }
  }
}
