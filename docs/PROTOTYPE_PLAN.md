# Prototype Plan: Vertical Slice and Risk Prototypes

Slime / Dorf Village (working title). Companion to docs/GAME_DESIGN.md §25-§26 (status DRAFT v0.3, final critique applied), docs/MVP_SCOPE.md, docs/TECHNICAL_RISKS.md, docs/OPEN_DECISIONS.md.
Canon: notes/phase2/RESOLUTION.md (R1-R27) and notes/phase6/RULINGS.md (K1-K11) override everything here (GDD Appendix A explains each reference). Labels: AGREED (author) / DECIDED (director) / DEFAULT (revisit after the named prototype) / PROPOSED (new here) / ASSUMPTION (unvalidated number).

The slice (**C3 "Clay & Copper"**, reached through C1 "Leaves & Sticks" and C2 "First Hut") proves one claim: **autonomous individuals + orders at several scales + freeform functional buildings + emergent discovery feel like one game.** It does not attempt later eras, other species, a second camera, offline catch-up, or multiple settlements.

Clock used throughout (K2, GDD §23 "Units & clock"; ASSUMPTION fixed by OD-04): the sim runs **20 ticks per real second at 1×**; **1 game day = 1800 ticks = 90 s**; a game year is 100 days (about 2.5 real hours); a life is about 4 game years (about 10 hours). Short constants are written in **ticks with real seconds at 1× in brackets**; long ones in game days or fractions of lifespan, so criteria rescale if the anchor moves.

**Process diet (K1).** At most **six prototypes gate a checkpoint decision before C3**: **P4** (C1), **P9** (C1, includes the P10 auto-check), **P5** (C2, reduced to a desk spike plus a throwaway test), **P6** (C2), **P2** (C2, with the P7 blueprint checks folded in) and **P11** (C3). Every other prototype is deferred with a named trigger (§4). Bots in the slice are **absent-player, over-ordering and grind**. Human tests are **informal: 3-5 testers per checkpoint**, one question each ("would you keep playing another half hour?"), plus the Why-panel truthfulness check, which is auto-checked.

---

## 1. Slice scope

Adapted from initial_prompt.txt Phase 4 to the RESOLUTION cuts.

| # | Phase 4 item | Slice form | RESOLUTION basis |
|---|---|---|---|
| 1 | One small procedural environment | One map ≈128×128×24, one biome plus caves, one seasonal cycle (a cold season exists); seed-pure worldgen; static water as tags | R3 |
| 2 | One playable species | Slimes only; species is a data table | R15 |
| 3 | A handful of inhabitants | 6-8 named adult villagers at start from 2-3 founder lineages (K3); births allowed; design range 6-60, ceiling ~100 | R4, K3 |
| 4 | Inherited traits + learned skills | 9 traits via carried-over `breed` + `settle`; convex upkeep, clone limit; 3 skills (dig, build, craft; gather skill-less) with challenge-matched XP, `rested`, virgin rule | R16, R17 |
| 5 | Gathering and simple survival needs | Hunger, thirst, energy (sleep), leisure; survival economy and demand vector (GAME_DESIGN §09, §11); known at the start: forage, gather, carry, knap stone; fire is not known; 3 game days of food; leaf beds only | R8, R21, K3 |
| 6 | Freeform construction | Draw floor/wall/roof/stairs/doors on the grid; supports-first construction sites; hybrid Room detection with checklist; graded quality | R18 |
| 7 | One functional building type | **Workshop** Purpose (kiln/hearth station inside an enclosed, roofed Room with a door and bench); heat/enclosure context matters | R18, R12 |
| 8 | Saved blueprints | Capture region → Blueprint with material classes and rotation; ghost; "stamp ×N"; flag "auto-build" | R19 |
| 9 | Basic mining and exploration | Area-designated mining ("dig this region", "seek copper"); delegated expeditions (intent, provisions, recall rule); Atlas; Curiosities | R27 |
| 10 | One hazard | Slice: **cold** (C1) and the **thornback**, one wounding fauna (C3). Cave-in and bad air are MVP tier | R20 |
| 11 | Optional possession | Same Action/Controller pipeline; minimal in C2 (move, interact); combat polish in C3; Divine inspiration (+10% action speed, +15% XP) as a felt bonus; **Steadfast** against the thornback and access to cells the AI refuses are the point (K7); no timer; release only on collapse | R9, K7 |
| 12 | One emergent discovery | Chain: **fire → fired clay → charcoal → copper**, by Witness or Tinker (fire itself is discovered by witnessing a lightning or stump fire), with ≥2 routes per seed and a per-seed solvability validator; Almanac, Curiosities, near-miss hints | R12, K3, K8 |
| + | Chronicle | Firsts, births, deaths with cause, era label | R14 |
| + | Why panel, Concerns panel | Blocker enums rendered as plain sentences; advisory only | R5 |
| + | **Harness and exploit bots** | Headless runs of 20 seeds. Slice bots: **absent-player, over-ordering, grind**, plus idle/competent/brute-force as scripted baselines for Properties 1 and 6. After C3: breed-best, possess-swap, max-expansion, playstyle bots | R25, K1 |

