// Screenshot harness: drives the real game in headless Chrome and captures the
// screens the design system governs, so a UI change can be LOOKED at instead of
// asserted. Same zero-dep CDP plumbing as the other probes.
//   node _dev/shoot.mjs            # all shots to /tmp/tb-shot-*.png
//   node _dev/shoot.mjs light      # the same set in light theme
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG_PORT = 9226;
const HTTP_PORT = 8128;
const THEME = process.argv[2] === 'light' ? 'light' : 'dark';
const OUT = '/tmp/tb-shot';

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

// clip: {x, y, width, height, scale} captures one component big enough to
// actually read, which is the point of shooting at all.
async function shot(ws, name, clip) {
  const params = { format: 'png' };
  if (clip) params.clip = { ...clip, scale: clip.scale || 2 };
  const { data } = await rpc(ws, 'Page.captureScreenshot', params);
  writeFileSync(`${OUT}-${THEME}-${name}.png`, Buffer.from(data, 'base64'));
  console.log('shot', `${OUT}-${THEME}-${name}.png`);
}

async function main() {
  const server = spawn('node', ['_dev/serve.mjs', String(HTTP_PORT)], {
    cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore',
  });
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${DBG_PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'tbshot-'))}`,
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
    await rpc(ws, 'Page.enable');
    await rpc(ws, 'Runtime.enable');
    await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await rpc(ws, 'Page.navigate', { url: `http://localhost:${HTTP_PORT}/?theme=${THEME}` });
    await sleep(4000);
    // The poses below reach into the game through its debug handle; if it is not
    // there, every "posed" shot is silently just the natural game state, which
    // is worse than no shot at all.
    const handle = await evaluate(ws, 'typeof window.__tb');
    console.log('debug handle:', handle);
    if (handle !== 'object') console.log('WARNING: poses will not apply');

    // 1. The menu, which is the first thing anyone sees.
    await shot(ws, '1-menu');
    await evaluate(ws, `document.getElementById('menu-help').click()`);
    await sleep(400);
    await shot(ws, '2-help');
    // The icon key lives at the foot of How to play, so it needs the scroll.
    await evaluate(ws, `(() => {
      const el = document.getElementById('icon-key');
      if (!el) return 'no key';
      el.scrollIntoView({ block: 'end' });
      return el.childElementCount + ' rows';
    })()`).then((r) => console.log('icon key:', r));
    await sleep(300);
    await shot(ws, '2a-icon-key');
    // Achievements page, with a couple already earned so both states show.
    await evaluate(ws, `document.getElementById('help-back').click();
      document.getElementById('menu-ach').click()`);
    await sleep(400);
    await shot(ws, '2b-achievements');
    await evaluate(ws, `document.getElementById('ach-back').click();
      document.getElementById('menu-settings').click()`);
    await sleep(400);
    await shot(ws, '3-settings');

    // 2. In game: the HUD, the rail, the bell.
    await evaluate(ws, `document.getElementById('settings-back').click();
      document.getElementById('menu-resume').click()`);
    await sleep(2500);
    await shot(ws, '4-game');

    // The new chrome: the collapsed rail, and the bottom-right controls.
    await evaluate(ws, `document.getElementById('rail-toggle').click()`);
    await sleep(500);
    await shot(ws, '4b-rail-hidden');
    await shot(ws, '4c-corner-buttons', { x: 1040, y: 820, width: 400, height: 80 });
    await evaluate(ws, `document.getElementById('rail-toggle').click()`);
    await sleep(400);

    // 3. A richer state: money for the shop's affordable/unaffordable split,
    // a station panel open, and an era in reach. Reaches into the live game
    // through the debug handle the game already exposes.
    await evaluate(ws, `(() => {
      const t = window.__tb; if (!t) return 'no handle';
      t.g.money = 9000; t.g.pk = 6; t.g.totalDelivered = 41000;
      t.selectStation({ li: 0, i: 0 });
      t.updateUI();
      return 'ok';
    })()`);
    await sleep(600);
    await shot(ws, '5-panels');

    // 4. An era moment, the one deliberate full-screen surface.
    await shot(ws, '5a-money', { x: 0, y: 0, width: 340, height: 210 });
    await shot(ws, '5b-rail', { x: 1130, y: 0, width: 310, height: 450, scale: 1.6 });
    await shot(ws, '5c-station', { x: 0, y: 470, width: 360, height: 430, scale: 1.6 });
    await shot(ws, '5d-corner', { x: 1080, y: 730, width: 360, height: 170 });
    // The map itself, close, to check the game draws ABOVE the basemap's own
    // labels (owner: station names looked layered under the map).
    await shot(ws, '5e-map', { x: 420, y: 180, width: 420, height: 320, scale: 2 });

    // Late-game numbers: the counter must hold a billion without overflowing,
    // which is the whole reason notation exists.
    await evaluate(ws, `(() => {
      const t = window.__tb;
      t.g.money = 1.234e9; t.g.pk = 128.5; t.g.totalDelivered = 4.56e7;
      t.updateUI(); return 'ok';
    })()`);
    await sleep(400);
    await shot(ws, '7-bignum', { x: 0, y: 0, width: 340, height: 210 });

    // 4. An era moment, the one deliberate full-screen surface.
    await evaluate(ws, `window.__tb && window.__tb.showMoment && window.__tb.showMoment(1952)`);
    await sleep(500);
    await shot(ws, '6-moment');
  } finally {
    chrome.kill();
    server.kill();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
