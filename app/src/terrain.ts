import type { Mountain } from './mountains';

export type PeakResult = { id: string; name: string; region: string; country: string; lat: number; lon: number };
const sessionCache = new Map<string, Mountain>();

async function getJSON(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal: signal ?? AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`The map service returned ${response.status}. Please try again later.`);
  return response.json();
}

export async function searchWorldwide(query: string, signal?: AbortSignal): Promise<PeakResult[]> {
  const data = await getJSON(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=12&osm_tag=natural:peak&lang=en`, signal);
  if (!Array.isArray(data.features)) throw new Error('The map service sent an unexpected response.');
  return data.features.filter((f: any) => f.geometry?.type === 'Point' && f.properties?.name && f.properties?.osm_value === 'peak')
    .map((f: any) => ({ id: `osm-${f.properties.osm_type}-${f.properties.osm_id}`, name: f.properties.name, region: f.properties.state || f.properties.county || '', country: f.properties.country || '', lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
}

export function profileCoordinates(lat: number, lon: number, spanKm: number, bearing: number) {
  if (!Number.isFinite(lat) || Math.abs(lat) > 85 || !Number.isFinite(lon)) throw new Error('This location is outside the supported elevation coverage.');
  return Array.from({ length: 81 }, (_, i) => {
    const km = (i / 80 - 0.5) * spanKm;
    const radians = bearing * Math.PI / 180;
    return { lat: lat + km * Math.cos(radians) / 111.32, lon: ((lon + km * Math.sin(radians) / (111.32 * Math.cos(lat * Math.PI / 180)) + 540) % 360) - 180 };
  });
}

export function elevationToRidge(elevations: number[]): string {
  if (elevations.length !== 81 || elevations.some(e => typeof e !== 'number' || !Number.isFinite(e))) throw new Error('Elevation data is incomplete for this peak.');
  const low = Math.min(...elevations);
  const range = Math.max(...elevations) - low;
  if (range < 20) throw new Error('This section is too flat to create a useful mountain profile. Try a wider span or another direction.');
  const points = elevations.map((e, i) => `${(25 + i / 80 * 550).toFixed(2)},${(195 - (e - low) / range * 150).toFixed(2)}`);
  return [...points, '575,215', '25,215'].join(' ');
}

export async function loadTerrain(peak: PeakResult, spanKm = 20, bearing = 90, signal?: AbortSignal): Promise<Mountain> {
  const key = `${peak.id}-${spanKm}-${bearing}`;
  if (sessionCache.has(key)) return sessionCache.get(key)!;
  const points = profileCoordinates(peak.lat, peak.lon, spanKm, bearing);
  const data = await getJSON(`https://api.open-meteo.com/v1/elevation?latitude=${points.map(p => p.lat.toFixed(5)).join(',')}&longitude=${points.map(p => p.lon.toFixed(5)).join(',')}`, signal);
  const mountain: Mountain = { ...peak, elevation: Math.round(data.elevation?.[40] ?? 0), ridge: elevationToRidge(data.elevation ?? []), cuts: '', aliases: [], source: 'terrain' };
  sessionCache.set(key, mountain);
  return mountain;
}
