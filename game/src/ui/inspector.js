// The Why panel and the villager inspector (GDD §22). The Why panel is the
// centrepiece: it turns v.why (written by the same scoring pass that chose the
// job, so it cannot disagree with behaviour) into plain sentences.
import { ageDays, maxHp, fitness, isAdult, isElder, lifeStage, SOFT, TRAITS } from "../sim/villager.js";
import { SKILLS, level, preferred, aptitude, rustOf, peakLevel } from "../sim/skills.js";
import { HOBBIES, hobbyOf, hobbyLevel, hobbyWord } from "../sim/hobby.js";
import { relOf, reasonLine, TIER_WORD } from "../sim/bonds.js";
import { kinship, relationWord } from "../sim/people.js";
import { canSplit } from "../sim/population.js";
import { ITEMS, survey, inZone, STACK_CAP, zoneCapacity } from "../sim/items.js";
import { DAY } from "../sim/clock.js";
import { LEVEL_NAME } from "../sim/heat.js";
import { esc, bar, needColor, createPanel } from "./dom.js";
import { roomHtml, roomAct, proomHtml } from "./rooms.js";
import { plan } from "../sim/jobs.js";
import { illLines } from "../sim/disease.js";
import { CRAFTS, CRAFT_IDS } from "../sim/phenomena.js";
import { famOf, famWord, holders, can } from "../sim/knowledge.js";
import { FAUNA, hopperCap, HOPPER_LIFE } from "../sim/fauna.js";
import { CROP, cropStage, penCap, penCost, fieldById, plotsOf, ripe, SEED_KEEP, FOD_PER_HEAD, CELLAR_DEPTH } from "../sim/farm.js";
import { penHoppers, adultsOf } from "../sim/husbandry.js";
import { plotLine, CROP_STAGE } from "./text.js";
import { CELLAR_X, JAR_X, JAR_HOLD } from "../sim/items.js";
import { WAGON, WAGON_FAR, CART_FODDER, cartAnimal, wagonReady } from "../sim/wagon.js";
import { inTerritory } from "../sim/lair.js";
import { wagonLine, cellInfo, stationInfo, explain, jobNoun, CLASS, describe, stageText, bedText, itemName, pct, TRAIT_INFO, SKILL_INFO, traitWord, skillWord, professionText } from "./text.js";

const NEEDS = [["hunger", "Food"], ["thirst", "Water"], ["energy", "Energy"], ["warm", "Warmth"], ["mood", "Mood"]];

export function createWhyPanel(parent, game) {
  const p = createPanel(parent, "why", "Why are they doing this?");
  p.body.addEventListener("toggle", (e) => { if (e.target.classList.contains("parts")) game.ui.partsOpen = e.target.open; }, true);
  p.update = () => {
    const { sim, ui } = game, v = ui.focus ? sim.ents.get(ui.focus) : null;
    p.show(!!v);
    if (!v) return;
    p.setTitle("Why: " + v.name);
    if (v.poss) {
      p.html(`<div class="whysent"><span class="badge" style="background:#c9a2ff">Guided</span> <b>You are guiding ${esc(v.name)}.</b></div><p>You are Steadfast: a guided villager never flees, and may go where villagers will not (the thornback's cave, unmapped caves). They do exactly what you tell them, with the same actions the village AI uses (plus divine inspiration: +10% work speed, +15% skill XP, and they do not panic). They will not eat, drink or sleep on their own - use the Eat / Drink / Sleep buttons or C, V, N. Release them with Esc and the village takes over again.</p>`);
      return;
    }
    // Paused right after a command the villager has not re-planned yet: show what they will pick, labelled "Next".
    let pending = null;
    if (game.state.paused && (v.ep !== sim.board.ep || v.rp) && isAdultV(sim, v)) pending = plan(sim, v, false, null, true);
    const x = explain(sim, v, pending);
    if (!x) { p.html(`<p class="dim">${esc(v.name)} has not decided anything yet.</p>`); return; }
    const c = CLASS[x.cls] || CLASS.leisure;
    let h = `<div class="whysent">${x.pending ? `<span class="badge next" title="Time is paused and your last command has not reached them yet. This is what they will pick when it runs.">next:</span> ` : ""}<span class="badge" style="background:${c.color}">${esc(x.classLabel)}</span> <b>${esc(x.headline)}</b> - ${esc(x.because)}</div>`;
    if (x.pending) h += `<p class="dim">Paused: this is their plan for when time runs again. Now they are ${esc(v.job ? (v.job.k || "").replace("_", " ") : "deciding")}.</p>`;
    if (v.slp === 1 && x.headline !== "Sleeping") h += `<p class="dim">(currently asleep)</p>`;
    for (const n of x.notes || []) h += `<p class="dim">${esc(n)}</p>`;
    if (x.parts.length) {
      h += `<details class="parts" ${game.ui.partsOpen ? "open" : ""}><summary>Score ${x.score}: how it was worked out</summary><table>`;
      for (const r of x.parts) h += `<tr><td>${esc(r.label)}</td><td class="num ${r.value < 0 ? "neg" : ""}">${r.value > 0 && r.k !== "base" ? "+" : ""}${r.value}</td></tr>`;
      h += `</table><p class="dim">Higher wins. The class base decides first (needs beat village emergencies beat your orders beat standing orders beat village demand); the rest only breaks ties inside a class.</p></details>`;
    }
    if (x.rejected.length) {
      h += `<div class="sub">Other things they considered</div><ul class="rej">`;
      for (const r of x.rejected) h += `<li><b>${esc(r.label)}:</b> ${esc(r.text)}</li>`;
      h += `</ul>`;
    } else if (!x.stale) h += `<div class="sub dim">Nothing else on the list.</div>`;
    if (x.fail && x.fail.ago < 1800) h += `<div class="sub">Last failure</div><p class="dim">${esc(jobNoun(x.fail.job, ""))} did not work out: ${esc(x.fail.text)} (${Math.max(1, Math.round(x.fail.ago / 20))}s ago)</p>`;
    p.html(h);
  };
  return p;
}

