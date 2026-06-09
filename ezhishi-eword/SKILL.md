# eZhishi eWord Chapter Extractor

Extract 课文识读字, 课文识写字, and 课文中的词语 for a specific lesson from the eZhishi eWord (字词查询) platform.

## When This Skill Activates

- User types `/ezhishi-eword <grade> <lesson>`
- User says "extract ezhishi lesson", "get ezhishi chapter words", "ezhishi eword 小三 第八课"
- User asks "what are the characters/words for lesson X in grade Y on ezhishi"

## How to Run

**Step 1 — auto-install the script if missing**

Check if `C:/Users/xxiang/.claude/scripts/ezhishi_chapter.py` exists:

```bash
python -c "import os; print(os.path.exists(r'C:/Users/xxiang/.claude/scripts/ezhishi_chapter.py'))"
```

If output is `False`, write the script from the **Script Source** section below.

**Step 2 — run the extraction**

```bash
python "C:/Users/xxiang/.claude/scripts/ezhishi_chapter.py" <grade> <lesson> [--book <book_type>]
```

**Arguments:**
- `grade` — year level: `小一` `小二` `小三` `小四` `小五` `小六` or `1`–`6`
- `lesson` — lesson number: `第一课`…`第二十课` or `1`–`20`
- `--book` — textbook series (optional, default `高华`):
  - `高华` — 欢乐伙伴 (高华) ← default
  - `基华` — 欢乐伙伴 (基华)
  - `普通` — 欢乐伙伴
  - `2.0高华` — 欢乐伙伴 2.0 (高华)
  - `2.0` — 欢乐伙伴 2.0

**Examples:**
```bash
python "C:/Users/xxiang/.claude/scripts/ezhishi_chapter.py" 小三 第八课
python "C:/Users/xxiang/.claude/scripts/ezhishi_chapter.py" 3 8
python "C:/Users/xxiang/.claude/scripts/ezhishi_chapter.py" 小三 8 --book 基华
```

## Output

The script prints JSON with three sections:

```json
{
  "grade": "小三",
  "lesson": "第八课",
  "book": "高华",
  "课文识读字": ["盘", "需", "硬", ...],
  "课文识写字": ["彩", "需", "块", ...],
  "课文中的词语": ["步骤", "绳子", "部分", ...]
}
```

Present the results to the user in a clean, readable format — three labeled sections with the characters/words listed out.

If exit code is 1, show the error JSON and suggest checking network or credentials.

## Notes

- Login is automatic, token cached to `~/.ezhishi_token.json` (shared with `/ezhishi` skill).
- Credentials: TNSSHJ / TNSSHJ (hardcoded).
- Default book series is **欢乐伙伴 (高华)** — the standard high-ability stream textbook.
- API: `POST /api/v1/eword/word/getChapterWords` with params `grade` (e.g. "小三高"), `unit`, `ver`.
- Prerequisite: `pip install requests`

---

## Script Source

Write this to `C:/Users/xxiang/.claude/scripts/ezhishi_chapter.py` if missing:

