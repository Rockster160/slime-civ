// Anti-grind bot (GDD §10 R17, §09 exploits): XP comes from real, net-new output.
//   1. Commands never pay XP: place/dig the same cell thousands of times and no
//      villager's skill XP moves by a single point.
//   2. Gathering and chopping are skill-less: chop orders pay no XP in any skill, on any ground.
//   3. Dig: villagers digging natural ground earn dig XP (control); digging blocks the player placed, or ground that
//      was ever built on (the USED "virgin" bit survives the player's own dig command), pays zero, however often repeated.
//   4. Craft: making the same rack on the same cell again and again pays XP once.
//   node game/tests/bots/grind.js
import { DUR_DAY } from "../../src/sim/clock.js";
const DIG_TICKS = 7 * DUR_DAY;      // ticks of digging per run
import "../legacy.js";
import assert from "node:assert/strict";
import { Sim } from "../../src/sim/sim.js";
import { M, F } from "../../src/sim/world.js";
import { isAdult } from "../../src/sim/villager.js";
import { SKILLS } from "../../src/sim/skills.js";
import { Task } from "../../src/sim/tasks.js";
import { runAction } from "../../src/sim/actions.js";
import { RACK_COST } from "../../src/sim/board.js";

const xpSum = (sim, skill) => sim.ents.ofKind("villager").reduce((a, v) => a + v.sk[skill].xp, 0);
const allXp = (sim) => SKILLS.map(s => xpSum(sim, s));

// ---- 1. command grind ----
{
  const sim = Sim.create(3);
  const before = allXp(sim);
  const cell = { x: 70, y: 60, z: 16 };
  for (let i = 0; i < 4000; i++) {
    sim.apply({ type: "place", ...cell, mat: M.STONE });
    sim.apply({ type: "dig", ...cell });
  }
  assert.deepEqual(allXp(sim), before, "place/dig commands changed someone's XP");
  assert.equal(sim.world.flags(cell.x, cell.y, cell.z) & F.PLAYER, 0, "dug cell should drop its player flag");
  sim.apply({ type: "place", ...cell, mat: M.STONE });
  assert.ok(sim.world.flags(cell.x, cell.y, cell.z) & F.PLAYER, "placed cell carries the player flag");
  console.log("command grind ok: 8000 place/dig commands, XP unchanged", JSON.stringify(before.map(x => +x.toFixed(2))));
}

// ---- 2. chopping is skill-less: no XP anywhere, but the work happens ----
function chopRun(flagged) {
  const sim = Sim.create(3);
  const trees = sim.ents.ofKind("plant").filter(p => p.species === "tree");
  if (flagged) for (const t of trees) sim.world.setFlags(t.x, t.y, t.z - 1, sim.world.flags(t.x, t.y, t.z - 1) | F.PLAYER);
  const before = allXp(sim);
  const saplings0 = sim.ents.ofKind("plant").filter(p => p.species === "sapling" || (p.species === "stump" && p.fl)).length;
  for (let t = 0; t < DIG_TICKS; t++) {
    if (t % 100 === 0) {
      const tree = sim.ents.ofKind("plant").filter(p => p.species === "tree")
        .sort((a, b) => Math.abs(a.x - 64) + Math.abs(a.y - 64) - Math.abs(b.x - 64) - Math.abs(b.y - 64))[0];
      const ids = sim.ents.ofKind("villager").filter(v => isAdult(sim, v)).map(v => v.id);
      sim.apply({ type: "order", ids, verb: "chop", tid: tree.id });
    }
    sim.step();
  }
  const felled = sim.ents.ofKind("plant").filter(p => p.species === "sapling" || (p.species === "stump" && p.fl)).length - saplings0;      // S10: a felled tree leaves a stump (which may sprout into a sapling or rot)
  return { felled, after: allXp(sim), before };
}
for (const flagged of [false, true]) {
  const r = chopRun(flagged);
  assert.ok(r.felled >= 3, "chopping should still happen");
  // only crafting/building by the village's own beds and racks may have moved: chop itself is in no skill
  console.log(`chop (${flagged ? "player ground" : "control"}): felled ${r.felled}, xp ${JSON.stringify(r.before.map(x => +x.toFixed(2)))} -> ${JSON.stringify(r.after.map(x => +x.toFixed(2)))}`);
  assert.equal(r.after[0], r.before[0], "chopping paid dig XP");
}

