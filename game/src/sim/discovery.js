// Discovery: WITNESS and TINKER (GDD §15.4). Phenomena are data (phenomena.js); this module is the only place that fires them.
//
// WITNESS. A phenomenon happens at a site (a burning tree, a lit hearth). Every villager who can see it, awake, rolls once per
// (phenomenon, site, villager) per 450 ticks:
//     w = salience x attention x (0.6 + 0.4 x intelligence) x (1 + pressure) x jitter      attention .3 passive, .6 working, 1.0 performing
//     jitter = 0.8 + 0.4 x a named-stream float (the roll)       it sticks when w >= 0.2: familiarity 0.2 (the discoverer, who performs it: 0.5)
// Already-familiar witnesses gain 0.5 x (1 - f) x w. Nobody learning it makes it a Curiosity.
//
// TINKER. A normal board job (jobs.js genTinker): leisure class, or standing when the player asked ("Investigate"). The village keeps at
// most CAND_CAP candidate experiments, each material-in-reach x station-context x verb, weighted 1 + 2 x relevance + novelty
// (relevance = the pressure its perceived properties answer). An attempt consumes the material and 300 ticks of labour; if the
// combination satisfies a phenomenon it fires with the tinker performing; if not it is a dead end, remembered with the heat level
// tried. When an attempt matches on inputs but falls short on context it counts toward the Almanac's near-miss hint.
// Tinkering for a craft nobody knows, next to evidence of it, weights the matching try EVIDENCE_X higher: the rediscovery discount (R11).
import { DAY } from "./clock.js";
import { clamp } from "./util.js";
import { PHENOMENA, PHENOMENON_IDS, matches, tagsOf, TAG_PRESSURE, PRESSURE_TAGS, TOOL_ITEMS } from "./phenomena.js";
import { setFam, famOf, can, pressure, trace, evidenceOf, EVIDENCE_X, DISCOVER_FAM, WITNESS_FAM } from "./knowledge.js";
import { flames, litHearths, hearths, smokeFire } from "./fire.js";
import { survey, dropLoose, takeFromStack, inZone } from "./items.js";
import { stationHeat, FUEL_H } from "./heat.js";
import { CAMP } from "./board.js";
import { gain } from "./skills.js";
import { mix32 } from "./rng.js";
import { fnv1aStr } from "./hash.js";
import { depthOn, dryAir } from "./depth.js";

export const SIGHT = 12;               // cells a villager sees a fire from (the shared sight cache, §13.8, simplified)
export const WITNESS_EVERY = 450;      // dedup window per (phenomenon, site, witness), a quarter of a game day
export const STICK_AT = 0.2;           // witness threshold
export const CURIO_X = 4;              // an experiment at the spot of a Curiosity they hold weighs this much more
export const CAND_CAP = 8;             // hard cap on candidate experiments per village (§15.4)
export const TINKER_DUR = 300;         // ticks of work in one attempt
export const VERB_DUR = { heat: 300, hit: 200, soak: 200, bury: 1200, mix: 200, press: 200, bind: 200, leave: 1200 };      // S7b: "leave" and "bury" last long enough for a charcoal burn (1200) or a clay firing (600-900)
export const TINKER_WORK = 300;        // ticks of a tinkerer's own labour in one attempt: a "leave" or "bury" is set up in that time and left to burn for its full VERB_DUR
export const CAMP_VERBS = ["hit", "soak", "bury", "mix", "press", "bind"];
export const DEAD_MAX = 30;
export const STRANGERS = { clay: "POTTERY", malachite: "SMELTING", fired_clay: "VESSELS", hide: "HIDE_WORKING", iron_ore: "IRON_SMELTING", mould: "CASTING", salt: "SALTING", peat: "PEAT_CUTTING", herb: "HERBAL", bone: "BONE_WORKING" };     // material -> the craft that gives it a use: an itch by itself while nobody knows that craft
/** Items that go into the fire with a metal (a casting needs a mould beside the metal). */
export const PARTNER = { copper: "mould" };
/** What a villager does with a material by instinct, from how it looks and feels (a perceived-property affinity): strands are bound, stone is struck, a skin is worked. Weights the camp verbs only. */
export const VERB_AFFINITY = { fibre: "bind", hide: "press", stone: "hit", malleable: "hit", wood: "hit", salt: "mix", herb: "soak", bone: "hit" };
export const AFFINITY_X = 10;
export const BAKE_R = 4;               // clay lying this close to a lit fire of heat 2+ for 600 ticks bakes (the witness route to pottery)

