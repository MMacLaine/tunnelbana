// Simulation: multiple lines with free station placement, origin-destination
// passenger flows, distance-based fares, upkeep with mothballing, eras and
// megaprojects, political capital, surges, and offline progress. Aggregate
// flows, never agents (plan §4). DOM-free so it runs under node for smoke tests.

import { ANCHORS, DISTRICTS, START_BUILT, WEST_FIRST, WATER, kmBetween, crossesWater, inRing, densityAt } from './data.js';

export const BAL = {
  startMoney: 300,
  farePerKm: 2.4,          // kr per passenger-kilometre, paid as passengers board
  gravityExp: 1.4,         // distance decay for destination choice (2 makes every trip a one-stop hop)
  gravityFloorKm: 0.4,     // distances below this stop mattering to destination choice
  spawnPerSec: 0.5,        // base passengers per station per second (full demand)
  transferSpawn: 0.25,     // extra spawn per second per OTHER line at an interchange
  demolishCost: 150,       // flat cost to remove a line end; provisional
  stationCapBase: 80,      // base waiting cap per station
  cityGrowthDiv: 900,      // demand multiplier = 1 + delivered / this
  trainCapBase: 120,
  upkeepPerTrainPerSec: 1.2,
  mothballShare: 0.2,      // a mothballed train costs this share of upkeep
  deficitMothballAfter: 20,// seconds broke and losing before a train auto-mothballs
  secondsPerKm: 1.05,      // ride time from geo distance
  dwell: 0.32,             // per-stop time added to each segment
  dispatchBase: 8,         // drivers auto-dispatch interval, seconds
  seedWaiting: 8,          // passengers on a platform when it opens
  stationBase: 150,        // flat station cost, grows with network size
  stationGrowth: 1.25,
  trackPerKm: 150,         // kr per km of track
  waterMult: 2.0,          // track cost multiplier when the segment crosses water
  minSpacingKm: 0.35,      // same-line stations may not land closer than this
  maxStations: 40,         // network-wide cap (upgrades can raise it)
  pkFullRatePerSec: 0.02,  // political capital per second at 100% regional coverage
  surgeEvery: 120,         // seconds between rush events
  surgeDur: 25,            // seconds a rush lasts
  surgeSpawnMult: 3,       // spawn multiplier at the rushed station
  surgeFareMult: 1.5,      // fare multiplier for boardings at the rushed station
  offlineCapS: 8 * 3600,   // offline progress simulates at most this long
};

// The era arc. Advancing costs political capital and requires ridership; each
// era unlocks its slice of the catalog (and the Västerort megaproject in 1952).
export const ERAS = [
  { year: 1950 },
  { year: 1952, pk: 5,  delivered: 4000 },
  { year: 1957, pk: 12, delivered: 15000 },
  { year: 1965, pk: 25, delivered: 40000 },
  { year: 1975, pk: 50, delivered: 100000 },
];

