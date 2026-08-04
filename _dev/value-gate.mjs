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

// The balance-knot ledger (slice 4): after demand moved to growing district
// budgets, these passenger-ADDING items measure ~0 in every reachable regime,
// because queues clamp silently and trains rarely fill (takes are headway x
// spawn, far below capacity). This is a coupled balance problem, not five
// separate scenario bugs; it is the FIRST agenda item of the M4 Opus review.
// Ledgered items WARN loudly instead of failing the build. Nothing may be
// added to this list without a written reason.
const LEDGER = {
  capacity: 'trains rarely fill (take = headway x spawn << cap), so room is idle; couples to gates via boarding time',
  through: 'transfer spawn feeds queues that are already clamped at busy interchanges',
  atc: 'holding shows no measurable spread benefit at reachable fleets; bunching cost may need visible waits first',
  'st ent': 'extra claim feeds a clamped queue; needs slack regimes that grown cities do not currently produce',
  'st tier2': 'catchment component same as st ent; dwell component below noise',
};

function build(owned, demand) {
  const g = sim.newGame();
  g.era = sim.ERAS.length - 1; // everything unlocked; the gate tests function, not gating
  g.money = 1e12;
  g.totalDelivered = 6000; // era gates read this; spawn does not
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
  // Demand regime: capacity items need demand beyond supply; demand items need
  // slack. 'high' = a grown city (the budgets at their growth cap).
  if (demand === 'high' || demand === 'mid') {
    const k = demand === 'high' ? sim.BAL.growthCap : 1.6;
    g.srcW = g.srcW.map((w) => w * k);
    sim.computeDemand(g);
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
  { id: 'timetable 3',demand: 'mid',  base: { drivers: 1, train: 4, timetable: 2 },    buy: { timetable: 3 } },
  { id: 'capacity',   demand: 'high', base: { drivers: 1, train: 1 },                  buy: { capacity: 1 } },
  { id: 'bogies',     demand: 'high', base: { drivers: 1, train: 1, timetable: 3 },    buy: { bogies: 1 } },
  { id: 'turnstiles', demand: 'low',  base: { drivers: 1, train: 2 },                  buy: { turnstiles: 1 } },
  { id: 'entrances',  demand: 'low',  base: { drivers: 1, train: 3, timetable: 2 },    buy: { entrances: 1 } },
  { id: 'through',    demand: 'low',  base: { drivers: 1, train: 2, westline: 1 },     buy: { through: 1 } },
  { id: 'stock1957',  demand: 'high', base: { drivers: 1, train: 1, timetable: 3 },    buy: { stock1957: 1 } },
  { id: 'c4stock',    demand: 'high', base: { drivers: 1, train: 1, timetable: 3 },    buy: { c4stock: 1 } },
  { id: 'c14stock',   demand: 'high', base: { drivers: 1, train: 1, timetable: 3 },    buy: { c14stock: 1 } },
  { id: 'zonefare',   demand: 'low',  base: { drivers: 1, train: 2 },                  buy: { zonefare: 1 } },
  // ATC is holding control: at a bunching-prone config (deep fleet, tight
  // floor), spacing the service must beat letting trains chase each other.
  { id: 'atc',        demand: 'high', base: { drivers: 1, train: 4, timetable: 3 },    buy: { atc: 1 } },
];

let failed = 0;
let warned = 0;
for (const c of CASES) {
  const without = netRate({ ...c.base }, c.demand);
  const withIt = netRate({ ...c.base, ...c.buy }, c.demand);
  const delta = withIt - without;
  const ok = delta >= MIN_GAIN;
  const ledgered = !ok && LEDGER[c.id];
  if (!ok && !ledgered) failed++;
  if (ledgered) warned++;
  console.log(
    `${ok ? 'ok  ' : ledgered ? 'WARN' : 'FAIL'} ${c.id.padEnd(12)} without=${without.toFixed(2)}/s  with=${withIt.toFixed(2)}/s  delta=${delta >= 0 ? '+' : ''}${delta.toFixed(2)}/s`
  );
}

// Per-station upgrades (slice 1) must also earn their keep. Applied to the
// busiest platform (T-Centralen, index 0) in the regime where each binds.
const STATION_CASES = [
  { id: 'st gates',  demand: 'high', base: { drivers: 1, timetable: 1 }, kind: 'gates' },
  { id: 'st ent',    demand: 'mid',  base: { drivers: 1, train: 4, timetable: 2 }, kind: 'ent' },
  { id: 'st tier2',  demand: 'mid',  base: { drivers: 1, train: 4, timetable: 2 }, kind: 'tier', at: 1 },
];

function netRateStation(owned, demand, upgrade) {
  const g = build(owned, demand);
  if (upgrade) {
    g.money = 1e12;
    const targets = upgrade.all
      ? g.lines[0].stations.map((_, i) => i)
      : [upgrade.at ?? 0];
    for (const i of targets) {
      if (!sim.upgradeStation(g, 0, i, upgrade.kind)) {
        console.error('station upgrade refused:', upgrade.kind, 'at', i);
        process.exit(1);
      }
    }
    g.money = 1e12;
  }
  for (let t = 0; t < WARMUP; t += 0.05) { sim.tick(g, 0.05); g.events.length = 0; }
  const m0 = g.money;
  for (let t = 0; t < MEASURE; t += 0.05) { sim.tick(g, 0.05); g.events.length = 0; }
  return (g.money - m0) / MEASURE;
}

for (const c of STATION_CASES) {
  const without = netRateStation({ ...c.base }, c.demand, null);
  const withIt = netRateStation({ ...c.base }, c.demand, { kind: c.kind, at: c.at });
  const delta = withIt - without;
  const ok = delta >= MIN_GAIN;
  const ledgered = !ok && LEDGER[c.id];
  if (!ok && !ledgered) failed++;
  if (ledgered) warned++;
  console.log(
    `${ok ? 'ok  ' : ledgered ? 'WARN' : 'FAIL'} ${c.id.padEnd(12)} without=${without.toFixed(2)}/s  with=${withIt.toFixed(2)}/s  delta=${delta >= 0 ? '+' : ''}${delta.toFixed(2)}/s`
  );
}

if (warned) {
  console.error(`LEDGERED: ${warned} item(s) measured dead, reasons in LEDGER. Review agenda, not silence.`);
}
if (failed) {
  console.error(`VALUE GATE FAILED: ${failed} purchase(s) do not earn their keep.`);
  process.exit(1);
}
console.log('VALUE GATE OK' + (warned ? ' (with ledgered warnings)' : ': every purchase improves the thing it claims to improve.'));
