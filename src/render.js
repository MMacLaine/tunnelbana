// Canvas overlay renderer for the game layer ONLY: the basemap lives in MapLibre
// underneath, every number and panel lives in the DOM (plan §7). All positions are
// projected per frame through the active projector (map.project when the basemap
// is up, a static equirectangular fallback when offline).

import { ANCHORS, LINE, WATER, TEASE } from './data.js';
import { stationCap, usedAnchors, endStation } from './sim.js';

const COL = {
  bg: '#0b0f14',
  water: '#0e1a29',
  ink: '#e9eef4',
  muted: '#8b98a6',
  ghost: '#5a6673',
  amber: '#d9a441',
  red: '#c25549',
  trainText: '#08130c',
};

let canvas, ctx, dpr;
let W = 0, H = 0;
let basemap = 'off'; // 'pending' | 'on' | 'off'; fallback water draws only when off
let drag = null;   // {x, y, end, snap, cost, problem} set by main.js each move
let floats = [];   // {geo, text, age}
let clockT = 0;    // render-local time for idle animations

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

export function addFloatGeo(geo, text) {
  floats.push({ geo, text, age: 0 });
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
  return (weight ? weight + ' ' : '') + size + 'px ui-monospace, "SF Mono", Menlo, monospace';
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
  ctx.font = 'italic ' + mono(10);
  ctx.fillStyle = COL.ghost;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(TEASE.label, lp.x, lp.y);
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
    const isHot = i === hot;
    ctx.beginPath();
    ctx.arc(p.x, p.y, isHot ? 8 : 5, 0, Math.PI * 2);
    ctx.setLineDash(isHot ? [] : [2, 3]);
    ctx.lineWidth = isHot ? 2.5 : 1.5;
    ctx.strokeStyle = isHot ? COL.ink : COL.ghost;
    ctx.stroke();
    ctx.setLineDash([]);
    if (isHot || namesAtRest) {
      ctx.font = mono(isHot ? 12 : 10);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(a.name).width;
      ctx.fillStyle = 'rgba(11, 15, 20, 0.55)';
      ctx.fillRect(p.x + 10, p.y - 7, tw + 8, 14);
      ctx.fillStyle = isHot ? COL.ink : COL.ghost;
      ctx.fillText(a.name, p.x + 14, p.y);
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

  ctx.font = mono(12, 'bold');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = ok ? COL.amber : COL.red;
  ctx.fillText(drag.label, to.x + 14, to.y - 10);
}

// Waiting passengers as dots, Mini Metro style: rows of pips left of the station.
function drawWaitingDots(g, i, p) {
  const n = Math.floor(g.waiting[i]);
  const shown = Math.min(n, 18);
  const nearFull = n >= stationCap(g) * g.line[i].mult * 0.75;
  ctx.fillStyle = nearFull ? COL.amber : COL.muted;
  for (let k = 0; k < shown; k++) {
    const row = Math.floor(k / 6);
    const col = k % 6;
    ctx.beginPath();
    ctx.arc(p.x - 18 - col * 7, p.y - 7 + row * 7, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
  if (n > shown) {
    ctx.font = mono(9);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('+' + (n - shown), p.x - 18 - 6 * 7, p.y);
  }
}

function drawStations(g, P) {
  ctx.textBaseline = 'middle';
  for (let i = 0; i < g.line.length; i++) {
    const p = P[i];
    const terminus = i === 0 || i === g.line.length - 1;

    ctx.beginPath();
    ctx.arc(p.x, p.y, terminus ? 6.5 : 5, 0, Math.PI * 2);
    ctx.fillStyle = COL.bg;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = COL.ink;
    ctx.stroke();

    ctx.font = mono(12);
    ctx.fillStyle = terminus ? COL.ink : COL.muted;
    ctx.textAlign = 'left';
    // A soft plate behind labels keeps them readable over the basemap.
    const name = g.line[i].name;
    const tw = ctx.measureText(name).width;
    ctx.fillStyle = 'rgba(11, 15, 20, 0.55)';
    ctx.fillRect(p.x + 12, p.y - 8, tw + 8, 16);
    ctx.fillStyle = terminus ? COL.ink : COL.muted;
    ctx.fillText(name, p.x + 16, p.y);

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
    ctx.beginPath();
    ctx.roundRect(x - 14, y - 8, 28, 16, 5);
    ctx.fillStyle = LINE.color;
    ctx.fill();
    ctx.fillStyle = COL.trainText;
    ctx.font = mono(9, 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(run.onboard), x, y + 0.5);
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
  ctx.font = mono(13, 'bold');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const f of floats) {
    f.age += dt;
    const p = project(f.geo);
    ctx.globalAlpha = Math.max(0, 1 - f.age / 1.2);
    ctx.fillStyle = COL.amber;
    ctx.fillText(f.text, p.x + 22, p.y - 12 - f.age * 22);
  }
  ctx.globalAlpha = 1;
}

export function draw(g, dt) {
  clockT += dt;
  ctx.clearRect(0, 0, W, H);
  if (basemap === 'off') drawWaterFallback();
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
