// Named, counter-based random streams (GDD §11.4/R23).
//
// A stream is a pure function of (world seed, stream name, counter): output k
// is mix(key, k). So its whole state is one integer, it serialises trivially,
// and adding a new named stream never reshuffles an existing one — worldgen can
// gain a feature without moving every tree.
import { fnv1aStr } from "./hash.js";

/** 32-bit avalanche mixer (murmur3 finalizer shape). Integer ops only. */
export function mix32(a, b) {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class Stream {
  constructor(key, n = 0) { this.key = key; this.n = n; }
  u32() { const k = this.n++; return mix32(mix32(this.key, k), k ^ 0x5bd1e995); }
  /** Integer in [0, n). */
  int(n) { return Math.floor((this.u32() / 4294967296) * n); }
  /** Integer in [lo, hi] inclusive. */
  range(lo, hi) { return lo + this.int(hi - lo + 1); }
  float() { return this.u32() / 4294967296; }
  chance(p) { return this.float() < p; }
  pick(arr) { return arr[this.int(arr.length)]; }
}

export class Rng {
  constructor(seed) { this.seed = seed >>> 0; this.streams = new Map(); }
  stream(name) {
    let s = this.streams.get(name);
    if (!s) { s = new Stream(mix32(fnv1aStr(name), this.seed)); this.streams.set(name, s); }
    return s;
  }
  /** { name: counter }, names sorted so JSON and hashing are canonical. */
  counters() {
    const o = {};
    for (const name of [...this.streams.keys()].sort()) o[name] = this.streams.get(name).n;
    return o;
  }
  restore(counters) {
    this.streams.clear();
    for (const name of Object.keys(counters)) this.stream(name).n = counters[name];
  }
}
