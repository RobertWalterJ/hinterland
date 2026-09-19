"""Build the GitHub Pages site into docs/.

GitHub Pages serves this repository's `main` branch from `/docs`, at
https://robertwalterj.github.io/hinterland/ - a PROJECT site, living at a
subpath of an origin it shares with the other apps published the same way.
Two consequences shape this script:

  1. Everything must work from a subpath. The app already uses only relative
     URLs; this script refuses to build if index.html references an absolute
     local path, because "/js/app.js" resolves to the origin root, not to
     /hinterland/, and fails only once it is live.

  2. The service worker is the part that breaks silently. Its pre-cache list is
     a second copy of what the app is made of, and a file named there but
     missing makes the install quietly incomplete. So the build refuses if any
     pre-cached file, or any file the page loads, is absent.

docs/ is generated. Never edit it by hand: edit app/ and run this.

Run:  python pipeline/make_deploy.py
"""
import io
import os
import re
import shutil
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app")
OUT = os.path.join(ROOT, "docs")


def fail(msg):
    raise SystemExit("make_deploy: refusing to build - " + msg)


def page_refs(html):
    refs = re.findall(r'<script[^>]+src="([^"]+)"', html)
    refs += re.findall(r'<link[^>]+href="([^"]+)"', html)
    return [r for r in refs
            if not r.startswith(("http:", "https:", "//", "data:"))]


def sw_shell(sw):
    m = re.search(r"var SHELL = \[(.*?)\];", sw, re.S)
    if not m:
        fail("could not find the SHELL list in app/sw.js")
    return re.findall(r"'([^']+)'", m.group(1))


def main():
    html = io.open(os.path.join(APP, "index.html"), encoding="utf-8").read()
    sw = io.open(os.path.join(APP, "sw.js"), encoding="utf-8").read()

    refs = page_refs(html)
    absolute = [r for r in refs if r.startswith("/")]
    if absolute:
        fail("index.html uses root-absolute paths, which break at the "
             "/hinterland/ subpath: %s" % ", ".join(absolute))

    missing = [r for r in refs + sw_shell(sw)
               if not os.path.exists(os.path.join(APP, r))]
    if missing:
        fail("files referenced but not present in app/: %s"
             % ", ".join(sorted(set(missing))))

    if "caches.match(" in re.sub(r"/\*.*?\*/", "", sw, flags=re.S):
        fail("app/sw.js calls the global caches.match(), which searches every "
             "app's cache on the shared origin")

    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    shutil.copytree(APP, OUT)

    # Without this, Pages runs the site through Jekyll, which silently drops
    # any file or folder whose name starts with an underscore.
    io.open(os.path.join(OUT, ".nojekyll"), "w").close()

    n, size = 0, 0
    for dp, _dn, fn in os.walk(OUT):
        for f in fn:
            n += 1
            size += os.path.getsize(os.path.join(dp, f))
    big = [(os.path.relpath(os.path.join(dp, f), OUT),
            os.path.getsize(os.path.join(dp, f)))
           for dp, _dn, fn in os.walk(OUT) for f in fn
           if os.path.getsize(os.path.join(dp, f)) > 50 * 1048576]
    if big:
        fail("files too large for GitHub: %s" % big)

    print("built docs/ for GitHub Pages - %d files, %.1f MB, %s"
          % (n, size / 1048576.0,
             datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")))
    print("  every page reference and pre-cached file present; "
          "no root-absolute paths; no global caches.match()")


if __name__ == "__main__":
    main()
