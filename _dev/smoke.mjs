// Smoke test for the M2 engine: the active-play arc, placement rules, the
// OD/fare model, eras and megaprojects, the second line with interchange
// transfer flow, surges, political capital, the mothball deficit rule, offline
// progress, and save round-trips. Run: node _dev/smoke.mjs
import * as sim from '../src/sim.js';
import { ANCHORS, CORRIDORS, WEST_FIRST, WATER, inRing, kmBetween } from '../src/data.js';

const err = (msg) => { console.error('ASSERT FAILED: ' + msg); process.exit(1); };

// --- ENTITY-LINT (report 648): no hand-built sim entities in the dev harness.
// A literal is a silent fork of a constructor that keeps evolving: when
// event-driven turnaround added readyAt, forked trains could never dispatch
// (`clock >= undefined` is false) while every gate stayed green, and a review
// spent its headline on one working train measured against zero. Rules are
// worth more enforced than remembered, so the harness lints itself.
{
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('.', import.meta.url).pathname;
  const key = new RegExp('(mothballed|readyAt)\\s*:');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs'))) {
    readFileSync(dir + f, 'utf8').split('\n').forEach((line, i) => {
      if (line.includes('ENTITY-LINT')) return;
      if (key.test(line)) err(`${f}:${i + 1} hand-builds a sim entity. Use sim.addTrain(g, line).`);
    });
  }
}

// --- Water bands may never drown an anchor: a ring that contains one walls
// off the campaign (the 2026-08-07 sweep added five bands by hand; this is
// the constraint each of them was checked against, now enforced). ---
{
  for (let i = 0; i < ANCHORS.length; i++) {
    for (const w of WATER) {
      if (inRing(ANCHORS[i].geo, w.ring)) err(ANCHORS[i].name + ' is inside the ' + w.label + ' water band');
    }
  }
}

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
  g.planDone['green-south'] = true; // this block tests demand claims, not the plan fence
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

// --- The plan (owner ruling 2026-08-07): free spots are fenced until the
// 1950 line is delivered; an era demands its corridors, present-state, so a
// demolished stop re-blocks it as a repair; freedom, once earned, stays. ---
{
  const pl = sim.newGame();
  pl.money = 1e9;
  if (sim.placementProblem(pl, 0, 'head', [59.3315, 18.0380]) !== 'plan') err('free spots must be fenced before the plan is done');
  if (sim.extendTo(pl, 0, 'head', [59.3315, 18.0380], null)) err('extendTo must respect the plan fence');
  pl.totalDelivered = 1e6;
  pl.pk = 99;
  if (sim.canAdvanceEra(pl)) err('era must not advance with the corridor incomplete');
  while (pl.lines[0].stations.length < WEST_FIRST) {
    const k = pl.lines[0].stations.length;
    if (!sim.extendTo(pl, 0, 'tail', ANCHORS[k].geo, k)) err('plan build failed at ' + ANCHORS[k].name);
  }
  if (!pl.planDone['green-south']) err('completing the corridor should record planDone');
  if (!pl.events.some((e) => e.type === 'plandone')) err('plan completion should announce itself');
  if (sim.placementProblem(pl, 0, 'head', [59.3315, 18.0380]) !== null) err('free spots should unlock at completion');
  if (!sim.canAdvanceEra(pl)) err('era should advance once the corridor is complete');
  // Demolish a plan stop: the era re-blocks and reads as a repair; freedom stays.
  if (!sim.demolish(pl, 0, 'tail')) err('demolish for the repair test failed');
  if (sim.canAdvanceEra(pl)) err('a demolished plan stop must re-block the era');
  const blockers = sim.planBlockers(pl);
  if (!(blockers.length === 1 && blockers[0].repair && blockers[0].built === 12)) {
    err('the blocker should read as a repair, got ' + JSON.stringify(blockers));
  }
  if (sim.placementProblem(pl, 0, 'head', [59.3315, 18.0380]) !== null) err('freedom must stay earned after demolition');
  const backPl = sim.hydrate(sim.serialize(pl));
  if (!backPl.planDone['green-south']) err('planDone must survive a save');
  // Grandfather clause: a pre-plan save holding a free spot is never re-fenced.
  const old = sim.newGame();
  old.money = 1e9;
  old.lines[0].stations[1].anchor = null; // a legacy free-spot entry
  if (sim.placementProblem(old, 0, 'head', [59.3315, 18.0380]) !== null) err('a save with free spots must keep the ability');
}

