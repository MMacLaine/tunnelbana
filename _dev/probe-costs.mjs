// Cost-relevance probe: plays the same competent-player policy as probe-arc,
// but reports what things COST relative to what the player EARNS at the moment
// they are bought, and what upkeep amounts to as the game grows. The owner's
// 2026-08-09 question is the reason it exists: "upkeep is about 20 kr/s
// against 2-3k kr/s income mid game, which seems pointless". This measures
// that instead of arguing it.
//
// Reports:
//   - per era: income rate, upkeep rate, and upkeep's share of income
//   - when the upkeep share crosses under 20 / 10 / 5 / 1 percent
//   - every purchase priced in SECONDS OF NET INCOME at purchase time, and
//     the distribution (a purchase under ~10 s of income is felt as free)
//   - whether the deficit-mothball failure mechanic ever fires
//
//   node _dev/probe-costs.mjs             # two hours of play
//   node _dev/probe-costs.mjs 3600        # shorter horizon
//   node _dev/probe-costs.mjs 7200 rich   # money/trust granted up front: walks
//                                         # the structure with prices removed,
//                                         # income comparisons meaningless
import * as sim from '../src/sim.js';
import { ANCHORS, CORRIDORS } from '../src/data.js';

const HORIZON = Number(process.argv[2]) || 7200;
const RICH = process.argv.includes('rich');
const DT = 0.05;

// Tuning affordance: BAL="fleetUpkeepLog=10,fleetUpkeepFree=4" overrides
// balance constants for this run only, so candidate curves can be compared
// without editing the sim between runs.
if (process.env.BAL) {
  for (const kv of process.env.BAL.split(',')) {
    const [k, v] = kv.split('=');
    if (!(k in sim.BAL)) throw new Error('unknown BAL key ' + k);
    sim.BAL[k] = Number(v);
    console.log('BAL override: ' + k + ' = ' + v);
  }
}

const g = sim.newGame();
if (RICH) { g.money = 10_000_000; g.pk = 999; }

function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

// --- The probe-arc 'build' policy, verbatim in spirit: extend while there is
// corridor left, otherwise the cheapest thing on any surface. A floor on
// competence, not an optimum. Kept in lockstep with probe-arc by hand; if the
// two drift the pacing and cost reports stop describing the same player. ---
function nextExtension() {
  const used = sim.usedAnchorsAll(g);
  for (const c of CORRIDORS) {
    for (let k = c.start; k < c.end; k++) {
      if (used.has(k) || !sim.anchorRevealed(g, k)) continue;
      let best = null;
      for (let li = 0; li < g.lines.length; li++) {
        for (const end of ['head', 'tail']) {
          if (sim.placementProblem(g, li, end, ANCHORS[k].geo, k)) continue;
          const cost = sim.extensionCost(g, li, end, ANCHORS[k].geo, k);
          if (!best || cost < best.cost) best = { li, end, cost, k };
        }
      }
      if (best) return best;
    }
  }
  return null;
}

