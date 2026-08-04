// Simulation: one line with free station placement, origin-destination passenger
// flows, distance-based fares, upkeep with mothballing, political capital, and
// offline progress. Aggregate flows, never agents (plan §4). DOM-free on purpose
// so it can run under node for smoke tests.

import { ANCHORS, DISTRICTS, START_BUILT, WATER, kmBetween, crossesWater, inRing, densityAt } from './data.js';

export const BAL = {
  startMoney: 300,
  farePerKm: 2.4,          // kr per passenger-kilometre, paid as passengers board
  gravityExp: 1.4,         // distance decay for destination choice (2 makes every trip a one-stop hop)
  gravityFloorKm: 0.4,     // distances below this stop mattering to destination choice
  spawnPerSec: 0.5,        // base passengers per station per second (full demand)
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
  stationBase: 150,        // flat station cost, grows with count
  stationGrowth: 1.25,
  trackPerKm: 150,         // kr per km of track
  waterMult: 2.0,          // track cost multiplier when the segment crosses water
  minSpacingKm: 0.35,      // stations may not land closer than this
  maxStations: 30,         // M0 cap
  pkFullRatePerSec: 0.02,  // political capital per second at 100% regional coverage
  offlineCapS: 8 * 3600,   // offline progress simulates at most this long
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

export const HUB_MULT = 1.5; // the hub is the busiest platform in the region

// Total authored regional population, dormant districts included (report 620
// finding 3: an awake-only denominator pins coverage near 100% forever). Units
// are demand multiples; anchors count their demand weight.
export const REGION_POP =
  ANCHORS.reduce((a, x) => a + (x.hub ? HUB_MULT : 1), 0) +
  DISTRICTS.reduce((a, d) => a + d.w, 0);

function anchorStation(i) {
  const a = ANCHORS[i];
  return { name: a.name, geo: a.geo, anchor: i, mult: a.hub ? HUB_MULT : 1, hub: !!a.hub };
}

export function newGame() {
  const owned = {};
  for (const u of CATALOG) owned[u.id] = 0;
  return {
    clock: 0,
    money: BAL.startMoney,
    pk: 0,
    line: Array.from({ length: START_BUILT }, (_, i) => anchorStation(i)),
    waitingF: Array.from({ length: START_BUILT }, () => BAL.seedWaiting / 2),
    waitingB: Array.from({ length: START_BUILT }, () => BAL.seedWaiting / 2),
    trains: [{ at: 0, run: null, mothballed: false }],
    owned,
    freeSpots: 0,
    autoTimer: 0,
    deficitT: 0,
    totalDelivered: 0,
    grossEma: 0,    // smoothed fares per second, for the income display
    lineRev: 0,     // bumps on any line change; invalidates the OD cache
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
  let r = 0;
  for (const t of g.trains) r += BAL.upkeepPerTrainPerSec * (t.mothballed ? BAL.mothballShare : 1);
  return r;
}

// Gross fares per second, exponentially smoothed (payouts are lumpy impulses).
export function grossRate(g) {
  return g.grossEma;
}

// Waiting passengers at station i, both directions (display + quality).
export function waitingAt(g, i) {
  return g.waitingF[i] + g.waitingB[i];
}

export function usedAnchors(g) {
  return new Set(g.line.map((s) => s.anchor).filter((a) => a !== null));
}

// --- Gravity origin-destination model (aggregate flows) ---
// For each station: how its spawn splits toward tail (F) vs head (B), and the
// destination weights in each direction, w_ij = mult_j / d_ij^2. Cached per
// line revision; O(n^2) rebuild only when the line changes.
function od(g) {
  if (g._odRev === g.lineRev && g._od) return g._od;
  const n = g.line.length;
  const fwd = [], bwd = [], splitF = [];
  for (let i = 0; i < n; i++) {
    const f = [], b = [];
    let fSum = 0, bSum = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const d = Math.max(0.25, kmBetween(g.line[i].geo, g.line[j].geo));
      const w = g.line[j].mult / Math.pow(Math.max(BAL.gravityFloorKm, d), BAL.gravityExp);
      if (j > i) { f.push([j, w, d]); fSum += w; }
      else { b.push([j, w, d]); bSum += w; }
    }
    fwd.push({ list: f, sum: fSum });
    bwd.push({ list: b, sum: bSum });
    splitF.push(fSum + bSum > 0 ? fSum / (fSum + bSum) : 0.5);
  }
  g._od = { fwd, bwd, splitF };
  g._odRev = g.lineRev;
  return g._od;
}

function segTimeBetween(g, a, b) {
  return kmBetween(a.geo, b.geo) * BAL.secondsPerKm * effectMult(g, 'speed') + BAL.dwell;
}

// Board passengers heading in the train's direction; fares are paid per
// passenger-kilometre at boarding (the destination is already determined by the
// gravity weights, so nothing is owed later).
function board(g, train, i) {
  const run = train.run;
  const dirs = od(g);
  const side = run.dir === 1 ? dirs.fwd[i] : dirs.bwd[i];
  if (!side.sum) return;
  const queue = run.dir === 1 ? g.waitingF : g.waitingB;
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
  const amt = paxKm * BAL.farePerKm * effectMult(g, 'fare');
  g.money += amt;
  g.grossEma += amt / GROSS_TAU;
  if (amt >= 0.5) g.events.push({ type: 'payout', geo: g.line[i].geo, amt: Math.round(amt) });
}

export function idleTrains(g) {
  return g.trains.filter((t) => !t.run && !t.mothballed);
}

export function mothballedTrains(g) {
  return g.trains.filter((t) => t.mothballed);
}

export function dispatch(g) {
  const train = idleTrains(g)[0];
  if (!train) return false;
  const dir = train.at === 0 ? 1 : -1;
  const next = g.line[train.at + dir];
  if (!next) return false;
  train.run = {
    dir, from: train.at, t: 0, onboard: 0,
    dest: new Array(g.line.length).fill(0),
    dur: segTimeBetween(g, g.line[train.at], next),
  };
  board(g, train, train.at);
  return true;
}

function arrive(g, train) {
  const run = train.run;
  run.from += run.dir;
  run.t = 0;
  const k = run.from;
  const off = run.dest[k] || 0;
  if (off > 0) {
    run.dest[k] = 0;
    run.onboard = Math.max(0, run.onboard - off);
    g.totalDelivered += off;
    if (off >= 1) g.events.push({ type: 'alight', geo: g.line[k].geo, n: Math.round(off) });
  }
  const atTerminus = k === 0 || k === g.line.length - 1;
  if (atTerminus) {
    // Numerical dust only: every destination at or before this point has alighted.
    g.totalDelivered += Math.max(0, run.onboard);
    train.at = k;
    train.run = null;
  } else {
    board(g, train, k);
    run.dur = segTimeBetween(g, g.line[k], g.line[k + run.dir]);
  }
}

// Share of the authored regional population with quality rail access (report
// 620 finding 3): each served station contributes its demand weight, discounted
// by crowding, against the FULL region including dormant districts.
export function coverage(g) {
  const cap = stationCap(g);
  let cov = 0;
  for (let i = 0; i < g.line.length; i++) {
    const m = g.line[i].mult;
    const crowd = Math.min(1, waitingAt(g, i) / (cap * m));
    cov += m * (1 - 0.7 * crowd);
  }
  return Math.min(1, cov / REGION_POP);
}

export function tick(g, dt) {
  g.clock += dt;

  // Passengers gather, split by direction from the gravity weights; demand
  // grows with everyone you have moved.
  const cap = stationCap(g);
  const dirs = od(g);
  const spawnBase = BAL.spawnPerSec * cityMult(g) * dt;
  for (let i = 0; i < g.line.length; i++) {
    const m = g.line[i].mult;
    const room = cap * m - waitingAt(g, i);
    const add = Math.min(Math.max(0, room), spawnBase * m);
    const f = dirs.splitF[i];
    g.waitingF[i] += add * f;
    g.waitingB[i] += add * (1 - f);
  }

  // Upkeep drains, floored at zero; a sustained deficit mothballs a train
  // (report 620 finding 4: the punishment is sunk cost and lost time, never
  // the map, and mothballing must cut upkeep faster than it cuts fares).
  g.money = Math.max(0, g.money - upkeepRate(g) * dt);
  // "In trouble" is a rates question, not a cash-exactly-zero question: fare
  // bursts bounce the balance above zero without changing the arithmetic.
  const losing = g.money < upkeepRate(g) * 10 && grossRate(g) < upkeepRate(g);
  g.deficitT = losing ? g.deficitT + dt : Math.max(0, g.deficitT - dt * 0.5);
  if (g.deficitT >= BAL.deficitMothballAfter) {
    const active = g.trains.filter((t) => !t.mothballed);
    const cand = active.find((t) => !t.run);
    if (active.length > 1 && cand) {
      cand.mothballed = true;
      g.events.push({ type: 'mothball', geo: g.line[cand.at].geo });
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

  // Drivers dispatch on their own once hired. A miss (no idle train) must not
  // burn the whole interval, or automation underperforms manual play.
  if (g.owned.drivers) {
    g.autoTimer -= dt;
    if (g.autoTimer <= 0) {
      g.autoTimer = dispatch(g) ? autoInterval(g) : 0.25;
    }
  }

  // Political capital accrues from coverage.
  g.pk += BAL.pkFullRatePerSec * coverage(g) * dt;

  // Decay the smoothed income readout.
  g.grossEma = Math.max(0, g.grossEma - g.grossEma * dt / GROSS_TAU);
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
  // NUMERALS[0] is '' (the first take is unnumbered), so no || fallback here.
  return base + (taken < NUMERALS.length ? NUMERALS[taken] : ' ' + (taken + 1));
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
    g.waitingF.unshift(BAL.seedWaiting * station.mult / 2);
    g.waitingB.unshift(BAL.seedWaiting * station.mult / 2);
    for (const t of g.trains) {
      t.at += 1;
      if (t.run) {
        t.run.from += 1;
        t.run.dest.unshift(0);
      }
    }
  } else {
    g.line.push(station);
    g.waitingF.push(BAL.seedWaiting * station.mult / 2);
    g.waitingB.push(BAL.seedWaiting * station.mult / 2);
    for (const t of g.trains) if (t.run) t.run.dest.push(0);
  }
  g.lineRev += 1;
  g.events.push({ type: 'extend', geo: station.geo, name: station.name });
  return true;
}

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
    g.waitingF.shift();
    g.waitingB.shift();
    for (const t of g.trains) {
      t.at = Math.max(0, t.at - 1);
      if (t.run) {
        t.run.from -= 1;
        t.run.dest.shift();
      }
    }
  } else {
    g.line.pop();
    g.waitingF.pop();
    g.waitingB.pop();
    for (const t of g.trains) {
      if (t.at >= g.line.length) t.at = g.line.length - 1;
      if (t.run) t.run.dest.pop();
    }
  }
  g.lineRev += 1;
  g.events.push({ type: 'demolish', geo: st.geo, name: st.name });
  return true;
}

