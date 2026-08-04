# Tunnelbana

An incremental game about building Stockholm's rail transit, starting from the 1950
tunnelbana line. The map is the progress bar.

**Status: Milestone 0.** The hardcoded 1950 line (Slussen to Hökarängen), a departure
bell, fares, upkeep, and a handful of purchases. M0 exists to answer one question:
is dispatch-and-earn fun on its own?

## Run

Any static file server from the repo root, then open the page:

```
node _dev/serve.mjs
# http://localhost:8123/
```

(ES modules do not load from `file://`, so a server is required.)

## Checks

```
node _dev/smoke.mjs   # DOM-free sim: 10 minutes of simulated active play, exits nonzero on a stalled arc
```

## Architecture rules (short form)

- Vanilla JS, no framework, no TypeScript. One vendored library: MapLibre GL for the
  basemap (OpenFreeMap dark vector tiles; CDN during dev, vendor before any release).
- The game layer is a canvas overlay projected through `map.project` per frame; no
  WebGL or no network degrades to a static fallback projector, never a dead page.
- Canvas draws the game layer only; every number and panel is DOM.
- `geo` coordinates drive all simulation. Water-crossing costs use OUR authored
  rings, never tile data.
- Sim (`src/sim.js`) stays DOM-free so it runs under node.
- Saves are versioned (`saveVersion`) with forward-only migrations.

The full design plan lives in the owner's planning space, not in this repo.

Unofficial fan work. Not affiliated with SL or Region Stockholm.
