## 01. Executive Summary

**Slime / Dorf Village (working title)** is a persistent, procedurally generated civilization sandbox. The player is a god-like overseer of a handful of slime villagers who begin asleep in leaf beds on a grassy clearing. The same individuals, their descendants and their settlement carry through to clay, copper and metalwork. Space is a later expansion and never a prerequisite (§20).

### What the game is, in six statements

1. **Individuals, not units.** Every villager (a slime inhabitant) has inherited traits, a personality, per-craft skills learned by doing, needs, a family, a chronicle entry, and permanent death. See §08 and §10.
2. **Orders at four scales.** Individual and crew orders, standing orders ("keep N of X"), blueprints ("build 10 of these"), and possession of one villager. All four write to one job board and one simulation (§07, §09).
3. **Freeform construction.** The player draws rooms; the game detects them, the player assigns a purpose, and a checklist says what is missing. Finished designs become blueprints (§12).
4. **Exploration feeds discovery.** New materials, fauna, ruins and phenomena seen in the wild become Curiosities; villagers witness and tinker their way to new Crafts. There is no research screen and no tech tree (§13, §15).
5. **Autonomy maintains; the player advances.** Villagers keep themselves fed, sheltered, repaired and supplied without being asked. Anything *new* (a new kind of building, place, research direction or scale of operation) comes from the player. This is the sentence the whole design is organised around.
6. **One planet, complete.** The first planet is the whole shipped game. Eras are labels derived from what the settlement can do, never gates.

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
- **Pacing anchor (R1, DEFAULT).** A villager lives about **10 real hours at 1x speed** (tunable 8-12). One game year is about a quarter of a life, so about 2.5 real hours, and each season about 37 minutes. Speeds are 1x-5x plus pause. Every skill, transmission and genetics rate is derived from this anchor.
- **Scale (R4, DECIDED).** 6-60 named villagers per settlement; simulation ceiling about 100. Larger operations are handled by crews and standing orders, not by more individuals.
- **World (R3, DEFAULT).** A 3D integer cell grid with z-levels (chunked 16x16x16, about 2 bytes per cell, destructible), rendered as slices rather than voxels. MVP map about 128x128x24.
- **Engine (R24, DECIDED).** Not chosen. §23 lists criteria and candidates only.
- **Effort (R26, ASSUMPTION).** MVP about 7-12 FTE-months; the full first planet about 30-60.

### What this game is not

- Not a hero game: the player is not a character in the world (possession borrows a villager; it does not replace the god).
- Not a spreadsheet or factory game: no belts, no drones, no throughput puzzles (D3).
- Not an RTS: no competitive wipe-the-other-player layer.
- Not a live-service loop: no energy, dailies, streaks, login rewards, or timers aimed at the player (§03, §22).
- Not a tech-tree game: capabilities emerge from materials, places and people (§15).

### Document map

| If you want... | Read |
|---|---|
| The rules that govern every other section | §03 |
| How a session actually plays | §06, §07 |
| Villagers, genetics, skills | §08, §10 |
| The job board and its explanations | §09 |
| Buildings, mining, crafting | §12, §13, §14 |
| Discovery and eras | §15 |
| What to build first | §24, §25 |

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
| 1 | **Technology is found, not researched.** | Data-defined phenomena fire when material properties meet heat, moisture, enclosure and time; villagers witness or tinker; the player reads an Almanac and Curiosities with near-miss hints that never name the product. | §15 |
| 2 | **The village survives your absence and your commands.** | Autonomy band (R8): eating, sleeping, hauling, repair, replanting, firewood, healing, fleeing, starter shelters run with zero orders. A starving village told to build still eats first (R5). | §09 |
| 3 | **Command grows with civilization.** | Individual and crew orders at minute 1, standing orders after the first stockpile, blueprints after the first built room. Each scale exists because a capability exists, not because the player ground for it. | §07 |
| 4 | **People are the progression.** | Skills by doing, genetics bounded to +/-25%, permadeath, craft knowledge that dies with its last holder but leaves evidence that makes rediscovery cheap (R11). | §08, §10 |
| 5 | **Possession is a push, not a requirement.** | Divine inspiration (+10% action speed, +15% XP) and Steadfast (the possessed villager does not panic or flee). No yield, damage or need bonus; no timer. | §07 |

### Differentiation from the inspirations

