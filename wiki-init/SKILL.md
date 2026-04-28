---
name: wiki-init
description: Bootstrap a new LLM Wiki project in the current directory. Creates directory structure, CLAUDE.md, slash commands, and index. Triggers on "wiki-init", "create a wiki", "new wiki", "initialize wiki", "setup wiki".
---

# Wiki Init Skill

Scaffolds a complete LLM Wiki project in the current working directory with all customizations (standard markdown links, source attribution in queries, archive directory, conversation capture).

Based on the Karpathy LLM Wiki pattern with additional features documented in the Customizations section below.

## Workflow

### Step 1 — Create directory structure

```
<project root>/
├── raw/                    ← User's source files (immutable)
├── archive/                ← Conversation articles (reference only, never re-ingested)
├── wiki/                   ← LLM-compiled thematic knowledge pages
│   └── index.md            ← Master topic index and coverage map
├── .claude/
│   └── commands/           ← Slash commands
│       ├── ingest.md
│       ├── query.md
│       ├── lint.md
│       ├── capture.md
│       ├── archive.md
│       └── export.md
└── CLAUDE.md               ← Project instructions
```

Create all directories. Create each file with the content specified below.

### Step 2 — Write CLAUDE.md

Write this to `CLAUDE.md` in the project root:

```markdown
# LLM Wiki Schema

This directory is a personal knowledge base using the Karpathy LLM Wiki pattern.
Raw sources in `raw/` are compiled into thematic wiki pages in `wiki/`.

## Directory Layout

- `raw/` — Immutable source files. Never modify.
- `archive/` — Conversation articles. Reference only — never fed into `/ingest`.
- `wiki/` — LLM-compiled thematic knowledge pages.
- `wiki/index.md` — Master topic index and book coverage map.
- `.claude/commands/` — Slash commands: `/ingest`, `/query`, `/lint`, `/capture`, `/archive`, `/export`.

## Link Syntax

Use standard markdown links everywhere — in wiki pages, command output, and cross-references:
- Cross-references within wiki pages: `[slug](slug.md)` (relative, same directory)
- Query output citing wiki pages: `[slug](wiki/slug.md)` (relative to project root)
- Archive references: `[slug](../archive/YYYY-MM-DD-slug.md)` (from wiki) or `[slug](archive/YYYY-MM-DD-slug.md)` (from project root)

Do NOT use `[[wikilink]]` syntax. Standard markdown links are clickable in VS Code, GitHub, and Obsidian.

## Wiki Page Contract

Every `wiki/<topic>.md` must have:

1. YAML frontmatter:
   ```
   ---
   topic: <slug>
   last_updated: YYYY-MM-DD
   sources: [Source A, Source B]
   ---
   ```
   Slugs are lowercase, hyphen-separated, e.g. `cognitive-bias`, `personal-finance`.

The `sources` list uses exact filename stems from `raw/` (e.g., `Deep Work` not `Deep Work by Cal Newport`).

2. `## Core Ideas` — 150–200 words, synthesized insight across all sources.
3. `## By Source` — Markdown table: `| Source | Key Contribution |`
4. `## Cross-references` — `- See also: [topic-slug](topic-slug.md)` links to related wiki pages.

Maximum 500 words per page body. Split into sub-topics if exceeded.

Set `last_updated` to today's date whenever rewriting or creating a page.

## Ingest Behavior

When ingesting a new source file:
1. Identify 3–7 relevant themes. Reuse existing topics whenever possible.
2. If a theme has no existing `wiki/<slug>.md`, create a new page with empty By Source table and placeholder Core Ideas. Set `sources: []` initially.
3. For each theme, rewrite the wiki page to synthesize the new knowledge — do not raw-append.
4. Before adding cross-references, check `wiki/index.md` for existing topic slugs. Only link to slugs that already exist.
5. Update `wiki/index.md` to record the source and its covered topics.

## Lint Rules

Flag these issues:
- Broken markdown links in cross-references (target `wiki/<slug>.md` does not exist).
- Legacy `[[wikilink]]` syntax — must be converted to standard markdown links.
- Pages not listed in `wiki/index.md` (orphaned).
- Pages with `last_updated` older than 90 days.
- Pages missing required frontmatter fields.
- Applied Insight sections without an archive source link.

## Query Behavior

