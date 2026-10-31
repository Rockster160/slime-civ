// Own knowledge (Phase 9, 9.28; notes/impl/PHASE9_KNOWLEDGE.md): what ONE slime believes about the world, as a few bounded PATCHES.
//
//   v.bel = [[kind, x, y, z, n, tick, src]]   at most BEL_CAP facts
//   kind: "food" "tree" "bed" "site" "danger:<sp>" "need:food" "need:warm" "stock" (food rations in the yard) "stock:mat" (everything else)
//         9.29 adds: "loose" (items lying outside every store), "furn:<f>" (a rack, hearth, water jar, bench, kiln ... ; a bed stays "bed"), "plot" (a field plot), "game:<sp>" (huntable wild fauna),
//         9.30: "need:bed" (a grown slime seen with no bed) and "folk" (the most slimes seen at once lately: one slot, not a patch);
//         9.31: "wagon", "pen" (a pen's gate in view), "dig" (a designation the board or a friend told of), "need:<item>" (a shortage, "we need more wood"), "claim:<cls>:<grp>#<id>" (a slime the board says has the job);
//         "water" (a drinkable shore) and "ore:<mat>" (an exposed ore or clay cell); "site" now also covers a deconstruction mark (dsite)
//   n: the last amount seen (a patch: the sum over what the last look saw within PATCH_R of the centre). tick: when it was last confirmed. src: 0 saw, 1 told, 2 board.
//
// A fact is a patch, never a cell: a look folds each thing it sees into the fact of its kind within PATCH_R (centre stays where it first was).
// 9.29: the planners read beliefs (know.js; flags.off puts the old world scans back). The writers here touch no rng, no entity cache version and nothing but v.bel.
// The look is staggered (every LOOK_EVERY ticks per slime, by id) and queries the entity grid cell by cell, nearest ring first: O(local), never an ofKind over the world.
import { ITEMS, inStore } from "./items.js";
import { M, World } from "./world.js";
import { isAdult } from "./villager.js";
import { cellIdx } from "./cellkey.js";

export const BEL_CAP = 40;            // facts per slime (~1 KB saved; 24 in 9.28, raised for the 9.29 kinds)
export const LOOK_R = 6;              // cells a look reaches
export const LOOK_MAX = 12;           // facts a look may write or refresh (the stockpile's two included)
export const LOOK_EVERY = 8;          // ticks between looks of one slime (staggered by id)
export const PATCH_R = 3;             // things of one kind this close to a fact's centre fold into it
export const STALE = 18000;           // ticks (1.5 game days at 12000 a day): still usable, scored lower. A flat constant, not per day
export const FORGET = 72000;          // ticks (6 days): dropped
export const SEED_R = 16;             // a founder's camp knowledge reaches this far from the camp centre (OD-57)
export const NEED_LOW = 0.3;          // a housemate this hungry / cold is seen as in need
export const SRC = { saw: 0, told: 1, board: 2 };
export const flags = { off: false, nocache: false };  // test-only: runs the sim with the store off (hash comparison); nothing else touches it
// the creatures that hurt (the hostile rows of fauna.js / monsters.js; listed here because fauna.js reaches this file through population.js)
const HOSTILE = new Set(["thornback", "wolf", "crawler", "coreback", "spitter", "guardian"]);
const URGENT = (k) => k === "need:food" || k === "need:warm" || k.startsWith("danger:");
const K = 0, X = 1, Y = 2, Z = 3, N = 4, T = 5, S = 6;

export const isStale = (f, now) => now - f[T] > STALE;
const near = (f, kind, x, y, z) => f[K] === kind && Math.abs(f[X] - x) <= PATCH_R && Math.abs(f[Y] - y) <= PATCH_R && Math.abs(f[Z] - z) <= PATCH_R;