// ---- sites -----------------------------------------------------------------------------------------------------------

/**
 * Where an experiment or a phenomenon can happen: {key, id, kind: flame|hearth|ember|camp, src, x,y,z, heat, enclosed}.
 * The camp (bare hands, heat 0) is always there. Cold hearths are ember sites: old coals to coax a spark from.
 */
export function sitesOf(sim) {
  const out = [];
  for (const f of flames(sim)) out.push({ key: "flame:" + f.id, id: f.id, kind: "flame", src: "flame", x: f.x, y: f.y, z: f.z, heat: f.heat, enclosed: f.src === "smoulder" });
  for (const h of hearths(sim)) {
    if (h.lit) out.push({ key: "hearth:" + h.id, id: h.id, kind: "hearth", src: "hearth", x: h.x, y: h.y, z: h.z, heat: h.hl, enclosed: false });
    else out.push({ key: "ember:" + h.id, id: h.id, kind: "ember", src: "ember", x: h.x, y: h.y, z: h.z, heat: 1, enclosed: false });
  }
  for (const f of sim.ents.ofKind("furniture")) {                     // S7b: an idle kiln or mound is a place to try things (hf = heat by fuel); S9: a forge too, and a covered rack (heat = the fire beside it)
    if (f.f === "smoker") {
      if (f.bn > 0 || reservedFresh(sim, f)) continue;
      const sk = { key: "smoker:" + f.id, id: f.id, kind: "smoker", src: "smoke", x: f.x, y: f.y, z: f.z, heat: smokeFire(sim, f), enclosed: true };
      if (depthOn(sim)) sk.dry = dryAir(sim, f) ? 1 : 0;                    // S14: wind-drying is tried on the rack, in dry cold air
      out.push(sk);
      continue;
    }
    if ((f.f !== "kiln" && f.f !== "mound" && f.f !== "forge") || f.bn > 0 || reservedFresh(sim, f)) continue;
    const hf = { log: stationHeat(sim, f, "log").level, stick: 0, charcoal: stationHeat(sim, f, "charcoal").level, coal: stationHeat(sim, f, "coal").level };
    hf.stick = hf.log;
    out.push({ key: f.f + ":" + f.id, id: f.id, kind: f.f, src: "pit", x: f.x, y: f.y, z: f.z, heat: hf.log, hf, enclosed: f.f === "mound" || f.lid > 0 });
  }
  const c = CAMP(sim.stock);
  out.push({ key: "camp", id: 0, kind: "camp", src: "hand", x: c.x, y: c.y, z: sim.stock.z, heat: 0, enclosed: false });
  return out;
}
const reservedFresh = (sim, f) => f.rv && sim.ents.get(f.rv) && sim.tick - f.rt < 400 && sim.ents.get(f.rv).job && sim.ents.get(f.rv).job.k !== "tinker";   // a station a villager is working at (a recipe) is not free for tinkering

/**
 * S9 witness routes for crafts that are SEEN while doing something else: stone fitted in a wall, fibre bound into a roof, a hide taken off a carcass, a log squared.
 * `kind` + the cell make the site key (the 450-tick dedup is per site and witness). Only while the village does not know the craft yet (afterwards watching a
 * practitioner at work is how it spreads, knowledge.js).
 */
export function sight(sim, rowId, kind, x, y, z, performer) {
  const row = PHENOMENA[rowId];
  if (!row || row.stub || can(sim, row.craft)) return 0;
  return observe(sim, row, { key: kind + ":" + (x >> 2) + "," + (y >> 2), id: 0, kind, x, y, z }, performer || null);
}

/** Rows the engine runs (stubs wait for S7b). */
export function activeRows() { return PHENOMENON_IDS.map(id => PHENOMENA[id]).filter(r => !r.stub); }

// ---- witness ---------------------------------------------------------------------------------------------------------

const intNorm = (v) => clamp((v.t.intelligence - 0.8) / 0.4, 0, 1);
const sees = (v, s) => Math.abs(v.x - s.x) <= SIGHT && Math.abs(v.y - s.y) <= SIGHT && Math.abs(v.z - s.z) <= 2;

