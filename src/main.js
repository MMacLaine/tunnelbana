import * as sim from './sim.js';
import * as render from './render.js';
import { ANCHORS, CORRIDORS } from './data.js';
import { FACTS, NAMES } from './facts.js';

// UI copy interpolates from BAL and the CATALOG so a balance change can never
// make the interface lie.
const B = sim.BAL;
const CAT = Object.fromEntries(sim.CATALOG.map((u) => [u.id, u]));
const pct = (x) => Math.round(Math.abs(1 - x) * 100);
const FEEDBACK_TO_LABEL = 'matthew@maclaine.se';
const STR = {
  dispatch: 'AVGÅNG',
  dispatchSub: 'Dispatch a train',
  noIdle: 'All trains are out',
  // A short line, now that How to play carries the manual.
  hints: 'Drag a line end to build. Space rings the bell. Right-click an end to demolish. ' +
    'Esc for the menu; How to play explains the rest.',
  tiers: ['', 'Stop', 'Station', 'Hub'],
  tierUp: ['', 'Upgrade to Station', 'Upgrade to Hub', ''],
  tierMax: 'Hub, fully built',
  tierDown: 'Downgrade tier (no refund)',
  tierEraGate: 'Hubs unlock in 1957',
  upgRow: { ent: 'Entrances', gates: 'Gates', shop: 'Retail' },
  // What each station upgrade DOES, on hover (owner ask, 2026-08-07). The
  // numbers come from BAL so a balance change cannot make a tooltip lie.
  upgWhat: {
    ent: 'Wider catchment: more of the neighbourhood rides from here, and the lit circle on the map grows.',
    gates: 'Faster boarding: +' + B.gateRatePerLevel + ' passengers/s through the gates, so trains spend less time at this platform.',
    shop: 'Retail rent: +' + B.shopKrPerLevel + ' kr/s per level, scaled by this station’s footfall. Income even when no train runs.',
  },
  tierWhat: [
    '',
    'Station: wider catchment, quicker doors, ladders to ' + B.upgMaxByTier[2] + ', and two lines may share it.',
    'Knutpunkt: the widest catchment, the full ladders to ' + B.upgMaxByTier[3] + ', and it can found new lines.',
  ],
  panelDemand: 'Demand',
  panelWaiting: 'Waiting',
  panelCrowd: 'Crowding',
  panelUpkeep: 'Upkeep',
  panelTop: 'Passengers head for',
  lvl: 'lvl',
  foundBtn: 'Found a new line',
  linesHdr: 'Trains per line',
  // Fleet orders (0.9): the transfer verb was the most-missed mechanic in the
  // 0.8.2 feedback, so every state says what it does or why it will not.
  reqTrain: 'Bring a train here',
  sendTrain: 'Send a train to the line that needs it most',
  feeShort: 'Need ' + B.moveTrainKr + ' kr for a depot transfer',
  noSpareElsewhere: 'No other line can spare a train',
  noSpareHere: 'This line has no train to spare',
  queuedChip: 'moving…',
  queuedCancel: 'Transfer ordered · click to cancel and take the ' + B.moveTrainKr + ' kr back',
  transferHint: 'Depot transfer · ' + B.moveTrainKr + ' kr · a busy train moves when it next parks',
  aimTag: 'NEXT',
  aims: {
    open: 'Ring AVGÅNG to send your first train out. Space works too.',
    extend: 'Extend the line: drag its glowing end to the staked ring. Building is the game.',
    train: 'Buy a second train in the shop. One train cannot hold a headway alone.',
    drivers: 'Hire drivers: trains dispatch themselves, and the line earns while you build.',
    plan: 'Extend to',        // + the stake's name + corridor progress
    repair: 'Rebuild',        // a demolished plan stop blocks the era
    eraReady: 'The city is ready. Advance the era in the top-right panel.',
    trust: 'trust grows with coverage, so serve more of the city',
    riders: 'carry riders: longer lines, more trains',
    finale: 'Hela Stockholm: connect every remaining station on the map.',
    toward: 'Toward',
    toGo: 'to go',
  },
  mothballBtn: 'Mothball idle train',
  reactivateBtn: 'Reactivate train',
  mothballedFloat: 'mothballed',
  mothballedTag: 'mothballed',
  awayTitle: 'While you were away',
  coverage: 'coverage',
  phases: ['MORNING RUSH', '', 'EVENING RUSH', 'NIGHT'],
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
    needsTier2: 'A junction needs a Tier 2 station first',
    plan: 'The 1950 plan comes first · finish the line to build anywhere',
  },
  planRepair: 'needs repair',
  planDoneFloat: 'line complete',
  incidentName: 'SIGNALFEL',
  fixCrew: 'Send the repair crew',
  incidentOver: 'Signals restored',
  noteCity: 'STOCKHOLM',
  noteBoard: 'ON BOARD',
  notesOn: 'On',
  notesOff: 'Off',
  statLost: 'gave up waiting, ever',
  statLegend: 'riders/min in green, gross kr/s in grey · last two hours',
  statPeakWindow: 'best in this window',
  statNoData: 'The ledger fills as the network runs.',
  statBestMin: 'Best minute ever',
  statBestGross: 'Best income rate',
  statRush: 'Rush grades',
  statMoves: 'Depot transfers',
  statFixed: 'Incidents repaired',
  awayLed: 'led the night',
  newsContinue: 'Continue · the city keeps running →',
  newsTurnover: 'turned over',
  newsStationsOpen: 'stations open',
  newsStationsBuilt: 'stations built',
  newsRidersAll: 'riders, all told',
  newsPlayed: 'played',
  newsCity: 'Staden.',
  newsNext: 'Nästa.',
  freeUnlockedFloat: 'Build anywhere: the city approves your own stations',
  junction: 'Interchange',
  riders: 'riders',
  // 'pk' (political capital) read as jargon to the owner. The shop already
  // said "the city pays in trust", so the copy just caught up with itself.
  // The internal key stays `pk`: saves and the catalog do not need churning.
  trust: 'trust',
  krTitle: 'Swedish kronor (SEK)',
  ridersCarried: 'riders carried',
  perMin: '/min',
  everyS: 'every ',
  bellAuto: 'Automatic · every',
  unlocksIn: 'Unlocks in',
  need: 'Need',
  more: 'more',
  ownedLower: 'owned',
  openingDay: 'OPENING DAY',
  ribbonCut: 'The line is open',
  stops: 'stops',
  fbOpen: 'Feedback',
  menuBtn: 'Menu',
  railHide: 'Hide the upgrade rail',
  railShow: 'Show the upgrade rail',
  fbTitle: 'What broke, or what would you love?',
  fbHint: 'Goes straight to the person who made this.',
  fbSend: 'Submit',
  fbPlaceholder: 'Write anything: bugs, ideas, confusion...',
  fbSent: 'Sent. Thank you, genuinely.',
  fbThanks: 'Could not reach the server, so opening your email app instead.',
  fbCopied: 'Copied. Send it to ' + FEEDBACK_TO_LABEL + ' when you can.',
  fbManual: 'Could not send. Email ' + FEEDBACK_TO_LABEL + ' instead.',
  fbEmpty: 'Write something first.',
  mapDown: 'Basemap unavailable. Playing on the fallback map.',
  shop: {
    train:      { name: 'New train',         desc: 'One more train, on the emptiest line. Upkeep ' + B.upkeepPerTrainPerSec + ' kr/s.' },
    drivers:    { name: 'Hire drivers',      desc: 'Trains dispatch themselves. You can still ring the bell.' },
    timetable:  { name: 'Tighter timetable', desc: 'Departures run at even intervals on every line, and the signalling floor drops ' + pct(CAT.timetable.mult.dispatchInterval) + '%.' },
    capacity:   { name: 'Longer trains',     desc: '+' + CAT.capacity.add.trainCap + ' passengers per train.' },
    bogies:     { name: 'C1 bogie service',  desc: 'Top speed and acceleration up ' + pct(CAT.bogies.mult.speed) + '%; the open stretches quicken, the stops still take their time.' },
    turnstiles: { name: 'Turnstiles',        desc: 'Fares worth ' + pct(CAT.turnstiles.mult.fare) + '% more.' },
    stats:      { name: 'Statistics office', desc: 'Graphs, records and a ledger per line. Pays in knowing, not kronor.' },
    works:      { name: 'Works department',  desc: 'Bulk orders: raise entrances, gates or retail one level across every station in one click. The buttons appear in the Network panel.' },
    westline:   { name: 'Västerortsbanan',   desc: 'Megaproject: a second line from T-Centralen to Hötorget, with a train. The city pays in trust.' },
    redline:    { name: 'Röda linjen',       desc: 'Megaproject: charter the red line as a Söder shuttle, Mariatorget to Zinkensdamm, with a train. Connect it to your network your way; Fruängen waits at the far end.' },
    blueline:   { name: 'Blå linjen',        desc: 'Megaproject: charter the deep blue line, T-Centralen to Rådhuset, with a train. Hjulsta waits beyond Järvafältet.' },
    entrances:  { name: 'Extra entrances',   desc: 'Wider catchment: +' + Math.round(CAT.entrances.add.demand * 100) + '% demand everywhere, per level.' },
    through:    { name: 'Through-running',   desc: 'Megaproject: changing lines gets easier, so more of the city rides across them.' },
    stock1957:  { name: '1957 stock',        desc: 'Top speed and acceleration up ' + pct(CAT.stock1957.mult.speed) + '%; the open stretches quicken, the stops still take their time.' },
    c4stock:    { name: 'C4 stock',          desc: 'Top speed and acceleration up ' + pct(CAT.c4stock.mult.speed) + '%; the open stretches quicken, the stops still take their time.' },
    c14stock:   { name: 'C14 stock',         desc: 'Top speed and acceleration up ' + pct(CAT.c14stock.mult.speed) + '%; the open stretches quicken, the stops still take their time.' },
    zonefare:   { name: 'Zone fares',        desc: 'Fares worth ' + pct(CAT.zonefare.mult.fare) + '% more.' },
    atc:        { name: 'ATC holding',       desc: 'Comfort: trains stop bunching onto each other. You can watch it work.' },
    artstation: { name: 'Konst i tunnelbanan', desc: 'Art in the stations: +' + Math.round(CAT.artstation.add.demand * 100) + '% demand everywhere. The world\'s longest gallery.' },
    cbtc:       { name: 'CBTC signalling',   desc: 'Moving-block signalling: trains brake later and run ' + pct(CAT.cbtc.mult.speed) + '% harder, and the signalling floor drops ' + pct(CAT.cbtc.mult.dispatchInterval) + '%.' },
    nightservice: { name: 'Nattrafik',       desc: 'The city never fully sleeps: night demand doubled.' },
  },
  eras: {
    1952: { title: '1952 · Västerort', blurb: 'The city looks west. Hötorget opens the door toward Vällingby, and Stockholm learns what a network is.' },
    1957: { title: '1957 · Genom staden', blurb: 'Through-running arrives. The lines stop being lines and start being a system.' },
    1964: { title: '1964 · Röda linjen', blurb: 'A second colour on the map. The red line digs south through Söder toward Fruängen, and east under Östermalm.' },
    1975: { title: '1975 · Blå linjen', blurb: 'The deep line. Blue tunnels run northwest over Järvafältet, and the Miljonprogrammet suburbs get their trains.' },
    2000: { title: '2000 · Hela Stockholm', blurb: 'The story has caught up with the map. From here the city is yours: build any line, anywhere, as many as you like.' },
  },
  advance: 'Advance to',
  advanceNeeds: 'Needs',
  eraNow: 'Era',
  arcDone: 'The arc is complete, for now.',
  linesStat: 'Lines',
  ending: {
    title: 'SLUTSTATION',
    blurb: 'Slutstation is the word Stockholm paints on the end of a line. ' +
      'Every station on the map has one now, and the arc from 1950 is complete. ' +
      'This is the end of the story, and the trains keep running: your city does not stop because the chapter does.',
  },
  themeRow: 'Theme',
  numRow: 'Numbers',
  achEarned: 'ACHIEVEMENT',
  achToastMore: 'CLICK TO SEE THEM ALL',
  migrated: 'Save updated for this version: stations now take deeper upgrades ' +
    '(a Station holds more than a Hållplats), retail is new, and the era targets moved. ' +
    'Nothing was lost.',
  bonusName: { fare: 'fares', demand: 'demand', transfer: 'transfers', dispatchInterval: 'dispatch' },
  about: 'about',
  trustFrom: 'trust grows with coverage',
  trustCapped: 'at ceiling',
  numShort: 'Short (1.2M)',
  numFull: 'Full digits',
  buyRow: 'Buy',
  deeperNeedsTier: 'upgrade the station for more',
  deeperNeedsEra: 'deeper from',
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

