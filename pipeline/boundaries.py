"""Turn the Statistics Canada cartographic boundary files into web-ready maps.

Reads the shapefiles straight out of their zips, keeps Ontario, converts
Statistics Canada Lambert coordinates back to latitude and longitude, simplifies
the rings enough to render smoothly on a phone, and writes GeoJSON.

Pure standard library - no GDAL, no pyshp, no pyproj. The three pieces that
normally come from those libraries are implemented here: the DBF reader, the
shapefile record parser, and the inverse Lambert conformal conic projection.
The projection constants come from the .prj shipped alongside each shapefile
(NAD83 / Statistics Canada Lambert, EPSG:3347).

Adapted from the boundary processor written for an earlier Ontario municipal
model (CitySteps Mainstreet), generalised to handle census tracts as well as
census subdivisions.

Usage:
    python pipeline/boundaries.py                      # both layers
    python pipeline/boundaries.py csd --tolerance 250
    python pipeline/boundaries.py ct  --tolerance 60
"""

import array
import json
import math
import os
import struct
import sys
import time
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
APPDATA = os.path.join(ROOT, "app", "data")

sys.path.insert(0, HERE)
import sources as S      # noqa: E402
import fetch as F        # noqa: E402

ONT = "35"

LAYERS = {
    # key: (source key, shapefile stem, id field, default tolerance in metres)
    "csd": ("csd_boundaries", "lcsd000b21a_e", "CSDUID", 250.0),
    "ct": ("ct_boundaries", "lct_000b21a_e", "CTUID", 60.0),
}

# --------------------------------------------------------------------------- #
# NAD83 / Statistics Canada Lambert (EPSG:3347)
# --------------------------------------------------------------------------- #

A = 6378137.0
RF = 298.2572221008916
FLAT = 1.0 / RF
E2 = 2 * FLAT - FLAT * FLAT
E = math.sqrt(E2)

LAT1 = math.radians(49.0)
LAT2 = math.radians(77.0)
LAT0 = math.radians(63.390675)
LON0 = math.radians(-91.86666666666666)
FE = 6200000.0
FN = 3000000.0


def _m(phi):
    return math.cos(phi) / math.sqrt(1.0 - E2 * math.sin(phi) ** 2)


def _t(phi):
    s = E * math.sin(phi)
    return (math.tan(math.pi / 4 - phi / 2)
            / ((1.0 - s) / (1.0 + s)) ** (E / 2))


_m1, _m2 = _m(LAT1), _m(LAT2)
_t1, _t2, _t0 = _t(LAT1), _t(LAT2), _t(LAT0)
_n = (math.log(_m1) - math.log(_m2)) / (math.log(_t1) - math.log(_t2))
_F = _m1 / (_n * _t1 ** _n)
_rho0 = A * _F * _t0 ** _n


def inverse_lcc(x, y):
    """Statistics Canada Lambert metres -> (lon, lat) in degrees."""
    dx = x - FE
    dy = _rho0 - (y - FN)
    rho = math.hypot(dx, dy)
    if _n < 0:
        rho = -rho
    if rho == 0:
        return (math.degrees(LON0), 90.0 if _n > 0 else -90.0)
    t = (rho / (A * _F)) ** (1.0 / _n)
    theta = math.atan2(dx, dy)
    lon = theta / _n + LON0
    phi = math.pi / 2 - 2 * math.atan(t)
    for _ in range(12):
        s = E * math.sin(phi)
        new = math.pi / 2 - 2 * math.atan(t * ((1.0 - s) / (1.0 + s)) ** (E / 2))
        if abs(new - phi) < 1e-12:
            phi = new
            break
        phi = new
    return (math.degrees(lon), math.degrees(phi))


# --------------------------------------------------------------------------- #
# DBF
# --------------------------------------------------------------------------- #

