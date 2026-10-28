// The Why panel and the villager inspector (GDD §22). The Why panel is the
// centrepiece: it turns v.why (written by the same scoring pass that chose the
// job, so it cannot disagree with behaviour) into plain sentences.
import { ageDays, maxHp, fitness, isAdult, isElder, lifeStage, SOFT, TRAITS } from "../sim/villager.js";
import { SKILLS, level, preferred } from "../sim/skills.js";
import { ITEMS, survey, inZone, STACK_CAP, zoneCapacity } from "../sim/items.js";
import { DAY } from "../sim/clock.js";
import { esc, bar, needColor, createPanel } from "./dom.js";
import { roomHtml, roomAct, proomHtml } from "./rooms.js";
import { plan } from "../sim/jobs.js";
import { explain, jobNoun, CLASS, describe, stageText, bedText, itemName, pct } from "./text.js";

const TRAIT_TIP = {
  strength: "Carrying and chopping", speed: "Walking and gathering speed", intelligence: "Learns skills faster",
  hardiness: "Health and resistance to cold", appetite: "How much they eat", fertility: "Chance of children", longevity: "How long a life lasts",
};
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
      p.html(`<div class="whysent"><span class="badge" style="background:#c9a2ff">Guided</span> <b>You are guiding ${esc(v.name)}.</b></div><p>They do exactly what you tell them, with the same actions the village AI uses (plus divine inspiration: +10% work speed, +15% skill XP, and they do not panic). They will not eat, drink or sleep on their own - use the Eat / Drink / Sleep buttons or C, V, N. Release them with Esc and the village takes over again.</p>`);
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
    if (a === "follow") game.ui.follow = game.ui.follow === game.ui.focus ? 0 : game.ui.focus;
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
    for (const id of ui.sel) { const o = sim.ents.get(id); if (o) h += `<button data-act="focus:${id}" class="${id === ui.focus ? "on" : ""}"><i style="background:hsl(${o.hue},75%,62%)"></i>${esc(o.name)}</button>`; }
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
  h += `</div>`;

  h += `<div class="sub">Traits <span class="dim">(1.00 is average)</span></div><div class="grid">`;
  for (const k of TRAITS) h += `<span title="${esc(TRAIT_TIP[k])}">${k[0].toUpperCase() + k.slice(1)}</span>` + bar((v.t[k] - 0.6) / 0.8, { color: "#6a8fd6", marks: [{ at: 0.5, cls: "mid" }], text: v.t[k].toFixed(2), title: TRAIT_TIP[k] });
  h += `</div>`;

  const pref = preferred(v);
  h += `<div class="sub">Skills</div><div class="grid">`;
  for (const s of SKILLS) { const l = level(v, s); h += `<span>${s[0].toUpperCase() + s.slice(1)}${pref === s ? ' <i class="star" title="Preferred craft: gets a score bonus">★</i>' : ""}</span>` + bar(l, { color: "#c9a2ff", text: l.toFixed(2), title: "Skill level (grows only with real output)" }); }
  h += `</div>`;

  h += `<div class="kv"><span>Carrying</span><b>${v.carry ? v.carry.n + " " + esc(itemName(v.carry.item)) : "nothing"}</b>`;
  h += `<span>Bed</span><b>${esc(bedText(sim, v))}</b>`;
  h += `<span>Doing</span><b>${v.slp === 1 ? "sleeping" : v.job ? esc(v.job.k.replace("_", " ")) : "deciding"}</b>`;
  h += `<span>Order</span><b>${v.order ? esc(v.order.verb) + (v.order.done ? " (" + v.order.done + " done)" : "") : "none"}</b></div>`;
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
  const ps = a || b ? "Child of " + [name(sim, a), name(sim, b)].filter(Boolean).join(" and ") : "A founder of the village";
  const kids = sim.ents.ofKind("villager").filter(o => o.par[0] === v.id || o.par[1] === v.id).length;
  const mate = name(sim, v.mate);
  return `${ps}. Generation ${v.gen}, line ${v.lin + 1}` + (mate ? `. Partner: ${mate}` : "") + (kids ? `. ${kids} living ${kids === 1 ? "child" : "children"}` : "") + ".";
}

const isAdultV = (sim, v) => isAdult(sim, v);

function otherHtml(game, o) {
  const { sim } = game;
  if (o.kind === "room") return roomHtml(game, o.id);
  if (o.kind === "proom") return proomHtml(game, o);
  if (o.kind === "stock") {
    const z = sim.stock, s = survey(sim);
    let h = `<p>A ${z.x1 - z.x0 + 1} by ${z.y1 - z.y0 + 1} cell area where villagers keep food and materials. Holds ${zoneCapacity(z)} items in stacks of ${STACK_CAP}.</p><div class="kv">`;
    for (const k in ITEMS) h += `<span>${esc(itemName(k))}</span><b>${s.stock[k]} stored${s.loose[k] ? ", " + s.loose[k] + " loose" : ""}${s.carried[k] ? ", " + s.carried[k] + " carried" : ""}</b>`;
    return { title: "Stockpile", html: h + "</div>" };
  }
  const e = sim.ents.get(o.id);
  if (!e) return { title: "Gone", html: `<p class="dim">That is no longer there.</p>` };
  let h = `<p>${esc(describe(sim, e))}</p><div class="kv">`;
  const holder = e.rv && sim.ents.get(e.rv) && sim.tick - e.rt < 400 ? sim.ents.get(e.rv) : null;
  if (e.kind === "item") h += `<span>Where</span><b>${inZone(sim.stock, e.x, e.y) ? "in the stockpile" : "loose on the ground"}</b>` + (e.item === "berry" ? `<span>Spoils</span><b>${ITEMS.berry.spoil * 100}% a day (3% in winter)</b>` : "");
  if (e.kind === "plant" && e.nx > sim.tick && (e.species === "tuft" || e.species === "sapling" || (e.species === "berry" && e.yield < 4))) h += `<span>Regrows</span><b>in ${Math.max(1, Math.round((e.nx - sim.tick) / DAY))} days</b>`;
  if (e.kind === "furniture" && e.f === "bed") h += `<span>Owner</span><b>${esc(name(sim, e.owner) || "nobody yet")}</b>`;
  if (holder) h += `<span>Claimed by</span><b>${esc(holder.name)}</b>`;
  h += `<span>Position</span><b>${e.x}, ${e.y}</b></div>`;
  const t = e.kind === "item" ? itemName(e.item) : e.kind === "plant" ? ({ tree: "Tree", berry: "Berry bush", tuft: "Grass tuft", sapling: "Sapling" })[e.species] : e.kind === "furniture" ? ({ bed: "Leaf bed", door: "Door" })[e.f] || "Drying rack" : e.kind === "csite" ? "Planned piece" : "Site";
  return { title: t, html: h };
}
