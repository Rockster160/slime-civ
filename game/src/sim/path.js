// A* over walkable cells.
//
// Movement: 4-neighbour steps; a step may also go up or down one z-level
// (stairs/slopes are just adjacent cells at different heights). Stepping up
// needs headroom over the current cell; stepping down needs the destination's
// air column free. Water and OBSTACLE cells are not walkable (world.isWalkable).
//
// Determinism: the open list is ordered by (f, then deeper g first, then the order
// nodes were met in), packed into one exact integer key, so equal-cost routes always
// resolve the same way. Neighbours are tried in a fixed order.
//
// Cost: flat step 2, vertical step 3 (prefers level routes); heuristic is
// 2 * Manhattan(x,y), which never overestimates.
//
// Seam for later: Pathfinder.find() is the only entry point. A region graph
// (connected-component ids per chunk, rebuilt on dirty chunks) would slot in
// right at the top of find(): reject unreachable goals without searching, and
// hand A* coarse waypoints for long trips. The cache below is already keyed
// on world.version, which is the invalidation signal that graph would use too.
import { World } from "./world.js";

const NODE_BITS = 1048576;           // heap keys carry a node number (a search's own numbering), not a cell index: cells are unbounded now (S16)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DEFAULT_BUDGET = 4000;  // expanded nodes per search

export class Pathfinder {
  constructor(world) {
    this.world = world;
    this.cache = new Map();
    this.cacheVersion = -1;
    this.stats = { searches: 0, hits: 0, expanded: 0 };
  }

  /**
   * Find a path between two cells (cell indices, see World.idx).
   * Returns {ok, path, blocker}; path is cell indices excluding the start, and
   * must not be mutated (results are cached and shared).
   * blocker (job-board enum, rule 4): "NO_PATH" or "BUDGET".
   */
  find(start, goal, budget = DEFAULT_BUDGET) {
    const w = this.world;
    if (this.cacheVersion !== w.version) { this.cache.clear(); this.cacheVersion = w.version; }
    const ck = start + "|" + goal;
    const hit = this.cache.get(ck);
    if (hit) { this.stats.hits++; return hit; }
    this.stats.searches++;
    const res = this._search(start, goal, budget);
    if (this.cache.size >= 512) this.cache.clear();
    this.cache.set(ck, res);
    return res;
  }

  _search(start, goal, budget) {
    const w = this.world;
    const [sx, sy] = World.xyz(start);
    const [gx, gy, gz] = World.xyz(goal);
    if (!w.isWalkable(gx, gy, gz)) return { ok: false, path: null, blocker: "NO_PATH" };
    if (start === goal) return { ok: true, path: [], blocker: null };

    // Unbounded coordinates: nodes are numbered as they are met (a Map from cell to node), and g / from / closed are plain arrays by node.
    const ids = new Map(), cells = [], g = [], from = [], closed = [];
    const node = (cell, gg, fr) => {
      let n = ids.get(cell);
      if (n === undefined) { n = cells.length; ids.set(cell, n); cells.push(cell); g.push(gg); from.push(fr); closed.push(0); return n; }
      return n;
    };
    const heap = [];
    const key = (f, gg, n) => (f * 4096 + (4095 - Math.min(gg, 4095))) * NODE_BITS + n;
    const hcost = (x, y) => 2 * (Math.abs(x - gx) + Math.abs(y - gy));

    const s0 = node(start, 0, -1);
    push(heap, key(hcost(sx, sy), 0, s0));
    let expanded = 0;

    while (heap.length) {
      const k = pop(heap);
      const cur = k % NODE_BITS;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const curCell = cells[cur];
      if (curCell === goal) {
        this.stats.expanded += expanded;
        const path = [];
        for (let n = cur; n !== s0; n = from[n]) path.push(cells[n]);
        path.reverse();
        return { ok: true, path, blocker: null };
      }
      if (++expanded > budget) {
        this.stats.expanded += expanded;
        return { ok: false, path: null, blocker: "BUDGET" };
      }
      const [x, y, z] = World.xyz(curCell);
      const gc = g[cur];
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        let nz = -1, cost = 2;
        if (w.isWalkable(nx, ny, z)) nz = z;
        else if (w.isWalkable(nx, ny, z + 1) && !w.isSolid(x, y, z + 1)) { nz = z + 1; cost = 3; }
        else if (w.isWalkable(nx, ny, z - 1) && !w.isSolid(nx, ny, z)) { nz = z - 1; cost = 3; }
        if (nz < 0) continue;
        const cell = World.idx(nx, ny, nz), known = ids.get(cell);
        if (known !== undefined && closed[known]) continue;
        const ng = gc + cost;
        if (known === undefined || ng < g[known]) {
          const n = known === undefined ? node(cell, ng, cur) : known;
          g[n] = ng; from[n] = cur;
          push(heap, key(ng + hcost(nx, ny), ng, n));
        }
      }
    }
    this.stats.expanded += expanded;
    return { ok: false, path: null, blocker: "NO_PATH" };
  }
}

// Binary min-heap of exact-integer keys (< 2^53).
export function push(h, v) {
  let i = h.length; h.push(v);
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p] <= v) break;
    h[i] = h[p]; i = p;
  }
  h[i] = v;
}
export function pop(h) {
  const top = h[0], last = h.pop();
  if (h.length) {
    let i = 0; const n = h.length;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && h[c + 1] < h[c]) c++;
      if (h[c] >= last) break;
      h[i] = h[c]; i = c;
    }
    h[i] = last;
  }
  return top;
}
