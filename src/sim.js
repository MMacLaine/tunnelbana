// Simulation: multiple lines with free station placement, origin-destination
// passenger flows, distance-based fares, upkeep with mothballing, eras and
// megaprojects, political capital, surges, and offline progress. Aggregate
// flows, never agents (plan §4). DOM-free so it runs under node for smoke tests.

import { ANCHORS, CORRIDORS, DISTRICTS, START_BUILT, WEST_FIRST, WATER, kmBetween, crossesWater, inRing, densityAt } from './data.js';

export const BAL = {
  startMoney: 900,  // enough that the opening minute ends in a build, not a wait
  farePerKm: 6,            // kr per passenger-kilometre, paid as passengers board.
                           // Scaled with the 2026-08-04 slowdown (2.4 at the old
                           // speeds): slower trains earn per visit, so fares must
                           // carry part of the speed change. x5 (full cycle
                           // compensation) made the early spawn-bound arc 2.5x
                           // too rich (measured); x2.5 reproduces the old arc's
                           // money curve, and late-game train margins stay far
                           // above upkeep either way
  gravityExp: 1.4,         // distance decay for destination choice (2 makes every trip a one-stop hop)
  gravityFloorKm: 0.4,     // distances below this stop mattering to destination choice
  spawnPerSec: 1.6,        // base passengers per station per second at authored population
                           // (demand-per-headway is THE capacity knob, report 638 §2)
  transferPenalty: 6,      // seconds a transfer 'costs' in route choice; through-running divides it
  accTimeS: 90,            // accessibility time budget (generalized seconds):
                           // destinations within ~1.5 min of game travel count
                           // nearly fully, twice that counts a fifth
  accSoftMass: 6,          // softening mass in the accessibility factor
  accRefMass: 10.2,        // reachable mass worth exactly 1.0x trip generation
                           // (the measured full green-south median, so the
                           // tuned early-mid game holds still and connectivity
                           // beyond it is what pays)
  accMin: 0.35,            // a 2-stop shuttle still lives
  accMax: 2.0,             // and a perfect mesh cannot run away
  transferKmEq: 2.0,       // km-equivalent friction per line change in DESTINATION choice
                           // (route choice alone gave 'through' nothing to do: most
                           // origin-destination pairs have one sensible route, so a cheaper
                           // transfer flipped no paths; deterrence in the weights means
                           // through-running measurably grows cross-line ridership)
  demolishCost: 150,       // flat cost to remove a line end; provisional
  stationCapBase: 80,      // base waiting cap per station
  growthCap: 2.5,          // a district can grow to this multiple of its authored pop
  growthTau: 240,          // seconds to close ~63% of the gap under perfect service
  dayLen: 240,             // seconds per in-game day
  morningMult: 1.4,        // spawn in the morning peak (inbound-biased)
  eveningMult: 1.3,        // spawn in the evening peak (outbound-biased)
  nightMult: 0.35,         // spawn at night
  peakBias: 0.5,           // how hard peaks bend the direction split toward/away the hub
  holdShare: 0.75,         // ATC holds a departure until this share of the headway
                           // floor has passed since the last same-direction departure
  holdDwell: 0.4,          // seconds a held train waits before re-checking
  trainCapBase: 120,
  upkeepPerTrainPerSec: 1.2,
  mothballShare: 0.2,      // a mothballed train costs this share of upkeep
  deficitMothballAfter: 20,// seconds broke and losing before a train auto-mothballs
  // Motion model (report 634 §2a): accelerate, cruise, brake, then DWELL at the
  // platform while passengers board at the gate rate. Game-scale units: km and
  // seconds. Short segments never reach cruise speed, so infill makes a line
  // slow as a physical consequence, not a balance constant.
  maxSpeedKmS: 0.12,       // cruise speed; stock upgrades raise it (and accel).
                           // Was 1.35, then 0.7: both read as far too fast in
                           // owner playtests. A ~0.9 km hop now takes ~10 s
                           // (real metros take minutes; the game compresses,
                           // but watching the trains RUN is the simulation's
                           // joy, owner ruling 2026-08-04), and the stock
                           // upgrades are felt speed on a move-dominated trip.
  accelKmS2: 0.04,         // acceleration = braking. Report 643 corrected the
                           // old story here: at these values a 0.36 km infill
                           // segment just cruises (v^2/a = 0.36 km); the real
                           // cost of an added stop is the extra accel/brake
                           // cycle (~+3 s now) plus the fixed dwell, so accel
                           // is the lever if infill ever needs to hurt more
  minDwell: 0.2,           // fixed dwell never goes below this
  baseDwell: [0, 0.45, 0.35, 0.3],   // fixed doors/departure cost by tier (1-indexed)
  // A separate 'platforms' dwell axis was measured redundant with gates (two
  // knobs on one job, one of them dead). Platforms return in M4 slice 3 as
  // LENGTH: capping how much of a long train can load at an under-built stop.
  gateRateBase: 110,       // passengers boarded per second of dwell
  gateRatePerLevel: 45,    // per gates upgrade level
  headwayBase: 8,          // minimum seconds between departures FROM A TERMINUS (signalling floor)
  turnaroundS: 2.5,        // a train needs this long to turn at a terminus
  // Stations cost money to run (report 634 risk 2): tier upkeep + per upgrade level.
  stationUpkeep: [0, 0.12, 0.35, 0.9],
  upgradeUpkeep: 0.05,
  tier2Cost: 1500,
  tier3CostKr: 6000,
  tier3CostPk: 8,
  tier3Era: 1957,          // Knutpunkt unlocks here; T-Centralen is born one
  upgCostBase: { ent: 500, gates: 400 },
  upgCostGrowth: 2,
  upgMax: 3,
  offlineDiscount: 0.7,    // offline income earns this share of the measured online rate
  seedWaiting: 8,          // passengers on a platform when it opens
  // Building the network is the spine of a 20-hour arc, so it must cost real
  // time. Owner playtest 2026-08-04: "I can build the entire green line in
  // about 5 minutes". Was 150 / 1.25 / 150, which put the 13th station at
  // ~1 400 kr, seconds of income. Station cost now compounds harder and track
  // is priced like tunnelling, so each extension is a decision you save for.
  // Extending costs grow along the LINE you are extending, not across the whole
  // network (changed 2026-08-04). A single network-wide exponent cannot be both
  // steep early and payable late: at 1.42 station 45 passed a billion kr and
  // walled the blue era, and at 1.16 the whole 1950 line fell in nine minutes.
  // Per line, each corridor is its own project: pressure builds within a line,
  // a new era's line starts fresh (and you are richer, which is the era pacing
  // doing the work instead of a runaway exponent). Founding lines to dodge the
  // curve is gated by political capital and by needing trains to run them.
  stationBase: 1100,       // flat station cost, grows with THIS line's length
  stationGrowth: 1.32,
  trackPerKm: 520,         // kr per km of track
  waterMult: 2.0,          // track cost multiplier when the segment crosses water
  minSpacingKm: 0.35,      // same-line stations may not land closer than this
  maxStations: 90,         // network-wide cap (upgrades can raise it). Was 40
                           // pre-campaign; the campaign authors 59 anchors, so
                           // the cap must leave room for them plus free spots
  pkFullRatePerSec: 0.02,  // political capital per second at 100% regional coverage
  surgeEvery: 120,         // seconds between rush events
  surgeDur: 25,            // seconds a rush lasts
  surgeSpawnMult: 3,       // spawn multiplier at the rushed station
  surgeFareMult: 1.5,      // fare multiplier for boardings at the rushed station
  abandonPerSec: 0.06,     // share of a FULL platform that gives up per second
                           // (scaled by crowding squared: light queues barely leak)
  foundLineKr: 2500,       // charter a new line from a Knutpunkt
  foundLinePk: 3,
  moveTrainKr: 100,        // depot transfer fee (reassignment must not beat a return trip)
  offlineCapS: 8 * 3600,   // offline progress simulates at most this long
};

// The era arc. Advancing costs political capital and requires ridership; each
// era unlocks its slice of the catalog (and the Västerort megaproject in 1952).
// Thresholds derived post-638 against measured greedy pacing (~2,900
// delivered/min single-line late; multi-line projected 2-3x): gates land at
// roughly 1h / 4h / 8h / 12h / 16h of active play on the way to the 20 h arc.
// Coarse by design; the owner's playtests refine them. Rescaled x0.35 with
// the 2026-08-04 slowdown; reshaped the same day for the CAMPAIGN (owner
// direction): each era is one real line's story, and the final era is the
// sandbox, "Hela Stockholm", where the last constraints lift.
export const ERAS = [
  { year: 1950 },
  { year: 1952, pk: 5,  delivered: 40000 },
  { year: 1957, pk: 12, delivered: 250000 },
  { year: 1964, pk: 25, delivered: 700000 },
  { year: 1975, pk: 50, delivered: 1300000 },
  { year: 2000, pk: 90, delivered: 2200000 },
];

