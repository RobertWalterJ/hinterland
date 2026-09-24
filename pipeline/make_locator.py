"""Build the locator basemap: app/data/locator.json.

WHY THIS FILE EXISTS
Robert played the quiz on his phone and hit the obvious wall: "Which of these
is a factory town? Dysart et al / Cramahe / North Kawartha" - and he does not
know where any of them are. Nor would anyone. A question about a place is not
answerable, and barely learnable, without knowing where the place is.

The app already ships boundaries_csd.json, but it is 286 KB gzipped and audit 6
deliberately took it OFF the boot path. Pulling it back for a two-inch map at
the top of every question would undo that. So this builds a purpose-made
basemap instead: the outline of Ontario and its lakes, and nothing else.

HOW, AND WHY NOT THE OBVIOUS WAY
The 577 census subdivisions tile the province, so the union's boundary ought to
be every edge that belongs to exactly one of them. That was tried first and it
does not work: in the unorganised north the polygons do not quite meet, so
thousands of interior borders survive as "single" edges and the map comes out
scribbled over with municipal lines. Insisting the stitched chains close
instead threw away seven eighths of the coastline.

So the outline is traced from a RASTER. Every subdivision is scanline-filled
onto a grid of about 1.5 km cells; the result is one binary land mask in which
interior borders do not exist and sub-cell gaps close themselves. The boundary
between land and water cells is stitched into chains and thinned with
Douglas-Peucker. Pure standard library: no geometry package, no projection.

Anchors are the places a reader can locate something against. They are chosen
from the data - the largest cities, forced apart so the list spans the province
rather than crowding the Golden Horseshoe - never typed out by hand.

Run:  python pipeline/make_locator.py
"""
import io
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app", "data")

# The grid is the resolution of everything this file makes, and it has to be
# fine enough for the CLOSEST the quiz ever zooms in - about 95 km across a
# phone screen, which is 1 km to 10 pixels. At 0.02 degrees the outlines were
# 2 km a vertex, and once the renderer smoothed the staircase out of them
# Lake Simcoe came back as a blob. Halving the cell costs four times the
# raster work at build time, once, and about 12 KB on the wire.
CELL = 0.01          # degrees; about 1.1 km north-south
SIMPLIFY = 0.014     # degrees; Douglas-Peucker tolerance
KEEP_CHAIN = 10      # a chain shorter than this is a pixel, not an island
ANCHORS = 14
ANCHOR_APART_KM = 70


def rings_of(geom):
    t = geom.get("type")
    if t == "Polygon":
        return [list(geom["coordinates"])]
    if t == "MultiPolygon":
        return [list(p) for p in geom["coordinates"]]
    return []


def rasterise(features, x0, y0, nx, ny):
    """One bit per cell: is there any municipality here?"""
    land = bytearray(nx * ny)
    for f in features:
        for poly in rings_of(f.get("geometry") or {}):
            ys = [c[1] for ring in poly for c in ring]
            r0 = max(0, int((min(ys) - y0) / CELL))
            r1 = min(ny - 1, int((max(ys) - y0) / CELL) + 1)
            for r in range(r0, r1 + 1):
                yc = y0 + (r + 0.5) * CELL
                xs = []
                for ring in poly:
                    for i in range(len(ring) - 1):
                        ax, ay = ring[i]
                        bx, by = ring[i + 1]
                        if (ay > yc) == (by > yc):
                            continue
                        xs.append(ax + (yc - ay) * (bx - ax) / (by - ay))
                if not xs:
                    continue
                xs.sort()
                base = r * nx
                for k in range(0, len(xs) - 1, 2):
                    c0 = int(math.ceil((xs[k] - x0) / CELL - 0.5))
                    c1 = int(math.floor((xs[k + 1] - x0) / CELL - 0.5))
                    if c1 < 0 or c0 >= nx:
                        continue
                    for c in range(max(0, c0), min(nx - 1, c1) + 1):
                        land[base + c] = 1
    return land


