---
name: anki-vocab
description: Look up an English word (meaning, etymology, pronunciation, examples, Chinese translation) and add it to Anki. Triggers on "anki-vocab <word>", "add <word> to anki", or "look up <word> for anki".
---

# Anki Vocabulary Card Creator

Look up an English word and create a flashcard in Anki deck `Knowledge::English::English Vocabulary` using the `Basic Vocabulary` note type.

## Step 1 — Look up the word

Use `WebSearch` with query: `<word> meaning etymology pronunciation examples`. If WebSearch is unavailable, use built-in knowledge.

Gather:
- **Pronunciation** — IPA for both British and American (e.g. `/ˈstɒdʒi/ (British) | /ˈstɑːdʒi/ (American)`)
- **Definition** — numbered list by sense; include part of speech label in parentheses
- **Etymology** — century of origin, root language/word, original meaning, semantic shift if any
- **Examples** — 2–3 natural sentences showing different senses or contexts, italicized
- **Chinese translation** — per sense, colloquial phrasing preferred
- **Synonyms & antonyms** — 4–6 each

## Step 2 — Determine part-of-speech tag

Choose one: `noun`, `verb`, `adjective`, `adverb`, `phrase`, `idiom`, or `other`.

## Step 3 — Create the Anki note

Call `mcp__anki__create_note` with:

```json
{
  "type": "Basic Vocabulary",
  "deck": "Knowledge::English::English Vocabulary",
  "fields": {
    "Word": "<word>",
    "Pronunciation": "/IPA/ (British) | /IPA/ (American)",
    "Definition": "1. (part of speech) Sense one.<br>2. (part of speech) Sense two.",
    "Example": "1. <i>Example sentence one.</i><br>2. <i>Example sentence two.</i><br>3. <i>Example sentence three.</i>",
    "Etymology": "Century + language of origin. Root word meaning. How meaning evolved.",
    "Extra": "【中文释义】<br>1. （词性）中文释义一<br>2. （词性）中文释义二<br><br><b>近义词：</b> word1, word2, word3<br><b>反义词：</b> word1, word2, word3"
  },
  "tags": ["english", "vocabulary", "<part-of-speech>"]
}
```

## Step 4 — Show the user a summary

Display the full card content in a readable format (word, pronunciation, definition, etymology, examples, Chinese). Confirm it was added to Anki.

## Tips

- Always include both British and American IPA if they differ
- For the `Extra` field, use `<br>` for line breaks (HTML rendered in Anki)
- If the word has only one main sense, skip the numbered list
- For phrasal verbs or idioms, note the full phrase as the `Word` field
