// Save/load: seed + terrain deltas + entities + rng counters + tick + command log.
//
// Terrain is regrown from the seed by Sim.create (a pure function), then the
// changed cells are re-applied. Entities are stored whole and replace the
// regrown flora, so a felled tree stays felled. Path caches are derived data
// and not saved. Anything added to the Sim that affects future ticks must be
// added here AND to Sim.hash(); tests/save_roundtrip.js catches omissions.
import { Sim, CMD_CAP } from "./sim.js";
import { seenRle, loadSeen, oreSummary } from "./seen.js";
import { dateOf, SEASON_NAMES } from "./clock.js";
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
import { fillMemory } from "./memory.js";
import { fillBel } from "./belief.js";
import { ensureBoard } from "./notices.js";
import { newClr } from "./clear.js";
import { ASSIGN_VERBS } from "./orders.js";
import { packDeltas, unpackDeltas } from "./deltas.js";
import { worldDeltas, allEntities } from "./paging.js";

export const SAVE_VERSION = 21;       // 21 = 8.24: the seen knowledge is per-chunk bitsets (`seen` = {c, x, rc, lm}; the unbounded cell log and the stored `known` lists are gone; ore `known` is derived on load) and the snapshot has a package form (below); v12-20 JSON loads and converts. 20 = D58: assignments (`as` on a villager: {task, tid, x, y, z, t0, done, go}) replace the area orders of the gather verbs (a v19 order chop / forage / gather / hunt / haul is migrated into one), sim.clr (Clear area rectangles; additive). 19 = 9.33: `idea` on a villager ({CRAFT: [strength, tick]}: seen or heard of, never practised), `cw` on a job; additive, absent = none, a v18 save loads as it is. 18 = 9.31: the job board is furniture with `notes` (notices.js); an older save gets a founding board beside the yard on load, and its slimes know where it stands. 17 = 9.28: per-villager belief store `bel` (belief.js); a v16 save is seeded with the camp knowledge on load (OD-57). 16 = splitting replaces cloning: `cl` and `cg` are dropped (migrate), `sp` (split origin) is additive. 15 = 7.23: sim.cm (the core ledger: choices pending, cores left, cores harvested), delve expeditions (`kind` on an expedition record, `br` on a member): additive, a v14 save loads as it is. 14 = 7.22: monsters (fauna rows with `mon`, `ck`, `sf`, `hr`, `sh`; sim.wild.gk = slain guardians; item rows chitin, core_hide, venom_sac): additive, a v13 save loads as it is. 13 = 7.21: dungeons (the land round every core gains a labyrinth: far content only, nothing within 100 cells of a camp changes) and the trap ledger `trp` (additive: absent = empty), so a v12 save loads as it is; its edits sit on the same rock except inside a labyrinth's footprint, which nobody had dug yet. 12 = 7.20: magic cores and cave networks. Terrain changed (caves, ore weights, gems, outcrops, spires), so the cells a v11 save edited sit on different rock and it is REFUSED (OLD_TERRAIN), not migrated; a v12 save has the same shape as v11. 11 = S18b: the clock rebase (a game day is 12000 ticks, was 1800; a life 500 days): every tick-stamped field (born, nx, bt, cd, timers, chronicle) is on the new clock, so a v9/v10 save is REFUSED (OLD_CLOCK), not migrated. 10 = S17: compact (cell deltas per chunk, plants as arrays, the seen set as per-chunk bitsets, landmarks seen, chunk sleep state); a v9 save loads unchanged. 9 = S16: the endless world. Terrain is regrown from the seed (the spawn search is deterministic), so a save holds only the cells that differ from it (deltas), the list of active chunks (chunks: [key, active, changed, lastNear]) and the entities; seen = {c: revealed surface columns, l: other seen cells}. A save of the old fixed 128x128 map (v < 9) cannot be loaded: restore() refuses it with a message. 8 = S13: hidden genotype (g, gp, inb, wk), bonds (aff, mn, rel), grief (gr), hobby (hb), titles (ti), heirloom (hl), skill rust (rs, lu), grave entities. 7 = S12: biomes (sim.bio: 1 = the seed grows the biome map, 0 = a world made before it), cave-in state (ug). 6 = S7a: villager familiarity (fam), discovery state (disc), flames and hearths. 5 = 5 = S6: geology (new strata + ores), seen log, mining designations. 4 = S5: skills dig/build/craft, nine traits, clone and lesson fields

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
  if (data.v < 20) for (const e of data.entities.list) if (e.kind === "villager" && e.order && ASSIGN_VERBS.includes(e.order.verb)) {      // v20 (D58): an area gather order becomes the assignment it should always have been
    const o = e.order;
    e.as = { task: o.verb, tid: o.tid || 0, x: o.x, y: o.y, z: o.z, t0: o.t0, done: o.done || 0, go: 0 };
    e.order = null;
  }
  if (data.v >= 12) {
    if (data.v < 16) for (const e of data.entities.list) if (e.kind === "villager") { delete e.cl; delete e.cg; }      // v16: cloning is gone (splitting is split.js)
    return data;
  }
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
    e.ws = ""; e.wt = 0; e.tch = null;
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
    dc: packDeltas(worldDeltas(sim)),
    entities: packEnts(allEntities(sim)),
    stock: sim.stock,
    board: sim.board,
    chron: sim.chron,
    rooms: sim.rooms.marks,
    bps: sim.bps,
    seen: seenRle(sim),
    chunks: chunkMeta(sim),
    spawn: [sim.site.x, sim.site.y],            // the camp: terrain regrows round it exactly as it was (the spawn search is never re-run for a save)
    mine: sim.mine,
    clr: sim.clr.n ? sim.clr : undefined,
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
    cmds: sim.cmdLog.length > CMD_CAP ? sim.cmdLog.slice(-CMD_CAP) : sim.cmdLog,       // 8.27: capped, only the newest commands travel (OD-54)
  };
}

