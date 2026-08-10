// Canvas renderer for the game layer ONLY: the basemap lives in MapLibre
// underneath (the canvas is uploaded into the map's GL frame as a custom
// layer), every number and panel lives in the DOM (plan §7). All positions are
// projected per frame through the active projector.

import { ANCHORS, CORRIDORS, LINE, WATER } from './data.js';
import { EGGS } from './facts.js';
import {
  stationCap, usedAnchorsOnLine, usedAnchorsAll, linesAtAnchor,
  endStation, waitingAt, trainPos, anchorRevealed, teaseVisible, corridorOf, dayPhase,
  buildRadiusNow, stakeLine, growthView,
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
    // Pass 04 growth ramp: warm window light, four density steps, WARMER
    // than anything else on the night map so lived-in reads at a glance.
    glowRamp: ['#3a2f1e', '#6b4f24', '#a9772e', '#e8b64e'],
    glowCore: 'rgba(232, 182, 78, 0.16)',
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
    // The light ramp darkens to amber so lit windows read against a bright
    // ground instead of washing out (pass 04's explicit light-theme override).
    glowRamp: ['#efe4cf', '#e6c88a', '#d9a63f', '#b8862c'],
    glowCore: 'rgba(184, 134, 44, 0.18)',
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
let selectedTrain = null; // train id | null (0.15.0, the inspector)
let clockT = 0;
let lastDrawAt = 0;

export function setSelected(sel) {
  selected = sel;
}

export function setSelectedTrain(id) {
  selectedTrain = id === undefined ? null : id;
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

// Every grabbable line end with its display position. Ends sharing a
// physical station fan out around it, each along its own line's outgoing
// direction where the line has one, so every terminating line stays
// separately visible and grabbable. Before this, coincident ends projected
// to identical pixels and the strict nearest-point compare handed every
// grab to the lowest line index while the top-drawn ring wore another
// line's colour (live report 2026-08-10: "when multiple lines terminate at
// a station, only one line is extendable").
export function endHandles(g) {
  const groups = new Map();
  for (let li = 0; li < g.lines.length; li++) {
    const sts = g.lines[li].stations;
    if (sts.length < 1) continue;
    // A one-station line's head and tail are the same point and the same
    // move; one handle, so a fan never shows the same line twice.
    for (const end of sts.length === 1 ? ['tail'] : ['head', 'tail']) {
      const st = endStation(g, li, end);
      const k = stKey(st);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ li, end, st });
    }
  }
  const out = [];
  for (const members of groups.values()) {
    const c = project(members[0].st.geo);
    if (members.length === 1) {
      const m = members[0];
      out.push({ li: m.li, end: m.end, x: c.x, y: c.y, cx: c.x, cy: c.y, fanned: false });
      continue;
    }
    members.forEach((m, k) => {
      const sts = g.lines[m.li].stations;
      if (sts.length > 1) {
        const nb = project((m.end === 'head' ? sts[1] : sts[sts.length - 2]).geo);
        m.ang = Math.atan2(c.y - nb.y, c.x - nb.x);
      } else {
        m.ang = -Math.PI / 2 + (k * Math.PI * 2) / members.length;
      }
    });
    // Near-parallel approaches would stack their handles; a few relaxation
    // passes push neighbouring angles apart until each has its own arc.
    const minGap = Math.min(1.0, (Math.PI * 2) / members.length);
    for (let pass = 0; pass < 4; pass++) {
      members.sort((a, b) => a.ang - b.ang);
      for (let i = 0; i < members.length; i++) {
        const a = members[i], b = members[(i + 1) % members.length];
        const gap = (i === members.length - 1 ? b.ang + Math.PI * 2 : b.ang) - a.ang;
        if (gap < minGap) {
          const push = (minGap - gap) / 2;
          a.ang -= push;
          b.ang += push;
        }
      }
    }
    const dist = grabRadius() * 0.9;
    for (const m of members) {
      out.push({
        li: m.li, end: m.end,
        x: c.x + Math.cos(m.ang) * dist, y: c.y + Math.sin(m.ang) * dist,
        cx: c.x, cy: c.y, fanned: true,
      });
    }
  }
  return out;
}

