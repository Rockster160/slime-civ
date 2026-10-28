# Investigator C: Simulation and Technical Architecture

Author: Claude Sonnet (technical skeptic; role originally assigned to Codex Luna).
Scope: data structures, complexity, cost. No engine commitment, no production code.
Labels: ESTABLISHED = documented technique/game; VERIFIED = I read it in /Users/zoro/code/slime-village; ASSUMPTION / SPECULATION as marked.

Skeptic's headline: the brief wants (a) freeform player-built buildings, (b) blueprints, (c) autonomous villagers with learned skills, (d) two camera views, (e) deterministic/multiplayer-ready, (f) 200 villagers. Each is affordable alone. Together they are a project-killer unless the world representation is chosen to make (a)(b)(d) cheap. Everything below is biased toward the smallest world model that still lets a player build a house with a roof and dig a mine.

---------------------------------------------------------------------------------------------------------------

## 1. Recommendations

1. **Default world model: a 3D integer cell grid (x, y, z) stored in chunks, simulated as "2D tile grid with z-levels" (Option 1/3 hybrid), with per-cell material+shape, NOT free-form voxel meshes.** Rationale: it gives underground, multi-storey buildings, roofs and digging (the brief's mines and houses) at 2D-sim cost, and keeps the door open to a 2.5D renderer without rewriting the sim.
2. **Fix the world envelope up front: 256 x 256 x 48 cells (about 3.1M cells), 16x16x16 chunks, 1 byte material + 1 byte state per cell in typed arrays.** ASSUMPTION; validate in prototype P1. Rationale: ~6 MB raw; every algorithm below is sized against it.
3. **The simulation is the product; renderers are replaceable clients.** Sim has zero DOM/engine dependency, runs headless in tests, and exposes read-only snapshots + an event stream. Rationale: slime-village already proves this works (VERIFIED: 161x real-time headless).
4. **One `Action` abstraction, executed by a single `ActionRunner`, used by AI jobs and by possessed-villager input.** A possessed villager's click emits the same Action; the AI planner is simply turned off for that one entity. Rationale: this is the only way "same rules, same timings, same skill gains" stays true as content grows.
5. **Work is a job board with reservations; three job sources (explicit orders, standing orders, demand-driven) write into the same board and are ranked by one priority formula.** Keep slime-village's "demand vector" as the generator of the third source only. Rationale: slime-village scoring is debuggable ("every job explained by two numbers") but cannot take orders.
6. **Rooms: hybrid. Flood-fill finds enclosed volumes automatically; the player's furniture/blueprint decides what the room IS; an optional zone tool overrides.** Rationale: RimWorld-proven; incremental recompute is cheap if limited to a dirty-region flood.
7. **Blueprint = sparse list of (relative cell, material-class, shape, rotation) + entity list, with a dependency DAG derived at capture time (supports before roofs).** Material substitution by *class* not by item. Rationale: lets "build 10 more" survive different local resources.
8. **Determinism from day one: fixed timestep (integer ticks), integer or fixed-point-safe math in rule-affecting code, per-subsystem RNG streams seeded from world seed, save = seed + sparse delta, command log for every player input.** Rationale: slime-village has the save pattern but a single global RNG and float `dt` (VERIFIED); both must change before multiplayer is even thinkable.
9. **Do NOT build netcode. DO build: command log, tick-numbered inputs, state hash per N ticks, no render-side reads of sim RNG.** Rationale: costs a few percent of dev time now, saves a rewrite later.
10. **Pathfinding: hierarchical (chunk portals / region graph) over the 3D walkable graph, with flow fields only for mass goals (stockpile, bed, danger).** Slime-village's raw A* cost 43% of the whole sim at ~137 slimes (VERIFIED in code comment); a 256x256x48 world with 200 villagers will not survive naive A*.
11. **LOD: only the player's active settlement runs full ticks; all others run an abstract "aggregate tick" (daily resolution) plus lazy catch-up on observation.** Rationale: bounds cost; matches slime-village's "meant to be left running" design.
12. **Prototype first (see section 2.13):** (P1) chunked 3D grid + hierarchical pathfinding with 200 agents, (P2) incremental room flood-fill under building edits, (P3) shared Action runner with possession toggle, (P4) determinism/replay test across two runs and across two browser engines, (P5) two-view rendering of one sim (top-down + billboard-3D) to measure the real extra cost.

---------------------------------------------------------------------------------------------------------------

## 2. Supporting reasoning

### 2.1 World data representation: four candidates

Common requirements from the brief/AGREED: destructible terrain, caves and mines with automatic exploration, free-construction buildings with a defined interior ("size, materials, N tables/chairs"), roofs/walls/floors, one persistent world, 200-ish individuals, an author who prefers ONE camera and would like cheap view-switching.

#### Candidate A: 2D top-down tile grid with depth layers (DF / RimWorld style)

Representation (ESTABLISHED: Dwarf Fortress stores the map as blocks of 16x16 tiles per z-level; RimWorld is one z-level plus separate "mountain" thickness with roof grid, i.e. a roof layer and a floor layer but no real z):
```
World { w=256, h=256, d=48 }
Chunk { x,y,z, material: Uint8[16*16*16], flags: Uint8[...], light/temp optional }
Cell material examples: air, dirt, stone, ore_iron, wood_wall, brick_wall, floor_plank, ...
```
- Dev cost: LOW-MEDIUM. Top-down rendering of one z-level at a time (view "slice", cut-away of upper levels) is a solved problem; z-level stairs/ramps are the only extra rule.
- Gameplay benefit: caves, mines, multi-storey buildings, basements, tunnels; clear spatial reading for the commander ("you 5 go build here" is a rect drag).
- Performance: sim cost independent of renderer. Render cost is one z-slice (~65k cells) visible; trivial. Memory 3.1M x 2 bytes = 6 MB.
- Tooling: tile editors, easy debug dumps, blueprints are literally small 3D arrays.
- Weakness: first-person and "forest feels tall" are not free. Z-slice UX (what is above me?) is a known readability problem in DF; needs good cutaway rules.

#### Candidate B: 2D side-view tile grid (Terraria)

- Representation: one 2D grid (x, z=vertical), no depth in y. World 4200x1200 in Terraria (ESTABLISHED for scale; stored as tile structs, chunked in saves).
- Dev cost: LOWEST for sim and renderer (sprite tiles, gravity, simple lighting).
- Gameplay benefit: mining/digging down is the core fantasy, direct and legible; settlement is a thin 2D slice.
- Problems for THIS game: (1) a colony of 200 on a one-cell-deep world degenerates into a corridor; no room for sprawl, farms, roads, wagons, and "build 10 more houses" becomes a linear queue along one line. (2) Pathfinding is ledge/jump platformer pathing (more complex than grid walking: gravity, ladders, jump arcs; Terraria's own AI notoriously struggles with it). (3) Farming, animals "wandering the world", and a large first planet map do not suit it. (4) Does not support top-down view at all.
- Verdict: reject as primary. Great as a *mining sub-view* maybe, but that would be a second view type, which the author wants to avoid.

#### Candidate C: 2.5D: 3D voxel/column grid rendered with billboard sprites (Delver-style)

- Representation: the SAME 3D cell grid as Candidate A; the difference is the renderer: cells draw as textured cubes/quads, entities as camera-facing billboards. ESTABLISHED: Delver, Doom-era sprites, Octopath/HD-2D style. Camera can be top-down orthographic, isometric, third-person or first-person.
- Dev cost: MEDIUM (needs a 3D engine, mesh batching per chunk, frustum culling, occlusion/cutaway, billboard depth sorting, lighting).
- Gameplay benefit: free choice of view without sim changes; first-person possession feels like a real mode; building from inside is natural.
- Performance: chunk meshing (greedy meshing or per-face culling) is well understood (ESTABLISHED: Minecraft community write-ups, 0fps.net "Meshing in a Minecraft game"). Cost is on the GPU/draw-call side, scales with visible chunks, not population.
- Risk: 2D art assets are cheap; but billboard sprites need 4-8 facing variants or a deliberate "always faces camera, symmetric" art rule. A top-down view of billboards looks wrong (sprites are drawn side-on). So the "same assets for both views" promise is false unless each creature has a top-down sprite AND a side sprite. See 2.10.
- This is Candidate A with a more expensive renderer attached. It does not need a different sim.

#### Candidate D: full 3D voxels (Minecraft)

- Representation: same grid but with arbitrary freeform shapes, smooth lighting, fluids, falling blocks; creatures move continuously in 3D with physics.
- Dev cost: HIGH. Continuous collision, continuous pathing (navmesh or voxel nav), physics, camera collisions, animation.
- Gameplay benefit: fullest "build anything" feel; the author references MC/Terraria for building.
- The skeptic's point: the *building feel* of Minecraft comes from placing cells, not from continuous physics. We can have that feel with a discrete grid (Candidate A/C). What D adds on top (continuous entity physics, arbitrary meshes) costs the most and gives the commander-style game the least.
- Reject as default.

#### Comparison table

| Axis | A: 2D+z grid | B: side-view | C: 2.5D billboards | D: full 3D |
|---|---|---|---|---|
| Sim dev cost | Low-Med | Low | Same as A | High |
| Render dev cost | Low | Low | Med | High |
| Underground/caves | Yes (z) | Yes (native) | Yes | Yes |
| Multi-storey/roofs | Yes | Awkward | Yes | Yes |
| Settlement sprawl (200 pop) | Yes | Poor | Yes | Yes |
| Two views | Top-down + cutaway | No | Yes (any) | Yes |
| Pathfinding | Grid, well known | Platformer pathing | Grid | Nav-voxel/navmesh |
| Blueprints | 3D array | 2D array | 3D array | Complex |
| Determinism | Easy | Easy | Easy (sim=A) | Hard (physics floats) |

#### Recommended default

**A as the simulation, C as an optional second renderer.** Concretely: sim world is the 3D integer grid (Section 2.2). First renderer: top-down with z-slice cutaway (cheapest, and pillar-friendly: rect-drag orders, zone painting). Second renderer (only if prototype P5 passes): billboard 2.5D over the same chunk data, which gives first-person possession. This follows the author's stated preference for ONE view for the MVP while keeping Dragon Quest XI style dual view possible.

What must be prototyped to confirm: P1 (cost at envelope), P5 (is the second renderer < ~25% of the first renderer's effort?), and a **readability test** of z-slice cutaway with real players (not me): can a tester find the stairs and tell the roof from the floor.

Engine candidates (no commitment; tradeoffs only):
- **Web (Canvas2D/WebGL, TypeScript or JS)**: author's slime-village is JS and the whole sim could be ported with moderate rewrite; zero install; PixiJS/Three.js for rendering. Weakness: single-thread by default (Web Workers needed for sim off the render thread), GC pauses, float determinism across browsers is "mostly" fine for `+ - * /` and sqrt but NOT for `Math.sin/exp/log/pow` (not specified to be bit-identical across engines; ESTABLISHED, ECMAScript spec says implementation-approximated).
- **Godot 4 (GDScript/C#)**: good 2D and 3D, tilemaps/gridmap, free; author has a 2021 Godot 3 start (Dorfs, 253 lines, nothing to reuse). GDScript performance for 200 agents + hierarchical pathing may need C#/GDExtension.
- **Unity**: mature DOTS/ECS and voxel ecosystem, licensing/terms risk, heavier for a small team.
- **Custom (Rust/C++ + wgpu/SDL)**: best determinism/perf control, largest dev cost. Not justified before prototypes.
Recommendation: choose the engine AFTER P1 and P5; keep the sim in a language that can run headless in CI.

### 2.2 Cell data model, chunking, destructibility

```
Cell (2 bytes in typed arrays; extra fields sparse):
  mat:   u8   // MaterialId: air, dirt, stone, sand, ore_*, plank, log, brick, glass, ...
  flags: u8   // bit0 solid, bit1 opaque, bit2 walkable-top, bit3 liquid, bit4 roofed(derived),
              // bit5 designated, bit6 has_entity_overlay, bit7 reserved
Sparse per-cell data (hash map by cellIndex):
  hp (damage while mining/chopping), fluid level, fertility/moisture (surface only), owner/plot id
Shape (optional second byte plane, added only when needed):
  Full | Half-slab | Stair/Ramp(dir 0-3) | Door/Window frame
```
- Why 2 bytes: 256x256x48 = 3,145,728 cells -> 6.3 MB. Chunk 16^3 = 4096 cells -> 8 KB/chunk, 768 chunks total.
- Walls/floors/roofs are just cells: wall = solid cell in the xy-plane at that z; floor = solid cell below; roof = solid cell above an interior cell. This is the DF approach (floor and wall are construction types of tiles). It avoids RimWorld's special roof grid.
- Furniture, doors-as-entities, plants, items: **entities with an occupied-cell list**, not cells. Reasons: they have state (progress, owner, inventory), can be moved, and blueprints need to capture them separately. A door is a cell flag (passable+opaque) PLUS an entity for open/closed/locks (ESTABLISHED: RimWorld uses Building entities for doors).
- Dirty tracking: each chunk has `dirtyMesh`, `dirtyNav`, `dirtyRoom` bits set by any cell write. All derived systems consume the dirty set once per tick.
- Chunk streaming: world fits in RAM at this size; chunking exists for dirty-tracking, nav regions, saving deltas, and render batching, not memory paging. Keep paging out of MVP.
- Destructible terrain: mining is "designate -> job -> cell.hp -= power*skill*dt -> set mat=air (and drop item)". Collapse: optional; ESTABLISHED DF cave-ins require support analysis. SPECULATION: keep structural support rule to *buildings only* ("roof span > N cells needs a pillar") and use soft rule for mines (shoring item, damage risk) to avoid a full structural solver. Slime-village already has "deep shoring" in the mining chain (see its jobs.js comment about metal reserve for shoring).
- Caves/underground: generated from 3D noise at world creation (pure function of seed). Cave regions are labelled in a connected-component pass (also used as an "explorable region" tag for auto-exploration).
- Liquids: water as per-cell fill level with simple cellular automaton is where voxel sims explode in cost (DF fluid CPU hogging is infamous; ESTABLISHED). Recommendation: **static water bodies + rain/irrigation as tags, no flowing fluid sim in MVP.**
- Cost sanity: marking dirty nav on a one-cell edit touches ≤ 7 chunks in a 3D neighbourhood in the worst case (cell on a corner), typically 1.

### 2.3 Terrain and building systems

Authored data table, not code:
```
material: { id, name, solid, opaque, hardness, tool_class, drop_item, buildable_as: [wall|floor|roof|any], 
            insulation, beauty, flammable, class: "stone"|"wood"|"metal"|"earth"|"glass" }
building_kind: { id, footprint:[cells], rotations, required_cells: ..., work_tool: ..., unlocks: ..., cost: {class:n} }
```
- Player-facing verbs: place wall/floor/roof paintbrush (drag line/rect/fill), place furniture entity, designate mine/chop/harvest, designate zone (stockpile, farm). All are Commands (section 2.12) that create *designations* or *blueprints-in-progress*; actual change happens only when a villager executes a Build/Mine Action.
- Ghost construction: a placed-but-unbuilt cell is a "ConstructionSite" entry (cell -> {target mat, delivered materials, progress}). It is walkable/non-blocking until complete, except for anti-trap rules (don't wall in workers). RimWorld "blueprint -> frame -> building" is the model (ESTABLISHED), with three states and material delivery to the frame.
- Slime-village divergence (VERIFIED): buildings there are prefab defs (`BUILDINGS` in data/craft.js), terrain is read-only. Everything in this section is NEW dev work; no code ports. What does port is the *data-driven def + cost table* pattern.
- Roofs: "roofed" is a derived flag = any solid cell above within N cells in same column and ≥ 1 neighbouring support (simple rule). Gameplay use: rain/snow protection, room qualification, temperature. Derived by column scan; cheap, incremental per column.
- Smallest viable set for MVP: ~12 materials, ~8 shapes (full, door, window, stair, ramp, slab, + 2 variants), ~25 furniture/workstation entities. More content is data, not systems.

### 2.4 Shared Action abstraction (AI and possessed villager)

Principle (ESTABLISHED analogues: RimWorld "Job" + "JobDriver" toils; DF "job" with `job_type`; The Sims interaction queues): the controller decides WHAT, the Action decides HOW and costs time. Controllers never mutate the world.

```
interface Action {
  id: ActionTypeId                     // Move, Mine, Chop, Build, Haul, Craft, Attack, Eat, Sleep, Talk, Pray...
  actor: EntityId
  target: { cell?, entity?, item?, area? }
  // 1) legality & cost, evaluated by SIM, same for all controllers
  validate(world, actor): Result       // reach, tool, skill gates, reservation, safety
  durationTicks(world, actor): int     // from base time / (skill factor * stat factor * tool) ; integer
  // 2) execution is tick-stepped, interruptible
  begin(world, actor)                  // take reservations
  step(world, actor): Running | Done | Failed(reason)
  end(world, actor, outcome)           // apply effect, drop reservations, award XP
  // 3) metadata
  skillUsed: SkillId, xpBase: number, noise: dB, danger: ..., interruptible: bool
}

interface Controller { nextAction(world, actor): Action | null }  // AIController | PlayerController | ScriptedController
```
- **AI controller** pulls from the job board / needs queue and returns Actions.
- **Player controller**: input (WASD/click) → `Command{type:"Act", actor, action}` → validated → same Action instance in the same runner. Move inputs become `Move` Actions of 1 step so possession has no special physics path.
- **Divine inspiration buff**: a modifier object `Modifier{source:"inspiration", skill_mult:1.15, xp_mult:1.25}` applied in `durationTicks` and `xp` calc for ANY controlled actor. It is a stat the sim knows about, not a branch in controller code. Keeps "push, not requirement": AI-controlled villagers have no buff, so the numbers must be tuned so uncontrolled is still fine.
- **Skill gains**: `end()` calls `awardXP(actor, skill, xpBase * outcomeQuality)`. Same function for both controllers. The only difference allowed: modifier from inspiration. If an unnecessary-difference appears in code review, it is a bug.
- **Interrupts**: needs (hunger, sleep), threats, and explicit orders preempt by priority class (Section 2.5). On interrupt: `end(..., Interrupted)` runs, reservations released, partial progress stored on the target (e.g. cell.hp, construction progress) so work is not lost.
- Complexity: runner is O(active actors) per tick, each step O(1) except path following.
- Failure case to design for: possessed villager walks into danger and dies = permadeath. Rule: the **sim does not care** who controlled the actor. UX must warn; that is a design point not a tech one.

### 2.5 Autonomous work scheduling

Compared systems:

| System | Mechanism | Strengths | Weaknesses for us |
|---|---|---|---|
| RimWorld (ESTABLISHED) | Per-pawn work priorities 1-4 per work type, `WorkGiver`s scan for jobs by type, pawns pick highest-priority type whose WorkGiver finds something; reservations via `ReservationManager`; bills with "do until you have X" | Player-legible matrix, proven, supports "maintain N" via bills | Matrix management is itself micromanagement at 30+ pawns; scanning cost |
| Dwarf Fortress (ESTABLISHED) | Job list globally; labor toggles per dwarf; workshops hold standing "work orders"/manager orders; dwarves grab nearest eligible job | Deep, many job types | Notorious idle/"job-hauling-starvation" bugs; opaque ("why isn't he working?") |
| Timberborn (ESTABLISHED) | Beavers auto-assigned to workplaces with per-building worker count and priority; haulers fetch goods to demand-flagged buildings | Very legible: you tune workplace slots | Workplace-centric, not free-roaming individuals |
| slime-village (VERIFIED) | Village `demand` vector once per second; each idle slime scores visible jobs = demand x profession affinity x proximity x per-slime `temper`; claims (`claimedBy`) prevent double-taking | No central assignment; debuggable via two numbers; no deadlock; soft pressures | No player orders; no standing orders; profession is fixed; no hauling queue (slimes carry what they need) |

Recommended hybrid ("job board with three feeders"):
```
Job { id, kind, target, requires:{skill?, tool?, carry?}, priority:int, source:Order|Standing|Demand,
      reservedBy: EntityId|null, createdTick, expiresTick? , cellHint }
JobBoard: spatial index by chunk -> list of open jobs per kind
Reservation: Map<TargetKey, {owner, expiryTick}>  // TargetKey = cell | entity | stack-slot
```
Priority formula (one place, tunable, explainable):
`score = basePriority(source) + urgencyDemand + skillFit*w1 + proximityBonus - pathCost*w2 + temper`
with source ranking: **Explicit order > survival need > Standing order > Demand-generated > Idle/leisure**.
- **Explicit orders** (AGREED: "you 5, go harvest lumber"): create Assignment { workers:[ids]|group, job template, area }. The assigned villagers get an override flag: board jobs of that kind inside the area are reserved for them first. If the Assignment ends or fails, they return to autonomy. Cost: group assignments reference a template, not N jobs.
- **Standing orders** ("maintain 200 lumber", ESTABLISHED RimWorld bills "Do until you have X", Timberborn stockpile thresholds): `StandingOrder{ item, targetStock, minStock?, area/group, maxWorkers }`. A once-per-N-ticks evaluator compares `stock(item)` to threshold and spawns demand jobs (chop -> haul) until satisfied. Prevents infinite production with a hysteresis (start below min, stop at target) to avoid flapping.
- **Demand-driven** (slime-village style): village demand vector produces jobs when no order covers the need (food low -> forage/farm; shelter low -> build). This is what keeps the village alive while the player is away (pillar 6/7 in CONTEXT). Port `computeDemand` structure; replace "scoring only" with "emit board jobs".
- **Hauling**: separate job kind generated by events: item dropped outside a stockpile zone, construction site needs material, workstation needs ingredient, standing order output. `HaulJob{item stack, from, to}`; reservation on both stack and destination slot. Transport ladder (hand -> backpack -> wagon -> cart; AGREED) is a `carryCapacity` + `speed` property on the carrier entity; a wagon is an entity with inventory and a driver requirement. Do not do belts (AGREED no).
- **Legibility is a design requirement, not a nice-to-have**: every villager always exposes `currentAction`, `reason` ("order: harvest lumber", "demand: food 0.8", "need: sleep"), and a `blockedBy` explanation. Slime-village's `jobPurpose()` / `demandWhy` (VERIFIED) is exactly this and should be ported in spirit. DF's opacity is the cautionary tale.
- Complexity: scan cost is O(open jobs in nearby chunks) per idle villager; keep a per-kind spatial index. With 200 villagers and ~1 re-plan per ~10 s each, ≈ 20 job-picks/second; each over ≤ 200 candidates = 4k evaluations/s. Cheap. Slime-village's `findJob` is 1700+ lines (jobs.js 1794→2663 VERIFIED) mostly because every job kind is inlined: separate by kind and test each.
- Starvation risks (ESTABLISHED DF/RimWorld problems): stuck reservations (always expire + validate on every step), unreachable targets (cache per-region reachability, mark job `unreachable` with cooldown), haul loops (no hauling from a stockpile to an equal-priority stockpile), and priority inversion (low-prio hauling blocks building).

### 2.6 Genetics and experience data model

Slime-village base (VERIFIED): 9 traits, `breed()` mixes per trait: 22% parent A, 22% parent B, 28% midpoint, 28% random lerp, ± 5% noise; `settle(v, mid, soft)` log soft-cap beyond `soft` from the middle; no skills, profession random.

Proposed model (extends, not replaces):
```
Inhabitant {
  genome:   { traits: Float[N] }        // "potential": speed, strength, stamina, intellect, drive, leisure, fertility, longevity, vitality + aptitude per skill (optional)
  skills:   Map<SkillId, {xp: float, level: derived}>
  traits_runtime: derived caches       // genome through settle(), age curve, injuries
  memory/knowledge: Set<KnowledgeId>   // tech knowledge (CANDIDATE: see other investigators)
  personality: {temper hash seed}      // reuse slime-village temper()
}
```
- **Aptitude vs skill**: genome gives `aptitude[skill]` (how fast XP is gained and the soft ceiling), XP gives expertise. Matches AGREED "natural stats (genetic) + experience". No manual allocation.
- **XP gain with diminishing returns (SPECULATION, needs tuning)**:
  `dxp = baseXP(action) * aptitude * 1/(1 + level/L0) * qualityFactor * (1 + inspiration)`
  and `effective_skill = settle(level_curve(xp), mid, soft)` so extreme skill is possible but flattens, reusing `settle()` (VERIFIED code: `util.js:59`). Level could be `log` of XP (i.e., 10x XP for each +1 level) like many RPGs; choose one curve and publish it.
- **Use-based practice only** (AGREED "experience from what they do, including off-time"): hobbies/leisure Actions award small XP to a *leisure-skill*; leisure choice influenced by `leisure` and aptitude. Slime-village already has leisure as a first-class need (VERIFIED: `leisureNeed`, `strain`).
- **Inheritance of skill**: genes only (aptitude) + cultural transmission via teaching/apprenticeship (CANDIDATE; belongs to others). Technical hook: an Action `Teach{teacher, student, skill}` that gives the student XP at `min(teacher_level*k, cap)` rate. Do NOT inherit levels (Lamarckian) — it would defeat permadeath's weight.
- **Anti-min-max (brief's concern)**: three technical guards: (1) `settle()` on genome traits as in slime-village; (2) inbreeding/diversity penalty on `fertility` or `vitality` (needs a kinship coefficient = shared-ancestor query; cheap if each individual stores `ancestry hash` of last 3 generations); (3) trait trade-offs in expression (e.g., high strength costs stamina upkeep). These are design levers; the tech just needs the fields.
- **Storage cost**: 200 villagers x (9 traits + ~12 skills x (xp float) + misc) ≈ 200 x ~200 B = 40 KB. Ignorable. Even 10k historical records (dead ancestors for lineage) is 2 MB. Keep dead individuals as compact records for chronicles.
- **Permadeath**: death is an event that removes from sim and writes a `Gravestone` record `{id, name, parents, skills_at_death, cause}` in a chronicle log. Needs the event stream of 2.11.

### 2.7 Room and building recognition

Options:
1. **Flood-fill (RimWorld, ESTABLISHED)**: `RegionAndRoomUpdater` recomputes rooms from "regions" when walls/doors change; each room computes stats (size, beauty, impressiveness) and a role from contained buildings.
2. **Explicit zone designation (DF-style "room/zone" with designate)**: the player draws a rectangle and declares "bedroom".
3. **Hybrid (recommended)**: flood-fill finds enclosed volumes (bounded by solid cells/doors; "open to sky" is a flag); rooms are named by contents (bed -> bedroom, 2 tables + 4 chairs -> dining) with explicit override by a `Zone` tool, and zones always win.

Algorithm sketch (3D):
```
Room = connected set of non-solid cells where "connected" crosses doors but not walls,
       and does not cross open air/outside (outside = any cell with sky access or reached from world boundary).
On cell write at c: mark chunk dirtyRoom, add c and 6 neighbours to a dirty set.
At end of tick: for each dirty cell not yet visited this tick:
    flood-fill with a cell cap (e.g. 4096). If exceeded => "outside/open", stop, tag as outdoors.
    Compare with previous room ids; split/merge via union-find rebuild limited to affected rooms.
```
- Complexity: flood fill is O(room volume) bounded by the cap; typical house 10x10x3 = 300 cells; an edit triggers at most two fills (split) or one (merge). At 4096 cap a single event costs well under 1 ms in a typed-array implementation (ASSUMPTION; validate in P2).
- Door toggling must NOT trigger refill: treat door cells as passable for room connectivity but use a separate "air tight" flag; (RimWorld treats doors as room separators by region—design choice). Decide: doors separate rooms (so a bedroom behind a door counts). Doors are a cell flag, so open/close state is entity-side only.
- Roofs matter in 3D: a "room" needs roof OR is a "yard" if capped but open above. Define `Interior = enclosed in x,y AND has roof cell above within H`. Gives rain/cold effects.
- Requirement check ("size, materials, N tables/chairs", AGREED): data per building-purpose: `{minCells, maxCells, requiredEntities:[{kind,count}], wallMaterialClass?, floor?}`; evaluate per room on change. Output: `room.roles[]` and a quality score. 
- Rooms also provide the fuel for "build 10 more of these": a blueprint instance can be registered as a template for a purpose.
- Pitfalls: concave L-shaped houses, diagonal gaps (use 6-connectivity in 3D, 4-connectivity in 2D to prevent diagonal leaks), a single window gap leaking rooms (windows = solid for flood but transparent for sight), and players building giant rooms (cap).

### 2.8 Blueprints and construction

Capture:
```
Blueprint {
  version, name, origin: (0,0,0) relative anchor cell,
  bounds: [dx,dy,dz],
  cells: [ {rel:(x,y,z), matClass:"stone"|"wood"|..., shape, rot, role:"wall|floor|roof|support"} ]  // sparse, palette-compressed
  entities: [ {kind:"bed", rel, rot, tags} ],
  deps: derived DAG (not stored; recompute) 
}
```
- **Capture** = player draws a box; the tool takes all player-built cells and furniture entities inside (not terrain), stores material *class* by default, optionally exact material (toggle). Blueprint is an asset the player can name, share (future), and rotate in 90° steps (4 rotations x mirror optional). Rotation = remap of (x,y) and each shape's direction; precompute the 4 variants lazily.
- **Material substitution**: wall/floor/roof roles accept any material whose `class` matches and whose `buildable_as` includes the role; per-order override ("use stone"). Fallback chain by availability (stone → brick → wood); if nothing available, order stalls with an explainable "needs: 40 stone-class". Do not auto-downgrade silently across qualities.
- **Placement validity**: terrain slope/overlap; the blueprint may require foundations. Allowed to auto-add **terrain prep** jobs (flatten/clear) as the first phase, shown in the ghost.
- **Build-order sequencing**: derive a DAG from the cell set at order time:
  - rule 1 each cell needs a supporting cell below or adjacent in the plan (or natural terrain);
  - rule 2 floors before walls inside, walls before roof, support pillars before roof span;
  - rule 3 furniture after floor, before door blocks the way in (or place furniture inside first, door last);
  - rule 4 never enclose a worker: reserve an exit until final cell (build door last) — ESTABLISHED problem in RimWorld/DF where pawns wall themselves in.
  Topologically sort by (z ascending, supports first, outside-in for walls) and release jobs in "waves" so haulers deliver materials just-in-time (don't dump 400 blocks into one corner).
- **Partial completion**: each cell has state {unplaced, framed(materials delivered), built}. Saved as sparse construction site list. Cancel returns delivered materials as items on the ground (policy: lose 0-25% on cancel, a design knob).
- **Damaged/modified buildings**: blueprints are *templates*, not links; modifying the house later doesn't change the blueprint. Provide "update blueprint from this building" later.
- **Cost of "build 10 more houses"**: 10 sites x ~300 cells = 3000 construction cells; jobs are generated lazily in waves (e.g. 30 open jobs per site) so the board isn't flooded. Worker count scaling is natural: more builders = faster. Needs a cap on pending sites.
- **Blueprint storage size**: a 300-cell house ≈ 300 x 4 B ≈ 1.2 KB; palette/run-length bring it near 300 B. Trivial.
- Slime-village (VERIFIED): prefab defs with site/stage logic (`siteCount`, plotCells) — reuse the staged material-delivery and "builders claim a site" pattern; everything about freeform cells is new.

### 2.9 Camera architecture and the cost of two views

Single-sim, multiple-renderer architecture:
```
Sim (headless)  --snapshot/diff-->  RenderModel (interpolated positions, dirty chunks, sprite states)
RenderModel -> TopDownRenderer | BillboardRenderer | (future) ...
Input: raw device -> InputMapper(view) -> Command (view-independent: "cell (x,y,z)", "entity id")
```
- Rules: sim never knows the camera; picking is the renderer's job but must resolve to cells/entities before leaving the view layer; UI panels (inspector, job lists, blueprint tool) are view-independent and must be built once.
- **Cost of a second view** (SPECULATION; P5 measures): the sim shared; additional work = chunk meshing (if not already 3D), billboard pipeline with depth sort, second sprite sheet (top-down sprites + side sprites), cutaway rules, picking, lighting, placing UI "ghosts" in 3D, first-person controller and collision with the same Action semantics. My estimate: **adding a billboard 3D renderer to an existing top-down one costs ~0.6-1.0x of the first renderer**, not 0.1x. Most of the cost is art and UX, not code.
- **Billboard sprites**: Delver-style sprites face the camera around Y only. In top-down orthographic they must be a different sprite (head-on from above), so every creature/furniture/plant needs ≥ 2 sprite sets (side + top) unless you use pixel-art "3/4 view" for both (the Zelda/Octopath compromise: tilted camera ~45° so a single 3/4 sprite reads). Recommendation: pick ONE camera pitch for everything (3/4 oblique, e.g. 60° down) and offer first-person only as a possession mode; dual full views would double asset work.
- No gameplay advantage between views (author's DQXI example): the sim must not give view-dependent information. Fog-of-war/visibility is sim-side or player-state-side, not renderer-side, so neither view can see more.
- Possession in first-person: the player's inputs are Actions; look direction is cosmetic except for aiming (if combat) — define "facing" in sim as a 8-way or angle field only if Attack Actions need it.
- Skeptic note: author said "cameras are hard enough to balance." Technically that is correct. The cheapest honest answer is: top-down + z-slice for MVP, 2.5D second renderer behind a prototype gate.

### 2.10 Save data and determinism

Reuse (VERIFIED in `sim/save.js`):
1. seed + sparse delta ("island not saved but regrown"): terrain is a pure function of seed; only changed ground is written, quantised to a byte per tile for three float arrays.
2. references become ids and relinked; transient state (current job, path) dropped and re-derived.
3. generic field copy with denylist.
4. `save_roundtrip.js` steps a restored game alongside the original and requires tick-for-tick equality (ran and passed per audit).

What changes for this game:
- **Terrain is now mutable and player-built**: the seed regrows base terrain, and the delta is a *chunk diff*: for each chunk with any player/AI change, store a run-length encoded chunk (or a list of (cell,newMat)). 256x256x48 worst case (everything mined) is ~6 MB raw → ~100-500 KB RLE'd. ASSUMPTION; validate.
- **Terrain generation must be bit-reproducible forever** (or the delta no longer matches). Version the generator: `worldgenVersion` stored; if code changes the generator, old saves keep the old generator or store the baseline. ESTABLISHED trouble: Minecraft keeps legacy generators for old worlds. Cheaper alternative: store the generated chunk in the save once it is first modified (copy-on-write chunks). Recommended.
- **"Drop transient jobs on load"** works for a single player; for a replay/lockstep it must be deterministic anyway (see below). Dropping is fine only because planner re-derives deterministically from the same state — test with roundtrip.
- **Fixed timestep**: slime-village steps at 1/30, 1/15, 1/10 s depending on speed (VERIFIED game.js:498), with `dt` in float seconds and the step size *changing with speed*. That breaks determinism across speeds (a sim at 5x steps differently than at 1x). Fix: one tick = fixed `DT` (e.g. 1/20 s of game time), speed = ticks per frame; never vary step. Slime-village needs this change before porting rules.
- **RNG**: slime-village uses ONE global mulberry32 (`util.js`, VERIFIED; `Math.random` count in sim = 0, good, `rand()` calls ~27 in some files; most call sites via helpers). Single stream means any added consumer (e.g. a render-side flavour roll, or a new subsystem) shifts all later draws → desync/diverged saves. Use **named streams**: `rng(worldSeed, "worldgen")`, `("genetics")`, `("weather")`, `("ai", actorId)`, `("combat")`, derived by hashing (seed, name, id[, tick]). Prefer **counter-based RNG** (hash(seed, stream, counter)) so a stream's value does not depend on how many calls other code made. Rendering uses a separate non-sim RNG.
- **Floating point**: 92 uses of sin/cos/exp/pow/log in slime-village sim (VERIFIED by grep) — fine for single-machine replay, NOT safe for cross-machine lockstep (JS engines may differ in last bits; ESTABLISHED). Mitigation tiers: (a) accept: determinism only on same build+engine (save/replay, record/playback tests) — enough for MVP; (b) later: replace transcendental functions in rule paths with table lookups/own implementation; use integers or fixed-point for positions (cell + subcell 1/256), tick counts, HP, XP×1000. Decide NOW that positions and timers are integers; it's cheap now and a rewrite later.
- **Iteration order**: use arrays ordered by id, never object-key iteration over hash maps in rule logic; no `Date`, no `performance.now`, no unseeded Math.random in sim (slime-village: 0 `Math.random` — a good habit to keep).
- **Save versioning**: `SAVE_VERSION` + migration chain (slime-village refuses incompatible saves: "never half-loads"). For a long-lived persistent world with generations of inhabitants, refusing old saves is hostile to the player; budget for migrations or a "chronicle export" at breaks.
- **Autosave on fixed cadence** + atomic write; with a command log, saves = periodic snapshots + log tail → crash recovery and replay for free.

### 2.11 Event stream and sim/render separation

- Sim emits typed events into a ring buffer (`CellChanged`, `EntityMoved`, `ItemMoved`, `Died`, `SkillUp`, `RoomChanged`, `JobAssigned`...). Renderer, audio, UI, chronicle log, achievements, and analytics all subscribe. The chronicle (CANDIDATE) becomes a consumer, not a core system.
- Anything the renderer needs but the sim doesn't (animation frame, particle) is derived render-side from events. Prevents "render-only state creeping into saves".
- Cost: events are cheap (typed arrays or small objects). Watch GC in JS: pool event objects (ASSUMPTION: matters at 200 agents x 20 events/s = 4k/s, which is fine without pooling).

### 2.12 Performance and populations

ASSUMED targets (all to be validated by prototypes; I picked them to be demanding but reasonable):
- World 256x256x48 (3.1M cells), but ~85% of cells are "buried solid" or sky air; active nav cells maybe 200-400k.
- 200 villagers + 400 animals + ~5000 plant entities in the active settlement area; 500 construction sites worth of cells; 3000 items.
- Tick rate 20 Hz game-time ("fast" = 5x → 100 ticks/s), must keep ≥ 60 FPS render at 1x on a mid-2020 laptop. Sim budget: ≤ 6 ms per tick at 1x on one core, so 5x speed = 30 ms of sim per frame — that's the limit of what is acceptable. Slime-village measured ~161x real time at ~? slimes (headless) for a ~100-slime colony (VERIFIED run per audit) — encouraging but its world is 2D, with prefab buildings, and slime counts were not recorded in the audit.
- Per-tick breakdown targets (ASSUMPTION): agents' Action steps 1.5 ms (200 x ~7 µs), job picks amortized 0.5 ms, pathfinding 2 ms budget (time-sliced), needs/vitals 0.3 ms (throttled to every 10th tick, staggered by id), plants/animals life-cycle 0.5 ms (every 20th tick, staggered), room/nav updates 0.5-1 ms (only on dirty), events/UI 0.5 ms.
- **Staggering**: every subsystem touching all entities runs at a fixed lower rate with `(tick + id) % N == 0`; this is deterministic and flattens spikes. ESTABLISHED (RimWorld's "tick rare" / "tick long" for pawn needs).

Pathfinding stack (recommended, in order of implementation):
1. **Navigation graph = walkability per cell + vertical links** (stairs, ramps, ladders, climbable walls?). 3D neighbours: 8-dir in plane + up/down via stairs/ramps only. Walkable: solid floor below and 2 cells clear above (for size 1 creatures); precomputed bit in `flags`.
2. **Region graph (RimWorld style, ESTABLISHED)**: group nav cells into regions (e.g. ≤ 12x12 blocks inside a chunk, connected components); regions connected through links; reachability query "can A reach B" is O(1) via region component id cache (rebuilt incrementally on dirty chunk). This gives instant `unreachable` answers, the #1 killer of naive A* (searching the whole map for an impossible goal: VERIFIED slime-village caps A* with `maxNodes = 6000` for this reason).
3. **Hierarchical A\* (HPA\*, ESTABLISHED: Botea et al. 2004; also Dwarf Fortress' region-based pathing since v0.40)**: abstract search over region/portal graph, then refine within region only when walking. Cost drops by 1-2 orders of magnitude on large open maps.
4. **Flow fields (Dijkstra maps / "goal maps") for many-to-one goals**: nearest stockpile, nearest bed, flee-from-danger, "where is the nearest unclaimed tree." One BFS from goals fills a field in O(cells in range), then any number of agents read it in O(1). ESTABLISHED (Roguelike "Dijkstra maps"; Supreme Commander 2 flow fields, Elijah Emerson in Game AI Pro). Use sparingly with cached refresh rates.
5. **Path cache + staggered replan + time-sliced search**: queue path requests, budget N node expansions per tick, agents move on stale path until reply, validate each step.
- Slime-village A* (VERIFIED): binary-heap A* with `Map`/`Set` for g/f/closed over a flat grid; a code comment says it was 43% of the whole sim before it moved to a heap and ran per-step cost of 1/7 ms at 10 slimes versus 8 ms at 137 slimes, which is "what took the page down". Lesson: pathing is the first performance cliff. The Map/Set implementation should be replaced by typed-array scratch buffers with a generation counter.
- **Nav updates under building**: when a cell changes, only the owning region and neighbours recompute. A hundred construction cells per second across a settlement = fine; mining a mine tunnel of 1000 cells/day = fine.

LOD for offscreen/away settlements (the brief wants multiple settlements and "village must not be helpless when player is away"):
- Tier 0 **Active** (the one the camera/possession sits in + a halo radius): full tick.
- Tier 1 **Watched** (player has orders there but is not looking): full Actions but throttled, e.g. 1/4 rate for needs and lower for far plants; no rendering. Equivalent to "background settlement".
- Tier 2 **Dormant** (other player settlements, wild areas): statistical aggregate sim at **daily resolution**: pools of food, wood, labor-days; births/deaths by rate; events by table. Convert back to individuals lazily on observation using the same RNG stream and a "snapshot of inhabitants" (individual identity must persist—pillar of the game), so dormant villagers still have names, skills, age; only their moment-by-moment path is abstract.
- Time-skip (player sleeps/fast-forward): run Tier 2 abstraction for all settlements, Tier 0 stays full but at higher speed; same abstraction used for catch-up when a world is loaded after being offline (slime-village's "left running" philosophy VERIFIED). DANGER: the abstract rules and the full rules must agree statistically (e.g. food produced per villager-day) or players will notice "my village does better when I look away". P6 test: run the same save at Tier 0 and Tier 2 for 20 days and compare outputs within ±15%.

Validation plan for numbers: a headless benchmark harness (modeled on slime-village `headless.js` and `sweep.js`, VERIFIED to exist) that spawns N villagers into a canned world and logs ms/tick with percentile breakdown per subsystem, run in CI as a regression gate. Targets are provisional; tune after P1.

### 2.13 Prototype plan (what must be proven before commit)

| ID | Question | Pass condition |
|---|---|---|
| P1 | Chunked 3D grid + region graph + HPA* with 200 agents moving randomly + hauling | ≤ 6 ms/tick p95 on target hardware; no agent stuck > 30 s |
| P2 | Incremental room flood-fill under random wall/door edits | ≤ 1 ms p99 per edit batch; room ids stable across no-op edits |
| P3 | Action runner with AI + possessed toggle; skill XP | Same action takes identical ticks for AI and possessed; replay equal |
| P4 | Determinism: record command log, replay twice, and replay on a second engine/browser/OS | Identical state hash every 100 ticks for 100k ticks; document where it diverges |
| P5 | Two renderers over one sim | Second renderer < 25% of first renderer's code; picking via cells works; frame budget ok |
| P6 | LOD Tier 2 abstraction vs full sim | Output within ±15% over 20 days |
| P7 | Blueprint capture → rotate → place with substitution → build with 10 workers | No self-walled workers; partial cancel recovers materials; < 1 s to generate waves |

---------------------------------------------------------------------------------------------------------------

### 2.14 Multiplayer compatibility: what to do NOW

Goal (CONTEXT): later, "visit other players' worlds", co-op favoured; not invasion. No netcode now.

Do now (all cheap, all also help single-player tooling):
1. **Command log**: every player action is `Command{tick, playerId, type, payload}` validated by the sim. The UI never mutates sim state directly. Gives replays, undo of orders, bug reports ("attach your command log"), automated tests, and later lockstep or server-authoritative.
2. **Deterministic core** (2.10): fixed tick, named RNG streams, integer positions/timers, ordered iteration, no wall-clock.
3. **State hash**: `hash(world, entities)` every N ticks in debug builds; mismatch = failing test. Keeps determinism honest.
4. **Separation of sim and render** (2.9/2.11).
5. **Entity ids are stable and global**: `id = (worldId, counter)`; `worldId` makes later cross-world references (visiting inhabitants, imported blueprints) unambiguous. Slime-village has uid counter + `setUid` (VERIFIED) — extend with a world prefix.
6. **Serialize everything shareable as plain data with version**: blueprints, inhabitant records (name, genes, skills, lineage), chronicle entries. "Visit another world" in the first iteration may only mean: load a *snapshot* of the other world read-only (asynchronous, like Dark Souls-style or Spore-style content sharing, ESTABLISHED). That needs no live sync at all and satisfies "see what other players built".
7. **No privileged local state**: possession, selection, camera, fog-of-war knowledge are per-player objects, not global flags.

Do NOT now: authoritative server, rollback, interest management, anti-cheat, accounts.

Lockstep vs server-authoritative (for the later decision): lockstep (RTS style; AoE, StarCraft, ESTABLISHED) needs bit-exact determinism including across machines — hard in JS, with 200 agents it is bandwidth-cheap but desync-brittle. Server-authoritative with snapshot+delta is more tolerant of float differences but costs bandwidth with 200 villagers; and for *visiting* (not co-simulating) async snapshots may be enough. Recommend deferring; keep both options alive with the 7 items above.

### 2.15 Reuse assessment of slime-village (read-only; VERIFIED unless noted)

Facts: vanilla JS ES modules, ~28k LOC sim, zero DOM in sim, single global mulberry32 RNG with `reseed`/`rngState`, fixed tile grid (`world.js`: typed arrays `Uint8Array/Float32Array` per attribute, `MAP_MAX_TILES: 480000`), A* with binary heap on grid (`findPath` capped `maxNodes=6000`), demand-vector job scoring (`jobs.js: computeDemand`, `findJob`), `claimedBy` claims, genetics (`slime.js`: `breed`, `TRAIT_INFO`), `settle` soft-cap, colour genetics, save via seed+delta (`save.js` 990 lines, `SAVE_VERSION=1`), tests (`headless.js`, `save_roundtrip.js`, `sweep.js`, `fixture.js`).

| Module/pattern | Port? | Notes |
|---|---|---|
| `util.js` `settle`, `makeRNG` (mulberry32), `pickWeighted` | YES, with changes | `settle` ports as-is (pure math). RNG needs to become named/counter-based; keep mulberry32 as the stream primitive. |
| `slime.js` genetics: `breed`, `TRAIT_INFO`, `traitStanding` | YES (rules/data) | The mixture inheritance and consequence-worded trait descriptions are exactly on-brief. Add aptitude and skills; drop random profession. Colour genetics: carry over only if slime identity relies on it. |
| Demand vector (`computeDemand`) | PARTIAL | Reuse as the "demand feeder" to the job board (section 2.5). Its once-per-second cadence and `demandWhy` explanation port. Its 700-line formula tied to prefab buildings and slime-village stock model does not port; rewrite per game's resources. |
| `findJob` scoring (jobs.js 1794-2663) | NO as code, YES as pattern | Pattern: score = demand × affinity × proximity × temper; claims; explainability. Code is monolithic and tied to the prefab world. |
| `temper(slime, jobType)` per-slime hashed multiplier | YES | Cheap deterministic personality, keep. |
| Leisure/strain/hardship needs | YES (design + math) | Maps to leisure activities and off-time skill gain. |
| `ai.js` (4,543 lines) vitals/harm | PARTIAL | Vitals math ports; the state machine is entangled with job logic; will be replaced by Action/Controller. |
| `world.js` generator + 2D tile arrays | NO for 3D; pattern YES | Pure-function-of-seed generation and typed arrays per attribute port; the noise/biome code could be adapted. Walkability and `plotMask`/`obsMask` pattern (flat masks stamped by systems) is a good idea to keep. |
| `findPath` A* | NO | Replace with region graph + HPA*; keep the lesson (heap, maxNodes). |
| `save.js` | PATTERN YES, code partial | Keep: seed+delta, ids+relink, generic copy with denylist, roundtrip test. Rewrite: chunk delta, terrain COW, versioning. |
| `game.js` update loop | PARTIAL | `step` + accumulator concept ports; step size varies with speed (breaks determinism) — fix. |
| Quest log / goals / lore / chronicle | MAYBE (design) | Chronicle & village memory ideas are CANDIDATE features. `lore.js` (928 lines, gossip/belief) interesting for knowledge transmission; UNVERIFIED in depth; read before deciding. |
| `render/*`, `ui/*`, `tools/build.js` | NO | Canvas2D top-down specific. Single-file builder may be nice for a web version. |
| Tests/harness | YES | `headless.js`, `sweep.js`, `fixture.js`, `save_roundtrip.js` are the most reusable assets: headless run, multi-seed sweep, frozen fixtures, save/restore equality. |
| Language | DECISION | JS port is cheapest if engine = web; if Godot/Unity/Rust, treat slime-village as a *spec*, not a codebase (rules & numbers are the asset). |

Direct warnings from the code: (1) working tree is dirty at the time of the audit (33 modified files), so HEAD != behaviour; snapshot a commit before porting; (2) its README tables and tests disagree on ambition model; (3) `findJob` is the worst coupling point; (4) it doesn't have per-slime skills, orders or possession, so these three features are the new-risk core of this project and where prototype time should go (P3).

---------------------------------------------------------------------------------------------------------------

## 3. Alternatives considered (and why rejected)

1. **Pure 2D top-down, single level, RimWorld-style with mountain thickness.** Cheapest. Rejected as default because the brief wants digging down and multi-storey, and "mountain interior" in RimWorld is just a roofed tile with no vertical axis; mining depth and caves become shallow. Viable fallback if P1 fails.
2. **Side-view Terraria grid.** Rejected: bad for sprawl, platformer pathing, no top-down view (2.1 B).
3. **Full 3D voxel with continuous physics.** Rejected: highest cost for the least commander-game benefit; determinism hostile.
4. **Free-form building meshes (e.g. snapping parts like Valheim).** Rejected: blueprints, room detection and substitution all get harder; structural integrity solver needed.
5. **Per-villager fixed job assignment (Timberborn workplace slots) as the main system.** Rejected: conflicts with "you 5, go harvest lumber" free-roaming individuals and open-ended freeform buildings; but "workplace" concept is reused for crafting stations as a job source.
6. **RimWorld-style 4-level priority matrix per colonist.** Rejected as the *primary* interface: matrix micromanagement at 200 pop. Keep as an optional "advanced" panel on top of the same board.
7. **Pure demand-vector autonomy (slime-village as-is).** Rejected: no orders possible; but retained as the fallback layer.
8. **Pure GOAP/behaviour-tree per villager with no job board.** Rejected: hard to explain, hard to do group orders and standing orders, reservation conflicts.
9. **Flowing fluid cellular automata.** Rejected for MVP (DF performance and determinism cost).
10. **Free structural physics / collapse simulation.** Rejected for MVP; use rule-based support checks only for roofs.
11. **Region-free plain A\* with caching.** Rejected: slime-village's own measurement (A* 43% of sim at 137 slimes) already shows the cliff; 3D multiplies the node count.
12. **Rollback netcode / authoritative server now.** Rejected: unnecessary before the single-player game exists.
13. **Explicit-zone-only rooms.** Rejected: friction; players must tag every room (but zones kept as override).
14. **Fully automatic flood-fill only.** Rejected: surprising; players want to say "this is the library."

---------------------------------------------------------------------------------------------------------------

## 4. Risks and tradeoffs

1. **3D grid scope creep (HIGH).** Once the world is 3D, every system (light, temperature, plant growth, roofs, sight, sound) wants 3D versions. Mitigation: define which systems are surface-only (plants, weather, farming), which are per-room (temperature, beauty), which are 3D (nav, mining). Write this table before building.
2. **Pathfinding cliff (HIGH).** Evidence from slime-village (VERIFIED comment). Mitigation: region graph first, benchmark P1, time-slicing.
3. **Autonomy + explicit orders + standing orders interaction bugs (HIGH).** Reservations leaking, villagers idling while work exists, orders that never complete. Mitigation: universal "why is this idle" debug panel, invariants tests ("no job reserved by dead/unreachable actor", "no reservation older than N ticks"), fuzz test with random orders.
4. **Possession fairness (MED).** Same Actions means equal rates, but the player has superior planning/dodging and no latency; the "divine inspiration" buff plus manual control might be overwhelmingly optimal for mining/combat, violating the brief. Tuning issue, but the sim must expose measurable per-controller output to test: add a headless bot controller that plays "possessed-like" optimal behaviour and measure advantage (target: < 1.3x output of AI-controlled).
5. **Determinism erosion (MED-HIGH).** Easy to lose via one `Math.random`, one Map iteration order, one `Date.now()`. Mitigation: lint rules, CI replay test (P4), banned API list.
6. **Float determinism across machines (MED).** Only matters for lockstep; default plan is same-engine replays + snapshot visiting. Position as integers now.
7. **Dual-view art cost (MED-HIGH).** Billboards need ≥ 2 sprite views; second renderer is ~0.6-1.0x of first, not "free". Mitigation: P5 gate; fix camera pitch; first-person only for possession.
8. **LOD abstraction mismatch (MED).** "Village is better when unobserved" exploits. Mitigation: same rules at lower resolution; calibration test P6.
9. **Save compatibility for long-lived worlds (MED).** Terrain regrow breaks when generator changes; use copy-on-write chunks.
10. **Memory/GC in JS (LOW-MED).** Typed arrays and object pools; not an issue at this scale unless many short-lived allocations in pathfinding.
11. **Blueprint exploits (LOW-MED).** Blueprint that places structures that are impossible to supply, self-enclosure; deterministic validator; refuse malformed (future shared) blueprints.
12. **Over-promising "same individuals through the space age"** at the sim level: the entity model must support species/tech growth without schema break. Use versioned component-style data (id → components) so new capabilities add components, not subclass hierarchies.
13. **Reuse trap (MED):** porting 28k LOC of slime-village JS may carry its coupling; treat as spec first.
14. **My own estimate uncertainty:** all numbers in 2.12 are untested assumptions.

---------------------------------------------------------------------------------------------------------------

## 5. Unresolved decisions (with recommended defaults)

| Decision | Options | Recommended default |
|---|---|---|
| World shape | 2D+z grid / 2D only / full voxel | 3D integer grid, 2D top-down z-slice renderer first |
| World size | 128^2, 256^2, 512^2; depth 32/48/64 | 256x256x48, regions streamed later |
| Cell size / unit scale | 1 cell = 1 body | 1 cell = 1 villager footprint; creature size classes later |
| Tick rate | 10/20/30 Hz | 20 Hz fixed, speed = ticks/frame |
| Integer vs float positions | float / fixed point / integer cells+subcell | integer cell + 1/256 subcell |
| RNG | single / named streams / counter-based | counter-based per-stream |
| Engine/language | web JS/TS, Godot, Unity, custom | decide after P1/P5; sim headless-capable language |
| Rooms | flood / zone / hybrid | hybrid (zone overrides) |
| Door semantics | doors separate rooms or not | doors separate rooms; open/close doesn't recompute rooms |
| Structural support | none / roofs only / full | roof-span rule only; shoring in mines as item/risk |
| Fluids | none / static / CA | static water + rain tags |
| Work UI | priority matrix / orders only / hybrid | board + orders + standing; advanced priority panel optional |
| Skill curve | linear / log XP / levels | log-XP with `settle()` softcap; publish curve in-game |
| Skill inheritance | none / aptitude / levels | aptitude genetic; levels not inherited; teach actions transfer |
| Second view | none / billboard 2.5D | none in MVP; billboard behind P5 gate; possession first-person maybe |
| LOD tiers | none / 2 / 3 | 3 tiers (Active / Watched / Dormant aggregate) |
| Multiplayer first form | live / async snapshot | async snapshot visiting; live later |
| Determinism level | same-engine / cross-machine | same-engine now, integer-friendly rules for later |
| Save size policy | refuse old / migrate | migration chain; chronicle export fallback |
| Reuse of slime-village | port JS / spec only | spec + selective ports (`settle`, genetics math, tests), not whole sim |
| Population cap | soft / hard | soft via needs/housing; 200 is performance design target not cap |

---------------------------------------------------------------------------------------------------------------

## 6. Dependencies on other systems

- **Game design (Investigators A/B/D, not read by me)**: tech/knowledge model (collective belief?) determines whether `knowledge` lives per-inhabitant or per-village; this report assumes per-inhabitant Set plus village aggregation. Needs their decision.
- **Economy/logistics design**: transport ladder values (backpack capacity, wagon speed) feed `carryCapacity`; recipe/bill system feeds standing orders; no belts.
- **Combat/danger design**: Attack actions, injuries, monsters; death handling; the "possessed explorer might die" loop. Sim needs injury model decisions (hit points vs body parts).
- **World/biome/ecology design**: plants/animals life cycles (AGREED) require per-species growth tables and a rate that LOD Tier 2 can abstract.
- **UI/UX design**: orders UI, blueprint tool, explain-why panels; order scales (single, group, region); z-slice readability.
- **Art/Audio**: sprite sets per view; this determines whether a second renderer is feasible.
- **Monetisation/online design**: visiting policy (consent) affects whether snapshots are enough.
- **Content pipeline**: data-driven materials/buildings/recipes/skills as external tables, validated at load.

---------------------------------------------------------------------------------------------------------------

## 7. MVP vs later

### Essential for a first-planet MVP / vertical slice
- Headless sim core: fixed tick, named RNG, command log, event stream, state hash, seed + chunk-delta save with round-trip test.
- 3D cell grid at 256x256x48 (or smaller for the slice: 128x128x32), chunks, ~12 materials, mine/chop/build of walls/floors/roofs/doors/stairs, static water.
- Top-down renderer with z-slice cutaway; single camera; no second view.
- Inhabitants: genome (reuse `breed` + `settle`), skills with aptitude and XP, needs (hunger/sleep/leisure), permadeath, aging.
- Action/Controller abstraction, AI controller, possession controller (movement + mine/chop/build + inspiration modifier).
- Job board with reservations; explicit orders (group + area); demand-driven fallback; one standing order type ("maintain N of item"); hauling by hand/backpack.
- Region-graph pathfinding with cached reachability.
- Hybrid room detection (flood fill + furniture roles) with 3-4 qualifying room types.
- Blueprint capture, rotation (4), class-level material substitution, supports-first ordering, partial completion, "build N more".
- Explanation UI for any villager's action; benchmark harness and determinism CI test.
- LOD Tier 0 only (single settlement); simple offline catch-up by aggregate (can be crude).

### Later (post-MVP)
- Billboard 2.5D renderer and first-person possession (gated by P5).
- LOD Tiers 1-2 with multiple simultaneous settlements and calibrated abstraction.
- Wagons/carriages/trains and the transport ladder beyond backpack/box.
- Fluids, structural collapse, temperature simulation beyond room-level.
- Cross-machine determinism (fixed-point math, custom transcendental functions), lockstep or authoritative multiplayer, live visiting.
- Blueprint sharing between worlds and validation of foreign blueprints.
- Space-age planets (separate worlds sharing the inhabitant schema).
- Apprenticeship/documents/knowledge transmission beyond simple `Teach`.
- Save migrations for long-running worlds and chronicle export.
- Advanced work-priority panel, multi-species progressions.

### Cuts I'd propose (skeptic)
- Flowing fluids, structural collapse physics, free-form meshes, drones/belts (already AGREED out), dual-view with separate asset sets, live multiplayer netcode, and ANY per-villager hand-authored scripting. If the vertical slice has these, it is the wrong slice.
