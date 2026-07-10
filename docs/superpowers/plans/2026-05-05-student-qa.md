# Student Q&A Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/student-qa` Claude Code skill that routes student questions (primary–university) to the correct verification tool and returns concise, accurate answers.

**Architecture:** Three-stage pipeline — Classify (silent JSON) → Execute tool (skip if `none`) → Format answer. Wolfram Alpha is a new Python MCP built using the same FastMCP pattern as `gmail-mcp`. The SKILL.md instructs Claude to run the pipeline on each invocation.

**Tech Stack:** Python 3.11+, `mcp[cli]` (FastMCP), `httpx`, `sympy`, Wolfram Alpha Short Answers API, existing `websearch`/`ezhishi`/`defuddle` skills.

**Spec:** `docs/superpowers/specs/2026-05-05-student-qa-design.md`

---

## Task 1: Scaffold Wolfram MCP project structure

**Files:**
- Create: `C:\Users\xxiang\.claude\mcp\wolfram-mcp\pyproject.toml`
- Create: `C:\Users\xxiang\.claude\mcp\wolfram-mcp\src\wolfram_mcp\__init__.py`
- Create: `C:\Users\xxiang\.claude\mcp\wolfram-mcp\src\wolfram_mcp\server.py`

- [ ] **Step 1: Create directory structure**

```powershell
mkdir "C:\Users\xxiang\.claude\mcp\wolfram-mcp\src\wolfram_mcp"
```

- [ ] **Step 2: Write pyproject.toml**

Create `C:\Users\xxiang\.claude\mcp\wolfram-mcp\pyproject.toml`:

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "wolfram-mcp"
version = "0.1.0"
description = "MCP server for Wolfram Alpha queries"
requires-python = ">=3.11"
dependencies = [
    "mcp[cli]>=1.3.0",
    "httpx>=0.27.0",
]

[project.scripts]
wolfram-mcp = "wolfram_mcp.server:main"

[tool.hatch.build.targets.wheel]
packages = ["src/wolfram_mcp"]
```

- [ ] **Step 3: Write `__init__.py` (empty)**

Create `C:\Users\xxiang\.claude\mcp\wolfram-mcp\src\wolfram_mcp\__init__.py`:

```python
```

(Empty file — marks the package.)

- [ ] **Step 4: Write server.py**

Create `C:\Users\xxiang\.claude\mcp\wolfram-mcp\src\wolfram_mcp\server.py`:

```python
import os
import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Wolfram Alpha")


@mcp.tool()
async def wolfram_query(query: str) -> str:
    """
    Query Wolfram Alpha for a factual answer.
    Returns the plain-text result, or 'NO_RESULT' if Wolfram cannot answer.
    Falls back gracefully so the caller can try websearch instead.
    """
    app_id = os.environ.get("WOLFRAM_ALPHA_APP_ID")
    if not app_id:
        return "ERROR: WOLFRAM_ALPHA_APP_ID environment variable not set"

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.wolframalpha.com/v1/result",
            params={"i": query, "appid": app_id},
            timeout=10.0,
        )

    if response.status_code == 200:
        return response.text
    if response.status_code == 501:
        return "NO_RESULT"
    return f"ERROR: HTTP {response.status_code}"


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Confirm files exist**

```powershell
ls "C:\Users\xxiang\.claude\mcp\wolfram-mcp\src\wolfram_mcp\"
```

Expected: `__init__.py` and `server.py` listed.

---

## Task 2: Install Wolfram MCP dependencies

