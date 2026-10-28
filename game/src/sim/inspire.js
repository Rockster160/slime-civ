// Divine inspiration (GDD §07): what a possessed villager gets for being guided.
// All the numbers live here, in ONE place, so a test can zero them and prove a
// possessed villager is otherwise tick-identical to an AI one.
export const INSPIRE = {
  speed: 0.10,     // +10% work speed (tasks.rate); walking speed is unchanged
  xp: 0.15,        // +15% skill XP per output (skills.award)
  grace: 600,      // ticks the village keeps the reservations the villager held before possession (§09)
};
