# Build plan — C3 "Clay & Copper" (the vertical slice)

Follows notes/impl/BUILD_PLAN.md (S1–S4b, done). The stack, layout and **hard rules** there still apply word for word: pure sim, determinism, one Action pipeline, a blocker for every rejection, values from the GDD, small readable modules.

Design sources:
- docs/GAME_DESIGN.md §08 (genetics), §10 (skills), §11.5–11.10 (strata, caves, events, heat, validator), §13 (mining, expeditions, hazards, combat), §14 (recipes, stations), §15 (discovery), §26 C3 row.
- Appendix B (the slice content list). **Anything not in Appendix B is not in C3.**
- docs/PROTOTYPE_PLAN.md P11 (discovery chain) and the C3 pass bands.
- notes/phase6/RULINGS.md K6 (specialisation), K7 (possession purpose) and K8 (heat function).

Exit criteria (GDD §26, C3 row):
- Properties 3, 5, 6 and 7 pass as bots or tests.
- The stuck rate is under 2%.
- The K6 top-skill-holder check passes.
- The fun check (3–5 humans) is out of scope for agents; we report what's ready for it.

## Stages (sequential; each one leaves `node tests/all.js` green, the HTML building, ui_smoke passing, and screenshots in game/tmp/)

### S5 Skills & genetics
- **Skills.**
  - Appendix B has three: dig, build and craft. Gathering is skill-less.
  - The prototype currently has gather, chop and build. Reconcile it to the GDD: chop folds into gathering (skill-less), and dig and craft are added. If a deviation is better for play, document it as a DEFAULT in DECISION_LOG.
  - Challenge-matched XP, the K6 rested curve, and skillFit ≈40 at 0.7 against ≈20 path cost.
  - Preferred craft (top skill) gets stickiness. Profession labels.
- **Genetics.**
  - Nine traits from slime-village (`settle` soft cap, mixture inheritance, 4% sport mutation ±8–15%).
  - Convex trait upkeep (high traits cost food/sleep). Environment-dependent value. Clone limit (≤1 solo split per life; clones regress to the mean).
- **Teach verb** and watching-based familiarity (§10, R10) as far as it serves skills.
- **Bots.**
  - The K6 check: in a 6-villager colony after 1 game year, the top skill holder per skill is ≥0.25 above the median.
  - Property 3: work equal to 15% of adult life in one skill gives ≥25% over a control.
  - The grind bot is extended to the new skills.
- **UI.** Skills, profession and traits in the inspector, and a lineage line.

### S6 Geology, mining & caves
- **Worldgen.**
  - Strata: soft rock, flint, and malachite stain in the soft rock.
  - A clay bank on the stream, one cave region, and one ridge cell suited to draft.
  - Tubers as a plant.
- **Validator.** It checks that the materials of the chain exist reachably, with ≥2 sources per key input (§11.10). Bad seeds are re-rolled deterministically.
- **Area mining (R27).**
  - Intents: dig region, dig to depth, follow vein, and seek X. Each is a single designation, not per-block.
  - Dig is a standing-class job using the dig skill. Mined cells yield items (stone, flint, clay, malachite).
  - Stairs and ramps let villagers go down.
- **Fog of knowledge.** Unseen underground cells are hidden until a villager has seen them (render-side state derived from a sim "seen" bitset that is saved).
- **Rendering.** Z-levels work already; check that caves and mines read clearly.

### S7 Discovery & the chain
- **The heat function as a pure table first** (K8: fuel × enclosure × draft → heat 0–5), with a table test before any gameplay.
- **Phenomena data**: FIRE_TENDING, BAKE_CLAY, HOLDS_LIQUID, SMOULDER_WOOD, SMELT_COPPER, plus optional KILN_FIRING.
- **Systemic events**: lightning and a smouldering stump.
- **Witness** (salience × attention × intelligence × pressure) and **tinker** (cap 8, consumes material, records dead ends; standing class when the player asks, leisure otherwise).
- **Familiarity** per craft. A craft is a capability while a living villager holds it. Rediscovery near evidence costs ≈20%.
- **Stations**: fire ring/hearth (warmth plus cooking), clay-lined pit kiln, charcoal mound, workbench and bellows.
- **Products**: fired clay, clay jar, charcoal, copper ingot. ≥2 routes to heat 4.
- **Era labels** in the chronicle (Hearth → Clay → Copper).
- **The workshop purpose** gets a real requirement (a workbench).
- **UI**: an Almanac panel (known crafts, holders, dead ends), Curiosities with near-miss hints that never name the product, and the discovery trace log plus a force-fire debug command.
- **Bots for property 6**:
  - The competent bot finds copper by 1.0 game year on ≥80% of seeds.
  - The brute-force bot at 2× materials finds it before 0.5 years on <10%.
  - The stuck rate is <2% over many seeds.

