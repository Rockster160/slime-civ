// Freeform construction (GDD §12.3, §12.6). The player paints GHOSTS; each ghost
// is a "csite" entity. Villagers fetch the materials and finish them as derived
// STANDING-class jobs (jobs.js genConstruct); only then does a cell change.
//
//   csite = {kind:"csite", w, m, x,y,z, got, g, rv, rt}
//     w   wall | floor | roof | door | bed | rack
//     m   material key for wall/floor/roof (BMAT), "" otherwise
//     x,y,z  the STAND cell (where a villager would stand). A wall fills that cell,
//            a floor is the cell below it, a roof the cell above it.
//     got units of material already delivered ("framed"): a partial build is a valid
//            state, and cancelling refunds it as loose items
//     g   group = one build command (one stamp / one painted stroke); supports-first order is within a group
//
// Supports-first (§12.6): floors, then walls, then furniture; the door last; a
// roof needs a built wall (or natural rock) within SPAN cells or an already
// built roof beside it. Above ground the span is advisory in the GDD; here it is
// the ordering rule that makes roofs grow inward from the walls.
import { World, M, F, MAT } from "./world.js";
import { dropLoose, inZone } from "./items.js";
import { once } from "./chronicle.js";
import { BED_COST, RACK_COST } from "./board.js";

export const SPAN = 3;
export const TIER = { floor: 0, wall: 1, bed: 2, rack: 2, roof: 2, door: 3 };

/** Buildable materials. role = what they may be used as (a material class is its role); dur = ticks of work. */
export const BMAT = {
  wattle:  { id: M.WATTLE,    role: "wall",  item: "stick", n: 2, dur: 120, label: "Wattle wall" },
  log:     { id: M.LOGWALL,   role: "wall",  item: "log",   n: 1, dur: 180, label: "Log wall" },
  stone:   { id: M.STONEWALL, role: "wall",  item: "stone", n: 2, dur: 240, label: "Dry-stone wall" },
  dirt:    { id: M.DIRTFLOOR, role: "floor", item: "dirt",  n: 1, dur: 60,  label: "Packed-dirt floor" },
  thatch:  { id: M.THATCH,    role: "roof",  item: "grass", n: 1, dur: 80,  label: "Thatch roof" },
  logroof: { id: M.LOGROOF,   role: "roof",  item: "log",   n: 1, dur: 160, label: "Log roof" },
};
export const BMAT_OF = {};                       // material id -> key
for (const k of Object.keys(BMAT)) BMAT_OF[BMAT[k].id] = k;
export const DEFAULT_MAT = { wall: "wattle", floor: "dirt", roof: "thatch" };
export const PIECES = ["wall", "floor", "roof", "door", "bed", "rack"];
const FURN = {
  door: { item: "stick", n: 3, dur: 120, label: "Door" },
  bed:  { item: BED_COST.item, n: BED_COST.n, dur: 240, label: "Leaf bed" },
  rack: { item: RACK_COST.item, n: RACK_COST.n, dur: 360, label: "Drying rack" },
};

/** {item, n, dur, label} for a piece (site or request). */
export function costOf(w, m) {
  if (FURN[w]) return FURN[w];
  const b = BMAT[m || DEFAULT_MAT[w]];
  return b ? { item: b.item, n: b.n, dur: b.dur, label: b.label } : null;
}
/** The world cell a piece occupies, given its stand cell. */
export function cellOf(w, x, y, z) { return w === "floor" ? [x, y, z - 1] : w === "roof" ? [x, y, z + 1] : [x, y, z]; }
const layer = (w) => (w === "floor" ? 1 : w === "roof" ? 2 : 0);

export function csiteAt(sim, x, y, z, w) {
  const ids = sim.ents.at(x, y, z);
  for (let i = 0; i < ids.length; i++) {
    const e = sim.ents.get(ids[i]);
    if (e.kind === "csite" && layer(e.w) === layer(w)) return e;
  }
  return null;
}
const FLOORABLE = new Set([M.GRASS, M.DIRT, M.SAND]);
const blocksBuild = (e) => e.kind === "plant" || e.kind === "furniture" || e.kind === "item" || e.kind === "site";   // "site" = a leaf bed on its way

