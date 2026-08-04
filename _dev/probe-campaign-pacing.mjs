// Era-threshold pacing probe (M6 slice 5): measure steady delivered/s at
// each campaign stage, then convert the threshold GAPS into active hours.
// Targets (plan): eras land at roughly 1h / 4h / 8h / 12h / 16h cumulative.
// Run: node _dev/probe-campaign-pacing.mjs
import * as sim from '../src/sim.js';
import { ANCHORS, CORRIDORS } from '../src/data.js';

function corridor(id) { return CORRIDORS.find((c) => c.id === id); }

function buildStage(stage) {
  const g = sim.newGame();
  g.era = sim.ERAS.length - 1; // function, not gating
  g.money = 1e12;
  g.pk = 1e6;
  const lines = {
    1: [['green-south']],
    2: [['green-south'], ['green-west']],
    3: [['green-south'], ['green-west'], ['red-south', 'red-orn', 'red-ost']],
    4: [['green-south'], ['green-west'], ['red-south', 'red-orn', 'red-ost'], ['blue-main', 'blue-akalla']],
  }[stage];
  lines.forEach((group, li) => {
    if (li > 0) sim.foundLine(g, 0, 0);
    for (const id of group) {
      const c = corridor(id);
      for (let k = c.start; k < c.end; k++) {
        g.money = 1e12;
        sim.extendTo(g, li, 'tail', ANCHORS[k].geo, k);
      }
    }
  });
  // A sensible fleet for the stage; drivers + timetable + some capacity.
  g.owned.drivers = 1;
  g.owned.timetable = 1;
  g.owned.capacity = 2;
  const perLine = { 1: [3], 2: [3, 3], 3: [3, 3, 4], 4: [3, 3, 4, 4] }[stage];
  perLine.forEach((n, li) => {
    for (let i = 0; i < n; i++) g.trains.push({ line: li, at: 0, run: null, mothballed: false, readyAt: 0 });
  });
  // A grown city (the mid-late game state these thresholds bind in).
  g.srcW = g.srcW.map((w) => w * 1.8);
  sim.computeDemand(g);
  return g;
}

const rates = {};
for (const stage of [1, 2, 3, 4]) {
  const g = buildStage(stage);
  for (let t = 0; t < 600; t += 0.05) { sim.tick(g, 0.05); g.events.length = 0; }
  const d0 = g.totalDelivered;
  for (let t = 0; t < 600; t += 0.05) { sim.tick(g, 0.05); g.events.length = 0; }
  rates[stage] = (g.totalDelivered - d0) / 600;
  console.log(`stage ${stage}: ${sim.stationCount(g)} stations, ${g.trains.length} trains -> ${rates[stage].toFixed(1)} delivered/s`);
}

const T = sim.ERAS.map((e) => e.delivered || 0);
// Threshold gap i is earned at roughly the rate of the stage BEFORE era i.
const stageFor = [null, 1, 2, 2, 3, 4]; // era index -> stage whose rate earns its gap
let hours = 0;
for (let i = 1; i < T.length; i++) {
  const gap = T[i] - T[i - 1];
  const h = gap / rates[stageFor[i]] / 3600;
  hours += h;
  console.log(`era ${sim.ERAS[i].year}: gap ${gap.toLocaleString()} @ stage-${stageFor[i]} rate -> +${h.toFixed(1)}h (cumulative ${hours.toFixed(1)}h)`);
}
