---
name: session-handoff
description: Create a comprehensive handoff document at the end of a session or when context gets full. Captures conversation summary, decisions made, mistakes/lessons, unfinished tasks, and pickup instructions for the next session. Trigger when you're about to end a session, switching projects, or context window is getting full (~50%). Works across all project types.
---

# Session Handoff Skill

When a session is ending or context is getting crowded, use this skill to capture what happened, what went wrong, what's left to do, and how to pick up next time.

## What This Does

The skill analyzes your current conversation and **automatically extracts**:

1. **Summary** — What was accomplished in this session (2-3 sentences)
2. **Decisions** — Important choices made or directions chosen
3. **Mistakes & Lessons** — Things that went wrong and what you learned
4. **Unfinished Tasks** — Work still in progress (pulled from TodoWrite or conversation context)
5. **Pickup Instructions** — How to resume work in the next session (files to open, commands to run, code locations, etc.)

The handoff is saved as a **standalone Markdown file** in `.temp/session-handoff-YYYY-MM-DD-HHmmss.md` so it's easy to find at the start of your next session.

## When to Use

- **End of a long session** — Before you close the project
- **Context is full** — When approaching ~50% of the context window
- **Switching projects** — When moving between different work
- **Uncertain how to continue** — If you're not sure where you left off

## How to Invoke

**Manual trigger (recommended):**
```
Create a session handoff / Create a handoff document / Save session state
```

**Automatic trigger (optional setup):**
To auto-trigger at 50% context, add this hook to `.claude/settings.json`:
```json
{
  "hooks": {
    "context_threshold": {
      "trigger": "50",
      "action": "remind user to run /session-handoff"
    }
  }
}
```

## The Handoff Format

The handoff file follows this structure:

```markdown
# Session Handoff — [Project Name] — [Date & Time]

## Summary
[2-3 sentence overview of what you accomplished]

## Decisions Made
- Decision 1 and why you made it
- Decision 2 and its implications
- ...

## Mistakes & Lessons
- What went wrong
- Why it happened
- What to do differently next time

## Unfinished Tasks
- [ ] Task 1 (priority: high/medium/low)
- [ ] Task 2 
- ...

## Pickup Instructions
1. Open files: [list of key files/folders to open]
2. Current state: [where you left off]
3. Next steps: [what to do when resuming]
4. Context: [any tricky state, workarounds, or blockers]
```

## What the Skill Extracts

### Summary
Reads through the conversation and pulls out what you accomplished. Looks for:
- New features added, bugs fixed, tasks completed
- Files created, modified, or deleted
- Tests run, documentation written

### Decisions Made
Extracts important choices from your conversation:
- Architecture decisions, tool selections
- Refactoring approaches, naming conventions
- Trade-offs you chose between options
- Reasons you abandoned one path for another

### Mistakes & Lessons
Captures things that went wrong:
- Failed commands, syntax errors, design mistakes
- Bugs introduced or discovered
- Assumptions that turned out wrong
- What you'd do differently

### Unfinished Tasks
Pulls from multiple sources:
- Your TodoWrite lists (if present)
- Tasks mentioned in conversation but not completed
- Blocked work waiting for external input
- Nice-to-haves deferred to next session

### Pickup Instructions
Generates concrete next-steps including:
- File paths to reopen
- Code locations to jump to (file:line format)
- Commands to re-run (tests, builds, dev servers)
- Context about tricky state or workarounds
- What the next logical task is

## Example Handoff

```markdown
# Session Handoff — learning-lab — 2026-04-24 15:30

## Summary
Implemented the Chinese essay vocabulary exercise (2026-04-24-chinese-essay-phrases-set1), extracted 32 action phrase questions from the exam paper, and created the knowledge page for essay-action-phrases. Marked 8 attempts and updated the dashboard.

## Decisions Made
- Used YAML format for the exercise metadata (consistent with existing exercises)
- Kept the exercise at difficulty 4 (challenging, but age-appropriate for Kejia)
- Decided to teach essay phrases through context rather than isolated drill (better for writing)

## Mistakes & Lessons
- Initially tried OCR on low-res page images — got garbled Chinese characters. Switched to manual transcription from cleaner source.
- Forgot to update dashboard.html first time (caught by lint check). Remember: always add exercises to dashboard before marking.

## Unfinished Tasks
- [ ] Create interleaved practice for essay phrases (medium priority)
- [ ] Review Kejia's last 3 attempts on reading comprehension (high priority)
- [ ] Suspend arithmetic-rate-problems topic (low priority, can wait)

## Pickup Instructions
1. Open files:
   - Dashboard: `exercises/dashboard.html`
   - Latest exercise: `exercises/chinese/2026-04-24-chinese-essay-phrases-set1.yaml`
   - Knowledge page: `knowledge/chinese/chinese-essay-action-phrases.md`

2. Current state:
   - Kejia just attempted 8 new questions; all marked and taught
   - Next review scheduled for 2026-04-25 (tomorrow)
   - Graphify needs to be run to update the graph

3. Next steps:
   - Run `/graphify --update` to update the knowledge graph
   - Then run `/progress` to see overall learning status
   - Check if Kejia is ready for interleaved practice on essay phrases

4. Context:
   - The OCR issue mentioned above affects any low-res material — use manual transcription for Chinese text
   - Dashboard updates are now automatic on `/mark`, so no manual edits needed
```

## Technical Details

**File location:** `.temp/session-handoff-YYYY-MM-DD-HHmmss.md`
- Creates `.temp/` directory if it doesn't exist
- Timestamp ensures multiple handoffs don't overwrite
- Relative to your current working directory

**Conversation analysis:**
- Reads the full conversation history (from the start of the session)
- Extracts structured information using pattern matching and semantic analysis
- Safe for all project types (code, learning labs, docs, etc.)

**No external dependencies:**
- Doesn't require TodoWrite lists (but uses them if present)
- Doesn't require project-specific schema (generic across all projects)
- Works in any directory with a `.temp/` folder (creates if needed)

## Tips for Best Results

1. **At the start of your next session**, open the most recent handoff from `.temp/` and skim it before diving back in
2. **Be descriptive in your conversation** — the more context you provide, the better the handoff captures
3. **Use TodoWrite early** — if you create a todo list, the handoff will pick it up automatically
4. **Mention decisions aloud** — when you choose one approach over another, say why; the skill will capture it
5. **Log mistakes** — if something goes wrong, briefly say what and why; the skill extracts lessons from this

## Limitations

- Extracts from *your conversation only* — doesn't read your codebase or files directly (for privacy)
- May miss very implicit context (if you're thinking it but not saying it, it won't be captured)
- Mistakes section reflects what you mentioned in the conversation, not uncommitted bugs in code
- Works best if you narrate your work; silent work is harder to reconstruct
