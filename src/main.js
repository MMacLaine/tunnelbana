import * as sim from './sim.js';
import * as render from './render.js';
import { STATIONS } from './data.js';

// All strings in one table (plan §7). English only at launch; station names stay Swedish.
const STR = {
  dispatch: 'AVGÅNG',
  dispatchSub: 'Dispatch a train',
  noIdle: 'All trains are out',
  extendHint: 'Drag the end of the line to the next station to extend it.',
  lineDoneDesc: 'Hökarängen reached. The 1950 line is done.',
  need: 'Need',
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

render.init($('map'));

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

// --- Extending: drag the line's end on the map (Mini Metro verb) ---
const mapEl = $('map');
mapEl.style.touchAction = 'none';
let dragFrom = null; // 'terminus' | 'ghost' | null

function canvasPos(e) {
  const r = mapEl.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function tryExtend() {
  if (sim.extend(g)) {
    updateUI();
  } else {
    const next = sim.nextStation(g);
    if (next) render.addFloat(g.built, STR.need + ' ' + fmt(next.ext.cost) + ' kr');
  }
}

mapEl.addEventListener('pointerdown', (e) => {
  const p = canvasPos(e);
  if (!sim.nextStation(g)) return;
  if (render.nearTerminus(g, p)) {
    dragFrom = 'terminus';
    render.setDrag(p);
    mapEl.setPointerCapture(e.pointerId);
  } else if (render.nearGhost(g, p)) {
    dragFrom = 'ghost';
  }
});
mapEl.addEventListener('pointermove', (e) => {
  const p = canvasPos(e);
  if (dragFrom === 'terminus') {
    render.setDrag(p);
  } else {
    mapEl.style.cursor =
      sim.nextStation(g) && (render.nearTerminus(g, p) || render.nearGhost(g, p))
        ? 'pointer' : 'default';
  }
});
mapEl.addEventListener('pointerup', (e) => {
  const p = canvasPos(e);
  if (dragFrom && render.nearGhost(g, p)) tryExtend();
  dragFrom = null;
  render.setDrag(null);
});
mapEl.addEventListener('pointercancel', () => {
  dragFrom = null;
  render.setDrag(null);
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
  $('stat-stations').textContent = g.built + ' / ' + STATIONS.length;
  $('extend-hint').textContent = sim.nextStation(g) ? STR.extendHint : STR.lineDoneDesc;
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
let lastFrame = last;

function frame(now) {
  acc += Math.min((now - last) / 1000, 2);
  last = now;
  while (acc >= STEP) {
    sim.tick(g, STEP);
    acc -= STEP;
  }
  for (const e of g.events) {
    if (e.type === 'payout') render.addFloat(e.station, '+' + fmt(e.amt));
    if (e.type === 'extend') render.addFloat(e.station, STATIONS[e.station].name);
  }
  g.events.length = 0;
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  render.draw(g, dt, sim.canExtend(g));
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