export function createInspector(parent, game) {
  const p = createPanel(parent, "insp", "Selected");
  p.body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t || t.disabled) return;
    const [a, arg] = t.dataset.act.split(":");
    if (roomAct(game, a, arg)) return;
    if (a === "focus") game.selectOnly(Number(arg), true);
    if (a === "possess") game.possess(game.ui.focus);
    if (a === "release") game.release();
    if (a === "teach") game.sim.apply({ type: "teach", id: game.ui.focus, pupil: Number(arg) });
    if (a === "split") game.sim.apply({ type: "split", id: game.ui.focus });
    if (a === "fieldcr") { const [fid, cr] = arg.split(","); game.sim.apply({ type: "fieldcfg", id: Number(fid), cr }); }
    if (a === "penkeep") { const [pid, k] = arg.split(","); game.sim.apply({ type: "pencfg", id: Number(pid), keep: Number(k) }); }
    if (a === "unzone") { const [x0, y0, x1, y1, z] = arg.split(",").map(Number); game.sim.apply({ type: "unzone", x0, y0, x1, y1, z }); game.clearSelection(); game.toast("Removed."); }
    if (a === "follow") game.ui.follow = game.ui.follow === game.ui.focus ? 0 : game.ui.focus;
    if (a === "invest") {                                    // S7b: "try things HERE": the selected villagers (or the first three adults) experiment at this fire / kiln / mound for three days
      const sim = game.sim, picked = game.ui.sel.filter(id => sim.ents.get(id)), ids = (picked.length ? picked : sim.ents.ofKind("villager").filter(q => isAdult(sim, q)).map(q => q.id)).slice(0, 3);
      sim.apply({ type: "investigate", ids, at: Number(arg) });
      game.toast("Investigating here: " + ids.map(id => sim.ents.get(id).name).join(", ") + " will try things out at this spot for three days (a standing job; it never beats food or shelter).");
    }
  });
  p.update = () => {
    const { sim, ui } = game;
    const v = ui.focus ? sim.ents.get(ui.focus) : null;
    if (v) { p.show(true); p.setTitle(v.name); p.html(villagerHtml(game, v)); return; }
    if (ui.other) {
      p.show(true);
      const o = otherHtml(game, ui.other);
      p.setTitle(o.title); p.html(o.html); return;
    }
    p.show(false);
  };
  return p;
}

