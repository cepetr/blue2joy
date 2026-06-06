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
  ensureXep80FontsLoaded,
  getXep80Charset,
  mapXep80Char,
} from "./xep80-charset.js";
import { decodeXep80Frame } from "./xep80-frame.js";
import {
  deriveXep80Palette,
  isNeutralTint,
  parseHexColor,
  XEP80_CURSOR_COLOR,
  XEP80_DEFAULT_TINT,
} from "./xep80-palette.js";
import {
  type Xep80CellAttr,
} from "./xep80-regs.js";

export interface WorkerMessage {
  type: string;
  canvas?: OffscreenCanvas;
  state?: Uint8Array;
  tint?: string;
}

export type Xep80TextCell = {
  text: string;
  inverted: boolean;
  underline: boolean;
  doubleWidth: boolean;
  cursor: boolean;
};

export type Xep80TextRow = Xep80TextCell[];

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let renderColor = XEP80_DEFAULT_TINT;

// Font bitmap: 128 characters in 16x8 matrix, each character 8x12 pixels
const FONT_CHAR_WIDTH = 8;
const FONT_CHAR_HEIGHT = 12;
const FONT_COLS = 16;

// Canvas: 560x250 pixels = 80x25 characters, each 7x10 pixels
const DISP_CHAR_WIDTH = 7;
const DISP_CHAR_HEIGHT = 10;
const DISP_COLS = 80;
const DISP_ROWS = 25;

export const XEP80_DISPLAY_COLS = DISP_COLS;
export const XEP80_DISPLAY_ROWS = DISP_ROWS;

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
  const frame = decodeXep80Frame(state, DISP_ROWS, DISP_COLS);
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

type CharAttr = {
  inverted: boolean;
  doubleWidth: boolean;
  doubleHeight: boolean;
  bottomHalf?: boolean;
  font: ImageBitmap;
};

function drawCharacter(
  ctx: OffscreenCanvasRenderingContext2D,
  charCode: number,
  x: number,
  y: number,
  attr: CharAttr,
) {
  // Calculate source position in font bitmap
  const col = charCode % FONT_COLS;
  const row = Math.floor(charCode / FONT_COLS);

  const sx = col * FONT_CHAR_WIDTH;
  let sy = row * FONT_CHAR_HEIGHT;
  let sh = DISP_CHAR_HEIGHT;

  if (attr.doubleHeight) {
    sh = DISP_CHAR_HEIGHT / 2;
    if (attr.bottomHalf) {
      sy += DISP_CHAR_HEIGHT / 2;
    }
  }

  let w = DISP_CHAR_WIDTH;

  if (attr.doubleWidth) {
    w = DISP_CHAR_WIDTH * 2;
  }

  // Draw character from font bitmap to canvas
  ctx.save();
  ctx.filter = attr.inverted ? "invert(1)" : "none";
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(
    attr.font,
    sx,
    sy,
    DISP_CHAR_WIDTH,
    sh, // source rect
    x,
    y,
    w,
    DISP_CHAR_HEIGHT, // dest rect
  );

  ctx.restore();
}

function drawCursor(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
) {
  ctx.save();
  ctx.fillStyle = XEP80_CURSOR_COLOR;
  ctx.globalCompositeOperation = "difference";
  ctx.fillRect(x, y, DISP_CHAR_WIDTH, DISP_CHAR_HEIGHT);
  ctx.restore();
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, canvas, state, tint } = event.data;

  if (tint) {
    const palette = deriveXep80Palette(tint);
    renderColor = palette.display;
  }

  if (type === "init" && canvas) {
    // Store canvas and context for reuse
    ctx = canvas.getContext("2d");
    await ensureXep80FontsLoaded();
  }

  if (ctx && state) {
    await ensureXep80FontsLoaded();
    renderFramebuffer(state, ctx);
  }
};

function renderFramebuffer(
  state: Uint8Array,
  ctx: OffscreenCanvasRenderingContext2D,
) {
  const frame = decodeXep80Frame(state, DISP_ROWS, DISP_COLS);

  // Each character in framebuffer is represented by one byte
  // Framebuffer size should be 80 * 24 = 1920 bytes
  // 7th bit of each byte is unused

  // Let the shared CSS surface provide the normal dark phosphor background.
  // Keep the inverted-screen case opaque so reverse-video still reads correctly.
  if (frame.invertedScreen) {
    ctx.fillStyle = renderColor;
    ctx.fillRect(0, 0, 560, 250);
  } else {
    ctx.clearRect(0, 0, 560, 250);
  }

  // Draw characters from framebuffer
  for (const frameRow of frame.rows) {
    const charset = getXep80Charset(frameRow.fontIndex);
    const font = charset?.font ?? null;

    if (!font) {
      continue;
    }

    for (const cell of frameRow.cells) {
      const x = cell.col * DISP_CHAR_WIDTH;
      const y = frameRow.row * DISP_CHAR_HEIGHT;

      const charAttr: CharAttr = {
        font,
        inverted: cell.attr.inverted != frame.invertedScreen,
        doubleWidth: cell.attr.doubleWidth,
        doubleHeight: cell.attr.doubleHeight,
        bottomHalf: cell.attr.doubleHeight && cell.attr.blank,
      };

      drawCharacter(ctx, cell.charCode, x, y, charAttr);

      if (cell.cursor) {
        drawCursor(ctx, x, y);
      }
    }
  }

  if (frame.invertedScreen) {
    applyColorTint(ctx, renderColor);
  } else {
    applyPhosphorMask(ctx, renderColor);
  }

  self.postMessage({ type: "rendered" });
}

function applyPhosphorMask(
  ctx: OffscreenCanvasRenderingContext2D,
  color: string,
) {
  const rgb = parseHexColor(color);

  if (!rgb) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, 560, 250);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const sourceAlpha = data[index + 3];

    if (sourceAlpha === 0) {
      continue;
    }

    const luminance = Math.max(data[index], data[index + 1], data[index + 2]);

    data[index] = rgb[0];
    data[index + 1] = rgb[1];
    data[index + 2] = rgb[2];
    data[index + 3] = Math.round((sourceAlpha * luminance) / 255);
  }

  ctx.putImageData(imageData, 0, 0);
}

function applyColorTint(
  ctx: OffscreenCanvasRenderingContext2D,
  color: string,
) {
  if (isNeutralTint(color)) {
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 560, 250);
  ctx.restore();
}
