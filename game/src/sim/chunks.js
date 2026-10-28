// Chunk activation and unloading (S16): which parts of the endless land the sim holds, grows and ticks.
//
//   ANCHORS     villagers (and so expedition crews), the camp, the stockpile, mine designations. The camera is NOT an anchor: the sim never depends on it.
//   ACTIVATE    every 20 ticks, inside sim.step, every chunk within ACT_CH chunks (Chebyshev) of an anchor's chunk is made resident and grown (flora.js), in
//               ascending chunk-key order, so a replay (or a loaded save) activates the same chunks at the same ticks. Far from the camp a chunk may also
//               hold wild creatures, drawn from a chunk-keyed stream.
//   UNLOAD      every 200 ticks an active chunk that nobody has changed (no cell written, no entity but wildlife and the plants it grew) and that is
//               more than DEACT_CH chunks from every anchor is dropped: its plants and wild creatures go and it is regrown, identically, if anyone
//               comes back. A changed chunk is never dropped. (Plants that merely grew or were picked from are not "changes": they start over.)
//   SEAM FOR S17  chunk.last is the tick a chunk was last within reach of an anchor; dormancy LOD (simulating far chunks coarsely instead of not
//               at all) and a smarter unload policy hang off it. `chunkMeta` is hashed and saved.
import { chunkKey, chunkKX, chunkKY, cellXyz } from "./cellkey.js";
import { Rng, mix32 } from "./rng.js";
import { activateChunk } from "./flora.js";
import { spawnFauna } from "./fauna.js";
import { depthOn } from "./depth.js";
import { HIGHLAND, MARSH } from "./biome.js";

export const ACT_CH = 3;            // chunks round an anchor's chunk that are active (7 x 7 chunks: at least 33 cells every way)
export const ACT_R = 48;            // (cells; the same reach for callers that think in cells: activateAround at creation)
export const DEACT_CH = 4;          // an untouched chunk farther than this from every anchor is unloaded
export const UNLOAD_PERIOD = 200;
export const WILD_FROM = 56;        // chunks this far (cells) from the camp may hold wild creatures when they are activated

/** Mark a chunk the people have changed when a non-wildlife entity appears, goes or crosses into it after it was activated. */
export function hookEntities(sim) {
  sim.ents.hook = (e) => {
    if (sim.quiet || e.kind === "villager" || e.kind === "fauna") return;
    const c = sim.world.peekResident(e.x >> 4, e.y >> 4);
    if (c && c.act === 1) c.mod = 1;
  };
}

/** [[x, y]] of everything that keeps land alive, in a fixed order. */
export function anchorsOf(sim) {
  const out = [[sim.site.x, sim.site.y]];
  if (sim.stock) out.push([sim.stock.x0, sim.stock.y0]);
  for (const v of sim.ents.ofKind("villager")) out.push([v.x, v.y]);
  for (const d of sim.mine.list) {
    if (d.kind === "region") out.push([d.x0, d.y0], [d.x1, d.y1]);
    else if (d.kind === "seek") out.push([d.ax, d.ay]);
    else if (d.cells && d.cells.length) { const [x, y] = cellXyz(d.cells[0]); out.push([x, y]); }
  }
  return out;
}

/** Saved and hashed: [[key, active, changed, lastNear]] of every resident chunk, ascending. */
export function chunkMeta(sim) {
  return sim.world.chunkKeys().map(k => { const c = sim.world.chunks.get(k); return [k, c.act, c.mod, c.last]; });
}

