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
import {
  deriveXep80Palette,
  type Xep80Palette,
} from "../workers/xep80-palette.js";
import {
  renderXep80Text,
  XEP80_DISPLAY_COLS,
  XEP80_DISPLAY_ROWS,
  type WorkerMessage,
} from "../workers/xep80-worker.js";

type Xep80RenderMode = "bitmap" | "text";

type Xep80ColorId = "green" | "amber" | "white";

type Xep80ColorOption = {
  id: Xep80ColorId;
  label: string;
  tint: string;
};

type ViewportSize = {
  width: number;
  height: number;
};

type ElementBoxInsets = {
  horizontalPadding: number;
  verticalPadding: number;
  horizontalBorders: number;
  verticalBorders: number;
};

@customElement("xep80-view")
export class Xep80View extends MobxLitElement {
  private static readonly renderModeStorageKey = "xep80-render-mode";

  private static readonly colorIdStorageKey = "xep80-color-id";

  private static readonly colorOptions: Xep80ColorOption[] = [
    {
      id: "green",
      label: "Green",
      tint: "#8ef0a7",
    },
    {
      id: "amber",
      label: "Amber",
      tint: "#ffbf47",
    },
    {
      id: "white",
      label: "White",
      tint: "#ffffff",
    },
  ];

  private static readonly textBaseFontSizePx = 16;

  private static readonly textLineHeight = 1.25;

  private static readonly bitmapPixelAspectHeight = 2;

  private static readonly surfaceTopSpacingPx = 16;

  private static readonly surfaceBottomSpacingPx = 8;

  private static readonly contentFitSafetyPx = 4;

  private static readonly toolboxHideDelayMs = 1800;

  protected override createRenderRoot() {
    return this;
  }

  @query("canvas")
  private canvasElement?: HTMLCanvasElement;

  @query(".xep80-surface-wrap--bitmap")
  private canvasWrap?: HTMLDivElement;

  @query(".xep80-surface--bitmap")
  private bitmapSurface?: HTMLDivElement;

  @query(".xep80-surface-wrap--text")
  private textWrap?: HTMLDivElement;

  @query(".xep80-surface--text")
  private textSurface?: HTMLDivElement;

  @query(".xep80-text-screen")
  private textScreenElement?: HTMLPreElement;

  @query(".xep80-view")
  private viewElement?: HTMLDivElement;

  @state()
  private worker: Worker | null = null;

  @state()
  private renderMode: Xep80RenderMode = this.loadRenderMode();

  @state()
  private textScreen = Array.from(
    { length: XEP80_DISPLAY_ROWS },
    () => " ".repeat(XEP80_DISPLAY_COLS),
  ).join("\n");

  @state()
  private isToolboxVisible = false;

  @state()
  private colorId: Xep80ColorId = this.loadColorId();

  private resizeObserver?: ResizeObserver;

  private toolboxHideTimer?: number;

  private lastFramebufferState = new Uint8Array(0);

  private isXep80Active(): boolean {
    return btj.joyPort?.mode === Btj.JoyPortMode.UART;
  }

  private onEnableXep80 = async () => {
    await btj.setJoyPortMode(Btj.JoyPortMode.UART);
  };

  private onRenderModeChange = (mode: Xep80RenderMode) => {
    this.renderMode = mode;
    localStorage.setItem(Xep80View.renderModeStorageKey, mode);
    this.showToolbox();
    this.updateComplete.then(() => this.resizeActiveView());
  };

  private loadRenderMode(): Xep80RenderMode {
    const stored = localStorage.getItem(Xep80View.renderModeStorageKey);
    return stored === "text" ? "text" : "bitmap";
  }

  private getCurrentColorOption() {
    return Xep80View.colorOptions.find(({ id }) => id === this.colorId)
      ?? Xep80View.colorOptions[0];
  }

  private getCurrentPalette(): Xep80Palette {
    return deriveXep80Palette(this.getCurrentColorOption().tint);
  }

  private onCycleColor = () => {
    const currentIndex = Xep80View.colorOptions.findIndex(
      ({ id }) => id === this.colorId,
    );
    const nextIndex = (currentIndex + 1) % Xep80View.colorOptions.length;
    this.colorId = Xep80View.colorOptions[nextIndex].id;
    localStorage.setItem(Xep80View.colorIdStorageKey, this.colorId);
    this.showToolbox();

    if (this.worker && this.lastFramebufferState.length > 0) {
      const msg: WorkerMessage = {
        type: "render",
        state: this.lastFramebufferState.slice(),
        tint: this.getCurrentColorOption().tint,
      };
      this.worker.postMessage(msg);
    }
  };