// The upgrade CATALOG (plan §6, Cookie Clicker direction): upgrades are DATA, and
// their effects compose through named modifiers, never through code reading BAL
// directly. `mult` effects multiply per level owned; `add` effects add per level.
// `currency: 'pk'` marks megaprojects; `kind` marks purchases with side effects.
export const CATALOG = [
  { id: 'train',      base: 600,  growth: 1.6, max: 8, era: 1950, kind: 'fleet' },
  { id: 'drivers',    base: 900,  growth: 1,   max: 1, era: 1950 },
  // timetable max is 1 (was 3, was 6): each cap is a measurement. Levels 4-6
  // died at the spawn ceiling; when base train speed halved (2026-08-04)
  // cycles doubled and NO reachable fleet gets terminus spacing under the
  // floor, so every floor-only level measured dead, including level 2 with
  // the whole fleet stacked on a short branch (+0.08/s, phase-invariant).
  // The item IS the even-interval terminus dispatch (lineCycleEst): buying a
  // timetable buys regularity. Deeper signalling floors return with the
  // red/blue line inventory IF they earn a job then; CBTC carries the late
  // dispatch story meanwhile.
  { id: 'timetable',  base: 1400, growth: 1.8, max: 1, era: 1950, needs: 'drivers',
    mult: { dispatchInterval: 0.82 } },
  { id: 'capacity',   base: 800,  growth: 1.7, max: 6, era: 1950,
    add: { trainCap: 60 } },
  { id: 'bogies',     base: 1200, growth: 1,   max: 1, era: 1950,
    mult: { speed: 0.9 } },
  { id: 'turnstiles', base: 1600, growth: 1,   max: 1, era: 1950,
    mult: { fare: 1.05 } },
  { id: 'westline',   base: 5,    growth: 1,   max: 1, era: 1952, currency: 'pk', kind: 'project' },
  // The campaign charters (owner direction 2026-08-04): each era's line can be
  // chartered as a megaproject seeding T-Centralen plus the corridor's first
  // stop, with a gift train; or the player ignores it and builds there
  // themselves (the corridor's stakes appear either way).
  { id: 'redline',    base: 10,   growth: 1,   max: 1, era: 1964, currency: 'pk', kind: 'project' },
  { id: 'blueline',   base: 16,   growth: 1,   max: 1, era: 1975, currency: 'pk', kind: 'project' },
  { id: 'entrances',  base: 2200, growth: 1.7, max: 3, era: 1952,
    add: { demand: 0.1 } },
  { id: 'through',    base: 8,    growth: 1,   max: 1, era: 1957, currency: 'pk',
    mult: { transfer: 1.5 } },
  { id: 'stock1957',  base: 3000, growth: 1,   max: 1, era: 1957,
    mult: { speed: 0.92 } },
  // atc is HOLDING control priced as COMFORT, not throughput (report 638 §2:
  // terminus dispatch already regularises the service, so holding rarely fires
  // until event-driven turnaround lands in M5; a legibility purchase must not
  // be graded by the kr/s gate). Cheap on purpose.
  { id: 'atc',        base: 2,    growth: 1,   max: 1, era: 1964, currency: 'pk', kind: 'holding' },
  { id: 'c4stock',    base: 6000, growth: 1,   max: 1, era: 1964,
    mult: { speed: 0.9 } },
  // 'depot' removed pending M4: the fleet knee sits near 3 trains per line at
  // current demand ceilings (value-gate measurement), so raising fleetMax is
  // dead content until per-station demand growth exists. Depots return in M4
  // as PLACES (report 634 idea 8), not as a number.
  { id: 'c14stock',   base: 15000, growth: 1,  max: 1, era: 1975,
    mult: { speed: 0.9 } },
  { id: 'zonefare',   base: 20000, growth: 1,  max: 1, era: 1975,
    mult: { fare: 1.15 } },
  // Late sinks (report 638 §5): thresholds without sinks just make the player
  // wait with a full wallet.
  { id: 'artstation', base: 45000, growth: 1,  max: 1, era: 1964,
    add: { demand: 0.15 } },
  // cbtc is frequency AND speed (moving-block signalling lets trains run
  // closer and brake later); pure frequency saturates at reachable demand.
  { id: 'cbtc',       base: 60000, growth: 1,  max: 1, era: 1975, needs: 'atc',
    mult: { dispatchInterval: 0.8, speed: 0.93 } },
  { id: 'nightservice', base: 80000, growth: 1, max: 1, era: 1975,
    mult: { night: 2 } },
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

// Station entity v2 (plan §6a slice 1): tiers Hållplats(1) / Station(2) /
// Knutpunkt(3), three upgrade axes, demand mult COMPUTED from district budgets.
function makeStation(name, geo, anchor, tier) {
  return {
    name, geo, anchor,
    tier,
    ent: 0, gates: 0,
    mult: 0.15,          // placeholder until computeDemand runs
    hub: tier >= 3,
  };
}

function anchorStation(i) {
  const a = ANCHORS[i];
  return makeStation(a.name, a.geo, i, a.hub ? 3 : 1);
}

// Founding-order palette; the real green stays line 1's (report 634 risk 3).
export const LINE_COLORS = ['#35a86b', '#4f8fd4', '#c8544a', '#b06fa8', '#8fae4a', '#6fd6b0'];
export const MAX_LINES = LINE_COLORS.length;
export const SANDBOX_MAX_LINES = 16; // the final era lifts the cap. A DESIGN choice,
// not perf: report 646 measured 12 lines at 59 stations costing ~0.025 ms/frame
// (cost tracks stations-per-line squared, not line count)

// The sandbox era removes the line-count constraint (owner direction: "have
// as many lines as they want"). Before it, the authored palette is the cap.
export function maxLinesNow(g) {
  return eraYear(g) >= 2000 ? SANDBOX_MAX_LINES : MAX_LINES;
}

// Line colours beyond the authored palette (sandbox): hues spread by the
// golden angle, emitted as HEX because hexA() tints the glow from this value.
export function lineColor(idx) {
  if (idx < LINE_COLORS.length) return LINE_COLORS[idx];
  const h = (idx * 137.508) % 360, l = 0.55;
  const a = 0.45 * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}

// The ONE way a train comes into existence (report 648). Every hand-built
// train literal is a silent fork of this constructor: when event-driven
// turnaround added readyAt, forks kept passing their tests while their trains
// could never dispatch (`clock >= undefined` is false), and a review's
// headline finding turned out to be one working train measured against zero.
// Probes import addTrain; nothing outside this file writes the shape.
export function newTrain(line) {
  return { line, at: 0, run: null, mothballed: false, readyAt: 0 };
}

export function addTrain(g, line) {
  const t = newTrain(line);
  g.trains.push(t);
  return t;
}

// Colours the campaign has already promised. Blue belongs to Blå linjen (1975)
// and red to Röda linjen (1964), so nothing else may wear them: a 1952 line
// painted blue tells the player they unlocked something they did not.
export const LINE_IDENTITY = {
  westline: { name: 'Västerortsbanan', color: '#6fd6b0' }, // historically the green line's west arm
  redline:  { name: 'Röda linjen',     color: '#c8544a' },
  blueline: { name: 'Blå linjen',      color: '#4f8fd4' },
};
const RESERVED = new Set(['#c8544a', '#4f8fd4', '#6fd6b0']);

// Player-founded lines take the next palette colour that is not spoken for.
export function foundedColor(g) {
  const taken = new Set(g.lines.map((L) => L.color));
  for (let i = 0; i < 40; i++) {
    const c = lineColor(i);
    if (!taken.has(c) && !RESERVED.has(c) && c !== LINE_COLORS[0]) return c;
  }
  return lineColor(g.lines.length);
}

function newLine(stations, colorIdx, identity) {
  return {
    stations,
    name: identity?.name || (colorIdx === 0 ? 'Gröna linjen' : 'Linje ' + (colorIdx + 1)),
    color: identity?.color || (typeof colorIdx === 'string' ? colorIdx : lineColor(colorIdx)),
    waitingF: stations.map((s) => BAL.seedWaiting * s.mult / 2),
    waitingB: stations.map((s) => BAL.seedWaiting * s.mult / 2),
    left60: stations.map(() => 0),
    leaveAcc: stations.map(() => 0),
    lastDepart: [-Infinity, -Infinity], // per end: [head, tail]
    lastPassF: stations.map(() => -Infinity), // last forward departure per station
    lastPassB: stations.map(() => -Infinity),
    rev: 0,
  };
}

export function newGame() {
  const owned = {};
  for (const u of CATALOG) owned[u.id] = 0;
  const g = {
    clock: 0,
    money: BAL.startMoney,
    pk: 0,
    era: 0,
    lines: [newLine(Array.from({ length: START_BUILT }, (_, i) => anchorStation(i)), 0)],
    trains: [newTrain(0)],
    owned,
    freeSpots: 0,
    deficitT: 0,
    totalDelivered: 0,
    grossEma: 0,
    gross60: 0,   // 60 s income rate, the basis of the closed-form offline estimate
    deliv60: 0,
    srcW: SOURCES.map((s) => s.w),   // living population per source; grows when served
    surge: null,          // { line, idx, until, name }
    nextSurgeAt: 90,
    surgeCounter: 0,
    endingSeen: false,
    // Opening day (report 643): the network is not OPEN until the first
    // dispatch, so a new player reading menus cannot lose before acting.
    // Upkeep and abandonment hold until the ribbon is cut; the first bell
    // is the invigning.
    opened: false,
    events: [],
  };
  computeDemand(g);
  // Platforms open with a seed crowd scaled by their computed demand.
  g.lines[0].waitingF = g.lines[0].stations.map((s) => BAL.seedWaiting * s.mult / 2);
  g.lines[0].waitingB = g.lines[0].stations.map((s) => BAL.seedWaiting * s.mult / 2);
  return g;
}

const GROSS_TAU = 8; // seconds; smoothing for the fares-per-second readout

export function eraYear(g) {
  return ERAS[g.era].year;
}

// City growth indicator: living population over the authored one. Display and
// coverage read it; SPAWN never does (demand lives in the district budgets).
export function cityMult(g) {
  return g.srcW.reduce((a, b) => a + b, 0) / REGION_POP_BASE;
}

export function stationCap(g) {
  return BAL.stationCapBase; // per-station caps scale via each station's mult
}

export function trainCap(g) {
  return BAL.trainCapBase + effectAdd(g, 'trainCap');
}

// Per-line minimum headway: the signalling floor. More trains tighten a line's
// service until this floor binds; timetable/ATC upgrades lower the floor
// (report 634 §1d: every line runs its own service, no global dispatch queue).
export function minHeadway(g) {
  return BAL.headwayBase * effectMult(g, 'dispatchInterval');
}

// A timetable dispatches at EVEN intervals, not merely no-sooner-than the
// signalling floor. Measured (M5 slice 2 gate): with a fixed fleet under
// event-driven turnaround, lowering the floor alone only loosened terminus
// regularisation (departure-gap sd 5.2 -> 8.1, abandonment +40%), because the
// floor was the only thing respacing bunched arrivals. Target spacing =
// full-cycle estimate / active fleet, floored by signalling. The estimate
// deliberately EXCLUDES boarding time, so it sits below true capability: a
// low target only regularises, it never throttles throughput. Deep timetable
// levels then pay on DENSE lines, where the floor itself binds the target.
export function lineCycleEst(g, li) {
  const L = g.lines[li];
  let t = 2 * BAL.turnaroundS;
  for (let i = 0; i + 1 < L.stations.length; i++) {
    t += 2 * moveTime(g, kmBetween(L.stations[i].geo, L.stations[i + 1].geo));
  }
  for (let i = 1; i + 1 < L.stations.length; i++) {
    t += 2 * Math.max(BAL.minDwell, BAL.baseDwell[L.stations[i].tier]);
  }
  return t;
}

// How often this line sends a train, aggregated over both ends: the cadence
// the player actually watches. Every relevant purchase moves it (a train
// divides it, speed shortens the cycle, a timetable makes it regular), so it
// is the honest readout of "how good is my service" (owner ask, 2026-08-04).
export function lineHeadwayS(g, li) {
  const active = g.trains.reduce((n, t) => n + (t.line === li && !t.mothballed ? 1 : 0), 0);
  if (!active) return Infinity;
  return Math.max(minHeadway(g), lineCycleEst(g, li) / (2 * active));
}

export function upkeepRate(g) {
  let r = 0;
  for (const t of g.trains) r += BAL.upkeepPerTrainPerSec * (t.mothballed ? BAL.mothballShare : 1);
  // Stations cost money to run: tier upkeep plus per upgrade level, counted
  // once per physical station (interchanges are one station on the ground).
  const seen = new Set();
  for (const L of g.lines) {
    for (const st of L.stations) {
      const key = st.anchor !== null ? 'a' + st.anchor : st.geo[0].toFixed(4) + ',' + st.geo[1].toFixed(4);
      if (seen.has(key)) continue;
      seen.add(key);
      r += BAL.stationUpkeep[st.tier] + BAL.upgradeUpkeep * (st.ent + st.gates);
    }
  }
  return r;
}

export function grossRate(g) {
  return g.grossEma;
}

// Stations ON THE GROUND (physical), not line entries: a junction shared by
// two services is one station, and costs/limits must read it that way.
export function stationCount(g) {
  return physicalStations(g).size;
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

// The city does not hand you the whole map (owner ruling, 2026-08-04): along
// each authored corridor only the NEXT unbuilt anchor is revealed, staked out
// one stop beyond the railhead. Not knowing where you are building toward is
// the fun; free spots stay legal anywhere, so the reveal is the city's
// proposal, not a leash. A corridor that has not begun shows only its FIRST
// anchor, and only once its era has arrived (the era OPENS the corridor:
// Hötorget appears in 1952, whether the player takes the megaproject or
// builds there themselves). This is the campaign's core mechanic: a new era
// = a new corridor's first stake appearing on the map.
export function corridorOf(i) {
  return CORRIDORS.find((c) => i >= c.start && i < c.end);
}

export function corridorBegun(g, c) {
  const used = usedAnchorsAll(g);
  for (let k = c.start; k < c.end; k++) if (used.has(k)) return true;
  return false;
}

// A corridor's dashed promise is worth drawing only when it is the story the
// player is in or the one immediately next. Drawing every unbegun corridor at
// once put "mot Hjulsta · 1975" on the map in 1950, three eras early, on top of
// the 1952 promise it was already showing (screenshot pass, 2026-08-05).
export function teaseVisible(g, c) {
  if (!c.tease || corridorBegun(g, c)) return false;
  const now = eraYear(g);
  if (now >= c.opensIn) return true;
  const next = nextEra(g);
  return !!next && next.year === c.opensIn;
}

export function anchorRevealed(g, i) {
  const used = usedAnchorsAll(g);
  if (used.has(i)) return true;
  const c = corridorOf(i);
  if (!c) return false;
  let maxBuilt = c.start - 1;
  for (let k = c.start; k < c.end; k++) if (used.has(k)) maxBuilt = k;
  if (maxBuilt < c.start) return i === c.start && eraYear(g) >= c.opensIn;
  return i === maxBuilt + 1;
}

// How many lines call at this anchor (2+ means interchange).
export function linesAtAnchor(g, anchor) {
  let n = 0;
  for (let li = 0; li < g.lines.length; li++) {
    if (g.lines[li].stations.some((s) => s.anchor === anchor)) n++;
  }
  return n;
}

// (transfer-spawn fudge deleted: real network transfers replaced it, M5)

// --- Demand: districts are population BUDGETS their stations share, not a
// field each station samples (report 634 risk 2: field-sampling let four
// stations extract 2.9x a district's population). Sources: every anchor is an
// implicit small district, plus the authored blobs. Stations claim shares by
// catchment and distance; shares per source sum to at most its budget. ---

function demandSources() {
  const src = [];
  ANCHORS.forEach((a) => src.push({ geo: a.geo, w: a.hub ? HUB_MULT : 1, reach: 0.6 }));
  DISTRICTS.forEach((d) => src.push({ geo: d.geo, w: d.w, reach: d.rKm }));
  return src;
}
const SOURCES = demandSources();
export const REGION_POP_BASE = SOURCES.reduce((a, s) => a + s.w, 0);
const DEMAND_FLOOR = 0.15;
// The unclaimed remainder: people who walk or drive. Stations never split a
// full budget among themselves; better catchment (entrances, tier) converts
// more of the remainder. This is what makes 'ent' a real purchase even for a
// station alone in its district.
const CLAIM_SOFTNESS = 0.6;

export function catchmentOf(st) {
  return (1 + 0.35 * (st.tier - 1)) * (1 + 0.25 * st.ent);
}

// Physical stations: line entries sharing an anchor (or the same free spot)
// are one station on the ground. Returns Map key -> { geo, catch, entries }.
function physicalStations(g) {
  const phys = new Map();
  for (let li = 0; li < g.lines.length; li++) {
    g.lines[li].stations.forEach((st, i) => {
      const key = st.anchor !== null ? 'a' + st.anchor : st.geo[0].toFixed(4) + ',' + st.geo[1].toFixed(4);
      if (!phys.has(key)) phys.set(key, { geo: st.geo, catch: 0, entries: [] });
      const p = phys.get(key);
      p.catch = Math.max(p.catch, catchmentOf(st));
      p.entries.push([li, i]);
    });
  }
  return phys;
}

// Geometry pass: which stations claim what FRACTION of each source. Fractions
// depend only on catchment and geometry, so they cache per network revision;
// multipliers then derive cheaply from the living srcW every time it moves.
function demandFractions(g) {
  if (g._fracRev === netRev(g) && g._frac) return g._frac;
  const phys = physicalStations(g);
  const perSource = SOURCES.map((s) => {
    let total = 0;
    const local = [];
    for (const [key, p] of phys) {
      const d = kmBetween(p.geo, s.geo);
      if (d > s.reach) continue;
      const c = p.catch * Math.max(0, 1 - (d / s.reach) ** 2);
      if (c > 0) { local.push([key, c]); total += c; }
    }
    return local.map(([key, c]) => [key, c / (total + CLAIM_SOFTNESS)]);
  });
  g._frac = { phys, perSource };
  g._fracRev = netRev(g);
  return g._frac;
}

function netRev(g) {
  let r = 0;
  for (const L of g.lines) r += L.rev + 1;
  return r * 1000 + g.lines.length;
}

export function computeDemand(g) {
  const { phys, perSource } = demandFractions(g);
  const claims = new Map();
  for (const key of phys.keys()) claims.set(key, DEMAND_FLOOR);
  perSource.forEach((local, j) => {
    for (const [key, frac] of local) {
      claims.set(key, claims.get(key) + g.srcW[j] * frac);
    }
  });
  for (const [key, p] of phys) {
    const m = Math.round(claims.get(key) * 100) / 100;
    for (const [li, i] of p.entries) g.lines[li].stations[i].mult = m;
  }
  for (const L of g.lines) L.rev += 1;
  g._fracRev = netRev(g); // mult write bumped revs; fractions are still valid
}

// The ABC-stad loop at source granularity (plan §6a slice 4): a served,
// uncrowded source grows toward growthCap x its authored population, with a
// time constant, so early investment compounds and the circle visibly swells.
function growCity(g, dt) {
  const { phys, perSource } = demandFractions(g);
  const crowdOf = new Map();
  const cap = stationCap(g);
  for (const [key, p] of phys) {
    let worst = 0;
    for (const [li, i] of p.entries) {
      const st = g.lines[li].stations[i];
      worst = Math.max(worst, Math.min(1, waitingAt(g, li, i) / (cap * st.mult)));
    }
    crowdOf.set(key, worst);
  }
  let moved = false;
  perSource.forEach((local, j) => {
    if (!local.length) return;
    let q = 0;
    for (const [key, frac] of local) q += frac * (1 - crowdOf.get(key));
    const wMax = SOURCES[j].w * BAL.growthCap;
    const before = g.srcW[j];
    g.srcW[j] = Math.min(wMax, g.srcW[j] + (wMax - g.srcW[j]) * (dt / BAL.growthTau) * q);
    if (g.srcW[j] - before > 1e-6) moved = true;
  });
  if (moved) computeDemand(g);
}

// What a NEW station at geo would earn, given who already drinks from each
// source (a phantom claim; used by the drag label).
export function freeSpotValue(g, geo) {
  const phys = physicalStations(g);
  let m = DEMAND_FLOOR;
  for (const s of SOURCES) {
    const dNew = kmBetween(geo, s.geo);
    if (dNew > s.reach) continue;
    const cNew = Math.max(0, 1 - (dNew / s.reach) ** 2);
    if (cNew <= 0) continue;
    let total = cNew + CLAIM_SOFTNESS;
    for (const p of phys.values()) {
      const d = kmBetween(p.geo, s.geo);
      if (d > s.reach) continue;
      total += p.catch * Math.max(0, 1 - (d / s.reach) ** 2);
    }
    m += s.w * (cNew / total);
  }
  return Math.round(m * 100) / 100;
}


function physKeyOf(st) {
  return st.anchor !== null ? 'a' + st.anchor : st.geo[0].toFixed(4) + ',' + st.geo[1].toFixed(4);
}

// --- The network (M5 headline): routing over the whole system, so a journey
// can change lines at an interchange. Aggregate flows over cached shortest
// paths, never agents. Cached per structural revision; three day-phase
// variants keep the peaks. Continuing passengers re-enter their transfer
// node's own distribution (documented approximation). ---

function phaseVariantIdx(g) {
  const ph = dayPhase(g);
  return ph === 0 ? 0 : ph === 2 ? 2 : 1;
}

export function networkCache(g) {
  const structRev = g.lines.map((L) => L.stations.length).join(',') + '|' + g.lines.length;
  if (g._netRev2 === structRev && g._net) {
    const vRev = netRev(g);
    if (g._netVarRev !== vRev && g.clock - g._netVarAt >= VARIANT_REFRESH_S) {
      buildVariants(g, g._net);
      g._netVarRev = vRev;
      g._netVarAt = g.clock;
    }
    return g._net;
  }
  const phys = physicalStations(g);
  const keys = [...phys.keys()];

  const ENT = [];
  const entOf = new Map();
  g.lines.forEach((L, li) => L.stations.forEach((st, i) => {
    entOf.set(li + ':' + i, ENT.length);
    ENT.push({ li, i, key: physKeyOf(st) });
  }));

  const prefix = g.lines.map((L) => {
    const pk = [0];
    for (let i = 1; i < L.stations.length; i++) {
      pk.push(pk[i - 1] + kmBetween(L.stations[i - 1].geo, L.stations[i].geo));
    }
    return pk;
  });

  const edges = ENT.map(() => []);
  const transferCost = BAL.transferPenalty / effectMult(g, 'transfer');
  g.lines.forEach((L, li) => {
    for (let i = 0; i + 1 < L.stations.length; i++) {
      const a = entOf.get(li + ':' + i), b = entOf.get(li + ':' + (i + 1));
      const d = kmBetween(L.stations[i].geo, L.stations[i + 1].geo);
      const t = moveTime(g, d) + 0.5;
      edges[a].push([b, t, d]);
      edges[b].push([a, t, d]);
    }
  });
  const byKey = new Map();
  ENT.forEach((e, idx) => {
    if (!byKey.has(e.key)) byKey.set(e.key, []);
    byKey.get(e.key).push(idx);
  });
  for (const group of byKey.values()) {
    for (const a of group) for (const b of group) {
      if (a !== b && ENT[a].li !== ENT[b].li) edges[a].push([b, transferCost, 0]);
    }
  }

  const routes = new Map();
  for (const oKey of keys) {
    const dist = new Array(ENT.length).fill(Infinity);
    const kmAt = new Array(ENT.length).fill(0);
    const prev = new Array(ENT.length).fill(-1);
    const pq = [];
    for (const e of byKey.get(oKey)) { dist[e] = 0; pq.push([0, e]); }
    while (pq.length) {
      let bi = 0;
      for (let k = 1; k < pq.length; k++) if (pq[k][0] < pq[bi][0]) bi = k;
      const [dc, u] = pq.splice(bi, 1)[0];
      if (dc > dist[u]) continue;
      for (const [v, t, km] of edges[u]) {
        if (dc + t < dist[v] - 1e-9) {
          dist[v] = dc + t;
          kmAt[v] = kmAt[u] + km;
          prev[v] = u;
          pq.push([dist[v], v]);
        }
      }
    }
    const destMap = new Map();
    for (const dKey of keys) {
      if (dKey === oKey) continue;
      let best = -1;
      for (const e of byKey.get(dKey)) if (best < 0 || dist[e] < dist[best]) best = e;
      if (best < 0 || !isFinite(dist[best])) continue;
      const path = [];
      for (let u = best; u >= 0; u = prev[u]) path.push(u);
      path.reverse();
      let legEnd = 1;
      while (legEnd < path.length && ENT[path[legEnd]].li === ENT[path[0]].li) legEnd++;
      const a = ENT[path[0]];
      const b = ENT[path[legEnd - 1]];
      if (a.li !== b.li || a.i === b.i) continue;
      let nX = 0;
      for (let p = 1; p < path.length; p++) if (ENT[path[p]].li !== ENT[path[p - 1]].li) nX++;
      const legKm = Math.abs(prefix[a.li][b.i] - prefix[a.li][a.i]);
      destMap.set(dKey, {
        km: kmAt[best],
        t: dist[best],
        nX,
        firstLeg: {
          li: a.li,
          dir: b.i > a.i ? 1 : -1,
          alightI: b.i,
          legKm,
          cont: legEnd - 1 < path.length - 1,
        },
      });
    }
    routes.set(oKey, destMap);
  }

  let hubKey = keys[0];
  for (const [k, p] of phys) if (p.catch > phys.get(hubKey).catch) hubKey = k;

  g._net = { phys, keys, routes, hubKey, byKey, ENT };
  g._netRev2 = structRev;
  buildVariants(g, g._net);
  g._netVarRev = netRev(g);
  g._netVarAt = g.clock;
  return g._net;
}

// Level 2 of the network cache: destination WEIGHTS over the cached routes.
// Station multipliers are living numbers (growth, upgrades), so the variants
// re-derive from them whenever netRev has moved, throttled to every few
// seconds: growCity bumps netRev nearly every tick while a district is
// filling in, and mult drift has a 240 s time constant, so seconds of
// staleness are invisible while a per-tick rebuild would not be.
const VARIANT_REFRESH_S = 5;

function buildVariants(g, net) {
  const { keys, routes, hubKey, byKey, ENT } = net;
  const multOf = new Map();
  g.lines.forEach((L) => L.stations.forEach((st) => multOf.set(physKeyOf(st), st.mult)));
  // Destination-choice friction per line change; through-running relieves it.
  const xferFrict = BAL.transferKmEq / effectMult(g, 'transfer');

  // ACCESSIBILITY (report 646 §a): a station generates trips in proportion to
  // where you can GET from it within a time budget. This is the plan §7
  // promise (income superlinear in connectivity) actually implemented: a
  // junction shortens journeys and adds reachable mass for BOTH lines, loop
  // closure is a breakthrough, and the real network becomes the strong build
  // for the reason it was actually built. Trip-choice gravity keeps its own
  // sharper distance decay; accessibility decays on generalized TIME (rides +
  // transfer penalties), so it grows as the network grows where raw gravity
  // mass does not (measured: raw-W median FELL from 5.6 to 4.7 across the
  // campaign build-out).
  net.acc = new Map();
  net.accF = new Map();
  for (const oKey of keys) {
    let A = 0;
    for (const [dKey, r] of routes.get(oKey)) {
      A += (multOf.get(dKey) || DEMAND_FLOOR) / (1 + (r.t / BAL.accTimeS) ** 2);
    }
    net.acc.set(oKey, A);
    const f = (A + BAL.accSoftMass) / (BAL.accRefMass + BAL.accSoftMass);
    net.accF.set(oKey, Math.min(BAL.accMax, Math.max(BAL.accMin, f)));
  }

  net.variants = [0, 1, 2].map((v) => {
    const boardDist = new Map();
    const entryShares = new Map();
    const destTop = new Map();
    const accW = new Map(); // origin -> total gravity mass of reachable dests
    for (const oKey of keys) {
      const destMap = routes.get(oKey);
      let W = 0;
      const rows = [];
      for (const [dKey, r] of destMap) {
        let w = (multOf.get(dKey) || DEMAND_FLOOR) /
          Math.pow(Math.max(BAL.gravityFloorKm, r.km + r.nX * xferFrict), BAL.gravityExp);
        if (v === 0 && dKey === hubKey) w *= 1 + BAL.peakBias;
        if (v === 2 && dKey === hubKey) w /= 1 + BAL.peakBias;
        W += w;
        rows.push([dKey, w, r.firstLeg]);
      }
      accW.set(oKey, W);
      if (W <= 0) continue;
      destTop.set(oKey, rows.slice().sort((x, y) => y[1] - x[1]).slice(0, 3)
        .map(([dKey, w]) => ({ key: dKey, share: w / W })));
      for (const [, w, leg] of rows) {
        const bKey = oKey + '|' + leg.li + '|' + leg.dir;
        if (!boardDist.has(bKey)) boardDist.set(bKey, { sum: 0, list: [] });
        const bd = boardDist.get(bKey);
        bd.sum += w;
        bd.list.push({ alightI: leg.alightI, w, legKm: leg.legKm, cont: leg.cont });
      }
      const hop = new Map();
      for (const [, w, leg] of rows) {
        const hKey = leg.li + '|' + leg.dir;
        hop.set(hKey, (hop.get(hKey) || 0) + w / W);
      }
      for (const e of byKey.get(oKey)) {
        const { li, i } = ENT[e];
        entryShares.set(li + ':' + i, {
          f: hop.get(li + '|1') || 0,
          b: hop.get(li + '|-1') || 0,
        });
      }
    }
    for (const bd of boardDist.values()) {
      bd.list = bd.list.map((x) => ({ ...x, share: x.w / bd.sum }));
    }
    return { boardDist, entryShares, destTop, accW };
  });
}

// Top destinations for a platform's crowd, straight from the network routing
// (a display of the sim's own numbers, never a second model). Names can be on
// OTHER lines now: that is the point.
export function odWeights(g, li, i) {
  const net = networkCache(g);
  const variant = net.variants[phaseVariantIdx(g)];
  const top = variant.destTop.get(physKeyOf(g.lines[li].stations[i])) || [];
  return top.map(({ key, share }) => {
    const p = net.phys.get(key);
    const [l2, i2] = p.entries[0];
    return { name: g.lines[l2].stations[i2].name, share };
  });
}

export function moveTime(g, d) {
  const m = effectMult(g, 'speed'); // < 1 = faster stock
  const v = BAL.maxSpeedKmS / m;
  const a = BAL.accelKmS2 / m; // better stock also pulls away harder
  const dCrit = (v * v) / a;   // accel + brake distance
  return d >= dCrit ? (2 * v) / a + (d - dCrit) / v : 2 * Math.sqrt(d / a);
}

// Dwell = a fixed doors-and-departure cost (by tier) PLUS boarding time
// through the gates. Gates shorten the crowded stops; higher tiers run a
// tighter fixed process.
export function dwellFor(g, st, boarded) {
  const fixed = Math.max(BAL.minDwell, BAL.baseDwell[st.tier]);
  const gateRate = BAL.gateRateBase + BAL.gateRatePerLevel * st.gates;
  return fixed + boarded / gateRate;
}

// Day phase: 0 morning peak, 1 midday, 2 evening peak, 3 night.
export function dayPhase(g) {
  const f = (g.clock % BAL.dayLen) / BAL.dayLen;
  if (f < 0.25) return 0;
  if (f < 0.5) return 1;
  if (f < 0.75) return 2;
  return 3;
}

function dayMult(g) {
  const ph = dayPhase(g);
  if (ph === 3) return Math.min(1, BAL.nightMult * effectMult(g, 'night'));
  return ph === 0 ? BAL.morningMult : ph === 2 ? BAL.eveningMult : 1;
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
  const net = networkCache(g);
  const variant = net.variants[phaseVariantIdx(g)];
  const bd = variant.boardDist.get(physKeyOf(L.stations[i]) + '|' + li + '|' + run.dir);
  if (!bd || !bd.sum) return 0;
  const queue = run.dir === 1 ? L.waitingF : L.waitingB;
  const room = trainCap(g) - run.onboard;
  const take = Math.min(queue[i], room);
  if (take <= 0) return 0;
  queue[i] -= take;
  run.onboard += take;
  let paxKm = 0;
  for (const e of bd.list) {
    const cnt = take * e.share;
    if (e.cont) run.destCont[e.alightI] += cnt;
    else run.dest[e.alightI] += cnt;
    paxKm += cnt * e.legKm;
  }
  let amt = paxKm * BAL.farePerKm * effectMult(g, 'fare');
  if (surgedAt(g, li, i)) amt *= BAL.surgeFareMult;
  g.money += amt;
  g.grossEma += amt / GROSS_TAU;
  g.gross60 += amt / 60;
  if (amt >= 0.5) g.events.push({ type: 'payout', geo: L.stations[i].geo, amt: Math.round(amt) });
  return take;
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

// Dispatch a specific idle train from a specific END. The run opens in a DWELL
// phase at the origin: doors open, passengers board at the gate rate.
export function dispatchFrom(g, li, end, ignoreReady) {
  const L = g.lines[li];
  const idx = end === 'head' ? 0 : L.stations.length - 1;
  const train = g.trains.find((t) =>
    t.line === li && !t.run && !t.mothballed && t.at === idx &&
    (ignoreReady || g.clock >= t.readyAt));
  if (!train) return false;
  const dir = idx === 0 ? 1 : -1;
  const next = L.stations[idx + dir];
  if (!next) return false;
  train.run = {
    phase: 'dwell', dir, from: idx, t: 0, onboard: 0,
    dest: new Array(L.stations.length).fill(0),
    destCont: new Array(L.stations.length).fill(0),
    dur: 0,
  };
  const took = board(g, train, idx);
  train.run.dur = dwellFor(g, L.stations[idx], took);
  L.lastDepart[end === 'head' ? 0 : 1] = g.clock;
  if (!g.opened) {
    g.opened = true;
    g.events.push({ type: 'open', geo: L.stations[idx].geo });
  }
  return true;
}

// The bell (and probes): pick the hungrier end; the bell may override the
// turnaround wait (you are literally pushing the service out).
export function dispatchLine(g, li) {
  const L = g.lines[li];
  const headQ = L.waitingF[0] || 0;
  const tailQ = L.waitingB[L.stations.length - 1] || 0;
  const first = headQ >= tailQ ? 'head' : 'tail';
  const second = first === 'head' ? 'tail' : 'head';
  return dispatchFrom(g, li, first, true) || dispatchFrom(g, li, second, true);
}

// The bell: dispatch on the line with the most waiting PER STATION (absolute
// totals starve short lines, report 634 §1d).
export function dispatch(g) {
  let best = -1, bestLi = -1;
  for (let li = 0; li < g.lines.length; li++) {
    if (!g.trains.some((t) => t.line === li && !t.run && !t.mothballed)) continue;
    const w = lineWaitingTotal(g, li) / g.lines[li].stations.length;
    if (w > best) { best = w; bestLi = li; }
  }
  return bestLi >= 0 ? dispatchLine(g, bestLi) : false;
}

// Phase transitions: a dwell ends by pulling away (move), a move ends by
// arriving (alight, then dwell or idle at a terminus).
function advancePhase(g, train) {
  const L = g.lines[train.line];
  const run = train.run;
  run.t = 0;
  if (run.phase === 'dwell') {
    // ATC holding is HEADWAY-based (report 640 follow-through): a train may not
    // depart a platform sooner than holdShare of the signalling floor after the
    // previous same-direction departure from it. Irregular service smooths out;
    // without ATC, gaps swing freely and platforms feel it.
    const lastPass = run.dir === 1 ? L.lastPassF : L.lastPassB;
    if (g.owned.atc && g.clock - lastPass[run.from] < minHeadway(g) * BAL.holdShare) {
      run.dur = BAL.holdDwell; // hold at the platform, doors open
      return;
    }
    lastPass[run.from] = g.clock;
    run.phase = 'move';
    run.dur = moveTime(g, kmBetween(L.stations[run.from].geo, L.stations[run.from + run.dir].geo));
    return;
  }
  // Arriving.
  run.from += run.dir;
  const k = run.from;
  const off = run.dest[k] || 0;
  if (off > 0) {
    run.dest[k] = 0;
    run.onboard = Math.max(0, run.onboard - off);
    g.totalDelivered += off;
    g.deliv60 += off / 60;
    if (off >= 1) g.events.push({ type: 'alight', geo: L.stations[k].geo, n: Math.round(off) });
  }
  // Transfers: continuing passengers step off and join this node's queues on
  // the OTHER lines (their destinations re-draw from the node's distribution;
  // documented approximation). Nowhere to go = journey ends here.
  const cont = run.destCont[k] || 0;
  if (cont > 0) {
    run.destCont[k] = 0;
    run.onboard = Math.max(0, run.onboard - cont);
    const net = networkCache(g);
    const variant = net.variants[phaseVariantIdx(g)];
    const key = physKeyOf(L.stations[k]);
    const options = [];
    let total = 0;
    for (let l2 = 0; l2 < g.lines.length; l2++) {
      if (l2 === train.line) continue;
      g.lines[l2].stations.forEach((st2, i2) => {
        if (physKeyOf(st2) !== key) return;
        const sh = variant.entryShares.get(l2 + ':' + i2);
        if (!sh) return;
        if (sh.f > 0) { options.push([l2, i2, 'f', sh.f]); total += sh.f; }
        if (sh.b > 0) { options.push([l2, i2, 'b', sh.b]); total += sh.b; }
      });
    }
    if (total <= 0) {
      g.totalDelivered += cont;
      g.deliv60 += cont / 60;
    } else {
      for (const [l2, i2, d2, sh] of options) {
        const q = d2 === 'f' ? g.lines[l2].waitingF : g.lines[l2].waitingB;
        q[i2] += cont * (sh / total);
      }
      g.events.push({ type: 'transfer', geo: L.stations[k].geo, n: Math.round(cont) });
    }
  }
  const atTerminus = k === 0 || k === L.stations.length - 1;
  if (atTerminus) {
    g.totalDelivered += Math.max(0, run.onboard); // numerical dust only
    train.at = k;
    train.run = null;
    train.readyAt = g.clock + BAL.turnaroundS;
  } else {
    const took = board(g, train, k);
    run.phase = 'dwell';
    run.dur = dwellFor(g, L.stations[k], took);
  }
}

// Where is a train, for the renderer: {from, to, f} with f the DISTANCE
// fraction along the segment (0 during a dwell: the dot is held at the
// platform). Uses the accel profile, so dots visibly brake into stations.
export function trainPos(g, train) {
  const run = train.run;
  if (!run) return { from: train.at, to: train.at, f: 0 };
  if (run.phase === 'dwell') return { from: run.from, to: run.from, f: 0 };
  const L = g.lines[train.line];
  const d = kmBetween(L.stations[run.from].geo, L.stations[run.from + run.dir].geo);
  const m = effectMult(g, 'speed');
  const v = BAL.maxSpeedKmS / m;
  const a = BAL.accelKmS2 / m;
  const dCrit = (v * v) / a;
  const t = Math.min(run.t, run.dur);
  let x;
  if (d >= dCrit) {
    const ta = v / a;
    if (t <= ta) x = 0.5 * a * t * t;
    else if (t <= run.dur - ta) x = dCrit / 2 + v * (t - ta);
    else { const tr = run.dur - t; x = d - 0.5 * a * tr * tr; }
  } else {
    const half = run.dur / 2;
    const vPeak = a * half;
    if (t <= half) x = 0.5 * a * t * t;
    else { const tr = run.dur - t; x = d - 0.5 * a * tr * tr; }
    void vPeak;
  }
  return { from: run.from, to: run.from + run.dir, f: Math.max(0, Math.min(1, x / d)) };
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
  return Math.min(1, cov / g.srcW.reduce((a, b) => a + b, 0));
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

  // Passengers gather where the NETWORK says they should: each station's spawn
  // splits across its lines and directions by the first hop of real shortest
  // paths (peak variants bias destinations toward/away from the hub). Demand
  // lives in the district budgets; the day cycle breathes on top.
  const cap = stationCap(g);
  const demandMult = 1 + effectAdd(g, 'demand');
  const dMult = dayMult(g);
  const netC = networkCache(g);
  const variant = netC.variants[phaseVariantIdx(g)];
  for (let li = 0; li < g.lines.length; li++) {
    const L = g.lines[li];
    for (let i = 0; i < L.stations.length; i++) {
      const s = L.stations[i];
      const sh = variant.entryShares.get(li + ':' + i) || { f: 0, b: 0 };
      // Accessibility scales trip GENERATION (646 §a): people ride from
      // stations that can take them places. This is what makes a junction,
      // a loop, or a second line raise income at stations it never touches.
      const af = netC.accF.get(physKeyOf(s)) ?? 1;
      let rate = BAL.spawnPerSec * s.mult * demandMult * dMult * (sh.f + sh.b) * af;
      if (surgedAt(g, li, i)) rate *= BAL.surgeSpawnMult;
      const room = cap * s.mult - waitingAt(g, li, i);
      const add = Math.min(Math.max(0, room), rate * dt);
      const fShare = sh.f + sh.b > 0 ? sh.f / (sh.f + sh.b) : 0.5;
      L.waitingF[i] += add * fShare;
      L.waitingB[i] += add * (1 - fShare);
      // Abandonment (report 634 risk 1): the missing cost of overcrowding.
      // Crowded platforms leak passengers, quadratically with crowding.
      // Held until opening day: an unopened line has no service to abandon.
      const crowd = waitingAt(g, li, i) / (cap * s.mult);
      if (g.opened && crowd > 0.25) {
        const leaveK = BAL.abandonPerSec * crowd * crowd * dt;
        const lost = (L.waitingF[i] + L.waitingB[i]) * leaveK;
        L.waitingF[i] -= L.waitingF[i] * leaveK;
        L.waitingB[i] -= L.waitingB[i] * leaveK;
        L.left60[i] += lost / 60;
        L.leaveAcc[i] += lost;
        if (L.leaveAcc[i] >= 5) {
          g.events.push({ type: 'abandon', geo: s.geo, n: Math.round(L.leaveAcc[i]) });
          L.leaveAcc[i] = 0;
        }
      }
      L.left60[i] = Math.max(0, L.left60[i] - L.left60[i] * dt / 60);
    }
  }

  // Upkeep drains, floored at zero; a sustained deficit mothballs a train.
  // Nothing is billed before opening day (report 643: the game could lose
  // itself at 128 s of menu-reading otherwise).
  if (g.opened) {
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
  }

  // Trains move.
  for (const train of g.trains) {
    if (!train.run) continue;
    train.run.t += dt;
    while (train.run && train.run.t >= train.run.dur) {
      train.run.t -= train.run.dur;
      advancePhase(g, train);
    }
  }

  // Drivers: EVENT-DRIVEN turnaround (638 §2, 640 ordering). A train departs
  // when it has arrived, turned around, and its terminus has had the headway
  // floor since the LAST departure from that end. Departure timing is now
  // emergent, so delays can compound: bunching exists, and holding matters.
  if (g.owned.drivers) {
    const floor = minHeadway(g);
    for (let li = 0; li < g.lines.length; li++) {
      const L = g.lines[li];
      let target = floor;
      if (g.owned.timetable) {
        const active = g.trains.reduce((n, t) => n + (t.line === li && !t.mothballed ? 1 : 0), 0);
        if (active > 0) target = Math.max(floor, lineCycleEst(g, li) / active);
      }
      if (g.clock - L.lastDepart[0] >= target) dispatchFrom(g, li, 'head', false);
      if (g.clock - L.lastDepart[1] >= target) dispatchFrom(g, li, 'tail', false);
    }
  }

  // The city grows where it is served well.
  growCity(g, dt);

  // Political capital accrues from coverage.
  g.pk += BAL.pkFullRatePerSec * coverage(g) * dt;

  // Decay the 60 s rate windows (the offline estimate reads these).
  g.gross60 = Math.max(0, g.gross60 - g.gross60 * dt / 60);
  g.deliv60 = Math.max(0, g.deliv60 - g.deliv60 * dt / 60);

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

// Cross-line sharing (M5 slice 3, report 634 idea 7): placing on top of
// another line's station makes it a JUNCTION served by both, which is how the
// real network branches (the green line's branches are overlapping linear
// services on a shared trunk, never Y-shaped lines; the sim's physical-station
// dedup was built for exactly this). Sharing requires the existing station be
// tier 2+: a junction is station-game infrastructure, not a free verb.
// Returns 'own' (this line already calls within spacing), a {li, i, st}
// share target on another line, or null (clear ground).
function shareTarget(g, li, geo) {
  let own = false, best = null, bestD = BAL.minSpacingKm;
  for (let l2 = 0; l2 < g.lines.length; l2++) {
    const sts = g.lines[l2].stations;
    for (let i2 = 0; i2 < sts.length; i2++) {
      const d = kmBetween(sts[i2].geo, geo);
      if (d >= BAL.minSpacingKm) continue;
      if (l2 === li) { own = true; continue; }
      if (d < bestD) { bestD = d; best = { li: l2, i: i2, st: sts[i2] }; }
    }
  }
  return own ? 'own' : best;
}

// What the drag label needs to say about a junction, read-only.
export function junctionPreview(g, li, geo) {
  const s = shareTarget(g, li, geo);
  return s && s !== 'own' ? { name: s.st.name, tier: s.st.tier } : null;
}

export function extensionCost(g, li, end, geo) {
  const from = endStation(g, li, end);
  const km = kmBetween(from.geo, geo);
  const share = shareTarget(g, li, geo);
  // A junction shares a station that already exists: track is the only build.
  const station = share && share !== 'own' ? 0
    : BAL.stationBase * Math.pow(BAL.stationGrowth, Math.max(0, g.lines[li].stations.length - 2));
  const track = km * BAL.trackPerKm * (crossesWater(from.geo, geo) ? BAL.waterMult : 1);
  return Math.round(station + track);
}

export function maxStationsNow(g) {
  return BAL.maxStations + effectAdd(g, 'maxStations');
}

export function placementProblem(g, li, end, geo) {
  const share = shareTarget(g, li, geo);
  if (share && share !== 'own') {
    // A junction adds no station on the ground and sits on dry land already.
    if (share.st.tier < 2) return 'needsTier2';
  } else {
    if (stationCount(g) >= maxStationsNow(g)) return 'max';
    for (const w of WATER) if (inRing(geo, w.ring)) return 'water';
    if (share === 'own') return 'tooClose';
  }
  if (g.money < extensionCost(g, li, end, geo)) return 'money';
  return null;
}

// --- Per-station upgrades (slice 1 sim; the panel UI is slice 2) ---
// Upgrading any entry of a physical station applies to all its line entries.

function entriesOfSame(g, li, i) {
  const st = g.lines[li].stations[i];
  const key = st.anchor !== null ? 'a' + st.anchor : st.geo[0].toFixed(4) + ',' + st.geo[1].toFixed(4);
  const out = [];
  for (let l2 = 0; l2 < g.lines.length; l2++) {
    g.lines[l2].stations.forEach((s2, i2) => {
      const k2 = s2.anchor !== null ? 'a' + s2.anchor : s2.geo[0].toFixed(4) + ',' + s2.geo[1].toFixed(4);
      if (k2 === key) out.push([l2, i2]);
    });
  }
  return out;
}

export function upgradeCost(g, li, i, kind) {
  const st = g.lines[li].stations[i];
  if (kind === 'tier') {
    return st.tier === 1 ? { kr: BAL.tier2Cost } : { kr: BAL.tier3CostKr, pk: BAL.tier3CostPk };
  }
  return { kr: Math.round(BAL.upgCostBase[kind] * Math.pow(BAL.upgCostGrowth, st[kind])) };
}

export function canUpgradeStation(g, li, i, kind) {
  const st = g.lines[li].stations[i];
  const cost = upgradeCost(g, li, i, kind);
  if (kind === 'tier') {
    if (st.tier >= 3) return false;
    if (st.tier === 2 && eraYear(g) < BAL.tier3Era) return false;
  } else if (st[kind] >= BAL.upgMax) {
    return false;
  }
  return g.money >= (cost.kr || 0) && g.pk >= (cost.pk || 0);
}

export function upgradeStation(g, li, i, kind) {
  if (!canUpgradeStation(g, li, i, kind)) return false;
  const cost = upgradeCost(g, li, i, kind);
  g.money -= cost.kr || 0;
  g.pk -= cost.pk || 0;
  for (const [l2, i2] of entriesOfSame(g, li, i)) {
    const st = g.lines[l2].stations[i2];
    if (kind === 'tier') {
      st.tier += 1;
      st.hub = st.tier >= 3;
    } else {
      st[kind] += 1;
    }
  }
  g._fracRev = -1; // catchment changed: the geometry cache MUST miss (report 638 §1)
  computeDemand(g);
  g.events.push({ type: 'upgrade', geo: g.lines[li].stations[i].geo, kind });
  return true;
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
// landing on another line's tier-2+ station shares it (a junction, see
// shareTarget). Returns true on success.
export function extendTo(g, li, end, geo, anchorIdx) {
  if (anchorIdx !== null && usedAnchorsOnLine(g, li).has(anchorIdx)) return false;
  if (anchorIdx !== null && !anchorRevealed(g, anchorIdx)) return false;
  if (placementProblem(g, li, end, geo)) return false;
  g.money -= extensionCost(g, li, end, geo);
  const share = shareTarget(g, li, geo); // 'own'/under-tier already refused above
  let station;
  if (share) {
    // The SAME station on the ground: copy identity AND built state, so the
    // new entry starts in lockstep with its physical twin (upgradeStation
    // keeps them there via entriesOfSame; a fresh tier-1 entry here would
    // desync dwell, gates and upkeep from what the player actually built).
    const s = share.st;
    station = { name: s.name, geo: s.geo, anchor: s.anchor, tier: s.tier,
                ent: s.ent, gates: s.gates, mult: s.mult, hub: s.hub };
    g.events.push({ type: 'junction', geo: s.geo, name: s.name });
  } else if (anchorIdx !== null) {
    station = anchorStation(anchorIdx);
  } else {
    g.freeSpots += 1;
    station = makeStation(freeSpotName(g, geo), geo, null, 1);
  }
  const L = g.lines[li];
  if (end === 'head') {
    L.stations.unshift(station);
    L.waitingF.unshift(BAL.seedWaiting * station.mult / 2);
    L.waitingB.unshift(BAL.seedWaiting * station.mult / 2);
    L.left60.unshift(0);
    L.leaveAcc.unshift(0);
    L.lastPassF.unshift(-Infinity);
    L.lastPassB.unshift(-Infinity);
    for (const t of g.trains) {
      if (t.line !== li) continue;
      t.at += 1;
      if (t.run) {
        t.run.from += 1;
        t.run.dest.unshift(0);
        t.run.destCont.unshift(0);
      }
    }
  } else {
    L.stations.push(station);
    L.waitingF.push(BAL.seedWaiting * station.mult / 2);
    L.waitingB.push(BAL.seedWaiting * station.mult / 2);
    L.left60.push(0);
    L.leaveAcc.push(0);
    L.lastPassF.push(-Infinity);
    L.lastPassB.push(-Infinity);
    for (const t of g.trains) if (t.line === li && t.run) { t.run.dest.push(0); t.run.destCont.push(0); }
  }
  L.rev += 1;
  computeDemand(g);
  g.events.push({ type: 'extend', geo: station.geo, name: station.name });
  return true;
}

export function canDemolish(g, li, end) {
  const L = g.lines[li];
  if (L.stations.length <= 2) return false;
  if (g.money < BAL.demolishCost) return false;
  const idx = end === 'head' ? 0 : L.stations.length - 1;
  // Only a train IN MOTION at or toward the doomed station blocks demolition
  // (its run references the geometry). A parked idle train never does: trains
  // rest at exactly the ends a player may demolish, so refusing on idle
  // soft-locked removal (owner hit it 2026-08-04); demolish() already
  // relocates parked trains to the surviving end.
  for (const t of g.trains) {
    if (t.line !== li || !t.run) continue;
    if (t.run.from === idx || t.run.from + t.run.dir === idx) return false;
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
    L.left60.shift();
    L.leaveAcc.shift();
    L.lastPassF.shift();
    L.lastPassB.shift();
    for (const t of g.trains) {
      if (t.line !== li) continue;
      t.at = Math.max(0, t.at - 1);
      if (t.run) {
        t.run.from -= 1;
        t.run.dest.shift();
        t.run.destCont.shift();
      }
    }
  } else {
    L.stations.pop();
    L.waitingF.pop();
    L.waitingB.pop();
    L.left60.pop();
    L.leaveAcc.pop();
    L.lastPassF.pop();
    L.lastPassB.pop();
    for (const t of g.trains) {
      if (t.line !== li) continue;
      if (t.at >= L.stations.length) t.at = L.stations.length - 1;
      if (t.run) { t.run.dest.pop(); t.run.destCont.pop(); }
    }
  }
  L.rev += 1;
  computeDemand(g);
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
  // Routing-relevant effects (transfer penalty, ride speed) re-route the city.
  if (item.mult && (item.mult.transfer || item.mult.speed || item.mult.dispatchInterval)) {
    g._netRev2 = undefined;
  }
  if (id === 'train') {
    // The new train joins the line with the fewest trains.
    let li = 0, best = Infinity;
    for (let k = 0; k < g.lines.length; k++) {
      const n = g.trains.filter((t) => t.line === k).length;
      if (n < best) { best = n; li = k; }
    }
    addTrain(g, li);
  }
  if (PROJECT_SEEDS[id]) {
    // A charter megaproject: a new line with a gift train. westline and
    // blueline seed from T-Centralen (their first corridor stops are adjacent
    // to it in reality). redline seeds as an ORPHAN shuttle on its corridor's
    // first two stops (report 646 §a: a T-C seed would skip Gamla stan and
    // Slussen FOREVER, there being no mid-line insertion; the orphan keeps
    // the historical threaded route open, and lines opening as disconnected
    // stubs is itself historical).
    const [a, b] = PROJECT_SEEDS[id]();
    g.lines.push(newLine([anchorStation(a), anchorStation(b)], g.lines.length, LINE_IDENTITY[id]));
    addTrain(g, g.lines.length - 1);
    computeDemand(g);
    g.events.push({ type: 'newline', geo: ANCHORS[b].geo, name: ANCHORS[b].name });
  }
  return true;
}

// What each charter seeds: [from, to] anchor indices.
const PROJECT_SEEDS = {
  westline: () => [0, CORRIDORS.find((c) => c.id === 'green-west').start],
  redline:  () => {
    const c = CORRIDORS.find((x) => x.id === 'red-south');
    return [c.start, c.start + 1];
  },
  blueline: () => [0, CORRIDORS.find((c) => c.id === 'blue-main').start],
};

// Tier downgrade (report 638 §4): agency over upkeep. No refund, the map stays
// intact, and a born Knutpunkt (T-Centralen) never falls below its rank.
export function canDowngradeTier(g, li, i) {
  const st = g.lines[li].stations[i];
  if (st.tier <= 1) return false;
  if (st.anchor !== null && ANCHORS[st.anchor].hub && st.tier <= 3) return false;
  // A junction stays a junction: while several lines call here, the tier may
  // not drop below 2 (tier 2 is what the sharing was bought with; report 642
  // §5b, ruled 2026-08-04).
  if (st.tier === 2 && entriesOfSame(g, li, i).length > 1) return false;
  return true;
}

export function downgradeTier(g, li, i) {
  if (!canDowngradeTier(g, li, i)) return false;
  for (const [l2, i2] of entriesOfSame(g, li, i)) {
    const st = g.lines[l2].stations[i2];
    st.tier -= 1;
    st.hub = st.tier >= 3;
  }
  g._fracRev = -1;
  computeDemand(g);
  g.events.push({ type: 'downgrade', geo: g.lines[li].stations[i].geo });
  return true;
}

// --- Found-a-line: a Knutpunkt's power (plan §6a) ---

export function canFoundLine(g, li, i) {
  const st = g.lines[li].stations[i];
  return st.tier >= 3 && g.lines.length < maxLinesNow(g) &&
    g.money >= BAL.foundLineKr && g.pk >= BAL.foundLinePk;
}

// Creates a one-station line at the hub; the player then drags its end out.
export function foundLine(g, li, i) {
  if (!canFoundLine(g, li, i)) return false;
  const st = g.lines[li].stations[i];
  g.money -= BAL.foundLineKr;
  g.pk -= BAL.foundLinePk;
  const clone = makeStation(st.name, st.geo, st.anchor, st.tier);
  clone.ent = st.ent;
  clone.gates = st.gates;
  const L = newLine([clone], g.lines.length, { color: foundedColor(g) });
  L.waitingF = [0];
  L.waitingB = [0];
  g.lines.push(L);
  computeDemand(g);
  g.events.push({ type: 'newline', geo: st.geo, name: st.name });
  return true;
}

// Player-controlled train allocation (report 634 risk 3): pull an idle train
// from the most-staffed other line onto this one. Free, reversible.
export function moveTrain(g, toLi) {
  if (g.money < BAL.moveTrainKr) return false;
  let from = -1, most = 0;
  for (let li = 0; li < g.lines.length; li++) {
    if (li === toLi) continue;
    const idle = g.trains.filter((t) => t.line === li && !t.run && !t.mothballed).length;
    if (idle > most) { most = idle; from = li; }
  }
  if (from < 0) return false;
  const t = g.trains.find((x) => x.line === from && !x.run && !x.mothballed);
  g.money -= BAL.moveTrainKr;
  t.line = toLi;
  t.at = 0;
  t.readyAt = g.clock + BAL.turnaroundS;
  return true;
}

// --- Offline progress: closed-form, not re-simulated (report 634 risk 4) ---
// Ticking a different resolution offline than online is a second simulation
// that drifts from the first. Instead: the measured 60 s online rates times
// elapsed time times a stated discount. Predictable, exploit-immune, and idle
// generosity is one tunable number. Drivers required: automation IS the idle income.

export function simulateOffline(g, seconds) {
  const s = Math.floor(Math.min(Math.max(0, seconds), BAL.offlineCapS));
  if (s < 60 || !g.owned.drivers) return null;
  const net = Math.max(0, g.gross60 * BAL.offlineDiscount - upkeepRate(g));
  const earned = net * s;
  const delivered = g.deliv60 * BAL.offlineDiscount * s;
  g.money += earned;
  g.totalDelivered += delivered;
  return { seconds: s, earned, delivered };
}

// --- Save / load (saveVersion is monotonic; forward-only migrations) ---

export const SAVE_KEY = 'tunnelbana_save';

// Shown in the menu and stamped on feedback, so a bug report always says which
// build it came from. Bump on anything a player would notice.
export const VERSION = '0.7.0';

export function serialize(g) {
  return JSON.stringify({
    saveVersion: 7,
    savedAt: Date.now(),
    money: Math.round(g.money),
    pk: Math.round(g.pk * 100) / 100,
    era: g.era,
    lines: g.lines.map((L) => ({
      stations: L.stations.map((st) => ({
        name: st.name, geo: st.geo, anchor: st.anchor,
        tier: st.tier, ent: st.ent, gates: st.gates,
      })),
      waitingF: L.waitingF.map((w) => Math.round(w)),
      waitingB: L.waitingB.map((w) => Math.round(w)),
      name: L.name,
      color: L.color,
    })),
    trains: g.trains.map((t) => ({ line: t.line, mothballed: t.mothballed })),
    freeSpots: g.freeSpots,
    owned: g.owned,
    endingSeen: g.endingSeen,
    opened: g.opened,
    srcW: g.srcW.map((w) => Math.round(w * 1000) / 1000),
    gross60: Math.round(g.gross60 * 100) / 100,
    deliv60: Math.round(g.deliv60 * 100) / 100,
    totalDelivered: Math.round(g.totalDelivered),
  });
}

function validStation(st) {
  return !!st && typeof st.name === 'string' && st.name.length > 0 && st.name.length <= 40 &&
    Array.isArray(st.geo) && st.geo.length === 2 &&
    Number.isFinite(st.geo[0]) && Number.isFinite(st.geo[1]) &&
    st.geo[0] > 59.0 && st.geo[0] < 59.6 && st.geo[1] > 17.5 && st.geo[1] < 18.6 &&
    (st.anchor === null || (Number.isInteger(st.anchor) && st.anchor >= 0 && st.anchor < ANCHORS.length));
}

const posInt = (v, max) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)));

// v7 stations carry tier + upgrade levels (v6's carried mult, now computed).
function sanitizeLine(stations) {
  return stations.map((st) => {
    const anchor = st.anchor === null ? null : Math.min(ANCHORS.length - 1, st.anchor);
    const born3 = anchor !== null && !!ANCHORS[anchor].hub;
    const tier = Math.max(born3 ? 3 : 1, Math.min(3, posInt(st.tier, 3) || 1));
    const s2 = makeStation(st.name, [st.geo[0], st.geo[1]], anchor, tier);
    s2.ent = posInt(st.ent, BAL.upgMax);
    s2.gates = posInt(st.gates, BAL.upgMax);
    return s2;
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
  // Saves from before opening day existed: any delivery proves the ribbon cut.
  g.opened = !!s.opened || g.totalDelivered > 0;
  g.gross60 = Math.max(0, Number(s.gross60) || 0);
  g.deliv60 = Math.max(0, Number(s.deliv60) || 0);
  if (Array.isArray(s.srcW) && s.srcW.length === g.srcW.length) {
    g.srcW = s.srcW.map((w, j) => {
      const v = Number(w);
      const base = g.srcW[j];
      return Number.isFinite(v) ? Math.min(base * BAL.growthCap, Math.max(base, v)) : base;
    });
  }
  // Clamp to the CURRENT catalog max: when a cap is lowered (a measurement
  // ruling, e.g. timetable 3 -> 1), saved over-cap levels retire with it.
  for (const item of CATALOG) g.owned[item.id] = posInt(s.owned?.[item.id], item.max);
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
    g.lines = s.lines.map((L, idx) => ({
      stations: sanitizeLine(L.stations),
      // Pre-identity saves fall back to the palette by founding order.
      name: typeof L.name === 'string' ? L.name : (idx === 0 ? 'Gröna linjen' : 'Linje ' + (idx + 1)),
      color: /^#[0-9a-f]{6}$/i.test(L.color || '') ? L.color : lineColor(idx),
      waitingF: [],
      waitingB: [],
      left60: [],
      leaveAcc: [],
      lastDepart: [-Infinity, -Infinity],
      rev: 0,
    }));
    computeDemand(g); // multipliers derive from the network, never the save
    for (const L of g.lines) {
      const src = s.lines[g.lines.indexOf(L)];
      L.waitingF = L.stations.map((st, i) => readQueue(src.waitingF, i, st, 0.5));
      L.waitingB = L.stations.map((st, i) => readQueue(src.waitingB, i, st, 0.5));
      L.left60 = L.stations.map(() => 0);
      L.leaveAcc = L.stations.map(() => 0);
      L.lastPassF = L.stations.map(() => -Infinity);
      L.lastPassB = L.stations.map(() => -Infinity);
    }
    g.freeSpots = posInt(s.freeSpots, BAL.maxStations);
    g.trains = [];
    const tr = Array.isArray(s.trains) ? s.trains.slice(0, 32) : [];
    for (const t of tr) {
      const li = posInt(t?.line, g.lines.length - 1);
      addTrain(g, li).mothballed = !!t?.mothballed;
    }
    if (!g.trains.length) addTrain(g, 0);
    if (!g.trains.some((t) => !t.mothballed)) g.trains[0].mothballed = false;
    return g;
  }

  // Pre-v6 saves (the single-line era, some predating the T-Centralen hub)
  // are RETIRED: they start fresh. Pre-1.0 save policy allows this, and a
  // faithfully migrated pre-hub line kept resurrecting a Slussen start that
  // no longer matches the game.
  return newGame();
}
