// Titles (S13): names earned from deeds, kept on the villager (v.ti, at most 4) and copied to their chronicle record at death.
// Tiny and import-light on purpose: knowledge.js and fauna.js award from the moment of the deed.
import { log } from "./chronicle.js";

const FIRST_TITLE = { FIRE_TENDING: "first to keep a fire", POTTERY: "first potter", SMELTING: "first to smelt copper", CHARCOAL: "first charcoal burner", KILN: "first kiln master", IRON_SMELTING: "first to smelt iron", CULTIVATION: "first farmer", HUSBANDRY: "first herder" };
export function firstTitle(craft, short) { return FIRST_TITLE[craft] || "first in " + short; }
export const MASTER_AT = 0.55;              // skill level for "master": the soft-rock ceiling is about 0.6, so this is "as good as the work lets anyone get"
/** Give a villager a title (at most 4 are kept). loud = a chronicle line of its own. */
export function award(sim, v, title, loud) {
  if (!v.ti) v.ti = [];
  if (v.ti.includes(title) || v.ti.length >= 4) return false;
  v.ti.push(title);
  if (loud) log(sim, "MILESTONE", v.name + " is now known as the " + title + ".", [v.id], { title }, 1);
  return true;
}
