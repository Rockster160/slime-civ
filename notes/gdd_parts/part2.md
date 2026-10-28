## 08. Inhabitants, Genetics & Personalities

Status tags: **AGREED** = author direction, **DECIDED** = director ruling (R#), **PROPOSED** = new mechanic drafted here. All numbers are starting values; ASSUMPTION = unvalidated; P# = phase-gate prototype.

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
| drive | 0.75–1.25 | wants to be doing things; burns out sooner | strain accrual, ambition for work vs leisure |
| leisure | 0.6–1.5 | needs more downtime, sociable | leisure need, hobby XP, bonding |
| fertility | 0.8–1.2 | children come sooner and more often | breed cooldown |
| longevity | 0.9–1.1 | lives and matures slower | life-stage lengths (`lifePace`) |
| maxHealth | 85–115 | survives hits, cold, hunger | health pool, recovery |

Plus **colour** (inherited in HSV hue-space, not RGB, as in slime-village). Colour is identity and kinship: names are drawn from the hue band, "belonging" is colour kinship with the settlement, and the 7% hue "sport" mutation (45–150 degrees) remains the one explicit big-jump mutation of the carried-over design.

**Aptitude (PROPOSED, C/D).** Each craft skill (§10) has an aptitude in about 0–1 *derived* from 2–3 traits (e.g. mining: strength, stamina, intelligence; smithing: strength, intelligence, drive). It is not a separate gene: it is a weighted read of existing traits through `settle()`. This keeps nine genes and gives skills a ceiling (§10).

#### Inheritance (carried over)
A child's trait is built per trait from two parents A and B: 22% copy A, 22% copy B, 28% midpoint, 28% random point between A and B, then ±5% multiplicative noise, then `settle()`. This produces "average-ish of the parents, but might suddenly excel at one trait" (AGREED, author's own words). Drive additionally drifts ±5% so a settlement's character changes over its history (carried over).

**Mutation (DECIDED, uses carried-over mixture plus one new rule).** The mixture already produces sudden excel/weakness within the parents' range. To satisfy the author's "sudden excel / sudden weakness" wording beyond the range, PROPOSED: each trait of each child has a 4% chance (ASSUMPTION, P-genetics bot) of a "sport": a jump of ±8–15% of the trait value applied before `settle()`. Sports are logged in the child's personal log ("born unusually quick for this line") and credited in the chronicle only for traits that reach "exceptional".

#### `settle()` soft cap (carried over, R16)
`settle(v, mid, soft)`: values within `soft` (0.5, drive 1.2) of the middle pass untouched; beyond that the excess grows logarithmically, `mid + sign*(soft + soft*log1p(over/soft))`. No hard ceiling: a dynasty pushing for fifty generations does get somewhere ordinary lines cannot, it just never runs away. Applied to every child's trait *and* to derived aptitude and to skill levels (§10).

Caveat carried from D's audit: `settle` is inert for the whole range 0.5–1.5 and founders top out at 1.2, so by itself it is a speed bump (toy Monte Carlo plateaued ~1.7x on every trait in ~10–15 generations). It is therefore never the only guard; see below.

