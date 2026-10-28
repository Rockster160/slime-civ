// Plain-language text for the player (GDD §22): what a villager is doing, why,
// what it could not do and why not. Pure functions of sim state - no DOM - so
// tests/ui_text.js can check coverage headlessly.
import { ITEMS, haveTotal, survey, JAR_HOLD } from "../sim/items.js";
import { WAGON, cartAnimal, wagonReady } from "../sim/wagon.js";
import { BED_COST, RACK_COST, CRIT_BASE, CRIT_WINTER, village } from "../sim/board.js";
import { winterAhead, seasonIdx } from "../sim/season.js";
import { costOf } from "../sim/build.js";
import { ageDays, lifeStage, maxHp, fitness, isAdult, TRAITS, FOUNDER_RANGE } from "../sim/villager.js";
import { level, profession } from "../sim/skills.js";
import { MAT, M, F } from "../sim/world.js";
import { DIG } from "../sim/dig.js";
import { marked } from "../sim/mine.js";
import { isSeen, isOre } from "../sim/seen.js";
import { LEVEL_NAME, heatReport } from "../sim/heat.js";
import { RECIPES, QWORD } from "../sim/craft.js";
import { can } from "../sim/knowledge.js";
import { CRAFTS } from "../sim/phenomena.js";
import { FIRE_R, smokeFire, SMOKE_R } from "../sim/fire.js";
import { FAUNA, huntingPressure } from "../sim/fauna.js";
import { CROP, cropStage } from "../sim/farm.js";
import { DAY } from "../sim/clock.js";
import { crewOf, taskText } from "../sim/crews.js";
import { BIOMES, biomeAt } from "../sim/biome.js";
import { TORCH_R, LAMP_R } from "../sim/light.js";
import { hazardLines, VENT_N, POCKET_N } from "../sim/underground.js";

/** Every blocker enum the sim can emit (jobs.js, tasks.js, path.js, actions.js) has a sentence here; tests/ui_text.js enforces it. */
export const BLOCKER_TEXT = {
  NO_PATH: "no way to get there",
  BUDGET: "the route is too long to work out",
  BLOCKED: "something is in the way",
  NO_MATERIAL: "the materials are not there",
  NO_CAPACITY: "their hands are full",
  NO_SEASON: "it is out of season",
  RESERVED: "someone else is already on it",
  MAX_WORKERS: "enough people are already on this job",
  NO_STORAGE: "the stockpile has no room",
  NEED_CRITICAL: "a survival need comes first",
  LOWER_SCORE: "something else scored higher",
  NO_SITE: "there is nowhere to build it",
  NO_TARGET: "nothing left to work on in the order area",
  NO_WATER: "no water within reach",
  GONE: "the target is gone",
  TOO_FAR: "too far away - walk next to it first",
  UNSUPPORTED: "what is left is waiting for walls or floors to be finished first",
  NOT_ORE: "that is not a seen ore or clay seam (click a coloured cell you have uncovered)",
  NO_ROUTE: "a stair cannot go down there (water, built ground, the map edge, or no rock to stand on)",
  NOTHING_TO_DIG: "there is nothing to dig there",
  TOO_BIG: "that area is too large to mark at once",
  UNKNOWN_ITEM: "the village does not know how to look for that",
  UNKNOWN_CRAFT: "nobody in the village knows how to do that any more",
  NO_CANDIDATE: "there is nothing new within reach to try",
  COOLDOWN: "that spot has already had its experiment today",
  TOO_COLD: "the fire there does not get hot enough for it (click the station to see why)",
  NO_STATION: "the place to do it has not been built",
  STATION_BUSY: "every one is already burning a batch",
  NO_TOOL: "it needs a tool nobody has yet (deep rock takes an iron pick)",
  NO_ANIMAL: "the cart has no penned grazer to pull it (keep a grazer in a big pen)",
  NO_FODDER: "the cart's grazer is not fed: its pen has no fodder in the trough (haul grass to the pen)",
  NO_PEN: "there is no finished pen with room for another animal (stake one out in build mode; a grazer needs a big pen of 12 cells or more)",
  UNSAFE: "too dangerous to do on their own: it is the thornback's ground, cave nobody has mapped, a roof that is cracking or air that is foul, and villagers will not go there unless you guide one yourself",
};

