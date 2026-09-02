#!/usr/bin/env python3
"""Diagnose (and optionally repair) EPUB files that Amazon Send to Kindle rejects.

Amazon reports every conversion failure as the same opaque code (E999,
"Send to Kindle Internal Error"), so the only way to find the cause is to
validate the container yourself.

Usage:
    python epub_kindle_doctor.py BOOK.epub          # diagnose only
    python epub_kindle_doctor.py BOOK.epub --fix    # also write "BOOK (kindle-fixed).epub"

Exit code 0 = no ERRORs found, 1 = at least one ERROR.
Standard library only.
"""

import argparse
import os
import posixpath
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile

OPF_NS = 'http://www.idpf.org/2007/opf'
NCX_NS = 'http://www.w3.org/2001/DAISY/2005/ncx'
CONTAINER_NS = 'urn:oasis:names:tc:opendocument:xmlns:container'

# Amazon's documented ceiling for a single document; the email route is stricter.
MAX_BYTES = 200 * 1024 * 1024
EMAIL_MAX_BYTES = 50 * 1024 * 1024

TEXT_TYPES = ('application/xhtml+xml', 'text/html')

findings = []


def report(level, code, message, detail=None):
    findings.append((level, code, message, detail))


def errors():
    return [f for f in findings if f[0] == 'ERROR']


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def resolve(base_href, relative):
    """Resolve an href relative to the file that contains it, as a zip path."""
    relative = urllib.parse.unquote(relative.split('#')[0].split('?')[0])
    if not relative:
        return None
    return posixpath.normpath(posixpath.join(posixpath.dirname(base_href), relative))


def jpeg_info(data):
    """Return {w, h, components, progressive} from JPEG markers, or None."""
    if not data.startswith(b'\xff\xd8'):
        return None
    i, n = 2, len(data)
    sof = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while i < n - 1:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker == 0xD8 or marker == 0x01 or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        if marker == 0xD9 or i + 9 > n:
            break
        seglen = int.from_bytes(data[i + 2:i + 4], 'big')
        if marker in sof:
            return {
                'h': int.from_bytes(data[i + 5:i + 7], 'big'),
                'w': int.from_bytes(data[i + 7:i + 9], 'big'),
                'components': data[i + 9],
                'progressive': marker in (0xC2, 0xC6, 0xCA),
            }
        if seglen < 2:
            break
        i += 2 + seglen
    return None


# --------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------

def check_container(zf, names):
    """mimetype placement, container.xml, DRM. Returns the OPF path or None."""
    infos = zf.infolist()
    if not infos or infos[0].filename != 'mimetype':
        report('ERROR', 'mimetype-position',
               'The "mimetype" entry must be the first entry in the zip.',
               'Repack with: zip -X -0 book.epub mimetype && zip -Xr9D book.epub . -x mimetype')
    elif infos[0].compress_type != zipfile.ZIP_STORED:
        report('ERROR', 'mimetype-compressed',
               'The "mimetype" entry must be stored uncompressed.')
    if 'mimetype' in names:
        value = zf.read('mimetype').decode('ascii', 'replace').strip()
        if value != 'application/epub+zip':
            report('ERROR', 'mimetype-value',
                   'mimetype must contain exactly "application/epub+zip".',
                   'Found: %r' % value)

    if 'META-INF/encryption.xml' in names:
        report('ERROR', 'drm',
               'META-INF/encryption.xml present: the file is DRM-protected or uses '
               'obfuscated fonts. Amazon cannot convert either.',
               'DRM-free books only. Obfuscated fonts must be de-obfuscated or removed.')

    if 'META-INF/container.xml' not in names:
        report('ERROR', 'no-container', 'META-INF/container.xml is missing.')
        return None
    try:
        root = ET.fromstring(zf.read('META-INF/container.xml'))
    except ET.ParseError as exc:
        report('ERROR', 'container-malformed', 'META-INF/container.xml is not valid XML.', str(exc))
        return None
    rootfile = root.find('.//{%s}rootfile' % CONTAINER_NS)
    if rootfile is None or not rootfile.get('full-path'):
        report('ERROR', 'no-rootfile', 'container.xml declares no rootfile.')
        return None
    opf_path = urllib.parse.unquote(rootfile.get('full-path'))
    if opf_path not in names:
        report('ERROR', 'opf-missing',
               'container.xml points at an OPF that is not in the archive.', opf_path)
        return None
    return opf_path


