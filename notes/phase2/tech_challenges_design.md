# Phase 2: Tech/Feasibility Challenge of Design Reports A (gameplay) and B (world/progression)
Reviewer: Claude Sonnet filling the "Codex Luna" tech-critic role. Adversarial by assignment.
Read: CONTEXT_BRIEF, A, B in full; C and D for the technical model and cost bands; spot-checked slime-village
(`slime/sim/`: jobs.js 3521 lines, lore.js 928, ai.js 4543; `findJob` jobs.js:1794; `share`/`gossip` lore.js:514/580;
`holdFor` lore.js:79). Labels: VERIFIED = seen in code/docs; ASSUMPTION = my estimate; all costs are FTE-months
on C/D's scale (D 7.3: whole first planet = 30-60 FTE-months, prototype 7-12).

Bottom line up front:
- A is mostly sound because it reduces everything to one scoring function. Its risks are UI weight and a handful
  of tuning-coupled mechanics (order weight, standing-order pull, Steward), not architecture.
- B is the riskier report. The Phenomenon->Notion->Capability loop is elegant on paper but is three coupled
  systems (physics context, per-head knowledge, derived capability) whose failure modes are all "silent". It
  is the single largest unbounded content+debug cost in the project, and it is the one thing no comparable
  game has shipped well. It needs a shrunk first form (section 2.6) and a hard prototype gate.
- Both reports under-cost the same thing: each "emergent" feature quietly requires a *new simulation substrate*
  (heat/enclosure context; skills; sight-based witnessing; a destructible 3D world) that is owned by someone else
  and priced in neither report.

---------------------------------------------------------------------------------------------------
## 1. Mechanic ledger: data, compute, build cost, pillar fit

Pillars: DEV = develop civ, DISC = discover world, CREA = express creativity, STORY = emergent stories.
Cost is ASSUMPTION, FTE-months, excluding art, including basic UI. "Keep/Shrink/Cut" is my verdict.

| # | Mechanic (source) | Data / compute | Cost | Pillars | Verdict |
|---|---|---|---|---|---|
| A1 | Everything is a board job; orders = heavy weight (A rec 1-2) | reuses `findJob` scoring; one multiplier; urgency curve | 0.5-1 | DEV | KEEP (core) |
| A2 | Direct order + status line | per-job reason string from every branch of a 3.5k-line `jobs.js` | 1-1.5 (the string coverage is the cost) | DEV, STORY | KEEP |
| A3 | Crews (named set + task + provisions) | new entity + membership + refill rule + UI | 1-2 | DEV | SHRINK (see 3.2) |
| A4 | Standing orders ("keep N") w/ shortfall pull | stock counters, pull fn, "why behind" | 1-2 | DEV | KEEP, one type only at first |
| A5 | Backward-chained "keep 20 bread" | GOAP-ish planner, sub-demand spawn | 2-4 (A itself says SPECULATION) | DEV | CUT from MVP (3.3) |
| A6 | Ledger auto-promotion suggestions | repeat-order detector, dismiss memory | 0.3-0.5 | none strong | CUT (3.4) |
| A7 | Steward stance (village proposes builds as vetoable ghosts) | reuses `wantedBuilding`/`findBuildSpot`, ghost UI | 1-2 | DEV | KEEP but it is not a stance, it is the default (3.5) |
| A8 | Stewards as NPC managers (later) | role + district order scoping + poor-steward model | 2-4 | DEV | DEFER, likely cut |
| A9 | Why panel | requires every blocker to be reified as data | 1-2 | all | KEEP (most valuable single feature) |
| A10 | Concerns panel | derived from existing sim aggregates | 0.3 | DEV | KEEP |
| A11 | Possession (buff, vitals, lapse, permadeath) | executor shared w/ AI; controls; camera; collision; combat | 1-2 + combat 1-3 | DISC, STORY | KEEP, with a hard "what must exist" floor (4) |
| A12 | Delegated expedition (crew+intent+provisions+recall) | pathing into unknown, recall predicates, report generator | 1.5-3 | DISC | KEEP, but recall rules shrink to 2 (3.6) |
| A13 | Oblique billboard camera + cutaway + layer-peel + rotation | see section 5 | 3-6 | all (indirectly) | SHRINK to C's top-down slice |
| A14 | Stance panel (six focuses + Guard) | existing weights | 0.2 | DEV | KEEP (nearly free) |
| A15 | Notables / star list | sort + flag | 0.2 | STORY | KEEP |
| A16 | Control groups, idle pins | UI | 0.3 | DEV | KEEP (cheap, known good) |
| B1 | Phenomenon data + context compute (heat/enclosure/draft) | per-station geometric+material context; ~110-130 phenomena at full scope | 3-6 for substrate + content | DEV, DISC | SHRINK hard (2.1) |
| B2 | Witnessing -> notion | per-fire event; sightOf query on every phenomenon firing | 1-1.5 | STORY | KEEP in reduced form |
| B3 | `tinker` job w/ candidate sampling from "what's in reach" | combinatorial candidate gen each time a slime goes idle | 1.5-3 | DISC, STORY | SHRINK (2.2) |
| B4 | Notion decay / practice / per-kind rehearsal | per-head per-notion state update | 0.5 | STORY | SHRINK |
| B5 | Capability = holders >= need, grace period, loss | derived flag, warnings | 0.5-1 | DEV, STORY | KEEP concept, change rule (2.4) |
| B6 | Skills (know-how) per verb 0..1 | per-slime array, XP rule | counted in D (0.8-1.7) | DEV, STORY | KEEP (needed by A too) |
| B7 | Skills AND notions as two parallel stores | doubles transmission code | +1 | none distinct | MERGE (2.5) |
| B8 | Observation learning, conversation transfer, apprenticeship | reuses `sightOf`/`share` | 1.5-3 | STORY, DEV | KEEP observation+proximity only; apprenticeship = implicit |
| B9 | Documents + library | item type holding notions, decay, consult job | 1-2 | STORY | DEFER (D also cuts) |
| B10 | Culture tallies + ~10 leanings + ~8 traditions | EMA per tag per village | 0.5-1 | STORY | DEFER; mostly cosmetic (B admits risk 8) |
| B11 | Almanac/Curiosities/Gap hints UI | derived from unresolved stimuli and near-misses | 1-2 | DEV, DISC | KEEP: it is the transparency layer, not optional |
| B12 | Era labels computed from capabilities | trivial | 0.1 | STORY | KEEP |
| B13 | Husbandry/biotech light path | 25-35 phenomena + domestication traits | 2-4 | DEV, CREA | DEFER past slice; keep as first post-slice path |
| B14 | Ancient sites + relics hinting notions | 6 templates, relic items, examine job | 1-2 | DISC, STORY | KEEP small (2 templates) |
| B15 | Pre-history sim at worldgen | headless run at worldgen | 1-2 + worldgen time | STORY | DEFER (B agrees) |
| B16 | Splinter bands carry heads | pass subset on founding | 0.2 | STORY | KEEP (cheapest knowledge-travel in game) |
| B17 | Serendipity floor (accident after 2 seasons) | timer on (inputs, context) co-occurrence | 0.3 | anti-lock | KEEP but re-specify (2.3) |
| B18 | Per-seed property perturbation (D 2.5) | seeded jitter | 0.2 + test multiplier | DISC | DEFER; multiplies validation x seeds |

