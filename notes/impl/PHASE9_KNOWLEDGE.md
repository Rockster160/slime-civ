# Phase 9: Own knowledge and the town-centre board (APPROVED 2026-10-30 with the default open decisions; built BEFORE Phase 8, so beliefs and board notices go in the current monolithic save with a SAVE_VERSION bump, and Phase 8 later moves them into its global record)

Author direction (2026-10-29): "Planning and re-jobbing should be based on the Slime, not globally known and globally updated. A slime should only be able to act on knowledge that it itself has. Maybe have a 'job board' in the city center where Slimes can jot down certain types of information, but otherwise there should be no telepathy."

Author direction (2026-10-30): "Essentially 'we need more wood!' and other slimes can check the board when they have nothing to do and complete the tasks on there. Or otherwise when seeing a low supply, slimes that either have no job or no work to do can help out where things are missing. Slimes and the village need ways to save batches of information so that we don't have to store every 'seen' block."

## Where telepathy stands today (measured, not assumed)
Read-only survey of `game/src/sim/`. Classes: **P** genuinely per-slime already, **V** global but plausibly "visible" (a slime standing there would see it), **T** pure telepathy.

| source | what it does | class |
|---|---|---|
| `board.js:46` `updateBoard` (every 20 ticks) | runway, `fc/sc` flags, `dem.food/shelter/rack/preserve`, `fneed`, `sneed` from `village()` + `survey()` of the whole world | **T** (stock is **V** at the stockpile; hunger and bed-count are **V** only within sight) |
| `board.js:29` `village()` | every bed, rack, site and csite, every villager's `dailyNeed` | **T** |
| `items.js:274` `survey()` | stock, loose items and what every villager *carries*, summed over all `item` entities | stock **V**, loose **T**, carried **T** |
| `board.ep` bumps (`board.js:61,75`, `orders.js:84`, `controller.js:28`) | one number bumped anywhere forces every villager to `replan` that tick | **T** (the broadcast itself) |
| `jobs.js:80` `makeCtx` | counts every other villager's `job.c:g` into `ctx.w`, for the `capped()` worker limits (`MAX_WORKERS`, `jobs.js:456,505,561...`) | **T**; this is the tiny global cap behind the crowd idling |
| `jobs.js:125 190 227 325 594 659 722 757 1110 1167 1277` | planners scan `ents.ofKind("plant" / "item" / "furniture" / "dsite")` for the nearest target anywhere in the world (`nearPlants` is O(plants) per slime per plan) | **T** (only `MAX_SCAN` 60 and `isBad` limit it) |
| `jobs.js:896`, `craft.js:80,139`, `expedition.js:157`, `farm*.js` | the same whole-world scans for stations, loose goods, wagons, crops | **T** |
| `jobstate.js:26` `reservedByOther` (`e.rv`) | a slime sees any other slime's reservation on any entity at once | **T** (fine for the one on the same site, **V**) |
| `seen.js` `sim.seen` | **one** map for the whole village (`markSeen`, `known[mat]`); `seek ore` reads `known` | **T**: not per village, per *world*. A fact one slime saw is known to all instantly |
| `memory.js` `v.mem` / `v.epi` / `tell` (`memory.js:160`, `people.js:134`) | per-slime feelings (`MEM_CAP` 8, decay every 1000 ticks), heard stories to near friends | **P**, and the proven carrier for gossip, but it carries *feelings about subjects*, not places |
| `knowledge.js` `v.fam` / `can()` | familiarity per craft per slime; spread by watching and Teach | **P** per slime; `can(sim, X)` ("anyone knows it") is a village-wide OR: **T** (small) |
| `discovery.js` `sim.disc.seen/curio` (`fauna.js:201` `sightings`) | the first sighting by anyone is a village Curiosity | **T**, but it is a chronicle/Almanac fact, not a planning input. Leave it |
| `crews.js`, `orders.js` | a crew task is a *preference* a member carries (`v.cr`); an order lives on `v.order` | **P** once delivered. Player-issued, so see OD-58 |
| `fauna.js:361` `fearStep` | fear from the creature within `FEAR_R` of the slime | **P / V**. Good as is |
| `expedition.js` | party is a crew; "report" is a village-level chronicle event | members **P**; the report is **T** |
| `jobs.js` job scoring, `isBad` (`v.bad`) | the slime's own blacklist | **P** |

