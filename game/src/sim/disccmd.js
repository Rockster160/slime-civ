// Player and debug commands of the discovery system, applied through sim.apply like every other command.
//   {type:"force", ev:"lightning"|"stump"}      debug (Game menu): make a systemic event happen now
//   {type:"investigate", ids:[..], item?, at?}  "Investigate": 1-3 villagers tinker for 3 days as a standing-class job, optionally
//                                               only with one material in reach, and/or only at one place (`at` = a kiln / mound / hearth entity id: "try things HERE");
//                                               {ids:[]} withdraws the request
//   {type:"grant", id, craft, f?}               debug: give a villager a craft (the same path as discovery)
//   {type:"ill", id}                             debug (Game menu, S14): make a villager ill now (only in a world with the S14 content)
import { DUR_DAY } from "./clock.js";
import { isAdult } from "./villager.js";
import { forceEvent } from "./events.js";
import { grant } from "./knowledge.js";
import { CRAFTS } from "./phenomena.js";
import { fallIll } from "./disease.js";

export const ASK_DAYS = 3;
export const ASK_MAX = 3;

export const DISC_COMMANDS = {
  force(sim, c) {
    const ok = forceEvent(sim, c.ev);
    if (ok) sim.board.ep++;
    return ok;
  },
  investigate(sim, c) {
    const ids = (c.ids || []).filter(id => { const v = sim.ents.get(id); return v && v.kind === "villager" && isAdult(sim, v); }).slice(0, ASK_MAX);
    if (!ids.length) { sim.disc.ask = null; sim.board.ep++; return !!(c.ids && !c.ids.length); }
    sim.disc.ask = { until: sim.tick + ASK_DAYS * DUR_DAY, ids, item: c.item || "", at: c.at || 0 };
    sim.cache.tkSig = null;
    sim.board.ep++;
    return true;
  },
  ill(sim, c) {
    const v = sim.ents.get(c.id);
    if (!sim.dp.on || !v || v.kind !== "villager" || v.ill) return false;
    fallIll(sim, v, c.why || "a sickness you sent");
    sim.board.ep++;
    return true;
  },
  grant(sim, c) {
    const v = sim.ents.get(c.id);
    return !!(v && v.kind === "villager" && CRAFTS[c.craft] && grant(sim, v, c.craft, c.f));
  },
};
