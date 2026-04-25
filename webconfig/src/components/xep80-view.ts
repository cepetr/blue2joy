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

import { MobxLitElement } from "@adobe/lit-mobx";
import { html } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { btj } from "../models/btj-model.js";
import { Btj } from "../services/btj-messages.js";
import type { WorkerMessage } from "../workers/xep80-worker.js";

@customElement("xep80-view")
export class Xep80View extends MobxLitElement {
  protected override createRenderRoot() {
    return this;
  }

  @query("canvas")
  private canvasElement?: HTMLCanvasElement;

  @query(".xep80-canvas-wrap")
  private canvasWrap?: HTMLDivElement;

  @state()
  private worker: Worker | null = null;

  private resizeObserver?: ResizeObserver;

  private isXep80Active(): boolean {
    return btj.joyPort?.mode === Btj.JoyPortMode.UART;
  }

  private onEnableXep80 = async () => {
    await btj.setJoyPortMode(Btj.JoyPortMode.UART);
  };

  override connectedCallback() {
    super.connectedCallback();
    this.initWorker();
    window.addEventListener("resize", this.handleResize);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("resize", this.handleResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  private initWorker() {
    try {
      this.worker = new Worker(
        new URL("../workers/xep80-worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch (err) {
      console.error("Failed to start XEP80 worker:", err);
    }
  }

  override firstUpdated() {
    if (this.canvasElement && this.worker) {
      const offscreenCanvas = this.canvasElement.transferControlToOffscreen();
      const msg: WorkerMessage = {
        type: "init",
        canvas: offscreenCanvas,
      };
      this.worker.postMessage(msg, [offscreenCanvas]);
    }

    if (this.canvasWrap) {
      this.resizeObserver = new ResizeObserver(() => this.resizeCanvasToFit());
      this.resizeObserver.observe(this.canvasWrap);
    }

    this.resizeCanvasToFit();
  }

  private handleResize = () => {
    this.resizeCanvasToFit();
  };

  private resizeCanvasToFit() {
    if (!this.canvasElement || !this.canvasWrap) return;

    const baseWidth = 560;
    const baseHeight = 500;

    const availableWidth = this.canvasWrap.clientWidth;
    const wrapRect = this.canvasWrap.getBoundingClientRect();
    const availableHeight = Math.max(0, window.innerHeight - wrapRect.top - 16);

    if (availableWidth <= 0 || availableHeight <= 0) return;

    const scale = Math.min(
      availableWidth / baseWidth,
      availableHeight / baseHeight,
    );
    const renderWidth = Math.floor(baseWidth * scale);
    const renderHeight = Math.floor(baseHeight * scale);

    this.canvasElement.style.width = `${renderWidth}px`;
    this.canvasElement.style.height = `${renderHeight}px`;
  }

  public renderFramebuffer(state: Uint8Array) {
    if (this.worker && state.length > 0) {
      const msg: WorkerMessage = {
        type: "render",
        state: state.slice(),
      };
      this.worker.postMessage(msg);
    }
  }

  override render() {
    const isXep80Enabled = this.isXep80Active();

    return html`
      <style>
        .xep80-view {
          overflow: hidden;
        }

        .xep80-canvas-wrap {
          width: 100%;
          overflow: hidden;
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }

        .xep80-canvas {
          display: block;
          image-rendering: pixelated;
        }
      </style>
      <div class="col-12 xep80-view">
        ${!isXep80Enabled
          ? html`
              <div class="alert alert-info mt-3">
                <p class="mb-3">
                  Joystick port is currently not in XEP80 mode. Press the button
                  to activate XEP80 emulation.
                </p>
                <button
                  type="button"
                  class="btn btn-primary"
                  @click=${this.onEnableXep80}
                >
                  Activate XEP80
                </button>
              </div>
            `
          : ""}
        <div class="mt-3 xep80-canvas-wrap">
          <canvas width="560" height="250" class="xep80-canvas"></canvas>
        </div>
      </div>
    `;
  }
}

// Add to global HTMLElementTagNameMap
declare global {
  interface HTMLElementTagNameMap {
    "xep80-view": Xep80View;
  }
}
