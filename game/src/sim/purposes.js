// Room purposes as data (GDD §12.4-12.5, S15). A leaf module (it imports only the world), so villager.js, items.js and fire.js can read
// what a room is for without an import cycle. roomeval.js wraps `evalPurpose` with the village's size and keeps the chronicle firsts.
//
// A purpose row: {label, min/ideal/max cells, blurb, needs:[check ids], icon}. A check id picks a builder from CHECKS; adding a purpose is adding a row
// (and, for a new effect, a function below). Quality is graded 0..1 from the share of checks met, the size fit and the insulation; never a fail.
//   shelter   beds for the sleepers and warmth (the S4a room)
//   workshop  a door and a workbench: crafting at the bench inside gets the room-quality bonus (craft.js)
//   bedroom   beds inside rest better and lift the mood; a warm room; partners share one
//   storage   shelves; a room-stockpile (items.js): what is kept in it spoils slower the better the room
//   kitchen   a fire ring inside; the cook job (jobs.js genCook) turns raw food into more, longer-lasting food; eating by its fire is worth more
import { World } from "./world.js";
import { clamp } from "./util.js";

export const PURPOSES = {
  shelter:  { label: "Shelter",  min: 4, ideal: 36, max: 64, needs: ["beds", "warm"], blurb: "somewhere to sleep out of the cold" },
  workshop: { label: "Workshop", min: 6, ideal: 30, max: 48, needs: ["door", "bench"], blurb: "a roofed place to work in; needs a workbench. Crafting at a bench inside it gets the room-quality bonus (up to +-15% on quality)" },
  bedroom:  { label: "Bedroom",  min: 4, ideal: 16, max: 30, needs: ["door", "bedsFit", "warm"], blurb: "beds in a warm closed room: sleepers rest better and wake in a better mood, more so the better the room. Partners share one" },
  storage:  { label: "Storage",  min: 6, ideal: 30, max: 60, needs: ["door", "shelves"], blurb: "a room that is a stockpile: shelves on the floor, a door to keep the weather and pests out. Food and hides kept here spoil slower, the better the room" },
  kitchen:  { label: "Kitchen",  min: 6, ideal: 20, max: 36, needs: ["door", "hearth", "warm"], blurb: "a fire ring inside a closed room. Villagers cook raw meat and tubers here (a job) into more food that keeps longer, and a meal eaten by its fire is worth more" },
};
export const PURPOSE_ORDER = ["shelter", "bedroom", "kitchen", "storage", "workshop"];
export const PURPOSE_ICON = { none: "", shelter: "⌂", bedroom: "☾", kitchen: "♨", storage: "▤", workshop: "⚒" };
export const QUALITY_WORDS = [[0.35, "poor"], [0.6, "adequate"], [0.8, "good"], [2, "fine"]];
export const qualityWord = (q) => QUALITY_WORDS.find(([t]) => q < t)[1];

/** What the effects scale with (best guesses; the user's balance pass tunes them). */
export const BEDROOM_REST = 0.25;       // sleeping in a bedroom restores energy this much faster, at quality 1
export const BEDROOM_MOOD = 0.5;        // mood per day while asleep there, at quality 1
export const PARTNER_MOOD = 0.4;        // and per day more when the partner sleeps in the same room
export const STORE_SAVE = 0.5;          // storage: the spoilage a perfect room saves (a quality-0 room saves a tenth of that)
export const KITCHEN_EAT = 0.2;         // a meal eaten beside a kitchen's fire is worth up to this much more
export const SHELF_EVERY = 6;           // cells of a storage room per shelf asked for
export const BED_EVERY = 4;             // cells of a bedroom per bed asked for

const FURN_COUNT = { bed: "beds", workbench: "benches", shelf: "shelves", hearth: "hearths" };
/** One pass over the furniture: {beds, benches, shelves, hearths, lit} standing in `room`. */
export function inventory(sim, room) {
  const o = { beds: 0, benches: 0, shelves: 0, hearths: 0, lit: 0 }, fs = sim.ents.ofKind("furniture"), cr = sim.rooms.cellRoom;
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i], k = FURN_COUNT[f.f];
    if (!k || cr.get(World.idx(f.x, f.y, f.z)) !== room) continue;
    o[k]++;
    if (f.f === "hearth" && f.lit) o.lit++;
  }
  return o;
}
export const bedsIn = (sim, room) => inventory(sim, room).beds;
export const benchesIn = (sim, room) => inventory(sim, room).benches;
export const shelvesIn = (sim, room) => inventory(sim, room).shelves;
export function doorsOf(sim, room) {
  const seen = new Set();
  for (const c of room.cells) {
    const [x, y, z] = World.xyz(c);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const id of sim.ents.at(x + dx, y + dy, z)) {
      const e = sim.ents.get(id);
      if (e.kind === "furniture" && e.f === "door") seen.add(e.id);
    }
  }
  return seen.size;
}
export const sizeFit = (n, p) => (n < p.min ? n / p.min : n <= p.ideal ? 1 : Math.max(0.5, 1 - 0.5 * (n - p.ideal) / (2 * p.max - p.ideal)));

