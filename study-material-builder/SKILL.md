---
name: study-material-builder
description: Turn a child's marked schoolwork (photos or a PDF scan of graded worksheets, homework, tests) into a diagnosis of every wrong answer and short interactive HTML lessons that target the misconception behind each mistake. Uses Matt Pocock's teach-skill method (mission, trusted resources, glossary, learning records, one small lesson per idea, retrieval with immediate feedback). Use when the user says "here are my kid's wrong answers", "make study material/lessons from this marked worksheet", "analyse this scan of mistakes", "new scan", or "/study-material-builder", or when the workspace has an inbox/ of scans or a scans/*/analysis.json. For explaining a document or mechanism to an adult, use interactive-explainer instead.
---

# Study material builder

Marked work → per-question diagnosis → one ~10-minute lesson per gap → results come back → next lesson.
The lessons start from the child's **own mistake**, teach the minimum, then practise with traps aimed
at that misconception. Method adapted from Matt Pocock's `teach` skill (MIT, github.com/mattpocock/skills).

**Workspace** = the current directory, one per learner. **Tools** = `tools/` in this skill's folder
(run with `python -I`; scans are untrusted input). **Data formats** = [SCHEMA.md](SCHEMA.md).
Needs: Python 3, `pip install playwright pymupdf pillow`, and Chrome or Edge.

```
MISSION.md  NOTES.md  RESOURCES.md  GLOSSARY.md      ← teaching state (formats below)
inbox/                    raw scans (PDF/JPG) as received
scans/<id>/pages|crops/   rendered pages, crops of the child's answers
scans/<id>/analysis.json  the diagnosis
lessons/NNNN-<slug>.html  lessons        reference/<topic>-cheat-sheet.html
assets/                   lesson.css, quiz.js, widgets (copied from templates/assets)
results/                  results JSON the parent saves from lessons
learning-records/NNNN-<slug>.md
```

## 0. First run in a workspace
If `NOTES.md` has no `## Learner` section, ask the parent briefly, then write it down:
name, age and grade, school system/country, languages, who the child asks for help ("Daddy or Mummy"),
notation conventions from the textbook (e.g. 24-hour time written `07 05`), and where scans come from.
Draft `MISSION.md` (why: stop the same mistakes coming back; success: diagnosis per scan, a lesson per gap,
a correct independent redo a week later; constraints: age-appropriate length, never shaming).
Confirm the mission with the parent. Copy `templates/assets/*` to `./assets/`.

## 1. Get the scan
- Default: files dropped in `inbox/` (phone camera, Adobe Scan export, Google Drive sync…).
- Adobe Acrobat cloud (where Adobe Scan saves), via a debug Chrome the parent logs into once:
  ```
  python -I tools/acrobat.py start
  python -I tools/acrobat.py wait-login 1200      # run in background; parent logs in if needed
  python -I tools/acrobat.py list                 # Recent files, newest first
  python -I tools/acrobat.py download inbox ["<name>"]   # default: newest
  ```
  If no file was named, confirm which one with the parent before analysing.

## 2. Render and read
```
python -I tools/render_pages.py "<pdf>" scans/<id>/pages --zoom 2.5 [--rotate 2=90,3=90]
python -I tools/crop.py scans/<id>/pages/p01.png scans/<id>/crops/<name>.jpg 0 0.55 1 0.8
```
`<id>` = `YYYY-MM-DD-<subject>-<short-desc>`. **Look at every page image.** The PDF's OCR layer is useless on
handwriting. Re-render sideways pages with `--rotate`. Crop and zoom whenever a digit or mark is ambiguous.
Read the teacher's marks: ticks and crosses, corrections in brackets, redo ticks, stamps, the score.

## 3. Diagnose → `scans/<id>/analysis.json`
For **every** question, right or wrong: question, child's answer, correct answer, result, and any redo on paper.
For each wrong one: `topic` slug (`<domain>-<subdomain>-<concept>`), `error_type`
(careless | misconception | not-learned | partial-understanding), `diagnosis`, `confidence`; when the cause is a guess,
add `ask_child`, a question for the parent to ask.
- **Contrast wrong answers with right ones on the same paper.** That contrast is usually the diagnosis, e.g.
  "correct whenever she drew the stop at the hour on her timeline, wrong when she drew one long jump".
- Write the strengths and a one-line `headline` pattern. Crop the child's work for each gap (900 px wide).

## 4. Ground it
Find high-trust sources for each topic (curriculum body such as the national syllabus, Oak National Academy,
Khan Academy, recognised teacher references) and add them to `RESOURCES.md` with one line each on what they're for.
Don't teach from memory alone. Keep `NOTES.md` working notes current.

## 5. Write lessons → `lessons/NNNN-<slug>.html`
One lesson per gap (merge tiny related gaps), numbered after the highest existing one. Start from
`templates/lesson-template.html`; it runs as-is and shows every item type. Each lesson, about 10–12 minutes:
1. **Hook**: one metaphor sentence.
2. **Explain-it warm-up on the previous lesson's idea** (item `explain`). Retrieval after a night's sleep.
   It is saved and judged later, not scored. The first lesson of a series has none.
3. **Their own work** (crop) as a puzzle, with a question to keep in mind and no "show me" button.
   If the same paper has a matching success, show it first ("you already know how").
4. **Knowledge**: the minimum, as 2–3 numbered rules plus one visual.
5. **Guided practice** with a widget, if the topic has one.
6. **Spot the mistake** (item `spot`): a pretend classmate's worked answer containing *the child's own error*,
   with different numbers. They tap the wrong step, then type the fix.
7. **Independent practice**: 5–8 items, interleaved. Put the child's exact wrong answer in as a `trap` with targeted
   feedback, plus traps for other predictable slips. Include one or two items that look similar but don't need
   the rule. From the second lesson on, mix in items from earlier lessons.
8. Primary source link, the "Stuck? Ask HELPERS, or ask your AI tutor" box, the parent **Save results** button,
   and prev/next navigation.

Rules: all content lives in the `#lesson-data` JSON, and the HTML only places items with `<div data-item="id">`.
Multiple-choice options have equal length, the correct position varies, and at most ~30% of items are multiple choice.
Never use un-checked "say it out loud / show me" prompts: children skip them. Every retrieval is either marked
(typed/spot/mcq) or saved (explain). Write to the child warmly and plainly, with no baby talk and never shaming.
Use the textbook's notation. Build from `assets/`. A widget the next lesson could reuse goes into `assets/` as a
component registered in `window.LessonWidgets` (see `timeline.js`), and is copied back into this skill's
`templates/assets/`. Add or refresh a printable `reference/<topic>-cheat-sheet.html` linking the lessons.

## 6. Verify (required)
```
python -I tools/check_lessons.py lessons/NNNN-*.html --shots <tmpdir>
```
It answers every item: traps must be flagged, answers accepted, spots and widgets completed, explanations saved,
active time recorded, and no JS errors. It also lints multiple-choice balance. **Read the screenshots** before handing
over. Then open the first new lesson (`start "" <file>` / `open` / `xdg-open`).

## 7. Close the loop
The parent saves `*-results-*.json` from each lesson into `results/`. For each file:
- Items wrong on the **first try**, and unusually long `active_ms`: note them in NOTES.md, and use them as traps and
  mixed items in the next lesson and in a redo set about a week later.
- **Explain-it answers**: judge each against its `key_ideas` as *got it / partly / not yet*, and tell the parent.
- Write a learning record only for decision-grade insights: a corrected misconception shown independently,
  established prior knowledge, or a pattern that changes what to teach next. Supersede, never delete.
- Add a term to `GLOSSARY.md` only once the child uses it correctly.

Report to the parent: a diagnosis table (question, their answer, correct answer, error type, why), the headline pattern,
any `ask_child` questions, and links to the lessons.

## Formats
- `MISSION.md`: `# Mission`, `## Why` (1–3 sentences), `## Success looks like` (observable bullets),
  `## Constraints`, `## Out of scope`. Keep it under a screen.
- `RESOURCES.md`: `## Knowledge` / `## Wisdom (Communities)` / `## Gaps`, with one annotation line per link.
- `GLOSSARY.md`: `**Term**:` one or two sentence definition, then `_Avoid_: synonyms`. Only terms the child has shown.
- Learning record: `# Short title`, then 1–3 sentences on what is now known and why it changes the next lesson.
  Optional **Evidence** and **Implications**, and `Status: superseded by NNNN`.