**Cost note.** Each plan builds `makeCtx` (O(V) villagers) and scans plants/items/furniture (O(E)). Per tick that is O(V²) over the village plus O(V·E) over the world, on the 20-tick board cadence and the replan storms the epoch causes.

## Goal
A slime plans only from **its own beliefs**: what it has seen, what it was told, what it read on the town-centre board. Nothing it has not perceived can steer it. The village still works, but its coordination now has a place, a delay and a failure mode you can see.

## Design

### Belief store (`v.bel`, per slime, bounded)
A small ring of **facts**, each `[kind, x, y, z, n, tick, src]`:
- `kind`: `food` (berry/tuft/tuber patch), `tree`, `ore:<mat>`, `water`, `stock` (stockpile contents), `bed` (free bed), `site` (a build or dig site wanting hands), `danger:<sp>`, `need:<what>`.
- `n`: last seen amount or yield. `tick`: when it was last confirmed. `src`: 0 saw it, 1 told, 2 board.
- **Capped:** `BEL_CAP` 24 slots (target ~600 bytes saved). Full: the stalest, least-useful slot goes (same rule as `memory.js` `slotFor`). Facts of the same kind within 3 cells merge into one. Per-slime state, so one array, no Map.
- **Decay:** a fact older than `STALE` (a flat tick constant, 1.5 game days) is *stale*: still usable, scored lower; older than `FORGET` (6 days) it is dropped. A fact is **removed** the moment the slime reaches its cell and finds it gone (the mistake is felt: the slime wastes the walk, `bad`-lists it, and posts the correction).
- **No per-tick world scan.** Facts are written at events and on a cheap staggered **look** (every 8 ticks per slime, id-staggered): query the entity grid (`ents.at` / chunk buckets, not `ofKind`) in a radius of `LOOK_R` (6) of the slime for plants in season, items, furniture, sites, fauna. At most `LOOK_MAX` facts are written per look. Cost is O(V · local), not O(V · world).
- **`seen.js` becomes the union of what slimes have seen, no more.** It stays a render/fog layer and the source for "where was ore" at the *board* level only; planners do not read `known[mat]`. Per-slime ore memory is `ore:<mat>` facts written when a look or a dig reveals it.

### Perception (what a slime may know without being told)
- **Stockpile:** within `LOOK_R` of the stock zone it reads the true contents (`stock` fact, replacing the old one). That is how it "sees the larder low".
- **Hunger and cold in housemates:** within sight, a slime with a hungry or shivering neighbour gets a `need:food` / `need:warm` fact. No other path to learning the village is hungry.
- **Beds and sites:** a bed or site seen is a fact; a missing bed is perceived in the *person* who has none (sleeps on the floor in view), not by a global count.
- **Demand becomes local.** `dem.*` is replaced by `demandOf(v)`, computed from the slime's own `stock`, `bed` and `need:` facts (the same formulas, fed from beliefs). `board.js` keeps `runway`/`fc`/`sc` only as **debug and HUD truth for the player** (a hidden "ground truth" panel), never read by a planner.
- **Epoch.** `board.ep` stops being a broadcast. A slime replans when *its own* belief set changes materially (a new `need:` or `danger:` fact, its target found gone) or on the existing id-staggered 200-tick timer.