// terrain worth knowing: the ore and clay materials (seen.js ORE, copied here: seen.js reaches belief.js's importers through memory.js)
const ORE = new Uint8Array(256);
for (const m of [M.FLINT, M.MALACHITE, M.CLAY, M.IRONORE, M.COAL, M.SALT, M.PEAT, M.HERB, M.GEM, M.CRYSTAL, M.COREORE, M.CORE]) ORE[m] = 1;
const PLAIN = new Set(["door", "vent", "bellows"]);      // furniture nobody plans around

// 9.33: what a built thing teaches. ideas.js (which may import build.js and knowledge.js; this file may not: no import cycles) fills these hooks at startup:
//   IDEA.crafts(e) -> the crafts a furniture piece or ghost is the work of (or null); IDEA.mc[mat] -> the craft a wall / floor / roof material needs ("" none); IDEA.see(sim, v, craft, ring) -> one sighting.
export const IDEA = { crafts: null, mc: null, see: null, tell: null };       // (tell: knowledge.js tellIdeas, used by notices.js gossip)
const SAW = {};                       // the crafts one look saw built things of -> the nearest ring they stood at (reused: a look allocates nothing)
const sawAdd = (saw, c, ring) => { if (saw[c] === undefined || ring < saw[c]) saw[c] = ring; };
/** What a thing is worth knowing as: [kind, amount] or null. (`sim` is given by every caller that wants loose items told from stored ones.) */
export function kindOf(e, people, selfId, sim) {
  switch (e.kind) {
    case "plant":
      if (e.species === "tree") return e.burn ? null : ["tree", 1];
      return (e.species === "berry" || e.species === "tuft" || e.species === "tuber") && e.yield > 0 ? ["food", e.yield] : null;
    case "furniture": return e.f === "bed" ? ["bed", 1] : PLAIN.has(e.f) ? null : ["furn:" + e.f, 1];
    case "site": case "csite": case "dsite": return ["site", 1];
    case "plot": return ["plot", 1];
    case "wagon": return ["wagon", 1];                                                   // 9.31: a wagon or cart is a believed thing (wagonHaul reads it through entsOf)
    case "item": return sim && !inStore(sim, e.x, e.y, e.z) ? ["loose", e.n] : null;
    case "fauna":
      if (HOSTILE.has(e.sp)) return ["danger:" + e.sp, 1];
      return e.tame || e.st === "held" ? null : ["game:" + e.sp, 1];
    case "villager":
      if (!people || e.id === selfId) return null;
      if (e.hunger < NEED_LOW) return ["need:food", 1];
      if (e.warm < NEED_LOW) return ["need:warm", 1];
      return sim && !e.bed && isAdult(sim, e) ? ["need:bed", 1] : null;               // 9.30: a missing bed is seen in the grown slime who has none (local.js)
  }
  return null;
}

/**
 * The fact to go when the store is full: from the kind the slime holds the most patches of, the oldest, then the smallest (so the only patch of anything, say the one
 * water hole, outlives the tenth grove). Never one written this very tick.
 */
function evict(b, now) {
  const cnt = {};
  const ck = (k) => (k.startsWith("claim:") ? "claim" : k);          // 9.31: the board's claims go first (a store full of other slimes' claims is the least useful kind)
  for (const f of b) cnt[ck(f[K])] = (cnt[ck(f[K])] || 0) + 1;
  let wi = -1;
  for (let i = 0; i < b.length; i++) {
    if (b[i][T] === now) continue;
    if (wi < 0) { wi = i; continue; }
    const a = cnt[ck(b[i][K])], c = cnt[ck(b[wi][K])];
    if (a > c || (a === c && (b[i][T] < b[wi][T] || (b[i][T] === b[wi][T] && b[i][N] < b[wi][N])))) wi = i;
  }
  if (wi >= 0) b.splice(wi, 1);
  return wi >= 0;
}

/**
 * Fold what stands within `r` of (cx, cy, cz) into b, nearest ring first, touching at most `max` distinct facts. People are noticed only when `people`.
 * Terrain is read too (9.29): an exposed ore or clay cell becomes `ore:<mat>` and the surface of open water `water`. This is the ONE writer of facts from the world.
 * Returns the ring up to which the area was seen completely (r when nothing was left out).
 */
