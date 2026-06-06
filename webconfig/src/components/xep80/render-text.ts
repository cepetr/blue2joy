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
import type { Xep80TextRow } from "../../xep80/worker.js";

@customElement("xep80-text")
export class Xep80Text extends LitElement {
  protected override createRenderRoot() {
    return this;
  }

  @property({ attribute: false })
  rows: Xep80TextRow[] = [];

  @property({ type: Boolean })
  suppressed = false;

  override render() {
    return html`
      <style>
        .xep80-surface--inactive .xep80-text-screen {
          visibility: hidden;
        }

        .xep80-text-screen {
          position: relative;
          z-index: 1;
          margin: 0;
          overflow: hidden;
          display: block;
          color: var(--xep80-display-color);
          font-family: "DejaVu Mono", "DejaVu Sans Mono", ui-monospace, monospace;
          font-size: 1rem;
          line-height: 1.25;
          white-space: normal;
          tab-size: 1;
          font-variant-ligatures: none;
          text-shadow:
            0 0 0.35rem var(--xep80-glow-color),
            0 0 0.85rem color-mix(in srgb, var(--xep80-glow-color) 70%, transparent);
        }

        .xep80-text-row {
          display: flex;
          flex-wrap: nowrap;
        }

        .x80c {
          position: relative;
          display: inline-block;
          box-sizing: border-box;
          flex: 0 0 auto;
          width: 1ch;
          min-width: 1ch;
          text-align: left;
          overflow: hidden;
        }

        .x80c--dw {
          width: 2ch;
          min-width: 2ch;
        }

        .x80c__g {
          position: relative;
          display: inline-block;
          width: 100%;
          transform-origin: left center;
        }

        .x80c--dw .x80c__g {
          transform: scaleX(2);
        }

        .x80c--inv {
          color: var(--xep80-surface-background);
          background: var(--xep80-display-color);
        }

        .x80c--inv .x80c__g {
          text-shadow: none;
        }

        .x80c--ul {
          text-decoration: underline;
          text-decoration-thickness: 1px;
        }

        .x80c--cur::after {
          content: "";
          position: absolute;
          inset: 0;
          background: color-mix(
            in srgb,
            var(--xep80-display-color) 50%,
            transparent
          );
          pointer-events: none;
          z-index: 2;
        }
      </style>
      <div class="xep80-surface xep80-surface--text ${this.suppressed ? "xep80-surface--inactive" : ""}">
        <div class="xep80-text-screen">${this.rows.map((row) =>
      html`<div class="xep80-text-row">${row.map((cell) => html`<span
                class=${[
          "x80c",
          cell.doubleWidth ? "x80c--dw" : "",
          cell.inverted ? "x80c--inv" : "",
          cell.underline ? "x80c--ul" : "",
          cell.cursor ? "x80c--cur" : "",
        ].filter(Boolean).join(" ")}
              ><span class="x80c__g">${cell.text === " " ? "\u00a0" : cell.text}</span></span>`)}${""}</div>`)}${""}</div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "xep80-text": Xep80Text;
  }
}
