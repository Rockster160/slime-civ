// Bonds (S13, GDD §08 relationships): who a villager is close to, beyond family. Low-level and import-free of
// the rest of the sim, so skills.js, jobs.js and the UI can read it without a cycle.
//
//   v.aff  = {otherId: [work, hard, clash]}   running affinity points (work: worked beside them, hard: came through a hardship
//                                             together, clash: temper clashes while working beside them; clash is <= 0)
//   v.mn   = {otherId: n}                     Teach history: +n = I taught them, -n = they taught me
//   v.rel  = [{o, k, s, w, d?}]               the tiers (D8: a signed int list of at most MAX_REL): k friend|rival|partner|mentor,
//                                             s strength 0..1, w the reason code, d (mentor only) 1 = they are my mentor, -1 = my pupil
// Everything is plain JSON on the villager, so it saves and hashes with the entities.
import { mix32 } from "./rng.js";
import { clamp } from "./util.js";

export const MAX_REL = 6;                 // D8: relationship slots per villager
export const FRIEND_AT = 30, RIVAL_AT = -30;       // affinity needed to become friends / rivals
export const KEEP_FRAC = 0.5;             // a tier is kept until the affinity falls below this share of its threshold (hysteresis)
export const MENTOR_AT = 8;               // lesson-gains before a teacher counts as a mentor
export const SOC_BONUS = 5;               // jobs next to a friend score this much higher, next to a rival this much lower (inside the within-class clamp)
export const SOC_R = 4;                   // "beside": Chebyshev cells from where the job is
export const AFF_KEEP = 10;               // pairs remembered per villager
export const MENTOR_X = 1.1;              // a mentor's lessons are a tenth stronger

/** How well two get on, -1..1: unlike drive and leisure grate, like and like agree; a stable per-pair knack either way. */
export function chemistry(a, b) {
  const d = Math.abs(a.t.drive - b.t.drive) + 0.6 * Math.abs(a.t.leisure - b.t.leisure) + 0.4 * Math.abs(a.t.intelligence - b.t.intelligence);
  const lo = a.id < b.id ? a.id : b.id, hi = a.id < b.id ? b.id : a.id;
  const knack = (mix32(lo, hi * 7 + 13) / 4294967296 * 2 - 1) * 0.5;
  return clamp(0.6 - d * 1.4 + knack, -1, 1);
}

const entry = (v, id) => v.aff[id] || (v.aff[id] = [0, 0, 0]);
/** Add affinity points to both villagers: slot 0 work, 1 hard times, 2 clash. */
export function bump(a, b, slot, pts) {
  if (!a.aff) a.aff = {}; if (!b.aff) b.aff = {};
  entry(a, b.id)[slot] += pts; entry(b, a.id)[slot] += pts;
}
export const affTotal = (v, id) => { const e = v.aff && v.aff[id]; return e ? e[0] + e[1] + e[2] : 0; };

/** Teacher t gave pupil p one lesson that paid out. */
export function noteLesson(t, p) {
  if (!t.mn) t.mn = {}; if (!p.mn) p.mn = {};
  t.mn[p.id] = (t.mn[p.id] || 0) + 1; p.mn[t.id] = (p.mn[t.id] || 0) - 1;
  bump(t, p, 0, 0.5);
}

export const relOf = (v, id) => { if (v.rel) for (const r of v.rel) if (r.o === id) return r; return null; };
export const isMentorOf = (t, p) => { const r = relOf(p, t.id); return !!r && r.k === "mentor" && r.d === 1; };

/** Dominant reason code for a friend or rival entry. */
function reasonOf(e, k) {
  if (k === "rival") return "clash";
  return e[1] > e[0] ? "hard" : "work";
}

/**
 * Recompute v.rel from the affinity and Teach records. `alive(id)` says who is still here. Pure given its inputs.
 * Partner first, then mentors, then the strongest friends and rivals; kept tiers survive until the points halve.
 */
export function refreshTiers(v, alive) {
  const old = v.rel || [], out = [];
  if (v.mate && alive(v.mate)) out.push({ o: v.mate, k: "partner", s: 1, w: "bond" });
  const ids = new Set([...Object.keys(v.aff || {}).map(Number), ...Object.keys(v.mn || {}).map(Number)]);
  const cand = [];
  for (const id of [...ids].sort((a, b) => a - b)) {
    if (!alive(id) || out.some(r => r.o === id)) continue;
    const n = v.mn && v.mn[id] ? v.mn[id] : 0, e = v.aff && v.aff[id], tot = e ? e[0] + e[1] + e[2] : 0;
    const was = old.find(r => r.o === id);
    if (Math.abs(n) >= MENTOR_AT || (was && was.k === "mentor" && Math.abs(n) >= MENTOR_AT * KEEP_FRAC)) { cand.push({ o: id, k: "mentor", s: clamp(Math.abs(n) / (MENTOR_AT * 3), 0.3, 1), w: "teach", d: n < 0 ? 1 : -1, pri: 2 }); continue; }
    const fAt = was && was.k === "friend" ? FRIEND_AT * KEEP_FRAC : FRIEND_AT, rAt = was && was.k === "rival" ? RIVAL_AT * KEEP_FRAC : RIVAL_AT;
    if (tot >= fAt) cand.push({ o: id, k: "friend", s: clamp(tot / (FRIEND_AT * 3), 0.3, 1), w: reasonOf(e, "friend"), pri: 1 });
    else if (tot <= rAt) cand.push({ o: id, k: "rival", s: clamp(-tot / (-RIVAL_AT * 3), 0.3, 1), w: "clash", pri: 0 });
  }
  cand.sort((a, b) => b.pri - a.pri || b.s - a.s || a.o - b.o);
  for (const c of cand) { if (out.length >= MAX_REL) break; delete c.pri; c.s = Math.round(c.s * 100) / 100; out.push(c); }
  v.rel = out;
  return out;
}

/** Slow forgetting: every pair's points fade 3% a day; empty pairs go; at most AFF_KEEP are kept (the strongest). */
export function fadeAffinity(v) {
  if (!v.aff) return;
  const ks = Object.keys(v.aff).map(Number).sort((a, b) => a - b), keep = [];
  for (const id of ks) {
    const e = v.aff[id];
    for (let i = 0; i < 3; i++) e[i] = Math.round(e[i] * 0.97 * 100) / 100;
    const m = Math.abs(e[0]) + Math.abs(e[1]) + Math.abs(e[2]);
    if (m < 1) delete v.aff[id]; else keep.push([id, m]);
  }
  if (keep.length > AFF_KEEP) {
    keep.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    for (const [id] of keep.slice(AFF_KEEP)) delete v.aff[id];
  }
}

export const TIER_WORD = { friend: "Friend", rival: "Rival", partner: "Partner", mentor: "Mentor" };
/** The plain-words reason line of one tier entry (the other villager's name is given). */
export function reasonLine(r, name) {
  if (r.k === "partner") return "Partners: they share a bed and are the first choice to have children together.";
  if (r.k === "mentor") return r.d === 1 ? name + " taught them, and still teaches a little better for it." : "They taught " + name + ", and their lessons stick a little better for it.";
  if (r.k === "rival") return "They keep clashing when working beside " + name + " (different tempers), so they prefer jobs away from them.";
  return r.w === "hard" ? "They came through hard times with " + name + ", and now prefer jobs near them." : "They have worked side by side with " + name + " for days, and now prefer jobs near them.";
}
