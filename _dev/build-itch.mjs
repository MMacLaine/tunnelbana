// Build the itch.io zip: everything the game needs, all local except the tile
// service. Run: node _dev/build-itch.mjs  -> dist/tunnelbana.zip
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, cpSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const STAGE = join(ROOT, 'dist', 'stage');
const ZIP = join(ROOT, 'dist', 'tunnelbana.zip');

rmSync(join(ROOT, 'dist'), { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

const INCLUDE = ['index.html', 'tokens.css', 'favicon.svg', 'src', 'vendor', 'fonts', 'basemap'];
for (const item of INCLUDE) {
  cpSync(join(ROOT, item), join(STAGE, item), { recursive: true });
}

// Guard: the shipped page may reference exactly one external host (the tiles).
const html = readFileSync(join(STAGE, 'index.html'), 'utf8');
const externals = [...html.matchAll(/https?:\/\/([^/"'\s]+)/g)].map((m) => m[1]);
const allowed = new Set(['openfreemap.org', 'www.openstreetmap.org', 'maplibre.org']); // credit links, not runtime deps
const bad = externals.filter((h) => !allowed.has(h));
if (bad.length) {
  console.error('UNEXPECTED EXTERNAL HOSTS in index.html:', bad.join(', '));
  process.exit(1);
}

execFileSync('zip', ['-qr', ZIP, '.'], { cwd: STAGE });
rmSync(STAGE, { recursive: true, force: true });
const kb = Math.round(statSync(ZIP).size / 1024);
console.log(`dist/tunnelbana.zip ready (${kb} KB). Only external endpoint: tiles.openfreemap.org (style source).`);
