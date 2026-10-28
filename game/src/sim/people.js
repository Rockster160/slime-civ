// People depth (S13, GDD §08 and the post-C3 flavour in §20): kinship and inbreeding, relationships over time, grief,
// graves, heirlooms, hobbies' notes and earned titles. Everything here is data on the villagers (plus `grave` entities),
// driven by two hooks: peopleTick (every 100 ticks / daily from sim.js) and onDeath (from population.kill).
//
//   grave = {kind:"grave", x,y,z, vid, name, hue, born, died, cause, ins (inscription), hl (heirloom buried with them, or "")}
import { DAY, dateOf } from "./clock.js";
import { clamp } from "./util.js";
import { mix32 } from "./rng.js";
import { log } from "./chronicle.js";
import { award, MASTER_AT } from "./titles.js";
import { genoFrom, isAdult } from "./villager.js";
import { bump, chemistry, refreshTiers, fadeAffinity, relOf } from "./bonds.js";
import { HOBBIES, hobbyOf, hobbyLevel, NOTABLE_AT } from "./hobby.js";
import { SKILLS, level, PROFESSION } from "./skills.js";
import { inZone } from "./items.js";
import { restricted } from "./lair.js";

// ---- kinship and inbreeding (R16) ----------------------------------------------------------------------------------------

export const WEAK_PER_KIN = 1.2;             // chance of a weak child = this x kinship (0.5 parent/sibling -> 60%, 0.25 -> 30%, first cousins 0.125 -> 15%)
export const WEAK_MUL = { hardiness: 0.88, fertility: 0.85, longevity: 0.93 };    // what a weak outcome costs, plus one more trait at 0.9
export const AVOID_KIN = 0.8;                // partner choice: a pair of kinship r is picked at (1 - AVOID_KIN x r) the weight (mild avoidance)

const ids = (a) => a.filter(Boolean);
const dedupe = (a) => [...new Set(a)];
/** Grandparent ids to remember on a child of a and b (kinship reaches first cousins through these). */
export function grandparents(a, b) { return dedupe(ids([...(a.par || []), ...(b.par || [])])); }

/**
 * Kinship coefficient 0..0.5 from v.par / v.gp lineage: 0.5 parent-child, full siblings, or the same person; 0.25 half-siblings,
 * grandparent and grandchild, uncle/aunt and nephew/niece; 0.125 first cousins; else 0. (Clones, par [p,p], count as the parent's child.)
 */
export function kinship(a, b) {
  if (a.id === b.id) return 0.5;
  const pa = dedupe(ids(a.par || [])), pb = dedupe(ids(b.par || []));
  if (pa.includes(b.id) || pb.includes(a.id)) return 0.5;
  const shared = pa.filter(x => pb.includes(x)).length;
  if (shared >= 2) return 0.5;
  if (shared === 1) return 0.25;
  const ga = a.gp || [], gb = b.gp || [];
  if (ga.includes(b.id) || gb.includes(a.id)) return 0.25;
  if (pa.some(x => gb.includes(x)) || pb.some(x => ga.includes(x))) return 0.25;
  if (ga.some(x => gb.includes(x))) return 0.125;
  return 0;
}
export const kinWord = (r) => (r >= 0.5 ? "close kin (parent, child or sibling)" : r >= 0.25 ? "near kin (half-sibling, grandparent, uncle or aunt)" : r > 0 ? "a first cousin" : "");

/** Chance the child of a pair this related is weak. */
export const weakChance = (r) => clamp(WEAK_PER_KIN * r, 0, 0.9);
/** Turn a freshly rolled phenotype into a weak one (close-kin outcome). `pick` is a 0..n-1 draw for the extra trait. */
export function makeWeak(t, extra) {
  const o = { ...t };
  for (const k in WEAK_MUL) o[k] = Math.round(o[k] * WEAK_MUL[k] * 1000) / 1000;
  if (extra && !WEAK_MUL[extra]) o[extra] = Math.round(o[extra] * 0.9 * 1000) / 1000;
  return o;
}

