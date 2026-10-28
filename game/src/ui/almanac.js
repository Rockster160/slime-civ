// The Almanac and Curiosities (GDD §15.6): what the settlement knows, who holds it and how surely, what was tried, what is nagging
// at it. No research screen: nothing here can be clicked to "unlock" anything. `almanac(sim)` is pure (tests/discovery.js reads it);
// the panel only renders it. Near-miss hints are directional and never name the product.
import { CRAFTS, CRAFT_IDS, PHENOMENA, LOOKS, GRAPH, ERA_SHELTER } from "../sim/phenomena.js";
import { holders, famWord, eraOf, evidenceOf, erasHeld, can } from "../sim/knowledge.js";
import { hints } from "../sim/discovery.js";
import { LEVEL_NAME } from "../sim/heat.js";
import { esc, createPanel } from "./dom.js";
import { dateOf, SEASON_NAMES } from "../sim/clock.js";
import { ERA_FLOW, ERA_RANK } from "../sim/phenomena.js";
import { thisWorld } from "../sim/depth.js";
import { svg, ERA_LETTER } from "./icons.js";

const when = (sim, t) => { const d = dateOf(t); return "year " + d.year + ", " + SEASON_NAMES[d.season].toLowerCase(); };

/** -> {era, known:[{id,name,short,opens,era,holders:[{id,name,f,word}],risk}], lost:[{id,name,since,evidence}], deadEnds:[text], hints:[text], curios:[{text,hint}], trace:[..], seen} */
export function almanac(sim) {
  const d = sim.disc, known = [], lost = [];
  for (const id of CRAFT_IDS) {
    const C = CRAFTS[id], hs = holders(sim, id);
    if (hs.length) {
      const first = sim.chron.entries.find(e => e.data && e.data.craft === id && e.kind === "DISCOVERY");
      known.push({ id, name: C.name, short: C.short, opens: C.opens, era: C.era, since: first ? when(sim, first.t) : "", risk: hs.length === 1,
        holders: hs.map(v => ({ id: v.id, name: v.name, f: v.fam[id], word: famWord(v.fam[id]) })).sort((a, b) => b.f - a.f || a.id - b.id) });
    } else if (d.lost[id] !== undefined) lost.push({ id, name: C.name, since: when(sim, d.lost[id]), evidence: evidenceOf(sim, id) > 0 });
  }
  const deadEnds = d.dead.slice().sort((a, b) => b.t - a.t).map(e => deadText(e));
  const hs = hints(sim).map(h => h.text);
  const curios = d.curio.map(c => ({ text: c.text, hint: PHENOMENA[c.row] ? PHENOMENA[c.row].nearMiss : "", where: c.x + "," + c.y }));
  const era = eraOf(sim), held = erasHeld(sim), reached = d.eras || {};
  // the era flow in K10 order, each with whether it is held now, when it was first reached and in which place in the order the village found them
  const order = Object.keys(reached).sort((a, b) => reached[a] - reached[b] || ERA_RANK[a] - ERA_RANK[b]);
  const flow = ERA_FLOW.map(n => ({ name: n, now: n === era, held: held.includes(n), past: !!era && ERA_RANK[n] < ERA_RANK[era], at: reached[n] !== undefined ? when(sim, reached[n]) : "", nth: order.indexOf(n) + 1, shelter: ERA_SHELTER[n] || "" }));
  // the authored graph of twelve (GDD 15.7): known / open / not yet; unknown rows are not named (never the answer key)
  const graph = GRAPH.map(r => {
    const got = r.crafts.filter(c => can(sim, c)), open = r.after.every(c => can(sim, c));
    return { n: r.n, state: got.length ? "known" : open ? "open" : "closed", name: got.length ? r.name : "", needs: got.length ? "" : open ? "the village has what it takes to find this: " + r.needs : "needs something else first",
      partial: got.length > 0 && got.length < r.crafts.length, crafts: got.map(c => CRAFTS[c].short) };
  });
  return { era, flow, order, graph, known, lost, deadEnds, hints: hs, curios, trace: d.trace, seen: Object.keys(d.seen), world: thisWorld(sim) };
}

