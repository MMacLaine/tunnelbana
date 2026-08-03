import * as sim from './sim.js';
import * as render from './render.js';
import { ANCHORS } from './data.js';

// All strings in one table (plan §7). English only at launch; station names stay Swedish.
const STR = {
  dispatch: 'AVGÅNG',
  dispatchSub: 'Dispatch a train',
  noIdle: 'All trains are out',
  extendHint: 'Drag either end of the line anywhere on the map. Dashed rings mark good spots: real stations with full demand.',
  problems: {
    money: 'Need',
    tooClose: 'Too close to another station',
    water: 'Cannot build in the water (yet)',
    max: 'The line is at its limit for now',
  },
  shop: {
    train:     { name: 'New train',        desc: 'One more train on the line. Upkeep 1.2 kr/s.' },
    drivers:   { name: 'Hire drivers',     desc: 'Trains dispatch themselves. You can still ring the bell.' },
    timetable: { name: 'Tighter timetable', desc: 'Drivers dispatch 18% faster per level.' },
    capacity:  { name: 'Longer trains',    desc: '+60 passengers per train.' },
  },
  owned: 'Owned',
  level: 'Level',
  max: 'Max',
  needsDrivers: 'Hire drivers first',
};

let g = sim.hydrate(localStorage.getItem(sim.SAVE_KEY));

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('sv-SE');

// --- Basemap (MapLibre + OpenFreeMap, same stack as the SL map) ---
const wrap = $('map-wrap');
render.init($('map'));

let map = null;
if (window.maplibregl) {
  try {
    map = new maplibregl.Map({
      container: 'basemap',
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [18.082, 59.291],
      zoom: 11.8,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.doubleClickZoom.disable();
    render.setProjector((geo) => map.project([geo[1], geo[0]]));
    map.on('load', () => render.setBasemap(true));
    map.on('error', () => {}); // tile hiccups are non-fatal; fallback stays usable
  } catch {
    map = null; // no WebGL: the static fallback projector still renders the game
  }
}

function geoAt(p) {
  if (map) {
    const ll = map.unproject([p.x, p.y]);
    return [ll.lat, ll.lng];
  }
  return render.fallbackUnproject(p);
}

window.addEventListener('resize', () => render.resize());

// --- Bell ---
const bell = $('bell');
bell.querySelector('.bell-title').textContent = STR.dispatch;
function ringBell() {
  if (sim.dispatch(g)) {
    bell.classList.remove('rang');
    void bell.offsetWidth; // restart the animation
    bell.classList.add('rang');
  }
}
bell.addEventListener('click', ringBell);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    ringBell();
  }
});

// --- Extending: drag either line end anywhere; anchors snap (Mini Metro verb) ---
let dragEnd = null; // 'head' | 'tail' | null