function attention(v, performing) {
  if (performing) return 1.0;
  return v.action && v.action.type === "Task" && v.job && v.job.k !== "sleep" ? 0.6 : 0.3;
}

/** Every 50 ticks: running fires are phenomena; everyone who sees one rolls. */
export function siteTick(sim) {
  const sites = sitesOf(sim);
  for (const s of sites) {
    if (s.kind !== "flame" && s.kind !== "hearth") continue;
    const ctx = { tags: ["fuel", "wood", "dry"], src: s.src, heat: s.heat, enclosed: s.enclosed, duration: 1 << 20 };
    for (const row of activeRows()) if (row.witness !== false && matches(row, ctx).ok) observe(sim, row, s, null);
  }
  clayByFire(sim);
  peatByFire(sim);
  const d = sim.disc;                                              // forget old dedup stamps
  if (sim.tick % 1000 === 0) for (const k of Object.keys(d.wd)) if (sim.tick - d.wd[k] > 2 * WITNESS_EVERY) delete d.wd[k];
}

/**
 * S7b witness route to pottery (GDD §15.5.1): wet clay lying within BAKE_R of a lit fire that is at least a Hearth (level 2) for the row's
 * duration bakes; whoever sees it may understand. Stops once the village knows pottery (from then on it is done on purpose, in a kiln).
 */
function clayByFire(sim) {
  const d = sim.disc, row = PHENOMENA.BAKE_CLAY;
  if (!d.ex) d.ex = {};
  const lit = litHearths(sim).filter(h => h.hl >= 2);
  if (can(sim, "POTTERY") || !lit.length) { for (const k of Object.keys(d.ex)) if (k.startsWith("clay:")) delete d.ex[k]; return; }
  const items = sim.ents.ofKind("item");
  for (const h of lit) {
    let st = null;
    for (const s of items) if (s.item === "clay" && s.n > 0 && Math.max(Math.abs(s.x - h.x), Math.abs(s.y - h.y)) <= BAKE_R && Math.abs(s.z - h.z) <= 1 && (!st || s.id < st.id)) st = s;
    const k = "clay:" + h.id;
    if (!st) { delete d.ex[k]; continue; }
    d.ex[k] = (d.ex[k] || 0) + 50;
    const ctx = { tags: tagsOf("clay"), src: "hearth", heat: h.hl, enclosed: false, duration: d.ex[k] };
    if (!matches(row, ctx).ok) continue;
    d.ex[k] = 0;
    if (inZone(sim.stock, st.x, st.y) || true) { takeFromStack(sim, st, 1); dropLoose(sim, "fired_clay", 1, st.x, st.y, st.z); }
    observe(sim, row, { key: "clayfire:" + h.id, id: h.id, kind: "hearth", x: st.x, y: st.y, z: st.z }, null);
  }
}

/**
 * S14 witness route to peat fuel: wet peat lying within BAKE_R of a lit fire (hearth level 1+) for PEAT_WAIT ticks dries out and is seen to burn. Peat is not used up.
 * Stops once the village cuts peat on purpose.
 */
export const PEAT_WAIT = 300;
function peatByFire(sim) {
  const d = sim.disc, row = PHENOMENA.PEAT_FUEL;
  if (!d.ex) d.ex = {};
  const lit = litHearths(sim).filter(h => h.hl >= 1);
  if (!depthOn(sim) || can(sim, "PEAT_CUTTING") || !lit.length) { for (const k of Object.keys(d.ex)) if (k.startsWith("peat:")) delete d.ex[k]; return; }
  const items = sim.ents.ofKind("item");
  for (const h of lit) {
    let st = null;
    for (const s of items) if (s.item === "peat" && s.n > 0 && Math.max(Math.abs(s.x - h.x), Math.abs(s.y - h.y)) <= BAKE_R && Math.abs(s.z - h.z) <= 1 && (!st || s.id < st.id)) st = s;
    const k = "peat:" + h.id;
    if (!st) { delete d.ex[k]; continue; }
    d.ex[k] = (d.ex[k] || 0) + 50;
    if (d.ex[k] < PEAT_WAIT) continue;
    d.ex[k] = 0;
    observe(sim, row, { key: "peatfire:" + h.id, id: h.id, kind: "hearth", x: st.x, y: st.y, z: st.z }, null);
  }
}