const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
/** Check builders: (c) -> {k, label, ok, note}; c = {room, doors, inv, sleepers}. */
const CHECKS = {
  door: (c) => ({ k: "door", label: "A door", ok: c.doors > 0, note: "" }),
  bench: (c) => ({ k: "bench", label: "A workbench", ok: c.inv.benches > 0, note: c.inv.benches ? c.inv.benches + " in the room" : "none yet: build one (build mode > Workbench)" }),
  beds: (c) => { const need = Math.ceil(c.sleepers / 2); return { k: "beds", label: "A bed for every two sleepers", ok: c.inv.beds >= need, note: "have " + c.inv.beds + ", need " + need + " (the room fits " + c.sleepers + ")" }; },
  bedsFit: (c) => { const need = Math.max(1, Math.floor(c.room.n / BED_EVERY)); return { k: "beds", label: "A bed for every " + BED_EVERY + " cells", ok: c.inv.beds >= need, note: "have " + c.inv.beds + ", need " + need }; },
  shelves: (c) => { const need = Math.max(1, Math.ceil(c.room.n / SHELF_EVERY)); return { k: "shelves", label: "A shelf for every " + SHELF_EVERY + " cells", ok: c.inv.shelves >= need, note: "have " + c.inv.shelves + ", need " + need + (c.inv.shelves ? "" : " (build mode > Shelf)") }; },
  hearth: (c) => ({ k: "hearth", label: "A fire ring inside", ok: c.inv.hearths > 0, note: c.inv.hearths ? (c.inv.lit ? "lit" : "not lit now: villagers tend it when it is cold or they cook") : "none yet: build a fire ring in the room" }),
  warm: (c) => ({ k: "warm", label: "Keeps the cold out", ok: c.room.warm >= 0.2, note: "warmth +" + c.room.warm.toFixed(2) + " from insulation " + c.room.ins.toFixed(2) }),
};

/**
 * -> {n, purpose, checks:[{k, label, ok, note}], parts:{req, size, ins}, quality, word, beds, sleepers, shelves, hearths}
 * Checks shown for purpose "none" are the basics every room has to meet to warm anyone. `sleepers` is how many the village could put in the room.
 */
export function evalPurpose(sim, room, sleepers = 1) {
  const pk = room.purpose === "none" ? "shelter" : room.purpose, P = PURPOSES[pk] || PURPOSES.shelter;
  const doors = doorsOf(sim, room), inv = inventory(sim, room), c = { room, doors, inv, sleepers };
  const checks = [
    { k: "closed", label: "Closed in by walls and doors", ok: true, note: doors + " door" + (doors === 1 ? "" : "s") },
    { k: "roof", label: "Roofed", ok: room.enclosed, note: room.roofed + " of " + room.n + " cells have a roof" },
    { k: "size", label: "At least " + P.min + " cells", ok: room.n >= P.min, note: room.n + " cells" + (room.n > P.max ? " (large: " + P.max + " is comfortable)" : "") },
  ];
  if (room.purpose !== "none") for (const id of P.needs) checks.push(CHECKS[id](c));
  const req = checks.filter(k => k.ok).length / checks.length;
  const parts = { req, size: sizeFit(room.n, P), ins: Math.min(1, room.ins / 0.6) };
  const quality = Math.max(0, Math.min(1, 0.4 * parts.req + 0.25 * parts.size + 0.35 * parts.ins)) * (room.enclosed ? 1 : 0.6);
  return { n: room.n, purpose: room.purpose, checks, parts, quality, word: qualityWord(quality), beds: inv.beds, sleepers, shelves: inv.shelves, hearths: inv.hearths, lit: inv.lit };
}

// ---- the effects ----------------------------------------------------------------------------------------------------------------

/** Quality 0..1 of the closed bedroom a sleeping villager lies in (in a bed), or -1. */
export function bedroomQ(sim, v) {
  if (v.slp !== 1 || v.rest !== 2) return -1;
  const r = sim.rooms.at(v.x, v.y, v.z);
  return r && r.enclosed && r.purpose === "bedroom" ? evalPurpose(sim, r).quality : -1;
}
/** Is v's partner asleep in the same bedroom? */
export function partnerBeside(sim, v) {
  if (!v.mate) return false;
  const o = sim.ents.get(v.mate);
  return !!(o && o.slp === 1 && sim.rooms.at(o.x, o.y, o.z) === sim.rooms.at(v.x, v.y, v.z));
}

/** The room a storage cell belongs to, or null: a closed, roofed room with the Storage purpose. */
export function storageRoomAt(sim, x, y, z) {
  const r = sim.rooms.cellRoom.get(World.idx(x, y, z));
  return r && r.purpose === "storage" && r.enclosed ? r : null;
}
/** The multiplier on a stored item's spoilage in a storage room of this quality: 1 - 0.5 x (0.1 + 0.9 q). */
export const storageMul = (q) => 1 - STORE_SAVE * (0.1 + 0.9 * clamp(q, 0, 1));

/** The kitchen (a closed room with the Kitchen purpose) holding a hearth within reach of a cell, or null. */
export function kitchenAt(sim, h) {
  const r = sim.rooms.cellRoom.get(World.idx(h.x, h.y, h.z));
  return r && r.purpose === "kitchen" && r.enclosed ? r : null;
}
