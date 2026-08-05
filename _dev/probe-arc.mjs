// Arc probe: plays a whole game with a declared policy and reports the PACING,
// not the outcome. The value gate answers "is this purchase worth buying"; this
// answers "does the next thing to do arrive often enough to keep a
// second-monitor player looking back at the tab".
//
// Reports: every purchase with its timestamp, the inter-purchase gap
// distribution, dead zones (nothing affordable for a long stretch), era
// timings, and where the money came from.
//
//   node _dev/probe-arc.mjs             # 20 minutes of play, purchase by purchase
//   node _dev/probe-arc.mjs 3600        # a full hour
//   node _dev/probe-arc.mjs 900 quiet   # summary only
import * as sim from '../src/sim.js';
import { ANCHORS, CORRIDORS } from '../src/data.js';

const HORIZON = Number(process.argv[2]) || 1200;
const QUIET = process.argv.includes('quiet');
// Which player this models. 'cheapest' buys the cheapest thing available, which
// is a floor but not a person: it deepens a three-station stub for twenty
// minutes because a 500 kr level always beats a 1 850 kr extension. 'build'
// prefers extending while a corridor is unfinished, which is what the design
// asks of a player (the map is the progress bar) and what any payback-aware
// player does, since a new station adds demand the upgrades then multiply.
const POLICY = process.argv.includes('cheapest') ? 'cheapest' : 'build';
const DT = 0.05;

const g = sim.newGame();
const log = [];        // {t, kind, what, cost, money}
let lastBuyAt = 0;
const gaps = [];       // seconds between consecutive purchases
let bellRings = 0;

function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

// The policy of a competent, engaged player: keep the trains moving, extend the
// line when the city has somewhere to go, and otherwise buy the cheapest thing
// that is not maxed. Deliberately NOT optimal: it is a floor on how well the
// pacing must hold up, since a real player is slower and less tidy.
function nextExtension() {
  for (const c of CORRIDORS) {
    for (let k = c.start; k < c.end; k++) {
      if (!sim.anchorRevealed(g, k)) continue;
      // Which line should take it: the one whose end is nearest.
      let best = null;
      for (let li = 0; li < g.lines.length; li++) {
        for (const end of ['head', 'tail']) {
          if (sim.placementProblem(g, li, end, ANCHORS[k].geo)) continue;
          const cost = sim.extensionCost(g, li, end, ANCHORS[k].geo);
          if (!best || cost < best.cost) best = { li, end, cost, k };
        }
      }
      if (best) return best;
    }
  }
  return null;
}

// Per-station upgrades are most of the purchase surface (three axes x every
// station), so a pacing probe that ignored them would measure a much thinner
// game than the one that exists. Caught on the first run.
function cheapestStationUpgrade() {
  let best = null;
  for (let li = 0; li < g.lines.length; li++) {
    for (let i = 0; i < g.lines[li].stations.length; i++) {
      for (const kind of ['ent', 'gates', 'shop', 'tier']) {
        if (!sim.canUpgradeStation(g, li, i, kind)) continue;
        const c = sim.upgradeCost(g, li, i, kind);
        // Trust-priced tier 3 IS worth buying: it unlocks the deep ladders. The
        // first version skipped it and then reported dead zones while sitting on
        // 89 trust and 81 available upgrades, measuring its own policy.
        if (c.pk && g.pk < c.pk) continue;
        if (!best || c.kr < best.cost) best = { li, i, kind, cost: c.kr, name: g.lines[li].stations[i].name };
      }
    }
  }
  return best;
}

function cheapestBuy() {
  let best = null;
  for (const item of sim.CATALOG) {
    if (!sim.canBuy(g, item.id)) continue;
    const cost = sim.shopCost(g, item.id);
    // pk and kr are not comparable; treat a trust project as always worth it
    // (they are one-shot unlocks and the player wants them).
    const rank = item.currency === 'pk' ? -1 : cost;
    if (!best || rank < best.rank) best = { id: item.id, cost, rank, currency: item.currency };
  }
  return best;
}

