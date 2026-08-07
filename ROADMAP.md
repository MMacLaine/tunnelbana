# Roadmap

The owner's rulings from the 2026-08-07 planning session (the "20 movements"
review), reconciled against what shipped. This file is the record; update it
when a ruling changes, and strike items when they land.

## Shipped

- **0.9.x** (same day, from live feedback): fleet transfers with queueing,
  era-scaled fleet cap, aims strip, mothballed transfers, six missing water
  zones, the 1950 plan gate (free spots unlock at Hökarängen; eras demand
  their corridors; corridor completion grants trust), stake salience,
  station-upgrade tooltips.
- **0.10.0**: clock + graded rush hours · incidents from 1957 · city notes
  (facts + commuter postcards) · statistics office · works department (bulk
  orders) · night report · era newspaper front pages (design pass 03) ·
  achievements 2.0 (81 aims, 8 categories, hidden + tiers) · six map
  curiosities incl. Silverpilen · synthesized sound · Linjekartan (schematic
  map) · Trafikledning (express stop patterns).
- **0.10.1**: design parity for the stats page, clock/rush chips, note
  toasts, amber incident markers.

## Agreed, not yet built

| Item | Ruling | Status |
|---|---|---|
| Achievements to 100+ | "ideally 100+, some easy, some very hard" | At 81; a ~20 top-up is a small release |
| Music | Copyright-free or credited, no third option | Waiting on a chosen CC0/credited track; SFX shipped synthesized |
| Ambient sound bed | Design direction exists (pass 03 §g), off by default | Deferred; free to defer |
| Live-network motif on front pages | Currently the design team's representative cut | Cosmetic refinement |
| Numbers with ceremony | "one for next update but not this one" | Next cycle |
| Trust as choices, not a timer | "maybe not on this pass, note for the future" | Big economy change; measure hard when taken |
| Visible city growth | "not this cycle but note for future" | Renderer work over the existing growth loop |
| Depots as places | Deferred from 0.10 scope (dev call, unchallenged) | Design notes in sim.js comments |
| Platform length | Same | Same |
| Time-of-day upgrades | Owner musing ("upgrades planned around time i wonder"), never firmed | Unresolved; raise before building |

## Skipped by explicit ruling (do not build without a new one)

- The ending timelapse (movement 10).
- The daily challenge (movement 18).

## The long game

Stockholm stays **free**. If it goes well: Steam, and a Nordic / European /
world expansion as the possible **paid** version. That decision shapes what
1.0 means; make it before building toward 1.0.

## Watch items (from measurement, awaiting live feedback)

- The era-1957 → 1964 trust climb (25 pk at ~30% coverage) is slow for an
  active player; red-corridor grants pay only at delivery. Candidate lever is
  trust-rate shaping — measured, not guessed.
- How new players take the 1950 plan fence (0.9.2's biggest personality
  change; softening lever is pricing, not removal).
- Whether rush grades read as fun or pressure.
- A devlog cadence: the report→fix→live loop is the game's best marketing
  and currently invisible on itch.