// ---- 3. dig: natural pays, placed / ever-built ground does not ----
function digRun(prep) {
  const sim = Sim.create(3);
  const z = sim.stock.z - 1, px = sim.stock.x1 + 5, py = sim.stock.y0 + 2;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = px + dx, y = py + dy;
    sim.world.set(x, y, z, M.DIRT, 0); sim.world.set(x, y, z + 1, M.AIR, 0);
    for (const id of sim.ents.at(x, y, z + 1).slice()) { const e = sim.ents.get(id); if (e.kind === "plant") sim.ents.remove(id); }
    sim.world.setFlags(x, y, z + 1, 0);
    prep(sim, x, y, z);
  }
  const ids = sim.ents.ofKind("villager").filter(v => isAdult(sim, v)).slice(0, 2).map(v => v.id);
  for (const v of sim.ents.ofKind("villager")) v.hunger = v.thirst = v.energy = 1;
  sim.apply({ type: "order", ids, verb: "dig", x: px, y: py, z });
  let cells = 25;
  for (let t = 0; t < DIG_TICKS && cells > 0; t++) {
    if (t % 50 === 0) for (const v of sim.ents.ofKind("villager")) { v.hunger = v.thirst = v.energy = v.warm = 1; }
    sim.step();
    cells = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (sim.world.mat(px + dx, py + dy, z) !== M.AIR) cells++;
  }
  return { dug: 25 - cells, xp: xpSum(sim, "dig") };
}
const natural = digRun(() => {});
const placed = digRun((sim, x, y, z) => { sim.apply({ type: "place", x, y, z, mat: M.DIRT }); });
const placedThenCmdDug = digRun((sim, x, y, z) => {                     // place, dig by command (clears PLAYER), refill: only USED remembers
  sim.apply({ type: "place", x, y, z, mat: M.STONE }); sim.apply({ type: "dig", x, y, z });
  sim.world.set(x, y, z, M.DIRT, sim.world.flags(x, y, z));
});
console.log(`dig: natural ground ${natural.dug} cells -> +${natural.xp.toFixed(2)} XP; placed ${placed.dug} -> +${placed.xp.toFixed(2)}; placed, dug by command, refilled ${placedThenCmdDug.dug} -> +${placedThenCmdDug.xp.toFixed(2)}`);
const base = Sim.create(3).ents.ofKind("villager").reduce((a, v) => a + v.sk.dig.xp, 0);
assert.ok(natural.dug >= 5 && natural.xp - base > 0.3, "control dig run should dig and learn");
assert.ok(placed.dug >= 5 && Math.abs(placed.xp - base) < 1e-9, "digging player-placed blocks paid XP");
assert.ok(placedThenCmdDug.dug >= 5 && Math.abs(placedThenCmdDug.xp - base) < 1e-9, "digging once-built ground paid XP");

// ---- 4. craft: the same rack on the same cell, over and over ----
{
  const sim = Sim.create(3), v = sim.ents.ofKind("villager").find(q => isAdult(sim, q));
  const x = v.x, y = v.y, z = v.z, gains = [];
  for (let cycle = 0; cycle < 4; cycle++) {
    const before = v.sk.craft.xp;
    for (const id of sim.ents.at(x, y, z).slice()) { const e = sim.ents.get(id); if (e.kind === "furniture" || e.kind === "site") sim.ents.remove(id); }   // take the last one down
    const site = sim.ents.add("site", { what: "rack", x, y, z, rv: 0, rt: 0 });
    v.carry = { item: RACK_COST.item, n: RACK_COST.n };
    v.action = Task("build_rack", [{ v: "build", tid: site.id, x, y, z, item: RACK_COST.item, n: RACK_COST.n, dur: 360 }]);
    for (let t = 0; t < 2000 && v.action; t++) runAction(sim, v);
    gains.push(+(v.sk.craft.xp - before).toFixed(3));
  }
  console.log("craft: XP for the same rack made 4 times:", JSON.stringify(gains));
  assert.ok(gains[0] > 0.01 && gains.slice(1).every(g => g === 0), "rebuilding the same rack paid XP again");
}
console.log("grind bot ok");
