// 10.2 the autumn save (year-day 72, three days before winter; 12 villagers of every age, 8 beds) left alone for 6 game days. One run, five short checks:
// the village stocks food and wood for winter, nobody dies of thirst, the beds are kept, progress is at most slight (author, 2026-10-30), and with no bed
// free births slow to a trickle. Caps come from the tuning constants (WINTER_BANK, WOOD_BANK), not from a day length.
//   node tests/natural_autumn.js   (about 7 s)
import assert from "node:assert/strict";
import { natural } from "./natural_lib.js";
import { WINTER_BANK } from "../src/sim/local.js";
import { WOOD_BANK } from "../src/sim/jobs.js";

const r = natural("autumn", 6);
console.log("autumn:", JSON.stringify(r.start), "->", JSON.stringify(r.end), "births", r.births, "deaths", JSON.stringify(r.causes));
assert.ok(r.start.runway >= 0.4 * WINTER_BANK, "food days per head banked before winter: " + r.start.runway + " of the " + WINTER_BANK + " wanted");
assert.ok(r.end.runway >= r.start.runway, "the larder grows as winter nears, it does not drain: " + r.start.runway + " -> " + r.end.runway);
assert.ok(r.end.wood > r.start.wood && r.end.wood >= 0.2 * WOOD_BANK, "wood is being banked: " + r.start.wood + " -> " + r.end.wood + " of the " + WOOD_BANK + " wanted");
console.log("ok 1 stocks: " + r.start.runway + " -> " + r.end.runway + " food days per head, wood " + r.start.wood + " -> " + r.end.wood);
assert.ok(!r.causes.thirst, "nobody dies of thirst: " + JSON.stringify(r.causes));
console.log("ok 2 no thirst deaths");
assert.ok(r.end.beds >= r.start.beds, "beds are not lost: " + r.start.beds + " -> " + r.end.beds);
console.log("ok 3 beds kept (" + r.end.beds + ")");
assert.ok(r.end.crafts - r.start.crafts <= 1 && r.end.era === r.start.era, "at most slight progress: crafts " + r.start.crafts + " -> " + r.end.crafts);
assert.ok(!r.ents.some(e => e.kind === "DISCOVERY" && /age (begins|dawns)/.test(e.text)), "no new era");
console.log("ok 4 slight progress only");
assert.ok(r.start.pop > r.start.beds && r.births <= 1, "no bed free (" + r.start.pop + " villagers, " + r.start.beds + " beds): births slow to a trickle: " + r.births);
console.log("ok 5 births slow when no bed is free");
