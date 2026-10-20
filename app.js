// neufox's Rec Editor: UI. Format and edit operations live in rec.js (window.Rec).
'use strict';

const SA_BOUNDS = [[-3000, -3000], [3000, 3000]];
const LAYER_COLOURS = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#facc15', '#fb7185', '#2dd4bf', '#c084fc'];
const SPEED_STOPS = [[0, '#3b82f6'], [0.25, '#22c55e'], [0.5, '#eab308'], [0.75, '#f97316'], [1, '#ef4444']];
const SPEED_BUCKETS = 12;
const UNDO_LIMIT = 60;

const $ = id => document.getElementById(id);
const ICON_PLAY = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" fill="currentColor"/></svg>';

const state = {
  layers: [],
  active: -1,
  cur: 0, // current frame index of the active layer
  time: 0, // playback time (ms) of the active layer
  sel: null, // [a, b] frame indices, active layer
  playing: false,
  rate: 1,
  scope: 'selection',
  view: null, // timeline window [t0, t1] in ms
  nextId: 1,
};

let map, renderer;
let ghost, ghostArrow, dragHandle, startLabel, endLabel;
let selectionLine = null;
let pointsLayer = null;

// ── Layers ─────────────────────────────────────────────────────────────────
function activeLayer() { return state.layers[state.active] || null; }
function activeRec() { const l = activeLayer(); return l ? l.rec : null; }

function addLayer(rec, makeActive = true, unsaved = false) {
  const layer = {
    id: state.nextId++,
    rec,
    colour: LAYER_COLOURS[(state.nextId - 2) % LAYER_COLOURS.length],
    visible: true,
    undo: [],
    redo: [],
    cleanAt: unsaved ? -1 : 0, // undo depth matching the file on disk
    get dirty() { return this.undo.length !== this.cleanAt; },
    group: null,
  };
  state.layers.push(layer);
  if (makeActive || state.active < 0) setActive(state.layers.length - 1, true);
  else refreshAll();
  return layer;
}

function setActive(index, fit) {
  state.active = index;
  state.sel = null;
  state.cur = 0;
  const rec = activeRec();
  state.time = rec && rec.frames.length ? rec.frames[0].t : 0;
  state.view = null;
  stopPlayback();
  refreshAll();
  if (fit) fitPath();
}

function removeLayer(index) {
  const l = state.layers[index];
  if (l.dirty && !confirm(`Close ${l.rec.name} without downloading your changes?`)) return;
  if (l.group) map.removeLayer(l.group);
  state.layers.splice(index, 1);
  if (!state.layers.length) { state.active = -1; refreshAll(); return; }
  setActive(Math.min(index, state.layers.length - 1), false);
}

// ── Undo ───────────────────────────────────────────────────────────────────
function snapshot(rec) { return { frames: rec.frames.map(f => ({ ...f })), name: rec.name }; }

// Run an edit on the active recording with undo support.
function edit(label, fn, opts = {}) {
  const layer = activeLayer();
  if (!layer) return toast('Open a recording first', true);
  const before = snapshot(layer.rec);
  try {
    const msg = fn(layer.rec);
    pushUndo(layer, label, before);
    clampState();
    if (!opts.keepSel) state.sel = state.sel ? clampRange(state.sel) : null;
    refreshAll();
    toast(msg || label);
  } catch (err) {
    layer.rec.frames = before.frames;
    toast(err.message || String(err), true);
  }
}

function undo() {
  const l = activeLayer();
  if (!l || !l.undo.length) return toast('Nothing to undo');
  const step = l.undo.pop();
  l.redo.push({ label: step.label, data: snapshot(l.rec) });
  l.rec.frames = step.data.frames; l.rec.name = step.data.name;
  clampState(); refreshAll(); toast(`Undid: ${step.label}`);
}
function redo() {
  const l = activeLayer();
  if (!l || !l.redo.length) return toast('Nothing to redo');
  const step = l.redo.pop();
  l.undo.push({ label: step.label, data: snapshot(l.rec) });
  l.rec.frames = step.data.frames; l.rec.name = step.data.name;
  clampState(); refreshAll(); toast(`Redid: ${step.label}`);
}

function pushUndo(layer, label, data) {
  layer.undo.push({ label, data });
  if (layer.cleanAt > layer.undo.length - 1) layer.cleanAt = -1; // saved state is no longer reachable by redo
  if (layer.undo.length > UNDO_LIMIT) { layer.undo.shift(); layer.cleanAt--; }
  layer.redo.length = 0;
}

function clampRange([a, b]) {
  const n = activeRec().frames.length;
  return [Math.min(a, n - 1), Math.min(b, n - 1)];
}
function clampState() {
  const rec = activeRec();
  if (!rec) return;
  state.cur = Math.max(0, Math.min(rec.frames.length - 1, state.cur));
  state.time = rec.frames[state.cur].t;
}

// ── Loading / saving ─────────────────────────────────────────────────────
// After opening several files: first of the batch active, map fitted to all of them.
function finishBatch(firstIndex, count) {
  if (count < 2) return;
  setActive(firstIndex, false);
  const pts = state.layers.slice(firstIndex).flatMap(l => l.rec.frames.map(ll));
  if (pts.length) map.stop();
  map.fitBounds(L.latLngBounds(pts).pad(0.1), { maxZoom: 4, animate: false });
}

async function openFiles(fileList) {
  const first = state.layers.length;
  for (const file of fileList) {
    try {
      const rec = file.name.toLowerCase().endsWith('.csv')
        ? Rec.fromCSV(await file.text(), file.name)
        : Rec.parse(await file.arrayBuffer(), file.name);
      addLayer(rec, true);
      toast(`Opened ${file.name}: ${rec.frames.length} frames`);
    } catch (err) {
      toast(err.message || String(err), true);
    }
  }
  finishBatch(first, state.layers.length - first);
}

async function loadUrls(urls) {
  const first = state.layers.length;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const name = decodeURIComponent(url.split('/').pop());
      addLayer(Rec.parse(await res.arrayBuffer(), name), true);
    } catch (err) {
      toast(err.message || String(err), true);
    }
  }
  finishBatch(first, state.layers.length - first);
  if (state.layers.length - first > 1) toast(`Opened ${state.layers.length - first} recordings`);
}

