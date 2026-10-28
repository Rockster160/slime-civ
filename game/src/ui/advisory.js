// Advisory notifications (GDD §22, S15): when a Concerns class first rises to an alarming level, a small card says so once, with a Show button, Dismiss and Snooze.
// Pure: a state machine over the concerns list, with no DOM (ui/concernpanel.js draws the cards). At most ONE card per class at a time, and hysteresis keeps it quiet:
//
//   a class raises a card when its level reaches RAISE (3, "alarming") and it has been below HOLD (2) for at least REARM ticks (or has never been up);
//   the card stays while the level stays at HOLD or above (a flicker between 2 and 3 does nothing), and goes away when it falls below HOLD;
//   Dismiss silences the class until it has fallen below HOLD (the next, separate alarm raises a fresh card after REARM);
//   Snooze hides the card for SNOOZE ticks (half a day) and then shows it again if the class is still at HOLD or above.
export const ADVISE = { RAISE: 3, HOLD: 2, REARM: 900, SNOOZE: 900, MAX_SHOWN: 3 };

export function newAdvisor() { return { cls: {}, n: 0 }; }

/**
 * Feed the current concerns (concerns.js) at `tick`; -> the cards to show now, oldest first:
 * [{k, text, level, loc, since}]. Safe to call every refresh: it only changes state on real changes.
 */
export function advise(adv, list, tick) {
  const by = {};
  for (const c of list) by[c.k] = c;
  const keys = new Set([...Object.keys(adv.cls), ...Object.keys(by)]);
  for (const k of [...keys].sort()) {
    const s = adv.cls[k] || (adv.cls[k] = { st: "off", t: -1e9, until: 0, clr: -1e9, seq: 0 });
    const c = by[k], L = c ? c.level : 0;
    if (s.st === "off") {
      if (L >= ADVISE.RAISE && tick - s.clr >= ADVISE.REARM) { s.st = "shown"; s.t = tick; s.seq = ++adv.n; }
    } else if (L < ADVISE.HOLD) { s.st = "off"; s.clr = tick; }
    else if (s.st === "snoozed" && tick >= s.until) { s.st = "shown"; s.t = tick; s.seq = ++adv.n; }
    if (c && s.st !== "off") { s.text = c.adv || c.text; s.level = L; s.loc = c.loc; }
  }
  return Object.keys(adv.cls).filter(k => adv.cls[k].st === "shown").map(k => ({ k, text: adv.cls[k].text, level: adv.cls[k].level, loc: adv.cls[k].loc, since: adv.cls[k].t, seq: adv.cls[k].seq }))
    .sort((a, b) => a.seq - b.seq).slice(0, ADVISE.MAX_SHOWN);
}
export function dismiss(adv, k) { const s = adv.cls[k]; if (s && s.st === "shown") s.st = "dismissed"; }
export function snooze(adv, k, tick) { const s = adv.cls[k]; if (s && s.st === "shown") { s.st = "snoozed"; s.until = tick + ADVISE.SNOOZE; } }
