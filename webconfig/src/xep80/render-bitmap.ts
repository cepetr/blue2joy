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

import { getXep80Charset } from "./charset.js";
import { decodeXep80Frame } from "./frame.js";
import {
  XEP80_DISPLAY_CHAR_HEIGHT,
  XEP80_DISPLAY_CHAR_WIDTH,
  XEP80_DISPLAY_COLS,
  XEP80_DISPLAY_ROWS,
  XEP80_FONT_CHAR_HEIGHT,
  XEP80_FONT_CHAR_WIDTH,
  XEP80_FONT_COLS,
} from "./geometry.js";
import {
  XEP80_CURSOR_COLOR,
} from "./palette.js";

type FontMaskCacheEntry = {
  byColor: Map<string, OffscreenCanvas>;
};

type CharAttr = {
  inverted: boolean;
  doubleWidth: boolean;
  doubleHeight: boolean;
  bottomHalf?: boolean;
  font: CanvasImageSource;
  color: string;
};

const fontMaskCache = new WeakMap<ImageBitmap, FontMaskCacheEntry>();

function createFontMask(font: ImageBitmap, color: string): OffscreenCanvas {
  const maskCanvas = new OffscreenCanvas(font.width, font.height);
  const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });

  if (!maskContext) {
    return maskCanvas;
  }

  maskContext.drawImage(font, 0, 0);

  const imageData = maskContext.getImageData(0, 0, font.width, font.height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const sourceAlpha = data[index + 3];
    const luminance = Math.max(data[index], data[index + 1], data[index + 2]);
    const alpha = Math.round((sourceAlpha * luminance) / 255);

    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = alpha;
  }

  maskContext.putImageData(imageData, 0, 0);
  maskContext.globalCompositeOperation = "source-in";
  maskContext.fillStyle = color;
  maskContext.fillRect(0, 0, font.width, font.height);

  return maskCanvas;
}

function getFontMask(font: ImageBitmap, color: string): OffscreenCanvas {
  const cachedMask = fontMaskCache.get(font);

  if (cachedMask?.byColor.has(color)) {
    return cachedMask.byColor.get(color)!;
  }

  const mask = createFontMask(font, color);
  const byColor = cachedMask?.byColor ?? new Map<string, OffscreenCanvas>();

  byColor.set(color, mask);

  if (!cachedMask) {
    fontMaskCache.set(font, { byColor });
  }

  return mask;
}

function drawCharacter(
  ctx: OffscreenCanvasRenderingContext2D,
  charCode: number,
  x: number,
  y: number,
  attr: CharAttr,
) {
  // Calculate source position in font bitmap
  const col = charCode % XEP80_FONT_COLS;
  const row = Math.floor(charCode / XEP80_FONT_COLS);

  const sx = col * XEP80_FONT_CHAR_WIDTH;
  let sy = row * XEP80_FONT_CHAR_HEIGHT;
  let sh = XEP80_DISPLAY_CHAR_HEIGHT;

  if (attr.doubleHeight) {
    sh = XEP80_DISPLAY_CHAR_HEIGHT / 2;
    if (attr.bottomHalf) {
      sy += XEP80_DISPLAY_CHAR_HEIGHT / 2;
    }
  }

  let w = XEP80_DISPLAY_CHAR_WIDTH;

  if (attr.doubleWidth) {
    w = XEP80_DISPLAY_CHAR_WIDTH * 2;
  }

  if (attr.inverted) {
    ctx.save();
    ctx.fillStyle = attr.color;
    ctx.fillRect(x, y, w, XEP80_DISPLAY_CHAR_HEIGHT);
    ctx.globalCompositeOperation = "destination-out";

    ctx.drawImage(
      attr.font,
      sx,
      sy,
      XEP80_DISPLAY_CHAR_WIDTH,
      sh,
      x,
      y,
      w,
      XEP80_DISPLAY_CHAR_HEIGHT,
    );

    ctx.restore();
    return;
  }

  ctx.drawImage(
    attr.font,
    sx,
    sy,
    XEP80_DISPLAY_CHAR_WIDTH,
    sh, // source rect
    x,
    y,
    w,
    XEP80_DISPLAY_CHAR_HEIGHT,
  );
}

function drawCursor(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
) {
  ctx.save();
  ctx.fillStyle = XEP80_CURSOR_COLOR;
  ctx.globalCompositeOperation = "difference";
  ctx.fillRect(x, y, XEP80_DISPLAY_CHAR_WIDTH, XEP80_DISPLAY_CHAR_HEIGHT);
  ctx.restore();
}

export function renderXep80Bitmap(
  state: Uint8Array,
  ctx: OffscreenCanvasRenderingContext2D,
  renderColor: string,
): void {
  const frame = decodeXep80Frame(state, XEP80_DISPLAY_ROWS, XEP80_DISPLAY_COLS);

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (const frameRow of frame.rows) {
    const charset = getXep80Charset(frameRow.fontIndex);
    const font = charset?.font ?? null;

    if (!font) {
      continue;
    }

    const maskFont = getFontMask(font, renderColor);

    for (const cell of frameRow.cells) {
      const x = cell.col * XEP80_DISPLAY_CHAR_WIDTH;
      const y = frameRow.row * XEP80_DISPLAY_CHAR_HEIGHT;
      const useInvertedSource = cell.attr.inverted !== frame.invertedScreen;

      const charAttr: CharAttr = {
        font: maskFont,
        color: renderColor,
        inverted: useInvertedSource,
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
}