/** Job-specific refinements: what exactly is missing. Falls back to BLOCKER_TEXT. */
const SPECIFIC = {
  NO_MATERIAL: {
    craft_site: (r) => (r && r.item ? "not enough " + itemName(r.item) + " in the stockpile for the next piece" : "the materials are not there"),
    build_site: (r) => {
      const it = r && r.item;
      if (it === "stone" || it === "dirt") return "no " + it + " in the stockpile - order villagers to dig for it";
      return it ? "not enough " + itemName(it) + " in the stockpile for the next piece" : "the materials are not there";
    },
    dig: () => "nothing here can be dug",
    mine: () => "everything marked is being dug already",
    build_bed: () => "no grass in stock (a bed takes " + BED_COST.n + ")",
    build_rack: () => "not enough sticks in stock (a rack takes " + RACK_COST.n + ")",
    dry: () => "fewer than 5 berries in stock",
    forage: () => "no ripe berries within reach",
    chop: () => "no free trees nearby",
    cut: () => "no grass tufts left nearby",
    haul: () => "nothing loose to haul",
    tend_fire: () => "no sticks or logs in the stockpile to feed the fire",
    tinker: () => "the material for the experiment is not in the stockpile",
    fire_kiln: (r) => "not enough " + (r && r.item ? itemName(r.item) : "material") + " in the stockpile for a kiln load (order it dug: clay comes from the stream bank)",
    smelt: (r) => "not enough " + (r && r.item ? itemName(r.item) : "material") + " in the stockpile for a smelt (malachite is dug; charcoal is burnt)",
    burn_charcoal: (r) => "not enough " + (r && r.item ? itemName(r.item) : "logs") + " in the stockpile for a mound",
    make_tool: (r) => "not enough " + (r && r.item ? itemName(r.item) : "material") + " in the stockpile for the bench work" + (r && r.item === "stone_axe" ? " (framing wants an axe in the village)" : ""),
    smoke: (r) => "not enough " + (r && r.item ? itemName(r.item) : "meat") + " in the stockpile for the rack (hunt for it)",
    fetch_water: () => "no water to fetch",
    sow: (r) => "no " + (r && r.item ? itemName(r.item) : "seed") + " to spare in the stockpile (the village keeps its last two to eat; forage some)",
    fence: () => "no sticks in the stockpile for the fence",
    fodder: () => "no grass in the stockpile for the pen's trough",
    cook: () => "fewer than 3 raw meat or tubers in stock to cook",
  },
  NO_TOOL: { mine: () => "deep rock is marked and nobody has an iron pick (iron is smelted at a coal forge, then forged)", dig: () => "that rock is too deep for the tools they have: it takes an iron pick" },
  NO_STATION: { cook: () => "no closed room is set to Kitchen with a fire ring in it", fire_kiln: () => "no kiln has been built", smelt: () => "the station for it has not been built (copper and casting want a kiln, iron a brick forge)", burn_charcoal: () => "no charcoal mound has been built", make_tool: () => "no workbench has been built", smoke: () => "no covered rack has been built" },
  STATION_BUSY: { fire_kiln: () => "the kiln is already burning a batch", smelt: () => "the kiln or forge is already burning a batch", burn_charcoal: () => "the mound is already smouldering", make_tool: () => "the bench is in use", smoke: () => "the covered rack is already full of a smoking batch" },
  TOO_COLD: { cook: () => "the kitchen fire is not lit (it is fed when it is cold, or when there is food to cook)", fire_kiln: () => "the kiln does not reach the Kiln level (a wood face above it, or no lining)", smelt: () => "the furnace is not hot enough: copper and casting need charcoal and a draft, iron needs coal in a forge with a bellows beside it or on the ridge (click it)", burn_charcoal: () => "the mound is not sealed right (click it)", smoke: () => "no lit fire burns beside the covered rack (smoke comes from the hearth within three cells)" },
  NO_CAPACITY: {
    build_site: () => "their hands hold something else",
    craft_site: () => "their hands hold something else",
    forage: () => "their hands are full of something else",
    chop: () => "their hands are full",
    build_bed: () => "their hands hold the wrong thing",
    tend_fire: () => "their hands hold something other than fuel",
    tinker: () => "their hands are full, so they cannot take anything to try",
  },
  RESERVED: {
    build_site: () => "every buildable piece already has someone on it",
    craft_site: () => "every bed and rack you planned already has someone on it",
    forage: () => "the nearby bushes are already taken",
    chop: () => "the nearby trees are already taken",
    cut: () => "the nearby tufts are already taken",
    build_rack: () => "someone is already building the rack",
    tend_fire: () => "someone else is already feeding the fire",
  },
  NO_PATH: { dig: () => "no way to stand next to the rock", mine: () => "no way to reach the cells you marked (a tunnel is planned first if it can be)", build_site: () => "no way to reach the building site", craft_site: () => "no way to reach the planned bed or rack" },
  MAX_WORKERS: { tend_fire: () => "two people are already on the fire", tinker: () => "enough people are already experimenting", mine: () => "enough people are already digging (while the village needs food or beds only a fifth of it digs)", build_site: () => "most of the village is already building (the cap is 70%)", craft_site: () => "most of the village is already building (the cap is 70%)" , sow: () => "enough people are already working the field", harvest: () => "enough people are already working the field", till: () => "enough people are already working the field", water_field: () => "enough people are already working the field", fence: () => "two people are already on the fence", fodder: () => "two people are already tending the pen", slaughter: () => "two people are already tending the pen" },
  NO_SEASON: { forage: () => "berries do not grow in winter (roots can still be dug)", dry: () => "berries do not grow in winter", sow: () => "too late in the year: a crop sown now would not ripen before the frost (fields lie fallow in winter)" },
  NO_WATER: { water_field: () => "there is no water within reach to carry to the field" },
};