### The job board (a furniture entity at the town centre)
- **Founding furniture**, free at the start, placed at the camp; more can be built. Entity `board` with a bounded list of **notices** (`BOARD_CAP` 32, newest wins on merge, oldest expires).
- **Notice** = a belief fact plus `by` (poster id) and `claim` (a slime id or 0): `need beds x3`, `berries at X`, `ore at Y`, `danger at Z`, `site open`, `claim: hauling to rack`.
- **Writing:** a slime standing at the board writes its freshest, most useful facts (`POST_N` 3 per visit) as a short idle job `post` (leisure-class, also done on returning to the stock zone with a full load). It is a real Action through the one pipeline.
- **Reading:** a slime at the board copies notices into its own beliefs (`src` 2), up to `READ_N` 6, then continues. **Reading requires walking there.** A slime visits the board when it has no usable job, when a belief of its own is stale, or after a long away trip (cheap `check_board` leisure/standing job with a modest score, nearer = better).
- **Cost:** a visit touches ≤32 notices. No world scan.

### Requests and helping out (the board's main use)
- **Posting a request.** A slime posts a `need:<item>` notice ("we need more wood!") when it finds a shortage itself:
  - its job fails with `NO_MATERIAL`;
  - it reads a low `stock` fact at the stockpile;
  - it sees a need in a housemate.
  A request carries the item, the amount short and the job it is for. Requests for the same item merge, and the count updates.
- **Taking a request.** A slime **with no job or no workable job** walks to the board, reads it and takes the most useful open request it can do: chop for wood, forage for food, cut for grass. It claims the request on the board so others see it is covered. The amount short drops as deliveries land, and the request closes at zero.
- **Helping without the board.** An idle slime that *sees* a low supply itself (it passes the stockpile, or watches a build site stall) helps directly, with no trip to the board. This is the fast path; the board is the slow path for slimes who weren't there.
- **The pull is the idle slime.** Busy slimes don't drop their work for a request. Only slimes with nothing to do look for work, so a shortage draws in exactly the spare hands. This replaces today's global demand-driven worker caps.
- **Visible:** notices on the board show as icon plus count chips ("🪵 −12") on hover, and a slime heading off on a request shows the request's icon.

### Batched knowledge (no per-cell storage)
Neither a slime nor the village stores individual seen blocks.
- **A slime's facts are patches**, not cells: "berries around (x,y), about 14", "trees in this chunk", "iron in the cave north". A look folds what it sees into the patch that covers it, keyed by chunk, kind and centre, within `PATCH_R`. One fact covers a grove.
- **The village's map** (fog and rendering) is stored per chunk as a seen bitset and an ore summary per chunk (counts per material and a rough centre), not a growing per-cell log. See Phase 8 8.24, which removes `seen.log` and derives `known[mat]` on load.
- **The board holds patches too.** "Ore at Y" is a chunk-level notice, so 32 notices cover a large area.

### Claims and reservations without telepathy
- **At a site, you see who is there.** The `look` records slimes near a target; `reservedByOther` only counts a reservation the slime can see (the holder within `LOOK_R` of the target) or one on the board.
- **Away from sites, the board.** Taking a larger job (build a bed, dig a dig-site, haul a wagon) writes a `claim` notice when the slime next passes the board, and honours claims it has read. A claim expires (`CLAIM_EXPIRY`, a flat constant) so a dead or distracted claimant frees the work.
- **Worker caps (`MAX_WORKERS`) are replaced by observation:** `capped()` counts the slimes the planner can *see* at the target group (from the look), plus board claims. Two slimes who cannot see each other may both go; the second finds the site full on arrival and moves on. That wasted walk is the honest cost of ignorance.
- This fixes the audit's crowd-idling at its root: the global `ctx.w` count with tiny caps (`2` for care and hunt) is gone, so idle slimes pick local work they actually know about instead of blocking on a village-wide count. It does **not** by itself make every slime busy; a slime with no beliefs idles, and that is the intended consequence (see Risks).