// The upgrade CATALOG (plan §6, Cookie Clicker direction): upgrades are DATA, and
// their effects compose through named modifiers, never through code reading BAL
// directly. `mult` effects multiply per level owned; `add` effects add per level.
// `currency: 'pk'` marks megaprojects; `kind` marks purchases with side effects.
export const CATALOG = [
  { id: 'train',      base: 600,  growth: 1.6, max: 8, era: 1950, kind: 'fleet' },
  { id: 'drivers',    base: 900,  growth: 1,   max: 1, era: 1950 },
  { id: 'timetable',  base: 1400, growth: 1.8, max: 6, era: 1950, needs: 'drivers',
    mult: { dispatchInterval: 0.82 } },
  { id: 'capacity',   base: 800,  growth: 1.7, max: 6, era: 1950,
    add: { trainCap: 60 } },
  { id: 'bogies',     base: 1200, growth: 1,   max: 1, era: 1950,
    mult: { speed: 0.9 } },
  { id: 'turnstiles', base: 1600, growth: 1,   max: 1, era: 1950,
    mult: { fare: 1.05 } },
  { id: 'westline',   base: 5,    growth: 1,   max: 1, era: 1952, currency: 'pk', kind: 'project' },
  { id: 'entrances',  base: 2200, growth: 1.7, max: 3, era: 1952,
    add: { demand: 0.1 } },
  { id: 'through',    base: 8,    growth: 1,   max: 1, era: 1957, currency: 'pk',
    mult: { transfer: 1.5 } },
  { id: 'stock1957',  base: 3000, growth: 1,   max: 1, era: 1957,
    mult: { speed: 0.92 } },
  { id: 'atc',        base: 6,    growth: 1,   max: 1, era: 1965, currency: 'pk',
    mult: { dispatchInterval: 0.85 } },
  { id: 'c4stock',    base: 6000, growth: 1,   max: 1, era: 1965,
    mult: { speed: 0.9 } },
  { id: 'depot',      base: 4000, growth: 1.8, max: 2, era: 1965,
    add: { fleetMax: 4 } },
  { id: 'c14stock',   base: 15000, growth: 1,  max: 1, era: 1975,
    mult: { speed: 0.9 } },
  { id: 'zonefare',   base: 20000, growth: 1,  max: 1, era: 1975,
    mult: { fare: 1.15 } },
];

export function effectMult(g, key) {
  let m = 1;
  for (const u of CATALOG) {
    const n = g.owned[u.id] || 0;
    if (n && u.mult && u.mult[key] !== undefined) m *= Math.pow(u.mult[key], n);
  }
  return m;
}

export function effectAdd(g, key) {
  let a = 0;
  for (const u of CATALOG) {
    const n = g.owned[u.id] || 0;
    if (n && u.add && u.add[key] !== undefined) a += u.add[key] * n;
  }
  return a;
}

export const HUB_MULT = 1.5; // the hub is the busiest platform in the region

// Total authored regional population, dormant districts included (report 620
// finding 3). Units are demand multiples; anchors count their demand weight.
export const REGION_POP =
  ANCHORS.reduce((a, x) => a + (x.hub ? HUB_MULT : 1), 0) +
  DISTRICTS.reduce((a, d) => a + d.w, 0);

function anchorStation(i) {
  const a = ANCHORS[i];
  return { name: a.name, geo: a.geo, anchor: i, mult: a.hub ? HUB_MULT : 1, hub: !!a.hub };
}

function newLine(stations) {
  return {
    stations,
    waitingF: stations.map((s) => BAL.seedWaiting * s.mult / 2),
    waitingB: stations.map((s) => BAL.seedWaiting * s.mult / 2),
    rev: 0,
  };
}

export function newGame() {
  const owned = {};
  for (const u of CATALOG) owned[u.id] = 0;
  return {
    clock: 0,
    money: BAL.startMoney,
    pk: 0,
    era: 0,
    lines: [newLine(Array.from({ length: START_BUILT }, (_, i) => anchorStation(i)))],
    trains: [{ line: 0, at: 0, run: null, mothballed: false }],
    owned,
    freeSpots: 0,
    autoTimer: 0,
    deficitT: 0,
    totalDelivered: 0,
    grossEma: 0,
    surge: null,          // { line, idx, until, name }
    nextSurgeAt: 90,
    surgeCounter: 0,
    endingSeen: false,
    events: [],
  };
}

const GROSS_TAU = 8; // seconds; smoothing for the fares-per-second readout

export function eraYear(g) {
  return ERAS[g.era].year;
}

export function cityMult(g) {
  return 1 + g.totalDelivered / BAL.cityGrowthDiv;
}

export function stationCap(g) {
  return Math.round(BAL.stationCapBase * cityMult(g));
}

export function trainCap(g) {
  return BAL.trainCapBase + effectAdd(g, 'trainCap');
}

export function autoInterval(g) {
  return BAL.dispatchBase * effectMult(g, 'dispatchInterval');
}

