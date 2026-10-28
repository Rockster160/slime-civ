// Plants are entities {kind:"plant", species, x,y,z, yield, nx, rv, rt, bt, gr}.
//   berry   : bush. yield 0..cap by stage; regrows 1 per BERRY_REGROW in spring-autumn; frost strips it in winter (§11.17)
//   tuber   : S6 root plant, yield 0..3 rations; dug (any season), refills after TUBER_REGROW
//   tuft    : grass tuft, yield 1 -> 0 when cut, regrows after TUFT_REGROW (leaf-bed material)
//   tree    : sets F.OBSTACLE on its cell; felled -> a stump (fl=1), which sprouts into a sapling or rots away
//   sapling : a tree on the way back (also a seedling dropped by a mature tree)
//   stump   : S7a, a tree that burned down (lightning): walkable, charred, becomes a sapling after STUMP_REGROW (burn=1 on a tree that is alight)
// rv/rt are the reservation (holder villager id, last-progress tick); see jobs.js.
//
// S10, the plant lifecycle (GDD §11.8): seedling -> growth -> fruit -> seed -> wither.
//   bt  birth tick (existing plants get one lazily, spread over their lifespan by a hash of their id, so a loaded old save is not one cohort)
//   gr  days of growth: counts only in the growing seasons (spring and summer full, autumn half, winter none)
//   Every plant ages; past its lifespan it withers (a tree falls and is gone). Mature plants drop seed in their season, next to themselves,
//   as long as the neighbourhood and the whole map are under their density caps; a little wind-blown seed rain keeps a stripped map from staying
//   bare. The caps are the map's own initial counts (+/- a band), so it neither fills nor empties. floraDaily() is the whole of it and
//   needs only {tick, ents, rng, world.standZ/mat/flags/setFlags, stock, farm.pens} - tests/flora.js drives it over a long window with a stub sim.
import { DAY } from "./clock.js";
import { F, M } from "./world.js";
import { berrySeason, seasonIdx } from "./season.js";
import { mix32 } from "./rng.js";

export const BERRY_MAX = 4;
export const BERRY_REGROW = Math.floor(DAY * 1.5);   // ticks per berry regrown
export const TUFT_REGROW = DAY * 8;
export const ROOT_REGROW = DAY * 4;                  // a dug-over patch recovers faster than a cut tuft: roots are the winter larder
export const TUBER_REGROW = DAY * 6;                 // a dug-over tuber patch refills (any season: they live under the frost)
export const TUBER_YIELD = 3;
export const STUMP_REGROW = DAY * 12;                // a burnt or felled stump sprouts again
export const STUMP_ROT = DAY * 30;                   // a felled stump that did not sprout rots away after this
export const SPROUT_PCT = 60;                        // % of felled stumps that coppice into a sapling (the rest rot)
export const TREE_REGROW = DAY * 25;                 // "slowly": a quarter of a year

/** Lifespan in days by species, and the stage thresholds in growth days (best guesses; the user tunes). */
export const LIFE = { berry: 70, tuft: 50, tuber: 110, tree: 350 };
export const SEEDLING_DAYS = 4, YOUNG_DAYS = 9;      // berry: no fruit before 4 growth days, 2 berries until 9, then the full crop; old bushes (past 80% of life) give 2 again
export const GROW_BY_SEASON = [1, 1, 0.5, 0];        // growth days per calendar day: spring, summer, autumn, winter
export const SEED_SEASON = { berry: [0, 2], tuft: [0, 2], tuber: [0, 2], tree: [1, 2] };   // the seasons (0 spring .. 3 winter) each species drops seed in: first..last
export const SEED_RATE = { berry: 0.04, tuft: 0.08, tuber: 0.02, tree: 0.012 };   // per mature plant per day in those seasons
export const SEED_REACH = { berry: 3, tuft: 2, tuber: 3, tree: 4 };               // cells a seed carries
export const LOCAL_MAX = { berry: 4, tuft: 7, tuber: 3, tree: 6 };                // plants of the species allowed in the 7x7 around a seedling
export const CAP_BAND = 1.2;                         // a species' map cap is its initial count x this
export const RAIN_PER_DAY = 0.004;                   // wind-blown seed: expected new seedlings per day per cap, while the species is under half its cap
export const REGION_R = 62;                          // S16: the 'map' the flora caps and seed rain mean is the 125-cell window round the camp (the land is endless)
export const CLEAR_R = 6;                            // no seedlings this close to the camp (the clearing stays a clearing)