**Out of the slice** (the cut list in MVP_SCOPE §1.6, plus RESOLUTION cuts): friend/rival, grief, graves, heirlooms, notables, culture leanings, alternates, lineage view, apprenticeship, CVD lineage palette, ironman, four of six systemic events, ruins, five of six biomes, hidden genotype, second-renderer stub, second camera, first-person, collective belief, species #2, documents/libraries, culture as a system, Steward, Ledger auto-promotion, priority matrix, offline catch-up, relationships beyond family and friend/rival, full combat, structural physics beyond cave-in spans, drones, belts, wagons and rail beyond hand/basket/backpack transport.

**Content budget** (ASSUMPTION): named in GDD Appendix B (12 materials, 8 cell shapes, the stations and furniture, 6 phenomena, one required Room Purpose).

---

## 2. Reading the acceptance criteria

- **Seeds**: 20 fixed seeds unless stated. **PASS** means the stated fraction of seeds (or runs, or testers) meets the number. A human test is informal: 3-5 testers per checkpoint (the author is not a tester), one question each, results written down as notes, not scored panels.
- **Bots**: slice set *absent-player*, *over-ordering*, *grind*; baselines *idle* (no commands), *competent* (scripted player: orders, blueprint, standing orders, expedition) and *brute-force*. Post-C3: *breed-best*, *possess-swap*, *max-expansion*, playstyle bots (*pure-builder*, *pure-explorer*).
- All numbers are **starting values**, to be tuned by the harness, and every one is marked ASSUMPTION by default. If a number is moved, the change is logged in notes/DECISION_LOG.md.

---

## 3. Acceptance criteria for the seven MUST-demonstrate properties

Each property is first measured at the checkpoint shown (C1 survival and orders; C2 building and possession plumbing; C3 skills, discovery, exploration). All numbers are ASSUMPTION starting values.

### Property 1: The village can function without constant intervention (C1)
Tied to R8 (autonomy band), K3/K4 (survival economy, village-critical needs) and prototype P9.

| ID | Metric | PASS | FAIL |
|---|---|---|---|
| 1a | *Idle bot*, zero commands, 20 seeds, **2 real hours at 1×** (≈0.8 game year, includes a cold season) | ≥90% of seeds have ≥1 living villager and ≥70% of start population | <75% survive |
| 1b | *Idle bot*, ten game years at fast-forward | ≥90% survive **and** <20% have started any building kind not in the starter set or the auto-build flags | ≥20% start new kinds (autonomy overreach) or <90% survive (helplessness) |
| 1c | Stagnation is graceful, not collapse | In 1b survivors, population change within [-40%, +100%] and no famine event lasting >1 game season | outside band |
| 1d | Absent player + 1 queued Blueprint stamp ×3 and 1 standing order | Queue completes within 3 game days of materials available; standing order holds within ±20% | queue dropped or stock oscillates |

### Property 2: The player can meaningfully influence inhabitants (C1)
Tied to R5-R7 (job board, orders, standing orders), K4 and prototype P9 (P10 is its auto-check).