/**
 * S7b witness route to vessels: a thirsty villager drinks with baked clay lying (or carried) within 3 cells: water meets fired clay.
 * Called by the drink verb.
 */
export function waterTouch(sim, v) {
  if (can(sim, "VESSELS")) return;
  let at = v.carry && (v.carry.item === "fired_clay" || v.carry.item === "jar") ? v : null;
  if (!at) for (const s of sim.ents.ofKind("item")) if ((s.item === "fired_clay" || s.item === "jar") && Math.abs(s.x - v.x) <= 3 && Math.abs(s.y - v.y) <= 3 && Math.abs(s.z - v.z) <= 2) { at = s; break; }
  if (!at) return;
  const row = PHENOMENA.HOLDS_LIQUID;
  observe(sim, row, { key: "water:" + (v.x >> 2) + "," + (v.y >> 2), id: 0, kind: "water", x: v.x, y: v.y, z: v.z }, v);      // the drinker sees it with their own eyes (attention 1); others nearby may too
}

/**
 * The phenomenon `row` is happening at `site`. `performer` (a villager or null) did it with intent (attention 1.0, discoverer).
 * Returns the number of villagers who learned the craft.
 */
export function observe(sim, row, site, performer) {
  const d = sim.disc, r = sim.rng.stream("witness"), craft = row.craft;
  if (d.seen[row.id] === undefined) d.seen[row.id] = sim.tick;
  const press = Math.max(0, ...row.serves.map(t => pressure(sim, t)));
  let learned = 0;
  for (const v of sim.ents.ofKind("villager")) {
    const perf = performer && v.id === performer.id;
    if (!perf && (v.slp === 1 || !sees(v, site))) continue;
    const key = row.id + ":" + site.key + ":" + v.id;
    if (!perf && d.wd[key] !== undefined && sim.tick - d.wd[key] < WITNESS_EVERY) continue;
    d.wd[key] = sim.tick;
    const att = attention(v, perf), inn = 0.6 + 0.4 * intNorm(v), jit = perf ? 1 : 0.8 + 0.4 * r.float();
    const w = row.salience * att * inn * (1 + press) * jit;
    const ok = perf || w >= STICK_AT;
    const f0 = famOf(v, craft);
    let gained = false;
    if (ok) {
      if (f0 === 0) gained = setFam(sim, v, craft, perf ? DISCOVER_FAM : WITNESS_FAM, { kind: perf ? "discover" : "witness", row: row.id });
      else gained = setFam(sim, v, craft, f0 + 0.5 * (1 - f0) * Math.min(1, w), { kind: "witness", row: row.id });
      if (f0 === 0 && gained) learned++;
    }
    trace(sim, { k: perf ? "perform" : "witness", who: v.name, row: row.id, site: site.key, sal: row.salience, att, int: round2(inn), pr: round2(press), jit: round2(jit), w: round2(w), ok });
  }
  if (!can(sim, craft) && !d.curio.some(c => c.row === row.id)) {
    d.curio.push({ id: row.id + ":" + site.key, row: row.id, craft, t: sim.tick, x: site.x, y: site.y, z: site.z, text: row.curio });
  }
  return learned;
}
const round2 = (x) => Math.round(x * 100) / 100;

// ---- tinker candidates ------------------------------------------------------------------------------------------------

/** Tags a candidate shows the matcher: its material, and the fuel it is put in the pit with. */
const candTags = (c) => (c.with ? [...new Set([...tagsOf(c.item), ...tagsOf(c.with)])] : tagsOf(c.item));
/** The heat level the experiment gets: a station's by the fuel used; a fire smothered under earth ("bury") drops to a smoulder. */
export function candHeat(c) {
  const s = c.site;
  if (c.verb === "bury" && s.kind === "hearth") return 1;
  if (s.hf) return s.hf[c.fuel || "log"];
  return s.heat;
}
/** The context a candidate experiment gives the matcher. */
export function candCtx(c) {
  const s = c.site;
  return { tags: candTags(c), src: s.src, heat: candHeat(c), enclosed: s.enclosed || (c.verb === "bury" && s.kind === "hearth"), verb: c.verb, duration: VERB_DUR[c.verb], dry: s.dry };
}
const itemKey = (c) => c.item + (c.with ? "+" + c.with : "");

