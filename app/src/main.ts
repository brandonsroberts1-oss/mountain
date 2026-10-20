import './style.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import { createIcons, Mountain as MountainIcon, ArrowDownToLine, ArrowUpRight, Search, SlidersHorizontal, ChevronDown, ArrowRight, Check, RotateCcw, X, Globe2, MapPin, Info, Minus, Plus, Ruler, Leaf, Sparkles, CircleHelp, LoaderCircle } from 'lucide';
import opentype, { type Font } from 'opentype.js';
import cinzelURL from '@fontsource/cinzel/files/cinzel-latin-600-normal.woff?url';
import cormorantURL from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff?url';
import sansURL from '@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff?url';
import { mountains, mountainPath, searchLibrary, type Mountain } from './mountains';
import { coordinates, defaultDesign, designMarkup, escapeXML, exportSVG, type Design } from './design';
import { aboveMinimum, feet, loadTerrain, peakAtCoordinates, searchWorldwide, validLocation, type PeakResult } from './terrain';

const iconSet = { Mountain: MountainIcon, ArrowDownToLine, ArrowUpRight, Search, SlidersHorizontal, ChevronDown, ArrowRight, Check, RotateCcw, X, Globe2, MapPin, Info, Minus, Plus, Ruler, Leaf, Sparkles, CircleHelp, LoaderCircle };
const icons = () => createIcons({ icons: iconSet, attrs: { 'stroke-width': 1.6 } });
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
let selected: Mountain = mountains[0];
let design: Design = { ...defaultDesign };
let fonts: Record<Design['font'], Font>;
let mode: 'slate' | 'artwork' = 'slate';
let worldwideResults: PeakResult[] = [];
let activeTerrain: PeakResult | null = null;
let lookupController: AbortController | null = null;
let terrainController: AbortController | null = null;
let toastTimer: ReturnType<typeof setTimeout>;

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem('ridgeline-v1') || 'null');
    if (!saved || typeof saved.design?.name !== 'string') return;
    const match = mountains.find(m => m.id === saved.mountainId);
    if (!match && (saved.customMountain?.source !== 'terrain' || !aboveMinimum(saved.customMountain.elevation) || !validLocation(saved.customMountain.lat, saved.customMountain.lon))) return;
    selected = match ?? saved.customMountain;
    const d = saved.design;
    design = { ...defaultDesign, name: d.name.slice(0, 48), coordinates: d.coordinates !== false, coordinateFormat: d.coordinateFormat === 'dms' ? 'dms' : 'decimal', font: ['cinzel', 'cormorant', 'sans'].includes(d.font) ? d.font : 'cinzel', artworkScale: Math.min(110, Math.max(65, Number(d.artworkScale) || 100)), nameSize: Math.min(75, Math.max(30, Number(d.nameSize) || 60)), border: d.border === true, divider: d.divider !== false, sizeInches: [3.5, 4, 4.25].includes(d.sizeInches) ? d.sizeInches : 4 };
    if (!match) activeTerrain = selected;
  } catch { /* Storage can be unavailable or contain an older design. */ }
}
restore();