const VERB_TEXT = { heat: "heated", leave: "left in", hit: "struck", soak: "soaked", bury: "buried", mix: "mixed", press: "pressed", bind: "bound" };
const ST_TEXT = { flame: "the burning tree", hearth: "the fire ring", ember: "old coals", pit: "a pit fire", hand: "bare hands" };
const WITH_TEXT = { log: "wood", charcoal: "black coal", stick: "sticks" };
function deadText(e) {
  const what = (LOOKS[e.item] || e.item) + (e.w ? " with " + (WITH_TEXT[e.w] || e.w) : "");
  return "Tried " + what + " " + (e.st === "hand" ? "(" + (VERB_TEXT[e.verb] || e.verb) + ", bare hands)" : "(" + (VERB_TEXT[e.verb] || e.verb) + " by " + (ST_TEXT[e.st] || e.st) + ", " + (LEVEL_NAME[e.lvl] || "").toLowerCase() + ")") + ": nothing" + (e.n > 1 ? ", " + e.n + " times" : "") + ".";
}

function traceLine(t) {
  const f = (k, v) => (v === undefined ? "" : " " + k + " " + v);
  if (t.k === "tinker") return "t" + t.t + " tinker " + t.who + " " + (t.item || "") + "/" + (t.verb || "") + " @" + t.site + (t.row ? " -> " + t.row : "") + (t.ok ? " FIRED" : t.near ? " near-miss (" + t.near + ")" : " dead end");
  return "t" + t.t + " " + t.k + " " + t.who + " " + t.row + " @" + t.site + f("sal", t.sal) + f("att", t.att) + f("int", t.int) + f("pr", t.pr) + f("jit", t.jit) + " = " + t.w + (t.ok ? " sticks" : " missed");
}

