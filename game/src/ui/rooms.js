// The room inspector (GDD §12.5): size, warmth, a purpose picker and the checklist
// with tick/cross marks, plus a quality word. Plain HTML string, like the other panels.
import { esc } from "./dom.js";
import { evaluate, PURPOSES } from "../sim/roomeval.js";
import { World } from "../sim/world.js";
import { provisionalRoom } from "../sim/proom.js";

export function roomHtml(game, id) {
  const { sim } = game, room = sim.rooms.list.get(id);
  if (!room) return { title: "Gone", html: `<p class="dim">That room is no longer there.</p>` };
  const ev = evaluate(sim, room);
  let h = `<p>${room.enclosed ? "An enclosed, roofed room." : room.roofed ? "Closed in, but part of the roof is missing." : "Closed in by walls but open to the sky."} ${room.n} cells.</p>`;
  h += `<div class="sub">What is it for?</div><div class="btnrow purposes">`;
  for (const k of ["none", "shelter", "workshop"]) {
    h += `<button data-act="purpose:${k}" class="${room.purpose === k ? "on" : ""}" title="${esc(k === "none" ? "No purpose assigned" : PURPOSES[k].blurb)}">${esc(k === "none" ? "None" : PURPOSES[k].label)}</button>`;
  }
  h += `</div><div class="sub">Checklist</div><ul class="checks">`;
  for (const c of ev.checks) h += `<li class="${c.ok ? "ok" : "no"}"><b>${c.ok ? "✓" : "✗"}</b> ${esc(c.label)}${c.note ? ` <span class="dim">- ${esc(c.note)}</span>` : ""}</li>`;
  h += `</ul>`;
  h += `<div class="kv"><span>Quality</span><b class="q-${ev.word}">${esc(ev.word)}</b>`;
  h += `<span>Warmth</span><b>${room.enclosed ? "+" + room.warm.toFixed(2) + " to anyone inside (insulation " + room.ins.toFixed(2) + ")" : "none until it is closed in and roofed"}</b>`;
  h += `<span>Beds</span><b>${ev.beds}</b><span>Inside now</span><b>${[...sim.ents.ofKind("villager")].filter(v => sim.rooms.cellRoom.get(World.idx(v.x, v.y, v.z)) === room).length}</b></div>`;
  h += `<p class="dim">Quality is graded, never a fail: size, insulation and what the room has all count a little. Villagers sleep in warm rooms when it turns cold.</p>`;
  return { title: (room.purpose === "none" ? "Room" : PURPOSES[room.purpose].label) + " (" + ev.word + ")", html: h };
}

/** Click handler for the buttons above; returns true if handled. */
export function roomAct(game, act, arg) {
  if (act !== "purpose" || !game.ui.other || game.ui.other.kind !== "room") return false;
  const room = game.sim.rooms.list.get(game.ui.other.id);
  if (!room) return true;
  const [x, y, z] = World.xyz(room.cells[0]);
  game.sim.apply({ type: "purpose", x, y, z, p: arg });
  // the room keeps its id (lowest cell) because a purpose change does not move walls
  return true;
}

/** The "almost a room" card: walls and a roof enclose a space except for a door gap. */
export function proomHtml(game, o) {
  const pr = provisionalRoom(game.sim, o.x, o.y, o.z);
  if (!pr) return { title: "Room", html: `<p class="dim">This is a room now, or no longer one. Click it again.</p>` };
  const g = pr.gaps.map(([x, y]) => x + ", " + y).join(" and ");
  const h = `<p><b>Not a room yet - needs a door to close.</b> Walls and a roof surround these ${pr.cells.length} cells, but ${pr.gaps.length === 1 ? "one cell is" : "two cells are"} still open at ${esc(g)}.</p>`
    + (pr.planned ? `<p>A door is planned there; once villagers finish it the room appears and you can give it a purpose.</p>`
      : `<p>Plan a Door (Build mode) on the gap, or wall it up. Rooms only count once they are fully closed - a door closes the gap.</p>`)
    + `<p class="dim">Only a closed, roofed room keeps people warm.</p>`;
  return { title: "Almost a room", html: h };
}
