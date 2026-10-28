// Crew summaries in plain words (GDD §09 stall summary, §07 crews): "3 of 5 working; 2 blocked: no way to get there".
// Pure functions of sim state - no DOM - so tests can check them headlessly.
import { crewMembers, choreOf, taskText } from "../sim/crews.js";
import { blockerText } from "./text.js";
import { isAdult } from "../sim/villager.js";

const SKIP = new Set(["LOWER_SCORE", "NEED_CRITICAL", "RESERVED", "MAX_WORKERS"]);   // "something else scored higher" and "enough hands are already on it" are not stalls: those members are simply idle

/** Does a rejected alternative {job, cls, blocker} belong to this crew's task? */
function relates(task, r) {
  if (!task) return false;
  if (task.t === "order") return r.cls === "order";
  const fake = { kind: r.job, grp: "", cls: r.cls };
  if (r.job === "mine") fake.grp = "mine";
  else if (r.job === "build_site" || r.job === "craft_site" || r.job === "deconstruct") fake.grp = "construct";
  else if (r.job === "till" || r.job === "sow" || r.job === "water" || r.job === "harvest") fake.grp = "farm";
  else if (r.job === "fence" || r.job === "fodder" || r.job === "slaughter") fake.grp = "pen";
  return task.t === "chore" ? choreOf(fake) === task.g : false;
}

/** Why a member who is not working is not: the first blocker among what they considered (their crew's task first), or "". */
function stallReason(v, task) {
  const rej = v.why && v.why.rej ? v.why.rej : [];
  const r = rej.find(q => !SKIP.has(q.blocker) && relates(task, q)) || rej.find(q => !SKIP.has(q.blocker));
  return r ? { text: blockerText(r.job, r.blocker, v.why, r), job: r.job, cls: r.cls } : null;
}

/**
 * -> {n, working, resting, blocked, idle, guided, reasons:[{text, n}], line}
 * working: on a job (not free time); resting: eating, drinking, sleeping or warming; blocked: free time but with work they could not do.
 */
export function crewSummary(sim, crew) {
  const ms = crewMembers(sim, crew), out = { n: ms.length, working: 0, resting: 0, blocked: 0, idle: 0, guided: 0, reasons: [], blockedIds: [], line: "" };
  const by = new Map();
  const exp = crew.task && crew.task.t === "exp" ? sim.exp.list.find(x => x.id === crew.task.id) : null;
  for (const v of ms) {
    if (v.poss) { out.guided++; continue; }
    if (v.xp && exp) { out.working++; if (exp.stall && v === ms[0]) { const t = exp.stall === "UNSAFE" ? "someone is afraid of the thornback" : blockerText("mine", exp.stall); by.set(t, (by.get(t) || 0) + 1); } continue; }
    const j = v.job && v.action ? v.job : null;
    if (j && j.c === "need") { out.resting++; continue; }
    if (j && j.c !== "leisure") { out.working++; continue; }
    const why = stallReason(v, crew.task);
    if (why) { out.blocked++; out.blockedIds.push(v.id); by.set(why.text, (by.get(why.text) || 0) + 1); }
    else out.idle++;
  }
  out.reasons = [...by].map(([text, n]) => ({ text, n })).sort((a, b) => b.n - a.n || (a.text < b.text ? -1 : 1));
  const rest = [];
  if (out.resting) rest.push(out.resting + " resting");
  if (out.guided) rest.push(out.guided + " guided");
  if (out.idle) rest.push(out.idle + " idle");
  out.line = out.working + " of " + out.n + " working" + (rest.length ? ", " + rest.join(", ") : "")
    + (out.blocked ? "; " + out.blocked + " blocked: " + out.reasons.slice(0, 2).map(r => r.text).join("; ") : out.reasons.length ? "; stalled: " + out.reasons[0].text : "");
  return out;
}

/** "Name: task - summary" for one crew. */
export function crewLine(sim, crew) { return crew.name + " (" + taskText(crew.task) + "): " + crewSummary(sim, crew).line; }

/** S15: the adults with nothing to do right now (free time, not guided, not out on an expedition, not in a need): the "select all idle" helper. In id order. */
export function idleAdults(sim) {
  return sim.ents.ofKind("villager").filter(v => isAdult(sim, v) && !v.poss && !v.xp && !v.slp && !(v.job && v.action && v.job.c !== "leisure"));
}
/** S15: one line for the panel header: "12 crews, 87 members (3 not in a crew)". */
export function crewsLine(sim) {
  const L = sim.crews.list, m = L.reduce((t, c) => t + c.ids.length, 0), free = sim.ents.ofKind("villager").filter(v => isAdult(sim, v) && !v.cr).length;
  return L.length + (L.length === 1 ? " crew" : " crews") + ", " + m + (m === 1 ? " member" : " members") + (free ? " (" + free + " adults in no crew)" : "");
}
