# Experiment: experience, memory and personality (Opus design, 2026-10-28)

The author's request: experiences shape each slime's curiosity, interests, fears and autonomous behaviour. Possession uses the same systems as the AI. The same event affects different slimes differently. Memories, not scripted personality changes, drive what a slime does next. One complete loop is prototyped: **experience → memory → interest/fear → autonomous action**, and it lasts after possession ends.

## What exists (from the investigation)
- **No event bus and no per-villager memory.** The nearest things are `aff`, `bad`, `lf` and `why`. The chronicle is global and sparse.
- **One pipeline.** Possession builds the same Task and Move objects and goes through `runAction` (possess.js:88). Choke points shared by AI and player:
  - `afterAction` (sim.js:182)
  - fauna damage (fauna.js ~400-407)
  - `trapStep` (sim.js:162)
  - `watch` (seen.js:114)
  - cache opening (traps.js / dungeon looting)
  - the strike kill in fauna.js
- **Scoring.** `scoreCand` (jobs.js:1401) is the sum of the `p` terms, clamped to ±45. The `tmp` term (hash ±5) is the only per-villager bias today.
- **Fear.** `fearStep` (fauna.js:359) every NEED_STEP, from `scare`. `genFlee` (jobs.js:382).
- **Restrictions.** `restricted()` (lair.js:189) returns territory, dungeon, unmapped cave, unstable or badair. Wander is leashed to 30 cells (actions.js:29).
- **Hobbies.** `hobbyOf(v)` is derived from traits and a hash and is flavour only.
- **Social.** `socialTick` runs at t%100===40.
- **Saves.** Whole entities are saved and hashed automatically. `migrate()` returns early for v≥12; additive defaults go in `restore()`.

## Design (lightweight, event-driven)

### 1. Temperament: `v.ps = {b, c, s}`, integers 0..100
- **Axes:** bold, curious, sensitive. These are the *lens* through which experience is appraised. They are not outcomes.
- **Founders:** from a hash of (seed, id).
- **Births:** the parents' mean plus hashed jitter.
- **Older saves:** filled from the same hash in `restore()` (additive; no refusal).
- **Change:** temperament never changes. Behaviour changes only through memory.

### 2. Experience: `feel(sim, v, subj, kind, mag)` in a new sim/memory.js
Called only from the existing choke points, so the cost is zero when nothing happens. Fewer than 10 call sites.

**Subjects.** A small fixed set of strings, plus a fauna kind as its own subject:
- `cave` (being in cave or dark cells; revealing new cave cells)
- `deep` (dungeon cells)
- `ore` (digging ore or coal)
- `gem` (gems, crystal, core-touched ore)
- `treasure` (cache opened or relic found)
- `trap` (triggered or spotted)
- `<faunaKind>`, e.g. `crawler` or `thornback` (hit by it, hit it, killed it, watched it nearby)

**Kinds (raw outcome).** `good` (found, won, rewarding), `bad` (hurt, trapped, scared) and `safe` (exposure with no harm).

**Appraisal**, which is where individuality comes from:
- **good:** `p += mag*(50+c)/100`; if the subject is one the slime fears, also reduces `n` a little (a positive association coexisting with fear)
- **bad:** `n += mag*(50+s-b/2)/100`, sensitised: more if `n` is already high and `s` > 50
- **safe:** habituation; `n -= mag*(b+50)/200` (bold slimes habituate faster; sensitive ones barely do); `p += small*c/100` (curiosity rewards novelty)

### 3. Memory: `v.mem`, at most 8 slots
- **Slot:** `[subj, p, n, count, lastTick]`, integer, p and n each 0..1000. Positive and negative are separate and can coexist.
- **When full:** the weakest slot (p+n) is dropped.
- **Episodes:** `v.epi`, at most 4 vivid ones, `[tick, subj, kind]`. Only stored when mag is large, for the inspector ("Hurt by crawler", "Found gems").
- **Decay:** one staggered pass per villager every 1000 ticks, `(t+id)%1000`. p and n fade by about 3%, and empty slots are dropped. A sensitive slime's fear fades more slowly.

