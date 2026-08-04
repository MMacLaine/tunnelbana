// Smoke test for the M1 engine: the active-play arc, placement rules, the
// OD/fare model, political capital, the mothball deficit rule (incl. the
// no-death-spiral invariant), offline progress, and save round-trips.
// Run: node _dev/smoke.mjs
import * as sim from '../src/sim.js';
import { ANCHORS } from '../src/data.js';

const err = (msg) => { console.error('ASSERT FAILED: ' + msg); process.exit(1); };

// --- Placement and density rules ---
{
  const g = sim.newGame();
  if (sim.placementProblem(g, 'head', [59.3260, 18.0700]) !== 'water') err('water placement should be rejected');
  if (sim.placementProblem(g, 'tail', [59.3079, 18.0764]) !== 'tooClose') err('min spacing should be enforced');
  if (!(sim.freeSpotValue([59.2980, 18.0490]) > 0.35)) err('Årsta should beat the density floor');
  if (sim.freeSpotValue([59.2000, 18.4000]) !== 0.35) err('nowhere should sit at the density floor');
}

// --- Fares are paid at boarding, per passenger-kilometre ---
{
  const g = sim.newGame();
  const before = g.money;
  sim.dispatch(g); // seeded platform boards immediately
  if (!(g.money > before)) err('boarding should pay fares immediately');
}

// --- The active-play arc: anchors in order, one free spot, greedy upgrades ---
const g = sim.newGame();
const UPGRADES = ['drivers', 'train', 'timetable', 'capacity', 'bogies', 'turnstiles', 'train', 'timetable', 'capacity'];
let up = 0;
let freeSpotPlaced = false;

for (let t = 0; t < 600; t += 0.05) {
  sim.tick(g, 0.05);
  if (Math.floor(t * 20) % 12 === 0) sim.dispatch(g);
  const nextIdx = g.line.length - (freeSpotPlaced ? 1 : 0);
  if (nextIdx < ANCHORS.length && !sim.placementProblem(g, 'tail', ANCHORS[nextIdx].geo)) {
    const cost = sim.extensionCost(g, 'tail', ANCHORS[nextIdx].geo);
    sim.extendTo(g, 'tail', ANCHORS[nextIdx].geo, nextIdx);
    console.log(`t=${t.toFixed(0).padStart(3)}s  EXTEND ${ANCHORS[nextIdx].name.padEnd(16)} cost=${cost}  money=${Math.round(g.money)}  stations=${g.line.length}`);
  } else if (t > 200 && !freeSpotPlaced && !sim.placementProblem(g, 'head', [59.3180, 18.0560])) {
    sim.extendTo(g, 'head', [59.3180, 18.0560], null);
    freeSpotPlaced = true;
    console.log(`t=${t.toFixed(0).padStart(3)}s  FREE SPOT (head)  stations=${g.line.length}`);
  } else if (up < UPGRADES.length && sim.canBuy(g, UPGRADES[up])) {
    sim.buy(g, UPGRADES[up]);
    console.log(`t=${t.toFixed(0).padStart(3)}s  bought ${UPGRADES[up].padEnd(10)} money=${Math.round(g.money)}`);
    up++;
  }
  if (Math.round(t * 20) % (60 * 20) === 0) {
    console.log(`t=${t.toFixed(0).padStart(3)}s  money=${String(Math.round(g.money)).padStart(6)}  delivered=${String(Math.round(g.totalDelivered)).padStart(6)}  stations=${g.line.length}  pk=${g.pk.toFixed(1)}  cover=${Math.round(sim.coverage(g) * 100)}%  gross=${sim.grossRate(g).toFixed(1)}/s upkeep=${sim.upkeepRate(g).toFixed(1)}/s`);
  }
  g.events.length = 0;
}

if (!(g.pk > 0)) err('political capital should accrue');
const free = g.line.find((s) => s.anchor === null);
if (!free || free.name.indexOf('Södermalm') !== 0) err('free spot near Södermalm should take the district name, got ' + (free && free.name));

// Demolition: keep trying the head until no train blocks it.
{
  const before = g.line.length;
  let done = false;
  for (let t = 0; t < 60 && !done; t += 0.05) {
    sim.tick(g, 0.05);
    done = sim.demolish(g, 'head');
    g.events.length = 0;
  }
  if (!done || g.line.length !== before - 1) err('demolish head failed');
}

// Save round-trip preserves the line, catalog levels, and pk.
{
  const back = sim.hydrate(sim.serialize(g));
  if (back.line.length !== g.line.length) err('save round-trip lost stations');
  if (back.owned.timetable !== g.owned.timetable) err('save round-trip lost catalog levels');
  if (!(back.pk > 0)) err('save round-trip lost pk');
}

// --- Deficit: auto-mothballing reaches a floor instead of a death spiral ---
{
  const d = sim.newGame(); // 3 stations: cheap line, income far below 8-train upkeep
  d.money = 1e6;
  sim.buy(d, 'drivers');
  for (let i = 0; i < 7; i++) sim.buy(d, 'train');
  d.money = 0;
  const upkeepBefore = sim.upkeepRate(d);
  for (let t = 0; t < 300; t += 0.05) { sim.tick(d, 0.05); d.events.length = 0; }
  const mb = sim.mothballedTrains(d).length;
  if (!(mb >= 6)) err('sustained deficit should mothball the surplus fleet, mothballed=' + mb);
  if (!(sim.upkeepRate(d) < upkeepBefore * 0.45)) err('mothballing should cut upkeep hard');
  if (d.trains.filter((t) => !t.mothballed).length < 1) err('auto-mothball must keep one active train');
  if (!sim.reactivate(d)) err('reactivate should work');
}

// --- Offline progress: drivers earn while away, capped ---
{
  const o = sim.newGame();
  o.money = 1e6;
  while (o.line.length < ANCHORS.length) sim.extendTo(o, 'tail', ANCHORS[o.line.length].geo, o.line.length);
  sim.buy(o, 'drivers');
  sim.buy(o, 'train');
  o.money = 100;
  const rep = sim.simulateOffline(o, 2 * 3600);
  if (!rep || !(rep.earned > 0)) err('offline with drivers should earn');
  if (sim.simulateOffline(o, 30) !== null) err('short gaps should not produce an offline report');
  const capped = sim.simulateOffline(o, 99 * 3600);
  if (capped.seconds !== sim.BAL.offlineCapS) err('offline must cap');
}

const ok = g.line.length >= 10 && g.totalDelivered > 2000 && g.money >= 0 && up >= 5 && freeSpotPlaced;
console.log(ok ? 'SMOKE OK' : `SMOKE FAILED stations=${g.line.length} delivered=${Math.round(g.totalDelivered)} upgrades=${up} freeSpot=${freeSpotPlaced}`);
process.exit(ok ? 0 : 1);
