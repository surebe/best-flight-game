# AERIS — Dawn Patrol

![make.fun bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)
![rank](https://make.fun/badge/best-flight-game-20261126-0057/surebe/best-flight-game/rank.svg)
![reward](https://make.fun/badge/best-flight-game-20261126-0057/surebe/best-flight-game/reward.svg)

An original cockpit flight game for the make.fun bounty
[Make the best flight game](https://make.fun/bounty/best-flight-game-20261126-0057).

Three sorties over one dawn valley, flown from a lit cockpit:

1. **Ring Run** — thread all 8 target rings down the river valley.
2. **Beacon Rescue** — reach the rescue beacon on the eastern ridge before the tanks run dry; fuel discipline is the mission.
3. **Final Approach** — bring her home: land on the runway under 82 knots with a gentle sink.

Throttle buys speed, pitch trades speed for height, bank turns, and a wing flown too slowly stalls. Terrain strikes bend the airframe; the debrief grades the whole campaign.

## Play

```sh
node serve.ts   # then open http://localhost:8080
```

Or open `game/index.html` through any static server. No build step, no network: every file the game loads lives under `game/`.

**Controls** — Arrow keys pitch and bank (Down = nose up), `W`/`S` work the throttle, `A`/`D` also bank, the mouse steers while held, `Enter` starts and advances.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library (`vendor/makefun-game.ts`, copied from the competition kit unchanged). Two runs write the same bytes.

## Layout

- `game/src/config.js` — every tuning number
- `game/src/terrain.js` — the valley heightfield, river, airfield, ring course
- `game/src/flight.js` — the aircraft and its flight model
- `game/src/missions.js` — the three sorties and their scoring
- `game/src/render.js` — the pseudo-3D cockpit renderer and instruments
- `game/src/input.js`, `game/src/audio.js`, `game/src/shots.js`, `game/src/main.js`

MIT licensed — see `LICENSE`.