### Gossip
- Extend `memory.js` `tell` / `people.js:134`: a chat between friends (already near and already gated) also swaps up to `GOSSIP_N` 2 **place facts**, the freshest, never ones the listener already has fresher. Heard facts carry `src` 1 and a staleness penalty. Same cadence and caps as today's `tell`: no new scan.
- Slimes coming home trade facts with whoever is at the stock zone; the board is the village's slow memory, gossip its fast one.

### Player orders and possession
- **A possessed slime** plans nothing: the player's eyes are its eyes. Possession reads the real world; a slime does not gain beliefs the *player* saw, except what the slime itself looks at. It writes beliefs and can post to the board like any slime.
- **Player orders and designations** stay *commands* to the slimes they are given to (an order is on `v.order`), but a designation of a site (dig, build, zone) is posted on the board as a notice so that uninstructed slimes find it. Whether it is also broadcast is OD-58.
- Crews: a crew's task stays a per-member preference (already **P**). The crew shares beliefs only through gossip and the board.

## Visible surface (show, don't tell)
- **The board** is a drawn object at the town centre with a visible stack of notes; hovering lists notices (kind, place, poster, age). A slime reading or posting stands at it with a small paper animation.
- **A slime's inspector** gets a "Knows" section: its facts with age (fresh / stale), source (saw / told / board), and what it plans to do from them. The Why panel's rejected alternatives gain a blocker `UNKNOWN_PLACE` (target exists but is not believed) and `STALE_BELIEF`.
- **Stale-belief mistakes show:** a slime arriving at a gone berry bush shows a "?" and the chronicle may note it once per slime per kind.
- **Map overlay** (a toggle): a believed fact as a faint marker coloured by age, so you can see where a selected slime thinks things are versus where they are.

## Stages (proposed)

### 9.28 Belief store and look
- `sim/belief.js`: facts, merge, decay, caps, `look` using the entity grid. `v.bel` added to the villager; saved in the global record (see sequencing).
- Inspector "Knows" section. No planner reads it yet; dev-mode comparison of beliefs vs the truth.
- **Tests:** a look writes only facts within `LOOK_R`; caps and decay; merge; same hash with the store on and the planners unchanged.

### 9.29 Planners read beliefs
- Replace each `ents.ofKind(...)` target scan in `jobs.js` / `craft.js` / `farmjobs.js` / `expedition.js` with a belief query, one planner at a time, behind a flag until the whole set is converted. Remove `nearPlants` world scan. `known[mat]` is no longer read by planners.
- Dev-mode guard (flag): `ents.ofKind` and `ents.get` throw (or log) when called from inside `plan()` for a kind/id the slime has no fact for; the test suite runs with it on. Whitelist the slime itself, its own target, and the pipeline's runner.
- Blockers `UNKNOWN_PLACE`, `STALE_BELIEF`.
- **Tests:** a slime that has not seen a berry bush does not go to it; it goes once it has; arriving at a gone target drops the fact.

### 9.30 Local demand and claims
- Also remove the village-average inputs found on 2026-10-30: `knowledge.js:194-199` (cold/thirsty village shares), `board.js:118,124` (missing beds per head), `population.js:132` (beds per head in breeding weight).
- `demandOf(v)` from beliefs replaces `dem.*` / `fneed` / `sneed` in scoring; `board.js` keeps its truth values for the HUD only. Per-slime replan trigger replaces the `ep` broadcast.
- `makeCtx` loses the global `w` count; `capped()` counts seen workers and board claims. `reservedByOther` becomes visibility-aware.
- **Tests:** a slime beside an empty larder rates food demand up, a slime far away and uninformed does not; two slimes who cannot see each other double up and one moves on; a claim expires.

### 9.31 Job board and gossip
- Board furniture, `post` and `check_board` jobs, notices, claim expiry. Founding board at the camp, buildable more.
- Gossip of place facts through `tell`; arrivals at the stock zone trade facts.
- **Tests:** fixture: slime A holds `berries at X`, posts, B reads, B goes to X; gossip spreads a fact A to B to C within a capped number of ticks; board cap and expiry; a notice written is never read without visiting.