def rasterise_ids(features, id_of, x0, y0, nx, ny):
    """Like rasterise, but each cell keeps WHICH area covers it.

    Counties, drawn from the same raster as the coastline, so a county line
    and the shore can never disagree by a pixel. Robert asked for county or
    municipal boundaries after the first map: an outline of Ontario with two
    dots on it gives an inland place nothing to sit in, and "which county am
    I looking at" is the question a planner asks first.
    """
    grid = [0] * (nx * ny)
    for f in features:
        v = id_of(f)
        if not v:
            continue
        for poly in rings_of(f.get("geometry") or {}):
            ys = [c[1] for ring in poly for c in ring]
            r0 = max(0, int((min(ys) - y0) / CELL))
            r1 = min(ny - 1, int((max(ys) - y0) / CELL) + 1)
            for r in range(r0, r1 + 1):
                yc = y0 + (r + 0.5) * CELL
                xs = []
                for ring in poly:
                    for i in range(len(ring) - 1):
                        ax, ay = ring[i]
                        bx, by = ring[i + 1]
                        if (ay > yc) == (by > yc):
                            continue
                        xs.append(ax + (yc - ay) * (bx - ax) / (by - ay))
                if not xs:
                    continue
                xs.sort()
                base = r * nx
                for k in range(0, len(xs) - 1, 2):
                    c0 = int(math.ceil((xs[k] - x0) / CELL - 0.5))
                    c1 = int(math.floor((xs[k + 1] - x0) / CELL - 0.5))
                    if c1 < 0 or c0 >= nx:
                        continue
                    for c in range(max(0, c0), min(nx - 1, c1) + 1):
                        grid[base + c] = v
    return grid


def inner_edges(grid, nx, ny):
    """Where two different areas meet. Not where an area meets the water:
    that line is the coast, and it is already drawn."""
    out = []
    for r in range(ny):
        base = r * nx
        for c in range(nx):
            v = grid[base + c]
            if not v:
                continue
            if c + 1 < nx and grid[base + c + 1] and grid[base + c + 1] != v:
                out.append(((c + 1, r), (c + 1, r + 1)))
            if r + 1 < ny and grid[base + nx + c] and grid[base + nx + c] != v:
                out.append(((c, r + 1), (c + 1, r + 1)))
    return out


def chains_to_deg(chains, x0, y0, tol, keep=3):
    out = []
    for ch in chains:
        deg = [[x0 + c * CELL, y0 + r * CELL] for c, r in ch]
        thin = douglas_peucker(deg, tol)
        if len(thin) < keep:
            continue
        out.append([[round(q[0], 3), round(q[1], 3)] for q in thin])
    out.sort(key=lambda L: -len(L))
    return out


def edges_of(land, nx, ny):
    """The unit edges between a land cell and water. Always closed curves."""
    out = []
    for r in range(ny):
        base = r * nx
        for c in range(nx):
            if not land[base + c]:
                continue
            if c == 0 or not land[base + c - 1]:
                out.append(((c, r), (c, r + 1)))
            if c == nx - 1 or not land[base + c + 1]:
                out.append(((c + 1, r), (c + 1, r + 1)))
            if r == 0 or not land[base - nx + c]:
                out.append(((c, r), (c + 1, r)))
            if r == ny - 1 or not land[base + nx + c]:
                out.append(((c, r + 1), (c + 1, r + 1)))
    return out


def stitch(edges):
    adj = {}
    for a, b in edges:
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    used = set()
    chains = []
    for start in adj:
        for nxt in adj[start]:
            key = (start, nxt) if start < nxt else (nxt, start)
            if key in used:
                continue
            used.add(key)
            chain = [start, nxt]
            prev, here = start, nxt
            while True:
                step = None
                for cand in adj.get(here, []):
                    if cand == prev:
                        continue
                    k = (here, cand) if here < cand else (cand, here)
                    if k in used:
                        continue
                    step = (cand, k)
                    break
                if not step:
                    break
                used.add(step[1])
                prev, here = here, step[0]
                chain.append(here)
                if here == chain[0]:
                    break
            if len(chain) >= KEEP_CHAIN:
                chains.append(chain)
    return chains


