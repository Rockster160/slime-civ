// Save/load: seed + terrain deltas + entities + rng counters + tick + command log.
//
// Terrain is regrown from the seed by Sim.create (a pure function), then the
// changed cells are re-applied. Entities are stored whole and replace the
// regrown flora, so a felled tree stays felled. Path caches are derived data
// and not saved. Anything added to the Sim that affects future ticks must be
// added here AND to Sim.hash(); tests/save_roundtrip.js catches omissions.
import { Sim } from "./sim.js";
import { seenRle, loadSeen } from "./seen.js";
import { newDisc } from "./knowledge.js";
import { newWild } from "./fauna.js";
import { newExp } from "./expedition.js";
import { newFarm } from "./farm.js";
import { newCrews } from "./crews.js";
import { newUg } from "./underground.js";
import { newDepth } from "./depth.js";
import { newZones } from "./yard.js";
import { newTrp } from "./traps.js";
import { genoFrom } from "./villager.js";
import { newHeirloom, HEIRLOOM_ODDS } from "./people.js";
import { mix32 } from "./rng.js";
import { chunkMeta } from "./chunks.js";
import { activateChunk } from "./flora.js";
import { cellXyz, chunkKX, chunkKY, chunkKey, cellIdx } from "./cellkey.js";
import { packPlant, plantProps, isPackable } from "./dormant.js";
import { newCm, applyCm } from "./cm.js";

export const SAVE_VERSION = 15;       // 15 = 7.23: sim.cm (the core ledger: choices pending, cores left, cores harvested), delve expeditions (`kind` on an expedition record, `br` on a member): additive, a v14 save loads as it is. 14 = 7.22: monsters (fauna rows with `mon`, `ck`, `sf`, `hr`, `sh`; sim.wild.gk = slain guardians; item rows chitin, core_hide, venom_sac): additive, a v13 save loads as it is. 13 = 7.21: dungeons (the land round every core gains a labyrinth: far content only, nothing within 100 cells of a camp changes) and the trap ledger `trp` (additive: absent = empty), so a v12 save loads as it is; its edits sit on the same rock except inside a labyrinth's footprint, which nobody had dug yet. 12 = 7.20: magic cores and cave networks. Terrain changed (caves, ore weights, gems, outcrops, spires), so the cells a v11 save edited sit on different rock and it is REFUSED (OLD_TERRAIN), not migrated; a v12 save has the same shape as v11. 11 = S18b: the clock rebase (a game day is 12000 ticks, was 1800; a life 500 days): every tick-stamped field (born, nx, bt, cd, timers, chronicle) is on the new clock, so a v9/v10 save is REFUSED (OLD_CLOCK), not migrated. 10 = S17: compact (cell deltas per chunk, plants as arrays, the seen set as per-chunk bitsets, landmarks seen, chunk sleep state); a v9 save loads unchanged. 9 = S16: the endless world. Terrain is regrown from the seed (the spawn search is deterministic), so a save holds only the cells that differ from it (deltas), the list of active chunks (chunks: [key, active, changed, lastNear]) and the entities; seen = {c: revealed surface columns, l: other seen cells}. A save of the old fixed 128x128 map (v < 9) cannot be loaded: restore() refuses it with a message. 8 = S13: hidden genotype (g, gp, inb, wk), bonds (aff, mn, rel), grief (gr), hobby (hb), titles (ti), heirloom (hl), skill rust (rs, lu), grave entities. 7 = S12: biomes (sim.bio: 1 = the seed grows the biome map, 0 = a world made before it), cave-in state (ug). 6 = S7a: villager familiarity (fam), discovery state (disc), flames and hearths. 5 = 5 = S6: geology (new strata + ores), seen log, mining designations. 4 = S5: skills dig/build/craft, nine traits, clone and lesson fields

