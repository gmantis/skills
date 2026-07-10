# Student Q&A Skill — Design Specification

**Date:** 2026-05-05
**Status:** Draft
**Scope:** Claude Code skill for answering student questions from primary school to university level

---

## 1. Overview

A Claude Code skill (`/student-qa`) that answers student questions across all academic subjects from primary school to university. Accuracy is the primary constraint. Token efficiency is a secondary constraint achieved through smart tool routing — only calling external tools when Claude's knowledge is insufficient or unverifiable.

---

## 2. Trigger

```
/student-qa <question>
```

Also activates on natural phrasing:
- "student-qa: ..."
- "ask: ..."
- Direct question with no prefix (if skill is invoked)

---

## 3. Architecture

Three sequential stages. Stage 2 is skipped entirely when `tool: none`.

```
[Student Question]
       │
       ▼
┌──────────────────────┐
│  Stage 1: Classify   │  ~80–120 tokens
│  subject | level     │
│  type | tool         │
└──────────┬───────────┘
           │
     tool == none?
      │         │
    skip       run
      │         ▼
      │  ┌──────────────────────┐
      │  │  Stage 2: Execute    │  tool-dependent tokens
      │  │  route to tool       │
      │  └──────────┬───────────┘
      │             │
      └─────────────┤
                    ▼
           ┌────────────────┐
           │ Stage 3: Format│  minimal tokens
           └────────────────┘
```

---

## 4. Stage 1 — Classifier

### Output (compact JSON, no prose)

```json
{
  "subject": "physics",
  "level": "secondary",
  "type": "calculation",
  "tool": "wolfram"
}
```

### Subject Values

| Value | Covers |
|---|---|
| `math` | Arithmetic, algebra, calculus, statistics, geometry |
| `physics` | Mechanics, waves, electricity, thermodynamics, modern physics |
| `chemistry` | Elements, reactions, stoichiometry, organic chemistry |
| `biology` | Cells, genetics, ecology, human body, evolution |
| `humanities` | History, geography, economics, social studies, literature |
| `english` | Grammar, comprehension, vocabulary, composition, literature analysis |
| `chinese` | Chinese language, characters, vocabulary, composition |
| `general` | Cross-subject, common knowledge, uncategorised |

### Level Detection Heuristics

| Signal | Detected Level |
|---|---|
| "PSLE", "P1–P6", "primary", simple single-step problems | `primary` |
| "O-level", "sec", "secondary", algebraic complexity | `secondary` |
| "A-level", "JC", "IB", calculus, complex proofs | `jc` |
| "university", "undergraduate", degree notation, advanced theory | `university` |
| No signal detected | `secondary` (safe default) |

### Question Type Values

| Value | Description |
|---|---|
| `factual` | Who, what, when, where — specific verifiable facts |
| `calculation` | Numerical answer required, may involve formulas |
| `conceptual` | Explain how or why — reasoning and understanding |
| `language` | Chinese or English subject questions |
| `comprehension` | Question about a given passage or extract |

### Tool Values

| Value | Description |
|---|---|
| `none` | Claude answers directly — no external tool |
| `python` | `sympy`/`scipy` via `ctx_execute` |
| `wolfram` | Wolfram Alpha MCP |
| `websearch` | WebSearch + `defuddle` |
| `ezhishi` | ezhishi skill for Chinese character/vocabulary lookup |

---

## 5. Stage 1 — Tool Routing Rules

Rules are evaluated in priority order. First match wins.

### Rule 1 — Time-sensitive data (highest priority)
**Condition:** Question contains "current", "today", "latest", "now", "this year", or asks for live data (exchange rates, prices, news)
**Tool:** `websearch`
**Reason:** Claude's knowledge has a cutoff; stale answers are harmful

### Rule 2 — Comprehension / passage-based
**Condition:** Question contains a quoted passage, extract, or block of text to analyse
**Tool:** `none`
**Reason:** The passage itself is the source; no external lookup needed

### Rule 3 — English subject
**Condition:** `subject == english`
**Tool:** `none`
**Reason:** Grammar, comprehension, vocabulary, and composition are reliably handled by Claude

