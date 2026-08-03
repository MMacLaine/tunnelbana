// Simulation: one line with free station placement, trains, fares, upkeep, purchases.
// DOM-free on purpose so it can run under node for smoke tests.

import { ANCHORS, START_BUILT, WATER, kmBetween, crossesWater, inRing } from './data.js';

export const BAL = {
  startMoney: 300,
  fare: 3,                 // kr per delivered passenger
  spawnPerSec: 0.5,        // base passengers per station per second (anchors)
  freeSpotDemand: 0.5,     // demand multiplier for stations placed off-anchor
  stationCapBase: 80,      // base waiting cap per station
  cityGrowthDiv: 900,      // demand multiplier = 1 + delivered / this
  trainCapBase: 120,
  capPerLevel: 60,
  upkeepPerTrainPerSec: 1.2,
  secondsPerKm: 1.05,      // ride time from geo distance
  dwell: 0.32,             // per-stop time added to each segment
  dispatchBase: 8,         // drivers auto-dispatch interval, seconds
  dispatchPerLevel: 0.82,  // timetable: interval multiplier per level
  seedWaiting: 8,          // passengers on a platform when it opens
  stationBase: 150,        // flat station cost, grows with count
  stationGrowth: 1.25,
  trackPerKm: 150,         // kr per km of track
  waterMult: 2.0,          // track cost multiplier when the segment crosses water
  minSpacingKm: 0.35,      // stations may not land closer than this
  maxStations: 30,         // M0 cap
};

export const SHOP = [
  { id: 'train',     base: 600,  growth: 1.6, max: 8 },
  { id: 'drivers',   base: 900,  growth: 1,   max: 1 },
  { id: 'timetable', base: 1400, growth: 1.8, max: 6, needs: 'drivers' },
  { id: 'capacity',  base: 800,  growth: 1.7, max: 6 },
];

function anchorStation(i) {
  const a = ANCHORS[i];
  return { name: a.name, geo: a.geo, anchor: i, mult: 1 };
}

export function newGame() {
  return {
    clock: 0,
    money: BAL.startMoney,
    line: Array.from({ length: START_BUILT }, (_, i) => anchorStation(i)),
    waiting: Array.from({ length: START_BUILT }, () => BAL.seedWaiting),
    trains: [{ at: 0, run: null }],
    owned: { train: 0, drivers: 0, timetable: 0, capacity: 0 },
    freeSpots: 0,
    autoTimer: 0,
    totalDelivered: 0,
    grossLog: [],   // recent payouts, for the income-per-second display
    events: [],     // drained by the renderer (payout floats etc.)
  };
}

export function cityMult(g) {
  return 1 + g.totalDelivered / BAL.cityGrowthDiv;
}

export function stationCap(g) {
  return Math.round(BAL.stationCapBase * cityMult(g));
}

export function trainCap(g) {
  return BAL.trainCapBase + g.owned.capacity * BAL.capPerLevel;
}

export function autoInterval(g) {
  return BAL.dispatchBase * Math.pow(BAL.dispatchPerLevel, g.owned.timetable);
}

export function upkeepRate(g) {
  return g.trains.length * BAL.upkeepPerTrainPerSec;
}

// Gross fares per second, averaged over the last 10 seconds.
export function grossRate(g) {
  const cutoff = g.clock - 10;
  let sum = 0;
  for (const e of g.grossLog) if (e.t >= cutoff) sum += e.amt;
  return sum / 10;
}

export function usedAnchors(g) {
  return new Set(g.line.map((s) => s.anchor).filter((a) => a !== null));
}

function segTimeBetween(a, b) {
  return kmBetween(a.geo, b.geo) * BAL.secondsPerKm + BAL.dwell;
}

function pickUp(g, train, idx) {
  const room = trainCap(g) - train.run.onboard;
  const take = Math.min(g.waiting[idx], room);
  if (take > 0) {
    g.waiting[idx] -= take;
    train.run.onboard += take;
  }
}

export function idleTrains(g) {
  return g.trains.filter((t) => !t.run);
}

export function dispatch(g) {
  const train = idleTrains(g)[0];
  if (!train) return false;
  const dir = train.at === 0 ? 1 : -1;
  const next = g.line[train.at + dir];
  if (!next) return false;
  train.run = { dir, from: train.at, t: 0, onboard: 0, dur: segTimeBetween(g.line[train.at], next) };
  pickUp(g, train, train.at);
  return true;
}

function arrive(g, train) {
  const run = train.run;
  run.from += run.dir;
  run.t = 0;
  pickUp(g, train, run.from);
  const atTerminus = run.from === 0 || run.from === g.line.length - 1;
  if (atTerminus) {
    const amt = run.onboard * BAL.fare;
    if (run.onboard > 0) {
      g.money += amt;
      g.totalDelivered += run.onboard;
      g.grossLog.push({ t: g.clock, amt });
      g.events.push({ type: 'payout', geo: g.line[run.from].geo, amt });
    }
    train.at = run.from;
    train.run = null;
  } else {
    run.dur = segTimeBetween(g.line[run.from], g.line[run.from + run.dir]);
  }
}