function deadFor(d, key, heat) { return d.dead.find(e => e.k === key && e.lvl >= heat); }

/** Does this experiment satisfy a phenomenon (an oracle for the sim only; no villager ever reads it)? -> the row or null */
export function satisfies(c) {
  const ctx = candCtx(c);
  for (const row of activeRows()) if (matches(row, ctx).ok) return row;
  return null;
}

/**
 * The village's candidate experiments, at most CAND_CAP, best first. Cached until stock, stations, dead ends or the day change
 * ("precomputed when stock or stations change", not per villager per pick).
 */
export function tinkerCandidates(sim) {
  const sites = sitesOf(sim), d = sim.disc, sv = survey(sim), ask = askActive(sim);
  const sig = sim.cache.iv + "|" + sites.map(s => s.key + ":" + s.heat + (s.hf ? "/" + s.hf.charcoal + "/" + s.hf.coal : "")).join() + "|" + d.dead.length + "|" + (ask ? (ask.item || "*") + "@" + (ask.at || "") : "") + "|" + Math.floor(sim.tick / DAY) + "|" + Object.keys(d.lost).join();
  if (sim.cache.tkSig === sig) return sim.cache.tk;
  const mats = [];
  if (sites.some(s => s.kind !== "camp" && !s.hf)) mats.push("deadwood");              // branches lying around a fire cost nothing (listed first: the representative of the fuel family)
  for (const k of Object.keys(sv.stock).sort()) if (sv.stock[k] > 0 && tagsOf(k).length && (!tagsOf(k).includes("food") || tagsOf(k).includes("meat") || (tagsOf(k).includes("seed") && !can(sim, "CULTIVATION")))) mats.push(k);     // S10: a seed (berry, tuber) is tried while nobody knows farming - buried, at the camp, and nowhere else
  const axes = TOOL_ITEMS.filter(k => sv.stock[k] > 0), fuelsHave = ["log", "charcoal", "coal"].filter(f => sv.stock[f] > 0);
  const list = [], fam = new Set();
  const isFuel = (k) => tagsOf(k).includes("fuel");
  for (const item of mats) {
    if (ask && ask.item && item !== ask.item && item !== "deadwood") continue;
    const woodFuel = isFuel(item) && !tagsOf(item).includes("carbon");
    for (const s of sites) {
      if (ask && ask.at && s.id !== ask.at) continue;                           // "try things HERE": only the station the player pointed at
      if (item === "deadwood" && (s.kind === "camp" || s.hf)) continue;       // the free branches lie round a fire, not at the stockpile or in a pit
      if (tagsOf(item).includes("seed") && s.kind !== "camp") continue;
      if (s.kind === "mound" && !(item === "log" || item === "stick")) continue;     // a mound takes wood
      if (s.kind === "smoker" ? !tagsOf(item).includes("meat") : tagsOf(item).includes("meat") && s.kind !== "camp") continue;      // S9: a covered rack takes meat; meat is tried at the camp or the rack, nowhere else
      if (s.hf && woodFuel && !(item === "log" || item === "stick")) continue;       // so does a kiln: brush is not fuel for a pit
      // what goes in with it: a station burns a fuel (wood, or charcoal if the village has some); a bare material is tried with each fuel in stock
      let vars = [{ with: "", fuel: "" }];
      if (s.hf) {
        vars = woodFuel ? [{ with: "", fuel: item }] : isFuel(item) ? [{ with: "", fuel: item }] : fuelsHave.map(f => ({ with: f, fuel: f }));
        if (!woodFuel && !isFuel(item) && PARTNER[item] && sv.stock[PARTNER[item]] > 0) for (const f of fuelsHave) vars.push({ with: PARTNER[item], fuel: f });     // S9: a metal and its mould, in the fire
      } else if (s.kind === "camp" && item === "salt") vars = sv.stock.hopper_meat > 0 ? [{ with: "hopper_meat", fuel: "" }] : [];       // S14: salt is tried on meat, rubbed in
      else if (s.kind === "camp" && tagsOf(item).includes("wood")) for (const a of axes) vars.push({ with: a, fuel: "" });                                       // S9: a log and an axe, at the camp
      const verbs = tagsOf(item).includes("seed") ? ["bury"] : s.kind === "smoker" ? ["leave"] : s.kind === "camp" ? CAMP_VERBS : woodFuel ? (s.kind === "hearth" ? ["heat", "bury"] : ["heat"]) : isFuel(item) ? ["heat"] : ["heat", "leave"];     // dry wood and grass are one family of experiment: put it on the fire
      if (s.hf && woodFuel) verbs.splice(0, verbs.length, "heat", "leave");
      for (const va of vars) for (const verb of verbs) {
        if (woodFuel && !va.with) { const f = "fuel|" + verb + "|" + s.key; if (fam.has(f)) continue; fam.add(f); }
        const c = { key: item + (va.with ? "+" + va.with : "") + "|" + verb + "|" + s.key, item, with: va.with, fuel: va.fuel, verb, site: s };
        const dk = itemKey(c) + "|" + verb + "|" + s.src, dead = deadFor(d, dk, candHeat(c));
        let rel = 0;
        for (const t of tagsOf(item)) if (TAG_PRESSURE[t]) rel = Math.max(rel, pressure(sim, TAG_PRESSURE[t]));      // what the material itself shows, not the fuel it goes in with
        const stranger = !!STRANGERS[item] && !can(sim, STRANGERS[item]);
        if (stranger) rel = Math.max(rel, 0.5);                                                       // a stranger material nags (the itch) while nobody knows what it is for
        const ct = candTags(c);
        const curious = d.curio.some(q => Math.abs(q.x - s.x) <= 1 && Math.abs(q.y - s.y) <= 1 && PHENOMENA[q.row] && PHENOMENA[q.row].needs.inputs.some(t => ct.includes(t)));     // what they saw nags them about the stuff involved
        if (curious) rel = 1;                                                                         // a Curiosity they hold is standing right there
        const row = satisfies(c);
        c.row = row ? row.id : "";
        const ev = row && !can(sim, row.craft) && evidenceOf(sim, row.craft) > 0;                   // the traces of a lost craft are an itch of their own
        if (ev) rel = 1;
        const nov = dead ? 0 : 1;
        c.rel = rel; c.nov = nov; c.w = (1 + 2 * rel + nov) * (dead ? 0.25 : 1) * (curious ? CURIO_X : 1) * (stranger ? 2 : 1) * (s.kind === "camp" && !stranger ? 0.5 : 1);
        if (s.kind === "camp" && tagsOf(item).some(t => VERB_AFFINITY[t] === verb)) c.w *= AFFINITY_X;
        if (s.hf && c.with && FUEL_H[c.fuel]) c.w *= (FUEL_H[c.fuel] / FUEL_H.log) ** 2;               // S9: villagers put a stranger material into the hottest fire they have (coal 3.5, charcoal 2.25, wood 1)
        if (ev) { c.w *= EVIDENCE_X; c.ev = 1; }
        list.push(c);
      }
    }
  }
  // The village considers at most CAND_CAP experiments at a time (§15.4): a weighted draw from everything possible, redrawn each day. The draw is a hash
  // of (candidate, day) rather than a stream, so previews and repeated cache refreshes never move the RNG and the pool is the same for every villager.
  const day = Math.floor(sim.tick / DAY);
  for (const c of list) c.u = mix32(fnv1aStr(c.key), day) / 4294967296;
  list.sort((a, b) => b.w * (0.7 + 0.6 * b.u) - a.w * (0.7 + 0.6 * a.u) || (a.key < b.key ? -1 : 1));
  sim.cache.tk = list.slice(0, CAND_CAP); sim.cache.tkSig = sig; sim.cache.tkAll = list;      // (tkAll: everything possible, for tests and the debug panel)
  return sim.cache.tk;
}

