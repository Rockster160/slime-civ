// The angled map view (6.19b, UI_SPEC §12.5, GDD §07 R2): the main map as a fixed-pitch, fixed-yaw orthographic 3/4 camera on the same chunk meshes the first-person
// view uses (chunkmesh.js). WebGL2, no dependencies. It READS the sim and never writes it, and it never makes a sim chunk resident (cells come from the RenderView).
//   terrain    per-chunk face meshes, lit by the sun at draw time (a cliff face reads darker than the hill top beside it), ambient occlusion baked on the corners, season
//              and day/night tint, torches and fires (light.js radii) underground, a distinct pattern (never plain black) for what nobody has seen.
//   levels     Surface draws everything. Slice N clips every fragment above N (a shader clip plane): the solid cells the plane cuts are drawn as a flat hatched "cut" cap
//              from a small per-level texture, the levels below show through openings in dimmed bands (4), and the level above is a faint outline (toggleable).
//   billboards villagers, creatures, plants, items, furniture: sprites.js painted into an atlas, drawn as camera-facing quads that take the depth of an upright thing.
// The 2D canvas (#view) above the GL canvas carries every overlay (rings, lines, zones, ghosts, labels), through the same cam.toScreen.
import { D, M, MAT } from "../sim/world.js";
import { chunkKey } from "../sim/cellkey.js";
import { HIGHLAND } from "../sim/biome.js";
import { lightSources, isNatural } from "../sim/light.js";
import { seasonIdx, dayF } from "../sim/season.js";
import { DAYS_PER_SEASON } from "../sim/clock.js";
import { cropStage } from "../sim/farm.js";
import { spriteOf, uiSprite, SPR } from "./sprites.js";
import { Renderer, RenderView } from "./renderer.js";
import { skyState } from "./fpv.js";
import { MeshCache, FLOATS, MAX_FACES, SOLID } from "./chunkmesh.js";
import { obliqueVP, pickCell, KZ } from "./obmath.js";
import { OBLIQUE_PITCH } from "./camera.js";

