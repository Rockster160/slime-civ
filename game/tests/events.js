// The unforced systemic event (GDD §11.8), headlessly: run the events module's DECISION function over a year of pressure, no sim.
// Pressure(warm) comes from the real season curve (warmRaw + the daily EMA); the roll comes from the real named stream. Lightning must
// arm after the pressure has held, strike in autumn, and never before the first autumn or after the village already has fire.
//   node tests/events.js
import assert from "node:assert/strict";
import { Rng } from "../src/sim/rng.js";
import { EVENTS, eventDue } from "../src/sim/events.js";
import { warmRaw, emaStep, toolEdgeRaw } from "../src/sim/knowledge.js";
import { DAY, LANDING } from "../src/sim/clock.js";

const row = EVENTS.find(e => e.id === "lightning");
const tickOfDay = (d) => Math.round(d * DAY) - LANDING;      // sim tick of the start of calendar day d (day 0 = day 1 of spring)

/** One year (days 0..99 of year 1, from tick 0 = day 4.2) of the decision; fireAt: the day fire becomes known by other means (or null). */
function run(seed, { cold = 0, fireAt = null } = {}) {
  const rng = new Rng(seed), stream = rng.stream("event.lightning");
  let st = { streak: 0, cd: 0 }, press = 0, fired = null, firstEligible = null;
  const log = [];
  for (let d = 5; d < 100; d++) {
    press = emaStep(press, warmRaw(tickOfDay(d), cold));
    const absent = fireAt === null || d < fireAt;
    let r = eventDue(row, st, { pressure: press, absent, roll: 1 });
    if (r.eligible) { if (firstEligible === null) firstEligible = d; r = eventDue(row, st, { pressure: press, absent, roll: stream.float() }); }
    st = r.st;
    log.push([d, press]);
    if (r.fire && fired === null) { fired = d; break; }
  }
  return { fired, firstEligible, log };
}

const days = [];
for (let seed = 1; seed <= 40; seed++) {
  const r = run(seed);
  assert.ok(r.fired !== null, "seed " + seed + ": lightning never struck in the first year");
  assert.ok(r.fired >= 50 && r.fired < 75, "seed " + seed + ": first strike on day " + r.fired + " (want first autumn, days 50-74)");
  days.push(r.fired);
}
const mean = days.reduce((a, b) => a + b, 0) / days.length;
console.log("first strike over 40 seeds: day " + Math.min(...days) + " to " + Math.max(...days) + ", mean " + mean.toFixed(1) + " (winter starts on day 75)");

// Quiet in the grace period: no cold, no pressure, no event, however many rolls.
{
  const r = run(1);
  const early = r.log.filter(([d]) => d < 50);
  assert.ok(early.every(([, p]) => p === 0), "no pressure before day 50 of year one");
}
// The precondition must be absent: if the village already has fire, the event never runs.
{
  const r = run(3, { fireAt: 10 });
  assert.equal(r.fired, null, "no lightning once fire is known");
}
// Pressure must hold for `days` days: a single cold snap does not arm it.
{
  let st = { streak: 0, cd: 0 };
  for (const p of [0.9, 0.1, 0.9, 0.1, 0.9]) st = eventDue(row, st, { pressure: p, absent: true, roll: 0 }).st;
  assert.equal(st.streak, 1, "streak resets when pressure drops");
  const a = eventDue(row, { streak: 1, cd: 0 }, { pressure: 0.5, absent: true, roll: 0 });
  assert.ok(a.fire, "second day over the threshold with a low roll fires");
  const b = eventDue(row, { streak: 5, cd: 0 }, { pressure: 0.5, absent: true, roll: 0.99 });
  assert.ok(!b.fire && b.eligible, "eligible but the roll missed: waits another day");
  const c = eventDue(row, a.st, { pressure: 0.5, absent: true, roll: 0 });
  assert.ok(!c.fire, "cooldown after a strike");
}
// A hard-winter-only village (fire lost in year 3) is eligible straight away, since the grace only covers the first months.
{
  const t = 2 * 100 * DAY + 60 * DAY - LANDING;
  assert.ok(warmRaw(t, 0) > 0.3, "pressure in a later autumn: " + warmRaw(t, 0));
}

// S7b: the smouldering stump. tool_edge pressure (digging, green stone in the stockpile, hard rock) held over two seasons with no charcoal arms it; it
// never fires before then, and never once charcoal exists. The decision is pure, like lightning's.
{
  const stump = EVENTS.find(e => e.id === "stump");
  assert.equal(toolEdgeRaw(0, false, false), 0, "an idle village with no ore feels no pressure for an edge");
  assert.ok(toolEdgeRaw(12, true, false) > 0.7 && toolEdgeRaw(0, true, false) > stump.thr, "green stone in hand alone is over the threshold");
  const days = [];
  for (let seed = 1; seed <= 40; seed++) {
    const stream = new Rng(seed).stream("event.stump");
    let st = { streak: 0, cd: 0 }, p = 0, fired = null;
    for (let d = 0; d < 150 && fired === null; d++) {
      p = emaStep(p, toolEdgeRaw(d % 4 === 0 ? 0 : 5, d >= 20, false));          // digging most days; the first ore is carried in on day 20
      let r = eventDue(stump, st, { pressure: p, absent: true, roll: 1 });
      if (r.eligible) r = eventDue(stump, st, { pressure: p, absent: true, roll: stream.float() });
      st = r.st; if (r.fire) fired = d;
    }
    assert.ok(fired !== null && fired >= 20 + 50, "seed " + seed + ": stump on day " + fired + " (two seasons after the pressure began)");
    days.push(fired);
  }
  assert.ok(!eventDue(stump, { streak: 99, cd: 0 }, { pressure: 0.9, absent: false, roll: 0 }).fire, "with charcoal in reach the event sleeps");
  console.log("stump over 40 seeds: day " + Math.min(...days) + " to " + Math.max(...days));
}
console.log("events ok");
