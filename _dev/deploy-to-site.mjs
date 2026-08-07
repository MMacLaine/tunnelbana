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
// incrementaldb.txt is TEMPORARY: an ownership token for the incrementaldb.com
// listing. Remove it here and delete the file once verification is confirmed.
// updates.json is the incrementaldb.com update feed (polled daily): newest
// entry first, unique version strings, Markdown content. It lives here so a
// release and its changelog ship in the same push.
const SHIP_FILES = ['index.html', 'favicon.svg', 'tokens.css', 'tokens-ui.css', 'ui.css',
                    'ui-pass03.css', 'incrementaldb.txt', 'updates.json'];
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

// The published copies carry cache-busting stamps that the sources do not, so
// a byte comparison would report every HTML and JS file as changed on every
// run (and make --check useless). Compare with the stamps normalised away.
function comparable(path, rel) {
  const buf = readFileSync(path);
  if (!/\.(html|js)$/.test(rel)) return buf;
  return Buffer.from(buf.toString('utf8').replace(/\?v=[0-9a-z.]*/g, ''), 'utf8');
}

for (const [rel, src] of wanted) {
  const dst = join(SITE, rel);
  if (!existing.has(rel)) {
    added.push(rel);
  } else if (comparable(src, rel).compare(comparable(dst, rel)) !== 0) {
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
const hashSrc = ['src/main.js', 'src/sim.js', 'src/render.js', 'src/data.js', 'src/facts.js', 'ui.css', 'ui-pass03.css', 'tokens-ui.css', 'tokens.css']
  .map((f) => readFileSync(join(SRC, f))).join('\n');
const stamp = createHash('sha256').update(hashSrc).digest('hex').slice(0, 10);
if (!CHECK) {
  const htmlPath = join(SITE, 'index.html');
  const html = readFileSync(htmlPath, 'utf8').replace(/\?v=[0-9a-z.]+/g, '?v=' + stamp);
  writeFileSync(htmlPath, html);
}
// ...and the SAME stamp has to travel down the module graph. index.html busts
// main.js, but main.js imports './sim.js' with no query at all, so a browser or
// edge node holding a 4-hour-old sim.js pairs it with a brand-new main.js. That
// is not theoretical: v0.8.2 shipped and the live page threw
// "sim.pkCap is not a function" on load, a new main calling into an old sim.
// Every relative import in a shipped module gets the stamp, so one changed byte
// anywhere gives the whole graph new URLs. Third time this bug class has
// bitten (version query, duplicate version, now the graph below the entry
// point), hence the assertion below rather than just the fix.
if (!CHECK) {
  const IMPORT_RE = /(\bfrom\s+['"])(\.\.?\/[\w./-]+\.js)(['"])/g;
  for (const rel of wanted.keys()) {
    if (!rel.endsWith('.js') || !rel.startsWith('src/')) continue;
    const p = join(SITE, rel);
    const src = readFileSync(p, 'utf8');
    const out = src.replace(IMPORT_RE, (_m, a, spec, z) => a + spec + '?v=' + stamp + z);
    if (out !== src) writeFileSync(p, out);
    // Re-read what was actually written and assert it: the rewrite above is a
    // regex, and a regex that silently matches nothing is how this shipped.
    const left = [...readFileSync(p, 'utf8').matchAll(/\bfrom\s+['"](\.\.?\/[^'"]+)['"]/g)]
      .map((m) => m[1]).filter((spec) => !spec.includes('?v='));
    if (left.length) {
      console.error('UNSTAMPED IMPORT in ' + rel + ': ' + left.join(', '));
      process.exit(1);
    }
  }
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
// The update feed must lead with the version being shipped, or incrementaldb
// (which polls it daily and keys on the version string) announces the previous
// release forever. Same class of guard as the tb-version assertion above:
// things that must move together are checked together.
{
  let feed;
  try {
    feed = JSON.parse(readFileSync(join(SRC, 'updates.json'), 'utf8'));
  } catch (e) {
    console.error('updates.json is not valid JSON: ' + e.message);
    process.exit(1);
  }
  const top = feed?.updates?.[0];
  if (!top || top.version !== version) {
    console.error(`FEED SKEW: updates.json leads with ${top?.version || 'nothing'} but the game is ${version}. ` +
      'Write the changelog entry before shipping the release.');
    process.exit(1);
  }
  const seen = new Set();
  for (const u of feed.updates) {
    if (!u.version || !u.title || !u.content || seen.has(u.version)) {
      console.error('updates.json: every entry needs a unique version, a title and content.');
      process.exit(1);
    }
    seen.add(u.version);
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