function cheapestStationUpgrade() {
  let best = null;
  for (let li = 0; li < g.lines.length; li++) {
    for (let i = 0; i < g.lines[li].stations.length; i++) {
      for (const kind of ['ent', 'gates', 'shop', 'tier']) {
        if (!sim.canUpgradeStation(g, li, i, kind)) continue;
        const c = sim.upgradeCost(g, li, i, kind);
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
    const rank = item.currency === 'pk' ? -1 : cost;
    if (!best || rank < best.rank) best = { id: item.id, cost, rank, currency: item.currency };
  }
  return best;
}

// --- Sampling state ---
const SAMPLE = 5;                 // seconds between economy samples
let lastLife = 0, lastSampleT = 0;
const samples = [];               // {t, era, income, upkeep}
const purchases = [];             // {t, kind, what, cost, income, secs}
const shareCross = {};            // pct -> t when upkeep share first fell under
let mothballs = 0, prevMothballed = 0;

for (let t = 0; t < HORIZON; t += DT) {
  sim.tick(g, DT);
  g.events.length = 0;

  if (!g.owned.drivers && Math.round(t * 20) % 20 === 0) sim.dispatch(g);

  const buy = cheapestBuy();
  const ext = nextExtension();
  const st = cheapestStationUpgrade();
  const options = [];
  if (buy) options.push({ rank: buy.rank, run: () => sim.buy(g, buy.id) && { kind: 'buy', what: buy.id, cost: buy.currency === 'pk' ? 0 : buy.cost } });
  if (st && g.money >= st.cost) options.push({ rank: st.cost, run: () => sim.upgradeStation(g, st.li, st.i, st.kind) && { kind: 'st', what: st.kind + ' @ ' + st.name, cost: st.cost } });
  if (ext && g.money >= ext.cost) options.push({ isExt: true, rank: ext.cost, run: () => sim.extendTo(g, ext.li, ext.end, ANCHORS[ext.k].geo, ext.k) && { kind: 'build', what: ANCHORS[ext.k].name, cost: ext.cost } });
  options.sort((a, b) => a.rank - b.rank);
  if (ext && g.money >= ext.cost) options.sort((a, b) => (a.isExt ? -1 : 0) - (b.isExt ? -1 : 0));
  let did = null;
  for (const o of options) { did = o.run(); if (did) break; }

  // Price the purchase in seconds of the income rate prevailing when it was
  // made (trailing sample window; kr purchases only, trust has no clock).
  if (did && did.cost > 0) {
    const income = samples.length ? samples[samples.length - 1].income : 0;
    purchases.push({ t, ...did, income, secs: income > 0 ? did.cost / income : Infinity });
  }

  if (sim.canAdvanceEra(g)) sim.advanceEra(g);

  if (t - lastSampleT >= SAMPLE) {
    const income = (g.grossLife - lastLife) / (t - lastSampleT);
    lastLife = g.grossLife; lastSampleT = t;
    const upkeep = g.opened ? sim.upkeepRate(g) : 0;
    samples.push({ t, era: sim.eraYear(g), income, upkeep });
    if (income > 0) {
      const share = upkeep / income;
      for (const pct of [20, 10, 5, 1]) {
        if (shareCross[pct] === undefined && share < pct / 100) shareCross[pct] = t;
      }
    }
    const mb = g.trains.filter((tr) => tr.mothballed).length;
    if (mb > prevMothballed) mothballs += mb - prevMothballed;
    prevMothballed = mb;
  }
}

// --- Per-era economy table ---
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
console.log('--- economy by era over ' + HORIZON + 's' + (RICH ? ' (RICH: prices pre-paid, shares not meaningful)' : '') + ' ---');
console.log('era    t range        income kr/s   upkeep kr/s   upkeep share');
const byEra = new Map();
for (const s of samples) {
  if (!byEra.has(s.era)) byEra.set(s.era, []);
  byEra.get(s.era).push(s);
}
for (const [era, ss] of byEra) {
  const inc = med(ss.map((s) => s.income));
  const up = med(ss.map((s) => s.upkeep));
  console.log(String(era).padEnd(5) + '  ' +
    (Math.round(ss[0].t) + '-' + Math.round(ss[ss.length - 1].t) + 's').padEnd 	(13) + '  ' +
    fmt(inc).padStart(11) + '  ' + fmt(up).padStart(12) + '  ' +
    (inc > 0 ? (100 * up / inc).toFixed(1) + '%' : '—').padStart(12));
}
console.log('upkeep share first under: ' + [20, 10, 5, 1]
  .map((p) => p + '% @ ' + (shareCross[p] !== undefined ? Math.round(shareCross[p]) + 's' : 'never')).join(' · '));
console.log('deficit mothballs fired: ' + mothballs);

// --- Purchase weight: seconds of income per purchase, by game phase ---
console.log('\n--- purchase weight (kr cost / income rate at purchase) ---');
const phases = [[0, 900, 'first 15 min'], [900, 2700, '15-45 min'], [2700, HORIZON, 'after 45 min']];
for (const [a, b, label] of phases) {
  const ps = purchases.filter((p) => p.t >= a && p.t < b && isFinite(p.secs));
  if (!ps.length) { console.log(label.padEnd(14) + ' no kr purchases'); continue; }
  const secs = ps.map((p) => p.secs).sort((x, y) => x - y);
  const q = (f) => secs[Math.min(secs.length - 1, Math.floor(f * secs.length))];
  const under10 = secs.filter((s) => s < 10).length;
  console.log(label.padEnd(14) + ' ' + String(ps.length).padStart(3) + ' buys · median ' +
    q(0.5).toFixed(0) + 's of income · p90 ' + q(0.9).toFixed(0) + 's · felt-free (<10s): ' +
    (100 * under10 / secs.length).toFixed(0) + '%');
}
// The ten heaviest and ten lightest purchases after the opening, named.
const late = purchases.filter((p) => p.t > 900 && isFinite(p.secs));
late.sort((a, b) => a.secs - b.secs);
const line = (p) => '  ' + String(Math.round(p.t)).padStart(5) + 's  ' + p.what.padEnd(24) +
  fmt(p.cost).padStart(10) + ' kr at ' + fmt(p.income).padStart(6) + ' kr/s = ' + p.secs.toFixed(1) + 's';
console.log('lightest purchases after 15 min:');
for (const p of late.slice(0, 8)) console.log(line(p));
console.log('heaviest purchases after 15 min:');
for (const p of late.slice(-8)) console.log(line(p));

console.log('\nend state: era ' + sim.eraYear(g) + ' · ' + fmt(g.money) + ' kr · ' +
  sim.stationCount(g) + ' stations · ' + g.trains.length + ' trains · income ' +
  fmt(samples.length ? samples[samples.length - 1].income : 0) + ' kr/s · upkeep ' +
  fmt(sim.upkeepRate(g)) + ' kr/s');
