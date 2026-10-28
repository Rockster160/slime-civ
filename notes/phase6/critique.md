# Phase 6 adversarial critique: Slime / Dorf Village GDD v0.2

Reviewer: independent Claude Sonnet (role originally allotted to Codex Luna). Did not author any of it.
Read in full: docs/GAME_DESIGN.md (all 2786 lines), MVP_SCOPE, TECHNICAL_RISKS, OPEN_DECISIONS, PROTOTYPE_PLAN.
Skimmed: initial_prompt.txt (brief + Discord log). Consulted notes/existing_material.md only afterwards, and spot-checked
/Users/zoro/code/slime-village (sim line counts and "profession = random pick" at slime.js:185 match the audit).
"§" means GAME_DESIGN section unless a file is named.

---------------------------------------------------------------------------------------------------------

## 1. Cohesive game or several games in a trench coat?

### Verdict

**One cohesive design, sized as roughly three games.** The thesis is coherent and unusually well defended: every
player action ends up as a job on one board (§09), everything physical lives on one grid (§11.3), every capability is a
row in one phenomenon table (§15.2), and the player's gate on advancement is one organising sentence
"Autonomy maintains; the player advances" (§03). But the *cost* is not that of one game, and the document's own
numbers say so. As scoped it is **not buildable by a solo/duo hobbyist**; it becomes buildable only if the slice is
cut about in half and sequenced as playable checkpoints (revisions R1 to R10 below).

### Strongest argument that it IS one game

- A shared-substrate argument that holds up in the text: job board (§09), phenomenon table (§15), room checker
  (§12.5) are the three engines, and §02 "Why it can be built by a small team" says a new capability is a data row.
- A crisp unit of play: "a lack noticed and answered" (§06), delivered by Concerns strip -> Why panel -> order.
- Strong cut discipline: out-of-scope list (MVP_SCOPE §1.5), pillar 10 as an explicit test, "cut-if-not-felt" clauses
  (culture §16.8, belief deferred §16.5).

### Strongest argument that it is several games

- **Five different player skill-sets, each needing its own UI**: RTS-style crew/standing-order management (§07, §09),
  a Minecraft/Terraria-like freeform building tool with a room evaluator (§12), a puzzle-ish discovery layer (§15
  Almanac, Curiosities, near-miss hints), an action-adventure possession layer with light, hazards and melee (§13), and a
  lineage/genetics tending game (§08, §10). Each is the headline feature of a shipped game.
- **The tuning surface is a product, not a sum.** For one slice discovery (copper) to occur, all of these must work: worldgen
  (§11.5), room flood fill (§12.5), heat context (§11.9), a systemic charcoal event (§11.8), mining/expedition (§13.4),
  the sight cache (§13.8), needs/leisure (so someone has free time), the tinker job's board class (unspecified), familiarity
  (§10), witness maths (§15.4), the chronicle. Every failure mode is silent, which is why the plan needs a trace log, a
  validator and P11/P15. That is a lot of machinery to hold one chain up.
- MVP_SCOPE §3 lists D's own line items (sim port 1-2, skills/genetics 0.8-1.7, orders 1.5-3, possession 1-2, world 2-4,
  construction 2-4, blueprints+mining+hazards 4-8, discovery 2-4, knowledge+chronicle 1.5-3, UI 3-6, art/audio 3-8,
  content 2-5, harness 1.5-3). I summed them: **about 25 FTE-months low, 54 high**, before 20-30% playtest overhead.
  The document then asserts 7-12 is "covered by the slice's reductions". A 3-4x reduction is claimed, not shown.
- "Slice" and "MVP" are the same cost band (M0-M7 = 6.5-12 vs MVP 7-12, MVP_SCOPE §3.1 note), so there is no real
  separate slice. The "slice" contains possession, hazards, a 3D destructible grid, genetics with exploit bots,
  freeform rooms, blueprints, expeditions and a discovery chain: that *is* the game.

### Thread trace: construction -> job board -> skills -> discovery -> exploration -> chronicle

Scenario: the player draws a workshop with a kiln, saves it as a blueprint, stamps it x3; someone fires clay, then smelts
copper from malachite found on an expedition; the chronicle records it.

