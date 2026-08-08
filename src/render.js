// Canvas renderer for the game layer ONLY: the basemap lives in MapLibre
// underneath (the canvas is uploaded into the map's GL frame as a custom
// layer), every number and panel lives in the DOM (plan §7). All positions are
// projected per frame through the active projector.

import { ANCHORS, CORRIDORS, LINE, WATER } from './data.js';
import { EGGS } from './facts.js';
import {
  stationCap, usedAnchorsOnLine, usedAnchorsAll, linesAtAnchor,
  endStation, waitingAt, trainPos, anchorRevealed, teaseVisible, corridorOf, dayPhase,
  buildRadiusNow, stakeLine,
} from './sim.js';

// Pass-01 design tokens (tokens.css is the CSS source of truth; canvas needs
// literals). Dark is the designed theme; light is a TESTING aid (owner ask),
// derived pragmatically, not a design-team deliverable yet.
const THEMES = {
  dark: {
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
    veil: 'rgba(7, 10, 14, 0.78)',
    glowAlpha: 0.09,
    politic: '#9b8cc9',
    silver: '#c9ced6',
    gold: '#e8b64e',
  },
  light: {
    bg: '#f4f6f8',
    void: '#ffffff',
    water: '#c9dded',
    ink: '#17202a',
    muted: '#5a6673',
    ghost: '#97a2ae',
    amber: '#9a6b16',
    red: '#b23a30',
    lineHi: 'rgba(52, 68, 86, 0.75)',
    plate: 'rgba(255, 255, 255, 0.72)',
    train1950: '#6f7f5e',
    trainInk: '#08130c',
    trainDetail: 'rgba(255, 255, 255, 0.4)',
    // A grey scrim, not a white one: white on positron reads as nothing.
    veil: 'rgba(96, 112, 128, 0.42)',
    glowAlpha: 0.18,
    politic: '#6b5aa8',
    silver: '#8b93a1',
    // Pass 04 ships one gold; on paper this is --tb-gold-deep, which follows
    // the glow palette's rule that light theme takes the deeper step.
    gold: '#b8862c',
  },
};
let COL = THEMES.dark;

export function setTheme(name) {
  COL = THEMES[name] || THEMES.dark;
}

// Base visible reach. Was 0.65: owner playtest 2026-08-04 read the default
// circle as too generous; a bare Hållplats starts modest and the growth per
// tier/entrance is steeper, so buying reach is what makes the circle big.
const REVEAL_KM = 0.4;

// A station's visible reach grows with tier and entrances: the upgrade you
// bought is the circle you see.
function stationRevealKm(st) {
  return REVEAL_KM * (1 + 0.25 * (st.tier - 1) + 0.2 * st.ent);
}