export function newPlant(ents, species, x, y, z) {
  const yield_ = species === "tree" ? 4 : species === "berry" ? BERRY_MAX : species === "tuft" ? 1 : species === "tuber" ? TUBER_YIELD : 0;
  return ents.add("plant", { species, x, y, z, yield: yield_, nx: 0, rv: 0, rt: 0 });
}

const speciesOf = (p) => (p.species === "sapling" ? "tree" : p.species);
/** The plant's lifespan in days: the species' base, +/- 50% by a hash of its id (wide, so a cohort does not die together) (a stable per-plant draw). */
export const lifeOf = (p) => { const sp = speciesOf(p); return LIFE[sp] ? Math.floor(LIFE[sp] * (0.5 + 1.0 * (mix32(p.id, 91) / 4294967296))) : 0; };
export const ageOf = (sim, p) => Math.max(0, Math.floor((sim.tick - (p.bt || 0)) / DAY));

/** Give an old-save plant its birth tick and growth, spread so that ages are mixed. */
export function initLife(sim, p) {
  if (p.bt !== undefined) return;
  if (p.species === "sapling") { p.bt = sim.tick; p.gr = 0; return; }
  const life = lifeOf(p) || 1, age = Math.floor((mix32(p.id, 77) / 4294967296) * 0.7 * life);
  p.bt = sim.tick - age * DAY;
  p.gr = age + 12;
}

/** The development stage of a plant: seedling | young | mature | old. */
export function stageOf(sim, p) {
  const sp = speciesOf(p);
  if (p.species === "sapling") return "seedling";
  const gr = p.gr === undefined ? 99 : p.gr, life = lifeOf(p) || 1;
  if (ageOf(sim, p) > 0.8 * life) return "old";
  if (sp === "berry") return gr < SEEDLING_DAYS ? "seedling" : gr < YOUNG_DAYS ? "young" : "mature";
  return gr < 3 ? "seedling" : "mature";
}
/** How many berries a bush at this stage can hold. */
export const berryCap = (stage) => (stage === "seedling" ? 0 : stage === "young" || stage === "old" ? 2 : BERRY_MAX);

/** Every 100 ticks: regrow berries/tufts, mature saplings, sprout or rot stumps. Iterates in id order. */
export function growPlants(sim) {
  const t = sim.tick, season = berrySeason(t), winter = seasonIdx(t) === 3;
  const plants = sim.ents.ofKind("plant");
  for (let i = 0; i < plants.length; i++) {
    const p = plants[i];
    if (p.species === "berry") {
      initLife(sim, p);
      const cap = berryCap(stageOf(sim, p));
      if (p.yield < cap && season && t >= p.nx) { p.yield++; p.nx = t + BERRY_REGROW; }
      else if (p.yield > cap) p.yield = cap;
    } else if (p.species === "tuft") {
      if (p.yield === 0 && t >= p.nx) p.yield = 1;
    } else if (p.species === "tuber") {
      if (p.yield < TUBER_YIELD && t >= p.nx) { p.yield = TUBER_YIELD; p.nx = t; }
    } else if (p.species === "stump") {
      if (p.burn || winter || t < p.nx) continue;
      if (p.fl && mix32(p.id, p.nx) % 100 >= SPROUT_PCT) {              // a felled stump: some coppice, the rest rot (the cell is bare for good)
        if (t >= p.nx + STUMP_ROT - STUMP_REGROW) { sim.ents.remove(p.id); i--; }
        continue;
      }
      p.species = "sapling"; p.fl = 0; p.nx = t + TREE_REGROW / 2; p.gr = 0; p.bt = t;
    } else if (p.species === "sapling") {
      if (t >= p.nx && !winter) {
        const here = sim.ents.at(p.x, p.y, p.z);
        let free = true;
        for (const id of here) if (id !== p.id) { free = false; break; }   // an item/villager on the cell: try later
        if (free) {
          p.species = "tree"; p.yield = 4;
          sim.world.setFlags(p.x, p.y, p.z, sim.world.flags(p.x, p.y, p.z) | F.OBSTACLE);
        } else p.nx = t + DAY;
      }
    }
  }
}