export function scan(sim, b, cx, cy, cz, r, max, now, src, selfId, people, zr = 2, saw = null) {
  const ents = sim.ents, w = sim.world;
  let wr = 0;
  const fold = (k, x, y, z, n) => {
    let f = null;
    for (let j = 0; j < b.length; j++) if (near(b[j], k, x, y, z)) { f = b[j]; break; }
    if (f && f[T] === now) { f[N] += n; return true; }                         // already touched by this look: the patch adds up
    if (wr >= max) return false;
    if (f) { f[N] = n; f[T] = now; f[S] = src; }
    else { if (b.length >= BEL_CAP && !evict(b, now)) return true; b.push([k, x, y, z, n, now, src]); if (URGENT(k)) b.nw = true; }     // 9.30: a new hunger / cold / danger fact is a material change (look() asks for a replan); a bedless neighbour is not (the timer is enough)
    wr++;
    return true;
  };
  for (let ring = 0; ring <= r; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      const edge = dx === -ring || dx === ring;
      for (let dy = -ring; dy <= ring; dy += edge ? 1 : 2 * ring || 1) {
        for (let z = cz - zr; z <= cz + zr; z++) {
          const x = cx + dx, y = cy + dy;
          const ids = ents.at(x, y, z);
          for (let i = 0; i < ids.length; i++) {
            const e = ents.get(ids[i]), k = e && kindOf(e, people, selfId, sim);
            if (saw && e && (e.kind === "furniture" || e.kind === "csite")) { const cl = IDEA.crafts && IDEA.crafts(e); if (cl) for (let q = 0; q < cl.length; q++) sawAdd(saw, cl[q], ring); }      // 9.33: a built thing of a craft: noted, taught by the caller
            if (people && e && e.kind === "villager" && e.id !== selfId) b.fk = (b.fk || 0) + 1;       // 9.30: how many slimes are in view (the "folk" reading)
            if (k && !fold(k[0], e.x, e.y, e.z, k[1])) return ring - 1;
          }
          const m = w.mat(x, y, z);
          if (saw && IDEA.mc && IDEA.mc[m]) sawAdd(saw, IDEA.mc[m], ring);                  // 9.33: a wall of hide is hide working
          if (ORE[m] && exposed(w, x, y, z)) { if (!fold("ore:" + m, x, y, z, 1)) return ring - 1; }
          else if (m === M.WATER && w.mat(x, y, z + 1) === M.AIR) { if (!fold("water", x, y, z + 1, 1)) return ring - 1; }
        }
      }
    }
  }
  return r;
}
/** An ore cell with a neighbour that is not rock can be seen from outside (the look has no line of sight: a cave wall seen across the cave counts). */
function exposed(w, x, y, z) {
  return w.mat(x + 1, y, z) === M.AIR || w.mat(x - 1, y, z) === M.AIR || w.mat(x, y + 1, z) === M.AIR || w.mat(x, y - 1, z) === M.AIR || w.mat(x, y, z + 1) === M.AIR || w.mat(x, y, z - 1) === M.AIR;
}

