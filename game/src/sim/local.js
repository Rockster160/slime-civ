// Local demand and claims (Phase 9, 9.30; notes/impl/PHASE9_KNOWLEDGE.md): what ONE slime thinks the village needs, and how many hands it can SEE on a job.
//
//   demandOf(ctx)     {food, preserve, shelter, rack, fc, sc, uvf, uvs, missing, heads, reading}: the old board vector (board.js `dem`/`fc`/`sc`) computed from this slime's own
//                     beliefs: its larder reading (`stock`), `need:food` / `need:warm` / `need:bed` facts, the beds and racks it believes in, and the head-count it can form
//                     (`folk`: slimes it has had in view, beds it knows, the people it saw with no bed). A slime that has not read the larder and has seen nobody in need
//                     rates every demand at 0. board.js keeps its own truth values for the HUD only; no planner reads them (entities.js guardBoard catches it).
//   seenWorkers(ctx)  {"cls:grp": n}: the other slimes with a job within sight (LOOK_R) of this one. `capped()` in jobs.js compares it with a cap. Two slimes that cannot
//                     see each other may both go; the second finds the target taken on arrival (tasks.js RESERVED) and moves on.
//   claimsOf(ctx, k)  the board's claims on a job group: EMPTY SEAM until 9.31 (job board notices with a claim and an expiry).
//   foodCap / bedCap  the caps that replaced "share of the village" worker limits.
// With belief.flags.off every one of them returns the old telepathic value (the board's own numbers, the global worker tally).
import { flags, LOOK_R, STALE } from "./belief.js";
import { entsOf } from "./know.js";
import { dailyNeed } from "./villager.js";
import { winterAhead, coldAhead, forecastMin } from "./season.js";
import { clamp } from "./util.js";
import { CRIT_BASE, CRIT_WINTER, COLD_SHELTER, MISS_SCALE, village } from "./board.js";

export const HEADS_MIN = 1;           // the fewest mouths a slime reckons with: itself (anything more it has to have seen or been told)
export const NEED_FRESH = 3000;       // ticks: a hungry / cold / bedless neighbour seen this recently still counts (a flat constant)
export const FOOD_SHARE = 0.6;        // the shares of the slimes IT KNOWS OF (`heads`, not the village's adults) it tolerates at work in view: foraging at full demand,
export const HAND_SHARE = 0.7;        //   building / mining,
export const FARM_SHARE = 0.5;        //   the fields,
export const KEEP_SHARE = 0.2;        //   non-food standing orders while it believes food, beds or racks are short (the old KEEP_FOOD_SHARE)
export const CRIT_SHARE = 0.75;       //   foraging while it believes the larder is critical
export const BED_NONE = 0.15;         // 10.1: the breeding weight of a pair that knows of no free bed AND has seen a bedless neighbour lately (a child would join the queue). A pair that sees everyone housed keeps the old 0.4 / 1
export const WINTER_BANK = 42;        // 10.1: days of food per head a slime wants banked as winter arrives (target = 3 + WINTER_BANK * winterAhead). Was 22: a village that banked 20-30 days drained to nothing in a 25-day winter and its last days were spent foraging in the cold
export const FOOD_PUSH = 1.6;         // 10.1: how hard a slime's own food shortfall pulls it to forage: demand = FOOD_PUSH * (target - reading) / target, capped at 1. Winter forage is poor, so autumn has to bank the winter's food while it can (was 1: peaked at 20 days, ran dry in the 25-day winter)
export const GRID_FROM = 300;         // villagers: above this the worker count walks the cells in sight instead of the list
const r2 = (x) => Math.round(x * 100) / 100;