// itch serves the game from a sandboxed cross-origin iframe, where Safari and
// Firefox privacy modes throw on storage access. A throw here would abort the
// module and the player would get a black page, so every access is guarded and
// falls back to memory (the session still plays; it just cannot persist).
const memStore = new Map();
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return memStore.has(k) ? memStore.get(k) : null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { memStore.set(k, v); } },
  del(k) { try { localStorage.removeItem(k); } catch { memStore.delete(k); } },
};

// --- Version handshake -------------------------------------------------------
// A browser can hold a cached module alongside a newer page. The page states
// which build it expects; if this module is a different one, reload ONCE (a
// session flag prevents a loop) so the player never plays a half-updated game.
{
  const want = document.querySelector('meta[name="tb-version"]')?.content;
  if (want && want !== sim.VERSION) {
    // The "already tried" marker lives in the URL, not in storage: a privacy
    // mode that refuses sessionStorage would otherwise never record the attempt
    // and the page would reload forever, which is far worse than the bug this
    // guard exists to fix.
    const tried = new URLSearchParams(location.search).get('v') === want;
    const boot = document.getElementById('boot');
    if (boot) boot.textContent = 'Updating…';
    if (!tried) {
      // Cache-busted query so the reload cannot be served the same stale copy.
      location.replace(location.pathname + '?v=' + encodeURIComponent(want));
      throw new Error('reloading for ' + want);   // stop this stale module here
    }
    // Second time through: reloading did not help, so say so rather than
    // silently running a mismatched build.
    if (boot) {
      boot.textContent = 'This page expects v' + want + ' but loaded v' + sim.VERSION +
        '. Please empty your cache and reload.';
    }
  }
}

const savedRaw = store.get(sim.SAVE_KEY);
let g = sim.hydrate(savedRaw);
let offline = null;
try {
  const sv = JSON.parse(savedRaw);
  if (sv && typeof sv.savedAt === 'number') {
    offline = sim.simulateOffline(g, (Date.now() - sv.savedAt) / 1000);
  }
} catch {}
let paused = true; // boot into the menu

// If the save came from an older build, say so once in the menu. v0.8.0 changed
// what some saved numbers mean (station ladders went from three flat levels to
// eight gated by tier, retail is new, era thresholds moved), so a returning
// player sees room reappear on upgrades they had "finished". That is the
// migration working, not a bug, and the game should say which.
const migratedFrom = g.migratedFrom;

const $ = (id) => document.getElementById(id);
const NUMFMT_KEY = 'tunnelbana_numfmt';
let numShort = store.get(NUMFMT_KEY) !== 'full';
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
const grouped = (n) => Math.floor(n).toLocaleString('sv-SE').replace(/\s/g, '\u2009');
function fmt(n) {
  n = Math.floor(n);
  if (!numShort || n < 1e5) return grouped(n);
  if (!isFinite(n)) return '∞';
  let v = n, i = 0;
  // 999.5 not 1000: rounding to zero decimals at three digits otherwise prints
  // "1000K" instead of rolling over to "1.00M".
  while (v >= 999.5 && i < SUFFIX.length - 1) { v /= 1000; i++; }
  return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0)) + SUFFIX[i];
}
// Pass 02, section 02: the unit gets its own dimmer span so the value reads
// as the value, and thousands group with a thin space, never a comma.
const kr = (n) => grouped(n);
const numHTML = (n, unit) => fmt(n) + '<span class="tb-num__unit">' + unit + '</span>';

// --- Theme (light mode is a testing aid; dark is the designed theme) ---
const THEME_KEY = 'tunnelbana_theme';
const NIGHT_STYLE = 'basemap/tunnelbana-night.json';
const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const urlTheme = new URLSearchParams(location.search).get('theme');
let theme = (urlTheme || store.get(THEME_KEY)) === 'light' ? 'light' : 'dark';

function applyTheme(next) {
  theme = next;
  store.set(THEME_KEY, theme);
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
        topGameLayer();
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
  // Hand projection back to the static fallback, or the game keeps asking a map
  // that never loaded where things are.
  map = null;
  render.setProjector(null);
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
    map.on('load', () => { map.addLayer(gameLayer()); topGameLayer(); });
    // Any later change to the style's layer list (sprites, deferred sources,
    // a theme swap) can leave the game underneath. Re-top it whenever the
    // stack changes: cheap, idempotent, and it cannot be forgotten.
    map.on('styledata', topGameLayer);
    setTimeout(() => { if (!basemapUp) basemapFailed(); }, 8000);
  } catch {
    map = null; // no WebGL: the static fallback projector still renders the game
    basemapFailed();
  }
} else {
  basemapFailed();
}