def douglas_peucker(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = pts[i]
        bx, by = pts[j]
        dx, dy = bx - ax, by - ay
        den = math.hypot(dx, dy)
        worst, wi = -1.0, -1
        for k in range(i + 1, j):
            px, py = pts[k]
            d = (abs(dy * px - dx * py + bx * ay - by * ax) / den if den
                 else math.hypot(px - ax, py - ay))
            if d > worst:
                worst, wi = d, k
        if wi > 0 and worst > tol:
            keep[wi] = True
            stack.append((i, wi))
            stack.append((wi, j))
    return [p for p, k in zip(pts, keep) if k]


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = (math.sin((la2 - la1) / 2) ** 2 +
         math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)
    return 2 * 6371.0 * math.asin(min(1.0, math.sqrt(h)))


def main():
    bnd = json.load(io.open(os.path.join(APP, "boundaries_csd.json"),
                            encoding="utf-8"))
    xs, ys = [], []
    for f in bnd["features"]:
        for poly in rings_of(f.get("geometry") or {}):
            for ring in poly:
                for c in ring:
                    xs.append(c[0])
                    ys.append(c[1])
    x0, x1 = min(xs) - CELL, max(xs) + CELL
    y0, y1 = min(ys) - CELL, max(ys) + CELL
    nx = int((x1 - x0) / CELL) + 1
    ny = int((y1 - y0) / CELL) + 1

    land = rasterise(bnd["features"], x0, y0, nx, ny)
    chains = stitch(edges_of(land, nx, ny))

    lines, before, after = [], 0, 0
    for ch in chains:
        deg = [[x0 + c * CELL, y0 + r * CELL] for c, r in ch]
        before += len(deg)
        thin = douglas_peucker(deg, SIMPLIFY)
        if len(thin) < 3:
            continue
        after += len(thin)
        lines.append([[round(p[0], 3), round(p[1], 3)] for p in thin])
    lines.sort(key=lambda L: -len(L))

    geo = json.load(io.open(os.path.join(APP, "geo.json"), encoding="utf-8"))
    ix = {n: i for i, n in enumerate(geo["fields"])}

    # ------------------------------------------------------------ counties
    cd_of = {}
    density = {}
    for row in geo["places"]:
        code, lvl = row[ix["code"]], row[ix["level"]]
        if lvl == "CSD":
            cd_of[code] = row[ix["cd"]]
        pop, area = row[ix["pop2021"]], row[ix["area_km2"]]
        if pop and area:
            density[code] = pop / area
    cd_list = sorted(set(v for v in cd_of.values() if v))
    cd_num = {cd: i + 1 for i, cd in enumerate(cd_list)}
    cd_grid = rasterise_ids(
        bnd["features"],
        lambda f: cd_num.get(cd_of.get(f["properties"].get("id"), ""), 0),
        x0, y0, nx, ny)
    # Counties are shipped TWICE, because they do two jobs.
    #
    # county_of, below, is each county as a closed shape: that is what gets
    # filled when a question is about a county or a place inside one.
    #
    # county_lines is only the boundaries BETWEEN counties - the edges where
    # land meets land. Where a county's edge is the shore, the coastline
    # already draws it, and drawing it again lays a second line a cell inside
    # the first: a faint double coastline, which is half of what made these
    # look wonky. A boundary that is a shoreline is a shoreline.
    county_lines = chains_to_deg(stitch(inner_edges(cd_grid, nx, ny)),
                                 x0, y0, SIMPLIFY, keep=4)

    # where each county's name can be written: the middle of its own cells
    sums = {}
    for r in range(ny):
        base = r * nx
        for c in range(nx):
            v = cd_grid[base + c]
            if not v:
                continue
            t = sums.setdefault(v, [0, 0, 0])
            t[0] += c
            t[1] += r
            t[2] += 1
    counties = []
    for cd, n in cd_num.items():
        t = sums.get(n)
        name = geo["cd_names"].get(cd)
        if not t or not name or t[2] < 20:
            continue
        counties.append({"cd": cd, "name": name,
                         "lon": round(x0 + (t[0] / t[2]) * CELL, 3),
                         "lat": round(y0 + (t[1] / t[2]) * CELL, 3),
                         "cells": t[2]})

    # Each county as its own shape, so the map can fill the one the question
    # is about rather than leaving a dot where a whole county is meant. Traced
    # from the same grid, inside each county's own bounding box, which is what
    # keeps 49 traces cheap.
    boxes = {}
    for r in range(ny):
        base = r * nx
        for c in range(nx):
            v = cd_grid[base + c]
            if not v:
                continue
            b = boxes.get(v)
            if b is None:
                boxes[v] = [c, r, c, r]
            else:
                if c < b[0]: b[0] = c
                if r < b[1]: b[1] = r
                if c > b[2]: b[2] = c
                if r > b[3]: b[3] = r
    county_of = {}
    for cd, n in cd_num.items():
        b = boxes.get(n)
        if not b:
            continue
        w = b[2] - b[0] + 3
        h = b[3] - b[1] + 3
        sub = bytearray(w * h)
        for r in range(b[1], b[3] + 1):
            base = r * nx
            srow = (r - b[1] + 1) * w
            for c in range(b[0], b[2] + 1):
                if cd_grid[base + c] == n:
                    sub[srow + (c - b[0] + 1)] = 1
        chains = stitch(edges_of(sub, w, h))
        shape = chains_to_deg(
            [[(c + b[0] - 1, r + b[1] - 1) for c, r in ch] for ch in chains],
            x0, y0, SIMPLIFY, keep=4)
        if shape:
            county_of[cd] = shape[:4]

    # -------------------------------------------------------- built-up areas
    # Statistics Canada calls a place a POPULATION CENTRE at 400 people per
    # square kilometre. The same threshold is applied here, to census tracts
    # where there are any - they are small enough to separate a town from the
    # fields around it - and to whole municipalities elsewhere. The result is
    # not a survey of the built form: it is where the people are, at the
    # finest grain the payloads carry, and it is drawn as a tint rather than
    # a boundary because that is what it deserves.
    # CENSUS TRACTS ONLY. The first version fell back to whole municipalities
    # wherever there are no tracts, which drew a township's entire legal
    # boundary as though it were a built-up area: triangles and wedges in the
    # middle of farmland, which is exactly what Robert called arbitrary. A
    # tract is small enough to separate a town from the fields around it; a
    # township is not. Outside the metropolitan areas there are no tracts, so
    # nothing is drawn - which is honest, and better than a shape that says
    # something untrue.
    URBAN = 400.0
    tracts = 0
    urban = []
    ct_path = os.path.join(APP, "boundaries_ct.json")
    if os.path.exists(ct_path):
        ct = json.load(io.open(ct_path, encoding="utf-8"))
        dense_ct = [f for f in ct["features"]
                    if density.get(f["properties"].get("id"), 0) >= URBAN]
        tracts = len(dense_ct)
        g2 = rasterise_ids(dense_ct, lambda f: 1, x0, y0, nx, ny)
        urban_mask = bytearray(1 if v else 0 for v in g2)
        urban = chains_to_deg(stitch(edges_of(urban_mask, nx, ny)),
                              x0, y0, SIMPLIFY * 0.6, keep=10)

    cities = []
    for row in geo["places"]:
        if row[ix["level"]] != "CSD":
            continue
        # A reader navigates by cities. Taking the most populous
        # MUNICIPALITIES picked Haldimand County, which is populous, well
        # spread and no use at all for saying where somewhere is. "City" is a
        # legal status in the boundary file, so the rule is still read from
        # the data - but it is spelt several ways: CY is the ordinary one, C
        # the single-tier amalgamations (Toronto, Hamilton), CV the bilingual
        # ones (Ottawa, Greater Sudbury). Leave any out and the map loses the
        # city the reader knows best.
        if row[ix["csd_type"]] not in ("CY", "C", "CV", "V"):
            continue
        pop, lat, lon = row[ix["pop2021"]], row[ix["lat"]], row[ix["lon"]]
        if not pop or lat is None or lon is None:
            continue
        cities.append({"code": row[ix["code"]], "name": row[ix["name"]],
                       "pop": pop, "lat": lat, "lon": lon})
    cities.sort(key=lambda p: -p["pop"])

    anchors = []
    for p in cities:
        if len(anchors) >= ANCHORS:
            break
        if all(km((p["lat"], p["lon"]), (q["lat"], q["lon"])) >= ANCHOR_APART_KM
               for q in anchors):
            anchors.append(p)

    # ------------------------------------------------------------ water
    # The only place names in this project that are typed rather than read
    # from a payload. Statistics Canada's boundary file knows where the land
    # stops; it does not know that the water on the other side is called Lake
    # Ontario. A map of a place with no water named is the thing Robert
    # called confusing: "Cramahe, on a grey shape" tells you nothing, "Cramahe
    # on the north shore of Lake Ontario" tells you everything.
    #
    # Each label is checked against the raster below: if a name lands on the
    # land mask it is wrong, and the build says so rather than drawing it.
    WATER = [
        ("Lake Ontario", 43.62, -78.00),
        ("Lake Erie", 42.20, -81.20),
        ("Lake Huron", 44.70, -82.40),
        ("Georgian Bay", 45.35, -81.00),
        ("Lake Superior", 47.90, -87.50),
        ("Lake Nipigon", 49.80, -88.50),
        ("James Bay", 53.50, -80.60),
        ("Hudson Bay", 56.00, -87.00),
        ("Lake Simcoe", 44.42, -79.35),
        ("Lake St Clair", 42.42, -82.65),
        ("Lake Nipissing", 46.28, -79.85),
        ("Ottawa River", 45.60, -76.60),
        ("St Lawrence River", 44.55, -75.60)
    ]
    water, bad = [], []
    for name, la, lo in WATER:
        c = int((lo - x0) / CELL)
        r = int((la - y0) / CELL)
        wet = not (0 <= c < nx and 0 <= r < ny and land[r * nx + c])
        (water if wet else bad).append(
            {"name": name, "lat": la, "lon": lo})
    if bad:
        print("  WATER LABELS ON LAND (not shipped): " +
              ", ".join(b["name"] for b in bad))

    doc = {
        "built_from": bnd.get("properties", {}).get("cite", ""),
        "note": ("Outline of Ontario traced from a %.2f degree raster of the "
                 "577 census subdivisions and thinned to %.3f degrees. For "
                 "locating a place, not for measurement." % (CELL, SIMPLIFY)),
        "cell_deg": CELL,
        "bbox": [round(x0, 3), round(y0, 3), round(x1, 3), round(y1, 3)],
        "lines": lines,
        "counties": county_lines,
        "county_names": counties,
        "county_of": county_of,
        "urban": urban,
        "water": water,
        "anchors": [{"code": a["code"], "name": a["name"], "pop": a["pop"],
                     "lat": round(a["lat"], 4), "lon": round(a["lon"], 4)}
                    for a in anchors]
    }
    dst = os.path.join(APP, "locator.json")
    io.open(dst, "w", encoding="utf-8", newline="").write(
        json.dumps(doc, separators=(",", ":")))

    import zlib
    raw = os.path.getsize(dst)
    gz = len(zlib.compress(io.open(dst, "rb").read(), 9))
    print("raster %d x %d cells, %d land" % (nx, ny, sum(land)))
    print("locator.json: %d chains, %d points (from %d), %d anchors" % (
        len(lines), after, before, len(anchors)))
    print("  %.0f KB raw, %.0f KB gzipped" % (raw / 1024.0, gz / 1024.0))
    print("  anchors: " + ", ".join(a["name"] for a in doc["anchors"]))
    print("  water labels: %d of %d placed in water" % (len(water), len(WATER)))
    print("  counties: %d named, %d shaped, %d inland boundaries; "
          "built-up: %d shapes (%d dense tracts)"
          % (len(counties), len(county_of), len(county_lines), len(urban),
             tracts))


if __name__ == "__main__":
    main()