export function upkeepRate(g) {
  let r = 0;
  for (const t of g.trains) r += BAL.upkeepPerTrainPerSec * (t.mothballed ? BAL.mothballShare : 1);
  return r;
}

export function grossRate(g) {
  return g.grossEma;
}

export function stationCount(g) {
  return g.lines.reduce((a, l) => a + l.stations.length, 0);
}

export function waitingAt(g, li, i) {
  return g.lines[li].waitingF[i] + g.lines[li].waitingB[i];
}

// Anchors used by a given line (an anchor on ANOTHER line is a legal snap
// target: that is how interchanges happen).
export function usedAnchorsOnLine(g, li) {
  return new Set(g.lines[li].stations.map((s) => s.anchor).filter((a) => a !== null));
}

export function usedAnchorsAll(g) {
  const set = new Set();
  for (let li = 0; li < g.lines.length; li++) {
    for (const a of usedAnchorsOnLine(g, li)) set.add(a);
  }
  return set;
}

// How many lines call at this anchor (2+ means interchange).
export function linesAtAnchor(g, anchor) {
  let n = 0;
  for (let li = 0; li < g.lines.length; li++) {
    if (g.lines[li].stations.some((s) => s.anchor === anchor)) n++;
  }
  return n;
}

// --- Gravity origin-destination model (aggregate flows, cached per line rev) ---

function od(g, li) {
  const L = g.lines[li];
  if (L._odRev === L.rev && L._od) return L._od;
  const n = L.stations.length;
  const fwd = [], bwd = [], splitF = [];
  for (let i = 0; i < n; i++) {
    const f = [], b = [];
    let fSum = 0, bSum = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const d = Math.max(0.25, kmBetween(L.stations[i].geo, L.stations[j].geo));
      const w = L.stations[j].mult / Math.pow(Math.max(BAL.gravityFloorKm, d), BAL.gravityExp);
      if (j > i) { f.push([j, w, d]); fSum += w; }
      else { b.push([j, w, d]); bSum += w; }
    }
    fwd.push({ list: f, sum: fSum });
    bwd.push({ list: b, sum: bSum });
    splitF.push(fSum + bSum > 0 ? fSum / (fSum + bSum) : 0.5);
  }
  L._od = { fwd, bwd, splitF };
  L._odRev = L.rev;
  return L._od;
}

function segTimeBetween(g, a, b) {
  return kmBetween(a.geo, b.geo) * BAL.secondsPerKm * effectMult(g, 'speed') + BAL.dwell;
}

function surgedAt(g, li, i) {
  return g.surge && g.surge.line === li && g.surge.idx === i && g.clock < g.surge.until;
}

// Board passengers heading in the train's direction; fares are paid per
// passenger-kilometre at boarding.
function board(g, train, i) {
  const li = train.line;
  const L = g.lines[li];
  const run = train.run;
  const dirs = od(g, li);
  const side = run.dir === 1 ? dirs.fwd[i] : dirs.bwd[i];
  if (!side.sum) return;
  const queue = run.dir === 1 ? L.waitingF : L.waitingB;
  const room = trainCap(g) - run.onboard;
  const take = Math.min(queue[i], room);
  if (take <= 0) return;
  queue[i] -= take;
  run.onboard += take;
  let paxKm = 0;
  for (const [j, w, d] of side.list) {
    const cnt = take * (w / side.sum);
    run.dest[j] += cnt;
    paxKm += cnt * d;
  }
  let amt = paxKm * BAL.farePerKm * effectMult(g, 'fare');
  if (surgedAt(g, li, i)) amt *= BAL.surgeFareMult;
  g.money += amt;
  g.grossEma += amt / GROSS_TAU;
  if (amt >= 0.5) g.events.push({ type: 'payout', geo: L.stations[i].geo, amt: Math.round(amt) });
}

export function idleTrains(g) {
  return g.trains.filter((t) => !t.run && !t.mothballed);
}

