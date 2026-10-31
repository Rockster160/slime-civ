// S10 farming: fields, plots and crops; the pen zone; the cold cellar zone; and the commands that designate them (GDD §11.17, §14.6, §15.7).
//
//   sim.farm = { n, fields:[field], pens:[pen], cellar: zone|null, sp:{t, d, sv, day}, ... } (saved + hashed; plots are entities)
//   field = {id, x0,y0,x1,y1,z, cr: "auto"|"berry"|"tuber"}                  a zone the player designates in build mode (needs CULTIVATION)
//   plot  = entity {kind:"plot", fid, x,y,z, tl (tilled 0|1), cr (crop sown, "" = none), gr (growth days), wt (watered until, tick), yl (units left to harvest), rv, rt}
//           The cell lifecycle: raw -> tilled -> sown -> growing -> ripe -> harvested (back to tilled; the seed is spent each time).
//   pen   = {id, x0,y0,x1,y1,z, g:[x,y] (the gate cell), built 0|1, got (sticks staked), need, fod (fodder in the pen), fc (fodder eaten, fraction), hg (hungry days), keep (breeding stock kept)}
//   cellar zone = {x0,y0,x1,y1,z}: an underground room (CELLAR_DEPTH or more below the surface, roofed) the village stores food in; it keeps cold (items.js spoilDaily)
//
// Crops follow the seasons (plants.js GROW_BY_SEASON): they grow in spring and summer, slowly in autumn, never in winter; unripe crops are killed by
// the first frost (a winter fallow). A watered plot grows at full speed, a dry one at a quarter.
import { DUR_DAY, DAYS_PER_YEAR } from "./clock.js";
import { M, World } from "./world.js";
import { inZone } from "./items.js";
import { can } from "./knowledge.js";
import { log, once } from "./chronicle.js";
import { dayF, seasonIdx, WINTER_START } from "./season.js";
import { GROW_BY_SEASON } from "./plants.js";
import { CAMP } from "./board.js";
import { designate, designateCells } from "./notices.js";
import { sight } from "./discovery.js";

export const CROP = { berry: { days: 7, yield: 8, label: "berry crop" }, tuber: { days: 9, yield: 6, label: "tuber crop" } };
export const DRY_GROWTH = 0.25;             // a plot nobody watered grows at a quarter speed
export const WATERED_FOR = 3 * DUR_DAY;         // one watering lasts this long
export const OVERRIPE = 6;                  // days a ripe crop stands before it is lost to the birds and the weather
export const SEED_KEEP = 2;                 // the village never sows its last two seeds (they are food)
export const MAX_FIELD = 12, MIN_PEN = 2, MAX_PEN = 8, MAX_CELLAR = 10;
export const CELLAR_DEPTH = 3;              // a cold cellar lies at least this far below the surface (GDD §14.6, §16.4)
export const PEN_CELL_CAP = 0.6;            // animals per pen cell
export const KEEP_DEFAULT = 4;
export const FOD_PER_HEAD = 0.5;            // fodder (grass) eaten per hopper per day
export const FOD_DAYS = 3;                  // villagers keep the pen stocked for this many days
export const FOD_HUNGRY = 5;                // days without fodder before a penned hopper starves

export function newFarm() { return { n: 0, fields: [], pens: [], cellar: null, sp: { t: {}, d: {}, sv: 0, day: -1 }, caught: 0 }; }
export const farmOf = (sim) => sim.farm;
export const plots = (sim) => sim.ents.ofKind("plot");
export const fieldById = (sim, id) => sim.farm.fields.find(f => f.id === id) || null;
export const penById = (sim, id) => sim.farm.pens.find(p => p.id === id) || null;
export const penCap = (p) => Math.max(2, Math.floor((p.x1 - p.x0 + 1) * (p.y1 - p.y0 + 1) * PEN_CELL_CAP));
export const penCost = (p) => (p.x1 - p.x0 + 1) + (p.y1 - p.y0 + 1);
export const penAt = (sim, x, y, z) => sim.farm.pens.find(p => p.z === z && inZone(p, x, y)) || null;

/** Latest day of the year a crop can be sown and still ripen before the frost (with a margin). */
export function sowOk(sim, cr) { return seasonIdx(sim.tick) < 3 && dayF(sim.tick) + CROP[cr].days * 1.25 <= WINTER_START; }
/** What the field's seed will be: its own crop, or (auto) the one the stockpile holds more of. */
export function seedFor(sim, field, stock) {
  if (field.cr === "berry" || field.cr === "tuber") return field.cr;
  return stock.tuber >= SEED_KEEP + 1 && stock.tuber >= stock.berry ? "tuber" : "berry";
}
/** Growth stage 0..3 of a sown plot (sprout, leafy, flowering, ripe) for the drawing and the inspector; -1 = nothing sown. */
export function cropStage(p) {
  if (!p.cr) return -1;
  const f = p.gr / CROP[p.cr].days;
  return f >= 1 ? 3 : f >= 0.66 ? 2 : f >= 0.33 ? 1 : 0;
}
export const ripe = (p) => !!p.cr && p.gr >= CROP[p.cr].days;
export const plotsOf = (sim, fid) => plots(sim).filter(p => p.fid === fid);

