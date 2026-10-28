// Clock rebase (S18b, D35). The calendar day is DAY ticks (12000 by default = 10 real minutes at 1x); night is 30% of it; a life is LIFE_DAYS calendar days.
// Every other duration is a flat tick count (DUR_DAY-based). This test reads DAY from clock.js and assumes no day length, so it also runs under
// SLIME_DAY=<n> (tests/dayguard.js does that). Fresh sims only (no fixture: a fixture is written for one day length).
//   node tests/clock.js
import assert from "node:assert/strict";
import { DAY, DUR_DAY, DAY_X, TICKS_PER_SEC, DAYS_PER_SEASON, DAYS_PER_YEAR, YEAR, SEASON, LANDING, timeOf, dateOf } from "../src/sim/clock.js";
import { isNight, untilDawn, phase } from "../src/sim/season.js";
import { LIFE_DAYS, isAdult, NEED_DAY } from "../src/sim/villager.js";
import { Sim } from "../src/sim/sim.js";
import { toJSON, restore, SAVE_VERSION } from "../src/sim/save.js";
import { createSkip } from "../src/ui/skip.js";
const ok = (m) => console.log("ok " + m);

// ---- 1. the clock ----
{
  assert.ok(DAY > 0 && Number.isInteger(DAY)); assert.equal(TICKS_PER_SEC, 20);
  assert.equal(DAYS_PER_SEASON, 25); assert.equal(DAYS_PER_YEAR, 100); assert.equal(YEAR, DAYS_PER_YEAR * DAY); assert.equal(SEASON, DAYS_PER_SEASON * DAY);
  assert.ok(Math.abs(DAY_X - DAY / DUR_DAY) < 1e-12);
  assert.equal(LIFE_DAYS, 500, "a life is 5 game years of 100 days");
  let night = 0;
  for (let t = 0; t < DAY; t++) if (isNight(t)) night++;        // (isNight takes a sim tick; tick 0 is the landing morning: scan one whole day)
  assert.ok(Math.abs(night / DAY - 0.3) < 0.002, "night is 30% of the day: " + night / DAY);
  let t0 = -1; for (let t = 0; t < DAY && t0 < 0; t++) if (isNight(t) && !isNight(t - 1)) t0 = t;
  assert.equal(untilDawn(t0), night, "from dusk the whole night is left");
  assert.equal(untilDawn(t0 - 1), 0);
  const d = timeOf(YEAR * 2 + 3 * DAY + 100);
  assert.deepEqual([d.year, d.day, d.season], [3, 4, 0]);
  assert.equal(dateOf(0).day, 5, "landing is day 5 of spring");
  assert.ok(LANDING > 0 && LANDING < DAY * 5);
  ok(`a day is ${DAY} ticks = ${DAY / TICKS_PER_SEC / 60} real minutes at 1x; night ${night} ticks (30%); season ${DAYS_PER_SEASON} days, year ${DAYS_PER_YEAR} days, life ${LIFE_DAYS} days`);
}

