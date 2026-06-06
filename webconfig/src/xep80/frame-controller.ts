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

  startWorker() {
    try {
      this.worker = new Worker(
        new URL("./worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch (err) {
      console.error("Failed to start XEP80 worker:", err);
    }
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

    const msg: WorkerMessage = {
      type: "render",
      state: this.lastFrameState.slice(),
      tint,
    };
    this.worker.postMessage(msg);
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
      const msg: WorkerMessage = {
        type: "render",
        state: this.lastFrameState.slice(),
        tint,
      };
      this.worker.postMessage(msg);
    }

    return createBlankXep80TextScreen();
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.workerCanvasInitialized = false;
    this.lastFrameState = new Uint8Array(0);
  }
}
