# -*- coding: utf-8 -*-
"""Stream a Statistics Canada SDMX 2.0 "generic" census table.

The census topic-based tabulations are published as SDMX rather than as the
flat CSV the Web Data Service cubes give you, and they are enormous: the 2016
employed-labour-force industry table is 87 MB zipped and **8.4 GB** open,
because every cell of a five-dimensional cross-tabulation gets its own verbose
XML element. Only about one cell in 165 is wanted here - the totals across
occupation and sex - so the file is never held in memory or written to disk
uncompressed. It is read as a stream straight out of the zip, in chunks, and
matched with a single compiled expression that fails fast on the 99% of
records belonging to a breakdown we do not want.

The format is regular enough that a real XML parser would be slower and no
safer: each observation is a <generic:Series> holding one <generic:SeriesKey>
of concept/value pairs and one <generic:ObsValue>. What varies between tables
is the set of concepts and the order they appear in, so callers pass the key
they want as an ordered list of (concept, pattern) pairs.

Used by pipeline/build.py to load the pre-2021 legs of the residence series.
"""
import re
import zipfile

CHUNK = 1 << 24          # 16 MB of the decompressed stream at a time
OVERLAP = 4096           # a record is ~500 bytes; this cannot straddle it


def _key_pattern(concepts):
    """Build the regex for one SeriesKey followed by its observation.

    `concepts` is an ordered list of (name, pattern) pairs matching the order
    the concepts appear in the file. A pattern that is a capturing group is
    returned; anything else is matched and discarded.
    """
    parts = []
    for name, pat in concepts:
        parts.append(
            r'<generic:Value concept="%s" value="%s"\s*/>' % (name, pat))
    body = r'\s*'.join(parts)
    return re.compile(
        (r'<generic:SeriesKey>\s*' + body +
         r'\s*</generic:SeriesKey>\s*<generic:Obs>\s*'
         r'<generic:Time>[^<]*</generic:Time>\s*'
         r'<generic:ObsValue value="([^"]*)"').encode('ascii'))


def stream(zip_path, member, concepts, on_row, progress=None):
    """Call `on_row(groups)` for every record whose key matches `concepts`.

    `groups` is the tuple of captured strings, decoded, with the observation
    value last. Returns the number of matches.
    """
    rx = _key_pattern(concepts)
    n = 0
    read = 0
    with zipfile.ZipFile(zip_path) as z:
        with z.open(member) as f:
            tail = b''
            while True:
                buf = f.read(CHUNK)
                if not buf:
                    break
                read += len(buf)
                data = tail + buf
                last = 0
                for m in rx.finditer(data):
                    last = m.end()
                    n += 1
                    on_row(tuple(g.decode('ascii') if g is not None else None
                                 for g in m.groups()))
                # Keep enough of the tail that a record split across the chunk
                # boundary is seen on the next pass, but never re-scan a region
                # we already matched in.
                keep = max(last, len(data) - OVERLAP)
                tail = data[keep:]
                if progress:
                    progress(read, n)
    return n


def parse_value(s):
    """SDMX suppression and missing markers come through as non-numeric text."""
    if s is None or s == '':
        return None
    try:
        return float(s)
    except ValueError:
        return None
