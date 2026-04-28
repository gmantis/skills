---
name: pptx
description: Create PowerPoint (.pptx) presentations using python-pptx. Triggers on "create pptx", "make a presentation", "generate PowerPoint", "pptx", or "create slides".
---

# PPTX Skill

Creates PowerPoint presentations programmatically using `python-pptx`. Use when the user asks to generate a `.pptx` file, create slides, or build a presentation.

## Prerequisites

```bash
pip install python-pptx
```

## Workflow

### Step 1 — Understand the presentation

Gather from the user (or infer from context):
- Title and topic
- Number of slides and their content
- Output filename (default: `output.pptx`)
- Any specific layout preferences (title slide, bullet points, two-column, etc.)

### Step 2 — Generate a Python script

Write a Python script using `python-pptx` that creates the presentation. Run it with Bash to produce the `.pptx` file.

### Step 3 — Run the script

Execute the script and confirm the file was created. Report the output path.

## Code Patterns

### Basic presentation with title + content slides

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN

prs = Presentation()

# Slide layouts: 0=Title Slide, 1=Title and Content, 2=Title Only, 6=Blank
SLD_TITLE = 0
SLD_CONTENT = 1

# Title slide
slide = prs.slides.add_slide(prs.slide_layouts[SLD_TITLE])
slide.shapes.title.text = "Presentation Title"
slide.placeholders[1].text = "Subtitle text"

# Content slide
slide = prs.slides.add_slide(prs.slide_layouts[SLD_CONTENT])
slide.shapes.title.text = "Slide Title"
tf = slide.placeholders[1].text_frame
tf.text = "First bullet"
tf.add_paragraph().text = "Second bullet"
tf.add_paragraph().text = "Third bullet"

prs.save("output.pptx")
print("Saved: output.pptx")
```

### Bullet indentation levels

```python
from pptx.util import Pt
p = tf.add_paragraph()
p.text = "Sub-bullet"
p.level = 1  # indent level (0=top, 1=sub, 2=sub-sub)
```

### Text formatting

```python
from pptx.util import Pt
from pptx.dml.color import RGBColor

run = paragraph.add_run()
run.text = "Bold red text"
run.font.bold = True
run.font.size = Pt(24)
run.font.color.rgb = RGBColor(0xFF, 0x00, 0x00)
```

### Add an image

```python
slide.shapes.add_picture("image.png", Inches(1), Inches(2), Inches(4), Inches(3))
```

### Add a table

```python
rows, cols = 3, 3
table = slide.shapes.add_table(rows, cols, Inches(1), Inches(2), Inches(8), Inches(3)).table
table.cell(0, 0).text = "Header"
table.cell(1, 0).text = "Row 1 Col 1"
```

### Set slide dimensions (widescreen 16:9)

```python
from pptx.util import Inches
prs = Presentation()
prs.slide_width = Inches(13.33)
prs.slide_height = Inches(7.5)
```

## Tips

- Default slide size is 10x7.5 inches (4:3). Use 13.33x7.5 for 16:9 widescreen.
- `slide.placeholders` indices vary by layout — use `[0]` for title, `[1]` for body/content.
- To inspect available layouts: `for i, layout in enumerate(prs.slide_layouts): print(i, layout.name)`
- Always save to an absolute path when possible to avoid confusion about output location.
- When content is provided as structured text or JSON, parse it and loop to generate slides dynamically.