/** Is anything still queued within 16 cells of a dig notice (the designations in sim.mine)? */
export function digLeft(sim, f) {
  const m = sim.mine;
  if (!m) return false;
  for (const d of m.list) {
    if (d.kind === "seek" && !d.done && Math.abs(d.ax - f[X]) <= 16 && Math.abs(d.ay - f[Y]) <= 16) return true;       // a search is written where it starts; the cells it digs lie wherever it leads
    for (let j = 0; j < d.q.length; j++) { const [x, y] = World.xyz(d.q[j]); if (Math.abs(x - f[X]) <= 16 && Math.abs(y - f[Y]) <= 16) return true; }
  }
  return false;
}
/** Is a Clear area rectangle still marked near a "clear" notice? (clear.js clearLeft, kept here so belief.js imports nothing of the sim's jobs.) */
export function clearLeft(sim, f) {
  const L = sim.clr;
  if (!L) return false;
  for (const r of L.list) if (Math.abs(((r.x0 + r.x1) >> 1) - f[X]) <= 16 && Math.abs(((r.y0 + r.y1) >> 1) - f[Y]) <= 16) return true;
  return false;
}
/** The "folk" reading: the most slimes this one has had in view lately (a head-count it can form on its own). Raised at once, lowered only once the old count is FOLK_KEEP old. */
const FOLK_KEEP = 3000;
function putFolk(b, v, now) {
  const n = b.fk + 1;
  const f = b.find(g => g[K] === "folk");
  if (!f) { if (n > 1) { if (b.length >= BEL_CAP && !evict(b, now)) return; b.push(["folk", v.x, v.y, v.z, n, now, 0]); } return; }
  if (n >= f[N] || now - f[T] > FOLK_KEEP) { f[N] = n; f[T] = now; f[X] = v.x; f[Y] = v.y; f[Z] = v.z; }
}

/** 9.31: a request the board (or a slime that hit a shortage) carries: "need:<item>" for anything that is not hunger, cold or a missing bed. One slot per item, wherever it was written. */
export const isReq = (k) => k.startsWith("need:") && k !== "need:food" && k !== "need:warm" && k !== "need:bed";
/** 9.31: the one writer of a fact someone else knew (the board's notice, a friend's word): same shape as `scan` writes, `src` 1 (told) or 2 (board), the fact's own tick kept (an old fact stays old).
 *  Never replaces what this slime already holds that is as fresh or fresher. Returns true when something was written. A claim is one slot per (job group, claimant), a request one per item. */
export function learn(b, k, x, y, z, n, t, src, now, why) {
  let f = null;
  const exact = k.startsWith("claim:") || isReq(k);
  for (let j = 0; j < b.length; j++) if (exact ? b[j][K] === k : near(b[j], k, x, y, z)) { f = b[j]; break; }
  if (f) {
    if (f[T] >= t) return false;
    f[X] = x; f[Y] = y; f[Z] = z; f[N] = n; f[T] = t; f[S] = src;
    if (why) f[7] = why;
  } else {
    if (b.length >= BEL_CAP && !evict(b, now)) return false;
    const g = [k, x, y, z, n, t, src];
    if (why) g.push(why);                                               // a request also says what it is for (the job group)
    b.push(g);
  }
  if (URGENT(k)) b.nw = true;
  return true;
}
/** 9.31: the pens in view (a pen is a player's designation, not an entity: it is seen like a site). */
function lookPens(sim, b, v, now) {
  const pens = sim.farm && sim.farm.pens;
  if (!pens) return;
  for (let i = 0; i < pens.length; i++) { const g = pens[i].g; if (Math.abs(g[0] - v.x) <= LOOK_R && Math.abs(g[1] - v.y) <= LOOK_R && Math.abs(pens[i].z - v.z) <= 2) learn(b, "pen", g[0], g[1], pens[i].z, 1, now, 0, now); }
}

/** Within sight of the yard, the slime reads its true contents (replacing the old facts). Returns how many facts it wrote. `anyDistance` for the founders' seed. */
export function readStock(sim, b, v, now, anyDistance) {
  const zn = sim.stock;
  if (!zn) return 0;
  const px = v ? v.x : sim.site.x, py = v ? v.y : sim.site.y;
  const cx = Math.max(zn.x0, Math.min(zn.x1, px)), cy = Math.max(zn.y0, Math.min(zn.y1, py));          // the cell of the yard nearest the slime
  if (!anyDistance && (Math.abs(cx - px) > LOOK_R || Math.abs(cy - py) > LOOK_R || Math.abs(zn.z - v.z) > 2)) return 0;
  let food = 0, mat = 0;
  for (let x = zn.x0; x <= zn.x1; x++) for (let y = zn.y0; y <= zn.y1; y++) {
    const ids = sim.ents.at(x, y, zn.z);
    for (let i = 0; i < ids.length; i++) {
      const e = sim.ents.get(ids[i]);
      if (e && e.kind === "item") { if (ITEMS[e.item].food > 0) food += e.n * ITEMS[e.item].food; else mat += e.n; }
    }
  }
  put(b, "stock", cx, cy, zn.z, food, now, 0);
  put(b, "stock:mat", cx, cy, zn.z, mat, now, 0);
  return 2;
}
function put(b, kind, x, y, z, n, now, src) {
  for (const f of b) if (f[K] === kind) { f[X] = x; f[Y] = y; f[Z] = z; f[N] = n; f[T] = now; f[S] = src; return; }
  if (b.length >= BEL_CAP && !evict(b, now)) return;
  b.push([kind, x, y, z, n, now, src]);
}

