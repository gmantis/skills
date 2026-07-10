---
name: send-to-kindle
description: Send an epub/PDF/DOCX file to Amazon Kindle. Triggers on "send to kindle", "send epub to kindle", "send book to kindle", "sendtokindle", or when the user provides a file and wants it on their Kindle.
---

# Send to Kindle

Two methods available — prefer Method A (kindle-send CLI) when configured.

## Method A — kindle-send CLI (preferred)

Fast, no browser. Sends via email directly to Kindle.

### Check if available

```powershell
& 'C:\Users\xxiang\.claude\scripts\kindle-send.exe' --help
```

If that works, use this method.

### Send a file

```powershell
& 'C:\Users\xxiang\.claude\scripts\kindle-send.exe' send "FULL\PATH\TO\book.epub"
```

Success output looks like:
```
Loaded configuration
Sending mail
Mail timeout :  2m0s
Following files will be sent :
1. path\to\book.epub
Mailed 1 files to xu.xiang_68dbc3@kindle.com
```

### Send multiple files

```powershell
& 'C:\Users\xxiang\.claude\scripts\kindle-send.exe' send "book1.epub" "book2.epub"
```

### Send a webpage (converts to EPUB automatically)

```powershell
& 'C:\Users\xxiang\.claude\scripts\kindle-send.exe' send "https://example.com/article"
```

### Config location

`C:\Users\xxiang\.config\kindle-send\KindleConfig.json`

Already configured for xu.xiang@gmail.com → xu.xiang_68dbc3@kindle.com.

If config is missing or broken, see the "Re-configuring" section below.

### Supported file types

EPUB, PDF, DOCX, DOC, TXT, RTF, HTM, HTML, PNG, GIF, JPG, JPEG, BMP + any URL

---

## Method B — Playwright web UI (fallback)

Use only if kindle-send is unavailable or broken.

### Step 1 — Navigate

```
mcp__plugin_playwright_playwright__browser_navigate
  url: "https://www.amazon.com/sendtokindle"
```

Take a snapshot to check login state.

### Step 2 — Handle login

- If snapshot shows `button "Sign into your Amazon account"` → not logged in
  1. Click that button
  2. Tell user: "Please sign in (including 2FA) then tell me when done"
  3. Wait for user confirmation
- If dropzone is visible → already logged in

### Step 3 — Upload

Click the Drag and Drop container to open file chooser, then:

```
mcp__plugin_playwright_playwright__browser_file_upload
  paths: ["absolute\\path\\to\\book.epub"]
```

### Step 4 — Send

After upload shows "Ready to Send", click the Send button. Look for success message:
`"Your files are on the way"`

---

## Re-configuring kindle-send

If the config needs to be recreated, the password must be AES-GCM encrypted with this scheme:
- Key = MD5("gibberish" + sender_email + "gibb")
- Encrypt with AES-GCM, output = hex(nonce + ciphertext + tag)

Use this Python script to generate a new encrypted password:

```python
import hashlib, os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

sender = "xu.xiang@gmail.com"
password = "YOUR_APP_PASSWORD_HERE"

key = hashlib.md5(("gibberish" + sender + "gibb").encode()).digest()
nonce = os.urandom(12)
aesgcm = AESGCM(key)
ciphertext_tag = aesgcm.encrypt(nonce, password.encode(), None)
print((nonce + ciphertext_tag).hex())
```

Run with: `python C:\Users\xxiang\.claude\temp\encrypt_kindle.py`

Config JSON format:
```json
{
  "sender": "xu.xiang@gmail.com",
  "receiver": "xu.xiang_68dbc3@kindle.com",
  "storepath": "C:\\Users\\xxiang\\kindle-downloads",
  "password": "<encrypted hex>",
  "server": "smtp.gmail.com",
  "port": 465
}
```

## Error Handling

| Error | Fix |
|-------|-----|
| `cannot decode the password` | Password not encrypted — run encrypt script and update config |
| `dial tcp :0` | Missing `server`/`port` in config JSON |
| `Error sending mail` | Check Gmail app password is valid and sender is in Amazon's approved list |
| `authentication failed` | Gmail app password expired — generate a new one |
