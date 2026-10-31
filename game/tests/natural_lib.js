// 10.2 shared helpers of the short "natural state" tests (tests/natural_*.js). Each test loads a natural save (tools/make_fixtures.js: autumn, midwinter3,
// or the year2 save), lets the village play on by itself for a few game days, with no input, and checks one thing. Caps come from the duration constants.
import "./legacy.js";
import { loadFixture } from "./fixture.js";
import { DAY } from "../src/sim/clock.js";
import { dayF } from "../src/sim/season.js";
import { survey } from "../src/sim/items.js";
import { CRAFT_IDS } from "../src/sim/phenomena.js";
import { can, eraOf } from "../src/sim/knowledge.js";

export const beds = (sim) => sim.ents.ofKind("furniture").filter(f => f.f === "bed").length;
export const pop = (sim) => sim.ents.ofKind("villager").length;
export const craftCount = (sim) => CRAFT_IDS.filter(c => can(sim, c)).length;
export const hearthsLit = (sim) => sim.ents.ofKind("furniture").filter(f => f.f === "hearth" && f.lit).length;
/** What the yard holds: food days per head (the board's own runway), and wood as the wood bank counts it (logs + sticks / 2). */
export function stocks(sim) { const s = survey(sim); return { runway: sim.board.runway, wood: s.stock.log + s.stock.stick / 2 }; }

/**
 * Load `name`, play `days` game days with no input, and return what happened: births, deaths by cause, and the start / end readings.
 * `each(sim)` is called every 600 ticks (a sample for "at some point" checks).
 */
export function natural(name, days, each) {
  const sim = loadFixture(name), c0 = sim.chron.n, rec0 = new Set(Object.keys(sim.chron.recs));
  const start = { day: dayF(sim.tick), pop: pop(sim), beds: beds(sim), crafts: craftCount(sim), era: eraOf(sim), ...stocks(sim) };
  let minPop = start.pop, maxPop = start.pop;
  for (let t = 0; t < days * DAY; t++) {
    sim.step();
    if (t % 600 === 0) { const p = pop(sim); minPop = Math.min(minPop, p); maxPop = Math.max(maxPop, p); if (each) each(sim); }
  }
  const ents = sim.chron.entries.slice(Math.max(0, sim.chron.entries.length - (sim.chron.n - c0)));
  const causes = {}; for (const [id, r] of Object.entries(sim.chron.recs)) if (!rec0.has(id)) causes[r.cause] = (causes[r.cause] || 0) + 1;
  const deaths = Object.values(causes).reduce((a, b) => a + b, 0);
  const end = { day: dayF(sim.tick), pop: pop(sim), beds: beds(sim), crafts: craftCount(sim), era: eraOf(sim), ...stocks(sim) };
  return { sim, start, end, minPop, maxPop, births: ents.filter(e => e.kind === "BIRTH").length, deaths, causes, ents };
}