Duplications spotted:
- A's "Steward stance" (veto-able ghost proposals) and A's "Steward NPC" and A's Stance panel are three things
  with overlapping names. Collapse to: village auto-proposes builds (default), Stance weights (existing), no NPC steward.
- A's expedition `recall` and B's `Send explorers` and slime-village's `scout` job: one concept, three specs.
- A's skill-by-use and B's skills and D's skill XP: one system, three formulas. A pins buff at +25% XP; D says
  "no XP bonus, +15% speed"; B says witness x1.5 when possessed. Three different possession buffs across A/B/D.
  Pick exactly one (see 4.4).
- B's `pressure(tag)` EMA duplicates the existing demand vector. Good, but B then also maintains a *separate* tag
  vocabulary (keep_food, tool_edge, fuel...) that does not map 1:1 to the demand vector's keys. That mapping table is
  unwritten work and the likeliest place pressure silently reads zero.
- Almanac "dead ends / negative notions" and the `tinker` candidate filter are the same data; fine, but only if one store.

---------------------------------------------------------------------------------------------------
## 2. B's Phenomenon -> Notion -> Capability system

### 2.1 Is it implementable?
Yes at slice scale, no at B's stated full scale without a different authoring approach.
Hidden substrate B takes for granted (none of it is in slime-village; VERIFIED absent per B's own audit):
1. **Work-site context**: `heat = fuel.heat_value x draft x insulation`, `enclosed`, `moisture`, `duration`. This is
   a thermal/enclosure model per station. In a freeform-built world (C 2.7) "enclosed" depends on room recognition,
   "draft" on wind direction and openings, "insulation" on wall materials. That is a mini-fluid-sim by another name.
   ASSUMPTION: 2-4 FTE-months and it will leak. Every player-built kiln is a physics experiment the designer didn't see.
2. **Event-driven phenomenon matching**: "fires whenever conditions co-occur in the simulation" means every item
   sitting in a region must be matched against phenomena each time context changes. Cheap with an index
   (phenomena keyed by input tag), but needs a *tracked duration per (item-stack, context)* — i.e. a timer on
   every heated thing. Where are those timers stored, saved, and deterministic? Unspecified.
3. **Sight-based witnessing** per firing: `sightOf` is a fog query. Accidents happen at hearths with several
   slimes nearby; fine. But a phenomenon that fires every tick of every bonfire must be deduped to "first fire per
   (phenomenon, site) per witness per N hours" or it spams. Unspecified.
4. **Item properties**: B assumes materials carry props and "observed properties" (what a slime perceives vs real).
   The perceived-property layer (so relevance(pressure, observed props) can be computed without leaking output tags)
   is a second hand-authored mapping per material. That is easy to get wrong in the direction of leaking the answer.

### 2.2 Content authoring cost per discovery
B: "~1 data row per phenomenon, ~0.5 recipe, ~20% need icon/building". That number counts rows, not the true cost.
Per discovery that is *interesting* (not just "iron smelts"), the real checklist:
- phenomenon row (inputs by tag/range, context, salience, serves, danger)  — 15 min
- the material rows it outputs and their perceived-property text           — 30 min
- capability row, `need`, unlock list, era tag                              — 20 min
- near-miss definition so a gap hint exists (which context axis, what words) — 30 min
- accident feasibility: can this plausibly fire unattended? where? (else only `tinker` reaches it) — 30 min
- reachability: is each input obtainable on this planet from the previous state? — automated, but each failure is a
  debugging session — 1-2 h average
- tuning `salience`, `danger`, `need`, decay kind so the cadence lands in B's "4-6 days under pressure" — 1-3 h of
  headless runs, per discovery, because cadence depends on every *other* discovery's candidate list
- art/icon/stringtable                                                       — 1-2 h
ASSUMPTION: 6-10 hours per phenomenon of designer time, not 1 row. At 110-130 phenomena that is 700-1300 hours
(~4-8 FTE-months), consistent with D's "each discovery is a hand-tuned content item; quantity kills".
Cadence interaction is the nasty part: adding phenomenon #30 enlarges the candidate list for every `tinker`
and *slows* discovery of the others (B's 14-candidate math). Content is not independent; the tuning is global.

### 2.3 Soft-lock analysis
B claims "nothing is undiscoverable, only delayed" via the 2-season accident floor. Findings:
1. **Accident floor is not a proof, it is a hope.** It fires "if all inputs and the context have co-existed for
   2 seasons". But *co-existence of inputs and context* is exactly what may never happen: nobody builds a
   heat-4 kiln because nobody knows it is needed; malachite is never carried near a heat-4 site because no one
   holds the notion that makes them try. The floor only covers the last link (inputs+context present). It does not
   cover the chain. Real soft-lock example: SMELT_COPPER needs heat>=4 which needs a clay-lined kiln (POTTERY) on a
   windy ridge with charcoal (SMOULDER_WOOD accident, which needs a *covered cooking pit* event). If the player
   never builds a covered pit, charcoal is never found, heat 4 is unreachable, copper never smelts.
   B's `tinker` is supposed to cover this, but `tinker` samples combos "from what is physically in reach", and
   charcoal is not in reach until it exists. Circular.
   Fix: the accident floor must *place the missing enabler*, not wait for it. Concretely: when pressure(tag)>0.3 for
   two seasons and a phenomenon serves that tag, the *director* spawns the nearest precondition as a world event
   (a lightning-struck stump smoulders; a rock face weeps copper stain). That is D's pacing director, not a timer.
2. **Reachability sweep is necessary but checks the wrong graph.** B: "for every capability, a path exists from the
   starting state using only phenomena that can fire". Existence of a path != the village can *stumble on it*. Need a
   second metric: P(discovered within 20 game-years | bot player at various competence levels), D's 20 seeds x 50
   years harness. B and D agree on the harness; B's sweep alone gives false confidence.
3. **Planet-dependent locks**: ore absent on the island is raised by D with a regenerate rule. Keep. Add: every
   capability must have >= 2 distinct *input* routes for the first 20 discoveries or the island is rejected.
4. **Holder-count lock**: need=3 for metallurgy; if population < 3 skilled adults for one generation, capability
   drops and *the knowledge to rebuild it is also gone* (notion decay). Combined with permadeath that is a death
   spiral: lose smith -> lose capability -> fewer tools -> more deaths. See 2.4.
5. **Negative notions as a lock**: "tried X with Y at heat 3, nothing" suppresses retries. If the context later
   changes (a better kiln) the negative notion blocks the retry. Negative notions must be keyed on the *context
   level attempted* and invalidated when context exceeds it.

### 2.4 "Capability lost when holders die": fun or frustrating?
Fun in the abstract; frustrating as specified, for four reasons.
1. **Binary and delayed**: a capability is a flag that flips after a one-season grace. The player sees a warning
   "last holder" but the thing they care about (can I still make iron tools?) is only indirectly the flag.
2. **Rule conflates having the notion with being able to do the work.** A village with 5 competent smiths (skill 0.8)
   still loses SMELT if three of them were absent at "need=3 notion holders >=0.5" because notion strength decays
   unrehearsed and the smiths' notion strength was not rehearsed *as notion*. Skill and notion must not be separately
   decayable for the same craft. (This is the strongest argument for merging them, 2.5.)
3. **Perverse incentive**: players will hoard "protect holders" micromanagement: keep the 3 metal people in a bunker. Antithetical to autonomy.
4. **Permadeath + need(C)=3 + 100-day lifespan** compounds the death spiral above. Lifespan arithmetic in B's
   risk 4 is the whole feasibility question and is deferred to "tuning".
Replace "capability is revoked" with **graded competence**: production quality/speed and *whether a new apprentice
can start* scale with `sum of holders' skills` (soft), never a hard off switch for existing infrastructure.
Loss still *happens* visibly: the forge sits cold because nobody can run it; the chronicle says "the last smith
died". A building that nobody can operate is exactly as strong a story as a revoked flag, with no state flag.
Keep one hard rule only: a recipe/verb requires >=1 living person with skill >= threshold *at the moment the job is
chosen* (a per-job check, not a derived settlement flag). That is trivially debuggable and needs no grace timer.

### 2.5 Per-villager notion storage: does it scale?
Raw numbers (ASSUMPTION): 300 villagers x 130 notions x (id 2B + strength 1B + last_rehearsed 4B) ~ 270 KB. Memory is fine.
CPU is fine if decay is staggered (C's `(tick+id)%N`) and lazy (store strength + timestamp, compute decay on read).
The real scaling issues are not size:
- **Save/determinism**: sparse maps per head iterated in insertion order cause hash drift (C 2.10). Use sorted notion
  ids or a dense typed array per head (130 floats). Dense is simpler; 300 x 130 is nothing.
- **Gossip budget**: lore.js `share` already moves "best N patches found without sorting"; adding notions as a second
  class competing for the same budget will starve geography gossip or notions depending on weights. VERIFIED that
  `budget` is a single count (lore.js:514-531). Needs a split budget.
- **Observation learning** "per hour of sight" for every (learner, practitioner) pair in sight is O(slimes x visible
  practitioners). Cap: one learning target per learner (pick the nearest practitioner of the learner's most-wanted verb).
- **Capability derivation** each tick = holders scan across villagers per capability = 300 x 40 caps = 12k checks;
  fine at 1 Hz, and trivially maintained incrementally on change events.
Conclusion: scales fine. The cost is *debuggability* of knowledge state, not performance (see 2.7).

### 2.6 Is it transparent enough? Debuggable?
Player transparency: B's almanac/curiosities/gap hints are the right ideas, but:
- **Gap hints reveal the answer by elimination.** "Green rock changes at a higher heat than your best fire reaches
  (level 3 of ~4)" is a quest log in disguise. Fine (it is the fun nudge) but it means the player doesn't need to
  reason about physics; they read the hint. Make hints appear only after N failures, and be directional only.
- **Stuck state visibility**: if nothing is happening, the player needs "why is no one experimenting?" (no slime
  has itch; no candidates in reach; none have the free time; hazard-averse). That is an A-style Why panel entry for
  discovery. B does not specify it. Required.
- **Strength words** (sure/fairly sure/half-remembered) fine.
Developer debuggability: a dozen interacting stochastic subsystems (witness probability x itch x candidate weight x
context match x accident floor x spread x decay). When "nobody ever discovered pottery in seed 4812", the cause could
be any of them. Required tooling, not optional: a **discovery trace log** per phenomenon (candidate-generated count,
attempts, near-misses, witnesses, strengths over time) and a deterministic "force-fire" debug command. Budget 1 FTE-month.

### 2.7 Simplified form that preserves the pillar (recommended)
Same philosophy, much less machinery. I call it **Observed Practice**:
1. Drop the separate notion layer. A slime's *skill[verb]* (0..1) is the only knowledge store. A phenomenon is a recipe
   with a context requirement; "knowing it" = having non-zero skill in its verb *and* having seen it work (a boolean
   `seen[phenomenon]` set per village, not per head, for the almanac; per head only skill).
2. **Discovery** stays emergent: a recipe becomes *known to the village* the first time its physics fires in sight of
   anyone (accident) or a `tinker` job hits it. That sets `village.seen[p]`, credits the finder in the chronicle.
3. **Capability** = a living person with skill >= 0.3 in the needed verb at job-choice time, plus enablers.
   No grace timers, no derived flags. Loss = nobody has the skill; visible as "nobody can run the forge".
4. Teaching = observation + proximity growth of *skill* (B8, already designed). The knowledge-travel stories
   (splinter bands, apprentices, dying smith) all survive.
5. `tinker` candidates restricted to (materials with `itch`/novelty) x (contexts built in village) x (small verb set),
   hard cap 8 candidates, each attempt consumes stock. Keep pressure bias as a weight, but compute it from the
   *existing demand vector keys* only (no new tag vocabulary), via a small `serves -> demandKey` table.
6. Director-assisted floor (2.3 fix 1) instead of a time-based accident.
What it loses: partial-knowledge states ("0.37 notion, can't practice yet") and the stereotypical
"half-remembered" tier. What it keeps: the physical-conditions cause, accidents, permadeath loss, name-credited
firsts, apprenticeship, gossip of "it can be done". Cost: ~40% of B's.
If the author insists on notion strengths, keep them but **only for the first-tier cadence**: a single per-village
`knowledge[p]` in 0..1 that rises with sightings and decays with disuse. Still not per head. The per-head layer is the
part with no testable payoff over per-head skill.

---------------------------------------------------------------------------------------------------
## 3. A's command layer

### 3.1 Overall structure: good, with one structural trap
"Everything is a job scored by one function" is correct and cheap. The trap is *scale of tuning coupling*: the
whole command model sits on three magic numbers (ORDER_BASE ~3x, CREW_BOOST ~2x, urgency curve vs ORDER_BASE) plus
the standing-order pull. All four interact with slime-village's existing `demand x affinity x proximity x belief x temper`
product. A multiplicative score with five factors is *very* sensitive: a `belief` or `temper` of 0.3 can erase a 3x
ORDER_BASE. Players will see "I ordered, nobody came" for reasons the status line can't explain unless it reports
the dominant factor. VERIFIED partial: `findJob` uses these factors (jobs.js:1794 region; A's own readout comment).
Mitigation: commanded jobs bypass `temper`/`belief`/`proximity` entirely (they are commitments, not preferences) and
only compete with *needs*. That reduces the interaction surface to ORDER_BASE vs urgency curve. Say so explicitly.

### 3.2 Crews
Failure modes:
- **Membership churn**: death, sleep, injury, "fill to 5" refill by whom? Auto-refill steals villagers from other
  crews/jobs; a loop of two crews each refilling from the other = thrash. Need a rule: refill draws only from
  *unassigned* villagers, never from other crews.
- **Crew task vs personal need vs order**: three layers fight (crew boost 2x, order 3x, urgency). Test matrix is
  3x3. Simplify: a crew is not a scored layer; it is a **named group to which a direct order is issued** ("these 5:
  chop"). The order lives on each member as an ordinary commanded job. Crews then add only naming + selection
  + stall summary UI. Cost drops ~60%, and CREW_BOOST disappears.
- **Provisions** (food/torch per head) belong to expeditions, not crews. Keep them off the crew object.

### 3.3 Standing orders and backward chaining
- Keep-N pull as a continuous shortfall function is fine. Failure modes:
  - **Oscillation near target**: pull fades to zero at N, villagers drop it, stock falls below N from consumption,
    pull returns; you get a tidal wave of tasking at the threshold (workers switching on/off every few seconds).
    Fix: hysteresis band (start at N, stop at N+10%) and minimum job duration. A's "no threshold" principle
    (anti-hard-threshold) conflicts with this, but a *smooth pull plus a lock-in until job done* is the standard answer:
    once a villager takes a gather job they finish the trip.
  - **Starvation of orders**: standing order pull is additive to village demand; if food/shelter demand is high,
    keep-lumber never wins. A addresses this ("behind by 38; 3 busy with food"). Good; but ensure the
    *explanation is computed from the actual scoring*, not a parallel heuristic, or it will lie.
  - **Dependency starvation**: "keep 20 planks" needs logs and a sawyer slot. Without backward chaining the order
    shows "stalled: no logs" and the player must order logs too: a micromanagement trap but an honest one.
  - **Hoard exploits**: "keep 10000 lumber" (A's risk 4). Cap N at a multiple of storage capacity and per-capita.
- Backward chaining (A5): this is a planner. Complexity: recipe graph depth, shared sub-demands, cycle detection, partial
  fulfilment accounting, UI to show the chain. And it overlaps B's phenomena table *exactly* (outputs <- inputs).
  Recommendation: implement the planner once, from the phenomenon/recipe table, at depth 1 only: "keep 20 bread"
  adds demand for flour and an oven slot directly; deeper chains emerge through the *normal demand vector* (flour
  low -> grain demand rises). Emergent multi-hop beats planned multi-hop and is already how the board works.
- Testability: needs the "scripted player" bot A already mentions. Seed it with 10 orders, sweep for stall rate,
  oscillation frequency (job switches per villager-day), and unmet-order age. Metrics: switches/villager-day < 4,
  median unmet-order age < 1 game day for a fed village. That harness is worth ~1 FTE-month and is the
  prerequisite for believing any of A's numbers.

### 3.4 Ledger auto-promotion
Offers a standing order after the same order is issued three times. Costs a detector, dismiss-memory, UI, and
persistent nagging risk. It is also *exactly* the "suggestion nobody asked for" notification pattern the brief
warns about. The purpose it serves (reducing repetitive orders) is better served by making orders that are
inherently durable: orders default to "do until done, then re-offer"? No: simpler: **every gather order is
created as "keep N" by default** with N editable. Then no promotion is needed. CUT A6.

### 3.5 Steward stance / Steward NPC
The "Steward stance" (village proposes buildings as vetoable ghosts) is not a stance, it is a default autonomy level.
Failure modes: proposals flood the screen; proposals conflict with the player's own plans; veto cost is attention.
Cheaper rule: autonomy builds only *survival-critical* structures (beds for sleeping-rough, storage when full, a
fire) using the existing `wantedBuilding`, shown as ordinary jobs not ghosts, and nothing else. Everything beyond is
a player order or a blueprint. This matches D's "no new building types started by villagers; keep-N orders".
Steward NPC (A8): another director-of-directors with its own failure model (a poor steward under-delivers: by what
formula? how does the player tell steward error from board error?). That is a second layer of "why didn't X happen"
on top of the first. DEFER past first planet; likely cut. If pillar 7 needs a late-game scale-up, "district standing
orders" (an order scoped to a building group) delivers it without a person-shaped abstraction.

### 3.6 Expeditions
Recall predicates `pack full | member <40% hp | provisions half | threat sighted` = four conditions evaluated per
member per tick, with resulting group behavior (does the whole crew turn back when one is hurt? who carries them?).
That is a small behavior-tree with failure cases (split party, wounded left behind, narrow tunnel pathing in a party).
Simplify to two: "turn back at half provisions" and "turn back if anyone drops below half health". Pack-full is just
the standard haul-home behaviour. Threat-sighted = ordinary flee behaviour.
Mine auto-exploration ("dig deeper / seek materials") is the single most expensive item here: needs a vein
heuristic, shaft shoring/supports?, hazard detection, and pathing back. ASSUMPTION 2-3 FTE-months alone. It is AGREED
canon, so keep, but as the *only* expedition type in the slice ("dig toward material X to depth N"), not
a general intent system.

### 3.7 Why panel
This is the highest-value item in A and the one with the nastiest cost: it requires every decision branch in the
board to emit a machine-readable *cause chain*, not a string. If done as strings sprinkled through `jobs.js` (3.5k
lines), they drift out of sync with the logic and lie, which is worse than no panel. Required design: each
`findJob` branch returns `{job, score, blockers[]}` and blocker kinds are an enum (no_tool, no_path, no_stock,
no_free_hands, need_override, unknown_material). Why panel = render the enum. Build this *first*, before more
features, since it doubles as the debugging tool for B's discovery trace. Cost 1.5-2.

---------------------------------------------------------------------------------------------------
## 4. Possession: what must exist for it to be fun, and is that small enough

### 4.1 Floor of requirements (without these possession is a walking simulator)
1. **Responsive character-relative movement** on the destructible world: collision, stepping up a block, ladders/
   stairs, falling. In a grid sim moved by a 20 Hz tick, input latency of 50 ms and cell-snapped motion feels bad.
   Needs sub-cell render interpolation and a continuous-position layer or a convincing facsimile. ASSUMPTION 1 FTE-month
   (C P3 prototype covers the Action abstraction, not the feel).
2. **At least three verbs that are more fun in hand than delegated**: dig/mine (aimed block choice), melee, build-place.
   All three must be Actions already (C 2.4).
3. **Something that can hurt you and that you can read**: otherwise "dodge" and "fight" are empty. Minimum hazard set:
   2 hostile creatures with telegraphed attacks, 1 environmental hazard (cave-in or gas), fall damage. Telegraphs mean animation.
4. **Feedback**: hit pause, screen shake, sound, damage numbers or bars. Cheap but invisible until missing.
5. **Camera**: close follow, collision-aware (not clipped by roofs); input remap.
6. **Reading the unknown**: light/fog radius underground, or digging is blind. Torch/darkness mechanic is part of "mining
   while possessed" and is not in A or B. Needs a lighting model (even per-cell light radius).
7. **A reason**: the player must get something delegation can't: A's answer is "fewer losses, rare finds". A rare find
   needs worldgen with placed secrets (hidden caves) that delegated crews won't detect. Overlap with B14 (ruins).

### 4.2 Is that small enough?
Yes, if combat is deliberately minimal (6-10 attack types total, no combos, no stamina system, no dodge-roll
physics) and if exploration, not combat, is the feature. Estimated floor: possession control+camera 1-2, minimal
combat+2 hostile creatures 1.5-3, light/darkness 0.5, mine hazards 0.5-1 => 3.5-6.5 FTE-months, i.e. D's "1-2 for
executor" is low by ~2-3x once hazards are counted. D already lists combat/possession polish as scope-killer #5.

### 4.3 Core conflict: A's and D's own claims
- A promises auto-combat "competent enough that delegation is viable". That requires tactical AI with kiting/
  flanking/retreat — a second product. If auto-combat is weak, possession is mandatory for danger (breaks the brief);
  if strong, possession combat is irrelevant. Resolve by making combat *simple and lethal*: one-two hits kill
  either side, so tactics are positional (don't go there, retreat early) not skill-based; auto-combat then needs only
  "flee at X, fight if cornered", and possession's edge is *information* (choose where to go).
- A's gentle lapse ("possession lapses on critical need") is a trust-breaker in the middle of a fight. A says "not in
  combat", which then means a possessed villager at critical hunger fights at zero need pressure — an exploit.
  Simplify: needs run normally, no lapse, no auto-eat; the HUD shows vitals; the player manages their own villager. That
  is an honest "you chose to take the body".

### 4.4 Buff
Three reports, three buffs: A +25% XP +10% speed; B witness x1.5 (discovery nudge); D +15% speed, no XP. All incentive-
distorting, none necessary. Recommendation: **no numeric buff**. Possession's value is information and control.
The "divine inspiration" label stays as flavor (a halo, +witness attention in B only because attention is already a
parameter). If playtests show nobody possesses, add +10% speed. A starting at zero is the testable choice; adding a buff later is trivial
and removing one is an annoyance. This also removes the XP-swap anti-exploit patch (A's 'N continuous minutes' rule).

---------------------------------------------------------------------------------------------------
## 5. A's camera vs C's top-down z-slice
A: oblique 3/4 view, billboard sprites, 90-degree rotation, wall/roof fade near cursor, dimmed layer-peel underground,
mine cutaway lens, possession zoom; no first person.
C: top-down renderer with z-slice cutaway first; billboard renderer second behind prototype P5; C estimates the second
renderer at 0.6-1.0x the first.
Costs (ASSUMPTION unless noted):
| item | z-slice top-down | A's oblique billboard |
|---|---|---|
| Rendering core | tile/chunk draw, slice level, 1-1.5 | 3D chunk mesh or fake-iso layers, depth sort for billboards, 2.5-4 |
| Sprites | one top-down set per entity | one 3/4 set, 4 facings or flip; all furniture/plants need facing art; art x1.5-2 (C: x2 if two sets) |
| Rotation | none | 90-degree steps: rotation of 3D chunk, picking, UI ghost placement, tile art in 4 orientations; +1-2 and art x2 |
| Occlusion | slice height or roof toggle | walls/roofs hide villagers; fade/cutaway shader; hit-testing through transparent geometry; +0.5-1 |
| Picking / drag-select / ghost placement | trivial 2D | ray into 3D grid, ambiguity between layers; +0.5-1 |
| Underground reading | slice depth ± 2 layers shaded | layer-peel dim stack; mostly same |
| Possession zoom | same renderer, closer | same, with better presence |
| Perf | cheap | overdraw from transparent layers; billboards sorted; fine at 200 agents (ASSUMPTION) |
Total: z-slice ~1.5-2.5; A's oblique ~5-8. A treats the camera as "mostly feel"; the cost is mostly
**rotation and occlusion**, both of which are chosen for appeal rather than need.
Challenge: what does oblique buy that top-down with elevation shading and a slice level does not? Mostly
possession drama and charm. Neither is one of the four purposes. If a 3/4 charm is wanted, get it from sprite art
(tilted top-down sprites with fixed pitch, no rotation, as Zelda/Stardew/RimWorld-ish do) in a *fixed* orthographic
view. Fixed 3/4 without rotation drops rotation, rotated-picking and 4-facing art: ~half the cost.
Recommendation: MVP = C's top-down, with sprites drawn at a mild fixed 3/4 so a future billboard renderer is a swap not a
rewrite (cheap to do now, expensive to retrofit). No rotation. Billboard 3D renderer stays P5-gated.
Also note: A/B/C all assume a **3D grid sim**, but A's cutaway/layer-peel and B's heat/enclosure context are reasonably
done in a **2D tile map + a few stacked layers** (surface plus cave layers) — D's "destructible 2D layered world, 2-4". The
whole stack (camera, pathing, rooms, physics context) gets much cheaper if the world is "surface + underground slices"
rather than free 3D. That choice dominates the camera choice and has to be made first.

---------------------------------------------------------------------------------------------------
## 6. Micromanagement traps, performance problems, unnecessary complexity

Micromanagement traps:
1. Crew refill rules + per-crew provisions + per-crew stance (Fight/Flee/Hold): three per-crew knobs x N crews. Cap at stance only.
2. "Protect holders / assign apprentices" (B2.7): players will babysit knowledge holders. Apprenticeship should be
   implicit (proximity + demand) and never needs an order. Keep the "you, learn smithing from Dov" order as an
   optional flourish, not a requirement for continuity.
3. Commission experiment: pick 1-3 villagers + stock + inputs. A 3-step modal for what the board could do if told "research
   `tool_edge`". Offer one button "Investigate: X" on an unfamiliar material.
4. Ghost clutter from "Build 10 more" with insufficient materials (A risk 11): needs a queue with priority; reuse C P7 findings.
5. Standing-order hysteresis tuning exposed as sliders: don't expose.

Performance:
- Pathfinding is the first cliff (slime-village A* was 43% of sim and 8 ms/slime-step at 137 slimes, per C; VERIFIED
  there). Everything in A (crews moving, expeditions, ghost builds) multiplies paths. Region graph is mandatory.
- Visibility/`sightOf` is called by witnessing, observation learning, lore, and player fog. Four consumers of one
  query: needs a shared per-tick sight cache or all four are O(n^2) in a crowded village.
- `tinker` candidate generation on idle: combinatorial. Precompute per-village candidate list when stock or station
  set changes, not per slime per job pick.
- Away-village simulation (A's "village is just the village", D's LOD Tier 2 abstraction): B's per-head knowledge,
  discovery, and tinker don't have an aggregate form defined. A dormant village must not discover things differently than
  an active one (D's P6 ±15%). Observed Practice (2.7) has a clean aggregate (rate of sightings per production event).
  B's per-head partial-strength notions have no clean aggregate. This is an extra reason to simplify.

Unnecessary complexity (cut or fold):
- Culture tallies/traditions (B10): B itself fears it is cosmetic. Defer; keep `lean` only as an attention weight if cheap.
- Documents and library (B9): D and C also cut. Keep the schema hook.
- Per-seed property perturbation (B18/D): defer until the harness exists.
- Era "table" beyond ~5 labels: labels are free; design 5.
- A6 auto-promotion, A8 Steward NPC, A5 deep backward chaining, oblique rotation.

Integration issue: **the order system and the discovery system intersect without a seam.** If a player orders a villager to
"build a furnace" before the village knows SMELT_*, what happens? A speaks of capabilities unlocking command scales
(2.10) and B says capabilities unlock verbs. Verb menus need the same capability queries as `findJob`; define the one
query API (`can(verb, settlement)`) and implement it once.

---------------------------------------------------------------------------------------------------
## 7. Concrete simplifications that preserve the pillars (ranked)
1. **Collapse notion+skill into skill; derive "capability" per job at choice time.** Cuts B's core cost ~50%, removes
   grace timers, partial-knowledge states, and the dormant-aggregation problem. Keeps loss-by-death, apprenticeship,
   firsts, accidents.
2. **Replace the time-based accident floor with a director that places the missing precondition** (smouldering stump,
   exposed ore stain) when pressure persists. Closes the circular soft-lock in 2.3 and doubles as storytelling.
3. **Restrict slice content to ~12 hand-authored, deeply interlinked discoveries** (fire->knap->clay/fire->kiln->charcoal->copper
   ->iron), 10-15 FTE-weeks of content, not 45-60 phenomena. D already says "one-era-leap emergent discovery".
4. **Crew = named selection + stall summary, not a scored layer.** Delete CREW_BOOST; commanded jobs are commitments
   bypassing temper/belief/proximity and competing only with needs.
5. **Default all gather orders to "keep N"**; delete auto-promotion; delete backward-chaining planner beyond depth 1.
6. **Autonomy builds only survival-critical structures** as ordinary jobs; no Steward stance, no NPC stewards.
7. **No numeric possession buff to start; no lapse; needs run normally.** Retains permadeath and the story.
8. **Fixed-pitch 3/4 sprites on C's top-down slice renderer; no rotation; billboard renderer behind P5.**
9. **Build the blockers-enum Why panel and discovery trace first**; all later features report through them.
10. **Scripted-player bot + discovery bot harness before content.** Without it, A's weights and B's cadence are unfalsifiable.
11. **Decide world representation (2D layered vs 3D grid) before camera and heat-context**, since both hang from it.
12. **Fold the three expedition/scout/recall specs into one `expedition` job with two recall rules**.

Net effect (ASSUMPTION): from roughly 40-55 FTE-months for A+B as written (beyond C/D's shared substrate) to ~20-30 for the
slice-and-first-planet, with no pillar removed. The cut items map to pillars as: auto-promotion (none), Steward NPC (DEV, duplicated by
district orders), notion layer (STORY, retained via skill), oblique rotation (none), culture (STORY, cosmetic), documents (STORY, deferred).

---------------------------------------------------------------------------------------------------
## Assumptions requiring prototypes
Format: question | smallest prototype | pass/fail metric.
1. Does the order-vs-need scoring behave (no thrash, trust)? | Headless port of `findJob` with ORDER_BASE, urgency curve, keep-N pull; scripted-player bot issues 10 mixed orders to a 60-villager village for 50 game-days, 20 seeds | PASS: starving-village-told-to-build survives >=95%; job switches <4 per villager-day; median unmet-order age <1 game day for fed village; no order silently dropped. FAIL: any oscillation period <1 game hour at a keep-N threshold.
2. Can the Why panel be truthful via blocker enums? | Add `blockers[]` to 5 job kinds; render for 20 seeded stall scenarios | PASS: for 20 hand-built stalls, tester names the true cause from the panel in >=18; zero panel statements contradict sim state. FAIL: any string not derivable from the scoring result.
3. Does heat/enclosure context work in freeform-built stations? | 2D tile world with player-drawn rooms, fuel, draft; a test suite of 30 kiln/hearth builds | PASS: context level matches hand-computed expectation in >=28/30; recompute <1 ms per edit; players cannot trivially cheat level 4 with a 1-tile closet. FAIL: a hole in rules lets level exceed cap, or results vary with build order.
4. Can emergent discovery reach each capability within a sane time and never lock? | Implement the ~12-discovery slice chain; two bot-players (idle, competent) x 20 seeds x 50 game-years | PASS: capability reached in 95% of idle runs within 20 years and 100% of competent runs within 8; stuck rate <2%; every failure explained by trace log. FAIL: a run stuck with no precondition obtainable (circular case in 2.3).
5. Does simplified skill-only knowledge generate the same story beats (loss, firsts, apprenticeship)? | Same bot on skill-only vs B's notion+capability model for pottery+copper | PASS: chronicle events (first-fire credit, last-smith-died, rediscovery) occur at similar frequency (within factor 2) and humans (3 testers) cannot tell which model produced a chronicle. FAIL: skill-only runs show no knowledge loss events at normal mortality.
6. Is lifespan long enough to teach a craft? | Headless: set skill rate so 0.7 skill takes 30 days; simulate 10 generations of a 3-smith village at 100-day life | PASS: craft survives >=8 of 10 generations at default apprenticeship-by-proximity; FAIL: collapse in >3, or requires player babysitting.
7. Do players understand knowledge loss and nudges (almanac/curiosities/gap hints)? | Paper/clickable almanac + 5 players, 30 min each, no tutorial | PASS: >=4/5 can state why a craft is unavailable and one action to fix it; FAIL: <3/5 or they can't tell blocked from slow.
8. Does tinker candidate sampling avoid brute force and avoid dead air? | Simulate candidate pool 8 vs 14 vs 30 with real slice data | PASS: discovery time under pressure within band (3-8 game days) and exhaustive try-all gives no more than 2x speedup over informed; FAIL: try-all dominant, or median >25 days.
9. Is possession fun with the minimal kit (move, dig, melee, light) and is delegation still viable? | Grey-box cave with 2 hostile types, torches, fall damage; 10 testers, possessed vs delegated expedition to same target | PASS: possessed run has fewer losses (>=30% fewer deaths) but delegated reaches target in >=70% of runs; testers rate possession >=3.5/5 fun; economy gain from possession <15%. FAIL: delegated <40% success (possession mandatory) or possession gives no measurable edge (pointless).
10. Is a fixed-pitch 3/4 top-down with slice readable, and is the second renderer <25% of the first? | Render one multi-floor building plus a mine in slice mode; 5 testers find stairs, distinguish roof/floor, place a ghost | PASS: all 5 within 60 s; billboard stub for the same chunk data in <25% of first renderer's LOC/time. FAIL: any tester confuses layers after hints, or picking ambiguity needs rotation.
11. Do four consumers of `sightOf` (fog, lore, witness, observation learning) scale? | Benchmark at 200 villagers, 5000 plants with shared sight cache | PASS: <1 ms/tick p95 combined at 20 Hz. FAIL: >2 ms.
12. Does the dormant (Tier 2) aggregate match full sim for discovery/skills? | Save at day 0, run Tier 0 and Tier 2 for 20 days | PASS: skill gain and discovery events within +/-15% (D's P6). FAIL: dormant villages systematically discover less or more.
13. Does `tinker`/idle candidate generation blow the tick budget? | Profile at 200 idle slimes | PASS: <0.5 ms/tick amortized. FAIL: hot loop on candidate build.
14. Does "Steward-lite" survival autonomy (survival structures only) keep an unattended village alive 2 hours? | Run unattended 20 seeds 2 real hours at normal speed equivalent | PASS: >=90% survive (A's own target); FAIL: <75%.
15. Is a 2D layered world sufficient for mining, heat context and the camera, versus 3D grid? | Implement the slice (mine + room + kiln) in both at grey-box | PASS: 2D layered covers all three scenarios with <50% of 3D's implementation LOC and zero scripted design compromises; FAIL: any slice scenario needs free-form overhangs/multi-story rooms the layered model can't express.
