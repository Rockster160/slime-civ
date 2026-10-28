// Rooms (GDD §12.5): derived from cells, never stored as truth.
//
// A room is a connected set of stand-level cells (air with solid ground below,
// 4-connected in the plane at ONE z) that is closed on all sides by solid cells
// (walls, natural rock) or doors, up to FLOOD_CAP cells. Doors are furniture
// entities: they connect rooms for walking but separate them for identity.
//   bounded  = the flood closed.
//   roofed   = every cell has a solid cell within ROOF_H above it (natural overhead rock counts).
//   enclosed = bounded AND roofed: only these warm anyone.
// A bounded component only counts as a room if it touches something the player
// built (a F.PLAYER wall/roof cell or a door), so a sealed natural pocket is not "a room".
//
// Roof representation (design call): a roof is an ordinary solid cell one level
// above the stand cell (z+1), not a per-cell flag. That keeps pathing, rendering,
// room checks and natural overhead all one rule: "is something solid above me?".
//
// Incremental update: world.set() logs touched cells in world.dirty. For each
// dirty cell we re-flood from the cells it could have changed (its column, from
// 3 levels below to 1 above, and its 4 neighbours), after dropping the rooms
// that contained any of those cells. fullRebuild() seeds from every player-built
// cell instead; tests/rooms.js checks both give identical rooms after random edits.
//
// Only `marks` (the player's purpose zones) is saved; everything else is rebuilt.
import { World, MAT, M, F } from "./world.js";

export const FLOOD_CAP = 128;       // twice the shelter's soft max of 64 cells; bigger spaces are "outdoors / yard"
export const ROOF_H = 3;            // §12.3 H: a roof counts if within 3 cells above
export const ROOM_WARM = 0.75;      // warmth bonus per unit of mean insulation: wattle+thatch (0.43) -> +0.32
export const DOOR_INS = 0.2;        // a wooden door is a poor seal
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Rooms {
  constructor() {
    this.marks = {};               // saved: cell index -> purpose ("shelter" | "workshop")
    this.list = new Map();         // anchor (lowest cell index) -> room
    this.cellRoom = new Map();     // cell index -> room
    this.version = 0;              // bumps when the set of rooms changes (UI and caches key on it)
  }

  toJSON() { return { marks: this.marks }; }

  /** Room containing a stand cell, or null. */
  at(x, y, z) { return this.cellRoom.get(World.idx(x, y, z)) || null; }
  /** Rooms in anchor order (deterministic). */
  all() { return [...this.list.keys()].sort((a, b) => a - b).map(k => this.list.get(k)); }

  /** Apply pending world edits. Cheap when nothing changed. */
  update(sim) {
    const w = sim.world;
    if (!w.dirty.length) return;
    const seeds = seedsFor(w.dirty);
    w.dirty.length = 0;
    this._reflood(sim, seeds);
  }

  /** From scratch: seeds are every player-built cell and door. Used after load and by tests. */
  fullRebuild(sim) {
    this.list.clear(); this.cellRoom.clear();
    const w = sim.world, cells = [];
    if (w.log) for (const i of w.log) {
      const [x, y, z] = World.xyz(i);
      if (w.flags(x, y, z) & F.PLAYER) cells.push(i);
    }
    for (const f of sim.ents.ofKind("furniture")) if (f.f === "door") cells.push(World.idx(f.x, f.y, f.z));
    w.dirty.length = 0;
    this._reflood(sim, seedsFor(cells));
  }

  _reflood(sim, seeds) {
    for (const s of seeds) { const r = this.cellRoom.get(s); if (r) this._drop(r); }
    const failed = new Set();
    for (const s of seeds) {
      if (this.cellRoom.has(s) || failed.has(s)) continue;
      const res = flood(sim, s, failed);
      if (res) this._add(res);
    }
    this.version++;
  }
  _drop(r) {
    this.list.delete(r.id);
    for (const c of r.cells) this.cellRoom.delete(c);
  }
  _add(r) {
    this.list.set(r.id, r);
    for (const c of r.cells) this.cellRoom.set(c, r);
    r.purpose = this.purposeOf(r);
  }

  purposeOf(r) {
    let p = "none";
    for (const k of Object.keys(this.marks)) {
      if (this.cellRoom.get(Number(k)) === r) { p = this.marks[k]; break; }
    }
    return p;
  }

  /** {type:"purpose"}: zones always win over auto-detection (§12.5). */
  setPurpose(sim, x, y, z, p) {
    const r = this.at(x, y, z);
    if (!r) return false;
    for (const k of Object.keys(this.marks)) if (this.cellRoom.get(Number(k)) === r) delete this.marks[k];
    if (p && p !== "none") this.marks[World.idx(x, y, z)] = p;
    for (const q of this.list.values()) q.purpose = this.purposeOf(q);
    this.version++;
    return true;
  }

  /** Plain-data view for equality tests: rooms sorted by anchor, without purpose (derived from marks). */
  canon() {
    return this.all().map(r => [r.id, r.cells.length, r.roofed, Math.round(r.ins * 1000), r.enclosed ? 1 : 0, r.cells.join(",")].join("|"));
  }
}

