import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Download SVG' })).toBeEnabled();
});

test('search, controls, and local persistence update the actual preview', async ({ page }) => {
  const initial = await page.locator('#design-preview').innerHTML();
  await page.getByRole('searchbox').fill('hood');
  await page.locator('.illustration-library summary').click();
  await page.getByRole('button', { name: /Mount Hood Oregon/ }).click();
  await expect(page.locator('#selected-title')).toHaveText('Mount Hood');
  await expect(page.locator('#design-preview')).not.toHaveJSProperty('innerHTML', initial);
  await page.getByLabel('Mountain name', { exact: true }).fill('OUR OREGON ADVENTURE');
  await page.getByLabel('Typeface').selectOption('cormorant');
  await page.getByLabel('Coordinate format').selectOption('dms');
  await page.getByRole('switch', { name: 'Engraved border' }).check();
  await page.reload();
  await expect(page.getByLabel('Mountain name', { exact: true })).toHaveValue('OUR OREGON ADVENTURE');
  await expect(page.getByLabel('Typeface')).toHaveValue('cormorant');
  await expect(page.getByRole('switch', { name: 'Engraved border' })).toBeChecked();
  await expect(page.getByLabel('Coordinate format')).toHaveValue('dms');
});

test('downloads a valid, self-contained xTool SVG at the chosen size', async ({ page }) => {
  await page.getByLabel('Coaster size').selectOption('4.25');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG' }).click();
  const download = await downloadPromise;
  const svg = await readFile((await download.path())!, 'utf8');
  expect(download.suggestedFilename()).toBe('mount-rainier-4.25in-coaster.svg');
  const validation = await page.evaluate(svg => {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return { errors: doc.querySelectorAll('parsererror').length, width: doc.documentElement.getAttribute('width'), texts: doc.querySelectorAll('text, image, filter, style').length, paths: doc.querySelectorAll('path').length };
  }, svg);
  expect(validation).toEqual({ errors: 0, width: '107.95mm', texts: 0, paths: 4 });
});

