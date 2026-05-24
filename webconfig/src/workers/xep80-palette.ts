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
export type Xep80Palette = {
  display: string;
  border: string;
  surface: string;
  glow: string;
};

const DISPLAY_LUMINANCE = 0.78;
const BORDER_LUMINANCE = 0.01;
const SURFACE_LUMINANCE = 0.005;

export function deriveXep80Palette(tint: string): Xep80Palette {
  const rgb = parseHexColor(tint);

  return {
    display: scaleColorToLuminance(tint, DISPLAY_LUMINANCE),
    border: scaleColorToLuminance(tint, BORDER_LUMINANCE),
    surface: scaleColorToLuminance(tint, SURFACE_LUMINANCE),
    glow: rgb ? rgbToRgba(rgb, 0.15) : tint,
  };
}

function scaleColorToLuminance(hex: string, targetLuminance: number): string {
  const rgb = parseHexColor(hex);

  if (!rgb) {
    return hex;
  }

  const linear = rgb.map((channel) => srgbToLinear(channel / 255));
  const luminance =
    0.2126 * linear[0] +
    0.7152 * linear[1] +
    0.0722 * linear[2];

  if (luminance <= 0) {
    const grayscale = linearToSrgb(targetLuminance);
    const channel = Math.round(grayscale * 255);
    return rgbToHex(channel, channel, channel);
  }

  const scale = targetLuminance / luminance;
  const scaled = linear.map((channel) => Math.min(1, channel * scale));
  const srgb = scaled.map(
    (channel) => Math.round(linearToSrgb(channel) * 255),
  ) as [number, number, number];

  return rgbToHex(srgb[0], srgb[1], srgb[2]);
}

function parseHexColor(hex: string): [number, number, number] | null {
  const normalized = hex.trim().replace(/^#/, "");

  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return null;
  }

  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function srgbToLinear(channel: number): number {
  if (channel <= 0.04045) {
    return channel / 12.92;
  }

  return ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  if (channel <= 0.0031308) {
    return channel * 12.92;
  }

  return 1.055 * (channel ** (1 / 2.4)) - 0.055;
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbToRgba(
  [red, green, blue]: [number, number, number],
  alpha: number,
): string {
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