/** Short names of jobs: `now` for what a villager is doing, `noun` for lists of alternatives. */
export const JOB = {
  eat: { now: "Eating", noun: "Eat" },
  drink: { now: "Going to drink", noun: "Drink" },
  sleep: { now: "Sleeping", noun: "Sleep" },
  huddle: { now: "Huddling to keep warm", noun: "Huddle" },
  leisure: { now: "Relaxing", noun: "Relax" },
  forage: { now: "Foraging for food", noun: "Forage" },
  dry: { now: "Drying berries on a rack", noun: "Dry berries" },
  build_bed: { now: "Building a leaf bed", noun: "Bed" },
  build_rack: { now: "Building a drying rack", noun: "Rack" },
  build_site: { now: "Building what you planned", noun: "Build" },
  craft_site: { now: "Making the beds and racks you planned", noun: "Make" },
  deconstruct: { now: "Taking down what you marked", noun: "Take down" },
  dig: { now: "Digging", noun: "Dig" },
  mine: { now: "Digging out the area you marked", noun: "Mine" },
  cut: { now: "Gathering grass", noun: "Gather grass" },
  chop: { now: "Chopping a tree", noun: "Chop" },
  haul: { now: "Hauling loose items to the stockpile", noun: "Haul" },
  store: { now: "Putting down what they carry", noun: "Store" },
  goto: { now: "Walking to the spot you pointed at", noun: "Move" },
  tend_fire: { now: "Feeding the fire", noun: "Tend fire" },
  fire_kiln: { now: "Firing the kiln", noun: "Fire kiln" },
  burn_charcoal: { now: "Burning charcoal", noun: "Burn charcoal" },
  smelt: { now: "Smelting and casting metal", noun: "Smelt" },
  smoke: { now: "Smoking meat on the covered rack", noun: "Smoke meat" },
  make_tool: { now: "Making a tool at the bench", noun: "Make tool" },
  fetch_water: { now: "Fetching water for the jar", noun: "Fetch water" },
  tinker: { now: "Trying things out", noun: "Experiment" },
  cook: { now: "Cooking in the kitchen", noun: "Cook" },
  haul_wagon: { now: "Hauling a long load with a wagon", noun: "Haul by wagon" },
  flee: { now: "Running from danger", noun: "Run away" },
  defend: { now: "Fighting back, cornered", noun: "Fight back" },
  mend: { now: "Resting to heal a wound", noun: "Rest" },
  convalesce: { now: "Resting, sick", noun: "Rest, sick" },
  tend_sick: { now: "Nursing a sick villager", noun: "Nurse" },
  hunt: { now: "Hunting", noun: "Hunt" },
  till: { now: "Breaking ground for a field", noun: "Till" },
  sow: { now: "Sowing seed in the field", noun: "Sow" },
  water_field: { now: "Watering the field", noun: "Water the field" },
  harvest: { now: "Harvesting the field", noun: "Harvest" },
  fence: { now: "Staking out a pen", noun: "Fence the pen" },
  fodder: { now: "Feeding the penned hoppers", noun: "Feed the pen" },
  slaughter: { now: "Slaughtering a penned hopper", noun: "Slaughter" },
  capture: { now: "Catching a hopper alive for the pen", noun: "Capture" },
  strike: { now: "Striking", noun: "Strike" },
};
export const CLASS = {
  need: { label: "Personal need", color: "#ff9a2e" },
  vcrit: { label: "Village critical", color: "#ff5d5d" },
  order: { label: "Your order", color: "#7cc4ff" },
  standing: { label: "Standing order", color: "#c9a2ff" },
  demand: { label: "Village demand", color: "#7fd1a0" },
  leisure: { label: "Free time", color: "#9aa5b4" },
};
export const PART_LABEL = {
  base: "Class base", urg: "Urgency", fit: "Skill fit", prox: "Closeness", path: "Walking cost",
  pref: "Preferred craft", soc: "Company", crew: "Crew task", tmp: "Temperament", sw: "Switch penalty",
};

// ---- skills and genes in plain words (GDD §08, §10) ----
export const SKILL_INFO = {
  dig: { name: "Digging", what: "How fast they take ground and rock out. Grows only from digging fresh, natural ground - re-digging what you placed teaches nothing. Hard rock is slower and only teaches once they are good (difficulty 0.8)." },
  build: { name: "Building", what: "How fast they raise walls, floors and roofs from a plan. Grows from pieces finished, not from time spent." },
  craft: { name: "Crafting", what: "How fast they make beds, racks and dried food (later: pots and tools). Grows from things made." },
};
/** Which skill each job kind uses (for the Why panel's skill-fit note). */
export const JOB_SKILL = { dig: "dig", mine: "dig", build_site: "build", craft_site: "craft", build_bed: "craft", build_rack: "craft", dry: "craft", fire_kiln: "craft", burn_charcoal: "craft", smelt: "craft", make_tool: "craft", smoke: "craft" };
export const TRAIT_INFO = {
  strength: { name: "Strength", what: "Carries more and digs, chops and builds faster. Eats more the stronger it gets." },
  speed: { name: "Speed", what: "Walks and forages faster. Tires a little sooner the quicker it is." },
  stamina: { name: "Stamina", what: "Tires slowly, so it works longer between sleeps. Eats a little more." },
  intelligence: { name: "Intelligence", what: "Learns skills faster and crafts quicker. Needs more sleep the sharper it is." },
  drive: { name: "Drive", what: "Wants to be doing things. Works a touch harder, but its mood sags faster without free time." },
  leisure: { name: "Leisure", what: "Needs more time to itself - wanders more, works less - and is a little keener on children." },
  fertility: { name: "Fertility", what: "Children come sooner and more often." },
  longevity: { name: "Longevity", what: "Matures slower and lives longer. Long-lived lines have fewer children in a life." },
  hardiness: { name: "Hardiness", what: "More health, and warmer in the cold: this is the trait that gets a villager through winter." },
};
/** A trait value as a word, from where it sits in the founders' range (slime-village traitStanding). */
export function traitWord(k, x) {
  const [lo, hi] = FOUNDER_RANGE[k], f = (x - lo) / (hi - lo);
  return f < 0 ? "below any founder" : f > 1 ? "beyond any founder" : f < 0.2 ? "poor" : f < 0.4 ? "below average" : f < 0.6 ? "middling" : f < 0.8 ? "good" : "exceptional";
}
export const skillWord = (l) => (l < 0.15 ? "untrained" : l < 0.4 ? "learning" : l < 0.7 ? "skilled" : l < 0.85 ? "expert" : "master");
export function professionText(v) {
  const p = profession(v);
  if (p === "forager") return "forager";
  const l = Math.max(...Object.keys(SKILL_INFO).map(s => level(v, s)));
  return skillWord(l) + " " + p;
}

export const pct = (x) => Math.round(Math.max(0, Math.min(1, x)) * 100) + "%";
export const itemName = (k) => (ITEMS[k] ? ITEMS[k].label : k);
export const runwayText = (r) => (r >= 99 ? "plenty" : r.toFixed(1) + " days");

export function jobNoun(job, cls) { return (JOB[job] ? JOB[job].noun : job) + (cls === "order" ? " order" : ""); }

/** One sentence for why a candidate was passed over. `chosen` is the job that won (why.job / why.cls). */
export function blockerText(job, blocker, chosen, rej) {
  if (blocker === "NEED_CRITICAL") {
    if (chosen && chosen.cls === "need") {
      const w = { eat: "food", drink: "water", sleep: "sleep", huddle: "warmth", leisure: "rest", convalesce: "rest while sick", mend: "rest" }[chosen.job] || "a survival need";
      return "waiting - " + w + " comes first";
    }
    return "waiting - the village emergency comes first";
  }
  if (blocker === "LOWER_SCORE") {
    return chosen && rej ? "it scored " + rej.score + " against " + chosen.score + " for the job they chose" : BLOCKER_TEXT.LOWER_SCORE;
  }
  const sp = SPECIFIC[blocker] && SPECIFIC[blocker][job];
  return sp ? sp(rej) : BLOCKER_TEXT[blocker] || String(blocker);
}