function villagerHtml(game, v) {
  const { sim, ui } = game, age = ageDays(sim, v), fit = fitness(v, age), mh = maxHp(v, fit);
  let h = "";
  if (ui.sel.length > 1) {
    h += `<div class="chips">`;
    const CHIPS = 14;                                                          // S11: at 20-60 selected the chip list would fill the panel
    const shownIds = ui.sel.slice(0, CHIPS); if (ui.focus && !shownIds.includes(ui.focus)) shownIds.push(ui.focus);
    shownIds.forEach((id) => { const o = sim.ents.get(id); if (o) h += `<button data-act="focus:${id}" class="${id === ui.focus ? "on" : ""}"><i style="background:hsl(${o.hue},75%,62%)"></i>${esc(o.name)}</button>`; });
    if (ui.sel.length > CHIPS) h += `<span class="dim">+${ui.sel.length - CHIPS} more selected (Tab or the strip below picks one)</span>`;
    h += `</div>`;
  }
  const fam = family(sim, v);
  h += `<div class="idrow"><i class="blob" style="background:hsl(${v.hue},75%,62%)"></i><div><b>${esc(stageText(sim, v))}</b>${isElder(sim, v) ? " (past their prime)" : ""}<br><span class="dim">${esc(fam)}</span></div></div>`;
  h += `<div class="btnrow"><button data-act="follow">${ui.follow === v.id ? "Stop following" : "Follow (F)"}</button>${v.poss ? `<button data-act="release">Release (Esc)</button>` : isAdult(sim, v) ? `<button data-act="possess" title="Guide this villager directly: WASD to walk, E to use what is next to you. Needs still drain; game speed is capped at 2x. Steadfast, +10% work speed, +15% XP.">Possess (Q)</button>` : `<button disabled title="Only grown villagers can be guided">Possess</button>`}</div>`;

  h += `<div class="sub">Needs</div><div class="grid">`;
  for (const [k, label] of NEEDS) {
    const [soft, crit] = SOFT[k];
    h += `<span>${label}</span>` + bar(v[k], { color: needColor(v[k], soft, crit), marks: [{ at: soft, cls: "soft" }, { at: crit, cls: "crit" }], text: pct(v[k]), title: `${label}: urgent below ${pct(soft)}, critical below ${pct(crit)}` });
  }
  const hr = v.hp / mh;
  h += `<span>Health</span>` + bar(hr, { color: needColor(hr, 0.6, 0.3), text: Math.round(v.hp) + "/" + Math.round(mh) });
  if (v.ill) h += `<span>Sickness</span>` + bar(v.ill.p, { color: "#a6d94a", text: pct(v.ill.p) + " recovered", title: "Recovery progress; at 100% the sickness passes" });
  h += `</div>`;
  if (v.ill) h += `<div class="sub" style="color:#a6d94a">Sick</div>` + illLines(sim, v).map(t => `<p class="dim">${esc(t)}</p>`).join("");
  else if (v.imm > sim.tick) h += `<p class="dim">Recovered lately: immune to the sickness for about ${Math.ceil((v.imm - sim.tick) / DAY)} more days.</p>`;

  h += `<div class="sub">Traits <span class="dim">(1.00 is average; hover for what each does)</span></div><div class="grid">`;
  for (const k of TRAITS) {
    const tip = TRAIT_INFO[k].what + " (" + traitWord(k, v.t[k]) + ")";
    h += `<span title="${esc(tip)}">${TRAIT_INFO[k].name}</span>` + bar((v.t[k] - 0.6) / 0.8, { color: "#6a8fd6", marks: [{ at: 0.5, cls: "mid" }], text: v.t[k].toFixed(2), title: tip });
  }
  h += `</div>`;

  const pref = preferred(v);
  h += `<div class="sub">Skills: <b>${esc(professionText(v))}</b></div><div class="grid">`;
  for (const s of SKILLS) {
    const l = level(v, s), rs = rustOf(v, s), tip = SKILL_INFO[s].what + " Level " + l.toFixed(2) + " (" + skillWord(l) + "); their gift for it is " + pct(aptitude(v, s)) + " of the way to the ceiling." + (rs > 0.02 ? " Rusty: unused for a long while, it has slipped from " + peakLevel(v, s).toFixed(2) + " (" + pct(rs) + " lost, at most 30%); using it again wins the loss back within days." : "");
    h += `<span title="${esc(tip)}">${SKILL_INFO[s].name}${rs > 0.02 ? ' <i class="rusty" title="Rusty: not used for a long while">rusty</i>' : ""}${pref === s ? ' <i class="star" title="Their preferred craft: it adds 10 points to the score of that kind of job">★</i>' : ""}</span>` + bar(l, { color: "#c9a2ff", text: l.toFixed(2), title: tip });
  }
  h += `</div>`;
  h += peopleHtml(game, v);
  h += `<div class="sub">Crafts known <span class="dim">(familiarity: whether they know the steps at all; skill is how good they are)</span></div>`;
  const known = CRAFT_IDS.filter(c => famOf(v, c) > 0);
  if (!known.length) h += `<p class="dim">Nothing beyond foraging, gathering and knapping flint.</p>`;
  else {
    h += `<div class="grid">`;
    for (const c of known) {
      const f = famOf(v, c), only = holders(sim, c).length === 1;
      h += `<span title="${esc(CRAFTS[c].name + ": " + CRAFTS[c].opens.join(", "))}">${esc(CRAFTS[c].name)}</span>` + bar(f, { color: "#e8a45c", text: famWord(f) + " " + f.toFixed(2), title: "Familiarity " + f.toFixed(2) + (only ? " - the only living villager who knows it" : "") });
    }
    h += `</div>`;
  }
  if (v.tch) { const p = sim.ents.get(v.tch.p); if (p && v.tch.u > sim.tick) h += `<p class="dim">Teaching ${esc(p.name)}: when they work the same craft side by side, ${esc(p.name)} learns 3x faster and ${esc(v.name)} works at 80%.</p>`; }
  const pupils = ui.sel.filter(id => id !== v.id).map(id => sim.ents.get(id)).filter(o => o && isAdult(sim, o));
  if (isAdult(sim, v) && pupils.length) h += `<div class="btnrow">` + pupils.slice(0, 2).map(o => `<button data-act="teach:${o.id}" title="Teach: work the same craft beside them and they learn 3x faster; you work at 80%. Give you both the same order (e.g. dig) so you end up side by side.">Teach ${esc(o.name)}</button>`).join("") + `</div>`;
  if (isAdult(sim, v)) h += `<div class="btnrow"><button data-act="split" ${canSplit(sim, v) ? "" : "disabled"} title="Split off a clone of ${esc(v.name)}: once per life, the clone regresses toward the village average and is frailer. Costs health, food and energy.">Split (clone)</button></div>`;

  h += `<div class="kv"><span>Carrying</span><b>${v.carry ? v.carry.n + " " + esc(itemName(v.carry.item)) : "nothing"}</b>`;
  h += `<span>Bed</span><b>${esc(bedText(sim, v))}</b>`;
  h += `<span>Doing</span><b>${v.slp === 1 ? "sleeping" : v.job ? esc(v.job.k.replace("_", " ")) : "deciding"}</b>`;
  h += `<span>Order</span><b>${v.order ? esc(v.order.verb) + (v.order.done ? " (" + v.order.done + " done)" : "") : "none"}</b></div>`;
  return h;
}

