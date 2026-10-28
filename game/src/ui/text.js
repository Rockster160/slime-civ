// Plain-language text for the player (GDD §22): what a villager is doing, why,
// what it could not do and why not. Pure functions of sim state - no DOM - so
// tests/ui_text.js can check coverage headlessly.
import { ITEMS, haveTotal, survey } from "../sim/items.js";
import { BED_COST, RACK_COST, CRIT_BASE, CRIT_WINTER } from "../sim/board.js";
import { winterAhead } from "../sim/season.js";
import { costOf } from "../sim/build.js";
import { ageDays, lifeStage, maxHp, fitness, isAdult } from "../sim/villager.js";

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
};

/** Job-specific refinements: what exactly is missing. Falls back to BLOCKER_TEXT. */
const SPECIFIC = {
  NO_MATERIAL: {
    build_site: (r) => {
      const it = r && r.item;
      if (it === "stone" || it === "dirt") return "no " + it + " in the stockpile - order villagers to dig for it";
      return it ? "not enough " + itemName(it) + " in the stockpile for the next piece" : "the materials are not there";
    },
    dig: () => "nothing here can be dug",
    build_bed: () => "no grass in stock (a bed takes " + BED_COST.n + ")",
    build_rack: () => "not enough sticks in stock (a rack takes " + RACK_COST.n + ")",
    dry: () => "fewer than 5 berries in stock",
    forage: () => "no ripe berries within reach",
    chop: () => "no free trees nearby",
    cut: () => "no grass tufts left nearby",
    haul: () => "nothing loose to haul",
  },
  NO_CAPACITY: {
    build_site: () => "their hands hold something else",
    forage: () => "their hands are full of something else",
    chop: () => "their hands are full",
    build_bed: () => "their hands hold the wrong thing",
  },
  RESERVED: {
    build_site: () => "every buildable piece already has someone on it",
    forage: () => "the nearby bushes are already taken",
    chop: () => "the nearby trees are already taken",
    cut: () => "the nearby tufts are already taken",
    build_rack: () => "someone is already building the rack",
  },
  NO_PATH: { dig: () => "no way to stand next to the rock", build_site: () => "no way to reach the building site" },
  MAX_WORKERS: { build_site: () => "most of the village is already building (the cap is 70%)" },
  NO_SEASON: { forage: () => "berries do not grow in winter (roots can still be dug)", dry: () => "berries do not grow in winter" },
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
  deconstruct: { now: "Taking down what you marked", noun: "Take down" },
  dig: { now: "Digging", noun: "Dig" },
  cut: { now: "Gathering grass", noun: "Gather grass" },
  chop: { now: "Chopping a tree", noun: "Chop" },
  haul: { now: "Hauling loose items to the stockpile", noun: "Haul" },
  store: { now: "Putting down what they carry", noun: "Store" },
  goto: { now: "Walking to the spot you pointed at", noun: "Move" },
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
  pref: "Preferred craft", tmp: "Temperament", sw: "Switch penalty",
};

export const pct = (x) => Math.round(Math.max(0, Math.min(1, x)) * 100) + "%";
export const itemName = (k) => (ITEMS[k] ? ITEMS[k].label : k);
export const runwayText = (r) => (r >= 99 ? "plenty" : r.toFixed(1) + " days");

export function jobNoun(job, cls) { return (JOB[job] ? JOB[job].noun : job) + (cls === "order" ? " order" : ""); }

/** One sentence for why a candidate was passed over. `chosen` is the job that won (why.job / why.cls). */
export function blockerText(job, blocker, chosen, rej) {
  if (blocker === "NEED_CRITICAL") {
    if (chosen && chosen.cls === "need") {
      const w = { eat: "food", drink: "water", sleep: "sleep", huddle: "warmth", leisure: "rest" }[chosen.job] || "a survival need";
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

const FOOD_JOBS = ["forage", "dry", "build_rack"];
const SHELTER_JOBS = ["build_bed", "cut"];

/** Why this class of job, in a clause: "village food runs out in 1.4 days (village critical)". */
export function reasonText(sim, v, job, cls) {
  const b = sim.board;
  switch (cls) {
    case "need":
      if (job === "eat") return "hungry (" + pct(v.hunger) + " fed)";
      if (job === "drink") return "thirsty (" + pct(v.thirst) + " watered)";
      if (job === "sleep") return v.energy < 0.4 ? "tired (" + pct(v.energy) + " energy)" : "it is night and time to sleep";
      if (job === "huddle") return "cold (" + pct(v.warm) + " warm) and huddling is the way to warm up";
      return "spirits are low (" + pct(v.mood) + " mood), so rest comes first";
    case "vcrit":
      if (SHELTER_JOBS.includes(job) || (!FOOD_JOBS.includes(job) && !b.fc && b.sc)) return "the village is short of beds and winter is near (village critical)";
      return "village food runs out in " + runwayText(b.runway) + " (village critical)";
    case "order": {
      const o = v.order;
      return o ? "you ordered " + o.verb + (o.tid ? "" : " around here") + (o.done ? ", " + o.done + " done so far" : "") : "you gave the order";
    }
    case "standing": {
      if (job === "build_site") return "your building plan has " + sim.ents.ofKind("csite").length + " pieces waiting";
      const k = v.job && v.job.kp ? b.keeps.find(q => q.item === v.job.kp) : null;
      return k ? "standing order: keep " + k.n + " " + itemName(k.item) + " (have " + haveTotal(sim, k.item) + ", refilling)" : "a standing order";
    }
    case "demand":
      if (FOOD_JOBS.includes(job)) return "the village wants more food";
      if (job === "build_bed") return "the village wants more beds";
      if (job === "build_site") return "a building plan needs hands";
      if (job === "haul" || job === "store") return "loose things belong in the stockpile";
      return "the village wants it";
    default:
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
      return "Drying rack" + (e.rv && sim.ents.get(e.rv) ? " - in use" : "");
    }
    case "site": return "Construction site: " + (e.what === "bed" ? "leaf bed" : "drying rack");
    case "csite": {
      const c = costOf(e.w, e.m);
      return "Planned " + (c ? c.label.toLowerCase() : e.w) + " - " + (e.got >= (c ? c.n : 1) ? "materials delivered, waiting to be finished" : e.got ? e.got + " of " + c.n + " " + itemName(c.item) + " delivered" : "needs " + c.n + " " + itemName(c.item));
    }
    case "plant": {
      if (e.species === "tree") return "Tree - can be chopped for logs";
      if (e.species === "sapling") return "Sapling - a tree on the way back";
      if (e.species === "berry") return e.yield > 0 ? "Berry bush - " + e.yield + " ripe" : "Berry bush - bare";
      return e.yield > 0 ? "Grass tuft" : "Grass tuft - cut, regrowing";
    }
  }
  return e.kind;
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
  return out;
}