export function mothballedTrains(g) {
  return g.trains.filter((t) => t.mothballed);
}

function lineWaitingTotal(g, li) {
  const L = g.lines[li];
  let s = 0;
  for (let i = 0; i < L.stations.length; i++) s += L.waitingF[i] + L.waitingB[i];
  return s;
}

export function dispatch(g) {
  // The idle train on the hungriest line goes first.
  const idle = idleTrains(g);
  if (!idle.length) return false;
  let train = idle[0], best = -1;
  for (const t of idle) {
    const w = lineWaitingTotal(g, t.line);
    if (w > best) { best = w; train = t; }
  }
  const L = g.lines[train.line];
  const dir = train.at === 0 ? 1 : -1;
  const next = L.stations[train.at + dir];
  if (!next) return false;
  train.run = {
    dir, from: train.at, t: 0, onboard: 0,
    dest: new Array(L.stations.length).fill(0),
    dur: segTimeBetween(g, L.stations[train.at], next),
  };
  board(g, train, train.at);
  return true;
}

function arrive(g, train) {
  const L = g.lines[train.line];
  const run = train.run;
  run.from += run.dir;
  run.t = 0;
  const k = run.from;
  const off = run.dest[k] || 0;
  if (off > 0) {
    run.dest[k] = 0;
    run.onboard = Math.max(0, run.onboard - off);
    g.totalDelivered += off;
    if (off >= 1) g.events.push({ type: 'alight', geo: L.stations[k].geo, n: Math.round(off) });
  }
  const atTerminus = k === 0 || k === L.stations.length - 1;
  if (atTerminus) {
    g.totalDelivered += Math.max(0, run.onboard);
    train.at = k;
    train.run = null;
  } else {
    board(g, train, k);
    run.dur = segTimeBetween(g, L.stations[k], L.stations[k + run.dir]);
  }
}

// Share of the authored regional population with quality rail access. Stations
// shared between lines (interchanges) count once, at their strongest.
export function coverage(g) {
  const cap = stationCap(g);
  const seen = new Map();
  for (let li = 0; li < g.lines.length; li++) {
    const L = g.lines[li];
    for (let i = 0; i < L.stations.length; i++) {
      const s = L.stations[i];
      const key = s.anchor !== null ? 'a' + s.anchor : s.geo[0].toFixed(4) + ',' + s.geo[1].toFixed(4);
      const crowd = Math.min(1, waitingAt(g, li, i) / (cap * s.mult));
      const val = s.mult * (1 - 0.7 * crowd);
      if (!seen.has(key) || seen.get(key) < val) seen.set(key, val);
    }
  }
  let cov = 0;
  for (const v of seen.values()) cov += v;
  return Math.min(1, cov / REGION_POP);
}

