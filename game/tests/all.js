// Run tests one at a time, each in its own heap-capped process; exit non-zero if any fails.
//   node tests/all.js          quick: unit tests + fixture-based feature tests (seconds, low memory)
//   node tests/all.js --full   also the multi-seed, multi-year bots (minutes; SIM_JOBS children at a time)
// Feature work should only need the quick set. Bots are for balance passes (see tests/README.md).
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const QUICK = ["determinism", "save_roundtrip", "path_bench", "rooms", "build", "jobs", "possess", "deconstruct", "ui_text", "genetics", "property3", "geology", "mining", "heat", "events", "discovery", "chain", "discoveries", "property6", "bots/grind", "bots/k6", "creatures", "flora", "living", "command", "crowd", "underground", "migrate", "ui_s12", "people", "bots/breed", "bots/swap", "bots/expand", "depth", "settle", "endless"];
const FULL = ["crowd 100", "bots/chainrun", "bots/k6 --year", "bots/overorder", "bots/absent", "bots/shelter", "bots/keep999", "bots/possess"];
const list = process.argv.includes("--full") ? [...QUICK, ...FULL] : QUICK;
const HEAP = "--max-old-space-size=" + (process.env.SIM_HEAP_MB || 768);
let failed = 0;
for (const t of list) {
  const [file, ...args] = t.split(" ");
  const r = spawnSync(process.execPath, [HEAP, join(here, file + ".js"), ...args], { stdio: "inherit" });
  if (r.status !== 0) { failed++; console.log("FAILED: " + t); }
}
console.log(failed ? failed + " test(s) failed" : "all tests passed (" + (list === QUICK ? "quick; --full adds the bots" : "full") + ")");
process.exit(failed ? 1 : 0);