| Nearest neighbour | What it does | What this game does differently |
|---|---|---|
| RimWorld | Individual colonists, incident-driven stories. | Technology and building are discovered and designed rather than chosen from a research list; population is shaped by genetics over generations; the player can possess. |
| Dwarf Fortress | Deep individual and world simulation, z-levels. | Same grid depth, but a readable 3/4 sliced view, crews and standing orders instead of per-dwarf labour toggles, and a Why panel on every stall. |
| Minecraft / Terraria | Free construction and mining. | Builders are autonomous villagers carrying materials by hand; rooms have purposes with graded quality, and the player never swings a pickaxe unless they want to. |
| Majesty | Indirect control of self-willed heroes. | Orders are reliable (no refusal), with incentives replaced by a transparent job board. |

### Why it can be built by a small team

The USP is rules plus data, not content volume. Every claim above runs on three shared systems: the **job board** (R5), the **phenomenon table** (R12) and the **room checker** (R18). A new capability is a data row, not a new system. This is why the MVP (§24) can be 7-12 FTE-months while still proving the whole loop.

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
| 5 | **Emergent technology.** Capabilities from discoveries, materials and people; no tech tree. | ...it creates a new *capability* (something that was impossible becomes possible), not a numeric bonus, and reaches it through a phenomenon that can be witnessed or tinkered. |
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
| No rigid tech tree; eras are labels | Pillar 5, R14 | §15 |
| No belts, no drones | D3 | §14, §17 |
| No energy systems, daily chores, timers, streaks | Pillar 6 | §22 |
| Space never a prerequisite | Pillar 9 | §20 |
| Do not commit to engine, title or voxels without cost analysis | Brief | §23 |

### How pillars collide, and who wins

| Collision | Resolution |
|---|---|
| Pillar 6 (village survives absence) vs pillar 7 (player always has something to do) | The organising rule: survival is autonomous, advancement is not. |
| Pillar 1 (individuals matter) vs pillar 2 (strong commands) | Orders reliably bypass personal temper and preference (R5), but strain accumulates from over-ordering; individuality shows in *how well and how long*, not in refusal. |
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
| **Hour-20** | A few seasons in | Fill the stone-and-clay economy; second site; first apprentices; guard against loss of a craft | New capabilities and an era label; the first founder death |
| **Hour-100** | About ten lifetimes on the 10 h anchor | Zoomed out; designs new districts, picks expeditions that matter, intervenes for emotional reasons | A civilization with history that was shaped by the player but run by its people |

### Minute loop in detail

1. **Look.** Concerns strip, stock bars, idle-crew pins, villager cards.
2. **Decide.** Which scale? One person (order), a few (crew), a quantity (keep N), a place (designate), a design (blueprint).
3. **Issue.** Select, then verb (§07).
4. **Watch.** Status lines update in plain words ("Mira: fetching flint, 40 cells away"). A blocker appears the moment an order cannot proceed.
5. **Notice.** The next lack, or a Curiosity worth following.

### Session loop in detail

- Open: chronicle digest of what happened (R22).
- Mid: one structural change (a room, a blueprint stamp, a crew), one exploratory move (area designation, expedition, a possession dig).
- Close: the game keeps running unfocused (R22); nothing waits for the player. Saves are continuous.

### Hour-20 loop

By about hour 20 (ASSUMPTION): 25-60 named villagers within the R4 envelope, several visibly skilled workers, a stone-and-clay economy, perhaps a second site. The player's session is mostly standing orders and blueprints; individual orders are rare and reserved for villagers the player cares about. First founder deaths test knowledge transmission.

### Hour-100 loop

At about hour 100 the player has lived through about ten lifetimes at 1x (more with speed-up). They are mostly zoomed out: crew-level and standing orders carry the base; they design districts, choose expeditions, review the chronicle, and drop into bodies for emotional reasons (rescue, a favourite, a first). Mid-game plateau risk (identified in A) is countered by *qualitative* capability (a new thing is possible), new kinds of places (environmental, not just deeper) and creative building, not bigger numbers.

### Command scale as progression (PROPOSED unlock shape)

The player starts with the smallest useful command set and earns higher-scale commands by *civilization capability*, not by chores:

| Stage | Scale first available | Typical order |
|---|---|---|
| Camp | Individual order, crew | "Mira, go to that grove." |
| After the first stockpile | Standing order | "Keep 30 fibre." |
| After the first built room | Blueprint, stamp x N | "Build 3 of these." |
| Later (post-MVP) | Steward over a district | "Keep the north mine supplied." |

### A day in the life (vignette)