// --- The rush is graded (0.10): a full day cycle on a working line must
// score both peaks, count the grades, credit at most the capped trust nod,
// and survive a save. The clock face maps the cycle to readable hours. ---
{
  const r = sim.newGame();
  r.money = 1e6;
  for (let k = 3; k < 8; k++) sim.extendTo(r, 0, 'tail', ANCHORS[k].geo, k);
  sim.buy(r, 'drivers');
  sim.buy(r, 'train');
  let grades = 0;
  for (let t = 0; t < sim.BAL.dayLen * 1.5; t += 0.05) {
    sim.tick(r, 0.05);
    for (const e of r.events) {
      if (e.type === 'rush-grade') {
        grades++;
        if (!'ABCDE'.includes(e.grade)) err('rush grade should be a letter, got ' + e.grade);
        if (!(e.share >= 0 && e.share <= 1)) err('rush share out of range');
        if (!Array.isArray(e.geo)) err('rush grade should carry a place');
      }
    }
    r.events.length = 0;
  }
  if (grades < 2) err('a 1.5-day cycle should grade at least two peaks, got ' + grades);
  const counted = Object.values(r.rushCount).reduce((a, b) => a + b, 0);
  if (counted !== grades) err('rushCount should match the grades emitted');
  if (r.pk > sim.pkCap(r) + 1e-6) err('rush trust must respect the ceiling');
  if (!/^\d\d:\d\d$/.test(sim.clockHM(r))) err('clockHM should read as HH:MM, got ' + sim.clockHM(r));
  const backR = sim.hydrate(sim.serialize(r));
  if (Object.values(backR.rushCount).reduce((a, b) => a + b, 0) !== counted) err('rushCount must survive a save');
}

// --- Incidents (0.10): never before 1957 (owner: no early annoyance), then
// a signal failure closes ONE physical station to boarding, expires on its
// own, or the repair crew clears it for money. Counter survives a save. ---
{
  const ic = sim.newGame();
  ic.money = 1e6;
  for (let k = 3; k < 8; k++) sim.extendTo(ic, 0, 'tail', ANCHORS[k].geo, k);
  sim.buy(ic, 'drivers');
  sim.buy(ic, 'train');
  for (let t = 0; t < 600; t += 0.05) {
    sim.tick(ic, 0.05);
    for (const e of ic.events) if (e.type === 'incident') err('no incidents before 1957');
    ic.events.length = 0;
  }
  ic.era = 2; // 1957
  let struck = null;
  for (let t = 0; t < 600 && !struck; t += 0.05) {
    sim.tick(ic, 0.05);
    for (const e of ic.events) if (e.type === 'incident') struck = e;
    ic.events.length = 0;
  }
  if (!struck) err('1957 should produce an incident within ten minutes');
  if (!ic.incident) err('the incident should be live');
  // The broken station refuses boarding on every line entry.
  let broken = -1;
  ic.lines[0].stations.forEach((st, i) => { if (sim.incidentAt(ic, 0, i)) broken = i; });
  if (broken < 0) err('incidentAt should locate the broken station');
  const cost = sim.incidentFixCost(ic);
  if (!(cost >= sim.BAL.incidentFixMin)) err('repair cost should respect its floor');
  ic.money = cost - 1;
  if (sim.fixIncident(ic)) err('the repair crew must respect the fee');
  ic.money = 1e9;
  if (!sim.fixIncident(ic)) err('the repair crew should clear a live incident');
  if (ic.incident) err('a repaired incident should be gone');
  if (ic.incidentsFixed !== 1) err('repairs should count');
  if (sim.hydrate(sim.serialize(ic)).incidentsFixed !== 1) err('incidentsFixed must survive a save');
}

