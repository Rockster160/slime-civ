// The Concerns list (GDD §22): the village's current problems, ranked, in plain words, one line per threat class, each with a place to look.
// Pure functions of sim state - no DOM - so tests can check the ranking headlessly. The panel (ui/concernpanel.js) only draws and locates.
//
//   concerns(sim) -> [{k, level 1..3, text, loc, adv, icon, sev}]   most urgent first; loc = {x,y,z} or {x,y,z,id} (a villager to select) or null
import { CRIT_BASE, CRIT_WINTER, CAMP } from "../sim/board.js";
import { winterAhead, isNight, seasonIdx, dayF, WINTER_START } from "../sim/season.js";
import { holders } from "../sim/knowledge.js";
import { CRAFTS } from "../sim/phenomena.js";
import { huntingPressure } from "../sim/fauna.js";
import { isAdult, isElder } from "../sim/villager.js";
import { DUR_DAY } from "../sim/clock.js";
import { rottingSoon, runwayText } from "./text.js";
import { crewSummary } from "./crewtext.js";
import { World } from "../sim/world.js";
import { badAt, airMap, CRACK_TICKS } from "../sim/underground.js";
import { isSeen } from "../sim/seen.js";
import { sickOnes } from "../sim/disease.js";
import { can as canDo } from "../sim/knowledge.js";


export const CONCERN_ORDER = ["food", "cold", "illness", "danger", "underground", "crew", "knowledge", "spoilage", "hunting", "idle"];   // ties between equally urgent classes
export const THORN_NEAR = 24;                                    // cells from the camp: the beast is "near camp"
export const IDLE_SHARE = 0.2;                                   // this share of the adults (at least 3) with nothing to do is worth a line

const cellOf = (e) => ({ x: e.x, y: e.y, z: e.z });
const campCell = (sim) => { const c = CAMP(sim.stock); return { x: c.x, y: c.y, z: sim.stock.z }; };

/** S15: the advisory sentence for the cold class: how long until winter, and how many have no warm bed. */
function winterLine(sim, n) {
  const left = Math.ceil(WINTER_START - dayF(sim.tick)), who = n + (n === 1 ? " villager has" : " villagers have") + " no warm bed";
  return left > 0 ? "Winter in " + left + (left === 1 ? " day" : " days") + " and " + who : "It is winter and " + who;
}