#### Guards against min-maxing (DEFAULT R16; D's set A–F)
1. **Convex trait upkeep.** Above 1.0 a trait adds drain to food and sleep: `upkeep = 1 + sum(k_i * max(0, t_i - 1)^2)`. Starting values: strength k=1.2 on food (1.2 -> +4.8%, 1.5 -> +30%, 1.7 -> +59%); speed and stamina same form on energy (k=1.0); intelligence k=1.0 on sleep need plus a small lifespan cost; drive raises strain accrual (burnout, carried over); fertility vs longevity trade via `lifePace` (carried over). An everything-1.7 villager needs roughly 1.5–2x the food and sleep. Average villagers pay nothing, so early game is untouched.
2. **Environment-dependent value.** The marginal value of a trait depends on context: cold biome rewards maxHealth and low upkeep; plains reward speed; cave work rewards strength+stamina; winter punishes high upkeep. Tools cut the weight of raw traits (a tier-3 tool halves the strength exponent in the yield formula). So there is no single best genome and the best line for the jungle is mediocre on the tundra.
3. **Clone limit.** Solo split (`bearChild(a,a)`) is allowed at most **once per villager per life** (plus the carried-over last-resort case when the settlement is near extinction). A clone's traits regress 25% toward the population mean, starts at half strength (carried over) and carries stacking load per consecutive clone generation (-6% maxHealth, -10% fertility). Monoculture lines are hit harder by disease/pest events when those exist.
4. **Hidden genotype and inbreeding depression (conditional).** Added only if the breed-best bot misses the gate. If added: the inspector shows phenotype words only, with ±8% expression noise (heritability ~0.6–0.7), and ancestry ids (parents + 4 grandparents) give `F ≈ 0.5*kin`: siblings -12.5% health and -20% fertility, labelled "weak line". Cost ~6 ints per villager, no per-tick work.
5. **Bounded gene effect.** Genes move any output by roughly ±25% (R16). Large multipliers live in tools (1.5–5x) and skills (up to 1.8x). A perfect line is worth less than one tool tier.

**Gate (R16, bot test):** a bot that picks top-K parents by true genotype for 30 generations must produce mean settlement output per food unit <= 1.15x a random-breeding control, with extinction rate under an injected disease event >= control.

