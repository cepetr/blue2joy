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
  XEP80_CANVAS_HEIGHT,
  XEP80_CANVAS_WIDTH,
  XEP80_DISPLAY_CHAR_HEIGHT,
  XEP80_DISPLAY_CHAR_WIDTH,
  XEP80_DISPLAY_COLS,
  XEP80_DISPLAY_ROWS,
  XEP80_FONT_CHAR_HEIGHT,
  XEP80_FONT_CHAR_WIDTH,
  XEP80_FONT_COLS,
} from "./geometry.js";
import {
  isNeutralTint,
  parseHexColor,
  XEP80_CURSOR_COLOR,
} from "./palette.js";

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

  // Draw character from font bitmap to canvas
  ctx.save();
  ctx.filter = attr.inverted ? "invert(1)" : "none";
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(
    attr.font,
    sx,
    sy,
    XEP80_DISPLAY_CHAR_WIDTH,
    sh, // source rect
    x,
    y,
    w,
    XEP80_DISPLAY_CHAR_HEIGHT, // dest rect
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
  ctx.fillRect(x, y, XEP80_DISPLAY_CHAR_WIDTH, XEP80_DISPLAY_CHAR_HEIGHT);
  ctx.restore();
}

function applyPhosphorMask(
  ctx: OffscreenCanvasRenderingContext2D,
  color: string,
) {
  const rgb = parseHexColor(color);

  if (!rgb) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, XEP80_CANVAS_WIDTH, XEP80_CANVAS_HEIGHT);
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
  ctx.fillRect(0, 0, XEP80_CANVAS_WIDTH, XEP80_CANVAS_HEIGHT);
  ctx.restore();
}

export function renderXep80Bitmap(
  state: Uint8Array,
  ctx: OffscreenCanvasRenderingContext2D,
  renderColor: string,
): void {
  const frame = decodeXep80Frame(state, XEP80_DISPLAY_ROWS, XEP80_DISPLAY_COLS);

  // Let the shared CSS surface provide the normal dark phosphor background.
  // Keep the inverted-screen case opaque so reverse-video still reads correctly.
  if (frame.invertedScreen) {
    ctx.fillStyle = renderColor;
    ctx.fillRect(0, 0, XEP80_CANVAS_WIDTH, XEP80_CANVAS_HEIGHT);
  } else {
    ctx.clearRect(0, 0, XEP80_CANVAS_WIDTH, XEP80_CANVAS_HEIGHT);
  }

  for (const frameRow of frame.rows) {
    const charset = getXep80Charset(frameRow.fontIndex);
    const font = charset?.font ?? null;

    if (!font) {
      continue;
    }

    for (const cell of frameRow.cells) {
      const x = cell.col * XEP80_DISPLAY_CHAR_WIDTH;
      const y = frameRow.row * XEP80_DISPLAY_CHAR_HEIGHT;

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
}