/** Each rule returns null or {level, text, loc, adv?}. adv is the short sentence the advisory card uses instead of text (ui/advisory.js). */
const RULES = {
  food(sim) {
    const b = sim.board, wa = winterAhead(sim.tick), crit = CRIT_BASE + CRIT_WINTER * wa;
    if (b.fc) return { level: 3, text: "Food is critical: " + runwayText(b.runway) + " per head (critical below " + crit.toFixed(1) + " days).", loc: campCell(sim) };
    if (wa > 0 && b.runway < crit * 1.6) return { level: 2, text: "Food is getting tight for winter: " + runwayText(b.runway) + " banked, " + crit.toFixed(1) + " needed.", loc: campCell(sim) };
    return null;
  },
  cold(sim) {
    const b = sim.board, vs = sim.ents.ofKind("villager"), cold = vs.filter(v => v.warm < 0.35);
    if (b.sc) return { level: 3, text: (b.sneed || "Some") + " villager(s) have no bed and it is or will soon be cold.", adv: winterLine(sim, b.sneed || 1), loc: cold[0] ? { ...cellOf(cold[0]), id: cold[0].id } : campCell(sim) };
    if (cold.length >= 2) return { level: 2, text: cold.length + " villagers are cold.", loc: { ...cellOf(cold[0]), id: cold[0].id } };
    return null;
  },
  illness(sim) {                                                 // S14: the sick, how they caught it, and what would help
    if (!sim.dp || !sim.dp.on) return null;
    const sick = sickOnes(sim);
    if (!sick.length) return null;
    const s0 = sick[0], causes = [...new Set(sick.map(v => v.ill.c))].slice(0, 2).join(" and "), n = sick.length;
    const help = !canDo(sim, "HERBAL") ? "Rest, a warm bed, cooked food and a nurse help; a herbal remedy (steeped from marsh herb) helps most." : "A herbal remedy helps most" + (sim.ents.ofKind("item").some(i => i.item === "herbal_remedy") ? "." : "; none is made yet: bring marsh herb to the bench.");
    const weak = sick.some(v => v.hp < 40);
    return { level: n >= 3 || weak ? 3 : 2, text: n + (n === 1 ? " villager is sick (" : " villagers are sick (") + causes + (n >= 3 ? "; it is spreading" : "") + "). " + help, loc: { ...cellOf(s0), id: s0.id } };
  },
  danger(sim) {
    const wolves = sim.ents.ofKind("fauna").filter(e => e.sp === "wolf");
    if (wolves.length) {                                         // S14: wolves worry the village only when they are close
      const cp = CAMP(sim.stock), w0 = wolves.slice().sort((a, b) => Math.max(Math.abs(a.x - cp.x), Math.abs(a.y - cp.y)) - Math.max(Math.abs(b.x - cp.x), Math.abs(b.y - cp.y)))[0];
      const wd = Math.max(Math.abs(w0.x - cp.x), Math.abs(w0.y - cp.y));
      if (wd <= THORN_NEAR + 12 && (winterAhead(sim.tick) > 0 || seasonIdx(sim.tick) === 3)) return { level: sim.ents.ofKind("villager").some(v => (v.fear || 0) > 0.6) ? 3 : 2, text: "Wolves are " + wd + " cells from camp. They go after anyone alone on a winter night; keep company and a fire lit. A crowd or a fire sends them off.", loc: cellOf(w0) };
    }
    const t = sim.ents.ofKind("fauna").find(e => e.sp === "thornback");
    if (!t) return null;
    const cp = CAMP(sim.stock), d = Math.max(Math.abs(t.x - cp.x), Math.abs(t.y - cp.y));
    const scared = sim.ents.ofKind("villager").filter(v => (v.fear || 0) > 0.6);
    if (scared.length) return { level: 3, text: scared.length + (scared.length === 1 ? " villager is" : " villagers are") + " running from the thornback, " + d + " cells from camp.", loc: cellOf(t) };
    if (d <= THORN_NEAR) return { level: 2, text: "The thornback is " + d + " cells from camp. Villagers keep away from it on their own; nothing needs doing unless you send someone near.", loc: cellOf(t) };
    return null;
  },
  underground(sim) {                                           // S12: a cracking roof, foul air somebody has seen
    const cr = sim.ug.cr;
    if (cr.length) {
      const [x, y, z] = World.xyz(cr[0][0]), left = Math.max(0, Math.ceil((CRACK_TICKS - (sim.tick - Math.min(...cr.map(e => e[1])))) / 20));
      const under = sim.ents.ofKind("villager").find(v => v.z === z && cr.some(([i]) => { const [a, b] = World.xyz(i); return Math.abs(a - v.x) <= 1 && Math.abs(b - v.y) <= 1; }));
      return { level: under ? 3 : 2, text: "A roof is cracking at (" + x + ", " + y + ") and falls in about " + left + " seconds" + (under ? ": " + under.name + " is under it" : "") + ". Villagers keep out of it. Post a timber support or let it fall.", loc: { x, y, z } };
    }
    const vs = sim.ents.ofKind("villager"), in_ = vs.find(v => badAt(sim, v.x, v.y, v.z));
    if (in_) return { level: 3, text: in_.name + " is breathing bad air (it drains health and energy). Move them out; a vent or a bellows beside the foul cells clears it.", loc: { x: in_.x, y: in_.y, z: in_.z, id: in_.id } };
    for (const i of airMap(sim).bad) { const [x, y, z] = World.xyz(i); if (isSeen(sim, x, y, z) && sim.world.isWalkable(x, y, z)) return { level: 1, text: "Foul air has been found in a tunnel at (" + x + ", " + y + "). Villagers will not go in; a vent shaft nearby clears it.", loc: { x, y, z } }; }
    return null;
  },
  crew(sim) {
    let worst = null;
    for (const c of sim.crews.list) {
      if (c.task && c.task.t === "exp") continue;                // an expedition's stall is its own report
      const s = crewSummary(sim, c);
      if (s.blocked && (!worst || s.blocked > worst.s.blocked)) worst = { c, s };
    }
    if (!worst) return null;
    const v = sim.ents.get(worst.s.blockedIds[0]);
    return { level: 2, text: worst.c.name + ": " + worst.s.line.replace(/\.$/, "") + ".", loc: v ? { ...cellOf(v), id: v.id } : null };
  },
  knowledge(sim) {
    const risky = [];
    for (const k of Object.keys(CRAFTS)) {
      const h = holders(sim, k);
      if (h.length === 1) risky.push({ k, v: h[0] });
    }
    if (!risky.length) return null;
    const r = risky[0], frail = isElder(sim, r.v) || r.v.hp < 50;
    return { level: frail ? 2 : 1, text: "Only " + r.v.name + " knows " + CRAFTS[r.k].short + (risky.length > 1 ? " (and " + (risky.length - 1) + " more crafts have one holder)" : "") + ": if they die it is lost" + (frail ? ", and they are frail" : "") + ". Let others watch them work, or pair them to teach.", loc: { ...cellOf(r.v), id: r.v.id } };
  },
  spoilage(sim) {
    const r = rottingSoon(sim);
    return r.units >= 4 ? { level: 1, text: r.units + " units of fresh food (" + r.what + ") will spoil before they are eaten. Dry, smoke or jar it.", loc: campCell(sim) } : null;
  },
  hunting(sim) {
    if (sim.tick <= 3 * DUR_DAY) return null;
    const hp = huntingPressure(sim);
    if (hp.gone) return { level: 2, text: "No wild hoppers are left (the meadow carries about " + hp.cap + "). Stop hunting or keep a pen.", loc: campCell(sim) };
    if (hp.low) return { level: 1, text: "Hoppers are scarce: " + hp.n + " left of about " + hp.cap + ". Hunting less lets the herd regrow.", loc: campCell(sim) };
    return null;
  },
  idle(sim) {
    if (isNight(sim.tick)) return null;
    const ad = sim.ents.ofKind("villager").filter(v => isAdult(sim, v) && !v.poss && !v.xp && v.hunger > 0.4 && v.energy > 0.4);
    const idle = ad.filter(v => v.why && v.why.cls === "leisure" && v.why.t > sim.tick - 600);
    if (idle.length < Math.max(3, Math.ceil(IDLE_SHARE * ad.length))) return null;
    return { level: 1, text: idle.length + " of " + ad.length + " adults have nothing to do. Set a standing order, mark a dig, or plan a building.", loc: { ...cellOf(idle[0]), id: idle[0].id } };
  },
};

