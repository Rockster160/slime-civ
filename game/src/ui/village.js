// Village text helpers (the panel itself is ui/village_hud.js since S19a): the season sentence and the spoilage / farm lines (GDD §09, §22). Pure functions of sim state.
import { ITEMS, ITEM_KINDS, survey, stockCapacity, JAR_HOLD, JAR_X, CELLAR_X } from "../sim/items.js";
import { CROP } from "../sim/farm.js";
import { RECIPES } from "../sim/craft.js";
import { can } from "../sim/knowledge.js";
import { village, CRIT_BASE, CRIT_WINTER, KEEP_LOW } from "../sim/board.js";
import { dateOf, DAYS_PER_SEASON, DAYS_PER_YEAR, SEASON_NAMES, DAY, TICKS_PER_SEC } from "../sim/clock.js";
import { dayF, WINTER_START, winterAhead } from "../sim/season.js";
import { isElder } from "../sim/villager.js";
import { esc } from "./dom.js";
import { warnings, runwayText, itemName } from "./text.js";

const DEMAND_LABEL = { food: "more food", shelter: "more beds", rack: "a drying rack", preserve: "berries dried for winter" };

/** Real minutes in one game day at 1x: always read from the clock constants (the day length changes). */
export const dayMinutes = () => DAY / TICKS_PER_SEC / 60;
export function seasonLine(sim) {
  const t = dateOf(sim.tick), d = dayF(sim.tick), inSeason = ((t.day - 1) % DAYS_PER_SEASON) + 1;
  if (t.season === 3) return `Winter, day ${inSeason} of ${DAYS_PER_SEASON} - spring in ${Math.ceil(DAYS_PER_YEAR - d)} days. Berries have frozen off. (A day is ${dayMinutes()} minutes at 1x.)`;
  const toWinter = Math.ceil(WINTER_START - d);
  return `${SEASON_NAMES[t.season]}, day ${inSeason} of ${DAYS_PER_SEASON} - winter in ${toWinter} days (about ${Math.round(toWinter * dayMinutes())} min at 1x)`;
}

/** S10: the fields, the pens, and the food the stores lost to spoilage (what jars and the cellar kept is shown beside it). Plain text lines. */
export function spoilText(sim) {
  const sp = sim.farm.sp, day = Object.keys(sp.d).filter(k => sp.d[k] > 0).map(k => sp.d[k] + " " + itemName(k)), tot = Object.keys(sp.t).reduce((a, k) => a + sp.t[k], 0);
  if (!tot) return "";
  return "Spoiled in the last day: " + (day.length ? day.join(", ") : "nothing") + ". Lost to rot so far: " + tot + (sp.sv >= 1 ? ". Jars and the cold cellar have kept about " + Math.round(sp.sv) + " units from rotting." : ".");
}
function farmLines(sim, sv) {
  const f = sim.farm, pl = sim.ents.ofKind("plot");
  let h = "";
  if (pl.length) {
    const sown = pl.filter(p => p.cr).length, ripeN = pl.filter(p => p.cr && p.gr >= CROP[p.cr].days).length;
    h += `<div class="kv"><span>Fields</span><b>${pl.length} plots: ${pl.filter(p => !p.tl).length} raw, ${pl.filter(p => p.tl && !p.cr).length} tilled, ${sown} sown${ripeN ? ", " + ripeN + " ripe" : ""}</b></div>`;
  }
  if (f.pens.length) {
    const hs = sim.ents.ofKind("fauna").filter(e => e.tame);
    h += `<div class="kv"><span>Pens</span><b>${f.pens.length} (${f.pens.filter(p => p.built).length} fenced), ${hs.length} penned hopper${hs.length === 1 ? "" : "s"}</b></div>`;
  }
  if (f.cellar) h += `<div class="kv"><span>Cold cellar</span><b>food is stored there (${(f.cellar.x1 - f.cellar.x0 + 1) * (f.cellar.y1 - f.cellar.y0 + 1)} cells), spoiling at ${Math.round(CELLAR_X * 100)}% of the open rate</b></div>`;
  const st = spoilText(sim);
  if (st) h += `<div class="dim">${esc(st)}</div>`;
  if (sv.stock.jar) h += `<div class="dim">${sv.stock.jar} clay jar${sv.stock.jar === 1 ? "" : "s"} in the stores seal ${sv.stock.jar * JAR_HOLD} units of food at ${Math.round(JAR_X * 100)}% of the rot.</div>`;
  return h;
}

