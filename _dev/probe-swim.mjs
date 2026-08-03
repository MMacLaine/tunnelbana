// Swim probe: records a SCREENCAST (the actual composited frames) during a
// continuous drag, while the page logs where the overlay drew Slussen on every
// map render. Each screencast frame is then cropped around the logged position
// nearest in time: if the game layer is locked, the station ring sits glued to
// the same streets in every frame; if it swims, the ring visibly slides.
// Run: node _dev/probe-swim.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG_PORT = 9224;
const HTTP_PORT = 8126;

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

async function main() {
  const server = spawn('python3', ['-m', 'http.server', String(HTTP_PORT)], {
    cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore',
  });
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${DBG_PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'tbswim-'))}`,
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
    let up = false;
    for (let i = 0; i < 24 && !up; i++) {
      up = await evaluate(ws, 'window.__tb && window.__tb.basemapUp === true');
      await sleep(500);
    }
    if (!up) { console.log('PROBE INCONCLUSIVE: no basemap headless'); process.exit(2); }
    await evaluate(ws, 'window.__tb.closeMenu()');
    await sleep(3500); // let start-view tiles land

    // Log the overlay's drawn position of Slussen on every map render.
    await evaluate(ws, `
      window.__panlog = [];
      window.__tb.map.on('render', function () {
        var p = window.__tb.map.project([18.0720, 59.3200]);
        window.__panlog.push([Date.now(), p.x, p.y]);
      });
      'ok'
    `);

    // Screencast on, then a continuous drag with no pauses.
    const frames = [];
    const onMsg = async (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Page.screencastFrame') {
        frames.push({ t: Date.now(), data: msg.params.data });
        await rpc(ws, 'Page.screencastFrameAck', { sessionId: msg.params.sessionId });
      }
    };
    ws.addEventListener('message', onMsg);
    await rpc(ws, 'Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: 1100, maxHeight: 780 });

    const x0 = 620, y0 = 260;
    await rpc(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
    let x = x0, y = y0;
    for (let step = 1; step <= 30; step++) {
      x -= 11; y += 5;
      await rpc(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left' });
      await sleep(16);
    }
    await rpc(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(600);
    await rpc(ws, 'Page.stopScreencast');
    ws.removeEventListener('message', onMsg);

    const log = await evaluate(ws, 'JSON.stringify(window.__panlog)');
    const panlog = JSON.parse(log);
    console.log('screencast frames:', frames.length, '| render log entries:', panlog.length);

    // Crop each mid-motion frame around the render-logged position nearest in time.
    const picks = frames.filter((f, i) => i >= 2 && i < frames.length - 2);
    let n = 0;
    for (const f of picks.slice(0, 10)) {
      const nearest = panlog.reduce((a, b) => Math.abs(b[0] - f.t) < Math.abs(a[0] - f.t) ? b : a);
      const file = `/tmp/tb-swim-${n}.png`;
      writeFileSync(file, Buffer.from(f.data, 'base64'));
      const cx = Math.round(nearest[1]), cy = Math.round(nearest[2]);
      const ox = Math.max(0, cx - 110), oy = Math.max(0, cy - 110);
      try {
        execFileSync('sips', [file, '--cropOffset', String(oy), String(ox), '-c', '220', '220', '--out', `/tmp/tb-swim-crop-${n}.png`], { stdio: 'ignore' });
        console.log(`frame ${n}: t=${f.t % 100000} render-pos=(${cx},${cy}) crop ok`);
      } catch {
        console.log(`frame ${n}: crop failed`);
      }
      n++;
    }
    console.log('crops at /tmp/tb-swim-crop-*.png');
  } finally {
    chrome.kill();
    server.kill();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
