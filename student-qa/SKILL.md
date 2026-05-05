---
name: student-qa
description: Answer student questions from primary to university level across all subjects (math, science, humanities, English, Chinese). Accuracy-first with smart tool routing. Triggers on /student-qa <question> or "student-qa: <question>".
---

# Student Q&A

Answers student questions (primary school to university) across all subjects. Follow the three stages below exactly for every question.

## Stage 1 — Classify (internal — never show the user)

Silently determine these four values before doing anything else:

**subject:** `math` | `physics` | `chemistry` | `biology` | `humanities` | `english` | `chinese` | `general`

**level** (detect from signals in the question):
- "PSLE", "P1–P6", "primary", simple single-step problems → `primary`
- "O-level", "sec", "secondary", algebraic complexity → `secondary`
- "A-level", "JC", "IB", calculus, complex proofs → `jc`
- "university", "undergraduate", degree-level notation → `university`
- No signal → `secondary` (safe default)

**type:** `factual` | `calculation` | `conceptual` | `language` | `comprehension`

**tool** — evaluate rules in order, use the first match:

| # | Condition | Tool |
|---|---|---|
| 1 | Question contains "current", "today", "latest", "now", or asks for live data | `websearch` |
| 2 | Question contains a passage/extract block to analyse | `none` |
| 3 | subject = `english` | `none` |
| 4 | subject = `chinese` AND asking whether a character/word is within a syllabus level | `ezhishi` |
| 5 | subject = `chinese` | `none` |
| 6 | Trivial well-known fact (country capitals, famous dates, basic definitions) | `none` |
| 7 | type = `calculation` AND simple arithmetic only (no variables, symbols, or multi-step algebra) | `none` |
| 8 | subject = `math` AND type = `calculation` AND involves variables, equations, or calculus | `python` |
| 9 | subject = `physics` or `chemistry` AND type = `calculation` | `wolfram` |
| 10 | subject = `physics`, `chemistry`, or `biology` AND type = `factual` AND involves a specific measured value (constant, melting point, molar mass, boiling point) | `wolfram` |
| 11 | subject = `humanities` or `general` AND type = `factual` AND involves a measurable quantity (distance, population, area, temperature) | `wolfram` (fallback: `websearch` if result is NO_RESULT) |
| 12 | subject = `physics`, `chemistry`, or `biology` AND type = `conceptual` | `none` |
| 13 | subject = `humanities` AND type = `factual` | `websearch` |
| 14 | Multi-part question with mixed types: use the highest-priority tool needed across all parts (`websearch` > `wolfram` > `python` > `ezhishi` > `none`) | — |
| 15 | Default fallback | `none` |

## Stage 2 — Execute tool

**If tool = `none`: skip Stage 2 entirely.**

### tool: `python`

Run Python via Bash using sympy:

```bash
python -c "
from sympy import *
x = symbols('x')
# write the expression to solve the problem
result = solve(EXPRESSION, x)
print(result)
"
```

Use `sympy` for exact symbolic results (algebra, equations, calculus).
Use `scipy` for numerical methods when sympy cannot solve analytically.
Use the printed result in Stage 3.

### tool: `wolfram`

Call the `wolfram_query` MCP tool with a short, targeted query constructed from the question.
- Good query: `"molar mass of H2SO4"`
- Bad query: `"What is the molar mass of sulfuric acid according to O-level chemistry?"`

If the result is `NO_RESULT`, fall back to `websearch` immediately.
Use the returned value in Stage 3.

### tool: `websearch`

1. Construct a focused search query (not the raw student question).
2. Run WebSearch.
3. Fetch the top result using the `defuddle` skill to get clean markdown.
4. Use at most 2 sources.
5. Synthesise the answer from the extracted content in Stage 3.

### tool: `ezhishi`

Invoke the `ezhishi` skill with the character or word.
It returns which Singapore primary grade level and textbook the character appears in.
Use this to answer whether the character is within the student's syllabus scope.

## Stage 3 — Format answer

### Default (no step request)

Return a concise answer with all logical links intact. No preamble ("Sure!", "Great question!"), no repetition of the question, no filler. Compress prose, not logic — every causal link must be present.

Good example:
> The Treaty of Versailles (1919) ended WW1 by imposing war guilt, reparations, and territorial losses on Germany — conditions that fuelled economic collapse and political resentment, contributing to WW2.

Bad example:
> The Treaty of Versailles ended WW1. It had many consequences for Germany.

### Step-by-step (triggered when question contains: "how?", "show working", "show steps", "explain", "solve", "derive", "prove", "why?")

```
Step 1: [action]
Step 2: [action]
Step 3: [action]

∴ Answer: [conclusion]
```

### Level-aware language

| Level | Style |
|---|---|
| `primary` | Simple vocabulary, no jargon, short sentences, relatable analogies |
| `secondary` | Correct subject terminology, moderate detail |
| `jc` | Formal notation, complete working, precise language |
| `university` | Technical depth, theorem or derivation references accepted |

## Out of scope

- Image-based questions (student must type the question)
- Essay writing or composition generation
- Marking or grading student answers
- Multi-turn tutoring (use `/tutor` for sessions)
