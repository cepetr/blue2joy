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

import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export type Xep80RenderMode = "bitmap" | "text";

export type Xep80ToolboxMode = Xep80RenderMode;

export type Xep80ColorId = "green" | "amber" | "white";

export type Xep80ColorOption = {
  id: Xep80ColorId;
  label: string;
  tint: string;
};

type ToolboxConfigChangeDetail = {
  mode: Xep80RenderMode;
  colorId: Xep80ColorId;
};

const toolboxConfigChangeEventName = "xep80-toolbox-config-change";

const renderModeStorageKey = "xep80-render-mode";

const colorIdStorageKey = "xep80-color-id";

export const xep80ColorOptions: Xep80ColorOption[] = [
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

export class Xep80ToolboxConfig extends EventTarget {
  private currentMode: Xep80RenderMode = this.loadRenderMode();

  private currentColorId: Xep80ColorId = this.loadColorId();

  get mode(): Xep80RenderMode {
    return this.currentMode;
  }

  get colorId(): Xep80ColorId {
    return this.currentColorId;
  }

  getCurrentColorOption(): Xep80ColorOption {
    return xep80ColorOptions.find(({ id }) => id === this.currentColorId)
      ?? xep80ColorOptions[0];
  }

  getNextColorOption(): Xep80ColorOption {
    const currentIndex = xep80ColorOptions.findIndex(
      ({ id }) => id === this.currentColorId,
    );
    const nextIndex = (currentIndex + 1) % xep80ColorOptions.length;

    return xep80ColorOptions[nextIndex];
  }

  setMode(mode: Xep80RenderMode): boolean {
    if (this.currentMode === mode) {
      return false;
    }

    this.currentMode = mode;
    localStorage.setItem(renderModeStorageKey, mode);
    this.dispatchChange();

    return true;
  }

  setColorId(colorId: Xep80ColorId): boolean {
    if (this.currentColorId === colorId) {
      return false;
    }

    this.currentColorId = colorId;
    localStorage.setItem(colorIdStorageKey, this.currentColorId);
    this.dispatchChange();

    return true;
  }

  cycleColor(): Xep80ColorId {
    this.currentColorId = this.getNextColorOption().id;
    localStorage.setItem(colorIdStorageKey, this.currentColorId);
    this.dispatchChange();

    return this.currentColorId;
  }

  private dispatchChange() {
    this.dispatchEvent(new CustomEvent<ToolboxConfigChangeDetail>(toolboxConfigChangeEventName, {
      detail: {
        mode: this.currentMode,
        colorId: this.currentColorId,
      },
    }));
  }

  private loadRenderMode(): Xep80RenderMode {
    const stored = localStorage.getItem(renderModeStorageKey);
    return stored === "text" ? "text" : "bitmap";
  }

  private loadColorId(): Xep80ColorId {
    const stored = localStorage.getItem(colorIdStorageKey);
    return xep80ColorOptions.some(({ id }) => id === stored)
      ? (stored as Xep80ColorId)
      : "green";
  }
}

export const xep80ToolboxConfig = new Xep80ToolboxConfig();

export const xep80ToolboxConfigChangeEvent = toolboxConfigChangeEventName;


@customElement("xep80-toolbox")
export class Xep80Toolbox extends LitElement {
  protected override createRenderRoot() {
    return this;
  }

  @property({ type: Boolean })
  visible = false;

  @property({ type: Boolean })
  fullscreen = false;

  @state()
  private mode: Xep80RenderMode = xep80ToolboxConfig.mode;

  @state()
  private colorId: Xep80ColorId = xep80ToolboxConfig.colorId;

  private onConfigChange = (event: Event) => {
    const detail = (event as CustomEvent<ToolboxConfigChangeDetail>).detail;
    this.mode = detail.mode;
    this.colorId = detail.colorId;
  };

  override connectedCallback() {
    super.connectedCallback();
    xep80ToolboxConfig.addEventListener(
      xep80ToolboxConfigChangeEvent,
      this.onConfigChange,
    );
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    xep80ToolboxConfig.removeEventListener(
      xep80ToolboxConfigChangeEvent,
      this.onConfigChange,
    );
  }

  private onModeClick = (mode: Xep80RenderMode) => {
    xep80ToolboxConfig.setMode(mode);
  };

  private onColorClick = (colorId: Xep80ColorId) => {
    xep80ToolboxConfig.setColorId(colorId);
  };

  private onToggleFullscreen = () => {
    this.dispatchEvent(new CustomEvent("xep80-toolbox-toggle-fullscreen", {
      bubbles: true,
      composed: true,
    }));
  };

  private renderModeControls() {
    const items: Array<{ mode: Xep80RenderMode; label: string }> = [
      { mode: "bitmap", label: "1987" },
      { mode: "text", label: "2026" },
    ];

    return html`
      <section class="xep80-toolbox__group" aria-labelledby="xep80-toolbox-view-label">
        <span id="xep80-toolbox-view-label" class="xep80-toolbox__label">View Mode</span>
        <div class="xep80-toolbox__controls" role="group" aria-label="View mode">
          ${items.map(
      ({ mode, label }) => html`
              <button
                type="button"
                class="xep80-toolbox__button xep80-toolbox__button--segmented ${this.mode === mode ? "xep80-toolbox__button--active" : ""}"
                aria-pressed=${this.mode === mode}
                @click=${() => this.onModeClick(mode)}
              >
                ${label}
              </button>
            `,
    )}
        </div>
      </section>
    `;
  }

  private renderTintControls() {
    return html`
      <section class="xep80-toolbox__group" aria-labelledby="xep80-toolbox-tint-label">
        <span id="xep80-toolbox-tint-label" class="xep80-toolbox__label">Display Tint</span>
        <div class="xep80-toolbox__controls" role="group" aria-label="Display tint">
          ${xep80ColorOptions.map(
      ({ id, label, tint }) => html`
              <button
                type="button"
                class="xep80-toolbox__button xep80-toolbox__button--segmented ${this.colorId === id ? "xep80-toolbox__button--active" : ""}"
                aria-pressed=${this.colorId === id}
                @click=${() => this.onColorClick(id)}
              >
                <span class="xep80-toolbox__swatch" style=${`background:${tint}`}></span>
                ${label}
              </button>
            `,
    )}
        </div>
      </section>
    `;
  }

  private renderWindowControls() {
    return html`
      <section class="xep80-toolbox__group xep80-toolbox__group--window" aria-labelledby="xep80-toolbox-window-label">
        <span id="xep80-toolbox-window-label" class="xep80-toolbox__label">Window</span>
        <div class="xep80-toolbox__controls">
          <button
            type="button"
            class="xep80-toolbox__button"
            @click=${this.onToggleFullscreen}
          >
            ${this.fullscreen ? "Exit Full Screen" : "Enter Full Screen"}
          </button>
        </div>
      </section>
    `;
  }

  override render() {
    return html`
      <style>
        .xep80-toolbox {
          position: absolute;
          left: 50%;
          bottom: calc(var(--xep80-surface-bottom-spacing, 8px) + 0.75rem);
          width: min(100% - 1.5rem, 52rem);
          transform: translate(-50%, 0.75rem);
          opacity: 0;
          pointer-events: none;
          transition: opacity 180ms ease, transform 180ms ease;
          z-index: 3;
        }

        .xep80-toolbox--visible {
          opacity: 1;
          pointer-events: auto;
          transform: translate(-50%, 0);
        }

        .xep80-toolbox__panel {
          padding: 0;
          color: var(--bs-body-color);
          background: transparent;
          border: 0;
          border-radius: 0;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }

        .xep80-toolbox__grid {
          display: flex;
          align-items: stretch;
          justify-content: space-between;
          gap: 0.75rem;
          min-width: 0;
        }

        .xep80-toolbox__group {
          display: flex;
          flex: 1 1 0;
          flex-direction: column;
          min-width: 0;
          padding: 0.75rem 0.8rem;
          border: 1px solid var(--bs-border-color);
          border-radius: 0.85rem;
          background: rgba(var(--bs-body-bg-rgb), 0.6);
        }

        .xep80-toolbox__group--window {
          flex: 0 0 auto;
        }

        .xep80-toolbox__label {
          display: block;
          margin-bottom: 0.55rem;
          color: rgba(var(--bs-body-color-rgb), 0.62);
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .xep80-toolbox__controls {
          display: flex;
          gap: 0.5rem;
          min-width: 0;
        }

        .xep80-toolbox__button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          min-height: 2.5rem;
          padding: 0.55rem 0.8rem;
          color: var(--bs-body-color);
          border: 1px solid var(--bs-border-color);
          background: rgba(var(--bs-body-bg-rgb), 0.78);
          border-radius: 0.75rem;
          font-size: 0.92rem;
          font-weight: 600;
          line-height: 1.2;
          transition:
            background-color 150ms ease,
            border-color 150ms ease,
            color 150ms ease,
            transform 150ms ease;
        }

        .xep80-toolbox__button:hover,
        .xep80-toolbox__button:focus-visible {
          color: var(--bs-body-color);
          border-color: rgba(var(--bs-primary-rgb), 0.38);
          background: rgba(var(--bs-primary-rgb), 0.1);
        }

        .xep80-toolbox__button:active {
          transform: translateY(1px);
        }

        .xep80-toolbox__button--segmented {
          flex: 1 1 0;
          min-width: 0;
        }

        .xep80-toolbox__button--active {
          color: var(--bs-body-bg);
          border-color: var(--bs-primary);
          background: var(--bs-primary);
        }

        .xep80-toolbox__button--active:hover,
        .xep80-toolbox__button--active:focus-visible,
        .xep80-toolbox__button--active:active {
          color: var(--bs-body-bg);
          border-color: var(--bs-primary);
          background: var(--bs-primary);
          transform: none;
        }

        .xep80-toolbox__swatch {
          display: inline-block;
          flex: 0 0 auto;
          width: 0.8rem;
          height: 0.8rem;
          border: 1px solid rgba(var(--bs-body-color-rgb), 0.2);
          border-radius: 999px;
        }

        @media (max-width: 720px) {
          .xep80-toolbox {
            width: min(100% - 1rem, 30rem);
          }

          .xep80-toolbox__grid {
            flex-direction: column;
          }

          .xep80-toolbox__group,
          .xep80-toolbox__group--window {
            flex: 1 1 auto;
          }

          .xep80-toolbox__controls {
            flex-direction: column;
          }

          .xep80-toolbox__button--segmented {
            width: 100%;
          }
        }
      </style>
      <div
        class="xep80-toolbox ${this.visible ? "xep80-toolbox--visible" : ""}"
        ?inert=${!this.visible}
        aria-hidden=${String(!this.visible)}
      >
        <div class="xep80-toolbox__panel" role="group" aria-label="XEP80 toolbox">
          <div class="xep80-toolbox__grid">
            ${this.renderModeControls()}
            ${this.renderTintControls()}
            ${this.renderWindowControls()}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "xep80-toolbox": Xep80Toolbox;
  }
}