export function tick(g, dt) {
  g.clock += dt;

  // Passengers gather on platforms; demand grows with everyone you have moved.
  const cap = stationCap(g);
  const spawn = BAL.spawnPerSec * cityMult(g) * dt;
  for (let i = 0; i < g.line.length; i++) {
    g.waiting[i] = Math.min(cap * g.line[i].mult, g.waiting[i] + spawn * g.line[i].mult);
  }

  // Upkeep drains, floored at zero (deficit rules proper arrive in M1).
  g.money = Math.max(0, g.money - upkeepRate(g) * dt);

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
      dispatch(g);
      g.autoTimer = autoInterval(g);
    }
  }

  // Keep the income window short.
  const cutoff = g.clock - 12;
  while (g.grossLog.length && g.grossLog[0].t < cutoff) g.grossLog.shift();
}

// --- Extending the line: from either end, to an anchor or a free spot ---

// end: 'head' (index 0) or 'tail' (last index).
export function endStation(g, end) {
  return end === 'head' ? g.line[0] : g.line[g.line.length - 1];
}

export function extensionCost(g, end, geo) {
  const from = endStation(g, end);
  const km = kmBetween(from.geo, geo);
  const station = BAL.stationBase * Math.pow(BAL.stationGrowth, g.line.length - START_BUILT);
  const track = km * BAL.trackPerKm * (crossesWater(from.geo, geo) ? BAL.waterMult : 1);
  return Math.round(station + track);
}

// Returns a reason string when placement is invalid, else null.
export function placementProblem(g, end, geo) {
  if (g.line.length >= BAL.maxStations) return 'max';
  for (const w of WATER) if (inRing(geo, w.ring)) return 'water';
  for (const s of g.line) {
    if (kmBetween(s.geo, geo) < BAL.minSpacingKm) return 'tooClose';
  }
  if (g.money < extensionCost(g, end, geo)) return 'money';
  return null;
}

// anchorIdx is null for a free spot. Returns true on success.
export function extendTo(g, end, geo, anchorIdx) {
  if (anchorIdx !== null && usedAnchors(g).has(anchorIdx)) return false;
  if (placementProblem(g, end, geo)) return false;
  g.money -= extensionCost(g, end, geo);
  let station;
  if (anchorIdx !== null) {
    station = anchorStation(anchorIdx);
  } else {
    g.freeSpots += 1;
    station = { name: 'Ny station ' + g.freeSpots, geo, anchor: null, mult: BAL.freeSpotDemand };
  }
  if (end === 'head') {
    g.line.unshift(station);
    g.waiting.unshift(BAL.seedWaiting * station.mult);
    for (const t of g.trains) {
      t.at += 1;
      if (t.run) t.run.from += 1;
    }
  } else {
    g.line.push(station);
    g.waiting.push(BAL.seedWaiting * station.mult);
  }
  g.events.push({ type: 'extend', geo: station.geo, name: station.name });
  return true;
}

// --- Shop ---

export function shopCost(g, id) {
  const item = SHOP.find((s) => s.id === id);
  return Math.round(item.base * Math.pow(item.growth, g.owned[id]));
}

export function canBuy(g, id) {
  const item = SHOP.find((s) => s.id === id);
  if (g.owned[id] >= item.max) return false;
  if (item.needs && !g.owned[item.needs]) return false;
  return g.money >= shopCost(g, id);
}

export function buy(g, id) {
  if (!canBuy(g, id)) return false;
  g.money -= shopCost(g, id);
  g.owned[id] += 1;
  if (id === 'train') g.trains.push({ at: 0, run: null });
  if (id === 'drivers') g.autoTimer = 0;
  return true;
}

// --- Save / load (saveVersion is monotonic; forward-only migrations) ---

export const SAVE_KEY = 'tunnelbana_save';

export function serialize(g) {
  return JSON.stringify({
    saveVersion: 3,
    money: Math.round(g.money),
    line: g.line,
    freeSpots: g.freeSpots,
    owned: g.owned,
    totalDelivered: Math.round(g.totalDelivered),
  });
}

export function hydrate(raw) {
  const g = newGame();
  if (!raw) return g;
  let s;
  try { s = JSON.parse(raw); } catch { return g; }
  if (!s || typeof s.saveVersion !== 'number') return g;
  g.money = s.money ?? g.money;
  g.owned = { ...g.owned, ...s.owned };
  g.totalDelivered = s.totalDelivered ?? 0;
  if (s.saveVersion === 2 && typeof s.built === 'number') {
    // v2 stored a station count along the fixed 1950 sequence.
    const n = Math.min(ANCHORS.length, Math.max(START_BUILT, s.built));
    g.line = Array.from({ length: n }, (_, i) => anchorStation(i));
  } else if (s.saveVersion >= 3 && Array.isArray(s.line) && s.line.length >= 2) {
    g.line = s.line;
    g.freeSpots = s.freeSpots ?? 0;
  }
  g.waiting = g.line.map((st) => BAL.seedWaiting * st.mult);
  for (let i = 0; i < g.owned.train; i++) g.trains.push({ at: 0, run: null });
  return g;
}
