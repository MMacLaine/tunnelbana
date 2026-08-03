# Tunnelbana · Design Handover

> **Status update**: pass 01 received and integrated (see `tunnelbana-assets-pass01/` and
> its DESIGN-DOC.md, which is now the visual source of truth alongside `tokens.css`).
> One ruling from the flagged contradiction in section 3: the operator-neutral disclaimer
> wording ("not affiliated with any transit operator or Region Stockholm") is adopted for
> in-game copy and art; plain-text store pages may name the operator nominatively in the
> disclaimer sentence only. Open asks for pass 02 are tracked with the owner.

For the design team, from the dev side. You have **full creative control** over everything
visual in this document except the constraints in section 3, which are legal or technical.
Everything currently on screen is programmer art and carries no attachment; replace freely.

## 1. What this is

**Tunnelbana** (working subtitle: *Build Stockholm*) is an incremental/idle browser game.
You start with three stations of the real 1950 tunnelbana line (Slussen to Hökarängen) on a
real dark map of Stockholm, dispatch trains, earn fares, and build the network out across
decades: green line, red line, blue line, pendeltåg, trams, into a speculative future. It is
a finite game (~20 hours of active play) with an ending. Persistent, no fail state, no
resets: the joy is money going up and the map growing.

**The design fantasy in one line: the map is the progress bar.** Stockholm ships hidden under
a dark veil and is revealed around every station the player builds. The city literally lights
up where the network reaches. Nothing may ever make the map smaller or uglier.

Feel references, in priority order:
- **Mini Metro**: interaction and restraint. Lines are dragged directly on the map, the map
  is the whole interface, passengers are dots.
- **Cookie Clicker**: the economy shape. Many small purchases, a future catalog of 100+
  upgrades, numbers that climb.
- **The real SL diagram tradition**: the aesthetic family we are near, but legally must not
  copy (section 3).

To see the current state: any static file server in the repo root (`python3 -m http.server
8123`), open localhost:8123. Ten minutes of play shows nearly everything that exists.

## 2. Current interim design language (all replaceable)

- Dark-first. Background #0b0f14, panels rgba(13,19,29,0.86) with blur, ink #e9eef4,
  muted #8b98a6, line-green #2fa860, amber #d9a441 (money/attention), red #c25549 (refusal).
- Monospace throughout (system stack). Letter-spaced caps for titles ("T U N N E L B A N A").
- HUD in four corners over a full-viewport map: money top-left, dispatch bell + hints
  bottom-left, upgrade cards + stats right, attribution bottom-right. Menu is a left-aligned
  panel over a dimmed backdrop.
- Game layer drawn in canvas: station circles (white stroke, dark fill), pulsing green rings
  on the two grabbable line ends, dashed ghost rings on unbuilt real stations, passenger dots
  in rows beside platforms, trains as green pills with an onboard count, floating amber
  payout texts.

The owner's broader design taste (his other properties): /r/designporn as the bar, dark
mode as the primary mood, no centered hero layouts (left axis), quiet confidence over
decoration. The game may diverge where a game should, but that is the home style.

## 3. Hard constraints (not open to creative interpretation)

**Legal**
- No SL roundel, anywhere, ever. The strings "SL" and "Storstockholms Lokaltrafik" must not
  appear in art, copy, or metadata. Station names and geography are facts and are fine.
- The palette and any diagram-style art must be recognisably *in the family* of Stockholm
  transit but **not a pixel match** of SL's colours or a reproduction of their map (a transit
  diagram is a copyrightable artistic work). Line colours in the green/red/blue family are
  fine; SL's exact hex values plus their layout is not.
- "Unofficial fan work, not affiliated with SL or Region Stockholm" stays visible somewhere
  unobtrusive.

**Technical**
- The game layer is Canvas 2D at 60fps and the HUD is plain DOM/CSS. Assets land as SVG
  (preferred, flat, ideally currentColor-friendly) or PNG @2x. No fonts over ~2 weights/faces
  loaded at runtime; webfonts are fine if licensed for embedding.
- Everything sits on a dark real-map basemap (OpenFreeMap dark style) that is mostly veiled:
  art must read on dark, low-contrast backgrounds, at small sizes.
- Station labels sit over map tiles and need a plate/halo treatment to stay readable.
- One future feature to keep in mind: a schematic "diagram view" toggle (45° octilinear,
  Beck-map style). Any station/line iconography should survive both a geographic and a
  schematic rendering.

**Copy** (applies to any text baked into art)
- English UI, Swedish proper nouns kept (Hökarängen, AVGÅNG).
- No em-dashes or en-dashes as punctuation; commas, colons, parentheses instead.
- Acronyms expanded on first use.

## 4. Asset inventory, prioritized

**A. Identity (highest value first)**
1. Wordmark/logo for TUNNELBANA. Must work: tiny (favicon 16px), itch cover, in-game menu.
2. Favicon + app icon set.
3. A signature motif for the game (the bell? a tunnel mouth? a revealed circle of city?).
   The departure bell ("AVGÅNG") is the game's signature interaction and deserves identity
   treatment.

**B. itch.io page kit**
4. Cover image 630×500 (this is the storefront; the map-reveal fantasy is the pitch).
5. Screenshot framing guidance / decorated frames, page banner, background.
6. A short looping GIF concept: a train running, fares landing, city lighting up.

**C. In-game systems (design the SYSTEM, not one-offs)**
7. Station glyph system: regular, terminus (grabbable), unbuilt anchor (promise), future:
   interchange, mothballed. Must read at 10-16px on the map.
8. Train visual language WITH ERA GENERATIONS: rolling stock from 1950s stock to modern to
   speculative future is a planned upgrade line, and the map trains should visibly age
   forward. A small family of train sprites (side or top view, ~28×16px on map) per era.
9. Passenger dot language, including level-of-detail: at scale one dot represents 10, then
   100 passengers; the representation may change (size? glyph? stack?) but must stay honest.
10. Upgrade card icon system: a planned catalog of 100+ upgrades (speed, capacity, queue
    size, fares, signalling, per-era). Needs an icon grammar (category × era) that a
    non-artist can extend, not 100 bespoke illustrations.
11. Currency marks: kronor, and a second slower currency ("political capital").
12. Map interaction states: drag preview (valid/invalid), snap highlight, refusal reasons,
    demolition. Currently color-coded green/red; open to better.

**D. Moments**
13. Era transitions (1957 tunnel opening, 1964 red line...): a full-screen moment worth
    celebrating, the game's chapter breaks.
14. The ending screen (the arc completes; the save keeps running).
15. Menu/start screen: currently a plain panel; this is the first thing a player sees and
    the natural home of the identity art.

**E. Explicitly parked (do not spend time yet)**
- Sound/music direction (later milestone, will be its own brief).
- Marketing beyond the itch kit; localization art; achievements iconography.

## 5. Working agreement

- Iterate through Matthew; integration into code is handled on the dev side, usually same
  day. SVG/Figma exports with a one-line intent note per asset is plenty.
- Design tokens (colours, type scale) will be lifted from whatever you deliver into CSS
  variables and canvas constants; if you produce a token sheet, it becomes the source of
  truth.
- Anything in section 2 you want to overturn, overturn. Anything in section 3 you want to
  bend, ask first.
