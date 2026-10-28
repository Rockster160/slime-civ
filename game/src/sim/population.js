// Founding, birth and death (GDD §08, §11.16, §18). Pairing is slime-village's
// simple "want a child, find a partner" (game.js bearChild + breed cooldown),
// weighted by food runway and free beds and never hard-gated.
import { DAY } from "./clock.js";
import { SITE } from "./worldgen.js";
import { clamp } from "./util.js";
import { seasonIdx } from "./season.js";
import { cancelAction } from "./jobstate.js";
import { newSkills } from "./skills.js";
import { survey, dropLoose, storeInZone } from "./items.js";
import { village } from "./board.js";
import { log } from "./chronicle.js";
import {
  TRAITS, FOUNDER_RANGE, LIFE_DAYS, makeName, rollRange, villagerProps, inheritTraits, inheritHue,
  ageDays, maturity, fitness, maxHp, stepTicks, dailyNeed, pace, isAdult, lifeStage,
} from "./villager.js";

export const BREED_P = 0.025;            // per eligible adult per day, before weights
export const BREED_COOLDOWN = 45;        // days * lifePace / fertility (slime-village BREED_COOLDOWN shape)
const SEASON_BREED = [1.2, 1.3, 0.9, 0.6];   // mean 1.00 (§11.7 mean-normalised rule)

/** A founder-style villager at (x,y,z). ageFrac in 0..1 of a life; lin picks the lineage hue. */
export function addFounder(sim, x, y, z, lin, hueBase, ageFrac) {
  const r = sim.rng.stream("founders");
  const t = {};
  for (const k of TRAITS) t[k] = rollRange(r, FOUNDER_RANGE[k]);
  const hue = Math.round((hueBase + lin * 120 + (r.float() * 2 - 1) * 14 + 360) % 360);
  const prime = Math.round(LIFE_DAYS * (0.4 + 0.3 * r.float()) * t.longevity);
  const e = sim.ents.add("villager", villagerProps(x, y, z, {
    name: makeName(r), hue, lin, par: [0, 0], gen: 1, t, born: -Math.round(ageFrac * LIFE_DAYS * DAY), prime,
    hunger: 0.8 + 0.15 * r.float(), thirst: 0.8 + 0.15 * r.float(), energy: 0.8 + 0.15 * r.float(), sk: newSkills(r),
  }));
  refreshDerived(sim, e);
  return e;
}

export function refreshDerived(sim, v) {
  const fit = fitness(v, ageDays(sim, v));
  v.mv = stepTicks(v, fit);
  if (v.hp === 100) v.hp = Math.round(maxHp(v, fit));      // fresh villagers start at full health
}

/** §11.16: 7 adults (6-8) of mixed age from 3 lineages, one bonded pair, 3 days of food in a pile. */
export function foundColony(sim, n) {
  const r = sim.rng.stream("founders");
  const hueBase = r.int(360);
  for (let i = 0; i < n; i++) {
    let placed = false;
    for (let tries = 0; tries < 200 && !placed; tries++) {
      const px = SITE.x + r.range(-5, 5), py = SITE.y + r.range(-5, 5), pz = sim.world.standZ(px, py);
      if (pz < 0) continue;
      addFounder(sim, px, py, pz, i % 3, hueBase, 0.25 + 0.45 * r.float());
      placed = true;
    }
  }
  const vs = sim.ents.ofKind("villager");
  if (vs.length >= 2) { vs[0].mate = vs[1].id; vs[1].mate = vs[0].id; vs[0].lin = vs[1].lin = 0; }
  // 3 rations/head of food in the starting pile (fresh berries; they spoil, so they get eaten first).
  storeInZone(sim, "berry", 3 * n);
}

export function spawnChild(sim, a, b) {
  const r = sim.rng.stream("birth");
  const t = inheritTraits(r, a, b);
  const prime = Math.round(LIFE_DAYS * (0.4 + 0.3 * r.float()) * t.longevity);
  const e = sim.ents.add("villager", villagerProps(a.x, a.y, a.z, {
    name: makeName(r), hue: inheritHue(r, a, b), lin: a.lin, par: [a.id, b.id], gen: Math.max(a.gen, b.gen) + 1, t, born: sim.tick, prime,
    hunger: 0.9, thirst: 0.9, energy: 0.9, sk: newSkills(r),
  }));
  e.sk.gather.xp = 0;             // children start with no experience
  refreshDerived(sim, e);
  log(sim, "BIRTH", e.name + " was born to " + a.name + " and " + b.name + ".", [e.id, a.id, b.id], {}, 1);
  return e;
}

