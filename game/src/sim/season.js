// Seasons as a warmth curve (GDD §11.7). Everything reads `warmth`, not a
// season name. No trig: a smoothstep triangle gives the same cosine-ish shape
// (peak mid-summer, trough mid-winter, 0.5 at the middle of spring and autumn).
import { DAY, DAYS_PER_YEAR, DAYS_PER_SEASON, LANDING } from "./clock.js";
import { clamp } from "./util.js";

export const WINTER_START = 3 * DAYS_PER_SEASON;      // day-of-year 75
export const PEAK_DAY = 37.5;                          // mid-summer
// GDD says villages plan SEASON_LOOK = 20 of 100 days ahead. C1 has no winter
// forage and no fire, so a larder not built by day 75 is a death sentence; we
// start banking earlier (50 days) and tune with the bots. (documented deviation)
export const SEASON_LOOK = 50;
export const NIGHT_DROP = 0.08;                        // nights are colder (S2 design call)

/** Day of year as a float, 0..100. */
export function dayF(tick) { return (((tick + LANDING) % (DAY * DAYS_PER_YEAR)) / DAY); }

/** Seasonal warmth 0 (trough) .. 1 (peak) for a float day-of-year. */
export function warmthOfDay(d) {
  let p = (d - PEAK_DAY) / DAYS_PER_YEAR;
  p -= Math.floor(p + 0.5);                 // -0.5 .. 0.5
  const x = 2 * (p < 0 ? -p : p);           // 0 at peak .. 1 at trough
  return 1 - x * x * (3 - 2 * x);
}

export function phase(tick) { return ((tick + LANDING) % DAY) / DAY; }
/** Night is 30% of the day: phase < 0.10 or >= 0.80 (sleep needs ~0.25-0.3 of a day, §08). */
export function isNight(tick) { const p = phase(tick); return p < 0.10 || p >= 0.80; }
/** Ticks from `tick` until the next dawn (0 if it is day). */
export function untilDawn(tick) {
  const p = phase(tick);
  if (p >= 0.80) return Math.floor((1.10 - p) * DAY);
  if (p < 0.10) return Math.floor((0.10 - p) * DAY);
  return 0;
}

export function warmthAt(tick) { return warmthOfDay(dayF(tick)); }
/** Air temperature the body feels: season minus a night drop. */
export function tempAt(tick) { return warmthAt(tick) - (isNight(tick) ? NIGHT_DROP : 0); }
/** Lowest seasonal warmth now .. +5 days (the shelter rule's forecast, §09). */
export function forecastMin(tick) {
  const d = dayF(tick);
  return Math.min(warmthOfDay(d), warmthOfDay(d + 2.5), warmthOfDay(d + 5));
}
export function seasonIdx(tick) { return Math.floor(dayF(tick) / DAYS_PER_SEASON); }
/** Berries bear in spring..autumn only (§11.17 winter forage is cut in C1). */
export function berrySeason(tick) { return seasonIdx(tick) < 3; }
/** 0..1 ramp over SEASON_LOOK days before winter; 1 during winter. */
export function winterAhead(tick) {
  const d = dayF(tick);
  if (d >= WINTER_START) return 1;
  return clamp(1 - (WINTER_START - d) / SEASON_LOOK, 0, 1);
}
/** 0..1: how cold the next five days look (shelter urgency multiplier). */
export function coldAhead(tick) { return clamp((0.4 - forecastMin(tick)) / 0.3, 0, 1); }
