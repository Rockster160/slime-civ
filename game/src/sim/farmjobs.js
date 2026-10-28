// S10 jobs for the field and the pen: derived STANDING-class work (GDD §09) that exists only because the player designated a field or a pen.
// jobs.js builds the helper bag H (its own candidate/reach/stand helpers) and passes it in, so this file does not import jobs.js (no import cycles).
//
//   field: harvest (ripe crop) > sow (a tilled plot, seed in stock) > water (a sown, dry plot) > till (a raw plot)       group "farm", at most half the adults
//   pen:   fence (stake the pen out with sticks) | fodder (grass into the trough) | slaughter (the adults over the pen's keep-N)      group "pen"
//   order: capture (catch a wild hopper alive and walk it to a finished pen)
// Each job carries its blocker (NO_MATERIAL + the item it lacks, NO_SEASON, NO_WATER, MAX_WORKERS ...) so the Why panel can say what stops it.
import { Task } from "./tasks.js";
import { can } from "./knowledge.js";
import { clamp, dist3 } from "./util.js";
import { reservedByOther } from "./jobstate.js";
import { carryRoom } from "./items.js";
import { plots, ripe, sowOk, seedFor, fieldById, SEED_KEEP, FOD_PER_HEAD, FOD_DAYS } from "./farm.js";
import { penLoad, slaughterTarget, openPen } from "./husbandry.js";
import { waterEdges } from "./board.js";
import { WATER_SIPS } from "./tasks.js";

export const FARM_SHARE = 0.5;          // at most this share of the adults work the fields at once
const SOW_TRIP = 4;                     // seeds carried per sowing trip
const HARVEST_TRIP = 3;                 // plots harvested per trip (the hands fill first)
const WATER_TRIP = 6;                   // plots watered per fetch of water

const at = (p) => ({ x: p.x, y: p.y, z: p.z });
/** The plots nearest to `first` (same field), `first` included, up to n. */
function cluster(list, first, n) {
  return list.filter(q => q.fid === first.fid).sort((a, b) => Math.abs(a.x - first.x) + Math.abs(a.y - first.y) - Math.abs(b.x - first.x) - Math.abs(b.y - first.y) || a.id - b.id).slice(0, n);
}

