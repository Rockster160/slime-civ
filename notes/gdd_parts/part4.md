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

**19.1 Builder (build and decorate)**

| | |
|---|---|
| What they do | Draw floors/walls/roofs/stairs freeform on the z-sliced grid (§12); assign Purposes to Rooms and fill the requirement checklist; capture Blueprints; stamp "build 10 of these"; decorate for beauty/comfort (the luxury sink, see §14). |
| Progression | (a) **Blueprint library** grows and is reusable across the settlement. (b) **Room quality is graded, not binary** (R18): a better-furnished, better-insulated, better-lit Room scores higher and changes real outcomes (cold survival, workshop quality, mood). (c) **Material classes** open up as the village learns crafts (wood → stone → fired brick → metal fittings), so the same blueprint rebuilds as a more capable building. (d) **Multi-storey and underground** construction. (e) Chronicle "firsts": first two-storey, first room that held through a winter. |
| Village without them | Villagers build **starter shelters** (leaf bed, lean-to), repair what stands, and rebuild any blueprint the player flagged auto-build. They do not invent a workshop, a granary or a second storey. |
| Synergies | Rooms host Stations used by researchers (heat/enclosure context, §15); blueprints are what managers queue; stronger shelter lowers cold-hazard losses for expedition leaders' crews at home. |
| Vignette | The player traces a 7×5 stone-floor room around the kiln site, drops a door and two benches, and the checklist reads "Workshop: floor ok, 2 of 2 benches, light 0.6 (needs 0.5): ok, roof: ok." They save it as *Kiln Shed*, then stamp ×3 near the clay pit. The village hauls and builds in supports-first order while the player moves on. |
| Guarded failure | "Builder is only decoration": rooms must change outcomes (cold, workshop quality, mood). "Blueprint spam land-grab": cap on queued sites per crew (D 2.10). |

**19.2 Manager (manage inhabitants)**

| | |
|---|---|
| What they do | Form **Crews** (named selection + default task + stall summary, R6); issue **Orders**; set **Standing orders** ("keep N", R7); read the **Why panel** to clear **Blockers** (no tool / no path / no material / no skill / reserved / unsafe); place stockpiles; use **Teach** to pass crafts on; decide who sleeps near whom (the only breeding lever; mate choice stays with the slimes). |
| Progression | (a) **Scale of operation**: from "everyone does everything" at 6 villagers to named crews at 20–60 (R4); larger operations are crews and standing orders, not more individuals. (b) **Fewer stalls**: the Why panel's blocker counts per day are the manager's score, and are visible. (c) **Transport tier** (hand → basket/box → backpack → wagon → animal cart → rail, R21) shifts what a crew can sustain. (d) Craft continuity: surviving generations with a craft intact (see §10). |
| Village without them | Gather staples and hauling continue; standing orders already set keep running and refill below ~80% stock; crews with a default task keep doing it. Nothing new is begun. |
| Synergies | Standing orders keep expedition provisions stocked; Teach turns an explorer's discovery into a village capability; crews are the same object as expedition parties (R6), so a manager's crew can be sent out unchanged. |
| Vignette | Stock bar for planks sits at 40%. The player opens Why: "Plank: blocked: no tool (axe needed; 0 of 3 axes)". They tick "keep 6 axes", the bar fills over the next game day, and the plank bar follows. |
| Guarded failure | Micromanagement being optimal. Over-ordering has the carried-over cost: `strain` (slime-village) accrues when villagers are pushed past leisure, and the village "overextends" (see §09). The manager is rewarded for delegating. |

**19.3 Optimiser (optimise production)**

| | |
|---|---|
| What they do | Place stockpiles and workstations to shorten walks; choose transport tiers; tune standing-order bands; pick which Alternate implementation of a capability to invest in (salt vs smoke vs cold-cellar preserving, R13, chosen by environment); set up skill specialists; make breeding/housing choices that fit biome and era (genes move output about ±25%, R16). |
| Progression | (a) **Throughput per villager and per food** is shown as plain numbers in the stock panel. (b) **Tool tiers** (1.5-5×) and **skills** (≤1.8×) carry the big multipliers; genes the small one (R16, R17). (c) **Era-label advances** ("Clay age", "Copper age", R14) arrive when new capabilities are held, so optimising within an era does not become a dead end: new capability slots keep appearing. (d) Plateau is real: maintenance load and labour cap growth (D 2.9: bot "max-expansion" must plateau under 5%/year growth). |
| Village without them | Villages keep to their current ratios. They do not re-optimise their own layouts (no Steward in MVP). |
| Synergies | Optimisation targets come from a manager's Why panel; throughput wins are only possible with the builder's layout work; researchers' new capabilities reopen the optimisation puzzle. |
| Vignette | The player sees "walk time: 38% of the stone crew's day". They move the stockpile to the mine mouth and swap carriers from hands to baskets. Walk time drops to 21% and the stone bar stops dipping. |
| Guarded failure | Optimisation as a spreadsheet game. Counters: no hidden genotype numbers (phenotype + observed performance with noise), no flat tech percentages, decay as the master sink. |