const ATLAS = 1024, PER_ROW = ATLAS / SPR;
const MAX_SPRITES = 3200;
const MAX_CHUNKS_X = 17, MAX_CHUNKS_Y = 13;       // the most chunks drawn across and down: bounded work whatever the zoom
const BAND = [1, 0.74, 0.54, 0.4, 0.3];            // brightness of the level you look at and of each dimmed band below it

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aCol; layout(location=2) in vec2 aUV; layout(location=3) in vec2 aInfo; layout(location=4) in float aExt;
uniform mat4 uVP; uniform float uDz; uniform int uBB;
out vec3 vCol; out vec2 vUV; out vec2 vInfo; out vec3 vPos; flat out int vExt;
void main() {
  vCol = aCol; vUV = aUV; vInfo = aInfo; vPos = aPos; vExt = uBB == 1 ? 0 : int(aExt + 0.5);
  vec4 p = uVP * vec4(aPos, 1.0);
  if (uBB == 1) p.z -= aExt * uDz;
  gl_Position = p;
}`;
const FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vCol; in vec2 vUV; in vec2 vInfo; in vec3 vPos; flat in int vExt; out vec4 o;
uniform sampler2D uTex; uniform sampler2D uCapTex;
uniform int uMode; uniform float uCut; uniform int uSlice;
uniform vec3 uSky; uniform vec3 uAmbU; uniform vec3 uSun; uniform vec3 uSeason; uniform float uDay; uniform float uTime; uniform float uFlick;
uniform vec4 uL[8]; uniform int uNL; uniform vec4 uCa; uniform vec4 uPeek; uniform vec3 uPal[32]; uniform vec4 uCapBox;
float hsh(vec2 g) { return fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 torch(vec3 p) {
  vec3 tl = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uNL) break;
    float k = clamp(1.0 - length(p - uL[i].xyz) / uL[i].w, 0.0, 1.0);
    tl += vec3(1.0, 0.66, 0.34) * k * k * 1.7;
  }
  return tl * uFlick;
}
bool peeked(vec3 p) { return uPeek.w > 0.0 && abs(p.x - uPeek.x) < uPeek.w && abs(p.z - uPeek.z) < uPeek.w; }
vec3 unknownLook(vec2 uv, float seed, float h) {
  vec2 g = fract(uv * 3.0) - 0.5; float d = length(g);
  float dots = smoothstep(0.24, 0.15, d);
  float diag = step(0.9, fract((uv.x + uv.y) * 2.0 + seed));
  return vec3(0.1, 0.118, 0.17) + vec3(0.075, 0.09, 0.14) * dots + vec3(0.03, 0.036, 0.06) * diag + vec3(0.0, 0.0, 0.012) * h;
}
void main() {
  if (uMode == 1 || uMode == 6) {                     // a billboard (cut out), or its silhouette seen through the land
    vec4 t = texture(uTex, vUV);
    if (t.a < 0.5) discard;
    float sky = vInfo.x, emi = vInfo.y;
    vec3 lit = mix(uAmbU + vec3(0.1), uSky * 0.96 + 0.1, sky) + torch(vPos);
    vec3 col = t.rgb * vCol;
    vec3 c = mix(col * lit, col, emi);
    if (uMode == 6) { o = vec4(mix(c, vec3(0.78, 0.9, 1.0), 0.45), 0.34); return; }
    o = vec4(c, 1.0); return;
  }
  if (uMode == 2) { vec4 t = texture(uTex, vUV); o = vec4(0.0, 0.0, 0.0, t.a * 0.7); return; }
  if (uMode == 5) {                                    // the cut: the cells of level N the plane slices through
    vec2 w = vPos.xz - uCapBox.xy;
    ivec2 tc = ivec2(floor(w));
    vec4 t = texelFetch(uCapTex, tc, 0);
    if (t.a < 0.5) discard;
    int m = int(t.r * 255.0 + 0.5); int s = int(t.g * 255.0 + 0.5);
    if (s > 0 && peeked(vPos)) s = 0;
    vec2 f = fract(w);
    vec3 base = uPal[m];
    vec3 lit = vec3(0.7) * mix(0.55, 1.0, uDay) + torch(vPos);
    if (s > 0) { o = vec4(unknownLook(w, 0.3, 0.0) * (0.9 + torch(vPos) * 0.4), 1.0); return; }
    float hd = fract((w.x + w.y) * 2.0);
    float hatch = step(hd, 0.24);
    vec3 cut = base * 0.62 + vec3(0.05, 0.05, 0.07);
    cut = mix(cut, cut * 0.5, hatch);
    ivec2 sz = ivec2(uCapBox.zw);
    float rim = 0.0;
    if (tc.x > 0 && texelFetch(uCapTex, tc + ivec2(-1, 0), 0).a < 0.5) rim = max(rim, step(f.x, 0.14));
    if (tc.x + 1 < sz.x && texelFetch(uCapTex, tc + ivec2(1, 0), 0).a < 0.5) rim = max(rim, step(1.0 - f.x, 0.14));
    if (tc.y > 0 && texelFetch(uCapTex, tc + ivec2(0, -1), 0).a < 0.5) rim = max(rim, step(f.y, 0.14));
    if (tc.y + 1 < sz.y && texelFetch(uCapTex, tc + ivec2(0, 1), 0).a < 0.5) rim = max(rim, step(1.0 - f.y, 0.14));
    cut = mix(cut, min(base * 1.25 + 0.1, vec3(1.0)), rim);
    o = vec4(cut * lit, 1.0); return;
  }
  // ---- terrain (0) and the outline of the level above (4) ----
  int st = vExt & 3; int fd = (vExt >> 2) & 7; bool roof = ((vExt >> 5) & 1) == 1; bool water = ((vExt >> 6) & 1) == 1; bool ore = ((vExt >> 7) & 1) == 1; bool built = ((vExt >> 8) & 1) == 1;
  float h = vPos.y;
  float e = min(min(vUV.x, 1.0 - vUV.x), min(vUV.y, 1.0 - vUV.y));
  if (uMode == 4) {                                    // the level above: only the outline of its faces, faintly
    if (h <= uCut + 0.01 || h > uCut + 2.01 || e > 0.045 || !built || !(fd < 4 || roof)) discard;
    o = vec4(0.8, 0.88, 1.0, 0.34); return;
  }
  if (h > uCut + 0.002) discard;
  if (uSlice == 1 && fd == 4 && !water && abs(h - uCut) < 0.003) discard;      // the cap draws these
  if (roof && uCa.w > 0.0 && distance(vPos.xz, uCa.xz) < uCa.w) discard;        // roof cutaway round the selected slime
  if (st > 0 && peeked(vPos)) st = 0;
  vec3 n = fd == 0 ? vec3(1.0, 0.0, 0.0) : fd == 1 ? vec3(-1.0, 0.0, 0.0) : fd == 2 ? vec3(0.0, 0.0, 1.0) : fd == 3 ? vec3(0.0, 0.0, -1.0) : fd == 4 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, -1.0, 0.0);
  float ndl = max(dot(n, normalize(uSun)), 0.0);
  float sky = vInfo.x;
  vec3 col = vCol;
  vec2 g = floor(vUV * 8.0);
  float jit = 0.9 + 0.2 * hsh(g + vInfo.y * 61.7);
  col *= jit;
  if (ore) { vec2 gg = floor(vUV * 5.0); if (hsh(gg + vInfo.y * 17.3) > 0.74) col = mix(col, vec3(1.0), 0.5); }
  if (fd == 4 && sky > 0.5 && col.g > col.r * 1.12 && col.g > col.b * 1.2) col *= uSeason;
  if (water) col += vec3(0.0, 0.03, 0.06) * sin(vPos.x * 3.1 + uTime * 1.3) * sin(vPos.z * 2.7 + uTime);
  if (fd < 4) {                                        // a standing face: dark at its foot, a line at each cell edge, so cliffs read as stacked blocks
    float hv = fd < 2 ? vUV.y : vUV.x;
    col *= 0.74 + 0.26 * smoothstep(0.0, 0.65, hv);
    col *= mix(0.7, 1.0, smoothstep(0.0, 0.06, e));
  } else {
    col *= mix(0.84, 1.0, smoothstep(0.0, 0.06, e));
  }
  vec3 lit = mix(uAmbU * (0.8 + 0.2 * ndl) , uSky * (0.36 + 0.7 * ndl), sky) + torch(vPos);
  vec3 c = col * lit;
  if (uSlice == 1) {                                   // the levels below the cut: dimmed and cooled in bands
    float under = uCut - h;
    float band = clamp(floor(under - 0.999), 0.0, 4.0);
    int bi = int(band);
    float k = bi == 0 ? 1.0 : bi == 1 ? 0.74 : bi == 2 ? 0.54 : bi == 3 ? 0.4 : 0.3;
    c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), 0.12 * band) * k * mix(vec3(1.0), vec3(0.88, 0.95, 1.08), band / 4.0);
  }
  if (st == 1) { c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))) * 0.8 + vec3(0.02, 0.03, 0.07), 0.45) * 0.78; }
  else if (st == 2) { c = unknownLook(vUV + floor(vPos.xz), vInfo.y, h * 0.1) * (0.9 + 0.5 * dot(torch(vPos), vec3(0.33))); }
  o = vec4(c, 1.0);
}`;

