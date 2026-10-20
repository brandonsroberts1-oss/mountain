// Keep a deployable copy at the repository root for Pages' branch-based mode.
// Vite development sources live in app/; normal builds still go to dist/.
import { cp, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const entries = await readdir(dist);
if (!entries.includes('index.html') || !entries.includes('assets')) {
  throw new Error('Missing production build. Run npm run build first.');
}
// assets/ is reserved for generated, content-hashed production files.
await rm(join(root, 'assets'), { recursive: true, force: true });
for (const entry of entries) {
  await cp(join(dist, entry), join(root, entry), { recursive: true });
}
console.log('Prepared index.html and compiled assets for direct GitHub Pages publishing.');