| Step | Where specified | Holds? | Where it breaks |
|---|---|---|---|
| 1. Draw workshop, assign Purpose, checklist | §12.4-12.5, §22 | Mostly | `room_quality` uses `light` and `temperature_fit` (0.15 weight each) but there is no light model for rooms (OD-27 covers only caves) and §11.9/R20 say no temperature sim. Two of five quality terms have no source. |
| 2. Save blueprint, stamp x3 | §12.6, §07 table | Data model holds | The board class of blueprint jobs is never stated (§07 says only "batch of ghost-build jobs"). §09 "Priority inversion" says haul jobs *inherit the consumer's class*. If stamps are "player order" (300), their hauling outranks standing orders (200) and the village-demand class (100) that runs foraging/farming. |
| 3. Board assigns builders | §09 score | Breaks | (a) The text says the within-class band is "+/-60 at most, so classes never overlap". The formula actually spans about -45 to +70 (max 40+15+10+5=70; min 0-20-25=-45), so a standing order (200+70=270) can beat an order (300-45=255). (b) Orders at 300 beat food production at 100 until hunger u>=0.75 (about hunger 0.19). "A starving village told to build still eats first" only works if food already exists; the worked example itself admits "no food in reach; Mira is still on the order". Nobody forages because forage is class 100. This is the main way the organising rule fails. |
| 4. Builders gain Build XP | §10 | Formula holds | `valueOfOutput` has no units. `rested = 1/(1+worked/4h)` halves XP after 4 game hours, so rotation is the optimum (the one-skill bot must be <=70% of rotation, metric 3c). Autonomous crews do not rotate; either the player babysits rotation (a chore) or everyone is a slightly-worse generalist. |
| 5. Who gets the specialist job? | §09 score | Weak | `skillFit` is 15 points of a ~70 point band; `pathCost` alone reaches 20 and proximity 10. The nearest idle villager wins, not the best. With no positive feedback, XP spreads evenly and no scarce "master" emerges, so craft loss (P12 FAIL condition: "skill-only shows no knowledge-loss events at normal mortality") may never occur. |
| 6. Kiln fires clay | §11.9, §15.5.1 | Holds | Heat level 2 daub-by-hearth is a plausible, charming accident. |
| 7. Smelting copper | §15.5.2, §11.9 | Breaks | SMELT_COPPER needs `enclosed` and heat>=4 from "clay-lined pit + charcoal + draft 1.3 on a ridge". But §11.9 says an enclosed hall has draft 0.6 and "a 1-cell closet cannot exceed level 3". A clay-lined pit is a 1-cell enclosure. The heat function (`fuel.heat_value x draft x insulation, quantised`) has no numbers, yet P2 requires "28/30 hand-computed matches". The crux of the slice chain is not computable from the text. |
| 8. Someone tinkers | §15.4 | Breaks | "tinker is a normal board job" with no class. If it is "personal leisure" (0) it always loses to hauling (100); if "village demand" (100) it competes with food. The 4-6 day discovery cadence (P11) hangs on this. |
| 9. Malachite from an expedition | §13.4, §11.5 | Holds | The R27 link from exploration to Curiosity to itch is explicit and good. But slice mining needs stone tools (§11.5 soft rock) and KNAP_STONE (row 2) is not in the slice chain: starting capabilities are undefined. |
| 10. Chronicle + era label | §18, §15.8 | Holds well | Typed event ring -> template text is cheap and clean. But the "Copper age" signature is cumulative ("+ SMELT_COPPER" on top of Hearth/Stone/Clay), so with only rows 1,5,7,9 the label cannot fire unless Stone is a starting capability. |

Net: the thread holds at the **data/event layer** (chronicle, phenomenon rows, Curiosities) and breaks at the **control
layer** (board classes, starvation under orders), the **physical layer** (heat/draft/closet), and the **incentive layer**
(rotation + weak skillFit produce egalitarian skills, defeating the permadeath/craft-loss stakes).

---------------------------------------------------------------------------------------------------------

## 2. The five largest risks to finishing

### Risk 1: The estimate is not credible and the process around it is heavy (TR-22 is right but understated)

- **Why.** 7-12 FTE-months vs a 25-54 sum of the doc's own line items. Hobby pace 0.4-0.6 FTE turns 7-12 into 12-30
  calendar months at the *optimistic* end and 4-10 years at the line-item sum (the doc itself says 5-10 years for the full
  planet, MVP_SCOPE §3.1). On top of that the plan adds 16 prototypes, about 100 numeric acceptance criteria, five human
  test panels (n=5 or n=10 outsiders; "the author is not a tester"), 9 exploit bots, and a CVD sort test. For a hobbyist
  the *validation apparatus* may exceed the game.
- **Mitigation (cut/simplify).** (a) Re-baseline in calendar months at 0.5 FTE. (b) Define 3 playable checkpoints with
  a hard fun-check at each (R7). (c) Cut a listed set from the slice (R8). (d) Replace outsider panels with "author +
  2 friends, qualitative" except the Why-panel truthfulness check, which is auto-checkable. (e) Keep only the bots that gate
  design decisions: idle, over-ordering, grind, breed-best, possess-swap.
- **Doc change.** MVP_SCOPE §3, §3.1, §4; GAME_DESIGN §24-§27; PROTOTYPE_PLAN §1, §4, §5.

### Risk 2: The slice's one discovery chain is under-specified at exactly the point where it must be computed