// --- The ledger (0.10): per-line riders and earnings accrue, the history
// window samples and stays bounded, records only rise, and it all survives
// a save round-trip. ---
{
  const lg = sim.newGame();
  lg.money = 1e6;
  for (let k = 3; k < 8; k++) sim.extendTo(lg, 0, 'tail', ANCHORS[k].geo, k);
  sim.buy(lg, 'drivers');
  sim.buy(lg, 'train');
  for (let t = 0; t < 120; t += 0.05) { sim.tick(lg, 0.05); lg.events.length = 0; }
  if (!(lg.lines[0].delivered > 0)) err('a working line should log delivered riders');
  if (!(lg.lines[0].earned > 0)) err('a working line should log earnings');
  if (!(lg.hist.t.length >= 3)) err('the history window should sample, got ' + lg.hist.t.length);
  if (lg.hist.t.length !== lg.hist.riders.length || lg.hist.t.length !== lg.hist.gross.length) {
    err('history series must stay in step');
  }
  if (!(lg.records.riders > 0)) err('records should notice a working minute');
  const backLg = sim.hydrate(sim.serialize(lg));
  if (Math.abs(backLg.lines[0].delivered - Math.round(lg.lines[0].delivered)) > 1) err('line ledger must survive a save');
  if (backLg.hist.t.length !== lg.hist.t.length) err('history must survive a save');
  if (backLg.records.riders !== lg.records.riders) err('records must survive a save');
  // The office itself is era-gated and single-level.
  if (sim.canBuy(lg, 'stats')) err('the statistics office should wait for 1952');
  lg.era = 1;
  if (!sim.buy(lg, 'stats')) err('the statistics office should sell in 1952');
  if (sim.canBuy(lg, 'stats')) err('one office is enough');
}

// --- Bulk works (0.10): one order, one level everywhere it fits, cheapest
// first, physical stations once, wallet respected, works required. ---
{
  const bw = sim.newGame();
  bw.money = 1e9;
  for (let k = 3; k < 8; k++) sim.extendTo(bw, 0, 'tail', ANCHORS[k].geo, k);
  if (sim.bulkUpgrade(bw, 'ent') !== 0) err('bulk works must need the department');
  bw.era = 3; // 1964: works sells, and the era cap is deep enough to matter
  if (!sim.buy(bw, 'works')) err('works should sell in 1964');
  const quote = sim.bulkUpgradeCost(bw, 'ent');
  if (quote.n !== sim.stationCount(bw)) err('the quote should count every physical station, got ' + quote.n);
  const m0 = bw.money;
  const bought = sim.bulkUpgrade(bw, 'ent');
  if (bought !== quote.n) err('a rich order should fill completely, got ' + bought);
  if (Math.round(m0 - bw.money) !== quote.kr) err('the order should cost its quote');
  bw.money = 300; // poorer than any single level
  if (sim.bulkUpgrade(bw, 'gates') !== 0) err('a broke order should buy nothing');
}

// --- The city's edge and the anchor softlock (0.10.2, both from one live
// report). A free spot parked beside an unbuilt plan anchor must not veto
// it: with the era gate demanding complete corridors, that veto was a
// permanent softlock. And the map has an edge now: 13 km from T-Centralen,
// which every authored anchor clears, extended by Regionplanen. ---
{
  const ed = sim.newGame();
  ed.money = 1e9;
  ed.planDone['green-south'] = true; // free spots allowed for this test
  // Park a free spot ~150 m from Medborgarplatsen's anchor, same line.
  const near = [ANCHORS[3].geo[0] + 0.0013, ANCHORS[3].geo[1]];
  if (sim.extendTo(ed, 0, 'tail', near, null) !== true) err('setup: the nearby free spot should build');
  if (sim.placementProblem(ed, 0, 'tail', ANCHORS[3].geo, 3) !== null) {
    err('a revealed anchor must stay buildable beside a same-line free spot, got ' +
      sim.placementProblem(ed, 0, 'tail', ANCHORS[3].geo, 3));
  }
  if (!sim.extendTo(ed, 0, 'tail', ANCHORS[3].geo, 3)) err('the anchor build should succeed (softlock fix)');
  if (!sim.usedAnchorsAll(ed).has(3)) err('the anchor should be REAL, not a hijacked share');
  // A free spot NEXT to a free spot still refuses: the spacing rule lives.
  if (sim.placementProblem(ed, 0, 'tail', [near[0] + 0.001, near[1]], null) !== 'tooClose') {
    err('free-spot spacing must still refuse');
  }
  // The edge: every anchor inside the base radius, far ground refused,
  // Regionplanen buys distance.
  for (const [i, a] of ANCHORS.entries()) {
    if (kmBetween(a.geo, ANCHORS[0].geo) > sim.BAL.buildRadiusKm) {
      err('anchor ' + i + ' (' + a.name + ') lies outside the base build radius');
    }
  }
  const farGeo = [59.20, 18.10]; // ~14.7 km out, dry ground, no water band
  if (sim.placementProblem(ed, 0, 'tail', farGeo, null) !== 'far') {
    err('ground beyond the radius should refuse as far, got ' + sim.placementProblem(ed, 0, 'tail', farGeo, null));
  }
  ed.era = 4;
  if (!sim.buy(ed, 'region')) err('Regionplanen should sell in 1975');
  if (sim.placementProblem(ed, 0, 'tail', farGeo, null) === 'far') {
    err('one region level should reach ~15 km out');
  }
}