export function tick(g, dt) {
  g.clock += dt;

  // Surges: a station rushes on a steady cadence; deterministic rotation.
  if (g.surge && g.clock >= g.surge.until) g.surge = null;
  if (!g.surge && g.clock >= g.nextSurgeAt) {
    const flat = [];
    for (let li = 0; li < g.lines.length; li++) {
      for (let i = 0; i < g.lines[li].stations.length; i++) flat.push([li, i]);
    }
    const [li, i] = flat[g.surgeCounter % flat.length];
    g.surgeCounter += 3; // co-prime-ish hop so the rotation feels less mechanical
    g.surge = { line: li, idx: i, until: g.clock + BAL.surgeDur, name: g.lines[li].stations[i].name };
    g.nextSurgeAt = g.clock + BAL.surgeEvery;
    g.events.push({ type: 'surge', geo: g.lines[li].stations[i].geo, name: g.surge.name });
  }

  // Passengers gather, split by direction from the gravity weights; demand
  // grows with everyone you have moved. Interchanges add transfer flow.
  const cap = stationCap(g);
  const demandMult = 1 + effectAdd(g, 'demand');
  for (let li = 0; li < g.lines.length; li++) {
    const L = g.lines[li];
    const dirs = od(g, li);
    for (let i = 0; i < L.stations.length; i++) {
      const s = L.stations[i];
      let rate = BAL.spawnPerSec * cityMult(g) * s.mult * demandMult;
      if (s.anchor !== null) {
        const others = linesAtAnchor(g, s.anchor) - 1;
        if (others > 0) rate += BAL.transferSpawn * cityMult(g) * others * effectMult(g, 'transfer');
      }
      if (surgedAt(g, li, i)) rate *= BAL.surgeSpawnMult;
      const room = cap * s.mult - waitingAt(g, li, i);
      const add = Math.min(Math.max(0, room), rate * dt);
      const f = dirs.splitF[i];
      L.waitingF[i] += add * f;
      L.waitingB[i] += add * (1 - f);
    }
  }

  // Upkeep drains, floored at zero; a sustained deficit mothballs a train.
  g.money = Math.max(0, g.money - upkeepRate(g) * dt);
  const losing = g.money < upkeepRate(g) * 10 && grossRate(g) < upkeepRate(g);
  g.deficitT = losing ? g.deficitT + dt : Math.max(0, g.deficitT - dt * 0.5);
  if (g.deficitT >= BAL.deficitMothballAfter) {
    const active = g.trains.filter((t) => !t.mothballed);
    const cand = active.find((t) => !t.run);
    if (active.length > 1 && cand) {
      cand.mothballed = true;
      g.events.push({ type: 'mothball', geo: g.lines[cand.line].stations[cand.at].geo });
    }
    g.deficitT = 0;
  }

  // Trains move.
  for (const train of g.trains) {
    if (!train.run) continue;
    train.run.t += dt;
    while (train.run && train.run.t >= train.run.dur) {
      train.run.t -= train.run.dur;
      arrive(g, train);
    }
  }

  // Drivers dispatch on their own once hired.
  if (g.owned.drivers) {
    g.autoTimer -= dt;
    if (g.autoTimer <= 0) {
      g.autoTimer = dispatch(g) ? autoInterval(g) : 0.25;
    }
  }

  // Political capital accrues from coverage.
  g.pk += BAL.pkFullRatePerSec * coverage(g) * dt;

  // The ending: final era reached and every authored anchor connected. The
  // screen is not a wall; the save keeps running (plan §1).
  if (!g.endingSeen && g.era === ERAS.length - 1 &&
      usedAnchorsAll(g).size === ANCHORS.length) {
    g.endingSeen = true;
    g.events.push({ type: 'ending' });
  }

  g.grossEma = Math.max(0, g.grossEma - g.grossEma * dt / GROSS_TAU);
}

// --- Eras ---

export function nextEra(g) {
  return g.era + 1 < ERAS.length ? ERAS[g.era + 1] : null;
}

export function canAdvanceEra(g) {
  const e = nextEra(g);
  return !!e && g.totalDelivered >= e.delivered && g.pk >= e.pk;
}

export function advanceEra(g) {
  if (!canAdvanceEra(g)) return false;
  const e = nextEra(g);
  g.pk -= e.pk;
  g.era += 1;
  g.events.push({ type: 'era', year: e.year });
  return true;
}

// --- Mothballing (manual; the automatic path lives in tick) ---

export function mothball(g) {
  const active = g.trains.filter((t) => !t.mothballed);
  const cand = active.find((t) => !t.run);
  if (!cand || active.length <= 1) return false;
  cand.mothballed = true;
  return true;
}

export function reactivate(g) {
  const t = g.trains.find((x) => x.mothballed);
  if (!t) return false;
  t.mothballed = false;
  return true;
}

// --- Extending a line: from either end, to an anchor or a free spot ---

export function endStation(g, li, end) {
  const L = g.lines[li];
  return end === 'head' ? L.stations[0] : L.stations[L.stations.length - 1];
}