- **Why.** Heat/draft/enclosure contradictions (thread step 7), no light/temperature source for room quality, no tinker
  job class, undefined starting capabilities, and the soft-lock rescue (charcoal) depends on two more mechanisms
  (systemic event + validator). Content cost estimates disagree 4x: §15.7 says 10-15 FTE-**weeks** for twelve discoveries,
  TR-23 says 8-15 FTE-**months** for ten (acknowledged unreconciled in a footnote). USP claim #1 rests on it and "no
  comparable game has shipped it well" (§27 rank 2).
- **Early warning.** Hand-computed context disagrees in more than 2/30 builds; the trace log needs a manual to read; the
  author finds themself force-firing the debug command to reach the chain.
- **Mitigation.** Build the copper chain *first as a headless table test with exactly one route* (one clay source, one
  charcoal source, one ridge). Then add second routes. Write the heat function with numbers before any renderer exists.
  Treat "emergent" as: route chosen by the world, content authored by hand (be honest, R13).
- **Doc change.** §11.9, §15.3-15.5, §15.7; PROTOTYPE_PLAN P2, P11; MVP_SCOPE §3 (discovery row).

### Risk 3: "Autonomy maintains" is not yet a mechanism: the survival economy and the board's class design are unspecified or leaky

- **Why.** There is no section for food, water, farming, foraging, hunting, cooking, or the demand vector (§09 calls it
  "carried over, rewritten per this game's resources" and never lists keys). The slice cannot be started without them,
  and Property 1 (unattended survival >=90%) depends on them entirely. Separately, orders, standing orders and blueprint
  hauling can starve production (thread step 3), and `strain` may punish any sustained order (R5). No effort line in M1-M7
  covers flora/fauna lifecycles or farming although "whole-world lifecycles" is AGREED (§11.8).
- **Early warning.** In the first P9 sweep, "starving village told to build" survives only when the larder is stocked;
  a 6-villager seed with a stamp x3 order collapses on food.
- **Mitigation.** Write a half-page "Survival economy" (3 food sources, 1 water source, 1 shelter chain, numbers) and the
  demand vector (6-8 keys). Add a settlement-level reserve: when larder runway < N game days, food production jobs are
  promoted to the critical-need class regardless of orders. Cap the hands an order may take (e.g. 70%).
- **Doc change.** New §09.x "Demand vector and survival economy"; §09 score table; §14 (add food chain); MVP_SCOPE (add M1/M2
  effort line for flora/fauna/farming).

### Risk 4: 3D destructible grid + freeform building UX + readable slices (TR-01, -05, -08, -13, -25) is the biggest unbounded cost, and P5 doubles it

- **Why.** P5 asks the author to implement the three slice scenarios in **both** layered-2D and 3D "at grey-box" before
  choosing: that is two M1s. The brief never asks for multi-storey; it asks for caves, mines and freeform buildings. Add
  structural span rules (§12.3), Room flood fill in 6-connected 3D, a supports-first DAG, the door-last rule, waves of ghost
  jobs and self-walling tests: a Dwarf Fortress UX problem on top of a RimWorld sim.
- **Early warning.** Testers (or the author) cannot place a door without help; M3 slips past 2x; roofs flicker.
- **Mitigation.** Time-box P5 to a paper/LOC exercise plus one grey-box in the *preferred* model (3D, since the doc
  already prefers it) with a hard stop; make span rules advisory for buildings and real only underground; limit slice
  buildings to 2 levels.
- **Doc change.** PROTOTYPE_PLAN P5, P6; GAME_DESIGN §12.3, §23.4; TECHNICAL_RISKS §2.4.

### Risk 5: Possession costs 3.5-6.5 FTE-months (up to half the MVP band), is delivered last, and is designed to be nearly pointless

- **Why.** The buff is +10% speed and +15% XP, capped at 2x game speed (so the village slows while you play), with no yield
  bonus, and Steadfast *removes* the one survival behaviour (fleeing) which, with one-or-two-hit combat, mostly raises
  death risk. The author's stated want ("an extra push... defeat a difficult enemy", Discord) has no difficult enemy to
  defeat: one wounding fauna (§13.6). The acceptance window is narrow and two-sided: >=30% fewer losses than delegated
  (5d) but death rate >=0.5x AI (7c), delegated still >=70% (5d), and <40% = mandatory. And the first real feedback arrives
  at M6, after most of the effort is spent.
- **Early warning.** Testers decline to possess after the first try; possession is used only to "rescue" after a Why-panel
  stall; or the 1.25x output band is exceeded by a trivial exploit.
- **Mitigation.** Move a tiny possession toy (move, dig, place, release; no melee, no hazards) to M2/M3 on the Action runner
  (cheap, and proves P3). Give possession a structural niche instead of a number: delegated crews refuse `airpocket` /
  `unsafe` cells (already in §13.3), so only possession enters them; pair with a rare find there. Defer melee, fauna and
  light until after the slice.