// samples/index.json lists the bundled recordings: ["file.rec", ...]
async function sampleList() {
  try {
    const res = await fetch('samples/index.json', { cache: 'no-cache' });
    const list = res.ok ? await res.json() : [];
    return Array.isArray(list) ? list.filter(n => typeof n === 'string' && n) : [];
  } catch { return []; }
}
async function loadSamples() {
  const list = await sampleList();
  if (!list.length) return toast('No samples bundled', true);
  await loadUrls(list.map(n => `samples/${encodeURIComponent(n)}`));
}

function download(name, bytes, type) {
  const blob = new Blob([bytes], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function recFileName(rec) { return /\.rec$/i.test(rec.name) ? rec.name : `${rec.name}.rec`; }

function downloadLayer(layer) {
  const errors = Rec.validate(layer.rec).filter(i => i.level === 'error');
  if (errors.length && !confirm(`${layer.rec.name} has ${errors.length} error(s) (see Issues). Download anyway?`)) return;
  download(recFileName(layer.rec), Rec.serialize(layer.rec), 'application/octet-stream');
  layer.cleanAt = layer.undo.length;
  renderLayerSelect();
  renderLayersPane();
}

// ── Map ────────────────────────────────────────────────────────────────────
function ll(f) { return [f.y, f.x]; }

function initMap() {
  map = L.map('map', { crs: L.CRS.Simple, center: [0, 0], zoom: -1, minZoom: -5, maxZoom: 7, zoomControl: true, attributionControl: false, zoomSnap: 0.25 });
  L.imageOverlay('samap.png', SA_BOUNDS).addTo(map);
  map.fitBounds(SA_BOUNDS);
  renderer = L.canvas({ padding: 0.5, tolerance: 6 });
  new ResizeObserver(() => map.invalidateSize({ pan: false })).observe($('map'));

  ghost = L.circleMarker([0, 0], { renderer, radius: 7, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1, interactive: false });
  ghostArrow = L.marker([0, 0], {
    interactive: false, keyboard: false, zIndexOffset: 900,
    icon: L.divIcon({ className: 'ghost-icon', iconSize: [44, 44], iconAnchor: [22, 22], html: '<svg class="ghost-arrow" viewBox="0 0 44 44"><path d="M22 1 L29 13 L22 10 L15 13 Z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>' }),
  });
  dragHandle = L.marker([0, 0], {
    draggable: true, keyboard: false, zIndexOffset: 1000, title: 'Drag to move this frame',
    icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="drag-handle"></div>' }),
  });
  startLabel = L.marker([0, 0], { interactive: false, icon: L.divIcon({ className: '', iconSize: null, iconAnchor: [-6, 8], html: '<div class="end-label">START</div>' }) });
  endLabel = L.marker([0, 0], { interactive: false, icon: L.divIcon({ className: '', iconSize: null, iconAnchor: [-6, 8], html: '<div class="end-label">END</div>' }) });

  let dragBase = null, dragUndo = null, dragOrigin = null, dragRaf = 0;
  dragHandle.on('dragstart', () => {
    const rec = activeRec();
    if (!rec) return;
    stopPlayback();
    dragUndo = snapshot(rec);
    dragBase = rec.frames.map(f => ({ ...f }));
    dragOrigin = [dragBase[state.cur].x, dragBase[state.cur].y];
  });
  dragHandle.on('drag', e => {
    const rec = activeRec();
    if (!rec || !dragBase) return;
    const p = e.target.getLatLng();
    Rec.softMove(rec, state.cur, p.lng - dragOrigin[0], p.lat - dragOrigin[1], 0, Number($('drag-radius').value) || 0, dragBase);
    if (!dragRaf) dragRaf = requestAnimationFrame(() => { dragRaf = 0; renderPaths(); renderCursor(false); });
  });
  dragHandle.on('dragend', () => {
    const layer = activeLayer();
    if (!layer || !dragUndo) return;
    pushUndo(layer, 'Move frame', dragUndo);
    dragBase = dragUndo = null;
    refreshAll();
  });

  map.on('mousemove', e => {
    $('coords-display').textContent = `x: ${e.latlng.lng.toFixed(2)}  y: ${e.latlng.lat.toFixed(2)}`;
  });
  map.on('click', onMapClick);
  map.on('zoomend', () => { if ($('toggle-points').checked) renderPaths(); });
}

function speedColour(u) {
  u = Math.max(0, Math.min(1, u));
  for (let i = 1; i < SPEED_STOPS.length; i++) {
    const [p1, c1] = SPEED_STOPS[i];
    if (u <= p1) {
      const [p0, c0] = SPEED_STOPS[i - 1];
      return mix(c0, c1, (u - p0) / (p1 - p0));
    }
  }
  return SPEED_STOPS[SPEED_STOPS.length - 1][1];
}
function mix(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function maxKmhOf(rec) {
  let m = 1;
  for (const f of rec.frames) { const k = Rec.speedKmh(f); if (k > m) m = k; }
  return m;
}

function renderPaths() {
  state.layers.forEach((layer, i) => {
    if (layer.group) map.removeLayer(layer.group);
    layer.group = null;
    if (!layer.visible || !layer.rec.frames.length) return;
    const g = L.layerGroup();
    const fr = layer.rec.frames;
    if (i === state.active) {
      // speed-coloured runs
      const max = maxKmhOf(layer.rec);
      let run = [ll(fr[0])], bucket = -1;
      const flush = () => { if (run.length > 1) g.addLayer(L.polyline(run, { renderer, color: speedColour(bucket / (SPEED_BUCKETS - 1)), weight: 4, opacity: 0.95, interactive: false })); };
      for (let k = 1; k < fr.length; k++) {
        const b = Math.round((Rec.speedKmh(fr[k]) / max) * (SPEED_BUCKETS - 1));
        if (b !== bucket && run.length > 1) { flush(); run = [run[run.length - 1]]; }
        bucket = b;
        run.push(ll(fr[k]));
      }
      flush();
      g.addLayer(L.polyline(fr.map(ll), { renderer, color: '#000', weight: 9, opacity: 0.0001 })); // wide hit area
      if ($('toggle-points').checked && map.getZoom() >= 2) {
        const bounds = map.getBounds().pad(0.2);
        for (let k = 0; k < fr.length; k++) {
          const p = ll(fr[k]);
          if (!bounds.contains(p)) continue;
          g.addLayer(L.circleMarker(p, { renderer, radius: 2.5, color: '#111', weight: 1, fillColor: '#fff', fillOpacity: 1, interactive: false }));
        }
      }
      legend(max);
    } else {
      g.addLayer(L.polyline(fr.map(ll), { renderer, color: layer.colour, weight: 3, opacity: 0.8, dashArray: '6 6', interactive: false }));
    }
    g.addTo(map);
    layer.group = g;
  });

  if (selectionLine) { map.removeLayer(selectionLine); selectionLine = null; }
  const rec = activeRec();
  if (rec && state.sel) {
    const [a, b] = state.sel;
    selectionLine = L.polyline(rec.frames.slice(a, b + 1).map(ll), { renderer, color: '#d946ef', weight: 12, opacity: 0.55, lineCap: 'butt', interactive: false }).addTo(map);
    selectionLine.bringToBack();
  }
  if (rec && rec.frames.length) {
    startLabel.setLatLng(ll(rec.frames[0])).addTo(map);
    endLabel.setLatLng(ll(rec.frames[rec.frames.length - 1])).addTo(map);
  } else {
    startLabel.remove(); endLabel.remove();
  }
}

function legend(max) {
  const stops = SPEED_STOPS.map(([p, c]) => `${c} ${p * 100}%`).join(', ');
  $('speed-legend').innerHTML = `Speed<div class="bar" style="background:linear-gradient(90deg, ${stops})"></div><div class="ends"><span>0</span><span>${max.toFixed(0)} km/h</span></div><div class="sel-key"><i></i>selection</div>`;
}

// Position at playback time (interpolated) for a smooth ghost.
function interpolated(rec, t) {
  const fr = rec.frames;
  const i = frameAtTime(rec, t);
  const a = fr[i], b = fr[Math.min(fr.length - 1, i + 1)];
  const u = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, heading: Rec.heading(a) };
}

function frameAtTime(rec, t) {
  const fr = rec.frames;
  let lo = 0, hi = fr.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (fr[mid].t <= t) lo = mid; else hi = mid - 1; }
  return lo;
}

function renderCursor(pan) {
  const rec = activeRec();
  if (!rec || !rec.frames.length) { ghost.remove(); ghostArrow.remove(); dragHandle.remove(); return; }
  const p = state.playing ? interpolated(rec, state.time) : { ...rec.frames[state.cur], heading: Rec.heading(rec.frames[state.cur]) };
  const pos = [p.y, p.x];
  ghost.setLatLng(pos).addTo(map);
  ghostArrow.setLatLng(pos).addTo(map);
  const el = ghostArrow.getElement();
  if (el) el.querySelector('svg').style.transform = `rotate(${-p.heading}deg)`;
  if (state.playing) dragHandle.remove();
  else if (!dragHandle._map || !dragHandle.dragging || !dragHandle.dragging._draggable || !dragHandle.dragging._draggable._moving) dragHandle.setLatLng(pos).addTo(map);
  if (pan || $('toggle-follow').checked) {
    if (!map.getBounds().pad(-0.25).contains(pos)) map.panTo(pos, { animate: !state.playing });
  }
}

function fitPath() {
  const rec = activeRec();
  if (!rec || !rec.frames.length) return;
  const b = L.latLngBounds(rec.frames.map(ll));
  map.stop();
  map.fitBounds(b.pad(0.15), { maxZoom: 4, animate: false });
}

function nearestFrame(rec, latlng, maxPx) {
  const target = map.latLngToContainerPoint(latlng);
  let best = -1, bestD = maxPx * maxPx;
  const fr = rec.frames;
  for (let i = 0; i < fr.length; i++) {
    const p = map.latLngToContainerPoint(ll(fr[i]));
    const d = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function onMapClick(e) {
  const rec = activeRec();
  if (!rec) return;
  let i = nearestFrame(rec, e.latlng, 16);
  if (i < 0) {
    // clicking another layer's path makes it active
    for (let k = 0; k < state.layers.length; k++) {
      const l = state.layers[k];
      if (k === state.active || !l.visible) continue;
      const j = nearestFrame(l.rec, e.latlng, 12);
      if (j >= 0) { setActive(k, false); seek(j); return; }
    }
    return;
  }
  if (e.originalEvent.shiftKey) {
    const anchor = state.sel ? state.sel[0] : state.cur;
    state.sel = anchor <= i ? [anchor, i] : [i, anchor];
  }
  seek(i);
}

// ── Navigation / playback ────────────────────────────────────────────────
function seek(i, opts = {}) {
  const rec = activeRec();
  if (!rec) return;
  state.cur = Math.max(0, Math.min(rec.frames.length - 1, i));
  state.time = rec.frames[state.cur].t;
  renderCursor(opts.pan);
  renderFramePane();
  renderSelectionInfo();
  if (opts.paths !== false) renderPaths();
  drawTimeline();
}

let lastTick = 0;
function togglePlayback() {
  if (state.playing) return stopPlayback();
  const rec = activeRec();
  if (!rec || rec.frames.length < 2) return;
  if (state.cur >= rec.frames.length - 1) seek(0);
  state.playing = true;
  $('btn-play').innerHTML = ICON_PAUSE;
  lastTick = performance.now();
  requestAnimationFrame(tick);
}
function stopPlayback() {
  if (!state.playing) return;
  state.playing = false;
  $('btn-play').innerHTML = ICON_PLAY;
  const rec = activeRec();
  if (rec) seek(frameAtTime(rec, state.time));
}
function tick(now) {
  if (!state.playing) return;
  const rec = activeRec();
  if (!rec) return stopPlayback();
  state.time += (now - lastTick) * state.rate;
  lastTick = now;
  const end = rec.frames[rec.frames.length - 1].t;
  if (state.time >= end) { state.time = end; state.cur = rec.frames.length - 1; stopPlayback(); return; }
  const i = frameAtTime(rec, state.time);
  if (i !== state.cur) { state.cur = i; renderFramePane(); }
  renderCursor(false);
  drawTimeline();
  requestAnimationFrame(tick);
}

// ── Timeline ─────────────────────────────────────────────────────────────
const tl = { canvas: null, ctx: null, w: 0, h: 0, dragging: null };

function initTimeline() {
  tl.canvas = $('tl-canvas');
  tl.ctx = tl.canvas.getContext('2d');
  new ResizeObserver(() => drawTimeline()).observe(tl.canvas);

  const timeAt = ev => {
    const r = tl.canvas.getBoundingClientRect();
    const [t0, t1] = viewWindow();
    return t0 + ((ev.clientX - r.left) / r.width) * (t1 - t0);
  };
  tl.canvas.addEventListener('pointerdown', ev => {
    const rec = activeRec();
    if (!rec) return;
    tl.canvas.setPointerCapture(ev.pointerId);
    stopPlayback();
    const i = frameAtTime(rec, timeAt(ev));
    if (ev.shiftKey) { tl.dragging = { mode: 'select', anchor: state.sel && ev.shiftKey ? state.sel[0] : i }; state.sel = [Math.min(tl.dragging.anchor, i), Math.max(tl.dragging.anchor, i)]; }
    else if (ev.button === 1 || ev.altKey) { tl.dragging = { mode: 'pan', x: ev.clientX, view: viewWindow() }; return; }
    else tl.dragging = { mode: 'seek' };
    seek(i, { paths: !!ev.shiftKey });
  });
  tl.canvas.addEventListener('pointermove', ev => {
    const rec = activeRec();
    if (!rec || !tl.dragging) return;
    if (tl.dragging.mode === 'pan') {
      const r = tl.canvas.getBoundingClientRect();
      const [t0, t1] = tl.dragging.view;
      const dt = ((ev.clientX - tl.dragging.x) / r.width) * (t1 - t0);
      state.view = [t0 - dt, t1 - dt];
      drawTimeline();
      return;
    }
    const i = frameAtTime(rec, timeAt(ev));
    if (tl.dragging.mode === 'select') {
      const a = tl.dragging.anchor;
      state.sel = [Math.min(a, i), Math.max(a, i)];
      seek(i, { paths: false });
      renderPathsSoon();
    } else seek(i, { paths: false });
  });
  const end = () => { if (tl.dragging && tl.dragging.mode === 'select') renderPaths(); tl.dragging = null; };
  tl.canvas.addEventListener('pointerup', end);
  tl.canvas.addEventListener('pointercancel', end);
  tl.canvas.addEventListener('wheel', ev => {
    const rec = activeRec();
    if (!rec) return;
    ev.preventDefault();
    const [t0, t1] = viewWindow();
    const r = tl.canvas.getBoundingClientRect();
    const u = (ev.clientX - r.left) / r.width;
    const at = t0 + u * (t1 - t0);
    const k = Math.exp(ev.deltaY * 0.0015);
    const span = Math.max(200, (t1 - t0) * k);
    state.view = [at - u * span, at - u * span + span];
    drawTimeline();
  }, { passive: false });
}

let pathsRaf = 0;
function renderPathsSoon() { if (!pathsRaf) pathsRaf = requestAnimationFrame(() => { pathsRaf = 0; renderPaths(); }); }

function viewWindow() {
  const rec = activeRec();
  if (!rec || !rec.frames.length) return [0, 1];
  if (state.view) return state.view;
  const fr = rec.frames;
  return [fr[0].t, Math.max(fr[0].t + 1, fr[fr.length - 1].t)];
}

function graphValue(rec, i, kind) {
  const f = rec.frames[i];
  if (kind === 'z') return f.z;
  if (kind === 'interval') return i ? f.t - rec.frames[i - 1].t : 0;
  return Rec.speedKmh(f);
}

function drawTimeline() {
  const c = tl.canvas;
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const ctx = tl.ctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#12141b';
  ctx.fillRect(0, 0, w, h);
  const rec = activeRec();
  if (!rec || !rec.frames.length) { $('tl-time').textContent = '–'; return; }
  const fr = rec.frames;
  const [t0, t1] = viewWindow();
  const X = t => ((t - t0) / (t1 - t0)) * w;
  const top = 16, bottom = h - 4, gh = bottom - top;

  // ticks
  const span = t1 - t0;
  const steps = [100, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000];
  const step = steps.find(s => (s / span) * w >= 70) || 600000;
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textBaseline = 'top';
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    const x = Math.round(X(t)) + 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    ctx.fillStyle = '#7c8db5';
    ctx.fillText(fmtTime(t), x + 3, 2);
  }

  // selection
  if (state.sel) {
    const xa = X(fr[state.sel[0]].t), xb = X(fr[state.sel[1]].t);
    ctx.fillStyle = 'rgba(249,115,22,0.16)';
    ctx.fillRect(xa, top, Math.max(2, xb - xa), gh);
    ctx.fillStyle = '#f97316';
    ctx.fillRect(xa - 1, top, 2, gh);
    ctx.fillRect(xb - 1, top, 2, gh);
  }

  // graph
  const kind = $('graph-kind').value;
  const ia = Math.max(0, frameAtTime(rec, t0) - 1), ib = Math.min(fr.length - 1, frameAtTime(rec, t1) + 1);
  let lo = Infinity, hi = -Infinity;
  for (let i = ia; i <= ib; i++) { const v = graphValue(rec, i, kind); if (v < lo) lo = v; if (v > hi) hi = v; }
  if (kind !== 'z') lo = Math.min(0, lo);
  if (hi - lo < 1e-6) hi = lo + 1;
  const Y = v => bottom - ((v - lo) / (hi - lo)) * (gh - 4);
  const stride = Math.max(1, Math.floor((ib - ia) / (w * 2)));
  ctx.beginPath();
  ctx.moveTo(X(fr[ia].t), bottom);
  for (let i = ia; i <= ib; i += stride) ctx.lineTo(X(fr[i].t), Y(graphValue(rec, i, kind)));
  ctx.lineTo(X(fr[ib].t), Y(graphValue(rec, ib, kind)));
  ctx.lineTo(X(fr[ib].t), bottom);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, 'rgba(249,115,22,0.45)');
  grad.addColorStop(1, 'rgba(249,115,22,0.04)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  for (let i = ia; i <= ib; i += stride) { const x = X(fr[i].t), y = Y(graphValue(rec, i, kind)); if (i === ia) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.fillStyle = '#7c8db5';
  ctx.textBaseline = 'top';
  const unit = kind === 'z' ? ' m' : kind === 'interval' ? ' ms' : ' km/h';
  ctx.fillText(`${hi.toFixed(kind === 'z' ? 1 : 0)}${unit}`, 4, top + 2);

  // issue markers
  for (const iss of (activeLayer().issues || [])) {
    if (iss.frame < 0 || iss.frame >= fr.length) continue;
    const x = X(fr[iss.frame].t);
    if (x < 0 || x > w) continue;
    ctx.fillStyle = iss.level === 'error' ? '#ef4444' : '#eab308';
    ctx.fillRect(x - 1, bottom - 6, 2, 6);
  }

  // playhead
  const px = Math.round(X(state.time)) + 0.5;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(px, top - 4); ctx.lineTo(px, bottom); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(px - 5, top - 8); ctx.lineTo(px + 5, top - 8); ctx.lineTo(px, top - 2); ctx.closePath(); ctx.fill();
  const label = `#${state.cur} · ${fmtTime(state.time - fr[0].t)}`;
  ctx.font = '600 10px "JetBrains Mono", monospace';
  const lw = ctx.measureText(label).width + 8;
  const lx = Math.min(Math.max(px + 6, 2), w - lw - 2);
  ctx.fillStyle = 'rgba(15,17,23,0.85)';
  ctx.fillRect(lx, top + 2, lw, 15);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, lx + 4, top + 4);

  $('tl-time').textContent = `${fmtTime(state.time - fr[0].t)} / ${fmtTime(fr[fr.length - 1].t - fr[0].t)}`;
}

function fmtTime(ms) {
  const s = ms / 1000;
  if (Math.abs(s) < 60) return `${s.toFixed(s < 10 ? 2 : 1)} s`;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

// ── Side panes ───────────────────────────────────────────────────────────
function renderFramePane() {
  const rec = activeRec();
  const insp = $('inspector');
  if (!rec || !rec.frames.length) {
    $('frame-index').textContent = '–'; $('frame-count').textContent = '–';
    insp.innerHTML = '<div class="muted">No recording open.</div>';
    $('stats').innerHTML = '';
    return;
  }
  const f = rec.frames[state.cur];
  $('frame-index').textContent = state.cur;
  $('frame-count').textContent = rec.frames.length - 1;
  $('frame-goto').max = rec.frames.length - 1;

  const fields = inspectorFields(rec);
  const focused = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.field;
  if (insp.dataset.type !== String(rec.type) || insp.dataset.train !== String(Rec.isTrainLike(rec))) {
    buildInspector(rec, fields);
  }
  for (const key of fields) {
    const input = insp.querySelector(`input[data-field="${key}"]`);
    if (!input || key === focused) continue;
    input.value = formatField(key, Rec.getFrameField(f, key));
  }
  const kmh = Rec.speedKmh(f);
  const ro = insp.querySelector('[data-readonly="kmh"]');
  if (ro) ro.value = kmh.toFixed(1);
  const dt = insp.querySelector('[data-readonly="dt"]');
  if (dt) dt.value = state.cur ? f.t - rec.frames[state.cur - 1].t : 0;
  const rel = insp.querySelector('[data-readonly="rel"]');
  if (rel) rel.value = ((f.t - rec.frames[0].t) / 1000).toFixed(3);
}

function inspectorFields(rec) {
  const keys = Rec.LAYOUT[rec.type].map(([k]) => k);
  const out = ['t', 'x', 'y', 'z', 'heading', 'qw', 'qx', 'qy', 'qz', 'vx', 'vy', 'vz'];
  if (rec.type === Rec.TYPE_DRIVER && Rec.isTrainLike(rec)) out.push('trainSpeed');
  for (const k of keys) if (!out.includes(k) && !(k === 'extra' && Rec.isTrainLike(rec))) out.push(k);
  return out;
}

function formatField(key, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
  const step = (Rec.FIELD_INFO[key] || [])[2] || 1;
  if (step >= 1) return String(Math.round(v * 100) / 100);
  return v.toFixed(key === 'heading' ? 2 : step < 0.01 ? 5 : 4);
}

function buildInspector(rec, fields) {
  const insp = $('inspector');
  insp.dataset.type = rec.type;
  insp.dataset.train = String(Rec.isTrainLike(rec));
  const groups = new Map();
  groups.set('Timing', [
    `<div class="insp-field readonly"><label>Since start (s)</label><input class="num" data-readonly="rel" readonly></div>`,
    `<div class="insp-field readonly"><label>Gap (ms)</label><input class="num" data-readonly="dt" readonly></div>`,
  ]);
  for (const key of fields) {
    const [label, group, step] = Rec.FIELD_INFO[key] || [key, 'Other', 1];
    if (!groups.has(group)) groups.set(group, []);
    if (key === 'vz') {
      groups.get(group).push(`<div class="insp-field readonly"><label>Speed (km/h)</label><input class="num" data-readonly="kmh" readonly></div>`);
    }
    groups.get(group).push(
      `<div class="insp-field"><label><span>${label}</span><button class="apply-sel" data-apply="${key}" title="Apply this value to the whole selection">⇉ sel</button></label>` +
      `<input class="num" type="number" step="${step}" data-field="${key}"></div>`
    );
  }
  insp.innerHTML = [...groups].map(([g, items]) => `<div><div class="insp-group-title">${g}</div><div class="insp-grid">${items.join('')}</div></div>`).join('');
  insp.querySelectorAll('input[data-field]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.field;
      const v = Number(input.value);
      if (!Number.isFinite(v)) return;
      edit(`Set ${key}`, r => { Rec.setFrameField(r, r.frames[state.cur], key, v); if (key === 't') Rec.fixTimestamps(r); }, { keepSel: true });
    });
  });
  insp.querySelectorAll('[data-apply]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.apply;
      if (!state.sel) return toast('Select frames first (Edit tab or Shift+drag the timeline)', true);
      const v = Rec.getFrameField(activeRec().frames[state.cur], key);
      const [a, b] = state.sel;
      edit(`Set ${key} on ${b - a + 1} frames`, r => Rec.setField(r, a, b, key, v), { keepSel: true });
    });
  });
}

