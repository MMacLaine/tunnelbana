// Smoke test for the M2 engine: the active-play arc, placement rules, the
// OD/fare model, eras and megaprojects, the second line with interchange
// transfer flow, surges, political capital, the mothball deficit rule, offline
// progress, and save round-trips. Run: node _dev/smoke.mjs
import * as sim from '../src/sim.js';
import { ANCHORS, CORRIDORS, WEST_FIRST } from '../src/data.js';

const err = (msg) => { console.error('ASSERT FAILED: ' + msg); process.exit(1); };

// --- Placement, density, start state ---
{
  const g = sim.newGame();
  if (sim.placementProblem(g, 0, 'head', [59.3260, 18.0700]) !== 'water') err('water placement should be rejected');
  // The owner floated a station in Strömmen (2026-08-04): the bay east of
  // Slussen and the open Riddarfjärden must both refuse.
  if (sim.placementProblem(g, 0, 'head', [59.3240, 18.0880]) !== 'water') err('Strömmen must refuse placement');
  if (sim.placementProblem(g, 0, 'head', [59.3240, 18.0500]) !== 'water') err('Riddarfjärden must refuse placement');
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

// --- One-ahead anchor reveal (owner ruling, 2026-08-04): the map does not
// hand out the answers. Only the next unbuilt anchor per corridor shows and
// snaps; the west corridor shows nothing until its megaproject begins. ---
{
  const g = sim.newGame(); // T-Centralen + Gamla stan + Slussen built
  if (!sim.anchorRevealed(g, 3)) err('the next anchor should be revealed');
  if (sim.anchorRevealed(g, 4)) err('two ahead must stay hidden');
  if (sim.anchorRevealed(g, WEST_FIRST) || sim.anchorRevealed(g, WEST_FIRST + 1)) err('an unbegun corridor must stay dark');
  g.money = 1e9;
  if (sim.extendTo(g, 0, 'tail', ANCHORS[5].geo, 5)) err('extending to a hidden anchor must refuse');
  if (!sim.extendTo(g, 0, 'tail', ANCHORS[3].geo, 3)) err('extending to the revealed anchor should work');
  if (!sim.anchorRevealed(g, 4)) err('building the railhead should stake out the next stop');
}

// --- Opening day (report 643): the game cannot lose before the player acts.
// Upkeep and abandonment hold until the first dispatch; the bell is the
// invigning. ---
{
  const g = sim.newGame();
  const m0 = g.money;
  for (let t = 0; t < 200; t += 0.05) {
    sim.tick(g, 0.05);
    for (const e of g.events) if (e.type === 'abandon') err('no abandonment before opening day');
    g.events.length = 0;
  }
  if (g.opened) err('reading the menus must not open the line');
  if (g.money !== m0) err('no upkeep before opening day, money moved ' + (g.money - m0));
  if (!sim.dispatch(g)) err('first dispatch failed');
  if (!g.opened) err('the first dispatch must cut the ribbon');
  if (!g.events.some((e) => e.type === 'open')) err('opening should announce itself');
  g.events.length = 0;
  const m1 = g.money;
  for (let t = 0; t < 30; t += 0.05) { sim.tick(g, 0.05); g.events.length = 0; }
  if (!(g.money !== m1)) err('after opening, money must move (fares and upkeep are live)');
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
  g.totalDelivered = Math.max(g.totalDelivered, 130000);
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

// Found-a-line from a Knutpunkt, player train allocation, abandonment.
{
  const tci = g.lines[0].stations.findIndex((s) => s.anchor === 0);
  if (tci < 0) err('T-Centralen should be on line 0');
  g.money = 1e6;
  g.pk = 20;
  const linesBefore = g.lines.length;
  if (!sim.foundLine(g, 0, tci)) err('founding a line from a Knutpunkt should work');
  if (g.lines.length !== linesBefore + 1) err('foundLine should add a line');
  const nl = g.lines.length - 1;
  if (g.lines[nl].color === g.lines[0].color) err('new line needs its own colour');
  sim.extendTo(g, nl, 'tail', [59.3400, 18.0800], null); // out into Vasastan-ish
  if (g.lines[nl].stations.length !== 2) err('found line should extend');
  const before = g.trains.filter((t) => t.line === nl).length;
  let moved = false;
  for (let t = 0; t < 30 && !moved; t += 0.05) {
    sim.tick(g, 0.05);
    moved = sim.moveTrain(g, nl); // needs a moment when a train is idle
    g.events.length = 0;
  }
  if (!moved) err('moveTrain should reassign an idle train');
  if (g.trains.filter((t) => t.line === nl).length !== before + 1) err('moveTrain count wrong');

  // Abandonment: cram a platform and watch it leak. The line must be OPEN
  // first (643): an unopened line holds its crowd.
  const a = sim.newGame();
  a.totalDelivered = 60000; // demand-heavy
  sim.dispatch(a);
  for (let t = 0; t < 120; t += 0.05) { sim.tick(a, 0.05); a.events.length = 0; }
  const leftTotal = a.lines[0].left60.reduce((x, y) => x + y, 0);
  if (!(leftTotal > 0)) err('crowded platforms should leak passengers (abandonment)');
}

// Report 638 follow-ups: the growth loop responds to investment (§1), the
// underbuild farm is self-limiting (§3), empty lines earn no transfer flow
// (§2), reassignment costs a fee, downgrade sheds tier.
{
  const grow = (invest) => {
    const w = sim.newGame();
    w.money = 1e9;
    w.nextSurgeAt = Infinity;
    if (invest) {
      for (let i = 0; i < w.lines[0].stations.length; i++) {
        sim.upgradeStation(w, 0, i, 'ent');
        w.money = 1e9;
      }
    }
    sim.buy(w, 'drivers');
    sim.buy(w, 'train');
    for (let t = 0; t < 300; t += 0.05) { sim.tick(w, 0.05); w.events.length = 0; }
    return w.srcW.reduce((a, b) => a + b, 0);
  };
  const bare = grow(false);
  const invested = grow(true);
  if (!(invested > bare)) err('investment must accelerate city growth, bare=' + bare.toFixed(2) + ' invested=' + invested.toFixed(2));

  const m = sim.newGame();
  m.money = 1e6;
  m.pk = 50;
  sim.foundLine(m, 0, 0); // an empty one-station line
  // Network M5: a one-station line has no ride edges, so it attracts NO queue
  // (the old transfer-spawn farm is structurally impossible).
  for (let t = 0; t < 20; t += 0.05) { sim.tick(m, 0.05); m.events.length = 0; }
  if (sim.waitingAt(m, 1, 0) !== 0) err('an empty chartered line must attract no passengers');
  const fee = sim.BAL.moveTrainKr;
  m.money = fee - 1;
  if (sim.moveTrain(m, 1) !== false) err('moveTrain must respect the fee');

  const d2 = sim.newGame();
  d2.money = 1e6;
  sim.upgradeStation(d2, 0, 1, 'tier'); // Gamla stan to tier 2
  if (d2.lines[0].stations[1].tier !== 2) err('tier upgrade failed');
  if (!sim.downgradeTier(d2, 0, 1)) err('downgrade should work');
  if (d2.lines[0].stations[1].tier !== 1) err('downgrade should shed the tier');
  if (sim.canDowngradeTier(d2, 0, 0)) err('a born Knutpunkt must keep its rank');
}

// M5: journeys CROSS LINES. With two running lines sharing T-Centralen,
// transfer events must occur (passengers alighting to continue on the other
// line), which is the thing transferSpawn only pretended to be.
{
  let transfers = 0;
  for (let t = 0; t < 90; t += 0.05) {
    sim.tick(g, 0.05);
    if (Math.floor(t * 20) % 10 === 0) sim.dispatch(g);
    for (const e of g.events) if (e.type === 'transfer') transfers += e.n;
    g.events.length = 0;
  }
  if (!(transfers > 0)) err('cross-line journeys should produce transfers at the hub');
}

// M5 slice 3: BRANCHING as overlapping services on a shared trunk (report 634
// idea 7). Sharing another line's station requires tier 2 (the junction gate),
// bills track only, adds no station on the ground, and the new entry copies
// the twin's built state so per-entry tier/gates never desync.
{
  const b = sim.newGame();
  b.money = 1e9;
  b.pk = 1e6;
  b.era = sim.ERAS.length - 1;
  // Trunk: T-Centralen south to Skärmarbrink (anchors 0..6).
  while (b.lines[0].stations.length < 7) {
    sim.extendTo(b, 0, 'tail', ANCHORS[b.lines[0].stations.length].geo, b.lines[0].stations.length);
  }
  // Charter the branch service at the hub.
  if (!sim.foundLine(b, 0, 0)) err('branch charter at the hub failed');
  // Junction gate: Gamla stan is tier 1, sharing must refuse with the reason.
  if (sim.placementProblem(b, 1, 'tail', ANCHORS[1].geo) !== 'needsTier2') err('sharing a tier-1 station must report needsTier2');
  if (sim.extendTo(b, 1, 'tail', ANCHORS[1].geo, 1)) err('extendTo must respect the junction gate');
  // Build the junctions: tier 2 on the trunk stations the branch will share,
  // gates on one to prove built state copies over.
  sim.upgradeStation(b, 0, 1, 'tier');
  sim.upgradeStation(b, 0, 2, 'tier');
  sim.upgradeStation(b, 0, 1, 'gates');
  if (sim.junctionPreview(b, 1, ANCHORS[1].geo)?.name !== 'Gamla stan') err('junctionPreview should name the share target');
  const physBefore = sim.stationCount(b);
  const cost = sim.extensionCost(b, 1, 'tail', ANCHORS[1].geo);
  // Track only (the T-C to Gamla stan hop crosses water, so 2x per km), no
  // station part: the station-part floor alone is stationBase * growth^4 here.
  const stationPart = sim.BAL.stationBase * Math.pow(sim.BAL.stationGrowth, physBefore - 3);
  if (!(cost < stationPart)) err('sharing must bill track only, got ' + cost);
  const moneyBefore = b.money;
  if (!sim.extendTo(b, 1, 'tail', ANCHORS[1].geo, 1)) err('sharing a tier-2 station should work');
  if (Math.round(moneyBefore - b.money) !== cost) err('share cost mismatch');
  if (sim.stationCount(b) !== physBefore) err('a junction must not add a station on the ground');
  const shared = b.lines[1].stations[1];
  if (shared.tier !== 2 || shared.gates !== 1) err('shared entry must copy the twin built state');
  // A junction stays a junction (642 §5b): tier 2 cannot be shed while shared.
  if (sim.canDowngradeTier(b, 0, 1)) err('downgrading a shared junction below tier 2 must refuse');
  // Share one more trunk stop, then diverge to fresh ground: a real branch.
  if (!sim.extendTo(b, 1, 'tail', ANCHORS[2].geo, 2)) err('second trunk share failed');
  if (!sim.extendTo(b, 1, 'tail', ANCHORS[7].geo, 7)) err('branch divergence failed');
  // Both services run; the shared trunk splits riders between them.
  b.owned.drivers = 1;
  b.trains.push({ line: 0, at: 0, run: null, mothballed: false, readyAt: 0 });
  b.trains.push({ line: 1, at: 0, run: null, mothballed: false, readyAt: 0 });
  const d0 = b.totalDelivered;
  let branchBoarded = false;
  for (let t = 0; t < 90; t += 0.05) {
    sim.tick(b, 0.05);
    b.events.length = 0;
    if (sim.waitingAt(b, 1, 1) > 0) branchBoarded = true;
  }
  if (!(b.totalDelivered > d0)) err('the branched network should deliver');
  if (!branchBoarded) err('the branch service should attract riders on the shared trunk');
  // Save round-trip keeps the junctions shared.
  const back = sim.hydrate(sim.serialize(b));
  if (sim.stationCount(back) !== sim.stationCount(b)) err('save round-trip must keep junctions shared');
  if (back.lines[1].stations[1].tier !== 2) err('save round-trip lost the shared entry tier');
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

// A parked idle train must not block demolition (owner hit it 2026-08-04):
// trains rest at exactly the ends a player may demolish; they relocate.
{
  const p = sim.newGame();
  p.money = 1e6;
  sim.extendTo(p, 0, 'tail', ANCHORS[3].geo, 3);
  const last = p.lines[0].stations.length - 1;
  p.trains[0].at = last; // parked at the doomed tail, idle
  if (!sim.demolish(p, 0, 'tail')) err('idle train at the end must not block demolition');
  if (p.trains[0].at !== p.lines[0].stations.length - 1) err('the parked train should relocate to the surviving end');
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
  // A genuinely losing operation: a shrunken market under a bloated fleet.
  // (x0.2 until the 2026-08-04 fare rescale made that market solvent; the
  // shrink deepens with the fare so the premise stays a loss-maker.)
  d.srcW = d.srcW.map((w) => w * 0.08);
  sim.computeDemand(d);
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
  e.era = sim.ERAS.length - 1; // the sandbox, Hela Stockholm
  // Line 0 takes the southern anchors; every other corridor gets its own
  // chartered line from the hub (the campaign's full sweep, 59 anchors).
  for (let k = sim.newGame().lines[0].stations.length; k < WEST_FIRST; k++) {
    sim.extendTo(e, 0, 'tail', ANCHORS[k].geo, k);
  }
  e.pk = 1e6;
  for (const group of [['green-west'], ['red-south', 'red-orn', 'red-ost'], ['blue-main', 'blue-akalla']]) {
    if (!sim.foundLine(e, 0, 0)) err('ending scenario: founding from T-Centralen failed');
    const li = e.lines.length - 1;
    for (const id of group) {
      const c = CORRIDORS.find((x) => x.id === id);
      for (let k = c.start; k < c.end; k++) {
        e.money = 1e9;
        if (!sim.extendTo(e, li, 'tail', ANCHORS[k].geo, k)) err('ending scenario: extend to ' + ANCHORS[k].name + ' failed');
      }
    }
  }
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