- **Doc change.** §07 Possession table, §13.5-13.7, §26 M6; PROTOTYPE_PLAN P8; MVP_SCOPE §1.1.

---------------------------------------------------------------------------------------------------------

## 3. Where the GDD still violates its own rules

### 3.1 Vague or missing mechanics (the foundations, not the garnish)

The text is numerically dense (61 ASSUMPTION tags) but the numbers cluster around mid-layer systems while foundations
are missing:

- **Time units are inconsistent with the pacing anchor.** §01: 1 game day = 90 real seconds at 1x (10-hour life, 100 days
  per year). At 20 Hz that is **1800 ticks per game day**, so a "game minute" is about 1.25 ticks and a "game second" is
  a fraction of a tick. Yet §09 uses `switchCost` held for "20 game minutes" (about 1.25 real seconds), reservations
  with a 30-game-second grace, re-planning every "10 game seconds", BAKE_CLAY "duration >= 1 hour" (3.75 s), the vignette
  "Forty game minutes later the report arrives" (about 2.5 s), and PROTOTYPE_PLAN "3-8 game minutes at 1x" for
  time-to-landmark. Either days are not 24 game-hours or every minute-scale constant is two orders off. A developer
  hits this on day 1.
- **No survival economy.** Grep for farm/crop/forage/hunt/water finds only passing mentions (§11.8, §16.3, the §22 Why-panel
  example "farm plot not planted"). No farming mechanic, no cooking, no water source, no food numbers.
- **No demand vector spec.** The one feeder that makes "autonomy maintains" real (§09, feeder 3) is deferred to
  slime-village's code. Keys appear sporadically (`keep_food`, `tool_edge`, `carry_water`, `warmth`) but are never listed.
- **No starting state.** What the founders know (FIRE_TENDING? KNAP_STONE?), carry, and the first ten minutes of the map
  are nowhere. §06's vignette starts at hour 2.
- **`valueOfOutput`, `difficulty(task)`, `novelty`** (XP formula §10) have no definitions or units.
- **`room_quality`** terms `light` and `temperature_fit` have no computation (thread step 1); `size_fit` "ideal" has no
  value; the `mood` need (OD-28) has "~6 causes" unlisted yet grief modifies mood (§18).
- **Heat function** has no numbers; the level table (§11.9) is assertion.
- **Tinker job class** and the "free time" trigger are unspecified (§15.4).
- **Blueprint job class**, and **strain accrual rules** (does `keep N` count as "commanded"? §07 says commanded villagers
  accrue no leisure and "a crew held for weeks becomes tired and sick"; three game weeks is about 31 real minutes).

### 3.2 Items presented as MVP/slice that should not be (or are mismatched)

- Slice-listed or MVP-listed but not on the critical path to a finished, fun loop: friend/rival relationships + grief +
  graves + heirlooms + notables (§08, §18); culture leanings (§16.3, self-described as "the first thing cut"); lineage view
  and apprenticeship (§10); alternates on 2-3 slots (§16.4); ironman flag (§18); CVD lineage palette and lineage marks (§19);
  six systemic events (§11.8) where two (lightning, smouldering stump) serve the slice; six biomes (§11.4) where the slice
  says "one biome plus caves" (PROTOTYPE_PLAN §1); ruins with relics (§13.9); chronicle compaction (§18);
  Concerns/Notables/Overlays/Ghost-queue panels (§22) where five panels would do; seven playstyle profiles each with
  progression (§19).
- **Second-renderer stub in P6** contradicts the author's "cameras are hard enough to balance" and OD-03 default (a):
  work is scheduled for something that is Experimental/post-MVP.
- **Teach** is MVP in the §10 MVP table and §10 Player experience ("Teach is a command the player can give") but deferrable
  in MVP_SCOPE §1.2 and M4 ("Teach action exists, UI follows the slice").
- **"MVP" vs "slice"**: MVP_SCOPE §3.1 gives the same 7-12 for slice + deferred tier + alternates + multi-Purpose Rooms.
  These cannot both fit; the doc concedes "the band moves" in a footnote.
- **Flora/fauna lifecycles and farming** are AGREED and in the §11 MVP list but appear in no milestone's "Builds" cell.

### 3.3 Micromanagement and chore generators (against pillars 6/7 and "delegation over micromanagement")

- **Rested curve rotation** (§10): rotation of skills is the stated optimum; autonomous crews will not rotate. Either the
  player manages rotation (chore) or the incentive is dead. With metric 3c this is a *designed* micromanagement optimum.
- **Strain** (§07, §08): "a crew held on a task for weeks becomes tired and sick". At a 1.5-minute day, "weeks" is under an
  hour of play. "Keep 200 lumber" will burn out whoever staffs it unless strain explicitly excludes standing orders (it
  does not say).
