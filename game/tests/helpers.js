// Shared by the S4a tests: build things instantly (bypassing villagers) or find flat ground.
import { M, F } from "../src/sim/world.js";

/**
 * Nearest flat rectangle (w x h) to camp, at any one level, off the stockpile and clear of furniture and ghosts.
 * Returns [x0, y0, z] where z is the stand level of the footprint. `skip` skips that many matches (for a second hut).
 */
export function flatSpot(sim, w, h, skip = 0) {
  const spots = [], S = sim.site;
  for (let y = S.y - 24; y < S.y + 26 - h; y++) for (let x = S.x - 24; x < S.x + 26 - w; x++) spots.push([x, y]);
  const d2 = (s) => (s[0] + w / 2 - S.x) ** 2 + (s[1] + h / 2 - S.y) ** 2;
  spots.sort((a, b) => d2(a) - d2(b) || a[1] - b[1] || a[0] - b[0]);
  let found = 0;
  for (const [x, y] of spots) {
    const z = sim.world.standZ(x, y);
    if (z < 0) continue;
    if (z === sim.stock.z && x + w > sim.stock.x0 - 1 && x < sim.stock.x1 + 2 && y + h > sim.stock.y0 - 1 && y < sim.stock.y1 + 2) continue;
    let ok = true;
    for (let j = 0; j < h && ok; j++) for (let i = 0; i < w && ok; i++) {
      if (sim.world.standZ(x + i, y + j) !== z) ok = false;
      else for (const id of sim.ents.at(x + i, y + j, z)) if (["furniture", "site", "csite"].includes(sim.ents.get(id).kind)) ok = false;
    }
    if (ok && found++ >= skip) return [x, y, z];
  }
  throw new Error("no flat spot " + w + "x" + h);
}

/** Wall ring (outer w x h) with a door on the south side, written straight into the world. */
export function instantHut(sim, x0, y0, w, h, { roof = true, door = true, wall = M.WATTLE, roofMat = M.THATCH, z = sim.stock.z } = {}) {
  const wd = sim.world;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const edge = x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1;
    const dx = x0 + (w >> 1), dy = y0 + h - 1;
    if (edge && !(door && x === dx && y === dy)) wd.set(x, y, z, wall, wd.flags(x, y, z) | F.PLAYER);
    else if (!edge && roof) wd.set(x, y, z + 1, roofMat, wd.flags(x, y, z + 1) | F.PLAYER);
  }
  if (door) {
    const dx = x0 + (w >> 1), dy = y0 + h - 1;
    sim.ents.add("furniture", { f: "door", x: dx, y: dy, z, owner: 0, rv: 0, rt: 0 });
    wd.markDirty(dx, dy, z);
  }
  sim.rooms.update(sim);
}

/** Remove plants and items in a rectangle (and the tree-obstacle flags), so ghosts can be placed there. */
export function clearArea(sim, x0, y0, w, h, z = sim.stock.z) {
  for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) {
    for (const id of sim.ents.at(x, y, z).slice()) { const e = sim.ents.get(id); if (e.kind === "plant" || e.kind === "item") sim.ents.remove(id); }
    sim.world.setFlags(x, y, z, sim.world.flags(x, y, z) & ~F.OBSTACLE);
  }
  sim.cache.iv++;
}

/** Terraform a rectangle to a flat stand level z (ground at z-1, air above) and clear what stood on it: for big test structures. */
export function levelGround(sim, x0, y0, w, h, z) {
  const wd = sim.world;
  for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) {
    for (let k = 0; k <= 4; k++) if (wd.mat(x, y, z + k) !== M.AIR) wd.set(x, y, z + k, M.AIR, 0);
    for (let k = z - 1; k >= z - 4; k--) if (wd.mat(x, y, k) === M.AIR || wd.mat(x, y, k) === M.WATER) wd.set(x, y, k, M.DIRT, 0);
    if (wd.mat(x, y, z - 1) !== M.DIRT) wd.set(x, y, z - 1, M.DIRT, 0);
    for (const id of sim.ents.at(x, y, z).slice()) { const e = sim.ents.get(id); if (e.kind === "plant" || e.kind === "item") sim.ents.remove(id); }
    wd.setFlags(x, y, z, 0);
  }
  sim.cache.iv++;
}

/** The biggest hut footprint that fits: [x0, y0, z, w, h]. Tries the wanted size, then smaller ones. */
export function anySpot(sim, w = 7, h = 6, skip = 0) {
  for (const [sw, sh] of [[w, h], [7, 6], [7, 5], [6, 5], [6, 4], [5, 4]]) {
    try { return [...flatSpot(sim, sw, sh, skip), sw, sh]; } catch (e) { /* smaller */ }
  }
  throw new Error("no flat spot for a hut");
}
