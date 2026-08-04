import * as sim from './sim.js';
import * as render from './render.js';
import { ANCHORS } from './data.js';

// UI copy interpolates from BAL and the CATALOG so a balance change can never
// make the interface lie.
const B = sim.BAL;
const CAT = Object.fromEntries(sim.CATALOG.map((u) => [u.id, u]));
const pct = (x) => Math.round(Math.abs(1 - x) * 100);
const STR = {
  dispatch: 'AVGÅNG',
  dispatchSub: 'Dispatch a train',
  noIdle: 'All trains are out',
  hints: 'Fares pay ' + B.farePerKm + ' kr per passenger-kilometre, collected as passengers board ' +
    '(space rings the bell too). Drag either end of the line anywhere on the map: dashed rings are ' +
    'real stations with full demand, anywhere else earns what the label says. Right-click a line end ' +
    'to demolish it (' + B.demolishCost + ' kr). Political capital (pk) grows with how much of the ' +
    'region you serve. Esc for the menu.',
  tiers: ['', 'Hållplats', 'Station', 'Knutpunkt'],
  tierUp: ['', 'Upgrade to Station', 'Upgrade to Knutpunkt', ''],
  tierMax: 'Knutpunkt, fully built',
  tierEraGate: 'Knutpunkt unlocks in 1957',
  entRow: 'Entrances',
  gatesRow: 'Gates',
  panelDemand: 'Demand',
  panelWaiting: 'Waiting',
  panelCrowd: 'Crowding',
  panelUpkeep: 'Upkeep',
  panelTop: 'Passengers head for',
  lvl: 'lvl',
  foundBtn: 'Found a new line',
  linesHdr: 'Trains per line',
  addTrain: '+',
  mothballBtn: 'Mothball idle train',
  reactivateBtn: 'Reactivate train',
  mothballedFloat: 'mothballed',
  mothballedTag: 'mothballed',
  awayTitle: 'While you were away',
  coverage: 'coverage',
  phases: ['MORGONRUSNING', '', 'KVÄLLSRUSNING', 'NATT'],
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
    train:      { name: 'New train',         desc: 'One more train, on the emptiest line. Upkeep ' + B.upkeepPerTrainPerSec + ' kr/s.' },
    drivers:    { name: 'Hire drivers',      desc: 'Trains dispatch themselves. You can still ring the bell.' },
    timetable:  { name: 'Tighter timetable', desc: 'Drivers dispatch ' + pct(CAT.timetable.mult.dispatchInterval) + '% faster per level.' },
    capacity:   { name: 'Longer trains',     desc: '+' + CAT.capacity.add.trainCap + ' passengers per train.' },
    bogies:     { name: 'C1 bogie service',  desc: 'Trains run ' + pct(CAT.bogies.mult.speed) + '% faster.' },
    turnstiles: { name: 'Turnstiles',        desc: 'Fares worth ' + pct(CAT.turnstiles.mult.fare) + '% more.' },
    westline:   { name: 'Västerortsbanan',   desc: 'Megaproject: a second line from T-Centralen to Hötorget, with a train. The city pays in trust.' },
    entrances:  { name: 'Extra entrances',   desc: 'Wider catchment: +' + Math.round(CAT.entrances.add.demand * 100) + '% demand everywhere, per level.' },
    through:    { name: 'Through-running',   desc: 'Megaproject: interchange transfer flow ×' + CAT.through.mult.transfer + '.' },
    stock1957:  { name: '1957 stock',        desc: 'Trains run ' + pct(CAT.stock1957.mult.speed) + '% faster.' },
    c4stock:    { name: 'C4 stock',          desc: 'Trains run ' + pct(CAT.c4stock.mult.speed) + '% faster.' },
    c14stock:   { name: 'C14 stock',         desc: 'Trains run ' + pct(CAT.c14stock.mult.speed) + '% faster.' },
    zonefare:   { name: 'Zone fares',        desc: 'Fares worth ' + pct(CAT.zonefare.mult.fare) + '% more.' },
  },
  eras: {
    1952: { title: '1952 · Västerort', blurb: 'The city looks west. Hötorget opens the door toward Vällingby, and Stockholm learns what a network is.' },
    1957: { title: '1957 · Genom staden', blurb: 'Through-running arrives. The lines stop being lines and start being a system.' },
    1965: { title: '1965 · Miljonprogrammet', blurb: 'The city grows faster than anyone planned for. New stock, new signals, new depots.' },
    1975: { title: '1975 · Hela Stockholm', blurb: 'The map begins to look like the one on the platform walls.' },
  },
  advance: 'Advance to',
  advanceNeeds: 'Needs',
  eraNow: 'Era',
  arcDone: 'The arc is complete, for now.',
  linesStat: 'Lines',
  ending: {
    title: 'SLUTSTATION',
    blurb: 'Every station on the map has a line. The arc from 1950 is complete. ' +
      'This is the end of the story, and the trains keep running: your city does not stop because the chapter does.',
  },
  themeRow: 'Theme',
  themeDark: 'Dark',
  themeLight: 'Light',
  exportBtn: 'Export save',
  exportDone: 'Copied to clipboard',
  importBtn: 'Import save',
  importApply: 'Apply',
  importBad: 'Not a valid save',
  owned: 'Owned',
  level: 'Level',
  max: 'Max',
  needsDrivers: 'Hire drivers first',
};