| ID | Metric | PASS | FAIL |
|---|---|---|---|
| 2a | Select 3 of 6 villagers and order them to dig | Dig output ≥2× the unassigned baseline **within 2 game days** | <1.5× |
| 2b | "Keep 30 stone" standing order | Stock within ±20% of 30 by game day 5 and no oscillation period <450 ticks [22 s at 1×] at the threshold (hysteresis ~80%-100%) | oscillation |
| 2c | Need override (K4) | A starving village told to build, and a stamp ×10 ordered during a food dip: ≥95% of seeds survive; food workers stay on food (village food stock < 2 days per head is scored at need class); hauling for the blueprint runs at standing class; the build slows but starves no one; the order resumes when fed | any seed starves with a build order unfulfilled and food available |
| 2d | Thrash | Mean job switches <4 per villager-day over 50 game days with 10 mixed orders on 6 villagers | ≥4 |
| 2e | Why truthfulness | 20 staged stalls (no tool, no path, no material, reserved, unsafe …): zero panel statements contradict sim state (**auto-checked**); informally, 3-5 testers name the true cause in most cases | any contradiction |
| 2f | Order latency | Median unmet-order age <1 game day (1800 ticks) in a fed village | ≥1 |

### Property 3: Inhabitants develop through actual activities (C3)
Tied to R16, R17, K6 and the slice bots (grind) plus the deferred P13.

| ID | Metric | PASS | FAIL |
|---|---|---|---|
| 3a | One villager works one skill for work equal to **15% of adult lifespan** vs a control that does other work | Skill effect ≥25% above control (D formula: effect = 1 + 0.8 × level, level = potential × (1 − exp(−xp/K)); **K rescaled to ~30% of adult lifespan**, ASSUMPTION) | <15% |
| 3b | *Grind* bot (place/mine same block loop, 50 days) | <5% of baseline XP | ≥5% |
| 3c | Specialisation emerges (K6) | The daily rested reduction applies only past ~60% of a day in one craft and floors at 50% gain, so rotation is **not** optimal; in a 6-villager colony after 1 game year the top skill holder per craft is ≥0.25 above the median | rotation beats specialising, or no master emerges |
| 3d | *Breed-best* bot (post-C3, MVP tier), perfect genotype knowledge, top-K parents, 30 generations | Output per food ≤1.15× a random-breeding control **and** extinction rate under an injected disease ≥ control | >1.15× |
| 3e | Skills never gate attempts | After the only holder of a skill dies, the task is still doable at level 0 with extra waste; no deadlock in 20 seeds × 50 game years | any deadlock |
| 3f | Perception (informal) | 3-5 testers shown two villagers of the same age: most can say which is the better digger from the inspector's coarse words and Chronicle, without numbers | none can |

### Property 4: Construction supports creativity and automation (C2)
Tied to R18, R19 and prototype P2 (the P7 blueprint checks 4c-4f, 4h are run inside it).

| ID | Metric | PASS | FAIL |
|---|---|---|---|
| 4a | Room recognition | A workshop is recognised ≤1 s (wall clock at 1×) after the last piece is placed; recompute ≤1 ms p99 per edit batch; room ids stable across no-op edits | slower |
| 4b | Heat/enclosure context | 30 hand-built kiln/hearth builds: context level matches hand-computed expectation in ≥28/30; a 1-tile closet cannot reach the top level; result independent of build order | ≤27/30 or a hole in the rules |
| 4c | Blueprint stamping | Capture a house; stamp ×3 with materials present; autonomous builders finish at ≥90% fidelity (cells with right role and material class) within 3 game days | <90% |
| 4d | Self-walling | 100 stamps with 10 builders: zero workers enclosed; exits reserved until the last cell | any |
| 4e | Partial and cancel | Cancelling a half-built site recovers ≥75% of delivered materials (knob 0-25% loss); a partial build is visible and valid | <75% |
| 4f | Class substitution | A wood blueprint ordered "use stone" with stone only builds, or stalls with "needs: 40 stone-class" (no silent downgrade) | silent downgrade |
| 4g | Creativity (informal) | 3-5 testers each design a qualifying workshop; distinct footprints recognised; most report "I could build what I imagined" | all identical |
| 4h | Wave generation | "Build 10 more" generates job waves in <1 s; ≤30 open jobs per site | flood |

### Property 5: Exploration produces meaningful discoveries (C3)
Tied to R20, R27, K7; P8 and P16 are deferred and run on their triggers.

