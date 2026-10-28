// What the village knows (GDD §10 "Familiarity", §15.2, §15.8). One layer: each villager holds a familiarity 0..1 per craft
// (v.fam = {CRAFT: f}). A craft is KNOWN while a living villager has f > 0; there is no village flag and no grace timer, so when
// the last holder dies the capability is simply gone and the Almanac says so. Skill XP (skills.js) is a separate number: it sets
// quality and speed, never whether anyone may attempt.
//
// sim.disc (saved + hashed) is the village-level discovery state:
//   seen   {phenomenonId: tick}     the village has watched it happen (Almanac, gating who may tinker)
//   dead   [{k, item, st, verb, lvl, n, t}]   dead ends: a combination tried at station heat `lvl` that did nothing
//   miss   {phenomenonId: n}        attempts that matched on inputs but fell short on context (near-miss hint after 3)
//   curio  [{id, row, t, x,y,z, text}]  Curiosities: things seen and not understood
//   lost   {craft: tick}            crafts whose last holder died (and not since regained)
//   sole   {craft: villagerId}      the single remaining holder (warned once)
//   press  {tag: 0..1}              pressure tags (EMA of the demand vector); streak {eventId: days over threshold}
//   ev     {eventId: {cd}}          systemic-event cooldowns;  last = the latest event {id,t,x,y,z}
//   wd     {"row:site:vid": tick}   witness dedup (one roll per phenomenon, site and witness per 450 ticks)
//   cd     {stationKey: tick}       one experiment per station per day
//   ask    {until, ids:[..], item?} the player's "Investigate" request (makes tinker a standing-class job)
//   trace  [..]                     the last TRACE_MAX witness / tinker / event rolls with their factors (debug panel)
//   ex     {"clay:hearthId": ticks}  how long wet clay has lain by a lit fire (S7b witness route to pottery)
//   dg / hd / worn   digs today (reset daily) / hard rock ever dug / copper picks worn out: the tool_edge pressure's inputs (S7b)
//   era    the era label now shown;  tk = cached tinker candidate list
//   bpp    {designKey: tick}  shelter designs already offered as blueprints (shelter.js)
//   eras   {label: tick}  when each era's signature was first held, in the order the village reached them (S9: the Almanac's era flow; read lazily)
import { YEAR, LANDING } from "./clock.js";
import { clamp, r3 } from "./util.js";
import { log, once } from "./chronicle.js";
import { award, firstTitle } from "./titles.js";
import { CRAFTS, CRAFT_IDS, ERA_RANK, PHENOMENA, PRESSURE_TAGS } from "./phenomena.js";
import { coldAhead, winterAhead, dayF } from "./season.js";
import { haveTotal } from "./items.js";

export const DISCOVER_FAM = 0.5;        // the discoverer (D8, §10)
export const WITNESS_FAM = 0.2;         // a witness who saw it happen
export const WATCH_RATE = 0.025;        // per 100 ticks in sight of a practitioner, x aptitude x (1 - f) (§10)
export const WATCH_R = 4;               // cells
export const TEACH_X = 3;               // Teach is 3x watching
export const KIN_X = 2;                 // a child learning from a parent
export const USE_NUDGE = 0.02;          // using a craft nudges familiarity toward 1
export const TRACE_MAX = 40;
export const EVIDENCE_X = 8;            // a tinker near evidence of a craft nobody knows weights the matching try this much higher (about 0.3x the expected tries, gate 0.4x, D8)
export const LOW_FAM = 0.3;             // below this a craft adds waste on top of skill (§10)

export function newDisc() {
  return { seen: {}, dead: [], miss: {}, curio: [], lost: {}, sole: {}, press: { warm: 0, keep_food: 0, carry_water: 0, tool_edge: 0 }, streak: {},
    ev: {}, last: null, wd: {}, cd: {}, ask: null, trace: [], era: "", tk: null, nt: 0, ex: {}, dg: 0, hd: 0, worn: 0, eras: {}, bpp: {} };
}

export const famOf = (v, craft) => (v.fam && v.fam[craft]) || 0;

