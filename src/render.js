// Canvas overlay renderer for the game layer ONLY: the basemap lives in MapLibre
// underneath, every number and panel lives in the DOM (plan §7). All positions are
// projected per frame through the active projector (map.project when the basemap
// is up, a static equirectangular fallback when offline).

import { ANCHORS, LINE, WATER, TEASE } from './data.js';
import { stationCap, usedAnchors, endStation, waitingAt } from './sim.js';

// Pass-01 design tokens (tokens.css is the CSS source of truth; canvas needs literals).
const COL = {
  bg: '#0b0f14',
  void: '#070a0e',
  water: '#091320',
  ink: '#e6edf4',
  muted: '#8996a5',
  ghost: '#5a6673',
  amber: '#e0a63c',
  red: '#c8544a',
  lineHi: 'rgba(44, 61, 80, 0.85)',
  plate: 'rgba(7, 10, 14, 0.62)',
  train1950: '#6f7f5e',
  trainInk: '#08130c',
  trainDetail: 'rgba(11, 15, 20, 0.55)',
};

let canvas, ctx, dpr;
let W = 0, H = 0;
let basemap = 'off'; // 'pending' | 'on' | 'off'; fallback water draws only when off
let drag = null;   // {x, y, end, snap, cost, problem} set by main.js each move
let floats = [];   // {geo, text, age}
let clockT = 0;    // render-local time for idle animations
let lastDrawAt = 0;

// --- Projection ---

const FB = { latMax: 59.3320, latMin: 59.2520, lonMin: 18.0400 };
const KM_PER_DEG = 111.32;
const COS_LAT = Math.cos(59.29 * Math.PI / 180);

function fallbackProject(geo) {
  const pxPerKm = H / ((FB.latMax - FB.latMin) * KM_PER_DEG);
  return {
    x: (geo[1] - FB.lonMin) * KM_PER_DEG * COS_LAT * pxPerKm,
    y: (FB.latMax - geo[0]) * KM_PER_DEG * pxPerKm,
  };
}

export function fallbackUnproject(p) {
  const pxPerKm = H / ((FB.latMax - FB.latMin) * KM_PER_DEG);
  return [
    FB.latMax - p.y / (KM_PER_DEG * pxPerKm),
    FB.lonMin + p.x / (KM_PER_DEG * COS_LAT * pxPerKm),
  ];
}

let projector = fallbackProject;

export function setProjector(fn) {
  projector = fn || fallbackProject;
}

export function setBasemap(state) {
  basemap = state;
}

export function project(geo) {
  return projector(geo);
}

