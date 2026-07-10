# describe-pdf

Extract a structured JSON description of any page from a scanned PDF that has been loaded into NotebookLM. Works for any content type: questions (MCQ, open-ended), textbook prose, diagrams, tables, lists, or mixed pages.

## When to trigger

- User says `/describe-pdf ...`
- Another skill needs a structured description of a specific PDF page
- User says "describe page X from [notebook]" or "extract page X from [source]"

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `notebook` | Yes | NotebookLM notebook name (exact or partial match) |
| `source` | Yes | PDF source name within the notebook |
| `page` | Yes | Page number — either printed number shown in book OR pdf page index from 1 |
| `page_type` | No | `printed` (default) or `pdf` — clarifies which numbering system `page` refers to |

## How to invoke

Run the Python script from the skill directory:

```bash
python "C:/Users/xxiang/.claude/skills/describe-pdf/describe_pdf.py" \
  --notebook "science-process-skills-p3" \
  --source "science-process-skills-fungi-and-bacteria_Optimized.pdf" \
  --page 99 \
  --page-type printed
```

The script:
1. Checks the local cache (`.pdf-descriptions/`) — returns immediately if already extracted
2. Finds the notebook ID via `notebooklm list`
3. Asks NotebookLM to describe the page as structured JSON
4. Saves the result to `.pdf-descriptions/<notebook>/<source>/page-printed-99.json`
5. Prints the file path to stdout

## Output

The script prints a single file path to stdout. Read that file for the JSON content.

**JSON schema:**

```json
{
  "ref": {
    "notebook": "science-process-skills-p3",
    "source": "science-process-skills-fungi-and-bacteria_Optimized.pdf",
    "page_printed": 99,
    "page_pdf": 17
  },
  "content": [
    { "type": "heading", "level": 1, "text": "PRACTICE 1" },
    { "type": "heading", "level": 2, "text": "Section A — Multiple-choice Questions [10 marks]" },
    {
      "type": "question",
      "number": 1,
      "text": "Which of the following is not a fungus?",
      "question_type": "MCQ",
      "marks": 1,
      "options": [
        { "label": "(1)", "caption": "Fern", "description": "hand-drawn plant with feathery fronds spreading from a central base" },
        { "label": "(2)", "caption": "Yeast", "description": "cluster of small oval yeast cells" }
      ],
      "process_skill": "Identifying"
    },
    { "type": "text", "text": "Fungi are organisms that absorb nutrients from..." },
    { "type": "diagram", "description": "Cross-section of a mushroom with labels: cap, gills, stalk, mycelium" },
    { "type": "table", "caption": "Differences between fungi and plants", "headers": ["Feature", "Fungi", "Plants"], "rows": [["Cell wall", "Chitin", "Cellulose"]] },
    { "type": "list", "style": "bullet", "items": ["Cannot make their own food", "Reproduce by spores"] }
  ]
}
```

**Content block types:**

| type | When to use |
|------|-------------|
| `heading` | Section title, chapter header, practice number |
| `text` | Prose paragraph or sentence |
| `question` | Any exam question (MCQ, open-ended, fill-in, structured) |
| `diagram` | Hand-drawn or printed illustration — described in text |
| `table` | Data table with headers and rows |
| `list` | Bullet or numbered list |
| `image` | Photo or non-diagram visual |

## Cache

Results are cached in `.pdf-descriptions/` relative to the current working directory:

```
.pdf-descriptions/
  <notebook-name>/
    <source-basename>/
      page-printed-99.json
      page-pdf-17.json
```

If both page numbers are known, both filenames are written (same content). This allows lookup by either numbering system.

## Error handling

- Notebook not found → exits with error message
- NotebookLM auth expired → prints "run: notebooklm login" and exits
- Page not found in source → JSON will contain `"content": []` with a `"note"` field explaining
- JSON parse failure → raw response saved to `<path>.raw.txt` for inspection

## Example usage in another skill

```python
import subprocess, json

result = subprocess.run(
    ["python", "C:/Users/xxiang/.claude/skills/describe-pdf/describe_pdf.py",
     "--notebook", "science-process-skills-p3",
     "--source", "science-process-skills-fungi-and-bacteria_Optimized.pdf",
     "--page", "99"],
    capture_output=True, encoding="utf-8"
)
path = result.stdout.strip()
data = json.loads(open(path, encoding="utf-8").read())

# Reference: data["ref"]["page_printed"] == 99
# Content:   data["content"][2]["text"]  == "Which of the following..."
```
