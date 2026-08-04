// Smoke test for the M2 engine: the active-play arc, placement rules, the
// OD/fare model, eras and megaprojects, the second line with interchange
// transfer flow, surges, political capital, the mothball deficit rule, offline
// progress, and save round-trips. Run: node _dev/smoke.mjs
import * as sim from '../src/sim.js';
import { ANCHORS, WEST_FIRST } from '../src/data.js';

const err = (msg) => { console.error('ASSERT FAILED: ' + msg); process.exit(1); };

// --- Placement, density, start state ---
{
  const g = sim.newGame();
  if (sim.placementProblem(g, 0, 'head', [59.3260, 18.0700]) !== 'water') err('water placement should be rejected');
  if (sim.placementProblem(g, 0, 'tail', [59.3201, 18.0722]) !== 'tooClose') err('min spacing should be enforced');
  if (g.lines[0].stations[0].name !== 'T-Centralen' || !g.lines[0].stations[0].hub) err('the game should start at the T-Centralen hub');
  // District budgets: a fresh spot in Årsta claims real population; nowhere
  // gets the floor; and a SECOND station drinking from the same source gets
  // less than the first did (diminishing returns are structural now).
  if (!(sim.freeSpotValue(g, [59.2980, 18.0490]) > 0.3)) err('Årsta should beat the demand floor');
  if (sim.freeSpotValue(g, [59.2000, 18.4000]) !== 0.15) err('nowhere should sit at the demand floor');
  const firstClaim = sim.freeSpotValue(g, [59.3140, 18.0700]);   // Södermalm, near existing line
  g.money = 1e9;
  sim.extendTo(g, 0, 'tail', [59.3120, 18.0650], null);
  const secondClaim = sim.freeSpotValue(g, [59.3140, 18.0700]);
  if (!(secondClaim < firstClaim)) err('a second station must claim less from the same district');
  if (sim.canBuy(g, 'c4stock')) err('1965 catalog items must be era-gated');
  if (sim.canBuy(g, 'westline')) err('westline must be era-gated');
}

// --- Fares are paid at boarding, per passenger-kilometre ---
{
  const g = sim.newGame();
  const before = g.money;
  sim.dispatch(g);
  if (!(g.money > before)) err('boarding should pay fares immediately');
}

// --- The active-play arc: south anchors in order, one free spot, upgrades ---
const g = sim.newGame();
const UPGRADES = ['drivers', 'train', 'timetable', 'capacity', 'bogies', 'turnstiles', 'train', 'timetable', 'capacity'];
let up = 0;
let freeSpotPlaced = false;
let sawSurge = false;

for (let t = 0; t < 600; t += 0.05) {
  sim.tick(g, 0.05);
  if (Math.floor(t * 20) % 12 === 0) sim.dispatch(g);
  const nextIdx = g.lines[0].stations.length - (freeSpotPlaced ? 1 : 0);
  if (nextIdx < WEST_FIRST && !sim.placementProblem(g, 0, 'tail', ANCHORS[nextIdx].geo)) {
    sim.extendTo(g, 0, 'tail', ANCHORS[nextIdx].geo, nextIdx);
    console.log(`t=${t.toFixed(0).padStart(3)}s  EXTEND ${ANCHORS[nextIdx].name.padEnd(16)} money=${Math.round(g.money)}  stations=${sim.stationCount(g)}`);
  } else if (t > 200 && !freeSpotPlaced && !sim.placementProblem(g, 0, 'head', [59.3315, 18.0380])) {
    sim.extendTo(g, 0, 'head', [59.3315, 18.0380], null);
    freeSpotPlaced = true;
  } else if (up < UPGRADES.length && sim.canBuy(g, UPGRADES[up])) {
    sim.buy(g, UPGRADES[up]);
    up++;
  }
  for (const e of g.events) if (e.type === 'surge') sawSurge = true;
  if (Math.round(t * 20) % (60 * 20) === 0) {
    console.log(`t=${t.toFixed(0).padStart(3)}s  money=${String(Math.round(g.money)).padStart(6)}  delivered=${String(Math.round(g.totalDelivered)).padStart(6)}  stations=${sim.stationCount(g)}  pk=${g.pk.toFixed(1)}  gross=${sim.grossRate(g).toFixed(1)}/s`);
  }
  g.events.length = 0;
}