/** What a save of the old fixed-size world says when it is opened (S16 decision: the endless world does not emulate the 128 x 128 map). */
export const OLD_WORLD = "This save was made in the old fixed-size world, which no longer exists: the world is endless now. Start a new game.";

/** What a save from before the clock rebase says when it is opened (S18b, D35): its ages, timers and chronicle are all counted in 1800-tick days. Refused like the old world, never guessed at. */
export const OLD_TERRAIN = "This save was made before magic cores and cave networks changed the ground under the world, so the cells it remembers no longer sit on the same rock. Start a new game.";
export const OLD_CLOCK = "This save was made when a game day lasted 90 seconds. A day is now 10 minutes long and every age, timer and plant in the save is counted on the old clock, so it cannot be loaded. Start a new game.";

/**
 * v2/v3 -> v4 (S5), per villager: gather and chop XP are dropped (those are skill-less now, D21), build XP stays,
 * dig and craft start at zero; appetite is dropped (stamina/strength upkeep replaces it) and the three new traits
 * start at average. Pure and deterministic: the same old save always migrates to the same new state.
 */
export function migrate(data) {
  if (data.v >= 12) return data;
  if (data.v >= 11) throw new Error(OLD_TERRAIN);     // v11 is the clock-rebased world on the old caves and ore: refused (7.20)
  if (data.v >= 9) throw new Error(OLD_CLOCK);     // v9 and v10 are the endless world on the 1800-tick day (v9 -> v10 was a change of shape only)
  if (data.v >= 2) throw new Error(OLD_WORLD);
  if (data.v === 7) return v7to8(data);                  // v7 -> v8 (S13): people depth
  if (data.v === 6) return v7to8(v6to7(data));           // v6 -> v7 (S12): the world keeps the biome-free map it was made on
  if (data.v === 5) return v7to8(v6to7(v5to6(data)));
  if (data.v === 4) return v7to8(v6to7(v5to6(data)));    // v4 -> v5 (S6): nothing to convert (the world regrows with the new strata, fog and designations start empty), then as v5

  for (const e of data.entities.list) {
    if (e.kind !== "villager") continue;
    e.sk = { dig: { xp: 0, wk: 0 }, build: { xp: e.sk.build ? e.sk.build.xp : 0, wk: 0 }, craft: { xp: 0, wk: 0 } };
    delete e.t.appetite;
    for (const k of ["stamina", "drive", "leisure"]) if (e.t[k] === undefined) e.t[k] = 1;
    e.ws = ""; e.wt = 0; e.tch = null; e.cl = 0; e.cg = 0;
  }
  return v7to8(v6to7(v5to6(data)));
}

/**
 * v7 -> v8 (S13): every villager gets a hidden genotype derived from their visible traits (a stable split, so the same save always
 * migrates to the same alleles), the grandparents their living parents can name, empty bonds, grief and titles, a hobby record, and
 * (about 1 in 10, by the same hash a newborn uses) a keepsake. Skills rust from "now", not from a past nobody recorded.
 */
function v7to8(data) {
  const byId = new Map(data.entities.list.filter(e => e.kind === "villager").map(e => [e.id, e]));
  for (const e of data.entities.list) {
    if (e.kind !== "villager") continue;
    if (!e.g) e.g = genoFrom(e.t, e.id);
    if (!e.gp) { const gp = []; for (const pid of e.par || []) { const p = byId.get(pid); if (p) for (const q of p.par || []) if (q && !gp.includes(q)) gp.push(q); } e.gp = gp; }
    if (e.inb === undefined) { e.inb = 0; e.wk = 0; }
    if (!e.aff) { e.aff = {}; e.mn = {}; e.rel = []; e.gr = null; e.ti = []; }
    if (!e.hb) e.hb = { xp: 0, n: 0 };
    if (e.hl === undefined) e.hl = mix32(e.id, 0x41ab) % HEIRLOOM_ODDS === 0 ? newHeirloom(e, data.tick) : null;
  }
  data.v = 8;
  return data;
}

