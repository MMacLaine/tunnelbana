// Smoke test: simulates 10 minutes of active play (bell whenever a train is idle,
// buy greedily, follow the 1950 anchors, one free spot) and prints the arc.
// Run: node _dev/smoke.mjs
import * as sim from '../src/sim.js';
import { ANCHORS } from '../src/data.js';

const g = sim.newGame();
const UPGRADES = ['drivers', 'train', 'timetable', 'capacity', 'train', 'timetable', 'capacity'];
let up = 0;
let freeSpotPlaced = false;

// Placement rules must hold before any building.
const err = (msg) => { console.error('ASSERT FAILED: ' + msg); process.exit(1); };
if (sim.placementProblem(g, 'head', [59.3260, 18.0700]) !== 'water') err('water placement should be rejected');
if (sim.placementProblem(g, 'tail', [59.3079, 18.0764]) !== 'tooClose') err('min spacing should be enforced');

// Density field: a spot in a district beats the floor, nowhere does not.
if (!(sim.freeSpotValue([59.2980, 18.0490]) > 0.35)) err('Årsta should beat the density floor');
if (sim.freeSpotValue([59.2000, 18.4000]) !== 0.35) err('nowhere should sit at the density floor');

for (let t = 0; t < 600; t += 0.05) {
  sim.tick(g, 0.05);
  if (Math.floor(t * 20) % 12 === 0) sim.dispatch(g);

  // Greedy player: extend along the anchors when possible, else upgrades.
  const nextIdx = g.line.length - (freeSpotPlaced ? 1 : 0); // anchors used so far
  if (nextIdx < ANCHORS.length && !sim.placementProblem(g, 'tail', ANCHORS[nextIdx].geo)) {
    const cost = sim.extensionCost(g, 'tail', ANCHORS[nextIdx].geo);
    sim.extendTo(g, 'tail', ANCHORS[nextIdx].geo, nextIdx);
    console.log(`t=${t.toFixed(0).padStart(3)}s  EXTEND ${ANCHORS[nextIdx].name.padEnd(16)} cost=${cost}  money=${Math.round(g.money)}  stations=${g.line.length}`);
  } else if (t > 200 && !freeSpotPlaced && !sim.placementProblem(g, 'head', [59.3180, 18.0560])) {
    // One free spot west of Slussen (land, no anchor): head extension.
    const cost = sim.extensionCost(g, 'head', [59.3180, 18.0560]);
    sim.extendTo(g, 'head', [59.3180, 18.0560], null);
    freeSpotPlaced = true;
    console.log(`t=${t.toFixed(0).padStart(3)}s  FREE SPOT (head) cost=${cost}  money=${Math.round(g.money)}  stations=${g.line.length}`);
  } else if (up < UPGRADES.length && sim.canBuy(g, UPGRADES[up])) {
    sim.buy(g, UPGRADES[up]);
    console.log(`t=${t.toFixed(0).padStart(3)}s  bought ${UPGRADES[up].padEnd(10)} money=${Math.round(g.money)}`);
    up++;
  }
  if (Math.round(t * 20) % (60 * 20) === 0) {
    console.log(`t=${t.toFixed(0).padStart(3)}s  money=${String(Math.round(g.money)).padStart(6)}  delivered=${String(Math.round(g.totalDelivered)).padStart(6)}  stations=${g.line.length}  demand=x${sim.cityMult(g).toFixed(2)}  gross=${sim.grossRate(g).toFixed(1)}/s upkeep=${sim.upkeepRate(g).toFixed(1)}/s trains=${g.trains.length}`);
  }
  g.events.length = 0;
}

// The free spot should have taken a district name from the density field.
const free = g.line.find((s) => s.anchor === null);
if (!free || free.name.indexOf('Södermalm') !== 0) err('free spot near Södermalm should take the district name, got ' + (free && free.name));

// Demolition: keep trying the head until no train blocks it.
const before = g.line.length;
let demolished = false;
for (let t = 0; t < 60 && !demolished; t += 0.05) {
  sim.tick(g, 0.05);
  demolished = sim.demolish(g, 'head');
  g.events.length = 0;
}
if (!demolished || g.line.length !== before - 1) err('demolish head failed');

// Save round-trip must preserve the line.
const back = sim.hydrate(sim.serialize(g));
if (back.line.length !== g.line.length) err('save round-trip lost stations');

const ok = g.line.length >= 10 && g.totalDelivered > 2000 && g.money >= 0 && up >= 3 && freeSpotPlaced;
console.log(ok ? 'SMOKE OK' : `SMOKE FAILED stations=${g.line.length} delivered=${Math.round(g.totalDelivered)} upgrades=${up} freeSpot=${freeSpotPlaced}`);
process.exit(ok ? 0 : 1);
