# Existing material audit (read-only survey)

Scope: slime-village (main), games/Dorfs, prm/slime_world + SlimeWorld, scad/slime_colony.
Method: README read in full; code read for the mechanics cited; two test harnesses actually run
(`headless.js 20`, `save_roundtrip.js 15`). Anything not read is marked UNVERIFIED.
Paths are under /Users/zoro/code/ unless stated. `S/` = `slime-village/slime/sim/`.

Headline findings (read these first):
1. slime-village is a large, mature, deterministic, headless-testable colony sim (~28k LOC sim). It is the real asset.
2. It does NOT have per-slime skills or experience. Genetic traits are fixed at birth; `profession` is a random pick at
   construction and never changes (`slime.js:185`, only two other reads in `jobs.js`). The brief's "skills improve through
   use" and "genetic potential, not expertise" are therefore NEW work, not reuse. Note the Discord quote "Base/natural
   stats, + experience" is a plan, not a current feature.
3. Villagers are not commandable. The only player levers are island-wide "focus" weights earned via goals, a world editor
   (spawn/remove/plan sites), and save/inspect. The brief's direct orders + possession are a full divergence (section D).
4. The design philosophy (emergent, unscripted, "arrived at rather than imposed", soft stops not hard caps) matches the
   brief's pillars 1 and the "no optimal super-species" ask surprisingly well.
5. Working tree of slime-village is dirty: 33 modified files (git diff --stat: 19,432 insertions, 1,589 deletions, much of
   it the rebuilt `slime.html`). Last commit `d9bceff` 2026-10-05. Do not assume HEAD == what README describes.

---------------------------------------------------------------------------------------------------------------

## A. Per-project summary

### A1. /Users/zoro/code/slime-village  (main)
- What: "A self-running colony simulation on a procedurally generated island. Slimes forage, farm, hunt, build, raise
  families and grow old while you watch." Meant to be left running in the background and looked in on.
