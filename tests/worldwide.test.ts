import { afterEach, describe, expect, it, vi } from 'vitest';
import { aboveMinimum, MIN_ELEVATION_METERS, loadTerrain, overpassPeaks, overpassQuery, parseElevation, peakAtCoordinates, photonPeaks, profileCoordinates, searchWorldwide } from '../app/src/terrain';

afterEach(() => vi.unstubAllGlobals());
const feature = (name: string, elevation?: number | string, lat = 56.7969, lon = -5.0036) => ({ geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { name, osm_type: 'N', osm_id: name, osm_value: 'peak', ele: elevation, country: 'Scotland' } });
const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('worldwide summit eligibility', () => {
  it('converts 3,500 feet exactly and filters strictly above the boundary', () => {
    expect(MIN_ELEVATION_METERS).toBe(1066.8);
    expect(aboveMinimum(1066.79)).toBe(false);
    expect(aboveMinimum(1066.8)).toBe(false);
    expect(aboveMinimum(1066.81)).toBe(true);
    for (const value of [null, undefined, NaN, Infinity, '1500']) expect(aboveMinimum(value)).toBe(false);
  });
  it('parses map heights with units without mistaking feet for meters', () => {
    expect(parseElevation('3,500 ft')).toBe(1066.8);
    expect(parseElevation('1,345 m')).toBe(1345);
    expect(parseElevation('1345')).toBe(1345);
    expect(parseElevation('1000;2000')).toBeUndefined();
    expect(parseElevation('unknown')).toBeUndefined();
  });
  it('accepts peaks on every continent and rejects malformed coordinates and non-peaks', () => {
    const records = [feature('Aoraki', 3724, -43.595, 170.142), feature('Toubkal', 4167, 31.059, -7.918), feature('Vinson', 4892, -78.525, -85.617), feature('Ben Nevis', 1345), feature('Invalid', 1500, 99, 0), { ...feature('City', 2000), properties: { ...feature('City').properties, osm_value: 'city' } }];
    expect(photonPeaks({ features: records }).map(p => p.name)).toEqual(['Aoraki', 'Toubkal', 'Vinson', 'Ben Nevis']);
  });
  it('includes volcanic summits as well as peaks', () => {
    const volcano = feature('Mount Etna', 3357, 37.75, 14.99);
    volcano.properties.osm_value = 'volcano';
    expect(photonPeaks({ features: [volcano] })[0].name).toBe('Mount Etna');
    expect(overpassQuery('Etna')).toContain('peak|volcano');
  });
  it('keeps polar and date-line sections geographically valid', () => {
    for (const [lat, lon] of [[89.9, 179.99], [-89.9, -179.99], [27.9, 86.9]]) {
      const samples = profileCoordinates(lat, lon, 40, 90);
      expect(samples[40]).toEqual({ lat, lon });
      for (const p of samples) { expect(Math.abs(p.lat)).toBeLessThanOrEqual(90); expect(Math.abs(p.lon)).toBeLessThanOrEqual(180); }
    }
    expect(() => profileCoordinates(91, 0, 20, 90)).toThrow('valid');
  });
});

describe('global search and elevation checks', () => {
  it('returns more than twelve results and filters lower summits using map heights', async () => {
    const fetcher = vi.fn(async () => json({ features: Array.from({ length: 28 }, (_, i) => feature(`Global peak ${i}`, i < 25 ? 1200 + i : 500, -40 + i, 160 - i)) }));
    vi.stubGlobal('fetch', fetcher);
    const results = await searchWorldwide('global test collection');
    expect(results.peaks).toHaveLength(25);
    expect(results.excludedCount).toBe(3);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain('limit=50');
  });
  it('resolves missing heights in one batch and excludes null data and low peaks', async () => {
    const fetcher = vi.fn(async (url: string) => url.includes('photon') ? json({ features: [feature('Estimated high'), feature('Estimated low', undefined, 53, -4), feature('Unknown height', undefined, 52, -3)] }) : json({ elevation: [1345, 978, null] }));
    vi.stubGlobal('fetch', fetcher);
    const results = await searchWorldwide('batch height test');
    expect(results.peaks.map(p => p.name)).toEqual(['Estimated high']);
    expect(results.peaks[0].elevationSource).toBe('dem');
    expect(results.excludedCount).toBe(1);
    expect(results.unverifiedCount).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('uses the direct global map index if the geocoder misses a summit', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('photon') ? json({ features: [] }) : json({ elements: [{ type: 'node', id: 100, lat: -43.5, lon: 170.1, tags: { natural: 'peak', name: 'Unindexed summit', ele: '3724' } }] })));
    const results = await searchWorldwide('unindexed global summit');
    expect(results.provider).toBe('overpass');
    expect(results.peaks[0].elevation).toBe(3724);
    expect(results.peaks[0].lat).toBe(-43.5);
  });
  it('tries the wider map index when geocoder matches are all below the minimum', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('photon') ? json({ features: [feature('Shared name low', 500)] }) : json({ elements: [{ type: 'node', id: 101, lat: 31, lon: -7, tags: { name: 'Shared name high', ele: '4167' } }] })));
    const results = await searchWorldwide('shared name threshold fallback');
    expect(results.peaks[0].name).toBe('Shared name high');
    expect(results.provider).toBe('overpass');
  });
  it('escapes map query input and rejects incomplete map responses', () => {
    const query = overpassQuery('Peak.* ";out;');
    expect(query).toContain('Peak\\\\.\\\\*');
    expect(query).toContain('\\"');
    expect(() => overpassPeaks({ elements: [], remark: 'Timeout' })).toThrow('busy');
  });
  it('does not pretend unknown elevations meet the height limit when lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { if (url.includes('photon')) return json({ features: [feature('No height test')] }); throw new TypeError('Network failed'); }));
    await expect(searchWorldwide('missing height service test')).rejects.toThrow('Could not verify summit heights');
  });
});

describe('any summit by coordinates', () => {
  it('checks a coordinate-only summit and rejects locations below the threshold', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ elevation: [1600] })));
    const peak = await peakAtCoordinates('My unlisted peak', -35, 149);
    expect(peak.name).toBe('My unlisted peak');
    expect(peak.elevation).toBe(1600);
    vi.stubGlobal('fetch', vi.fn(async () => json({ elevation: [1000] })));
    await expect(peakAtCoordinates('Too low', 50, 0)).rejects.toThrow('above 3,500 ft');
  });
  it('does not fetch a known low summit or invalid coordinate', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(loadTerrain({ id: 'low', name: 'Low', region: '', country: '', lat: 1, lon: 2, elevation: 1000 })).rejects.toThrow('above 3,500 ft');
    await expect(peakAtCoordinates('Invalid', 91, 0)).rejects.toThrow('latitude');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
