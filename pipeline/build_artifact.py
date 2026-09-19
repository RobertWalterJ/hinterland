"""Produce the Artifact build of the app.

The published page is wrapped in a doctype/head/body skeleton at publish time,
so the artifact's index cannot be a full HTML document - it has to be the head
contents that survive (title, manifest and stylesheet links) followed by the
body content and the scripts. This transforms app/index.html rather than
keeping a second hand-edited copy, so the two cannot drift.

It also sets GRA_HOSTED, which the export sheet reads: the artifact viewer runs
in a sandbox where a page-initiated download is inert, so the tool offers
clipboard handoff there instead of buttons that quietly do nothing.

Everything else - the CSS, the scripts, the data payloads, the boundaries - is
published unchanged as companion files.

Run:  python pipeline/build_artifact.py
"""
import io
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app")
OUT = os.path.join(ROOT, "build", "artifact")

# Published alongside the page, at the same relative paths the HTML uses.
# The scripts and the stylesheet are READ OFF index.html rather than listed
# here: a second copy of what the page loads is a copy that drifts, and the
# failure mode is a published page whose scripts 404 - a blank app, with a
# build log that says everything is fine.
ASSETS = [
    "manifest.webmanifest",
    "icon-192.png", "icon-512.png",
    "data/geo.json", "data/work_csd.json", "data/work_ct.json",
    "data/res_series.json", "data/population.json", "data/commute.json",
    "data/business.json", "data/meta.json", "data/ct_csd.json",
    "data/components.json", "data/io.json",
    "data/boundaries_csd.json", "data/boundaries_ct.json",
]


def referenced(html):
    """Every local script and stylesheet the page pulls in, in page order."""
    out = []
    for m in re.finditer(r'<script[^>]+src="([^"]+)"', html):
        out.append(m.group(1))
    for m in re.finditer(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"', html):
        out.append(m.group(1))
    return [u for u in out if not u.startswith(("http:", "https:", "//"))]


def companions():
    src = io.open(os.path.join(APP, "index.html"), encoding="utf-8").read()
    refs = referenced(src)
    missing = [r for r in refs
               if not os.path.exists(os.path.join(APP, r.split("?")[0]))]
    if missing:
        raise SystemExit("index.html references files that do not exist: %s"
                         % ", ".join(missing))
    return refs + ASSETS


COMPANIONS = companions()

# Dropped from the head: the skeleton supplies charset and viewport, and the
# service worker is not registered on the hosted build (see below).
DROP_META = ("charset", "viewport")


def transform(html):
    """Full document -> the fragment the Artifact publisher expects."""
    head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
    body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)

    keep = []
    for line in head.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("<meta") and any('name="%s"' % d in s or
                                         d in s.split()[0] for d in DROP_META):
            continue
        if s.startswith("<meta charset") or "viewport" in s:
            continue
        keep.append(s)

    flag = ('<script>\n'
            '/* Published build. The viewer sandbox makes page-initiated\n'
            '   downloads inert, so the export sheet offers the clipboard\n'
            '   instead of file formats that could not arrive. */\n'
            'window.GRA_HOSTED = true;\n'
            '</script>')

    return "\n".join(keep) + "\n" + flag + "\n" + body.rstrip() + "\n"


def main():
    src = os.path.join(APP, "index.html")
    html = open(src, encoding="utf-8").read()
    page = transform(html)

    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)

    total = len(page.encode("utf-8"))
    missing = []
    for rel in COMPANIONS:
        s = os.path.join(APP, rel)
        if not os.path.exists(s):
            missing.append(rel)
            continue
        d = os.path.join(OUT, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(d), exist_ok=True)
        shutil.copy2(s, d)
        total += os.path.getsize(s)

    if missing:
        print("MISSING: %s" % missing, file=sys.stderr)
        return 1

    print("artifact build in %s" % OUT)
    print("  index.html          %7.1f KB" % (len(page.encode()) / 1024))
    print("  %d companion files" % len(COMPANIONS))
    print("  %.2f MB total (limit is 16 MB for the page, 64 MB per version)"
          % (total / 1048576.0))
    for rel in COMPANIONS:
        sz = os.path.getsize(os.path.join(APP, rel))
        if sz > 400 * 1024:
            print("    %-28s %6.2f MB" % (rel, sz / 1048576.0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