// --- Service patterns (0.10): the unlock gates the verb, termini refuse,
// an express run boards nobody for a skipped stop and passes it without a
// dwell, the alternating full service still calls, the pattern survives a
// save, and a patterned line's throughput does not collapse (sanity rail:
// this is a comfort/speed feature, not a trap). ---
{
  const sp = sim.newGame();
  sp.money = 1e6;
  for (let k = 3; k < 10; k++) sim.extendTo(sp, 0, 'tail', ANCHORS[k].geo, k);
  if (sim.setSkip(sp, 0, 3, true)) err('patterns need the Trafikledning unlock');
  sp.era = 2;
  if (!sim.buy(sp, 'patterns')) err('Trafikledning should sell in 1957');
  if (sim.setSkip(sp, 0, 0, true)) err('a terminus must refuse to be skipped');
  if (!sim.setSkip(sp, 0, 3, true)) err('an interior stop should take a pattern');
  if (!sim.setSkip(sp, 0, 4, true)) err('a second stop should take a pattern');
  if (sp.patternsSet !== 2) err('pattern sets should count, got ' + sp.patternsSet);
  sim.checkAchievements(sp);
  if (!sp.achieved['pattern-first']) err('the first pattern should earn its aim');
  // Alternation: consecutive departures from the same line flip express.
  sim.buy(sp, 'drivers');
  sim.buy(sp, 'train');
  let sawExpress = false, sawFull = false, expressDwelt = false;
  for (let t = 0; t < 240 && !(sawExpress && sawFull); t += 0.05) {
    sim.tick(sp, 0.05);
    sp.events.length = 0;
    for (const tr of sp.trains) {
      if (!tr.run) continue;
      if (tr.run.express) {
        sawExpress = true;
        if (tr.run.phase === 'dwell' && (tr.run.from === 3 || tr.run.from === 4)) expressDwelt = true;
        if ((tr.run.dest[3] || 0) > 0.01 || (tr.run.dest[4] || 0) > 0.01) err('an express boarded riders for a skipped stop');
      } else {
        sawFull = true;
      }
    }
  }
  if (!sawExpress || !sawFull) err('a patterned line should alternate full and express');
  if (expressDwelt) err('an express must not dwell at a skipped stop');
  const backSp = sim.hydrate(sim.serialize(sp));
  if (!backSp.lines[0].skip[3] || !backSp.lines[0].skip[4]) err('the pattern must survive a save');
  if (backSp.lines[0].skip[0]) err('a terminus skip must never load');
  // The sanity rail: same network, with and without the pattern, similar money.
  const runFor = (pattern) => {
    const w = sim.newGame();
    w.money = 1e6;
    for (let k = 3; k < 10; k++) sim.extendTo(w, 0, 'tail', ANCHORS[k].geo, k);
    w.era = 2;
    sim.buy(w, 'patterns');
    sim.buy(w, 'drivers');
    sim.buy(w, 'train');
    if (pattern) { sim.setSkip(w, 0, 3, true); sim.setSkip(w, 0, 6, true); }
    w.money = 1e6;
    for (let t = 0; t < 300; t += 0.05) { sim.tick(w, 0.05); w.events.length = 0; }
    return w.totalDelivered;
  };
  const plain = runFor(false);
  const patterned = runFor(true);
  if (!(patterned > plain * 0.8)) {
    err('a patterned line collapsed: ' + Math.round(patterned) + ' vs ' + Math.round(plain));
  }
}

