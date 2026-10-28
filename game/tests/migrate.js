// Save compatibility (S12, changed by S16). S16 made the world endless, and terrain is regrown from the seed, so a save of the old fixed 128 x 128 map (any version
// before 9) cannot be loaded on the new land: its edits would land on the wrong map. Decision (notes/DECISION_LOG.md D45): it is REFUSED, in plain words, never silently
// regrown. tests/oldsaves/ keeps one save per older format to prove it. A save newer than the game, or from before anything kept, is refused too. The current
// format round-trips: the camp, the active chunks and the ironman flag survive a save and a load.
//   node tests/migrate.js
import "./legacy.js";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { restore, toJSON, SAVE_VERSION, migrate, OLD_WORLD } from "../src/sim/save.js";
import { loadFixture } from "./fixture.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "oldsaves");
const files = readdirSync(dir).filter(f => f.endsWith(".json")).sort();
assert.ok(files.length >= 4, "old saves are kept: " + files);
const versions = new Set();
for (const f of files) {
  const text = readFileSync(join(dir, f), "utf8"), v0 = JSON.parse(text).v;
  versions.add(v0);
  assert.ok(v0 < SAVE_VERSION, f + " is an older format");
  assert.throws(() => restore(text), (e) => e.message === OLD_WORLD && /old fixed-size world/.test(e.message) && /Start a new game/.test(e.message), f + ": refused with the plain message");
  console.log("ok " + f + ": v" + v0 + " is refused (" + OLD_WORLD.slice(0, 40) + "...)");
}
assert.deepEqual([...versions].sort(), [3, 4, 5, 6], "a save of every older version is kept");
// a v8 save (the last fixed-size format) too: take a current one and relabel it
{
  const a = loadFixture("start"), j = JSON.parse(toJSON(a));
  j.v = 8;
  assert.throws(() => restore(JSON.stringify(j)), /old fixed-size world/);
}
// the current format round-trips and carries the S16 fields
{
  const a = loadFixture("settled");
  a.ironman = true;
  const j = JSON.parse(toJSON(a));
  assert.equal(j.v, SAVE_VERSION); assert.equal(j.bio, 0); assert.equal(j.ironman, 1);
  assert.deepEqual(j.spawn, [a.site.x, a.site.y], "the camp is saved");
  assert.ok(Array.isArray(j.chunks) && j.chunks.length === a.world.chunks.size, "the resident chunks are listed: " + j.chunks.length);
  assert.ok(j.chunks.every(c => c.length === 4), "[key, active, changed, lastNear]");
  const b = restore(JSON.stringify(j));
  assert.equal(b.ironman, true, "the ironman flag is saved");
  assert.equal(b.hash(), a.hash(), "the loaded sim hashes the same");
  assert.deepEqual(b.site, a.site, "the same camp");
  assert.equal(migrate(JSON.parse(JSON.stringify(j))).v, SAVE_VERSION);
}
assert.throws(() => restore(JSON.stringify({ v: 1 })), /Unsupported save version 1/);
assert.throws(() => restore(JSON.stringify({ v: SAVE_VERSION + 1 })), /Unsupported save version/);
console.log("migrate ok: " + files.length + " old saves refused, versions " + [...versions].join(", ") + " -> " + SAVE_VERSION);