function renderStats() {
  const rec = activeRec();
  if (!rec) { $('stats').innerHTML = ''; return; }
  const s = Rec.stats(rec);
  const cells = [
    ['Type', rec.type === Rec.TYPE_DRIVER ? (Rec.isTrainLike(rec) ? 'driver · train' : 'driver') : 'on foot'],
    ['Duration', fmtTime(s.duration)],
    ['Distance', s.distance >= 1000 ? `${(s.distance / 1000).toFixed(2)} km` : `${s.distance.toFixed(0)} m`],
    ['Max speed', `${s.maxKmh.toFixed(0)} km/h`],
    ['Avg speed', `${s.avgKmh.toFixed(0)} km/h`],
    ['Frame gap', `${s.interval} ms`],
  ];
  $('stats').innerHTML = cells.map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v" title="${v}">${v}</div></div>`).join('');
}

function renderSelectionInfo() {
  const rec = activeRec();
  if (!rec || !state.sel) { $('selection-info').textContent = 'Nothing selected'; return; }
  const [a, b] = state.sel;
  const dur = rec.frames[b].t - rec.frames[a].t;
  $('selection-info').textContent = `frames ${a}–${b} (${b - a + 1}) · ${fmtTime(dur)}`;
  const d = $('retime-duration');
  if (document.activeElement !== d) d.value = (dur / 1000).toFixed(2);
}

