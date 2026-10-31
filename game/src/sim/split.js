// Splitting (replaces the old one-baby "clone"): a healthy adult divides into 2-5 smaller selves and the original is gone.
// It is not a death: no grave, no death entry, no mourning. The sim calls it through the "split" order (orders.js).
//
//   colour      exact copy.
//   genetics    traits t, hidden alleles g, prime, temperament ps, needs, memory strengths: each +-SPLIT_MUTATION, uniform, clamped.
//   mind        memories, episodes, bonds, beliefs (fam), hobby, titles, preferences: copied; a few memories/episodes are forgotten.
//   shares      skill xp (per skill, after SPLIT_LOSS), hp (after SPLIT_LOSS) and age are divided between the clones with weights
//               that are close but not equal (1 +- SPLIT_JITTER, normalised). The ages add up to the original's exactly.
//   how many    the largest N in 2..5 whose clones would likely live: hp share above a floor, an age share that is not newborn,
//               the original fed and rested enough. A weak slime makes 2; a very healthy one makes 5.
//   references  nothing may point at the old id: clone 1 inherits the job, reservations, bed, partner, possession, expedition
//               seat and the UI selection; every clone inherits the bonds others hold (copied) and a crew seat.
import { clamp, r3, settle } from "./util.js";
import { log } from "./chronicle.js";
import { SKILLS } from "./skills.js";
import { MAX_REL } from "./bonds.js";
import { refreshDerived } from "./population.js";
import { TRAITS, TRAIT_SOFT, makeName, ageDays, maturity, maxHp, fitness } from "./villager.js";

export const SPLIT_MIN = 2, SPLIT_MAX = 5;          // how many selves
export const SPLIT_LOSS = 0.10;                     // share of skill xp and hp lost in the split
export const SPLIT_JITTER = 0.15;                   // each share's weight is 1 +- this, then normalised (100 into 3 is about 30 each)
export const SPLIT_MUTATION = 0.05;                 // every quantity moves by up to +-5%, uniformly
export const SPLIT_FORGET = 0.15;                   // chance a clone loses any one memory or episode
// Who may split (the old clone gate, minus the once-per-life rule): an adult in their prime, roughly healthy, fed and rested.
export const SPLIT_GATE = { hp: 60, hunger: 0.5, energy: 0.4 };
// How many are likely to survive (best guesses; the user tunes balance):
export const SPLIT_HP_FLOOR = 20;                   // each clone needs at least this much hp (so 100 hp makes 4, 111+ makes 5, 67 makes 3)
export const SPLIT_AGE_FRAC = 0.3;                  // each clone's age share must be at least this fraction of maturity (about 30 days)
export const SPLIT_NEED_BASE = 0.45, SPLIT_NEED_STEP = 0.1;   // hunger and energy needed for N clones: 0.45 + 0.1 per clone past two (0.75 for five)

/** Why this slime cannot split, in 1-3 words ("" when it can). */
export function splitBlock(sim, v) {
  if (!v || v.kind !== "villager") return "Gone";
  const age = ageDays(sim, v);
  if (age < maturity(v)) return "Too young";
  if (age > v.prime) return "Too old";
  if (v.hp <= SPLIT_GATE.hp) return "Hurt";
  if (v.hunger <= SPLIT_GATE.hunger) return "Hungry";
  if (v.energy <= SPLIT_GATE.energy) return "Tired";
  return "";
}
export const canSplit = (sim, v) => splitBlock(sim, v) === "";

/** How many selves a split would make now: 0 when it cannot, else the largest of 5..2 whose clones would likely survive. */
export function splitCount(sim, v) {
  if (!canSplit(sim, v)) return 0;
  const age = ageDays(sim, v), minAge = SPLIT_AGE_FRAC * maturity(v), hp = v.hp * (1 - SPLIT_LOSS);
  for (let n = SPLIT_MAX; n > SPLIT_MIN; n--) {
    const need = SPLIT_NEED_BASE + SPLIT_NEED_STEP * (n - SPLIT_MIN);
    if (hp / n >= SPLIT_HP_FLOOR && age / n >= minAge && v.hunger >= need && v.energy >= need) return n;
  }
  return SPLIT_MIN;
}

const copy = (x) => JSON.parse(JSON.stringify(x));
const mut = (r, x) => x * (1 + (r.float() * 2 - 1) * SPLIT_MUTATION);
const trait = (r, k, x) => r3(settle(mut(r, x), 1, TRAIT_SOFT[k] ?? 0.5));
const unit = (r, x) => r3(clamp(mut(r, x), 0, 1));
/** n weights of 1 +- SPLIT_JITTER, normalised to add up to `total`. */
function shares(r, n, total) {
  const w = Array.from({ length: n }, () => 1 + (r.float() * 2 - 1) * SPLIT_JITTER), sum = w.reduce((a, b) => a + b, 0);
  return w.map(x => total * x / sum);
}
const list = (names) => names.length < 2 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];

