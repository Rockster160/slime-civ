// The Why panel and the villager inspector (GDD §22). The Why panel is the
// centrepiece: it turns v.why (written by the same scoring pass that chose the
// job, so it cannot disagree with behaviour) into plain sentences.
import { ageDays, maxHp, fitness, isAdult, isElder, lifeStage, SOFT, TRAITS, LIFE_DAYS } from "../sim/villager.js";
import { SKILLS, level, preferred, aptitude, rustOf, peakLevel } from "../sim/skills.js";
import { HOBBIES, hobbyOf, hobbyLevel, hobbyWord } from "../sim/hobby.js";
import { relOf, reasonLine, TIER_WORD } from "../sim/bonds.js";
import { kinship, relationWord } from "../sim/people.js";
import { splitCount, splitBlock } from "../sim/split.js";
import { ITEMS, survey, inZone, STACK_CAP, zoneCapacity, stockZoneAt, stockCapacity } from "../sim/items.js";
import { DUR_DAY } from "../sim/clock.js";
import { LEVEL_NAME } from "../sim/heat.js";
import { esc, bar, needColor, createPanel, morph } from "./dom.js";
import { svg } from "./icons.js";
import { ring, meter, rankPips, avatar, tipAttr, sr, CLASS_ROLE } from "./kit.js";
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
import { memChips, episodeLines } from "./memtext.js";
import { knowChips } from "./beltext.js";
import { noticeChips } from "./boardtext.js";
import { ROLE } from "../sim/orders.js";
import { wagonLine, cellInfo, stationInfo, explain, jobNoun, JOB, CLASS, describe, stageText, bedText, itemName, pct, TRAIT_INFO, SKILL_INFO, traitWord, skillWord, professionText, shortBlocker } from "./text.js";

const NEEDS = [["hunger", "Food"], ["thirst", "Water"], ["energy", "Energy"], ["warm", "Warmth"], ["mood", "Mood"]];
const CLASS_SHORT = { need: "Need", vcrit: "Urgent", order: "Order", standing: "Standing", demand: "Demand", leisure: "Free time" };
const RING_CAP = { hunger: "Food", thirst: "Water", energy: "Rest", warm: "Warm" };
const GENE_CAP = { strength: "Str", speed: "Spd", stamina: "Stam", intelligence: "Int", drive: "Drive", leisure: "Leis", fertility: "Fert", longevity: "Life", hardiness: "Hard" };
const SKILL_CAP = { dig: "Dig", build: "Build", craft: "Craft" };
const NEED_ICON = { hunger: "food", thirst: "water", energy: "energy", warm: "warmth" };
const TRAIT_ICON = { strength: "haul", speed: "flee", stamina: "health", intelligence: "knowledge", drive: "bolt", leisure: "mood-hi", fertility: "people", longevity: "spoilage", hardiness: "warmth" };
const SKILL_ICON = { dig: "dig", build: "build", craft: "craft" };
export const JOB_ICON = { eat: "eat", drink: "drink", sleep: "sleep", huddle: "sleep", leisure: "mood-hi", forage: "forage", dry: "rack", build_bed: "bed", build_rack: "rack", build_site: "build", craft_site: "craft", deconstruct: "deconstruct", dig: "dig", mine: "dig", cut: "gather", chop: "chop", haul: "haul", store: "drop", goto: "move", tend_fire: "hearth", fire_kiln: "kiln", burn_charcoal: "mound", smelt: "forge", smoke: "smoker", make_tool: "workbench", fetch_water: "water", tinker: "knowledge", explore: "scout", post: "board", check_board: "board", look: "scout", search_food: "scout", search: "scout", grub: "cleararea", cook: "hearth", haul_wagon: "haul", flee: "flee", defend: "hunt", mend: "tend", convalesce: "tend", tend_sick: "tend", hunt: "hunt", till: "field", sow: "sprout", water_field: "water", harvest: "field", fence: "pen", fodder: "gather", slaughter: "hunt", capture: "capture", scout: "scout", strike: "hunt", disarm: "craft" };
const RIM = { need: "circle", vcrit: "tri", order: "sq", standing: "hex", demand: "none", leisure: "none" };

