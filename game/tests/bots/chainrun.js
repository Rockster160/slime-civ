// The single-run Property 6a check (GDD §26, PROTOTYPE_PLAN P11): from `start` (day 0, nobody knows anything) a COMPETENT player (tests/bots/competent.js)
// must reach copper within 1.0 game year. ONE seed, ONE run, --full only (about 180,000 ticks; run it alone, never beside another sim).
// Not part of the quick set: the quick set checks the same chain as fixture-to-fixture segments (tests/property6.js).
// It is meant for the user's balance pass: it prints the day each step was reached (fire, pottery, charcoal, smelting, a copper pick) and the
// job kinds seen, so a slow link in the chain shows up as a late milestone.
//   node tests/bots/chainrun.js [seed]
import "../legacy.js";
import assert from "node:assert/strict";
import { loadFixture } from "../fixture.js";
import { competentBot } from "./competent.js";
import { can } from "../../src/sim/knowledge.js";
import { haveTotal } from "../../src/sim/items.js";
import { Sim } from "../../src/sim/sim.js";

const seed = Number(process.argv[2] || 0);
const sim = seed ? Sim.create(seed) : loadFixture("start");
const bot = competentBot(), YEAR_TICKS = 100 * 1800, t0 = sim.tick;
const reached = {}, kinds = new Set();
const marks = [["fire", () => can(sim, "FIRE_TENDING")], ["pottery", () => can(sim, "POTTERY")], ["charcoal", () => can(sim, "CHARCOAL")], ["smelting", () => can(sim, "SMELTING")], ["copper ingot", () => haveTotal(sim, "copper") > 0], ["copper pick", () => haveTotal(sim, "copper_pick") > 0]];
for (let i = 0; i < YEAR_TICKS && !reached["copper pick"]; i++) {
  bot(sim); sim.step();
  if (sim.tick % 100 === 0) {
    for (const [name, f] of marks) if (reached[name] === undefined && f()) reached[name] = (sim.tick - t0) / 1800;
    for (const v of sim.ents.ofKind("villager")) if (v.job) kinds.add(v.job.k);
  }
}
console.log("seed " + (seed || "fixture start (7)") + ": " + marks.map(([n]) => n + " " + (reached[n] === undefined ? "NEVER" : "day " + reached[n].toFixed(1))).join(", "));
console.log("people " + sim.ents.ofKind("villager").length + ", job kinds seen: " + [...kinds].sort().join(" "));
assert.ok(reached["smelting"] !== undefined && reached["smelting"] <= 100, "a competent player has copper inside one game year (6a)");
console.log("chainrun ok (for the balance pass: compare the days above with PROTOTYPE_PLAN 6a/P11)");
