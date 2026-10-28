// Room evaluation (GDD §12.5): the purpose checklist and graded quality.
// Never a binary fail: an oversize or draughty room just scores lower. The purposes themselves are data rows in purposes.js (a leaf module the
// needs, storage and cooking code can read); this wraps them with the village's size (how many sleepers a room could hold) and the chronicle firsts.
import { village } from "./board.js";
import { once } from "./chronicle.js";
import { PURPOSES, QUALITY_WORDS, qualityWord, bedsIn, benchesIn, doorsOf, evalPurpose } from "./purposes.js";

export { PURPOSES, QUALITY_WORDS, qualityWord, bedsIn, benchesIn, doorsOf };

/**
 * -> {n, purpose, checks:[{k, label, ok, note}], parts:{req, size, ins}, quality, word, beds, sleepers, ...}
 * Checks shown for purpose "none" are the basics every room has to meet to warm anyone.
 */
export function evaluate(sim, room) {
  const vl = village(sim);
  return evalPurpose(sim, room, Math.max(1, Math.min(vl.n, room.n >> 1)));
}

/** Chronicle firsts (§18): the first closed room, the first roofed shelter. Cheap; called every 100 ticks. */
export function roomMilestones(sim) {
  for (const r of sim.rooms.all()) {
    once(sim, "firstRoom", "BUILT_FIRST", "The first room was closed in: " + r.n + " cells" + (r.enclosed ? ", roofed." : ", still open to the sky."), [], { cells: r.n }, 1);
    if (r.enclosed && (r.purpose === "shelter" || bedsIn(sim, r) > 0)) {
      once(sim, "firstShelter", "MILESTONE", "The first enclosed shelter stands: " + r.n + " cells, " + bedsIn(sim, r) + " beds, warmth +" + r.warm.toFixed(2) + ".", [], { cells: r.n }, 2);
    }
    if (r.enclosed && r.purpose !== "none" && r.purpose !== "shelter" && r.purpose !== "workshop") {
      once(sim, "firstRoom_" + r.purpose, "MILESTONE", "The first " + PURPOSES[r.purpose].label.toLowerCase() + " was set up: " + r.n + " cells.", [], { cells: r.n, purpose: r.purpose }, 1);
    }
  }
}