**19.4 Explorer (explore and adventure; direct)**

| | |
|---|---|
| What they do | Possess a villager (R9) and walk/dig/fight with direct movement keys and the same Action pipeline as the AI; designate **areas** to mine ("dig this region", "follow this vein", "seek copper", R27) and then go and see; witness phenomena first-hand; map caves. |
| Progression | (a) **Atlas**: map knowledge, labelled finds, cave regions. (b) **Curiosities**: observed-but-unexplained things (a new ore, a strange fungus, a ruin, a smouldering stump) enter the Almanac and feed discovery directly (R12/R27). (c) **Reach**: depth and distance the village can reach safely (shoring, lights, provisions, transport tier). (d) **Stories**: the possessed villager's skills grow from what they actually do (R17) and their Chronicle lines read like an adventurer's. Divine inspiration (+10% action speed, +15% XP, **Steadfast**, R9) is a push, not a requirement. |
| Village without them | Everything in the autonomy band continues. The settlement does not itself decide to explore (new places are player-advanced). |
| Synergies | Finds become researchers' inputs; unusually dangerous finds change what expedition leaders pack; Teach spreads whatever the possessed villager learned. |
| Vignette | The player possesses Pip (dig 0.62) at the cave mouth, lights a torch and follows a green-stained seam down. Pip stays steady when the roof groans (Steadfast). The player backs out before the span goes; the Chronicle notes "Pip found a green stone that sweated in the fire." Pip's hunger bar is on the HUD the whole time. |
| Guarded failure | Possession as the optimal way to work. Bot band (R9): possessed output ≤1.25× delegated; possessed death rate in cave tasks ≥0.5× AI rate at equal skill. Death while possessed is ordinary permadeath. |

**19.5 Expedition leader (lead expeditions; delegated)**

| | |
|---|---|
| What they do | Compose an **expedition** as a Crew with *intent* ("find copper", "map this cave", "dig to depth N", "go see that place"), *provisions* from the store, a *recall rule* (pack full / member below 40% health / provisions at half / first sight of a threat) and an optional leader (highest relevant skill by default). Delegated and possessed expeditions share rules (see §13). They read a **report** on return: "brought back 14 iron, a map of two caves, one injured." |
| Progression | (a) **Longer and deeper** expeditions as provisions, lights, shoring and transport tier improve. (b) **Leader skill and trait colouring**: a cautious leader retreats early; a daring one finds more and loses more. (c) **Report quality**: scouts with the right skill discover more per day. (d) The same Atlas and Curiosities as the explorer, which means the *management-averse explorer* and the *exploration-averse manager* meet in the same system. |
| Village without them | As §19.4. While an expedition is out, the home crews continue by standing orders; the Concerns panel surfaces "Expedition 2 at half provisions" but never demands an answer. |
| Synergies | Provisioning is a standing order; the leader is chosen from villagers a manager has trained; each report feeds the researcher. |
| Vignette | The player drags a crew of three onto the copper stain in the north cliff, picks "find copper", leaves the default recall rule, and tabs back to the kiln shed. Forty game minutes later the report arrives: ore located, one villager hurt, party returning. |
| Guarded failure | "Auto-combat must be competent" (a second product). Resolution (tech review 4.3): combat is simple and lethal, and a recall rule means delegated parties retreat; the expedition's risk is chosen with the recall rule, not fought with micro. |

**19.6 Researcher (research and experiment)**

| | |
|---|---|
| What they do | There is **no research screen**. Research is *which* expedition and *which* workspace: they place stations with the right heat/enclosure context, stock the materials, assign villagers with tinkering aptitude, read **Curiosities** and near-miss hints that never name the product, and follow the Almanac (known Crafts, holders, dead ends). They run **Tinker** jobs on materials within reach and watch for **Witness** events (R12). |
| Progression | (a) **Capabilities** unlocked by new Phenomena discovered (R12/R13), one capability slot at a time, each with alternates. (b) **Almanac completeness**: known crafts, holders and dead ends. (c) **Era labels** (R14), shown in the Chronicle. (d) **Knowledge resilience**: more holders, more evidence (built kilns, stored products) so a rediscovery costs little after a loss (R11). |
| Village without them | Villagers still tinker occasionally when idle (the Tinker job is on the board), so discovery is not impossible without player attention; they just are not pointed at anything. Each capability can be reached by ≥2 routes per seed (solvability validator, R12). |
| Synergies | Explorers produce Curiosities; builders produce Stations; managers keep experiments supplied; observers watch the Witness moments. |
| Vignette | The Almanac lists a Curiosity: "Green stone, 'sweated' near the hearth, 2 sightings." The player builds a closed stone hearth with a bellows-like draft and assigns two villagers with high tinkering to the shed. A day later the Chronicle reads "Copper first smelted by Mossy (a first)." |
| Guarded failure | Brute force: it works, but costs 3-5× the informed route in materials and villager-days (D 2.5), and no free experiments exist (materials consumed, one experiment per station per day). Soft-lock: solvability validator at worldgen and rediscovery discount near evidence (R11). |

