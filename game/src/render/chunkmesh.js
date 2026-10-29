// The chunk mesher and the mesh cache, shared by the first-person renderer (fpv.js) and the angled map view (oblique.js, 6.19b). Nothing here touches the sim:
// cells come from a RenderView (resident chunks as they are, anything else regrown in the renderer's bounded cache), so drawing never makes a sim chunk resident.
//
//   meshChunk   one 16 x 16 x D chunk -> per-face quads where a solid cell meets an open one (water: its top only, at 0.88). Corners get ambient occlusion.
//               Vertex = FLOATS floats: x y z (GL axes: x east, y up, z south) | r g b | u v | sky seed | ext.
//               opts.bake (first person): unseen cells are baked dark and the face shade is baked into the colour.
//               Without it (the map): colours are plain and `ext` carries what the shader needs to light and pattern the face at draw time:
//                 bits 0-1 view state (0 seen, 1 land nobody has been near: dim but shown, 2 unknown), bits 2-4 the face (0 +x, 1 -x, 2 +y (south), 3 -y, 4 up, 5 down),
//                 bit 5 a built roof (the cutaway hides these), bit 6 water, bit 7 an ore (flecked), bit 8 built (not natural ground).
//   MeshCache   one VBO/VAO per chunk, a cheap signature (cells + what has been seen, with the four neighbours') decides a rebuild, at most `perFrame` per frame, nearest first.
import { D, M, MAT } from "../sim/world.js";
import { chunkKey } from "../sim/cellkey.js";
import { BIOMES } from "../sim/biome.js";
import { isNatural } from "../sim/light.js";

export const FLOATS = 11;
export const MAX_FACES = 16000;                // per chunk (a checkerboard of rock is the worst case; anything beyond is dropped)
export const FACE_SHADE = [0.84, 0.72, 0.78, 0.66, 1, 0.45];             // +x -x +y -y +z(up) -z(down)
const AO = [0.5, 0.68, 0.84, 1];
export const SOLID = new Uint8Array(256);
MAT.forEach((m, i) => { SOLID[i] = m.solid ? 1 : 0; });
const ROOF = new Uint8Array(256); ROOF[M.THATCH] = ROOF[M.LOGROOF] = ROOF[M.HIDEROOF] = 1;
const ORE = new Uint8Array(256); for (const m of [M.FLINT, M.MALACHITE, M.CLAY, M.IRONORE, M.COAL, M.SALT, M.PEAT, M.HERB, M.GEM, M.CRYSTAL, M.COREORE, M.CORE, M.CACHE]) ORE[m] = 1;
export const hash3 = (x, y, z, d) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(d + 1, 2654435761)) >>> 0;

