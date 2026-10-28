// Units & clock (GDD §23 box). Everything in the sim counts integer ticks;
// real time only enters through main.js's accumulator.
export const TICKS_PER_SEC = 20;          // at 1x
export const DAY = 1800;                  // ticks; 90 s at 1x
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