function compile(gl, vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
  return p;
}
const PAL = new Float32Array(32 * 3);
MAT.forEach((m, i) => { if (i < 32) { PAL[i * 3] = m.color[0] / 255; PAL[i * 3 + 1] = m.color[1] / 255; PAL[i * 3 + 2] = m.color[2] / 255; } });
const PICKABLE_KINDS = ["plot", "plant", "grave", "flame", "furniture", "wagon", "item", "fauna", "villager"];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class ObliqueRenderer extends Renderer {
  constructor(canvas, cam, glCanvas) {
    super(canvas, cam);
    this.glCanvas = glCanvas; this.ok = false; this.ghostAbove = true;
    cam.setPitch(OBLIQUE_PITCH);
    this.plane = false;                      // build mode: the viewed level is the plane you paint on, so a bare toScreen(x, y) lands on it
    cam.ground = (x, y) => { if (this.plane) return this.z; const t = this.topAt(x, y); return t >= 0 ? t + 1 : this.z >= D - 1 ? cam.zf : Math.min(cam.zf, this.z + 1); };
    const gl = this.gl = glCanvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    if (!gl) return;
    try { this._init(gl); this.ok = true; } catch (e) { this.error = String(e.message || e); }
  }
  _init(gl) {
    this.prog = compile(gl, VS, FS);
    this.U = {}; for (const n of ["uVP", "uDz", "uBB", "uTex", "uCapTex", "uMode", "uCut", "uSlice", "uSky", "uAmbU", "uSun", "uSeason", "uDay", "uTime", "uFlick", "uL", "uNL", "uCa", "uPeek", "uPal", "uCapBox"]) this.U[n] = gl.getUniformLocation(this.prog, n);
    const idx = new Uint32Array(MAX_FACES * 6);
    for (let i = 0; i < MAX_FACES; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    this.ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.cache = new MeshCache(gl, (vbo) => this._vao(vbo), { bake: false, perFrame: 8 });
    this.meshes = this.cache.meshes;
    this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS, ATLAS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.capTex = gl.createTexture(); this.capKey = ""; this.capW = 0; this.capH = 0; this.capData = null;
    this.paintCv = document.createElement("canvas"); this.paintCv.width = this.paintCv.height = SPR; this.paintCx = this.paintCv.getContext("2d"); this.paintCx.imageSmoothingEnabled = false;
    this.slots = new Map(); this.next = 2; this._reserve();
    this.dyn = [this._dyn(MAX_SPRITES), this._dyn(MAX_SPRITES), this._dyn(2)];            // shadows, sprites, the cap quad
    this.dynBuf = [new Float32Array(MAX_SPRITES * 4 * FLOATS), new Float32Array(MAX_SPRITES * 4 * FLOATS), new Float32Array(2 * 4 * FLOATS)];
    this.anim = new Map(); this.heads = new Map(); this.drawn = []; this.shownMemo = new Map(); this.frameNo = 0;
    this.stats = { faces: 0, sprites: 0, ms: 0, cacheBuilds: 0 };
    this.fade = null; this.vp = new Float32Array(16); this.lastNow = performance.now();
    const fc = this.fadeCv = document.getElementById("fadecv"); if (fc) { fc.style.opacity = "0"; }
  }
  _reserve() { this.slot("#shadow", (c) => uiSprite(c, "shadow")); }
  _vao(vbo) {
    const gl = this.gl, vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    const S = FLOATS * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, S, 32);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, S, 40);
    return vao;
  }
  _dyn(quads) {
    const gl = this.gl, vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, quads * 4 * FLOATS * 4, gl.DYNAMIC_DRAW);
    return { vbo, vao: this._vao(vbo), n: 0 };
  }
  slot(key, paint) {
    let s = this.slots.get(key);
    if (s) return s;
    if (this.next >= PER_ROW * PER_ROW) { this.slots.clear(); this.next = 2; this._reserve(); }
    const i = this.next++, gx = (i % PER_ROW) * SPR, gy = Math.floor(i / PER_ROW) * SPR, c = this.paintCx, gl = this.gl;
    c.clearRect(0, 0, SPR, SPR); c.save(); paint(c); c.restore();
    gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, gx, gy, gl.RGBA, gl.UNSIGNED_BYTE, this.paintCv);
    const e = 0.4 / ATLAS;
    s = [gx / ATLAS + e, gy / ATLAS + e, (gx + SPR) / ATLAS - e, (gy + SPR) / ATLAS - e];
    this.slots.set(key, s);
    return s;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1, w = window.innerWidth, h = window.innerHeight, r = Math.min(dpr, 1.5);
    this.canvas.width = Math.floor(w * dpr); this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + "px"; this.canvas.style.height = h + "px"; this.dpr = dpr;
    const g = this.glCanvas; g.width = Math.max(2, Math.floor(w * r)); g.height = Math.max(2, Math.floor(h * r)); g.style.width = w + "px"; g.style.height = h + "px";
    if (this.fadeCv) { this.fadeCv.width = g.width; this.fadeCv.height = g.height; this.fadeCv.style.width = w + "px"; this.fadeCv.style.height = h + "px"; }
    this.cam.resize(w, h);
  }

  /** The viewed level: D - 1 is the Surface; below it a slice. A change cross-fades (about 160 ms) from a snapshot of the old picture. */
  setZ(z) {
    const nz = Math.max(0, Math.min(D - 1, z));
    if (nz !== this.z && this.ok && this.fadeCv && this.glCanvas.width > 2 && this.lastDrawn) {
      const c = this.fadeCv; c.getContext("2d").drawImage(this.glCanvas, 0, 0);
      c.style.transition = "none"; c.style.opacity = "1"; void c.offsetWidth;
      if (!this.access.calm) { c.style.transition = "opacity 160ms ease-out"; c.style.opacity = "0"; } else c.style.opacity = "0";
    }
    this.z = nz; if (this.peek && this.peek.z !== this.z) this.peek = null;
    this._focusZ();
  }
  /** The height of the focus plane: the camp's standing level in the Surface view, else the viewed level (so the slice you are in stays at the middle of the screen). */
  _focusZ() { const sim = this.sim; this.cam.zf = this.z >= D - 1 ? (sim ? (sim.stock ? sim.stock.z : sim.site.z + 1) : 14) : this.z; }

  topAt(x, y) { return this.view ? this.view.topZ(x, y, this.z) : -1; }

  /** Is this entity on the viewed level and in the line of sight (not under rock or behind a wall the camera can see)? Memoised per frame. */
  isShown(e) {
    const v = this.vis;
    if (!v || e.x < v.x0 || e.x > v.x1 || e.y < v.y0 - 4 || e.y > v.y1 + 4 || e.z > this.z + 0 || !this.view) return false;
    let m = this.shownMemo.get(e.id);
    if (m !== undefined) return m;
    const cam = this.cam, view = this.view, N = this.z;
    let x = e.x + 0.5, y = e.y + 0.5, z = e.z + 0.5, ok = true;
    const dy = cam.cosP, dz = cam.sinP;
    for (let i = 0, t = 0; i < 64 && z < D + 1 && z <= N + 1; i++) {                // walk up the line of sight, a quarter cell at a time
      t += 0.25; y = e.y + 0.5 + t * dy; z = e.z + 0.5 + t * dz;
      const cz = Math.floor(z);
      if (cz > N || cz >= D) break;
      if (cz === e.z && Math.floor(y) === e.y) continue;
      const mm = view.mat(e.x, Math.floor(y), cz);
      if (SOLID[mm] || (mm === M.WATER && cz < e.z)) { ok = false; break; }
    }
    this.shownMemo.set(e.id, ok);
    return ok;
  }

  /** Where a thing is drawn (cells, centre): villagers and creatures glide between cells. */
  drawPos(e) { const a = this.anim.get(e.id); return a && (e.kind === "villager" || e.kind === "fauna") ? [a.x + 0.5, a.y + 0.5] : [e.x + 0.5, e.y + 0.5]; }
  /** The exact cell under a pixel (a ray through the grid respecting the clip plane): {x, y, z (the cell hit), nx, ny, nz} or null. */
  cellAt(sx, sy) {
    if (!this.view) return null;
    this.view.reset();
    return pickCell(this.cam, sx, sy, (x, y, z) => { const m = this.view.mat(x, y, z); return SOLID[m] === 1 || m === M.WATER; }, this.z, D);
  }

  /** opts.zones is ignored here (zones are overlays). */
  draw(sim, opts = {}) {
    const t0 = performance.now(), { ctx, cam, z } = this, gl = this.gl;
    this.sim = sim; this.frameNo++; this.shownMemo.clear();
    const dt = Math.min(0.05, (t0 - this.lastNow) / 1000); this.lastNow = t0;
    if (!this.view || this.view.world !== sim.world) this.view = new RenderView(sim.world);
    this.view.reset();
    this._focusZ();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, cam.vw, cam.vh);
    const vis = this.vis = cam.visible();
    this.tx0 = vis.x0; this.ty0 = vis.y0; this.tw = vis.x1 - vis.x0 + 1; this.th = vis.y1 - vis.y0 + 1;
    const lights = lightSources(sim);
    if (this.peek) lights.push([this.peek.x, this.peek.y, this.peek.z, 6.5]);
    this.lights = lights;
    // the chunk box (bounded whatever the zoom)
    let cx0 = Math.floor((vis.x0 - 1) / 16), cx1 = Math.floor((vis.x1 + 1) / 16), cy0 = Math.floor((vis.y0 - 1) / 16), cy1 = Math.floor((vis.y1 + 1) / 16);
    const ccx = Math.floor(cam.x / 16), ccy = Math.floor(cam.y / 16);
    if (cx1 - cx0 + 1 > MAX_CHUNKS_X) { cx0 = ccx - (MAX_CHUNKS_X >> 1); cx1 = cx0 + MAX_CHUNKS_X - 1; }
    if (cy1 - cy0 + 1 > MAX_CHUNKS_Y) { cy0 = ccy - (MAX_CHUNKS_Y >> 1); cy1 = cy0 + MAX_CHUNKS_Y - 1; }
    this.cache.sync(sim, this.view, cx0, cx1, cy0, cy1, cam.x, cam.y);
    const S = skyState(sim.tick), calm = this.access.calm, now = performance.now();
    const W = this.glCanvas.width, H = this.glCanvas.height, slice = z < D - 1;
    gl.viewport(0, 0, W, H); gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0.043, 0.055, 0.075, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.vp = obliqueVP(cam);
    gl.useProgram(this.prog);
    const U = this.U, sp = cam.sinP;
    gl.uniformMatrix4fv(U.uVP, false, this.vp); gl.uniform1f(U.uDz, KZ * sp); gl.uniform1i(U.uBB, 0);
    // light: the sun from the south-west and high at noon, swinging with the day; underground only the ambient floor and the torches
    const sun = [S.sun[0] * 0.5, 0.38 + 0.62 * Math.max(0, S.sun[1]), 0.24];
    gl.uniform3fv(U.uSun, sun); gl.uniform3fv(U.uSky, S.sky); gl.uniform3f(U.uAmbU, 0.3, 0.325, 0.42); gl.uniform1f(U.uDay, S.day);
    const si = seasonIdx(sim.tick), within = (dayF(sim.tick) % DAYS_PER_SEASON) / DAYS_PER_SEASON;
    const SEASON = [[0.95, 1.06, 0.96], [1.04, 1.02, 0.9], [1.1, 0.9, 0.74], [0.86, 0.96, 1.1]][si] || [1, 1, 1];
    void within;
    gl.uniform3fv(U.uSeason, SEASON); gl.uniform1f(U.uTime, calm ? 0 : now / 1000); gl.uniform1f(U.uFlick, calm ? 1 : 1 + 0.07 * Math.sin(now / 90) + 0.04 * Math.sin(now / 37));
    const near = lights.filter(l => Math.abs(l[0] - cam.x) < 90 && Math.abs(l[1] - cam.y) < 70).sort((a, b) => ((a[0] - cam.x) ** 2 + (a[1] - cam.y) ** 2) - ((b[0] - cam.x) ** 2 + (b[1] - cam.y) ** 2));
    const nl = Math.min(8, near.length), la = new Float32Array(32);
    for (let i = 0; i < nl; i++) { la[i * 4] = near[i][0] + 0.5; la[i * 4 + 1] = near[i][2] + 0.7; la[i * 4 + 2] = near[i][1] + 0.5; la[i * 4 + 3] = near[i][3]; }
    gl.uniform4fv(U.uL, la); gl.uniform1i(U.uNL, nl);
    const ca = this._cutaway(sim); gl.uniform4f(U.uCa, ca[0], 0, ca[1], ca[2]);
    const pk = this.peek; gl.uniform4f(U.uPeek, pk ? pk.x + 0.5 : 0, pk ? pk.z : 0, pk ? pk.y + 0.5 : 0, pk ? pk.r : 0);
    gl.uniform3fv(U.uPal, PAL);
    gl.uniform1i(U.uSlice, slice ? 1 : 0); gl.uniform1f(U.uCut, slice ? z + 1 : 1e4);
    gl.uniform1i(U.uTex, 0); gl.uniform1i(U.uCapTex, 1); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // terrain
    gl.uniform1i(U.uMode, 0);
    let faces = 0;
    for (const m of this.meshes.values()) { if (!m.n || m.cx < cx0 || m.cx > cx1 || m.cy < cy0 || m.cy > cy1) continue; gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n * 6, gl.UNSIGNED_INT, 0); faces += m.n; }
    // the cut
    if (slice) this._cap(sim, cx0, cx1, cy0, cy1);
    // billboards (shadows, then the sprites themselves, then villagers' silhouettes through the land)
    this._sprites(sim, S, dt, now, vis);
    gl.uniform1i(U.uBB, 1); gl.uniform1i(U.uMode, 2); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -2); this._flush(0); gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.uniform1i(U.uMode, 1); this._flush(1);
    if (this.silCount) {
      gl.uniform1i(U.uMode, 6); gl.enable(gl.BLEND); gl.depthMask(false); gl.depthFunc(gl.GREATER);
      gl.bindVertexArray(this.dyn[1].vao); gl.drawElements(gl.TRIANGLES, this.silCount * 6, gl.UNSIGNED_INT, this.silStart * 24);
      gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
    }
    gl.uniform1i(U.uBB, 0);
    // the level above: a faint outline (toggleable)
    if (slice && this.ghostAbove && !(opts.noGhost)) {
      gl.uniform1i(U.uMode, 4); gl.enable(gl.BLEND); gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
      for (const m of this.meshes.values()) { if (!m.n || m.cx < cx0 || m.cx > cx1 || m.cy < cy0 || m.cy > cy1) continue; gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n * 6, gl.UNSIGNED_INT, 0); }
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
    this.lastDrawn = true;
    this.stats.faces = faces; this.stats.cacheBuilds = this.cache.builds; this.stats.ms = performance.now() - t0;
  }

  /** The roof cutaway: roofs round the selected slime (or room) are hidden in the Surface view so you can see who is inside. -> [x, z, r] in GL axes (r = 0: none). */
  _cutaway(sim) {
    const g = this.cutawayFor;
    if (!g) return [0, 0, 0];
    const e = sim.ents.get(g);
    return e ? [e.x + 0.5, e.y + 0.5, 6.5] : [0, 0, 0];
  }

  /** Build the cap texture (the material, view state and solidity of every cell of level N in the chunk box) when it changed, and draw its quad at the plane. */
  _cap(sim, cx0, cx1, cy0, cy1) {
    const gl = this.gl, N = this.z, w = (cx1 - cx0 + 1) * 16, h = (cy1 - cy0 + 1) * 16, seen = sim.seen, view = this.view;
    const key = N + ":" + cx0 + "," + cx1 + "," + cy0 + "," + cy1 + ":" + sim.world.version + ":" + seen.ver;
    const now = performance.now();
    if (key !== this.capKey && (now - (this.capAt || 0) > 160 || this.capBoxKey !== key.split(":").slice(0, 2).join(":"))) {
      this.capKey = key; this.capAt = now; this.capBoxKey = key.split(":").slice(0, 2).join(":");
      if (!this.capData || this.capData.length !== w * h * 4) this.capData = new Uint8Array(w * h * 4);
      const d = this.capData;
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const c = view._get(cx, cy), mats = c.mats, sa = seen.b.get(chunkKey(cx, cy));
        for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
          const i = (N << 8) | (ly << 4) | lx, m = mats[i], o = (((cy - cy0) * 16 + ly) * w + (cx - cx0) * 16 + lx) * 4;
          d[o] = m < 32 ? m : 3; d[o + 1] = sa && sa[i] ? 0 : 2; d[o + 2] = 0; d[o + 3] = SOLID[m] ? 255 : 0;
        }
      }
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.capTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.capW = w; this.capH = h; gl.activeTexture(gl.TEXTURE0);
    }
    const x0 = cx0 * 16, y0 = cy0 * 16, zz = N + 1, b = this.dynBuf[2], U = this.U;
    const P = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
    for (let q = 0; q < 4; q++) { const i = q * FLOATS; b[i] = P[q][0]; b[i + 1] = zz; b[i + 2] = P[q][1]; b[i + 3] = b[i + 4] = b[i + 5] = 1; b[i + 6] = q === 1 || q === 2 ? 1 : 0; b[i + 7] = q >= 2 ? 1 : 0; b[i + 8] = 0; b[i + 9] = 0; b[i + 10] = 0; }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn[2].vbo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, b, 0, 4 * FLOATS);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.capTex); gl.activeTexture(gl.TEXTURE0);
    gl.uniform4f(U.uCapBox, x0, y0, w, h); gl.uniform1i(U.uMode, 5);
    gl.bindVertexArray(this.dyn[2].vao); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);
  }

  _flush(i) { const gl = this.gl, d = this.dyn[i]; if (!d.n) return; gl.bindVertexArray(d.vao); gl.drawElements(gl.TRIANGLES, d.n * 6, gl.UNSIGNED_INT, 0); }

  /** Build the billboards. Each is a camera-facing quad standing on its cell, squashed and stretched a little (a slime breathes, hops when it walks). */
  _sprites(sim, S, dt, now, vis) {
    const gl = this.gl, sh = this.dynBuf[0], sp = this.dynBuf[1], cam = this.cam, N = this.z, calm = this.access.calm, tick = sim.tick;
    const SP = cam.sinP, CP = cam.cosP, seen = sim.seen, view = this.view;
    const drawn = this.drawn; drawn.length = 0;
    let ns = 0, nq = 0;
    const sh0 = this.slots.get("#shadow"), anim = this.anim;
    const x0 = vis.x0 - 3, x1 = vis.x1 + 3, y0 = vis.y0 - 3, y1 = vis.y1 + 5;
    const sil = [];
    const BIAS = { plot: 0, plant: 0, grave: 0.02, flame: 0.5, furniture: 0.04, wagon: 0.04, item: 0.06, fauna: 0.12, villager: 0.2 };
    const put = (e, spr, px, py, ez, kind, extra) => {
      if (nq >= MAX_SPRITES) return;
      const s = this.slot(spr.key, spr.paint);
      let sky = 1;
      for (let k = 1; k <= 4; k++) if (isNatural(view.mat(e.x, e.y, ez + k))) { sky = 0; break; }
      let w = spr.w, h = spr.h, hop = 0;
      if (extra && extra.sq) { const sy = extra.sq; w *= 1 / Math.sqrt(sy); h *= sy; hop = extra.hop || 0; }
      const hw = w / 2, base = ez + 0.02 + hop;
      const band = Math.max(0, Math.min(4, N < D - 1 ? N - ez : 0)), tint = BAND[band];
      const cx = px, cy = py, ux = -SP, uz = CP;                              // the camera's up in sim axes: (0, -sinP, cosP)
      const o = nq * 4 * FLOATS;
      const bs = BIAS[kind] || 0, V = [[cx - hw, cy, base, s[0], s[3], bs], [cx + hw, cy, base, s[2], s[3], bs], [cx + hw, cy + ux * h, base + uz * h, s[2], s[1], h + bs], [cx - hw, cy + ux * h, base + uz * h, s[0], s[1], h + bs]];
      for (let q = 0; q < 4; q++) { const i = o + q * FLOATS, v = V[q]; sp[i] = v[0]; sp[i + 1] = v[2]; sp[i + 2] = v[1]; sp[i + 3] = sp[i + 4] = sp[i + 5] = tint; sp[i + 6] = v[3]; sp[i + 7] = v[4]; sp[i + 8] = sky; sp[i + 9] = spr.em; sp[i + 10] = v[5]; }
      const idx = nq; nq++;
      const sw = Math.min(spr.w, 1) * 0.5, so = ns * 4 * FLOATS, yy = base - 0.005;
      const SPp = [[cx - sw, cy - sw, sh0[0], sh0[1]], [cx + sw, cy - sw, sh0[2], sh0[1]], [cx + sw, cy + sw, sh0[2], sh0[3]], [cx - sw, cy + sw, sh0[0], sh0[3]]];
      for (let q = 0; q < 4; q++) { const i = so + q * FLOATS, v = SPp[q]; sh[i] = v[0]; sh[i + 1] = yy - hop; sh[i + 2] = v[1]; sh[i + 3] = sh[i + 4] = sh[i + 5] = 1; sh[i + 6] = v[2]; sh[i + 7] = v[3]; sh[i + 8] = sky; sh[i + 9] = 0; sh[i + 10] = 0; }
      ns++;
      const [sx, sy] = cam.toScreen(px, py, ez), zm = cam.zoom;
      drawn.push({ e, l: sx - hw * zm, r: sx + hw * zm, t: sy - h * zm, b: sy + 2, fx: sx, fy: sy, pri: kind, idx });
      if (kind === "villager" && ez >= this.topAt(e.x, e.y)) sil.push(idx);
    };
    const kinds = PICKABLE_KINDS, headFx = 0, headFy = -1;
    for (const kind of kinds) {
      const list = sim.ents.ofKind(kind);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1 || e.z > N) continue;
        if (kind !== "villager" && !(seen.b.size && (seenCell(seen, e.x, e.y, e.z) || seenCell(seen, e.x, e.y, e.z - 1)))) continue;      // never shown where nobody has looked
        let px = e.x + 0.5, py = e.y + 0.5, back = false, info = null, extra = null;
        if (kind === "villager" || kind === "fauna") {
          let a = anim.get(e.id);
          if (!a) anim.set(e.id, a = { x: e.x, y: e.y, mt: -1e9, hx: 0, hy: 1, ph: (e.id * 2.399) % 6.28, t: tick });
          if (Math.abs(a.x - e.x) + Math.abs(a.y - e.y) > 3) { a.x = e.x; a.y = e.y; }
          const k = 1 - Math.exp(-dt * 16);
          if (a.lx !== e.x || a.ly !== e.y) { if (a.lx !== undefined) { a.hx = Math.sign(e.x - a.lx); a.hy = Math.sign(e.y - a.ly); } a.lx = e.x; a.ly = e.y; a.mt = now; }
          a.x += (e.x - a.x) * k; a.y += (e.y - a.y) * k; a.t = tick;
          px = a.x + 0.5; py = a.y + 0.5;
          back = a.hx * headFx + a.hy * headFy > 0.3 && !(kind === "villager" && e.slp === 1);
          const moving = now - a.mt < 260 || Math.abs(a.x - e.x) + Math.abs(a.y - e.y) > 0.08;
          if (kind === "villager" && !calm) {
            const asleep = e.slp === 1, ph = a.ph + now / 1000;
            if (asleep) extra = { sq: 0.8 + 0.02 * Math.sin(ph), hop: 0 };
            else if (moving) { const hp = Math.abs(Math.sin(now / 95 + a.ph)); extra = { sq: 1 + 0.1 * hp - 0.03, hop: hp * 0.18 }; }
            else extra = { sq: 1 + 0.04 * Math.sin(ph * 2) };
          }
        } else if (kind === "plant" && e.species === "tree") info = { pine: view.biomeAt(e.x, e.y) === HIGHLAND };
        else if (kind === "plot") info = { stage: cropStage(e), wet: e.wt > tick };
        const spr = spriteOf(e, sim, back, info || {});
        if (!spr) continue;
        put(e, spr, px, py, e.z, kind, extra);
      }
    }
    this.dyn[0].n = ns; this.dyn[1].n = nq; this.stats.sprites = nq;
    if (ns) { gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn[0].vbo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, sh, 0, ns * 4 * FLOATS); }
    if (nq) { gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn[1].vbo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, sp, 0, nq * 4 * FLOATS); }
    // silhouettes of villagers behind hills: the same quads again, drawn where the land hides them (they are appended after the others, so one draw call per set is kept by index list)
    this.silCount = 0;
    if (sil.length) {
      const gl2 = this.gl, at = nq;
      let n = 0;
      for (const idx of sil) { if (at + n >= MAX_SPRITES) break; sp.copyWithin((at + n) * 4 * FLOATS, idx * 4 * FLOATS, (idx + 1) * 4 * FLOATS); n++; }
      if (n) { gl2.bindBuffer(gl2.ARRAY_BUFFER, this.dyn[1].vbo); gl2.bufferSubData(gl2.ARRAY_BUFFER, at * 4 * FLOATS * 4, sp, at * 4 * FLOATS, n * 4 * FLOATS); this.silStart = at; this.silCount = n; }
    }
    if (anim.size > 800) for (const [id, a] of anim) if (tick - a.t > 60) anim.delete(id);
  }

  /** The frontmost drawn thing whose sprite is under a pixel: {e, kind} or null (villagers first). */
  spriteAt(sx, sy) {
    let best = null;
    for (let i = this.drawn.length - 1; i >= 0; i--) {
      const d = this.drawn[i];
      if (sx < d.l - 3 || sx > d.r + 3 || sy < d.t - 3 || sy > d.b + 3) continue;
      if (d.pri === "plot") continue;
      if (!best || (d.pri === "villager" && best.pri !== "villager") || (d.pri === best.pri && d.e.y > best.e.y)) best = d;
    }
    return best;
  }
  /** r, g, b of the map at a pixel (CSS px), the GL canvas under the overlay (tests, screenshots). */
  pixelAt(sx, sy) {
    const gl = this.gl, g = this.glCanvas, b = new Uint8Array(4), x = Math.floor(sx / this.cam.vw * g.width), y = g.height - 1 - Math.floor(sy / this.cam.vh * g.height);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
    return [b[0], b[1], b[2]];
  }
  dispose() { if (this.gl) this.cache.dispose(); }
}
function seenCell(s, x, y, z) {
  const a = s.b.get(chunkKey(x >> 4, y >> 4));
  return a && z >= 0 && z < D ? a[(z << 8) | ((y & 15) << 4) | (x & 15)] : 0;
}