### Rule 4 — Chinese syllabus scope check
**Condition:** `subject == chinese` AND question is asking whether a character or word is within the student's syllabus level (e.g., "is 怡然自得 a P4 word?")
**Tool:** `ezhishi`
**Reason:** ezhishi identifies which Singapore primary grade level and textbook a character appears in — Claude cannot reliably answer syllabus-scope questions

### Rule 5 — Chinese language (general)
**Condition:** `subject == chinese`
**Tool:** `none`
**Reason:** Claude handles all Chinese language questions directly — meaning, grammar, composition, comprehension, character explanation — except syllabus-scope checks (Rule 4)

### Rule 6 — Trivial well-known fact
**Condition:** `type == factual` AND fact is near-certain common knowledge (capitals, famous dates, basic definitions)
**Tool:** `none`
**Reason:** Sending "What is the capital of France?" to WebSearch wastes tokens

### Rule 7 — Simple arithmetic
**Condition:** `type == calculation` AND no variables, symbols, or multi-step algebra
**Tool:** `none`
**Reason:** Claude handles basic arithmetic reliably; `ctx_execute` is overkill

### Rule 8 — Math calculation (symbolic / complex)
**Condition:** `subject == math` AND `type == calculation` AND involves variables, equations, calculus, or multi-step algebra
**Tool:** `python`
**Reason:** `sympy`/`scipy` gives exact symbolic answers; avoids arithmetic errors

### Rule 9 — Physics / chemistry calculation
**Condition:** `subject == physics OR chemistry` AND `type == calculation`
**Tool:** `wolfram`
**Reason:** Wolfram handles unit-aware calculations with authoritative constants

### Rule 10 — Physics / chemistry / biology measurable property
**Condition:** `subject == physics OR chemistry OR biology` AND `type == factual` AND question involves a specific measured value (constant, melting point, molar mass, boiling point, normal range)
**Tool:** `wolfram`
**Reason:** Wolfram returns precise values with units and citations

### Rule 11 — Measurable quantity in humanities / general
**Condition:** `subject == humanities OR general` AND `type == factual` AND question involves a measurable quantity (distance, population, area, temperature, speed)
**Tool:** `wolfram` (fallback: `websearch`)
**Reason:** Wolfram computes geodesic distances, population figures, and unit conversions precisely

### Rule 12 — Conceptual science
**Condition:** `subject == physics OR chemistry OR biology` AND `type == conceptual`
**Tool:** `none`
**Reason:** Claude explains scientific concepts reliably; no lookup needed

### Rule 13 — Humanities factual (non-measurable)
**Condition:** `subject == humanities` AND `type == factual`
**Tool:** `websearch`
**Reason:** Historical events, political facts, and cultural details benefit from web verification

### Rule 14 — Multi-part questions
**Condition:** Question clearly contains multiple sub-questions of different types
**Tool:** Use tool required by the **hardest sub-question**, using this priority order: `websearch > wolfram > python > ezhishi > none`
**Reason:** If any part needs a tool, run it for the whole question; do not split execution

### Rule 15 — Default fallback
**Condition:** No rule matched
**Tool:** `none`
**Reason:** Claude attempts the answer; better to try than to error

---

## 6. Stage 2 — Tool Execution

### `python` — Math calculations

```python
# ctx_execute with sympy for symbolic math
from sympy import *
x = symbols('x')
result = solve(x**2 - 4, x)
```

- Use `sympy` for exact symbolic results (algebra, calculus, equations)
- Use `scipy` for numerical methods (integrals that sympy cannot solve)
- Token cost: ~150–300 tokens

### `wolfram` — Physics, chemistry, measurable quantities

- Requires Wolfram Alpha MCP (built during implementation)
- Construct a targeted, compact query from the classified question
- Extract: value + unit + brief source label
- Fallback: `websearch` if Wolfram returns no result
- Token cost: ~200–400 tokens

### `websearch` — Humanities, current facts

- Construct a focused search query (not the raw student question)
- Fetch top result → `defuddle` to strip HTML → extract clean markdown
- Maximum 2 sources to cap token cost
- Claude synthesises the answer from extracted content
- Token cost: ~300–600 tokens

### `ezhishi` — Chinese character lookup

- Route to existing `ezhishi` skill
- Returns: meaning, grade level, textbook appearance in Singapore syllabus
- Token cost: ~100–200 tokens

---

## 7. Stage 3 — Output Format