/** Chance that one weighted pick fires `rowId` (0 if no matching candidate made the cap). Expected attempts = 1 / this. */
export function discoveryOdds(sim, rowId) {
  const list = tinkerCandidates(sim);
  let all = 0, hit = 0;
  for (const c of list) { all += c.w; if (c.row === rowId) hit += c.w; }
  return all ? hit / all : 0;
}

/** Weighted draw from the candidates with the "tinker" stream. dry: the best one, drawing nothing (previews must not move the RNG). */
export function pickCandidate(sim, list, dry) {
  if (!list.length) return null;
  if (dry) return list[0];
  let tot = 0;
  for (const c of list) tot += c.w;
  let x = sim.rng.stream("tinker").float() * tot;
  for (const c of list) { x -= c.w; if (x < 0) return c; }
  return list[list.length - 1];
}

/** The cooldown key of an experiment: one per station per day; at the camp (bare hands) one per material per day. */
export const cdKey = (site, item) => (site.kind === "camp" ? site.key + "|" + item : site.key);

export function askActive(sim) {
  const a = sim.disc.ask;
  return a && a.until > sim.tick ? a : null;
}
/** Is there something nagging at the village (so unasked tinkering is worth anyone's free time)? §15.4 itch. */
export function itchAt(sim) {
  const d = sim.disc;
  if (askActive(sim)) return true;
  if (d.curio.some(c => !c.wild)) return true;                 // S8: wild sightings (an animal, a stain underground) are Curiosities but not an itch to tinker
  for (const t of PRESSURE_TAGS) if (pressure(sim, t) > 0.3) return true;
  const sv = survey(sim);
  for (const k of Object.keys(STRANGERS)) if (sv.stock[k] > 0 && !can(sim, STRANGERS[k])) return true;
  return false;
}

