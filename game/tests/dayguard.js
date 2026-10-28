// Day-length guard (S18b, D35): the calendar day (clock.js DAY) is meant to be tweaked, so no test may assume it.
//  1. Static: no test file may contain the literal day lengths 1800 or 12000 (write DUR_DAY / DAY / constants from the module under test).
//  2. Dynamic: the key feature tests that build their own world (no fixture: a fixture is written for one day length) run again in child
//     processes with SLIME_DAY set to two other day lengths (clock.js reads it). They must still pass: the clock, night = 30%, one sleep a night,
//     Next morning, save round trip, the lifespan window, skill pacing, possession, plant lifecycles and the seasonal events.
//   node tests/dayguard.js
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = [...readdirSync(here).filter(f => f.endsWith(".js")).map(f => join(here, f)), ...readdirSync(join(here, "bots")).filter(f => f.endsWith(".js")).map(f => join(here, "bots", f))];
const bad = [];
for (const f of files) {
  if (f.endsWith("dayguard.js")) continue;
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "").replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "");       // comments and strings may say 1800
    if (/(?<![\d.])(1800|12000)(?![\d.])/.test(code)) bad.push(f.slice(here.length + 1) + ":" + (i + 1) + ": " + line.trim().slice(0, 100));
  });
}
assert.equal(bad.length, 0, "tests must not hard-code a day length:\n" + bad.join("\n"));
console.log("ok static: no test hard-codes 1800 or 12000 (" + files.length + " files)");

const RUN = ["clock", "lifespan", "skill_pacing", "possess", "flora", "events"];
for (const day of [7500, 20000]) {
  for (const t of RUN) {
    const r = spawnSync(process.execPath, ["--max-old-space-size=768", join(here, t + ".js")], { encoding: "utf8", env: { ...process.env, SLIME_DAY: String(day) } });
    if (r.status !== 0) { console.log((r.stdout + r.stderr).split("\n").slice(-14).join("\n")); assert.fail(t + " failed with SLIME_DAY=" + day); }
  }
  console.log("ok SLIME_DAY=" + day + ": " + RUN.join(", ") + " pass");
}
console.log("dayguard ok");