**19.7 Observer (observe the simulation)**

| | |
|---|---|
| What they do | Watch; follow a villager with a follow-cam; read the Chronicle and inspector; run time at up to 5× or pause and look; keep several named lineages in mind; use Why on anything curious. They may also place the occasional order, which is the same system. |
| Progression | (a) **Chronicle depth**: births, firsts, deaths with causes, notable lineages, era labels, weather-year summaries. (b) **Lineage threads**: family trees and "lines" ("the tall miners of the north ridge") emerge from genetics (R16) and are visible without numbers. (c) **Almanac fills in** even without the player's input, because villagers discover things on their own. |
| Village without them | The village survives (R8 target: ≥90% of seeds survive 2 real hours unattended; ≥90% of seeds survive ten game years with no orders while <20% start a new building type, D 2.3). A pure observer will see the village stagnate at its starter shelters, and the game says so neutrally ("The village has what it needs for now."). |
| Synergies | The observer's attention is an input for others: they notice the Curiosities the researcher will follow up. |
| Vignette | The player leaves the game at 5× while making dinner. The digest on return: "Year 3: a hard winter; two leaf beds lost; Tilly (Mossy's daughter) discovered that damp clay hardens by the hearth." |
| Guarded failure | Spectator-only being boring. Mitigation: environmental pacing (lightning fires, erosion/cave-ins exposing ore, seasonal drought, R12) happens without the player; one actionable notification per threat class (D 2.3); no "you did nothing" scoring. |

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
- **Step** controls: advance one tick or one game hour while paused (debug-grade but exposed: it is also an accessibility aid for players who need time to read).
- **Possession and speed** (PROPOSED): while possessing, the game caps at 2× and defaults to 1×, because direct control above that is not playable. Pausing while possessed is allowed (no "possession time" exists).
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
- Full rebinding screen, conflict detection, chords, separate bindings for possession movement and for the building tools, saved profiles, a one-handed preset. Crew control groups by number keys (ESTABLISHED in RTS conventions) are rebindable.
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
| Manager over-orders | `strain` accrues, leisure starves | Mechanically worse than delegating |
| Expedition member lost | Chronicle gravestone with skills and cause | Permadeath weight, no resurrection |
| Accessibility gap (screen reader) | Not supported in MVP | Documented, not hidden |

### Exploits & counters
| Exploit | Counter |
|---|---|
| Possession ping-pong to avoid needs | Needs and `strain` stay per villager; no per-swap reset; no "afterglow" timer is used (a timer; dropped, per the tech review) |
| Possession as XP farm | Same XP formula as AI plus the +15% inspiration; challenge-matched XP; per-day "rested" diminishing curve (R17) |
| Over-ordering as optimal | Crews and standing orders cost strain; orders reserve work but do not freeze urgent adjacent jobs (R5) |
| Idling at 5× to breed generations | Genetic costs, obsolescence and ±25% bound (R16); speed multiplies everything equally so there is nothing special about speed |
| Save-scumming permadeath | Allowed in single-player; an optional **autosave-only** mode (open decision, see §28) |

### MVP vs later
| MVP | Later |
|---|---|
| All seven playstyles supported by the *same* verbs; Why panel, Concerns panel, Chronicle, Almanac, Atlas/Curiosities | Steward (autonomously choosing from the blueprint library); Ledger auto-promotion suggestions (post-MVP QoL, R7) |
| Speeds 1×-5× + pause; pause-anything; remappable keys; UI scale; lineage mark; CVD-safe icons | Gamepad; screen-reader support; photosensitivity audit beyond the reduced-motion toggle |
| Playstyle bots in the harness | Playstyle-specific long-run balancing across eras (needs more content first) |

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
| The seven core properties above (a checklist, tests exist by M0) | Postcards (stage A), after M7; estimated 6-12+ FTE-months for the full visiting stack (D 7.3 ASSUMPTION) |
| Export of a plain-data snapshot as a by-product of save | Blueprint exchange; co-op; second planet |

---

## 23. Technical Architecture Considerations

> **Status: considerations, not a chosen stack.** The engine is **not chosen** (R24). Sources: C_simulation_tech.md, R3, R23, R24, R25, existing_material.md. Numbers are starting values (ASSUMPTION) validated by prototype P# (see docs/PROTOTYPE_PLAN.md).

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
- One board, one score function. Explanation classes in order: **critical need > player order > standing order > village demand > personal leisure**. Needs override orders only on a continuous survival curve when critical.
- Jobs carry `requires {skill?, tool?, carry?}`, `source`, `reservedBy`, `cellHint`. Reservations always expire and are re-validated each step (stuck reservations are the classic DF/RimWorld failure).
- Every rejection emits a machine-readable **Blocker** (no tool, no path, no material, no skill, reserved, unsafe …). The **Why panel** renders blockers, so explanation cannot diverge from behaviour (P10).
- **Crew** = named selection + default task + stall summary; no extra scoring layer. **Standing order** = stock target with hysteresis (refill below ~80%, stop at 100%).
- Cost sanity (C 2.5): at the R4 design range (6-60 villagers, sim ceiling ~100) the board is ~10 job-picks/second, each over ≤200 candidates; cheap. The slime-village lesson applies: keep `findJob`-style scoring **separated by job kind**, not inlined (jobs.js 1794→2663 lines, VERIFIED).

