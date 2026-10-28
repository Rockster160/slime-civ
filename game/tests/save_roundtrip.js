// A saved sim must continue exactly like the original: save mid-run (after
// terrain edits and command history), load, then step both and compare the
// hash on EVERY tick.
//   node game/tests/save_roundtrip.js
import assert from "node:assert/strict";
import { Sim } from "../src/sim/sim.js";
import { toJSON, restore } from "../src/sim/save.js";
import { run } from "./script.js";

// Save early (little has happened) and deep into the first winter (orders, beds, births, deaths, frost all in play).
for (const [SAVE_AT, AFTER] of [[5000, 3000], [8000, 3000], [24500, 3000], [46000, 3000], [150000, 4000]]) {   // early; mid-construction; room + blueprint + second hut under way; deep winter
  const a = Sim.create(7);
  run(a, SAVE_AT);
  const json = toJSON(a);
  const b = restore(json);
  assert.equal(b.tick, a.tick);
  assert.equal(b.hash(), a.hash(), "hash differs right after load");
  assert.equal(b.cmdLog.length, a.cmdLog.length);
  assert.equal(toJSON(b), json, "re-saving the loaded sim changed the save");

  for (let i = 0; i < AFTER; i++) {
    run(a, 1); run(b, 1);          // the script keeps feeding both (it keys off sim.tick)
    assert.equal(a.hash(), b.hash(), "diverged " + (i + 1) + " ticks after load (tick " + a.tick + ")");
  }
  // A second save/load later still agrees (deltas from after the first load survive).
  const c = restore(toJSON(b));
  run(a, 500); run(c, 500);
  assert.equal(a.hash(), c.hash(), "second-generation load diverged");
  console.log(`save ok @${SAVE_AT}: ${(json.length / 1024).toFixed(0)} KB, ${a.ents.ofKind("villager").length} villagers, ${a.chron.entries.length} chronicle entries, ${a.ents.ofKind("csite").length} sites, ${a.rooms.list.size} rooms, ${a.bps.list.length} blueprints, hashes equal for ${AFTER} ticks + second generation`);
  assert.deepEqual(b.rooms.canon(), a.rooms.canon(), "rooms differ after load");
}
