# D. Balance, Feasibility and Critical Review
Role: Investigator D (adversarial critic). Scope: exploits, balance bands, simulation cost, scope.
Inputs read: `_SHARED_BRIEF.md`, `CONTEXT_BRIEF.md`, `existing_material.md`, pillars 1-10 of `initial_prompt.txt`.
Additionally verified in code (read-only): `slime-village/slime/sim/slime.js` `breed()` and `util.js` `settle()`.
One scratch experiment was run (a toy Monte Carlo of `breed` + `settle`, described in 2.1). Numbers from it are
labelled TOY. Anything labelled ASSUMPTION is my estimate, not a measurement.
Convention: "the existing sim" = slime-village. "New game" = this project.

## 1. Recommendations
Genetics
1. Keep `settle()`, but do NOT rely on it alone. It is a speed bump, not a wall (see 2.1: TOY plateau ~1.7x on
   every trait simultaneously, reached in ~10-15 generations). Add convex upkeep costs per trait (pleiotropy).
2. Make trait costs convex and metabolic: `upkeep = 1 + sum(k_i * max(0, t_i - 1)^2)` applied to hunger/energy
   drain. Gifts of +20% are nearly free; +60% costs roughly a third more food.
3. Close the solo-clone loophole: `bearChild(a, a)` is a near-perfect-heritability copy machine for the best slime.
   Give clones inbreeding load, a genome that does NOT copy the elite value exactly (regress toward the mean),
   and a hard cap on clones per lineage per generation.
4. Add inbreeding depression from a stored 3-generation ancestry (ids), not from colour. Costs health and fertility,
   not skill. Cheap: ~12 ints per slime.
5. Hide the genotype. Show phenotype and observed performance (noisy), so selection runs on a heritability well
   below 1. The player breeds on evidence, not on a spreadsheet.
6. Make environment-fit the real axis: the value of each trait changes with biome, season and era, so there is no
   single "best" genome. Tech reduces the weight of raw traits (a tool cuts the strength share of a swing).
7. No "pair these two" order. Mate choice stays with the slimes (existing behaviour). The player's levers are
   indirect: housing, who is near whom, who is sent where, what is feasted, what is risked.
Skills
8. Skill = `level` bounded by genetic `potential`; XP is paid on challenge-matched, non-reproducible output, with
   a per-day diminishing-return curve. Ratio target: tool tier > skill > genes, in that order of magnitude.
9. Mark player-placed/mined-before blocks as non-virgin. Re-mining them yields the item back (matter conserved) and
   zero XP. This kills the "mine and replace the same block forever" grind in one bit per cell.
10. Leisure XP is real but capped: it can lift a skill only to ~40% of its range, at ~25% of work-XP rate.
11. Skills never gate ABILITY below the tier at which a recipe is known; they gate speed, waste and quality. Only
    knowledge (recipes, designs) gates capability. This is the main soft-lock prevention for permadeath.
Autonomy, control and possession
12. Autonomy of LABOUR, not of INTENT. Villagers sustain (feed, shelter, repair, defend); the player (or a standing
    policy) decides what is new (new building types, expeditions, research focus, expansion).
13. Orders are large multipliers on the existing demand/score board, never overrides of needs. A starving village
    told to build still eats first (existing design line, keep it).
14. Possession = the player drives the same job executor. Same needs, same strain, same skill, same wounds.
    Buff: +15% work rate, +10% to-hit/dodge stamina efficiency; ZERO XP bonus; ends if a need goes critical.
15. Possession is valuable for capability (risk, routing, judgement), not for output. Instrument it: the harness
    must show possessed output <= 1.25x autonomous output at equal skill.
Tech
16. Discovery is a search over a finite, structured property space, restricted to the civ's observed frontier, with
    every experiment consuming materials + a workshop + villager-days. Brute force is allowed but costs 3-5x the
    informed route, and no fixed recipe table is shared between seeds (property perturbation per world).
17. Soft-lock prevention is a build-time worldgen validator plus runtime rediscovery discounts: every capability
    must be reachable from bare hands by >= 2 routes on every generated planet (checked headlessly per seed).
18. Ship ONE tech path on the first planet. Build "path" as a data bias over capability slots (heat, light,
    preservation, transport, medicine, ...), not as parallel trees. Defer collective belief; if it ever ships, it
    gets the rules in 2.6.
Cuts and scope
19. Cut or defer: all of space, multiple species, collective belief, first-person, two camera modes, per-pair
    relationship graph, structural-integrity physics, documents/books as knowledge, other civilizations' ruins, trains.
20. Build the MVP as a ~64x64 destructible 2D grid with 5 slimes, 3 skills, 1 room type, 1 blueprint, 1 discovery,
    1 hazard, and an exploit-bot harness. Estimated 6-10 FTE person-months (ASSUMPTION). See section 7.
21. Make the exploit-bot harness part of the MVP: scripted grinders (place/mine, breed-the-best, possess-swap)
    run headless on every build and fail the build if they beat the baseline by more than the stated margins.
    This extends the author's own `sweep.js` practice (judge the outcomes, complain in both directions).

## 2. Supporting reasoning (by topic)

### 2.1 Genetic optimisation exploits
What the existing code actually does (verified):
- `Slime.breed(a, b)` per trait: 22% copy A, 22% copy B, 28% midpoint, 28% random lerp(A,B), then multiplicative
  noise uniform in +/-5%. Then `settle(child, 1, TRAIT_SOFT=0.5)`.
- Founder traits are 0.8-1.2. `settle` passes everything within 0.5 of the middle untouched, i.e. 0.5-1.5. So the
  "soft cap" does nothing at all for the entire range from founders (1.2) up to 1.5.
- `breed` never extrapolates beyond the parents' range. The only source of improvement beyond the best parent is
  the +/-5% noise. So progress per generation is small, which is why the existing sim has not shown a super-species.
- There is a second path: `bearChild(a, a)` (solo split). `mix(v, v)` returns `v * (1 +/- 5%)`. That is a clone with
  the elite value preserved. Clone cost in the existing sim is energy/health (CLONE_COST 0.55 recovery, 30 days)
  and 12-day patience gate; there is no genetic cost. Selection on a clone line has heritability ~1.
- `settle` is applied to every child's already-settled parent values. Applying a concave function repeatedly makes
  the soft cap behave as an effective ceiling, not just a slowdown. I did not expect this and it is not documented.