/** First tick of winter: frost takes whatever fruit is left (§11.7 winter effects). */
export function frostBerries(sim) {
  for (const p of sim.ents.ofKind("plant")) if (p.species === "berry") { p.yield = 0; p.nx = 0; }
}

/** Fell a tree: a stump is left, walkable again. It sprouts into a sapling after STUMP_REGROW or, for some, rots (growPlants). */
export function fellTree(sim, p) {
  p.species = "stump"; p.fl = 1; p.yield = 0; p.nx = sim.tick + STUMP_REGROW; p.rv = 0; p.gr = 0;
  sim.world.setFlags(p.x, p.y, p.z, sim.world.flags(p.x, p.y, p.z) & ~F.OBSTACLE);
}

/** A burning tree has burned down: a charred stump, walkable again (S7a, GDD §11.8). */
export function burnDown(sim, p) {
  p.species = "stump"; p.fl = 0; p.yield = 0; p.burn = 0; p.rv = 0; p.nx = sim.tick + STUMP_REGROW;
  sim.world.setFlags(p.x, p.y, p.z, sim.world.flags(p.x, p.y, p.z) & ~F.OBSTACLE);
}

// ---- the daily lifecycle (S10) ---------------------------------------------------------------------------------------------

/** Counts per species (a sapling counts as a tree, a stump does not count: it is not a plant yet). */
export function floraCounts(sim) {
  const c = { berry: 0, tuft: 0, tuber: 0, tree: 0 }, cp = sim.site || { x: 0, y: 0 };
  for (const p of sim.ents.ofKind("plant")) {
    if (Math.abs(p.x - cp.x) > REGION_R || Math.abs(p.y - cp.y) > REGION_R) continue;          // S16: per region, not the whole (endless) world
    const sp = speciesOf(p); if (c[sp] !== undefined && p.species !== "stump") c[sp]++;
  }
  return c;
}
/** The map caps, fixed the first time they are asked for from the counts of that moment (saved in sim.wild.fc). */
export function floraCaps(sim) {
  const w = sim.wild;
  if (!w.fc) { const c = floraCounts(sim); w.fc = { berry: Math.ceil(c.berry * CAP_BAND), tuft: Math.ceil(c.tuft * CAP_BAND), tuber: Math.ceil(c.tuber * CAP_BAND), tree: Math.ceil(c.tree * CAP_BAND) }; }
  return w.fc;
}

