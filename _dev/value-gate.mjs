// The monotonic-value gate (report 634 §1c): for every catalog item, measure
// steady-state net income with and without it under a config where the item
// SHOULD matter, and fail the build if buying it makes the player worse off or
// a marginal level does nothing. This is the gate that would have caught
// drivers-worse-than-clicking (622), free-placement 2:1 (624), and the dead
// fleet (634). Run: node _dev/value-gate.mjs
import * as sim from '../src/sim.js';
import { ANCHORS, WEST_FIRST } from '../src/data.js';

const WARMUP = 120;
const MEASURE = 240;
const MIN_GAIN = 0.05; // kr/s a purchase must add in its scenario

function build(owned, demand) {
  const g = sim.newGame();
  g.era = sim.ERAS.length - 1; // everything unlocked; the gate tests function, not gating
  g.money = 1e12;
  // Demand regime: capacity upgrades can only pay when demand outstrips supply,
  // demand upgrades only when there is spare capacity. Test each where it binds.
  g.totalDelivered = demand === 'high' ? 60000 : 6000;
  while (g.lines[0].stations.length < WEST_FIRST) {
    sim.extendTo(g, 0, 'tail', ANCHORS[g.lines[0].stations.length].geo, g.lines[0].stations.length);
  }
  if (owned.westline) {
    g.pk = 1e6;
    sim.buy(g, 'westline');
    for (let k = WEST_FIRST + 1; k < WEST_FIRST + 4; k++) {
      sim.extendTo(g, 1, 'tail', ANCHORS[k].geo, k);
    }
  }
  for (const [id, n] of Object.entries(owned)) {
    if (id === 'westline') continue; // handled above, needs its side effect
    g.owned[id] = n;
    if (id === 'train') {
      for (let i = 0; i < n; i++) {
        // With two lines, bought trains alternate so both are staffed.
        g.trains.push({ line: owned.westline ? i % 2 : 0, at: 0, run: null, mothballed: false });
      }
    }
  }
  return g;
}

// Net income (kr/s) at steady state; money pinned high so deficits never mothball.
function netRate(owned, demand) {
  const g = build(owned, demand);
  for (let t = 0; t < WARMUP; t += 0.05) { sim.tick(g, 0.05); g.events.length = 0; }
  const m0 = g.money;
  for (let t = 0; t < MEASURE; t += 0.05) { sim.tick(g, 0.05); g.events.length = 0; }
  return (g.money - m0) / MEASURE;
}

// Each case: a baseline where the item's effect should bind, plus the marginal
// buy, in the demand regime where the item has a job to do.
const CASES = [
  { id: 'drivers',    demand: 'low',  base: {},                                        buy: { drivers: 1 } },
  { id: 'train #2',   demand: 'high', base: { drivers: 1 },                            buy: { train: 1 } },
  { id: 'train 2-line',demand: 'high', base: { drivers: 1, westline: 1 },              buy: { train: 1 } },
  { id: 'timetable',  demand: 'high', base: { drivers: 1, train: 3 },                  buy: { timetable: 1 } },
  { id: 'timetable 6',demand: 'high', base: { drivers: 1, train: 6, timetable: 5 },    buy: { timetable: 6 } },
  { id: 'capacity',   demand: 'high', base: { drivers: 1, train: 1 },                  buy: { capacity: 1 } },
  { id: 'bogies',     demand: 'high', base: { drivers: 1 },                            buy: { bogies: 1 } },
  { id: 'turnstiles', demand: 'low',  base: { drivers: 1, train: 2 },                  buy: { turnstiles: 1 } },
  { id: 'entrances',  demand: 'low',  base: { drivers: 1, train: 3, timetable: 2 },    buy: { entrances: 1 } },
  { id: 'through',    demand: 'low',  base: { drivers: 1, train: 2, westline: 1 },     buy: { through: 1 } },
  { id: 'stock1957',  demand: 'high', base: { drivers: 1 },                            buy: { stock1957: 1 } },
  { id: 'c4stock',    demand: 'high', base: { drivers: 1 },                            buy: { c4stock: 1 } },
  { id: 'c14stock',   demand: 'high', base: { drivers: 1 },                            buy: { c14stock: 1 } },
  { id: 'zonefare',   demand: 'low',  base: { drivers: 1, train: 2 },                  buy: { zonefare: 1 } },
];

let failed = 0;
for (const c of CASES) {
  const without = netRate({ ...c.base }, c.demand);
  const withIt = netRate({ ...c.base, ...c.buy }, c.demand);
  const delta = withIt - without;
  const ok = delta >= MIN_GAIN;
  if (!ok) failed++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${c.id.padEnd(12)} without=${without.toFixed(2)}/s  with=${withIt.toFixed(2)}/s  delta=${delta >= 0 ? '+' : ''}${delta.toFixed(2)}/s`
  );
}

if (failed) {
  console.error(`VALUE GATE FAILED: ${failed} purchase(s) do not earn their keep.`);
  process.exit(1);
}
console.log('VALUE GATE OK: every purchase improves the thing it claims to improve.');