/** S13: hobby, titles, heirloom, grief, relationships with their reasons, and kin. */
function peopleHtml(game, v) {
  const { sim } = game;
  let h = "";
  const hb = HOBBIES[hobbyOf(v)], hl = hobbyLevel(v);
  h += `<div class="sub">Free time</div><p><b>${esc(hobbyWord(hl))} ${esc(hb.doer)}</b> <span class="dim">(hobby ${hl.toFixed(2)}: ${esc(hb.name)} in their spare time lifts their mood a little; it makes nothing)</span>${v.action && v.action.type === "Wander" ? ` <span class="dim">Right now: ${esc(hb.verb)}.</span>` : ""}</p>`;
  if (v.ti && v.ti.length) h += `<p class="ttls"><b>Known as:</b> ${v.ti.map(t => `<span class="ttl">${esc(t)}</span>`).join(" ")}</p>`;
  if (v.hl) h += `<p title="An heirloom has no use, only a story."><b>Heirloom:</b> ${esc(v.hl.n)} <span class="dim">- kept by ${esc(v.hl.h.map(x => x.n).join(", then "))}</span></p>`;
  if (v.gr) { h += `<p class="warnline">Grieving ${esc(name(sim, v.gr.f) || "someone")}: ${Math.ceil((v.gr.u - sim.tick) / DAY)} more day(s). Lower mood and up to ${Math.round(v.gr.s * 5)}% less work.</p>`; }
  const rel = v.rel || [];
  h += `<div class="sub">Relationships <span class="dim">(friends work beside each other, rivals keep apart, mentors teach better)</span></div>`;
  if (!rel.length) h += `<p class="dim">No close ties yet. They form from working side by side, Teach, hard times shared and temper clashes.</p>`;
  else {
    h += `<ul class="rej">`;
    for (const r of rel) { const o = sim.ents.get(r.o); if (o) h += `<li><b>${TIER_WORD[r.k]}: <a data-act="focus:${o.id}" class="lnk">${esc(o.name)}</a></b> ${esc(reasonLine(r, o.name))}</li>`; }
    h += `</ul>`;
  }
  const kin = sim.ents.ofKind("villager").filter(o => o !== v).map(o => [o, kinship(v, o), relationWord(v, o)]).filter(k => k[1] > 0 && k[2]);
  h += `<div class="sub">Kin <span class="dim">(close kin who have children together risk a frail child)</span></div>`;
  if (v.wk) h += `<p class="warnline">Born frail: their parents were close kin (kinship ${v.inb}), and it shows in health, fertility and long life.</p>`;
  if (!kin.length) h += `<p class="dim">No relatives in the village.</p>`;
  else h += `<p>` + kin.map(([o, k, w]) => `<a data-act="focus:${o.id}" class="lnk">${esc(o.name)}</a> (${esc(w)}${k >= 0.5 ? ", very close" : ""})`).join(", ") + `</p>`;
  return h;
}