// --- The diagram (0.10): every anchor must carry dia coordinates (the
// schematic draws from them), the purchase is era-gated, and viewing counts
// toward its achievement. ---
{
  for (const [i, a] of ANCHORS.entries()) {
    if (!Array.isArray(a.dia) || a.dia.length !== 2 || !a.dia.every(Number.isFinite)) {
      err('anchor ' + i + ' (' + a.name + ') has no usable dia coordinates');
    }
  }
  const dg = sim.newGame();
  dg.money = 1e9;
  if (sim.canBuy(dg, 'diagram')) err('Linjekartan should wait for 1964');
  dg.era = 3;
  if (!sim.buy(dg, 'diagram')) err('Linjekartan should sell in 1964');
  sim.viewedDiagram(dg);
  sim.checkAchievements(dg);
  if (!dg.achieved['diagram-view']) err('opening the diagram should earn Se kartan');
}

// --- Curiosities (0.10): found once, counted, achievement-checked, saved. ---
{
  const eg = sim.newGame(); // T-Centralen and Gamla stan exist: norrstrom is live
  const found = sim.foundEgg(eg, 'norrstrom');
  if (!found || !found.fact) err('a reachable curiosity should be findable');
  if (eg.eggsFound !== 1) err('eggsFound should count');
  if (sim.foundEgg(eg, 'norrstrom') !== null) err('a curiosity is found once');
  if (sim.foundEgg(eg, 'not-a-thing') !== null) err('unknown curiosities refuse');
  sim.checkAchievements(eg);
  if (!eg.achieved['egg-first']) err('the first find should earn its achievement');
  const backEg = sim.hydrate(sim.serialize(eg));
  if (!backEg.eggs['norrstrom'] || backEg.eggsFound !== 1) err('curiosities must survive a save');
}

// --- Postcards (0.10): a journey read from the sim's own routes, any n. ---
{
  const pcg = sim.newGame();
  pcg.money = 1e6;
  for (let k = 3; k < 7; k++) sim.extendTo(pcg, 0, 'tail', ANCHORS[k].geo, k);
  for (let n = 0; n < 24; n++) {
    const pc = sim.postcard(pcg, n);
    if (!pc || !pc.from || !pc.to || pc.from === pc.to || !(pc.km > 0)) {
      err('postcard(' + n + ') should be a real journey, got ' + JSON.stringify(pc));
    }
  }
}

