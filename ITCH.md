# Publishing to itch.io

The zip is built by `node _dev/build-itch.mjs` and lands at `dist/tunnelbana.zip`
(~390 KB). Everything in it is local except two hosts, both deliberate and both
named in the build script's allowlist so adding a third has to be a decision:

- `tiles.openfreemap.org` for the basemap.
- `maclaine.se` for the feedback box. The endpoint sends `Access-Control-Allow-Origin: *`,
  so it works from inside itch's iframe; if it ever fails the game falls back to a
  mail link and the player loses nothing.

Nothing is uploaded, no accounts, no analytics, no third-party script. A save is
one `localStorage` key.

## Upload settings

New project on itch.io, then:

| Field | Value |
|---|---|
| Kind of project | HTML |
| Upload | `dist/tunnelbana.zip`, tick **This file will be played in the browser** |
| Embed size | 1280 × 800 |
| Fullscreen button | On |
| Mobile friendly | Off (it wants a mouse and a real screen) |
| Frame options | Click to launch: off (it should just start) |
| Genre | Simulation |
| Tags | incremental, idle, management, transport, city-builder, stockholm, singleplayer, no-ads |

itch serves the zip's `index.html` at the root of the iframe, which is why every
path in the build is relative. Do not "optimise" one into an absolute path.

## Store page copy

**Tagline**

> Build Stockholm's underground, one tunnel at a time.

**Description**

> An incremental game about building Stockholm's tunnelbana, from the first tunnel
> of 1950 outward. You start with three stations and a bell. Ring it, and a train
> goes out. People are already waiting.
>
> The map is the progress bar. The real city sits under a dark veil and lights up
> around every station you build, on real geography with real station names. Each
> era is one real line's story: the green line south and west, the red line in
> 1964, the blue line in 1975, and then Stockholm is yours to build freely.
>
> It simulates a railway rather than a spreadsheet. Passengers pay per kilometre
> and choose their route; trains bunch into convoys until you buy a timetable;
> a platform that fills faster than trains arrive starts leaving people behind,
> and it will tell you how many. Watching the trains run is half the point.
>
> Finite and finishable, with an ending and no prestige reset. Idle-friendly:
> hire drivers and the network keeps earning while the tab is closed. But it is
> an incremental first, an idle game second.
>
> Free, no ads, no accounts, nothing collected. Your save lives in your browser.
>
> Unofficial fan work. Not affiliated with any transit operator or Region
> Stockholm. Station names and geography are facts about the city; everything
> else is a game.

**Screenshots to attach** (regenerate with `node _dev/shoot.mjs`)

1. `4-game` the network running, HUD and rail visible
2. `5e-map` the veil lifting around the built line
3. `5-panels` a station panel open with the shop beside it
4. `6-moment` an era moment
5. `2b-achievements` the achievements list

## Before every upload

```
node _dev/smoke.mjs          # exit 0
node _dev/value-gate.mjs     # exit 0
node _dev/probe-console.mjs  # no [EXCEPTION] lines
node _dev/build-itch.mjs     # prints the external hosts it found
```

The zip is a snapshot, not a deploy: maclaine.se updates itself on push, itch
does not. Re-upload deliberately, and only from a build that passed the gates.
