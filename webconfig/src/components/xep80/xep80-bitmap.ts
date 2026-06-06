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

@customElement("xep80-bitmap")
export class Xep80Bitmap extends LitElement {
  static readonly pixelAspectHeight = 2;

  protected override createRenderRoot() {
    return this;
  }

  @property({ type: Boolean })
  suppressed = false;

  override render() {
    return html`
      <div class="xep80-surface xep80-surface--bitmap ${this.suppressed ? "xep80-surface--inactive" : ""}">
        <canvas width="560" height="250" class="xep80-canvas"></canvas>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "xep80-bitmap": Xep80Bitmap;
  }
}
