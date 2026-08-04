// Simulation: one line with free station placement, trains, fares, upkeep, purchases.
// DOM-free on purpose so it can run under node for smoke tests.

import { ANCHORS, START_BUILT, WATER, kmBetween, crossesWater, inRing, densityAt } from './data.js';

export const BAL = {
  startMoney: 300,
  fare: 3,                 // kr per delivered passenger
  spawnPerSec: 0.5,        // base passengers per station per second (anchors)
  demolishCost: 150,       // flat cost to remove a line end; provisional
  stationCapBase: 80,      // base waiting cap per station
  cityGrowthDiv: 900,      // demand multiplier = 1 + delivered / this
  trainCapBase: 120,
  upkeepPerTrainPerSec: 1.2,
  secondsPerKm: 1.05,      // ride time from geo distance
  dwell: 0.32,             // per-stop time added to each segment
  dispatchBase: 8,         // drivers auto-dispatch interval, seconds
  seedWaiting: 8,          // passengers on a platform when it opens
  stationBase: 150,        // flat station cost, grows with count
  stationGrowth: 1.25,
  trackPerKm: 150,         // kr per km of track
  waterMult: 2.0,          // track cost multiplier when the segment crosses water
  minSpacingKm: 0.35,      // stations may not land closer than this
  maxStations: 30,         // M0 cap
};

// The upgrade CATALOG (plan §6, Cookie Clicker direction): upgrades are DATA, and
// their effects compose through named modifiers, never through code reading BAL
// directly. `mult` effects multiply per level owned; `add` effects add per level.
// Today's handful is the seed of a 100+ catalog; `era` gates arrive with the era
// system. `kind: 'fleet'` marks purchases that create units rather than modify.
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

function anchorStation(i) {
  const a = ANCHORS[i];
  return { name: a.name, geo: a.geo, anchor: i, mult: 1 };
}

export function newGame() {
  const owned = {};
  for (const u of CATALOG) owned[u.id] = 0;
  return {
    clock: 0,
    money: BAL.startMoney,
    line: Array.from({ length: START_BUILT }, (_, i) => anchorStation(i)),
    waiting: Array.from({ length: START_BUILT }, () => BAL.seedWaiting),
    trains: [{ at: 0, run: null }],
    owned,
    freeSpots: 0,
    autoTimer: 0,
    totalDelivered: 0,
    grossEma: 0,    // smoothed fares per second, for the income display
    events: [],     // drained by the renderer (payout floats etc.)
  };
}

const GROSS_TAU = 8; // seconds; smoothing for the fares-per-second readout

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
  return g.trains.length * BAL.upkeepPerTrainPerSec;
}

// Gross fares per second, exponentially smoothed (payouts are lumpy impulses).
export function grossRate(g) {
  return g.grossEma;
}

export function usedAnchors(g) {
  return new Set(g.line.map((s) => s.anchor).filter((a) => a !== null));
}

function segTimeBetween(g, a, b) {
  return kmBetween(a.geo, b.geo) * BAL.secondsPerKm * effectMult(g, 'speed') + BAL.dwell;
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
  train.run = { dir, from: train.at, t: 0, onboard: 0, dur: segTimeBetween(g, g.line[train.at], next) };
  pickUp(g, train, train.at);
  return true;
}

