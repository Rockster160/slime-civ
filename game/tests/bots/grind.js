// Anti-grind bot (GDD §10 R17, §09 exploits): XP comes from real, net-new output.
//   1. Commands never pay XP: place/dig the same cell thousands of times and no
//      villager's skill XP moves by a single point.
//   2. Re-working player-placed ground pays nothing: villagers ordered to chop
//      trees standing on player-flagged (F.PLAYER) ground fell them for logs but
//      gain no chopping XP; the control run on untouched ground does gain XP.
//   node game/tests/bots/grind.js
import assert from "node:assert/strict";
import { Sim } from "../../src/sim/sim.js";
import { M, F } from "../../src/sim/world.js";
import { isAdult } from "../../src/sim/villager.js";
import { SKILLS } from "../../src/sim/skills.js";

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

// ---- 2. working player-placed ground pays zero ----
function chopRun(flagged) {
  const sim = Sim.create(3);
  const trees = sim.ents.ofKind("plant").filter(p => p.species === "tree");
  if (flagged) for (const t of trees) sim.world.setFlags(t.x, t.y, t.z - 1, sim.world.flags(t.x, t.y, t.z - 1) | F.PLAYER);
  const start = xpSum(sim, "chop");
  const saplings0 = sim.ents.ofKind("plant").filter(p => p.species === "sapling").length;
  for (let t = 0; t < 12000; t++) {
    if (t % 100 === 0) {
      const tree = sim.ents.ofKind("plant").filter(p => p.species === "tree")
        .sort((a, b) => Math.abs(a.x - 64) + Math.abs(a.y - 64) - Math.abs(b.x - 64) - Math.abs(b.y - 64))[0];
      const ids = sim.ents.ofKind("villager").filter(v => isAdult(sim, v)).map(v => v.id);
      sim.apply({ type: "order", ids, verb: "chop", tid: tree.id });
    }
    sim.step();
  }
  const felled = sim.ents.ofKind("plant").filter(p => p.species === "sapling").length - saplings0;
  return { gained: xpSum(sim, "chop") - start, felled };
}
const control = chopRun(false), flagged = chopRun(true);
console.log(`control: felled ${control.felled} trees, chop XP +${control.gained.toFixed(2)}; player-placed ground: felled ${flagged.felled}, chop XP +${flagged.gained.toFixed(2)}`);
assert.ok(control.felled >= 3 && control.gained > 0.5, "control run should chop and learn");
assert.ok(flagged.felled >= 3, "flagged run should still chop (the work happens, it just teaches nothing)");
assert.equal(flagged.gained, 0, "re-working player-placed ground paid XP");
console.log("grind bot ok");
