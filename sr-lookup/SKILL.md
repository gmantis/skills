---
name: sr-lookup
description: Retrieve SR summaries, timelines, and details using a dual-source strategy — sr-database for fast historical data, servicenow-connector for real-time updates within the last 24 hours. Triggers on "SR summary", "SR timeline", "CSR", "CS00", "get SR", "check SR", "what happened on SR", or any SR number reference.
---

# SR Lookup (Dual-Source)

Intelligently routes SR queries between two MCP servers to give fast, complete results:

| Server | Speed | Freshness | Tools |
|---|---|---|---|
| **sr-database** | Fast | Updated daily (may be up to 24h stale) | sr_get, sr_search, sr_filter, sr_analytics, sr_find_experts, sr_search_fixes, sr_query, sr_recent |
| **servicenow-connector** | Slow | Real-time | get_sr_timeline (full comms: emails, work notes, comments, linked Jira) |

## SR Number Shorthand

When the user provides a bare 5-digit number (e.g., `51812`), treat it as a CSR number: zero-pad to 7 digits and prepend `CSR00`. Examples:

| User types | Interpret as |
|---|---|
| `51812` | `CSR0051812` |
| `35630` | `CSR0035630` |
| `1004` | `CS0001004` (4 digits = CS-format) |

Use the expanded form when calling any MCP tool.

## Routing Rules

### Rule 1 — Always start with sr-database

For ANY SR query (summary, timeline, search, filter, analytics), use `sr-database` tools first. They are faster and have richer query capabilities.

### Rule 2 — Supplement with servicenow-connector for recent activity

After getting sr-database results, check whether the SR might have updates in the last 24 hours. Use `servicenow-connector.get_sr_timeline` to fetch real-time data when **any** of these apply:

- The SR status is **open** or **in-progress**
- The user explicitly asks for the "latest" or "most recent" updates
- The SR was last updated within the past 48 hours (gives a buffer for the daily sync lag)
- The user asks "what's new" or "any updates" on an SR

**Do NOT call servicenow-connector when:**
- The SR is **closed** and was last updated more than 48 hours ago (sr-database is already complete)
- The user is doing bulk searches, analytics, or filtering (sr-database only)
- The user is searching for fixes or experts (sr-database only)

### Rule 3 — Merge and present clearly

When both sources are used, present a unified view:

1. Show the full history from sr-database
2. Clearly label any **additional recent updates** found via servicenow-connector that are not yet in the database, e.g.:

> **Recent updates (live from ServiceNow, not yet in daily sync):**
> - [2026-04-08 14:30] Work note by John Doe: "Applied hotfix v3.2.1..."

If servicenow-connector returns nothing new beyond what sr-database already has, just say "Database is up to date — no additional recent activity found."

### Rule 4 — Session management for servicenow-connector

Before calling `get_sr_timeline`, call `check_session` first. If the session is expired, call `refresh_session` and inform the user if manual action is needed.

## Tool Selection Quick Reference

| User intent | Primary tool | Supplement with servicenow-connector? |
|---|---|---|
| "Summarize SR CSR0035630" | `sr_get` | Yes, if SR is open/recent |
| "Timeline for CSR0035630" | `sr_get` (with documents) | Yes, if SR is open/recent |
| "Search SRs about memory leak" | `sr_search` | No |
| "Find fixes for GDE timeout" | `sr_search_fixes` | No |
| "Who's the expert on Co>Op?" | `sr_find_experts` | No |
| "My open SRs" | `sr_filter` | No (bulk query) |
| "Any updates on CSR0035630?" | `sr_get` then `get_sr_timeline` | **Always yes** — user is asking for latest |
| "Analytics on RCA distribution" | `sr_analytics` | No |
| "Recent SRs this week" | `sr_recent` | No |
| "What JIRA tickets link to this SR?" | `sr_search_by_reference` | No |

## Example Workflow

User: "Give me a summary of CSR0035630"

1. Call `mcp__sr_database__sr_get(sr_number="CSR0035630", include_documents=true)`
2. Check: is the SR open? Was it updated recently?
   - **If yes** -> call `mcp__servicenow-connector__check_session()`, then `mcp__servicenow-connector__get_sr_timeline(case_number="CSR0035630")`
   - **If no** -> skip servicenow-connector, sr-database has everything
3. Present unified summary, flagging any live-only updates
