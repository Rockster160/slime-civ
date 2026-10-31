// The job board's notices and the word of mouth (Phase 9, 9.31; notes/impl/PHASE9_KNOWLEDGE.md): a furniture entity `board` at the camp holds a bounded list of NOTICES, and slimes
// move facts between their own beliefs and it by walking up to it. Nothing here reaches a slime that is not standing at the board (or at the yard, or beside a friend).
//
//   board = {f:"board", x, y, z, notes:[notice]}     notice = [kind, x, y, z, n, tick, src, by, claim, claimTick, why]   (a belief fact + who wrote it + who has taken it)
//   kinds: the belief kinds that are places (food tree water ore:<mat> danger:<sp> site pen wagon dig), "need:food|warm|bed" (somebody is in need),
//          "need:<item>" (a request: "we need more wood!": n = the amount short, why = the job it is for), "claim:<cls>:<grp>" (this slime has that job; `by` tells who)
//   post(sim, v, board)    a slime at the board writes up to POST_N of its freshest, most useful facts, any shortage it hit and the job it holds (a claim)
//   read(sim, v, board)    a slime at the board copies up to READ_N notices into its beliefs (src 2), then takes the best open request it can do (claims it on the board)
//   passBoard(sim, v)      a slime handling stock in the yard next to the board writes its claim and, if due, its news (cheap: no walk)
//   gossip(sim, a, b)      two friends near each other swap up to GOSSIP_N place facts (src 1), never one the listener holds fresher
//   arrived(sim, v)        an arrival at the yard with a load: trade facts with whoever is there, and post if the board is at hand
//   cryOut(sim, v)         a starving or freezing slime tells everyone within CRY_R (OD-60: instead of a village-wide flag)
//   delivered(sim, v, item, n)   stock landed in the yard: the request for that item falls by that much and closes at 0
//   designate(sim, kind, x, y, z)  a player's designation (a dig, a pen) is written on the board (OD-58)
// Caps and clocks are flat tick constants (not per day).
import { IDEA, learn, isReq, flags, patchEnts, digLeft, clearLeft, STALE, FORGET, PATCH_R } from "./belief.js";
import { demandOf, CLAIM_EXPIRY } from "./local.js";
import { isAdult } from "./villager.js";
import { inZone } from "./items.js";
import { once } from "./chronicle.js";

export const BOARD_CAP = 32;        // notices on one board; the oldest go when it is full
export const POST_N = 3;            // facts a slime writes per visit (shortages and its claim come on top)
export const READ_N = 6;            // notices a slime reads per visit
export const GOSSIP_N = 2;          // place facts two friends swap per chat
export const POST_GAP = 900;        // ticks before the same slime posts again
export const READ_GAP = 600;        // ticks before the same slime checks the board again
export const NEED_LIFE = 6000;      // a need or a danger on the board is not believed after this (re-posted while it lasts); places last FORGET
export const REQ_FRESH = 6000;      // a request a slime read is worth taking for this long
export const CRY_R = 8;             // cells a cry for help carries (HEAR_R)
export const CRY_AT = 0.15;         // hunger or warmth below this: the slime cries out
export const CRY_GAP = 300;         // ticks between one slime's cries
export const PASS_R = 4;            // a slime this close to the board while handling the yard's stock "passes" it
export const YARD_R = 4;            // an arrival at the yard trades facts with slimes this close
export const TRADE_GAP = 300;       // ticks between one slime's trades at the yard
export const LOW_LARDER = 0.3;      // food demand at or above this and a slime that read the larder posts the shortage
export const KEEP_FOOD_N = 12;      // rations short that count as the whole "keep food" pressure (discovery.js)
const BY = 7, CL = 8, CT = 9, WHY = 10;
const FACT_NEEDS = new Set(["need:food", "need:warm", "need:bed"]);
export const REQ_ITEMS = new Set(["stick", "log", "grass"]);         // what an idle slime can fetch on request (chop, chop, cut)

/** Places and states worth writing on the board or telling a friend. (A bed, a stack, a stockpile reading, a head-count are not: they are for whoever stands there.) */
const placeKind = (k) => k === "food" || k === "plot" || k === "tree" || k === "water" || k === "site" || k === "pen" || k === "wagon" || k === "dig" || k === "clear" || k === "furn:board" || k.startsWith("ore:") || k.startsWith("danger:");
const urgentKind = (k) => k === "need:food" || k === "need:warm" || k.startsWith("danger:");
const rank = (k) => (urgentKind(k) ? 4 : k === "need:bed" || isReq(k) ? 3 : k === "site" || k === "dig" || k === "clear" || k === "pen" ? 2 : 1);
const life = (k) => (k.startsWith("need:") || k.startsWith("danger:") ? NEED_LIFE : FORGET);
const near = (a, k, x, y, z) => a[0] === k && Math.abs(a[1] - x) <= PATCH_R && Math.abs(a[2] - y) <= PATCH_R && Math.abs(a[3] - z) <= PATCH_R;

