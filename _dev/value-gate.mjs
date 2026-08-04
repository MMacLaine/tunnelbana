// The monotonic-value gate (report 634 §1c): for every catalog item, measure
// steady-state net income with and without it under a config where the item
// SHOULD matter, and fail the build if buying it makes the player worse off or
// a marginal level does nothing. This is the gate that would have caught
// drivers-worse-than-clicking (622), free-placement 2:1 (624), and the dead
// fleet (634). Run: node _dev/value-gate.mjs
import * as sim from '../src/sim.js';
import { ANCHORS, WEST_FIRST } from '../src/data.js';

// A trunk round trip is ~270 s at 2026-08-04 speeds; warmup must cover at
// least one full cycle and the measurement window more than one, or the gate
// grades transient ramp-up instead of steady state.
const WARMUP = 360;
const MEASURE = 360;
const MIN_GAIN = 0.05; // kr/s a purchase must add in its scenario
// An absolute floor alone hides a class of problem (report 646 sec c: st ent
// fell +3.30 -> +0.08 across the slowdown and still 'passed', clearing the
// floor by four hundredths of a krona). So the gate also grades RELATIVE to
// the scenario's own income: a purchase worth less than this share of what
// the network already earns is reported THIN. Thin is a signal, not a build
// break, in the same spirit as the surge averaging: the instrument says what
// it saw instead of collapsing it to a boolean.