### Default (answer only)

Return a concise answer with all logical links intact — no skipped reasoning, no padding. No preamble, no "Great question!", no repetition of the question. The answer must be self-contained: a reader should understand not just the conclusion but why it follows.

```
Photosynthesis converts light energy into glucose using CO₂ and water, producing O₂ as a byproduct.
```

```
The Treaty of Versailles (1919) ended WW1 by imposing war guilt, reparations, and territorial losses on Germany — conditions that fuelled economic collapse and political resentment, contributing to WW2.
```

The second example shows the standard: conclusion + causal chain, no filler.

### Step-by-step (triggered by request)

Triggered when question contains: "how?", "show working", "show steps", "explain", "solve", "derive", "prove", "why?"

```
Step 1: Identify the formula — F = ma
Step 2: Substitute values — F = 5 × 3
Step 3: Calculate — F = 15 N

∴ The force is 15 N.
```

### Level-aware language

| Level | Style |
|---|---|
| `primary` | Simple vocabulary, no jargon, short sentences, relatable analogies |
| `secondary` | Subject terminology used correctly, moderate detail |
| `jc` | Formal notation, complete working, precise language |
| `university` | Technical depth, may reference theorems or derivations |

---

## 8. Out of Scope (v1)

- **Image-based questions** — student photos of exam papers are not supported; student must type the question
- **Essay writing / composition generation** — skill answers questions, does not write essays for students
- **Marking / grading** — skill does not evaluate student answers
- **Multi-turn tutoring sessions** — each invocation is stateless; use `/tutor` skill for sessions

---

## 9. Wolfram Alpha MCP — Build Requirement

The Wolfram Alpha MCP does not currently exist in the user's setup. It must be built as part of implementation. Requirements:

- Accepts a natural language query string
- Returns: primary result value, unit, and brief description
- Handles fallback gracefully (empty result → signal caller to use `websearch`)
- Registered via `claude mcp add wolfram-alpha`
- API key stored as environment variable `WOLFRAM_ALPHA_API_KEY`

---

## 10. Token Budget (per question estimate)

| Route | Stage 1 | Stage 2 | Stage 3 | Total |
|---|---|---|---|---|
| `none` (Claude direct) | ~100 | 0 | ~50 | **~150** |
| `python` | ~100 | ~200 | ~80 | **~380** |
| `wolfram` | ~100 | ~300 | ~80 | **~480** |
| `websearch` | ~100 | ~500 | ~100 | **~700** |
| `ezhishi` | ~100 | ~150 | ~50 | **~300** |

---

## 11. Example Routing Decisions

| Question | Subject | Type | Tool | Reason |
|---|---|---|---|---|
| What is the capital of France? | humanities | factual | `none` | Trivial well-known fact |
| What is the distance between Beijing and Paris? | humanities | factual | `wolfram` | Measurable quantity |
| Who is the current president of France? | humanities | factual | `websearch` | Time-sensitive |
| Solve x² + 5x + 6 = 0 | math | calculation | `python` | Symbolic algebra |
| What is 24 × 17? | math | calculation | `none` | Simple arithmetic |
| What is Planck's constant? | physics | factual | `wolfram` | Measurable physical constant |
| Explain Newton's second law | physics | conceptual | `none` | Claude handles concepts |
| What is the molar mass of H₂SO₄? | chemistry | factual | `wolfram` | Measurable property |
| What caused World War 1? | humanities | factual | `websearch` | Historical fact, web verification |
| What does 怡然自得 mean? | chinese | factual | `none` | Claude handles Chinese meaning directly |
| Is 怡然自得 a P4 word? | chinese | factual | `ezhishi` | Syllabus scope check only |
| Is "I have went" grammatically correct? | english | language | `none` | English subject, Claude direct |
| Read this passage and identify the theme | english | comprehension | `none` | Passage-based, no external lookup |

---

## 12. Implementation Phases

1. **Phase 1** — Build Wolfram Alpha MCP (prerequisite for routes 9–11)
2. **Phase 2** — Build skill SKILL.md with classifier prompt + routing logic
3. **Phase 3** — Wire tool execution (python, websearch, ezhishi already available)
4. **Phase 4** — Wire Wolfram route
5. **Phase 5** — Test with representative questions across all routes