// Returns { li, end, d } for the nearest grabbable line end, or null.
export function nearEndAt(g, p) {
  const r = grabRadius();
  const handles = endHandles(g);
  let best = null, bestD = r;
  for (const h of handles) {
    const d = Math.hypot(p.x - h.x, p.y - h.y);
    if (d < bestD) { best = { li: h.li, end: h.end, d }; bestD = d; }
  }
  if (best) return best;
  // The fan pulled the handles off the station, which orphaned the side of
  // the old grab region facing away from them: a pointer within reach of a
  // shared terminus itself still grabs, taking whichever handle sits
  // nearest, so every spot that worked before the fan keeps working.
  let fb = null, fbD = Infinity;
  for (const h of handles) {
    if (!h.fanned) continue;
    if (Math.hypot(p.x - h.cx, p.y - h.cy) >= r) continue;
    const d = Math.hypot(p.x - h.x, p.y - h.y);
    if (d < fbD) { fb = { li: h.li, end: h.end, d }; fbD = d; }
  }
  return fb;
}

export function nearEnd(g, p) {
  return nearEndAt(g, p);
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

// Visible growth (v12, pass 04 section b): warm window light accumulating
// where districts have grown. Scattered points, not a fill, so the eye
// counts density the way it counts a queue; the count and the colour step
// both follow srcW against its cap. Drawn right after the reveal glow, so
// lines, labels and glyphs always sit above. The scatter is a HASH of the
// source and point index, never Math.random: windows must not rearrange
// between frames.
function hash01(a, b) {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function drawGrowth(g) {
  const view = growthView(g);
  if (!view.length) return;
  const ppk = pxPerKm();
  for (const s of view) {
    const c = project(s.geo);
    const rPx = Math.max(10, s.reach * 0.85 * ppk);
    const step = Math.min(3, Math.floor(s.p * 4));
    // A faint warm wash binds a dense cluster together before the points.
    if (s.p > 0.6) {
      const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rPx);
      grad.addColorStop(0, COL.glowCore);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, rPx, 0, Math.PI * 2);
      ctx.fill();
    }
    const pts = Math.round(s.p * 10 * Math.min(2, s.w)) + 2;
    for (let k = 0; k < pts; k++) {
      const ang = hash01(s.j, k) * Math.PI * 2;
      const rad = Math.sqrt(hash01(s.j, k + 100)) * rPx;
      // Each window keeps its own step so a district brightens window by
      // window instead of all at once.
      const tone = Math.min(step, Math.floor(hash01(s.j, k + 200) * (step + 1.6)));
      ctx.fillStyle = COL.glowRamp[tone];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(c.x + Math.cos(ang) * rad - 1, c.y + Math.sin(ang) * rad - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
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
      // While the coach runs, the whole build affordance speaks up: the
      // connector goes near-solid and the stake rings larger, because this
      // ring IS the tutorial and it was too quiet to carry that.
      const coach = coachBuild(g);
      const c = corridorOf(i);
      if (c && i > c.start && used.has(i - 1)) {
        const q = project(ANCHORS[i - 1].geo);
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(p.x, p.y);
        ctx.setLineDash([3, 6]);
        ctx.lineWidth = coach ? 3 : 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = colStake;
        ctx.globalAlpha = coach ? 0.9 : 0.55;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }
      const pulse = 0.5 + 0.5 * Math.sin(clockT * 2.2);
      const base = coach ? 7 : 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, base + pulse * (coach ? 4 : 2.5), 0, Math.PI * 2);
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1.5 + pulse * 0.8;
      ctx.strokeStyle = colStake;
      ctx.globalAlpha = 0.45 + 0.5 * pulse;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      label(a.name, p.x + 13, p.y, COL.ink, 11);
      if (coach) label('Build here', p.x + 13, p.y + 14, COL.amber, 11, { weight: 600 });
    }
  });
}

// The first two minutes, hand held (live report + telemetry 2026-08-09:
// nearly half of starts never finished the 1950 line, and the owner himself
// had to hunt for the stake). The order FOLLOWS THE MONEY (owner catch,
// same night): 900 kr in hand cannot pay a 1785 kr build, so beat one is
// the bell and this, beat two, speaks only once fares are flowing. True
// only in the untouched opening position; one extension ends it forever.
export function coachBuild(g) {
  return g.opened && g.lines.length === 1 && g.lines[0].stations.length === 3;
}

