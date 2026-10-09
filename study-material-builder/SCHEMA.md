# Data formats

Content and results are plain JSON and are kept apart from presentation, so lessons and history can move into a database later.

## `scans/<id>/analysis.json`: one per scan of marked work
```jsonc
{
  "schema_version": 1,
  "scan": { "id", "learner", "subject", "topic_area", "source", "source_file", "scanned_at",
            "pages": [{ "n", "image", "content", "rotated_on_scan"? }], "teacher_score" },
  "items": [{
    "ref": "p3-8d-i",                 // page + question number; unique within the scan
    "page", "question", "child_answer", "correct_answer",
    "result": "correct | wrong | wrong-format",
    "redo_on_paper"?: { "answer", "result" },
    "topic": "<slug>",
    // wrong items only:
    "error_type": "careless | misconception | not-learned | partial-understanding",
    "diagnosis", "confidence": "high | medium | low", "ask_child"?, "crop"?
  }],
  "topics": [{ "slug", "title", "status": "gap | shaky | secure", "evidence": ["<ref>"], "lesson"? }],
  "strengths": ["..."],
  "headline": "one-line pattern across the errors"
}
```

## Lesson `#lesson-data` block
```jsonc
{
  "id": "0002-stop-at-the-hour", "title", "learner", "subject",
  "topics": ["<slug>"], "source_scan": "<scan id>", "source_items": ["<ref>"], "minutes": 12,
  "retry_hint"?: "first-wrong-answer nudge for this lesson, naming the lesson's own tool (timeline, bar model, step box)",
  "items": [
    { "id", "type": "typed", "kind": "time | duration | number | fraction | text", "prompt" /* html */,
      "answer" /* string; text may be a list of accepted strings, e.g. ["RS","SR"] */,
      "traps"?: { "<normalised wrong answer>": "targeted feedback html" }, "explain"?,
      "retry"?: "item-level first-wrong nudge (overrides retry_hint)", "simplest"?: true /* fraction must be in lowest terms */ },
    { "id", "type": "mcq", "prompt", "options": [...], "answer": <index>, "traps"?: { "<option text>": "..." }, "explain"? },
    { "id", "type": "spot", "prompt", "steps": ["html", ...], "wrong": <index>,
      "fix": { "kind", "answer", "prompt"?, "traps"? }, "explain"? },
    { "id", "type": "explain", "prompt", "key_ideas": ["..."] },      // saved, judged later, not scored
    // widgets registered in window.LessonWidgets, e.g. from assets/timeline.js:
    { "id", "type": "jump-builder", "start": "06 25", "add": 40, "prompt"? },   // adding minutes across the hour
    { "id", "type": "hops", "from": "07 30", "to": "09 30", "step"?: 60, "prompt"? } // duration by counting jumps
  ]
}
```
Trap keys are normalised: `time` → digits only (`"1210"`); `duration` → compact (`"3h"`, `"1h55min"`); `number` → the value (`"804"`, so "804 children" hits it);
`fraction` → `"n/d"` as typed (`"6/10"`; checked before equal-value acceptance); `text` → lowercase with all spaces removed (`"qx"`).
Marking: `number` by value (units ignored), `fraction` by equal value unless `simplest`, `text` ignores case, spaces and a final full stop.
Wrong-answer feedback order: matching trap → item `retry` → lesson `retry_hint` → generic "Not yet. Look at your working again…".
Never let a generic message name a tool the lesson doesn't teach.
Non-item visuals are declared in the HTML, e.g. `<div data-timeline='{"start":"06 25","end":"07 05","ticks":["07 00"],"jumps":[...],"play":true}'>`
or a square grid (`assets/grid.js`; y counts down): `<div data-grid='{"w":12,"h":6,"points":{"P":[1,4,"w"]},"segments":["PQ"],"highlight":[],"boxes":[{"at":[1,2],"w":4,"h":2,"label":"…"}],"caption":"…"}'>`.

## Results (`Save results` button → `<lesson id>-results-<date>.json`)
```jsonc
{ "lesson", "topics", "source_scan", "learner", "device",
  "session": { "started", "updated",
    "items": { "<item id>": {
      "attempts", "answers": [...], "first_try_correct", "done",
      "active_ms",                    // time on the item while the page was visible and touched in the last 60 s
      "kind"?: "explain", "key_ideas"?: [...]   // explain items: judge answers[0] against key_ideas
    } } } }
```
Also kept in browser localStorage under `lessonkit:<lesson id>` (last 20 sessions). `device` comes from
`localStorage["lessonkit:device"]` if the parent sets a device name.
