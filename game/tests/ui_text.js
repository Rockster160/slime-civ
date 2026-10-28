// UI text coverage (GDD §22: blockers in plain words): every blocker enum the sim
// can emit has a human sentence, every job kind and class seen in a real run has
// a label, and explain() never leaks a raw enum or "undefined".
//   node game/tests/ui_text.js
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Sim } from "../src/sim/sim.js";
import { scriptAt } from "./script.js";
import { anySpot, clearArea } from "./helpers.js";
import { plan } from "../src/sim/jobs.js";
import { BLOCKER_TEXT, JOB, CLASS, blockerText, explain, alerts, warnings, describe } from "../src/ui/text.js";

const sim_dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "sim");
const NOT_BLOCKERS = new Set(["BIRTH", "DEATH", "DISASTER", "MILESTONE", "BUILT_FIRST"]);   // chronicle kinds

// 1. Static: every ALL_CAPS string literal in the sim that is not a chronicle kind is a blocker and must be translated.
const found = new Set();
for (const f of readdirSync(sim_dir)) {
  if (!f.endsWith(".js")) continue;
  for (const m of readFileSync(join(sim_dir, f), "utf8").matchAll(/"([A-Z][A-Z_]{2,})"/g)) if (!NOT_BLOCKERS.has(m[1])) found.add(m[1]);
}
assert.ok(found.size >= 12, "expected to find the sim's blocker enums, found " + [...found]);
const missing = [...found].filter(k => !BLOCKER_TEXT[k]);
assert.deepEqual(missing, [], "blockers with no plain-language text: " + missing);
for (const [k, t] of Object.entries(BLOCKER_TEXT)) assert.ok(t.length > 5 && !/[A-Z]{3}/.test(t), "bad text for " + k);
console.log("static: " + found.size + " blocker enums, all translated");

// 2. Every blocker x every job kind gives a clean sentence.
const chosen = { job: "eat", cls: "need", score: 400 };
for (const b of Object.keys(BLOCKER_TEXT)) for (const job of Object.keys(JOB)) {
  const t = blockerText(job, b, chosen, { score: 100 });
  assert.ok(t && !t.includes("undefined") && t !== b, `blockerText(${job}, ${b}) = ${t}`);
}

// 3. Dynamic: run real games with orders and keeps; every why/lf record must be explainable.
const seenJobs = new Set(), seenBlockers = new Set(), seenCls = new Set();
for (const seed of [1, 2, 3]) {
  const sim = Sim.create(seed);
  for (let i = 0; i < 130000; i++) {
    if (i === 2000) { sim.apply({ type: "keep", item: "log", n: 30 }); sim.apply({ type: "keep", item: "grass", n: 20 }); sim.apply({ type: "keep", item: "stick", n: 20 }); }
    for (const c of scriptAt(i, sim)) if (c.type === "build" || c.type === "purpose" || c.type === "blueprint" || (c.type === "order" && c.verb === "dig")) sim.apply(c);   // the construction part of the shared script
    if (i === 2500) {                                   // a stone wall nobody can build yet (no stone), and a roof with nothing to hold it
      const [x, y, z] = anySpot(sim, 4, 3); clearArea(sim, x, y, 4, 3, z);
      sim.apply({ type: "build", cells: [{ w: "wall", m: "stone", x, y, z }, { w: "wall", m: "stone", x: x + 1, y, z }, { w: "roof", m: "thatch", x: x + 3, y: y + 2, z }] });
    }
    if (i === 3000) { const vs = sim.ents.ofKind("villager").map(v => v.id); sim.apply({ type: "order", ids: vs, verb: "chop", x: 64, y: 64 }); }
    if (i === 20000) sim.apply({ type: "order", ids: sim.ents.ofKind("villager").map(v => v.id), verb: "forage", x: 60, y: 60 });
    sim.step();
    if (i % 250) continue;
    for (const v of sim.ents.ofKind("villager")) {
      const x = explain(sim, v);
      if (v.job) seenJobs.add(v.job.k);
      if (x) {
        seenCls.add(x.cls);
        assert.ok(!/undefined|\[object|NaN/.test(x.sentence), "bad sentence: " + x.sentence);
        for (const r of x.rejected) { seenBlockers.add(r.blocker); assert.ok(r.text && !/undefined/.test(r.text), "bad rejection text " + r.blocker); }
        if (x.fail) assert.ok(!/undefined/.test(x.fail.text));
      }
      if (v.lf) seenBlockers.add(v.lf[1]);
      alerts(sim, v);
    }
    for (const w of warnings(sim)) assert.ok(!/undefined|NaN/.test(w.text));
    for (const e of sim.ents.list) { const t = describe(sim, e); assert.ok(t && !/undefined|NaN|\[object/.test(t), "bad description for " + e.kind + ": " + t); }
    for (const v of sim.ents.ofKind("villager")) {          // the paused-after-a-command preview must read cleanly too
      const nx = explain(sim, v, plan(sim, v, false, null, true));
      assert.ok(nx && nx.pending && !/undefined|NaN|\[object/.test(nx.sentence), "bad preview sentence: " + (nx && nx.sentence));
    }
  }
}
assert.ok(seenJobs.has("build_site"), "the run should include villagers building planned pieces");
for (const k of seenJobs) assert.ok(JOB[k], "no label for job kind " + k);
for (const k of seenCls) assert.ok(CLASS[k], "no label for class " + k);
for (const b of seenBlockers) assert.ok(BLOCKER_TEXT[b], "observed untranslated blocker " + b);
console.log("dynamic: jobs " + [...seenJobs].sort() + " | classes " + [...seenCls].sort() + " | blockers seen " + [...seenBlockers].sort());
console.log("ui text ok");
