// S10 husbandry (GDD §11.8, §15.7): capture a live hopper, keep it in a pen, feed it, breed it, slaughter the surplus.
//
//   HUSBANDRY is found by watching (phenomena.js): hoppers hunted often (fauna.js defeat), or hoppers drawn to a heap of grass in the stockpile (lureDaily).
//   A pen is a zone (farm.js) the villagers stake out with sticks (verb `stake`) before it holds anything.
//   A penned hopper is the S8 creature with tame=1, pen=<pen id> (fauna.js: it stays inside, never bolts). Orders: `capture` (catch + carry + release).
//   Grass hauled into the pen is eaten (FOD_PER_HEAD a day each); fed adult pairs breed (hopperDay with the pen's own rate), the unfed starve after FOD_HUNGRY days.
//   The pen's keep-N is the number of adults to keep: the surplus is slaughtered by a standing job (jobs.js genPens) for meat and a hide.
import { DAY } from "./clock.js";
import { NO_T } from "./util.js";
import { log, once } from "./chronicle.js";
import { dropLoose } from "./items.js";
import { sight } from "./discovery.js";
import { FAUNA, spawnFauna, hopperDay, HOPPER_LIFE, near1 } from "./fauna.js";
import { penCap, penById, FOD_PER_HEAD, FOD_HUNGRY } from "./farm.js";
import { can } from "./knowledge.js";
import { CAMP } from "./board.js";
import { survey } from "./items.js";

export const CATCH_P = 0.55;            // chance a hand on an adjacent hopper holds it (the rest bolt)
export const PEN_BREED = 0.3;           // chance per fed adult pair per day, scaled by room left in the pen
export const LURE_R = 10;               // a wild hopper this close to a heap of grass at the camp may be seen to stay (HUSBANDRY)
export const LURE_P = 0.15;             // per day, while grass is in the stockpile and a hopper is near
export const LURE_GRASS = 4;

