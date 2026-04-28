---
name: spelling-to-anki
description: Extract spelling words/phrases from image or PDF and automatically create Anki flashcards. Triggers on "create anki cards from spelling", "build anki from image", "spelling to anki", "make anki cards from spelling image", "dictation to anki"
---

# Spelling to Anki

Converts spelling exercise images or PDFs into Anki flashcards automatically. Handles two document types:
1. **Spelling word lists** — bolded/highlighted target words in context sentences
2. **Dictation passages** — full prose passages to be memorised line by line

## Document Types

### Type A: Spelling Word Lists
The document shows individual sentences with a bolded target word or phrase.

**Card format:**
- **Front**: The context sentence with a blank `_____` replacing the bolded phrase
- **Back**: The complete bolded phrase (include ALL bolded words, not just the key word)

### Type B: Dictation Passages
The document shows a prose passage (often labelled "Dictation N: Unit X...") that the student must memorise and write from memory.

**Card format — Full Sentence Coverage Rule:**
Each line is split into 2–3 consecutive, non-overlapping chunks that together tile the **entire** line (no word left untested). For each chunk, one card is created:
- **Front**: The full line with that chunk replaced by `_____`
- **Back**: The missing chunk (exact words + punctuation)

**Splitting guidelines:**
- 2 splits for short lines (≤8 words): natural noun phrase / verb phrase boundary
- 3 splits for longer lines (>8 words): subject / verb+object / trailing phrase
- Internal blanks show both the preceding and following context so the student knows where in the sentence the blank falls
- Label cards `[LNa]`, `[LNb]`, `[LNc]` (N = line number) so they sort in passage order

**Example — 3-part split:**
Line: `A glossary explains unfamiliar words in alphabetical order.`
→ Splits: `[A glossary]` + `[explains unfamiliar words]` + `[in alphabetical order.]`

| Card | Front | Back |
|------|-------|------|
| L7a | `_____` explains unfamiliar words in alphabetical order. | A glossary |
| L7b | A glossary `_____` in alphabetical order. | explains unfamiliar words |
| L7c | A glossary explains unfamiliar words `_____` | in alphabetical order. |

## Workflow

### Step 1 — Read and Parse the Document

1. Use the **Read tool** to load the image or PDF file
2. Identify the document type (word list vs. dictation passage)
3. Examine the content to identify:
   - **Bolded phrases** (the spelling answers) for Type A
   - **All lines** of the passage for Type B
   - Whether multiple dictations/weeks are present

### Step 2 — Determine Deck Name

**For dictation passages**, use:
```
KJ::Primary::3::Term<T>::English::Unit<U>-<DictationN>-<YYYYMMDD>
```
- `T` = term number (Singapore: Term 1 Jan–Mar, Term 2 Apr–Jun, Term 3 Jul–Sep, Term 4 Oct–Nov)
- `U` = unit number from the sheet header
- `DictationN` = dictation number from the sheet header
- `YYYYMMDD` = the dictation date written on the sheet

Example: `KJ::Primary::3::Term2::English::Unit4-13-20260421`

**For spelling word lists**, use:
```
KJ::Primary::3::Term<T>::English::Spelling_Unit_<U>
```
If no unit info, use: `Spelling_Cards_<date>`

Create the deck with `mcp__anki__create_deck`.

### Step 3 — Create Cards

**Important:** `mcp__anki__batch_create_notes` does NOT support `"Basic (type in the answer)"` (enum restriction). Use individual `mcp__anki__create_note` calls instead — send all cards in parallel in a single message for speed.

For each card:
- `type`: `"Basic (type in the answer)"`
- `deck`: deck name from Step 2
- `fields`: `{"Front": "...", "Back": "..."}`
- `tags`: `["dictation", "unit<U>", "dictation<N>"]` or `["spelling", "unit<U>"]`

### Step 4 — Verify and Report

- Confirm all cards were created (all calls return a noteId)
- Show a table of Front → Back so the user can spot any errors
- State the deck path

## Common Pitfalls

- **Leaving words untested** (dictation): Every word in every line must appear as the `Back` of exactly one card. Verify part A + B (+ C) = the full line with no gaps.
- **Incomplete answers** (spelling): Include the full bolded phrase, not just one word. `"a company of dancers performed beautifully"` ≠ `"company"`
- **Punctuation in Back**: Include trailing punctuation (comma, full stop) in the chunk it belongs to.
- **Wrong tool for batch**: `batch_create_notes` rejects `"Basic (type in the answer)"` — always use individual `create_note`.
- **Capitalization**: Match the original document exactly.

## Example — Type A (Spelling Word List)

**Input image shows:**
```
During the concert, a company of dancers performed beautifully on the stage.
```

**Correct extraction:**
- Front: `"During the concert, _____ on the stage."`
- Back: `"a company of dancers performed beautifully"`

**Incorrect extraction:**
- Front: `"During the concert, a _____ of dancers performed beautifully on the stage."`
- Back: `"company"` ← Missing words and context

## Example — Type B (Dictation Passage)

**Input image shows:**
```
Dictation 13: Unit 4 (Tuesday, 21 April)
Fun facts make the text more interesting.
A glossary explains unfamiliar words in alphabetical order.
```

**Deck:** `KJ::Primary::3::Term2::English::Unit4-13-20260421`

**Cards for "Fun facts make the text more interesting."** (2-part split):
- L8a Front: `[L8a] _____ make the text more interesting.` → Back: `Fun facts`
- L8b Front: `[L8b] Fun facts _____` → Back: `make the text more interesting.`

**Cards for "A glossary explains unfamiliar words in alphabetical order."** (3-part split):
- L7a Front: `[L7a] _____ explains unfamiliar words in alphabetical order.` → Back: `A glossary`
- L7b Front: `[L7b] A glossary _____ in alphabetical order.` → Back: `explains unfamiliar words`
- L7c Front: `[L7c] A glossary explains unfamiliar words _____` → Back: `in alphabetical order.`