/**
 * Can this piece be placed at the stand cell? null = yes, else a short reason:
 * "bounds" "blocked" "ground" "exists" "stockpile" "material". Pure.
 */
export function checkPlace(sim, w, m, x, y, z) {
  if (!PIECES.includes(w) || !World.inBounds(x, y, z) || z < 2 || z + 1 >= 24) return "bounds";
  if ((w === "wall" || w === "floor" || w === "roof") && (!BMAT[m] || BMAT[m].role !== w)) return "material";
  const wd = sim.world;
  const [cx, cy, cz] = cellOf(w, x, y, z);
  const old = csiteAt(sim, x, y, z, w);
  if (old && old.m === m && old.w === w) return "exists";
  if (old && old.got > 0) return "blocked";              // framed already: erase it first
  if (w !== "floor" && w !== "roof" && sim.stock && sim.stock.z === z && inZone(sim.stock, x, y)) return "stockpile";
  if (w === "floor") {
    const cm = wd.mat(cx, cy, cz);
    if (wd.mat(x, y, z) !== M.AIR) return "blocked";
    if (cm === M.AIR) { if (!wd.isSolid(x, y, z - 2)) return "ground"; }
    else if (!FLOORABLE.has(cm)) return "exists";
    return null;
  }
  if (w === "roof") return wd.mat(cx, cy, cz) === M.AIR ? null : "blocked";
  if (wd.mat(x, y, z) !== M.AIR) return "blocked";
  if (!wd.isSolid(x, y, z - 1) && !(csiteAt(sim, x, y, z, "floor"))) return "ground";
  const ids = sim.ents.at(x, y, z);
  for (let i = 0; i < ids.length; i++) if (blocksBuild(sim.ents.get(ids[i]))) return "blocked";
  return null;
}

/** Add ghosts. cells: [{w, m?, x, y, z}]. Returns {placed, skipped}. Replaces an unframed ghost of another material. */
export function placeGhosts(sim, cells, g) {
  let placed = 0, skipped = 0;
  for (const c of cells) {
    const m = FURN[c.w] ? "" : c.m || DEFAULT_MAT[c.w];
    if (checkPlace(sim, c.w, m, c.x, c.y, c.z)) { skipped++; continue; }
    const old = csiteAt(sim, c.x, c.y, c.z, c.w);
    if (old) sim.ents.remove(old.id);
    sim.ents.add("csite", { w: c.w, m, x: c.x, y: c.y, z: c.z, got: 0, g, rv: 0, rt: 0 });
    placed++;
  }
  if (placed) bumpSites(sim);
  return { placed, skipped };
}

export function bumpSites(sim) { sim.cache.csv = (sim.cache.csv | 0) + 1; sim.cache.iv++; }

/** Take a ghost away, giving back anything delivered (loose, so it gets hauled home). */
export function removeSite(sim, s) {
  if (s.got > 0) {
    const c = costOf(s.w, s.m);
    if (c) dropLoose(sim, c.item, s.got, s.x, s.y, s.z);
  }
  sim.ents.remove(s.id);
}

/** {type:"erase", x0,y0,x1,y1,z}: remove ghosts in a rectangle at one level. */
export function eraseGhosts(sim, c) {
  let n = 0;
  for (const s of sim.ents.ofKind("dsite").slice()) {     // erase also cancels deconstruction marks
    if (s.z === c.z && s.x >= Math.min(c.x0, c.x1) && s.x <= Math.max(c.x0, c.x1) && s.y >= Math.min(c.y0, c.y1) && s.y <= Math.max(c.y0, c.y1)) { sim.ents.remove(s.id); n++; }
  }
  for (const s of sim.ents.ofKind("csite").slice()) {
    if (s.z !== c.z || s.x < Math.min(c.x0, c.x1) || s.x > Math.max(c.x0, c.x1) || s.y < Math.min(c.y0, c.y1) || s.y > Math.max(c.y0, c.y1)) continue;
    removeSite(sim, s); n++;
  }
  if (n) { bumpSites(sim); sim.board.ep++; }
  return n > 0;
}

