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

export type ViewportSize = {
  width: number;
  height: number;
};

export type ElementBoxInsets = {
  horizontalPadding: number;
  verticalPadding: number;
  horizontalBorders: number;
  verticalBorders: number;
};

export type Xep80TextRenderMetrics = {
  fontSize: number;
  renderWidth: number;
  renderHeight: number;
};

export function fitSizeWithinViewport(
  available: ViewportSize,
  content: ViewportSize,
): ViewportSize {
  const scale = Math.min(
    available.width / content.width,
    available.height / content.height,
  );

  return {
    width: Math.floor(content.width * scale),
    height: Math.floor(content.height * scale),
  };
}

export function computeContentSize(
  availableSize: ViewportSize,
  insets: ElementBoxInsets,
  safetyPx: number,
): ViewportSize | null {
  const contentWidth = Math.max(
    0,
    availableSize.width -
    insets.horizontalPadding -
    insets.horizontalBorders -
    safetyPx,
  );
  const contentHeight = Math.max(
    0,
    availableSize.height -
    insets.verticalPadding -
    insets.verticalBorders -
    safetyPx,
  );

  if (contentWidth <= 0 || contentHeight <= 0) {
    return null;
  }

  return {
    width: contentWidth,
    height: contentHeight,
  };
}

export function computeTextRenderMetrics(
  contentSize: ViewportSize,
  cols: number,
  rows: number,
  charWidth: number,
  lineHeight: number,
  baseFontSize: number,
): Xep80TextRenderMetrics | null {
  if (charWidth <= 0 || lineHeight <= 0) {
    return null;
  }

  const fittedSize = fitSizeWithinViewport(
    contentSize,
    {
      width: cols * charWidth,
      height: rows * lineHeight,
    },
  );
  const scale = fittedSize.width / (cols * charWidth);
  const fontSize = Math.floor(baseFontSize * scale * 100) / 100;

  return {
    fontSize,
    renderWidth: Math.floor(cols * charWidth * (fontSize / baseFontSize)),
    renderHeight: Math.ceil(rows * lineHeight * (fontSize / baseFontSize)),
  };
}