/** This slime's own demand vector. Cached on the plan's context. */
export function demandOf(ctx) {
  if (ctx.dm) return ctx.dm;
  const { sim, v } = ctx;
  if (flags.off || !v.bel) {                                      // the telepathic baseline: the board's village-wide numbers
    const b = sim.board;
    return (ctx.dm = { food: b.dem.food, preserve: b.dem.preserve, shelter: b.dem.shelter, rack: b.dem.rack, fc: b.fc, sc: b.sc, uvf: b.uvf, uvs: b.uvs, fneed: b.fneed, sneed: b.sneed, missing: b.sneed, heads: Math.max(1, ctx.vl ? ctx.vl.adults : 1), reading: true, off: true });
  }
  const now = sim.tick;
  let stock = null, nf = 0, nw = 0, nb = 0, folk = 0;
  for (const f of v.bel) {
    const k = f[0], age = now - f[5];
    if (k === "stock") { if (age <= STALE) stock = f[4]; }
    else if (k === "need:food") { if (age <= NEED_FRESH) nf += f[4]; }
    else if (k === "need:warm") { if (age <= NEED_FRESH) nw += f[4]; }
    else if (k === "need:bed") { if (age <= NEED_FRESH) nb += f[4]; }
    else if (k === "folk") { if (age <= STALE) folk = f[4]; }
  }
  const beds = entsOf(ctx, "bed"), racks = entsOf(ctx, "furn:rack");
  let free = 0, pendBeds = 0, pendRacks = 0;
  for (const b of beds) if (!b.owner) free++;
  for (const e of entsOf(ctx, "site")) {                          // a bed or rack on its way (a site, or a player's ghost) that this slime knows of counts as coming
    if (e.rv === v.id) continue;                                  // its OWN site is the work the demand is for: counting it would switch the demand off under its own hands
    const w = e.kind === "site" ? e.what : e.kind === "csite" ? e.w : "";
    if (w === "bed") pendBeds++; else if (w === "rack") pendRacks++;
  }
  const heads = Math.max(HEADS_MIN, beds.length + nb, folk);
  const wa = winterAhead(now), need = Math.max(0.01, heads * dailyNeed(sim, v));
  let food = 0, preserve = 0, fc = 0, uvf = 0, rack = 0, short = 0;
  if (stock !== null) {                                           // it has read the larder: the same formulas as board.js, fed from the reading and its head-count
    const eff = stock / need, critT = CRIT_BASE + CRIT_WINTER * wa, target = 3 + WINTER_BANK * wa;
    food = r2(clamp(FOOD_PUSH * (target - eff) / target, 0, 1));
    short = Math.max(0, Math.ceil(target * need - stock));       // 9.31: the rations short of the season's target (what a board request for food says)
    fc = eff < critT ? 1 : 0;
    uvf = r2(clamp((critT - eff) / (0.75 * critT), 0, 1));
    if (racks.length && stock >= 5) preserve = r2(clamp(stock / (1.5 * need), 0, 1));
    if (racks.length + pendRacks < Math.max(1, Math.ceil(heads / 4))) rack = r2(clamp(0.3 + 0.7 * wa, 0, 1));
  }
  if (nf > 0) food = Math.max(food, 0.6);                         // a hungry neighbour in view is a food shortage, whatever the larder said
  const missing = Math.max(0, nb + (v.bed ? 0 : 1) - free - pendBeds);
  const cold = forecastMin(now) < COLD_SHELTER || wa >= 0.6 || nw > 0;
  const sc = cold && missing > 0 ? 1 : 0;
  const shelter = r2(clamp(missing / MISS_SCALE * (1 + coldAhead(now)), 0, 1));
  const eff = stock !== null ? stock / need : null;
  return (ctx.dm = { food, preserve, shelter, rack, fc, sc, uvf, uvs: r2(clamp(missing / MISS_SCALE, 0, 1)), missing, heads, reading: stock !== null, eff, short, free, nf, nw, nb });
}
/**
 * 9.30: the breeding weights of one pair (population.js), from what THE PAIR knows: the larder reading either of them holds (days of food per head, against what the season
 * asks: 6 now, ~25 as winter nears) and whether they have a bed (their own, or a free one they believe in). Replaces the village runway and beds per head.
 * Returns {food, bed}; with the store off the old village-wide numbers.
 */
