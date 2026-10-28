// Help overlay (H or ?): the controls and a six-line "how to play".
import { esc } from "./dom.js";

const CONTROLS = [
  ["Click", "inspect a villager, plant, item, bed or the stockpile"],
  ["Drag a box", "select several villagers (Shift adds)"],
  ["Right-click", "order the selected villagers: tree = chop, bush = forage, grass = gather, loose items = haul, ground = move"],
  ["Tab / Shift-Tab", "next / previous villager"],
  ["F or double-click", "follow the selected villager"],
  ["Esc", "clear selection, stop targeting, close this"],
  ["Space", "pause"],
  ["1-9", "speed: 1 2 3 4 5 = 1x-5x, 6 = 10x, 7 = 25x, 8 = 50x, 9 = MAX (as fast as the page can go). Top bar has the same buttons"],
  ["Next morning / Next season / Until something happens", "top bar: fast-forward at MAX, stopping early on a death, a finished build, a villager in trouble, winter or (for the last one) any chronicle entry. Esc or a click stops it. Off while guiding a villager"],
  ["Q or the Possess button", "guide the selected villager: WASD walk (hold), E or click uses what is next to you, C eat, V drink, N sleep, G put down, Esc release. Speed is capped at 2x"],
  ["Middle-drag, WASD, arrows", "pan (Shift = faster); right-drag also pans"],
  ["Wheel, 0, [ ]", "zoom, fit the map, change the viewed level"],
  ["B", "build mode: plan walls, floors, roofs, doors, beds and racks; Deconstruct takes finished pieces down (about 75% of materials back); Erase removes plans; Dig, Capture a blueprint, stamp x N. R rotates a stamp, E erases, [ ] changes level. Click a walled and roofed space with no door to see why it is not a room yet"],
  ["Z / L / T", "overlays: stockpile and beds / job targets of the selected / warmth"],
  ["P", "hide or show all panels"],
  ["Shift-S, Shift-O", "save to / load from this browser (Game menu: file download and upload)"],
];
const HOW = [
  "You are the village's hand, not its brain: click a slime to see what it is doing and why, right-click things to give orders (chop a tree, forage a bush, haul, dig).",
  "Left alone they eat, drink, sleep, forage, gather grass and build leaf beds and drying racks. Set keep-N targets on the stock bars (Village panel) and idle hands will stockpile logs, sticks or grass.",
  "Food: berries only grow in spring to autumn and spoil; dried berries keep. In winter the only food is the stockpile and a little root-digging, so watch the food days in the top bar from midsummer.",
  "Shelter: the cold of winter kills. Build (B) a closed, roofed room (wattle walls, thatch roof, a DOOR, beds), click inside it and set its purpose to Shelter. Rooms only count once the door is in.",
  "Possess (Q) one slime to do a job yourself, or to reach what the AI will not. Everything it can do is what the AI can do; you add judgement and a small speed bonus.",
  "Speed up with 1-9 or the skip buttons (Next morning / season); Esc stops. They stop for deaths, finished builds and winter, and the chronicle tells the story.",
];

export function createHelp(root, game) {
  root.innerHTML = `<div class="helpcard"><button class="hclose">Close (H)</button><h2>Slime Civ</h2><h3>How to play</h3><ol>${HOW.map(t => `<li>${esc(t)}</li>`).join("")}</ol>
    <h3>Controls</h3><table>${CONTROLS.map(([k, d]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(d)}</td></tr>`).join("")}</table></div>`;
  root.addEventListener("click", (e) => { if (e.target === root || e.target.closest(".hclose")) game.ui.help = false; });
  return { update() { root.style.display = game.ui.help ? "flex" : "none"; } };
}
