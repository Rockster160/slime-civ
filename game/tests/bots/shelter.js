// Shelter bot (S4a): the same 10 seeds as the absent bot, but a scripted player closes in ONE
// roofed room with beds before winter (keep-N targets + one build command + purpose "shelter").
// Pass when cold deaths drop by at least 60% against the absent run on the same seeds, nobody
// is worse off (population at the end of winter), and the warmth really comes from the room.
//   node game/tests/bots/shelter.js [years=2]
import assert from "node:assert/strict";
import { runSeed, fanOut, arg } from "./lib.js";
import { shelterBot } from "./shelter_plan.js";

const years = Number(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : 2);
const seedArg = arg("seed", null);
const cold = (r) => Object.values(r.deaths).reduce((a, y) => a + (y.cold || 0), 0);

if (seedArg !== null) {
  const seed = Number(seedArg);
  const a = runSeed(seed, years), s = runSeed(seed, years, shelterBot());
  const ent = s.sim.chron.entries;
  const out = {
    seed, years,
    absent: { cold: cold(a), pop: a.pop, deaths: a.deaths, w: [a.atWinterStart[0], a.atWinterEnd[0]] },
    shelter: { cold: cold(s), pop: s.pop, deaths: s.deaths, w: [s.atWinterStart[0], s.atWinterEnd[0]], msPerTick: s.msPerTick,
      rooms: s.sim.rooms.all().map(r => ({ n: r.n, enc: r.enclosed, warm: +r.warm.toFixed(2), purpose: r.purpose })),
      milestones: ent.filter(e => e.kind === "MILESTONE" || e.kind === "BUILT_FIRST").map(e => e.text) },
  };
  console.log(JSON.stringify(out));
} else {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const res = await fanOut(import.meta.url, seeds, [String(years)]);
  let ca = 0, cs = 0, pa = 0, ps = 0;
  for (const r of res) {
    ca += r.absent.cold; cs += r.shelter.cold; pa += r.absent.pop; ps += r.shelter.pop;
    console.log(`seed ${String(r.seed).padStart(2)}: cold deaths absent ${r.absent.cold} -> shelter ${r.shelter.cold}; pop end ${r.absent.pop} -> ${r.shelter.pop}; room ${r.shelter.rooms.map(x => x.n + (x.enc ? " enclosed" : " open") + " +" + x.warm + " " + x.purpose).join(", ") || "none"}`);
  }
  const drop = ca ? 1 - cs / ca : 1;
  console.log(`cold deaths over ${years} years x ${seeds.length} seeds: absent ${ca} (${(ca / years / seeds.length).toFixed(2)}/yr/village) -> shelter ${cs} (${(cs / years / seeds.length).toFixed(2)}/yr/village): ${(drop * 100).toFixed(0)}% fewer; population at end ${pa} -> ${ps}; ${res[0].shelter.msPerTick.toFixed(3)} ms/tick`);
  assert.ok(res.every(r => r.shelter.rooms.some(x => x.enc)), "every shelter run should end with an enclosed room");
  assert.ok(drop >= 0.6, "cold deaths fell only " + (drop * 100).toFixed(0) + "%, need >= 60%");
  assert.ok(ps >= pa, "the shelter run ended with fewer people than the absent run");
  console.log("shelter bot ok");
}
