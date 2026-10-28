## 11. World Generation & Environmental Simulation

Status key: AGREED (author), DECIDED (director ruling R#), PROPOSED (new mechanic in this document). Numbers are starting values; ASSUMPTION marks anything not yet validated. Prototype ids (P#) are the phase-gate prototypes named in RESOLUTION.

### 11.1 Purpose

The world is the source of every constraint the player works against: what can be built where, what can be dug, what burns, what freezes, what is missing. Difficulty comes from **environment and logistics** (what is available, what it costs to move, what the season does to it), never from raw distance or depth. A copper seam 40 cells down is not harder than one 4 cells down; it is harder only if the route to it is unsupported, wet, cold or foul-aired, or if hauling the ore home needs a transport tier the settlement does not have yet.

The world must also be **solvable**: every seed is checked at generation time so that the capability chain in §15 can be reached from bare hands (§11.9).

### 11.2 Player experience

- The map starts as fog (see §13.8); the first hour is a small clearing, a stream, a stand of trees.
- The player reads the land as a set of constraints: "the clay is on the far bank", "this ridge is windy", "the cave breathes cold", "winter is long here".
- Seasons are felt as pressure on food, fuel and warmth, not as a calendar chore.
- The world keeps living with or without the player: trees seed, herds breed and starve, old animals die, a lightning strike burns a meadow. None of it is scripted at the player.
- Digging reveals geology; strata and veins have a readable logic (§11.5), so "follow the green stain" is a reasonable thing to say.

### 11.3 Mechanics: world representation

**DECIDED (R3).** The simulation world is a **3D integer cell grid with z-levels** (Dwarf-Fortress-like), stored in 16x16x16 chunks, about 2 bytes per cell (material id + state byte), with sparse per-cell extras (hit points of a cell being mined, construction state). MVP map is about 128 x 128 x 24 cells (about 393k cells, under 1 MB of dense data). Terrain is destructible: mining sets a cell to air and drops an item; building writes a cell.

It is **rendered as z-slices, not voxels** (R2): current level plus a dimmed level below, roof/wall cutaway, ghost of the level above. The renderer is replaceable; the sim does not know about it.

Alternatives evaluated (R3 requires they appear in the GDD; full comparison and prototype P-"layered-2D vs 3D grid on the slice" decide the final call):

| Option | What it is | Verdict for this game |
|---|---|---|
| A. 3D cell grid, z-sliced render (chosen) | DF/RimWorld hybrid; one grid, many levels | Gives caves, basements, multi-storey rooms, destructible ground, and rect-drag orders at 2D-sim cost. Chosen DEFAULT. |
| B. Layered 2D (surface + a few underground sheets) | Cheaper rooms/heat/pathing; no overhangs | Cheaper by an ASSUMED 50%; cannot express a two-storey house or a mine under a house. Kept as the fallback if the prototype shows 3D cost is not recoverable. |
| C. Side-view 2D (Terraria) | One-cell-deep world | Rejected: a 50-villager settlement degenerates into a corridor; farms, roads, wagons do not fit. |
| D. 2.5D billboard renderer over grid A | Delver-style sprites in a 3D view | Same sim as A with a costlier renderer. Experimental, post-MVP, second renderer only (R2). |
| E. Full voxel (Minecraft) | Continuous meshes and physics | Rejected: building feel comes from placing cells, which A already gives; continuous physics adds the most cost for the least commander-game value. |

**Cell fields** (ASSUMPTION, per C): `mat` (air, dirt, clay, sand, stone types, ore types, wood, plank, brick, etc.), `state` flags (solid, opaque, roofed, wet, hot, support, door), and sparse extras. Walls, floors and roofs are ordinary solid cells (§12.3). Furniture, stations, items, plants and animals are entities occupying cells, not cells.

**Derived per-cell tags** recomputed on dirty chunks only: `sky` (open column to the top), `roofed` (solid cell above within H), `enclosed` (belongs to a flood-fill room, §12.5), `wet` (adjacent to static water, or rained on and not roofed), `airtight` (all boundary cells solid or closed door). These feed the context for phenomena (§15.3).

**Water** is static bodies plus rain and irrigation as tags. No flowing-fluid simulation in MVP (ASSUMPTION per C: fluid CA is where voxel sims explode). Flooded mines are handled as a map **tag on a cave region** ("wet below z"), not as a moving fluid.

**Save size**: terrain is regrown from the seed by a pure function; only changed cells are stored as sparse deltas (R23, carried from slime-village's save pattern with the dig-delta change).

### 11.4 Mechanics: surface generation and biomes

Generation is a pure function of the world seed, run in named RNG streams (R23) so changing one stream does not reshuffle another.

1. **Height** from layered noise plus a mountain-massif mask (carried over from slime-village's island generator). Sea level fixed; the map is an island or a coast-bounded landmass (ASSUMPTION; edge handling is open).
2. **Moisture** from noise plus distance to water.
3. **Biomes** from height x moisture, carried over from slime-village: beach, grass, meadow, forest, marsh, rock, highland, pond. A **jungle/cold** split by latitude warmth offset is PROPOSED later, not MVP.
4. **Regions** by flood fill over biome type, used for naming ("the Marsh Reach") and for the chronicle.
5. **Flora** (about 20 species carried over from slime-village) placed by biome, with warmth preferences; fields vs thickets vs spaced trees come from one density number ("nothing in the simulation knows what wheat is").
6. **Fauna** (5 kinds carried over, plus one wounding fauna, §13.6): herds placed by food chain; the sim handles the rest.
7. **Surface deposits** (surface stone, clay banks on streams, salt pans on coast, malachite stain on rock faces) placed by §11.5 rules.
8. **Ancient sites**: 0-2 per map from 2 MVP templates (a collapsed hall, a mine mouth with old shoring), each with 1-3 relics (§13.9). Hand-templated, not a pre-history sim (B15 deferred).

Biome table (MVP, ASSUMPTION):

| Biome | Warmth offset | Notable resources | Constraint it creates |
|---|---|---|---|
| Meadow | 0 | grass, seeds, small game | Open, easy; poor fuel and stone |
| Forest | -1 | wood, fruit, fauna | Fuel rich; slow to clear; wounding fauna lives here |
| Marsh | +1 (humid) | clay, reeds, peat later | Wet; mud slows hauling; bad shelter |
| Rock | -1 | surface stone, flint, ore stains | Windy; little food |
| Highland | -3 | ore, stone | Cold winters (cold hazard, §13.6) |
| Beach | 0 | salt (pans), sand | Storm exposure |

### 11.5 Mechanics: geology, strata and ore placement

**Strata.** The z column below the surface is layered:

| Depth band (cells below surface) | Material | Notes |
|---|---|---|
| 0-1 | topsoil / clay / sand (by biome) | Digs fast, no support needed |
| 2-8 | soft rock (sandstone/limestone class) | Mineable with stone tools; shallow ores; unsupported spans of 3 are safe |
| 9-16 | hard rock (granite class) | Needs a harder tool tier (R21 tool tiers stay as material properties); spans of 5 safe |
| 17-24 | deep rock | Deep ores, large caverns; cold and bad-air pockets more common |

**Material properties are data** (R12): each stratum/ore row has `hardness`, `density`, `ore_of`, `flammable`, tags (e.g. `green, heavy, ore`). A new rock uses existing tags and participates in existing rules.

**Ore placement rules** (PROPOSED, validated by §11.9):

- **Veins** are connected 3D blobs grown from a seed cell inside a host stratum. Each ore row lists `host`, `depth band`, `vein size`, `rarity`, and a **surface tell** (the "stain" above a vein: green malachite flecks on a rock face, rust stain for iron, a seep for salt).
- **Copper (malachite)** is in the soft-rock band and near-surface in the Rock biome; guaranteed tell within 12 cells horizontally of the vein top (so "follow the green stain" works).
- **Iron** is hard-rock band and deeper; tell is rust-stain, often exposed by a cave-in or stream cut event (§11.8).
- **Coal/peat** (post-slice): peat in marsh, coal in sedimentary band.
- **Clay** on stream banks and marsh; **salt** on beach pans and one inland brine seep; **flint** in limestone nodules.
- **Finite deposits**: veins are large but finite (ASSUMPTION: 200-600 ore cells for a first vein). Surface stocks regrow slowly (rock piles regrow, carried over); deep veins do not.
- Every ore has **at least two reachable sources** on a valid map (§11.9).

**Depth is not difficulty.** The gradient is: deeper rock needs harder tools (a tool-tier gate that is a *material property*), deeper caves have more bad-air pockets and cold, support requirements grow with span. Hauling a long vertical route needs ramps/stairs (§12.3), and the transport tier (§14.7) governs carry cost. A deep vein in a stable hard-rock stratum with a ramp is easier than a shallow vein under a flooded wet-tagged soft-rock cavern.

### 11.6 Mechanics: caves

- Caves are generated from 3D noise as a pure function of the seed; a connected-component pass labels each cave region (`cave_id`, volume, entrances), reused as the explorable region for expeditions (§13.3).
- Per region tags (ASSUMPTION): `dark` (always), `cold` (deep or highland), `wet` (below a water level), `airpocket` (bad air, §13.6), `unsupported` (span longer than the safe span for the host rock).
- Caves have **one or two surface entrances** and, in the deeper band, linked passages; a secret cavern (reachable only by digging) holds one "placed secret" per map (rare find, relic or rich vein) so possession and expeditions have a reason (R27).
- Natural overhead rock counts as a roof for rooms (R18); a cave pocket can become a room without a built roof.

### 11.7 Mechanics: seasons as a warmth curve

**Carried over from slime-village.** Everything reads `warmth`, a cosine through the year, not a season name. The year is 100 days (four 25-day seasons) in slime-village; under R1 the **game year is about one quarter of a villager life** (a life is about 10 real hours at 1x, so a year is about 2.5 real hours at 1x; ASSUMPTION, derived, not independent).

Rules:

1. **Warmth curve** `w(t) = cos(2*pi*(t - t_peak)/year)` scaled by the biome warmth offset (§11.4). All consumers read `w`.
2. **Mean-normalised multipliers.** Every seasonal multiplier (breeding, growth, fruiting, forage) is scaled so its **yearly mean is 1.00**. This is a hard authoring rule carried from slime-village, discovered when winter breeding at 0.3 and summer at 1.0 averaged 0.65 and halved the median population. Only two quantities may hurt on net: `COLD_HUNGER` and `FROST_ROT`. A headless test sums each seasonal curve over a year and fails the build if the mean is outside 1.00 +/- 0.02.
3. **Lookahead.** Villages plan `SEASON_LOOK` days ahead (carried over, 20 days of 100; scales with the year length), so larder, fuel and fodder wants follow the *coming* warmth, not today's.
4. **Winter effects.** Cold damage to unsheltered villagers and plants (frost takes what cannot stand it), faster food spoilage reversal (cold slows spoilage, §14.6), shorter foraging day, snow accumulation cleared by lit hearths and foot traffic (carried over).
5. **Seasonal drought** is a rarer systemic event (§11.8) that reduces moisture for N days; parched plants stop fruiting (carried over).
6. **Landing** is at day 5 of spring (carried over) so the first settlement gets the whole good half of the year.

### 11.8 Mechanics: world lifecycles and systemic events

**AGREED.** Plants and animals are born, grow, age and die, carried over from slime-village. This is a world rule, not a decoration:

| Layer | Lifecycle (carried over) | Why it matters |
|---|---|---|
| Plants | seedling -> growth -> fruit -> seed -> wither; frost, drought, shade kill; tended plots exempt from trampling | Fuel and food retreat with overharvest; forests regrow only if seeded |
| Herbivores | young -> adult -> old -> die; winter dormancy for some; food chain; no hard population cap | Herds starve instead of being capped; hunting pressure shows in the herd |
| Predators / wounding fauna | same lifecycle; territory | The wounding fauna (§13.6) is a population, not a spawner |
| Carrion | dead animals become food and disease vector (later) | Decay is a sink |
| Villagers | born, child, adult, elder, die (R1); permadeath | Core loop of knowledge loss (§15.8) |

No global population caps (births about equal deaths); the *land* caps via food and wood within range (carried over `RANGE_*` model).

**Systemic world events** (DECIDED R12, PROPOSED details): data rows that *place preconditions* instead of waiting for a player action. They are environmental, never raids.

| Event | What it does | Preconditions it creates |
|---|---|---|
| Lightning fire | Strikes a tree or dry meadow; burns a patch; leaves a charred stump | Charcoal / wood-fire phenomenon (§15.5) |
| Smouldering stump | A stump in damp ground burns slowly under a mound | Charcoal precondition when none exists |
| Erosion / stream cut | A stream shifts, cutting a bank | Exposes clay, a surface tell for an ore vein |
| Cave-in at a natural span | An old unsupported cavern ceiling falls | Exposes ore the player has not dug to |
| Seasonal drought | Moisture drops for 5-10 days | Drying rack conditions, pressure on water |
| Hard winter | Warmth offset -2 for one season | Pressure on `keep_food`, `warmth` |

Each event row is gated by **pressure and absence**: it only runs when (a) a pressure tag is above 0.3 for two seasons, *and* (b) the precondition it provides does not exist anywhere in the settlement's reach. This is the "director that places the missing precondition" (tech review fix) as an environmental event, not a timer that fires an accident. Events never grant knowledge; they only make a thing *possible*. See §11.9 and §15.9.

### 11.9 Mechanics: heat, moisture and enclosure context

The context a phenomenon sees at a work site (R12, prototype "heat/enclosure context"):

| Context axis | Computation (ASSUMPTION) | Used by |
|---|---|---|
| `heat` level (0-5) | `fuel.heat_value x draft x insulation`, quantised; see table below | firing, smelting, cooking, smoking |
| `moisture` | cell `wet` tag, rain on unroofed cells, water adjacent | drying, rotting, clay plasticity |
| `enclosed` / `airtight` | room flood-fill (§12.5), with doors as non-airtight | smoking, charcoal burning, smelting |
| `draft` | wind direction x openings; ridge/highland bonus 1.3, enclosed hall 0.6 | bellows-less furnace |
| `duration` | integer ticks a stack has sat at this context | all |
| `shade` / `airy` | derived from roofed + open sides | curing, drying |

Heat levels (ASSUMPTION; drives the worked examples):

| Level | Name | Source | Typical result |
|---|---|---|---|
| 1 | Warm | embers, sun-baked rock | drying, smoking |
| 2 | Hearth | open wood fire | cooking, baking daub (fired clay at the margin) |
| 3 | Kiln | clay-lined pit, wood fuel | pottery, bricks |
| 4 | Furnace | clay-lined pit + charcoal + draft | copper smelting |
| 5 | Forge | furnace + bellows/charcoal + insulation | iron (post-slice) |

A better furnace is a **physical result of materials and shape**, not an unlock flag. A 1-cell closet cannot exceed level 3 (room size cap on insulation), so the player cannot cheat level 4 with a closet (prototype pass criterion).

Duration timers are stored on the **item stack or station**, as integers, saved with the world (R23), and phenomenon matching is indexed by input tag so it only runs when a stack's context changes (tech review item 2.1).

### 11.10 Mechanics: per-seed solvability validator

**DECIDED (R12).** At worldgen, a headless validator checks the first-planet capability graph against the generated map before the game starts. If it fails, the seed regenerates with the next named stream index (the player never sees a rejected world).

Validator checks (PROPOSED details):

1. **Route existence.** For each capability slot in the slice (§15.7) there is at least one path from "bare hands + starter shelters" using only phenomena that can fire.
2. **Two input routes** for each of the first 20 discoveries (tech review): two distinct sources of each key input (e.g. clay from a stream bank *or* a marsh; malachite from a surface stain *or* a shallow seam; fuel from forest *or* scrub).
3. **Expedition radius.** Key inputs (clay, flint, malachite tell, salt or smoke-food alternative, fuel) lie within R cells of the landing site by walking path (ASSUMPTION R = 64 cells in the 128x128 MVP map).
4. **Precondition existence.** Each precondition that depends on an *accident* (charcoal, exposed ore tell, windy ridge for a draft) has either a natural instance or a systemic event row that can create it (§11.8).
5. **No isolation.** The landing site is connected by walkable path to every required input without crossing deep water.
6. **Bot run.** A headless "competent bot" and an "idle bot" run 20 seeds x 50 game-years: capability reached in at least 95% of idle runs within 20 years and 100% of competent runs within 8 (tech review prototype 4). Stuck rate under 2%. Every failure is explained by the discovery trace log.

The validator catches *world* failures. It does not catch *player-made* failures (burning down the only forest); those are recoverable through events (§11.8), regrowth, and the §15.9 rediscovery discount, never by silent rescue.

### 11.11 Interactions

- §12: rooms, roofs and heat context are computed from the cell grid; natural overhead rock counts as roof.
- §13: caves, strata and hazards define what expeditions meet; fog/knowledge is the player's view of the same grid.
- §14: ore and fuel placement and distance set the transport tier a settlement needs; seasonal curves drive spoilage.
- §15: phenomena read context; systemic events place preconditions; validator uses the capability graph.
- §16: biome and geology drive cultural divergence (a coastal village finds salt; a forest village finds smoke).
- §17: new settlement sites are scored using the same world data.

### 11.12 Progression

World content is not unlocked; **reach** is. The settlement's usable world grows by (a) exploration (fog lifts, §13.8), (b) transport tier (§14.7) making far resources economic, (c) tool tier (deeper rock), (d) capability (smelting makes ore usable). Late first-planet content is a deeper band, a second biome with another climate, and a second settlement site (§17).

### 11.13 Failure states

| Failure | What it looks like | How it recovers |
|---|---|---|
| Deforestation | Wood retreats from the village; fuel pressure rises | Charcoal efficiency, relocation, replanting standing order |
| Cold snap with no shelter | Cold damage, deaths | Shelters/hearth by autonomy (R8) |
| Drought | Fruiting stops, wells low | Stored food, drying, seed saving |
| Over-mined vein | Local ore exhausted | Expedition for a second source (validator guarantees one) |
| Cave-in | Villager killed or trapped | Shoring, ramps, crew retreat; rescue job |
| Soft-lock by player action | e.g. burned the only forest | Systemic events and rediscovery discount; seed validator guarantees alternates |

### 11.14 Exploits and counters

| Exploit | Counter |
|---|---|
| Re-roll seed until rich start | Seed is shown; "seed hunting" is allowed. The validator ensures minimum fairness, not maximum. |
| Dig a 1-cell shaft to a deep vein | Hard-rock tool tier, support spans, ramp cost; hauling by hand through a 1-wide shaft is slow (transport tier, §14.7) |
| Stockpile warmth to skip winter | Cold slows spoilage; hoards attract vermin (§14.8) |
| Burn the forest for charcoal rush | Fuel pressure feeds back; regrowth is seeded and slow; no refund |
| Abuse seasonal normalisation | Headless test fails build if a seasonal curve's mean drifts from 1.00 |

### 11.15 MVP vs later

**MVP:** 128x128x24 grid, 6 biomes, 4 strata bands, copper and iron, clay, salt, flint, 1-2 cave regions, 6 systemic events, solvability validator with route + two-source + radius checks, seasonal normalisation test. **Later:** jungle/arctic planets, flowing water, coal/peat, wind erosion, climate drift, pre-history sim, second planet generator (space expansion).

**Example (player view).** The player opens the Almanac and sees "Charcoal: nobody has seen it." A dry autumn follows; lightning ignites a tree in the oak stand. The chronicle notes "lightning burned a copse at the north stream". Two villagers walk to the scorched stump, find black lumps, and one tinkers with them at the hearth. The event existed because charcoal was missing and fuel pressure was 0.4 for two seasons (§11.8), not because a timer fired.

---

## 12. Construction, Functional Buildings & Blueprints

### 12.1 Purpose

Let the player design the settlement freely (AGREED: free construction, Minecraft/Terraria style), have functional buildings qualify by what they contain rather than by a menu choice, and let a finished design be saved and mass-produced ("build 10 more of these houses"). Creativity is the point; the system must not reward one optimal layout.

### 12.2 Player experience

- Draw floors and walls with a ghost preview; place furniture from a palette; zone a purpose onto an enclosed space.
- A **checklist** shows what the room still needs ("bed x2: have 1", "wall material: wood ok", "light: low").
- A finished room shows a **quality word** (poor / adequate / good / fine), not a binary pass.
- "Save blueprint", name it, then "Build x3" and drag ghosts to sites; villagers carry materials and build supports first.
- Partially built things are visible and valid (§12.9).

### 12.3 Mechanics: cells, walls, floors, roofs, supports

**DECIDED (R3, R18).** Building writes cells. A **wall** is a solid cell on a z-level; a **floor** is a solid cell below; a **roof** is a solid cell above an interior cell within H (ASSUMPTION H = 3). Stairs and ramps are shape-flagged cells that connect levels. Doors and windows are cell flags plus (for doors) an entity holding open/closed/lock state. Material rows list `buildable_as: [wall|floor|roof|any]`, `hardness`, `insulation`, `fire` (flammability), `support` capacity.

**Supports (structural rule).** There is **no structural solver** beyond cave-in spans (R20). Rule: an unsupported horizontal span longer than the material's `span` (ASSUMPTION: plank 3, log 4, stone slab 5, brick arch 6) requires a pillar/support cell; builders will not place a roof over a span exceeding its limit and the Why panel says "needs a support within 3 cells" (blocker `unsupported`).

Terrain stays terrain: floors can be dug into soil, rock walls can be left as natural walls. A cave pocket with a built door and natural rock roof is a valid room.

**Furniture, stations, and items are entities** with an occupied-cell list (state: owner, progress, inventory, quality), not cells. The MVP set is about 25 entities (bed, leaf bed, table, chair, shelf, storage box, hearth, kiln, workbench, loom, drying rack, smoke rack, door, torch, etc.).

### 12.4 Mechanics: functional buildings as data

A **Station** is an entity that enables one or more recipe verbs and **exposes context** (heat, moisture, enclosure) to phenomena. A Kiln is not "an unlock": it is a clay-lined pit entity whose `heat_value` and `insulation` feed §11.9; if built from a different material the level differs.

A **Building** (R18) = one or more rooms + an optional Purpose. Purposes are data rows:

```
purpose: bakery
  min_cells 12, max_cells 60 (soft, oversize lowers quality)
  require: oven_station x1, work_table x1, storage x1, door x1
  prefer:  light >= 2, floor not dirt, temperature 1..3
  yields:  recipes [bread, flatbread], worker slots 2
```

### 12.5 Mechanics: hybrid rooms

**DECIDED (R18).** Flood-fill detects enclosed volumes (6-connectivity in 3D to prevent diagonal leaks; windows block flood fill but pass sight; doors connect rooms for pathing but separate them for room identity; cap 4096 cells, over the cap = outdoors/yard; natural overhead rock counts as roof). The player **assigns a Purpose** (or accepts the suggested one when furniture clearly implies it). The room evaluates the Purpose's requirements and shows a checklist.

**Graded quality** (PROPOSED formula, ASSUMPTION weights):

```
room_quality = clamp( 0.40 * requirements_met_share
                    + 0.20 * size_fit            // 1.0 within [min, ideal]; falls to 0.5 at 2x max
                    + 0.15 * light
                    + 0.15 * temperature_fit
                    + 0.10 * floor_and_wall_materials, 0, 1)
```

Words: <0.35 poor, 0.35-0.6 adequate, 0.6-0.8 good, >0.8 fine. Quality scales **worker comfort and product quality modestly (up to +/-15% product quality, never output quantity beyond what the worker's skill allows)**. A "poor" room still works. Oversize lowers quality rather than failing. Zones always win over auto-detection when the player disagrees.

**Rooms vs economics.** Required entities are *capability-gated*: a bakery needs an oven station; ovens need the capability to build them (fired clay or brick, §15). The checklist never asks for something nobody can build yet; it shows a greyed requirement with "needs: kiln-firing".

### 12.6 Mechanics: blueprints

**DECIDED (R19).**

- **Capture.** Draw a box; the tool takes all player-built cells and furniture entities inside (not terrain). Stores material **class** by default (any wood, any stone), with an exact-material toggle. Saved as a sparse list `(relative cell, material class, shape, rotation, role)` plus an entity list. A 300-cell house is about 1.2 KB raw.
- **Rotation** in 90-degree steps, with mirror optional (ASSUMPTION: mirror post-MVP).
- **Place.** Appears as a ghost; green where valid, red where terrain blocks. The tool shows a materials checklist for the chosen class.
- **Stamp xN.** "Build x10": places N ghosts in a painted zone or at clicked sites. Jobs are released in waves (about 30 open jobs per site) so the board is not flooded; the player can cap pending sites per crew.
- **Material classes.** Wall/floor/roof roles accept any material whose class matches and whose `buildable_as` includes the role; fallback chain by availability (stone -> brick -> wood) is *shown*, never silent: if nothing is available the order stalls with "needs: 40 stone-class".
- **Build order: supports first.** A DAG is derived at order time: floors before walls, pillars before roof span, furniture after floor, door last so no one is walled in. Ordered by z ascending, supports first, outside-in.
- **Partial builds are valid.** Each cell is {unplaced, framed (materials delivered), built}. Partially built is a visible state and can be paused, abandoned, or finished later. Cancel returns delivered materials as ground items (loses 0-25% on cancel; knob).
- **Auto-build flag (R8).** A blueprint flagged **auto-build** is eligible to be started by the village without an order when the demand vector says that kind of building is wanted (housing short, storage full). Unflagged blueprints are built only on order. Starter shelters (leaf bed, lean-to) are always autonomous. New functional building kinds come *only* from the player's designs.

### 12.7 Worked example: the bakery

1. The settlement has fired clay and an oven design (the player has seen a kiln fire; the oven is a clay-and-brick station).
2. The player drags a freeform 5x4 floor, wall cells on three sides, a door cell on the fourth, an oven, a work table, a storage box. They do not pick a "bakery" from a menu.
3. The flood fill closes the room. The player zones it **Bakery**. Checklist: oven yes, table yes, storage yes, door yes, light 1 (wants 2). Quality: **adequate**; a window cell added raises light and quality to **good**.
4. The player drags a box over it and presses **Save blueprint** ("Little Bakery"). Wall material class: wood. The blueprint stores a roof span of 5 and a pillar the builders will place first.
5. They press **Build x3** and drop ghosts on three streets. The villagers carry planks; a crew of four stalls with "needs: 40 wood-class" until lumber arrives; supports and floors rise first; a room finishes at 70% and is already usable for its hearth.
6. Each finished bakery needs a baker (a villager with bread skill). Where there is no baker, the oven sits cold: the building is not production, the worker is.

### 12.8 Mechanics: how creativity is not punished

An optimal layout would make freeform building pointless. Three structural reasons it does not exist:

1. **Quality is graded, not binary; the score is mostly insensitive to shape.** Requirements are counts (an oven, a table), not coordinates. Size fit is a wide plateau. Light and temperature use the cells the player actually built, so a round hut and a rectangle are both fine.
2. **Throughput comes from workers and skill, not geometry.** A bakery's output is bounded by a baker's skill and presence, not by "adjacency bonuses" (no Factorio-style packing puzzle). Room quality modifies product quality by at most +/-15% and comfort slightly.
3. **Distances cost hauling time, not a score.** A cramped compact layout shortens hauls; a sprawling one lengthens them. Both work.

**Anti-pattern forbidden:** no hidden adjacency bonuses, no "ideal" ratios, no recognition that fails because a wall is one cell off. Near-miss help is shown (checklist), not punished.

### 12.9 Interactions

- §11: roofs, enclosure, insulation and heat context come from cells; terrain is part of the room.
- §13: mines are cells; shoring is a support entity; cave-in span rules are shared with building supports.
- §14: material classes, recipes and quality inherit from materials (§14.2); upkeep (§14.8) applies to buildings.
- §15: stations expose context and are the "evidence" that makes rediscovery cheap (§15.8); building parts gated by capability.
- §17: blueprints are how a new settlement stamps itself; auto-build flag is the settlement-scale autonomy.

### 12.10 Progression

| Stage | Buildings possible |
|---|---|
| Foraging | leaf bed, lean-to (autonomous starters) |
| Fire and stone | hearth, stone pit |
| Clay | daub hut, kiln pit, jar store |
| Timber | framed cabin (needs FRAMING capability), loom shed |
| Masonry | stone cottage, brick oven, furnace |
| Mechanical (later) | wagon shed, rail halt |

A building kind exists in the palette only when a living villager can build its parts (capability = a living knower, R10). Unbuildable stations show greyed with the missing capability.

### 12.11 Failure states

| Failure | Cause | What the player sees |
|---|---|---|
| Stalled site | Missing material class | "needs: 40 stone-class" in Why panel |
| Collapsed roof | Span exceeds support | Collapse event; materials partly lost |
| Walled-in worker | Door placed too early | Prevented: door-last rule |
| Unusable station | No worker with skill | "Nobody can run the forge" |
| Over-ordering sites | Many stamps, few builders | Cap on pending sites; ghosts show a queue |

### 12.12 Exploits and counters

| Exploit | Counter |
|---|---|
| Blueprint spam land grab | Cap pending sites per crew; sites cost materials upfront delivered, not placed free |
| Tiny closet for high heat | Insulation cap by room volume; level 4 requires furnace and draft |
| Oversize "room" to hold unlimited workers | Worker slots are on stations; oversize lowers quality |
| Cancel-rebuild loops for material duping | Cancel loses 0-25%; conserved matter |
| Identical copy-paste layouts all optimal | Nothing in the score rewards identical shape; terrain and materials vary results |

### 12.13 MVP vs later

**MVP:** flood-fill rooms, checklist, graded quality, capture/place/rotate/stamp xN, supports-first order, partial builds, auto-build flag, ~25 entities, 12 materials, 8 shapes. **Later:** mirror, blueprint sharing, stewardship (autonomously choosing from the library, post-MVP per R8), multi-storey towers, wagon sheds and rail halts, decoration quality.

---

## 13. Exploration, Mining & Combat

### 13.1 Purpose

Exploration and mining are how the settlement's reach grows and how new materials, fauna, ruins and phenomena enter the player's world (R27: they feed Curiosities directly). They must be **orderable at area scale** (never per-block clicking), **delegable** (a crew can do the whole job) and **possessable** (the player can do it by hand for a felt push, never as a requirement). Combat is deliberately minimal (R20); the danger is the place, not a fighting game.

### 13.2 Player experience

- The player draws a region over rock and says "dig this out", or taps a green stain and says "seek copper".
- A crew goes underground with torches and food; a report comes back ("brought 14 ore, mapped two caves, one man lost to a collapse").
- Or the player possesses one of the crew and walks the tunnel: aimed digging, a torch circle in the dark, a cold draught, a creature's eyes at the edge of the light.
- Retreat is a normal behaviour; slimes break off and run when a threat is sighted. The player's choices are where to send them and when to call them back.

### 13.3 Mechanics: area designation and automatic mining

**DECIDED (R27).** Mining uses **area designation**:

| Order | Meaning | Notes |
|---|---|---|
| **Dig region** | "excavate this box/volume" | Cells designated; jobs per cell are generated lazily; builders place supports where the plan needs them |
| **Follow vein** | "follow this vein from here" | Extends along connected ore cells of the tapped ore; stops at vein end |
| **Seek X** | "find copper" | Expedition-level: the crew heads to the nearest region whose surface tells or known cave tags suggest X, then follows the vein |
| **Dig to depth N** | "shaft/stair down to z-N" | Generates a ramp or stair plan, supports-first |

The mining job is the shared Action (R5, C): designate -> job -> `cell.hp -= power x skill x dt` -> cell set to air, item drops. Partial progress is stored on the cell so interrupts lose nothing.

**Auto-exploration** (AGREED): the crew chooses its own route by the designation rule, picks supports from the support rule (§12.3), and avoids cells tagged `airpocket` or `unsafe` unless possessed. There is no per-block clicking and no separate "mining AI" beyond the board.

**Output sinks.** Ore goes through the same hauling baseline as everything (§14.7). Mining gives skill XP only for **natural** cells (R17): player-placed blocks re-mined give zero XP. Rest curve limits per-day gains.

### 13.4 Mechanics: expeditions

**DECIDED (R6, R27 + AGREED).** An expedition is a **crew** with four extra fields:

```
expedition = crew (named villagers + default task + stall summary)
           + intent     ("find copper", "dig to z-12", "map the north cave")
           + provisions (food, water, torches per head; drawn from the store)
           + recall     (the rule below)
           + optional leader (the most skilled/senior member)
```

**Recall rule** (reduced to two, per tech review): **turn back when provisions are at half**, and **turn back when anyone drops below half health**. "Pack full" is just the ordinary haul-home behaviour; "threat sighted" is ordinary flee/retreat behaviour (§13.7). Players can edit the provisions rule but not add predicates (ASSUMPTION; keeps the UI small).

**Expedition report** on return: items brought, regions mapped, Curiosities seen, losses. Sent to the chronicle; unfinished intents offer a one-click "send again".

Slice rule: MVP ships **one expedition type**: "dig toward material X to depth N" (tech review). General intents ("explore the coast") are post-MVP, though the board already runs `scout` (carried over from slime-village).

**Interaction with autonomy (R8).** Autonomy never starts an expedition. While the crew is gone the village continues autonomous survival (eating, shelter, repair, hauling), which is the point of the organising sentence. Replacements are not auto-drafted: crews refill only from unassigned villagers by the player's rule (tech review).

### 13.5 Mechanics: possession on expeditions

**DECIDED (R9).** Any expedition member can be possessed mid-trip. Possession removes that villager from the board; the crew continues. The player gets:

- **Divine inspiration**: +10% action speed, +15% XP, and **Steadfast** (the possessed does not panic, flee or break under fear). No yield, damage or need bonus.
- Needs keep running; **control is released only on collapse** (incapacitation), never on a warning. No timer or cooldown. Death while possessed is ordinary permadeath.
- Same Action pipeline as the AI (R9, C), so aimed digging and melee are the same actions with a different controller.

**Why possession is an edge, not a requirement.** The edge is *information and judgment* (choose the tunnel, spot a bad-air pocket, hold position when others would run, because of Steadfast), not output. Bot target: possessed output at most 1.25x delegated (R9 gate). A delegated expedition reaches the same ore; it may lose someone the player would have saved.

**Floor of what must exist** (tech review 4.1, trimmed by R9): character-relative movement, dig/melee/build-place verbs, a hazard to read, a light radius underground, hit feedback, a close camera (same camera, tighter follow, R2). That floor is 3.5-6.5 FTE-months (R26); MVP keeps it minimal.

**Vignette.** The player sends a crew of three on "seek copper, depth 8" with food for 4 days. Day 2 the crew reaches a damp cave; the leader's torch gutters. The player possesses the leader, walks 10 cells, sees the green stain left of the passage and a cold draught right, takes the left tunnel, and releases possession when the crew has shored the ceiling. The expedition's report lists "found the malachite seam; Dov (possessed 3 minutes) rescued Mira from the draught."

### 13.6 Mechanics: hazards (R20)

MVP hazards; each is data on cells, regions or fauna, and each reports a blocker to the Why panel.

| Hazard | Rule (ASSUMPTION numbers) | Counter |
|---|---|---|
| **Cold** | Cell warmth below tolerance drains health; highland, deep and wet caves are cold; slimes have trait `coldHardy` that is environment-dependent (R16) | Shelter, insulation (walls), hearth, rest cycles, torches give small warmth |
| **Cave-in** | A designated or natural span longer than the rock's safe span (soft 3, hard 5) is flagged `unsupported`; each tick spent beneath with no support rolls a small collapse chance that rises with span and wetness; collapse damages cells beneath and any villager (hurt or killed) | Support cells/pillars, shorter spans, "shore first" rule builders obey |
| **Bad air** | `airpocket` tag on cave cells; a villager inside loses stamina then health; torches gutter (a visible tell) | Ventilation shaft (a dug opening), short trips, avoid tagged cells; delegated crews avoid unless intent says so |
| **Wounding fauna** (one kind) | See below | Retreat, spears, shelters |

**The one wounding fauna (PROPOSED).** A predator (placeholder: a "thornback" boar-like creature, territory in forest/cave mouth) that mauls on contact. 2 hit points of damage per hit against a slime of 10 HP (ASSUMPTION), territorial, flees at low health, drops carrion. It is a *population* with a lifecycle (§11.8), not a spawner. It creates the carried-over `dread()` memory (lore.js) that makes villagers avoid the place.

**Hazards as phenomena context.** Gas, heat and cold are also context axes (§11.9), so a hazard can be a discovery source ("the lamp went out at the pocket" -> Curiosity).

### 13.7 Mechanics: combat and retreat

**DECIDED (R20).** MVP: one wounding fauna and cold/cave-in/bad air. Full combat is deferred. Combat is **simple and lethal**: one or two hits kill either side (tech review 4.3), so tactics are positional (do not go there, retreat early), not skill-based.

- **Melee action**: one verb, same for AI and possessed.
- **Retreat behaviour** (carried over from slime-village `peril`/flee): a villager who sights a threat flees toward the nearest safe region; a crew member below half health leaves with the crew (recall rule). Fleeing slimes may drop heavy loads. Chased slimes rely on speed; the threat leaves a territory chase radius.
- **Steadfast** disables fleeing for the possessed; combined with permadeath, this is a real tradeoff, not a free bonus.
- **Guard stance** (existing slime-village weights) lets a settlement keep a few defenders; spears (tool) make the wounding fauna avoidable.
- No stamina system, no combos, no dodge roll (R20).

### 13.8 Mechanics: fog and knowledge

**Carried over from slime-village `lore.js`.** The map starts blank. The ground "anybody has laid eyes on" is remembered by the same reckoning slimes use to remember it: `sightOf` (SIGHT_BASE with per-slime quirk, night 0.4x, rain 0.7x) writes cell memory; memory has a per-kind hold time (a pond keeps for a season, a berry patch for days, a herd for hours; `holdFor(kind)`); villagers gossip what they know (`share`). The player's fog is the village's collective explored set (`explored`/`prospect`). It "never goes back" for terrain, but dynamic knowledge (where a herd is) fades.

Rules:

1. Knowledge lives in heads, and the settlement's map is derived from them (R10 spirit).
2. **Underground** sight uses light: radius of torch cells; without a torch, visible radius is 1 cell. Light is a per-cell tag recomputed on torch placement (cheap, MVP).
3. The player sees the fog as dimmed unknown tiles; Curiosities appear where something unexplained was seen (a glimmering stain, a bone heap).
4. **Shared sight cache**: witnessing (§15.4), observation learning (§15.8), lore and fog use one per-tick sight cache (tech review performance point).
5. Dead/lost scouts take their memory with them, except what they gossiped before.

### 13.9 Mechanics: ruins and ancient sites

**R27, R12.** Ruins **hint, never gate** (B). MVP has 2 templates (collapsed hall, mine mouth with old shoring), 0-2 per map. Each holds 1-3 **relics**: an item with an `origin` string that, when *examined* by a villager who holds the related craft, grants a bit of familiarity or shows that a material exists (e.g. "a worked bronze axehead: metal exists; nobody here knows how it was made"). Examination is a job; results go to the Almanac as a silhouette entry (§15.6). Own ruins: a settlement that dies leaves ruins with its chronicle, which a new settlement can adopt (carried over `adoptRuins`).

### 13.10 Interactions

- §11: strata, caves, hazards, hazards-as-context, seasons (winter cold).
- §12: supports, ramps, shoring; mines are cells.
- §14: ore and fuel hauling; torches and food as provisions are consumables.
- §15: expeditions bring stranger materials (itch), ruins give silhouettes, hazards produce witness events.
- §16: culture tallies (`mine`, `hunt`) bias what is noticed underground.
- §17: expeditions are the first command scale above "go there"; site scouting is expedition-shaped.

### 13.11 Progression

| Stage | Reach |
|---|---|
| Foraging | within a day's walk; surface only |
| Stone tools | soft-rock mining with supports |
| Metal tools (copper, iron) | hard rock; deeper bands |
| Carts/wagons | far ore economic (§14.7) |
| Lamps/vents (later) | bad-air caves usable |

Scale: from "Bob, collect that iron" to a standing "keep 200 iron" backed by a mining crew (§17).

### 13.12 Failure states

| Failure | Result |
|---|---|
| Crew lost to cave-in | Deaths, lost provisions; village continues; chronicle line |
| Crew starves (provisions wrong) | Recall rule prevents most; otherwise deaths |
| Far expedition cut off by winter | Recall at half provisions; stranded crews hold position and survive on stores or die |
| Possessed villager dies | Ordinary permadeath; no refund |
| Nothing found | Report says what was *not* found; negative knowledge helps next order |

### 13.13 Exploits and counters

| Exploit | Counter |
|---|---|
| XP farming by re-mining placed blocks | Zero XP for placed cells (R17) |
| Possession swap between members for XP | XP buff only while the action matches challenge-matched curve; per-day rest curve; bot gate (possess-swap bot) |
| Unlimited scouting for free | Provisions consumed; scouting costs labour; fog is not free |
| Tunnelling around hazards forever | Supports consume material and labour; bad-air pockets only skirted, not erased |
| Safe cheesing fauna from walls | Fauna territory and pathing; not combat-mechanical in MVP |

### 13.14 MVP vs later

**MVP:** dig region, follow vein, seek X, dig to depth; one expedition type; recall rule (two predicates); possession with R9 buff; cold, cave-in, bad air, one wounding fauna; fog from lore; 2 ruin templates. **Later:** more intents, more fauna, full combat, light-source mechanics (lamps), mystery events (<10), second renderer for first-person possession (Experimental).

---

## 14. Crafting, Economy & Logistics

### 14.1 Purpose and player experience

**Purpose.** Turn raw materials into goods through stations and skilled workers, move them, and keep the economy bounded by sinks so that "collect reasonable resources and do epic stuff with what was originally minimal" (AGREED) holds. The economy is labour-bound and physical: no belts, no drones (AGREED, D3).

**Player experience.** The player sees stock bars, sets "keep N" orders, places stockpiles near stations, builds wagon sheds when hauling is the bottleneck, and sees quality words on goods ("good axe, made by Tob"). Nothing runs forever without them noticing.

### 14.2 Mechanics: materials as property-bearing data

**R12 and B.** Every material is a data row with numeric properties and appearance tags; recipes and phenomena read properties, not names.

```
{ "id": "malachite", "tags": ["stone","green","heavy","ore"],
  "props": { "hardness": 0.4, "density": 0.7, "ore_of": "copper", "flammable": 0 },
  "origin": { "biome": ["rock","highland"], "depth": [0,6], "rarity": 0.25 } }
```

Core property set (ASSUMPTION): `hardness`, `density`, `plasticity`, `wetness`, `melt_temp`, `heat_value` (fuel), `flammable`, `water_resist`, `malleable`, `insulation`, `span`, `spoil_rate`, `nutrition`. A new material that fits existing tags participates in existing recipes and phenomena with zero code (B target). Slime-village's tool tiers (flint/stone/iron/steel) remain as **property tiers** of tool materials: a harder metal gives better yield through property, not through a % tech node (D, R13).

**Perceived properties** (what slimes can observe, used to bias tinkering) are a second authored field per material; it must not leak output tags (§15.4).

### 14.3 Mechanics: recipes and stations

A recipe is `inputs (by tag/property/amount) + station + skill verb + time -> outputs`. A **station** (§12.4) provides the verb and context; a **capability** (§15.8) says a living villager knows the craft. A recipe fires only when both exist at job-choice time (R10). Recipe ingredients may be *class*-based ("any wood"), matched by tags and properties.

Examples:

| Recipe | Station | Skill verb | Inputs -> Output |
|---|---|---|---|
| flatbread | oven (hearth+clay) | baking | flour x2 + water -> flatbread x4 |
| pot | work table + kiln | pottery | clay x2 (shaped) -> pot (kiln-fired) |
| charcoal | covered pit | burning | wood x6 -> charcoal x3 (needs enclosed, low draft) |
| copper ingot | furnace (level 4) | smelting | malachite x2 + charcoal x1 -> copper ingot x1 |
| axe | forge/anvil | smithing | ingot x2 + wood x1 -> axe (quality by skill) |

Orders come from standing orders ("keep 20 bread") that add demand for the *output*; **depth-1 expansion only** (tech review): the order adds demand for flour and an oven slot; deeper chains emerge through the ordinary demand vector, not a planner.

### 14.4 Mechanics: quality from skill

Skill is per-craft 0..1 (R10, R17). **Skills gate quality and speed, never the ability to attempt.** Quality bands (PROPOSED; ASSUMPTION numbers):

```
quality_score = 0.5 + 0.5*skill + material_quality_offset + station_quality_offset(room_quality)
quality word: crude < 0.35, serviceable 0.35-0.6, good 0.6-0.8, fine > 0.8
```

Effects of quality are on **durability, efficiency of use, and value as luxury**, never on number of outputs per input. Tools: durability and yield effect from the property row; skill multiplier up to 1.8x on speed (R16 genes +/-25%, tools 1.5-5x, skill <=1.8x carry the large multipliers; combined ceiling bounded by diminishing curve). Makers are credited by name on items (heirloom hook, `maker`).

### 14.5 Mechanics: stockpiles

A **Stockpile** is a zone the player paints; items are hauled into it by baseline behaviour (R21). Fields: allowed item classes, capacity per cell (stack sizes by container tier, §14.7), roof/wall conditions (decay, §14.6). Placement matters: near stations cuts hauling; near the settlement edge puts goods in the weather. Stock bars show counts and "keep N" targets, with the hysteresis band (refill below ~80%, stop at 100%, R7). Cap N at a multiple of storage capacity and per-capita (tech review hoard exploit).

### 14.6 Mechanics: spoilage and decay

Carried over from slime-village (granary/stores logic, `durability`): **everything decays**: food spoils, tools wear, buildings lose hp ("everything standing is falling down"), exposed stockpiles lose goods to rain and pests. Cold slows spoilage; a cellar (cold cellar alternate, §16.4) and jars slow it further. Spoil rates are material properties, so jar/cure/dry/smoke change a *number*, not a flag.

### 14.7 Mechanics: transport tier ladder

**DECIDED (R21).** Hauling is baseline behaviour. The player's lever is the **transport tier** and stockpile placement.

| Tier | Carrier | Capacity (ASSUMPTION units) | Speed vs walking | Needs |
|---|---|---|---|---|
| 0 Hand | villager | 1 item stack | 1.0 | nothing |
| 1 Basket/box | carried container | 3 stacks | 0.9 | basketry (fibre) or box (planks) |
| 2 Backpack | worn | 5 stacks | 0.95 | hide + cordage |
| 3 Wagon | pulled by villagers | 20 stacks | 0.7 | wheel + axle (Mechanical era), a road helps |
| 4 Animal cart | pulled by tamed beast | 40 stacks | 0.9 | husbandry, harness |
| 5 Rail | cart on track | 60 stacks | 1.4 | track building, smithing |

Rules: a carrier is an **entity with a capacity and driver requirement**; a wagon needs a driver; roads (paved or worn paths) improve speed. No belts, no drones, no priority matrix in MVP (R21).

**Difficulty from logistics, not distance:** a copper seam 60 cells away is a hand-haul problem at tier 0, a one-trip problem at tier 3. The player's design work is moving the *stockpile*, building a road, or stepping up a tier.

### 14.8 Mechanics: sinks against runaway production

The master design rule (D): an economy that is not bounded by labour and maintenance has a missing sink. Sinks:

1. **Decay** (§14.6): standing maintenance load roughly proportional to building count; growth saturates when repair labour equals builder labour. This is the central sink, carried over.
2. **Upkeep**: stations without workers make nothing; a bakery without a baker is idle. Each standing building draws repair materials from its own class.
3. **Maintenance of tools**: `durability` wear caps iron-working hoards.
4. **Convex costs**: trait upkeep (R16) is convex in trait value; large settlements have convex crowding costs (disease, strain) ASSUMPTION; long hauling distances give convex time cost per item.
5. **Luxury sink**: surplus feeds feasts, music, decoration for mood/belonging with no production return; gives creative play an economic role.
6. **Resource depletion** and range (carried over): wood/stone near the village deplete; distance costs carrying time.
7. **Spoilage and vermin** on dense food stores; fire and disease risk when dense.
8. **Standing orders pause when met** and cap N at storage multiples.

**Measurable:** the "max-expansion" bot over 5 in-game years must plateau (growth under 5%/year) set by labour/maintenance, not run to infinity; if not, a sink is missing (R25).

### 14.9 Interactions

- §11: ore, fuel, clay and salt placement, roads over terrain, seasons.
- §12: stations as entities; room quality modifies product quality.
- §13: expeditions provision from stores; ore hauling.
- §15: recipes are gated by capabilities; materials and phenomena share the same data.
- §16: culture changes what is tried first, not outputs; species traits are upkeep tables.
- §17: standing orders and supply routes at settlement scale.

### 14.10 Progression

Era labels (R14) for economy: hand hauling and bare stone -> baskets and clay -> wood and kiln goods -> metal tools -> wagons -> carts -> rail. Nothing is gated by an era; each step is a capability a living villager knows plus the physical items. Late first-planet: wagons and carts, road networks, a second settlement supplied (§17).

### 14.11 Failure states

| Failure | Consequence |
|---|---|
| No stock reaches station | Station idle; Why panel "no_stock: clay" |
| No worker | Station idle; "nobody can run the kiln" |
| Spoiled hoard | Food waste; pressure on keep_food rises |
| Hauling bottleneck | Items pile at source; blocker `no_free_hands`; suggested tier step shown |
| Maintenance debt | Buildings decay; collapse risk |

### 14.12 Exploits and counters

| Exploit | Counter |
|---|---|
| "keep 10000 lumber" | Cap N at a multiple of storage; per-capita cap |
| Infinite chain via one production building | Worker slot and skill bound throughput; decay |
| Hoard for price | No market in MVP; hoards spoil |
| Skill XP farming by crafting trash | Challenge-matched XP, no XP when output has no value (R17) |
| Tier skipping via mod/bot | Tier requires wheel/axle capability and physical vehicle |

### 14.13 MVP vs later

**MVP:** ~12 materials with properties, ~15 recipes in the slice, skill-to-quality, stockpile zones with keep N, spoilage, tiers 0-2 (hand, basket/box, backpack) plus wagon stub, sinks 1-4 and 7-8 implemented, max-expansion bot. **Later:** wagons, animal carts, rail, roads quality, luxury goods, trade between settlements, documents/library (R10 later).

---

## 15. Emergent Technology & Civilization Development

### 15.1 Purpose and player experience

**Purpose.** Progression is discovery, not a tech tree (CONTEXT: no rigid Civ-style tree; tech = new capabilities, not +% bonuses). New abilities appear because villagers *see physics happen* or *try things*, and persist because villagers *know* them. The player steers by priorities and by changing the situation, not by spending research points.

**Player experience.**

- No research screen. The player reads the **Almanac** (what the settlement knows, who holds it, what was tried) and **Curiosities** (things seen but unexplained).
- Discoveries arrive as chronicle lines ("Tob was first to fire clay, year 2 spring") and new options in the build/order menus.
- When something stalls, a Why-style entry says why ("nobody is experimenting: no one has free time and an unfamiliar material in reach").
- Loss is visible: "the last person who knew how to fire clay has died."

### 15.2 Mechanics: data model

**DECIDED (R12, R10, R13).** Four data tables:

| Table | Row says | Example |
|---|---|---|
| Material | tags, numeric properties, origin, perceived text | `clay`: plasticity .8, wetness .7, melt 1500 |
| Phenomenon | `inputs (tag/property range) + context range + duration -> outputs`, `salience`, `serves` (demand tags), `danger`, `near_miss` | BAKE_CLAY |
| Craft | the thing a villager *knows how to do*: verb, linked phenomena, recipes, station functions | POTTERY |
| Capability row | craft(s) required + physical enablers + what it unlocks (recipes, building parts, order verbs, reachable materials) + `mechanism` field (`physics`, later `belief`) + era tag | POTTERY -> pot, jar, kiln part, verb "store grain in jars" |

A capability never grants "+10% storage"; it lists exactly which recipes, building parts and orders it enables (B). The `mechanism` field is kept in the schema so a belief mechanism can be added without a schema change (R13).

**Knowledge model (R10, MVP single layer).** Each villager holds per-craft **familiarity** (0-1) and **skill XP**. A craft is *known* by a villager when familiarity > 0. Familiarity rises by witnessing, tinkering, working beside, and Teach. B's separate notion layer is merged into this. The village also keeps a boolean `seen[phenomenon]` for the Almanac and for gating who may attempt a tinker, not a per-head layer.

**Capability = a living knower (R10).** The query `can(verb, settlement)` is: at least one living villager with familiarity > 0 (and skill >= 0.3 for quality-sensitive crafts) *plus* the physical enablers, checked **when a job is chosen**, not as a derived settlement flag. Skills gate quality and speed, never the ability to attempt (R17). There is no grace timer and no revocation event: the forge sits cold because nobody can run it.

### 15.3 Mechanics: phenomena and context

A phenomenon fires in the sim whenever its conditions co-occur, whether or not anyone intends it. Conditions are material properties plus **context** at a work site (§11.9): `heat` level, `moisture`, `enclosed`, `draft`, `duration`, `airy`. Matching is indexed by input tag so only a stack whose context changed is checked; the duration counter lives on the stack/station in integer ticks (saved; R23).

Example schema:

```
phenomenon BAKE_CLAY
  inputs    clay (wetness .3-.9)
  context   heat >= 2, duration >= 1 hour, enclosed: any
  outputs   fired_clay (hardness .6, water_resist 1.0, brittle .5)
  salience  0.7           // it turns red-brown, rings when tapped
  serves    [container, durable, wall]
  near_miss: heat 1 for >= 1 hour -> "warm and dry, but still crumbles"
```

**Dedup rule.** A repeating phenomenon (a bonfire) fires its witness check at most once per (phenomenon, site, witness) per N hours (ASSUMPTION N=6) so it does not spam.

### 15.4 Mechanics: witness and tinker

**Witness.** When a phenomenon fires within a villager's sight (shared sight cache, §13.8):

```
witness = salience x attention x (0.6 + 0.4*intelligence)
          x (1 + 1.0*pressure(tag))          // pressure in 0..1
          x culture_bias (1.0-1.3)           // §16.3
attention: 0.3 passive, 0.6 working nearby, 1.0 performing it
sticks if witness >= 0.2 ; familiarity := max(familiarity, min(1, witness))
```

Possession adds Steadfast only (R9); the +15% XP does not affect witnessing. A villager below the 0.2 threshold "did not notice". Repeated witnessing adds diminishing returns: `+0.5*(1-f)*witness`.

**Tinker.** `tinker` is a normal board job (R5). A villager with free time and an **itch** (an unfamiliar material in reach, a persistent pressure > 0.3, a Curiosity they hold) picks candidates:

- Candidates are drawn from **what is physically in reach**: stock near the site x contexts the settlement can build now x a small verb set (hit, soak, bury, heat, mix, press, bind). **Hard cap 8 candidates** per village, precomputed when stock or stations change (not per villager per pick).
- Weight: `w = 1 + 2*relevance(pressure tags vs the materials' *perceived* properties) + 1*novelty + culture_bias`. A villager never sees output tags, only what the inputs look and feel like ("crusty, dries the tongue" -> `keep_food`).
- If the combo satisfies a phenomenon, it fires (performer attention 1.0). If not, the attempt costs inputs and labour and records a **dead end** keyed to the context level attempted; it is invalidated when the context later exceeds that level (tech review).
- Risk: `danger` can hurt the tinker (burns, fumes); permadeath makes it a real cost.
- Per-station cooldown: one experiment per station per day; experiments on unseen items are impossible.

Pressure uses the village demand vector keys directly via a small `serves -> demandKey` table (no new tag vocabulary; tech review).

**Expected cadence (ASSUMPTION, P-"slice discovery chain"):** about 19% per attempt under pressure with 8 candidates, one attempt per interested villager per ~2 days: discovery in ~4-6 days under pressure, ~15-25 days without. No fixed accident timer: the safety net is §11.8 and §15.9.

### 15.5 Worked examples

#### 15.5.1 Fired clay (pottery)

State: FIRE_TENDING held; clay daub on a straw hut wall; clay bank known on a stream.

1. A daubed lean-to stands beside the hearth. The hearth is lit nightly; heat on the wall reaches level 2 for over an hour; BAKE_CLAY fires on the daub patch. Hira sleeps nearby; Tob adding a log sees it: `0.7 x 0.6 x 0.84 = 0.35`, pressure for `carry_water` is 0.4 after a dry spell: `x1.4 = 0.49`. Tob's familiarity with POTTERY becomes 0.49.
2. Itch: partial familiarity and pressure 0.4 make `tinker` attractive; candidates include {clay, shaped bowl, hearth}. A bowl shape is a "holds things" shape.
3. Tob shapes a bowl and leaves it in the hearth. BAKE_CLAY fires with attention 1.0; familiarity rises to ~0.74. A second phenomenon HOLDS_LIQUID fires when water meets fired clay; the Curiosity "baked clay holds water" resolves.
4. Mira watches Tob make a second bowl; observation slowly raises her familiarity; Tob **teaches** her (costs his time, fast). POTTERY is now known by two living villagers. The chronicle records the first and the Era label updates to "Clay age" (R14).
5. Unlocks: `pot`, `jar`, `crucible` (later), the `kiln` part (a clay-lined pit reaches heat 3), "store grain in jars", and the stew phenomenon (soak + heat in a vessel).
6. Failure mode: if Tob dies before Mira's familiarity is above 0, POTTERY is not known. The kiln pit, the fired bowls and the jar store are **evidence**; a tinker job near them rediscovers at a large discount (R11, §15.8).

#### 15.5.2 Copper smelting (charcoal precondition and how a soft-lock is prevented)

Required elements, all data rows, none a quest:

- **Malachite**: green, heavy; surface stain on rock (§11.5) or a shallow dig.
- **Charcoal** (carbon fuel, heat_value 1.6x wood): from SMOULDER_WOOD (wood + buried fire, enclosed, low oxygen). **Charcoal is a precondition** for level-4 heat.
- **Heat level 4**: clay-lined pit (kiln part, POTTERY) on a windy ridge (draft 1.3) with charcoal; a plain hearth reaches only level 2.
- **SMELT_COPPER**: `malachite x2 + carbon x1`, `heat >= 4`, `duration >= 2 h`, `enclosed`. `salience 0.8` ("green rock bleeds red metal").

Walk-through:

1. Dov mines malachite while seeking a vein (the "stranger material" gives him an itch). Stone blades are chipping: pressure(`tool_edge`) = 0.5.
2. He tries {malachite} x {open hearth, kiln pit}. Three attempts fail at heat 2-3; dead ends "green rock + hearth: only a stain" recorded for those context levels.
3. **Near-miss hint** appears in the Almanac after 3 failures, directional only: "Green rock changes at a higher heat than your best fire reaches." The player can think: more draft, a better fuel, a ridge.
4. **The soft-lock risk.** If the village has never buried a fire, charcoal does not exist and heat 4 is unreachable: tinker samples only what is in reach and charcoal is not in reach. This is the circular soft-lock the tech review found.
5. **How the world prevents it (three layers):**
   - *Environment*: lightning strikes forests and dry meadows; stumps smoulder (§11.8). The lightning fire leaves charred wood; a villager that witnesses it records SMOULDER_WOOD at low familiarity.
   - *Director-as-environmental-event*: because pressure(`tool_edge`) > 0.3 for two seasons *and* no charcoal exists in reach, the "smouldering stump" event row is eligible and places the precondition near the settlement (a mound of earth over a smoking stump). It grants nothing; it only makes charcoal **possible**.
   - *Validator*: at worldgen the seed is checked that charcoal has a route (forest wood + an enclosed low-oxygen context buildable from clay/earth) or an event row that can create one, and that a ridge/draft site exists within R (§11.10).
6. Someone (witness or tinker) finds charcoal. A villager builds a kiln pit with charcoal on the ridge; heat 4 for two hours; SMELT_COPPER fires with attention 1.0, pressure x1.5.
7. Copper is **not** gated by a holder count (R10): one living knower with skill >= 0.3 can run it. Quality and speed depend on skill; unknowing villagers learn by working beside and by Teach.
8. Unlocks: `copper_ingot`, cast tools via clay moulds (a second phenomenon), the verb "mine copper", harder-rock breach. Era label "Copper age".

#### 15.5.3 Food preservation (alternate implementations)

Setup: three hard winters; pressure(`keep_food`) = 0.6 (EMA of shortfall).

- Salt: found on beach pans or an inland seep; CURE_MEAT_SALT (meat + salt, shaded, >= 3 days).
- Drying: DRY_STRIPS (meat/fruit, airy and dry, >= 2 days); fires unattended on a rack in autumn wind.
- Smoking: SMOKE_FOOD (meat + smoke from low wood fire, enclosed).
- Cold cellar: a dug room below frost line; spoilage drops with cold (§14.6).

Walk-through: Mira finds salt as a stranger material; her tinker weight for {meat + salt} is `1 + 2*0.6 + 1 = 3.2` vs ~1; meanwhile an unattended DRY_STRIPS fires and a hunter witnesses it (pressure raised attention). The settlement now has two partial answers; which one it **commits** to depends on terrain (a coastal village salts; a forest village smokes). These are **alternate implementations of one capability slot** ("preserve food through winter", §16.4) with different costs and failure modes. Chronicle: "the Marsh Reach learned to smoke fish."

### 15.6 Mechanics: Almanac, Curiosities, near-miss hints

**DECIDED (R12).**

1. **Almanac** (per settlement): crafts known, grouped by capability; holders by name; strength words from familiarity ("sure / fairly sure / half-remembered / only one knows"); dead ends ("tried, nothing"); last-holder risk icon.
2. **Curiosities**: live itches in plain words ("Mira keeps turning over the white crust from the shore"), plus wild things seen on expeditions (R27). Source: unresolved stimuli behind `itch`.
3. **Near-miss hints**: when an attempt matched a phenomenon on inputs but missed on a context level, after >= 3 failures the Almanac states the gap in words ("hotter", "longer", "drier"). They **never name the product** and are directional only.
4. **Silhouettes**: after finding a relic or foreign item: "it is metal; nobody here knows how it was made."
5. **"Why is no one experimenting?"** is a Why-panel entry: no free time / no itch / no candidates in reach / danger-averse (tech review).

### 15.7 The slice: ~12 linked discoveries

**ASSUMPTION; hand-authored, deeply interlinked (tech review).** Leaves to copper/iron. Each row is a phenomenon + craft + capability; arrows show preconditions.

| # | Discovery | Needs | Opens |
|---|---|---|---|
| 1 | FIRE_TENDING | lightning/ember, wood | hearth, warmth, cooking |
| 2 | KNAP_STONE | stone, flint | stone tools, cutting |
| 3 | CORDAGE / HIDE_WORKING | fibre/hide, knife | bindings, backpack, tent |
| 4 | FRAMING | wood, axe | cabin, supports |
| 5 | BAKE_CLAY / POTTERY | clay, hearth (heat 2) | pots, jars, kiln part |
| 6 | KILN_FIRING | pottery, charcoal or hot wood fire | level-3 heat, brick |
| 7 | SMOULDER_WOOD (charcoal) | wood, covered pit | carbon fuel |
| 8 | DRY / SMOKE / SALT (one chosen) | food + shade/smoke/salt | winter larder |
| 9 | SMELT_COPPER | malachite, charcoal, level 4 | copper ingot |
| 10 | CASTING | copper, clay moulds | cast tools |
| 11 | HAMMER_NATIVE (cold-hammering) | native copper/ingot | sheet, fittings |
| 12 | SMELT_IRON + FORGE_WELDING | iron ore, level 5 | iron tools, deep rock |

Content cost: ~6-10 designer-hours per interesting discovery (tech review) = 10-15 FTE-weeks for the slice. Content is not independent; adding a phenomenon lengthens everyone's candidate list, so the cap and cadence tuning is global.

### 15.8 Mechanics: knowledge loss, rediscovery, eras

**Knowledge loss (R11).** If the last holder of a craft dies, the craft is unavailable and the chronicle says so. There is no permanent lock and no silent downgrade. **Evidence** (built kilns, stored products, ruins, relics, silhouettes) makes rediscovery cheap: a tinker job near evidence rediscovers at a large discount (D: x0.4 time). Chronicle entries serve as hints.

**Transmission (R10).** Working beside / watching (slow), **Teach** action (fast, costs the teacher's time), kin learn faster by proximity (ASSUMPTION x2), splinter founders carry knowledge (§17.5). Documents/libraries are later and cap skill at ~0.3-0.4. Observation: learner gains `0.02*aptitude*(1-skill)` per hour in sight of a practitioner (cap: one learning target per learner; tech review).

**Lifespan check (R1).** A skill must be learnable in 20-35% of a life, tuned so average aptitude reaches 0.7 in about 30% of a life. Prototype: 10 generations of a 3-smith village; craft survives >= 8 of 10 (tech review 6).

**Era labels (R14).** Labels are derived from capabilities held, shown in the chronicle, never gates:

| Label | Signature (any living knower + enabler) |
|---|---|
| Hearth age | FIRE_TENDING |
| Stone age | + KNAP_STONE |
| Clay age | + POTTERY |
| Timber age | + FRAMING + BRICK/DRESSED STONE |
| Copper age | + SMELT_COPPER |
| Iron age | + SMELT_IRON + FORGE |

Skipping an era is legal and appears as a hole in the chronicle. The first-planet endpoint is a Mechanical era (wagons to early rail) with an observatory capstone that seeds the space expansion. slime-village's 14-step quest chain (First Light, Knapping, The Hearth, Bench and Vice, The Iron Age, The Crucible...) is retained as chronicle "firsts", not unlocks.

### 15.9 Mechanics: solvability and anti-soft-lock summary

| Lock | Prevention |
|---|---|
| Key material absent from the map | Worldgen validator (§11.10), >= 2 routes per key input |
| Missing precondition (charcoal) | Systemic event places it when pressure + absence (§11.8) |
| Only holder died | Familiarity spreads; Teach; rediscovery discount near evidence; skills never gate attempts |
| Dead end blocks retry after a better kiln | Dead ends keyed to context level; invalidated when exceeded |
| Population too dull | Priorities (nudge) plus immigrants; ambition is pace, not a gate |
| Tuning drift | Headless bots (idle, competent) x 20 seeds x 50 years, stuck rate < 2% (R25) |

### 15.10 Mechanics: how player priorities nudge

Nothing is a research button. All nudges go through the same sim.

- **Priorities** (carried over FOCUS weights): a focus on `tool_edge` or `keep_food` raises pressure(tag) in the demand vector; this boosts witness strength and tinker weights. Soft: a starving village eats first.
- **Provision**: place materials where people will encounter them, build a kiln pit, fell wood for charcoal. Changing the situation changes the candidate set.
- **Commission an experiment**: assign 1-3 villagers at a station with chosen stock; candidates narrow to those inputs, so chance rises at the cost of labour. One button "Investigate: X" on an unfamiliar material.
- **Possess**: do the act yourself (attention 1.0). Optional, never required.
- **Send explorers** for stranger materials, relics and Curiosities.
- **Assign an apprentice** (optional "you, learn smithing from Dov"); the default is implicit by proximity.

**Vignette.** The player sees "Dov wonders about the green rock" and "stone blades are chipping". They set a focus on tools, build a clay-lined pit on the ridge and have lumber turned to charcoal via a standing order. A tinker job starts with Dov and two helpers. Four days later the chronicle reads "Dov made metal."

### 15.11 Interactions

- §11: context, events, validator; §12: stations expose context; evidence is built things.
- §13: stranger materials and ruins create Curiosities; hazards produce witness events.
- §14: recipes read capabilities; materials share data; quality by skill.
- §16: culture biases attention and candidate weights; alternates differ by environment.
- §17: capabilities gate command scales; founders carry familiarity.

### 15.12 Progression

Capability growth is a graph of discoveries (15.7) and not a tree; the player sees which are known and which are open, never the answer key. First-planet release adds husbandry/biotech alternates (R13), documents and libraries, more phenomena toward Mechanical era (~110-130 total at full scope; tech review risk 5). Post-slice content stays data.

### 15.13 Failure states

| Failure | What happens |
|---|---|
| Stall | Why-style entry names the reason; hints appear after repeated failures |
| Last knower dies | Chronicle line; craft unavailable; evidence-aided rediscovery |
| Tinker killed | Real cost; dangerous phenomena warn |
| Wrong commitment (salt village without salt) | Alternate path remains; environment decides |
| Over-priority | Soft; critical needs override |

### 15.14 Exploits and counters

| Exploit | Counter |
|---|---|
| Brute-force try-all | Consumes stock and labour, cooldown per station, cap 8 candidates; informed is 3-5x faster, so informed play is rewarded not locked |
| Experiment farming for XP | Skill XP is output-matched; tinker XP only from successful value |
| Looking up recipes from forums | Per-seed property perturbation (post-slice, D 17: +/-10%) validated by harness |
| Protect-holder bunkers | Loss is graded and recoverable; no mandatory micromanagement |
| Possession for discovery | Only Steadfast; attention equals performing; no multiplier on cadence |

### 15.15 MVP vs later

**MVP:** the 12-discovery slice, data schema, context for heat/enclosure, witness, tinker (cap 8), Almanac, Curiosities, near-miss hints, era labels, rediscovery discount, validator, discovery trace log and force-fire debug command (~1 FTE-month). **Later:** husbandry/biotech alternates, documents and libraries, ancient site templates, per-seed perturbation, belief mechanism, Mechanical era content.

---

## 16. Species, Cultures & Alternative Progression

### 16.1 Purpose and player experience

**Purpose.** Let settlements diverge by environment and history, and keep the structure ready for other species and ways of knowing, without multiplying first-planet content.

**Player experience.** Two settlements on the same planet feel different because of terrain and what they did: a coastal one salts fish and carries bone tools; a forest one smokes and works timber. The chronicle describes a culture ("hunters of the Marsh Reach") in plain words. Nothing is a multiplier.

### 16.2 Mechanics: species as data (R15)

**DECIDED.** Slimes only on the first planet. Species is a data table:

| Field | Meaning |
|---|---|
| `traits` | the nine heritable traits with soft cap (carried over `settle()`) |
| `needs` | hunger, thirst, sleep, comfort, warmth |
| `body_plan` | size, carry capacity, sight, speed |
| `diet` | what it eats and how it breeds |
| `aptitudes` | skill-rate ranges per craft |
| `heat_tolerance` | max sustained heat context |
| `available_capabilities` | tag preferences/limits (e.g. a species that cannot sustain heat > 3 never finds the smelter) |

A second species is **data plus art** (R15). Dorfs are a candidate future species with nothing to port from the old Godot project except the idea (B). Differences are tag preferences and capability availability, not whole separate trees.

Slimes' traits: carried-over soft-capped inheritance (child ~ mean of parents + mutation), convex trait upkeep (R16), environment-dependent value, clone limit (solo split <= 1 per life; clones regress toward mean). Genes move output +/-25%; tools (1.5-5x) and skills (<=1.8x) carry the large multipliers.

### 16.3 Mechanics: culture = chronicle tallies

**DECIDED (R14, cuts).** Culture is a settlement's **running record of what it has actually done**, not a faction and not a tech tree. Mechanism (MVP, tiny):

1. Per day, tally time-use by activity tag: forage, hunt, farm, mine, build, craft:<verb>, wander, rest, gather, tinker. Keep an EMA over ~1 year: `lean[tag] = EMA(share of work time)`.
2. A **leaning** is named when `lean[tag] > threshold` for N seasons (e.g. hunt > 0.35 for 4 seasons -> "hunters"). Names are descriptive labels shown in the chronicle, not buffs.
3. Effects (never output multipliers):
   - **Attention bias**: witness x1.3 for phenomena whose verb a leaning favours (hunters notice bone and hide properties).
   - **Tinker candidate weights** get the same bias.
   - **Inherited lean**: children's `temper` offsets drift toward adults they spend time with.
   - **Rehearsal**: leanings slow decay of related skills (familiarity/skill rust).
   - **Mood/belonging** from shared traditions (carried over belonging pattern).
4. **Traditions** (data rows, ~8 post-slice, triggered by events plus repetition): `winter_feast`, `ancestor_grove`, `founders_day`. Each adds a recurring leisure activity, modest mood, and mild rehearsal. MVP ships **leanings only** (traditions as systems are cut from MVP).
5. **Diffusion**: wanderers bring neighbours' habits at low strength.

**Mysticism is folded into culture** (R13): rituals, totems, graves and the existing golden idol are traditions with mood/belonging; there is no mysticism tree.

### 16.4 Mechanics: alternate implementations per capability slot (R13)

One discovery system, one path on the first planet (craft/engineering). For selected **capability slots**, several implementations exist; the environment (and what the settlement happens to find) picks which gets built.

| Slot | Alternates | What differs |
|---|---|---|
| Preserve food | salt, dry, smoke, cold cellar | needs coast/seep, dry wind, fuel+enclosure, a hill and digging; spoil rates, labour, failure modes |
| Carry water | jar, wooden bucket, bladder | clay, planks, hide; weight and leakage |
| Build walls | wattle and daub, timber frame, stone | clay+fibre, framing capability, masonry |
| Tool edge | stone, bone, copper, iron | availability, durability, hardness property |
| Light | torch, oil lamp, candle (later) | fuel and wax availability |
| Textiles (post-slice) | weaving, felting, hide | fibre vs herd |
| Husbandry/biotech (post-slice) | domestication, selective breeding, fermentation, dyes | slow, renewable, low infrastructure; blight and season risk |

Alternates are *not exclusive*; a village may hold several. They differ by **what you build around and what fails**, not by gating. Biotech-like alternates use husbandry and genetics the author already has and ship after the slice (R13; B13 deferred).

### 16.5 Mechanics: collective belief (Experimental, deferred)

**R13: Experimental, deferred.** The brief's Ork-style "belief makes it work" is **not** in the first-planet game. B/D's proposed rules are preserved in OPEN_DECISIONS so it can be added without a schema change (`mechanism` field):

- `belief(C) = share of living adults holding a creed for C at familiarity >= 0.5, weighted by participation in a ritual job during the last season`.
- A belief-mechanism capability raises a **context parameter** of one phenomenon by at most **+1 level** within radius R of a focus structure (totem/idol/shrine). It does not create matter, never exceeds a cap, decays if rituals stop, and **fails visibly** when belief falls below threshold ("the sacred forge goes cold").
- Doubt rises with failure; a schism splits the village into rival creeds.
- Each use spends conviction; regrowth needs leisure (ritual, story), which costs labour (a sink).

**Reasons it is deferred:** (1) it adds a new notion type, ritual jobs, shrine structures, doubt/schism dynamics and a belief-readout UI; (2) it is a second progression system parallel to physics with its own balance: either strictly worse than physics (nobody picks it) or a free lunch (everyone does); (3) it creates a new class of "why did it fail" bugs; (4) the author left it a candidate needing "clear rules or cut"; (5) the right home is a later species whose whole tech is belief (e.g. orks), with a species table flag `mechanism: belief`. First-planet use of belief-like ideas is limited to culture traditions.

### 16.6 Interactions

- §11: biome/climate decides which alternates are available.
- §12: building styles reflect alternates; leaning biases shapes (no mechanic).
- §14: material and recipe data per species; upkeep per trait.
- §15: culture biases witness and tinker; alternates are separate phenomena rows.
- §17: founders carry leanings and familiarity.

### 16.7 Progression

Cultural description evolves with leanings; a settlement's chronicle label changes ("hunters" -> "smiths"). Alternates accumulate: more ways to preserve food raise resilience. New species or belief appear only in later content, as data.

### 16.8 Failure states

| Failure | Result |
|---|---|
| Culture cosmetic | If playtest does not feel attention bias, culture is cut to labels only (B risk 8) |
| Monoculture | A lean of 0.8 hunt starves the farm; pressure rises and the lean drifts back |
| Wrong alternate | A salt village without salt; Why panel shows missing input; other alternates remain |
| Genetic over-selection | Convex upkeep; breed-best bot gate (R16) |

### 16.9 Exploits and counters

| Exploit | Counter |
|---|---|
| Breed-best | Convex upkeep, environment-dependent value, clone limit, soft cap; gate: breed-best colony <= 1.15x normal after 30 generations (R16) |
| Culture min-max | No output multipliers; only attention/weights |
| Pick best alternate always | Environment decides availability; each has costs and failure modes |

### 16.10 MVP vs later

**MVP:** slimes only; species table; leanings (tally labels); 3-4 alternates (preserve food, tool edge, walls); chronicle culture lines. **Later:** ~8 traditions, biotech alternates, second species, belief mechanism, rival civilisations as ruins/NPCs.

---

## 17. Settlement Growth & Automation

### 17.1 Purpose and player experience

**Purpose.** Let the player scale from commanding individuals to running a supplied network of settlements without turning the game into automation, and without belts or drones (AGREED). Automation here means **higher-scale commands executed by people**, never by machines. **Autonomy maintains; the player advances** (RESOLUTION organising sentence).

**Player experience.** Early: "Bob, collect that iron." Later: "keep iron supplied" for a mine. Later: "supply network" between two settlements by wagon. At each stage the player gives fewer, higher-level instructions, and sees where they stall.

### 17.2 Mechanics: command-scale progression

| Scale | Example | Written as | Unlocked by |
|---|---|---|---|
| Personal | "Bob, collect that iron" | Commanded job for one villager | start |
| Crew | "These five: chop" | Named selection + task + stall summary (R6) | first group > 3 |
| Standing order | "keep 200 iron" | Stock target with hysteresis (R7) | first stockpile exists |
| Blueprint | "build x10 houses" | Batch of ghost sites (R19) | first enclosed built room saved |
| **Supply order** | "keep iron supplied" | A standing order scoped to a **source** (mine/crew) and a **sink** (stockpile or station) | a stockpile near a producer and a crew assigned |
| **Supply network** | "send timber from the forest settlement to the foundry" | Recurring route job between settlements at a given transport tier | a second settlement + wagon tier + road |

Every scale writes into the same two structures (demand vector, job pool); higher scales do not add a scoring layer (R5, R6).

### 17.3 Mechanics: capability-gated command scales

**PROPOSED, extends A and R10.** A command scale appears in the menu when a living villager can carry it out and the physical thing exists:

| Command scale | Gate |
|---|---|
| Crew | at least one other villager unassigned |
| Standing order | a stockpile and a producer exist |
| Blueprint stamp | one saved room qualified (§12) |
| Supply order | keep-N on a producer + a hauling capacity >= tier 1 + a crew |
| Supply network | wagon capability (a living knower, §15) + wheel/axle + road segment + two settlements |
| District order (later) | a record-keeping capability (writing) |

Gates are **capabilities, not player grinding** (A). A Steward (a villager autonomously choosing from the blueprint library) is a post-MVP option (R8); in its place, district standing orders scope an order to a building group.

### 17.4 Mechanics: transport tier as automation

The only automation is the **transport tier** (R21; §14.7): each step cuts the labour per unit moved. A "keep iron supplied" order at tier 0 occupies several haulers; at tier 3 one driver and a wagon. The order stays honest: if the mine is 80 cells from the foundry and only hand carrying exists, the order shows "behind by 38; no free hands; 3 are busy with food".

### 17.5 Mechanics: settlement splitting and new settlements

**Carried over from slime-village `maybeSplinter` / `findVillageSite` / `siteScore` and `adoptRuins`.**

- A settlement may be split by the player's order ("found a settlement") or by pressure (overcrowding, housing demand), a band of the **most driven members** with a starter cache walks out to a scored site.
- **Founders carry knowledge** (change from slime-village, B): a splinter keeps the familiarity of its founders, plus chosen blueprints and the leanings of its founders. Slime-village passed only ambition; this is the cheapest and most visible knowledge-travel mechanic.
- A new settlement starts with a starter shelter set (R8) and an empty quest chain; its chronicle starts anew, keeping a pointer to its parent.
- Ruins can be adopted: a band moving into the ruins of an old settlement inherits the chronicle and any surviving evidence (carried over).
- Site scoring: water, food, wood, stone, warmth, distance, existing claims (carried over). The player sees candidate sites ranked; they can place the founding stake.
- Far settlements are simulated by aggregate LOD (R22 later) with a chronicle digest on return.

### 17.6 What stays manual

| Manual by design | Why |
|---|---|
| Choosing new building kinds and designs | "Autonomy maintains; the player advances" (R8) |
| Starting expeditions | New place = player |
| Founding settlements | New settlement = player (or confirm a suggestion) |
| Choosing research direction | Priorities and provisioning, not automation |
| Teaching a rare craft in a crisis | Optional order; default implicit |
| Possession | Optional, never required |

What is automated by villagers: eating, sleeping, hauling, repair, replanting, firewood, healing, fleeing, starter shelters and flagged blueprints (R8).

**Vignette.** Mid-game, the player has "keep 300 iron" on the north mine. They notice the Why panel says "behind: hauling, 3 haulers on food". They build a wagon shed and a stone road to the foundry. The same order now shows "on target". Later, they found a second settlement beside the forest with two builders and a blueprint library, and set "send planks to the foundry" as a supply network entry. The supply order shows the wagon's status in the Ledger; nothing else is micro-managed.

### 17.7 Interactions

- §12: blueprints and auto-build flag are settlement-scale; §13: expeditions found settlements; §14: standing orders and transport tiers; §15: capabilities gate scales; §16: founders carry leanings.

### 17.8 Progression

Stages: Camp (personal + crew) -> Village (standing orders, blueprints) -> Town (supply orders, wagons) -> Network (supply routes between settlements, rail later). Space (expansion) is out of scope.

### 17.9 Failure states

| Failure | Result |
|---|---|
| Overextension | Strain debt (carried over): crews held on a task accumulate strain and sickness |
| Supply stalls | Why panel: no_stock / no_path / no_free_hands |
| Settlement dies | Becomes ruins with chronicle; can be adopted |
| Splinter too small/ignorant | Founders carry few crafts; loses capability; evidence helps |
| Hub-and-spoke fragility | One wagon lost interrupts; no hidden redundancy |

### 17.10 Exploits and counters

| Exploit | Counter |
|---|---|
| Max-expansion (many settlements, blueprint spam) | Labour/maintenance plateau (<5%/year growth); cap pending sites; each settlement needs housing, food, defence |
| Founder cherry-picking to duplicate skills | Founders leave the parent; knowledge is not copied (the parent keeps it too, but founders are removed labour) |
| Order stacking | Standing orders pause when met; caps per storage |
| Absent-player (AFK) | Autonomy maintains; no catch-up, chronicle digest on return (R22) |

### 17.11 MVP vs later

**MVP:** personal order, crew, keep-N standing order, blueprint stamp, one expedition type, founding a second settlement by splinter with founders carrying familiarity. **Later:** supply orders between producer and sink, wagon networks, district orders, supply routes between settlements, aggregate LOD for far settlements, Steward as optional QoL, rail.