function renderLayersPane() {
  const list = $('layer-list');
  list.innerHTML = '';
  state.layers.forEach((l, i) => {
    const s = Rec.stats(l.rec);
    const el = document.createElement('div');
    el.className = `layer${i === state.active ? ' active' : ''}${l.dirty ? ' dirty' : ''}`;
    el.innerHTML = `
      <div class="layer-top">
        <span class="swatch" style="background:${i === state.active ? 'linear-gradient(90deg,#3b82f6,#eab308,#ef4444)' : l.colour}"></span>
        <input class="layer-name" value="${escapeHtml(l.rec.name)}" spellcheck="false">
        <label class="toggle" title="Show on map"><input type="checkbox" ${l.visible ? 'checked' : ''}></label>
      </div>
      <div class="layer-meta">${l.rec.type === 1 ? 'driver' : 'on foot'} · ${s.frames} frames · ${fmtTime(s.duration)}</div>
      <div class="layer-actions">
        <button class="btn small" data-l="up" title="Move up">↑</button>
        <button class="btn small" data-l="down" title="Move down">↓</button>
        <button class="btn small" data-l="dup">Duplicate</button>
        <button class="btn small" data-l="save">Download</button>
        <button class="btn small danger" data-l="close">Close</button>
      </div>`;
    el.addEventListener('click', ev => { if (ev.target === el || ev.target.classList.contains('layer-meta')) { if (i !== state.active) setActive(i, true); } });
    el.querySelector('.layer-name').addEventListener('change', ev => {
      const name = ev.target.value.trim() || l.rec.name;
      pushUndo(l, 'Rename', snapshot(l.rec));
      l.rec.name = name; refreshAll();
    });
    el.querySelector('.layer-name').addEventListener('focus', () => { if (i !== state.active) setActive(i, false); });
    el.querySelector('input[type=checkbox]').addEventListener('change', ev => { l.visible = ev.target.checked; renderPaths(); renderSeams(); });
    el.querySelectorAll('[data-l]').forEach(btn => btn.addEventListener('click', ev => {
      ev.stopPropagation();
      const act = btn.dataset.l;
      if (act === 'up' && i > 0) { [state.layers[i - 1], state.layers[i]] = [state.layers[i], state.layers[i - 1]]; state.active = i === state.active ? i - 1 : state.active === i - 1 ? i : state.active; refreshAll(); }
      if (act === 'down' && i < state.layers.length - 1) { [state.layers[i + 1], state.layers[i]] = [state.layers[i], state.layers[i + 1]]; state.active = i === state.active ? i + 1 : state.active === i + 1 ? i : state.active; refreshAll(); }
      if (act === 'dup') addLayer(Rec.cloneRec(l.rec, l.rec.name.replace(/(\.rec)?$/i, '_copy.rec')), true, true);
      if (act === 'save') downloadLayer(l);
      if (act === 'close') removeLayer(i);
    }));
    list.appendChild(el);
  });
  if (!state.layers.length) list.innerHTML = '<div class="muted">No recordings open.</div>';
  renderSeams();
}

