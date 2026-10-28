// Cell and chunk keys for an unbounded world (S16). x and y are signed integers (|x|,|y| < 2^19), z is 0..D-1.
// A cell index is one exact double: ((z * 2^20) + (y + 2^19)) * 2^20 + (x + 2^19) < 2^45. Plain arithmetic only (no bitwise
// ops: they would truncate to 32 bits). Equal cells give equal numbers, numbers sort by (z, y, x), and a Set/Map of them is
// cheap, so every "set of cells" in the sim keeps working; what cannot work any more is an array indexed by one.
const B = 1048576, O = 524288;

export const cellIdx = (x, y, z) => (z * B + (y + O)) * B + (x + O);
export function cellXyz(i) {
  const lx = i % B, r = (i - lx) / B, ly = r % B;
  return [lx - O, ly - O, (r - ly) / B];
}
export const cellX = (i) => (i % B) - O;
export const cellY = (i) => (((i - (i % B)) / B) % B) - O;
export const cellZ = (i) => Math.floor(i / (B * B));

/** Chunk key for chunk coordinates (cx, cy), |c| < 32768: one exact integer < 2^32. */
export const chunkKey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);
export const chunkKX = (k) => Math.floor(k / 65536) - 32768;
export const chunkKY = (k) => (k % 65536) - 32768;
/** The chunk key of the chunk holding column (x, y). */
export const chunkOf = (x, y) => chunkKey(x >> 4, y >> 4);
