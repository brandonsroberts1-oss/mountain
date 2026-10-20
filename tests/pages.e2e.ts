import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2' };
let server: Server;
let address: string;

test.beforeAll(async () => {
  // Serve the committed checkout exactly as branch-based Pages does: no Vite,
  // transpilation, dependency resolution, or history fallback.
  server = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    const path = url.pathname.replace(/^\/mountain\//, '/');
    const file = resolve(root, `.${decodeURIComponent(path.endsWith('/') ? path + 'index.html' : path)}`);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  address = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
});

for (const prefix of ['/', '/mountain/']) {
  test(`committed static site loads and exports at ${prefix}`, async ({ page }) => {
    expect(await readFile(resolve(root, 'index.html'), 'utf8')).toBe(await readFile(resolve(root, 'dist/index.html'), 'utf8'));
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(address + prefix);
    await expect(page.getByRole('button', { name: 'Download SVG' })).toBeEnabled();
    await page.getByRole('searchbox').fill('hood');
    await page.getByRole('button', { name: /Mount Hood Oregon/ }).click();
    await expect(page.locator('#selected-title')).toHaveText('Mount Hood');
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download SVG' }).click();
    expect((await downloadEvent).suggestedFilename()).toBe('mount-hood-4in-coaster.svg');
    expect(errors).toEqual([]);
    expect(await page.locator('script[src]').first().getAttribute('src')).toMatch(/^\.\/assets\/.+\.js$/);
  });
}