function renderSeams() {
  const box = $('seams');
  const vis = state.layers.filter(l => l.visible);
  if (vis.length < 2) { box.innerHTML = ''; return; }
  const seams = Rec.seams(vis.map(l => l.rec), true);
  box.innerHTML = `<div class="group-title">Joins (end → next start, Layers order)</div>` +
    seams.map(s => `<div class="seam${s.distance > 2 ? ' bad' : ''}"><span>${escapeHtml(short(s.from))} → ${escapeHtml(short(s.to))}</span><span class="d">${s.distance.toFixed(2)} m</span></div>`).join('');
}
function short(name) { return name.replace(/\.rec$/i, ''); }

function renderIssues() {
  const layer = activeLayer();
  const list = $('issue-list');
  const badge = $('issue-badge');
  if (!layer) { list.innerHTML = ''; badge.classList.add('hidden'); return; }
  const issues = Rec.validate(layer.rec);
  layer.issues = issues;
  badge.textContent = issues.length;
  badge.classList.toggle('hidden', !issues.length);
  badge.classList.toggle('error', issues.some(i => i.level === 'error'));
  if (!issues.length) { list.innerHTML = '<div class="no-issues">No problems found.</div>'; return; }
  list.innerHTML = '';
  const fixRow = document.createElement('div');
  fixRow.className = 'row';
  fixRow.innerHTML = '<button class="btn" data-action="fix-times">Fix timestamps</button>';
  list.appendChild(fixRow);
  for (const iss of issues) {
    const el = document.createElement('div');
    el.className = `issue ${iss.level}`;
    el.innerHTML = `<span class="lvl">${iss.level}</span><span class="fr">${iss.frame >= 0 ? '#' + iss.frame : ''}</span><span>${escapeHtml(iss.text)}</span>`;
    if (iss.frame >= 0) el.addEventListener('click', () => seek(iss.frame, { pan: true }));
    list.appendChild(el);
  }
}