/** Cells that an edit at `dirty` could have changed the room membership of. Sorted, deduped: processing order must not depend on history. */
function seedsFor(dirty) {
  const out = new Set();
  for (const i of dirty) {
    const [x, y, z] = World.xyz(i);
    for (let lev = Math.max(1, z - ROOF_H); lev <= z + 1; lev++) {
      out.add(World.idx(x, y, lev));
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < 128 && ny < 128) out.add(World.idx(nx, ny, lev));
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

const isDoor = (sim, x, y, z) => {
  const ids = sim.ents.at(x, y, z);
  for (let i = 0; i < ids.length; i++) { const e = sim.ents.get(ids[i]); if (e.kind === "furniture" && e.f === "door") return true; }
  return false;
};
const standable = (w, x, y, z) => w.mat(x, y, z) === M.AIR && w.isSolid(x, y, z - 1);

/** Flood from a seed cell. Returns a room record or null; every visited cell of a non-room goes in `failed`. */
function flood(sim, seed, failed) {
  const w = sim.world, [sx, sy, z] = World.xyz(seed);
  if (z < 1 || !standable(w, sx, sy, z) || isDoor(sim, sx, sy, z)) { failed.add(seed); return null; }
  const seen = new Set([seed]), q = [seed], cells = [];
  let open = false, touch = false, faceSum = 0, faces = 0;
  while (q.length) {
    const c = q.pop();
    cells.push(c);
    if (cells.length > FLOOD_CAP) { open = true; break; }
    const x = c % 128, y = Math.floor(c / 128) % 128;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= 128 || ny >= 128) { open = true; continue; }
      const m = w.mat(nx, ny, z);
      if (m === M.AIR) {
        if (isDoor(sim, nx, ny, z)) { touch = true; faceSum += DOOR_INS; faces++; continue; }
        if (!w.isSolid(nx, ny, z - 1)) { open = true; continue; }          // a drop or water beside us: not closed
        const n = World.idx(nx, ny, z);
        if (!seen.has(n)) { seen.add(n); q.push(n); }
      } else if (MAT[m].solid) {
        faceSum += MAT[m].ins; faces++;
        if (w.flags(nx, ny, z) & F.PLAYER) touch = true;
      } else open = true;                                                  // water
    }
    if (open) break;
  }
  if (open) { for (const c of seen) failed.add(c); return null; }
  cells.sort((a, b) => a - b);
  let roofed = 0;
  for (const c of cells) {
    const x = c % 128, y = Math.floor(c / 128) % 128;
    for (let k = 1; k <= ROOF_H; k++) {
      const m = w.mat(x, y, z + k);
      if (m !== M.AIR && MAT[m].solid) {
        roofed++; faceSum += MAT[m].ins; faces++;
        if (w.flags(x, y, z + k) & F.PLAYER) touch = true;
        break;
      }
    }
  }
  if (!touch) { for (const c of seen) failed.add(c); return null; }
  const enclosed = roofed === cells.length;
  const ins = faces ? faceSum / faces : 0;
  return { id: cells[0], z, cells, n: cells.length, roofed, enclosed, ins, warm: enclosed ? ROOM_WARM * ins : 0, purpose: "none", occT: -1, occ: 0 };
}

/** How many villagers stand in the room right now (cached per tick). */
export function occupants(sim, room) {
  if (room.occT === sim.tick) return room.occ;
  let n = 0;
  for (const v of sim.ents.ofKind("villager")) if (sim.rooms.cellRoom.get(World.idx(v.x, v.y, v.z)) === room) n++;
  room.occT = sim.tick; room.occ = n;
  return n;
}