### S8 Thornback, expeditions & possession combat
- **The thornback**: 150 HP, wounding. A fear system makes autonomous villagers flee above fear 0.6. **Steadfast** becomes real: a possessed villager doesn't flee. There is a melee Action shared by AI and player.
- **The hopper**: huntable game that gives hopper meat (food).
- **Restricted cells (K7)**: cells the AI refuses (for example a thornback lair, or deep unlit cave beyond the seen frontier), which a possessed villager may enter.
- **One expedition type with a recall rule**: a selected crew goes to "find X". It is property 5: a non-surface resource found within 2 game days on ≥80% of seeds; delegated villagers flee the thornback and still reach the target on ≥70%.
- **Possession polish**: dig, melee and place verbs, hit feedback and light radius underground.
- **Property 7 extension**: a possession session replays to identical hashes; a possessed villager can stand against the thornback and enter a cell the AI refuses.

## Process
- One Sonnet agent per stage, sequential (they share jobs.js / worldgen.js).
- Opus reviews each stage's report, spot-checks it, and rules on deviations before starting the next stage.
- Each agent appends a short stage section to game/README.md and a row to the Implementation table in notes/STATUS.md.

## Testing rules (added after a memory crash; these override anything above)
A previous session ran multi-year bots on many seeds in parallel, and the machine ran out of RAM.
- **Fixtures first.** `game/tools/make_fixtures.js` writes saves at key moments to `game/tests/fixtures/<name>.json` (one seed, deterministic):
  - `start`: day 0.
  - `settled`: about day 20, with stock and beds.
  - `prewinter`: the day before winter.
  - `midwinter`.
  - `hut`: a roofed shelter with beds and a stockpile, built by a scripted player.
  - `year2`: start of year 2.
  - Later stages add their own: `mine` (a dug shaft into soft rock), `fire` (fire known), `clay` (pottery known), `copperready` (charcoal and malachite in stock), `thornback` (one nearby).
  - `tests/fixture.js` exports `loadFixture(name)` → Sim. It regenerates a fixture when it's missing or the save version changed.
- **Feature tests** load a fixture, issue the commands, and run only the window that matters, usually ≤ 3 game days (≤ 5,400 ticks). They assert that the feature works. Balance is a best guess and is tuned later.
- **Running tests.** `node tests/all.js` = the quick set (unit + fixture tests), run sequentially, each child at `--max-old-space-size=768`. The `--full` flag adds the multi-seed bots. Feature stages run only the quick set; at most one full run, at the very end of a phase.
- **Parallelism.** `fanOut` runs `SIM_JOBS` children at a time (default 2). Never run two test commands at once. Never background a sim run and start another. Never run more than 3 seeds × 1 year in a new bot.
- **Timeouts.** Put an explicit timeout on long commands (≤ 10 min). If a run is slow, shrink it; don't parallelise it.
- **Browser.** One headless Chromium at a time (ui_smoke / shot / playtest), always closed in `finally`.

## Phase mapping (the user's words → this plan)
- **Phase 1** = C1 + C2-lite (committed).
- **Phase 2** = C3 = S5–S8 above.
- **Phase 3** = the MVP Essential tier (docs/MVP_SCOPE.md §3.2), **features only**, best-guess balance, no art/audio pass:
  - **S9 Discoveries:** the rest of the 12-set (DRESS_STONE, CORDAGE/HIDE_WORKING, FRAMING, KILN_FIRING if skipped, one preservation alternate DRY/SMOKE/SALT, CASTING, HAMMER_NATIVE, SMELT_IRON + FORGE_WELDING). Era labels through Iron. A hide teepee → cabin → brick shelter progression from materials.
  - **S10 Living world:** farming (plots, sowing, growth seasons), husbandry (pen the hopper, breed), preservation depth (spoilage), flora/fauna lifecycles.
  - **S11 Command scale:** crews (name a selection, a default task, a stall summary), transport tiers (basket/box → backpack → wagon), blueprint revision push, Concerns panel, and orders working at 20–60 villagers.
  - **S12 Underground and world:**
    - Cave-in (unsupported spans), bad air pockets, light (torches, light radius), and possession polish.
    - A second and third biome.
    - UI completion: Almanac polish, remappable keys, accessibility baseline, ironman flag, save migration.
    - Remaining bots (breed-best, possess-swap, max-expansion) as small, fixture-based checks.