// ---- the package (8.24): manifest + global record + chunk records ----
//
// toPackage(snap) slices the flat snapshot into records and fromPackage(pkg) puts it back together exactly; both are pure and synchronous (the gzip, the base64 and the
// storage live outside sim/: src/store/codec.js). A package is {v, m, g, c: {"<chunkKey>": record}, cmds?}:
//   m     manifest: {v, seed, tick, gen, meta: {label, day, pop}, g: hash, c: [[chunkKey, hash]], x: hash}  (every record's mix32 hash; `gen` is the write generation 8.25 uses)
//   g     global record: everything that is not tied to a place (villagers and their memory, the stock, board and notices, the chronicle, discovery, crews, ledgers, rng, rooms, ...)
//   c     chunk record, one per 16 x 16 column that has anything to say: {k, mt (a dormant chunk's meta; an awake chunk's is in g.chm), dc (terrain deltas), pl (packed plants), e (place-bound entities), sc/sx (seen), ore}
//   cmds  the command log, a record of its own (OD-54; capped in 8.27)
// Villagers, fauna, wagons, fire and anything mid-job stay global (OD-55); plants, loose and stocked items, furniture, graves, plots and sites belong to the chunk they stand in.
// `ore` is a summary only (counts and a rough centre per material); the exact lists are derived again from the seen cells on load.

export const PKG_VERSION = 21;
/** Entity kinds that belong to a place (OD-55): they travel in the chunk record of the chunk they stand in. Plants are packed separately (`pl`). */
const PLACED = new Set(["item", "furniture", "grave", "plot", "site", "csite", "dsite"]);

/** The record hash: mix32 folded over the canonical JSON text of the record. */
export function recHash(rec) { return hashText(JSON.stringify(rec)); }
/** The hash of a record's JSON text (a string is immutable, so the autosave can hash it in slices after the sim has moved on). */
export function hashText(t) {
  let h = t.length >>> 0;
  for (let i = 0; i < t.length; i++) h = mix32(h, t.charCodeAt(i));
  return h;
}

/** What the Menu and a save browser show for a save without opening it. */
export function saveMeta(sim) {
  const d = dateOf(sim.tick), pop = sim.ents.ofKind("villager").length;
  return { label: "Y" + d.year + " D" + d.day + " " + SEASON_NAMES[d.season] + ", " + pop + " villagers", day: d.day, year: d.year, pop };
}