export function chunkTick(sim) {
  const w = sim.world, t = sim.tick, anchorChunks = new Set(), need = new Set();
  for (const [x, y] of anchorsOf(sim)) {
    const k = chunkKey(x >> 4, y >> 4);
    if (anchorChunks.has(k)) continue;
    anchorChunks.add(k);
    const cx0 = x >> 4, cy0 = y >> 4;
    for (let cx = cx0 - ACT_CH; cx <= cx0 + ACT_CH; cx++) for (let cy = cy0 - ACT_CH; cy <= cy0 + ACT_CH; cy++) need.add(chunkKey(cx, cy));
  }
  for (const k of [...need].sort((a, b) => a - b)) {
    const cx = chunkKX(k), cy = chunkKY(k);
    if (activateChunk(w, sim.ents, sim.def, cx, cy, t) && sim.wild.init) spawnWild(sim, w.peekResident(cx, cy));
    const c = w.peekResident(cx, cy);
    if (c) c.last = t;
  }
  if (t % UNLOAD_PERIOD === 107) unload(sim, anchorChunks);
}

/** Wild creatures on a chunk activated far from the camp (the camp's own surroundings are stocked by fauna.js initFauna). */
function spawnWild(sim, c) {
  const site = sim.site, X0 = c.cx << 4, Y0 = c.cy << 4;
  if (Math.max(Math.abs(X0 + 8 - site.x), Math.abs(Y0 + 8 - site.y)) < WILD_FROM) return;
  const r = new Rng(mix32(sim.seed ^ 0x717d, chunkKey(c.cx, c.cy))).stream("wild"), roll = r.int(100), bm = c.bm[136], deep = depthOn(sim);
  let sp = null, n = 0;
  if (bm === HIGHLAND) { if (deep && roll < 6) { sp = "wolf"; n = 3; } else if (roll < 12) { sp = "hopper"; n = 2; } }
  else if (bm === MARSH) { if (deep && roll < 7) { sp = "grazer"; n = 3; } else if (roll < 32) { sp = "hopper"; n = 3; } }
  else if (roll < 24) { sp = "hopper"; n = 2; }
  if (!sp) return;
  let home = null;
  for (let tries = 0, made = 0; made < n && tries < 40; tries++) {
    const x = X0 + r.int(16), y = Y0 + r.int(16), z = sim.world.standZ(x, y);
    if (z < 0 || sim.ents.at(x, y, z).length) continue;
    const e = spawnFauna(sim, sp, x, y, z); e.wi = 1;           // wi: grown with the land, not part of the camp's starting stock
    if (sp !== "hopper") { home = home || [x, y, z]; e.home = home.slice(); e.pk = sp === "wolf" ? 1 : 2; e.fd = 0; }
    made++;
  }
}

function unload(sim, anchorChunks) {
  const w = sim.world, drop = [];
  const anchors = [...anchorChunks].map(k => [chunkKX(k), chunkKY(k)]);
  for (const k of w.chunkKeys()) {
    const c = w.chunks.get(k);
    if (!c.act || c.mod) continue;
    if (anchors.some(([ax, ay]) => Math.abs(c.cx - ax) <= DEACT_CH && Math.abs(c.cy - ay) <= DEACT_CH)) continue;
    drop.push(c);
  }
  if (!drop.length) return;
  const gone = new Set(drop.map(c => chunkKey(c.cx, c.cy)));
  sim.quiet = true;
  const kill = [];
  for (const kind of ["plant", "fauna"]) for (const e of sim.ents.ofKind(kind)) {
    const k = chunkKey(e.x >> 4, e.y >> 4);
    if (!gone.has(k)) continue;
    if (kind === "plant" && (e.rv || e.burn)) { gone.delete(k); continue; }                 // somebody is working it: leave the chunk
    if (kind === "fauna" && (e.tame || e.st === "held" || e.sp === "thornback" || e.rv)) { gone.delete(k); continue; }
    kill.push(e.id);
  }
  // a chunk spared above keeps its entities; the others lose their plants and wildlife
  const doomed = kill.filter(id => { const e = sim.ents.get(id); return gone.has(chunkKey(e.x >> 4, e.y >> 4)); });
  for (const id of doomed) sim.ents.remove(id);
  for (const c of drop) if (gone.has(chunkKey(c.cx, c.cy))) w.drop(c.cx, c.cy);
  sim.quiet = false;
  sim.cache.iv++;
}
