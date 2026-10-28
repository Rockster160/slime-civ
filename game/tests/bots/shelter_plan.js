// The shelter bot's build plan (shared with tests): a scripted player who closes in ONE roofed room with beds
// before winter, using only player-facing commands (keep-N targets, one build command).
import { anySpot, clearArea } from "../helpers.js";

/** Cells of a hut: outer w x h, wattle walls, door on the south side, thatch roof over the interior, beds in rows. */
export function hutCells(z, x0, y0, w, h, beds) {
  const cells = [];
  const dx = x0 + (w >> 1), dy = y0 + h - 1;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const edge = x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1;
    if (edge) cells.push(x === dx && y === dy ? { w: "door", x, y, z } : { w: "wall", m: "wattle", x, y, z });
    else {
      cells.push({ w: "roof", m: "thatch", x, y, z });
    }
  }
  let b = 0;
  for (let y = y0 + 1; y < y0 + h - 1 && b < beds; y++) for (let x = x0 + 1; x < x0 + w - 1 && b < beds; x += 2) { if (y === y0 + h - 2 && x === dx) continue; cells.push({ w: "bed", x, y, z }); b++; }
  return cells;
}

/** Returns an onTick(sim) callback for runSeed. */
export function shelterBot({ day = 6, w = 8, h = 6, beds = 6 } = {}) {
  let done = false, zoned = false, at = null;
  return (sim) => {
    if (done && !zoned && sim.tick % 600 === 0 && at) {            // the room exists: say what it is for (zones win over auto-detection)
      if (sim.rooms.at(at[0], at[1], at[2])) {
        sim.apply({ type: "purpose", x: at[0], y: at[1], z: at[2], p: "shelter" });
        sim.apply({ type: "unkeep", item: "stick" }); sim.apply({ type: "unkeep", item: "grass" });     // done stockpiling: standing orders would outrank foraging
        zoned = true;
      }
    }
    if (done || sim.tick < day * 1800) return;
    done = true;
    const spot = anySpot(sim, w, h);
    const [x0, y0, z, hw, hh] = spot;
    clearArea(sim, x0, y0, hw, hh, z);
    sim.apply({ type: "keep", item: "stick", n: 50 });
    sim.apply({ type: "keep", item: "grass", n: 40 });
    sim.apply({ type: "build", cells: hutCells(z, x0, y0, hw, hh, beds) });
    at = [x0 + 1, y0 + 1, z];
  };
}