/** Partner weights for `a` among `cands` (with kinship, bond and friendship): used by breedDaily and the breed bot. */
export function partnerWeight(a, o) {
  let w = 1 - AVOID_KIN * kinship(a, o);
  const r = relOf(a, o.id);
  if (r && (r.k === "partner" || r.k === "friend")) w *= r.k === "partner" ? 4 : 2;
  return w;
}
/** Roulette pick of a partner; `r` is the stream. */
export function pickPartner(r, a, cands) {
  let tot = 0;
  for (const o of cands) tot += partnerWeight(a, o);
  let x = r.float() * tot;
  for (const o of cands) { x -= partnerWeight(a, o); if (x < 0) return o; }
  return cands[cands.length - 1];
}

// ---- heirlooms ---------------------------------------------------------------------------------------------------------

const H_ADJ = ["Grey", "Mossy", "Worn", "Blue", "Cracked", "Smooth", "Bright", "Old"];
const H_THING = ["Comb", "Stone Ring", "Reed Flute", "Bone Needle", "Pebble Charm", "Bead Cord", "Skin Pouch", "Flint Whistle"];
export const HEIRLOOM_ODDS = 10;           // about 1 in 10 villagers carry one
export function newHeirloom(v, tick) {
  const h = mix32(v.id, 0x7e11);
  return { n: "the " + H_ADJ[h % 8] + " " + H_THING[(h >>> 8) % 8], h: [{ n: v.name, t: tick }] };
}

/** Everything a villager gets when they are made (founder, birth, clone): alleles when missing, maybe an heirloom. */
export function initPerson(sim, v) {
  if (!v.g) v.g = genoFrom(v.t, v.id);
  if (mix32(v.id, 0x41ab) % HEIRLOOM_ODDS === 0) v.hl = newHeirloom(v, sim.tick);
  return v;
}

// ---- titles --------------------------------------------------------------------------------------------------------------

/** Title-worthy things that are not one-off events: mastery of a craft, a renowned hobby. */
export function titleCheck(sim, v) {
  if (!isAdult(sim, v)) return;
  for (const s of SKILLS) if (level(v, s) >= MASTER_AT) award(sim, v, "master " + PROFESSION[s], true);
  if (!v.hb) v.hb = { xp: 0, n: 0 };
  const hl = hobbyLevel(v);
  if (hl >= NOTABLE_AT) {
    const hb = HOBBIES[hobbyOf(v)];
    if (!v.hb.n) { v.hb.n = 1; log(sim, "MILESTONE", v.name + " is known for " + hb.name + ": " + hb.note + ".", [v.id], { hobby: hobbyOf(v) }, 1); }
    award(sim, v, "renowned " + hb.doer, false);
  }
}

// ---- relationships ---------------------------------------------------------------------------------------------------------

const WORKING = new Set(["order", "standing", "demand", "vcrit"]);
const near3 = (a, b) => Math.abs(a.x - b.x) <= 3 && Math.abs(a.y - b.y) <= 3 && Math.abs(a.z - b.z) <= 1;
/** Every 100 ticks: pairs working beside each other grow close (or clash); pairs huddled in the cold share a hardship. */
export function socialTick(sim) {
  const vs = sim.ents.ofKind("villager").filter(v => v.slp === 0 && isAdult(sim, v));
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i], wa = !!(a.job && a.action && WORKING.has(a.job.c));
    for (let j = i + 1; j < vs.length; j++) {
      const b = vs[j];
      if (!near3(a, b)) continue;
      if (wa && b.job && b.action && WORKING.has(b.job.c)) {
        const ch = chemistry(a, b);
        if (ch >= 0) bump(a, b, 0, 2 * ch); else bump(a, b, 2, 2 * ch);
      } else if (a.rest > 0 && b.rest > 0 && (a.warm < 0.6 || b.warm < 0.6)) bump(a, b, 1, 0.5);        // cold nights huddled together
    }
  }
}
export const HARDSHIP_PTS = 8, HARDSHIP_R = 10;

