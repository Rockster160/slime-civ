# B. World, Civilization and Progression (Investigator B)
Scope: eras, emergent research, alternative paths, species, culture, knowledge transmission, generations,
world lifecycles and pressure, environmental storytelling, data-driven content.
Sources: notes/CONTEXT_BRIEF.md, notes/existing_material.md, initial_prompt.txt (pillars 1, 4, 5).
Labels: ESTABLISHED = a shipped game/paper I am confident about. SPECULATION/ASSUMPTION = mine, untested.
All numbers are starting guesses for tuning, not claims.

---------------------------------------------------------------------------------------------------------------

## 1. Recommendations
1. **Replace the tech tree with a three-layer knowledge model: Phenomenon -> Notion -> Capability.** The world's
   data defines what *can* happen (phenomena); individuals learn that it happens (notions, held in heads); a
   settlement gains a capability only while enough living people hold the notion and the physical enablers exist.
   Rationale: it keeps the author's "knowledge lives in slimes and nowhere else" rule (lore.js) and makes tech losable.
2. **Discovery fires from physics, not from a recipe list.** Materials have properties, work sites have a computed
   context (heat level, moisture, enclosure, time). When properties meet context a phenomenon fires, by accident or by
   a deliberate `tinker` job. Rationale: new content becomes data rows and the player can reason about it.
3. **Make experiments cost real items, labour and risk, and pick candidates from what is physically in reach.**
   Rationale: this is what separates the system from Little Alchemy/Doodle God brute-force pairing.
4. **Pressure steers attention, not outcomes.** Unmet village demand (the existing demand vector) raises how likely
   relevant materials are to be tried and how strongly relevant events are remembered. Rationale: "environmental
   pressure" and "player priorities" become one mechanism using data slime-village already computes.
5. **A tech unlocks a capability = new verbs, new station functions, new reachable materials.** Never a % bonus. A
   capability row lists exactly which recipes, building parts, and orders it enables. Rationale: pillar 5.
6. **Eras are labels computed from held capabilities, shown in the chronicle. Nothing is gated on an era.**
7. **Split knowing-that from knowing-how.** Notions (that clay hardens in fire) spread by talk, observation and
   documents at reduced strength; skills (being good at potting) spread only by doing, watching, and apprenticeship.
   Rationale: extends lore.js cleanly, and makes teachers, apprentices and libraries do different jobs.
8. **Add per-slime skills with an aptitude-bounded learning rate.** Gifted = learns faster, not starts skilled.
   Profession becomes a derived label from what a slime does (replaces the random birth-time pick).
9. **Culture = running tallies of what the village actually does, plus a few named traditions triggered by events.**
   Its mechanical effects bias what is noticed, what children pick up, and what is rehearsed (so forgotten slower).
   No output multipliers.
10. **Ship the first planet with ONE full path (material/engineering) and ONE light path (husbandry/biotech).**
    Rationale: biotech reuses genetics, flora and fauna the author already has. Defer mysticism as a path (fold into
    culture) and cut collective belief from the first planet; keep a `mechanism` field in capability data so it can
    be added later without schema change (section 2.7).
11. **MVP is one playable species: slimes.** Dorfs, other species, and rival civilisations are deferred. Make
    species a parameter table (aptitudes, diet, comfort, heat tolerance) so a second species is data plus art.
12. **Treat lineage as memory, not a stat.** Families are traceable (parents already stored); children learn
    faster from kin; discoveries are credited by name in the chronicle; heirlooms and graves persist. No inherited
    "legacy points".
13. **Ancient ruins HINT, never GATE.** A relic can hand out a notion (at reduced strength) or show a material exists,
    but every tech stays reachable by physics alone. Rationale: a mystery must never be a lock.
14. **Make forgetting a first-class, warned event** ("the last person who knew how to fire clay has died"). This is
    the generational hook and the reason documentation/libraries matter.
15. **All content is data with property tags and thresholds.** Schema in 2.12. Target: a new material that fits
    existing tags participates in existing phenomena with zero code.

---------------------------------------------------------------------------------------------------------------

## 2. Supporting reasoning

### 2.1 What the existing code already gives us (and what it does not)
From the audit (notes/existing_material.md):
- REUSABLE: `lore.js` heads/belief/decay/gossip; village demand vector; ambition as pace; `mind` cost on tools and
  buildings; chronicle; ruins and resettlement; flora/fauna lifecycles; genetics with soft diminishing returns;
  tool tiers (flint/stone/iron/steel) and buildings (burrow -> shelter -> straw_hut -> log_cabin -> stone_cottage).
- NOT PRESENT: per-slime skills; tech knowledge in individuals; any notion of "discovering" something. Unlocks today
  are a 14-step village quest chain (First Light, Knapping, The Hearth, Bench and Vice, The Iron Age, The Crucible...)
  gated by village mean mind.
- Insight: the quest chain IS a hand-authored tech tree in disguise. Its steps map onto phenomena naturally
  (Knapping = stone fracture; The Crucible = clay + high heat). Keep the names as chronicle "firsts"; drop them as gates.
DIVERGENCES to name explicitly:
1. Unlock gate changes from quest chain + mean mind to "capability held by living heads".
2. Tech lives in individuals and is derived to the village, instead of village-only.
3. `profession` stops being a random constant at birth; it becomes a label derived from skills and recent activity.
4. Splinter founding currently passes only ambition. Change: founders carry their heads, so a splinter keeps what the
   founders know. (This is the cheapest and most visible knowledge-travel mechanic.)
5. Ambition stays as PACE ("would", not "could"): it scales how often `tinker` is chosen. It no longer decides
   what is allowed.

