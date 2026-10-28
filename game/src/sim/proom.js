// Provisional rooms (S4b playtest): a room only exists once its door is in, so a player who has built
// walls and a roof sees nothing happen. This finds the "almost room": flood over ROOFED stand cells from a
// point; if it stays small and bounded by walls except for one or two open cells with no roof (the door gap),
// report it with the gap. Pure and derived (never saved). Rooms proper stay in rooms.js.
import { World } from "./world.js";
import { ROOF_H, FLOOD_CAP } from "./rooms.js";

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const roofed = (w, x, y, z) => { for (let k = 1; k <= ROOF_H; k++) if (w.isSolid(x, y, z + k)) return true; return false; };

/**
 * -> {cells:[[x,y]], z, gaps:[[x,y]], planned:bool} | null. Looks at stand levels z, z-1 .. z-4 (a roof hides the floor from above).
 * planned = every gap already has a door ghost on it (waiting for villagers to build it).
 */
export function provisionalRoom(sim, x, y, z) {
  const w = sim.world;
  for (let dz = 0; dz < 5; dz++) {
    const sz = z - dz;
    if (!w.isWalkable(x, y, sz) || !roofed(w, x, y, sz) || sim.rooms.at(x, y, sz)) continue;
    const seen = new Set([World.idx(x, y, sz)]), cells = [[x, y]], gaps = new Map();
    for (let i = 0; i < cells.length; i++) {
      const [cx, cy] = cells[i];
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy, k = World.idx(nx, ny, sz);
        if (seen.has(k) || !w.isWalkable(nx, ny, sz)) continue;     // wall, rock or water stops the flood
        if (roofed(w, nx, ny, sz)) {
          seen.add(k); cells.push([nx, ny]);
          if (cells.length > FLOOD_CAP) return null;                  // a yard under a big cliff, not a room
        } else gaps.set(k, [nx, ny]);
      }
    }
    if (cells.length < 2 || gaps.size === 0 || gaps.size > 2) continue;
    const planned = [...gaps.values()].every(([gx, gy]) => sim.ents.at(gx, gy, sz).some(id => { const e = sim.ents.get(id); return e.kind === "csite" && e.w === "door"; }));
    return { cells, z: sz, gaps: [...gaps.values()], planned };
  }
  return null;
}