// ---- designation commands ---------------------------------------------------------------------------------------------------------

const rect = (c) => ({ x0: Math.min(c.x0, c.x1), y0: Math.min(c.y0, c.y1), x1: Math.max(c.x0, c.x1), y1: Math.max(c.y0, c.y1), z: c.z });
const overlaps = (a, b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
function fail(sim, why) { sim.lastBlocker = why; return false; }

export const FARM_COMMANDS = {
  /** {type:"field", x0,y0,x1,y1,z, cr?}: raw plots on every free grass cell of the rectangle (stand level z). Needs CULTIVATION. */
  field(sim, c) {
    if (!can(sim, "CULTIVATION")) return fail(sim, "UNKNOWN_CRAFT");
    const r = rect(c);
    if (r.x1 - r.x0 + 1 > MAX_FIELD || r.y1 - r.y0 + 1 > MAX_FIELD) return fail(sim, "TOO_BIG");
    const w = sim.world, f = { id: ++sim.farm.n, ...r, cr: ["berry", "tuber"].includes(c.cr) ? c.cr : "auto" };
    let n = 0;
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const m = w.mat(x, y, r.z - 1);
      if (!w.isWalkable(x, y, r.z) || (m !== M.GRASS && m !== M.DIRT) || sim.ents.at(x, y, r.z).length) continue;
      if (sim.stock.z === r.z && inZone(sim.stock, x, y)) continue;
      if (penAt(sim, x, y, r.z)) continue;
      sim.ents.add("plot", { fid: f.id, x, y, z: r.z, tl: 0, cr: "", gr: 0, wt: 0, yl: 0, rv: 0, rt: 0 }); n++;
    }
    if (!n) { sim.farm.n--; return fail(sim, "NO_SITE"); }
    sim.farm.fields.push(f);
    sim.cache.iv++; sim.board.ep++;
    designateCells(sim, "plot", plots(sim).filter(p => p.fid === f.id));          // 9.32 (OD-58): the field's plots are written on the board
    return true;
  },
  /** {type:"fieldcfg", id, cr}: which crop a field sows ("auto" picks by stock). */
  fieldcfg(sim, c) {
    const f = fieldById(sim, c.id);
    if (!f || !["auto", "berry", "tuber"].includes(c.cr)) return false;
    f.cr = c.cr; sim.board.ep++;
    return true;
  },
  /** {type:"pen", x0,y0,x1,y1,z}: a hopper pen (a fence of sticks the villagers stake out, a gate on the south side). Needs HUSBANDRY. */
  pen(sim, c) {
    if (!can(sim, "HUSBANDRY")) return fail(sim, "UNKNOWN_CRAFT");
    const r = rect(c), w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
    if (w < MIN_PEN || h < MIN_PEN || w > MAX_PEN || h > MAX_PEN) return fail(sim, "TOO_BIG");
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      if (!sim.world.isWalkable(x, y, r.z) || (sim.stock.z === r.z && inZone(sim.stock, x, y))) return fail(sim, "NO_SITE");
      for (const id of sim.ents.at(x, y, r.z)) if (sim.ents.get(id).kind === "plot") return fail(sim, "NO_SITE");
    }
    for (const p of sim.farm.pens) if (p.z === r.z && overlaps(p, r)) return fail(sim, "NO_SITE");
    const p = { id: ++sim.farm.n, ...r, g: [r.x0 + (w >> 1), r.y1], built: 0, got: 0, need: w + h, fod: 0, fc: 0, hg: 0, keep: KEEP_DEFAULT };
    sim.farm.pens.push(p);
    sim.board.ep++;
    designate(sim, "pen", p.g[0], p.g[1], p.z, 1);          // 9.31 (OD-58): the pen is written on the board
    return true;
  },
  /** {type:"pencfg", id, keep}: how many penned hoppers to keep; the surplus adults are slaughtered. */
  pencfg(sim, c) {
    const p = penById(sim, c.id);
    if (!p || !(c.keep >= 0)) return false;
    p.keep = Math.min(40, Math.floor(c.keep)); sim.board.ep++;
    return true;
  },
  /** {type:"cellar", x0,y0,x1,y1,z}: designate an underground room (dug and roofed already) as the cold store; food is carried there. */
  cellar(sim, c) {
    const r = rect(c), w = sim.world;
    if (r.x1 - r.x0 + 1 > MAX_CELLAR || r.y1 - r.y0 + 1 > MAX_CELLAR) return fail(sim, "TOO_BIG");
    if (overlaps(r, sim.stock)) return fail(sim, "NO_SITE");
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      if (!w.isWalkable(x, y, r.z) || !w.isSolid(x, y, r.z + 1) || w.topZ(x, y, 23) - r.z < CELLAR_DEPTH) return fail(sim, "NO_SITE");
    }
    // reachable from the camp: a cellar nobody can walk into would swallow the food
    const cp = CAMP(sim.stock);
    if (!sim.path.find(World.idx(cp.x, cp.y, sim.stock.z), World.idx(r.x0, r.y0, r.z)).ok) return fail(sim, "NO_PATH");
    sim.farm.cellar = r;
    sim.cache.iv++; sim.board.ep++;
    return true;
  },
  /** {type:"unzone", x0,y0,x1,y1,z}: remove fields (their plots), pens (their hoppers go wild) and the cellar designation under a rectangle. */
  unzone(sim, c) {
    const r = rect(c), f = sim.farm;
    let n = 0;
    for (const p of plots(sim).slice()) if (p.z === r.z && inZone(r, p.x, p.y)) { sim.ents.remove(p.id); n++; }
    f.fields = f.fields.filter(q => plots(sim).some(p => p.fid === q.id));          // a field with no plots left is gone
    for (const q of f.pens.slice()) if (q.z === r.z && overlaps(q, r)) {
      for (const e of sim.ents.ofKind("fauna")) if (e.pen === q.id) { e.tame = 0; e.pen = 0; e.st = "idle"; }
      f.pens.splice(f.pens.indexOf(q), 1); n++;
    }
    if (f.cellar && f.cellar.z === r.z && overlaps(f.cellar, r)) { f.cellar = null; n++; }
    if (n) { sim.cache.iv++; sim.board.ep++; }
    return n > 0;
  },
};