export function extensionCost(g, li, end, geo) {
  const from = endStation(g, li, end);
  const km = kmBetween(from.geo, geo);
  const station = BAL.stationBase * Math.pow(BAL.stationGrowth, stationCount(g) - START_BUILT);
  const track = km * BAL.trackPerKm * (crossesWater(from.geo, geo) ? BAL.waterMult : 1);
  return Math.round(station + track);
}

export function maxStationsNow(g) {
  return BAL.maxStations + effectAdd(g, 'maxStations');
}

export function placementProblem(g, li, end, geo) {
  if (stationCount(g) >= maxStationsNow(g)) return 'max';
  for (const w of WATER) if (inRing(geo, w.ring)) return 'water';
  for (const s of g.lines[li].stations) {
    if (kmBetween(s.geo, geo) < BAL.minSpacingKm) return 'tooClose';
  }
  if (g.money < extensionCost(g, li, end, geo)) return 'money';
  return null;
}

export function freeSpotValue(geo) {
  return densityAt(geo).mult;
}

const NUMERALS = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

export function freeSpotName(g, geo) {
  const base = densityAt(geo).district || 'Station';
  let taken = 0;
  for (const L of g.lines) {
    taken += L.stations.filter((s) => s.name === base || s.name.startsWith(base + ' ')).length;
  }
  // NUMERALS[0] is '' (the first take is unnumbered), so no || fallback here.
  return base + (taken < NUMERALS.length ? NUMERALS[taken] : ' ' + (taken + 1));
}

// anchorIdx is null for a free spot. An anchor already on THIS line is refused;
// an anchor on another line becomes an interchange. Returns true on success.
export function extendTo(g, li, end, geo, anchorIdx) {
  if (anchorIdx !== null && usedAnchorsOnLine(g, li).has(anchorIdx)) return false;
  if (placementProblem(g, li, end, geo)) return false;
  g.money -= extensionCost(g, li, end, geo);
  let station;
  if (anchorIdx !== null) {
    station = anchorStation(anchorIdx);
  } else {
    g.freeSpots += 1;
    station = { name: freeSpotName(g, geo), geo, anchor: null, mult: densityAt(geo).mult, hub: false };
  }
  const L = g.lines[li];
  if (end === 'head') {
    L.stations.unshift(station);
    L.waitingF.unshift(BAL.seedWaiting * station.mult / 2);
    L.waitingB.unshift(BAL.seedWaiting * station.mult / 2);
    for (const t of g.trains) {
      if (t.line !== li) continue;
      t.at += 1;
      if (t.run) {
        t.run.from += 1;
        t.run.dest.unshift(0);
      }
    }
  } else {
    L.stations.push(station);
    L.waitingF.push(BAL.seedWaiting * station.mult / 2);
    L.waitingB.push(BAL.seedWaiting * station.mult / 2);
    for (const t of g.trains) if (t.line === li && t.run) t.run.dest.push(0);
  }
  L.rev += 1;
  g.events.push({ type: 'extend', geo: station.geo, name: station.name });
  return true;
}

export function canDemolish(g, li, end) {
  const L = g.lines[li];
  if (L.stations.length <= 2) return false;
  if (g.money < BAL.demolishCost) return false;
  const idx = end === 'head' ? 0 : L.stations.length - 1;
  for (const t of g.trains) {
    if (t.line !== li) continue;
    if (!t.run && t.at === idx) return false;
    if (t.run && (t.run.from === idx || t.run.from + t.run.dir === idx)) return false;
  }
  return true;
}