/** Living villagers with familiarity > 0, in id order. */
export function holders(sim, craft) {
  const out = [];
  for (const v of sim.ents.ofKind("villager")) if (famOf(v, craft) > 0) out.push(v);
  return out;
}
/** Capability query (R10): is there at least one living knower? Checked when a job is chosen. Cached per tick. */
export function can(sim, craft) {
  const c = sim.cache;
  if (c.knT !== sim.tick || !c.kn) { c.kn = {}; c.knT = sim.tick; }
  if (c.kn[craft] === undefined) c.kn[craft] = holders(sim, craft).length > 0;
  return c.kn[craft];
}
/** Aptitude for learning (§10): intelligence 0.8..1.2 -> 0.5..1.0. */
export function aptOf(v) { return 0.5 + 0.5 * clamp((v.t.intelligence - 0.8) / 0.4, 0, 1); }

/** A strength word from familiarity (§15.6). */
export function famWord(f) { return f >= 0.75 ? "sure" : f >= 0.45 ? "fairly sure" : "half-remembered"; }

// ---- eras ---------------------------------------------------------------------------------------------------------------

/** The highest-ranked era whose signature craft has a living holder ("" = none). */
export function eraOf(sim) {
  let best = "", rank = 0;
  for (const label of erasHeld(sim)) if (ERA_RANK[label] > rank) { rank = ERA_RANK[label]; best = label; }
  return best;
}
/** Every era whose signature is held by a living knower now (a signature may need a second craft: the Iron age wants iron smelted AND welded). */
export function erasHeld(sim) {
  const out = [];
  for (const id of CRAFT_IDS) {
    const C = CRAFTS[id];
    if (C.era && can(sim, id) && (!C.also || C.also.every(c => can(sim, c)))) out.push(C.era);
  }
  return out;
}
/** Log the era label when it changes (also when it regresses: a loss is a story, not a penalty, §10). */
export function updateEra(sim) {
  const now = eraOf(sim), d = sim.disc;
  if (!d.eras) d.eras = {};
  for (const label of erasHeld(sim)) {                                    // S9: every era is chronicled the first time it is reached, in the order the village found them (a lower one reached late is a "hole" filled)
    if (d.eras[label] !== undefined) continue;
    d.eras[label] = sim.tick;
    if (label !== now) log(sim, "DISCOVERY", "The " + label + " age dawns, behind the " + now + " age.", [], { era: label }, 2);
  }
  if (now === d.era) return;
  if (now && ERA_RANK[now] > (d.era ? ERA_RANK[d.era] : 0)) log(sim, "DISCOVERY", "The " + now + " age begins.", [], { era: now }, 2);
  else if (!now) log(sim, "LOSS", "The village has slipped out of the " + d.era + " age: nobody remembers its craft.", [], { era: "" }, 2);
  else log(sim, "LOSS", "The village has slipped back from the " + d.era + " age to the " + now + " age.", [], { era: now }, 2);
  d.era = now;
}

// ---- gaining and losing -----------------------------------------------------------------------------------------------

/**
 * Raise v's familiarity with a craft to at least f (never lowers). `how` = {kind: "discover"|"witness"|"watch"|"teach"|"grant", row?}.
 * The first time anyone ever learns a craft is a chronicle "first"; learning it again after a loss is a rediscovery.
 */
export function setFam(sim, v, craft, f, how) {
  f = r3(Math.min(1, f));
  const old = famOf(v, craft);
  if (f <= old) return false;
  if (!v.fam) v.fam = {};
  v.fam[craft] = f;
  sim.cache.kn = null;
  if (old > 0) return true;
  const d = sim.disc, C = CRAFTS[craft], row = how && how.row ? PHENOMENA[how.row] : null;
  const wasLost = d.lost[craft] !== undefined;
  if (wasLost) delete d.lost[craft];
  for (let i = d.curio.length - 1; i >= 0; i--) if (d.curio[i].craft === craft) d.curio.splice(i, 1);     // understood now
  if (how && (how.kind === "discover" || how.kind === "witness")) {
    const base = row ? row.first(v.name) : v.name + " learned " + C.short + ".";
    const via = how.kind === "witness" ? " They watched it happen." : " They worked it out with their own hands.";
    if (wasLost) log(sim, "DISCOVERY", v.name + " rediscovered " + C.short + "." + via, [v.id], { craft, how: how.kind }, 2);
    else if (once(sim, "first_" + craft, "DISCOVERY", base + via, [v.id], { craft, how: how.kind }, 2)) award(sim, v, firstTitle(craft, C.short), false);     // S13: a title for the first
  } else if (wasLost) log(sim, "DISCOVERY", v.name + " relearned " + C.short + ".", [v.id], { craft }, 1);
  const hs = holders(sim, craft);
  if (d.sole[craft] && hs.length > 1) delete d.sole[craft];
  updateEra(sim);
  return true;
}

