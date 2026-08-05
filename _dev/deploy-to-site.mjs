// Publish the game to maclaine.se/tunnelbana.
//
// The site is a separate Cloudflare Pages project (repo: personal-website) and
// the owner wants a PATH on the apex domain rather than a subdomain, so there
// is no DNS to set up. That means the shipping files are copied into the site
// repo under /tunnelbana and deploy with it.
//
// THIS REPO REMAINS THE SOURCE OF TRUTH. Never edit personal-website/tunnelbana
// by hand: run this, and it mirrors exactly, deleting anything that no longer
// exists here. The site's deploy-build.mjs works from an explicit finance file
// list, so it passes these files through untouched.
//
//   node _dev/deploy-to-site.mjs            # copy, then print what changed
//   node _dev/deploy-to-site.mjs --check    # report drift only, change nothing
import { readdirSync, statSync, mkdirSync, copyFileSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const SRC = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SITE = '/Users/matthewmaclaine/personal website/tunnelbana';
const CHECK = process.argv.includes('--check');

// What a player needs, and nothing else: no harnesses, no design kit, no docs.
const SHIP_FILES = ['index.html', 'favicon.svg', 'tokens.css', 'tokens-ui.css', 'ui.css'];
const SHIP_DIRS = ['src', 'basemap', 'fonts', 'vendor'];

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(relative(base, p));
  }
  return out;
}

const wanted = new Map(); // relative path -> absolute source
for (const f of SHIP_FILES) {
  if (!existsSync(join(SRC, f))) throw new Error('missing ship file: ' + f);
  wanted.set(f, join(SRC, f));
}
for (const d of SHIP_DIRS) {
  const abs = join(SRC, d);
  if (!existsSync(abs)) throw new Error('missing ship dir: ' + d);
  for (const rel of walk(abs)) wanted.set(join(d, rel), join(abs, rel));
}

const existing = existsSync(SITE) ? new Set(walk(SITE)) : new Set();
const added = [], updated = [], removed = [];

for (const [rel, src] of wanted) {
  const dst = join(SITE, rel);
  if (!existing.has(rel)) {
    added.push(rel);
  } else if (readFileSync(src).compare(readFileSync(dst)) !== 0) {
    updated.push(rel);
  }
  if (!CHECK) {
    mkdirSync(join(dst, '..'), { recursive: true });
    copyFileSync(src, dst);
  }
}
for (const rel of existing) {
  if (wanted.has(rel)) continue;
  removed.push(rel);
  if (!CHECK) rmSync(join(SITE, rel));
}

const version = (readFileSync(join(SRC, 'src/sim.js'), 'utf8').match(/VERSION = '([^']+)'/) || [])[1];

// Cache-bust by CONTENT, not by version number. Busting by version failed the
// moment two different builds shipped under the same version: the CDN kept
// serving the first main.js for ?v=0.8.0 for hours, which is the same
// stale-pairing bug one layer out. A hash of the actual shipped code cannot
// drift from the code, and needs nobody to remember anything.
const hashSrc = ['src/main.js', 'src/sim.js', 'src/render.js', 'src/data.js', 'ui.css', 'tokens-ui.css', 'tokens.css']
  .map((f) => readFileSync(join(SRC, f))).join('\n');
const stamp = createHash('sha256').update(hashSrc).digest('hex').slice(0, 10);
{
  const htmlPath = join(SITE, 'index.html');
  const html = readFileSync(htmlPath, 'utf8').replace(/\?v=[0-9a-z.]+/g, '?v=' + stamp);
  writeFileSync(htmlPath, html);
}
// index.html cache-busts its module and stylesheets with ?v=<version>. If that
// drifts from the version, a browser can pair a new page with a stale script,
// which is precisely how v0.8.0 shipped a permanent loading screen.
{
  const html = readFileSync(join(SRC, 'index.html'), 'utf8');
  const meta = (html.match(/name="tb-version" content="([^"]+)"/) || [])[1];
  if (meta !== version) {
    console.error(`VERSION SKEW: index.html declares tb-version ${meta} but the game is ${version}.`);
    process.exit(1);
  }
}
console.log(`tunnelbana v${version} (assets stamped ${stamp}) -> ${SITE}`);
console.log(`  ${wanted.size} files · +${added.length} added · ~${updated.length} changed · -${removed.length} removed`);
for (const r of [...added.slice(0, 5), ...updated.slice(0, 5)]) console.log('    ' + r);
if (added.length + updated.length > 10) console.log('    ...');
if (CHECK && (added.length || updated.length || removed.length)) {
  console.error('DRIFT: the published copy differs from this repo. Run without --check.');
  process.exit(1);
}
