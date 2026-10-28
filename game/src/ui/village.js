// Village panel: population, food runway, season, warnings with explanations,
// stock bars with keep-N standing orders (click a bar to set the target), and
// the demand vector in words (GDD §09, §22).
import { ITEMS, ITEM_KINDS, survey, stockCapacity, JAR_HOLD, JAR_X, CELLAR_X } from "../sim/items.js";
import { CROP } from "../sim/farm.js";
import { RECIPES } from "../sim/craft.js";
import { can } from "../sim/knowledge.js";
import { village, CRIT_BASE, CRIT_WINTER, KEEP_LOW } from "../sim/board.js";
import { dateOf, DAYS_PER_SEASON, DAYS_PER_YEAR, SEASON_NAMES } from "../sim/clock.js";
import { dayF, WINTER_START, winterAhead } from "../sim/season.js";
import { isElder } from "../sim/villager.js";
import { esc, bar, createPanel } from "./dom.js";
import { warnings, runwayText, itemName } from "./text.js";

const DEMAND_LABEL = { food: "more food", shelter: "more beds", rack: "a drying rack", preserve: "berries dried for winter" };

export function seasonLine(sim) {
  const t = dateOf(sim.tick), d = dayF(sim.tick), inSeason = ((t.day - 1) % DAYS_PER_SEASON) + 1;
  if (t.season === 3) return `Winter, day ${inSeason} of ${DAYS_PER_SEASON} - spring in ${Math.ceil(DAYS_PER_YEAR - d)} days. Berries have frozen off.`;
  const toWinter = Math.ceil(WINTER_START - d);
  return `${SEASON_NAMES[t.season]}, day ${inSeason} of ${DAYS_PER_SEASON} - winter in ${toWinter} days`;
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

export function createVillagePanel(parent, game) {
  const p = createPanel(parent, "village", "Village");
  p.body.innerHTML = `<div class="v-top"></div><div class="v-stock"></div><div class="keepedit" style="display:none"></div><div class="v-dem"></div>`;
  const top = p.body.querySelector(".v-top"), stock = p.body.querySelector(".v-stock"), ed = p.body.querySelector(".keepedit"), dem = p.body.querySelector(".v-dem");
  const last = { top: "", stock: "", dem: "" };
  ed.innerHTML = `<div class="edtitle"></div><div class="edrow"><button data-d="-10">-10</button><button data-d="-1">-1</button>
    <input type="number" min="0" max="${stockCapacity(game.sim)}" step="1"><button data-d="1">+1</button><button data-d="10">+10</button><button data-d="off" title="Remove the standing order">Off</button></div><div class="edhelp dim"></div>`;
  const input = ed.querySelector("input"), edTitle = ed.querySelector(".edtitle"), edHelp = ed.querySelector(".edhelp");

  const keepOf = (item) => game.sim.board.keeps.find(k => k.item === item);
  const setKeep = (item, n) => {
    n = Math.max(0, Math.min(stockCapacity(game.sim), Math.floor(Number(n) || 0)));
    if (n === 0) { if (keepOf(item)) game.sim.apply({ type: "unkeep", item }); }
    else game.sim.apply({ type: "keep", item, n });
    update();
  };
  ed.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-d]"); if (!b) return;
    const item = game.ui.editKeep, k = keepOf(item), cur = k ? k.n : 0;
    if (b.dataset.d === "off") setKeep(item, 0); else setKeep(item, cur + Number(b.dataset.d));
  });
  input.addEventListener("change", () => setKeep(game.ui.editKeep, input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { setKeep(game.ui.editKeep, input.value); input.blur(); } e.stopPropagation(); });
  stock.addEventListener("click", (e) => {
    const r = e.target.closest("[data-item]"); if (!r) return;
    if (!game.unlocked("standing")) { game.toast("Standing orders appear once the village has a stockpile."); return; }
    game.ui.editKeep = game.ui.editKeep === r.dataset.item ? null : r.dataset.item;
    update();
  });
  stock.addEventListener("mouseenter", () => { game.ui.hoverStock = true; });
  stock.addEventListener("mouseleave", () => { game.ui.hoverStock = false; });

  function update() {
    const { sim, ui } = game, b = sim.board, vl = village(sim), sv = survey(sim);
    const vs = sim.ents.ofKind("villager");
    let kids = 0, elders = 0;
    for (const v of vs) { if (isElder(sim, v)) elders++; }
    kids = vs.length - vl.adults;
    const wa = winterAhead(sim.tick), crit = CRIT_BASE + CRIT_WINTER * wa;

    let h = `<div class="kv big"><span>People</span><b>${vs.length}</b><span class="dim2">${Math.max(0, vl.adults - elders)} adults, ${elders} elders, ${kids} children</span></div>`;
    h += `<div class="seasonline">${esc(seasonLine(sim))}</div>`;
    h += `<div class="sub">Food</div>` + bar(Math.min(1, b.runway / Math.max(1, crit * 2)), {
      color: b.fc ? "#e5594f" : b.runway < crit * 1.5 ? "#e0a93b" : "#6fbf73", marks: [{ at: crit / Math.max(1, crit * 2), cls: "crit" }],
      text: `${sv.rations} rations = ${runwayText(b.runway)} per head`, title: `Counts dried berries fully and fresh ones less as winter nears. Critical below ${crit.toFixed(1)} days.`,
    });
    h += `<div class="dim">Critical below ${crit.toFixed(1)} days; the village goes foraging as soon as it is reached.</div>`;
    h += `<div class="kv"><span>Beds</span><b>${vl.beds.length} for ${vl.adults} adults${vl.sites.length ? " (+" + vl.sites.filter(s => s.what === "bed").length + " being built)" : ""}</b><span>Drying racks</span><b>${vl.racks.length}</b></div>`;
    for (const w of warnings(sim)) h += `<div class="warn l${w.level}"><b>${esc(w.title)}</b> ${esc(w.text)}</div>`;
    h += farmLines(sim, sv);
    if (h !== last.top) { last.top = h; top.innerHTML = h; }

    h = `<div class="sub">Stockpile <span class="dim">(click a bar to set a keep-N target)</span></div>`;
    for (const k of ITEM_KINDS) {
      const have = sv.stock[k], kp = keepOf(k), n = kp ? kp.n : 0;
      if (ITEMS[k].made && !have && !kp && !sv.loose[k] && !sv.carried[k] && !(RECIPES[k] && can(sim, RECIPES[k].craft))) continue;          // S7b products appear in the bars once someone knows how to make them (or one exists, or a target is set)
      const scale = Math.max(n * 1.15, have, 10);
      const marks = kp ? [{ at: n * KEEP_LOW / scale, cls: "soft" }, { at: n / scale, cls: "tgt" }] : [];
      const extra = (sv.loose[k] ? ` +${sv.loose[k]} loose` : "") + (sv.carried[k] ? ` +${sv.carried[k]} carried` : "");
      const state = kp ? (kp.on ? "refilling" : "holding") : "";
      h += `<div class="srow ${ui.editKeep === k ? "sel" : ""}" data-item="${k}"><span class="sl">${esc(itemName(k))}</span>`
        + bar(have / scale, { color: ITEMS[k].color, marks, text: `${have}${kp ? " / " + n : ""}`, title: kp ? `Keep ${n}: refills below ${Math.ceil(n * KEEP_LOW)}, stops at ${n}` : "No target. Click to set one." })
        + `<span class="ss">${esc(state)}${extra ? `<span class="dim">${esc(extra)}</span>` : ""}</span></div>`;
    }
    if (h !== last.stock) { last.stock = h; stock.innerHTML = h; }

    const item = ui.editKeep;
    ed.style.display = item ? "" : "none";
    if (item) {
      const kp = keepOf(item), n = kp ? kp.n : 0;
      edTitle.textContent = `Keep ${itemName(item)} stocked: ` + (kp ? n : "no target");
      if (document.activeElement !== input) input.value = n;
      edHelp.textContent = kp
        ? `Villagers start refilling when stock drops below ${Math.ceil(n * KEEP_LOW)} (80%) and stop at ${n}. ${kp.on ? "Refilling now." : "Holding."}`
        : "With a target, idle villagers work to keep this many in the stockpile. Cap " + stockCapacity(sim) + " (the stockpile's size).";
    }

    const want = Object.keys(b.dem).filter(k => b.dem[k] > 0).sort((a, c) => b.dem[c] - b.dem[a] || (a < c ? -1 : 1));
    h = `<div class="sub">The village wants</div><div>${want.length ? want.map(k => `${esc(DEMAND_LABEL[k] || k)} <span class="dim">(${b.dem[k].toFixed(2)})</span>`).join(", ") : '<span class="dim">nothing in particular</span>'}</div>`;
    const ks = b.keeps.filter(k => k.on);
    if (ks.length) h += `<div class="dim">Refilling: ${ks.map(k => esc(itemName(k.item)) + " to " + k.n).join(", ")}</div>`;
    if (h !== last.dem) { last.dem = h; dem.innerHTML = h; }
  }
  p.update = update;
  return p;
}