### 4. Interest and fear: what memory changes, three hooks only
1. **Job scoring.** A new `p.mem` term in `scoreCand`, clamped to ±20, from `(p-n)` of the subjects the candidate touches:
   - cave cell → `cave`
   - mining ore/gem → `ore`/`gem`
   - strike, clear or defend vs. a fauna kind → that kind
   - dungeon or delve → `deep`

   It stays inside the existing ±45 clamp, so orders still win.
2. **Fear.** In `fearStep`, the scare from fauna kind K is multiplied by `(1 + n_K/1000 - p_K/2000)` and clamped. A slime that fought crawlers and won is less shaken; one that was mauled panics sooner.
3. **Curiosity → autonomous action.** A new leisure-class candidate, `explore`, made only when the slime is free and some subject has `p` above a threshold with `p > n`:
   - It picks a **seen** cell matching the subject: the edge of a seen cave, an ore or gem outcrop, the vicinity of a dungeon entrance.
   - It walks there with the existing Move/Wander machinery, lingers, and its `watch` reveals cells (real map gain).
   - **Agency:** a strongly cave-curious slime (p ≥ high and `c` > 50) may treat **unmapped** cave cells as allowed for this candidate only; it becomes a scout. Dungeon, badair, unstable and territory stay forbidden.
   - The explore leash is 60 cells, not 30.
   - A slime with `n > p` for a subject gets the opposite: `Wander` avoids targets of that subject.

### 5. Culture seam (tiny, deliberate)
In `socialTick`, at most 1 transfer per villager per call:
- A slime with a strong memory passes 10% of `p` or `n` to a close bond (`rel` friend or kin) as a "heard" memory.
- A heard memory is capped at 300 and never stored as an episode.
- Fears and fascinations spread through stories. This is the seam for traditions; nothing more is built.

### 6. Visibility (show, don't tell)
- **Inspector:** a "Memories" sub with up to 3 chips ("Loves caves", "Fears crawlers", "Drawn to gems"), plus the vivid episodes as 1–3 word lines.
- **`why`:** the explore candidate's text, e.g. "Curious: caves".
- **Chronicle:** a `once` entry per villager per subject when interest or fear first crosses the strong threshold.

### Hard rules
- Pure, deterministic, integers only.
- No per-tick loops over memory. Only event hooks, the 1000-tick decay, and a short ≤8 scan when a candidate is scored.
- Possession goes through the same `feel` calls. `steadfast` (possessed) lets them be exposed to what the AI would avoid; their appraisal is still their own.
- A slime with an empty memory is scored exactly as before, so existing behaviour is preserved.

## Findings, tradeoffs, surprises
### Built as designed (quick set green, `tests/memory.js` about 1 s)
`src/sim/memory.js` (temperament, `feel`, decay, `memBias`, `fearMul`, `avoids`, `tell`, `exposure`), `src/sim/explore.js` (the `explore` leisure candidate), `src/ui/memtext.js` (chips and episode words). Call sites of `feel`: fauna blow on a villager and the kill (`fauna.js swing` / `defeat`), a dig turning up ore or gems (`tasks.js dig`), a cache opened (`traps.js openCache`), a trap sprung or spotted (`traps.js springTrap` / `trapStep`), exposure in `fearStep`, and new cave cells seen (`seen.js watch`, only when a look revealed at least 6 new cells, at most one per 12 ticks). Hooks: `p.mem` in `scoreCand`, `fearMul` in `fearStep`, `genExplore` in `plan`, `avoids` in `Wander`, `tell` in `socialTick`, `decay` in the villager loop of `Sim.step`.

