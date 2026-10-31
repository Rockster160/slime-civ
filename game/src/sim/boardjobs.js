// The board's jobs (Phase 9, 9.31): what a slime that believes in a board does with it, as ordinary candidates through the one pipeline (jobs.js adds them, the Task runner does them).
//
//   genBoard(ctx, H)       `post` (write news, shortages and its claim) and `check_board` (read the notices, take a request): leisure class, so any real work outranks them. A slime that has
//                          never seen or heard of a board has neither. The walk to the board is the only way anything crosses between a slime's beliefs and the notices.
//   genRequests(ctx, H)    the request this slime took at the board ("we need more wood!"): the matching work at standing class (a claimed errand), a pull (only a slime with nothing else to do takes it), tagged `rq`
//                          so the map shows the request's icon on the slime that has gone off to fill it
//   noteShortages(ctx)     a candidate that failed for lack of material writes the shortage into the slime's own beliefs (`need:<item>`, the amount short); it reaches the board when it next posts
//   digGate / knowsPen     the designations (a dig area, a pen) are only worked by slimes that know of them (a board notice read, a friend's word, the pen seen)
import { flags, learn, isStale, FORGET, PATCH_R } from "./belief.js";
import { CLAIM_EXPIRY } from "./local.js";
import { Task } from "./tasks.js";
import { POST_GAP, READ_GAP, REQ_ITEMS, hasNews } from "./notices.js";

export const DIG_SEE = 16;              // a believed dig notice covers the cells this close to where it was written

/** The nearest board this slime believes in. A board fact is the board's own cell (it never moves), so one cell lookup finds it, not a patch scan. */
function nearestBoard(ctx, H) {
  const ents = ctx.sim.ents;
  let best = null, bd = 1e9;
  for (const f of ctx.v.bel) {
    if (f[0] !== "furn:board") continue;
    const ids = ents.at(f[1], f[2], f[3]);
    for (let i = 0; i < ids.length; i++) {
      const e = ents.get(ids[i]);
      if (!e || e.f !== "board") continue;
      const d = H.dTo(ctx, e);
      if (d < bd) { bd = d; best = e; }
    }
  }
  return best;
}

export function genBoard(ctx, H) {
  const { sim, v, t } = ctx;
  if (!v.bel || flags.off || (v.fear || 0) > 0.1) return;
  const bd = nearestBoard(ctx, H);
  if (!bd) return;
  const d = H.dTo(ctx, bd), going = !!(ctx.cur && (ctx.cur.k === "post" || ctx.cur.k === "check_board"));
  if ((going || t - (v.bp === undefined ? -1e9 : v.bp) >= POST_GAP) && hasNews(sim, v, bd)) {
    const asg = !!(v.as && !v.order);                      // D58: an assigned slime has no leisure, but still passes on what it saw: the post is a short errand that outranks the assignment once per POST_GAP
    H.add(ctx, { kind: "post", cls: asg ? "order" : "leisure", urg: asg ? 3 : 1.5, grp: "board", d, tid: bd.id, key: "post:" + bd.id, mk: H.oneStep("post", "post", bd) });
  }
  if (v.as && !v.order) return;                            // ... and takes no request off the board
  if (going || t - (v.br === undefined ? -1e9 : v.br) >= READ_GAP) {
    H.add(ctx, { kind: "check_board", cls: "leisure", urg: 1.2, grp: "board", d, tid: bd.id, key: "check_board:" + bd.id, mk: H.oneStep("check_board", "read", bd) });
  }
}

export function genRequests(ctx, H) {
  const { v, t } = ctx, rq = v.rq;
  if (!rq || (v.as && !v.order) || t - rq[1] > CLAIM_EXPIRY || !REQ_ITEMS.has(rq[0])) return;
  const item = rq[0], n0 = ctx.cands.length, base = { cls: "standing", urg: 0.8, grp: "req:" + item, kp: "", pull: true };
  if (H.looseOf(ctx, item) > 0) H.looseCand(ctx, base, item, false);                // the wood lying about is hauled in first
  else if (item === "grass") H.gatherCand(ctx, base, false);
  else H.chopCand(ctx, base, false);
  for (let i = n0; i < ctx.cands.length; i++) { const c = ctx.cands[i]; c.rq = item; c.key = "rq:" + c.key; }
}

