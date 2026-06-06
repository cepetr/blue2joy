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

import {
  XEP80_RAM_SIZE,
  XEP80_STATE_SIZE
} from "./xep80-decode.js";

import {
  deriveXep80Palette,
  isNeutralTint,
  parseHexColor,
  XEP80_CURSOR_COLOR,
  XEP80_DEFAULT_TINT,
} from "./xep80-palette.js";

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

export interface WorkerMessage {
  type: string;
  canvas?: OffscreenCanvas;
  state?: Uint8Array;
  tint?: string;
}

type Xep80CellAttr = {
  inverted: boolean;
  blinking: boolean;
  doubleHeight: boolean;
  doubleWidth: boolean;
  underline: boolean;
  blank: boolean;
  graphics: boolean;
};

type Xep80RenderOptions = {
  curs: number;
  attr: [Xep80CellAttr, Xep80CellAttr];
  invertedScreen: boolean;
  rows: Uint8Array;
  colOfs: number;
};

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

function getRenderOptions(regs: Uint8Array): Xep80RenderOptions {
  return {
    curs: regs[Nsp405Reg.CURS] + regs[Nsp405Reg.CURS + 1] * 256,
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
    rows: regs.subarray(Nsp405Reg.ROW_PTR0, Nsp405Reg.ROW_PTR0 + DISP_ROWS),
    colOfs: regs[Nsp405Reg.XSCROLL],
  };
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
  const ram = state.subarray(0, XEP80_RAM_SIZE);
  const regs = state.subarray(XEP80_RAM_SIZE, XEP80_STATE_SIZE);
  const lines: Xep80TextRow[] = [];

  for (let row = 0; row < DISP_ROWS; row++) {
    const opt = getRenderOptions(regs);
    const rowOfs = (opt.rows[row] & 0x1f) * 256 + opt.colOfs;
    const fontIndex = (opt.rows[row] >> 5) & 0x03;
    const charset = getXep80Charset(fontIndex);
    const line: Xep80TextRow = [];

    if (charset?.externalFont) {
      // Normal and international fonts have the inverted attribute bit flipped 
      // compared to the internal font, so invert it back here for text rendering.
      opt.attr[1].inverted = !opt.attr[1].inverted;
    }

    for (let col = 0; col < DISP_COLS; col++) {
      const ofs = rowOfs + col;
      const cursor = ofs === opt.curs;

      let attr = opt.attr[0];
      let text = " ";

      if (ram[ofs] !== 0x9b) {
        attr = opt.attr[ram[ofs] & 0x80 ? 1 : 0];
        text = attr.blank ? " " : mapXep80Char(fontIndex, ram[ofs] & 0x7f);
      }

      const doubleWidth = attr.doubleWidth && col + 1 < DISP_COLS;

      line.push({
        ...createTextCell(text, attr, opt.invertedScreen, cursor),
        doubleWidth,
      });

      if (doubleWidth) {
        col += 1;
      }
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
  const ram = state.subarray(0, XEP80_RAM_SIZE);
  const regs = state.subarray(XEP80_RAM_SIZE, XEP80_STATE_SIZE);
  const opt = getRenderOptions(regs);

  // Each character in framebuffer is represented by one byte
  // Framebuffer size should be 80 * 24 = 1920 bytes
  // 7th bit of each byte is unused

  // Let the shared CSS surface provide the normal dark phosphor background.
  // Keep the inverted-screen case opaque so reverse-video still reads correctly.
  if (opt.invertedScreen) {
    ctx.fillStyle = renderColor;
    ctx.fillRect(0, 0, 560, 250);
  } else {
    ctx.clearRect(0, 0, 560, 250);
  }

  // Draw characters from framebuffer
  for (let row = 0; row < DISP_ROWS; row++) {
    const rowOfs = (opt.rows[row] & 0x1f) * 256 + opt.colOfs;
    const fontIndex = (opt.rows[row] >> 5) & 0x03;
    const charset = getXep80Charset(fontIndex);
    const font = charset?.font ?? null;

    if (!font) {
      continue;
    }

    let rowAttr: [Xep80CellAttr, Xep80CellAttr] = opt.attr;
    if (charset.externalFont) {
      // Normal and international fonts have the inverted attribute bit flipped 
      // compared to the internal font, so invert it back here for rendering.
      rowAttr = [opt.attr[0], { ...opt.attr[1], inverted: !opt.attr[1].inverted }];
    }

    for (let col = 0; col < DISP_COLS; col++) {
      const ofs = rowOfs + col;

      let attr;
      let char;

      if (ram[ofs] != 0x9b) {
        attr = rowAttr[ram[ofs] & 0x80 ? 1 : 0];
        char = ram[ofs] & 0x7f;
      } else {
        attr = rowAttr[0];
        char = 0x20;
      }

      const x = col * DISP_CHAR_WIDTH;
      const y = row * DISP_CHAR_HEIGHT;

      const charAttr: CharAttr = {
        font: font,
        inverted: attr.inverted != opt.invertedScreen,
        doubleWidth: attr.doubleWidth,
        doubleHeight: attr.doubleHeight,
        bottomHalf: attr.doubleHeight && attr.blank,
      };

      drawCharacter(ctx, char, x, y, charAttr);

      if (ofs === opt.curs) {
        drawCursor(ctx, x, y);
      }

      if (attr.doubleWidth) {
        col += 1;
      }
    }
  }

  if (opt.invertedScreen) {
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