function name(sim, id) {
  if (!id) return null;
  const e = sim.ents.get(id);
  if (e) return e.name;
  const r = sim.chron.recs[id];
  return r ? r.name + " (dead)" : "someone";
}
function family(sim, v) {
  const [a, b] = v.par;
  const clone = a && a === b;
  const ps = clone ? "A clone of " + name(sim, a) : a || b ? "Child of " + [name(sim, a), name(sim, b)].filter(Boolean).join(" and ") : "A founder of the village";
  const grand = !clone && (a || b) ? [a, b].map(id => id && sim.ents.get(id)).filter(Boolean).flatMap(p => p.par.filter(Boolean)).length : 0;
  const kids = sim.ents.ofKind("villager").filter(o => o.par[0] === v.id || o.par[1] === v.id).length;
  const mate = name(sim, v.mate);
  return `${ps}. Generation ${v.gen}, line ${v.lin + 1}` + (v.cg ? `, ${v.cg} clone ${v.cg === 1 ? "generation" : "generations"} deep` : "") + (grand ? `, ${grand} known grandparent${grand === 1 ? "" : "s"}` : "") + (mate ? `. Partner: ${mate}` : "") + (kids ? `. ${kids} living ${kids === 1 ? "child" : "children"}` : "") + ".";
}

const isAdultV = (sim, v) => isAdult(sim, v);