// Current map scale, so hit radii mean ground distance instead of screen pixels.
export function pxPerKm() {
  const a = project([59.29, 18.08]);
  const b = project([59.29 + 1 / 111.32, 18.08]);
  return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function grabRadius() {
  return clamp(0.20 * pxPerKm(), 12, 30); // ~200 m of ground
}

export function snapRadius() {
  return clamp(0.25 * pxPerKm(), 14, 34); // ~250 m of ground
}

// --- Setup ---

export function init(el) {
  canvas = el;
  resize();
}

export function canvasEl() {
  return canvas;
}

export function resize() {
  const box = canvas.parentElement.getBoundingClientRect();
  W = Math.round(box.width);
  H = Math.round(box.height);
  dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// --- State from main.js ---

export function setDrag(d) {
  drag = d;
}

export function addFloatGeo(geo, text, colour) {
  floats.push({ geo, text, age: 0, colour: colour || 'amber' });
}

// --- Hit helpers (canvas px) ---

export function nearEnd(g, p) {
  const r = grabRadius();
  for (const end of ['head', 'tail']) {
    const s = project(endStation(g, end).geo);
    if (Math.hypot(p.x - s.x, p.y - s.y) < r) return end;
  }
  return null;
}

export function nearAnchor(g, p) {
  const used = usedAnchors(g);
  let best = null, bestD = snapRadius();
  ANCHORS.forEach((a, i) => {
    if (used.has(i)) return;
    const ap = project(a.geo);
    const d = Math.hypot(p.x - ap.x, p.y - ap.y);
    if (d < bestD) { best = i; bestD = d; }
  });
  return best;
}

// --- Drawing ---

function mono(size, weight) {
  return (weight ? weight + ' ' : '') + size + 'px "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace';
}

// Labels get a halo in void, never a plate (design doc §4). The one exception,
// the snapped anchor during a drag, passes plate: true because it must win
// against everything.
function label(text, x, y, colour, size, opts) {
  ctx.font = mono(size || 12, opts && opts.weight);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if (opts && opts.plate) {
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = COL.plate;
    ctx.fillRect(x - 4, y - (size || 12) * 0.7, tw + 8, (size || 12) * 1.4);
  } else {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COL.void;
    ctx.lineWidth = 3.5;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

// The earned map (report 624 §2, owner-approved): the basemap ships dimmed and is
// revealed within the catchment of built stations. The unbuilt city is a promise.
const VEIL = 'rgba(8, 11, 16, 0.78)';
const REVEAL_KM = 0.65; // catchment radius a station lights up

function drawVeil(g) {
  ctx.save();
  ctx.fillStyle = VEIL;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'destination-out';
  const r = Math.max(24, REVEAL_KM * pxPerKm());
  for (const s of g.line) {
    const p = project(s.geo);
    // Hard edge with a 3px feather (design doc §8): the edge is a decision.
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(Math.max(0, 1 - 3 / r), 'rgba(0, 0, 0, 1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // A 1px line-hi ring on the boundary so the edge reads as drawn, not smudged.
  ctx.strokeStyle = COL.lineHi;
  ctx.lineWidth = 1;
  for (const s of g.line) {
    const p = project(s.geo);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawWaterFallback() {
  for (const w of WATER) {
    ctx.beginPath();
    w.ring.forEach((pt, i) => {
      const p = project(pt);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = COL.water;
    ctx.fill();
  }
}

function drawTease() {
  const from = project(TEASE.from);
  const to = project(TEASE.to);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.setLineDash([3, 6]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = COL.ghost;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.setLineDash([]);
  const lp = project(TEASE.labelAt);
  label(TEASE.label, lp.x, lp.y, COL.ghost, 10);
}

// Unconnected anchors: the "logical spots", dashed rings, named at rest when
// zoomed close enough that the map should teach the mechanic on its own.
function drawAnchors(g) {
  const used = usedAnchors(g);
  const hot = drag ? drag.snap : null;
  const namesAtRest = pxPerKm() >= 60;
  ANCHORS.forEach((a, i) => {
    if (used.has(i)) return;
    const p = project(a.geo);
    if (i === hot) {
      // Snapped: ink ring with a core dot, and the one plate label in the game.
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = COL.ink;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = COL.ink;
      ctx.fill();
      label(a.name, p.x + 14, p.y, COL.ink, 12, { plate: true });
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = COL.ghost;
      ctx.stroke();
      ctx.setLineDash([]);
      if (namesAtRest) label(a.name, p.x + 12, p.y, COL.ghost, 11);
    }
  });
}

// The primary verb needs a visible handle: pulsing rings on both line ends.
function drawEndHandles(g) {
  if (g.line.length >= 2) {
    for (const end of ['head', 'tail']) {
      const p = project(endStation(g, end).geo);
      const r = 10.5 + Math.sin(clockT * 2.2) * 1.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = LINE.color;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function linePoints(g) {
  return g.line.map((s) => project(s.geo));
}

function drawLine(g, P) {
  ctx.beginPath();
  ctx.moveTo(P[0].x, P[0].y);
  for (let i = 1; i < P.length - 1; i++) {
    ctx.arcTo(P[i].x, P[i].y, P[i + 1].x, P[i + 1].y, 7);
  }
  ctx.lineTo(P[P.length - 1].x, P[P.length - 1].y);
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = LINE.color;
  ctx.stroke();
}

function drawDragPreview(g) {
  if (!drag) return;
  const from = project(endStation(g, drag.end).geo);
  const to = drag.snap !== null ? project(ANCHORS[drag.snap].geo) : { x: drag.x, y: drag.y };
  const ok = !drag.problem;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.setLineDash(drag.snap !== null ? [] : [5, 5]);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = ok ? LINE.color : COL.red;
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  label(drag.label, to.x + 14, to.y - 16, ok ? COL.amber : COL.red, 12, { weight: 600 });
}

// Waiting passengers, design doc §6: a dot is one unit of the displayed
// denomination, the denomination is printed as soon as it stops being one,
// and nothing is rounded away silently.
function drawWaitingDots(g, i, p) {
  const n = Math.floor(waitingAt(g, i));
  if (!n) return;
  let denom = 1;
  if (n > 180) denom = 100;
  else if (n > 18) denom = 10;
  const units = Math.max(1, Math.floor(n / denom));
  const shown = Math.min(units, 18);
  const sp = denom === 1 ? 7 : 8.5;
  const nearFull = n >= stationCap(g) * g.line[i].mult * 0.75;
  const colour = nearFull ? COL.amber : COL.muted;
  for (let k = 0; k < shown; k++) {
    const x = p.x - 18 - (k % 6) * sp;
    const y = p.y - 7 + Math.floor(k / 6) * sp;
    if (denom === 1) {
      ctx.beginPath();
      ctx.arc(x, y, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, denom === 10 ? 3.0 : 3.4, 0, Math.PI * 2);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = colour;
      ctx.stroke();
      if (denom === 100) {
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();
      }
    }
  }
  if (denom > 1) {
    ctx.textAlign = 'left';
    label('×' + denom, p.x - 18 - 6 * sp - 24, p.y, colour, 9);
  }
}

function drawStations(g, P) {
  ctx.textBaseline = 'middle';
  for (let i = 0; i < g.line.length; i++) {
    const p = P[i];
    const terminus = i === 0 || i === g.line.length - 1;
    const freeSpot = g.line[i].anchor === null;

    ctx.beginPath();
    ctx.arc(p.x, p.y, terminus ? 6.5 : 5, 0, Math.PI * 2);
    ctx.fillStyle = COL.bg;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = freeSpot && !terminus ? COL.muted : COL.ink;
    ctx.stroke();
    if (freeSpot) {
      // Invented place, not a real one: a small core marks it (design doc §4).
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = COL.muted;
      ctx.fill();
    }

    label(g.line[i].name, p.x + 13, p.y, terminus ? COL.ink : COL.muted, 12);
    drawWaitingDots(g, i, p);
  }
}

function drawTrains(g, P) {
  for (const train of g.trains) {
    if (!train.run) continue;
    const run = train.run;
    const a = P[run.from];
    const b = P[run.from + run.dir];
    if (!a || !b) continue;
    const f = Math.min(1, run.t / run.dur);
    const x = a.x + (b.x - a.x) * f;
    const y = a.y + (b.y - a.y) * f;
    // 1950 stock: olive, boxy (r 2.5), three roof vents (design doc §5).
    ctx.beginPath();
    ctx.roundRect(x - 14, y - 8, 28, 16, 2.5);
    ctx.fillStyle = COL.train1950;
    ctx.fill();
    ctx.fillStyle = COL.trainDetail;
    ctx.fillRect(x - 9, y - 5, 4, 3);
    ctx.fillRect(x - 2, y - 5, 4, 3);
    ctx.fillRect(x + 5, y - 5, 4, 3);
    ctx.fillStyle = COL.trainInk;
    ctx.font = mono(9, 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(run.onboard), x, y + 2.5);
  }
  // Idle trains wait as pips beside their station.
  const idleAt = {};
  for (const train of g.trains) if (!train.run) idleAt[train.at] = (idleAt[train.at] || 0) + 1;
  ctx.fillStyle = LINE.color;
  for (const [idx, n] of Object.entries(idleAt)) {
    const p = P[idx];
    if (!p) continue;
    for (let k = 0; k < n; k++) {
      ctx.beginPath();
      ctx.arc(p.x + 6 + k * 9, p.y - 14, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFloats(dt) {
  floats = floats.filter((f) => f.age < 1.2);
  ctx.font = mono(13, 600);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const f of floats) {
    f.age += dt;
    const p = project(f.geo);
    ctx.globalAlpha = Math.max(0, 1 - f.age / 1.2);
    ctx.fillStyle = f.colour === 'muted' ? COL.muted : COL.amber;
    ctx.fillText(f.text, p.x + 22, p.y - 12 - f.age * 22);
  }
  ctx.globalAlpha = 1;
}

// draw() computes its own dt so it can be called from BOTH the game's rAF loop and
// the basemap's render event (the latter keeps the overlay locked to the map during
// pans and zooms; drawing with our own frame's camera lags the tiles by a frame).
export function draw(g) {
  const now = performance.now();
  const dt = lastDrawAt ? Math.min(0.1, (now - lastDrawAt) / 1000) : 0;
  lastDrawAt = now;
  clockT += dt;
  ctx.clearRect(0, 0, W, H);
  if (basemap === 'off') drawWaterFallback();
  if (basemap === 'on') drawVeil(g);
  drawTease();
  drawAnchors(g);
  const P = linePoints(g);
  drawLine(g, P);
  drawEndHandles(g);
  drawDragPreview(g);
  drawStations(g, P);
  drawTrains(g, P);
  drawFloats(dt);
}
