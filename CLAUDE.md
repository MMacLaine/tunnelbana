# Working in this repo

Tunnelbana · Build Stockholm: a finite incremental game, live on two surfaces
with real players. `README.md` carries the design rules (they are load-bearing;
most were paid for with a bug). `ITCH.md` carries publishing in full. This file
is the short version Claude should follow without being asked.

## Gates

Any change to the economy or the sim runs these before it is called done, and
they gate every release:

```
node _dev/smoke.mjs          # exit 0
node _dev/value-gate.mjs     # exit 0
node _dev/probe-console.mjs  # no [EXCEPTION] lines (takes an optional URL)
```

Balance changes are measured with a `_dev/probe-*.mjs` script, never argued.
Never hand-build a sim entity (train, station) in a harness or a test: use the
constructors (`sim.addTrain`), the smoke suite lints for literals.

## Releasing (the 0.9.0 sequence, verified 2026-08-07)

1. **Version**: bump `VERSION` in `src/sim.js` AND `tb-version` in
   `index.html` (deploy asserts they match).
2. **Changelog**: add the entry at index 0 of `updates.json`, unique
   `version` matching `VERSION` (deploy asserts this too), `title`,
   `content` in Markdown. Style: standard game patch notes. A one-line
   context sentence if needed, then plain factual bullets stating what
   changed and what it means for the player. Objective and to the point.
   No jokes, no asides, no marketing rhythm. The wry first-person voice
   belongs to the itch STORE PAGE only (see ITCH.md), never to patch
   notes. Owner feedback, both directions, 2026-08-07: the first draft
   was "AI" marketing prose, the correction over-swung into inserted
   personality ("no one speaks like this"). Owner rule 2026-08-08: no
   colons, semicolons, or dashes as punctuation in change notes or any
   in-game flavour text. Write "Fixed the X" rather than "Fixed: X".
   Markdown "- " list markers are structure and stay.
3. Run the three gates above, then commit here and push.
4. **maclaine.se**: `node _dev/deploy-to-site.mjs`, then in
   `/Users/matthewmaclaine/personal website` stage ONLY `tunnelbana/`
   (`git add tunnelbana`), commit, push. Cloudflare Pages deploys on push;
   the game and the feed go live together, usually within a minute.
5. **itch** (needs the owner's explicit go, every time — pushing to ~live
   players stays a decision):
   ```
   node _dev/build-itch.mjs
   butler push dist/tunnelbana.zip maclaine/tunnelbana-build-stockholm:html --userversion <version>
   butler status maclaine/tunnelbana-build-stockholm:html   # wait for the ✓
   ```
6. **Verify live**: `curl -sL https://www.maclaine.se/tunnelbana/updates.json`
   leads with the new version, and
   `node _dev/probe-console.mjs https://www.maclaine.se/tunnelbana/` is clean.

## butler (itch CLI)

Lives at `/opt/homebrew/bin/butler` with `7z.so` and `libc7zip.dylib` beside
it; credentials in `~/Library/Application Support/itch/butler_creds`. If it is
ever missing, install from itch's CDN, NOT homebrew (`brew install butler` is
an unrelated Mac launcher app):

```
curl -sL -o butler.zip "https://broth.itch.zone/butler/darwin-amd64/LATEST/archive/default"
unzip butler.zip && install -m 755 butler 7z.so libc7zip.dylib /opt/homebrew/bin/
```

`butler login` needs a real terminal (not the in-session `!` shell).

## The two data streams (do not conflate)

Both live in the site repo's `FEEDBACK` KV namespace, but they are different
in kind and each reader labels itself with a `kind` field:

- **Feedback** (`fb:` prefix, `/api/feedback?key=…`) is WORDS: a player typed
  a note and chose to send it, with a game-context line. Read every one;
  answer where there is somewhere to answer (itch comments).
- **Telemetry** (`tm:` prefix, `/api/pulse?key=…`, added 0.12.0) is NUMBERS
  the game sends by itself: start / era / ending milestones with seconds
  played, version, surface, country. Nobody wrote it and no one is
  identified. Read it as distributions (`eraMedianMin` is the headline
  number, checked against probe-arc's predictions), never as individuals.

A pulse can never contain player text; a feedback note is never pacing data.

## incrementaldb.com

They poll `https://www.maclaine.se/tunnelbana/updates.json` daily around
midnight UTC and key on the version string, so shipping the changelog entry
(step 2 above) IS the incrementaldb update: nothing else to do per release.
The listing itself is pending their council review; once confirmed, give them
that feed URL if they do not have it.

## Saves are sacred

The game is live: every sim change must consider a returning save. Migrations
are forward-only, clamp rather than delete, and anything a player would notice
gets a `VERSION` bump plus a line in the migration note. `hydrate()` must
tolerate every field it reads being absent or hostile.