export function createAlmanacPanel(parent, game, opts = {}) {
  const p = createPanel(parent, "almanac", "Almanac", { open: false, icon: "knowledge", flat: !!opts.flat });
  p.body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-v]"); if (t) { const id = Number(t.dataset.v); if (game.sim.ents.get(id)) game.selectOnly(id, true); }
    if (e.target.closest("[data-trace]")) game.ui.showTrace = !game.ui.showTrace;
    const inv = e.target.closest("[data-invest]");
    if (inv) {
      const ids = game.ui.sel.filter(id => game.sim.ents.get(id));
      if (!ids.length) game.toast("Select one to three villagers first, then press Investigate.");
      else { game.sim.apply({ type: "investigate", ids: ids.slice(0, 3) }); game.toast("Investigating: " + ids.slice(0, 3).map(id => game.sim.ents.get(id).name).join(", ") + " will try things out for three days (a standing job)."); }
    }
    if (e.target.closest("[data-uninvest]")) game.sim.apply({ type: "investigate", ids: [] });
  });
  p.update = () => {
    const { sim, ui } = game, a = almanac(sim);
    p.setHint(a.era ? a.era + " age" : "");
    let h = `<div class="alm-era">${a.era ? `<b>${esc(a.era)} age</b> <span class="dim">(set by the highest craft a living villager knows)</span>` : `<span class="dim">No age yet - the village knows no craft beyond foraging, gathering and knapping flint.</span>`}</div>`;
    h += `<div class="alm-flow" style="display:flex;gap:4px;align-items:center" data-test="era-track">` + a.flow.map(x => `<span class="era-b ${x.now ? "on" : ""}" style="${x.held || x.now ? "color:var(--tx)" : ""}" data-tip="${esc(x.name + (x.at ? "\nreached " + x.at + (x.nth ? " (number " + x.nth + " found)" : "") + (x.shelter ? "; shelter: " + x.shelter : "") : "\nnot reached yet" + (x.shelter ? " (" + x.shelter + ")" : "")))}">${esc(ERA_LETTER[x.name] || x.name.slice(0, 2))}</span>`).join(svg("chev-r", 12)) + `<span class="sr">${a.flow.map(x => esc(x.name)).join(" → ")}</span></div>`;
    if (a.order.length) h += `<div class="dim alm-ord">In the order found: ${a.order.map(n => esc(n)).join(", then ")}.</div>`;
    if (a.world.on) {                                            // S14: what is particular about this seed (OD-22)
      h += `<div class="sub alm-world">This world <span class="dim">(every seed bends its materials by up to 10%)</span></div>`;
      h += a.world.props.length ? `<ul class="rej alm-props">` + a.world.props.map(x => `<li class="${x.pct > 0 ? "up" : "down"}">${esc(x.text)}</li>`).join("") + `</ul>` : `<p class="dim">Nothing here departs far from the usual.</p>`;
      h += `<ul class="rej alm-facts">` + a.world.facts.map(t => `<li>${esc(t)}</li>`).join("") + `</ul>`;
    }
    h += `<div class="sub">The twelve <span class="dim">(known / open / not yet)</span></div><div class="alm-graph">` + a.graph.map(g => `<div class="alm-g ${g.state}" title="${esc(g.name ? g.crafts.join(", ") : g.needs)}"><b>${g.n}</b> ${g.state === "known" ? esc(g.name) + (g.partial ? " (partly)" : "") : g.state === "open" ? "<i>something to find</i>" : "<i>not yet</i>"}</div>`).join("") + `</div>`;
    h += `<div class="sub">Crafts the village knows</div>`;
    if (!a.known.length) h += `<p class="dim">Nothing yet. New abilities appear when villagers see something happen or try things out; you cannot research them.</p>`;
    for (const c of a.known) {
      h += `<div class="alm-craft"><b>${esc(c.name)}</b>${c.era ? ` <span class="dim">${esc(c.era)} age</span>` : ""}${c.risk ? ` <span class="alm-risk" title="Only one living villager knows this. If they die before teaching it, the craft is lost.">only one knows</span>` : ""}`
        + `<div class="dim">${c.since ? esc("first " + c.since + ". ") : ""}Opens: ${esc(c.opens.join(", "))}</div>`
        + `<div class="alm-holders">` + c.holders.map(x => `<button data-v="${x.id}" title="${esc(x.name + ": familiarity " + x.f.toFixed(2))}">${esc(x.name)} <span class="dim">${esc(x.word)} ${x.f.toFixed(2)}</span></button>`).join("") + `</div></div>`;
    }
    for (const l of a.lost) h += `<div class="alm-craft lost"><b>${esc(l.name)}</b> <span class="alm-risk">lost</span><div class="dim">The last person who knew it died (${esc(l.since)}). ${l.evidence ? "What they built still stands, so working near it should bring it back much faster." : "It will have to be found again."}</div></div>`;
    h += `<div class="sub">Curiosities <span class="dim">(seen, not understood)</span></div>`;
    if (!a.curios.length) h += `<p class="dim">Nothing is nagging at anyone right now.</p>`;
    for (const c of a.curios) h += `<div class="alm-curio">${esc(c.text)}${c.hint ? `<div class="dim">Hint: ${esc(c.hint)}</div>` : ""}</div>`;
    if (a.hints.length) { h += `<div class="sub">After a few failures</div>`; for (const t of a.hints) h += `<div class="alm-curio dim">${esc(t)}</div>`; }
    h += `<div class="sub">Tried, nothing came of it</div>`;
    if (!a.deadEnds.length) h += `<p class="dim">No failed experiments yet.</p>`;
    else h += `<ul class="rej">` + a.deadEnds.slice(0, 8).map(t => `<li>${esc(t)}</li>`).join("") + (a.deadEnds.length > 8 ? `<li class="dim">...and ${a.deadEnds.length - 8} more</li>` : "") + `</ul>`;
    const ask = sim.disc.ask && sim.disc.ask.until > sim.tick ? sim.disc.ask : null;
    h += `<div class="btnrow"><button data-invest="1" title="Select one to three villagers, then press this: they try things out with what is in reach for three days, as a standing job (it never beats food or shelter).">Investigate (selected)</button>${ask ? `<button data-uninvest="1">Stop investigating</button> <span class="dim">${ask.ids.map(id => sim.ents.get(id) ? esc(sim.ents.get(id).name) : "").filter(Boolean).join(", ")} working on it</span>` : ""}</div>`;
    if (game.dev) h += `<div class="btnrow"><button data-trace="1" data-test="trace-btn" class="${ui.showTrace ? "on" : ""}" title="Debug: the last discovery rolls with every factor">${ui.showTrace ? "Hide" : "Show"} discovery trace (debug)</button></div>`;
    if (ui.showTrace) h += `<pre class="alm-trace">` + (a.trace.slice(-16).reverse().map(t => esc(traceLine(t))).join("\n") || "no rolls yet") + `</pre>`;
    p.html(h);
  };
  return p;
}
