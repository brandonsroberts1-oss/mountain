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

1. Push these files to the `main` branch of `brandonsroberts1-oss/mountain`.
2. In the repository, open **Settings → Pages** and select **GitHub Actions** as the build and deployment source.
3. The **Deploy studio to GitHub Pages** workflow runs on pushes to `main`. You can also run it from the Actions tab.
4. Open the site URL reported by the deployment.

The app uses relative asset URLs, so the same build works on a repository Pages path such as `/mountain/` or a custom domain. There are no client-side routes or server rewrites to configure. The workflow does not require any repository secrets.

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

Fonts: Cinzel, Cormorant Garamond, DM Sans (SIL Open Font License; bundled license files in `public/fonts/`). Icons: Lucide, ISC license (`public/lucide-LICENSE`).

## Validation

```sh
npm test          # SVG, coordinates, search, terrain geometry
npm run build    # TypeScript and static production build
npm run test:e2e # Chromium: actual production app, exports, controls, mobile, persistence
```

The browser tests use `/usr/bin/chromium` by default, with an override through `CHROMIUM_PATH`. If Chromium is not installed, install Playwright's browser (`npx playwright install chromium`) and set `CHROMIUM_PATH` to its executable, or point to an installed Chrome/Chromium. E2E tests automatically start the production preview on port 4173; run the build first.

Worldwide success and failure flows are tested against controlled API responses. Live third-party access may be restricted in cloud development environments; that does not affect the local illustrated collection or static GitHub Pages deployment.