function otherHtml(game, o) {
  const { sim } = game;
  if (o.kind === "room") return roomHtml(game, o.id);
  if (o.kind === "proom") return proomHtml(game, o);
  if (o.kind === "cell") { const c = cellInfo(sim, o.x, o.y, o.z); return { title: c.title, html: c.lines.map(l => `<p>${esc(l)}</p>`).join("") }; }
  if (o.kind === "stock") {
    const z = sim.stock, s = survey(sim);
    let h = `<p>A ${z.x1 - z.x0 + 1} by ${z.y1 - z.y0 + 1} cell area where villagers keep food and materials. Holds ${zoneCapacity(z)} items in stacks of ${STACK_CAP}.</p><div class="kv">`;
    for (const k in ITEMS) h += `<span>${esc(itemName(k))}</span><b>${s.stock[k]} stored${s.loose[k] ? ", " + s.loose[k] + " loose" : ""}${s.carried[k] ? ", " + s.carried[k] + " carried" : ""}</b>`;
    return { title: "Stockpile", html: h + "</div>" };
  }
  if (o.kind === "pen") return penHtml(game, o.id);
  if (o.kind === "cellar") return cellarHtml(game);
  const e = sim.ents.get(o.id);
  if (!e) return { title: "Gone", html: `<p class="dim">That is no longer there.</p>` };
  if (e.kind === "fauna") return faunaCard(game, e);
  if (e.kind === "plot") return plotHtml(game, e);
  if (e.kind === "wagon") return wagonCard(game, e);
  if (e.kind === "grave") return { title: "Grave of " + e.name, html: `<p>${esc(e.ins)}</p><div class="kv"><span>Died</span><b>${esc("of " + e.cause)}</b>${e.hl ? `<span>Buried with</span><b>${esc(e.hl)}</b>` : ""}<span>Position</span><b>${e.x}, ${e.y}</b></div><p class="dim">The village lays its dead to rest near the camp. The words come from the chronicle.</p>` };
  let h = `<p>${esc(describe(sim, e))}</p><div class="kv">`;
  const holder = e.rv && sim.ents.get(e.rv) && sim.tick - e.rt < 400 ? sim.ents.get(e.rv) : null;
  if (e.kind === "item") h += `<span>Where</span><b>${inZone(sim.stock, e.x, e.y) ? "in the stockpile" : "loose on the ground"}</b>` + (e.item === "berry" ? `<span>Spoils</span><b>${ITEMS.berry.spoil * 100}% a day (3% in winter)</b>` : "");
  if (e.kind === "plant" && e.nx > sim.tick && (e.species === "tuft" || e.species === "tuber" || e.species === "sapling" || (e.species === "berry" && e.yield < 4))) h += `<span>Regrows</span><b>in ${Math.max(1, Math.round((e.nx - sim.tick) / DAY))} days</b>`;
  if (e.kind === "furniture" && e.f === "bed") h += `<span>Owner</span><b>${esc(name(sim, e.owner) || "nobody yet")}</b>`;
  if (e.kind === "furniture" && e.f === "hearth") h += `<span>Fire</span><b>${e.lit ? "burning, heat level " + e.hl + " (" + LEVEL_NAME[e.hl] + ")" : "cold"}</b><span>Fuel left</span><b>${Math.round(e.fuel / 18)} s at 1x (${(e.fuel / DAY).toFixed(1)} days)</b>`;
  const si = e.kind === "furniture" ? stationInfo(sim, e) : null;
  if (si) {
    h += `<span>State</span><b>${esc(si.state)}</b>`;
    for (const x of si.heat) h += `<span>With ${esc(x.fuelWord)}</span><b>${esc(x.levelName)} (level ${x.level}, P ${x.P.toFixed(2)})</b>`;
  }
  if (e.kind === "furniture" && e.f === "waterjar") h += `<span>Water</span><b>${e.fill} of 60 sips</b>`;
  if (holder) h += `<span>Claimed by</span><b>${esc(holder.name)}</b>`;
  h += `<span>Position</span><b>${e.x}, ${e.y}</b></div>`;
  if (si || (e.kind === "furniture" && e.f === "hearth")) h += `<div class="btnrow"><button data-act="invest:${e.id}" title="Ask the selected villagers (or three adults) to try things out with what is in the stockpile, at this spot only. A standing job for three days.">Investigate here</button></div>`;
  if (si) {
    for (const x of si.heat) h += `<div class="sub">Heat with ${esc(x.fuelWord)}</div><ul class="rej">` + x.layout.map(t => `<li>${esc(t)}</li>`).join("") + x.steps.map(t => `<li class="warnline"><b>To get hotter:</b> ${esc(t)}</li>`).join("") + `</ul>`;
    if (si.note) h += `<div class="sub">Why heat 5 is hard</div><p class="dim">${esc(si.note)}</p>`;
    h += `<div class="sub">What it can make</div><ul class="rej">` + si.recipes.map(r => `<li><b>${esc(r.label)}:</b> ${r.ok ? "ready" : esc(r.why)}</li>`).join("") + `</ul>`;
  }
  const t = e.kind === "item" ? itemName(e.item) : e.kind === "plant" ? ({ tree: e.burn ? "Burning tree" : "Tree", berry: "Berry bush", tuft: "Grass tuft", tuber: "Tuber plant", sapling: "Sapling", stump: "Charred stump" })[e.species] : e.kind === "furniture" ? ({ bed: "Leaf bed", door: "Door", hearth: "Fire ring", kiln: "Pit kiln", mound: "Charcoal mound", workbench: "Workbench", bellows: "Bellows", waterjar: "Water jar", smoker: "Covered rack", forge: "Brick forge", shelf: "Shelf" })[e.f] || "Drying rack" : e.kind === "csite" ? "Planned piece" : e.kind === "flame" ? (e.src === "tree" ? "Burning tree" : "Smouldering stump") : "Site";
  return { title: t, html: h };
}