export const penHoppers = (sim, pen) => sim.ents.ofKind("fauna").filter(e => e.sp === "hopper" && e.tame && e.pen === pen.id);
// S14: a grazer is penned like a hopper but takes the room of GRAZER_LOAD hoppers (and eats as much), and only a big pen (GRAZER_PEN_CELLS) will hold one
export const GRAZER_LOAD = 3, GRAZER_PEN_CELLS = 12;
export const penGrazers = (sim, pen) => sim.ents.ofKind("fauna").filter(e => e.sp === "grazer" && e.tame && e.pen === pen.id);
export const penAnimals = (sim, pen) => sim.ents.ofKind("fauna").filter(e => e.tame && e.pen === pen.id);
export const penLoad = (sim, pen) => penHoppers(sim, pen).length + GRAZER_LOAD * penGrazers(sim, pen).length;
export const penArea = (p) => (p.x1 - p.x0 + 1) * (p.y1 - p.y0 + 1);
export const adultsOf = (sim, list) => list.filter(e => Math.floor((sim.tick - e.bd) / DAY) >= HOPPER_LIFE.adult);
/** A finished pen with room for another, nearest to (x,y); null when there is none. */
export function openPen(sim, x, y, sp = "hopper") {
  let best = null, bd = 1e9;
  const w = sp === "grazer" ? GRAZER_LOAD : 1;
  for (const p of sim.farm.pens) {
    if (!p.built || penLoad(sim, p) + w > penCap(p) || (sp === "grazer" && penArea(p) < GRAZER_PEN_CELLS)) continue;
    const d = Math.abs(p.g[0] - x) + Math.abs(p.g[1] - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/** One try to hold the adjacent hopper `e` (verb `catch`). -> "done" (held) | "more" (slipped, still beside it) | "TOO_FAR" (it bolted). */
export function catchTry(sim, v, e) {
  if (!near1(v, e)) return "TOO_FAR";
  const big = e.sp === "grazer";
  if (sim.rng.stream("catch").float() < (big ? CATCH_P * 0.6 : CATCH_P)) {
    e.st = "held"; e.by = v.id; e.n = 0; e.rv = 0;
    sim.farm.caught++;
    return "done";
  }
  if (big) { e.st = "turn"; e.tg = v.id; e.tu = sim.tick + 250; e.cd = 2; return "TOO_FAR"; }      // S14: a grazer that is grabbed and slips free turns on whoever grabbed it
  e.st = "flee"; e.n = FAUNA.hopper.flee.steps; e.cd = 1;                // it slips the hand and bolts; the job follows
  return "TOO_FAR";
}

/** The villager reaches the pen with the held hopper: it goes in and stays (verb `release`). -> null | blocker */
export function releaseIn(sim, v, pid) {
  const pen = penById(sim, pid), e = sim.ents.ofKind("fauna").find(q => q.st === "held" && q.by === v.id);
  if (!e) return "GONE";
  if (!pen || !pen.built) { e.st = "idle"; e.by = 0; return "NO_PEN"; }
  let at = null;
  for (let y = pen.y0; y <= pen.y1 && !at; y++) for (let x = pen.x0; x <= pen.x1; x++) if (sim.world.isWalkable(x, y, pen.z) && !sim.ents.at(x, y, pen.z).some(id => sim.ents.get(id).kind === "fauna")) { at = [x, y, pen.z]; break; }
  if (!at) at = [pen.g[0], pen.g[1], pen.z];
  sim.ents.move(e, at[0], at[1], at[2]);
  e.tame = 1; e.pen = pen.id; e.st = "idle"; e.by = 0; e.tx = NO_T; e.cd = 20; e.home = at.slice();
  sim.cache.iv++;
  once(sim, "firstPenned", "MILESTONE", v.name + " put the first " + FAUNA[e.sp].label + " in a pen.", [v.id], {}, 2);
  return null;
}

/** Skin and cut a penned hopper (verb `slaughter`): meat and a hide drop at its cell. */
export function butcher(sim, v, e) {
  const row = FAUNA[e.sp];
  dropLoose(sim, "hopper_meat", row.meat, e.x, e.y, e.z);
  dropLoose(sim, "hide", row.hide || 1, e.x, e.y, e.z);
  if (row.bone) dropLoose(sim, "bone", row.bone, e.x, e.y, e.z);
  sight(sim, "HIDE_WORKING", "skin", e.x, e.y, e.z, v);
  sim.ents.remove(e.id);
  sim.cache.iv++;
  once(sim, "firstSlaughter", "MILESTONE", v.name + " slaughtered the first penned " + row.label + ": meat and a hide.", [v.id], {}, 1);
}

/** The adult in a pen to slaughter next: the oldest, only while the adults outnumber the pen's keep-N. */
export function slaughterTarget(sim, pen) {
  const all = adultsOf(sim, penAnimals(sim, pen)), ad = all.filter(e => !e.rv || !sim.ents.get(e.rv));
  if (ad.length <= pen.keep) return null;                          // (S16: the ones already being slaughtered count as gone, so two hands never take the herd below the keep-N together)
  ad.sort((a, b) => a.bd - b.bd || a.id - b.id);
  return ad[0] || null;
}

/** Stake out the fence (verb `stake`): the carried sticks go into the pen; when all are in, the pen is built. */
export function stake(sim, v, pen, n) {
  pen.got = Math.min(pen.need, pen.got + n);
  if (pen.got >= pen.need && !pen.built) {
    pen.built = 1;
    once(sim, "firstPen", "BUILT_FIRST", v.name + " staked out the first hopper pen.", [v.id], {}, 1);
  }
  sim.cache.iv++; sim.board.ep++;
}

/** Once a day, per pen: fodder is eaten (and the unfed starve), fed pairs breed, the old die. Then the wild route to HUSBANDRY (a heap of grass draws hoppers). */
export function penDaily(sim) {
  const r = sim.rng.stream("pen");
  for (const pen of sim.farm.pens) {
    if (!pen.built) continue;
    const hs = penHoppers(sim, pen), load = penLoad(sim, pen);
    if (!load) { pen.hg = 0; continue; }
    pen.fc += load * FOD_PER_HEAD;
    let hungry = false;
    while (pen.fc >= 1) { pen.fc -= 1; if (pen.fod > 0) pen.fod--; else hungry = true; }
    pen.hg = hungry ? pen.hg + 1 : 0;
    if (pen.hg >= FOD_HUNGRY) {                                                // nobody fed them: the weakest starves
      const e = (hs.length ? hs : penGrazers(sim, pen)).slice().sort((a, b) => b.bd - a.bd || a.id - b.id)[0];
      sim.ents.remove(e.id); sim.cache.iv++;
      log(sim, "MILESTONE", "A penned animal starved: the pen ran out of grass.", [], { pen: pen.id }, 1);
      continue;
    }
    const cap = Math.max(1, penCap(pen) - (load - hs.length)), res = hopperDay(hs.map(e => Math.floor((sim.tick - e.bd) / DAY)), cap, () => r.float(), { breed: pen.hg === 0 && pen.fod > 0 ? PEN_BREED : 0, edge: false });
    for (const i of res.die) sim.ents.remove(hs[i].id);
    for (let k = 0; k < res.born; k++) {
      const c = [pen.x0 + r.int(pen.x1 - pen.x0 + 1), pen.y0 + r.int(pen.y1 - pen.y0 + 1), pen.z];
      const b = spawnFauna(sim, "hopper", c[0], c[1], c[2]);
      b.tame = 1; b.pen = pen.id; b.home = c.slice();
      once(sim, "firstFoal", "MILESTONE", "The first hopper was born in a pen.", [], {}, 1);
    }
    sim.cache.iv++;
  }
  lureDaily(sim);
}

/** Wild route to HUSBANDRY: grass piled in the stockpile and a wild hopper nearby, day after day; whoever sees it stay may understand. */
function lureDaily(sim) {
  if (can(sim, "HUSBANDRY")) return;
  if (survey(sim).stock.grass < LURE_GRASS) return;
  const c = CAMP(sim.stock);
  const h = sim.ents.ofKind("fauna").find(e => e.sp === "hopper" && !e.tame && Math.max(Math.abs(e.x - c.x), Math.abs(e.y - c.y)) <= LURE_R);
  if (h && sim.rng.stream("lure").float() < LURE_P) sight(sim, "HUSBANDRY", "lure", h.x, h.y, h.z, null);
}