export function noteShortages(ctx) {
  const { sim, v, t } = ctx, z = sim.stock;
  if (!v.bel || flags.off || ctx.dry || !z) return;
  for (const c of ctx.cands) if (c.blocker === "NO_MATERIAL" && c.short && c.sn > 0 && REQ_ITEMS.has(c.short)) learn(v.bel, "need:" + c.short, z.x0, z.y0, z.z, c.sn, t, 0, t, c.grp || "");
}

/** The dig notices this slime knows, as [[x, y]]; null when beliefs are off (every designation is open to everyone, as before). */
export function digGate(ctx) {
  if (flags.off || !ctx.v.bel) return null;
  const out = [];
  for (const f of ctx.v.bel) if (f[0] === "dig") out.push(f);
  return out;
}
/** Is the cell inside a dig notice this slime knows? */
export const digCovers = (gate, x, y, d) => {
  if (d && d.kind === "seek") { x = d.ax; y = d.ay; }         // a search is written where it starts; the cells it digs lie wherever it leads
  for (const f of gate) if (Math.abs(x - f[1]) <= DIG_SEE && Math.abs(y - f[2]) <= DIG_SEE) return true;
  return false;
};

/** Does this slime know of the pen (its gate seen, or a notice)? */
export function knowsPen(ctx, pen) {
  if (flags.off || !ctx.v.bel) return true;
  for (const f of ctx.v.bel) if (f[0] === "pen" && Math.abs(f[1] - pen.g[0]) <= PATCH_R + 1 && Math.abs(f[2] - pen.g[1]) <= PATCH_R + 1) return true;
  return false;
}

// ---- go and look (9.32) ----

export const LOOK_GAP = 1500;           // ticks between one slime's trips to look at something it believes in but has not seen lately
const LOOK_FAR = 40;                    // it only goes to look at what lies this close (Manhattan)
const LOOKABLE = (k) => k === "food" || k === "tree" || k === "water" || k.startsWith("furn:");

/** The stale fact worth a look: a place it believes in that it has not seen for STALE ticks (and has not yet forgotten), the nearest first, the oldest among equals. Null when none. */
export function staleFact(v, now) {
  let best = null, bd = 0;
  for (const f of v.bel) {
    if (!LOOKABLE(f[0]) || !isStale(f, now) || now - f[5] > FORGET || f[0] === "furn:board") continue;
    const d = Math.abs(f[1] - v.x) + Math.abs(f[2] - v.y);
    if (d > LOOK_FAR) continue;
    if (!best || d < bd || (d === bd && f[5] < best[5])) { best = f; bd = d; }
  }
  return best;
}
/** A cell to stand on within a few cells of a fact's centre (the centre itself may be a tree or a wall). */
function standNear(sim, f) {
  const w = sim.world;
  for (let r = 0; r <= 3; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    for (const dz of [0, 1, -1, 2, -2]) if (w.isWalkable(f[1] + dx, f[2] + dy, f[3] + dz)) return { x: f[1] + dx, y: f[2] + dy, z: f[3] + dz };
  }
  return null;
}
/**
 * The cheap leisure errand: a slime with nothing better to do and a stale fact walks out to look at it, so what it believes is refreshed (or found gone) before it needs it.
 * Leisure class and a low urgency: any real work outranks it, so it only spends idle time, and it keeps a slime from starving beside things it has forgotten.
 */
export function genLook(ctx, H) {
  const { sim, v, t } = ctx;
  if (!v.bel || flags.off || (v.fear || 0) > 0.1) return;
  const going = !!(ctx.cur && ctx.cur.k === "look");
  if (!going && t - (v.lg === undefined ? -1e9 : v.lg) < LOOK_GAP) return;
  const f = staleFact(v, t);
  if (!f) return;
  const d = Math.abs(f[1] - v.x) + Math.abs(f[2] - v.y);
  H.add(ctx, { kind: "look", cls: "leisure", urg: 0.6, grp: "look", d, tid: 0, key: "look:" + f[0] + ":" + f[1] + ":" + f[2], mk: () => {
    const st = standNear(sim, f);
    if (!st || !H.reach(ctx, st)) return { blocker: "NO_PATH" };
    v.lg = t;
    return { task: Task("look", [{ v: "survey", ...st }]), res: [] };
  } });
}