function renderLayerSelect() {
  const sel = $('layer-select');
  sel.innerHTML = state.layers.map((l, i) => `<option value="${i}" ${i === state.active ? 'selected' : ''}>${escapeHtml(l.rec.name)}${l.dirty ? ' •' : ''}</option>`).join('');
  sel.classList.toggle('hidden', !state.layers.length);
  const src = $('concat-source');
  src.innerHTML = state.layers.map((l, i) => i === state.active ? '' : `<option value="${i}">${escapeHtml(l.rec.name)}</option>`).join('') || '<option value="">open another recording</option>';
}

function renderSetFieldOptions() {
  const rec = activeRec();
  const sel = $('setfield-name');
  const cur = sel.value;
  if (!rec) { sel.innerHTML = ''; return; }
  const fields = inspectorFields(rec).filter(k => k !== 't');
  sel.innerHTML = fields.map(k => `<option value="${k}">${(Rec.FIELD_INFO[k] || [k])[0]}</option>`).join('');
  if (fields.includes(cur)) sel.value = cur;
}

function refreshAll() {
  const has = state.layers.length > 0;
  $('empty-state').classList.toggle('hidden', has);
  document.body.classList.toggle('has-layers', has);
  renderLayerSelect();
  renderSetFieldOptions();
  renderStats();
  renderIssues();
  renderFramePane();
  renderSelectionInfo();
  renderLayersPane();
  renderPaths();
  renderCursor(false);
  drawTimeline();
}

