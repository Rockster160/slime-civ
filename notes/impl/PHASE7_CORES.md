# Phase 7: Magic cores, dungeons and caves (PLAN ONLY — not approved to build)

Author direction (2026-10-28):
- Underground caves and dungeons must exist.
- Caves can be long, winding and multi-layer, with varying degrees of safety.
- **Lore:** magic cores create dungeons and labyrinths. The closer an area is to a core, the richer it is in ores and valuables, and the more dangerous: dungeons hold traps and treasures, and monsters spawn in nearby caves (and on the surface if a core is close enough). More monsters live and spawn the closer you are to the core.

## Design in one paragraph
The world gains a **core field**: a scalar "mana" value at every cell. It is computed by a pure coordinate rule from the magic cores scattered through the endless world.
- **Ores and valuables** take mana as an input to their placement weights.
- **Monster spawning** takes it as its rate.
- **Danger tiers** of caves and dungeons are bands of the same field.

A core sits at the heart of a **dungeon** (an authored-by-rules labyrinth with traps and treasure rooms) and radiates outward through the cave network around it. So the player reads one gradient everywhere: richer means deeper, closer and more dangerous. This gives exploration, mining, expeditions and possession (Steadfast and risk access, K7) a clear reason to push toward danger. The village's autonomy still keeps people away from it unless the player sends them.

## Fit with existing rules
- **Determinism and endless world (S16):** cores, the field, cave networks and dungeon layouts are pure functions of (seed, coordinates).
  - Cores are placed per coarse region (e.g. 256×256 cells) by a hashed rule.
  - Dungeons are generated per core with a bounded footprint and evaluated per chunk by looking up the region's cores.
  - Order-independence tests extend S16's.
- **Autonomy maintains, the player advances (R8):**
  - Autonomous villagers treat high-danger bands as restricted cells (UNSAFE), just like the thornback lair.
  - Delving is always a player decision: an order, an expedition or possession.
  - The village is never forced into a dungeon to survive.
- **Discovery (R12, R27):** dungeons are where the GDD's ruins and ancient sites live. Their evidence and artefacts feed Curiosities and rediscovery. Whether cores also open a magic tech path is **OD-46** (below); the default is no.
- **Combat (R20):** dungeon monsters reuse the S8/S14 fauna data rows, fear, melee and Steadfast. No full combat system; traps are hazards like cave-ins and bad air.
- **Hard constraints:** no daily chores or timers. Spawning is world simulation, not a "wave" timer the player must answer. The near-core danger can be avoided entirely.

## Stages (proposed)

### S20 Core field and cave networks
- **Magic core placement.** Roughly 1 per region, deep, never within ~150 cells of spawn. Spawn gets one "far but findable" core whose landmark is visible from high ground.
- **Field.** `mana(x,y,z)` falls off with distance (integer falloff, lookup table, no Math.exp). Bands: 0 wild, 1 stirring, 2 charged, 3 deep, 4 heart.
- **Cave networks replace S16's simple worms.**
  - Long winding multi-level systems: tunnels, chambers, vertical shafts and ramps, underground rivers/lakes, chasms.
  - Built from noise-guided paths between region nodes, multi-layer by design.
  - Safety varies by depth, by mana band, and by hazards (cave-in-prone spans, gas pockets, dark).
