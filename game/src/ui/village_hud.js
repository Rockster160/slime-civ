// The Village HUD (UI_SPEC §3.3, step a4): population pips, the season ribbon, the food runway, concern chips, bed / rack / field / pen rows, demand chips,
// and two tabs, Stores (a grid of stock tiles with a keep-N stepper) and Crews. It replaces the old Village, Concerns and (as a tab) Crews panels and the advisory cards.
// Every sentence the old panels printed is still produced by the same helpers (ui/text.js, concerns(), seasonLine()); here it sits in a tooltip and in a visually
// hidden `.sr` copy, so the resting HUD shows shapes and numbers only.
import { ITEMS, ITEM_KINDS, survey, stockCapacity } from "../sim/items.js";
import { CROP } from "../sim/farm.js";
import { RECIPES } from "../sim/craft.js";
import { can } from "../sim/knowledge.js";
import { village, CRIT_BASE, CRIT_WINTER, KEEP_LOW } from "../sim/board.js";
import { dateOf, DAYS_PER_SEASON, DAYS_PER_YEAR, SEASON_NAMES } from "../sim/clock.js";
import { dayF, WINTER_START, winterAhead } from "../sim/season.js";
import { isElder } from "../sim/villager.js";
import { createPanel, esc, morph } from "./dom.js";
import { warnings, runwayText, itemName } from "./text.js";
import { seasonLine, spoilText } from "./village.js";
import { concerns, stableOrder, CONCERN_DO } from "./concerns.js";
import { advise, dismiss, newAdvisor } from "./advisory.js";
import { svg } from "./icons.js";
import { pip, tipAttr, sr } from "./kit.js";
import { item as paintItem } from "../render/sprites.js";
import { createCrewsPanel } from "./crews.js";

export const LABEL = { food: "Food", cold: "Cold", illness: "Illness", danger: "Danger", underground: "Underground", crew: "Crew", knowledge: "Knowledge", spoilage: "Spoilage", hunting: "Hunting", idle: "Idle" };
const DEMAND_LABEL = { food: "more food", shelter: "more beds", rack: "a drying rack", preserve: "berries dried for winter" };
const DEMAND_ICON = { food: "food", shelter: "bed", rack: "rack", preserve: "spoilage" };
const TOOL_CAP = { bed: "Bed", hearth: "Fire", field: "Field", rack: "Rack", cellar: "Cellar" };
const TOOL_TIP = { bed: "Plan a bed", hearth: "Build a fire ring", field: "Mark a field", rack: "Build a drying rack", cellar: "Dig a cold cellar" };