### 2.2 Eras: descriptive labels, not gates
Rule: era label = the highest row of an ordered list whose capability signature is satisfied by the settlement, with
the list being data. A settlement can be "mixed" (e.g. Iron smelting without farming); the label shows the highest
and the chronicle records the date each signature was first met.
Proposed first-planet era table (names are placeholders; the requirement is only that they read as descriptive):
| # | Label | Signature (capability held) | Matches existing |
|---|-------|------------------------------|------------------|
| 0 | Foraging | none beyond hands, bedding | burrow |
| 1 | Fire and Stone | FIRE_TENDING + KNAP_STONE | First Light, Knapping, Hearth |
| 2 | Hide, Fibre and Clay | CORDAGE/HIDE_WORKING + one of POTTERY/WEAVING | shelter (teepee-like) |
| 3 | Husbandry | CULTIVATION or HERDING | Green Thumb, Kept Beasts |
| 4 | Timber and Masonry | FRAMING + (STONE_DRESSING or BRICK_FIRING) | log_cabin, stone_cottage |
| 5 | Copper and Bronze | SMELT_COPPER (+ CASTING) | new |
| 6 | Iron and Steel | SMELT_IRON + FORGE_WELDING | The Iron Age, Crucible |
| 7 | Mechanical | WHEEL_AND_AXLE + one of WATER_POWER/STEAM | wagon/carriage ladder |
| 8+ | Industrial, Orbital | expansion content | deferred |
The agreed progression (leaves -> hide teepee -> wood cabin -> brick/rock/metal) falls out: each housing type
is a building whose parts need capabilities (FRAMING for a cabin, BRICK_FIRING for brick).
ASSUMPTION: Copper and Bronze is optional content; iron can be reached directly if the world has surface iron and a
hot enough furnace. Skipping an era is allowed and shows up as a hole in the chronicle (a "found-it-early" story).
First-planet endpoint recommendation: Mechanical era (animal-drawn carriage to early rail, waterwheel/steam) plus
a capstone "observatory/sky" capability that only seeds the space expansion. Space itself is out of scope.

### 2.3 The emergent discovery system

#### 2.3.1 Vocabulary
- **Material**: a thing with numeric properties and appearance tags (2.12).
- **Context**: computed for a work site / action: `heat` (named levels), `moisture`, `enclosed`, `draft`, `duration`,
  `tools_in_reach` (capabilities). Heat level comes from fuel `heat_value x draft x insulation`, so a better furnace
  is *a physical result of materials and shape*, not an unlock flag.
- **Phenomenon**: one physics-style rule: `inputs (by tag/property range) + context range + duration -> outputs`.
  Fires whenever the conditions co-occur in the simulation, whether or not anyone intends it.
- **Notion** (know-that): a head holds `{phenomenon, strength 0..1, last_rehearsed, source}`.
- **Skill** (know-how): per craft verb, 0..1, per slime.
- **Capability**: a settlement-level derived flag, defined in data, granted while conditions hold (2.3.5).
- **Pressure(tag)**: smoothed unmet demand for a need tag (e.g. `keep_food`, `carry_water`, `warmth`, `weapon`).

#### 2.3.2 How a phenomenon becomes a notion (witnessing)
When a phenomenon fires within a slime's sight (reusing `sightOf`):
```
witness_strength = phenomenon.salience              # 0..1; "smoke and cracks" > "slightly warmer"
                 * attention                        # 0.3 passive, 0.6 working nearby, 1.0 performing it
                 * (0.6 + 0.4*intelligence)         # same shape as lore.js wit
                 * (1 + k_p * pressure(tag))        # k_p ~ 1.0; pressure in 0..1 for tags the outcome serves
                 * (1.5 if possessed)               # "divine inspiration" nudge, not a requirement
sticks if witness_strength >= 0.2 ; holder.strength = min(1, witness_strength)
```
Below 0.2 it is forgotten ("it happened, nobody noticed"). Each further witnessing adds
`0.5 * (1 - strength) * witness_strength`, i.e. diminishing returns, same family as the genetics soft ceiling.

