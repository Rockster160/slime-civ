// The HUD grid (UI_SPEC §5): one composition with fixed slots, so nothing floats on its own and nothing overlaps at 1280x720.
//
//   top bar (40)
//   +-- Village slot (264, scrolls) --+-- strip / whisper / plate (centre) --+-- Inspector slot (296) --+
//   +-- minimap slot (176)          --+-- world, then the dock (bottom centre)  --+
//
// hud.js only creates the slots and exposes them; main.js mounts each panel into one. 6.19b mounts its onboarding hints and level gauge into the same slots:
// `slots.guide` (above the dock) and `slots.gauge` (right edge of the world) are empty containers reserved for them.
import { remember } from "./dom.js";

export function createHud(game, params) {
  const root = document.getElementById("hud");
  const mk = (tag, id, cls = "", test = "", parent = root) => { const e = document.createElement(tag); e.id = id; if (cls) e.className = cls; if (test) e.dataset.test = test; parent.appendChild(e); return e; };
  const slots = {};
  slots.topbar = mk("div", "topbar", "", "topbar");
  slots.strip = mk("div", "notables", "", "strip");
  slots.whisper = mk("div", "whisper", "", "whisper");
  slots.plate = mk("div", "plate", "plate", "plate");
  slots.village = mk("div", "slotV", "slot", "village-hud");
  slots.minimap = mk("div", "minimap", "pn", "minimap");
  slots.inspector = mk("div", "slotI", "slot", "inspector-slot");
  slots.dock = mk("div", "dock", "", "dock");
  slots.popover = mk("div", "bppop", "", "blueprints-pop", slots.dock);       // the blueprints list rises above the build tools
  slots.orders = mk("div", "dkOrders", "dk", "orders", slots.dock);
  slots.build = mk("div", "dkBuild", "dk", "build-dock", slots.dock);
  slots.possess = mk("div", "dkPossess", "dk", "possess-dock", slots.dock);
  slots.guide = mk("div", "guide", "", "guide-slot");                           // 6.19b: onboarding hints
  slots.gauge = mk("div", "gauge", "", "gauge-slot");                           // 6.19b: the depth gauge
  slots.pointers = mk("div", "pointers", "", "pointers");
  slots.guide.style.cssText = slots.gauge.style.cssText = "position:absolute;pointer-events:none;";
  // developer tools (speed, MAX, skip-to, debug menu items, the fps line): ?debug=1 or Settings > Developer tools
  game.dev = params.get("debug") === "1" || remember("dev") === "1";
  game.setDev = (on) => { game.dev = !!on; remember("dev", on ? "1" : "0"); document.body.classList.toggle("dev", game.dev); };
  document.body.classList.toggle("dev", game.dev);
  return slots;
}