### Surprises and tradeoffs
- **Hurt and won at once.** The same fight leaves a slime with liking and fear of the crawler together (bold: p 390 / n 46; timid: p 156 / n 412). That is the design, but it makes "good" events matter: a kill mag-80 gives a curious slime 3x the liking a timid one gets, so pride is as individual as fear.
- **Fear also attaches to the place.** A blow taken underground feeds `cave` as well as the creature (half strength), which is what makes a timid slime avoid the cave itself and not only the crawler. A kill in a cave feeds `cave` "good". Without it the fixture's two slimes would end with the same view of caves.
- **The multiplier needed a dead zone.** `fearMul` without one changed an existing test: after a graze (n = 59) the monsters-fixture crew fled a little earlier, the swarm drifted out of the Clear order's 10-cell area, and the order ended with no kill ("the crew cleared crawlers: 4 -> 4"). Nothing was loosened: `fearMul` is exactly 1 while |n - p/2| < `FEAR_DEAD` (100), so only a real memory changes fear. This is the one place where the experiment visibly changes ordinary play: crews that have been mauled flee sooner, and orders scoped to an area end sooner.
- **Scouts mapped the cave.** A bold, curious slime released in the middle of the unmapped tunnel left the camp's work alone, took `explore` on its own about 750 ticks after it stopped fleeing, and made the tunnel 31 cells longer on the map in 4500 ticks. The timid one fled, never explored and mapped one cell.
- **Fear spreads without anyone being hurt.** A friend told of a crawler (60, then at most 300 after repeated tellings, no episode) flinches at the sight of one: fear 0.18 against 0.10 after the same six steps untold.
- **Habituation is lopsided.** Sixty safe exposures took 300 off a bold slime's fear and 60 off a sensitive one's; six equal blows grew a sensitive slime's fear 119, 119, 119, 166, 166, 166 (sensitised once above 300) against 18 each for a bold one.
- **Routine work is a memory too.** Every dig of ore adds 8 to `ore`, gems 30: after a while a miner likes ore and, if free, will walk to a known outcrop. That is intended (the interest seam) but untested at village scale.
- **Cost.** No per-tick loop over memory. `watch` adds one subtraction per moving villager; `scoreCand` scans at most 8 slots, and only for a slime with a memory. The 60-villager crowd test is unchanged (0.34 ms/tick).
- **Not covered by a test:** the scout's permission to enter unmapped *lair* cave (`explore` + `unsafeTask` bypass in `plan`); the fixture's cave is not the thornback's. Dungeon, bad air, unstable roofs and territory still stop every explore walk through the same `unsafeTask` check.

### What needs the user's balance pass
`K` (event scale), `EXPLORE_P` 200 / `SCOUT_P` 400, `FEAR_AT` 250 (when a slime avoids), `FEAR_DEAD` 100, the decay (3% per 1000 ticks, so a feeling halves in about 23000 ticks, two game days), the safe-exposure strengths, `EXPLORE_GAP` 150 and the 60-cell leash, and the size of the hurt and kill events (mag 20-100).

### Village playtest & balance (Sonnet, 2026-10-29)
Probe: `node tools/mem_probe.js <fixture> <ticks> on|off [scenario]` (one sim per process, 1-10 s wall each; `flags.off` in memory.js is the test-only memory-OFF switch, set by the probe alone). Scenarios: `mineface` (mine fixture, a 12-cell ore/gem run ordered dug), `skirm` (monsters fixture, den moved out of raid range, 5 slimes sent to Clear), `crowdmon` (60-villager crowd, 3 crawlers raiding the yard). Windows: 60000-240000 ticks (5-20 days). Memory ON vs OFF, tuned constants:

