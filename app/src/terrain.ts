import type { Mountain } from './mountains';

export const MIN_ELEVATION_FT = 3500;
export const MIN_ELEVATION_METERS = MIN_ELEVATION_FT * 0.3048;
export const SEARCH_LIMIT = 50;
export type PeakResult = {
  id: string; name: string; region: string; country: string; lat: number; lon: number;
  elevation?: number; elevationSource?: 'map' | 'dem' | 'illustrated'; locationSource?: 'osm' | 'coordinates';
};
export type PeakSearch = { peaks: PeakResult[]; candidateCount: number; excludedCount: number; unverifiedCount: number; limitReached: boolean; provider: 'photon' | 'overpass' };
const sessionCache = new Map<string, Mountain>();
const searchCache = new Map<string, { time: number; results: PeakSearch }>();
export const feet = (meters: number) => Math.round(meters / 0.3048).toLocaleString('en-US');
export const aboveMinimum = (elevation: unknown): elevation is number => typeof elevation === 'number' && Number.isFinite(elevation) && elevation > MIN_ELEVATION_METERS;

export function validLocation(lat: unknown, lon: unknown): boolean {
  return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90 && typeof lon === 'number' && Number.isFinite(lon) && Math.abs(lon) <= 180;
}

export function parseElevation(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const match = value.trim().replace(/,(?=\d{3}(?:\D|$))/g, '').match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(m|metres|meters|ft|feet|')?$/i);
  if (!match) return undefined;
  const meters = Number(match[1]) * (/^(ft|feet|')$/i.test(match[2] ?? '') ? 0.3048 : 1);
  return Number.isFinite(meters) ? meters : undefined;
}

async function getJSON(url: string, signal?: AbortSignal, timeout = 20000) {
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`The map service returned ${response.status}. Please try again later.`);
  return response.json();
}

export function photonPeaks(data: any): PeakResult[] {
  if (!Array.isArray(data?.features)) throw new Error('The map service sent an unexpected response.');
  return data.features.filter((f: any) => f.geometry?.type === 'Point' && typeof f.properties?.name === 'string' && f.properties.name.trim() && ['peak', 'volcano'].includes(f.properties?.osm_value) && validLocation(f.geometry.coordinates?.[1], f.geometry.coordinates?.[0]))
    .map((f: any) => ({ id: `osm-${f.properties.osm_type}-${f.properties.osm_id}`, name: f.properties.name, region: f.properties.state || f.properties.county || '', country: f.properties.country || '', lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], elevation: parseElevation(f.properties.extra?.ele ?? f.properties.ele), elevationSource: 'map' as const, locationSource: 'osm' as const }));
}

export function overpassQuery(query: string): string {
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `[out:json][timeout:25];nwr["natural"~"^(peak|volcano)$"][~"^(name|name:en|alt_name|loc_name)$"~${JSON.stringify(literal)},i];out tags center 100;`;
}

export function overpassPeaks(data: any): PeakResult[] {
  if (!Array.isArray(data?.elements) || data.remark) throw new Error('The worldwide map index is busy. Please try a more specific mountain name.');
  return data.elements.filter((el: any) => typeof (el.tags?.['name:en'] || el.tags?.name) === 'string' && validLocation(el.lat ?? el.center?.lat, el.lon ?? el.center?.lon))
    .map((el: any) => ({ id: `osm-${el.type?.[0]?.toUpperCase()}-${el.id}`, name: el.tags['name:en'] || el.tags.name, region: el.tags['is_in:state'] || el.tags['addr:state'] || '', country: el.tags['is_in:country'] || el.tags['addr:country'] || '', lat: el.lat ?? el.center.lat, lon: el.lon ?? el.center.lon, elevation: parseElevation(el.tags.ele), elevationSource: 'map' as const, locationSource: 'osm' as const }));
}

async function elevations(points: { lat: number; lon: number }[], signal?: AbortSignal): Promise<(number | null)[]> {
  const data = await getJSON(`https://api.open-meteo.com/v1/elevation?latitude=${points.map(p => p.lat.toFixed(5)).join(',')}&longitude=${points.map(p => p.lon.toFixed(5)).join(',')}`, signal);
  if (!Array.isArray(data.elevation) || data.elevation.length !== points.length) throw new Error('Elevation data is incomplete. Please try again.');
  return data.elevation.map((e: unknown) => typeof e === 'number' && Number.isFinite(e) ? e : null);
}

async function checkCandidates(raw: PeakResult[], provider: PeakSearch['provider'], signal?: AbortSignal): Promise<PeakSearch> {
  const limitReached = raw.length >= (provider === 'photon' ? SEARCH_LIMIT : 100);
  const seen = new Set<string>();
  const candidates = raw.filter(p => {
    const id = `${p.lat.toFixed(5)},${p.lon.toFixed(5)}:${p.name.toLocaleLowerCase()}`;
    if (seen.has(id)) return false;
    seen.add(id); return true;
  });
  const missing = candidates.filter(p => p.elevation === undefined);
  if (missing.length) {
    try {
      const heights = await elevations(missing, signal);
      missing.forEach((p, i) => { if (heights[i] !== null) { p.elevation = heights[i]!; p.elevationSource = 'dem'; } });
    } catch (error) { if (signal?.aborted) throw error; }
  }
  return { peaks: candidates.filter(p => aboveMinimum(p.elevation)), candidateCount: candidates.length, excludedCount: candidates.filter(p => p.elevation !== undefined && !aboveMinimum(p.elevation)).length, unverifiedCount: candidates.filter(p => p.elevation === undefined).length, limitReached, provider };
}

export async function searchWorldwide(query: string, signal?: AbortSignal): Promise<PeakSearch> {
  signal?.throwIfAborted();
  const trimmed = query.trim();
  if (trimmed.length < 3) throw new Error('Enter at least 3 characters to search worldwide.');
  const key = trimmed.toLocaleLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.time < 300000) return cached.results;
  let results: PeakSearch = { peaks: [], candidateCount: 0, excludedCount: 0, unverifiedCount: 0, limitReached: false, provider: 'photon' };
  let photonFailed = false;
  let fallbackFailed = false;
  try {
    const data = await getJSON(`https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=${SEARCH_LIMIT}&osm_tag=natural:peak&osm_tag=natural:volcano&lang=en`, signal, 10000);
    results = await checkCandidates(photonPeaks(data), 'photon', signal);
  } catch (error) { if (signal?.aborted) throw error; photonFailed = true; }
  if (!results.peaks.length) {
    try {
      const data = await getJSON(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery(trimmed))}`, signal, 30000);
      const fallback = await checkCandidates(overpassPeaks(data), 'overpass', signal);
      if (fallback.candidateCount || !results.candidateCount) results = fallback;
    } catch (error) {
      if (signal?.aborted) throw error;
      fallbackFailed = true;
      if (photonFailed) throw new Error('Worldwide search services are unavailable. Try again shortly, or use summit coordinates below.');
    }
  }
  if (!results.peaks.length && results.unverifiedCount) throw new Error('Could not verify summit heights. Elevation lookup is unavailable; your current design is preserved. Try again shortly.');
  if (!fallbackFailed && !results.unverifiedCount) {
    if (searchCache.size >= 30) searchCache.delete(searchCache.keys().next().value!);
    searchCache.set(key, { time: Date.now(), results });
  }
  return results;
}

export async function peakAtCoordinates(name: string, lat: number, lon: number, signal?: AbortSignal): Promise<PeakResult> {
  if (!name.trim()) throw new Error('Enter a name for this summit.');
  if (!validLocation(lat, lon)) throw new Error('Use a latitude from −90 to 90 and longitude from −180 to 180.');
  const [height] = await elevations([{ lat, lon }], signal);
  if (height === null) throw new Error('No elevation is available for these coordinates. Try the exact summit location.');
  if (!aboveMinimum(height)) throw new Error(`This location is approximately ${feet(height)} ft. Choose a summit above 3,500 ft.`);
  return { id: `coordinate-${lat}-${lon}`, name: name.trim(), region: 'Custom summit', country: '', lat, lon, elevation: height, elevationSource: 'dem', locationSource: 'coordinates' };
}

export function profileCoordinates(lat: number, lon: number, spanKm: number, bearing: number) {
  if (!validLocation(lat, lon) || !Number.isFinite(spanKm) || spanKm <= 0 || !Number.isFinite(bearing)) throw new Error('Use valid summit coordinates, landscape width, and direction.');
  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;
  return Array.from({ length: 81 }, (_, i) => {
    if (i === 40) return { lat, lon };
    const km = (i / 80 - 0.5) * spanKm;
    const delta = Math.abs(km) / 6371.0088;
    const theta = (bearing + (km < 0 ? 180 : 0)) * Math.PI / 180;
    const phi2 = Math.asin(Math.sin(phi) * Math.cos(delta) + Math.cos(phi) * Math.sin(delta) * Math.cos(theta));
    const lambda2 = lambda + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi), Math.cos(delta) - Math.sin(phi) * Math.sin(phi2));
    return { lat: phi2 * 180 / Math.PI, lon: ((lambda2 * 180 / Math.PI + 540) % 360) - 180 };
  });
}

export function elevationToRidge(heights: number[]): string {
  if (heights.length !== 81 || heights.some(e => typeof e !== 'number' || !Number.isFinite(e))) throw new Error('Elevation data is incomplete for this peak.');
  const low = Math.min(...heights);
  const range = Math.max(...heights) - low;
  if (range < 20) throw new Error('This section is too flat to create a useful mountain profile. Try a wider span or another direction.');
  const points = heights.map((e, i) => `${(25 + i / 80 * 550).toFixed(2)},${(195 - (e - low) / range * 150).toFixed(2)}`);
  return [...points, '575,215', '25,215'].join(' ');
}

export async function loadTerrain(peak: PeakResult, spanKm = 20, bearing = 90, signal?: AbortSignal): Promise<Mountain> {
  if (peak.elevation !== undefined && !aboveMinimum(peak.elevation)) throw new Error(`Choose a summit above 3,500 ft. This summit is ${feet(peak.elevation)} ft.`);
  const key = `${peak.id}-${spanKm}-${bearing}`;
  if (sessionCache.has(key)) return sessionCache.get(key)!;
  const points = profileCoordinates(peak.lat, peak.lon, spanKm, bearing);
  const data = await elevations(points, signal);
  const ridge = elevationToRidge(data as number[]);
  const height = peak.elevation ?? data[40]!;
  if (!aboveMinimum(height)) throw new Error(`This summit is approximately ${feet(height)} ft. Choose a mountain above 3,500 ft.`);
  const mountain: Mountain = { ...peak, elevation: height, elevationSource: peak.elevationSource ?? 'dem', ridge, cuts: '', aliases: [], source: 'terrain' };
  sessionCache.set(key, mountain);
  return mountain;
}