- **Resource weighting.** Ore, coal, malachite, iron and new valuables (gems, crystal, "core-touched" ores) scale with mana. Surface ore outcrops appear near shallow cores.
- **Visible on the map.** Mana shows as a faint shimmer or tint (show, don't tell), and the cell card shows a danger pip.
- **Tests.** Field purity and order-independence; resource density rising with mana; cave connectivity (a sample network is traversable across ≥3 levels); the spawn safety radius over 20 seeds; memory bounds when walking through networks.

### S21 Dungeons (labyrinths)
- **Generator.** Per core, a bounded labyrinth (e.g. 48–96 cells across, 2–5 levels) of rooms, corridors, stairs and dead ends, laid out by a deterministic room-and-maze rule. Built from a dungeon wall material that resists digging (hard to bypass, but it can be dug with iron tools, slowly).
- **Entrances.** Linked to the cave network and sometimes to the surface (a ruin entrance landmark).
- **Room kinds.** Corridor, trap hall, treasure vault, monster den, the core chamber, and "ancient workshop" rooms whose evidence speeds up rediscovery and carries Curiosities.
- **Traps** (data rows; hazards, not puzzles):
  - pressure plates (darts: damage)
  - pits (fall a level)
  - collapsing floors
  - gas vents (bad air)
  - Each is hidden until seen by a careful villager. Perception and intelligence traits help. Once seen, it is marked and avoided by pathing. It can be disarmed (a craft-skill job) for a component reward.
- **Treasure.** Items and valuables placed by the room rule, richer near the core: ingots, gems, ancient tools (quality above what the village can make), heirloom-grade named artefacts with chronicle history, blueprint fragments ("ancient design": a new blueprint the player can use), and knowledge tablets (familiarity in a craft; the documents seam R10).
- **Fog and mapping.** The dungeon is fully fogged until explored. Its layout is not revealed by looking at it from the surface.
- **Tests.** Generator determinism and bounds; every treasure room reachable from an entrance; trap detection and disarm; loot by distance.

### S22 Monsters and spawning
- **Spawner rule.** Monsters spawn at spawn points (dens, dark cave chambers, dungeon rooms) at a rate rising with mana. A per-region cap rises with mana too. Spawning needs darkness, so light from torches and lamps suppresses spawns nearby: a player lever.
  - Surface spawns happen only where the core's field reaches the surface (bands ≥2 at ground level), and mostly at night.
- **Roster** (data rows on the S8/S14 fauna system; placeholder names):
  - cave crawler (weak, swarms)
  - core-touched thornback variant
  - a ranged spitter
  - a dungeon guardian at the core chamber (a boss-like, Steadfast-worthy fight)
  Each has habitat bands, drops (core shards and monster parts as materials), fear values and patrol rules.
- **Pressure on the village.** Monsters near the camp raise Concerns and can raid. A village built near a core is rich and dangerous, which is a real settlement choice. Walls, doors and light are defences; no tower-defence systems.
- **Autonomy.** Villagers flee or avoid as with the thornback. Crews with spears can be sent to clear a den (an order). Possession is the way to fight the guardian.
- **Tests.** Spawn rate monotone in mana; caps hold; light suppresses; no surface spawns far from cores; bounded entity count with monsters (memory); determinism.

### S23 Delving gameplay and the core itself
- **Expedition type "delve"** (extends S8/S17): a crew enters a dungeon, maps it, disarms seen traps, loots and returns, with recall rules tuned for danger (wounds, light running out). The stall summary names the trap or monster blocking them.
- **The core chamber.** Defeating the guardian lets the player choose: **harvest** the core (a large one-time haul of core material; the field fades over seasons, so the region becomes poorer and safer), or **leave** it (keep rich ores and spawns). This is a real tradeoff.
- **Map readability** (show, don't tell): danger pips on the minimap, mana shimmer, trap glyphs once seen, a dungeon outline drawn as explored.
- **FPV (S18).** Dungeons are the natural home of first-person play: corridors, traps, a torch radius. Make sure the FPV renderer draws dungeon walls and traps.
- **Chronicle.** Deeds such as "first to enter the labyrinth", "guardian slain", "the core of the north ridge was harvested".

## Open decisions to settle before building
- **OD-46:** do cores open a magic tech path (core shards as a material in phenomena, e.g. a glowing lamp, enchanted tools)? Default: core shards are an ordinary material with a few new phenomena rows, with no separate magic tree (R13: one discovery system).
- **OD-47:** does a harvested core regrow somewhere else (a world-age cycle), or is it gone for good? Default: it is gone for good. Cores are dense enough in the endless world that more can always be found.
- **OD-48:** are dungeon layouts hand-authored templates assembled by rule, or fully procedural? Default: procedural rooms plus a small set of authored "set-piece" room templates.
- **OD-49:** can monsters cross into the core-free surface far away (migration)? Default: no. Spawned monsters stay within their band ≥1 territory.
- **OD-50:** dungeon wall diggability. Default: diggable only with iron tools, at 1/6 speed, so cheesing in through a wall is possible but slow.

## Effort (ASSUMPTION, same scale as MVP_SCOPE)
S20 0.6–1.0, S21 0.8–1.4, S22 0.6–1.0, S23 0.5–0.9 FTE-months of design and engineering, plus content (monster and trap rows, treasure tables) of about 3–5 FTE-weeks.
