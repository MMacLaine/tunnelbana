# Tunnelbana visual system, pass 01

Companion to the asset kit page. This is the part a future contributor (or me, later)
needs in order to add an asset without asking anyone. Everything here is derived from
the kit page; if the two disagree, the kit page wins.

Direction: **signalbox**. The interface is an instrument reading over a dark city.
Cool near black, hairlines, one amber for value, green and red used only as signal
aspects. Nothing decorative. Everything legible at 12 px over map tiles.

## 1. Tokens

Colours live in `tokens.css` (generated from the kit page, do not hand edit the values
in two places). The names mirror the interim CSS variables, so replacing the old set is
a search and replace.

Meaning is fixed and non negotiable, because the whole system leans on it:

| token | means |
| --- | --- |
| amber `#e0a63c` | value: money, cost, payout, "look here" |
| green `#35a86b` | proceed, valid, owned, the 1950 line |
| red `#c8544a` | refusal, and nothing else, ever |
| politic `#9b8cc9` | the slow currency and anything bought with it |
| ghost `#5a6673` | the promise: unbuilt anchors, teases, mothballed |
| muted `#8996a5` | secondary labels, waiting passengers |
| ink `#e6edf4` | station strokes, primary text, numbers |

If a new state needs a colour, it does not get one. It gets a change of fill, dash,
halo or weight. The palette is closed.

## 2. Type

IBM Plex Mono, weights 400 and 600, self hosted. Two files, which is the whole runtime
budget. Never a third weight, never a second family in the game itself.

    display   600, 22 px, tracking 0.30em, caps      AVGÅNG, section titles
    counter   600, 26 px, tracking 0                 money
    title     600, 13 px, tracking 0.02em            upgrade names
    map label 400, 12 px                             station names
    body      400, 11 px                             descriptions
    caption   400, 10 px, tracking 0.14em, caps       stat labels
    onboard   600, 9 px                              the number on a train

Numbers group with a thin space (1 240 kr), never a comma. Minus signs are the real
minus glyph, not a hyphen.

## 3. Geometry

    stroke, map glyphs   2.5 at 1x
    stroke, icons        2.0
    stroke, hairlines    1.0 (never 2)
    radius               0 panels, 2 plates and chips, full pill trains
    icon box             24, live area 20
    map glyph box        24, drawn to read at 12 to 16
    train, map           32 by 18
    train, catalog       64 by 24
    spacing              4, 8, 12, 16, 24, 40, 64
    HUD gutter           16 at every breakpoint

## 4. Station glyphs

A station is a ring. State is expressed by what happens to the ring, never by a new
shape and never by colour alone:

    regular        ink ring, bg fill, r 5
    terminus       r 6.5 plus a pulsing green ring at r 10.5 (the grab handle)
    anchor unbuilt ghost ring, dashed 2 3, no fill
    anchor snapped ink ring r 8 with a core dot
    free spot      muted ring with a small core (invented, not a real place)
    interchange    capsule, one coloured pip per line
    hub            ink ring plus an outer hairline ring plus a core
    construction   amber ring plus two diagonal hatch strokes
    mothballed     ghost ring with a single diagonal
    depot          rounded square, two short rails
    selected       ink ring plus four amber ticks at the compass points

Rules for adding one: keep the ring, change one attribute, and check it at 12 px next
to `regular` and `terminus`. If you cannot tell them apart in a 12 px strip, it fails.

Labels use a 3.5 px halo in void (`paint-order: stroke`), not a filled plate. The only
exception is the snapped anchor name during a drag, which gets the plate because it
must win against everything.

## 5. Rolling stock

Seven generations. The fleet ages on exactly three axes:

    corner radius   2.5 -> 9        (boxy to soft)
    roof detail     3 vents -> 1 continuous strip -> glass
    body colour     olive -> green -> mint

    1950  #6f7f5e   riveted, three roof vents, boxy
    1965  #7f9166   two vents, slightly softer
    1975  #4f7f5c   one long roof strip
    1990  #35a86b   thin strip, antenna dot
    2005  #3fb87a   headlight bar, walk through
    2030  #4fc9a0   symmetric (driverless), solar strip
    2050  #6fd6b0   full glass roof, olive bogies

No era adds detail; at 32 px detail is noise. Onboard counts are always drawn in
`#08130c`, which is why no era colour may go below roughly 55 percent lightness.

Trams reuse these silhouettes at 26 by 14, commuter rail at 38 by 18, with the network
colours from the token sheet. New modes need colours, not new drawings.

## 6. Passenger denominations

A dot is always one unit of the currently displayed denomination, and the denomination
is printed beside the queue as soon as it stops being one.

    1      filled dot,  r 2.1
    10     ring,        r 3.0, stroke 1.6
    100    cored ring,  r 3.4 plus r 1.1 core
    1000   bar,         8 by 12 with three notches