#### Needs (carried over, trimmed)
Vitals ported from slime-village `ai.js` (values rescaled to the R1 time anchor): hunger, thirst, energy, health, mood, plus **strain** (debt from skipping leisure, paid back in idleness) and **hardship** (lifelong record of hunger/thirst/exhaustion/cold nights, feeds frailty). Leisure is a first-class need: `leisureNeed ∝ traits.leisure * (1 + strain*0.35)`. Shelter quality drives lifespan (carried over: "sleeping badly shortens a life"; a leaf bed is worse than a lean-to, a built house buys it back). Winter cost falls only on the unsheltered. The player never manages needs; villagers meet them autonomously (R8), and a critical need beats an order (§09).

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
5. **Needs**: bars for hunger/thirst/energy/health/mood/strain.
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
- **Over-ordering burnout**: strain accrues if the player never lets villagers rest; carried over, it is the intended cost of micromanagement.

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
| Nine traits + colour, mixture inheritance, `settle()`, convex upkeep, clone limit, ±4% sports | Hidden genotype and inbreeding depression (if bot gate fails) |
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
2. **Standing orders** ("keep N of X") evaluated every ~10 game seconds.
3. **Village demand**: the carried-over demand vector (once-per-second, rewritten per this game's resources) emits board jobs when nothing else covers a need (food low -> forage/farm; shelter -> build from starters; firewood; repair; replanting; hauling). Hauling jobs are generated by events (item outside stockpile, construction needs material, station needs ingredient, standing-order output).

Pickers: an idle villager scans open jobs in nearby chunks (<= ~200 candidates), scores them, and takes the best; ~20 picks/s at 200 villagers is cheap (C). Re-planning cadence ~1 per 10 game seconds per villager, staggered by id.

#### Explanation classes (DECIDED R5)
In priority order: **critical need > player order > standing order > village demand > personal leisure.** Every job carries its class; the class is what the Why panel prints.

#### The score function (PROPOSED numbers, P-order/need thrash)
```
score = classBase + within
within = 40*urgency + 15*skillFit + 10*proximity - pathCost + temperTerm - switchCost
```
| Class | classBase | Notes |
|---|---|---|
| critical need | `400 * u(need)` | `u` is continuous: 0 at the soft threshold, 1 at the critical threshold, squared ramp |
| player order | 300 | |
| standing order | 200 | |
| village demand | 100 | |
| personal leisure | 0 | |

- `u(need) = clamp((soft - level)/(soft - crit), 0, 1)^2`. Starting thresholds hunger soft 0.50, crit 0.15; thirst soft 0.50, crit 0.20; energy soft 0.40, crit 0.10; cold uses body temperature likewise. At `u = 0.75` the need ties an order (300); above that it wins. This implements "a starving village told to build still eats first" on a **continuous survival curve**, not a threshold flip.
- `urgency` in 0..1: demand-vector term for demand jobs; age/deadline for orders (a job nobody has taken for a while rises); stock shortfall depth for standing orders.
- `skillFit` in 0..1 = `level/1` of the relevant skill (§10); never a gate (R17), so an unskilled villager still scores.
- `proximity` = `1 - dist/maxScan`; `pathCost` = min(20, path length * 0.2).
- `temperTerm` = `5 * (temper - 1)/spread` for autonomous classes; **0 for orders** (orders bypass temper, R5). Rivals' shared area adds -3 (§08).
- `switchCost` = 25 if the candidate differs from the villager's current job and the current job has run < 20 game minutes; 0 for critical need above `u = 0.5`. This is the anti-thrash hysteresis (see failure modes).
- Within-class band is ±60 at most, so classes never overlap except through the need curve.

#### Blockers and the Why panel (DECIDED R5)
Every time a job is rejected for a villager the board stores a machine-readable **blocker**: `no_tool`, `no_path`, `no_material`, `no_skill_known` (craft not known by anyone, §10), `reserved`, `unsafe`, `unreachable_cooldown`, `no_capacity` (carry), `forbidden_zone`, `station_missing`. Only the **top-ranked** rejection per villager is kept to bound cost.

The **Why panel** for a villager or an order prints from this data, in order:
1. Current action and class: "Hauling clay (village demand)".
2. For an order: workers assigned / on-task / blocked, with blockers aggregated ("2 blocked: no tool").
3. For an idle villager: the best job they were rejected from, and why.
Truthfulness rule: the panel is generated from the same score pass that picked the job; there is no separate explanation code path (Why-panel prototype P-why tests this by replaying a decision and comparing the output).

#### Orders, reservations and adjacent urgency (DECIDED R5)
- An order reserves jobs of its kind in its area for the named workers first. Reservations expire after N ticks without progress and are validated every step. A reservation does not freeze adjacent urgent work: an unreserved critical or demand job adjacent to the area is still eligible for any villager whose score for it beats their order job (so a fire in the lumber camp is still fought).
- When an order ends or fails the workers return to autonomy.
- Reservation types: job (one claimer), item stack, destination slot, bed, station.

#### Crews (DECIDED R6)
A **crew** = named selection of villagers + a default task + a stall summary. "Five on lumber" and an expedition party are the same object. A crew has no scoring layer of its own: it simply holds a default order for its members, so removing a member releases their jobs. The crew card shows members, current task, and stall summary ("3 working, 1 blocked: no tool, 1 resting").

#### Standing orders and hysteresis (DECIDED R7)
"Keep N of X" is a **stock target with a hysteresis band**: start refilling below ~80% of N, stop at 100%, drawn as a stock bar with the band marked. Every gather order can be flipped to "keep N" in one click. Anti-flap: the evaluator spawns jobs only when below the lower mark, and completed jobs finish rather than abort at 100%. `maxWorkers` cap per standing order (default 3 in MVP, ASSUMPTION). Auto-promotion suggestions are post-MVP.

#### Hauling baseline (DECIDED R21)
Hauling is baseline autonomous behaviour (village demand class). The player's levers are stockpile placement and **transport tier** (hand -> basket/box -> backpack -> wagon -> animal cart -> rail); tier sets carry capacity and speed on the carrier. Rules to prevent known DF/RimWorld starvation: no hauling between equal-priority stockpiles; hauling never outranks building the thing it feeds; haul jobs capped per stockpile. No priority matrix in MVP.

#### The autonomy band (DECIDED R8)
Without orders villagers do: eat, drink, sleep, flee, heal, haul, repair, replant, gather firewood, build shelter from the **starter shelters** (leaf bed, lean-to), and build any blueprint the player has flagged **auto-build**. They **never** start a new functional building kind. A Steward that chooses from the blueprint library is post-MVP. Target (D, ASSUMPTION): unattended for 10 game years, >= 90% of settlements survive and < 20% have started a new building type or craft; sweep reports "unattended growth rate".

#### Possession and the board (R9)
A possessed villager is simply removed from the AI picker; their input emits the same Actions. Their reserved jobs are released after a grace of 30 game seconds so the crew does not stall. Needs keep running; control ends only on collapse.

### Worked scoring example
Village state: Mira (strength 1.15, mining skill 0.42), standing at the stockpile. Hunger 0.34, energy 0.7. Her current job is hauling clay (village demand), started 4 game minutes ago.

| Candidate | Class | classBase | urgency | skillFit | proximity | pathCost | temper | switch | Score |
|---|---|---|---|---|---|---|---|---|---|
| Eat from larder | critical need? hunger 0.34: u=((0.5-0.34)/0.35)^2=0.21 | 400*0.21 = 84 | n/a | n/a | n/a | 2 | 0 | 25 | 84 - 2 - 25 + (need within=0) = **57** |
| Dig copper (order to crew "Seam", 3 targets) | order | 300 | 0.6 -> 24 | 0.42 -> 6.3 | 0.55 -> 5.5 | 12 | 0 (bypass) | 25 | 300+24+6.3+5.5-12-25 = **298.8** |
| Haul clay (current) | village demand | 100 | 0.5 -> 20 | 0.2 -> 3 | 1.0 -> 10 | 0 | +3 | 0 | 100+20+3+10+3 = **136** |
| Keep 100 firewood (standing, stock at 60) | standing | 200 | 0.7 -> 28 | 0.3 -> 4.5 | 0.4 -> 4 | 8 | +1 | 25 | 200+28+4.5+4-8+1-25 = **204.5** |
| Chat with Tob (leisure) | leisure | 0 | 0.2 -> 8 | n/a | 0.9 -> 9 | 0 | +4 | 25 | **-4** |

Result: Mira takes the copper order (298.8), not the standing order (204.5), not her current haul. Reason string: "order: dig copper (crew Seam)". Twenty game minutes later her hunger is 0.2: `u = ((0.5-0.2)/0.35)^2 = 0.73`, eating scores 400*0.73 = 292 + within; the order's score is 300 + within - switchCost(0 because the order job has run >20 min). Close call; once hunger passes ~0.19 (`u>=0.75`) eating wins, as intended. The player sees in the Why panel: "Eating (critical need: hunger 0.19). The copper order resumes after." If no food exists, the blocker is `no_material: food`, and the panel says "Hungry: no food in reach; Mira is still on the order" instead of freezing silently.

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
| **Thrash** (villager flips between order and need) | Scores within a few points; no hysteresis | Count of job changes per villager per game hour in the harness | `switchCost` 25 and the 20-minute commitment; need curve continuous; bot "order/need thrash" requires < 4 switches per game hour per villager |
| **Starvation of orders** | Many demand/need jobs always outrank orders; or all workers drained | Order with zero progress for N game hours | Order urgency rises with age; blocker shown; settlement-wide "needs are eating the order" line in Why panel |
| **Stall** | Reservation leaked to dead/unreachable actor; unreachable target; haul loop | Invariant: no reservation older than N ticks, none held by dead/possessed-away actors | Always expire + revalidate; reachability cache per region with cooldown; stall summary on crews |
| **Priority inversion** | Low-priority hauling blocks building | Order with blocker `no_material` while haul jobs exist | Haul jobs generated from the consumer's need inherit the consumer's class |
| **Idle with work available** | All jobs blocked (`no_tool`, `unsafe`) | Idle villagers + open jobs > 0 | Idle list in Why panel, with aggregate blocker counts |
| **Silent village** (nothing happens) | Autonomy band too narrow | Unattended growth rate below band | Player gets bigger queues (blueprint chains, expeditions), not waiting as a mechanic |

### Exploits & counters
| Exploit | Counter |
|---|---|
| Spam orders so villagers never rest | Strain accrues (§08); over-ordering bot must show lower output than delegation |
| Cancel/re-issue orders to dodge needs | Needs are not overridden by orders except via the continuous curve; no cheat |
| Flood queue with 10 blueprint stamps | Jobs released in waves (~30 open per site) and a cap on pending sites |
| Standing order hoarding (keep 9999) | Stock cap per item tied to stockpile space; chronicle/Why panel warns |
| Possess to bypass reservations | Reserved jobs released after grace; possessed output <= 1.25x delegated (R9 band) |

### MVP vs later
| MVP | Later |
|---|---|
| One board, five classes, score function, blockers, Why panel, crews, standing orders with hysteresis, reservations, hauling baseline, auto-build flag | Steward (autonomous blueprint selection), standing-order auto-promotion, priority matrix, aggregate LOD for distant settlements |
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
Per villager, per skill: `xp`, derived `level` (0..~1). Skill list MVP (ASSUMPTION): mining, chopping, building, crafting, hauling/gathering, farming/foraging, fighting; 6–8 total. Profession = a label derived from the top skill + recent activity (not stored, not random as in slime-village).

```
potential[s] = 0.7 + 0.3 * aptitude(s)                 # about 0.70..1.00, aptitude from traits (§08)
level[s]     = settle(potential[s] * (1 - exp(-xp/K)), 0.5, 0.5)
xp_gain      = valueOfOutput * max(0, 1 - level/difficulty(task)) * novelty * rested(s) * learnRate
learnRate    = 0.85..1.15 from intelligence (bounded)
effect       = 1 + 0.8 * level                          # master 1.8x novice in speed/waste/quality
```
- **K** ≈ 1.0 real work-hour of fair-challenge work at 1x (ASSUMPTION, P1 lifespan prototype). At average aptitude a villager reaches ~0.63*potential after about 1 work-hour and ~0.9*potential after ~2.3 work-hours; with the rested curve and challenge matching, a master emerges in the second half of a life. Adulthood begins ~2 real hours, so a master aged 6–7 h can pass a craft to a 2-hour-old apprentice with ~3–4 hours of overlap. P1 tunes K against the transmission target.
- **XP from real output**: `valueOfOutput` is value created (net-new matter, item quality), not time spent. Fast-forward does not farm XP: it tracks output.
- **Challenge-matched**: `1 - level/difficulty` pays nothing for cutting soil as a master.
- **Re-mining placed blocks**: a per-cell `virgin` bit, cleared when the player or a villager places a block. Mining a non-virgin cell returns the item and pays zero XP (R17). Cost 1 bit/cell.
- **Rested curve** (per skill, per game day): `rested = 1/(1 + workedToday/4h)`. The first 4 in-game hours pay 1.0 to 0.5, the next 4 pay 0.5 to 0.33. Rotating skills beats single-skill grind.
- **Genetic potential ceiling**: `potential` bounds level; gifted = ceiling 1.0 vs 0.85 and learnRate 1.15 vs 1.0, which is ~+17% effect at mastery and ~15% sooner. Genes are not expertise; a master's child starts at zero.
- **Skills gate quality and speed, never the ability to attempt** (R17). A villager with level 0 still does 1.0x effect with extra waste. Only *knowledge* (§ Crafts below) gates capability.
- **Rust**: after 10 idle days, level drifts down 0.5%/day to a floor of 60% of peak.
- **Mastery (>= 0.85)**: 3–6 "signature" actions in the whole game that gate *quality*, not capability (e.g. a master-forged blade). Later content.
- **Leisure XP**: hobbies (storytelling/teaching, scouting, tinkering, gardening) pay 0.25x work XP and lift a skill to at most 40% of potential. Off-time shapes who a villager is, and feeds tinker aptitude (R12).
- **Grind guards**: dummies cap at level 0.3; sparring pays by the *other* party's level with injury risk.
- **Possession**: Divine inspiration gives +15% XP (R9); the rest of the formula is unchanged. That is a push, not the way to level.

#### Familiarity (craft knowledge) and Teach (DECIDED R10)
- A **craft** (smelt copper, fire clay, knap flint) is known by a villager when **familiarity** > 0. Familiarity is a 0–1 value per (villager, craft). Capability is "a living villager with familiarity > 0" checked when a job is picked (the `no_skill_known` blocker). One layer; B's separate notion layer is merged into it for MVP.
- **Gaining familiarity**:
  - *Discovery* (witness/tinker, R12): the discoverer starts at 0.5 familiarity; witnesses that saw it happen start at 0.2.
  - *Watching* (slow): a learner in sight of a practitioner doing the craft gains `0.02*aptitude*(1 - familiarity)` per in-game hour.
  - *Teach* (fast): a player-issued or automatic action; teacher and student work together; learner familiarity rate x3, teacher output x0.8, **plus the teacher's skill XP flows as student XP at `min(teacherLevel*k, cap)`**. Costs the teacher's time and some of the student's output; this is the real cost of teaching, not an extra stat.
  - *Kin bonus*: a child learns from a parent at x2 (just proximity, children sleep and eat with parents).
- **Familiarity vs skill**: familiarity says *whether* a villager can start the craft and how well they know the steps; skill says how fast and how good. Both feed output quality; familiarity < 0.3 adds waste on top of skill.
- **Using a craft** resets its decay and nudges familiarity toward 1.

#### Knowledge loss and rediscovery (DECIDED R11)
- If the last living holder dies, the craft becomes unavailable (`no_skill_known`). **No permanent locks and no silent downgrade.** A warning fires when holders drop to one ("only Tob knows how to fire clay") and again at zero.
- **Evidence** (built kilns, stored products, ruins, the item itself) makes rediscovery cheap: a tinker job near evidence rediscovers at a large discount (ASSUMPTION: 20% of the original cost, P-forget/recover). Evidence is spatial: tinkering at a kiln with fired pots in the store scales to the evidence strength.
- Without evidence the craft must be found again (§ discovery, R12), still possible because the phenomena are systemic.
- Capability checks use villagers, not the Almanac: the Almanac only reports.

#### Apprenticeship (PROPOSED, B)
A pair assigned by player order ("you, learn smithing from Dov") or automatically when a juvenile/adult is idle near a master doing a craft the village demands. While paired: learner rate x3, master output x0.8. Pair state is visible; the pair breaks if either is pulled onto a critical job. Players protect scarce holders by pairing them. Auto-pairing is off for crafts with >= 3 holders.

#### Documents (later capability)
Documents and libraries are post-MVP (R10). Design intent: a document preserves *familiarity* (read at 0.7x of written strength) but caps skill at ~0.3–0.4 from reading alone; paper rots, clay tablets endure, fire burns libraries; a library room makes documents searchable. A book cannot make you a smith. Writing itself is discovered through phenomena (marking surfaces).

#### Lineage (PROPOSED, B)
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
- **Lifespan mismatch**: if skills are too slow vs. life, no master ever emerges; P1 prototype and harness metric "median age at skill 0.7".

### Exploits & counters
| Exploit | Counter |
|---|---|
| Place and re-mine the same blocks | `virgin` bit: zero XP, item conserved |
| Plant/harvest loops | XP from net-new matter only |
| Single-skill grind | `rested` curve; one-skill bot must be <= 70% of 4-skill rotation XP/work-hour after day 5 |
| Idle/fast-forward XP | XP tracks output |
| Possess-swap leveling | Possession XP +15% only; grind bot must earn < 5% of baseline on place/mine loop |
| Teaching loops (A teaches B teaches A) | Teach caps at teacher level; familiarity gain falls with `(1 - familiarity)` |
| Hoarding last holder in a bunker | Holder must work the craft to keep it (rust); fine, that is a story |

### MVP vs later
| MVP | Later |
|---|---|
| 6–8 skills with XP/rested/ceiling; familiarity per craft; watching + Teach; evidence-discounted rediscovery; apprenticeship basic; lineage view | Documents/libraries, mastery signature actions, culture traditions, tutor NPCs |

**Example.** The player sees "Only Dov knows how to fire clay" after a cave-in injures him. They select Dov and Tob and press Teach. Dov's pottery output drops 20% while Tob's familiarity climbs from 0 to 0.6 over a long afternoon. When Dov dies in winter, the chronicle records "Tob keeps the kiln", and nothing is lost.

---

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

#### Permadeath (AGREED; DECIDED R9)
- Permadeath is absolute. No revive, no resurrection, no respawn. A dead villager is removed from the sim and written to the chronicle as a compact record.
- **Death while possessed is ordinary permadeath** (R9). Possession has no safety net: needs keep running, control is released only on collapse (incapacitation), never on a warning. Collapse and death are different states: a collapsed villager can still be saved by others for N game seconds (ASSUMPTION: 30), and the player is returned to the god view.
- Sudden strokes of bad luck should be survivable more often than not for a healthy villager; there are no instant-death traps in MVP (hazards damage over time or give a visible warning: tag "bad air", unsupported span marker).

#### Grief and mourning (small, DEFAULT)
Kept deliberately small; it is texture, not a system.
- Family (parent/child/partner) and **friends** (+8 relation, §08) of the dead gain a **Grief** status: mood -0.15 for 1 game day, fading linearly; and they take a leisure episode at the grave if idle. Rivals get nothing.
- A settlement with >= 3 deaths in one game day gets a single "dark days" chronicle line (no extra mechanic).
- Grief never reduces output by more than ~5% and never triggers cascades (no death spirals, no suicide mechanic). An informal check in the harness: mean output drop after a death < 10% for one day.

#### Graves and heirlooms (PROPOSED, small named-item exception)
- Each death can leave a **grave** (a marker entity placed by villagers on idle time, near home). The first grave in a cluster makes an `ancestor grove` flavour tally used for chronicle text only.
- **Heirlooms** are the one exception to "items are anonymous stacks": an item flagged `named` with `{maker, origin, createdYear}` that survives its maker. Rules: created automatically when a villager at skill >= 0.85 finishes a signature item, or manually when the player marks an item. Max ~1 heirloom per 10 villagers. They are carried or stored like any item, have a name ("Tob's flint axe"), and *no stat bonus from heritage*: the item's quality comes from the maker's skill, nothing more. They show in the chronicle when passed on ("Bren now carries Tob's flint axe"). If lost with its holder in a ruin, it becomes a relic to find (later).

#### Notable individuals (PROPOSED)
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
- **Era labels** (R14) are written as `ERA_LABEL` when capabilities cross thresholds ("Copper age begins"); they are labels, not gates. slime-village's quest chain (First Light, Knapping, The Crucible...) becomes `FIRST_*` entries.
- **Digest on return** (R22): on resume after time away or when the game was backgrounded, the player gets a short list of the highest-severity entries since the last time they viewed the chronicle (cap ~10).
- **Storage**: ~10k historical records ≈ 2 MB (C).
- **Text** is template-based, with names filled in. No generative writing. Entries are factual one-liners: "Year 3: Tob fired clay for the first time." "Year 5: The last person who knew how to fire clay has died." "Year 5: Tob (generation 3) died of old age, aged 4.1 years."
- **Ruins** (carried over): an abandoned settlement keeps its chronicle; a later band that adopts the ruin inherits it ("the place did not stop being that place").

### Save-scumming stance
**Recommendation (PROPOSED, flagged for the decision log): allowed, not encouraged, with an optional "ironman" flag.**
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
| Aging, causes of death, permadeath incl. possessed, grief (small), graves, chronicle with ~12 kinds, VillagerRecord, ironman flag, digest | Heirloom persistence in ruins as relics, notable-individuals UI polish, memorial buildings, generated epitaphs, chronicle export for sharing |

**Example.** The player possesses Bren to scout the north cave. Bad-air tags flicker; Bren's energy drops below critical, and he collapses (control returns to the god view). Dov reaches him in time. Later Bren is killed by a prowler in the same cave on a second trip. Tob and Mira (friends) take a leisure episode at his grave; the chronicle reads "Year 6: Bren, who first mapped the north cave, was killed by a prowler." A flint knife Bren made, named "Bren's knife", is now carried by Mira.
