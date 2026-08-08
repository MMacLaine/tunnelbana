// Simulation: multiple lines with free station placement, origin-destination
// passenger flows, distance-based fares, upkeep with mothballing, eras and
// megaprojects, political capital, surges, and offline progress. Aggregate
// flows, never agents (plan §4). DOM-free so it runs under node for smoke tests.

import { ANCHORS, CORRIDORS, DISTRICTS, START_BUILT, WEST_FIRST, WATER, kmBetween, crossesWater, inRing, densityAt } from './data.js';
import { EGGS } from './facts.js';

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
  tier3PkGrowth: 1.7,     // each hub costs more trust than the last, so hubs
                          // cannot quietly eat the budget the eras need
  tier3Era: 1957,          // Knutpunkt unlocks here; T-Centralen is born one
  upgCostBase: { ent: 500, gates: 400, shop: 2200 },
  // Retail rent: the flat-income axis. Steeper than the service axes because it
  // prints money directly, and deliberately small per level: its job is a floor
  // under the player who looks away and a sink for the cash that used to pile up
  // unspent (probe-arc measured a quarter of a million idle at minute 60), NOT a
  // way to earn without running a railway. Budgeted at ~15% of income.
  shopKrPerLevel: 0.25,      // kr/s per level, scaled by the station's own footfall
  // A station axis used to be THREE levels at x2 (500-1000-2000), so every
  // station was permanently finished after ~3 minutes of income and the
  // mid-game ran dry: probe-arc measured nine dead zones in the first hour,
  // the worst 450 s with nothing to buy. Eight levels at 1.35 keeps the first
  // levels costing about what they did (500-675-911 vs 500-1000-2000) while
  // turning a finished axis into a ladder there is always something to spend
  // into. This is the r~1.15 lesson from the idle literature applied to the
  // surface we already have 59 copies of.
  upgCostGrowth: 1.35,
  upgMax: 8,
  // ...but the depth is EARNED, not available on day one. With a flat cap of 8
  // the cheapest thing in the game was always another level on a three-station
  // line, and probe-arc showed the bot upgrading a stub for twenty minutes
  // instead of building (5 stations at 20 min, down from 13). Tier gates the
  // ladder instead: a Hållplats supports two levels, a Station five, a Hub all
  // eight. So the loop reads build wide -> tier up -> then deepen, and tier
  // upgrades gain a second job beyond dwell and interchange.
  // Depth is bought with MONEY (tier 2 at 1 500 kr), never with trust. Gating
  // the full ladder behind tier 3 looked tidy and measured badly: tier 3 costs
  // trust, so deepening competed with the era gates for the scarce currency and
  // probe-arc's bot spent its trust on hubs and then could not advance the era
  // (17 dead zones, 785k kr idle). Trust stays for eras, megaprojects and the
  // interchange powers of a hub. The loop is: build wide, tier up, then deepen.
  upgMaxByTier: [0, 3, 8, 8],
  // Tier was not enough on its own. Owner playtest 2026-08-05, still inside the
  // first era: "the station upgrades seem a little too cheap/powerful, perhaps
  // it's better to only have 1 upgrade per era". He is right about the feel and
  // about the cause: tier 1 allowed three levels immediately, so 900 kr of
  // entrances and gates on a brand-new stop out-earned building the next stop,
  // and the opening era could be solved by deepening instead of by extending.
  // A SECOND cap, by era, fixes that without undoing the ladder: the effective
  // cap is min(tier, era), so 1950 allows exactly one level of each axis and
  // the eight-deep ladder arrives with the era that needs a sink for millions.
  // Era-capped is also the more legible of the two ways to nerf this (the other
  // being a price rise): the button states its own reason, and a locked level
  // advertises the era gate rather than just feeling expensive.
  // Measured, not guessed. [1,2,3,5,6,8] fixed the opening and broke the middle:
  // probe-arc went from zero dead zones in the first hour to EIGHT, because the
  // era cap kept binding long after tier had stopped being the interesting
  // constraint (0 levels of room left at t=3600 with 68k kr idle). This ladder
  // holds only where the complaint was, the opening era, and hands the depth
  // back fast enough that tier is the binding cap again from 1952 on.
  // 1952 raised 3 -> 4 with the plan gate (2026-08-07): eras now demand their
  // corridor complete, which stretched era 1952 from ~28 to ~45 active
  // minutes, and probe-arc measured four dead zones (t=1868-2597, worst gap
  // 244 s) with the catalog maxed and 0 ladder room on 24 tier-2 stations.
  // One more level per axis is ~72 money-priced purchases exactly there.
  // Tier-1 stations still cap at 3 (their tier binds first), so the opening
  // fix this ladder exists for is untouched.
  upgMaxByEra: [1, 4, 5, 8, 8, 8],
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
  // The city's edge (owner ruling 2026-08-08: "people are being silly and
  // rightfully so" — one player laid track toward Gotland). 13 km from
  // T-Centralen covers every authored anchor with margin (Akalla, the
  // farthest, sits at ~12.4); Regionplanen extends it, within reason.
  buildRadiusKm: 13,
  trackPerKm: 520,         // kr per km of track
  waterMult: 2.0,          // track cost multiplier when the segment crosses water
  minSpacingKm: 0.35,      // same-line stations may not land closer than this
  maxStations: 90,         // network-wide cap (upgrades can raise it). Was 40
                           // pre-campaign; the campaign authors 59 anchors, so
                           // the cap must leave room for them plus free spots
  // Trust per second at 100% regional coverage. Sized from the arc, not by
  // feel: the story costs ~250 trust (eras 182 + megaprojects 41 + a few hubs),
  // and probe-arc measured average coverage near 50% across a run, so a 2.5 h
  // arc needs 250 / (9000 s x 0.5) = 0.055. At the old 0.02 the era gates alone
  // were ~9 hours of accrual and TRUST, not riders, was what actually stalled
  // the mid-game: at minute 60 the bot had 175k riders against an 80k threshold
  // and could not advance for want of 6 more trust.
  pkFullRatePerSec: 0.055,
  // Trust rate x(1 + this x era): the proven-operator bonus. 0.25 measured
  // short (probe 2026-08-08: pk 13.9/25 at t=3600, because an active 1957
  // spends ~30 trust on hubs and through-running BESIDE the 25 the era
  // gate wants); 0.4 covers both jobs. The 1950 opening is untouched.
  pkEraGrowth: 0.4,
  surgeEvery: 120,         // seconds between rush events
  surgeDur: 25,            // seconds a rush lasts
  surgeSpawnMult: 3,       // spawn multiplier at the rushed station
  surgeFareMult: 1.5,      // fare multiplier for boardings at the rushed station
  // Incidents (owner direction 2026-08-07: mid-game texture, never an early
  // annoyance). From 1957 the network is old enough to break: a signal
  // failure closes one station to boarding, the queue builds, and the rush
  // grade remembers. The repair crew costs seconds of gross income, so the
  // decision stays real at every scale; waiting it out is always legal and
  // costs nothing but riders' patience. No fail state, ever.
  incidentEra: 1957,
  incidentEvery: 240,      // seconds between failures once the era allows them
  incidentDur: 45,
  incidentFixGross: 25,    // repair = this many seconds of gross income...
  incidentFixMin: 400,     // ...but never less than this
  // Golden trains (owner ask 2026-08-08): a rare visitor worth spotting. A
  // gold train glides one line end to end; clicking it grants a small bonus
  // and missing it costs nothing. Bonuses alternate between a capped trust
  // nod and doubled fares for a minute.
  goldEvery: 420,
  goldDur: 20,
  goldTrust: 1,
  goldBoostS: 60,
  goldBoostMult: 2,
  abandonPerSec: 0.06,     // share of a FULL platform that gives up per second
                           // (scaled by crowding squared: light queues barely leak)
  foundLineKr: 2500,       // charter a new line from a Knutpunkt
  foundLinePk: 3,
  moveTrainKr: 100,        // depot transfer fee (reassignment must not beat a return trip)
  // The fleet ceiling grows with the era, because the LINES do (live feedback
  // 2026-08-07: era 1952 opened a second line and not one new train slot).
  // The value-gate knee (~3 trains per line at reachable demand) is a per-line
  // argument, so a network-wide cap must scale with the network: 8 in 1950,
  // +4 per era to 28 in the sandbox. Cost stays the real limiter, as the
  // catalog's 1.6 growth makes train 20 a 7.5M kr decision.
  fleetPerEra: 4,
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
// Rescaled 2026-08-05 from measurement, not from an hours model. probe-arc
// showed era 1950's content exhausting around minute 20 while the 1952 gate sat
// at minute 28, and 1957 unreachable inside an hour: the story was waiting on a
// counter while the player had nothing to buy. Thresholds now land shortly
// after each corridor's content runs out (plan 2b), which is what puts the arc
// on the player's building pace instead of on a rider tally.
// 1952's rider threshold dropped 25000 -> 20000 with the plan gate
// (2026-08-07): probe-arc's active player finished the 1950 line at t=1006
// and crossed 25 000 riders at ~1031, a photo finish that put a counter
// between the finished line and the era it earns. At 20 000 the plan is
// cleanly the last gate: trust lands ~790 s, riders ~900 s, the line when
// the money says so. An active early player waits on MONEY, never on trust
// (owner direction, 2026-08-07).
export const ERAS = [
  { year: 1950 },
  { year: 1952, pk: 5,  delivered: 20000 },
  { year: 1957, pk: 12, delivered: 80000 },
  { year: 1964, pk: 25, delivered: 180000 },
  { year: 1975, pk: 50, delivered: 340000 },
  { year: 2000, pk: 90, delivered: 600000 },
];