// ── Actions ─────────────────────────────────────────────────────────────
function needSel() {
  if (!state.sel) throw new Error('Select frames first: Set in / Set out, or Shift+drag the timeline');
  return state.sel;
}
function scopeRange(rec) {
  if (state.scope === 'all' || !state.sel) return [0, rec.frames.length - 1];
  return state.sel;
}
function num(id, fallback = 0) { const v = Number($(id).value); return Number.isFinite(v) && $(id).value !== '' ? v : fallback; }

const actions = {
  'undo': undo,
  'redo': redo,
  'fit': fitPath,
  'tl-fit': () => { state.view = null; drawTimeline(); },
  'play': togglePlayback,
  'home': () => seek(0, { pan: true }),
  'end': () => { const r = activeRec(); if (r) seek(r.frames.length - 1, { pan: true }); },
  'prev': () => seek(state.cur - 1, { pan: true }),
  'next': () => seek(state.cur + 1, { pan: true }),
  'load-samples': loadSamples,
  'download-rec': () => { const l = activeLayer(); if (l) downloadLayer(l); closeMenus(); },
  'download-csv': () => { const r = activeRec(); if (r) download(r.name.replace(/\.rec$/i, '') + '.csv', Rec.toCSV(r), 'text/csv'); closeMenus(); },
  'download-all': () => { state.layers.forEach((l, i) => setTimeout(() => downloadLayer(l), i * 300)); closeMenus(); },
  'copy-spawn': () => { const r = activeRec(); if (r) copy(Rec.pawnSpawnLine(r.frames[state.cur])); },
  'copy-pos': () => { const r = activeRec(); if (!r) return; const f = r.frames[state.cur]; copy(`NPC_SetPos(npcid, ${f.x.toFixed(4)}, ${f.y.toFixed(4)}, ${f.z.toFixed(4)});\nNPC_SetFacingAngle(npcid, ${Rec.heading(f).toFixed(4)});`); },

  'mark-in': () => { const r = activeRec(); if (!r) return; state.sel = [state.cur, state.sel ? Math.max(state.cur, state.sel[1]) : r.frames.length - 1]; renderPaths(); renderSelectionInfo(); drawTimeline(); },
  'mark-out': () => { if (!activeRec()) return; state.sel = [state.sel ? Math.min(state.sel[0], state.cur) : 0, state.cur]; renderPaths(); renderSelectionInfo(); drawTimeline(); },
  'select-all': () => { const r = activeRec(); if (!r) return; state.sel = [0, r.frames.length - 1]; renderPaths(); renderSelectionInfo(); drawTimeline(); },
  'select-none': () => { state.sel = null; renderPaths(); renderSelectionInfo(); drawTimeline(); },

  'trim': () => edit('Trim to selection', r => { const [a, b] = needSel(); Rec.trim(r, a, b); state.cur = Math.max(0, state.cur - a); state.sel = null; return `Trimmed to ${b - a + 1} frames`; }),
  'delete': () => edit('Delete frames', r => { const [a, b] = needSel(); Rec.deleteRange(r, a, b); state.cur = Math.min(a, r.frames.length - 1); state.sel = null; return `Deleted ${b - a + 1} frames`; }),
  'duplicate': () => edit('Duplicate frames', r => { const [a, b] = needSel(); Rec.duplicateRange(r, a, b); state.sel = [b + 1, b + 1 + (b - a)]; return `Duplicated ${b - a + 1} frames`; }, { keepSel: true }),
  'hold': () => edit('Insert hold', r => { const s = num('hold-seconds', 5); const n = Rec.hold(r, state.cur, s * 1000); return `Holding ${s} s (${n} frames)`; }),
  'retime': () => edit('Retime', r => { const [a, b] = needSel(); const k = num('retime-factor', 1); Rec.retime(r, a, b, k); return `Retimed ×${k}`; }, { keepSel: true }),
  'retime-duration': () => edit('Retime', r => {
    const [a, b] = needSel();
    const cur = r.frames[b].t - r.frames[a].t;
    if (cur <= 0) throw new Error('Selection has no duration');
    const k = (num('retime-duration', cur / 1000) * 1000) / cur;
    Rec.retime(r, a, b, k);
    return `Selection now ${fmtTime(r.frames[b].t - r.frames[a].t)}`;
  }, { keepSel: true }),
  'smooth': () => edit('Smooth', r => { const [a, b] = scopeOrSel(r); Rec.smooth(r, a, b, num('smooth-radius', 3), num('smooth-passes', 2), $('smooth-vel').checked); return `Smoothed frames ${a}–${b}`; }, { keepSel: true }),
  'recompute-vel': () => edit('Recompute velocity', r => { const [a, b] = scopeOrSel(r); Rec.recomputeVelocity(r, a, b); return `Velocity recomputed for ${b - a + 1} frames`; }, { keepSel: true }),
  'setfield': () => edit('Set field', r => { const [a, b] = needSel(); const k = $('setfield-name').value; Rec.setField(r, a, b, k, num('setfield-value', 0)); return `Set ${k} on ${b - a + 1} frames`; }, { keepSel: true }),

  'offset': () => edit('Offset', r => { const [a, b] = scopeRange(r); Rec.offset(r, a, b, num('off-x'), num('off-y'), num('off-z')); return `Moved ${b - a + 1} frames`; }, { keepSel: true }),
  'move-to': () => edit('Move to', r => {
    const [a, b] = scopeRange(r);
    const f = r.frames[state.cur];
    const dx = $('to-x').value === '' ? 0 : num('to-x') - f.x;
    const dy = $('to-y').value === '' ? 0 : num('to-y') - f.y;
    const dz = $('to-z').value === '' ? 0 : num('to-z') - f.z;
    Rec.offset(r, a, b, dx, dy, dz);
    return `Moved by ${dx.toFixed(2)}, ${dy.toFixed(2)}, ${dz.toFixed(2)}`;
  }, { keepSel: true }),
  'rotate': () => edit('Rotate', r => {
    const [a, b] = scopeRange(r);
    const pivot = $('rot-pivot').value;
    const [px, py] = pivot === 'current' ? [r.frames[state.cur].x, r.frames[state.cur].y] : pivot === 'first' ? [r.frames[a].x, r.frames[a].y] : Rec.centroid(r, a, b);
    const deg = num('rot-deg', 0);
    Rec.rotate(r, a, b, deg, px, py);
    return `Rotated ${deg}°`;
  }, { keepSel: true }),
  'reverse': () => edit('Reverse', r => { const [a, b] = scopeRange(r); Rec.reverse(r, a, b, $('rev-turn').checked); return `Reversed frames ${a}–${b}`; }, { keepSel: true }),
  'resample': () => edit('Resample', r => { const ms = num('resample-ms', 100); const before = r.frames.length; Rec.resample(r, ms); state.sel = null; return `Resampled: ${before} → ${r.frames.length} frames`; }),
  'fix-times': () => edit('Fix timestamps', r => { const v = $('fix-start').value === '' ? null : num('fix-start'); const n = Rec.fixTimestamps(r, v); return n ? `Fixed ${n} timestamps` : 'Timestamps were already fine'; }, { keepSel: true }),
  'concat': () => {
    const i = Number($('concat-source').value);
    const other = state.layers[i];
    if (!other || $('concat-source').value === '') return toast('Open another recording to append', true);
    edit(`Append ${other.rec.name}`, r => { Rec.concat(r, other.rec, $('concat-gap').value === '' ? null : num('concat-gap'), $('concat-skip').checked); return `Appended ${other.rec.frames.length} frames`; }, { keepSel: true });
  },
};