| ID | Metric | PASS | FAIL |
|---|---|---|---|
| 5a | Delegated expedition (intent "find copper", default recall) | Finds ≥1 non-surface resource within 2 game days on ≥80% of seeds; returns with a report | <70% |
| 5b | Curiosities | ≥1 Curiosity logged from exploration on ≥80% of seeds; a hint never names the product | fewer or names it |
| 5c | Time to landmark | Median time from first walk-out to first notable feature (cave mouth, vein, ruin) is within a target band set by the map-size test (P16 on its trigger; placeholder 3-8 real minutes [3600-9600 ticks] at 1×) | outside |
| 5d | Possession niche (K7) | Autonomous villagers flee the thornback above the fear threshold and refuse unsupported spans and bad-air cells; a possessed villager can stand and win the thornback fight and can enter a refused cell at the player's risk; delegated expeditions still reach the target in ≥70% of runs | delegated <40% success (possession mandatory) or no niche (pointless) |
| 5e | Hazards | Cave-in occurs only on unsupported spans; bad-air pocket (MVP tier) is detectable by the villager's fleeing behaviour; the wounding fauna kills <5% of competent delegated expeditions | outside |
| 5f | Mining UX | A player clears a region with ≤3 designations; no per-block clicking required | more |

### Property 6: Technological advancement changes available capabilities (C3)
Tied to R11-R14, K8 and prototype P11; P12 and P15 are deferred and run on their triggers.

| ID | Metric | PASS | FAIL |
|---|---|---|---|
| 6a | Discovery happens | *Competent bot*: by **1.0 game year** on ≥80% of seeds | <70% |
| 6b | Informed beats brute force | *Brute-force bot* with 2× material budget: <10% of seeds before 0.5 game year; informed route 3-5× cheaper in villager-days (ASSUMPTION) | brute force dominant |
| 6c | No soft-lock | Stuck rate <2% over 20 seeds × 50 game years; every stuck case has a precondition trace; the solvability validator rejects/regenerates unsolvable seeds | ≥2% |
| 6d | A *capability*, not a bonus | After the discovery ≥1 job kind appears on the board that never appeared before (e.g. "fire clay", "smelt"); no tech grants a flat % bonus | only %-gains |
| 6e | Loss and recovery | Last holder dies: craft unavailable; evidence (a built kiln, stored product) lets rediscovery cost ≤0.4× of the first (design value about 0.2×, D8); loop completes in hours of play, not days | no recovery or permanent lock |
| 6f | Almanac comprehension (informal) | 3-5 testers, 30 min, no tutorial: most state why a craft is unavailable and one fix | none can |
| 6g | Era label | The Chronicle shows an Era label derived from capabilities held ("Clay age"; order Hearth, Hide, Stone, Clay, Timber, Copper, Iron), never gating anything | gates |

### Property 7: Direct control and autonomous control share the same simulation (C2, extended in C3)
Tied to R9, R23, K7; P3 is a CI test from C2, P4 gates C1, P8 is deferred.

| ID | Metric | PASS | FAIL |
|---|---|---|---|
| 7a | Same Action, same timing | For identical actor, target and state, AI-controlled and possessed Action have identical `durationTicks` (exact), modulo the declared inspiration Modifier | any difference |
| 7b | Output band | Same villager possessed vs delegated at equal skill, ordinary work: output 1.0-1.25× (bot band; D) | >1.25× |
| 7c | Risk band | Possessed death rate in the thornback fight and restricted-cell tasks ≥0.5× the AI rate at equal skill | <0.5× |
| 7d | Replay | A recorded session containing a possession episode replays to identical state hashes every 100 ticks for 100k ticks | any mismatch |
| 7e | Save round-trip | Save during possession, restore, continue: tick-for-tick equal to the original over 5 game days | diverges |
| 7f | Release rule | Control returns only on collapse (incapacitation) or by the player; no timer, no cooldown (R9) | any auto-release on a warning |
| 7g | Worth choosing (informal) | 3-5 testers: does each choose to possess a second time, and does each say they would play unpossessed without feeling punished? (the single decisive test) | none returns, or all feel punished |
| 7h | Possess-swap bot (post-C3, MVP tier) | Alternating possession across 6 villagers earns ≤1.25× baseline output and no need-bypass | >1.25× |

---

## 4. Risk prototypes P1-P16 (merged and de-duplicated)

**Status key (K1).** **GATE** = one of the six that gate a checkpoint before C3. **CI** = folded into a test that runs on every build. **DEFERRED** = not built until its trigger fires. Checkpoints replace the earlier milestones M0-M7: C1 = M0-M2 survival core, C2 = M1/M3 building, C3 = M4-M6 skills, discovery, exploration.