**23.4 World: chunked grid (R3)**
- Data model: **3D integer cell grid with z-levels** (DF-like), chunks of 16×16×16 (4,096 cells), ~2 bytes per cell (`mat` u8, `flags` u8) in typed arrays, destructible. MVP map ≈ 128×128×24 = 393,216 cells ≈ 0.8 MB (**128 chunks**); the full envelope considered in C (256×256×48 = 3.1M cells ≈ 6.3 MB) remains a post-MVP option. Rendered as **slices**, not voxels (R2/R3).
- Per-cell data that is rare is **sparse** (hp while mining, moisture, owner). A per-cell `virgin` bit marks terrain never placed by a player so that re-mining player blocks pays no XP (R17 / D rec 9; kept in the dig-delta list the save already needs).
- Walls, floors and roofs are cells; furniture, doors, plants, items are **entities** with occupied-cell lists, so Blueprints can capture them separately.
- Derived state is dirty-tracked per chunk (`dirtyNav`, `dirtyRoom`, `dirtyMesh`) and consumed once per tick. Static water as tags, **no flowing fluid** and no structural physics beyond cave-in spans (R20).
- The world representation is a **default, not finalised**: the evaluated alternatives (layered 2D, 3D z-level grid, side-view 2D, billboard 2.5D, full voxel) and the measurement that could change the default are in docs/TECHNICAL_RISKS.md §2 (prototype P5).

**23.5 Pathfinding: region graph + HPA\***
1. Nav graph from per-cell walkability + vertical links (stairs, ramps, ladders).
2. **Region graph** (RimWorld-style): connected components inside chunks; an O(1) reachability query via cached component id; this answers "unreachable" instantly, the cause of slime-village's pathing cliff (a code comment records A* at 43% of the sim at ~137 slimes; `maxNodes = 6000` cap, VERIFIED).
3. **HPA\*** over regions and portals, refining inside a region only while walking.
4. **Flow fields** (Dijkstra maps) only for many-to-one goals (stockpile, bed, flee).
5. Time-sliced path requests; agents walk stale paths until a reply; every step is re-validated.
- Budget (ASSUMPTION, P1): ≤6 ms/tick p95 for 100 agents including path work; no agent stuck >30 s. C's 200-villager target is kept as **stress headroom**, not a requirement (R4 sets the design range at 6-60).

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
- **Changed for this game**: terrain is mutable and player-built, so deltas are **per-chunk** (RLE or cell lists), with **copy-on-write chunks** stored the first time a chunk is modified, which avoids dependence on a frozen generator (C 2.10; `worldgenVersion` is still stored). Estimated worst case ~100-500 KB after RLE on a fully mined 256×256×48 world (ASSUMPTION, validate in P4). The `virgin` bit rides with the delta.
- **Versioning**: `SAVE_VERSION` + migration chain; slime-village refuses incompatible saves ("never half-loads"), which is not acceptable for a long-lived world, so a migration budget or a *chronicle export* fallback is planned.
- **Chronicle budget ≤1 MB**: keep all "firsts" and top-K events per year; compress old years to counts and names; per-villager ring buffer (30 entries, carried over); full records only for notable dead (D 2.8).
- Autosave on a fixed cadence with atomic write; with a command log, saves are snapshots + log tail (crash recovery and replay for free).

**23.9 Testing as design (R25)**
The **headless harness and exploit bots** are an MVP feature, extending slime-village's `headless.js`, `sweep.js` (judges outcomes and "complains in both directions": <45% survival too harsh, 100% too easy), `fixture.js` (frozen mid-game worlds) and `save_roundtrip.js`. Bots: **grind** (place/mine loop), **breed-best**, **possess-swap**, **max-expansion**, **absent-player**, **over-ordering**; plus playstyle bots (§19). Bots run on every build and fail it on a regression, with the pass bands stated in docs/PROTOTYPE_PLAN.md.

**23.10 Engine selection: criteria and candidates (no choice made)**

*Criteria* (each is a measurable question; they are applied after P1, P4, P6 and a UI spike):

