// Pan/zoom camera over the cell grid. State: the world cell at screen centre
// (fractional) and zoom in pixels per cell. Pure maths, no DOM. S16: the land is endless, so there is no map to clamp to.

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.zoom = 8;
    this.vw = 800; this.vh = 600;
    this.minZoom = 2; this.maxZoom = 64;     // minZoom keeps a full screen to about 2000 chunks (renderer.js RENDER_CACHE)
  }
  resize(vw, vh) { this.vw = vw; this.vh = vh; }
  toScreen(wx, wy) { return [(wx - this.x) * this.zoom + this.vw / 2, (wy - this.y) * this.zoom + this.vh / 2]; }
  toWorld(sx, sy) { return [(sx - this.vw / 2) / this.zoom + this.x, (sy - this.vh / 2) / this.zoom + this.y]; }
  panBy(dxPx, dyPx) { this.x -= dxPx / this.zoom; this.y -= dyPx / this.zoom; }
  /** Zoom keeping the world point under (sx, sy) fixed. */
  zoomAt(factor, sx, sy) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    this.x = wx - (sx - this.vw / 2) / this.zoom;
    this.y = wy - (sy - this.vh / 2) / this.zoom;
  }
  /** Frame a box {x0,y0,x1,y1} (the explored area; null = a default window on the camp), with a margin. */
  fit(box) {
    const b = box || { x0: this.x - 64, y0: this.y - 64, x1: this.x + 64, y1: this.y + 64 };
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    this.x = (b.x0 + b.x1 + 1) / 2; this.y = (b.y0 + b.y1 + 1) / 2;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, Math.min(this.vw / (w * 1.1), this.vh / (h * 1.1))));
  }
  /** Inclusive cell range on screen (no clamp: the land is endless). */
  visible() {
    const [x0, y0] = this.toWorld(0, 0), [x1, y1] = this.toWorld(this.vw, this.vh);
    return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.floor(x1), y1: Math.floor(y1) };
  }
}
