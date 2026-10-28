// The first-person renderer (S18, GDD §07 R2: "a second renderer on the same sim"). Raw WebGL2, no dependencies. It READS the sim and never writes it:
//   terrain   every 16 x 16 x D chunk within VIEW_R cells of the eye becomes one mesh of per-face quads (a face is emitted where a solid cell meets an open one, so
//             hills, cliffs, stairs, tunnels and cave ceilings are all just faces - every z-level is in the mesh at once and the depth buffer sorts them). Corners get
//             ambient occlusion; unseen cells are baked dark. A chunk's mesh is rebuilt when a cheap signature of it (and its four neighbours) changes, a few per frame.
//   sprites   villagers, creatures, plants, items, furniture: procedural canvases (sprites.js) in one atlas, drawn as upright billboards with a soft ground shadow.
//   light     the sky (day/night, the season) lights open faces; underground only torches, lamps and fires do (lightSources, within their sim radius); fog by distance.
// Cells come from the renderer's own chunk view (RenderView): resident chunks as they are, anything else regrown in the renderer's bounded cache, so this
// never makes a sim chunk resident. Work per frame is bounded by VIEW_R, not by the size of the world.
import { D } from "../sim/world.js";
import { chunkKey } from "../sim/cellkey.js";
import { HIGHLAND } from "../sim/biome.js";
import { lightSources, isNatural } from "../sim/light.js";
import { phase, warmthAt } from "../sim/season.js";
import { cropStage } from "../sim/farm.js";
import { spriteOf, uiSprite, SPR } from "./sprites.js";
import { perspective, lookAlong, mul, project, lookDir } from "./fpvmath.js";
import { MeshCache, FLOATS, MAX_FACES } from "./chunkmesh.js";

export const VIEW_R = 28;                      // cells: the meshes cover this far; fog hides the rest
export const FOG_START = 12;
export const FOG_END = 27;
export const FOV = 1.22;                       // vertical, radians (about 70 degrees)
const SPRITE_R = 24;                           // billboards within this many cells
const MAX_SPRITES = 1400;
const ATLAS = 512, PER_ROW = ATLAS / SPR;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * The sky for a tick (pure): how much daylight there is (0 night .. 1 day), the light that open faces get (day, dusk gold, night blue, a cooler winter and a warmer
 * summer from season.js), the horizon and zenith colours, and the sun and moon directions (GL axes: x east, y up, z south).
 */
