# Investigator A: Gameplay and Player Experience
Scope: player fantasy, moment-to-moment play, loops, command model, possession, controls and camera feel,
long-term engagement, anti-chore design, comparable games.
Not in scope: world representation cost (C), sim internals (B/D), tech tree structure.
Sources read: notes/CONTEXT_BRIEF.md, notes/existing_material.md (full), initial_prompt.txt (pillars 1-10).
Labels: ESTABLISHED = I am confident of it in a shipped game or the author's own code. ASSUMPTION / SPECULATION = my proposal.
Terminology used below: "board" = the existing village job board in slime-village (`jobs.js`: per-village `demand` vector,
each idle slime scores visible jobs, argmax). "Villager" = any inhabitant (slime or later species).
---------------------------------------------------------------------------------------------------
## 1. Recommendations
1. **One verb underneath everything: a job on the board.** Strategic orders, standing orders, blueprint builds, expedition
   goals and the villagers' own initiative all become jobs scored by the same function; the player's input is only a
   large, visible weight on that score. Rationale: pillar 2 ("same simulation") and pillar 10 (one game, not four) fall out
   for free, and it extends slime-village instead of replacing it.
2. **Orders beat village demand but not a body in crisis.** A commanded job gets a big multiplier (about 3x the largest
   normal demand score); a critical need (starving, freezing, collapsing) outscores it on a continuous curve, with no
   threshold flag. Rationale: preserves slime-village's "a starving village told to build houses still goes and eats first";
   avoids the author's documented "hard threshold" traps.
