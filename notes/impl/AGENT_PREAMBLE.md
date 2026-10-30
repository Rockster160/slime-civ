# Stage agent preamble (read before any stage S9+)

You are implementing one stage of the playable prototype in /Users/zoro/code/slime-civ/game:
- Plain JS ES modules, zero dependencies, bundled into one HTML file.
- Earlier stages are done and uncommitted in the working tree. That is expected: **never commit**.

## Read first
1. notes/impl/BUILD_PLAN.md: the hard rules.
   - Pure, deterministic sim (no Math.random, Date, Math.exp or sin).
   - One Action pipeline shared by AI and possession.
   - Every job rejection emits a blocker enum with plain text.
   - Values come from the GDD.
   - Small, readable modules.
2. notes/impl/BUILD_PLAN_C3.md: the phase plan, **"Testing rules"** (MANDATORY) and your stage's line.
3. game/README.md (every stage section and its "seams") and game/tests/README.md (fixtures, quick and full).
4. The GDD sections your stage names, in docs/GAME_DESIGN.md, plus docs/MVP_SCOPE.md for scope.

## Small changes get small checks (user rule, 2026-10-30)
A small change (a label, a layout tweak, one rule or constant) is checked with **only**:
- `node tools/build.js`
- `node tools/check.js` (about 2 s): it loads the game, fails on any console error, and can assert one selector's text or one `--eval` expression;
- plus the one or two unit tests that cover the touched module, if any.

**Never** run `tests/all.js` or any `ui_smoke*`/`ui_shots*` script for a small change. When an existing smoke check pins the changed text, update its pattern, but don't run that script. The full suite is for the end of a stage or phase only.

## Testing rules (summary; the plan file is authoritative)
A previous session crashed the user's machine by running many sims in parallel.
- **Every sim run ≤ 5 min wall clock** (user rule, 2026-10-28): each test, each fixture build, each probe. Fast-forward is fine; anything longer needs a real reason, stated in the report.
- **Pre-situated saves.** Build fixtures that sit right before the moment under test (needs already low, crop one stage from ripe, kiln loaded, dusk, monster in range) by editing state in the fixture tool, not by simulating up to it. A test loads the fixture, applies the command, runs until the event happens (with a cap), and stops.
- **Feature tests:** load a pre-situated fixture (`tests/fixture.js` `loadFixture`), run only until the event (capped; a game day is now 12000 ticks, so "N days" windows are a smell), and assert the feature works. Add new fixtures to the fixture tool when a stage needs a new starting point.
- **What to run:** only `node tests/all.js` (quick) and `node tools/build.js`, then `node tools/ui_smoke.js`, `node tools/ui_shots20.js`, `node tools/ui_smoke_p7.js` and `node tools/ui_smoke_fpv.js` (first-person work countdown) one after another. A smoke script near five minutes is split, never left to grow; new stage checks go in `ui_smoke_p7.js` (or a new small script).
  - Run them sequentially, one sim or browser at a time, with explicit timeouts.
  - **Never** run `--full` or background a sim.
  - Long bots go in FULL only, for the user's balance pass.
- **Day length will change again.** Durations (except age and the calendar) are flat tick constants. Tests never hard-code a day length; wait for events with caps derived from duration constants.
- **Balance** is a best guess. The user tunes later; features must work and be visible.

## Finish every stage with
- The quick set green, the HTML building, and ui_smoke green, extended with one check for your stage's main feature.
- 1–3 screenshots in game/tmp/ that you have looked at.
- tests/ui_text.js green (plain text for every new blocker, job and class).
- Save compatibility: bump SAVE_VERSION with a migration if the format changes; additive fields are fine.
- Docs:
  - append a "## <Title> (S#)" section to game/README.md, including seams for later stages
  - add an S# row to notes/STATUS.md
  - record deviations as the next D# in notes/DECISION_LOG.md (DEFAULT, "Sonnet S#, pending Opus")
- A final report under 350 words: what was built, deviations, test results, seams, and what needs the user's balance pass.