/** Called by population.kill after the villager is gone: the last holder's death loses the capability (R11). */
export function afterDeath(sim, v) {
  sim.cache.kn = null;
  const d = sim.disc;
  for (const craft of CRAFT_IDS) {
    if (!famOf(v, craft)) continue;
    const hs = holders(sim, craft), C = CRAFTS[craft];
    if (hs.length === 0) {
      d.lost[craft] = sim.tick; delete d.sole[craft];
      log(sim, "LOSS", "The last person who knew " + C.short + " has died: " + v.name + ". " + (evidenceOf(sim, craft) > 0 ? "What they built is still here to learn from." : "It will have to be found again."), [], { craft }, 2);
    } else if (hs.length === 1 && d.sole[craft] !== hs[0].id) {
      d.sole[craft] = hs[0].id;
      log(sim, "LOSS", "Only " + hs[0].name + " knows " + C.short + " now.", [hs[0].id], { craft }, 1);
    }
  }
  updateEra(sim);
}

/**
 * How much physical evidence of a craft stands in the village (R11): built stations of its kind and stored products.
 * 0 = none, up to 1. Evidence makes a tinker job rediscover it at a large discount.
 */
export function evidenceOf(sim, craft) {
  const ev = CRAFTS[craft].evidence;
  let n = 0;
  for (const f of sim.ents.ofKind("furniture")) if (ev.furniture.includes(f.f)) n++;
  if (ev.items.length) for (const s of sim.ents.ofKind("item")) if (ev.items.includes(s.item)) n++;
  return n === 0 ? 0 : Math.min(1, 0.6 + 0.2 * (n - 1));
}
/** Evidence stands where? (cells, for the tinker to work next to). */
export function evidenceSites(sim, craft) {
  const ev = CRAFTS[craft].evidence, out = [];
  for (const f of sim.ents.ofKind("furniture")) if (ev.furniture.includes(f.f)) out.push(f);
  return out;
}

// ---- pressure ---------------------------------------------------------------------------------------------------------

/** Pressure of a tag, 0..1 (the demand vector, smoothed, §15.4). */
export function pressure(sim, tag) { return sim.disc.press[tag] || 0; }

/**
 * Raw warm pressure at a tick (pure: tests/events.js drives it over a year without a sim). How cold the season looks or feels, 0..1.
 * The first spring and summer are a grace period: the settlers arrive with the warm months ahead, so a cool morning in week one is not
 * "pressure" (it would arm the lightning event before the first autumn). From day 50 of the first year, and always after it, the cold counts.
 */
export function warmRaw(tick, coldShare) {
  const grace = dayF(tick) < 50 && tick + LANDING < YEAR;
  return grace ? 0 : clamp(Math.max(coldAhead(tick), 0.5 * winterAhead(tick), coldShare), 0, 1);
}
/** tool_edge, 0..1 (pure): stone is wearing out on hard work (digs today), green stone is in the stockpile (nobody can use it yet), hard rock has been met. */
export function toolEdgeRaw(digsToday, sawOre, hardDug) {
  return clamp(0.4 * Math.min(1, digsToday / 10) + (sawOre ? 0.35 : 0) + (hardDug ? 0.2 : 0), 0, 1);
}
/** carry_water, 0..1 (pure): the share of the village thirsty right now, doubled (long walks to the stream show up as thirst). */
export function carryWaterRaw(thirsty, n) { return n ? clamp(2 * thirsty / n, 0, 1) : 0; }

/** The raw (unsmoothed) pressure of each tag now. */
export function rawPressure(sim) {
  const vs = sim.ents.ofKind("villager"), d = sim.disc;
  let cold = 0, dry = 0;
  for (const v of vs) { if (v.warm < 0.6) cold++; if (v.thirst < 0.4) dry++; }
  const sawOre = haveTotal(sim, "malachite") > 0 || haveTotal(sim, "iron_ore") > 0;                                  // green stone in hand that the stone tools cannot use
  return {
    warm: warmRaw(sim.tick, vs.length ? cold / vs.length : 0),
    keep_food: clamp(sim.board.dem.food, 0, 1),
    carry_water: carryWaterRaw(dry, vs.length),
    tool_edge: toolEdgeRaw(d.dg || 0, sawOre, !!d.hd),
  };
}
/** EMA step used once a day (half-day weight). */
export function emaStep(old, raw) { return r3(0.5 * old + 0.5 * raw); }
/** Once a day: pressure tags are an EMA with a half-day weight, rounded so saves stay short. */
export function updatePressure(sim) {
  const raw = rawPressure(sim), p = sim.disc.press;
  for (const tag of PRESSURE_TAGS) p[tag] = emaStep(p[tag] || 0, raw[tag]);
  sim.disc.dg = 0;                                                                      // digs are counted per day
}