| # | Criterion | How measured |
|---|---|---|
| E1 | Sim can run **headless in CI** | A 100-agent sim runs without the render stack |
| E2 | Sim performance at design range | P1 numbers on target hardware (mid-2020 laptop) |
| E3 | Determinism controllability (integer math, RNG control, ordered iteration, no hidden engine randomness) | P4 replay hash |
| E4 | Chunked z-slice rendering with cutaway at 128×128×24 | P6 prototype at 60 FPS |
| E5 | 3/4 fixed-pitch sprite pipeline; depth sort; ghost/overlay support | P6 |
| E6 | **Dense-UI quality** (panels, lists, Why, Almanac, blueprint tool); UI is a large cost (3-6 FTE-months, D 7.3) | UI spike: build the Why panel and a crew list |
| E7 | Second-renderer feasibility on the same sim (later) | Sim/render boundary is clean |
| E8 | Author skill and iteration speed (hot reload, debug tools) | Time to implement the P1 spike |
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

No candidate is favoured in this document. The language of the **sim** must run headless under CI; the engine is chosen after P1, P4, P6 and the UI spike.

**23.11 Reuse of slime-village (verified per existing_material.md)**
A summary; the full table with verification and "not reusable" items is in docs/TECHNICAL_RISKS.md §3.
- **Reuse as code if the engine is JS/TS**, otherwise as a *specification*: `settle()` and `breed()` (util.js:59, slime.js; VERIFIED by reading); mulberry32 as the stream primitive; `temper()` per-villager hashed lean; leisure/`strain` maths; season/warmth curve; plant/animal life cycles.
- **Reuse as pattern and tests**: headless, sweep, fixture and save-roundtrip harnesses (VERIFIED by running `headless.js` and `save_roundtrip.js` in the audit); seed + sparse-delta save with denylist; demand-vector + claims + explanation ("every job can be explained by two numbers").
- **Not reusable**: `findJob` monolith, `ai.js` state machine, 2D immutable-terrain `world.js`, A* `findPath`, renderer/UI, prefab buildings, step size varying with speed.
- **Caveat**: its working tree was dirty at audit (33 modified files, last commit `d9bceff`); snapshot a commit before porting. README and code disagree in places; code is truth.

### Interactions
Everything above exists to serve: possession and autonomy sharing one pipeline (§07/§09), freeform building and Blueprints (§12), mining and exploration (§13), discovery's heat/enclosure contexts (§15), the harness's exploit bots (§19, §28), and multiplayer readiness (§20).

### Progression
Architecture "progresses" by prototype gates: each milestone (§26) has a tech exit criterion tied to a P# in docs/PROTOTYPE_PLAN.md.

### Failure states
| Failure | Signal | Fallback |
|---|---|---|
| Pathfinding cliff | P1 over budget at 100 agents | Time-slice harder; cut room cap; smaller map |
| Determinism erosion | P4 hash mismatch in CI | Lint bans; fix the offending API; bisect with the command log |
| 3D grid too costly | P5: layered-2D covers all slice scenarios at <50% of the 3D implementation | Fall back to layered 2D (R3 default is a default, not a commitment) |
| Slice unreadable | P6 testers confuse levels | Stronger cutaway rules; fall back to top-down |
| Reuse trap | Ported code drags coupling | Treat slime-village as a spec; port only `settle`/breed/tests |

### Exploits & counters
Technical exploits are covered by the harness bots (§23.9). Architectural exploit: **render-side information leaks** (a view that shows more) are prevented by fog/knowledge living in the sim.

### MVP vs later
| MVP | Later |
|---|---|
| Headless sim, fixed tick, named RNG, command log, event stream, state hash; chunked grid ~128×128×24; region-graph pathing; Tier 0 only; seed + chunk-delta save with round-trip test; harness with exploit bots | Second renderer (P6-gated); Tier 1-2 LOD; fixed-point/cross-machine determinism; flowing fluids and structural physics; save migrations; netcode |

---

## 24. MVP Definition

The full document is **docs/MVP_SCOPE.md** (features by tier, dependency-aware roadmap, effort ranges). Summary.

**The MVP is the smallest build that is one cohesive game**: a small procedural map, slimes only, 6-60 designed villager range (5-8 in the slice), inherited traits and three skills with XP from real output, gathering and needs, freeform construction with hybrid Rooms and one functional Purpose, saved Blueprints with "stamp ×N", mining and exploration with area designation, one hazard set (cold, cave-in, bad air, one wounding fauna), optional possession with Divine inspiration/Steadfast, Almanac/Curiosities/Chronicle, the Why panel, and one genuinely emergent discovery chain with a per-seed solvability validator. The headless harness and exploit bots are part of the MVP (R25).

| Tier | Contents (see MVP_SCOPE.md for the full list) |
|---|---|
| Essential to identity | Needs + genetics + skills; three order scales (Orders, Crews, Standing orders) and the job board with Blockers; possession on the same Action pipeline; freeform Rooms and Blueprints; destructible exploration; one emergent discovery; Chronicle; permadeath; harness |
| Important but deferrable | Teach UI beyond learn-by-proximity; inheritance extras (inbreeding depression, hidden genotype tuning); rust; leisure XP-cap tuning; second hazard family; relationship tiers beyond family + friend/rival |
| Experimental | Second renderer; collective belief; offline catch-up; Steward; Ledger auto-promotion |
| Future expansion | Tier 1-2 LOD; wagons/carts/rail beyond the first transport tiers; species #2; Postcards; space |
| Out of scope (RESOLUTION cuts) | Drones, belts, death-farming/mana-for-deletion, XP from re-mining placed blocks, first-person, multiple species, documents/libraries, culture as a system, priority matrix, full combat, structural physics beyond cave-in spans |