$('#app').innerHTML = `
  <header class="site-header">
    <a href="./" class="brand" aria-label="Ridgeline home"><span class="brand-mark"><i data-lucide="mountain"></i></span><span>ridgeline<span class="brand-caption">MOUNTAIN COASTER STUDIO</span></span></a>
    <nav aria-label="Main navigation"><span class="nav-active">The studio</span><button class="text-button" id="how-it-works">How it works <i data-lucide="arrow-up-right"></i></button></nav>
    <span class="header-note"><span class="status-dot"></span> A keepsake. A place. A story.</span>
  </header>
  <main>
    <div class="page-heading"><div><p class="eyebrow"><span></span> MADE FOR YOUR NEXT KEEPSAKE</p><h1>A little piece of the peak.</h1><p class="intro">Your favorite mountain. Your coordinates. A coaster worth keeping.</p></div><div class="heading-aside"><i data-lucide="sparkles"></i><span>From the great outdoors<br>to your coffee table.</span></div></div>
    <div class="studio">
      <aside class="mountain-panel panel" aria-label="Mountain selection">
        <div class="panel-heading"><span class="step-number">01</span><h2>Find your mountain</h2></div>
        <div class="search-scope"><i data-lucide="globe-2"></i> WORLDWIDE <span>ABOVE 3,500 FT</span></div>
        <form id="peak-search-form" role="search"><label class="search-box"><i data-lucide="search"></i><input id="mountain-search" type="search" placeholder="Mountain name, anywhere…" autocomplete="off" aria-label="Search mountains"/><kbd>/</kbd></label><button id="worldwide-search" class="global-search-button" type="submit"><i data-lucide="globe-2"></i> Search worldwide <i data-lucide="arrow-right"></i></button></form>
        <p class="search-hint">Add a region or country to narrow your search.</p>
        <div class="library-label"><span id="results-heading">FIND YOUR NEXT SUMMIT</span><span id="result-count"></span></div>
        <div id="worldwide-results" class="global-results" aria-live="polite"><div class="search-intro"><i data-lucide="mountain"></i><p>A world of mountains.</p><span>Search mapped summits on every continent, above 3,500 feet.</span></div></div>
        <details class="coordinate-lookup"><summary>Can’t find it? Use summit coordinates <i data-lucide="plus"></i></summary><form id="coordinate-form"><p>Use an exact summit location. We’ll check its height and create a terrain profile.</p><label for="summit-name">Summit name</label><input id="summit-name" class="text-input" maxlength="48" placeholder="Your mountain" required/><div class="coordinate-fields"><div><label for="summit-latitude">Latitude</label><input id="summit-latitude" class="text-input" type="number" min="-90" max="90" step="any" placeholder="46.8523" required/></div><div><label for="summit-longitude">Longitude</label><input id="summit-longitude" class="text-input" type="number" min="-180" max="180" step="any" placeholder="-121.7603" required/></div></div><button class="secondary-button" id="coordinate-submit" type="submit">Use this summit</button><p id="coordinate-status" role="status"></p></form></details>
        <details class="illustration-library"><summary>Featured illustrations <span>OFFLINE</span><i data-lucide="chevron-down"></i></summary><div id="mountain-list" class="mountain-list" aria-label="Illustrated mountain results"></div></details>
        <div class="collection-note"><i data-lucide="leaf"></i><p>Big places. Small keepsakes.<br><span>Designed for the memories you bring home.</span></p></div>
      </aside>
      <section class="preview-panel" aria-label="Live coaster preview">
        <div class="preview-toolbar"><span class="live-label"><span class="status-dot"></span> LIVE PREVIEW</span><div class="segmented" aria-label="Preview style"><button id="slate-view" class="active" aria-pressed="true">Slate</button><button id="artwork-view" aria-pressed="false">Artwork</button></div></div>
        <div class="preview-stage" id="preview-stage"><div class="coaster-wrap"><div id="coaster" class="coaster"><svg id="design-preview" role="img" aria-label="Loading coaster design" viewBox="0 0 1000 1000"><text x="500" y="500" text-anchor="middle" fill="#d9cbb0" font-size="28">Preparing your studio…</text></svg></div><div class="size-line"><span></span><i></i><p id="dimension-label">4.00 in / 101.6 mm</p><i></i><span></span></div></div></div>
        <div class="preview-caption"><div><span class="tiny-mountain"><i data-lucide="mountain"></i></span><div><h3 id="selected-title"></h3><p id="selected-location"></p><p id="selected-elevation" class="selected-elevation"></p></div></div><span class="material-tag" id="material-tag">NATURAL SLATE</span></div>
        <div class="preview-bottom"><span><i data-lucide="ruler"></i> Built to scale. Made to keep.</span><button class="text-button" id="preview-info"><i data-lucide="info"></i> About this preview</button></div>
      </section>
      <aside class="customize-panel panel" aria-label="Design settings">
        <div class="panel-heading"><span class="step-number">02</span><h2>Make it yours</h2><button id="reset-design" class="icon-button" aria-label="Reset design" title="Reset design"><i data-lucide="rotate-ccw"></i></button></div>
        <div class="settings-scroll">
          <div class="setting-group"><label for="design-name">Mountain name</label><input class="text-input" id="design-name" maxlength="48"/><div class="label-row"><label for="font-select">Typeface</label><span class="field-hint">OUTLINED ON EXPORT</span></div><div class="select-wrap"><select id="font-select"><option value="cinzel">Cinzel · timeless serif</option><option value="cormorant">Cormorant · elegant serif</option><option value="sans">DM Sans · modern minimal</option></select><i data-lucide="chevron-down"></i></div><div class="range-label"><label for="name-size">Name size</label><output id="name-size-value">60</output></div><input id="name-size" type="range" min="30" max="75" step="1"/><p id="font-warning" class="font-warning" role="status" hidden></p></div>
          <div class="setting-group"><div class="toggle-row"><div><label for="show-coordinates">Summit coordinates</label><p>A little reminder of where.</p></div><input class="switch" id="show-coordinates" type="checkbox" role="switch"/></div><div class="select-wrap"><select id="coordinate-format" aria-label="Coordinate format"><option value="decimal">46.8523° N · 121.7603° W</option><option value="dms">46° 51′ 8″ N · 121° 45′ 37″ W</option></select><i data-lucide="chevron-down"></i></div><div class="coordinates-note" id="coordinate-details"></div></div>
          <div class="setting-group"><div class="range-label"><label for="artwork-size">Mountain scale</label><output id="artwork-size-value">100%</output></div><input id="artwork-size" type="range" min="65" max="110" step="1"/><div class="range-captions"><span>A little quieter</span><span>Make a statement</span></div><div class="toggle-row compact"><label for="show-divider">Small divider</label><input class="switch" type="checkbox" role="switch" id="show-divider"/></div><div class="toggle-row compact"><label for="show-border">Engraved border</label><input class="switch" type="checkbox" role="switch" id="show-border"/></div></div>
          <div class="setting-group size-setting"><label for="coaster-size">Coaster size</label><div class="select-wrap"><select id="coaster-size"><option value="3.5">3.5 × 3.5 inches</option><option value="4">4 × 4 inches · standard</option><option value="4.25">4.25 × 4.25 inches</option></select><i data-lucide="chevron-down"></i></div></div>
          <div id="terrain-controls" class="terrain-controls" hidden><p class="eyebrow">TERRAIN CROSS-SECTION</p><label for="terrain-span">Landscape width</label><select id="terrain-span"><option value="10">10 km</option><option value="20" selected>20 km</option><option value="40">40 km</option></select><label for="terrain-bearing">Section direction</label><select id="terrain-bearing"><option value="90">West → East</option><option value="0">South → North</option><option value="45">Southwest → Northeast</option><option value="135">Northwest → Southeast</option></select><button id="refresh-terrain" class="secondary-button">Update terrain</button><p id="terrain-status" role="status"></p></div>
        </div>
        <div class="export-box"><button id="download-svg" class="primary-button" disabled><i data-lucide="arrow-down-to-line"></i> Download SVG <i data-lucide="arrow-right"></i></button><p><i data-lucide="check"></i> xTool Studio ready <span>·</span> Vector artwork</p><span class="save-status" id="save-status">Your design stays in this browser.</span></div>
      </aside>
    </div>
    <div class="studio-footnote"><span><i data-lucide="sliders-horizontal"></i> A few small details. A very personal keepsake.</span><span>01 &nbsp; CHOOSE &nbsp; <i data-lucide="minus"></i> &nbsp; 02 &nbsp; CUSTOMIZE &nbsp; <i data-lucide="minus"></i> &nbsp; 03 &nbsp; MAKE IT REAL</span></div>
    <footer><span class="footer-brand">ridgeline<span> / </span> Made for mountain people.</span><button id="credits-button" class="text-button">Artwork & data notes <i data-lucide="arrow-up-right"></i></button></footer>
  </main>
  <div class="toast" id="toast" role="status" hidden></div>
  <dialog id="help-dialog"><button class="dialog-close icon-button" aria-label="Close dialog"><i data-lucide="x"></i></button><span class="dialog-symbol"><i data-lucide="mountain"></i></span><div id="dialog-content"></div></dialog>
`;

