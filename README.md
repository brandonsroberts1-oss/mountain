# Ridgeline — Mountain Coaster Studio

A static web app for designing mountain engravings on square slate coasters. Search a collection of twelve original mountain illustrations, customize the name and summit coordinates, and download an SVG for xTool Studio. No backend, account, or API key is required.

## Run locally

Use Node.js 24 (see `.nvmrc`).

```sh
npm ci
npm run dev
```

`npm run build` checks TypeScript and creates the production site in `dist/`. `npm run preview` serves that build locally. The app stores the current design in browser localStorage. No design is uploaded.

## Publish on GitHub Pages

The repository includes a compiled site at its root. GitHub Pages can serve it directly without running Node.js or a build command.

**Publish from a branch:** Open **Settings → Pages**, select **Deploy from a branch**, choose **main** and **/ (root)**, then save. GitHub publishes the committed `index.html` and `assets/`. An empty `.nojekyll` file disables Jekyll processing.

**Publish with Actions:** Alternatively, select **GitHub Actions** as the Pages source. The **Build and deploy studio** workflow builds the source and deploys `dist/` on pushes to `main` or a manual workflow run. It detects branch publishing and leaves deployment to GitHub's built-in branch workflow in that mode. No repository secrets are needed.

The app uses relative asset URLs, so both a repository Pages path such as `/mountain/` and a custom domain work. There are no client-side routes or server rewrites to configure.

### Updating the site

Edit application source under `app/`. The root `index.html`, `assets/`, font licenses, favicon, and slate texture are generated publication files; do not edit those copies directly.

```sh
npm run build:pages
npm test
npm run test:e2e
```

Commit the source changes **and** the regenerated root publication files, then push to `main`. This keeps both publishing modes up to date. `npm run dev` uses the source in `app/`; `npm run build` produces `dist/` without modifying the committed publication files.

### If a published page is blank

The published page must load a compiled `.js` file under `./assets/`, not `/src/main.ts`. Serving Vite's development HTML directly cannot run the app. The checked-in root page is the compiled version. Confirm the latest Pages deployment completed, then hard-refresh the browser to discard an older cached page.

## Design and engraving

- **Illustrated library:** Mount Rainier, Mount Hood, Mount St. Helens, Mount Adams, Mount Baker, Mount Fuji, Matterhorn, Mount Everest, Denali, Kilimanjaro, Mount Shasta, and Mount Whitney. Search by mountain, region, country, or included alternate names.
- **Worldwide lookup:** Type a name and choose **Find another peak worldwide**. Select a mapped summit to fetch a terrain cross-section. Change the landscape width or direction to explore another section.
- **Personalization:** Editable label, three locally bundled typefaces, name and artwork sizes, decimal or DMS summit coordinates, divider, and border.
- **Preview:** Rough slate simulation and a clean artwork view. The texture and colors are illustrative; real slate engraving results vary.
- **Sizes:** 3.5, 4, or 4.25 inches square. The default SVG is exactly **101.6 × 101.6 mm**, with a transparent background and a 1000 × 1000 viewBox.
- **SVG:** Solid black paths, including outlined lettering and a filled border. No fonts, raster images, background, external references, or preview filters are required by the downloaded file.

Import the SVG into xTool Studio, verify its physical dimensions, and set the artwork to engrave. Position and frame the design on the actual blank. Choose settings for your specific laser and slate, and test on a spare piece. The app does not provide machine-specific power or speed presets. Export structure and size are browser-tested; physical engraving and xTool Studio import have not been tested on hardware here.

### What the mountain artwork represents

Collection artwork is original and artist-interpreted, not a surveyed silhouette from a known camera location. The first four mountains are inspired by the style of mountain coaster engravings. Coordinates are summit locations in WGS 84.

Worldwide profiles use **81 elevation samples through the summit**, spanning 10, 20, or 40 km. Elevations are normalized vertically to fit the artwork. These are geographic cross-sections, not an occlusion-aware view from a trail or a photographic tracing. No snow details are invented for measured profiles. DEM resolution can miss sharp summits and small features.

## External services, privacy, and attribution

The illustrated workflow and SVG export work without third-party requests once the app's static assets have loaded. All fonts are served with the site. Worldwide lookup requires internet access to:

- `photon.komoot.io`: [Photon](https://photon.komoot.io/) geocoding, using [OpenStreetMap](https://www.openstreetmap.org/copyright) data © OpenStreetMap contributors, ODbL. Search is explicitly submitted, not requested on each keystroke.
- `api.open-meteo.com`: [Open-Meteo elevation API](https://open-meteo.com/en/docs/elevation-api), using Copernicus DEM GLO-90. Elevation data is subject to the provider's data license and public service usage terms; review those before commercial or high-volume deployment.

Search terms go to Photon. Selected sample coordinates go to Open-Meteo. The app makes no analytics requests. Terrain responses are cached in memory for the current page session. API failures leave the existing design available and do not substitute a fictional profile.

Fonts: Cinzel, Cormorant Garamond, DM Sans (SIL Open Font License; bundled license files in `app/public/fonts/`). Icons: Lucide, ISC license (`app/public/lucide-LICENSE`).

## Validation

```sh
npm test          # SVG, coordinates, search, terrain geometry
npm run build:pages # TypeScript, production build, and root Pages files
npm run test:e2e # Chromium: actual production app, exports, controls, mobile, persistence
```

The browser tests use `/usr/bin/chromium` when available, with an override through `CHROMIUM_PATH`. Otherwise, install Playwright's browser (`npx playwright install chromium`); the tests use it automatically. CI installs the browser and runs the same tests, including direct static hosting at both `/` and `/mountain/`. E2E tests automatically start the production preview on port 4173; run `npm run build:pages` first.

Worldwide success and failure flows are tested against controlled API responses. Live third-party access may be restricted in cloud development environments; that does not affect the local illustrated collection or static GitHub Pages deployment.