/** S10: a field cell: its stage, and the field it belongs to (crop choice, how far along it all is). */
function plotHtml(game, e) {
  const { sim } = game, f = fieldById(sim, e.fid), all = plotsOf(sim, e.fid);
  let h = `<p>${esc(plotLine(e))}</p><div class="kv">`;
  if (e.cr) {
    const st = cropStage(e);
    h += `<span>Crop</span><b>${esc(CROP[e.cr].label)}: ${esc(CROP_STAGE[st])}</b><span>Watered</span><b>${e.wt > sim.tick ? "yes, for " + Math.max(1, Math.round((e.wt - sim.tick) / DAY)) + " more day(s)" : "no - it grows at a quarter speed until a villager waters it"}</b>`;
    h += `<span>Yield</span><b>${CROP[e.cr].yield} ${e.cr === "tuber" ? "tubers (keep all winter)" : "berries (spoil fast: dry them)"} when ripe</b>`;
  }
  const n = (fn) => all.filter(fn).length;
  h += `<span>This field</span><b>${all.length} plots: ${n(p => !p.tl)} raw, ${n(p => p.tl && !p.cr)} tilled, ${n(p => p.cr && !ripe(p))} growing, ${n(p => ripe(p))} ripe</b>`;
  h += `<span>Sows</span><b>${f ? ({ auto: "whichever seed the stockpile has more of", berry: "berries", tuber: "tubers" })[f.cr] : "?"}</b></div>`;
  h += `<div class="btnrow">` + ["auto", "berry", "tuber"].map(c => `<button data-act="fieldcr:${e.fid},${c}" class="${f && f.cr === c ? "on" : ""}" title="Which seed this field sows">${c === "auto" ? "Auto" : c === "berry" ? "Berries" : "Tubers"}</button>`).join("")
    + (f ? `<button data-act="unzone:${f.x0},${f.y0},${f.x1},${f.y1},${f.z}" title="Remove this field (its crops are lost)">Remove field</button>` : "") + `</div>`;
  h += `<p class="dim">Villagers till raw ground, sow a seed from the stockpile (the last ${SEED_KEEP} are kept to eat), water the sown plots and harvest the ripe ones as standing chores. Crops grow in spring and summer, slowly in autumn, and the first frost kills any that are not ripe: fields lie fallow in winter. Tubers keep all winter; berries do not.</p>`;
  return { title: "Field", html: h };
}

/** S10: a pen. Its hoppers, fodder, and the keep-N that decides what is slaughtered. */
function penHtml(game, id) {
  const { sim } = game, pn = sim.farm.pens.find(q => q.id === id);
  if (!pn) return { title: "Gone", html: `<p class="dim">That pen is gone.</p>` };
  const hs = penHoppers(sim, pn), ad = adultsOf(sim, hs).length, cap = penCap(pn);
  let h = `<p>${pn.built ? "A fenced pen for hoppers, with a gate on the south side." : "A pen waiting to be staked out: villagers bring sticks (" + pn.got + " of " + pn.need + " are in)."}</p><div class="kv">`;
  if (pn.built) {
    h += `<span>Hoppers</span><b>${hs.length} of ${cap} (${ad} adult, ${hs.length - ad} young)</b>`;
    h += `<span>Fodder</span><b>${pn.fod} grass in the trough${hs.length ? " (they eat " + (hs.length * FOD_PER_HEAD).toFixed(1) + " a day)" : ""}${pn.hg ? " - HUNGRY " + pn.hg + " day(s)" : ""}</b>`;
    h += `<span>Keep</span><b>${pn.keep} adults; ${ad > pn.keep ? (ad - pn.keep) + " will be slaughtered" : "none to slaughter"}</b>`;
    h += `<span>Breeding</span><b>${hs.length >= cap ? "the pen is full" : ad >= 2 && pn.fod > 0 ? "fed adult pairs breed" : ad < 2 ? "needs two adults" : "needs grass in the trough"}</b>`;
  } else h += `<span>Fence</span><b>${pn.got} of ${pn.need} sticks</b>`;
  h += `<span>Size</span><b>${pn.x1 - pn.x0 + 1} by ${pn.y1 - pn.y0 + 1} cells, holds ${cap}</b></div>`;
  h += `<div class="btnrow"><button data-act="penkeep:${pn.id},${Math.max(0, pn.keep - 1)}" title="Keep one fewer adult; the surplus is slaughtered for meat and a hide">Keep -1</button><button data-act="penkeep:${pn.id},${pn.keep + 1}" title="Keep one more adult">Keep +1</button>`
    + `<button data-act="unzone:${pn.x0},${pn.y0},${pn.x1},${pn.y1},${pn.z}" title="Remove this pen (the hoppers go wild)">Remove pen</button></div>`;
  h += `<p class="dim">Select villagers, then use the Capture order on a wild hopper: they catch it and walk it in. Grass from the stockpile is carried to the trough as a chore. The pen's keep-N is how many adults stay; any more are slaughtered for meat and a hide.</p>`;
  return { title: "Hopper pen", html: h };
}

function cellarHtml(game) {
  const c = game.sim.farm.cellar;
  return { title: "Cold cellar", html: c ? `<p>An underground room (at least ${CELLAR_DEPTH} cells below the surface) where villagers carry food. It spoils at ${Math.round(CELLAR_X * 100)}% of the open rate; clay jars in the stores cut it further (a jar seals ${JAR_HOLD} units at ${Math.round(JAR_X * 100)}%).</p><div class="btnrow"><button data-act="unzone:${c.x0},${c.y0},${c.x1},${c.y1},${c.z}">Stop using it</button></div>` : `<p class="dim">No cellar.</p>` };
}