function thumbnail(m: Mountain) { return `<svg viewBox="0 0 600 250" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${mountainPath(m)}"/></svg>`; }

function renderList() {
  const query = $<HTMLInputElement>('#mountain-search').value.trim();
  const found = searchLibrary(query).filter(m => aboveMinimum(m.elevation));
  $('#mountain-list').innerHTML = found.length ? found.map(m => `<button class="mountain-option ${m.id === selected.id ? 'selected' : ''}" data-mountain="${m.id}" aria-pressed="${m.id === selected.id}"><span class="mountain-thumbnail">${thumbnail(m)}</span><span class="mountain-option-text"><strong>${escapeXML(m.name)}</strong><small>${escapeXML(m.region)} <span>·</span> ${feet(m.elevation)} ft</small></span>${m.id === selected.id ? '<span class="selection-check"><i data-lucide="check"></i></span>' : ''}</button>`).join('') : '<p class="featured-empty">No saved illustration for this name. Search worldwide above to generate its terrain profile.</p>';
  icons();
}

function save() {
  try {
    localStorage.setItem('ridgeline-v1', JSON.stringify({ mountainId: selected.id, customMountain: selected.source === 'terrain' ? selected : null, design }));
    $('#save-status').textContent = 'Saved on this device';
  } catch { $('#save-status').textContent = 'Storage unavailable. Download to keep your design.'; }
}