const savedRaw = localStorage.getItem(sim.SAVE_KEY);
let g = sim.hydrate(savedRaw);
let offline = null;
try {
  const sv = JSON.parse(savedRaw);
  if (sv && typeof sv.savedAt === 'number') {
    offline = sim.simulateOffline(g, (Date.now() - sv.savedAt) / 1000);
  }
} catch {}
let paused = true; // boot into the menu

const $ = (id) => document.getElementById(id);
// sv-SE groups with NBSP; the design system wants a plain thin gap (1 240 kr).
const fmt = (n) => Math.floor(n).toLocaleString('sv-SE').replace(/ /g, ' ');

// --- Theme (light mode is a testing aid; dark is the designed theme) ---
const THEME_KEY = 'tunnelbana_theme';
const NIGHT_STYLE = 'basemap/tunnelbana-night.json';
const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const urlTheme = new URLSearchParams(location.search).get('theme');
let theme = (urlTheme || localStorage.getItem(THEME_KEY)) === 'light' ? 'light' : 'dark';

function applyTheme(next) {
  theme = next;
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
  render.setTheme(theme);
  if (map) {
    render.setBasemap('pending');
    map.setStyle(theme === 'light' ? LIGHT_STYLE : NIGHT_STYLE);
    // setStyle wipes custom layers; re-add the game layer once the new style
    // has settled, then the veil comes back.
    map.once('idle', () => {
      try {
        if (!map.getLayer('tb-game')) map.addLayer(gameLayer());
      } catch {}
      render.setBasemap('on');
    });
  }
}
document.documentElement.dataset.theme = theme;
render.setTheme(theme);

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
      style: theme === 'light' ? LIGHT_STYLE : NIGHT_STYLE,
      center: [18.0640, 59.3230], // the hub and its first reach, not the empty south
      zoom: 12.0,
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
    // The game is rendered INSIDE the map's WebGL frame as a custom layer:
    // the 2D canvas is drawn offscreen and uploaded as a texture within the
    // same GL frame as the tiles. Two separate canvases can be presented on
    // different vsyncs by the compositor (the "stations swim while panning"
    // bug, observed on real GPUs and invisible in software rendering); one
    // canvas makes the skew impossible by construction.
    map.on('load', () => map.addLayer(gameLayer()));
    setTimeout(() => { if (!basemapUp) basemapFailed(); }, 8000);
  } catch {
    map = null; // no WebGL: the static fallback projector still renders the game
    basemapFailed();
  }
} else {
  basemapFailed();
}