// ---- readiness (supports-first) ----

/** Built, solid structure within SPAN cells in the plane at the stand level (walls, natural rock). */
function wallNear(sim, x, y, z) {
  const w = sim.world;
  for (let dy = -SPAN; dy <= SPAN; dy++) for (let dx = -SPAN; dx <= SPAN; dx++) {
    if (w.isSolid(x + dx, y + dy, z)) return true;
  }
  return false;
}

/**
 * Sites a villager may work on now, in build order (tier, then id), cached per world/site version.
 * `waiting` counts ghosts held back by the supports-first rule.
 */
export function readySites(sim) {
  const c = sim.cache;
  if (c.rsv === c.csv && c.rsw === sim.world.version && c.rs) return c.rs;
  const all = sim.ents.ofKind("csite"), byG = new Map();
  for (const s of all) {
    const t = byG.get(s.g) || [0, 0, 0, 0];      // unbuilt count per tier within the group
    t[TIER[s.w]]++; byG.set(s.g, t);
  }
  const ready = [];
  let waiting = 0;
  for (const s of all) {
    const t = byG.get(s.g), tier = TIER[s.w];
    let ok = true;
    if (tier >= 1 && t[0] > 0) ok = false;                         // floors first
    else if (s.w === "door" && (t[1] > 0 || t[2] > 0)) ok = false;   // the door goes in last so nobody is walled in
    else if (s.w === "roof") {
      ok = wallNear(sim, s.x, s.y, s.z) || adjacentRoof(sim, s);
    }
    if (ok) ready.push(s); else waiting++;
  }
  ready.sort((a, b) => TIER[a.w] - TIER[b.w] || a.id - b.id);
  c.rs = { ready, waiting, total: all.length }; c.rsv = c.csv; c.rsw = sim.world.version;
  return c.rs;
}
function adjacentRoof(sim, s) {
  const w = sim.world;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const m = w.mat(s.x + dx, s.y + dy, s.z + 1);
    if (BMAT_OF[m] && BMAT[BMAT_OF[m]].role === "roof") return true;
  }
  return false;
}

/** Cells next to a site a villager can stand on to work it (the site's own cell counts unless a wall will fill it). */
export function standCells(sim, s) {
  const w = sim.world, out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0 && s.w === "wall") continue;
    const x = s.x + dx, y = s.y + dy;
    if (w.isWalkable(x, y, s.z)) out.push([x, y, s.z]);
  }
  return out;
}

/** Complete a ghost: write the cell or make the entity. Returns null or a blocker. Called by the construct verb. */
export function finishSite(sim, v, s) {
  const w = sim.world, [cx, cy, cz] = cellOf(s.w, s.x, s.y, s.z);
  if (s.w === "wall") {
    for (const id of sim.ents.at(s.x, s.y, s.z)) { const e = sim.ents.get(id); if (e.id !== s.id && (e.kind === "villager" || blocksBuild(e))) return "BLOCKED"; }
    if (w.mat(cx, cy, cz) !== M.AIR) return "BLOCKED";
  }
  if (s.w === "wall" || s.w === "floor" || s.w === "roof") {
    w.set(cx, cy, cz, BMAT[s.m].id, w.flags(cx, cy, cz) | F.PLAYER);
  } else {
    const ids = sim.ents.at(s.x, s.y, s.z);
    for (const id of ids) { const e = sim.ents.get(id); if (e.kind === "furniture" || e.kind === "plant") return "BLOCKED"; }
    const f = sim.ents.add("furniture", s.w === "door" ? { f: "door", x: s.x, y: s.y, z: s.z, owner: 0, rv: 0, rt: 0 } : { f: s.w, x: s.x, y: s.y, z: s.z, owner: 0, rv: 0, rt: 0 });
    if (s.w === "door") w.markDirty(s.x, s.y, s.z);
    if (s.w === "bed") once(sim, "firstBed", "BUILT_FIRST", v.name + " made the first leaf bed.", [v.id], {}, 1);
    else if (s.w === "rack") once(sim, "firstRack", "BUILT_FIRST", v.name + " built the first drying rack.", [v.id], {}, 1);
    void f;
  }
  sim.ents.remove(s.id);
  bumpSites(sim);
  return null;
}

