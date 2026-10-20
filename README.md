# Ridgeline — Mountain Coaster Studio

A static web app for designing mountain engravings on square slate coasters. Search mapped mountains worldwide above 3,500 feet, generate a terrain profile, customize the name and summit coordinates, and download an SVG for xTool Studio. No backend, account, or API key is required.

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

- **Worldwide search is the primary workflow:** Enter a mountain name, optionally including a region or country, and press Enter or **Search worldwide**. This searches global map data, not a fixed list of twelve mountains. Results come from mapped peaks and volcanoes on every continent.
- **3,500-foot minimum:** Only results with a height strictly above **3,500 ft (1,066.8 m)** are offered. Map-provided elevations are used where available; otherwise elevations are checked in a single batch against the Open-Meteo DEM. Unknown heights are omitted rather than assumed eligible. Heights are displayed in feet and metres; **≈** marks DEM estimates.
- **Worldwide coverage:** Photon returns up to 50 candidates per query; a direct Overpass name/alternate-name search provides up to 100 when Photon fails or finds no qualifying summits. These are result-page sizes, not a limit on which mountains the app supports. Refine broad queries with a name or region. No global map index guarantees every named or unnamed summit is present.
- **Unlisted summits:** Expand **Can’t find it? Use summit coordinates**, enter the name and exact latitude/longitude, and choose **Use this summit**. The app checks the elevation against the same minimum and generates its terrain profile. Coordinate sampling supports polar regions and crossing the international date line.
- **Terrain generation:** Select a result to generate its actual elevation cross-section; adjust the landscape width or direction. This can be used for any qualifying location with available elevation data. No matching hand-drawn illustration is required.
- **Featured illustrations:** An optional collapsed section contains the original twelve offline illustrations. It is separate from global search.
- **Personalization:** Editable label, three locally bundled typefaces, name and artwork sizes, decimal or DMS summit coordinates, divider, and border.
- **Preview:** Rough slate simulation and a clean artwork view. The texture and colors are illustrative; real slate engraving results vary.
- **Sizes:** 3.5, 4, or 4.25 inches square. The default SVG is exactly **101.6 × 101.6 mm**, with a transparent background and a 1000 × 1000 viewBox.
- **SVG:** Solid black paths, including outlined lettering and a filled border. No fonts, raster images, background, external references, or preview filters are required by the downloaded file.

Import the SVG into xTool Studio, verify its physical dimensions, and set the artwork to engrave. Position and frame the design on the actual blank. Choose settings for your specific laser and slate, and test on a spare piece. The app does not provide machine-specific power or speed presets. Export structure and size are browser-tested; physical engraving and xTool Studio import have not been tested on hardware here.

### What the mountain artwork represents

Featured illustration artwork is original and artist-interpreted, not a surveyed silhouette from a known camera location. The first four mountains are inspired by the style of mountain coaster engravings. Coordinates are summit locations in WGS 84.

Worldwide profiles use **81 elevation samples along a geodesic through the summit**, spanning 10, 20, or 40 km. Elevations are normalized vertically to fit the artwork. These are geographic cross-sections, not an occlusion-aware view from a trail or a photographic tracing. No snow details are invented for measured profiles. DEM resolution can miss sharp summits and small features.

## External services, privacy, and attribution

The illustrated workflow and SVG export work without third-party requests once the app's static assets have loaded. All fonts are served with the site. Worldwide lookup requires internet access to:

- `photon.komoot.io`: [Photon](https://photon.komoot.io/) geocoding, using [OpenStreetMap](https://www.openstreetmap.org/copyright) data © OpenStreetMap contributors, ODbL. Search is explicitly submitted, not requested on each keystroke. Peaks and volcanic summits are included.
- `overpass-api.de`: [Overpass API](https://overpass-api.de/) provides a direct global OpenStreetMap name search when the geocoder fails or returns no qualifying summits. It is a public service with availability and query limits.
- `api.open-meteo.com`: [Open-Meteo elevation API](https://open-meteo.com/en/docs/elevation-api), using Copernicus DEM GLO-90. Elevation data is subject to the provider's data license and public service usage terms; review those before commercial or high-volume deployment.

Search terms go to Photon and, when the fallback is needed, Overpass. Candidate summit coordinates are sent to Open-Meteo to check heights; selecting a summit sends the section sample coordinates to generate its profile. User-entered summit coordinates are sent only to Open-Meteo. The app makes no analytics requests. Terrain responses are cached in memory for the current page session, and successful name searches are cached for five minutes. API failures leave the existing design available and do not substitute a fictional profile.

Fonts: Cinzel, Cormorant Garamond, DM Sans (SIL Open Font License; bundled license files in `app/public/fonts/`). Icons: Lucide, ISC license (`app/public/lucide-LICENSE`).

## Validation

```sh
npm test          # SVG, coordinates, search, terrain geometry
npm run build:pages # TypeScript, production build, and root Pages files
npm run test:e2e # Chromium: actual production app, exports, controls, mobile, persistence
```

The browser tests use `/usr/bin/chromium` when available, with an override through `CHROMIUM_PATH`. Otherwise, install Playwright's browser (`npx playwright install chromium`); the tests use it automatically. CI installs the browser and runs the same tests, including direct static hosting at both `/` and `/mountain/`. E2E tests automatically start the production preview on port 4173; run `npm run build:pages` first.

Worldwide success and failure flows are tested against controlled API responses, including more than twelve qualifying results, feet-to-metre conversion and the exact threshold boundary, missing-height filtering, direct-map fallback, and unlisted summits entered by coordinates. DEM elevations are estimates at roughly 90 m resolution and may under-read sharp or narrow summits, especially close to the minimum; this is not a surveyed, exhaustive catalogue of every mountain on Earth. Live third-party access may be restricted in cloud development environments; that does not affect the local illustrated collection or static GitHub Pages deployment.