> *Season 2, year 3, about hour 14.*
> The digest says: "Autumn: one birth (Pell, to Mira and Oro). Copper stock fell to 8. The east grove burned after lightning. Nobody died."
> The Concerns strip reads **winter in 11 days; 3 sleeping rough; Crew 2 stalled: no axe in reach.** The player opens the Why panel on Crew 2: blocker **no tool**. The only axe-holder is Oro, who is tinkering at the kiln. The player draws a rack of three beds against the south wall of the main hall, saves it as a blueprint, and stamps it twice. The ghosts show "needs 36 wood-class; stock 120".
> A Curiosity chip is pulsing: *"Sooty glaze on the stones near the burned grove."* The player does not know what to do with it. They select Tam, who has high curiosity, and order "tinker near the burned grove". Tam walks off; the status line reads "Tam: examining scorched clay".
> Ten minutes later: the chronicle logs "Tam first fired clay in the burned grove: the Clay age begins." (An Era label, not an unlock.)
> The player switches to the copper seam. They possess Reen, the best miner, for a dig through a rock fault that the auto-miner kept stalling on. Reen's mining is 10% faster, she gains experience quicker, and when a stone drops from the roof she does not flinch (Steadfast). The player releases her when she collapses from hunger; the village ate and slept all the while.
> They save, close the game, and the village keeps running unfocused.

---

## 07. Player Control & Camera Systems

### Purpose

Let the player give intent at the scale they care about while the same simulation runs for villagers and for the god; let the player zoom to a body and back without a separate mode.

### Player experience

The player *selects, then uses a verb*. A short palette at minute 1 (select, point, make crew) grows with capability. Every order shows a status line in plain words. No order fails silently. Pause-with-orders is allowed (no artificial timer). The player can leave at any time.

### The four command scales

| Scale | Select | Verb | Writes to the job board as | Lifetime |
|---|---|---|---|---|
| **Individual order** | Click a villager | Right-click ground/object: go, gather, build, fight | A reserved job at class "player order" (R5) | Until done, failed or revoked |
| **Crew** (strategic) | Box-select or list; "Make crew" | Pick a default task; optional "keep filled to N" | A named set plus default task plus stall summary (R6); no extra scoring layer | Until revoked; crews refill by rule or stall visibly |
| **Standing order** (operational) | Stock bar or Ledger | "Keep N of X" or flip any gather order to "keep N" | A stock target with hysteresis (R7) | Until deleted |
| **Blueprint** (creative) | Build mode | Draw rooms; "Save blueprint"; "Stamp x N" | A batch of ghost-build jobs, supports first (R19) | Until built or cancelled |
| **Possession** (personal) | Possess on a villager card | Direct movement and the villager's own verbs | Removes the villager from the board; same Action/Controller pipeline as AI (R9) | Until collapse, release or death |

(Four scales in the brief: strategic, operational, creative, personal; "individual order" is the first rung of strategic.)

### Orders

An **Order** is a reserved job tied to a villager or crew. The board classes, highest explanation first (R5):

> **critical need > player order > standing order > village demand > personal leisure**

- Needs override orders only on a continuous survival curve when critical. "A starving village told to build still eats first." The status line shows the interruption: "Mira stopped to eat; returning to the dig."
- Orders bypass personal temper and preference. There is no refusal and no disobedience mechanic. Failure is physical (no tool, no path, no material, no skill, reserved, unsafe) and always yields a **blocker** (R5).
- Orders reserve work but do not freeze adjacent urgent jobs (a wall order does not stop someone fixing a collapsing roof).
- **Over-ordering has a cost.** Commanded villagers do not accrue leisure; the `strain` debt carried over from slime-village applies. A crew held on a task for weeks becomes tired and sick. The UI states this plainly ("Crew 1: three weeks without rest").

### Crews

A **crew** is a named selection of villagers plus a default task plus a stall summary (R6). "Five on lumber" and an expedition party are the same object with different tasks. Members still eat, sleep and have leisure; the crew task replaces only what they would pick when idle.

- Created by box select, list ticks or "Make crew".
- Appears as a HUD chip with members, task and stall reason.
- Control-group number keys for crews (AoE/StarCraft convention).
- Optional refill rule: "keep filled to N" (ASSUMPTION; default is a named set).
- Recall rule for expeditions: return when pack full, any member below 40% health, provisions at half, or on first sight of a threat (ASSUMPTION values from A).

### Standing orders

"Keep N of X" is a stock target with a hysteresis band (R7): refill starts below about 80% of N, stops at 100%, displayed as a **stock bar**. Every gather order can be flipped to "keep N" in one click. Auto-promotion suggestions ("you've ordered this three times") are post-MVP QoL.

Example: "Keep 200 lumber" shows as a bar; if no hands are free it reads "behind by 38; 3 busy with food", and the player can assign a crew.

### Possession

