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
import { btj } from "../../models/btj-model.js";
import { Btj } from "../../services/btj-messages.js";
import { Xep80FrameController } from "../../xep80/frame-controller.js";
import {
  deriveXep80Palette,
  type Xep80Palette,
} from "../../xep80/palette.js";
import { createBlankXep80TextScreen } from "../../xep80/render-text.js";
import {
  resizeXep80BitmapSurface,
  resizeXep80TextSurface,
} from "../../xep80/view-resize.js";
import {
  type Xep80TextRow,
} from "../../xep80/worker.js";
import "./render-text.js";
import "./xep80-bitmap.js";
import "./xep80-prompts.js";
import { Xep80ToolboxVisibilityController } from "./xep80-toolbox-visibility.js";
import {
  xep80ColorOptions,
  xep80ToolboxConfig,
  xep80ToolboxConfigChangeEvent,
  type Xep80ColorId,
  type Xep80RenderMode,
} from "./xep80-toolbox.js";

@customElement("xep80-view")
export class Xep80View extends MobxLitElement {
  private static readonly textBaseFontSizePx = 16;

  private static readonly textLineHeight = 1.25;

  private static readonly bitmapPixelAspectHeight = 2;

  private static readonly surfaceTopSpacingPx = 16;

  private static readonly surfaceBottomSpacingPx = 8;

  private static readonly contentFitSafetyPx = 4;

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
  private renderMode: Xep80RenderMode = xep80ToolboxConfig.mode;

  @state()
  private textScreen: Xep80TextRow[] = createBlankXep80TextScreen();

  @state()
  private isToolboxVisible = false;

  @state()
  private colorId: Xep80ColorId = xep80ToolboxConfig.colorId;

  private resizeObserver?: ResizeObserver;

  private toolboxVisibilityController = new Xep80ToolboxVisibilityController(
    (visible) => { this.isToolboxVisible = visible; },
  );

  private frameController = new Xep80FrameController();

  private isXep80Active(): boolean {
    return btj.joyPort?.mode === Btj.JoyPortMode.UART;
  }

  private onEnableXep80 = async () => {
    await btj.setJoyPortMode(Btj.JoyPortMode.UART);
  };

  private getCurrentColorOption() {
    return xep80ColorOptions.find(({ id }) => id === this.colorId)
      ?? xep80ColorOptions[0];
  }

  private getCurrentPalette(): Xep80Palette {
    return deriveXep80Palette(this.getCurrentColorOption().tint);
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

  private onToolboxConfigChange = () => {
    const nextMode = xep80ToolboxConfig.mode;
    const nextColorId = xep80ToolboxConfig.colorId;
    const modeChanged = this.renderMode !== nextMode;
    const colorChanged = this.colorId !== nextColorId;

    this.renderMode = nextMode;
    this.colorId = nextColorId;

    if (modeChanged) {
      this.toolboxVisibilityController.onPointerMove();
      this.updateComplete.then(() => this.resizeActiveView());
    }

    if (colorChanged) {
      this.toolboxVisibilityController.onPointerMove();
      this.frameController.updateTint(this.getCurrentColorOption().tint);
    }
  };

  private onToolboxToggleFullscreen = () => {
    this.onToggleFullscreen();
  };

  private onFullscreenChange = () => {
    this.requestUpdate();
    this.resizeActiveView();

    if (this.isViewFullscreen()) {
      this.toolboxVisibilityController.onFullscreenEntered(document.activeElement);
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    this.frameController.startWorker();
    window.addEventListener("resize", this.handleResize);
    document.addEventListener("fullscreenchange", this.onFullscreenChange);
    xep80ToolboxConfig.addEventListener(
      xep80ToolboxConfigChangeEvent,
      this.onToolboxConfigChange,
    );
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
    xep80ToolboxConfig.removeEventListener(
      xep80ToolboxConfigChangeEvent,
      this.onToolboxConfigChange,
    );
    this.toolboxVisibilityController.dispose();
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
    const isFullscreen = this.isViewFullscreen();

    resizeXep80BitmapSurface({
      canvasElement: this.canvasElement,
      canvasWrap: this.canvasWrap,
      bitmapSurface: this.bitmapSurface,
      isFullscreen,
      contentFitSafetyPx: Xep80View.contentFitSafetyPx,
      bitmapPixelAspectHeight: Xep80View.bitmapPixelAspectHeight,
    });

    resizeXep80TextSurface({
      textWrap: this.textWrap,
      textSurface: this.textSurface,
      textScreenElement: this.textScreenElement,
      isFullscreen,
      contentFitSafetyPx: Xep80View.contentFitSafetyPx,
      textBaseFontSizePx: Xep80View.textBaseFontSizePx,
      textLineHeight: Xep80View.textLineHeight,
    });
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

    return html`
      <div
        class="xep80-surface-wrap xep80-surface-wrap--${mode}"
        ?hidden=${this.renderMode !== mode}
        @mouseenter=${this.toolboxVisibilityController.onPointerEnter}
        @mousemove=${this.toolboxVisibilityController.onPointerMove}
        @mouseleave=${this.toolboxVisibilityController.onPointerLeave}
        @touchstart=${this.toolboxVisibilityController.onTouchStart}
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
          .fullscreen=${this.isViewFullscreen()}
          @focusin=${this.toolboxVisibilityController.onFocusIn}
          @focusout=${this.toolboxVisibilityController.onFocusOut}
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