/** The "Now" section (UI_SPEC §3.2): why this villager is doing this, as a chain of icons. Words are in tips and in a hidden copy; "Say it in words" opens the table. */
function createNow(root, game) {
  root.addEventListener("toggle", (e) => { if (e.target.classList.contains("parts")) game.ui.partsOpen = e.target.open; }, true);
  let last = "";
  return {
    root,
    update(v) {
      const { sim } = game;
      let h = "";
      if (v.poss) {
        h = `<div class="chain" data-sec="job" data-test="why-chain"><span class="jc big r-circle" style="border-color:var(--poss)"${tipAttr("Guided: you are guiding " + v.name)}>${svg("possess", 22)}</span><span class="cls">${svg("release", 14)}<kbd>Esc</kbd></span></div>`
          + `<div class="sr" data-test="why-words"><b>You are guiding ${esc(v.name)}.</b> You are Steadfast: a guided villager never flees, and may go where villagers will not (the thornback's cave, unmapped caves). They do exactly what you tell them; the village does not plan around them.</div>`;
        if (h !== last) { last = h; morph(root, h); }
        return;
      }
      let pending = null;
      if (game.state.paused && (v.ep !== sim.board.ep || v.rp) && isAdult(sim, v)) pending = plan(sim, v, false, null, true);
      const x = explain(sim, v, pending);
      if (!x) { h = `<div class="sr">${esc(v.name)} has not decided anything yet.</div>`; if (h !== last) { last = h; morph(root, h); } return; }
      const jobK = pending ? pending.job : v.job ? v.job.k : v.why ? v.why.job : "";
      const icon = JOB_ICON[jobK] || "idle", rim = RIM[x.cls] || "none";
      const say = x.sentence, tot = Math.max(1, x.score === null ? 0 : x.score);
      h = `<div class="chain" data-sec="job" data-test="why-chain"><span class="jc big r-${rim} ${x.pending ? "next" : ""}" data-class="${x.cls}"${tipAttr(say + "\n" + x.classLabel)}>${svg(icon, 22)}</span>`
        + `<span class="cls" data-test="job-label">${esc(JOB[jobK] ? JOB[jobK].noun : "")}</span><span class="score">${x.score !== null ? `<span class="cap">${esc(CLASS_SHORT[x.cls] || "Priority")}</span>` + meter(Math.min(1, tot / 160), { color: `var(--${CLASS_ROLE[x.cls] || "tx3"})`, tip: "Score " + x.score + ". Higher wins." }) : ""}</span></div>`;
      {                                                                           // "Passed over": ALWAYS present, one fixed-height row; two chips and a "+N" chip, never a second line
        const SHOW = 2, rest = x.rejected.slice(SHOW);
        h += `<div class="rejl" data-sec="passed" data-test="why-rejected">${x.rejected.length ? `<span class="cap">Passed over</span>` : ""}`;
        for (const r of x.rejected.slice(0, SHOW)) h += `<span class="rj"${tipAttr(r.label + "\n" + r.text)}><span class="jc rej r-${RIM[r.cls] || "none"}">${svg(JOB_ICON[r.job] || JOB_ICON[Object.keys(JOB).find(k => JOB[k].noun === r.label.replace(/ order$/, ""))] || "blocked", 14)}</span><b>${esc(r.label.replace(/ order$/, ""))}</b><span class="bk">${svg("blocked", 12)}${esc(shortBlocker(r.blocker))}</span></span>`;
        if (rest.length) h += `<span class="rj more"${tipAttr("Also passed over\n" + rest.map(r => r.label.replace(/ order$/, "") + ": " + shortBlocker(r.blocker)).join("\n"))}><b>+${rest.length}</b></span>`;
        h += `</div>`;
      }
      // the words: the headline stays in the DOM (hidden), the table sits in a closed disclosure
      h += `<div class="sr" data-test="why-words">${x.pending ? `<span class="badge next">next:</span> ` : ""}<span class="badge">${esc(x.classLabel)}</span> <b>${esc(x.sentence)}</b>`;
      if (x.pending) h += `<p>Paused: this is their plan for when time runs again. Now they are ${esc(v.job ? (v.job.k || "").replace("_", " ") : "deciding")}.</p>`;
      if (v.slp === 1 && x.headline !== "Sleeping") h += `<p>(currently asleep)</p>`;
      for (const n of x.notes || []) h += `<p>${esc(n)}</p>`;
      if (x.rejected.length) { h += `<p>Other things they considered</p><ul>`; for (const r of x.rejected) h += `<li><b>${esc(r.label)}:</b> ${esc(r.text)}</li>`; h += `</ul>`; }
      if (x.fail && x.fail.ago < 1800) h += `<p>Last failure: ${esc(jobNoun(x.fail.job, ""))} did not work out: ${esc(x.fail.text)} (${Math.max(1, Math.round(x.fail.ago / 20))}s ago)</p>`;
      h += `</div>`;
      if (x.parts.length) {
        h += `<details class="parts" data-sec="why" ${game.ui.partsOpen ? "open" : ""}><summary>${svg("chev-r", 12)} Why?</summary><table>`;
        for (const r of x.parts) h += `<tr><td>${esc(r.label)}</td><td class="num ${r.value < 0 ? "neg" : ""}">${r.value > 0 && r.k !== "base" ? "+" : ""}${r.value}</td></tr>`;
        h += `</table><p class="dim">Score ${x.score}. Higher wins. The class base decides first (needs beat village emergencies beat your orders beat standing orders beat village demand); the rest only breaks ties inside a class.</p></details>`;
      } else h += `<div class="parts ph" data-sec="why"></div>`;
      if (h !== last) { last = h; morph(root, h); }
    },
  };
}