/** Daily: tiers are recomputed, the points fade, titles are checked. */
export function peopleDaily(sim) {
  const alive = (id) => !!sim.ents.get(id);
  for (const v of sim.ents.ofKind("villager")) {
    fadeAffinity(v);
    refreshTiers(v, alive);
    titleCheck(sim, v);
  }
}

// ---- death: grief, heirloom, grave --------------------------------------------------------------------------------------------

export const GRIEF_BASE_DAYS = 2, GRIEF_PER_STRENGTH = 3;
/** 0..1: how hard o takes v's death (partner 1, parent or child 0.9, sibling 0.7, mentor 0.6, near kin 0.5, friend 0.5, cousin 0.3), rivals not at all. */
export function griefOf(v, o) {
  if (v.mate === o.id || o.mate === v.id) return 1;
  const k = kinship(v, o);
  if ((v.par || []).includes(o.id) || (o.par || []).includes(v.id)) return 0.9;
  if (k >= 0.5) return 0.7;
  const r = relOf(o, v.id);
  if (r && r.k === "mentor") return 0.6;
  if (k >= 0.25) return 0.5;
  if (r && (r.k === "friend")) return 0.5;
  if (k > 0) return 0.3;
  return 0;
}

function graveSpot(sim) {
  const st = sim.stock, gs = sim.ents.ofKind("grave");
  const ax = gs.length ? gs[0].x : st.x1 + 6, ay = gs.length ? gs[0].y : st.y0 + 2;
  for (let R = 0; R <= 14; R++) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== R || dx % 2 !== 0 || dy % 2 !== 0) continue;      // a loose grid, one stone every second cell
    const x = ax + dx, y = ay + dy;
    if (inZone(st, x, y)) continue;
    const z = sim.world.standZ(x, y);
    if (z < 0 || sim.ents.at(x, y, z).length || sim.rooms.at(x, y, z)) continue;
    if (sim.farm.pens.some(p => p.z === z && inZone(p, x, y)) || (sim.farm.cellar && inZone(sim.farm.cellar, x, y))) continue;
    if (restricted(sim, x, y, z)) continue;
    return { x, y, z };
  }
  return null;
}

const when = (t) => { if (t < 0) return "before the landing"; const d = dateOf(t); return "year " + d.year + " day " + d.day; };
/** The words on the stone: names, dates, and the best thing the chronicle says about them (a title, else the most notable entry). */
export function inscription(sim, v, cause) {
  let deed = "";
  if (v.ti && v.ti.length) deed = v.ti.slice(0, 2).map(t => t[0].toUpperCase() + t.slice(1)).join("; ") + ".";
  else {
    const es = sim.chron.entries.filter(e => e.a.includes(v.id) && e.kind !== "BIRTH" && e.kind !== "DEATH" && e.sev >= 1);
    const pick = es.sort((a, b) => b.sev - a.sev || b.id - a.id)[0];
    if (pick) deed = pick.text.length > 90 ? pick.text.slice(0, 87) + "..." : pick.text;
  }
  return v.name + ", from " + when(v.born) + " to " + when(sim.tick) + ", died of " + cause + "." + (deed ? " " + deed : "");
}