### 9.32 Player commands, UI and hardening
- Orders/designations posted per OD-58; possession writes beliefs. Board hover, belief overlay, stale "?" mark, chronicle line.
- Village-collapse guard rails (see Risks): a newcomer or reborn camp starts with the founders' shared knowledge of the camp.
- Perf: planner cost per tick measured against 9.27's baseline (O(V²) removed); balance pass.
- **Tests:** whole-village fixture year, no starvation relative to the telepathic baseline within a tolerance; hash replay; the dev guard passes on the full quick suite.

### 9.33 Learning by doing and seeing (added 2026-10-30)
Author direction: "Similar to how possession can teach the slime experiences (also make sure slimes can share knowledge), instructing slimes to do things should also be able to gain them experiences. Seeing certain things (like a teepee) should also be enough to give the Slime an idea to try that and learn to build by just seeing it even if they aren't directly taught."
- **Orders teach like possession, more weakly.** While a slime works a direct player order or a crew task, it gets a smaller `INSPIRE`-style multiplier on skill XP (`skills.js:114` today applies it only when `v.poss`). It also gets the same `feel` memories that possession and the AI already share (`memory.js`). The bonus is per slime, from its own order: no telepathy.
- **Seeing teaches an idea.** When the look (`belief.js`) sees a built thing (furniture, structure or site) of a craft the slime doesn't know, it gains a small familiarity toward that craft: an **idea**, capped below `DISCOVER_FAM`, through `setFam` with `how: "saw"`.
  - Repeated sightings and closer looks raise it, up to the cap.
  - An idea makes the matching tinker/try more likely for *that* slime, reusing the `EVIDENCE_X` rediscovery discount in `discovery.js`, so slimes who have seen a teepee try to build one first.
  - Watching someone build it (`WITNESS_FAM`) stays stronger than seeing a finished one.
- **Sharing knowledge.** Friends chatting (`tell`/gossip, 9.31) can pass an idea, at half strength and only below the cap. Real teaching stays `Teach`.
- **Visible:** an idea shows on the slime card's Know chips as a faded craft icon with a "?" (show, don't tell). The chronicle notes the first time an idea becomes a skill.
- **Tests:**
  - an ordered slime gains more XP than an unordered one doing the same work;
  - a slime that sees a teepee gains an idea and is more likely to try it, while one that never saw it does not;
  - an idea never exceeds the cap without practice;
  - an idea passes through a chat;
  - determinism.

## Open decisions
- **OD-56: how strict.**
  - Default: strict for *targets* (where to go) and *demand* (what is needed); relaxed for *self* (own needs, own job, the stock zone location, the camp centre, terrain/pathing).
  - Alternative: also hide the terrain beyond the slime's seen cells from pathing. Not worth it.
- **OD-57: do founders start knowing the camp?**
  - Default: yes. At founding every slime gets the local facts within `SPAWN_SIGHT` of the camp (`seen.js` already seeds this) and the board starts with a few seed notices. Without it the first day collapses.
- **OD-58: do player orders/designations go on the board or stay global?**
  - Default: an order is delivered to the slimes it targets (as now) and also posted as a board notice; a designation (dig, build, zone) is posted. Uninstructed slimes learn of it only by reading the board or gossip. The player is not a slime and may be telepathic *in what they command*, but the slimes still have to find out.
  - Alternative: designations stay global (a "player's broadcast"), which is simpler and avoids frustrating "why isn't anyone digging" moments. Costs the clean rule.
- **OD-59: board mechanics.** Default: one board at the camp, more buildable, readable by walking up. Alternative: a board per room. Not worth it yet.
- **OD-60: village-critical overrides.**
  - Default: no override. Famine is perceived locally (hungry housemates, empty larder when seen). The risk is accepted so the rule stays clean; a "cry out" bark (a short-range alarm audible within `HEAR_R`) stands in for panic.
  - Alternative: keep a global `fc` flag. Breaks the direction; kept as a fallback if collapse risk proves real.