- **Craft custody**: "a warning fires when holders drop to one" (§10) turns every craft into a recurring duty. Twelve crafts
  x a 10-hour life means a pairing/Teach decision every hour or two. "Players protect scarce holders by pairing them" is
  chore-by-design even though rediscovery is cheap.
- **Research levers**: "the player decides who tinkers where" (§22), "commission an experiment" (§15.10), priorities,
  provisioning, possession, explorers, apprentices: six levers where the brief asked for "player priorities".
- **Ghost queue with player-driven expiry**, painted stockpile zones with allowed classes, per-resource standing orders,
  edited provisions rules: the Factorio-lite administration the author said to avoid.
- **Crew ceremony**: Make crew, names, control groups, "keep filled to N", stall summaries, expedition recall edits. The
  author's phrase was "you 5, go harvest lumber".

### 3.4 Possession: mandatory, optimal, or pointless?

- **Not mandatory: yes.** Delegated must reach target >=70% (5d). Good.
- **Not optimal: yes**, by an output cap (1.25x) and no yield bonus.
- **Pointless: likely.** (a) The opportunity cost is "the board loses a worker", 1 of 6-60: negligible. (b) The real cost is
  *player* real time (2x cap, village slows), not sim cost. (c) Gains are +10%/+15%, below the perception threshold the
  doc itself worries about (TR-32; P8 needs >=7/10 to perceive). (d) The narrow edge is *judgment in caves*, which matters
  only in the single hazard area. (e) Steadfast can increase deaths, so the "buff" is arguably a debuff in a cave-in.
  The doc's own P8 FAIL condition "no measurable edge (pointless)" is the probable outcome unless a structural niche
  (unique access to `unsafe` cells, precise placement, rescue) is given. The cheapest fix is R10.

### 3.5 Rigid tech-tree creep

- §15.7 is a 12-row DAG ("Needs" -> "Opens"), with an era signature table (§15.8) and building progression tables
  (§12.10, §14.10) that read as a tree with the research button replaced by a dice roll. §15.2 "A capability... lists exactly
  which recipes, building parts and orders it enables" is the definition of a tech-tree node. Full scope: 110-130
  phenomena.
- The honest framing is "no research screen; hand-authored graph with fuzzy, world-chosen edges". The "no tech tree" USP
  wording (§01, §02, §03 constraint table) over-claims. This is not a design defect; it is a candour defect towards the
  author, who said "do NOT implement a rigid Civilization-style tree".