export function savePackage(sim, gen = 1) { return toPackage(snapshot(sim), saveMeta(sim), gen, oreSummary(sim)); }

/**
 * The autosave's cut (8.27), in two steps so the main thread never holds a long slice. `cutPackage` is the one atomic step: it snapshots the sim, slices it into records and
 * writes each record's JSON text (the text is a frozen copy, so the sim may move on). The hashes are NOT computed here (the slow part: a JS loop over every character).
 * `texts` is [{name, json, at}] with `at` = where the hash goes in the manifest ("g", "x" or the index into m.c). `sealPackage(cut, hashes)` puts the hashes in
 * (hashes[i] for texts[i]); the manifest then equals the one savePackage gives for the same sim.
 */
export function cutPackage(sim, gen = 1) {
  const pkg = toPackage(snapshot(sim), saveMeta(sim), gen, oreSummary(sim), () => 0);
  const texts = [{ name: "g", json: JSON.stringify(pkg.g), at: "g" }];
  if (pkg.cmds) texts.push({ name: "x", json: JSON.stringify(pkg.cmds), at: "x" });
  pkg.m.c.forEach(([k], i) => texts.push({ name: "c" + k, json: JSON.stringify(pkg.c[k]), at: i }));
  return { pkg, texts };
}
export function sealPackage(cut, hashes) {
  const m = cut.pkg.m;
  cut.texts.forEach((t, i) => { if (t.at === "g") m.g = hashes[i]; else if (t.at === "x") m.x = hashes[i]; else m.c[t.at][1] = hashes[i]; });
  return cut.pkg;
}

export function toPackage(snap, meta, gen = 1, ore = new Map(), hashOf = recHash) {
  const ck = new Map();                                                       // chunkKey -> record
  const rec = (k) => { let r = ck.get(k); if (!r) ck.set(k, r = { k }); return r; };
  const awake = [];                                                           // 8.25: an awake chunk's meta [key, act, mod, last] changes every few ticks (`last` follows the villagers), so it travels in the village record, not in the chunk record it would otherwise rewrite every autosave
  for (const e of snap.chunks) { if (e.length > 4) rec(e[0]).mt = e.slice(1); else awake.push(e); }      // (a dormant chunk's meta carries its packed plants and items: that stays with the chunk)
  for (const [k, dc] of snap.dc) rec(k).dc = dc;
  for (const [k, pl] of snap.entities.pl) rec(k).pl = pl;
  const list = [];
  for (const e of snap.entities.list) {
    if (PLACED.has(e.kind)) { const r = rec(chunkKey(e.x >> 4, e.y >> 4)); (r.e || (r.e = [])).push(e); } else list.push(e);
  }
  for (const [k, c] of snap.seen.c) rec(k).sc = c;
  for (const [k, x] of snap.seen.x) rec(k).sx = x;
  for (const [k, o] of ore) rec(k).ore = o;
  const g = {};
  for (const key of Object.keys(snap)) if (!SPLIT_KEYS.has(key)) g[key] = snap[key];
  g.ents = { nextId: snap.entities.nextId, list };
  g.rc = snap.seen.rc; g.lm = snap.seen.lm; g.chm = awake;
  const c = {}, mc = [];
  for (const k of [...ck.keys()].sort((a, b) => a - b)) { c[k] = ck.get(k); mc.push([k, hashOf(c[k])]); }
  const m = { v: PKG_VERSION, seed: snap.seed, tick: snap.tick, gen, meta: meta || {}, g: hashOf(g), c: mc, x: snap.cmds ? hashOf(snap.cmds) : 0 };
  const out = { v: PKG_VERSION, m, g, c };
  if (snap.cmds) out.cmds = snap.cmds;
  return out;
}
const SPLIT_KEYS = new Set(["chunks", "dc", "entities", "seen", "cmds"]);

