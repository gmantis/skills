---
name: skill-creator
description: Create and install a new Claude Code skill. Activates on "create a skill", "install a skill", or "write a skill for X".
---

# Skill Creator

Creates a new Claude Code skill — a `SKILL.md` file that teaches Claude how to perform a specific reusable task — and installs it into `~/.claude/skills/<name>/`.

## What is a Skill?

A skill is a `SKILL.md` file with a YAML frontmatter header followed by a markdown body. When the skill name or trigger phrase appears in conversation, Claude Code loads the skill and follows its instructions.

```
~/.claude/skills/
└── <skill-name>/
    └── SKILL.md
```

## SKILL.md Format

```markdown
---
name: <kebab-case-name>
description: <one sentence — what it does and what phrases trigger it>
---

# <Title>

<What this skill does and when to use it.>

## <Section>

<Instructions, code patterns, workflow steps, etc.>
```

**Frontmatter fields:**
- `name` — kebab-case identifier, matches the directory name
- `description` — used by Claude to decide when to activate the skill; include trigger phrases here

## Workflow

### Step 1 — Understand the skill's purpose

Ask the user (or infer from context):
- What task should the skill perform?
- What trigger phrase(s) should activate it?
- Are there existing tools, libraries, or patterns it should use?
- Should it work cross-platform?

### Step 2 — Draft the SKILL.md

Write a clear, imperative-style document:
- **Sections** that break the task into steps
- **Code blocks** for any scripts, commands, or templates
- **Tips** for edge cases
- Keep it concise — Claude reads this at runtime, so every line costs tokens

### Step 3 — Install the skill

```bash
mkdir -p ~/.claude/skills/<name>
# then write SKILL.md to ~/.claude/skills/<name>/SKILL.md
```

Also copy to the project-local skills dir if it belongs to a specific project:
```bash
mkdir -p <project>/.claude/skills/<name>
cp ~/.claude/skills/<name>/SKILL.md <project>/.claude/skills/<name>/SKILL.md
```

### Step 4 — Add to llm-configs repo

If the skill should be version-controlled and synced across machines, copy it into the central repo:
```
d:/tool/llm-configs/skills/<name>/SKILL.md
```

### Step 5 — Confirm

Tell the user:
- Where the skill was installed
- What phrase triggers it
- Whether it was added to the llm-configs repo

## Tips

- The `description` field doubles as the activation trigger — write it so Claude can match user intent
- Prefer workflow steps over free-form prose; numbered steps are easier for Claude to follow at runtime
- If a skill uses external tools (Python packages, CLIs), include a Prerequisites section
- Skills can call other skills — reference them by name (e.g. "use the `pdf-page-images` skill")
