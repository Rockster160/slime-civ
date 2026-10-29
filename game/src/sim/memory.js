// Experience and memory (experiment, notes/impl/MEMORY_SYSTEM.md): experience -> memory -> interest / fear -> autonomous action.
//
//   v.ps  = {b, c, s}      temperament, integers 0..100: bold, curious, sensitive. The LENS an event is appraised through. Never changes.
//   v.mem = [[subj, p, n, count, last]]   at most MEM_CAP slots; p (liking) and n (fear) are each 0..1000 and coexist
//   v.epi = [[tick, subj, kind]]          at most EPI_CAP vivid episodes (for the inspector)
//
// Subjects are strings: "cave" "deep" "ore" "gem" "treasure" "trap", or a fauna kind ("crawler", "thornback" ...).
// feel(sim, v, subj, kind, mag) is called only from the shared choke points (fauna damage and kill, dig results, traps, cache open, cave reveals, fearStep),
// so possession and the AI feel the same things; the appraisal is the villager's own. No per-tick work: events, a 1000-tick decay, and a <= 8 slot scan when scoring.
// Pure integers; nothing here reads a clock or a random stream (temperament comes from a hash).
import { mix32 } from "./rng.js";
import { once } from "./chronicle.js";
import { clamp } from "./util.js";
import { F, M } from "./world.js";

export const MEM_CAP = 8, EPI_CAP = 4;
export const K = 3;                     // event scale: a mag-80 win gives a curious slime (c 90) about 335 liking
export const STRONG = 400;              // a chronicle line, and a full-strength score term
export const HEARD_CAP = 190;           // a story never outweighs a lived memory
export const DECAY_EVERY = 1000;        // ticks between decay passes (staggered by id)
export const EPI_MAG = 30;              // events at least this large are remembered as episodes
export const MEM_CLAMP = 20;            // the p.mem score term, inside the +-45 within-class clamp
export const EXPLORE_P = 200;           // liking needed before a slime goes looking for it
export const SCOUT_P = 400;             // ... and (with c > 50) before it may map unmapped cave
export const EXPLORE_LEASH = 60;        // cells from the camp (wandering is 30)
export const FEAR_DEAD = 100;           // fearMul: |n - p/2| below this leaves the scare as it was
export const FEAR_AT = 250;             // n at which a slime keeps clear of a subject (wander) and the inspector says "Fears"
export const flags = { off: false };    // test-only: tools/mem_probe.js sets it to run a memory-OFF baseline; nothing else touches it
export const SUBJECTS = ["cave", "deep", "ore", "gem", "treasure", "trap"];

const NAMES = { cave: "caves", deep: "the deep", ore: "ore", gem: "gems", treasure: "treasure", trap: "traps", crawler: "cave crawlers", wolf: "wolves" };
/** The subject as a plural noun ("caves", "cave crawlers"). */
export function subjWord(s) { return NAMES[s] || s + "s"; }

// ---- temperament ----

/** A founder's (or an old save's) temperament: three hashed integers 0..100 of (seed, id). */
export function hashTemper(seed, id) {
  const h = mix32(seed >>> 0, id);
  return { b: mix32(h, 0x62) % 101, c: mix32(h, 0x63) % 101, s: mix32(h, 0x73) % 101 };
}
/** A newborn: the mean of the parents still alive to be asked, plus a hashed jitter of +-15; a founder (no parents): the hash. */
export function initTemper(sim, v) {
  const ps = [];
  for (const id of v.par || []) { const p = sim.ents.get(id); if (p && p.ps) ps.push(p.ps); }
  if (!ps.length) return hashTemper(sim.seed, v.id);
  const out = {};
  for (const k of ["b", "c", "s"]) {
    let sum = 0; for (const p of ps) sum += p[k];
    out[k] = clamp(Math.round(sum / ps.length) + (mix32(v.id, 0x6a + k.charCodeAt(0)) % 31) - 15, 0, 100);
  }
  return out;
}
/** Fill what an older save or a hand-made villager lacks (additive; restore() calls it). */
export function fillMemory(sim, v) {
  if (!v.ps) v.ps = hashTemper(sim.seed, v.id);
  if (!v.mem) v.mem = [];
  if (!v.epi) v.epi = [];
}

// ---- slots ----

