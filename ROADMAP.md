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

## In the build (0.11, unreleased)

The upgrades dig (2026-08-08): a play-based unlock grammar (stations,
delivered, coverage, corridor, hubs, retail, achievement — layered on era,
locked cards name their condition), the shop grouped by category, and a
measured batch aimed at the 1957 desert probe-arc found (worst gap 753 s →
192 s): Rulltrappor, Stationsvärdar, Reklamavtal, artstation moved to 1957
and deepened to three levels. `seasonpass` (the fare-vs-demand choice
upgrade) was CUT by the value gate at −19.96 kr/s in its own regime; the
lesson is recorded in the catalog. Remaining dominant wait is the 1964
trust wall (11.6/25 pk at t=3600), already a watch item below.

Second 0.11 slice (owner asks, 2026-08-08): the menu no longer pauses the
game (era front pages still do); MUSIC — "Morning Rain" and "Countryside"
by TAD, OpenGameArt, CC0, vendored, credited in About, lazy-loaded — with a
Master/Music/Effects mixer in Settings (old sound toggle migrates);
achievements topped up to 104 (the 100+ ask closed); the numbers ceremony
(counters beat on upward power-of-ten crossings — pass-02 item e closed);
and a live-report fix: reset/import now clears the previous life's
away-report note.

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

Ruled 2026-08-08, superseding the earlier Steam note. Stockholm stays
**free**, and the game is a standalone PoC/prototype that is going well.
Steam is unlikely ever. If a **v2** happens, platform and expansion
questions return as considerations then, not before. Swedish localisation
is ruled out.

## v12 slate (planned 2026-08-08, owner-approved)

The council (a trust tree framework, mixed currencies, data-driven and
built to grow) · visible city growth · insert a station mid-line · anonymous
milestone telemetry ("within reason") · golden trains (click for a small
bonus) · the schematic map becomes a reward for beating era one · depots as
places · platform length · save slots · the ambient sound bed (sound stays
a small part, not a large one). Dropped from the ten: Swedish localisation,
the Steam spike.

## Watch items (from measurement, awaiting live feedback)

- ~~The era-1957 → 1964 trust climb~~ RESOLVED in 0.11.0 (two live reports
  plus the probe forced the call): the proven-operator bonus, trust rate
  x(1 + 0.4 x era). Measured: the 1950 opening unchanged to the second, the
  1964 wall down from 12+ minutes to ~3 for a maximally hub-greedy player.
  Watch whether trust now feels too cheap late.
- How new players take the 1950 plan fence (0.9.2's biggest personality
  change; softening lever is pricing, not removal).
- Whether rush grades read as fun or pressure.
- A devlog cadence: the report→fix→live loop is the game's best marketing
  and currently invisible on itch.
