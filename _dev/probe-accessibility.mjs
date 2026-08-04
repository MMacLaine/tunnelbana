// Accessibility probe (report 646 §a): what is the distribution of W (each
// origin's total gravity mass of reachable destinations) across network
// stages? Picks the constants for the accessibility demand term, and then
// re-measures Opus's threaded-vs-direct scenario. Run before AND after the
// sim change: node _dev/probe-accessibility.mjs
import * as sim from '../src/sim.js';
import { ANCHORS, CORRIDORS } from '../src/data.js';

function corridor(id) { return CORRIDORS.find((c) => c.id === id); }

function buildLines(groups, tierUps) {
  const g = sim.newGame();
  g.era = sim.ERAS.length - 1;
  g.money = 1e12;
  g.pk = 1e6;
  groups.forEach((group, li) => {
    if (li > 0) sim.foundLine(g, 0, 0);
    for (const id of group) {
      const c = corridor(id);
      for (let k = c.start; k < c.end; k++) {
        g.money = 1e12;
        sim.extendTo(g, li, 'tail', ANCHORS[k].geo, k);
      }
    }
  });
  for (const [li, i] of tierUps || []) { g.money = 1e12; sim.upgradeStation(g, li, i, 'tier'); }
  return g;
}

// Accessibility A per physical origin (time-budget decayed reachable mass).
function wStats(g, label) {
  const net = sim.networkCache(g);
  const ws = [...(net.acc || new Map()).values()];
  if (!ws.length) { console.log(label + ': acc not exposed yet'); return; }
  ws.sort((a, b) => a - b);
  const q = (p) => ws[Math.floor(p * (ws.length - 1))];
  console.log(`${label}: n=${ws.length} min=${q(0).toFixed(2)} p25=${q(0.25).toFixed(2)} median=${q(0.5).toFixed(2)} p75=${q(0.75).toFixed(2)} max=${q(1).toFixed(2)}`);
}

wStats(sim.newGame(), 'start (3 stations)');
wStats(buildLines([['green-south']]), 'green south');
wStats(buildLines([['green-south'], ['green-west']]), 'full green');
wStats(buildLines([['green-south'], ['green-west'], ['red-south', 'red-orn', 'red-ost'], ['blue-main', 'blue-akalla']]), 'campaign');

// --- Opus's scenario (646 §a): threaded vs chartered-direct, same fleet ---
function income(g, seconds) {
  g.owned.drivers = 1;
  for (let i = 0; i < 3; i++) sim.addTrain(g, 1);
  for (let t = 0; t < 300; t += 0.05) { sim.tick(g, 0.05); g.events.length = 0; }
  const m0 = g.money;
  for (let t = 0; t < seconds; t += 0.05) { sim.tick(g, 0.05); g.events.length = 0; }
  return (g.money - m0) / seconds;
}

// Direct: charter-style seed T-C -> Mariatorget, then walk the corridor.
function direct() {
  const g = buildLines([['green-south']]);
  sim.foundLine(g, 0, 0);
  const c = corridor('red-south');
  for (let k = c.start; k < c.end; k++) { g.money = 1e12; sim.extendTo(g, 1, 'tail', ANCHORS[k].geo, k); }
  return g;
}

// Threaded: the historical route, junctions at Gamla stan and Slussen (T2).
function threaded() {
  const g = buildLines([['green-south']], [[0, 1], [0, 2]]); // T2 Gamla stan + Slussen
  sim.foundLine(g, 0, 0);
  g.money = 1e12;
  sim.extendTo(g, 1, 'tail', ANCHORS[1].geo, 1);  // share Gamla stan
  g.money = 1e12;
  sim.extendTo(g, 1, 'tail', ANCHORS[2].geo, 2);  // share Slussen
  const c = corridor('red-south');
  for (let k = c.start; k < c.end; k++) { g.money = 1e12; sim.extendTo(g, 1, 'tail', ANCHORS[k].geo, k); }
  return g;
}

for (const grown of [false, true]) {
  const prep = (g) => {
    if (grown) { g.srcW = g.srcW.map((w) => w * sim.BAL.growthCap); sim.computeDemand(g); }
    return g;
  };
  const di = income(prep(direct()), 600);
  const th = income(prep(threaded()), 600);
  console.log(`${grown ? 'grown city' : 'quiet city'}:  direct ${di.toFixed(2)} kr/s · threaded ${th.toFixed(2)} kr/s  (${(th / di * 100).toFixed(0)}%)`);
}
