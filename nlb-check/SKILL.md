---
name: nlb-check
description: Use when the user asks about a book's availability at NLB Singapore libraries, wants to know if a book is on the shelf, or asks to check NLB catalogue availability.
---

# NLB Book Availability Checker

Checks physical book availability at NLB Singapore libraries using a reverse-engineered HTTP API — no browser required.

## Script Location

```
d:/download/slide/nlb_check.py
```

## Usage

```python
from nlb_check import check_availability

check_availability("Title", "Author")
```

Run via Bash from `d:/download/slide`:

```bash
python -c "from nlb_check import check_availability; check_availability('TITLE', 'AUTHOR')"
```

Or run the full default suite:

```bash
python d:/download/slide/nlb_check.py
```

## What It Shows

For each book:
- The exact NLB catalogue title and author matched
- Status per configured library: `ON SHELF`, `unavailable`, or `(no data)` (library doesn't stock it)
- Network-wide count: how many of all NLB branches have a copy on shelf

## Default Libraries

Configured in `LIBRARIES_OF_INTEREST` at the top of the script:

```python
LIBRARIES_OF_INTEREST = {
    "Tampines Library",
    "Bedok Library",
    "Ang Mo Kio Library",
    "Bishan Library",
    "Central Library",
}
```

Add or remove library names to customise. Names must match NLB catalogue labels exactly (e.g. `"Jurong Library"`, `"Woodlands Library"`).

## Per-Call Library Override

```python
check_availability("Sapiens", "Yuval Noah Harari", libraries={"Jurong Library", "Punggol Library"})
```

## How It Works (API)

Two calls to `https://sg-prod.iiivega.com` (NLB's IIIVEGA backend):

1. `POST /api/search-result/search/format-groups` (api-version: 2) — search by title + author
2. `GET /api/search-result/drawer/format-groups/{uuid}/locations?tab=Book` (api-version: 1) — get availability per library

Required headers: `iii-customer-domain`, `iii-host-domain`, `Anonymous-User-Id`, `api-version`.

## Book Matching Logic

`pick_physical_book()` scores candidates by:
- 50% title similarity (difflib, with subtitle stripping and alias lookup)
- 50% original search position (NLB relevance rank)
- +0.3 bonus if author name word-matches `primaryAgent.label`
- Tie-broken by title similarity when combined scores are equal

Known title aliases (e.g. `"1984"` → `"Nineteen Eighty-Four"`) are in `_TITLE_ALIASES`.

## Limitations

- Physical books only — ebooks and eAudiobooks are excluded
- NLB Singapore only
- Real-time availability (reflects current check-out status)
- If all target libraries show `(no data)`, the book is not stocked there at all
