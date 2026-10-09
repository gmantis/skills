"""Fetch scans from Adobe Acrobat cloud (where Adobe Scan saves) by driving a debug Chrome.

The parent logs in once in a dedicated Chrome profile; the session persists there.
Profile dir: $STUDY_BROWSER_PROFILE or ~/.study-material-builder-browser. Debug port: $STUDY_BROWSER_PORT or 9222.

  python -I acrobat.py start                 launch Chrome/Edge with a debug port on Acrobat home
  python -I acrobat.py wait-login [secs]     block until the tab is past the Adobe sign-in page
  python -I acrobat.py list                  print Recent files as JSON lines {i, name, opened, size}
  python -I acrobat.py download <dest> [name]  download <name> (default: newest in Recent) into <dest>
"""
import json, os, subprocess, sys, time, urllib.request

sys.stdout.reconfigure(encoding="utf-8")
PORT = int(os.environ.get("STUDY_BROWSER_PORT", "9222"))
HOME_URL = "https://acrobat.adobe.com/link/home/"
PROFILE = os.environ.get("STUDY_BROWSER_PROFILE", os.path.join(os.path.expanduser("~"), ".study-material-builder-browser"))
CHROME = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/microsoft-edge",
]


def tabs():
    try:
        return json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=3))
    except Exception:
        return None


def start():
    if tabs() is not None:
        print("ALREADY_RUNNING")
        return
    exe = next((p for p in CHROME if os.path.exists(p)), None)
    if not exe:
        sys.exit("No Chrome/Edge found; edit CHROME in acrobat.py")
    subprocess.Popen([exe, f"--remote-debugging-port={PORT}", f"--user-data-dir={PROFILE}", "--no-first-run", HOME_URL],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "DETACHED_PROCESS", 0), start_new_session=os.name != "nt")
    for _ in range(30):
        time.sleep(1)
        if tabs() is not None:
            print("STARTED")
            return
    sys.exit("Chrome did not open the debug port")


def logged_in():
    for t in tabs() or []:
        if t.get("type") == "page" and t["url"].startswith("https://acrobat.adobe.com/") and "Sign in" not in t["title"]:
            return True
    return False


def wait_login(secs=900):
    end = time.time() + secs
    while time.time() < end:
        if logged_in():
            print("LOGGED_IN")
            return
        time.sleep(3)
    sys.exit("TIMEOUT waiting for Adobe login")


def _page(p):
    b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
    page = next((pg for c in b.contexts for pg in c.pages if "acrobat.adobe.com" in pg.url), None)
    if page is None:
        page = b.contexts[0].new_page()
    if "/link/home" not in page.url:
        page.goto(HOME_URL)
    page.locator("[role=row]").nth(1).wait_for(timeout=30000)
    return page


def _rows(page):
    out = []
    rows = page.locator("[role=row]")
    for i in range(1, rows.count()):
        cells = rows.nth(i).locator("[role=gridcell],[role=cell]")
        if cells.count() < 6:
            continue
        line2 = lambda k: (cells.nth(k).inner_text().split("\n") + [""])[1].strip()
        out.append({"i": i, "name": line2(2), "opened": line2(4), "size": cells.nth(5).inner_text().strip()})
    return out


def list_files():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        for r in _rows(_page(p)):
            print(json.dumps(r, ensure_ascii=False))


def download(dest, name=None):
    from playwright.sync_api import sync_playwright
    os.makedirs(dest, exist_ok=True)
    with sync_playwright() as p:
        page = _page(p)
        rows = _rows(page)
        target = next(r for r in rows if r["name"] == name) if name else rows[0]
        row = page.locator("[role=row]").nth(target["i"])
        row.hover()
        row.locator("button").last.click()          # the row's "..." menu
        page.wait_for_timeout(800)
        with page.expect_download(timeout=60000) as dl:
            page.get_by_role("menuitem", name="Download").first.click()
        path = os.path.join(dest, target["name"])
        dl.value.save_as(path)
        print(json.dumps({"saved": path, "bytes": os.path.getsize(path), **target}, ensure_ascii=False))


if __name__ == "__main__":
    cmd, args = (sys.argv[1] if len(sys.argv) > 1 else ""), sys.argv[2:]
    if cmd == "start": start()
    elif cmd == "wait-login": wait_login(float(args[0]) if args else 900)
    elif cmd == "list": list_files()
    elif cmd == "download": download(args[0], args[1] if len(args) > 1 else None)
    else: sys.exit(__doc__)