TOY experiment (my script, not the game; one trait, noise-only, perfect knowledge of genotype, top-K parents,
population N, 60 generations; mean/max of the population):
| setup | gen 5 | gen 10 | gen 20 | gen 60 |
|---|---|---|---|---|
| sexual, N=20, top 5 | 1.32/1.37 | 1.55/1.61 | 1.69/1.75 | 1.68/1.74 |
| sexual, N=200, top 10 | 1.44/1.50 | 1.67/1.73 | 1.71/1.76 | 1.71/1.77 |
| clone best, N=200 | 1.46/1.53 | 1.68/1.74 | 1.71/1.77 | 1.71/1.77 |
Reading it:
- A deliberate breeder reaches ~1.7 on a trait in about 10-15 generations. That is +40% over the best founder and
  +70% over the average founder. The plateau is the fixed point where the +5% noise gain equals the re-settle loss.
- Nothing stops the player doing this to all nine traits at once, because the traits have no cost against each
  other. So the existing design's real behaviour is: bounded, but a 1.7x-everything slime is reachable.
- In the existing game one generation to adult is ~20 days = ~80 min of 1x play; at 50x fast-forward that is
  under 2 minutes. Fifty generations is trivial to reach by leaving the game on fast-forward with a selective
  environment. Slow generations protect nothing when the sim speeds up.
- CAVEAT: the toy assumes the player can see the genotype and choose parents. In the existing sim the player cannot
  choose mates, so this is an upper bound for the new game. It is exactly the upper bound that matters if the new
  game adds "keep the best breeding stock" levers (separate houses, possession-led pairing, culling by risk).
Counter-mechanics (a set, because each fails alone):
A. Pleiotropy (convex metabolic upkeep). Each trait above 1.0 adds drain:
   - strength: food drain `+1.2*(s-1)^2` ; at 1.2 -> +4.8%; at 1.5 -> +30%; at 1.7 -> +59%.
   - speed: stamina/energy drain, same form k=1.0.
   - intelligence: sleep need (a thinking brain is expensive): energy drain k=1.0, plus lifespan -k2.
   - maxHealth: slower maturation (already in the code: `lifePace` makes long-lived lines grow up slower).
   - fertility vs longevity: the existing `lifePace` already trades them; keep.
   - drive: raises `strain` accrual (burnout), the existing strain/leisure loop already pays this back.
   Why convex: the near-average slime is unaffected, which keeps the early game and flavour alone; the cost bites
   exactly where super-breeding lives. A linear cost would punish ordinary variation.
   Result with k as above: an everything-1.7 slime needs roughly 1.5-2x the food and sleep. A village of those
   is food-limited and the existing food/land carrying capacity (`landSlack`, territory) does the rest.
   This stays inside the existing design philosophy ("weighted, never gated") and needs no new subsystem.
B. Close the clone loophole. Clone offspring regress 25% toward the population mean and carry stacking load (-6% maxHealth, -10% fertility per consecutive clone generation); cap solo-splits at 1 per life, keep the dying last-resort case. Monoculture lines get hit harder by disease/pest events. (SPECULATION as a game rule; the real-world analogue is monoculture vulnerability.)
C. Inbreeding depression from ancestry ids: store `anc = [pA, pB, gp x4]`; `F ~ 0.5*kin(a,b)` (siblings 0.25, cousins ~0.06); maxHealth*(1-0.5F), fertility*(1-0.8F), more "sudden weakness" mutations. Siblings: -12.5% health, -20% fertility, shown as "weak line". Existing assortative colour pairing (`LIKE_COLOUR_*`) pushes toward inbreeding, and `debug_belong.js` favours mixed-colour towns, so the two forces already oppose. Cost: ~6 ints/slime, no per-tick work.
D. Regression via noisy phenotype. Show phenotype, not genotype; add +/-8% expression noise so selecting the best-looking parents partly selects luck (heritability ~0.6-0.7). ESTABLISHED: breeder's equation R = h^2 * S. The existing coarse `traitStanding` words and "consequences a player can watch" stance already fit; add no numeric genotype readout. ASSUMPTION: the noise will not feel arbitrary; playtest.
E. Environment-fit (strongest answer): a trait's marginal value depends on context, so the optimum is not a fixed vector.
   - Cold biome rewards maxHealth and low upkeep; plains reward speed; cave work rewards strength+stamina; winter punishes high upkeep.
   - Era shifts: `yield = base * f(skill) * tool * g(trait)`; a tier-3 tool cuts the strength exponent in g from 1.0 to 0.5, so the strong line is ordinary in the iron age. One coefficient per tier.
   Hard caps are rejected (existing note: "a wall is the one shape a player can feel"); soft stops need costs, not just compression.
F. Bounded gene effect: genes move any output by roughly +/-20%; big multipliers live elsewhere (tools 1.5-5x, skills up to 1.8x). Dwarf Fortress lesson (ESTABLISHED pattern, no cite): wide attribute spread turns play into hand-picking the best migrants.
Why min-maxing does not dominate with set {A, B, C, D, E, F}:
   1. Doing it costs generations (time) with a noisy signal (D).
   2. The result costs food/sleep/fragility (A, B, C).
   3. The result may be obsolete or off-niche after an era/biome change (E).
   4. Even a perfect result is +20% on output (F), less than one tool tier. A player ignoring genetics loses
      little; a player engaging gets flavour, a named dynasty and a niche, not an advantage nothing else can match.
   The point of the genetics system is stories (the "line of tall miners"), not optimisation. The balance target is
   "breeding matters about as much as a good building," not "breeding is the strategy."
Measurable test (harness): bot picks the top-K parents by true genotype for 30 generations with perfect info.
PASS if: mean village output per food unit after 30 generations is <= 1.15x a random-breeding control, and its
extinction rate under an injected disease event is >= control. FAIL otherwise.

### 2.2 Skill XP
Proposed model (a minimum that supports every claim; numbers are starting guesses to be tuned with the harness):
```
potential[s]  = 0.7 + 0.3 * aptitude(s)          # aptitude in ~[0,1] derived from 2-3 genetic traits, settled
                                                  # => cap runs 0.70..1.00 (+/-~20% around 0.85)
level[s]      = potential[s] * (1 - exp(-xp[s]/K))   # K ~ 25 "work-days of fair-challenge work"
xp_gain       = value_of_output * max(0, 1 - level/difficulty(task)) * novelty * rested(s)
learn_rate    = 0.85..1.15 from intelligence (bounded)
effect        = 1 + 0.8 * level                   # master 1.8x novice (speed/waste/quality), x genes via potential
decay         = after 10 idle days, level drifts down 0.5%/day, floor at 60% of peak  ("rust")
```
- Challenge-matched XP: `1 - level/difficulty` pays nothing for cutting soil as a master. Kenshi trains stats by doing hard things and is known for grind exploits (e.g. training Strength under load); I am confident of the pattern, not citing a page. Lesson: pay for value created, not time spent.
- Why K: slime-village lives are ~80 adult days; K=25 work-days gets level 0.63*potential in ~25 work-days and 0.9 by
  ~58. So a master emerges in about the second half of a life; a death in the second half of a life destroys real
  value, which is the "send your max-level miner into the woods" stake, but also bounded.
