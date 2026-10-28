// FNV-1a (32-bit) over canonical state. Not cryptographic: it only has to make
// two diverged sims disagree, and be cheap enough to call every tick in tests.
const OFFSET = 0x811c9dc5;
const PRIME = 0x01000193;

export function fnv1aStr(s, h = OFFSET) {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    h = Math.imul(h, PRIME);
    h ^= s.charCodeAt(i) >>> 8;
    h = Math.imul(h, PRIME);
  }
  return h >>> 0;
}

export class Hasher {
  constructor() { this.h = OFFSET; }
  u32(n) {
    let h = this.h;
    h ^= n & 255; h = Math.imul(h, PRIME);
    h ^= (n >>> 8) & 255; h = Math.imul(h, PRIME);
    h ^= (n >>> 16) & 255; h = Math.imul(h, PRIME);
    h ^= (n >>> 24) & 255; h = Math.imul(h, PRIME);
    this.h = h;
  }
  str(s) { this.h = fnv1aStr(s, this.h); }
  bytes(arr) {
    let h = this.h;
    for (let i = 0; i < arr.length; i++) { h ^= arr[i]; h = Math.imul(h, PRIME); }
    this.h = h;
  }
  /**
   * Canonical structural hash: object keys are sorted and undefined values are
   * skipped, so the result is independent of insertion order and survives a
   * JSON round-trip (which drops undefined).
   */
  value(v) {
    if (v === null || v === undefined) { this.u32(0); return; }
    switch (typeof v) {
      case "number":
        if (Number.isInteger(v) && v >= -2147483648 && v <= 2147483647) { this.u32(1); this.u32(v | 0); }
        else { this.u32(2); this.str(String(v)); }
        return;
      case "boolean": this.u32(v ? 3 : 4); return;
      case "string": this.u32(5); this.str(v); this.u32(v.length); return;
      default:
        if (Array.isArray(v)) {
          this.u32(6); this.u32(v.length);
          for (let i = 0; i < v.length; i++) this.value(v[i]);
          return;
        }
        this.u32(7);
        for (const k of Object.keys(v).sort()) {
          if (v[k] === undefined) continue;
          this.str(k); this.value(v[k]);
        }
        this.u32(8);
    }
  }
  get hex() { return (this.h >>> 0).toString(16).padStart(8, "0"); }
}