  private loadColorId(): Xep80ColorId {
    const stored = localStorage.getItem(Xep80View.colorIdStorageKey);
    return Xep80View.colorOptions.some(({ id }) => id === stored)
      ? (stored as Xep80ColorId)
      : "green";
  }

  private isViewFullscreen() {
    return document.fullscreenElement === this.viewElement;
  }

  private onToggleFullscreen = async () => {
    const viewElement = this.viewElement;

    if (!viewElement) {
      return;
    }

    try {
      if (this.isViewFullscreen()) {
        await document.exitFullscreen();
      } else {
        await viewElement.requestFullscreen();
      }
      this.showToolbox(false);
    } catch (error) {
      console.error("Failed to toggle XEP80 fullscreen mode:", error);
    }
  };

  private showToolbox(scheduleHide = true) {
    this.isToolboxVisible = true;

    if (scheduleHide) {
      this.scheduleToolboxHide();
    } else {
      this.clearToolboxHideTimer();
    }
  }

  private hideToolbox = () => {
    this.clearToolboxHideTimer();
    this.isToolboxVisible = false;
  };

  private clearToolboxHideTimer() {
    if (this.toolboxHideTimer !== undefined) {
      window.clearTimeout(this.toolboxHideTimer);
      this.toolboxHideTimer = undefined;
    }
  }

  private scheduleToolboxHide() {
    this.clearToolboxHideTimer();
    this.toolboxHideTimer = window.setTimeout(() => {
      this.isToolboxVisible = false;
      this.toolboxHideTimer = undefined;
    }, Xep80View.toolboxHideDelayMs);
  }

  private onDisplayPointerEnter = () => {
    this.showToolbox();
  };

  private onDisplayPointerMove = () => {
    this.showToolbox();
  };

  private onDisplayPointerLeave = () => {
    this.hideToolbox();
  };

  private onDisplayTouchStart = () => {
    this.showToolbox();
  };

  private onToolboxFocusIn = () => {
    this.showToolbox(false);
  };

  private onToolboxFocusOut = () => {
    this.scheduleToolboxHide();
  };

  private onFullscreenChange = () => {
    this.requestUpdate();
    this.resizeActiveView();

    if (this.isViewFullscreen()) {
      this.showToolbox(false);
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    this.initWorker();
    window.addEventListener("resize", this.handleResize);
    document.addEventListener("fullscreenchange", this.onFullscreenChange);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
    this.clearToolboxHideTimer();
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
        tint: this.getCurrentColorOption().tint,
      };
      this.worker.postMessage(msg, [offscreenCanvas]);
    }

    if (this.canvasWrap) {
      this.resizeObserver = new ResizeObserver(() => this.resizeActiveView());
      this.resizeObserver.observe(this.canvasWrap);
    }

    if (this.textWrap) {
      this.resizeObserver ??= new ResizeObserver(() => this.resizeActiveView());
      this.resizeObserver.observe(this.textWrap);
    }

    this.resizeActiveView();

