// Chronicle (GDD §18): a small consumer of sim events. Entries are factual
// one-liners built from templates, kept in sim.chron = {n, entries, recs, f}.
//
//   entry  = {id, t, y, d, kind, a:[villagerId], text, data:{...}, sev:0..2}
//   record = recs[villagerId] = {id, name, hue, par, gen, birth, death, cause, top}   (kept after death)
//   f      = one-shot flags ("firstBed", "firstWinter", ...) so firsts are logged once
//
// kinds used in S2: BIRTH, DEATH, BUILT_FIRST, DISASTER (hunger crisis), MILESTONE.
// Capped at MAX entries; the oldest severity-0 entries are dropped first.
import { dateOf } from "./clock.js";

export const MAX_ENTRIES = 300;

export function newChron() { return { n: 0, entries: [], recs: {}, f: {} }; }

export function log(sim, kind, text, actors = [], data = {}, sev = 0) {
  const c = sim.chron, d = dateOf(sim.tick);
  c.entries.push({ id: ++c.n, t: sim.tick, y: d.year, d: d.day, kind, a: actors, text, data, sev });
  if (c.entries.length > MAX_ENTRIES) {
    const i = c.entries.findIndex(e => e.sev === 0);
    c.entries.splice(i < 0 ? 0 : i, 1);
  }
}

/** Log a one-shot milestone; returns true the first time. */
export function once(sim, flag, kind, text, actors, data, sev) {
  if (sim.chron.f[flag]) return false;
  sim.chron.f[flag] = 1;
  log(sim, kind, text, actors, data, sev);
  return true;
}

export function yearDay(sim) { const d = dateOf(sim.tick); return "Year " + d.year + ", day " + d.day; }
