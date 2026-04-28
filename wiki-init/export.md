Export the companion wiki into a single highlights document suitable for ingestion into a main wiki.

## When to use

After finishing a book or source material, when you want to transfer the companion wiki's accumulated knowledge into a separate main/cross-book wiki.

## Steps

**Step 1 — Read the entire wiki**
Read `wiki/index.md` and every `wiki/*.md` page. Understand the full picture the companion wiki has built up.

**Step 2 — Determine the export title**
If $ARGUMENTS is provided, use that as the title.
Otherwise, infer the title from the wiki content (e.g. the book title, research topic, or project name).
Derive a filename: `<Title>.md`

**Step 3 — Write the highlights document**
Create the file in the project root (not in wiki/ or raw/) with this structure:

```markdown
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
```

**Guidelines:**
- Target 500–1500 words total. This is a distillation, not a dump.
- Write insights as standalone claims, not summaries of wiki pages. The recipient wiki doesn't know your page structure.
- Preserve specificity — "fructose drives insulin resistance" not "sugar is bad for you."
- Include the best 2-3 direct quotes if the source material had them.
- The Connections and Tensions section is the most valuable part — it captures cross-cutting synthesis that simple highlights miss.
- Do NOT include wiki metadata (frontmatter, cross-references, By Book tables). This is a clean source document.

**Step 4 — Report**
Show the filename, word count, and the list of themes. Remind the user:

> "Export complete. To use in your main wiki:
> 1. Copy `<filename>` to your main wiki's `raw/` directory
> 2. Run `/ingest <Title>` in the main wiki"