- Gifted vs average: potential 1.0 vs 0.85, learning rate 1.15 vs 1.0 -> a top miner is about +17% effect at mastery
  (1.8 vs 1.68) and gets there ~15% sooner. Matches "genetically gifted starts with potential, not expertise".
  A child of a master starts at zero level but learns faster near a master (apprenticeship, below).
Grinding exploits and their kills:
1. Mine-and-replace the same block: per-cell `virgin` bit, cleared on placement and kept in the sparse dig-delta list the save already needs. Mining a non-virgin cell returns the item (matter conserved) and pays zero XP. Cost 1 bit/cell. (My proposal; no cited precedent.)
2. Plant-and-harvest loops: XP only from net-new matter (seed returned pays nothing), plus `rested(s)`.
3. Same-action repetition: `rested(s) = 1/(1 + worked_today[s]/4h)`: the first 4 hours of a skill pay 1.0 to 0.5, the next 4 pay 0.5 to 0.33. Rotating skills beats single-skill grinding.
4. Fast-forward/idle XP: XP tracks output, not time, so idling at 50x pays only what the village really produces.
5. Dummies/sparring: dummy caps at level 0.3; sparring pays by the OTHER party's level with injury chance, so two novices learn little.
6. Possession XP: identical formula, no bonus (2.4); otherwise possession is the levelling machine.
Specialist vs generalist:
- Generalist gets the small flat "any-job" floor (a slime with 0 skill still does 1.0 effect, per bare-hands-never-
  impossible), so everyone can cover. Specialists get up to 1.8x in one.
- Job scoring: the existing `PROFESSION_AFFINITY` multiplier is replaced by `f(level)`; scores = demand * affinity *
  temper * sway. This keeps the "every job can be explained by two numbers" rule. Specialists drift to what they are
  good at because the score is higher: no new planner.
- Generalists matter with no extra rules: in a village of 6 one person covers 5 jobs; in a village of 40 specialists emerge. `rust` penalises hyper-specialists when demand shifts.
- Mastery perks (level >= 0.85): 3-6 "signature" actions in the whole game; they gate QUALITY not capability.
- Soft-lock: if only the smith dies, X is not impossible, just done at level 0 (1.0x) with extra waste.
Idle (leisure) XP:
- Leisure activities (existing: chat, explore, bond, wander) each map to 1-2 "hobby" skills: storytelling/teaching,
  scouting, tinkering, music, gardening. Rate = 0.25x work XP and the skill level reachable by hobby alone is capped
  at 0.4 of potential. So a gifted hobbyist can become decent but not expert without doing the work.
- Off-time shapes who a villager is (the tinkerer who invents) and later feeds discovery aptitude (2.5). It rides the existing leisure need and `strain` payback, so an over-ordered village starves hobbies: the right cost of micromanagement.
Measurable tests: grind bot (place/mine loop 50 days) must earn <5% of baseline XP. One-skill bot (8h/day single
skill) must be <= 70% of the XP of a 4-skill rotation per work-hour after day 5.

