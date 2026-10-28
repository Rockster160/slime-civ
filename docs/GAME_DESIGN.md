# Game Design Document — Slime / Dorf Village (working title)

Status: DRAFT v0.3 (final critique applied).
No engine chosen. No final title. Numbers are starting values; ASSUMPTION marks unvalidated figures and P# names the prototype that validates them (docs/PROTOTYPE_PLAN.md).

Companion documents: docs/MVP_SCOPE.md · docs/TECHNICAL_RISKS.md · docs/OPEN_DECISIONS.md · docs/PROTOTYPE_PLAN.md
Design rationale and decision history: notes/phase2/RESOLUTION.md · notes/DECISION_LOG.md

## Contents
- 01. Executive Summary
- 02. Elevator Pitch & Unique Selling Proposition
- 03. Design Pillars
- 04. Target Audience & Comparable Games
- 05. Player Fantasy
- 06. Core Gameplay Loop
- 07. Player Control & Camera Systems
- 08. Inhabitants, Genetics & Personalities
- 09. Autonomous AI & Job Management
- 10. Learning, Training & Generational Knowledge
- 11. World Generation & Environmental Simulation
- 12. Construction, Functional Buildings & Blueprints
- 13. Exploration, Mining & Combat
- 14. Crafting, Economy & Logistics
- 15. Emergent Technology & Civilization Development
- 16. Species, Cultures & Alternative Progression
- 17. Settlement Growth & Automation
- 18. Mortality, Loss & Emergent Storytelling
- 19. Optional Playstyles & Accessibility
- 20. Multiplayer & Planetary Exploration (Future)
- 21. Art Direction & Presentation
- 22. UX / UI Principles
- 23. Technical Architecture Considerations
- 24. MVP Definition
- 25. Vertical Slice Design
- 26. Development Milestones
- 27. Scope and Risk Register
- 28. Unresolved Design Questions
- Appendix A. Decision references
- Appendix B. Slice content list

## 01. Executive Summary

**Slime / Dorf Village (working title)** is a persistent, procedurally generated civilization sandbox. The player is a god-like overseer of a handful of slime villagers who begin asleep in leaf beds on a grassy clearing. The same individuals, their descendants and their settlement carry through to clay, copper and metalwork. Space is a later expansion and never a prerequisite (§20).

### What the game is, in six statements

1. **Individuals, not units.** Every villager (a slime inhabitant) has inherited traits, a personality, per-craft skills learned by doing, needs, a family, a chronicle entry, and permanent death. See §08 and §10.
2. **Orders at four scales.** Select villagers and right-click a target ("you five, go harvest lumber"); standing orders ("keep N of X"); blueprints ("build 10 of these"); and optional possession of one villager. Naming a selection as a crew is optional. All write to one job board and one simulation (§07, §09).
3. **Freeform construction.** The player draws rooms; the game detects them, the player assigns a purpose, and a checklist says what is missing. Finished designs become blueprints (§12).
4. **Exploration feeds discovery.** New materials, fauna, ruins and phenomena seen in the wild become Curiosities; villagers witness and tinker their way to new Crafts. There is no research screen. The capability graph is hand-authored; what is emergent is which route is taken, when, by whom and under what pressure, and the world (not the player) chooses it (§13, §15).
5. **Autonomy maintains; the player advances.** Villagers keep themselves fed, sheltered, repaired and supplied without being asked. Anything *new* (a new kind of building, place, research direction or scale of operation) comes from the player. This is the sentence the whole design is organised around.
6. **One planet, complete.** The first planet is the whole shipped game. Eras are labels derived from what the settlement can do, never gates (Hearth, Hide, Stone, Clay, Timber, Copper, Iron; §12.10, §15.8).

### Status of this document

| Tag | Meaning |
|---|---|
| **AGREED** | Stated by the author in the brief or Discord log. Treated as canon. |
| **DECIDED** | Director ruling (notes/phase2/RESOLUTION.md, R1-R27). Changeable only by a new ruling. |
| **DEFAULT** | Director's recommended starting value, to be revisited after the named prototype. |
| **PROPOSED** | New mechanic or direction introduced by this document, not yet ruled on. |
| **ASSUMPTION** | A number or claim that has not been measured. Starting values, not promises. |

### Starting-point facts