- Building-gated unlocks the author described ("once you build certain buildings it unlocks more advanced buildings and
  upgrades existing ones") are absent; "upgrade existing" does not exist at all (blueprints re-stamp only).

### 3.6 Duplicated or overlapping systems

| Overlap | Where | Suggested merge |
|---|---|---|
| Familiarity per craft vs skill XP per skill | §10, §15.2 ("one layer" but still two scalars) | One scalar per craft |
| Crew vs expedition vs "keep filled to N" vs Steward vs auto-build flag | §07, §09, §13.4 | Crew + keep-N + one recall rule; defer Steward and "keep filled" |
| Strain vs hardship vs grief vs mood vs leisure debt | §08, §18 | Strain + mood only in the slice |
| Curiosities vs itch vs near-miss vs silhouettes vs pressure/focus | §15.4-15.6 | Curiosity = itch, hint = near-miss; drop silhouettes |
| Watching vs observation learning vs witnessing vs Teach vs Apprenticeship | §10, §15.4 | Proximity + Teach only |
| Chronicle vs VillagerRecord vs personal log vs graves vs heirlooms vs Notables | §08, §18 | Chronicle + personal log |
| Genetic guards: convex upkeep, environment value, clone limit, hidden genotype, bounded effect | §08 (five guards) | Slice: bounded effect + convex upkeep + clone limit |
| Repetition across docs: recall rule x4 (§07, §13.4, §19.5, plan), possession table x3 (§07, §13.5, §19.4), world representation x3 (§11.3, §23.4, TR §2), seven properties x3 (§25, PROTOTYPE_PLAN §3, §26), risks x2 (§27, TR) | across docs | Single source + pointer |

---------------------------------------------------------------------------------------------------------

## 4. Drift from the author's stated wishes (Discord and brief)

| Author wish | GDD status | Drift |
|---|---|---|
| "You 5, go harvest lumber" (assign tasks, not control) | Present (Crew, §07) | **Over-built.** Becomes Make crew + name + default task + stall summary + control group + optional refill rule + strain warnings. An unspecified penalty (strain) punishes the exact order the author used as the example. |
| "Maintain 200 lumber" | Present (standing order with hysteresis, §09) | Fine in itself, but it is class 200 and can be crowded out by blueprint hauling (class 300). |
| Freeform building; take the blueprint; "build 10 more of these houses" | Present (§12, R18/R19) | Preserved in spirit. **Added friction the author did not ask for**: Purpose zoning + checklist + 5-term quality formula + material classes + supports/span limits + door-last + job waves + pending-site caps. Span limits (`plank 3, log 4, stone 5`) block big halls and are exactly the "more realistic is not more fun" trap in the brief. |
| "You, build a bakery right here" + StarCraft unlocks ("build certain buildings unlocks advanced buildings and upgrades existing ones") | Replaced by capability-gated palette via discovery | **Deliberate (pillar 5), but "upgrade existing ones" is lost entirely** and the building-prerequisite flavour is removed. Record as a decision, or add "replace with a higher-class blueprint" as an upgrade verb. |
| Possession with divine-inspiration buff; "extra push or defeat a difficult enemy" | Present (+10%/+15%, Steadfast) | **Diluted.** No difficult enemy exists (one fauna; combat is 1-2 hits); the buff is below perception; Steadfast adds risk. The felt push the author wanted is not delivered. |
| Retain the same view; cameras are hard; DQ XI dual view and Delver sprites were ideas | One 3/4 camera chosen (R2) | Direction honoured. **But** the doc spends a 12-row alternatives table in §07, a 5-column comparison in TR §2, a prototype stub (P6) and a "second renderer" tier on views the author called hard. Cut. Also "one camera" here is a 3/4 *oblique z-slice*, a stronger commitment than the Discord's "same view types". |
| Stats + experience, no point allocation; capped genetic prowess against min-max | Strongly present | Preserved. Complexity added beyond "base stats + experience": derived aptitude, potential ceiling, familiarity, rested curve, virgin bit, challenge-matched XP, leisure XP. Fine in principle, heavy on knobs. |
| Mutation: average-ish with sudden excel/weakness | Present (mixture + 4% sports) | Good. The 4% sport is a new rule the mixture already roughly covers (§08 says so). |
| Permadeath ("send your max-level miner into the woods... gone forever") | Strongly present | Preserved. But with skills rotating and `skillFit` weak, there may be no "max-level miner" (thread step 5). The story the author quoted may not form. |
| Eras: leaves -> teepee (hide) -> cabin (wood) -> rock/brick -> metals -> space | Labels Hearth/Stone/Clay/Timber/Copper/Iron (§15.8) | **Drift.** No hide/teepee stage (HIDE_WORKING exists as row 3 but §12.10 lists no hide shelter). Era names are archaeological, not the author's shelter-led progression. First-planet endpoint is "early industry", not "space-age", which is fine for scope but should be said. |
| No belts, no drones; manual with machinery; hand -> box -> backpack -> wagon -> horse carriage -> train | Strongly present (D3, R21) | Preserved exactly, including the ladder. |
| Whole-world lifecycles (plants and animals age and die) | AGREED, carried over (§11.8) | Present in text; **not costed** in any milestone, and no farming/forage/hunt spec exists. |
| Space as later expansion; visiting others' planets | Present (§20) | Preserved, but §20 is long for something "not a prerequisite"; keep the 7-point core checklist only. |
| Brief: "prefer systemic depth over feature quantity... do not confuse a large feature list with a compelling game" | Philosophy stated | **Self-violated** by feature count in a "minimal" slice (genetics + skills + familiarity + rooms + phenomena + culture + hazards + chronicle + accessibility palette + ironman + relationships). |

---------------------------------------------------------------------------------------------------------

## 5. Readability: is this usable by a developer?

### What a developer cannot do tomorrow

1. **Pick a language.** M0 (harness, RNG, hash, save skeleton) and M1 (grid, pathing, P1/P5/P6) are written *before* the
   engine gate (OD-06: "after P1, P4, P6 and a UI spike"), but those prototypes need a language and a renderer. Roughly
   1.5-3 FTE-months go into code whose host is undecided. The doc's own numbers (1-2 vs 4-6 FTE-months of reuse) favour the
   author's JS/TS; a provisional stack with a "headless sim" guarantee is enough to start.
2. **Know the start state** (founders, inventory, known capabilities, map). Not defined.
3. **Know the time unit** (see 3.1).
4. **Implement the demand vector, food/water, heat function, `valueOfOutput`, tinker class, blueprint class.**
5. **List content.** "~12 materials, ~25 entities, ~15 recipes, ~8 shapes, ~6 phenomena" are counts, never enumerated.
6. **Know the job kinds and skill list with difficulties.** `difficulty(task)` is the heart of the XP formula.
7. **Find the rationale.** Citations to R#, D#, "tech review item 11", "D 2.5", "C 2.10", "B13" refer to notes/ files the
   developer must also read. A developer should not need notes/phase2/RESOLUTION.md to learn what R5 means.
8. **See a day-1 task list.** PROTOTYPE_PLAN gives prototype order but not "the first ten working days".

### What could be cut from the documents themselves (target: GDD about 1500 lines plus an appendix)

- §04 comparable games (keep 5 of 20), §05 beats, §16.5 belief, §20 beyond its 7-item checklist, §21 audio/era look, §23.10
  candidates table, §19 profiles (one table plus the synergy matrix).
- §25 duplicates PROTOTYPE_PLAN §3; §26 duplicates MVP_SCOPE §3. Keep one each. Move R#/D# trace to an appendix.

---------------------------------------------------------------------------------------------------------

## 6. Prioritised revision instructions

Format: ID [priority] location -> change -> reason. 10 MUST, 9 SHOULD, 4 COULD.

**R1 [MUST]** GAME_DESIGN §01 Starting-point facts + §09 + §10 + §11.8 + PROTOTYPE_PLAN §3 -> Define time units once
(ticks per game hour and per day; 1800 ticks/day at 20 Hz) and rewrite every "game second/minute/hour" constant
(`switchCost` 20 min, grace 30 s, re-plan 10 s, BAKE_CLAY 1 h, rested 4 h, expedition 40 min, landmark 3-8 min).
Reason: constants as written are about 100x off the pacing anchor; a developer hits this on day 1.

**R2 [MUST]** New GAME_DESIGN §09.x "Demand vector and survival economy" (and a food chain in §14) -> list 6-8 demand keys with
formulas; define food (forage, one farm, one hunt), water, shelter chain, spoilage numbers; add flora/fauna/farming to a
milestone's "Builds" and effort. Reason: Property 1 (unattended survival) and the organising rule depend on it; currently
only "carried over".

**R3 [MUST]** New GAME_DESIGN §25.x "Start of game" -> founders (count, traits generated how), inventory, known capabilities
(decide: FIRE_TENDING and KNAP_STONE known), first map, first ten minutes. Reason: era labels, tool requirements and mining
depth depend on it; the chain currently cannot produce "Copper age".

**R4 [MUST]** GAME_DESIGN §09 score function + failure table + §07 Orders -> (a) correct "within-class band +/-60" (actual
-45..+70) or clamp `within` so classes cannot overlap; (b) state the board class of blueprint jobs and derived haul jobs;
(c) add a settlement-level reserve: when larder runway < N game days, food-production jobs are promoted to the critical
class, and one order may claim at most 70% of hands; (d) add a P9 case with an empty larder. Reason: current rules let a
stamp x10 starve the village (thread step 3).

**R5 [MUST]** GAME_DESIGN §07 Orders and §08 Needs (strain) -> state exactly which commands accrue strain (player orders only,
not standing orders), its accrual in real minutes at 1x, and the sickness threshold; remove "three weeks" or rescale to
play time. Reason: the ambiguity decides whether "keep 200 lumber" is a chore trap; it contradicts "you 5, harvest lumber".

**R6 [MUST]** GAME_DESIGN §10 rested curve + §09 `skillFit` + station worker slots -> make specialisation emerge: raise
`skillFit` weight for craft/station jobs or assign station worker slots to the best-skilled; restrict the rested curve to
detecting low-novelty loops rather than penalising a day of honest work; update metric 3c. Reason: current numbers produce
egalitarian generalists, which deletes master miners and craft loss (thread steps 4-5).

**R7 [MUST]** MVP_SCOPE §3, §3.1, §4 and GAME_DESIGN §24, §26, §27 rank 1 -> re-baseline effort in calendar months at 0.5 FTE;
show the arithmetic from D's line items to 7-12 or admit 25-54; define three playable checkpoints with a go/no-go "is this fun
to play for an hour": CP1 after M3 (village + build + stamp + keep-N), CP2 after M5 (skills + discovery), CP3 after M6
(exploration + possession). Reason: today a 12-month slip is undetectable until M7.

**R8 [MUST]** MVP_SCOPE §1.1-1.2 and PROTOTYPE_PLAN §1 -> publish an explicit slice cut list: friend/rival + grief + graves +
heirlooms + notables, culture leanings, alternates, lineage view + apprenticeship, CVD lineage palette, ironman, 4 of 6
systemic events, ruins, 5 of 6 biomes, hidden genotype, all but 5 bots, P14, the second-renderer stub (P6). Reason: scope is
risk 1; these items retire no named risk.

**R9 [MUST]** GAME_DESIGN §23.10 + OPEN_DECISIONS OD-06 + PROTOTYPE_PLAN §5 gate -> record a **provisional stack** (e.g.
TypeScript headless sim + Canvas/Pixi view) to start M0, reversible because the sim is headless; keep E1-E12 as the revisit
criteria. Reason: M0 and M1 cannot be written in an unchosen language; the doc's own reuse figures favour JS.

**R10 [MUST]** GAME_DESIGN §07 Possession, §13.5-13.7, §26 M6, PROTOTYPE_PLAN P8 -> (a) pull a possession toy (move, dig,
place, release) forward to M2/M3 on the Action runner; (b) give possession a structural niche: delegated crews refuse
`airpocket`/`unsafe` cells and some finds sit only there; (c) defer melee, fauna and light until after CP3; (d) widen the P8
band or state its single decisive test (does the tester choose to possess a second time?). Reason: highest cost, lowest
evidence, latest feedback.

**R11 [SHOULD]** GAME_DESIGN §11.9, §15.3-15.5.2 -> write the numeric heat function; resolve "clay-lined pit vs 1-cell closet
cap 3 vs enclosed vs draft 0.6 in a hall"; add light and temperature sources for `room_quality` (or drop those two terms from
the slice). Reason: P2's "28/30 hand-computed" cannot be evaluated without it.

