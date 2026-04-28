---
name: ezhishi
description: Look up Chinese characters or words in eZhishi's 字词查询 database, showing which Singapore primary school grade levels, textbook versions, and lessons they appear in. Triggers on "/ezhishi <chinese>" or "ezhishi lookup <chinese>".
---

# eZhishi 字词查询 Lookup

Look up a Chinese character or word in the eZhishi platform and return structured JSON showing where it appears across Singapore primary school Chinese curricula (P1–P6).

## When This Skill Activates

- User types `/ezhishi <chinese>`
- User says "ezhishi lookup <word>"
- User asks "which grade/lesson does <word> appear in ezhishi"

## How to Run

**Step 1 — auto-install the script if missing**

Check if `~/.claude/scripts/ezhishi_eword.py` exists:

```bash
python -c "import os; print(os.path.exists(os.path.expanduser('~/.claude/scripts/ezhishi_eword.py')))"
```

If the output is `False`, create the directory and write the script using the Write tool:
- Path: `~/.claude/scripts/ezhishi_eword.py` (expand `~` to the actual home directory first)
- Content: the Python source code in the **Script Source** section below

**Step 2 — run the lookup**

```bash
python ~/.claude/scripts/ezhishi_eword.py <query>
```

On Windows, expand `~` to the actual home path (e.g. `C:/Users/<username>`).

## Output

The script prints raw JSON from the eZhishi API. Present it directly to the user.

If exit code is 1, show the error JSON and suggest checking network or running `pip install requests`.

## Notes

- Login is automatic and cached to `~/.ezhishi_token.json`. Multiple lookups reuse the same token — no repeated logins.
- Credentials: TNSSHJ / TNSSHJ (hardcoded in script).
- Covers 字词查询 (Word & Vocabulary) only.
- Works on macOS and Windows. Uses `~` expansion throughout.
- Prerequisite: `pip install requests`

---

## Script Source

Write this exactly to `~/.claude/scripts/ezhishi_eword.py` when installing:

```python
import sys, json, os, time, base64
import requests

BASE_URL = "https://www.ezhishi.com/api/v1"
CREDENTIALS = {"loginid": "TNSSHJ", "password": "TNSSHJ"}
DEFAULT_CACHE = os.path.expanduser("~/.ezhishi_token.json")


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
    try:
        resp = requests.post(
            f"{BASE_URL}/usercenter/user/login",
            data=CREDENTIALS,
            headers={"x-requested-with": "XMLHttpRequest"},
        )
        resp.raise_for_status()
        body = resp.json()
        data = body.get("result") or body.get("data") or {}
        return data["accessToken"], data["refreshToken"]
    except Exception as e:
        raise RuntimeError(f"Login failed: {e}") from e


def refresh(access_token, refresh_token):
    try:
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
    except Exception as e:
        raise RuntimeError(f"Refresh failed: {e}") from e


def get_valid_token(cache_path=DEFAULT_CACHE):
    access_token, refresh_token = load_token(cache_path=cache_path)
    if access_token:
        try:
            if decode_jwt_exp(access_token) > time.time() + 30:
                return access_token
        except Exception:
            pass
        try:
            new_acc, new_ref = refresh(access_token, refresh_token)
            try:
                save_token(new_acc, new_ref, cache_path=cache_path)
            except Exception:
                pass
            return new_acc
        except Exception:
            pass
    new_acc, new_ref = login()
    try:
        save_token(new_acc, new_ref, cache_path=cache_path)
    except Exception:
        pass
    return new_acc


def search(token, query):
    try:
        resp = requests.post(
            f"{BASE_URL}/eword/word/queryWordsByTitle",
            headers={"Authorization": f"Bearer {token}"},
            files=[
                ("title", (None, query)),
                ("wordTypes", (None, "字")),
                ("wordTypes", (None, "词")),
            ],
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        raise RuntimeError(f"Search failed: {e}") from e


def main():
    def _write(obj):
        sys.stdout.buffer.write((json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8"))

    if len(sys.argv) < 2:
        _write({"error": "usage", "detail": "ezhishi_eword.py <chinese>"})
        sys.exit(1)
    query = sys.argv[1]
    try:
        token = get_valid_token()
        result = search(token, query)
        out = json.dumps(result, ensure_ascii=False, indent=2)
        sys.stdout.buffer.write(out.encode("utf-8") + b"\n")
    except RuntimeError as e:
        _write({"error": str(e)})
        sys.exit(1)


if __name__ == "__main__":
    main()
```
