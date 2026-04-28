---
name: yt-transcript
description: Download and display the transcript/subtitles of a YouTube video using yt-dlp. Triggers on "yt-transcript", "youtube transcript", "download transcript", "get youtube script", "download youtube script".
---

# YouTube Transcript Downloader

Downloads the auto-generated or manual subtitles from a YouTube video using `yt-dlp`, preserves timestamps, and displays the transcript in the video's original language.

## Prerequisites

- `yt-dlp` must be installed (`pip install yt-dlp` or `choco install yt-dlp`)

## Workflow

### Step 1 — Get the URL

The YouTube URL is passed as the argument (e.g. `/yt-transcript https://www.youtube.com/watch?v=XXXX`). If no argument is provided, ask the user for the URL.

### Step 2 — Download subtitles in original language

Do NOT specify `--sub-lang` — let yt-dlp download whatever language the video uses natively. Use the Windows temp path since `/tmp` may not exist on Windows.

```bash
yt-dlp --write-auto-sub --write-sub --skip-download --sub-format vtt -o "C:/Users/%USERNAME%/AppData/Local/Temp/yt_transcript_%(id)s" "<URL>"
```

- `--write-auto-sub` downloads auto-generated subtitles
- `--write-sub` also downloads manual subtitles if available
- `--skip-download` skips the video file itself
- No `--sub-lang` flag — uses the video's original language

### Step 3 — Find the downloaded file

```bash
ls C:/Users/$USERNAME/AppData/Local/Temp/yt_transcript_*
```

The file will be named like `yt_transcript_<video_id>.<lang>.vtt`.

### Step 4 — Clean the transcript, keeping timestamps

Read the `.vtt` file and:
- Remove the `WEBVTT` header line
- Keep timestamp lines (format: `HH:MM:SS.mmm --> HH:MM:SS.mmm`) — strip to just the start time
- Remove inline tags like `<c>`, `</c>`, `<HH:MM:SS.mmm>` from caption text
- Deduplicate consecutive repeated caption lines

Use this Python script:

```bash
python -c "
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
lines = open(sys.argv[1], encoding='utf-8').readlines()
result = []
last_text = None
i = 0
while i < len(lines):
    line = lines[i].strip()
    # Timestamp line
    m = re.match(r'(\d\d:\d\d:\d\d\.\d+) -->', line)
    if m:
        ts = m.group(1)
        i += 1
        # Next line(s) are caption text
        text_lines = []
        while i < len(lines) and lines[i].strip():
            text = re.sub(r'<[^>]+>', '', lines[i]).strip()
            if text:
                text_lines.append(text)
            i += 1
        text = ' '.join(text_lines)
        if text and text != last_text:
            result.append(f'[{ts}] {text}')
            last_text = text
    else:
        i += 1
print('\n'.join(result))
" "C:/Users/%USERNAME%/AppData/Local/Temp/yt_transcript_<video_id>.<lang>.vtt"
```

On Windows, use `python` instead of `python3`. Replace `%USERNAME%` with the actual username from the path found in Step 3.

### Step 5 — Save and display

- Write the cleaned timestamped transcript to the target file (e.g. `youtube.md`) if the user requested it
- Display a preview of the first ~20 lines
- Ask if they want a summary

### Step 6 — Clean up temp files

After saving/displaying the transcript, delete the downloaded VTT file:

```bash
rm C:/Users/$USERNAME/AppData/Local/Temp/yt_transcript_*
```

## Tips

- If `yt-dlp` is not found: `pip install yt-dlp`
- Some videos disable subtitles — inform the user if no `.vtt` file is downloaded
- On Windows, use `python` not `python3`
- Use `encoding='utf-8'` when reading files to handle Chinese/Japanese/Korean characters
- Wrap `sys.stdout` with `io.TextIOWrapper(..., encoding='utf-8')` to avoid Windows console encoding errors
