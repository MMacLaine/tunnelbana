import * as sim from './sim.js';
import * as render from './render.js';
import { ANCHORS } from './data.js';

// UI copy interpolates from BAL so a balance change can never make the interface lie.
const B = sim.BAL;
const STR = {
  dispatch: 'AVGÅNG',
  dispatchSub: 'Dispatch a train',
  noIdle: 'All trains are out',
  hints: 'Fare: ' + B.fare + ' kr per delivered passenger (space rings the bell too). ' +
    'Drag either end of the line anywhere on the map: dashed rings are real stations with full demand, ' +
    'anywhere else earns what the label says. Right-click a line end to demolish it (' + B.demolishCost + ' kr). ' +
    'Esc for the menu.',
  demolished: '−' + B.demolishCost + ' kr',
  cantDemolish: 'Cannot demolish now',
  menuStart: 'Start',
  menuContinue: 'Continue',
  menuResume: 'Resume',
  resetConfirm: 'Really? Click again',
  reset: 'Reset progress',
  problems: {
    money: 'Need',
    tooClose: 'Too close to another station',
    water: 'Cannot build in the water (yet)',
    max: 'The line is at its limit for now',
  },
  mapDown: 'Basemap unavailable. Playing on the fallback map.',
  shop: {
    train:     { name: 'New train',        desc: 'One more train on the line. Upkeep ' + B.upkeepPerTrainPerSec + ' kr/s.' },
    drivers:   { name: 'Hire drivers',     desc: 'Trains dispatch themselves. You can still ring the bell.' },
    timetable: { name: 'Tighter timetable', desc: 'Drivers dispatch ' + Math.round((1 - B.dispatchPerLevel) * 100) + '% faster per level.' },
    capacity:  { name: 'Longer trains',    desc: '+' + B.capPerLevel + ' passengers per train.' },
  },
  owned: 'Owned',
  level: 'Level',
  max: 'Max',
  needsDrivers: 'Hire drivers first',
};

let g = sim.hydrate(localStorage.getItem(sim.SAVE_KEY));
let paused = true; // boot into the menu

const $ = (id) => document.getElementById(id);
// sv-SE groups with NBSP; the design system wants a plain thin gap (1 240 kr).
const fmt = (n) => Math.floor(n).toLocaleString('sv-SE').replace(/ /g, ' ');

// --- Basemap (MapLibre + OpenFreeMap, same stack as the SL map) ---
const wrap = $('map-wrap');
render.init($('map'));

