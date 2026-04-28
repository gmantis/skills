---
name: session-pickup
description: Use when resuming work after session-handoff has created a context file in .temp directory - automatically loads context and cleans up handoff file
---

# Session Pickup

## Overview

Session-pickup is the complement to session-handoff. After a previous session creates a `.temp/session-handoff-*.md` file, use this skill to automatically:
1. Find and parse the latest handoff file
2. Extract key information (summary, decisions, unfinished tasks, next steps)
3. Present context in structured format
4. Remove the handoff file from `.temp/` (cleanup)
5. Take proactive next action based on "Pickup Instructions"

**Core principle:** Seamless session continuity with automatic cleanup. User triggers `/session-pickup` or says "pick up the session" and work resumes immediately.

## When to Use

**Use when:**
- Starting a new chat session in a project
- Previous session left a `.temp/session-handoff-*.md` file
- You want automatic context restoration + file cleanup
- You need to know what was done, what's unfinished, and what to do next

**Trigger:** `/session-pickup` or explicit request like "pick up the session"

**Works with:** Any project using session-handoff skill (learning-lab, code projects, docs, etc.)

## Implementation

### 1. Detect Project Root (Critical)

Before searching for handoff file, find the project root directory. Use this order:

```bash
# Option A: Use git to find project root
PROJECT_ROOT=$(cd "$(git rev-parse --show-toplevel 2>/dev/null)" && pwd)

# Option B: Search for CLAUDE.md or .claude/ directory
if [[ -z "$PROJECT_ROOT" ]]; then
  while [[ ! -f "CLAUDE.md" && ! -d ".claude" && "$PWD" != "/" ]]; do
    cd ..
  done
  PROJECT_ROOT=$(pwd)
fi

# Option C: If still not found, use current directory
if [[ ! -d "$PROJECT_ROOT/.temp" ]]; then
  PROJECT_ROOT=$(pwd)
fi

cd "$PROJECT_ROOT" || exit 1
```

This ensures the skill works whether user is in project root or a subdirectory.

### 2. Find Latest Handoff File

Find the most recently modified handoff file:

```bash
HANDOFF_FILE=$(ls -t .temp/session-handoff-*.md 2>/dev/null | grep -v incomplete | head -1)
```

The `-t` flag sorts by modification time (newest first). The `grep -v incomplete` filters out incomplete/temporary files. This reliably picks the most recent valid session-handoff.

If not found, inform user: "No session handoff file found in `.temp/`. Starting fresh."

### 2. Parse File Content

Extract these sections from the markdown:
- **Summary** (text after `## Summary`)
- **Decisions Made** (bullet list)
- **Mistakes & Lessons** (bullet list or prose)
- **Unfinished Tasks** (checklist, if present)
- **Pickup Instructions** (numbered steps)

**Validation:** If `## Pickup Instructions` section is missing, warn: "Warning: Handoff file appears incomplete (missing Pickup Instructions). Parsing what's available."

### 3. Render Structured Pickup Report

Present as:
```
## Session Pickup Report

### 📋 Summary
[Previous session's summary]

### 🎯 Key Decisions
- Decision 1
- Decision 2

### ❌ Unfinished Tasks
- [ ] Task 1
- [ ] Task 2

### 📝 Pickup Instructions
1. First action
2. Next action
3. Continue with...

### Next Action
[Suggest specific next step based on Pickup Instructions section]
```

### 4. Delete Handoff File

After parsing and presenting context, always delete to prevent reprocessing:

```bash
if rm -f "$HANDOFF_FILE" 2>/dev/null; then
  echo "✓ Handoff file cleaned up."
else
  echo "⚠ Warning: Could not delete handoff file (may be locked). Proceeding anyway."
fi
```

**Important:** Use `rm -f` to suppress errors. Deletion failure should not block session pickup — the file has already been read.

### 5. Take Proactive Action

Parse the "Pickup Instructions" section and suggest immediate next step:
- If step 1 is "`/review` first", suggest: "Running `/review` to see what's due..."
- If step mentions unfinished work, ask: "Ready to continue with [task]?"
- If step is "test the new feature", prompt: "Shall I test the session-handoff skill?"

Don't ask "what do you want to do?" — instead propose the instruction's suggested action.

## Quick Reference

| Phase | Action |
|-------|--------|
| **1. Locate** | Find latest `.temp/session-handoff-*.md` |
| **2. Parse** | Extract: summary, decisions, mistakes, unfinished, instructions |
| **3. Present** | Render structured report with all sections |
| **4. Cleanup** | Delete the `.temp/session-handoff-*.md` file |
| **5. Suggest** | Propose next action from Pickup Instructions |

## Common Mistakes

**Don't:**
- Leave the handoff file in `.temp/` after reading it (clutter)
- Present the file content as-is without structure (hard to scan)
- Ignore unfinished tasks and ask "what should we do?" (defeats purpose)
- Forget to suggest the next action (user has to re-read instructions)

**Do:**
- Always delete the file after pickup (cleanup is non-negotiable)
- Extract and structure all sections for easy scanning
- Highlight unfinished items so user can prioritize
- Be proactive: suggest next action from Pickup Instructions

## Example

**Handoff file content:**
```markdown
## Summary
Built testing framework for session-handoff skill, 24/24 tests passing.

## Unfinished Tasks
- [ ] Add auto-trigger hook documentation
- [ ] Test with real projects

## Pickup Instructions
1. Test the skill in a real learning-lab session
2. Gather user feedback
```

**What session-pickup does:**

```
## Session Pickup Report

### 📋 Summary
Built testing framework for session-handoff skill, 24/24 tests passing.

### ❌ Unfinished Tasks
- [ ] Add auto-trigger hook documentation
- [ ] Test with real projects

### Next Action
Let's test the session-handoff skill in a real learning-lab session. Ready?
```

Then: Deletes the handoff file.

## Integration with session-handoff

This skill completes the session management cycle:

1. **During session:** Do work, use `/session-handoff` at natural breaks
2. **In new session:** Paste the handoff file path or type `/session-pickup`
3. **Cleanup:** File is automatically removed; context is loaded

Together they enable multi-session projects without context loss.
