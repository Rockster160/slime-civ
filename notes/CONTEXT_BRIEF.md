# Context brief

Source: `initial_prompt.txt` (the brief + a Discord conversation between Rockster160, the author, and octoshrimpy). This file separates what the author has **agreed** from what the brief offers as **candidates**. Agents: treat AGREED as canon unless you show strong evidence against it; treat CANDIDATE as open.

## The game in one paragraph
A persistent procedural civilization sandbox. The player is a god/commander over a handful of living creatures who start sleeping in leaves and grass. The same individuals and settlements carry through to metalworking, industry and eventually (expansion only) space. Inhabitants are autonomous individuals with genetics, personality, learned skills, needs and permanent death. The player gives orders at several scales, designs buildings freeform, and may possess one inhabitant to act directly.

## AGREED (author's own words in the Discord log)
- Player is the god/commander, not a character. Orders are task assignments: "you 5, go harvest lumber", "you, build a bakery right here".
- Buildings are free-constructed (MC/Terraria style). A workspace qualifies by requirements (size, materials, N tables/chairs...). A finished building can be saved as a blueprint and mass-ordered: "build 10 more of these houses".
- Progression unlocks new buildings/capabilities, StarCraft-like ("once you build certain buildings, it unlocks..."). The RTS *competitive* part (wiping out other players) can be dropped.
- Possession: take over any inhabitant to explore, mine, fight. They get a "divine inspiration" buff while controlled — a push, not a requirement.
- Automatic exploration in mines (dig deeper / seek specific materials).
- Every creature: natural stats (genetic) + experience gained from what they actually do, including off-time. **No manual point allocation.**
- Permadeath. "Send your max-level miner into the woods, he might get killed by a monster and now he's gone forever."
- Genetics: child ≈ average of parents + mutation chance (sudden excel / sudden weakness). Already implemented in the author's Slime Village (see `notes/existing_material.md`). Breeding needs a guard against min-maxing ("genetic prowess capped").
- Eras: sleep in leaves/grass → hide teepee → wood cabin → rock/brick/metal → space age, where you travel to other planets "to see what other players have built". **Focus on nailing the first planet.**
- Camera: author prefers ONE view type ("cameras are hard enough to balance"), but likes Dragon Quest XI's dual-view (same world in 3D or top-down 2D, no advantage either way). Delver-style billboard sprites floated as a way to make view-switching cheap.
- Logistics: **NO Factorio conveyor belts out in the world; no drone/bot labor.** Transport ladder: by hand → box → backpack → wagon → animal-drawn carriage → eventually trains. "Collect reasonable resources and do epic stuff with what was originally minimal", not "automate the universe". Labor stays manual, assisted by machinery. (octoshrimpy wanted drones as very-late sci-fi; author unconvinced — treat as OPEN, default no.)
- Factorio *blueprints* are wanted; Factorio *scale automation* is not.
- Life cycles apply to the whole world: plants and animals are born, grow, age and die.
- Slime Village currently is a hands-off sim; the plan is to "dumb them down so the player is responsible for telling them what to do and what to build and where." → tension with autonomy pillar; must be resolved deliberately (see brief pillar 6/7: village must not be helpless when player is away).
- **Magic cores (author lore, 2026-10-28):** magic cores create dungeons and labyrinths. Nearer a core means richer ore and valuables, more traps and treasure, and more monsters spawning in nearby caves (and on the surface when close). Caves are long, winding and multi-layer, with varying safety. Plan: notes/impl/PHASE7_CORES.md.

## Hard constraints from the brief
- First planet must be a complete game. Space = later expansion, never a prerequisite.
- No rigid Civ-style tech tree as primary progression. Tech = new capabilities, not +% bonuses.
- No energy systems, daily chores, timers, streaks, manipulative loops.
- No manual control being mandatory or overwhelmingly optimal.
- AI and player-driven actions run through the same simulation.
- Multiplayer (future) favors consensual visiting/coop, not invasion.
- Don't commit to an engine, a final title, or full 3D voxels without cost analysis. Evaluate ≥2 world representations.
- Don't implement the game. Deliverable is documents.

## CANDIDATE (brief offers; not yet decided)
- Collective-belief tech pathway (Ork-style) — needs clear rules or cut.
- Alternative paths (engineering / biotech / mysticism / belief).
- Multiple species with different progressions.
- Room auto-recognition vs explicit designation vs hybrid.
- Camera: top-down vs isometric vs side-view vs optional first-person.
- Knowledge transmission via teaching/observation/apprenticeship/documents.
- Event chronicle / history log.
