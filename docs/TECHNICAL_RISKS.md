# Technical Risks, World Representation, and slime-village Reuse

Slime / Dorf Village (working title). Companion to docs/GAME_DESIGN.md §23 and §27 (status DRAFT v0.3, final critique applied), docs/PROTOTYPE_PLAN.md, docs/OPEN_DECISIONS.md, docs/MVP_SCOPE.md.
Canon: notes/phase2/RESOLUTION.md and notes/phase6/RULINGS.md (K1-K11; GDD Appendix A explains each reference). Time constants follow the GDD §23 Units & clock box (20 ticks/s; 1 game day = 1800 ticks = 90 s). Sources: notes/phase1/C_simulation_tech.md, D_balance_feasibility.md, notes/phase2/*.md, notes/existing_material.md.
Labels: VERIFIED (read in code or run by an auditor, cited), ESTABLISHED (documented technique or known game), ASSUMPTION, SPECULATION. L = likelihood, I = impact (L/M/H).

---

## 1. Risk register

IDs are stable; PROTOTYPE_PLAN.md references them. "Proto" is the **smallest prototype that validates or retires** the risk. A risk with no prototype is managed by process.

| ID | Risk | L | I | Early signal | Mitigation | Proto |
|---|---|---|---|---|---|---|
| **TR-01** | **3D-grid scope creep.** Once the world is a z-level grid every system (light, temperature, plants, roofs, sight, sound) wants a 3D version | H | H | Design docs list a 3D variant of a system not on the slice; implementation LOC for the world exceeds 2× the layered estimate | Write the per-system table (surface-only: plants, weather, farming; per-room: temperature, beauty; 3D: nav, mining) before building; P5 is a <=1-week desk spike plus a throwaway test in the default grid; layered 2D is built only if it fails (K1) | P5 |
| **TR-02** | **Possession is the hook and the weakest-bounded balance risk.** Real floor 3.5-6.5 FTE-months (control+camera 1-2, minimal combat+2 hostiles 1.5-3, light 0.5, hazards 0.5-1), spread over C2 (minimal), C3 (thornback) and the MVP tier. Either nobody possesses (the buff is below perception) or it is the optimal way to work | M | H | Testers decline to possess; or possessed output >1.25× delegated; or delegated expedition success <40% | R9, K7: a structural niche (Steadfast against the thornback, access to cells the AI refuses) not a number; no timer; needs run; bot band; minimal possession in C2; single decisive test is a second voluntary possession | P8 (deferred), P3 as a CI test |
| **TR-03** | **AI and possessed Actions drift apart** (a special-cased path for the player creeps in) | M | H | Same Action takes different ticks; a branch on controller type | One ActionRunner; the inspiration Modifier is data; code-review rule; tick-equality test in CI | P3 |
| **TR-04** | **Pathfinding / performance cliff.** slime-village's own code records A* at 43% of the sim at ~137 slimes and `maxNodes = 6000` as a guard (VERIFIED, C 2.12); a 3D grid multiplies nodes | M | H | p95 tick >6 ms at 100 agents; agents idle on "no path" | Region graph (O(1) reachability) + HPA* + flow fields for many-to-one + time-slicing + staggering; design range 6-60 (R4) so 200 is headroom only | P1 |
| **TR-05** | **Freeform room recognition ambiguity.** Concave rooms, diagonal leaks, windows, giant rooms, door semantics; players cannot predict the result | H | M-H | Testers cannot say why a room does not qualify; "ghost" rooms flicker | Hybrid (R18): flood-fill + Purpose + visible checklist; 6-connectivity; doors separate rooms, open/close does not recompute; oversize lowers quality, never fails; room cap tested against real builds | P2 |
| **TR-06** | **Determinism erosion.** One `Math.random`, one Map iteration order, one `Date.now()`, one render-side read of sim RNG | M-H | M | CI state-hash mismatch; save round-trip diverges | Lint bans; named counter-based RNG streams; command log; hash every 100 ticks in debug; ordered iteration | P4 |
| **TR-07** | **Save correctness and compatibility for a mutable, long-lived world.** Generator change breaks the delta; quantisation drift (slime-village had a 5-plant drift per day from byte-quantisation, VERIFIED in existing_material.md B13); refusing old saves is hostile | M | H | Round-trip test fails; restored colony differs after a day | Copy-on-write chunks stored on first modification; exact deltas (never quantised); `worldgenVersion`; migration chain or chronicle-export fallback; round-trip gate on every feature | P4 |
| **TR-08** | **Slice readability.** In a fixed-pitch 3/4 z-slice the roof/floor/level confusion (DF's known problem) breaks the freeform-building pillar | M | H | Testers cannot find stairs or tell what is above them | Dimmed level below, roof/wall cutaway, ghost of level above; test before art; fall back to top-down | P6 |
| **TR-09** | **Second-renderer / dual-view cost underestimated.** C estimated 0.6-1.0× of the first renderer, mostly art (SPECULATION); billboards drawn side-on look wrong top-down | M | M-H | Stub exceeds 25% of first renderer; sprites need two sets | One camera pitch; all sprites 3/4 (R2); second renderer only post-MVP and only if P6 stub is cheap | P6 |
| **TR-10** | **Order/need/standing-order interaction bugs and an opaque Why panel.** Leaked reservations, idle villagers with work available, orders that never complete, panel text not derived from the scoring result | H | H | Job switches ≥4 per villager-day; a stall with no blocker; panel contradicts state | One board, one score; blocker enums; invariants (no reservation held by dead/unreachable actor; none older than N ticks); fuzz with random orders; "why is this idle" debug panel first | P9, P10 |
| **TR-11** | **Autonomy band wrong:** village is helpless (<90% unattended survival) or runs itself (>20% start new kinds) | M | H | Idle-bot sweep outside the band; testers fast-forward because nothing is queued | R8 band; tune demand vector with the sweep; fast-forward signal means bigger queues, never waiting as a mechanic | P9 |
| **TR-12** | **Sight and tinker consumers blow the tick budget** (fog, lore, witness, observation-learning all read `sightOf`; tinker candidate generation at 100 idle) | M | M | Combined sight >1 ms/tick p95; tinker >0.5 ms | Shared sight cache; coarse cells at distance; stagger; cap candidate pool | P1 |
| **TR-13** | **Blueprint and construction exploits and UX.** Self-walled workers, flood of ghost sites with no materials, unsupplyable blueprints, silent material downgrade | H | M | Worker enclosed in test; board flooded by "build 10" | Supports-first DAG; exit reserved until last cell; job waves (≤30 open jobs per site); cap queued sites per crew; explicit "needs: 40 stone-class" | P7 |
| **TR-14** | **Heat/enclosure context is the third coupled substrate** (rooms, fuel, draft, level) and can be cheated with a 1-tile closet or vary with build order | M | M-H | Context ≠ hand-computed in >2/30 builds | Small rule set (`P = H x E x D`, faces and draft only, GAME_DESIGN §11.9; no room-size cap); tested against 30 hand builds; zone flags not per-cell temperature (R20: no fluid/temperature sim) | P2 |
| **TR-15** | **Emergent discovery is silent, hard to debug and design-heavy.** Three coupled parts (context, knowledge, capability) whose failure modes are all silent; the one thing no comparable game has shipped well; soft-lock possible (circular precondition) | M-H | H | Stuck rate ≥2%; a stuck run with no trace; testers cannot say why a craft is unavailable | R10 single layer; R12 solvability validator at worldgen, systemic world events that create preconditions, ≥2 routes per capability; Almanac + discovery trace log; ONE chain in the slice | P11, P15 |
| **TR-16** | **Float / transcendental determinism across machines** (92 sin/cos/exp/pow/log uses in slime-village sim, VERIFIED by grep in C 2.10; JS engines may differ in last bits) | M | M | Cross-OS replay hash differs | Same-build commitment (R23); transcendentals lint-restricted in sim, not rewritten; integer positions/timers; revisit only if lockstep is chosen (OD-07) | P4 |
| **TR-17** | **Pacing/lifespan anchor wrong.** R1's ~10-hour life drives skill K, genetic generations, knowledge-loss severity, unattended window; four phase-1 reports disagreed by 2× or more | M | H | Craft dies in >3 of 10 generations; skills too slow/fast to feel; permadeath too frequent/rare | Derive all rates from the anchor, not independently; K as a fraction of adult lifespan; tune on P12 | P12 |
| **TR-18** | **Genetics exploitable or arbitrary.** Toy Monte Carlo: a deliberate breeder reaches ~1.7× on a trait in 10-15 generations; invisible tuning; convex costs may feel arbitrary | M | M | Breed-best bot >1.15× output/food; testers cannot tell individuals apart | Convex upkeep; clone limit; env-dependent value; noisy phenotype; genes ±25%; stories, not optimisation | P13 |
| **TR-19** | **Skills: grind exploits and cognitive load** (traits 9 + skills ~8 + needs 5+ + personality) | M | M | Grind bot ≥5% XP; testers overwhelmed | Challenge-matched XP; virgin bit; `rested`; show ≤3 notable facts per villager by default | P13 |
| **TR-20** | **LOD aggregate mismatch** ("my village does better when I look away") | M | M | Tier 2 vs Tier 0 differ >±15% or one-sidedly | Same rules at lower resolution; one-sided calibration; not in MVP (R22) | P14 |
| **TR-21** | **Map size / exploration pacing.** 128×128×24 is chosen for memory and scope, not player feel | M | M | Time-to-first-landmark too long/short | Test 96/128/160 | P16 |
| **TR-22** | **Overall scope and schedule (re-baselined, K1).** The design's line items sum to 25-54 FTE-months. The slice (C3) is 7-11 (C1 2-3, C2 +2-3, C3 +3-5); the MVP (slice + Essential tier) about 21-40, computed in MVP_SCOPE §3; the full first planet 30-60 ≈ 5-10 years at hobby pace (ASSUMPTION). Kenshi / Songs of Syx scale | H | H | A checkpoint exceeds 1.5x the top of its range; content added before the harness | Hold RESOLUTION cuts; C1 harness first; three playable checkpoints with a fun check each; slice cut list (MVP_SCOPE §1.6); fewer eras rather than a longer schedule; no pre-announced space/multiplayer | all |
| **TR-23** | **Content authoring volume (D14, reconciled).** The discovery system is 1-1.5 FTE-months; content for the 12 linked discoveries 10-15 FTE-weeks (the C3 chain is about 4-6 of those weeks); the full first planet's ~110-130 phenomena 4-8 FTE-months. The data is an authored graph, so cost scales with row count and interlinking | M | M-H | Phenomena table grows faster than the validator and bots can cover | MVP set of ~12 interlinked discoveries, the slice implementing one chain (GAME_DESIGN §15.7); data tables not code; validator on load | P11 |
| **TR-24** | **Reuse trap.** Porting slime-village's 28k LOC carries coupling (`findJob` monolith, `ai.js` state machine); its working tree is dirty and README and code drift | M | M | Ported module needs >30% rewrite; tests disagree with README | Treat as a spec first; port `settle`, `breed`, mulberry32, harnesses; snapshot a commit before porting (§3 below) | — |
| **TR-25** | **UI weight.** Panels, selection, orders, tooltips, Why, Almanac, blueprint tool: 3-6 FTE-months and consistently underestimated | H | M | UI tasks >2× estimate; testers cannot find verbs | Select-then-verb; every verb by click, hotkey and list; UI spike before engine decision | UI spike |
| **TR-26** | **Economy runaway.** Blueprint × builders × standing orders compounds without belts | M | M | Max-expansion bot's growth ≥5%/year at 5 years | Labour-bound staffing, decay as the master sink, spoilage, depletion, cap on queued sites | P13 |
| **TR-27** | **Combat and hazard scope creep via possession.** A's auto-combat "competent enough to delegate" is a second product | M | H | More than 2 hostile types in the slice; combat tuning absorbs M6 | Simple and lethal combat; recall rule not micro; positional risk not skill; same melee Action for AI and possessed (R20) | P8 |
| **TR-28** | **History/Chronicle size.** ~10 events/day × 100 years × ~100 B ≈ 10 MB in JSON | L | M | Save >few MB from history | Keep firsts + top-K per year, counts for old years, 30-entry ring per villager, full records only for notable dead; budget ≤1 MB | P4 |
| **TR-29** | **Engine-choice regret.** Choosing on preference rather than criteria | M | H | Decision taken before P1/P4/P6 or the UI spike | Criteria E1-E12 (GAME_DESIGN §23.10); decision due before C2 art, after the C1 microbench, P4, P5 and P6; the provisional TypeScript stack (K9, OD-41) is explicitly throwaway-acceptable; sim kept headless-capable so the renderer is replaceable | microbench, P4, P6 |
| **TR-30** | **Accessibility: genetic colour as information.** Hue is inherited (HSV hue-space) so hue-only cues exclude colour-blind players | M | M | CVD-filter sort test <11/12 | Lineage mark + words + optional lineage palette; hue never the only carrier (GAME_DESIGN §19) | CVD test in M7 |
| **TR-31** | **Float determinism of the *fixed tick*:** slime-village steps at 1/30, 1/15, 1/10 s depending on speed (VERIFIED game.js:498) so porting rules unchanged breaks determinism across speeds | H (if ported naively) | M | Same save at 1× and 5× diverges | One fixed 20 Hz tick; speed = ticks per frame | P4 |
| **TR-32** | **Perception: buffs and gene differences not noticeable** (three reports gave three buff values; +10/+15/+25% may be indistinguishable) | M | M | Testers cannot tell the buff, or never possess twice | Single data row; the buff is a felt bonus, the niche is Steadfast and restricted cells (K7); visual halo (flavour only) | P8 (deferred) |
| **TR-33** | **Validation apparatus exceeds the game.** 16 prototypes, ~100 numeric criteria, five tester panels and nine bots are more work than the slice for a hobbyist | H | M-H | Prototype work outpaces checkpoint work; a prototype gates nothing | Process diet (K1): at most six gating prototypes before C3 (P4, P9, P5, P6, P2, P11), the rest deferred with triggers; slice bots absent-player, over-ordering, grind; informal 3-5 tester checks | all |

### Top five (for the final critique)
1. TR-22 scope and schedule (with TR-33 process weight), which TR-15/TR-23 (discovery) and TR-02/TR-27 (possession) feed most.
2. TR-15 emergent discovery.
3. TR-02 possession as hook and balance risk.
4. TR-10/TR-11 autonomy, orders and Why panel.
5. TR-01/TR-08 world representation and slice readability.

---

## 2. World representation evaluation

**Decision status: R3 sets the 3D integer z-level grid as the DEFAULT. It is not finalised.** The engine and rendering architecture are not chosen on preference (initial_prompt.txt, Phase 5). The P5 desk spike (plus one throwaway mining+room test in the default grid) can reopen R3; the alternative is built only if the spike fails (K1).

### 2.1 Candidates

| Id | Candidate | Data model | Render | Example games (ESTABLISHED) |
|---|---|---|---|---|
| **A** | **Layered 2D** (stack of independent 2D layers: surface + 1-4 underground layers; stairs/shafts as portals; roof as per-cell flag) | Few 2D grids (e.g. 128×128 × 3-5) with portal links | Top-down/3/4 one layer at a time | RimWorld (surface plus roofed mountain, no real z axis) |
| **B** | **3D z-level grid** (R3 default) | 3D integer cells, chunked 16³, ~2 B/cell, destructible; floors/walls/roofs are cells | Slice renderer: current level + dimmed below + cutaway + ghost above; 3/4 oblique | Dwarf Fortress |
| **C** | **Side-view 2D** | One 2D grid (x, vertical z) | Side view | Terraria |
| **D** | **Billboard 2.5D** over the 3D grid | Same data as B | 3D engine; chunk meshes + camera-facing sprites; free camera incl. first-person | Delver; Octopath-style HD-2D |
| **E** | **Full voxel 3D** | Arbitrary shapes, smooth lighting, fluids, falling blocks, continuous physics | 3D engine; continuous entities | Minecraft |

### 2.2 Comparison table

Ratings: ++ strong, + good, 0 neutral, − weak, −− unsuitable. Cost is relative to B = 1.0 (ASSUMPTION).

| Axis | A layered 2D | B 3D z-grid | C side-view | D billboard 2.5D | E full voxel |
|---|---|---|---|---|---|
| Sim implementation cost (relative) | 0.5-0.7 | 1.0 | 0.4 | 1.0 (same sim as B) | 2-3 |
| Render implementation cost | + low | + low-med (slice) | ++ lowest | − med-high (meshing, depth sort, lighting) | −− high |
| Underground / mines / caves | + (a few layers; shallow depth) | ++ (native z; arbitrary depth) | ++ (core fantasy) | ++ | ++ |
| Multi-storey buildings and roofs | 0/− (layer-per-storey works; overhangs and shared voids awkward) | ++ | − awkward | ++ | ++ |
| Settlement sprawl, 6-60 villagers, "build 10 more" | ++ | ++ | −− (corridor; linear queue) | ++ | ++ |
| Pathfinding | + plain 2D + portals | + region graph over 3D | −− platformer pathing (gravity, jumps; Terraria AI is known to struggle) | + (grid, same as B) | − navmesh/voxel nav |
| Blueprints | + 2D arrays per layer | ++ small 3D arrays (~300 B for a house, RLE) | + 2D | ++ | − complex |
| Room detection | + simple flood-fill | + 3D flood-fill, 6-connectivity, capped | − | + | − |
| Determinism | ++ | ++ (integer grid) | ++ | + (render floats are render-only) | −− (physics floats) |
| Readability of the building pillar | + clear | 0 (z-slice problem is the risk; P6) | + | 0 (billboards read poorly top-down) | 0 |
| Second view / first-person later | − (needs a different model) | 0 (with a second renderer) | −− | ++ | ++ |
| Fits "ONE camera" (author) | ++ | ++ | ++ | − (invites two) | − |
| Art cost (sprites) | + one 3/4 set | + one 3/4 set | + side set only | − ≥2 sets unless 3/4 | −− |
| Scope-creep exposure | low | **high** (TR-01) | low | high | very high |
| Save/delta size at MVP | small | small (0.8 MB raw at 128×128×24) | small | same as B | large |
| Reuses slime-village world code | partial (2D arrays, masks) | pattern only | no | pattern only | no |

### 2.3 Layered-2D vs 3D z-grid, head-to-head (the two plausible defaults)

| Question | Layered 2D | 3D z-grid |
|---|---|---|
| What is a "level"? | An independent 2D layer; transitions only at portals | A z-slice of one continuous grid; any cell can have air above |
| Cave under a house with a shared vertical shaft | Possible via portals; shaft cells duplicated per layer | Native |
| Overhang, bridge, cliff face, balcony | Needs special-case flags | Native |
| Roof over a big hall | Per-cell roof flag | A real cell above the interior |
| Depth for mining ("dig to depth N") | Few layers (design cap) | 24-48 levels, no cap |
| Map memory (MVP) | ~128×128×4 layers ≈ 130 KB ×2 B | 128×128×24 ≈ 0.8 MB |
| Implementation size | Smaller (world 2-4 FTE-months in D, ASSUMPTION) | Larger (+30-60% ASSUMPTION; rewrite of every world assumption either way) |
| Walkable/Reachable | 2D region graph + portals | 3D region graph + vertical links |
| Risk | Slice scenarios hit its limits (overhangs, shared voids) | Scope creep (TR-01), z-slice readability (TR-08) |
| What the design asks (R2, R18, R20) | Marginal for multi-storey rooms and cave-ins under buildings | Natural |

### 2.4 Why B is the default and what would change it
- The brief wants mines, caves, multi-storey buildings with roofs, and "dig deeper". B delivers these at 2D-sim cost while keeping renderers replaceable (the same data serves a billboard renderer later).
- A is the cheapest viable alternative and the stated **fallback if P1 or P5 fails** (C 3.1).
- C, D, E are not defaults: C fails sprawl and pathing; D is B with a costlier renderer, which R2 defers (one camera); E is the scope-killer first on D's list.

**Evidence that would change R3 to layered 2D:** the P5 desk spike shows layered 2D covers the three slice scenarios (mine, a roofed house of at most two levels, kiln room) with **<50% of the 3D implementation's estimated cost and zero scripted design compromises**, *and* testers do not ask for overhangs/shared voids; only then is it built and compared. **Evidence that confirms B:** any slice scenario needs free overhangs or multi-storey rooms the layered model cannot express.
**Evidence that would favour D (a second renderer):** deferred P8 reports possession as flat on the 3/4 camera and a costed plan for a second renderer exists. There is no billboard stub.

---

## 3. slime-village reuse table

Verification column states how each claim was checked. "Audit" = notes/existing_material.md (auditor read README in full, read the cited code, ran `headless.js 20` and `save_roundtrip.js 15`). "C" / "D" = the phase-1 reports, which also read the cited code.

### 3.1 What is reusable

| Item | Reuse as | Verified how | Condition / change needed |
|---|---|---|---|
| `settle()` soft cap (util.js:59) | Code (if JS) or spec | Read by C and D; D ran a toy Monte Carlo of `breed` + `settle` | Keep, but add convex upkeep etc. (R16); `settle` alone plateaus ~1.7× per trait (D 2.1, TOY) |
| `Slime.breed()` mixture inheritance (22% A / 22% B / 28% midpoint / 28% lerp, ±5% noise) and `TRAIT_INFO` consequence-wording | Code/spec | Read by D and C; Audit B1 | Add aptitude per skill, clone limit, ancestry ids |
| Colour genetics (HSV hue-space, `COLOUR_SPORT`, diet pull, kinship, `belonging`) | Spec / visual identity | Audit B1 (README + code mentions) | Display must not rely on hue alone (GAME_DESIGN §19) |
| mulberry32 RNG primitive (util.js:4) | Code (stream primitive) | Audit B14 (read); run round-trip test | Convert to named counter-based streams |
| `temper()` hashed per-villager job lean | Code/spec | Audit C table; C 2.15 | Keep; orders bypass temper (R5) |
| Demand vector (`computeDemand`), claims (`claimedBy`), explainability (`demandWhy`, `jobPurpose`) | Pattern; demand feeder | Audit B15, read by C and tech review | Rewrite formula for this game's resources; separate by job kind; emit board jobs and blockers |
| Leisure needs (the `strain` accumulator is cut, K5) | Math + design | Audit B4 | Maps to leisure XP (flavour in slice); over-ordering is bounded by needs and the rested curve |
| Season/warmth curve + normalise-to-mean-1 rule | Code/spec | Audit C table (read in code/config) | |
| Plant/animal lifecycle (no spawn caps, `respawnFauna` floor) | Spec | Audit C table | LOD for far chunks later |
| Soil exhaustion + trampling/desire paths | Spec | Audit C table | Surface layer only |
| Ruins/salvage/resettlement | Spec | Audit C table | Post-MVP candidate |
| Chronicle (`village.chron`), per-slime `log` ring buffer | Pattern | Audit C table | Budget ≤1 MB (D 2.8) |
| Build decay + self-repair with own bill of materials | Pattern | Audit C table | Becomes the "decay as master sink" |
| **Save architecture**: terrain regrown from seed + sparse **exact** deltas; ids relinked; generic copy with denylist; transient jobs dropped | Pattern; partial code | Audit B13 (read `save.js` header); header comment stale vs README on quantisation, so the exactness claim rests on the README lesson | Chunk deltas with COW; versioning/migrations |
| **Headless harness set**: `headless.js`, `sweep.js` (survival judged both ways: <45% too harsh, 100% too easy), `fixture.js` + 4 frozen fixtures, `save_roundtrip.js` | **Pattern and test design; high value** | Audit: ran `headless.js 20` (20 days ≈ 30 s wall, "161x real time"; population ~6 so no population stress) and `save_roundtrip.js 15` (all checks passed, 34 s) | Extend with exploit bots (R25) |
| `debug_*.js` investigation scripts (ambition, belong, split, flock) | Pattern | Audit E | |
| Perf design patterns (hidden-tab skip draw, adaptive quality, season layer composited once) | Pattern | Audit C table | If web renderer |
| Language: vanilla JS ES modules, sim with zero DOM | Code if the engine is JS/TS | Audit A1; harness imports sim under node | Otherwise treat as specification |

### 3.2 What is NOT reusable

| Item | Why | Verified how |
|---|---|---|
| `findJob` (jobs.js:1794→2663 region) | Monolithic, tied to prefab buildings and slime-village's stock model; no orders | C 2.15; tech review read jobs.js (3,521 lines) |
| `ai.js` (4,543 lines) state machine | Entangled with job logic; replaced by Action/Controller | C 2.15 |
| `world.js` 2D immutable-terrain generator and obstacle masks | Immutable terrain breaks "terrain is a pure function of seed"; no caves/ores in depth | Audit D6; C 2.15 |
| `findPath` A* (`maxNodes` 6000; Map/Set) | Replaced by region graph + HPA*; lesson kept | C 2.12 (code comment) |
| Renderer, UI, minimap (`render/*`, `ui/*`) | 2D top-down canvas, "watch only" model | Audit C table |
| Prefab `BUILDINGS` defs | Replaced by Room + Purpose + Blueprint | C 2.8 |
| `game.js` variable step with speed (1/30, 1/15, 1/10) | Breaks determinism | C 2.10 (game.js:498) |
| Global RNG and global `uid` counter | Single stream shifts on any new consumer; two `Game`s in one process share globals (README gotcha) | Audit B14 |
| `SAVE_VERSION=1` refusal on mismatch | Hostile for a long-lived world | Audit B13 |
| Skills, orders, possession, freeform building, 3D, logistics beyond hand-carrying, tech beyond steel | **Do not exist** in slime-village (Audit headline 2-3, D5): the new-risk core of this project | Audit |
| games/Dorfs (Godot 3, 253 lines) | Scaffolding; six sprites; nothing to reuse | Audit A2 |
| prm/slime_world notes | Design seed only; **death-farming/mana-for-deletion explicitly cut** | Audit A3, F2; RESOLUTION |
| scad/slime_colony | OpenSCAD tabletop pieces, irrelevant | Audit A4 |

### 3.3 Caveats on reuse
- **Dirty tree**: slime-village's working tree had 33 modified files at audit; last commit `d9bceff` (2026-10-05). Snapshot a commit before porting; HEAD may not equal what the README describes (Audit headline 5).
- **Performance claims**: "1.4 ms per tick for a hundred slimes" is README-only (UNVERIFIED). The auditor's run had ~6 slimes, 1,500 plants, 360 animals; no population stress was done.
- **README vs code**: ambition table, save quantisation and the number of quests disagree. Code is truth.
- **Estimate**: if the engine is JS/TS, adapting the sim core is 1-2 FTE-months; with another engine 4-6 (D 7.3, ASSUMPTION). That asymmetry is an input to OD-06 and the reason OD-41 recommends a throwaway TypeScript prototype core.

---

## 4. Risk-to-prototype map

| Prototype | Retires |
|---|---|
| P1 pathing + sim loop (deferred; C1 microbench stands in) | TR-04, TR-12 |
| P2 rooms + heat | TR-05, TR-14 |
| P3 shared Action runner | TR-03 |
| P4 determinism + save | TR-06, TR-07, TR-16, TR-28, TR-31 |
| P5 desk spike + throwaway test | TR-01 |
| P6 readability (no stub; TR-09 handled by not scheduling a second renderer) | TR-08, TR-09 |
| P7 blueprints | TR-13 |
| P8 possession feel | TR-02, TR-27, TR-32 |
| P9 thrash + unattended | TR-10, TR-11 |
| P10 Why panel | TR-10 |
| P11 discovery chain | TR-15, TR-23 |
| P12 lifespan vs transmission | TR-17 |
| P13 exploit bots | TR-18, TR-19, TR-26 |
| P14 LOD calibration | TR-20 |
| P15 Almanac comprehension | TR-15 |
| P16 map size | TR-21 |
| (process) | TR-33, TR-22, TR-24, TR-25, TR-29, TR-30 |
