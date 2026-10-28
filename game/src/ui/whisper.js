// The whisper (UI_SPEC §3.9): the one slot that replaces toasts. One line, an icon and at most ~80 characters, a few seconds, and a new message REPLACES the old one,
// so nothing ever stacks. `game.toast(msg, ms)` stays as a thin alias so every call site survives. Long messages are cut to their first sentence for the line; the whole
// text stays in the element's tooltip and screen-reader copy.
const MAX = 80;
const KIND = [[/cannot|can't|nobody|not enough|no one|children|off while|already on|no pen|no tool|^select |stopped: /i, "blocked", "blocked"], [/^(paused|stopped)/i, "info", "pause"], [/order finished|made|planned|saved|removed|disbanded|cancelled|loaded|started|now prefers|coming back/i, "done", "check"]];

/** First sentence of a message, trimmed to the line length. Pure. */
export function shorten(msg) {
  let s = String(msg).replace(/\s+/g, " ").trim();
  const dot = s.search(/[.!?](\s|$)/);
  if (dot > 8) s = s.slice(0, dot + 1);
  if (s.length > MAX) s = s.slice(0, MAX - 1).replace(/\s+\S*$/, "") + "…";
  return s;
}
/** Which icon a message gets. Pure. */
export function whisperKind(msg) { for (const [re, k, ic] of KIND) if (re.test(msg)) return { kind: k, icon: ic }; return { kind: "info", icon: "help" }; }

export function createWhisper(root, game, svg, esc) {
  let timer = 0, lastMsg = "";
  game.whisper = (msg, ms = 3000) => {
    const { kind, icon } = whisperKind(msg), short = shorten(msg);
    game.ui.whispers = (game.ui.whispers || 0) + 1;
    root.className = "show " + kind; root.dataset.tip = msg.length > short.length ? msg : "";
    if (short !== lastMsg || !root.classList.contains("show")) root.innerHTML = svg(icon, 16) + `<span>${esc(short)}</span>` + (msg.length > short.length ? `<span class="sr"> ${esc(msg.slice(short.length))}</span>` : "");
    lastMsg = short;
    clearTimeout(timer); timer = setTimeout(() => { root.className = ""; lastMsg = ""; }, ms);
  };
  game.toast = game.whisper;
  return root;
}
