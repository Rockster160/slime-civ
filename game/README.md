# Slime Civ (game/)

Plain JavaScript ES modules, zero dependencies. Design: `docs/GAME_DESIGN.md`; build plan: `notes/impl/BUILD_PLAN.md`.

## Run
- `./run` builds `slime-civ.html` and serves it at http://localhost:5714/slime-civ.html (no-cache).
- Or `node tools/build.js` and double-click `slime-civ.html` (self-contained, works over file://).
- `?seed=N` in the URL picks the world seed.

## Controls
Press `H` or `?` in the game for the same list plus a six-line "how to play".

| Input | Action |
|---|---|
| click | inspect a villager, plant, item stack, bed, rack or the stockpile |
| drag a box (Shift adds) | select several villagers |
| **right-click** | order the selected villagers: tree = chop, berry bush = forage, grass tuft = gather, loose item = haul, ground = move. Orders cover an area of radius 10 around the target and clear themselves when it is exhausted. A small popup appears only when several verbs fit the clicked cell |
| order bar (bottom) | verb buttons: click one, then click the map (also gives area orders on bare ground); "Cancel orders" or `X` |
| `Tab` / `Shift-Tab` | next / previous villager |
| `F` or double-click | follow the selected villager |
| `Esc` | close help / digest, stop targeting, stop following, clear selection |
| `Space` | pause |
| `1`-`9` | speed: 1 2 3 4 5 = 1x-5x, `6` = 10x, `7` = 25x, `8` = 50x, `9` = MAX (as many ticks as fit in ~12 ms of each frame; the map redraws ~5x a second). Top bar buttons: 1x 2x 3x 5x 10x 25x 50x MAX |
| top bar **Next morning / Next season / Until something happens** | fast-forward at MAX in time slices (the page stays responsive; a "day 34 -> 50" readout shows). Stops early with a reason ("Stopped: Kob died of cold"): morning and season stop on a death, a disaster entry, everything planned being built, a villager starving with an empty larder or freezing with no warm room, and winter starting; "something" also stops on any chronicle entry (births, firsts) and a new room. Esc, any key or a click cancels. Disabled while possessing |
| **`Q`** or the Possess button | guide the selected adult villager (see Possession). `Q` or Esc releases |
| middle-drag, right-drag, WASD / arrows (Shift = faster) | pan |
| wheel, `0`, `[` `]` | zoom, fit map, view z-level |
| `B` | build mode (also the top-bar Build button): palette of Wall / Floor / Roof / Door / Bed / Rack / Erase / **Deconstruct** / Dig / Capture; drag on the map to plan ghosts, `[` `]` pick the level you build on, `R` rotates a blueprint stamp, `E` erases, right-click cancels, `Esc` or Done leaves |
| click inside a room | the room inspector: size, warmth, a purpose picker (None / Shelter / Workshop), a checklist with ticks and crosses, a quality word |
| `Z` `L` `T` | overlays (off by default): stockpile + bed owners / job targets and reservations of the selection / warmth |
| `P` | hide or show all panels |
| `Shift-S`, `Shift-O` | save to / load from browser storage. The Game menu also has file download / upload, new game with a seed, and "pause when a villager dies" |

Panels (all collapsible): Village (population, season, food runway, warnings, stock bars - click a bar to set a keep-N target, "the village wants"), Chronicle (click an entry to select the villager), Why (what the selected villager is doing and why, score breakdown, rejected alternatives in plain words), Selected (needs, traits, skills, family, bed). The strip under the top bar shows every villager with alert badges (H hungry, W thirsty, C cold, Z exhausted, + hurt, ! has work it cannot do, > ordered); click to select. "While you were away": after a day or more of sim time passed unwatched (tab unfocused or 3x and above) a digest of up to 10 chronicle entries appears.

## Possession (S4b)
- **Q** (or the Possess button in the villager panel) guides one adult; Esc, Q or the banner button lets go. One villager at a time. It auto-releases only on collapse (health under 10% of max; death ends it too), never on need warnings.
- **While guided:** `WASD`/arrows step one cell at a time (hold to keep walking; cardinal moves; up/down one level like the pathfinder), `E` or **left-click** uses what is next to you (facing first): tree = chop, berry bush = pick, grass = cut, loose stack = lift, planned piece = take from the stockpile if you stand in it, deliver, finish, rock you face = dig. `C` eat, `V` drink (beside water), `N` sleep (on a bed beside you, else the ground), `G` put down what you carry (in the stockpile). Needs drain as usual; nothing relieves them but you (a toast warns when one turns critical). The camera follows at about 3x the god-view zoom, game speed is capped at 2x and fast-forward is off, and a "POSSESSING <name>" banner shows needs, what they are doing, the last refusal ("too far - walk next to it first") and a hint line. The Why panel says "You are guiding <name>".
- **Same pipeline as the AI** (`sim/possess.js`): `possess {id}`, `release`, `pinput {id, dx, dy, tid, verb, x, y, z}` go through `sim.apply` (command log; replay and saves hold, `tests/possess.js`). A pinput sets the villager's latest intent (the direction persists until changed, so holding a key is one command); `controller.control` hands a possessed villager to `playerStep`, which makes the same `Move` step or `Task` verb the job board makes. `tests/possess.js` proves an AI villager and a possessed one walk the same cells and chop for the same number of ticks, and with `INSPIRE.speed = 0` are tick-identical.
- **Divine inspiration** (`sim/inspire.js`, one place): +10% work speed (not walking), +15% skill XP, 600-tick grace for the reservations the villager held before possession (they are then given back to the village). **Steadfast** is `steadfast(v)` in `sim/possess.js`: there is no fear / unsafe-avoidance system yet, so it is a documented seam, not behaviour.
- **Bot** `tests/bots/possess.js`: a scripted player (walks with pinput, presses interact) possesses the best chopper for one season, alone in the world, vs the same villager with a chop order: output ratio 1.10-1.20 on 5 seeds, band is <= 1.25.

## Gameplay fixes (S4b)
- **Keep-N no longer starves the village.** Non-food keep-N jobs (chop for logs/sticks, gather grass) use at most 70% of the adults, and at most 20% while food, beds or racks are short (`keepFull` in `sim/jobs.js`). The last 25% of stockpile cells open only to food (`FOOD_RESERVE` in `sim/items.js`; non-food may only top up its own stacks), loose non-food that cannot be stored is not hauled, a villager stuck with such a load puts it down (`dump`, village-critical class because full hands block foraging), and keep-N idles when there is no room. `tests/bots/keep999.js`: keep 999 logs from day 1, 2 years, 10 seeds.
- **Winter forage** (§11.17): in winter a forage job digs roots at a grass tuft (`root` verb: 240 ticks of work, 3 rations, the patch recovers in 4 days; stored as the usual food item). About a third of a summer forager-day.
- **Deconstruct** tool in build mode: drag over built walls, floors, roofs, doors, beds, racks; each becomes a marked piece (`dsite`), taken down by villagers as a standing-class chore (shares the 70% hand cap), ~75% of the materials come back loose, F.PLAYER cells only, no XP. Erase also cancels marks.
- **Almost a room**: click a walled and roofed space that has no door yet to see "Not a room yet - needs a door to close" (with the gap outlined), or "door planned" when a door ghost is already there (`sim/proom.js`, pure).

## Building (S4a)
- **Plan, then villagers build.** Ghosts are `csite` entities; villagers take materials from the stockpile, deliver them, and finish pieces as derived STANDING-class jobs (never an order), at most 70% of the adults at once. Food emergencies and personal needs still win. Supports-first: floors, walls, then roofs (need a wall within 3 cells or a neighbouring roof), the door last. Erasing a ghost drops what was delivered as loose items.
- **Cells and materials** (append-only ids in `sim/world.js`): wattle wall (2 sticks, insulation 0.4), log wall (1 log, 0.5), dry-stone wall (2 stone, 0.6), packed-dirt floor (1 dirt), thatch roof (1 grass, 0.5), log roof (1 log, 0.5); door 3 sticks. Stone and dirt come only from the **dig** order (right-click rock, or the Dig button/tool; a 5x5 patch; no XP). Doors, beds and racks are furniture entities.
- **Level and roofs.** Build coordinates are the STAND cell: a wall fills it, a floor is the cell below, a roof is an ordinary solid cell one above (`z+1`). Rooms ask "is something solid within 3 above me?", so natural overhead rock counts too and pathing/rendering need nothing special. The level you view is the level you build on.
- **Rooms** (`sim/rooms.js`): flood fill of stand cells closed by solid cells or doors, up to 128 cells (bigger = yard). Enclosed = closed and fully roofed. Warmth bonus = 0.75 x mean insulation of walls, doors and roof (wattle+thatch+door about +0.34), plus a small huddle bonus per other occupant; the Warmth overlay (T) shades rooms and prints the bonus. Villagers choose a bed (or floor) in a warm room when the air is below 0.55. Purposes (`shelter`, `workshop`) are zones the player assigns; checklist and graded quality are in `sim/roomeval.js`.
- **Blueprints**: Capture a rectangle of built pieces, rotate, stamp x N (each copy is one `build` command), swap wall/roof material at stamp time, flag **auto-build** so the village starts a copy itself when it is short of beds. Saved in the game save and, with the Library button, in the browser.
- **Sim commands added**: `build {cells:[{w,m,x,y,z}], bp?}`, `erase {x0,y0,x1,y1,z}`, `purpose {x,y,z,p}`, `blueprint {op: capture|add|remove|auto|rename, ...}`, and the `dig` order verb (`order {verb:"dig", x, y, z}`, z = level of the solid cell). Actions/tasks used: `take`, `deliver`, `construct`, `dig` (all Task verbs, same runner as every other job).
- **Why preview**: `plan(sim, v, false, null, true)` is a pure dry run; while paused after a command the Why panel shows "next:" from it.

## Tests and tools
- `node tests/all.js` runs determinism (100k ticks), save round-trip (early and mid-winter), the path microbench, the job-board unit tests (`tests/jobs.js`) `tests/rooms.js` (flood fill, doors, roofs, natural rock, oversize, incremental == full rebuild after random edits), `tests/build.js` (supports-first, refunds, dig to dry-stone wall, 70% cap, pure preview) and four bots under `tests/bots/`: `absent` (no commands, 10 seeds x 2 game years), `overorder` (everyone ordered to chop + keep 999 logs), `grind` (place/dig and player-ground chopping must pay zero XP), `shelter` (a scripted player closes in one roofed room with beds before winter; cold deaths must fall by >= 60% against `absent` on the same seeds), `keep999` and `possess` (above). `tests/possess.js` and `tests/deconstruct.js` are the S4b unit tests. Bots fan seeds out over child processes and print survival per seed and deaths by cause per year. Each also runs alone.
- `node tests/ui_text.js`: every blocker enum in the sim has a plain-language sentence (static scan of `src/sim` plus real runs), every job kind and class seen has a label, and `explain()` never leaks an enum.
- `node tools/build.js && node tools/ui_smoke.js` drives the page like a player in headless Chromium (click-select, Why panel, right-click order, drag box, Tab/Esc, keep-N, save/load/download/upload, help, overlays, the away digest, and build mode: paint a hut, watch it get built, the room inspector, capture and stamp a blueprint; then speed keys, skip-to, deconstruct, the almost-a-room card and possession: Q, walk three steps, chop, release) and writes `tmp/ui-*.png`. Fails on any console error.
- `node tools/build.js && node tools/shot.js [seconds] [speed] [name]` smoke-tests the built page in headless Chromium (Playwright borrowed from slime-village) and writes screenshots to `tmp/` (gitignored). Fails on any console error.

## S2 sim API (for the UI)
- Commands via `sim.apply`: `{type:"order", ids:[villagerId], verb:"forage|chop|gather|haul|move", tid? | x,y,z?}`, `{type:"keep", item, n}`, `{type:"unkeep", item}`, `{type:"cancel", ids?}`. Items: `berry dried grass stick log`.
- Villager entity (`sim.ents.ofKind("villager")`): traits `t`, needs `hunger thirst energy warm mood hp`, `carry`, `job {k,c,...}`, `why {job, cls, score, parts{base,urg,fit,prox,path,pref,tmp,sw}, rej:[{job,cls,score,blocker}] (top 3), lf (last failure), t}`, `order`, skills `sk`, `rest/slp`. Helpers in `sim/villager.js` (`lifeStage`, `ageDays`, ...) and `sim/skills.js` (`level`).
- Stockpile: `sim.stock` zone + `survey(sim)` from `sim/items.js` -> `{stock, loose, carried, rations}` (per item counts); `sim.board` has `runway`, `fc`/`sc` critical flags, `dem` demand vector and `keeps`. Chronicle: `sim.chron.entries` / `sim.chron.recs`.

## Layout
`src/sim/` is pure (no DOM, no real time, no Math.random); the UI and renderer change the sim only through `sim.apply(cmd)`. The bundler supports `export const a = ...` one name per line, `export function/class`, and `import { a, b } from "./x.js"` only.

## UI structure (S3) and seams for S4
- `src/main.js` builds one `game` object `{sim, cam, renderer, state, ui, modes, ...}`; panels and input read `game.sim` and change it only with `game.sim.apply(cmd)`. `game.setSim(sim)` swaps the world (load / new game). `ui` is player-view state (selection, hover, overlays, targeting) and is never saved.
- `src/ui/text.js` is pure (no DOM): blocker / job / class text, `explain(sim, v)` (the Why record in sentences), `alerts`, `warnings`. `tests/ui_text.js` covers it.
- Villager names are generated in the sim (`makeName` at founding / birth, stored on the entity, so they are in saves); lineage and parents come from `v.lin`, `v.par`, `chron.recs`.
- **Modes:** `ui.mode` is `"select"` or `"build"`; switch with `game.setMode(name)` (calls `modes[name].enter/leave`). `game.modes.build` (`ui/build.js`) = `{enter, leave, down, move, up, draw}`: `up` returning true consumes the click; `down` must return false to keep `ui.press` alive (the mode keeps its own drag in `ui.build`). Esc cancels a drag/stamp first, then returns to select. `render/overlays.js` calls `modes[ui.mode].draw`; planned pieces are drawn for every mode by `render/ghosts.js`. S4b (possession) can register `game.modes.possess` the same way and must yield WASD in `ui/input.js`.
- **Possess hook:** the inspector (`ui/inspector.js`, `villagerHtml`) has a disabled `Possess` button with `data-act`; WASD pan keys live in `ui/input.js` (`PAN_KEYS`, `panKeys`) and would need to yield to possession input.

## Playtesting and known gaps
- `node tools/build.js && node tools/playtest.js [seed]` plays a first year through the page (orders, keep-N, a 5x4 hut with door and 4 beds, Shelter, blueprint + second hut, possess and chop, release, through winter) with `__game.fastForward(n)` for the waiting, and writes `tmp/play-*.png`. From the console or Playwright: `__game.fastForward(ticks)` steps synchronously; `__game.skipTo("morning" | "season" | "event")` does the button's job and returns the stop reason.
- **Known gaps:** no fear system (Steadfast is a flag only); possession has no click-to-walk and no pathing (by design: step by step); winter foraging only digs from grass tufts and only as food demand (a forage ORDER still says berries do not grow in winter); cold still kills elders and children in the open (shelter bot: none; absent bot: about 2.6 cold deaths a year per village); unattended larders are thin in some seeds (the over-ordering bot starves on seeds 9 and 12 outside the test set); keep-N on a non-food item reduces births a little because labour goes to it; the top bar is crowded below about 1300 px wide.