/** The ranked list: one entry per class that is currently a problem, most urgent first. */
export function concerns(sim) {
  const out = [];
  for (const k of CONCERN_ORDER) {
    const r = RULES[k](sim);
    if (r) out.push({ k, level: r.level, text: r.text, adv: r.adv || r.text, loc: r.loc, icon: CONCERN_GLYPH[k], sev: r.level });
  }
  return out.sort((a, b) => b.level - a.level || CONCERN_ORDER.indexOf(a.k) - CONCERN_ORDER.indexOf(b.k));
}

/** UI_SPEC §8.1 a9: the icon registry name for each class (ui/icons.js) and the severity (1..3) the HUD draws as a pip SHAPE. Additive: `icon` and `sev` ride beside `level`. */
export const CONCERN_GLYPH = { food: "food", cold: "cold", illness: "illness", danger: "danger", underground: "underground", crew: "crew", knowledge: "knowledge", spoilage: "spoilage", hunting: "hunting", idle: "idle" };
/** What to do about a class, as build-tool names (the "do this" chips: icons, not a sentence). */
export const CONCERN_DO = { cold: ["bed", "hearth"], food: ["field", "rack"], spoilage: ["rack", "cellar"], idle: ["field"] };

/** A class icon for the panel and the advisory cards (S15). */
export const CONCERN_ICON = { food: "\u{1F356}", cold: "\u2744", illness: "\u2695", danger: "\u26A0", underground: "\u26CF", crew: "\u2691", knowledge: "\u{1F4D6}", spoilage: "\u231B", hunting: "\u{1F3F9}", idle: "\u{1F4A4}" };

/**
 * The same list in a STABLE order for display (S15): a class keeps the place it had last time; it moves only when its level rises above or falls below a neighbour's,
 * and a newly raised class goes after the others of its level. `prev` = the class keys in the order shown last (an array the caller keeps); returns the list and updates `prev`.
 * Without this a class flickering between two equal levels swaps places every refresh.
 */
export function stableOrder(list, prev) {
  const rank = new Map(prev.map((k, i) => [k, i]));
  const out = list.slice().sort((a, b) => b.level - a.level || (rank.has(a.k) ? rank.get(a.k) : 1e6 + CONCERN_ORDER.indexOf(a.k)) - (rank.has(b.k) ? rank.get(b.k) : 1e6 + CONCERN_ORDER.indexOf(b.k)));
  prev.length = 0;
  for (const c of out) prev.push(c.k);
  return out;
}
