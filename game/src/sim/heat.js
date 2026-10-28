// The heat function (GDD §11.9, K8): fuel x enclosure x draft -> a level 0..5. Pure arithmetic first
// (tests/heat.js enumerates the layouts the GDD names), then a reader that builds the same inputs
// from the cells and furniture around a station.
//
//   P = H x E x D
//   H  fuel heat value: brush/grass 1.0, sticks and wood 1.6, charcoal 2.4, coal 3.0
//   E  = 1 + 0.10 x sum(ins) over the FIVE faces of the fire cell (four sides + the cell above; the floor does not count)
//   D  = product of draft factors, capped at 1.5: bellows 1.3, vent hole / open flue 1.25, windy ridge open to the sky 1.3,
//        smoke-bound room 0.7, sealed cell (five solid faces, no vent) 0.5
//   level = highest row of LEVELS whose threshold P reaches. Wood faces burn, so they cap a fire at level 2.
//
// No Math.pow/exp/sin: only + - * /, so it is safe inside the sim.
import { M, F, MAT } from "./world.js";

export const FUEL_H = { grass: 1.0, stick: 1.6, log: 1.6, charcoal: 2.4, coal: 3.0, dried_peat: 1.6 };
export const FUEL_CAP = { dried_peat: 3 };      // S14: dried peat burns like wood but never past the Kiln level, whatever the draft and lining
/** Insulation of one face of the fire cell (GDD §11.9). "lid_vent" = a clay lid with one vent hole. */
export const FACE_INS = { air: 0, wood: 0.4, soil: 0.6, stone: 0.6, daub: 0.8, lined: 1.0, lid_vent: 0.5 };
export const DRAFT_X = { bellows: 1.3, vent: 1.25, ridge: 1.3, smoke: 0.7, sealed: 0.5 };
export const D_CAP = 1.5;
export const WOOD_CAP = 2;                       // wood faces burn: no level above 2
/** [level, name, P at least] */
export const LEVELS = [[0, "Ambient", 0], [1, "Warm", 0.4], [2, "Hearth", 1.2], [3, "Kiln", 2.1], [4, "Furnace", 4.0], [5, "Forge", 5.5]];
export const LEVEL_NAME = LEVELS.map(l => l[1]);

/** E from five face kinds. */
export function enclosure(faces) {
  let s = 0;
  for (const f of faces) s += FACE_INS[f] ?? 0;
  return 1 + 0.1 * s;
}

/**
 * D from the draft flags {bellows, vent, ridge, smoke} and the faces. A fire cell is sealed when every one of its five
 * faces is solid and none is a vent: that starves it (x0.5). A "lid_vent" face is itself a vent.
 */
export function draftFactor(d, faces) {
  d = d || {};
  const vent = !!d.vent || faces.includes("lid_vent");
  const sealed = faces.length === 5 && faces.every(f => f !== "air") && !vent;
  let x = 1;
  if (d.bellows) x *= DRAFT_X.bellows;
  if (vent) x *= DRAFT_X.vent;
  if (d.ridge) x *= DRAFT_X.ridge;
  if (d.smoke) x *= DRAFT_X.smoke;
  if (sealed) x *= DRAFT_X.sealed;
  return Math.min(D_CAP, x);
}

export function levelOf(P) {
  const p = Math.round(P * 1e6) / 1e6;
  let lv = 0;
  for (const [l, , at] of LEVELS) if (p >= at) lv = l;
  return lv;
}

/**
 * layout = {fuel: "stick"|"charcoal"|..., faces: [5 face kinds], draft?: {bellows, vent, ridge, smoke}}.
 * Returns {H, E, D, P, level, capped} (capped: wood faces held it at 2).
 */
export function heat(layout) {
  const H = FUEL_H[layout.fuel] ?? 0, faces = layout.faces;
  const E = enclosure(faces), D = draftFactor(layout.draft, faces);
  const P = H * E * D;
  let level = levelOf(P), capped = false;
  if (level > WOOD_CAP && faces.includes("wood")) { level = WOOD_CAP; capped = true; }
  if (FUEL_CAP[layout.fuel] !== undefined && level > FUEL_CAP[layout.fuel]) { level = FUEL_CAP[layout.fuel]; capped = true; }
  return { H, E, D, P, level, capped };
}