**Possession** takes a villager out of the job board and gives the player their body. The villager's job returns to the board for others.

| Rule | Value (R9, DEFAULT) |
|---|---|
| Pipeline | Same Action/Controller pipeline as AI; the same verbs and formulas |
| **Divine inspiration** | +10% action speed, +15% XP |
| **Steadfast** | The possessed villager does not panic, flee or break under fear |
| Other bonuses | None: no yield, damage or need bonus |
| Needs | Keep running; the villager eats carried food when critical |
| Release | Only on collapse (incapacitation), never on a warning; no timer, no cooldown |
| Death | Ordinary permadeath; the next frame is the god view |
| Exploit guard | Prototype bot band: possessed output at most 1.25x delegated |
| Visual | A faint halo; vitals shown large; "Release" always on screen |

**Why Steadfast.** The author wants a felt "extra push, defeat a difficult enemy". Steadfast delivers that *qualitatively* (the villager does not flee when the dig turns scary) without making possession the optimal way to work. The stats buff is small on purpose so it stays perceptible but never decisive; perception of +10/+15 is a prototype question ("possession feel / buff perceptible").

**Why possession is never optimal (structural, not tuned):**
1. Opportunity cost: the board loses a worker.
2. No player-skill yield multiplier: player skill shows only where there is positional choice (dodging, routes, where to dig).
3. XP is bounded by genetic potential (R17).

**Where it genuinely helps:** danger and discovery (a cave with uncertain geometry, a fight with a tricky creature, a precise block placement). Rewards are fewer losses and rare finds, not economy.

### Camera (R2, DEFAULT)

**One camera.** A fixed-pitch 3/4 oblique view onto a z-sliced world:

- Current z-level shown in full; the level below dimmed (so mines read as a place, not a map sequence).
- Roof and wall cutaway above the cursor/selection; a ghost of the level above at low alpha.
- A one-key "show all levels as a cutaway block" for multi-storey buildings (PROPOSED from the design review).
- All sprites drawn 3/4. Fixed yaw in MVP (design call: no rotation until art cost is known; if added later, 90-degree steps).
- Continuous zoom from settlement to face. Possession uses **the same camera** with tighter follow (roughly one-third of god-view distance, about 0.2 s ease-in; ASSUMPTION) and direct movement keys.
- Possession is paced at normal speed or a maximum 2x (PROPOSED); no pause forced.

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

Gating prototype: "3/4 slice readability" (can testers read stairs, roof versus floor, which level a villager is on).

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
| Over-ordering | Strain, sickness, no leisure | Plain-language warning on the crew chip |
| Possessed villager dies | Permadeath; god view | No extra penalty; chronicle line |
| Possessed villager collapses | Control released | Never on a warning |
| Camera obscures | Cutaway hides roof/wall | Cutaway on hover; a hotkey to show all |

### Exploits & counters

| Exploit | Counter |
|---|---|
| Possess-swap to chain buffs | XP buff does not stack across swaps; bot "possess-swap" in the harness (R25) |
| Keep 10000 lumber to drain labour | Needs outrank standing orders; Concerns note "this order is eating 18 of 22 hands" |
| Ghost spam | Ghost queue panel; the player, not a timer, expires ghosts |
| Micromanaging a single hero | Strain; skills bounded by potential |

### MVP vs later

| MVP | Later |
|---|---|
| Individual order, crew with stall reason, one "keep N" order, blueprint "stamp x N", possession with buff and permadeath, one delegated expedition type, one camera | Steward, auto-promotion suggestions, incentive/bounty orders, second renderer, per-villager "never do X" exceptions |

### Example

> The player box-selects three villagers and presses Make crew, naming it "Ridge". They drag the crew onto the copper seam on level -3. The chip reads "Ridge: mining copper, 3/3 working." After a minute it flips to "Ridge: stalled, no pick in reach". The player flips the order to "keep 60 copper" and the stock bar appears.

---

## 21. Art Direction & Presentation

**Status: all PROPOSED** unless a line says carried over from slime-village. No art has been produced for this game.

### Purpose

Make the world legible at 100 villagers, make individuals recognisable, and make progress from leaves to metal visible without text.

### Player experience

A warm, hand-drawn 3/4 diorama. Slimes are readable at a glance by silhouette and colour; rooms read by materials and furniture; the era shows in the materials, tools and lighting of the settlement.

### Visual style (PROPOSED)