export const EXP_WHY = { found: "found it", nothing: "found nothing", wounded: "someone is badly hurt", food: "someone is short of food", time: "time ran out", recall: "you called them back", lost: "the crew was lost", "": "" };
const FOOD_JOBS = ["forage", "dry", "build_rack"];
const CRAFT_JOBS = ["fire_kiln", "burn_charcoal", "smelt", "make_tool", "smoke"];
const SHELTER_JOBS = ["build_bed", "cut"];
const FARM_JOBS = ["till", "sow", "water_field", "harvest"];
const PEN_JOBS = ["fence", "fodder", "slaughter"];

/** Why this class of job, in a clause: "village food runs out in 1.4 days (village critical)". */
export function reasonText(sim, v, job, cls) {
  const b = sim.board;
  switch (cls) {
    case "need":
      if (job === "eat") return "hungry (" + pct(v.hunger) + " fed)";
      if (job === "drink") return "thirsty (" + pct(v.thirst) + " watered)";
      if (job === "sleep") return v.energy < 0.4 ? "tired (" + pct(v.energy) + " energy)" : "it is night and time to sleep";
      if (job === "huddle") return "cold (" + pct(v.warm) + " warm) and huddling is the way to warm up";
      if (job === "flee") return "afraid (" + pct(v.fear || 0) + " fear) - above 60% villagers drop everything and run from the thornback; only a guided villager stands";
      if (job === "defend") return "cornered by a beast with nowhere to run, so they fight back";
      if (job === "convalesce") return "sick (" + (v.ill ? "recovering " + pct(v.ill.p) + ", from " + v.ill.c : "recovering") + "), so they lie down: rest is the first help, and a warm bed, cooked food, a nurse or a herbal remedy all speed it";
      if (job === "mend") return "wounded (" + Math.round(v.hp) + " health), so rest comes first and the body mends faster at rest";
      return "spirits are low (" + pct(v.mood) + " mood), so rest comes first";
    case "vcrit":
      if (SHELTER_JOBS.includes(job) || (!FOOD_JOBS.includes(job) && !b.fc && b.sc)) return "the village is short of beds and winter is near (village critical)";
      return "village food runs out in " + runwayText(b.runway) + " (village critical)";
    case "order": {
      if (v.xp) { const x = sim.exp.list.find(q => q.id === v.xp); return x ? "on an expedition to find " + (x.want === x.item ? x.want : "something new (" + x.want + ")") + ", and " + (x.st === "home" ? "heading home (" + EXP_WHY[x.why] + ")" : "digging toward it") : "on an expedition"; }
      const o = v.order;
      return o ? "you ordered " + o.verb + (o.tid ? "" : " around here") + (o.done ? ", " + o.done + " done so far" : "") : "you gave the order";
    }
    case "standing": {
      if (FARM_JOBS.includes(job)) return "you marked a field, and a field is tended as a standing chore (" + sim.ents.ofKind("plot").length + " plots)";
      if (PEN_JOBS.includes(job)) return job === "slaughter" ? "a pen holds more adults than its keep-N, so the surplus is slaughtered" : "you marked a pen, and the pen is kept up as a standing chore";
      if (job === "tend_sick") { const p = sim.ents.get(v.job && v.job.tid); return "someone is ill" + (p ? " (" + p.name + ")" : "") + " and a nurse speeds their recovery, at some risk of catching it"; }
      if (job === "tend_fire") return "the hearth is running low and the cold is here (" + pct(sim.disc.press.warm) + " warm pressure)";
      if (job === "tinker") return "you asked them to investigate";
      if (job === "build_site" || job === "craft_site") return "your building plan has " + sim.ents.ofKind("csite").length + " pieces waiting";
      if (job === "mine") return "you marked " + sim.mine.list.length + " area" + (sim.mine.list.length === 1 ? "" : "s") + " to dig";
      if (v.job && CRAFT_JOBS.includes(v.job.k)) {
        const p = v.job.key.split(":")[1], k = b.keeps.find(q => q.item === p);
        return k ? "standing order: keep " + k.n + " " + itemName(p) + " (have " + haveTotal(sim, p) + ", refilling)" : "something you asked for needs " + itemName(p);
      }
      const k = v.job && v.job.kp ? b.keeps.find(q => q.item === v.job.kp) : null;
      return k ? "standing order: keep " + k.n + " " + itemName(k.item) + " (have " + haveTotal(sim, k.item) + ", refilling)" : "a standing order";
    }
    case "demand":
      if (job === "hunt") return "the village wants more food, and hoppers are game";
      if (FOOD_JOBS.includes(job)) return "the village wants more food";
      if (job === "build_bed") return "the village wants more beds";
      if (job === "build_site" || job === "craft_site") return "a building plan needs hands";
      if (job === "haul" || job === "store") return "loose things belong in the stockpile";
      if (job === "fetch_water") return "a water jar is running low";
      return "the village wants it";
    default:
      if (job === "tinker") return "something is nagging at the village and they have time to try things out";
      return "nothing more pressing to do";
  }
}

/**
 * The Why record, made readable. Returns null for a villager with no plan yet.
 * {headline, because, cls, classLabel, score, parts:[{k,label,value}], rejected:[{label,text,cls}], fail, stale, child}
 */