// The upgrade CATALOG (plan §6, Cookie Clicker direction): upgrades are DATA, and
// their effects compose through named modifiers, never through code reading BAL
// directly. `mult` effects multiply per level owned; `add` effects add per level.
// `currency: 'pk'` marks megaprojects; `kind` marks purchases with side effects.
// --- Achievements (owner ask, 2026-08-05) ---
// Data, like the catalog: id, name, what earns it, and a SMALL named modifier.
// Rewards are deliberately minor (the set is worth roughly x1.3 in total, inside
// the demand and fare budgets in the balance plan): these are aims and
// recognition first, power second. `hint` shows while locked, so a player always
// knows what to chase; nothing here is a secret.
export const ACHIEVEMENTS = [
  { id: 'first-departure', name: 'Invigning', hint: 'Send out your first train',
    check: (g) => g.opened, add: { demand: 0.01 } },
  { id: 'ten-stations', name: 'A line worth the name', hint: 'Run ten stations',
    check: (g) => stationCount(g) >= 10, add: { demand: 0.02 } },
  { id: 'full-1950', name: 'Hökarängen', hint: 'Complete the 1950 line',
    check: (g) => usedAnchorsAll(g).size >= 13, mult: { fare: 1.02 } },
  { id: 'hundred-k', name: 'Hundred thousand journeys', hint: 'Carry 100 000 riders',
    check: (g) => g.totalDelivered >= 1e5, mult: { fare: 1.02 } },
  { id: 'million', name: 'A million rides', hint: 'Carry 1 000 000 riders',
    check: (g) => g.totalDelivered >= 1e6, mult: { fare: 1.03 } },
  { id: 'ten-million', name: 'The city rides', hint: 'Carry 10 000 000 riders',
    check: (g) => g.totalDelivered >= 1e7, mult: { fare: 1.05 } },
  { id: 'first-junction', name: 'Bytespunkt', hint: 'Let two lines share a station',
    check: (g) => {
      for (let i = 0; i < ANCHORS.length; i++) if (linesAtAnchor(g, i) > 1) return true;
      return false;
    }, mult: { transfer: 1.05 } },
  { id: 'first-hub', name: 'Knutpunkt', hint: 'Build a hub of your own',
    check: (g) => {
      const seen = new Set();
      for (const L of g.lines) for (const st of L.stations) {
        const k = st.anchor !== null ? 'a' + st.anchor : st.name;
        if (seen.has(k)) continue;
        seen.add(k);
        if (st.tier >= 3 && !(st.anchor !== null && ANCHORS[st.anchor].hub)) return true;
      }
      return false;
    }, add: { demand: 0.02 } },
  { id: 'three-lines', name: 'A network', hint: 'Run three lines at once',
    check: (g) => g.lines.length >= 3, add: { demand: 0.03 } },
  { id: 'red-line', name: 'Röda linjen', hint: 'Reach Fruängen',
    check: (g) => usedAnchorsAll(g).has(35), mult: { fare: 1.03 } },
  { id: 'blue-line', name: 'Blå linjen', hint: 'Reach Hjulsta',
    check: (g) => usedAnchorsAll(g).has(52), mult: { fare: 1.03 } },
  { id: 'whole-map', name: 'Hela Stockholm', hint: 'Connect every station on the map',
    check: (g) => usedAnchorsAll(g).size >= ANCHORS.length, mult: { fare: 1.05 } },
  { id: 'millionaire', name: 'A million kronor', hint: 'Hold 1 000 000 kr at once',
    check: (g) => g.money >= 1e6, mult: { fare: 1.02 } },
  { id: 'billion', name: 'En miljard', hint: 'Bank 1 000 000 000 kr',
    check: (g) => g.money >= 1e9, mult: { fare: 1.05 } },
  { id: 'retailer', name: 'Rent collector', hint: 'Earn 100 kr/s from retail',
    check: (g) => commerceRate(g) >= 100, add: { demand: 0.02 } },
  { id: 'punctual', name: 'Turn-up-and-go', hint: 'Run a line at a headway under 30 s',
    check: (g) => {
      for (let li = 0; li < g.lines.length; li++) {
        if (g.lines[li].stations.length >= 4 && lineHeadwayS(g, li) < 30) return true;
      }
      return false;
    }, mult: { dispatchInterval: 0.98 } },
  { id: 'nobody-left', name: 'Nobody left behind', hint: 'Carry 5 000 riders with nobody giving up',
    check: (g) => g.opened && g.totalDelivered > 5000 &&
      g.lines.every((L) => L.left60.every((x) => x === 0)), add: { demand: 0.02 } },
  { id: 'final-era', name: 'Hela staden', hint: 'Reach the last era',
    check: (g) => g.era >= ERAS.length - 1, mult: { fare: 1.05 } },
  // The 0.9 four (live feedback asked for more aims). 'depot-move' is also
  // teaching: the transfer verb was the most-missed mechanic in the 0.8.2
  // reports, and an aim that names it is a tutorial line that pays.
  { id: 'depot-move', name: 'Omdisponering', hint: 'Move a train to another line',
    check: (g) => (g.trainMoves || 0) >= 1, add: { demand: 0.01 } },
  { id: 'under-water', name: 'Under Strömmen', hint: 'Take a line across the water yourself',
    check: (g) => {
      // The STARTING line already crosses Norrström and Söderström (screenshot
      // pass: the toast fired at boot), so the aim is a THIRD crossing: one
      // the player dug.
      let n = 0;
      for (const L of g.lines) {
        for (let i = 0; i + 1 < L.stations.length; i++) {
          if (crossesWater(L.stations[i].geo, L.stations[i + 1].geo) && ++n >= 3) return true;
        }
      }
      return false;
    }, mult: { fare: 1.02 } },
  { id: 'rush-service', name: 'Rusningstrafik', hint: 'Carry 500 riders within one minute',
    check: (g) => g.deliv60 * 60 >= 500, add: { demand: 0.02 } },
  { id: 'forty', name: 'The city underground', hint: 'Run forty stations at once',
    check: (g) => stationCount(g) >= 40, mult: { fare: 1.03 } },
  // --- Achievements 2.0 (0.10, owner direction: aims are what drive the end
  // game; some easy, some brutal). Almost everything below is RECOGNITION,
  // no modifier: the pass-01 budget ruling (the whole set worth ~x1.3) holds,
  // and only a handful of hard aims carry a token. Categories, hidden flags
  // and tier families live in ACH_META below; the checks stay data. ---
  // history
  { id: 'vasterort', name: 'Västerort', hint: 'Complete the 1952 line to Vällingby',
    check: (g) => !!g.planDone['green-west'] },
  { id: 'genom-staden', name: 'Genom staden', hint: 'Reach 1957: the lines become a system',
    check: (g) => g.era >= 2 },
  { id: 'red-complete', name: 'Söder om Söder', hint: 'Deliver every red corridor',
    check: (g) => g.planDone['red-south'] && g.planDone['red-orn'] && g.planDone['red-ost'] },
  { id: 'blue-complete', name: 'Järvafältet', hint: 'Deliver both blue corridors',
    check: (g) => g.planDone['blue-main'] && g.planDone['blue-akalla'] },
  { id: 'charters', name: 'Three charters', hint: 'Take all three megaproject lines',
    check: (g) => g.owned.westline && g.owned.redline && g.owned.blueline },
  { id: 'slutstation', name: 'SLUTSTATION', hint: 'The last station',
    check: (g) => g.endingSeen },
  // building
  { id: 'twentyfive', name: 'Twenty-five stops', hint: 'Run twenty-five stations at once',
    check: (g) => stationCount(g) >= 25 },
  { id: 'fiftyfive', name: 'Nearly everything', hint: 'Run fifty-five stations at once',
    check: (g) => stationCount(g) >= 55 },
  { id: 'five-lines', name: 'Five colours', hint: 'Run five lines at once',
    check: (g) => g.lines.length >= 5 },
  { id: 'first-free', name: 'Your own stop', hint: 'Place a station of your own, off the plan',
    check: (g) => g.freeSpots >= 1 },
  { id: 'ten-free', name: 'City planner', hint: 'Place ten stations of your own',
    check: (g) => g.freeSpots >= 10 },
  { id: 'three-junctions', name: 'Weave', hint: 'Run three interchanges at once',
    check: (g) => {
      let n = 0;
      for (let i = 0; i < ANCHORS.length && n < 3; i++) if (linesAtAnchor(g, i) > 1) n++;
      return n >= 3;
    } },
  { id: 'hub-trio', name: 'Three Knutpunkter', hint: 'Build three hubs of your own',
    check: (g) => {
      const seen = new Set();
      let n = 0;
      for (const L of g.lines) for (const st of L.stations) {
        const k = st.anchor !== null ? 'a' + st.anchor : st.name;
        if (seen.has(k)) continue;
        seen.add(k);
        if (st.tier >= 3 && !(st.anchor !== null && ANCHORS[st.anchor].hub)) n++;
      }
      return n >= 3;
    } },
  { id: 'long-line', name: 'The long way round', hint: 'Run a line of sixteen stops',
    check: (g) => g.lines.some((L) => L.stations.length >= 16) },
  { id: 'all-tier2', name: 'No mere stops', hint: 'Every station a Station, ten or more of them',
    check: (g) => stationCount(g) >= 10 &&
      g.lines.every((L) => L.stations.every((st) => st.tier >= 2)) },
  { id: 'demolisher', name: 'Ombyggnad', hint: 'Some things must come down',
    check: (g) => g.demolished >= 5 },
  // riders
  { id: 'first-thousand', name: 'The first thousand', hint: 'Carry 1 000 riders',
    check: (g) => g.totalDelivered >= 1e3 },
  { id: 'hundred-million', name: 'A hundred million', hint: 'Carry 100 000 000 riders',
    check: (g) => g.totalDelivered >= 1e8, mult: { fare: 1.03 } },
  { id: 'billion-riders', name: 'The city, forever', hint: 'Carry a billion riders',
    check: (g) => g.totalDelivered >= 1e9 },
  { id: 'per-min-1k', name: 'A thousand a minute', hint: 'Carry 1 000 riders in one minute',
    check: (g) => g.records.riders >= 1000 },
  { id: 'per-min-3k', name: 'Three thousand a minute', hint: 'Carry 3 000 riders in one minute',
    check: (g) => g.records.riders >= 3000 },
  { id: 'transfer-10k', name: 'Byten', hint: 'See 10 000 riders change lines',
    check: (g) => g.transfers >= 1e4 },
  { id: 'transfer-100k', name: 'The weave holds', hint: 'See 100 000 riders change lines',
    check: (g) => g.transfers >= 1e5 },
  // money
  { id: 'hundred-k-kr', name: 'First savings', hint: 'Hold 100 000 kr at once',
    check: (g) => g.money >= 1e5 },
  { id: 'ten-million-kr', name: 'Ten million', hint: 'Hold 10 000 000 kr at once',
    check: (g) => g.money >= 1e7 },
  { id: 'hundred-million-kr', name: 'A city budget', hint: 'Hold 100 000 000 kr at once',
    check: (g) => g.money >= 1e8 },
  { id: 'turnover-million', name: 'Turned over a million', hint: 'Earn 1 000 000 kr, all told',
    check: (g) => g.grossLife >= 1e6 },
  { id: 'turnover-billion', name: 'Turned over a billion', hint: 'Earn 1 000 000 000 kr, all told',
    check: (g) => g.grossLife >= 1e9, mult: { fare: 1.02 } },
  { id: 'rent-500', name: 'Landlord of the underground', hint: 'Earn 500 kr/s from retail',
    check: (g) => commerceRate(g) >= 500 },
  // trust
  { id: 'first-trust', name: 'The city notices', hint: 'Earn your first trust',
    check: (g) => g.pk >= 1 },
  { id: 'coverage-half', name: 'Half the region', hint: 'Serve half the region well',
    check: (g) => coverage(g) >= 0.5 },
  { id: 'coverage-80', name: 'Almost everyone', hint: 'Serve four fifths of the region well',
    check: (g) => coverage(g) >= 0.8, add: { demand: 0.02 } },
  { id: 'city-grows', name: 'ABC-stad', hint: 'Grow the city half again its size',
    check: (g) => cityMult(g) >= 1.5 },
  { id: 'city-max', name: 'The city you made', hint: 'Grow the city near its ceiling',
    check: (g) => cityMult(g) >= 2.4 },
  { id: 'own-line', name: 'Egen linje', hint: 'Found a line from a hub of your own',
    check: (g) => g.founded >= 1 },
  // service
  { id: 'drivers-hired', name: 'Staffed', hint: 'Hire drivers',
    check: (g) => !!g.owned.drivers },
  { id: 'full-auto', name: 'Modern railway', hint: 'Own drivers, timetable, ATC and CBTC',
    check: (g) => g.owned.drivers && g.owned.timetable && g.owned.atc && g.owned.cbtc,
    mult: { dispatchInterval: 0.99 } },
  { id: 'rush-a', name: 'A clean rush', hint: 'Grade an A at a peak',
    check: (g) => (g.rushCount.A || 0) >= 1 },
  { id: 'rush-a-10', name: 'Ten clean rushes', hint: 'Grade A at ten peaks',
    check: (g) => (g.rushCount.A || 0) >= 10, add: { demand: 0.01 } },
  { id: 'rush-a-50', name: 'The city never waits', hint: 'Fifty clean rushes',
    check: (g) => (g.rushCount.A || 0) >= 50 },
  { id: 'fixer', name: 'Repair crew', hint: 'Clear a signal failure',
    check: (g) => g.incidentsFixed >= 1 },
  { id: 'fixer-10', name: 'On call', hint: 'Clear ten signal failures',
    check: (g) => g.incidentsFixed >= 10 },
  { id: 'headway-15', name: 'Metronome', hint: 'Run a line at a headway under 15 s',
    check: (g) => {
      for (let li = 0; li < g.lines.length; li++) {
        if (g.lines[li].stations.length >= 4 && lineHeadwayS(g, li) < 15) return true;
      }
      return false;
    } },
  { id: 'fleet-10', name: 'Ten trains', hint: 'Run ten trains',
    check: (g) => g.trains.filter((t) => !t.mothballed).length >= 10 },
  { id: 'fleet-20', name: 'Twenty trains', hint: 'Run twenty trains',
    check: (g) => g.trains.filter((t) => !t.mothballed).length >= 20 },
  { id: 'moves-10', name: 'Trafikledning', hint: 'Order ten depot transfers',
    check: (g) => (g.trainMoves || 0) >= 10 },
  { id: 'pattern-first', name: 'Your own timetable', hint: 'Set up a service pattern of your own',
    check: (g) => g.patternsSet >= 1 },
  // night
  { id: 'night-10k', name: 'Nattöppet', hint: 'Carry 10 000 riders at night',
    check: (g) => g.nightDelivered >= 1e4 },
  { id: 'night-100k', name: 'While the city sleeps', hint: 'Carry 100 000 riders at night',
    check: (g) => g.nightDelivered >= 1e5 },
  { id: 'night-owner', name: 'Nattrafik', hint: 'Run the night service',
    check: (g) => !!g.owned.nightservice },
  { id: 'night-build', name: 'Nattarbete', hint: 'Extend a line in the middle of the night',
    check: (g) => g.nightBuilds >= 1 },
  // endgame
  { id: 'seven-lines', name: 'Beyond the palette', hint: 'Run seven lines in the sandbox',
    check: (g) => g.lines.length >= 7 },
  { id: 'maxed-catalog', name: 'Nothing left to buy', hint: 'Max every upgrade in the shop',
    check: (g) => CATALOG.every((item) => g.owned[item.id] >= maxFor(g, item)) },
  { id: 'station-cap', name: 'Full map', hint: 'Build to the station limit',
    check: (g) => stationCount(g) >= maxStationsNow(g) },
  { id: 'ladder-full', name: 'A palace of a station', hint: 'Max all three axes at one station',
    check: (g) => g.lines.some((L) => L.stations.some((st) =>
      st.ent >= 8 && st.gates >= 8 && st.shop >= 8)) },
  { id: 'bulk-25', name: 'Byggkontoret goes warm', hint: 'Place twenty-five bulk orders',
    check: (g) => g.bulkOrders >= 25 },
  { id: 'diagram-view', name: 'Se kartan', hint: 'Open the schematic map',
    check: (g) => g.diaViews >= 1 },
  { id: 'egg-first', name: 'Something in the fabric', hint: 'There are odd corners in this city',
    check: (g) => g.eggsFound >= 1 },
  { id: 'egg-all', name: 'Every odd corner', hint: 'Find them all',
    check: (g) => g.eggsFound >= 6 },
  // v12: the council. Recognition only, like the 0.11 top-up.
  { id: 'first-decision', name: 'The chamber nods', hint: 'Take a council decision',
    check: (g) => g.decisions >= 1 },
  { id: 'full-mandate', name: 'A standing majority', hint: 'Take every council decision',
    check: (g) => g.decisions >= COUNCIL.length },
  // --- The 0.11 top-up: past one hundred (owner: "ideally 100+, some easy,
  // some very hard"). All recognition, no modifiers: the reward budget from
  // pass 01 stays where it is. ---
  { id: 'era-1964', name: 'Två färger', hint: 'Reach 1964',
    check: (g) => g.era >= 3 },
  { id: 'era-1975', name: 'Under Järvafältet', hint: 'Reach 1975',
    check: (g) => g.era >= 4 },
  { id: 'plan-all', name: 'Generalplanen', hint: 'Deliver every corridor in the plan',
    check: (g) => CORRIDORS.every((c) => g.planDone[c.id]) },
  { id: 'junction-five', name: 'The weave holds five', hint: 'Run five interchanges at once',
    check: (g) => {
      let n = 0;
      for (let i = 0; i < ANCHORS.length && n < 5; i++) if (linesAtAnchor(g, i) > 1) n++;
      return n >= 5;
    } },
  { id: 'ten-lines', name: 'Ten colours', hint: 'Run ten lines in the sandbox',
    check: (g) => g.lines.length >= 10 },
  { id: 'free-25', name: 'Chief city planner', hint: 'Place twenty-five stations of your own',
    check: (g) => g.freeSpots >= 25 },
  { id: 'water-4', name: 'Archipelago habits', hint: 'Cross the water four times',
    check: (g) => {
      let n = 0;
      for (const L of g.lines) {
        for (let i = 0; i + 1 < L.stations.length; i++) {
          if (crossesWater(L.stations[i].geo, L.stations[i + 1].geo) && ++n >= 4) return true;
        }
      }
      return false;
    } },
  { id: 'hub-five', name: 'Five Knutpunkter', hint: 'Build five hubs of your own',
    check: (g) => {
      const seen = new Set();
      let n = 0;
      for (const L of g.lines) for (const st of L.stations) {
        const k = st.anchor !== null ? 'a' + st.anchor : st.name;
        if (seen.has(k)) continue;
        seen.add(k);
        if (st.tier >= 3 && !(st.anchor !== null && ANCHORS[st.anchor].hub)) n++;
      }
      return n >= 5;
    } },
  { id: 'transfer-million', name: 'A million byten', hint: 'See 1 000 000 riders change lines',
    check: (g) => g.transfers >= 1e6 },
  { id: 'per-min-5k', name: 'Five thousand a minute', hint: 'Carry 5 000 riders in one minute',
    check: (g) => g.records.riders >= 5000 },
  { id: 'turnover-biljon', name: 'Biljonen', hint: 'Past every ledger',
    check: (g) => g.grossLife >= 1e12 },
  { id: 'rent-2000', name: 'The underground mall', hint: 'Earn 2 000 kr/s from retail',
    check: (g) => commerceRate(g) >= 2000 },
  { id: 'coverage-95', name: 'The whole region', hint: 'Serve nearly everyone well',
    check: (g) => coverage(g) >= 0.95 },
  { id: 'fixer-25', name: 'Signalmästaren', hint: 'Clear twenty-five signal failures',
    check: (g) => g.incidentsFixed >= 25 },
  { id: 'moves-50', name: 'Depot choreography', hint: 'Order fifty depot transfers',
    check: (g) => (g.trainMoves || 0) >= 50 },
  { id: 'headway-10', name: 'A train in sight, always', hint: 'Run a line at a headway under 10 s',
    check: (g) => {
      for (let li = 0; li < g.lines.length; li++) {
        if (g.lines[li].stations.length >= 4 && lineHeadwayS(g, li) < 10) return true;
      }
      return false;
    } },
  { id: 'fleet-full', name: 'Every slot filled', hint: 'Own every train the era allows',
    check: (g) => g.owned.train >= maxFor(g, CATALOG.find((i) => i.id === 'train')) && g.era >= 4 },
  { id: 'night-million', name: 'Tunnelbana by starlight', hint: 'A million riders at night',
    check: (g) => g.nightDelivered >= 1e6 },
  { id: 'ach-50', name: 'Samlare', hint: 'Earn fifty of these',
    check: (g) => Object.keys(g.achieved || {}).length >= 50 },
  { id: 'ach-90', name: 'Allting', hint: 'Earn ninety of these',
    check: (g) => Object.keys(g.achieved || {}).length >= 90 },
  { id: 'played-10h', name: 'A regular', hint: 'Ten hours on the network',
    check: (g) => g.playedS >= 10 * 3600 },
  { id: 'played-24h', name: 'Dygnet runt', hint: 'A full day of your life, underground',
    check: (g) => g.playedS >= 24 * 3600 },
  { id: 'bulk-100', name: 'Standing order', hint: 'Place one hundred bulk orders',
    check: (g) => g.bulkOrders >= 100 },
  { id: 'gold-first', name: 'Guldtåget', hint: 'Catch the golden train',
    check: (g) => g.goldTaken >= 1 },
  { id: 'gold-25', name: 'Gold standard', hint: 'Catch twenty five golden trains',
    check: (g) => g.goldTaken >= 25 },
];