// --- The cadence readout (owner ask, 2026-08-04): the number the player
// watches must respond to the purchases that claim to improve it. ---
{
  const c = sim.newGame();
  c.money = 1e9;
  for (let k = 3; k < 8; k++) sim.extendTo(c, 0, 'tail', ANCHORS[k].geo, k);
  const one = sim.lineHeadwayS(c, 0);
  if (!(one > 0 && isFinite(one))) err('a line with a train should report a headway');
  sim.addTrain(c, 0);
  const two = sim.lineHeadwayS(c, 0);
  if (!(two < one)) err('a second train must shorten the headway, got ' + two + ' vs ' + one);
  c.owned.bogies = 1; // faster stock shortens the cycle, so the cadence tightens
  if (!(sim.lineHeadwayS(c, 0) < two)) err('faster stock must shorten the headway');
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
  if (nextIdx < WEST_FIRST && !sim.placementProblem(g, 0, 'tail', ANCHORS[nextIdx].geo, nextIdx)) {
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

// PACING (owner playtest ruling, 2026-08-04: "I can build the entire green
// line in about 5 minutes"). Ten minutes of greedy, near-optimal play must
// make real progress and must NOT finish the 1950 line: building is the spine
// of a 20-hour arc, so it has to cost time, not just clicks.
{
  const n = sim.stationCount(g);
  if (n >= 13) err('ten minutes should not build the whole 1950 line, got ' + n + ' stations');
  if (n < 7) err('ten minutes of good play should still build a real line, got ' + n + ' stations');
}

// Free-spot naming is a naming rule, not an economy one: test it with money
// (and past the plan fence, which is someone else's test).
{
  const n = sim.newGame();
  n.money = 1e9;
  n.planDone['green-south'] = true;
  sim.extendTo(n, 0, 'head', [59.3315, 18.0380], null);
  const free = n.lines[0].stations.find((s) => s.anchor === null);
  if (!free || free.name.indexOf('Kungsholmen') !== 0) err('free spot on Kungsholmen should take the district name, got ' + (free && free.name));
}

// --- Eras and the Västerort megaproject ---
{
  g.totalDelivered = Math.max(g.totalDelivered, 130000);
  g.pk = 10;
  // The plan gate: riders and trust met, corridor incomplete, no advance.
  if (sim.canAdvanceEra(g)) err('era must wait for the 1950 line (plan gate)');
  g.money = 1e9;
  while (g.lines[0].stations.length < WEST_FIRST) {
    const k = g.lines[0].stations.length;
    if (!sim.extendTo(g, 0, 'tail', ANCHORS[k].geo, k)) err('finishing the 1950 line failed at ' + ANCHORS[k].name);
  }
  if (!g.planDone['green-south']) err('completing the corridor should record planDone');
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
  sim.addTrain(b, 0);
  sim.addTrain(b, 1);
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

// 0.9 fleet orders (live reports, 2026-08-07: the transfer verb failed
// silently). A transfer with no idle train QUEUES, fee up front, and executes
// when a train parks; cancelling refunds; and the fleet cap grows with eras.
{
  const q = sim.newGame();
  q.money = 1e6;
  q.pk = 1e6;
  q.era = 1;
  q.totalDelivered = 3e4;
  sim.buy(q, 'westline');   // line 1 with a gift train
  sim.buy(q, 'train');      // joins the emptier line
  sim.dispatchLine(q, 0);   // put every line-0 train in motion...
  sim.dispatchLine(q, 0);
  if (sim.idleTrains(q).some((t) => t.line === 0)) err('setup: line 0 should have no idle train');
  const r = sim.requestTrain(q, 1); // ...so the order must queue, not move
  if (r !== 'queued') err('requestTrain with nothing idle should queue, got ' + r);
  if (q.moveQueue.length !== 1) err('the order should sit in the queue');
  const before = q.trains.filter((t) => t.line === 1).length;
  let done = false;
  for (let t = 0; t < 180 && !done; t += 0.05) {
    sim.tick(q, 0.05);
    for (const e of q.events) if (e.type === 'trainmove') done = true;
    q.events.length = 0;
  }
  if (!done) err('a queued order should execute when a train parks');
  if (q.trains.filter((t) => t.line === 1).length !== before + 1) err('queued move count wrong');
  if (q.moveQueue.length) err('an executed order should leave the queue');
  // Cancel refunds the fee.
  const m0 = q.money;
  if (sim.sendTrain(q, 1) !== 'queued' && q.moveQueue.length === 0) {
    // an idle train made it immediate; force a queued order to test cancel
    q.moveQueue.push({ from: 1, to: 0 });
    q.money -= sim.BAL.moveTrainKr;
  }
  const m1 = q.money;
  if (!sim.cancelMove(q, 1)) err('cancelMove should find the order');
  if (Math.round(q.money - m1) !== sim.BAL.moveTrainKr) err('cancel must refund the fee');
  void m0;
  // Mothball-then-move is the natural way a player frees a train up (live
  // itch report, 2026-08-07): a transfer takes a mothballed train and wakes
  // it on arrival, rather than queueing forever past it.
  {
    const mb = sim.newGame();
    mb.money = 1e6;
    mb.pk = 1e6;
    mb.era = 1;
    mb.totalDelivered = 3e4;
    sim.buy(mb, 'westline');
    if (!sim.mothball(mb)) err('setup: mothball should work with two active trains');
    const rm = sim.requestTrain(mb, 1);
    if (rm !== 'moved') err('a mothballed train should transfer immediately, got ' + rm);
    if (sim.mothballedTrains(mb).length !== 0) err('a transferred train must wake on arrival');
    if (mb.trains.filter((t) => t.line === 1).length !== 2) err('the mothballed train should be on line 1 now');
  }

  // The fleet ceiling is era-scaled and a big fleet survives hydration.
  const trainItem = sim.CATALOG.find((i) => i.id === 'train');
  const capOf = (era) => { const w = sim.newGame(); w.era = era; return sim.maxFor(w, trainItem); };
  if (capOf(0) !== 8) err('1950 fleet cap should stay 8');
  if (!(capOf(4) > capOf(1) && capOf(1) > capOf(0))) err('the fleet cap must grow with the era');
  q.era = 4;
  q.owned.train = 18;
  const backQ = sim.hydrate(sim.serialize(q));
  if (backQ.owned.train !== 18) err('an era-scaled fleet must survive hydration, got ' + backQ.owned.train);
}

// Extending a line must not strand parked trains (live report, 2026-08-07:
// "trains get stuck if you connect a new station to the end of the line").
// Trains rest at exactly the ends a player extends; they relocate to the new
// terminus, at either end, and stay dispatchable.
{
  const x = sim.newGame();
  x.money = 1e6;
  sim.extendTo(x, 0, 'tail', ANCHORS[3].geo, 3);
  x.trains[0].at = x.lines[0].stations.length - 1; // parked at the tail, idle
  sim.extendTo(x, 0, 'tail', ANCHORS[4].geo, 4);
  if (x.trains[0].at !== x.lines[0].stations.length - 1) err('tail extension stranded a parked train');
  if (!sim.dispatchLine(x, 0)) err('parked train must dispatch after a tail extension');
  const y = sim.newGame();
  y.money = 1e6;
  y.trains[0].at = 0; // parked at the head, idle
  sim.extendTo(y, 0, 'head', [59.3315, 18.0380], null);
  if (y.trains[0].at !== 0) err('head extension stranded a parked train');
  if (!sim.dispatchLine(y, 0)) err('parked train must dispatch after a head extension');
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
  e.money = 1e12;
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
        e.money = 1e12;
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

// --- The two ceilings added 2026-08-05, both owner asks. Each is a single
// Math.min in a hot path, which is exactly the kind of thing a later balance
// pass deletes by accident. ---
{
  const c = sim.newGame();
  // Station depth is capped by era as well as by tier: 1950 sells exactly one
  // level of each axis, on a Hållplats and on a Knutpunkt alike.
  if (sim.upgCapFor(c, { tier: 1 }) !== 1) err('era 1950 must cap station ladders at 1');
  if (sim.upgCapFor(c, { tier: 3 }) !== 1) err('the era cap must bind above the tier cap');
  c.money = 1e9;
  if (sim.upgradeStationN(c, 0, 0, 'ent', 8) !== 1) err('1950 must sell exactly one entrance level');
  if (sim.canUpgradeStation(c, 0, 0, 'ent')) err('a second 1950 entrance level must be refused');
  if (sim.upgCapReason(c, c.lines[0].stations[0], 1) !== 'era') err('the refusal must name the era');
  // ...and the cap lifts with the era, never retroactively taking a level away.
  c.totalDelivered = 1e6; c.pk = 99;
  c.money = 1e9;
  while (c.lines[0].stations.length < WEST_FIRST) {
    sim.extendTo(c, 0, 'tail', ANCHORS[c.lines[0].stations.length].geo, c.lines[0].stations.length);
  }
  if (!sim.advanceEra(c)) err('era advance failed in the ceiling check');
  if (sim.upgCapFor(c, { tier: 1 }) !== 3) err('1952 should allow three levels on a Hållplats');
  if (c.lines[0].stations[0].ent !== 1) err('a bought level must survive the era change');

  // Trust accrues to the next era's requirement and stops there.
  const p = sim.newGame();
  if (sim.pkCap(p) !== 5) err('trust ceiling in 1950 should be the 1952 requirement');
  p.money = 1e9;
  for (let k = p.lines[0].stations.length; k < 12; k++) sim.extendTo(p, 0, 'tail', ANCHORS[k].geo, k);
  for (let t = 0; t < 4000; t += 1) { sim.tick(p, 1); p.events.length = 0; }
  if (p.pk > sim.pkCap(p) + 1e-6) err('trust exceeded its ceiling: ' + p.pk);
  if (!(p.pk > 4.9)) err('trust should reach the ceiling given coverage and time, got ' + p.pk);
  // The sandbox lifts it, or hub 6 (114 trust) could never be bought at all.
  const last = sim.hydrate(sim.serialize(p));
  last.era = sim.ERAS.length - 1;
  if (Number.isFinite(sim.pkCap(last))) err('the final era must lift the trust ceiling');
}

const ok = sim.stationCount(g) >= 7 && g.totalDelivered > 2000 && g.money >= 0 && up >= 5;
console.log(ok ? 'SMOKE OK' : `SMOKE FAILED stations=${sim.stationCount(g)} delivered=${Math.round(g.totalDelivered)} upgrades=${up}`);
process.exit(ok ? 0 : 1);