/** The staggered look of one villager: forget the very old, read the yard if close, scan the ring round it, and drop what it can see is gone. */
export function look(sim, v) {
  const b = v.bel, now = sim.tick;
  if (b.lt === now) return;                                          // one look a tick (a failed walk looks at once, see felt())
  b.lt = now; v.lk = [v.x, v.y, v.z];                                // (the look tick is an array property, never saved; the cell it looked from is saved on the villager, so a loaded possessed slime does not look an extra time)
  for (let i = b.length - 1; i >= 0; i--) if (now - b[i][T] > FORGET) b.splice(i, 1);
  const was = b.find(f => f[K] === "stock");
  const used = readStock(sim, b, v, now, false);
  b.fk = 0; b.nw = false;
  for (const c in SAW) delete SAW[c];
  const reach = scan(sim, b, v.x, v.y, v.z, LOOK_R, LOOK_MAX - used, now, SRC.saw, v.id, true, 2, SAW);
  if (IDEA.see) for (const c in SAW) IDEA.see(sim, v, c, SAW[c]);                  // 9.33: seeing a built thing of a craft it lacks gives an idea (no new scan: the look's own cells)
  putFolk(b, v, now);
  lookPens(sim, b, v, now);
  // 9.30: its own beliefs changed materially: a new need:/danger: fact, or (while it idles) the larder reading moved a lot. The slime replans on its own (no village broadcast).
  if (b.nw && v.action) v.rp = 1;
  else if (used && v.job && (v.job.c === "leisure" || v.job.k === "leisure")) {
    const now_ = b.find(f => f[K] === "stock");
    if (now_ && (!was || Math.abs(now_[N] - was[N]) >= Math.max(2, 0.25 * was[N]))) v.rp = 1;
  }
  for (let i = b.length - 1; i >= 0; i--) {                         // 9.31: a dig notice the slime stands at, with nothing left marked round it, is done with
    const f = b[i];
    if (f[K] === "dig" && Math.abs(f[X] - v.x) <= 3 && Math.abs(f[Y] - v.y) <= 3 && !digLeft(sim, f)) b.splice(i, 1);
    else if (f[K] === "clear" && Math.abs(f[X] - v.x) <= 3 && Math.abs(f[Y] - v.y) <= 3 && !clearLeft(sim, f)) b.splice(i, 1);       // D58: a Clear area notice, the rectangle done
  }
  for (let i = b.length - 1; i >= 0; i--) {                         // the mistake is felt: a believed thing in plain view that is no longer there goes
    const f = b[i];
    if (f[T] !== now && f[K].slice(0, 5) !== "stock" && f[K] !== "folk" && f[K] !== "water" && f[K] !== "dig" && f[K] !== "clear" && f[K].slice(0, 6) !== "claim:" && !isReq(f[K]) && Math.abs(f[X] - v.x) <= reach && Math.abs(f[Y] - v.y) <= reach && Math.abs(f[Z] - (f[K] === "water" ? 1 : 0) - v.z) <= 2) b.splice(i, 1);     // (a water fact is the shore cell the slime drinks from, which may stand two above the water: the look's z band cannot confirm it, and a stream does not leave, so a water fact is never felt as a mistake and goes only by FORGET)
  }
}