Sources merged: C_simulation_tech.md §2.13 (P1-P7), phase2/design_challenges_tech.md §8 (P8-P13), phase2/tech_challenges_design.md "Assumptions requiring prototypes" (items 1-15), and D_balance_feasibility.md §7.2/§2. Where a question appeared in several, it appears once with the tightest pass metric. RESOLUTION named five phase-gate prototypes (layered-2D vs 3D; 3/4 slice readability; lifespan vs craft transmission; order/need thrash and Why panel; possession feel) which map to P5, P6, P12, P9/P10, P8. IDs P1-P7 follow C's numbering where the question is the same; the rest are renumbered; a concordance is at the end.

Each: **Question · Smallest build · PASS/FAIL · Retires risk (TECHNICAL_RISKS.md) · Milestone.**

### P1 Chunked grid + pathing at design population
- **Status**: DEFERRED in full; a 100-random-walker microbench on the region graph runs in C1 (first-ten-days plan, §7). **Trigger for the full P1**: village population in play passes 20, or the C2/C3 tick exceeds 25% of the 6 ms budget at 8 villagers, or the microbench exceeds 3 ms p95.
- **Question**: do region-graph + HPA* pathing and the sim loop hold at design population?
- **Smallest build**: 128×128×24 chunked typed-array grid; 100 agents random-walking and hauling; region graph, reachability cache, HPA*, time-sliced path requests. Includes the combined sight/witness/lore/tinker consumers (tech review items 11 and 13) as stubs with a shared sight cache.
- **PASS**: ≤6 ms/tick p95 on a mid-2020 laptop including path work at 100 agents; no agent stuck >30 s; sight consumers combined <1 ms/tick p95; tinker candidate build <0.5 ms/tick amortised at 100 idle. **FAIL**: >2 ms for sight consumers or >10 ms tick.
- **Retires**: TR-04, TR-12. **Checkpoint**: C1.

### P2 Rooms and heat/enclosure context
- **Status**: GATE (C2). Run against the heat function in GAME_DESIGN §11.9 with hand-computed expectations; the blueprint checks of P7 (self-walling, class substitution, waves) run in the same harness.
- **Question**: do incremental flood-fill rooms and the kiln heat/enclosure context behave on freeform builds?
- **Smallest build**: grid with player-drawn rooms, fuel and draft; 30 scripted kiln/hearth builds; random wall/door edits.
- **PASS**: context level matches hand-computed in ≥28/30; ≤1 ms p99 per edit batch; ids stable across no-op edits; 1-tile closet cannot cheat the top level. **FAIL**: rule hole or build-order dependence.
- **Retires**: TR-05, TR-14. **Checkpoint**: C2.

### P3 Shared Action runner
- **Status**: CI test from C2 (same Action, same ticks, AI vs possessed), not a prototype.
- **Question**: is the Action/Controller pipeline truly shared by AI and possession?
- **Smallest build**: Action runner with AI controller and a possession toggle; one skill awarding XP; scripted input.
- **PASS**: same Action takes identical ticks for AI and possessed (modulo the Modifier); XP formula identical; replay equal. **FAIL**: any code branch on controller type other than the Modifier.
- **Retires**: TR-03. **Checkpoint**: C2 (as a CI test).

### P4 Determinism and save round-trip
- **Status**: GATE (C1).
- **Question**: can the sim reproduce itself, and can a mutable chunked world be saved exactly?
- **Smallest build**: fixed 20 Hz tick, named counter-based RNG, command log, state hash every 100 ticks; seed + COW chunk-delta save; the carried-over `save_roundtrip` pattern; replay on a second OS/browser/engine.
- **PASS**: identical hash every 100 ticks for 100k ticks across two runs and, as documented, on a second engine (where it diverges is recorded, not failed); restored game equals original tick-for-tick over 5 game days; save of a fully mined 128×128×24 world ≤500 KB. **FAIL**: same-build mismatch.
- **Retires**: TR-06, TR-07, TR-16, TR-28, TR-31. **Checkpoint**: C1.