- Cite wiki pages as `[slug](wiki/slug.md)`, not raw filenames.
- Include source attribution after claims: *(Sources: Source A, Source B | Archive: [slug](archive/YYYY-MM-DD-slug.md))*
- Synthesize across multiple pages when the question spans themes.
- Check `archive/` for relevant conversation articles and include them in synthesis.
- State explicitly when wiki coverage on a topic is thin.

## Conversation Behavior

After any substantive conversation that generates new insights, applied examples, reframings, or practical strategies grounded in the wiki's topics — proactively offer to capture them:

> "This conversation generated some insights that extend what the wiki already covers. Want me to capture them with `/capture`?"

Do not wait to be asked. The wiki grows from both books and conversations.

## Slash Commands (Claude Code)

- `/ingest` — Ingest all unindexed sources into the wiki (no Python required)
- `/ingest <source name>` — Ingest a specific source by filename stem
- `/query <question>` — Search wiki pages and synthesize an answer
- `/lint` — Health-check the wiki for broken links, orphans, stale pages, and unindexed sources
- `/capture` — Capture insights from the current conversation into the wiki
- `/archive` — Archive the current conversation as a structured article in `archive/`
- `/export` — Export the wiki as a single highlights document for ingestion into another wiki
```

### Step 3 — Write wiki/index.md

```markdown
# Wiki Index

## Topics

(No topics yet — run `/ingest` after adding source files to `raw/`)

## Source Coverage
| Source | Topics | Ingested |
|--------|--------|----------|
```

### Step 4 — Write slash commands

Create all six files in `.claude/commands/`:

**`.claude/commands/ingest.md`:**

```markdown
Ingest source notes into the wiki. Follow the full schema defined in CLAUDE.md exactly.

## Determine what to ingest

If $ARGUMENTS is provided, ingest that specific source:
- Look for `raw/$ARGUMENTS.md` (or a close filename match in any subdirectory of raw/)

If no argument is provided, ingest ALL unindexed sources:
1. Read `wiki/index.md` — the Source Coverage table lists already-ingested sources
2. Use Glob to list all `.md` files under `raw/` (recursively)
3. For each file whose stem is NOT in the Source Coverage table, ingest it

## For each source to ingest

**Step 1 — Read the source**
Read the raw source file in full.

**Step 2 — Understand the existing wiki**
Read `wiki/index.md` to see current topics and coverage.
Read the content of wiki pages whose topics are likely to overlap with this source.

**Step 3 — Identify themes**
Identify 3–7 relevant themes. Strongly prefer reusing existing topic slugs from wiki/index.md.
Only create a new topic slug if no existing topic fits. Slugs are lowercase, hyphen-separated (e.g. `cognitive-bias`, `personal-finance`).

**Step 4 — Update each wiki page**
For each theme:
- If `wiki/<slug>.md` exists: **rewrite** it to synthesize the new knowledge alongside existing content. Do NOT raw-append — integrate, compare, and synthesize across all sources. Read the existing page first.
- If `wiki/<slug>.md` does not exist: create it with the full required structure per the CLAUDE.md Wiki Page Contract.

Every wiki page must have:
```
---
topic: <slug>
last_updated: <today's date>
sources: [Source A, Source B, ...]
---
# <Topic Title>

## Core Ideas
[150–200 words synthesised across all sources]

## By Source
| Source | Key Contribution |
|--------|-----------------|
| Source A | ... |

## Cross-references
- See also: [related-slug](related-slug.md)
```

The `sources` list uses **exact filename stems** from `raw/`.
Maximum 500 words per page body. Split into a sub-topic page if exceeded.
Cross-references use standard markdown links: `[slug](slug.md)`. Only link to slugs that already exist in wiki/index.md.
Do NOT use `[[wikilink]]` syntax.

**Step 5 — Update wiki/index.md**
Add a row to the Source Coverage table:
`| <Source stem> | <topic1>, <topic2> | <today's date> |`

Add any newly created topics to the Topics section:
`- [slug](slug.md)`

**Step 6 — Report**
List which wiki pages were created or updated, and which topics were covered.
```

**`.claude/commands/query.md`:**

```markdown
Answer a question using the personal knowledge wiki.

The question is: $ARGUMENTS

## Steps

1. Read `wiki/index.md` to understand the available topics.

2. Identify which topics are relevant to the question. Use your judgment — a question about "forming habits" might span multiple topic pages.

3. Read the full content of each relevant wiki page.