export const MAT_NAME = (m) => (MAT[m] ? MAT[m].name : "?");

// ---- deconstruction (S4b) ----
// The player marks BUILT pieces; each mark is a "dsite" entity {w, x,y,z (stand cell), rv, rt}. A villager takes it
// down as a derived STANDING-class job (jobs.js genDeconstruct, verb "unbuild"), and ~75% of the materials come back
// as loose items. It pays NO XP (taking down what you put up must not be a grind, R17) and never touches natural
// terrain: only cells flagged F.PLAYER, and doors / beds / racks.
export const REFUND = 0.75;
export const UNBUILD_DUR = { wall: 80, floor: 40, roof: 50, door: 60, bed: 80, rack: 100 };

/** The built piece of kind w standing at stand cell (x,y,z): {cell:[x,y,z]} | {ent} | null. */
export function builtPiece(sim, w, x, y, z) {
  const wd = sim.world;
  if (w === "door" || w === "bed" || w === "rack") {
    for (const id of sim.ents.at(x, y, z)) { const e = sim.ents.get(id); if (e.kind === "furniture" && e.f === w) return { ent: e }; }
    return null;
  }
  const [cx, cy, cz] = cellOf(w, x, y, z), k = BMAT_OF[wd.mat(cx, cy, cz)];
  return k && BMAT[k].role === w && (wd.flags(cx, cy, cz) & F.PLAYER) ? { cell: [cx, cy, cz], key: k } : null;
}

/** {type:"deconstruct", x0,y0,x1,y1,z}: mark every built piece in the rectangle (stand level z) for removal. */
export function markDeconstruct(sim, c) {
  let n = 0;
  const have = new Set(sim.ents.ofKind("dsite").map(d => d.w + ":" + d.x + ":" + d.y + ":" + d.z));
  for (let y = Math.min(c.y0, c.y1); y <= Math.max(c.y0, c.y1); y++) for (let x = Math.min(c.x0, c.x1); x <= Math.max(c.x0, c.x1); x++) {
    for (const w of PIECES) {
      if (have.has(w + ":" + x + ":" + y + ":" + c.z) || !builtPiece(sim, w, x, y, c.z)) continue;
      sim.ents.add("dsite", { w, x, y, z: c.z, rv: 0, rt: 0 }); n++;
    }
  }
  if (n) { sim.cache.iv++; sim.board.ep++; }
  return n > 0;
}

/** Take the piece down now (the unbuild verb): refund loose at the stand cell. Returns null or a blocker. */
export function unbuild(sim, d) {
  const p = builtPiece(sim, d.w, d.x, d.y, d.z), wd = sim.world;
  if (!p) { sim.ents.remove(d.id); sim.cache.iv++; return "GONE"; }
  let item, n;
  if (p.ent) {
    const f = FURN[d.w]; item = f.item; n = f.n;
    if (p.ent.owner) { const o = sim.ents.get(p.ent.owner); if (o && o.bed === p.ent.id) o.bed = 0; }
    sim.ents.remove(p.ent.id);
    if (d.w === "door") wd.markDirty(d.x, d.y, d.z);
  } else {
    const b = BMAT[p.key]; item = b.item; n = b.n;
    const [cx, cy, cz] = p.cell;
    wd.set(cx, cy, cz, d.w === "floor" ? M.DIRT : M.AIR, wd.flags(cx, cy, cz) & ~F.PLAYER);
  }
  dropLoose(sim, item, Math.max(1, Math.round(n * REFUND)), d.x, d.y, d.z);
  sim.ents.remove(d.id);
  sim.cache.iv++;
  return null;
}
