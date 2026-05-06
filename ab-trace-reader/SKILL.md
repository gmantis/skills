---
name: ab-trace-reader
description: Use when analyzing an Ab Initio XXtrace .run file to diagnose a symptom, error, or unexpected behavior. Triggers on "read trace", "analyze trace", "trace file", ".run file", "XXtrace", or when user provides a symptom and a trace file path.
---

# Ab Initio Trace Reader

## Overview

Ab Initio's XXtrace produces `.run` files in `$AB_TMPDIR`. Each line is a timestamped event from one or more processes. Given a **symptom** from the user, this skill walks you through finding the cause in the trace.

## Workflow

```
1. Collect inputs → 2. Anchor to symptom → 3. Trace backward → 4. Identify process/function → 5. Cross-reference code → 6. Report
```

---

## Step 1 — Collect Inputs

Ask the user for:
- **Symptom**: the error message, wrong behavior, or observable problem
- **Trace file path(s)**: path to the `.run` file (multiple files if multi-host)
- **SR/ticket number** (optional, for context)

---

## Step 2 — Understand the Trace Format

Each line:
```
<elapsed_sec>  <delta_ms>  <PID>/<ThreadID>  <tag>  <nesting>  <message>
```

Example:
```
0.4374    0.0 2087933/140017207769088 SQLTrans_action * | | | |   sql=ALTER TABLE foo ADD CONSTRAINT _ab_pkey PRIMARY KEY ();
```

| Column | Meaning |
|--------|---------|
| `0.4374` | Seconds since program start |
| `0.0` | Milliseconds since previous trace line |
| `2087933/...` | PID / Thread ID |
| `SQLTrans_action` | Trace tag (subsystem or function key) |
| `* \| \| \|` | Nesting depth indicator |
| Rest | Free-form trace message |

Special tags:
| Tag | Meaning |
|-----|---------|
| `argv` | Command-line args for this PID (identifies binary) |
| `xxtrace` | Trace session start |
| `urlspawnvp` | Parent PID spawning a child PID |
| `config` | Configuration variable sourcing; `_=*parentPID*/path` shows process parent |
| `abc_file` | File descriptor operations |

---

## Step 3 — Anchor to Symptom

Search the trace for the symptom text:

```bash
grep -n "YOUR ERROR MESSAGE" /path/to/trace.run
```

Note the **line number**, **timestamp**, and **PID** of the match. If multiple files (multi-host), search all:

```bash
grep -n "YOUR ERROR MESSAGE" sr*.run
```

---

## Step 4 — Read Context Around the Anchor

Read 20–50 lines **above** the symptom line to understand the sequence of events leading up to the failure:

```bash
grep -n "" trace.run | sed -n 'START,ENDp'
```

Focus on:
- Which **PID** is doing the work
- What **tags** (functions/subsystems) appear
- The **sequence of operations** — what was attempted just before failure?
- Any **time gaps** (large `delta_ms`) that suggest waiting or hanging

---

## Step 5 — Identify the Failing Process

To find which binary a PID belongs to:

```bash
grep 'argv\[0\]' trace.run | grep '<PID>'
```

To map **all** PIDs to their binaries:

```bash
grep 'argv\[0\]' sr*.run > argv0.run
```

To find the **parent** of a PID (process tree):

```bash
# Method 1: look for spawn event
grep 'urlspawnvp' trace.run | grep '<child_PID>'

# Method 2: look for config _= lines (format: _=*parentPID*binaryPath)
egrep 'config.*_=' trace.run | grep '<PID>'
```

---

## Step 6 — Identify the Source Code Location

The trace **tag** (column 4) maps to a `xhist` or `abc_trace_event` call in C++ source.

Search the codebase for the tag to find the file:

```bash
fis xhist | grep '<TAG_NAME>'
# or
grep -r '"<TAG_NAME>"' --include="*.cpp" --include="*.h" src/
```

Then read the source file to find the exact call site. If the tag is generic, narrow it by the message text:

```bash
grep -r '"YOUR MESSAGE SUBSTRING"' --include="*.cpp" src/
```

---

## Step 7 — Reconstruct the Cause

Synthesize findings into a root cause statement:

> **At T=X.XXXs, PID NNNN (binary: `path/to/binary`) called `<tag>` which produced `<message>`. This was preceded by `<sequence>`. The root cause is `<explanation>`.**

Then map the cause to:
- The **C++ function** responsible (from code search)
- The **data or state** that triggered it (from trace context)
- The **guard rail / fix location** (from reading surrounding code)

---

## Common Patterns

### Error immediately after SQL generation
Look for the SQL statement in a tag like `SQLTrans_action`. Then search upward for what called it (e.g., `execute_sql_statement`).

### Hang / timeout
Look for a large `delta_ms` value (hundreds or thousands of ms). The tag just before the gap is where execution stalled.

### Process communication failure
Filter by the PIDs of the two communicating processes. Look for `comm`, `inet`, or `abfd` tags on both sides. Find where one side sent but the other never received.

### Wrong process being traced
Use `argv[0]` grep to confirm you're reading the right binary. Use `urlspawnvp` / `config _=` to trace the process tree.

---

## Filtering Noisy Traces

If the trace is too large, re-run with filters:

```bash
# Exclude noisy subsystems
XXtrace -id <SR> -soft <command>
# -soft = -Uconfig:comm:ab_poll:inet:sqpfd:inet-exec

# Select only specific tags
XXtrace -id <SR> -S<tag1>:<tag2> <command>

# Trace only specific graph components
XXtrace -id <SR> -C'ComponentName.000' <command>
```

For a running graph, use `m_trace`:
```bash
m_trace -id <SR> -S<tag> <rec_file>
```

---

## Config Variable Source Numbers

When reading `config` tag lines, the source number means:
| # | Source |
|---|--------|
| 0 | Nowhere |
| 1 | Null |
| 2 | Default |
| 3 | Old |
| 4 | File |
| 5 | Environment |
| 6 | Set in C++ code |

---

## Quick Reference

| Task | Command |
|------|---------|
| Find symptom | `grep -n "error text" trace.run` |
| Identify PID's binary | `grep 'argv\[0\]' trace.run \| grep PID` |
| Find parent of PID | `egrep 'config.*_=' trace.run \| grep PID` |
| Find spawn events | `grep 'urlspawnvp' trace.run \| grep PID` |
| Find tag in source | `fis xhist \| grep TAG` or `grep -r '"TAG"' src/` |
| Narrow by message | `grep -r '"message substring"' src/` |
| View all PIDs | `grep 'argv\[0\]' sr*.run > argv0.run` |

---

## Output to User

At the end, present:
1. **Root cause**: 1–2 sentences
2. **Evidence**: the key trace lines (quoted)
3. **Source location**: file + function (if found)
4. **Fix direction**: where in code to add the guard rail
