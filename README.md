# Slime Civ

A colony sim in the Dwarf Fortress tradition, played with slimes. You do not command a village of slimes so much as nudge one: they have needs, temperaments, memories, families and a job board of their own, and you steer with orders, plans and the occasional act of possession, when you step into one slime's eyes and walk the world in first person. The land is endless, the winters are cold, and below the grass there are caves, labyrinths and magic cores guarded by things you would rather not meet.

It is a single HTML file, built from plain JavaScript with no dependencies.

> Status: playable prototype (version 7.23, shown in the in-game Menu). Phases 1 to 7 and an experience/memory system are built. Balance numbers are first guesses. See [Not yet](#not-yet-and-known-gaps).

## Run it

1. Open `game/slime-civ.html` in a desktop browser (Chrome or Firefox are the ones it is built for). Double-click it. There is no install and no server.
2. The map is drawn with WebGL2. Without WebGL the older flat 2D map is used as a fallback (you can also force it with `?flat=1`).
3. Add `?seed=N` to the address to pick a world seed (the same seed makes the same land). New worlds started from the Menu take a random seed or one you enter.
4. If `slime-civ.html` is missing or old, rebuild it with `node game/tools/build.js` (see [Under the hood](#under-the-hood)). `game/run` rebuilds and serves it at `http://localhost:5714/slime-civ.html`.

It is made for a mouse and keyboard. The top bar gets crowded below about 1300 px of window width.

### Saves

| What | How |
|---|---|
| Quick save and load | **Shift+S** saves, **Shift+O** loads. One slot, kept in this browser (localStorage). |
| Autosave | Every normal game saves itself once per game day into a ring of three slots. They are listed under **Menu > Autosaves**. |
| Files | **Menu > Download save (.json)** and **Load save from file...** |
| Full storage | If the browser has no room, the save is downloaded as a file instead and a message says so. |
| Ironman | Tick **Ironman** before **Start** on a new game: one autosave slot, no manual saving, no loading. What happens, happens. |

Key bindings and interface settings are kept in the browser, not in the save.

## The game

You land on day 5 of spring with seven slimes, a lake nearby and nothing built. A calendar day lasts 10 real minutes at normal speed (about 7 of daylight, 3 of night); a season is 25 days and a year 100. The first winter is the first real test.

### Slimes

Each slime is a person, not a unit.

- **Needs.** Food, water, energy, warmth and mood. A slime with a critical need drops what it is doing to fix it. Cold is the main killer.
- **Traits.** Nine inherited multipliers: strength, speed, stamina, intelligence, drive, leisure, fertility, longevity and hardiness (hardiness is maximum health and cold tolerance). The inspector shows them as nine columns around an "average" line.
- **Skills.** Three that grow with use: digging, building and crafting. Idle skills rust down to 70% of their level; what a slime has learned about a craft does not rust.
- **Temperament.** Three fixed numbers, bold, curious and sensitive, set at birth. They colour how the slime feels about events (see [Memories and experience](#memories-and-experience)).
- **Hobbies.** In free time a slime follows a pastime its traits suit: carving, singing, stargazing, collecting stones or weaving grass. It is flavour only: a small mood lift and chronicle notes, no economic effect.
- **Bonds.** Slimes who work or struggle together become friends; those who clash become rivals; some become partners (who share a bed) and some mentors. Each keeps at most six. Friends and rivals nudge where a slime chooses to work. When someone dies, those close to them grieve: worse mood and a little less output for a while.
- **Families.** Slimes breed in pairs, more readily in spring and summer and when there is food and a free bed. Children inherit a blend of their parents' traits plus hidden alleles. Close kin pair less willingly, and their children are more likely to be weak. A healthy adult can also **split** into two to five smaller selves (more when it is strong, fed and rested) and the original is gone: the colour is copied exactly, traits and needs drift by up to 5%, memories and bonds come along (a few are forgotten), and skills, health and age are shared out almost evenly, minus a tenth of the skills and health. Lineages carry a colour mark.
- **Ageing and death.** A life is about five game years: child, adult, then elder, when fitness fades. Slimes die of old age, cold, hunger, illness or wounds. The dead are buried with an inscription and may pass on an heirloom. Deeds earn titles ("first potter", "master digger") that appear in the notables strip.

### What they do on their own, and why

Slimes are autonomous. Every slime constantly scores the jobs available and takes the best one. The order of precedence is: **their own critical needs, then village emergencies, then your orders, then standing orders, then ordinary village demand.** Inside a class, traits, skills, distance, friends and memories adjust the score.

The village runs a **job board**. It watches the food runway, the beds, the racks and the coming winter, and creates demand: more food, more beds, berries dried for winter. You can add standing orders by setting a **keep-N** target on a stock tile ("keep 40 logs"): idle slimes then top the stockpile up and stop at the target.

**Why?** Select a slime and open the **Why?** disclosure in the inspector. It shows the current job, the score breakdown, and the alternatives that lost in plain words. When a slime is stuck, its blocker is named ("no path", "needs a pick", "unsafe"). This is the main tool for understanding the village. If a slime is doing something silly, Why? will say why.

### The world

- **Endless terrain.** The land is generated on demand from the seed, in every direction and at every depth. Exploring reveals it; unexplored land is drawn dim and what you have seen is remembered. Far chunks go dormant when nobody is near and are caught up when someone returns.
- **Biomes.** The meadow around the start, cold pine **highland** (little to forage, fewer hoppers, salt) and wet **marsh** (reeds, clay, peat, herbs, stagnant water, many hoppers). The Almanac's "This world" page lists what your seed has and where.
- **Geology.** Soil, then soft rock with flint and a green stain of malachite (copper ore), then hard rock with iron and coal. A clay bank, lakes, rivers and ridges. Rock nobody has stood beside is dark.
- **Seasons and the clock.** Spring, summer, autumn, winter, 25 days each. Berries grow from spring to autumn; crops follow the seasons and fallow in frost; the cold deepens every winter. Night is dark and, on the surface, dangerous.
- **Weather and events.** There is no rain or snow system. What happens is seasonal temperature and the systemic events: as winter closes in and nobody knows fire, a **lightning strike** may set a tree near the camp alight, which is how fire is first found. Later a smouldering stump can show a slime charcoal.
- **Fire.** Fire is found, not researched (see [Crafting and discovery](#crafting-and-discovery)). Fire rings warm slimes nearby and, in a closed room, the whole room. Slimes feed them sticks and logs as a chore. Meat cooks beside a fire.

### Food, farming and husbandry

- **Foraging.** Berries (warm seasons only, they spoil), tubers (any season, under the frost), grass tufts, and in winter a slow root-digging.
- **Preservation.** Berries dry on **racks**. Smoking, salting and air-drying each need their own discovery. Clay **jars** and a **cold cellar** slow spoilage; the Village panel shows what is rotting soon. The **food runway** in the top-left HUD is days of food per head, with a winter marker.
- **Hunting.** Hoppers are small, shy and good meat. Right-click one to send hunters. Hides are useful once someone learns hide working.
- **Farming.** Once someone learns cultivation (by watching or by burying a seed), you mark a **field** and the village tills, sows, waters and harvests.
- **Husbandry.** Once someone learns it (by hunting or from a grass heap), you mark a **pen**, villagers fence it, and the **Capture** order brings in wild hoppers. Penned animals need fodder, breed, and are slaughtered when a keep-N asks for meat. Large grazers can be penned in a big pen and later pull carts.
- **Kitchens and storage.** A room with the Kitchen purpose and a fire ring turns raw meat and tubers into more and longer-lasting food.

### Building, rooms and shelter

Press **B** for build mode. You plan **ghosts**: walls, floors, roofs, doors, beds, racks, fire rings and, once the craft is known, kilns, charcoal mounds, bellows, workbenches and water jars. Slimes fetch materials and build them. The pieces:

- **A roof** needs a wall within 3 cells to hold it up. **A room** counts only when it is closed, roofed and has a door.
- **Click inside a room** to give it a purpose: Shelter, Bedroom (beds rest better, partners share), Kitchen, Storage (shelves, slower spoilage) or Workshop (a bench, better work). The card lists what is missing.
- **Materials climb a ladder** as the village learns: wattle and thatch, then hide (teepee), dressed stone, timber and planks, fired brick.
- **Blueprints.** Capture a building as a design and stamp it again. Revise a design and **Push revision** to rebuild every copy that follows it.
- **Deconstruct** takes finished pieces down (about 75% of the materials come back). **Erase** cancels plans.
- **Wheels, wagons and carts** (once framing is known) carry about five times a slime's load over long hauls.

### Mining, caves and underground hazards

The **Dig** tool (in build mode) marks ground for slimes to dig: a **region** (drag a box, N levels down, stepped so they can climb out), a **stair down**, **follow a vein**, or **seek** a material (flint, malachite, clay and more), which makes them tunnel through unseen rock in a spiral. They know only what they have seen.

Underground has rules:

- **Cave-ins.** A hall wider than 4 cells with nothing holding up the roof (rock, a pillar, a timber support) cracks, then falls: rubble, and whoever is under it is hurt. The mine planner leaves pillars; slimes post timber supports on a cracking roof. Posting one by hand is a possession action.
- **Bad air.** Dead-end tunnels without ventilation collect foul gas. Vents and bellows clear it.
- **Light.** The dark slows work. Torches and copper lamps give light, and widen what is seen.
- **Illness.** Spoiled food, stagnant marsh water, carrion and crowded stuffy rooms can make slimes ill, and it spreads to those close by. The sick work at 60% and walk slower. Rest, a bed, a fire, cooked food, a nurse and above all a **herbal remedy** (from marsh herb) bring recovery. The weak can die.

### Crafting and discovery

There is no tech tree. **Knowledge is found, by a slime, and held by whoever knows it.**

- **Phenomena and curiosities.** Things happen (a tree burns, a pot of clay sits by a fire, copper stains the rock). A slime who witnesses one may understand it. Things seen but not understood become **Curiosities** with a hint.
- **Tinkering.** Slimes at leisure try things out, and **Investigate** sends one to three selected slimes to experiment for three days. Near-misses give hints; having evidence (a curiosity, an ancient workshop) makes tinkering much faster.
- **Knowledge belongs to people.** A craft works only while a living slime knows it. If the last one dies it is lost until rediscovered (faster the second time). Teaching passes a craft on; you can watch slimes learn from each other.
- **The chain.** Fire, then clay and pottery, jars, charcoal, kilns and copper smelting; and onward to stone dressing, cordage, hide working, framing, smoking, casting, cold hammering, iron smelting and forging. The era name in the Almanac rises as the village advances.
- **Stations and recipes.** The workbench is always available; kilns, mounds and bellows appear once discovered. Set keep-N on fired clay, charcoal, copper, copper picks and so on, and idle hands fill the kiln, burn the mound, smelt and make the tools. Heat matters: each kiln or mound shows its heat and why it is not hotter.
- **Three alternates** exist for some chains (salt, drying or smoking for food; peat for fuel; bone for tools).

Open the **Book** (K), **Know** tab, for what the village knows, who holds it, Curiosities, failed experiments and a trace of every discovery roll.

### Orders, crews and expeditions

- **Orders.** Select slimes and right-click the world. The verbs: **forage, chop, gather, haul, dig, hunt, capture, scout, move**, plus **clear** (monsters) and **disarm** (traps) where they apply. An order covers an area around the target and ends when it is exhausted. When several verbs fit a click, a small menu appears. The **dock** at the bottom has an icon per verb if you would rather click the verb first.
- **Crews.** Select slimes, name them and **Make crew** in the Village panel's Crews tab. A crew can carry a default task: an order, a chore they prefer (farm, pen, mine, build, haul) or a standing order. Its card shows a one-line stall summary ("3 of 5 working; 2 blocked: ...") and has Recall, Rename and Disband. Ctrl and Alt plus a digit assign and select crews quickly.
- **Expeditions.** With slimes selected, the Expedition card sends them to find flint, clay, malachite or "anything new". They dig toward it and turn back when it is found, when a member falls below half health, when time runs out, or when you press Recall.
- **Scouting.** Order **scout** on unexplored land, or right-click the minimap, to reveal it. The minimap marks landmarks seen from afar: cave mouths, salt outcrops, ruins and lakes.
- **Delves** are expeditions into labyrinths (see Phase 7 below).

### Fauna and combat

- **Hoppers** wander, flee, breed slowly and are huntable and tameable.
- **The thornback** (150 HP) holds a lair on the meadow. It is aggressive in its territory, retreats and regenerates. Slimes do not fight it on their own: above 60% fear they flee, and they refuse to enter its ground and unmapped cave. It leaves carrion, and respawns.
- **Wolves** (in worlds with the depth content, which every new game has) take hoppers and hunt a lone slime on a winter night. They flee groups and fire: keep company and a fire.
- **Grazers** are large, huntable with spears, and turn on anyone they are cornered against. They are the animal for a big pen and a cart.
- **Fighting** is one verb, used the same way by slimes and by you. A **copper spear** (made at the workbench, kept in the stockpile) is what makes a slime a fighter. Slimes fight their own battles only in defence or on a hunt or Clear order. Possession is the way to fight deliberately.

### Magic cores and what lies beneath (Phase 7)

Past about 150 cells from your camp, the land holds **magic cores**. A core is a magical source with a **mana field** around it, graded into five bands from wild to heart, shown on the map as a violet tint with a one-word danger label on the cell card. No mana lies within about 66 cells of any camp.

- **The field enriches the rock.** Closer to a core, iron and coal are easier to find, and **gems, crystal and core-touched ore** appear. Shallow cores break the surface in outcrops. A crystal spire marks one core per camp, 170-205 cells out.
- **Cave networks.** Beyond 100 cells of the camp the caves become long, winding, multi-level networks of tunnels, rooms with pools and chasms, and ramps, with a spur toward each core. Nearer the camp are smaller natural caves.
- **Labyrinths.** Round most cores lies a built labyrinth of two to five levels: rooms, corridors, dead ends, stairs, six kinds of room and four set pieces (a pillared hall, an ossuary, a shrine, a gauntlet). Entrances come from the cave network, and sometimes a **ruin stair** on the surface marks the way. Ancient stone walls can be dug only with an iron pick, slowly.
- **Traps.** Hidden **darts, pits, collapses and gas** guard the passages. A slime standing near can spot one (more likely with intelligence and craft skill). Spotted traps are marked, and every path avoids them. Stepping on an unseen one sets it off. A **disarm** order defuses a trap, and may yield trap parts or may set it off.
- **Caches.** Sealed stores with loot tables that are richer near the core. **Ancient workshops** teach: a slime standing in one gains evidence toward a craft.
- **Monsters.** Spawned only in the dark, rising with mana: **cave crawlers** (swarms), **corebacks**, **spitters** (ranged), and one **core guardian** per labyrinth that never respawns. They drop core shards, chitin, core hide and venom sacs. They spawn from dens, dark cave chambers, the surface at night in high bands, and the core chamber. They are kept out by walls, doors and light, not by towers. A monster concern appears when they are near.
- **Delving.** An expedition of kind "delve" goes into a labyrinth you have seen a ruin for, or one that a selected slime is standing in. The party scouts, disarms spotted traps, opens caches and maps rooms, then packs the loot. It turns back when a member is under 60% health, the torches burn low, someone is hungry, 14000 ticks pass, the labyrinth is mapped, or you press Recall. A delve party never fights: the core chamber is skipped until the guardian is slain, by a spear crew or by you.
- **Harvest or Leave.** When the guardian falls, the game waits on a card that only you answer. **Harvest** gives 24 core shards to the stockpile and opens the core cell, and new monsters stop spawning at once; ore, caches and treasure stay where they are. **Leave** is final: the core stays, with its rich caches, ores and monsters. A core is offered once, and a harvested core is gone for good.

### Memories and experience

What a slime lives through changes what it later does, whether you were guiding it or not.

- Each slime keeps up to **eight memories** of subjects: caves, the deep, ore, gems, treasure, traps, and creature kinds. Each memory holds a **liking** and a **fear** side by side. A win, a find or a safe look raises liking; a wound or a scare raises fear. A bold slime shrugs off scares; a sensitive one takes them hard; a curious one likes discoveries more. They fade slowly (3% per 1000 ticks).
- **Effects.** A memory nudges job scores (it can tip a close call, never override a need). A slime that likes caves, gems or ore with little fear **explores** in its free time and may map unmapped cave. A slime that fears something keeps clear of it when wandering, and flees it sooner or later according to its fear.
- **Stories.** A slime with a strong memory may tell a nearby friend, partner or kin. Heard stories are weaker than lived ones.
- **Possession shapes it.** The same events are felt by a slime you guide. Walk a timid slime into a crawler den and it will come out fearing them; walk a curious slime through a new tunnel and it may come back to it on its own.
- **Where you see it.** The inspector's "more" area shows chips like "Loves caves" or "Fears cave crawlers" and its vivid episodes. Why? says "Exploring - Curious: caves". The chronicle notes "X is drawn to / afraid of Y".

### The chronicle and the book

The **Chronicle** is the village's running story: births, deaths with their causes, firsts, discoveries, deeds, graves and titles. The **Book** (K) has four tabs: **Story** (the chronicle, with a download button), **Know** (the Almanac), **People** (every slime and the graves; click one to select) and **Keys**.

When you have been away from a running game (tab unfocused, or the sim run fast), a **"While you were away"** digest lists up to ten of the notable events since you last watched.

## How to play

### Your first session

**The first minutes.**
1. A hint will point at a slime. Click it. The inspector shows its needs, traits, skills and what it is doing.
2. Open **Why?** in the inspector. Hover a concern chip in the Village HUD to see what is wrong.
3. Right-click a tree to order the selected slimes to chop it, a berry bush to forage, and loose items to haul. Drag a box to select several slimes (Shift adds).
4. In the Village panel, click a stock tile (logs, sticks, grass) and set a **keep-N** target so idle hands keep the stockpile up.
5. Let it run. Watch the **food runway**. Berries do not last, so food is the first concern.

**The first day.**
1. Dry berries on racks (racks are planned from the Village HUD or build mode). Tubers are food in every season.
2. Press **B**. Draw a small closed room: walls, a roof, **a door**, and a few beds. Then click inside it and set its purpose to **Shelter**. A room without a door is not a room.
3. Keep the stockpile in logs, sticks and grass: those are the walls, roofs and beds.
4. If nobody has a bed, the **Cold** concern will be up from the start. Shelter is what saves you in winter.

**By midsummer and autumn.**
1. Check the runway: it needs a winter marker's worth of food. Dry berries, hunt hoppers, dig tubers.
2. When the nights turn cold, lightning may strike a tree near the camp. Whoever sees it burn may learn **fire** (the chronicle says who). Then build a **fire ring**.
3. Explore a little with a **scout** order, find the malachite stain and the cave, and start digging for flint, clay and stone.

**When things go wrong.**
- **Someone is starving or freezing.** Read the Concerns chips; **Show** takes the camera there. Order food in, add beds or a fire. If the AI will not do it, **possess** (Q) the nearest slime and do it.
- **A slime is stuck.** Open **Why?**; the blocker is named. The usual fixes are a missing tool, an unreachable target or a restricted area.
- **A death.** Auto-pause on death is a Settings option. The chronicle names the cause.
- **A monster or a thornback.** Do not send unarmed slimes. Build a copper spear, light the area, or stay out.
- **You are lost in the digest or the Book.** Esc closes whatever is open.
- **You made a mistake with a save.** Autosaves from the last three days are in the Menu.

### Controls

Every key below can be remapped under **Menu > Settings**, except those marked fixed. The **Keys** tab of the Book (H or ?) shows your current ones.

#### Map mode

| Input | Action |
|---|---|
| Left-click | Select a slime; inspect a plant, item, bed, room, pen or the stockpile; or a bare cell for its cell card |
| Left-drag | Box-select slimes (any overlap with a sprite counts) |
| Shift+click, Shift+drag | Add to the selection (or toggle one slime) |
| Right-click | Order the selected slimes to the thing under the cursor; a small menu appears when several verbs fit |
| Right-drag, middle-drag | Pan |
| Mouse wheel | Zoom toward the cursor |
| Double-click a slime | Select and follow it |
| W A S D, arrow keys | Pan (hold Shift for faster) |
| F | Follow the selected slime |
| Tab, Shift+Tab | Next, previous slime |
| 0 | Fit the explored area |
| Home | Centre on the camp (and the surface) |
| [ and ], Page Down and Page Up | View one level down, up (builds happen on the viewed level) |
| Depth gauge (right edge) | Click a level, or toggle the outline of the level above |
| Space | Pause or resume |
| 1 to 9 (fixed) | Game speed: 1 to 5 = 1x to 5x, 6 = 10x, 7 = 25x, 8 = 50x, 9 = MAX. Speed is a developer tool: the keys always work, but the speed buttons and skip-to appear only with Settings > Developer tools or `?debug=1` |
| Q | Possess (guide) the selected adult slime |
| X | Cancel the selected slimes' orders |
| Z, L, T | Overlays: stockpile and bed owners, job lines of the selection, warmth |
| P | Hide or show every panel |
| H or ? | Help (opens the Book on Keys) |
| K | The Book |
| Esc (fixed) | Close the Book, help or digest, then stop targeting, leave build mode, stop following, clear selection |
| Ctrl+1 to 9 (fixed) | Give the selected crew that number (or make a crew of the selection) |
| Alt+1 to 9 (fixed) | Select that crew; again to look at it |
| Shift+S, Shift+O (fixed) | Save to, load from this browser |

#### Build mode (B)

| Input | Action |
|---|---|
| B | Enter or leave build mode |
| Drag | Paint ghosts of the chosen tool (rectangle for walls, floors and roofs) |
| R | Rotate a blueprint stamp |
| E | The erase tool |
| [ and ] | Change the level you are building on |
| Esc | Cancel the drag or the stamp, then leave build mode |

The build dock offers Wall, Floor, Roof, Door, Bed, Rack, Fire ring and stations, plus **Erase**, **Deconstruct**, **Dig** (region, stair, vein, seek), and blueprint capture, stamp and revise. Costs show on chips, and a missing material shows as a blocker.

#### Possession and first person

Pressing Q puts you in the slime's eyes. The view is a first-person grid crawler: four facings, 90 degree turns.

| Input | Action |
|---|---|
| W A S D | Walk forward, left, back, right, relative to where you face (hold to keep walking) |
| Left and Right arrows, `,` and `.` | Turn 90 degrees. The mouse wheel turns too |
| Hold right or middle mouse and move | Look around; it springs back when you move or turn |
| Shift+Up, Shift+Down | Nudge the view up or down |
| E or left-click | Use what you face: chop, pick, dig, strike, build, take, open. A verb chip names it |
| C, V, N | Eat, drink, sleep (sleep in a bed if you stand on one) |
| G | Put down what you carry |
| T | Take the spear (or the best pick) from the stockpile |
| O | Set a torch on the cell you face (needs a stick in hand) |
| U | Post a timber support on the cell you face (needs timber in hand) |
| Q or Esc | Let go |

Settings > Mouse sway makes the view lean toward the mouse. Without WebGL the guide view falls back to a top-down walk.

### A tour of the screen

- **Top bar.** The day dial, day number and time of day (Morning, Noon, Afternoon, Dusk, Night); pause; then **Build**, **Book**, **Layers** (the three overlays) and **Menu**.
- **Menu.** Save, load, download, load from file; the world seed; the **Version**; New game (random or entered seed, with Ironman); Autosaves; **Settings**; **Keys**.
- **Village HUD.** Population pips, the season ribbon, the food runway with the winter marker, **concern chips**, bed, rack, field and pen counts, demand chips ("more beds") and two tabs: **Stores** (stock tiles with keep-N steppers) and **Crews**.
- **Concerns and advice.** Concerns are ranked, one per kind: food, cold, illness, danger, underground, blocked crew, craft with one holder, spoilage, hunting, idle hands. A chip's **Show** takes the camera to the cause. A new alarming problem gets one ring of attention, an **advisory card** (Show, Snooze, Dismiss) and an **edge pointer** at the screen border.
- **Inspector.** A slime's needs and health rings, what it is doing, the **Why?** disclosure, traits, skills, relationships, lineage, titles, hobby and memories. It also inspects plants, rooms, beds, pens, graves, kilns and ordinary cells.
- **Minimap.** A corner panel of the explored land. Click or drag to jump the camera, wheel to zoom, and right-click with slimes selected to send them scouting there. Danger pips and explored labyrinths show.
- **Dock.** At the bottom: order verbs when slimes are selected, the build tools in build mode, the possession actions when guiding.
- **Alerts.** Toasts for events, a chronicle strip for notables, the digest card for what you missed.
- **Tips.** Short hints that show what to click, at most one at a time, once each. **Settings > Show tips** turns them off and **Replay tips** in the help brings them back.

### Tips

- **Light suppresses monster spawns.** A torch, lamp or fire stops spawns within its radius and a few cells beyond, as does having anyone within six cells. Walls and doors stop them too.
- **A copper spear in hand makes a slime braver.** Weak creatures scare a spear-bearer about a fifth as much. A **Clear** order needs a copper spear in the stockpile. Crews still run from the big ones and never take on a guardian.
- **Recall is your safety valve.** Expeditions come home on their own at half health and when time runs out, delves at 60% health or when the torches burn low. Press **Recall** earlier if you can see a stall.
- **Torches before you dig.** The dark slows work, and a delve party needs light.
- **Possess when AI will not.** The guided slime is Steadfast: it never flees and may enter areas the AI refuses. It works 10% faster and learns 15% faster. Its needs are yours to feed; below 10% health the guidance ends. Game speed is capped at 2x while you guide.
- **Keep two people on each craft.** Knowledge is lost when its last holder dies. The Concerns list flags a craft with one holder.
- **Set keep-N on the things you need before you need them.** It is how a village gets planks, fired clay or copper picks without you micromanaging.
- **Shelter before fire, fire before copper.** The first winter kills more villages than any monster.
- **Look at Why? first.** It turns "the slimes are being lazy" into a specific missing item or unreachable cell.
- **Watch the cell card.** Click bare ground for what it is made of, what digging it gives, and the danger word on cells in the mana field.
- **Heed the dark.** Surface cells in the higher mana bands spawn monsters at night. Build your camp, and your fields, away from cores.

## Under the hood

- **Zero dependencies.** Plain ES-module JavaScript under `game/src` (`sim/`, `ui/`, `render/`, `main.js`, `shell.html`). The map and first-person view are raw WebGL2.
- **Deterministic simulation.** The sim is a pure function of the seed and a log of commands (`sim.apply`); the UI and the AI use the same commands and the same actions, which is why possession is the same pipeline as the AI. The world is a pure function of the seed and coordinates. Saves hold cell deltas, plants and the seen set compactly.
- **Single-file build.** `node game/tools/build.js` bundles the modules into `game/slime-civ.html`. Browsers will not load ES modules over `file://`, so the build flattens them.
- **Tests.** `node game/tests/all.js` runs the quick set, one child at a time. Never run the sims in parallel, and do not use `--full` casually (multi-year bots; once at the end of a phase). The browser smoke scripts (`node game/tools/ui_smoke.js`, `ui_shots20.js`, `ui_smoke_p7.js`) need Chromium and are run one at a time after a build. See `game/tests/README.md`.
- **Developer docs.**
  - `game/README.md` - stage-by-stage dev log with seams.
  - `notes/STATUS.md` - what is built.
  - `notes/DECISION_LOG.md` - decisions and deviations from the design.
  - `notes/impl/` - implementation notes (`PHASE7_CORES.md`, `MEMORY_SYSTEM.md`, ...).
  - `docs/GAME_DESIGN.md` - the design intent. Parts of it are not built.

## Not yet and known gaps

- **Balance is unreviewed.** The Phase 7 numbers (field falloff, spawn rates, loot, trap damage, the fade length, the harvest haul, delve recall lines) and the memory numbers are best guesses. Reviews of the recent decisions are pending, and human fun-testing is not done.
- **No tower defence, no raid waves** beyond monsters spawning in the dark. Defence is walls, doors, light and spears.
- **Far pathing.** There is no region graph, so a far unreachable goal reports "budget" rather than "no path".
- **Labyrinths** need a seen ruin, or a party already inside, to start a delve. Not every core has a labyrinth.
- **No perception trait.** Spotting traps uses intelligence and craft skill only.
- **A harvest takes nothing away**: ore, caches, treasure and the map tint stay as generated; only new monster spawning stops.
- **The map camera is fixed**: a 3/4 view, north-up, with no rotation.
- **Seams that are left.** Hobbies, skills and traditions growing out of interests (a liking for caves as a future spelunker) are noted for later and not built.
- **Larders** are thin on some seeds; cold still kills elders and children in the open; keep-N on a non-food item can reduce births a little because labour goes to it.
- **Old saves.** Saves from before the 7.20 terrain change are refused; later ones load.
- **Not designed for touch screens or a narrow window.**