export function explain(sim, v, next) {
  // `next`: a dry-run plan() record, shown while paused right after a command (the villager has not re-planned yet)
  const j = next ? null : v.job, w = next || v.why;
  const child = !isAdult(sim, v);
  if (!j && !w) return null;
  const jobK = j ? j.k : w.job, cls = j ? j.c : w.cls;
  const stale = !!(j && w && w.job !== j.k);          // plan record not yet refreshed for the running job
  const now = JOB[jobK] ? JOB[jobK].now : jobK;
  const because = reasonText(sim, v, jobK, cls);
  const out = {
    pending: !!next, headline: now, because, cls, classLabel: (CLASS[cls] || CLASS.leisure).label, child, stale,
    sentence: now + " - " + because, score: w && !stale ? w.score : null, parts: [], rejected: [], fail: null,
  };
  if (w && !stale) {
    for (const k of Object.keys(PART_LABEL)) if (w.parts && w.parts[k] !== undefined && (w.parts[k] !== 0 || k === "base")) out.parts.push({ k, label: PART_LABEL[k], value: w.parts[k] });
    for (const r of w.rej || []) out.rejected.push({ label: jobNoun(r.job, r.cls), text: blockerText(r.job, r.blocker, w, r), cls: r.cls, blocker: r.blocker });
  }
  out.notes = [];
  const sk = JOB_SKILL[jobK];
  if (w && !stale && w.parts) {
    if (sk && w.parts.fit) out.notes.push(`${SKILL_INFO[sk].name} skill ${level(v, sk).toFixed(2)} (${skillWord(level(v, sk))}) adds ${w.parts.fit} points: skill fit is 60 x skill level, so a good worker tends to pick this kind of job.`);
    if (!sk && w.parts.fit && (jobK === "forage" || jobK === "cut")) out.notes.push(`Gathering needs no skill, but everyone is a practised forager: it adds ${w.parts.fit} points (a little more for the quick on their feet).`);
    if (w.parts.crew) { const cr = crewOf(sim, v); out.notes.push(`${cr ? cr.name : "Their crew"}'s default task is ${taskText(cr && cr.task)}: jobs of that kind get ${w.parts.crew} points of preference (it never outranks an order or a survival need).`); }
    if (w.parts.soc) {
      const e = w.tid ? sim.ents.get(w.tid) : null, who = [];
      if (e) for (const r of v.rel || []) { const o = sim.ents.get(r.o); if (o && r.k !== "mentor" && o.job && Math.abs(o.x - e.x) <= 4 && Math.abs(o.y - e.y) <= 4) who.push(o.name + " (" + r.k + ")"); }
      out.notes.push(w.parts.soc > 0 ? `Working near ${who.join(", ") || "a friend"} adds ${w.parts.soc} points: friends and partners tend to work side by side.` : `${who.join(", ") || "A rival"} is working near this job, which costs ${-w.parts.soc} points: rivals keep apart.`);
    }
    if (w.parts.pref) out.notes.push(`${SKILL_INFO[sk].name} is their best craft (their preferred one), which adds ${w.parts.pref} points of stickiness.`);
  }
  if (v.lf && !next) out.fail = { job: v.lf[0], text: blockerText(v.lf[0], v.lf[1], null, null), ago: sim.tick - v.lf[2] };
  if (child) out.because += " (too young to take orders or work)";
  else if (v.order && cls !== "order") out.because += "; your " + v.order.verb + " order waits";
  return out;
}

// ---- small descriptions used by tooltips and the inspector ----

export function stageText(sim, v) {
  const a = ageDays(sim, v), st = lifeStage(sim, v);
  return st[0].toUpperCase() + st.slice(1) + ", " + (a / 100).toFixed(1) + " years old";
}

export function bedText(sim, v) {
  const b = v.bed ? sim.ents.get(v.bed) : null;
  return b ? "Sleeps in their own leaf bed" : v.par && v.par.some(p => p) && !isAdult(sim, v) ? "Shares a parent's bed" : "No bed yet - sleeps on the ground";
}