for (let t = 0; t < HORIZON; t += DT) {
  sim.tick(g, DT);
  g.events.length = 0;

  // Manual dispatch until drivers are hired: an engaged player rings the bell.
  if (!g.owned.drivers && Math.round(t * 20) % 20 === 0) {
    if (sim.dispatch(g)) bellRings++;
  }

  // One action per tick at most, so the log reads like a session.
  const buy = cheapestBuy();
  const ext = nextExtension();
  const st = cheapestStationUpgrade();
  // Cheapest-first across all three surfaces: catalog, station, track.
  const options = [];
  if (buy) options.push({ rank: buy.rank, run: () => sim.buy(g, buy.id) && { kind: 'buy', what: buy.id, cost: buy.cost } });
  if (st && g.money >= st.cost) options.push({ rank: st.cost, run: () => sim.upgradeStation(g, st.li, st.i, st.kind) && { kind: 'st', what: st.kind + ' @ ' + st.name, cost: st.cost } });
  if (ext && g.money >= ext.cost) options.push({ isExt: true, rank: ext.cost, run: () => sim.extendTo(g, ext.li, ext.end, ANCHORS[ext.k].geo, ext.k) && { kind: 'build', what: ANCHORS[ext.k].name, cost: ext.cost } });
  options.sort((a, b) => a.rank - b.rank);
  if (POLICY === 'build' && ext && g.money >= ext.cost) {
    // Building comes first while there is corridor left to build.
    options.sort((a, b) => (a.isExt ? -1 : 0) - (b.isExt ? -1 : 0));
  }
  let did = null;
  for (const o of options) { did = o.run(); if (did) break; }
  if (did) {
    gaps.push(t - lastBuyAt);
    lastBuyAt = t;
    log.push({ t, ...did, money: g.money });
  }

  // Advance the era as soon as it is allowed: the story should not wait.
  if (sim.canAdvanceEra(g) && sim.advanceEra(g)) {
    log.push({ t, kind: 'ERA', what: String(sim.eraYear(g)), cost: 0, money: g.money });
  }
}

if (!QUIET) {
  console.log('t(s)   action  what                     cost        money');
  for (const e of log) {
    console.log(
      String(Math.round(e.t)).padStart(5) + '  ' +
      e.kind.padEnd(6) + '  ' + String(e.what).padEnd(22) + '  ' +
      fmt(e.cost).padStart(9) + '  ' + fmt(e.money).padStart(10)
    );
  }
}

// --- Pacing: the numbers the plan is tuned against ---
const buys = log.filter((e) => e.kind !== 'ERA');
gaps.sort((a, b) => a - b);
const q = (p) => gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))] : NaN;
const dead = [];
let prev = 0;
for (const e of buys) {
  if (e.t - prev > 120) dead.push([prev, e.t]);
  prev = e.t;
}
if (HORIZON - prev > 120) dead.push([prev, HORIZON]);

console.log('\n--- pacing over ' + HORIZON + 's, policy: ' + POLICY + ' ---');
console.log('actions: ' + buys.length + ' (' + (buys.length / (HORIZON / 60)).toFixed(1) + ' per minute)');
console.log('gap between actions: median ' + q(0.5).toFixed(0) + 's · p75 ' + q(0.75).toFixed(0) +
  's · p90 ' + q(0.9).toFixed(0) + 's · worst ' + q(1).toFixed(0) + 's');
console.log('first action at ' + (buys[0] ? Math.round(buys[0].t) + 's' : 'never'));
console.log('bell rings before automation: ' + bellRings);
console.log('DEAD ZONES (>120s with nothing to do): ' +
  (dead.length ? dead.map(([a, b]) => Math.round(a) + '-' + Math.round(b) + 's').join(', ') : 'none'));