/** Check every record against the manifest. -> "" or a plain description of what is damaged. */
export function verifyPackage(pkg) {
  const m = pkg && pkg.m;
  if (!m || !pkg.g || !pkg.c) return "This save file is incomplete: it has no " + (!m ? "manifest" : !pkg.g ? "village record" : "map records") + ".";
  if (recHash(pkg.g) !== m.g) return "This save is damaged: the village record does not match its checksum.";
  const bad = [];
  for (const [k, h] of m.c) if (!pkg.c[k] || recHash(pkg.c[k]) !== h) bad.push(k);
  if (bad.length) return "This save is damaged: " + bad.length + " map piece" + (bad.length === 1 ? "" : "s") + " (chunk " + bad.slice(0, 3).map(k => chunkKX(k) + "," + chunkKY(k)).join("; ") + (bad.length > 3 ? "; ..." : "") + ") do not match their checksums.";
  if (Object.keys(pkg.c).length !== m.c.length) return "This save is damaged: its map pieces do not match its manifest.";
  if (m.x && (!pkg.cmds || recHash(pkg.cmds) !== m.x)) return "This save is damaged: the command history does not match its checksum.";
  return "";
}

/** The inverse of toPackage: the flat snapshot. Throws a plain-text Error if a record is damaged. */
export function fromPackage(pkg) {
  const bad = verifyPackage(pkg);
  if (bad) throw new Error(bad);
  const snap = {}, g = pkg.g;
  snap.v = pkg.v;
  for (const key of Object.keys(g)) if (key !== "ents" && key !== "rc" && key !== "lm" && key !== "chm") snap[key] = g[key];
  const chunks = (g.chm || []).slice(), dc = [], pl = [], seenC = [], seenX = [], list = g.ents.list.slice();
  for (const k of Object.keys(pkg.c).map(Number).sort((a, b) => a - b)) {
    const r = pkg.c[k];
    if (r.mt) chunks.push([k, ...r.mt]);
    if (r.dc) dc.push([k, r.dc]);
    if (r.pl) pl.push([k, r.pl]);
    if (r.e) for (const e of r.e) list.push(e);
    if (r.sc !== undefined) seenC.push([k, r.sc]);
    if (r.sx) seenX.push([k, r.sx]);
  }
  list.sort((p, q) => p.id - q.id);
  chunks.sort((p, q) => p[0] - q[0]);
  snap.chunks = chunks; snap.dc = dc;
  snap.entities = { nextId: g.ents.nextId, list, pl };
  snap.seen = { c: seenC, x: seenX, rc: g.rc, lm: g.lm };
  snap.cmds = pkg.cmds;
  return snap;
}
/** A package container has no `entities` (a flat save does); one that lost a part is still treated as a package, so it is reported as damaged. */
const isPackage = (d) => !!d && typeof d === "object" && d.v === PKG_VERSION && !d.entities && !!(d.m || d.g || d.c);

/** Deep-copies through JSON so the loaded sim shares nothing with the saved one. */
export function toJSON(sim) { return JSON.stringify(snapshot(sim)); }

export function restore(data) {
  data = JSON.parse(typeof data === "string" ? data : JSON.stringify(data));   // never share state with the caller
  if (isPackage(data)) data = fromPackage(data);                                // 8.24: a package (the .slime / save code form) is put back together first
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
  for (const v of sim.ents.ofKind("villager")) fillMemory(sim, v);          // experiment: temperament from the hash and an empty memory for a save made before them (additive)
  sim.rng.restore(data.rng);
  sim.rooms.marks = data.rooms || {};
  sim.bps = data.bps || { n: 0, list: [] };
  if (!sim.bps.inst) { sim.bps.inst = []; sim.bps.ni = 0; }     // S11: instances (additive)
  sim.seen.ready = true;
  loadSeen(sim, data.seen);
  sim.mine = data.mine || { n: 0, list: [] };
  sim.clr = data.clr || newClr();               // D58: absent in older saves (additive)
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
  if (data.v < 17) for (const v of sim.ents.ofKind("villager")) fillBel(sim, v);      // v17 migration (OD-57): an old villager knows the camp, as a founder does. (Needs the world, so it runs here, not in migrate().)
  if (data.v < 18) ensureBoard(sim);      // v18 migration (9.31, OD-59): the founding board beside the yard; every slime knows where it stands. (Needs the world, so it runs here, not in migrate().)
  return sim;
}
