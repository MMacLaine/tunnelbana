// Simulation for M0: one hardcoded line, trains, fares, upkeep, a few purchases.
// DOM-free on purpose so it can run under node for smoke tests.

import { STATIONS, SEG_KM } from './data.js';

export const BAL = {
  startMoney: 300,
  fare: 3,                 // kr per delivered passenger
  spawnPerSec: 0.35,       // base passengers per station per second
  stationCapBase: 80,      // base waiting cap per station
  cityGrowthDiv: 1500,     // demand multiplier = 1 + delivered / this
  trainCapBase: 120,
  capPerLevel: 60,
  upkeepPerTrainPerSec: 1.5,
  secondsPerKm: 1.05,      // ride time from geo distance
  dwell: 0.32,             // per-stop time added to each segment
  dispatchBase: 8,         // drivers auto-dispatch interval, seconds
  dispatchPerLevel: 0.82,  // timetable: interval multiplier per level
  seedWaiting: 8,          // passengers already on platforms at game start
};

export const SHOP = [
  { id: 'train',     base: 600,  growth: 1.6, max: 8 },
  { id: 'drivers',   base: 900,  growth: 1,   max: 1 },
  { id: 'timetable', base: 1400, growth: 1.8, max: 6, needs: 'drivers' },
  { id: 'capacity',  base: 800,  growth: 1.7, max: 6 },
];

const LAST = STATIONS.length - 1;

export function newGame() {
  return {
    clock: 0,
    money: BAL.startMoney,
    waiting: STATIONS.map(() => BAL.seedWaiting),
    trains: [{ at: 0, run: null }],
    owned: { train: 0, drivers: 0, timetable: 0, capacity: 0 },
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

function segTime(i) {
  return SEG_KM[i] * BAL.secondsPerKm + BAL.dwell;
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
  train.run = { dir, from: train.at, t: 0, onboard: 0 };
  pickUp(g, train, train.at);
  return true;
}

function arrive(g, train) {
  const run = train.run;
  run.from += run.dir;
  run.t = 0;
  pickUp(g, train, run.from);
  const atTerminus = run.from === 0 || run.from === LAST;
  if (atTerminus) {
    const amt = run.onboard * BAL.fare;
    if (run.onboard > 0) {
      g.money += amt;
      g.totalDelivered += run.onboard;
      g.grossLog.push({ t: g.clock, amt });
      g.events.push({ type: 'payout', station: run.from, amt });
    }
    train.at = run.from;
    train.run = null;
  }
}

export function tick(g, dt) {
  g.clock += dt;

  // Passengers gather on platforms; demand grows with everyone you have moved.
  const cap = stationCap(g);
  const spawn = BAL.spawnPerSec * cityMult(g) * dt;
  for (let i = 0; i < g.waiting.length; i++) {
    g.waiting[i] = Math.min(cap, g.waiting[i] + spawn);
  }

  // Upkeep drains, floored at zero (deficit rules proper arrive in M1).
  g.money = Math.max(0, g.money - upkeepRate(g) * dt);

  // Trains move.
  for (const train of g.trains) {
    if (!train.run) continue;
    train.run.t += dt;
    // A big dt (tab regains focus) can cross several stations in one tick.
    while (train.run && train.run.t >= segTime(Math.min(train.run.from, train.run.from + train.run.dir))) {
      train.run.t -= segTime(Math.min(train.run.from, train.run.from + train.run.dir));
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

// --- Save / load (M0: minimal; saveVersion is monotonic from day one) ---

export const SAVE_KEY = 'tunnelbana_save';

export function serialize(g) {
  return JSON.stringify({
    saveVersion: 1,
    money: Math.round(g.money),
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
  for (let i = 0; i < g.owned.train; i++) g.trains.push({ at: 0, run: null });
  return g;
}
