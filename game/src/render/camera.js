// Pan/zoom camera over the cell grid. State: the world cell at screen centre
// (fractional) and zoom in pixels per cell. Pure maths, no DOM.
import { W, H } from "../sim/world.js";

export class Camera {
  constructor() {
    this.x = W / 2; this.y = H / 2;
    this.zoom = 8;
    this.vw = 800; this.vh = 600;
    this.minZoom = 2; this.maxZoom = 64;
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
  fit() {
    this.x = W / 2; this.y = H / 2;
    this.zoom = Math.max(this.minZoom, Math.min(this.vw / W, this.vh / H));
  }
  /** Inclusive cell range on screen, clamped to the map. */
  visible() {
    const [x0, y0] = this.toWorld(0, 0), [x1, y1] = this.toWorld(this.vw, this.vh);
    return {
      x0: Math.max(0, Math.floor(x0)), y0: Math.max(0, Math.floor(y0)),
      x1: Math.min(W - 1, Math.floor(x1)), y1: Math.min(H - 1, Math.floor(y1)),
    };
  }
}
