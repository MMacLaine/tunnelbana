// Smoke test: simulates 10 minutes of active play (bell whenever a train is idle,
// buy greedily, extensions first) and prints the arc. Run: node _dev/smoke.mjs
import * as sim from '../src/sim.js';
import { STATIONS } from '../src/data.js';

const g = sim.newGame();
const UPGRADES = ['drivers', 'train', 'timetable', 'capacity', 'train', 'timetable', 'capacity'];
let up = 0;

for (let t = 0; t < 600; t += 0.05) {
  sim.tick(g, 0.05);
  if (Math.floor(t * 20) % 12 === 0) sim.dispatch(g);
  // Greedy player: extend when possible, otherwise work down the upgrade list.
  if (sim.canExtend(g)) {
    const name = STATIONS[g.built].name;
    sim.extend(g);
    console.log(`t=${t.toFixed(0).padStart(3)}s  EXTEND ${name.padEnd(16)} money=${Math.round(g.money)}  built=${g.built}/11`);
  } else if (up < UPGRADES.length && sim.canBuy(g, UPGRADES[up])) {
    sim.buy(g, UPGRADES[up]);
    console.log(`t=${t.toFixed(0).padStart(3)}s  bought ${UPGRADES[up].padEnd(10)} money=${Math.round(g.money)}`);
    up++;
  }
  if (Math.round(t * 20) % (60 * 20) === 0) {
    console.log(`t=${t.toFixed(0).padStart(3)}s  money=${String(Math.round(g.money)).padStart(6)}  delivered=${String(Math.round(g.totalDelivered)).padStart(6)}  built=${g.built}  demand=x${sim.cityMult(g).toFixed(2)}  gross=${sim.grossRate(g).toFixed(1)}/s upkeep=${sim.upkeepRate(g).toFixed(1)}/s trains=${g.trains.length}`);
  }
  g.events.length = 0;
}

// Assertions: the arc must move and the line should be near-complete after 10 active minutes.
const ok = g.built >= 9 && g.totalDelivered > 2000 && g.money >= 0 && up >= 3;
console.log(ok ? 'SMOKE OK' : `SMOKE FAILED built=${g.built} delivered=${Math.round(g.totalDelivered)} upgrades=${up}`);
process.exit(ok ? 0 : 1);