export function pairWeights(sim, a, b) {
  const wa = winterAhead(sim.tick);
  if (flags.off || !a.bel || !b.bel) {
    const vl = village(sim), n = Math.max(1, vl.n);
    return { food: clamp(sim.board.runway / (6 + WINTER_BANK * wa), 0.05, 1), bed: 0.4 + 0.6 * clamp(vl.beds.length / n, 0, 1) };
  }
  const da = demandOf({ sim, v: a }), db = demandOf({ sim, v: b });
  const eff = da.eff !== null && db.eff !== null ? Math.max(da.eff, db.eff) : da.eff !== null ? da.eff : db.eff;
  const ratio = eff !== null ? eff / (6 + WINTER_BANK * wa) : (a.hunger + b.hunger) / 2, food = Math.min(1, ratio) * Math.min(1, ratio) ** (eff !== null ? 1 : 0);       // 10.1: squared once it has read the larder: a pair far from the winter's bank holds back                // never read the larder: how fed they feel themselves
  const room = da.free > 0 || db.free > 0;                      // a free (unowned) bed one of them believes in: room for a child
  const queue = da.nb > 0 || db.nb > 0;                         // a bedless neighbour either has seen lately (need:bed)
  return { food: clamp(food, 0.05, 1), bed: room ? 1 : queue ? BED_NONE : 0.4 + 0.6 * (a.bed || b.bed ? 1 : 0) };
}
/** The most hands of a job group it tolerates in view: a share of the slimes it knows of (at least one). With the store off `heads` is the village's adults, as it was. */
export const shareCap = (dm, share) => Math.max(1, Math.ceil(share * dm.heads));
/** Foragers it tolerates in view at this food demand (0..1). */
export const foodCap = (dm, urg) => Math.max(1, Math.ceil(urg * Math.max(1, FOOD_SHARE * dm.heads)));
/** Bed builders it tolerates in view: as many as the beds it can see are missing, two to six. */
export const bedCap = (dm) => clamp(dm.missing, 2, 6);
/** Is the village (as this slime sees it) short of food, beds or racks? Then the non-essential groups hold back. */
export const pressed = (dm) => dm.food > 0 || dm.shelter > 0 || dm.rack > 0;

/** The other slimes at work within sight of this one, by "class:group" (9.30: replaces the global worker tally `ctx.w`). */
export function seenWorkers(ctx) {
  if (ctx.sw) return ctx.sw;
  const { sim, v } = ctx, ents = sim.ents, out = {};
  const count = (o) => {
    if (!o || o === v || o.kind !== "villager" || !o.job || !o.action) return;
    const a = o.job.c + ":" + o.job.g;
    out[a] = (out[a] || 0) + 1;
  };
  const vs = ents.ofKind("villager");
  if (vs.length <= GRID_FROM) {                                    // a small crowd: test each slime's distance (cheaper than 800 cell lookups; the same set)
    for (let i = 0; i < vs.length; i++) { const o = vs[i]; if (Math.abs(o.x - v.x) <= LOOK_R && Math.abs(o.y - v.y) <= LOOK_R && Math.abs(o.z - v.z) <= 2) count(o); }
  } else {                                                         // a large one: the cells within sight, whatever the population
    for (let dx = -LOOK_R; dx <= LOOK_R; dx++) for (let dy = -LOOK_R; dy <= LOOK_R; dy++) for (let z = v.z - 2; z <= v.z + 2; z++) {
      const ids = ents.at(v.x + dx, v.y + dy, z);
      for (let i = 0; i < ids.length; i++) count(ents.get(ids[i]));
    }
  }
  return (ctx.sw = out);
}
/**
 * 9.31: the slimes the board said have claimed this job group ("cls:grp"), as THIS slime read it: `claim:<cls>:<grp>#<by>` facts (src 2) not older than CLAIM_EXPIRY, not its own.
 * A claimant that passed the board (took its materials in the yard) wrote the claim; a slime that has not been to the board lately knows of none. Nothing global.
 */
export const CLAIM_EXPIRY = 1800;       // ticks a claim holds without being renewed (a flat constant): a claimant that died or wandered off frees the work
export function claimsOf(ctx, key) {
  const b = ctx.v.bel;
  if (flags.off || !b) return 0;
  const pre = "claim:" + key + "#", now = ctx.sim.tick;
  let n = 0;
  for (let i = 0; i < b.length; i++) if (b[i][0].startsWith(pre) && now - b[i][5] <= CLAIM_EXPIRY && Number(b[i][0].slice(pre.length)) !== ctx.v.id) n++;
  return n;
}
/** The worker tally a planner compares caps with: what is in view (the global tally with the store off). */
export const tally = (ctx) => (flags.off ? ctx.w : seenWorkers(ctx));
/** How many hands a slime counts on a job group: the ones in view plus the board's claims. */
export function handsOn(ctx, key) { return (tally(ctx)[key] || 0) + claimsOf(ctx, key); }
