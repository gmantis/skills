---
name: docx
description: Create Word (.docx) documents using python-docx. Triggers on "create docx", "make a Word document", "generate Word doc", "docx", or "create a report in Word".
---

# DOCX Skill

Creates Word documents programmatically using `python-docx`. Use when the user asks to generate a `.docx` file, create a Word document, or produce a formatted report.

## Prerequisites

```bash
pip install python-docx
```

## Workflow

### Step 1 — Understand the document

Gather from the user (or infer from context):
- Document title and content
- Structure needed (headings, paragraphs, tables, lists, images)
- Output filename (default: `output.docx`)
- Any formatting requirements (fonts, styles, page layout)

### Step 2 — Generate a Python script

Write a Python script using `python-docx` and run it with Bash to produce the `.docx` file.

### Step 3 — Run the script

Execute the script and confirm the file was created. Report the output path.

## Code Patterns

### Basic document with headings and paragraphs

```python
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()

# Title
doc.add_heading("Document Title", level=0)  # level 0 = Title style

# Heading levels
doc.add_heading("Section 1", level=1)
doc.add_heading("Subsection 1.1", level=2)

# Paragraph
doc.add_paragraph("This is a normal paragraph of body text.")

# Page break
doc.add_page_break()

doc.save("output.docx")
print("Saved: output.docx")
```

### Formatted text (bold, italic, color)

```python
para = doc.add_paragraph()
run = para.add_run("Bold text ")
run.bold = True
run = para.add_run("Italic text ")
run.italic = True
run = para.add_run("Colored text")
run.font.color.rgb = RGBColor(0xFF, 0x00, 0x00)
run.font.size = Pt(14)
```

### Bullet and numbered lists

```python
# Bullet list
doc.add_paragraph("First item", style="List Bullet")
doc.add_paragraph("Second item", style="List Bullet")

# Numbered list
doc.add_paragraph("Step one", style="List Number")
doc.add_paragraph("Step two", style="List Number")
```

### Table

```python
table = doc.add_table(rows=3, cols=3)
table.style = "Table Grid"

# Header row
hdr = table.rows[0].cells
hdr[0].text = "Column A"
hdr[1].text = "Column B"
hdr[2].text = "Column C"

# Data rows
table.rows[1].cells[0].text = "Row 1, Col 1"
table.rows[2].cells[0].text = "Row 2, Col 1"
```

### Insert image

```python
doc.add_picture("image.png", width=Inches(4))
```

### Paragraph alignment

```python
para = doc.add_paragraph("Centered text")
para.alignment = WD_ALIGN_PARAGRAPH.CENTER
# Options: LEFT, CENTER, RIGHT, JUSTIFY
```

### Page margins

```python
from docx.shared import Inches
section = doc.sections[0]
section.top_margin = Inches(1)
section.bottom_margin = Inches(1)
section.left_margin = Inches(1.25)
section.right_margin = Inches(1.25)
```

### Apply a built-in style to a paragraph

```python
# Common styles: 'Normal', 'Heading 1', 'Quote', 'Intense Quote', 'Caption'
para = doc.add_paragraph("Quoted text", style="Quote")
```

## Tips

- `level=0` in `add_heading()` uses the "Title" style; levels 1–4 map to Heading 1–4.
- Tables need `table.style` set explicitly — `"Table Grid"` is a safe default for bordered tables.
- When generating reports from data, loop over rows to populate tables dynamically.
- Always save to an absolute path to avoid confusion about output location.
- To use a custom template: `doc = Document("template.docx")` — this inherits styles from the template.
