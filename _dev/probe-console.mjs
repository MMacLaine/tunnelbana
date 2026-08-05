// Console-error probe: load the game headless, capture every console message
// and uncaught exception, then click through the menu buttons and report what
// happens. Zero-dep CDP, same plumbing as probe-pan. Run: node _dev/probe-console.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
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
  const { result, exceptionDetails } = await rpc(ws, 'Runtime.evaluate', { expression, returnByValue: true });
  if (exceptionDetails) return 'EVAL ERROR: ' + (exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}

async function main() {
  const server = spawn('node', ['_dev/serve.mjs', String(HTTP_PORT)], {
    cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore',
  });
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${DBG_PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'tbcon-'))}`,
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
      if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
        console.log('[console.' + msg.params.type + ']', msg.params.args.map((a) => a.description || a.value).join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        console.log('[EXCEPTION]', d.exception?.description || d.text);
      }
    });
    await rpc(ws, 'Page.enable');
    await rpc(ws, 'Runtime.enable');
    // A URL argument points the probe at production, which is where a bug that
    // only appears with a real basemap or a real save will show itself.
    const target_url = process.argv[2] || `http://localhost:${HTTP_PORT}/`;
    console.log('probing', target_url);
    await rpc(ws, 'Page.navigate', { url: target_url });
    await sleep(3500);

    console.log('menu hidden:', await evaluate(ws, 'document.getElementById("menu").hidden'));
    console.log('start label:', await evaluate(ws, 'document.getElementById("menu-start").textContent'));
    // Click every menu button and report the resulting view state.
    for (const id of ['menu-help', 'help-back', 'menu-settings', 'settings-back', 'menu-about', 'about-back']) {
      const r = await evaluate(ws, `(() => {
        const el = document.getElementById(${JSON.stringify(id)});
        if (!el) return 'MISSING';
        const cs = getComputedStyle(el);
        el.click();
        return 'clicked (display=' + cs.display + ', disabled=' + el.disabled + ')';
      })()`);
      await sleep(300);
      const state = await evaluate(ws, `JSON.stringify({
        menu: document.getElementById('menu').hidden,
        main: document.getElementById('main-view').hidden,
        settings: document.getElementById('settings-view').hidden,
        about: document.getElementById('about-view').hidden,
        help: document.getElementById('help-view').hidden,
      })`);
      console.log(id + ':', r, '->', state);
    }
  } finally {
    chrome.kill();
    server.kill();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