// ---- the daily crop tick ----------------------------------------------------------------------------------------------------------

/** Once a day: sown plots grow by the season (watered full speed, dry a quarter); ripe crops left too long are lost; the first frost kills unripe ones. */
export function farmDaily(sim) {
  const s = seasonIdx(sim.tick), frost = Math.floor(dayF(sim.tick)) === WINTER_START;
  let lost = 0, ripeN = 0;
  for (const p of plots(sim)) {
    if (!p.cr) continue;
    const full = ripe(p);
    if (full) {
      p.ov = (p.ov || 0) + 1;
      if (p.ov > OVERRIPE) { p.cr = ""; p.gr = 0; p.yl = 0; p.ov = 0; lost++; }
      else ripeN++;
      continue;
    }
    if (frost) { p.cr = ""; p.gr = 0; p.yl = 0; lost++; continue; }
    const g = GROW_BY_SEASON[s] * (p.wt > sim.tick ? 1 : DRY_GROWTH);
    p.gr = Math.round((p.gr + g) * 1000) / 1000;
    if (ripe(p)) { p.yl = CROP[p.cr].yield; p.ov = 0; }
  }
  if (lost) log(sim, "MILESTONE", frost ? "The first frost killed " + lost + " unripe crop" + (lost === 1 ? "" : "s") + ": the fields lie fallow until spring." : lost + " ripe crop" + (lost === 1 ? "" : "s") + " rotted in the field, unharvested.", [], { lost }, 1);
  if (ripeN) once(sim, "firstRipe", "MILESTONE", "The first crop ripened in the field.", [], {}, 1);
  sim.cache.iv++;
}

// ---- the sight that teaches farming (GDD §15.5.1: CULTIVATION) ----------------------------------------------------------------------

export const SPROUT_P = 0.2;                // chance that a rotted unit of seed (berry or tuber) near the camp sprouts where it lay
export const SPROUT_R = 16;                 // only rot this close to the camp is under anyone's eyes
/**
 * After the daily spoilage: rotted berries and tubers lying near the camp (the stockpile's edge, a dropped load) may take root. Whoever sees the
 * seedling come up may understand what it means (witness route to CULTIVATION; the tinker route is burying a seed at the camp, discovery.js).
 * Stops once the village knows farming - from then on it is done on purpose.
 */
export function sproutDaily(sim) {
  const list = sim.cache.sprouts || [];
  sim.cache.sprouts = null;
  if (!list.length || can(sim, "CULTIVATION")) return;
  const r = sim.rng.stream("sprout"), camp = CAMP(sim.stock), w = sim.world;
  for (const [item, n, x, y] of list) {
    if (Math.abs(x - camp.x) > SPROUT_R || Math.abs(y - camp.y) > SPROUT_R) continue;
    for (let k = 0; k < n; k++) {
      if (!r.chance(SPROUT_P)) continue;
      for (let tries = 0; tries < 8; tries++) {
        const cx = x + r.range(-3, 3), cy = y + r.range(-3, 3), cz = w.standZ(cx, cy);
        if (cz < 0 || w.mat(cx, cy, cz - 1) !== M.GRASS || sim.ents.at(cx, cy, cz).length || (sim.stock.z === cz && inZone(sim.stock, cx, cy))) continue;
        const sp = item === "berry" ? "berry" : "tuber";
        sim.ents.add("plant", { species: sp, x: cx, y: cy, z: cz, yield: 0, nx: sim.tick + (sp === "berry" ? 0 : 6 * DUR_DAY), rv: 0, rt: 0, bt: sim.tick, gr: 0 });
        sight(sim, "CULTIVATION", "sprout", cx, cy, cz, null);
        break;
      }
    }
  }
}
