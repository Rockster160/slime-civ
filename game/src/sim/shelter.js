// The shelter ladder (GDD §12.10, K10): leaf bed -> hide teepee -> timber cabin -> dressed stone / brick. There is no "house tier" tech node. The same house
// is simply redrawn in the materials at hand, and the village offers a design for each material class once someone can work it: a stamp in the Blueprints
// panel (the player can swap its wall material when stamping, or capture their own). Better wall materials insulate better (world.js MAT.ins, read by
// rooms.js), so the room is warmer and scores higher (roomeval.js). Nothing here forces a rebuild; a blueprint revision (S11) can push a new design to old houses.
import { can } from "./knowledge.js";
import { once } from "./chronicle.js";

/** One design per rung. wall/roof/floor are BMAT keys (build.js); craft = what a living villager must know before the design appears. */
export const SHELTERS = [
  { key: "teepee", craft: "HIDE_WORKING", name: "Hide teepee", w: 4, h: 4, wall: "hide", roof: "hideroof", floor: "", beds: 2, line: "hide stretched on poles" },
  { key: "stonehut", craft: "DRESS_STONE", name: "Dressed-stone hut", w: 5, h: 4, wall: "dressed", roof: "logroof", floor: "", beds: 2, line: "squared stone" },
  { key: "cabin", craft: "FRAMING", name: "Timber cabin", w: 5, h: 5, wall: "timber", roof: "logroof", floor: "plank", beds: 2, line: "framed timber" },
  { key: "brickhouse", craft: "KILN", name: "Brick house", w: 5, h: 5, wall: "brick", roof: "logroof", floor: "plank", beds: 2, line: "fired brick" },
];

/** The cells of a design: a wall ring with a door in the middle of the south side, a roof (and floor) over the inside, beds in the back row. */
export function designCells(s) {
  const cells = [], dx = s.w >> 1, dy = s.h - 1;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const edge = x === 0 || y === 0 || x === s.w - 1 || y === s.h - 1;
    if (edge) { if (x === dx && y === dy) cells.push([x, y, "door", ""]); else cells.push([x, y, "wall", s.wall]); continue; }
    if (s.floor) cells.push([x, y, "floor", s.floor]);
    cells.push([x, y, "roof", s.roof]);
  }
  for (let i = 0; i < s.beds; i++) cells.push([1 + i, 1, "bed", ""]);
  return cells;
}

/** Daily: add the design for every rung the village can now build (once each; the player may delete it from the library). */
export function shelterBlueprints(sim) {
  const d = sim.disc;
  if (!d.bpp) d.bpp = {};
  for (const s of SHELTERS) {
    if (d.bpp[s.key] !== undefined || !can(sim, s.craft)) continue;
    d.bpp[s.key] = sim.tick;
    sim.bps.list.push({ id: ++sim.bps.n, name: s.name, w: s.w, h: s.h, cells: designCells(s), auto: 0, rev: 1 });
    once(sim, "design_" + s.key, "MILESTONE", "The village can now raise a " + s.name.toLowerCase() + " (" + s.line + "): the design is in the Blueprints panel.", [], { design: s.key }, 1);
  }
}
