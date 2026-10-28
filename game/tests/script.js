// Shared test helper: a scripted command timeline, so both sims in a test
// receive identical player input at identical ticks.
import { M } from "../src/sim/world.js";
import { anySpot, clearArea } from "./helpers.js";
import { hutCells } from "./bots/shelter_plan.js";
import { possessed } from "../src/sim/possess.js";
import { isAdult } from "../src/sim/villager.js";

/** Where the script's hut stands, read back from the command log so a LOADED sim finds it too. */
function hutOf(sim) {
  const c = sim.cmdLog.find(q => q.type === "build" && q.cells.length > 20);
  if (!c) return null;
  const xs = c.cells.map(q => q.x), ys = c.cells.map(q => q.y);
  return { x: Math.min(...xs), y: Math.min(...ys), z: c.cells[0].z, w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
}

/** Deterministic command script keyed by tick. */
export function scriptAt(tick, sim) {
  const S = sim.site;                          // S16: the camp is where the spawn search put it (the origin for most seeds), not (64, 64)
  if (tick === 500) return [{ type: "spawn", x: S.x + 2, y: S.y + 2 }];
  if (tick === 2000) return [{ type: "place", x: S.x + 6, y: S.y, z: 14, mat: M.STONE }, { type: "place", x: S.x + 6, y: S.y + 1, z: 14, mat: M.STONE }];
  if (tick === 4000) return [{ type: "dig", x: S.x + 6, y: S.y, z: 14 }];
  if (tick === 7000) return [{ type: "dig", x: S.x - 4, y: S.y - 4, z: 13 }];   // hole under whoever walks there
  if (sim && tick === 3000) {                 // orders + a standing order, so saves cover them
    const vs = sim.ents.ofKind("villager").slice(0, 3).map(v => v.id);
    const tree = sim.ents.ofKind("plant").filter(p => p.species === "tree").sort((a, b) => Math.abs(a.x - S.x) + Math.abs(a.y - S.y) - Math.abs(b.x - S.x) - Math.abs(b.y - S.y))[0];
    return [{ type: "order", ids: vs, verb: "chop", tid: tree.id }, { type: "keep", item: "stick", n: 20 }];
  }
  if (sim && tick === 9000) return [{ type: "cancel" }, { type: "unkeep", item: "stick" }, { type: "keep", item: "log", n: 12 }];
  // S4a: construction state in every save: a hut (sites, then a room), a purpose, a captured + stamped blueprint, a dig order.
  if (sim && tick === 1200) {
    const [x, y, z, w, h] = anySpot(sim); clearArea(sim, x, y, w, h, z);
    return [{ type: "keep", item: "stick", n: 40 }, { type: "keep", item: "grass", n: 30 }, { type: "build", cells: hutCells(z, x, y, w, h, 3) }];
  }
  if (sim && tick === 40000 && hutOf(sim)) {
    const h = hutOf(sim);
    return [{ type: "purpose", x: h.x + 2, y: h.y + 2, z: h.z, p: "shelter" }, { type: "blueprint", op: "capture", name: "Hut", x0: h.x, y0: h.y, x1: h.x + h.w - 1, y1: h.y + h.h - 1, z: h.z }, { type: "unkeep", item: "stick" }, { type: "unkeep", item: "grass" }];
  }
  if (sim && tick === 41000 && sim.bps.list.length) {
    const [x, y, z, w, h] = anySpot(sim); clearArea(sim, x, y, w, h, z);
    return [{ type: "blueprint", op: "auto", id: sim.bps.list[0].id, on: true }, { type: "build", bp: sim.bps.list[0].id, cells: hutCells(z, x, y, w, h, 2) }];
  }
  if (sim && tick === 60000) {
    const v = sim.ents.ofKind("villager").slice(0, 2).map(q => q.id);
    return [{ type: "order", ids: v, verb: "dig", x: S.x + 6, y: S.y - 8, z: sim.stock.z - 1 }];
  }
  // S4b: a possession spell (20000..29000) so saves and replays cover it: walk a square, interact with whatever is beside us.
  if (sim && tick === 20000) { const v = sim.ents.ofKind("villager").find(q => isAdult(sim, q)); if (v) return [{ type: "possess", id: v.id }]; }
  if (sim && tick > 20000 && tick < 29000 && tick % 40 === 0) {
    const v = possessed(sim);
    if (v) {
      const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][Math.floor(tick / 400) % 4];
      let tid = 0;
      if (tick % 400 === 0) for (const dz of [0, 1, -1]) for (const id of sim.ents.at(v.x + d[0], v.y + d[1], v.z + dz)) if (sim.ents.get(id).kind === "plant") tid = id;
      return [{ type: "pinput", id: v.id, dx: tid ? 0 : d[0], dy: tid ? 0 : d[1], tid, verb: "" }];
    }
  }
  if (sim && tick === 29000) return [{ type: "release" }];
  if (tick > 0 && tick % 9973 === 0) return [{ type: "spawn", x: S.x + (tick % 7), y: S.y }];
  return [];
}

/** Advance a sim n ticks, applying the script before each step. */
export function run(sim, n, onTick) {
  for (let i = 0; i < n; i++) {
    for (const c of scriptAt(sim.tick, sim)) sim.apply(c);
    sim.step();
    if (onTick) onTick(sim);
  }
}