### P5 Layered-2D vs 3D z-level grid on the slice (phase-gate)
- **Status**: GATE (C2), **reduced (K1)**: a <=1-week desk spike comparing both models on paper for the three scenarios, plus one throwaway mining+room test in the default 3D z-level grid only. The layered-2D alternative is built only if the spike fails. K1's "P5/P15 two world models" refers to this prototype; P15 here is the Almanac test.
- **Question**: is the 3D z-level grid (R3 default) worth its cost over a layered 2D model for what the slice needs?
- **Smallest build**: a paper comparison of the slice scenarios (a mine, a roofed house of at most two levels, a kiln room) in both models with LOC and risk estimates (<=1 week), plus a throwaway mining+room test in the 3D z-level grid.
- **PASS** (default confirmed): all three scenarios work in the 3D grid at <=2× the paper estimate. **FAIL**: a scenario is inexpressible or the cost blows the estimate; only then is a layered-2D build started. Layered 2D covering the scenarios on paper at <50% of the 3D cost reopens R3 and is then built and compared.
- **Retires**: TR-01. **Checkpoint**: C2 (before the engine decision).

### P6 3/4 slice readability and second-renderer stub (phase-gate)
- **Status**: GATE (C2); the second-renderer stub is **deleted**.
- **Question**: is a fixed-pitch 3/4 camera over a z-sliced world readable for freeform building and mining, and is a second renderer cheap?
- **Smallest build**: render one multi-floor building plus a mine in slice mode (current level, dimmed level below, roof cutaway, ghost of level above). No billboard stub.
- **PASS**: most of 3-5 testers find stairs, distinguish roof from floor and place a ghost within 60 s; picking needs no rotation. **FAIL**: testers confuse layers after hints.
- **Retires**: TR-08, TR-09. **Checkpoint**: C2.

### P7 Blueprint capture and stamping
- **Status**: folded into P2's C2 run and the C2 exit criteria; no separate prototype.
- **Question**: do capture → rotate → substitute → stamp → build work with 10 workers?
- **Smallest build**: capture a house, 4 rotations, class substitution, supports-first DAG, exit reserved until last cell.
- **PASS**: no self-walled workers in 100 stamps; partial cancel recovers materials; wave generation <1 s; ≥90% fidelity. **FAIL**: any enclosure or silent downgrade.
- **Retires**: TR-13. **Checkpoint**: C2.

### P8 Possession feel (phase-gate)
- **Status**: DEFERRED. Minimal possession exists in C2 and polish in C3; the single decisive test is 7g (does the tester choose to possess a second time). **Trigger**: 7g fails at C3, or before investing the MVP-tier possession budget (MVP_SCOPE §3.2).
- **Question**: is possession worth choosing with a minimal kit, because of Steadfast and restricted-cell access (K7), without being mandatory or optimal?
- **Smallest build**: grey-box cave with 2 hostile types, torches, fall damage; tight-follow camera with continuous sub-cell movement vs click-to-move; buffs +10% speed/+15% XP/Steadfast as a single data row.
- **PASS**: testers choose to possess a second time; delegated reaches target in ≥70%; economy gain <15%; possessed output ≤1.25× delegated in the bot. **FAIL**: delegated <40% (possession mandatory) or no niche (pointless).
- **Retires**: TR-02, TR-27, TR-32. **Checkpoint**: C3.

### P9 Order/need thrash and unattended survival (phase-gate)
- **Status**: GATE (C1). Includes the K4 case: a stamp ×10 ordered during a food dip, and an empty-larder case.
- **Question**: does the one board with five explanation classes behave, and does the autonomy band hold?
- **Smallest build**: headless job board with ORDER base, urgency curve, keep-N pull; scripted-player bot issues 10 mixed orders to 6 villagers for 50 game days (20 seeds; Property 2d), repeated with 60 villagers as a stress run later; idle bot for 2 real hours; absent-player and over-ordering bots.
- **PASS**: Property 1 and 2a-2d metrics; starving-village-told-to-build and stamp-during-food-dip survive ≥95%; no oscillation <450 ticks [22 s] at a keep-N threshold; no order silently dropped. **FAIL**: any of these.
- **Retires**: TR-10, TR-11. **Checkpoint**: C1.

### P10 Why panel truthfulness
- **Status**: folded into P9 as the auto-checked 2e (no tester panel).
- **Question**: can blocker enums make the Why panel always true?
- **Smallest build**: `blockers[]` on 5 job kinds; render for 20 staged stalls.
- **PASS**: testers name the true cause in ≥18/20; zero statements contradict sim state. **FAIL**: any string not derivable from the scoring result.
- **Retires**: TR-10. **Checkpoint**: C1.

