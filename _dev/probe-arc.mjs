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
      for (const kind of ['ent', 'gates', 'tier']) {
        if (!sim.canUpgradeStation(g, li, i, kind)) continue;
        const c = sim.upgradeCost(g, li, i, kind);
        if (c.pk) continue; // trust-priced tier 3 is a commitment, not a filler buy
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
  if (ext && g.money >= ext.cost) options.push({ rank: ext.cost, run: () => sim.extendTo(g, ext.li, ext.end, ANCHORS[ext.k].geo, ext.k) && { kind: 'build', what: ANCHORS[ext.k].name, cost: ext.cost } });
  options.sort((a, b) => a.rank - b.rank);
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

console.log('\n--- pacing over ' + HORIZON + 's ---');
console.log('actions: ' + buys.length + ' (' + (buys.length / (HORIZON / 60)).toFixed(1) + ' per minute)');
console.log('gap between actions: median ' + q(0.5).toFixed(0) + 's · p75 ' + q(0.75).toFixed(0) +
  's · p90 ' + q(0.9).toFixed(0) + 's · worst ' + q(1).toFixed(0) + 's');
console.log('first action at ' + (buys[0] ? Math.round(buys[0].t) + 's' : 'never'));
console.log('bell rings before automation: ' + bellRings);
console.log('DEAD ZONES (>120s with nothing to do): ' +
  (dead.length ? dead.map(([a, b]) => Math.round(a) + '-' + Math.round(b) + 's').join(', ') : 'none'));
const eras = log.filter((e) => e.kind === 'ERA');
console.log('eras reached: ' + (eras.length ? eras.map((e) => e.what + ' @ ' + Math.round(e.t) + 's').join(' · ') : 'none'));
console.log('end state: ' + fmt(g.money) + ' kr · ' + fmt(g.totalDelivered) + ' riders · ' +
  sim.stationCount(g) + ' stations · ' + g.trains.length + ' trains · ' +
  fmt(sim.grossRate(g)) + ' kr/s gross');