- Stack: vanilla JS ES modules, no framework, no runtime deps. Canvas 2D renderer (`render/renderer.js`: `getContext("2d")`).
  `tools/build.js` flattens modules into one standalone `slime.html` (1.8 MB, double-clickable, works on file://).
  `node_modules` only holds dev-only playwright for the browser smoke test. Sim has zero DOM dependency (stated in README
  and consistent with test harnesses importing it directly under node).
- Size (wc -l): sim 27,969 (sim/*.js + sim/data/*.js); render+ui+main+store 8,765; tests+tools 2,917. Largest files:
  `ai.js` 4,543 / `game.js` 4,113 / `jobs.js` 3,521 / `render/entities.js` 3,646 / `config.js` 2,351 / `world.js` 2,495 /
  `fauna_system.js` 1,393 / `slime.js` 1,450 / `flora_system.js` 1,013 / `save.js` 990 / `lore.js` 928.
- Maturity: 10 commits, 2026-03-31 to 2026-10-05 (log: "Initial game", "v1.66 - Slimes move and do stuff, but not very
  logcially", "Village is somewhat stable", "Fairly stable", "Seasons", "Bigger land, seasons, variations", "Clean ups, names,
  art"). UI banner `VERSION = "v4.48"` (`main.js:19`). 2D top-down only, no combat beyond animals, no tech past steel/dynamite.
  Content: 20 flora species, 5 animals, 7 tool categories x 3-4 tiers, ~25 building defs, 14 village quests, 10 player goals.
- Run: open `slime.html`, or `./run` (build + serve on :5713), or `node tools/build.js`.
- Test harness: node-only scripts in `tests/`. `headless.js` (verified: 20 days at 1/10 s steps took ~30 s wall, "161x real
  time", prints a table + final summary; exit code non-zero if colony dies). `save_roundtrip.js` (verified: all checks
  passed, 15 days, 34 s). `sweep.js` forks one process per seed. `fixture.js` builds frozen islands in `tests/fixtures/`
  (settled40, spread150, winter75, winter165 JSON present). `browser.js` is a playwright smoke test (not run; UNVERIFIED).
- tmp/: `bridges*.txt`, `survival*.txt` (sweep outputs), `dock.json`, `short.json` (saves), `islands/*.png` (generator
  pictures from `tools/island_pics.js`), `shots/` (screenshots). Ignored per instructions.

### A2. /Users/zoro/code/games/Dorfs  (Godot 3.x, 2021)
- What: an abandoned first attempt (11 commits, 2021-03-11 to 2021-03-16). Godot 3 project (`config_version=4`,
  `KinematicBody2D`), main scene `scenes/map.tscn`. "Dorfs" is the whole README.
- Size: 253 lines GDScript total (`baseEntity.gd` 140, `chief.gd` 46, `Enemy/Mob` 18 each, `Slime.gd` 16 = empty template,
  `__test_inheritance.gd` 15). Six tiny sprites (grass, bush, cow, man, small house, blue slime, pick).
- Maturity: scaffolding. A "chief" moves with arrow keys; base entity declares stats and empty enums.
- Backup: `backupgames/Dorfs` CONFIRMED a duplicate. `diff -rq` differs only in `.git/config`, `.git/index`, and
  `.git/gk` / `.git/objects/info/commit-graphs`. Working files identical. (Side note: `games/` is a general scratch
  directory with hundreds of unrelated scripts.)
- Run/tests: open in Godot 3; no tests.

### A3. /Users/zoro/code/prm/slime_world and /Users/zoro/code/prm/SlimeWorld
- Identical (`diff -rq` empty; both 5,944 bytes, dated Jul 31 2024). Plain-text design notes, ~150 lines. Predates
  slime-village by ~20 months and is clearly its design seed. Contents summarised in section F.
- Links to a Notion page "Design: Blob Intelligence" (telanir.notion.site) -- not fetched; UNVERIFIED content.

### A4. /Users/zoro/code/scad/slime_colony
- OpenSCAD 3D-print models: `colonySlime.scad` (276 lines, "water balloon / slime ball resting on a surface"), plus
  `box.scad`, `cards.scad`, `tokens.scad`, `tiles.scad`, `resources.scad`, `slime_dividers.scad`, STLs "Big/Droplet/King/
  Queen", one `.gcode`. It is a physical board-game / tabletop-pieces project (cards, tokens, tiles, box). Irrelevant to
  the video game except as proof the author has a "Slime Colony" tabletop concept (cards/resources/tiles). Contents of the
  cards/tokens were not examined; UNVERIFIED beyond file names.

---------------------------------------------------------------------------------------------------------------

## B. ESTABLISHED DESIGN DECISIONS in slime-village

Time scale first because everything is expressed in it (`S/config.js`):
- `DAY_LEN: 240` game-seconds per day (line 188), `YEAR_DAYS: 100` (201), four 25-day seasons. TILE = 24 world units.
- Sim speed dial 1-5 up to 50x; fixed step 1/30 s (speed <=3), 1/15 (<=8), 1/10 (faster) in `Game.update` (`game.js:498`).
  So at 1x one day is 4 real minutes; a slime's life (~60-100 days) is 4-7 real hours at 1x.
- README: "A hundred days is about a slime's whole life, so most of them live through one winter" (a "winter survived" is the
  unit of village history).

### B1. Genetics, stats, inheritance, mutation
- Nine heritable traits, rolled for founders in `Slime.randomTraits` (`slime.js:~290`) and documented in `TRAIT_INFO`
  (`slime.js:68`): speed, strength, stamina, intelligence (all 0.8-1.2), drive (0.75-1.25), leisure (0.6-1.5),
  fertility (0.8-1.2), longevity (0.9-1.1), maxHealth (85-115). Plus an inherited colour (HSV).
- `TRAIT_INFO` entries phrase each trait "in terms of consequences a player can watch happen", and the code comment insists
  the readout ranges must equal the generation ranges. `traitStanding()` converts a value to words: poor / below average /
  middling / good / exceptional / "beyond anything its founders had".
- Inheritance `Slime.breed(a, b)` (`slime.js:~268`), per trait (inner `mix`): 22% copy parent A, 22% copy parent B, 28% the
  midpoint, 28% a random lerp between; then +/-5% multiplicative noise. This matches the author's Discord line: "the child
  is going to be an average ish of the parents, but might also suddenly excel at one trait".
  NOTE: there is NO separate "mutation chance for a big jump" on the numeric traits in code. The "suddenly excel / very
  poor" outcome comes from the "pick one parent or lerp" mixture plus drift across generations. The only explicit big-jump
  mutation is the colour "sport" (`CFG.COLOUR_SPORT: 0.07`, 45-150 degree hue jump).
- Drive has extra drift: `* (1 + rand(-DRIVE_DRIFT, DRIVE_DRIFT))`, `DRIVE_DRIFT: 0.05` (README says "up to 10%"; code
  constant reads 5% each way, so a 10% window). Comment: "so a village's character can genuinely change over its history".
- ANTI-SUPER-SPECIES MECHANISM (directly on-brief): `util.settle(v, mid, soft)` (`util.js:59`) replaces clamping.
  Inside `soft` of the middle traits pass untouched; beyond that excess grows logarithmically,
  `mid + sign * (soft + soft*log1p(over/soft))`. "There is no ceiling at all: a dynasty that pushes for fifty generations
  really does get somewhere no ordinary slime reaches, it just never runs away with it." Applied via `CFG.TRAIT_SOFT: 0.5`
  (drive x1.2) and `VITALITY_SOFT`. Quote: "A wall is also the one shape a player can feel: everything interesting bunches up
  against it." Note this is diminishing returns on breeding, not a hard cap; the Discord suggestion of a hard cap on genetic
  prowess is NOT what the code does.
- Colour genetics (a whole subsystem): inherited in HSV hue-space, not RGB (RGB averaging measured to regress the island
  to grey by generation 9: "rgb(101,123,162)"); lean toward one parent; saturation floor; 7% "sport". Diet pulls expressed
  colour toward what is eaten most (`diet`, `dietTints`, `baseColor`); children inherit the EXPRESSED colour. Colour is also
  the social glue: `belonging` = mean colour kinship with village; wanderers join mixed towns; `LIKE_COLOUR_*` constants
  for assortative pairing; names are drawn from the hue band (`data/names.js`, `slimeName(baseColor)`).
  `tests/debug_belong.js` tests that the colour convention rewards diversity rather than uniformity.
- Food boons: README says each food carries "a tiny permanent trait boon" with a soft stop ("Same soft stop as inheritance
  uses", `slime.js:~815`). Mechanism not read in detail.

### B2. Intelligence (and Drive)
- `intelligence` feeds: craft speed (`ai.js:4385`, `craftRate = 0.7 + int*0.5`); memory/gossip quality (`lore.js:190`
  `wit = 0.6 + int*0.4`, `slime.js:483` `0.75 + int*0.25`); exploration curiosity (`ai.js:894` with drive); and `ambition`.
- `Slime.ambition = int*0.45 + drive*0.55` (`slime.js:498`). `villageAmbition(v)` (`stock.js:490`) = mean over living adult
  members, scaled by a quorum (`min(1, n/AMBITION_QUORUM=3)`), plus the player focus `mind` push, times `CFG.AMBITION`.
- Every tool tier and building carries a `mind` cost (`data/craft.js`, e.g. flint 0.3 / stone 0.7 / iron 1.0 / steel 1.2).
  "A quest unlock says the village could; its ambition says it would." A dull village "stabilises small... never wants more".
- README's table of `CFG.AMBITION` vs settled size (0.35 -> 8-11 slimes ... 1.3 -> 55-70, real risk of overreaching) is
  an older ceiling model; `tests/debug_ambition.js` header says ambition is now PACE ("Every village reaches the top of
  the ladder eventually; how long it takes about it is the whole of what ambition decides"). README table is stale vs
  the test header. Flag as inconsistent documentation.
- Intelligence is a single scalar, not a learning-capacity model; there is no per-slime tech knowledge. Tech lives at the
  village level (quest chain / unlock gate in `quest_log.js`) and is gated by the village's mean mind.

### B3. Skills, learning, professions
- NOT PRESENT as XP. `PROFESSIONS = [forager, woodcutter, miner, farmer, hunter, builder, hauler, guard]` (`slime.js:12`),
  assigned `pick(PROFESSIONS)` at birth (`slime.js:185`) -- random, not inherited, never changed.
- Profession is a multiplier on job scores (`PROFESSION_AFFINITY`, e.g. farmer plant 1.7, water 1.8; guard defend 2.2) and a
  scouting lean (`PROFESSION_QUARRY`: what a hunter/forager/miner goes out looking for). Plus `temper(slime, jobType)`
  (`jobs.js:1432`): a stable per-slime-per-job-type multiplier from a hash of id and type, spread `CFG.TEMPER_SPREAD`,
  "enough that the hundredth reconsideration of a close call does not come out the same way for everyone". This is a cheap
  personality hook (a lifelong lean) that already exists.
- Tools change yield, not speed: "A tool changes the yield of a swing, not its speed" (tiers in `data/craft.js`:
  yield 1.5 / 2.4 / 3.6 / 5.0 for tier 1-4). Bare hands never impossible, so the village cannot hard-lock.
- Implication: the brief's Kenshi-style "skills improve through actual activity" would layer on `PROFESSION_AFFINITY`
  (replace the fixed multiplier with a learned per-slime per-job number). Natural insertion point: `jobs.findJob` scoring and
  the per-swing yield in `ai.js`.

### B4. Needs (vitals)
- `hunger`, `thirst`, `energy`, `health`, `mood` plus `strain` (debt from skipping leisure) and `hardship` (lifelong record of
  hunger/thirst/exhaustion/cold nights), `frailty`. Vitals rates are per game-second and scaled to DAY_LEN (README warning:
  "change DAY_LEN and they have to move with it"). Harm sources via `harm(cause, amt)` in `ai.js:~340-422`: starvation,
  thirst, old age (`AGE_DMG * frailty^2`), cold ("a night in the cold", "sleeping rough"), animals, "the cost of a child".
- Leisure is a first-class need: `leisureNeed = DAY_LEN * LEISURE_BASE * traits.leisure * (1 + strain*0.35)`. Working through
  leisure builds `strain` which "costs health and happiness and has to be paid back in idleness later". Leisure time is when
  slimes chat (knowledge transfer), explore, and bond. (Matches the brief's "leisure activities" and octoshrimpy's
  "what they are inclined to do on their off-time".)
- Shelter quality drives lifespan: "Sleeping badly shortens a life": wear scales with how far a bed's comfort falls short of
  what the slime asks of a home (burrow comfort 0.08 vs standard 1.15; cottage buys back all of it). Better beds restore more
  energy and mend more damage.
- Winter cost falls only on the unsheltered ("A slime in a warm cottage beside a lit hearth pays nothing for the cold").

### B5. Relationships, families, reproduction
- Reproduction is an ACT, not a state: "there is no pregnancy" (`slime.js` constructor comment). A willing slime with free
  time and company "spends a large part of itself" face to face (`bonding` field; pairing logic in `ai.js` leisure branch,
  UNVERIFIED in detail). `Game.bearChild(a,b)` (`game.js:1320`): trait blend via `Slime.breed`, baby appears near parent,
  inherits `home`, `generation = a.generation + 1`, `parents = [names]`. Both parents pay energy/health/hunger/strain
  (`BOND_ENERGY`, `BOND_HEALTH`, ...), then `breedCooldown = BREED_COOLDOWN * lifePace / fertility`.
- Solo split / clone: `a === b` path ("A clone is built from one slime's contribution instead of two, so it starts at half
  strength and grows into itself"). `recovery` field scales maxHealth; clone hue drifts only `CLONE_HUE_DRIFT`. Source:
  prm notes ("When an excessive amount of mass is hit, slime will split"). `debug_split.js` investigates clone colour and cost.
- Breeding is village-level gated "weighted, never gated" (`breedIn`, `game.js:1143`): `plenty = 0.06 + 0.9*ease^2` where
  `ease = clamp(larder/1.15, 0, 1)`; also needs spare homes (homeless cap `0.08 + 0.34*peril`) and land slack
  (`landSlack(village)` = room measured off the land, not a target pop). `peril = 1/(1+(pop/VILLAGE_FRAGILE)^2)` is a
  continuous "near extinction" reading that replaced three threshold clauses at 8-9 pop. Quote: "A village has no idea how many
  slimes it 'should' have; it knows whether the ground it works still carries food for the people it already has."
  Measured: ~39% of well-fed days have no birth; famine breeds at ~1/10 speed.
- "Children are born in villages. A band travelling between settlements does not breed" (and `breedNowhere()` just
  clears flags). Founding a village is "the thing every band is actually for".
- Seasonality: children come in the warm half of the year (SEASON breeding curve, mean-normalised to 1.00).
- Social ties are thin: `parents` (names), `generation`, a pair `bonding`, `belonging` (colour kinship), chatting
  (`chatting`, `chatTimer`). No friend/rival/opinion graph exists in the files read. UNVERIFIED: whether `ai.js` stores any
  persistent relationship beyond pair bonding. There is a personal `log` array ("short personal history for the inspector")
  and `note(...)` (e.g. "had X with Y") -- the seed of a personal history.

### B6. Aging and death
- Life stages: baby (`childhood = CHILD_AGE 13 * lifePace`), adult (`ADULT_AGE 20 * lifePace`), `primeAge = rand(40,70)*longevity`,
  then decline. `lifePace = longevity * (1.04 - maxHealth/100*0.04)`: long-lived lines take longer to grow up, preserving
  children-per-life.
- `fitness` curve (`slime.js:~370`): 0.25-0.6 as baby, 0.6-1.0 rising to prime, then `exp(-past*ELDER_DECAY/lifePace)` with no
  floor ("fades toward nothing"). maxHealth, speed, strength all carry fitness.
- `frailty` rises past prime (`FRAIL_RATE`) and modulates age damage; hardship and rough sleeping accelerate it. Death is
  damage reaching zero: `Game.killSlime(s, cause)` (`game.js:1809`) -> drops inventory as piles, releases claims, drops
  tool/flask, removes from home/village, records stats and the village chronicle for firsts and non-old-age deaths, keeps last
  30 deaths in `game.dead` with colour and generation. "Most deaths in a healthy colony are old age."
- Permanent mortality: yes, no revival. (Brief wants this.)

### B7. Influence / indirect control (what the player actually has)
- Quote: "You don't command them... What you get is influence: meet one of your goals and you earn the right to point a
  village at something, which pushes it further than it would go by itself. Push too hard and it overextends and dies."
- Two quest chains: VILLAGE needs (14, `data/quests.js`: First Light, Rough Shelter, Knapping, Full Larder, Green Thumb,
  The Hearth, The First Hunt, Kept Beasts, Bench and Vice, Deep Veins, The Iron Age, The Coal Seam, The Crucible, Generations,
  A Real Village -- file lists more than the README's "fourteen"; counts drift) done by the village alone; and PLAYER goals
  (10, `data/player_quests.js`: Make Landfall, Something Put By, Everyone Indoors, Turned Earth, Ironhanded, The Second Hearth,
  A Long Line, Old Bones, Three Fires, The Long Watch). Each player goal unlocks a FOCUS (`unlocks: ["shelter"]` ...).
- Six FOCUS definitions (`player_quests.js:27`): Shelter, Food, Farming, Tools, Stores, Growth. Each is `demand` multipliers
  on the village demand vector + a `mind` push + `caps`. "A focus is a standing instruction, not a command: it weights what
  the village already wants, so a starving village told to build houses still goes and eats first."
- `Game.goals` is the `PlayerLog` (`player_log.js`). Everything is per-village via `village.focusDef`.
- World editor (`S/edit.js`): spawn/remove anything, and "Plans" which "stake out a site exactly as a slime would have"
  -- the village's ordinary construction jobs pick it up; a plan it cannot afford "simply sits there waiting". This is the
  closest thing to "build a bakery here". Outside simulation by design ("nothing in flora_system or ai.js has to know that a
  player exists"). Is it a sandbox tool or a game feature? README lists it under Settings -> world editor (debug-ish).
- Direct slime control: none. Follow-cam (double-click/F), inspect, Tab to cycle only.

### B8. Villages, territory, splitting, migration
- Several villages per island, "at very different stages". A village owns buildings, stores (`stock.js`), quest chain,
  chronicle, demand vector, focus, and collective ambition. No ceiling on count; limit is land ("a site needs fresh water
  in reach, food already standing on it and room to build").
- Territory: working radius grows with population sub-linearly, widens when the larder is empty (`RANGE_BASE: 300`,
  `RANGE_PER`, `RANGE_HUNGER`). Gives carrying capacity: "Without it every village drew on every bush on the island, so no
  village could ever outgrow its ground".
- Splinter founding: `maybeSplinter` / `findVillageSite` / `siteScore` (`game.js:1406-1640`). A band of the "most driven
  members" with a starter cache walks out; the splinter inherits founders' ambition only, no unlocks/buildings, empty quest
  chain. The site acceptance standard is "divided by the parent village's ambition ... A settlement that can fail is the only
  kind whose success means anything." One 90-day run: day-26 offshoot beat its parent.
- Migration of homeless individuals to a village with spare beds (`maybeMigrate`). Wanderers/tourists: villageless slimes
  that may help a foreign village (`debug_tourist.js`).
- Chronicle (`village.chron`): short permanent list of firsts, population marks, season turns, winter tolls, ruins keep it.
  "The log is a feed... A chronicle is a short kept list of the events that were about this place."

### B9. Sight, knowledge, fog, memory (`S/lore.js`, 928 lines -- the most original subsystem)
- Quote: "A slime acts on what it has seen and what it has been told, and on nothing else. Everything else in the simulation reads
  the world directly; the slimes do not." Three ideas in the header: the CELL (memory about a square, not a bush; fixed key
  stride so a key means the same place on any island), the DEGREE (`belief()` = confidence, falls with distance, time, and
  second-hand-ness; job scores are multiplied by it), the HEAD ("knowledge lives in slimes and nowhere else... no village-wide
  store and no noticeboard").
- `sightOf(slime, game)` (`lore.js:164`): `SIGHT_BASE: 420` with per-slime quirk (`SIGHT_QUIRK`), night 0.4x, rain 0.7x,
  high ground bonus, water bonus, less under a full pack. `observe()` writes memory by patch. Memory decay is
  per-kind: "a pond keeps for a season, a berry patch for days, a herd for hours" (`holdFor(kind)`); `memoryOf(holder)` scales by
  intelligence.
- Transmission: `gossip(a,b,now,budget)` / `share(from,to,...)` copy cells between heads, budget paced by conversation
  length ("a word in passing moves one patch, an evening at the fire moves a dozen"), received at reduced strength ("a thing
  repeated down a chain of slimes thins out by itself"). Village demand is a `poll()` across members' heads.
- Exploration is an errand: `scout` job scored like any other; free-time wandering; expedition ends when quarry is in sight.
  Profession decides what a scout looks for (`PROFESSION_QUARRY`). "A bridge is the end of that chain".
- Fear/danger is also lore: mauling memory, `dread()`, a village's fear = share of members carrying such a memory.
  `cry/relay/heard` (`lore.js:859-928`): a distress call propagates as a relay chain through slimes who hear it but cannot
  help, fading with each hop.
- Map fog for the PLAYER: "The map starts blank... the ground anybody has laid eyes on, by the same reckoning they use to
  remember it... It never goes back." Implemented via `explored(holder, game)` / `prospect` (`lore.js:751-815`); renderer and
  minimap wear it; B key lifts it (debug).
- Brief fit: this is exactly "documentation / teaching / observation" knowledge transfer from pillar 1, at the level of
  geographic knowledge only. It does NOT model technology/recipe knowledge or skills teaching.

### B10. Ecology
- World gen (`S/world.js`, `World` class `:133`, `generateLand :860`): value noise + radial falloff -> island, separate
  moisture and mountain-massif noise; biomes beach/grass/meadow/forest/marsh/rock/highland/pond from height x moisture;
  flood-fill walkable regions so nothing targets unreachable islets. `CFG.WORLD_GEN: 3` stamped into saves. Island size
  `ISLAND_TILES_MIN 9000 .. MAX 72000` tiles; `LAND_SHARE_MIN/MAX` controls scattered-islets vs continent-lump. Islets under
  `ISLET_MIN: 80` are drowned. Bridges/docks (`crossings()`, `layDeck`) are real buildings that make water walkable.
- Plants (`flora_system.js`, `data/flora.js`, 20 species): growth, moisture (ground-water per tile), fruiting, seed spread,
  withering; berry bush = 11 days seed->fruit. Per-species "how many of its own kind it wants within arm's reach" gives
  fields vs thickets vs spaced trees from one number ("Nothing in the simulation knows what wheat is"). Preferred warmth
  compared with standing warmth; frost takes what cannot stand it. "Spread is meant to be close to a draw": no population
  cap, births ~ deaths. Sprigling = walking seed carrying "condition" from the suitability of the ground it walks over.
  Drought: parched plants stop fruiting, fruit spoils on the branch, rescued plants come back shorter-lived.
- Animals (`fauna_system.js`, `data/fauna.js`): hoppers, glidedeer, shellbacks, tusklings, prowlers. Hunger, food chain,
  young->adult, breeding by two fed adults near each other, winter dormancy (shellbacks/tusklings), spring refill.
  Prowlers hunt lone slimes but won't press into a settled village. Carcasses: "Nothing drops loot"; a body rots on its clock
  and must be butchered on the spot (`Game.dropCarcass`, `updateCarcasses`).
- Kept beasts (`pen.js`): paddock, fodder, escapes, drive job (>=3 slimes behind the animal, "Nothing is tamed. Beasts are
  walked home.") -- the animal husbandry pipeline. Pen rails are real obstacles in the pathfinding obstacle index.
- Seasons (`season.js`): everything reads `warmth` (cosine through the year), not a season name. Annual mean of every
  seasonal multiplier is 1.00 by construction (rule written next to the config); only `COLD_HUNGER` and `FROST_ROT` are
  allowed to hurt. `SEASON_LOOK: 20` = how many days ahead villages plan; larder/fuel/fodder wants are driven by the
  future warmth, not today's. Snow accumulates, is cleared by lit hearths and by foot traffic. Landing is on day 5 of spring
  so the first month is fair (first pass killed islands in the first fortnight).
- Soil (`World.spendSoil/recoverSoil/leachRichness`): anything dying takes fertility out of the tile; recovers in 1-2
  weeks. Crop rotation emerges from "plot sows rested rows first". Trampling (`world.trample`, `tramplingAt`) creates desire
  paths; walking damages plants; rough ground costs more to cross; tended plots exempt.
- "Natural growth cannot feed a village -- it is a thing to start from and a thing to fall back on."

### B11. Building
- Building defs in `data/craft.js` (`BUILDINGS`): burrow, shelter, straw_hut, log_cabin, stone_cottage, grand_lodge (5 housing
  tiers), stockpile, granary, firepit, well, workshop, forge, furnace, mine, farm_plot, greenhouse, hunters_lodge, paddock,
  bridge, dock, totem, golden_idol. Each has a bill of materials, `hp`, `comfort`, `houseCap`, `mind` cost, optional `station`.
- Placement is automatic: `Game.findBuildSpot(type, slime)` (`:3069`), `finishBuilding`, `clearGround`. The village picks
  what to build (`jobs.wantedBuilding`, `ladderFor(v)`), slimes haul materials to a site and work it.
- Decay: "Everything standing is falling down". One rate per village; lifetime derived from the building's own hp
  (leaf burrow ~5 days, straw hut ~5 weeks, log cabin ~2.5 months, grand lodge ~most of a year); mended with what it is made
  of (read from its own bill). Plots and bridges exempt (no bill / mechanical reason).
- NO freeform design: buildings are fixed footprints with fixed recipes. No room recognition, no blueprints, no terrain
  destruction (mines are a building with caveins/dynamite, `updateMines`, `caveIn`, `blastMine`). Terrain is immutable except
  soil/trampling/snow/decks.
- Crafting: `CRAFT_RECIPES` with `station` (workshop/forge/furnace/firepit) and `work` seconds; tools wear out
  (`durability`, `worn`). Tech ladder: flint/wood -> stone+bone (workshop) -> iron (forge) -> steel (furnace); coal, gold,
  dynamite. Stops at roughly Iron/Steel age.

### B12. Ruins
- Last member dies -> `abandonVillage` (`game.js:3458`) -> buildings stay, derelict, with stock; lose `RUIN_DECAY: 1.1` hp/day;
  `updateRuins` (`:3613`), `adoptRuins(v)` (`:3830`). New bands will cross the island to settle a ruin and keep the old name
  and chronicle ("the place did not stop being that place"); neighbours instead salvage (`SALVAGE_YIELD: 0.55`,
  `SALVAGE_RANGE: 900`). Unfinished sites don't survive. Rubble mound as final state (`toRubble`). `debug_ruins.js` tests it.
  Matches the brief's "world also ages" and the prm note "Eventually becomes ruins which are unsleepable".

### B13. Save / persistence
- `S/save.js` (`snapshot`/`restore`, `SAVE_VERSION = 1`) pure, no DOM, no storage. `store.js` (358 lines) is the only file with
  IndexedDB/localStorage/Blob/clock: IndexedDB first, localStorage fallback if small, file export/import always. Autosave paced in
  island days with a wall-clock floor, serialised in an idle callback, continues in hidden tabs.
- Design: (1) terrain is NOT stored: "regrown" from seed (pure function), only changed ground arrays stored sparsely and
  EXACTLY (an earlier byte-quantised version caused a 5-plant drift in a day: "a tile off by a thousandth makes a bush mature
  one tick early, which changes which random numbers come next"); (2) references become ids and are relinked; (3) generic copy
  of plain-data fields with a DENYLIST (`DROP` tables) rather than per-class field lists, so new numeric fields save for free;
  transient job/path state is dropped and re-established within a second. The header of save.js still says "quantised to a
  byte" while README says exact -- header is stale. Mid-errand restore is stated in README ("the same slimes, mid-errand")
  while save.js says jobs are dropped; both can be true (jobs re-derive) but README's claim is slightly overstated. UNVERIFIED
  which fields actually survive.
- Saves are plain JSON; mature island = a few MB; version mismatch refuses load (`save.js:669`), no migrations.

### B14. Determinism
- One global RNG: Mulberry32 (`util.js:4`) with 1-word state, `reseed`, `rngState`, `loadRngState`. Entity ids from a global `uid`
  counter (`uidAt`, `setUid`). Terrain a pure function of seed. `Game.step(dt)` is deterministic given identical dt sequence.
- Gotchas written into the README and test: two `Game`s in one process share RNG+uid globals, so the round-trip test swaps
  both in/out around every step. The comparison dt matters (1/10 vs 1/30 agree "within a few percent", not exactly).
- `sway()` and `temper()` inject small deliberate variety through the same RNG / id hash.
- Verified by running: round-trip checks "both islands drew the same random sequence throughout" and "handed out the same ids".

### B15. Job board / decision model (needed to understand everything else)
- Header of `jobs.js`: "There is no global assignment pass. Once per second each village computes its own `demand` vector --
  how badly it wants food, water, wood, shelter and so on -- and each idle slime scores the jobs it can actually see against
  that vector, weighted by its profession and by how far it would have to walk... every job a slime takes can be explained by
  two numbers." `computeDemand(v)` every `CFG.JOB_REFRESH`; `findJob(slime, game)` (`jobs.js:1794`) builds candidates, each
  `score * temper * sway`, argmax. Claims (`target.claimedBy`) prevent crowding; `debug_flock.js` checks it.
- `ai.js` header: "A job is plain data... a slime never holds a job it cannot finish, which is what keeps a long unattended
  run from silting up." Every job branch finishes, fails or times out. Stage-based state machine.
- Per-capita targets (`TARGET` food 14, water 9, wood 10 ...) with absolute `CEILING`s; documented trap: ceilings binding on
  food killed 97 slimes in one winter. Fixed.

---------------------------------------------------------------------------------------------------------------

## C. Reuse / adaptation candidates (honest assessment)

Overall: the SIM is reusable as a reference and possibly as a codebase seed; the RENDERER/UI are tied to 2D top-down canvas
and to the "watch only" interaction model. The brief says "do not implement"; this section is for the GDD's feasibility
claims only. Engine is explicitly undecided in the brief ("do not commit us to an engine"), so JS-vs-other-engine reuse
matters: logic is portable as design, copy-reuse only if the new game is also JS/TS.

| Candidate | Verdict | Evidence |
|---|---|---|
| Deterministic sim core + fixed-step `Game.step(dt)` | HIGH value, VERIFIED | Ran `headless.js` (161x realtime) and `save_roundtrip.js` (all pass). Pure sim, no DOM. |
| Headless test harness set (headless/sweep/fixture/debug_*) | HIGH, VERIFIED pattern | Scripts run directly under node; `sweep.js` judges survivors, reports survival rate rather than requiring it ("complains in both directions": <45% too harsh, 100% too easy). Pattern is engine-independent. |
| Save roundtrip test ("step both, demand agreement") | HIGH, VERIFIED | Found six real bugs, four in the sim. Keep as a mandatory gate in any new project. |
| Save architecture (regrow terrain from seed + sparse deltas + id relinking + generic copy with denylist) | HIGH as design | Read `save.js` header; exactness lesson is valuable. Denylist approach scales with a fast-changing codebase. Needs migrations for a shipped game (none now; version mismatch refuses). |
| Fixture system (frozen mid-game islands) | HIGH, VERIFIED present | `tests/fixture.js` with 4 fixtures. Solves "20 min to reach day 170" for every debug question. |
| Trait + `settle()` soft-cap inheritance | HIGH, small, VERIFIED | `util.js:59`, `slime.js` `breed`. Directly answers brief's "no optimal super-species". Drop-in and tiny. |
| `TRAIT_INFO` readout contract ("ranges = generation ranges") | MEDIUM | Good UX/data discipline. |
| `temper()` per-individual job lean | MEDIUM | Cheap personality hook; also prevents flocking. Could become the seed of "personality/inclinations". |
| Village demand vector + scored job board | HIGH as autonomous-labour model | Maps well to "Maintain 200 lumber in storage" (operational control = set target on a demand term) and "assign five villagers to lumber" (= bias/priority on specific slimes). Needs a layer for explicit orders. Mid-complexity: 3.5k+ lines in `jobs.js`, many special cases. |
| Lore (sight / cell memory / gossip / belief) | HIGH originality, MEDIUM-HIGH reuse | Fits "knowledge transferred via teaching, observation, documentation" if extended from geography to skills/recipes. Expensive to port: 928 lines plus hooks in `ai.js`/`jobs.js`. Risk: perf at scale (UNVERIFIED beyond README claims "~1.4 ms/tick for 100 slimes"). Player-side fog from the same data is neat but interacts with the "godlike overseer" view. |
| Season/warmth curve + normalise-to-mean-1 rule | HIGH, VERIFIED in code/config | `season.js`, README tuning notes. Generic balancing rule, engine-independent. |
| Plants/animals lifecycle (birth-growth-age-death, no spawn caps) | HIGH for "whole world ages" | Plants: age, lifespan, fruit, seeds; animals: young -> adult -> death; `respawnFauna` exists (a floor that only rescues a near-extinct species -- not a cap). Matches the added note "Individuals age over time. Ideally this also applies to the whole world." |
| Soil exhaustion + trampling/desire paths | MEDIUM-HIGH | Emergent and cheap (per-tile float arrays); feeds terrain feel. |
| Ruins/salvage/resettlement | MEDIUM-HIGH | Fits civilization progression and "same settlements exist across the progression"; extends to persistent history. |
| Chronicle (`village.chron`) | HIGH, small | "A personal history" for settlements; the per-slime `log`/`note()` is the individual version. |
| Worldgen (island, biomes, regions, A*) | MEDIUM | 2D tile heightmap + biome table + flood-fill regions. Not voxel, no caves/ores in 3D depth. `deposits` and `mine` buildings do ores. Brief wants destructible terrain -> this world is read-only terrain. `findPath` A* with obstacle index and per-step path budget (`pathBudget`) is reusable. |
| Build/housing/decay/repair model | MEDIUM | Decay from `hp`, mend with own bill-of-materials ("anything added tomorrow is repairable the day it exists"). Good pattern; but buildings are fixed prefabs, not freeform rooms. |
| Pen/animal-drive system | LOW-MEDIUM | Very specific; interesting emergent herding but niche for MVP. |
| Colour genetics/diet/kinship/belonging | MEDIUM (identity/visual), LOW (core gameplay) | Gives visible lineages; fits "interesting individuals". Ties to prm "Eating flowers subtly changes color" and "identity with the color of their village". |
| Renderer / UI / minimap / quality presets | LOW | Canvas 2D top-down; no billboard 3D; tied to this game's UI. Perf design (hidden tab skip draw, adaptive quality, season layer composited once) is a useful pattern list. |
| Player-goals / focus ("influence") | LOW for brief | See D. Interesting but conflicts with direct orders; could remain as an optional "blessing" layer. |
| Performance claims | UNVERIFIED beyond my headless run | README: "about 1.4 ms per tick for a hundred slimes". My run: pop ~6 for 20 days was 30 s wall at 1/10 step (dominated by 1,500 plants + 360 animals + world gen) -> no population stress test performed. |

Gaps the new game must fill (not in slime-village at all): skills/XP; possession/direct control; explicit orders/assign groups;
operational targets ("keep 200 lumber") as player-facing; freeform buildings and blueprints; destructible terrain / 3D;
logistics beyond carrying in hands (no carts/wagons); tech beyond steel; space/planets; combat with permadeath stakes
(animals do hurt: prowlers, tusklings; no "send a miner into the woods" adventure loop); multiple species/cultures;
diplomacy; Orks-style belief-physics (nothing).

---------------------------------------------------------------------------------------------------------------

## D. Divergences / tensions the new design must resolve

1. Control model. slime-village: "You don't command them." Brief: strategic orders ("assign five villagers to gather lumber"),
   operational targets, blueprints, AND possession of an individual. Existing `edit.js` "plans" (stake out a site, village builds
   it when it can) and `FOCUS` (weight the demand vector) are the closest precedents. Resolution options to evaluate: orders as
   large temporary multipliers on the same demand/score system (slime still eats first -- preserves "a starving village told to
   build houses still goes and eats first") vs hard commands that override needs. README's own consequence: "Push a village
   harder than it can carry and it will overextend" -- keep as the cost of over-ordering?
2. Author's stated direction vs current code. Discord: "Right now it's much more of a sim while I'm testing balances... plan is
   to eventually dumb them down so the player is responsible for telling them what to do and what to build and where." So the
   autonomy in slime-village is partly a TEST HARNESS for balance; the brief wants autonomy to remain playable without
   micromanagement ("civilization should remain functional when the player chooses not to personally engage"). Decide the
   autonomy dial: which decisions (what to build, where) are player-owned vs default-automated.
3. Time scale. slime-village: a life is ~100 days, 4-7 real hours at 1x, designed for long background run and 50x. Brief wants
   hundreds of hours on the first planet with persistent individuals through eras. One generation per ~4 real-hours at 1x
   conflicts with "same individuals across the progression" unless lifespans/era length are re-tuned. Tension: perma-death and
   attachment vs a few-hours lifespan.
4. Skills. Existing: fixed random profession, genetic traits constant for life, no learning. Brief: skills grow through
   activity including downtime; "genetically gifted miner starts with potential, not expertise"; gifts capped. Must define
   potential vs current and how genes bound XP.
5. Genetic cap. Code uses unbounded log-compressed soft stops (`settle`); Discord/brief suggest "capped limit". Choose hard cap
   on potential, or keep soft diminishing returns, or both (soft on genes, hard on skill).
6. Terrain model. Read-only 2D tile map with biome/fertility layers vs brief's Minecraft/Terraria destructible terrain and
   possibly 3D (billboard sprites, FPV). World/pathfinding/save assume immutable terrain from seed: "Terrain is a pure function
   of the seed, so a save holds the seed" breaks the moment terrain is digable -- either store dig deltas sparsely (same
   mechanism used for soil/trample today) or abandon regrow-from-seed.
7. Construction. Fixed prefab footprints chosen by the sim (`findBuildSpot`) vs freeform room-recognition/blueprint building.
8. Camera/presentation. Top-down canvas, no possession view, no billboard 3D. `hitbox.js` / render modules not evaluated for
   reuse (UNVERIFIED).
9. Scope of progression. slime-village stops at steel/dynamite; brief runs through to space. The `mind` cost mechanism
   (ambition gates tech) could be extended or replaced by research/knowledge-in-heads.
10. Village identity. slime-village villages are emergent splinters with no player ownership; brief centres on ONE civilization
    guided by the player (possibly multiple settlements but "the same individuals and settlements across the progression").
    Existing multi-village competition and ruins are a bonus; player-owned vs AI villages undecided.
11. Species. Only slimes are people; brief says "Slime / Dorf" and Stellaris-style divergent civilizations. Dorfs project (dwarves)
    shows the author already considered a second species.
12. Genes vs culture. Existing knowledge is geography only; brief lists teaching/apprenticeship/documentation of KNOWLEDGE.
13. Combat/adventure. Brief's Cult-of-the-Lamb/BALL x PIT adventure loop and risking a max-level miner in the woods; slime-village
    has predators but no adventure/dungeon concept and guard/hunter are just job affinities.
14. Documentation drift risk in the source itself (README vs code on ambition table, save quantisation, "fourteen" quests).
    Treat README as intent and code as truth.

---------------------------------------------------------------------------------------------------------------

## E. Lessons learned visible in code/tests/README

Debug scripts (tests/debug_*.js), what each investigates and what it found:
- `debug_ambition.js [days] [seeds]`: day each milestone lands at several `CFG.AMBITION` values. Lesson: ambition is pace
  not ceiling; the old ceiling model was replaced.
- `debug_belong.js [fixture] [days]`: colour-convention behaviour. Wants DIVERSITY not similarity: a monochrome town sheds its odd
  member; a mixed town sheds nobody; wanderers prefer mixed towns. (Problem: uniform colour drift/assortative lock-in.)
- `debug_bridge.js` / `debug_bridge_from.js <save>`: how slimes answer water; islands are no longer joined by the generator past a
  sandbar width, so crossings are a village project. `_from` resumes from a saved island because "growing one takes four
  minutes of simulation before the question begins".
- `debug_churn.js`: finds slimes thrashing between jobs. Found: `doFound` re-rolled a random build site every frame so surveyors
  chased a new destination sixty times a second ("glitching back and forth").
- `debug_deaths.js`: dumps each death with its job history, to trace balance problems to a stuck behaviour.
- `debug_eco.js`: planted vs available rows, crop thirst, herd sizes, carrion, where the day goes. Found: empty-crop-field bug --
  a plot's own footprint counted as an obstruction so seeds bounced off.
- `debug_flock.js [fixture|days seed]`: counts slimes pointed at one target (herd behaviour). Result informed `temper()`/`sway()`.
- `debug_leisure.js`: do slimes get free time, do burrows decay? (chat/work/idle tick shares.)
- `debug_pens.js`: three silent failure modes of husbandry (nobody builds a paddock / nobody gets a beast in / herd lost over the
  rail). Found a deadlock: empty pen -> eats nothing -> wants no fodder -> trough stays empty -> drive job refuses -> pen
  stays empty; one paddock on day 85, no animal in it by day 140.
- `debug_ruins.js`: abandonment, resettlement, salvage, decay; because ruins are too rare to hit through a sweep.
- `debug_scraps.js [fixture] [days]`: are leaves/fibre/bone worth chewing, and does meat taste of what it came off?
  A/B arms with nutrition zeroed to measure whether browsing prevents starvation.
- `debug_season.js [days] [seed]`: per-season row (food/head at winter turn, starvation deaths, standing wild fruit in February).
  Target: "A winter nobody dies in is not hard enough; one that halves the population is... an extinction event."
- `debug_soil.js`: exhaustion, recovery, rotation, invisible in summary rows so needs a direct test.
- `debug_split.js`: clone colour and cost of splitting (Gloop magenta -> Wisp orange bug).
- `debug_spread.js`: plant reproduction target "on average a bush should spread about once in its life" with no cap;
  births vs deaths level by themselves. "in the owner's words".
- `debug_tourist.js`: do villageless slimes help a foreign village, and at what cost to themselves.
- Four extra files without header read: `fixture.js` (saved starting islands), `browser.js` (playwright), `sweep.js` (multi-seed
  survival), `headless.js` (one colony).

Lessons from README/commit narrative (all cited in prose, i.e. the author's own post-mortems):
- Hard thresholds are traps. Breeding gate -> a cohort aged out together with full stores; replaced by weighted odds (`plenty`),
  and `peril` replaced thresholds at pop 8-9. Same for food ceilings (97 starved), and `settle` replacing clamps.
- Seasonal curves must be normalised to a mean of 1: winter breeding 0.3 / summer 1.0 averaged 0.65 -> halved the median population
  (13 settlements to 7) over eight islands at 120 days.
- Fair start: landing needs food and FIBRE in reach (fibre is "the keystone": burrow = 6 fibre, bucket = 6). Landing on coldest
  day killed islands in first fortnight; shifted to spring day 5. Wild grass carries seed or fibre goes locally extinct.
- Visible > hidden: fields simulated but undrawn (trampling) became a readable mechanic once drawn; "particles are a readout".
- Determinism bugs surface only under exact comparison: six bugs from `save_roundtrip.js` (loaded state fresher than saved
  state; animal targets dropped; demand vector missing for a second after load; routes thrown away; flask held forever by
  dead slime; watering claim leaked per plot). Module-level globals (RNG, uid) forced a swap-in/out dance in the test.
- Quantised saves are not safe for a chaotic sim (one tick early -> different RNG sequence -> 5 extra plants a day later).
- Unit scale: changing `DAY_LEN` requires re-scaling per-second rates (hunger, thirst, spoilage).
- Perf: simulation cheap, canvas fill expensive; coarser dt costs MORE work per sim-second than fine dt (measured: 1/3 s step
  costs more than three 1/10 s steps); wall-clock budgets prevent hangs at large populations.
- Mid-game bug hunting by frozen fixtures is orders of magnitude cheaper than growing islands from day 1.
- Geography kills by design: stranded slimes are not teleported ("the island's shape cost nothing" otherwise).
- Design heuristics repeated in prose: "arrived at rather than imposed" (crop rotation, desire paths, village rallying to a drive);
  "Nothing in the simulation knows what wheat is" (generic data-driven species); "a settlement that can fail is the only kind
  whose success means anything"; "Surviving is not guaranteed and is not meant to be" (sweep reports survival rate, wants
  45%..<100%).

---------------------------------------------------------------------------------------------------------------

## F. Dorfs and prm notes: ideas worth preserving

### F1. games/Dorfs (Godot, 2021)
- `baseEntity.gd`: base stats (health 100, shield 100, attack 3, inventory_slots 10, lung_capacity 10, speed 5), basic needs
  (hunger, thirst, tiredness), Dwarf Fortress attribute enums stubbed (Strength, Endurance, Willpower, Clumsiness, with a link to
  the DF2014 wiki attribute page), Mood enum (HAPPY..ANGRY), Hunger levels (STARVING..STUFFED), Wetness (DRY/WET/SOPPING).
  Idea: DF-style attribute set, graded mood/hunger/wetness labels. Mostly empty.
- Commit messages: "all your modularity are belong to us", "testing class inheritance and modular programming" -- early
  inheritance experiment (Entity -> Mob/Enemy/Slime/chief). Nothing to port. Name "Dorfs" confirms the dwarf/slime duality in the
  new title: Dorf was a human-ish "man.png" sprite, so the new game's "Dorf" could be a second race.
- Comment: "this one may not be as useful, since a mob could be friendly and patrolling" -- state enum doubts, minor.

### F2. prm/slime_world == SlimeWorld (July 2024) -- original design seed. Ideas, tagged by whether slime-village implemented them
- Slimes eat to build MASS, burn mass continuously and extra on activities, split at max mass (maybe needing a mate; mating also
  merges stats). IMPLEMENTED in altered form (split = `bearChild(a,a)` solo clone with `recovery` cost; no mass variable).
- Eating changes colour toward the food; stabilise to village colour; identity with the village colour; older slimes' colour
  changes more subtly; colour-coded city. IMPLEMENTED (diet pull, `belonging`, kinship, names) except "older slimes change
  subtly" and "take on colour of surroundings".
- Traits: speed, max mass, max health, likes/dislikes (food, people, weather, animals, colors), strength of colour. PARTLY: speed,
  maxHealth yes; likes/dislikes NOT present in slime.js traits; skills "farmer, chef, fisher, hunter, miner, smith" are
  innate in the notes -> became `PROFESSIONS` without chef/fisher/smith.
- "When wanting something work backwards: Food -> crop -> water bucket -> ... -> wood". PARTLY: job board is demand-scored
  rather than goal-regressing. A backward-chaining planner (GOAP-style) is NOT in the code. Good candidate for a "slime crafts
  what the order needs" feature.
- Claims on tasks with expiring flags. IMPLEMENTED (`claimedBy`).
- Task board / town billboard (slimes add tasks, billboard of town state). IMPLEMENTED differently: no board of requests; the village
  `demand` vector plus lore poll ("without a hive mind" concern solved by lore.js).
- Food piles vs material piles; storage extends life of food (item expires). IMPLEMENTED (`stock.js`, spoilage, granary).
- "Background desires - dislike walking long distances": every long carry adds to a desire for efficiency, dissipates; implies
  self-driven optimisation (build a well nearer). NOT implemented as such; desire paths and `fireWant` are cousins. Worth preserving
  as the brief's "inhabitants who improve their own base".
- Territory: seeing another slime attack a living thing in my territory, if not friends/family: attack; "friends will allow
  co-existing slime races". NOT implemented (no slime-vs-slime conflict found; UNVERIFIED by grep of combat). Matches Stellaris
  divergent civilisations.
- Building: add items one at a time, 10 s per item, single item carried so others can help. Probably implemented (construction is
  worked by several slimes), UNVERIFIED.
- Unused buildings break down; sleeping in a house repairs it; ruins. IMPLEMENTED in altered form (decay by hp, repair by builders;
  sleeping-repair UNVERIFIED).
- Animals/plants auto lifecycle. IMPLEMENTED. "Livestock do NOT respawn... maybe wolves from caves" -> code has
  `respawnFauna` rescue-only; "rock piles grow with health (quick when high, slow when depleted)" -> deposits/mines exist, regrowth
  UNVERIFIED.
- Trade with slimes of other villages. NOT implemented (villages exist but no trade; tourists give help freely).
- Food preferences: eat by hunger and liking; hated foods only when starving; wandering for food/shelter/materials. PARTLY.
- MANA / summoning (spawn slimes, materials, animals, plants, buildings; deleting live things GAINS mana, scaled by breeding-age
  value: near birth/death 0, adult 1, prime 2). This prototype of a "god powers" economy is NOT in slime-village (the world editor
  is free). Strong fit for "godlike overseer" + the Orks "belief shapes reality" idea; also an explicit anti-exploit rule (prime-age
  deletes pay double) worth noting.
- POC "walking berry": a berry that runs around and plants itself, grows, sprouts more berries, then dies. IMPLEMENTED as
  "springlings" (walking seeds drawn as what they will become) -- the author's favourite whimsy, preserved.

### F3. scad/slime_colony
- Physical tabletop pieces. Possible shared IP flavour only (Queen/King/Royals/Droplet slime variants, resource tokens). No code.

---------------------------------------------------------------------------------------------------------------

## G. Notes for the GDD team (neutral; not decisions)
- If the new game is JS: `util.js` (RNG, settle, helpers), `save.js` pattern, `season.js`, test harness scripts are copy-adapt candidates.
- If not JS: treat slime-village as a spec by example; the highest-value artefacts are the README prose (rationales), the config
  comments, and the debug-test narratives, not the code.
- The `config.js` file (2,351 lines) is mostly heavily-commented tuning knobs with their reasons; it is effectively a second design doc.
- Keep a mandatory test trio from day one: headless smoke run, multi-seed sweep that judges the SURVIVORS, exact save round-trip.
- Verification still outstanding for anyone who needs it: `ai.js` pairing/bonding logic; `render/` modules; actual combat code;
  the food-boon trait mechanism; performance at 200+ slimes; the browser test.