### P11 Slice discovery chain: no soft-lock
- **Status**: GATE (C3). The copper chain is first built as a headless table test with exactly one route (one clay source, one charcoal source, one ridge), then alternates are added.
- **Question**: does the ~12-discovery-shape chain (slice uses one chain) reach each capability within sane time and never lock?
- **Smallest build**: Phenomena table, Witness and Tinker, candidate sampling (pool 8 vs 14 vs 30), solvability validator, trace log; idle and competent and brute-force bots × 20 seeds × 50 game years.
- **PASS**: Property 6a-6d; capability reached in ≥95% of idle runs within 20 game years and 100% of competent within 8; discovery time under pressure 3-8 game days; exhaustive try-all ≤2× faster than informed; stuck <2%. **FAIL**: circular precondition with no obtainable source, or try-all dominant.
- **Retires**: TR-15, TR-23. **Checkpoint**: C3.

### P12 Forget/recover loop and lifespan vs craft transmission (phase-gate)
- **Status**: DEFERRED. The K6 bot check (3c) runs in C3. **Trigger**: the first craft-loss event in C3 bots looks wrong, or before locking the MVP content set; run on skills and aging as built.
- **Question**: is a ~10-hour life long enough to teach a craft, and does the single-layer knowledge model keep the story beats of the richer model?
- **Smallest build**: headless: set skill rate so 0.7 skill takes the K-rescaled time; simulate 10 generations of a 3-craftsperson village; compare skill-only against a notion+skill model on pottery + copper for chronicle events.
- **PASS**: craft survives ≥8 of 10 generations by learn-by-proximity; chronicle events (first-fire credit, last-smith-died, rediscovery) occur within factor 2 of the richer model and 3 testers cannot tell which produced a chronicle; loop completes in hours. **FAIL**: collapse in >3 generations or requires babysitting; skill-only shows no knowledge-loss events at normal mortality. (With K6, masters emerge, so craft loss is a real possibility, softened by evidence-based rediscovery.)
- **Retires**: TR-17. **Checkpoint**: C3 (on trigger).

### P13 Exploit-bot harness and genetics/skills feel
- **Status**: slice part (grind, over-ordering, absent-player) is built in C1-C3 as ordinary bots; breed-best, possess-swap, max-expansion and the ±25% story test are DEFERRED until the MVP tier begins.
- **Question**: do grind, breed-best, possess-swap, max-expansion, absent-player and over-ordering bots stay inside their bands, and do genes produce stories?
- **Smallest build**: the harness (extends headless/sweep/fixture); bots as above; convex upkeep, clone limit; max-expansion for 5 game years; genes ±25% vs ±30% story test (n=10).
- **PASS**: Property 3b (slice), 3d and 7h (post-C3); max-expansion growth <5%/year at plateau (set by labour and maintenance); possess-swap ≤1.25×; testers tell stories about individuals at the chosen spread. **FAIL**: growth runs to infinity (a sink is missing) or any exploit beats its band.
- **Retires**: TR-18, TR-19, TR-26. **Checkpoint**: C3.

### P14 LOD Tier-2 aggregate vs full sim (not on the slice's critical path)
- **Status**: DEFERRED. **Trigger**: a second settlement is designed.
- **Question**: does the dormant aggregate match the full sim, in both directions?
- **Smallest build**: save at day 0; run Tier 0 and Tier 2 for 20 game days; first-return digest check (does the player feel it was "their" village).
- **PASS**: skill gain and discovery events within ±15%, **one-sided test** so dormant villages neither systematically out- nor under-discover. **FAIL**: systematic asymmetry.
- **Retires**: TR-20. **Checkpoint**: after the MVP.

### P15 Almanac comprehension
- **Status**: DEFERRED as a formal test; 6f is an informal 3-5 tester check at C3. **Trigger**: that check fails.
- **Question**: do players understand knowledge loss, Curiosities and hints?
- **Smallest build**: paper or clickable Almanac; 5 players, 30 min, no tutorial.
- **PASS**: ≥4/5 state why a craft is unavailable and one fix; can tell blocked from slow. **FAIL**: <3/5.
- **Retires**: TR-15. **Checkpoint**: C3.

