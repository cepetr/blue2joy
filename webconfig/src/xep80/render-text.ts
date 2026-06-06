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

import { type Xep80CellAttr } from "./attributes.js";
import { mapXep80Char } from "./charset.js";
import { decodeXep80Frame } from "./frame.js";
import {
  XEP80_DISPLAY_COLS,
  XEP80_DISPLAY_ROWS,
} from "./geometry.js";

export type Xep80TextCell = {
  text: string;
  inverted: boolean;
  underline: boolean;
  doubleWidth: boolean;
  cursor: boolean;
};

export type Xep80TextRow = Xep80TextCell[];
export { XEP80_DISPLAY_COLS, XEP80_DISPLAY_ROWS };

export function createBlankXep80TextScreen(): Xep80TextRow[] {
  return Array.from({ length: XEP80_DISPLAY_ROWS }, () =>
    Array.from({ length: XEP80_DISPLAY_COLS }, () => ({
      text: " ",
      inverted: false,
      underline: false,
      doubleWidth: false,
      cursor: false,
    }))
  );
}

function createTextCell(
  text: string,
  attr: Xep80CellAttr,
  invertedScreen: boolean,
  cursor = false,
): Xep80TextCell {
  return {
    text,
    inverted: attr.inverted !== invertedScreen,
    underline: attr.underline,
    doubleWidth: attr.doubleWidth,
    cursor,
  };
}

export function renderXep80Text(state: Uint8Array): Xep80TextRow[] {
  const frame = decodeXep80Frame(state, XEP80_DISPLAY_ROWS, XEP80_DISPLAY_COLS);
  const lines: Xep80TextRow[] = [];

  for (const frameRow of frame.rows) {
    const line: Xep80TextRow = [];
    for (const cell of frameRow.cells) {
      const text = cell.attr.blank ? " " : mapXep80Char(frameRow.fontIndex, cell.charCode);

      line.push({
        ...createTextCell(text, cell.attr, frame.invertedScreen, cell.cursor),
        doubleWidth: cell.doubleWidth,
      });
    }

    lines.push(line);
  }

  return lines;
}
