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

  private onCycleColor = () => {
    xep80ToolboxConfig.cycleColor();
  };

  private onToggleFullscreen = () => {
    this.dispatchEvent(new CustomEvent("xep80-toolbox-toggle-fullscreen", {
      bubbles: true,
      composed: true,
    }));
  };

  override render() {
    const items: Array<{ mode: Xep80RenderMode; label: string }> = [
      { mode: "bitmap", label: "Original" },
      { mode: "text", label: "Modern" },
    ];
    const currentIndex = xep80ColorOptions.findIndex(
      ({ id }) => id === this.colorId,
    );
    const nextColor =
      xep80ColorOptions[(currentIndex + 1) % xep80ColorOptions.length];

    return html`
      <style>
        .xep80-toolbox {
          position: absolute;
          left: 50%;
          bottom: calc(var(--xep80-surface-bottom-spacing, 8px) + 0.5rem);
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
      </style>
      <div
        class="xep80-toolbox ${this.visible ? "xep80-toolbox--visible" : ""}"
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
                class="btn btn-outline-secondary ${this.mode === mode ? "active" : ""}"
                aria-pressed=${this.mode === mode}
                @click=${() => this.onModeClick(mode)}
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
            ${this.fullscreen ? "Windowed" : "Full Screen"}
          </button>
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