/** Mesh one chunk into `out` (a Float32Array of at least MAX_FACES * 4 * FLOATS) -> a copy of the used part. */
export function meshChunk(view, seen, cx, cy, out, opts = {}) {
  const bake = !!opts.bake;
  const Ms = [], Ss = [];
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const c = view._get(cx + i, cy + j); Ms.push(c.mats); Ss.push(seen.b.get(chunkKey(cx + i, cy + j)) || null); }
  const own = view._get(cx, cy), bm = own.bm, hs = own.hs, ce = seen.cs.get(chunkKey(cx, cy)) || null;
  const ci = (lx, ly) => (lx < 0 ? 0 : lx > 15 ? 2 : 1) + 3 * (ly < 0 ? 0 : ly > 15 ? 2 : 1);
  const mat = (lx, ly, z) => (z < 0 || z >= D ? 0 : Ms[ci(lx, ly)][(z << 8) | ((ly & 15) << 4) | (lx & 15)]);
  const sn = (lx, ly, z) => { if (z < 0 || z >= D) return 0; const a = Ss[ci(lx, ly)]; return a ? a[(z << 8) | ((ly & 15) << 4) | (lx & 15)] : 0; };
  const sol = (lx, ly, z) => SOLID[mat(lx, ly, z)];
  const ox = cx * 16, oy = cy * 16;
  let nf = 0;
  const P = [0, 0, 0], N = [0, 0, 0];
  for (let z = 0; z < D; z++) for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
    const m = Ms[4][(z << 8) | (ly << 4) | lx];
    if (m === 0) continue;
    const water = m === M.WATER;
    if (!water && !SOLID[m]) continue;
    for (let d = 0; d < 6; d++) {
      if (water && d !== 4) continue;
      const a = d >> 1, sg = (d & 1) ? -1 : 1;
      N[0] = N[1] = N[2] = 0; N[a] = sg;
      const ax = lx + N[0], ay = ly + N[1], az = z + N[2], nm = mat(ax, ay, az);
      if (water ? nm !== 0 : SOLID[nm]) continue;
      if (nf >= MAX_FACES) break;
      // open to the sky? (no natural ground within four cells above the open cell: light.js underground())
      let sky = 1;
      for (let k = 1; k <= 4; k++) if (isNatural(mat(ax, ay, az + k))) { sky = 0; break; }
      const seenF = sn(lx, ly, z) || sn(ax, ay, az);
      const col = MAT[m].color, jit0 = 0.92 + 0.16 * ((hash3(ox + lx, oy + ly, z, d) & 255) / 255), jit = m === M.DWALL ? jit0 * (((ox + lx + oy + ly + z) & 1) ? 0.86 : 1.08) : jit0;      // 7.21: ancient stonework is laid in a checker of flags and blocks
      let r = col[0] / 255, g = col[1] / 255, b = col[2] / 255;
      if (d === 4 && !water) {
        const bi = bm[(ly << 4) | lx];
        if (bi && z >= hs[(ly << 4) | lx]) { const t = BIOMES[bi].tint, k = t[3]; r = r * (1 - k) + t[0] / 255 * k; g = g * (1 - k) + t[1] / 255 * k; b = b * (1 - k) + t[2] / 255 * k; }
      }
      const mn = own.mb ? (z >= hs[(ly << 4) | lx] ? own.mb[(ly << 4) | lx] : own.md[(ly << 4) | lx]) : 0;      // 7.20: seen ground in a core's field is tinted violet (more the nearer the core)
      if (mn && seenF && !water) { const k = 0.06 + 0.05 * mn; r = r * (1 - k) + 0.6 * k; g = g * (1 - k) + 0.38 * k; b = b * (1 - k) + 1.0 * k; }
      let f = bake ? FACE_SHADE[d] * jit : jit, state = 0;
      if (!seenF) {
        if (bake) { if (sky) { r *= 0.5; g *= 0.58; b *= 0.8; f *= 0.8; } else f *= 0.06; }
        else state = sky && !(ce && ce[(ly << 4) | lx]) ? 1 : 2;
      }
      const t1 = (a + 1) % 3, t2 = (a + 2) % 3, seed = (hash3(ox + lx, oy + ly, z, d) & 1023) / 1023;
      const ext = state | (d << 2) | (ROOF[m] ? 32 : 0) | (water ? 64 : 0) | (ORE[m] ? 128 : 0) | (!water && !isNatural(m) ? 256 : 0);
      for (let q = 0; q < 4; q++) {
        const u = q === 1 || q === 2 ? 1 : 0, v = q >= 2 ? 1 : 0;
        P[0] = lx; P[1] = ly; P[2] = z;
        P[t1] += u; P[t2] += v; P[a] += sg > 0 ? 1 : 0;
        if (water) P[2] = z + 0.88;
        let ao = 1;
        if (!water) {
          const s1 = u ? 1 : -1, s2 = v ? 1 : -1;
          const e1 = [0, 0, 0], e2 = [0, 0, 0]; e1[t1] = s1; e2[t2] = s2;
          const o1 = sol(ax + e1[0], ay + e1[1], az + e1[2]), o2 = sol(ax + e2[0], ay + e2[1], az + e2[2]), oc = sol(ax + e1[0] + e2[0], ay + e1[1] + e2[1], az + e1[2] + e2[2]);
          ao = AO[o1 && o2 ? 0 : 3 - (o1 + o2 + oc)];
        }
        const o = (nf * 4 + q) * FLOATS;
        out[o] = ox + P[0]; out[o + 1] = P[2]; out[o + 2] = oy + P[1];
        out[o + 3] = r * f * ao; out[o + 4] = g * f * ao; out[o + 5] = b * f * ao;
        out[o + 6] = u; out[o + 7] = v; out[o + 8] = sky; out[o + 9] = seed; out[o + 10] = ext;
      }
      nf++;
    }
  }
  return out.slice(0, nf * 4 * FLOATS);
}