/** 9.32: a possessed slime looks every time it has stepped to a new cell (the player drives it faster than the staggered look reaches), not only every LOOK_EVERY ticks. */
export const movedSinceLook = (v) => v.bel && (!v.lk || v.lk[0] !== v.x || v.lk[1] !== v.y || v.lk[2] !== v.z);
/** 9.32: a thing the possessed slime was pointed at (an interact target) is something it has seen: it goes into its own beliefs like any look would write it. */
export function noteSeen(sim, v, e) {
  if (flags.off || !v.bel || !e || e.kind === "villager") return;
  const k = kindOf(e, false, v.id, sim);
  if (k) learn(v.bel, k[0], e.x, e.y, e.z, k[1], sim.tick, SRC.saw, sim.tick);
  const cl = IDEA.crafts && IDEA.crafts(e);                                             // 9.33: a piece the player points at is looked at closely
  if (cl) for (const c of cl) IDEA.see(sim, v, c, 0);
}

// ---- who starts with what (OD-57) ----

/** A founder (or an old save's villager) knows the camp: the things within SEED_R of its centre and the yard. */
export function seedCamp(sim, v) {
  if (flags.off) { v.bel = []; return; }
  v.bel = campFacts(sim).map(f => f.slice());
}
/** The camp's shared knowledge as facts (one scan per tick, shared by everyone seeded at that tick). */
function campFacts(sim) {
  const c = sim.cache;
  if (!c.bs || c.bs.t !== sim.tick || c.bs.iv !== c.iv) {
    const b = [], s = sim.site;
    scan(sim, b, s.x, s.y, sim.world.standZ(s.x, s.y), SEED_R, BEL_CAP - 4, sim.tick, SRC.saw, 0, false, 4);
    readStock(sim, b, null, sim.tick, true);
    seedWater(sim, b);
    const n = sim.ents.ofKind("villager").length;                    // 9.30: a camp knows its own company (how many mouths there are)
    if (n > 1) b.push(["folk", s.x, s.y, sim.world.standZ(s.x, s.y), n, sim.tick, SRC.saw]);
    c.bs = { t: sim.tick, iv: c.iv, b };
  }
  return c.bs.b;
}
/** 9.32: a child grows up in the camp: whatever its parent's beliefs lack (or hold older), the camp's shared knowledge fills in (heard, so told). A parent with a thin store never leaves a child blind. */
export function shareCamp(sim, v) {
  if (flags.off || !v.bel) return;
  for (const f of campFacts(sim)) learn(v.bel, f[K], f[X], f[Y], f[Z], f[N], f[T], SRC.told, sim.tick);
}
/** Everyone who lives at the camp knows where it drinks: the nearest shore within WATER_SEED_R of the camp centre (a ring search over the terrain, once per seeding). */
const WATER_SEED_R = 64;                  // = board.js WATER_WINDOW: the farthest shore a villager drinks from at all (was 48: a camp 50 cells from the stream died of thirst, tests/clock.js)
function seedWater(sim, b) {
  const w = sim.world, s = sim.site;
  for (let r = 0; r <= WATER_SEED_R; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = s.x + dx, y = s.y + dy, z = w.standZ(x, y);
    if (z < 0) continue;
    for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (w.mat(x + ex, y + ey, z - 1) === M.WATER || w.mat(x + ex, y + ey, z - 2) === M.WATER) { b.push(["water", x, y, z, 1, sim.tick, SRC.saw]); return; }
    }
  }
}
/** A newborn starts with its parent's beliefs (heard, so told). A split clone gets them through split.js's deep copy. */
export function inheritBel(sim, kid, parent) {
  kid.bel = flags.off || !parent.bel ? [] : parent.bel.map(f => { const g = f.slice(); g[S] = Math.max(g[S], SRC.told); return g; });
}
/** Fill what an older save lacks: the founder seed (OD-57). */
export function fillBel(sim, v) { if (!v.bel) seedCamp(sim, v); }