**R12 [SHOULD]** GAME_DESIGN §15.4 + §09 -> state the board class and free-time trigger of `tinker`; define `tinker aptitude`
while leisure XP is flavour-only. Reason: sets the 3-8 day discovery cadence.

**R13 [SHOULD]** GAME_DESIGN §01, §02 USP #1, §03 constraint table, §15.2 -> reword "no tech tree" to "no research screen;
hand-authored graph whose edges the world, not the player, selects"; reconcile the §15.7 cost (weeks) with TR-23 (months).
Reason: candour with the author; the document already contains the graph.

**R14 [SHOULD]** GAME_DESIGN §12.3 span rules, §12.12 -> make spans advisory for building (visible warning, no refusal) and
real only in mines and caves; cap slice buildings at two levels. Reason: protects the freeform promise; trims the realism the
brief warned against.

**R15 [SHOULD]** GAME_DESIGN §10 Familiarity + §15.2 + MVP_SCOPE §1.2 -> collapse to one scalar per craft (skill > 0 means
"can attempt", skill sets quality and speed) or justify the second number in one paragraph; make Teach consistent (in or out of
the slice). Reason: removes a duplicate layer and a visible contradiction.

**R16 [SHOULD]** GAME_DESIGN §07 Crews + §13.4 -> simplify to "select N, assign task" with optional naming; one definition of the
recall rule referenced elsewhere; defer "keep filled to N" and control-group UI. Reason: matches the author's "you 5, go harvest
lumber" and removes four copies of the rule.

