// K3 labour share (S18b, D35): from the `settled` fixture over one calendar day, the share of adult LABOUR spent on food stays between
// 30% and 70% (K3 asks 40-60% early). Labour = ticks an adult spends in an order / standing / demand / village-critical job (not sleeping, eating,
// drinking, leisure or tinkering). Food jobs = forage, hunt, dry, cook, smoke, the field and pen jobs. Sampled every 5 ticks.
//   node tests/k3.js
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { DAY } from "../src/sim/clock.js";
import { isAdult, dailyNeed } from "../src/sim/villager.js";
import { ITEMS, inStore } from "../src/sim/items.js";

const FOOD = new Set(["forage", "hunt", "dry", "cook", "smoke", "fodder", "slaughter", "sow", "harvest", "till", "water_crop", "fence", "capture"]);
const LABOUR = new Set(["order", "standing", "demand", "vcrit"]);
export function labourShare(sim, days = 1) {
  const n = {}; let labour = 0, food = 0, awake = 0;
  for (let i = 0; i < days * DAY; i++) {
    sim.step();
    if (i % 5) continue;
    for (const v of sim.ents.ofKind("villager")) {
      if (!isAdult(sim, v) || v.slp === 1) continue;
      awake++;
      if (!v.job || !LABOUR.has(v.job.c)) continue;
      labour++; n[v.job.k] = (n[v.job.k] || 0) + 1;
      if (FOOD.has(v.job.k)) food++;
    }
  }
  return { share: labour ? food / labour : 0, labour, food, awake, n };
}
/** Trim the food in the stockpile to `days` of rations for the village: K3 describes a village that is feeding itself, not one sitting on a surplus (a day sampled at random from a full larder has no foraging in it at all). */
export function leanLarder(sim, days) {
  const need = dailyNeedAll(sim) * days;
  let keep = need;
  for (const s of sim.ents.ofKind("item").slice()) {
    if (!ITEMS[s.item].food || !inStore(sim, s.x, s.y, s.z)) continue;
    const f = ITEMS[s.item].food, k = Math.min(s.n, Math.floor(keep / f));
    keep -= k * f;
    if (k <= 0) sim.ents.remove(s.id); else s.n = k;
  }
  sim.cache.iv++;
}
const dailyNeedAll = (sim) => sim.ents.ofKind("villager").reduce((a, v) => a + dailyNeed(sim, v), 0);
if (process.argv[1].endsWith("k3.js")) {
  const sim = loadFixture("settled");
  leanLarder(sim, 1.5);
  const r = labourShare(sim);
  console.log(`K3: ${(100 * r.share).toFixed(1)}% of labour on food (${r.food} of ${r.labour} samples; labour is ${(100 * r.labour / r.awake).toFixed(0)}% of awake adult time)`, JSON.stringify(r.n));
  assert.ok(r.share >= 0.3 && r.share <= 0.7, "K3: 30-70% of labour on food, got " + (100 * r.share).toFixed(1));
  console.log("k3 ok");
}