**Scope assumption (R26, ASSUMPTION):** MVP 7-12 FTE-months; full first planet 30-60 FTE-months; possession's real floor is 3.5-6.5 months including feel, hazards and light, so its MVP form stays minimal.

---

## 25. Vertical Slice Design

The full plan, with the risk prototypes P1-P16 and their order, is **docs/PROTOTYPE_PLAN.md**. The slice is the MVP shrunk to a time-boxed demonstration: one small map (≈128×128×24, R3), slimes, 5-8 villagers, inherited traits + 3 skills (dig, build, craft), gathering + needs, freeform construction, one functional building type, saved blueprints, mining and exploration, one hazard set, optional possession, one emergent discovery chain. **No other eras are attempted.**

**The 7 properties the slice MUST demonstrate** (initial_prompt.txt Phase 4), each with its acceptance metric. All are measured headless over 20 seeds unless a human test is named; time units are game days (the day/year mapping is an ASSUMPTION fixed by the pacing prototype: R1 gives a ~10-hour life, so a game year is about 2.5 real hours at 1×).

| # | Property | Acceptance metric (summary; full text in PROTOTYPE_PLAN.md §3) |
|---|---|---|
| 1 | The village can function without constant intervention | With zero commands, ≥90% of seeds survive 2 real hours at 1× (≈0.8 game year, includes a cold season) and ≥90% survive 10 game years at fast-forward; <20% start a new building type |
| 2 | The player can meaningfully influence inhabitants | Assigning 3 of 6 villagers to dig raises dig output ≥2× baseline within 2 game days; "keep 30 stone" holds within ±20% by day 5; a tester names the true cause of 18 of 20 staged stalls from the Why panel |
| 3 | Inhabitants develop through actual activities | After work equal to 15% of adult lifespan in one skill, effect is ≥25% above a control; place/mine grind bot earns <5% of baseline XP; one-skill bot ≤70% of a 4-skill rotation's XP per work-hour; breed-best bot ≤1.15× output per food after 30 generations |
| 4 | Construction supports creativity and automation | A player-built workshop is recognised ≤1 s after the last piece (≤1 ms p99 compute); a saved Blueprint stamped ×3 is built by autonomous builders at ≥90% fidelity within 3 game days given materials, with zero self-walled workers in 100 stamps; ≥3 testers build ≥3 distinct qualifying layouts |
| 5 | Exploration produces meaningful discoveries | A delegated expedition finds a non-surface resource within 2 game days on ≥80% of seeds and records ≥1 Curiosity; possessed runs show ≥30% fewer losses than delegated while delegated still reaches the target on ≥70% of runs |
| 6 | Technological advancement changes available capabilities | The discovery occurs by 1.0 game year under the competent bot on ≥80% of seeds and <10% under the brute-force bot at 2× materials before 0.5 year; stuck rate <2%; after discovery ≥1 new job kind appears on the board that never appeared before, with no flat percentage bonus |
| 7 | Direct and autonomous control share the same simulation | Possessed output for the same villager 1.0-1.25× the delegated output; identical Action tick counts for identical state; a possession session replays to identical state hashes every 100 ticks for 100k ticks |

Slice ordering follows the milestones (§26): the harness and determinism come first, then world/pathing, then villagers/job board, so property 1 can be measured before any content is added.

---

## 26. Development Milestones

Dependency-aware. Effort ranges are **ASSUMPTION** allocations of R26's 7-12 FTE-month MVP band at placeholder-grade art; they are relative sizes, not promises (D 7.3 and the design-side review both flag them as wide). One FTE-month ≈ 160 productive hours; a solo/duo hobbyist is ~0.4-0.6 FTE, so the calendar is roughly twice the FTE figure or more.

```
M0 Harness & determinism
   └─> M1 Grid / terrain / pathing / camera
          └─> M2 Villagers / needs / job board
                 ├─> M3 Construction / rooms / blueprints ─┐
                 └─> M4 Skills / genetics ─────────────────┤
                                                           ├─> M5 Discovery
                 M2 ───────────────────────────────────────┴─> M6 Possession / hazards / exploration
                                                                  └─> M7 Slice polish and demonstration
```
(M3 and M4 can proceed in parallel after M2; M5 needs both; M6 needs M2's Action runner and M1's grid, and can start before M5 ends.)