/** v6 -> v7 (S12): terrain is regrown from the seed, so a world saved before the biome pass must be regrown without it (bio 0), or its deltas land on the wrong map. */
function v6to7(data) {
  if (data.bio === undefined) data.bio = 0;
  if (!data.ug) data.ug = newUg();
  data.v = 7;
  return data;
}

/** v5 -> v6: every villager gets an empty familiarity record; the discovery state starts fresh. */
function v5to6(data) {
  for (const e of data.entities.list) if (e.kind === "villager" && e.fam === undefined) e.fam = {};
  data.disc = newDisc();
  data.v = 6;
  return data;
}

// ---- compact forms (S17) ----

/** [idx, mat, flags, ...] (any order) -> [[chunkKey, [localDelta, mat, flags, ...]]] ascending: a cell's number inside its chunk (z << 8 | y << 4 | x), delta-coded. */
export function packDeltas(flat) {
  const by = new Map();
  for (let k = 0; k < flat.length; k += 3) {
    const [x, y, z] = cellXyz(flat[k]), ck = chunkKey(x >> 4, y >> 4);
    let a = by.get(ck); if (!a) by.set(ck, a = []);
    a.push([(z << 8) | ((y & 15) << 4) | (x & 15), flat[k + 1], flat[k + 2]]);
  }
  return [...by.keys()].sort((a, b) => a - b).map(ck => {
    const a = by.get(ck).sort((p, q) => p[0] - q[0]), out = [];
    let prev = 0;
    for (const [l, m, f] of a) { out.push(l - prev, m, f); prev = l; }
    return [ck, out];
  });
}
export function unpackDeltas(dc) {
  const out = [];
  for (const [ck, a] of dc) {
    const X0 = chunkKX(ck) << 4, Y0 = chunkKY(ck) << 4;
    let l = 0;
    for (let k = 0; k < a.length; k += 3) { l += a[k]; out.push(cellIdx(X0 + (l & 15), Y0 + ((l >> 4) & 15), l >> 8), a[k + 1], a[k + 2]); }
  }
  return out;
}
/** Entities with their plants as per-chunk arrays: {nextId, list (the rest), pl: [[chunkKey, [[id, ...packPlant]]]]}. */
export function packEnts(j) {
  const list = [], by = new Map();
  for (const e of j.list) {
    if (e.kind === "plant" && isPackable(e)) {
      const ck = chunkKey(e.x >> 4, e.y >> 4);
      let a = by.get(ck); if (!a) by.set(ck, a = []);
      a.push([e.id, ...packPlant(e)]);
    } else list.push(e);
  }
  return { nextId: j.nextId, list, pl: [...by.keys()].sort((a, b) => a - b).map(ck => [ck, by.get(ck)]) };
}
export function unpackEnts(d) {
  if (!d.pl) return d;
  const list = d.list.slice();
  for (const [ck, ps] of d.pl) for (const a of ps) list.push({ id: a[0], kind: "plant", ...plantProps(chunkKX(ck), chunkKY(ck), a.slice(1)) });
  list.sort((p, q) => p.id - q.id);
  return { nextId: d.nextId, list };
}

export function snapshot(sim) {
  return {
    v: SAVE_VERSION,
    seed: sim.seed,
    tick: sim.tick,
    rng: sim.rng.counters(),
    dc: packDeltas(sim.world.deltas()),
    entities: packEnts(sim.ents.toJSON()),
    stock: sim.stock,
    board: sim.board,
    chron: sim.chron,
    rooms: sim.rooms.marks,
    bps: sim.bps,
    seen: seenRle(sim),
    chunks: chunkMeta(sim),
    spawn: [sim.site.x, sim.site.y],            // the camp: terrain regrows round it exactly as it was (the spawn search is never re-run for a save)
    mine: sim.mine,
    disc: sim.disc,
    wild: sim.wild,
    exp: sim.exp,
    farm: sim.farm,
    crews: sim.crews,
    ug: sim.ug,
    bio: sim.bio,
    pond: sim.pond,                              // S17: 1 = the world was grown with the camp's pond (terrain regrows from the seed, so the save must say)
    dp: sim.dp,
    zones: sim.zones,
    trp: sim.trp,
    cm: sim.cm,
    ironman: sim.ironman ? 1 : 0,
    cmds: sim.cmdLog,
  };
}