const pens = (sim) => (sim.farm && sim.farm.pens) || [];
/** Can a seedling take root at (x,y)? Grass with nothing on it, off the clearing, the fields and the pens. -> stand z or -1 */
function seedCell(sim, x, y, camp) {
  const w = sim.world, z = w.standZ(x, y);
  if (z < 0 || w.mat(x, y, z - 1) !== M.GRASS || sim.ents.at(x, y, z).length || (w.activeAt && !w.activeAt(x, y))) return -1;
  if (camp && Math.abs(x - camp.x) <= CLEAR_R && Math.abs(y - camp.y) <= CLEAR_R) return -1;
  for (const pn of pens(sim)) if (x >= pn.x0 && x <= pn.x1 && y >= pn.y0 && y <= pn.y1) return -1;
  return z;
}
/** Plants of `sp` in the 7x7 round (x,y), counting the one at the centre. */
function localCount(sim, sp, x, y, z) {
  let n = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const ids = sim.ents.at(x + dx, y + dy, z);
    for (let i = 0; i < ids.length; i++) { const e = sim.ents.get(ids[i]); if (e.kind === "plant" && speciesOf(e) === sp && e.species !== "stump") n++; }
  }
  return n;
}
/** Drop one seedling of `sp` near (x,y) (reach r, or anywhere on the map when r = 0 and `x` is null). -> the new plant or null */
function sprout(sim, sp, x, y, r, rs, camp) {
  for (let tries = 0; tries < 4; tries++) {
    const cx = x === null ? (camp ? camp.x : 0) + rs.range(-REGION_R, REGION_R) : x + rs.range(-r, r), cy = y === null ? (camp ? camp.y : 0) + rs.range(-REGION_R, REGION_R) : y + rs.range(-r, r);        // S16: wind-blown seed lands within the 125-cell window round the camp (the land is endless)
    const z = seedCell(sim, cx, cy, camp);
    if (z < 0 || localCount(sim, sp, cx, cy, z) >= LOCAL_MAX[sp]) continue;
    const species = sp === "tree" ? "sapling" : sp;
    const p = sim.ents.add("plant", { species, x: cx, y: cy, z, yield: 0, nx: sim.tick + (sp === "tree" ? TREE_REGROW / 2 : sp === "berry" ? BERRY_REGROW : 0), rv: 0, rt: 0, bt: sim.tick, gr: 0 });
    if (sp === "tuft") p.yield = 1;
    if (sp === "tuber") { p.yield = 0; p.nx = sim.tick + TUBER_REGROW; }
    return p;
  }
  return null;
}

/**
 * Once a day (sim.daily): everything ages and grows; the withered go; mature plants seed in their season; wind-blown seed keeps the map from
 * staying bare. Randomness is the named stream "flora.life", drawn in plant id order, so it replays exactly.
 */
const liveAt = (sim, p) => {            // S16: a plant lives its daily life if people are about (its chunk is within reach of an anchor) AND it is in the camp's region; the far land does not seed or wither, so wandering never leaves a trail of changed (unloadable-never) chunks
  const cp = sim.site || { x: 0, y: 0 };
  if (Math.abs(p.x - cp.x) > REGION_R + 8 || Math.abs(p.y - cp.y) > REGION_R + 8) return false;
  const c = sim.world.peekResident(p.x >> 4, p.y >> 4);
  return !!c && c.last >= sim.tick - 400;
};
export function floraDaily(sim, camp) {
  const t = sim.tick, s = seasonIdx(t), rs = sim.rng.stream("flora.life"), caps = floraCaps(sim);
  const counts = floraCounts(sim);
  const plants = sim.ents.ofKind("plant").slice();
  for (const p of plants) {
    if (p.burn || p.species === "stump") continue;
    if (sim.world.peekResident && !liveAt(sim, p)) continue;                  // S16: plants age where people are about (a chunk within reach of an anchor); the far land waits (S17 dormancy)
    initLife(sim, p);
    p.gr = (p.gr || 0) + GROW_BY_SEASON[s];
    const sp = speciesOf(p), life = lifeOf(p);
    if (!life) continue;
    const age = ageOf(sim, p);
    if (age > life && !p.rv) {                                   // withered (a plant someone is working is left for a day)
      if (p.species === "tree") sim.world.setFlags(p.x, p.y, p.z, sim.world.flags(p.x, p.y, p.z) & ~F.OBSTACLE);
      sim.ents.remove(p.id); counts[sp]--;
      continue;
    }
    if (s >= SEED_SEASON[sp][0] && s <= SEED_SEASON[sp][1] && p.species !== "sapling" && stageOf(sim, p) === "mature" && counts[sp] < caps[sp] && rs.float() < SEED_RATE[sp]) {
      if (sprout(sim, sp, p.x, p.y, SEED_REACH[sp], rs, camp)) counts[sp]++;
    }
  }
  if (s !== 3) for (const sp of ["berry", "tuft", "tuber", "tree"]) {              // seed rain: the stripped map is re-sown from the wind
    if (counts[sp] >= caps[sp] * 0.5) continue;
    for (let k = Math.ceil(caps[sp] * RAIN_PER_DAY); k > 0; k--) if (sprout(sim, sp, null, null, 0, rs, camp)) counts[sp]++;
  }
}