/** Called by population.kill after the death is written, before the body goes. */
export function onDeath(sim, v, cause) {
  const rec = sim.chron.recs[v.id];
  if (rec) rec.ti = (v.ti || []).slice();
  const others = sim.ents.ofKind("villager").filter(o => o !== v);
  // shared hardship: whoever stood near a death that was not old age came through it together
  if (cause !== "old age") {
    const near = others.filter(o => Math.abs(o.x - v.x) <= HARDSHIP_R && Math.abs(o.y - v.y) <= HARDSHIP_R && isAdult(sim, o));
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) bump(near[i], near[j], 1, HARDSHIP_PTS);
  }
  // grief
  const mourners = [];
  for (const o of others) {
    const s = griefOf(v, o);
    if (s <= 0) continue;
    if (!o.gr || o.gr.s < s) o.gr = { u: sim.tick + Math.round((GRIEF_BASE_DAYS + GRIEF_PER_STRENGTH * s) * DAY), s, f: v.id };
    mourners.push([o, s]);
  }
  mourners.sort((a, b) => b[1] - a[1] || a[0].id - b[0].id);
  if (mourners.length) {
    const nm = mourners.slice(0, 2).map(m => m[0].name);
    const more = mourners.length - nm.length;
    log(sim, "MILESTONE", nm.join(" and ") + (more > 0 ? " and " + more + " other" + (more === 1 ? "" : "s") : "") + (nm.length + (more > 0 ? 1 : 0) > 1 || more > 0 ? " mourn " : " mourns ") + v.name + ".", mourners.map(m => m[0].id), { grief: v.id, n: mourners.length }, 1);
  }
  // heirloom
  let buried = "";
  if (v.hl) {
    const heirs = [];
    const mate = v.mate && sim.ents.get(v.mate); if (mate) heirs.push(mate);
    heirs.push(...others.filter(o => (o.par[0] === v.id || o.par[1] === v.id)).sort((a, b) => a.born - b.born || a.id - b.id));
    heirs.push(...others.filter(o => kinship(v, o) === 0.5 && !heirs.includes(o)).sort((a, b) => a.id - b.id));
    const bonds = (v.rel || []).filter(r => r.k !== "rival").map(r => sim.ents.get(r.o)).filter(Boolean);
    heirs.push(...bonds.filter(o => !heirs.includes(o)));
    const heir = heirs.find(o => !o.hl);
    if (heir) {
      heir.hl = { n: v.hl.n, h: [...v.hl.h, { n: heir.name, t: sim.tick }] };
      log(sim, "MILESTONE", "Before the end, " + v.name + " gave " + v.hl.n + " to " + heir.name + ". It has passed through " + heir.hl.h.length + " hands.", [heir.id, v.id], { heirloom: v.hl.n }, 1);
    } else {
      buried = v.hl.n;
      log(sim, "MILESTONE", v.hl.n[0].toUpperCase() + v.hl.n.slice(1) + " was buried with " + v.name + ": nobody was free to carry it on.", [v.id], { heirloom: v.hl.n }, 1);
    }
  }
  // grave
  const spot = graveSpot(sim);
  if (spot) {
    const g = sim.ents.add("grave", { x: spot.x, y: spot.y, z: spot.z, vid: v.id, name: v.name, hue: v.hue, born: v.born, died: sim.tick, cause, ins: inscription(sim, v, cause), hl: buried });
    sim.cache.iv++;
    return g;
  }
  return null;
}

/** What o is to v, in a word ("parent", "sibling", "cousin"...), or "" when unrelated. For the inspector's kin list. */
export function relationWord(v, o) {
  const pv = ids(v.par || []), po = ids(o.par || []);
  if (po.includes(v.id)) return v.par && v.par[0] === v.par[1] && v.par[0] === o.id ? "clone-parent" : "child";
  if (pv.includes(o.id)) return v.par[0] === v.par[1] ? "original (cloned from)" : "parent";
  const shared = dedupe(pv).filter(x => po.includes(x)).length;
  if (shared >= 2) return "sibling";
  if (shared === 1) return "half-sibling";
  if ((v.gp || []).includes(o.id)) return "grandparent";
  if ((o.gp || []).includes(v.id)) return "grandchild";
  if (pv.some(x => (o.gp || []).includes(x))) return "nephew or niece";
  if (po.some(x => (v.gp || []).includes(x))) return "uncle or aunt";
  if ((v.gp || []).some(x => (o.gp || []).includes(x))) return "cousin";
  return "";
}