4. Check `archive/` for any conversation articles whose `related_topics` overlap with the relevant topics. Read any matching archives.

5. Synthesise a direct answer based on the wiki content and any relevant archived conversations.

## Output format

- Answer the question concisely and directly
- Cite wiki pages using standard markdown links: `[topic-slug](wiki/topic-slug.md)` (e.g. "According to [psychology](wiki/psychology.md)...")
- After each major claim, include a parenthetical source attribution showing which sources and/or archives support it:
  *(Sources: Source Title A, Source Title B | Archive: [slug](archive/YYYY-MM-DD-slug.md))*
  - The source titles come from the wiki page's `sources:` frontmatter and `## By Source` table
  - Archive references come from any matching files in `archive/`
  - If a claim comes only from sources, omit the Archive part. If only from an archive, omit the source part.
- If multiple wiki pages contribute different angles, synthesise them rather than listing them separately
- If wiki coverage on the topic is thin or absent, say so explicitly: "The wiki has limited coverage on X — you may want to run `/ingest` on relevant sources first"
- Do NOT use `[[wikilink]]` syntax — always use standard markdown links
```

**`.claude/commands/lint.md`:**

```markdown
Run a health check on the wiki and report all issues found.

## Checks to perform

**1. Broken cross-references**
For every `wiki/*.md` file (excluding index.md), find all markdown links in Cross-references sections.
Links should be in the form `[slug](slug.md)`. Check that each linked file exists as `wiki/<slug>.md`.
Also flag any legacy `[[slug]]` wikilinks — these should be converted to `[slug](slug.md)`.
Report: `<page>.md: broken link [slug](slug.md)` or `<page>.md: legacy wikilink [[slug]] — convert to markdown link`

**2. Orphaned pages**
Read `wiki/index.md` Topics section.
For every `wiki/*.md` file (excluding index.md), verify it appears in the Topics list.
Report: `<page>.md: orphaned (not listed in wiki/index.md)`

**3. Missing frontmatter fields**
Every wiki page must have all three frontmatter fields: `topic`, `last_updated`, `sources`.
Report: `<page>.md: missing frontmatter field '<field>'`

**4. Stale pages**
Flag any page whose `last_updated` date is more than 90 days before today.
Report: `<page>.md: stale — last updated <date>`

**5. Unindexed sources**
Read the Source Coverage table in `wiki/index.md`.
List all `.md` files in `raw/` (recursively) that are NOT in the coverage table.
Report: `raw/<source>.md: not yet ingested`

**6. Missing source attribution in Applied Insight sections**
For every `## Applied Insight:` section in wiki pages, check whether it has a `*Source: [archive/...](...)` link.
Report: `<page>.md: Applied Insight "<title>" has no archive source link`

## Output

If no issues: "Wiki looks healthy!"

If issues found, group by type and suggest the most impactful fix first
(e.g. "Run `/ingest <source>` to add the N unindexed sources").
```

**`.claude/commands/capture.md`:**

```markdown
Capture insights from the current conversation into the wiki.

## What to capture

Look back through the current conversation for:
- Connections between ideas that go deeper than what the wiki currently says
- Applied insights — how a general principle plays out in a specific real-world situation
- Reframings or analogies that make a concept clearer
- Practical strategies derived from synthesising multiple wiki topics
- Questions the user asked that revealed a gap or nuance in existing wiki coverage

Do NOT capture: opinions, personal details about the user, speculative claims without grounding in the source material, or anything already covered in the wiki at the same level of depth.

## How to add them

1. Read `wiki/index.md` to identify which existing topics the insights belong to.
2. Read each relevant wiki page.
3. Add the new insights under a new `## Applied Insight: <title>` subsection within the appropriate page. Do not replace existing content — add to it.
4. Update `last_updated` in the frontmatter to today's date.
5. If the insight genuinely spans multiple pages, add a brief note in each.
6. Do NOT create new topic pages just for conversation insights — only extend existing ones unless the insight is truly a new theme not covered anywhere.
7. Use standard markdown links `[slug](slug.md)` for any cross-references. Do NOT use `[[wikilink]]` syntax.

## After capture, prompt for archive

After updating wiki pages, ask the user:

> "Wiki pages updated. Want me to also run `/archive` to save the full conversation reasoning for traceability?"

This creates the link: wiki Applied Insight → archived conversation → full reasoning chain.

## Report

