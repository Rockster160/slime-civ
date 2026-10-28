# Phase 2: Design-side challenge to C (simulation/tech) and D (balance/feasibility)

Reviewer role: design-side. Standard: does the player feel the pillars (freeform construction, exploration, possession,
emergent discovery, autonomy, permadeath attachment) or is the feeling quietly engineered out?
Sources: CONTEXT_BRIEF, C_simulation_tech, D_balance_feasibility in full; A_gameplay and B_world_progression (recommendation
sections plus targeted greps for pacing, lifespan, steward, possession numbers). Labels: ASSUMPTION = unjustified number,
PROTOTYPE = should be a measured question, not a decision.

Short verdict: C and D are mostly right and unusually honest about their own numbers. The serious problems are (1) a
camera/sprite contradiction inside C that A inherits, (2) D's "possession is a capability tool, not a production tool"
framing, which is correct for balance but leaves possession with no *reason to be fun* unless exploration and risk content
exist, (3) D's autonomy rule "villagers never start new building types" which collides with C's demand feeder, A's Steward
stance and the pillar 6 "village must not be helpless", and (4) lifespan/pacing, which four reports answer with four
different numbers while every skill, genetics and knowledge-loss number depends on it.

---------------------------------------------------------------------------------------------------------------

## 1. Where C's architecture quietly damages a pillar

### 1.1 Top-down z-slice first (pillar: freeform construction, exploration feel)
- C says (2.1, 2.9, MVP): top-down renderer with z-slice cutaway first. But C 2.9 also says "pick ONE camera pitch, 3/4
  oblique, e.g. 60 degrees down" because a single 3/4 sprite reads. These are two different cameras. A top-down
  orthographic slice needs top-view sprites (roofs, heads); a 60-degree oblique with billboards needs side-ish sprites.
  C's own cost argument (second view = 0.6-1.0x) rests on this. C must pick one; the MVP choice drives the art.
- DF-style z-slice has a known readability failure that C names but treats as a test item: "what is above me". For
  freeform *building* this is not a polish issue. Building a two-storey house, a roof and a basement is the Minecraft
  fantasy the author named. If the player cannot tell roof from floor at a glance, the build tool feels like editing a
  spreadsheet. Design requirement C must accept: roof auto-hide on room entry (RimWorld-style), a persistent "current
  level" ghost of the level above at low alpha, and a one-key "show all levels as a cutaway block". These are view-layer
  costs C did not budget.
