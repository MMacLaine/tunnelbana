# Tunnelbana · Build Stockholm

An incremental game about building Stockholm's underground, from the first tunnel of 1950
outward. You start with three stations, ring a bell to send a train, and grow a network
across the decades until the map on your screen looks like the one on the platform wall.

**The map is the progress bar.** The city sits under a dark veil and lights up around every
station you build. Nothing in the game ever makes the map smaller or uglier.

It is finite and finishable: roughly twenty hours of active play across five eras, ending in
a sandbox where the constraints come off. No prestige resets, no fail state. Idle-friendly,
but never idle-only.

> Unofficial fan work. Not affiliated with any transit operator or Region Stockholm.
> Station names and geography are facts about the city; everything else is a game.

## Play

Any static server from the repo root:

```
node _dev/serve.mjs      # http://localhost:8123
```

The dev server sends `no-store`, which matters: browsers cache ES modules aggressively, and
a stale module is an afternoon spent debugging a bug you already fixed. ES modules do not
load over `file://`, so a server is required either way.

Release builders stamp every module URL by the shipped content, so a returning browser cannot
pair a new page with an older game module.

## What is in here

| Path | What it is |
| --- | --- |
| `src/sim.js` | The whole simulation. DOM-free, deterministic, importable by tests. |
| `src/render.js` | Canvas layer: lines, trains, stations, the veil. Reads the sim, never writes it. |
| `src/main.js` | DOM, input, menus, the shop. The only file that touches the browser. |
| `src/data.js` | Stockholm: 59 real station anchors in corridors, district weights, water. |
| `basemap/` | A custom MapLibre style for the night map. |
| `_dev/` | Harnesses: smoke suite, value gate, measurement probes, itch builder. |
| `tunnelbana-assets-pass01/` | Design system: palette, glyphs, icon grammar, type. |

## Design rules

These are load-bearing, not preferences. Most were paid for with a bug.

- **Zero runtime dependencies.** One vendored library (MapLibre GL) for the basemap; that is
  the entire dependency list, and it is checked in rather than fetched.
- **The sim owns truth, the renderer owns pixels.** Every dot on screen is read from sim
  state. No visual may invent a number, because then two numbers exist and one of them is
  wrong.
- **Aggregate flows, never agents.** Passengers are quantities moving between stations, so a
  59-station network costs about the same per frame as a three-station one.
- **One constructor per entity.** Harnesses call `sim.addTrain()` rather than writing an
  object literal, and the smoke test lints for literals and fails if it finds one. A
  hand-built train once missed a field added later, could never dispatch, and quietly
  invalidated a whole round of measurements.
- **Every purchase must measurably pay.** `_dev/value-gate.mjs` buys each upgrade in the
  regime where it should matter and fails the build if it does not improve income. It also
  flags anything worth under 1% of its scenario's income as `THIN`, because that is how a
  live feature decays into dead content without anyone noticing.
- **Balance changes are measured, not argued.** The `_dev/probe-*.mjs` scripts are kept
  alongside the findings they produced, so a decision can be re-derived later instead of
  re-litigated.

## Checks

```
node _dev/smoke.mjs        # scenario suite: an arc of play, placement, eras, saves, pacing
node _dev/value-gate.mjs   # every purchase must earn its keep, measured
```

Both exit non-zero on failure and gate any commit that touches the economy.

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, tiles by
[OpenFreeMap](https://openfreemap.org), rendering by [MapLibre GL JS](https://maplibre.org)
(BSD-3). Typeface IBM Plex Mono (SIL OFL). Built by Matthew MacLaine.
