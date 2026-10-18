// Keep the repo's GitHub traffic past the 14 days GitHub holds it. Run daily
// by .github/workflows/traffic.yml, which checks the `traffic` branch out into
// a folder and commits whatever this writes there. Counts only: GitHub never
// says who viewed or cloned.
//   GITHUB_TOKEN=<token with Administration: read> node _dev/traffic.mjs <file>
// Days are rewritten on every run, so a day recorded while it was still in
// progress settles to its final count the next morning. Referrers and paths
// are rolling 14-day totals, so they are kept as one snapshot per run date.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const REPO = process.env.GITHUB_REPOSITORY || 'MMacLaine/tunnelbana';
const TOKEN = process.env.GITHUB_TOKEN;
const FILE = process.argv[2];
if (!TOKEN || !FILE) throw new Error('usage: GITHUB_TOKEN=... node _dev/traffic.mjs <file>');

async function get(path) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/traffic/${path}`, {
    headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const data = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};
data.days ??= {};
data.referrers ??= {};
data.paths ??= {};

const [views, clones, referrers, paths] = await Promise.all([
  get('views'), get('clones'), get('popular/referrers'), get('popular/paths'),
]);
for (const v of views.views) {
  const d = (data.days[v.timestamp.slice(0, 10)] ??= {});
  d.views = v.count; d.viewers = v.uniques;
}
for (const c of clones.clones) {
  const d = (data.days[c.timestamp.slice(0, 10)] ??= {});
  d.clones = c.count; d.cloners = c.uniques;
}
const today = new Date().toISOString().slice(0, 10);
data.referrers[today] = referrers.map(r => ({ from: r.referrer, views: r.count, viewers: r.uniques }));
data.paths[today] = paths.map(p => ({ path: p.path, views: p.count, viewers: p.uniques }));

// Sorted keys keep each day's commit diff to the lines that changed.
const sorted = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
data.days = sorted(data.days);
data.referrers = sorted(data.referrers);
data.paths = sorted(data.paths);
writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');

const all = Object.values(data.days);
const sum = k => all.reduce((n, d) => n + (d[k] || 0), 0);
console.log(`${all.length} days on record, ${sum('views')} views, ${sum('clones')} clones`);
