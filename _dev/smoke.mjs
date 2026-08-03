// Smoke test: simulates 10 minutes of active play (bell whenever a train is idle,
// buy greedily) and prints the arc. Run: node _dev/smoke.mjs
import * as sim from '../src/sim.js';

const g = sim.newGame();
const ORDER = ['train', 'drivers', 'timetable', 'capacity', 'train', 'timetable', 'capacity', 'train', 'timetable'];
let next = 0;

for (let t = 0; t < 600; t += 0.05) {
  sim.tick(g, 0.05);
  // Active player: ring the bell the moment a train is home (small human delay).
  if (Math.floor(t * 20) % 12 === 0) sim.dispatch(g);
  if (next < ORDER.length && sim.canBuy(g, ORDER[next])) {
    sim.buy(g, ORDER[next]);
    console.log(`t=${t.toFixed(0).padStart(3)}s  bought ${ORDER[next].padEnd(10)} money=${Math.round(g.money)}  delivered=${Math.round(g.totalDelivered)}`);
    next++;
  }
  if (Math.round(t * 20) % (60 * 20) === 0) {
    console.log(`t=${t.toFixed(0).padStart(3)}s  money=${String(Math.round(g.money)).padStart(6)}  delivered=${String(Math.round(g.totalDelivered)).padStart(6)}  demand=x${sim.cityMult(g).toFixed(2)}  gross=${sim.grossRate(g).toFixed(1)}/s upkeep=${sim.upkeepRate(g).toFixed(1)}/s trains=${g.trains.length}`);
  }
  g.events.length = 0;
}

// Assertions: the arc must move.
const ok = g.totalDelivered > 2000 && g.money > 0 && next >= 5;
console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
process.exit(ok ? 0 : 1);
