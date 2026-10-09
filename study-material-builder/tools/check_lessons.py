"""Smoke-test lesson HTML files built on templates/assets: no JS errors, every item renders and marks correctly.

Usage: python -I check_lessons.py <lesson.html> [<lesson.html> ...] [--shots <dir>]

For every item in the lesson's #lesson-data JSON (located on the page by data-item-id):
  typed   enter the first trap (must be flagged wrong), then the answer (must be accepted)
  mcq     click the right option (must be accepted)
  spot    tap a correct step (must be flagged), tap the wrong step, enter the fix (must be accepted)
  explain type a sentence and save (must be stored, unscored)
  jump-builder / hops  drive the widget to completion; hops also checks the fence-post answer is rejected
Also checks: equal-length MCQ options, varied correct positions, at most ~30% MCQ, and that
recorded items carry active_ms. Needs `pip install playwright` and an installed Chrome or Edge
(or `playwright install chromium`). Exit 1 on any failure.
"""
import json, pathlib, re, sys
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")


def builder_steps(item):
    s = item["start"].replace(" ", "")
    start = int(s[:2]) * 60 + int(s[2:])
    hour = (start // 60 + 1) * 60
    end = start + int(item["add"])
    return [str(hour - start), str(end - hour), f"{(end // 60) % 24:02d} {end % 60:02d}"]


def trap_input(kind, key):
    if kind == "duration":  # "1h55min" -> "1 h 55 min"
        return re.sub(r"(\d+)min", r" \1 min", re.sub(r"(\d+)h", r"\1 h", key)).strip()
    return key


def lint(data):
    warn = []
    mcqs = [i for i in data["items"] if i["type"] == "mcq"]
    scored = [i for i in data["items"] if i["type"] != "explain"]
    if scored and len(mcqs) / len(scored) > 0.34:
        warn.append(f"{len(mcqs)}/{len(scored)} scored items are MCQ (aim for <= 30%)")
    for i in mcqs:
        lens = {len(o) for o in i["options"]}
        if max(lens) - min(lens) > 2:
            warn.append(f"{i['id']}: MCQ options differ in length {sorted(lens)}")
    if len(mcqs) >= 3 and len({i['answer'] for i in mcqs}) == 1:
        warn.append("all MCQ answers in the same position")
    return warn


def launch(p):
    for kw in ({"channel": "chrome"}, {"channel": "msedge"}, {}):
        try:
            return p.chromium.launch(headless=True, **kw)
        except Exception:
            continue
    sys.exit("No browser: install Chrome/Edge or run `python -m playwright install chromium`")


def run(paths, shots):
    failures = []
    with sync_playwright() as p:
        browser = launch(p)
        for path in paths:
            name = pathlib.Path(path).name
            page = browser.new_page(viewport={"width": 820, "height": 1100})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.goto(pathlib.Path(path).resolve().as_uri())
            page.wait_for_timeout(400)
            if shots:
                page.screenshot(path=str(pathlib.Path(shots) / (pathlib.Path(path).stem + "-top.png")))
            raw = page.locator("#lesson-data")
            data = json.loads(raw.text_content()) if raw.count() else {"items": []}
            ok = 0
            for item in data["items"]:
                t = item["type"]
                box = page.locator(f'[data-item-id="{item["id"]}"]')
                try:
                    assert box.count() == 1, "item not rendered (missing <div data-item> or JS error)"
                    box.scroll_into_view_if_needed()
                    fb = lambda: box.locator(".feedback").last.get_attribute("class") or ""
                    if t == "typed":
                        inp, btn = box.locator("input.answer"), box.locator("button.primary")
                        if item.get("traps"):
                            inp.fill(trap_input(item.get("kind"), next(iter(item["traps"])))); btn.click()
                            assert "wrong" in fb(), "trap not flagged"
                        inp.fill(item["answer"]); btn.click()
                        assert "right" in fb(), "correct answer rejected"
                    elif t == "mcq":
                        box.locator(".opts button").nth(item["answer"]).click()
                        assert "right" in fb(), "correct option rejected"
                    elif t == "spot":
                        steps = box.locator("button.step")
                        other = 0 if item["wrong"] != 0 else 1
                        steps.nth(other).click()
                        assert "wrong" in fb(), "a correct step was accepted as the mistake"
                        steps.nth(item["wrong"]).click()
                        inp = box.locator("input.answer")
                        fix = item["fix"]
                        if fix.get("traps"):
                            inp.fill(trap_input(fix.get("kind"), next(iter(fix["traps"])))); box.locator("button.primary").click()
                            assert "wrong" in fb(), "fix trap not flagged"
                        inp.fill(fix["answer"]); box.locator("button.primary").click()
                        assert "right" in fb(), "correct fix rejected"
                    elif t == "explain":
                        box.locator("textarea").fill("Checking that a whole sentence is saved here.")
                        box.locator("button.primary").click()
                        assert "right" in fb(), "explanation not saved"
                    elif t == "jump-builder":
                        for k, v in enumerate(builder_steps(item)):
                            box.locator("input.answer").nth(k).fill(v)
                            box.locator("button.primary").nth(k).click()
                            page.wait_for_timeout(750)
                        assert "right" in fb(), "builder did not finish"
                    elif t == "hops":
                        hop = box.locator("button.primary").first
                        while hop.is_enabled():
                            hop.click(); page.wait_for_timeout(80)
                        s, e = item["from"].replace(" ", ""), item["to"].replace(" ", "")
                        jumps = (int(e[:2]) * 60 + int(e[2:]) - int(s[:2]) * 60 - int(s[2:])) // item.get("step", 60)
                        inp = box.locator("input.answer")
                        inp.fill(str(jumps + 1)); box.locator("button.primary").last.click()   # fence-post answer
                        assert "wrong" in fb(), "fence-post answer accepted"
                        inp.fill(str(jumps)); box.locator("button.primary").last.click()
                        assert "right" in fb(), "hops answer rejected"
                    else:
                        raise AssertionError(f"unknown item type {t!r}")
                    ok += 1
                except Exception as ex:
                    failures.append(f"{name} :: {item['id']} ({t}): {str(ex).splitlines()[0]}")
            stored = page.evaluate("(k) => JSON.parse(localStorage.getItem(k) || '[]')", "lessonkit:" + data.get("id", ""))
            items = stored[-1]["items"] if stored else {}
            missing_time = [k for k, v in items.items() if "active_ms" not in v]
            if missing_time:
                failures.append(f"{name} :: items without active_ms: {missing_time}")
            score = page.locator("[data-score]").inner_text().replace("\n", "  ") if page.locator("[data-score]").count() else ""
            if shots:
                page.screenshot(path=str(pathlib.Path(shots) / (pathlib.Path(path).stem + "-full.png")), full_page=True)
            for e in errors:
                failures.append(f"{name} :: JS error: {e}")
            for w in lint(data):
                print(f"  WARN {name}: {w}")
            print(f"{name}: {ok}/{len(data['items'])} items OK  score: {score!r}  js_errors={len(errors)}")
            page.close()
        browser.close()
    for f in failures:
        print("FAIL", f)
    return not failures


if __name__ == "__main__":
    args = sys.argv[1:]
    shots = None
    if "--shots" in args:
        i = args.index("--shots"); shots = args[i + 1]; del args[i:i + 2]
        pathlib.Path(shots).mkdir(parents=True, exist_ok=True)
    if not args:
        sys.exit(__doc__)
    sys.exit(0 if run(args, shots) else 1)
