// 10.2 the spring3 save (year-day 1, after the winter's old-age deaths; 8 villagers, 4 of them children, a bed each) left alone for 12 game days:
// where there is room and food the village breeds, births roughly keep pace with deaths and nothing booms; and nobody dies of thirst or hunger.
//   node tests/natural_spring.js   (about 8 s)
import assert from "node:assert/strict";
import { natural } from "./natural_lib.js";

const r = natural("spring3", 12);
console.log("spring:", JSON.stringify(r.start), "->", JSON.stringify(r.end), "births", r.births, "deaths", JSON.stringify(r.causes));
assert.ok(r.births >= 1, "with room and food the village breeds: " + r.births);
assert.ok(r.births >= r.deaths, "births keep pace with deaths: " + r.births + " vs " + r.deaths);
assert.ok(r.maxPop <= 1.5 * r.start.pop && r.minPop >= 0.5 * r.start.pop, "no boom, no collapse: " + r.minPop + ".." + r.maxPop);
console.log("ok 1 births keep pace: " + r.births + " born, " + r.deaths + " died");
assert.ok(!r.causes.thirst && !r.causes.starvation && !r.causes.cold, "nobody dies of thirst, hunger or cold: " + JSON.stringify(r.causes));
console.log("ok 2 no thirst, hunger or cold deaths");
assert.ok(r.end.beds >= r.start.beds, "beds are not lost: " + r.start.beds + " -> " + r.end.beds);
console.log("ok 3 beds kept");
