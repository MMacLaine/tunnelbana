// Build the itch.io zip: everything the game needs, all local except the tile
// service. Run: node _dev/build-itch.mjs  -> dist/tunnelbana.zip
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, cpSync, statSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const STAGE = join(ROOT, 'dist', 'stage');
const ZIP = join(ROOT, 'dist', 'tunnelbana.zip');

rmSync(join(ROOT, 'dist'), { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

// incrementaldb.txt is TEMPORARY: an ownership token for the incrementaldb.com
// listing, reachable at <build root>/incrementaldb.txt once uploaded. Remove it
// here and delete the file once verification is confirmed.
// updates.json ships IN the zip as of 0.11.4: the in-game changelog reads it
// relative. This is a build-time snapshot for display; the live FEED for
// incrementaldb remains the stable maclaine.se URL, never the zip's.
const INCLUDE = ['index.html', 'tokens.css', 'tokens-ui.css', 'ui.css', 'ui-moments.css', 'ui-council.css', 'ui-train.css',
                 'favicon.svg', 'incrementaldb.txt', 'updates.json',
                 'src', 'vendor', 'fonts', 'basemap', 'audio'];
for (const item of INCLUDE) {
  cpSync(join(ROOT, item), join(STAGE, item), { recursive: true });
}

// itch serves static files too, so a returning player can pair this build's
// HTML with an earlier module graph unless the package changes every module
// URL. The site deployer stamps its copy the same way. Hash the staged bytes
// and rewrite only the staged package: source imports stay readable in git.
const hashSrc = ['src/main.js', 'src/sim.js', 'src/render.js', 'src/data.js', 'src/facts.js', 'src/sound.js', 'src/diagram.js', 'ui.css', 'ui-moments.css', 'ui-council.css', 'ui-train.css', 'tokens-ui.css', 'tokens.css']
  .map((f) => readFileSync(join(STAGE, f))).join('\n');
const stamp = createHash('sha256').update(hashSrc).digest('hex').slice(0, 10);
const htmlPath = join(STAGE, 'index.html');
writeFileSync(htmlPath, readFileSync(htmlPath, 'utf8').replace(/\?v=[0-9a-z.]+/g, '?v=' + stamp));
const IMPORT_RE = /(\bfrom\s+['"])(\.\.?\/[\w./-]+\.js)(['"])/g;
for (const name of ['main.js', 'sim.js', 'render.js', 'data.js', 'facts.js', 'sound.js', 'diagram.js']) {
  const p = join(STAGE, 'src', name);
  const src = readFileSync(p, 'utf8');
  writeFileSync(p, src.replace(IMPORT_RE, (_m, a, spec, z) => a + spec + '?v=' + stamp + z));
  const unstamped = [...readFileSync(p, 'utf8').matchAll(/\bfrom\s+['"](\.\.?\/[^'"]+)['"]/g)]
    .map((m) => m[1]).filter((spec) => !spec.includes('?v='));
  if (unstamped.length) throw new Error('UNSTAMPED IMPORT in src/' + name + ': ' + unstamped.join(', '));
}

// Guard: every staged file, not just the HTML, and the allowlist names the
// runtime endpoints explicitly so adding one is a deliberate edit here.
const RUNTIME = new Set(['tiles.openfreemap.org', 'maclaine.se',
                         'static.cloudflareinsights.com']);
const CREDIT = new Set(['openfreemap.org', 'www.openstreetmap.org', 'maplibre.org',
                        'opengameart.org']);
// Not network calls at all: XML namespaces and source comments. Named rather
// than folded into the allowlist, so the distinction stays visible.
const INERT = new Set(['www.w3.org', 'github.com']);
function scan(dir, hits) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { scan(p, hits); continue; }
    if (!/\.(html|js|css|json|svg)$/i.test(name)) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(/https?:\/\/([^/"'\s)]+)/g)) {
      if (!hits.has(m[1])) hits.set(m[1], []);
      hits.get(m[1]).push(name);
    }
  }
  return hits;
}
const hits = scan(STAGE, new Map());
const bad = [...hits.keys()].filter((h) => !RUNTIME.has(h) && !CREDIT.has(h) && !INERT.has(h));
if (bad.length) {
  console.error('UNEXPECTED EXTERNAL HOSTS:', bad.map((h) => h + ' (' + hits.get(h).join(', ') + ')').join('; '));
  process.exit(1);
}
const runtimeSeen = [...hits.keys()].filter((h) => RUNTIME.has(h));

execFileSync('zip', ['-qr', ZIP, '.'], { cwd: STAGE });
rmSync(STAGE, { recursive: true, force: true });
const kb = Math.round(statSync(ZIP).size / 1024);
// State what was actually found, rather than asserting it in prose.
console.log(`dist/tunnelbana.zip ready (${kb} KB).`);
console.log(`module graph stamped ${stamp}.`);
console.log('runtime external hosts found: ' + (runtimeSeen.join(', ') || 'none'));