// Presentation metadata by id: category, hidden (shown as ??? with a tease
// until earned), and tier families (rows the list draws as one aim with
// dots). checkAchievements ignores all of this; earning is earning.
export const ACH_CATS = [
  { key: 'history', name: 'History' },
  { key: 'building', name: 'Building' },
  { key: 'riders', name: 'Riders' },
  { key: 'money', name: 'Money' },
  { key: 'trust', name: 'Trust' },
  { key: 'service', name: 'Service' },
  { key: 'night', name: 'Night' },
  { key: 'endgame', name: 'Endgame' },
];
export const ACH_META = {
  'first-departure': { cat: 'history' },
  'full-1950': { cat: 'history' },
  'vasterort': { cat: 'history' },
  'genom-staden': { cat: 'history' },
  'red-line': { cat: 'history' },
  'red-complete': { cat: 'history' },
  'blue-line': { cat: 'history' },
  'blue-complete': { cat: 'history' },
  'charters': { cat: 'history' },
  'final-era': { cat: 'history' },
  'whole-map': { cat: 'history' },
  'slutstation': { cat: 'history', hidden: true, tease: 'The last station' },
  'ten-stations': { cat: 'building' },
  'twentyfive': { cat: 'building', family: 'stations' },
  'forty': { cat: 'building', family: 'stations' },
  'fiftyfive': { cat: 'building', family: 'stations' },
  'first-junction': { cat: 'building' },
  'three-junctions': { cat: 'building' },
  'first-hub': { cat: 'building' },
  'hub-trio': { cat: 'building' },
  'three-lines': { cat: 'building', family: 'lines' },
  'five-lines': { cat: 'building', family: 'lines' },
  'under-water': { cat: 'building' },
  'first-free': { cat: 'building' },
  'ten-free': { cat: 'building' },
  'long-line': { cat: 'building' },
  'all-tier2': { cat: 'building' },
  'demolisher': { cat: 'building', hidden: true, tease: 'Some things must come down' },
  'first-thousand': { cat: 'riders', family: 'carried' },
  'hundred-k': { cat: 'riders', family: 'carried' },
  'million': { cat: 'riders', family: 'carried' },
  'ten-million': { cat: 'riders', family: 'carried' },
  'hundred-million': { cat: 'riders', family: 'carried' },
  'billion-riders': { cat: 'riders', family: 'carried', hidden: true, tease: 'Past every counter' },
  'rush-service': { cat: 'riders' },
  'per-min-1k': { cat: 'riders', family: 'permin' },
  'per-min-3k': { cat: 'riders', family: 'permin' },
  'nobody-left': { cat: 'riders' },
  'transfer-10k': { cat: 'riders', family: 'byten' },
  'transfer-100k': { cat: 'riders', family: 'byten' },
  'hundred-k-kr': { cat: 'money', family: 'held' },
  'millionaire': { cat: 'money', family: 'held' },
  'ten-million-kr': { cat: 'money', family: 'held' },
  'hundred-million-kr': { cat: 'money', family: 'held' },
  'billion': { cat: 'money', family: 'held' },
  'turnover-million': { cat: 'money', family: 'turnover' },
  'turnover-billion': { cat: 'money', family: 'turnover' },
  'retailer': { cat: 'money', family: 'rent' },
  'rent-500': { cat: 'money', family: 'rent' },
  'first-trust': { cat: 'trust' },
  'coverage-half': { cat: 'trust', family: 'coverage' },
  'coverage-80': { cat: 'trust', family: 'coverage' },
  'city-grows': { cat: 'trust', family: 'growth' },
  'city-max': { cat: 'trust', family: 'growth' },
  'own-line': { cat: 'trust' },
  'drivers-hired': { cat: 'service' },
  'full-auto': { cat: 'service' },
  'punctual': { cat: 'service', family: 'headway' },
  'headway-15': { cat: 'service', family: 'headway' },
  'rush-a': { cat: 'service', family: 'rush' },
  'rush-a-10': { cat: 'service', family: 'rush' },
  'rush-a-50': { cat: 'service', family: 'rush', hidden: true, tease: 'Something about the rush' },
  'fixer': { cat: 'service', family: 'repairs' },
  'fixer-10': { cat: 'service', family: 'repairs' },
  'depot-move': { cat: 'service', family: 'depot' },
  'moves-10': { cat: 'service', family: 'depot' },
  'fleet-10': { cat: 'service', family: 'fleet' },
  'fleet-20': { cat: 'service', family: 'fleet' },
  'pattern-first': { cat: 'service' },
  'night-10k': { cat: 'night', family: 'nightriders' },
  'night-100k': { cat: 'night', family: 'nightriders', hidden: true, tease: 'While the city sleeps' },
  'night-owner': { cat: 'night' },
  'night-build': { cat: 'night' },
  'seven-lines': { cat: 'endgame' },
  'maxed-catalog': { cat: 'endgame' },
  'station-cap': { cat: 'endgame' },
  'ladder-full': { cat: 'endgame' },
  'bulk-25': { cat: 'endgame' },
  'diagram-view': { cat: 'endgame' },
  'egg-first': { cat: 'endgame', hidden: true, tease: 'There are odd corners in this city' },
  'egg-all': { cat: 'endgame', hidden: true, tease: 'Every odd corner' },
  'first-decision': { cat: 'trust', family: 'council' },
  'full-mandate': { cat: 'trust', family: 'council' },
  'era-1964': { cat: 'history' },
  'era-1975': { cat: 'history' },
  'plan-all': { cat: 'history' },
  'junction-five': { cat: 'building' },
  'ten-lines': { cat: 'building', family: 'lines' },
  'free-25': { cat: 'building' },
  'water-4': { cat: 'building' },
  'hub-five': { cat: 'building' },
  'transfer-million': { cat: 'riders', family: 'byten' },
  'per-min-5k': { cat: 'riders', family: 'permin' },
  'turnover-biljon': { cat: 'money', family: 'turnover', hidden: true, tease: 'Past every ledger' },
  'rent-2000': { cat: 'money', family: 'rent' },
  'coverage-95': { cat: 'trust', family: 'coverage' },
  'fixer-25': { cat: 'service', family: 'repairs' },
  'moves-50': { cat: 'service', family: 'depot' },
  'headway-10': { cat: 'service', family: 'headway' },
  'fleet-full': { cat: 'service' },
  'night-million': { cat: 'night', family: 'nightriders', hidden: true, tease: 'By starlight' },
  'ach-50': { cat: 'endgame' },
  'ach-90': { cat: 'endgame', hidden: true, tease: 'Nearly all of it' },
  'played-10h': { cat: 'endgame', family: 'time' },
  'played-24h': { cat: 'endgame', family: 'time', hidden: true, tease: 'Stay a while longer' },
  'bulk-100': { cat: 'endgame' },
  'gold-first': { cat: 'money', family: 'gold', hidden: true, tease: 'Something glitters on the line' },
  'gold-25': { cat: 'money', family: 'gold' },
};

// Checked once a second rather than every tick: eighteen predicates over a live
// network is not free, and none of them needs sub-second latency.
export function checkAchievements(g) {
  if (!g.achieved) g.achieved = {};
  for (const a of ACHIEVEMENTS) {
    if (g.achieved[a.id]) continue;
    let ok = false;
    try { ok = !!a.check(g); } catch { ok = false; }
    if (ok) {
      g.achieved[a.id] = true;
      g.events.push({ type: 'achievement', id: a.id, name: a.name });
    }
  }
}

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
  // --- The 0.11 batch, aimed at the measured 1957 desert (probe-arc
  // 2026-08-08: three dead zones totalling ~20 min between t=2118 and 3550,
  // catalog maxed, 2.4M kr idle). All unlock by PLAY, not calendar. ---
  { id: 'escalators', base: 2600, growth: 1.9, max: 3, era: 1952, unlock: { stations: 10 },
    add: { gateRate: 25 } },
  { id: 'hosts',      base: 5200, growth: 2,   max: 2, era: 1957, unlock: { delivered: 60000 },
    mult: { abandon: 0.75 } },
  // 'seasonpass' (fares down, demand up: the first CHOICE upgrade) was CUT
  // here by measurement, not taste: -19.96 kr/s in its own demand-slack
  // regime (value-gate 2026-08-08), because a fare cut bites every boarding
  // instantly while added demand converts at ~0.2 kr/s per percent. A real
  // trade needs an economy where demand converts harder; revisit with
  // mid-game demand growth, like the depot lesson.
  { id: 'adverts',    base: 20000, growth: 2.2, max: 2, era: 1957, unlock: { retail: 25 },
    mult: { retail: 1.5 } },
  // The statistics office: pure information, priced as a treat (owner ask
  // 2026-08-07: stats are a thing incremental players BUY into). Not graded
  // by the value gate, like atc: legibility purchases earn attention, not kr.
  { id: 'stats',      base: 4000, growth: 1,   max: 1, era: 1952, kind: 'stats' },
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
  // Trafikledning (owner ask 2026-08-07): the unlock for player-set service
  // patterns. The pattern itself is free to edit; this buys the RIGHT to run
  // your own timetable. An enabler, not value-graded; the pattern's economy
  // is guarded by a smoke sanity rail instead.
  { id: 'patterns',   base: 8000, growth: 1,   max: 1, era: 1957, kind: 'patterns' },
  // atc is HOLDING control priced as COMFORT, not throughput (report 638 §2:
  // terminus dispatch already regularises the service, so holding rarely fires
  // until event-driven turnaround lands in M5; a legibility purchase must not
  // be graded by the kr/s gate). Cheap on purpose.
  { id: 'atc',        base: 2,    growth: 1,   max: 1, era: 1964, currency: 'pk', kind: 'holding' },
  // The works department (owner ask 2026-08-07): late-game bulk station
  // upgrades, because clicking 59 stations three axes deep is a chore the
  // genre solved a decade ago. An enabler like stats: not value-gate graded.
  { id: 'works',      base: 30000, growth: 1,  max: 1, era: 1964, kind: 'works' },
  // 'diagram' (Linjekartan) left the catalog in v12: the schematic map is a
  // REWARD for beating the first era (owner ruling 2026-08-08). The toggle
  // reads g.era; nothing is bought, and old saves' owned key drops silently.
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
  // wait with a full wallet. Moved 1964 -> 1957 in 0.11 (historically right:
  // the art programme began with T-Centralen in 1957) and deepened to three
  // steep levels, because the 1957 desert needed ~600k of things to want.
  { id: 'artstation', base: 45000, growth: 3,  max: 3, era: 1957,
    add: { demand: 0.15 } },
  // cbtc is frequency AND speed (moving-block signalling lets trains run
  // closer and brake later); pure frequency saturates at reachable demand.
  { id: 'cbtc',       base: 60000, growth: 1,  max: 1, era: 1975, needs: 'atc',
    mult: { dispatchInterval: 0.8, speed: 0.93 } },
  { id: 'nightservice', base: 80000, growth: 1, max: 1, era: 1975,
    mult: { night: 2 } },
  // v12 late pair. Platforms raise the WAITING cap (the queue the platform
  // physically holds), the axis crowding and abandonment bite on; capacity
  // stays the train axis. The depot pays at night: a stabled fleet is not a
  // running fleet, so train upkeep falls while the city sleeps.
  { id: 'platforms',  base: 30000, growth: 2.2, max: 3, era: 1957, unlock: { stations: 12 },
    add: { stationCap: 30 } },
  // Measured +1.20/s flat (sd 0.00, THIN at 0.44% of base): the saving is
  // pure upkeep arithmetic and exactly what the card claims. The depot is
  // also a PLACE (the hall on the map, the stabled bar), so it ships thin
  // by the same ruling as atc's comfort.
  { id: 'depot',      base: 55000, growth: 1, max: 1, era: 1957, unlock: { delivered: 60000 },
    mult: { nightUpkeep: 0.4 } },
  // Regionplanen: permission to build beyond the city's edge, the first
  // upgrade whose product is SPACE. Late, steep, two levels (13 -> 17 -> 21
  // km), so "outside Stockholm, within reason" stays within reason.
  { id: 'region',     base: 120000, growth: 2.5, max: 2, era: 1975,
    add: { buildRadius: 4 } },
];