Queue grows leftward from the platform in rows of six. Above 18 dots the denomination
changes rather than showing a plus sign: never round something away silently. Amber
means the platform is near capacity, red hollow means a passenger gave up and walked.

## 7. Upgrade icon grammar

Shape carries the category, colour carries the era. 16 shapes times 7 eras is 112
legible combinations from 16 files.

Categories in pass 01: speed, capacity, queue, fare, signalling, track, power, staff,
timetable, automation, comfort, climate, politics, network, maintenance, tunnel.

To draw a new one:

1. Try to use an existing shape first. A new category is only justified when two
   upgrades would otherwise share a shape and a player could confuse them.
2. 24 box, 20 live area, `stroke-width="2"`, `stroke="currentColor"`, `fill="none"`.
   Fills only for a state that is genuinely on (a lit signal aspect, a filled cell).
3. Round caps and joins, except where a corner is the point (politics hexagon).
4. Maximum four drawn elements. If it needs five, it is an illustration and it will not
   read in a 300 px wide card.
5. Test at 24 px on `#111823` against three neighbours from the same category column.

Era is applied by the consumer, not baked into the file: set `color` on the icon to the
era ramp value (`#6f7f5e`, `#7f9166`, `#4f7f5c`, `#35a86b`, `#3fb87a`, `#4fc9a0`,
`#6fd6b0`), or `#9b8cc9` if the upgrade is bought with political capital. Colour is
never the only signal: the card also prints the year.

## 8. Map states

    reveal        hard edge, catchment 0.65 km, 3 px feather, veil rgba(7,10,14,0.78)
    drag valid    green, solid to an anchor, dashed to a free spot
    drag refused  red, dashed, plus a chip naming the reason
    snap          ink ring r 8 with a core, replaces the dashed ghost
    demolition    red ring plus a dashed r 12 ring, refund shown in amber

Refusals always name the reason on a chip with a red left rule. A refusal the player
cannot read is a bug, not a design.

## 9. The bell

The signature interaction keeps one shape everywhere: a disc with a chevron leaving it
(the departure disc). States: ready (green ring), rung (filled, 250 ms flash plus one
expanding ring), nothing to dispatch (ghost, with a green readiness bar), automatic
(dashed ring, still visible). When automation arrives the disc must not disappear: the
player should keep seeing the verb they used to perform by hand.

## 10. Copy rules baked into art

English interface, Swedish proper nouns kept (Hökarängen, AVGÅNG). No dashes as
punctuation: commas, colons and parentheses instead. Acronyms expanded on first use.
Currency short forms: kr, and pk for political capital, expanded on first use.

Neither operator string appears anywhere in the art, metadata or file names. The
visible disclaimer in the art reads "Unofficial fan work. Not affiliated with any
transit operator or Region Stockholm." That wording is a flag for the dev side to
confirm, since the handover both bans the string and requires a disclaimer containing
it.

## 11. File naming

    tb-<system>-<variant>.svg

    tb-station-terminus.svg
    tb-train-1965-side.svg
    tb-up-capacity.svg
    tb-moment-era-1957.svg

Systems: mark, lockup, wordmark, favicon, icon, appicon, station, label, train, pax,
up, currency, veil, drag, state, bell, moment, itch, direction.

## 12. Basemap

`basemap/tunnelbana-night.json` is a MapLibre style for the vector tiles the game
already loads. It is a style file, not a picture: the geography stays real and stays
correct at every zoom, and it exports nothing to keep in sync.

    ground        #101722   the unlit city
    water         #091320   always darker than land, at every zoom
    parks         #0f1d20   the only place any green appears in the basemap
    buildings     #1b2634   from z13, opacity ramps 0.3 to 0.9
    roads         #1a232f minor, #1f2a38 tertiary, #222f40 primary, #27384c motorway
    rail          #1f2a38 dashed 4 3, real rail geometry, a quiet nod
    boundaries    #1e2b3a dashed, so the region outside the city still has structure

Two rules for editing it:

1. **No labels in the basemap.** The game layer owns every name, and a symbol layer
   also holds up style load behind a glyph fetch. The preview page adds a district
   name layer at runtime if you want to see one.
2. **Nothing in the basemap may be brighter than `line-hi` (#2c3d50).** The whole
   contrast budget belongs to the game layer: ink stations, green line, amber money.
   If the map competes, the network stops reading.

The reveal is designed against this style: at gameplay zoom (roughly 12 to 14) a lifted
catchment shows streets, buildings and parks appearing, which is why the building layer
starts at z13 rather than z14. Veil `rgba(7,10,14,0.78)`, catchment 0.65 km, hard edge
with a 3px feather, plus a 1px `line-hi` ring on the boundary so the edge reads as a
decision rather than a smudge.