// --- Catalog purchases ---

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
  if (id === 'train') g.trains.push({ at: 0, run: null, mothballed: false });
  if (id === 'drivers') g.autoTimer = 0;
  return true;
}

// --- Offline progress: coarse 1-second integration, capped (plan §2/§8) ---
// Earning offline requires drivers, which is by design: automation is what buys
// you idle income. Returns null when the gap is too short to matter.

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
    saveVersion: 5,
    savedAt: Date.now(),
    money: Math.round(g.money),
    pk: Math.round(g.pk * 100) / 100,
    line: g.line,
    waitingF: g.waitingF.map((w) => Math.round(w)),
    waitingB: g.waitingB.map((w) => Math.round(w)),
    mothballed: mothballedTrains(g).length,
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
    typeof st.mult === 'number' && st.mult >= 0.2 && st.mult <= HUB_MULT;
}

const posInt = (v, max) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)));

export function hydrate(raw) {
  const g = newGame();
  if (!raw) return g;
  let s;
  try { s = JSON.parse(raw); } catch { return g; }
  if (!s || typeof s.saveVersion !== 'number') return g;
  g.money = Math.max(0, Number(s.money) || 0);
  g.pk = Math.max(0, Number(s.pk) || 0);
  for (const item of CATALOG) g.owned[item.id] = posInt(s.owned?.[item.id], item.max);
  g.totalDelivered = Math.max(0, Number(s.totalDelivered) || 0);
  if (s.saveVersion === 2 && typeof s.built === 'number') {
    // v2 stored a station count along the fixed 1950 sequence.
    const n = Math.min(ANCHORS.length, Math.max(START_BUILT, s.built));
    g.line = Array.from({ length: n }, (_, i) => anchorStation(i));
  } else if (s.saveVersion >= 3 && Array.isArray(s.line) &&
             s.line.length >= 2 && s.line.length <= BAL.maxStations &&
             s.line.every(validStation)) {
    // Saves before v5 predate the T-Centralen + Gamla stan anchors: their
    // anchor indices point two entries early. Remap, forward-only.
    const shift = s.saveVersion < 5 ? 2 : 0;
    g.line = s.line.map((st) => {
      const anchor = st.anchor === null ? null : Math.min(ANCHORS.length - 1, st.anchor + shift);
      return {
        name: st.name, geo: [st.geo[0], st.geo[1]], anchor,
        mult: st.mult, hub: anchor !== null && !!ANCHORS[anchor].hub,
      };
    });
    g.freeSpots = posInt(s.freeSpots, BAL.maxStations);
  }
  const capMax = stationCap(g);
  const half = (arr, i, st) => {
    const saved = Array.isArray(arr) ? Number(arr[i]) : NaN;
    return Number.isFinite(saved)
      ? Math.min(capMax * st.mult, Math.max(0, saved))
      : BAL.seedWaiting * st.mult / 2;
  };
  if (s.saveVersion >= 4) {
    g.waitingF = g.line.map((st, i) => half(s.waitingF, i, st));
    g.waitingB = g.line.map((st, i) => half(s.waitingB, i, st));
  } else {
    // v3 stored one undirected queue: split it evenly.
    g.waitingF = g.line.map((st, i) => half(s.waiting, i, st) / 2);
    g.waitingB = g.line.map((st, i) => half(s.waiting, i, st) / 2);
  }
  for (let i = 0; i < g.owned.train; i++) g.trains.push({ at: 0, run: null, mothballed: false });
  const mb = posInt(s.mothballed, Math.max(0, g.trains.length - 1));
  for (let i = 0; i < mb; i++) g.trains[g.trains.length - 1 - i].mothballed = true;
  return g;
}