// Keep the game above every basemap layer, including the label layers that
// ship with the light basemap (the authored night style has none by design).
function topGameLayer() {
  if (!map || !map.getLayer || !map.getLayer('tb-game')) return;
  const layers = map.getStyle && map.getStyle().layers;
  if (layers && layers[layers.length - 1] && layers[layers.length - 1].id === 'tb-game') return;
  try { map.moveLayer('tb-game'); } catch {}
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
  return store.get(sim.SAVE_KEY) !== null;
}
function menuView(which) {
  $('main-view').hidden = which !== 'main';
  $('settings-view').hidden = which !== 'settings';
  $('about-view').hidden = which !== 'about';
  $('help-view').hidden = which !== 'help';
  $('ach-view').hidden = which !== 'ach';
  $('stats-view').hidden = which !== 'stats';
  if (which === 'ach') renderAchievements();
  if (which === 'stats') renderStats();
  if (which === 'help') renderIconKey();
  if (which === 'settings') {
    $('settings-reset').textContent = STR.reset;
    $('settings-theme').textContent = theme === 'light' ? STR.themeLight : STR.themeDark;
    $('settings-numfmt').textContent = numShort ? STR.numShort : STR.numFull;
    $('settings-notes').textContent = notesOn ? STR.notesOn : STR.notesOff;
    $('settings-export').textContent = STR.exportBtn;
    $('settings-import').textContent = STR.importBtn;
    $('import-text').hidden = true;
  }
}
function settingsView(on) {
  menuView(on ? 'settings' : 'main');
}
function showMenu(mode) {
  paused = true;
  menu.hidden = false;
  $('menu-stats').hidden = !g.owned.stats; // the office opens once it is bought
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
$('menu-about').addEventListener('click', () => menuView('about'));
$('about-back').addEventListener('click', () => menuView('main'));
$('menu-help').addEventListener('click', () => menuView('help'));
$('menu-ach').addEventListener('click', () => menuView('ach'));
$('menu-stats').addEventListener('click', () => menuView('stats'));
$('stats-back').addEventListener('click', () => menuView('main'));
$('ach-back').addEventListener('click', () => menuView('main'));
$('help-back').addEventListener('click', () => menuView('main'));
$('about-mark').addEventListener('click', () => {
  if (menu.hidden) showMenu('pause');
  menuView('about');
});

// --- Feedback (owner ask, 2026-08-04). Collection is undecided; v1 copies a
// structured note (with game context) to the clipboard for the itch comments.
// submitFeedback() is the swap point: route it at a form or endpoint later
// without touching the UI.
$('fb-open').textContent = STR.fbOpen;
$('menu-open').textContent = STR.menuBtn;

// Rail collapse, remembered between sessions: a second-monitor player who wants
// the map may want it every time.
const RAIL_KEY = 'tunnelbana_rail';
function setRail(hidden) {
  document.body.classList.toggle('rail-hidden', hidden);
  const t = $('rail-toggle');
  t.textContent = hidden ? '‹' : '›';
  t.setAttribute('aria-expanded', hidden ? 'false' : 'true');
  t.setAttribute('aria-label', hidden ? STR.railShow : STR.railHide);
  store.set(RAIL_KEY, hidden ? 'hidden' : 'shown');
}
$('rail-toggle').addEventListener('click', () => {
  setRail(!document.body.classList.contains('rail-hidden'));
});
setRail(store.get(RAIL_KEY) === 'hidden');
$('menu-open').addEventListener('click', () => {
  if (menu.hidden) showMenu('pause');
  else closeMenu();
});
// From the menu: close it and open the feedback box, so the player who paused
// to look for it lands in the right place.
$('menu-feedback').addEventListener('click', () => {
  closeMenu();
  $('fb-panel').hidden = false;
  $('fb-note').textContent = STR.fbHint;
  $('fb-text').focus();
});
$('fb-title').textContent = STR.fbTitle;
$('fb-send').textContent = STR.fbSend;
$('fb-text').placeholder = STR.fbPlaceholder;
document.querySelectorAll('[data-version]').forEach((el) => { el.textContent = 'v' + sim.VERSION; });
$('fb-note').textContent = STR.fbHint;
$('fb-open').addEventListener('click', () => {
  const p = $('fb-panel');
  p.hidden = !p.hidden;
  $('fb-note').textContent = STR.fbHint;
  if (!p.hidden) $('fb-text').focus();
});
$('fb-close').addEventListener('click', () => { $('fb-panel').hidden = true; });
const FEEDBACK_TO = 'matthew@maclaine.se';
// Own infrastructure, no third party: a Pages Function on maclaine.se stores
// the note (functions/api/feedback.js in the site repo). One click, no mail
// client, nothing leaves the owner's own Cloudflare account.
const FEEDBACK_URL = 'https://maclaine.se/api/feedback';

// Falls back to the mail path if the endpoint is unreachable (offline, or an
// itch build older than the deploy), because a submit button that silently
// eats what someone bothered to type is the worst outcome available.
async function submitFeedback(text) {
  const ctx = 'v' + sim.VERSION + ' · era ' + sim.eraYear(g) + ' · ' + sim.stationCount(g) +
    ' stations · ' + sim.CATALOG.filter((i) => g.owned[i.id]).length + ' upgrades';
  try {
    const res = await fetch(FEEDBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ctx }),
    });
    if (res.ok) return 'sent';
  } catch {}
  return mailFallback(text, ctx);
}

function mailFallback(text, ctx) {
  const body = text + '\n\n---\nTunnelbana · ' + ctx;
  let copied = false;
  try {
    navigator.clipboard.writeText(body);
    copied = true;
  } catch {}
  try {
    const a = document.createElement('a');
    a.href = 'mailto:' + FEEDBACK_TO +
      '?subject=' + encodeURIComponent('feedback') +
      '&body=' + encodeURIComponent(body);
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // The anchor click is frequently blocked in a sandboxed frame and there is
    // no way to detect it, so claim only the copy, which did happen.
    return copied ? 'copied' : 'mail';
  } catch {
    return copied ? 'copied' : false;
  }
}
$('fb-send').addEventListener('click', async () => {
  const text = $('fb-text').value.trim();
  if (!text) { $('fb-note').textContent = STR.fbEmpty; return; }
  const how = await submitFeedback(text);
  $('fb-note').textContent = how === 'sent' ? STR.fbSent
    : how === 'mail' ? STR.fbThanks
    : how === 'copied' ? STR.fbCopied : STR.fbManual;
  if (how) $('fb-text').value = '';
});
$('settings-back').addEventListener('click', () => settingsView(false));
$('menu-quit').addEventListener('click', () => {
  save();
  showMenu('start');
});
$('settings-numfmt').addEventListener('click', () => {
  numShort = !numShort;
  store.set(NUMFMT_KEY, numShort ? 'short' : 'full');
  $('settings-numfmt').textContent = numShort ? STR.numShort : STR.numFull;
  updateUI();
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
  store.del(sim.SAVE_KEY);
  g = sim.hydrate(null);
  updateUI();
  homeCamera();
  settingsView(false);
  showMenu('start');
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (menu.hidden) showMenu('pause');
    else if (!$('settings-view').hidden || !$('about-view').hidden || !$('help-view').hidden ||
             !$('ach-view').hidden || !$('stats-view').hidden) menuView('main');
    else closeMenu();
  }
});

// --- Era moments: FRONT PAGES (pass 03 section a). One template, six
// datasets; the copy is the design team's, verbatim; the NUMBERS are live,
// which is the whole point: the paper reports the reader's own railway. ---
const ERA_NEWS = {
  1952: { era: 'var(--tb-era-1952)', date: 'STOCKHOLM · 26 OKTOBER 1952', kicker: 'VÄSTERORT', ed: 'SÖNDAGSUPPLAGA', price: '20 ÖRE',
    head: 'Tunnelbanan når västerut mot Vällingby',
    lede: 'The first branch strikes west this week, out toward the new suburbs, and the map grows a second arm. The reader’s network already carries a city that was walking a year ago.',
    next: 'Plans stir to join the lines through the centre. The city watches T-Centralen.' },
  1957: { era: 'var(--tb-era-1957)', date: 'STOCKHOLM · 24 NOVEMBER 1957', kicker: 'GENOM STADEN', ed: 'SÖNDAGSUPPLAGA', price: '25 ÖRE',
    head: 'The line reaches under the water to T-Centralen',
    lede: 'Stockholm’s underground crossed the water this morning, and the whole city is now one ride from the centre. Norrmalm opens to building, every fare across the water is worth more, and the network the reader has built stands at the figures below.',
    next: 'A second colour is drawn in committee. Röda linjen is spoken of, south toward Fruängen.' },
  1964: { era: 'var(--tb-era-1964)', date: 'STOCKHOLM · 5 APRIL 1964', kicker: 'RÖDA LINJEN', ed: 'SÖNDAGSUPPLAGA', price: '30 ÖRE',
    head: 'A second colour on the map: the red line opens south',
    lede: 'The red line runs today from the centre toward Fruängen, and for the first time the diagram needs two colours to explain itself. The city the reader is building has become a network, not a line.',
    next: 'Deep boring is proposed under Järvafältet. A blue line, they are calling it.' },
  1975: { era: 'var(--tb-era-1975)', date: 'STOCKHOLM · 31 AUGUSTI 1975', kicker: 'BLÅ LINJEN', ed: 'SÖNDAGSUPPLAGA', price: '75 ÖRE',
    head: 'The blue line opens under Järvafältet',
    lede: 'A third colour reaches the northwest suburbs today, deep-bored and blasted through rock, its stations left as raw cave. Three lines now thread the centre, and the reader’s map looks like a city’s.',
    next: 'The plan nears its last page. What comes after the plan is the reader’s to decide.' },
  2000: { era: 'var(--tb-era-2000)', date: 'STOCKHOLM · 1 JANUARI 2000', kicker: 'STADEN', ed: 'MILLENNIEUPPLAGA', price: '10 KRONOR',
    head: 'A new century rides the network you built',
    lede: 'Every constraint is gone; the plan is complete and the city is yours to shape freely. The whole map is lit, every station on it connected, and the reader is free to build for its own sake.',
    next: 'There is no next page in the plan. There is the map, and the reader.' },
  slut: { era: 'var(--tb-era-2000)', date: 'STOCKHOLM · SLUTSTATION', kicker: 'SLUTSTATION', ed: 'SISTA UPPLAGAN', price: 'TACK',
    head: 'The arc completes: 1950 to now, one continuous ride',
    lede: 'Nothing stops. The trains keep running, the fares keep landing, and the city keeps the light you gave it. This is the last front page the paper will print, and it is about the reader.',
    next: 'The trains keep running.' },
};

// The motif: the network so far, recoloured to the era (design team's
// representative cut; a live-network drawing is a later refinement).
function newsMotif(era) {
  return '<rect width="200" height="134" fill="var(--tb-panel)"></rect>' +
    '<g stroke="var(--tb-line)" stroke-width="1" opacity="0.5"><path d="M0 45h200M0 90h200M60 0v134M130 0v134"></path></g>' +
    '<path d="M40 118 L70 84 L96 60 L120 36 L150 20" fill="none" stroke="' + era + '" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"></path>' +
    '<g fill="var(--tb-panel)" stroke="var(--tb-ink)" stroke-width="2.4"><circle cx="40" cy="118" r="4.5"></circle><circle cx="70" cy="84" r="4.5"></circle><circle cx="96" cy="60" r="4.5"></circle><circle cx="120" cy="36" r="4.5"></circle><circle cx="150" cy="20" r="5.5"></circle></g>';
}