| scenario | food runway end | jobs | deaths | hurt | memory shape |
|---|---|---|---|---|---|
| settled 120k | 3.0 vs 3.0 | 1355 vs 1355 | 0 vs 0 | 0 | no events, so no memories (identical) |
| mineface 120k | 3.7 vs 3.3 | 4196 vs 4734 | 0 vs 0 | 0 | 48 ore explore trips by 1 slime (earlier run: 46 by 2, ore and gem), none hurt |
| skirm 240k | 3.5 vs 4.0 | 3022 vs 2333 | 1 vs 1 | 53 vs 44 | 2 of 7 fear spitters, 5 forget |
| crowdmon 60k | 2.7 vs 2.7 | 2331 vs 3806 | 0 vs 1 | 231 vs 378 | 4 afraid, 4 proud of crawlers, 55 untouched |

Cascade: no fear of a creature ever reached FEAR_AT in a slime without a vivid hurt episode of it (0 of 19 in the crowd).

**Before tuning** (crowdmon, original constants): 33 of 60 slimes "liked" crawlers (the safe-exposure p gain fires every NEED_STEP when a creature is merely in sight, so it was uniform village-wide fondness, not an individual interest). Removing that alone exposed a real problem: with liking gone `fearMul` (up to x1.5) made 18 of 54 slimes flee sooner, the crawlers lived on, 7 died and hurts went 268 to 1450. Liking had been masking it by making the village braver.

**Constants changed (3):**
1. `fearMul` ceiling 1.5 to 1.1 (floor 0.5 kept): the fear rule may make a won-over slime much braver but a mauled one only 10% jumpier. Crowd deaths 7 to 0, hurts 1450 to 231. Test 2b's multiplier floor relaxed from 1.2 to 1.05 (the mauled-flees-where-the-bold-stands claim still holds).
2. `HEARD_CAP` 300 to 190: below FEAR_AT 250 and EXPLORE_P 200, so a story alone never makes a slime avoid or explore; it only tips a lived memory. Test 6 reads the constant (now says 190).
3. Safe-exposure liking for a creature subject only when liking already exceeds fear (a monster they have beaten). Places (cave, deep) keep the novelty gain. Test 3 starts from p 300 / n 250 instead of 100 / 500 (same habituation and novelty claims).

Left alone: K, EXPLORE_P 200, SCOUT_P 400, FEAR_AT 250, decay, EXPLORE_GAP 150, leash 60: the miners did drift (see below) and fear stayed individual.

**Emergent and surprising:**
- Routine mining does breed miners: after about 10 ore digs a slime reached p 717 on ore, then walked back to the outcrop on its own (46-48 trips in 10 days, 1-3 of 7 slimes; zero hurt). Others dig the same face and never go: interests stay individual. Interests fade within a day or two of no mining (3% per 1000 ticks), so a retired miner stops going.
- Liking and bravery are coupled through `fearMul`: pride in a kill was what held a crowd together against crawlers. Any change to what breeds liking is a change to village defence.
- Fear stays local: about 20-25% of a hurt crowd ever crossed FEAR_AT, mostly those who took the blows; 4 still afraid at the end.
- Told memories did not cascade; with the 190 cap they cannot cross a threshold alone.

**Remaining concerns:** idle share is 1-8 points higher with memory in the crowd (fleeing and avoidance), and jobs done differ by chaos as much as by memory (crowd 2331 vs 3806 counts flee jobs and fewer fights); the 60-villager run is sensitive to tiny perturbations (the same constants gave deaths 0, 1 and 7 across edits), so one run proves little; no scenario had a cave frontier near the camp with a village (scouting of unmapped cave is only covered by tests/memory.js); fixtures were regenerated and restored once by accident while probing (git-clean).

### Seams (interests to hobbies, skills, traditions)
`hobbyOf` still ignores memory: a slime with strong `cave` or `gem` liking is the obvious future spelunker or stone-collector, and `ore` liking could bias `pref` (preferred craft) toward dig. `tell` is the one culture hook: a tradition is a subject that several friends share at STRONG, which a later system could name and chronicle. Skills could read `count` (how many times a subject was lived). `v.ps` never changes; a child's temperament is the parents' mean plus a hashed jitter.