function drawEndHandles(g) {
  const coach = coachBuild(g);
  for (const h of endHandles(g)) {
    const r = 10.5 + Math.sin(clockT * 2.2) * 1.4;
    if (h.fanned) {
      // A stub ties the fanned handle back to the station it extends.
      ctx.beginPath();
      ctx.moveTo(h.cx, h.cy);
      ctx.lineTo(h.x, h.y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = g.lines[h.li].color;
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = g.lines[h.li].color;
    ctx.globalAlpha = 0.9;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // The coach speaks at the working end: the one instruction the first
    // minute actually needs, riding the handle it applies to.
    if (coach && h.end === 'tail') {
      const pulse = 0.5 + 0.5 * Math.sin(clockT * (Math.PI * 2 / 2.4));
      ctx.beginPath();
      ctx.arc(h.x, h.y, r + 5 + pulse * 3, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = COL.amber;
      ctx.globalAlpha = 0.5 + 0.45 * pulse;
      ctx.stroke();
      ctx.globalAlpha = 1;
      label('Drag this end to the pulsing ring', h.x + 18, h.y + 18, COL.amber, 12, { weight: 600 });
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

// Track width and the gap between services sharing one. The gap equals the
// width, so two services on a trunk draw as touching ribbons and the trunk
// reads as one thicker track carrying two colours (owner ask 2026-08-10).
const TRACK_W = 6;
const TRUNK_GAP = 6;

// How far each line is pushed sideways on every one of its segments, in
// screen pixels, 0 where it runs alone.
//
// Slots are numbered against the segment's CANONICAL direction (its two
// endpoint keys, sorted), never against the order a line happens to store
// its stations in, and the drawing takes its perpendicular the same way.
// That agreement is the whole point: previously the perpendicular came from
// the direction of travel, so a line running the trunk south to north had
// both its perpendicular AND its slot negated, the two cancelled exactly,
// and it drew on top of the line running north to south instead of beside
// it. The higher line index simply painted over the lower and a shared
// trunk showed a single colour (live screenshot 2026-08-10, the red line
// covering the green through Gamla stan).
//
// Exported because it is the testable half of the drawing: smoke asserts
// that two lines sharing a segment in opposite station order come back with
// opposite signs.
export function trunkOffsets(g) {
  const owners = new Map(); // segKey -> [line indices, ascending]
  g.lines.forEach((L, li) => {
    for (let i = 0; i + 1 < L.stations.length; i++) {
      const k = segKey(L.stations[i], L.stations[i + 1]);
      if (!owners.has(k)) owners.set(k, []);
      owners.get(k).push(li);
    }
  });
  return g.lines.map((L, li) => {
    const out = [];
    for (let i = 0; i + 1 < L.stations.length; i++) {
      const a = L.stations[i], b = L.stations[i + 1];
      const list = owners.get(segKey(a, b));
      if (!list || list.length < 2) { out.push(0); continue; }
      out.push((list.indexOf(li) - (list.length - 1) / 2) * TRUNK_GAP);
    }
    return out;
  });
}

function drawAllLines(g) {
  const offsets = trunkOffsets(g);
  g.lines.forEach((L, li) => {
    if (L.stations.length < 2) return;
    const P = linePoints(L);
    const off = offsets[li];
    if (!off.some((v) => v !== 0)) { drawLinePath(P, L.color); return; }
    // Per-segment strokes so shared stretches can shift sideways; the smooth
    // arcTo corners only exist on unshared lines, a fair trade for legibility.
    ctx.lineWidth = TRACK_W;
    ctx.lineCap = 'round';
    ctx.strokeStyle = L.color;
    for (let i = 0; i + 1 < L.stations.length; i++) {
      let ax = P[i].x, ay = P[i].y, bx = P[i + 1].x, by = P[i + 1].y;
      if (off[i]) {
        // The perpendicular is taken in the segment's CANONICAL direction,
        // the same one trunkOffsets numbered the slots in, so both services
        // agree which side of the track is which however each of them
        // happens to store its stations.
        const flip = stKey(L.stations[i]) < stKey(L.stations[i + 1]) ? 1 : -1;
        const dx = (bx - ax) * flip, dy = (by - ay) * flip;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * off[i], ny = (dx / len) * off[i];
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

      const key = s.anchor !== null ? 'a' + s.anchor : s.geo[0].toFixed(4) + ',' + s.geo[1].toFixed(4);
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

// Every train that has a place on the map, with the exact screen point it is
// drawn at. ONE source for the drawing AND the hit test (0.15.0): a mark the
// pointer cannot find where the eye can is the shared terminus bug wearing a
// different hat, so the two are not allowed to compute it separately.
//
// Stabled trains are deliberately absent. They are not on the map at all, so
// the Network panel's fleet list is how the player reaches one.
export function trainMarks(g) {
  const out = [];
  const stack = new Map(); // line:at -> how many pips already placed there
  for (const t of g.trains) {
    if (t.mothballed) continue;
    const L = g.lines[t.line];
    if (!L) continue;
    if (t.run) {
      // Position from the sim's accel/dwell physics: dots brake into
      // platforms and visibly sit while boarding (report 634 §2a).
      const pos = trainPos(g, t);
      const aSt = L.stations[pos.from], bSt = L.stations[pos.to];
      if (!aSt || !bSt) continue;
      const a = project(aSt.geo), b = project(bSt.geo);
      out.push({
        t, id: t.id, kind: 'run', color: L.color,
        x: a.x + (b.x - a.x) * pos.f, y: a.y + (b.y - a.y) * pos.f,
      });
    } else {
      const s = L.stations[t.at];
      if (!s) continue;
      const key = t.line + ':' + t.at;
      const k = stack.get(key) || 0;
      stack.set(key, k + 1);
      const p = project(s.geo);
      out.push({ t, id: t.id, kind: 'idle', color: L.color, x: p.x + 6 + k * 9, y: p.y - 14 });
    }
  }
  return out;
}

// The train under the pointer with how far away it is, or null. Reverse
// order so the one painted on top answers, and a radius in the nearGold
// spirit: a moving 28 by 16 body wants a forgiving circle, not its own
// rectangle.
//
// The DISTANCE is part of the answer because a train resting at a terminus
// sits about fifteen pixels from the station, which is inside the line end
// grab radius. Whoever is nearest the pointer should win, or either the
// build verb or the inspector becomes unreachable there.
export function nearTrainAt(g, p) {
  const marks = trainMarks(g);
  let best = null, bestD = Infinity;
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    if (d <= (m.kind === 'run' ? 20 : 8) && d < bestD) { best = { id: m.id, d }; bestD = d; }
  }
  return best;
}

export function nearTrain(g, p) {
  const hit = nearTrainAt(g, p);
  return hit ? hit.id : null;
}

function drawTrains(g) {
  const marks = trainMarks(g);
  // Bodies first, then the resting pips, so a pip beside a station is never
  // buried under a train running past it.
  for (const m of marks) {
    if (m.kind !== 'run') continue;
    const { x, y } = m;
    ctx.beginPath();
    ctx.roundRect(x - 14, y - 8, 28, 16, 2.5);
    // The train wears its line's colour (0.14.0, owner ask with the custom
    // line colours): which line a train serves reads at a glance. The ink
    // outline keeps the body from melting into the stroke it rides on.
    ctx.fillStyle = m.color;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = COL.trainInk;
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = COL.trainDetail;
    ctx.fillRect(x - 9, y - 5, 4, 3);
    ctx.fillRect(x - 2, y - 5, 4, 3);
    ctx.fillRect(x + 5, y - 5, 4, 3);
    ctx.fillStyle = COL.trainInk;
    ctx.font = mono(9, 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(m.t.run.onboard)), x, y + 2.5);
  }
  for (const m of marks) {
    if (m.kind !== 'idle') continue;
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // The inspected train wears a ring in its own line's colour, with an ink
  // keyline so it survives sitting on the stroke it belongs to.
  if (selectedTrain !== null) {
    const m = marks.find((x) => x.id === selectedTrain);
    if (m) {
      const r = (m.kind === 'run' ? 17 : 7.5) + Math.sin(clockT * 2.4) * 1.2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, r + 1.5, 0, Math.PI * 2);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = COL.trainInk;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = m.color;
      ctx.stroke();
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
  drawGrowth(g);
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
  drawDepots(g);
  drawTrains(g);
  drawGold(g);
  drawInsert();
  drawFloats(dt);
}

// The depot (v12, pass 04 section d): a building beside each line's home
// terminus once the hall is bought. Station grammar but NOT a stop: a shed
// with a pitched roof in the line's colour, offset off the platform.
function drawDepots(g) {
  if (!g.owned.depot) return;
  for (const L of g.lines) {
    if (!L.stations.length) continue;
    const p = project(L.stations[0].geo);
    const x = p.x - 14, y = p.y - 14;
    ctx.beginPath();
    ctx.rect(x - 5, y - 3, 10, 7);
    ctx.fillStyle = COL.bg;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = L.color || LINE.color;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 3);
    ctx.lineTo(x, y - 7);
    ctx.lineTo(x + 5, y - 3);
    ctx.stroke();
  }
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