function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const gc = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${gc}, ${b}, ${a})`;
}

let canvas, ctx, dpr;
let W = 0, H = 0;
let basemap = 'off'; // 'pending' | 'on' | 'off'; fallback water draws only when off
let drag = null;   // {x, y, li, end, snap, cost, problem, label} set by main.js
let floats = [];   // {geo, text, age, colour}
let selected = null; // {li, i} | null
let clockT = 0;
let lastDrawAt = 0;

export function setSelected(sel) {
  selected = sel;
}

// --- Projection ---

const FB = { latMax: 59.3320, latMin: 59.2520, lonMin: 18.0400 };
const KM_PER_DEG = 111.32;
const COS_LAT = Math.cos(59.29 * Math.PI / 180);

function fallbackProject(geo) {
  const pxPerKmV = H / ((FB.latMax - FB.latMin) * KM_PER_DEG);
  return {
    x: (geo[1] - FB.lonMin) * KM_PER_DEG * COS_LAT * pxPerKmV,
    y: (FB.latMax - geo[0]) * KM_PER_DEG * pxPerKmV,
  };
}

export function fallbackUnproject(p) {
  const pxPerKmV = H / ((FB.latMax - FB.latMin) * KM_PER_DEG);
  return [
    FB.latMax - p.y / (KM_PER_DEG * pxPerKmV),
    FB.lonMin + p.x / (KM_PER_DEG * COS_LAT * pxPerKmV),
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

export function pxPerKm() {
  const a = project([59.29, 18.08]);
  const b = project([59.29 + 1 / 111.32, 18.08]);
  return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function grabRadius() {
  return clamp(0.20 * pxPerKm(), 12, 30);
}

export function snapRadius() {
  return clamp(0.25 * pxPerKm(), 14, 34);
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

// Returns { li, end } for the nearest grabbable line end, or null.
export function nearEnd(g, p) {
  const r = grabRadius();
  let best = null, bestD = r;
  for (let li = 0; li < g.lines.length; li++) {
    for (const end of ['head', 'tail']) {
      const s = project(endStation(g, li, end).geo);
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < bestD) { best = { li, end }; bestD = d; }
    }
  }
  return best;
}

// --- Insert-station affordance (v12, pass 04 section e): a ghost node on a
// segment midpoint, main.js decides legality and sets the hover. ---
let insertHover = null; // { geo, label, ok } | null

export function setInsertHover(h) {
  insertHover = h;
}

// Nearest segment midpoint on any line, or null. A segment too short on
// screen offers nothing: the ghost never crowds the nodes it sits between.
export function nearInsert(g, p) {
  const r = grabRadius();
  let best = null, bestD = r;
  for (let li = 0; li < g.lines.length; li++) {
    const sts = g.lines[li].stations;
    for (let seg = 0; seg < sts.length - 1; seg++) {
      const a = project(sts[seg].geo);
      const b = project(sts[seg + 1].geo);
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (Math.hypot(m.x - a.x, m.y - a.y) < r * 1.6) continue;
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < bestD) { best = { li, seg }; bestD = d; }
    }
  }
  return best;
}

// Nearest built station on any line, for selection.
export function nearStation(g, p) {
  const r = grabRadius();
  let best = null, bestD = r;
  for (let li = 0; li < g.lines.length; li++) {
    g.lines[li].stations.forEach((st, i) => {
      const sp = project(st.geo);
      const d = Math.hypot(p.x - sp.x, p.y - sp.y);
      if (d < bestD) { best = { li, i }; bestD = d; }
    });
  }
  return best;
}

// Nearest anchor NOT already on the given line (anchors on other lines are
// legal: that is an interchange).
export function nearAnchor(g, p, li) {
  const used = li === null ? usedAnchorsAll(g) : usedAnchorsOnLine(g, li);
  let best = null, bestD = snapRadius();
  ANCHORS.forEach((a, i) => {
    if (used.has(i) || !anchorRevealed(g, i)) return;
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

// Labels get a halo in void, never a plate (design doc §4); the snapped anchor
// during a drag is the one exception.
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

function drawVeil(g) {
  ctx.save();
  ctx.fillStyle = COL.veil;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'destination-out';
  const ppk = pxPerKm();
  for (const L of g.lines) {
    for (const s of L.stations) {
      const r = Math.max(24, stationRevealKm(s) * ppk);
      const p = project(s.geo);
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      grad.addColorStop(Math.max(0, 1 - 3 / r), 'rgba(0, 0, 0, 1)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.strokeStyle = COL.lineHi;
  ctx.lineWidth = 1;
  for (const L of g.lines) {
    for (const s of L.stations) {
      const r = Math.max(24, stationRevealKm(s) * ppk);
      const p = project(s.geo);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// The subtle catchment glow (owner ask): a soft tint of the line's colour over
// each station's reach, so the served area reads at a glance in both themes.
function drawGlow(g) {
  const ppk = pxPerKm();
  for (const L of g.lines) {
    for (const s of L.stations) {
      const r = Math.max(24, stationRevealKm(s) * ppk);
      const p = project(s.geo);
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      const ga = COL.glowAlpha || 0.09;
      grad.addColorStop(0, hexA(L.color, ga));
      grad.addColorStop(0.7, hexA(L.color, ga * 0.55));
      grad.addColorStop(1, hexA(L.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Each corridor may carry a tease: the dashed promise of where history goes
// next, drawn until the corridor's first anchor is built.
function drawTease(g) {
  for (const c of CORRIDORS) {
    if (!teaseVisible(g, c)) continue;
    const from = project(c.tease.from);
    const to = project(c.tease.to);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.setLineDash([3, 6]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = COL.ghost;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.setLineDash([]);
    const lp = project(c.tease.labelAt);
    label(c.tease.label, lp.x, lp.y, COL.ghost, 10);
  }
}

// Every revealed unbuilt anchor is a STAKE: the one offer its corridor is
// making right now (at most one per open corridor). It used to be a faint
// dashed ghost, unlabeled below a zoom threshold, which is how players missed
// that the game was pointing somewhere (live feedback, "the game should lead
// you more"). It now breathes like the line-end handles do, keeps its name
// on, and draws a dashed leader from the railhead, so the whole gesture --
// grab here, drop there -- is on the map before the player touches anything.
function drawAnchors(g) {
  const used = usedAnchorsAll(g);
  const hot = drag ? drag.snap : null;
  ANCHORS.forEach((a, i) => {
    if ((used.has(i) || !anchorRevealed(g, i)) && i !== hot) return;
    const p = project(a.geo);
    if (i === hot) {
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
      // The stake wears its OWNING line's colour (live feedback 2026-08-08:
      // players could not tell which line a stake continues), falling back
      // to ink for a corridor's first, unowned anchor.
      const ownerLi = stakeLine(g, i);
      const colStake = ownerLi !== null ? g.lines[ownerLi].color : COL.ink;
      const c = corridorOf(i);
      if (c && i > c.start && used.has(i - 1)) {
        const q = project(ANCHORS[i - 1].geo);
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(p.x, p.y);
        ctx.setLineDash([3, 6]);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = colStake;
        ctx.globalAlpha = 0.55;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }
      const pulse = 0.5 + 0.5 * Math.sin(clockT * 2.2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 + pulse * 2.5, 0, Math.PI * 2);
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1.5 + pulse * 0.8;
      ctx.strokeStyle = colStake;
      ctx.globalAlpha = 0.45 + 0.5 * pulse;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      label(a.name, p.x + 13, p.y, COL.ink, 11);
    }
  });
}

function drawEndHandles(g) {
  for (let li = 0; li < g.lines.length; li++) {
    if (g.lines[li].stations.length < 1) continue;
    for (const end of ['head', 'tail']) {
      const p = project(endStation(g, li, end).geo);
      const r = 10.5 + Math.sin(clockT * 2.2) * 1.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = g.lines[li].color;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function linePoints(L) {
  return L.stations.map((s) => project(s.geo));
}

// Trunk segments served by several lines draw side by side (a small
// perpendicular offset per service), the Mini Metro read for a branch. Train
// dots keep the true geometry and run between the strokes; acceptable.
function stKey(s) {
  return s.anchor !== null ? 'a' + s.anchor : s.geo[0].toFixed(4) + ',' + s.geo[1].toFixed(4);
}

function segKey(a, b) {
  const ka = stKey(a), kb = stKey(b);
  return ka < kb ? ka + '|' + kb : kb + '|' + ka;
}

function drawAllLines(g) {
  const owners = new Map(); // segKey -> [line indices, ascending]
  g.lines.forEach((L, li) => {
    for (let i = 0; i + 1 < L.stations.length; i++) {
      const k = segKey(L.stations[i], L.stations[i + 1]);
      if (!owners.has(k)) owners.set(k, []);
      owners.get(k).push(li);
    }
  });
  g.lines.forEach((L, li) => {
    if (L.stations.length < 2) return;
    const P = linePoints(L);
    let shared = false;
    for (let i = 0; i + 1 < L.stations.length; i++) {
      if (owners.get(segKey(L.stations[i], L.stations[i + 1])).length > 1) { shared = true; break; }
    }
    if (!shared) { drawLinePath(P, L.color); return; }
    // Per-segment strokes so shared stretches can shift sideways; the smooth
    // arcTo corners only exist on unshared lines, a fair trade for legibility.
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = L.color;
    for (let i = 0; i + 1 < L.stations.length; i++) {
      const list = owners.get(segKey(L.stations[i], L.stations[i + 1]));
      const off = list.length > 1 ? (list.indexOf(li) - (list.length - 1) / 2) * 7 : 0;
      let ax = P[i].x, ay = P[i].y, bx = P[i + 1].x, by = P[i + 1].y;
      if (off) {
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const nx = (-(by - ay) / len) * off, ny = ((bx - ax) / len) * off;
        ax += nx; ay += ny; bx += nx; by += ny;
      }
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  });
}

function drawLinePath(P, color) {
  ctx.beginPath();
  ctx.moveTo(P[0].x, P[0].y);
  for (let i = 1; i < P.length - 1; i++) {
    ctx.arcTo(P[i].x, P[i].y, P[i + 1].x, P[i + 1].y, 7);
  }
  ctx.lineTo(P[P.length - 1].x, P[P.length - 1].y);
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawDragPreview(g) {
  if (!drag) return;
  const from = project(endStation(g, drag.li, drag.end).geo);
  const to = drag.snap !== null ? project(ANCHORS[drag.snap].geo) : { x: drag.x, y: drag.y };
  // The city's edge: while a drag approaches or crosses the region plan's
  // radius, the boundary shows itself, so the refusal has a visible shape.
  {
    const centre = project(ANCHORS[0].geo);
    const rPx = buildRadiusNow(g) * pxPerKm();
    if (Math.hypot(to.x - centre.x, to.y - centre.y) > rPx * 0.82) {
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, rPx, 0, Math.PI * 2);
      ctx.setLineDash([4, 8]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = drag.problem === 'far' ? COL.red : COL.ghost;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }
  }
  const ok = !drag.problem;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.setLineDash(drag.snap !== null ? [] : [5, 5]);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = ok ? (g.lines[drag.li].color || LINE.color) : COL.red;
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  label(drag.label, to.x + 14, to.y - 16, ok ? COL.amber : COL.red, 12, { weight: 600 });
}

// Waiting passengers, design doc §6: dot/ring/cored-ring denominations, the
// denomination printed as soon as it stops being one. Line 2's queue sits a
// step lower so interchange platforms stay readable.
function drawWaitingDots(g, li, i, p) {
  const n = Math.floor(waitingAt(g, li, i));
  if (!n) return;
  let denom = 1;
  if (n > 180) denom = 100;
  else if (n > 18) denom = 10;
  const units = Math.max(1, Math.floor(n / denom));
  const shown = Math.min(units, 18);
  const sp = denom === 1 ? 7 : 8.5;
  const yBase = p.y - 7 + li * 12;
  const nearFull = n >= stationCap(g) * g.lines[li].stations[i].mult * 0.75;
  const colour = nearFull ? COL.amber : COL.muted;
  for (let k = 0; k < shown; k++) {
    const x = p.x - 18 - (k % 6) * sp;
    const y = yBase + Math.floor(k / 6) * sp;
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
    label('×' + denom, p.x - 18 - 6 * sp - 24, yBase + 4, colour, 9);
  }
}

function drawStations(g) {
  ctx.textBaseline = 'middle';
  const labelled = new Set();
  for (let li = 0; li < g.lines.length; li++) {
    const L = g.lines[li];
    const P = linePoints(L);
    for (let i = 0; i < L.stations.length; i++) {
      const p = P[i];
      const s = L.stations[i];
      const terminus = i === 0 || i === L.stations.length - 1;
      const freeSpot = s.anchor === null;
      const interchange = s.anchor !== null && linesAtAnchor(g, s.anchor) >= 2;

      ctx.beginPath();
      ctx.arc(p.x, p.y, terminus ? 6.5 : 5, 0, Math.PI * 2);
      ctx.fillStyle = COL.bg;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = freeSpot && !terminus ? COL.muted : COL.ink;
      ctx.stroke();
      if (s.hub || interchange) {
        // Hub/interchange (design doc §4): outer hairline ring plus a core.
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9.5, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = COL.ink;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = COL.ink;
        ctx.fill();
      }
      if (freeSpot) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = COL.muted;
        ctx.fill();
      }

      const key = s.anchor !== null ? 'a' + s.anchor : s.name;
      if (!labelled.has(key)) {
        labelled.add(key);
        label(s.name, p.x + 13, p.y, terminus ? COL.ink : COL.muted, 12);
      }
      drawWaitingDots(g, li, i, p);
    }
  }
}

// Selected station (design doc §4): ink ring plus four amber ticks at the
// compass points.
function drawSelected(g) {
  if (!selected) return;
  const st = g.lines[selected.li]?.stations[selected.i];
  if (!st) return;
  const p = project(st.geo);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COL.ink;
  ctx.stroke();
  ctx.strokeStyle = COL.amber;
  ctx.lineWidth = 2;
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    ctx.beginPath();
    ctx.moveTo(p.x + dx * 10, p.y + dy * 10);
    ctx.lineTo(p.x + dx * 14, p.y + dy * 14);
    ctx.stroke();
  }
}

function drawSurge(g) {
  if (!g.surge || g.clock >= g.surge.until) return;
  const s = g.lines[g.surge.line].stations[g.surge.idx];
  if (!s) return;
  const p = project(s.geo);
  const r = 13 + Math.sin(clockT * 5) * 2.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = COL.amber;
  ctx.globalAlpha = 0.9;
  ctx.stroke();
  ctx.globalAlpha = 1;
  label('RUSH HOUR', p.x + 14, p.y + 14, COL.amber, 10, { weight: 600 });
}

// --- Curiosities (pass 03 section e): a faint politic diamond that rewards
// noticing and never reads as a task. Silverpilen is a TRAIN: at night it
// glides the green line's geometry, unlisted, unlabeled, silver. ---

// Where Silverpilen is right now (parametric on the wall clock, so it drifts
// the whole line over ~40 s and vanishes at dawn). Null when it does not run.
function silverpilenPos(g) {
  if (dayPhase(g) !== 3 || g.lines[0].stations.length < 3) return null;
  const L = g.lines[0];
  const f = (clockT % 40) / 40 * (L.stations.length - 1);
  const i = Math.min(L.stations.length - 2, Math.floor(f));
  const a = project(L.stations[i].geo);
  const b = project(L.stations[i + 1].geo);
  const t = f - i;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Visible, unfound curiosities with their screen positions.
export function eggMarks(g) {
  const used = usedAnchorsAll(g);
  const out = [];
  for (const e of EGGS) {
    if (g.eggs[e.id] || !e.needs(used)) continue;
    if (e.id === 'silverpilen') {
      const p = silverpilenPos(g);
      if (p) out.push({ id: e.id, x: p.x, y: p.y, train: true });
      continue;
    }
    const p = project(e.geo);
    out.push({ id: e.id, x: p.x, y: p.y });
  }
  return out;
}

export function nearEgg(g, p) {
  for (const m of eggMarks(g)) {
    if (Math.hypot(p.x - m.x, p.y - m.y) < (m.train ? 18 : 12)) return m.id;
  }
  return null;
}

function drawEggs(g) {
  for (const m of eggMarks(g)) {
    if (m.train) {
      // Silverpilen: the 1950 train shape, silver, no rider count, no fuss.
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.roundRect(m.x - 14, m.y - 8, 28, 16, 2.5);
      ctx.fillStyle = COL.silver;
      ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    const s = 6.5;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(Math.PI / 4);
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = COL.politic;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(-s, -s, s * 2, s * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(m.x, m.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = COL.politic;
    ctx.globalAlpha = 0.8;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// --- The golden train (v12): glides its line end to end over the visible
// window, glowing softly. Spotting it is the game; the glow says LOOK, the
// click is the catch, and missing it costs nothing. ---

function goldScreenPos(g) {
  if (!g.gold || g.clock >= g.gold.until) return null;
  const L = g.lines[g.gold.line];
  if (!L || L.stations.length < 2) return null;
  const f = Math.min(1, (g.clock - g.gold.from) / (g.gold.until - g.gold.from)) * (L.stations.length - 1);
  const i = Math.min(L.stations.length - 2, Math.floor(f));
  const a = project(L.stations[i].geo);
  const b = project(L.stations[i + 1].geo);
  const t = f - i;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function nearGold(g, p) {
  const m = goldScreenPos(g);
  return !!(m && Math.hypot(p.x - m.x, p.y - m.y) < 22);
}

function drawGold(g) {
  const m = goldScreenPos(g);
  if (!m) return;
  // Pass 04's cue timing (tb-gold-pulse): a 2.4s soft swell from .55 to full,
  // never a hard blink.
  const pulse = 0.5 + 0.5 * Math.sin(clockT * (Math.PI * 2 / 2.4));
  ctx.beginPath();
  ctx.arc(m.x, m.y, 15 + pulse * 3, 0, Math.PI * 2);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = COL.gold;
  ctx.globalAlpha = 0.55 + 0.45 * pulse;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.roundRect(m.x - 14, m.y - 8, 28, 16, 2.5);
  ctx.fillStyle = COL.gold;
  ctx.fill();
  ctx.fillStyle = COL.trainDetail;
  ctx.fillRect(m.x - 9, m.y - 5, 4, 3);
  ctx.fillRect(m.x - 2, m.y - 5, 4, 3);
  ctx.fillRect(m.x + 5, m.y - 5, 4, 3);
}

// The incident marker per pass 03 section e: AMBER family, a pulsing halo
// with a warning tick — attention, never alarm (the first cut was red, which
// the design explicitly rules out). Real signage wording: SIGNALFEL is what
// the platform displays actually say.
function drawIncident(g) {
  if (!g.incident || g.clock >= g.incident.until) return;
  const p = project(g.incident.geo);
  const r = 12 + Math.sin(clockT * 4) * 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = COL.amber;
  ctx.globalAlpha = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(clockT * 4));
  ctx.stroke();
  ctx.globalAlpha = 1;
  // The warning tick, inside the halo above the station glyph.
  ctx.strokeStyle = COL.amber;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 7.5);
  ctx.lineTo(p.x, p.y - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y - 1.8, 0.9, 0, Math.PI * 2);
  ctx.fillStyle = COL.amber;
  ctx.fill();
  label('SIGNALFEL', p.x + 14, p.y + 14, COL.amber, 10, { weight: 600 });
}

function drawTrains(g) {
  for (const train of g.trains) {
    if (!train.run) continue;
    const L = g.lines[train.line];
    const run = train.run;
    // Position from the sim's accel/dwell physics: dots brake into platforms
    // and visibly sit while boarding (report 634 §2a).
    const pos = trainPos(g, train);
    const a = project(L.stations[pos.from].geo);
    const bSt = L.stations[pos.to];
    if (!bSt) continue;
    const b = project(bSt.geo);
    const x = a.x + (b.x - a.x) * pos.f;
    const y = a.y + (b.y - a.y) * pos.f;
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
    ctx.fillText(String(Math.round(run.onboard)), x, y + 2.5);
  }
  // Idle trains wait as pips beside their station, in their line's colour.
  const idleAt = new Map();
  for (const t of g.trains) {
    if (t.run || t.mothballed) continue;
    const key = t.line + ':' + t.at;
    idleAt.set(key, (idleAt.get(key) || 0) + 1);
  }
  for (const [key, n] of idleAt) {
    const [li, idx] = key.split(':').map(Number);
    const s = g.lines[li]?.stations[idx];
    if (!s) continue;
    ctx.fillStyle = g.lines[li].color;
    const p = project(s.geo);
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
    ctx.fillStyle = f.colour === 'muted' ? COL.muted : f.colour === 'red' ? COL.red : COL.amber;
    ctx.fillText(f.text, p.x + 22, p.y - 12 - f.age * 22);
  }
  ctx.globalAlpha = 1;
}

// draw() computes its own dt; it is called from the basemap's custom layer
// render (single clock) or from the game loop in fallback mode.
export function draw(g) {
  const now = performance.now();
  const dt = lastDrawAt ? Math.min(0.1, (now - lastDrawAt) / 1000) : 0;
  lastDrawAt = now;
  clockT += dt;
  ctx.clearRect(0, 0, W, H);
  if (basemap === 'off') drawWaterFallback();
  if (basemap === 'on') drawVeil(g);
  drawGlow(g);
  drawTease(g);
  drawAnchors(g);
  drawAllLines(g);
  drawEndHandles(g);
  drawDragPreview(g);
  drawStations(g);
  drawSelected(g);
  drawEggs(g);
  drawSurge(g);
  drawIncident(g);
  drawTrains(g);
  drawGold(g);
  drawInsert();
  drawFloats(dt);
}

// The ghost node per the pass-04 mock: a bg-filled amber ring with a plus,
// a slow 2s pulse on an outer ring, the cost where the decision is.
function drawInsert() {
  if (!insertHover) return;
  const m = project(insertHover.geo);
  const col = insertHover.ok ? COL.amber : COL.red;
  const pulse = 0.5 + 0.5 * Math.sin(clockT * Math.PI);
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.55 + 0.45 * pulse;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 11 + pulse * 2, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = COL.bg;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(m.x, m.y - 2.5);
  ctx.lineTo(m.x, m.y + 2.5);
  ctx.moveTo(m.x - 2.5, m.y);
  ctx.lineTo(m.x + 2.5, m.y);
  ctx.lineWidth = 1.6;
  ctx.stroke();
  if (insertHover.label) label(insertHover.label, m.x + 15, m.y + 13, col, 11, { weight: 600 });
}
