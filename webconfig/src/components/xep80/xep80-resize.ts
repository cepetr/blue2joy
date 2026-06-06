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

import {
  computeContentSize,
  computeTextRenderMetrics,
  fitSizeWithinViewport,
} from "../../xep80/layout.js";
import { XEP80_DISPLAY_COLS, XEP80_DISPLAY_ROWS } from "../../xep80/worker.js";

const contentFitSafetyPx = 4;

type ResizeCommonOptions = {
  isFullscreen: boolean;
};

type ResizeBitmapOptions = ResizeCommonOptions & {
  canvasElement?: HTMLCanvasElement;
  canvasWrap?: HTMLDivElement;
  bitmapSurface?: HTMLDivElement;
  bitmapPixelAspectHeight: number;
};

type ResizeTextOptions = ResizeCommonOptions & {
  textWrap?: HTMLDivElement;
  textSurface?: HTMLDivElement;
  textScreenElement?: HTMLDivElement;
  textBaseFontSizePx: number;
  textLineHeight: number;
};

type ViewportSize = {
  width: number;
  height: number;
};

type ElementBoxInsets = {
  horizontalPadding: number;
  verticalPadding: number;
  horizontalBorders: number;
  verticalBorders: number;
};

export function resizeXep80BitmapSurface(options: ResizeBitmapOptions) {
  const {
    canvasElement,
    canvasWrap,
    bitmapSurface,
    isFullscreen,
    bitmapPixelAspectHeight,
  } = options;

  if (!canvasElement || !canvasWrap || !bitmapSurface) {
    return;
  }

  const baseWidth = canvasElement.width;
  const baseHeight = canvasElement.height * bitmapPixelAspectHeight;
  const availableSize = getAvailableViewportSize(canvasWrap, isFullscreen);

  if (!availableSize) {
    return;
  }

  const contentSize = computeContentSize(
    availableSize,
    getElementBoxInsets(bitmapSurface),
    contentFitSafetyPx,
  );

  if (!contentSize) {
    return;
  }

  setWrapHeight(canvasWrap, availableSize.height);

  const renderSize = fitSizeWithinViewport(contentSize, {
    width: baseWidth,
    height: baseHeight,
  });

  canvasElement.style.width = `${renderSize.width}px`;
  canvasElement.style.height = `${renderSize.height}px`;
}

export function resizeXep80TextSurface(options: ResizeTextOptions) {
  const {
    textWrap,
    textSurface,
    textScreenElement,
    isFullscreen,
    textBaseFontSizePx,
    textLineHeight,
  } = options;

  if (!textWrap || !textSurface || !textScreenElement) {
    return;
  }

  const availableSize = getAvailableViewportSize(textWrap, isFullscreen);

  if (!availableSize) {
    return;
  }

  const computed = window.getComputedStyle(textScreenElement);

  const contentSize = computeContentSize(
    availableSize,
    getElementBoxInsets(textSurface),
    contentFitSafetyPx,
  );

  if (!contentSize) {
    return;
  }

  setWrapHeight(textWrap, availableSize.height);

  const measurementCanvas = document.createElement("canvas");
  const measurementContext = measurementCanvas.getContext("2d");

  if (!measurementContext) {
    return;
  }

  measurementContext.font = `${textBaseFontSizePx}px ${computed.fontFamily}`;

  const sample = "0".repeat(XEP80_DISPLAY_COLS);
  const charWidth = measurementContext.measureText(sample).width / sample.length;
  const lineHeight = textBaseFontSizePx * textLineHeight;

  const renderMetrics = computeTextRenderMetrics(
    contentSize,
    XEP80_DISPLAY_COLS,
    XEP80_DISPLAY_ROWS,
    charWidth,
    lineHeight,
    textBaseFontSizePx,
    8,
  );

  if (!renderMetrics) {
    return;
  }

  textScreenElement.style.fontSize = `${renderMetrics.fontSize}px`;
  textScreenElement.style.width = `${renderMetrics.renderWidth}px`;
  textScreenElement.style.height = `${renderMetrics.renderHeight}px`;
}

function getAvailableViewportSize(
  container: HTMLElement,
  isFullscreen: boolean,
): ViewportSize | null {
  const computed = window.getComputedStyle(container);
  const horizontalPadding =
    parseFloat(computed.paddingLeft) + parseFloat(computed.paddingRight);
  const verticalPadding =
    parseFloat(computed.paddingTop) + parseFloat(computed.paddingBottom);
  const availableWidth = Math.max(0, container.clientWidth - horizontalPadding);
  const wrapRect = container.getBoundingClientRect();
  const viewportBottomGap = isFullscreen ? 0 : 16;
  const outerHeight = Math.max(0, window.innerHeight - wrapRect.top - viewportBottomGap);
  const availableHeight = Math.max(0, outerHeight - verticalPadding);

  if (availableWidth <= 0 || availableHeight <= 0) {
    return null;
  }

  return {
    width: availableWidth,
    height: availableHeight,
  };
}

function setWrapHeight(container: HTMLElement, availableHeight: number) {
  const computed = window.getComputedStyle(container);
  const verticalPadding =
    parseFloat(computed.paddingTop) + parseFloat(computed.paddingBottom);
  container.style.height = `${availableHeight + verticalPadding}px`;
}

function getElementBoxInsets(element: HTMLElement): ElementBoxInsets {
  const computed = window.getComputedStyle(element);

  return {
    horizontalPadding:
      parseFloat(computed.paddingLeft) + parseFloat(computed.paddingRight),
    verticalPadding:
      parseFloat(computed.paddingTop) + parseFloat(computed.paddingBottom),
    horizontalBorders:
      parseFloat(computed.borderLeftWidth) +
      parseFloat(computed.borderRightWidth),
    verticalBorders:
      parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth),
  };
}
