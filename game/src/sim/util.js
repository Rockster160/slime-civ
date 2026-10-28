// Small numeric helpers that stay inside + - * / sqrt, so every machine gets
// the same bits (build plan rule 2: no Math.exp/log/pow/sin in the sim).

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** e^-x for x >= 0 as (1 - x/4096)^4096, by 12 squarings. Within ~0.1% for x < 10. */
export function expNeg(x) {
  if (x <= 0) return 1;
  if (x >= 40) return 0;
  let y = 1 - x / 4096;
  for (let i = 0; i < 12; i++) y *= y;
  return y;
}

/** ln(1 + r) for r >= 0 as 8*((1+r)^(1/8) - 1): three square roots. Slightly low for large r, still unbounded. */
export function ln1p(r) {
  const y = Math.sqrt(Math.sqrt(Math.sqrt(1 + r)));
  return 8 * (y - 1);
}

/**
 * Soft cap (GDD §08 settle(), ported from slime-village util.settle): values
 * within `soft` of `mid` pass untouched, the excess grows logarithmically.
 */
export function settle(v, mid, soft) {
  const d = v - mid, over = Math.abs(d) - soft;
  if (over <= 0) return v;
  return mid + (d < 0 ? -1 : 1) * (soft + soft * ln1p(over / soft));
}

/** Round to 3 places: keeps saved traits/needs short and the hash stable. */
export const r3 = (v) => Math.round(v * 1000) / 1000;
export const r1 = (v) => Math.round(v * 10) / 10;

/** Manhattan distance with vertical steps counting double (cheap path estimate). */
export const dist3 = (ax, ay, az, bx, by, bz) => Math.abs(ax - bx) + Math.abs(ay - by) + 2 * Math.abs(az - bz);