#### 2.3.3 Experimentation (the `tinker` job)
`tinker` is scored like any other job in `jobs.findJob`: `score = curiosity * (1+ambition_pace) * itch * temper`.
- `itch` > 0 when the slime holds an unresolved stimulus: a notion with strength 0.2-0.5 ("the green rock
  smeared the fire"), a persistent pressure(tag) > 0.3, or an unfamiliar material in its head.
- Candidate combos are sampled from **what is physically in reach**: materials in the village's stock/near the site
  x contexts the village can build now x verbs known (hit, soak, bury, heat, mix, press, bind).
- Weight per candidate:
  `w = 1 + 2*relevance(pressure tags vs the materials' *observed* properties) + 1*novelty(village never tried it)
        + 0.5*temperament_risk_ok`
  A slime never sees the output tags; it matches pressure to *what the inputs look/feel like* ("crusty, dries the
  tongue" -> `keep_food`).
- Resolution is the physics: if the combo satisfies a phenomenon it fires (witness rules apply, performer attention
  = 1.0). If not, nothing happens, the attempt costs inputs and labour, and a **negative notion** is stored ("tried
  X with Y, nothing"), which also shows in the almanac so the player and the slimes stop retrying it.
- Risk: some phenomena are dangerous (burns, fumes, a collapsed furnace). A tinkering slime can be hurt; permadeath
  makes this a real story beat and a real cost.
Why this is not Little Alchemy: candidates come from the physical situation, attempts consume stock and risk bodies,
failed attempts are remembered, and the player-facing UI is a situation (what is lying around the hearth) not a
2-slot combiner.
Expected cadence (ASSUMPTION, tune): 14 plausible combos in reach, right one weight ~3 under pressure (others ~1):
3/16 ~ 19% per attempt. One attempt per interested slime per ~2 game days, 3 interested slimes ->
discovery in about 4-6 game days under pressure, ~15-25 without. A ceiling: if all inputs and the context have
co-existed for 2 seasons with no discovery, an accident fires (serendipity floor, "soft stop not hard cap").
Nothing is undiscoverable; it is only delayed.

#### 2.3.4 Notion -> practice -> capability (consolidation)
- **Practice**: using a notion deliberately (e.g. a `bake_pot` job) counts as rehearsal: resets decay, adds skill.
  Notion strength rises with success: `+0.05*(1-strength)` per successful use.
- **Decay**: unrehearsed notion strength falls toward 0 at a per-kind rate, as in `holdFor(kind)`: a vital craft
  decays slow when it is used weekly; a one-off curiosity decays in about a season. Rehearsal is the only thing
  that stops it. (This is the Tasmania-style loss mechanic; see 2.8.)
- **Capability grant**: for capability C requiring notions `{n1,n2..}`:
  `holders(C) = living adults whose strength(ni) >= 0.5 for all i`.
  Granted when `holders >= need(C)`, where `need` is data: 1 for crude (a single smart fire-keeper keeps FIRE_TENDING
  alive), 2 for most crafts, 3 for complex (metallurgy). Lost after `holders < need` for a grace of one season;
  the player gets a warning during grace.
- **Enablers**: capability rows may also list required physical things (a station, an ore deposit known, a kiln pit).
  These are checked when a job is chosen, not at grant time.

#### 2.3.5 What a capability unlocks
A capability row lists: `recipes` (items villagers may now craft), `building_parts` (station functions that begin to
work: e.g. a `kiln` part counts as a heat source of level 3), `verbs` (new player orders in the order menu), and
`materials_reachable` (e.g. IRON_TOOLS lets a pick breach hard rock). Example: POTTERY unlocks `pot`, `jar`, `crucible`,
the `kiln` part, the verb "store grain in jars", and makes `water_carry` possible without a river trip. None of that
is "+10% storage".

### 2.4 Worked example 1: fired clay (pottery)
Starting state: village has FIRE_TENDING (a hearth) and uses wet clay as daub on a straw hut wall (a
Hide/Clay-era activity). Clay deposit known on a stream bank.
Data involved:
```
material clay:  plasticity .8, wetness .7, melt_temp 1500, tags [earthy, sticky]
phenomenon BAKE_CLAY:
  inputs   clay (wetness .3-.9, shaped=true OR false)
  context  heat >= 2 (hearth, ~"red-hot") for duration >= 1 hour, enclosed any
  outputs  clay -> fired_clay (hardness .6, water_resist 1.0, brittle .5)
  salience 0.7 (it turns red-brown, rings when tapped)
  serves   [container, durable, wall]
```
Walk-through:
1. Accident. A daubed lean-to has been built beside the hearth wall; the hearth has been lit nightly for a season.
   Context heat reaches 2 on the wall for over an hour. The simulation fires BAKE_CLAY on the daub patch. Hira, asleep
   nearby, does not see it; Tob, adding a log, does (attention 0.6, int 0.6 -> 0.84). witness = 0.7*0.6*0.84 = 0.35
   (pressure for `carry_water` is 0.4 after a dry spell: x1.4 -> 0.49). Tob holds BAKE_CLAY at 0.49 (sticks).
2. Itch. Tob now has a partial notion (<0.5) and village pressure(`carry_water`)=0.4. `tinker` scores high for him. His
   candidate list includes {clay, shaped=bowl, hearth} with relevance boosted since a bowl-shape is a "holds things" shape.
3. Experiment. He shapes a bowl and leaves it in the hearth. BAKE_CLAY fires with performer attention 1.0: strength
   rises to ~0.74. He also learns a second notion from the object: `fired_clay holds water` (the first time a
   fired thing meets water, phenomenon HOLDS_LIQUID fires; salience 0.9).
4. Spread. Evening conversation: Tob tells Mira. Notions travel as lore does: at reduced strength
   (0.74*0.5 = 0.37), budget set by conversation length. Mira is below the 0.5 holder bar.
5. Practice. Mira sees Tob making a second bowl and watches (observation raises her notion toward 0.5 over a few hours of
   sight). She now clears 0.5. POTTERY (need=2) is granted. The chronicle records "Tob was first to fire clay,
   year 2 spring" plus the era label update.
6. Unlocks: `pot`, `jar`, `kiln` part (the same fire in a clay-lined pit reaches heat 3 later, which is what makes
   copper possible in example 2). Water can be carried; grain jars slow spoilage (existing spoilage model).
   The stew phenomenon (soak+heat in a vessel) becomes possible: new food recipes appear as a consequence.
Player view and nudges: 2.7. Failure mode shown: if Tob dies in a winter before
Mira passes 0.5, the notion is lost (only Tob and 0.37-strength Mira's partial knowledge remain). The village
re-discovers it later, perhaps never, and the chronicle may read "the bowl-maker is dead".

### 2.5 Worked example 2: smelting copper (a chain across capabilities)
Required elements (each is already a data row; none is a quest):
- Material known: `malachite` (green stone; appearance tags `green, heavy`; found on rock surface or shallow dig).
- Fuel: `charcoal` (heat_value 1.6x wood). Charcoal itself arises from phenomenon SMOULDER_WOOD (wood + buried
  fire, enclosed, low oxygen); first seen when a cooking pit was covered by a landslip. Needs FIRE_TENDING.
- Furnace context: needs heat >= 4 (about 1100+). Heat level = charcoal heat_value x draft x insulation. A clay-lined
  pit (POTTERY gives KILN part, insulation 2) on a windy ridge (draft 1.3) with charcoal gives level 4. A plain open
  hearth gives level 2.
Data:
```
phenomenon SMELT_COPPER:
  inputs   malachite x2 + reductant(tag=carbon: charcoal) x1
  context  heat >= 4 for >= 2 hours, enclosed
  outputs  copper_blob (melt 1085, hardness .3, malleable .9, castable)
  salience 0.8 (green rock bleeds red metal)
  serves   [tool, ornament]
```
Walk-through:
1. A known unresolved stimulus: Dov mined malachite while hunting a vein; it sits in the stock (a "stranger
   material", gives `itch`). Pressure(`tool_edge`) is 0.5 because stone blades are chipping (stone supply
   in reach shrank).
2. Candidates in reach: {malachite} x {open hearth, kiln pit, ridge kiln, grinding} x ... Three attempts fail at
   heat 2-3: negative notions stored ("green rock + hearth: only a stain"). Almanac shows them.
3. The player sees a *gap hint* (not the answer): "Green rock changes at a higher heat than your best fire
   reaches (level 3 of ~4)." This is from the near-miss: heat >= 3 recorded as a partial match to an unmet context level.
   The player can now think: more draft, charcoal, a ridge. That is the nudge (2.7).
4. A slime builds a kiln pit on the windswept ridge with charcoal and bellows (the bellows is skin + pipe; if
   BELLOWS not yet known, draft is natural wind only). Heat 4 for two hours: SMELT_COPPER fires. The performer sees it
   (attention 1.0, pressure x1.5). Strength ~0.8.
5. Metallurgy needs more than one notion: capability SMELT_COPPER requires notions {SMELT_COPPER, CHARCOAL, KILN_FIRING}
   and need=3 holders. The village has 2 holders: CHARCOAL and KILN_FIRING are common, SMELT_COPPER only Dov.
   The chronicle line is "Dov made metal"; the capability is NOT granted until two more can do it. The player
   assigns an apprentice (2.8).
6. Unlocks: `copper_ingot`, cold-hammered tools (a lesser notion HAMMER_NATIVE appears earlier), CASTING
   with fired clay moulds (a second phenomenon), the verb "mine copper", and tool tier: tools now do `breach: soft
   rock`. Existing tool tiers stay as yield tiers; new tiers just are rows.
Quality hook: copper tools exist at quality by skill; the numbers (skill -> quality) belong to the crafting
investigator. Here only the knowing matters.

### 2.6 Worked example 3: environment and pressure (preserving food through winter)
Setup: three consecutive hard winters (existing winter tolls in the chronicle). Pressure(`keep_food`) climbs from the
existing demand vector: `pressure = EMA( shortfall / need )`, per tag, over the last 2 years.
Data:
```
material salt:       tags [crusty, white, bitter], found on coast evaporation pans
phenomenon CURE_MEAT_SALT: inputs meat + salt, context shaded, duration >= 3 days -> cured_meat (spoil_rate .15)
phenomenon DRY_STRIPS:     inputs meat/fruit, context airy & dry, duration >= 2 days -> dried_food (spoil .4)
phenomenon SMOKE_FOOD:     inputs meat + smoke(heat 1, enclosed, wood) -> smoked_meat (spoil .25)
```
Walk-through:
1. Mira scouts the coast (scouting is an errand, `PROFESSION_QUARRY` pattern) and brings back salt as a stranger
   material. She is a forager/hunter; her head holds `salt: crusty, bitter, white`.
2. Pressure(`keep_food`) = 0.6. Her `tinker` weight for {meat + salt} is `1 + 2*0.6 (relevance: "crusty/dries the
   tongue" matches keep_food) + novelty 1 = 3.2` vs ~1 for others.
3. Meanwhile an *accident* is happening in the environment: strips of meat left on a drying rack in autumn wind
   (airy, dry) fire DRY_STRIPS unattended for the first time. Witness strength is high because the winter dread
   raised pressure: `0.5 attention * (1+0.6)`, so a hunter notices.
4. The village now has two partial answers (dry, salt); a smoke house is a third. Which one it commits to depends
   on materials (a coast-adjacent village finds salt; a forest village finds smoke), which gives different settlements
   different traits: a **cultural divergence driven by terrain**, with no author script.
5. Capability unlocks: CURING / DRYING / SMOKING separately. Larder gains a verb "stock for winter." Winter toll
   falls not by +x% but because fewer villagers starve due to a new thing *existing*.
This also shows pressure as a driver of progression instead of arbitrary difficulty: harsh winters are
regionally different and the response differs by terrain.

### 2.7 How the player understands and nudges the system
Principle: the player can always see **what the villagers know, what they are curious about, and what blocks them**,
but not the full answer key.
UI surfaces (concepts, not layouts):
1. **Almanac** (per settlement): list of notions held, grouped by capability, with a strength word
   ("sure / fairly sure / half-remembered / only one knows"), holders by name, and dead ends ("tried, nothing").
   Capabilities listed with who sustains them and the "last holder" risk icon.
2. **Curiosities**: a short list of live itches, in plain words ("Mira keeps turning over the white crust from the
   shore", "Dov wonders about the green rock"). Source: the unresolved stimuli behind `itch`.
3. **Gap hints** (near misses only): when an attempt matched a phenomenon on inputs but missed on a context level,
   the almanac line says what the gap is in words ("hotter", "longer", "drier"). It never names the product.
4. **Silhouettes in the chronicle** after finding a relic or a foreign item: "it is metal; nobody here knows how
   it was made".
Nudge verbs (all go through the same sim; none is a "research button"):
- **Priorities**: the existing focus weights. A focus on `tool_edge` or `keep_food` is a standing instruction: it
  raises pressure(tag) in the village demand vector. Soft: starving villages still eat first.
- **Provision**: place materials where people will encounter them; build a kiln pit; fell wood for charcoal. Changing the
  *situation* changes candidate sets.
- **Commission an experiment**: assign 1-3 villagers to the Workbench with chosen stock. Candidates are restricted to those
  inputs, so the chance rises (e.g. 14 candidates -> 3), at the cost of their labour.
- **Possess**: do the act yourself (the possessed slime has attention 1.0 and the inspiration x1.5). This is optional and
  never mandatory; an AI performer fires the same phenomenon, only slower to hit it.
- **Protect holders / assign apprentices**: keep a scarce knowledge-holder safe; pair them with a learner (2.7).
- **Send explorers** for stranger materials and relics.
Resource-rich play vs hand-off: a hands-off player still advances because pressure + curiosity + the serendipity
floor run, only more slowly. This respects pillar 6/7 (village not helpless).

### 2.8 Knowledge transmission (extending lore.js from geography to skills and recipes)
Two kinds, with different channels:
| | Notion (know-that) | Skill (know-how) |
|---|---|---|
| Unit | `{phenomenon, strength}` | `skill[verb]` 0..1 |
| Talk (gossip budget) | yes, x0.5 per hop, thins by itself (as lore.js) | no, except a bit of "tips" |
| Observation (in sight) | slowly, if the performer is in view | yes, slowly (about x0.3 of doing) |
| Apprenticeship | yes | yes, fastest |
| Documents | yes | capped ~0.3-0.4 of skill |
| Decays when unused | yes, per-kind | yes, slow |
Rules:
- **Observation**: learner in sight of a practitioner doing verb V gains `0.02*aptitude*(1-skill)` per hour on V, and
  notion strength toward the practitioner's. Reuses `sightOf`.
- **Conversation**: `share(from,to)` gets a notion class in addition to cells. One evening moves a few notions, as it
  moves a dozen patches. Weighted by `wit` of speaker and listener.
- **Apprenticeship**: a pair assigned (by player order or automatically when a juvenile/adult is idle near a master
  doing a craft the village's `demand` wants). While working together: learner rate x3, master output x0.8. This is the real cost of
  teaching, not an extra stat. Pair state is visible; the player can say "you, learn smithing from Dov".
  Kin bonus: a child learns from a parent at x2 (just proximity: children sleep and eat with parents).
- **Documents** (capability WRITING; see below): item `tablet/scroll/book` holding up to N notions and their strengths at
  write time x0.9. Reading yields `strength = doc_strength * 0.7` regardless of a teacher. They physically decay (paper
  rots, clay tablets endure, fire burns libraries). A **library** is a room with shelves; it makes documents
  searchable (a villager with an `itch` can go "consult"). Writing does not produce skill, only notions, which is
  honest: a book cannot make you a smith.
- **How writing arises**: phenomena MARK_ON_SURFACE (pigment/charcoal + clay/hide) and TALLY (pressure on
  `remember_counts` from stock and trade) produce notions that yield WRITING at need=2. No item gate.
Population effects (ESTABLISHED, contested): Henrich (2004) argued that the Tasmanian toolkit shrank after isolation
because a small population could not sustain complex skills. I use this only as a justification for `need(C)`: a
village with fewer than `need` holders loses the capability. The magnitude of real-world effects is debated; the game
rule is simply defined and visible.
Generational timing check (ASSUMPTION based on audit constants): YEAR_DAYS=100, childhood 13 days, adult at ~20, prime
40-70. A lifetime is roughly 100 days = 1 game year. Therefore a skill must be learnable in 20-35 days or apprenticeship
will not complete before the master dies. Tune skill rate so that, at average aptitude, 0.7 skill takes ~30 days of
regular practice. A 40-day-old master can pass a craft to a 20-day-old apprentice. This is the key tuning lever
for "does knowledge survive generations".

### 2.9 Culture
Culture is not a separate faction; it is a settlement's **running record of what it has actually done**.
Mechanism:
1. Every in-game day each settlement accumulates time-use tallies per activity tag: forage, hunt, farm, mine,
   build, craft:<verb>, wander, rest, gather(social), tinker. Keep an exponential moving average over about 1 year:
   `lean[tag] = EMA(share of village work time)`.
2. A **leaning** is named when `lean[tag] > threshold` for N seasons (e.g. hunt > 0.35 for 4 seasons -> "hunters").
   Names are descriptive labels, not buffs.
3. **Traditions** are triggered by events plus repetition (data rows): `winter_feast` (a lean winter ended; the first
   surplus meal was a gathering), `ancestor_grove` (an elder died, graves clustered), `founders_day`. A tradition adds a
   recurring leisure activity to the job pool for villagers (existing "chatting/bonding" leisure fits). It has only
   modest mechanical content: mood/belonging and rehearsal of related notions. ASSUMPTION: keep to ~8 traditions for first planet.
What culture changes mechanically (never output multipliers):
- **Attention bias**: witness attention is x1.3 for phenomena whose verb a leaning favours (hunters notice bone and
  hide properties; builders notice mortar).
- **Tinker candidate weights** get the same bias, so a hunting village tries bone, sinew, and hide first.
- **Inherited lean**: children's initial `temper` offsets drift toward the adults they spend time with (apprenticeship
  by proximity), so lineages specialise without a gene.
- **Rehearsal**: traditions give some notions a regular rehearsal (slower decay).
- **Belonging/mood** from shared tradition (reuses colour-kinship `belonging` as the pattern).
- **Different settlements diverge** (terrain + leaning). Wanderers bring neighbouring habits (cultural diffusion) at
  low strength, since they are carriers.
Cost: tallies + ~10 leaning names + ~8 traditions = a tiny data table and a small system. Good value.
Culture-from-tallies is my design, not an import from a named game (SPECULATION).

### 2.10 Generations and legacy
Life ~100 days; the settlement lasts across about 10-25 generations in a long game (ASSUMPTION; depends on the speed
setting). What persists and how:
1. **People as memory**: `parents` and `generation` already exist. Add a genealogy view (lineage) and credit lines:
   "Fired clay first: Tob, year 2". Founders' names are kept in the chronicle even after death.
2. **Knowledge as inheritance**: kin learn faster (x2). A smith's daughter is a smith because she was there, not because
   of a gene. Genetic aptitude (existing, soft-capped) still modulates rate.
3. **Places as memory**: graves/memorial cairn (a building that holds the names; a tradition can use it), ruins
   and rubble (existing), heirloom items (an item with an `origin` string and `maker`; quality from maker skill; no stat
   from heritage).
4. **Collapse and restart**: knowledge loss (2.3.4) is the generational stake. A dynasty that lets the last smelter die
   may lose metal for a century; the chronicle shows it.
5. **Documents are the long bridge** across generations, with the risks above.
6. **Settlement continuity**: ruins are adopted by new bands (existing `adoptRuins`), and with the change in 2.1
   (founders carry heads), a resettling band brings whatever it knew; surviving documents in the ruin can restore
   notions. This is the "the same settlement persists" thread.
Anti-min-max: genes stay soft-capped (diminishing returns exist). Skill gains `* (1 - skill)` and aptitude bounds rate, so
gifted slimes are faster but not unbounded. Breeding for skill costs generations; kin-teaching shifts value toward culture
over genes, which dampens "optimal super-species". Also: tinker risk and death mean a prized genius can die young.

### 2.11 Whole-world lifecycles and pressure as progression driver
Existing: flora growth/fruit/seed/wither with frost and drought; fauna young->adult->death, food chain, winter dormancy;
no population caps (births ~ deaths); village carrying capacity from range.
Pressure sources (each is derived from existing sim state; none is an arbitrary scalar):
| Pressure tag | Derived from | Progression it favours |
|---|---|---|
| keep_food | winter tolls, spoilage waste | curing, drying, jars, granary |
| warmth | cold damage rate on unsheltered | hides, hearth, better walls |
| fuel | wood within range falling (overharvest, deforestation) | charcoal, coal, peat, efficient kilns |
| tool_edge | stone/flint supply and breakage | metal, quarrying |
| defence | mauling memories, `dread()` share | spears, walls, bows, guard posts |
| carry_water / distance | trips to water | pots, wells, aqueducts |
| soil | field yield decline (SPECULATION: needs soil-fertility modelling) | crop rotation, fertiliser, manure |
| housing | population over beds | build ladder |
Rules: `pressure(tag) = clamp(EMA(unmet / need), 0, 1)`; it is a smooth reading (like `peril` in breedIn), not thresholds.
It feeds witness strength and tinker weights, nothing else. It never grants anything.
Lifecycle -> progression links:
- **Domestication** (biotech-light path): animals kept near and fed breed with an increasing `tameness` trait over
  generations; seeds from the best plants (sprigling "condition" already carries ground quality) can be saved and sown,
  increasing yield/predictability over seasons. Both are slow, multi-generation, and fit the genetics code.
- **Resource exhaustion as story**: forests near the village thin out; the nearest wood retreats (existing range model),
  forcing charcoal/coal or relocation. This is Against the Storm / ONI style pressure (they use scarcity cycles; ESTABLISHED
  in spirit, I am not copying their numbers).
- **Climate drift** (SPECULATION, defer): multi-year cold or dry phases. Cheap to add if the weather generator is
  parameterised; not necessary for MVP.

### 2.12 Data-driven content (schema sketches)
```
// materials.json
{ "id": "malachite", "tags": ["stone","green","heavy","ore"],
  "props": {"hardness": 0.4, "density": 0.7, "ore_of": "copper", "flammable": 0},
  "origin": {"biome": ["rock","highland"], "depth": [0, 6], "rarity": 0.25} }

// phenomena.json
{ "id": "SMELT_COPPER", "verb": "heat",
  "inputs": [{"tag":"ore","ore_of":"copper","n":2}, {"tag":"carbon","n":1}],
  "context": {"heat": [4, 9], "enclosed": true, "duration_h": 2},
  "outputs": [{"material":"copper_blob","n":1}],
  "salience": 0.8, "serves": ["tool","ornament"], "danger": 0.15 }

// capabilities.json
{ "id": "SMELT_COPPER", "needs_notions": ["SMELT_COPPER","CHARCOAL","KILN_FIRING"], "need": 3,
  "enablers": ["station:kiln_pit"], "mechanism": "physics",     // later: "belief"
  "unlocks": { "recipes": ["copper_ingot","cast_axe"], "parts": [], "verbs": ["mine_copper"] },
  "era_tag": "copper" }

// eras.json
[{ "label": "Copper and Bronze", "requires": ["SMELT_COPPER"], "order": 5 }]
```
Rules:
- Property thresholds and tags mean a new material (e.g. tin) participates automatically in phenomena that ask for
  `tag:ore, ore_of:tin`. A new phenomenon needs only a row.
- Validation tooling (headless test, like existing `tests/`) must run a "reachability" sweep: for every capability, a
  path exists from the starting state using only phenomena that can fire. Run in CI. ESTABLISHED analogue: Dwarf Fortress raws
  keep properties like melt and ignite points as data; this is a coarser version.
- Do NOT attempt per-cell material reactions like Noita (ESTABLISHED: Noita simulates each pixel with falling-sand rules);
  that is a different scale of simulation and cost. Discrete phenomena are enough.
Content-cost estimate (ASSUMPTION; to calibrate): about 1 data row per phenomenon, ~0.5 recipe, 20% need a new icon/
building. Counts to reach "Iron and Steel" slice: ~45-60 phenomena, ~25 materials. To "Mechanical": ~110-130 phenomena.
Counting the existing content (20 flora, 5 fauna, 7 tool categories x 3-4 tiers, ~25 buildings) most Stone/Hide/Husbandry
material already exists as items.

### 2.13 Alternative technological paths
Evaluation criteria: reuse of existing systems, unique strengths and weaknesses, content cost, legibility.
**A. Engineering (materials, mechanics): ship, full.** The default as above. Strengths: reliable, scalable, power-hungry
infrastructure (mines, fuel, furnaces). Weakness: resource-intensive; vulnerable to ore depletion and fuel pressure.
Cost: biggest (~60% of phenomena).
**B. Husbandry/biotech: ship, light.** Domestication, selective breeding, fermentation (bread/beer/vinegar), natural
dyes and fibres, medicinal herbs, grafting, bio-materials (shell, bone, chitin, resin glue, silk). Strengths: low
infrastructure, renewable, slow, generational; settlements look green and keep many animals. Weakness: slow, vulnerable
to blight and bad seasons; ceiling is lower on heavy industry unless combined. For slimes, bio-materials fit the fiction
(ASSUMPTION; slimes in the current game build with straw, logs, stone, iron, so the species is not bio-only).
Cost: ~25-35 phenomena, mostly reuse of flora/fauna/genetics. This path is where the existing sim is richest.
Paths are not exclusive: a village mixes. They differ by **what you build around and what fails**, not by a gate.
**C. Mysticism: do not ship as a path.** Fold the human-feeling parts (rituals, totems, graves, golden idol that already
exists) into Culture traditions as mood/belonging/rehearsal. A separate mysticism tree needs invented rules and
art; the risk is a reskin of engineering with different names.
**D. Collective belief (Ork-style): cut from first planet; defer.** Evaluation:
- ESTABLISHED context: In Warhammer 40K lore, Ork "waaagh" energy lets believed things work (e.g. red paint,
  crude machines). That is lore, not a game rule set I can cite; I use it only as an inspiration.
- A clean rule set, if built later: `belief(C) = share of living adults holding creed notion for C at >=0.5, weighted by
  participation in a ritual job during the last season`. A belief-mechanism capability (`mechanism:"belief"`) raises
  a *context parameter* of one phenomenon by at most +1 level within radius R of a focus structure (totem/idol/shrine).
  It does not create matter, never exceeds a cap, decays if rituals stop, and **fails visibly** when belief falls below
  threshold (the "sacred forge goes cold"). Doubt rises with failure; a schism splits the village into rival creeds.
- Costs: new notion type (creeds), ritual jobs, shrine structures, doubt/schism dynamics, UI to read belief, and a
  new class of "why did it fail" bugs. It would also be a second progression system parallel to physics, with its own
  balancing: either strictly worse than physics (nobody picks it) or a free lunch (everyone does).
- Verdict: expansion content for a later species ("orks"/another culture) whose entire tech is belief-based. Keep
  `mechanism` in the schema and keep Culture traditions as the only first-planet use of belief-like ideas.
**Count recommended for first planet: 1 full + 1 light.** Anything beyond two paths multiplies content and
testing, and makes the "complete first planet" harder to ship.

### 2.14 Species diversity
Options: (a) slimes only, (b) slimes + Dorfs playable, (c) species as data with one shipped.
- Cost drivers per species: art/animation, needs/diet/comfort tables, aptitude ranges, tech divergences, balance of each
  path against others, text, and testing. The existing sim is built entirely around slimes (colour genetics, comfort,
  diet) and is already ~28k LOC of sim.
- Dorfs (games/Dorfs: Godot 3.x 2021, README "Dorfs") has essentially nothing to port (audit F1). Its value is the idea.
- Recommendation: **one playable species (slimes) for MVP and first-planet release.** Make `species` a parameter table in
  data so adding one later is a data and art task. Differences in progression for another species would be
  **tag preferences + capability availability** (e.g. a species that cannot sustain heat > 3 never finds the
  smelter; a species that grows tools from bodies has a biotech-only path), not whole separate trees.
- Cheapest way to get a "Stellaris-like" feel: other species appear as **ruins and NPC rivals** later; the player does
  not play them. Stellaris (ESTABLISHED) offers origins/traits that change early game; the useful borrow is divergence
  by start conditions, which we get from terrain + culture already.

### 2.15 Environmental storytelling: ruins and mysteries
Existing: abandoned villages become ruins (hp decay 1.1/day, rubble), can be salvaged and adopted, with chronicle kept.
Additions (small, all data):
1. **Ancient sites at worldgen**: each island gets 0-3 sites generated from a template set (~6 templates): a cairn circle, a
   collapsed hall, a mine entrance with old shoring, a sunken dock, a buried workshop. Each contains:
   props, 1-3 **relics**, and a 3-line **epitaph** generated from tags (what pressure ended it).
2. **Relics carry knowledge**: a relic is an item with `notion_bundle` (e.g. "a bronze axe head": shows metal exists,
   gives the CASTING notion at 0.3 if examined by someone holding SMELT notion). Examination is a job; results go in
   the almanac as a silhouette ("worked metal; nobody knows how").
3. **Rule: ruins hint, never gate.** Every capability remains reachable from the starting state (enforced by the
   reachability sweep). Relics only accelerate or give direction.
4. **Pre-history SPECULATION**: run a short headless slime-village sim at worldgen (the sim is deterministic and headless
   per the audit) to produce a *real* dead village with real graves, chronicle lines and building shapes, rather than
   authoring them. Costs worldgen time; defer the decision to prototyping. If used, it gives truly emergent mysteries ("they
   starved in winter 6; their kiln was never fired").
5. **Mystery events**: lights in caves, an unexplained structure; each is a data row with a place and an outcome; keep to <10.
6. Your own ruins are the strongest storytelling asset: a dead village you once ran, with its chronicle, is a personal mystery.
---------------------------------------------------------------------------------------------------------------

## 3. Alternatives considered
- **Authored tech tree with "eureka" boosts** (ESTABLISHED: Civ VI does boosts; RimWorld/Factorio/ONI use prerequisite research). Rejected: violates the brief; a tree is also what the 14-quest chain already is.
- **Pairwise combination (Little Alchemy/Doodle God).** Rejected: guess-everything-with-everything, no consequence, no place for pressure or people.
- **Per-cell material simulation (Noita).** Rejected: wrong scale and cost for a colony sim.
- **Village-wide research points.** Rejected: contradicts "knowledge lives in slimes and nowhere else" and gives no loss mechanic.
- **Four paths (engineering, biotech, mysticism, belief) at launch.** Rejected: ~4x content and testing for "one complete planet".
- **Playable dwarves at MVP.** Rejected: content and balance multiplier with no code to port.

## 4. Risks and tradeoffs
1. **Opacity.** Emergent can read as random. Mitigation: almanac, curiosities, gap hints, dead-end log; test with players early.
2. **Slow or stuck progression.** Pressure plus the serendipity floor mitigate; the reachability CI sweep prevents impossible chains; tune the first hour hard.
3. **Frustrating knowledge loss.** Permadeath plus need(C) can cost a tech. Mitigation: warning during grace, documents, apprenticeship auto-pairing, `need` of 1 for first-tier crafts. Loss is the generational hook, so it must be visible, not silent.
4. **Lifespan arithmetic.** A life of ~100 days (ASSUMPTION from audit) leaves little room to learn complex crafts; skill rate is the key tuning lever and may require lengthening life or adulthood.
5. **Content cost.** Roughly 110-130 phenomena for the full first planet. The MVP slice must stop at iron.
6. **Sim cost.** Per-slime notion/skill maps for dozens to hundreds of slimes plus witness checks each phenomenon firing; sight reuse keeps it bounded. ASSUMPTION: fine at the village counts the sim already handles (55-70). Needs a perf spike.
7. **Min-max.** Players may farm experiments. Risk and consumed stock bound it; negative notions stop repeat tries.
8. **Culture is cosmetic.** Mitigation: effects restricted to attention, candidate weights, inherited lean, rehearsal; check in playtest that they are felt.
9. **Autonomy vs command** (CONTEXT_BRIEF tension): tinker is a normal job, so both AI and orders run the same sim.

## 5. Unresolved decisions (with recommended default)
- Lifespan/year length for generational pacing. Default: keep 100-day year, tune skill rate to ~30 days for 0.7 skill; revisit after prototype.
- Holders needed per capability. Default: 1 first-tier, 2 standard, 3 complex.
- Does hand-off (no player nudges) progress? Default: yes, slower (serendipity floor 2 seasons).
- Pre-history sim at worldgen? Default: no for MVP; hand-templated ruins first.
- Belief path? Default: cut. Mysticism as path? Default: cut, fold into traditions.
- Keep quest chain? Default: keep as chronicle "firsts" and player-facing goals, remove as unlock gate.
- First-planet endpoint? Default: Mechanical era with an observatory capstone; space later.

## 6. Dependencies on other systems
- **Simulation/AI**: `tinker`, apprenticeship pairing, observation learning are jobs in `jobs.findJob`; witness checks hook phenomenon firing; reuses `sightOf`, `gossip`, demand vector, `temper`.
- **Crafting/buildings**: recipes and station functions must read capabilities; stations must expose context (heat, draft, enclosure). Free-built rooms must compute context from real geometry/materials (needs room recognition decision from the building investigator).
- **World gen**: ore, salt, clay and fuel placement; ancient sites; biome-specific stranger materials; deposits rarity.
- **Ecology**: pressure inputs (wood range, winter tolls, spoilage), domestication traits.
- **Genetics**: aptitude bounds learning rate; no new genes required.
- **UI/control**: almanac, curiosities, orders (apprenticeship, commission experiment), possession attention bonus.
- **Save/load**: notions, skills, negative notions, documents, chronicle credits, capability grace timers.
- **Multiplayer (later)**: visiting could carry notions and relics; no invasion required.

## 7. MVP vs later
**Essential for vertical slice (leaves to iron):**
- Materials/phenomena/capabilities data schema and reachability test.
- Context computation for heat and enclosure; ~45-60 phenomena covering fire, knapping, hides, clay/pottery, charcoal, smelting copper/iron.
- Per-slime notions and skills; witness, tinker job, practice, decay; village capability derivation with grace and loss warning.
- Almanac with notions, curiosities and gap hints; chronicle credit and derived era label.
- Observation + conversation + simple apprenticeship.
- Splinter bands carry heads.
**First-planet release (after slice):** husbandry/biotech path, documents and library, culture leanings and ~8 traditions, ancient sites with relics, genealogy view, heirlooms, Mechanical era.
**Later / expansion:** collective belief, mysticism-as-path, extra species, rival civilisations, pre-history sim, climate drift, disease, industrial and orbital eras, space.