// MapLibre custom layer: draws the game canvas as a full-viewport textured quad
// inside the map's own GL frame.
function gameLayer() {
  let prog, tex, buf, aPos, uTex;
  return {
    id: 'tb-game',
    type: 'custom',
    renderingMode: '2d',
    onAdd(m, gl) {
      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, 'attribute vec2 p; varying vec2 v; void main() { v = (p + 1.0) * 0.5; gl_Position = vec4(p, 0.0, 1.0); }');
      gl.compileShader(vs);
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, 'precision mediump float; uniform sampler2D t; varying vec2 v; void main() { gl_FragColor = texture2D(t, vec2(v.x, 1.0 - v.y)); }');
      gl.compileShader(fs);
      prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      aPos = gl.getAttribLocation(prog, 'p');
      uTex = gl.getUniformLocation(prog, 't');
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // The DOM overlay canvas is now a render surface only.
      $('map').style.display = 'none';
    },
    render(gl) {
      render.draw(g); // paint game state at exactly this frame's camera
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, render.canvasEl());
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(uTex, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

// Bring the camera home to the hub (new game, reset, import).
function homeCamera() {
  if (map) map.flyTo({ center: [18.0640, 59.3230], zoom: 12.0, duration: 900 });
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
  $('settings-theme').textContent = theme === 'light' ? STR.themeLight : STR.themeDark;
  $('settings-export').textContent = STR.exportBtn;
  $('settings-import').textContent = STR.importBtn;
  $('import-text').hidden = true;
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
$('settings-theme').addEventListener('click', () => {
  applyTheme(theme === 'light' ? 'dark' : 'light');
  $('settings-theme').textContent = theme === 'light' ? STR.themeLight : STR.themeDark;
});
$('settings-export').addEventListener('click', () => {
  const btn = $('settings-export');
  save();
  const done = () => {
    btn.textContent = STR.exportDone;
    setTimeout(() => { btn.textContent = STR.exportBtn; }, 1500);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(sim.serialize(g)).then(done, () => {
      $('import-text').hidden = false;
      $('import-text').value = sim.serialize(g);
    });
  } else {
    $('import-text').hidden = false;
    $('import-text').value = sim.serialize(g);
  }
});
$('settings-import').addEventListener('click', () => {
  const ta = $('import-text');
  if (ta.hidden) {
    ta.hidden = false;
    ta.value = '';
    $('settings-import').textContent = STR.importApply;
    return;
  }
  let ok = false;
  try {
    const s = JSON.parse(ta.value);
    ok = s && typeof s.saveVersion === 'number';
  } catch {}
  if (!ok) {
    $('settings-import').textContent = STR.importBad;
    setTimeout(() => { $('settings-import').textContent = STR.importApply; }, 1500);
    return;
  }
  g = sim.hydrate(ta.value);
  save();
  updateUI();
  homeCamera();
  ta.hidden = true;
  $('settings-import').textContent = STR.importBtn;
  settingsView(false);
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
  homeCamera();
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

// --- Era moments ---
let momentOpen = false;
function showMoment(year) {
  const m = STR.eras[year];
  if (!m) return;
  momentOpen = true;
  $('moment-title').textContent = m.title;
  $('moment-blurb').textContent = m.blurb;
  $('moment').hidden = false;
  save();
}
function showEnding() {
  momentOpen = true;
  $('moment-title').textContent = STR.ending.title;
  $('moment-blurb').textContent = STR.ending.blurb;
  $('moment').hidden = false;
  save();
}
$('moment-close').addEventListener('click', () => {
  momentOpen = false;
  $('moment').hidden = true;
});
$('era-btn').addEventListener('click', () => {
  if (sim.advanceEra(g)) updateUI();
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

// --- Extending: drag any line end anywhere; anchors snap (Mini Metro verb) ---
let dragRef = null; // { li, end } | null

function canvasPos(e) {
  const r = wrap.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function dragState(p) {
  const snap = render.nearAnchor(g, p, dragRef.li);
  const geo = snap !== null ? ANCHORS[snap].geo : geoAt(p);
  const cost = sim.extensionCost(g, dragRef.li, dragRef.end, geo);
  const problem = sim.placementProblem(g, dragRef.li, dragRef.end, geo);
  let label = !problem || problem === 'money'
    ? (problem === 'money' ? STR.problems.money + ' ' : '') + fmt(cost) + ' kr'
    : STR.problems[problem];
  // A free spot must say what it is worth, not just what it costs.
  if (snap === null && (!problem || problem === 'money')) {
    label += ' · ' + sim.freeSpotValue(g, geo) + 'x demand';
  }
  return { x: p.x, y: p.y, li: dragRef.li, end: dragRef.end, snap, geo, cost, problem, label };
}

let downAt = null; // for click-vs-drag discrimination

wrap.addEventListener('pointerdown', (e) => {
  if (paused || e.button === 2) return;
  const p = canvasPos(e);
  downAt = p;
  const ref = render.nearEnd(g, p);
  if (ref) {
    dragRef = ref;
    render.setDrag(dragState(p));
    if (map) map.dragPan.disable();
    e.stopPropagation();
    e.preventDefault();
    return;
  }
  // A built station (not a grabbable end): select it for the panel.
  const st = render.nearStation(g, p);
  if (st) {
    selectStation(st);
    e.stopPropagation();
    e.preventDefault();
    return;
  }
  selectStation(null); // clicking empty map clears the panel (pan still works)
  // Click on a dashed anchor ring: extend from the nearest legal line end.
  const a = render.nearAnchor(g, p, null);
  if (a !== null) {
    const ap = render.project(ANCHORS[a].geo);
    const options = [];
    for (let li = 0; li < g.lines.length; li++) {
      for (const end of ['head', 'tail']) {
        const ep = render.project(sim.endStation(g, li, end).geo);
        options.push({ li, end, d: Math.hypot(ap.x - ep.x, ap.y - ep.y) });
      }
    }
    options.sort((x, y) => x.d - y.d);
    dragRef = options.find((o) => !sim.placementProblem(g, o.li, o.end, ANCHORS[a].geo)) || options[0];
    tryExtend(dragState(p));
    dragRef = null;
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

wrap.addEventListener('pointermove', (e) => {
  const p = canvasPos(e);
  if (dragRef) {
    render.setDrag(dragState(p));
  } else if (!paused) {
    wrap.style.cursor =
      render.nearEnd(g, p) || render.nearAnchor(g, p, null) !== null ? 'pointer' : '';
  }
});

function endDrag(e) {
  if (!dragRef) return;
  const p = canvasPos(e);
  // A click on a line end (no real drag) selects the station instead of
  // attempting a zero-length extension.
  if (downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 6) {
    const L = g.lines[dragRef.li];
    selectStation({ li: dragRef.li, i: dragRef.end === 'head' ? 0 : L.stations.length - 1 });
  } else {
    tryExtend(dragState(p));
  }
  dragRef = null;
  render.setDrag(null);
  if (map) map.dragPan.enable();
}

function tryExtend(d) {
  if (sim.extendTo(g, d.li, d.end, d.geo, d.snap)) {
    updateUI();
  } else if (d.problem) {
    render.addFloatGeo(d.geo, d.label);
  }
}

window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', () => {
  dragRef = null;
  render.setDrag(null);
  if (map) map.dragPan.enable();
});

// Right-click a line end: demolish it.
wrap.addEventListener('contextmenu', (e) => {
  if (paused) return;
  const p = canvasPos(e);
  const ref = render.nearEnd(g, p);
  if (!ref) return;
  e.preventDefault();
  if (sim.demolish(g, ref.li, ref.end)) {
    updateUI();
  } else {
    render.addFloatGeo(sim.endStation(g, ref.li, ref.end).geo, STR.cantDemolish);
  }
});

// --- Station panel: the diagnostic plus shop for the selected station ---
let selected = null; // {li, i} | null

function selectStation(sel) {
  selected = sel;
  render.setSelected(sel);
  $('station-panel').hidden = !sel;
  if (sel) updateStationPanel();
}

function stationUpgRow(kind) {
  const st = g.lines[selected.li].stations[selected.i];
  const btn = $('sp-' + kind);
  const cost = sim.upgradeCost(g, selected.li, selected.i, kind);
  const lvl = st[kind];
  btn.textContent = (kind === 'ent' ? STR.entRow : STR.gatesRow) +
    ' ' + STR.lvl + ' ' + lvl + '/' + B.upgMax +
    (lvl >= B.upgMax ? '' : ' · ' + fmt(cost.kr) + ' kr');
  btn.disabled = !sim.canUpgradeStation(g, selected.li, selected.i, kind);
}

function updateStationPanel() {
  if (!selected) return;
  const L = g.lines[selected.li];
  const st = L.stations[selected.i];
  if (!st) { selectStation(null); return; }
  $('sp-name').textContent = st.name;
  $('sp-tier').textContent = STR.tiers[st.tier];
  const waiting = Math.floor(sim.waitingAt(g, selected.li, selected.i));
  const crowd = Math.round(100 * waiting / (sim.stationCap(g) * st.mult));
  const upk = (B.stationUpkeep[st.tier] + B.upgradeUpkeep * (st.ent + st.gates)).toFixed(2);
  $('sp-stats').textContent =
    STR.panelDemand + ' ' + st.mult.toFixed(2) + 'x · ' +
    STR.panelWaiting + ' ' + waiting + ' · ' +
    STR.panelCrowd + ' ' + crowd + '% · ' +
    STR.panelUpkeep + ' ' + upk + ' kr/s';
  // Where this platform's crowd wants to go (read from the OD weights).
  const dirs = sim.odWeights(g, selected.li, selected.i);
  $('sp-dest').textContent = dirs.length
    ? STR.panelTop + ': ' + dirs.map((d) => d.name + ' ' + Math.round(d.share * 100) + '%').join(' · ')
    : '';
  const tierBtn = $('sp-tier-btn');
  if (st.tier >= 3) {
    tierBtn.textContent = STR.tierMax;
    tierBtn.disabled = true;
  } else {
    const cost = sim.upgradeCost(g, selected.li, selected.i, 'tier');
    const gated = st.tier === 2 && sim.eraYear(g) < B.tier3Era;
    tierBtn.textContent = gated
      ? STR.tierEraGate
      : STR.tierUp[st.tier] + ' · ' + fmt(cost.kr) + ' kr' + (cost.pk ? ' + ' + cost.pk + ' pk' : '');
    tierBtn.disabled = !sim.canUpgradeStation(g, selected.li, selected.i, 'tier');
  }
  stationUpgRow('ent');
  stationUpgRow('gates');
  const fb = $('sp-found');
  const showFound = st.tier >= 3;
  fb.hidden = !showFound;
  if (showFound) {
    fb.textContent = STR.foundBtn + ' · ' + fmt(B.foundLineKr) + ' kr + ' + B.foundLinePk + ' pk';
    fb.disabled = !sim.canFoundLine(g, selected.li, selected.i);
  }
  // Left behind per minute: the headline diagnostic (abandonment).
  const left = Math.round(L.left60[selected.i] * 60);
  const lb = $('sp-left');
  lb.textContent = left > 0 ? 'Left behind: ' + fmt(left) + '/min' : '';
  lb.hidden = left <= 0;
}

for (const kind of ['tier', 'ent', 'gates']) {
  $('sp-' + (kind === 'tier' ? 'tier-btn' : kind)).addEventListener('click', () => {
    if (selected && sim.upgradeStation(g, selected.li, selected.i, kind)) updateUI();
  });
}
$('sp-close').addEventListener('click', () => selectStation(null));
$('sp-found').addEventListener('click', () => {
  if (selected && sim.foundLine(g, selected.li, selected.i)) {
    selectStation(null);
    updateUI();
  }
});

// Per-line train allocation rows (player-controlled, report 634 risk 3).
$('line-rows').addEventListener('click', (e) => {
  const li = e.target?.dataset?.li;
  if (li !== undefined && sim.moveTrain(g, Number(li))) updateUI();
});

function updateLineRows() {
  const rows = [];
  for (let li = 0; li < g.lines.length; li++) {
    const active = g.trains.filter((t) => t.line === li && !t.mothballed).length;
    rows.push(
      '<div class="line-row"><span class="chip" style="background:' + g.lines[li].color + '"></span>' +
      'Linje ' + (li + 1) + ' · ' + g.lines[li].stations.length + ' st · ' + active + ' 🚆 ' +
      (g.lines.length > 1 ? '<button class="mini-btn" data-li="' + li + '">' + STR.addTrain + '</button>' : '') +
      '</div>'
    );
  }
  $('line-rows').innerHTML = rows.join('');
}

// --- Shop ---
const shopEl = $('shop');
const cards = {};
for (const item of sim.CATALOG) {
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
  for (const item of sim.CATALOG) {
    const card = cards[item.id];
    const visible = sim.eraVisible(g, item);
    card.style.display = visible ? '' : 'none';
    if (!visible) continue;
    const owned = g.owned[item.id];
    const maxed = owned >= sim.maxFor(g, item);
    const gated = item.needs && !g.owned[item.needs];
    card.disabled = maxed || gated || !sim.canBuy(g, item.id);
    const unit = item.currency === 'pk' ? ' pk' : ' kr';
    card.querySelector('.shop-cost').textContent =
      maxed ? STR.max : fmt(sim.shopCost(g, item.id)) + unit;
    const ownedEl = card.querySelector('.shop-owned');
    if (gated) ownedEl.textContent = STR.needsDrivers;
    else if (item.max === 1) ownedEl.textContent = owned ? '✓' : '';
    else if (item.id === 'train') ownedEl.textContent = STR.owned + ': ' + (owned + 1);
    else ownedEl.textContent = owned ? STR.level + ' ' + owned : '';
  }
  // Era panel
  const next = sim.nextEra(g);
  $('era-now').textContent = STR.eraNow + ' ' + sim.eraYear(g);
  if (next) {
    $('era-btn').hidden = false;
    $('era-btn').textContent = STR.advance + ' ' + next.year + ' (' + next.pk + ' pk)';
    $('era-btn').disabled = !sim.canAdvanceEra(g);
    $('era-needs').textContent = STR.advanceNeeds + ' ' + fmt(next.delivered) + ' delivered · ' + next.pk + ' pk';
  } else {
    $('era-btn').hidden = true;
    $('era-needs').textContent = STR.arcDone;
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
  $('stat-stations').textContent = sim.stationCount(g) + ' · ' + STR.linesStat + ': ' + g.lines.length;
  $('stat-demand').textContent = '×' + sim.cityMult(g).toFixed(2);
  const mb = sim.mothballedTrains(g).length;
  $('stat-trains').textContent =
    sim.idleTrains(g).length + ' / ' + (g.trains.length - mb) +
    (mb ? ' (+' + mb + ' ' + STR.mothballedTag + ')' : '');
  $('pk').textContent = g.pk.toFixed(1) + ' pk';
  const phase = STR.phases[sim.dayPhase(g)];
  $('pk-cov').textContent = Math.round(sim.coverage(g) * 100) + '% ' + STR.coverage +
    (phase ? ' · ' + phase : '');
  $('btn-mothball').disabled = sim.idleTrains(g).length === 0 || g.trains.length - mb <= 1;
  $('btn-reactivate').disabled = mb === 0;
  bell.querySelector('.bell-sub').textContent =
    sim.idleTrains(g).length ? STR.dispatchSub : STR.noIdle;
  if (selected) updateStationPanel();
  updateLineRows();
  updateShop();
}

// --- Loop: fixed-timestep sim, rAF render ---
const STEP = 0.05;
let last = performance.now();
let acc = 0;

function frame(now) {
  if (paused || momentOpen) {
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
    if (e.type === 'alight') render.addFloatGeo(e.geo, '↓' + fmt(e.n), 'muted');
    if (e.type === 'mothball') render.addFloatGeo(e.geo, STR.mothballedFloat, 'muted');
    if (e.type === 'surge') render.addFloatGeo(e.geo, 'RUSNING · ' + e.name);
    if (e.type === 'abandon') render.addFloatGeo(e.geo, '−' + fmt(e.n), 'red');
    if (e.type === 'newline') render.addFloatGeo(e.geo, e.name);
    if (e.type === 'era') showMoment(e.year);
    if (e.type === 'ending') showEnding();
  }
  g.events.length = 0;
  if (map && basemapUp) {
    map.triggerRepaint(); // drawing happens in the map's render event, never here
  } else {
    render.draw(g);
  }
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
$('btn-mothball').textContent = STR.mothballBtn;
$('btn-reactivate').textContent = STR.reactivateBtn;
$('btn-mothball').addEventListener('click', () => { if (sim.mothball(g)) updateUI(); });
$('btn-reactivate').addEventListener('click', () => { if (sim.reactivate(g)) updateUI(); });
if (offline) {
  const h = Math.floor(offline.seconds / 3600);
  const m = Math.floor((offline.seconds % 3600) / 60);
  $('offline-note').hidden = false;
  $('offline-note').textContent =
    STR.awayTitle + ' (' + (h ? h + ' h ' : '') + m + ' min): +' + fmt(offline.earned) +
    ' kr, ' + fmt(offline.delivered) + ' passengers delivered.';
  save();
}
showMenu('start');
updateUI();
requestAnimationFrame(frame);

// Debug handle for probes (_dev/); not part of the game surface.
window.__tb = {
  map,
  sim,
  render,
  get g() { return g; },
  get basemapUp() { return basemapUp; },
  closeMenu,
};
