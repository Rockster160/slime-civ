// Pan/zoom camera over the cell grid. State: the world point at screen centre (x, y fractional; zf = its height) and zoom in pixels per cell.
// Pure maths, no DOM. S16: the land is endless, so there is no map to clamp to.
//
// 6.19b: the same camera serves both map renderers. Flat (pitch 90 degrees: the canvas2D fallback, `?flat=1`) it is the old top-down grid, exactly. Oblique
// (the default map: a fixed-pitch, fixed-yaw orthographic 3/4 view, the GDD's R2 camera) the ground is foreshortened by sin(pitch) and a point's height lifts
// it on screen by cos(pitch) per cell:
//     sx = vw/2 + (wx - x) * zoom          sy = vh/2 + ((wy - y) * sinP - (wz - zf) * cosP) * zoom
// Yaw is fixed (the view looks north, screen-up = -y), so an axis-aligned ground rectangle stays an axis-aligned rectangle on screen (overlays, zones, ghosts and
// drag-boxes stay exact), and the line of sight is the plane x = const: the ray through a pixel is (0, cosP, sinP) per unit, which is what exact picking walks.
export const OBLIQUE_PITCH = 55 * Math.PI / 180;      // degrees of look-down from the horizon: 90 is straight down. 55 shows a cliff face 0.57 cells tall per cell of height and keeps the ground at 82%

export class Camera {
  constructor() {
    this.x = 0; this.y = 0; this.zf = 0;
    this.zoom = 8;
    this.vw = 800; this.vh = 600;
    this.minZoom = 2; this.maxZoom = 64;     // minZoom keeps a full screen to about 2000 chunks (renderer.js RENDER_CACHE)
    this.sinP = 1; this.cosP = 0;
    this.ground = null;                      // (x, y) -> the height (z of the floor top) of a column in the current view; the oblique renderer sets it so a bare toScreen(x, y) lands on the ground
  }
  /** Pitch in radians: Math.PI / 2 = flat top-down. */
  setPitch(p) { this.sinP = Math.sin(p); this.cosP = Math.abs(Math.cos(p)) < 1e-9 ? 0 : Math.cos(p); this.minZoom = this.cosP > 0 ? 7 : 2; }
  get oblique() { return this.cosP > 0; }
  resize(vw, vh) { this.vw = vw; this.vh = vh; }
  /** Height of the ground under a world point (the floor you would stand on), when the caller does not say. */
  groundAt(wx, wy) { return this.ground ? this.ground(Math.floor(wx), Math.floor(wy)) : this.zf; }
  toScreen(wx, wy, wz) {
    if (this.cosP === 0) return [(wx - this.x) * this.zoom + this.vw / 2, (wy - this.y) * this.zoom + this.vh / 2];
    const z = wz === undefined ? this.groundAt(wx, wy) : wz;
    return [(wx - this.x) * this.zoom + this.vw / 2, this.vh / 2 + ((wy - this.y) * this.sinP - (z - this.zf) * this.cosP) * this.zoom];
  }
  /** The ground point under a pixel, taken on the horizontal plane at height wz (default: the focus height). */
  toWorld(sx, sy, wz) {
    const z = wz === undefined ? this.zf : wz;
    return [(sx - this.vw / 2) / this.zoom + this.x, this.y + ((sy - this.vh / 2) / this.zoom + (z - this.zf) * this.cosP) / this.sinP];
  }
  /** A world rectangle [ax, bx) x [ay, by) on the plane at height wz (default: the ground at its corner) -> [left, top, width, height] in pixels. */
  rect(ax, ay, bx, by, wz) {
    const z = wz === undefined ? this.groundAt(ax + 0.01, ay + 0.01) : wz, [l, t] = this.toScreen(ax, ay, z);
    return [l, t, (bx - ax) * this.zoom, (by - ay) * this.zoom * this.sinP];
  }
  /** Pixels per cell down the screen on the ground (the height of a square cell). */
  get cellH() { return this.zoom * this.sinP; }
  /** The pixel offset of one cell of height (how far up the screen a point rises per cell of z). */
  get riseH() { return this.zoom * this.cosP; }
  panBy(dxPx, dyPx) { this.x -= dxPx / this.zoom; this.y -= dyPx / (this.zoom * this.sinP); }
  /** Zoom keeping the world point under (sx, sy) fixed (on the focus plane). */
  zoomAt(factor, sx, sy) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    this.x = wx - (sx - this.vw / 2) / this.zoom;
    this.y = wy - (sy - this.vh / 2) / (this.zoom * this.sinP);
  }
  /** Frame a box {x0,y0,x1,y1} (the explored area; null = a default window on the camp), with a margin. */
  fit(box) {
    const b = box || { x0: this.x - 64, y0: this.y - 64, x1: this.x + 64, y1: this.y + 64 };
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    this.x = (b.x0 + b.x1 + 1) / 2; this.y = (b.y0 + b.y1 + 1) / 2;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, Math.min(this.vw / (w * 1.1), this.vh / (h * this.sinP * 1.1))));
  }
  /** Inclusive cell range on screen (no clamp: the land is endless). Oblique: the ground box of the screen, widened on the north side for the tall things that rise into view. */
  visible() {
    const [x0, y0] = this.toWorld(0, 0), [x1, y1] = this.toWorld(this.vw, this.vh);
    const up = this.cosP > 0 ? 6 : 0;
    return { x0: Math.floor(x0), y0: Math.floor(y0) - up, x1: Math.floor(x1), y1: Math.floor(y1) + (this.cosP > 0 ? 2 : 0) };
  }
  /** The line of sight through a pixel as a ray over the cell grid: origin at world height `top` (above every cell), unit direction down the view. -> {o: [x,y,z], d: [dx,dy,dz]} (sim axes). */
  ray(sx, sy, top = 26) {
    const [wx, wy] = this.toWorld(sx, sy, this.zf), t = (top - this.zf) / this.sinP;
    return { o: [wx, wy + t * this.cosP, top], d: [0, -this.cosP, -this.sinP] };
  }
}