### 2.3 Automation versus player agency: finding the band
Failure mode 1: the village runs itself fully. The existing sim is exactly this (a watch-it toy; the author wants to "dumb them down so the player is responsible"). If it expands, builds and researches with no input, the player is a spectator and pillars 2, 3, 5, 6 are decoration. Watching is legitimate (pillar 6) but cannot be the only attractor.
Failure mode 2: it cannot run itself. The player is chained: micromanagement (DF's manual labour toggles are the famous pain point). Pillar 6 forbids chores and requires the village survive hours of exploring.
The band I propose: AUTONOMY MAINTAINS, THE PLAYER ADVANCES.
| decision | owner by default | why |
|---|---|---|
| eat, drink, sleep, flee, heal | villagers | survival; costs the player nothing |
| repair existing buildings | villagers | decay is existing design; chores for the player are banned |
| gather staples to a standing target | villagers, target set by policy | pillar 2 operational control |
| what NEW building/type to start, and WHERE | player (or blueprint queue) | creativity pillar 3 |
| expand to new site, new resource | player (order or expedition) | "advancing" is the game |
| research direction, which experiments | player nudge, villagers do | pillar 5 |
| who does what within a task | villagers (score board) | pillar 1; "you 5" overrides pick set only |
| risk (who goes into the cave) | player (possession) or standing "expedition" order | permadeath stakes |
Mechanisms:
- Villagers do not found new structure types on their own. They may, in the existing way, build the next rung of a
  type the player already placed (the housing ladder). Existing `ladderFor(v)` can stay for upgrade-in-place but
  its authority to start NEW kinds of buildings is withdrawn.
- Standing orders are cheap, durable, and decay-safe: "keep 200 wood" is a demand-vector term that persists across
  saves and ownership; "build 10 of blueprint X" is a queue item. A player who leaves for 30 minutes returns to the
  village having done its sustaining work plus the queue, not nothing and not everything.
- Stagnation not collapse. Measurable: with no orders for 10 in-game years on a fixed seed set, >= 90% of villages
  survive but < 20% have started a new building type or tech. The existing `sweep.js` already reports survival and
  complains both ways (<45% too harsh, 100% too easy); extend it to "unattended growth rate".
- Over-ordering costs are the existing ones: `strain` and the "push too hard and it overextends and dies" design.
  Keep it. It makes micromanagement mechanically worse than delegation, which is the right incentive.
- Alerts: at most one actionable notification per threat class (existing chronicle = feed). No timers, no streaks.
- Fast-forward as a design signal: if testers fast-forward because nothing is queued, the fix is bigger queues (blueprint chains, expeditions) and a free pause, never waiting as a mechanic.
- ASSUMPTION: a ~30-60 min unattended window is tolerable (design target, not data). RimWorld's pause-and-order loop and DF's "fortress runs itself until it doesn't" are the nearest references; Factorio tolerates AFK because a factory is a machine, a village is not.

### 2.4 Possession versus autonomous efficiency
Constraint (pillar 2, CONTEXT_BRIEF): "not mandatory or overwhelmingly optimal", and "same underlying world simulation".
Design: possession replaces `findJob` with player input on the same executor.
- The possessed villager keeps: needs (hunger, thirst, energy), `strain`, skill levels, wounds, inventory limits,
  carrying capacity, sight/lore (it perceives via its own memory-based knowledge for orders but the player sees a
  full view; anything learned goes into that villager's head and propagates only by gossip). Therefore knowledge
  stays embodied: possession does not leak map knowledge to others.
- Buff ("divine inspiration"): +15% work rate, +10% stamina efficiency. Zero XP multiplier. Zero need relief.
  Why 15%: it is below the gap between a novice and a gifted master (1.0 vs 1.8 effect), so possession never
  beats simply having a master. Also below one tool tier (1.5 -> 2.4 = +60%).
- Why this cannot make manual play "overwhelmingly optimal" for output: one body at a time. Possessing one of a 40-
  person village adds ~0.4% of village labour. Possession is a capability tool, not a production tool.
- Where it IS strong, and where to cap it: exploration/combat judgement. The risk is skilled players beating AI by
  kiting. Counters, all in the shared sim:
  1. Combat uses stats/skill/stamina; dodge/block cost stamina; no invulnerability frames beyond what AI also uses.
  2. Hostile AI uses the same sight/lore (they track, lose track, give up); no infinite kiting because stamina bounds
     the kite and hunting fauna are tired too (existing animals have hunger/chain).
  3. Permadeath applies to the possessed. Death during possession is real death; no soft respawn. The player is not
     at risk, the villager is. That is the entire cost model of "the god's gamble", from the Discord example.
  4. Possession buff is cancelled when the host's HP < 30% so panic play gets no help.
Exploits and kills:
- Possess the best miner forever: they accrue `strain` and need food and sleep like anyone else. Existing rule
  "working through leisure builds strain, paid back in idleness later" does the work. When strain is high the
  host "snaps out" (possession released) or slows. They also do not level faster. Result: no gain from a
  permanently possessed best miner beyond the base +15% for hours, and the village loses nothing.
- Swap possession to bypass needs: `strain` and vitals are per villager, never reset on possession; swapping
  spreads load but the total needs of work done is unchanged. Add a possession "afterglow": a 60 s refractory
  before the same villager gets the buff again, so ping-pong swapping has no additional benefit. ASSUMPTION: 60 s is
  enough; tune on harness.
- Possessed never tires: no. Energy drains as usual; at "exhausted" possession is released (the villager collapses/
  naps). Only change is the choice about where and when.
- Possess a villager to dodge consequences of a bad order: not a mechanic. There is no "rewind".
- Possess a villager to feed/heal others instantly: no; movement and action times same as AI.
- Possess to farm XP in a safe high-yield spot: covered by challenge-matched XP and `rested(s)`.
- Possess a child/elder: allowed, same sim; they are weak. Nice story hook, no exploit.
Test: harness runs scripted "player" agents (optimal macro bot) vs AI-only; measure output ratio per possessed
villager at equal skill. PASS if 1.0-1.25x. And hazard-survival: possessed death rate in cave tasks must not fall
below 0.5x the AI rate at equal skill (otherwise possession is a cheat code against risk).

### 2.5 Technology progression with emergent discovery
Risks, in order: (a) brute-forceable (Little-Alchemy-style combine-all); (b) opaque (nobody finds anything); (c) wiki-
solved (static recipe table); (d) unrecoverable (soft lock); (e) invisible (progress without feeling).
Minimal mechanism that the rest of my analysis assumes (the detailed design belongs to Investigator B; I only
require these properties so balance holds):
- Everything material has a small property vector (e.g. hardness, melt point, flammable, conducts, brittle, edible,
  toxic). Capabilities (heat to X, enclosed room, bellows) are also properties of structures. A "discovery" is a
  rule over properties: "ore with melt < kiln_temp in a reducing atmosphere yields metal". The recipe table is the
  consequence, not the input.
- The search space is limited by the CIVILIZATION's observed frontier: only materials/tools that someone has
  seen/held may be tried (ties to the existing `lore.js` cell-memory: you can't experiment with what no one has
  seen). With ~12 known materials the pair space is 66, not thousands.
- Each experiment consumes materials, requires a station that provides a capability, and takes villager-days at a
  skill-dependent success chance. Rate of discovery is therefore bounded by labour, and labour is the village's
  scarcest thing.
- Hints (a villager notices that a green stone "sweated" in the fire) are generated by the SAME rules during normal
  work (fire + ore adjacent = observed event). So the informed route is: do your work near interesting conditions
  and pay attention; the brute-force route is: run all pairs. Informed ~1-2 villager-weeks, brute ~3-5x. ASSUMPTION
  numbers; the structure is what matters.
- Perturb properties per world seed (melt points +/-10%, which ore alloys) so recipe tables from forums only half
  transfer. ESTABLISHED precedent: Dwarf Fortress generates materials/creatures per world; Noita randomises one
  alchemy recipe set per seed (I recall this; moderately confident). The trade: per-seed perturbation makes
  balance testing harder, so keep it small and test across seeds in the harness.
Brute force specifically: "can the player brute-force?" Yes, intentionally, at a labour/material cost, and no more.
Prevent only the free kind: no experiment without consuming something; per-station cooldown (one experiment per
station per day); experiments on unseen items impossible. If brute force is the optimal strategy, then the
informed route needs a bigger reward (faster, cheaper, yields quality) not a lock.
Soft-lock list and the fix for each:
| lock | cause | fix |
|---|---|---|
| key material absent on this island | worldgen | headless validator on every generated planet: capability graph reachable from bare hands via >= 2 routes within the explored area plus N expedition-radius; regenerate if not (Spelunky-style guaranteed-solvable generation; ESTABLISHED technique) |
| only holder of the knowledge died | permadeath | knowledge diffuses (teaching/observation/hobby); rediscovery cost x0.4 for anything known to have existed (chronicle entry = hint). Skills never gate ability (rec. 11) |
| resource exhausted | deposits finite | slow regeneration of surface stocks (existing: rock piles regrow); deep deposits are large and exposed by erosion/cave-ins events if stuck (see pacing below) |
| population too dull ("never wants more") | existing `ambition` model | the player can set a research focus (an explicit push, existing `mind` push); wanderers/immigrants refresh the gene pool; do not make ambition a hard gate |
| population too small/collapsed | famine | existing `peril` rules and wanderer migration; ruins can be resettled (existing) |
| tech needs capability not buildable | freeform building ambiguity | each room type has a minimal recognised blueprint shown in the "what I'd need" help; alert on near-misses |
| stuck for years with no event | no pressure | pacing: a mild RimWorld-storyteller-like director that only nudges environment (a landslide exposes ore, a drought pushes migration). ESTABLISHED idea (RimWorld storytellers). Keep it environmental, not "raids". |
Detection: the same headless harness runs 20 seeds x 50 in-game years with a "competent bot player" and reports the time to
each capability and a stuck rate. Target: stuck rate < 2%; if > 0 each case gets a bug report. This is the same
discipline as the author's `sweep.js`.
Technology vs numbers: pillar 5 wants capabilities, not +%. Balance check: no tech grants a flat % bonus. Each unlocks
a verb (smelt, dig below water table, preserve food, carry via wagon). The existing tool tiers are +yield multipliers;
they can stay as "material properties of a tool" (harder metal = better yield), which is emergent from the property
vector, not from a tech-tree % node.

### 2.6 Divergent tech paths and collective belief
Content cost: with P paths and E eras and C capability slots, naive content = P x E x C units, each needing
buildings, items, art, sim rules, UI and tuning. For C=12, E=3, P=3 that is ~108 units versus 36 for one path.
Costs also multiply for balance: every pair of paths must be tested against each hazard, and for each pair of paths you
need an interaction story (can a biotech civ trade with an engineering one?).
Recommendation: a path is a BIAS, not a tree.
- Define ~12 capability slots (heat, light, preserve, move heavy things, medicine, signal/communication, cutting,
  structural, cooling, power, knowledge storage, energy source). Each slot has 2-3 implementations with different
  property profiles (e.g. "heat": wood fire -> charcoal kiln -> coal furnace -> ... ; "light": torch -> glow moss
  cultivated -> electric lamp).
- The player's path emerges from which implementation they happen to discover and invest in. There is no "choose
  engineering". Distinct strengths and weaknesses come from properties (engineering = high up-front material, scales
  with population and mining; biotech = living infrastructure that needs care and self-repairs but spreads disease;
  mysticism = depends on rare sites and rituals). This reuses the single discovery system.
- For the first planet, ship 1 implementation per slot + 1 alternative on 2-3 slots to prove the architecture. That
  is the cheapest honest test of "divergent".
- Balance of paths: treat each as a risk-return profile (variance vs steady) rather than a strength number. Compare
  by time-to-capability and by survival under standard hazards. Do not seek parity; seek "each path is better at
  some hazard" (rock/paper/scissors on hazards, not on power).
Collective belief (Orks). Verdict: a good fit with the author's lore/gossip system, a bad fit for a first planet.
Rules if it ever ships (clear and limited, as the brief demands):
1. Belief is a per-villager scalar `conviction(claim)` spread by the existing gossip mechanism at reduced strength
   per hop, exactly like `belief()` degrees in `lore.js` (the architecture exists).
2. A belief-tech only works when total conviction among those WITHIN range of the effect exceeds a threshold;
   effect size = `sqrt(sum conviction)` (diminishing returns so population cannot snowball).
3. Each use SPENDS conviction; regrowth requires leisure time (ritual, story) which costs labour. A sink.
4. Failures observed by believers reduce conviction (doubt is contagious, same gossip). So a belief tech that
   regularly fails collapses; one that regularly works reinforces: a feedback loop that must be capped by (3).
5. Bounded effects: modest and qualitative (the Orks' "painted-red-goes-faster" effect is a small multiplier),
   never a replacement of material needs.
Exploits to pre-empt: (i) population stacking, killed by the sqrt; (ii) the player as a mind-controlling god, killed by
not letting possession or orders write conviction directly; (iii) death/sacrifice farming for faith: no conviction
from deaths ever; martyrs add grief, not power; (iv) a self-reinforcing runaway: killed by spend (3) and a cap per
claim; (v) the unfalsifiable belief that never fails: only allowed if its effect is cosmetic, otherwise it must be
observable.
Cost: ~2-4 FTE months (ASSUMPTION) plus a lot of tuning; value is distinctive. DEFER; do not let it block the first
planet. If cut, the architecture above is a design hook, not code.

### 2.7 Simulation complexity: which systems add CPU but not decisions
Test for any system: "what decision does a player or a villager make differently because of this?" If none, cut.
Cut or reduce:
| system | verdict | reason |
|---|---|---|
| Full pairwise relationship graph (opinion of everyone) | CUT; keep sparse top-5 ties | O(n^2) memory and updates, no decisions beyond who pairs/who grieves. Existing sim already has only bonding, parents, belonging. Keep that. |
| Per-item-instance records (quality, history, owner) | CUT; use stacks + a small set of "named" items (heirlooms) | item counts explode (piles of 10^5); decisions only need stack counts |
| Per-tile temperature/fluid/gas simulation | CUT for MVP | huge CPU and design surface (Dwarf Fortress's fluids/temperature are the main FPS killers, ESTABLISHED widely known); use zone flags (warm/cold/wet) from buildings and a global weather |
| Structural integrity / collapse physics | CUT (cave-in as an event on dig density, not physics) | Terraria/Minecraft don't have it either; the existing `caveIn` is an event |
| Rich "thought" mood stack (RimWorld has dozens) | REDUCE to ~6 causes | mood must change behaviour; at 6 causes it does |
| Full-granularity lore cells for every slime on a big map | REDUCE; coarse cell at distance, per-patch only near | the existing design is the best part of the sim, but cost is O(slimes x cells). UNVERIFIED perf beyond README "1.4 ms/tick for 100 slimes" |
| Soil fertility, trampling per tile | KEEP (cheap float arrays) but consider ending at ground-level layer only | visible, cheap, produces desire paths |
| Weather | KEEP as two globals (warmth, rain) | existing |
| Plants as individual entities, animals as entities | KEEP but give far chunks aggregate sim | existing has ~1,500 plants + 360 animals just for one island and 20 days took 30 s at 161x; larger maps need LOD |
| Mutation/gene modeling with many genes | KEEP 9 traits; no allele model | alleles add maths not decisions |
| Per-slime memory of everything seen | KEEP, TTL by kind (existing `holdFor`) | fine |
| Room recognition | KEEP, but incremental flood-fill on edit events only, never per tick | cost ~0 amortised; it IS the creative pillar |
| Social "history" per slime | KEEP ring buffer 30 entries (existing `log`) | enough to tell a story |
Principle (ESTABLISHED, from the author's own measurements): "coarser dt costs MORE work per sim-second than fine dt".
Fix the step; scale by LOD, not by changing dt.

### 2.8 Scaling
Population.
- ESTABLISHED: Dwarf Fortress is notorious for "FPS death" with ~100-200+ dwarves plus many items and pathfinding;
  RimWorld slows noticeably above ~30-50 colonists/animals; Kenshi struggles with huge squads and big bases; Songs of
  Syx is the counterexample, designed for very large populations by engine/data discipline from the start (single
  developer, custom engine). I'm confident of the pattern, not of exact numbers.
- Design contradiction: "interesting individuals, not disposable numbers" fails above a few dozen. I assume attention
  caps at ~20-40 named individuals (ASSUMPTION; Dunbar-like, no citation). So: first planet design population 6-60,
  hard sim budget 150 full-sim agents; beyond, units become "crews" (aggregate headcount with a leader + skills sum),
  not individuals. Pillar 7 (automation of scale) is the same idea: "maintain supply network" is a crew.
- Existing sim: a village of 5-70 with 1.4 ms/tick/100 slimes (README, UNVERIFIED): ample.
Map size.
- Existing islands are 9,000-72,000 read-only tiles. Destructible terrain needs sparse dig deltas (the existing soil technique): ~a few hundred tiles/day x 100 B ~ 3 MB per 100 days. OK.
- Chunk the world; simulate active chunks fully; on revisit "catch up" regrowth, decay and spoilage by closed form (Minecraft does not tick unloaded chunks: ESTABLISHED; catch-up is my addition). ASSUMPTION: adequate at first-planet scale.
- Full 3D voxels multiply art, pathing, rendering and meshing cost by roughly an order of magnitude for this team (SPECULATION; the brief asks for costing). Recommend layered 2D for v1.
Items: merge piles per tile, conserve matter, cap loose entities per chunk with villager-driven tidy-up into stockpiles; rot and decay are the sinks, not despawn timers.
History log: ~10 events/day x 100 days x 100 years x ~100 B ~ 10 MB, too big for a JSON save already at a few MB. Keep all "firsts" and top-K per year, compress old years to counts and names, per-slime ring buffer of 30 (existing), full records only for notable dead. Budget <= 1 MB.

### 2.9 Runaway production and economy sinks
Without belts, the snowball path is: blueprint x autonomous builders x standing orders ("build 10 of X" + "keep 200
of Y"). Specific loops:
1. Production buildings compounding materials into more production buildings. Bounded by labour: each building needs
   staffing, and staffing is the villagers' only scarce thing. Make the throughput of each workplace depend on a
   named worker's skill and presence (a bakery without a baker makes nothing).
2. Decay as the master sink (existing, keep): every building loses hp; repair uses the building's own materials. A
   village of 50 buildings has a standing maintenance load ~ proportional to count. Growth saturates when repair labour
   equals available builder labour. This is the existing "everything standing is falling down" design.
3. Spoilage (existing granary/store logic) caps hoards of food. Tool wear (existing `durability`) caps hoards of
   iron-working. Add a decay for exposed stockpiles (rain/pests).
4. Resource depletion and territory range (existing `RANGE_*`): wood/stone near the village deplete and distance costs
   carrying time; the transport ladder (hands -> box -> backpack -> wagon) shifts the curve but stays labour-bound.
5. Luxury sink: surplus feeds feasts, music, decoration (mood/belonging, no production return); gives the creative playstyle an economic role.
6. Population cap emerges from food + land + homes (existing); add none.
7. Orders cannot loop forever: "keep N" pauses when met; a starving village eats first.
Anti-hoarding: food stores attract vermin/predators and fire/disease when dense (environmental, no director). RimWorld scales raid strength with colony wealth (ESTABLISHED); here the equivalent is physical, since the brief discourages arbitrary difficulty scaling.
Measurable: harness bot "max expansion" for 5 in-game years must hit a plateau (growth rate < 5%/year) set by
labour/maintenance, not run to infinity; if it does not, a sink is missing.

### 2.10 Other degenerate strategies
| strategy | assessment | counter |
|---|---|---|
| Death-farming (kill villagers for resources/mana/XP/belief) | The original notes (prm) had a mana economy where deleting living things gains mana (prime-age pays double). This is the single most dangerous idea to carry forward. | No resource, XP, belief, or knowledge arises from death. Only dropped items. Grief/fear moods spread (existing `fear`/`cry` relay in lore.js). Any "god power" currency comes from happiness/ritual, not sacrifice. |
| Cull for genes (expose the unfit) | unavoidable | allow; grief, fear, belonging drop and heritability < 1 keep returns small |
| Possession combat cheese (kite, stair-dance, door-fight) | Pillar-level risk | shared stamina/AI sight, give-up behaviour, ranged weapons need ammo and line of sight; test with bot |
| Wall-in vs hostiles | In a world of wildlife with needs, not raid waves, walls are a fine and cheap answer, and correct | hostiles that cannot reach a target lose interest, burrowers/climbers exist; a wall does not protect outside work; tower/archer cheese limited by ammo + LOS. Avoid a wave director, which converts walls from a tool into the only strategy (the Kenshi/RimWorld/tower-defence pattern). |
| Save-scumming permadeath | Acceptable in single-player | The sim is deterministic and saves RNG state, so reload replays the same outcome unless input changes (chaotic timing shifts make scumming weaker than RNG-reroll games, not impossible). Offer an optional autosave-only mode (RimWorld has commitment modes); no anti-cheat; fix the bugs and unfair deaths that really cause reloads. |
| Hoarding / infinite breeding / order-spam / ruin-salvage | covered by 2.9 and existing rules (births weighted not gated, land slack, homes; needs before orders; salvage 0.55) | keep |
| Blueprint-spam land grab | territory, materials, decay | cap queued sites per builder crew |
| Dig to bedrock safely | depth alone must not be the danger | environmental hazards (water table, gas, cave-in span length) per pillar 4 |
| Idle at 50x to breed through generations | speed multiplies everything | genetic costs and obsolescence (2.1) |

### 2.11 Reference lessons (only those I am confident of)
- RimWorld: storyteller = pacing without scripts; wealth-scaled threats = known anti-hoarding lever; priority grid = delegation; commitment modes = permadeath option.
- Dwarf Fortress: outlier skills and manual labour toggles; FPS death with many dwarves/items. Cap individual spread, budget agents and items.
- Kenshi: skill-by-doing is exploit-prone; reduced-fidelity offscreen sim; years of mostly solo development (fairly confident: 2006 start, 1.0 in 2018).
- Factorio: blueprints are the repeatability feature; blueprint x builders needs a labour limit or it is Factorio without belts.
- Songs of Syx: huge populations by day-one engine design (solo dev); not wanted here. DQXI's dual view suits authored grids; emergent destructible worlds double the test surface, so ONE view.
- Spore: staged scope, thin stages; pillar 10 is the same risk. No Man's Sky 2016: promised features missing at launch; do not pre-announce space/multiplayer. Godus: expansive crowdfunded promises, hollow loop; the manipulative-loop failure mode the brief bans.

## 3. Alternatives considered
- Hard cap on genetic potential (Discord idea): rejected; a wall the player feels, fights the author's `settle` philosophy.
- Zero-sum trait budget: rejected; manual allocation in disguise, kills sudden-excel mutation.
- Alleles/dominance: rejected; maths without decisions.
- Skills: no gene coupling (violates pillar 1); per-action XP (grindable); time-based XP (idle at 50x); level-gated recipes (soft-lock under permadeath). All rejected.
- Full RTS control: rejected (pillars 6, 7). Pure focus-knob autonomy (current slime-village): rejected for a god-player with blueprints.
- Possession: stronger buff (+50-100%) makes manual optimal; resource-cost possession is an energy system (banned); cooldown timers are artificial timers (use natural `strain`). Rejected.
- Tech: fixed tree (pillar 5); pure random discovery (untestable); free combine-everything (brute-forceable); parallel full trees per path (cost x P). Rejected.
- Full 3D voxels first, or two cameras in v1: rejected on cost and test surface.

## 4. Risks and tradeoffs
1. Genetics tuning is invisible. A player cannot see whether breeding matters. Risk of effort that no one notices.
   Mitigation: show lineage in the inspector (founder, line colour, "weak line"), chronicle births of exceptional
   slimes, and make the first obvious effect (an exceptional digger) a story event.
2. Convex costs plus noisy phenotype may make genetics feel arbitrary. Mitigation: coarse words, consequences phrased
   as observable (existing `TRAIT_INFO` style).
3. Skills add a second axis and increase cognitive load. A villager now has traits (9), skills (~8), needs (5+),
   personality. Many games stall on this. Mitigation: show at most 3 "notable" facts per villager in the default view.
4. The "autonomy maintains, player advances" band assumes players want to be the advancing force. A pure-watch player
   gets stagnation. Acceptable by design, but cut messaging: do not call it a failure.
5. Anti-exploit limits can frustrate legitimate play (rebuilding a wall). Apply `rested`/non-virgin to XP only, never to resources or actions.
6. Possession is the most exciting hook and the weakest-bounded balance risk (combat). Keep v1 hazards non-combat (cave-ins, cold, thirst, a predator that mostly flees).
7. Emergent discovery is design-heavy: either everything is found by accident or nothing is noticed. One discovery for the MVP; ten is a multi-year content job.
8. Determinism: destructible terrain, player input and possession all feed the RNG. Keep the save round-trip gate on every feature; log player input in any replay.
9. Time scale: a 4-7 hour life at 1x spans ~2-4 sessions (fine), but "hundreds of hours" across eras means eras outlast lives, so knowledge transmission carries continuity. XP constant K scales with lifespan. Flagged for B/director.
10. README-vs-code drift in the source (see audit): treat code as truth.
11. The biggest project risk is not any mechanic; it is all ten pillars at equal fidelity for a solo/duo team (section 7).

## 5. Unresolved decisions (each with a recommended default)
| # | decision | default |
|---|---|---|
| 1 | Does the player ever pick mates? | No. Indirect only (housing, proximity, risk). |
| 2 | Genotype visible? | No. Phenotype + coarse words + observed performance. |
| 3 | Clone-split allowed? | Yes, rarely: 1 per life, with genetic load, last-resort kept. |
| 4 | Trait cost exponent / k values | k=1.0-1.2, quadratic above 1.0. Tune with harness. |
| 5 | Potential range | 0.70-1.00 around genes; effect 1 + 0.8*level. |
| 6 | XP model | challenge-matched, value-based, `rested`, non-virgin rule. |
| 7 | Leisure XP cap | 25% rate, 40% of potential. |
| 8 | Possession buff | +15% work rate, +10% stamina efficiency, no XP bonus, 60 s refractory. |
| 9 | Does possession release on need critical? | Yes (snap-out). |
| 10 | New building types started by villagers? | No; only upgrades of types the player placed. |
| 11 | Unattended window target | 30-60 real minutes without loss beyond mild decay (ASSUMPTION). |
| 12 | Permadeath save policy | Allow reload; offer "autosave only" mode; no anti-scum code. |
| 13 | Population design range | 6-60 named individuals; 150 full-sim ceiling; aggregate crews beyond. |
| 14 | Tech paths for first planet | One path, with 2-3 alternate capability implementations to prove architecture. |
| 15 | Collective belief | Defer. If built: rules in 2.6. |
| 16 | Hostile design | Wildlife with needs and environmental hazards; no wave director; mild pacing director for environment only. |
| 17 | Per-seed property perturbation | Yes, +/-10%; validated by solvability harness. |
| 18 | World representation for cost | Layered 2D grid with sparse dig deltas for v1. |
| 19 | History log size | <= 1 MB; firsts + top-K per year; summaries for others. |
| 20 | Item model | Stacks + piles + a few named heirlooms. |

## 6. Dependencies on other systems
- Investigator A (gameplay): 2.3/2.4 hold only if orders are multipliers on a shared score board; direct need-overrides void my possession and exploit analysis.
- On Investigator B (civ/progression): discovery mechanism (2.5) must be a property-space rule system as assumed here,
  with a frontier restricted to observed materials; knowledge transmission must cover recipes/designs; era length sets K.
- Technical architecture: `virgin` bit and dig deltas in the save; player input in replays; LOD/catch-up; incremental room recognition; the existing denylist save lets skills/ancestry save for free.
- On the existing sim (see `existing_material.md`): reuse `settle`, `breed`, `strain`, `temper`, `lifePace`, demand
  vector, claims, `peril`, decay, ruins. Changes: skills, ancestry, clone limits, trait upkeep, no village-initiated new building types, possession executor, player-origin cell tags.
- Art/UX: cues for "weak line", "gifted", "rust", "afterglow" with little UI weight.

## 7. MVP vs later

### 7.1 Central claim and the smallest prototype that tests it
Claim: "autonomous individuals + player orders at multiple scales + freeform functional buildings + emergent discovery
feel like one game."
Smallest test (builds on the author's suggested prototype, trimmed):
- World: ~64x64 surface grid + 1-2 underground layers, destructible with sparse deltas, one biome, one season cycle.
- 5 slimes (existing needs, traits, jobs, lore). 3 skills only: dig, build, craft (+ gather as skill-less).
- Orders: (1) assign N villagers to a task, (2) "keep X in stock" as a demand term, (3) place a saved blueprint.
- Freeform building: floors/walls/doors/furniture pieces; ONE recognised room type (enclosed >= 6 tiles with a door and
  a bench = workshop). One blueprint save + "build 3 more".
- Mining: mine tiles; automatic mining expeditions to "find stone" (existing scouting).
- One hazard: cold nights (existing) plus cave-in risk when mining wide spans. No combat.
- Possession: WASD move, click to act, via the same job executor; +15% buff; strain/needs on.
- One emergent discovery: the first fire-assisted craft (e.g. heat-hardened tool or kilned brick or smelted metal)
  discovered by experiment or observation, which unlocks a verb. No tech tree screen.
- Chronicle: one line when the discovery lands, one when a villager dies.
- Harness (this is the part most prototypes skip, and it is the cheapest of all): headless run, 20 seeds,
  bot-players (idle, competent, exploit).

### 7.2 Acceptance criteria for the prototype (measurable)
1. Unattended: with zero commands, >= 90% of 20 seeds survive 20 in-game days from the fixed start; < 20% start a
   new building type.
2. Influence: assigning 3 of 5 slimes to dig raises dig output within 2 in-game days to >= 2x baseline; "keep 30
   stone" holds stock within +/-20% by day 5.
3. Development: a slime working one skill for 15 days exceeds a control by >= 25% in that skill's effect; a
   place/mine bot earns < 5% of baseline XP.
4. Construction: a player-designed workshop that meets requirements is recognised in < 1 s after the last piece; a saved
   blueprint is built by autonomous builders at >= 90% fidelity in 3 days with required materials.
5. Exploration: an expedition finds at least one non-trivial resource within 2 days in >= 80% of seeds.
6. Discovery: in >= 80% of seeds the discovery happens by day 40 under a competent bot, and in < 10% under the brute-
   force bot with a 2x-material budget before day 20 (so informed play wins). Stuck rate < 2%.
7. Same sim: a possessed slime and the same slime autonomous differ in output by 1.0-1.25x, never more; the
   save/restore round-trip test passes with a possession session in the replay.
8. Genetics: the breed-the-best bot (30 gens, perfect info) leads to <= 1.15x output per food vs control.
9. Perf: 60 slimes + 2,000 plants run at >= 60x realtime on a laptop (existing: 161x with 6 slimes; ASSUMPTION it holds).

### 7.3 Person-month ranges (ASSUMPTION, one full-time-equivalent month = ~160 productive hours)
Assumes reuse of slime-village (JS/TS; another engine means ~2-3x on sim lines) and a solo/duo hobbyist (~15-25 hrs/week, ~0.4-0.6 FTE).
| item | FTE months | notes |
|---|---|---|
| Port/adapt existing sim core (needs, jobs, genetics, lore, save) | 1-2 (JS) / 4-6 (new engine) | the largest saving; tests are reusable patterns |
| Skills/XP/rust/leisure hooks + genetic costs, ancestry, clone limits | 0.8-1.7 | formulas small; tuning is the cost |
| Order system (assign / keep-N / blueprint queue) | 1.5-3 | mostly UI/UX |
| Possession executor + minimal controls | 1-2 | combat extra |
| Destructible 2D layered world + deltas + save | 2-4 | rewrites world.js assumptions |
| Freeform construction + room recognition | 2-4 | UX heavy |
| Blueprints (save, ghost, queue, build) + mining/caves/expeditions + hazards | 4-8 | |
| Emergent discovery (one era step) | 2-4 | design-heavy; 10 discoveries ~ 8-15 |
| Knowledge transmission + chronicle/inspector | 1.5-3 | existing chron/log helps |
| UI/UX overall (panels, selection, orders, tooltips) | 3-6 | consistently underestimated |
| Art + audio (pixel/billboard, placeholder first) | 3-8 | |
| Content (items, recipes, creatures, buildings) | 2-5 | |
| Balance harness + exploit bots | 1.5-3 | highest return of anything here |
| Playtest/balance/bugfix (rolling) | 20-30% overhead | |
Prototype (7.1): ~ 7-12 FTE months of the above -> at 0.4-0.6 FTE: roughly 14-30 calendar months. Treat as a wide
band. If fewer than that: ignore art, ship a grey-box.
"Complete first planet" (stone to metal to simple industry, one tech path with 2-3 alternatives, ~30-60 content
discoveries, polished UX): 30-60 FTE months => 5-10 years at hobby pace (ASSUMPTION). That is the honest scope
risk: it is Kenshi/Songs-of-Syx scale. Use this to shrink the first planet's content (fewer eras: Stone, Metal,
early Industry), not to extend the schedule.
Extras if added, each: +2nd camera view 3-6; first-person 4-8; second species 6-12; each extra full tech path 4-8;
collective belief 2-4 + tuning; trains and carriages 2-4; multiplayer visiting 6-12+; space 12-24+.

### 7.4 Scope killers (in order)
1. Full 3D voxels + first-person + billboard sprites (art + rendering + pathing + UI x3).
2. Multiple species / paths / cultures at full fidelity.
3. Emergent tech authored at scale (each discovery is a hand-tuned content item; quantity kills).
4. Freeform building UX (ghosts, rotation, undo, blueprint editing, validation messages).
5. Combat and possession polish (animation, feel, AI).
6. Space / multiplayer (explicit expansion).
7. Free-for-all balance without bots (it is the invisible multiplier on everything else).

### 7.5 What to cut from the brief for a shippable first planet
Cut now: space, multiplayer, other species, collective belief, books/documentation, other civilisations' ruins, trains,
first-person, second camera, structural physics, fluids/temperature simulation, relationship graph.
Defer to post-launch: alternate paths beyond the 2-3 slot alternatives; carriage tier; second hazard family;
apprenticeship UI beyond simple "learns near a master".
Keep (identity): needs + genetics + skills; three order scales; possession (simple); freeform rooms + blueprints;
destructible exploration; one-era-leap emergent discovery; chronicle; permadeath.

### 7.6 Essential for the vertical slice from MY area
- Skills with the non-virgin rule, challenge-matched XP and `rested`.
- Trait upkeep (pleiotropy) and clone limit (simple edits to existing code).
- Autonomy band: no new building types started by villagers; keep-N orders.
- Possession with same executor, +15% buff, no XP bonus, snap-out.
- Exploit-bot harness with at least grind/breed/possess bots.
- Solvability validator for the one discovery.
Deferrable: inbreeding, hidden genotype tuning, rust, leisure XP cap tuning, pacing director, belief, path biases.
