// Run every test in its own process; exit non-zero if any fails.
//   node game/tests/all.js
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0;
for (const t of ["determinism", "save_roundtrip", "path_bench", "rooms", "build", "jobs", "possess", "deconstruct", "ui_text", "bots/grind", "bots/overorder", "bots/absent", "bots/shelter", "bots/keep999", "bots/possess"]) {
  const r = spawnSync(process.execPath, [join(here, t + ".js")], { stdio: "inherit" });
  if (r.status !== 0) { failed++; console.log("FAILED: " + t); }
}
console.log(failed ? failed + " test(s) failed" : "all tests passed");
process.exit(failed ? 1 : 0);
