// Chunk paging, the UI side (8.26): gives each sim its cold store, keeps the land under the camera in memory, and asks the store for the chunks the anchors are walking back to.
// The sim never reads the camera: paging is invisible to its hash (sim/paging.js), so this only decides what is in memory when it is looked at.
import { enablePaging, keepNear, wantedKeys } from "../sim/paging.js";
import { anchorsOf, ACT_CH } from "../sim/chunks.js";
import { chunkKey } from "../sim/cellkey.js";
import { createCold, sweep } from "./cold.js";
import { getStore, storeReady } from "./saves.js";

export function createPaging(game, cam) {
  let sim = null, cold = null, n = 0;
  storeReady.then(s => sweep(s.primary && s.primary.name === "IndexedDB" ? s.primary : null));       // scratch left by an earlier page
  const attach = (s) => {
    if (cold) cold.dispose();
    sim = s; cold = createCold(() => getStore().primary);
    enablePaging(s, cold);
    game.cold = cold;
  };
  return {
    frame() {
      if (game.sim !== sim) attach(game.sim);
      if ((++n & 7) !== 0) return;
      const w = sim.world;
      if (!w.ev.size) { sim.pg.keep = new Set(); if (cold.spilled.size) cold.trim(); return; }
      const half = Math.min(5, Math.ceil(Math.max(cam.vw, cam.vh) / Math.max(1, cam.zoom) / 32) + 1), ccx = Math.floor(cam.x) >> 4, ccy = Math.floor(cam.y) >> 4, keys = [];
      for (let cx = ccx - half; cx <= ccx + half; cx++) for (let cy = ccy - half; cy <= ccy + half; cy++) keys.push(chunkKey(cx, cy));
      cold.prefetch(keepNear(sim, keys));
      const ac = new Set(anchorsOf(sim).map(([x, y]) => chunkKey(x >> 4, y >> 4)));
      cold.prefetch(wantedKeys(sim, ac, ACT_CH + 2));
      cold.trim();
    },
    /** A save needs every record in memory. */
    settle: () => (cold ? cold.settle() : Promise.resolve()),
  };
}