function canvasPos(e) {
  const r = wrap.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function dragState(p) {
  const snap = render.nearAnchor(g, p);
  const geo = snap !== null ? ANCHORS[snap].geo : geoAt(p);
  const cost = sim.extensionCost(g, dragEnd, geo);
  const problem = sim.placementProblem(g, dragEnd, geo);
  const label = !problem || problem === 'money'
    ? (problem === 'money' ? STR.problems.money + ' ' : '') + fmt(cost) + ' kr'
    : STR.problems[problem];
  return { x: p.x, y: p.y, end: dragEnd, snap, geo, cost, problem, label };
}

wrap.addEventListener('pointerdown', (e) => {
  const p = canvasPos(e);
  const end = render.nearEnd(g, p);
  if (end) {
    dragEnd = end;
    render.setDrag(dragState(p));
    if (map) map.dragPan.disable();
    e.stopPropagation();
    e.preventDefault();
    return;
  }
  // Click on a dashed anchor ring: extend from the nearest end.
  const a = render.nearAnchor(g, p);
  if (a !== null) {
    const headP = render.project(sim.endStation(g, 'head').geo);
    const tailP = render.project(sim.endStation(g, 'tail').geo);
    const ap = render.project(ANCHORS[a].geo);
    dragEnd = Math.hypot(ap.x - headP.x, ap.y - headP.y) < Math.hypot(ap.x - tailP.x, ap.y - tailP.y)
      ? 'head' : 'tail';
    tryExtend(dragState(p));
    dragEnd = null;
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

wrap.addEventListener('pointermove', (e) => {
  const p = canvasPos(e);
  if (dragEnd) {
    render.setDrag(dragState(p));
  } else {
    wrap.style.cursor =
      render.nearEnd(g, p) || render.nearAnchor(g, p) !== null ? 'pointer' : '';
  }
});

function endDrag(e) {
  if (!dragEnd) return;
  const d = dragState(canvasPos(e));
  tryExtend(d);
  dragEnd = null;
  render.setDrag(null);
  if (map) map.dragPan.enable();
}

function tryExtend(d) {
  if (sim.extendTo(g, d.end, d.geo, d.snap)) {
    updateUI();
  } else if (d.problem) {
    render.addFloatGeo(d.geo, d.label);
  }
}

window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', () => {
  dragEnd = null;
  render.setDrag(null);
  if (map) map.dragPan.enable();
});

// --- Shop ---
const shopEl = $('shop');
const cards = {};
for (const item of sim.SHOP) {
  const s = STR.shop[item.id];
  const card = document.createElement('button');
  card.className = 'shop-card';
  card.innerHTML =
    '<span class="shop-top"><span class="shop-name"></span><span class="shop-cost"></span></span>' +
    '<span class="shop-desc"></span><span class="shop-owned"></span>';
  card.querySelector('.shop-name').textContent = s.name;
  card.querySelector('.shop-desc').textContent = s.desc;
  card.addEventListener('click', () => {
    if (sim.buy(g, item.id)) updateUI();
  });
  shopEl.appendChild(card);
  cards[item.id] = card;
}

function updateShop() {
  for (const item of sim.SHOP) {
    const card = cards[item.id];
    const owned = g.owned[item.id];
    const maxed = owned >= item.max;
    const gated = item.needs && !g.owned[item.needs];
    card.disabled = maxed || gated || !sim.canBuy(g, item.id);
    card.querySelector('.shop-cost').textContent =
      maxed ? STR.max : fmt(sim.shopCost(g, item.id)) + ' kr';
    const ownedEl = card.querySelector('.shop-owned');
    if (gated) ownedEl.textContent = STR.needsDrivers;
    else if (item.max === 1) ownedEl.textContent = owned ? '✓' : '';
    else if (item.id === 'train') ownedEl.textContent = STR.owned + ': ' + (owned + 1);
    else ownedEl.textContent = owned ? STR.level + ' ' + owned : '';
  }
}

// --- Stats ---
function updateUI() {
  $('money').textContent = fmt(g.money) + ' kr';
  const gross = sim.grossRate(g);
  const upkeep = sim.upkeepRate(g);
  const net = gross - upkeep;
  $('rate-gross').textContent = '+' + gross.toFixed(1) + ' kr/s fares';
  $('rate-upkeep').textContent = '−' + upkeep.toFixed(1) + ' kr/s upkeep';
  const netEl = $('rate-net');
  netEl.textContent = (net >= 0 ? '+' : '−') + Math.abs(net).toFixed(1) + ' kr/s';
  netEl.classList.toggle('neg', net < 0);
  $('stat-delivered').textContent = fmt(g.totalDelivered);
  $('stat-stations').textContent = String(g.line.length);
  $('stat-demand').textContent = '×' + sim.cityMult(g).toFixed(2);
  $('stat-trains').textContent =
    sim.idleTrains(g).length + ' / ' + g.trains.length;
  bell.querySelector('.bell-sub').textContent =
    sim.idleTrains(g).length ? STR.dispatchSub : STR.noIdle;
  $('extend-hint').textContent = STR.extendHint;
  updateShop();
}

// --- Loop: fixed-timestep sim, rAF render ---
const STEP = 0.05;
let last = performance.now();
let acc = 0;
let lastFrame = last;

function frame(now) {
  acc += Math.min((now - last) / 1000, 2);
  last = now;
  while (acc >= STEP) {
    sim.tick(g, STEP);
    acc -= STEP;
  }
  for (const e of g.events) {
    if (e.type === 'payout') render.addFloatGeo(e.geo, '+' + fmt(e.amt));
    if (e.type === 'extend') render.addFloatGeo(e.geo, e.name);
  }
  g.events.length = 0;
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  render.draw(g, dt);
  updateUI();
  requestAnimationFrame(frame);
}

// --- Save ---
function save() {
  localStorage.setItem(sim.SAVE_KEY, sim.serialize(g));
}
setInterval(save, 5000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

updateUI();
requestAnimationFrame(frame);