function eligible(sim, v) {
  const age = ageDays(sim, v);
  return age >= maturity(v) && v.cd <= sim.tick && fitness(v, age) > 0.45 && v.hp > 40 && v.hunger > 0.35;
}

/** Once a day: maybe pair adults and bear children. Weighted by food and beds, never gated (§08). */
export function breedDaily(sim, foodFrac, beds) {
  const r = sim.rng.stream("breed");
  const vs = sim.ents.ofKind("villager");
  const n = vs.length;
  if (n === 0) return;
  const foodW = clamp(foodFrac, 0.05, 1);
  const bedW = 0.4 + 0.6 * clamp(beds / n, 0, 1);
  const seasonW = SEASON_BREED[seasonIdx(sim.tick)];
  const pool = vs.filter(v => eligible(sim, v));
  const used = new Set();
  for (const a of pool) {
    if (used.has(a.id) || a.cd > sim.tick) continue;
    if (!r.chance(BREED_P * foodW * bedW * seasonW * a.t.fertility)) continue;
    let b = pool.find(o => o.id === a.mate && !used.has(o.id));
    if (!b) {
      const others = pool.filter(o => o !== a && !used.has(o.id));
      if (!others.length) continue;
      b = others[r.int(others.length)];
    }
    used.add(a.id); used.add(b.id);
    spawnChild(sim, a, b);
    for (const p of [a, b]) {
      p.cd = sim.tick + Math.round(BREED_COOLDOWN * DAY * pace(p) / Math.max(0.4, p.t.fertility));
      p.energy = Math.max(0, p.energy - 0.2); p.hunger = Math.max(0.05, p.hunger - 0.1);
    }
    a.mate = b.id; b.mate = a.id;
  }
}

/** Death: drop the load, release claims, write the record (§18). */
export function kill(sim, v, cause) {
  cancelAction(sim, v);
  if (v.carry) dropLoose(sim, v.carry.item, v.carry.n, v.x, v.y, v.z);
  if (v.bed) { const b = sim.ents.get(v.bed); if (b) b.owner = 0; }
  for (const o of sim.ents.ofKind("villager")) if (o.mate === v.id) o.mate = 0;
  const age = ageDays(sim, v);
  const kids = sim.ents.ofKind("villager").filter(o => o.par[0] === v.id || o.par[1] === v.id).map(o => o.id);
  sim.chron.recs[v.id] = {
    id: v.id, name: v.name, hue: v.hue, par: v.par, gen: v.gen, birth: v.born, death: sim.tick, cause,
    age: Math.round(age), stage: lifeStage(sim, v), kids,
  };
  // Context at death (S4a): enough for the UI to say why, e.g. "died of cold - slept outside; 3 beds for 7".
  const room = sim.rooms.at(v.x, v.y, v.z), vl = village(sim);
  const ctx = { sheltered: !!(room && room.enclosed), warm: Math.round(v.warm * 100) / 100, beds: vl.beds.length, pop: vl.n, runway: sim.board.runway, rest: v.rest, bed: v.bed ? 1 : 0 };
  sim.chron.recs[v.id].ctx = ctx;
  log(sim, "DEATH", v.name + " (generation " + v.gen + ") died of " + cause + ", aged " + (age / 100).toFixed(1) + " years" + deathContext(cause, ctx) + ".",
    [v.id], { cause, ctx }, cause === "old age" ? 1 : 2);
  sim.ents.remove(v.id);
  sim.cache.iv++;
}

/** The "why" after a death, in plain words. */
export function deathContext(cause, c) {
  if (cause === "old age") return "";
  const beds = c.beds + (c.beds === 1 ? " bed" : " beds") + " for " + c.pop;
  if (cause === "cold") return " - " + (c.sheltered ? "was in a warm room but still froze" : c.rest ? (c.bed ? "slept in a leaf bed outside" : "slept outside") : "was caught out in the cold") + "; " + beds;
  if (cause === "starvation") return " - the stockpile held " + (c.runway >= 99 ? "plenty" : c.runway.toFixed(1) + " days of food per head");
  return " - " + beds;
}

export function runway(sim) {
  const s = survey(sim);
  let need = 0;
  for (const v of sim.ents.ofKind("villager")) need += dailyNeed(sim, v);
  return need > 0 ? s.rations / need : 99;
}