def read_dbf_field(zf, field):
    """One DBF field's values, in record order."""
    member = next((n for n in zf.namelist() if n.lower().endswith(".dbf")), None)
    if member is None:
        raise KeyError("no .dbf in archive")
    data = zf.read(member)
    n_records, header_len, record_len = struct.unpack_from("<IHH", data, 4)

    fields, pos = [], 32
    while data[pos] != 0x0D:
        name = data[pos:pos + 11].split(b"\x00")[0].decode("latin-1")
        length = data[pos + 16]
        fields.append((name, length))
        pos += 32

    offsets, off = {}, 1              # skip the record deletion flag
    for name, length in fields:
        offsets[name] = (off, length)
        off += length
    if field not in offsets:
        raise KeyError("%s not in DBF; have %s" % (field, [f[0] for f in fields]))

    start, length = offsets[field]
    return [data[header_len + i * record_len + start:
                 header_len + i * record_len + start + length]
            .decode("latin-1").strip()
            for i in range(n_records)]


# --------------------------------------------------------------------------- #
# SHP
# --------------------------------------------------------------------------- #

def iter_shapes(fh, keep):
    """Yield (record index, [ring, ...]) for records whose index is in keep.

    Streams sequentially rather than seeking, because zip members are not
    cheaply seekable.
    """
    fh.read(100)
    idx = -1
    while True:
        head = fh.read(8)
        if len(head) < 8:
            return
        idx += 1
        _rec, words = struct.unpack(">II", head)
        content = fh.read(words * 2)
        if idx not in keep:
            continue
        shape_type = struct.unpack_from("<i", content, 0)[0]
        if shape_type != 5:               # 5 = polygon, 0 = null
            continue
        n_parts, n_points = struct.unpack_from("<ii", content, 36)
        parts = struct.unpack_from("<%di" % n_parts, content, 44)
        pt_off = 44 + n_parts * 4
        coords = array.array("d")
        coords.frombytes(content[pt_off:pt_off + n_points * 16])
        if sys.byteorder != "little":
            coords.byteswap()
        rings = []
        bounds = list(parts) + [n_points]
        for k in range(n_parts):
            s, e = bounds[k], bounds[k + 1]
            ring = [(coords[2 * j], coords[2 * j + 1]) for j in range(s, e)]
            if len(ring) >= 4:
                rings.append(ring)
        yield idx, rings


# --------------------------------------------------------------------------- #
# simplification
# --------------------------------------------------------------------------- #

def ring_area(ring):
    s = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        s += x0 * y1 - x1 * y0
    return abs(s) / 2.0