export function demolish(g, li, end) {
  if (!canDemolish(g, li, end)) return false;
  g.money -= BAL.demolishCost;
  const L = g.lines[li];
  const idx = end === 'head' ? 0 : L.stations.length - 1;
  const st = L.stations[idx];
  if (end === 'head') {
    L.stations.shift();
    L.waitingF.shift();
    L.waitingB.shift();
    for (const t of g.trains) {
      if (t.line !== li) continue;
      t.at = Math.max(0, t.at - 1);
      if (t.run) {
        t.run.from -= 1;
        t.run.dest.shift();
      }
    }
  } else {
    L.stations.pop();
    L.waitingF.pop();
    L.waitingB.pop();
    for (const t of g.trains) {
      if (t.line !== li) continue;
      if (t.at >= L.stations.length) t.at = L.stations.length - 1;
      if (t.run) t.run.dest.pop();
    }
  }
  L.rev += 1;
  g.events.push({ type: 'demolish', geo: st.geo, name: st.name });
  return true;
}

// --- Catalog purchases ---

export function maxFor(g, item) {
  return item.max + (item.id === 'train' ? effectAdd(g, 'fleetMax') : 0);
}

export function eraVisible(g, item) {
  return item.era <= eraYear(g);
}

export function shopCost(g, id) {
  const item = CATALOG.find((s) => s.id === id);
  return Math.round(item.base * Math.pow(item.growth, g.owned[id]));
}

export function canBuy(g, id) {
  const item = CATALOG.find((s) => s.id === id);
  if (!eraVisible(g, item)) return false;
  if (g.owned[id] >= maxFor(g, item)) return false;
  if (item.needs && !g.owned[item.needs]) return false;
  const cost = shopCost(g, id);
  return item.currency === 'pk' ? g.pk >= cost : g.money >= cost;
}

export function buy(g, id) {
  if (!canBuy(g, id)) return false;
  const item = CATALOG.find((s) => s.id === id);
  const cost = shopCost(g, id);
  if (item.currency === 'pk') g.pk -= cost;
  else g.money -= cost;
  g.owned[id] += 1;
  if (id === 'train') {
    // The new train joins the line with the fewest trains.
    let li = 0, best = Infinity;
    for (let k = 0; k < g.lines.length; k++) {
      const n = g.trains.filter((t) => t.line === k).length;
      if (n < best) { best = n; li = k; }
    }
    g.trains.push({ line: li, at: 0, run: null, mothballed: false });
  }
  if (id === 'drivers') g.autoTimer = 0;
  if (id === 'westline') {
    // The 1952 megaproject: a new line seeded T-Centralen to Hötorget, with a
    // gift train. T-Centralen becomes the network's first interchange.
    g.lines.push(newLine([anchorStation(0), anchorStation(WEST_FIRST)]));
    g.trains.push({ line: g.lines.length - 1, at: 0, run: null, mothballed: false });
    g.events.push({ type: 'newline', geo: ANCHORS[WEST_FIRST].geo, name: ANCHORS[WEST_FIRST].name });
  }
  return true;
}

// --- Offline progress: coarse 1-second integration, capped ---

export function simulateOffline(g, seconds) {
  const s = Math.floor(Math.min(Math.max(0, seconds), BAL.offlineCapS));
  if (s < 60) return null;
  const m0 = g.money;
  const d0 = g.totalDelivered;
  for (let i = 0; i < s; i++) {
    tick(g, 1);
    if (i % 120 === 0) g.events.length = 0;
  }
  g.events.length = 0;
  return { seconds: s, earned: g.money - m0, delivered: g.totalDelivered - d0 };
}

// --- Save / load (saveVersion is monotonic; forward-only migrations) ---

export const SAVE_KEY = 'tunnelbana_save';

export function serialize(g) {
  return JSON.stringify({
    saveVersion: 6,
    savedAt: Date.now(),
    money: Math.round(g.money),
    pk: Math.round(g.pk * 100) / 100,
    era: g.era,
    lines: g.lines.map((L) => ({
      stations: L.stations,
      waitingF: L.waitingF.map((w) => Math.round(w)),
      waitingB: L.waitingB.map((w) => Math.round(w)),
    })),
    trains: g.trains.map((t) => ({ line: t.line, mothballed: t.mothballed })),
    freeSpots: g.freeSpots,
    owned: g.owned,
    endingSeen: g.endingSeen,
    totalDelivered: Math.round(g.totalDelivered),
  });
}

