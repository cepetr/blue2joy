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

enum Nsp405Reg {
  TCP0 = 0,
  TCP14 = 14,
  SCR = 16,
  VCR = 17,
  HOME = 18,
  BEGD = 20,
  ENDD = 22,
  SROW = 24,
  AL0 = 26,
  AL1 = 27,
  CURS = 28,
  ROW_PTR0 = 30,
  ROW_PTR1 = 31,
  ROW_PTR24 = 54,
  XSCROLL = 55,
}

export type Xep80CellAttr = {
  inverted: boolean;
  blinking: boolean;
  doubleHeight: boolean;
  doubleWidth: boolean;
  underline: boolean;
  blank: boolean;
  graphics: boolean;
};

export type Xep80RenderOptions = {
  curs: number;
  cursBlinking: boolean;
  attr: [Xep80CellAttr, Xep80CellAttr];
  invertedScreen: boolean;
  rows: Uint8Array;
  colOfs: number;
};

const ROW_PTR_COUNT = Nsp405Reg.ROW_PTR24 - Nsp405Reg.ROW_PTR0 + 1;

export function getRenderOptions(
  regs: Uint8Array,
): Xep80RenderOptions {
  return {
    curs: regs[Nsp405Reg.CURS] + regs[Nsp405Reg.CURS + 1] * 256,
    cursBlinking: (regs[Nsp405Reg.VCR] & 0x02) == 0,
    attr: [
      {
        inverted: (regs[Nsp405Reg.AL0] & 0x01) == 0,
        blinking: (regs[Nsp405Reg.AL0] & 0x04) == 0,
        doubleHeight: (regs[Nsp405Reg.AL0] & 0x08) == 0,
        doubleWidth: (regs[Nsp405Reg.AL0] & 0x10) == 0,
        underline: (regs[Nsp405Reg.AL0] & 0x20) == 0,
        blank: (regs[Nsp405Reg.AL0] & 0x40) == 0,
        graphics: (regs[Nsp405Reg.AL1] & 0x80) == 0,
      },
      {
        inverted: (regs[Nsp405Reg.AL1] & 0x01) == 0,
        blinking: (regs[Nsp405Reg.AL1] & 0x04) == 0,
        doubleHeight: (regs[Nsp405Reg.AL1] & 0x08) == 0,
        doubleWidth: (regs[Nsp405Reg.AL1] & 0x10) == 0,
        underline: (regs[Nsp405Reg.AL1] & 0x20) == 0,
        blank: (regs[Nsp405Reg.AL1] & 0x40) == 0,
        graphics: (regs[Nsp405Reg.AL1] & 0x80) == 0,
      },
    ],
    invertedScreen: (regs[Nsp405Reg.VCR] & 0x08) != 0,
    rows: regs.subarray(Nsp405Reg.ROW_PTR0, Nsp405Reg.ROW_PTR0 + ROW_PTR_COUNT),
    colOfs: regs[Nsp405Reg.XSCROLL],
  };
}
