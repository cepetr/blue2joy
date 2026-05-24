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
import { HidUsage } from "../utils/hid-usage.js";
import { Btj } from "./btj-messages";
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

type VirtualLifecycleHook = (emit: (frame: Uint8Array) => void) => void;

type VirtualProfile = {
  pins: Btj.PinConfig[];
  pots: Btj.PotConfig[];
  intgs: Btj.IntgConfig[];
};

type VirtualRadio = {
  addr: Btj.DevAddr;
  name: string;
  rssi: number;
  bonded: boolean;
  profile: number;
  connState: Btj.ConnState;
};

type VirtualXep80Printer = {
  cursorOfs: number;
  nextRow: number;
  nextCol: number;
  textIndex: number;
};

const XEP80_RAM_SIZE = 8192;
const XEP80_REGS_SIZE = 64;
const XEP80_STATE_SIZE = XEP80_RAM_SIZE + XEP80_REGS_SIZE;
const XEP80_ROW_COUNT = 25;
const XEP80_ROW_SIZE = 256;
const XEP80_VISIBLE_ROWS = 24;
const XEP80_VISIBLE_COLS = 80;
const XEP80_BLANK_CHAR = 0x9b;
const XEP80_TEXT_RAM_SIZE = XEP80_ROW_COUNT * XEP80_ROW_SIZE;
const XEP80_CHARS_PER_SECOND = 200;
const XEP80_CHAR_DELAY_MS = Math.round(1000 / XEP80_CHARS_PER_SECOND);
const XEP80_REG_OFFSET = XEP80_RAM_SIZE;
const XEP80_REG_VCR = XEP80_REG_OFFSET + 17;
const XEP80_REG_CURS = XEP80_REG_OFFSET + 28;
const XEP80_REG_ROW_PTR0 = XEP80_REG_OFFSET + 30;
const XEP80_REG_XSCROLL = XEP80_REG_OFFSET + 55;
const XEP80_DEMO_LINES = ["XEP-80 0.1h installed", "", "D1:"];
const XEP80_DEMO_TEXT = `${XEP80_DEMO_LINES.join("\n")}`;

export class VirtualBtjTransport implements BtjTransport {
  private isOpen = false;
  private frameHandler: BtjFrameHandler | null = null;
  private disconnectHandler: BtjDisconnectHandler | null = null;

  constructor(
    private readonly responder: VirtualResponder,
    private readonly onOpen?: VirtualLifecycleHook,
    private readonly onClose?: () => void,
  ) { }

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
    this.onClose?.();
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
  const emulator = new VirtualBlue2JoyDevice();
  return new VirtualBtjTransport(
    (frame, emit) => emulator.handleFrame(frame, emit),
    (emit) => emulator.handleOpen(emit),
    () => emulator.handleClose(),
  );
}