let momentOpen = false;
function showFrontPage(key) {
  const e = ERA_NEWS[key];
  if (!e) return;
  momentOpen = true;
  const n = $('news');
  n.style.setProperty('--tb-era', e.era);
  $('news-ed').textContent = e.ed;
  $('news-date').textContent = e.date;
  $('news-price').textContent = e.price;
  $('news-kicker').textContent = e.kicker;
  $('news-headline').textContent = e.head;
  $('news-lede').textContent = e.lede;
  $('news-motif').innerHTML = newsMotif(e.era);
  const slut = key === 'slut';
  $('news-s1').textContent = fmt(g.totalDelivered);
  $('news-s1k').textContent = slut ? STR.newsRidersAll : STR.ridersCarried;
  $('news-s2').textContent = String(sim.stationCount(g));
  $('news-s2k').textContent = slut ? STR.newsStationsBuilt : STR.newsStationsOpen;
  if (slut) {
    const h = Math.floor(g.playedS / 3600), m = Math.floor((g.playedS % 3600) / 60);
    $('news-s3').textContent = h + ' h ' + m + ' m';
    $('news-s3k').textContent = STR.newsPlayed;
  } else {
    $('news-s3').innerHTML = numHTML(g.grossLife, ' kr');
    $('news-s3k').textContent = STR.newsTurnover;
  }
  // The foot: the city's own words (the old era blurbs), and what stirs next.
  const blurb = slut ? STR.ending.blurb : (STR.eras[key] ? STR.eras[key].blurb : '');
  $('news-foot1').innerHTML = '<b style="color:var(--tb-ink);font-weight:400">' + STR.newsCity + '</b> ';
  $('news-foot1').append(blurb);
  $('news-foot2').innerHTML = '<b style="color:var(--tb-ink);font-weight:400">' + STR.newsNext + '</b> ';
  $('news-foot2').append(e.next);
  $('moment').hidden = false;
  save();
}
function showMoment(year) {
  showFrontPage(year);
}
function showEnding() {
  showFrontPage('slut');
}
$('moment-close').textContent = STR.newsContinue;
$('moment-close').addEventListener('click', () => {
  momentOpen = false;
  $('moment').hidden = true;
});
$('era-btn').addEventListener('click', () => {
  if (sim.advanceEra(g)) updateUI();
});

