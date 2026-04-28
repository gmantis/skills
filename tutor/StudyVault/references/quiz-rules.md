# Quiz Rules for Version Control Tutoring

## Purpose

These rules guide question creation for version control (Git, branching, collaboration workflows). Questions test conceptual understanding AND practical application, adapting difficulty to learner proficiency.

---

## Question Formats

Questions must mix across these formats (not all multiple-choice):

### 1. Multiple Choice (Scenario-Based)
User selects the **best action** or **outcome** in a real workflow scenario.

```
Q: You're on feature-branch and want to bring main's latest changes without rewriting history. Which command?
A) git merge main        ← CORRECT (preserves history)
B) git rebase main       (rewrites history)
C) git cherry-pick main  (applies specific commits, not what's asked)
D) git pull --rebase     (also rewrites history)
```

**No hints in option labels**. Use neutral wording: "best" not "most efficient".

### 2. Short Answer (Command or Concept)
User types the exact command, file path, or Git concept name.

```
Q: Name the file Git uses to prevent accidental commits of sensitive data.
Answer: .gitignore
```

Acceptable variations: `.gitignore`, `gitignore`, `".gitignore"` (normalizing whitespace/quotes).

### 3. Practical Hands-On (Workflow Reconstruction)
User describes steps to achieve a goal in a given scenario.

```
Q: You committed sensitive API keys to main and need to remove them from history. Outline your steps.
Expected: 
- Identify the commit(s)
- Use git filter-branch or git filter-repo to remove them
- Force-push or coordinate team merge
- Rotate the keys
(Partial credit: 2+ steps correct, even if wording differs)
```

### 4. Diagram/Diagram Interpretation
User matches a scenario to a Git graph, or explains what a diagram represents.

```
Q: Which scenario produced this commit graph?
[ASCII graph showing linear history with merge commit]
A) Squash merge from feature branch
B) Merge commit from feature branch ← CORRECT
C) Rebase from feature branch
D) Cherry-pick from feature branch
```

### 5. True/False with Explanation
Simple statement; user selects T/F and briefly explains why.

```
Q: "git revert creates a new commit that undoes changes." True or False? Briefly explain.
Answer: True. Revert generates a new commit with inverse changes, preserving history.
```

---

## Concept Categories

Questions test one of these concept types:

| Category | Example | Difficulty |
|----------|---------|------------|
| **Core Commands** | What does `git stash` do? | 🔴 Easy |
| **Branching Strategy** | When to branch vs. commit to main? | 🟡 Medium |
| **Merge vs. Rebase** | Which preserves history? When use each? | 🟡 Medium |
| **Undoing Changes** | Undo before push vs. after push? | 🟡 Medium |
| **Conflict Resolution** | Strategies for resolving merge conflicts | 🟢 Hard |
| **Collaboration Workflow** | Multi-person feature branch coordination | 🟢 Hard |
| **Refactoring History** | Amending, squashing, reordering commits | 🔴🟢 Varies |
| **Recovery & Debugging** | git reflog, git bisect, finding lost commits | 🟦 Expert |

---

## Rules for No Hints

**Options must be equally plausible**, not obviously wrong:

❌ **Bad** (option D is obviously wrong):
```
Q: What does git log show?
A) Commit history
B) Unstaged changes
C) Branch list
D) Your favorite lunch place
```

✅ **Good** (all plausible, one clearly correct):
```
Q: What does git log show?
A) Commit history (with messages, authors, dates)  ← CORRECT
B) Staged changes ready to commit
C) All branches in the repository
D) List of tags in the current repository
```

**Option labels must not hint**. Instead of:
- ❌ "The recommended approach" → ✅ "Merge main"
- ❌ "Most efficient" → ✅ "Use rebase"
- ❌ "Preferred by teams" → ✅ "Create a feature branch"

**Randomize correct answer position** across questions (not always A, not alternating pattern).

---

## Difficulty Adaptation

Adjust question depth based on user's **proficiency level** in the target concept:

### 🔴 Unresolved (0-39% correct)
- Test **core definitions** and **basic commands**
- Scenario: "You want to see all commits. Which command?"
- Focus: memorization + basic understanding
- Format: mostly multiple-choice, one short-answer

### 🟡 Weak (40-69% correct)
- Test **understanding of trade-offs** and **when to use what**
- Scenario: "You need to undo a commit but keep its changes. Why use revert vs. reset?"
- Format: mix multiple-choice + short-answer + practical
- Require explanation of *why* a choice is correct

### 🟢 Good (70-89% correct)
- Test **edge cases** and **collaboration scenarios**
- Scenario: "Your team uses squash merges. How do you retrieve the original commits from main?"
- Format: practical hands-on, true/false with explanation
- Require multi-step thinking

### 🟦 Mastered (90-100% correct)
- Test **recovery, debugging, and refactoring**
- Scenario: "You accidentally squashed commits that should be separate. Recover them using git reflog."
- Format: hands-on, diagram interpretation, open-ended
- Require expert-level reasoning

---

## Partial Credit Rules

For **hands-on** and **true/false with explanation** questions:

| Scenario | Credit |
|----------|--------|
| Correct answer, correct reasoning | ✅ Full |
| Correct answer, incomplete reasoning | ⚠️ Partial (70%) |
| Correct concept, wrong tool/command | ⚠️ Partial (50%) |
| Wrong answer, but shows understanding of related concept | ⚠️ Partial (40%) |
| Fundamentally wrong | ❌ 0% |

**Error Note Guidance**:
- Record *what was confused*: e.g., "Mixed up revert (new commit) with reset (history rewrite)"
- Record *the key distinction*: e.g., "Use revert for public commits, reset for local-only changes"

---

## Question Rephrasing for Weak Concepts

When a concept is marked 🔴 (unresolved error note exists), the next question must:
- Test the **same concept** but in a **different context**
- NOT repeat the exact same scenario or command
- Apply the concept to a new workflow or edge case

❌ **Repeated**:
```
Q1: How do you view commit history?
→ Q2: How do you view commit history?
```

✅ **Rephrased**:
```
Q1: How do you view all commits?
→ Q2: You want to see commits only from the last 5 days. Which flag?
   (Tests same concept: git log, but different application)
```

---

## Guidelines for Scenario Design

**Good scenarios**:
- Grounded in real workflows (e.g., "Your team's main branch is broken...")
- Have a single best answer, not multiple valid approaches
- Require understanding *why*, not just memorization
- Include context that rules out ambiguous answers

**Bad scenarios**:
- Hypothetical / never happens in practice
- Vague context (unclear what the user's goal is)
- Multiple equally valid answers
- Trick questions or wordplay

---

## Example Question Sets by Difficulty

### 🔴 Unresolved
```
Q1 (Multiple Choice): What does git commit do?
Q2 (Short Answer): Type the command to check the status of your working directory.
Q3 (True/False): "git push sends your commits to a remote repository." True or False?
Q4 (Hands-On): You modified a file but haven't staged it. List 2 ways to see what changed.
```

### 🟢 Good
```
Q1 (Scenario): Your team uses feature branches. You finish your feature, but main has new commits. What's the downside of git rebase vs. git merge for a multi-person feature branch?
Q2 (Practical): Recover a commit you accidentally reset locally using git reflog. Describe the steps.
Q3 (True/False + Explanation): "Squash merges lose original commit history." True? Explain when this matters.
Q4 (Diagram): Which merge strategy produced this graph? [ASCII diagram]
```

---

## Key Reminders

1. **Zero hints**: Option labels and descriptions must be neutral
2. **Randomize answers**: Don't alternate A-B-C-D patterns
3. **Mix formats**: Alternate between multiple-choice, short-answer, hands-on, true/false
4. **Rephrase weak concepts**: Don't repeat; apply in new contexts
5. **Partial credit**: For hands-on, give credit for partial understanding
6. **Document errors**: Record the confusion and the key distinction
7. **Adapt difficulty**: Match 🔴🟡🟢🟦 proficiency levels
8. **Real scenarios**: Ground questions in actual Git workflows, not hypotheticals