// ---- spreading: watching and Teach ------------------------------------------------------------------------------------

/** Job kind -> the craft it practises (watchers learn from it). S7b: add kiln, burn_charcoal, smelt here. */
export const CRAFT_OF_JOB = { tend_fire: "FIRE_TENDING", fire_kiln: "POTTERY", burn_charcoal: "CHARCOAL", smelt: "SMELTING", make_tool: "SMELTING", smoke: "SMOKING" };
/** The craft a villager's current job practises (S9: a recipe names its own craft; the job kind is the fallback). */
export function craftOfJob(p) {
  const st = p.action && p.action.steps ? p.action.steps[p.action.si] : null;
  if (st && st.cr) return st.cr;                                  // the loading / lighting / making steps of a recipe name its craft
  return CRAFT_OF_JOB[p.job.k] || null;
}

const near = (a, b, r) => Math.abs(a.x - b.x) <= r && Math.abs(a.y - b.y) <= r && Math.abs(a.z - b.z) <= 1;

/**
 * Every 100 ticks: (1) a learner within WATCH_R of a practitioner at work gains 0.025 x aptitude x (1 - f) (x2 for a child beside
 * a parent), one target per learner; (2) a villager being taught (the Teach command, within 3 cells of the teacher) gains 3x that
 * for every craft the teacher holds at >= 0.3 (capped at the teacher's own familiarity).
 */
export function knowledgeTick(sim) {
  const vs = sim.ents.ofKind("villager");
  const work = [];
  for (const p of vs) {
    const c = p.job && p.action ? craftOfJob(p) : null;
    if (c && famOf(p, c) > 0) work.push([p, c]);
  }
  if (work.length) for (const l of vs) {
    if (l.slp === 1) continue;
    for (const [p, c] of work) {
      if (p === l || !near(p, l, WATCH_R)) continue;
      const f = famOf(l, c);
      if (f >= famOf(p, c)) continue;
      const kin = l.par && l.par.includes(p.id) ? KIN_X : 1;
      setFam(sim, l, c, f + WATCH_RATE * aptOf(l) * (1 - f) * kin, { kind: "watch" });
      break;                                           // one learning target per learner
    }
  }
  for (const t of vs) {
    if (!t.tch || t.tch.u <= sim.tick) continue;
    const p = sim.ents.get(t.tch.p);
    if (!p || !near(t, p, 3)) continue;
    for (const c of CRAFT_IDS) {
      const tf = famOf(t, c), f = famOf(p, c);
      if (tf < LOW_FAM || f >= tf) continue;
      setFam(sim, p, c, Math.min(tf, f + WATCH_RATE * TEACH_X * aptOf(p) * (1 - f)), { kind: "teach" });
    }
  }
}

/** Using a craft nudges familiarity toward 1 (§10) and resets its decay. */
export function useCraft(sim, v, craft) {
  const f = famOf(v, craft);
  if (f > 0 && f < 1) setFam(sim, v, craft, f + USE_NUDGE * (1 - f), { kind: "use" });
}
/** Waste fraction of a craft's output at this familiarity (< 0.3 adds waste on top of skill, §10). */
export function wasteOf(f) { return f >= LOW_FAM ? 0 : 0.2; }

/** Grant knowledge directly (fixtures, tests, a debug button): the same path as discovery, without a phenomenon. */
export function grant(sim, v, craft, f = DISCOVER_FAM) { return setFam(sim, v, craft, f, { kind: "grant" }); }

/** Trace entry (debug panel): the factors behind a roll. */
export function trace(sim, entry) {
  const t = sim.disc.trace;
  t.push({ t: sim.tick, ...entry });
  if (t.length > TRACE_MAX) t.shift();
}