// --- Bell ---
const bell = $('bell');
bell.querySelector('.tb-bell__t').textContent = STR.dispatch;
function ringBell() {
  if (paused) return;
  if (sim.dispatch(g)) {
    bell.classList.remove('is-rung');
    void bell.offsetWidth; // restart the animation
    bell.classList.add('is-rung');
  }
}
bell.addEventListener('click', ringBell);
window.addEventListener('keydown', (e) => {
  // Typing space in a text field must never ring the bell (feedback box,
  // save import).
  const tag = e.target && e.target.tagName;
  if (tag === 'TEXTAREA' || tag === 'INPUT') return;
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
  const problem = sim.placementProblem(g, dragRef.li, dragRef.end, geo, snap);
  let label = !problem || problem === 'money'
    ? (problem === 'money' ? STR.problems.money + ' ' : '') + fmt(cost) + ' kr'
    : STR.problems[problem];
  const junction = sim.junctionPreview(g, dragRef.li, geo);
  if (junction && (!problem || problem === 'money')) {
    // Landing on another line's station: this extension shares it.
    label += ' · ' + STR.junction + ' ' + junction.name;
  } else if (snap === null && (!problem || problem === 'money')) {
    // A free spot must say what it is worth, not just what it costs.
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
  // A curiosity outranks the station under it: the diamond is small, and
  // clicking it is the whole find.
  const eggId = render.nearEgg(g, p);
  if (eggId) {
    const egg = sim.foundEgg(g, eggId);
    if (egg) {
      showNote(STR.noteCity, egg.fact);
      updateUI();
    }
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
    dragRef = options.find((o) => !sim.placementProblem(g, o.li, o.end, ANCHORS[a].geo, a)) || options[0];
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
  e.preventDefault();   // never surrender the right-click to the browser here
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
  const lvl = st[kind];
  // The cap the player is up against NOW (tier and era), not the structural
  // one: a ladder reading 1/8 while refusing level 2 is a bug report waiting to
  // be filed. Why it stops there goes on the button.
  const cap = sim.upgCapFor(g, st);
  const room = cap - lvl;
  // Same contract as the shop: buy what is affordable up to the quantity, so a
  // x10 selection never disables a ladder the player could still climb.
  const aff = sim.stationAffordableLevels(g, selected.li, selected.i, kind,
    buyQty === Infinity ? 0 : buyQty);
  const n = room <= 0 ? 0 : Math.max(1, Math.min(aff || 1, room));
  const cost = sim.stationBulkCost(g, selected.li, selected.i, kind, n);
  btn.textContent = STR.upgRow[kind] +
    ' ' + STR.lvl + ' ' + lvl + '/' + cap +
    (room <= 0 ? '' : ' · ' + (n > 1 ? '×' + n + ' ' : '') + kr(cost) + ' kr');
  // A capped ladder says why, so "disabled" is information (pass 02, §03),
  // and hover says what the level actually buys (owner ask, 2026-08-07).
  btn.title = STR.upgWhat[kind];
  btn.disabled = room <= 0 || g.money < cost;
  const why = sim.upgCapReason(g, st, lvl);
  if (why === 'era') {
    const next = sim.nextEra(g);
    btn.textContent += ' · ' + STR.deeperNeedsEra + (next ? ' ' + next.year : '');
  } else if (why === 'tier') {
    btn.textContent += ' · ' + STR.deeperNeedsTier;
  }
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
  // One row per fact (pass 02, section 04: label left, value right).
  const row = (k, v, cls) =>
    '<div class="tb-row">' + k + '<span class="tb-row__v' + (cls ? ' ' + cls : '') + '">' + v + '</span></div>';
  $('sp-stats').innerHTML =
    row(STR.panelDemand, st.mult.toFixed(2) + '×') +
    row(STR.panelWaiting, waiting) +
    row(STR.panelCrowd, crowd + '%', crowd >= 60 ? 'tb-row__v--down' : '') +
    row(STR.panelUpkeep, upk + ' kr/s');
  // Where this platform's crowd wants to go (read from the OD weights).
  const dirs = sim.odWeights(g, selected.li, selected.i);
  $('sp-dest').innerHTML = dirs.length
    ? STR.panelTop + '<span class="tb-row__v">' +
      dirs.map((d) => d.name + ' ' + Math.round(d.share * 100) + '%').join(' · ') + '</span>'
    : '';
  const tierBtn = $('sp-tier-btn');
  tierBtn.title = st.tier >= 3 ? '' : STR.tierWhat[st.tier];
  if (st.tier >= 3) {
    tierBtn.textContent = STR.tierMax;
    tierBtn.disabled = true;
  } else {
    const cost = sim.upgradeCost(g, selected.li, selected.i, 'tier');
    const gated = st.tier === 2 && sim.eraYear(g) < B.tier3Era;
    tierBtn.textContent = gated
      ? STR.tierEraGate
      : STR.tierUp[st.tier] + ' · ' + fmt(cost.kr) + ' kr' + (cost.pk ? ' + ' + cost.pk + ' ' + STR.trust : '');
    tierBtn.disabled = !sim.canUpgradeStation(g, selected.li, selected.i, 'tier');
  }
  stationUpgRow('ent');
  stationUpgRow('gates');
  stationUpgRow('shop');
  const db = $('sp-down');
  db.hidden = !sim.canDowngradeTier(g, selected.li, selected.i);
  db.textContent = STR.tierDown;
  const fb = $('sp-found');
  const showFound = st.tier >= 3;
  fb.hidden = !showFound;
  if (showFound) {
    fb.textContent = STR.foundBtn + ' · ' + fmt(B.foundLineKr) + ' kr + ' + B.foundLinePk + ' ' + STR.trust;
    fb.disabled = !sim.canFoundLine(g, selected.li, selected.i);
  }
  // A signal failure here: the repair crew is one click and real money.
  const fixB = $('sp-fix');
  const broken = sim.incidentAt(g, selected.li, selected.i);
  fixB.hidden = !broken;
  if (broken) {
    const fixCost = sim.incidentFixCost(g);
    fixB.textContent = STR.fixCrew + ' · ' + fmt(fixCost) + ' kr';
    fixB.disabled = g.money < fixCost;
  }
  // Left behind per minute: the headline diagnostic (abandonment).
  const left = Math.round(L.left60[selected.i] * 60);
  const lb = $('sp-left');
  lb.textContent = left > 0 ? 'Left behind: ' + fmt(left) + '/min' : '';
  lb.hidden = left <= 0;
}

for (const kind of ['tier', 'ent', 'gates', 'shop']) {
  $('sp-' + (kind === 'tier' ? 'tier-btn' : kind)).addEventListener('click', () => {
    if (!selected) return;
    const n = kind === 'tier' ? 1 : (buyQty === Infinity ? 0 : buyQty);
    if (sim.upgradeStationN(g, selected.li, selected.i, kind, n) > 0) updateUI();
  });
}
$('sp-close').addEventListener('click', () => selectStation(null));
$('sp-fix').addEventListener('click', () => {
  if (sim.fixIncident(g)) updateUI();
});
$('sp-down').addEventListener('click', () => {
  if (selected && sim.downgradeTier(g, selected.li, selected.i)) updateUI();
});
$('sp-found').addEventListener('click', () => {
  if (selected && sim.foundLine(g, selected.li, selected.i)) {
    selectStation(null);
    updateUI();
  }
});

// Per-line fleet rows (player-controlled, report 634 risk 3; rebuilt 0.9).
// POINTERDOWN, not click: these rows are re-rendered when their numbers move,
// and a click whose press and release straddle a re-render dispatches to the
// container instead of the button, so the old + button genuinely "did
// nothing" some of the time (live report, 2026-08-07). Pointerdown fires
// before any re-render can replace the node under the pointer.
$('line-rows').addEventListener('pointerdown', (e) => {
  const d = e.target?.dataset || {};
  if (d.req !== undefined && sim.requestTrain(g, Number(d.req))) updateUI();
  if (d.send !== undefined && sim.sendTrain(g, Number(d.send))) updateUI();
  if (d.cancel !== undefined && sim.cancelMove(g, Number(d.cancel))) updateUI();
  if (d.bulk !== undefined && sim.bulkUpgrade(g, d.bulk) > 0) updateUI();
  // Clicking a line's name finds it: the map flies to its first stop and
  // selects it, so "which one is that on the map" has an answer (owner,
  // 2026-08-04: a chartered line was hard to locate at all).
  if (d.focus !== undefined) {
    const L = g.lines[Number(d.focus)];
    if (L && L.stations.length) {
      selectStation({ li: Number(d.focus), i: 0 });
      if (map) map.easeTo({ center: [L.stations[0].geo[1], L.stations[0].geo[0]], duration: 600 });
      updateUI();
    }
  }
});

let lineRowsHTML = '';   // rebuild only on change: fewer re-renders, fewer eaten presses
function updateLineRows() {
  const rows = [];
  const fee = B.moveTrainKr;
  for (let li = 0; li < g.lines.length; li++) {
    const active = g.trains.filter((t) => t.line === li && !t.mothballed).length;
    const q = sim.queuedMoves(g, li);
    const spareElsewhere = g.lines.some((_, l2) => l2 !== li && sim.spareTrains(g, l2) >= 1);
    const canReq = g.money >= fee && spareElsewhere;
    const canSend = g.money >= fee && sim.spareTrains(g, li) >= 1;
    // Disabled is information: the tooltip names the shortfall (pass 02, §03).
    const reqWhy = !spareElsewhere ? STR.noSpareElsewhere
      : g.money < fee ? STR.feeShort : STR.reqTrain + ' · ' + fee + ' kr';
    const sendWhy = sim.spareTrains(g, li) < 1 ? STR.noSpareHere
      : g.money < fee ? STR.feeShort : STR.sendTrain + ' · ' + fee + ' kr';
    const qChip = (q.in || q.out)
      ? ' <button class="tb-linkbtn" data-cancel="' + li + '" title="' + STR.queuedCancel + '"' +
        ' style="color: var(--tb-amber)">' + (q.in ? '+' + q.in : '') + (q.out ? '−' + q.out : '') + '…</button>'
      : '';
    rows.push(
      '<div class="tb-row"><span class="tb-chip" style="background:' + g.lines[li].color + '"></span>' +
      '<button class="tb-linkbtn" data-focus="' + li + '">' + g.lines[li].name + '</button>' +
      '<span class="tb-row__v">' + g.lines[li].stations.length + ' ' + STR.stops + ' · ' +
      active + ' 🚆' + qChip + ' · ' + (active ? Math.round(sim.lineHeadwayS(g, li)) + ' s' : '—') + '</span>' +
      (g.lines.length > 1
        ? '<button class="tb-btn tb-btn--inline" data-send="' + li + '" title="' + sendWhy + '"' +
          (canSend ? '' : ' disabled') + '>−</button>' +
          '<button class="tb-btn tb-btn--inline" data-req="' + li + '" title="' + reqWhy + '"' +
          (canReq ? '' : ' disabled') + '>+</button>'
        : '') +
      '</div>'
    );
  }
  if (g.lines.length > 1) {
    rows.push('<div class="tb-row" style="color: var(--tb-ghost); font-size: var(--tb-fs-caption)">' +
      STR.transferHint + '</div>');
  }
  // The works department's bulk orders live under the line rows: one click,
  // one level of an axis across every station that can take it.
  if (g.owned.works) {
    for (const kind of ['ent', 'gates', 'shop']) {
      const b = sim.bulkUpgradeCost(g, kind);
      if (!b.n) continue;
      rows.push(
        '<div class="tb-row"><span>' + STR.upgRow[kind] + ' +1 × ' + b.n + '</span>' +
        '<button class="tb-btn tb-btn--inline" data-bulk="' + kind + '" title="' + STR.upgWhat[kind] + '"' +
        (g.money >= b.kr ? '' : ' disabled') + '>' + kr(b.kr) + ' kr</button></div>'
      );
    }
  }
  const html = rows.join('');
  if (html !== lineRowsHTML) {
    lineRowsHTML = html;
    $('line-rows').innerHTML = html;
  }
}

// --- City notes: a fact about the real Stockholm, or a postcard from one
// journey the sim is actually carrying, every couple of minutes. Ambience,
// not information: one at a time, click to dismiss, off in Settings. Facts
// advance through the list across sessions so nobody rereads note 1. ---
const NOTES_KEY = 'tunnelbana_notes';
const FACT_KEY = 'tunnelbana_factidx';
const NOTE_EVERY = 120;   // game-seconds between notes
let notesOn = store.get(NOTES_KEY) !== 'off';
let factIdx = Number(store.get(FACT_KEY)) || 0;
let lastNoteAt = 0;
let noteKind = 0;
let noteN = 3;
let noteShownAt = 0;

function showNote(tag, text) {
  $('fact-tag').textContent = tag;
  $('fact-text').textContent = text;
  $('fact-toast').hidden = false;
  noteShownAt = performance.now();
}
$('fact-toast').addEventListener('click', () => {
  $('fact-toast').hidden = true;
  noteShownAt = 0;
});
$('settings-notes').addEventListener('click', () => {
  notesOn = !notesOn;
  store.set(NOTES_KEY, notesOn ? 'on' : 'off');
  $('settings-notes').textContent = notesOn ? STR.notesOn : STR.notesOff;
  if (!notesOn) $('fact-toast').hidden = true;
});

function maybeNote() {
  if (noteShownAt && performance.now() - noteShownAt > 11000) {
    $('fact-toast').hidden = true;
    noteShownAt = 0;
  }
  if (!notesOn || !g.opened || paused || momentOpen) return;
  if (!$('fact-toast').hidden || g.clock - lastNoteAt < NOTE_EVERY) return;
  lastNoteAt = g.clock;
  noteKind ^= 1;
  if (noteKind) {
    noteN = (noteN + 13) % 9973;
    const pc = sim.postcard(g, noteN);
    if (pc) showNote(STR.noteBoard, NAMES[noteN % NAMES.length] + ' · ' + pc.from + ' → ' + pc.to + ' · ' + pc.km + ' km');
  } else {
    showNote(STR.noteCity, FACTS[factIdx % FACTS.length]);
    factIdx++;
    store.set(FACT_KEY, String(factIdx));
  }
}

// --- The aims strip: one standing suggestion, read from sim state so it can
// never contradict the board or get stuck waiting on a scripted step. It walks
// a new player through the loop (dispatch, extend, fleet, drivers), then
// becomes the era objective with live numbers. Dismissable, and the dismissal
// is remembered: it is a tutorial, not a nag. ---
const AIM_KEY = 'tunnelbana_aims';
let aimsHidden = store.get(AIM_KEY) === 'hidden';
$('aim-tag').textContent = STR.aimTag;
$('aim-close').addEventListener('click', () => {
  aimsHidden = true;
  store.set(AIM_KEY, 'hidden');
  $('aim-panel').hidden = true;
});

function aimText() {
  if (!g.opened) return STR.aims.open;
  // Fleet SIZE, not purchases: a chartered line's gift train counts too.
  if (g.trains.length < 2) return STR.aims.train;
  if (!g.owned.drivers) return STR.aims.drivers;
  // The plan: name the actual stake, not a genre of action. "Extend to
  // Medborgarplatsen · Söderort 3/13" is a map instruction; "extend the
  // line" was a rule the stalled players never picked up.
  const plan = sim.planBlockers(g);
  if (plan.length) {
    const b = plan[0];
    const c = CORRIDORS.find((x) => x.id === b.id);
    const k = c ? sim.nextStakeOf(g, c) : null;
    if (k !== null) {
      return (b.repair ? STR.aims.repair : STR.aims.plan) + ' ' + ANCHORS[k].name +
        ' · ' + b.name + ' ' + b.built + '/' + b.total +
        (b.repair ? ' · ' + STR.planRepair : '');
    }
  }
  if (sim.stationCount(g) < 6) return STR.aims.extend;
  if (sim.canAdvanceEra(g)) return STR.aims.eraReady;
  const next = sim.nextEra(g);
  if (next) {
    const needR = Math.max(0, next.delivered - g.totalDelivered);
    const needP = Math.max(0, next.pk - g.pk);
    const bits = [];
    if (needR > 0) bits.push(fmt(needR) + ' ' + STR.riders);
    if (needP > 0.05) bits.push(needP.toFixed(1) + ' ' + STR.trust);
    // Name the binding constraint, so "wait" always comes with a lever.
    const lever = needR > 0 ? STR.aims.riders : STR.aims.trust;
    return STR.aims.toward + ' ' + next.year + ': ' + bits.join(' · ') + ' ' + STR.aims.toGo +
      ' — ' + lever + '.';
  }
  if (!g.endingSeen) return STR.aims.finale;
  return null;
}

let lastAim = '';
function updateAim() {
  const aim = aimsHidden || paused ? null : aimText();
  $('aim-panel').hidden = !aim;
  if (aim && aim !== lastAim) {
    lastAim = aim;
    $('aim-text').textContent = aim;
  }
}

// --- Achievements: aims, stated plainly, with the bonus they carry ---
let achToastAt = 0;
function showAchievement(name) {
  $('ach-toast-label').textContent = STR.achEarned;
  $('ach-toast-name').textContent = name;
  $('ach-toast-more').textContent = STR.achToastMore;
  $('ach-toast').hidden = false;
  achToastAt = performance.now();
}
// The toast is the only place an aim is ever named in the game proper, so it
// has to lead somewhere: clicking it opens the list, where the other seventeen
// (and their hints) live. Owner ask 2026-08-05: "for some it might not be clear
// how they find those achievements when it disappears".
$('ach-toast').addEventListener('click', () => {
  $('ach-toast').hidden = true;
  achToastAt = 0;
  showMenu('pause');
  menuView('ach');
});
function bonusText(a) {
  const bits = [];
  if (a.mult) for (const k of Object.keys(a.mult)) {
    const pct = Math.round(Math.abs(1 - a.mult[k]) * 100);
    bits.push((a.mult[k] > 1 ? '+' : '−') + pct + '% ' + (STR.bonusName[k] || k));
  }
  if (a.add) for (const k of Object.keys(a.add)) {
    bits.push('+' + Math.round(a.add[k] * 100) + '% ' + (STR.bonusName[k] || k));
  }
  return bits.join(' · ');
}

// The pass-03 achievements page: categories with glyphs and progress, cards
// with earned/locked/hidden states, and tier FAMILIES folded into one card
// showing dots and the next unearned aim. Hidden entries read ??? with their
// tease until the day they land.
const ACH_GLYPHS = {
  building: '<path d="M4 20V8l8-4 8 4v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path><path d="M3 20h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>',
  service: '<rect x="3.5" y="4.5" width="17" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"></rect><path d="M3.5 9.5h17M9 9.5v11" stroke="currentColor" stroke-width="2"></path>',
  riders: '<circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M5 20a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>',
  money: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M9 9v6M15 9l-4 3 4 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>',
  trust: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path><path d="M8.5 12h7" stroke="currentColor" stroke-width="2"></path>',
  history: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>',
  night: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>',
  endgame: '<path d="M12 3l2.6 5.6 6 .7-4.4 4 1.2 6L12 16.9 6.6 19.3l1.2-6-4.4-4 6-.7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>',
};

function achCard(a, meta, dots) {
  const has = !!g.achieved[a.id];
  const hidden = meta.hidden && !has;
  const state = has ? 'earned' : hidden ? 'hidden' : 'locked';
  const name = hidden ? '???' : a.name;
  const bonus = hidden ? '' : bonusText(a);
  const hint = (hidden ? (meta.tease || '…') : a.hint) + (bonus ? ' · ' + bonus : '');
  const tierRow = dots
    ? '<span class="tb-ach__tier">' + dots.map((on) => '<i' + (on ? ' class="on"' : '') + '></i>').join('') + '</span>'
    : '';
  return '<div class="tb-ach" data-state="' + state + '">' +
    '<span class="tb-ach__mark">' + (has ? '✓' : hidden ? '?' : '·') + '</span>' +
    '<span class="tb-ach__txt"><span class="tb-ach__name">' + name + '</span>' +
    '<span class="tb-ach__hint">' + hint + '</span>' + tierRow + '</span></div>';
}

function renderAchievements() {
  const got = sim.ACHIEVEMENTS.filter((a) => g.achieved[a.id]).length;
  $('ach-count').textContent = got + ' of ' + sim.ACHIEVEMENTS.length + ' earned';
  const byCat = new Map(sim.ACH_CATS.map((c) => [c.key, []]));
  for (const a of sim.ACHIEVEMENTS) {
    const meta = sim.ACH_META[a.id] || { cat: 'building' };
    (byCat.get(meta.cat) || byCat.get('building')).push({ a, meta });
  }
  $('ach-list').className = 'tb-ach-page';
  $('ach-list').innerHTML = sim.ACH_CATS.map((c) => {
    const items = byCat.get(c.key);
    if (!items.length) return '';
    // Fold tier families: one card, dots for the ladder, the NEXT unearned
    // aim as the face (or the last one, once the ladder is done).
    const rows = [];
    const fams = new Map();
    for (const it of items) {
      if (it.meta.family) {
        if (!fams.has(it.meta.family)) {
          fams.set(it.meta.family, []);
          rows.push({ fam: it.meta.family });
        }
        fams.get(it.meta.family).push(it);
      } else {
        rows.push({ one: it });
      }
    }
    const earnedN = items.filter((it) => g.achieved[it.a.id]).length;
    const pct = Math.round((earnedN / items.length) * 100);
    const cards = rows.map((r) => {
      if (r.one) return achCard(r.one.a, r.one.meta, null);
      const f = fams.get(r.fam);
      const nextIdx = f.findIndex((it) => !g.achieved[it.a.id]);
      const rep = nextIdx === -1 ? f[f.length - 1] : f[nextIdx];
      return achCard(rep.a, rep.meta, f.map((it) => !!g.achieved[it.a.id]));
    }).join('');
    return '<div class="tb-ach-cat">' +
      '<div class="tb-ach-cat__head">' +
      '<span class="tb-ach-cat__glyph"><svg viewBox="0 0 24 24" width="18" height="18">' + (ACH_GLYPHS[c.key] || '') + '</svg></span>' +
      '<span class="tb-ach-cat__name">' + c.name + '</span>' +
      '<span class="tb-ach-cat__bar"><i style="width:' + pct + '%"></i></span>' +
      '<span class="tb-ach-cat__count">' + earnedN + '/' + items.length + '</span>' +
      '</div><div class="tb-ach-grid">' + cards + '</div></div>';
  }).join('');
}

// --- The statistics office (0.10): graphs, records, a ledger per line. The
// numbers accrue whether or not the office is bought, so the day it opens the
// history is already there. Provisional layout; pass 03 owns the treatment. ---
function renderStats() {
  $('stats-sub').textContent = fmt(g.totalDelivered) + ' ' + STR.ridersCarried +
    ' · ' + fmt(g.totalLost) + ' ' + STR.statLost;
  // The graph: riders/min (line colour) and gross kr/s (muted) over the
  // sampled window, self-scaling.
  const cv = $('stats-graph');
  const ctx = cv.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  ctx.clearRect(0, 0, cv.width, cv.height);
  const H = g.hist;
  if (H.t.length >= 2) {
    const draw = (series, colour) => {
      const max = Math.max(1, ...series);
      ctx.beginPath();
      series.forEach((v, i) => {
        const x = 4 + (cv.width - 8) * (i / (series.length - 1));
        const y = cv.height - 6 - (cv.height - 14) * (v / max);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = colour;
      ctx.stroke();
    };
    draw(H.gross, css.getPropertyValue('--tb-ghost').trim() || '#5a6673');
    draw(H.riders, css.getPropertyValue('--tb-green').trim() || '#35a86b');
    $('stats-legend').textContent = STR.statLegend +
      ' · ' + fmt(Math.max(...H.riders)) + STR.perMin + ' ' + STR.statPeakWindow;
  } else {
    $('stats-legend').textContent = STR.statNoData;
  }
  // The ledger: one row per line.
  const row = (cells) => '<div class="tb-row">' + cells + '</div>';
  $('stats-lines').innerHTML = g.lines.map((L, li) => {
    const active = g.trains.filter((t) => t.line === li && !t.mothballed).length;
    return row(
      '<span class="tb-chip" style="background:' + L.color + '"></span><span>' + L.name + '</span>' +
      '<span class="tb-row__v">' + fmt(L.delivered) + ' ' + STR.riders + ' · ' +
      fmt(L.earned) + ' kr · ' + active + ' 🚆</span>'
    );
  }).join('');
  // The record book.
  const rushTxt = sim.RUSH_GRADES.map((r) => (g.rushCount[r.grade] ? r.grade + '×' + g.rushCount[r.grade] : ''))
    .filter(Boolean).join(' ');
  $('stats-records').innerHTML =
    row(STR.statBestMin + '<span class="tb-row__v">' + fmt(g.records.riders) + STR.perMin + '</span>') +
    row(STR.statBestGross + '<span class="tb-row__v">' + fmt(g.records.gross) + ' kr/s</span>') +
    row(STR.statRush + '<span class="tb-row__v">' + (rushTxt || '—') + '</span>') +
    row(STR.statMoves + '<span class="tb-row__v">' + fmt(g.trainMoves || 0) + '</span>') +
    row(STR.statFixed + '<span class="tb-row__v">' + fmt(g.incidentsFixed || 0) + '</span>');
}

// --- Shop (pass 02, section 05) ---
// Each card is icon + name + cost + description + a foot carrying either the
// level pips or the reason it cannot be bought. The icon and the category come
// from this table: the sim's catalog is economics and should not carry art.
const SHOP_META = {
  train:       { icon: 'train', cat: 'Fleet' },
  drivers:     { icon: 'staff', cat: 'Staff' },
  timetable:   { icon: 'time',  cat: 'Timetable' },
  capacity:    { icon: 'cap',   cat: 'Capacity' },
  bogies:      { icon: 'speed', cat: 'Stock' },
  turnstiles:  { icon: 'fare',  cat: 'Fare' },
  stats:       { icon: 'stats', cat: 'Office' },
  works:       { icon: 'cap',   cat: 'Office' },
  westline:    { icon: 'net',   cat: 'Project' },
  redline:     { icon: 'net',   cat: 'Project' },
  blueline:    { icon: 'net',   cat: 'Project' },
  entrances:   { icon: 'cap',   cat: 'Catchment' },
  through:     { icon: 'thru',  cat: 'Project' },
  stock1957:   { icon: 'speed', cat: 'Stock' },
  atc:         { icon: 'sig',   cat: 'Signalling' },
  c4stock:     { icon: 'speed', cat: 'Stock' },
  c14stock:    { icon: 'speed', cat: 'Stock' },
  zonefare:    { icon: 'fare',  cat: 'Fare' },
  artstation:  { icon: 'art',   cat: 'Comfort' },
  cbtc:        { icon: 'sig',   cat: 'Signalling' },
  nightservice:{ icon: 'night', cat: 'Service' },
};

const ICONS = {};
{
  const tpl = document.getElementById('icons');
  if (tpl) tpl.content.querySelectorAll('svg[data-i]').forEach((svg) => { ICONS[svg.getAttribute('data-i')] = svg; });
}

// The icon key for How to play (owner ask, 2026-08-05). Nine glyphs carry the
// whole shop and none of them is captioned on the card, so a player reading a
// grid of line drawings has to buy one to learn what it was. Built from the
// same ICONS table the shop uses, and asserted against it below, so a tenth
// icon cannot ship without a meaning written next to it.
const ICON_KEY = {
  train: ['Fleet', 'Rolling stock: another train, or more room inside one'],
  staff: ['Staff', 'Drivers. Hired per train, and they dispatch it for you'],
  time:  ['Timetable', 'Regular departures. Trains stop bunching into convoys'],
  cap:   ['Capacity', 'How many people fit: in a train, or through a station'],
  speed: ['Stock', 'Faster or quicker-accelerating trains, so a round trip is shorter'],
  fare:  ['Fare', 'What each rider pays you'],
  net:   ['Project', 'A new line, chartered outright'],
  thru:  ['Through-running', 'One line worked end to end instead of as two halves'],
  sig:   ['Signalling', 'Trains may follow each other more closely'],
  stats: ['Statistics', 'Graphs and records: the network, measured'],
  art:   ['Comfort', 'A station people are glad to be in, which brings more of them'],
  night: ['Service', 'The network runs when the city sleeps'],
};
function renderIconKey() {
  const host = $('icon-key');
  if (!host || host.childElementCount) return;   // built once
  for (const [name, [cat, what]] of Object.entries(ICON_KEY)) {
    const svg = ICONS[name];
    if (!svg) continue;
    const row = document.createElement('div');
    row.className = 'tb-key__row';
    const box = document.createElement('span');
    box.className = 'tb-key__icon';
    box.appendChild(svg.cloneNode(true));
    const text = document.createElement('span');
    text.innerHTML = '<b class="tb-key__cat"></b><span class="tb-key__what"></span>';
    text.querySelector('.tb-key__cat').textContent = cat;
    text.querySelector('.tb-key__what').textContent = what;
    row.append(box, text);
    host.appendChild(row);
  }
  const missing = Object.keys(ICONS).filter((k) => !ICON_KEY[k]);
  if (missing.length) console.warn('icon key missing entries for: ' + missing.join(', '));
}

// Buy quantity, applied to every levelled purchase (catalog and station).
// Session state, not saved: it is a mode you hold, not a preference.
let buyQty = 1;   // 1 | 10 | Infinity (MAX)

function qtyLabel(n) { return n === Infinity ? 'MAX' : '×' + n; }

function renderQty() {
  const row = $('qty-row');
  row.innerHTML = [1, 10, Infinity].map((n) =>
    '<button class="tb-btn tb-btn--inline" data-qty="' + (n === Infinity ? 'max' : n) + '"' +
    (buyQty === n ? ' aria-pressed="true"' : '') + '>' + qtyLabel(n) + '</button>').join('');
}

renderQty();

$('qty-row').addEventListener('click', (e) => {
  const q = e.target?.dataset?.qty;
  if (!q) return;
  buyQty = q === 'max' ? Infinity : Number(q);
  renderQty();
  updateUI();
});

const shopEl = $('shop');
const cards = {};
for (const item of sim.CATALOG) {
  const s = STR.shop[item.id];
  const meta = SHOP_META[item.id] || { icon: 'net', cat: '' };
  const card = document.createElement('button');
  card.className = 'tb-shop';
  card.innerHTML =
    '<div class="tb-shop__top">' +
      '<span class="tb-shop__icon"></span>' +
      '<span class="tb-shop__name"></span>' +
      '<span class="tb-shop__cost"></span>' +
    '</div>' +
    '<span class="tb-shop__desc"></span>' +
    '<div class="tb-shop__foot"><span data-slot="left"></span><span data-slot="cat"></span></div>';
  const icon = ICONS[meta.icon];
  if (icon) card.querySelector('.tb-shop__icon').appendChild(icon.cloneNode(true));
  card.querySelector('.tb-shop__name').textContent = s.name;
  card.querySelector('.tb-shop__desc').textContent = s.desc;
  card.querySelector('[data-slot=cat]').textContent = meta.cat;
  card.addEventListener('click', () => {
    if (paused) return;
    // One transaction, however many levels: the closed forms make MAX cheap.
    if (sim.buyN(g, item.id, buyQty === Infinity ? 0 : buyQty) > 0) updateUI();
  });
  shopEl.appendChild(card);
  cards[item.id] = card;
}

// Level pips: how much of this upgrade you own, at a glance.
function pipsHTML(owned, max) {
  // One pip for a single-level item too: filled or not is the clearest
  // statement of "you own this" (mockup, section 05).
  if (max < 1) return '';
  let out = '<span class="tb-pips">';
  for (let i = 0; i < max; i++) out += '<i class="tb-pip' + (i < owned ? ' tb-pip--on' : '') + '"></i>';
  return out + '</span>';
}

function updateShop() {
  const nextEra = sim.nextEra(g);
  for (const item of sim.CATALOG) {
    const card = cards[item.id];
    const owned = g.owned[item.id];
    const maxed = owned >= sim.maxFor(g, item);
    const open = sim.eraVisible(g, item);
    // An era-locked item shows as a PROMISE rather than being hidden (pass 02,
    // section 05: "a dashed promise with its year"), but only for the era the
    // player is working toward. Showing all five eras at once would be a wall
    // of text, not an invitation.
    const soon = !open && nextEra && item.era === nextEra.year;
    // A maxed upgrade still leaves the shop (owner ask): the space belongs to
    // what can be bought. 'train' reads maxed only while the fleet cap binds,
    // so it stays as the cap readout.
    const visible = (open && (!maxed || item.id === 'train')) || soon;
    card.style.display = visible ? '' : 'none';
    if (!visible) continue;

    const gated = item.needs && !g.owned[item.needs];
    // How many levels this click would buy, and what that costs. MAX asks the
    // sim; a fixed quantity is capped by the room left, and is all-or-nothing
    // (the standard incremental behaviour: buy ten or buy none).
    const room = sim.maxFor(g, item) - owned;
    const aff = sim.affordableLevels(g, item.id, buyQty === Infinity ? 0 : buyQty);
    const wantN = Math.max(1, Math.min(aff || 1, room));
    const nLevels = item.max === 1 ? 1 : wantN;
    const cost = nLevels > 1 ? sim.bulkCost(g, item.id, nLevels) : sim.shopCost(g, item.id);
    const isPk = item.currency === 'pk';
    const unit = isPk ? ' ' + STR.trust : ' kr';
    const have = isPk ? g.pk : g.money;
    const short = Math.max(0, cost - have);
    const affordable = open && !gated && !maxed && sim.canBuy(g, item.id) &&
      (isPk ? g.pk : g.money) >= cost;

    card.disabled = !affordable;
    card.dataset.state = soon ? 'locked'
      : maxed ? 'maxed'
      : !affordable ? 'unaffordable'
      : isPk ? 'project'
      : 'affordable';

    card.querySelector('.tb-shop__cost').textContent =
      maxed ? STR.max : (nLevels > 1 ? '×' + nLevels + '  ' : '') + kr(cost) + unit;

    // The foot's left slot: the reason it cannot be bought, or the level owned.
    // Disabled must stay legible and name the shortfall, never fade out.
    // Queried by a stable hook, never by the class we overwrite below: doing
    // that made the slot unfindable on the second update (browser probe).
    const left = card.querySelector('[data-slot=left]');
    if (soon) {
      left.className = 'tb-shop__gate';
      left.textContent = STR.unlocksIn + ' ' + item.era + (item.needs ? ' · ' + STR.needsDrivers.toLowerCase() : '');
    } else if (gated) {
      left.className = 'tb-shop__gate';
      left.textContent = STR.needsDrivers;
    } else if (short > 0) {
      left.className = 'tb-shop__short';
      left.textContent = STR.need + ' ' + kr(short) + unit + ' ' + STR.more;
    } else if (item.id === 'train') {
      left.className = '';
      left.innerHTML = pipsHTML(owned + 1, sim.maxFor(g, item) + 1);
    } else {
      left.className = '';
      left.innerHTML = pipsHTML(owned, sim.maxFor(g, item));
    }

    // The foot's right slot: level count where it means something, else the
    // category, so every card ends on something true.
    const catEl = card.querySelector('[data-slot=cat]');
    const meta = SHOP_META[item.id] || { cat: '' };
    const max = sim.maxFor(g, item);
    catEl.textContent = item.id === 'train'
      ? (owned + 1) + ' ' + STR.ownedLower + ' · ' + meta.cat
      : owned + ' / ' + max + ' · ' + meta.cat;
  }
  // Era panel
  const next = sim.nextEra(g);
  $('era-now').textContent = STR.eraNow + ' ' + sim.eraYear(g);
  if (next) {
    $('era-btn').hidden = false;
    // The button spends its right edge on the cost, like every other gated
    // control in the system (section 03).
    $('era-btn').innerHTML = STR.advance + ' ' + next.year +
      '<span class="tb-btn__why" style="color: var(--tb-politic)">' + next.pk + ' ' + STR.trust + '</span>';
    $('era-btn').disabled = !sim.canAdvanceEra(g);
    const needPk = Math.max(0, next.pk - g.pk);
    const rate = sim.pkRate(g);
    const eta = needPk > 0 && rate > 0 ? Math.ceil(needPk / rate / 60) : 0;
    // The plan is the era's third requirement: name the line and its count,
    // and say "repair" when the player demolished it back open.
    const plan = sim.planBlockers(g);
    const planTxt = plan.map((b) =>
      b.name + ' ' + b.built + '/' + b.total + (b.repair ? ' · ' + STR.planRepair : '')).join(' · ');
    $('era-needs').textContent = STR.advanceNeeds + ' ' + fmt(next.delivered) + ' ' + STR.riders +
      ' · ' + next.pk + ' ' + STR.trust +
      (planTxt ? ' · ' + planTxt : '') +
      (eta > 0 ? ' (' + STR.about + ' ' + eta + ' min at this coverage)' : '') +
      ' · ' + STR.trustFrom;
  } else {
    $('era-btn').hidden = true;
    $('era-needs').textContent = STR.arcDone;
  }
}

// --- Stats ---
function updateUI() {
  $('money').innerHTML = numHTML(g.money, ' kr');
  const gross = sim.grossRate(g);
  const upkeep = sim.upkeepRate(g);
  const net = gross - upkeep;
  $('rate-gross').textContent = '+' + Math.max(0, gross - sim.commerceRate(g)).toFixed(1) + ' kr/s fares';
  $('rate-upkeep').textContent = '−' + upkeep.toFixed(1) + ' kr/s upkeep';
  const netEl = $('rate-net');
  netEl.textContent = (net >= 0 ? '+' : '−') + Math.abs(net).toFixed(1) + ' kr/s';
  netEl.classList.toggle('tb-rate--down', net < 0);
  netEl.classList.toggle('tb-rate--up', net >= 0);
  $('stat-delivered').textContent = fmt(g.totalDelivered);
  const rent = sim.commerceRate(g);
  $('rate-rent').textContent = rent > 0 ? '+' + rent.toFixed(1) + ' kr/s rent' : '';
  // grossRate() already contains rent, so the fares row must exclude it or the
  // readout contradicts itself (review: rows summed to 429.8 against a net of
  // 310.8, and a third of "fares" was actually rent).
  $('riders-label').textContent = STR.ridersCarried;
  $('money').title = STR.krTitle;
  // Riders per minute, from the sim's own 60 s window.
  $('riders-rate').textContent = g.deliv60 > 0 ? '· ' + fmt(g.deliv60 * 60) + STR.perMin : '';
  $('stat-stations').textContent = sim.stationCount(g) + ' · ' + STR.linesStat + ': ' + g.lines.length;
  $('stat-demand').textContent = '×' + sim.cityMult(g).toFixed(2);
  const mb = sim.mothballedTrains(g).length;
  $('stat-trains').textContent =
    sim.idleTrains(g).length + ' / ' + (g.trains.length - mb) +
    (mb ? ' (+' + mb + ' ' + STR.mothballedTag + ')' : '');
  // Trust reads as a bar, not a number: x.x / cap, and when it is full the rate
  // chip says WHY it stopped rather than advertising a rate that is no longer
  // being credited. A silently pinned counter is the same legibility failure as
  // the one the rate chip was added to fix.
  const pkPerMin = sim.pkRate(g) * 60;
  const pkCap = sim.pkCap(g);
  const pkFull = g.pk >= pkCap - 1e-6;
  $('pk').textContent = g.pk.toFixed(1) +
    (Number.isFinite(pkCap) ? ' / ' + pkCap : '') + ' ' + STR.trust;
  $('pk-rate').textContent = pkFull ? STR.trustCapped
    : pkPerMin > 0 ? '+' + pkPerMin.toFixed(1) + STR.perMin : '';
  // The clock (owner ask): the city keeps a visible time of day, and the
  // phase label rides with it. Before opening day there is no timetable yet.
  const phase = g.opened ? STR.phases[sim.dayPhase(g)] : STR.openingDay;
  const clock = g.opened ? sim.clockHM(g) : '';
  $('pk-cov').textContent = Math.round(sim.coverage(g) * 100) + '% ' + STR.coverage +
    (clock ? ' · ' + clock : '') + (phase ? ' · ' + phase : '');
  $('btn-mothball').disabled = sim.idleTrains(g).length === 0 || g.trains.length - mb <= 1;
  $('btn-reactivate').disabled = mb === 0;
  // The bell states the service it runs: manual, automatic with its cadence,
  // or nothing idle to send (pass 02, section 03).
  const idleN = sim.idleTrains(g).length;
  const auto = !!g.owned.drivers;
  $('bell-sub').textContent = !idleN ? STR.noIdle
    : auto ? STR.bellAuto + ' ' + Math.round(sim.lineHeadwayS(g, 0)) + ' s'
    : STR.dispatchSub;
  bell.classList.toggle('tb-bell--auto', auto);
  bell.disabled = !idleN;
  if (selected) updateStationPanel();
  updateAim();
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
    if (e.type === 'surge') render.addFloatGeo(e.geo, 'RUSH · ' + e.name);
    if (e.type === 'abandon') render.addFloatGeo(e.geo, '−' + fmt(e.n), 'red');
    if (e.type === 'newline') render.addFloatGeo(e.geo, e.name);
    if (e.type === 'trainmove') render.addFloatGeo(e.geo, '🚆 → ' + e.name);
    if (e.type === 'egg') render.addFloatGeo(e.geo, e.name);
    if (e.type === 'incident') render.addFloatGeo(e.geo, STR.incidentName + ' · ' + e.name, 'red');
    if (e.type === 'incident-over') render.addFloatGeo(e.geo, STR.incidentOver, 'muted');
    if (e.type === 'rush-grade') {
      render.addFloatGeo(e.geo, STR.phases[e.phase] + ' · ' + e.grade + ' · ' +
        fmt(e.carried) + ' ' + STR.riders + (e.trust ? ' · +' + e.trust + ' ' + STR.trust : ''),
        e.grade === 'A' || e.grade === 'B' ? undefined : 'muted');
    }
    if (e.type === 'plandone') {
      render.addFloatGeo(e.geo, e.name + ' · ' + STR.planDoneFloat +
        (e.trust ? ' · +' + e.trust + ' ' + STR.trust : ''));
      if (e.id === 'green-south') render.addFloatGeo(e.geo, STR.freeUnlockedFloat);
    }
    if (e.type === 'junction') render.addFloatGeo(e.geo, STR.junction + ' · ' + e.name);
    if (e.type === 'achievement') showAchievement(e.name);
    if (e.type === 'open') render.addFloatGeo(e.geo, STR.ribbonCut);
    if (e.type === 'era') showMoment(e.year);
    if (e.type === 'ending') showEnding();
  }
  g.events.length = 0;
  // 7 s, not the old 4.2: a toast you are meant to CLICK has to outlive the
  // second it takes to notice it and move the mouse there.
  if (achToastAt && performance.now() - achToastAt > 7000) {
    achToastAt = 0;
    $('ach-toast').hidden = true;
  }
  maybeNote();
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
  store.set(sim.SAVE_KEY, sim.serialize(g));
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
  // The night report (0.10): what the closed form actually knows, told
  // fully: the take, the riders, the rate it ran at, and who led the night.
  const h = Math.floor(offline.seconds / 3600);
  const m = Math.floor((offline.seconds % 3600) / 60);
  $('offline-note').hidden = false;
  $('offline-note').textContent =
    STR.awayTitle + ' (' + (h ? h + ' h ' : '') + m + ' min): +' + fmt(offline.earned) +
    ' kr · ' + fmt(offline.delivered) + ' ' + STR.riders + ' · ' +
    offline.rate.toFixed(1) + ' kr/s net' +
    (offline.busiest && g.lines.length > 1 ? ' · ' + offline.busiest + ' ' + STR.awayLed : '') + '.';
  save();
}
// A migrated save explains itself once, in the same place as the away summary,
// so "my finished upgrades have room again" reads as an update rather than a
// bug. Nothing was destroyed to get here.
if (migratedFrom) {
  const note = $('offline-note');
  const prev = note.hidden ? '' : note.textContent + '  ';
  note.hidden = false;
  note.textContent = prev + STR.migrated;
  save();   // rewrite at the current save version
}
// The module reached the end: everything is wired, so drop the loading veil.
// (It first went in above the wrong showMenu and the game booted behind a
// full-screen "Loading" overlay: caught by looking at a screenshot, not by the
// console, which was clean.)
document.getElementById('boot')?.remove();
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
  selectStation,
  updateUI,
  showMoment,
};
