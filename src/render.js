// Canvas renderer for the map ONLY. Every number and panel lives in the DOM (plan §7).

import { STATIONS, SEG_KM, LINE } from './data.js';
import { BAL, trainCap, stationCap } from './sim.js';

const CELL = 52;
const OX = -182; // col 6 lands at x=130
const OY = 40;
const CORNER = 16;

const COL = {
  bg: '#0b0f14',
  ink: '#e9eef4',
  muted: '#66727f',
  amber: '#d9a441',
  trainText: '#08130c',
};

let canvas, ctx, dpr;
let floats = []; // {x, y, text, age}

function pt(station) {
  return { x: OX + station.dia[0] * CELL, y: OY + station.dia[1] * CELL };
}

export function init(el) {
  canvas = el;
  dpr = window.devicePixelRatio || 1;
  const w = 470;
  const h = OY * 2 + (STATIONS.length - 1) * CELL;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
}

export function addFloat(stationIdx, text) {
  const p = pt(STATIONS[stationIdx]);
  floats.push({ x: p.x + 24, y: p.y - 10, text, age: 0 });
}

function drawLine() {
  ctx.beginPath();
  const pts = STATIONS.map(pt);
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.arcTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, CORNER);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = LINE.color;
  ctx.stroke();
}

function drawStations(g) {
  ctx.font = '12px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.textBaseline = 'middle';
  const cap = stationCap(g);
  STATIONS.forEach((s, i) => {
    const p = pt(s);
    const terminus = i === 0 || i === STATIONS.length - 1;

    ctx.beginPath();
    ctx.arc(p.x, p.y, terminus ? 6.5 : 5, 0, Math.PI * 2);
    ctx.fillStyle = COL.bg;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = COL.ink;
    ctx.stroke();

    ctx.fillStyle = terminus ? COL.ink : COL.muted;
    ctx.textAlign = 'left';
    ctx.fillText(s.name, p.x + 16, p.y);

    // Waiting passengers, left of the line. Amber when the platform is nearly full.
    const w = Math.floor(g.waiting[i]);
    ctx.fillStyle = w >= cap * 0.75 ? COL.amber : COL.muted;
    ctx.textAlign = 'right';
    ctx.fillText(String(w), p.x - 16, p.y);
  });
}

function trainPos(train) {
  const run = train.run;
  const segIdx = Math.min(run.from, run.from + run.dir);
  const dur = SEG_KM[segIdx] * BAL.secondsPerKm + BAL.dwell;
  const f = Math.min(1, run.t / dur);
  const a = pt(STATIONS[run.from]);
  const b = pt(STATIONS[run.from + run.dir]);
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
    ctx.font = 'bold 9px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(train.run.onboard), p.x, p.y + 0.5);
  }
  // Idle trains wait as small pips at their terminus.
  const idleAt = { 0: 0, [STATIONS.length - 1]: 0 };
  for (const train of g.trains) if (!train.run) idleAt[train.at]++;
  for (const [idx, n] of Object.entries(idleAt)) {
    if (!n) continue;
    const p = pt(STATIONS[idx]);
    ctx.fillStyle = LINE.color;
    for (let k = 0; k < n; k++) {
      ctx.beginPath();
      ctx.arc(p.x - 30 - k * 10, p.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFloats(dt) {
  floats = floats.filter((f) => f.age < 1.2);
  ctx.font = 'bold 13px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.textAlign = 'left';
  for (const f of floats) {
    f.age += dt;
    const a = 1 - f.age / 1.2;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = COL.amber;
    ctx.fillText(f.text, f.x, f.y - f.age * 22);
  }
  ctx.globalAlpha = 1;
}

export function draw(g, dt) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawLine();
  drawStations(g);
  drawTrains(g);
  drawFloats(dt);
}