// ---- the furniture ----

/** Every board in the world, in id order (a handful at most), cached per item version. */
export function boardsOf(sim) {
  const c = sim.cache;
  if (c.bdv === c.iv && c.bdl) return c.bdl;
  const out = [];
  for (const f of sim.ents.ofKind("furniture")) if (f.f === "board") out.push(f);
  c.bdl = out; c.bdv = c.iv;
  return out;
}
/** The founding board (free, OD-59): the nearest free walkable cell beside the yard. Returns the entity (or null when the ground is all taken). No rng. */
export function placeBoard(sim) {
  const z = sim.stock, w = sim.world;
  if (!z) return null;
  const cx = (z.x0 + z.x1) >> 1, cy = (z.y0 + z.y1) >> 1;
  let best = null, bd = 1e9;
  for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) {
    const x = cx + dx, y = cy + dy;
    if (inZone(z, x, y)) continue;
    const gap = Math.max(z.x0 - x, x - z.x1, z.y0 - y, y - z.y1);          // cells between the yard's edge and this cell
    if (gap > 3) continue;
    const sz = w.standZ(x, y);
    if (sz < 0 || Math.abs(sz - z.z) > 1 || sim.ents.at(x, y, sz).length) continue;
    const d = gap * 100 + Math.abs(dx - (z.x1 - z.x0) / 2 - 1) + Math.abs(dy);     // hugging the yard's east side, nearest first
    if (d < bd || (d === bd && (y < best[1] || (y === best[1] && x < best[0])))) { bd = d; best = [x, y, sz]; }
  }
  if (!best) return null;
  const e = sim.ents.add("furniture", { f: "board", x: best[0], y: best[1], z: best[2], owner: 0, rv: 0, rt: 0, notes: [] });
  sim.cache.iv++;
  return e;
}
/** An old save has no board: it gets one, and its slimes know where it stands (they are camp people: OD-57). */
export function ensureBoard(sim) {
  if (boardsOf(sim).length) return;
  const e = placeBoard(sim);
  if (!e) return;
  for (const v of sim.ents.ofKind("villager")) if (v.bel) learn(v.bel, "furn:board", e.x, e.y, e.z, 1, sim.tick, 0, sim.tick);
}
/** The nearest board within `r` cells of a slime (same level or one off), or null. */
export function boardNear(sim, v, r) {
  let best = null, bd = 1e9;
  for (const b of boardsOf(sim)) {
    const d = Math.max(Math.abs(b.x - v.x), Math.abs(b.y - v.y));
    if (d <= r && Math.abs(b.z - v.z) <= 1 && d < bd) { bd = d; best = b; }
  }
  return best;
}

// ---- notices ----

const live = (n, now) => now - n[5] <= life(n[0]);
export const claimLive = (n, now) => n[CL] > 0 && now - n[CT] <= CLAIM_EXPIRY;
/** Drop what has expired: old needs and places, and claims nobody renewed. The oldest go first when it is full. */
export function tidy(board, now) {
  const a = board.notes;
  for (let i = a.length - 1; i >= 0; i--) {
    const n = a[i];
    if (n[CL] > 0 && !claimLive(n, now)) { n[CL] = 0; n[CT] = 0; }
    if (!live(n, now) || (n[0].startsWith("claim:") && now - n[5] > CLAIM_EXPIRY)) a.splice(i, 1);
  }
}
/** Write a notice. Same kind (a request: the item; a claim: the claimant; a place: within PATCH_R) merges into one, the fresher wins and keeps its claim. Returns true if it changed the board. */
export function addNotice(board, k, x, y, z, n, t, src, by, why, now) {
  const a = board.notes;
  const exact = k.startsWith("need:");
  let f = null;
  for (const o of a) if (k.startsWith("claim:") ? o[0] === k && o[BY] === by : exact ? o[0] === k : near(o, k, x, y, z)) { f = o; break; }
  if (f) {
    if (f[5] > t) return false;
    const was = f[4], wasT = f[5];
    f[4] = n; f[5] = t; f[6] = src; f[BY] = by; if (why) f[WHY] = why;
    return was !== n || wasT !== t;
  }
  if (a.length >= BOARD_CAP) {                                        // the oldest notice makes room (a claim-free one first)
    let wi = 0;
    for (let i = 1; i < a.length; i++) { const A = a[i], W = a[wi]; if ((A[CL] > 0) < (W[CL] > 0) || ((A[CL] > 0) === (W[CL] > 0) && A[5] < W[5])) wi = i; }
    a.splice(wi, 1);
  }
  a.push([k, x, y, z, n, t, src, by, 0, 0, why || ""]);
  return true;
}
/** Total of the fresh notices of one kind on every board (the village's hand-written need: `need:bed`, `need:food`). A reading of paper, not of the world. */
export function boardNeed(sim, kind) {
  let s = 0;
  for (const b of boardsOf(sim)) for (const n of b.notes) if (n[0] === kind && live(n, sim.tick)) s += n[4];
  return s;
}
/**
 * 9.32 (OD-58): the sites of a build, a deconstruction or a field: one notice per cluster (cells within PATCH_R of one already written merge), at most `max`, so a four-thousand-cell stamp
 * does not wipe the board. `kind` is the belief kind the slimes will hold it as ("site" for a ghost or a takedown mark, "plot" for a field). Written by the player (`by` 0).
 */