// ---- reading it ----

/** 9.29: a walk to a believed target ended on "gone" or "empty": look right now, so the fact that sent the slime there is dropped or corrected (the wasted walk is felt). */
export function felt(sim, v) { if (!flags.off && v.bel && v.kind === "villager") look(sim, v); }

/** A digger sees ore the hole opened up: fold the cells round (x, y, z) into its beliefs (dig verb, tasks.js). */
export function learnDug(sim, v, x, y, z) {
  if (flags.off || !v.bel) return;
  scan(sim, v.bel, x, y, z, 2, LOOK_MAX, sim.tick, SRC.saw, v.id, false, 2);
}

/**
 * 9.32: the cell lookup a patch needs, shared by every slime and every plan while the entity grid is unchanged: the non-villager things standing in the 7x7x5 cells round (x, y, z),
 * in cell order (id order within a cell). Villagers move every tick and are never a patch's content (kindOf skips them), so they neither fill nor invalidate it: the cache is keyed by the grid
 * version `ents.gv` (any add, remove or move of something else). The kind test stays at the call (a plant's yield changes in place). `flags.nocache` is the test's uncached baseline.
 */
export const stats = { hit: 0, miss: 0 };
function cellsAround(ents, x, y, z) {
  const l = [];
  for (let dx = -PATCH_R; dx <= PATCH_R; dx++) for (let dy = -PATCH_R; dy <= PATCH_R; dy++) for (let dz = -2; dz <= 2; dz++) {
    const ids = ents.at(x + dx, y + dy, z + dz);
    for (let i = 0; i < ids.length; i++) { const e = ents.get(ids[i]); if (e && e.kind !== "villager") l.push(e); }
  }
  return l;
}
function patchCells(ents, x, y, z) {
  let c = ents.pc;
  if (!c || c.v !== ents.gv) c = ents.pc = { v: ents.gv, m: new Map() };
  const k = cellIdx(x, y, z);
  let l = c.m.get(k);
  if (l) { stats.hit++; return l; }
  stats.miss++;
  l = cellsAround(ents, x, y, z);
  c.m.set(k, l);
  return l;
}
/** The live things a fact's patch covers: the cell grid round its centre (the local lookup a plan may make), appended to `out` in cell order. */
export function patchEnts(sim, f, out, seen) {
  const ents = sim.ents;
  const l = flags.nocache ? cellsAround(ents, f[X], f[Y], f[Z]) : patchCells(ents, f[X], f[Y], f[Z]);
  for (let i = 0; i < l.length; i++) {
    const e = l[i];
    if (seen.has(e.id)) continue;
    const k = kindOf(e, false, 0, sim);
    if (k && k[0] === f[K]) { seen.add(e.id); out.push(e); }
  }
}

/** The nearest believed fact of a kind to (x, y), not yet forgotten, fresh ones first among equals; null when there is none. (9.29's planners ask this.) */
export function nearestFact(v, kind, x, y, now) {
  let best = null, bd = 0;
  for (const f of v.bel || []) {
    if (f[K] !== kind || now - f[T] > FORGET) continue;
    const d = Math.abs(f[X] - x) + Math.abs(f[Y] - y) + (isStale(f, now) ? 2 * LOOK_R : 0);
    if (!best || d < bd) { best = f; bd = d; }
  }
  return best;
}

/** Dev helper (console: __game.bel(id)): how many of a slime's beliefs still match the truth around them. */
export function audit(sim, v) {
  let right = 0, gone = 0;
  for (const f of v.bel || []) {
    if (f[K].slice(0, 5) === "stock" || f[K] === "folk") { right++; continue; }
    const t = [];
    scan(sim, t, f[X], f[Y], f[Z], PATCH_R, 99, 0, 0, v.id, true);
    if (t.some(g => g[K] === f[K])) right++; else gone++;
  }
  return { right, gone };
}
