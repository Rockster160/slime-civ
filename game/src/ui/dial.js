// The time dial (UI_SPEC §3.5): the whole calendar in 36 px, no words. The outer ring is the year in four season arcs (winter hatched); the hand is the day
// of the year; the inner disc is the day, with the sun (or moon) travelling across it. A paused game shows a pause glyph in the middle. Every length comes
// from sim/clock.js (a day is DAY ticks, a year is DAYS_PER_YEAR days, a season DAYS_PER_SEASON): never a hard-coded day length.
import { DAYS_PER_YEAR, DAYS_PER_SEASON } from "../sim/clock.js";
import { dayF, phase, isNight } from "../sim/season.js";

const R = 16, C = 2 * Math.PI * R, CX = 18;
const arc = (i, cls) => { const len = C / 4, gap = 1.6; return `<circle class="ring-s ${cls}" cx="${CX}" cy="${CX}" r="${R}" stroke-dasharray="${(len - gap).toFixed(2)} ${(C - len + gap).toFixed(2)}" stroke-dashoffset="${(-i * len + 0).toFixed(2)}" transform="rotate(-90 ${CX} ${CX})"/>`; };

/** The dial for a tick. `paused` shows the pause glyph; `flash` plays the sun glyph once (a skip stopped). */
export function dialSvg(tick, paused, flash = false) {
  const d = dayF(tick), a = (d / DAYS_PER_YEAR) * 2 * Math.PI - Math.PI / 2;
  const hx1 = CX + Math.cos(a) * 10.5, hy1 = CX + Math.sin(a) * 10.5, hx2 = CX + Math.cos(a) * 18, hy2 = CX + Math.sin(a) * 18;
  const p = phase(tick), night = isNight(tick);
  // sun: along the upper half of the inner disc from dawn (p .10) to dusk (p .80); moon: along the lower half, dusk to dawn
  let t, up;
  if (!night) { t = (p - 0.10) / 0.70; up = 1; } else { t = (((p - 0.80) + 1) % 1) / 0.30; up = -1; }
  const th = Math.PI - t * Math.PI, sx = CX + Math.cos(th) * 6.5, sy = CX - up * Math.sin(th) * 6.5;
  const body = night ? `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="2.4" fill="#cfd8ff"/>` : `<circle class="sunm ${flash ? "flash" : ""}" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="2.6"/>`;
  const centre = paused ? `<path d="M15.5 14v8M20.5 14v8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>` : body;
  void DAYS_PER_SEASON;
  return `<svg class="dial" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">${arc(0, "s0")}${arc(1, "s1")}${arc(2, "s2")}${arc(3, "s3")}${arc(3, "s3h")}`
    + `<circle class="face ${night ? "night" : ""}" cx="${CX}" cy="${CX}" r="12.5"/><line x1="${CX - 6.5}" y1="${CX}" x2="${CX + 6.5}" y2="${CX}" stroke="var(--line)" stroke-width="1"/>${centre}`
    + `<line class="hand" x1="${hx1.toFixed(1)}" y1="${hy1.toFixed(1)}" x2="${hx2.toFixed(1)}" y2="${hy2.toFixed(1)}"/></svg>`;
}
