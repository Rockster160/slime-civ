// Units & clock (GDD §23 box). Everything in the sim counts integer ticks;
// real time only enters through main.js's accumulator.
// S18b (D35, revised): the CALENDAR day is 12000 ticks = 10 real minutes at 1x (it was 1800 = 90 s, K2/D11), and a life is 5 calendar years (LIFE_DAYS 500).
// The calendar (day/night, season, year, the date) and AGE are the only things counted in calendar days. EVERY OTHER duration and rate in the sim
// (crop growth, spoilage, fuel burn, illness, breeding cooldowns, rust, grief, regrowth, hunger, thirst, healing, expedition time, ...) is flat ticks:
// the values it had under the old 1800-tick day, written against DUR_DAY and so unchanged in real time.
// The day length is overridable for the test guard only (tests/dayguard.js runs key tests with SLIME_DAY=...); the game never sets it.
const ENV_DAY = typeof process !== "undefined" && process.env && Number(process.env.SLIME_DAY);
export const TICKS_PER_SEC = 20;          // at 1x
export const DAY = ENV_DAY > 0 ? Math.round(ENV_DAY) : 12000;     // the calendar day, in ticks; 600 s = 10 min at 1x
/** The unit durations are written in: 1800 ticks (90 s at 1x), the length of a day on the old clock. A "4 day" regrowth is `4 * DUR_DAY` = 7200 ticks (6 min at 1x). It is NOT the calendar day. */
export const DUR_DAY = 1800;
export const DAY_X = DAY / DUR_DAY;       // how many duration-days one calendar day holds (6.67): the factor for the few rates that run on the calendar (energy, ageing)
export const DAYS_PER_SEASON = 25;
export const DAYS_PER_YEAR = 100;
export const SEASON = DAY * DAYS_PER_SEASON;
export const YEAR = DAY * DAYS_PER_YEAR;
export const SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"];

/** Calendar view of a tick. day is 1-based within the year, year is 1-based. */
export function timeOf(tick) {
  const absDay = Math.floor(tick / DAY);
  const dayOfYear = absDay % DAYS_PER_YEAR;
  return {
    day: dayOfYear + 1,
    season: Math.floor(dayOfYear / DAYS_PER_SEASON),
    year: Math.floor(absDay / DAYS_PER_YEAR) + 1,
    dayFrac: (tick % DAY) / DAY,
  };
}

/**
 * Landing is the morning of day 5 of spring (GDD §11.7/§11.16): tick 0 of a
 * sim is that moment, so every calendar question goes through cal().
 */
export const LANDING = 4 * DAY + Math.floor(DAY * 0.2);
export const cal = (tick) => tick + LANDING;
/** Calendar view of a sim tick (landing offset applied). */
export function dateOf(tick) { return timeOf(tick + LANDING); }
