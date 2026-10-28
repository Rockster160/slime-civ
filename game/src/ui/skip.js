// Fast-forward (UI side only: speed is NOT a sim command, so determinism is untouched - it is just more
// sim.step() calls). Skip-to runs the sim flat out in time slices from the frame loop, so the page stays
// responsive and the map redraws a few times a second. It stops on anything notable and says why.
//
//   morning : until the next dawn         season : until the next season starts
//   event   : until something happens
// morning / season stop on a death, a finished construction, a villager in trouble with no remedy, or winter;
// "event" also stops for every chronicle entry (births, firsts) and new rooms.
import { dateOf, DAY, LANDING, SEASON_NAMES } from "../sim/clock.js";
import { seasonIdx, WINTER_START, dayF } from "../sim/season.js";
import { survey } from "../sim/items.js";
import { anyFire } from "../sim/fire.js";

export const SPEEDS = [1, 2, 3, 4, 5, 10, 25, 50, Infinity];     // Infinity = MAX: as many ticks as fit in SLICE_MS of each frame; keys 1-9 pick these in order
export const SLICE_MS = 12;              // time budget per frame for MAX and skip-to
const dawnIndex = (t) => Math.floor((t + LANDING - 0.10 * DAY) / DAY);

export function createSkip(game) {
  const S = { active: null, msg: "", msgT: 0 };
  game.skipper = S;

  S.start = (kind) => {
    const sim = game.sim;
    if (S.active) return false;
    if (game.possessed && game.possessed()) { game.toast("Fast-forward is off while you are guiding a villager."); return false; }
    S.active = { kind, t0: sim.tick, n0: sim.chron.n, day0: dateOf(sim.tick).day, season0: seasonIdx(sim.tick), dawn0: dawnIndex(sim.tick),
      cs: sim.ents.ofKind("csite").length, rooms: sim.rooms.list.size, ignore: new Set(), winter0: dayF(sim.tick) >= WINTER_START };
    game.state.paused = false;
    return true;
  };
  S.cancel = (why) => { if (S.active) end(why || "Stopped: cancelled."); };
  const end = (msg) => {
    const sim = game.sim;
    S.active = null; S.msg = msg; S.msgT = performance.now();
    game.state.paused = true;
    const es = sim.chron.entries, newest = es.length ? es[es.length - 1].id : 0;
    game.ui.attn = { tick: sim.tick, id: newest }; game.ui.toastedId = newest;      // the stop message covers it: no "while you were away" digest
    game.toast(msg, 6000);
  };

  /** Advance up to `ms` of wall time (or `maxTicks`); true while still running. */
  S.run = (ms, maxTicks = Infinity) => {
    const a = S.active, sim = game.sim;
    if (!a) return false;
    const t0 = performance.now();
    let n = 0;
    while (n < maxTicks) {
      sim.step(); n++;
      const why = check(a, sim);
      if (why) { end(why); return false; }
      if ((n & 63) === 0 && performance.now() - t0 > ms) break;
    }
    return !!S.active;
  };

  /** "day 34 → 50" for the top bar. */
  S.progress = () => {
    const a = S.active; if (!a) return "";
    const d = dateOf(game.sim.tick).day;
    const goal = a.kind === "season" ? ((a.season0 + 1) % 4) * 25 + 1 : a.kind === "morning" ? a.day0 + 1 : "…";
    return "Skipping " + a.kind + ": day " + a.day0 + " → " + (goal === "…" ? "…" : goal) + " (now " + d + ")";
  };

  function check(a, sim) {
    const t = sim.tick, all = a.kind === "event";
    if (sim.chron.n > a.n0) {
      const fresh = sim.chron.entries.filter(e => e.id > a.n0);
      a.n0 = sim.chron.n;
      for (const e of fresh) if (e.kind === "DEATH" || e.kind === "DISASTER" || e.kind === "LOSS" || e.kind === "DISCOVERY" || all) return "Stopped: " + e.text;
    }
    const cs = sim.ents.ofKind("csite").length;
    if (a.cs > 0 && cs === 0) return "Stopped: everything you planned has been built.";
    a.cs = cs;
    if (sim.rooms.list.size > a.rooms && all) return "Stopped: a room was completed.";
    a.rooms = sim.rooms.list.size;
    if (!a.winter0 && dayF(t) >= WINTER_START) return "Stopped: winter has started.";
    if (t % 20 === 0) {
      const trouble = stuck(sim, a.ignore);
      if (trouble) return "Stopped: " + trouble;
    }
    if (a.kind === "morning" && dawnIndex(t) > a.dawn0) return "Stopped: it is morning.";
    if (a.kind === "season" && seasonIdx(t) !== a.season0) return "Stopped: " + SEASON_NAMES[seasonIdx(t)] + " has begun.";
    return null;
  }
  return S;
}

/** A villager in trouble that nothing in the village can fix right now (reported once each). */
function stuck(sim, ignore) {
  let sv = null;
  const rooms = sim.rooms.all().some(r => r.enclosed);
  for (const v of sim.ents.ofKind("villager")) {
    if (ignore.has(v.id)) continue;
    sv = sv || survey(sim);
    if (v.hunger < 0.12 && sv.rations === 0 && !(v.carry && v.carry.item === "berry")) { ignore.add(v.id); return v.name + " is starving and the stockpile is empty."; }
    if (v.warm < 0.28 && !rooms && !anyFire(sim) && v.hp < 60) { ignore.add(v.id); return v.name + " is freezing with no warm room to go to."; }
  }
  return null;
}
