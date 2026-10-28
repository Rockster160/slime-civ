// Room evaluation (GDD §12.5): the purpose checklist and graded quality.
// Never a binary fail: an oversize or draughty room just scores lower.
import { World } from "./world.js";
import { village } from "./board.js";
import { once } from "./chronicle.js";

/** Purposes are data rows (§12.4). min/ideal/max are cell counts; oversize lowers size_fit, never refuses. */
export const PURPOSES = {
  shelter:  { label: "Shelter",  min: 4, ideal: 36, max: 64, blurb: "somewhere to sleep out of the cold" },
  workshop: { label: "Workshop", min: 6, ideal: 30, max: 48, blurb: "a roofed place to work in (no stations exist yet)" },
};
export const QUALITY_WORDS = [[0.35, "poor"], [0.6, "adequate"], [0.8, "good"], [2, "fine"]];
export const qualityWord = (q) => QUALITY_WORDS.find(([t]) => q < t)[1];

export function bedsIn(sim, room) {
  let n = 0;
  for (const f of sim.ents.ofKind("furniture")) if (f.f === "bed" && sim.rooms.cellRoom.get(World.idx(f.x, f.y, f.z)) === room) n++;
  return n;
}
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
const sizeFit = (n, p) => (n < p.min ? n / p.min : n <= p.ideal ? 1 : Math.max(0.5, 1 - 0.5 * (n - p.ideal) / (2 * p.max - p.ideal)));

/**
 * -> {n, purpose, checks:[{k, label, ok, note}], parts:{req, size, ins}, quality, word, beds, sleepers}
 * Checks shown for purpose "none" are the basics every room has to meet to warm anyone.
 */
export function evaluate(sim, room) {
  const pk = room.purpose === "none" ? "shelter" : room.purpose, P = PURPOSES[pk];
  const vl = village(sim), beds = bedsIn(sim, room);
  const sleepers = Math.max(1, Math.min(vl.n, room.n >> 1));
  const checks = [
    { k: "closed", label: "Closed in by walls and doors", ok: true, note: doorsOf(sim, room) + " door" + (doorsOf(sim, room) === 1 ? "" : "s") },
    { k: "roof", label: "Roofed", ok: room.enclosed, note: room.roofed + " of " + room.n + " cells have a roof" },
    { k: "size", label: "At least " + P.min + " cells", ok: room.n >= P.min, note: room.n + " cells" + (room.n > P.max ? " (large: " + P.max + " is comfortable)" : "") },
  ];
  if (room.purpose === "shelter") {
    const need = Math.ceil(sleepers / 2);
    checks.push({ k: "beds", label: "A bed for every two sleepers", ok: beds >= need, note: "have " + beds + ", need " + need + " (the room fits " + sleepers + ")" });
    checks.push({ k: "warm", label: "Keeps the cold out", ok: room.warm >= 0.2, note: "warmth +" + room.warm.toFixed(2) + " from insulation " + room.ins.toFixed(2) });
  } else if (room.purpose === "workshop") {
    checks.push({ k: "door", label: "A door", ok: doorsOf(sim, room) > 0, note: "" });
  }
  const req = checks.filter(c => c.ok).length / checks.length;
  const parts = { req, size: sizeFit(room.n, P), ins: Math.min(1, room.ins / 0.6) };
  const quality = Math.max(0, Math.min(1, 0.4 * parts.req + 0.25 * parts.size + 0.35 * parts.ins)) * (room.enclosed ? 1 : 0.6);
  return { n: room.n, purpose: room.purpose, checks, parts, quality, word: qualityWord(quality), beds, sleepers };
}

/** Chronicle firsts (§18): the first closed room, the first roofed shelter. Cheap; called every 100 ticks. */
export function roomMilestones(sim) {
  for (const r of sim.rooms.all()) {
    once(sim, "firstRoom", "BUILT_FIRST", "The first room was closed in: " + r.n + " cells" + (r.enclosed ? ", roofed." : ", still open to the sky."), [], { cells: r.n }, 1);
    if (r.enclosed && (r.purpose === "shelter" || bedsIn(sim, r) > 0)) {
      once(sim, "firstShelter", "MILESTONE", "The first enclosed shelter stands: " + r.n + " cells, " + bedsIn(sim, r) + " beds, warmth +" + r.warm.toFixed(2) + ".", [], { cells: r.n }, 2);
    }
  }
}