function renderDesign() {
  if (!fonts) return;
  const preview = $('#design-preview');
  preview.innerHTML = designMarkup(selected, design, fonts[design.font], fonts.cormorant, mode === 'slate' ? '#d9c8aa' : '#202923');
  preview.setAttribute('aria-label', `${design.name || selected.name} coaster design${design.coordinates ? ', ' + coordinates(selected, design.coordinateFormat) : ''}`);
  $('#coaster').classList.toggle('artwork-only', mode === 'artwork');
  $('#dimension-label').textContent = `${design.sizeInches.toFixed(2)} in / ${Number((design.sizeInches * 25.4).toFixed(2))} mm`;
  $('#material-tag').textContent = mode === 'slate' ? 'NATURAL SLATE' : 'VECTOR ARTWORK';
  $('#name-size-value').textContent = String(design.nameSize);
  $('#artwork-size-value').textContent = `${design.artworkScale}%`;
  $('#coordinate-details').textContent = selected.locationSource === 'coordinates' ? 'Your summit coordinates · WGS 84' : selected.source === 'terrain' ? 'Peak location from OpenStreetMap' : 'Summit location · WGS 84';
  $('#coordinate-format').toggleAttribute('disabled', !design.coordinates);
  $('#show-divider').toggleAttribute('disabled', !design.coordinates);
  $('#selected-title').textContent = selected.name;
  $('#selected-elevation').textContent = `${selected.elevationSource === 'dem' ? '≈ ' : ''}${feet(selected.elevation)} ft · ${Math.round(selected.elevation).toLocaleString()} m above sea level`;
  $('#selected-location').textContent = `${selected.region}${selected.region && selected.country ? ', ' : ''}${selected.country} · ${selected.source === 'illustrated' ? 'Illustrated profile' : 'Elevation cross-section'}`;
  $('#terrain-controls').toggleAttribute('hidden', selected.source !== 'terrain');
  const missing = [...new Set([...design.name].filter(char => char.trim() && fonts[design.font].charToGlyphIndex(char) === 0))];
  const warning = $('#font-warning');
  warning.hidden = !missing.length;
  warning.textContent = missing.length ? `This font does not include ${missing.slice(0, 5).join(' ')}. Edit the label to use supported lettering before exporting.` : '';
  $<HTMLButtonElement>('#download-svg').disabled = missing.length > 0;
  save();
}

function syncControls() {
  $<HTMLInputElement>('#design-name').value = design.name;
  $<HTMLSelectElement>('#font-select').value = design.font;
  $<HTMLInputElement>('#name-size').value = String(design.nameSize);
  $<HTMLInputElement>('#artwork-size').value = String(design.artworkScale);
  $<HTMLInputElement>('#show-coordinates').checked = design.coordinates;
  $<HTMLInputElement>('#show-divider').checked = design.divider;
  $<HTMLInputElement>('#show-border').checked = design.border;
  $<HTMLSelectElement>('#coordinate-format').value = design.coordinateFormat;
  $<HTMLSelectElement>('#coaster-size').value = String(design.sizeInches);
  const opts = $<HTMLSelectElement>('#coordinate-format').options;
  opts[0].text = coordinates(selected, 'decimal'); opts[1].text = coordinates(selected, 'dms');
}

function selectMountain(m: Mountain) {
  terrainController?.abort();
  selected = m; activeTerrain = m.source === 'terrain' ? m : null;
  design.name = m.name.toUpperCase();
  $('#terrain-status').textContent = '';
  syncControls(); renderList(); renderDesign();
}