def douglas_peucker(pts, tol):
    """Iterative Douglas-Peucker. Recursion overflows the stack on the northern
    unorganised areas, several of which carry more than 100,000 vertices."""
    n = len(pts)
    if n < 3:
        return pts
    keep = [False] * n
    keep[0] = keep[n - 1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        x0, y0 = pts[a]
        x1, y1 = pts[b]
        dx, dy = x1 - x0, y1 - y0
        norm = math.hypot(dx, dy)
        best, bi = -1.0, -1
        if norm == 0:
            for i in range(a + 1, b):
                d = math.hypot(pts[i][0] - x0, pts[i][1] - y0)
                if d > best:
                    best, bi = d, i
        else:
            for i in range(a + 1, b):
                px, py = pts[i]
                d = abs(dy * px - dx * py + x1 * y0 - y1 * x0) / norm
                if d > best:
                    best, bi = d, i
        if best > tol and bi > 0:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


# --------------------------------------------------------------------------- #

def ontario_codes(level):
    """The authoritative Ontario code list for a geography level, from the
    database. Census tract identifiers begin with the CMA code rather than the
    province code, so a prefix test cannot select them - the geography spine,
    built from Ontario dissemination blocks, is the only correct filter."""
    import sqlite3
    db = os.path.join(DATA, "analyst.db")
    if not os.path.exists(db):
        return None
    con = sqlite3.connect(db)
    codes = set(r[0] for r in con.execute(
        "SELECT code FROM geo WHERE level=? AND is_ontario=1", (level,)))
    con.close()
    return codes or None


def build_layer(layer, tol=None, out_name=None):
    src_key, stem, id_field, default_tol = LAYERS[layer]
    tol = default_tol if tol is None else tol
    min_area = tol * tol * 12

    path = F.locate(S.SOURCE_BY_KEY[src_key])
    if not path:
        print("missing source %s - run pipeline/fetch.py" % src_key, file=sys.stderr)
        return None

    t0 = time.time()
    z = zipfile.ZipFile(path)
    print("[%s] reading DBF" % layer)
    ids = read_dbf_field(z, id_field)
    wanted = ontario_codes(layer.upper())
    if wanted:
        keep = set(i for i, c in enumerate(ids) if c in wanted)
    else:
        print("  (no database yet - falling back to a province-code prefix test)")
        keep = set(i for i, c in enumerate(ids) if c.startswith(ONT))
    print("  %d records, %d in Ontario" % (len(ids), len(keep)))
    if not keep:
        print("  ! nothing selected; DBF %s values look like %s"
              % (id_field, ids[:3]))
        return None

    print("  streaming SHP, tolerance %.0f m" % tol)
    features = []
    pts_in = pts_out = done = 0
    with z.open("%s.shp" % stem) as fh:
        for idx, rings in iter_shapes(fh, keep):
            done += 1
            if done % 200 == 0:
                sys.stdout.write("\r  %d/%d" % (done, len(keep)))
                sys.stdout.flush()

            areas = [ring_area(r) for r in rings]
            biggest = (max(range(len(rings)), key=lambda k: areas[k])
                       if rings else None)

            out_rings = []
            for k, ring in enumerate(rings):
                pts_in += len(ring)
                # Every area must survive, however small. Several First Nations
                # reserves and downtown tracts are smaller than the island
                # threshold, and dropping them would leave holes in the map
                # exactly where the data is most worth showing.
                if areas[k] < min_area and k != biggest:
                    continue
                simp = douglas_peucker(ring, tol if k != biggest else tol / 2)
                if len(simp) < 4:
                    if k != biggest:
                        continue
                    simp = douglas_peucker(ring, tol / 20)
                    if len(simp) < 4:
                        simp = ring[:]
                if simp[0] != simp[-1]:
                    simp.append(simp[0])
                pts_out += len(simp)
                out_rings.append([[round(v, 5) for v in inverse_lcc(x, y)]
                                  for x, y in simp])
            if not out_rings:
                print("\n  ! no geometry survived for %s" % ids[idx])
                continue
            features.append({
                "type": "Feature",
                "properties": {"id": ids[idx]},
                "geometry": {
                    "type": "Polygon" if len(out_rings) == 1 else "MultiPolygon",
                    "coordinates": (out_rings if len(out_rings) == 1
                                    else [[r] for r in out_rings])},
            })

    src = S.SOURCE_BY_KEY[src_key]
    fc = {"type": "FeatureCollection",
          "properties": {"source": src.title, "cite": src.cite,
                         "tolerance_m": tol, "crs": "EPSG:4326 (WGS 84)"},
          "features": features}

    os.makedirs(APPDATA, exist_ok=True)
    out = os.path.join(APPDATA, out_name or ("boundaries_%s.json" % layer))
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(fc, fh, separators=(",", ":"))

    print("\r  %d/%d done" % (done, len(keep)))
    print("  wrote %s - %d areas, %d -> %d vertices (%.1f%% kept), %.1f MB, %.0fs"
          % (os.path.basename(out), len(features), pts_in, pts_out,
             100.0 * pts_out / max(pts_in, 1),
             os.path.getsize(out) / 1048576.0, time.time() - t0))
    return out


def main(argv):
    tol = None
    if "--tolerance" in argv:
        i = argv.index("--tolerance")
        tol = float(argv[i + 1])
        argv = argv[:i] + argv[i + 2:]
    layers = [a for a in argv if a in LAYERS] or ["csd", "ct"]
    for layer in layers:
        build_layer(layer, tol)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
