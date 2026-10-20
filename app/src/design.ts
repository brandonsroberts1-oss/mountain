import type { Font } from 'opentype.js';
import { mountainPath, type Mountain } from './mountains';

export type Design = { name: string; coordinates: boolean; coordinateFormat: 'decimal' | 'dms'; font: 'cinzel' | 'cormorant' | 'sans'; artworkScale: number; nameSize: number; border: boolean; divider: boolean; sizeInches: number };
export const defaultDesign: Design = { name: 'MOUNT RAINIER', coordinates: true, coordinateFormat: 'decimal', font: 'cinzel', artworkScale: 100, nameSize: 60, border: false, divider: true, sizeInches: 4 };
export const escapeXML = (value: string) => value.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));

export function coordinates(mountain: Pick<Mountain, 'lat' | 'lon'>, format: 'decimal' | 'dms'): string {
  function one(value: number, positive: string, negative: string) {
    const direction = value >= 0 ? positive : negative;
    if (format === 'decimal') return `${Math.abs(value).toFixed(4)}° ${direction}`;
    const totalSeconds = Math.round(Math.abs(value) * 3600);
    return `${Math.floor(totalSeconds / 3600)}° ${Math.floor(totalSeconds % 3600 / 60)}′ ${totalSeconds % 60}″ ${direction}`;
  }
  return `${one(mountain.lat, 'N', 'S')}  ·  ${one(mountain.lon, 'E', 'W')}`;
}

export function textPath(font: Font, value: string, cx: number, baseline: number, size: number, maxWidth: number, spacing = 0): string {
  const glyphs = font.stringToGlyphs(value);
  const scale = size / font.unitsPerEm;
  let width = 0;
  for (let i = 0; i < glyphs.length; i++) width += (glyphs[i].advanceWidth ?? 0) * scale + (i < glyphs.length - 1 ? font.getKerningValue(glyphs[i], glyphs[i + 1]) * scale + spacing : 0);
  if (width > maxWidth) return textPath(font, value, cx, baseline, size * maxWidth / width, maxWidth, spacing * maxWidth / width);
  let x = cx - width / 2;
  return glyphs.map((glyph, i) => {
    const d = glyph.getPath(x, baseline, size).toPathData(3);
    x += (glyph.advanceWidth ?? 0) * scale + (i < glyphs.length - 1 ? font.getKerningValue(glyph, glyphs[i + 1]) * scale + spacing : 0);
    return d;
  }).join(' ');
}

export function designMarkup(mountain: Mountain, design: Design, titleFont: Font, coordinateFont: Font, color = '#000000'): string {
  const scale = 1.32 * design.artworkScale / 100;
  const artY = design.coordinates ? 260 : 300;
  const titleY = design.coordinates ? 655 : 685;
  const title = textPath(titleFont, design.name, 500, titleY, design.nameSize, 790, 1.5);
  const location = textPath(coordinateFont, coordinates(mountain, design.coordinateFormat), 500, 741, 30, 750, 2.5);
  return `<g fill="${color}" fill-rule="evenodd">${design.border ? '<path id="border" d="M73 65H927Q935 65 935 73V927Q935 935 927 935H73Q65 935 65 927V73Q65 65 73 65ZM73 67.5H927Q932.5 67.5 932.5 73V927Q932.5 932.5 927 932.5H73Q67.5 932.5 67.5 927V73Q67.5 67.5 73 67.5Z"/>' : ''}<g id="mountain" transform="translate(500 ${artY}) scale(${scale}) translate(-300 0)"><path d="${mountainPath(mountain)}"/></g><g id="mountain-name"><path d="${title}"/></g>${design.coordinates ? `${design.divider ? '<path d="M475 694h50v2h-50Z"/>' : ''}<g id="coordinates"><path d="${location}"/></g>` : ''}</g>`;
}

export function exportSVG(mountain: Mountain, design: Design, titleFont: Font, coordinateFont: Font): string {
  const mm = Number((design.sizeInches * 25.4).toFixed(3));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${mm}mm" height="${mm}mm" viewBox="0 0 1000 1000"><title>${escapeXML(design.name)} — coaster engraving</title><desc>${escapeXML(coordinates(mountain, design.coordinateFormat))}. ${mountain.source === 'illustrated' ? 'Artist-interpreted mountain illustration' : `${mountain.locationSource === 'coordinates' ? 'Summit coordinates supplied by the user' : 'Peak location © OpenStreetMap contributors, ODbL'}. Elevation cross-section from Open-Meteo, Copernicus DEM GLO-90`}. All lettering is outlined. Black shapes are engraving areas; the background is transparent.</desc>${designMarkup(mountain, design, titleFont, coordinateFont)}</svg>`;
}