if (!(g.pk > 0)) err('political capital should accrue');
if (!sawSurge) err('a surge should have occurred within ten minutes');
const free = g.lines[0].stations.find((s) => s.anchor === null);
if (!free || free.name.indexOf('Kungsholmen') !== 0) err('free spot on Kungsholmen should take the district name, got ' + (free && free.name));

// --- Eras and the Västerort megaproject ---
{
  if (sim.canAdvanceEra(g) && g.pk >= 5) { /* possible if arc was generous */ }
  g.totalDelivered = Math.max(g.totalDelivered, 5000);
  g.pk = 10;
  if (!sim.advanceEra(g)) err('era advance to 1952 should succeed with reqs met');
  if (sim.eraYear(g) !== 1952) err('era should be 1952');
  if (g.pk !== 5) err('era advance should cost pk');
  if (!sim.canBuy(g, 'westline')) err('westline should be buyable in 1952 with 5 pk');
  if (!sim.buy(g, 'westline')) err('westline purchase failed');
  if (g.lines.length !== 2) err('westline should create a second line');
  if (g.lines[1].stations[0].anchor !== 0) err('line 2 should start at T-Centralen');
  if (sim.linesAtAnchor(g, 0) !== 2) err('T-Centralen should be an interchange now');
  if (!g.trains.some((t) => t.line === 1)) err('westline should come with a train');

  // Interchange transfer flow: T-Centralen queues on line 2 should grow faster
  // than a comparable lone terminus because of the transfer bonus.
  g.money = 1e6;
  sim.extendTo(g, 1, 'tail', ANCHORS[WEST_FIRST + 1].geo, WEST_FIRST + 1);
  for (let t = 0; t < 30; t += 0.05) { sim.tick(g, 0.05); g.events.length = 0; }
  if (!(sim.waitingAt(g, 1, 0) > 0)) err('interchange should accumulate waiting on line 2');

  // Era gating still holds forward.
  if (sim.canBuy(g, 'c4stock')) err('c4stock must stay gated until 1965');

  // Extend the west line a few anchors and let both lines run.
  for (let k = WEST_FIRST + 2; k < WEST_FIRST + 6; k++) {
    sim.extendTo(g, 1, 'tail', ANCHORS[k].geo, k);
  }
  const d0 = g.totalDelivered;
  for (let t = 0; t < 60; t += 0.05) {
    sim.tick(g, 0.05);
    if (Math.floor(t * 20) % 10 === 0) sim.dispatch(g);
    g.events.length = 0;
  }
  if (!(g.totalDelivered > d0)) err('two-line network should deliver');
}

// Demolition still works, per line.
{
  const before = g.lines[0].stations.length;
  let done = false;
  for (let t = 0; t < 60 && !done; t += 0.05) {
    sim.tick(g, 0.05);
    done = sim.demolish(g, 0, 'head');
    g.events.length = 0;
  }
  if (!done || g.lines[0].stations.length !== before - 1) err('demolish head failed');
}

// Save round-trip preserves the network, era, catalog levels, and pk.
{
  const back = sim.hydrate(sim.serialize(g));
  if (back.lines.length !== g.lines.length) err('save round-trip lost a line');
  if (back.lines[1].stations.length !== g.lines[1].stations.length) err('save round-trip lost line-2 stations');
  if (back.era !== g.era) err('save round-trip lost the era');
  if (back.owned.westline !== 1) err('save round-trip lost the megaproject');
  if (back.trains.length !== g.trains.length) err('save round-trip lost trains');
}

// Pre-v6 saves are retired: they must come back as a FRESH hub start, never
// as a resurrected pre-hub line.
{
  const legacy = JSON.stringify({
    saveVersion: 3, money: 500, freeSpots: 0,
    owned: { train: 0, drivers: 0, timetable: 0, capacity: 0 },
    totalDelivered: 100,
    line: [
      { name: 'Slussen', geo: [59.3200, 18.0720], anchor: 0, mult: 1 },
      { name: 'Medborgarplatsen', geo: [59.3143, 18.0736], anchor: 1, mult: 1 },
      { name: 'Skanstull', geo: [59.3078, 18.0763], anchor: 2, mult: 1 },
    ],
    waiting: [8, 8, 8],
  });
  const m = sim.hydrate(legacy);
  if (m.lines[0].stations[0].name !== 'T-Centralen' || !m.lines[0].stations[0].hub) {
    err('pre-v6 saves must start fresh at the hub, got ' + m.lines[0].stations[0].name);
  }
  if (m.money !== sim.BAL.startMoney) err('retired saves must not keep money');
}

