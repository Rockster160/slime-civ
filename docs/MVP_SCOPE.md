# MVP Scope

Slime / Dorf Village (working title). Companion to docs/GAME_DESIGN.md §24 and §26 (status DRAFT v0.3, final critique applied), docs/PROTOTYPE_PLAN.md, docs/TECHNICAL_RISKS.md, docs/OPEN_DECISIONS.md.
Canon: notes/phase2/RESOLUTION.md (cuts and rulings R1-R27), notes/phase6/RULINGS.md (K1-K11; Appendix A of the GDD explains every R#/D#/K# cited). Effort numbers are **ASSUMPTION** ranges (D 7.3): one FTE-month ≈ 160 productive hours; a solo/duo hobbyist is ~0.4-0.6 FTE. Time constants follow the Units & clock box in GAME_DESIGN §23 (20 ticks/s, 1 game day = 1800 ticks = 90 s at 1×).

**The test for every line below:** does this make the first planet one cohesive, buildable game? The organising sentence (RESOLUTION, opening): **Autonomy maintains; the player advances.** A feature that does not serve identity, the slice, or a named dependency is in a lower tier.

Definitions (K1). A **checkpoint** is a build someone can play: **C1 "Leaves & Sticks"**, **C2 "First Hut"**, **C3 "Clay & Copper"**. **C3 is the vertical slice**, the time-boxed demonstration of the seven properties (PROTOTYPE_PLAN.md). The **MVP** is the complete, publicly playable first planet: **the slice plus the Essential tier** (§1.1 items not yet built at C3). The full first planet (R26, 30-60 FTE-months) is larger again. All are measured by the same harness.

**Honest effort, in one line (ASSUMPTION).** C1 2-3, C2 +2-3, C3 +3-5: the slice is **7-11 FTE-months**; the MVP is **about 21-40** (computed from line items in §3). The earlier 7-12 band was the slice's budget; D's whole-design line items sum to 25-54.

---

## 1. Features by tier

Each row: feature · source ruling · notes. "S" = in the slice; "M" = MVP but not slice.

### 1.1 Essential to the game's identity (cannot ship without; in the slice unless marked; the rest of the tier is what the MVP adds to the slice)

| Feature | Ruling | Notes |
|---|---|---|
| Villagers as persistent named individuals with needs (hunger, thirst, energy, leisure; **no separate strain meter**, K5), aging and **permadeath** | AGREED; R4 | Design range 6-60, ceiling ~100; slice starts with 6-8 from 2-3 lineages (K3); Gravestone record in Chronicle |
| **Survival economy**: forage, one farm, one hunt, water, spoilage, the demand vector; village-critical needs at need class (K4) | K3, K4 | The mechanism behind "autonomy maintains"; slice has forage + hunt + cold, farming and preservation depth are MVP tier |
| **Genetics**: 9 traits, mixture inheritance + `settle()` soft cap (carried over from slime-village), convex trait upkeep, environment-dependent value, clone limit; genes move output ±25% | R16 | Genes, tools (1.5-5×), skills (≤1.8×) |
| **Skills** from real output, challenge-matched XP, `rested` curve, virgin-block rule; never gate attempts; profession = label | R17 | 3 skills in slice (dig, build, craft) |
| **Autonomy band**: eating, sleeping, hauling, repair, replanting, firewood, healing, fleeing, starter shelters, auto-build blueprints | R8 | Unattended 2-hour survival ≥90% |
| **Job board**: one board, one score; classes critical need > order > standing order > village demand > leisure; **Blockers**; **Why panel** | R5, K4 | Derived jobs (hauling for a blueprint) run at standing class |
| **Orders**: select villagers, right-click a target (the primary gesture, K10); optional named **Crew**; **Standing order** ("keep N" with hysteresis) | R6, R7 | Crew naming and "keep filled to N" are optional UI |
| **Freeform construction** on a 3D grid; supports-first construction sites; partially built is valid | R3, R19 | |
| **Hybrid Rooms**: flood-fill + player Purpose + requirement checklist; graded quality; natural rock counts as roof | R18 | One Purpose in slice (workshop); 3-4 defined |
| **Blueprints**: capture, material classes, rotation, ghost, "stamp ×N", flag auto-build | R19 | Slice: stamp. **Blueprint revision** (push an edited blueprint to existing instances; villagers rebuild the differences, K10) is MVP tier |
| **Destructible terrain, mining by area designation**, delegated **expeditions** (intent, provisions, recall rule) | R27, R6 | Never per-block clicking |
| **Possession** on the same Action/Controller pipeline; Divine inspiration (+10% speed, +15% XP) + Steadfast; no timer; release on collapse only | R9, K7 | **Minimal in C2** (move, interact, same Actions as AI); combat polish in C3. Purpose: stand and fight where AI flees, enter cells the AI refuses, a felt bonus |
| **One emergent discovery chain** via Phenomena, Witness, Tinker; Almanac; Curiosities; per-seed solvability validator | R12, R10, R11, K8 | Slice: fire → fired clay → charcoal → copper (fire is NOT known at the start); MVP: the 12-discovery set (GAME_DESIGN §15.7). Honest framing: an authored graph; the world picks route, timing, who and pressure. Content cost per D14: system 1-1.5 FTE-months, 12-discovery content 10-15 FTE-weeks, full planet 4-8 FTE-months |
| **Chronicle** (firsts, births, deaths, era label) | R14 | ≤1 MB budget |
| **MVP hazard set**: cold, cave-in, bad air, one wounding fauna | R20 | Slice: cold + the thornback; cave-in and bad air are MVP tier |
| **Transport**: hand → basket/box → backpack; stockpile placement | R21 | |
| **Headless harness + exploit bots** | R25 | A feature, not tooling. **Slice bots: absent-player, over-ordering, grind.** Breed-best, possess-swap, max-expansion and playstyle bots: MVP tier |
| **Deterministic core**: fixed tick, named counter-based RNG, command log, state hash, strict sim/render split, seed + sparse-delta save with round-trip test | R23 | |
| **One 3/4 camera** with z-slice cutaway, tight-follow for possession | R2 | |
| **Accessibility baseline**: speeds 1-5× + pause, pause-anything, remappable keys, UI scale, readable text; lineage mark / CVD-safe icons from MVP polish | GAME_DESIGN §19 | |

### 1.2 Important but deferrable (MVP-quality, not slice-critical; build after the MVP or thin in the slice; these are **not** in the §3 MVP range)

| Feature | Ruling | Why deferrable |
|---|---|---|
| Teach as an explicit action with UI (learn-by-proximity only in the slice; Teach is out of the slice, consistently) | R10 | Proximity is slow but sufficient to test craft transmission |
| Leisure XP cap tuning; hobby skills beyond flavour tags | design review 2.6 | Tuning, not capability |
| `rust` (skill decay when idle) | D | Adds specialisation cost only after core feels right |
| Hidden genotype / inbreeding depression | R16 | Only if breed-best bot beats the 1.15× gate |
| Second hazard family; fuller wounding-fauna set | R20 | One set proves the loop |
| Alternate implementations on 2-3 capability slots (e.g. preserving by salt/drying/smoking/cold cellar) | R13 | Slice has one chain; alternates prove "divergent" next |
| Room Purposes beyond workshop (bedroom, storage, kitchen) | R18 | Data, once the checker exists |
| Concerns panel polish, advisory notifications (≤1 per threat class) | D 2.3 | UX |
| Population 20-60 tuning and crew UI at scale | R4 | Slice runs 5-8 |
| Save migrations and chronicle export | OD-25 | Needed before external testers hold long saves |
| Wagon and animal-cart transport tiers: moved to §1.4 (post-MVP, OD-36) | R21 | MVP and slice stop at hand/basket/backpack |
| Relationship tiers beyond family + friend/rival | RESOLUTION cut | |
| Per-seed property perturbation (±10%) | OD-22 | After chain is stable |

### 1.3 Experimental (build only after a named prototype shows it is worth it)

| Feature | Gate | Notes |
|---|---|---|
| **Second renderer** (billboard 2.5D; first-person possession) | Not scheduled; only if P8 (run on its trigger) shows possession flat on the 3/4 camera | R2; 4-8 FTE-months for first-person alone (D, ASSUMPTION) |
| **Collective belief** | P11 shows craft path thin | Rules preserved in OPEN_DECISIONS OD-01; 2-4 FTE-months |
| **Steward** (autonomously choosing from the blueprint library) | P9 shows pathological stagnation | R8 |
| **Ledger auto-promotion** ("you've ordered this 3×") | QoL after P10 | R7 |
| **Offline catch-up** | P14 within ±15% one-sided + first-return test | R22 |
| **Documents/libraries** (preserve familiarity, cap skill ~0.3-0.4) | P12 shows crafts die too often | R10 |
| **Priority matrix** (advanced panel on the same board) | Only if the board is insufficient at 30+ villagers | C 3.6 |
| **Culture traditions as a system** | Chronicle tallies thin | R13/R14 |

### 1.4 Future expansion (planned but explicitly after the first planet is complete)

| Feature | Notes |
|---|---|
| LOD Tier 1-2 and multiple settlements | C 2.12; P14 |
| Postcards (async snapshot visiting) → blueprint exchange → consensual co-op | GAME_DESIGN §20; 6-12+ FTE-months (D) |
| Space: other planets as worlds seeded by the same worldgen | 12-24+ FTE-months (D); never a prerequisite (D4) |
| Species #2 (Dorfs candidate) | 6-12 FTE-months; species is a data table (R15) |
| Wagon → animal cart → rail transport tiers | 2-4 FTE-months (D) |
| Fluids and structural collapse physics | Static water + cave-in spans in MVP |
| Cross-machine determinism (fixed-point/table trig) for lockstep | OD-24 |
| Further tech paths beyond alternates | 4-8 FTE-months each (D) |
| Full combat system | R20; tech review: 3.5-6.5 FTE-months floor for possession incl. hazards |
| Gamepad; screen-reader support | GAME_DESIGN §19 |

### 1.5 Explicitly out of scope (RESOLUTION cuts; do not reopen without a director ruling)

| Item | Reason / ruling |
|---|---|
| **Drones and bot labour; Factorio-style belts** | D3: author's explicit direction; OD-09 for the late-game question |
| **Death-farming / mana-for-deletion** (prm idea) | RESOLUTION: cut entirely. No resource, XP, belief or knowledge arises from death |
| **XP from re-mining placed blocks** | RESOLUTION: cut entirely; virgin bit |
| **Invasion / PvP** in multiplayer | Author: consensual only |
| Rigid Civ-style tech tree; flat % tech bonuses | Brief hard constraint; R14 eras are labels |
| Energy systems, daily chores, timers, streaks, manipulative loops | Brief hard constraint |
| **First-person camera** (as MVP), DQ XI dual view, side-view | R2 (Experimental/post-MVP only) |
| Multiple species, culture as a system, collective belief in MVP | R13, R15 |
| Relationships beyond family + friend/rival; full pairwise graph | RESOLUTION cut; D 2.7 |
| Priority matrix, Ledger auto-promotion, Steward | R5, R7, R8 |
| Structural physics beyond cave-in spans; per-tile temperature/fluids | R20; D 2.7 |
| Per-item-instance records (use stacks + a few named heirlooms) | D 2.7 |
| A wave director / raid scaling | D 2.10; wildlife with needs and environmental hazards |

---

### 1.6 Slice cut list (what C3 deliberately does not build)

Each item retires no named risk and is therefore after C3 (and, where marked, after the MVP): friend/rival relationships, grief, graves, heirlooms and notables (post-C3 flavour; the Gravestone record and personal log stay); culture leanings; alternates on capability slots; lineage view and apprenticeship; CVD lineage palette and lineage marks (MVP polish); ironman flag; four of six systemic events (the slice keeps lightning and smouldering stump); ruins with relics; five of six biomes; hidden genotype; every bot except absent-player, over-ordering and grind; P1 full, P8, P12, P13 remainder, P14, P15, P16 as formal prototypes (triggers in PROTOTYPE_PLAN §4); the second-renderer stub; Teach UI; extra Room Purposes; cave-in and bad air; blueprint revision.

---

## 2. Dependency-aware implementation roadmap

Checkpoints C1-C3 are defined with exit criteria in GAME_DESIGN §26; this section adds the **feature-level dependencies** behind them.

### 2.1 Dependency graph (feature → prerequisite)

```
C1  Harness skeleton + determinism (headless TS core, provisional stack, K9)
      └─ Chunked grid + worldgen + region-graph pathing + save deltas + debug renderer
           └─ Needs / aging / death / species table / survival economy / demand vector
                └─ Action + Controller + job board + reservations
                     ├─ Orders (select + right-click) / standing orders / Blockers -> Why panel
                     └─ Autonomy band (starter shelters, hauling, repair, forage) + cold
C2  Engine decision (before art)  ->  sprite pass
      └─ Construction sites -> Rooms -> Purpose + Station -> Blueprints (stamp)
           └─ Heat/enclosure context (needs Rooms)
      └─ Minimal possession (needs only the Action runner)
C3  Skills/XP + genetics + slice bots
      └─ Phenomena + Witness + Tinker (needs Rooms, skills, materials) -> Almanac + Curiosities + Chronicle firsts
           └─ Evidence-based rediscovery; solvability validator
      └─ Area mining + one expedition type + thornback + possession combat polish
MVP  Essential tier: remaining discoveries, farming/preservation depth, orders at scale + blueprint revision,
     cave-in/bad air/light, biomes, UI + accessibility, art/audio, remaining bots, save migration
```

Key dependency facts:
- **The harness precedes content.** Every balance claim (grind, over-ordering, absent-player) is unfalsifiable without bots; C1 starts with it.
- **World representation precedes camera, heat context and rooms**: the P5 desk spike and throwaway mining+room test run early in C2, before art.
- **Discovery depends on three other substrates** (rooms/heat context, skills, sight-based witnessing) owned by C2 and C3; this is why discovery is last.
- **Possession depends only on the Action runner (C1)**; minimal possession lands in C2 because it is cheap there (K7).
- **Blueprints depend on construction sites and Rooms**; "auto-build" depends on the autonomy band and Blueprints.
- **Standing orders depend on the job board and stock accounting**; expedition provisioning depends on standing orders.

### 2.2 Order of work
C1 (P4, P9, C1 microbench) → fun check → C2 (P5 spike, P6, UI spike, engine decision, P2) → fun check → C3 (heat-function table test first, then P11) → fun check and recorded demonstration → MVP Essential tier → deferred prototypes on their triggers.

---

## 3. Effort estimates (ASSUMPTION ranges; K1)

All figures: FTE-months at **placeholder-grade art** (grey-box to simple 3/4 sprites) unless a line says otherwise. The figures below are computed from line items; they replace the earlier statement that the whole slice fits in 7-12. If the engine is not JS/TS the sim lines carry a 2-3× factor (C/D) and every total rises; that is an input to OD-06 and OD-41.

### 3.1 Checkpoint line items (the slice)

| C | Line item | FTE-mo |
|---|---|---|
| C1 | Harness, determinism, save skeleton, lint bans | 0.4-0.6 |
| C1 | Grid, worldgen, region-graph pathing, debug renderer (surface first) | 0.6-0.9 |
| C1 | Villagers, needs, aging/death, Action/Controller, job board, orders, Blockers + Why | 0.8-1.1 |
| C1 | Survival economy (forage, demand vector, 3-day stock, season), cold hazard, leaf beds | 0.3-0.4 |
| | **C1 total** | **2.1-3.0** |
| C2 | Construction sites, freeform tools, hauling, supports-first | 0.8-1.1 |
| C2 | Rooms + one Purpose + heat/enclosure context | 0.4-0.6 |
| C2 | Blueprints: capture, rotate, ghost, stamp | 0.4-0.6 |
| C2 | Minimal possession (move, interact) | 0.2-0.4 |
| C2 | Build UI and first sprite pass | 0.2-0.3 |
| | **C2 total** | **2.0-3.0** |
| C3 | Skills, genetics, slice bots | 0.7-1.0 |
| C3 | Discovery system (D14) | 1.0-1.5 |
| C3 | Chain content: rows 1, 5, 7, 9 (+6), about 4-6 FTE-weeks of the 10-15 (D14) | 0.9-1.4 |
| C3 | Area mining, one expedition type, thornback, possession combat polish | 0.6-1.1 |
| | **C3 total** | **3.2-5.0** |
| | **Slice cumulative C1+C2+C3** | **7.3-11.0 (about 7-11)** |

### 3.2 Essential-tier line items (what the MVP adds)

| Line item | FTE-mo |
|---|---|
| Remaining eight discoveries of the 12-set (10-15 weeks minus the chain's 4-6 weeks, D14) | 1.4-2.1 |
| Farming, husbandry, preservation depth; flora/fauna lifecycles | 0.8-1.5 |
| Orders at 20-60 villagers, crew UI, transport tiers, blueprint revision | 0.8-1.5 |
| Cave-in, bad air, light; possession polish and feel (rest of the 3.5-6.5 floor, R26) | 2.0-4.0 |
| Two to three biomes, worldgen depth, map-size tuning | 0.6-1.2 |
| UI completion (Concerns, Almanac, digest, remap, accessibility baseline) | 2.0-4.0 |
| Art and audio to a publicly playable standard (D: 3-8 for the whole game) | 2.0-5.0 |
| Remaining bots (breed-best, possess-swap, max-expansion, playstyle), save migration, ironman | 1.4-2.7 |
| **Subtotal** | **11.0-22.0** |
| Rolling playtest and tuning on the above, +20-30% | +2.2 to +6.6 |
| **Essential tier total** | **13.2-28.6 (about 13-29)** |

### 3.3 The MVP range

**MVP = slice (7.3-11.0) + Essential tier (13.2-28.6) = about 21-40 FTE-months (ASSUMPTION).** At 0.5 FTE that is about 3.5-6.5 calendar years; at 1.0 FTE about 1.7-3.3 years. The Important-but-deferrable tier (§1.2) is not in this range. D's whole-design line items sum to 25-54, of which this range keeps the part needed for a cohesive first planet.

**Calendar at 0.5 FTE:** C1 4-6 months; C2 8-12 months cumulative; C3 15-22 months cumulative.

### 3.4 Beyond the MVP (ASSUMPTION)

| Scope | FTE-months |
|---|---|
| Complete first planet (stone → metal → early industry; one path with 2-3 alternates; ~30-60 discoveries; polished UX) | 30-60 (R26) ≈ 5-10 years at hobby pace |
| Second renderer | 3-6; first-person 4-8 |
| Species #2 | 6-12 |
| Each extra full tech path | 4-8 |
| Collective belief | 2-4 + tuning |
| Rail/carriage tier | 2-4 |
| Multiplayer visiting | 6-12+ |
| Space | 12-24+ |

Use the 30-60 figure to **shrink the first planet's content** (fewer eras), not to extend the schedule (D 7.3).

---

## 4. Scope rules (to keep this document honest)
1. A new feature enters the MVP only by replacing something of equal cost or by retiring a named risk (TECHNICAL_RISKS.md).
2. Anything touching possession, discovery or freeform building UX is re-estimated before being scheduled: they are the three largest unbounded costs (D 7.4; both reviews).
3. A feature without a bot or a measurable test does not ship in the MVP.
4. Cuts listed in §1.5 are not reopened by an editor or writer; only the director (or the author for AGREED items) can reopen them.
5. If a checkpoint takes more than 1.5× the top of its range, the response is to cut tier §1.2 items and shrink the slice's content, not to extend the schedule. Re-estimate the remaining checkpoints from the measured velocity of the one just finished.
6. Each checkpoint ends with a fun check (3-5 informal testers: would they keep playing another half hour?). A "no" stops work on the next checkpoint until the cause is fixed.