/** One inspector for everything selected (UI_SPEC §5): the chrome header, the Now section, then a card for what the selection is. */
export function createInspector(parent, game) {
  const p = createPanel(parent, "inspector", "Selected", { icon: "eye" });
  p.body.innerHTML = `<div class="sec-now" data-test="inspector-now"></div><div class="sec-body" data-test="inspector-body"></div>`;
  const nowEl = p.body.querySelector(".sec-now"), bodyEl = p.body.querySelector(".sec-body"), now = createNow(nowEl, game), icoEl = p.head.querySelector(".pi");
  let lastBody = "", lastIco = "", lastKey = "", lastAt = 0;
  p.body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t || t.disabled) return;
    const [a, arg] = t.dataset.act.split(":");
    if (roomAct(game, a, arg)) return;
    if (a === "focus") game.selectOnly(Number(arg), true);
    if (a === "possess") game.possess(game.ui.focus);
    if (a === "release") game.release();
    if (a === "teach") { const pu = Number(arg); game.sim.apply({ type: "teach", id: game.ui.focus, pupil: pu }); game.toast(pu ? "Teaching" : "Stopped"); }
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
  p.body.addEventListener("click", () => { lastAt = 0; });                  // a click that changes something refreshes at once
  p.update = () => {
    const { sim, ui } = game;
    const v = ui.focus ? sim.ents.get(ui.focus) : null;
    // 6.20: the text refreshes at about 4 Hz (and at once when the selection, the pause state or the tick-jump changes), so a number is readable before it changes
    const key = (v ? "v" + v.id + ":" + ui.sel.length : ui.other ? "o" + JSON.stringify(ui.other) : "-") + (game.state.paused ? "p" : "r"), nowMs = performance.now();
    if (key === lastKey && nowMs - lastAt < 240 && !game.ui.inspectorForce) return;
    lastKey = key; lastAt = nowMs;
    const setIco = (h) => { if (h !== lastIco) { lastIco = h; icoEl.innerHTML = h; } };
    const setBody = (h) => { if (h !== lastBody) { lastBody = h; morph(bodyEl, h); } };
    if (v) {
      p.show(true); p.setTitle(v.name); setIco(avatar(v.hue, v.lin, 20, !isAdult(sim, v)));
      nowEl.style.display = ""; now.update(v); setBody(villagerHtml(game, v)); return;
    }
    if (ui.other) {
      p.show(true);
      const o = otherHtml(game, ui.other);
      p.setTitle(o.title); setIco(svg("eye", 16)); nowEl.style.display = "none"; setBody(o.html); return;
    }
    p.show(false);
  };
  return p;
}

/** The old prose card, with its buttons and links taken out: it rides along hidden so every sentence is still on the page. */
function words(html) { return html.replace(/<button[\s\S]*?<\/button>/g, "").replace(/ data-act="[^"]*"/g, "").replace(/ data-test="[^"]*"/g, ""); }