**Files:**
- Create: `C:\Users\xxiang\.claude\mcp\wolfram-mcp\.venv\` (generated)

- [ ] **Step 1: Create virtual environment**

```powershell
cd "C:\Users\xxiang\.claude\mcp\wolfram-mcp"
python -m venv .venv
```

Expected: `.venv\Scripts\python.exe` created.

- [ ] **Step 2: Install package in editable mode**

```powershell
.venv\Scripts\pip install -e .
```

Expected output includes: `Successfully installed wolfram-mcp-0.1.0`

- [ ] **Step 3: Verify import works**

```powershell
.venv\Scripts\python -c "from wolfram_mcp.server import mcp; print('OK')"
```

Expected: `OK`

---

## Task 3: Configure Wolfram Alpha API key

The Wolfram Alpha Short Answers API requires a free App ID.

- [ ] **Step 1: Get App ID**

Go to https://developer.wolframalpha.com → sign in → "Get an App ID" → create app → copy the App ID (looks like `XXXXXX-XXXXXXXXXX`).

- [ ] **Step 2: Set Windows system environment variable**

```powershell
[System.Environment]::SetEnvironmentVariable("WOLFRAM_ALPHA_APP_ID", "YOUR_APP_ID_HERE", "User")
```

Replace `YOUR_APP_ID_HERE` with the actual App ID.

- [ ] **Step 3: Verify variable is set (in a new terminal)**

```powershell
$env:WOLFRAM_ALPHA_APP_ID
```

Expected: Your App ID string (not empty).

---

## Task 4: Register Wolfram MCP with Claude Code

- [ ] **Step 1: Register the MCP server**

```powershell
claude mcp add wolfram-alpha "C:\Users\xxiang\.claude\mcp\wolfram-mcp\.venv\Scripts\python.exe" -m wolfram_mcp.server
```

- [ ] **Step 2: Verify it appears in the MCP list**

```powershell
claude mcp list
```

Expected: `wolfram-alpha` appears in the list.

---

## Task 5: Smoke-test Wolfram MCP

Restart Claude Code after registration so the new MCP is loaded.

- [ ] **Step 1: Test a simple factual query**

In Claude Code, call the `wolfram_query` tool directly:

> Call wolfram_query with query: "speed of light in meters per second"

Expected result: `2.998×10^8 m/s` (or similar plain text from Wolfram).

- [ ] **Step 2: Test NO_RESULT fallback**

> Call wolfram_query with query: "xyzzy nonsense query 12345"

Expected result: `NO_RESULT`

- [ ] **Step 3: Test unit conversion**

> Call wolfram_query with query: "distance from Beijing to Paris in kilometers"

Expected result: a numeric value in km.

---

## Task 6: Verify sympy is available for Python route

- [ ] **Step 1: Check sympy is installed**

```powershell
python -c "import sympy; print(sympy.__version__)"
```

Expected: a version number (e.g. `1.13.0`). If not installed, proceed to Step 2.

- [ ] **Step 2: Install sympy if missing**

```powershell
pip install sympy
```

Expected: `Successfully installed sympy-X.Y.Z`

- [ ] **Step 3: Verify a symbolic solve works**

```powershell
python -c "
from sympy import *
x = symbols('x')
result = solve(x**2 + 5*x + 6, x)
print(result)
"
```

Expected: `[-3, -2]`

---

## Task 7: Write student-qa SKILL.md

**Files:**
- Create: `C:\Users\xxiang\.claude\skills\student-qa\SKILL.md`

- [ ] **Step 1: Create skill directory**

```powershell
mkdir "C:\Users\xxiang\.claude\skills\student-qa"
```

- [ ] **Step 2: Write SKILL.md**

Create `C:\Users\xxiang\.claude\skills\student-qa\SKILL.md`:

```markdown
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
```

- [ ] **Step 3: Commit**

```powershell
cd "C:\Users\xxiang\.claude\skills"
git add student-qa/SKILL.md
git commit -m "feat: add student-qa skill"
```

---

## Task 8: Integration tests

Run each test question and verify the tool selected and the answer quality. These map directly to the routing table in the spec (Section 11).

- [ ] **Test 1 — Trivial fact (tool: none)**

> /student-qa What is the capital of France?

Expected: `Paris` (no tool called, instant)

- [ ] **Test 2 — Measurable quantity (tool: wolfram)**

> /student-qa What is the distance between Beijing and Paris?

Expected: Wolfram called, answer ~8,216 km

- [ ] **Test 3 — Time-sensitive (tool: websearch)**

> /student-qa Who is the current Prime Minister of Singapore?

Expected: WebSearch called, current name returned

- [ ] **Test 4 — Symbolic algebra (tool: python)**

> /student-qa Solve x² + 5x + 6 = 0

Expected: sympy called, answer `x = -2` or `x = -3`

- [ ] **Test 5 — Simple arithmetic (tool: none)**

> /student-qa What is 24 × 17?

Expected: `408` (no tool called)

- [ ] **Test 6 — Physical constant (tool: wolfram)**

> /student-qa What is Planck's constant?

Expected: Wolfram called, `6.626 × 10⁻³⁴ J·s`

- [ ] **Test 7 — Conceptual science (tool: none)**

> /student-qa Explain Newton's second law

Expected: Claude answers directly, no tool called

- [ ] **Test 8 — Chemistry property (tool: wolfram)**

> /student-qa What is the molar mass of H₂SO₄?

Expected: Wolfram called, `98.08 g/mol`

- [ ] **Test 9 — Humanities factual (tool: websearch)**

> /student-qa What caused World War 1?

Expected: WebSearch called, answer covers assassination + alliances + arms race

- [ ] **Test 10 — Chinese meaning (tool: none)**

> /student-qa What does 怡然自得 mean?

Expected: Claude answers in English with meaning and usage, no tool called

- [ ] **Test 11 — Chinese syllabus scope (tool: ezhishi)**

> /student-qa Is 怡然自得 a P4 word?

Expected: ezhishi invoked, returns grade level data

- [ ] **Test 12 — English grammar (tool: none)**

> /student-qa Is "I have went to school" grammatically correct?

Expected: Claude corrects to "I have gone to school", explains past participle

- [ ] **Test 13 — Step-by-step trigger**

> /student-qa Show working: A 5 kg object accelerates at 3 m/s². What is the force?

Expected: Step 1 (F = ma), Step 2 (substitute), Step 3 (= 15 N), ∴ 15 N

- [ ] **Test 14 — Primary level detection**

> /student-qa P3: What is photosynthesis?

Expected: simple vocabulary, analogy, no jargon

- [ ] **Test 15 — Wolfram NO_RESULT fallback**

> /student-qa What was the exact population of Singapore on 14 March 1987?

Expected: Wolfram returns NO_RESULT → falls back to websearch