- **Phase 4** (requested 2026-10-28) = the "Important but deferrable" tier (docs/MVP_SCOPE.md §1.2), features only, best-guess balance:
  - **S13 People depth:**
    - skill rust when idle
    - hobby/leisure skills as flavour
    - hidden genotype and inbreeding depression
    - relationship tiers beyond family and friend/rival (friend, rival, partner, mentor)
    - grief/mourning, graves and heirlooms (GDD §20 flavour)
  - **S14 World depth:**
    - a second hazard family (e.g. disease or flood) and a fuller fauna set (a predator pack, a grazer)
    - alternates on 2–3 capability slots (preservation by salt, smoking, cold cellar; a second fuel or tool route)
    - per-seed property perturbation (±10%)
  - **S15 Settlement depth:**
    - room purposes bedroom, storage and kitchen, with real effects
    - wagon and animal-cart transport tiers
    - advisory notifications (≤1 per threat class), Concerns polish
    - population 20–60 performance plus crew UI at scale
    - chronicle export
- **Phase 5** (requested 2026-10-28) = an endless world (the user: "it's supposed to be a large planet, not a small square area"):
  - **S16 Endless world (model and generation):** unbounded signed x / y, z 0..D-1; terrain a pure, order-independent function of (seed, coordinates) in 16 x 16 columns chunks; rivers, lakes, caves, ores, strata, ridges, biomes and the S14 deposits as coordinate rules; a deterministic spawn search with placed slice-critical content; chunks activated inside `sim.step` from anchors (never the camera), untouched far chunks unloaded and regrown, changed ones kept; a bounded render-side cache drawing unexplored land dim; every fixed-size assumption replaced; saves of seed, camp, chunks, deltas and entities (SAVE_VERSION 9); fixtures regenerated.
  - **S17 Endless world (scale):** dormant-chunk simulation LOD, save compaction (plants of untouched chunks regrown, not saved), a minimap and exploration UX (frontier, markers, fit to explored area), a region graph for far pathing. Built in S17 except the region graph (see the README, "Endless world: dormancy, saves, minimap, exploration (S17)").
- **Phase 6** (requested 2026-10-28): first-person camera and a cohesive UI.
  - **S18 First-person view:** a second renderer on the same sim (R2: experimental, a second renderer only). Used while possessing; Delver-style billboard sprites; no sim changes beyond input. Built in S18 (see the README, "First-person view (S18)", and D37).
  - **S19 UI overhaul:** "show, don't tell", one cohesive design system. Work from notes/impl/UI_SPEC.md, which is written first by a read-only audit. Run as S19a (design system + HUD + panels; plus the UI_SPEC §12.1–12.4 feedback: labels, action feedback, grid FPV, show-me lands visibly) and S19b (**3/4 oblique WebGL main camera with cutaway levels** per R2 / UI_SPEC §12.5, map visual language, readable levels, onboarding), sequentially.
- **Clock rebase** (requested 2026-10-28; build after S18, before S19). Stage **S18b**:
  - 1 game day = **10 real minutes at 1×** (12000 ticks at 20 ticks/s; was 1800). A life is **5 game years** (was 4).
  - Consequences at 1×: a season ≈ 4.2 h, a year ≈ 16.7 h, a life ≈ 83 h.
  - **Superseded in part (user, 2026-10-28):** all durations except age and the calendar are flat tick constants that keep their old real-time feel. They are not scaled by the day. Only energy and food balance are re-tuned. Tests must survive a different DAY.
  - Anchors for the rebalance (original):
    - Walking and work-action durations keep their real-time feel (ticks unchanged).
    - Biology stays per day: about the same meals per day; one sleep per night; night stays about 30% of the day.
    - The K3 labour share (≈40–60% of early labour on food) still holds. Yields, needs and the per-day economy are re-derived so a slime's longer day doesn't turn into a food glut.
    - Skill pacing (D13) and genetics/breeding cadence are re-derived in game time.
  - Game speed is a **developer tool** (not a player feature), so its UI is low priority.
- **Phase 7** (planned 2026-10-28; **not approved to build**): magic cores, dungeons and caves. See notes/impl/PHASE7_CORES.md: S20 core field and cave networks, S21 dungeons, S22 monsters and spawning, S23 delving and the core.
