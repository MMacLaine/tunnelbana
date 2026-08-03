# Tunnelbana

An incremental game about building Stockholm's rail transit, starting from the 1950
tunnelbana line. The map is the progress bar.

**Status: Milestone 0.** The hardcoded 1950 line (Slussen to Hökarängen), a departure
bell, fares, upkeep, and a handful of purchases. M0 exists to answer one question:
is dispatch-and-earn fun on its own?

## Run

Any static file server from the repo root, then open the page:

```
python3 -m http.server 8123
# http://localhost:8123/
```

(ES modules do not load from `file://`, so a server is required.)

## Checks

```
node _dev/smoke.mjs   # DOM-free sim: 10 minutes of simulated active play, exits nonzero on a stalled arc
```

## Architecture rules (short form)

- Vanilla JS, zero runtime dependencies, no framework, no TypeScript.
- Canvas draws the map only; every number and panel is DOM.
- `geo` coordinates drive all simulation; `dia` grid coordinates drive interaction
  and rendering.
- Sim (`src/sim.js`) stays DOM-free so it runs under node.
- Saves are versioned (`saveVersion`) with forward-only migrations.

The full design plan lives in the owner's planning space, not in this repo.

Unofficial fan work. Not affiliated with SL or Region Stockholm.
