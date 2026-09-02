---
name: epub-kindle-fix
description: Diagnose and repair EPUB files that Amazon Send to Kindle rejects. Triggers on "E999", "Send to Kindle Internal Error", "kindle won't accept my epub", "epub failed to send to kindle", "document could not be delivered", "check this epub", or when a Send to Kindle upload fails for any reason.
---

# EPUB Send to Kindle Doctor

Amazon reports every conversion failure with the same message, whatever the actual cause:

> **E999** — Send to Kindle Internal Error
> The document(s) could not be delivered due to an internal error. Please try sending your document(s) again in some time.

The advice in that message is almost always wrong. E999 is a generic "our converter crashed" bucket — if the EPUB is malformed, retrying an hour later, switching from the website to the desktop app, or emailing it instead all produce the identical error. **Validate the container locally instead of retrying.**

## How to Use

```
Check why this epub won't send to kindle
Fix book.epub for kindle
E999 when sending book.epub
```

Run the doctor:

```bash
python scripts/epub_kindle_doctor.py "book.epub"          # diagnose
python scripts/epub_kindle_doctor.py "book.epub" --fix    # write "book (kindle-fixed).epub"
```

Standard library only — no pip install. Exit code is 1 if any ERROR was found, 0 otherwise.

On Windows, prefix with `PYTHONIOENCODING=utf-8` (or `$env:PYTHONIOENCODING='utf-8'`) so CJK filenames in the output don't raise `UnicodeEncodeError` on the cp1252 console.

**Never overwrite the user's original.** `--fix` always writes a new file alongside it.

## What Causes E999

Ordered by how often they turn out to be the culprit.

| Cause | Why it kills the conversion |
|---|---|
| **Dangling spine/manifest entries** | The OPF lists a file that isn't in the zip. Amazon walks every spine item and fetches it; a 404 inside the container crashes the job. This is the #1 cause and epub readers hide it — calibre and most readers skip missing chapters silently, so the book "opens fine" locally. |
| Broken resource refs in content | `<img src>` or `<link href>` pointing at a file that isn't in the archive. |
| DRM / obfuscated fonts | `META-INF/encryption.xml` present. Amazon converts neither. |
| CMYK or truncated JPEGs | The image pipeline throws on 4-component JPEGs. |
| `mimetype` misplaced or deflated | Must be the first zip entry, stored uncompressed. Repacking an EPUB with a plain `zip -r` or Windows "Send to → Compressed folder" breaks this every time. |
| Malformed OPF/NCX XML | Parse error before conversion even starts. |
| Missing `dc:title` / `dc:language` | The converter dereferences these unconditionally. |
| Over 200 MB | Hard limit for a single document (email route is stricter, ~50 MB). |

**How dangling entries get created:** someone opens a calibre-built EPUB in a GUI editor (Sigil, ePubEditor, Calibre's editor), duplicates or deletes a chapter, and the tool leaves the manifest and spine referencing a file it removed. Look for tell-tale names — `chapter - Copy.html`, `33 - 副本.html`, `foo_split_000 (1).html` — and for a `<dc:contributor>`/`meta` trail showing two different tools touched the file.

Case sensitivity matters too: an OPF href of `text/ch1.html` against an archive entry `Text/ch1.html` resolves on Windows but 404s on Amazon's Linux converter. The doctor flags these as a case mismatch rather than a plain miss.

## What the Doctor Checks

Container: mimetype position/compression/value, `container.xml`, rootfile resolution, DRM, zip integrity, zero-byte entries.

Package: OPF well-formedness, `package/@version`, required Dublin Core metadata, duplicate manifest ids, **every manifest href resolved against the actual zip entries (case-sensitive)**, every spine idref resolved, cover reference, files present but unmanifested, NCX targets.

Content: XHTML well-formedness (HTML named entities like `&nbsp;` are neutralised first so they don't produce false positives), and every internal `img`/`link`/`a` reference resolved.

Images: JPEG frame headers parsed directly from the markers — CMYK (4-component), progressive, oversized, and truncated files.

File: size against both the 200 MB and 50 MB limits, non-ASCII filename.

## What `--fix` Repairs

Conservative by design — it removes *references*, never content:

1. Deletes manifest `<item>` entries whose target file is absent.
2. Deletes the matching `<itemref>` entries from the spine.
3. Corrects `package/@version="1.0"` (not a real EPUB version) to `2.0`.
4. Repacks with `mimetype` first and stored, everything else deflated.

Anything else — DRM, CMYK images, malformed XML — is reported but not touched, because fixing those safely needs a judgement call about the content.

Always re-run the doctor on the output to confirm it comes back clean before telling the user to send it.

## Reporting Back

Lead with the actual cause and the evidence, not the error code. Quote the offending OPF lines — seeing `<item href="text/33 - 副本 - 副本.html" id="id"/>` next to a file listing that contains no such file is what makes the diagnosis land. Say explicitly what was ruled out (size, DRM, filename), so a retry isn't the next suggestion.

If the doctor reports nothing and the send still fails, then it genuinely is on Amazon's side. Fallbacks, in order:

1. Send the `.epub` to the `@kindle.com` address by email instead of the web uploader (different ingestion path).
2. Convert to `.azw3` with calibre and send that — this bypasses Amazon's converter entirely:
   ```bash
   ebook-convert "book.epub" "book.azw3"
   ```
3. Rebuild the EPUB through calibre (`ebook-convert book.epub book2.epub`), which regenerates a clean OPF from scratch and drops whatever the original was carrying.

## Related

- `epub-to-markdown` — convert an EPUB to Markdown instead of reading it on Kindle.
