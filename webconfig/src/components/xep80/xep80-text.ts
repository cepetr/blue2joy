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

type Xep80TextRun = {
  text: string;
  inverted: boolean;
  blinking: boolean;
  cursorBlinking: boolean;
  underline: boolean;
  doubleWidth: boolean;
  cursor: boolean;
  columns: number;
};

@customElement("xep80-text")
export class Xep80Text extends LitElement {
  static readonly baseFontSizePx = 16;
  static readonly lineHeight = 1.25;

  protected override createRenderRoot() {
    return this;
  }

  @property({ attribute: false })
  rows: Xep80TextRow[] = [];

  @property({ type: Boolean })
  suppressed = false;

  private buildRuns(row: Xep80TextRow): Xep80TextRun[] {
    const runs: Xep80TextRun[] = [];

    for (const cell of row) {
      const previousRun = runs.at(-1);
      const cellColumns = cell.doubleWidth ? 2 : 1;

      if (
        previousRun
        && previousRun.inverted === cell.inverted
        && previousRun.blinking === cell.blinking
        && previousRun.cursorBlinking === cell.cursorBlinking
        && previousRun.underline === cell.underline
        && previousRun.doubleWidth === cell.doubleWidth
        && previousRun.cursor === cell.cursor
      ) {
        previousRun.text += cell.text;
        previousRun.columns += cellColumns;
        continue;
      }

      runs.push({
        text: cell.text,
        inverted: cell.inverted,
        blinking: cell.blinking,
        cursorBlinking: cell.cursorBlinking,
        underline: cell.underline,
        doubleWidth: cell.doubleWidth,
        cursor: cell.cursor,
        columns: cellColumns,
      });
    }

    return runs;
  }

  private getRunClassName(run: Xep80TextRun): string {
    return [
      "x80c",
      run.doubleWidth ? "x80c--dw" : "",
      run.inverted ? "x80c--inv" : "",
      run.blinking ? "x80c--blink" : "",
      run.underline ? "x80c--ul" : "",
      run.cursor ? "x80c--cur" : "",
      run.cursorBlinking ? "x80c--curblink" : "",
    ].filter(Boolean).join(" ");
  }

  private getRunStyle(run: Xep80TextRun): string {
    if (!run.doubleWidth) {
      return `width:${run.columns}ch;min-width:${run.columns}ch;`;
    }

    const baseColumns = run.columns / 2;

    return `width:${baseColumns}ch;min-width:${baseColumns}ch;margin-right:${baseColumns}ch;`;
  }

  override render() {
    return html`
      <style>
        @keyframes x80-blink {
          0%, 49.999% {
            opacity: 1;
          }

          50%, 100% {
            opacity: 0;
          }
        }

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
          text-align: left;
          overflow: hidden;
          transform-origin: left center;
          white-space: pre;
        }

        .x80c--dw {
          overflow: visible;
          transform: scaleX(2);
        }

        .x80c--inv {
          color: var(--xep80-surface-background);
          background: var(--xep80-display-color);
        }

        .x80c--inv {
          text-shadow: none;
        }

        .x80c--ul {
          text-decoration: underline;
          text-decoration-thickness: 1px;
        }

        .x80c--blink {
          animation: x80-blink 1s step-end infinite;
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

        .x80c--inv.x80c--cur::after {
          background: color-mix(
            in srgb,
            var(--xep80-surface-background) 50%,
            transparent
          );
        }

        .x80c--curblink::after {
          animation: x80-blink 0.5s step-end infinite;
        }
      </style>
      <div class="xep80-surface xep80-surface--text ${this.suppressed ? "xep80-surface--inactive" : ""}">
        <div class="xep80-text-screen">${this.rows.map((row) =>
      html`<div class="xep80-text-row">${this.buildRuns(row).map((run) => html`<span
                class=${this.getRunClassName(run)}
                style=${this.getRunStyle(run)}
              >${run.text}</span>`)}${""}</div>`)}${""}</div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "xep80-text": Xep80Text;
  }
}