function validStation(st) {
  return !!st && typeof st.name === 'string' && st.name.length > 0 && st.name.length <= 40 &&
    Array.isArray(st.geo) && st.geo.length === 2 &&
    Number.isFinite(st.geo[0]) && Number.isFinite(st.geo[1]) &&
    st.geo[0] > 59.0 && st.geo[0] < 59.6 && st.geo[1] > 17.5 && st.geo[1] < 18.6 &&
    (st.anchor === null || (Number.isInteger(st.anchor) && st.anchor >= 0 && st.anchor < ANCHORS.length)) &&
    typeof st.mult === 'number' && st.mult >= 0.2 && st.mult <= HUB_MULT;
}

const posInt = (v, max) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)));

function sanitizeLine(stations, anchorShift) {
  return stations.map((st) => {
    const anchor = st.anchor === null ? null : Math.min(ANCHORS.length - 1, st.anchor + anchorShift);
    return {
      name: st.name, geo: [st.geo[0], st.geo[1]], anchor,
      mult: st.mult, hub: anchor !== null && !!ANCHORS[anchor].hub,
    };
  });
}

export function hydrate(raw) {
  const g = newGame();
  if (!raw) return g;
  let s;
  try { s = JSON.parse(raw); } catch { return g; }
  if (!s || typeof s.saveVersion !== 'number') return g;
  g.money = Math.max(0, Number(s.money) || 0);
  g.pk = Math.max(0, Number(s.pk) || 0);
  g.era = posInt(s.era, ERAS.length - 1);
  g.endingSeen = !!s.endingSeen;
  for (const item of CATALOG) g.owned[item.id] = posInt(s.owned?.[item.id], item.max + 8);
  g.totalDelivered = Math.max(0, Number(s.totalDelivered) || 0);
  const capMax = stationCap(g);
  const readQueue = (arr, i, st, fallbackHalf) => {
    const saved = Array.isArray(arr) ? Number(arr[i]) : NaN;
    return Number.isFinite(saved)
      ? Math.min(capMax * st.mult, Math.max(0, saved))
      : BAL.seedWaiting * st.mult * fallbackHalf;
  };
  const okLine = (st) => Array.isArray(st) && st.length >= 2 && st.every(validStation);

  if (s.saveVersion >= 6 && Array.isArray(s.lines) && s.lines.length >= 1 &&
      s.lines.every((L) => L && okLine(L.stations)) &&
      s.lines.reduce((a, L) => a + L.stations.length, 0) <= BAL.maxStations + 16) {
    g.lines = s.lines.map((L) => {
      const stations = sanitizeLine(L.stations, 0);
      return {
        stations,
        waitingF: stations.map((st, i) => readQueue(L.waitingF, i, st, 0.5)),
        waitingB: stations.map((st, i) => readQueue(L.waitingB, i, st, 0.5)),
        rev: 0,
      };
    });
    g.freeSpots = posInt(s.freeSpots, BAL.maxStations);
    g.trains = [];
    const tr = Array.isArray(s.trains) ? s.trains.slice(0, 32) : [];
    for (const t of tr) {
      const li = posInt(t?.line, g.lines.length - 1);
      g.trains.push({ line: li, at: 0, run: null, mothballed: !!t?.mothballed });
    }
    if (!g.trains.length) g.trains.push({ line: 0, at: 0, run: null, mothballed: false });
    if (!g.trains.some((t) => !t.mothballed)) g.trains[0].mothballed = false;
    return g;
  }

  // Pre-v6 saves (the single-line era, some predating the T-Centralen hub)
  // are RETIRED: they start fresh. Pre-1.0 save policy allows this, and a
  // faithfully migrated pre-hub line kept resurrecting a Slussen start that
  // no longer matches the game.
  return newGame();
}