const eras = log.filter((e) => e.kind === 'ERA');
console.log('eras reached: ' + (eras.length ? eras.map((e) => e.what + ' @ ' + Math.round(e.t) + 's').join(' · ') : 'none'));
// --- The wall: when there is nothing to do, WHY is there nothing to do? A
// dead zone is a symptom; this names the cause instead of inviting a guess.
console.log('\n--- the wall at t=' + HORIZON + 's ---');
console.log('pk: ' + g.pk.toFixed(1) + ' · coverage ' + (sim.coverage(g) * 100).toFixed(1) + '%');
const nx = sim.nextEra(g);
if (nx) {
  console.log('next era ' + nx.year + ' needs ' + fmt(nx.delivered) + ' riders (have ' +
    fmt(g.totalDelivered) + ') and ' + nx.pk + ' pk (have ' + g.pk.toFixed(1) + ') -> blocked by ' +
    (g.totalDelivered < nx.delivered ? 'RIDERS' : g.pk < nx.pk ? 'TRUST' : 'nothing, advance now'));
}
const reasons = {};
for (const item of sim.CATALOG) {
  const owned = g.owned[item.id];
  if (owned >= sim.maxFor(g, item)) { reasons.maxed = (reasons.maxed || 0) + 1; continue; }
  if (!sim.eraVisible(g, item)) { reasons['era-locked'] = (reasons['era-locked'] || 0) + 1; continue; }
  if (item.needs && !g.owned[item.needs]) { reasons.prereq = (reasons.prereq || 0) + 1; continue; }
  const cost = sim.shopCost(g, item.id);
  const have = item.currency === 'pk' ? g.pk : g.money;
  reasons[have >= cost ? 'AFFORDABLE NOW' : (item.currency === 'pk' ? 'needs trust' : 'needs money')] =
    (reasons[have >= cost ? 'AFFORDABLE NOW' : (item.currency === 'pk' ? 'needs trust' : 'needs money')] || 0) + 1;
}
console.log('catalog (' + sim.CATALOG.length + ' items): ' +
  Object.entries(reasons).map(([k, v]) => v + ' ' + k).join(' · '));
let ladderRoom = 0, tierRoom = 0, tierBlocked = 0;
for (let li = 0; li < g.lines.length; li++) {
  for (let i = 0; i < g.lines[li].stations.length; i++) {
    const st = g.lines[li].stations[i];
    // Room the player can buy INTO right now (tier and era both bind), which is
    // the number that answers "is there anything left to spend on". The
    // structural cap below is a different question and keeps upgMaxFor.
    for (const k of ['ent', 'gates', 'shop']) ladderRoom += sim.upgCapFor(g, st) - st[k];
    if (st.tier < 3) {
      if (sim.canUpgradeStation(g, li, i, 'tier')) tierRoom++;
      else tierBlocked++;
    }
  }
}
const stranded = [];
for (let li = 0; li < g.lines.length; li++) {
  for (let i = 0; i < g.lines[li].stations.length; i++) {
    const st = g.lines[li].stations[i];
    for (const k of ['ent', 'gates', 'shop']) {
      if (st[k] > sim.upgMaxFor(st)) stranded.push(st.name + ' ' + k + ' ' + st[k] + '>' + sim.upgMaxFor(st));
    }
  }
}
if (stranded.length) console.log('STRANDED above cap: ' + stranded.slice(0, 6).join(', '));
console.log('station ladders: ' + ladderRoom + ' levels of room · tier upgrades ' + tierRoom +
  ' available, ' + tierBlocked + ' blocked (era/trust/money)');
const nextAnchor = (() => {
  for (const c of CORRIDORS) for (let k = c.start; k < c.end; k++) if (sim.anchorRevealed(g, k) && !sim.usedAnchorsAll(g).has(k)) return ANCHORS[k].name;
  return null;
})();
console.log('next buildable anchor: ' + (nextAnchor || 'none revealed (corridor complete or era-locked)'));

console.log('end state: ' + fmt(g.money) + ' kr · ' + fmt(g.totalDelivered) + ' riders · ' +
  sim.stationCount(g) + ' stations · ' + g.trains.length + ' trains · ' +
  fmt(sim.grossRate(g)) + ' kr/s gross');
