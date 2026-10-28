// Deconstruct (S4b): marked pieces come down by villagers (standing job), refund ~75%, natural terrain is never touched, no XP.
//   node game/tests/deconstruct.js
import assert from "node:assert/strict";
import { Sim } from "../src/sim/sim.js";
import { M } from "../src/sim/world.js";
import { anySpot, clearArea, instantHut } from "./helpers.js";
import { survey } from "../src/sim/items.js";

const sim = Sim.create(4);
const [x0, y0, z, w, h] = anySpot(sim, 6, 5);
clearArea(sim, x0, y0, w, h, z);
instantHut(sim, x0, y0, w, h);
sim.ents.add("furniture", { f: "bed", x: x0 + 1, y: y0 + 1, z, owner: 0, rv: 0, rt: 0 });
assert.ok(sim.rooms.all().some(r => r.enclosed), "hut is a room");
const before = survey(sim);
assert.ok(sim.apply({ type: "deconstruct", x0: x0 - 1, y0: y0 - 1, x1: x0 + w, y1: y0 + h, z }));
const marks = sim.ents.ofKind("dsite").length;
assert.ok(marks >= 2 * (w + h) - 4, "marked walls, door, roofs, bed: " + marks);
assert.ok(!sim.apply({ type: "deconstruct", x0, y0, x1: x0 + w, y1: y0 + h, z }) || sim.ents.ofKind("dsite").length === marks, "marking twice adds nothing");
for (const v of sim.ents.ofKind("villager")) { v.hunger = v.thirst = v.energy = 1; }
for (let i = 0; i < 30000 && sim.ents.ofKind("dsite").length; i++) {
  if (i % 40 === 0) for (const v of sim.ents.ofKind("villager")) { v.hunger = Math.max(v.hunger, .8); v.thirst = Math.max(v.thirst, .8); v.energy = Math.max(v.energy, .8); v.warm = 1; }
  sim.step();
}
assert.equal(sim.ents.ofKind("dsite").length, 0, "villagers took everything down");
assert.equal(sim.world.mat(x0, y0, z), M.AIR, "wall gone");
assert.equal(sim.world.mat(x0 + 1, y0 + 1, z + 1), M.AIR, "roof gone");
assert.ok(!sim.rooms.all().some(r => r.enclosed), "no room left");
assert.ok(sim.world.isSolid(x0, y0, z - 1), "natural ground untouched");
assert.equal(sim.ents.ofKind("furniture").filter(f => f.x >= x0 && f.x < x0 + w && f.y >= y0 && f.y < y0 + h).length, 0, "door and bed gone");
const after = survey(sim);
const got = after.loose.stick + after.stock.stick + after.carried.stick - (before.loose.stick + before.stock.stick + before.carried.stick);
assert.ok(got >= 6, "sticks refunded: " + got);
console.log("deconstruct ok: " + marks + " marks cleared, +" + got + " sticks back, no XP (the unbuild verb has no skill)");