3. **Every order shows a status line in plain words** ("Mira: fetching flint, 40 tiles away", "Crew 2: stalled, no axe in
   reach"). No order ever fails silently. Rationale: the main complaint about indirect-control colony sims is mystery stalls.
4. **Crews are the strategic-scale object.** A crew is a named set of villagers plus a default task plus optional
   gear/provision rules. "Five on lumber" and "expedition party" are the same object with different tasks. Crew members
   still eat, sleep and have leisure; the crew task replaces only what they would pick when idle.
5. **Standing orders are targets on the demand vector, not scripts.** "Keep 200 lumber" sets a stock target; the pull
   on wood demand is proportional to the shortfall and fades to zero at the target (no threshold, no hoarding past it).
   Rationale: slime-village already has per-capita `TARGET` values; the player's orders simply override or add to them.
6. **Retire the "focus" weights as the main player lever; keep them as the top rung ("Stance").** The six existing focuses
   (Shelter, Food, Farming, Tools, Stores, Growth) become a one-click village stance that sits above standing orders.
   The unlock-by-goals gate goes away, because the player now has real commands. Names the divergence explicitly (section 2.3).
7. **Possession is a free, instant "lean in", with a small bounded buff and no loss of needs or risk shielding.** The buff
   is +25% skill-experience gain and +10% action speed on the possessed villager only, and nothing else. Why it is never
   optimal: the buff is dwarfed by the opportunity cost of removing one worker from the board, and no resource is created by
   player skill (the same yields and formulas apply) except in combat dodging and route choice.
8. **Possession keeps the body honest.** Needs keep running at normal rates; the villager eats carried food by itself when
   critical; the possession lapses only on collapse (and never mid-swing), and death while possessed is ordinary permadeath.
   Rationale: "same simulation" and the author's "he might get killed and now he's gone forever".
9. **Expeditions run in two modes that share rules: delegated and possessed.** The delegated mode is a crew plus intent
   ("find iron", "map the cave to depth X"), a provision rule and a recall rule ("turn back at half pack or one injury").
   Possessing any member just takes over their body mid-expedition. Rationale: this is what lets management-averse players
   explore (they never need to touch a body) and exploration-averse players ignore it completely.
10. **The away-village is just the village.** There is no "offline mode": when the player is gone the board continues with
    standing orders, the baseline demand vector, and seasons. Nothing is paused and nothing is a catch-up timer.
    Rationale: slime-village was built exactly for this ("a long unattended run"); pillar 6 is mostly already solved.
11. **Auto-promote chores by suggestion, not by silent takeover.** After a repeated manual action the Ledger offers a one-click
    standing order ("Keep 50 iron in stock?"). Survival logistics (hauling, firewood, water, repair, replant) are never
    orders at all; they are baseline village behaviour from minute one.
12. **The player always starts with the smallest useful command set and earns higher-scale commands by civilization
    capabilities, not by player chores.** Individual order and crew at minute 1; standing orders after the first
    stockpile; blueprints after the first user-built enclosed room; stewards (villager-run managers) after literacy/record
    keeping. Rationale: pillar 7 ("Bob, collect that iron" becomes "maintain the iron supply") expressed as society, not menus.
13. **Camera: one tilted top-down view with billboard sprites, wall/roof cutaway and a dimmed layer-peel underground,
    plus a close follow zoom for possession.** No second view mode. Side-view lives as an optional "cutaway lens" for mines.
    First person is cut from MVP. Rationale: the author wants one camera; management clarity needs a high angle;
    possession needs only a tighter zoom and character-relative controls.
14. **Long-term engagement is lineage plus stories plus creative build, not goals.** Hundreds of hours come from people
    who live and die, a chronicle that records it, rooms and blueprints the player designed, and a world that keeps
    revealing places. The 10 player goals in slime-village become non-gating chronicle milestones.
15. **Do not add an RTS competitive layer, drones, or a multi-tier tech tree to give the loop shape.** Shape comes from seasons,
    scarcity of particular materials, and danger in unexplored places.
---------------------------------------------------------------------------------------------------
## 2. Supporting reasoning (by topic)
### 2.1 Core player fantasy
Statement (ASSUMPTION, my wording): *"I watch a small tribe of individuals become a civilization I recognise, and I can
reach in at any scale, from a wave of a hand to a handshake, without ever being required to."*
Three pillars of the fantasy, each testable:
- **Patron, not puppeteer.** The player gives intent; the people supply the doing, with their own stats and quirks.
  Players should say "Mira is a better miner than I expected" rather than "I optimised the miners".
- **Attachment.** Names, lineages, colours, personal logs (slime-village already has `log`/`note()`, colour kinship and
  names drawn from hue). Attachment is the thing permadeath monetises: a loss only hurts if someone was known.
- **Authorship.** Rooms, blueprints, roads, and "that valley is where we found copper" are the player's marks.
What the fantasy is NOT: a hero game (player is not a character), a spreadsheet (no throughput puzzle), a defence game.
### 2.2 Moment-to-moment: what the player actually clicks
All four snapshots use only mechanics in the AGREED list. Time values are play time at normal speed, ASSUMPTION.
**Minute 1.**
- Fade in on a clearing: 4-6 villagers asleep in leaf beds and grass. Dawn light. Slime-village's own fair-start rules
  apply (landing in spring, fibre and food in reach).
- They wake and begin the baseline: forage, drink, gather fibre. The player does nothing and the camp functions.
  This is the first lesson: *you are not required*.
- First click: select a villager. A card appears (name, colour, one line "quick hands, easily bored", current job and the
  reason). First decision: "Mira, go to that grove" (point and click). The villager walks off and the status line confirms it.
- The first meaningful choice is *where* the camp centres (the player can mark the camp site or accept the default).
- Tutorialisation is only pointing: highlights on the hungriest villager, a one-line hint about shelter, nothing blocking.
**Hour 1.**
- Four to eight villagers, first rough shelters, a fire. The player has issued about a dozen orders, mostly one-off
  ("you three, gather fibre", "you, scout east").
- The first freeform room: the player draws a floor and walls of straw/log; the game recognises it as shelter with a
  readout ("4 beds worth, no door, cold"). The player decides.
- First standing order appears: after the first stockpile exists, "keep 30 fibre". First blueprint saved (a small hut),
  first "build 2 more of these".
- First discovery loop: send two to find stone; they come back with a story ("found flint by the river; Tam was mauled")
  and the map reveals what they saw.
**Hour 20.**
- 25-60 villagers, several skilled workers (the miner who has been mining for five seasons is now visibly better than a
  newcomer). Wood and stone age. A forge or equivalent. A second settlement perhaps.
- The player's day is mostly: look at the "Concerns" panel (food runway, rough sleepers, idle crews), adjust
  two standing orders, queue three blueprint builds, send a crew on an expedition with a recall rule, and then maybe
  spend 30 minutes possessing a miner to push a shaft through unknown rock because it is fun.
- Orders are mostly standing and crew-level. Individual orders are rare and mostly for *people the player cares about*.
- First meaningful deaths: an old founder dies; their blueprints and their apprentices remain.
**Hour 100.**
- 100-300 villagers (ASSUMPTION: depends on pace and sim cost, see unresolved decisions), several settlements, metal and
  machinery, the beginning of a late-era capability (what-pathway is a different investigator's topic).
- The player is *mostly zoomed out*: stewards manage districts; the player sets stance and a few strategic standing orders
  ("keep the northern mine supplied with 40 timber"), reviews the chronicle, designs new districts, and picks
  expeditions that matter. Individual interventions are chosen for emotional reasons: rescue, a favourite, a first.
- The zoom-down promise (pillar 7) is real: from any chronicle entry or any settlement view the player can click through
  to a person and onto their desk, a tavern table, or their body.
### 2.3 The command model across four scales, reconciled with slime-village
What slime-village has (ESTABLISHED, `existing_material.md` B7, B15): no direct commands. A per-village `demand` vector
recomputed once a second; each idle slime scores visible jobs as demand x profession affinity x distance x `temper` x
`belief`; claims prevent crowding. Player levers are island-wide FOCUS weights earned through 10 goals, plus a world
editor with "plans" (stake out a site, villagers build it when able).
What the brief wants: orders at four scales that all run through the same simulation.
**The reconciliation: every scale writes into the same two structures.**
```
Structure 1: the village demand vector     (numbers the board reads each second)
Structure 2: the job pool                  (concrete jobs: "build here", "fetch from there", "mine this vein")
Scale          writes to                                       lifetime
Stance         modifies demand multipliers (old FOCUS)         until changed
Standing order adds a target to demand: pull = f(shortfall)    until deleted or met-and-held
Crew order     creates a job with a slot count + member list   until revoked / done
Direct order   creates a commanded job for one villager        until done / failed / revoked
Blueprint      creates a batch of build jobs (ghost sites)     until built
Possession     removes the villager from the board entirely    until released
```
**Scoring** (extending the existing formula; sketch, not code):
```
score(slime, job) = demandPull(job) * affinity(slime, job) * proximity * belief * temper
                  + 0                                          (existing)
commanded job:   demandPull is replaced by ORDER_BASE (about 3 x the max ordinary pull)
crew slot:       demandPull * CREW_BOOST (about 2x), only for crew members
need override:   a need's urgency curve is continuous; at critical it exceeds ORDER_BASE
```
Consequences:
- **Orders are the same as any job**, just heavier. If a villager with an order has a small need (tired, a bit hungry),
  they still do the order, because the need's pull is smaller. Once the need grows beyond the order's weight they leave and
  come back ("Mira stopped to eat, returning to the dig"). The status line reports this.
- **No refusal and no "disobedience" mechanic.** Villagers fail an order only when it is physically impossible or the body
  gives out. This keeps the player's trust; any "moods" belong to the personality system, not command reliability. ASSUMPTION.
- **Over-ordering has a cost, as the author wrote.** "Push a village harder than it can carry and it will overextend."
  Concretely: commanded villagers do not accrue leisure; the existing `strain` debt applies; a crew held on a task for
  weeks accumulates strain and sickness. This keeps slime-village's most original rule alive and punishes micromanagement without a timer.
- **Standing orders and their cost model.** A standing order raises demand for the resource, which raises the job
  scores for gathering/crafting jobs, which pulls villagers who are free. If nobody is free the order shows "behind
  by 38; no free hands; 3 are busy with food". The player can then raise priority or assign a crew.
- **Production chains by backward chaining** (the `prm` notes' "Food -> crop -> water bucket -> ... -> wood"): "keep 20 bread"
  spawns sub-demands for flour, grain, firewood, an oven slot. This is a GOAP-flavoured expansion the author already
  wanted in 2024 and it is what makes "maintain" orders legible. It is SPECULATION on implementation cost; flag for D.
**Blueprint orders.** A saved blueprint is a set of ghost tiles/blocks with materials. "Build 10 more" places ghost
sites at valid locations the player approves (or in a painted zone), and the builders pick up the jobs. ESTABLISHED
analogue: Factorio's ghost entities/blueprints (built there by construction bots; here, by villagers carrying materials
by hand, the slime-village building approach "items one at a time"). The existing `edit.js` "plans" are the seed.
**Where the divergence lies.** slime-village is a hands-off sim by design and the Discord says its autonomy is partly a
balance test harness, "eventually dumb them down so the player is responsible for telling them what to do and what to
build and where." This report recommends *not dumbing the board down*: keep the autonomy, add the commands. The player
chooses what to build and where, but the villagers still decide how, when, and with whom, and the baseline survival
behaviour (eat, drink, fetch, repair, sleep) stays autonomous. The cleaner framing: **player decides ends, board decides means.**
**Steward (SPECULATION, later).** A villager role (high intelligence/literacy) who runs standing orders for a district,
so higher-scale commands are executed *by people*. A poor steward under-delivers; none present means the baseline demand
vector handles survival. This realises "maintain the settlement's iron supply" without drones or magical automation
and makes the high-level control a thing with visible individuals. Not MVP.
### 2.4 Possession in detail
**What it is.** Click a villager, press Possess (or double-click a portrait). Their job is dropped back on the board for
others; the camera zooms to a follow view; input maps to character-relative movement and interaction.
Action verbs available are exactly that villager's own verbs: mine, chop, carry, fight, build a block, talk. A villager
without a verb (a child, an elder too frail) can walk and talk but cannot do it.
**Same simulation.** The possessed villager's mining speed uses their strength, skill and tool, same as autonomously.
A possessed swing yields what an autonomous swing yields. No cheats, no hidden bonuses beyond the buff.
**The divine-inspiration buff, concretely (ASSUMPTION on numbers).**
- +25% skill-experience gain for the skill being used (so possession acts like "intense mentoring": it speeds the villager
  toward their genetic potential, never above it).
- +10% action speed.
- A faint visual halo.
- No bonus to yields, health, damage, or need decay. No immortality.
**Why not mandatory.** Everything possession does can be done by crews at the same quality. The 10% is small enough that a
villager working alone at 110% is still worth one villager's output, not twenty. Expeditions can be delegated with recall
rules. Nothing important is only reachable by possession.
**Why not optimal.** Three structural reasons, not tuning:
1. *Opportunity cost.* The board loses a worker; the buff cannot repay that. Possessing your best miner to mine is
   strictly worse than letting them mine and doing something else useful with your attention.
2. *No yield multiplier from skill of the player.* Player skill appears only where there is player-controlled
   positional choice: dodging, aiming, route through hazards, choosing where to dig. Those are the things players want to
   do, so they are worth doing, but they do not scale into an economy.
3. *XP bonus is bounded by potential.* The XP buff is a convenience for growing a favourite, not a way to breed a super
   villager, because potential (genetic, soft-capped by the existing `settle()`) is the hard shape.
**Where possession genuinely beats delegation (and should).** Danger and discovery: a cave with uncertain geometry, a
fight with a tricky creature, placing a precise block in a trap, finding a hidden passage. Players who love that are
rewarded with outcomes (fewer losses, rare finds) not with an economy multiplier.
Combat is the one risk of an optimality edge: ASSUMPTION that auto-combat is competent enough that delegation is viable
and possession is a *style* choice. A playtest question for later.
**Needs and autonomy while possessed.**
- Hunger/thirst/energy/health run at the normal rates. The HUD shows the possessed villager's vitals prominently.
- Soft autonomy: at "low" the villager emits a bark ("I'm hungry") and, if carrying food, eats it between actions
  (a 2-second animation, interruptible only by lethal danger). At "critical" and not in combat, the possession
  lapses with a 10-second warning and a fade; the villager walks home on the board's logic. The player can re-possess immediately
  after a bite, but the body keeps insisting. This is a "gentle override", not a punishment.
- Mood, leisure and strain: possessed time counts as working time. Long possession sessions accrue strain exactly
  like commanded work (this is the author's own mechanic) so ten hours of continuous possession leaves the villager
  worn, which discourages one-villager fixation.
- Sleep: if the player wants, "Sleep here" lets the villager rest; time keeps running. The player can release and leave.
**Death while possessed.**
- Death is permadeath; no revive, no rewind, and no "game over". The camera pulls up to the death scene, the chronicle
  logs it ("Tam, miner, died in the Hollow at depth 14, age 31"), the body drops its pack as piles (existing `killSlime`).
- The player does not lose control: the next frame is the god view. They can choose another villager.
- No extra penalty for dying while possessed, because the possession choice is the player's own risk, and the villager already loses their life.
  ASSUMPTION: lifelong "Faithful" memorials (a statue option) may give narrative closure later.
**Anti-exploit.** Because possession removes a worker and gives only a small buff, "possession cheese" (e.g. swapping
bodies for speed) yields no gain: switching has no cost but no benefit. One guard: the XP bonus does not stack across
swapping, applying only after N minutes of continuous action on that skill. ASSUMPTION.
**Multiplayer note.** Visitors possessing local villagers is an unsafe idea; defer.
### 2.5 Primary and secondary loops (one loop, not four games)
The loop is a ring: **Discover -> Gather -> Build -> Grow -> (new need) -> Discover.** Each segment feeds the next.
```
        +-------------------- Discover (map, material, place) ----------------------+
        |                                                                           |
   needs a new material/place                                            new thing to use/make
        |                                                                           |
   Manage (crews, stance, standing orders) <--- Grow (people, skills, capabilities)
        |                                                                           ^
        +------------------ Build (rooms, blueprints, workspaces) -------------------+
```
- **Primary loop (minutes):** pick a thing the village lacks -> issue the right-scale command -> watch people do it -> notice
  the next lack. The "unit of play" is a *lack noticed and answered*.
- **Secondary loop (tens of minutes):** a lack that the village cannot answer with known materials -> explore (delegate or
  possess) -> find/learn something -> a new capability (a new workspace type, a better tool) -> new lacks.
- **Tertiary (hours):** seasons and generations: winters, births, deaths, teaching; the civilisation's character changes.
- **Interlock:** Build is not decoration; rooms *qualify* work. Explore is not adventure for its own sake; it finds the thing
  Build needs. Manage is not paperwork; it is how Explore does not cost Build. Research (see 2.9) is a consequence of
  doing the others: combining discovered materials in capable workspaces by people who have aptitude. There is **no
  research screen**; any "research" the player decides on is *which expedition and which workspace*.
- **Cut test (pillar 10):** each mechanic must develop civ, discover world, express creativity, or make stories.
  Cut candidates from my scope: any timer-based quest chain, daily bonus, or login reward; competitive RTS;
  drones. The player-goal chain as a gate is cut (becomes chronicle milestones).
### 2.6 Exploration vs management: both ways round
**Village while the player is away (pillar 6).**
- Baseline autonomy is full: forage, hunt, farm, craft, repair, sleep, breed, migrate, found villages (slime-village
  already does all this unattended). This is the single most valuable inheritance.
- Standing orders stay in force indefinitely; crews continue their tasks.
- Seasons are planned for 20 days ahead (`SEASON_LOOK: 20`): the village stocks for winter without being asked.
- Defences: a stance "Guard" or an assigned crew; the prowlers-won't-press-into-a-settled-village rule exists.
- Failure is allowed (slime-village's "a settlement that can fail is the only kind whose success means anything"),
  but the *rate* of failure while the player is exploring should be low by construction: a stable village on baseline
  should survive a multi-hour absence in all but bad-luck seeds. That is a testable property: sweep.js with no player
  input should have a survival rate in the 45%..<100% band the author already judges against. For the new game the
  target for a player-stable, mid-game settlement left alone for 2 hours should be higher: ASSUMPTION ">90% no-extinction".
- **No catch-up mechanic and no return penalty.** On return the player reads the Ledger: "Winter 3: nobody died; two births;
  copper stock fell to 8" in the chronicle style. No missed-reward screens.
**Making exploration viable for players who dislike management.**
- *Light-management default:* the **Steward stance** ("Let the village decide"): the village picks what to build (the existing
  `wantedBuilding` / `ladderFor` logic) and where (the existing `findBuildSpot`), but flags proposals as ghosts the
  player may veto. A player who never touches management still gets shelter, food and tools through baseline play.
- *Build-pattern defaults:* prefab blueprints (a starter cottage, a starter workshop) ship in the game so that the
  village can grow without the player drawing anything. Players who love building replace them.
- *Exploration needs no base calls:* standing orders cover supply: "keep my exped. party's pack list stocked".
**Making management viable for players who dislike exploration.**
- Resource discovery comes through villagers' own errands: scouts (the existing `scout` job, profession-led quarry) and
  leisure wandering map the surroundings; gossip spreads what they saw (`lore.js`). A homebody player can have discoveries
  *brought to them*.
- Delegated expeditions (crew + intent + recall rule) produce a report ("brought back: 14 iron, a map of two caves, one
  injured"). No avatar needed.
- Rare progression is not behind danger only: ASSUMPTION that material alternatives exist so a pure builder is never
  hard-blocked (design target for the tech investigator).
**Expedition rules (the two-mode shared concept).**
```
Expedition = crew + intent + provisions + recall rule + (optional) leader
 intent:     "find <material kind>" | "map this cave" | "dig to depth N" | "hunt <animal>" | "go see <place>"
 provisions: stock per head (food, water, torches), taken from the village store
 recall:     return when pack full | any member below 40% health | provisions at half | on first sight of a threat
 leader:     highest relevant skill by default; leader's traits colour the route
```
Pillar 4 says "retreat" is a villager behaviour; the recall rule is its player-configurable edge.
Delegated mine exploration (AGREED: dig deeper / seek specific materials) is just `intent: "dig to depth"`.
### 2.7 Controls and UX per scale
Principle: **select, then verb**. Every verb is reachable by click, a hotkey and a context menu. Cursor and tooltips explain.
| Scale | Select | Verb | Feedback |
|---|---|---|---|
| Personal order | click villager | right-click ground/object (context verbs: go, gather, build, fight) | status line, path preview, ghost for where |
| Strategic (crew) | box select or list tick-boxes; "Make crew" | pick a task from a short palette; slot count | crew chip on HUD with members, task, stall reason |
| Operational | open Ledger panel | "Keep >= N of X" / "Make N of X" | bar with stock vs target; why-behind text |
| Creative | build mode; draw floor/walls/furniture; "Save blueprint" | "Build here / Build N" with a ghost preview | ghost sites; materials checklist; "can't afford" greys and waits |
| Possession | Possess button on a villager card | WASD/click; context verbs of that villager | big vitals, halo, "Release" always on screen |
| Stance | one panel | pick 0-2 stances (Food, Shelter, Tools, Stores, Growth, Farming, Guard?) | a banner; village summary |
Clarity rules:
- **Why panel** on any villager, any building, any shortfall ("Why isn't there bread?" shows the blocked chain). ESTABLISHED
  analogue: slime-village's `TRAIT_INFO`/readouts phrased "in terms of consequences a player can watch", and the "every
  job can be explained by two numbers" comment.
- **Idle pins:** show idle crews and idle villagers (AoE-style idle-villager button is ESTABLISHED).
- **Concerns panel (advisory):** "Food for 6 days, winter in 12", "3 sleeping rough", "Crew 2 stalled". Never pauses play.
  Never a prompt requiring response.
- **Time:** speed dial 1-5 up to 50x already exists. Possession forces nominal speed (or max 2x) to be playable.
  Pause-with-orders: allowed (RimWorld-style), because it is not an artificial timer.
- **Accessibility:** all commands available through lists as well as the map. Colour-blind safe job/stall icons. ASSUMPTION.
- **Keyboard:** control-group number keys for crews (ESTABLISHED in StarCraft/AoE).
### 2.8 Camera, from feel and clarity
Camera cost belongs to C. Only feel here.
| Option | Strength for this game | Weakness |
|---|---|---|
| Pure top-down 2D (RimWorld, current slime-village) | clearest reading of rooms, jobs, paths; cheapest to read at 100 villagers | no height, flat feel, weak possession drama; underground needs a different presentation |
| Tilted top-down / 3/4 (oblique) with billboards (Octopath-style HD-2D sprites in 3D; ESTABLISHED look) | still readable; sprites keep the slime charm; walls/roof occlude so cutaway needed; height shows | cutaways and occlusion handling; sprite facing/animation direction |
| Isometric | height readable, pretty | depth-ordering and occlusion in freeform building is hard to see; camera rotation expensive |
| Side-view (Terraria) | mining/depth is instantly legible; great for caves | poor for a village across a landscape; hard for multi-story rooms and for traversing the surface |
| First person (Delver/Minecraft) | possession drama, immersion | loses clarity; building design in FPV is a chore; many players dislike motion sickness; interactions with the god-view differ |
| Dual-view like DQ XI (toggle same world 2D/3D, ESTABLISHED, no advantage either way) | respect for both tastes | author worry "cameras are hard enough to balance"; doubles art QA |
Recommendation: **one oblique view with billboard sprites, always rotatable in 90-degree steps if the world is 3D;
roof/wall fade near the cursor; layer-peel underground with a dimmed layer below; possession just zooms closer and
re-maps controls.** This respects "ONE view" and keeps the slime sprites. The FPV and dual-view are rejected for MVP
(section 3). If the world turns out to be a 2D tile map with a depth stack (C's call), the same view works with depth as a
slice. If it is full voxel, same camera.
Feel notes (SPECULATION, from play experience of such games):
- Possession should feel *close* but not twitchy: a follow camera at roughly one-third of the god-view distance, a 0.2s ease-in.
- Zooming from planet-scale to a face should be continuous (no loading cut): this makes the "zoom down to the individual"
  of pillar 7 a physical gesture, and it sells the fantasy.
- Billboard sprites have a known downside: facing direction. Delver avoids it with a single-angle view; in a rotatable
  view, characters must read from 4 sides or the sprite flips. ESTABLISHED technique but costs art; flagged to C.
### 2.9 Motivation and long-term engagement
What gives hundreds of hours on one planet without chores, timers, energy or streaks:
1. **Lineages.** A founder's great-granddaughter turns out the best smith; a mutation makes a colour sport; two villagers bond.
   Mechanics already exist in slime-village (genetics with `settle()`, colour inheritance, bonding, `generation`).
2. **Mastery of individuals.** Skills grow by use (Kenshi-style; ESTABLISHED in Kenshi that skills train by doing).
   A good miner took three seasons of mining; losing them hurts; apprentices carry knowledge. Needs a skill system
   (a gap noted in existing_material C).
3. **Place and authorship.** Rooms the player designed. Blueprints reused. A second settlement that the first founded.
4. **Discovery with consequences.** Not "difficulty by depth" (pillar 4 forbids it): discoveries change what the civilisation
   can do. A new ore means a new tool means a place that was unreachable becomes reachable.
5. **Generational time.** Seasons, famines, golden ages, ruins (existing `abandonVillage`/`adoptRuins`).
   "The place did not stop being that place."
6. **Chronicle.** A readable story the sim writes (existing `village.chron`, extended with individuals' feats). The player
   wants to see what happened.
7. **Self-chosen goals only.** Player-set targets ("reach the northern coast", "have 100 villagers", "found a library")
   rather than authored ones. The Chronicle highlights milestones passively.
What to avoid (pillar 6): daily login rewards, regenerating energy for the player, crops that wilt if you do not come back
(the world ages; the village feeds itself), and "dailies" in the Cult of the Lamb sense (see 2.11).
Seasons and winters are pressure *inside the sim*, not on the player's calendar.
A concern for later: hour 100 can feel samey if every new era adds only more of the same. The mitigation is
*qualitative capability* (pillar 5: "fundamentally new capabilities"), not bigger numbers. Owned by the tech investigator.
### 2.10 Avoiding repetitive chores (auto-promotion)
Rule of thumb: **if the player has issued the same order three times, the game offers to make it standing. If every village
ever needs it, it was never an order.**
Never orders (baseline behaviour from minute one):
- hauling to the nearest stockpile; eating and drinking; sleeping; firewood in cold; basic repair of standing buildings;
  harvesting ripe crops and replanting (farm plots); butchering carcasses (slime-village already does the latter);
  clearing the dead (body disposal); cleaning of rubbish if added.
Offered as standing orders after repeated manual action (the Ledger chips):
- "Keep N of material X" (lumber, stone, iron, planks, bricks, tools of a kind)
- "Keep N crafted items" (tools, bread, pots)
- "Keep an X crew on Y" (a lumber crew of 4)
- "Build a house for every N villagers" (population-linked)
- "Mend all roofs when below 50%"
Promotion levels as the civilization grows (pillar 7), with the trigger being a **capability, not a player grind**:
| Era/stage | Highest scale available | Typical order |
|---|---|---|
| Camp | individual + crew | "Mira, go to that grove" |
| After first stockpile | + standing stock target | "Keep 30 fibre" |
| After first built room | + blueprints | "Build 3 of these" |
| After record keeping (ledger/office/steward) | + district stance, steward | "Keep the north mine supplied" |
| Industry | + supply routes between settlements | "Keep timber moving from the forest to the foundry" |
| Space (expansion) | + interplanetary supply | out of scope here |
This is the progression of command itself: exactly the shape pillar 7 asks for.
Anti-chore design rules:
- Never require the player to *re-issue* an order after a normal event (night, winter, a death). Crews refill by rule
  ("fill to 5") or stall visibly, not silently.
- Never make a repeated action faster to automate than to do once. Offer is one click.
- Auto-promotion is a **suggestion** (visible, dismissible, remembered), never a silent assumption. Player authority
  matters more than convenience. Mitigated by making the suggestion cost zero attention.
### 2.11 Comparable games and concrete lessons
Only claims I am confident of. All are about mechanics, not about taste.
- **RimWorld.** ESTABLISHED: colonists are individual with traits and backstories; per-colonist priority grid for work
  types (1-4); "bills" at workstations with "do X times", "do until you have X" (and a "forever" option), stockpile zones;
  drafting a colonist gives direct control for combat; the storyteller generates incidents. Lesson: *"do until you have X"
  is the operational command and players love it*; the work-priority grid is powerful but becomes a chore at scale;
  drafting is the closest to possession and is purely tactical. A gap to avoid: forgetting a bill and finding the colony
  stalled. Our Why panel and stall lines address it.
- **Dwarf Fortress.** ESTABLISHED: dwarves with skills that improve by use and preferences; labours toggled per dwarf; work
  orders with conditions; military squads; stockpiles. Lessons: a rich personal history and skill by use make attachment;
  UX is the cost; permanent deaths generate legends. The labour-toggle UI is the chore we avoid with crews and defaults.
  Cautionary: adventure mode and fortress mode are separate games. Our possession is not a separate mode.
- **Going Medieval.** ESTABLISHED: settlers with task priorities, zones, buildings with multiple levels and a layer
  view. Lesson: levelled view to read multi-story building (relevant to camera), and tasks prioritised per category.
- **Timberborn.** ESTABLISHED: beavers (individuals with needs), workers assigned to buildings, priorities per building,
  a vertical terrain. Lesson: building-centric staffing is intuitive: "this building has 3 slots". Could inform workspaces having slot counts. The map readability with vertical terrain is a model for layer visuals.
- **Songs of Syx.** Large populations governed by sliders and demand for buildings; individuals less central.
  Lesson (only moderately sure of detail): scale to thousands works when the player manages *categories*, not
  people. This matches the later "stance + standing" scales but not the attachment we want.
- **Oxygen Not Included.** ESTABLISHED: duplicants with skills, per-task priorities (1-9), schedules, and an errand model
  where tasks are posted and picked by the best eligible duplicant. Lesson: the priority number on a *task* is a very
  readable command; but the player drowns in priority tuning. Our single "heavy" level of command and automatic default is
  a response. Their skill/interest system is "chosen by player", which pillar 1 forbids (no point allocation).
- **Majesty.** ESTABLISHED: indirect control of independent heroes by placing reward flags (explore, attack, defend); heroes
  decide whether the reward is enough. Lesson: *incentives on the board* are a delightful indirect command; our "pull
  proportional to shortfall" is the same. We differ in that orders are reliable. A possible bounty-style order ("reward for iron")
  fits the Majesty model without being necessary. Could be a later "incentive" command. SPECULATION.
- **Cult of the Lamb.** ESTABLISHED: followers with traits to manage, daily-ish upkeep (feeding, cleaning, rituals, indoctrination),
  and roguelike expeditions. Lesson: the follower attachment and loyalty is strong; but its daily upkeep is exactly the
  chore loop the brief forbids. Take the individual quirks; leave the daily rituals.
- **StarCraft / Age of Empires.** ESTABLISHED: control groups, rally points, production queues, idle-villager hotkey; AoE
  villagers auto-gather the nearby resource. Lesson: QoL tools for scale (control groups, rally points as standing orders)
  all map directly. "Rally point for new builders to a site" is a lovely standing order.
- **Factorio blueprints.** ESTABLISHED: ghost placement, blueprint books, bots build them. Lesson: ghosts show intent,
  blueprint reuse is the creative-to-scale bridge. We keep ghosts and reuse; construction is by hand, so ghosts wait on materials
  and builders (and the order shows why).
- **Terraria.** ESTABLISHED: NPC housing needs a valid room (enclosed, door, light, table, chair, wall behind) and the game tells
  you why a room is invalid. Lesson: for freeform room recognition, a short checklist with live "what's missing" feedback
  is a proven, loved pattern. Do not require a hidden formula.
- **Kenshi.** ESTABLISHED: skills improve by doing; squads; no hand-holding; permanent injuries (limb loss). Lesson: skill by
  use is naturally paced; being hard without a quest chain is acceptable to a certain audience. Beware that raw
  difficulty drives players away.
- **Against the Storm.** ESTABLISHED: assigning villagers to buildings, resolve, building recipes, a run-based structure.
  Lesson: smaller scale and clear production chains make the base readable. Its run structure is not our model
  (persistent world), but the legibility of recipes and building slot counts is.
- **Dungeon Keeper.** ESTABLISHED: the player (a god-like keeper) can possess a creature in first person, creatures
  are autonomous otherwise, and there is a clear god/hands relationship. Closest precedent to our possession:
  possession is a power the player may use; the base functions otherwise. (I'm less sure of exact numeric benefits.)
- **Dragon Quest XI 2D/3D.** ESTABLISHED: the same game can be played in a modern 3D look or in a retro 2D look in the
  later edition. Lesson: it is a presentation switch on identical gameplay; costs a full second art pipeline. Not for MVP.
- **Delver.** ESTABLISHED: first-person dungeon game with billboard (always-facing-camera) sprites in a 3D
  environment. Lesson: billboard sprites give the charm of 2D art and the depth of 3D; works because the camera is
  mostly front-facing. Octopath Traveler's HD-2D shows it in third-person with tilt-shift. Both informs the oblique
  recommendation.
---------------------------------------------------------------------------------------------------
## 3. Alternatives considered (and why rejected)
- **Hard commands (override needs).** Pros: player trust, simplicity. Cons: starves villagers on a mis-click; throws away
  slime-village's best rule; invites micromanagement; the author's own README is explicit against it. Rejected.
- **Priority grid per villager (RimWorld/ONI).** Pros: powerful. Cons: a chore at 100+ villagers; contradicts "no manual
  allocation" in spirit. Rejected as the default; crews + stance are the replacement. A per-villager "never do X" toggle may
  be offered later as an exception (e.g., "Mira will not fight").
- **Pure indirect control (Majesty-only or slime-village focus only).** Pros: purest to current code. Cons: fails the AGREED
  explicit orders. Rejected as the sole scale, kept as "incentive" idea.
- **Possession as a separate mode/different game (DF adventure mode).** Rejected: pillar 2 says same simulation.
- **Possession with a strong buff (e.g., +100% speed).** Rejected: makes manual control mandatory/optimal, which the brief forbids.
- **Possession with no buff.** Considered: then why do it? The buff is a gentle reward and a story hook (halo). Keep a small buff.
- **Possession with a cost (mana/cooldown/energy).** Rejected: energy systems and timers are forbidden.
- **Possession locks the village into a pause.** Rejected: village must be able to run while the player plays (pillar 6).
- **Player goal chain as the main driver.** Rejected: becomes a checklist; contradicts emergent tech. Keep as chronicle milestones.
- **Daily chores / upkeep to keep villagers loyal (Cult of the Lamb).** Rejected by pillar 6.
- **Drones for late-game automation.** Open per brief; default no. A steward-based model gives the same "maintain X" without bots.
- **First-person camera for possession.** Rejected for MVP: building and orientation suffer; costs a second control scheme
  (also costs C). Possibly a later optional setting.
- **Dual-view (DQ XI).** Rejected for MVP: the author's own camera-balance concern; doubles art.
- **Side-view as primary.** Rejected: surface settlement management is poor; kept only as a mine cutaway lens.
- **Mandatory research screen.** Rejected (pillar 5).
- **Fog hiding the god-view from the player completely.** Kept as the existing "fog as villagers' sight" model, but see
  unresolved decisions on how much the player map should be limited by it.
---------------------------------------------------------------------------------------------------
## 4. Risks and tradeoffs
1. **Trust vs autonomy.** If the board overrides orders too often (eats first, resting), players may feel ignored. If it
   never overrides, villagers die from mis-clicks. Mitigation: status lines, soft override curve, tunable in the sweep tests.
2. **Mystery stalls.** Autonomous systems that fail silently are the leading source of frustration in colony sims. The Why
   panel and stall reasons are mandatory UX, not nice-to-have; they must be designed with the sim (dependency on B).
3. **Scale of UI.** Four command scales + blueprint + possession + stance is a lot to teach. Mitigation: progressive unlock by
   capability (section 2.10), and a very small first-ten-minutes vocabulary: select, point, "make crew".
4. **Standing-order exploits.** "Keep 10000 lumber" could drain all labour for a hoard. Mitigation: the village's food/shelter
   demand still outscores it (soft); a Concerns note "this order is eating 18 of 22 hands".
5. **Possession edge in combat.** Players with good reflexes may outperform auto-combat so much that delegation feels bad.
   Mitigation: auto-combat competence; limit the benefits to saves not economy. Needs playtest. ASSUMPTION.
6. **Permadeath vs lifespan pacing.** Existing slime life ~4-7 real hours at 1x. Over 100 hours that is 15-25 generations;
   strong attachment to *one* individual lasts a few hours. That could be fine (lineage emotional model) or too brutal for
   possession bonds. Unresolved (section 5).
7. **Attachment overload.** At 200 villagers individuals blur. Mitigation: a "Notables" list (top skills, elders, the
   injured, newborns, favourites the player starred) and the chronicle; the player stars individuals, the game doesn't.
8. **Mid-game plateau.** After the first stockpile and first forge, the loop can feel like "same, bigger".
   Mitigation: new qualitative capabilities, places with distinct hazards (environment not depth), and creative building.
9. **Over-ordering cost invisible.** The `strain` rule is subtle. If players don't understand why a crew is sick, the rule
   becomes a hidden punishment. Need UI: "Crew 1: tired of the dig, 3 weeks without rest".
10. **Fog vs god-view.** If the player's map is limited to what villagers saw, it feels coherent but delays "planning from above".
    If not, it breaks "a slime acts on what it has seen". Open.
11. **Blueprint spam / ghost clutter.** "Build 10 more" places ten ghosts; if materials are lacking they sit forever. Mitigation: ghost
    queue panel, order by priority, and an expiry that the player (not a timer) chooses.
12. **Savings of the sim.** Orders add state (crews, targets, status text) to a sim whose strong point is determinism and save
    round trip. They must be plain data and saved with the rest. Dependency on D.
13. **Pure observers.** Observe-only players (pillar 6) need nothing, but the game must reward them: the Chronicle, fast-forward,
    and nice readouts. Slime-village is already that game; do not break it.
---------------------------------------------------------------------------------------------------
## 5. Unresolved decisions (each with a recommended default)
1. **Order weight vs need curve exact numbers.** Default: ORDER_BASE 3x max ordinary pull; need urgency exceeds it at
   "critical" bands (e.g., hunger above 85%). Tune with the sweep harness: acceptable if a starving village told to build
   still survives >=95% of the time.
2. **Crew membership model: named set vs slot count.** Default: named set (the player picks people) with an optional
   "keep filled to N" refill rule; for large civilisations, slot-based crews attached to a building/workspace.
3. **Does the village choose what and where to build when the player says nothing?** Default: yes as the "Steward" stance,
   shown as veto-able ghosts, on by default early, off by player choice. This is the "dumb them down" decision of the Discord:
   my default is to keep autonomy and add the commands, not to remove autonomy.
4. **Buff numbers.** Default +25% XP gain, +10% action speed. Playtest at +0%, +10%, +25% XP to find the point where
   possession is neither compulsory nor pointless.
5. **Possession lapse rule.** Default: gentle (eat from pack at low, lapse with a warning at critical and not in combat).
6. **Fog of the player's map.** Default: the player sees what the civilisation's heads know (existing lore model), but
   can peek (scouting overlay) in sandbox mode; planning from above stays possible via the map of known cells.
7. **Visible stats shown to the player.** Default: show traits as words (poor/good/exceptional) like `traitStanding()`, not
   numbers; skill levels as named ranks with a progress hint.
8. **Pace of lifespan versus real time.** Default: tune so a villager lives 8-15 real hours at 1x (about 2-3x
   slime-village's), so possession bonds and apprenticeships have room; use the existing speed dial for the rest.
   ASSUMPTION; interacts with population cap and sim cost.
9. **Pause and slow-time during possession.** Default: no pause. Allow a 0.5x slow option in settings, not 'mandatory'.
10. **Notables/stars.** Default: the player can star up to N villagers; stars get chronicle lines and a portrait strip.
11. **Camera final form.** Default: oblique billboard, 90-degree rotation, FPV excluded; the decision rests on C's cost analysis.
12. **Steward role in first planet or expansion?** Default: first planet, later phase (post-MVP) because it carries pillar 7.
14. **Drones.** Default: no.
15. **Whether visitors/multiplayer can issue orders.** Default: no; visit and observe only.
16. **Auto-combat style.** Default: villagers fight/flee by personality and stats; the player can set a stance ("Fight", "Flee",
    "Hold") per crew. Leave details to the combat owner.
17. **Naming the stance for the old FOCUS list.** Default: "Stance"; keep the six existing kinds, add Guard.
---------------------------------------------------------------------------------------------------
## 6. Dependencies on other systems
- **Simulation core (B/D, job board).** Needs: a commanded-job class; a crew object; a standing-order / target store with a
  continuous pull function; the need urgency curve; status-line reasons exposed from every job branch. Save/restore must
  include these (existing `save.js` generic copy with denylist helps). Determinism: orders enter the sim as timestamped
  inputs applied at fixed steps (so replays and the roundtrip test continue to work).
- **Skills and knowledge (pillar 1).** Possession's XP buff, apprenticeship and crew-quality all assume a skill model
  with genetic potential and experience. This is a NEW build (slime-village has none).
- **Construction (pillar 3).** Blueprints, ghost sites, room recognition checklists, workspace slot counts. Terraria-style
  "what's missing" readouts must be authored with the room system.
- **World representation and camera (C).** Layer-peel, cutaway, billboard facing, possession camera; terrain digging in
  a sim whose terrain is a pure function of the seed (existing divergence 6).
- **Tech/knowledge investigators.** The capability gates for command scales; expedition results unlocking capabilities;
  "research" has no screen so it must emerge from workspaces and aptitude.
- **Combat/hazards.** Combat resolution used both by auto-combat and by possessed villagers, same formulas.
- **Ecology.** The unexplored world supplies what exploration finds; hazards via environment not distance.
- **UI.** Ledger, Crews, Concerns, Why panel, Notables, Chronicle, blueprint library, build mode, possession HUD.
- **Audio/art.** Halo and cinematic death/loss moments are small but emotionally load-bearing.
- **Testing.** The headless sweep needs a "scripted player" that issues orders to test over-ordering failure rates and
  absent-player survival. Strongly recommended as the first test of the command layer.
---------------------------------------------------------------------------------------------------
## 7. MVP vs later (vertical slice for the first planet)
**Essential for a first-planet MVP (the vertical slice must prove these):**
1. Baseline autonomy running unattended (inherited). Proof: leave it for 2 real hours; the village lives.
2. Select + direct order with status line (personal scale).
3. Crews with a task (strategic scale), including the "stall reason" text.
4. At least one standing order type ("keep N of resource"), with the shortfall pull and a "why behind" panel.
5. One freeform room recognition sample + blueprint save + "build N more" with ghosts (creative scale), at least for
   shelter/workshop.
6. Possession of any villager, with the small buff, vitals, gentle lapse, and permadeath. Same verbs as autonomous: mine,
   chop, carry, fight.
7. One delegated expedition type (e.g., find material / dig to depth) with recall rule, plus an expedition report.
8. Stance panel replacing FOCUS (reuse the six kinds).
9. Why panel, Concerns panel, Notables list, Chronicle.
10. One camera: oblique with cutaway and the possession zoom (subject to C).
11. Skill-by-use with a rough potential vs experience split, because the possession buff and the "Notables" story depend on it.
**Later (post-MVP, still first planet):**
- Auto-promotion suggestions in the Ledger (a nice-to-have in MVP if cheap; otherwise later).
- Stewards and district-level standing orders.
- Production-chain backward-chaining orders ("keep 20 bread").
- Supply routes between settlements (carts/wagons per the transport ladder).
- Starred villagers, memorial statues, family tree view.
- Incentive (bounty) orders.
- Optional camera extras: first-person possession option, mine cutaway lens refinements.
- Settings for slower time while possessed.
**Expansion (space):** interplanetary supply orders and visiting other players' worlds. Out of scope here.
**Cut list for my area (say so explicitly):** player-goal chain as a gate; daily/streak/timer features; drones; dual-view camera;
a research screen; per-villager priority grids; competitive RTS; possession with costs; separate adventure mode.
**Smallest cohesive set** (if the MVP must shrink): personal order + crew + keep-N standing order + blueprint "build N" +
possession with buff + one expedition type. Everything else can wait without breaking the loop.