/** Deep-copies through JSON so the loaded sim shares nothing with the saved one. */
export function toJSON(sim) { return JSON.stringify(snapshot(sim)); }

export function restore(data) {
  data = JSON.parse(typeof data === "string" ? data : JSON.stringify(data));   // never share state with the caller
  if (!(data.v >= 2 && data.v <= SAVE_VERSION)) throw new Error("Unsupported save version " + data.v);
  data = migrate(data);
  const sim = Sim.create(data.seed, { villagers: 0, restore: true, spawn: { x: data.spawn[0], y: data.spawn[1] }, biomes: data.bio !== 0, depth: !!(data.dp && data.dp.on), pond: data.pond === 1 });      // S14: a world made without the depth content regrows without it
  sim.ironman = data.ironman === 1;
  for (const [k, act, mod, last, dz, pk, pi] of data.chunks) {                  // S16: the chunks that were resident: the active ones regrown from the seed (a tree's OBSTACLE flag; the plants themselves are in the entity list), then the changed cells laid over
    const cx = chunkKX(k), cy = chunkKY(k);
    if (act) activateChunk(sim.world, null, sim.def, cx, cy, 0); else sim.world.resident(cx, cy);
    const c = sim.world.peekResident(cx, cy);
    c.act = act; c.mod = mod; c.last = last;
    if (dz) { c.dz = dz; c.pk = pk; c.pi = pi; }                              // S17: asleep (packed plants come back as they were)
  }
  sim.world.applyDeltas(data.dc ? unpackDeltas(data.dc) : data.deltas);
  sim.ents.load(unpackEnts(data.entities));
  sim.stock = data.stock; sim.board = data.board; sim.chron = data.chron;
  sim.rng.restore(data.rng);
  sim.rooms.marks = data.rooms || {};
  sim.bps = data.bps || { n: 0, list: [] };
  if (!sim.bps.inst) { sim.bps.inst = []; sim.bps.ni = 0; }     // S11: instances (additive)
  sim.seen.ready = true;
  loadSeen(sim, data.seen);
  sim.mine = data.mine || { n: 0, list: [] };
  sim.disc = data.disc || newDisc();
  sim.wild = data.wild || newWild();            // S8: absent in older saves: the creatures are spawned the first time the sim steps
  sim.exp = data.exp || newExp();
  sim.crews = data.crews || newCrews();          // S11: absent in older saves (additive)
  sim.ug = data.ug || newUg();                  // S12: absent in older saves (additive)
  sim.dp = data.dp || newDepth(0);              // S14: absent in older saves: the world plays as it did (no illness, wolves, grazers or perturbation); additive, so SAVE_VERSION stays 8
  sim.cm = data.cm || newCm();                  // 7.23: absent in older saves (additive)
  sim.trp = data.trp || newTrp();                // 7.21: absent in older saves (additive)
  sim.zones = data.zones || newZones();           // S17: absent in older saves (additive)
  sim.farm = data.farm || newFarm();            // S10: absent in older saves (additive)
  if (sim.board.sg === undefined) { sim.board.sg = 0; sim.board.ag = 0; }
  sim.rooms.fullRebuild(sim);                 // rooms are derived: rebuilt from cells + doors
  sim.tick = data.tick;
  applyCm(sim);                                  // 7.23: harvested cores fade from their ticks
  sim.cmdLog = data.cmds;
  return sim;
}