function villagerHtml(game, v) {
  const { sim, ui } = game, age = ageDays(sim, v), fit = fitness(v, age), mh = maxHp(v, fit), kid = !isAdult(sim, v), elder = isElder(sim, v);
  let h = "", vr = "", selH = "";
  if (ui.sel.length > 1) {
    selH += `<div class="kin" data-test="selection">`;
    const CHIPS = 5;                                                          // S11: at 20-60 selected the chip list would fill the panel
    const shownIds = ui.sel.slice(0, CHIPS); if (ui.focus && !shownIds.includes(ui.focus)) shownIds.push(ui.focus);
    shownIds.forEach((id) => { const o = sim.ents.get(id); if (o) selH += `<button data-act="focus:${id}" class="${id === ui.focus ? "on" : ""}"${tipAttr(o.name)}>${avatar(o.hue, o.lin, 18, !isAdult(sim, o))}${id === ui.focus ? `<span class="nm">${esc(o.name.split(" ")[0])}</span>` : sr(o.name)}</button>`; });
    if (ui.sel.length > CHIPS) selH += `<span class="rel">+${ui.sel.length - CHIPS}</span>`;
    selH += `</div>`;
  }
  if (v.order && v.order.verb === "clear_area") h += `<div class="ins-head" data-sec="role" data-test="role"${tipAttr("Clear area\nJust following your instructions (X cancels)")}>${svg("cleararea", 16)}<b class="rl">Clear area</b></div>`;
  else if (v.as && ROLE[v.as.task]) h += `<div class="ins-head" data-sec="role" data-test="role"${tipAttr(ROLE[v.as.task].name + "\nKeeps at it until you reassign or cancel (X)")}>${svg(ROLE[v.as.task].icon, 16)}<b class="rl">${ROLE[v.as.task].name}</b>${v.as.done ? `<span class="rel">${v.as.done}</span>` : ""}</div>`;
  // life bar: child / adult / elder segments, a marker where they are
  const lifeFrac = Math.min(1, age / LIFE_DAYS);
  h += `<div class="ins-head" data-sec="life"><span class="cap lifecap">${{ child: "Child", adult: "Adult", elder: "Elder" }[lifeStage(sim, v)]}</span><span class="mt" style="flex:1;height:10px"${tipAttr(stageText(sim, v) + (elder ? " (past their prime)" : "") + "\n" + family(sim, v))}><i style="width:20%;background:var(--water);opacity:.55"></i><i style="left:20%;width:60%;background:var(--ok);opacity:.55"></i><i style="left:80%;width:20%;background:var(--cold);opacity:.55"></i><b class="mk" style="left:${(lifeFrac * 100).toFixed(1)}%;background:#fff;width:3px"></b></span>`
    + `<button class="btn ${ui.follow === v.id ? "on" : ""}" data-act="follow" data-test="follow"${tipAttr("Follow\nKeep the camera on them", "F")} aria-label="Follow">${svg("follow", 16)}<span class="bl">Follow</span></button>`
    + (v.poss ? `<button class="btn" data-act="release" data-test="release"${tipAttr("Release\nLet go of them", "Esc")} aria-label="Release">${svg("release", 16)}<span class="bl">Release</span></button>` : isAdult(sim, v) ? `<button class="btn" data-act="possess" data-test="possess"${tipAttr("Guide this villager\nWASD to walk, E to use what is next to you, Esc to let go", "Q")} aria-label="Guide">${svg("possess", 16)}<span class="bl">Guide</span></button>` : "")
    + `</div>`;
  // needs: four rings, health, mood
  h += `<div class="rings" data-sec="needs" data-test="needs">`;
  for (const [k, label] of NEEDS.slice(0, 4)) { const [soft, crit] = SOFT[k]; h += `<span class="rc">` + ring({ icon: NEED_ICON[k], v: v[k], soft, crit, px: 30, tip: `${label} ${pct(v[k])}\nUrgent below ${pct(soft)}, critical below ${pct(crit)}`, test: "need-" + k }) + `<span class="cap">${RING_CAP[k]}</span></span>`; }
  const hr = v.hp / mh;
  h += `<span class="rc">` + ring({ icon: "health", v: hr, soft: 0.6, crit: 0.3, px: 30, tip: `Health ${Math.round(v.hp)}/${Math.round(mh)}`, test: "need-health" }) + `<span class="cap">Health</span></span>`;
  h += `<span class="rc mood"${tipAttr(`Mood ${pct(v.mood)}`)}><span class="mrow">${svg(v.mood > 0.66 ? "mood-hi" : v.mood > SOFT.mood[0] ? "mood" : "mood-lo", 16)}${meter(v.mood, { color: "var(--energy)", marks: [{ at: SOFT.mood[0], cls: "soft" }, { at: SOFT.mood[1], cls: "crit" }], tip: `Mood ${pct(v.mood)}` })}</span><span class="cap">Mood</span></span></div>`;
  if (v.ill) {
    const help = [["sleep", "Rest", v.slp === 1], ["warmth", "A warm bed", v.warm > 0.55], ["tend", "A nurse", sim.ents.ofKind("villager").some(o => o.job && o.job.k === "tend_sick" && o !== v)], ["eat", "Cooked food", v.hunger > 0.5], ["jar", "A herbal remedy", false]];
    vr += `<div class="sick-row" data-test="sick"${tipAttr("Sick\n" + illLines(sim, v).join("\n"))}>${svg("sick", 18)}${ring({ icon: "health", v: v.ill.p, px: 24, tip: `Recovered ${pct(v.ill.p)}` })}<span class="help">${help.map(([ic, t, on]) => `<span class="${on ? "lit" : ""}"${tipAttr(t)}>${svg(ic, 16)}</span>`).join("")}</span></div>`;
  }
  // genes: nine columns round a centre line (1.00 = average); the notable ones sit in the middle
  const dev = TRAITS.map(k => ({ k, d: v.t[k] - 1 })).sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
  const mid = []; dev.forEach((q, i) => { if (i % 2 === 0) mid.push(q); else mid.unshift(q); });
  h += `<div class="gene" data-sec="genes" data-test="genes">` + mid.map(({ k, d }) => {
    const hgt = Math.min(50, Math.abs(d) / 0.25 * 50), tip = `${TRAIT_INFO[k].name} ${v.t[k].toFixed(2)} (${traitWord(k, v.t[k])})\n${TRAIT_INFO[k].what}`;
    return `<span class="gc ${Math.abs(d) > 0.12 ? "hi" : ""}"${tipAttr(tip)}><span class="zone">${d >= 0 ? `<i class="bpos" style="height:${hgt}%"></i>` : `<i class="bneg" style="height:${hgt}%"></i>`}</span>${svg(TRAIT_ICON[k], 12)}<span class="cap">${GENE_CAP[k]}</span></span>`;
  }).join("") + `</div>`;
  // skills: icon + rank pips (rust shown by a hatch)
  const pref = preferred(v);
  h += `<div class="skl" data-sec="skills" data-test="skills">` + SKILLS.map(s => {
    const l = level(v, s), rs = rustOf(v, s);
    const tip = SKILL_INFO[s].name + ": " + skillWord(l) + " (" + l.toFixed(2) + ")\n" + SKILL_INFO[s].what + (rs > 0.02 ? "\nRusty: unused for a long while, it has slipped from " + peakLevel(v, s).toFixed(2) : "");
    return `<span${tipAttr(tip)}>${svg(SKILL_ICON[s], 16)}<b class="rl">${SKILL_CAP[s]}</b>${rankPips(l, rs > 0.02)}${pref === s ? `<i class="star">${svg("star", 12)}</i>` : ""}</span>`;
  }).join("") + (v.carry ? `<span${tipAttr("Carrying " + v.carry.n + " " + itemName(v.carry.item))}>${svg("haul", 16)}<b class="rl">Carry ${v.carry.n}</b></span>` : "") + `</div>`;
  // kin: avatars with a relation glyph; friends and rivals by the bond tier
  const kin = sim.ents.ofKind("villager").filter(o => o !== v).map(o => [o, kinship(v, o), relationWord(v, o)]).filter(k => k[1] > 0 && k[2]);
  const rel = (v.rel || []).map(r => [sim.ents.get(r.o), r]).filter(q => q[0]);
  if (kin.length || rel.length || v.mate) {
    vr += `<div class="kin" data-test="kin">`;
    const seen = new Set();
    const one = (o, glyph, tip) => { if (seen.has(o.id)) return; seen.add(o.id); vr += `<button data-act="focus:${o.id}"${tipAttr(o.name + "\n" + tip)}>${avatar(o.hue, o.lin, 18, !isAdult(sim, o))}<span class="nm">${esc(o.name.split(" ")[0].slice(0, 8))}</span><span class="rel">${svg(glyph, 12)}</span></button>`; };
    const mate = v.mate ? sim.ents.get(v.mate) : null;
    if (mate) one(mate, "star", "Partner");
    for (const [o, k, w] of kin) one(o, w && /child|son|daughter/i.test(w) ? "sprout" : "people", w + (k >= 0.5 ? ", very close" : ""));
    for (const [o, r] of rel) one(o, r.k === "rival" ? "fear" : "check", TIER_WORD[r.k] + ": " + reasonLine(r, o.name));
    vr += `</div>`;
  }
  // memories (experiment, memory.js): up to 3 chips and the vivid episodes, as words; nothing when the slime has lived through nothing yet
  const chips = memChips(v), epis = episodeLines(v);
  if (chips.length || epis.length) vr += `<div class="mem" data-test="memories"><div class="sub">Memories</div>` + (chips.length ? `<p class="ttls">` + chips.map(c => `<span class="ttl"${tipAttr(c.tip)}>${esc(c.text)}</span>`).join(" ") + `</p>` : "") + (epis.length ? `<p class="dim">` + epis.map(esc).join(" · ") + `</p>` : "") + `</div>`;
  // what it believes (9.28, belief.js): icon + label + count per kind; a stale belief is faded and marked "?"
  const know = knowChips(v, sim.tick);
  if (know.length) vr += `<div class="knows" data-test="knows"><div class="sub">Knows</div><p class="ttls">` + know.map(c => `<span class="ttl kn${c.stale ? " stale" : ""}"${tipAttr(c.tip)}>${svg(c.icon, 12)} ${esc(c.label)} ${c.n}${c.stale ? "?" : ""}</span>`).join(" ") + `</p></div>`;
  // actions: teach / split
  const pupils = ui.sel.filter(id => id !== v.id).map(id => sim.ents.get(id)).filter(o => o && isAdult(sim, o));
  const acts = (isAdult(sim, v) && pupils.length ? pupils.slice(0, 2).map(o => { const on = !!(v.tch && v.tch.p === o.id && v.tch.u > sim.tick); return `<button class="btn${on ? " on" : ""}" data-act="teach:${on ? 0 : o.id}"${tipAttr((on ? "Stop teaching " : "Teach ") + o.name + "\nWork the same craft beside them and they learn 3x faster; you work at 80%. Give you both the same order (e.g. dig) so you end up side by side.")}>${svg("knowledge", 14)}${avatar(o.hue, o.lin, 16)}<span class="bl">${on ? "Teaching" : "Teach"} ${esc(o.name.split(" ")[0])}</span></button>`; }).join("") : "")
    + (isAdult(sim, v) ? splitButton(sim, v) : "");
  if (acts) vr += `<div class="actions">${acts}</div>`;
  // the old prose, hidden
  let w = `<div class="idrow"><b>${esc(stageText(sim, v))}</b>${elder ? " (past their prime)" : ""}<br><span>${esc(family(sim, v))}</span></div><div class="sub">Needs</div><div class="grid">`;
  for (const [k, label] of NEEDS) w += `<span>${label}</span><span>${pct(v[k])}</span>`;
  w += `<span>Health</span><span>${Math.round(v.hp)}/${Math.round(mh)}</span>` + (v.ill ? `<span>Sickness</span><span>${pct(v.ill.p)} recovered</span>` : "") + `</div>`;
  if (v.ill) w += `<div class="sub">Sick</div>` + illLines(sim, v).map(t => `<p>${esc(t)}</p>`).join("");
  else if (v.imm > sim.tick) w += `<p>Recovered lately: immune to the sickness for about ${Math.ceil((v.imm - sim.tick) / 1200)} more minutes at 1x.</p>`;
  w += `<div class="sub">Traits</div><div class="grid">` + TRAITS.map(k => `<span>${TRAIT_INFO[k].name}</span><span>${v.t[k].toFixed(2)} ${esc(TRAIT_INFO[k].what)} (${traitWord(k, v.t[k])})</span>`).join("") + `</div>`;
  w += `<div class="sub">Skills: <b>${esc(professionText(v))}</b></div><div class="grid">` + SKILLS.map(s => { const l = level(v, s), rs = rustOf(v, s); return `<span>${SKILL_INFO[s].name}${rs > 0.02 ? " rusty" : ""}${pref === s ? " (preferred craft)" : ""}</span><span>${skillWord(l)} ${l.toFixed(2)}. ${esc(SKILL_INFO[s].what)} Their gift for it is ${pct(aptitude(v, s))} of the way to the ceiling.</span>`; }).join("") + `</div>`;
  w += peopleHtml(game, v);
  w += `<div class="sub">Crafts known</div>`;
  const known = CRAFT_IDS.filter(c => famOf(v, c) > 0);
  if (!known.length) w += `<p>Nothing beyond foraging, gathering and knapping flint.</p>`;
  else for (const c of known) { const f = famOf(v, c), only = holders(sim, c).length === 1; w += `<p>${esc(CRAFTS[c].name)}: ${esc(famWord(f))} ${f.toFixed(2)}${only ? " (the only living villager who knows it)" : ""}. ${esc(CRAFTS[c].opens.join(", "))}</p>`; }
  if (v.tch) { const pu = sim.ents.get(v.tch.p); if (pu && v.tch.u > sim.tick) w += `<p>Teaching ${esc(pu.name)}: when they work the same craft side by side, ${esc(pu.name)} learns 3x faster and ${esc(v.name)} works at 80%.</p>`; }
  w += `<div class="kv"><span>Carrying</span><b>${v.carry ? v.carry.n + " " + esc(itemName(v.carry.item)) : "nothing"}</b><span>Bed</span><b>${esc(bedText(sim, v))}</b><span>Doing</span><b>${v.slp === 1 ? "sleeping" : v.job ? esc(v.job.k.replace("_", " ")) : "deciding"}</b><span>Order</span><b>${v.as && ROLE[v.as.task] ? esc(ROLE[v.as.task].name) + (v.as.done ? " (" + v.as.done + " done)" : "") : v.order ? esc(v.order.verb) + (v.order.done ? " (" + v.order.done + " done)" : "") : "none"}</b></div>`;
  return `<div class="fx">${h}</div><div class="vr" data-sec="more">${selH}${vr}<div class="sr" data-test="villager-words">${words(w)}</div></div>`;
}

