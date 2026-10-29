// loadFixture(name) -> Sim, from tests/fixtures/<name>.json. Regenerates the whole set (one long run, tools/make_fixtures.js)
// when the file is missing or was written by an older save version.
import "./legacy.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { restore } from "../src/sim/save.js";
import { DIR, makeFixtures, makeDerived, FIXTURES } from "../tools/make_fixtures.js";

const MIN_FIXTURE_VERSION = 12;    // 7.20: cores and cave networks change the ground, so every v11 fixture is regenerated. (Was 11: S18b, the clock rebase.)
const _OLD = 11;    // S18b: the clock rebase. A v9/v10 fixture counts time in 1800-tick days and is regenerated (a fixture is not a save a player loads: it is rewritten, not migrated)
function fresh(name) {
  const f = join(DIR, name + ".json");
  if (!existsSync(f)) return null;
  const text = readFileSync(f, "utf8");
  const m = text.slice(0, 60).match(/"v":(\d+)/);       // snapshot() writes v first
  return m && Number(m[1]) >= MIN_FIXTURE_VERSION ? text : null;       // (S17: v9 fixtures load as they are: the v10 loaders read both shapes, and the world they were made in is unchanged)
}
export function loadFixture(name) {
  let text = fresh(name);
  // A derived fixture (a prep on a saved one) is cheap: write just it when its source is on disk and current (S7b adds fixtures without a long run).
  for (let guard = 0; !text && guard < 3 && FIXTURES[name] && FIXTURES[name].from; guard++) {
    const chain = [name];
    while (FIXTURES[chain[0]].from && FIXTURES[FIXTURES[chain[0]].from] && FIXTURES[FIXTURES[chain[0]].from].from && !fresh(FIXTURES[chain[0]].from)) chain.unshift(FIXTURES[chain[0]].from);
    if (!fresh(FIXTURES[chain[0]].from)) break;
    for (const n of chain) makeDerived(n);
    text = fresh(name);
  }
  if (!text) { console.log("fixtures missing or stale: regenerating (one long run)..."); makeFixtures(); text = fresh(name); }
  if (!text) throw new Error("no fixture named " + name);
  return restore(text);
}