| M | Name | Builds | Depends | Risk prototypes retired | Exit criteria (all must hold) | FTE-mo |
|---|---|---|---|---|---|---|
| **M0** | Harness & determinism | Headless sim shell; fixed tick (20 Hz); named counter-based RNG streams; command log; event stream; state hash; seed + chunk-delta save skeleton; sweep/fixture/save-roundtrip harness ported as pattern; lint bans (`Math.random`, wall clock, transcendental in rules) | none | P4 | Replay of a 100k-tick scripted session yields identical hash every 100 ticks twice on one build and (documented) on a second OS/engine; save → restore → continue matches the original tick-for-tick over 5 game days; CI fails on a seeded banned-API commit | 0.5-1 |
| **M1** | Grid / terrain / pathing / camera | 128×128×24 chunked grid, ~12 materials, worldgen (seed-pure), caves; mine/place cells with `virgin` bit; stairs/ramps; region graph + HPA*; z-sliced 3/4 renderer with cutaway; world-representation comparison on the slice | M0 | P1 (pathing/perf), P5 (layered 2D vs 3D), P6 (readability), P16 (map size) | 100 agents moving+hauling ≤6 ms/tick p95, none stuck >30 s; layered-vs-3D verdict recorded; 5 of 5 testers find stairs and distinguish roof from floor within 60 s; time-to-first-landmark measured and map size set | 1-2 |
| **M2** | Villagers / needs / job board | Species data table (slime); needs (hunger, thirst, energy, leisure/`strain`); aging, death, Gravestone; Action/ActionRunner/Controller; job board with reservations; Orders, Crews, Standing orders; Blockers + Why panel; starter shelters and the autonomy band | M1 | P3 (shared runner), P9 (order/need thrash; unattended survival), P10 (Why truthful) | Property 1 unattended metric passes on the grey-box; <4 job switches per villager-day; starving village told to build still eats (≥95% survive); 18/20 staged stalls diagnosable from Why; same-Action tick equality (P3) | 1-2 |
| **M3** | Construction / rooms / blueprints | Freeform cell placement tools, construction sites, material delivery, supports-first order; hybrid Room detection and Purpose checklist; one Purpose (workshop) with heat/enclosure context; Blueprint capture/rotate/ghost/stamp ×N; class substitution | M2 | P2 (rooms + heat), P7 (blueprints) | Workshop recognised ≤1 s, ≤1 ms p99; heat context matches hand-computed in ≥28/30 builds; stamped ×3 built at ≥90% fidelity, no self-walled worker in 100 stamps; partial cancel recovers materials | 1-1.5 |
| **M4** | Skills / genetics | Genome (9 traits, `breed` + `settle` carried over); convex trait upkeep; clone limit; 3 skills with challenge-matched XP, `rested`, virgin rule; Teach and learn-by-proximity; harness exploit bots (grind, breed-best, one-skill) | M2 | P13 (exploit bots), P12-part (lifespan vs craft transmission) | Grind bot <5% XP; one-skill bot ≤70% of rotation; breed-best ≤1.15× output/food at 30 gens; skill effect ≥25% above control at 15% of adult lifespan | 0.5-1 |
| **M5** | Discovery | Phenomena table; Witness and Tinker; Almanac, Curiosities, near-miss hints; Chronicle "firsts"; evidence-based rediscovery; per-seed solvability validator; the one discovery chain with ≥2 routes | M3, M4 | P11 (chain, brute force, no soft-lock), P12 (forget/recover), P15 (Almanac comprehension) | Property 6 metrics pass; stuck rate <2% over 20 seeds × 50 game years; ≥4 of 5 testers state why a craft is unavailable and one fix; forget/recover loop completes in hours, not days | 1-1.5 |
| **M6** | Possession / hazards / exploration | Possession controller (Move/Act, follow camera, click-to-move option); Divine inspiration + Steadfast; area-designated mining; expeditions (intent, provisions, recall); cold, cave-in, bad-air, one wounding fauna; torches/light radius; feedback (hit pause, sound) | M2 (runner), M1 (grid); soft on M5 | P8 (possession feel + buff perceptible) | Property 7 passes; possessed ≤1.25× delegated output; possessed cave-death rate ≥0.5× AI's; testers rate possession ≥3.5/5 and delegated expedition still succeeds ≥70%; property 5 passes | 1-2 |
| **M7** | Slice polish & demonstration | UI and tooltip pass, lineage mark and CVD-safe icons, remap screen, chronicle digest, art/audio at placeholder-plus; fixtures; the demonstration script | M3-M6 | none new | All seven properties demonstrated in one recorded 2-hour session on a fresh seed; accessibility checks of §19 pass (CVD sort ≥11/12); no open P0 bugs; harness green | 0.5-1 |