def check_package(zf, names, opf_path):
    """The big one: manifest/spine integrity. Returns (bad_ids, opf_text)."""
    opf_text = zf.read(opf_path).decode('utf-8', 'replace')
    try:
        opf = ET.fromstring(opf_text)
    except ET.ParseError as exc:
        report('ERROR', 'opf-malformed', 'The OPF package document is not valid XML.', str(exc))
        return set(), opf_text

    version = opf.get('version')
    if version not in ('2.0', '3.0'):
        report('WARN', 'package-version',
               'package/@version is %r; valid EPUB versions are "2.0" and "3.0".' % version)

    meta = opf.find('{%s}metadata' % OPF_NS)
    if meta is not None:
        dc = '{http://purl.org/dc/elements/1.1/}'
        for field in ('title', 'language'):
            if meta.find(dc + field) is None:
                report('ERROR', 'missing-metadata',
                       'Required metadata dc:%s is missing.' % field)
        langs = meta.findall(dc + 'language')
        if len(langs) > 1:
            report('WARN', 'multiple-languages',
                   'Multiple dc:language entries (%s); Amazon uses the first and may mis-tag '
                   'the book.' % ', '.join(l.text or '?' for l in langs))

    manifest = {}          # id -> href (zip path)
    bad_ids = set()        # manifest ids whose file is absent
    seen_ids = set()
    manifest_paths = set()
    media = {}             # id -> media-type

    for item in opf.findall('.//{%s}manifest/{%s}item' % (OPF_NS, OPF_NS)):
        iid, href = item.get('id'), item.get('href')
        if not iid or not href:
            report('ERROR', 'manifest-incomplete', 'A manifest <item> lacks id or href.')
            continue
        if iid in seen_ids:
            report('ERROR', 'duplicate-id', 'Duplicate manifest id "%s".' % iid)
        seen_ids.add(iid)
        target = resolve(opf_path, href)
        manifest[iid] = target
        media[iid] = item.get('media-type', '')
        manifest_paths.add(target)
        if target not in names:
            bad_ids.add(iid)
            near = [n for n in names if n.lower() == (target or '').lower()]
            report('ERROR', 'dangling-manifest',
                   'Manifest item "%s" points at a file that is not in the archive.' % iid,
                   'href=%s%s' % (href, '  (case mismatch with %s)' % near[0] if near else ''))

    spine = opf.find('.//{%s}spine' % OPF_NS)
    if spine is None or not list(spine):
        report('ERROR', 'no-spine', 'The spine is empty or missing; there is nothing to read.')
    else:
        for ref in spine.findall('{%s}itemref' % OPF_NS):
            idref = ref.get('idref')
            if idref not in manifest:
                report('ERROR', 'spine-unresolved',
                       'Spine itemref "%s" does not match any manifest id.' % idref)
            elif idref in bad_ids:
                report('ERROR', 'spine-dangling',
                       'Spine entry "%s" is in the reading order but its file is missing. '
                       'Amazon fetches every spine item and the conversion dies here.' % idref,
                       'href=%s' % manifest[idref])

    # cover
    cover_meta = opf.find('.//{%s}metadata/{%s}meta[@name="cover"]' % (OPF_NS, OPF_NS))
    if cover_meta is not None and cover_meta.get('content') not in manifest:
        report('WARN', 'cover-unresolved',
               'meta[name=cover] points at manifest id "%s", which does not exist.'
               % cover_meta.get('content'))

    # stray files
    ignored = {'mimetype', opf_path}
    stray = sorted(n for n in names
                   if n not in manifest_paths and n not in ignored
                   and not n.startswith('META-INF/') and not n.endswith('/'))
    if stray:
        report('WARN', 'unmanifested',
               '%d file(s) in the archive are not listed in the manifest.' % len(stray),
               ', '.join(stray[:10]) + (' ...' if len(stray) > 10 else ''))

    # NCX
    toc_id = spine.get('toc') if spine is not None else None
    if toc_id and toc_id in manifest and manifest[toc_id] in names:
        check_ncx(zf, names, manifest[toc_id])

    check_documents(zf, names, manifest, media, bad_ids)
    return bad_ids, opf_text