- **Prior art.** The author's *slime-village* (vanilla JS, canvas 2D, about 28k lines of simulation) already supplies autonomous slimes, a demand-vector job board, soft-capped mixture genetics with colour inheritance, seasons, a chronicle, a headless sweep harness, and exact-replay saves. It has **no** skills or XP, no player commands, no possession, immutable terrain from seed, and prefab buildings. Those are designed fresh here. Where a mechanic is reused it is marked "carried over from slime-village".
- **Clock and pacing anchor (R1 DEFAULT, K2 canonical).** At 1x the simulation runs **20 ticks per real second**. **1 game day = 12000 ticks = 10 real minutes (S18b/D35, superseding K2's 90 s day).** A game year is 100 days = 1,200,000 ticks, about 16.7 real hours; a season is 25 days (about 4.2 hours). A villager lives **5 game years**, about 83 real hours. Speeds are 1x-5x plus pause. Every skill, transmission and genetics rate is derived from this anchor. **Short constants are written in ticks with real seconds at 1x in brackets** (for example "200 ticks [10 s]"); long constants in game days or years. "Game minutes" and "game hours" are not used for short constants. The full table is the Units & clock box at the top of §23.
- **Scale (R4, DECIDED).** 6-60 named villagers per settlement; simulation ceiling about 100. Larger operations are handled by crews and standing orders, not by more individuals.
- **World (R3, DEFAULT).** A 3D integer cell grid with z-levels (chunked 16x16x16, about 2 bytes per cell, destructible), rendered as slices rather than voxels. MVP map about 128x128x24.
- **Engine (R24, DECIDED).** Not chosen. §23 lists criteria and candidates only.
- **Effort (R26, K1, ASSUMPTION).** Playable checkpoints: **C1 "Leaves & Sticks"** (villagers, needs, job board, orders, gathering, one hazard: cold; about 2-3 FTE-months), **C2 "First Hut"** (freeform build, rooms, one purpose, blueprint and stamp, minimal possession; about +2-3), **C3 "Clay & Copper"** (skills, genetics, the discovery chain fire -> clay -> charcoal -> copper, mining, the thornback; about +3-5). **C3 is the vertical slice**, about 7-11 FTE-months. The **MVP** (a complete, publicly playable first planet) is the slice plus the Essential tier; its honest range, built from the line items (which sum to roughly 25-54 FTE-months before cuts), is in docs/MVP_SCOPE.md. The full first planet is about 30-60.

### What this game is not

- Not a hero game: the player is not a character in the world (possession borrows a villager; it does not replace the god).
- Not a spreadsheet or factory game: no belts, no drones, no throughput puzzles (D3).
- Not an RTS: no competitive wipe-the-other-player layer.
- Not a live-service loop: no energy, dailies, streaks, login rewards, or timers aimed at the player (§03, §22).
- Not a research-screen game: there is no tech tree to click through. Capabilities come from an authored graph of phenomena that materials, places and people reach by whatever route the world allows (§15).

### Document map

| If you want... | Read |
|---|---|
| The rules that govern every other section | §03 |
| How a session actually plays | §06, §07 |
| Villagers, genetics, skills | §08, §10 |
| The job board and its explanations | §09 |
| Buildings, mining, crafting | §12, §13, §14 |
| Discovery and eras | §15 |
| What to build first (checkpoints C1-C3) | §24, §25, §26 |

---

## 02. Elevator Pitch & Unique Selling Proposition

### Elevator pitch

> Seven slimes wake up in a pile of leaves. Give them one order and they start a camp; give them none and they still survive the night. Over many hours their children learn trades, a wrong turn in a cave kills your best miner, a lightning fire teaches someone what clay does, and the leaf camp becomes a town of kilns and copper that you designed and they built. You can command from the clouds, or step into one villager's body to push through a hard dig. You never have to.

### One-line versions

- *Store page:* "Guide a slime tribe from leaf beds to metalwork. They keep themselves alive; you decide what comes next."
- *Genre line:* A persistent colony-and-civilization sandbox about individuals, discovered technology and freeform building.
- *Hook line:* "Your best miner got eaten. Her apprentice learned half of what she knew."

### Unique selling proposition

Five claims, each tied to a mechanic that exists in this document. A claim without a mechanic is cut.

| # | Claim | The mechanic that backs it | Section |
|---|---|---|---|
| 1 | **Technology is found, not researched.** | Data-defined phenomena fire when material properties meet heat, moisture, enclosure and time; villagers witness or tinker; the player reads an Almanac and Curiosities with near-miss hints that never name the product. The phenomena are a hand-authored graph; the world, not the player, picks the route. | §15 |
| 2 | **The village survives your absence and your commands.** | Autonomy band (R8): eating, sleeping, hauling, repair, replanting, firewood, healing, fleeing, starter shelters run with zero orders. A starving village told to build still eats first, at personal and village level (R5, K4). | §09 |
| 3 | **Command grows with civilization.** | Individual and crew orders at minute 1, standing orders after the first stockpile, blueprints after the first built room. Each scale exists because a capability exists, not because the player ground for it. | §07 |
| 4 | **People are the progression.** | Skills by doing, genetics bounded to +/-25%, permadeath, craft knowledge that dies with its last holder but leaves evidence that makes rediscovery cheap (R11). | §08, §10 |
| 5 | **Possession is a push, not a requirement.** | Steadfast (autonomous villagers flee the thornback; a possessed one can stand and fight), access to cells autonomy refuses (unsupported spans, bad-air pockets) at the player's own risk, and a small felt buff (+10% action speed, +15% XP). No yield, damage or need bonus; no timer. | §07 |

### Differentiation from the inspirations

| Nearest neighbour | What it does | What this game does differently |
|---|---|---|
| RimWorld | Individual colonists, incident-driven stories. | Technology and building are discovered and designed rather than chosen from a research list; population is shaped by genetics over generations; the player can possess. |
| Dwarf Fortress | Deep individual and world simulation, z-levels. | Same grid depth, but a readable 3/4 sliced view, crews and standing orders instead of per-dwarf labour toggles, and a Why panel on every stall. |
| Minecraft / Terraria | Free construction and mining. | Builders are autonomous villagers carrying materials by hand; rooms have purposes with graded quality, and the player never swings a pickaxe unless they want to. |
| Majesty | Indirect control of self-willed heroes. | Orders are reliable (no refusal), with incentives replaced by a transparent job board. |

### Why it can be built by a small team

The USP is rules plus data, not content volume. Every claim above runs on three shared systems: the **job board** (R5), the **phenomenon table** (R12) and the **room checker** (R18). A new capability is a data row, not a new system. This is why the vertical slice (C3, §25) can prove the whole loop in about 7-11 FTE-months (ASSUMPTION); the MVP (§24) costs more, honestly stated in docs/MVP_SCOPE.md.

---

## 03. Design Pillars

These are the ten pillars from the brief, restated as tests. Every proposed mechanic in this document must pass at least one pillar test and the cohesion rule (pillar 10). A mechanic that passes none is cut.

### The organising rule

> **Autonomy maintains; the player advances.** (DECIDED, D7)

Villagers keep themselves alive, fed, sheltered, repaired and supplied without being asked. Whatever is *new* (a new kind of building, a new place, a new direction of research, a new scale of operation) comes from the player by order, blueprint, standing order, possession or priority.

| Autonomy maintains (no player input) | The player advances (player input required) |
|---|---|
| Eating, drinking, sleeping | A new functional building kind (R8) |
| Hauling to stockpiles | A new place: expedition, new settlement site |
| Repair, replanting, firewood | A new direction of exploration or tinkering |
| Healing, fleeing danger | A new scale of operation: crew, standing order, blueprint stamp |
| Basic shelter from starter shelters (leaf bed, lean-to) and from blueprints flagged "auto-build" | The design itself (what a room is for, where it goes) |

Consequences: the village can survive a long expedition (pillar 6) and the player is never idle (pillar 7). An absent player stalls growth, not survival.

### The four purposes

Every mechanic must serve at least one (brief pillar 10):

1. **Develop the civilization** (new capabilities, larger and more skilled population).
2. **Discover the world** (places, materials, creatures, phenomena).
3. **Express player creativity** (rooms, blueprints, layouts, naming, starring).
4. **Create memorable emergent stories** (individuals, deaths, firsts, near-misses).

*Challenge test:* if a mechanic cannot name which of the four it serves and which pillar test it passes, it goes on the cut list.

### The ten pillars

| # | Pillar | One-line test: a mechanic serves this pillar if... |
|---|---|---|
| 1 | **Autonomous, living inhabitants.** Each villager has inherited traits, personality, skills from activity, needs, relationships, history and permanent death. No point allocation. | ...it makes a villager more of an individual (a trait, habit, skill, bond or history) or makes the loss of one matter, without letting the player set their stats directly. |
| 2 | **Player control at multiple scales.** Individual, crew, standing order, blueprint, possession, all on one simulation. | ...it adds or clarifies a way to give intent at some scale through the same job board, and a possessed action obeys the same formulas as an autonomous one. |
| 3 | **Freeform construction.** Players design buildings; function comes from requirements. | ...it lets the player shape space freely and be told plainly what the shape lacks, without prescribing one optimal layout. |
| 4 | **Procedural exploration and mining.** Destructible terrain, caves, fauna, hazards, ruins. | ...it gives the world something to find that changes what the settlement can do, with difficulty from environment and logistics rather than distance or depth alone. |
| 5 | **Emergent technology.** Capabilities from discoveries, materials and people; no research screen (authored graph, world-chosen route). | ...it creates a new *capability* (something that was impossible becomes possible), not a numeric bonus, and reaches it through a phenomenon that can be witnessed or tinkered. |
| 6 | **Optional playstyles.** Build, manage, optimise, explore, lead expeditions, research, observe. | ...it lets a player skip one system without punishment and rewards combining several, with no mandatory chores, timers, energy or streaks. |
| 7 | **Growth through automation.** Commands move from "Bob, collect that iron" to "maintain the iron supply". | ...it raises the scale at which the civilization acts for itself (via people, standing orders, transport tier) while the player can always zoom down to a single villager. |
| 8 | **Persistent civilization history.** Buildings persist, people die, knowledge moves, events are recorded. | ...it leaves a durable, readable trace (a ruin, a chronicle line, a surviving blueprint, a lineage) that still matters after the era passes. |
| 9 | **Space as expansion.** The first planet is a complete game. | ...it works with no reference to space; anything that requires another planet is filed under §20 and cut from MVP. |
| 10 | **Core cohesion.** One set of shared systems, not four games. | ...it reuses the job board, grid, phenomenon table or room checker rather than adding a parallel system, and it names which of the four purposes it serves. |

### Hard constraints that follow from the pillars

| Constraint | Source | Where it bites |
|---|---|---|
| No manual stat or skill allocation | Pillar 1 | §08, §10 |
| Possession is never mandatory or overwhelmingly optimal | Pillar 2 | §07 (bot band: possessed output at most 1.25x delegated) |
| No research screen or rigid tree; eras are labels | Pillar 5, R14, R13 | §15 |
| No belts, no drones | D3 | §14, §17 |
| No energy systems, daily chores, timers, streaks | Pillar 6 | §22 |
| Space never a prerequisite | Pillar 9 | §20 |
| Do not commit to engine, title or voxels without cost analysis | Brief | §23 |

### How pillars collide, and who wins

| Collision | Resolution |
|---|---|
| Pillar 6 (village survives absence) vs pillar 7 (player always has something to do) | The organising rule: survival is autonomous, advancement is not. |
| Pillar 1 (individuals matter) vs pillar 2 (strong commands) | Orders reliably bypass personal temper and preference (R5), and over-ordering is paid for through ordinary needs, mood and the rested curve rather than a separate strain meter (K5); individuality shows in *how well and how long*, not in refusal. |
| Pillar 3 (creative freedom) vs readable function | Quality is graded, not binary; oversize lowers quality instead of failing (R18). |
| Pillar 5 (emergence) vs "no soft-locks" | Systemic world events plus a per-seed solvability validator at worldgen (R12). |
| Pillar 2 (possession) vs pillar 6 (optional) | Possession buff is perceptible (Steadfast) but not economic (R9). |

---

## 04. Target Audience & Comparable Games

### Target audience

| Segment | What they want | Where the game serves them | Risk |
|---|---|---|---|
| **Colony-sim players** (RimWorld, DF, Going Medieval, Timberborn) | Individuals, stories, systemic failure | Villagers with lineages and permadeath; Why panel for stalls | Perceived as "RimWorld in slime skin" unless discovery and possession land |
| **Builders** (Minecraft, Terraria) | Freeform design that matters | Room checklists, blueprints, "stamp x N", builders who carry materials | Building feels pointless if layout has one optimum (§12 counters this) |
| **Explorers / adventurers** | Caves, danger, finds | Expeditions, possession, area-designated mining | Sparse MVP hazards (R20) |
| **Observers / sim watchers** | Watch a world evolve | Fast-forward, chronicle digest, no required input | Needs strong readouts |
| **Lineage / genetics tinkerers** | Breeding, dynasties | Mixture genetics with guards (R16) | Min-max exploit; guarded by bots |
| **Time-poor players** | Meaningful sessions in 30-60 min | Persistent world with no timers; digest on return | World runs only while the game runs (R22) |

**Primary** (ASSUMPTION): players aged 18-45 comfortable with a colony sim and willing to read a Why panel. **Secondary:** builders and observers who accept a slow start. **Not for:** players wanting competitive PvP, twitch combat, or a story campaign.

**Session shape:** 30-90 minutes typical, 2-4 hours in a weekend sit. Lifespan anchor (about 10 h per life) means a villager outlasts several sessions, so attachment accrues across sessions.

### Comparable games: take and avoid

Claims below are about shipped mechanics only.

| Game | What we take | What we deliberately avoid |
|---|---|---|
| **RimWorld** | Individual colonists with traits; workbench "do until you have X" bills (our standing order "keep N"); drafting as tactical direct control (the nearest analogue to possession); storyteller-style readable incident logs (our chronicle). | The per-colonist work-priority grid, which becomes a chore at scale; a research list gating technology; forgotten bills silently stalling the colony (our Why panel). |
| **Dwarf Fortress** | Skills that rise by use; z-levels; permanent deaths that become legends; stockpiles; evidence of lost works. | Per-dwarf labour toggles and a menu-heavy UI; adventure mode as a separate game (our possession is the same simulation). |
| **Minecraft / Terraria** | Destructible terrain, vertical mining, freeform building; Terraria's NPC-housing room checklist ("what's missing") is the model for our room checker. | The player as the sole builder and miner; per-block clicking (we use area designation). |
| **Kenshi** | Skills trained by doing; squads; no quest chain needed; harsh consequences. | Raw punishing difficulty and opaque systems that drive away casual players. |
| **Majesty** | Indirect control of self-willed agents; incentives on a board. | Unreliable orders; our orders are reliable and any "mood" belongs to personality, not obedience. |
| **StarCraft / Age of Empires** | Control groups, idle-villager button, rally points, progression through buildings unlocking capabilities. | The competitive layer (wiping out other players); rigid tech tree; production queues as a chore. |
| **Factorio** | Ghost-based blueprints and blueprint reuse as the bridge from creativity to scale. | Belts, bots and throughput optimisation; in-world conveyors (D3). Construction is by hand. |
| **Cult of the Lamb / BALL x PIT** | Complementary settlement plus adventure structure; follower individuality. | Daily upkeep rituals and loyalty maintenance (forbidden by pillar 6); run-based resets (our world persists). |
| **Spore / Aground** | A creature-to-civilization arc. | Fixed stage minigames and linear era gates; our eras are descriptive labels. |
| **Stellaris** | Divergent civilizations as a long-term expansion idea. | Not in MVP: other species, diplomacy and space are post-first-planet (§16, §20). |
| **Going Medieval** | Multi-level buildings with a level view. | Per-category task priority micromanagement. |
| **Timberborn** | Building-slot staffing ("this workshop has 3 slots"); readable vertical terrain. | Fully building-centric labour; our crews are people-centric. |
| **Oxygen Not Included** | Posted tasks picked by the best eligible worker; readable priorities. | Player-chosen skill interests and the priority-tuning chore (forbidden by "no point allocation"). |
| **Songs of Syx** | Scaling by managing categories, not people. | Individuals blurring into numbers; we cap named villagers at 6-60 (R4). |
| **Dungeon Keeper** | The closest precedent for possession as an optional power over autonomous creatures. | First-person as a required viewpoint (R2 defers it). |
| **Against the Storm** | Legible recipes and building slot counts. | Run-based structure; our world persists. |
| **Scan-n-Scram** | Procedural planets and exploration-driven progression as a mood reference. | Not mined for specific mechanics in this document. |
| **Warhammer 40K Orks** (inspiration) | The idea of belief shaping reality. | **Deferred** (R13): collective belief is Experimental; rules are kept in OPEN_DECISIONS. |

### Positioning

A systemic colony sim with the readability of RimWorld, the depth axis of Dwarf Fortress, and a creative-building core, differentiated by discovered technology and optional possession. Closest competitor risk: RimWorld and DF players asking "what's new?"; the answer is §15 (phenomena, not research) and §07 (four command scales that grow with civilization).

---

## 05. Player Fantasy

### The statement (ASSUMPTION, proposed)

> *"I watch a small tribe of individuals become a civilization I recognise, and I can reach in at any scale, from a wave of a hand to a handshake, without ever being required to."*

### Three supports, each testable

| Support | The player says... | Mechanics that deliver it | Test |
|---|---|---|---|
| **Patron, not puppeteer** | "Mira is a better miner than I expected." / "She disobeys the weather, not me." | Orders express intent; people supply the doing with their own stats, skills and quirks (R5, R17). | Playtesters describe villagers by name and trait, not as "units". |
| **Attachment** | "I can't believe we lost Tam." | Names, lineage, colour, personal log, permadeath, chronicle lines, craft knowledge that dies with a holder (R10, R11). | After a death, testers can say what the villager was good at without looking. |
| **Authorship** | "That valley is where we found copper; this kiln block is mine." | Designed rooms and blueprints; roads; area-designated mines; place names in the chronicle. | Testers can point at things on the map that are "theirs". |

### What the fantasy is not

- **A hero game.** You are not a character. Possession lends you a body; it never replaces the god.
- **A spreadsheet.** No throughput puzzle; transport tier is the logistics lever (R21).
- **A defence game.** Hazards are MVP-light (R20); threats shape expeditions, not the whole loop.

### The five emotional beats

| Beat | When | Source |
|---|---|---|
| **Wonder** | First fade-in on the leaf camp; the first time a Curiosity resolves | World, discovery |
| **Pride** | First blueprint stamped; first room reaching "good" quality | Construction |
| **Tension** | An expedition at half-pack with a wounded member | Exploration, recall rule |
| **Loss** | A founder dies; their craft is held by one apprentice | Permadeath, R10-R11 |
| **Return** | Opening the game after a break to a chronicle digest of a winter | R22 |

### Fantasy by playstyle

| Playstyle | The fantasy they get | What they can ignore |
|---|---|---|
| Builder | "I made the town square." | Expeditions; starter shelters keep people alive |
| Manager | "My crews run the iron supply." | Possession |
| Explorer | "I pushed the shaft through unknown rock." | Base management, which standing orders and autonomy cover |
| Researcher | "I worked out what to heat with what." | Combat |
| Observer | "I watched a winter, a birth, and a famine." | Everything except pause and speed |

### Zoom as the signature gesture (PROPOSED)

The continuous zoom from settlement overview down to a single villager's face (and, with a click, into their body) is a physical expression of pillar 7. From any chronicle entry the player can click through to the person involved and then onto their desk, a tavern table or their body. There is no loading cut.

---

## 06. Core Gameplay Loop

### One ring, not four games

```
        +------------------ DISCOVER (places, materials, phenomena) ------------------+
        |                                                                             |
   "we lack a thing                                                    "we now can do a
    or a place"                                                          new thing"
        |                                                                             |
   MANAGE (crews, standing orders, <---------- GROW (people, skills, capabilities, ---+
           stance-free job board)                    blueprints, era label)
        |                                                                  ^
        +----------------- BUILD (rooms, purposes, blueprints, stamps) ----+
```

| Segment | Feeds the next by... |
|---|---|
| **Discover** | Finding a material, creature or phenomenon that creates a new capability or a new lack. |
| **Build** | Rooms qualify work: a kiln room is where firing happens. Discoveries need rooms; rooms need materials found by exploring. |
| **Manage** | Crews and standing orders keep exploration from costing the base, and keep the base from needing the player. |
| **Grow** | People learn, are born, teach and die. New Crafts exist only while someone alive holds them. |

**Interlock rules:** Build is not decoration, exploring is not adventure for its own sake, managing is not paperwork. There is **no research screen**; the only "research decision" is which expedition and which room (§15).

### The unit of play

> A **lack noticed and answered.** The Concerns strip says "winter in 12 days, 4 sleeping rough"; the player draws a room, stamps a blueprint, or sets a standing order; the villagers do it; the next lack appears.

### The four time loops

| Loop | Length (at 1x) | The player does | The game gives back |
|---|---|---|---|
| **Minute** | 1-5 min | Notice a lack; issue the right-scale command; watch the status line | Visible progress; a stalled order says why |
| **Session** | 30-90 min | Set 2-3 standing orders; design or stamp a room; send a crew or take a possession dig; read the chronicle | A new material or place; a first; a death or birth |
| **Hour-20** | About 8 game years in | Fill the stone-and-clay economy; second site; first apprentices; guard against loss of a craft | New capabilities and an era label; the first founder death |
| **Hour-100** | About ten lifetimes on the 10 h anchor | Zoomed out; designs new districts, picks expeditions that matter, intervenes for emotional reasons | A civilization with history that was shaped by the player but run by its people |

### Minute loop in detail

1. **Look.** Concerns strip, stock bars, idle-villager pins, villager cards.
2. **Decide.** Which scale? One or a few villagers (select, right-click), a quantity (keep N), a place (designate), a design (blueprint).
3. **Issue.** Select, then right-click (§07).
4. **Watch.** Status lines update in plain words ("Mira: fetching flint, 40 cells away"). A blocker appears the moment an order cannot proceed.
5. **Notice.** The next lack, or a Curiosity worth following.

### Session loop in detail

- Open: chronicle digest of what happened (R22).
- Mid: one structural change (a room, a blueprint stamp, a crew), one exploratory move (area designation, expedition, a possession dig).
- Close: the game keeps running unfocused (R22); nothing waits for the player. Saves are continuous.

### Which checkpoint plays which loop (K1)

- **C1 "Leaves & Sticks"** plays the **minute loop** and one first winter: wake, forage, shelter, a cold night, a first select-and-right-click order.
- **C2 "First Hut"** adds the **session loop**: draw a room, assign a purpose, save a blueprint, stamp it, and take a short minimal possession.
- **C3 "Clay & Copper"** (the vertical slice) is a first **hour**: skills and breeding show, the first fire -> clay -> charcoal -> copper chain is found, a seam is dug, a thornback is met.
- The **Hour-20** and **Hour-100** loops below describe the MVP and the full first planet, not the slice.

### Hour-20 loop

By about hour 20 (ASSUMPTION; beyond the C3 slice, MVP content): 25-60 named villagers within the R4 envelope, several visibly skilled workers, a stone-and-clay economy, perhaps a second site. The player's session is mostly standing orders and blueprints; individual orders are rare and reserved for villagers the player cares about. First founder deaths test knowledge transmission.

### Hour-100 loop

At about hour 100 the player has lived through about ten lifetimes at 1x (more with speed-up). They are mostly zoomed out: crew-level and standing orders carry the base; they design districts, choose expeditions, review the chronicle, and drop into bodies for emotional reasons (rescue, a favourite, a first). Mid-game plateau risk (identified in A) is countered by *qualitative* capability (a new thing is possible), new kinds of places (environmental, not just deeper) and creative building, not bigger numbers.

### Command scale as progression (PROPOSED unlock shape)

The player starts with the smallest useful command set and earns higher-scale commands by *civilization capability*, not by chores:

| Stage | Scale first available | Typical order |
|---|---|---|
| Camp | Select and right-click (one or several); optional crew name | "You five, go to that grove." |
| After the first stockpile | Standing order | "Keep 30 fibre." |
| After the first built room | Blueprint, stamp x N | "Build 3 of these." |
| Later (post-MVP) | Steward over a district | "Keep the north mine supplied." |

### A day in the life (vignette)

> *Autumn, year 1, about hour 2.*
> The digest says: "Autumn: one birth (Pell, to Mira and Oro). Clay stock fell to 8. The east grove burned after lightning. Nobody died."
> The Concerns strip reads **winter in 11 days; 3 sleeping rough; the lumber order stalled: no axe in reach.** The player opens the Why panel on the lumber order: blocker **no tool**. The only axe-holder is Oro, who is tinkering at the kiln. The player draws a rack of three beds against the south wall of the main hall, saves it as a blueprint, and stamps it twice. The ghosts show "needs 36 wood-class; stock 120".
> A Curiosity chip is pulsing: *"Sooty glaze on the stones near the burned grove."* The player does not know what to do with it. They select Tam, who has high curiosity, and order "tinker near the burned grove". Tam walks off; the status line reads "Tam: examining scorched clay".
> Ten minutes later: the chronicle logs "Tam first fired clay in the burned grove: the Clay age begins." (An Era label, not an unlock.)
> The player switches to the copper seam. They possess Reen, the best miner, for a dig through a rock fault that the auto-miner kept stalling on. Reen's mining is 10% faster, she gains experience quicker, and when a stone drops from the roof she does not flinch (Steadfast). The player releases her when she collapses from hunger; the village ate and slept all the while.
> They save, close the game, and the village keeps running unfocused.

---

## 07. Player Control & Camera Systems

### Purpose

Let the player give intent at the scale they care about while the same simulation runs for villagers and for the god; let the player zoom to a body and back without a separate mode.

### Player experience

The primary gesture is **select villagers, then right-click a target**: a tree, a seam, a patch of ground, and the selected villagers go and do it ("you five, go harvest lumber"). That one gesture is the whole command vocabulary at minute 1; everything else (naming a selection as a crew, "keep N", blueprints, possession) is optional and grows with capability. Every order shows a status line in plain words. No order fails silently. Pause-with-orders is allowed (no artificial timer). The player can leave at any time.

### The four command scales

| Scale | Select | Verb | Writes to the job board as | Lifetime |
|---|---|---|---|---|
| **Direct order** (primary) | Click or box-select one or more villagers | Right-click a target (ground, object, tree, seam): go, gather, build, fight | A reserved job at class "player order" (300) for the selected workers only (R5) | Until done, failed or revoked |
| **Crew** (optional naming) | Name the current selection ("Make crew") | Optional default task | A named set plus default task plus stall summary (R6); no extra scoring layer | Until revoked; no refill rule, members are just the named set |
| **Standing order** (operational) | Stock bar or order list | "Keep N of X" or flip any gather order to "keep N" | A stock target with hysteresis (R7) | Until deleted |
| **Blueprint** (creative) | Build mode | Draw rooms; "Save blueprint"; "Stamp x N" | A batch of ghost-build jobs, supports first (R19) | Until built or cancelled |
| **Possession** (personal) | Possess on a villager card | Direct movement and the villager's own verbs | Removes the villager from the board; same Action/Controller pipeline as AI (R9) | Until collapse, release or death |

(Four scales in the brief: strategic, operational, creative, personal; the direct order is the first rung of strategic.)

### Orders

An **Order** is a reserved job tied to a villager or crew. The board classes, highest explanation first (R5):

> **critical need (personal or village-level) > player order > standing order (and every job derived from an order) > village demand > personal leisure**

- Needs override orders only when critical, on a continuous survival curve. "A starving village told to build still eats first." This holds for **village-level critical needs** too (food stock under 2 days per head, no shelter in the cold, no fuel in the cold; K4): they are scored at need class, so they beat orders exactly as personal needs do (§09). The status line shows the interruption: "Mira stopped to eat; returning to the dig."
- **Only the player's directly ordered action is class 300.** Jobs derived from an order (hauling material for a blueprint, fetching a tool for a dig, hauling the ore home) and every job from a stamp inherit **standing class (200)**, and no single stamp or standing order may hold more than 70% of the adult hands (K4).
- Orders bypass personal temper and preference. There is no refusal and no disobedience mechanic. Failure is physical (no tool, no path, no material, no skill, reserved, unsafe) and always yields a **blocker** (R5).
- Orders reserve work but do not freeze adjacent urgent jobs (a wall order does not stop someone fixing a collapsing roof).
- **Over-ordering has a cost, paid in ordinary needs (K5).** Commanded villagers still eat and sleep; skipped leisure sags mood, which slows work at mood under 0.30 and pre-empts orders under 0.10 like any critical need; and the rested curve (§10) cuts XP past 60% of a working day in one craft. There is no separate strain meter.

### Crews

A **crew** is **optional naming** of a selection: a name, a default task and a stall summary (R6; mechanics in §09). "Five on lumber" and an expedition party are the same object with different tasks. Members still eat, sleep and have leisure.

- Created from any selection with "Make crew"; most play never needs it, because select-and-right-click already does the work.
- Appears as a HUD chip with members, task and stall reason.
- Deferred past the slice (K10/R16): "keep filled to N" refill rule and control-group number keys.
- Recall rule for expeditions: the single rule in §13.4.

### Standing orders

"Keep N of X" is a stock target with a hysteresis band (R7), displayed as a **stock bar**; every gather order can be flipped to "keep N" in one click. The band and anti-flap rules are specified in §09.

Example: "Keep 200 lumber" shows as a bar; if no hands are free it reads "behind by 38; 3 busy with food", and the player can assign a crew.

### Possession

**Why possess (K7).** Possession is worth doing for three felt reasons, none of them output:

1. **Steadfast.** Autonomous villagers flee the thornback once fear passes 0.6 (§13.7); a possessed villager does not flee and can stand and fight. This is the author's "extra push to defeat a difficult enemy".
2. **Risk access.** Autonomous safety rules keep villagers out of unsupported spans and bad-air pockets (`unsafe`, `airpocket`, §13.3). A possessed villager can go there at the player's own risk, so possession reaches places and finds the AI will not.
3. **A felt buff.** +10% action speed, +15% XP. Small on purpose; not the main reason.

**Possession** takes a villager out of the job board and gives the player their body. The villager's job returns to the board for others. **Checkpoints:** minimal possession (move, interact, the same Actions as the AI, release) lands in **C2** and is cheap once the Action/Controller layer exists; combat, hazards and light polish come in **C3**.

| Rule | Value (R9, DEFAULT; K7) |
|---|---|
| Pipeline | Same Action/Controller pipeline as AI; the same verbs and formulas |
| **Steadfast** | The possessed villager does not panic, flee or break under fear |
| **Risk access** | May enter `unsafe` / `airpocket` cells that delegated crews refuse |
| **Divine inspiration** | +10% action speed, +15% XP (not stackable across swaps) |
| Other bonuses | None: no yield, damage or need bonus |
| Needs | Keep running; the villager eats carried food when critical |
| Reservation grace | Reserved jobs are released after 600 ticks (30 s at 1x) |
| Release | Only on collapse (incapacitation), never on a warning; no timer, no cooldown |
| Speed | 1x default, capped at 2x; pause allowed |
| Death | Ordinary permadeath; the next frame is the god view |
| Exploit guard | Prototype bot band: possessed output at most 1.25x delegated for ordinary work |
| Visual | A faint halo; vitals shown large; "Release" always on screen |

**Why possession is never optimal (structural, not tuned):**
1. Opportunity cost: the board loses a worker.
2. No player-skill yield multiplier: player skill shows only where there is positional choice (dodging, routes, where to dig).
3. XP is bounded by genetic potential (R17).

**Where it genuinely helps:** danger and discovery (a cave with uncertain geometry, a fight with the thornback, a precise block placement, a cell the AI refuses). Rewards are fewer losses and rare finds, not economy. Perception of +10/+15 is a prototype question (P8).

### Camera (R2, DEFAULT)

**One camera.** A fixed-pitch 3/4 oblique view onto a z-sliced world:

- Current z-level shown in full; the level below dimmed (so mines read as a place, not a map sequence).
- Roof and wall cutaway above the cursor/selection; a ghost of the level above at low alpha.
- A one-key "show all levels as a cutaway block" for multi-storey buildings (PROPOSED from the design review).
- All sprites drawn 3/4. Fixed yaw in MVP (design call: no rotation until art cost is known; if added later, 90-degree steps).
- Continuous zoom from settlement to face. Possession uses **the same camera** with tighter follow (roughly one-third of god-view distance, about 0.2 s ease-in; ASSUMPTION) and direct movement keys.
- Possession runs at 1x by default and is capped at 2x (DEFAULT, D11; OD-13); pausing while possessed is allowed.

### Alternatives evaluated

| Option | Strength | Weakness | Decision |
|---|---|---|---|
| **Top-down orthographic** (RimWorld, slime-village today) | Clearest reading of rooms, jobs, paths; cheapest | No height; weak possession drama; underground needs a separate presentation; needs top-view sprites (heads and roofs) | **Not chosen.** Fixed 3/4 gives most of its clarity plus height. |
| **Isometric / 3/4 oblique** | Height readable; keeps sprite charm | Occlusion and depth ordering in freeform buildings; sprite facing | **Chosen** as 3/4 oblique with cutaways (the fixed-pitch camera above). |
| **Side view** (Terraria) | Mining and depth instantly legible | Poor for a surface village across a landscape; multi-room horizontal layouts | **Deferred.** At most a later "mine cutaway lens" on the same grid. |
| **First person** (Delver/Minecraft) | Possession drama, immersion | Loses clarity; building in FPV is a chore; second control scheme | **Experimental / post-MVP**; only via a second renderer on the same sim. |
| **Delver-style billboard 3D** | 2D art with 3D depth | Facing direction when the camera rotates; second renderer | **Experimental / post-MVP** behind a stub; a possible way to host first person cheaply. |
| **DQ XI dual-view** | Respects both tastes; same world, no advantage either way | Author worry that "cameras are hard enough to balance"; doubles art QA | **Experimental / post-MVP**; not before the base camera proves itself. |
| **Full voxel rendering** | Visual match for the data model | Cost; not needed since the model is a grid rendered as slices | **Not chosen** (R3). |

Gating prototype: P6, 3/4 slice readability (can testers read stairs, roof versus floor, which level a villager is on). No second-renderer stub is built before the base camera passes (R8/R17).

### Interactions

- **§09:** every order is a job-board entry; blockers come from the same scoring function.
- **§12:** the camera's cutaway is the building UX, not a separate view.
- **§22:** the Why panel and status lines make orders trustworthy.
- **§13:** area designation ("dig this region", "follow this vein", "seek copper") replaces per-block clicking (R27).

### Progression

Command scales unlock by capability (see §06 table): individual and crew at minute 1; standing orders after the first stockpile; blueprints after the first built room; Steward later. Camera features do not unlock.

### Failure states

| Failure | What happens | Safeguard |
|---|---|---|
| Order impossible | Blocker shown with reason; the order stays visible | Why panel |
| Over-ordering | Hungry, tired, low-mood workers; XP reduction past 60% of a day in one craft | Needs pre-empt orders; Why panel: "3 of 5 stopped to eat or rest" |
| Possessed villager dies | Permadeath; god view | No extra penalty; chronicle line |
| Possessed villager collapses | Control released | Never on a warning |
| Camera obscures | Cutaway hides roof/wall | Cutaway on hover; a hotkey to show all |

### Exploits & counters

| Exploit | Counter |
|---|---|
| Possess-swap to chain buffs | XP buff does not stack across swaps; bot "possess-swap" in the harness (R25) |
| Keep 10000 lumber to drain labour | Needs outrank standing orders; Concerns note "this order is eating 18 of 22 hands" |
| Ghost spam | Ghost queue panel; the player, not a timer, expires ghosts; stamp jobs are class 200 with a 70% hand cap |
| Micromanaging a single hero | Needs, the rested curve and genetic potential; possessed output band |

### MVP vs later

| MVP | Later |
|---|---|
| **C1:** select and right-click orders with blockers and status lines. **C2:** one "keep N" order, blueprint "stamp x N", minimal possession (move, interact). **C3:** optional crew naming with stall reason, possession with Steadfast, buff, risk access and permadeath, one delegated expedition type, one camera | Steward, auto-promotion suggestions, incentive/bounty orders, second renderer, "keep filled to N", control groups, per-villager "never do X" exceptions |

### Example

> The player box-selects three villagers and right-clicks the copper seam on level -3. The status line reads "Ridge: mining copper, 3/3 working." (They named the selection "Ridge" earlier; naming is optional.) After a minute it flips to "stalled, no pick in reach". The player flips the order to "keep 60 copper" and the stock bar appears.

---

## 08. Inhabitants, Genetics & Personalities

Status tags: **AGREED** = author direction, **DECIDED** = director ruling (R#), **PROPOSED** = new mechanic introduced in this document. All numbers are starting values; ASSUMPTION = unvalidated; P# = phase-gate prototype.

### Purpose
Inhabitants (villagers, per R15 slimes only on the first planet) are the unit of everything the player cares about: they work, learn, die, and are remembered. The system must (a) make every villager a recognisable individual, (b) let breeding matter as a *story* ("the line of tall miners") without becoming the optimal strategy, and (c) stay cheap enough for 6–60 named villagers per settlement (R4, ceiling ~100). Design target from D: "breeding matters about as much as a good building, not 'breeding is the strategy'."

### Player experience
- The player sees named individuals with a colour, a few words about what they are good at, and a short personal log ("learned to fire clay", "lost her sister"). Hovering a villager shows what they are doing and why (see §09 Why panel).
- Breeding is never a screen of numbers. The player nudges (house two people together, protect a good line, let a wanderer join) and reads results as words: "unusually strong for this line", "weak line" (inbred).
- A villager the player has used for a long time dies, and the loss is felt (§18) but never ends the game.

### Mechanics

#### Species as data (DECIDED R15)
A species is a data table: trait ranges, need curves, life-stage lengths, body plan. Slime is the only entry in the first-planet build. Nothing in this section hard-codes "slime" beyond the table.

#### The nine traits (carried over from slime-village)
Carried over from slime-village `TRAIT_INFO`, with founder ranges unchanged. Each is a multiplier around 1.0 (maxHealth around 100). Readouts are worded as consequences, not numbers (carried over: `traitStanding()` words: poor / below average / middling / good / exceptional / "beyond anything its founders had").

| Trait | Founder range | What the player can watch | Main consumers |
|---|---|---|---|
| speed | 0.8–1.2 | walks and works faster | travel time, action speed (movement-bound jobs) |
| strength | 0.8–1.2 | carries more, digs/chops faster | carry capacity, mining/chopping/building rate, melee |
| stamina | 0.8–1.2 | works longer before tiring | energy drain rate |
| intelligence | 0.8–1.2 | picks things up faster, notices more | skill learn rate, witness/tinker chance (§10, R12) |
| drive | 0.75–1.25 | wants to be doing things; burns out sooner | ambition for work vs leisure; mood sag when leisure is skipped |
| leisure | 0.6–1.5 | needs more downtime, sociable | leisure need, hobby XP, bonding |
| fertility | 0.8–1.2 | children come sooner and more often | breed cooldown |
| longevity | 0.9–1.1 | lives and matures slower | life-stage lengths (`lifePace`) |
| maxHealth | 85–115 | survives hits, cold, hunger | health pool, recovery |

Plus **colour** (inherited in HSV hue-space, not RGB, as in slime-village). Colour is identity and kinship: names are drawn from the hue band, "belonging" is colour kinship with the settlement, and the 7% hue "sport" mutation (45–150 degrees) remains the one explicit big-jump mutation of the carried-over design.

**Aptitude (PROPOSED, C/D).** Each craft skill (§10) has an aptitude in about 0–1 *derived* from 2–3 traits (e.g. mining: strength, stamina, intelligence; smithing: strength, intelligence, drive). It is not a separate gene: it is a weighted read of existing traits through `settle()`. This keeps nine genes and gives skills a ceiling (§10).

#### Inheritance (carried over)
A child's trait is built per trait from two parents A and B: 22% copy A, 22% copy B, 28% midpoint, 28% random point between A and B, then ±5% multiplicative noise, then `settle()`. This produces "average-ish of the parents, but might suddenly excel at one trait" (AGREED, author's own words). Drive additionally drifts ±5% so a settlement's character changes over its history (carried over).

**Mutation (DECIDED, uses carried-over mixture plus one new rule).** The mixture already produces sudden excel/weakness within the parents' range. To satisfy the author's "sudden excel / sudden weakness" wording beyond the range, PROPOSED: each trait of each child has a 4% chance (ASSUMPTION; P13 breed-best bot) of a "sport": a jump of ±8–15% of the trait value applied before `settle()`. Sports are logged in the child's personal log ("born unusually quick for this line") and credited in the chronicle only for traits that reach "exceptional".

#### `settle()` soft cap (carried over, R16)
`settle(v, mid, soft)`: values within `soft` (0.5, drive 1.2) of the middle pass untouched; beyond that the excess grows logarithmically, `mid + sign*(soft + soft*log1p(over/soft))`. No hard ceiling: a dynasty pushing for fifty generations does get somewhere ordinary lines cannot, it just never runs away. Applied to every child's trait *and* to derived aptitude and to skill levels (§10).

Caveat carried from D's audit: `settle` is inert for the whole range 0.5–1.5 and founders top out at 1.2, so by itself it is a speed bump (toy Monte Carlo plateaued ~1.7x on every trait in ~10–15 generations). It is therefore never the only guard; see below.

#### Guards against min-maxing (DEFAULT R16; D's set A–F)
1. **Convex trait upkeep.** Above 1.0 a trait adds drain to food and sleep: `upkeep = 1 + sum(k_i * max(0, t_i - 1)^2)`. Starting values: strength k=1.2 on food (1.2 -> +4.8%, 1.5 -> +30%, 1.7 -> +59%); speed and stamina same form on energy (k=1.0); intelligence k=1.0 on sleep need plus a small lifespan cost; drive raises mood sag when leisure is skipped (burnout); fertility vs longevity trade via `lifePace` (carried over). An everything-1.7 villager needs roughly 1.5–2x the food and sleep. Average villagers pay nothing, so early game is untouched.
2. **Environment-dependent value.** The marginal value of a trait depends on context: cold biome rewards maxHealth and low upkeep; plains reward speed; cave work rewards strength+stamina; winter punishes high upkeep. Tools cut the weight of raw traits (a tier-3 tool halves the strength exponent in the yield formula). So there is no single best genome and the best line for the jungle is mediocre on the tundra.
3. **Clone limit.** Solo split (`bearChild(a,a)`) is allowed at most **once per villager per life** (plus the carried-over last-resort case when the settlement is near extinction). A clone's traits regress 25% toward the population mean, starts at half strength (carried over) and carries stacking load per consecutive clone generation (-6% maxHealth, -10% fertility). Monoculture lines are hit harder by disease/pest events when those exist.
4. **Hidden genotype and inbreeding depression (conditional).** Added only if the breed-best bot misses the gate. If added: the inspector shows phenotype words only, with ±8% expression noise (heritability ~0.6–0.7), and ancestry ids (parents + 4 grandparents) give `F ≈ 0.5*kin`: siblings -12.5% health and -20% fertility, labelled "weak line". Cost ~6 ints per villager, no per-tick work.
5. **Bounded gene effect.** Genes move any output by roughly ±25% (R16). Large multipliers live in tools (1.5–5x) and skills (up to 1.8x). A perfect line is worth less than one tool tier.

**Gate (R16, bot test):** a bot that picks top-K parents by true genotype for 30 generations must produce mean settlement output per food unit <= 1.15x a random-breeding control, with extinction rate under an injected disease event >= control.

#### Needs (carried over, trimmed)
Vitals ported from slime-village `ai.js` (values rescaled to the R1 time anchor): hunger, thirst, energy, health, mood, plus **hardship** (lifelong record of hunger/thirst/exhaustion/cold nights, feeds frailty). Leisure is a first-class need: `leisureNeed ∝ traits.leisure`. Skipped leisure sags **mood**; mood below 0.30 slows work by 15% and below 0.10 pre-empts orders like any critical need. slime-village's separate strain meter is **cut** (K5): needs and the rested curve do its job. Rates at 1x (ASSUMPTION): hunger falls about 0.25 per game day without food (about 4 days to empty), thirst 0.5 per day, energy 0.7 per awake day, restored by about half a day's sleep; mood falls about 0.15 per day without leisure. Shelter quality drives lifespan (carried over: "sleeping badly shortens a life"; a leaf bed is worse than a lean-to, a built house buys it back). Winter cost falls only on the unsheltered. The player never manages needs; villagers meet them autonomously (R8), and a critical need beats an order (§09).

#### Personality and temper
Personality is deliberately thin (keeps the cut-list intact: relationships beyond family + friend/rival are cut).
- **Temper (carried over).** `temper(villager, jobKind)` = stable multiplier from a hash of (id, job kind), spread `TEMPER_SPREAD` (starting ±20%). It is a lifelong lean: this villager likes hauling, drags on mining. It affects only *autonomous* scoring (village demand, personal leisure, tie-breaks). **Orders bypass temper** (R5): the player is never fought by a preference.
- **Temper drift (PROPOSED, B).** Children's temper offsets drift toward the adults they spend time with, so lineages specialise culturally without a gene. Rate ASSUMPTION: 10% per game year toward the mean of the two closest elders.
- **Leanings (PROPOSED).** A villager's top 2 skills and top 2 temper leans generate the inspector line "Likes: hauling, firewood. Good at: mining." No new data; derived.

#### Relationships (MVP: family + friend/rival)
- **Family** (stored, free): `parents[2]`, `generation`, derived siblings/children, bonded pair (carried-over `bonding`).
- **Friend / rival (PROPOSED, MVP).** One signed integer per pair, stored sparsely only for pairs with nonzero value, max ~6 relations per villager (oldest-weakest evicted). Rises +1 per shared leisure episode or shared work shift beside each other; falls on conflicts over the same scarce reservation (a rival grabs the job you were walking to) or sharing a bed shortfall. At >= +8 "friend", <= -8 "rival". Effects are small and legible: friends choose to chat/leisure together and grieve (§18); rivals avoid the same shift area (a tie-break term in the job score) and gossip does not pass between them. No opinion web, no factions, no romance beyond pair-bonding (cut).
- Cost: 100 villagers x 6 relations x 6 B = ~4 KB.

#### Aging (carried over, R1 rescaled)
Life stages follow slime-village: baby (childhood = `CHILD_AGE * lifePace`), adult (`ADULT_AGE * lifePace`), prime `rand(40,70) * longevity`, then decline. `lifePace = longevity * (1.04 - maxHealth/100 * 0.04)`: long-lived lines mature slower, preserving children-per-life. Under R1 a life is about 10 real hours at 1x; proportions: childhood ~15% (1.5 h), adult from ~20% (2 h), prime to ~55–70%, elder decline after. A game year is ~2.5 real hours (4 per life). `fitness` rises to prime then decays exponentially with no floor ("fades toward nothing"); maxHealth, speed and strength carry fitness. Frailty rises past prime, accelerated by hardship and rough sleeping. Old age ends in death by age damage reaching zero health (see §18). Children are born only in settlements, seasonally weighted, gated by food larder and spare homes and land slack, not by a target population (carried over: "weighted, never gated").

#### What the player sees: the inspector
One panel, same for every villager, built from existing data:
1. **Header**: name (from hue band), colour swatch, life stage + age in years, profession label (derived from top skill, R17), current action.
2. **Why line**: the explanation class and reason for the current job (§09) with a "Why?" button.
3. **Traits**: nine consequence-worded standings with a delta-to-settlement-average arrow. No numerals in MVP (numerals behind a debug toggle).
4. **Skills & crafts**: top skills as bars with the genetic ceiling marked; list of crafts known (familiarity), see §10.
5. **Needs**: bars for hunger/thirst/energy/health/mood.
6. **Family and ties**: parents, partner, children, up to 3 friends/rivals.
7. **Personal log**: last ~30 entries (carried over `note()`), e.g. "sprained ankle in the north seam", "taught Tob to knap".
8. **Lineage button**: opens the lineage view (§10).

### Interactions
- §09: skills and temper feed the job score; Why panel reads the inspector's data.
- §10: aptitude derives from traits; skills ceiling uses `settle()`; familiarity is shown in the inspector.
- §18: aging, death, grief, chronicle entries, heirlooms.
- Possession (R9): possessed villagers keep all traits and needs; Steadfast only overrides fear/panic.
- Hazards (R20): maxHealth, stamina and upkeep decide who survives cold and cave-ins.

### Progression
Genetics progress across *generations*, not within a life. A settlement's character is shaped by who survives and who is allowed to pair. There is no "level up" of the gene pool beyond soft-capped drift. Technology (tools, shelter) outpaces genes by design, so the late game's villagers differ from founders in skills and kit far more than in traits.

### Failure states
- **Genetic bottleneck**: population falls under ~6 and everyone is related. Without inbreeding depression (conditional in MVP) this is only a story; with it, a "weak line" warning appears in the chronicle. Wanderers (carried over `maybeMigrate`) can refill.
- **Extinction**: all villagers dead is a loss state for that settlement; the world remains and ruins can be adopted (carried over `adoptRuins`).
- **Monoculture**: a clone-heavy line is fragile under disease events (later).
- **Over-ordering burnout**: if the player never lets villagers rest, mood sags, work slows, and needs pre-empt orders; this is the intended cost of micromanagement (K5, no separate strain meter).

### Exploits & counters
| Exploit | Counter |
|---|---|
| Breed-best for 30 generations | Convex upkeep, environment-fit, bounded ±25%, noisy phenotype; bot gate <=1.15x |
| Clone the best villager endlessly | Once per life, 25% regression, stacking load |
| Sibling-pair breeding for a pure line | Conditional inbreeding depression from ancestry ids |
| Keep only "exceptional" villagers, let others die | Upkeep cost makes a village of elites food-limited; carrying capacity (land slack) does the rest |
| Reading exact genotype | MVP shows words only; numerals behind debug |

### MVP vs later
| MVP | Later |
|---|---|
| Nine traits + colour, mixture inheritance, `settle()`, convex upkeep, clone limit, 4% sports | Hidden genotype and inbreeding depression (if bot gate fails) |
| Temper, thin personality, family + friend/rival | Culture traditions, richer personality |
| Needs and aging carried over; inspector | Disease and monoculture events; a second species via the species table |

**Example.** The player opens Mira, a tall brown-green slime, in the inspector. "Exceptional strength; poor leisure; likes hauling." Her log says her mother Tob died last winter. The player houses Mira with Dov, whose line is quick. A year later the child is "quick and strong", but eats 30% more than its siblings; the player assigns it to the copper seam where that matters.

---

## 09. Autonomous AI & Job Management

### Purpose
Make a village that keeps itself alive without orders (R8, pillar "village must not be helpless when the player is away") while giving the player precise, low-friction control over what is *new* ("Autonomy maintains; the player advances", DECIDED). One board, one score function, always explainable (R5).

### Player experience
- The player says "you five, harvest lumber" or "keep 200 wood" and the village does it, hauls it, and continues to eat and sleep.
- Anything idle or stuck has a reason: click "Why?" and read a sentence such as "Bren is not on the copper order: no pickaxe in reach (blocker: no tool)".
- The player leaves for a long expedition and the village keeps food, shelter and repairs without a babysitter; when they return, it has not started new kinds of buildings.

### Mechanics

#### The job board
One global board, spatially indexed per chunk and per job kind. A **job** is `{id, kind, target, requires{skill?, tool?, carry?}, source, class, reservation, blockers[]}`. Three feeders write to it:
1. **Orders** from the player (explicit assignments, area designations, blueprints).
2. **Standing orders** ("keep N of X") evaluated every 200 ticks (10 s at 1x).
3. **Village demand**: the carried-over demand vector (recomputed every 20 ticks [1 s at 1x]; components under "Demand vector" below) emits board jobs when nothing else covers a need (food low -> forage/farm; shelter -> build from starters; firewood; repair; replanting; hauling). Hauling jobs are generated by events (item outside stockpile, construction needs material, station needs ingredient, standing-order output).

Pickers: an idle villager scans open jobs in nearby chunks (<= ~200 candidates), scores them, and takes the best; ~20 picks/s at 200 villagers is cheap (C). Re-planning cadence is 1 per 200 ticks (10 s at 1x) per villager, staggered by id (200 villagers / 10 s = 20 picks/s).

#### Explanation classes (DECIDED R5)
In priority order: **critical need (personal, or village-level) > player order > standing order > village demand > personal leisure.** Every job carries its class; the class is what the Why panel prints. **Derived jobs** (hauling for a blueprint, fetching a tool for an order, every job from a stamp) inherit **standing class (200)**, never order class; only the player's directly ordered action is 300 (K4). A `tinker` job is **standing** class when the player asks for it and **leisure** otherwise (K8/R12).

#### The score function (PROPOSED numbers; tuned in P9, order/need thrash)
```
score  = classBase + clamp(within, -45, +45)      # raw `within` only breaks ties inside the clamp
within = 30*urgency + 60*skillFit + 10*proximity - pathCost + preferred + temperTerm - switchCost
```
| Class | classBase | Notes |
|---|---|---|
| critical need, personal | `400 * u(need)` | `u` is continuous: 0 at the soft threshold, 1 at the critical threshold, squared ramp |
| critical need, village-level (K4) | `350 + 50 * u_v` | Food stock under 2 days per head, no shelter in the cold, no fuel in the cold; see below |
| player order | 300 | Only the player's directly ordered action |
| standing order, and any job derived from an order or blueprint | 200 | Stamp builds, blueprint hauls, tool fetches (K4) |
| village demand | 100 | |
| personal leisure | 0 | Scored at need class through `u(mood)` once mood < 0.40 |

- `u(need) = clamp((soft - level)/(soft - crit), 0, 1)^2`. Starting thresholds: hunger soft 0.50, crit 0.15; thirst soft 0.50, crit 0.20; energy soft 0.40, crit 0.10; mood soft 0.40, crit 0.10; cold uses body temperature likewise. At `u = 0.75` a need ties a bare order (300); a well-matched order saturates at 345, so a need wins once `400u > 345`, that is `u >= 0.86` (hunger about 0.18). This implements "a starving village told to build still eats first" on a **continuous survival curve**, not a threshold flip.
- `urgency` in 0..1: the demand-vector term for demand jobs; age for orders (a job nobody has taken for a while rises); stock shortfall depth for standing orders.
- `skillFit` in 0..1 = level of the job's skill (0 for skill-less jobs, §10). **Weight 60 (K6):** skill 0.7 is worth 42 points against at most 20 for `pathCost`, so for skilled jobs the best-skilled free villager usually wins even when someone else is nearer. It is never a gate (R17): an unskilled villager still scores.
- `preferred` = +10 when the job's skill is the villager's **preferred craft** (their top skill, level at least 0.2): a stickiness bonus so specialists stay specialists (K6).
- `proximity` = `1 - dist/maxScan`; `pathCost` = min(20, path length * 0.2).
- `temperTerm` = `5 * (temper - 1)/spread` for autonomous classes; **0 for orders** (orders bypass temper, R5). Rivals' shared area adds -3 (§08).
- `switchCost` = 25 if the candidate differs from the villager's current job and the current job has run less than 200 ticks (10 s at 1x); 0 for any critical need above `u = 0.5` and for village-level critical. This is the anti-thrash commitment.
- **The within-class band is clamped to +/-45** (the earlier "+/-60" claim was wrong: the raw range was -45..+70). Class bases are 100 apart, so classes never overlap except through the need curve.
- **Hand cap (R4):** no single stamp or standing order may hold more than 70% of the adult hands (rounded down); a directly ordered selection is the player's explicit choice, but village-level critical needs still pre-empt it.

#### Village-level critical needs (K4)
Three settlement conditions are scored at **need class**, not demand class, so they beat orders exactly as personal needs do: (1) **food** runway under 2 days per head (stock in rations divided by the day's total need, §11.17); (2) **shelter** missing for any villager while cold (`w(t)` below 0.30, or forecast within 5 days); (3) **fuel** under 2 days of burn while cold. While a condition holds, only as many jobs are emitted as the deficit needs (for food, `ceil(deficit / yield)` forage/hunt/preserve jobs), at `classBase = 350 + 50*u_v` with `u_v = clamp((2 - runway)/1.5, 0, 1)`; they release at runway 2.5 (hysteresis). That is why they take only the hands they need and a stamp still progresses with the rest.

#### Demand vector (K3; reuses slime-village `computeDemand`, rewritten for this game)
Six keys, each in 0..1, recomputed every 20 ticks (1 s at 1x). Each key is the `urgency` of the jobs it emits, and the number of open jobs is `ceil(value * workersFor(kind))`. Numbers ASSUMPTION; tuned in P9.

| Key | Formula | Emits |
|---|---|---|
| `food` | `clamp((target - runway)/target, 0, 1)`, `target = 3 + 20*winterAhead`; `runway` = food days in stock | forage, hunt, tend, dry/smoke |
| `shelter` | `(villagers without a bed / N) * (1 + coldAhead)`, clamped | leaf bed, lean-to, hide teepee, then blueprint builds flagged auto-build |
| `warmth` | `clamp((fuelTarget - fuelDays)/fuelTarget, 0, 1)`, `fuelTarget = 2 + 8*coldAhead`; 0 until fire is known | gather and haul firewood |
| `tools` | `min(1, open jobs blocked by no_tool / 3)` | make a tool whose craft someone knows |
| `materials` | share of materials missing for queued orders and blueprints | gather and haul the missing class (derived, class 200) |
| `repair` | `1 - mean(building hp share)` | repair, replant |

`winterAhead` and `coldAhead` ramp 0 to 1 over `SEASON_LOOK` (20 days) before cold (§11.7). Hauling jobs are generated by events (see the job board above), not by a key.

#### Blockers and the Why panel (DECIDED R5)
Every time a job is rejected for a villager the board stores a machine-readable **blocker**: `no_tool`, `no_path`, `no_material`, `no_skill_known` (craft not known by anyone, §10), `reserved`, `unsafe`, `unreachable_cooldown`, `no_capacity` (carry), `forbidden_zone`, `station_missing`, `unsupported` (mine or cave span, §12.3, §13.6). Only the **top-ranked** rejection per villager is kept to bound cost.

The **Why panel** for a villager or an order prints from this data, in order:
1. Current action and class: "Hauling clay (village demand)".
2. For an order: workers assigned / on-task / blocked, with blockers aggregated ("2 blocked: no tool").
3. For an idle villager: the best job they were rejected from, and why.
Truthfulness rule: the panel is generated from the same score pass that picked the job; there is no separate explanation code path (P10 tests this by replaying a decision and comparing the output).

#### Orders, reservations and adjacent urgency (DECIDED R5)
- An order reserves jobs of its kind in its area for the named workers first. Reservations expire after 400 ticks (20 s at 1x) without progress and are validated every step. A reservation does not freeze adjacent urgent work: an unreserved critical or demand job adjacent to the area is still eligible for any villager whose score for it beats their order job (so a fire in the lumber camp is still fought).
- When an order ends or fails the workers return to autonomy.
- Reservation types: job (one claimer), item stack, destination slot, bed, station.

#### Crews (DECIDED R6)
A **crew** is the optional name of a selection: villagers + a default task + a stall summary. "Five on lumber" and an expedition party are the same object. A crew has no scoring layer of its own: it simply holds a default order for its members, so removing a member releases their jobs. Most orders never involve a crew (select, right-click). The crew card, when there is one, shows members, current task, and stall summary ("3 working, 1 blocked: no tool, 1 resting").

#### Standing orders and hysteresis (DECIDED R7)
"Keep N of X" is a **stock target with a hysteresis band**: start refilling below ~80% of N, stop at 100%, drawn as a stock bar with the band marked. Every gather order can be flipped to "keep N" in one click. Anti-flap: the evaluator spawns jobs only when below the lower mark, and completed jobs finish rather than abort at 100%. `maxWorkers` cap per standing order (default 3 in MVP, ASSUMPTION). Auto-promotion suggestions are post-MVP.

#### Hauling baseline (DECIDED R21)
Hauling is baseline autonomous behaviour (village demand class). The player's levers are stockpile placement and **transport tier** (hand -> basket/box -> backpack -> wagon -> animal cart -> rail); tier sets carry capacity and speed on the carrier. Rules to prevent known DF/RimWorld starvation: no hauling between equal-priority stockpiles; hauling never outranks building the thing it feeds; haul jobs capped per stockpile. No priority matrix in MVP.

#### The autonomy band (DECIDED R8)
Without orders villagers do: eat, drink, sleep, flee, heal, haul, repair, replant, gather firewood, build shelter from the **starter shelters** (leaf bed, lean-to), and build any blueprint the player has flagged **auto-build**. They **never** start a new functional building kind. A Steward that chooses from the blueprint library is post-MVP. Target (D, ASSUMPTION): unattended for 10 game years, >= 90% of settlements survive and < 20% have started a new building type or craft; sweep reports "unattended growth rate".

#### Possession and the board (R9)
A possessed villager is simply removed from the AI picker; their input emits the same Actions. Their reserved jobs are released after a grace of 600 ticks (30 s at 1x) so the crew does not stall. Needs keep running; control ends only on collapse.

### Worked scoring example
Village state: Mira (strength 1.15, mining skill 0.42, her top skill), standing at the stockpile. Hunger 0.34, energy 0.7. Her current job is hauling clay (village demand), started 40 ticks (2 s) ago. Food runway is comfortable (6 days per head).

| Candidate | Class | classBase | urgency | skillFit | proximity | pathCost | preferred / temper | switch | Score |
|---|---|---|---|---|---|---|---|---|---|
| Eat from larder | critical need, hunger 0.34: u=((0.5-0.34)/0.35)^2=0.21 | 400*0.21 = 84 | n/a | n/a | n/a | 2 | 0 | 25 | 84 - 2 - 25 = **57** |
| Dig copper (direct order to the selected "Seam" party) | player order | 300 | 0.6 -> 18 | 0.42 -> 25.2 | 0.55 -> 5.5 | 12 | +10 / 0 (bypass) | 25 | 300 + (18+25.2+5.5-12+10-25 = 21.7) = **321.7** |
| Haul clay (current) | village demand | 100 | 0.5 -> 15 | 0.2 -> 12 | 1.0 -> 10 | 0 | 0 / +3 | 0 | 100+15+12+10+3 = **140** |
| Keep 100 firewood (standing, stock at 60) | standing | 200 | 0.7 -> 21 | 0.3 -> 18 | 0.4 -> 4 | 8 | 0 / +1 | 25 | 200 + (21+18+4-8+1-25 = 11) = **211** |
| Chat with Tob (leisure) | leisure | 0 | 0.2 -> 6 | n/a | 0.9 -> 9 | 0 | 0 / +4 | 25 | **-6** |

Result: Mira takes the copper order (321.7), not the standing order (211), not her current haul. Reason string: "order: dig copper". About 1000 ticks (50 s at 1x) later her hunger is 0.17 (hunger falls about 0.25 per game day): `u = ((0.5-0.17)/0.35)^2 = 0.89`, eating scores 400*0.89 = 356 - 2 = 354, while the order saturates at 300 + 45 = 345 (switchCost is 0 because the order has run more than 200 ticks). Eating wins just as hunger passes about 0.18, as intended. The Why panel says: "Eating (critical need: hunger 0.17). The copper order resumes after." If no food exists, the blocker is `no_material: food`, and the panel says "Hungry: no food in reach; Mira is still on the order" instead of freezing silently.

**Worked example: a stamp of x10 houses during a food dip (K4).** Autumn, 8 villagers, 20 rations in the larder (2.5 days per head) and three villagers foraging at about 2.8 rations per worker-day, which holds the stock level (8 per day needed). The player stamps **x10 daub huts**. The stamp's build and haul jobs are **class 200**, so they outrank food demand (100); the 70% hand cap lets at most 5 of the 8 hands take them, and the other 3 stay on food. Then a bad week halves the patch yield: foragers now bring about 1.7 each, the larder falls 3 rations per day and crosses **2 days per head (16 rations)**. The food jobs are now **village-level critical (350+)**, outscoring a stamp job (at most 245) at once: `ceil(3 / 1.7) = 2` more food jobs open, two builders finish their current cell and move to food (switchCost 0 for critical), and the build runs on 3 hands, about 40% slower. The stock levels off at 16 and nobody starves; when patches recover and runway passes 2.5 the two return to the build. The Why panel line on the stalled builders reads "Foraging (critical need: food runway 1.9 days)". The whole stamp is late, not lethal.

### Interactions
- §08 for temper, traits (skillFit, upkeep), relationships tie-break.
- §10: skillFit reads skill level; `no_skill_known` blocker is the craft-loss signal.
- §18: deaths release reservations; death of a crew member shows in the stall summary.
- Possession: shared Action pipeline (R9, C).
- Building/Blueprints (R18, R19): auto-build flag, supports first.

### Progression
Autonomy broadens by the player's choices, not automatically: each blueprint flagged auto-build, each standing order, each crew expands what the village does unattended. Late game the same board handles more job kinds and transport tiers; no new scoring layer.

### Failure states and failure modes
| Failure | Cause | Detection | Mitigation |
|---|---|---|---|
| **Thrash** (villager flips between order and need) | Scores within a few points; no hysteresis | Count of job changes per villager per 1800 ticks (one game day) in the harness | `switchCost` 25 and the 200-tick (10 s) commitment; need curve continuous; P9 requires < 4 job switches per villager per game day |
| **Starvation of orders** | Many demand/need jobs always outrank orders; or all workers drained | Order with zero progress for 900 ticks (45 s at 1x) | Order urgency rises with age; blocker shown; settlement-wide "needs are eating the order" line in Why panel |
| **Stall** | Reservation leaked to dead/unreachable actor; unreachable target; haul loop | Invariant: no reservation older than N ticks, none held by dead/possessed-away actors | Always expire + revalidate; reachability cache per region with cooldown; stall summary on crews |
| **Priority inversion** | Low-priority hauling blocks building | Order with blocker `no_material` while haul jobs exist | Haul jobs generated from a consumer's need inherit the consumer's class, capped at standing (200) when the consumer is an order or stamp (K4) |
| **Food collapse under orders** | A long order or a stamp x10 drains hands while the larder falls | Food runway under 2 days per head | Village-level critical class (350+) for food, shelter and fuel, plus the 70% hand cap (K4); P9 case with an empty larder |
| **Idle with work available** | All jobs blocked (`no_tool`, `unsafe`) | Idle villagers + open jobs > 0 | Idle list in Why panel, with aggregate blocker counts |
| **Silent village** (nothing happens) | Autonomy band too narrow | Unattended growth rate below band | Player gets bigger queues (blueprint chains, expeditions), not waiting as a mechanic |

### Exploits & counters
| Exploit | Counter |
|---|---|
| Spam orders so villagers never rest | Needs, mood and the rested curve cost output (§08, §10); over-ordering bot must show lower output than delegation |
| Cancel/re-issue orders to dodge needs | Needs are not overridden by orders except via the continuous curve; no cheat |
| Flood queue with 10 blueprint stamps | Jobs released in waves (~30 open per site), a cap on pending sites, derived class 200 and the 70% hand cap |
| Standing order hoarding (keep 9999) | Stock cap per item tied to stockpile space; chronicle/Why panel warns |
| Possess to bypass reservations | Reserved jobs released after grace; possessed output <= 1.25x delegated (R9 band) |

### MVP vs later
| MVP | Later |
|---|---|
| One board, five classes plus village-level critical needs, score function, demand vector, blockers, Why panel, optional crew naming, standing orders with hysteresis, reservations, hauling baseline, auto-build flag (C1: board, classes, demand vector, blockers, basic Why panel; C2: standing orders, stamps; C3: skills in the score) | Steward (autonomous blueprint selection), standing-order auto-promotion, priority matrix, aggregate LOD for distant settlements |
| Hand/basket/backpack carry | Wagon, animal cart, rail |

**Example.** The player drags a crew of three onto the copper seam and names it "Seam". The Why panel for one member reads "Order: dig copper; 2 working, 1 blocked: no tool". The player makes a pickaxe order, flips "wood" to "keep 200" in one click, and walks away on an expedition. Back at the village, the stock bar for wood shows 195/200 inside its band and the seam crew is at work.

---

## 10. Learning, Training & Generational Knowledge

### Purpose
Make *who knows what* matter across generations. Skills turn lived work into quality and speed. Crafts (what the village *can do*) live in living heads and can be lost, but never permanently (R10, R11, R17). Together they give permadeath weight and generations a purpose without soft-locks.

### Player experience
- A villager gets visibly better at what they do, and the inspector shows a bar and a ceiling.
- "Teach" is a command the player can give: "Dov teaches Tob smithing". It costs Dov's time, and he works slower while teaching.
- When the last smith dies, the chronicle says so ("The last person who knew how to fire clay has died"), and the Almanac lists the craft as "unknown, evidence nearby" with a marker on the kiln; sending someone to tinker there is cheap.

### Mechanics

#### Skills (DECIDED R17; minimum model from D, rescaled to R1)
Per villager, per skill: `xp`, derived `level` (0..~1). Skill list MVP (ASSUMPTION): mining, chopping, building, crafting, hauling/gathering, farming/foraging, fighting; 6–8 total. The slice uses three (dig, build, craft); gathering is skill-less. Profession = a label derived from the top skill + recent activity (not stored, not random as in slime-village). The top skill is also the villager's **preferred craft** (K6), which gets a stickiness bonus in the job score (§09).

```
potential[s] = 0.7 + 0.3 * aptitude(s)                 # about 0.70..1.00, aptitude from traits (§08)
level[s]     = settle(potential[s] * (1 - exp(-xp/K)), 0.5, 0.5)
xp_gain      = valueOfOutput * max(0, 1 - level/difficulty(task)) * novelty * rested(s) * learnRate
learnRate    = 0.85..1.15 from intelligence (bounded)
effect       = 1 + 0.8 * level                          # master 1.8x novice in speed/waste/quality
```
- **Units (ASSUMPTION).** `valueOfOutput` is in **work-units**: 1 work-unit is the output of one full working day (1200 ticks [60 s at 1x]) of fair-challenge work at level 0, scaled by item value (a haul of one stack is a small fraction; a copper ingot several). `difficulty(task)` is the level at which a task stops teaching: gather/haul 0.3, chop 0.5, soft-rock dig 0.6, build 0.6, knap and simple craft 0.5, kiln work 0.7, hard-rock dig 0.8, smelt 0.9, fight 0.7. `novelty` is 1 for net-new matter and 0 for non-virgin cells and zero-value output. With these, **K is about 100 xp**, roughly one game year of full-time fair-challenge work.
- **K** ≈ 30% of adult lifespan (OD-19; ASSUMPTION), so xp is measured against the R1 anchor and rescales with it. At average aptitude a villager reaches ~0.63*potential after one K of fair-challenge work and ~0.9*potential after ~2.3 K; with the rested curve and challenge matching, a master emerges in the second half of a life. Adulthood begins ~2 real hours, so a master can pass a craft to an apprentice with hours of overlap. P12 retunes K against the transmission target (§15.8) and the "20-35% of a life" learnability check.
- **XP from real output**: `valueOfOutput` is value created (net-new matter, item quality), not time spent. Fast-forward does not farm XP: it tracks output.
- **Challenge-matched**: `1 - level/difficulty` pays nothing for cutting soil as a master.
- **Re-mining placed blocks**: a per-cell `virgin` bit, cleared when the player or a villager places a block. Mining a non-virgin cell returns the item and pays zero XP (R17). Cost 1 bit/cell.
- **Rested curve (K6; per skill, per game day).** A **working day** is 1200 ticks [60 s at 1x] (the part of a game day not spent sleeping, eating or at leisure). Up to 60% of it in one craft (720 ticks [36 s]) pays full XP; past that, XP falls linearly to a **floor of 50% gain** at a full working day. `rested = 1 if worked <= 720 else max(0.5, 1 - 0.5*(worked - 720)/480)`. This only catches single-craft grinding; an honest day of work in one trade is not penalised, so **rotation is not optimal and specialists emerge**.
- **Genetic potential ceiling**: `potential` bounds level; gifted = ceiling 1.0 vs 0.85 and learnRate 1.15 vs 1.0, which is ~+17% effect at mastery and ~15% sooner. Genes are not expertise; a master's child starts at zero.
- **Skills gate quality and speed, never the ability to attempt** (R17). A villager with level 0 still does 1.0x effect with extra waste. Only *knowledge* (Familiarity, below) gates capability.
- **Rust** (deferred past the slice, MVP_SCOPE §1.2): after 10 idle days, level drifts down 0.5%/day to a floor of 60% of peak.
- **Specialisation and masters (K6).** The job score weights `skillFit` at 60 and gives the preferred craft +10 (§09), and the rested curve does not punish a full day in one trade, so XP concentrates: a few villagers become the village's miner or smith. Masters therefore exist, which makes craft loss on death a real possibility, softened by evidence-based rediscovery (R11). **Bot check (P9/P12):** in a 6-villager colony after 1 game year, the top skill holder per craft is at least 0.25 above the median holder.
- **Mastery (>= 0.85)**: 3–6 "signature" actions in the whole game that gate *quality*, not capability (e.g. a master-forged blade). Later content.
- **Leisure XP**: hobbies (storytelling/teaching, scouting, tinkering, gardening) pay 0.25x work XP and lift a skill to at most 40% of potential. Off-time shapes who a villager is, and feeds tinker aptitude (R12). Slice scope: flavour tags and discovery aptitude only; XP effects are tuning after the slice (OD-19).
- **Grind guards**: dummies cap at level 0.3; sparring pays by the *other* party's level with injury risk.
- **Possession**: Divine inspiration gives +15% XP (R9); the rest of the formula is unchanged. That is a push, not the way to level.

#### Familiarity (craft knowledge) and Teach (DECIDED R10)
- A **craft** (smelt copper, fire clay, knap flint) is known by a villager when **familiarity** > 0. Familiarity is a 0–1 value per (villager, craft). Capability is "a living villager with familiarity > 0" checked when a job is picked (the `no_skill_known` blocker). One layer; B's separate notion layer is merged into it for MVP. **Why two numbers per craft (R15):** skill says how good and fast (it grows slowly with use and is bounded by potential); familiarity says whether the steps are known at all (it is the capability that dies with the last holder and that evidence lets others rediscover). They are stored as one record per (villager, craft) and read by different rules: skill by the score and quality, familiarity by the capability check and the waste term. Anyone with familiarity above 0 can attempt; skill sets quality and speed.
- **Gaining familiarity**:
  - *Discovery* (witness/tinker, R12): the discoverer starts at 0.5 familiarity; witnesses that saw it happen start at 0.2.
  - *Watching* (slow): a learner in sight of a practitioner doing the craft gains `0.025*aptitude*(1 - familiarity)` per 100 ticks (5 s at 1x).
  - *Teach* (fast): a player-issued or automatic action; teacher and student work together; learner familiarity rate x3, teacher output x0.8, **plus the teacher's skill XP flows as student XP at `min(teacherLevel*k, cap)`**. Costs the teacher's time and some of the student's output; this is the real cost of teaching, not an extra stat.
  - *Kin bonus*: a child learns from a parent at x2 (just proximity, children sleep and eat with parents).
- **Familiarity vs skill**: familiarity says *whether* a villager can start the craft and how well they know the steps; skill says how fast and how good. Both feed output quality; familiarity < 0.3 adds waste on top of skill.
- **Using a craft** resets its decay and nudges familiarity toward 1.

#### Knowledge loss and rediscovery (DECIDED R11)
- If the last living holder dies, the craft becomes unavailable (`no_skill_known`). **No permanent locks and no silent downgrade.** A warning fires when holders drop to one ("only Tob knows how to fire clay") and again at zero.
- **Evidence** (built kilns, stored products, ruins, the item itself) makes rediscovery cheap: a tinker job near evidence rediscovers at a large discount (ASSUMPTION, D8: about 20% of the original cost; the P11/P12 pass gate is ≤0.4× of the first discovery). Evidence is spatial: tinkering at a kiln with fired pots in the store scales to the evidence strength.
- Without evidence the craft must be found again (§15, R12), still possible because the phenomena are systemic.
- Capability checks use villagers, not the Almanac: the Almanac only reports.

#### Apprenticeship (PROPOSED, B; after the slice, R8)
A pair assigned by player order ("you, learn smithing from Dov") or automatically when a juvenile/adult is idle near a master doing a craft the village demands. A pair is a standing Teach (same rates as above). Pair state is visible; the pair breaks if either is pulled onto a critical job. Players protect scarce holders by pairing them. Auto-pairing is off for crafts with >= 3 holders.

#### Documents (later capability)
Documents and libraries are post-MVP (R10). Design intent: a document preserves *familiarity* (read at 0.7x of written strength) but caps skill at ~0.3–0.4 from reading alone; paper rots, clay tablets endure, fire burns libraries; a library room makes documents searchable. A book cannot make you a smith. Writing itself is discovered through phenomena (marking surfaces).

#### Lineage (PROPOSED, B; after the slice, R8)
A lineage view shows family tree, who taught whom (teaching edges recorded in the chronicle), and which crafts passed down each branch. "Lineage as memory, not a stat": no inherited levels (no Lamarckian shortcut, C); kin learn faster by proximity, not by magic; discoveries are credited by name in the chronicle.

### Interactions
- §08: aptitude from traits; intelligence sets learnRate and discovery odds; temper drift by proximity.
- §09: skillFit in the score; `no_skill_known` blocker; Teach and apprenticeship appear as crew/order types.
- §18: skills at death recorded in the gravestone; the chronicle credits firsts and records losses.
- R12 discovery, R27 exploration: evidence and curiosities feed rediscovery.

### Progression
In one life a villager goes from learning to master over roughly half their adult life. Across lives a craft survives only if someone passes it on. Documents (later) extend that. Eras (R14) are labels derived from capabilities held; losing a capability can regress the label, and that is a story, not a penalty.

### Failure states
- **Craft extinction**: last holder dies without teaching; mitigated by evidence-based cheap rediscovery.
- **Skill stagnation**: villagers on an endless diet of trivial work gain nothing (challenge-matched XP); the Why panel shows "no progress: task too easy".
- **Teacher bottleneck**: one master for many apprentices; Teach occupies him, so output falls (the cost is visible).
- **Lifespan mismatch**: if skills are too slow vs. life, no master ever emerges; P12 and the harness metric "median age at skill 0.7".

### Exploits & counters
| Exploit | Counter |
|---|---|
| Place and re-mine the same blocks | `virgin` bit: zero XP, item conserved |
| Plant/harvest loops | XP from net-new matter only |
| Single-skill grind | `rested` curve floors XP gain at 50% past 60% of a working day; the grind bot must earn no more than 1.5x a specialist who stops at 60% of the day, and a specialist must out-earn a rotating generalist in their own craft (K6, replaces the old rotation metric) |
| Idle/fast-forward XP | XP tracks output |
| Possess-swap leveling | Possession XP +15% only; grind bot must earn < 5% of baseline on place/mine loop |
| Teaching loops (A teaches B teaches A) | Teach caps at teacher level; familiarity gain falls with `(1 - familiarity)` |
| Hoarding last holder in a bunker | Holder must work the craft to keep it (rust); fine, that is a story |

### MVP vs later
| MVP | Later |
|---|---|
| 6–8 skills with XP/rested/ceiling (3 in the slice, C3); familiarity per craft; watching; the Teach verb (C3; no extra UI); evidence-discounted rediscovery | Apprenticeship auto-pairing and the lineage view (R8 cut list; after the slice), documents/libraries, rust, mastery signature actions, culture traditions, tutor NPCs |

**Example.** The player sees "Only Dov knows how to fire clay" after a cave-in injures him. They select Dov and Tob and press Teach. Dov's pottery output drops 20% while Tob's familiarity climbs from 0 to 0.6 over a long afternoon. When Dov dies in winter, the chronicle records "Tob keeps the kiln", and nothing is lost.

---

## 11. World Generation & Environmental Simulation

Status key: AGREED (author), DECIDED (director ruling R#), PROPOSED (new mechanic in this document). Numbers are starting values; ASSUMPTION marks anything not yet validated. P# are prototype ids from docs/PROTOTYPE_PLAN.md.

### 11.1 Purpose

The world is the source of every constraint the player works against: what can be built where, what can be dug, what burns, what freezes, what is missing. Difficulty comes from **environment and logistics** (what is available, what it costs to move, what the season does to it), never from raw distance or depth. A copper seam 40 cells down is not harder than one 4 cells down; it is harder only if the route to it is unsupported, wet, cold or foul-aired, or if hauling the ore home needs a transport tier the settlement does not have yet.

The world must also be **solvable**: every seed is checked at generation time so that the capability chain in §15 can be reached from bare hands (§11.10).

### 11.2 Player experience

- The map starts as fog (see §13.8); the first hour is a small clearing, a stream, a stand of trees.
- The player reads the land as a set of constraints: "the clay is on the far bank", "this ridge is windy", "the cave breathes cold", "winter is long here".
- Seasons are felt as pressure on food, fuel and warmth, not as a calendar chore.
- The world keeps living with or without the player: trees seed, herds breed and starve, old animals die, a lightning strike burns a meadow. None of it is scripted at the player.
- Digging reveals geology; strata and veins have a readable logic (§11.5), so "follow the green stain" is a reasonable thing to say.

### 11.3 Mechanics: world representation

**DEFAULT (R3).** The simulation world is a **3D integer cell grid with z-levels** (Dwarf-Fortress-like), stored in 16x16x16 chunks, about 2 bytes per cell (material id + state byte), with sparse per-cell extras (hit points of a cell being mined, construction state). MVP map is about 128 x 128 x 24 cells (about 393k cells, under 1 MB of dense data). Terrain is destructible: mining sets a cell to air and drops an item; building writes a cell.

It is **rendered as z-slices, not voxels** (R2): current level plus a dimmed level below, roof/wall cutaway, ghost of the level above. The renderer is replaceable; the sim does not know about it.

Alternatives evaluated (R3 requires they appear in the GDD; the full comparison is in docs/TECHNICAL_RISKS.md §2 and P5 decides the final call: per K1 it is a desk spike of at most one week plus a throwaway mining-and-room test in the 3D z-level grid only, and layered 2D is built only if that spike fails; letters match that document):

| Option | What it is | Verdict for this game |
|---|---|---|
| B. 3D cell grid, z-sliced render (chosen) | DF/RimWorld hybrid; one grid, many levels | Gives caves, basements, multi-storey rooms, destructible ground, and rect-drag orders at 2D-sim cost. Chosen DEFAULT. |
| A. Layered 2D (surface + a few underground sheets) | Cheaper rooms/heat/pathing; no overhangs | Cheaper by an ASSUMED 50%; cannot express a two-storey house or a mine under a house. Kept as the fallback if the prototype shows 3D cost is not recoverable. |
| C. Side-view 2D (Terraria) | One-cell-deep world | Rejected: a 50-villager settlement degenerates into a corridor; farms, roads, wagons do not fit. |
| D. 2.5D billboard renderer over grid B | Delver-style sprites in a 3D view | Same sim as B with a costlier renderer. Experimental, post-MVP, second renderer only (R2). |
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
| 9-16 | hard rock (granite class) | Needs a harder tool tier (tool tiers stay as material properties); spans of 5 safe |
| 17-24 | deep rock | Deep ores, large caverns; cold and bad-air pockets more common |

**Material properties are data** (R12): each stratum/ore row has `hardness`, `density`, `ore_of`, `flammable`, tags (e.g. `green, heavy, ore`). A new rock uses existing tags and participates in existing rules.

**Ore placement rules** (PROPOSED, validated by §11.10):

- **Veins** are connected 3D blobs grown from a seed cell inside a host stratum. Each ore row lists `host`, `depth band`, `vein size`, `rarity`, and a **surface tell** (the "stain" above a vein: green malachite flecks on a rock face, rust stain for iron, a seep for salt).
- **Copper (malachite)** is in the soft-rock band and near-surface in the Rock biome; guaranteed tell within 12 cells horizontally of the vein top (so "follow the green stain" works).
- **Iron** is hard-rock band and deeper; tell is rust-stain, often exposed by a cave-in or stream cut event (§11.8).
- **Coal/peat** (post-slice): peat in marsh, coal in sedimentary band.
- **Clay** on stream banks and marsh; **salt** on beach pans and one inland brine seep; **flint** in limestone nodules.
- **Finite deposits**: veins are large but finite (ASSUMPTION: 200-600 ore cells for a first vein). Surface stocks regrow slowly (rock piles regrow, carried over); deep veins do not.
- Every ore has **at least two reachable sources** on a valid map (§11.10).

**Depth is not difficulty.** The gradient is: deeper rock needs harder tools (a tool-tier gate that is a *material property*), deeper caves have more bad-air pockets and cold, support requirements grow with span. Hauling a long vertical route needs ramps/stairs (§12.3), and the transport tier (§14.7) governs carry cost. A deep vein in a stable hard-rock stratum with a ramp is easier than a shallow vein under a flooded wet-tagged soft-rock cavern.

### 11.6 Mechanics: caves

- Caves are generated from 3D noise as a pure function of the seed; a connected-component pass labels each cave region (`cave_id`, volume, entrances), reused as the explorable region for expeditions (§13.3).
- Per region tags (ASSUMPTION): `dark` (always), `cold` (deep or highland), `wet` (below a water level), `airpocket` (bad air, §13.6), `unsupported` (span longer than the safe span for the host rock).
- Caves have **one or two surface entrances** and, in the deeper band, linked passages; a secret cavern (reachable only by digging) holds one "placed secret" per map (rare find, relic or rich vein) so possession and expeditions have a reason (R27).
- Natural overhead rock counts as a roof for rooms (R18); a cave pocket can become a room without a built roof.

### 11.7 Mechanics: seasons as a warmth curve

**Carried over from slime-village.** Everything reads `warmth`, a cosine through the year, not a season name. The year is 100 days (four 25-day seasons) in slime-village; under R1 the **game year is about one quarter of a villager life** (a life is about 10 real hours at 1x, so a year is about 2.5 real hours at 1x, 180,000 ticks; ASSUMPTION, derived, not independent).

Rules:

1. **Warmth curve** `w(t) = cos(2*pi*(t - t_peak)/year)` scaled by the biome warmth offset (§11.4). All consumers read `w`.
2. **Mean-normalised multipliers.** Every seasonal multiplier (breeding, growth, fruiting, forage) is scaled so its **yearly mean is 1.00**. This is a hard authoring rule carried from slime-village, discovered when winter breeding at 0.3 and summer at 1.0 averaged 0.65 and halved the median population. Only two quantities may hurt on net: `COLD_HUNGER` and `FROST_ROT`. A headless test sums each seasonal curve over a year and fails the build if the mean is outside 1.00 +/- 0.02.
3. **Lookahead.** Villages plan `SEASON_LOOK` days ahead (carried over, 20 days of 100; scales with the year length), so larder, fuel and fodder wants follow the *coming* warmth, not today's.
4. **Winter effects.** Cold damage to unsheltered villagers and plants (frost takes what cannot stand it), slower food spoilage (cold slows it, §14.6), shorter foraging day, snow accumulation cleared by lit hearths and foot traffic (carried over).
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

Each event row is gated by **pressure and absence**: it only runs when (a) a pressure tag is above 0.3 for two seasons, *and* (b) the precondition it provides does not exist anywhere in the settlement's reach. This is the "director that places the missing precondition" (tech review fix) as an environmental event, not a timer that fires an accident. Events never grant knowledge; they only make a thing *possible*. See §11.10 and §15.9.

### 11.9 Mechanics: heat, moisture and enclosure context

The context a phenomenon sees at a work site (R12; P2, heat/enclosure context). **This section holds the authoritative heat function (K8); §15 references it and must not restate different numbers.**

| Context axis | Computation (ASSUMPTION) | Used by |
|---|---|---|
| `heat` level (0-5) | `P = H x E x D`, quantised by the table below | firing, smelting, cooking, smoking |
| `moisture` | cell `wet` tag, rain on unroofed cells, water adjacent | drying, rotting, clay plasticity |
| `enclosed` / `airtight` | room flood-fill (§12.5), with doors as non-airtight | smoking, charcoal burning |
| `draft` (`D`) | see below | furnaces |
| `duration` | integer ticks a stack has sat at this context | all |
| `shade` / `airy` | derived from roofed + open sides | curing, drying |

**The heat function.** A fire burns in one *fire cell* (a hearth, pit or furnace cell). Three factors, all read from cells and entities:

- **Fuel `H` (`heat_value`):** dry brush/grass 1.0; sticks and wood 1.6; **charcoal 2.4**; coal 3.0 (post-slice).
- **Enclosure `E = 1 + 0.10 x sum(ins)`**, summed over the fire cell's **five faces** (four sides and the cell directly above; the floor does not count). Each face scores the **insulation `ins`** of what is there: open air 0; wood 0.4; dry stone and dug soil 0.6; daub 0.8; **clay-lined, fired clay or brick 1.0**; a lid with one vent hole counts 0.5. So `E` runs from 1.0 (open fire) to 1.5 (fully lined and lidded).
- **Draft `D` = product of:** bellows station adjacent x1.3; vent hole or open flue above x1.25; open to the sky on a windy ridge/highland cell x1.3; fire in an enclosed room with no window or vent cell within 3 cells (smoke-bound) x0.7; a sealed fire cell (five solid faces, no vent) x0.5; otherwise 1.0. **`D` is capped at 1.5.**

**Levels (quantised `P`):**

| Level | Name | `P` at least | Typical source | Typical result |
|---|---|---|---|---|
| 0 | Ambient | below 0.4 | none | nothing fires |
| 1 | Warm | 0.4 | embers, brush fire (1.0) | drying, smoking |
| 2 | Hearth | 1.2 | open wood fire (1.6); stone-ringed wood fire (1.98) | cooking, baking daub (fired clay at the margin) |
| 3 | Kiln | 2.1 | clay-lined pit, wood fuel, open top (1.6 x 1.40 = 2.24) | pottery, bricks, charcoal burning at the margin |
| 4 | Furnace | 4.0 | **charcoal in a clay-lined enclosure with draft** | copper smelting |
| 5 | Forge | 5.5 | coal in a lidded, vented, lined furnace with bellows (3.0 x 1.45 x 1.5 = 6.5) | iron (post-slice) |

**Rules on faces.** A fire cell's faces must be non-flammable for any level above 2: **wood faces cap the level at 2** (they burn), so a wooden closet is not a furnace. The cell is a *cell, not a room*: there is no room-size cap and no separate 1-cell cap, only the faces and the draft.

**Cell layouts that reach level 4 (copper smelting).** All need charcoal; wood fuel never reaches 4 (the best wood fire, lined, lidded, vented, with bellows and wind, is 1.6 x 1.45 x 1.5 = 3.48).

1. **Lined pit, open top, bellows:** one cell whose four sides are clay-lined or brick (`E` = 1.40), charcoal, a bellows station adjacent: 2.4 x 1.40 x 1.3 = **4.37**.
2. **Lined pit, open top, windy ridge:** the same pit on a ridge or highland cell open to the sky, no bellows: 2.4 x 1.40 x 1.3 = **4.37**.
3. **Lined and lidded pit with flue:** four lined sides plus a clay lid with one vent hole (`E` = 1.45) and the vent: 2.4 x 1.45 x 1.25 = **4.35**.
4. **Brick furnace:** brick faces count 1.0, so it behaves as 1 to 3.
5. **Unlined pit with two draft sources** (dug soil or dry stone, `E` about 1.24; for example a soil pit on a windy ridge with bellows, `D` capped at 1.5): 2.4 x 1.24 x 1.5 = **4.46**.

**Layouts that stop at level 3 (no closet cheat):** charcoal in an open lined pit with no draft (2.4 x 1.40 = 3.36); charcoal in an unlined or stone-ringed pit with a single draft source (2.4 x 1.24 x 1.3 = 3.87); charcoal in a lined closet with lid but no vent (sealed, `D` 0.5: 2.4 x 1.5 x 0.5 = 1.80, level 2: starved of air). **P2 pass criterion:** 28 of 30 hand-computed layouts match the engine.

**Charcoal burning** is a phenomenon, not a heat level: wood in a sealed fire cell (five solid non-wood faces, `D` = 0.5; for an earth-mounded pit `P` = 1.6 x 1.3 x 0.5 = 1.04, level 1: a smoulder) held for its `duration` yields charcoal (§14.3).

Duration timers are stored on the **item stack or station**, as integers, saved with the world (R23), and phenomenon matching is indexed by input tag so it only runs when a stack's context changes (tech review item 2.1).

### 11.10 Mechanics: per-seed solvability validator

**DECIDED (R12).** At worldgen, a headless validator checks the first-planet capability graph against the generated map before the game starts. If it fails, the seed regenerates with the next named stream index (the player never sees a rejected world).

Validator checks (PROPOSED details):

1. **Route existence.** For each capability slot in the slice (§15.7) there is at least one path from "bare hands + starter shelters" using only phenomena that can fire.
2. **Two input routes** for each of the first 20 discoveries (tech review): two distinct sources of each key input (e.g. clay from a stream bank *or* a marsh; malachite from a surface stain *or* a shallow seam; fuel from forest *or* scrub).
3. **Expedition radius.** Key inputs (clay, flint, malachite tell, salt or smoke-food alternative, fuel) lie within R cells of the landing site by walking path (ASSUMPTION R = 64 cells in the 128x128 MVP map).
4. **Precondition existence.** Each precondition that depends on an *accident* (charcoal, exposed ore tell, windy ridge for a draft) has either a natural instance or a systemic event row that can create it (§11.8).
5. **No isolation.** The landing site is connected by walkable path to every required input without crossing deep water.
6. **Bot run.** A headless "competent bot" and an "idle bot" run 20 seeds x 50 game-years: capability reached in at least 95% of idle runs within 20 years and 100% of competent runs within 8 (P11). Stuck rate under 2%. Every failure is explained by the discovery trace log.
7. **First fire (K3).** A lightning strike or smouldering-stump set piece is scheduled 15-45 days after landing within 30 cells of the camp, so the first discovery (fire) can be witnessed (§11.16).

The validator catches *world* failures. It does not catch *player-made* failures (burning down the only forest); those are recoverable through events (§11.8), regrowth, and the §15.9 rediscovery discount, never by silent rescue.

### 11.11 Interactions

- §12: rooms, roofs and heat context are computed from the cell grid; natural overhead rock counts as roof.
- §13: caves, strata and hazards define what expeditions meet; fog/knowledge is the player's view of the same grid.
- §14: ore and fuel placement and distance set the transport tier a settlement needs; seasonal curves drive spoilage.
- §15: phenomena read context; systemic events place preconditions; validator uses the capability graph.
- §16: biome and geology decide which alternates a settlement ends up with (a coastal village finds salt; a forest village finds smoke), and so its chronicle culture tallies.
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

**MVP:** 128x128x24 grid, 6 biomes, 4 strata bands, copper and iron, clay, salt, flint, 1-2 cave regions, 6 systemic events, solvability validator with route + two-source + radius checks, seasonal normalisation test. **Slice (C3, R8):** one biome plus caves, 2 systemic events (lightning fire, smouldering stump), 1 cave region, copper plus clay plus flint, the validator route and two-source checks. **Later:** jungle/arctic planets, flowing water, coal/peat, wind erosion, climate drift, pre-history sim, second planet generator (space expansion).

**Example (player view).** The player opens the Almanac and sees "Charcoal: nobody has seen it." A dry autumn follows; lightning ignites a tree in the oak stand. The chronicle notes "lightning burned a copse at the north stream". Two villagers walk to the scorched stump, find black lumps, and one tinkers with them at the hearth. The event existed because charcoal was missing and fuel pressure was 0.4 for two seasons (§11.8), not because a timer fired.

### 11.16 Start state (K3, ASSUMPTION)

- **Founders.** 7 adult villagers (range 6-8) of mixed age, from 2-3 founder lineages (colour hue bands, §08). Traits come from the founder ranges; ages spread over 0.25-0.70 of a life (nobody starts a child or in decline); at least one bonded pair, so the first birth falls in the first year.
- **Where.** Landing on day 5 of spring (§11.7), asleep in leaf beds on a grassy clearing. Within reach: a stream (20 cells), a grove (sticks, grass, fibre), a rock outcrop (knappable stone), forage patches (30 cells), and a clay bank on the stream (40 cells, validator §11.10).
- **Shelter.** Leaf beds only, one per founder.
- **Holdings.** 3 game days of food in a pile at camp (3 rations x N villagers, 21 for 7) and bare hands; no tools.
- **Known at start** (familiarity 1.0 in everyone): forage; gather sticks, stones and grass; carry by hand (transport tier 0); **knap stone** (knapped hand-axe, scraper, digging stick), plus sun-drying food on a rack of sticks (a flagged addition to the K3 list, ASSUMPTION: without it the first winter has no store; if the author prefers it discovered, the first winter leans on winter forage and hunting). Starting skills: gathering 0.2-0.4 (they have lived), other skills 0-0.1.
- **Fire is NOT known.** It is the first discovery, from witnessing a lightning strike or smouldering stump (§11.8, §15). Worldgen schedules this "first fire" 15-45 days after landing (about 22-68 real minutes at 1x) within 30 cells of camp (validator item 7). Until then there is no hearth and no cooking; the first nights are survived on leaf beds and lean-tos.
- **The first ten real minutes (about 7 game days).** The villagers wake and, with no orders, forage and drink by the demand vector (§09); the Concerns strip points at shelter and the first food runway; the player's first act is to select a few villagers and right-click a grove or the stone outcrop.

### 11.17 Survival economy (K3, ASSUMPTION)

This section makes "autonomy maintains" a computation. It is the half-page the slice cannot start without; P9 and the C1 sweep tune it.

**Units.** A **ration** is one adult-day of food (juvenile 0.5, elder 0.8). A **worker-day** is one villager's working time in a game day, 1200 ticks [60 s at 1x]; the rest of the day is sleep, eating and leisure. Items carry a `nutrition` property (§14.2) that converts to rations.

**Water.** One stream, drinking at the nearest bank by the thirst need (no rations, no carrying in the slice); wells and carrying come later.

| Food source | Known | Yield in rations per worker-day (annual mean; spring / summer / autumn / winter) | Notes |
|---|---|---|---|
| **Forage** (berries, roots, nuts, grubs) | start | 2.0 (2.0 / 2.8 / 2.8 / 0.4) | Patches deplete and regrow; seasonal curve is mean-normalised to 1.0 (§11.7) |
| **Small-game hunt** (snare, knapped spear) | start, with a spear | 2.5 (2.0 / 3.0 / 3.5 / 1.5) | Herds are a population; the thornback territory is a risk (§13.6) |
| **Tended plot** (seed saved from forage, digging stick, fence of sticks) | discovered (§15), expected in year 1 | 3.5 (3.5 / 6.0 / 6.0 / 0) after set-up | Needs replanting and watering; plots are exempt from trampling |
| **Preserving** | start (rack: sticks, sun; flagged addition, see below) | 5 raw rations to 4 dried per 0.3 worker-day | No fire needed; smoking (fire) is better |

**Spoilage (spoil rates are properties, §14.6).** Raw forage 8% per day (3% in winter); dried 0.5% per day; smoked meat 0.3%; grain in a clay jar 0.2%.

**Labour on food (N villagers, forage only, rations needed = N per day).**

| Season | Forage yield | Workers on food per villager (share of labour) | Notes |
|---|---|---|---|
| Spring | 2.0 | 0.50 | eat as foraged |
| Summer | 2.8 | 0.36 plus 0.10 drying | bank dried food |
| Autumn | 2.8 | 0.36 plus 0.20 drying and smoking | the winter store is made now |
| Winter | 0.4 | 0.25-0.40 forage, the rest eaten from store | store draw about 0.76 ration per head per day |

Annual mean about **0.46-0.50 of all labour** on food at the start (the "40-60% early" in the brief). **Winter deficit:** forage in winter yields about 0.4 per worker-day, so a 25-day winter needs about **19 dried rations per head** banked (about 150 for 8), plus fuel (below). With a tended plot, hunting, a rack and baskets the share falls toward 0.25-0.30; it keeps falling as preservation and tools arrive, which is what frees labour for building, mining and tinkering. Note the first winter lands before most of these exist, so it is the first real test of the demand vector.

**Shelter and warmth chain.** Leaf bed (grass x6, 0.2 worker-day) -> lean-to (sticks x8 + grass x6, 0.5 worker-day) -> after fire: hearth (stones x8) -> hide teepee (§12.10) -> daub hut, timber cabin, stone or brick (from materials, §12.10). **Fuel:** a hearth burns 1 bundle (4 sticks, or one log) per game day and warms about 4 sleepers; a winter needs about 25 bundles per hearth, roughly 4 worker-days of gathering.

**Reading the numbers.** These are starting values only. The C1 headless sweep must show: an unattended 7-villager village survives its first winter in at least 90% of seeds with lean-tos and a rack (Property 1), and the same village told to stamp x10 houses (the §09 example) does not starve.


---

## 12. Construction, Functional Buildings & Blueprints

### 12.1 Purpose

Let the player design the settlement freely (AGREED: free construction, Minecraft/Terraria style), have functional buildings qualify by what they contain rather than by a menu choice, and let a finished design be saved and mass-produced ("build 10 more of these houses"). Creativity is the point; the system must not reward one optimal layout.

### 12.2 Player experience

- Draw floors and walls with a ghost preview; place furniture from a palette; zone a purpose onto an enclosed space.
- A **checklist** shows what the room still needs ("bed x2: have 1", "wall material: wood ok", "light: low").
- A finished room shows a **quality word** (poor / adequate / good / fine), not a binary pass.
- "Save blueprint", name it, then "Build x3" and drag ghosts to sites; villagers carry materials and build supports first.
- Partially built things are visible and valid (§12.6).

### 12.3 Mechanics: cells, walls, floors, roofs, supports

**DEFAULT (R3), DECIDED (R18).** Building writes cells. A **wall** is a solid cell on a z-level; a **floor** is a solid cell below; a **roof** is a solid cell above an interior cell within H (ASSUMPTION H = 3). Stairs and ramps are shape-flagged cells that connect levels. Doors and windows are cell flags plus (for doors) an entity holding open/closed/lock state. Material rows list `buildable_as: [wall|floor|roof|any]`, `hardness`, `insulation`, `fire` (flammability), `support` capacity.

**Supports (structural rule).** There is **no structural solver** beyond cave-in spans (R20). **Above ground, spans are advisory (CR14):** a roof over a span longer than the material's `span` (ASSUMPTION: plank 3, log 4, stone slab 5, brick arch 6) shows a visible warning on the room ("needs a support within 3 cells") but is never refused and never collapses, so big halls stay possible. **Underground, spans are real:** in mines and caves the limit is enforced by the cave-in rule (§13.6) and the blocker `unsupported`. Slice buildings are capped at **two levels**.

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

**Where `light` and `temperature_fit` come from (CR11, ASSUMPTION).** `light` is an integer 0-3: +1 per window cell facing the room (at most 2), +1 if a torch or lit fire is inside; the term is `min(1, light/ideal)` with the Purpose's `prefer light`. `temperature_fit` compares the room's warmth index `clamp(0.5 + 0.5*w(t) + 0.25*(share of wall cells with insulation >= 0.4) + 0.3*(lit fire inside), 0, 1)` (with `w` from §11.7) to the Purpose's preferred range, as `1 - distance`. If P6/P10 show these cannot be explained in the checklist, drop both terms and renormalise the other three.

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
- **Board class.** A stamp's build and haul jobs are **derived**, so they run at standing class (200), with the 70% hand cap (§09, K4). Only a directly ordered build by selected villagers is class 300.
- **Revision and upgrade of existing instances (K10).** Editing a saved blueprint makes **revision n+1**. Each instance remembers its blueprint and revision. **"Push revision"** diffs revision n+1 against each instance that follows its blueprint (instances the player has hand-edited are flagged and skipped unless confirmed); villagers **rebuild only the differences and keep what matches**: new cells are built, removed cells are deconstructed (loss 0-25%, as cancel), and a changed material class (wood to stone) is a replace-in-place, where the cell counts as built for enclosure until the swap, so occupants stay roofed. All pushed jobs are derived (class 200, waves of about 30 per site). This is how "upgrade existing buildings" works without a tech tree: a better design or better material class is a new revision, available when the capability is.
- **Auto-build flag (R8).** A blueprint flagged **auto-build** is eligible to be started by the village without an order when the demand vector says that kind of building is wanted (housing short, storage full). Unflagged blueprints are built only on order. Starter shelters (leaf bed, lean-to) are always autonomous. New functional building kinds come *only* from the player's designs.

### 12.7 Worked example: the bakery

*Illustrative, post-slice content: the slice's single Purpose is the workshop (§25). The bakery shows the same rules with a second Purpose.*

1. The settlement has fired clay and an oven design (the player has seen a kiln fire; the oven is a clay-and-brick station).
2. The player drags a freeform 5x4 floor, wall cells on three sides, a door cell on the fourth, an oven, a work table, a storage box. They do not pick a "bakery" from a menu.
3. The flood fill closes the room. The player zones it **Bakery**. Checklist: oven yes, table yes, storage yes, door yes, light 1 (wants 2). Quality: **adequate**; a window cell added raises light and quality to **good**.
4. The player drags a box over it and presses **Save blueprint** ("Little Bakery"). Wall material class: wood. The blueprint stores a roof span of 5 and a pillar the builders will place first.
5. They press **Build x3** and drop ghosts on three streets. The villagers carry planks; a crew of four stalls with "needs: 40 wood-class" until lumber arrives; supports and floors rise first; a room finishes at 70% and is already usable for its hearth.
6. Each finished bakery needs a baker (a villager who knows the bread craft; crafting skill sets quality and speed). Where there is no baker, the oven sits cold: the building is not production, the worker is.

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
| Fire and stone | hearth, stone pit, drying and smoke rack |
| **Hide** (HIDE_WORKING) | **hide teepee** (sticks + hide + cordage) |
| Clay | daub hut, kiln pit, jar store |
| Timber | **timber cabin** (framed; needs FRAMING capability), loom shed |
| Masonry | stone cottage, brick house, brick oven, furnace |
| Wheels and rails (later) | wagon shed, rail halt |

**Shelter progression comes from materials, not unlocks (K10).** The author's wish is leaves -> hide teepee -> timber cabin -> stone/brick. Here the same house blueprint is redrawn with the material classes at hand: leaf bed and lean-to (grass, sticks), then a **hide teepee** once hide and cordage exist, a daub hut once clay is fired, a **timber cabin** once FRAMING is known, a stone or brick house once masonry is. Each step is a new blueprint or a **blueprint revision** pushed to the existing houses (§12.6): better insulation, more comfort, and a longer life for those who sleep there (§08). There is no "house tier" tech node.

**Era labels (derived from capabilities, never gates; K10):** Hearth -> **Hide** -> Stone -> Clay -> Timber -> Copper -> Iron. The order matches the slice chain: fire (Hearth) opens first, then Clay precedes Timber (daub hut and kiln before framed cabin) and Copper follows Clay and charcoal. The Stone label signals stone *working* beyond the knapping known at start (quarrying, dry-stone walls), so it does not fire on day one. The signature table is §15.8.

A building kind exists in the palette only when a living villager can build its parts (capability = a living knower, R10). Unbuildable stations show greyed with the missing capability.

### 12.11 Failure states

| Failure | Cause | What the player sees |
|---|---|---|
| Stalled site | Missing material class | "needs: 40 stone-class" in Why panel |
| Sagging roof (advisory) | Span exceeds the limit in a building | Warning on the room; no collapse above ground (collapse is underground only, §13.6) |
| Walled-in worker | Door placed too early | Prevented: door-last rule |
| Unusable station | No worker with skill | "Nobody can run the forge" |
| Over-ordering sites | Many stamps, few builders | Cap on pending sites; ghosts show a queue |

### 12.12 Exploits and counters

| Exploit | Counter |
|---|---|
| Blueprint spam land grab | Cap pending sites per crew; sites cost materials upfront delivered, not placed free |
| Tiny closet for high heat | Heat is fuel x enclosure x draft (§11.9): wood faces cap at level 2, unlined or undrafted closets top out at level 3, level 4 needs charcoal plus a fired lining or two draft sources |
| Oversize "room" to hold unlimited workers | Worker slots are on stations; oversize lowers quality |
| Cancel-rebuild loops for material duping | Cancel loses 0-25%; conserved matter |
| Identical copy-paste layouts all optimal | Nothing in the score rewards identical shape; terrain and materials vary results |

### 12.13 MVP vs later

**MVP:** flood-fill rooms, checklist, graded quality, capture/place/rotate/stamp xN, blueprint revision push, supports-first order, partial builds, auto-build flag, ~25 entities, 12 materials, 8 shapes. **Checkpoints:** C2 "First Hut" delivers freeform build, rooms, one Purpose, blueprint and stamp; revision push, auto-build and the shelter ladder beyond the daub hut follow in the MVP. **Later:** mirror, blueprint sharing, stewardship (autonomously choosing from the library, post-MVP per R8), multi-storey towers, wagon sheds and rail halts, decoration quality.

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

**Recall rule** (reduced to two, per tech review; this is the single recall rule used in §07, §19.5 and the prototype plan): **turn back when provisions are at half**, and **turn back when anyone drops below half health**. "Pack full" is just the ordinary haul-home behaviour; "threat sighted" is ordinary flee/retreat behaviour (§13.7). Players can edit the provisions rule but not add predicates (ASSUMPTION; keeps the UI small).

**Expedition report** on return: items brought, regions mapped, Curiosities seen, losses. Sent to the chronicle; unfinished intents offer a one-click "send again".

Slice rule: MVP ships **one expedition type**: "dig toward material X to depth N" (tech review). General intents ("explore the coast") are post-MVP, though the board already runs `scout` (carried over from slime-village).

**Interaction with autonomy (R8).** Autonomy never starts an expedition. While the crew is gone the village continues autonomous survival (eating, shelter, repair, hauling), which is the point of the organising sentence. Replacements are not auto-drafted: crews refill only from unassigned villagers by the player's rule (tech review).

### 13.5 Mechanics: possession on expeditions

**DEFAULT (R9), K7.** Any expedition member can be possessed mid-trip. Possession removes that villager from the board; the crew continues. The player gets:

- **Steadfast, risk access and the small buff**, with the release, needs and permadeath rules of §07 (Possession table): no yield, damage or need bonus; control is released only on collapse.
- **Risk access.** Delegated crews refuse `airpocket` and `unsafe` cells (§13.3); only a possessed member can enter them, and some finds sit only there (the placed secret of §11.6 is one). That is a structural niche: possession reaches what delegation will not.
- Same Action pipeline as the AI (R9, C), so aimed digging and melee are the same actions with a different controller.

**Why possession is an edge, not a requirement.** The edge is *judgment and nerve* (choose the tunnel, spot a bad-air pocket, hold position when others would run, because of Steadfast), not output. Bot target: possessed output at most 1.25x delegated for ordinary work (R9 gate). A delegated expedition reaches the same ordinary ore; it may lose someone the player would have saved, and it will not reach the guarded finds.

**Floor of what must exist** (tech review 4.1, trimmed by R9, K7): *minimal possession* (character-relative movement, interact, release; the same Actions as the AI) lands in **C2** and is cheap once the Action/Controller layer exists. The rest of the floor (dig/melee/build-place verbs, a hazard to read, a light radius underground, hit feedback, a close camera) is **C3**. The whole floor was estimated at 3.5-6.5 FTE-months (R26); MVP_SCOPE holds the split.

**Vignette.** The player sends a crew of three on "seek copper, depth 8" with food for 4 days. Day 2 the crew reaches a damp cave; the leader's torch gutters. The player possesses the leader, walks 10 cells, sees the green stain left of the passage and a cold draught right, takes the left tunnel, and releases possession when the crew has shored the ceiling. The expedition's report lists "found the malachite seam; Dov (possessed 3 minutes) rescued Mira from the draught."

### 13.6 Mechanics: hazards (R20)

MVP hazards; each is data on cells, regions or fauna, and each reports a blocker to the Why panel.

| Hazard | Rule (ASSUMPTION numbers) | Counter |
|---|---|---|
| **Cold** | Cell warmth below tolerance drains health; highland, deep and wet caves are cold; cold tolerance comes from maxHealth and insulation, and its value is environment-dependent (R16) | Shelter, insulation (walls), hearth, rest cycles, torches give small warmth |
| **Cave-in** | A designated or natural span longer than the rock's safe span (soft 3, hard 5) is flagged `unsupported`; each tick spent beneath with no support rolls a small collapse chance that rises with span and wetness; collapse damages cells beneath and any villager (hurt or killed) | Support cells/pillars, shorter spans, "shore first" rule builders obey |
| **Bad air** | `airpocket` tag on cave cells; a villager inside loses stamina then health; torches gutter (a visible tell) | Ventilation shaft (a dug opening), short trips, avoid tagged cells; delegated crews avoid unless intent says so |
| **Wounding fauna** (one kind) | See below | Retreat, spears, shelters |

**The one wounding fauna (PROPOSED).** A predator (placeholder: a "thornback" boar-like creature, territory in forest/cave mouth) that mauls on contact. a hit costs about half a slime's health, roughly 50 of 100 HP (ASSUMPTION; consistent with "one or two hits kill", §13.7), territorial, flees at low health, drops carrion. It has about 150 health (a spear thrust does about 50, so three hits kill it; ASSUMPTION), which makes it the one enemy an autonomous party will not stand against (§13.7) and the reason Steadfast matters. It is a *population* with a lifecycle (§11.8), not a spawner. It creates the carried-over `dread()` memory (lore.js) that makes villagers avoid the place.

**Hazards as phenomena context.** Gas, heat and cold are also context axes (§11.9), so a hazard can be a discovery source ("the lamp went out at the pocket" -> Curiosity).

### 13.7 Mechanics: combat and retreat

**DECIDED (R20).** MVP: one wounding fauna and cold/cave-in/bad air. Full combat is deferred. Combat is **simple and lethal**: one or two hits kill either side (tech review 4.3), so tactics are positional (do not go there, retreat early), not skill-based.

- **Melee action**: one verb, same for AI and possessed.
- **Retreat behaviour** (carried over from slime-village `peril`/flee): a villager whose **fear** passes 0.6 flees toward the nearest safe region (fear rises with threat proximity and recent damage and falls with company; ASSUMPTION); a crew member below half health leaves with the crew (recall rule). Fleeing slimes may drop heavy loads. Chased slimes rely on speed; the threat leaves a territory chase radius.
- **Steadfast** disables fleeing for the possessed, so a player can stand against the thornback where an autonomous villager would run; combined with one-or-two-hit lethality and permadeath, this is a real tradeoff, not a free bonus. Possession combat polish is C3.
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

**MVP:** dig region, follow vein, seek X, dig to depth; one expedition type; recall rule (two predicates); possession with R9 buff, Steadfast and risk access (minimal in C2, combat in C3); cold (C1), cave-in, bad air, one wounding fauna (C3); fog from lore; 2 ruin templates. **Later:** more intents, more fauna, full combat, light-source mechanics (lamps), mystery events (<10), second renderer for first-person possession (Experimental).

---

## 14. Crafting, Economy & Logistics

### 14.1 Purpose and player experience

**Purpose.** Turn raw materials into goods through stations and skilled workers, move them, and keep the economy bounded by sinks so that "collect reasonable resources and do epic stuff with what was originally minimal" (AGREED) holds. The economy is labour-bound and physical: no belts, no drones (AGREED, D3).

**Player experience.** The player sees stock bars, sets "keep N" orders, places stockpiles near stations, steps up the transport tier when hauling is the bottleneck (wagon sheds come after the MVP), and sees quality words on goods ("good axe, made by Tob"). Nothing runs forever without them noticing.

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

A recipe is `inputs (by tag/property/amount) + station + skill verb + time -> outputs`. A **station** (§12.4) provides the verb and context; a **capability** (§15.2) says a living villager knows the craft. A recipe fires only when both exist at job-choice time (R10). Recipe ingredients may be *class*-based ("any wood"), matched by tags and properties.

Examples:

| Recipe | Station | Skill verb | Inputs -> Output |
|---|---|---|---|
| flatbread | oven (hearth+clay) | baking | flour x2 + water -> flatbread x4 |
| pot | work table + kiln | pottery | clay x2 (shaped) -> pot (kiln-fired) |
| charcoal | covered pit | burning | wood x6 -> charcoal x3 (needs enclosed, low draft) |
| copper ingot | furnace (level 4) | smelting | malachite x2 + charcoal x1 -> copper ingot x1 |
| axe | forge/anvil | smithing | ingot x2 + wood x1 -> axe (quality by skill) |

**Food chain (K3; numbers in §11.17).** Raw forage, game and plot crops are eaten fresh or **dried** on a rack (no fire), **smoked** (fire), **cooked** at a hearth, and stored in baskets and, after clay, **jars**; each step lowers the spoil rate (§14.6) and raises the winter store a village can hold.

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
| 3 Wagon | pulled by villagers | 20 stacks | 0.7 | wheel + axle capability, a road helps |
| 4 Animal cart | pulled by tamed beast | 40 stacks | 0.9 | husbandry, harness |
| 5 Rail | cart on track | 60 stacks | 1.4 | track building, smithing |

Rules: a carrier is an **entity with a capacity and driver requirement**; a wagon needs a driver; roads (paved or worn paths) improve speed. No belts, no drones, no priority matrix in MVP (R21).

**Difficulty from logistics, not distance:** a copper seam 60 cells away is a hand-haul problem at tier 0, a one-trip problem at tier 3. The player's design work is moving the *stockpile*, building a road, or stepping up a tier.

### 14.8 Mechanics: sinks against runaway production

The master design rule (D): an economy that is not bounded by labour and maintenance has a missing sink. Sinks:

1. **Decay** (§14.6): standing maintenance load roughly proportional to building count; growth saturates when repair labour equals builder labour. This is the central sink, carried over.
2. **Upkeep**: stations without workers make nothing; a bakery without a baker is idle. Each standing building draws repair materials from its own class.
3. **Maintenance of tools**: `durability` wear caps iron-working hoards.
4. **Convex costs**: trait upkeep (R16) is convex in trait value; large settlements have convex crowding costs (disease, low mood from crowded beds) ASSUMPTION; long hauling distances give convex time cost per item.
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

Economy stages (era labels, R14, are derived separately from capabilities held): hand hauling and bare stone -> baskets and clay -> wood and kiln goods -> metal tools -> wagons -> carts -> rail. Nothing is gated by an era; each step is a capability a living villager knows plus the physical items. Late first-planet: wagons and carts, road networks, a second settlement supplied (§17).

### 14.11 Failure states

| Failure | Consequence |
|---|---|
| No stock reaches station | Station idle; Why panel "no_material: clay" |
| No worker | Station idle; "nobody can run the kiln" |
| Spoiled hoard | Food waste; pressure on keep_food rises |
| Hauling bottleneck | Items pile at source; blocker `no_capacity`; suggested tier step shown |
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

**MVP:** ~12 materials with properties, ~15 recipes in the slice, skill-to-quality, stockpile zones with keep N, spoilage, tiers 0-2 (hand, basket/box, backpack), sinks 1-4 and 7-8 implemented, max-expansion bot. **Later:** wagons, animal carts, rail, roads quality, luxury goods, trade between settlements, documents/library (R10 later).

---

## 15. Emergent Technology & Civilization Development

### 15.1 Purpose and player experience

**Purpose.** Progression is discovery, not a research screen (brief: no rigid Civ-style tree; tech = new capabilities, not +% bonuses). To be candid about the data: the phenomenon rows form a hand-authored graph (§15.7). What is emergent is **which route is taken, when, by whom and under what pressure**, plus the alternate implementations per capability slot (§16.4). The player never sees the graph or spends points on it. New abilities appear because villagers *see physics happen* or *try things*, and persist because villagers *know* them. The player steers by priorities and by changing the situation, not by spending research points.

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

A capability never grants "+10% storage"; it lists exactly which recipes, building parts and orders it enables (B). That list is a graph edge by another name; the honest claim is "no research screen, an authored graph whose edges the world, not the player, selects" (K8). The `mechanism` field is kept in the schema so a belief mechanism can be added without a schema change (R13).

**Knowledge model (R10, MVP single layer; the two numbers are justified in §10).** Each villager holds per-craft **familiarity** (0-1, "can attempt") and **skill XP** (quality and speed; specified in §10). A craft is *known* by a villager when familiarity > 0. Familiarity rises by witnessing, tinkering, working beside, and Teach. B's separate notion layer is merged into this. The village also keeps a boolean `seen[phenomenon]` for the Almanac and for gating who may attempt a tinker, not a per-head layer.

**Capability = a living knower (R10).** The query `can(verb, settlement)` is: at least one living villager with familiarity > 0 *plus* the physical enablers (skill sets quality and speed only), checked **when a job is chosen**, not as a derived settlement flag. Skills gate quality and speed, never the ability to attempt (R17). There is no grace timer and no revocation event: the forge sits cold because nobody can run it.

### 15.3 Mechanics: phenomena and context

A phenomenon fires in the sim whenever its conditions co-occur, whether or not anyone intends it. Conditions are material properties plus **context** at a work site (§11.9): `heat` level, `moisture`, `enclosed`, `draft`, `duration`, `airy`. Matching is indexed by input tag so only a stack whose context changed is checked; the duration counter lives on the stack/station in integer ticks (saved; R23). All durations below are ticks with real seconds at 1x in brackets (Units & clock, §23).

Example schema:

```
phenomenon BAKE_CLAY
  inputs    clay (wetness .3-.9)
  context   heat >= 2, duration >= 600 ticks [30 s at 1x], enclosed: any
  outputs   fired_clay (hardness .6, water_resist 1.0, brittle .5)
  salience  0.7           // it turns red-brown, rings when tapped
  serves    [container, durable, wall]
  near_miss: heat 1 for >= 600 ticks -> "warm and dry, but still crumbles"
```

**Dedup rule.** A repeating phenomenon (a bonfire) fires its witness check at most once per (phenomenon, site, witness) per 450 ticks [22 s at 1x, a quarter game day] (ASSUMPTION) so it does not spam.

### 15.4 Mechanics: witness and tinker

**Witness.** When a phenomenon fires within a villager's sight (shared sight cache, §13.8):

```
witness = salience x attention x (0.6 + 0.4*intelligence)
          x (1 + 1.0*pressure(tag))          // pressure in 0..1
          x culture_bias (1.0-1.3)           // §16.3
attention: 0.3 passive, 0.6 working nearby, 1.0 performing it
sticks if witness >= 0.2 ; familiarity := max(familiarity, min(1, witness))
```

Possession adds Steadfast only for discovery purposes (R9); the +15% XP does not affect witnessing. A villager below the 0.2 threshold "did not notice". Repeated witnessing adds diminishing returns: `+0.5*(1-f)*witness`.

**Tinker.** `tinker` is a normal board job (R5, K8). Its board class is **standing (200)** when the player has asked for it ("Investigate: X", or a priority on a pressure tag) and **personal leisure (0)** otherwise, so unasked tinkering happens only in free time and never pre-empts food or hauling. A villager with free time and an **itch** (an unfamiliar material in reach, a persistent pressure > 0.3, a Curiosity they hold) picks candidates:

- Candidates are drawn from **what is physically in reach**: stock near the site x contexts the settlement can build now x a small verb set (hit, soak, bury, heat, mix, press, bind). **Hard cap 8 candidates** per village, precomputed when stock or stations change (not per villager per pick).
- Weight: `w = 1 + 2*relevance(pressure tags vs the materials' *perceived* properties) + 1*novelty + culture_bias`. A villager never sees output tags, only what the inputs look and feel like ("crusty, dries the tongue" -> `keep_food`).
- If the combo satisfies a phenomenon, it fires (performer attention 1.0). If not, the attempt costs inputs and labour and records a **dead end** keyed to the context level attempted; it is invalidated when the context later exceeds that level (tech review).
- Risk: `danger` can hurt the tinker (burns, fumes); permadeath makes it a real cost.
- Per-station cooldown: one experiment per station per day; experiments on unseen items are impossible.

Pressure uses the village demand vector keys directly via a small `serves -> demandKey` table (no new tag vocabulary; tech review).

**Tinker aptitude** is the villager's intelligence plus craft familiarity; leisure XP in tinkering is flavour only. **Expected cadence (ASSUMPTION, P11):** about 19% per attempt under pressure with 8 candidates, one attempt per interested villager per ~2 days: discovery in ~4-6 days under pressure, ~15-25 days without. No fixed accident timer: the safety net is §11.8 and §15.9.

### 15.5 Worked examples

#### 15.5.1 Fired clay (pottery)

State: FIRE_TENDING held (itself discovered by witnessing a lightning or stump fire; it is not known at the start, K3); clay daub on a straw hut wall; clay bank known on a stream.

1. A daubed lean-to stands beside the hearth. The hearth is lit nightly; heat on the wall reaches level 2 for over 600 ticks [30 s]; BAKE_CLAY fires on the daub patch. Hira sleeps nearby; Tob adding a log sees it: `0.7 x 0.6 x 0.84 = 0.35`, pressure for `carry_water` is 0.4 after a dry spell: `x1.4 = 0.49`. Tob's familiarity with POTTERY becomes 0.49.
2. Itch: partial familiarity and pressure 0.4 make `tinker` attractive; candidates include {clay, shaped bowl, hearth}. A bowl shape is a "holds things" shape.
3. Tob shapes a bowl and leaves it in the hearth. BAKE_CLAY fires with attention 1.0; familiarity rises to ~0.74. A second phenomenon HOLDS_LIQUID fires when water meets fired clay; the Curiosity "baked clay holds water" resolves.
4. Mira watches Tob make a second bowl; observation slowly raises her familiarity; Tob **teaches** her (costs his time, fast). POTTERY is now known by two living villagers. The chronicle records the first and the Era label updates to "Clay age" (R14).
5. Unlocks: `pot`, `jar`, `crucible` (later), the `kiln` part (a clay-lined pit with wood fuel reaches heat 3, P = 2.24, §11.9), "store grain in jars", and the stew phenomenon (soak + heat in a vessel).
6. Failure mode: if Tob dies before Mira's familiarity is above 0, POTTERY is not known. The kiln pit, the fired bowls and the jar store are **evidence**; a tinker job near them rediscovers at a large discount (R11, §15.8).

#### 15.5.2 Copper smelting (charcoal precondition and how a soft-lock is prevented)

Required elements, all data rows, none a quest:

- **Malachite**: green, heavy; surface stain on rock (§11.5) or a shallow dig. Slice mining of soft rock uses knapped stone tools, which are known at the start (K3).
- **Charcoal** (carbon fuel, H 2.4 vs wood 1.6): from SMOULDER_WOOD (wood in a sealed, earth-mounded fire cell, §11.9 charcoal burning). **Charcoal is a precondition** for level-4 heat.
- **Heat level 4.** The heat function is owned by §11.9 (`P = H x E x D`; level 4 needs `P` >= 4.0) and is not redefined here. In its terms, level 4 needs **charcoal** (H 2.4; wood never exceeds 3.48). Layouts that reach it include a clay-lined open-top pit with an adjacent bellows (2.4 x 1.40 x 1.3 = 4.37), the same pit on a windy ridge (4.37), and a lined, lidded pit with a vent (4.35). A plain hearth reaches level 2; a lined pit burning wood reaches 3 (2.24); a charcoal pit with no draft stays at 3 (3.36); a sealed lined closet with no vent falls to level 2 (no closet cheat). If §11.9 changes, this list changes with it.
- **SMELT_COPPER**: `malachite x2 + carbon x1`, `heat >= 4`, `duration >= 1200 ticks [60 s at 1x]`. `salience 0.8` ("green rock bleeds red metal").

Walk-through:

1. Dov mines malachite while seeking a vein (the "stranger material" gives him an itch). Stone blades are chipping: pressure(`tool_edge`) = 0.5.
2. He tries {malachite} x {open hearth, kiln pit}. Three attempts fail at heat 2-3; dead ends "green rock + hearth: only a stain" recorded for those context levels.
3. **Near-miss hint** appears in the Almanac after 3 failures, directional only: "Green rock changes at a higher heat than your best fire reaches." The player can think: more draft, a better fuel, a ridge.
4. **The soft-lock risk.** If the village has never buried a fire, charcoal does not exist and heat 4 is unreachable: tinker samples only what is in reach and charcoal is not in reach. This is the circular soft-lock the tech review found.
5. **How the world prevents it (three layers):**
   - *Environment*: lightning strikes forests and dry meadows; stumps smoulder (§11.8). The lightning fire leaves charred wood; a villager that witnesses it records SMOULDER_WOOD at low familiarity. The same lightning fire is also how FIRE_TENDING is first witnessed (K3).
   - *Director-as-environmental-event*: because pressure(`tool_edge`) > 0.3 for two seasons *and* no charcoal exists in reach, the "smouldering stump" event row is eligible and places the precondition near the settlement (a mound of earth over a smoking stump). It grants nothing; it only makes charcoal **possible**.
   - *Validator*: at worldgen the seed is checked that charcoal has a route (forest wood + an enclosed low-oxygen context buildable from clay/earth) or an event row that can create one, and that a ridge/draft site exists within R (§11.10).
6. Someone (witness or tinker) finds charcoal. A villager builds a charcoal-fuelled lined pit with a bellows or on the ridge (§11.9 layouts); heat 4 for 1200 ticks; SMELT_COPPER fires with attention 1.0, pressure x1.5.
7. Copper is **not** gated by a holder count (R10): one living knower can run it. Quality and speed depend on skill; unknowing villagers learn by working beside and by Teach.
8. Unlocks: `copper_ingot`, cast tools via clay moulds (a second phenomenon), the verb "mine copper", harder-rock breach. Era label "Copper age".

#### 15.5.3 Food preservation (alternate implementations)

Setup: three hard winters; pressure(`keep_food`) = 0.6 (EMA of shortfall).

- Salt: found on beach pans or an inland seep; CURE_MEAT_SALT (meat + salt, shaded, >= 3 game days).
- Drying: DRY_STRIPS (meat/fruit, airy and dry, >= 2 game days); fires unattended on a rack in autumn wind.
- Smoking: SMOKE_FOOD (meat + smoke from low wood fire, enclosed).
- Cold cellar: a dug room below frost line; spoilage drops with cold (§14.6).

Walk-through: Mira finds salt as a stranger material; her tinker weight for {meat + salt} is `1 + 2*0.6 + 1 = 3.2` vs ~1; meanwhile an unattended DRY_STRIPS fires and a hunter witnesses it (pressure raised attention). The settlement now has two partial answers; which one it **commits** to depends on terrain (a coastal village salts; a forest village smokes). These are **alternate implementations of one capability slot** ("preserve food through winter", §16.4) with different costs and failure modes. Chronicle: "the Marsh Reach learned to smoke fish."

### 15.6 Mechanics: Almanac, Curiosities, near-miss hints

**DECIDED (R12).**

1. **Almanac** (per settlement): crafts known, grouped by capability; holders by name; strength words from familiarity ("sure / fairly sure / half-remembered / only one knows"); dead ends ("tried, nothing"); last-holder risk icon.
2. **Curiosities**: live itches in plain words ("Mira keeps turning over the white crust from the shore"), plus wild things seen on expeditions (R27). Source: unresolved stimuli behind `itch`.
3. **Near-miss hints**: when an attempt matched a phenomenon on inputs but missed on a context level, after >= 3 failures the Almanac states the gap in words ("hotter", "longer", "drier"). They **never name the product** and are directional only.
4. **Silhouettes** (post-slice; a Curiosity of a relic or foreign item covers it in the slice): "it is metal; nobody here knows how it was made."
5. **"Why is no one experimenting?"** is a Why-panel entry: no free time / no itch / no candidates in reach / danger-averse (tech review).

### 15.7 The authored graph: ~12 linked discoveries

**ASSUMPTION; hand-authored, deeply interlinked (tech review).** Leaves to iron. Each row is a phenomenon + craft + capability; "Needs" are the preconditions. The graph is authored; the world decides which of its alternate routes is walked, when, by whom, and under what pressure (K8). The **slice (C3)** implements the chain fire -> fired clay -> charcoal -> copper (rows 1, 5, 7, 9; row 6 optional; PROTOTYPE_PLAN §1); rows 2-4, 8 and 10-12 are the rest of the MVP content set.

**Start state of the slice (K3):** known at the start are foraging, gathering sticks/stones/grass, carrying by hand and **KNAP_STONE** (knapped hand tools). **Fire is not known**: FIRE_TENDING is the first discovery, found by witnessing a lightning or stump fire (§11.8).

| # | Discovery | Needs | Opens | Slice |
|---|---|---|---|---|
| 1 | FIRE_TENDING | witnessed lightning/stump fire, wood | hearth, warmth, cooking | yes |
| 2 | KNAP_STONE (start) -> DRESS_STONE | stone, flint; hammerstone | stone tools, cutting; dressed-stone walls | start knowledge only |
| 3 | CORDAGE / HIDE_WORKING | fibre/hide, knife | bindings, backpack, hide teepee | no |
| 4 | FRAMING | wood, axe | timber cabin, supports | no |
| 5 | BAKE_CLAY / POTTERY | clay, hearth (heat 2) | pots, jars, kiln part | yes |
| 6 | KILN_FIRING | pottery, charcoal or hot wood fire | level-3 heat, brick | optional |
| 7 | SMOULDER_WOOD (charcoal) | wood, covered pit | carbon fuel | yes |
| 8 | DRY / SMOKE / SALT (one chosen) | food + shade/smoke/salt | winter larder | no (a minimal larder rule exists, §14.6) |
| 9 | SMELT_COPPER | malachite, charcoal, level 4 | copper ingot | yes |
| 10 | CASTING | copper, clay moulds | cast tools | no |
| 11 | HAMMER_NATIVE (cold-hammering) | native copper/ingot | sheet, fittings | no |
| 12 | SMELT_IRON + FORGE_WELDING | iron ore, level 5 | iron tools, deep rock | no |

**Content cost (D14, ASSUMPTION; the same figures are used in MVP_SCOPE and TR-23).** The discovery **system** (data model, witness/tinker, Almanac, Curiosities, validator, trace log): 1-1.5 FTE-months. The content for the **twelve linked discoveries**: 10-15 FTE-weeks, from 6-10 designer-hours per interesting discovery plus tuning; the C3 chain subset (rows 1, 5, 7, 9, optional 6) is about 4-6 FTE-weeks of that. The **full first planet** (~110-130 phenomena): 4-8 FTE-months. Content is not independent; adding a phenomenon lengthens everyone's candidate list, so the cap and cadence tuning is global.

### 15.8 Mechanics: knowledge loss, rediscovery, eras

**Knowledge loss (R11).** Specified in §10 (Knowledge loss and rediscovery): the last holder's death makes the craft unavailable, never permanently; evidence (built kilns, stored products, ruins, relics, silhouettes) makes a tinker job rediscover it at a large discount (about 20% of the first cost, pass gate ≤0.4×). Chronicle entries serve as hints.

**Transmission (R10).** Specified in §10 (Familiarity and Teach): watching (slow; `0.025*aptitude*(1-familiarity)` per 100 ticks [5 s at 1x] in sight, one learning target per learner), Teach (fast), kin learn faster by proximity; splinter founders carry knowledge (§17.5, post-MVP). Documents/libraries are later.

**Lifespan check (R1, D13).** A skill must be learnable in 20-35% of a life, tuned so average aptitude reaches 0.7 in about 30% of a life (about 1.2 game years). Prototype P12 (deferred, trigger in PROTOTYPE_PLAN §4): 10 generations of a 3-smith village; craft survives >= 8 of 10. Because masters emerge (§10, K6), craft loss is a real possibility, softened by evidence-based rediscovery.

**Era labels (R14, K10).** Labels are derived from capabilities held, shown in the chronicle, never gates. The label shown is the **highest-ranked** label whose signature is held by any living knower (signatures are not cumulative, so skipping a stage is legal and shows as a hole in the chronicle). Order: **Hearth -> Hide -> Stone -> Clay -> Timber -> Copper -> Iron**.

| Label | Signature (any living knower + enabler) | Shelter that appears from materials (§12.10) |
|---|---|---|
| Hearth age | FIRE_TENDING | leaf bed, lean-to |
| Hide age | HIDE_WORKING | hide teepee |
| Stone age | DRESS_STONE | dressed-stone hut |
| Clay age | POTTERY | daubed hut, fired-clay hearth and kiln |
| Timber age | FRAMING | timber cabin, brick (with KILN_FIRING) |
| Copper age | SMELT_COPPER | copper fittings |
| Iron age | SMELT_IRON + FORGE_WELDING | iron-framed buildings |

The slice chain walks Hearth -> Clay -> Copper (KNAP_STONE is start knowledge and does not label); Hide, Stone and Timber are skipped unless their rows exist in the build, which the order check confirms: Clay comes before Copper on the chain, and Timber is off-chain. The shelter column is not an unlock list: the player builds teepee, cabin or brick houses from whatever materials and shapes the settlement has, and the label only reports what the settlement can do (K10).

The first-planet endpoint is early industry (OD-33), beyond the Iron label; labels past Iron (for example a wagons-to-rail "Mechanical age") are post-MVP content, and any observatory-style capstone that seeds the space expansion belongs to §20, not the first planet's MVP. slime-village's 14-step quest chain (First Light, Knapping, The Hearth, Bench and Vice, The Iron Age, The Crucible...) is retained as chronicle "firsts", not unlocks.

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

Nothing is a research button. All nudges go through the same sim; the player has three levers, not six.

- **Priorities** (carried over FOCUS weights): a focus on `tool_edge` or `keep_food` raises pressure(tag) in the demand vector; this boosts witness strength and tinker weights. Soft: a starving village eats first (K4).
- **Provision**: place materials where people will encounter them, build a kiln pit, fell wood for charcoal. Changing the situation changes the candidate set.
- **Investigate: X** on an unfamiliar material: assigns 1-3 villagers at a station with chosen stock; candidates narrow to those inputs, and the `tinker` job is then class standing (200, K8). One button, no queue.
- Possession (attention 1.0, never required), expeditions for stranger materials (§13.4) and apprenticeship by proximity are already covered elsewhere and are not research levers.

**Vignette.** The player sees "Dov wonders about the green rock" and "stone blades are chipping". They set a focus on tools, build a clay-lined pit on the ridge and have lumber turned to charcoal via a standing order. A tinker job starts with Dov and two helpers. Four game days later the chronicle reads "Dov made metal."

### 15.11 Interactions

- §11: context, events, validator; §12: stations expose context; evidence is built things.
- §13: stranger materials and ruins create Curiosities; hazards produce witness events.
- §14: recipes read capabilities; materials share data; quality by skill.
- §16: culture biases attention and candidate weights; alternates differ by environment.
- §17: capabilities gate command scales; founders carry familiarity.

### 15.12 Progression

Capability growth is a (hand-authored) graph of discoveries (15.7) rather than a research tree; the player sees which are known and which are open, never the answer key. First-planet release adds husbandry/biotech alternates (R13), documents and libraries, more phenomena toward early industry (~110-130 total at full scope; tech review risk 5). Post-slice content stays data.

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

**MVP:** the twelve-discovery content set (§15.7; the C3 slice implements the fire -> clay -> charcoal -> copper chain), data schema, context for heat/enclosure, witness, tinker (cap 8), Almanac, Curiosities, near-miss hints, era labels, rediscovery discount, validator, discovery trace log and force-fire debug command. System 1-1.5 FTE-months; content costs per §15.7 (D14). **Later:** husbandry/biotech alternates, documents and libraries, ancient site templates, per-seed perturbation, belief mechanism, early-industry content.

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
| `needs` | hunger, thirst, energy (sleep), leisure, warmth |
| `body_plan` | size, carry capacity, sight, speed |
| `diet` | what it eats and how it breeds |
| `aptitudes` | skill-rate ranges per craft |
| `heat_tolerance` | max sustained heat context |
| `available_capabilities` | tag preferences/limits (e.g. a species that cannot sustain heat > 3 never finds the smelter) |

A second species is **data plus art** (R15). Dorfs are a candidate future species with nothing to port from the old Godot project except the idea (B). Differences are tag preferences and capability availability, not whole separate trees.

Slimes' traits, inheritance and the min-max guards are specified in §08.

### 16.3 Mechanics: culture = chronicle tallies

**DECIDED (R14, cuts).** Culture is a settlement's **running record of what it has actually done**, not a faction and not a tech tree. Mechanism (MVP, tiny):

1. Per day, tally time-use by activity tag: forage, hunt, farm, mine, build, craft:<verb>, wander, rest, gather, tinker. Keep an EMA over ~1 year: `lean[tag] = EMA(share of work time)`.
2. A **leaning** is named when `lean[tag] > threshold` for N seasons (e.g. hunt > 0.35 for 4 seasons -> "hunters"). Names are descriptive labels shown in the chronicle, not buffs.
3. Effects (never output multipliers). Attention bias and tinker weights are the only effects in the MVP and are the first thing cut if playtests do not feel them (§16.8); rehearsal and mood/belonging arrive with traditions (post-MVP):
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

**Reasons it is deferred:** (1) it adds a new notion type, ritual jobs, shrine structures, doubt/schism dynamics and a belief-readout UI; (2) it is a second progression system parallel to physics with its own balance: either strictly worse than physics (nobody picks it) or a free lunch (everyone does); (3) it creates a new class of "why did it fail" bugs; (4) the author left it a candidate needing "clear rules or cut"; (5) the right home is a later species whose whole tech is belief (e.g. orks), with a species table flag `mechanism: belief`. First-planet use of belief-like ideas is limited to culture traditions (themselves post-MVP, §16.3).

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

**MVP:** slimes only; species table; leanings (tally labels); alternates on 2-3 capability slots (preserve food, tool edge, walls; OD-34); chronicle culture lines. **Later:** ~8 traditions, biotech alternates, second species, belief mechanism, rival civilisations as ruins/NPCs.

---

## 17. Settlement Growth & Automation

### 17.1 Purpose and player experience

**Purpose.** Let the player scale from commanding individuals to running a supplied network of settlements without turning the game into automation, and without belts or drones (AGREED). Automation here means **higher-scale commands executed by people**, never by machines. **Autonomy maintains; the player advances** (RESOLUTION organising sentence).

**Player experience.** Early: "Bob, collect that iron." Later: "keep iron supplied" for a mine. Later: "supply network" between two settlements by wagon. At each stage the player gives fewer, higher-level instructions, and sees where they stall.

### 17.2 Mechanics: command-scale progression

| Scale | Example | Written as | Unlocked by |
|---|---|---|---|
| Personal | "Bob, collect that iron" | Commanded job for one villager | start |
| Selection | "You five: chop" (select, right-click the target) | The same command applied to a selection; naming it as a crew is optional (R6, K10) | start (needs at least two villagers) |
| Standing order | "keep 200 iron" | Stock target with hysteresis (R7) | first stockpile exists |
| Blueprint | "build x10 houses" | Batch of ghost sites (R19) | first enclosed built room saved |
| **Supply order** (post-MVP) | "keep iron supplied" | A standing order scoped to a **source** (mine/crew) and a **sink** (stockpile or station) | a stockpile near a producer and a crew assigned |
| **Supply network** (post-MVP) | "send timber from the forest settlement to the foundry" | Recurring route job between settlements at a given transport tier | a second settlement + wagon tier + road |

Every scale writes into the same two structures (demand vector, job pool); higher scales do not add a scoring layer (R5, R6).

### 17.3 Mechanics: capability-gated command scales

**PROPOSED, extends A and R10.** A command scale appears in the menu when a living villager can carry it out and the physical thing exists:

| Command scale | Gate |
|---|---|
| Selection / named crew | at least one other villager unassigned |
| Standing order | the first stockpile exists |
| Blueprint stamp | one saved room qualified (§12) |
| Supply order | keep-N on a producer + a hauling capacity >= tier 1 + a crew |
| Supply network | wagon capability (a living knower, §15) + wheel/axle + road segment + two settlements |
| District order (later) | a record-keeping capability (writing) |

Gates are **capabilities, not player grinding** (A). A Steward (a villager autonomously choosing from the blueprint library) is a post-MVP option (R8); in its place, district standing orders scope an order to a building group.

### 17.4 Mechanics: transport tier as automation

The only automation is the **transport tier** (R21; §14.7): each step cuts the labour per unit moved. A "keep iron supplied" order at tier 0 occupies several haulers; at tier 3 one driver and a wagon. The order stays honest: if the mine is 80 cells from the foundry and only hand carrying exists, the order shows "behind by 38; no free hands; 3 are busy with food".

### 17.5 Mechanics: settlement splitting and new settlements

*Post-MVP: the MVP and the slice have one active settlement (OD-32; PROTOTYPE_PLAN §1). This section records the intended design.*

**Carried over from slime-village `maybeSplinter` / `findVillageSite` / `siteScore` and `adoptRuins`.**

- A settlement may be split by the player's order ("found a settlement") or by pressure (overcrowding, housing demand), a band of the **most driven members** with a starter cache walks out to a scored site.
- **Founders carry knowledge** (change from slime-village, B): a splinter keeps the familiarity of its founders, plus chosen blueprints and the leanings of its founders. Slime-village passed only ambition; this is the cheapest and most visible knowledge-travel mechanic.
- A new settlement starts with a starter shelter set (R8) and no firsts recorded yet; its chronicle starts anew, keeping a pointer to its parent.
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

**Vignette (late first planet, post-MVP).** Mid-game, the player has "keep 300 iron" on the north mine. They notice the Why panel says "behind: hauling, 3 haulers on food". They build a wagon shed and a stone road to the foundry. The same order now shows "on target". Later, they found a second settlement beside the forest with two builders and a blueprint library, and set "send planks to the foundry" as a supply network entry. The supply order shows the wagon's status on its stock bar; nothing else is micro-managed.

### 17.7 Interactions

- §12: blueprints and auto-build flag are settlement-scale; §13: expeditions found settlements; §14: standing orders and transport tiers; §15: capabilities gate scales; §16: founders carry leanings.

### 17.8 Progression

Stages: Camp (personal + crew) -> Village (standing orders, blueprints) -> Town (supply orders, wagons) -> Network (supply routes between settlements, rail later). Space (expansion) is out of scope.

### 17.9 Failure states

| Failure | Result |
|---|---|
| Overextension | Needs and the rested curve (§08, §10) cap what orders extract; there is no separate strain meter (K5). A village over-ordered into the ground simply loses leisure XP and gets slower |
| Supply stalls | Why panel: no_material / no_path / no_capacity |
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

**MVP:** personal order, crew, keep-N standing order, blueprint stamp, one expedition type, one active settlement (OD-32). **Later:** founding a second settlement by splinter with founders carrying familiarity, supply orders between producer and sink, wagon networks, district orders, supply routes between settlements, aggregate LOD for far settlements, Steward as optional QoL, rail.

## 18. Mortality, Loss & Emergent Storytelling

### Purpose
Death is what gives the rest of the game weight ("send your max-level miner into the woods, he might get killed and now he's gone forever", AGREED). The system must make losses felt, legible and survivable, and record them so the player later finds stories in the data without authored writing.

### Player experience
- Villagers age visibly (fitness fades, hair/colour dims in art), and mostly die of old age in a healthy settlement (carried over: "most deaths in a healthy colony are old age").
- A death shows a short, unobtrusive event: a toast, a grave marker, a line in the chronicle. Losing a master is sad because of what is lost (a craft, a skill) not because of a scripted cutscene.
- The chronicle is the settlement's memory: a readable list of firsts, losses, births and notable lives, with a digest on return after time away (R22).

### Mechanics

#### Aging and death (carried over from slime-village)
- Death = health reaching zero from any harm source: old age (`AGE_DMG * frailty^2`), starvation, thirst, cold, animal, hazard (cave-in, bad air, the one wounding fauna, R20), "the cost of a child". `killSlime(s, cause)` semantics port: drop inventory as piles, release claims and reservations, remove from home, record stats.
- The cause list is closed and data-defined; every death has exactly one cause string stored.
- Corpses rot on their clock; nothing drops loot (carried over).
- Under R1 a typical life is ~10 real hours at 1x; deaths from old age cluster in the final 20% of the life curve.

#### Permadeath (AGREED; possession rules R9, DEFAULT)
- Permadeath is absolute. No revive, no resurrection, no respawn. A dead villager is removed from the sim and written to the chronicle as a compact record.
- **Death while possessed is ordinary permadeath** (R9). Possession has no safety net: needs keep running, control is released only on collapse (incapacitation), never on a warning. Collapse and death are different states: a collapsed villager can still be saved by others for 600 ticks [30 s at 1x] (ASSUMPTION), and the player is returned to the god view.
- Sudden strokes of bad luck should be survivable more often than not for a healthy villager; there are no instant-death traps in MVP (hazards damage over time or give a visible warning: tag "bad air", unsupported span marker).

#### Grief and mourning (small, DEFAULT; post-C3 flavour, not in the slice)
Kept deliberately small; it is texture, not a system.
- Family (parent/child/partner) and **friends** (+8 relation, §08) of the dead gain a **Grief** status: mood -0.15 for 1 game day, fading linearly; and they take a leisure episode at the grave if idle. Rivals get nothing.
- A settlement with >= 3 deaths in one game day gets a single "dark days" chronicle line (no extra mechanic).
- Grief never reduces output by more than ~5% and never triggers cascades (no death spirals, no suicide mechanic). An informal check in the harness: mean output drop after a death < 10% for one day.

#### Graves and heirlooms (PROPOSED, small named-item exception; post-C3 flavour; the Gravestone chronicle record stays in the slice)
- Each death can leave a **grave** (a marker entity placed by villagers on idle time, near home). The first grave in a cluster makes an `ancestor grove` flavour tally used for chronicle text only.
- **Heirlooms** are the one exception to "items are anonymous stacks": an item flagged `named` with `{maker, origin, createdYear}` that survives its maker. Rules: created automatically when a villager at skill >= 0.85 finishes a signature item, or manually when the player marks an item. Max ~1 heirloom per 10 villagers. They are carried or stored like any item, have a name ("Tob's flint axe"), and *no stat bonus from heritage*: the item's quality comes from the maker's skill, nothing more. They show in the chronicle when passed on ("Bren now carries Tob's flint axe"). If lost with its holder in a ruin, it becomes a relic to find (later).

#### Notable individuals (PROPOSED; post-C3 flavour; the personal log and chronicle stay in the slice)
A villager is "notable" when any of: first holder of a craft; skill >= 0.85; lived to elder with >= 3 children; died in a notable way (first death from a hazard type); player-marked ("watch"). Notables get an inspector star and a chronicle entry at death; others get only their record. Cap notable list at ~30 shown; the rest summarised.

#### Chronicle schema and event stream (DECIDED/PROPOSED)
The chronicle is a **consumer** of the typed sim event ring buffer (C); it is not a core system. It writes compact records into a long-lived log, saved with the world and exportable.
```
ChronicleEntry {
  id, tick, gameDate{year,day},
  kind: FIRST_CRAFT | CRAFT_LOST | CRAFT_REDISCOVERED | BIRTH | DEATH |
        BUILT_FIRST | ERA_LABEL | DISASTER | EXPEDITION | MILESTONE | NOTABLE,
  actors: [villagerId], place: {chunk,x,y,z} | null,
  text: string (template + names),
  data: { cause?, skillAtDeath?, craft?, label? },
  severity: 0..2
}
VillagerRecord (kept after death) {
  id, name, colour, parents[2], generation,
  birthTick, deathTick, cause,
  topSkills[3], craftsKnown[], children[], notable, lastLogLines[10]
}
```
- **Events consumed** (existing event stream, C): `Born`, `Died`, `SkillUp`, `CraftLearned`, `CraftLost`, `RoomChanged`, `BuildingFinished`, `HazardHit`, `ExpeditionReturned`.
- **Era labels** (R14, K10; order Hearth, Hide, Stone, Clay, Timber, Copper, Iron, §15.8) are written as `ERA_LABEL` when the highest-ranked signature changes ("Copper age begins"); they are labels, not gates. slime-village's quest chain (First Light, Knapping, The Crucible...) becomes `FIRST_*` entries.
- **Digest on return** (R22): on resume after time away or when the game was backgrounded, the player gets a short list of the highest-severity entries since the last time they viewed the chronicle (cap ~10).
- **Storage**: ~10k historical records ≈ 2 MB raw (C), so the budget is ≤1 MB (OD-37) by keeping firsts and top-K per year and compacting old years to counts (§23.8).
- **Text** is template-based, with names filled in. No generative writing. Entries are factual one-liners: "Year 3: Tob fired clay for the first time." "Year 5: The last person who knew how to fire clay has died." "Year 5: Tob (generation 3) died of old age, aged 4.1 years."
- **Ruins** (carried over): an abandoned settlement keeps its chronicle; a later band that adopts the ruin inherits it ("the place did not stop being that place").

### Save-scumming stance
**DEFAULT (D8, OD-12): allowed, not encouraged, with an optional "ironman" flag.**
- The game autosaves on a rolling schedule; manual saves are allowed. The player owns their world; the game does not police how they play. Save-scumming is not an exploit that breaks other systems because the sim is deterministic (R23): reloading restores the same RNG streams and replays commands, so reload-and-retry of a single risky call is not a hidden roll, it replays identically unless the player's commands differ. The "luck" is the player's decisions, and the ethical weight of permadeath is their choice to honour.
- Design nudges against it: the chronicle shows "reloaded" badges nowhere (no shaming), but achievements/firsts text does not depend on it; rewards for permadeath narratives come from the log, not from points.
- **Ironman flag** (optional at world creation): single autosave slot overwritten on exit and each game day; no manual save slot; the flag is recorded on the world and shown in the chronicle header. No gameplay differences otherwise. Visiting (R23, async snapshots) can display the flag.
- Why not forbid: pillar "no manipulative loops" and "player is not a servant of the game"; also no multiplayer competition at stake in MVP.

### Interactions
- §08: aging curves, traits, relationships (grief), personal log.
- §09: death releases reservations and updates crews; "no_skill_known" arises when a craft dies.
- §10: skills at death recorded, knowledge loss warnings, lineage.
- Hazards (R20) and fauna: causes of death.
- R22 time away: chronicle digest.

### Progression
Early game deaths are mostly accidents and hardship; mid game old age dominates; late game the settlement's chronicle holds generations of firsts and losses that the player reads when choosing what to protect. The ruins of a failed settlement are a personal mystery for a later one.

### Failure states
- **Death spiral**: a few losses -> lower output -> more losses. Counter: grief cap, needs priority, stagnation not collapse (D's band: >= 90% unattended survival).
- **Chronicle spam**: too many entries. Counter: severity filter, caps on kinds per day, digest.
- **Hollow deaths**: deaths with no feeling because villagers are anonymous. Counter: personal logs, named heirlooms, friend/rival grief.
- **Frustrating losses**: unlucky death of a master with no warning. Counter: collapse state, early warnings, `bad air`/span markers, teaching nudges, cheap rediscovery.

### Exploits & counters
| Exploit | Counter |
|---|---|
| Death-farming for mana/XP/resources | Cut entirely; death grants nothing |
| Sending expendables on dangerous work to avoid losing masters | Valid play; expendable villagers still cost food and time to raise |
| Possession as safe suicide missions | No safety net; permadeath applies; Steadfast only blocks panic, not damage |
| Save-scum a risky expedition | Allowed; the cost is time; ironman flag for those who want stakes |
| Heirloom hoarding | Heritage gives no stats; cap ~1 per 10 villagers |

### MVP vs later
| MVP | Later |
|---|---|
| Aging, causes of death, permadeath incl. possessed, grief (small), graves, named heirlooms (rare), chronicle with ~12 kinds, VillagerRecord, ironman flag, digest | Heirloom persistence in ruins as relics, notable-individuals UI polish, memorial buildings, generated epitaphs, chronicle export for sharing |

**Example.** The player possesses Bren to scout the north cave. Bad-air tags flicker; Bren's energy drops below critical, and he collapses (control returns to the god view). Dov reaches him in time. Later Bren is killed by a thornback in the same cave on a second trip. Tob and Mira (friends) take a leisure episode at his grave; the chronicle reads "Year 6: Bren, who first mapped the north cave, was killed by a thornback." A flint knife Bren made, named "Bren's knife", is now carried by Mira.

## 19. Optional Playstyles & Accessibility

### Purpose
The game offers seven ways to spend a session (builder, manager, optimiser, explorer, expedition leader, researcher, observer). The section makes three promises testable:

1. **No playstyle is required.** The village is never helpless because the player spent hours elsewhere (the autonomy band, R8: "Autonomy maintains; the player advances"), and exploration never depends on liking base management (delegated expeditions, R6/R27).
2. **Each playstyle has its own progression**, meaning something that visibly grows or becomes possible because of what that player does, not a bonus bar.
3. **Specialising is never invalid and mixing is rewarded** through real synergies (a surveyed cave feeds a researcher; a blueprint feeds a manager), not through multipliers.

Accessibility is part of this section because the playstyles only work if the controls, speed, text and colour are usable by the people who prefer each one. The game has an unusual accessibility hazard: **slime colour is genetic** (inherited in HSV hue-space, carried over from slime-village), so identity information must not live in hue alone.

Hard exclusions from the brief, applied to every playstyle: **no chores, no energy system, no timers, no streaks, no login or return rewards, no "come back in N hours".** Any alert is advisory and never requires a response (see §22).

### Player experience
A player should be able to say, after any session, "I mostly built / managed / optimised / explored / led expeditions / experimented / watched", and be able to point at something that changed: a blueprint library entry, a stock bar that stays full, a new capability in the Almanac, a map region, a Chronicle page. Playstyles are **emphases, not modes**; there is no menu where one is chosen and nothing is locked by choosing.

Return experience (R22): when the player has been away (focus lost, or the game ran backgrounded), the game shows a **chronicle digest** of what happened, written from the Chronicle (see §18). There is no catch-up reward and no "missed" state.

### Mechanics

#### Playstyle profiles

Each profile lists what the player does, how they progress, what the village does without them, a short vignette, and the failure the design is guarding against. "Without them" is always measured against the autonomy band: eating, sleeping, hauling, repair, replanting, firewood, healing, fleeing and basic shelter from the starter shelters and any blueprint flagged **auto-build** (R8). Anything new (a new kind of building, place, research direction or scale) waits for the player. That wait is **stagnation, not collapse**, and the UI never calls it failure.

Each profile is a short table: what they do (with the owning section), what grows, what the village does without them, one vignette, and the guarded failure. Mechanics are specified in the cross-referenced sections and are not repeated here; pairwise synergies are in 19.8.

**19.1 Builder (build and decorate)**

| | |
|---|---|
| What they do | Freeform building, Room Purposes, Blueprints and "stamp x N" (§12). |
| Progression | Blueprint library; graded Room quality (R18); material classes opening as crafts are learned, so one blueprint rebuilds as a more capable building (wood -> stone -> brick -> metal, §12.6); multi-storey and underground; Chronicle firsts. |
| Village without them | Builds starter shelters, repairs what stands, rebuilds blueprints flagged auto-build; invents no workshop, granary or second storey. |
| Vignette | The player traces a 7x5 stone-floor room around the kiln site, drops a door and two benches; the checklist reads "Workshop: floor ok, 2 of 2 benches, light 0.6 (needs 0.5): ok, roof: ok." They save it as *Kiln Shed* and stamp x3 near the clay pit. |
| Guarded failure | "Builder is only decoration": rooms must change outcomes (cold, workshop quality, mood). "Blueprint spam land-grab": cap on queued sites (D 2.10). |

**19.2 Manager (manage inhabitants)**

| | |
|---|---|
| What they do | Select villagers and order them ("you five, harvest lumber"); optionally name a selection as a crew; standing orders ("keep N"); read the Why panel to clear Blockers; place stockpiles; Teach (§07, §09, §10). |
| Progression | Scale of operation from everyone-does-everything at 6 villagers to named crews at 20-60 (R4); fewer stalls per day on the Why panel; transport tier (R21); craft continuity (§10). |
| Village without them | Gathering and hauling continue; standing orders keep refilling below ~80%; nothing new is begun. |
| Vignette | The plank bar sits at 40%. Why says "Plank: blocked: no tool (axe needed; 0 of 3 axes)". The player ticks "keep 6 axes"; the bar fills over a game day and the plank bar follows. |
| Guarded failure | Micromanagement being optimal. Orders reserve work but never pre-empt a critical need, and derived jobs run at standing class (§09, K4); idle hands and the rested curve, not a penalty meter, make over-ordering unrewarding (K5). The manager is rewarded for delegating. |

**19.3 Optimiser (optimise production)**

| | |
|---|---|
| What they do | Place stockpiles and workstations to shorten walks, choose transport tiers and standing-order bands, invest in an Alternate implementation (R13), set up specialists (§14, §10). |
| Progression | Throughput per villager and per food in plain numbers; tool tiers (1.5-5x) and skills (<=1.8x) carry the large multipliers, genes the small one (R16, R17); new capability slots keep reopening the puzzle (R14); plateau is real (max-expansion bot <5%/year). |
| Village without them | Keeps current ratios; does not re-optimise its layout (no Steward in MVP). |
| Vignette | "Walk time: 38% of the stone crew's day." The player moves the stockpile to the mine mouth and swaps carriers from hands to baskets; walk time drops to 21%. |
| Guarded failure | Optimisation as a spreadsheet game: no hidden genotype numbers, no flat tech percentages, decay as the master sink. |

**19.4 Explorer (explore and adventure; direct)**

| | |
|---|---|
| What they do | Possess a villager (§07, §13.5), designate areas to mine and go look, witness phenomena first-hand, map caves. Possession reaches what the AI will not: it can stand against the thornback (Steadfast) and enter unsupported spans or bad-air pockets at the player's risk (K7). |
| Progression | Atlas; Curiosities feeding discovery (R12, R27); reach (shoring, lights, provisions); the possessed villager's own skill growth and Chronicle lines. The +10% speed / +15% XP buff is a felt bonus, not the reason to possess. |
| Village without them | Autonomy band continues; the settlement never decides to explore. |
| Vignette | The player possesses Pip (dig 0.62) at the cave mouth, lights a torch and follows a green-stained seam. Pip stays steady when the roof groans (Steadfast); the player backs out before the span goes. The Chronicle notes "Pip found a green stone that sweated in the fire." |
| Guarded failure | Possession as the optimal way to work. Bot band: possessed output <=1.25x delegated for ordinary work; death while possessed is ordinary permadeath (R9). |

**19.5 Expedition leader (lead expeditions; delegated)**

| | |
|---|---|
| What they do | Send a selection out with an intent, provisions and the recall rule; read the report on return (rules in §13.4; one definition only). |
| Progression | Longer and deeper expeditions as provisions, lights, shoring and transport improve; leader traits colour risk; report quality follows the scouts' skill; the same Atlas and Curiosities as the explorer. |
| Village without them | As 19.4: home work continues; the Concerns panel mentions "Expedition 2 at half provisions" but never demands an answer. |
| Vignette | The player drags three villagers onto the copper stain in the north cliff, picks "find copper", keeps the default recall rule and tabs back to the kiln shed. About 2400 ticks [2 min at 1x] later the report arrives: ore located, one villager hurt, party returning. |
| Guarded failure | "Auto-combat must be competent" (a second product): combat is simple and lethal and the recall rule means delegated parties retreat; risk is chosen with the rule, not fought with micro. |

**19.6 Researcher (research and experiment)**

| | |
|---|---|
| What they do | No research screen. They place stations with the right heat/enclosure context, stock materials, mark "Investigate: X", read Curiosities and near-miss hints, follow the Almanac (§15). |
| Progression | Capabilities (one slot at a time, with alternates); Almanac completeness; era labels (R14); knowledge resilience (more holders, more evidence, R11). |
| Village without them | Villagers still tinker in free time (`tinker` is a leisure-class job), so discovery is slower but not impossible; each capability has >=2 routes per seed (R12). |
| Vignette | The Almanac lists a Curiosity: "Green stone, 'sweated' near the hearth, 2 sightings." The player builds a charcoal pit with a bellows and marks the green stone for Investigate. A game day later the Chronicle reads "Copper first smelted by Mossy (a first)." |
| Guarded failure | Brute force costs 3-5x the informed route; no free experiments (materials consumed, one per station per day). Soft-lock: validator plus rediscovery discount (R11). |

**19.7 Observer (observe the simulation)**

| | |
|---|---|
| What they do | Watch, follow a villager, read the Chronicle and inspector, run at up to 5x or pause, use Why on anything curious. |
| Progression | Chronicle depth; lineage threads emerging from genetics (R16); the Almanac fills in without input. |
| Village without them | Survives (R8 target: >=90% of seeds survive 2 real hours unattended; >=90% survive ten game years with no orders while <20% start a new building type). It stagnates at its starter shelters and the game says so neutrally ("The village has what it needs for now."). |
| Vignette | The player leaves the game at 5x while making dinner. Digest: "Year 3: a hard winter; two leaf beds lost; Tilly (Mossy's daughter) discovered that damp clay hardens by the hearth." |
| Guarded failure | Spectator-only being boring: environmental pacing (lightning fires, cave-in exposure, drought) happens without the player; at most one actionable notification per threat class; no "you did nothing" scoring. |

**19.8 Synergies and the "no dead specialisation" check**

| Pair | Synergy (a real mechanic, not a multiplier) |
|---|---|
| Explorer → Researcher | Curiosities from the wild enter the Almanac (R27) |
| Builder → Researcher | Stations and enclosure/heat context (R18/R12) |
| Manager → Expedition leader | Provisions via standing orders; crews = parties (R6) |
| Optimiser → Manager | Why-panel blockers locate bottlenecks |
| Researcher → Optimiser | New capability slots reopen the layout puzzle |
| Observer → everyone | Chronicle and lineage show which of the other six is worth doing next |

A playstyle must not be **hard-blocked** from progressing by not using the others. This is enforced by the Alternate implementations (R13), by delegated expeditions, and by the solvability validator. It is tested with **playstyle bots** in the harness (see §23 and docs/PROTOTYPE_PLAN.md): a *pure-builder bot* (no possession, no expeditions), a *pure-explorer bot* (no orders beyond starter shelters), and an *absent-player bot* each must reach the vertical-slice discovery on at least 60% of seeds within 2 game years (ASSUMPTION; the number is a floor for "not hard-blocked", not a target).

#### Accessibility

Accessibility is built into the architecture (the Command layer, the renderer split) rather than added late.

**Speed and pause (R1).**
- Speeds 1×-5× plus pause. **Pause-anything**: while paused the player can issue Orders, place Blueprint ghosts, edit Rooms, open the Why panel and the Almanac, change crews and possess or release a villager. The simulation only advances on ticks; orders issued while paused enter the command log tagged with the current tick.
- **Step** controls: advance one tick or 75 ticks [3.75 s at 1x] while paused (debug-grade but exposed: it is also an accessibility aid for players who need time to read).
- **Possession and speed** (DEFAULT, D11): while possessing, the game caps at 2× and defaults to 1×, because direct control above that is not playable. Pausing while possessed is allowed (no "possession time" exists).
- No alert pauses the game by default. Players can opt in to "pause on: death, discovery, expedition report", each off by default.
- No gameplay element requires reaction time; there are no timers, no minigames. Possession movement has a **click-to-move** alternative to held keys; **hold** actions can be set to **toggle**.

**Colour-blind-safe genetic display (slime colour is genetic).**

*Problem.* A villager's hue is inherited and drifts with diet (carried over from slime-village: HSV hue-space inheritance, colour "sport" hue jumps of 45-150 degrees, `belonging` from colour kinship, names drawn from the hue band). In a settlement of 6-60 villagers many are near-neighbours in hue. Any information carried by hue alone is invisible to a large minority of players (the common red-green types affect roughly 8% of men; ESTABLISHED figure).

*Rules.*
1. **Hue never carries information the player needs.** Genetics, lineage, kinship, "weak line", "gifted", job, mood and danger are always readable without hue: by name, by a **lineage mark**, by words and by shape.
2. **Lineage mark**: each founder line gets a distinct *pattern + shape glyph* (for example spots, stripes, cross, ring; ASSUMPTION: 8 patterns, repeated with a number for lines beyond 8), drawn as a small overlay on the sprite and as a badge on the inspector card, and kept across generations by inheritance of the *line*, not the hue. Siblings share it; mixed-line children show both (a half-and-half badge).
3. **Words for kin**: where slime-village shows `belonging` through colour, this game states it in text ("feels at home: 4 kin nearby, mixed colours") and in the Why panel.
4. **Optional "lineage palette" display mode**: replaces each villager's *rendered* hue with a colour-blind-safe set assigned per lineage (an established set such as Okabe-Ito). This is display only; the genetic hue remains in the sim and in the inspector, and the player can toggle it at any time. No gameplay rule reads displayed colour.
5. **UI colours** (status icons, job/stall icons, stock bars, alerts) always pair colour with shape or label (A's assumption, now a rule). Never red/green alone.
6. **Dev test**: a CVD simulation filter (protan, deutan, tritan, mono) is part of the screenshot/regression review. *Acceptance metric:* a tester using the filter sorts 12 villagers from 4 founder lines into the correct lines with ≥11/12 correct, using the marks, without colour.
7. **Contrast**: genetic hue is clamped so a villager's lightness never makes the sprite fall below a 3:1 contrast against the typical terrain it stands on (WCAG non-text contrast, ESTABLISHED); outlines are always drawn.

**Remappable keys.**
- All input goes through one `InputMapper` into view-independent **Commands** (see §23), so every binding is data. Every verb is reachable by **mouse only**, **keyboard only**, and **list/menu** (A: "all commands available through lists as well as the map").
- Full rebinding screen, conflict detection, chords, separate bindings for possession movement and for the building tools, saved profiles, a one-handed preset. Selection groups by number keys (ESTABLISHED in RTS conventions) are rebindable.
- Gamepad: not in MVP; the Command layer does not preclude it (post-MVP, ASSUMPTION).

**Readable text.**
- UI scale 100%-200% (ASSUMPTION range), independent of world zoom; minimum rendered size 14 px at 100%; body text contrast ≥4.5:1 and large text ≥3:1 (WCAG AA, ESTABLISHED); a dyslexia-friendly font option; no text baked into pixel art as the only carrier of information.
- Tooltips and the Why panel use plain sentences, not codes (see §22). Default view shows at most three notable facts per villager (D risk 3: cognitive load).
- **Reduced motion/feedback**: disables screen shake, hit-pause and flashes (the possession feedback set, which exists for feel and must not become a barrier).
- **Redundant audio/visual cues**: each sound cue has a visual cue and the reverse. Screen-reader support is **not** in MVP; it is a known gap (said plainly, not promised).

### Interactions
- **§06 loop and §07 control**: playstyles are emphases of the same verbs, so no extra input mode exists.
- **§09 autonomy and §22 UI**: the "without them" lines above are the autonomy band; the Why panel and Concerns panel are the tool every playstyle uses to learn what to do next.
- **§10 and §15**: Teach and the Almanac convert individual play into village capability.
- **§18 mortality**: permadeath is what gives the explorer and expedition leader their stakes; the observer's Chronicle is its record.
- **§21 art**: the lineage mark and lineage palette are art-direction requirements, not UI add-ons.

### Progression
Progression per playstyle is listed in the profile tables. Cross-cutting progression is **capabilities held** and the **Chronicle firsts**, which are labels derived from what the settlement can do (R14), never gates. No playstyle earns XP, currency or an unlock that others cannot.

### Failure states
| Failure | What the player sees | Intended result |
|---|---|---|
| Observer-only play | Village stable, no new building types | Stagnation, labelled neutrally; not a loss |
| Explorer gone for hours | Home crews and standing orders carry on; Concerns panel notes anything critical | No collapse; the autonomy target covers it |
| Builder never explores | Alternate implementations keep progress open | No hard block |
| Manager over-orders | Villagers' needs and the rested curve cap what orders can extract; idle leisure shrinks | Mechanically no better than delegating (over-ordering bot, K5) |
| Expedition member lost | Chronicle gravestone with skills and cause | Permadeath weight, no resurrection |
| Accessibility gap (screen reader) | Not supported in MVP | Documented, not hidden |

### Exploits & counters
| Exploit | Counter |
|---|---|
| Possession ping-pong to avoid needs | Needs and the rested curve stay per villager; no per-swap reset; no "afterglow" timer is used (a timer; dropped, per the tech review) |
| Possession as XP farm | Same XP formula as AI plus the +15% inspiration; challenge-matched XP; per-day "rested" diminishing curve (R17) |
| Over-ordering as optimal | Orders reserve work but do not freeze urgent adjacent jobs or critical needs (R5, K4); the over-ordering bot must stay within its band; no separate penalty meter (K5) |
| Idling at 5× to breed generations | Genetic costs, obsolescence and ±25% bound (R16); speed multiplies everything equally so there is nothing special about speed |
| Save-scumming permadeath | Allowed in single-player; an optional **autosave-only** mode (open decision, see §28) |

### MVP vs later
| MVP | Later |
|---|---|
| All seven playstyles supported by the *same* verbs; Why panel, Concerns panel, Chronicle, Almanac, Atlas/Curiosities | Steward (autonomously choosing from the blueprint library); Ledger auto-promotion suggestions (post-MVP QoL, R7) |
| Speeds 1×-5× + pause; pause-anything; remappable keys; UI scale; lineage mark; CVD-safe icons | Gamepad; screen-reader support; photosensitivity audit beyond the reduced-motion toggle |
| Playstyle bots in the harness (pure-builder and pure-explorer after C3; absent-player is a C1 bot) | Playstyle-specific long-run balancing across eras (needs more content first) |

---

## 20. Multiplayer & Planetary Exploration (Future)

> **Status: FUTURE. Not a prerequisite for the first planet (D4).** Nothing in §01-§19 or §21-§28 depends on this section existing. It records what must be **true in the core now** so these features are *possible later* without a rewrite (R23).

### Purpose
The author's agreed direction: multiplayer is **consensual visiting and co-op, not invasion**, and the end-of-progression fantasy is travelling to other planets "to see what other players have built". The first planet must stand alone as a complete game. This section fixes the order (visiting, then co-op, then space) and the cheap commitments now that keep each option alive.

### Player experience
1. **Visiting (first form): "Postcards".** A player publishes a read-only snapshot of their settlement. A visitor loads it as a place to look around: free-look camera, Chronicle, inspector, Almanac of what the world has learned, saved Blueprints the owner has marked shareable. Nothing the visitor does changes the owner's world.
2. **Consensual co-op (later).** Two or more players share one settlement with explicit invitation: each possesses different villagers, issues orders to shared Crews, and leaves at any time. No competition for the same job board; no player can harm another's settlement.
3. **Planets (expansion).** A second planet is another world seeded by the same worldgen, reached by a story-meaningful journey, populated by villagers carried with their names, lineage, skills and held Capabilities. Visiting another player's planet is a Postcard.

### Mechanics

**20.1 Multiplayer model (PROPOSED order; all later than MVP)**

| Stage | Model | What it needs |
|---|---|---|
| A. Snapshot visiting | Async, read-only; no live sync | A serialised, versioned snapshot (seed + deltas, villager records, chronicle, blueprints). Already required by save (§23). |
| B. Blueprint and record exchange | Optional copy of a shared Blueprint or a Chronicle page; consent flag per item | Blueprint validator (rejects malformed, self-enclosing or unsupplyable blueprints) |
| C. Consensual co-op | Live, invitation-only, shared settlement; each player has their own selection, camera, possession | Command log with tick-numbered inputs, state hash, and a decision between lockstep and server-authoritative (open decision OD-07 in docs/OPEN_DECISIONS.md) |
| D. Villager visits | A villager, by owner consent, travels to another settlement and returns (with new skills) | Stable global ids; records as plain data |

- **No invasion.** There is no rule, verb or system by which one player's villagers harm another's settlement or villagers. The only hostile things are fauna and the environment (PvE). This is a design constraint, not a moderation feature, and no later feature may weaken it without an explicit author decision.
- **Consent model**: a snapshot or co-op invite is an explicit act of the owner, revocable. Imported content is **untrusted data**: validated, size-capped and never executed.
- **Names and text** in shared data (villager names, blueprint names, Chronicle lines) are player content; moderation is a later product decision (OD-07 note).

**20.2 Space as an expansion built on the same systems**
- A planet is a **world seed + parameters**: biome table, materials (data), hazards (bad-air tag exists, R20; vacuum or toxic atmosphere is the same tag with a different rule), gravity-free (no gravity physics exists in the sim anyway).
- Villagers, genetics, skills, jobs, Rooms and Blueprints are unchanged. What a colony ship carries is **plain data**: villager records (name, genome, skills, lineage), Blueprints, the Capabilities the civilisation holds. This is why §23 requires versioned, plain-data records now.
- "Same individuals across the progression": the same entity-id scheme `(worldId, counter)` lets a villager exist in two worlds without ambiguity.
- Space-specific content (rockets, orbital mechanics, new materials) is **content**, estimated at 12-24+ FTE-months (D 7.3, ASSUMPTION) and is scheduled **after** the first planet is complete.

**20.3 What must be true in the core NOW (R23 checklist)**
Each item is cheap now, expensive to retrofit, and is also useful for single-player tooling. Each is a testable property:

| # | Requirement | Why it matters later | Test |
|---|---|---|---|
| 1 | **Command log**: every player input is a `Command{tick, playerId, type, payload}` validated by the sim; the UI never mutates sim state | Co-op, replay, bug reports | Replay of a recorded session reproduces the state hash |
| 2 | **Determinism**: fixed tick, named counter-based RNG streams, integer positions/timers, ordered iteration, no wall clock in sim | Lockstep or snapshot verification | Hash match every 100 ticks over 100k ticks (P4) |
| 3 | **State hash** every N ticks (debug builds) | Desync detection | Mismatch fails CI |
| 4 | **Strict sim/render split**, sim headless | Server-side sim; second renderer | Sim runs in a headless process with no render import |
| 5 | **Stable global ids** `(worldId, counter)` | Visiting villagers; imported blueprints | Two worlds' ids never collide in a merge test |
| 6 | **Plain-data, versioned records** for Blueprints, villager records, Chronicle entries | Snapshot, exchange, colony ship | Export → import round-trip equality |
| 7 | **No privileged local state**: selection, camera, possession and knowledge are per-player objects | Co-op | Two scripted players in one sim do not interfere |

Cross-machine bit-exact determinism (needed only for lockstep) is **not** promised: same-build, same-engine determinism is the commitment (R23); transcendental math is lint-restricted in the sim, not rewritten (C 2.10). If lockstep is chosen later, fixed-point and table-based trig become a project of their own (OD-07).

**Not now (explicit):** authoritative server, rollback, interest management, anti-cheat, accounts, matchmaking, any live networking.

### Interactions
- **§23 save and determinism**: the snapshot *is* the save format with a read-only flag.
- **§12 Blueprints**: blueprint sharing reuses the Blueprint data format and validator.
- **§18 Chronicle**: Postcards carry the Chronicle, which makes them a story artefact rather than only a map.
- **§15 and §16 species**: Dorfs or other species are an open decision (OD-08); the species-as-data-table rule (R15) keeps cross-world data compatible.

### Progression
No progression depends on multiplayer. A visitor earns nothing in the host's world; a visited world is unaffected. Planet travel's progression meaning is **scale and variety**, not power: more places to apply the same capabilities.

### Failure states
| Failure | Handling |
|---|---|
| Malformed or malicious shared data | Validator rejects; size caps; data never executed |
| Snapshot version mismatch | Migration chain, or a "chronicle export" fallback (§23) |
| Co-op desync | State hash flags it; resync from snapshot |
| Offensive names | Moderation decision deferred (OD-07) |

### Exploits & counters
| Exploit | Counter |
|---|---|
| Importing an externally bred "perfect" villager into a run | Villager visits return with skills but cannot import foreign genomes into the host's gene pool until a rule exists (OD-07); genetics bounded by ±25% anyway |
| Blueprint that cannot be built or encloses workers | Validator at import (same code as capture) |
| Griefing through shared jobs in co-op | No shared destructive verbs on another's villagers; each player's Commands are scoped |

### MVP vs later
| MVP | Later |
|---|---|
| The seven core properties above (a checklist, tests exist from C1) | Postcards (stage A), after the MVP; estimated 6-12+ FTE-months for the full visiting stack (D 7.3 ASSUMPTION) |
| Export of a plain-data snapshot as a by-product of save | Blueprint exchange; co-op; second planet |

---

## 21. Art Direction & Presentation

**Status: all PROPOSED** unless a line says carried over from slime-village. No art has been produced for this game.

### Purpose

Make the world legible at 100 villagers, make individuals recognisable, and make progress from leaves to metal visible without text.

### Player experience

A warm, hand-drawn 3/4 diorama. Slimes are readable at a glance by silhouette and colour; rooms read by materials and furniture; the era shows in the materials, tools and lighting of the settlement.

### Visual style (PROPOSED)

- **Pixel-art 3/4 sprites** on a z-sliced oblique view (R2). One pitch for all assets; no top-down orthographic set.
- **Chunky, low-resolution, high-contrast** shapes. Target sprite sizes (ASSUMPTION): tile 32x32 px logical; villager about 24x24 logical; tuned in P6, the 3/4 readability prototype.
- Soft outline shader; colour grading per season and per era.
- Four facings via three drawn plus a mirror (ASSUMPTION), since the camera does not rotate in MVP.

### Readable slime silhouettes

| Element | Purpose |
|---|---|
| **Blob body**, squash-and-stretch idle | Instantly readable "slime" shape at small size |
| **Body size** ~ mass | Age and fitness read at a glance (juveniles smaller) |
| **Core colour** (inherited hue) | Lineage, village identity |
| **Held item / tool overlay** | Work state at a glance (axe, pick, basket) |
| **Status icons** (hungry, tired, hurt, afraid) | Needs without opening a card |
| **Halo** | Possession |
| **Name tag / star** | Notable villagers (starred by the player) |

Rule: colour is identity, never the only carrier of information. Status and job use shape and icon as well so colour-blind players are served (see §19).

### How genetics show visually

Carried over from slime-village: colour is inherited in HSV hue-space, not RGB (RGB averaging measured to regress the island to grey by generation 9), with a bias toward one parent, a saturation floor and a rare 7% "sport" (a 45-150 degree hue jump). Diet pulls expressed colour toward what is eaten most. Names are drawn from the hue band. Colour kinship drives `belonging`, so a settlement has a colour identity.

New in this game (PROPOSED):

| Gene or trait | Visible cue |
|---|---|
| Hue (carried over) | Body colour; village palette |
| Strength / mass | Body size and squash |
| Speed | Idle bounce rate; trail |
| maxHealth (cold tolerance) | Thicker, glossier body (an environment-dependent trait, R16) |
| Longevity / age | Highlights fade; elders look paler and smaller |
| Mutation "sport" | A distinct hue shift or speckle that lineages carry |
| Skill-derived profession label | A small accessory (apron, goggle) once a top skill passes a threshold |

Genes move output by +/-25% (R16), so the visual cue should be *subtle*; the Inspect card carries the words (poor / below average / above average / exceptional), as `traitStanding()` does in slime-village.

### Era visual progression

Eras are labels derived from capabilities held (R14), so the look follows what the settlement *has*, not a global switch:

| Label (example) | Dominant materials | Silhouette |
|---|---|---|
| Hearth age | Leaves, grass, fibre, wood poles | Round, soft, organic; leaf beds, lean-tos, a fire ring |
| Hide age | Hides, cordage, poles | Cone and dome silhouettes; hide teepees, drying racks |
| Stone age | Knapped and cut stone, planks | Heavier walls, steps, doorways, stone paving |
| Clay age | Fired clay, thatch, timber | Rectilinear frames with warm earth tones; kilns |
| Timber age | Framed timber, brick, dressed stone | Taller frames, multi-storey silhouettes, roofs with eaves |
| Copper age | Copper fittings, brick | Cool-warm highlights; smoke; tool racks |
| Iron age | Iron, heavier machinery (rails later) | Industrial silhouettes; dense stockpiles |

Set dressing (props, paths, stockpile look) responds to stock levels so a thriving settlement looks it. Ruins retain their sprite set (R11 and pillar 8): the old camp remains visible after the settlement moves on.

### Environment and world

- Biome palettes distinct enough to read from the overview (MVP: meadow, forest, marsh, rock, highland, beach; jungle and tundra are later).
- Underground: dimmed level below, ore veins with a distinct glint, fog of knowledge (fog as villagers' sight; open design question on how much the player sees).
- Weather and seasons as a layer composited once (carried over as a perf pattern from slime-village).

### Audio direction (PROPOSED)

- Gentle, tactile, acoustic: wooden, ceramic, stone, with metal arriving late.
- Ambient bed per biome and time of day; seasonal weather.
- Diegetic cues for states: a pot lid for a finished meal, a pick-ring in the mine.
- Music evolves by era (solo instruments toward ensemble) and goes quiet during possession.
- Slime voices are short, non-verbal (barks like "I'm hungry" are pictograms plus a short chirp).
- Loss moments (a death) get a small cinematic and silence, not a jingle.
- No alert sirens; Concerns are visual and never require a response.

### Interactions

- **§19:** colour-blind-safe icons and scalable UI.
- **§08:** genes and colour inheritance.
- **§13/§15:** discoveries get visual signatures (soot glaze, scorched clay) so Curiosities are visible in the world.

### Failure states

| Failure | Mitigation |
|---|---|
| Sprites unreadable at 100 villagers | Zoom-dependent icon LOD; P6 (3/4 readability) |
| Colour overload | Hue is identity only; shape and icon carry state |
| Cutaway confusion | Roof fade; show-all-levels key |

### MVP vs later

| MVP | Later |
|---|---|
| One biome set, first four era looks (Hearth, Hide, Stone, Clay), core status icons, basic audio | Metal and industry, extra biomes, accessory per profession, ensemble music |

---

## 22. UX / UI Principles

### Purpose

Make an autonomous simulation trustworthy: the player must always be able to see what is happening, why it is not happening, and what they can do, without chores or pressure.

### Player experience

Calm, informational UI. No popups demanding response. No countdown, streak or reward banner. Everything the player might wonder ("why isn't there bread?") has an answer one click away.

### Principles

1. **Select, then verb.** Every verb is reachable by click, hotkey and context menu; every command is also reachable through lists, not only the map.
2. **Explain everything.** Every decision the board makes has an explanation class (critical need / player order / standing order / village demand / leisure). The UI shows it in words, not numbers.
3. **Advise, never nag.** Concerns are visible and passive; nothing pauses the game or requires a click.
4. **No chores, timers, streaks, energy.** There is nothing the player must do on a schedule. See "Forbidden patterns" below.
5. **Show traits as words**, ranges consistent with generation ranges (carried over from slime-village's `TRAIT_INFO` contract: the readout ranges equal the generation ranges).
6. **Progressive disclosure.** Small first-ten-minutes vocabulary (select, right-click a target); more appears with capability (see §06).
7. **Zoom to the individual** from any list, chronicle entry or overview marker.
8. **Plain text over icons-only** where a status needs explaining.

### The panels

| Panel | Contents | Notes |
|---|---|---|
| **Why panel** | For any villager, building, order or shortfall: the chain of reasons and the **blockers** (R5). "Why isn't there bread? No flour: no grain: farm plot unplanted." | Must be truthful; P10 |
| **Blockers** | Machine-readable reasons an order cannot proceed: no tool, no path, no material, no skill, reserved, unsafe... | Shown on the order and the crew chip; the panel's backbone |
| **Concerns strip** | Passive summaries: food runway, winter in N days, rough sleepers, idle or stalled crews | Never a modal; click opens the Why panel |
| **Stock bars** | Per-resource stock versus "keep N", with hysteresis marker | One-click flip from gather order to "keep N" |
| **Inspect (villager card)** | Name, colour/lineage, traits as words, skills with rank, current job and reason, family, history | Skills as named ranks with a progress hint, not exact numbers |
| **Room checklist** | Requirements for the assigned purpose: furniture, stations, space, light, temperature, with ticks and "missing" lines | Terraria-style; graded quality, not binary |
| **Almanac** | Known Crafts, who holds each, dead ends tried, evidence | Records tinker dead ends; never gives the recipe for unknown things |
| **Curiosities** | Observed-but-unexplained things, each with a near-miss hint that never names the product | Fed by exploration (R27) and witnessing (R12) |
| **Chronicle** | Time-ordered record: firsts, deaths, births, disasters, expeditions, era labels | A **chronicle digest** summarises what happened while away (R22) |
| **Notables** | Starred villagers, elders, newborns, best skills, injured | Counteracts attachment overload at 60 villagers |
| **Overlays** | Toggleable map layers: jobs, stock, temperature, room quality, hazard, fog of knowledge | Off by default |
| **Ghost queue** | Pending blueprint ghosts with material status | Player-driven expiry |

### Inspection

Click any villager, building, creature, plant or tile to get a card with the *why* of its state. Cards avoid raw numbers where a word suffices ("quick hands, easily bored"). Hover shows a one-line status. Click-through descends the chain: village, crew, villager, body.

### The Why panel (spec)

- **Trigger:** a "?" on every order, crew chip, villager card, building and stock bar.
- **Content:** the explanation class that won, the next-best alternative, and each rejection's blocker ("Pick: reserved by Oro").
- **Honesty:** the text is generated from the same data the board used. No separate narrative layer that could drift (R5).
- **Examples:**
  - "Mira is eating. A critical need outranks your dig order."
  - "Crew 2 stalled: no axe in reach (nearest: Oro's, 40 cells)."
  - "No bread: no flour. Grain: farm plot not planted."

### Almanac and Curiosities

- The **Almanac** lists Crafts the settlement knows, who holds each, how well, and dead ends (e.g., "wet clay in the open: no effect"). Knowledge is per-villager familiarity (R10), so the Almanac shows holders and warns when only one holder remains ("last holder: Pell, age 36").
- **Curiosities** collect observed-but-unexplained phenomena. Each has a near-miss hint that never names the product ("scorched clay is harder than raw clay"). The player decides who tinkers where; the Almanac records the outcome.
- No quest log, no checklist, no "% complete". The Almanac may be empty for hours.

### Chronicle digest

On return after time away, a one-screen digest lists notable events by season: births, deaths, discoveries, disasters, shortages, era label changes. Plain sentences, not rewards. No missed-reward screens. Entries link to people and places (zoom-down).

### Forbidden patterns

| Pattern | Why forbidden |
|---|---|
| Daily login rewards, streaks | Pillar 6, manipulative |
| Energy or stamina for the player | Pillar 6 |
| Countdown timers on player actions | Pillar 6 |
| Modal popups requiring a response | Advise, never nag |
| Hidden stat sheets or point allocation | Pillar 1 |
| Silent stalls | Mystery stalls are the top colony-sim complaint |
| Missed-reward screens on return | Anti-FOMO |

### Time controls

Pause, 1x-5x (R1). Pause-with-orders is allowed. Possession runs at 1x by default and at most 2x (DEFAULT, D11). The game runs while unfocused; there is no offline catch-up in MVP (R22).

### Accessibility cross-reference

Colour-blind-safe icons, scalable text, remappable keys, list-based command access and reduced-motion options are specified in §19. This section only sets the principles.

### Interactions

- **§09:** blockers and explanation classes are produced by the board.
- **§15:** Almanac and Curiosities are the only research UI.
- **§18:** chronicle, digest and Notables carry the stories.
- **§19:** accessibility hooks.

### Progression

UI vocabulary grows with capability: minute 1 select/right-click; after the first stockpile stock bars and standing orders; after the first built room the room checklist and blueprints; Almanac appears at the first Curiosity.

### Failure states

| Failure | Mitigation |
|---|---|
| UI scale at 4+ command scales | Progressive unlock; small first vocabulary |
| Stale or untruthful Why text | Generated from the board's data; P10 |
| Overload at 60 villagers | Notables, crew chips, idle pins |
| Over-ordering invisibility | Idle-leisure and fed-status readout on the selection |

### Exploits & counters

UI cannot be exploited directly, but over-surfacing information can hand out solutions: Curiosity hints never name the product, and Almanac dead ends only record what was tried.

### MVP vs later

| MVP | Later |
|---|---|
| Why panel with blockers, Concerns strip, stock bars, Inspect, room checklist, Almanac and Curiosities (one discovery chain), chronicle with digest, Notables | Overlays beyond the basics, family-tree view, memorial statues, Ledger auto-promotion, bounty orders |

### Example

> The player sees a Concerns chip: "Crew 2 stalled." Clicking opens the Why panel: *"Axe: none in reach. Nearest: Oro's, 40 cells, reserved for the kiln."* The player right-clicks the kiln job and drops it; the chip clears and the status line reads "Crew 2: chopping."

## 23. Technical Architecture Considerations

> **Status: considerations, not a chosen stack.** The engine is **not chosen** (R24); a throwaway-acceptable *provisional prototype stack* is recommended in 23.12 and does not decide the shipping engine (K9). Sources: C_simulation_tech.md, R3, R23, R24, R25, existing_material.md. Numbers are starting values (ASSUMPTION) validated by prototype P# (see docs/PROTOTYPE_PLAN.md).

> **Units & clock (K2). Every time constant in this document follows this box.**
>
> | Quantity | Value | Note |
> |---|---|---|
> | Tick | 20 per real second at 1x | fixed step; speed multiplies ticks per frame (23.7) |
> | Game (calendar) day | **12 000 ticks = 600 real seconds (10 min) at 1x** (S18b, D35; supersedes K2's 1800 ticks = 90 s). About 70% daylight (7 min), 30% night (3 min) | the length is one constant, `DAY` in `clock.js` |
> | Duration day (`DUR_DAY`) | 1800 ticks = 90 s: the unit every flat duration is written in | not the calendar day; "a 4-day regrowth" = 7200 ticks [6 min] |
> | Season | 25 game days = 300 000 ticks (about 4.2 real hours) | four seasons |
> | Game year | 100 game days = 1 200 000 ticks (about 16.7 real hours) | |
> | Life | **5 game years** = 500 days (about 83 real hours) | OD-04, S18b (was 4 years) |
>
> **S18b rule:** the calendar (day and night, season, year, the date) and **age** are the only things counted in calendar days. Every other duration and rate (crop growth, spoilage, fuel burn, illness, cooldowns, rust, grief, regrowth, healing, expedition time) is a flat tick count with the real-time feel it had on the old 1800-tick day. Hunger, thirst and energy are flat tick rates tuned to a 12 000-tick day (a ration about every 14 minutes at 1x). Game speed is a developer tool.
>
> **Rule:** short constants are written in **ticks with real seconds at 1x in brackets** (for example `commit for 600 ticks [30 s]`); long constants in game days or game years. "Game minutes" and "game seconds" are not used. Speed 5x makes every bracketed second one fifth as long on the wall clock.

### Purpose
Fix the shape of the software so that the design in §07-§18 is affordable: the simulation is the product, renderers are replaceable clients, and every player input and every AI decision takes the same path. The architecture is biased toward the **smallest world model that still lets a player build a roofed house and dig a mine** (C headline).

### Player experience
The architecture is invisible when it works, and is felt as: the village runs at 5× without stutter; a saved game resumes *exactly* where it was; "Why?" answers truthfully because the same data drives behaviour and explanation; a possessed villager obeys the same rules as the AI.

### Mechanics

**23.1 Layering and the sim/render split**

```
 Input (devices) -> InputMapper(view) -> Command{tick, player, type, payload}   (view-independent)
                                              |
                                          validate -> command log
                                              v
 SIM (headless, no DOM/engine imports) ------------------------------------------------+
   Job board  <- Orders / Standing orders / Village demand / Needs / Leisure            |
   Controller (AI | Player) -> Action -> ActionRunner -> world mutation, XP, events      |
   World: chunked 3D grid, entities, rooms, nav regions, phenomena, chronicle           |
   Event stream (CellChanged, Died, SkillUp, RoomChanged, JobBlocked, ...)              |
                                              v                                         |
 RenderModel (interpolated positions, dirty chunks, sprite states) -> Renderer(s)      |
 UI panels (Why, Almanac, Crews, Stock, Blueprint tool) read snapshots + events  <------+
```
- **Rule**: the sim never knows the camera. Picking resolves to cells and entities before leaving the view layer. Fog and knowledge are sim- or player-state-side, so no view sees more than another (the DQ XI dual-view lesson, kept for the future second renderer).
- **Anything render-only** (animation frame, particle) is derived from events and is never saved.
- **Sim is headless-capable**: it runs under CI with no engine, as slime-village's does (VERIFIED: headless run 161× real time, existing_material.md A1). This is the requirement that lets the engine decision come late.

**23.2 Action / Controller**
- A **Controller** decides *what* (`nextAction(world, actor)`): `AIController` pulls from the job board and needs; `PlayerController` converts WASD/click into Commands. An **Action** decides *how* and *how long*: `validate`, `durationTicks` (integer, from base time ÷ (skill × stat × tool)), `begin`, `step`, `end` (applies effect, releases reservations, awards XP).
- **Possession** (R9) turns the AI planner off for one actor; their input becomes 1-step `Move` or `Act` Actions in the same runner. No special physics path. Divine inspiration is a **Modifier** applied in `durationTicks` and the XP calculation (+10% action speed, +15% XP) and **Steadfast** is a fear-response flag, not a controller branch.
- **Code-review rule**: any difference in behaviour between AI and possessed actors other than the declared Modifier is a bug. Test: identical Action, identical state → identical tick count (P3).
- **Interrupts**: needs, threats and orders pre-empt by class; partial progress is stored on the target (cell hp, construction progress) so no work is lost.

**23.3 Job board (R5, R6, R7)**
- Classes, score, blockers, crews and standing orders are specified in §09; this section only fixes the architecture. The **Why panel** renders blockers from the same score pass, so explanation cannot diverge from behaviour (P10).
- Jobs carry `requires {skill?, tool?, carry?}`, `source`, `reservedBy`, `cellHint`. Reservations always expire and are re-validated each step (stuck reservations are the classic DF/RimWorld failure).
- Cost sanity (C 2.5): at the R4 design range (6-60 villagers, sim ceiling ~100) the board is ~10 job-picks/second, each over ≤200 candidates; cheap. The slime-village lesson applies: keep `findJob`-style scoring **separated by job kind**, not inlined (jobs.js 1794→2663 lines, VERIFIED).

**23.4 World: chunked grid (R3)**
- Data model: **3D integer cell grid with z-levels** (DF-like), chunks of 16×16×16 (4,096 cells), ~2 bytes per cell (`mat` u8, `flags` u8) in typed arrays, destructible. MVP map ≈ 128×128×24 = 393,216 cells ≈ 0.8 MB (128 chunks: 8×8×2, the z axis padded from 1.5 to 2); the full envelope considered in C (256×256×48 = 3.1M cells ≈ 6.3 MB) remains a post-MVP option. Rendered as **slices**, not voxels (R2/R3).
- Per-cell data that is rare is **sparse** (hp while mining, moisture, owner). A per-cell `virgin` bit marks terrain never placed by a player so that re-mining player blocks pays no XP (R17 / D rec 9; kept in the dig-delta list the save already needs).
- Walls, floors and roofs are cells; furniture, doors, plants, items are **entities** with occupied-cell lists, so Blueprints can capture them separately.
- Derived state is dirty-tracked per chunk (`dirtyNav`, `dirtyRoom`, `dirtyMesh`) and consumed once per tick. Static water as tags, **no flowing fluid** and no structural physics beyond cave-in spans (R20).
- The world representation is a **default, not finalised**: the evaluated alternatives (layered 2D, 3D z-level grid, side-view 2D, billboard 2.5D, full voxel) are in docs/TECHNICAL_RISKS.md §2. It is checked by a **<=1-week desk spike** (paper comparison) plus a **throwaway mining+room test in the default 3D grid only**; the layered-2D alternative is built only if that spike fails (P5, K1).

**23.5 Pathfinding: region graph + HPA\***
1. Nav graph from per-cell walkability + vertical links (stairs, ramps, ladders).
2. **Region graph** (RimWorld-style): connected components inside chunks; an O(1) reachability query via cached component id; this answers "unreachable" instantly, the cause of slime-village's pathing cliff (a code comment records A* at 43% of the sim at ~137 slimes; `maxNodes = 6000` cap, VERIFIED).
3. **HPA\*** over regions and portals, refining inside a region only while walking.
4. **Flow fields** (Dijkstra maps) only for many-to-one goals (stockpile, bed, flee).
5. Time-sliced path requests; agents walk stale paths until a reply; every step is re-validated.
- Budget (ASSUMPTION, P1): ≤6 ms/tick p95 for 100 agents including path work; no agent stuck >600 ticks [30 s]. C's 200-villager target is kept as **stress headroom**, not a requirement (R4 sets the design range at 6-60).

**23.6 LOD tiers**
| Tier | Scope | MVP |
|---|---|---|
| 0 Active | Player's settlement and a halo: full tick | **Yes, the only tier** |
| 1 Watched | Settlements with player orders, throttled (needs 1/4 rate, no rendering) | No |
| 2 Dormant | Aggregate tick at daily resolution; individuals keep name/skills/age | No; post-MVP, later multiple settlements |
- **R22**: the world simulates only while the game runs; **no offline catch-up in MVP**. Tier 2 appears when far settlements do. The calibration test (same save at Tier 0 and Tier 2 for 20 game days within ±15%, one-sided so dormant villages must not systematically out- or under-perform) is P14, scheduled but **not required for the slice**.
- Subsystems that touch all entities run staggered at fixed lower rates `(tick + id) % N == 0` (needs every 10th tick, plants/animals every 20th). Deterministic and spike-flattening (ESTABLISHED: RimWorld "tick rare").

**23.7 Determinism (R23)**
- **Fixed tick** (20 Hz game-time, ASSUMPTION); speed = ticks per frame, never a different step size. slime-village varies its step with speed (1/30, 1/15, 1/10 s, VERIFIED game.js:498), which breaks determinism across speeds; this must change before rules are ported.
- **Named, counter-based RNG streams**: `rng(worldSeed, "worldgen" | "genetics" | "weather" | "ai", actorId …)` hashed from (seed, stream, id, counter), so a new consumer cannot shift another stream's draws. mulberry32 remains the primitive (carried over). Render uses a separate, non-sim RNG.
- **Integers** for positions (cell + 1/256 sub-cell), timers, HP, XP (×1000). **Ordered iteration** in rule code (arrays by id; no object-key order). No `Date`, no `performance.now`, no unseeded `Math.random` in the sim (slime-village has zero `Math.random` in sim: keep).
- **Transcendental math** (sin/cos/exp/pow/log; 92 uses in slime-village sim, VERIFIED by grep) is **lint-restricted in the sim, not rewritten** (R23): allowed on same-build replay, banned from new rule paths unless wrapped.
- **Command log + state hash every 100 ticks** in debug builds. The log records possession input, so a possession session replays.
- Gate: P4 (replay twice and across a second build/OS; document where it diverges).

**23.8 Save = seed + sparse deltas + round-trip (carried over from slime-village)**
- **Carried over (VERIFIED in `S/save.js`)**: (1) terrain is regrown from the seed; only changes are stored, **exactly** (a byte-quantised version once drifted five plants in a day, per the code's own history); (2) references become ids and are relinked on load; (3) generic field copy with a **denylist** so new numeric fields save for free; transient job/path state is dropped and re-derived; (4) `save_roundtrip.js`-style test: step a restored game beside the original and require tick-for-tick equality (it found six real bugs in slime-village; ran and passed in the audit).
- **Changed for this game**: terrain is mutable and player-built, so deltas are **per-chunk** (RLE or cell lists), with **copy-on-write chunks** stored the first time a chunk is modified, which avoids dependence on a frozen generator (C 2.10; `worldgenVersion` is still stored). Estimated worst case ≤500 KB after RLE on a fully mined 128×128×24 world (P4 gate; ASSUMPTION). The `virgin` bit rides with the delta.
- **Versioning**: `SAVE_VERSION` + migration chain; slime-village refuses incompatible saves ("never half-loads"), which is not acceptable for a long-lived world, so a migration budget or a *chronicle export* fallback is planned.
- **Chronicle budget ≤1 MB**: keep all "firsts" and top-K events per year; compress old years to counts and names; per-villager ring buffer (30 entries, carried over); full records only for notable dead (D 2.8).
- Autosave on a fixed cadence with atomic write; with a command log, saves are snapshots + log tail (crash recovery and replay for free).

**23.9 Testing as design (R25)**
The **headless harness and exploit bots** are an MVP feature, extending slime-village's `headless.js`, `sweep.js` (judges outcomes and "complains in both directions": <45% survival too harsh, 100% too easy), `fixture.js` (frozen mid-game worlds) and `save_roundtrip.js`. **Slice bots (C1-C3, K1): absent-player, over-ordering, grind.** After C3 (MVP): breed-best, possess-swap, max-expansion and the playstyle bots (§19). Bots run on every build and fail it on a regression, with the pass bands stated in docs/PROTOTYPE_PLAN.md. Human tests are informal (3-5 testers per checkpoint); only auto-checkable properties (for example Why-panel truthfulness) are asserted by machine.

**23.10 Engine selection: criteria and candidates (no choice made)**

*Criteria* (each is a measurable question; they are applied after the C1 microbench, P4, the P5 desk spike, P6 and a UI spike, and the decision is due before C2 art work, K9):

| # | Criterion | How measured |
|---|---|---|
| E1 | Sim can run **headless in CI** | A 100-agent sim runs without the render stack |
| E2 | Sim performance at design range | C1 microbench (100 random walkers on the region graph, P1-lite) on target hardware (mid-2020 laptop); full P1 only on its trigger |
| E3 | Determinism controllability (integer math, RNG control, ordered iteration, no hidden engine randomness) | P4 replay hash |
| E4 | Chunked z-slice rendering with cutaway at 128×128×24 | P6 prototype at 60 FPS |
| E5 | 3/4 fixed-pitch sprite pipeline; depth sort; ghost/overlay support | P6 |
| E6 | **Dense-UI quality** (panels, lists, Why, Almanac, blueprint tool); UI is a large cost (3-6 FTE-months, D 7.3) | UI spike: build the Why panel and a crew list |
| E7 | Second-renderer feasibility on the same sim (later) | Sim/render boundary is clean |
| E8 | Author skill and iteration speed (hot reload, debug tools) | Time taken by the provisional-stack C1 build (23.12) |
| E9 | Distribution target (web / desktop / console) and install friction | Product decision |
| E10 | Licensing and platform-terms risk | Review at decision time |
| E11 | Data-table / modding friendliness (materials, buildings, phenomena as data) | Load-and-validate a data table |
| E12 | Save/IO (atomic writes, large local files) | P4 save test |

*Candidates* (tradeoffs only; from C 2.1, existing_material.md):

| Candidate | In favour | Against |
|---|---|---|
| Web (TypeScript/JS + Canvas2D/WebGL, e.g. PixiJS or Three.js; sim in a Worker) | Author's slime-village is JS; sim patterns/tests port most cheaply; zero install; headless under Node | Single-thread by default; GC pauses; float transcendentals not bit-identical across engines; weaker dense native UI and desktop distribution |
| Godot 4 (GDScript/C#) | Free; good 2D/3D; chunk/tilemap tooling; author has a 2021 Godot 3 start (Dorfs, 253 lines, nothing to reuse, existing_material.md A2) | GDScript perf for 100 agents + region pathing may need C#/GDExtension; headless-sim separation requires discipline |
| Unity (C#, optionally DOTS/ECS) | Mature ecosystem, strong tooling, ECS suits many agents | Licensing/terms risk; heavier for a small team |
| Rust (e.g. Bevy) or custom (C++/Rust + wgpu/SDL) | Best determinism and performance control | Largest development cost; not justified before prototypes |

No candidate is favoured in this document as the *shipping* engine. The language of the **sim** must run headless under CI; the engine is chosen after the C1 microbench, P4, the P5 desk spike, P6 and the UI spike, and before C2 art work. The provisional prototype stack below is a recommendation for getting C1 started, not that choice.

**23.12 Provisional prototype stack (RECOMMENDATION; author to confirm; K9)**
- Write the **C1 headless sim core in TypeScript**, reusing slime-village's harness, save round-trip and sweep patterns (23.8, 23.9, 23.11), with a **minimal canvas debug renderer** (coloured cells, dots for villagers, text overlays; no sprite pipeline).
- This is explicitly **throwaway-acceptable**: because the sim is headless and has no engine imports (23.1), it can be ported or rewritten once the engine is chosen. The reuse numbers in 23.11 (1-2 vs 4-6 FTE-months) favour TS, which is why it is suggested, but **this does not decide the shipping engine**; E1-E12 stay the criteria and the decision is due **before C2 art work** (OD-06, OD-41).
- Not part of the recommendation: any renderer beyond the debug view, any UI toolkit choice, any asset pipeline.

**23.11 Reuse of slime-village (verified per existing_material.md)**
A summary; the full table with verification and "not reusable" items is in docs/TECHNICAL_RISKS.md §3.
- **Reuse as code if the engine is JS/TS**, otherwise as a *specification*: `settle()` and `breed()` (util.js:59, slime.js; VERIFIED by reading); mulberry32 as the stream primitive; `temper()` per-villager hashed lean; leisure maths (not `strain`, K5); season/warmth curve; plant/animal life cycles.
- **Reuse as pattern and tests**: headless, sweep, fixture and save-roundtrip harnesses (VERIFIED by running `headless.js` and `save_roundtrip.js` in the audit); seed + sparse-delta save with denylist; demand-vector + claims + explanation ("every job can be explained by two numbers").
- **Not reusable**: `findJob` monolith, `ai.js` state machine, 2D immutable-terrain `world.js`, A* `findPath`, renderer/UI, prefab buildings, step size varying with speed.
- **Caveat**: its working tree was dirty at audit (33 modified files, last commit `d9bceff`); snapshot a commit before porting. README and code disagree in places; code is truth.

### Interactions
Everything above exists to serve: possession and autonomy sharing one pipeline (§07/§09), freeform building and Blueprints (§12), mining and exploration (§13), discovery's heat/enclosure contexts (§15), the harness's exploit bots (§19, §28), and multiplayer readiness (§20).

### Progression
Architecture "progresses" by prototype gates: each checkpoint (§26) has a tech exit criterion tied to a P# in docs/PROTOTYPE_PLAN.md.

### Failure states
| Failure | Signal | Fallback |
|---|---|---|
| Pathfinding cliff | P1 over budget at 100 agents | Time-slice harder; cut room cap; smaller map |
| Determinism erosion | P4 hash mismatch in CI | Lint bans; fix the offending API; bisect with the command log |
| 3D grid too costly | P5 desk spike or the throwaway mining+room test shows the default grid cannot express a slice scenario or costs >2x the paper estimate | Only then build the layered-2D alternative (R3 default is a default, not a commitment; K1) |
| Slice unreadable | P6 testers confuse levels | Stronger cutaway rules; fall back to top-down |
| Reuse trap | Ported code drags coupling | Treat slime-village as a spec; port only `settle`/breed/tests |

### Exploits & counters
Technical exploits are covered by the harness bots (§23.9). Architectural exploit: **render-side information leaks** (a view that shows more) are prevented by fog/knowledge living in the sim.

### MVP vs later
| MVP | Later |
|---|---|
| Headless sim, fixed tick, named RNG, command log, event stream, state hash; chunked grid ~128×128×24; region-graph pathing; Tier 0 only; seed + chunk-delta save with round-trip test; harness with exploit bots (3 in the slice, the rest in MVP) | Second renderer (not scheduled; trigger in OD-03); Tier 1-2 LOD; fixed-point/cross-machine determinism; flowing fluids and structural physics; save migrations; netcode |

---

## 24. MVP Definition

The full document is **docs/MVP_SCOPE.md** (features by tier, line-item effort, checkpoints). Summary.

**Terms (K1).** A **checkpoint** is a build someone can play: **C1 "Leaves & Sticks"**, **C2 "First Hut"**, **C3 "Clay & Copper"**. **C3 is the vertical slice.** The **MVP** is the first complete, publicly playable first planet: **the slice plus the Essential tier** (below). The full first planet is larger still (R26).

**The MVP is the smallest build that is one cohesive game**: a small procedural map, slimes only, 6-60 designed villager range (6-8 in the slice), inherited traits and three skills with XP from real output, gathering and a survival economy, freeform construction with hybrid Rooms and one functional Purpose, saved Blueprints with "stamp x N" and blueprint revision, mining and exploration with area designation, the MVP hazard set (cold, cave-in, bad air, one wounding fauna), optional possession, Almanac/Curiosities/Chronicle, the Why panel, and one emergent discovery chain with a per-seed solvability validator, plus the 12-discovery content set. The headless harness and exploit bots are part of it (R25).

| Tier | Contents (see MVP_SCOPE.md for the full list) |
|---|---|
| Essential to identity | Needs + survival economy + genetics + skills; orders (select, right-click) with optional crews, standing orders, and the job board with Blockers; possession on the same Action pipeline; freeform Rooms, Blueprints and blueprint revision; destructible exploration; the 12-discovery set; Chronicle; permadeath; harness |
| Important but deferrable | Teach UI beyond learn-by-proximity; alternates on capability slots; extra Room Purposes; inheritance extras (inbreeding depression, hidden genotype); rust; second hazard family; relationship tiers beyond family + friend/rival; grief, graves, heirlooms, notables |
| Experimental | Second renderer; collective belief; offline catch-up; Steward; Ledger auto-promotion |
| Future expansion | Tier 1-2 LOD; wagons/carts/rail beyond the first transport tiers; species #2; Postcards; space |
| Out of scope (RESOLUTION cuts) | Drones, belts, death-farming/mana-for-deletion, XP from re-mining placed blocks, first-person, multiple species, documents/libraries, culture as a system, priority matrix, full combat, structural physics beyond cave-in spans |

**Effort (ASSUMPTION; honest re-baseline, K1; one FTE-month is about 160 productive hours; a solo/duo hobbyist is 0.4-0.6 FTE).** The earlier 7-12 FTE-month "MVP" band was the slice's budget, and D's own line items sum to about 25-54 FTE-months for the whole design. The playable path is:

| Build | Adds | Cumulative | Calendar at 0.5 FTE |
|---|---|---|---|
| C1 Leaves & Sticks | 2-3 | 2-3 | 4-6 months |
| C2 First Hut | 2-3 | 4-6 | 8-12 months |
| C3 Clay & Copper (the slice) | 3-5 | 7-11 | 15-22 months |
| MVP (slice + Essential tier) | 13-29 | about 21-40 | 3.5-6.5 years |
| Full first planet (R26) | | 30-60 | 5-10 years |

The MVP range is computed line by line in MVP_SCOPE §3. It is wide on purpose; the way to narrow it is to finish C1 and measure.

---

## 25. Vertical Slice Design

The slice is **C3 "Clay & Copper"**: the MVP shrunk to a demonstration, reached in three playable steps (§26). The full prototype plan and acceptance criteria are in **docs/PROTOTYPE_PLAN.md**; the named content is in Appendix B.

One small map (about 128x128x24, R3), one biome plus caves, slimes, 6-8 starting villagers (K3), inherited traits + 3 skills (dig, build, craft), gathering + survival economy, freeform construction, one functional Purpose (workshop), saved blueprints, mining and exploration, cold plus one wounding fauna (the thornback), minimal possession, and one emergent discovery chain: **fire -> fired clay -> charcoal -> copper**. **No other eras are attempted.**

**The start state (K3; specified in §09 and §11).** 6-8 adults of mixed age from 2-3 founder lineages, leaf beds only; known at the start: foraging, gathering sticks/stones/grass, carrying by hand, knapping stone; fire is not known (the first discovery, from witnessing a lightning or stump fire); 3 game days of food in hand.

**The seven properties the slice MUST demonstrate** (initial_prompt.txt Phase 4), each with its acceptance metric. All are measured headless over 20 seeds unless a human test is named; time is game days (1 game day = 1800 ticks = 90 s, Units & clock in §23). Each is first measurable at the checkpoint shown.

| # | Property (first measured at) | Acceptance metric (summary; full text in PROTOTYPE_PLAN.md §3) |
|---|---|---|
| 1 | The village can function without constant intervention (C1) | With zero commands, >=90% of seeds survive 2 real hours at 1x (about 0.8 game year, includes a cold season) and >=90% survive 10 game years at fast-forward; <20% start a new building type |
| 2 | The player can meaningfully influence inhabitants (C1) | Assigning 3 of 6 villagers to dig raises dig output >=2x baseline within 2 game days; "keep 30 stone" holds within +-20% by day 5; a Why panel never contradicts sim state (auto-checked) and 3-5 testers name the true cause of most staged stalls |
| 3 | Inhabitants develop through actual activities (C3) | After work equal to 15% of adult lifespan in one skill, effect is >=25% above a control; grind bot earns <5% of baseline XP; in a 6-villager colony after 1 game year the top holder per craft is >=0.25 above the median (K6) |
| 4 | Construction supports creativity and automation (C2) | A player-built workshop is recognised <=1 s after the last piece; a saved Blueprint stamped x3 is built by autonomous builders at >=90% fidelity within 3 game days given materials, with zero self-walled workers in 100 stamps; testers build distinct qualifying layouts |
| 5 | Exploration produces meaningful discoveries (C3) | A delegated expedition finds a non-surface resource within 2 game days on >=80% of seeds and records >=1 Curiosity; delegated villagers flee the thornback and still reach the target on >=70% of runs |
| 6 | Technological advancement changes available capabilities (C3) | The discovery occurs by 1.0 game year under the competent bot on >=80% of seeds and <10% under the brute-force bot at 2x materials before 0.5 year; stuck rate <2%; after discovery >=1 new job kind appears, with no flat percentage bonus |
| 7 | Direct and autonomous control share the same simulation (C2, extended in C3) | Identical Action tick counts for identical state (a CI test from C2); possessed output 1.0-1.25x delegated for ordinary work; a possession session replays to identical state hashes every 100 ticks for 100k ticks; a possessed villager can stand against the thornback and enter a cell the AI refuses (K7) |

Slice ordering follows the checkpoints (§26): the harness and determinism come first, then the survival loop, so property 1 can be measured before any content is added.

---

## 26. Development Milestones

The milestones are the three playable checkpoints of §24. Effort ranges are **ASSUMPTION**, at placeholder-grade art, relative sizes rather than promises. **Process diet (K1):** at most six prototypes gate a checkpoint decision before C3 (P4, P9, P5, P6, P2, P11); every other prototype is deferred with a named trigger in docs/PROTOTYPE_PLAN.md §4. Slice bots are **absent-player, over-ordering and grind** only; breed-best and possess-swap come after C3. Human tests are informal, 3-5 testers per checkpoint, each with one question: **would they keep playing for another half hour?**

```
C1 Leaves & Sticks  ->  C2 First Hut  ->  C3 Clay & Copper (= vertical slice)  ->  MVP Essential tier
```

| C | Name | Builds | Gating prototypes | Exit criteria (all must hold) | FTE-mo |
|---|---|---|---|---|---|
| **C1** | Leaves & Sticks | Headless sim shell on the provisional stack (23.12); fixed 20 Hz tick, named RNG streams, command log, state hash, seed + delta save skeleton, sweep/fixture/save-roundtrip harness; 128x128x24 chunked grid (surface play first), worldgen, region-graph pathing, minimal canvas debug renderer; 6-8 villagers from 2-3 lineages, needs, aging/death, Action/Controller, job board with classes (critical need, order, standing, demand, leisure), orders by select + right-click, Blockers + Why panel; survival economy (forage, demand vector, 3-day starting stock, seasonal deficit) and cold as the one hazard; leaf beds | **P4** determinism + save; **P9** thrash + unattended survival (includes the P10 auto-check) | Replay of 100k ticks gives identical hashes; save -> restore -> continue matches tick for tick; idle bot meets Property 1 on the grey-box; a stamp-x10-style build order during a food dip leaves food workers on food and starves no one (K4); absent-player, over-ordering and grind bots inside bands; **fun check: 3-5 testers watch and order for 30 minutes and can say why anyone is hungry or cold** | 2-3 |
| **C2** | First Hut | Freeform building tools, construction sites, hauling for blueprints (standing class, K4), supports-first order; hybrid Room detection and one Purpose (workshop) with heat/enclosure context; Blueprint capture/rotate/ghost/stamp x N; **minimal possession (K7): move, interact, the same Actions as AI** on the existing Action/Controller; first sprite pass after the engine decision | **P5** world model (<=1-week desk spike plus a throwaway mining+room test in the default 3D grid only); **P6** readability (no second-renderer stub); **P2** rooms + heat (30 hand-built kiln builds; blueprint self-walling checks folded in) | Workshop recognised <=1 s, <=1 ms p99; heat level matches hand-computed in >=28/30 builds; stamped x3 built at >=90% fidelity, no self-walled worker in 100 stamps; same-Action tick equality for AI and possessed in CI; a new tester places a door unaided within 60 s; **fun check: 3-5 testers build a hut and stamp three more, and want to continue** | 2-3 |
| **C3** | Clay & Copper (slice) | Skills (dig, build, craft; challenge-matched XP; skillFit and preferred craft, K6), genetics (9 traits, `breed` + `settle`, convex upkeep, clone limit); discovery system (phenomena, witness, tinker, Almanac, Curiosities, near-miss hints, validator, trace log, rediscovery) with the chain fire -> clay -> charcoal -> copper and >=2 routes; area mining, one expedition type with recall, the thornback; possession combat polish (Steadfast, restricted-cell access) | **P11** discovery chain; the heat-function table test (one route, no renderer) comes first | Properties 3, 5, 6, 7 pass; stuck rate <2% over 20 seeds x 50 game years; top-skill-holder bot check (K6); all seven properties demonstrated in one recorded 2-hour session on a fresh seed; **fun check: 3-5 testers explain why a craft is unavailable and choose to possess a second time** | 3-5 |

Sum: **7-11 FTE-months** for the slice (ASSUMPTION), about 15-22 calendar months at 0.5 FTE. Ranges include rolling playtest inside each checkpoint but **not** polished art/audio (OD-15).

**After C3: the MVP Essential tier** (docs/MVP_SCOPE.md §3 has the line items): the remaining eight discoveries of the 12-set; farming, husbandry and preservation depth; orders at 20-60 villagers, transport tiers and blueprint revision; cave-in, bad air, light and possession polish; more biomes; UI completion and accessibility; art/audio to a publicly playable standard; the rest of the bots (breed-best, possess-swap, max-expansion, playstyle bots) and save migration. About **13-29 FTE-months**, so the MVP is about **21-40**.

**Gates.** The engine decision (OD-06) is taken after the C1 microbench, P4, the P5 desk spike, P6 and a UI spike, and **before C2 art work**. The layered-2D alternative is built only if the P5 spike fails. Deferred prototypes (P1 full, P8, P12, P13 remainder, P14, P15, P16) run on their triggers (PROTOTYPE_PLAN §4).

---

## 27. Scope and Risk Register

The full register (ids, likelihood, impact, early signal, mitigation, smallest validating prototype P#) and the world-representation evaluation are in **docs/TECHNICAL_RISKS.md**. Top risks:

| Rank | Risk | L | I | Early signal | Mitigation (one line) | Proto |
|---|---|---|---|---|---|---|
| 1 | **Scope and process weight** (TR-22, TR-33): the line items sum to about 25-54 FTE-months; the slice alone is 7-11, the MVP 21-40; the validation apparatus can exceed the game | H | H | A checkpoint takes >1.5x its range; prototypes run that gate nothing | Three playable checkpoints with a fun check each; <=6 gating prototypes; informal human tests; slice cut list; each new feature pays for itself with a bot test | all |
| 2 | **Emergent discovery is a silent three-part system** (TR-15) (context, knowledge, capability) over an authored graph; no comparable game has shipped it well | M-H | H | Chain stuck in >2% of seeds; testers cannot say why a craft is unavailable | Single-layer knowledge; the copper chain first as a headless table test with one route; computable heat function (§11.9); validator; Almanac + trace log | P11 |
| 3 | **Possession has to be worth choosing without being optimal** (TR-02): the real floor is 3.5-6.5 FTE-months in total | M | H | Testers do not possess a second time, or possession is mandatory | Minimal possession in C2; Steadfast against the thornback and access to restricted cells (K7); bot band; deferred feel prototype P8 | P8 (deferred), P3 as CI test |
| 4 | **Pathfinding / perf cliff** (TR-04) in a 3D grid | M | H | p95 tick over 6 ms at 100 agents | Region graph + HPA*; staggering; C1 microbench; full P1 on trigger | P1-lite |
| 5 | **Freeform building UX and room recognition** (TR-05, TR-13; ghosts, rotation, undo, validation, self-enclosure) | H | M-H | Testers fight the tool; heat context disagrees with intuition | Hybrid Rooms with checklist; supports-first; exit reserved until last cell; spans advisory for buildings | P2 |
| 6 | **Slice readability** (TR-08) of z-slice 3/4 oblique | M | H | Testers confuse floor/roof/levels | Cutaway rules; ghost of level above; fall back to top-down | P6 |
| 7 | **Determinism erosion** (TR-06) | M-H | M | CI hash mismatch | Lint, named streams, command log | P4 |
| 8 | **Autonomy band wrong** (TR-11): stagnation, helplessness, or a starving village that is told to build | M | H | Unattended survival <90% or >20% self-start new types | Village-critical needs at need class (K4); demand vector; sweep | P9 |
| 9 | **Genetics and skills feel arbitrary or exploitable** (TR-18, TR-19) | M | M | Breed-best bot >1.15x; no masters emerge | Convex upkeep; skillFit and preferred craft (K6); stories over numbers | P13 (remainder deferred) |
| 10 | **Reuse trap** (TR-24) and slime-village drift; **engine regret** (TR-29) | M | M | Ported code drags coupling; engine chosen on taste | Treat as spec; provisional stack is throwaway-acceptable (K9) | none |

**Scope killers in order** (D 7.4): full 3D voxels + first-person + billboards; multiple species/paths/cultures at full fidelity; hand-authored emergent tech at scale; freeform building UX; combat/possession polish; space/multiplayer; balance without bots. Each is cut or gated by an R# ruling.

---

## 28. Unresolved Design Questions

The full list (question, options, default, what evidence would change it, owner, blocking checkpoint) is **docs/OPEN_DECISIONS.md**. Summary of the most consequential:

| Id | Question | Recommended default | Owner | Blocks |
|---|---|---|---|---|
| OD-01 | Collective belief (Ork-style): ship, cut, or keep as a hook | Experimental, deferred; rules kept | Author | none (post-MVP) |
| OD-02 | Offline progression (R22) | No offline catch-up in MVP; chronicle digest | Director | MVP polish (digest copy) |
| OD-03 | Camera: second view (first-person, billboard) | One 3/4 camera; second renderer post-MVP | Author | C2 |
| OD-04 | Lifespan anchor and clock (R1, K2, S18b) | 20 ticks/s; 12000 ticks/day (10 min); 5 game years per life | Director | C1 |
| OD-05 | World representation (R3) | 3D z-level grid; desk spike + throwaway test only (K1) | Director | C2 |
| OD-06 | Engine | Not chosen; criteria E1-E12; due before C2 art | Director | C2 art |
| OD-07 | Multiplayer model | Snapshot visiting first | Author | post-MVP |
| OD-08 | Dorfs / species #2 | Slimes only for the first planet | Author | none |
| OD-09 | Drones as late sci-fi (author vs octoshrimpy) | No (D3) | Author | none |
| OD-10 | Steward | Post-MVP option | Director | none |
| OD-11 | Game title | Working title "Slime / Dorf Village" | Author | marketing only |
| OD-12 | Save-scum / ironman | Allow reload; ironman flag after C3 | Author | MVP |
| OD-13 | Possession buff, speed cap and purpose (K7) | +10% speed/+15% XP as a felt bonus; Steadfast and restricted-cell access are the point; 2x cap | Director | C2/C3 |
| OD-14 | Map size / population ceiling | 128x128x24; 6-60 design, ~100 ceiling | Director | C1 |
| OD-41 | **Provisional prototype stack** (K9): TypeScript headless core + canvas debug renderer, throwaway-acceptable | Recommended; author to confirm | Author | C1 start |
| OD-42 | Strain: cut (K5) | Cut; needs + rested curve; reopen only if the over-ordering bot fails | Director | none (closed) |
| OD-43 | Blueprint revision scope (K10): what a pushed revision may change and how villagers reconcile | Manual "push revision"; rebuild only the differences; no tech gate | Author | MVP (not the slice) |
| OD-44 | Possession niche parameters (K7): fear threshold, which cells the AI refuses, thornback difficulty | Fear threshold and refusal list as data rows; tuned in C3 | Director | C3 |
| OD-45 | Start-state and survival-economy numbers (K3), including whether sun-drying on a stick rack is known at the start | The ASSUMPTION values in §11.16-§11.17; sun-drying known | Director | C1 |

Twenty-six further decisions (OD-15 to OD-40: hidden genotype, clone limit, mate choice, skill constants, knowledge depth, per-seed perturbation, hostile design, determinism level, save migration, tick rate (closed by K2), lighting, combat depth, art fidelity, accessibility scope and others) are in the full document with defaults.

---

## Appendix A. Decision references

One line per reference cited anywhere in this document or in docs/. Source-report citations of the form "D 7.3", "C 2.10", "tech review item N" point to notes/phase1/D_balance_feasibility.md, C_simulation_tech.md and the phase-2 tech review; they are background and are not needed to build.

**Phase-2 rulings (notes/phase2/RESOLUTION.md)**
- **R1** Pacing: a life is about 10 real hours at 1x (tunable 8-12); a game year is a quarter of a life; every rate derives from this anchor.
- **R2** Camera: one fixed-pitch 3/4 oblique view onto a z-sliced world; first-person, billboard, dual-view and side-view are post-MVP.
- **R3** World representation: 3D integer cell grid with z-levels, chunked 16^3, destructible, rendered as slices; MVP map about 128x128x24 (a default, not final).
- **R4** Population: 6-60 named villagers per settlement, sim ceiling about 100; larger operations are crews and standing orders.
- **R5** Job board: one board, one score; classes critical need > player order > standing order > village demand > personal leisure; every rejection emits a Blocker.
- **R6** Crews: a named selection with a default task and a stall summary; an expedition party is the same object.
- **R7** Standing orders: "keep N of X" with a hysteresis band (refill below about 80%, stop at 100%).
- **R8** Autonomy band: villagers eat, sleep, haul, repair, replant, fetch firewood, heal, flee and build starter shelters and auto-build blueprints unasked; new functional kinds come only from the player.
- **R9** Possession: same Action/Controller pipeline as AI; Divine inspiration (+10% speed, +15% XP) and Steadfast; no timer; released only on collapse.
- **R10** Knowledge: single layer, per-craft familiarity and skill XP; a capability is a living knower; spreads by watching (slow) and Teach (fast).
- **R11** Knowledge loss: losing the last holder makes a craft unavailable but never permanently; evidence makes rediscovery cheap.
- **R12** Discovery: data-defined phenomena fire when properties meet a context; found by witnessing and tinkering; solvability validator and systemic events prevent soft-locks.
- **R13** Tech paths: one path on the first planet with alternate implementations per capability slot; collective belief is deferred.
- **R14** Eras: labels derived from capabilities held, shown in the chronicle, never gates.
- **R15** Species: slimes only; species is a data table.
- **R16** Genetics: keep `settle()` and mixture inheritance; add convex upkeep, environment-dependent value and a clone limit; genes move output +-25%.
- **R17** Skills: XP from real output, challenge-matched, zero XP re-mining placed blocks, "rested" curve; skills gate quality and speed, never the ability to attempt.
- **R18** Rooms: flood-fill detects rooms, the player assigns a Purpose, a checklist grades quality (graded, not binary).
- **R19** Blueprints: capture a region as cells + furniture with material classes and rotation; ghost; "stamp x N"; supports first; partial builds are valid.
- **R20** Hazards: cold, cave-in, bad air and one wounding fauna in the MVP; full combat deferred.
- **R21** Logistics: hauling is baseline; the lever is the transport tier (hand, basket, backpack, wagon, cart, rail); no belts, no drones.
- **R22** Time away: no offline catch-up in the MVP; a chronicle digest on return.
- **R23** Determinism: fixed tick, named counter-based RNG, integer positions and timers, command log, state hash; same-build commitment.
- **R24** Engine: not chosen; criteria and candidates only.
- **R25** Testing as design: the headless harness and exploit bots are an MVP feature.
- **R26** Scope estimate: an ASSUMPTION; superseded for the slice and MVP by K1 and MVP_SCOPE.
- **R27** Exploration feeds discovery (Curiosities); mining uses area designation, never per-block clicking.

**Decision log (notes/DECISION_LOG.md)**
- **D1** All former "Codex" roles run on Claude Sonnet subagents (process note).
- **D2** The slime-village project is primary prior art; its established decisions are preserved unless the brief contradicts them.
- **D3** No conveyor belts or drone labour; transport ladder hand, box, backpack, wagon, animal cart, rail (author's direction).
- **D4** The first planet is the complete game; space is an expansion.
- **D5** slime-village has no skills, commands, possession, mutable terrain or prefab-free building; those are designed fresh.
- **D6** The phase-2 rulings R1-R27 are the canon.
- **D7** Organising rule: "Autonomy maintains; the player advances."
- **D8** Drafter defaults accepted: class bases (need 400, order 300, standing 200, demand 100, leisure 0; village-level critical need 350+50u and derived jobs at standing class added by K4), commitment and rescue constants, sports at 4%, relationship caps, discoverer familiarity 0.5, witness threshold 0.2, rediscovery about 20% cost.
- **D9** Drafter defaults accepted: fixed camera yaw, possession follow distance, game year about 2.5 h, command scales unlocking by capability.
- **D10** Drafter defaults accepted: heat levels 0-5, strata bands, validator with 2 routes, systemic events, one wounding fauna "thornback".
- **D11** Time mapping: 100 game days per game year, about 2.5 real hours; life about 4 game years; possession capped at 2x speed (clock restated by K2).
- **D12** Culture in the MVP is chronicle tallies and leaning labels only.
- **D13** Skill pacing: steady work in one craft reaches skill 0.7 in about 30% of adult life.
- **D14** Discovery cost: system 1-1.5 FTE-months; twelve linked discoveries 10-15 FTE-weeks; full first planet 4-8 FTE-months.
- **D15** Terms: vertical slice, MVP and full first planet are distinct (the slice is now C3; K1).
- **D16** The slice starts with 6-8 villagers; rediscovery costs about 20% of the original (pass gate 0.4x).
- **D17** Phase-6 rulings K1-K11.

**Phase-6 critique items (notes/phase6/critique.md; cited as CR#, never bare R#)**
- **CR1-CR23** The critique's revision list: CR1-CR10 MUST (time units, survival economy, start state, board classes, strain, specialisation, checkpoints, cut list, provisional stack, possession), CR11-CR19 SHOULD (heat function, tinker class, honest graph wording, advisory spans, one knowledge scalar, simple crews, process diet, era/shelter axis, content tables), CR20, CR22, CR23, CR25 COULD. Applied as ruled by K1-K11.

**Phase-6 rulings (notes/phase6/RULINGS.md; D17)**
- **K1** Effort re-baselined; playable checkpoints C1 Leaves & Sticks, C2 First Hut, C3 Clay & Copper (= slice); MVP = slice + Essential tier; at most six gating prototypes before C3; slice bots absent-player, over-ordering, grind; informal 3-5 tester checks; one world model, built once.
- **K2** Clock: 20 ticks per second at 1x; 1 game day = 90 s = 1800 ticks; short constants in ticks with real seconds in brackets.
- **K3** Start state (6-8 villagers, leaf beds, fire unknown, 3 days of food), survival economy and demand vector.
- **K4** Village-level critical needs score at need class; jobs derived from an order run at standing class; only the directly ordered action is order class.
- **K5** Strain is cut; needs and the rested curve do its job.
- **K6** Specialisation: rested reduction only past about 60% of a day in one craft (floor 50%), skillFit outweighs path cost, preferred craft, masters emerge.
- **K7** Possession: minimal in C2; its value is Steadfast, access to cells the AI refuses, and a felt bonus.
- **K8** Heat function with numbers, tinker class, start capabilities, honest "authored graph" wording and D14 content cost.
- **K9** Provisional prototype stack (TypeScript headless core, canvas debug renderer), throwaway-acceptable, not the engine decision.
- **K10** Era labels Hearth, Hide, Stone, Clay, Timber, Copper, Iron; primary order gesture is select + right-click; blueprint revision upgrades existing buildings; shelter progression from materials.
- **K11** Appendices A and B; recaps trimmed to a line and a cross-reference.

---

## Appendix B. Slice content list

The named content of the C3 slice (ASSUMPTION; counts are the plan, names are the content). Anything not listed is not in the slice.

- **Materials (12):** stick, log, leaf, grass fibre, stone (soft rock), flint, clay, fired clay, charcoal, malachite, copper ingot, water (a tag). **Foods (3):** berries, tubers, hopper meat; sun-drying on a stick rack is known at the start (ASSUMPTION so a first winter is survivable; open decision OD-45).
- **Knowledge (start):** forage, gather, carry by hand, KNAP_STONE. **Phenomena (6):** FIRE_TENDING (witnessed, first discovery), BAKE_CLAY, HOLDS_LIQUID, SMOULDER_WOOD (charcoal), SMELT_COPPER, and KILN_FIRING (optional). **Crafts:** firecraft, pottery, charcoal burning, smelting. **Skills (3):** dig, build, craft; gathering is skill-less.
- **Stations:** fire ring (hearth), clay-lined pit kiln, charcoal mound (earth-covered pit), workbench, bellows.
- **Furniture and entities:** leaf bed, door, storage basket, stockpile marker, torch, clay jar, bellows, workbench, fire ring, stairs, ramp. **Cell shapes (8):** full block, floor, wall, roof, stair, ramp, door, pillar.
- **Room purpose:** workshop (the only one required; sleeping room, storage and kitchen exist as data only).
- **Fauna:** thornback (the one wounding fauna; 150 HP; autonomous villagers flee above fear 0.6, so only a possessed villager stands and fights); hopper (huntable small game, placeholder name). **Flora:** berry bush, tuber plant, tree (wood and stumps), reed and grass (fibre).
- **Hazards:** cold (seasonal; shelter, fuel and warmth matter); thornback. Cave-in and bad air are MVP-tier, not slice.
- **Terrain:** one biome (meadow, forest and stream) plus caves; soft rock with a malachite stain and one ridge cell suited to draft; a clay bank on the stream.
- **Systemic events (2):** lightning, smouldering stump.
- **Job kinds:** forage, gather, haul, build, dig, craft, tend fire, burn charcoal, smelt, tinker, eat, sleep, flee.