// --- The council (v12, pass 04 section a): trust buys DECISIONS, not
// upgrades. A decision is permanent, often rules something out, and keeps
// paying an effect long after it is taken. Data-driven like the catalog and
// built to grow over releases: an entry needs an id, a name, a category
// (growth / corridor / service, the confirmed grammar), a tier (Charter /
// Corridor / Mandate, era-gated), a pk cost, prose, and a named modifier the
// economy already understands. Nothing here duplicates a catalog item: art
// and night service are money sinks in the shop; these are the city's
// POLICIES. desc/effectText obey the voice rule (no colons, semicolons,
// dashes). ---
export const COUNCIL_TIERS = [
  { name: 'Charter', era: 1 },
  { name: 'Corridor', era: 2 },
  { name: 'Mandate', era: 3 },
];

export const COUNCIL = [
  { id: 'subsidise-suburbs', name: 'Subsidise the suburbs', cat: 'growth', tier: 0, pk: 4,
    desc: 'Served districts grow half again as fast. Good rail keeps paying you back.',
    effectText: 'Districts grow 50 percent faster while served',
    mult: { growthRate: 1.5 } },
  { id: 'works-permit', name: 'Standing works permit', cat: 'corridor', tier: 0, pk: 3,
    desc: 'The council pre approves your works. Every station you build costs a little less.',
    effectText: 'Station works 8 percent cheaper, for good',
    mult: { buildCost: 0.92 } },
  { id: 'fast-track-water', name: 'Fast track the water crossings', cat: 'corridor', tier: 1, pk: 9,
    desc: 'Crossing under the water costs nearly half as much track to build.',
    effectText: 'Water crossings 45 percent cheaper to build',
    mult: { waterCost: 0.55 } },
  { id: 'rezone-inner', name: 'Rezone the inner suburbs', cat: 'growth', tier: 1, pk: 8, needs: ['subsidise-suburbs'],
    desc: 'A denser city, a higher ceiling, more riders to carry.',
    effectText: 'Districts may grow 20 percent past their old cap',
    mult: { growthCap: 1.2 } },
  // Measured THIN at 1.3 (+0.36/s) and still thin at 2.2 (+0.84/s, 0.37% of
  // base): the transfer lever saturates in the probe's two-line network,
  // exactly as 'through' does (0.64%, also shipping THIN). The mechanism
  // binds hardest in junction-heavy player networks the bot never builds,
  // so 2.2 stands and the live watch item is whether it reads as real.
  { id: 'easy-transfer', name: 'One ticket, every line', cat: 'corridor', tier: 2, pk: 10, needs: ['fast-track-water'],
    desc: 'Changing lines gets easier everywhere. A journey with a change loses fewer riders.',
    effectText: 'Transfer friction cut by more than half',
    mult: { transfer: 2.2 } },
  { id: 'automatic-operation', name: 'Automatic operation', cat: 'service', tier: 2, pk: 12,
    desc: 'Trains run themselves across the whole network, day and night.',
    effectText: 'Every train runs 10 percent faster',
    mult: { speed: 0.9 } },
];

// 'taken' | 'era' (the tier has not arrived) | 'locked' (needs an earlier
// choice) | 'unaffordable' | 'available'. The pass-04 card states, with 'era'
// rendering as locked whose need names the year.
export function councilState(g, d) {
  if (g.council[d.id]) return 'taken';
  if (g.era < COUNCIL_TIERS[d.tier].era) return 'era';
  for (const n of d.needs || []) if (!g.council[n]) return 'locked';
  if (g.pk < d.pk) return 'unaffordable';
  return 'available';
}

export function councilOpen(g) {
  return g.era >= COUNCIL_TIERS[0].era;
}

export function decide(g, id) {
  const d = COUNCIL.find((x) => x.id === id);
  if (!d || councilState(g, d) !== 'available') return false;
  g.pk -= d.pk;
  g.council[d.id] = true;
  g.decisions += 1;
  computeDemand(g); // a demand-shaped decision applies this instant
  g.events.push({ type: 'council', name: d.name, geo: ANCHORS[0].geo });
  return true;
}

export function effectMult(g, key) {
  let m = 1;
  for (const u of CATALOG) {
    const n = g.owned[u.id] || 0;
    if (n && u.mult && u.mult[key] !== undefined) m *= Math.pow(u.mult[key], n);
  }
  // Achievements feed the SAME named modifiers as purchases, so a reward can
  // never mean something the economy does not already understand.
  for (const a of ACHIEVEMENTS) {
    if (g.achieved && g.achieved[a.id] && a.mult && a.mult[key] !== undefined) m *= a.mult[key];
  }
  // Council decisions too: one modifier grammar for every source of power.
  for (const d of COUNCIL) {
    if (g.council && g.council[d.id] && d.mult && d.mult[key] !== undefined) m *= d.mult[key];
  }
  return m;
}

export function effectAdd(g, key) {
  let a = 0;
  for (const u of CATALOG) {
    const n = g.owned[u.id] || 0;
    if (n && u.add && u.add[key] !== undefined) a += u.add[key] * n;
  }
  for (const ac of ACHIEVEMENTS) {
    if (g.achieved && g.achieved[ac.id] && ac.add && ac.add[key] !== undefined) a += ac.add[key];
  }
  for (const d of COUNCIL) {
    if (g.council && g.council[d.id] && d.add && d.add[key] !== undefined) a += d.add[key];
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
    ent: 0, gates: 0, shop: 0,
    mult: 0.15,          // placeholder until computeDemand runs
    hub: tier >= 3,
  };
}

// A second line entry for the SAME station on the ground. Field-by-field copies
// of an entity are how a new field goes missing (report 648's lesson, and it
// happened here with `shop`), so the clone is spread, never enumerated.
function cloneStationEntry(st) {
  return { ...st };
}

