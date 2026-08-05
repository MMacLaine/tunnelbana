// Store shots for itch.io. Same CDP plumbing as shoot.mjs, different job: that
// one documents the design system on a three-station opening board, which is
// the game at minute one and sells nothing. This one BUILDS a network first
// (three lines, most of the veil lifted, trains actually moving, a fleet and a
// shop worth looking at) and shoots it at 1920x1080, the size itch shows.
//
//   node _dev/shoot-store.mjs          # dark, the game's own default
//   node _dev/shoot-store.mjs light
//
// The pose is built by calling the SIM through the game's debug handle, never
// by hand-writing state: a screenshot of a game state that cannot occur is a
// lie, and hand-built entities are how report 648 happened.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG_PORT = 9227;
const HTTP_PORT = 8129;
const THEME = process.argv[2] === 'light' ? 'light' : 'dark';
const OUT = '/tmp/tb-store';
const W = 1920, H = 1080;

let _id = 0;
function rpc(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++_id;
    const onMsg = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.removeEventListener('message', onMsg);
        msg.error ? reject(new Error(method + ': ' + msg.error.message)) : resolve(msg.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(ws, expression) {
  const { result, exceptionDetails } = await rpc(ws, 'Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}

async function shot(ws, name) {
  const { data } = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}-${name}.png`, Buffer.from(data, 'base64'));
  console.log('shot', `${OUT}-${name}.png`);
}

// Everything below runs IN the page. It imports the game's own data module and
// drives the sim through the same entry points the player's clicks reach.
const BUILD_POSE = `(async () => {
  const t = window.__tb;
  if (!t) return 'no debug handle';
  const { ANCHORS, CORRIDORS } = await import('./src/data.js');
  const { sim, g } = t;
  t.closeMenu();
  g.money = 1e9;

  // The green line south, then west: the 1950s campaign as the player builds it.
  const south = CORRIDORS.find((c) => c.id === 'green-south');
  for (let k = g.lines[0].stations.length; k < south.end; k++) {
    sim.extendTo(g, 0, 'tail', ANCHORS[k].geo, k);
  }
  // Advance to 1975, so all three historic charters are legitimately open.
  g.totalDelivered = 1e6;
  for (let e = 0; e < 4; e++) { g.pk = 1e3; sim.advanceEra(g); }

  // T-Centralen becomes a Knutpunkt: the interchange the whole network hangs on.
  g.pk = 1e3;
  sim.upgradeStation(g, 0, 0, 'tier');
  sim.upgradeStation(g, 0, 0, 'tier');

  // The lines come from the CHARTERS, not from generic foundLine. Founding by
  // hand paints them from the founding-order palette (the first pass of this
  // script produced a pink line and a yellow one), while the megaprojects carry
  // the reserved identities, so the shot shows the green, red and blue any
  // Stockholmer would recognise.
  for (const [id, ids] of [['westline', ['green-west']],
                           ['redline', ['red-south', 'red-orn']],
                           ['blueline', ['blue-main']]]) {
    g.pk = 1e3; g.money = 1e9;
    const before = g.lines.length;
    if (!sim.buy(g, id)) return id + ' charter refused';
    const li = g.lines.length > before ? g.lines.length - 1 : before - 1;
    for (const cid of ids) {
      const c = CORRIDORS.find((x) => x.id === cid);
      for (let k = c.start; k < c.end; k++) {
        g.money = 1e9;
        sim.extendTo(g, li, 'tail', ANCHORS[k].geo, k);
      }
    }
  }

  // A network this size needs a service to match, or the shot is of a railway
  // with nothing running on it.
  g.money = 1e9;
  for (const id of ['drivers', 'timetable', 'capacity', 'turnstiles', 'stock1957']) {
    for (let n = 0; n < 3; n++) sim.buy(g, id);
  }
  for (let li = 0; li < g.lines.length; li++) {
    for (let n = 0; n < 4; n++) sim.addTrain(g, li);
  }
  // Entrances and retail on the busiest stops, so the station panel has depth
  // in it and the map's catchment discs are worth looking at.
  for (let li = 0; li < g.lines.length; li++) {
    for (let i = 0; i < Math.min(5, g.lines[li].stations.length); i++) {
      g.money = 1e9;
      sim.upgradeStationN(g, li, i, 'ent', 3);
      sim.upgradeStationN(g, li, i, 'shop', 2);
    }
  }

  // Run it: riders on the counters, trains spread along the line rather than
  // parked at the terminus, queues where the queues really form.
  for (let s = 0; s < 900; s += 0.05) { sim.tick(g, 0.05); g.events.length = 0; }
  g.money = 4.2e6;   // a plausible mid-campaign balance, not 1e9 in the readout
  t.updateUI();

  // Frame the whole network. NOTE the swap: the game stores geo as [lat, lon]
  // and MapLibre wants [lon, lat]. Getting this wrong flies the camera to the
  // Arabian Sea and every shot comes out solid black, which is how the first
  // run of this script ended.
  const pts = g.lines.flatMap((L) => L.stations.map((s) => s.geo));
  const lat = pts.map((p) => p[0]), lon = pts.map((p) => p[1]);
  t.map.fitBounds([[Math.min(...lon), Math.min(...lat)], [Math.max(...lon), Math.max(...lat)]],
    { padding: { top: 90, bottom: 90, left: 360, right: 360 }, duration: 0 });
  return g.lines.length + ' lines · ' + g.lines.reduce((n, L) => n + L.stations.length, 0) +
    ' stations · ' + g.trains.length + ' trains · ' + Math.round(g.totalDelivered) + ' riders';
})()`;

async function main() {
  const server = spawn('node', ['_dev/serve.mjs', String(HTTP_PORT)], {
    cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore',
  });
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${DBG_PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'tbstore-'))}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--hide-scrollbars', '--no-first-run', '--disable-extensions',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    let target = null;
    for (let i = 0; i < 60 && !target?.webSocketDebuggerUrl; i++) {
      try {
        const list = await (await fetch(`http://localhost:${DBG_PORT}/json`)).json();
        target = list.find((t) => t.type === 'page');
      } catch {}
      await sleep(200);
    }
    if (!target) throw new Error('no Chrome target');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        console.log('[EXCEPTION]', msg.params.exceptionDetails.exception?.description);
      }
    });
    await rpc(ws, 'Page.enable');
    await rpc(ws, 'Runtime.enable');
    await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: 1, mobile: false,
    });
    await rpc(ws, 'Page.navigate', { url: `http://localhost:${HTTP_PORT}/?theme=${THEME}` });
    await sleep(4500);

    // 1. The menu, over the real city. The first thing anyone sees.
    await shot(ws, '0-title');

    const built = await evaluate(ws, BUILD_POSE);
    console.log('pose:', built);
    if (typeof built === 'string' && built.startsWith('no ')) throw new Error(built);
    await sleep(2500);   // let the basemap settle and the trains move

    // 2. The hero: a real network, the veil lifted around it, HUD both sides.
    await shot(ws, '1-network');

    // 3. Close in, so the stations, labels and moving trains are legible.
    await evaluate(ws, `(() => {
      const t = window.__tb;
      const s = t.g.lines[0].stations[0];
      t.map.easeTo({ center: [s.geo[1], s.geo[0]], zoom: 12.4, duration: 0 });
    })()`);
    await sleep(1200);
    await shot(ws, '2-close');

    // 4. A station panel open beside the shop: the game's actual decisions.
    await evaluate(ws, `(() => {
      const t = window.__tb;
      t.selectStation({ li: 0, i: 3 });
      t.updateUI();
    })()`);
    await sleep(600);
    await shot(ws, '3-station');

    // 5. An era moment, the one deliberate full-screen surface.
    await evaluate(ws, `window.__tb.showMoment(1964)`);
    await sleep(700);
    await shot(ws, '4-era');

    // 6. The achievements list, with real ones earned by the pose above.
    await evaluate(ws, `(() => {
      const m = document.getElementById('moment');
      if (m) m.hidden = true;
      document.getElementById('menu-open').click();
      document.getElementById('menu-ach').click();
    })()`);
    await sleep(600);
    await shot(ws, '5-achievements');
  } finally {
    chrome.kill();
    server.kill();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