/** Short label of any entity for tooltips. */
export function describe(sim, e) {
  if (!e) return "";
  switch (e.kind) {
    case "villager": return e.name + " - " + stageText(sim, e).toLowerCase();
    case "item": return e.n + " " + itemName(e.item) + (inStock(sim, e) ? " (in the stockpile)" : " (loose - will be hauled in)");
    case "furniture": {
      if (e.f === "door") return "Door - closes a room in, villagers walk through";
      if (e.f === "bed") { const o = e.owner ? sim.ents.get(e.owner) : null; return "Leaf bed - " + (o ? o.name + "'s" : "unclaimed"); }
      if (e.f === "hearth") return e.lit ? "Fire ring - burning (" + LEVEL_NAME[e.hl] + " heat), about " + Math.ceil(e.fuel / 900) + " half-days of fuel left; warms people within " + FIRE_R + " cells" : "Fire ring - cold" + (e.fuel > 0 ? "" : ", out of fuel");
      if (e.f === "torch") return "Torch - lights about " + TORCH_R + " cells round it; work in its light is not slowed and a tunnel is seen as far as it shines";
      if (e.f === "lamp") return "Copper lamp - lights about " + LAMP_R + " cells round it";
      if (e.f === "shelf") return "Shelf - makes a Storage room a better stockpile (food and hides in it spoil slower)";
      if (e.f === "vent") return "Vent shaft - fresh air comes in here: foul air within " + VENT_N + " cells of the open is cleared, and a gas pocket within " + POCKET_N;
      if (e.f === "kiln" || e.f === "mound" || e.f === "workbench" || e.f === "bellows" || e.f === "waterjar" || e.f === "smoker" || e.f === "forge") return stationLine(sim, e);
      return "Drying rack" + (e.rv && sim.ents.get(e.rv) ? " - in use" : "");
    }
    case "plot": return plotLine(e);
    case "wagon": return wagonLine(sim, e);
    case "grave": return "Grave of " + e.name + " - " + e.ins;
    case "flame": return e.src === "tree" ? "A burning tree - " + Math.ceil(e.fuel / 900) + " half-days until it falls in" : "A smouldering stump - hot, and giving off smoke";
    case "fauna": return faunaLine(e);
    case "site": return "Construction site: " + (e.what === "bed" ? "leaf bed" : "drying rack");
    case "csite": {
      const c = costOf(e.w, e.m);
      return "Planned " + (c ? c.label.toLowerCase() : e.w) + " - " + (e.got >= (c ? c.n : 1) ? "materials delivered, waiting to be finished" : e.got ? e.got + " of " + c.n + " " + itemName(c.item) + " delivered" : "needs " + c.n + " " + itemName(c.item));
    }
    case "plant": {
      if (e.species === "tree") return e.burn ? "Tree - burning" : "Tree - can be chopped for logs";
      if (e.species === "stump") return e.burn ? "Tree - alight" : e.fl ? "Stump of a felled tree - it may sprout again, or rot away" : "Charred stump - it will sprout again";
      if (e.species === "sapling") return "Sapling - a tree on the way back";
      if (e.species === "berry") return (e.yield > 0 ? "Berry bush - " + e.yield + " ripe" : "Berry bush - bare") + (e.gr !== undefined && e.gr < 4 ? " (a seedling)" : "");
      if (e.species === "tuber") return e.yield > 0 ? "Tuber plant - dig it for food (" + e.yield + " rations, all year)" : "Tuber plant - dug over, refilling";
      return e.yield > 0 ? "Grass tuft" : "Grass tuft - cut, regrowing";
    }
  }
  return e.kind;
}
export const CROP_STAGE = ["just sprouted", "leafing out", "flowering", "ripe"];
/** A field cell in one line: where it is in raw -> tilled -> sown -> ripe. */
export function plotLine(e) {
  if (!e.tl) return "Field - raw ground, waiting to be tilled";
  if (!e.cr) return "Field - tilled, waiting for seed";
  const st = cropStage(e), c = CROP[e.cr];
  if (st === 3) return "Field - " + c.label + " ripe, " + e.yl + " to harvest";
  return "Field - " + c.label + ", " + CROP_STAGE[st] + " (" + Math.floor(e.gr) + " of " + c.days + " growing days)" + (e.wt > 0 ? "" : ", not watered yet");
}
/** A creature in one line: what it is, its health, what it is up to. */
export function faunaLine(e) {
  const row = FAUNA[e.sp], hp = Math.max(0, Math.round(e.hp)) + "/" + e.mhp + " health";
  if (e.sp === "hopper" && e.tame) return "Penned hopper - " + hp + ". Fed grass, it breeds; the surplus adults are slaughtered over the pen's keep-N.";
  if (e.sp === "hopper") return "Hopper - small game; bolts when anyone gets close. Right-click with villagers selected to hunt it. " + hp;
  if (e.sp === "wolf") return "Wolf - " + ({ attack: "biting someone", hunt: "stalking prey", flee: "running from a crowd or a fire", rest: "keeping its distance", patrol: "ranging its ground" }[e.st] || "waiting") + ". It runs with a pack: it takes hoppers by day and, on a winter night, anyone it finds alone. It will not come near a group or a fire. " + hp;
  if (e.sp === "grazer" && e.tame) return "Penned grazer - " + hp + ". It eats as much as three hoppers; the pen's keep-N decides how many adults stay.";
  if (e.sp === "grazer") return "Grazer - " + ({ turn: "turned on someone", flee: "ambling off", idle: "grazing" }[e.st] || "grazing") + ". Big game: about " + row.meat + " meat, " + row.hide + " hides and " + row.bone + " bone. Slow, but it turns on whoever strikes it or crowds it: hunt it in a group, with spears. " + hp;
  const doing = { attack: "mauling someone", hunt: "after prey", retreat: "hurt and limping home", return: "heading home", patrol: "patrolling its ground", idle: "resting" }[e.st] || e.st;
  return "Thornback - " + doing + ". It mauls anything that walks into its territory (about half a villager's health a bite); villagers will not go near it. " + hp;
}
const FUEL_WORD = { stick: "sticks and logs", log: "logs", charcoal: "charcoal", coal: "coal" };
const STATION_NAME = { kiln: "Clay-lined pit kiln", mound: "Charcoal mound", smoker: "Covered rack", forge: "Brick forge" };
/**
 * The station inspector (kiln, mound): heat by fuel, what is in it, and for every recipe it serves whether it can run and, if not, WHY not
 * ("needs draft: a bellows beside it or an open flue on a ridge"). Pure; null for other furniture.
 * -> {name, state, contents, heat:[{fuel, fuelWord, level, levelName, P, layout, steps}], recipes:[{key, label, ok, why}]}
 */
export function stationInfo(sim, e) {
  if (!STATION_NAME[e.f]) return null;
  const held = Object.keys(e.inv || {}).map(k => e.inv[k] + " " + itemName(k)).join(", ");
  const burning = e.bn > 0, rc = e.rcp ? RECIPES[e.rcp] : null;
  const state = burning ? "burning: " + (rc ? rc.label : "a batch") + ", " + LEVEL_NAME[e.lv] + " heat, " + (e.bn / 1800).toFixed(1) + " days to go" : held ? "loaded with " + held + (rc ? " for " + rc.label : "") : "empty and cold";
  const fuels = e.f === "mound" ? ["log"] : e.f === "smoker" ? [] : e.f === "forge" ? ["charcoal", "coal"] : ["stick", "charcoal"];
  const need = {};
  for (const k of Object.keys(RECIPES)) if (RECIPES[k].station === e.f && RECIPES[k].fuel) need[RECIPES[k].fuel] = Math.max(need[RECIPES[k].fuel] || 0, RECIPES[k].need);
  const heat = fuels.map(f => {
    const r0 = heatReport(sim, e, f, 0), short = (need[f] || 0) > r0.level;
    const r = short ? heatReport(sim, e, f, need[f]) : r0;                    // advice only when a recipe needs more than this fuel gives
    return { fuel: f, fuelWord: FUEL_WORD[f], level: r.level, levelName: r.name, P: r.P, layout: r.layout, steps: short ? r.steps : [] };
  });
  const recipes = [];
  for (const k of Object.keys(RECIPES)) {
    const r = RECIPES[k];
    if (r.station !== e.f) continue;
    const row = { key: k, label: r.label, ok: true, why: "" }, parts = [];
    const lv = heat.find(h => h.fuel === r.fuel);
    if (!can(sim, r.craft)) parts.push("nobody knows " + CRAFTS[r.craft].short + " yet");
    if (r.fire && smokeFire(sim, e) < r.need) parts.push("no lit fire within " + SMOKE_R + " cells: the smoke comes from a hearth beside it");
    if (lv && (lv.level < r.need || (r.max !== undefined && lv.level > r.max))) parts.push("it needs " + LEVEL_NAME[r.need] + " heat with " + lv.fuelWord + " and has " + lv.levelName + (lv.steps.length ? ": " + lv.steps[0] : ""));
    if (parts.length) { row.ok = false; row.why = parts.join("; "); }
    recipes.push(row);
  }
  return { name: STATION_NAME[e.f], state, contents: held, heat, recipes, forge: e.f === "forge", note: e.f === "forge" ? "Heat 5 (the Forge level) needs coal, and two draft sources: the flue is one, add a bellows beside the forge or build it on the windy ridge. Charcoal tops out at the Furnace level (4) even here." : "" };
}

