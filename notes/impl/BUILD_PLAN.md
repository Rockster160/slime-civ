# Build plan — C1 "Leaves & Sticks" (+ C2-lite)

Goal: a **usable, playable** prototype. Open one HTML file, watch slimes survive, give them orders, and understand why they do what they do. Design source: docs/GAME_DESIGN.md (§07, §08, §09, §11.16–11.17, §23 Units & clock box). C1 exit criteria are in §26.

## Stack (decision D20; deviates from K9's "TypeScript")
- **Plain JavaScript ES modules, zero dependencies**, the same as the author's slime-village. Node 20 is installed; tsc and esbuild are not. This keeps the author's idiom and needs no toolchain. Use JSDoc types where they help.
- `game/tools/build.js` bundles `game/src/**` into a single self-contained `game/slime-civ.html`, which can be double-clicked. Adapt slime-village/tools/build.js; it's the same transform. `game/run` builds and serves on port 5714.
- Headless tests: `node game/tests/<name>.js`, with no framework (slime-village style: plain asserts, exit code). `node game/tests/all.js` runs them all.
- Browser checks: Playwright exists at /Users/zoro/code/slime-village/node_modules. Use it read-only, by absolute import path, to screenshot and smoke-test. Do not npm-install anything without a strong reason.

## Layout
```
game/
  src/
    sim/          # PURE: no DOM, no Date, no Math.random, no performance.now
      clock.js    # TICKS_PER_SEC=20, DAY=1800, YEAR=100 days, SEASON=25 days, etc. (GDD §23 box)
      rng.js      # named counter-based streams: rng(seed, streamName) -> {int(n), float(), chance(p)}; state = counter (serialisable)
      hash.js     # FNV-1a over canonical state -> state hash
      world.js    # Grid 128x128x24, chunked 16^3 typed arrays (Uint8 material + Uint8 flags), get/set, delta log for save
      worldgen.js # heightmap surface, dirt/stone strata, water, grass, bushes/trees as entities or cells
      path.js     # A* over walkable cells (step up/down 1 z), node budget, path cache; region graph optional later
      entities.js # id allocator, entity store (villagers, items, plants, furniture), deterministic iteration order
      villager.js # traits (subset of slime-village's 9 + colour), needs, age, death
      actions.js  # Action defs: Move, Pick(forage), Chop, Gather, Haul, Eat, Sleep, Build(leaf bed), Warm, Idle, Wander
      controller.js # AIController picks jobs from board; (later) PlayerController for possession — same Actions
      jobs.js     # job board: classes, score fn, reservations, blockers, Why info
      economy.js  # stockpile, items, food stock, demand vector (§09)
      orders.js   # player commands (command log): order, keepN, cancel, speed is NOT a sim command
      season.js   # warmth curve, cold hazard, plant growth seasons
      chronicle.js
      sim.js      # Sim: create(seed), step(), apply(cmd), hash(), snapshot()
      save.js     # seed + world deltas + entities + rng counters -> JSON; load -> identical continuation
    render/       # canvas: top-down per-z-level view (debug renderer), camera pan/zoom, z up/down, selection boxes
    ui/           # DOM panels: top bar (day/season/speed), inspector, Why panel, orders, stock bars, chronicle
    main.js       # wires sim + render + ui; fixed-timestep loop (accumulator), speeds 1-5 + pause
    shell.html
  tests/
  tools/build.js
  run
  README.md       # how to run, controls
```

## Hard rules
1. **Sim/render split.** Nothing in `sim/` touches the DOM or real time. The UI changes the sim only through `sim.apply(command)`, which is logged with its tick. The renderer only reads.
2. **Determinism.** Same seed plus the same command log gives the same hash at every tick.
   - Use integers for positions, timers and stock. Floats are allowed for needs/traits but must come only from +-*/ (no Math.sin/exp/pow in sim; use lookup tables if a curve is needed).
   - Iterate entities in id order. Never iterate a Map/Set whose insertion order could differ.
3. **One action pipeline.** Every villager action is an Action instance run by the same runner. Possession (C2) will feed Actions from input instead of the job board.
4. **Every job rejection emits a blocker enum.** NO_PATH, NO_TOOL, NO_MATERIAL, RESERVED, UNSAFE, TOO_COLD, NEED_CRITICAL, NO_STORAGE, UNKNOWN_CRAFT, and so on. The Why panel shows the current job, its class, its score breakdown, and the top rejected alternatives with blockers.
5. **Values come from the GDD.**
   - Class bases: personal critical 400·u, village critical 350+50·u_v, order 300 (direct action only), standing 200 (incl. derived jobs), demand 100, leisure 0.
   - Within-class: `30·urgency + 60·skillFit + 10·proximity − pathCost(≤20) + preferred(10) + temper − switchCost(25)`, clamped ±45.
   - Commitment 200 ticks; reservation expiry 400 ticks.
   - Needs thresholds per GDD §09. Read §09 and §11.16–17 for the full set; cite the section in a comment where a constant comes from.
6. **Keep it small and readable.** Match slime-village's style: plain functions, short modules, comments that say *why*.

## Stages
- **S1 Foundation:**
  - Sim core: clock, rng, hash, world, worldgen, path, entities.
  - Minimal villagers as random walkers.
  - sim/save, build tool, debug renderer with camera and z-levels.
  - Tests: determinism replay (100k ticks), save round-trip, 100-walker path microbench.
- **S2 Life & work:**
  - Villagers: traits, needs, aging/death, 2–3 lineages.
  - Actions, job board, demand vector, forage/gather/chop/haul/eat/sleep, leaf beds, seasons and cold.
  - Chronicle.
  - Bots: absent-player survival, over-ordering, grind.
- **S3 Player layer:**
  - Selection (click, drag box, Tab).
  - Right-click orders on targets, keep-N standing orders with stock bars, cancel.
  - Why panel, inspector, notables, chronicle panel/digest.
  - Time controls; save/load (localStorage plus file download).
  - Help overlay.
- **S4 C2-lite:**
  - Designate walls/floors/doors/roof from gathered materials; construction sites with supports-first and hauling at standing class.
  - Flood-fill rooms, one purpose (shelter/workshop) with a checklist.
  - Blueprint capture and stamp ×N.
  - Minimal possession (WASD move, interact) through the same Actions, with the +10% speed buff and Steadfast stub.

Each stage leaves `node game/tests/all.js` green, the HTML building, and a screenshot in game/tmp/ (gitignored).