- Exploration feel: a mine rendered as one z-slice at a time is a sequence of maps, not a place. The author's examples
  ("dig deeper, seek materials", "send your miner into the woods") are about *going somewhere*. A z-slice view with a
  dimmed layer-peel (A's version) is acceptable; a hard slice with nothing visible above/below is not. Keep fog-of-war
  and "seen-this-before" memory per inhabitant (B/lore.js) as the sense of discovery, and draw the unexplored as dark,
  not blank.
- Possession in a top-down slice is a weak experience: you steer a 16-pixel dot. C defers first-person to P5; D cuts it.
  Both leave possession with only a tight zoom. That may be enough (A argues so), but it is a *claim to prototype*, not a
  settled point: "does a tight top-down follow cam make possession feel different from clicking?" If not, pillar 2's
  possession hook is flat regardless of how well balanced it is. Prototype question P8 (below).

### 1.2 World model (pillar: freeform construction, destructible exploration)
- 3D integer grid with 1-byte material and a handful of shapes: good. It gives MC/Terraria "place and dig a cell". Nothing
  to challenge on the representation itself; it is the right minimum.
- Challenge: "cell = one villager footprint" (C section 5) makes a house of 300 cells for ~4 slimes. The *scale feel* is
  decided here: if one cell is a slime, a "town" of 200 is a 256x256 map with almost no empty land left for wild
  exploration. Either population design range (D: 6-60 named) is the real target and 256x256 is spacious, or the map
  needs to be larger. This is a design-feel question disguised as a memory number. Record it as an open question tied to
  pop range, not as a number.
- Auto-recognition of rooms (hybrid): C adds a cap of 4096 cells and "giant rooms are capped". The player who builds a
  cathedral or a 30x30 hall is told "outside". That kills a creative-pillar outcome silently. Suggest: cap is a *cost*
  limit, not a rule limit: rooms above the cap are accepted as "hall" with reduced bonuses (quality score falls off with
  size) rather than flipping to "outdoors". Rule must be visible (tooltip: "too large to count as a room: add a
  partition").
- Doors separate rooms; roof requirement ("room needs roof or is a yard"): fine, but this means a player cannot make a
  cave-house in a mountain without placing roofs, which is trivial since solid rock above counts as roof only if the
  derived `roofed` flag counts natural stone. State it: natural overhead terrain must count. Otherwise the most obvious
  early shelter (dig into a hillside) fails the "room" check and breaks the era ladder "leaves -> teepee -> cabin".
- Static water and no fluids: right for scope, but it cuts the water-table hazard that D's own text (2.10 "dig to
  bedrock") wants as the mining danger. D and C each depend on the other to supply an environmental mine hazard. Resolve:
  hazard set = cave-in on span length (event, not physics), gas/bad-air as a *per-region tag* (no CA), "flooded region" as
  a pre-authored tag on a connected cave component. All three are region-level, cost-free in C's model.

### 1.3 Region-graph pathing (pillar: emergent behaviour, legible autonomy)
- Region graph + HPA* + stale-path walking: agents walk on stale paths until reply (C 2.12 item 5). Player-visible
  symptoms are villagers walking into a wall just built, or standing still for a few ticks when a path request is queued.
  Under possession this is not an issue (1-step Moves), but for autonomous workers those artefacts are the first thing a
  player reads as "they're dumb". Design requirement: a path request budget must degrade to "walk straight toward target"
  not "stand idle", and a stale path that invalidates must show as a short pause animation (looking at the new wall), not a
  freeze. Cheap, but C should list it.
- Flow fields for nearest-bed/stockpile make all villagers pick the *same* nearest bed. Combined with reservations this
  is fine, but dozens of workers converge on one tree or one stockpile corner. Visible crowding looks bad and is an
  unaddressed emergent-behaviour smell. Add spread (stochastic tie-break by temper) and a "desire path" wear mechanic
  (the existing soil trampling D keeps) so crowding becomes roads.

### 1.4 LOD tiers (pillar: village not helpless when away; multiple settlements)
- Tier 2 daily-resolution aggregate: C itself flags "village better when unobserved" with a ±15% tolerance test. From the
  design side that tolerance is too loose in one direction only. Players tolerate "the unwatched village does 15% worse"
  (reads as realistic neglect) but notice and exploit "better". Make the test one-sided: unobserved output must be within
  [-15%, +2%] of full sim.
- MVP only runs Tier 0 (one settlement). That is fine and honest for MVP, but then the "offline catch-up by aggregate
  (can be crude)" is the *only* path for pillar 6 (leave for 2 hours). A crude aggregate is exactly what players meet on
  every return. It is therefore not deferrable: the return-from-away experience is the highest-visibility part of the
  autonomy pillar. D's acceptance test 7.2.1 (unattended 20 days) needs the aggregate or a fast-forward, and neither report
  states which. Decide: unattended = real-time ticks while app is open, aggregate on cold open, with a "what happened"
  summary (chronicle digest) as the UX. This is a design gap C and D both leave open.
- Individual identity must persist through Tier 2 (C says so; good). Add: deaths during aggregate must still appear in the
  chronicle with a cause, otherwise permadeath attachment is lost silently.

### 1.5 Determinism constraints (pillar: possession, freeform building as input)
- Fixed 20 Hz tick, integer positions, command log. Challenges for feel:
  - 20 Hz sim tick vs 60 FPS render: possessed movement needs interpolation and input must feel immediate. A tick-quantised
    1-step Move per input at 20 Hz gives 50 ms input latency worst case plus a 1-cell granularity unless subcell movement
    is exposed. C chose integer cell + 1/256 subcell: fine, but "Move inputs become Move Actions of 1 step" at cell
    resolution gives grid-snapped, tile-hopping possession. Needs: possession Move is a continuous velocity command
    over subcell positions; the Action wrapper holds a direction vector, not a destination cell. Otherwise possession
    feels like clicking, not driving. PROTOTYPE (P3 should include a feel test, not only "same ticks").
  - Determinism wants no `Date`, no render-side RNG: fine. But "command log for every player input" with possessed
    continuous movement means a replay log growing at ~20 commands/s of mouse/keyboard state. Compress to change-only; ok.
  - "Same engine only" determinism: accepting this is right. Do not let determinism block gameplay features (e.g. float
    trig for animal wander). Cross-machine determinism is a visiting/multiplayer concern, which both C and the brief defer.
    Challenge: C's "decide NOW that positions and timers are integers" is cheap; "replace sin/exp in rule paths" is not and
    should be explicitly deferred or the genetics curves (D's convex upkeep, exp-based XP) will be rewritten as tables
    for no player benefit. State a lint rule list instead of a rewrite.
- Save policy: "refuse old saves" being hostile is correct; but migration chain cost is rarely budgeted. Treat as a
  *design commitment*: persistent worlds with named dead ancestors must survive version bumps. Budget it in D's person-month
  table (D has no row for migrations).

### 1.6 Job board with three feeders (pillar: autonomy, orders at several scales)
- C: Explicit > survival need > Standing > Demand > Idle, "one priority formula". A: orders get ~3x the largest normal
  demand score, critical need beats it on a *continuous curve* (no threshold). C's strict class ranking and A's continuous
  weight are different mechanisms. C's rank order is cleaner to explain; A's continuous curve gives the nicer behaviours
  (villager finishes the cut before collapsing; a half-starved one eats then returns). Resolution in table below: ranking
  *classes* for explanation, continuous weights inside, with survival curve as a multiplier.
- C's group Assignment "reserve board jobs for them first". Silent consequence: assigned workers ignore adjacent demand
  jobs (a fire, a hungry child). Needs the same continuous urgency override A specifies.
- Hauling as separate job kind with reservations on both ends: robust, but the number of visible "hauling" jobs is the
  top complaint in DF/RimWorld ("my miners carry rocks all day"). Pillar 6 says no chores. Design requirement: haulers are
  not a skill the player manages; hauling is a *priority-bounded default behaviour* of idle villagers and any worker
  with a full carry. A transport ladder item (backpack, wagon) should be the player's lever, not a hauling priority matrix.

---------------------------------------------------------------------------------------------------------------

## 2. Where D's cuts and counter-mechanics are too aggressive or too weak

### 2.1 Zero XP for possession (too aggressive for the pillar, justified for balance)
- D's reasoning: otherwise possession is a levelling machine. True for *output-per-hour* XP. But D's own XP model is
  value-of-output-based, challenge-matched, rested. Under that model, the possessed villager earns the same XP only if they
  produce the same value. The abuse D fears (possess-and-level the best miner forever) is *already* closed by `rested(s)`
  and by D's own snap-out and strain. So the zero-XP rule is redundant defence stacked on three others, while A proposes
  +25% XP and C encodes xp_mult 1.25.
- Player-experience cost of zero XP: possession loses its one *felt* payoff. The brief's example is "divine inspiration"
  - a push. A push that touches nothing visible (D: +15% work, +10% stamina efficiency) is invisible. The player cannot
  tell +15% from noise. Design rule: a buff must be perceivable; below ~25% it reads as zero.
- Proposed compromise: possession gives a small XP multiplier (x1.10-1.25 on *value-of-output*, which is already
  rate-limited by `rested`), no work-rate buff at all, and a distinct *capability* benefit: the possessed villager can
  attempt actions the AI planner will not (explore unmarked ground, take a risk, deliberate tinker experiment). That keeps
  D's "capability not output" principle and gives possession a pillar-matching meaning. PROTOTYPE: bot test per D 2.4
  (output ratio 1.0-1.25) is the gate either way.
- A's and C's numbers (25% XP, 10% speed / 15% skill, 25% XP) and D's (15% rate, 0 XP) differ for no measured reason.
  All are ASSUMPTIONS. Leave the *shape* decided (small multiplicative modifier in the sim, same for any controller) and
  put the magnitudes in a single data file with the bot-harness band 1.0-1.25 as the acceptance test.

### 2.2 Snap-out (possession released on need critical / HP < 30% / exhausted)
- D: possession ends when a need goes critical, buff cancelled when HP < 30%. A: lapse only on collapse, never mid-swing.
- Problem with D's version: forced release at the dramatic moment is the worst possible game-feel. The possessed explorer is
  in a cave at 29% HP, the player is suddenly a spectator while the AI flees (or does not). That *removes* the "god's
  gamble" from the player at exactly the tension peak, and then blames the player for the death. Permadeath only reads as
  fair if the player was in control.
- Recommended: no snap-out for HP. Keep the buff cancel (a quiet stat, not control loss). For hunger/exhaustion, the
  villager *speaks up* (a clear UI line, escalating), and only at true collapse (A's rule) does control drop, with a clear
  "X collapsed" event. Strain still accrues, which is the cost D wants. This keeps D's anti-exploit effect (possession
  cannot beat needs) without taking control away.
- The 60 s "afterglow refractory" is an artificial timer, which the brief bans ("no timers"). D itself rejects cooldown
  timers in the Alternatives (2.8 list: "cooldown timers are artificial timers"), then proposes one. Internal
  contradiction. Replace with natural strain: swapping in a recently-possessed villager gets a reduced buff because
  `strain` is carried by the body. No new rule needed.

### 2.3 Genetics +/-20% bound (F) and heritability noise (D)
- Gene effect +/-20% on any output means: across all the work in a village, genetics are *smaller than a tool tier*. D
  states this as a feature. From the design side it risks killing the pillar "named dynasty / tall miners" as anything but
  flavour. Attachment needs a *perceivable* difference between individuals: +20% is two tiles in ten. Players read a 2x
  difference. Compromise: keep output bound at about +/-25-30% for *work* output, but let genes shape *capability niche*
  strongly (can this slime survive cold, does it need less sleep, can it be a good scout) with qualitative thresholds. Make
  the difference visible in an *observable* ("fast digger", "frostbitten") not a number.
- Genotype hidden + 8% expression noise + convex upkeep + inbreeding + environment-fit + clone limits + regression: six
  stacked counter-mechanics. For a system D itself says "the point is stories, not optimisation", this is
  disproportionate machinery. D's own MVP list defers inbreeding and hidden genotype tuning. Agree with that deferral and
  go further: ship *convex upkeep* (A) and *clone limit* (B), measure with the breed-the-best bot, and add the rest only
  if the bot beats the 1.15x gate. Unnecessary complexity risk is real here.
- Convex upkeep applies "drain" on a bigger slime. Players will not see it as a cost; they will see "my strong slime
  eats more" which is a story. Good. But it also makes breeding for strength *self-limiting* to the point that extremes
  are rare (D's "everything 1.7 needs 1.5-2x food") - which is the intended effect. Fine.
- "Solo-clone" regress mean and one per life: acceptable. The cap "1 per life" is a rule the player will feel as arbitrary
  (why can't it clone twice?). Frame as biology (exhaustion), not a counter.

### 2.4 Autonomy rule: "villagers never start new building types"
- D rec 12/ decision 10: only the player starts new building types; villagers only climb ladders already placed.
- Collides with: (a) pillar 6, village must survive away. A village that has no shelter *type* for winter because the
  player never placed one will not invent it. D's own test 7.2.1 accepts "<20% start a new building type", so stagnation
  is designed. OK for growth, but for survival the baseline set (shelter, food store, firewood) must be allowed
  autonomously, else the first cold night with the player away kills the settlement. D says "survive 90%" but the rule
  as written removes the means. (b) A's Steward stance where the village picks what to build. A defaults to yes; D defaults
  to no. This is the autonomy-band conflict in the table. Recommended: baseline survival kinds (shelter, store, hearth,
  repair, replant) are always autonomous; *new functional kinds* (workshop types, defences, roads, wagons) are
  player-initiated or Steward-stance-initiated, and a Steward stance must be a visible toggle with a visible "what I did".
- Danger from the other side: a Steward stance that can start new buildings is a "village plays itself" mode. The
  mitigation is that it only starts items from the *player's own blueprint library*, never inventing designs. Combined with
  freeform construction this gives a nice middle: the player authors the vocabulary, the village chooses when to use it.

### 2.5 Skills never gate ability (D rec 11) vs knowledge loss when holders die (B)
- D: only knowledge (recipes, designs) gates capability; skills gate speed, waste, quality. B: capability exists "only
  while enough living people hold the notion"; forgetting is a warned event.
- These agree if skills and notions are separated, and B explicitly separates them (knowing-that vs knowing-how). But the
  *effect* needs a design decision: after the last smith dies, can anyone smelt? D: yes at level 0, 1.0x with waste. B:
  capability lost. Real conflict. Which is better for the game? "The last smith died and iron is lost" is a strong
  story, and the author's permadeath example supports real loss; but D's soft-lock fear is legitimate.
- Resolution: notion loss makes the capability *unavailable until rediscovered or re-taught*, but rediscovery is cheap
  (D: x0.4 cost, the chronicle hint) and the physical station still exists, so there is a clear recovery path. The lost
  state must always display a recovery action ("Experiment at the kiln"). Not a permanent lock, not a silent downgrade.
  Prototype: forget-and-recover loop length target (hours of play, not days) on the single MVP discovery.
- Mastery "signature actions gate quality not capability": fine.

### 2.6 Leisure XP cap (40% of potential at 25% rate)
- Looks over-tuned for a mechanic whose purpose is "hobbies shape who a villager is". Tiny numbers, hard to perceive.
  Defer to prototype: ship hobby skills as *flavour tags and discovery aptitude* only, no XP cap tuning.

### 2.7 Too weak
- Death-farming: D's "no resource, XP or belief from death" is right. Gap: culling for genes allowed with "grief"
  as only deterrent. A player can still run a harsh selection regime because grief is invisible mood arithmetic. Make
  grief mechanical and visible on the survivors (lost work days, mood contagion) so the cost is felt. Low priority.
- Possession combat cheese: D keeps v1 non-combat. Fine; but then possession's only risk content is cave-ins, cold,
  thirst. Exploration risk must also include *something to run from or fight* or "send your miner into the woods, a
  monster kills him" (the author's own example) is not in the MVP. See 4.2.
- Over-ordering: D relies on `strain` payback. Fine in principle, but strain is invisible to the player until it bites.
  Needs a readable "overworked" cue on the villager and on the crew, otherwise micromanagement is punished without
  explanation (a mystery cost). Must be in the MVP UI list.

---------------------------------------------------------------------------------------------------------------

## 3. Numbers that should be prototype questions, not decisions

| Number / claim | Source | Why unjustified | Prototype question |
|---|---|---|---|
| World 256x256x48 | C | Chosen for memory, not player feel; MVP D uses 64x64 | How big must the first map be for exploration to feel like discovery (time-to-first-landmark) at pop 20-60? |
| 200 villagers at 6 ms/tick | C | Contradicts D's 6-60 named design range; assumed target | Is pop >60 a requirement at all? Gate cost on actual design range |
| Second renderer = 0.6-1.0x first | C | SPECULATION flagged; derived from art cost | P5 stays, but add "is the second view even wanted after a tight-follow possession cam?" |
| Rooms cap 4096 | C | Arbitrary; player-visible rule | Test with real builders: what room sizes do players build? |
| Possession buff 15%/+10% (D), 25% XP +10% speed (A), 1.15/1.25 (C) | A, C, D | Three different guesses | Single data row; bot band 1.0-1.25x; human feel test: can testers tell they're buffed? |
| K = 25 work-days, effect 1+0.8*level, potential 0.7-1.0 | D | Tied to lifespan assumption of ~80 adult days | Re-derive after lifespan decision (see table) |
| Genes +/-20%, heritability 0.6-0.7, 8% noise | D | Plausible, untested; hidden-genotype may feel arbitrary | Do testers perceive and tell stories about gene differences? |
| Unattended 30-60 min tolerable | D | Explicit ASSUMPTION; A says 2 h | Playtest idle durations; what do players want to return to? |
| Rediscovery x0.4, brute 3-5x informed | D | Structure fine, numbers made up | One discovery, measure actual human discovery times |
| LOD Tier 2 +/-15% | C | Needs asymmetry | One-sided test |
| Person-month ranges (7-12 FTE prototype) | D | Wide band; solo/duo assumption | Treat as relative ordering only |
| Hauling/pathing time budgets (2 ms path, 1.5 ms actions) | C | Not measured on this sim | P1, as C says |
| 60 s afterglow | D | Timer; contradicts own rules | Drop |
| Convex upkeep k = 1.0-1.2 | D | Toy Monte Carlo of one trait | Bot with all nine traits |

---------------------------------------------------------------------------------------------------------------

## 4. Technical constraints the design side (A/B) ignores and must accept

1. **Cell grid is the whole world.** A's "camera ... billboard sprites, wall/roof cutaway, dimmed layer-peel" and B's
   physics-like phenomena (heat level, moisture, enclosure at a work site) require per-room or per-cell derived data.
   B's "work sites have a computed context (heat level, moisture...)" must be computed from *room flags and adjacent
   structure entities*, not per-cell temperature/moisture simulation. Accept C's "temperature at room-level; moisture
   from tags" or the CPU and scope blow up. Also B's phenomena firing from "properties meet context" implies the context
   vector per work site is recomputed on edit events only.
2. **No flowing fluids, no structural physics, no continuous physics.** A and B should not design discovery (water
   wheels, bridges, flooding, collapse) that depends on them. Water-wheel or irrigation tech must be region/tag based.
3. **Villagers are cell-sized, nav is region graph.** A's "small crowds on a tile", "expedition party" and any combat
   choreography must obey one-entity-per-cell or explicit stacking rules. Big creatures need size classes (C defers).
4. **Determinism/command log.** A's possession features and B's "tinker" jobs must emit commands and RNG from named
   streams. No "luck" rolls in UI. Any chance (mutations, discovery success) is a sim roll with a seeded stream. This
   limits "instant rewarding feedback" design like random loot popping on a client-side roll.
5. **LOD.** A's "away-village is just the village" is only true for the active settlement; distant settlements and offline
   periods are aggregate. A must accept that "everything runs at full fidelity everywhere" is not available; B's
   knowledge model must have a daily-resolution form (knowledge loss, teaching) in Tier 2.
6. **Content is data.** B's "new material that fits existing tags participates with zero code" is exactly C's content
   pipeline; both agree. But A's rich explanation strings ("Mira: fetching flint, 40 tiles away") require the sim to
   expose `reason` and `blockedBy` per actor, which C budgets (2.5) but D's UI row underestimates.
7. **One camera pitch decision before art starts.** A (oblique billboard) must reconcile with C (top-down slice): see table.
8. **Save/migration.** B's chronicle, lineage, forgotten knowledge and heirlooms all need versioned schemas and a migration
   chain. A's "hundreds of hours" promise is empty if saves are refused.
9. **Perf ceiling on named individuals.** A's attachment-based design and D's 6-60 range agree; C's 200 is excess. Design
   should treat >60 as "crews" (aggregate headcount) and not promise 200 individual stories.

---------------------------------------------------------------------------------------------------------------

## 5. Complexity, duplication, missing links, micromanagement

### 5.1 Unnecessary or duplicate complexity
- **Three order concepts plus a priority matrix plus stance**: A's focus "Stance", orders, standing orders, crews, stewards;
  C's explicit/standing/demand feeders plus an optional advanced priority panel; D's "policy". Same thing described four
  ways. The ladder should be exactly: Order (one-time, scoped), Standing order (stock target), Stance (village weighting).
  Crews are a UI grouping of the first. Stewards are deferred (A says "later"). Kill the "advanced priority panel" for MVP:
  it is RimWorld's matrix and re-introduces the micromanagement C itself rejects as primary.
- **Skills + aptitude + potential + hobby skills + rust + signature actions + novelty + rested + non-virgin bit**: D's
  XP model has eight modifiers. Ship the kernel (level, potential from aptitude, challenge-matched value) and the
  non-virgin bit; `rested` second; the rest after the bots demand them.
- **Notions + skills + culture tallies + traditions (B)** and **hobby skills + knowledge transmission (D)**: B's notion
  model already handles "who knows what". D's hobby skill ->discovery aptitude link duplicates B's `tinker`/pressure
  mechanism. One system should own discovery likelihood (B's); D's hobby XP should feed it via aptitude only.
- **Chronicle vs per-slime log vs gravestone vs forgetting warning**: four records of the same events. One event stream
  (C 2.11) with consumers; spec the minimal chronicle schema once.
- **LOD tiers 0/1/2**: Tier 1 "watched" is unneeded until multiple settlements exist (post-MVP). C already defers; agree.
- **Two room systems**: C's flood-fill rooms vs D's "ONE recognised room type" vs B's work-site context (heat, enclosure)
  vs A's "blueprint after first user-built enclosed room". All use "enclosed room" as the primitive; should share one
  room object with flags (enclosed, roofed, heated, role).

### 5.2 Missing gameplay connections
- **Exploration -> discovery**: B's discovery needs physical encounter with materials; C/D give auto-exploration of mines
  and expeditions, but nobody specifies how a *new material* found by an expedition becomes an available experiment (the
  "observed frontier"). Need an explicit rule: carrying a sample back to a station makes it experiment-eligible, and
  the finder gets credit in the chronicle. This is the exploration-to-tech link the pillars imply.
- **Genetics -> exploration/possession**: nothing connects genes to what a possessed villager can do (stamina, night
  vision, cold tolerance). Good place to give genetics a *perceivable* role (see 2.3).
- **Blueprints -> economy**: "build 10 more" is bounded by crews (D), hauling (C) and decay (D) but nobody specifies a
  *material-class fallback preview*. A player ordering 10 stone houses with stone short needs to see "needs 400 stone-class,
  have 90" before pressing go. C covers stall messages; A should own the UX.
- **Permadeath -> knowledge**: B's forgetting event and C's chronicle gravestone should be the same trigger. Also
  heirlooms (B) need a C data model (named items). D cut per-item records; B wants heirlooms; D allows "a few named
  heirlooms". Fine; mention it as an agreed small exception.
- **Seasons -> building**: D lists cold nights as the one hazard; A/B list seasons. Link: heat/insulation material
  properties and roofs (C's `insulation`) must be in MVP or the room system has no consequence beyond a label.
- **Possession -> chronicle**: nobody records "player possessed X and did Y". Add as chronicle fuel (cheap, strong
  attachment).

### 5.3 Micromanagement risks
- C's explicit orders with per-cell designations (mine/chop/harvest/zone) are RimWorld-scale chore density. For a
  mine of 1000 cells a day (C's own figure) the player cannot designate individually. Need area-level "mine this vein /
  mine to depth" orders, which C mentions only through "automatic exploration".
- A's blueprints need "build 10": covered. But **hauling and construction waves**: if the player has to approve
  sites one by one, "build 10 more" becomes 10 placements. Provide a "stamp" tool with auto-spacing (area fill with
  collision-free placement), otherwise the pillar's central example is a chore.
- The explain-why panel (C, A) is good; the risk is that it invites **debugging play** (reorder crews to fix stalls).
  Show reasons, and let the *sim fix the common ones* (unreachable target, missing tool) by auto-generating the prerequisite
  job. A "needs: axe" stall should spawn a craft job unless the player explicitly blocks it.
- Possession itself: D says one body is 0.4% of labour. If possession's reward is tiny, nobody does it except for
  exploration. Fine. But exploration-with-possession makes the player *chained* to the host for as long as the dive
  takes; that is the opposite of "village runs while you're exploring". The unattended window (30-60 min) and the dive
  length must fit; the village must handle it with no alerts. Test: a 20 minute possessed dive with zero village
  interruptions except a critical alert.
- Convex upkeep and per-trait tracking invite *spreadsheet breeding*, which is micromanagement of an invisible state.
  Hidden genotype (D) does help; keep it.

---------------------------------------------------------------------------------------------------------------

## 6. CONTRADICTIONS AND OVERLAPS TABLE (A, B, C, D)

Confidence: how sure I am that the recommended resolution is right. Proto: whether a prototype/playtest should confirm.

| # | Topic | A | B | C | D | Recommended resolution | Conf. | Proto? |
|---|---|---|---|---|---|---|---|---|
| 1 | Possession buff numbers | +25% skill XP, +10% action speed; keeps needs; lapses only on collapse | Not specified (defers) | Modifier object: skill_mult 1.15, xp_mult 1.25 as a sim stat | +15% work rate, +10% stamina eff.; ZERO XP; 60 s afterglow; snap-out at need critical/HP<30% | One data row, single modifier mechanism (C's shape). Start +10% speed, +10-15% XP on value-of-output (rested already limits grind). No timer afterglow (use strain). Gate: bot band 1.0-1.25x and testers can perceive it | Med (shape high, numbers low) | Yes: bot + human perception |
| 2 | Possession XP | Bonus | - | Bonus | Zero | Small bonus on output-based XP; zero is redundant with rested/snap-out and removes the only visible payoff | Med | Yes |
| 3 | Snap-out | Lapse only on collapse, never mid-swing | - | Not addressed | Release at critical need, buff off HP<30% | Never release control for HP. Escalating on-screen warning; release only on true collapse. Buff cancel is fine | Med-high | Light (feel test) |
| 4 | Camera / view | One tilted top-down w/ billboard sprites, cutaway, layer-peel, tight possession zoom; no 2nd view | - | Sim = grid; top-down z-slice first; billboard 2nd behind P5 gate; but 2.9 also recommends one 3/4 oblique pitch for all | Cut second view; ~64x64 2D | One camera, tilted oblique (A) over the C grid. Use 3/4 sprites for every asset. No top-down orthographic first. Treat z-slice cutaway as the *building UX* (roof-hide, ghost of upper level), not a separate view. First person cut | Med-high | Yes: readability test (stairs, roof vs floor) and tight-follow possession feel |
| 5 | World size / representation | Not specified; layered cutaway | Not specified | 3D integer grid, 256x256x48 (128x128x32 for slice) | Layered 2D, ~64x64 + 1-2 underground layers for MVP | One 3D grid data model (C) from day one with MVP world 96-128 wide, 16-24 deep; D's smaller footprint is the slice, C's grid avoids a rewrite. Keep chunk delta saves | Med | Yes: P1 plus exploration time-to-landmark |
| 6 | Population target | Individuals with attachment | - | 200 villagers | 6-60 named; 150 ceiling; crews beyond | Design for 6-60 named, hard 100 sim budget; crews beyond. Drop 200 as a target | High | Cost only |
| 7 | Lifespan / pacing | 8-15 real hours per life at 1x; 15-25 generations in 100 h | ~100-day year, life ~1 year, skills to 0.7 in ~30 days; may lengthen life | Not specified; 20 Hz tick | Life ~80 adult days (4-7 h real at 1x); K=25 work-days | Choose life ≈ 8-12 real hours at 1x as design anchor (A); skill K in work-days is derived from it, not set first. Eras outlast lives so documents/apprenticeship carry continuity | Med | Yes: first thing to playtest; all skill numbers hang on it |
| 8 | Autonomy band | "Steward stance" lets village pick what to build; away village just runs | Pressure steers attention | Demand feeder keeps village alive | "Autonomy maintains, player advances": villagers never start new building types | Baseline survival kinds always autonomous; new functional kinds only from the player's own blueprint library, optionally via Steward stance (visible toggle, visible log). D's rule and A's stance both stand, with the line between them drawn at "survival vs new function" | Med-high | Yes: unattended-run harness |
| 9 | Skills gate ability vs quality | Capability gates by civilisation | Capability exists only while enough living holders have the notion | Skills gate durations; XP only | Skills gate speed/waste/quality only; knowledge gates capability | Both true if notion != skill. Notion loss makes capability unavailable but with a visible, cheap recovery action (experiment/teach). No permanent locks, no silent downgrade | Med-high | Yes: forget-recover loop length |
| 10 | Genetics magnitude | Unspecific (attachment/lineage) | Gifted = learns faster | `settle`, aptitude, inbreeding hooks | Gene effect +/-20%; convex upkeep, hidden genotype, clone cap, inbreeding, env-fit | Output spread +/-25%; larger niche differences; ship convex upkeep + clone limit first; others only if bot fails 1.15x gate | Med | Yes: bot and "do testers notice" |
| 11 | Tech paths count | No multi-tier tree | One full (material/engineering) + one light (husbandry/biotech); defer mysticism, belief | Not covered | One path with 2-3 alternate slot implementations; defer others | One tech system, one path, 2-3 alternate implementations of ~12 slots. B's "light biotech path" is these alternates, not a second tree. Reject mechanism field expansion beyond a data stub | High | No (content) |
| 12 | Job board design | Orders ~3x largest demand score; critical need beats on continuous curve | Pressure feeds discovery | Three feeders, one priority formula, strict class ranking | Orders are multipliers on shared score; need first | Single score function; classes for explanation, continuous multiplier for behaviour; need-curve multiplier on top; orders reserve work but never freeze urgent adjacent jobs | High | Light (fuzz) |
| 13 | Standing orders | Targets on demand vector; fade to zero at target | - | StandingOrder with hysteresis, maxWorkers | Pauses when met | Target + hysteresis band; shown as a stock bar. Same object everywhere | High | No |
| 14 | MVP contents | Not itemised | One species, one full + one light path | 128^3-ish world, 12 mats, rooms, blueprint, region graph, Tier 0, determinism CI; many items | 64x64, 5 slimes, 3 skills, 1 room, 1 blueprint, 1 discovery, 1 hazard (no combat), harness | D's slice for the first prototype; C's grid and determinism plumbing as foundation. Add to D's slice: one room-qualifying rule that matters (cold nights/insulation), one exploration reward with risk, and the chronicle line. Harness is mandatory | Med-high | Yes: slice is the prototype |
| 15 | Room recognition | Blueprint unlocked after first enclosed room | Work-site context from heat/enclosure | Hybrid flood-fill + furniture + zone override | One room type | Hybrid, one room object; natural overhead terrain counts as roof; oversized rooms degrade quality, not flip to outdoor | Med-high | Yes (P2 plus builder test) |
| 16 | Hazards in MVP | Danger in unexplored places | Pressures | Cave-in as rules for roofs/shoring | Cold + cave-in span; no combat | Cold, cave-in, bad-air tag, one fleeing/neutral fauna that can wound. Combat polish deferred; some threat that can kill an explorer is needed for permadeath stakes | Med | Yes |
| 17 | LOD / offline | Away-village is just the village | - | 3 tiers; Tier 2 aggregate | Chunk catch-up closed form | MVP: real-time full sim while open; aggregate catch-up on reopen with a digest. One-sided parity test | Med | Yes (P6) |
| 18 | Determinism | Not addressed | Not addressed | Strict, same-engine, integers, named RNG | Save round-trip gate | Accept C's plan minus the transcendental rewrite; lint rules instead. Command log needed | High | CI |
| 19 | Knowledge transmission | Literacy -> steward | Notions via talk/observation/docs; skills via apprenticeship | `Teach` action | Simple "learns near a master"; defer documents | Teach/observe in MVP; documents later. Single `Teach` Action covers notion and skill transfer with different rates | Med-high | Light |
| 20 | Hauling / logistics | Survival logistics baseline, not orders | - | Hauling as board jobs | Staffing as scarcity | Hauling is baseline behaviour of idle villagers and full-carry workers; transport tier is the player lever. Never a priority matrix | Med-high | Light |
| 21 | Priority matrix | - | - | Optional advanced panel | - | Cut for MVP (micromanagement) | Med | No |
| 22 | Rooms vs work-site context | - | Heat/moisture context | Room flags | - | One room object feeds B's context | High | No |
| 23 | Discovery sources | - | Pressure + tinker jobs | - | Hobby XP to discovery aptitude | B owns discovery; D's hobby XP is an input only | High | No |
| 24 | Heirlooms / named items | - | Heirlooms and graves | Stacks only | A few named heirlooms | Allow a small named-item type | High | No |
| 25 | Chronicle | Milestones, no gating | Eras as labels | Event consumer | History log budget 1 MB | One event stream, one schema, budget per D | High | No |

---------------------------------------------------------------------------------------------------------------

## 7. Top 3 most serious problems

1. **Pacing is undefined and four reports disagree by 2x or more.** Lifespan in real time (A 8-15 h, D 4-7 h, B ~100 days
   per game-year) determines skill K, genetic generations, knowledge-loss severity, how often permadeath hurts, and the
   unattended window. Nothing in C or D is robust to this choice. Resolve first, then derive.
2. **Camera contradiction.** C recommends top-down z-slice, also recommends a 3/4 oblique single pitch; A recommends oblique
   billboard; D recommends no second view. The art decision (sprite angles) gates all UI and building UX, and the roof/floor
   readability in a slice is the make-or-break for the freeform building pillar.
3. **Possession is balanced into invisibility.** D's zero XP, +15% buff, refractory timer and forced snap-out make
   possession a risk-only capability tool with the control taken away at the dramatic moment. Combined with a
   non-combat MVP, there may be no reason to take control. Needs perceivable payoff, no forced release, and one real
   threat in the exploration content.

## 8. Prototype questions to add (not in C/D lists)

- P8: possession feel on a tight-follow top-down camera with continuous subcell movement, versus click-to-move.
- P9: perception test: can testers tell +10/+15/+25% apart?
- P10: building readability: roof/floor/level legibility in oblique vs top-down slice.
- P11: first-return experience: digest after an aggregate catch-up; does the player feel it was "their" village?
- P12: forget-and-recover loop on the single MVP discovery.
- P13: genes: do testers tell stories about individuals with +/-20% vs +/-30% spread?