// ---- the attempt -------------------------------------------------------------------------------------------------------

export function recordDeadEnd(sim, c) {
  const d = sim.disc, k = itemKey(c) + "|" + c.verb + "|" + c.site.src, lvl = candHeat(c);
  const e = d.dead.find(q => q.k === k);
  if (e) { e.n++; e.lvl = Math.max(e.lvl, lvl); e.t = sim.tick; return; }
  d.dead.push({ k, item: c.item, st: c.site.src, verb: c.verb, lvl, n: 1, t: sim.tick, ...(c.with ? { w: c.with } : {}) });
  if (d.dead.length > DEAD_MAX) d.dead.shift();
}

/** The tinker finishes an attempt (verb "tinker" in tasks.js). Returns true if a phenomenon fired. */
export function attempt(sim, v, c) {
  const d = sim.disc, site = currentSite(sim, c.site);
  if (!site) return false;                                    // the fire went out before the experiment finished
  const cc = { ...c, site };
  const ctx = candCtx(cc);
  d.cd[cdKey(site, c.item)] = sim.tick;
  d.nt++;
  let fired = false;
  for (const row of activeRows()) {
    const m = matches(row, ctx);
    if (m.ok) {
      fired = true;
      observe(sim, row, site, v);
      gain(sim, v, "craft", 0.3, true, 0.5);                       // XP from a successful value only (§15.14)
      if (row.produces) dropLoose(sim, row.produces.item, Math.max(1, Math.round(row.produces.n / 3)), site.x, site.y, site.z);     // a small trial batch: one unit in, one or two out
      trace(sim, { k: "tinker", who: v.name, row: row.id, site: site.key, item: itemKey(c), verb: c.verb, ok: true });
    } else if (m.near) {
      d.miss[row.id] = (d.miss[row.id] || 0) + 1;
      trace(sim, { k: "tinker", who: v.name, row: row.id, site: site.key, item: itemKey(c), verb: c.verb, ok: false, near: m.miss.join() });
    }
  }
  if (!fired) {
    recordDeadEnd(sim, cc);
    trace(sim, { k: "tinker", who: v.name, site: site.key, item: itemKey(c), verb: c.verb, ok: false });
  }
  sim.cache.tkSig = null;
  return fired;
}

/** The live version of a site (a flame may have gone out since the job was planned); null if it no longer exists. */
function currentSite(sim, s) {
  return sitesOf(sim).find(q => q.key === s.key) || null;
}

/** Near-miss hints the Almanac may show: rows with >= 3 near-miss attempts. */
export function hints(sim) {
  const out = [];
  for (const id of PHENOMENON_IDS) {
    const n = sim.disc.miss[id] || 0, row = PHENOMENA[id];
    if (n >= 3 && !can(sim, row.craft)) out.push({ id, n, text: row.nearMiss });
  }
  return out;
}

