// Reproduce the 0.12.0 live report: a returning player's save shows in the
// slot list with a relative stamp (not "playing now"), the game boots fresh,
// and clicking the slot does nothing. Seeds a genuine pre-slots save into
// localStorage BEFORE the game loads, exactly like a returning browser.
// Run: node _dev/probe-slot-bug.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG_PORT = 9226;
const HTTP_PORT = 8127;

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
  const { result, exceptionDetails } = await rpc(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) return 'EVAL ERROR: ' + (exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}

async function main() {
  // Build the old-format save with the CURRENT sim (cross-version hydrate is
  // proven clean, so current-format bytes stand in fine for a 0.11.4 save).
  const sim = await import('../src/sim.js');
  const { ANCHORS } = await import('../src/data.js');
  const g = sim.newGame();
  g.money = 1e6;
  for (let k = 3; k < 13; k++) sim.extendTo(g, 0, 'tail', ANCHORS[k].geo, k);
  sim.buy(g, 'drivers'); sim.buy(g, 'train');
  for (let t = 0; t < 200; t += 0.1) { sim.tick(g, 0.1); g.events.length = 0; }
  g.era = 2;
  const packed = sim.pack(g);

  const server = spawn('node', ['_dev/serve.mjs', String(HTTP_PORT)], {
    cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore',
  });
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${DBG_PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'tbslot-'))}`,
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
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        console.log('[EXCEPTION]', d.exception?.description || d.text);
      }
    });
    await rpc(ws, 'Page.enable');
    await rpc(ws, 'Runtime.enable');
    const url = process.argv[2] || `http://localhost:${HTTP_PORT}/`;
    console.log('probing', url);
    // Seed BEFORE any game code runs, on the first document only: navigating
    // away from a live game page fires its unload autosave, which would
    // overwrite the seed (that artifact invalidated the first run of this
    // probe). addScriptToEvaluateOnNewDocument runs ahead of page scripts.
    await rpc(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: `
      if (!sessionStorage.getItem('tb_seeded')) {
        sessionStorage.setItem('tb_seeded', '1');
        localStorage.clear();
        localStorage.setItem('tunnelbana_save', ${JSON.stringify(packed)});
      }
    ` });
    await rpc(ws, 'Page.navigate', { url });
    await sleep(3500);
    console.log('seed intact:', await evaluate(ws, `(localStorage.getItem('tunnelbana_save') || '').slice(0, 20)`));
    console.log('boot state:', await evaluate(ws, `(() => {
      const t = window.__tb;
      return JSON.stringify({
        stations: t.g.lines.reduce((n, L) => n + L.stations.length, 0),
        era: t.g.era,
        slotPtr: localStorage.getItem('tunnelbana_slot'),
        resumeLabel: document.getElementById('menu-resume').textContent,
        noteShown: !document.getElementById('offline-note').hidden,
        note: document.getElementById('offline-note').textContent.slice(0, 80),
      });
    })()`));
    console.log('slot rows:', await evaluate(ws, `(() => {
      document.getElementById('menu-slots').click();
      return [...document.querySelectorAll('#slot-list [data-slot]')].map((b) =>
        b.dataset.slot + '=' + (b.querySelector('.tb-slot__meta')?.textContent || '').slice(0, 40) +
        ' stamp=' + (b.querySelector('.tb-slot__stamp')?.textContent || '')).join(' | ');
    })()`));
    console.log('click slot 1:', await evaluate(ws, `(async () => {
      const t = window.__tb;
      document.querySelector('#slot-list [data-slot="1"]').click();
      await new Promise((r) => setTimeout(r, 300));
      return JSON.stringify({
        stations: t.g.lines.reduce((n, L) => n + L.stations.length, 0),
        era: t.g.era,
        slotPtr: localStorage.getItem('tunnelbana_slot'),
        mainView: !document.getElementById('main-view').hidden,
      });
    })()`));
  } finally {
    chrome.kill();
    server.kill();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