export function skyState(tick) {
  const p = phase(tick), d = p < 0.5 ? smooth(0.04, 0.16, p) : 1 - smooth(0.74, 0.86, p), gold = 4 * d * (1 - d);
  const w = warmthAt(tick), season = mix3([0.93, 0.98, 1.06], [1.04, 1, 0.93], w);
  let sky = mix3([0.19, 0.24, 0.42], [1.03, 1, 0.96], d);
  sky = [(sky[0] + gold * 0.2) * season[0], (sky[1] + gold * 0.04) * season[1], (sky[2] - gold * 0.1) * season[2]];
  const hor = mix3(mix3([0.04, 0.06, 0.15], [0.7, 0.83, 0.95], d), [1, 0.6, 0.38], gold * 0.8), top = mix3([0.008, 0.015, 0.06], [0.3, 0.5, 0.86], d);
  const a = (p - 0.1) / 0.7 * Math.PI, sun = [Math.cos(a), Math.sin(a), 0.25];
  const b = (p >= 0.8 ? p - 0.8 : p + 0.2) / 0.3 * Math.PI, moon = [Math.cos(b), Math.sin(b), -0.2];
  return { day: d, sky, hor: [hor[0] * season[0], hor[1] * season[1], hor[2] * season[2]], top, sun, moon, night: 1 - d };
}

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aCol; layout(location=2) in vec2 aUV; layout(location=3) in vec2 aInfo;
uniform mat4 uVP; out vec3 vCol; out vec2 vUV; out vec2 vInfo; out vec3 vPos;
void main() { vCol = aCol; vUV = aUV; vInfo = aInfo; vPos = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec3 vCol; in vec2 vUV; in vec2 vInfo; in vec3 vPos; out vec4 o;
uniform sampler2D uTex; uniform int uMode; uniform vec3 uEye; uniform vec3 uSky; uniform vec3 uAmb; uniform vec3 uFogSky; uniform vec3 uFogDark; uniform vec2 uFog;
uniform vec4 uL[8]; uniform int uNL; uniform float uFlick;
void main() {
  vec3 col; float a = 1.0, emi = 0.0, sky = vInfo.x;
  if (uMode == 0) {
    vec2 g = floor(vUV * 8.0);
    float h = fract(sin(dot(g + vInfo.y * 61.7, vec2(12.9898, 78.233))) * 43758.5453);
    float e = min(min(vUV.x, 1.0 - vUV.x), min(vUV.y, 1.0 - vUV.y));
    col = vCol * (0.87 + 0.26 * h) * mix(0.8, 1.0, smoothstep(0.0, 0.07, e));
  } else {
    vec4 t = texture(uTex, vUV);
    if (uMode == 1 && t.a < 0.5) discard;
    col = t.rgb * vCol; a = t.a; emi = vInfo.y;
    if (uMode == 3) { o = vec4(col, a); return; }
  }
  vec3 lit = sky * uSky + uAmb, tl = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uNL) break;
    float k = clamp(1.0 - length(vPos - uL[i].xyz) / uL[i].w, 0.0, 1.0);
    tl += vec3(1.0, 0.66, 0.34) * k * k * 1.6;
  }
  vec3 c = mix(col * (lit + tl * uFlick), col, emi);
  float f = clamp((length(vPos - uEye) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  o = vec4(mix(c, mix(uFogDark, uFogSky, sky), f * f), a);
}`;
const SKY_VS = `#version 300 es
layout(location=0) in vec2 aP; out vec2 vP; void main() { vP = aP; gl_Position = vec4(aP, 0.9999, 1.0); }`;
const SKY_FS = `#version 300 es
precision highp float;
in vec2 vP; out vec4 o;
uniform vec3 uF; uniform vec3 uR; uniform vec3 uU; uniform float uT; uniform float uAsp; uniform vec3 uHor; uniform vec3 uTop; uniform vec3 uSun; uniform vec3 uMoon; uniform float uNight; uniform float uUnder;
void main() {
  vec3 d = normalize(uF + uR * vP.x * uT * uAsp + uU * vP.y * uT);
  vec3 c = mix(uHor, uTop, pow(clamp(d.y, 0.0, 1.0), 0.55));
  float sd = dot(d, normalize(uSun)), md = dot(d, normalize(uMoon));
  c += vec3(1.0, 0.92, 0.7) * (smoothstep(0.9988, 0.9996, sd) * 1.6 + pow(max(sd, 0.0), 48.0) * 0.22) * (1.0 - uNight * 0.2);
  c += vec3(0.8, 0.88, 1.0) * smoothstep(0.9993, 0.9997, md) * uNight;
  vec3 g = floor(d * 280.0); float s = fract(sin(dot(g, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  if (s > 0.9965 && d.y > 0.02) c += vec3(0.85) * uNight * (s - 0.9965) * 220.0;
  o = vec4(mix(c, vec3(0.006, 0.008, 0.014), uUnder), 1.0);
}`;

function compile(gl, vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
  return p;
}

export class FpvRenderer {
  constructor(canvas) {
    this.canvas = canvas; this.ok = false;
    const gl = this.gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
    if (!gl) return;
    try { this._init(gl); this.ok = true; } catch (e) { this.error = String(e.message || e); }
  }
  _init(gl) {
    this.prog = compile(gl, VS, FS); this.skyProg = compile(gl, SKY_VS, SKY_FS);
    this.U = {}; for (const n of ["uVP", "uTex", "uMode", "uEye", "uSky", "uAmb", "uFogSky", "uFogDark", "uFog", "uL", "uNL", "uFlick"]) this.U[n] = gl.getUniformLocation(this.prog, n);
    this.SU = {}; for (const n of ["uF", "uR", "uU", "uT", "uAsp", "uHor", "uTop", "uSun", "uMoon", "uNight", "uUnder"]) this.SU[n] = gl.getUniformLocation(this.skyProg, n);
    // the shared quad index buffer (0 1 2, 0 2 3 per quad)
    const idx = new Uint32Array(MAX_FACES * 6);
    for (let i = 0; i < MAX_FACES; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    this.ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.skyVao = gl.createVertexArray(); gl.bindVertexArray(this.skyVao);
    const sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS, ATLAS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.paintCv = document.createElement("canvas"); this.paintCv.width = this.paintCv.height = SPR; this.paintCx = this.paintCv.getContext("2d"); this.paintCx.imageSmoothingEnabled = false;
    this.slots = new Map(); this.next = 2;
    this.slot("#shadow", (c) => uiSprite(c, "shadow")); this.slot("#hl", (c) => uiSprite(c, "hl"));
    this.dyn = [this._dyn(MAX_SPRITES * 2), this._dyn(MAX_SPRITES), this._dyn(8)];           // shadows, sprites, overlays
    this.dynBuf = [new Float32Array(MAX_SPRITES * 2 * 4 * FLOATS), new Float32Array(MAX_SPRITES * 4 * FLOATS), new Float32Array(8 * 4 * FLOATS)];
    this.cache = new MeshCache(gl, (vbo) => this._vao(vbo, this.ibo), { bake: true, perFrame: 6 }); this.meshes = this.cache.meshes;
    this.facesDrawn = 0; this.spritesDrawn = 0; this.targets = []; this.heads = new Map(); this.stats = this.cache;
    this.eyeUnder = false; this.vp = new Float32Array(16); this.w = 1; this.h = 1;
  }
  _vao(vbo, ibo) {
    const gl = this.gl, vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
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
    return { vbo, vao: this._vao(vbo, this.ibo), n: 0 };
  }

  resize(cssW, cssH) {
    const r = Math.min(window.devicePixelRatio || 1, 1.5), w = Math.max(2, Math.floor(cssW * r)), h = Math.max(2, Math.floor(cssH * r));
    if (this.w === cssW && this.h === cssH && this.canvas.width === w && this.canvas.height === h) return;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.canvas.style.width = cssW + "px"; this.canvas.style.height = cssH + "px"; this.w = cssW; this.h = cssH;
  }

  /** The atlas slot of a sprite key: painted the first time it is wanted. -> [u0, v0, u1, v1] */
  slot(key, paint) {
    let s = this.slots.get(key);
    if (s) return s;
    if (this.next >= PER_ROW * PER_ROW) { this.slots.clear(); this.next = 2; this.slot("#shadow", (c) => uiSprite(c, "shadow")); this.slot("#hl", (c) => uiSprite(c, "hl")); }
    const i = this.next++, gx = (i % PER_ROW) * SPR, gy = Math.floor(i / PER_ROW) * SPR, c = this.paintCx, gl = this.gl;
    c.clearRect(0, 0, SPR, SPR); c.save(); paint(c); c.restore();
    gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, gx, gy, gl.RGBA, gl.UNSIGNED_BYTE, this.paintCv);
    const e = 0.4 / ATLAS;
    s = [gx / ATLAS + e, gy / ATLAS + e, (gx + SPR) / ATLAS - e, (gy + SPR) / ATLAS - e];
    this.slots.set(key, s);
    return s;
  }

  // ---- the frame ----

  /**
   * cam = {x, y, z (the eye, sim axes), yaw, pitch}. opts = {calm (reduced flashing), target (the cell face to outline: {x,y,z,nx,ny,nz})}.
   * Leaves this.vp, this.targets (the things a crosshair can pick) and this.eyeUnder for the caller.
   */
  draw(sim, view, cam, opts = {}) {
    const gl = this.gl, tick = sim.tick, now = performance.now();
    view.reset();
    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    const asp = W / H, d = lookDir(cam.yaw, cam.pitch), fGL = [d[0], d[2], d[1]], eGL = [cam.x, cam.z, cam.y];
    const proj = perspective(FOV, asp, 0.05, VIEW_R + 6), vm = lookAlong(eGL, fGL);
    this.vp = mul(proj, vm);
    const ex = Math.floor(cam.x), ey = Math.floor(cam.y), ez = Math.floor(cam.z);
    let under = false;
    for (let k = 1; k <= 4 && !under; k++) if (isNatural(view.mat(ex, ey, ez + k))) under = true;
    this.eyeUnder = under;
    const S = skyState(tick), lights = lightSources(sim).filter(l => Math.abs(l[0] - cam.x) < VIEW_R + 8 && Math.abs(l[1] - cam.y) < VIEW_R + 8);
    lights.sort((a, b) => ((a[0] - cam.x) ** 2 + (a[1] - cam.y) ** 2 + (a[2] - cam.z) ** 2) - ((b[0] - cam.x) ** 2 + (b[1] - cam.y) ** 2 + (b[2] - cam.z) ** 2));
    const nl = Math.min(8, lights.length), la = new Float32Array(32);
    for (let i = 0; i < nl; i++) { la[i * 4] = lights[i][0] + 0.5; la[i * 4 + 1] = lights[i][2] + 0.7; la[i * 4 + 2] = lights[i][1] + 0.5; la[i * 4 + 3] = lights[i][3]; }

    gl.disable(gl.BLEND); gl.depthMask(true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // sky
    gl.disable(gl.DEPTH_TEST); gl.useProgram(this.skyProg); gl.bindVertexArray(this.skyVao);
    const SU = this.SU, tanY = Math.tan(FOV / 2), rGL = [-fGL[2], 0, fGL[0]], rl = Math.hypot(rGL[0], rGL[2]) || 1, rr = [rGL[0] / rl, 0, rGL[2] / rl];
    const uu = [rr[1] * fGL[2] - rr[2] * fGL[1], rr[2] * fGL[0] - rr[0] * fGL[2], rr[0] * fGL[1] - rr[1] * fGL[0]];
    gl.uniform3fv(SU.uF, fGL); gl.uniform3fv(SU.uR, rr); gl.uniform3fv(SU.uU, uu); gl.uniform1f(SU.uT, tanY); gl.uniform1f(SU.uAsp, asp);
    gl.uniform3fv(SU.uHor, S.hor); gl.uniform3fv(SU.uTop, S.top); gl.uniform3fv(SU.uSun, S.sun); gl.uniform3fv(SU.uMoon, S.moon);
    gl.uniform1f(SU.uNight, S.night); gl.uniform1f(SU.uUnder, under ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);

    // terrain
    const R = VIEW_R + 2;
    this.cache.sync(sim, view, Math.floor((ex - R) / 16), Math.floor((ex + R) / 16), Math.floor((ey - R) / 16), Math.floor((ey + R) / 16), ex, ey);
    this.rebuilt = this.cache.rebuilt;
    gl.useProgram(this.prog);
    const U = this.U;
    gl.uniformMatrix4fv(U.uVP, false, this.vp); gl.uniform3fv(U.uEye, eGL); gl.uniform3fv(U.uSky, S.sky);
    gl.uniform3f(U.uAmb, 0.032, 0.034, 0.045); gl.uniform3fv(U.uFogSky, S.hor); gl.uniform3f(U.uFogDark, 0.006, 0.008, 0.014); gl.uniform2f(U.uFog, FOG_START, FOG_END);
    gl.uniform4fv(U.uL, la); gl.uniform1i(U.uNL, nl); gl.uniform1f(U.uFlick, opts.calm ? 1 : 1 + 0.07 * Math.sin(now / 90) + 0.04 * Math.sin(now / 37));
    gl.uniform1i(U.uTex, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(U.uMode, 0);
    let faces = 0;
    for (const m of this.meshes.values()) { if (!m.n) continue; gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n * 6, gl.UNSIGNED_INT, 0); faces += m.n; }
    this.facesDrawn = faces;

    // billboards
    this._sprites(sim, view, cam, S, now);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false); gl.uniform1i(U.uMode, 2); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -2);      // shadows: blended, no depth write, nudged towards the eye
    this._flush(0);
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true); gl.disable(gl.BLEND); gl.uniform1i(U.uMode, 1);
    this._flush(1);
    // the outline of the cell face under the crosshair
    if (opts.target) {
      const t = opts.target, buf = this.dynBuf[2], hl = this.slots.get("#hl"), o = 0.004;
      const a = t.nx ? 0 : t.ny ? 1 : 2, t1 = (a + 1) % 3, t2 = (a + 2) % 3, base = [t.x, t.y, t.z], sg = t.nx + t.ny + t.nz;
      for (let q = 0; q < 4; q++) {
        const u = q === 1 || q === 2 ? 1 : 0, v = q >= 2 ? 1 : 0, P = [base[0], base[1], base[2]];
        P[t1] += u; P[t2] += v; P[a] += (sg > 0 ? 1 : 0) + sg * o;
        const i = q * FLOATS;
        buf[i] = P[0]; buf[i + 1] = P[2]; buf[i + 2] = P[1]; buf[i + 3] = buf[i + 4] = buf[i + 5] = 1;
        buf[i + 6] = u ? hl[2] : hl[0]; buf[i + 7] = v ? hl[3] : hl[1]; buf[i + 8] = 1; buf[i + 9] = 1;
      }
      this.dyn[2].n = 1; gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn[2].vbo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf, 0, 4 * FLOATS);
      gl.enable(gl.BLEND); gl.depthMask(false); gl.uniform1i(U.uMode, 3); gl.depthFunc(gl.LEQUAL);
      this._flush(2); gl.depthMask(true); gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
  }
  _flush(i) {
    const gl = this.gl, d = this.dyn[i];
    if (!d.n) return;
    gl.bindVertexArray(d.vao); gl.drawElements(gl.TRIANGLES, d.n * 6, gl.UNSIGNED_INT, 0);
  }

  /** Build the billboards (and the list of things the crosshair can pick). */
  _sprites(sim, view, cam, S, now) {
    const gl = this.gl, sh = this.dynBuf[0], sp = this.dynBuf[1], yaw = cam.yaw;
    const rx = -Math.sin(yaw), ry = Math.cos(yaw), fx = Math.cos(yaw), fy = Math.sin(yaw);       // the camera's right (rx, ry) and forward (fx, fy) in the ground plane
    let ns = 0, nq = 0;
    const targets = this.targets; targets.length = 0;
    const R2 = SPRITE_R * SPRITE_R, seen = sim.seen;
    const ents = sim.ents, kinds = ["plot", "plant", "grave", "flame", "furniture", "wagon", "site", "csite", "item", "fauna", "villager"];
    const sh0 = this.slots.get("#shadow");
    const heads = this.heads, tick = sim.tick;
    const put = (e, spr, ex, ey, ez) => {
      if (nq >= MAX_SPRITES) return;
      const s = this.slot(spr.key, spr.paint);
      let sky = 1;
      for (let k = 1; k <= 4; k++) if (isNatural(view.mat(e.x, e.y, ez + k))) { sky = 0; break; }
      const w = spr.w, h = spr.h, cxg = ex, czg = ey, yb = ez + 0.02, hx = rx * w / 2, hz = ry * w / 2;
      const tint = 1;
      const o = nq * 4 * FLOATS;
      const P = [[cxg - hx, yb, czg - hz, s[0], s[3]], [cxg + hx, yb, czg + hz, s[2], s[3]], [cxg + hx, yb + h, czg + hz, s[2], s[1]], [cxg - hx, yb + h, czg - hz, s[0], s[1]]];
      for (let q = 0; q < 4; q++) { const i = o + q * FLOATS; sp[i] = P[q][0]; sp[i + 1] = P[q][1]; sp[i + 2] = P[q][2]; sp[i + 3] = sp[i + 4] = sp[i + 5] = tint; sp[i + 6] = P[q][3]; sp[i + 7] = P[q][4]; sp[i + 8] = sky; sp[i + 9] = spr.em; }
      nq++;
      const sw = Math.min(w, 1) * 0.5;                                                     // the ground shadow: a flat disc
      const so = ns * 4 * FLOATS, yy = ez + 0.012;
      const SP = [[cxg - sw, yy, czg - sw, sh0[0], sh0[1]], [cxg + sw, yy, czg - sw, sh0[2], sh0[1]], [cxg + sw, yy, czg + sw, sh0[2], sh0[3]], [cxg - sw, yy, czg + sw, sh0[0], sh0[3]]];
      for (let q = 0; q < 4; q++) { const i = so + q * FLOATS; sh[i] = SP[q][0]; sh[i + 1] = SP[q][1]; sh[i + 2] = SP[q][2]; sh[i + 3] = sh[i + 4] = sh[i + 5] = 1; sh[i + 6] = SP[q][3]; sh[i + 7] = SP[q][4]; sh[i + 8] = sky; sh[i + 9] = 0; }
      ns++;
      if ((e.kind in PICKABLE) && (cam.x - ex) ** 2 + (cam.y - czg) ** 2 < 100) targets.push({ e, c: [ex, ez + h * 0.5, czg], r: Math.max(0.28, Math.min(0.7, Math.max(w, h) * 0.38)) });
    };
    for (const kind of kinds) {
      const list = ents.ofKind(kind);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.poss) continue;                                                                 // the one we are looking through
        const dx = e.x + 0.5 - cam.x, dy = e.y + 0.5 - cam.y;
        if (dx * dx + dy * dy > R2) continue;
        if (!(seen.b.size && (seenCell(seen, e.x, e.y, e.z) || seenCell(seen, e.x, e.y, e.z - 1)))) continue;      // never shown where nobody has looked
        let back = false, info = null;
        if (kind === "villager" || kind === "fauna") {                                        // heading from the last two positions: seen from behind shows no face
          let hd = heads.get(e.id);
          if (!hd) heads.set(e.id, hd = { x: e.x, y: e.y, dx: 0, dy: 1, t: tick });
          if (hd.x !== e.x || hd.y !== e.y) { hd.dx = Math.sign(e.x - hd.x); hd.dy = Math.sign(e.y - hd.y); hd.x = e.x; hd.y = e.y; }
          back = hd.dx * fx + hd.dy * fy > 0.3 && !(kind === "villager" && e.slp === 1);
          hd.t = tick;
        } else if (kind === "plant" && e.species === "tree") info = { pine: view.biomeAt(e.x, e.y) === HIGHLAND };
        else if (kind === "plot") info = { stage: cropStage(e), wet: e.wt > tick };
        const spr = spriteOf(e, sim, back, info || {});
        if (!spr) continue;
        put(e, spr, e.x + 0.5, e.y + 0.5, e.z);
      }
    }
    if (heads.size > 600) for (const [id, h] of heads) if (tick - h.t > 40) heads.delete(id);
    this.dyn[0].n = ns; this.dyn[1].n = nq; this.spritesDrawn = nq;
    if (ns) { gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn[0].vbo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, sh, 0, ns * 4 * FLOATS); }
    if (nq) { gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn[1].vbo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, sp, 0, nq * 4 * FLOATS); }
  }

  /** n x n pixels spread over the canvas, read straight after a draw (only valid in the same task as the draw): {w, h, px: [[r,g,b], ...]}. */
  sample(n) {
    const gl = this.gl, W = this.canvas.width, H = this.canvas.height, px = [], b = new Uint8Array(4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { gl.readPixels(Math.floor((i + 0.5) * W / n), Math.floor((j + 0.5) * H / n), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); px.push([b[0], b[1], b[2]]); }
    return { w: W, h: H, px };
  }

  /** Screen position (CSS pixels) of a sim-axes point, or null behind the camera. */
  toScreen(x, y, z) { const p = project(this.vp, x, z, y, this.w, this.h); return p[2] ? p : null; }

  dispose() { if (this.gl) this.cache.dispose(); }
}
const PICKABLE = { fauna: 1, csite: 1, item: 1, plant: 1, furniture: 1 };
function seenCell(s, x, y, z) {
  const a = s.b.get(chunkKey(x >> 4, y >> 4));
  return a && z >= 0 && z < D ? a[(z << 8) | ((y & 15) << 4) | (x & 15)] : 0;
}