// --- Deficit: auto-mothballing reaches a floor instead of a death spiral ---
{
  const d = sim.newGame();
  d.money = 1e6;
  sim.buy(d, 'drivers');
  for (let i = 0; i < 7; i++) sim.buy(d, 'train');
  d.money = 0;
  const upkeepBefore = sim.upkeepRate(d);
  for (let t = 0; t < 600; t += 0.05) { sim.tick(d, 0.05); d.events.length = 0; }
  const mb = sim.mothballedTrains(d).length;
  // The invariant is the OUTCOME: mothballing stops exactly when the smaller
  // fleet stops losing, and the system recovers instead of spiralling.
  // Outcome invariants, not mechanism counts: the auto-mothball engaged, it
  // stopped the moment the smaller operation was solvent, and money recovers.
  if (!(mb >= 1)) err('sustained deficit should mothball surplus trains, mothballed=' + mb);
  if (!(sim.upkeepRate(d) < upkeepBefore)) err('mothballing should cut upkeep');
  if (!(d.money > 500)) err('the system should RECOVER after mothballing, money=' + Math.round(d.money));
  if (!(sim.grossRate(d) > sim.upkeepRate(d))) err('the post-mothball operation must be profitable');
  if (d.trains.filter((t) => !t.mothballed).length < 1) err('auto-mothball must keep one active train');
  if (!sim.reactivate(d)) err('reactivate should work');
}

// --- Offline progress: drivers earn while away, capped ---
{
  const o = sim.newGame();
  o.money = 1e6;
  while (o.lines[0].stations.length < WEST_FIRST) {
    sim.extendTo(o, 0, 'tail', ANCHORS[o.lines[0].stations.length].geo, o.lines[0].stations.length);
  }
  sim.buy(o, 'drivers');
  sim.buy(o, 'train');
  o.money = 100;
  // The closed-form estimate reads the measured online rate: warm it up first.
  for (let t = 0; t < 120; t += 0.05) { sim.tick(o, 0.05); o.events.length = 0; }
  const rep = sim.simulateOffline(o, 2 * 3600);
  if (!rep || !(rep.earned > 0)) err('offline with drivers should earn');
  const noDrivers = sim.newGame();
  if (sim.simulateOffline(noDrivers, 3600) !== null) err('offline without drivers must earn nothing');
  if (sim.simulateOffline(o, 30) !== null) err('short gaps should not produce an offline report');
  const capped = sim.simulateOffline(o, 99 * 3600);
  if (capped.seconds !== sim.BAL.offlineCapS) err('offline must cap');
}

// --- The ending fires once when the final era has every anchor connected ---
{
  const e = sim.newGame();
  e.money = 1e9;
  e.era = 4; // 1975
  // Line 0 takes the southern anchors, line 1 the west; both from the hub.
  for (let k = sim.newGame().lines[0].stations.length; k < WEST_FIRST; k++) {
    sim.extendTo(e, 0, 'tail', ANCHORS[k].geo, k);
  }
  e.lines.push({
    stations: [e.lines[0].stations[0]],
    waitingF: [0], waitingB: [0], rev: 0,
  });
  e.lines[1].stations = [e.lines[0].stations[0]];
  for (let k = WEST_FIRST; k < ANCHORS.length; k++) {
    e.lines[1].stations.push({ name: ANCHORS[k].name, geo: ANCHORS[k].geo, anchor: k, mult: 1, hub: false });
    e.lines[1].waitingF.push(0);
    e.lines[1].waitingB.push(0);
  }
  e.lines[1].rev++;
  sim.tick(e, 0.05);
  if (!e.endingSeen) err('the ending should fire when the arc completes');
  if (!e.events.some((x) => x.type === 'ending')) err('ending event missing');
  e.events.length = 0;
  sim.tick(e, 0.05);
  if (e.events.some((x) => x.type === 'ending')) err('the ending must fire only once');
  const back = sim.hydrate(sim.serialize(e));
  if (!back.endingSeen) err('endingSeen must persist');
}

const ok = sim.stationCount(g) >= 14 && g.totalDelivered > 5000 && g.money >= 0 && up >= 5 && freeSpotPlaced;
console.log(ok ? 'SMOKE OK' : `SMOKE FAILED stations=${sim.stationCount(g)} delivered=${Math.round(g.totalDelivered)} upgrades=${up} freeSpot=${freeSpotPlaced}`);
process.exit(ok ? 0 : 1);
