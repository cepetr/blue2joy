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

import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

const promptStyles = html`
  <style>
    .xep80-activation-prompt {
      position: absolute;
      inset: var(--xep80-surface-top-spacing, 16px) 0 var(--xep80-surface-bottom-spacing, 8px);
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
      background: rgba(var(--bs-body-bg-rgb), 0.94);
      border: 1px solid var(--bs-border-color-translucent);
      border-radius: 0.9rem;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
      pointer-events: auto;
    }
  </style>
`;

@customElement("xep80-prompts")
export class Xep80Prompts extends LitElement {
  protected override createRenderRoot() {
    return this;
  }

  @property({ type: Boolean })
  enabled = false;

  @property({ type: Boolean })
  synced = false;

  private onActivate = () => {
    this.dispatchEvent(new CustomEvent("xep80-prompts-activate", {
      bubbles: true,
      composed: true,
    }));
  };

  override render() {
    if (!this.enabled) {
      return html`
        ${promptStyles}
        <div class="xep80-activation-prompt">
          <div class="xep80-activation-card">
            <p class="mb-3">
              Joystick port is currently not in XEP80 mode. Press the button to
              activate XEP80 emulation.
            </p>
            <button
              type="button"
              class="btn btn-primary"
              @click=${this.onActivate}
            >
              Activate XEP80
            </button>
          </div>
        </div>
      `;
    }

    if (!this.synced) {
      return html`
        ${promptStyles}
        <div class="xep80-activation-prompt">
          <div class="xep80-activation-card">
            <p class="mb-0">
              Waiting for XEP80 sync from Blue2Joy.
            </p>
          </div>
        </div>
      `;
    }

    return nothing;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "xep80-prompts": Xep80Prompts;
  }
}
