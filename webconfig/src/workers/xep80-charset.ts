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

import fontInternalUrl from "../assets/font_internal.png?url";
import fontInternationalUrl from "../assets/font_international.png?url";
import fontNormalUrl from "../assets/font_normal.png?url";

const normalMap =
  "♥┣▐┛┫┓╱╲◢▗◣▝▝▀▂▖" +
  "♣┏━╋●▄▎┳┻▌┗ᴱ↑↓←→" +
  " !\"#$%&'()*+,-./" +
  "0123456789:;<=>?" +
  "@ABCDEFGHIJKLMNO" +
  "PQRSTUVWXYZ[\\]^_" +
  "♦abcdefghijklmno" +
  "pqrstuvwxyz♠┃↖◀▶";

const internationalMap =
  "áùÑÉçôòì£ïüäÖúóö" +
  "ÜâûîéèñêåàÅᴱ↑↓←→" +
  " !\"#$%&'()*+,-./" +
  "0123456789:;<=>?" +
  "@ABCDEFGHIJKLMNO" +
  "PQRSTUVWXYZ[\\]^_" +
  "¡abcdefghijklmno" +
  "pqrstuvwxyzÄ|↖◀▶";

const internalMap =
  "Ĳ↑Ø£¤°•§ÇÑÆÄÖÅÜŒ" +
  "ĳßàèìïùéçñæäöåüœ" +
  " !\"#$%&'()*+,-./" +
  "0123456789:;<=>?" +
  "@ABCDEFGHIJKLMNO" +
  "PQRSTUVWXYZ[\\]^_" +
  "`abcdefghijklmno" +
  "pqrstuvwxyz{|}~░";

export type Xep80Charset = {
  map: string;
  url: string;
  externalFont: boolean;
  font: ImageBitmap | null;
  loadPromise: Promise<void> | null;
};

export const FONT_NORMAL = 0;
export const FONT_INTERNATIONAL = 1;

const charsets: Xep80Charset[] = [
  {
    map: normalMap,
    url: fontNormalUrl,
    externalFont: true,
    font: null,
    loadPromise: null,
  },
  {
    map: internationalMap,
    url: fontInternationalUrl,
    externalFont: true,
    font: null,
    loadPromise: null,
  },
  {
    map: internalMap,
    url: fontInternalUrl,
    externalFont: false,
    font: null,
    loadPromise: null,
  },
];

export function getXep80Charset(fontIndex: number): Xep80Charset | null {
  return charsets[fontIndex] ?? null;
}

export function mapXep80Char(fontIndex: number, charCode: number): string {
  return charsets[fontIndex]?.map.charAt(charCode) ?? " ";
}

async function loadFont(url: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await createImageBitmap(blob);
  } catch (err) {
    console.error(`Failed to load font from ${url}: `, err);
    return null;
  }
}

async function ensureCharsetFontLoaded(charset: Xep80Charset): Promise<void> {
  if (!charset.loadPromise) {
    charset.loadPromise = (async () => {
      charset.font = await loadFont(charset.url);
    })();
  }

  await charset.loadPromise;
}

export async function ensureXep80FontsLoaded(): Promise<void> {
  await Promise.all(charsets.map((charset) => ensureCharsetFontLoaded(charset)));
}