function find(v, subj) { const m = v.mem; for (let i = 0; i < m.length; i++) if (m[i][0] === subj) return m[i]; return null; }
/** The memory of a subject: {p, n} (zeros when there is none). */
export function recall(v, subj) { const s = v.mem && find(v, subj); return s ? { p: s[1], n: s[2] } : { p: 0, n: 0 }; }
function slotFor(v, subj) {
  let s = find(v, subj);
  if (s) return s;
  if (v.mem.length >= MEM_CAP) {                                  // full: the weakest (p + n, then the oldest) goes
    let wi = 0;
    for (let i = 1; i < v.mem.length; i++) { const a = v.mem[i], w = v.mem[wi]; if (a[1] + a[2] < w[1] + w[2] || (a[1] + a[2] === w[1] + w[2] && a[4] < w[4])) wi = i; }
    v.mem.splice(wi, 1);
  }
  s = [subj, 0, 0, 0, 0];
  v.mem.push(s);
  return s;
}

/**
 * One experience. kind: "good" (found, won), "bad" (hurt, trapped, scared), "safe" (exposure with no harm). mag 1..100.
 * good: liking grows with curiosity, and a little fear of the same thing melts. bad: fear grows with sensitivity, less with boldness, and a fear already
 * high in a sensitive slime grows faster (sensitisation). safe: fear fades with boldness (a sensitive slime barely habituates) and curiosity enjoys the novelty (liking += mag * c / 50).
 */
export function feel(sim, v, subj, kind, mag) {
  if (flags.off || v.kind !== "villager" || mag < 1) return;
  if (!v.mem) fillMemory(sim, v);
  mag = Math.round(mag);
  const { b, c, s: sn } = v.ps, s = slotFor(v, subj), p0 = s[1], n0 = s[2];
  if (kind === "good") {
    s[1] += Math.floor(mag * (50 + c) * K / 100);
    if (s[2] > 0) s[2] -= Math.floor(s[2] * c / 400);                                        // a win over a fear softens it a little, more in a curious slime
  } else if (kind === "bad") {
    let d = Math.floor(mag * (50 + sn - Math.floor(b / 2)) * K / 100);
    if (n0 >= 300 && sn > 50) d = Math.floor(d * (100 + sn - 50) / 100);                      // sensitisation
    s[2] += d;
  } else {
    s[2] -= Math.floor(mag * (b + 50) * (150 - sn) * K / 30000);
    if (SUBJECTS.includes(subj) || s[1] > s[2]) s[1] += Math.floor(mag * c / 50);             // novelty is a place's charm; a creature is only enjoyed by one who already likes it more than they fear it (a win) (mere sight breeds habituation, not fondness)
  }
  s[1] = clamp(s[1], 0, 1000); s[2] = clamp(s[2], 0, 1000); s[3]++; s[4] = sim.tick;
  if (mag >= EPI_MAG && kind !== "safe") { v.epi.push([sim.tick, subj, kind]); if (v.epi.length > EPI_CAP) v.epi.shift(); }
  if (s[1] >= STRONG && p0 < STRONG && s[1] > s[2]) once(sim, "mem:" + v.id + ":" + subj + ":p", "MILESTONE", v.name + " is drawn to " + subjWord(subj) + ".", [v.id], { subj, k: "p" }, 1);
  if (s[2] >= STRONG && n0 < STRONG && s[2] > s[1]) once(sim, "mem:" + v.id + ":" + subj + ":n", "MILESTONE", v.name + " is afraid of " + subjWord(subj) + ".", [v.id], { subj, k: "n" }, 1);
}

/** Every DECAY_EVERY ticks per villager: p and n fade about 3% (a sensitive slime's fear 2%), at least 1; a spent slot is dropped. */
export function decay(v) {
  const m = v.mem;
  for (let i = m.length - 1; i >= 0; i--) {
    const s = m[i];
    if (s[1] > 0) s[1] -= Math.max(1, Math.floor(s[1] * 3 / 100));
    if (s[2] > 0) s[2] -= Math.max(1, Math.floor(s[2] * (v.ps.s >= 60 ? 2 : 3) / 100));
    if (s[1] <= 0 && s[2] <= 0) m.splice(i, 1);
  }
}

// ---- what memory changes ----

/** The p.mem score term for the subjects a candidate touches: (p - n) / 50, summed, clamped to +-MEM_CLAMP. 0 for an empty memory. */
export function memBias(v, subjs) {
  if (!v.mem || !v.mem.length || !subjs) return 0;
  let t = 0;
  for (const sj of subjs) { const s = find(v, sj); if (s) t += Math.trunc((s[1] - s[2]) / 50); }
  return clamp(t, -MEM_CLAMP, MEM_CLAMP);
}
/** fearStep's multiplier on the scare a creature causes: 1 + n/1000 - p/2000, within 0.5..1.5. Exactly 1 with no memory of its kind. */
export function fearMul(v, sp) {
  const s = v.mem && v.mem.length ? find(v, sp) : null;
  if (!s) return 1;
  const d = s[2] - Math.floor(s[1] / 2);
  return d > -FEAR_DEAD && d < FEAR_DEAD ? 1 : clamp(1000 + d, 500, 1100) / 1000;      // a graze or two changes nothing: the dead zone keeps small memories out of the fear rule
}
/** Does this slime keep clear of this subject (a fear that outweighs its liking)? */
export function fears(v, subj) { const s = v.mem && v.mem.length ? find(v, subj) : null; return !!s && s[2] >= FEAR_AT && s[2] > s[1]; }

