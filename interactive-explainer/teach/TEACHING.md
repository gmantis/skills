# Teaching mode

Use this when the user wants to **learn** a topic over several sessions: "teach me …", "/teach", "make me a lesson/course on …", or the workspace already has `MISSION.md` or `lessons/`. It wraps the explainer workflow in `../SKILL.md` with the stateful teaching method of Matt Pocock's `teach` skill (MIT, see `./LICENSE`). The format files in this folder come from that skill. The main change: each lesson is **one combined page**, with the interactive explainer, the reference sheet, the glossary and the quiz as sections. There are no separate `reference/*.html` pages.

## Philosophy (short)
- To learn deeply the user needs **knowledge** (from high-trust sources), **skills** (from interactive practice with feedback) and **wisdom** (from real practitioners and communities).
- **Never trust your parametric knowledge.** Ground every claim in a source listed in `RESOURCES.md`, and link it on the page.
- **Fluency ≠ storage strength.** Feeling fluent right after a lesson is not retention. Build storage strength with desirable difficulty:
  - retrieval practice (answer from memory);
  - spacing (revisit earlier lessons later);
  - interleaving (mix related skills in practice).
- **Knowledge:** difficulty is the enemy, so keep explanations easy. **Skills:** difficulty is the tool, so make practice effortful and give immediate feedback.

## The workspace
The current directory (or the folder of the source material) is the teaching workspace. Create files lazily.

| File | What it holds | Format |
|---|---|---|
| `MISSION.md` | Why the user is learning this; grounds every decision | [MISSION-FORMAT.md](./MISSION-FORMAT.md) |
| `RESOURCES.md` | Curated, annotated high-trust sources, communities and gaps | [RESOURCES-FORMAT.md](./RESOURCES-FORMAT.md) |
| `GLOSSARY.md` | The canonical terms; every lesson uses them exactly | [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md) |
| `learning-records/000N-slug.md` | Evidence of what the user knows, prior knowledge they stated, misconceptions corrected; used to find the zone of proximal development | [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md) |
| `lessons/000N-slug.html` | One combined lesson page per tight topic | below |
| `assets/` | Reusable components: `course.css`, `quiz.js` (copy it from this skill's `assets/quiz.js`), shared model JS | reuse first |
| `NOTES.md` | User preferences (format, locale, tone), the lesson index, candidate next lessons | free-form |

**Reuse is the default.** Read `assets/` before writing a lesson, and build from what is there. Anything a second lesson could use (styles, quiz, model functions, chart helpers) goes into `assets/`, not inline. Every lesson links `course.css`, so the course looks like one course. The page must still work offline from `file://`, so use plain `<script src>` and no modules or CDNs.

## Start of every session
1. Read `MISSION.md`, `NOTES.md`, `RESOURCES.md`, `GLOSSARY.md` and `learning-records/`. List `lessons/` and `assets/`. Check memory for who the reader is (location, preferences).
2. **No mission yet?** Interview first: why, what success looks like, constraints, what is out of scope. Use AskUserQuestion with 2–4 concrete options. Push back on vague answers ("to understand X" → what changes when you can?). If the request already states the topic and the reason, draft `MISSION.md` from it and confirm in one line. A mission change needs the user's confirmation and gets a learning record.
3. **Resources thin?** Find sources before teaching.
   - Start with the workspace's own documents and notes, then search for primary, peer-reviewed or expert sources and official guidance for the reader's locale.
   - Annotate each source with "Use for: …". Add one or two moderated communities under Wisdom, and write a `## Gaps` section.
   - Respect an opt-out from communities, and record it.
4. **Pick the lesson.** Use what the user asked for. Otherwise find the zone of proximal development: from the learning records and the mission, choose the most useful next thing that is *just* beyond what they have shown. One lesson = **one tangible win** that fits in working memory (roughly 10–20 minutes).

## A lesson page = explainer + teaching layer
Build the explainer with `../SKILL.md` steps 1–5 (model, tour, what-ifs, charts, validation). Then add the teaching layer. Section order:

1. **Header**: lesson number and title, one line "**Why this matters for your mission:** …", links to earlier lessons (`../lessons/0001-….html#section`).
2. **Knowledge**: the guided tour and simulator. Teach only the knowledge needed for today's skill, concretely and in the reader's units, clock and place.
3. **Skills, with a feedback loop**: 2–3 **challenges** that use the simulator. Examples: "Set a routine that reaches the dose without passing half the burn line" or "Predict first, then switch cause B off". Each challenge has a `check()` that reads the model state and answers ✓ or a hint, immediately. For real-world skills (poses, routines), give a numbered list of steps to do, with how to self-check.
4. **Evidence**: a claim / source / strength table. Keep what the sources show separate from what the model assumes.
5. **Reference** (`#reference`): the compressed take-aways, routine or cheat sheet. This replaces teach's reference pages, so write it to be revisited: terse, scannable, printable. Add a "Print cheat sheet" button that prints only `#reference` and `#glossary` (via a `body.print-ref` class and `@media print` rules).
6. **Glossary** (`#glossary`): the terms this lesson uses, worded exactly as in `GLOSSARY.md`. Tag terms that are new in this lesson.
7. **Quiz** (`#quiz`): 5–8 retrieval questions from `assets/quiz.js`, including **1–2 spaced-review questions** from earlier lessons (`from: '0001'`), preferring items the records show were missed. Rules:
   - All options of a question have **exactly the same number of words**, and similar character length. The right answer is never the stand-out longest.
   - Vary the position of the right answer.
   - Distractors are real misconceptions, not jokes.
   - Each `why` explains the answer and cites the source.
8. **Primary source** (`#primary-source`): the single best source to read or watch next, with a one-line reason.
9. **Ask your teacher** (`#ask-teacher`): "I'm your teacher: ask follow-up questions about anything unclear, and paste your quiz results back so I can plan the next lesson."
10. **How the model works / validation** (`<details>`), then the footer with citations.

Put citations everywhere: in the prose, the evidence table, the quiz `why`s and the take-aways. Link to the sources in `RESOURCES.md`. Label illustrative models as illustrative.

Design: beautiful and calm (think Tufte). Clear type, generous whitespace, no chart junk. The lesson should be short; if it isn't, split it into two lessons.

## After the lesson: close the loop
- `check.js` lints teaching pages under `lessons/`: equal quiz option lengths, answer positions, and the presence of the primary source, the ask reminder, the glossary, the quiz and citations. Fix its warnings before handing over.
- Add a line for the lesson in `NOTES.md` (file, topic, model, next candidates). Open the page for the user.
- When the user pastes quiz results, answers a challenge in chat, or states prior knowledge:
  - Write **learning records** only for evidence: understanding shown, prior knowledge claimed (with depth), or a misconception corrected (high value). Coverage is not learning.
  - **Promote glossary terms** into `GLOSSARY.md` once the user uses them correctly. Pick one term per concept and list aliases under *Avoid*.
  - Plan spacing. Items the user missed become review questions in the next lesson, and the zone of proximal development moves.
- Questions that need **wisdom** (judgement, real-world practice): answer as best you can, then point to a community from `RESOURCES.md`.
