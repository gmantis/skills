---
name: grill-master
description: Relentless one-at-a-time interview that stress-tests your plan, checkpoints every answer to a brainstorms/ doc so nothing is lost in long sessions, flags knowledge gaps for you to go research, and distills durable decisions into CONTEXT.md (glossary) and ADRs. Use when the user says "grill me", "grill master", "deep grill", "stress-test my plan", or wants to extract knowledge from their head into reusable context.
---

# Grill Master

A relentless interview that turns what's in your head into precise, reusable context — and never loses it along the way.

This merges three things:
- **The interview loop** — walk the decision tree one question at a time (Matt Pocock's original).
- **Durable checkpointing + gap-flagging** — persist every answer to disk as you go; flag what you can't answer yourself (Nate Herk's addition).
- **Domain rigor** — police your project's language and record hard-to-reverse decisions (grill-with-docs).

## The core loop (do this above all else)

Interview the user relentlessly about every aspect of the plan/topic until you reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.

- **Ask one question at a time.** Wait for the answer before the next question.
- **For each question, provide your recommended answer.** Don't just ask — propose, and let them correct you. This is faster and surfaces disagreement.
- **If a question can be answered by exploring the codebase, explore it instead.** Don't make the user tell you what the code already says.
- Keep going until the knowledge doc has no gaps or holes, or the user calls a good stopping point. It might be 5 questions; it might be 30.

## Step 1 — Set up the checkpoint file immediately

Before asking the first question, create the brainstorm doc so nothing gets lost — even if the session runs an hour and the context window fills up.

1. Ensure a `brainstorms/` folder exists at the **project root**. Create it if missing.
2. Create `brainstorms/<topic-slug>.md` (e.g. `brainstorms/packaging.md`). If a doc for this topic already exists, **open it and continue it** rather than starting fresh — the user may be returning with new information.
3. Seed it with the skeleton below.

```md
# {Topic}

_Grill Master session — started {date}. Checkpointed live; safe to resume._

## Summary
{Fill in / refine as understanding crystallizes. One paragraph.}

## Key decisions
- {decision} — {why}

## Q&A log
<!-- Appended after EVERY question. Newest at the bottom. -->

## Open flags
<!-- Things the user couldn't answer well. Who to ask / what to find. -->
```

## Step 2 — Checkpoint after every single answer

This is the non-negotiable habit that makes long sessions safe. **After each answer, immediately append to the `Q&A log`** — don't batch:

```md
### Q{n}: {the question}
**A:** {the user's answer, in their words}
**Decision/takeaway:** {what this settles}
```

Then update `Summary` and `Key decisions` whenever something shifts. Capturing as you go means a full context window can never make you misremember an answer from 40 minutes ago — it's already on disk.

## Step 3 — Flag knowledge gaps ("go ask this person")

When the user can't explain something as well as the actual operator/stakeholder would — or admits they don't really know — **don't paper over it.** Add it to `Open flags`:

```md
- **{topic}** — {what's unknown}. Go ask: {person/role}. Bring back: {what you need}, then re-grill to fill this in.
```

This turns the session into an action list. The user goes and gets the real answer, comes back, and says "grill me again, here's what I found."

## Step 4 — Apply domain rigor as you go

While interviewing, hold the conversation to the project's language and reality:

- **Challenge against the glossary.** If the user uses a term that conflicts with `CONTEXT.md`, call it out: "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"
- **Sharpen fuzzy language.** Propose a precise canonical term: "You're saying 'account' — do you mean the Customer or the User? Those are different things."
- **Stress-test with concrete scenarios.** Invent edge-case scenarios that force precision about boundaries between concepts.
- **Cross-reference with code.** When the user states how something works, check whether the code agrees. Surface contradictions: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

## Step 5 — Distill durable artifacts (not just the transcript)

The `brainstorms/` doc is the raw transcript. The lasting value is in two curated artifacts. Create these **lazily** — only when there's something real to write.

### CONTEXT.md (the glossary)
When a term is resolved, update `CONTEXT.md` right there — don't batch. If none exists, create one at the project root when the first term is settled. Only include terms meaningful to domain experts; don't couple it to implementation details. Format: see [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

### ADRs (the decision records)
Offer to record an ADR **only when all three are true**:
1. **Hard to reverse** — changing your mind later is costly.
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for reasons.

If any is missing, skip it. Format and numbering: see [ADR-FORMAT.md](./ADR-FORMAT.md).

## Step 6 — Close the loop

When you reach a good stopping point, scan for existing skills/docs/guides the new knowledge should flow into. Offer to update them: "I notice you have a packaging guide and a packaging skill, and we covered nuance that's not in either — want me to update both?" The whole point is better skills, better context, better projects downstream.

## Tips

- **Single vs multi-context repos:** if a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts living in subdirectories — read it to find the right `CONTEXT.md`. Otherwise assume a single root `CONTEXT.md`. See [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).
- **Resuming:** "grill me again on X" should reopen `brainstorms/X.md` and continue the Q&A log, not overwrite it.
- **Don't over-checkpoint prose.** The Q&A log is append-only and cheap; `Summary`/`Key decisions`/`CONTEXT.md`/ADRs are curated — rewrite those for clarity, don't just append.

---

_Merges the `grill-me` / `grill-with-docs` skills (vendored from [mattpocock/skills](https://github.com/mattpocock/skills), MIT) with the per-question checkpointing + gap-flagging approach demonstrated by Nate Herk (YouTube `c0kaKxM2pHg`)._
