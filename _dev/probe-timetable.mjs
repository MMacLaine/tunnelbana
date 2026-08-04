// Why is timetable NEGATIVE under event-driven turnaround? (M5 slice 2 gate
// failure). Instrument the gate's exact config: departures per end, headway
// spread between consecutive departures, spawn lost to full platforms,
// abandonment, gross fares. Run: node _dev/probe-timetable.mjs
import * as sim from '../src/sim.js';
import { ANCHORS, WEST_FIRST } from '../src/data.js';

function build(owned) {
  const g = sim.newGame();
  g.era = sim.ERAS.length - 1;
  g.money = 1e12;
  g.totalDelivered = 6000;
  while (g.lines[0].stations.length < WEST_FIRST) {
    sim.extendTo(g, 0, 'tail', ANCHORS[g.lines[0].stations.length].geo, g.lines[0].stations.length);
  }
  for (const [id, n] of Object.entries(owned)) {
    g.owned[id] = n;
    if (id === 'train') {
      for (let i = 0; i < n; i++) {
        sim.addTrain(g, 0);
      }
    }
  }
  g.srcW = g.srcW.map((w) => w * sim.BAL.growthCap);
  sim.computeDemand(g);
  return g;
}

function run(owned, surgeAt) {
  const g = build(owned);
  g.nextSurgeAt = surgeAt;
  const stats = {
    departs: [0, 0], gaps: [[], []], lastDep: [-1, -1],
    spawnLost: 0, abandoned: 0, gross: 0, delivered0: 0,
    satTime: 0, // platform-seconds spent at >=95% cap
  };
  const L = g.lines[0];
  const origDispatch = sim.dispatchFrom;
  for (let t = 0; t < 360; t += 0.05) {
    const before = [g.lines[0].lastDepart[0], g.lines[0].lastDepart[1]];
    const m0 = g.money;
    sim.tick(g, 0.05);
    g.events.forEach((e) => { if (e.type === 'abandon') stats.abandoned += e.n; });
    g.events.length = 0;
    if (t >= 120) {
      stats.gross += Math.max(0, g.money - m0);
      for (const end of [0, 1]) {
        if (g.lines[0].lastDepart[end] !== before[end]) {
          stats.departs[end]++;
          if (stats.lastDep[end] >= 0) stats.gaps[end].push(g.lines[0].lastDepart[end] - stats.lastDep[end]);
          stats.lastDep[end] = g.lines[0].lastDepart[end];
        }
      }
      // platform saturation share
      for (let i = 0; i < L.stations.length; i++) {
        const s = L.stations[i];
        const capS = 80 * s.mult;
        if ((L.waitingF[i] + L.waitingB[i]) >= capS * 0.95) stats.satTime += 0.05;
      }
    }
  }
  return { g, stats };
}

for (const owned of [
  { drivers: 1, train: 3 },
  { drivers: 1, train: 3, timetable: 1 },
]) {
  console.log('---', JSON.stringify(owned));
  for (const ph of [5, 35]) {
    const { g, stats } = run(owned, ph);
    const gapStats = stats.gaps.map((gs) => {
      if (!gs.length) return 'n/a';
      const mean = gs.reduce((a, b) => a + b, 0) / gs.length;
      const sd = Math.sqrt(gs.reduce((a, b) => a + (b - mean) ** 2, 0) / gs.length);
      const max = Math.max(...gs);
      return `n=${gs.length} mean=${mean.toFixed(1)} sd=${sd.toFixed(1)} max=${max.toFixed(1)}`;
    });
    console.log(`  ph=${ph} gross/s=${(stats.gross / 240).toFixed(2)} abandoned=${stats.abandoned}` +
      ` satPlat-s=${stats.satTime.toFixed(0)} head[${gapStats[0]}] tail[${gapStats[1]}]`);
  }
}