/** Split v. Returns the clones (clone 1 first) or null when v cannot. */
export function splitSlime(sim, v) {
  const n = splitCount(sim, v);
  if (!n) return null;
  const r = sim.rng.stream("split"), old = v.id, now = sim.tick;
  const hp = shares(r, n, v.hp * (1 - SPLIT_LOSS));
  const lived = now - v.born, ageT = shares(r, n, lived).map(Math.round);
  ageT[n - 1] += lived - ageT.reduce((a, b) => a + b, 0);                 // the ages add up to the original's exactly
  const xp = {};
  for (const s of SKILLS) xp[s] = shares(r, n, v.sk[s].xp * (1 - SPLIT_LOSS));

  const clones = [];
  for (let i = 0; i < n; i++) {
    const c = copy(v), first = i === 0;
    delete c.id; delete c.kind;
    c.name = first ? v.name : makeName(r);
    for (const k of TRAITS) c.t[k] = trait(r, k, v.t[k]);
    if (c.g) for (const k of TRAITS) c.g[k] = [trait(r, k, v.g[k][0]), trait(r, k, v.g[k][1])];
    c.prime = Math.round(mut(r, v.prime));
    if (c.ps) for (const k of ["b", "c", "s"]) c.ps[k] = Math.round(clamp(mut(r, v.ps[k]), 0, 100));
    for (const k of ["hunger", "thirst", "energy", "warm", "mood"]) c[k] = unit(r, v[k]);
    c.hard = r3(Math.max(0, mut(r, v.hard || 0)));
    for (const k of Object.keys(c.fam || {})) c.fam[k] = unit(r, v.fam[k]);
    if (c.hb) c.hb.xp = r3(Math.max(0, mut(r, v.hb.xp)));
    c.mem = (v.mem || []).filter(() => !r.chance(SPLIT_FORGET)).map(m => [m[0], Math.round(clamp(mut(r, m[1]), 0, 1000)), Math.round(clamp(mut(r, m[2]), 0, 1000)), m[3], m[4]]);
    c.epi = (v.epi || []).filter(() => !r.chance(SPLIT_FORGET)).map(e => e.slice());
    c.born = now - ageT[i];
    for (const s of SKILLS) c.sk[s].xp = r3(xp[s][i]);
    if (!first) {                                  // the others start over: no job, no load, no bed, no partner, nothing held
      c.action = null; c.job = null; c.why = null; c.order = null; delete c.as; c.carry = null; c.pk = ""; c.eq = null; c.hl = null;
      c.bed = 0; c.mate = 0; c.tch = null; c.bad = []; c.rp = 0; c.rpt = 0; c.lf = null; c.ep = 0; c.cr = 0; c.rest = Math.min(c.rest || 0, 1);
      delete c.xp; delete c.br; delete c.poss; delete c.pin;
      c.rel = (c.rel || []).filter(q => q.k !== "partner");
    }
    const e = sim.ents.add("villager", c);
    refreshDerived(sim, e);
    e.hp = r3(clamp(hp[i], 1, maxHp(e, fitness(e, ageDays(sim, e)))));
    clones.push(e);
  }
  for (const e of clones) e.sp = v.sp || clones[0].id;           // a group label: selves of one slime are full siblings (people.js kinship)
  rewire(sim, v, clones);
  sim.ents.remove(old);
  sim.cache.iv++; sim.cache.kn = null;
  const ids = clones.map(e => e.id);
  log(sim, "MILESTONE", v.name + " split into " + list(clones.map(e => e.name)) + ".", ids, { split: n }, 1);
  sim.lastSplit = { from: old, to: ids, tick: now };            // for the UI to move its selection (not saved)
  return clones;
}

/** Every reference to `old` now points at a clone (clone 1 where only one thing can hold it, all of them for bonds). */
function rewire(sim, v, clones) {
  const old = v.id, c0 = clones[0], ids = clones.map(e => e.id);
  const one = (x) => (x === old ? c0.id : x);
  // what the old slime held
  for (const e of sim.ents.list) {
    if (e.kind === "villager") continue;
    for (const k of ["rv", "owner", "by", "dr"]) if (e[k] === old) e[k] = c0.id;
    if (e.kind === "fauna" && e.tg === old) e.tg = c0.id;
  }
  // what the others hold about it
  for (const o of sim.ents.ofKind("villager")) {
    if (ids.includes(o.id)) continue;
    if (o.mate === old) o.mate = c0.id;
    if (o.par) o.par = o.par.map(one);
    if (o.gp) o.gp = o.gp.map(one);
    if (o.tch && o.tch.p === old) o.tch.p = c0.id;
    if (o.gr && o.gr.f === old) o.gr.f = c0.id;
    for (const book of [o.aff, o.mn]) if (book && book[old] !== undefined) {
      for (const id of ids) book[id] = Array.isArray(book[old]) ? book[old].slice() : book[old];
      delete book[old];
    }
    if (o.rel && o.rel.some(q => q.o === old)) {
      const out = [];
      for (const q of o.rel) {
        if (q.o !== old) { out.push(q); continue; }
        for (const id of ids) if (q.k !== "partner" || id === c0.id) out.push({ ...q, o: id });
      }
      while (out.length > MAX_REL) { const j = out.map(q => ids.includes(q.o) && q.o !== c0.id).lastIndexOf(true); out.splice(j < 0 ? out.length - 1 : j, 1); }
      o.rel = out;
    }
  }
  // crews take every clone (an expedition crew only the first), expeditions the first
  for (const cw of sim.crews.list) {
    const i = cw.ids.indexOf(old);
    if (i < 0) continue;
    const all = !(cw.task && cw.task.t === "exp");
    cw.ids.splice(i, 1, ...(all ? ids : [c0.id]));
    if (all) for (const e of clones) e.cr = cw.id;
  }
  for (const x of sim.exp.list) x.ids = x.ids.map(one);
  // history
  for (const en of sim.chron.entries) if (en.a.includes(old)) en.a = en.a.flatMap(a => (a === old ? ids : [a]));
  for (const rec of Object.values(sim.chron.recs)) {
    if (rec.par) rec.par = rec.par.map(one);
    if (rec.kids) rec.kids = rec.kids.flatMap(k => (k === old ? ids : [k]));
  }
}