/** One line for a station: what it is and what it is doing (the inspector has the rest). */
export function stationLine(sim, e) {
  if (e.f === "bellows") return "Bellows - a draft source: a kiln beside it burns hotter";
  if (e.f === "waterjar") return "Water jar - " + e.fill + " sips of water" + (e.fill >= 6 ? ", villagers drink here when it is nearer than the stream" : ", empty: a chore will fill it");
  const held = Object.keys(e.inv || {}).map(k => e.inv[k] + " " + itemName(k)).join(", ");
  if (e.f === "workbench") return "Workbench" + (held ? " - holds " + held : " - for making tools");
  const name = STATION_NAME[e.f];
  if (e.bn > 0) return name + " - burning (" + LEVEL_NAME[e.lv] + " heat), about " + Math.ceil(e.bn / 900) + " half-day" + (e.bn > 900 ? "s" : "") + " to go";
  return name + (held ? " - loaded with " + held : " - empty");
}
function inStock(sim, e) { const z = sim.stock; return e.x >= z.x0 && e.x <= z.x1 && e.y >= z.y0 && e.y <= z.y1; }

const STUCK = ["NO_PATH", "BUDGET", "BLOCKED", "NO_STORAGE", "NO_SITE", "NO_WATER"];
/** Alert badges for the notables strip. [{k, ch, title, color}] */
export function alerts(sim, v) {
  const out = [];
  if (v.hunger < 0.3) out.push({ k: "hungry", ch: "H", title: "Hungry", color: "#ff9a2e" });
  if (v.thirst < 0.3) out.push({ k: "thirsty", ch: "W", title: "Thirsty", color: "#4aa8ff" });
  if (v.warm < 0.35) out.push({ k: "cold", ch: "C", title: "Cold", color: "#bdf3ff" });
  if (v.energy < 0.15) out.push({ k: "tired", ch: "Z", title: "Exhausted", color: "#8f8cff" });
  if (v.ill) out.push({ k: "sick", ch: "S", title: "Sick: " + Math.round(100 * v.ill.p) + "% recovered, from " + v.ill.c, color: "#a6d94a" });
  if (v.hp < 0.5 * maxHp(v, fitness(v, ageDays(sim, v)))) out.push({ k: "hurt", ch: "+", title: "Hurt", color: "#ff5d5d" });
  const w = v.why;
  if (isAdult(sim, v) && w && w.cls === "leisure" && w.rej.some(r => STUCK.includes(r.blocker))) {
    const r = w.rej.find(q => STUCK.includes(q.blocker));
    out.push({ k: "stuck", ch: "!", title: "Has work it cannot do: " + jobNoun(r.job, r.cls) + " - " + blockerText(r.job, r.blocker), color: "#ffd166" });
  }
  if (v.order) out.push({ k: "ordered", ch: ">", title: "Following your " + v.order.verb + " order", color: "#7cc4ff" });
  return out;
}

/** Village-level warnings with their explanations: [{title, text, level}] */
export function warnings(sim) {
  const b = sim.board, out = [], s = survey(sim);
  const wa = winterAhead(sim.tick), crit = CRIT_BASE + CRIT_WINTER * wa;
  if (b.fc) out.push({ level: 2, title: "FOOD LOW", text: "Only " + runwayText(b.runway) + " of food per head; the village treats it as critical below " + crit.toFixed(1) + " days, so everyone able drops other work to forage and dry berries." });
  else if (wa > 0 && b.runway < crit * 1.6) out.push({ level: 1, title: "Food is getting tight", text: "Winter is coming: " + runwayText(b.runway) + " banked, " + crit.toFixed(1) + " needed to count as safe." });
  if (b.sc) out.push({ level: 2, title: "NEEDS SHELTER", text: (b.sneed || "Some") + " villager(s) have no leaf bed and it is (or will soon be) cold. They will build beds from grass: " + s.stock.grass + " in stock, " + BED_COST.n + " per bed." });
  const hp = huntingPressure(sim);
  if (sim.tick > 3 * DAY && hp.gone) out.push({ level: 2, title: "NO HOPPERS LEFT", text: "The wild hoppers are all gone (the meadow carries about " + hp.cap + "). They come back slowly from the edges; stop hunting, or keep a pen." });
  else if (sim.tick > 3 * DAY && hp.low) out.push({ level: 1, title: "Hoppers are getting scarce", text: hp.n + " left in the wild against about " + hp.cap + " the meadow carries. Hunting less lets the herd regrow; a pen breeds them." });
  const rot = rottingSoon(sim);
  if (rot.units >= 4) out.push({ level: 1, title: "Food is rotting", text: rot.units + " units of fresh food (" + rot.what + ") will spoil before they are eaten. Dry or smoke it, keep it in clay jars or a cold cellar, or forage less." });
  return out;
}

