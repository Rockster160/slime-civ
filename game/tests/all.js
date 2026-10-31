// Run tests one at a time, each in its own heap-capped process; exit non-zero if any fails.
//   node tests/all.js          quick part A (unit + fixture tests); ALSO run `node tests/all.js b` for part B
//   node tests/all.js b        quick part B
//   node tests/all.js --full   also the multi-seed, multi-year bots (minutes; SIM_JOBS children at a time)
// Feature work should only need the quick set. Bots are for balance passes (see tests/README.md).
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// The quick set is split in two so each half stays well under the 5-minute cap (measured 2026-10-30:
// A about 140 s, B about 170 s; save_roundtrip alone is 80 s). Run both, one after the other.
const PART_A = ["oblique", "determinism", "path_bench", "rooms", "build", "jobs", "possess", "deconstruct", "ui_text", "genetics", "split", "property3", "geology", "mining", "heat", "events", "discovery", "chain", "discoveries", "property6", "bots/grind", "bots/k6", "creatures", "flora", "living", "command", "crowd", "underground", "migrate", "ui_s12", "people", "bots/breed", "bots/swap", "bots/expand", "depth", "settle", "endless", "steady"];
const PART_B = ["save_roundtrip", "cores", "dungeon", "dungeon_regrow", "monsters", "delve", "dormant", "spawn17", "s17", "fpv", "clock", "lifespan", "skill_pacing", "k3", "dayguard", "memory", "stepneed", "belief", "beliefplan", "localdemand", "board", "knowhard", "ideas", "assign"];
const FULL = ["crowd 100", "bots/chainrun", "bots/k6 --year", "bots/overorder", "bots/absent", "bots/shelter", "bots/keep999", "bots/possess"];
const full = process.argv.includes("--full");
const part = process.argv.includes("b") ? "b" : "a";
const QUICK = part === "b" ? PART_B : PART_A;
const list = full ? [...PART_A, ...PART_B, ...FULL] : QUICK;
const HEAP = "--max-old-space-size=" + (process.env.SIM_HEAP_MB || 768);
let failed = 0;
for (const t of list) {
  const [file, ...args] = t.split(" ");
  const r = spawnSync(process.execPath, [HEAP, join(here, file + ".js"), ...args], { stdio: "inherit" });
  if (r.status !== 0) { failed++; console.log("FAILED: " + t); }
}
console.log(failed ? failed + " test(s) failed" : "all tests passed (" + (full ? "full" : "quick part " + part.toUpperCase() + (part === "a" ? "; now run `node tests/all.js b`" : "; part A is `node tests/all.js`")) + ")");
process.exit(failed ? 1 : 0);
