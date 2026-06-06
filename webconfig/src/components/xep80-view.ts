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
import { Xep80FrameController } from "../xep80/frame-controller.js";
import {
  computeContentSize,
  computeTextRenderMetrics,
  fitSizeWithinViewport,
  type ElementBoxInsets,
  type ViewportSize,
} from "../xep80/layout.js";
import {
  deriveXep80Palette,
  type Xep80Palette,
} from "../xep80/palette.js";
import { createBlankXep80TextScreen } from "../xep80/render-text.js";
import {
  XEP80_DISPLAY_COLS,
  XEP80_DISPLAY_ROWS,
  type Xep80TextRow,
} from "../xep80/worker.js";
import "./xep80-bitmap.js";
import "./xep80-prompts.js";
import "./xep80-text.js";
import "./xep80-toolbox.js";

type Xep80RenderMode = "bitmap" | "text";

type Xep80ColorId = "green" | "amber" | "white";

type Xep80ColorOption = {
  id: Xep80ColorId;
  label: string;
  tint: string;
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
  private textScreenElement?: HTMLDivElement;

  @query(".xep80-view")
  private viewElement?: HTMLDivElement;

  @state()
  private renderMode: Xep80RenderMode = this.loadRenderMode();

  @state()
  private textScreen: Xep80TextRow[] = createBlankXep80TextScreen();

  @state()
  private isToolboxVisible = false;

  @state()
  private colorId: Xep80ColorId = this.loadColorId();

  private resizeObserver?: ResizeObserver;

  private toolboxHideTimer?: number;

  private frameController = new Xep80FrameController();

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
    this.frameController.updateTint(this.getCurrentColorOption().tint);
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
    } catch (error) {
      console.error("Failed to toggle XEP80 fullscreen mode:", error);
    }
  };

  private shouldKeepToolboxVisibleForFocus(target: EventTarget | null) {
    return target instanceof HTMLElement && target.matches(":focus-visible");
  }

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

  private onToolboxFocusIn = (event: FocusEvent) => {
    this.showToolbox(!this.shouldKeepToolboxVisibleForFocus(event.target));
  };

  private onToolboxFocusOut = () => {
    this.scheduleToolboxHide();
  };

  private onToolboxModeChange = (event: Event) => {
    const detail = (event as CustomEvent<{ mode?: string }>).detail;

    if (detail.mode === "bitmap" || detail.mode === "text") {
      this.onRenderModeChange(detail.mode);
    }
  };

  private onToolboxCycleColor = () => {
    this.onCycleColor();
  };

  private onToolboxToggleFullscreen = () => {
    this.onToggleFullscreen();
  };

  private onFullscreenChange = () => {
    this.requestUpdate();
    this.resizeActiveView();

    if (this.isViewFullscreen()) {
      this.showToolbox(
        !this.shouldKeepToolboxVisibleForFocus(document.activeElement),
      );
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    this.frameController.startWorker();
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
    this.frameController.dispose();
  }

  private async initWorkerCanvasWhenReady() {
    const bitmapElement = this.querySelector("xep80-bitmap") as
      | (HTMLElement & { updateComplete?: Promise<unknown> })
      | null;

    if (bitmapElement?.updateComplete) {
      await bitmapElement.updateComplete;
    }

    if (!this.frameController.initCanvas(
      this.canvasElement,
      this.getCurrentColorOption().tint,
    )) {
      requestAnimationFrame(() => {
        this.frameController.initCanvas(
          this.canvasElement,
          this.getCurrentColorOption().tint,
        );
      });
    }
  }

  override firstUpdated() {
    void this.initWorkerCanvasWhenReady();

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
      this.renderFramebuffer(btj.xep80State, btj.xep80Synced);
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

    const contentSize = computeContentSize(
      availableSize,
      this.getElementBoxInsets(this.bitmapSurface),
      Xep80View.contentFitSafetyPx,
    );

    if (!contentSize) return;

    this.setWrapHeight(this.canvasWrap, availableSize.height);

    const renderSize = fitSizeWithinViewport(contentSize, {
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

    const computed = window.getComputedStyle(this.textScreenElement);

    const contentSize = computeContentSize(
      availableSize,
      this.getElementBoxInsets(this.textSurface),
      Xep80View.contentFitSafetyPx,
    );

    if (!contentSize) return;

    this.setWrapHeight(this.textWrap, availableSize.height);

    const measurementCanvas = document.createElement("canvas");
    const measurementContext = measurementCanvas.getContext("2d");

    if (!measurementContext) return;

    const baseFontSize = Xep80View.textBaseFontSizePx;
    measurementContext.font = `${baseFontSize}px ${computed.fontFamily}`;

    const sample = "0".repeat(XEP80_DISPLAY_COLS);
    const charWidth = measurementContext.measureText(sample).width / sample.length;
    const lineHeight = baseFontSize * Xep80View.textLineHeight;

    const renderMetrics = computeTextRenderMetrics(
      contentSize,
      XEP80_DISPLAY_COLS,
      XEP80_DISPLAY_ROWS,
      charWidth,
      lineHeight,
      baseFontSize,
      8,
    );

    if (!renderMetrics) return;

    this.textScreenElement.style.fontSize = `${renderMetrics.fontSize}px`;
    this.textScreenElement.style.width = `${renderMetrics.renderWidth}px`;
    this.textScreenElement.style.height = `${renderMetrics.renderHeight}px`;
  }

  public renderFramebuffer(state: Uint8Array, synced = btj.xep80Synced) {
    this.textScreen = this.frameController.renderFrame(
      state,
      synced,
      this.getCurrentColorOption().tint,
    );
  }

  private renderDisplaySurface(mode: Xep80RenderMode) {
    const isBitmap = mode === "bitmap";
    const isXep80Enabled = this.isXep80Active();
    const isXep80Synced = btj.xep80Synced;
    const isDisplaySuppressed = !isXep80Enabled || !isXep80Synced;
    const currentColor = this.getCurrentColorOption();
    const currentColorIndex = Xep80View.colorOptions.findIndex(
      ({ id }) => id === currentColor.id,
    );
    const nextColor =
      Xep80View.colorOptions[
      (currentColorIndex + 1) % Xep80View.colorOptions.length
      ];

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
              <xep80-bitmap .suppressed=${isDisplaySuppressed}></xep80-bitmap>
            `
        : html`
              <xep80-text
                .rows=${this.textScreen}
                .suppressed=${isDisplaySuppressed}
              ></xep80-text>
            `}
          <xep80-prompts
            .enabled=${isXep80Enabled}
            .synced=${isXep80Synced}
            @xep80-prompts-activate=${this.onEnableXep80}
          ></xep80-prompts>
        <xep80-toolbox
          .visible=${this.isToolboxVisible}
          .mode=${this.renderMode}
          .nextColorLabel=${nextColor.label}
          .fullscreen=${this.isViewFullscreen()}
          @focusin=${this.onToolboxFocusIn}
          @focusout=${this.onToolboxFocusOut}
          @xep80-toolbox-mode-change=${this.onToolboxModeChange}
          @xep80-toolbox-cycle-color=${this.onToolboxCycleColor}
          @xep80-toolbox-toggle-fullscreen=${this.onToolboxToggleFullscreen}
        ></xep80-toolbox>
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
          --xep80-surface-top-spacing: ${Xep80View.surfaceTopSpacingPx}px;
          --xep80-surface-bottom-spacing: ${Xep80View.surfaceBottomSpacingPx}px;
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

        .xep80-surface--inactive .xep80-canvas {
          visibility: hidden;
        }

        .xep80-canvas {
          position: relative;
          z-index: 1;
          display: block;
          image-rendering: pixelated;
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