$('#mountain-list').addEventListener('click', e => {
  const button = (e.target as Element).closest<HTMLButtonElement>('[data-mountain]');
  if (button) selectMountain(mountains.find(m => m.id === button.dataset.mountain)!);
});
$('#mountain-search').addEventListener('input', () => {
  lookupController?.abort();
  worldwideResults = [];
  $<HTMLButtonElement>('#worldwide-search').disabled = false;
  $('#result-count').textContent = '';
  $('#results-heading').textContent = 'WORLDWIDE MOUNTAIN SEARCH';
  $('#worldwide-results').innerHTML = '<p class="lookup-status">Press Search worldwide or Enter to find peaks above 3,500 ft.</p>';
  renderList();
});
$('#peak-search-form').addEventListener('submit', e => { e.preventDefault(); void doWorldwideSearch(); });
document.addEventListener('keydown', e => { if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as Element).tagName) && !$<HTMLDialogElement>('#help-dialog').open) { e.preventDefault(); $<HTMLInputElement>('#mountain-search').focus(); } });

const bind = (id: string, change: (input: HTMLInputElement) => void) => $(id).addEventListener('input', e => { change(e.target as HTMLInputElement); renderDesign(); });
bind('#design-name', i => design.name = i.value);
bind('#font-select', i => design.font = i.value as Design['font']);
bind('#name-size', i => design.nameSize = Number(i.value));
bind('#artwork-size', i => design.artworkScale = Number(i.value));
bind('#show-coordinates', i => design.coordinates = i.checked);
bind('#show-divider', i => design.divider = i.checked);
bind('#show-border', i => design.border = i.checked);
bind('#coordinate-format', i => design.coordinateFormat = i.value as Design['coordinateFormat']);
bind('#coaster-size', i => design.sizeInches = Number(i.value));

$('#reset-design').addEventListener('click', () => { design = { ...defaultDesign, name: selected.name.toUpperCase() }; syncControls(); renderDesign(); toast('Design reset. A fresh start.'); });
for (const view of ['slate', 'artwork'] as const) $(`#${view}-view`).addEventListener('click', () => {
  mode = view;
  for (const v of ['slate', 'artwork']) { $(`#${v}-view`).classList.toggle('active', mode === v); $(`#${v}-view`).setAttribute('aria-pressed', String(mode === v)); }
  renderDesign();
});

function toast(message: string) { clearTimeout(toastTimer); const el = $('#toast'); el.textContent = message; el.hidden = false; toastTimer = setTimeout(() => el.hidden = true, 5500); }
$('#download-svg').addEventListener('click', () => {
  const svg = exportSVG(selected, design, fonts[design.font], fonts.cormorant);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `${design.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mountain'}-${design.sizeInches}in-coaster.svg`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 15000);
  toast('Your SVG is ready. Import it into xTool Studio to engrave.');
});

async function doWorldwideSearch() {
  const query = $<HTMLInputElement>('#mountain-search').value.trim();
  if (query.length < 3) { toast('Type at least 3 characters of a mountain name to search worldwide.'); $<HTMLInputElement>('#mountain-search').focus(); return; }
  lookupController?.abort(); const controller = new AbortController(); lookupController = controller;
  $<HTMLButtonElement>('#worldwide-search').disabled = true;
  worldwideResults = [];
  $('#result-count').textContent = '';
  $('#results-heading').textContent = 'SEARCHING WORLDWIDE';
  $('#worldwide-results').innerHTML = '<p class="lookup-status"><i data-lucide="loader-circle" class="spin"></i> Finding summits and checking heights…</p>'; icons();
  try {
    const results = await searchWorldwide(query, AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]));
    if (controller.signal.aborted) return;
    worldwideResults = results.peaks;
    $('#results-heading').textContent = 'SUMMITS ABOVE 3,500 FT';
    $('#result-count').textContent = String(worldwideResults.length);
    const notes = [results.excludedCount ? `${results.excludedCount} lower summit${results.excludedCount === 1 ? '' : 's'} excluded.` : '', results.unverifiedCount ? `${results.unverifiedCount} without a verified height omitted.` : '', results.limitReached ? 'More matches may exist. Refine the name or add a region.' : ''].filter(Boolean).join(' ');
    $('#worldwide-results').innerHTML = worldwideResults.length ? `<p class="online-credit">Global map results · heights in feet<br>≈ indicates an elevation estimate</p>${worldwideResults.map((p, i) => `<button class="world-result" data-world-index="${i}"><i data-lucide="mountain"></i><span><strong>${escapeXML(p.name)}</strong><small>${escapeXML([p.region, p.country].filter(Boolean).join(', ') || `${p.lat.toFixed(3)}°, ${p.lon.toFixed(3)}°`)}</small><span class="peak-height">${p.elevationSource === 'dem' ? '≈ ' : ''}${feet(p.elevation!)} ft <span>· ${Math.round(p.elevation!).toLocaleString()} m</span></span></span><i data-lucide="plus"></i></button>`).join('')}<p class="search-result-note">${escapeXML(notes)}</p>` : `<div class="search-intro"><i data-lucide="mountain"></i><p>No qualifying summit found.</p><span>${results.excludedCount ? 'These matches are at or below 3,500 ft. ' : results.unverifiedCount ? 'Summit heights could not be verified for these matches. ' : ''}Try another spelling or a region. You can also use exact summit coordinates below.</span></div>`;
  } catch (error) {
    if (controller.signal.aborted) return;
    $('#results-heading').textContent = 'SEARCH NEEDS ANOTHER TRY';
    const message = error instanceof Error && error.name !== 'TimeoutError' && !(error instanceof TypeError) ? error.message : 'Worldwide search is temporarily unavailable. Please try again shortly.';
    $('#worldwide-results').innerHTML = `<p class="lookup-error">${escapeXML(message)}</p>`;
  } finally {
    if (lookupController === controller) $<HTMLButtonElement>('#worldwide-search').disabled = false;
  }
  icons();
}