const underRock = (w, x, y, z) => w.isSolid(x, y, z + 1) || w.isSolid(x, y, z + 2) || w.isSolid(x, y, z + 3);
/** The place-subject of a cell: "deep" in a labyrinth, "cave" under rock, else "" (open sky). */
export function placeOf(sim, x, y, z) {
  const w = sim.world;
  if (w.flags(x, y, z) & F.DUNGEON) return "deep";
  return underRock(w, x, y, z) ? "cave" : "";
}

/** Wander asks: does this target cell lie on a feared subject (a cave they fear, or within 6 cells of a creature kind they fear)? Only a slime with a fear pays anything. */
export function avoids(sim, v, x, y, z) {
  const m = v.mem;
  if (!m || !m.length) return false;
  let any = false;
  for (let i = 0; i < m.length; i++) if (m[i][2] >= FEAR_AT && m[i][2] > m[i][1]) { any = true; break; }
  if (!any) return false;
  const pl = placeOf(sim, x, y, z);
  if (pl && fears(v, pl)) return true;
  if (v.kind === "villager") for (const e of sim.ents.ofKind("fauna")) if (fears(v, e.sp) && Math.abs(e.x - x) <= 6 && Math.abs(e.y - y) <= 6 && Math.abs(e.z - z) <= 3) return true;
  return false;
}

// ---- the story (culture seam) ----

/** a tells b, once: 10% of a's strongest memory (a feeling it has at STRONG or more) goes to b as a heard memory, never above HEARD_CAP and never an episode. Returns true if told. */
export function tell(sim, a, b) {
  if (!a.mem || !a.mem.length) return false;
  let best = null, bk = 1, bv = STRONG - 1;
  for (const s of a.mem) { if (s[1] > bv) { best = s; bk = 1; bv = s[1]; } if (s[2] > bv) { best = s; bk = 2; bv = s[2]; } }
  if (!best) return false;
  if (!b.mem) fillMemory(sim, b);
  const have = find(b, best[0]);
  if (have ? have[bk] >= HEARD_CAP : false) return false;
  const give = Math.min(Math.floor(bv / 10), HEARD_CAP - (have ? have[bk] : 0));
  if (give < 1) return false;
  const s = have || slotFor(b, best[0]);
  s[bk] = clamp(s[bk] + give, 0, HEARD_CAP); s[4] = sim.tick;
  return true;
}

// ---- cave exposure (seen.js watch: only when a look revealed new cells) ----

export const EXPOSE_GAP = 12;           // ticks between exposure events of one slime in one kind of place
/** A look from (x, y, z) just made dv cells known. Underground that is a safe exposure to caves (or the deep): curiosity enjoys it, fear fades. */
export function exposure(sim, v, dv) {
  if (dv < 6) return;
  const pl = placeOf(sim, v.x, v.y, v.z);
  if (!pl) return;
  if (v.mem) { const s = find(v, pl); if (s && sim.tick - s[4] < EXPOSE_GAP) return; }
  feel(sim, v, pl, "safe", clamp(dv >> 1, 4, 20));
}

// ---- what a dig turned up ----
/** The subject of a mined material ("gem", "ore") or "" (plain rock, clay, grass). */
export function mineSubject(m) {
  if (m === M.GEM || m === M.CRYSTAL || m === M.COREORE) return "gem";
  if (m === M.COAL || m === M.FLINT || m === M.MALACHITE || m === M.IRONORE) return "ore";
  return "";
}

/** The subjects a job candidate touches, for the p.mem term: an explore candidate names its own; a dig names its material; a job on a creature names its kind; disarming is traps in the deep. */
export function candSubjects(sim, c) {
  if (c.sj) return c.sj;
  if (c.kind === "mine" && c.cell) { const s = mineSubject(sim.world.mat(c.cell[0], c.cell[1], c.cell[2])); return s ? [s] : null; }
  if (c.kind === "disarm") return ["trap", "deep"];
  if (c.tid) { const e = sim.ents.get(c.tid); if (e && e.kind === "fauna") return [e.sp]; }
  return null;
}