let map = null;
let basemapUp = false;
function basemapFailed() {
  render.setBasemap('off');
  $('map-status').hidden = false;
  $('map-status').textContent = STR.mapDown;
}
if (window.maplibregl) {
  try {
    map = new maplibregl.Map({
      container: 'basemap',
      style: 'basemap/tunnelbana-night.json',
      center: [18.082, 59.291],
      zoom: 11.8,
      minZoom: 10.3,
      maxZoom: 14.5,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.doubleClickZoom.disable();
    render.setProjector((geo) => map.project([geo[1], geo[0]]));
    render.setBasemap('pending');
    map.on('load', () => {
      basemapUp = true;
      render.setBasemap('on');
    });
    // Redraw the overlay inside the map's own frame so the game layer stays
    // locked to the tiles during pans and zooms (rAF alone lags a frame).
    map.on('render', () => render.draw(g));
    setTimeout(() => { if (!basemapUp) basemapFailed(); }, 8000);
  } catch {
    map = null; // no WebGL: the static fallback projector still renders the game
    basemapFailed();
  }
} else {
  basemapFailed();
}

function geoAt(p) {
  if (map) {
    const ll = map.unproject([p.x, p.y]);
    return [ll.lat, ll.lng];
  }
  return render.fallbackUnproject(p);
}

window.addEventListener('resize', () => render.resize());

// --- Menu ---
const menu = $('menu');
function hasSave() {
  return localStorage.getItem(sim.SAVE_KEY) !== null;
}
function settingsView(on) {
  $('settings-view').hidden = !on;
  $('main-view').hidden = on;
  $('settings-reset').textContent = STR.reset;
}
function showMenu(mode) {
  paused = true;
  menu.hidden = false;
  settingsView(false);
  $('menu-resume').textContent =
    mode === 'pause' ? STR.menuResume : hasSave() ? STR.menuContinue : STR.menuStart;
  $('menu-quit').hidden = mode !== 'pause';
}
function closeMenu() {
  paused = false;
  menu.hidden = true;
}
$('menu-resume').addEventListener('click', closeMenu);
$('menu-settings').addEventListener('click', () => settingsView(true));
$('settings-back').addEventListener('click', () => settingsView(false));
$('menu-quit').addEventListener('click', () => {
  save();
  showMenu('start');
});
$('settings-reset').addEventListener('click', () => {
  const btn = $('settings-reset');
  if (btn.textContent !== STR.resetConfirm) {
    btn.textContent = STR.resetConfirm;
    return;
  }
  localStorage.removeItem(sim.SAVE_KEY);
  g = sim.hydrate(null);
  updateUI();
  settingsView(false);
  showMenu('start');
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (menu.hidden) showMenu('pause');
    else if (!$('settings-view').hidden) settingsView(false);
    else closeMenu();
  }
});

// --- Bell ---
const bell = $('bell');
bell.querySelector('.bell-title').textContent = STR.dispatch;
function ringBell() {
  if (paused) return;
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
  let label = !problem || problem === 'money'
    ? (problem === 'money' ? STR.problems.money + ' ' : '') + fmt(cost) + ' kr'
    : STR.problems[problem];
  // A free spot must say what it is worth, not just what it costs.
  if (snap === null && (!problem || problem === 'money')) {
    label += ' · ' + sim.freeSpotValue(geo) + 'x demand';
  }
  return { x: p.x, y: p.y, end: dragEnd, snap, geo, cost, problem, label };
}

wrap.addEventListener('pointerdown', (e) => {
  if (paused || e.button === 2) return;
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
  // Click on a dashed anchor ring: extend from the nearest end, but fall back
  // to the other end if only that one is a legal move.
  const a = render.nearAnchor(g, p);
  if (a !== null) {
    const headP = render.project(sim.endStation(g, 'head').geo);
    const tailP = render.project(sim.endStation(g, 'tail').geo);
    const ap = render.project(ANCHORS[a].geo);
    const nearest = Math.hypot(ap.x - headP.x, ap.y - headP.y) < Math.hypot(ap.x - tailP.x, ap.y - tailP.y)
      ? 'head' : 'tail';
    const other = nearest === 'head' ? 'tail' : 'head';
    dragEnd = (sim.placementProblem(g, nearest, ANCHORS[a].geo) &&
               !sim.placementProblem(g, other, ANCHORS[a].geo)) ? other : nearest;
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
  } else if (!paused) {
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

// Right-click a line end: demolish it.
wrap.addEventListener('contextmenu', (e) => {
  if (paused) return;
  const p = canvasPos(e);
  const end = render.nearEnd(g, p);
  if (!end) return;
  e.preventDefault();
  if (sim.demolish(g, end)) {
    updateUI();
  } else {
    render.addFloatGeo(sim.endStation(g, end).geo, STR.cantDemolish);
  }
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
    if (!paused && sim.buy(g, item.id)) updateUI();
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
  updateShop();
}

// --- Loop: fixed-timestep sim, rAF render ---
const STEP = 0.05;
let last = performance.now();
let acc = 0;

function frame(now) {
  if (paused) {
    last = now;
    acc = 0;
  } else {
    acc += Math.min((now - last) / 1000, 2);
    last = now;
    while (acc >= STEP) {
      sim.tick(g, STEP);
      acc -= STEP;
    }
  }
  for (const e of g.events) {
    if (e.type === 'payout') render.addFloatGeo(e.geo, '+' + fmt(e.amt));
    if (e.type === 'extend') render.addFloatGeo(e.geo, e.name);
    if (e.type === 'demolish') render.addFloatGeo(e.geo, e.name + ' ' + STR.demolished);
  }
  g.events.length = 0;
  render.draw(g);
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

$('hints').textContent = STR.hints;
showMenu('start');
updateUI();
requestAnimationFrame(frame);