/** S13: hobby, titles, heirloom, grief, relationships with their reasons, and kin. */
function peopleHtml(game, v) {
  const { sim } = game;
  let h = "";
  const hb = HOBBIES[hobbyOf(v)], hl = hobbyLevel(v);
  h += `<div class="sub">Free time</div><p><b>${esc(hobbyWord(hl))} ${esc(hb.doer)}</b> <span class="dim">(hobby ${hl.toFixed(2)}: ${esc(hb.name)} in their spare time lifts their mood a little; it makes nothing)</span>${v.action && v.action.type === "Wander" ? ` <span class="dim">Right now: ${esc(hb.verb)}.</span>` : ""}</p>`;
  if (v.ti && v.ti.length) h += `<p class="ttls"><b>Known as:</b> ${v.ti.map(t => `<span class="ttl">${esc(t)}</span>`).join(" ")}</p>`;
  if (v.hl) h += `<p title="An heirloom has no use, only a story."><b>Heirloom:</b> ${esc(v.hl.n)} <span class="dim">- kept by ${esc(v.hl.h.map(x => x.n).join(", then "))}</span></p>`;
  if (v.gr) { h += `<p class="warnline">Grieving ${esc(name(sim, v.gr.f) || "someone")}: ${Math.ceil((v.gr.u - sim.tick) / 1200)} more minute(s) at 1x. Lower mood and up to ${Math.round(v.gr.s * 5)}% less work.</p>`; }
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
  return `${ps}. Generation ${v.gen}, line ${v.lin + 1}` + (grand ? `, ${grand} known grandparent${grand === 1 ? "" : "s"}` : "") + (mate ? `. Partner: ${mate}` : "") + (kids ? `. ${kids} living ${kids === 1 ? "child" : "children"}` : "") + ".";
}