test('artwork mode, hidden coordinates, and reset retain correct semantics', async ({ page }) => {
  await page.getByRole('button', { name: 'Artwork', exact: true }).click();
  await expect(page.locator('#coaster')).toHaveClass(/artwork-only/);
  await page.getByRole('switch', { name: 'Summit coordinates' }).uncheck();
  await expect(page.locator('#design-preview #coordinates')).toHaveCount(0);
  await expect(page.getByLabel('Coordinate format')).toBeDisabled();
  await page.getByRole('button', { name: 'Reset design' }).click();
  await expect(page.locator('#design-preview #coordinates')).toHaveCount(1);
  await page.getByRole('button', { name: 'How it works' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('illustrated workflow has no runtime dependency on third-party services', async ({ page }) => {
  await page.context().setOffline(true);
  await page.getByRole('searchbox').fill('fuji');
  await page.locator('.illustration-library summary').click();
  await page.getByRole('button', { name: /Mount Fuji Honshu/ }).click();
  await expect(page.locator('#selected-title')).toHaveText('Mount Fuji');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG' }).click();
  expect((await downloadPromise).suggestedFilename()).toContain('fuji');
});

test('worldwide search builds a profile from returned elevations', async ({ page }) => {
  await page.route('https://photon.komoot.io/**', route => route.fulfill({ json: { features: [{ geometry: { type: 'Point', coordinates: [-121.11, 48.51] }, properties: { name: 'Sahale Mountain', osm_type: 'N', osm_id: 123, osm_value: 'peak', state: 'Washington', country: 'United States' } }] } }));
  let elevationRequests = 0;
  await page.route('https://api.open-meteo.com/**', route => {
    elevationRequests++;
    const url = new URL(route.request().url());
    const count = url.searchParams.get('latitude')!.split(',').length;
    expect([1, 81]).toContain(count);
    return route.fulfill({ json: { elevation: count === 1 ? [2681] : Array.from({ length: 81 }, (_, i) => 1000 + (40 - Math.abs(40 - i)) * 40) } });
  });
  await page.getByRole('searchbox').fill('Sahale');
  await page.getByRole('button', { name: 'Search worldwide' }).click();
  await page.getByRole('button', { name: /Sahale Mountain Washington/ }).click();
  await expect(page.locator('#selected-title')).toHaveText('Sahale Mountain');
  await expect(page.locator('#selected-location')).toContainText('Elevation cross-section');
  await page.getByLabel('Landscape width').selectOption('40');
  await page.getByRole('button', { name: 'Update terrain' }).click();
  await expect(page.locator('#terrain-status')).toHaveText('Profile updated.');
  expect(elevationRequests).toBe(3);
});

test('worldwide errors preserve a working illustrated design', async ({ page }) => {
  await page.route('https://photon.komoot.io/**', route => route.abort());
  await page.route('https://overpass-api.de/**', route => route.abort());
  await page.getByRole('searchbox').fill('Some peak');
  await page.getByRole('button', { name: 'Search worldwide' }).click();
  await expect(page.locator('#worldwide-results')).toContainText('Worldwide search services are unavailable');
  await expect(page.getByRole('button', { name: 'Download SVG' })).toBeEnabled();
  await expect(page.locator('#selected-title')).toHaveText('Mount Rainier');
});

test('fits phone and tablet viewports without horizontal overflow', async ({ page }) => {
  for (const width of [390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Download SVG' })).toBeVisible();
  }
});

test('unsupported lettering is flagged before export', async ({ page }) => {
  await page.getByLabel('Mountain name', { exact: true }).fill('MY MOUNTAIN 🏔');
  await expect(page.locator('#font-warning')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download SVG' })).toBeDisabled();
  await page.getByLabel('Mountain name', { exact: true }).fill('MY MOUNTAIN');
  await expect(page.getByRole('button', { name: 'Download SVG' })).toBeEnabled();
});

test('primary worldwide search returns more than twelve mountains and filters below 3500 feet', async ({ page }) => {
  await page.route('https://photon.komoot.io/**', route => route.fulfill({ json: { features: Array.from({ length: 24 }, (_, i) => ({ geometry: { type: 'Point', coordinates: [10 + i, -20 + i] }, properties: { name: `World summit ${i + 1}`, osm_type: 'N', osm_id: 500 + i, osm_value: 'peak', ele: i < 22 ? 1200 + i * 10 : 900, state: 'Global region', country: 'New Zealand' } })) } }));
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: { elevation: Array.from({ length: 81 }, (_, i) => 700 + (40 - Math.abs(40 - i)) * 20) } }));
  await page.getByRole('searchbox').fill('World summit');
  await page.getByRole('searchbox').press('Enter');
  await expect(page.locator('.world-result')).toHaveCount(22);
  await expect(page.locator('#results-heading')).toHaveText('SUMMITS ABOVE 3,500 FT');
  await expect(page.locator('#worldwide-results')).toContainText('2 lower summits excluded');
  await page.getByRole('button', { name: /World summit 22 Global region/ }).click();
  await expect(page.locator('#selected-title')).toHaveText('World summit 22');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('world-summit-22-4in-coaster.svg');
});

test('unlisted summit works by coordinates without a geocoder match', async ({ page }) => {
  let requests = 0;
  await page.route('https://api.open-meteo.com/**', route => {
    requests++;
    const n = new URL(route.request().url()).searchParams.get('latitude')!.split(',').length;
    return route.fulfill({ json: { elevation: n === 1 ? [2200] : Array.from({ length: 81 }, (_, i) => 900 + (40 - Math.abs(40 - i)) * 30) } });
  });
  await page.locator('.coordinate-lookup summary').click();
  await page.getByLabel('Summit name', { exact: true }).fill('My Unmapped Summit');
  await page.getByLabel('Latitude', { exact: true }).fill('-43.6');
  await page.getByLabel('Longitude', { exact: true }).fill('170.1');
  await page.getByRole('button', { name: 'Use this summit' }).click();
  await expect(page.locator('#selected-title')).toHaveText('My Unmapped Summit');
  await expect(page.locator('#coordinate-status')).toContainText('Summit verified');
  await expect(page.locator('#coordinate-details')).toHaveText('Your summit coordinates · WGS 84');
  expect(requests).toBe(2);
});

test('coordinate entry below the minimum preserves the previous design', async ({ page }) => {
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: { elevation: [900] } }));
  await page.locator('.coordinate-lookup summary').click();
  await page.getByLabel('Summit name', { exact: true }).fill('Small hill');
  await page.getByLabel('Latitude', { exact: true }).fill('53');
  await page.getByLabel('Longitude', { exact: true }).fill('-4');
  await page.getByRole('button', { name: 'Use this summit' }).click();
  await expect(page.locator('#coordinate-status')).toContainText('Choose a summit above 3,500 ft');
  await expect(page.locator('#selected-title')).toHaveText('Mount Rainier');
  await expect(page.getByRole('button', { name: 'Download SVG' })).toBeEnabled();
});

test('direct global map fallback finds peaks missing from the geocoder', async ({ page }) => {
  await page.route('https://photon.komoot.io/**', route => route.fulfill({ json: { features: [] } }));
  await page.route('https://overpass-api.de/**', route => route.fulfill({ json: { elements: [{ type: 'node', id: 999, lat: 31.059, lon: -7.918, tags: { natural: 'peak', name: 'Toubkal', ele: '4167', 'is_in:country': 'Morocco' } }] } }));
  await page.getByRole('searchbox').fill('Toubkal');
  await page.getByRole('button', { name: 'Search worldwide' }).click();
  await expect(page.getByRole('button', { name: /Toubkal Morocco/ })).toBeVisible();
  await expect(page.locator('#result-count')).toHaveText('1');
});