def check_ncx(zf, names, ncx_path):
    try:
        ncx = ET.fromstring(zf.read(ncx_path))
    except ET.ParseError as exc:
        report('ERROR', 'ncx-malformed', 'toc.ncx is not valid XML.', str(exc))
        return
    for content in ncx.findall('.//{%s}content' % NCX_NS):
        src = content.get('src')
        if not src:
            continue
        target = resolve(ncx_path, src)
        if target and target not in names:
            report('ERROR', 'ncx-dangling',
                   'toc.ncx links to a file that is not in the archive.', src)


def check_documents(zf, names, manifest, media, bad_ids):
    """Well-formedness of content docs, and every resource they reference."""
    img_ref_re = re.compile(r'''<(?:img|image)\b[^>]*?\b(?:src|xlink:href)\s*=\s*["']([^"']+)["']''', re.I)
    link_re = re.compile(r'''<link\b[^>]*?\bhref\s*=\s*["']([^"']+)["']''', re.I)
    a_re = re.compile(r'''<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["']''', re.I)

    broken = []
    malformed = []
    for iid, path in manifest.items():
        if iid in bad_ids or media.get(iid) not in TEXT_TYPES or path not in names:
            continue
        raw = zf.read(path)
        text = raw.decode('utf-8', 'replace')
        try:
            # Strip the DOCTYPE and neutralise HTML named entities (&nbsp; and friends
            # are legal in XHTML via the DTD, but ExpatError doesn't know them).
            probe = re.sub(r'<!DOCTYPE[^>]*>', '', text, count=1)
            probe = re.sub(r'&(?!amp;|lt;|gt;|quot;|apos;|#)([a-zA-Z][a-zA-Z0-9]*);', r'\1', probe)
            ET.fromstring(probe)
        except ET.ParseError as exc:
            malformed.append('%s: %s' % (path, exc))
        for pattern in (img_ref_re, link_re, a_re):
            for ref in pattern.findall(text):
                if re.match(r'^(https?:|mailto:|data:|#|tel:)', ref, re.I):
                    continue
                target = resolve(path, ref)
                if target and target not in names:
                    broken.append('%s -> %s' % (path, ref))

    if malformed:
        report('WARN', 'not-well-formed',
               '%d content document(s) are not well-formed XHTML.' % len(malformed),
               '; '.join(malformed[:5]))
    if broken:
        report('ERROR', 'broken-resource-ref',
               '%d reference(s) inside content documents point at files that are not in '
               'the archive.' % len(broken),
               '; '.join(broken[:10]) + (' ...' if len(broken) > 10 else ''))


def check_resources(zf, names):
    empty = [i.filename for i in zf.infolist() if i.file_size == 0 and not i.filename.endswith('/')]
    if empty:
        report('ERROR', 'empty-file', '%d zero-byte file(s) in the archive.' % len(empty),
               ', '.join(empty[:10]))

    cmyk, progressive, huge, corrupt = [], [], [], []
    for name in names:
        if not re.search(r'\.jpe?g$', name, re.I):
            continue
        data = zf.read(name)
        info = jpeg_info(data)
        if info is None:
            corrupt.append(name)
            continue
        if info['components'] == 4:
            cmyk.append(name)
        if info['progressive']:
            progressive.append(name)
        if info['w'] * info['h'] > 4_000_000 or max(info['w'], info['h']) > 10_000:
            huge.append('%s (%dx%d)' % (name, info['w'], info['h']))

    if corrupt:
        report('ERROR', 'jpeg-corrupt',
               '%d JPEG(s) have no readable frame header (truncated or not actually JPEG).'
               % len(corrupt), ', '.join(corrupt[:10]))
    if cmyk:
        report('ERROR', 'jpeg-cmyk',
               '%d CMYK JPEG(s). Amazon\'s converter chokes on CMYK; convert to RGB.'
               % len(cmyk), ', '.join(cmyk[:10]))
    if progressive:
        report('WARN', 'jpeg-progressive',
               '%d progressive JPEG(s); baseline is safer for Kindle.' % len(progressive),
               ', '.join(progressive[:5]))
    if huge:
        report('WARN', 'jpeg-huge',
               '%d oversized image(s) (Kindle downsamples above ~4 megapixels).' % len(huge),
               ', '.join(huge[:5]))


