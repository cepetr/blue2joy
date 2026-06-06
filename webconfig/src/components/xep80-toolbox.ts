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
