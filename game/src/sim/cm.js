// The core itself (7.23). A labyrinth's guardian is the last thing between a village and the core; when it falls the player decides: HARVEST the core or LEAVE it.
//
//   sim.cm = {n, pend: [core key...], left: [key...], gone: [[key, tick]...], known: [key...]}      (saved and hashed; a key is "x,y" of the core, the guardian's `ck`)
//     known  a villager has stood in this core's labyrinth (the minimap draws its explored outline; the first one in it is a deed)
//     pend   the guardian is slain and the choice has not been made: the UI offers two buttons until it is
//     left   the player left the core as it is (it keeps its rich ores and its spawns for good; a core is only ever offered once)
//     gone   the core was harvested at that tick: its cell is open air, a large one-time haul of core shards went into the stockpile, and its mana field fades to nothing over
//            FADE_TICKS (a flat tick duration, core.js fadeMana), so spawns, danger bands and cache richness fall. OD-47: a harvested core is gone for good (it never regrows elsewhere).
// The field is a pure function of (seed, coordinates) plus this ledger: sim.def is the sim's own view of the world definition and carries the harvest ticks (core.js ownDef).
// Ore already in the rock stays (terrain is regrown from the seed, so it cannot depend on a game clock); what falls is everything that reads the live field.
import { coresNear, goCore } from "./core.js";
import { M, F } from "./world.js";
import { once, log } from "./chronicle.js";
import { storeInZone, dropLoose } from "./items.js";

export const HARVEST_SHARDS = 24;          // the one-time haul (ordinary core shards; a guardian drops 3-5, a cache 1-2)
export const CHOICES = { harvest: "Harvest", leave: "Leave" };          // the two labels the player sees

export function newCm() { return { n: 0, pend: [], left: [], gone: [], known: [] }; }

/** The core with this key near the camp or anywhere the sim has chunks: {x, y, z, ...} or null. */
export function coreByKey(sim, key) {
  const [x, y] = key.split(",").map(Number);
  return coresNear(sim.def, x, y, x, y, 0).find(c => c.x === x && c.y === y) || null;
}
const DIRS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
/** "the north ridge": the compass side of the camp a core lies on, for the chronicle. */
export function coreName(sim, c) {
  const dx = c.x - sim.site.x, dy = c.y - sim.site.y;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  let k;
  if (ay * 5 < ax * 2) k = dx > 0 ? 0 : 4;                 // mostly along x
  else if (ax * 5 < ay * 2) k = dy > 0 ? 2 : 6;             // mostly along y (y grows southward on the map)
  else k = dx > 0 ? (dy > 0 ? 1 : 7) : (dy > 0 ? 3 : 5);
  return "the " + DIRS[k] + " ridge";
}
/** Somebody is in this core's labyrinth for the first time. */
export function noteKnown(sim, key) { if (!sim.cm.known) sim.cm.known = []; if (!sim.cm.known.includes(key)) { sim.cm.known.push(key); sim.cm.n++; } }
export const isGone = (sim, key) => sim.cm.gone.some(g => g[0] === key);
export const isPending = (sim, key) => sim.cm.pend.includes(key);

/** The guardian of core `key` was killed by `att` (monsters.js monsterDrops): the deed, and the choice. */
export function guardianSlain(sim, key, att) {
  const c = coreByKey(sim, key), who = att && att.kind === "villager" ? att.name + (att.poss ? ", guided," : "") : "Something";
  once(sim, "guardian:" + key, "MILESTONE", (att && att.kind === "villager" ? who + " slew" : "Someone slew") + " the guardian of " + (c ? coreName(sim, c) : "a core") + ".", att && att.kind === "villager" ? [att.id] : [], { core: key }, 2);
  if (!sim.cm.pend.includes(key) && !sim.cm.left.includes(key) && !isGone(sim, key)) { sim.cm.pend.push(key); sim.cm.n++; }
}

/** The shape of the prompt: [{key, name, x, y, z}] for each core waiting on a choice. */
export function pending(sim) { return sim.cm.pend.map(k => { const c = coreByKey(sim, k); return { key: k, name: c ? coreName(sim, c) : "a core", x: c ? c.x : 0, y: c ? c.y : 0, z: c ? c.z : 0 }; }); }

/** Harvest: the cell opens, the shards come home, the field starts to fade, the chronicle records it. */
export function harvest(sim, key) {
  const c = coreByKey(sim, key);
  if (!c || !sim.cm.pend.includes(key)) return false;
  sim.cm.pend = sim.cm.pend.filter(k => k !== key);
  sim.cm.gone.push([key, sim.tick]); sim.cm.n++;
  goCore(sim.def, c, sim.tick);
  const w = sim.world;
  if (w.mat(c.x, c.y, c.z) === M.CORE) w.set(c.x, c.y, c.z, M.AIR, (w.flags(c.x, c.y, c.z) | F.NATURAL | F.DUNGEON) & ~F.PLAYER);       // the heart of the labyrinth is carried out
  const rest = storeInZone(sim, "core_shard", HARVEST_SHARDS);
  if (rest > 0) dropLoose(sim, "core_shard", rest, sim.stock.x0, sim.stock.y0, sim.stock.z);
  sim.cache.mi = null; sim.cache.iv++;                      // spawn points and the map read the new field
  log(sim, "MILESTONE", "The core of " + coreName(sim, c) + " was harvested.", [], { core: key, shards: HARVEST_SHARDS }, 2);
  return true;
}
export function leave(sim, key) {
  const c = coreByKey(sim, key);
  if (!c || !sim.cm.pend.includes(key)) return false;
  sim.cm.pend = sim.cm.pend.filter(k => k !== key); sim.cm.left.push(key); sim.cm.n++;
  log(sim, "MILESTONE", "The core of " + coreName(sim, c) + " was left as it is.", [], { core: key }, 1);
  return true;
}

export const CM_COMMANDS = {
  /** {type:"core", op:"harvest"|"leave", key}: answer the choice after a guardian fell. Rejected with NO_TARGET when nothing is pending for that core. */
  core(sim, c) {
    sim.lastBlocker = "";
    const key = c.key || sim.cm.pend[0];
    const ok = key && (c.op === "harvest" ? harvest(sim, key) : c.op === "leave" ? leave(sim, key) : false);
    if (!ok) sim.lastBlocker = "NO_TARGET";
    return !!ok;
  },
};

/** After a load: the ledger tells the sim's own definition which cores are gone (the field is a pure function of the seed plus this). */
export function applyCm(sim) {
  sim.def.gone.clear();
  for (const [key, t] of sim.cm.gone) { const c = coreByKey(sim, key); if (c) goCore(sim.def, c, t); }
  sim.def.fb.now = sim.tick;
  sim.cache.mi = null;
}
