// Pan-lock probe: drives a real mouse drag over the live game in headless Chrome
// (software WebGL) and captures COMPOSITED frames mid-drag, i.e. what the player
// actually sees. If the overlay swims against the tiles, it is visible in the
// frames. Zero dependencies (CDP over the built-in WebSocket, same approach as
// the site's shoot.mjs). Run: node _dev/probe-pan.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG_PORT = 9223;
const HTTP_PORT = 8125;
const OUT = '/tmp/tb-pan';

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
  const { result } = await rpc(ws, 'Runtime.evaluate', { expression, returnByValue: true });
  return result.value;
}

async function shot(ws, name) {
  const { data } = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}-${name}.png`, Buffer.from(data, 'base64'));
  console.log('frame', name);
}

async function main() {
  const server = spawn('python3', ['-m', 'http.server', String(HTTP_PORT)], {
    cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore',
  });
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${DBG_PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'tbpan-'))}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--hide-scrollbars', '--no-first-run', '--disable-extensions',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    let target = null;
    for (let i = 0; i < 50 && !target?.webSocketDebuggerUrl; i++) {
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
    await rpc(ws, 'Emulation.setDeviceMetricsOverride', { width: 1100, height: 780, deviceScaleFactor: 1, mobile: false });
    await rpc(ws, 'Page.navigate', { url: `http://localhost:${HTTP_PORT}/` });
    await sleep(2500);

    // Wait for the basemap; report honestly if headless cannot render it.
    let up = false;
    for (let i = 0; i < 24 && !up; i++) {
      up = await evaluate(ws, 'window.__tb && window.__tb.basemapUp === true');
      await sleep(500);
    }
    console.log('basemap up:', up);
    if (!up) {
      console.log('style state:', await evaluate(ws,
        'window.__tb && window.__tb.map ? JSON.stringify({loaded: window.__tb.map.loaded(), styleLoaded: window.__tb.map.isStyleLoaded()}) : "no map"'));
      console.log('PROBE INCONCLUSIVE: headless has no usable basemap, cannot observe the swim.');
      process.exit(2);
    }
    await evaluate(ws, 'window.__tb.closeMenu()');
    // Let tiles for the start view actually arrive before judging alignment.
    await sleep(4000);
    await shot(ws, '0-settled-before');

    // A real drag: press, move in steps, screenshots taken mid-motion.
    const x0 = 700, y0 = 300;
    await rpc(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
    let x = x0, y = y0;
    for (let step = 1; step <= 18; step++) {
      x -= 14; y += 6;
      await rpc(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left' });
      await sleep(28);
      if (step === 8) await shot(ws, '1-middrag-a');
      if (step === 13) await shot(ws, '2-middrag-b');
    }
    await rpc(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(120);
    await shot(ws, '3-inertia');
    await sleep(1500);
    await shot(ws, '4-settled-after');
    console.log('done: /tmp/tb-pan-*.png');
  } finally {
    chrome.kill();
    server.kill();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