class VirtualBlue2JoyDevice {
  private readonly apiVersion = { major: 1, minor: 0 };
  private readonly sysInfo = {
    hwId: new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x42, 0x4a, 0x01, 0x00]),
    hwVersion: (0 << 24) | (0 << 16) | (0 << 8),
    swVersion: (0 << 24) | (2 << 16) | (0 << 8),
  };

  private sysMode = Btj.SysMode.AUTO;
  private scanning = false;
  private joyPortMode = Btj.JoyPortMode.NORMAL;
  private joyPins = [false, true, false, false, true];
  private joyPots = [196, 228];
  private readonly profiles = new Map<number, VirtualProfile>();
  private readonly radios: VirtualRadio[] = [];
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly xep80State = new Uint8Array(XEP80_STATE_SIZE);
  private xep80Printer: VirtualXep80Printer | null = null;

  constructor() {
    this.resetState();
  }

  handleOpen(emit: (frame: Uint8Array) => void): void {
    this.emitSysState(emit);
    for (const radio of this.radios.filter((entry) => entry.bonded)) {
      this.emitDeviceUpdate(emit, radio);
    }
    for (const profileId of this.profileIds()) {
      this.emitProfileUpdate(emit, profileId);
    }
    this.emitJoyPortUpdate(emit);
    if (this.joyPortMode === Btj.JoyPortMode.UART) {
      this.startXep80Demo(emit);
    }
    if (this.scanning) {
      this.scheduleScanBursts(emit);
    }
  }

  handleClose(): void {
    this.clearTimers();
  }

  handleFrame(frame: Uint8Array, emit: (frame: Uint8Array) => void): void {
    const decoded = decodeBtjFrame(frame);
    if (!decoded || decoded.type !== BtjFrameType.REQUEST) {
      return;
    }

    let payload: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    let responseType = BtjFrameType.RESPONSE;

    try {
      switch (decoded.msgId) {
        case Btj.MsgId.GET_API_VERSION:
          payload = new BinaryWriter()
            .uint8(this.apiVersion.major)
            .uint8(this.apiVersion.minor).result;
          break;
        case Btj.MsgId.GET_SYS_INFO:
          payload = new BinaryWriter()
            .bytes(this.sysInfo.hwId)
            .uint32(this.sysInfo.hwVersion)
            .uint32(this.sysInfo.swVersion).result;
          break;
        case Btj.MsgId.SET_DEV_CONFIG:
          this.handleSetDevConfig(decoded.payload, emit);
          break;
        case Btj.MsgId.SET_PIN_CONFIG:
          this.handleSetPinConfig(decoded.payload, emit);
          break;
        case Btj.MsgId.SET_POT_CONFIG:
          this.handleSetPotConfig(decoded.payload, emit);
          break;
        case Btj.MsgId.SET_INTG_CONFIG:
          this.handleSetIntgConfig(decoded.payload, emit);
          break;
        case Btj.MsgId.SET_PROFILE:
          this.handleSetProfile(decoded.payload, emit);
          break;
        case Btj.MsgId.SET_MODE:
          this.handleSetMode(decoded.payload, emit);
          break;
        case Btj.MsgId.START_SCANNING:
          this.handleStartScanning(emit);
          break;
        case Btj.MsgId.STOP_SCANNING:
          this.handleStopScanning(emit);
          break;
        case Btj.MsgId.CONNECT_DEVICE:
          this.handleConnectDevice(decoded.payload, emit);
          break;
        case Btj.MsgId.DELETE_DEVICE:
          this.handleDeleteDevice(decoded.payload, emit);
          break;
        case Btj.MsgId.FACTORY_RESET:
          this.handleFactoryReset(emit);
          break;
        case Btj.MsgId.SET_JOY_PORT_MODE:
          this.handleSetJoyPortMode(decoded.payload, emit);
          break;
        default:
          responseType = BtjFrameType.ERROR;
          break;
      }
    } catch {
      responseType = BtjFrameType.ERROR;
      payload = new Uint8Array(0);
    }

    emit(encodeBtjFrame(responseType, decoded.msgId, decoded.seq, payload));
  }

  private resetState(): void {
    this.clearTimers();
    this.sysMode = Btj.SysMode.AUTO;
    this.scanning = false;
    this.joyPortMode = Btj.JoyPortMode.NORMAL;
    this.joyPins = [false, true, false, false, true];
    this.joyPots = [196, 228];
    this.resetXep80State();

    this.profiles.clear();
    for (let profileId = 0; profileId < 5; profileId++) {
      this.profiles.set(profileId, createProfile(profileId));
    }

    this.radios.splice(
      0,
      this.radios.length,
      {
        addr: new Btj.DevAddr([0x00, 0x34, 0x12, 0xab, 0xcd, 0x01, 0x00]),
        name: "Gamepad 1",
        rssi: -42,
        bonded: true,
        profile: 0,
        connState: Btj.ConnState.READY,
      },
      {
        addr: new Btj.DevAddr([0x00, 0xbc, 0x9a, 0x54, 0x32, 0x03, 0x00]),
        name: "Demo Mouse",
        rssi: -67,
        bonded: true,
        profile: 2,
        connState: Btj.ConnState.DISCONNECTED,
      },
      {
        addr: new Btj.DevAddr([0x01, 0xad, 0xde, 0x66, 0x24, 0x04, 0x00]),
        name: "Gamepad 2",
        rssi: -61,
        bonded: false,
        profile: 3,
        connState: Btj.ConnState.DISCONNECTED,
      },
    );
  }

  private profileIds(): number[] {
    return Array.from(this.profiles.keys()).sort((left, right) => left - right);
  }

  private clearTimers(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  private schedule(delayMs: number, callback: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delayMs);
    this.timers.add(timer);
  }

  private findRadio(addr: Btj.DevAddr): VirtualRadio | undefined {
    return this.radios.find((entry) => entry.addr.equals(addr));
  }

  private requireProfile(profileId: number): VirtualProfile {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Unknown profile ${profileId}`);
    }
    return profile;
  }

  private requireRadio(addr: Btj.DevAddr): VirtualRadio {
    const radio = this.findRadio(addr);
    if (!radio) {
      throw new Error(`Unknown device ${addr.toString()}`);
    }
    return radio;
  }

  private emitEvent(
    emit: (frame: Uint8Array) => void,
    msgId: Btj.MsgId,
    payload: Uint8Array,
  ): void {
    emit(encodeBtjFrame(BtjFrameType.EVENT, msgId, 0, payload));
  }

  private emitSysState(emit: (frame: Uint8Array) => void): void {
    this.emitEvent(
      emit,
      Btj.MsgId.EVT_SYS_STATE_UPDATE,
      new BinaryWriter().bool(this.scanning).uint8(this.sysMode).result,
    );
  }

  private emitJoyPortUpdate(emit: (frame: Uint8Array) => void): void {
    let pinMask = 0;
    for (let index = 0; index < this.joyPins.length; index++) {
      if (this.joyPins[index]) {
        pinMask |= 1 << index;
      }
    }

    this.emitEvent(
      emit,
      Btj.MsgId.EVT_JOY_PORT_UPDATE,
      new BinaryWriter()
        .uint8(this.joyPortMode)
        .uint8(pinMask)
        .uint8(this.joyPots[0])
        .uint8(this.joyPots[1]).result,
    );
  }

  private emitDeviceUpdate(
    emit: (frame: Uint8Array) => void,
    radio: VirtualRadio,
    deleted = false,
  ): void {
    this.emitEvent(
      emit,
      Btj.MsgId.EVT_DEV_LIST_UPDATE,
      new BinaryWriter()
        .bool(deleted)
        .bytes(encodedAddr(radio.addr))
        .uint8(radio.connState)
        .uint8(radio.profile).result,
    );
  }

  private emitAdvUpdate(
    emit: (frame: Uint8Array) => void,
    radio: VirtualRadio,
    deleted = false,
  ): void {
    this.emitEvent(
      emit,
      Btj.MsgId.EVT_ADV_LIST_UPDATE,
      new BinaryWriter()
        .bool(deleted)
        .bytes(encodedAddr(radio.addr))
        .uint8(toInt8Byte(radio.rssi))
        .bytes(encodeName(radio.name)).result,
    );
  }

  private emitProfileUpdate(
    emit: (frame: Uint8Array) => void,
    profileId: number,
  ): void {
    const profile = this.requireProfile(profileId);
    const writer = new BinaryWriter().uint8(profileId).skip(3);

    for (const config of profile.pins) {
      Btj.PinConfig.encode(writer, config);
    }
    for (const config of profile.pots) {
      Btj.PotConfig.encode(writer, config);
    }
    for (const config of profile.intgs) {
      Btj.IntgConfig.encode(writer, config);
    }

    this.emitEvent(emit, Btj.MsgId.EVT_PROFILE_UPDATE, writer.result);
  }

  private emitXep80Update(emit: (frame: Uint8Array) => void): void {
    this.emitEvent(
      emit,
      Btj.MsgId.EVT_XEP80_UPDATE,
      buildXep80InitFrame(this.xep80State),
    );
  }

  private emitXep80Delta(
    emit: (frame: Uint8Array) => void,
    payload: Uint8Array,
  ): void {
    this.emitEvent(emit, Btj.MsgId.EVT_XEP80_UPDATE, payload);
  }

  private scheduleScanBursts(emit: (frame: Uint8Array) => void): void {
    const visibleRadios = this.radios
      .slice()
      .sort((left, right) => left.rssi - right.rssi);
    visibleRadios.forEach((radio, index) => {
      this.schedule(index * 180, () => {
        if (!this.scanning) {
          return;
        }
        radio.rssi = clampRssi(radio.rssi + (index % 2 === 0 ? -2 : 3));
        this.emitAdvUpdate(emit, radio);
      });
    });
  }

  private scheduleConnectionProgress(
    emit: (frame: Uint8Array) => void,
    radio: VirtualRadio,
  ): void {
    this.schedule(220, () => {
      if (radio.connState !== Btj.ConnState.CONNECTING) {
        return;
      }
      radio.connState = Btj.ConnState.CONNECTED;
      this.emitDeviceUpdate(emit, radio);
    });
    this.schedule(520, () => {
      if (radio.connState !== Btj.ConnState.CONNECTED) {
        return;
      }
      radio.connState = Btj.ConnState.READY;
      this.emitDeviceUpdate(emit, radio);
      this.applyJoySnapshotForProfile(radio.profile);
      this.emitJoyPortUpdate(emit);
    });
  }

  private disconnectActiveRadios(
    emit: (frame: Uint8Array) => void,
    keepAddr?: Btj.DevAddr,
  ): void {
    for (const radio of this.radios) {
      if (keepAddr && radio.addr.equals(keepAddr)) {
        continue;
      }
      if (radio.connState >= Btj.ConnState.CONNECTING) {
        radio.connState = Btj.ConnState.DISCONNECTED;
        this.emitDeviceUpdate(emit, radio);
      }
    }
  }

  private applyJoySnapshotForProfile(profileId: number): void {
    switch (profileId % 4) {
      case 0:
        this.joyPins = [false, true, false, false, true];
        this.joyPots = [196, 228];
        break;
      case 1:
        this.joyPins = [true, false, false, true, false];
        this.joyPots = [128, 200];
        break;
      case 2:
        this.joyPins = [false, false, true, false, false];
        this.joyPots = [32, 240];
        break;
      default:
        this.joyPins = [true, true, false, false, false];
        this.joyPots = [90, 90];
        break;
    }
  }

  private resetXep80State(): void {
    this.xep80State.fill(0);
    this.xep80State.fill(XEP80_BLANK_CHAR, 0, XEP80_ROW_COUNT * XEP80_ROW_SIZE);
    this.xep80State[XEP80_REG_VCR] = 0x00;
    this.xep80State[XEP80_REG_OFFSET + 26] = 0xff;
    this.xep80State[XEP80_REG_OFFSET + 27] = 0xff;
    this.xep80State[XEP80_REG_XSCROLL] = 0;

    for (let row = 0; row < XEP80_ROW_COUNT; row++) {
      this.xep80State[XEP80_REG_ROW_PTR0 + row] = row;
    }

    this.setXep80Cursor(0, 0);
    this.xep80Printer = null;
  }

  private setXep80Cursor(row: number, col: number): void {
    const cursorOfs = row * XEP80_ROW_SIZE + col;
    this.xep80State[XEP80_REG_CURS] = cursorOfs & 0xff;
    this.xep80State[XEP80_REG_CURS + 1] = (cursorOfs >> 8) & 0xff;
  }

  private startXep80Demo(emit: (frame: Uint8Array) => void): void {
    this.resetXep80State();
    this.xep80Printer = {
      cursorOfs: 0,
      nextRow: 0,
      nextCol: 0,
      textIndex: 0,
    };
    this.emitXep80Update(emit);
    this.scheduleNextXep80Tick(emit);
  }

  private scheduleNextXep80Tick(emit: (frame: Uint8Array) => void): void {
    if (!this.xep80Printer) {
      return;
    }
    this.schedule(XEP80_CHAR_DELAY_MS, () => this.stepXep80Demo(emit));
  }

  private stepXep80Demo(emit: (frame: Uint8Array) => void): void {
    const printer = this.xep80Printer;
    if (!printer || this.joyPortMode !== Btj.JoyPortMode.UART) {
      return;
    }

    if (printer.textIndex >= XEP80_DEMO_TEXT.length) {
      this.xep80Printer = null;
      return;
    }

    const nextChar = XEP80_DEMO_TEXT[printer.textIndex++];
    let payload: Uint8Array;

    if (nextChar === "\n") {
      printer.nextRow = Math.min(printer.nextRow + 1, XEP80_VISIBLE_ROWS - 1);
      printer.nextCol = 0;
      printer.cursorOfs = printer.nextRow * XEP80_ROW_SIZE;
      this.setXep80Cursor(printer.nextRow, printer.nextCol);
      payload = buildXep80CursorFrame(printer.cursorOfs);
    } else {
      if (printer.nextCol >= XEP80_VISIBLE_COLS) {
        printer.nextRow = Math.min(printer.nextRow + 1, XEP80_VISIBLE_ROWS - 1);
        printer.nextCol = 0;
      }

      const writeOfs = printer.nextRow * XEP80_ROW_SIZE + printer.nextCol;
      const charCode = nextChar.charCodeAt(0) & 0x7f;
      this.xep80State[writeOfs] = charCode;

      printer.nextCol = Math.min(printer.nextCol + 1, XEP80_VISIBLE_COLS - 1);
      printer.cursorOfs = printer.nextRow * XEP80_ROW_SIZE + printer.nextCol;
      this.setXep80Cursor(printer.nextRow, printer.nextCol);
      payload = buildXep80CharFrame(writeOfs, charCode, printer.cursorOfs);
    }

    this.emitXep80Delta(emit, payload);
    this.scheduleNextXep80Tick(emit);
  }

  private handleSetDevConfig(
    payload: DataView,
    emit: (frame: Uint8Array) => void,
  ): void {
    const reader = new BinaryReader(payload);
    const addr = Btj.DevAddr.decode(reader);
    const profile = reader.uint8();
    reader.assertDone("SetDevConfig request");

    this.requireProfile(profile);
    const radio = this.requireRadio(addr);
    radio.profile = profile;
    radio.bonded = true;
    this.emitDeviceUpdate(emit, radio);
  }

  private handleSetPinConfig(
    payload: DataView,
    emit: (frame: Uint8Array) => void,
  ): void {
    const reader = new BinaryReader(payload);
    const profileId = reader.uint8();
    const pinId = reader.uint8();
    reader.skip(2);
    const config = Btj.PinConfig.decode(reader);
    reader.assertDone("SetPinConfig request");

    const profile = this.requireProfile(profileId);
    if (pinId >= profile.pins.length) {
      throw new Error(`Invalid pin ${pinId}`);
    }
    profile.pins[pinId] = clonePinConfig(config);
    this.emitProfileUpdate(emit, profileId);
  }

  private handleSetPotConfig(
    payload: DataView,
    emit: (frame: Uint8Array) => void,
  ): void {
    const reader = new BinaryReader(payload);
    const profileId = reader.uint8();
    const potId = reader.uint8();
    reader.skip(2);
    const config = Btj.PotConfig.decode(reader);
    reader.assertDone("SetPotConfig request");

    const profile = this.requireProfile(profileId);
    if (potId >= profile.pots.length) {
      throw new Error(`Invalid pot ${potId}`);
    }
    profile.pots[potId] = clonePotConfig(config);
    this.emitProfileUpdate(emit, profileId);
  }

  private handleSetIntgConfig(
    payload: DataView,
    emit: (frame: Uint8Array) => void,
  ): void {
    const reader = new BinaryReader(payload);
    const profileId = reader.uint8();
    const intgId = reader.uint8();
    reader.skip(2);
    const config = Btj.IntgConfig.decode(reader);
    reader.assertDone("SetIntgConfig request");

    const profile = this.requireProfile(profileId);
    if (intgId >= profile.intgs.length) {
      throw new Error(`Invalid integrator ${intgId}`);
    }
    profile.intgs[intgId] = cloneIntgConfig(config);
    this.emitProfileUpdate(emit, profileId);
  }

  private handleSetProfile(
    payload: DataView,
    emit: (frame: Uint8Array) => void,
  ): void {
    const reader = new BinaryReader(payload);
    const profileId = reader.uint8();
    reader.skip(3);

    const profile: VirtualProfile = {
      pins: Array.from({ length: 5 }, () => Btj.PinConfig.decode(reader)),
      pots: Array.from({ length: 2 }, () => Btj.PotConfig.decode(reader)),
      intgs: Array.from({ length: 2 }, () => Btj.IntgConfig.decode(reader)),
    };
    reader.assertDone("SetProfile request");

    this.profiles.set(profileId, profile);
    this.emitProfileUpdate(emit, profileId);
  }

  private handleSetMode(
    payload: DataView,
    emit: (frame: Uint8Array) => void,
  ): void {
    const reader = new BinaryReader(payload);
    this.sysMode = reader.uint8();
    const restart = reader.bool();
    reader.assertDone("SetMode request");

    if (restart) {
      this.scanning = false;
      this.clearTimers();
    }
    this.emitSysState(emit);
  }

  private handleStartScanning(emit: (frame: Uint8Array) => void): void {
    this.clearTimers();
    this.disconnectActiveRadios(emit);
    this.scanning = true;
    this.emitSysState(emit);
    this.scheduleScanBursts(emit);
  }

  private handleStopScanning(emit: (frame: Uint8Array) => void): void {
    this.scanning = false;
    this.clearTimers();
    this.emitSysState(emit);
  }

  private handleConnectDevice(
    payload: DataView,
    emit: (frame: Uint8Array) => void,
  ): void {
    const reader = new BinaryReader(payload);
    const addr = Btj.DevAddr.decode(reader);
    reader.assertDone("ConnectDevice request");

    const radio = this.requireRadio(addr);
    this.clearTimers();
    this.disconnectActiveRadios(emit, addr);
    this.scanning = false;
    this.emitSysState(emit);

    radio.bonded = true;
    radio.connState = Btj.ConnState.CONNECTING;
    this.emitDeviceUpdate(emit, radio);
    this.scheduleConnectionProgress(emit, radio);
  }

  private handleDeleteDevice(
    payload: DataView,
    emit: (frame: Uint8Array) => void,
  ): void {
    const reader = new BinaryReader(payload);
    const addr = Btj.DevAddr.decode(reader);
    reader.assertDone("DeleteDevice request");

    const radio = this.requireRadio(addr);
    radio.bonded = false;
    radio.connState = Btj.ConnState.DISCONNECTED;
    this.emitDeviceUpdate(emit, radio, true);
  }

  private handleFactoryReset(emit: (frame: Uint8Array) => void): void {
    const previousBonded = this.radios.filter((radio) => radio.bonded);
    this.resetState();

    for (const radio of previousBonded) {
      this.emitDeviceUpdate(emit, radio, true);
    }
    this.emitSysState(emit);
    for (const profileId of this.profileIds()) {
      this.emitProfileUpdate(emit, profileId);
    }
    this.emitJoyPortUpdate(emit);
  }

  private handleSetJoyPortMode(
    payload: DataView,
    emit: (frame: Uint8Array) => void,
  ): void {
    const reader = new BinaryReader(payload);
    this.joyPortMode = reader.uint8();
    reader.assertDone("SetJoyPortMode request");
    this.emitJoyPortUpdate(emit);
    if (this.joyPortMode === Btj.JoyPortMode.UART) {
      this.startXep80Demo(emit);
    } else {
      this.xep80Printer = null;
    }
  }
}

function createProfile(profileId: number): VirtualProfile {
  switch (profileId) {
    case 0:
      return createJoyAnalogProfile();
    case 1:
      return createJoyHatSwitchProfile();
    case 2:
      return createMouseProfile();
    case 3:
    case 4:
      return createEmptyProfile();
    default:
      throw new Error(`Unsupported profile ${profileId}`);
  }
}

const HAT_SWITCH_UP = 0x01;
const HAT_SWITCH_DOWN = 0x02;
const HAT_SWITCH_LEFT = 0x04;
const HAT_SWITCH_RIGHT = 0x08;

function createEmptyProfile(): VirtualProfile {
  return {
    pins: Array.from({ length: 5 }, () => Btj.PinConfig.default()),
    pots: Array.from({ length: 2 }, () => Btj.PotConfig.default()),
    intgs: Array.from({ length: 2 }, () => Btj.IntgConfig.default()),
  };
}

function createJoyAnalogProfile(): VirtualProfile {
  const profile = createEmptyProfile();

  profile.pins[0] = createPinConfig(HidUsage.Y, {
    threshold: 30,
    hysteresis: 2,
    invert: true,
  });
  profile.pins[1] = createPinConfig(HidUsage.Y, {
    threshold: 70,
    hysteresis: 2,
  });
  profile.pins[2] = createPinConfig(HidUsage.X, {
    threshold: 30,
    hysteresis: 2,
    invert: true,
  });
  profile.pins[3] = createPinConfig(HidUsage.X, {
    threshold: 70,
    hysteresis: 2,
  });
  profile.pins[4] = createPinConfig(HidUsage.ACCELL, {
    threshold: 20,
    hysteresis: 2,
  });
  profile.pots[0] = createPotConfig(HidUsage.Z, 1, 228);
  profile.pots[1] = createPotConfig(HidUsage.RZ, 1, 228);

  return profile;
}

function createJoyHatSwitchProfile(): VirtualProfile {
  const profile = createEmptyProfile();

  profile.pins[0] = createPinConfig(HidUsage.HAT_SWITCH, {
    hatSwitch: HAT_SWITCH_UP,
  });
  profile.pins[1] = createPinConfig(HidUsage.HAT_SWITCH, {
    hatSwitch: HAT_SWITCH_DOWN,
  });
  profile.pins[2] = createPinConfig(HidUsage.HAT_SWITCH, {
    hatSwitch: HAT_SWITCH_LEFT,
  });
  profile.pins[3] = createPinConfig(HidUsage.HAT_SWITCH, {
    hatSwitch: HAT_SWITCH_RIGHT,
  });
  profile.pins[4] = createPinConfig(HidUsage.BUTTON_1);

  return profile;
}

function createMouseProfile(): VirtualProfile {
  const profile = createEmptyProfile();

  profile.pins[0] = createPinConfig(HidUsage.BUTTON_2);
  profile.pins[1] = createPinConfig(HidUsage.BUTTON_3);
  profile.pins[2] = createPinConfig(HidUsage.BUTTON_4);
  profile.pins[3] = createPinConfig(HidUsage.BUTTON_5);
  profile.pins[4] = createPinConfig(HidUsage.BUTTON_1);
  profile.pots[0] = createPotConfig(HidUsage.X, -1710, 1938);
  profile.pots[1] = createPotConfig(HidUsage.Y, -1710, 1938);

  return profile;
}

function createPinConfig(
  source: number,
  options: Partial<Btj.PinConfig> = {},
): Btj.PinConfig {
  const config = Btj.PinConfig.default();
  config.source = source;
  if (options.invert !== undefined) {
    config.invert = options.invert;
  }
  if (options.hatSwitch !== undefined) {
    config.hatSwitch = options.hatSwitch;
  }
  if (options.threshold !== undefined) {
    config.threshold = options.threshold;
  }
  if (options.hysteresis !== undefined) {
    config.hysteresis = options.hysteresis;
  }
  return config;
}

function createPotConfig(
  source: number,
  low: number,
  high: number,
): Btj.PotConfig {
  const config = Btj.PotConfig.default();
  config.source = source;
  config.low = low;
  config.high = high;
  return config;
}

function clampRssi(value: number): number {
  return Math.max(-95, Math.min(-25, value));
}

function clonePinConfig(config: Btj.PinConfig): Btj.PinConfig {
  const copy = Btj.PinConfig.default();
  copy.source = config.source;
  copy.invert = config.invert;
  copy.hatSwitch = config.hatSwitch;
  copy.threshold = config.threshold;
  copy.hysteresis = config.hysteresis;
  return copy;
}

function clonePotConfig(config: Btj.PotConfig): Btj.PotConfig {
  const copy = Btj.PotConfig.default();
  copy.source = config.source;
  copy.low = config.low;
  copy.high = config.high;
  return copy;
}

function cloneIntgConfig(config: Btj.IntgConfig): Btj.IntgConfig {
  const copy = Btj.IntgConfig.default();
  copy.source = config.source;
  copy.mode = config.mode;
  copy.deadZone = config.deadZone;
  copy.gain = config.gain;
  copy.max = config.max;
  return copy;
}

function encodedAddr(addr: Btj.DevAddr): Uint8Array<ArrayBufferLike> {
  const writer = new BinaryWriter();
  addr.encode(writer);
  return writer.result;
}

function encodeName(name: string): Uint8Array<ArrayBufferLike> {
  const bytes = new TextEncoder().encode(name.slice(0, 31));
  const padded = new Uint8Array(31);
  padded.set(bytes.slice(0, 31));
  return padded;
}

function toInt8Byte(value: number): number {
  return value & 0xff;
}

function buildXep80InitFrame(state: Uint8Array): Uint8Array {
  const firstRunLength = 4096;
  const secondRunLength = XEP80_TEXT_RAM_SIZE - firstRunLength;
  const payload = new Uint8Array(15 + XEP80_REGS_SIZE + 1);
  let index = 0;

  payload[index++] = 0x00;
  payload[index++] = 0x00;
  payload[index++] = 0x9f;
  payload[index++] = 0xff;
  payload[index++] = XEP80_BLANK_CHAR;
  payload[index++] = 0x10;
  payload[index++] = 0x00;
  payload[index++] = 0x98;
  payload[index++] = (secondRunLength - 1) & 0xff;
  payload[index++] = XEP80_BLANK_CHAR;
  payload[index++] = 0x20;
  payload[index++] = 0x00;
  payload[index++] = 0xbf;
  payload[index++] = XEP80_REGS_SIZE - 1;
  payload.set(
    state.subarray(XEP80_REG_OFFSET, XEP80_REG_OFFSET + XEP80_REGS_SIZE),
    index,
  );
  index += XEP80_REGS_SIZE;
  payload[index] = 0xff;

  return payload;
}

function buildXep80CursorFrame(cursorOfs: number): Uint8Array {
  return buildXep80LiteralFrame(
    XEP80_REG_CURS,
    new Uint8Array([cursorOfs & 0xff, (cursorOfs >> 8) & 0xff]),
  );
}

function buildXep80CharFrame(
  writeOfs: number,
  charCode: number,
  cursorOfs: number,
): Uint8Array {
  const payload = new Uint8Array(2 + 2 + 2 + 3 + 1);
  let index = 0;

  payload[index++] = (writeOfs >> 8) & 0x7f;
  payload[index++] = writeOfs & 0xff;
  payload[index++] = 0xa0;
  payload[index++] = charCode;
  payload[index++] = ((XEP80_REG_CURS >> 8) & 0x7f) | 0x20;
  payload[index++] = XEP80_REG_CURS & 0xff;
  payload[index++] = 0xa1;
  payload[index++] = cursorOfs & 0xff;
  payload[index++] = (cursorOfs >> 8) & 0xff;
  payload[index] = 0xff;

  return payload;
}

function buildXep80LiteralFrame(
  address: number,
  bytes: Uint8Array,
): Uint8Array {
  const payload = new Uint8Array(2 + 1 + bytes.length + 1);
  let index = 0;

  payload[index++] = (address >> 8) & 0x7f;
  payload[index++] = address & 0xff;
  payload[index++] = 0xa0 | (bytes.length - 1);
  payload.set(bytes, index);
  index += bytes.length;
  payload[index] = 0xff;

  return payload;
}