def check_file(path):
    size = os.path.getsize(path)
    if size > MAX_BYTES:
        report('ERROR', 'too-large',
               'File is %.1f MB; Send to Kindle rejects documents over 200 MB.'
               % (size / 1048576))
    elif size > EMAIL_MAX_BYTES:
        report('WARN', 'large-for-email',
               'File is %.1f MB. The web uploader and app accept it, but the '
               'send-to-kindle email route caps attachments near 50 MB.' % (size / 1048576))

    name = os.path.basename(path)
    try:
        name.encode('ascii')
    except UnicodeEncodeError:
        report('WARN', 'non-ascii-filename',
               'The filename contains non-ASCII characters, which has been known to trip the '
               'uploader. Try renaming to ASCII before blaming the content.', name)


# --------------------------------------------------------------------------
# repair
# --------------------------------------------------------------------------

def repair(src, opf_path, bad_ids, opf_text, dest):
    """Strip dangling manifest items and their spine/NCX references, then repack.

    Only references are removed. No content file is ever dropped or rewritten.
    """
    new_opf = opf_text
    for bid in sorted(bad_ids):
        new_opf = re.sub(
            r'[ \t]*<item\b[^>]*\bid="%s"[^>]*/>[ \t]*\r?\n?' % re.escape(bid), '', new_opf)
        new_opf = re.sub(
            r'[ \t]*<itemref\b[^>]*\bidref="%s"[^>]*/>[ \t]*\r?\n?' % re.escape(bid), '', new_opf)
    new_opf = re.sub(r'(<package\b[^>]*\bversion=")1\.0(")', r'\g<1>2.0\g<2>', new_opf)

    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dest, 'w') as zout:
        zout.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        for item in zin.infolist():
            if item.filename == 'mimetype' or item.filename.endswith('/'):
                continue
            data = new_opf.encode('utf-8') if item.filename == opf_path else zin.read(item.filename)
            zout.writestr(item.filename, data, compress_type=zipfile.ZIP_DEFLATED)
    return dest


# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('epub')
    ap.add_argument('--fix', action='store_true',
                    help='write a repaired copy alongside the original')
    ap.add_argument('-o', '--out', help='output path for --fix')
    args = ap.parse_args()

    if not zipfile.is_zipfile(args.epub):
        print('ERROR  not-a-zip  The file is not a valid zip archive. It may be truncated, '
              'or it may be a .mobi/.azw renamed to .epub.')
        return 1

    check_file(args.epub)
    with zipfile.ZipFile(args.epub) as zf:
        bad = zf.testzip()
        if bad:
            report('ERROR', 'zip-corrupt', 'Corrupt entry in the archive: %s' % bad)
        names = set(n for n in zf.namelist() if not n.endswith('/'))
        opf_path = check_container(zf, names)
        bad_ids, opf_text = (set(), '')
        if opf_path:
            bad_ids, opf_text = check_package(zf, names, opf_path)
        check_resources(zf, names)

    width = max((len(f[1]) for f in findings), default=0)
    for level, code, message, detail in sorted(findings, key=lambda f: f[0] != 'ERROR'):
        print('%-5s  %-*s  %s' % (level, width, code, message))
        if detail:
            print('       %-*s  %s' % (width, '', detail))
    if not findings:
        print('OK  No problems found. If Send to Kindle still fails, the cause is on '
              'Amazon\'s side; retry in a few hours or use a different delivery route.')

    if args.fix:
        if not bad_ids and not any(f[1] == 'package-version' for f in findings):
            print('\nNothing this script can repair automatically.')
        else:
            base, ext = os.path.splitext(args.epub)
            dest = args.out or '%s (kindle-fixed)%s' % (base, ext)
            repair(args.epub, opf_path, bad_ids, opf_text, dest)
            print('\nWrote %s' % dest)
            print('Removed %d dangling reference(s): %s' % (len(bad_ids), ', '.join(sorted(bad_ids))))
            print('Re-run this script on the new file to confirm it is clean.')

    return 1 if errors() else 0


if __name__ == '__main__':
    sys.exit(main())
