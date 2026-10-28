// Shared by the bot tests: run one seed headless and collect survival stats,
// or fan a list of seeds out over child processes (each sim is single-threaded).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Sim } from "../../src/sim/sim.js";
import { DAY, dateOf } from "../../src/sim/clock.js";
import { dayF, WINTER_START } from "../../src/sim/season.js";

export const YEAR_TICKS = DAY * 100;

/**
 * Run `years` game years from landing. `onTick(sim)` may issue commands.
 * Returns {pop (end), min, atWinterStart[], atWinterEnd[], deaths: {year: {cause: n}}, births, ms}.
 */
export function runSeed(seed, years, onTick) {
  const sim = Sim.create(seed);
  const out = { seed, atWinterStart: [], atWinterEnd: [], min: 99, deaths: {}, births: 0, ms: 0 };
  const t0 = Date.now();
  const total = Math.round(years * YEAR_TICKS);
  for (let i = 0; i < total; i++) {
    if (onTick) onTick(sim);
    sim.step();
    const n = sim.ents.ofKind("villager").length;
    if (n < out.min) out.min = n;
    if (sim.tick % DAY === 0) {
      const d = Math.floor(dayF(sim.tick));
      const pop = n;
      if (d === WINTER_START) out.atWinterStart.push(pop);
      if (d === 0 && sim.tick > DAY) out.atWinterEnd.push(pop);
    }
  }
  out.ms = Date.now() - t0;
  out.pop = sim.ents.ofKind("villager").length;
  for (const r of Object.values(sim.chron.recs)) {
    const y = dateOf(r.death).year;
    (out.deaths[y] ||= {})[r.cause] = (out.deaths[y][r.cause] || 0) + 1;
    if (r.cause !== "old age") (out.byStage ||= {})[r.cause + "/" + r.stage] = ((out.byStage || {})[r.cause + "/" + r.stage] || 0) + 1;
  }
  out.births = sim.chron.entries.filter(e => e.kind === "BIRTH").length;
  out.ticks = sim.tick;
  out.msPerTick = out.ms / sim.tick;
  out.sim = sim;
  return out;
}

/** Run `script` (a file that prints one JSON line when given --seed N) for each seed in parallel. */
export function fanOut(script, seeds, extra = []) {
  const file = fileURLToPath(script);
  return Promise.all(seeds.map(seed => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [file, "--seed", String(seed), ...extra], { stdio: ["ignore", "pipe", "inherit"] });
    let buf = "";
    p.stdout.on("data", d => { buf += d; });
    p.on("close", code => {
      try { resolve(JSON.parse(buf.trim().split("\n").pop())); } catch (e) { reject(new Error("seed " + seed + " exited " + code + ": " + buf)); }
    });
  })));
}

export function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

export function sumDeaths(list) {
  const t = {};
  for (const r of list) for (const y of Object.keys(r.deaths)) for (const c of Object.keys(r.deaths[y])) {
    (t[y] ||= {})[c] = (t[y][c] || 0) + r.deaths[y][c];
  }
  return t;
}