/** The inspector card for a creature (S8): what it is, its health, what it is doing, and what a player can do about it. */
function faunaCard(game, e) {
  const { sim } = game, row = FAUNA[e.sp];
  let h = `<p>${esc(describe(sim, e))}</p>`;
  h += `<div class="grid"><span>Health</span>` + bar(e.hp / e.mhp, { color: needColor(e.hp / e.mhp, 0.6, 0.3), text: Math.max(0, Math.round(e.hp)) + "/" + e.mhp }) + `</div><div class="kv">`;
  h += `<span>Doing</span><b>${esc(e.st)}</b>`;
  if (row.hostile && e.sp === "thornback") h += `<span>Territory</span><b>${inTerritory(sim, e.x, e.y, e.z) ? "inside the cave lair" : "outside its lair"}</b><span>Danger</span><b>about ${row.dmg} damage a bite, ${Math.round(row.hit * 100)}% to hit</b>`;
  else h += `<span>Yields</span><b>${row.meat} meat${row.hide ? ", " + row.hide + " hide" + (row.hide > 1 ? "s" : "") : ""}${row.bone ? ", " + row.bone + " bone" : ""} when hunted</b>`;
  if (e.sp === "wolf") h += `<span>Danger</span><b>about ${row.dmg} damage a bite, ${Math.round(row.hit * 100)}% to hit; it hunts the lone, at night, in winter</b>`;
  if (e.sp === "grazer") h += `<span>Danger</span><b>${e.tame ? "penned and quiet" : "about " + row.dmg + " damage a blow when cornered or struck"}</b>`;
  if (e.sp === "hopper") {
    const age = Math.floor((sim.tick - (e.bd === undefined ? sim.tick : e.bd)) / DAY);
    h += `<span>Age</span><b>${age} days: ${age < HOPPER_LIFE.adult ? "young" : age < HOPPER_LIFE.old ? "adult" : "old"}</b>` + (e.tame ? `<span>Pen</span><b>penned (a tame hopper)</b>` : `<span>Herd</span><b>about ${sim.wild.cap || hopperCap(sim)} fit the meadow</b>`);
  }
  h += `<span>Position</span><b>${e.x}, ${e.y}</b></div>`;
  if (e.sp === "wolf") h += `<p class="dim">Keep company, keep a fire lit, and wolves keep away. Villagers flee when their fear passes 60%; a guided villager with a spear can fight a wolf.</p>`;
  else if (row.hostile) h += `<p class="dim">Villagers flee when their fear passes 60% and will not enter its ground. A guided villager (Q) does not flee: with a copper spear, three good thrusts kill it.</p>`;
  else if (e.tame) h += `<div class="dim">Penned: fed grass it breeds; the pen's keep-N decides which adults are slaughtered.</div>`;
  else h += `<div class="dim">Select villagers and right-click it to hunt${can(sim, "HUSBANDRY") ? ", or use the Capture order to pen it alive" : ""}.</div>`;
  return { title: row.label[0].toUpperCase() + row.label.slice(1), html: h };
}

/** S15: the wagon / animal cart card: what it carries, who has it, its grazer and whether the grazer is fed. */
function wagonCard(game, e) {
  const { sim } = game, row = WAGON[e.t], who = e.dr ? sim.ents.get(e.dr) : null, a = e.t === "cart" ? cartAnimal(sim, e, false) : null;
  let h = `<p>${esc(wagonLine(sim, e))}.</p><div class="kv"><span>Carries</span><b>${row.cap} load units (hands: about 6)</b><span>Pace</span><b>${e.t === "cart" ? "a little faster than walking on the flat" : "slower than walking: the wagon is pushed"}, slower still up and down steps</b>`
    + `<span>Hitched to</span><b>${esc(who ? who.name : "nobody (free)")}</b><span>Trips so far</span><b>${e.tr}</b>`;
  if (e.t === "cart") {
    const r = wagonReady(sim, e);
    h += `<span>Pulled by</span><b>${a ? "a grazer in pen " + a.pen.id : "nothing: no penned grazer"}</b><span>Fed</span><b>${a ? (r ? "no - the pen's trough is empty or its animals are hungry" : "yes (" + a.pen.fod + " in the trough; each trip eats " + CART_FODDER + ")") : "-"}</b>`;
  }
  return { title: row.label, html: h + `</div><p class="dim">Villagers use a free wagon on a long haul (a pile ${WAGON_FAR} or more cells from the stockpile), pick up several stacks and leave it at the store. ${e.t === "cart" ? "A cart is only used while its grazer is fed." : ""}</p>` };
}