/** Food that spoils faster than the village eats it: fresh food in the stores beyond two days of eating, after jars and the cellar. {units, what} */
export function rottingSoon(sim) {
  const sv = survey(sim), vl = village(sim), by = {};
  let units = 0;
  const need = Math.max(1, vl.need) * 2;
  let eat = need;
  for (const k of ["hopper_meat", "berry", "tuber"]) {                           // eaten fastest-spoiling first (tasks.js foodSource)
    const have = sv.stock[k], f = ITEMS[k].food, rate = winterRate(sim, k);
    const eaten = Math.min(have, eat / f); eat -= eaten * f;
    const spare = have - eaten;
    if (rate >= 0.04 && spare >= 1) { const ju = Math.max(0, spare - sv.stock.jar * JAR_HOLD); if (ju >= 1) { by[k] = Math.floor(ju); units += Math.floor(ju); } }
  }
  return { units, what: Object.keys(by).map(k => by[k] + " " + itemName(k)).join(", ") };
}
const winterRate = (sim, k) => (seasonIdx(sim.tick) === 3 ? ITEMS[k].spoilW : ITEMS[k].spoil);

// ---- cells (S6): what the player sees when they click the ground ----
const CELL_BLURB = {
  [M.GRASS]: "Grass over soil. Digs fast.", [M.DIRT]: "Soil. Digs fast; the soft rock lies under it.", [M.SAND]: "Sand.",
  [M.CLAY]: "Clay from a stream bank: pottery and kilns start here.", [M.SOFT]: "Soft rock: sandstone and limestone. It digs with stone tools and holds the flint and the green stain.",
  [M.FLINT]: "A flint nodule in the soft rock: knapped into edges.", [M.MALACHITE]: "Malachite, the green stain that gives copper when smelted. A vein follows it down.",
  [M.STONE]: "Hard rock. Slower to dig, and it only teaches the skilled.", [M.WATER]: "Water.",
  [M.SALT]: "A salt lick: white crust that animals come to. Dug out it keeps meat.", [M.PEAT]: "Peat: dark wet marsh turf. Dug and dried it burns like wood, but never as hot as charcoal.", [M.HERB]: "A bed of bitter marsh herb. The sick are said to do better near it.",
  [M.IRONORE]: "Iron ore: heavy rust-red rock in the hard rock band. It takes coal and a forge to get anything out of it.", [M.COAL]: "A coal seam: black stone that burns hotter than charcoal. The Forge level needs it.",
  [M.DEEP]: "Deep rock: the bottom of the hard rock. Only an iron pick will dig it.",
  [M.HIDEWALL]: "A hide wall: skin stretched on poles. Cheap and warm enough for a teepee.", [M.HIDEROOF]: "A hide roof.", [M.DRESSED]: "A dressed-stone wall: squared blocks, tight and warm.",
  [M.SUPPORT]: "A timber support: a post and cap. A roof is held up by anything solid within 2 cells, so a post in the middle of a wide room stops it falling in.", [M.RUBBLE]: "Rubble from a fallen roof. It digs out quickly and gives stone, and it holds up what is left.",
  [M.TIMBERWALL]: "A timber wall: a framed cabin wall.", [M.PLANKFLOOR]: "A plank floor.", [M.BRICKWALL]: "A brick wall: the warmest wall there is, and it holds heat for a furnace.",
};
/** The card for a clicked cell: {title, lines:[string]}. Cells nobody has seen are "unknown rock". */
export function cellInfo(sim, x, y, z) {
  const w = sim.world, m = w.mat(x, y, z), lines = [];
  if (!isSeen(sim, x, y, z)) return { title: "Unknown", lines: ["Nobody has seen this cell yet. Rock below the surface is only known once a villager has stood next to it."] };
  const name = MAT[m].name[0].toUpperCase() + MAT[m].name.slice(1);
  if (CELL_BLURB[m]) lines.push(CELL_BLURB[m]);
  const bi = biomeAt(sim.world, x, y);
  if (bi) lines.push(BIOMES[bi].name + ": " + BIOMES[bi].note);                       // S12: the biome shows on the cell card (the meadow is the plain default)
  const open = m === M.AIR ? z : w.mat(x, y, z + 1) === M.AIR ? z + 1 : -1;            // S12: hazards of the open cell on or over this one
  if (open >= 0) for (const t of hazardLines(sim, x, y, open)) lines.push(t);
  const d = DIG[m];
  if (d) lines.push("Digging it gives " + d.n + " " + itemName(d.item) + (d.hard ? " (hard rock, difficulty 0.8)" : "") + ".");
  if (m !== M.AIR && w.flags(x, y, z) & F.RIDGE) lines.push("A windy ridge: a draft furnace would draw well here.");
  const mk = marked(sim, x, y, z);
  if (mk) lines.push("Marked for digging (" + ({ region: "dig region", depth: "stair down", vein: "follow vein", seek: "seek " + mk.item })[mk.kind] + ").");
  lines.push("Level " + z + (isOre(m) ? ", ore" : ""));
  return { title: name, lines };
}

/** S15: the one-line description of a wagon or cart: who is pushing it, what pulls it, how it is doing. */
export function wagonLine(sim, e) {
  const row = WAGON[e.t], who = e.dr ? sim.ents.get(e.dr) : null;
  let t = row.label + " - carries " + row.cap + " load units (a pair of hands about " + 6 + ")";
  if (e.t === "cart") { const a = cartAnimal(sim, e, false); t += a ? ", pulled by a penned grazer" + (wagonReady(sim, e) ? " that is not fed (its pen has no fodder)" : "") : ", but there is no penned grazer to pull it"; }
  return t + (who ? "; " + who.name + " is hauling with it" : "; standing free") + (e.tr ? " (" + e.tr + " trips)" : "");
}
