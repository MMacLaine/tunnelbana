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
  // awaitPromise: an async probe expression otherwise serialises to {} and
  // reads as success while testing nothing.
  const { result, exceptionDetails } = await rpc(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
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
    // The primary button is #menu-resume in both states (its LABEL changes from
    // Start to Resume when a save exists). The probe used to read #menu-start,
    // an id that no longer exists, and reported an eval error on every run.
    console.log('start label:', await evaluate(ws, 'document.getElementById("menu-resume").textContent'));
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

    // The achievement toast has to LEAD somewhere (owner ask 2026-08-05). It is
    // a button that opens the achievements list, and the only way to know it
    // still does is to earn one and click it.
    await evaluate(ws, `(() => {
      document.getElementById('menu-resume').click();
      const t = window.__tb;
      if (t) t.g.events.push({ type: 'achievement', name: 'Probe' });
      return !!t;
    })()`);
    await sleep(600);   // the toast is raised by the game loop's event drain
    console.log('ach toast:', await evaluate(ws, `(() => {
      const toast = document.getElementById('ach-toast');
      if (toast.hidden) return 'toast did not show';
      if (toast.tagName !== 'BUTTON') return 'toast is not a button: ' + toast.tagName;
      toast.click();
      return 'clicked -> menu=' + document.getElementById('menu').hidden +
             ' achView=' + document.getElementById('ach-view').hidden +
             ' rows=' + document.getElementById('ach-list').childElementCount +
             ' toastHidden=' + toast.hidden;
    })()`));
    // The icon key: every glyph the shop uses must have a line explaining it.
    console.log('icon key:', await evaluate(ws, `(() => {
      document.getElementById('ach-back').click();
      document.getElementById('menu-help').click();
      const k = document.getElementById('icon-key');
      return k ? k.childElementCount + ' rows' : 'MISSING';
    })()`));
    // The changelog behind the version number (0.11.4): entries must render
    // from the same updates.json the feed serves.
    console.log('changelog:', await evaluate(ws, `(async () => {
      document.getElementById('help-back').click();
      document.getElementById('version-btn').click();
      await new Promise((r) => setTimeout(r, 900));
      const n = document.getElementById('log-list').childElementCount;
      const state = document.getElementById('log-view').hidden ? 'HIDDEN' : 'shown';
      document.getElementById('log-back').click();
      return state + ', ' + n + ' entries';
    })()`));
    // 0.10's purchased surfaces render only once owned, so no click-through
    // reaches them by default and an exception there would ship silently
    // (which is exactly how the empty station panel once shipped). Own
    // everything, open everything, and let the exception hook do its job.
    console.log('owned surfaces:', await evaluate(ws, `(async () => {
      const t = window.__tb;
      if (!t) return 'no handle';
      const { sim, g } = t;
      const { ANCHORS } = await import('./src/data.js');
      document.getElementById('help-back').click();
      document.getElementById('menu-resume').click();
      g.money = 1e9; g.era = 3;
      for (const k of g.lines[0].stations.length < 8 ? [3, 4, 5, 6, 7] : []) {
        sim.extendTo(g, 0, 'tail', ANCHORS[k].geo, k);
      }
      for (const id of ['stats', 'works', 'patterns', 'diagram']) sim.buy(g, id);
      sim.setSkip(g, 0, 3, true);
      t.selectStation({ li: 0, i: 3 });   // the pattern button's home
      t.updateUI();
      const skipShown = !document.getElementById('sp-skip').hidden;
      const bulkShown = !!document.querySelector('#line-rows [data-bulk]');
      document.getElementById('menu-open').click();
      document.getElementById('menu-stats').click();   // closes the menu, opens the overlay (0.11.1)
      const statsRows = document.getElementById('stats-records').childElementCount;
      const statsOverlay = !document.getElementById('stats-overlay').hidden;
      document.getElementById('stats-close').click();
      document.getElementById('stats-toggle').click(); // the corner path opens it too
      const statsAgain = !document.getElementById('stats-overlay').hidden;
      document.getElementById('stats-close').click();
      document.getElementById('dia-toggle').click();
      await new Promise((r) => setTimeout(r, 500));
      const diaSvg = !!document.querySelector('#dia-mode svg');
      document.getElementById('dia-toggle').click();
      return 'skipBtn=' + skipShown + ' bulk=' + bulkShown +
             ' statsRecords=' + statsRows + ' overlay=' + statsOverlay +
             ' toggle=' + statsAgain + ' diagram=' + diaSvg;
    })()`));
  } finally {
    chrome.kill();
    server.kill();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