**R17 [SHOULD]** PROTOTYPE_PLAN P5, P6, §2 test panels -> P5 becomes a one-week paper/LOC exercise plus one grey-box in the
preferred model; delete the billboard stub from P6; replace outsider panels (n=5/n=10) with the author plus two friends, except
for the auto-checked Why-panel test. Reason: removes duplicated M1 work and the one-camera contradiction.

**R18 [SHOULD]** GAME_DESIGN §15.8, §12.10, §21 era table -> add the author's shelter progression (leaf bed, hide teepee, timber
cabin, brick, metal) as the visible axis of era labels, or log the deviation in notes/DECISION_LOG.md; add an "upgrade in
place" verb (swap material class on an existing building) or log its rejection. Reason: two Discord wishes currently lost
silently.

**R19 [SHOULD]** New docs/CONTENT_TABLES.md (or GDD appendix) -> enumerate the 12 materials, 8 shapes, 25 entities, 15 recipes,
job kinds, skills with `difficulty(task)`, and the 6 slice phenomena with numbers. Reason: M1 cannot begin without the lists.

**R20 [COULD]** GAME_DESIGN whole -> move R#/D#/tech-review citations to an appendix; add a one-page glossary (job, order, crew,
capability, craft, familiarity, curiosity, phenomenon, station, room, purpose, blueprint); remove duplicated tables (§25/§26 vs
other files). Reason: a developer should not need notes/ to read the GDD; target about 1500 lines.

**R22 [COULD]** GAME_DESIGN §18 grief/graves/heirlooms/notables -> move to a "post-CP3 flavour" list; keep chronicle, personal
log and permadeath. Reason: texture, not a system the slice needs.

**R23 [COULD]** GAME_DESIGN §08 guards -> keep three (bounded effect, convex upkeep, clone limit) in the body; move hidden
genotype and inbreeding depression to OPEN_DECISIONS only. Reason: the bot gate already tests whether more is needed.

**R25 [COULD]** PROTOTYPE_PLAN new §7 "First ten working days": days 1-2 repo + sim harness + RNG streams + hash; days 3-4 fixed
tick loop and one-chunk grid; days 5-7 save round-trip; days 8-10 100 random-walkers on a region graph. Reason: gives the
developer a Monday morning.

---------------------------------------------------------------------------------------------------------

## Counts and closing remark

- Revisions: 23 total; **MUST 10 (R1 to R10)**, SHOULD 9 (R11 to R19), COULD 4 (R20, R22, R23, R25).
