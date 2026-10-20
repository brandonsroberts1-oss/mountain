import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import opentype from 'opentype.js';
import { coordinates, defaultDesign, exportSVG, textPath } from '../app/src/design';
import { mountains, searchLibrary } from '../app/src/mountains';
import { elevationToRidge, profileCoordinates } from '../app/src/terrain';
const fontBuffer = readFileSync('node_modules/@fontsource/cinzel/files/cinzel-latin-600-normal.woff');
const font = opentype.parse(fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength) as ArrayBuffer);

describe('engraving SVG', () => {
  it('uses real millimetre dimensions and outlined text on a transparent background', () => {
    const svg = exportSVG(mountains[0], defaultDesign, font, font);
    expect(svg).toContain('width="101.6mm" height="101.6mm"');
    expect(svg).toContain('id="mountain-name"><path d="M');
    expect(svg).toContain('id="coordinates"><path d="M');
    expect(svg).not.toMatch(/<text|<image|<filter|<style|href=/);
    expect(svg).toContain('fill="#000000"');
  });
  it('honors the chosen dimensions, coordinate visibility, and border', () => {
    const svg = exportSVG(mountains[5], { ...defaultDesign, sizeInches: 3.5, coordinates: false, border: true }, font, font);
    expect(svg).toContain('width="88.9mm"');
    expect(svg).not.toContain('id="coordinates"');
    expect(svg).toContain('id="border"');
    expect(svg).not.toContain('stroke=');
  });
  it('escapes custom labels and fits long names into the artwork width', () => {
    const svg = exportSVG(mountains[0], { ...defaultDesign, name: 'A <peak> & "a place"' }, font, font);
    expect(svg).toContain('A &lt;peak&gt; &amp; &quot;a place&quot;');
    const path = textPath(font, 'A VERY LONG MOUNTAIN NAME FOR MY COASTER', 500, 650, 75, 790);
    expect(path).not.toMatch(/NaN|Infinity/);
    expect(path.length).toBeGreaterThan(100);
  });
  it('formats both hemispheres and carries rounded DMS seconds correctly', () => {
    expect(coordinates(mountains[0], 'decimal')).toBe('46.8523° N  ·  121.7603° W');
    expect(coordinates(mountains[9], 'decimal')).toContain('3.0674° S');
    expect(coordinates({ lat: 1.999999, lon: -0.00001 }, 'dms')).toBe('2° 0′ 0″ N  ·  0° 0′ 0″ W');
  });
});

describe('mountain selection and measured terrain', () => {
  it('finds illustrated peaks by name, region, and indigenous name', () => {
    expect(searchLibrary('tahoma')[0].id).toBe('rainier');
    expect(searchLibrary('St. Helens')[0].id).toBe('st-helens');
    expect(searchLibrary('Washington')).toHaveLength(4);
    expect(searchLibrary('unknown peak')).toEqual([]);
  });
  it('samples 81 points centered exactly on the summit', () => {
    const points = profileCoordinates(46, -121, 20, 90);
    expect(points).toHaveLength(81);
    expect(points[40]).toEqual({ lat: 46, lon: -121 });
    expect(points[0].lon).toBeLessThan(-121);
    expect(points[80].lon).toBeGreaterThan(-121);
    const northSouth = profileCoordinates(46, -121, 20, 0);
    expect(northSouth[0].lat).toBeLessThan(46);
    expect(northSouth[80].lon).toBeCloseTo(-121, 10);
  });
  it('rejects incomplete, invalid, and flat elevation results', () => {
    expect(() => elevationToRidge([100, 200])).toThrow('incomplete');
    expect(() => elevationToRidge(Array(81).fill(null))).toThrow('incomplete');
    expect(() => elevationToRidge(Array(81).fill(100))).toThrow('flat');
  });
  it('uses the measured summit height in the outline', () => {
    const elevations = Array.from({ length: 81 }, (_, i) => 1000 + Math.max(0, 40 - Math.abs(i - 40)) * 30);
    const ridge = elevationToRidge(elevations);
    expect(ridge).toContain('300.00,45.00');
    expect(ridge).toContain('25.00,195.00');
  });
});
