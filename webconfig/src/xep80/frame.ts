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

import {
  getRenderOptions,
  type Xep80CellAttr,
} from "./attributes.js";
import { getXep80Charset } from "./charset.js";
import {
  XEP80_RAM_SIZE,
  XEP80_STATE_SIZE,
} from "./decoder.js";

export type Xep80FrameCell = {
  col: number;
  ofs: number;
  charCode: number;
  attr: Xep80CellAttr;
  cursor: boolean;
  doubleWidth: boolean;
};

export type Xep80FrameRow = {
  row: number;
  fontIndex: number;
  cells: Xep80FrameCell[];
};

export type Xep80Frame = {
  invertedScreen: boolean;
  cursorBlinking: boolean;
  rows: Xep80FrameRow[];
};

export function decodeXep80Frame(
  state: Uint8Array,
  displayRows: number,
  displayCols: number,
): Xep80Frame {
  const ram = state.subarray(0, XEP80_RAM_SIZE);
  const regs = state.subarray(XEP80_RAM_SIZE, XEP80_STATE_SIZE);
  const opt = getRenderOptions(regs);
  const rows: Xep80FrameRow[] = [];

  for (let row = 0; row < displayRows; row++) {
    const rowOfs = (opt.rows[row] & 0x1f) * 256 + opt.colOfs;
    const fontIndex = (opt.rows[row] >> 5) & 0x03;
    const charset = getXep80Charset(fontIndex);
    let rowAttr: [Xep80CellAttr, Xep80CellAttr] = opt.attr;

    if (charset?.externalFont) {
      rowAttr = [opt.attr[0], { ...opt.attr[1], inverted: !opt.attr[1].inverted }];
    }

    const cells: Xep80FrameCell[] = [];
    for (let col = 0; col < displayCols; col++) {
      const ofs = rowOfs + col;
      const isData = ram[ofs] !== 0x9b;
      const attr = isData ? rowAttr[ram[ofs] & 0x80 ? 1 : 0] : rowAttr[0];
      const charCode = isData ? (ram[ofs] & 0x7f) : 0x20;
      const doubleWidth = attr.doubleWidth && col + 1 < displayCols;

      cells.push({
        col,
        ofs,
        charCode,
        attr,
        cursor: ofs === opt.curs,
        doubleWidth,
      });

      if (doubleWidth) {
        col += 1;
      }
    }

    rows.push({ row, fontIndex, cells });
  }

  return {
    invertedScreen: opt.invertedScreen,
    cursorBlinking: opt.cursBlinking,
    rows,
  };
}