// The entry a new line should get for an anchor: a copy of what is already
// built there if the network reaches it, else a fresh one.
function stationForAnchor(g, i) {
  for (const L of g.lines) {
    for (const st of L.stations) if (st.anchor === i) return cloneStationEntry(st);
  }
  return anchorStation(i);
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
    delivered: 0,   // lifetime riders this line carried to their stop
    earned: 0,      // lifetime fares booked at this line's platforms
    skip: stations.map(() => false),  // the express pattern; termini never skip
    expressNext: false,               // full/express alternator, transient
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
    moveQueue: [],   // pending depot transfers: { from, to }, fee already paid
    trainMoves: 0,
    planDone: {},    // corridor id -> once completed (freedom stays earned)
    rush: null,      // open peak window: { phase, delivered0, lost0 }
    rushCount: {},   // grade letter -> times earned
    totalLost: 0,
    incident: null,  // { key, geo, name, until }, transient like surge
    nextIncidentAt: 0,
    incidentCounter: 0,
    incidentsFixed: 0,
    gold: null,      // { line, from, until, taken }, transient like surge
    nextGoldAt: 0,
    goldCounter: 0,
    goldTaken: 0,
    boostUntil: 0,   // doubled fares run until this clock, transient
    // The statistics office reads these; they accrue whether or not it is
    // ever bought, so the ledger is complete on the day it opens.
    hist: { t: [], riders: [], gross: [] },   // sampled every 30 s, capped
    histAt: 0,
    records: { riders: 0, gross: 0 },         // best riders/min and kr/s seen
    grossLife: 0,   // everything ever earned: the front page's "turned over"
    playedS: 0,     // active seconds across sessions: SLUTSTATION prints it
    // Small lifetime counters the achievement set reads. eggsFound, diaViews
    // and patternsSet are written by later 0.10 slices; they exist now so the
    // aims that name them are legal from day one.
    transfers: 0,
    nightDelivered: 0,
    nightBuilds: 0,
    demolished: 0,
    bulkOrders: 0,
    founded: 0,
    eggsFound: 0,
    eggs: {},        // curiosity id -> found (eggsFound stays the count)
    council: {},     // decision id -> taken; permanent, never refunded
    decisions: 0,
    diaViews: 0,
    patternsSet: 0,
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
    achieved: {},
    achieveAt: 0,
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
  // Per-station caps scale via each station's mult; platforms lengthen all.
  return BAL.stationCapBase + effectAdd(g, 'stationCap');
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

// Rent from every station's commerce, counted once per physical station and
// scaled by its demand, so a kiosk at Hökarängen is not a mall at T-Centralen.
export function commerceRate(g) {
  let r = 0;
  const seen = new Set();
  for (const L of g.lines) {
    for (const st of L.stations) {
      const key = physKeyOf(st);
      if (seen.has(key)) continue;
      seen.add(key);
      r += st.shop * BAL.shopKrPerLevel * Math.max(0.5, st.mult);
    }
  }
  return r * effectMult(g, 'retail');
}

// Trust per second right now: the rate the HUD shows, so the player can see
// both what it is and what changes it (coverage, i.e. serving more of the
// region). Owner feedback 2026-08-05: "no idea how I'm gaining it nor how long
// I will take till 5."
export function pkRate(g) {
  // Trust accrues faster for a PROVEN operator: each era multiplies the
  // rate (live feedback x2 plus the probe-arc wall said the later gates were
  // a wait, and the owner's "actively playing waits on money" direction
  // extends to them). The 1950 rate is untouched, so the tuned opening
  // holds still; by 1964 the city signs off at nearly twice the pace.
  return BAL.pkFullRatePerSec * coverage(g) * (1 + BAL.pkEraGrowth * g.era);
}

export function upkeepRate(g) {
  let r = 0;
  // The depot stables the fleet overnight (v12): train upkeep falls through
  // the night phase. Mothballing still beats stabling, they do not stack.
  const nightShare = dayPhase(g) === 3 ? effectMult(g, 'nightUpkeep') : 1;
  for (const t of g.trains) r += BAL.upkeepPerTrainPerSec * (t.mothballed ? BAL.mothballShare : nightShare);
  // Stations cost money to run: tier upkeep plus per upgrade level, counted
  // once per physical station (interchanges are one station on the ground).
  const seen = new Set();
  for (const L of g.lines) {
    for (const st of L.stations) {
      const key = st.anchor !== null ? 'a' + st.anchor : st.geo[0].toFixed(4) + ',' + st.geo[1].toFixed(4);
      if (seen.has(key)) continue;
      seen.add(key);
      r += BAL.stationUpkeep[st.tier] + BAL.upgradeUpkeep * (st.ent + st.gates + st.shop);
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

// --- The plan (owner ruling 2026-08-07, see CORRIDORS in data.js): the
// campaign asks for its lines back. Completion is PRESENT-state (a demolished
// stop re-opens the corridor); planDone records that a corridor was once
// finished, so freedom stays earned and the era panel can say "repair"
// instead of pretending the line was never built. ---

export function corridorProgress(g, c) {
  const used = usedAnchorsAll(g);
  let n = 0;
  for (let k = c.start; k < c.end; k++) if (used.has(k)) n++;
  return n;
}

export function corridorComplete(g, c) {
  return corridorProgress(g, c) === c.end - c.start;
}

export function updatePlanDone(g) {
  for (const c of CORRIDORS) {
    if (g.planDone[c.id] || !corridorComplete(g, c)) continue;
    g.planDone[c.id] = true;
    // The city repays the charter when the promised line is delivered: a
    // one-time trust grant, up to the ceiling, never down (a hand-set or
    // banked balance above the cap is not clamped by being generous to).
    const grant = Math.min(c.trust || 0, Math.max(0, pkCap(g) - g.pk));
    g.pk += grant;
    g.events.push({ type: 'plandone', id: c.id, name: c.name, geo: ANCHORS[c.end - 1].geo, trust: grant });
  }
}

// Free spots unlock when the 1950 line is delivered, and stay unlocked: the
// fence is a tutorial, not a leash, so it never comes back. Owning a free
// spot ALSO proves freedom: a pre-0.9.2 save built its stations legally under
// the old rules and must not be re-fenced mid-game (a new player cannot have
// one, so this grants nothing early).
export function freeBuildUnlocked(g) {
  if (g.planDone['green-south']) return true;
  for (const L of g.lines) for (const s of L.stations) if (s.anchor === null) return true;
  return false;
}

// What stands between this era and the next, corridor-wise. Every corridor
// the story has opened must be complete on the ground RIGHT NOW.
export function planBlockers(g) {
  const out = [];
  for (const c of CORRIDORS) {
    if (c.opensIn > eraYear(g)) continue;
    const built = corridorProgress(g, c);
    if (built === c.end - c.start) continue;
    out.push({ id: c.id, name: c.name, built, total: c.end - c.start, repair: !!g.planDone[c.id] });
  }
  return out;
}

// The next stake along a corridor: the one anchor the reveal is offering.
export function nextStakeOf(g, c) {
  for (let k = c.start; k < c.end; k++) {
    if (!usedAnchorsAll(g).has(k) && anchorRevealed(g, k)) return k;
  }
  return null;
}

// Which LINE a stake continues: the one holding the corridor's railhead
// (live feedback 2026-08-08: "not sure which line is actively building, so
// accidentally built wrong colour station"). Null when the corridor has not
// begun, or the stake is a corridor's first anchor.
export function stakeLine(g, anchorIdx) {
  const c = corridorOf(anchorIdx);
  if (!c || anchorIdx <= c.start) return null;
  const prev = anchorIdx - 1;
  for (let li = 0; li < g.lines.length; li++) {
    if (g.lines[li].stations.some((s) => s.anchor === prev)) return li;
  }
  return null;
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
    // Council policy reaches the city here: subsidy raises the pace, the
    // rezoning raises the ceiling itself.
    const wMax = SOURCES[j].w * BAL.growthCap * effectMult(g, 'growthCap');
    const before = g.srcW[j];
    g.srcW[j] = Math.min(wMax, g.srcW[j] + (wMax - g.srcW[j]) * (dt / BAL.growthTau) * q * effectMult(g, 'growthRate'));
    if (g.srcW[j] - before > 1e-6) moved = true;
  });
  if (moved) computeDemand(g);
}

// The renderer's window into growth (v12, pass 04 section b): one entry per
// district that has actually grown, with p = how far along the road from its
// authored size to its cap it stands. Growth only happens under service, so
// p > 0 is itself the proof the district sits inside a revealed circle.
export function growthView(g) {
  const capMult = BAL.growthCap * effectMult(g, 'growthCap');
  const out = [];
  for (let j = 0; j < SOURCES.length; j++) {
    const s = SOURCES[j];
    const p = (g.srcW[j] / s.w - 1) / (capMult - 1);
    if (p > 0.02) out.push({ geo: s.geo, reach: s.reach, w: s.w, p: Math.min(1, p), j });
  }
  return out;
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

// --- Service patterns (Trafikledning, 0.10): toggle whether the express
// service calls at an interior stop. Termini never skip, the unlock is a
// purchase, and each SET is counted for the aim that teaches the feature. ---
export function canSetSkip(g, li, i) {
  const L = g.lines[li];
  return !!g.owned.patterns && L.stations.length >= 5 &&
    i > 0 && i < L.stations.length - 1;
}

export function setSkip(g, li, i, on) {
  if (!canSetSkip(g, li, i)) return false;
  const L = g.lines[li];
  if (L.skip[i] === !!on) return false;
  L.skip[i] = !!on;
  if (on) g.patternsSet += 1;
  g.events.push({ type: 'pattern', geo: L.stations[i].geo, name: L.stations[i].name, on: !!on });
  return true;
}

// The diagram was opened: the Se kartan aim reads this.
export function viewedDiagram(g) {
  g.diaViews += 1;
}

// A curiosity is found by clicking it; once per save, achievement-counted.
export function foundEgg(g, id) {
  const egg = EGGS.find((e) => e.id === id);
  if (!egg || g.eggs[id]) return null;
  g.eggs[id] = true;
  g.eggsFound = Object.keys(g.eggs).length;
  g.events.push({ type: 'egg', id, name: egg.name, geo: egg.geo || g.lines[0].stations[0].geo });
  return egg;
}

// A postcard: one journey somebody is taking right now, read from the same
// cached routes the passengers use (a display of the sim's own numbers,
// never a second model). n picks deterministically; the UI supplies a name.
export function postcard(g, n) {
  const net = networkCache(g);
  const keys = net.keys;
  if (keys.length < 2) return null;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const oKey = keys[(n + attempt) % keys.length];
    const destMap = net.routes.get(oKey);
    if (!destMap || !destMap.size) continue;
    const dests = [...destMap.entries()];
    const [dKey, r] = dests[(n * 7) % dests.length];
    const o = net.phys.get(oKey).entries[0];
    const d = net.phys.get(dKey).entries[0];
    const from = g.lines[o[0]].stations[o[1]].name;
    const to = g.lines[d[0]].stations[d[1]].name;
    if (from === to) continue;
    return { from, to, km: Math.round(r.km * 10) / 10 };
  }
  return null;
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
  const gateRate = BAL.gateRateBase + effectAdd(g, 'gateRate') + BAL.gateRatePerLevel * st.gates;
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

// The in-game clock (owner ask, 2026-08-07: "a real clock ingame"). The day
// cycle maps to 24 in-game hours anchored so the phases read as a day:
// morning peak 06-12, midday 12-18, evening peak 18-24, night 00-06.
// Display only: nothing in the sim reads the clock face.
export function clockHM(g) {
  const f = (g.clock % BAL.dayLen) / BAL.dayLen;
  const h24 = (6 + f * 24) % 24;
  const h = Math.floor(h24);
  const m = Math.floor((h24 - h) * 60);
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

// --- The rush, graded (owner direction 2026-08-07: rush hour is fun; make
// the day cycle a rhythm the player looks up for). Each peak is scored on
// the share of would-be riders the network actually carried: delivered
// against delivered-plus-abandoned across the peak window. The grade is
// INFORMATION plus a small capped trust nod for a clean rush; a bad grade
// costs nothing (no fail state) and simply says where the ceiling is. ---
export const RUSH_GRADES = [
  { min: 0.97, grade: 'A', pk: 0.3 },
  { min: 0.90, grade: 'B', pk: 0.15 },
  { min: 0.75, grade: 'C', pk: 0 },
  { min: 0.50, grade: 'D', pk: 0 },
  { min: 0,    grade: 'E', pk: 0 },
];
const RUSH_MIN_RIDERS = 25; // a three-station toy earns no medals for an empty rush

function rushTick(g) {
  const ph = dayPhase(g);
  const peak = ph === 0 || ph === 2;
  if (peak && !g.rush) {
    g.rush = { phase: ph, delivered0: g.totalDelivered, lost0: g.totalLost };
    return;
  }
  if (!peak && g.rush) {
    const carried = g.totalDelivered - g.rush.delivered0;
    const lost = g.totalLost - g.rush.lost0;
    const phase = g.rush.phase;
    g.rush = null;
    if (!g.opened || carried + lost < RUSH_MIN_RIDERS) return;
    const share = carried / (carried + lost);
    const r = RUSH_GRADES.find((x) => share >= x.min);
    const granted = Math.min(r.pk, Math.max(0, pkCap(g) - g.pk));
    g.pk += granted;
    g.rushCount[r.grade] = (g.rushCount[r.grade] || 0) + 1;
    const hub = networkCache(g).phys.get(networkCache(g).hubKey);
    g.events.push({
      type: 'rush-grade', phase, grade: r.grade, share,
      carried: Math.round(carried), trust: granted,
      geo: hub ? hub.geo : g.lines[0].stations[0].geo,
    });
  }
}

function dayMult(g) {
  const ph = dayPhase(g);
  if (ph === 3) return Math.min(1, BAL.nightMult * effectMult(g, 'night'));
  return ph === 0 ? BAL.morningMult : ph === 2 ? BAL.eveningMult : 1;
}

function surgedAt(g, li, i) {
  return g.surge && g.surge.line === li && g.surge.idx === i && g.clock < g.surge.until;
}

// --- Incidents: one at a time, like surges, transient (a reload clears the
// current one, same policy as surges). The failure closes the PHYSICAL
// station to boarding, every line entry at once. ---

export function incidentAt(g, li, i) {
  return !!g.incident && g.clock < g.incident.until &&
    physKeyOf(g.lines[li].stations[i]) === g.incident.key;
}

export function incidentFixCost(g) {
  return Math.round(Math.max(BAL.incidentFixMin, BAL.incidentFixGross * grossRate(g)));
}

export function fixIncident(g) {
  if (!g.incident || g.clock >= g.incident.until) return false;
  const cost = incidentFixCost(g);
  if (g.money < cost) return false;
  g.money -= cost;
  g.incidentsFixed = (g.incidentsFixed || 0) + 1;
  g.events.push({ type: 'incident-over', geo: g.incident.geo, name: g.incident.name, resolved: true });
  g.incident = null;
  return true;
}

function goldTick(g) {
  if (g.gold && g.clock >= g.gold.until) g.gold = null;
  if (g.gold || !g.opened) return;
  if (!g.nextGoldAt) {
    g.nextGoldAt = g.clock + BAL.goldEvery / 2; // the first one comes sooner
    return;
  }
  if (g.clock < g.nextGoldAt) return;
  const lines = [];
  for (let li = 0; li < g.lines.length; li++) {
    if (g.lines[li].stations.length >= 3) lines.push(li);
  }
  if (!lines.length) return;
  const li = lines[g.goldCounter % lines.length];
  g.goldCounter += 1;
  g.gold = { line: li, from: g.clock, until: g.clock + BAL.goldDur, taken: false };
  g.nextGoldAt = g.clock + BAL.goldEvery;
  g.events.push({ type: 'gold', geo: g.lines[li].stations[0].geo });
}

// The click. Bonuses alternate so neither becomes the boring default: a
// capped trust nod, then doubled fares for a minute.
export function clickGold(g) {
  if (!g.gold || g.gold.taken || g.clock >= g.gold.until) return null;
  const L = g.lines[g.gold.line];
  const geo = L.stations[Math.floor(L.stations.length / 2)].geo;
  g.gold.taken = true;
  g.goldTaken += 1;
  g.gold = null;
  let bonus;
  if (g.goldTaken % 2 === 1) {
    const grant = Math.min(BAL.goldTrust, Math.max(0, pkCap(g) - g.pk));
    g.pk += grant;
    bonus = { kind: 'trust', amount: grant, geo };
  } else {
    g.boostUntil = g.clock + BAL.goldBoostS;
    bonus = { kind: 'boost', seconds: BAL.goldBoostS, geo };
  }
  g.events.push({ type: 'gold-taken', ...bonus });
  return bonus;
}

function incidentTick(g) {
  if (g.incident && g.clock >= g.incident.until) {
    g.events.push({ type: 'incident-over', geo: g.incident.geo, name: g.incident.name, resolved: false });
    g.incident = null;
  }
  if (g.incident || !g.opened || eraYear(g) < BAL.incidentEra) return;
  if (!g.nextIncidentAt) {
    // The era just allowed failures: the first one keeps its distance.
    g.nextIncidentAt = g.clock + BAL.incidentEvery;
    return;
  }
  if (g.clock < g.nextIncidentAt) return;
  const flat = [];
  for (let li = 0; li < g.lines.length; li++) {
    if (g.lines[li].stations.length < 2) continue;
    for (let i = 0; i < g.lines[li].stations.length; i++) flat.push([li, i]);
  }
  if (!flat.length) return;
  const [li, i] = flat[g.incidentCounter % flat.length];
  g.incidentCounter += 5; // its own co-prime-ish hop, out of step with surges
  const st = g.lines[li].stations[i];
  g.incident = {
    key: physKeyOf(st), geo: st.geo, name: st.name,
    until: g.clock + BAL.incidentDur,
  };
  g.nextIncidentAt = g.clock + BAL.incidentEvery;
  g.events.push({ type: 'incident', geo: st.geo, name: st.name });
}

// Board passengers heading in the train's direction; fares are paid per
// passenger-kilometre at boarding.
function board(g, train, i) {
  const li = train.line;
  const L = g.lines[li];
  if (incidentAt(g, li, i)) return 0; // signals down: doors stay shut here
  const run = train.run;
  const net = networkCache(g);
  const variant = net.variants[phaseVariantIdx(g)];
  const bd = variant.boardDist.get(physKeyOf(L.stations[i]) + '|' + li + '|' + run.dir);
  if (!bd || !bd.sum) return 0;
  // An EXPRESS train may not board anyone bound for a stop it skips: they
  // stay on the platform for the full service behind it. The eligible share
  // scales what this train takes; the rest of the queue simply waits.
  let list = bd.list;
  let eligShare = 1;
  if (run.express) {
    list = bd.list.filter((e) => !L.skip[e.alightI]);
    eligShare = list.reduce((a, e) => a + e.share, 0);
    if (eligShare <= 0) return 0;
  }
  const queue = run.dir === 1 ? L.waitingF : L.waitingB;
  const room = trainCap(g) - run.onboard;
  const take = Math.min(queue[i] * eligShare, room);
  if (take <= 0) return 0;
  queue[i] -= take;
  run.onboard += take;
  let paxKm = 0;
  for (const e of list) {
    const cnt = take * (e.share / eligShare);
    if (e.cont) run.destCont[e.alightI] += cnt;
    else run.dest[e.alightI] += cnt;
    paxKm += cnt * e.legKm;
  }
  let amt = paxKm * BAL.farePerKm * effectMult(g, 'fare');
  if (surgedAt(g, li, i)) amt *= BAL.surgeFareMult;
  if (g.clock < g.boostUntil) amt *= BAL.goldBoostMult; // the golden minute
  g.money += amt;
  L.earned += amt;
  g.grossLife += amt;
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
  // A patterned line alternates full and express departures, so a skipped
  // stop is served by every second train rather than stranded.
  const hasPattern = g.owned.patterns && L.skip.some(Boolean);
  if (hasPattern) L.expressNext = !L.expressNext;
  train.run = {
    phase: 'dwell', dir, from: idx, t: 0, onboard: 0,
    dest: new Array(L.stations.length).fill(0),
    destCont: new Array(L.stations.length).fill(0),
    dur: 0,
    express: hasPattern && L.expressNext,
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
    L.delivered += off;
    if (dayPhase(g) === 3) g.nightDelivered += off;
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
      L.delivered += cont;
      g.deliv60 += cont / 60;
    } else {
      for (const [l2, i2, d2, sh] of options) {
        const q = d2 === 'f' ? g.lines[l2].waitingF : g.lines[l2].waitingB;
        q[i2] += cont * (sh / total);
      }
      g.transfers += cont;
      g.events.push({ type: 'transfer', geo: L.stations[k].geo, n: Math.round(cont) });
    }
  }
  const atTerminus = k === 0 || k === L.stations.length - 1;
  if (atTerminus) {
    g.totalDelivered += Math.max(0, run.onboard); // numerical dust only
    L.delivered += Math.max(0, run.onboard);
    train.at = k;
    train.run = null;
    train.readyAt = g.clock + BAL.turnaroundS;
  } else if (run.express && L.skip[k]) {
    // Express: straight through, doors shut. Nobody aboard is bound for here
    // (boarding filtered them), so the saving is the whole dwell.
    run.phase = 'move';
    run.dur = moveTime(g, kmBetween(L.stations[k].geo, L.stations[k + run.dir].geo));
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
  g.playedS += dt;

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

  // A peak opens or closes: the rush window is scored on the way out.
  rushTick(g);

  // Something breaks, or gets repaired by neglect's deadline.
  incidentTick(g);

  // Something glitters, briefly.
  goldTick(g);

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
        const leaveK = BAL.abandonPerSec * effectMult(g, 'abandon') * crowd * crowd * dt;
        const lost = (L.waitingF[i] + L.waitingB[i]) * leaveK;
        L.waitingF[i] -= L.waitingF[i] * leaveK;
        L.waitingB[i] -= L.waitingB[i] * leaveK;
        L.left60[i] += lost / 60;
        L.leaveAcc[i] += lost;
        g.totalLost += lost;   // lifetime abandonment: the rush grade's denominator
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
    const rent = commerceRate(g) * dt;
    if (rent > 0) {
      g.money += rent;
      g.grossLife += rent;
      g.grossEma += rent / GROSS_TAU;
      g.gross60 += rent / 60;
    }
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

  // Depot orders execute the moment a train parks, BEFORE drivers can send it
  // straight back out from the terminus it just reached.
  processMoveQueue(g);

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

  // Achievements and plan completion, on a one-second cadence.
  if (g.clock - g.achieveAt >= 1) {
    g.achieveAt = g.clock;
    checkAchievements(g);
    updatePlanDone(g);
    // Records: the best minute the network has ever run.
    if (g.opened) {
      g.records.riders = Math.max(g.records.riders, Math.round(g.deliv60 * 60));
      g.records.gross = Math.max(g.records.gross, Math.round(g.gross60 * 10) / 10);
    }
  }

  // The ledger's pulse: one sample every 30 s, a bounded window (~2 h).
  if (g.opened && g.clock - g.histAt >= 30) {
    g.histAt = g.clock;
    g.hist.t.push(Math.round(g.clock));
    g.hist.riders.push(Math.round(g.deliv60 * 60));
    g.hist.gross.push(Math.round(g.gross60));
    if (g.hist.t.length > 240) {
      g.hist.t.shift();
      g.hist.riders.shift();
      g.hist.gross.shift();
    }
  }

  // Trust accrues from coverage, up to the ceiling this era allows.
  g.pk = Math.min(g.pk + pkRate(g) * dt, pkCap(g));

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

// Trust stops accruing at exactly what the next era asks for (owner ask,
// 2026-08-05). Trust is a GATE currency, not a stockpile: without a ceiling the
// idle player banks decades of it, walks back to the tab and buys three hubs
// and an era in one click, and the one resource the game says cannot be bought
// turns out to be the one you get for free by leaving. A cap says "spend me".
// The final era lifts it, like every other constraint there: hub 6 onward costs
// more trust (1.7x each) than any era ever asked for, and the sandbox is where
// that is supposed to be reachable. Nothing clamps a SAVE downward: a player who
// banked trust before this rule keeps it and simply stops earning more.
export function pkCap(g) {
  const e = nextEra(g);
  return e ? e.pk : Infinity;
}

export function canAdvanceEra(g) {
  const e = nextEra(g);
  // The story asks for its lines back (owner ruling 2026-08-07): riders,
  // trust, AND every opened corridor complete on the ground right now.
  return !!e && g.totalDelivered >= e.delivered && g.pk >= e.pk &&
    planBlockers(g).length === 0;
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

// The share that actually applies to THIS placement. A revealed anchor is
// always buildable ground (softlock fix, 2026-08-08: a player parked a free
// spot beside Rådmansgatan and the spacing rule then vetoed the anchor, the
// corridor, and with the plan gate every era after it): a same-line
// neighbour no longer vetoes an anchor build, and a nearby station on
// ANOTHER line only becomes the junction when it IS this anchor, so a stray
// free spot cannot hijack a plan stop.
function shareFor(g, li, geo, anchorIdx) {
  let share = shareTarget(g, li, geo);
  if (anchorIdx !== null && share === 'own') share = null;
  if (anchorIdx !== null && share && share !== 'own' && share.st.anchor !== anchorIdx) share = null;
  return share;
}

// What the drag label needs to say about a junction, read-only.
export function junctionPreview(g, li, geo) {
  const s = shareTarget(g, li, geo);
  return s && s !== 'own' ? { name: s.st.name, tier: s.st.tier } : null;
}

export function extensionCost(g, li, end, geo, anchorIdx = null) {
  const from = endStation(g, li, end);
  const km = kmBetween(from.geo, geo);
  const share = shareFor(g, li, geo, anchorIdx);
  // A junction shares a station that already exists: track is the only build.
  const station = share && share !== 'own' ? 0
    : BAL.stationBase * Math.pow(BAL.stationGrowth, Math.max(0, g.lines[li].stations.length - 2)) *
      effectMult(g, 'buildCost');
  const track = km * BAL.trackPerKm *
    (crossesWater(from.geo, geo) ? BAL.waterMult * effectMult(g, 'waterCost') : 1);
  return Math.round(station + track);
}

// How far from T-Centralen a NEW station may stand. The city has an edge
// (owner ruling 2026-08-08, after a player built toward Gotland): the base
// radius covers every authored anchor with margin, and Regionplanen buys
// permission further out, within reason.
export function buildRadiusNow(g) {
  return BAL.buildRadiusKm + effectAdd(g, 'buildRadius');
}

export function maxStationsNow(g) {
  return BAL.maxStations + effectAdd(g, 'maxStations');
}

// anchorIdx distinguishes a stake from a free spot: null is a free spot, and
// free spots are refused until the 1950 plan is delivered ('plan'). Checked
// after water and spacing, so the label always names the harder refusal.
export function placementProblem(g, li, end, geo, anchorIdx = null) {
  const share = shareFor(g, li, geo, anchorIdx);
  if (share && share !== 'own') {
    // A junction adds no station on the ground and sits on dry land already.
    if (share.st.tier < 2) return 'needsTier2';
  } else {
    if (stationCount(g) >= maxStationsNow(g)) return 'max';
    for (const w of WATER) if (inRing(geo, w.ring)) return 'water';
    if (kmBetween(geo, ANCHORS[0].geo) > buildRadiusNow(g)) return 'far';
    if (share === 'own') return 'tooClose';
    if (anchorIdx === null && !freeBuildUnlocked(g)) return 'plan';
  }
  if (g.money < extensionCost(g, li, end, geo, anchorIdx)) return 'money';
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

// How deep this station's ladders may go, given what it has been built into.
// An upgrade applies to every entry of the physical station, so the level that
// matters is the highest among them.
function levelOf(g, li, i, kind) {
  let lvl = 0;
  for (const [l2, i2] of entriesOfSame(g, li, i)) lvl = Math.max(lvl, g.lines[l2].stations[i2][kind]);
  return lvl;
}

// The STRUCTURAL cap: how deep this station could ever go, given what it has
// been built into. Permanent, so it is the right yardstick for "is this save
// consistent" checks: a level bought in a later era must not read as stranded
// after nothing has changed.
export function upgMaxFor(st) {
  return BAL.upgMaxByTier[st.tier] ?? BAL.upgMax;
}

// The cap that applies RIGHT NOW: tier and era, whichever binds first. Every
// purchase path goes through this; upgMaxFor alone would sell era-locked levels.
export function upgCapFor(g, st) {
  return Math.min(upgMaxFor(st), BAL.upgMaxByEra[g.era] ?? BAL.upgMax);
}

// Which of the two caps is holding this ladder back, so the button can say so
// instead of just being grey. Returns 'era', 'tier' or null (nothing is).
export function upgCapReason(g, st, lvl) {
  if (lvl < upgCapFor(g, st)) return null;
  const eraCap = BAL.upgMaxByEra[g.era] ?? BAL.upgMax;
  if (eraCap <= upgMaxFor(st) && eraCap <= lvl && g.era + 1 < ERAS.length) return 'era';
  return st.tier < 3 ? 'tier' : null;
}

export function upgradeCost(g, li, i, kind) {
  const st = g.lines[li].stations[i];
  if (kind === 'tier') {
    if (st.tier === 1) return { kr: BAL.tier2Cost };
    // Count only hubs the PLAYER built: the ones the city starts with (a born
    // Knutpunkt at T-Centralen) must not inflate the first purchase, which
    // otherwise cost 14 trust against a documented 8.
    let hubs = 0;
    const seen = new Set();
    for (const L of g.lines) {
      for (const s2 of L.stations) {
        const k = physKeyOf(s2);
        if (seen.has(k)) continue;
        seen.add(k);
        if (s2.tier >= 3 && !(s2.anchor !== null && ANCHORS[s2.anchor].hub)) hubs++;
      }
    }
    return { kr: BAL.tier3CostKr, pk: Math.round(BAL.tier3CostPk * Math.pow(BAL.tier3PkGrowth, hubs)) };
  }
  return { kr: Math.round(BAL.upgCostBase[kind] * Math.pow(BAL.upgCostGrowth, st[kind])) };
}

export function canUpgradeStation(g, li, i, kind) {
  const st = g.lines[li].stations[i];
  const cost = upgradeCost(g, li, i, kind);
  if (kind === 'tier') {
    if (st.tier >= 3) return false;
    if (st.tier === 2 && eraYear(g) < BAL.tier3Era) return false;
  } else if (levelOf(g, li, i, kind) >= upgCapFor(g, st)) {
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
  if (placementProblem(g, li, end, geo, anchorIdx)) return false;
  g.money -= extensionCost(g, li, end, geo, anchorIdx);
  const share = shareFor(g, li, geo, anchorIdx); // 'own'/under-tier already refused above
  let station;
  if (share) {
    // The SAME station on the ground: copy identity AND built state, so the
    // new entry starts in lockstep with its physical twin (upgradeStation
    // keeps them there via entriesOfSame; a fresh tier-1 entry here would
    // desync dwell, gates and upkeep from what the player actually built).
    station = cloneStationEntry(share.st);
    g.events.push({ type: 'junction', geo: station.geo, name: station.name });
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
    L.skip.unshift(false);
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
    L.skip.push(false);
    for (const t of g.trains) if (t.line === li && t.run) { t.run.dest.push(0); t.run.destCont.push(0); }
  }
  // A parked train at the extended end is no longer at a terminus, and
  // dispatchFrom only ever looks at the two ends, so it would be stranded
  // FOREVER (live player report, 2026-08-07: "trains get stuck if you connect
  // a new station to the end of the line"). Worse, it still counted as idle,
  // so the bell kept choosing its line and ringing into nothing. Relocate
  // parked trains to the new terminus, exactly as demolish() already does at
  // the other end of the same symmetry.
  for (const t of g.trains) {
    if (t.line !== li || t.run) continue;
    if (end === 'head' && t.at === 1) t.at = 0;
    if (end === 'tail' && t.at === L.stations.length - 2) t.at = L.stations.length - 1;
  }
  L.rev += 1;
  computeDemand(g);
  updatePlanDone(g);  // completing a corridor unlocks THIS instant, not next tick
  if (dayPhase(g) === 3) g.nightBuilds += 1;
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
    L.skip.shift();
    L.skip[0] = false; // the new head is a terminus: termini never skip
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
    L.skip.pop();
    L.skip[L.skip.length - 1] = false; // the new tail is a terminus
    for (const t of g.trains) {
      if (t.line !== li) continue;
      if (t.at >= L.stations.length) t.at = L.stations.length - 1;
      if (t.run) { t.run.dest.pop(); t.run.destCont.pop(); }
    }
  }
  L.rev += 1;
  computeDemand(g);
  g.demolished += 1;
  g.events.push({ type: 'demolish', geo: st.geo, name: st.name });
  return true;
}

// --- Insert a station mid-line (v12, pass 04 section e): splice a stop into
// an existing segment at its midpoint. The tunnel is already dug, so the
// price is the station works alone, on the same ladder an extension pays. ---

export function insertMidGeo(g, li, seg) {
  const L = g.lines[li];
  const a = L.stations[seg].geo, b = L.stations[seg + 1].geo;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export function insertCost(g, li) {
  return Math.round(BAL.stationBase * Math.pow(BAL.stationGrowth, Math.max(0, g.lines[li].stations.length - 2)) *
    effectMult(g, 'buildCost'));
}

// Same refusal grammar as placementProblem, hardest reason first. An inserted
// stop is the player's own idea, never the city's plan, so it waits for the
// same unlock free spots do.
export function insertProblem(g, li, seg) {
  const L = g.lines[li];
  if (!L || !Number.isInteger(seg) || seg < 0 || seg >= L.stations.length - 1) return 'seg';
  const geo = insertMidGeo(g, li, seg);
  if (stationCount(g) >= maxStationsNow(g)) return 'max';
  for (const w of WATER) if (inRing(geo, w.ring)) return 'water';
  // Both neighbours by construction, and anything another line has built.
  for (const L2 of g.lines) {
    for (const st of L2.stations) if (kmBetween(st.geo, geo) < BAL.minSpacingKm) return 'tooClose';
  }
  if (!freeBuildUnlocked(g)) return 'plan';
  if (g.money < insertCost(g, li)) return 'money';
  return null;
}

export function insertStation(g, li, seg) {
  if (insertProblem(g, li, seg)) return false;
  const L = g.lines[li];
  const geo = insertMidGeo(g, li, seg);
  g.money -= insertCost(g, li);
  g.freeSpots += 1;
  const station = makeStation(freeSpotName(g, geo), geo, null, 1);
  const k = seg + 1;
  L.stations.splice(k, 0, station);
  L.waitingF.splice(k, 0, BAL.seedWaiting * station.mult / 2);
  L.waitingB.splice(k, 0, BAL.seedWaiting * station.mult / 2);
  L.left60.splice(k, 0, 0);
  L.leaveAcc.splice(k, 0, 0);
  L.lastPassF.splice(k, 0, -Infinity);
  L.lastPassB.splice(k, 0, -Infinity);
  L.skip.splice(k, 0, false);
  for (const t of g.trains) {
    if (t.line !== li) continue;
    if (!t.run) {
      if (t.at >= k) t.at += 1;
      continue;
    }
    // Index bookkeeping, then geometry sorts itself: a train mid-hop across
    // the spliced segment keeps its `from` and simply arrives at the new
    // stop first, because advancePhase reads from + dir against the arrays.
    if (t.run.from >= k) t.run.from += 1;
    t.run.dest.splice(k, 0, 0);
    t.run.destCont.splice(k, 0, 0);
  }
  L.rev += 1;
  computeDemand(g);
  g.events.push({ type: 'extend', geo: station.geo, name: station.name });
  return true;
}

// --- Catalog purchases ---

export function maxFor(g, item) {
  return item.max + (item.id === 'train' ? effectAdd(g, 'fleetMax') + BAL.fleetPerEra * g.era : 0);
}

export function eraVisible(g, item) {
  return item.era <= eraYear(g);
}

// The unlock grammar (0.11, owner direction: the shop should react to how
// you PLAY, not just to the calendar). An item may carry a declarative
// `unlock` beside its era; both must hold. Every key is a number the HUD
// already shows, so a locked card can name its condition in the player's
// own terms.
function playerHubs(g) {
  const seen = new Set();
  let n = 0;
  for (const L of g.lines) for (const st of L.stations) {
    const k = physKeyOf(st);
    if (seen.has(k)) continue;
    seen.add(k);
    if (st.tier >= 3 && !(st.anchor !== null && ANCHORS[st.anchor].hub)) n++;
  }
  return n;
}

export function unlockMet(g, item) {
  const u = item.unlock;
  if (!u) return true;
  if (u.stations && stationCount(g) < u.stations) return false;
  if (u.delivered && g.totalDelivered < u.delivered) return false;
  if (u.coverage && coverage(g) < u.coverage) return false;
  if (u.corridor && !g.planDone[u.corridor]) return false;
  if (u.hubs && playerHubs(g) < u.hubs) return false;
  if (u.retail && commerceRate(g) < u.retail) return false;
  if (u.achievement && !g.achieved[u.achievement]) return false;
  return true;
}

export function itemVisible(g, item) {
  return eraVisible(g, item) && unlockMet(g, item);
}

export function shopCost(g, id) {
  const item = CATALOG.find((s) => s.id === id);
  return Math.round(item.base * Math.pow(item.growth, g.owned[id]));
}

// Buying a ladder one level at a time is the classic incremental complaint, so
// every levelled purchase supports x10 and MAX. Both are closed forms rather
// than loops, so a MAX on a deep ladder is one calculation:
//   cost of n from level k:  b * r^k * (r^n - 1) / (r - 1)
//   max affordable with c:   floor(log_r( c(r-1) / (b*r^k) + 1 ))
// (r == 1 degenerates to n * b, which `train` and friends rely on.)
function geoSum(base, growth, owned, n) {
  if (n <= 0) return 0;
  if (growth === 1) return Math.round(base * n);
  return Math.round(base * Math.pow(growth, owned) * (Math.pow(growth, n) - 1) / (growth - 1));
}

function geoMax(base, growth, owned, budget) {
  if (budget < base * Math.pow(growth, owned)) return 0;
  if (growth === 1) return Math.floor(budget / base);
  const n = Math.log(budget * (growth - 1) / (base * Math.pow(growth, owned)) + 1) / Math.log(growth);
  return Math.max(0, Math.floor(n + 1e-9));
}

// How many levels of `id` the player could buy right now, capped by the item's
// own max and by the era gate.
export function affordableLevels(g, id, want) {
  const item = CATALOG.find((s) => s.id === id);
  if (!item || !itemVisible(g, item)) return 0;
  if (item.needs && !g.owned[item.needs]) return 0;
  const room = maxFor(g, item) - g.owned[id];
  if (room <= 0) return 0;
  const budget = item.currency === 'pk' ? g.pk : g.money;
  const can = geoMax(item.base, item.growth, g.owned[id], budget);
  return Math.max(0, Math.min(room, can, want || room));
}

export function bulkCost(g, id, n) {
  const item = CATALOG.find((s) => s.id === id);
  return item ? geoSum(item.base, item.growth, g.owned[id], n) : 0;
}

// Buy up to `want` levels in one transaction; returns how many were bought.
export function buyN(g, id, want) {
  const n = affordableLevels(g, id, want);
  if (n <= 0) return 0;
  let bought = 0;
  for (let k = 0; k < n; k++) {
    if (!buy(g, id)) break;   // buy() owns every side effect (charters, fleet)
    bought++;
  }
  return bought;
}

export function stationBulkCost(g, li, i, kind, n) {
  if (kind === 'tier') return upgradeCost(g, li, i, kind).kr;
  return geoSum(BAL.upgCostBase[kind], BAL.upgCostGrowth, levelOf(g, li, i, kind), n);
}

export function stationAffordableLevels(g, li, i, kind, want) {
  if (kind === 'tier') return canUpgradeStation(g, li, i, kind) ? 1 : 0;
  const st = g.lines[li].stations[i];
  const room = upgCapFor(g, st) - levelOf(g, li, i, kind);
  if (room <= 0) return 0;
  const can = geoMax(BAL.upgCostBase[kind], BAL.upgCostGrowth, st[kind], g.money);
  return Math.max(0, Math.min(room, can, want || room));
}

// --- Bulk works (0.10): one order raises an axis one level at EVERY station
// that can take it, cheapest first, buying what the wallet covers. Physical
// stations count once (upgradeStation already syncs the twins). ---

function bulkTargets(g, kind) {
  const seen = new Set();
  const out = [];
  for (let li = 0; li < g.lines.length; li++) {
    g.lines[li].stations.forEach((st, i) => {
      const key = physKeyOf(st);
      if (seen.has(key)) return;
      seen.add(key);
      if (levelOf(g, li, i, kind) >= upgCapFor(g, st)) return;
      out.push({ li, i, kr: upgradeCost(g, li, i, kind).kr });
    });
  }
  return out.sort((a, b) => a.kr - b.kr);
}

// What the order would cost in full, for the button to say.
export function bulkUpgradeCost(g, kind) {
  const t = bulkTargets(g, kind);
  return { n: t.length, kr: t.reduce((a, x) => a + x.kr, 0) };
}

export function bulkUpgrade(g, kind) {
  if (!g.owned.works) return 0;
  let bought = 0;
  for (const t of bulkTargets(g, kind)) {
    if (upgradeStation(g, t.li, t.i, kind)) bought++;
  }
  if (bought > 0) g.bulkOrders += 1;
  return bought;
}

export function upgradeStationN(g, li, i, kind, want) {
  const n = stationAffordableLevels(g, li, i, kind, want);
  let done = 0;
  for (let k = 0; k < n; k++) {
    if (!upgradeStation(g, li, i, kind)) break;
    done++;
  }
  return done;
}

export function canBuy(g, id) {
  const item = CATALOG.find((s) => s.id === id);
  if (!itemVisible(g, item)) return false;
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
    g.lines.push(newLine([stationForAnchor(g, a), stationForAnchor(g, b)], g.lines.length, LINE_IDENTITY[id]));
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
  // Tier gates how deep the ladders may go, so dropping a tier would strand
  // levels above the new cap (measured: ent 8 on a station capped at 5, room
  // -3). Refuse rather than silently destroy what the player paid for; the
  // panel says which ladder is in the way.
  const cap = BAL.upgMaxByTier[st.tier - 1] ?? BAL.upgMax;
  for (const kind of ['ent', 'gates', 'shop']) if (st[kind] > cap) return false;
  return true;
}

// Which ladder blocks a downgrade, for the panel to name.
export function downgradeBlockedBy(g, li, i) {
  const st = g.lines[li].stations[i];
  if (st.tier <= 1) return null;
  const cap = BAL.upgMaxByTier[st.tier - 1] ?? BAL.upgMax;
  for (const kind of ['ent', 'gates', 'shop']) if (st[kind] > cap) return kind;
  return null;
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
  const clone = cloneStationEntry(st);   // spread, never enumerated (report 648)
  const L = newLine([clone], g.lines.length, { color: foundedColor(g) });
  L.waitingF = [0];
  L.waitingB = [0];
  g.lines.push(L);
  computeDemand(g);
  g.founded += 1;
  g.events.push({ type: 'newline', geo: st.geo, name: st.name });
  return true;
}

// --- Player-controlled train allocation (report 634 risk 3), rebuilt for 0.9.
// The old moveTrain failed SILENTLY unless another line happened to hold an
// idle train at the click instant, which under drivers is a coin flip (live
// reports, 2026-08-07: "only plus which do not do nothing", "trains stay in
// your first line forever"). A transfer is now an ORDER: the fee is taken when
// it is placed, and if no train is idle right now the order waits in
// g.moveQueue and executes the moment a train on the source line parks. ---

function execMove(g, t, toLi) {
  t.line = toLi;
  t.at = 0;
  // An order means "bring me a WORKING train": a mothballed one wakes on
  // arrival. Mothball-then-move is the natural way a player frees a train up
  // (live itch report, 2026-08-07: "I mothballed one and press the + next to
  // another line but that did not do anything"), so it has to just work.
  t.mothballed = false;
  t.readyAt = g.clock + BAL.turnaroundS;
  g.trainMoves = (g.trainMoves || 0) + 1;   // the Omdisponering aim reads this
  g.events.push({ type: 'trainmove', geo: g.lines[toLi].stations[0].geo, name: g.lines[toLi].name });
}

// A movable train: active and idle first, else a mothballed one (parked by
// definition). spareTrains counts mothballed trains, so a transfer must be
// able to take them or an order could queue against a line whose only spare
// is mothballed and wait forever.
function idleOn(g, li) {
  return g.trains.find((t) => t.line === li && !t.run && !t.mothballed) ||
    g.trains.find((t) => t.line === li && !t.run && t.mothballed);
}

// Trains a line can still promise away: what it has minus what is already
// queued to leave it.
export function spareTrains(g, li) {
  const own = g.trains.filter((t) => t.line === li).length;
  const promised = g.moveQueue.filter((m) => m.from === li).length;
  return own - promised;
}

// The neediest other line: fewest trains (counting queued arrivals), ties to
// the lowest index so the pick is predictable.
function neediestLine(g, notLi) {
  let best = -1, least = Infinity;
  for (let li = 0; li < g.lines.length; li++) {
    if (li === notLi) continue;
    const n = g.trains.filter((t) => t.line === li).length +
      g.moveQueue.filter((m) => m.to === li).length;
    if (n < least) { least = n; best = li; }
  }
  return best;
}

// The richest other line that can still spare one, by the same accounting.
function richestLine(g, notLi) {
  let best = -1, most = 0;
  for (let li = 0; li < g.lines.length; li++) {
    if (li === notLi) continue;
    const n = spareTrains(g, li);
    if (n > most) { most = n; best = li; }
  }
  return best;
}

// Immediate move, kept for probes and as the fast path: an idle train departs
// for toLi now. Without an explicit source, the pick is the line richest in
// trains AMONG those with one parked right now; a rich line whose whole fleet
// is mid-run cannot deliver immediately, and the queue exists for that case.
export function moveTrain(g, toLi, fromLi) {
  if (g.money < BAL.moveTrainKr) return false;
  let from = fromLi;
  if (from === undefined) {
    from = -1;
    let most = 0;
    for (let li = 0; li < g.lines.length; li++) {
      if (li === toLi || !idleOn(g, li)) continue;
      const n = spareTrains(g, li);
      if (n > most) { most = n; from = li; }
    }
  }
  if (from < 0 || from === toLi) return false;
  const t = idleOn(g, from);
  if (!t) return false;
  g.money -= BAL.moveTrainKr;
  execMove(g, t, toLi);
  return true;
}

// "Bring a train here": immediate if one is idle, an order otherwise.
// Returns 'moved', 'queued', or false (no spare train anywhere, or no fee).
export function requestTrain(g, toLi) {
  if (g.money < BAL.moveTrainKr) return false;
  if (moveTrain(g, toLi)) return 'moved';
  const from = richestLine(g, toLi);
  if (from < 0) return false;
  g.money -= BAL.moveTrainKr;
  g.moveQueue.push({ from, to: toLi });
  return 'queued';
}

// "Send a train away": to the neediest other line, by the same contract.
export function sendTrain(g, fromLi) {
  if (g.money < BAL.moveTrainKr) return false;
  if (spareTrains(g, fromLi) < 1) return false;
  const to = neediestLine(g, fromLi);
  if (to < 0) return false;
  if (moveTrain(g, to, fromLi)) return 'moved';
  g.money -= BAL.moveTrainKr;
  g.moveQueue.push({ from: fromLi, to });
  return 'queued';
}

// Orders queued for a line, for the row to show (either direction).
export function queuedMoves(g, li) {
  let inN = 0, outN = 0;
  for (const m of g.moveQueue) {
    if (m.to === li) inN++;
    if (m.from === li) outN++;
  }
  return { in: inN, out: outN };
}

// Cancel the newest order involving this line; the fee comes back.
export function cancelMove(g, li) {
  for (let i = g.moveQueue.length - 1; i >= 0; i--) {
    if (g.moveQueue[i].to === li || g.moveQueue[i].from === li) {
      g.moveQueue.splice(i, 1);
      g.money += BAL.moveTrainKr;
      return true;
    }
  }
  return false;
}

// Runs each tick, after trains have moved and before drivers dispatch, so a
// train that just parked is caught before it is sent straight back out. An
// order whose source line has lost all its trains refunds itself rather than
// waiting forever on a promise nobody can keep.
function processMoveQueue(g) {
  if (!g.moveQueue.length) return;
  for (let i = 0; i < g.moveQueue.length; i++) {
    const m = g.moveQueue[i];
    if (!g.trains.some((t) => t.line === m.from)) {
      g.moveQueue.splice(i, 1);
      g.money += BAL.moveTrainKr;
      i--;
      continue;
    }
    const t = idleOn(g, m.from);
    if (!t) continue;
    execMove(g, t, m.to);
    g.moveQueue.splice(i, 1);
    i--;
  }
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
  g.grossLife += earned;
  g.totalDelivered += delivered;
  // The night report names the busiest line by its lifetime share: honest,
  // since offline is closed-form and carries no per-line simulation.
  let busiest = null;
  for (const L of g.lines) if (!busiest || L.delivered > busiest.delivered) busiest = L;
  return { seconds: s, earned, delivered, rate: net, busiest: busiest ? busiest.name : null };
}

// --- Save / load (saveVersion is monotonic; forward-only migrations) ---

export const SAVE_KEY = 'tunnelbana_save';

// Shown in the menu and stamped on feedback, so a bug report always says which
// build it came from. Bump on anything a player would notice.
export const VERSION = '0.12.6';

// --- The save container (0.11.3): TBSAVE1:<crc32 hex>:<json>. The checksum
// makes corruption DETECTABLE (a truncated write no longer looks like a
// mystery), pack/unpack are the only writers/readers, and bare JSON keeps
// loading forever: every save ever written stays valid. ---

function crc32(str) {
  let c = ~0;
  for (let i = 0; i < str.length; i++) {
    c ^= str.charCodeAt(i) & 0xff;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ((~c) >>> 0).toString(16).padStart(8, '0');
}

export function pack(g) {
  const json = serialize(g);
  return 'TBSAVE1:' + crc32(json) + ':' + json;
}

// Returns { json, corrupt } for hydrate: a container whose checksum fails is
// CORRUPT (worth telling the player), not merely unreadable. Bare strings
// pass through untouched: the legacy path.
export function unpack(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('TBSAVE1:')) return { json: raw, corrupt: false };
  const cut = raw.indexOf(':', 8);
  if (cut < 0) return { json: null, corrupt: true };
  const sum = raw.slice(8, cut);
  const json = raw.slice(cut + 1);
  if (crc32(json) !== sum) return { json: null, corrupt: true };
  return { json, corrupt: false };
}

export function serialize(g) {
  return JSON.stringify({
    saveVersion: 8,
    savedAt: Date.now(),
    money: Math.round(g.money),
    pk: Math.round(g.pk * 100) / 100,
    era: g.era,
    lines: g.lines.map((L) => ({
      stations: L.stations.map((st) => ({
        name: st.name, geo: st.geo, anchor: st.anchor,
        tier: st.tier, ent: st.ent, gates: st.gates, shop: st.shop,
      })),
      waitingF: L.waitingF.map((w) => Math.round(w)),
      waitingB: L.waitingB.map((w) => Math.round(w)),
      name: L.name,
      color: L.color,
      delivered: Math.round(L.delivered || 0),
      earned: Math.round(L.earned || 0),
      skip: L.skip.map((s) => (s ? 1 : 0)),
    })),
    hist: g.hist,
    records: g.records,
    grossLife: Math.round(g.grossLife),
    playedS: Math.round(g.playedS),
    trains: g.trains.map((t) => ({ line: t.line, mothballed: t.mothballed })),
    moves: g.moveQueue,
    trainMoves: Math.round(g.trainMoves || 0),
    planDone: g.planDone,
    rushCount: g.rushCount,
    totalLost: Math.round(g.totalLost),
    incidentsFixed: Math.round(g.incidentsFixed || 0),
    counters: {
      transfers: Math.round(g.transfers), nightDelivered: Math.round(g.nightDelivered),
      nightBuilds: g.nightBuilds, demolished: g.demolished, bulkOrders: g.bulkOrders,
      founded: g.founded, eggsFound: g.eggsFound, diaViews: g.diaViews, patternsSet: g.patternsSet,
      goldTaken: g.goldTaken,
    },
    eggs: g.eggs,
    council: g.council,
    freeSpots: g.freeSpots,
    owned: g.owned,
    endingSeen: g.endingSeen,
    opened: g.opened,
    achieved: g.achieved,
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
    const cap = BAL.upgMaxByTier[s2.tier] ?? BAL.upgMax;
    s2.ent = Math.min(s2.ent, cap);
    s2.gates = Math.min(s2.gates, cap);
    s2.shop = Math.min(posInt(st.shop, BAL.upgMax), cap);
    return s2;
  });
}

export function hydrate(raw) {
  const g = newGame();
  if (!raw) return g;
  // From here on, raw EXISTED: any fallback to a fresh game is flagged, so
  // the caller can refuse to autosave over the stored bytes (0.11.2, after
  // a live save loss: a transient load failure must never become permanent
  // five seconds later).
  const { json, corrupt } = unpack(raw);
  if (corrupt || json === null) {
    g.hydrateFallback = true;
    g.hydrateCorrupt = true;
    return g;
  }
  let s;
  try { s = JSON.parse(json); } catch { g.hydrateFallback = true; return g; }
  if (!s || typeof s.saveVersion !== 'number') { g.hydrateFallback = true; return g; }
  g.money = Math.max(0, Number(s.money) || 0);
  g.pk = Math.max(0, Number(s.pk) || 0);
  g.era = posInt(s.era, ERAS.length - 1);
  g.endingSeen = !!s.endingSeen;
  // Saves from before opening day existed: any delivery proves the ribbon cut.
  g.opened = !!s.opened || g.totalDelivered > 0;
  g.achieved = {};
  if (s.achieved && typeof s.achieved === 'object') {
    for (const a of ACHIEVEMENTS) if (s.achieved[a.id]) g.achieved[a.id] = true;
  }
  // Migration record: what the save was written by, so the game can explain
  // itself once instead of looking broken. Nothing is destroyed by a migration
  // (levels are clamped to the tier cap, never deleted), and achievements are
  // re-derived on the next tick, so an old save immediately earns what it has
  // already qualified for.
  const from = Number(s.saveVersion) || 0;
  g.migratedFrom = from < 8 ? from : 0;
  if (g.migratedFrom) checkAchievements(g);
  g.gross60 = Math.max(0, Number(s.gross60) || 0);
  g.deliv60 = Math.max(0, Number(s.deliv60) || 0);
  g.trainMoves = posInt(s.trainMoves, 1e6);
  g.totalLost = posInt(s.totalLost, 1e12);
  g.incidentsFixed = posInt(s.incidentsFixed, 1e6);
  g.grossLife = posInt(s.grossLife, 1e15);
  g.playedS = posInt(s.playedS, 1e9);
  for (const k of ['transfers', 'nightDelivered', 'nightBuilds', 'demolished',
                   'bulkOrders', 'founded', 'eggsFound', 'diaViews', 'patternsSet',
                   'goldTaken']) {
    g[k] = posInt(s.counters?.[k], 1e12);
  }
  g.eggs = {};
  if (s.eggs && typeof s.eggs === 'object') {
    for (const e of EGGS) if (s.eggs[e.id]) g.eggs[e.id] = true;
  }
  g.eggsFound = Object.keys(g.eggs).length;
  g.council = {};
  if (s.council && typeof s.council === 'object') {
    for (const d of COUNCIL) if (s.council[d.id]) g.council[d.id] = true;
  }
  g.decisions = Object.keys(g.council).length;
  g.records.riders = posInt(s.records?.riders, 1e9);
  g.records.gross = Math.min(1e12, Math.max(0, Number(s.records?.gross) || 0));
  if (s.hist && ['t', 'riders', 'gross'].every((k) => Array.isArray(s.hist[k]))) {
    const n = Math.min(240, s.hist.t.length, s.hist.riders.length, s.hist.gross.length);
    g.hist = {
      t: s.hist.t.slice(-n).map((v) => posInt(v, 1e9)),
      riders: s.hist.riders.slice(-n).map((v) => posInt(v, 1e9)),
      gross: s.hist.gross.slice(-n).map((v) => posInt(v, 1e12)),
    };
  }
  g.rushCount = {};
  if (s.rushCount && typeof s.rushCount === 'object') {
    for (const r of RUSH_GRADES) {
      if (s.rushCount[r.grade]) g.rushCount[r.grade] = posInt(s.rushCount[r.grade], 1e6);
    }
  }
  if (Array.isArray(s.srcW) && s.srcW.length === g.srcW.length) {
    g.srcW = s.srcW.map((w, j) => {
      const v = Number(w);
      const base = g.srcW[j];
      return Number.isFinite(v) ? Math.min(base * BAL.growthCap, Math.max(base, v)) : base;
    });
  }
  // Clamp to the CURRENT cap: when a cap is lowered (a measurement ruling,
  // e.g. timetable 3 -> 1), saved over-cap levels retire with it. The train
  // cap is era-scaled, so it must be read through maxFor (the era is already
  // hydrated above), or a 1975 fleet would be amputated to the 1950 eight.
  for (const item of CATALOG) g.owned[item.id] = posInt(s.owned?.[item.id], maxFor(g, item));
  g.totalDelivered = Math.max(0, Number(s.totalDelivered) || 0);
  const capMax = stationCap(g);
  const readQueue = (arr, i, st, fallbackHalf) => {
    const saved = Array.isArray(arr) ? Number(arr[i]) : NaN;
    return Number.isFinite(saved)
      ? Math.min(capMax * st.mult, Math.max(0, saved))
      : BAL.seedWaiting * st.mult * fallbackHalf;
  };
  // >= 1, not >= 2: a freshly FOUNDED line holds a single station until its
  // first extension, and a save written in that window is a real save (live
  // report 2026-08-08: one just-founded line retired a 29-station city).
  const okLine = (st) => Array.isArray(st) && st.length >= 1 && st.every(validStation);

  if (s.saveVersion >= 6 && Array.isArray(s.lines) && s.lines.length >= 1 &&
      s.lines.every((L) => L && okLine(L.stations)) &&
      s.lines.reduce((a, L) => a + L.stations.length, 0) <= BAL.maxStations + 16) {
    g.lines = s.lines.map((L, idx) => ({
      stations: sanitizeLine(L.stations),
      // Pre-identity saves fall back to the palette by founding order.
      name: typeof L.name === 'string' ? L.name : (idx === 0 ? 'Gröna linjen' : 'Linje ' + (idx + 1)),
      color: /^#[0-9a-f]{6}$/i.test(L.color || '') ? L.color : lineColor(idx),
      delivered: posInt(L.delivered, 1e12),
      earned: posInt(L.earned, 1e15),
      skip: [],
      expressNext: false,
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
      // The pattern: aligned to stations, termini forced to call.
      L.skip = L.stations.map((_, i) =>
        i > 0 && i < L.stations.length - 1 && !!(Array.isArray(src.skip) && src.skip[i]));
      L.waitingF = L.stations.map((st, i) => readQueue(src.waitingF, i, st, 0.5));
      L.waitingB = L.stations.map((st, i) => readQueue(src.waitingB, i, st, 0.5));
      L.left60 = L.stations.map(() => 0);
      L.leaveAcc = L.stations.map(() => 0);
      L.lastPassF = L.stations.map(() => -Infinity);
      L.lastPassB = L.stations.map(() => -Infinity);
    }
    g.freeSpots = posInt(s.freeSpots, BAL.maxStations);
    g.trains = [];
    // 48: the era-scaled ceiling (28 bought + 1 starting + 3 charter gifts is
    // 32 exactly) plus honest headroom, so the bound is a sanity rail again
    // rather than a cliff one purchase away.
    const tr = Array.isArray(s.trains) ? s.trains.slice(0, 48) : [];
    for (const t of tr) {
      const li = posInt(t?.line, g.lines.length - 1);
      addTrain(g, li).mothballed = !!t?.mothballed;
    }
    if (!g.trains.length) addTrain(g, 0);
    if (!g.trains.some((t) => !t.mothballed)) g.trains[0].mothballed = false;
    // Pending depot orders (0.9): fee already paid, so they must survive a
    // reload. Anything malformed is dropped, not refunded: a forged save is
    // not owed money.
    g.moveQueue = (Array.isArray(s.moves) ? s.moves.slice(0, 16) : [])
      .filter((m) => m && Number.isInteger(m.from) && Number.isInteger(m.to) &&
        m.from !== m.to &&
        m.from >= 0 && m.from < g.lines.length && m.to >= 0 && m.to < g.lines.length)
      .map((m) => ({ from: m.from, to: m.to }));
    // The plan record: what the save says, then what the network proves (a
    // pre-plan save with a finished corridor earned it retroactively). The
    // derivation fires plandone events; a LOAD is not a moment, so drop them.
    g.planDone = {};
    if (s.planDone && typeof s.planDone === 'object') {
      for (const c of CORRIDORS) if (s.planDone[c.id]) g.planDone[c.id] = true;
    }
    updatePlanDone(g);
    g.events.length = 0;
    return g;
  }

  // Pre-v6 saves (the single-line era, some predating the T-Centralen hub)
  // are RETIRED: they start fresh. Pre-1.0 save policy allows this, and a
  // faithfully migrated pre-hub line kept resurrecting a Slussen start that
  // no longer matches the game. Flagged as fallback all the same: the bytes
  // stay on disk until the player themselves starts over.
  const fresh = newGame();
  fresh.hydrateFallback = true;
  return fresh;
}
