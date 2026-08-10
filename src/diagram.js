// The schematic map (pass 03 section f): the platform-wall diagram, drawn
// from the PLAYER'S live network. Geometry follows the design mockup
// (Tunnelbana Schematic Map.html): a unit grid, thick round-capped lines
// over a bg-coloured casing so crossings read, station ticks, larger
// interchange rings, the hub's double ring, terminus labels in ink.
//
// Anchored stations use the hand-authored dia[x,y] that have waited in
// data.js since day one. Free spots have no dia, so they take an affine
// geo-to-dia mapping fitted to the authored anchors, snapped to the half
// grid so they still read as diagram, not geography. Trains are a separate
// SVG layer the caller updates per frame; everything else rebuilds only
// when the network's shape changes.

import { ANCHORS } from './data.js';
import { trainPos, linesAtAnchor } from './sim.js';

const U = 46;    // px per diagram unit
const PAD = 78;

// Affine fit from the authored anchors: T-Centralen dia [5,-2] at
// [59.3312, 18.0619]; x scaled on Vällingby, y on Hökarängen.
function geoToDia(geo) {
  const x = 5 + (geo[1] - 18.0619) * 68.5;
  const y = -2 - (geo[0] - 59.3312) * 161.7;
  return [Math.round(x * 2) / 2, Math.round(y * 2) / 2];
}

function diaOf(st) {
  return st.anchor !== null ? ANCHORS[st.anchor].dia : geoToDia(st.geo);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

// Layout for the current network: per-line point arrays plus the frame.
export function diagramLayout(g) {
  const linePts = g.lines.map((L) => L.stations.map(diaOf));
  const all = linePts.flat();
  if (!all.length) return null;
  const minX = Math.min(...all.map((p) => p[0]));
  const maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1]));
  const maxY = Math.max(...all.map((p) => p[1]));
  const X = (p) => PAD + (p[0] - minX) * U;
  const Y = (p) => PAD + (p[1] - minY) * U;
  return {
    linePts, X, Y,
    W: (maxX - minX) * U + PAD * 2,
    H: (maxY - minY) * U + PAD * 2,
    minX, maxX, minY, maxY,
  };
}

// The static SVG: everything except the trains, which live in #dia-trains.
export function diagramSVG(g) {
  const lay = diagramLayout(g);
  if (!lay) return '';
  const { linePts, X, Y, W, H, minX, maxX, minY, maxY } = lay;
  let out = '';

  // The paper: a faint unit grid.
  out += '<g>';
  for (let gx = Math.ceil(minX); gx <= maxX; gx++) {
    out += '<path d="M' + (PAD + (gx - minX) * U) + ' 0V' + H + '" stroke="var(--tb-dia-grid)" stroke-width="1"></path>';
  }
  for (let gy = Math.ceil(minY); gy <= maxY; gy++) {
    out += '<path d="M0 ' + (PAD + (gy - minY) * U) + 'H' + W + '" stroke="var(--tb-dia-grid)" stroke-width="1"></path>';
  }
  out += '</g>';

  // Lines: casing first (bg colour, wider), then the line, so crossings read.
  const pathOf = (pts) => 'M' + pts.map((p) => X(p) + ' ' + Y(p)).join(' L ');
  for (const pass of ['casing', 'line']) {
    g.lines.forEach((L, li) => {
      if (linePts[li].length < 2) return;
      out += '<path d="' + pathOf(linePts[li]) + '" fill="none" ' +
        (pass === 'casing'
          ? 'stroke="var(--tb-dia-bg)" stroke-width="11"'
          : 'stroke="' + L.color + '" stroke-width="7"') +
        ' stroke-linecap="round" stroke-linejoin="round"></path>';
    });
  }

  // Nodes and labels, one per physical station (junction shares draw once).
  const seen = new Set();
  g.lines.forEach((L, li) => {
    L.stations.forEach((st, i) => {
      // Keyed by place, not name (0.13.1): a renamed junction is still one
      // station on the ground.
      const key = st.anchor !== null ? 'a' + st.anchor : st.geo[0].toFixed(4) + ',' + st.geo[1].toFixed(4);
      if (seen.has(key)) return;
      seen.add(key);
      const p = linePts[li][i];
      const x = X(p), y = Y(p);
      const terminus = i === 0 || i === L.stations.length - 1;
      const interchange = st.anchor !== null && linesAtAnchor(g, st.anchor) >= 2;
      const r = st.hub ? 8 : interchange ? 7 : 5;
      out += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="var(--tb-dia-bg)" stroke="var(--tb-dia-tick)" stroke-width="2.5"></circle>';
      if (st.hub) {
        out += '<circle cx="' + x + '" cy="' + y + '" r="12" fill="none" stroke="var(--tb-dia-tick)" stroke-width="1.2"></circle>';
      }
      out += '<text class="tb-dia__label' + (terminus ? ' tb-dia__label--term' : '') + '" x="' + (x + 12) + '" y="' + (y + 4) + '">' + esc(st.name) + '</text>';
    });
  });

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" ' +
    'style="display:block;width:100%;height:100%">' + out + '<g id="dia-trains"></g></svg>';
}

// Per-frame: train dots on the diagram, in their line's colour. Cheap: one
// circle per running train, rebuilt as a string (a dozen nodes at most).
export function diagramTrains(g) {
  const lay = diagramLayout(g);
  if (!lay) return '';
  const { linePts, X, Y } = lay;
  let out = '';
  for (const t of g.trains) {
    if (t.mothballed) continue;
    const pts = linePts[t.line];
    if (!pts || pts.length < 2) continue;
    const pos = trainPos(g, t);
    const a = pts[pos.from], b = pts[pos.to] || a;
    const x = X(a) + (X(b) - X(a)) * pos.f;
    const y = Y(a) + (Y(b) - Y(a)) * pos.f;
    out += '<circle cx="' + x + '" cy="' + y + '" r="5" fill="' + g.lines[t.line].color + '" stroke="var(--tb-dia-bg)" stroke-width="2"></circle>';
  }
  return out;
}

// Shape signature: rebuild the static SVG only when this moves. Names are
// part of the shape since 0.13.1 (a rename must repaint the labels).
export function diagramSig(g) {
  return g.lines.map((L) => L.stations.length + ':' + L.color).join('|') +
    '|' + g.lines.map((L) => L.stations.map((s) => s.tier).join('')).join(',') +
    '|' + g.lines.map((L) => L.stations.map((s) => s.name).join(';')).join(',');
}