async function usePeak(peak: PeakResult, controller: AbortController) {
  const mountain = await loadTerrain(peak, 20, 90, AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]));
  if (controller.signal.aborted) return;
  selectMountain(mountain);
  $<HTMLSelectElement>('#terrain-span').value = '20'; $<HTMLSelectElement>('#terrain-bearing').value = '90';
  toast('Terrain profile loaded. Adjust the width and direction to explore the ridge.');
}

$('#worldwide-results').addEventListener('click', async e => {
  const button = (e.target as Element).closest<HTMLButtonElement>('[data-world-index]');
  if (!button) return;
  const peak = worldwideResults[Number(button.dataset.worldIndex)];
  if (!peak) return;
  terrainController?.abort(); const controller = new AbortController(); terrainController = controller;
  button.disabled = true; const original = button.innerHTML; button.innerHTML = '<i data-lucide="loader-circle" class="spin"></i><span>Reading the landscape…</span>'; icons();
  try { await usePeak(peak, controller); }
  catch (error) { if (!controller.signal.aborted) toast(error instanceof TypeError ? 'Elevation service unavailable. Please try again later.' : (error as Error).message); }
  finally { button.disabled = false; button.innerHTML = original; icons(); }
});

$('#coordinate-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  if (!form.reportValidity()) return;
  terrainController?.abort(); const controller = new AbortController(); terrainController = controller;
  const button = $<HTMLButtonElement>('#coordinate-submit');
  button.disabled = true; $('#coordinate-status').textContent = 'Checking summit height and loading the terrain…';
  try {
    const peak = await peakAtCoordinates($<HTMLInputElement>('#summit-name').value, Number($<HTMLInputElement>('#summit-latitude').value), Number($<HTMLInputElement>('#summit-longitude').value), AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]));
    if (controller.signal.aborted) return;
    await usePeak(peak, controller);
    $('#coordinate-status').textContent = `Summit verified: approximately ${feet(peak.elevation!)} ft.`;
  } catch (error) { if (!controller.signal.aborted) $('#coordinate-status').textContent = error instanceof TypeError ? 'Elevation lookup is unavailable. Your previous design is preserved. Please try again.' : (error as Error).message; }
  finally { button.disabled = false; }
});

$('#refresh-terrain').addEventListener('click', async () => {
  if (!activeTerrain) return;
  terrainController?.abort(); const controller = new AbortController(); terrainController = controller;
  const button = $<HTMLButtonElement>('#refresh-terrain'); button.disabled = true;
  $('#terrain-status').textContent = 'Reading elevation data…';
  try {
    const m = await loadTerrain(activeTerrain, Number($<HTMLSelectElement>('#terrain-span').value), Number($<HTMLSelectElement>('#terrain-bearing').value), AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]));
    if (controller.signal.aborted) return;
    selected = m; renderDesign(); $('#terrain-status').textContent = 'Profile updated.';
  } catch (error) { if (!controller.signal.aborted) $('#terrain-status').textContent = error instanceof TypeError ? 'Elevation service unavailable. Your previous design is preserved.' : (error as Error).message; }
  finally { button.disabled = false; }
});