function scopeOrSel(rec) { return state.sel || [0, rec.frames.length - 1]; }

function closeMenus() { document.querySelectorAll('details[open]').forEach(d => d.removeAttribute('open')); }

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch { prompt('Copy:', text); }
}

let toastTimer = 0;
function toast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), isError ? 4500 : 2400);
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ── Wiring ─────────────────────────────────────────────────────────────────
function initUi() {
  document.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) {
      if (!ev.target.closest('details')) closeMenus();
      return;
    }
    const fn = actions[btn.dataset.action];
    if (fn) fn();
  });

  for (const id of ['file-input', 'file-input-2']) {
    $(id).addEventListener('change', ev => { openFiles([...ev.target.files]); ev.target.value = ''; });
  }
  $('layer-select').addEventListener('change', ev => setActive(Number(ev.target.value), true));
  $('frame-goto').addEventListener('change', ev => seek(Number(ev.target.value) || 0, { pan: true }));
  $('play-rate').addEventListener('change', ev => { state.rate = Number(ev.target.value); });
  $('graph-kind').addEventListener('change', drawTimeline);
  $('toggle-points').addEventListener('change', renderPaths);
  $('toggle-follow').addEventListener('change', () => renderCursor(true));

  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab.dataset.tab));
    try { localStorage.setItem('rec-editor-tab', tab.dataset.tab); } catch { /* storage unavailable */ }
  }));
  try {
    const saved = localStorage.getItem('rec-editor-tab');
    if (saved) document.querySelector(`.tab[data-tab="${saved}"]`)?.click();
  } catch { /* storage unavailable */ }

  document.querySelectorAll('#scope .seg-btn').forEach(b => b.addEventListener('click', () => {
    state.scope = b.dataset.scope;
    document.querySelectorAll('#scope .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  }));


  // drag & drop anywhere
  let dragDepth = 0;
  window.addEventListener('dragenter', ev => { if (ev.dataTransfer?.types?.includes('Files')) { dragDepth++; $('drop-overlay').classList.remove('hidden'); } });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('drop-overlay').classList.add('hidden'); } });
  window.addEventListener('dragover', ev => ev.preventDefault());
  window.addEventListener('drop', ev => {
    ev.preventDefault();
    dragDepth = 0;
    $('drop-overlay').classList.add('hidden');
    if (ev.dataTransfer?.files?.length) openFiles([...ev.dataTransfer.files]);
  });

  window.addEventListener('beforeunload', ev => { if (state.layers.some(l => l.dirty)) { ev.preventDefault(); ev.returnValue = ''; } });

  document.addEventListener('keydown', ev => {
    const typing = ev.target instanceof Element && ev.target.matches('input, select, textarea');
    const ctrl = ev.ctrlKey || ev.metaKey;
    if (ctrl && ev.key.toLowerCase() === 'z') { ev.preventDefault(); return ev.shiftKey ? redo() : undo(); }
    if (ctrl && ev.key.toLowerCase() === 'y') { ev.preventDefault(); return redo(); }
    if (ctrl && ev.key.toLowerCase() === 's') { ev.preventDefault(); return actions['download-rec'](); }
    if (typing) return;
    if (ctrl && ev.key.toLowerCase() === 'a') { ev.preventDefault(); return actions['select-all'](); }
    const step = ev.shiftKey ? 10 : 1;
    switch (ev.key) {
      case ' ': ev.preventDefault(); togglePlayback(); break;
      case 'ArrowLeft': ev.preventDefault(); seek(state.cur - step, { pan: true }); break;
      case 'ArrowRight': ev.preventDefault(); seek(state.cur + step, { pan: true }); break;
      case 'Home': actions.home(); break;
      case 'End': actions.end(); break;
      case 'i': case 'I': actions['mark-in'](); break;
      case 'o': case 'O': actions['mark-out'](); break;
      case 'Escape': actions['select-none'](); break;
      case 'Delete': case 'Backspace': if (state.sel) actions.delete(); break;
      case 'f': case 'F': $('toggle-follow').checked = !$('toggle-follow').checked; renderCursor(true); break;
    }
  });
}

initMap();
initTimeline();
initUi();
refreshAll();
sampleList().then(list => { document.querySelectorAll('[data-action="load-samples"]').forEach(b => b.classList.toggle('hidden', !list.length)); });

// #load=samples/a.rec,samples/b.rec opens recordings served next to the page.
const hashLoad = new URLSearchParams(location.hash.slice(1)).get('load');
if (hashLoad) loadUrls(hashLoad.split(',').filter(Boolean));
