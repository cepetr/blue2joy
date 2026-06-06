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
import { customElement, property } from "lit/decorators.js";

export type Xep80ToolboxMode = "bitmap" | "text";

type ModeChangeDetail = {
  mode: Xep80ToolboxMode;
};

@customElement("xep80-toolbox")
export class Xep80Toolbox extends LitElement {
  protected override createRenderRoot() {
    return this;
  }

  @property({ type: Boolean })
  visible = false;

  @property({ type: String })
  mode: Xep80ToolboxMode = "bitmap";

  @property({ type: String })
  nextColorLabel = "Green";

  @property({ type: Boolean })
  fullscreen = false;

  private onModeClick = (mode: Xep80ToolboxMode) => {
    this.dispatchEvent(new CustomEvent<ModeChangeDetail>("xep80-toolbox-mode-change", {
      detail: { mode },
      bubbles: true,
      composed: true,
    }));
  };

  private onCycleColor = () => {
    this.dispatchEvent(new CustomEvent("xep80-toolbox-cycle-color", {
      bubbles: true,
      composed: true,
    }));
  };

  private onToggleFullscreen = () => {
    this.dispatchEvent(new CustomEvent("xep80-toolbox-toggle-fullscreen", {
      bubbles: true,
      composed: true,
    }));
  };

  override render() {
    const items: Array<{ mode: Xep80ToolboxMode; label: string }> = [
      { mode: "bitmap", label: "Original" },
      { mode: "text", label: "Modern" },
    ];

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
            ${this.nextColorLabel}
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
