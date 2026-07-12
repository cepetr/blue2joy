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

enum ModifierMask {
  None = 0,
  Shift = 1 << 0,
  Ctrl = 1 << 1,
  ShiftCtrl = 1 << 2,
  All = Shift | Ctrl | ShiftCtrl,
}

type KeyMapEntry = {
  keycode: number;
  allowedModifiers: ModifierMask;
  consumedModifiers: ModifierMask;
};

function key(
  keycode: number,
  allowedModifiers: ModifierMask = ModifierMask.All,
  consumedModifiers: ModifierMask = ModifierMask.None,
): KeyMapEntry {
  return { keycode, allowedModifiers, consumedModifiers };
}

const namedKeyMapping: Record<string, KeyMapEntry> = {
  Escape: key(28),
  Backspace: key(52),
  Tab: key(44),
  Enter: key(12),
  CapsLock: key(60),
  F6: key(23 | 0xC0, ModifierMask.None, ModifierMask.All), // Break key on Atari keyboard
  ArrowLeft: key(6 | 0x80, ModifierMask.None),
  ArrowRight: key(7 | 0x80, ModifierMask.None),
  ArrowUp: key(14 | 0x80, ModifierMask.None),
  ArrowDown: key(15 | 0x80, ModifierMask.None),
  Insert: key(55 | 0x80, ModifierMask.None),
  Delete: key(52 | 0x80, ModifierMask.None),
  Home: key(54 | 0x80, ModifierMask.None),
};

const characterKeyMapping: Record<string, KeyMapEntry> = {
  " ": key(33),
  _: key(14 | 0x40, ModifierMask.None, ModifierMask.Shift),
  "-": key(14),
  ",": key(32),
  ";": key(2, ModifierMask.None),
  ":": key(2 | 0x40, ModifierMask.None, ModifierMask.Shift),
  "!": key(31 | 0x40, ModifierMask.None, ModifierMask.Shift),
  "?": key(38 | 0x40, ModifierMask.None, ModifierMask.Shift),
  ".": key(34),
  '"': key(30 | 0x40, ModifierMask.None, ModifierMask.Shift),
  "(": key(48 | 0x40, ModifierMask.None, ModifierMask.Shift),
  ")": key(50 | 0x40, ModifierMask.None, ModifierMask.Shift),
  "[": key(32 | 0x40, ModifierMask.None),
  "]": key(34 | 0x40, ModifierMask.None),
  "@": key(53 | 0x40, ModifierMask.None, ModifierMask.Shift),
  "*": key(7, ModifierMask.None, ModifierMask.Shift),
  "/": key(38),
  "'": key(51 | 0x40, ModifierMask.None),
  "\\": key(6 | 0x40, ModifierMask.None),
  "&": key(27 | 0x40, ModifierMask.None, ModifierMask.Shift),
  "#": key(26 | 0x40, ModifierMask.None, ModifierMask.Shift),
  "%": key(29 | 0x40, ModifierMask.None, ModifierMask.Shift),
  "`": key(39),
  "^": key(7 | 0x40, ModifierMask.None, ModifierMask.Shift),
  "+": key(6, ModifierMask.None, ModifierMask.Shift),
  "<": key(54, ModifierMask.None, ModifierMask.Shift),
  "=": key(15),
  ">": key(55, ModifierMask.None, ModifierMask.Shift),
  "|": key(15 | 0x40, ModifierMask.None, ModifierMask.Shift),
  "$": key(24 | 0x40, ModifierMask.None, ModifierMask.Shift),
  "0": key(50, ModifierMask.Ctrl),
  "1": key(31, ModifierMask.Ctrl),
  "2": key(30, ModifierMask.Ctrl),
  "3": key(26, ModifierMask.Ctrl),
  "4": key(24, ModifierMask.Ctrl),
  "5": key(29, ModifierMask.Ctrl),
  "6": key(27, ModifierMask.Ctrl),
  "7": key(51, ModifierMask.Ctrl),
  "8": key(53, ModifierMask.Ctrl),
  "9": key(48, ModifierMask.Ctrl),
  a: key(63, ModifierMask.Shift | ModifierMask.Ctrl),
  b: key(21, ModifierMask.None),
  c: key(18, ModifierMask.None),
  d: key(58, ModifierMask.Shift | ModifierMask.Ctrl),
  e: key(42, ModifierMask.Shift | ModifierMask.Ctrl),
  f: key(56, ModifierMask.Shift | ModifierMask.Ctrl),
  g: key(61, ModifierMask.Shift | ModifierMask.Ctrl),
  h: key(57, ModifierMask.Shift | ModifierMask.Ctrl),
  i: key(13, ModifierMask.Shift | ModifierMask.Ctrl),
  j: key(1, ModifierMask.None),
  k: key(5, ModifierMask.None),
  l: key(0, ModifierMask.None),
  m: key(37, ModifierMask.Shift | ModifierMask.Ctrl),
  n: key(35, ModifierMask.Shift | ModifierMask.Ctrl),
  o: key(8, ModifierMask.Shift | ModifierMask.Ctrl),
  p: key(10, ModifierMask.Shift | ModifierMask.Ctrl),
  q: key(47, ModifierMask.Shift | ModifierMask.Ctrl),
  r: key(40, ModifierMask.Shift | ModifierMask.Ctrl),
  s: key(62, ModifierMask.Shift | ModifierMask.Ctrl),
  t: key(45, ModifierMask.Shift | ModifierMask.Ctrl),
  u: key(11, ModifierMask.Shift | ModifierMask.Ctrl),
  v: key(16, ModifierMask.None),
  w: key(46, ModifierMask.Shift | ModifierMask.Ctrl),
  x: key(22, ModifierMask.None),
  y: key(43, ModifierMask.Shift | ModifierMask.Ctrl),
  z: key(23, ModifierMask.None),
};