- **Pixel-art 3/4 sprites** on a z-sliced oblique view (R2). One pitch for all assets; no top-down orthographic set.
- **Chunky, low-resolution, high-contrast** shapes. Target sprite sizes (ASSUMPTION): tile 32x32 px logical; villager about 24x24 logical; tuned in the 3/4 readability prototype.
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
| Cold-hardiness | Thicker, glossier body (an environment-dependent gene, R16) |
| Longevity / age | Highlights fade; elders look paler and smaller |
| Mutation "sport" | A distinct hue shift or speckle that lineages carry |
| Skill-derived profession label | A small accessory (apron, goggle) once a top skill passes a threshold |

Genes move output by +/-25% (R16), so the visual cue should be *subtle*; the Inspect card carries the words (poor / below average / above average / exceptional), as `traitStanding()` does in slime-village.

### Era visual progression

Eras are labels derived from capabilities held (R14), so the look follows what the settlement *has*, not a global switch:

| Label (example) | Dominant materials | Silhouette |
|---|---|---|
| Hearth age | Leaves, grass, fibre, wood poles | Round, soft, organic; leaf beds, lean-tos, a fire ring |
| Clay age | Fired clay, thatch, timber | Rectilinear frames with warm earth tones; kilns |
| Stone age | Cut stone, planks | Heavier walls, steps, doorways, stone paving |
| Copper age | Copper fittings, brick | Cool-warm highlights; smoke; tool racks |
| Metal age | Iron, rails, heavier machinery | Industrial silhouettes; rail spurs; dense stockpiles |

Set dressing (props, paths, stockpile look) responds to stock levels so a thriving settlement looks it. Ruins retain their sprite set (R11 and pillar 8): the old camp remains visible after the settlement moves on.

### Environment and world

- Biome palettes distinct enough to read from the overview (grass, scrub, jungle, tundra).
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
| Sprites unreadable at 100 villagers | Zoom-dependent icon LOD; the 3/4 readability prototype |
| Colour overload | Hue is identity only; shape and icon carry state |
| Cutaway confusion | Roof fade; show-all-levels key |

### MVP vs later

| MVP | Later |
|---|---|
| One biome set, first three era looks (Hearth, Clay, Stone), core status icons, basic audio | Metal and industry, extra biomes, accessory per profession, ensemble music |

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
6. **Progressive disclosure.** Small first-ten-minutes vocabulary (select, point, make crew); more appears with capability (see §06).
7. **Zoom to the individual** from any list, chronicle entry or overview marker.
8. **Plain text over icons-only** where a status needs explaining.

### The panels

| Panel | Contents | Notes |
|---|---|---|
| **Why panel** | For any villager, building, order or shortfall: the chain of reasons and the **blockers** (R5). "Why isn't there bread? No flour: no grain: farm plot unplanted." | Must be truthful; prototype "Why panel truthful" |
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

Pause, 1x-5x (R1). Pause-with-orders is allowed. Possession runs at normal speed or at most 2x (PROPOSED). The game runs while unfocused; there is no offline catch-up in MVP (R22).

### Accessibility cross-reference

Colour-blind-safe icons, scalable text, remappable keys, list-based command access and reduced-motion options are specified in §19. This section only sets the principles.

### Interactions

- **§09:** blockers and explanation classes are produced by the board.
- **§15:** Almanac and Curiosities are the only research UI.
- **§18:** chronicle, digest and Notables carry the stories.
- **§19:** accessibility hooks.

### Progression

UI vocabulary grows with capability: minute 1 select/point/crew; after the first stockpile stock bars and standing orders; after the first built room the room checklist and blueprints; Almanac appears at the first Curiosity.

### Failure states

| Failure | Mitigation |
|---|---|
| UI scale at 4+ command scales | Progressive unlock; small first vocabulary |
| Stale or untruthful Why text | Generated from the board's data; prototype "Why panel truthful" |
| Overload at 60 villagers | Notables, crew chips, idle pins |
| Over-ordering invisibility | Strain readout on crew chips |

### Exploits & counters

UI cannot be exploited directly, but over-surfacing information can hand out solutions: Curiosity hints never name the product, and Almanac dead ends only record what was tried.

### MVP vs later

| MVP | Later |
|---|---|
| Why panel with blockers, Concerns strip, stock bars, Inspect, room checklist, Almanac and Curiosities (one discovery chain), chronicle with digest, Notables | Overlays beyond the basics, family-tree view, memorial statues, Ledger auto-promotion, bounty orders |

### Example

> The player sees a Concerns chip: "Crew 2 stalled." Clicking opens the Why panel: *"Axe: none in reach. Nearest: Oro's, 40 cells, reserved for the kiln."* The player right-clicks the kiln job and drops it; the chip clears and the status line reads "Crew 2: chopping."