// ---- reading the world -----------------------------------------------------------------------------------------------

/**
 * Cell material -> face kind. S7b: add the clay-lined / fired-clay / brick cell materials here ("lined"); a natural clay
 * bank counts as daub (0.8). Anything not listed and solid counts as stone.
 */
export const FACE_OF_MAT = {
  [M.AIR]: "air", [M.WATER]: "air",
  [M.WATTLE]: "wood", [M.LOGWALL]: "wood", [M.LOGROOF]: "wood", [M.THATCH]: "wood",
  [M.GRASS]: "soil", [M.DIRT]: "soil", [M.SAND]: "soil", [M.DIRTFLOOR]: "soil",
  [M.CLAY]: "daub",
  [M.PEAT]: "soil", [M.HERB]: "soil",
  [M.HIDEWALL]: "wood", [M.HIDEROOF]: "wood", [M.TIMBERWALL]: "wood", [M.PLANKFLOOR]: "wood",       // S9: skin and timber burn (a wood face caps a fire at level 2)
  [M.BRICKWALL]: "lined",                                                                              // fired brick counts as a lining (GDD §11.9: 1.0)
};

/** The face kind of the cell at x,y,z: a door counts as wood, otherwise by material. */
export function faceKind(sim, x, y, z) {
  for (const id of sim.ents.at(x, y, z)) { const e = sim.ents.get(id); if (e.kind === "furniture" && e.f === "door") return "wood"; }
  const m = sim.world.mat(x, y, z);
  if (FACE_OF_MAT[m] !== undefined) return FACE_OF_MAT[m];
  return MAT[m] && MAT[m].solid ? "stone" : "air";
}

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * The five faces around a station cell. A station entity may carry `lid`: 0 none (open top), 1 a lid, 2 a lid with a vent
 * hole, which replaces the cell above.
 */
export function stationFaces(sim, e) {
  if (e.f === "mound") return ["soil", "soil", "soil", "soil", "soil"];            // S7b: an earth-covered pit is sealed on all five faces (GDD §11.9: P = 1.6 x 1.3 x 0.5 = 1.04, a smoulder)
  if (e.f === "forge") return ["lined", "lined", "lined", "lined", "lid_vent"];  // S9: a brick furnace with its own lid and flue: E 1.45, and the flue is a vent (x1.25); it still needs a bellows or a windy ridge to reach the Forge level
  const f = SIDES.map(([dx, dy]) => (e.f === "kiln" ? "lined" : faceKind(sim, e.x + dx, e.y + dy, e.z)));     // S7b: a kiln is a clay-lined pit: its four sides are lined whatever surrounds it
  f.push(e.lid === 2 ? "lid_vent" : e.lid === 1 ? "lined" : faceKind(sim, e.x, e.y, e.z + 1));
  return f;
}

/** Draft flags for a station: bellows beside it, a vent lid, a windy ridge open to the sky, a smoke-bound room. */
export function stationDraft(sim, e) {
  const w = sim.world, d = {};
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    for (const id of sim.ents.at(e.x + dx, e.y + dy, e.z)) { const o = sim.ents.get(id); if (o.kind === "furniture" && o.f === "bellows") d.bellows = true; }
  }
  if (e.lid === 2 || e.f === "forge") d.vent = true;
  let sky = true;
  for (let k = 1; k <= 3; k++) if (w.isSolid(e.x, e.y, e.z + k)) sky = false;
  if (sky && (w.flags(e.x, e.y, e.z - 1) & F.RIDGE)) d.ridge = true;
  const room = sim.rooms.at(e.x, e.y, e.z);
  if (room && room.enclosed && !e.lid && e.f !== "forge") {
    let open = false;                                   // "no window or vent cell within 3 cells": a door is the only opening there is
    for (let dy = -3; dy <= 3 && !open; dy++) for (let dx = -3; dx <= 3 && !open; dx++) {
      for (const id of sim.ents.at(e.x + dx, e.y + dy, e.z)) { const o = sim.ents.get(id); if (o.kind === "furniture" && o.f === "door") open = true; }
    }
    if (!open) d.smoke = true;
  }
  return d;
}