function requestedModifiers(event: KeyboardEvent): ModifierMask {
  if (event.shiftKey && event.ctrlKey) {
    return ModifierMask.ShiftCtrl;
  }

  if (event.shiftKey) {
    return ModifierMask.Shift;
  }

  if (event.ctrlKey) {
    return ModifierMask.Ctrl;
  }

  return ModifierMask.None;
}

function mapEventToAtariKeycode(event: KeyboardEvent): number | undefined {
  // Special cases for shifted editing keys.
  if (event.key === "Delete" && event.shiftKey) {
    return 0x34 | 0x40;
  } else if (event.key === "Insert" && event.shiftKey) {
    return 0x37 | 0x40;
  }

  let entry = namedKeyMapping[event.key];

  if (entry === undefined) {
    entry = characterKeyMapping[event.key.toLowerCase()];
  }

  if (entry === undefined) {
    return undefined;
  }

  const modifiers = requestedModifiers(event) & ~entry.consumedModifiers;

  if ((entry.allowedModifiers & modifiers) !== modifiers) {
    return undefined;
  }

  let keycode = entry.keycode;

  if (modifiers === ModifierMask.Shift || modifiers === ModifierMask.ShiftCtrl) {
    keycode |= 0x40;
  }

  if (modifiers === ModifierMask.Ctrl || modifiers === ModifierMask.ShiftCtrl) {
    keycode |= 0x80;
  }

  return keycode;
}

type Xep80KeyboardOptions = {
  isActive: () => boolean;
  sendKeycode: (keycode: number) => void;
  repeatDelayMs?: number;
  repeatIntervalMs?: number;
};

const defaultRepeatDelayMs = 500;
const defaultRepeatIntervalMs = 100;

export class Xep80Keyboard {
  private readonly isActive: () => boolean;

  private readonly sendKeycode: (keycode: number) => void;

  private readonly repeatDelayMs: number;

  private readonly repeatIntervalMs: number;

  private repeatDelayTimer?: number;

  private repeatIntervalTimer?: number;

  private repeatKeyId?: string;

  private repeatKeycode?: number;

  constructor(opt: Xep80KeyboardOptions) {
    this.isActive = opt.isActive;
    this.sendKeycode = opt.sendKeycode;
    this.repeatDelayMs = opt.repeatDelayMs ?? defaultRepeatDelayMs;
    this.repeatIntervalMs = opt.repeatIntervalMs ?? defaultRepeatIntervalMs;
  }

  attach() {
    window.addEventListener("keydown", this.onKeyDown, { capture: true });
    window.addEventListener("keyup", this.onKeyUp, { capture: true });
    window.addEventListener("blur", this.stopKeyRepeat);
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown, { capture: true });
    window.removeEventListener("keyup", this.onKeyUp, { capture: true });
    window.removeEventListener("blur", this.stopKeyRepeat);
    this.stopKeyRepeat();
  }

  private getRepeatKeyId(event: KeyboardEvent): string {
    return [
      event.code,
      event.shiftKey ? "1" : "0",
      event.ctrlKey ? "1" : "0",
      event.altKey ? "1" : "0",
      event.metaKey ? "1" : "0",
    ].join("|");
  }

  private isCtrlCharShortcut(event: KeyboardEvent): boolean {
    return event.ctrlKey
      && !event.altKey
      && !event.metaKey
      && event.key.length === 1;
  }

  private clearRepeatTimers() {
    if (this.repeatDelayTimer !== undefined) {
      window.clearTimeout(this.repeatDelayTimer);
      this.repeatDelayTimer = undefined;
    }

    if (this.repeatIntervalTimer !== undefined) {
      window.clearInterval(this.repeatIntervalTimer);
      this.repeatIntervalTimer = undefined;
    }
  }

  private stopKeyRepeat = () => {
    this.clearRepeatTimers();
    this.repeatKeyId = undefined;
    this.repeatKeycode = undefined;
  };

  private startKeyRepeat(keyId: string, keycode: number) {
    this.stopKeyRepeat();

    this.repeatKeyId = keyId;
    this.repeatKeycode = keycode;

    this.repeatDelayTimer = window.setTimeout(() => {
      this.repeatDelayTimer = undefined;

      if (!this.isActive() || this.repeatKeycode === undefined) {
        this.stopKeyRepeat();
        return;
      }

      this.sendKeycode(this.repeatKeycode);

      this.repeatIntervalTimer = window.setInterval(() => {
        if (!this.isActive() || this.repeatKeycode === undefined) {
          this.stopKeyRepeat();
          return;
        }

        this.sendKeycode(this.repeatKeycode);
      }, this.repeatIntervalMs);
    }, this.repeatDelayMs);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.isActive()) {
      this.stopKeyRepeat();
      return;
    }

    const keycode = mapEventToAtariKeycode(event);

    if (keycode === undefined) {
      if (this.isCtrlCharShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
      }

      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.repeat) {
      return;
    }

    const keyId = this.getRepeatKeyId(event);

    this.sendKeycode(keycode);
    this.startKeyRepeat(keyId, keycode);
  };

  private onKeyUp = (event: KeyboardEvent) => {
    const keyId = this.getRepeatKeyId(event);

    if (keyId === this.repeatKeyId) {
      this.stopKeyRepeat();
    }

    if (!this.isActive()) {
      return;
    }

    const keycode = mapEventToAtariKeycode(event);

    if (keycode !== undefined || this.isCtrlCharShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
}