export function genFarm(ctx, H) {
  const { sim, v, sv, t } = ctx;
  if (!sim.farm.fields.length) return;
  const known = can(sim, "CULTIVATION"), cap = Math.max(1, Math.ceil(FARM_SHARE * ctx.vl.adults));
  const base = { cls: "standing", grp: "farm", skill: null, gather: true };
  const full = H.capped(ctx, "standing", "farm", cap);
  const free = (p) => !reservedByOther(sim, p, v.id) && !H.isBad(v, p.id, t);
  const all = plots(sim);
  const ripeP = all.filter(p => ripe(p) && p.yl > 0 && free(p));
  const tilled = all.filter(p => p.tl && !p.cr && free(p));
  const dry = all.filter(p => p.cr && !ripe(p) && p.wt <= sim.tick && free(p));
  const raw = all.filter(p => !p.tl && free(p));
  const nearest = (list) => { let b = null, bd = 1e9; for (const p of list) { const d = H.dTo(ctx, p) - (p.rv === v.id ? 1000 : 0); if (d < bd) { bd = d; b = p; } } return b; };
  const mk = (kind, first, urg, extra) => {
    const c = { ...base, kind, urg, key: kind + ":" + (first ? first.id : 0), tid: first ? first.id : 0, d: first ? H.dTo(ctx, first) : 0, ...extra };
    if (!known) c.blocker = "UNKNOWN_CRAFT";
    else if (full) c.blocker = "MAX_WORKERS";
    return c;
  };
  const done = (c) => { if (c.blocker) c.mk = () => ({ blocker: c.blocker }); H.add(ctx, c); };

  // harvest: the crop is ripe and rots if it stands (OVERRIPE days)
  const hp = nearest(ripeP);
  if (hp) {
    const c = mk("harvest", hp, 1);
    if (!c.blocker && v.carry && v.carry.item !== hp.cr) c.blocker = "NO_CAPACITY";
    else if (!c.blocker && carryRoom(v, hp.cr) <= 0) c.blocker = "NO_CAPACITY";
    if (!c.blocker) c.mk = () => {
      let room = carryRoom(v, hp.cr);
      const steps = [], res = [];
      for (const p of cluster(ripeP.filter(q => q.cr === hp.cr), hp, HARVEST_TRIP)) {
        if (room <= 0) break;
        steps.push({ v: "harvest", tid: p.id, ...at(p) }); res.push(p); room -= p.yl;
      }
      return H.reach(ctx, at(hp)) ? { task: Task("harvest", steps), res } : { blocker: "NO_PATH" };
    };
    done(c);
  }

  // sow: a tilled plot, in season, with seed to spare
  const sp = nearest(tilled);
  if (sp) {
    const field = fieldById(sim, sp.fid), seed = seedFor(sim, field, sv.stock), c = mk("sow", sp, 0.7, { short: seed });
    const holds = v.carry && v.carry.item === seed ? v.carry.n : 0, spare = Math.max(0, sv.stock[seed] - SEED_KEEP);
    if (!c.blocker && !sowOk(sim, seed)) c.blocker = "NO_SEASON";
    else if (!c.blocker && v.carry && v.carry.item !== seed) c.blocker = "NO_CAPACITY";
    else if (!c.blocker && !holds && spare < 1) c.blocker = "NO_MATERIAL";
    if (!c.blocker) c.mk = () => {
      const steps = [], n = holds || Math.min(SOW_TRIP, spare, carryRoom(v, seed));
      const targets = cluster(tilled, sp, n);
      if (!holds) {
        const stack = H.stockStack(ctx, seed);
        if (!stack || !H.reach(ctx, stack)) return { blocker: "NO_MATERIAL" };
        steps.push({ v: "take", item: seed, n: targets.length, ...stack });
      }
      for (const p of targets) steps.push({ v: "sow", tid: p.id, item: seed, ...at(p) });
      return H.reach(ctx, at(sp)) ? { task: Task("sow", steps), res: targets } : { blocker: "NO_PATH" };
    };
    done(c);
  }

  // water: a sown plot that has gone dry
  const wp = nearest(dry);
  if (wp) {
    const c = mk("water_field", wp, clamp(dry.length / Math.max(1, all.length) + 0.3, 0, 1));
    if (!c.blocker && waterEdges(sim).length === 0) c.blocker = "NO_WATER";
    if (!c.blocker) c.mk = () => {
      let best = null, bd = 1e9;
      for (const e of waterEdges(sim)) { const d = Math.abs(e[0] - wp.x) + Math.abs(e[1] - wp.y); if (d < bd && !H.isBad(v, e[0] * 1000 + e[1], t)) { bd = d; best = e; } }
      if (!best) return { blocker: "NO_WATER" };
      const st = { x: best[0], y: best[1], z: best[2] };
      if (!H.reach(ctx, st)) { v.bad.push([best[0] * 1000 + best[1], t + 600]); return { blocker: "NO_WATER" }; }
      const targets = cluster(dry, wp, Math.min(WATER_TRIP, Math.floor(24 / WATER_SIPS)));
      const steps = [{ v: "fill", ...st }, ...targets.map(p => ({ v: "water", tid: p.id, ...at(p) }))];
      return { task: Task("water_field", steps), res: targets };
    };
    done(c);
  }

  // till: raw ground (any season but the dead of winter: a tilled plot waits for spring)
  const tp = nearest(raw);
  if (tp) {
    const c = mk("till", tp, 0.4);
    if (!c.blocker) c.mk = () => {
      const targets = cluster(raw, tp, 3);
      return H.reach(ctx, at(tp)) ? { task: Task("till", targets.map(p => ({ v: "till", tid: p.id, ...at(p) }))), res: targets } : { blocker: "NO_PATH" };
    };
    done(c);
  }
}