export function createVillageHud(parent, game) {
  const p = createPanel(parent, "village", "Village", { icon: "people" });
  p.body.innerHTML = `<div class="v-top"></div><div class="tabs"><button data-tab="stores" data-test="stores-tab" class="on">${svg("stockpile", 14)}Stores</button><button data-tab="crews" data-test="crews-tab">${svg("crew", 14)}Crews</button></div>`
    + `<div class="tab tab-stores"><div class="stepper" data-test="keep" style="display:none"><div class="edtitle"><canvas width="32" height="32" style="width:24px;height:24px"></canvas><span class="et"></span><span class="sr ehelp"></span></div>`
    + `<div class="edrow"><button data-d="-10" data-test="keep-step">-10</button><button data-d="-1" data-test="keep-step">-1</button><input type="number" min="0" step="1" data-test="keep-input"><button data-d="1" data-test="keep-step">+1</button><button data-d="10" data-test="keep-step">+10</button><button data-d="off" data-test="keep-off" data-tip="Remove the standing order">${svg("close", 14)}</button></div></div><div class="stock" data-test="stock"></div><div class="v-dem dem"></div></div>`
    + `<div class="tab tab-crews" style="display:none"></div>`;
  const top = p.body.querySelector(".v-top"), stockEl = p.body.querySelector(".stock"), ed = p.body.querySelector(".stepper"), dem = p.body.querySelector(".v-dem"), tabs = p.body.querySelector(".tabs");
  const crews = createCrewsPanel(p.body.querySelector(".tab-crews"), game, { flat: true });
  stockEl.after(ed);                                 // 6.20: the keep-N editor sits BELOW the tiles, so clicking a tile never moves the tiles
  const input = ed.querySelector("input"), etitle = ed.querySelector(".et"), ehelp = ed.querySelector(".ehelp"), ecv = ed.querySelector("canvas");
  let tab = "stores"; const last = { top: "", dem: "", order: "", ed: "" };
  const tiles = new Map();

  const keepOf = (k) => game.sim.board.keeps.find(q => q.item === k);
  const setKeep = (item, n) => {
    n = Math.max(0, Math.min(stockCapacity(game.sim), Math.floor(Number(n) || 0)));
    if (n === 0) { if (keepOf(item)) game.sim.apply({ type: "unkeep", item }); } else game.sim.apply({ type: "keep", item, n });
    update();
  };
  ed.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-d]"); if (!b) return;
    const item = game.ui.editKeep, k = keepOf(item), cur = k ? k.n : 0;
    if (b.dataset.d === "off") setKeep(item, 0); else setKeep(item, cur + Number(b.dataset.d));
  });
  input.addEventListener("change", () => setKeep(game.ui.editKeep, input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { setKeep(game.ui.editKeep, input.value); input.blur(); } e.stopPropagation(); });
  stockEl.addEventListener("click", (e) => {
    const r = e.target.closest("[data-item]"); if (!r) return;
    if (!game.unlocked("standing")) { game.toast("Standing orders appear once the village has a stockpile."); return; }
    game.ui.editKeep = game.ui.editKeep === r.dataset.item ? null : r.dataset.item;
    update();
  });
  stockEl.addEventListener("mouseenter", () => { game.ui.hoverStock = true; });
  stockEl.addEventListener("mouseleave", () => { game.ui.hoverStock = false; });
  tabs.addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { tab = b.dataset.tab; update(); } });

  // concern chips, the "do this" chips and the demand chips are plain buttons in the top block
  top.addEventListener("click", (e) => {
    const c = e.target.closest("[data-loc]");
    if (c) { const cn = game.ui.concerns && game.ui.concerns[Number(c.dataset.loc)]; if (cn) { if (cn.loc) game.locate(cn.loc); if (game.ui.advisor) dismiss(game.ui.advisor, cn.k); } return; }
    const t = e.target.closest("[data-tool]");
    if (t) { game.setMode("build"); game.ui.build.tool = t.dataset.tool; }
  });
  game.locate = (loc) => {
    if (!loc) return;
    game.viewAt(loc.x, loc.y, loc.z);
    if (loc.id && game.sim.ents.get(loc.id)) game.selectOnly(loc.id);
  };

  function tileFor(k) {
    let t = tiles.get(k);
    if (t) return t;
    const el = document.createElement("div");
    el.className = "tile"; el.dataset.test = "stock-tile"; el.dataset.item = k;
    el.innerHTML = `<canvas width="32" height="32"></canvas><span class="n"></span><span class="nm"></span><span class="ex"></span><span class="bd"></span><span class="mt"></span><span class="sr"></span>`;
    paintItem(el.querySelector("canvas").getContext("2d"), k, { n: 2 });
    t = { el, n: el.querySelector(".n"), nm: el.querySelector(".nm"), ex: el.querySelector(".ex"), bd: el.querySelector(".bd"), mt: el.querySelector(".mt"), sr: el.querySelector(".sr"), s: "" };
    tiles.set(k, t);
    return t;
  }

  function update() {
    const { sim, ui } = game, b = sim.board, vl = village(sim), sv = survey(sim), vs = sim.ents.ofKind("villager");
    p.show(true);
    const un = !!game.unlocked("crews") && (sim.crews.list.length > 0 || ui.sel.length > 0);
    tabs.querySelector('[data-tab="crews"]').style.display = un ? "" : "none";
    if (!un && tab === "crews") tab = "stores";
    tabs.querySelectorAll("[data-tab]").forEach(x => x.classList.toggle("on", x.dataset.tab === tab));
    p.body.querySelector(".tab-stores").style.display = tab === "stores" ? "" : "none";
    p.body.querySelector(".tab-crews").style.display = tab === "crews" ? "" : "none";

    let elders = 0;
    for (const v of vs) if (isElder(sim, v)) elders++;
    const kids = vs.length - vl.adults, adults = Math.max(0, vl.adults - elders);
    const wa = winterAhead(sim.tick), crit = CRIT_BASE + CRIT_WINTER * wa, d = dayF(sim.tick), t = dateOf(sim.tick);
    // population: a number, then one pip per villager grouped by life stage
    let h = `<div class="vh-pop"><div class="vh-count"${tipAttr(`${vs.length} villagers\n${adults} adults, ${elders} elders, ${kids} children`)}>${svg("people", 18)}<b data-test="pop">${vs.length}</b><span class="cap">${vs.length === 1 ? "slime" : "slimes"}</span></div>`
      + `<div class="pips"${tipAttr(`Adults ${adults}\nElders ${elders}\nChildren ${Math.max(0, kids)}`)}>${vs.length > 12 ? `<span class="more-l">${adults} adult${elders ? " · " + elders + " elder" : ""}${kids > 0 ? " · " + kids + " kid" : ""}</span>` : "<i></i>".repeat(adults) + '<i class="e"></i>'.repeat(elders) + '<i class="k"></i>'.repeat(Math.max(0, kids))}</div></div>`;
    // season ribbon: the year in four segments, the day marker; winter hatched. A two-word caption row names it (6.19c)
    const toWinter = t.season === 3 ? 0 : Math.max(0, WINTER_START - d), run = b.runway >= 99 ? 99 : b.runway;
    const nextS = SEASON_NAMES[(t.season + 1) % 4], toNext = Math.max(1, Math.ceil(t.season === 3 ? DAYS_PER_YEAR - d : (t.season + 1) * DAYS_PER_SEASON - d));
    h += `<div class="bcap" data-test="season-cap"><span>${SEASON_NAMES[t.season]}</span><b>${t.season === 3 ? nextS + " in " + toNext + "d" : "Winter in " + Math.ceil(toWinter) + "d"}</b></div>`;
    h += `<div class="ribbon" data-test="ribbon"${tipAttr(seasonLine(sim).replace(/ - /g, "\n"))}><i class="s0"></i><i class="s1"></i><i class="s2"></i><i class="s3"></i><span class="now" style="left:${((d / DAYS_PER_YEAR) * 100).toFixed(1)}%"></span></div>`;
    // food runway: x = days from now. fill = runway; snowflake = winter; notch = critical; hatched = shortfall before winter
    const span = Math.max(8, crit * 2.2, Math.min(60, toWinter * 1.1), Math.min(60, run * 1.1));
    const pc = (x) => Math.max(0, Math.min(100, (x / span) * 100));
    const fillCol = b.fc ? "var(--danger)" : run < crit * 1.5 ? "var(--warm)" : "var(--food)";
    const short = toWinter > 0 && run < toWinter && run < 99;
    h += `<div class="bcap" data-test="food-cap"><span>${svg("food", 12)}Food</span><b>${b.runway >= 99 ? "plenty" : b.runway.toFixed(1) + " days"}</b></div>`;
    h += `<div class="runway" data-test="runway"${tipAttr(`${sv.rations} rations = ${runwayText(b.runway)} per head\nCritical below ${crit.toFixed(1)} days: the village goes foraging as soon as it is reached.\n${seasonLine(sim)}`)}>`
      + `<span class="fill" style="width:${pc(run)}%;background:${fillCol}"></span>`
      + (short ? `<span class="short" style="left:${pc(run)}%;width:${Math.max(0, pc(toWinter) - pc(run))}%"></span>` : "")
      + `<span class="cn" style="left:${pc(crit)}%"></span>`
      + (toWinter > 0 && toWinter < span ? `<span class="wm" style="left:${pc(toWinter)}%">${svg("winter", 14)}</span>` : "")
      + `</div>`;
    // concern chips (stable order); a class that first turns alarming gets a one-time attention ring (advisory.js keeps the hysteresis)
    if (!ui.advisor) ui.advisor = newAdvisor();
    if (!ui.cnOrder) ui.cnOrder = [];
    const list = stableOrder(concerns(sim), ui.cnOrder);
    ui.concerns = list;
    ui.advCards = advise(ui.advisor, list, sim.tick);
    const attn = new Set(ui.advCards.map(c => c.k));
    h += `<div class="cchips" data-test="concerns">`;
    if (!list.length) h += `<span class="calm-ok" data-test="all-quiet"${tipAttr("Nothing pressing. The village is eating, sheltered and busy.")}>${svg("check", 16)}</span>`;
    list.forEach((c, i) => {
      h += `<button class="chip cchip l${c.level} ${attn.has(c.k) ? "attn" : ""}" data-test="concern-chip" data-class="${c.k}" data-level="${c.level}" ${attn.has(c.k) ? 'data-attn="1"' : ""} ${c.loc ? `data-loc="${i}"` : ""}${tipAttr(LABEL[c.k] + "\n" + c.text)}>${svg(c.icon, 16)}<span class="cap">${LABEL[c.k]}</span>${pip(c.sev, 10)}${sr(": " + c.text)}</button>`;
    });
    h += `</div>`;
    const doit = [...new Set(list.flatMap(c => (CONCERN_DO[c.k] || [])))].slice(0, 3);
    h += `<div class="doit" data-sec="doit">` + doit.map(k => `<button class="btn" data-tool="${k}" data-test="do-${k}"${tipAttr(TOOL_TIP[k] || k)} aria-label="${esc(TOOL_TIP[k] || k)}">${svg(k, 16)}<span class="bl">${TOOL_CAP[k] || k}</span></button>`).join("") + `</div>`;
    // beds: one icon per adult (filled = a bed for them, outline = needs one, dim = being built); racks; fields; pens
    const bedsBuilt = vl.beds.length, bedsSite = vl.sites.filter(s => s.what === "bed").length;
    h += `<div class="vrows" data-sec="rows">`;
    h += `<div class="row beds" data-test="beds"${tipAttr(`Beds: ${bedsBuilt} for ${vl.adults} adults` + (bedsSite ? ` (+${bedsSite} being built)` : ""))}>${svg("bed", 16)}<b class="rl">Beds ${bedsBuilt}/${vl.adults}</b>`;
    if (bedsSite) h += `<span class="more-l">+${bedsSite} building</span>`;
    h += `</div>`;
    h += `<div class="row inl" data-test="racks"${tipAttr(`Drying racks: ${vl.racks.length}`)}>${svg("rack", 16)}<b class="rl">Racks ${vl.racks.length}</b></div>`;
    const shelters = [...sim.rooms.list.values()].filter(r => r.enclosed).length;
    h += `<div class="row inl" data-test="shelter"${tipAttr(`Shelter: ${shelters} closed, roofed ${shelters === 1 ? "room" : "rooms"}`)}>${svg("rooms", 16)}<b class="rl">Shelter ${shelters}</b></div>`;
    const pl = sim.ents.ofKind("plot");
    if (pl.length) {
      const raw = pl.filter(q => !q.tl).length, tilled = pl.filter(q => q.tl && !q.cr).length, ripeN = pl.filter(q => q.cr && q.gr >= CROP[q.cr].days).length, sown = pl.filter(q => q.cr).length;
      h += `<div class="row" data-test="fields"${tipAttr(`Fields: ${pl.length} plots: ${raw} raw, ${tilled} tilled, ${sown} sown${ripeN ? ", " + ripeN + " ripe" : ""}`)}>${svg("field", 16)}<b class="rl">Fields ${pl.length}</b>${[[raw, "raw"], [tilled, "tilled"], [sown - ripeN, "sown"], [ripeN, "ripe"]].filter(c => c[0]).map(c => `<span class="more-l">${c[0]} ${c[1]}</span>`).join("")}</div>`;
    }
    if (sim.farm.pens.length) {
      const hs = sim.ents.ofKind("fauna").filter(e => e.tame);
      h += `<div class="row inl" data-test="pens"${tipAttr(`Pens: ${sim.farm.pens.length} (${sim.farm.pens.filter(q => q.built).length} fenced), ${hs.length} penned hoppers`)}>${svg("pen", 16)}<b class="rl">Pens ${sim.farm.pens.length}</b>${svg("hunt", 14)}<b class="rl">Hoppers ${hs.length}</b></div>`;
    }
    const spt = spoilText(sim);
    if (spt) h += `<div class="row inl" data-test="spoil"${tipAttr(spt)}>${svg("spoilage", 16)}<b class="rl">Spoiling ${Object.values(sim.farm.sp.d).reduce((a, x) => a + x, 0) || ""}</b></div>`;
    h += `</div>`;
    // all the old sentences, hidden: the same words, one tab-stop away for screen readers and the text tests
    h += `<div class="sr" data-test="village-words">` + `People ${vs.length}, ${adults} adults, ${elders} elders, ${kids} children. <span class="seasonline">${esc(seasonLine(sim))}</span> Food: ${sv.rations} rations = ${esc(runwayText(b.runway))} per head. Critical below ${crit.toFixed(1)} days; the village goes foraging as soon as it is reached. `
      + `Beds ${vl.beds.length} for ${vl.adults} adults${vl.sites.length ? " (+" + bedsSite + " being built)" : ""}. Drying racks ${vl.racks.length}. `
      + warnings(sim).map(w => `${esc(w.title)} ${esc(w.text)}`).join(" ") + ` ` + farmWords(sim, sv, pl) + `</div>`;
    if (h !== last.top) { last.top = h; morph(top, h); }

    // stores: the tiles
    const order = [];
    for (const k of ITEM_KINDS) {
      const have = sv.stock[k], kp = keepOf(k);
      if (ITEMS[k].made && !have && !kp && !sv.loose[k] && !sv.carried[k] && !(RECIPES[k] && can(sim, RECIPES[k].craft))) continue;
      if (!have && !kp && !sv.loose[k] && !sv.carried[k] && !ITEMS[k].made) continue;                   // a grid shows what exists, not 40 empty boxes
      order.push(k);
    }
    for (const k of order) {
      const t = tileFor(k), have = sv.stock[k], kp = keepOf(k), n = kp ? kp.n : 0, scale = Math.max(n * 1.15, have, 10);
      const rotting = (sim.farm.sp.d[k] || 0) > 0;
      const marks = kp ? [{ at: n * KEEP_LOW / scale, cls: "soft" }, { at: n / scale, cls: "tgt" }] : [];
      const state = kp ? (kp.on ? "refilling" : "holding") : "";
      const extra = (sv.loose[k] ? ` +${sv.loose[k]} loose` : "") + (sv.carried[k] ? ` +${sv.carried[k]} carried` : "");
      const s = [have, n, kp && kp.on, rotting, extra, ui.editKeep === k].join("|");
      if (s === t.s) continue;
      t.s = s;
      t.el.classList.toggle("sel", ui.editKeep === k); t.el.classList.toggle("zero", !have); t.el.classList.toggle("rot", rotting);
      t.n.textContent = have; t.nm.textContent = itemName(k);
      t.ex.textContent = (sv.loose[k] ? "+" + sv.loose[k] : "") ;
      t.bd.innerHTML = kp ? svg(kp.on ? "rotate" : "pause", 12) : rotting ? svg("spoilage", 12) : "";
      t.mt.innerHTML = `<i style="width:${Math.min(100, have / scale * 100).toFixed(1)}%;background:${ITEMS[k].color}"></i>` + marks.map(m => `<b class="mk ${m.cls}" style="left:${(m.at * 100).toFixed(1)}%"></b>`).join("");
      t.el.dataset.tip = itemName(k) + "\n" + (kp ? `Keep ${n}: refills below ${Math.ceil(n * KEEP_LOW)}, stops at ${n}${state ? " (" + state + ")" : ""}` : "No target. Click to set one.") + (extra ? "\n" + extra.trim() : "");
      t.sr.textContent = itemName(k) + " " + have + (kp ? " / " + n + " " + state : "") + extra;
    }
    const key = order.join(",");
    if (key !== last.order) { last.order = key; stockEl.replaceChildren(...order.map(k => tiles.get(k).el)); }

    const item = ui.editKeep;
    ed.style.display = item ? "" : "none";
    if (item) {
      const kp = keepOf(item), n = kp ? kp.n : 0;
      if (last.ed !== item) { last.ed = item; const c = ecv.getContext("2d"); c.clearRect(0, 0, 32, 32); paintItem(c, item, { n: 2 }); }
      etitle.textContent = itemName(item) + ": " + (kp ? n : "no target");
      if (document.activeElement !== input) input.value = n;
      input.max = stockCapacity(sim);
      ehelp.textContent = kp ? `Villagers start refilling when stock drops below ${Math.ceil(n * KEEP_LOW)} (80%) and stop at ${n}. ${kp.on ? "Refilling now." : "Holding."}` : "With a target, idle villagers work to keep this many in the stockpile. Cap " + stockCapacity(sim) + " (the stockpile's size).";
      ed.dataset.tip = ehelp.textContent;
    } else last.ed = "";

    // demand chips: an icon per want, bolder the stronger
    const want = Object.keys(b.dem).filter(k => b.dem[k] > 0).sort((a, c) => b.dem[c] - b.dem[a] || (a < c ? -1 : 1));
    const dh = want.map(k => `<span class="chip" style="opacity:${(0.45 + Math.min(1, b.dem[k]) * 0.55).toFixed(2)}"${tipAttr((DEMAND_LABEL[k] || k) + " (" + b.dem[k].toFixed(2) + ")")}>${svg(DEMAND_ICON[k] || "help", 14)}${sr("The village wants " + (DEMAND_LABEL[k] || k) + " (" + b.dem[k].toFixed(2) + ")")}</span>`).join("");
    if (dh !== last.dem) { last.dem = dh; dem.innerHTML = dh; }
    crews.update();
  }
  p.update = update;
  p.crews = crews;
  return p;
}

/** The fields / pens / cellar / spoilage sentences the old panel printed (kept for the hidden copy). */
function farmWords(sim, sv, pl) {
  const f = sim.farm; let h = "";
  if (pl.length) h += `Fields ${pl.length} plots: ${pl.filter(q => !q.tl).length} raw, ${pl.filter(q => q.tl && !q.cr).length} tilled, ${pl.filter(q => q.cr).length} sown. `;
  if (f.pens.length) h += `Pens ${f.pens.length} (${f.pens.filter(q => q.built).length} fenced), ${sim.ents.ofKind("fauna").filter(e => e.tame).length} penned hoppers. `;
  const st = spoilText(sim); if (st) h += st + " ";
  if (sv.stock.jar) h += `${sv.stock.jar} clay jars in the stores seal food. `;
  return esc(h);
}
