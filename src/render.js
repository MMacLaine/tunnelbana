// Canvas renderer for the map ONLY. Every number and panel lives in the DOM (plan §7).
// Top-down geographic view: stations at (projected) real positions, stylized water,
// waiting passengers as dots. The dia grid stays in the data for a schematic view later.

import { STATIONS, SEG_KM, LINE, WATER, TEASE } from './data.js';
import { BAL, stationCap, nextStation } from './sim.js';

const W = 470;
const H = 660;
const LAT_MAX = 59.3300;
const LAT_MIN = 59.2540;
const LON_MIN = 18.0550;

const KM_PER_DEG = 111.32;
const COS_LAT = Math.cos(59.29 * Math.PI / 180);
const PX_PER_KM = H / ((LAT_MAX - LAT_MIN) * KM_PER_DEG);

const COL = {
  bg: '#0b0f14',
  water: '#0e1a29',
  waterInk: '#3f5670',
  ink: '#e9eef4',
  muted: '#66727f',
  ghost: '#4a5663',
  amber: '#d9a441',
  trainText: '#08130c',
};

let canvas, ctx, dpr;
let floats = []; // {x, y, text, age}

function project(geo) {
  return {
    x: (geo[1] - LON_MIN) * KM_PER_DEG * COS_LAT * PX_PER_KM,
    y: (LAT_MAX - geo[0]) * KM_PER_DEG * PX_PER_KM,
  };
}

const P = STATIONS.map((s) => project(s.geo));

export function init(el) {
  canvas = el;
  dpr = window.devicePixelRatio || 1;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
}

export function addFloat(stationIdx, text) {
  const p = P[stationIdx];
  floats.push({ x: p.x + 22, y: p.y - 12, text, age: 0 });
}

function mono(size, weight) {
  return (weight ? weight + ' ' : '') + size + 'px ui-monospace, "SF Mono", Menlo, monospace';
}

function drawWater() {
  for (const w of WATER) {
    ctx.beginPath();
    w.ring.forEach((pt, i) => {
      const p = project(pt);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = COL.water;
    ctx.fill();
    const lp = project(w.labelAt);
    ctx.font = 'italic ' + mono(10);
    ctx.fillStyle = COL.waterInk;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(w.label, lp.x, lp.y);
  }
}

function drawTease() {
  const from = P[TEASE.from];
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
  ctx.fillText(TEASE.label, lp.x, lp.y);
}

function drawLine(g) {
  ctx.beginPath();
  ctx.moveTo(P[0].x, P[0].y);
  for (let i = 1; i < g.built - 1; i++) {
    ctx.arcTo(P[i].x, P[i].y, P[i + 1].x, P[i + 1].y, 7);
  }
  ctx.lineTo(P[g.built - 1].x, P[g.built - 1].y);
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = LINE.color;
  ctx.stroke();
}

function drawGhost(g) {
  const next = nextStation(g);
  if (!next) return;
  const a = P[g.built - 1];
  const b = P[g.built];
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.setLineDash([3, 6]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = COL.ghost;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
  ctx.setLineDash([2, 3]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COL.ghost;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = mono(12);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COL.ghost;
  ctx.fillText(next.name, b.x + 16, b.y - 6);
  ctx.fillStyle = COL.amber;
  ctx.fillText(next.ext.cost.toLocaleString('sv-SE') + ' kr', b.x + 16, b.y + 8);
}

// Waiting passengers as dots, Mini Metro style: rows of pips left of the station.
function drawWaitingDots(g, i, p) {
  const n = Math.floor(g.waiting[i]);
  const shown = Math.min(n, 18);
  const nearFull = n >= stationCap(g) * 0.75;
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

function drawStations(g) {
  ctx.textBaseline = 'middle';
  for (let i = 0; i < g.built; i++) {
    const p = P[i];
    const terminus = i === 0 || i === g.built - 1;

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
    ctx.fillText(STATIONS[i].name, p.x + 16, p.y);

    drawWaitingDots(g, i, p);
  }
}

function trainPos(train) {
  const run = train.run;
  const segIdx = Math.min(run.from, run.from + run.dir);
  const dur = SEG_KM[segIdx] * BAL.secondsPerKm + BAL.dwell;
  const f = Math.min(1, run.t / dur);
  const a = P[run.from];
  const b = P[run.from + run.dir];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function drawTrains(g) {
  for (const train of g.trains) {
    if (!train.run) continue;
    const p = trainPos(train);
    ctx.beginPath();
    ctx.roundRect(p.x - 14, p.y - 8, 28, 16, 5);
    ctx.fillStyle = LINE.color;
    ctx.fill();
    ctx.fillStyle = COL.trainText;
    ctx.font = mono(9, 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(train.run.onboard), p.x, p.y + 0.5);
  }
  // Idle trains wait as pips beside their station.
  const idleAt = {};
  for (const train of g.trains) if (!train.run) idleAt[train.at] = (idleAt[train.at] || 0) + 1;
  ctx.fillStyle = LINE.color;
  for (const [idx, n] of Object.entries(idleAt)) {
    const p = P[idx];
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
    ctx.globalAlpha = Math.max(0, 1 - f.age / 1.2);
    ctx.fillStyle = COL.amber;
    ctx.fillText(f.text, f.x, f.y - f.age * 22);
  }
  ctx.globalAlpha = 1;
}

export function draw(g, dt) {
  ctx.clearRect(0, 0, W, H);
  drawWater();
  drawTease();
  drawGhost(g);
  drawLine(g);
  drawStations(g);
  drawTrains(g);
  drawFloats(dt);
}