### P16 Map size and exploration pacing
- **Status**: DEFERRED; time to first landmark is observed informally at C3. **Trigger**: testers call the map empty or overwhelming.
- **Question**: how big must the first map be for exploration to feel like discovery at 5-8 villagers (and later 20-60)?
- **Smallest build**: 96, 128 and 160 wide maps with the same density of features; time-to-first-landmark and time-to-first-Curiosity logged for competent bot and 5 testers.
- **PASS**: median time to first landmark within the band set by the testers (placeholder 3-8 real minutes at 1×) and a delegated expedition finds a resource within 2 game days on ≥80% of seeds. **FAIL**: empty-feeling or overwhelming.
- **Retires**: TR-21. **Checkpoint**: C1.

### Concordance (source IDs → merged IDs)
| Source | Merged |
|---|---|
| C P1 (chunked grid + HPA* 200 agents) | P1 (at 100 agents; 200 as stress headroom, R4) |
| C P2 (room flood-fill); tech item 3 (heat context) | P2 |
| C P3 (Action runner + possession toggle) | P3; feel part → P8 |
| C P4 (determinism/replay) | P4 |
| C P5 (two renderers); design P10 (readability); tech item 10 | P6 |
| C P6 (LOD Tier 2); tech item 12; design P11 (first-return) | P14 |
| C P7 (blueprints) | P7 |
| design P8 (possession feel), P9 (buff perception); tech item 9 | P8 |
| tech items 1 and 14 (order thrash; unattended survival) | P9 |
| tech item 2 (Why panel) | P10 |
| tech items 4, 8, 13 (discovery chain; tinker sampling; tinker cost) | P11 |
| tech items 5, 6; design P12 | P12 |
| D bots (grind, breed, possess-swap); design P13 (genes) | P13 |
| tech item 7 (Almanac) | P15 |
| tech item 15 (layered-2D vs 3D) | P5 |
| design §3 (map size row) | P16 |
| tech item 11 (`sightOf` consumers) | P1 |

---

## 5. Ordering

Order is by (a) what the next prototype depends on, (b) cost of being wrong, (c) cheapness. Only the first six rows gate a checkpoint.

| Step | Prototype | Checkpoint | Why here |
|---|---|---|---|
| 1 | **P4** determinism + save round-trip + harness skeleton | C1 | Everything after is measured by headless bots; erosion later is the costliest |
| 2 | **C1 microbench** (100 random walkers, region graph) | C1 | Cheap stand-in for P1; feeds engine criterion E2 |
| 3 | **P9** order/need thrash + unattended survival (+ P10 auto-check; K4 case) | C1 | The autonomy band is the organising sentence |
| | *Fun check at C1, then:* | | |
| 4 | **P5** desk spike + throwaway mining+room test (default grid only) | C2 | Decide the world model before camera, heat context and rooms |
| 5 | **P6** readability | C2 | Roof/floor legibility is make-or-break for the building pillar |
| | *Engine decision gate (OD-06): after the C1 microbench, P4, P5, P6 and a UI spike; due before C2 art* | | |
| 6 | **P2** rooms + heat context (blueprint checks folded in) | C2 | Needed by the workshop and discovery |
| | *Fun check at C2, then:* | | |
| 7 | **P11** discovery chain (heat-function table test first) | C3 | Needs rooms, skills, materials |
| | *Fun check at C3 and the recorded demonstration.* | | |

**Deferred, with triggers (§4):** P1 full, P8, P12, P13 remainder, P14, P15, P16.

Rules: a prototype that FAILs does not block the plan silently; the fall-back named in docs/TECHNICAL_RISKS.md is taken and the decision logged. No prototype is built twice: checkpoint code grows out of it.

## 6. The demonstration

On a fresh seed, one recorded session of ≤2 real hours shows each property in order: leave the village alone for 10 minutes (1); select villagers, order them, and set a standing order (2); watch a skill and a lineage develop in the inspector (3); draw a workshop, save its blueprint, stamp it ×2 (4); send an expedition, then possess one villager to stand against the thornback (5, 7); witness the discovery and watch a new job kind appear (6). The harness is green on the same build. This recording is the exit criterion of C3.

## 7. First ten working days (CR25)

Days 1-2: repo, headless sim harness on the provisional stack (GDD §23.12), named RNG streams, state hash. Days 3-4: fixed 20 Hz tick loop and a one-chunk grid. Days 5-7: save round-trip and replay test. Days 8-10: 100 random walkers on a region graph (the C1 microbench) and a text dump of the state hash per 100 ticks.
