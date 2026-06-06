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
} from "./charset.js";
import {
  deriveXep80Palette,
  XEP80_DEFAULT_TINT,
} from "./palette.js";
import { renderXep80Bitmap } from "./render-bitmap.js";
export type {
  Xep80TextCell,
  Xep80TextRow
} from "./render-text";
export {
  renderXep80Text,
  XEP80_DISPLAY_COLS,
  XEP80_DISPLAY_ROWS
} from "./render-text.js";

export interface WorkerMessage {
  type: string;
  canvas?: OffscreenCanvas;
  state?: Uint8Array;
  tint?: string;
}

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let renderColor = XEP80_DEFAULT_TINT;

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
    renderXep80Bitmap(state, ctx, renderColor);
    self.postMessage({ type: "rendered" });
  }
};