List each wiki page updated and the insight added in one sentence per page.
```

**`.claude/commands/archive.md`:**

```markdown
Archive the current conversation as a structured article for future reference.

The archive preserves reasoning chains, dialogue structure, and context that `/capture` compresses away. Archives are reference documents — they are NOT fed back into `/ingest`.

## How to archive

**Step 1 — Identify what's worth archiving**
Look back through the conversation for:
- Substantive discussions that produced original thinking
- Reasoning chains that led to non-obvious conclusions
- Debates or explorations where the path matters, not just the destination
- Design decisions with rationale

Skip: small talk, tool errors, routine file operations.

**Step 2 — Choose a title and slug**
Pick a descriptive title (e.g. "YouTube Anti-Binging: Variable Ratio Traps and Structural Fixes").
Derive a slug: lowercase, hyphen-separated (e.g. `youtube-anti-binging`).

**Step 3 — Write the article**
Create `archive/YYYY-MM-DD-<slug>.md` with this structure:

```
---
title: <descriptive title>
date: <today's date>
related_topics: [topic-slug-1, topic-slug-2]
---

# <Title>

## Context
[1-2 sentences: what prompted this conversation]

## Discussion
[The core reasoning chain, structured as prose. Preserve the key arguments,
counterarguments, examples, and analogies. Write in third person or impersonal
voice. This is an article, not a transcript — reorganize for clarity but keep
the reasoning path intact.]

## Key Insights
[Bulleted list of the main conclusions reached]

## Open Questions
[Any unresolved threads or future directions mentioned]
```

Target 300-800 words for the Discussion section. Prioritize the reasoning path over conclusions — conclusions are already in the wiki via `/capture`.

**Step 4 — Link from wiki (optional)**
If `/capture` has already added Applied Insight sections to wiki pages, add a source reference at the end of each relevant insight:

`*Source: [archive/YYYY-MM-DD-slug](../archive/YYYY-MM-DD-slug.md)*`

This creates the traceability chain: wiki insight → archived conversation → original reasoning.

**Step 5 — Report**
Show the archive filename and list the related wiki topics.
```

**`.claude/commands/export.md`:**

```markdown
Export the wiki into a single highlights document suitable for ingestion into another wiki.

## When to use

After finishing a book or source material in a companion wiki, when you want to transfer the accumulated knowledge into a separate main/cross-topic wiki.

## Steps

**Step 1 — Read the entire wiki**
Read `wiki/index.md` and every `wiki/*.md` page. Understand the full picture the wiki has built up.

**Step 2 — Determine the export title**
If $ARGUMENTS is provided, use that as the title.
Otherwise, infer the title from the wiki content (e.g. the book title, research topic, or project name).
Derive a filename: `<Title>.md`

**Step 3 — Write the highlights document**
Create the file in the project root (not in wiki/ or raw/) with this structure:

# <Title>

## Key Themes
[Bulleted list of 3–7 major themes, each in 1 sentence]

## Highlights

### <Theme 1>
[2-5 concise bullet points capturing the key insights for this theme.
Each bullet should be a standalone claim or insight — specific enough
to be useful, general enough to synthesize with other sources.
Include notable quotes with attribution where they carry weight.]

### <Theme 2>
[Same format]

...

## Connections and Tensions
[2-4 bullets noting internal contradictions, surprising connections,
or open questions that emerged across the wiki pages.
These are high-value because they represent synthesis the LLM
performed during the reading process.]

**Guidelines:**
- Target 500–1500 words total. This is a distillation, not a dump.
- Write insights as standalone claims, not summaries of wiki pages. The recipient wiki doesn't know your page structure.
- Preserve specificity — "fructose drives insulin resistance" not "sugar is bad for you."
- Include the best 2-3 direct quotes if the source material had them.
- The Connections and Tensions section is the most valuable part — it captures cross-cutting synthesis that simple highlights miss.
- Do NOT include wiki metadata (frontmatter, cross-references, By Source tables). This is a clean source document.

**Step 4 — Report**
Show the filename, word count, and the list of themes. Remind the user:

> "Export complete. To use in your main wiki:
> 1. Copy `<filename>` to your main wiki's `raw/` directory
> 2. Run `/ingest <Title>` in the main wiki"
```

### Step 5 — Report

After scaffolding, report:
- Directory structure created
- Number of files written
- Next step: "Add your source files to `raw/` and run `/ingest` to build the wiki."