/** Pens: stake the fence, keep the trough stocked, slaughter the surplus. */
export function genPens(ctx, H) {
  const { sim, v, sv, t } = ctx;
  if (!sim.farm.pens.length) return;
  const known = can(sim, "HUSBANDRY");
  for (const pen of sim.farm.pens) {
    const gate = { x: pen.g[0], y: pen.g[1], z: pen.z };
    if (!pen.built) {
      const need = pen.need - pen.got, base = { cls: "standing", urg: 0.5, grp: "pen", skill: null };
      const c = { ...base, kind: "fence", key: "fence:" + pen.id, tid: 0, d: dist3(v.x, v.y, v.z, gate.x, gate.y, gate.z) };
      const holds = v.carry && v.carry.item === "stick" ? v.carry.n : 0;
      if (!known) c.blocker = "UNKNOWN_CRAFT";
      else if (H.capped(ctx, "standing", "pen", 2)) c.blocker = "MAX_WORKERS";
      else if (v.carry && !holds) c.blocker = "NO_CAPACITY";
      else if (!holds && sv.stock.stick < 1) { c.blocker = "NO_MATERIAL"; c.short = "stick"; }
      if (c.blocker) c.mk = () => ({ blocker: c.blocker });
      else c.mk = () => {
        const steps = [], n = holds || Math.min(need, sv.stock.stick, carryRoom(v, "stick"));
        if (!holds) {
          const stack = H.stockStack(ctx, "stick");
          if (!stack || !H.reach(ctx, stack)) return { blocker: "NO_MATERIAL" };
          steps.push({ v: "take", item: "stick", n, ...stack });
        }
        if (!H.reach(ctx, gate)) return { blocker: "NO_PATH" };
        steps.push({ v: "stake", pid: pen.id, ...gate });
        return { task: Task("fence", steps), res: [] };
      };
      H.add(ctx, c);
      if (c.blocker === "NO_MATERIAL") {                                  // the usual derived work: haul loose sticks, else cut some
        if (sv.loose.stick > 0) H.looseCand(ctx, base, "stick", false);
        if (sv.stock.stick + sv.loose.stick + sv.carried.stick < need) H.chopCand(ctx, base, false);
      }
      continue;
    }
    const load = penLoad(sim, pen);
    if (load) {                                                            // fodder (a grazer eats as much as three hoppers)
      const want = Math.ceil(load * FOD_PER_HEAD * FOD_DAYS), lack = want - pen.fod;
      if (lack > 0) {
        const base = { cls: "standing", urg: clamp(lack / Math.max(1, want), 0, 1), grp: "pen", skill: null, gather: true };
        const c = { ...base, kind: "fodder", key: "fodder:" + pen.id, tid: 0, d: dist3(v.x, v.y, v.z, gate.x, gate.y, gate.z) };
        const holds = v.carry && v.carry.item === "grass" ? v.carry.n : 0;
        if (H.capped(ctx, "standing", "pen", 2)) c.blocker = "MAX_WORKERS";
        else if (v.carry && !holds) c.blocker = "NO_CAPACITY";
        else if (!holds && sv.stock.grass < 1) { c.blocker = "NO_MATERIAL"; c.short = "grass"; }
        if (c.blocker) c.mk = () => ({ blocker: c.blocker });
        else c.mk = () => {
          const steps = [];
          if (!holds) {
            const stack = H.stockStack(ctx, "grass");
            if (!stack || !H.reach(ctx, stack)) return { blocker: "NO_MATERIAL" };
            steps.push({ v: "take", item: "grass", n: Math.min(lack, sv.stock.grass, carryRoom(v, "grass")), ...stack });
          }
          if (!H.reach(ctx, gate)) return { blocker: "NO_PATH" };
          steps.push({ v: "fodder", pid: pen.id, ...gate });
          return { task: Task("fodder", steps), res: [] };
        };
        H.add(ctx, c);
        if (c.blocker === "NO_MATERIAL") {
          if (sv.loose.grass > 0) H.looseCand(ctx, base, "grass", false);
          if (sv.stock.grass + sv.loose.grass + sv.carried.grass < lack) H.gatherCand(ctx, base, false);
        }
      }
    }
    const tgt = slaughterTarget(sim, pen);                                  // slaughter: the adults over the keep-N
    if (tgt) {
      const c = { cls: "standing", urg: 0.5, grp: "pen", skill: null, kind: "slaughter", key: "slaughter:" + tgt.id, tid: tgt.id, d: H.dTo(ctx, tgt) };
      if (H.isBad(v, tgt.id, t)) continue;
      if (H.capped(ctx, "standing", "pen", 2)) c.blocker = "MAX_WORKERS";
      else if (!known) c.blocker = "UNKNOWN_CRAFT";
      if (c.blocker) c.mk = () => ({ blocker: c.blocker });
      else c.mk = () => {
        const st = H.standAdj(ctx, tgt);
        return st && H.reach(ctx, st) ? { task: Task("slaughter", [{ v: "slaughter", tid: tgt.id, ...st }]), res: [tgt] } : { blocker: "NO_PATH" };
      };
      H.add(ctx, c);
    }
  }
}

/** The capture order's job for one wild hopper: catch it, walk it to the nearest finished pen with room, let it go inside. */
export function captureMk(ctx, H, e) {
  return () => {
    const pen = openPen(ctx.sim, e.x, e.y, e.sp);
    if (!pen) return { blocker: "NO_PEN" };
    const st = H.standAdj(ctx, e), gate = { x: pen.g[0], y: pen.g[1], z: pen.z };
    if (!st || !H.reach(ctx, st) || !H.reach(ctx, gate)) return { blocker: "NO_PATH" };
    return { task: Task("capture", [{ v: "catch", tid: e.id, ...st }, { v: "release", pid: pen.id, ...gate }]), res: [e] };
  };
}
