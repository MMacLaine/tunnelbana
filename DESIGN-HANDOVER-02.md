# Tunnelbana · Design Handover, pass 02

For the design team, from the dev side. Pass 01 landed and is integrated: the palette,
station glyphs, train eras, icon grammar and IBM Plex Mono are all in the build and working.
`tunnelbana-assets-pass01/DESIGN-DOC.md` remains the visual source of truth, and this
document only asks for what pass 01 did not cover. Read it alongside `DESIGN-HANDOVER.md`,
whose section 3 constraints (legal and technical) still hold unchanged.

You have full creative control inside those constraints. Everything named below is
programmer art and nobody is attached to it.

## 1. The ask, in one sentence

Pass 01 designed the **map**; pass 02 needs to design the **interface around it**.

The owner's words after playing: *"the menu looks fine but the buttons are clearly not
planned out well, look very pasted on."* That is exactly right, and it generalises. Every
surface that is not the map was assembled by a programmer reaching for a border and a
padding value. The map looks authored. The chrome looks typed.

## 2. What the game is now (it grew since pass 01)

A finite incremental game, roughly 20 hours, across five eras: the green line south (1950)
and west (1952), through-running (1957), the red line (1964), the blue line (1975), and a
sandbox finale where the constraints come off. 59 real stations across seven corridors, on a
live dark map of Stockholm that is revealed as you build.

Things that exist now and did not at pass 01, all of which need visual thinking:

- **Named lines with reserved colours.** Gröna linjen, Västerortsbanan, Röda linjen, Blå
  linjen, plus player-founded lines. Lines can share track, so parallel services draw
  side by side on a trunk.
- **A station panel**: per-station diagnostics (demand, crowding, riders left behind) and
  three upgrade axes (tier, entrances, gates).
- **A shop** of ~19 upgrades, era-gated, in two currencies.
- **Eras**: a full-screen "moment" card on each transition, and an ending screen.
- **Opening day**: the network is unbilled and unbuilt until the player's first departure.
- **A How to play page** and a feedback box, both new and both plain.

## 3. What to design, in priority order

**a. The button system.** One family, every state (rest, hover, active, disabled, dangerous),
at three weights: the primary call to action (AVGÅNG, the dispatch bell), standard menu
buttons, and the small inline controls that live inside panels. This is the top ask: the
buttons are the thing that reads as unplanned. Include the disabled state explicitly, since
half the shop is disabled at any moment and it currently just fades.

**b. The panel system.** A single anatomy for every floating surface: HUD blocks, the station
panel, the shop, the era panel, the feedback box. Header, body, footer, divider, spacing
scale. Right now each one has slightly different padding and border treatment because each
was written on a different day.

**c. The menu.** Start, settings, about, how to play. It is the first thing anyone sees and
currently reads as a form. It should feel like the cover of the thing it opens.

**d. The shop card.** Nineteen of them stack in a scrolling column: name, cost, description,
level owned, plus a locked/unaffordable/maxed state. This is where a player spends most of
their reading time, and it is currently three spans in a border.

**e. Numbers.** Money, riders, trust, rates. An incremental game is a game about watching a
number rise, and ours are set in body text. They deserve a display treatment, ideally one
that survives going from 300 kr to 3 000 000 kr.

**f. Type scale and spacing tokens.** Pass 01 gave us colour and glyphs; pass 02 should give
us a scale, so the next thing we build is right by default rather than by taste.

## 4. What "usable for the dev side" means here

Pass 01 was ideal in this respect: keep the format. Concretely:

- **CSS custom properties over pixel specs.** Extend `tokens.css`; if a value belongs in a
  token, name it. We consume tokens directly, so anything named lands in the build in one
  edit.
- **States as CSS, not as images.** Buttons and panels should be describable in CSS
  (borders, backgrounds, shadows, transitions). SVG only where a shape genuinely cannot be
  drawn in CSS.
- **SVG for iconography**, single-colour where possible so it inherits `currentColor`, in the
  same grammar as the pass-01 upgrade icons.
- **One HTML file we can diff.** A static mockup page showing every component in every state,
  as pass 01 did with the map. We port from it directly.
- **Both themes.** Dark is the designed theme. Light exists (a testing aid the owner uses
  and players can switch to), and its current values are pragmatic, not designed. If light
  is worth doing properly, do it; if it is worth cutting, say so.

## 5. Constraints that have not changed

From `DESIGN-HANDOVER.md` section 3, restated because they are the ones that bite:

- **No operator branding.** No roundel, no SL marks, no "Storstockholms Lokaltrafik". Real
  station names are fine (they are geography); the in-game disclaimer wording is "not
  affiliated with any transit operator or Region Stockholm".
- **The map is never obscured.** Chrome sits in corners over a live map; anything full-screen
  must be a deliberate moment (era cards, the ending), not a default state.
- **Nothing may make the map smaller or uglier.** That is the whole pillar.
- **English UI.** Swedish appears only where it is a real name (stations, lines) or real
  signage (the AVGÅNG button, SLUTSTATION at the ending). The owner's ruling after pass 01:
  no glossary, no annotated translations, explain naturally or use English.
- **Legibility over atmosphere at small sizes.** Text sits on a moving map; halos and plates
  are already in the system.

## 6. Where to see it

Run the game (`node _dev/serve.mjs`, then `localhost:8123`) and look at, in order: the start
menu, the shop column on the right, a station panel (click any station), the How to play
page, and an era transition. Those five screens are the whole ask.

Screenshots on request; the dev side has a headless-Chrome harness and can produce any state
on demand, including states that are hard to reach by playing (late-game networks, maxed
stations, the ending).