    if (btj.xep80State.length > 0) {
      this.renderFramebuffer(btj.xep80State);
    }
  }

  private handleResize = () => {
    this.resizeActiveView();
  };

  private resizeActiveView() {
    this.resizeCanvasToFit();
    this.resizeTextToFit();
  }

  private getAvailableViewportSize(container: HTMLElement): ViewportSize | null {
    const computed = window.getComputedStyle(container);
    const horizontalPadding =
      parseFloat(computed.paddingLeft) + parseFloat(computed.paddingRight);
    const verticalPadding =
      parseFloat(computed.paddingTop) + parseFloat(computed.paddingBottom);
    const availableWidth = Math.max(0, container.clientWidth - horizontalPadding);
    const wrapRect = container.getBoundingClientRect();
    const viewportBottomGap = this.isViewFullscreen() ? 0 : 16;
    const outerHeight = Math.max(0, window.innerHeight - wrapRect.top - viewportBottomGap);
    const availableHeight = Math.max(0, outerHeight - verticalPadding);

    if (availableWidth <= 0 || availableHeight <= 0) {
      return null;
    }

    return {
      width: availableWidth,
      height: availableHeight,
    };
  }

  private setWrapHeight(container: HTMLElement, availableHeight: number) {
    const computed = window.getComputedStyle(container);
    const verticalPadding =
      parseFloat(computed.paddingTop) + parseFloat(computed.paddingBottom);
    container.style.height = `${availableHeight + verticalPadding}px`;
  }

  private fitSizeWithinViewport(
    available: ViewportSize,
    content: ViewportSize,
  ): ViewportSize {
    const scale = Math.min(
      available.width / content.width,
      available.height / content.height,
    );

    return {
      width: Math.floor(content.width * scale),
      height: Math.floor(content.height * scale),
    };
  }

  private getElementBoxInsets(element: HTMLElement): ElementBoxInsets {
    const computed = window.getComputedStyle(element);

    return {
      horizontalPadding:
        parseFloat(computed.paddingLeft) + parseFloat(computed.paddingRight),
      verticalPadding:
        parseFloat(computed.paddingTop) + parseFloat(computed.paddingBottom),
      horizontalBorders:
        parseFloat(computed.borderLeftWidth) +
        parseFloat(computed.borderRightWidth),
      verticalBorders:
        parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth),
    };
  }

  private resizeCanvasToFit() {
    if (!this.canvasElement || !this.canvasWrap || !this.bitmapSurface) return;

    const baseWidth = this.canvasElement.width;
    const baseHeight =
      this.canvasElement.height * Xep80View.bitmapPixelAspectHeight;
    const availableSize = this.getAvailableViewportSize(this.canvasWrap);

    if (!availableSize) return;

    const {
      horizontalPadding,
      verticalPadding,
      horizontalBorders,
      verticalBorders,
    } = this.getElementBoxInsets(this.bitmapSurface);

    const contentWidth = Math.max(
      0,
      availableSize.width -
      horizontalPadding -
      horizontalBorders -
      Xep80View.contentFitSafetyPx,
    );
    const contentHeight = Math.max(
      0,
      availableSize.height -
      verticalPadding -
      verticalBorders -
      Xep80View.contentFitSafetyPx,
    );

    if (contentWidth <= 0 || contentHeight <= 0) return;

    this.setWrapHeight(this.canvasWrap, availableSize.height);

    const renderSize = this.fitSizeWithinViewport({
      width: contentWidth,
      height: contentHeight,
    }, {
      width: baseWidth,
      height: baseHeight,
    });

    this.canvasElement.style.width = `${renderSize.width}px`;
    this.canvasElement.style.height = `${renderSize.height}px`;
  }

  private resizeTextToFit() {
    if (!this.textWrap || !this.textSurface || !this.textScreenElement) return;

    const availableSize = this.getAvailableViewportSize(this.textWrap);

    if (!availableSize) return;

    const {
      horizontalPadding,
      verticalPadding,
      horizontalBorders,
      verticalBorders,
    } = this.getElementBoxInsets(this.textSurface);

    const computed = window.getComputedStyle(this.textScreenElement);

    const contentWidth = Math.max(
      0,
      availableSize.width -
      horizontalPadding -
      horizontalBorders -
      Xep80View.contentFitSafetyPx,
    );
    const contentHeight = Math.max(
      0,
      availableSize.height -
      verticalPadding -
      verticalBorders -
      Xep80View.contentFitSafetyPx,
    );

    if (contentWidth <= 0 || contentHeight <= 0) return;

    this.setWrapHeight(this.textWrap, availableSize.height);

    const measurementCanvas = document.createElement("canvas");
    const measurementContext = measurementCanvas.getContext("2d");

    if (!measurementContext) return;

    const baseFontSize = Xep80View.textBaseFontSizePx;
    measurementContext.font = `${baseFontSize}px ${computed.fontFamily}`;

    const sample = "0".repeat(XEP80_DISPLAY_COLS);
    const charWidth = measurementContext.measureText(sample).width / sample.length;
    const lineHeight = baseFontSize * Xep80View.textLineHeight;

    if (charWidth <= 0 || lineHeight <= 0) return;

    const contentSize = this.fitSizeWithinViewport(
      {
        width: contentWidth,
        height: contentHeight,
      },
      {
        width: XEP80_DISPLAY_COLS * charWidth,
        height: XEP80_DISPLAY_ROWS * lineHeight,
      },
    );
    const scale = contentSize.width / (XEP80_DISPLAY_COLS * charWidth);
    const fontSize = Math.max(8, Math.floor(baseFontSize * scale * 100) / 100);
    const renderWidth = Math.floor(
      XEP80_DISPLAY_COLS * charWidth * (fontSize / baseFontSize),
    );
    const renderHeight = Math.floor(
      XEP80_DISPLAY_ROWS * lineHeight * (fontSize / baseFontSize),
    );

    this.textScreenElement.style.fontSize = `${fontSize}px`;
    this.textScreenElement.style.width = `${renderWidth}px`;
    this.textScreenElement.style.height = `${renderHeight}px`;
  }

  public renderFramebuffer(state: Uint8Array) {
    if (state.length > 0) {
      this.lastFramebufferState = state.slice();
      this.textScreen = renderXep80Text(state);
    }

    if (this.worker && state.length > 0) {
      const msg: WorkerMessage = {
        type: "render",
        state: this.lastFramebufferState.slice(),
        tint: this.getCurrentColorOption().tint,
      };
      this.worker.postMessage(msg);
    }
  }

  private renderToolbox() {
    const currentColor = this.getCurrentColorOption();
    const currentColorIndex = Xep80View.colorOptions.findIndex(
      ({ id }) => id === currentColor.id,
    );
    const isFullscreen = this.isViewFullscreen();
    const nextColor =
      Xep80View.colorOptions[
      (currentColorIndex + 1) % Xep80View.colorOptions.length
      ];
    const items: Array<{ mode: Xep80RenderMode; label: string }> = [
      { mode: "bitmap", label: "Original" },
      { mode: "text", label: "Modern" },
    ];

    return html`
      <div
        class="xep80-toolbox ${this.isToolboxVisible
        ? "xep80-toolbox--visible"
        : ""}"
        @focusin=${this.onToolboxFocusIn}
        @focusout=${this.onToolboxFocusOut}
      >
        <div
          class="btn-group xep80-toolbox-group"
          role="group"
          aria-label="XEP80 toolbox"
        >
          ${items.map(
          ({ mode, label }) => html`
              <button
                type="button"
                class="btn btn-outline-secondary ${this.renderMode === mode
              ? "active"
              : ""}"
                aria-pressed=${this.renderMode === mode}
                @click=${() => this.onRenderModeChange(mode)}
              >
                ${label}
              </button>
            `,
        )}
          <button
            type="button"
            class="btn btn-outline-secondary"
            @click=${this.onCycleColor}
          >
            ${nextColor.label}
          </button>
          <button
            type="button"
            class="btn btn-outline-secondary"
            @click=${this.onToggleFullscreen}
          >
            ${isFullscreen ? "Windowed" : "Full Screen"}
          </button>
        </div>
      </div>
    `;
  }

  private renderActivationPrompt() {
    return html`
      <div class="xep80-activation-prompt">
        <div class="xep80-activation-card">
          <p class="mb-3">
            Joystick port is currently not in XEP80 mode. Press the button to
            activate XEP80 emulation.
          </p>
          <button
            type="button"
            class="btn btn-primary"
            @click=${this.onEnableXep80}
          >
            Activate XEP80
          </button>
        </div>
      </div>
    `;
  }

  private renderDisplaySurface(mode: Xep80RenderMode) {
    const isBitmap = mode === "bitmap";
    const isXep80Enabled = this.isXep80Active();

    return html`
      <div
        class="xep80-surface-wrap xep80-surface-wrap--${mode}"
        ?hidden=${this.renderMode !== mode}
        @mouseenter=${this.onDisplayPointerEnter}
        @mousemove=${this.onDisplayPointerMove}
        @mouseleave=${this.onDisplayPointerLeave}
        @touchstart=${this.onDisplayTouchStart}
      >
        ${isBitmap
        ? html`
              <div class="xep80-surface xep80-surface--bitmap">
                <canvas width="560" height="250" class="xep80-canvas"></canvas>
              </div>
            `
        : html`
              <div class="xep80-surface xep80-surface--text">
                <pre class="xep80-text-screen">${this.textScreen}</pre>
              </div>
            `}
        ${!isXep80Enabled ? this.renderActivationPrompt() : null}
        ${this.renderToolbox()}
      </div>
    `;
  }

  override render() {
    const palette = this.getCurrentPalette();

    return html`
      <style>
        .xep80-view {
          --xep80-display-color: ${palette.display};
          --xep80-surface-background: ${palette.surface};
          --xep80-border-color: ${palette.border};
          --xep80-glow-color: ${palette.glow};
          overflow: hidden;
        }

        .xep80-view:fullscreen {
          display: flex;
          align-items: stretch;
          justify-content: center;
          width: 100%;
          height: 100%;
          padding: 0;
          background: #02040a;
        }

        .xep80-view:fullscreen .xep80-surface-wrap {
          flex: 1 1 auto;
          margin-top: 0;
          padding: 1.5rem 1.5rem ${Xep80View.surfaceBottomSpacingPx}px;
          align-items: center;
        }

        .xep80-surface-wrap {
          position: relative;
          width: 100%;
          margin-top: ${Xep80View.surfaceTopSpacingPx}px;
          padding-bottom: ${Xep80View.surfaceBottomSpacingPx}px;
          overflow: hidden;
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }

        .xep80-surface {
          position: relative;
          box-sizing: border-box;
          padding: 0.75rem;
          background: var(--xep80-surface-background);
          border: 1px solid var(--xep80-border-color);
          border-radius: 0.75rem;
          box-shadow:
            inset 0 0 0.9rem var(--xep80-glow-color),
            inset 0 1px 0 rgba(255, 255, 255, 0.05),
            0 0 1.4rem color-mix(in srgb, var(--xep80-glow-color) 55%, transparent);
          overflow: hidden;
        }

        .xep80-surface::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--xep80-glow-color) 22%, transparent),
            transparent 22%
          );
          mix-blend-mode: screen;
          opacity: 0.75;
        }

        .xep80-canvas {
          position: relative;
          z-index: 1;
          display: block;
          image-rendering: pixelated;
        }

        .xep80-toolbox {
          position: absolute;
          left: 50%;
          bottom: calc(${Xep80View.surfaceBottomSpacingPx}px + 0.5rem);
          transform: translate(-50%, 0.5rem);
          opacity: 0;
          pointer-events: none;
          transition: opacity 150ms ease, transform 150ms ease;
          z-index: 1;
        }

        .xep80-toolbox--visible {
          opacity: 1;
          pointer-events: auto;
          transform: translate(-50%, 0);
        }

        .xep80-toolbox-group {
          padding: 0.25rem;
          border: 1px solid rgba(255, 255, 255, 0.78);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
        }

        .xep80-toolbox .btn {
          color: #1a2033;
          border-color: rgba(60, 80, 140, 0.28);
          background: transparent;
          border-radius: 999px;
        }

        .xep80-toolbox .btn:hover,
        .xep80-toolbox .btn:focus-visible {
          color: #1a2033;
          border-color: rgba(60, 80, 140, 0.42);
          background: rgba(37, 99, 235, 0.08);
        }

        .xep80-toolbox .btn.active,
        .xep80-toolbox .btn:active {
          color: #ffffff;
          border-color: #2563eb;
          background: #2563eb;
        }

        .xep80-activation-prompt {
          position: absolute;
          inset: ${Xep80View.surfaceTopSpacingPx}px 0 ${Xep80View.surfaceBottomSpacingPx}px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          z-index: 2;
          pointer-events: none;
        }

        .xep80-activation-card {
          max-width: 28rem;
          padding: 1.25rem 1.5rem;
          text-align: center;
          color: var(--bs-body-color);
          background: rgba(255, 255, 255, 0.94);
          border: 1px solid rgba(60, 80, 140, 0.15);
          border-radius: 0.9rem;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
          pointer-events: auto;
        }

        .xep80-text-screen {
          position: relative;
          z-index: 1;
          margin: 0;
          overflow: hidden;
          color: var(--xep80-display-color);
          font-family: ui-monospace, monospace;
          font-size: 1rem;
          line-height: ${Xep80View.textLineHeight};
          white-space: pre;
          tab-size: 1;
          font-variant-ligatures: none;
          text-shadow:
            0 0 0.35rem var(--xep80-glow-color),
            0 0 0.85rem color-mix(in srgb, var(--xep80-glow-color) 70%, transparent);
        }
      </style>
      <div class="col-12 xep80-view">
        ${this.renderDisplaySurface("bitmap")}
        ${this.renderDisplaySurface("text")}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "xep80-view": Xep80View;
  }
}