Sum of ranges: about 6.5-12 FTE-months, consistent with R26. The ranges include rolling playtest/tuning inside each milestone but **not** polished art/audio, which is outside the slice (R26's 7-12 treated as the total for a placeholder-grade slice; full art is a separate decision, OD-15).

**Gates.** The engine decision (OD-06) is taken after M1's P1/P5/P6 *plus* a UI spike, i.e. before M2 is written in earnest. If P5 shows layered 2D covers all slice scenarios at <50% of the 3D implementation, the world-representation default (R3) is revisited before M1 ends. P14 (LOD calibration) is scheduled **after M7**, not on the slice's critical path.

---

## 27. Scope and Risk Register

The full register (ids, likelihood, impact, early signal, mitigation, smallest validating prototype P#) and the world-representation evaluation are in **docs/TECHNICAL_RISKS.md**. Top risks:

| Rank | Risk | L | I | Early signal | Mitigation (one line) | Proto |
|---|---|---|---|---|---|---|
| 1 | **Scope**: ten pillars at equal fidelity for a solo/duo team; the first planet is Kenshi/Songs-of-Syx scale (30-60 FTE-months) | H | H | Milestones slip two in a row; content added before the harness | Hold the cuts in RESOLUTION; M0 first; slice before content; each new feature pays for itself with a bot test | all |
| 2 | **Emergent discovery is a silent three-part system** (context, knowledge, capability) and the one thing no comparable game has shipped well | M-H | H | Chain stuck in >2% of seeds; testers cannot say why a craft is unavailable | Single-layer knowledge (R10); 1 chain; solvability validator; Almanac + trace log | P11, P12, P15 |
| 3 | **Possession is the hook and the weakest-bounded balance risk**; its real floor is 3.5-6.5 FTE-months | M | H | Testers do not possess, or possession is mandatory | Minimal kit; Steadfast, not output; bot band; feel prototype | P8, P3 |
| 4 | **Pathfinding / perf cliff** in a 3D grid | M | H | p95 tick over 6 ms at 100 agents | Region graph + HPA*; staggering; smaller map | P1 |
| 5 | **Freeform building UX and room recognition** (ghosts, rotation, undo, validation, self-enclosure) | H | M-H | Testers fight the tool; heat context disagrees with intuition | Hybrid Rooms with checklist; supports-first; exit reserved until last cell | P2, P7 |
| 6 | **Slice readability** of z-slice 3/4 oblique | M | H | Testers confuse floor/roof/levels | Cutaway rules; ghost of level above; fall back to top-down | P6 |
| 7 | **Determinism erosion** | M-H | M | CI hash mismatch | Lint, named streams, command log | P4 |
| 8 | **Autonomy band wrong**: stagnation or helplessness | M | H | Unattended survival <90% or >20% self-start new types | Tune the band with the sweep; Concerns panel | P9 |
| 9 | **Genetics and skills feel arbitrary or exploitable** | M | M | Breed-best bot >1.15×; testers cannot tell individuals apart | Convex upkeep; noisy phenotype; stories over numbers | P13 |
| 10 | **Reuse trap** and slime-village drift | M | M | Ported code drags coupling | Treat as spec; port `settle`/breed/tests only | — |

**Scope killers in order** (D 7.4): full 3D voxels + first-person + billboards; multiple species/paths/cultures at full fidelity; hand-authored emergent tech at scale; freeform building UX; combat/possession polish; space/multiplayer; balance without bots. Each is cut or gated by an R# ruling.

---

## 28. Unresolved Design Questions

The full list (question, options, default, what evidence would change it, owner, blocking milestone) is **docs/OPEN_DECISIONS.md**. Summary of the most consequential:

| Id | Question | Recommended default | Owner | Blocks |
|---|---|---|---|---|
| OD-01 | Collective belief (Ork-style): ship, cut, or keep as a hook | Experimental, deferred; rules kept | Author | none (post-MVP) |
| OD-02 | Offline progression (R22) | No offline catch-up in MVP; chronicle digest | Director | M7 (digest copy) |
| OD-03 | Camera: second view (first-person, billboard) | One 3/4 camera; second renderer post-MVP | Author | M1 |
| OD-04 | Lifespan anchor (R1) | ~10 real hours at 1× (8-12) | Director | M2/M4 |
| OD-05 | World representation (R3) | 3D z-level grid | Director | M1 |
| OD-06 | Engine | Not chosen; criteria E1-E12 | Director | M2 |
| OD-07 | Multiplayer model | Snapshot visiting first | Author | post-M7 |
| OD-08 | Dorfs / species #2 | Slimes only for the first planet | Author | none |
| OD-09 | Drones as late sci-fi (author vs octoshrimpy) | No (D3) | Author | none |
| OD-10 | Steward | Post-MVP option | Director | none |
| OD-11 | Game title | Working title "Slime / Dorf Village" | Author | marketing only |
| OD-12 | Save-scum / ironman | Allow reload + optional autosave-only mode | Author | M2 |
| OD-13 | Possession buff and speed cap | +10% speed/+15% XP/Steadfast; 2× cap while possessed | Director | M6 |
| OD-14 | Map size / population ceiling | 128×128×24; 6-60 design, ~100 ceiling | Director | M1 |

Twenty-six further decisions (OD-15 to OD-40: hidden genotype, clone limit, mate choice, skill constants, knowledge depth, per-seed perturbation, hostile design, determinism level, save migration, tick rate, lighting, combat depth, art fidelity, accessibility scope and others) are in the full document with defaults.