const isAdultV = (sim, v) => isAdult(sim, v);

function otherHtml(game, o) {
  const { sim } = game;
  if (o.kind === "room") return roomHtml(game, o.id);
  if (o.kind === "proom") return proomHtml(game, o);
  if (o.kind === "cell") { const c = cellInfo(sim, o.x, o.y, o.z); return { title: c.title, html: (c.pip ? `<p class="mana m${c.pip}" data-test="danger-pip" data-band="${c.pip}"><i></i>${esc(c.pipText)}</p>` : "") + c.lines.map(l => `<p>${esc(l)}</p>`).join("") }; }
  if (o.kind === "stock") {
    const z = sim.stock, s = survey(sim);
    let h = `<p>A ${z.x1 - z.x0 + 1} by ${z.y1 - z.y0 + 1} cell area where villagers keep food and materials. Holds ${zoneCapacity(z)} items in stacks of ${STACK_CAP}.` + (sim.zones.list.length ? ` With the ${sim.zones.list.length} extra zone${sim.zones.list.length === 1 ? "" : "s"} the village holds ${stockCapacity(sim)}.` : "") + `</p><div class="kv">`;
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
  if (e.kind === "item") h += `<span>Where</span><b>${stockZoneAt(sim, e.x, e.y, e.z) ? "in the stockpile" : "loose on the ground"}</b>` + (e.item === "berry" ? `<span>Spoils</span><b>${ITEMS.berry.spoil * 100}% a day (3% in winter)</b>` : "");
  if (e.kind === "plant" && e.nx > sim.tick && (e.species === "tuft" || e.species === "tuber" || e.species === "sapling" || (e.species === "berry" && e.yield < 4))) h += `<span>Regrows</span><b>in ${Math.max(1, Math.round((e.nx - sim.tick) / 1200))} min at 1x</b>`;
  if (e.kind === "furniture" && e.f === "bed") h += `<span>Owner</span><b>${esc(name(sim, e.owner) || "nobody yet")}</b>`;
  if (e.kind === "furniture" && e.f === "hearth") h += `<span>Fire</span><b>${e.lit ? "burning, heat level " + e.hl + " (" + LEVEL_NAME[e.hl] + ")" : "cold"}</b><span>Fuel left</span><b>${Math.round(e.fuel / 20)} s at 1x </b>`;
  const si = e.kind === "furniture" ? stationInfo(sim, e) : null;
  if (si) {
    h += `<span>State</span><b>${esc(si.state)}</b>`;
    for (const x of si.heat) h += `<span>With ${esc(x.fuelWord)}</span><b>${esc(x.levelName)} (level ${x.level}, P ${x.P.toFixed(2)})</b>`;
  }
  if (e.kind === "furniture" && e.f === "waterjar") h += `<span>Water</span><b>${e.fill} of 60 sips</b>`;
  if (holder) h += `<span>Claimed by</span><b>${esc(holder.name)}</b>`;
  h += `<span>Position</span><b>${e.x}, ${e.y}</b></div>`;
  if (e.kind === "furniture" && e.f === "board") {                                // 9.31: the notices as icon + count chips, a pin on a claimed one; nothing else
    const ch = noticeChips(e, sim.tick, (id) => name(sim, id));
    h += `<div class="knows" data-test="board-notes"><div class="sub">Notices</div><p class="ttls">` + (ch.length ? ch.map(c => `<span class="ttl kn${c.claimed ? " claimed" : ""}${c.old ? " stale" : ""}"${tipAttr(c.tip)}>${svg(c.icon, 12)} ${esc(c.text)}${c.who ? " <small>" + esc(c.who) + "</small>" : ""}${c.claimed ? " " + svg("pin", 11) : ""}</span>`).join(" ") : `<span class="dim">-</span>`) + `</p></div>`;
  }
  if (si || (e.kind === "furniture" && e.f === "hearth")) h += `<div class="btnrow"><button data-act="invest:${e.id}" title="Ask the selected villagers (or three adults) to try things out with what is in the stockpile, at this spot only. A standing job for three days.">Investigate here</button></div>`;
  if (si) {
    for (const x of si.heat) h += `<div class="sub">Heat with ${esc(x.fuelWord)}</div><ul class="rej">` + x.layout.map(t => `<li>${esc(t)}</li>`).join("") + x.steps.map(t => `<li class="warnline"><b>To get hotter:</b> ${esc(t)}</li>`).join("") + `</ul>`;
    if (si.note) h += `<div class="sub">Why heat 5 is hard</div><p class="dim">${esc(si.note)}</p>`;
    h += `<div class="sub">What it can make</div><ul class="rej">` + si.recipes.map(r => `<li><b>${esc(r.label)}:</b> ${r.ok ? "ready" : esc(r.why)}</li>`).join("") + `</ul>`;
  }
  const t = e.kind === "item" ? itemName(e.item) : e.kind === "plant" ? ({ tree: e.burn ? "Burning tree" : "Tree", berry: "Berry bush", tuft: "Grass tuft", tuber: "Tuber plant", sapling: "Sapling", stump: "Charred stump" })[e.species] : e.kind === "furniture" ? ({ bed: "Leaf bed", door: "Door", hearth: "Fire ring", kiln: "Pit kiln", mound: "Charcoal mound", workbench: "Workbench", bellows: "Bellows", waterjar: "Water jar", smoker: "Covered rack", forge: "Brick forge", shelf: "Shelf", board: "Notice board" })[e.f] || "Drying rack" : e.kind === "csite" ? "Planned piece" : e.kind === "flame" ? (e.src === "tree" ? "Burning tree" : "Smouldering stump") : "Site";
  return { title: t, html: h };
}

/** S10: a field cell: its stage, and the field it belongs to (crop choice, how far along it all is). */
function plotHtml(game, e) {
  const { sim } = game, f = fieldById(sim, e.fid), all = plotsOf(sim, e.fid);
  let h = `<p>${esc(plotLine(e))}</p><div class="kv">`;
  if (e.cr) {
    const st = cropStage(e);
    h += `<span>Crop</span><b>${esc(CROP[e.cr].label)}: ${esc(CROP_STAGE[st])}</b><span>Watered</span><b>${e.wt > sim.tick ? "yes, for " + Math.max(1, Math.round((e.wt - sim.tick) / DUR_DAY)) + " more day(s)" : "no - it grows at a quarter speed until a villager waters it"}</b>`;
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
    const age = Math.floor((sim.tick - (e.bd === undefined ? sim.tick : e.bd)) / DUR_DAY);
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

/** Split ×N with the predicted count, or the reason it cannot (1-3 words). */
function splitButton(sim, v) {
  const n = splitCount(sim, v), why = splitBlock(sim, v);
  return `<button class="btn" data-act="split" ${n ? "" : "disabled"}${tipAttr(n ? "Split ×" + n : "Cannot split\n" + why)} aria-label="Split">${svg("plus", 14)}${svg("people", 14)}<span class="bl">${n ? "Split ×" + n : "Split: " + why}</span></button>`;
}
