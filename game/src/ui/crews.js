// The Crews panel (GDD §07, R6): name the selected villagers, give the crew a default task, see its stall summary in one line, and recall or disband it.
// All it sends is {type:"crew", ...} (sim/crews.js). Hotkeys: Ctrl+1..9 gives the selected crew (or a new one from the selection) that number,
// Alt+1..9 selects that crew (again: look at it). Plain 1..9 stay the speed keys.
import { isAdult } from "../sim/villager.js";
import { CHORES, CHORE_LABEL, taskText, crewOf } from "../sim/crews.js";
import { itemName } from "./text.js";
import { crewSummary, idleAdults, crewsLine } from "./crewtext.js";
import { VERBS } from "./orders.js";
import { createPanel, esc } from "./dom.js";

const ORDER_VERBS = VERBS.filter(v => v.verb !== "capture");

export function createCrewsPanel(parent, game) {
  const p = createPanel(parent, "crews", "Crews");
  p.body.innerHTML = `<div class="cr-make"><input class="cr-name" type="text" maxlength="24" placeholder="Crew name"> <button data-c="make" title="Name the selected villagers as a crew">Make crew</button></div>`
    + `<div class="cr-tools btnrow"><button data-c="idle" title="Select every adult with nothing to do right now, to name them a crew or give them an order">Select all idle</button><button data-c="fold" title="Fold or unfold every crew card">Fold all</button></div><div class="cr-total dim"></div><div class="cr-list"></div>`;
  const nameIn = p.body.querySelector(".cr-name"), list = p.body.querySelector(".cr-list"), makeBtn = p.body.querySelector("[data-c=make]");
  const idleBtn = p.body.querySelector("[data-c=idle]"), foldBtn = p.body.querySelector("[data-c=fold]"), total = p.body.querySelector(".cr-total");
  const fold = game.ui.crewFold = game.ui.crewFold || { all: null, open: {} };       // all: null = auto (fold when there are many), true/false = the player's choice; open: crew id -> the player opened/closed this one
  const MANY = 5;                                                                    // from this many crews the cards start folded to one line
  const isFolded = (c, n) => (c.id in fold.open ? !fold.open[c.id] : fold.all === null ? n > MANY : fold.all);
  nameIn.addEventListener("keydown", (e) => e.stopPropagation());
  const sel = () => game.ui.sel.map(id => game.sim.ents.get(id)).filter(v => v && isAdult(game.sim, v));
  const crewOfId = (id) => game.sim.crews.list.find(c => c.id === id);

  /** Ctrl+N / Alt+N (input.js calls these). */
  game.crewAssignKey = (n) => {
    const { sim } = game, vs = sel();
    if (!game.unlocked("crews")) { game.toast("Crews appear once the village has " + 9 + " people or has sent an expedition."); return; }
    if (!vs.length) { game.toast("Select villagers first, then Ctrl+" + n + " names them a crew on key " + n + "."); return; }
    const first = crewOf(sim, vs[0]);
    if (first && vs.every(v => v.cr === first.id)) { sim.apply({ type: "crew", op: "hotkey", id: first.id, hk: n }); game.toast(first.name + " is on Alt+" + n + "."); }
    else if (sim.apply({ type: "crew", op: "make", name: "Crew " + (sim.crews.n + 1), ids: vs.map(v => v.id), hk: n })) game.toast("Crew " + sim.crews.n + " made, on Alt+" + n + ".");
  };
  game.crewKey = (n) => {
    const c = game.sim.crews.list.find(q => q.hk === n);
    if (!c) { game.toast("No crew on Alt+" + n + ". Select villagers and press Ctrl+" + n + "."); return; }
    const same = game.ui.sel.length === c.ids.length && c.ids.every(id => game.ui.sel.includes(id));
    game.selectMany(c.ids.slice());
    game.ui.focus = c.ids[0] || 0;
    if (same && c.ids.length) game.locate({ ...game.sim.ents.get(c.ids[0]), id: 0 });
  };

  p.body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-c]"); if (!t) return;
    const [a, arg] = t.dataset.c.split(":"), sim = game.sim, id = Number(arg), c = crewOfId(id);
    if (a === "make") {
      const vs = sel();
      if (!vs.length) { game.toast("Select villagers first (click or drag a box), then name them."); return; }
      if (sim.apply({ type: "crew", op: "make", name: nameIn.value.trim() || undefined, ids: vs.map(v => v.id) })) { game.toast("Crew made: " + sim.crews.list[sim.crews.list.length - 1].name + " (" + vs.length + ")."); nameIn.value = ""; }
      return;
    }
    if (a === "idle") {
      const ids = idleAdults(sim).map(v => v.id);
      if (!ids.length) { game.toast("Nobody is idle right now."); return; }
      game.selectMany(ids); game.toast(ids.length + " idle " + (ids.length === 1 ? "villager" : "villagers") + " selected.");
      return;
    }
    if (a === "fold") {
      const n = sim.crews.list.length, nowFolded = sim.crews.list.every(q => isFolded(q, n));
      fold.all = !nowFolded; fold.open = {};
      p.update();
      return;
    }
    if (a === "tog") { const n = sim.crews.list.length, cur = isFolded(c || { id }, n); fold.open[id] = cur; p.update(); return; }
    if (!c) return;
    if (a === "sel") game.selectMany(c.ids.slice());
    else if (a === "ren") { if (nameIn.value.trim()) { sim.apply({ type: "crew", op: "rename", id, name: nameIn.value.trim() }); nameIn.value = ""; } else game.toast("Type the new name in the box at the top first."); }
    else if (a === "dis") { sim.apply({ type: "crew", op: "disband", id }); game.toast(c.name + " disbanded: its members are free villagers again."); }
    else if (a === "rec") {
      if (c.task && c.task.t === "exp") sim.apply({ type: "expedition", op: "recall", crew: id });
      else sim.apply({ type: "crew", op: "recall", id });
      game.toast(c.name + " is coming back to camp.");
    } else if (a === "add") { const ids = sel().map(v => v.id).filter(q => !c.ids.includes(q)); if (ids.length) sim.apply({ type: "crew", op: "add", id, ids }); else game.toast("Select villagers who are not in this crew first."); }
  });
  list.addEventListener("change", (e) => {
    const s = e.target.closest("select[data-task]"); if (!s) return;
    const id = Number(s.dataset.task), c = crewOfId(id), sim = game.sim, [kind, arg] = s.value.split(":");
    if (!c) return;
    if (kind === "none") sim.apply({ type: "crew", op: "task", id, task: null });
    else if (kind === "chore") sim.apply({ type: "crew", op: "task", id, task: { t: "chore", g: arg } });
    else if (kind === "keep") sim.apply({ type: "crew", op: "task", id, task: { t: "keep", item: arg } });
    else if (kind === "order") {                                        // aim it: the next map click orders the crew and becomes its default task
      game.selectMany(c.ids.slice()); game.ui.targeting = arg; game.ui.crewTarget = id;
      game.toast("Click the map to " + arg + ": that becomes " + c.name + "'s default task (Esc stops).");
    }
    if (kind !== "order") { const t = sim.crews.list.find(q => q.id === id); game.toast(t && t.task ? c.name + " now prefers " + taskText(t.task) + "." : c.name + " has no default task."); }
  });

  p.update = () => {
    const { sim } = game, L = sim.crews.list, vs = sel();
    p.show(game.unlocked("crews") && (L.length > 0 || vs.length > 0));
    p.setHint(L.length ? String(L.length) : "");
    makeBtn.textContent = vs.length ? "Make crew of " + vs.length : "Make crew";
    let h = L.length ? "" : `<p class="dim">Select villagers and press Make crew to name them and give them a default task. Most play never needs this: select and right-click already works.</p>`;
    const keeps = sim.board.keeps;
    const nCrews = L.length;
    for (const c of L) {
      const folded = isFolded(c, nCrews);
      if (folded) {
        h += `<div class="crew folded" data-id="${c.id}"><div class="idrow"><button class="cr-chev" data-c="tog:${c.id}" title="Unfold">\u25B8</button> <b>${esc(c.name)}</b> <span class="dim">${c.ids.length} ${c.ids.length === 1 ? "member" : "members"}${c.hk ? ", Alt+" + c.hk : ""}</span> <button data-c="sel:${c.id}" title="Select the members">Select</button></div><div class="cr-sum" data-sum="${c.id}"></div></div>`;
        continue;
      }
      const cur = !c.task ? "none:" : c.task.t === "chore" ? "chore:" + c.task.g : c.task.t === "keep" ? "keep:" + c.task.item : c.task.t === "order" ? "order:" + c.task.verb : "none:";
      const opts = [`<option value="none:">No default task</option>`]
        .concat(CHORES.map(g => `<option value="chore:${g}">Prefer ${CHORE_LABEL[g]}</option>`))
        .concat(keeps.map(k => `<option value="keep:${k.item}">Standing order: keep ${esc(itemName(k.item))}</option>`))
        .concat(ORDER_VERBS.map(v => `<option value="order:${v.verb}">Order: ${v.label.toLowerCase()} (click the map)</option>`));
      h += `<div class="crew" data-id="${c.id}"><div class="idrow"><button class="cr-chev" data-c="tog:${c.id}" title="Fold">\u25BE</button> <b>${esc(c.name)}</b> <span class="dim">${c.ids.length} ${c.ids.length === 1 ? "member" : "members"}${c.hk ? ", Alt+" + c.hk : ""}</span></div>`
        + `<div class="cr-task dim">Task: ${esc(taskText(c.task))}</div><div class="cr-sum" data-sum="${c.id}"></div>`
        + `<select data-task="${c.id}" title="The crew's default task. An order is given to every member; a chore or a standing order is a preference inside their normal work.">${opts.join("").replace(`value="${cur}"`, `value="${cur}" selected`)}</select>`
        + `<div class="btnrow"><button data-c="sel:${c.id}">Select</button><button data-c="add:${c.id}" title="Add the selected villagers to this crew">Add selected</button><button data-c="ren:${c.id}" title="Rename to the text in the box at the top">Rename</button><button data-c="rec:${c.id}" title="Members drop their orders and walk back to camp (an expedition turns for home)">Recall</button><button data-c="dis:${c.id}" title="Release the members; they keep working as usual">Disband</button></div></div>`;
    }
    p.setHint(L.length ? String(L.length) : "");
    total.textContent = L.length ? crewsLine(sim) : "";
    const idle = idleAdults(sim).length;
    idleBtn.textContent = "Select all idle (" + idle + ")"; idleBtn.disabled = !idle;
    foldBtn.style.display = L.length > 1 ? "" : "none"; foldBtn.textContent = L.every(q => isFolded(q, nCrews)) ? "Unfold all" : "Fold all";
    if (list._h !== h) { list._h = h; list.innerHTML = h; }
    for (const c of L) { const el = list.querySelector(`[data-sum="${c.id}"]`); if (el) { const t = crewSummary(sim, c).line; if (el.textContent !== t) el.textContent = t; } }
  };
  return p;
}