- **OD-61: where `can(sim, craft)` ("anyone knows it") is used.** Default: left village-wide (it is Almanac/capability, not planning). Planners ask `famOf(v)` or the slimes it knows are knowers.
- **OD-62: the dev guard in release builds.** Default: dev flag only; zero cost in play.

## Sequencing against Phase 8 (saving)
- **Phase 8 lands first.** The package format puts `v.bel` and the board entity's notices in the **global** record (villagers are global, OD-55); the belief store is plain arrays of integers and strings, so no new codec work.
- Facts are **world-coordinate** data with no chunk dependency, so chunk eviction does not touch them. A belief about an evicted area is simply a belief; the slime walks there and the chunk pages in on arrival. Eviction must keep treating a chunk as active while a slime's current target lies in it.
- 9.28 adds `v.bel` and `board.notices` in **SAVE_VERSION 17**, with a migration that gives old villagers an empty store plus the founder seed (OD-57). Because 9.28-9.29 change planning, old saves replan from the seed beliefs; hashes after the migration are not comparable to before (documented, as for earlier phases).
- If Phase 9 had to go first, the beliefs would sit in the monolithic JSON and move into the global record in 8.24 with no redesign. But 8.24 is cheaper if it knows the shape now.
- **Save size:** 24 facts x ~28 bytes x ~30 villagers is ~20 KB raw, ~5 KB gzipped; the board adds ~1 KB. Entities currently are 152 KB, so this is a ~12% rise, shrunk by 4x gzip.

## Risks
- **Village collapse from ignorance.** A slime that has never seen a berry bush starves beside one. Mitigations: OD-57 founder knowledge; a cheap, id-staggered `explore`/`wander` that looks around; board seed notices; `need:food` perception; the OD-60 "cry out". Test: the telepathic baseline fixtures must still survive a year.
- **Balance.** Latency (walks to the board, stale facts, wasted trips) lowers the whole economy's throughput. Expect to retune demand weights and `LOOK_R`; a global "ignorance" scalar (`LOOK_R`, `STALE`) is a single-knob tuning aid.
- **Determinism.** The look is entity-grid iteration in sorted order; gossip pairs are chosen by id order exactly as `tell` is. Ties in belief ranking break by (distance, id). No clock, no `Math.random`. A replay hash test with the guard on.
- **Save size.** Capped by design (slots, notices); the board is capped and expiring.
- **Hidden complexity.** Many planners (11+ scan sites) must change; the dev guard is the safety net that stops a stray `ofKind` from reintroducing telepathy.
- **Performance.** Look must stay O(local); the entity grid lookup must not hide an `ofKind` filter.

## Fit with the hard rules
- **Pure deterministic sim:** beliefs, the board and gossip are integer sim state, saved and hashed; the UI only reads them.
- **One Action pipeline:** `post` and `check_board` are ordinary jobs producing ordinary Actions; possession uses the same pipeline and the same belief writes.
- **Blocker enum on every rejection:** `UNKNOWN_PLACE` and `STALE_BELIEF` are added; a rejected alternative always has one.
- **Testing rules:** every test is a pre-situated fixture (a slime, a bush it has / has not seen; a board with notices); none simulates up to the moment, each is capped to well under five minutes, and the sim suite runs one process at a time.

## Effort (ASSUMPTION)
- 9.28: 0.3-0.5 FTE-months
- 9.29: 0.7-1.2 FTE-months (the widest change; 11+ planner sites)
- 9.30: 0.4-0.7 FTE-months
- 9.31: 0.4-0.7 FTE-months
- 9.32: 0.4-0.7 FTE-months (the balance pass is the open-ended part)
