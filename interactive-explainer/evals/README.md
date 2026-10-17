# Evals

A small fixed set of sources to rerun after every change to the skill, so a change that makes pages slower, dearer or
worse shows up before it ships. Sources are synthetic (no customer or copyrighted material); each has numbers the page
must reproduce.

| Case | Tier | Expected shape | What it tests |
|---|---|---|---|
| `queue-wait` | Explainer | sweep | a formula + table to reproduce, a threshold, an unbounded region said in words |
| `screening-test` | Sketch | uncertainty | the Sketch tier stays small and fast; natural frequencies |
| `etl-records` | Explainer | recordflow (or sankey) | every record traceable, reject reasons, conservation per component |
| `platform-history` | Explainer | timeline | 19 dated events in 3 eras, counts per era |
| `catch-up-odds` | Explainer | derivation / uncertainty / sweep | a formula with a table of 7-digit values, a threshold search |

## Run one case
1. Make an empty workspace and copy the case's `source.md` into it: `mkdir "$TEMP/eval-<id>" && cp evals/cases/<id>/source.md "$TEMP/eval-<id>/"`.
2. Start a fresh agent (a subagent is fine) with the working directory set to that folder and the case's `prompt`
   (prefix: "Use the interactive-explainer skill at ~/.claude/skills/interactive-explainer. Work in <folder>.").
   Don't help it; note the transcript path: `~/.claude/projects/<cwd-slug>/<session>.jsonl` for a session, or
   `~/.claude/projects/<cwd-slug>/<parent-session>/subagents/agent-<id>.jsonl` for a subagent (its task output file can be empty).
3. Score it: `node scripts/eval-score.js evals/cases/<id> "<folder>/<page>.html" --transcript <jsonl> --label "<skill version>"`.
   The card is appended to `evals/results.jsonl`.
4. Look at the page yourself too (open it; read the check's `contact.png`): the score can't judge whether it explains well.

## What "good" looks like
- `check.js` ok with few warnings; every target ✓; built on the runtime; the expected shape (or a defensible one).
- Within budget (`case.json` → `budget`): Explainer ≤ 15 min and ≤ 150k output tokens; Sketch ≤ 6 min and ≤ 60k.
- Page-specific size well under the old 55–77 KB one-shot pages (the runtime is inlined but not written by the agent).

## Baseline before the runtime (v1, measured from real sessions, Oct 2026)
Six real builds (papers, articles, data): 13–25 min each, 140k–360k output tokens, 6M–57M cache-read tokens,
one 55–77 KB HTML Write taking 214–313 s, 4–16 `check.js` runs, 5–14 screenshots read (tall phone shots were cropped
by hand). None had a light theme, URL state, ARIA or reduced-motion handling; 7–16% of each page matched a skeleton.
