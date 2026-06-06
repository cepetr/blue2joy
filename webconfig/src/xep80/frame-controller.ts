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

import { createBlankXep80TextScreen } from "./render-text.js";
import type { WorkerMessage } from "./worker-protocol.js";
import { renderXep80Text, type Xep80TextRow } from "./worker.js";

export type Xep80FrameRenderMode = "bitmap" | "text";

export class Xep80FrameController {
  private worker: Worker | null = null;

  private workerCanvasInitialized = false;

  private lastFrameState = new Uint8Array(0);

  private workerRenderInFlight = false;

  private pendingBitmapRender: { state: Uint8Array; tint: string } | null = null;

  startWorker() {
    try {
      this.worker = new Worker(
        new URL("./worker.ts", import.meta.url),
        { type: "module" },
      );

      this.worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type !== "rendered") {
          return;
        }

        this.workerRenderInFlight = false;

        this.flushPendingBitmapRender();
      });
    } catch (err) {
      console.error("Failed to start XEP80 worker:", err);
    }
  }

  private replacePendingBitmapRender(state: Uint8Array, tint: string) {
    this.pendingBitmapRender = {
      state: state.slice(),
      tint,
    };

    this.flushPendingBitmapRender();
  }

  private flushPendingBitmapRender() {
    if (
      !this.worker
      || this.workerRenderInFlight
      || !this.pendingBitmapRender
    ) {
      return;
    }

    const msg: WorkerMessage = {
      type: "render",
      state: this.pendingBitmapRender.state,
      tint: this.pendingBitmapRender.tint,
    };

    this.pendingBitmapRender = null;
    this.workerRenderInFlight = true;
    this.worker.postMessage(msg);
  }

  initCanvas(canvas: HTMLCanvasElement | undefined, tint: string) {
    if (!canvas || !this.worker || this.workerCanvasInitialized) {
      return false;
    }

    const offscreenCanvas = canvas.transferControlToOffscreen();
    const msg: WorkerMessage = {
      type: "init",
      canvas: offscreenCanvas,
      tint,
    };
    this.worker.postMessage(msg, [offscreenCanvas]);
    this.workerCanvasInitialized = true;
    return true;
  }

  updateTint(tint: string) {
    if (!this.worker || this.lastFrameState.length === 0) {
      return;
    }

    this.replacePendingBitmapRender(this.lastFrameState, tint);
  }

  renderFrame(
    state: Uint8Array,
    synced: boolean,
    tint: string,
    mode: Xep80FrameRenderMode,
  ): Xep80TextRow[] {
    if (!synced || state.length === 0) {
      this.lastFrameState = new Uint8Array(0);
      return createBlankXep80TextScreen();
    }

    this.lastFrameState = state.slice();

    if (mode === "text") {
      return renderXep80Text(state);
    }

    if (this.worker) {
      this.replacePendingBitmapRender(this.lastFrameState, tint);
    }

    return createBlankXep80TextScreen();
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.workerCanvasInitialized = false;
    this.workerRenderInFlight = false;
    this.pendingBitmapRender = null;
    this.lastFrameState = new Uint8Array(0);
  }
}
