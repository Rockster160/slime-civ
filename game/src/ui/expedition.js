// The expedition card (GDD §13.4, S8): send the selected villagers to find something, watch the crew (members, target, status, stall reason),
// and call them back. All it does is send commands: {type:"expedition", op:"start"|"recall"}; the sim does the rest (expedition.js).
import { isAdult, maxHp, fitness, ageDays } from "../sim/villager.js";
import { EXP_N, EXP_TIME, WANT_LABEL, activeExp } from "../sim/expedition.js";
import { esc, bar, needColor, createPanel } from "./dom.js";
import { blockerText, EXP_WHY, itemName } from "./text.js";

const ITEMS_ASK = [["flint", "Flint"], ["clay", "Clay"], ["malachite", "Malachite"], ["any", "Anything new"]];

export function createExpeditionPanel(parent, game) {
  const p = createPanel(parent, "exp", "Expeditions");
  const crew = () => game.ui.sel.map(id => game.sim.ents.get(id)).filter(v => v && isAdult(game.sim, v) && !v.xp && !v.poss);
  p.body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t || t.disabled) return;
    const [a, arg] = t.dataset.act.split(":"), sim = game.sim;
    if (a === "go") {
      const ids = crew().map(v => v.id);
      if (sim.apply({ type: "expedition", op: "start", ids, item: arg })) game.toast("Expedition away: " + ids.length + (ids.length === 1 ? " villager" : " villagers") + " to find " + WANT_LABEL[arg] + ".");
      else game.toast("They cannot go: " + blockerText("mine", sim.lastBlocker || "NO_TARGET"));
    } else if (a === "recall") { sim.apply({ type: "expedition", op: "recall", id: Number(arg) }); game.toast("Recall: the crew is coming home."); }
    else if (a === "again") {
      const x = sim.exp.list.find(q => q.id === Number(arg)), ids = x ? x.ids.filter(id => { const v = sim.ents.get(id); return v && !v.xp; }) : [];
      if (x && sim.apply({ type: "expedition", op: "start", ids, item: x.item })) game.toast("Sent again for " + WANT_LABEL[x.item] + ".");
    } else if (a === "focus") game.selectOnly(Number(arg), true);
  });
  p.update = () => {
    const { sim } = game, list = sim.exp.list, sel = crew();
    p.show(list.length > 0 || sel.length > 0);
    let h = "";
    if (sel.length) {
      h += `<div class="sub">Send ${sel.length} selected ${sel.length === 1 ? "villager" : "villagers"} to find:</div><div class="btnrow">`;
      for (const [k, label] of ITEMS_ASK) h += `<button data-act="go:${k}" title="${k === "any" ? "The material the village has least of" : "Dig toward " + label.toLowerCase() + " at least 3 levels down"}. They carry on like any villager (eat, sleep, flee) and turn back when it is found, someone is hurt below half, food or time runs out.">${label}</button>`;
      h += `</div><p class="dim">The village carries on without them. Autonomy never sends anyone out.</p>`;
    }
    for (const x of list.slice().reverse()) {
      const act = x.st !== "done", vs = x.ids.map(id => sim.ents.get(id)).filter(Boolean);
      h += `<div class="expcard"><div class="idrow"><b>Find ${esc(WANT_LABEL[x.item])}${x.item === "any" ? " (" + esc(itemName(x.want)) + ")" : ""}</b></div>`;
      h += `<div class="chips">` + vs.map(v => {
        const r = v.hp / maxHp(v, fitness(v, ageDays(sim, v)));
        return `<button data-act="focus:${v.id}" title="${esc(v.name)}: ${esc(v.job ? v.job.k.replace("_", " ") : "idle")}"><i style="background:hsl(${v.hue},75%,62%)"></i>${esc(v.name)}${r < 0.5 ? " +" : ""}${(v.fear || 0) > 0.6 ? " !" : ""}</button>`;
      }).join("") + `</div>`;
      if (act) {
        const left = Math.max(0, x.deadline - sim.tick);
        h += `<div class="kv"><span>Status</span><b>${x.st === "work" ? "out, digging toward it" : "heading home: " + esc(EXP_WHY[x.why])}</b>`;
        h += `<span>Found</span><b>${x.got} of ${EXP_N}${x.depth ? ", " + x.depth + " levels down" : ""}</b>`;
        if (x.st === "work") h += `<span>Time left</span><b>${(left / 1800).toFixed(1)} of ${(EXP_TIME / 1800).toFixed(1)} days</b>`;
        h += `<span>Stalled?</span><b>${x.stall ? esc(x.stall === "UNSAFE" ? "someone is afraid: a thornback is close, so they ran" : blockerText("mine", x.stall)) : "no"}</b></div>`;
        if (x.st === "work") h += `<div class="btnrow"><button data-act="recall:${x.id}" title="Call the crew home now">Recall</button></div>`;
      } else {
        h += `<p>${esc(x.rep)}</p><div class="btnrow"><button data-act="again:${x.id}" ${vs.length ? "" : "disabled"}>Send again</button></div>`;
      }
      h += `</div>`;
    }
    p.html(h);
  };
  return p;
}
