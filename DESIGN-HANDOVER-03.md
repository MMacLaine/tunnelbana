# Tunnelbana · Design Handover, pass 03

For the design team, from the dev side. Pass 01 designed the **map**, pass 02
designed the **chrome around it**; both are live and holding up. Pass 03 is
about **ceremony and voice**: the moments, the records, the passage of time.
The 0.10 build adds a dozen systems (listed below with what each needs) and
every one of them currently gets programmer art. Nobody is attached to any
of it.

Read alongside `DESIGN-HANDOVER.md` section 3 (legal and technical
constraints, unchanged and restated at the bottom) and the pass-02 component
system in `ui.css`, which everything below should extend rather than replace.

## 1. The ask, in one sentence

Pass 03 designs the game's MOMENTS: the newspaper that marks an era, the
clock that says the city is alive, the record book, and the map on the
platform wall.

## 2. What the game is now (it grew again since pass 02)

Live two days on itch and maclaine.se, ~500 plays in the first 24 hours,
three releases since from player feedback. New since pass 02: the campaign
now follows the historical plan (free building unlocks when the 1950 line is
delivered), eras demand their corridors complete, the next staked station
pulses with a name and a dashed leader, a NEXT strip suggests what to do,
line rows carry train-transfer controls, and station upgrades explain
themselves on hover.

The 0.10 build (in progress on the dev side) adds: an in-game clock with
graded rush hours, service incidents from 1957 on, a stream of small fact and
commuter toasts, player-defined stop patterns, a purchasable statistics page,
era front pages, an achievements system redesigned for 100+, map easter
eggs, bulk upgrades, a richer while-you-were-away report, a schematic map
mode, and synthesized sound.

## 3. What to design, in priority order

**a. The era front page.** The flagship ask. Era transitions (five of them,
plus the SLUTSTATION ending) become a period newspaper front page fed by
LIVE data: the year, a headline about the line that just opened, the
player's actual numbers (riders carried, stations built, the network so
far). Design the layout system, not five posters: masthead, dateline,
headline slot, two or three stat callouts, a motif slot that takes the era's
line colour. Typography may be period-evocative but must be licensed or
free; the masthead must NOT read as Dagens Nyheter or any real paper —
invent one (the working placeholder is "Tunnelbanebladet"). One HTML/CSS
template with the data slots marked is the ideal deliverable; we will bind
the numbers.

**b. Achievements at scale.** The set grows from 22 to 100+, in categories
(building, service, riders, money, trust, history, night, endgame — final
grammar is yours), with hidden entries ("???" until earned) and tiered
families (the same aim at rising magnitudes). The pass-02 list rows work at
22 and will not survive 100: design the categorised list, the counts, the
hidden state, and a small glyph per category in the pass-01 icon grammar
(24 box, 2px stroke, currentColor). The toast stays as pass 02 built it.

**c. The statistics page.** A purchasable in-game upgrade ("the statistics
office"), so it should feel like a reward: a page of graphs and records.
Needs: a graph treatment (axis, gridline, series colour rules on both
themes), a records row (label, value, place name), and a per-line table that
seats 6-16 lines. Numbers use the tb-num system from pass 02.

**d. The clock and the rush grade.** A small HUD clock (the game day is 240
seconds; we render it as 24 in-game hours) and a chip that appears during
morning and evening peaks, then resolves to a grade for how well the network
carried the rush. Design the clock face/treatment (analogue tick, digital,
or typographic — your call) and the grade language (letters, percentages, or
words; five states from triumph to failure, and "failure" must read as
information, not punishment — there is no fail state in this game).

**e. Event language on the map.** Three new marker families, same grammar as
the pass-01 station glyphs: an INCIDENT (signal failure, stalled train —
amber-family, resolvable), a CURIOSITY (easter eggs: a ghost station, an odd
fact in the fabric of the city — quiet, discoverable, should NOT read as a
task), and the small toast anatomy for facts and commuter postcards
("Astrid · Hökarängen → Odenplan · 14 min") that must sit on the map edge
without competing with the achievement toast.

**f. The schematic map.** The payoff of the whole fantasy: a purchasable
toggle from the geographic night map to a diagram in the tradition of
Beck-style transit maps — the map on the platform wall, drawn by the player.
The diagram grid coordinates already exist for all 59 stations. Needs: a
style for the diagram surface (background, line weights, station ticks,
interchange marks, terminus caps, label rules) in BOTH themes, distinct from
but sibling to the night map. Constraint reminder: this may evoke the genre
of transit diagrams, not any operator's actual map — no roundel, no SL
lozenge, none of SL's specific iconography.

**g. Sound direction (optional).** The dev side is shipping synthesized
effects (bell, departure, chime, era sting) generated in code, which keeps
the zero-dependency and zero-licensing rules. If the team wants to art-direct
audio — pitch, character, a palette of tones — that direction is welcome.
Any REAL audio asset must be CC0 or licensed with attribution we can print
in the About panel; nothing enters the build without its credit line
(owner rule, 2026-08-07).

## 4. What "usable for the dev side" means (unchanged from pass 02)

- CSS custom properties over pixel specs; extend `tokens.css`/`tokens-ui.css`.
- States as CSS, SVG only where a shape cannot be drawn in CSS.
- SVG iconography single-colour on currentColor, pass-01 grammar.
- One HTML mockup page per major surface, every component in every state; we
  port from it directly (pass 02's mockup went in nearly verbatim).
- Both themes, or an explicit ruling that a surface is dark-only.

## 5. Constraints that have not changed

- No operator branding: no roundel, no SL marks, no "Storstockholms
  Lokaltrafik". Real station names are geography and stay.
- The map is never obscured by default chrome. Full-screen surfaces are
  deliberate moments only — the era front page IS such a moment, the
  statistics page opens over the menu, the schematic mode REPLACES the map
  (it is a map) rather than covering it.
- English UI; Swedish only as real names or real signage.
- Legibility over atmosphere at small sizes.
- New for pass 03: anything with an outside origin (type, imagery, audio,
  quoted fact) ships with its licence checked and its credit written into
  the About panel. Copyright-free or credited, no third option.

## 6. Where to see it

`node _dev/serve.mjs`, then localhost:8123. Play the opening (the plan gate
and NEXT strip are new), click a station (hover the upgrade buttons), and
look at an era transition — that plain card is what section 3a replaces.
Screenshots of any state on request, including late-game networks; the
headless harness can produce states that are hard to reach by playing.
