# Tunnelbana · Design Handover, pass 04

For the design team, from the dev side. Pass 01 designed the map, pass 02
the chrome, pass 03 the moments, and every one of them is live. Pass 04 is
about **the city answering back**: the council, the growth you can see, and
two new things moving on the map. The v12 build is underway on the dev side
with provisional art, same arrangement as pass 03, and everything below is
programmer placeholder until you replace it.

Read alongside the pass 02 and pass 03 component layers in `ui.css` and
`ui-pass03.css`, which everything below should extend. Constraints from
`DESIGN-HANDOVER.md` section 3 hold unchanged, including the licence rule
from pass 03 (anything with an outside origin ships checked and credited)
and the voice rule added 2026-08-08: player-facing prose uses no colons,
semicolons, or dashes as punctuation.

## 1. The ask, in one sentence

Pass 04 designs the surfaces where the player and the city negotiate: a
council panel of trust decisions, districts that visibly grow when served,
and the small ceremony of a golden train.

## 2. What to design, in priority order

**a. The council.** The flagship. A new surface where trust (and sometimes
money) buys DECISIONS rather than upgrades: subsidise a district's growth,
fast track a corridor's construction, commission art at a chosen station.
The dev side is building it as a data-driven tree that will grow over
releases, so the design ask is a SYSTEM: how a decision card looks in its
states (available, unaffordable, taken, locked behind an earlier choice),
how prerequisite lines read between cards, how a taken decision's ongoing
effect is shown, and where the surface lives (a full deliberate moment like
the front pages, or an overlay like statistics — recommend and we follow).
Trust's politic purple is the natural accent.

**b. Visible growth.** The served city fills with light. Districts already
grow in the sim (population rises toward a cap when service is good); pass
04 should decide what that looks like on the night map: warm window lights
accumulating inside the lit circles, density reading at a glance without
competing with lines, labels, or the veil. This is a renderer treatment,
not a component: deliverable can be a reference image or an annotated
sketch plus colour values. Both themes.

**c. The golden train.** A rare visitor: a gold train appears on a line,
clicking it grants a small bonus, missing it costs nothing. Needs the train
treatment (the 1950 train shape in gold, distinct from Silverpilen's
silver), a subtle attention cue that is not an alarm, and a tiny bonus
toast. It should feel like spotting something, not like a popup.

**d. The depot.** A place the player sites: home for a line's trains, with
morning pull-outs. Needs a map glyph in the station grammar (it is a
building, not a stop) and a small panel anatomy for its state. The dev side
will not reach this until late in the cycle, so it is the lowest-pressure
item here.

**e. Small pieces.** A save-slot row for the menu (name, timestamp, riders
carried, one of three slots). An insert-station affordance: the dev side
plans a click on a line segment's midpoint to splice a stop in; if a better
gesture occurs to you, say so before we train players on the first one.

## 3. What "usable" means (unchanged)

CSS custom properties over pixel specs. States as CSS. SVG single-colour on
currentColor in the pass 01 grammar. One HTML mockup page per major
surface, every component in every state. Both themes or an explicit ruling.

## 4. Where to see it

`node _dev/serve.mjs`, localhost 8123. The council does not exist yet; the
statistics overlay (Stats button, once bought) shows the overlay pattern it
would follow if you choose that form. District growth is currently visible
only as the City demand number in the Network panel, which is the whole
problem.