/** A cheap signature of a chunk's cells and what has been seen in it (so a rebuild happens only when either changed). */
export function chunkSig(view, seen, cx, cy) {
  const c = view._get(cx, cy), m = c.mats;
  let h = 17;
  for (let i = 0; i < m.length; i++) h = (Math.imul(h, 31) + m[i]) | 0;
  const s = seen.b.get(chunkKey(cx, cy));
  if (s) { let n = 0; for (let i = 0; i < s.length; i++) n += s[i]; h = (Math.imul(h, 31) + n) | 0; }
  const e = seen.cs.get(chunkKey(cx, cy));
  if (e) { let n = 0; for (let i = 0; i < 256; i++) n += e[i]; h = (Math.imul(h, 31) + n) | 0; }
  return h;
}

/**
 * The per-chunk mesh cache. `makeVao(vbo)` builds the vertex array for a buffer (the renderer owns the attribute layout). sync() keeps the meshes of the chunk box
 * [cx0..cx1] x [cy0..cy1] current: signatures are re-taken at most five times a second (or at once when the box moves), changed chunks are rebuilt nearest first, a few a frame.
 */
export class MeshCache {
  constructor(gl, makeVao, opts = {}) {
    this.gl = gl; this.makeVao = makeVao; this.bake = !!opts.bake; this.perFrame = opts.perFrame || 6;
    this.scratch = new Float32Array(MAX_FACES * 4 * FLOATS);
    this.meshes = new Map(); this.sigs = new Map(); this.at = { wv: -1, sv: -1, box: "", t: 0 };
    this.rebuilt = 0; this.builds = 0;
  }
  sync(sim, view, cx0, cx1, cy0, cy1, ex, ey) {
    const gl = this.gl, seen = sim.seen, A = this.at, now = performance.now(), box = cx0 + "," + cx1 + "," + cy0 + "," + cy1;
    if (A.box !== box || ((A.wv !== sim.world.version || A.sv !== seen.ver) && now - A.t > 200)) {
      A.wv = sim.world.version; A.sv = seen.ver; A.box = box; A.t = now;
      const want = new Set();
      for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) { want.add(chunkKey(cx, cy)); this.sigs.set(chunkKey(cx, cy), chunkSig(view, seen, cx, cy)); }
      for (const k of [...this.sigs.keys()]) if (!want.has(k)) this.sigs.delete(k);
      for (const [k, mesh] of this.meshes) if (!want.has(k)) { gl.deleteBuffer(mesh.vbo); gl.deleteVertexArray(mesh.vao); this.meshes.delete(k); }
    }
    const todo = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = chunkKey(cx, cy), sg = this.sigs.get(k);
      let tot = sg | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) tot = (Math.imul(tot, 31) + (this.sigs.get(chunkKey(cx + dx, cy + dy)) | 0)) | 0;
      const m = this.meshes.get(k);
      if (!m || m.sig !== tot) todo.push([(cx * 16 + 8 - ex) ** 2 + (cy * 16 + 8 - ey) ** 2, cx, cy, k, tot]);
    }
    todo.sort((a, b) => a[0] - b[0]);
    let n = 0;
    for (const [, cx, cy, k, tot] of todo) {
      if (n++ >= this.perFrame) break;
      const data = meshChunk(view, seen, cx, cy, this.scratch, { bake: this.bake });
      let m = this.meshes.get(k);
      if (!m) { const vbo = gl.createBuffer(); m = { vbo, vao: this.makeVao(vbo), n: 0, sig: 0, cx, cy }; this.meshes.set(k, m); }
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      m.n = data.length / (4 * FLOATS); m.sig = tot; this.builds++;
    }
    this.rebuilt = n;
  }
  dispose() {
    const gl = this.gl;
    for (const m of this.meshes.values()) { gl.deleteBuffer(m.vbo); gl.deleteVertexArray(m.vao); }
    this.meshes.clear(); this.sigs.clear(); this.at.wv = -1; this.at.box = "";
  }
}