const dialog = $<HTMLDialogElement>('#help-dialog');
function openDialog(content: string) { $('#dialog-content').innerHTML = content; dialog.showModal(); }
$('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
$('#how-it-works').addEventListener('click', () => openDialog(`<p class="eyebrow">FROM PEAK TO KEEPSAKE</p><h2>Make a place your own.</h2><ol class="help-steps"><li><strong>Find your mountain.</strong><p>Search for a mountain anywhere in the world. Results are checked for heights above 3,500 ft (1,066.8 m). Add a region to distinguish matching names, or enter exact summit coordinates if the map search misses it. Select a result to generate its terrain cross-section. Featured illustrations are also available offline.</p></li><li><strong>Add your finishing touches.</strong><p>Pick a typeface, show the summit coordinates, and adjust the design on your slate preview. Your changes save on this device.</p></li><li><strong>Bring it into xTool Studio.</strong><p>Download the SVG, import it, and verify its size matches your coaster: 101.6 × 101.6 mm for a 4-inch square. Set the filled artwork to engrave, position the design, and frame your work before running.</p></li></ol><div class="dialog-note">Slate varies in texture and engraving contrast. Use your machine and slate supplier’s settings, and test a spare piece first. The preview is an illustration of the result.</div>`));
$('#preview-info').addEventListener('click', () => openDialog(`<p class="eyebrow">A NOTE ON THE MATERIAL</p><h2>A naturally different finish.</h2><p>The slate view simulates a dark, rough-edged coaster with a warm, light engraving. Actual engraving color and detail depend on your slate, laser, focus, and settings.</p><p>Switch to <strong>Artwork</strong> to inspect the shapes. Your SVG contains only solid black engraving paths on a transparent background; the slate texture, dimensions, and shadows stay in the preview.</p><p>The design is sized to the coaster, with an inset margin. Check the imported millimetre dimensions and frame it on your actual blank before engraving.</p>`));
$('#credits-button').addEventListener('click', () => openDialog(`<p class="eyebrow">THE DETAILS BEHIND THE DESIGN</p><h2>Inspired by the real thing.</h2><p>Worldwide search covers mapped peaks on every continent above 3,500 ft. Global map indexes are not exhaustive; exact summit coordinates provide a fallback for unlisted locations. Elevation estimates from a 90 m grid can differ from surveyed summit heights, particularly on narrow peaks. Featured collection illustrations are original, artist-interpreted profiles. They capture the character of each peak, rather than a surveyed view from a specific viewpoint. Summit coordinates use WGS 84.</p><p>Worldwide lookup uses <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> peak locations via <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a>, with a direct <a href="https://overpass-api.de/" target="_blank" rel="noreferrer">Overpass</a> map search as a fallback. Terrain profiles use <a href="https://open-meteo.com/en/docs/elevation-api" target="_blank" rel="noreferrer">Open-Meteo</a> / Copernicus DEM GLO-90. These are measured cross-sections through the summit, not camera-view silhouettes. Heights are normalized to fit the design.</p><p>Worldwide services require internet access and are subject to availability and provider limits. Search terms and selected coordinates are sent to these providers. The illustrated library and export need no API key.</p><p>Fonts: Cinzel, Cormorant Garamond, and DM Sans, distributed under the SIL Open Font License. Fonts are bundled locally; exported lettering becomes vector paths.</p>`));

syncControls(); renderList(); icons();
async function initFonts() {
  try {
    const loaded = await Promise.all([cinzelURL, cormorantURL, sansURL].map(async url => {
      const r = await fetch(url); if (!r.ok) throw new Error('Font asset could not be loaded.');
      return opentype.parse(await r.arrayBuffer());
    }));
    fonts = { cinzel: loaded[0], cormorant: loaded[1], sans: loaded[2] };
    renderDesign();
  } catch { $('#design-preview').innerHTML = '<text x="500" y="480" text-anchor="middle" fill="#d9c8aa" font-size="25">Could not load the lettering.</text><text x="500" y="530" text-anchor="middle" fill="#d9c8aa" font-size="20">Reload the page to try again.</text>'; toast('Font assets failed to load. Please reload the page.'); }
}
void initFonts();