// ---- 2. one adult, two calendar days, food and water to hand ----
{
  const sim = Sim.create(7, { villagers: 1 });
  const keep = sim.ents.ofKind("villager")[0];
  keep.born = -Math.round(0.35 * LIFE_DAYS * DAY);                          // an adult in his prime
  assert.ok(isAdult(sim, keep));
  keep.hunger = 0.56; keep.thirst = 0.56; keep.energy = 0.9;
  let spans = 0, lastSlp = -1e9, meals = 0, drinks = 0, lastH = keep.hunger, lastT = keep.thirst, lastEat = -1e9, lastDrink = -1e9, nightTicks = 0, nightSlept = 0, dayTicks = 0, daySlept = 0;
  for (let i = 0; i < 2 * DAY; i++) {
    sim.step();
    const k = keep.job && keep.action ? keep.job.k : "";
    if (keep.hunger > lastH + 0.05) { if (i - lastEat > 600) meals++; lastEat = i; }       // a meal: hunger jumps up (bursts closer than 600 ticks are one meal)
    if (keep.thirst > lastT + 0.05) { if (i - lastDrink > 600) drinks++; lastDrink = i; }
    lastH = keep.hunger; lastT = keep.thirst;
    if (keep.slp === 1) { if (i - lastSlp > 300) spans++; lastSlp = i; }       // a sleep: broken bits closer than 300 ticks are one sleep
    if (isNight(sim.tick)) { nightTicks++; if (keep.slp === 1) nightSlept++; } else { dayTicks++; if (keep.slp === 1) daySlept++; }
  }
  assert.ok(sim.ents.get(keep.id), "the lone adult lives");
  const perNeedDay = 2 * DAY / NEED_DAY;
  console.log(`one adult, 2 days: ${meals} meals, ${drinks} drinks, ${spans} sleeps, asleep ${(100 * nightSlept / nightTicks).toFixed(0)}% of the night and ${(100 * daySlept / dayTicks).toFixed(0)}% of the day; hunger ${keep.hunger.toFixed(2)} thirst ${keep.thirst.toFixed(2)} energy ${keep.energy.toFixed(2)}`);
  assert.ok(meals >= (perNeedDay >= 1.5 ? 1 : 0) && meals <= 2 * perNeedDay + 3, "a ration is about a NEED_DAY of food: " + meals);
  assert.ok(drinks >= (perNeedDay >= 1.5 ? 1 : 0) && drinks <= 4 * perNeedDay + 3, "drinks: " + drinks);
  assert.ok(nightSlept / nightTicks > 0.4, "sleeps through much of the night: " + nightSlept / nightTicks);
  assert.ok(spans >= 1 && spans <= 5, "about one sleep a night, not naps: " + spans);
  assert.ok(daySlept / dayTicks < 0.25, "and is up by day: " + daySlept / dayTicks);
  assert.ok(keep.hunger > 0.1 && keep.thirst > 0.1 && keep.energy > 0.1, "needs stay met");
  ok("needs: " + meals + " meals, " + drinks + " drinks, one sleep a night");
}

// ---- 3. fast-forward: Next morning and MAX ----
{
  const sim = Sim.create(7, { villagers: 3 });
  const game = { sim, possessed: () => false, state: { paused: true }, toast() {}, ui: {} };
  const S = createSkip(game);
  while (phase(sim.tick) < 0.85) sim.step();                       // dusk: the skip has most of a night to cross
  const t0 = sim.tick, w0 = Date.now();
  assert.ok(S.start("morning"));
  let slices = 0;
  while (S.run(12) && slices < 100000) slices++;
  assert.ok(!S.active, "the skip ended: " + S.msg);
  const n = sim.tick - t0;
  console.log(`Next morning from dusk: ${n} ticks in ${Date.now() - w0} ms (${slices + 1} frame slices of 12 ms): ${S.msg}`);
  assert.ok(!isNight(sim.tick) || /Stopped/.test(S.msg), "it stopped in the morning or said why");
  assert.ok(n > 0 && n <= DAY);
  assert.ok(S.start("morning") && /Skipping morning: day \d+/.test(S.progress()));
  S.cancel("test");
  const t1 = Date.now();
  for (let i = 0; i < DAY; i++) sim.step();
  const ms = Date.now() - t1;
  console.log(`one calendar day flat out: ${ms} ms`);
  assert.ok(ms < 60000);
  ok("fast-forward: Next morning crosses the night in a few frame slices; a day flat out takes " + ms + " ms");
}

// ---- 4. the save round-trips and replays identically ----
{
  assert.ok(SAVE_VERSION >= 11, "the clock rebase bumped the save format");
  const a = Sim.create(7, { villagers: 5 });
  for (let i = 0; i < 600; i++) a.step();
  const b = restore(toJSON(a));
  assert.equal(b.hash(), a.hash());
  for (let i = 0; i < 1500; i++) { a.step(); b.step(); }
  assert.equal(a.hash(), b.hash(), "a restored sim runs tick for tick with the original");
  const ages = a.ents.ofKind("villager").map(v => (a.tick - v.born) / DAY);
  assert.ok(ages.every(x => x > 0 && x < LIFE_DAYS), "founder ages are in calendar days: " + ages.map(x => x.toFixed(0)));
  ok("save round-trips and replays identically; founder ages " + ages.map(x => x.toFixed(0)).join(","));
}

// ---- 5. the 6.18 flake: a removed entity moved afterwards must not leave a stale id in the cell index ----
{
  const sim = Sim.create(7, { villagers: 2 }), v = sim.ents.ofKind("villager")[0], x = v.x + 1, y = v.y, z = v.z;
  sim.ents.remove(v.id);
  sim.ents.move(v, x, y, z);                                  // a loop that still holds it
  assert.ok(sim.ents.at(x, y, z).every(id => sim.ents.get(id)), "every id in the cell index names a live entity");
  ok("a removed entity is never put back in the cell index");
}
console.log("clock ok");