// The expected-fail ledger. A ledger entry must record the MEASUREMENT that
// justifies it, not just the mechanism that explains it (report 638 §7: a
// plausible story covered a wiring bug for a full slice; a delta pinned to an
// item's exact upkeep across a 16x demand sweep is wiring, not balance).
// Emptied after 638: the five entries were one cache bug (fixed), one demand
// scale (raised), one guarded buff (through), and two documented EXCLUSIONS:
// - 'atc' is priced as COMFORT (holding rarely fires under terminus dispatch;
//   event-driven turnaround is M5). A legibility purchase is not graded here.
// - 'st tier2' is COMMITMENT infrastructure by design ruling (638 §2): gated
//   slightly negative on income alone; entrances and gates are the payers,
//   tier is the unlock (tier 3 founds lines).
const LEDGER = {};

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
    if (id === 'trainSplit') continue; // fleet allocation directive, not a catalog item
    g.owned[id] = n;
    if (id === 'train') {
      for (let i = 0; i < n; i++) {
        // With two lines, bought trains alternate so both are staffed; a case
        // may instead stack the whole bought fleet on the branch
        // (trainSplit: 'west'), the moveTrain allocation play.
        const line = owned.trainSplit === 'west' ? 1 : owned.westline ? i % 2 : 0;
        g.trains.push({ line, at: 0, run: null, mothballed: false, readyAt: 0 });
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

// Surge PHASE is a regime, not noise (report 640): a case can be positive when
// surges favour its station and negative when they load trains elsewhere. So
// every measurement runs across phase offsets and is graded on the MEAN delta,
// with the spread reported; a bimodal item announces itself through its spread
// instead of vanishing behind a pinned phase.
const SURGE_PHASES = [5, 35, 65, 95];
const REL_THIN = 0.01; // 1% of the scenario's own net income

// Net income (kr/s) at steady state; money pinned high so deficits never mothball.
function netRate(owned, demand, surgeAt) {
  const g = build(owned, demand);
  g.nextSurgeAt = surgeAt;
  for (let t = 0; t < WARMUP; t += 0.05) { sim.tick(g, 0.05); g.events.length = 0; }
  const m0 = g.money;
  for (let t = 0; t < MEASURE; t += 0.05) { sim.tick(g, 0.05); g.events.length = 0; }
  return (g.money - m0) / MEASURE;
}

function measure(withoutOwned, withOwned, demand, applyStation) {
  const bases = [];
  const deltas = SURGE_PHASES.map((ph) => {
    const a = applyStation ? netRateStation(withoutOwned, demand, null, ph) : netRate(withoutOwned, demand, ph);
    const b = applyStation ? netRateStation(withOwned.owned, demand, withOwned.upgrade, ph) : netRate(withOwned, demand, ph);
    bases.push(a);
    return b - a;
  });
  const mean = deltas.reduce((x, y) => x + y, 0) / deltas.length;
  const sd = Math.sqrt(deltas.reduce((x, y) => x + (y - mean) ** 2, 0) / deltas.length);
  const min = Math.min(...deltas);
  const base = bases.reduce((x, y) => x + y, 0) / bases.length;
  return { mean, sd, min, base };
}

// One report line per case, with the relative reading spelled out.
function report(c, m) {
  const ok = m.mean >= MIN_GAIN;
  // The relative test is meaningless when the scenario earns nothing without
  // the item (drivers from a standing start): everything is infinitely thick
  // against zero, so measure only where there is a base to be a share OF.
  const rated = m.base >= 1;
  const share = rated ? m.mean / m.base : NaN;
  const thin = ok && rated && share < REL_THIN;
  const ledgered = !ok && LEDGER[c.id];
  console.log(
    `${ok ? (thin ? 'THIN' : 'ok  ') : ledgered ? 'WARN' : 'FAIL'} ${c.id.padEnd(12)} ` +
    `mean=${m.mean >= 0 ? '+' : ''}${m.mean.toFixed(2)}/s  sd=${m.sd.toFixed(2)}  ` +
    `worst=${m.min >= 0 ? '+' : ''}${m.min.toFixed(2)}/s  ` +
    (rated ? `${(share * 100).toFixed(2)}% of base` : 'base~0')
  );
  return { ok, thin, ledgered };
}

// Each case: a baseline where the item's effect should bind, plus the marginal
// buy, in the demand regime where the item has a job to do.
const CASES = [
  { id: 'drivers',    demand: 'low',  base: {},                                        buy: { drivers: 1 } },
  { id: 'train #2',   demand: 'high', base: { drivers: 1 },                            buy: { train: 1 } },
  { id: 'train 2-line',demand: 'high', base: { drivers: 1, westline: 1 },              buy: { train: 1 } },
  // timetable pays as REGULARITY (even-interval terminus dispatch: less
  // bunching, less abandonment). Max is 1: at current speeds no reachable
  // fleet gets terminus spacing under the signalling floor, so every
  // floor-only level measured dead (incl. the whole fleet stacked on a short
  // branch via trainSplit, +0.08/s phase-invariant, 2026-08-04).
  { id: 'timetable',  demand: 'high', base: { drivers: 1, train: 3 },                  buy: { timetable: 1 } },
  { id: 'capacity',   demand: 'high', base: { drivers: 1, train: 1 },                  buy: { capacity: 1 } },
  { id: 'bogies',     demand: 'high', base: { drivers: 1, train: 1, timetable: 1 },    buy: { bogies: 1 } },
  { id: 'turnstiles', demand: 'low',  base: { drivers: 1, train: 2 },                  buy: { turnstiles: 1 } },
  // Demand-side items need SERVICE HEADROOM to convert: with accessibility
  // raising baseline generation (646 accessibility work), a 3-train line is
  // already shedding riders to crowding, so extra catchment only abandons
  // (measured -0.22 at train:3, positive from train:5). Same lesson st ent
  // taught at the slowdown.
  { id: 'entrances',  demand: 'low',  base: { drivers: 1, train: 5, timetable: 1 },    buy: { entrances: 1 } },
  { id: 'through',    demand: 'low',  base: { drivers: 1, train: 2, westline: 1 },     buy: { through: 1 } },
  { id: 'stock1957',  demand: 'high', base: { drivers: 1, train: 1, timetable: 1 },    buy: { stock1957: 1 } },
  { id: 'c4stock',    demand: 'high', base: { drivers: 1, train: 1, timetable: 1 },    buy: { c4stock: 1 } },
  { id: 'c14stock',   demand: 'high', base: { drivers: 1, train: 1, timetable: 1 },    buy: { c14stock: 1 } },
  { id: 'zonefare',   demand: 'low',  base: { drivers: 1, train: 2 },                  buy: { zonefare: 1 } },
  // Late sinks (638 §5): each must still earn its keep in its regime.
  { id: 'artstation', demand: 'mid',  base: { drivers: 1, train: 4, timetable: 1 },   buy: { artstation: 1 } },
  { id: 'cbtc',       demand: 'high', base: { drivers: 1, train: 1, timetable: 1, atc: 1 }, buy: { cbtc: 1 } },
  { id: 'nightservice', demand: 'high', base: { drivers: 1, train: 3, timetable: 1 }, buy: { nightservice: 1 } },
];

let failed = 0;
let warned = 0;
let thinCount = 0;
for (const c of CASES) {
  const m = measure({ ...c.base }, { ...c.base, ...c.buy }, c.demand, false);
  const r = report(c, m);
  if (!r.ok && !r.ledgered) failed++;
  if (r.ledgered) warned++;
  if (r.thin) thinCount++;
}

// Per-station upgrades (slice 1) must also earn their keep. Applied to the
// busiest platform (T-Centralen, index 0) in the regime where each binds.
const STATION_CASES = [
  // Gates pay only when arriving trains have ROOM (640: coupled to capacity).
  { id: 'st gates',  demand: 'high', base: { drivers: 1, capacity: 2 }, kind: 'gates' },
  // Demand-side upgrades need SERVICE HEADROOM: in 'mid' at 2026-08-04 train
  // speeds the platform caps bind between visits and extra catchment just
  // abandons (measured +0.02). 'low' with a real fleet is where ent converts.
  { id: 'st ent',    demand: 'low',  base: { drivers: 1, train: 4, timetable: 1 }, kind: 'ent' },
];

function netRateStation(owned, demand, upgrade, surgeAt) {
  const g = build(owned, demand);
  g.nextSurgeAt = surgeAt;
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
  const m = measure(
    { ...c.base },
    { owned: { ...c.base }, upgrade: { kind: c.kind, at: c.at } },
    c.demand, true
  );
  const r = report(c, m);
  if (!r.ok && !r.ledgered) failed++;
  if (r.ledgered) warned++;
  if (r.thin) thinCount++;
}

if (thinCount) {
  console.error(`THIN: ${thinCount} purchase(s) earn less than ${REL_THIN * 100}% of their scenario's income. ` +
    'Passing, but on the agenda: this is how a live item decays into dead content.');
}
if (warned) {
  console.error(`LEDGERED: ${warned} item(s) measured dead, reasons in LEDGER. Review agenda, not silence.`);
}
if (failed) {
  console.error(`VALUE GATE FAILED: ${failed} purchase(s) do not earn their keep.`);
  process.exit(1);
}
console.log('VALUE GATE OK' + (warned ? ' (with ledgered warnings)' : ': every purchase improves the thing it claims to improve.'));