export function designateCells(sim, kind, cells, max = 4) {
  const b = boardsOf(sim)[0];
  if (!b || !cells.length) return 0;
  const at = [];
  for (const c of cells) {
    if (at.length >= max) break;
    if (at.some(p => Math.abs(p.x - c.x) <= PATCH_R && Math.abs(p.y - c.y) <= PATCH_R && Math.abs(p.z - c.z) <= PATCH_R)) continue;
    at.push(c);
    addNotice(b, kind, c.x, c.y, c.z, 1, sim.tick, 0, 0, "", sim.tick);
  }
  return at.length;
}
/** A player's designation is written on the board too (OD-58): the slimes it was not given to learn of it by reading, or from a friend. (No board, no notice.) */
export function designate(sim, kind, x, y, z, n = 1) {
  const b = boardsOf(sim)[0];
  if (b) addNotice(b, kind, x, y, z, n, sim.tick, 0, 0, "", sim.tick);
}

// ---- posting ----

/** The slime's news, most useful first: what it has seen or heard (never what it read off a board), not stale and not already on this board as fresh. [[kind, x, y, z, n, tick]] */
function news(sim, v, board) {
  const now = sim.tick, out = [];
  for (const f of v.bel || []) {
    const k = f[0];
    if (f[6] === 2 || now - f[5] > STALE) continue;                    // what the board told it is not news to the board
    if (!(placeKind(k) || FACT_NEEDS.has(k) || isReq(k))) continue;
    if (k === "furn:board" || (isReq(k) && f[6] !== 0)) continue;
    if (FACT_NEEDS.has(k) && now - f[5] > NEED_LIFE) continue;
    let have = null;
    for (const o of board.notes) if (k.startsWith("need:") ? o[0] === k : near(o, k, f[1], f[2], f[3])) { have = o; break; }
    if (have && have[5] >= f[5]) continue;
    out.push(f);
  }
  out.sort((a, b) => rank(b[0]) - rank(a[0]) || b[5] - a[5] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out;
}
/** The shortages and needs this slime would write up now (a request, a low larder, a missing bed, a housemate's need), as facts. */
function shortages(sim, v) {
  const now = sim.tick, out = [];
  for (const f of v.bel || []) if (isReq(f[0]) && f[6] === 0 && now - f[5] <= NEED_LIFE) out.push(f);
  const d = demandOf({ sim, v });
  if (d.reading && d.food >= LOW_LARDER && d.short > 0) out.push(["need:food", sim.stock.x0, sim.stock.y0, sim.stock.z, d.short, now, 0]);
  if (!v.bed && isAdult(sim, v)) out.push(["need:bed", v.x, v.y, v.z, Math.max(1, (d.nb || 0) + 1), now, 0]);
  return out;
}
/** Does this slime have anything worth taking to the board? (cheap: the post job's gate; the low larder is added when it actually writes) */
export function hasNews(sim, v, board) {
  if (!v.bel) return false;
  for (const f of v.bel) if (isReq(f[0]) && f[6] === 0 && sim.tick - f[5] <= NEED_LIFE) return true;
  if (!v.bed && isAdult(sim, v)) return true;
  return news(sim, v, board).length > 0;
}
/** At the board: write the freshest POST_N facts, every shortage, and the job it holds. Returns how many notices changed. */
export function post(sim, v, board) {
  const now = sim.tick;
  tidy(board, now);
  v.bp = now;
  let w = 0;
  for (const f of news(sim, v, board).slice(0, POST_N)) if (addNotice(board, f[0], f[1], f[2], f[3], f[4], f[5], f[6], v.id, "", now)) w++;
  for (const f of shortages(sim, v)) {
    if (addNotice(board, f[0], f[1], f[2], f[3], f[4], f[5], 0, v.id, f[7] || "", now)) w++;
  }
  if (claimJob(board, v, now)) w++;
  if (w > 0) once(sim, "firstNotice", "MILESTONE", v.name + " pinned the first notice to the board.", [v.id], {}, 1);       // 9.32: a chronicle line
  if (v.rq) {                                                         // it is on a request: the claim is renewed
    for (const o of board.notes) if (o[0] === "need:" + v.rq[0] && o[CL] === v.id) o[CT] = now;
    v.rq[1] = now;
  }
  return w;
}
/** The job group this slime holds is written as a claim (a bed, a rack, a site, a dig, a pen). Not leisure, not its own needs. */
function claimJob(board, v, now) {
  const j = v.job;
  if (!j || !j.g || j.c === "leisure" || j.c === "need" || j.c === "order" || j.g === "board") return false;
  return addNotice(board, "claim:" + j.c + ":" + j.g, board.x, board.y, board.z, 1, now, 0, v.id, "", now);
}
/** Handling the yard's stock beside the board: the claim and, if it is due, the news, with no walk (the cheap path). */
export function passBoard(sim, v) {
  if (flags.off || !v.bel) return;
  const b = boardNear(sim, v, PASS_R);
  if (!b) return;
  const now = sim.tick;
  claimJob(b, v, now);
  if (now - (v.bp === undefined ? -1e9 : v.bp) >= POST_GAP && hasNews(sim, v, b)) post(sim, v, b);
}

// ---- reading ----

/** What a slime can do for a request: chop for wood, cut for grass. (An idle adult, no hands full of something else.) */
const canDo = (item) => REQ_ITEMS.has(item);
/** At the board: read up to READ_N notices into the beliefs (src 2), most urgent first, then take the best open request it can do and claim it. Returns the number read. */
export function read(sim, v, board) {
  const now = sim.tick, b = v.bel;
  tidy(board, now);
  v.br = now;
  if (!b) return 0;
  const cand = [];
  for (const n of board.notes) if (n[BY] !== v.id && live(n, now)) cand.push(n);
  cand.sort((p, q) => rank(q[0]) - rank(p[0]) || q[5] - p[5] || (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0));
  let got = 0;
  for (const n of cand) {
    if (got >= READ_N) break;
    const k = n[0].startsWith("claim:") ? n[0] + "#" + n[BY] : n[0];
    if (learn(b, k, n[1], n[2], n[3], n[4], n[5], 2, now, n[WHY])) got++;
    if (urgentKind(n[0]) && v.action) v.rp = 1;
  }
  if (v.rq) {                                                         // its own request: is it still open? A closed one is dropped (it is standing at the board and sees it gone)
    const mine = board.notes.find(o => o[0] === "need:" + v.rq[0] && o[CL] === v.id && claimLive(o, now));
    if (!mine) v.rq = null;
  }
  if (!v.rq && isAdult(sim, v)) takeRequest(sim, v, board);
  return got;
}
/** Take the biggest open request it can fill (a claim written on the notice, and remembered in `v.rq` = [item, tick, amount left]). */
function takeRequest(sim, v, board) {
  const now = sim.tick;
  let best = null;
  for (const n of board.notes) {
    if (!isReq(n[0]) || n[BY] === v.id || !live(n, now) || claimLive(n, now) || !canDo(n[0].slice(5)) || n[4] <= 0) continue;     // (what it wrote itself is for the others to fill)
    if (!best || n[4] > best[4] || (n[4] === best[4] && n[5] > best[5])) best = n;
  }
  if (!best) return;
  best[CL] = v.id; best[CT] = now;
  v.rq = [best[0].slice(5), now, best[4]];
}
/** Stock landed in the yard: the request for it falls by that much and closes at zero; the slime's own errand counts down too. */
export function delivered(sim, v, item, n) {
  if (n <= 0) return;
  for (const b of boardsOf(sim)) {
    const a = b.notes, k = "need:" + item;
    for (let i = 0; i < a.length; i++) if (a[i][0] === k) {
      a[i][4] -= n;
      if (a[i][4] <= 0) { a.splice(i, 1); once(sim, "firstRequest", "MILESTONE", v.name + " filled the first request on the board: more " + item + ".", [v.id], {}, 1); }      // 9.32: a chronicle line
      break;
    }
  }
  if (v.rq && v.rq[0] === item) { v.rq[2] -= n; if (v.rq[2] <= 0) v.rq = null; }
}

// ---- word of mouth ----

/** a and b swap up to GOSSIP_N place facts each way: the freshest the listener does not hold as fresh. Heard facts are src 1 and keep their own age. */
export function gossip(sim, a, b) {
  if (flags.off || !a.bel || !b.bel) return 0;
  return tellFacts(sim, a, b) + tellFacts(sim, b, a);
}
function tellFacts(sim, from, to) {
  const now = sim.tick, src = from.bel, out = [];
  for (const f of src) if (placeKind(f[0]) && now - f[5] <= STALE) out.push(f);
  out.sort((p, q) => rank(q[0]) - rank(p[0]) || q[5] - p[5] || (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0));       // a danger first, then what is being asked for (a dig, a pen, a site), then the freshest
  let n = 0;
  to.bel.nw = false;
  for (const f of out) {
    if (n >= GOSSIP_N) break;
    if (learn(to.bel, f[0], f[1], f[2], f[3], f[4], f[5], 1, now)) n++;
  }
  if (to.bel.nw && to.action) to.rp = 1;
  if (IDEA.tell) IDEA.tell(sim, from, to);                                          // 9.33: an idea goes with the news, at half strength
  return n;
}
/** A slime has just put a load down in the yard: it trades facts with whoever is there (same chat as above, no friend needed), and posts when the board is at hand. */
export function arrived(sim, v) {
  if (flags.off) return;
  const now = sim.tick;
  passBoard(sim, v);
  if (!v.bel || now - (v.yt === undefined ? -1e9 : v.yt) < TRADE_GAP) return;
  v.yt = now;
  const ents = sim.ents, seen = new Set();
  for (let dx = -YARD_R; dx <= YARD_R; dx++) for (let dy = -YARD_R; dy <= YARD_R; dy++) for (let dz = -1; dz <= 1; dz++) {
    const ids = ents.at(v.x + dx, v.y + dy, v.z + dz);
    for (let i = 0; i < ids.length; i++) {
      const o = ents.get(ids[i]);
      if (!o || o.kind !== "villager" || o.id === v.id || !o.bel || seen.has(o.id)) continue;
      seen.add(o.id);
      gossip(sim, v, o);
    }
  }
}

// ---- crying out (OD-60) ----

/** A slime starving or freezing calls out: every slime within CRY_R hears it, whether or not it can see the caller, and holds a `need:food` / `need:warm` fact for it. Replaces any village-wide flag. */
export function cryOut(sim, v) {
  const now = sim.tick;
  const k = v.hunger < CRY_AT ? "need:food" : v.warm < CRY_AT ? "need:warm" : "";
  if (!k || now - (v.cy === undefined ? -1e9 : v.cy) < CRY_GAP) return 0;
  v.cy = now;
  let n = 0;
  const ents = sim.ents;
  for (let dx = -CRY_R; dx <= CRY_R; dx++) for (let dy = -CRY_R; dy <= CRY_R; dy++) for (let dz = -2; dz <= 2; dz++) {
    const ids = ents.at(v.x + dx, v.y + dy, v.z + dz);
    for (let i = 0; i < ids.length; i++) {
      const o = ents.get(ids[i]);
      if (!o || o.kind !== "villager" || o.id === v.id || !o.bel) continue;
      o.bel.nw = false;
      if (learn(o.bel, k, v.x, v.y, v.z, 1, now, 1, now)) { n++; if (o.action) o.rp = 1; }
    }
  }
  return n;
}

/** Every 200 ticks: the boards forget what has expired (claims nobody renewed, needs nobody repeated). */
export function boardTick(sim) {
  for (const b of boardsOf(sim)) { tidy(b, sim.tick); clearDone(sim, b); }
}
/** 9.32: a designation (written by the player, `by` 0) whose work is done comes off the board: no site or plot left in its patch, no cell left marked near a dig notice. */
function clearDone(sim, b) {
  const a = b.notes;
  for (let i = a.length - 1; i >= 0; i--) {
    const n = a[i];
    if (n[BY] !== 0) continue;
    if (n[0] === "dig") { if (!digLeft(sim, n)) a.splice(i, 1); }
    else if (n[0] === "clear") { if (!clearLeft(sim, n)) a.splice(i, 1); }
    else if (n[0] === "site" || n[0] === "plot") { const out = []; patchEnts(sim, n, out, new Set()); if (!out.length) a.splice(i, 1); }
  }
}