```python
"""
Extract 课文识读字, 课文识写字, 课文中的词语 for a lesson from eZhishi eWord.

Usage:
    python ezhishi_chapter.py <grade> <lesson> [--book <book_type>]

Arguments:
    grade       Year level: 小一 小二 小三 小四 小五 小六 (or 1-6)
    lesson      Lesson number: 第一课 第二课 ... or 1-20
    --book      Book series: 高华(default) | 基华 | 普通 | 2.0高华 | 2.0

Examples:
    python ezhishi_chapter.py 小三 第八课
    python ezhishi_chapter.py 3 8
    python ezhishi_chapter.py 小三 8 --book 基华
"""
import sys
import json
import os
import time
import base64
import argparse
import requests

BASE_URL = "https://www.ezhishi.com/api/v1"
CREDENTIALS = {"loginid": "TNSSHJ", "password": "TNSSHJ"}
DEFAULT_CACHE = os.path.expanduser("~/.ezhishi_token.json")

GRADE_NAMES = ["小一", "小二", "小三", "小四", "小五", "小六"]
LESSON_NAMES = [
    "第一课", "第二课", "第三课", "第四课", "第五课",
    "第六课", "第七课", "第八课", "第九课", "第十课",
    "第十一课", "第十二课", "第十三课", "第十四课", "第十五课",
    "第十六课", "第十七课", "第十八课", "第十九课", "第二十课",
]

BOOK_MAP = {
    "高华":   ("高", 1),
    "基华":   ("基", 1),
    "普通":   ("",   1),
    "2.0高华": ("高", 2),
    "2.0":    ("",   2),
    "2.0基华": ("基", 2),
}


def _parse_grade(raw: str) -> str:
    raw = raw.strip()
    if raw.isdigit():
        idx = int(raw) - 1
        if 0 <= idx < len(GRADE_NAMES):
            return GRADE_NAMES[idx]
        raise ValueError(f"Grade number must be 1-6, got: {raw}")
    if raw in GRADE_NAMES:
        return raw
    raise ValueError(f"Unknown grade: {raw}. Use 小一-小六 or 1-6.")


def _parse_lesson(raw: str) -> str:
    raw = raw.strip()
    if raw.isdigit():
        idx = int(raw) - 1
        if 0 <= idx < len(LESSON_NAMES):
            return LESSON_NAMES[idx]
        raise ValueError(f"Lesson number must be 1-20, got: {raw}")
    if raw in LESSON_NAMES:
        return raw
    raise ValueError(f"Unknown lesson: {raw}. Use 第一课-第二十课 or 1-20.")


def decode_jwt_exp(token):
    payload_b64 = token.split(".")[1]
    padding = (4 - len(payload_b64) % 4) % 4
    payload_b64 += "=" * padding
    data = json.loads(base64.urlsafe_b64decode(payload_b64))
    return int(data["exp"])


def load_token(cache_path=DEFAULT_CACHE):
    try:
        with open(cache_path) as f:
            data = json.load(f)
        return data["access_token"], data["refresh_token"]
    except Exception:
        return None, None


def save_token(access_token, refresh_token, cache_path=DEFAULT_CACHE):
    with open(cache_path, "w") as f:
        json.dump({"access_token": access_token, "refresh_token": refresh_token}, f)


def login():
    resp = requests.post(
        f"{BASE_URL}/usercenter/user/login",
        data=CREDENTIALS,
        headers={"x-requested-with": "XMLHttpRequest"},
    )
    resp.raise_for_status()
    body = resp.json()
    data = body.get("result") or body.get("data") or {}
    return data["accessToken"], data["refreshToken"]


def refresh_token(access_token, refresh_token):
    resp = requests.post(
        f"{BASE_URL}/usercenter/user/refreshToken",
        files=[
            ("accessToken", (None, access_token)),
            ("refreshToken", (None, refresh_token)),
        ],
    )
    resp.raise_for_status()
    body = resp.json()
    data = body.get("result") or body.get("data") or {}
    return data["accessToken"], data["refreshToken"]


def get_valid_token(cache_path=DEFAULT_CACHE):
    access_token, ref_token = load_token(cache_path=cache_path)
    if access_token:
        try:
            if decode_jwt_exp(access_token) > time.time() + 30:
                return access_token
        except Exception:
            pass
        try:
            new_acc, new_ref = refresh_token(access_token, ref_token)
            save_token(new_acc, new_ref, cache_path=cache_path)
            return new_acc
        except Exception:
            pass
    new_acc, new_ref = login()
    save_token(new_acc, new_ref, cache_path=cache_path)
    return new_acc


def get_chapter_words(token: str, grade_api: str, unit: str, ver: int) -> dict:
    resp = requests.post(
        f"{BASE_URL}/eword/word/getChapterWords",
        headers={"Authorization": f"Bearer {token}"},
        files=[
            ("grade", (None, grade_api)),
            ("unit", (None, unit)),
            ("ver", (None, str(ver))),
        ],
    )
    resp.raise_for_status()
    body = resp.json()
    if not body.get("success"):
        raise RuntimeError(f"API error: {body.get('message', 'unknown')}")
    return body.get("result", {})


def main():
    parser = argparse.ArgumentParser(description="Extract eZhishi chapter vocabulary")
    parser.add_argument("grade", help="Year level: 小一-小六 or 1-6")
    parser.add_argument("lesson", help="Lesson: 第一课-第二十课 or 1-20")
    parser.add_argument("--book", default="高华",
                        help="Book series: 高华(default)|基华|普通|2.0高华|2.0")
    args = parser.parse_args()

    def _err(msg):
        sys.stdout.buffer.write((json.dumps({"error": msg}, ensure_ascii=False) + "\n").encode("utf-8"))
        sys.exit(1)

    try:
        grade = _parse_grade(args.grade)
    except ValueError as e:
        _err(str(e))

    try:
        lesson = _parse_lesson(args.lesson)
    except ValueError as e:
        _err(str(e))

    if args.book not in BOOK_MAP:
        _err(f"Unknown book type: {args.book}. Choose from: {', '.join(BOOK_MAP)}")

    grade_suffix, ver = BOOK_MAP[args.book]
    grade_api = grade + grade_suffix

    try:
        token = get_valid_token()
        result = get_chapter_words(token, grade_api, lesson, ver)
    except Exception as e:
        _err(str(e))

    words = result.get("words", {})
    output = {
        "grade": grade,
        "lesson": lesson,
        "book": args.book,
        "课文识读字": words.get("识读", []),
        "课文识写字": words.get("识写", []),
        "课文中的词语": words.get("词", []),
    }

    sys.stdout.buffer.write((json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


if __name__ == "__main__":
    main()
```
