"""Fetch declared sources into data/raw.

Checks a list of local cache directories first, so a file already downloaded by
an earlier build is reused rather than pulled again. Downloads are resumable-ish
(written to .part then renamed) and verified against Content-Length.

Run:  python pipeline/fetch.py            # everything missing
      python pipeline/fetch.py KEY [KEY]  # named sources only
"""
import os
import sys
import shutil
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "data", "raw")

sys.path.insert(0, HERE)
import sources as S  # noqa: E402

# Directories searched for an already-downloaded copy before hitting the network.
# Several of the bulk downloads were first fetched for an earlier Ontario
# project and are large; they are reused from wherever they already sit rather
# than pulled again. Any directory listed here that does not exist is skipped,
# so a missing one costs nothing but a re-download.
CACHE_DIRS = [
    RAW,
    # A sibling project checked out next to this one, if there is one. Nothing
    # is hard-coded beyond that: a public repository should not carry anyone's
    # folder layout, and every file here can be fetched fresh from source.
    os.path.abspath(os.path.join(ROOT, "..", "CitySteps Mainstreet", "data", "raw")),
]
# A machine that keeps its raw downloads somewhere else can say so without
# editing code: HINTERLAND_RAW_CACHE=path1;path2
for _p in os.environ.get("HINTERLAND_RAW_CACHE", "").split(os.pathsep):
    if _p.strip():
        CACHE_DIRS.append(os.path.abspath(_p.strip()))

UA = {"User-Agent": "Hinterland/1.0 (local research tool)"}


def _expected_size(url):
    try:
        req = urllib.request.Request(url, headers=UA, method="HEAD")
        with urllib.request.urlopen(req, timeout=60) as r:
            n = r.headers.get("Content-Length")
            return int(n) if n else None
    except Exception:
        return None


def locate(src):
    """Return the path of an existing usable copy, or None."""
    for d in CACHE_DIRS:
        p = os.path.join(d, src.filename)
        if os.path.exists(p) and os.path.getsize(p) > 1024:
            return p
    return None


def fetch(src, force=False):
    dest = os.path.join(RAW, src.filename)
    if not force:
        found = locate(src)
        if found:
            if os.path.abspath(found) != os.path.abspath(dest):
                print("  cached elsewhere -> %s" % found)
                return found
            print("  present (%.1f MB)" % (os.path.getsize(dest) / 1e6))
            return dest

    size = _expected_size(src.url)
    label = "%.0f MB" % (size / 1e6) if size else "unknown size"
    print("  downloading %s (%s)" % (src.url, label))
    part = dest + ".part"
    req = urllib.request.Request(src.url, headers=UA)
    got = 0
    with urllib.request.urlopen(req, timeout=120) as r, open(part, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            got += len(chunk)
            if size and got % (25 << 20) < (1 << 20):
                print("    %.0f%%" % (100.0 * got / size))
    # Some Statistics Canada endpoints answer HEAD with a stub, so a mismatch is
    # only treated as a failure when the body came back clearly short.
    if size and size > 10000 and got < 0.5 * size:
        os.remove(part)
        raise IOError("short download for %s: got %d expected %d"
                      % (src.key, got, size))
    if got < 1024:
        os.remove(part)
        raise IOError("empty download for %s" % src.key)
    shutil.move(part, dest)
    print("  done (%.1f MB)" % (got / 1e6))
    return dest


def main(keys=None):
    os.makedirs(RAW, exist_ok=True)
    todo = S.SOURCES if not keys else [S.SOURCE_BY_KEY[k] for k in keys]
    paths = {}
    for src in todo:
        print("[%s] %s" % (src.key, src.title[:80]))
        try:
            paths[src.key] = fetch(src)
        except Exception as e:
            print("  FAILED: %s: %s" % (type(e).__name__, e))
    print("\n%d/%d sources available" % (len(paths), len(todo)))
    return paths


if __name__ == "__main__":
    main(sys.argv[1:] or None)