/** Heat of a station burning `fuel` right now, from the cells around it. Seam for S7b: kiln, charcoal mound and furnace all call this. */
export function stationHeat(sim, e, fuel) {
  return heat({ fuel, faces: stationFaces(sim, e), draft: stationDraft(sim, e) });
}

/**
 * Why a station is as hot as it is, and what it would take to be hotter (the station inspector, GDD "explain why a craft is unavailable").
 * -> {fuel, level, name, P, H, E, D, capped, want, steps:[sentence..], layout:[sentence..]}. `want` = the level the caller needs (default: the next one up).
 */
export function heatReport(sim, e, fuel, want) {
  const faces = stationFaces(sim, e), draft = stationDraft(sim, e), r = heat({ fuel, faces, draft });
  const target = want || Math.min(5, r.level + 1), need = LEVELS[target][2];
  const steps = [], layout = [];
  const fuelName = { grass: "dry grass", stick: "sticks", log: "logs", charcoal: "charcoal", coal: "coal" }[fuel] || fuel;
  const forge = e.f === "forge";
  layout.push("Fuel: " + fuelName + " (" + r.H.toFixed(1) + ")");
  layout.push("Walls: " + (faces.every(f => f === "lined") ? "clay-lined all round" : faces.slice(0, 4).join(", ")) + (e.f === "mound" ? " (earth over everything)" : "") + "; top: " + faces[4].replace("lid_vent", "lid with a vent").replace("air", "open"));
  const dr = [];
  if (draft.bellows) dr.push("a bellows beside it"); if (draft.ridge) dr.push("a windy ridge"); if (draft.vent || faces.includes("lid_vent")) dr.push("a vent"); if (draft.smoke) dr.push("smoke-bound room (x0.7)");
  layout.push("Draft: " + (dr.length ? dr.join(", ") : "none") + (r.D < 1 ? " (x" + r.D.toFixed(2) + ")" : r.D > 1 ? " (x" + r.D.toFixed(2) + ")" : ""));
  if (r.level >= target) return { fuel, ...r, name: LEVEL_NAME[r.level], want: target, steps, layout };
  if (r.capped || faces.includes("wood")) steps.push("a wood face (a roof or wall of wood) burns: it caps the fire at the Hearth level. Open the top or use stone.");
  if (fuel !== "charcoal" && fuel !== "coal" && target >= 4) steps.push("wood never gets past the Kiln level: this needs charcoal" + (target >= 5 ? " at the very least, and coal for the Forge level" : "") + ".");
  else if (fuel === "charcoal" && target >= 5) steps.push("charcoal tops out at the Furnace level, even in a lidded, vented furnace with every draft: the Forge level needs coal (3.0 against 2.4).");
  const unlinedSides = faces.slice(0, 4).filter(f => f !== "lined").length;
  if (unlinedSides && e.f !== "mound" && target >= 3) steps.push("the walls are not clay-lined (" + faces.slice(0, 4).filter(f => f !== "lined").join(", ") + "): a clay-lined pit holds the heat in.");
  const sealed = faces.length === 5 && faces.every(f => f !== "air") && !draft.vent && !faces.includes("lid_vent");
  if (sealed && e.f !== "mound") steps.push("it is sealed with no vent: the fire is starved of air. Give the lid a vent.");
  if (forge && !draft.bellows && !draft.ridge && target >= 5) steps.push("the flue gives only one draft source: put a bellows beside the forge, or build it on the windy ridge (two draft sources reach the cap, x1.5).");
  else if (r.D < 1.25 && !sealed) steps.push("needs draft: a bellows beside it, or an open flue on a windy ridge.");
  else if (!draft.bellows && !draft.ridge && !draft.vent && target >= 4) steps.push("needs draft: a bellows beside it, or move it onto a windy ridge.");
  if (draft.smoke) steps.push("the room it stands in is smoke-bound (a door is the only opening): put it outside or by a door.");
  if (!steps.length) steps.push("P = " + r.P.toFixed(2) + ", level " + target + " (" + LEVEL_NAME[target] + ") needs " + need.toFixed(1) + ".");
  return { fuel, ...r, name: LEVEL_NAME[r.level], want: target, steps, layout };
}
