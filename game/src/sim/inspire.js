// Divine inspiration (GDD §07): what a possessed villager gets for being guided.
// All the numbers live here, in ONE place, so a test can zero them and prove a
// possessed villager is otherwise tick-identical to an AI one.
export const INSPIRE = {
  speed: 0.10,     // +10% work speed (tasks.rate); walking speed is unchanged
  xp: 0.15,        // +15% skill XP per output (skills.gain)
  grace: 600,      // ticks the village keeps the reservations the villager held before possession (§09)
};
// 9.33: a slime working a direct order or a crew task is taught a little by it: about half the possessed bonus, to that slime only (its own order, no telepathy).
export const ORDER_XP = 0.075;