function arrive(g, train) {
  const run = train.run;
  run.from += run.dir;
  run.t = 0;
  const atTerminus = run.from === 0 || run.from === g.line.length - 1;
  if (atTerminus) {
    // No pickup here: passengers on the terminus platform have not travelled.
    // They board on the next dispatch from this end.
    const amt = Math.round(run.onboard * BAL.fare * effectMult(g, 'fare'));
    if (run.onboard > 0) {
      g.money += amt;
      g.totalDelivered += run.onboard;
      g.grossEma += amt / GROSS_TAU;
      g.events.push({ type: 'payout', geo: g.line[run.from].geo, amt });
    }
    train.at = run.from;
    train.run = null;
  } else {
    pickUp(g, train, run.from);
    run.dur = segTimeBetween(g, g.line[run.from], g.line[run.from + run.dir]);
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

  // Drivers dispatch on their own once hired. A miss (no idle train) must not
  // burn the whole interval, or automation underperforms manual play.
  if (g.owned.drivers) {
    g.autoTimer -= dt;
    if (g.autoTimer <= 0) {
      g.autoTimer = dispatch(g) ? autoInterval(g) : 0.25;
    }
  }

  // Decay the smoothed income readout.
  g.grossEma = Math.max(0, g.grossEma - g.grossEma * dt / GROSS_TAU);
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

// What a free spot at geo would earn (demand multiplier from the density field).
export function freeSpotValue(geo) {
  return densityAt(geo).mult;
}

const NUMERALS = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

// A free spot is named after the district it lands in, numbered when repeated.
export function freeSpotName(g, geo) {
  const base = densityAt(geo).district || 'Station';
  const taken = g.line.filter((s) => s.name === base || s.name.startsWith(base + ' ')).length;
  return base + (NUMERALS[Math.min(taken, NUMERALS.length - 1)] || ' ' + (taken + 1));
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
    station = { name: freeSpotName(g, geo), geo, anchor: null, mult: densityAt(geo).mult };
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

// --- Demolition: line ends only, costs money, never refunds (pillar 1 is about
// the game taking things away, not the player choosing to) ---

export function canDemolish(g, end) {
  if (g.line.length <= 2) return false;
  if (g.money < BAL.demolishCost) return false;
  const idx = end === 'head' ? 0 : g.line.length - 1;
  for (const t of g.trains) {
    if (!t.run && t.at === idx) return false;
    if (t.run && (t.run.from === idx || t.run.from + t.run.dir === idx)) return false;
  }
  return true;
}

export function demolish(g, end) {
  if (!canDemolish(g, end)) return false;
  g.money -= BAL.demolishCost;
  const idx = end === 'head' ? 0 : g.line.length - 1;
  const st = g.line[idx];
  if (end === 'head') {
    g.line.shift();
    g.waiting.shift();
    for (const t of g.trains) {
      t.at = Math.max(0, t.at - 1);
      if (t.run) t.run.from -= 1;
    }
  } else {
    g.line.pop();
    g.waiting.pop();
  }
  g.events.push({ type: 'demolish', geo: st.geo, name: st.name });
  return true;
}

// --- Shop ---

export function shopCost(g, id) {
  const item = CATALOG.find((s) => s.id === id);
  return Math.round(item.base * Math.pow(item.growth, g.owned[id]));
}

export function canBuy(g, id) {
  const item = CATALOG.find((s) => s.id === id);
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
    waiting: g.waiting.map((w) => Math.round(w)),
    freeSpots: g.freeSpots,
    owned: g.owned,
    totalDelivered: Math.round(g.totalDelivered),
  });
}

// Saves are a shipping feature (export/import strings), so hydrate trusts nothing:
// every field is validated or clamped, and a bad line falls back to the default.
function validStation(st) {
  return !!st && typeof st.name === 'string' && st.name.length > 0 && st.name.length <= 40 &&
    Array.isArray(st.geo) && st.geo.length === 2 &&
    Number.isFinite(st.geo[0]) && Number.isFinite(st.geo[1]) &&
    st.geo[0] > 59.0 && st.geo[0] < 59.6 && st.geo[1] > 17.5 && st.geo[1] < 18.6 &&
    (st.anchor === null || (Number.isInteger(st.anchor) && st.anchor >= 0 && st.anchor < ANCHORS.length)) &&
    typeof st.mult === 'number' && st.mult >= 0.2 && st.mult <= 1;
}

const posInt = (v, max) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)));

export function hydrate(raw) {
  const g = newGame();
  if (!raw) return g;
  let s;
  try { s = JSON.parse(raw); } catch { return g; }
  if (!s || typeof s.saveVersion !== 'number') return g;
  g.money = Math.max(0, Number(s.money) || 0);
  for (const item of CATALOG) g.owned[item.id] = posInt(s.owned?.[item.id], item.max);
  g.totalDelivered = Math.max(0, Number(s.totalDelivered) || 0);
  if (s.saveVersion === 2 && typeof s.built === 'number') {
    // v2 stored a station count along the fixed 1950 sequence.
    const n = Math.min(ANCHORS.length, Math.max(START_BUILT, s.built));
    g.line = Array.from({ length: n }, (_, i) => anchorStation(i));
  } else if (s.saveVersion >= 3 && Array.isArray(s.line) &&
             s.line.length >= 2 && s.line.length <= BAL.maxStations &&
             s.line.every(validStation)) {
    g.line = s.line.map((st) => ({
      name: st.name, geo: [st.geo[0], st.geo[1]], anchor: st.anchor, mult: st.mult,
    }));
    g.freeSpots = posInt(s.freeSpots, BAL.maxStations);
  }
  const capMax = stationCap(g);
  g.waiting = g.line.map((st, i) => {
    const saved = Array.isArray(s.waiting) ? Number(s.waiting[i]) : NaN;
    const fallback = BAL.seedWaiting * st.mult;
    return Number.isFinite(saved) ? Math.min(capMax * st.mult, Math.max(0, saved)) : fallback;
  });
  for (let i = 0; i < g.owned.train; i++) g.trains.push({ at: 0, run: null });
  return g;
}
