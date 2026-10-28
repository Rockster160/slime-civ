# Shared brief for all Phase 1 investigators

You are one of four parallel investigators producing input for a Game Design Document. Opus (the director) will synthesize; you are not writing the GDD.

READ FIRST (in order):
1. notes/CONTEXT_BRIEF.md — vision; AGREED vs CANDIDATE. AGREED is canon.
2. notes/existing_material.md — audit of the author's existing slime-village sim. Preserve its established decisions where they fit; name divergences explicitly.
3. initial_prompt.txt — the full original brief (design pillars 1–10, design philosophy). Skim for your area.

RULES
- Stay inside your scope. Don't expand scope without justification; if you think a feature should be cut, say so.
- Concrete mechanics only. Never write "advanced AI" or "deep simulation" — describe the actual rule, number, data, or interaction. Use short player-interaction examples.
- Distinguish ESTABLISHED technique (cite a game/paper/postmortem/talk) from SPECULATION. Label uncertain assumptions "ASSUMPTION:".
- You may use web search for references; cite meaningfully, briefly. Don't fabricate references, benchmarks or code.
- Don't pick a final title or commit to an engine.
- No production code. Pseudocode/data sketches are fine where they clarify.
- Prefer the smallest cohesive set of mechanics. "Do not confuse a large feature list with a compelling game."

OUTPUT: write your report to the file path given in your task, 300–550 lines, with exactly these top-level sections:
1. Recommendations (numbered, each one line + short rationale)
2. Supporting reasoning (by topic)
3. Alternatives considered (and why rejected)
4. Risks and tradeoffs
5. Unresolved decisions (each with a recommended default)
6. Dependencies on other systems
7. MVP vs later (what of your area is essential for a first-planet MVP / vertical slice)

Then reply to Opus with ≤20 lines: your 5 most important recommendations, your biggest risk, and the file path.
