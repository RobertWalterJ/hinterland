"""Build data/analyst.db from the raw sources.

Order matters: geography first, because everything else is keyed to it, then
the two employment bases, then the supporting layers.

Run:  python pipeline/build.py
"""
import csv
import io
import os
import sqlite3
import sys
import zipfile
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "data", "raw")
DB = os.path.join(ROOT, "data", "analyst.db")

sys.path.insert(0, HERE)
import sources as S      # noqa: E402
import io_concordance as IOC  # noqa: E402
import fetch as F        # noqa: E402
import parse_sdmx as P   # noqa: E402

ONT = "35"
CSV_LIMIT = 10_000_000
csv.field_size_limit(CSV_LIMIT)

# NAICS 2017 sector codes, in the order the census publishes them.
NAICS = [
    ("11", "Agriculture, forestry, fishing and hunting", "Agriculture & resources", "goods"),
    ("21", "Mining, quarrying, and oil and gas extraction", "Mining & oil/gas", "goods"),
    ("22", "Utilities", "Utilities", "goods"),
    ("23", "Construction", "Construction", "goods"),
    ("31-33", "Manufacturing", "Manufacturing", "goods"),
    ("41", "Wholesale trade", "Wholesale", "trade & logistics"),
    ("44-45", "Retail trade", "Retail", "trade & logistics"),
    ("48-49", "Transportation and warehousing", "Transport & warehousing", "trade & logistics"),
    ("51", "Information and cultural industries", "Information & culture", "knowledge"),
    ("52", "Finance and insurance", "Finance & insurance", "knowledge"),
    ("53", "Real estate and rental and leasing", "Real estate", "knowledge"),
    ("54", "Professional, scientific and technical services", "Professional services", "knowledge"),
    ("55", "Management of companies and enterprises", "Management of companies", "knowledge"),
    ("56", "Administrative and support, waste management and remediation services",
     "Admin & waste services", "knowledge"),
    ("61", "Educational services", "Education", "public & institutional"),
    ("62", "Health care and social assistance", "Health & social", "public & institutional"),
    ("71", "Arts, entertainment and recreation", "Arts & recreation", "consumer services"),
    ("72", "Accommodation and food services", "Accommodation & food", "consumer services"),
    ("81", "Other services (except public administration)", "Other services", "consumer services"),
    ("91", "Public administration", "Public administration", "public & institutional"),
]
NAICS_CODES = [c for c, _, _, _ in NAICS]

SAC_LABEL = {
    "1": "Census metropolitan area",
    "2": "Census agglomeration with tracts",
    "3": "Census agglomeration without tracts",
    "4": "Strong metropolitan influenced zone",
    "5": "Moderate metropolitan influenced zone",
    "6": "Weak metropolitan influenced zone",
    "7": "No metropolitan influence",
    "8": "Territories outside a CA",
}


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

def log(msg):
    print(msg, flush=True)


def open_zip_csv(path, exclude=("meta",), encoding="utf-8-sig"):
    z = zipfile.ZipFile(path)
    names = [i.filename for i in z.infolist()
             if i.filename.lower().endswith(".csv")
             and not any(x in i.filename.lower() for x in exclude)]
    if not names:
        raise IOError("no data CSV in %s" % path)
    f = io.TextIOWrapper(z.open(names[0]), encoding=encoding, errors="replace")
    return csv.reader(f)


def num(s):
    if s is None:
        return None
    s = s.strip().replace(",", "")
    if s in ("", "..", "...", "F", "x", "X", "D", "E", "..."):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def naics_from_label(label):
    """Pull the NAICS sector code out of a Statistics Canada industry label.

    Two conventions are in play across the tables used here. The census tables
    lead with the code - '31-33 Manufacturing'. The business-counts table
    trails it in brackets - 'Manufacturing [31-33]'. Both are handled, and the
    bracketed form is checked first because 'Total, all industries [1]' would
    otherwise be read as a sector.
    """
    label = (label or "").strip()
    if label.endswith("]") and "[" in label:
        inner = label[label.rfind("[") + 1:-1].strip()
        if inner in NAICS_CODES:
            return inner
    if label.lower().startswith("total"):
        return "TOTAL"
    head = label.split(" ", 1)[0]
    return head if head in NAICS_CODES else None


def path_for(key):
    src = S.SOURCE_BY_KEY[key]
    p = F.locate(src)
    if not p:
        raise IOError("missing source %s - run pipeline/fetch.py" % key)
    return p


# --------------------------------------------------------------------------- #
# schema
# --------------------------------------------------------------------------- #

SCHEMA = """
DROP TABLE IF EXISTS source_meta;
CREATE TABLE source_meta (
    key TEXT PRIMARY KEY, title TEXT, url TEXT, purpose TEXT,
    caveats TEXT, vintage TEXT, cite TEXT, built_at TEXT, rows_loaded INTEGER);

DROP TABLE IF EXISTS naics;
CREATE TABLE naics (
    code TEXT PRIMARY KEY, name TEXT, short_name TEXT,
    grp TEXT, sort_order INTEGER);

DROP TABLE IF EXISTS geo;
CREATE TABLE geo (
    code TEXT PRIMARY KEY,
    level TEXT NOT NULL,          -- CA | PR | ER | CD | CSD | CMA | CT
    name TEXT,
    csd_type TEXT,
    cd_code TEXT, cd_name TEXT,
    er_code TEXT, er_name TEXT,
    cma_code TEXT, cma_name TEXT, cma_type TEXT,
    sac_type TEXT, sac_label TEXT,
    pop_2021 INTEGER,
    dwellings_2021 INTEGER,
    area_km2 REAL,
    lat REAL, lon REAL,
    is_ontario INTEGER);
CREATE INDEX geo_level ON geo(level, is_ontario);

DROP TABLE IF EXISTS ct_csd;
CREATE TABLE ct_csd (
    ct_code TEXT, csd_code TEXT, pop INTEGER, share REAL,
    is_primary INTEGER,
    PRIMARY KEY (ct_code, csd_code));

DROP TABLE IF EXISTS employment;
CREATE TABLE employment (
    geo_code TEXT NOT NULL,
    year INTEGER NOT NULL,
    naics TEXT NOT NULL,
    basis TEXT NOT NULL,          -- work | residence
    measure TEXT NOT NULL,        -- total | home | usual
    jobs REAL,
    PRIMARY KEY (geo_code, year, naics, basis, measure));
CREATE INDEX emp_lookup ON employment(basis, measure, year, naics);

DROP TABLE IF EXISTS ct_population;
CREATE TABLE ct_population (
    geo_code TEXT PRIMARY KEY,
    pop_2021 REAL, pop_2016 REAL,
    dwellings REAL, area_km2 REAL, density REAL);

DROP TABLE IF EXISTS population;
CREATE TABLE population (
    geo_code TEXT, year INTEGER, population REAL,
    PRIMARY KEY (geo_code, year));

DROP TABLE IF EXISTS commute;
CREATE TABLE commute (
    origin_code TEXT, dest_code TEXT, year INTEGER, workers REAL,
    PRIMARY KEY (origin_code, dest_code, year));

DROP TABLE IF EXISTS business_counts;
CREATE TABLE business_counts (
    geo_code TEXT, naics TEXT, size_band TEXT, establishments REAL,
    ref_date TEXT,
    PRIMARY KEY (geo_code, naics, size_band));

DROP TABLE IF EXISTS population_components;
CREATE TABLE population_components (
    geo_code TEXT NOT NULL,         -- census division
    year     INTEGER NOT NULL,
    component TEXT NOT NULL,
    value    REAL,
    vintage  TEXT NOT NULL,         -- which boundary/definition series
    PRIMARY KEY (geo_code, year, component, vintage));
CREATE INDEX comp_lookup ON population_components(geo_code, year);

DROP TABLE IF EXISTS io_summary;
CREATE TABLE io_summary (
    geo_code TEXT, year INTEGER, io_code TEXT, industry TEXT,
    variable TEXT, mult_type TEXT, coverage TEXT, value REAL,
    PRIMARY KEY (geo_code, year, io_code, variable, mult_type, coverage));

DROP TABLE IF EXISTS io_multiplier;
CREATE TABLE io_multiplier (
    geo_code TEXT, year INTEGER, industry TEXT, io_code TEXT,
    mult_type TEXT, variable TEXT, coverage TEXT, value REAL);
"""


def init_db():
    if os.path.exists(DB):
        os.remove(DB)
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    con.executemany(
        "INSERT INTO naics (code,name,short_name,grp,sort_order) VALUES (?,?,?,?,?)",
        [(c, n, s, g, i) for i, (c, n, s, g) in enumerate(NAICS)])
    con.commit()
    return con


def record_source(con, key, rows, extra_cite=None):
    src = S.SOURCE_BY_KEY.get(key)
    if src is None:
        con.execute("INSERT OR REPLACE INTO source_meta VALUES (?,?,?,?,?,?,?,?,?)",
                    (key, key, "", "", "", "", extra_cite or "",
                     datetime.now(timezone.utc).isoformat(timespec="seconds"), rows))
        return
    con.execute("INSERT OR REPLACE INTO source_meta VALUES (?,?,?,?,?,?,?,?,?)",
                (src.key, src.title, src.url, src.purpose, src.caveats,
                 src.vintage, src.cite,
                 datetime.now(timezone.utc).isoformat(timespec="seconds"), rows))
    con.commit()


# --------------------------------------------------------------------------- #
# 1. geography spine, from the dissemination-block attribute file
# --------------------------------------------------------------------------- #

def centroid(d):
    """Population-weighted where possible, area-weighted where not.

    Weighting by population puts the marker where people actually are, which
    for a large rural township is nowhere near its geometric middle. It is only
    undefined when nobody was counted - see the note at the accumulator - and
    the area-weighted mean is the honest fallback there rather than leaving the
    place unmappable.
    """
    if d.get("w"):
        return (d["lat_w"] / d["w"], d["lon_w"] / d["w"])
    if d.get("a"):
        return (d["lat_a"] / d["a"], d["lon_a"] / d["a"])
    return (None, None)


def build_geography(con):
    """Aggregate dissemination blocks up to every geography the tool uses.

    The attribute file is the only source that carries the full nesting -
    block to CSD to CD to ER to CMA to CT - in one place, along with block
    population, dwellings and land area. Aggregating up from blocks means the
    population and area denominators are internally consistent at every level,
    and it produces the census-tract to municipality correspondence for free.
    """
    log("geography: reading dissemination-block attribute file")
    rd = open_zip_csv(path_for("geo_attribute"), encoding="latin-1")
    hdr = next(rd)
    ix = dict((h.split("_")[0], i) for i, h in enumerate(hdr))

    def g(row, key):
        return row[ix[key]].strip() if key in ix else ""

    csd, cd, er, cma, ct = {}, {}, {}, {}, {}
    ct_csd_pop = {}
    n = 0

    for row in rd:
        if len(row) < len(hdr) - 2:
            continue
        if g(row, "PRUID") != ONT:
            continue
        n += 1
        pop = num(g(row, "DBPOP2021")) or 0.0
        dw = num(g(row, "DBTDWELL2021")) or 0.0
        area = num(g(row, "DBAREA2021")) or 0.0   # square kilometres

        csduid = g(row, "CSDUID")
        cduid = g(row, "CDUID")
        eruid = g(row, "ERUID")
        cmauid = g(row, "CMAUID")
        ctuid = g(row, "CTUID")

        if csduid:
            d = csd.setdefault(csduid, {
                "name": g(row, "CSDNAME"), "csd_type": g(row, "CSDTYPE"),
                "cd_code": cduid, "cd_name": g(row, "CDNAME"),
                "er_code": eruid, "er_name": g(row, "ERNAME"),
                "cma_code": cmauid, "cma_name": g(row, "CMANAME"),
                "cma_type": g(row, "CMATYPE"),
                "sac_type": g(row, "SACTYPE"),
                "pop": 0.0, "dw": 0.0, "area": 0.0,
                "lat_w": 0.0, "lon_w": 0.0, "w": 0.0,
                "lat_a": 0.0, "lon_a": 0.0, "a": 0.0})
            d["pop"] += pop
            d["dw"] += dw
            d["area"] += area
            la, lo = num(g(row, "DARPLAT")), num(g(row, "DARPLONG"))
            if la and lo:
                if pop > 0:
                    d["lat_w"] += la * pop
                    d["lon_w"] += lo * pop
                    d["w"] += pop
                # A second, area-weighted centroid, used only where the first
                # cannot be computed. Twenty-three Ontario municipalities have
                # a 2021 population of zero - incompletely enumerated reserves,
                # mostly - and dividing by that population left them with no
                # location at all, which the desire-line map cannot work with.
                aw = area if area > 0 else 1.0
                d["lat_a"] += la * aw
                d["lon_a"] += lo * aw
                d["a"] += aw

        for store, code, name, extra in (
                (cd, cduid, g(row, "CDNAME"), {"cd_type": g(row, "CDTYPE")}),
                (er, eruid, g(row, "ERNAME"), {}),
                (cma, cmauid, g(row, "CMANAME"), {"cma_type": g(row, "CMATYPE")})):
            if not code:
                continue
            d = store.setdefault(code, dict({"name": name, "pop": 0.0, "dw": 0.0,
                                             "area": 0.0}, **extra))
            d["pop"] += pop
            d["dw"] += dw
            d["area"] += area

        # CMA codes 997-999 are Statistics Canada's residual "outside any CMA or
        # CA" pseudo-geography, and the tract identifier attached to them
        # (9935.00) collects all non-tracted territory in the province - 2.2
        # million people in one row. It is not a neighbourhood and must not
        # enter the tract layer.
        if ctuid and cmauid not in ("997", "998", "999") and len(ctuid) == 10:
            d = ct.setdefault(ctuid, {
                "name": g(row, "CTNAME") or ctuid,
                "cma_code": cmauid, "cma_name": g(row, "CMANAME"),
                "cd_code": cduid, "cd_name": g(row, "CDNAME"),
                "er_code": eruid, "er_name": g(row, "ERNAME"),
                "pop": 0.0, "dw": 0.0, "area": 0.0,
                "lat_w": 0.0, "lon_w": 0.0, "w": 0.0,
                "lat_a": 0.0, "lon_a": 0.0, "a": 0.0})
            d["pop"] += pop
            d["dw"] += dw
            d["area"] += area
            la, lo = num(g(row, "DARPLAT")), num(g(row, "DARPLONG"))
            if la and lo and pop > 0:
                d["lat_w"] += la * pop
                d["lon_w"] += lo * pop
                d["w"] += pop
            if csduid:
                key = (ctuid, csduid)
                ct_csd_pop[key] = ct_csd_pop.get(key, 0.0) + pop

    log("geography: %d Ontario blocks -> %d CSD, %d CD, %d ER, %d CMA/CA, %d CT"
        % (n, len(csd), len(cd), len(er), len(cma), len(ct)))

    rows = []
    for code, d in csd.items():
        rows.append((code, "CSD", d["name"], d["csd_type"], d["cd_code"], d["cd_name"],
                     d["er_code"], d["er_name"], d["cma_code"], d["cma_name"],
                     d["cma_type"], d["sac_type"], SAC_LABEL.get(d["sac_type"], ""),
                     int(d["pop"]), int(d["dw"]), d["area"],
                     centroid(d)[0], centroid(d)[1], 1))
    for code, d in cd.items():
        rows.append((code, "CD", d["name"], d.get("cd_type"), code, d["name"],
                     None, None, None, None, None, None, None,
                     int(d["pop"]), int(d["dw"]), d["area"], None, None, 1))
    for code, d in er.items():
        # Census division and economic region codes are both four digits and
        # they collide: 3510 is Frontenac as a CD and Ottawa as an ER, and five
        # more pairs collide the same way. The geo table has one primary key, so
        # economic regions are stored under an "ER" prefix and the bare code is
        # kept in er_code, which is what the membership lookups match on.
        rows.append(("ER" + code, "ER", d["name"], None, None, None,
                     code, d["name"], None, None, None, None, None,
                     int(d["pop"]), int(d["dw"]), d["area"], None, None, 1))
    for code, d in cma.items():
        rows.append((code, "CMA", d["name"], None, None, None, None, None,
                     code, d["name"], d.get("cma_type"), None, None,
                     int(d["pop"]), int(d["dw"]), d["area"], None, None, 1))
    for code, d in ct.items():
        rows.append((code, "CT", d["name"], None, d["cd_code"], d["cd_name"],
                     d["er_code"], d["er_name"], d["cma_code"], d["cma_name"],
                     None, None, None,
                     int(d["pop"]), int(d["dw"]), d["area"],
                     centroid(d)[0], centroid(d)[1], 1))
    rows.append((ONT, "PR", "Ontario", None, None, None, None, None, None, None,
                 None, None, None, None, None, None, None, None, 1))
    rows.append(("CA", "CA", "Canada", None, None, None, None, None, None, None,
                 None, None, None, None, None, None, None, None, 0))

    con.executemany("""INSERT OR REPLACE INTO geo
        (code,level,name,csd_type,cd_code,cd_name,er_code,er_name,cma_code,
         cma_name,cma_type,sac_type,sac_label,pop_2021,dwellings_2021,area_km2,
         lat,lon,is_ontario) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    rows)

    # census tract to municipality correspondence, by resident population
    tot = {}
    for (ctu, csdu), p in ct_csd_pop.items():
        tot[ctu] = tot.get(ctu, 0.0) + p
    best = {}
    for (ctu, csdu), p in ct_csd_pop.items():
        if p > best.get(ctu, (None, -1))[1]:
            best[ctu] = (csdu, p)
    cc = []
    for (ctu, csdu), p in ct_csd_pop.items():
        share = p / tot[ctu] if tot[ctu] > 0 else 0.0
        cc.append((ctu, csdu, int(p), share, 1 if best[ctu][0] == csdu else 0))
    con.executemany("INSERT OR REPLACE INTO ct_csd VALUES (?,?,?,?,?)", cc)
    con.commit()
    record_source(con, "geo_attribute", n)
    log("geography: %d census-tract/municipality correspondence rows" % len(cc))
    return set(csd), set(ct)


# --------------------------------------------------------------------------- #
# 2. employment - place of work (CSD and CD), and census tracts
# --------------------------------------------------------------------------- #

def _pow_rows(path, dguid_prefixes, code_from_dguid):
    """Yield (geo_code, naics, total, home, usual) for Total/Total/Total rows."""
    rd = open_zip_csv(path)
    hdr = next(rd)
    i_dg, i_ind = 2, 6
    i_wa, i_age, i_gen = 3, 4, 5
    i_tot, i_home, i_usual = 8, 10, 12
    for row in rd:
        if len(row) <= i_usual:
            continue
        if not row[i_wa].startswith("Total") or not row[i_age].startswith("Total") \
                or not row[i_gen].startswith("Total"):
            continue
        dg = row[i_dg]
        if not any(dg.startswith(p) for p in dguid_prefixes):
            continue
        code = code_from_dguid(dg)
        if code is None:
            continue
        nc = naics_from_label(row[i_ind])
        if nc is None:
            continue
        yield (code, nc, num(row[i_tot]), num(row[i_home]), num(row[i_usual]))


def load_pow_csd(con, ont_csds):
    """Place-of-work employment for Ontario municipalities, census divisions,
    the province and Canada.

    DGUID schemas: 2021A0005 = census subdivision, 2021A0003 = census division,
    2021A0002 = province, 2021A000011124 = Canada.
    """
    log("employment (place of work, municipal): parsing 98-10-0491")

    def code_of(dg):
        if dg.startswith("2021A0005"):
            return dg[9:]
        if dg.startswith("2021A0003"):
            return dg[9:]
        if dg.startswith("2021A0002"):
            return dg[9:]
        if dg.startswith("2021A00001"):
            return "CA"
        return None

    out, seen = [], 0
    for code, nc, tot, home, usual in _pow_rows(
            path_for("pow_industry_csd"),
            ("2021A0005", "2021A0003", "2021A0002", "2021A00001"), code_of):
        keep = (code == "CA" or code == ONT
                or code in ont_csds
                or (len(code) == 4 and code.startswith(ONT)))
        if not keep:
            continue
        seen += 1
        for measure, v in (("total", tot), ("home", home), ("usual", usual)):
            if v is not None:
                out.append((code, 2021, nc, "work", measure, v))
    con.executemany("INSERT OR REPLACE INTO employment VALUES (?,?,?,?,?,?)", out)
    con.commit()
    record_source(con, "pow_industry_csd", len(out))
    log("employment (place of work, municipal): %d rows from %d cells" % (len(out), seen))


def load_pow_ct(con, ont_cts):
    """Place-of-work employment for Ontario census tracts.

    DGUID schema 2021S0507 + CMAUID(3) + CT code(7). Ottawa-Gatineau straddles
    the provincial boundary, so tracts are kept only when the Ontario geography
    spine knows them - that filter is by construction correct, because the spine
    was built from Ontario blocks only.
    """
    log("employment (place of work, census tract): parsing 98-10-0492")

    def code_of(dg):
        if not dg.startswith("2021S0507"):
            return None
        return dg[9:]     # CMAUID + CT code, e.g. 5350001.00

    out, seen, skipped = [], 0, 0
    for code, nc, tot, home, usual in _pow_rows(
            path_for("pow_industry_ct"), ("2021S0507",), code_of):
        if code not in ont_cts:
            skipped += 1
            continue
        seen += 1
        for measure, v in (("total", tot), ("home", home), ("usual", usual)):
            if v is not None:
                out.append((code, 2021, nc, "work", measure, v))
    con.executemany("INSERT OR REPLACE INTO employment VALUES (?,?,?,?,?,?)", out)
    con.commit()
    record_source(con, "pow_industry_ct", len(out))
    log("employment (place of work, census tract): %d rows from %d cells "
        "(%d non-Ontario cells skipped)" % (len(out), seen, skipped))


def load_res_2021(con, ont_csds):
    """Residence-basis labour force by industry, 2021 - the series end point."""
    log("employment (residence, 2021): parsing 98-10-0456")
    rd = open_zip_csv(path_for("res_industry_2021"))
    hdr = next(rd)
    # Layout: REF_DATE, GEO, DGUID, <occupation>, <gender>, <industry>,
    # Coordinate, then place-of-work-status value columns.
    i_ind = None
    for i, h in enumerate(hdr):
        if "Industry" in h and "NAICS" in h:
            i_ind = i
    # Every place-of-work-status column, not just the total. The asymmetry
    # between this table and the place-of-work tables is the single most
    # consequential thing about this data:
    #
    #   98-10-0456 (residence)  Total = home + outside Canada + no fixed
    #                                   address + usual place of work
    #   98-10-0491 (place of work) Total = home + usual ONLY
    #
    # Statistics Canada says so in the footnotes of each. Workers with no fixed
    # workplace address cannot be assigned to a workplace geography, so they are
    # in one universe and not the other - 148,685 of them in Toronto alone.
    # Dividing one total by the other is not a jobs-to-residents ratio, it is a
    # comparison of two different populations, so both parts are loaded here and
    # the comparable subtotal is built downstream.
    MEASURE_OF = {
        "Total": "total", "Worked at home": "home",
        "Worked outside Canada": "outside",
        "No fixed workplace address": "nofixed",
        "Usual place of work": "usual",
    }
    value_cols = {}
    for i, h in enumerate(hdr):
        if not h.startswith("Place of work status"):
            continue
        label = h.split(":", 1)[1] if ":" in h else h
        label = label.split("[")[0].strip()
        if label.startswith("Total"):
            label = "Total"
        if label in MEASURE_OF:
            value_cols[i] = MEASURE_OF[label]
    if i_ind is None or not value_cols:
        raise IOError("unexpected layout in 98-10-0456: %s" % hdr)
    i_val = min(value_cols)
    others = [i for i in range(3, i_ind) if i != i_ind]

    def is_total(v):
        # The Statistics dimension labels its headline member 'Count' rather
        # than 'Total - ...'; every other dimension uses the Total convention.
        v = v.strip()
        return v.startswith("Total") or v == "Count"

    out, seen = [], 0
    for row in rd:
        if len(row) <= i_val:
            continue
        if any(not is_total(row[i]) for i in others):
            continue
        dg = row[2]
        if dg.startswith("2021A0005"):
            code = dg[9:]
        elif dg.startswith("2021A0002"):
            code = dg[9:]
        elif dg.startswith("2021A00001"):
            code = "CA"
        else:
            continue
        if not (code == "CA" or code == ONT or code in ont_csds):
            continue
        nc = naics_from_label(row[i_ind])
        if nc is None:
            continue
        got = False
        for col, measure in value_cols.items():
            if col >= len(row):
                continue
            v = num(row[col])
            if v is None:
                continue
            out.append((code, 2021, nc, "residence", measure, v))
            got = True
        if got:
            seen += 1
    con.executemany("INSERT OR REPLACE INTO employment VALUES (?,?,?,?,?,?)", out)
    con.commit()
    record_source(con, "res_industry_2021", len(out))
    log("employment (residence, 2021): %d rows" % seen)


def load_res_2016(con, ont_csds):
    """The 2016 leg of the series, on the employed labour force.

    This stage exists to close a definitional break. The 2021 leg counts the
    EMPLOYED labour force; the Census Profile legs count everyone who reported
    an industry, which also takes in unemployed people who last worked in one.
    Differencing the two put roughly the unemployment rate into the change -
    and not evenly, because unemployment incidence varies by industry, so the
    error landed squarely on the industry-mix and competitive terms that the
    whole decomposition is read for. Measured on Ontario 2016 the gap runs from
    3.0% in finance and health to 10.1% in mining, administrative services and
    the arts.

    98-400-X2016321 is the structural twin of 98-10-0456: same universe, same
    residence geography, same five place-of-work-status categories, same twenty
    sectors. Loading it makes 2016 and 2021 differenceable, which is the period
    the tool opens on. It also gives 2016 the home+usual subtotal, so the
    jobs-to-residents comparison can be made for that year too.

    The file is 8.4 GB of SDMX once open and is never written out: pipeline/
    parse_sdmx.py streams it from inside the zip and keeps the one cell in 165
    that is a total across occupation and sex.
    """
    src = S.SOURCE_BY_KEY["res_industry_2016"]
    path = F.fetch(src)
    member = "Generic_98-400-X2016321.xml"

    # NAICS12S: 1 is the total, 2..21 are the twenty sectors in NAICS order.
    order = [c for c in NAICS_CODES if c != "TOTAL"]
    if len(order) != 20:
        raise SystemExit("expected 20 NAICS sectors, got %d" % len(order))
    naics_by_id = dict((i + 2, order[i]) for i in range(20))
    naics_by_id[1] = "TOTAL"

    # PWStat: 3 (outside Canada) and 4 (no fixed workplace address) sit inside
    # the total but have no workplace geography - which is exactly the
    # distinction that made the jobs-to-residents ratio wrong once before, so
    # all five categories are kept and named as the 2021 loader names them.
    measure_by_id = {1: "total", 2: "home", 3: "outside", 4: "nofixed",
                     5: "usual"}

    concepts = [
        ("GEO", r'(01|35|35\d{2}|35\d{5})'),
        ("NOC16BRD", r'1'),
        ("Sex", r'1'),
        ("NAICS12S", r'(\d+)'),
        ("PWStat", r'(\d+)'),
    ]

    rows = []
    seen = set()
    state = {"n": 0}

    def on_row(g):
        geo, naics_id, pw_id, val = g
        m = measure_by_id.get(int(pw_id))
        if m is None:
            return
        naics = naics_by_id.get(int(naics_id))
        if naics is None:
            return
        # The SDMX code list numbers Canada "01"; the rest of the tool calls it
        # "CA". Ontario and its census divisions and subdivisions already carry
        # their Standard Geographical Classification codes.
        if geo == "01":
            geo = "CA"
        if not (geo in ont_csds or geo == ONT or geo == "CA"
                or (len(geo) == 4 and geo.startswith("35"))):
            return
        v = P.parse_value(val)
        if v is None:
            return
        seen.add(geo)
        rows.append((geo, 2016, naics, "residence", m, v))
        state["n"] += 1

    log("employment (residence, 2016): streaming %s" % src.filename)
    P.stream(path, member, concepts, on_row)
    con.executemany("INSERT OR REPLACE INTO employment VALUES (?,?,?,?,?,?)",
                    rows)
    con.commit()
    record_source(con, "res_industry_2016", len(rows))
    log("employment (residence, 2016): %d rows across %d geographies"
        % (len(rows), len(seen)))


def load_res_series(con, ont_csds):
    """Residence-basis labour force by industry for 2001, 2006, 2011 and 2016.

    These four vintages come from the Census Profile and NHS bulk files listed
    in sources.LEGACY_SERIES. They were extracted by the Ontario census-series
    loader and are carried here through data/legacy_residence_series.csv, which
    is written on first build and is the durable record - a rebuild needs only
    that file, not the original multi-gigabyte bulk downloads.
    """
    csvp = os.path.join(ROOT, "data", "legacy_residence_series.csv")
    rows = []

    if os.path.exists(csvp):
        log("employment (residence, 2001-2016): reading local series file")
        with open(csvp, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                rows.append((r["geo_code"], int(r["year"]), r["naics"],
                             "residence", "total", float(r["jobs"])))
    else:
        legacy = os.path.abspath(os.path.join(
            ROOT, "..", "CitySteps Mainstreet", "data", "mainstreet.db"))
        if not os.path.exists(legacy):
            log("employment (residence, 2001-2016): SKIPPED - neither "
                "data/legacy_residence_series.csv nor the Ontario census series "
                "database is present. Shift-share will be limited to 2021.")
            return
        log("employment (residence, 2001-2016): importing from the Ontario "
            "census series and writing the durable copy")
        lc = sqlite3.connect(legacy)
        q = ("SELECT geo_code, year, naics, jobs FROM employment "
             "WHERE basis='residence' AND pow_status='total' "
             "AND year IN (2001,2006,2011,2016) AND naics NOT IN ('TOTAL','NA')")
        keep = []
        for geo_code, year, naics, jobs in lc.execute(q):
            if naics not in NAICS_CODES:
                continue
            if not (geo_code in ont_csds or geo_code == ONT or geo_code == "CA"):
                continue
            if jobs is None:
                continue
            keep.append((geo_code, year, naics, float(jobs)))
            rows.append((geo_code, year, naics, "residence", "total", float(jobs)))
        with open(csvp, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["geo_code", "year", "naics", "jobs"])
            w.writerows(keep)
        log("employment (residence, 2001-2016): wrote %s (%d rows)"
            % (os.path.basename(csvp), len(keep)))

    con.executemany("INSERT OR REPLACE INTO employment VALUES (?,?,?,?,?,?)", rows)
    con.commit()
    for key, cite in S.LEGACY_SERIES:
        con.execute("INSERT OR REPLACE INTO source_meta VALUES (?,?,?,?,?,?,?,?,?)",
                    (key,
                     cite.split(" - ")[0] + " - " + cite.split(" - ")[1]
                     if " - " in cite else cite,
                     "https://www12.statcan.gc.ca/",
                     "Residence-basis labour force by NAICS sector, one census "
                     "vintage of the five-census shift-share series.",
                     "Residence basis, not the employment base. Industry "
                     "classification changes between vintages (NAICS 1997, 2002, "
                     "2007, 2012, 2017); sector-level codes are stable but not "
                     "identical. The 2011 figures come from the voluntary "
                     "National Household Survey, whose non-response bias is not "
                     "comparable to a census - the tool can chain around 2011.",
                     key.replace("census", "").replace("nhs", "").replace("profile", ""),
                     cite,
                     datetime.now(timezone.utc).isoformat(timespec="seconds"),
                     sum(1 for r in rows if key[-4:] in str(r[1]))))
    con.commit()
    log("employment (residence, 2001-2016): %d rows" % len(rows))


# --------------------------------------------------------------------------- #
# 3. supporting layers
# --------------------------------------------------------------------------- #

def load_population(con, ont_csds):
    log("population: parsing 17-10-0155")
    rd = open_zip_csv(path_for("pop_csd_annual"))
    hdr = next(rd)
    ix = dict((h, i) for i, h in enumerate(hdr))
    i_dg = ix.get("DGUID")
    i_ref = ix.get("REF_DATE")
    i_val = ix.get("VALUE")
    i_geo = ix.get("GEO")
    out, n = [], 0
    for row in rd:
        if len(row) <= max(i_dg, i_ref, i_val):
            continue
        dg = row[i_dg]
        if dg.startswith("2021A0005"):
            code = dg[9:]
        elif dg.startswith("2021A0002"):
            code = dg[9:]
        elif row[i_geo].strip() == "Canada":
            code = "CA"
        else:
            continue
        if not (code in ont_csds or code == ONT or code == "CA"):
            continue
        v = num(row[i_val])
        if v is None:
            continue
        try:
            yr = int(row[i_ref][:4])
        except ValueError:
            continue
        out.append((code, yr, v))
        n += 1
    con.executemany("INSERT OR REPLACE INTO population VALUES (?,?,?)", out)
    con.commit()
    record_source(con, "pop_csd_annual", n)
    log("population: %d rows" % n)


def _commute_member_map(path):
    """Member ID to CSD code, for both dimensions of the commuting table.

    Only the place-of-residence dimension publishes classification codes; the
    place-of-work dimension carries names alone, which cannot be resolved
    reliably by string matching. The two dimensions share a single member-ID
    space, so the residence code map decodes both, and the Coordinate column
    ('<residence member>.<work member>') gives the pair for every row.
    """
    z = zipfile.ZipFile(path)
    meta = [i.filename for i in z.infolist() if "MetaData" in i.filename][0]
    codes, work_members = {}, set()
    rd = csv.reader(io.TextIOWrapper(z.open(meta), encoding="utf-8-sig",
                                     errors="replace"))
    for row in rd:
        if len(row) < 4 or not row[3].isdigit():
            continue
        dim, cls, mid = row[0], (row[2] or "").strip(), int(row[3])
        if dim == "1" and cls.startswith("[") and cls.endswith("]"):
            inner = cls[1:-1].strip()
            if inner.isdigit():
                codes[mid] = inner
        elif dim == "2":
            work_members.add(mid)
    missing = len(work_members - set(codes))
    if missing:
        log("commuting: %d work-dimension members have no classification code "
            "and are dropped" % missing)
    return codes


def load_commute(con, ont_csds):
    log("commuting: parsing 98-10-0459 (large file, a minute or two)")
    path = path_for("commute_csd_2021")
    code_map = _commute_member_map(path)
    log("commuting: decoded %d geography codes" % len(code_map))

    rd = open_zip_csv(path)
    next(rd)
    out, n, scanned = [], 0, 0
    for row in rd:
        scanned += 1
        if len(row) < 6:
            continue
        v = num(row[5])
        if not v:                       # the overwhelming majority are zero
            continue
        coord = row[4].split(".")
        if len(coord) < 2:
            continue
        try:
            o = code_map.get(int(coord[0]))
            d = code_map.get(int(coord[1]))
        except ValueError:
            continue
        if not o or not d:
            continue
        if o not in ont_csds and d not in ont_csds:
            continue
        out.append((o, d, 2021, v))
        n += 1
        if len(out) >= 100000:
            con.executemany("INSERT OR REPLACE INTO commute VALUES (?,?,?,?)", out)
            out = []
    con.executemany("INSERT OR REPLACE INTO commute VALUES (?,?,?,?)", out)
    con.commit()
    record_source(con, "commute_csd_2021", n)
    log("commuting: %d non-zero flows touching Ontario (from %d rows)"
        % (n, scanned))


def load_business_counts(con, ont_csds):
    log("business counts: parsing 33-10-1097")
    rd = open_zip_csv(path_for("business_counts"))
    hdr = next(rd)
    ix = dict((h, i) for i, h in enumerate(hdr))
    i_dg, i_val = ix["DGUID"], ix["VALUE"]
    i_size = ix["Employment size"]
    i_ref = ix["REF_DATE"]
    i_ind = [i for i, h in enumerate(hdr) if "NAICS" in h][0]
    out, n = [], 0
    for row in rd:
        if len(row) <= i_val:
            continue
        dg = row[i_dg]
        if not dg.startswith("2021A0005"):
            continue
        code = dg[9:]
        if code not in ont_csds:
            continue
        nc = naics_from_label(row[i_ind])
        if nc is None:
            continue
        v = num(row[i_val])
        if v is None:
            continue
        out.append((code, nc, row[i_size].strip(), v, row[i_ref]))
        n += 1
    con.executemany("INSERT OR REPLACE INTO business_counts VALUES (?,?,?,?,?)", out)
    con.commit()
    record_source(con, "business_counts", n)
    log("business counts: %d rows" % n)


def load_io(con):
    log("input-output multipliers: parsing 36-10-0595")
    rd = open_zip_csv(path_for("io_multipliers_prov"))
    hdr = next(rd)
    ix = dict((h, i) for i, h in enumerate(hdr))
    i_geo, i_val, i_ref = ix["GEO"], ix["VALUE"], ix["REF_DATE"]
    i_ind = ix.get("Industry")
    i_mult = ix.get("Multiplier type")
    i_var = ix.get("Variable")
    i_cov = ix.get("Geographical coverage")
    if i_ind is None or i_mult is None:
        log("input-output multipliers: unexpected layout %s" % hdr)
        return
    out, n = [], 0
    for row in rd:
        if len(row) <= i_val:
            continue
        if row[i_geo].strip() != "Ontario":
            continue
        v = num(row[i_val])
        if v is None:
            continue
        ind = row[i_ind].strip()
        io_code = ""
        if ind.endswith("]") and "[" in ind:
            io_code = ind[ind.rfind("[") + 1:-1]
            ind = ind[:ind.rfind("[")].strip()
        out.append((ONT, int(row[i_ref][:4]), ind, io_code,
                    row[i_mult].strip(),
                    row[i_var].strip() if i_var is not None else "",
                    row[i_cov].strip() if i_cov is not None else "", v))
        n += 1
    con.executemany("""INSERT INTO io_multiplier
        (geo_code,year,industry,io_code,mult_type,variable,coverage,value)
        VALUES (?,?,?,?,?,?,?,?)""", out)
    con.commit()
    record_source(con, "io_multipliers_prov", n)
    log("input-output multipliers: %d rows" % n)


def load_ct_population(con, ont_cts):
    """Census-tract population from 98-10-0014.

    Statistics Canada's own published tract totals, held as an independent
    check on the geography spine: every tract population the tool otherwise
    uses is aggregated up from dissemination blocks in 92-151-X, and until this
    loaded, nothing verified that aggregation against the published figure.

    These are census COUNTS. The `population` table holds the annual estimates,
    which are adjusted for net undercoverage and are deliberately not the same
    numbers, so the two never share a table and are never differenced.
    """
    log("census tract population: parsing 98-10-0014")
    try:
        rd = open_zip_csv(path_for("ct_population"))
    except IOError as e:
        log("census tract population: %s" % e)
        return
    hdr = next(rd)
    ix = dict((h, i) for i, h in enumerate(hdr))
    i_dg = ix.get("DGUID")
    if i_dg is None:
        log("census tract population: no DGUID column, skipped")
        return

    def col(frag):
        for h, i in ix.items():
            if frag in h:
                return i
        return None

    i_p21 = col("Population, 2021")
    i_p16 = col("Population, 2016")
    i_dw = col("Total private dwellings, 2021")
    i_ar = col("Land area in square kilometres")
    i_de = col("Population density per square kilometre")

    def num(row, i):
        if i is None or len(row) <= i:
            return None
        v = (row[i] or "").replace(",", "").strip()
        try:
            return float(v)
        except ValueError:
            return None

    rows, seen = [], 0
    for row in rd:
        if len(row) <= i_dg:
            continue
        seen += 1
        dg = row[i_dg]
        # Tract DGUIDs are 2021S0507 followed by the tract code; anything else
        # in this table is a CMA or census agglomeration total.
        if not dg.startswith("2021S0507"):
            continue
        code = dg[len("2021S0507"):]
        if ont_cts and code not in ont_cts:
            continue
        rows.append((code, num(row, i_p21), num(row, i_p16), num(row, i_dw),
                     num(row, i_ar), num(row, i_de)))

    con.executemany("INSERT OR REPLACE INTO ct_population VALUES (?,?,?,?,?,?)",
                    rows)
    con.commit()
    record_source(con, "ct_population", len(rows))
    log("census tract population: %d Ontario tracts loaded (of %d rows)"
        % (len(rows), seen))


# --------------------------------------------------------------------------- #

def load_components(con):
    """Components of population change by census division.

    Two tables, deliberately kept apart as two series rather than spliced into
    one line. 17-10-0153 runs 2001-2024 on 2021 boundaries and reports net
    migration directly; 17-10-0038 runs 1986-2006 on older boundaries and
    reports in- and out-migration separately, so the nets are derived here.
    Ontario reorganised heavily around 2001 and a few census divisions changed
    with it, so joining across that break would draw a line through a
    discontinuity.
    """
    log("components of change (2001-2024): parsing 17-10-0153 (large file)")
    rd = open_zip_csv(path_for("components_cd_2021b"))
    hdr = next(rd)
    ix = dict((h, i) for i, h in enumerate(hdr))
    i_comp = ix["Components of population growth"]
    i_gen = ix.get("Gender")
    i_age = ix.get("Age group")
    i_val, i_dg, i_ref = ix["VALUE"], ix["DGUID"], ix["REF_DATE"]

    KEEP = {
        "Births": "births", "Deaths": "deaths",
        "Immigrants": "immigrants",
        "Net emigration": "net_emigration",
        "Net interprovincial migration": "net_interprovincial",
        "Net intraprovincial migration": "net_intraprovincial",
        "Net non-permanent residents": "net_npr",
        "Residual deviation": "residual",
    }
    out, n = [], 0
    for row in rd:
        if len(row) <= i_val:
            continue
        dg = row[i_dg]
        if not dg.startswith("2021A000335"):
            continue
        if i_gen is not None and not row[i_gen].startswith("Total"):
            continue
        if i_age is not None and row[i_age].strip() != "All ages":
            continue
        comp = KEEP.get(row[i_comp].strip())
        if not comp:
            continue
        v = num(row[i_val])
        if v is None:
            continue
        try:
            yr = int(row[i_ref][:4])
        except ValueError:
            continue
        out.append((dg[9:], yr, comp, v, "2021b"))
        n += 1
    con.executemany(
        "INSERT OR REPLACE INTO population_components VALUES (?,?,?,?,?)", out)
    con.commit()
    record_source(con, "components_cd_2021b", n)
    log("components of change (2001-2024): %d rows" % n)

    log("components of change (1986-2006): parsing 17-10-0038")
    rd = open_zip_csv(path_for("components_cd_2001b"))
    hdr = next(rd)
    ix = dict((h, i) for i, h in enumerate(hdr))
    i_comp = ix["Components of population growth"]
    i_val, i_dg, i_ref = ix["VALUE"], ix["DGUID"], ix["REF_DATE"]

    # This vintage reports in- and out-migration separately; nets are derived.
    RAW = {
        "Births": "births", "Deaths": "deaths",
        "Immigrants": "immigrants",
        "Total emigrants": "emigrants", "Emigrants": "emigrants",
        "Interprovincial in-migrants": "interprov_in",
        "Interprovincial out-migrants": "interprov_out",
        "Intraprovincial in-migrants": "intraprov_in",
        "Intraprovincial out-migrants": "intraprov_out",
    }
    raw, seen = {}, 0
    for row in rd:
        if len(row) <= i_val:
            continue
        dg = row[i_dg]
        if not dg.startswith("2011A000335"):
            continue
        comp = RAW.get(row[i_comp].strip())
        if not comp:
            continue
        v = num(row[i_val])
        if v is None:
            continue
        try:
            yr = int(row[i_ref][:4])
        except ValueError:
            continue
        raw.setdefault((dg[9:], yr), {})[comp] = v
        seen += 1

    out = []
    for (code, yr), d in raw.items():
        for k in ("births", "deaths", "immigrants", "emigrants"):
            if k in d:
                out.append((code, yr, k, d[k], "2011b"))
        if "interprov_in" in d and "interprov_out" in d:
            out.append((code, yr, "net_interprovincial",
                        d["interprov_in"] - d["interprov_out"], "2011b"))
        if "intraprov_in" in d and "intraprov_out" in d:
            out.append((code, yr, "net_intraprovincial",
                        d["intraprov_in"] - d["intraprov_out"], "2011b"))
    con.executemany(
        "INSERT OR REPLACE INTO population_components VALUES (?,?,?,?,?)", out)
    con.commit()
    record_source(con, "components_cd_2001b", seen)
    log("components of change (1986-2006): %d cells -> %d rows" % (seen, len(out)))



def load_io_summary(con):
    """Ontario input-output multipliers at the 33-industry summary level.

    The summary level rather than the 246-industry detail table, because the
    concordance to NAICS can be written down and checked - see
    pipeline/io_concordance.py for why, and for what it costs.

    Type I and Type II are dimensionless ratios (total per direct), so an
    employment impact can be computed from a job count alone, with no dollar
    figures anywhere in the chain.
    """
    log("input-output multipliers (summary): parsing 36-10-0113")
    rd = open_zip_csv(path_for("io_multipliers_summary"))
    hdr = next(rd)
    ix = dict((h, i) for i, h in enumerate(hdr))
    need = ["GEO", "REF_DATE", "Industry", "Variable", "Multiplier type",
            "Geographical coverage", "VALUE"]
    for k in need:
        if k not in ix:
            raise IOError("unexpected layout in 36-10-0113: %s" % hdr)

    out, n, unknown = [], 0, set()
    for row in rd:
        if len(row) <= ix["VALUE"]:
            continue
        if row[ix["GEO"]].strip() != "Ontario":
            continue
        v = num(row[ix["VALUE"]])
        if v is None:
            continue
        ind = row[ix["Industry"]].strip()
        code = ""
        if ind.endswith("]") and "[" in ind:
            code = ind[ind.rfind("[") + 1:-1].strip()
            ind = ind[:ind.rfind("[")].strip()
        if code and code not in IOC.IO_NAICS:
            unknown.add(code)
        try:
            yr = int(row[ix["REF_DATE"]][:4])
        except ValueError:
            continue
        out.append((ONT, yr, code, ind, row[ix["Variable"]].strip(),
                    row[ix["Multiplier type"]].strip(),
                    row[ix["Geographical coverage"]].strip(), v))
        n += 1
    con.executemany(
        "INSERT OR REPLACE INTO io_summary VALUES (?,?,?,?,?,?,?,?)", out)
    con.commit()
    record_source(con, "io_multipliers_summary", n)
    if unknown:
        log("input-output multipliers (summary): %d codes absent from the "
            "concordance: %s" % (len(unknown), sorted(unknown)))
    probs = IOC.check()
    if probs:
        log("input-output concordance PROBLEMS: %s" % probs)
    log("input-output multipliers (summary): %d rows, %d industries"
        % (n, len(set(r[2] for r in out))))



STAGES = ["meta", "pow_csd", "pow_ct", "res_2021", "res_series",
          "res_2016", "population",
          "components", "commute", "business_counts", "io", "io_summary",
          "ct_population"]


def refresh_meta(con):
    """Rewrite source_meta from sources.py without touching any data.

    Purpose and caveat text changes far more often than the data does - every
    time the metadata is re-read and something is understood better - and
    re-parsing fifty million CSV rows to correct a sentence is absurd.
    """
    n = 0
    for src in S.SOURCES:
        row = con.execute("SELECT rows_loaded FROM source_meta WHERE key=?",
                          (src.key,)).fetchone()
        con.execute("INSERT OR REPLACE INTO source_meta VALUES (?,?,?,?,?,?,?,?,?)",
                    (src.key, src.title, src.url, src.purpose, src.caveats,
                     src.vintage, src.cite,
                     datetime.now(timezone.utc).isoformat(timespec="seconds"),
                     row[0] if row else None))
        n += 1
    con.commit()
    log("source metadata: refreshed %d entries" % n)


def main(stages=None):
    """Build everything, or re-run named stages against the existing database.

    A full build re-parses roughly 50 million CSV rows, so being able to redo
    one stage after fixing one parser matters:

        python pipeline/build.py                          # everything
        python pipeline/build.py business_counts io       # just these
    """
    if stages:
        bad = [s for s in stages if s not in STAGES]
        if bad:
            raise SystemExit("unknown stage(s) %s; choose from %s"
                             % (bad, STAGES))
        con = sqlite3.connect(DB)
        ont_csds = set(r[0] for r in con.execute(
            "SELECT code FROM geo WHERE level='CSD' AND is_ontario=1"))
        ont_cts = set(r[0] for r in con.execute(
            "SELECT code FROM geo WHERE level='CT' AND is_ontario=1"))
        if not ont_csds and stages != ["meta"]:
            raise SystemExit("no geography in the database - run a full build first")
        log("re-running stages %s against the existing database" % ", ".join(stages))
    else:
        # init_db() drops every table. Check that a full build can actually
        # complete BEFORE destroying the one that already works - otherwise a
        # single missing download turns a rebuild into a wipe, which is exactly
        # what happened once.
        missing = [src.key for src in S.SOURCES if not F.locate(src)]
        if missing:
            raise SystemExit(
                "refusing to rebuild: %d source file(s) are missing, and a full "
                "build starts by dropping every table.\n"
                "  missing: %s\n"
                "  run 'python pipeline/fetch.py' first, or rebuild a single "
                "stage with 'python pipeline/build.py <stage>'."
                % (len(missing), ", ".join(missing)))
        con = init_db()
        ont_csds, ont_cts = build_geography(con)
        stages = STAGES

    run = {
        "meta": lambda: refresh_meta(con),
        "pow_csd": lambda: load_pow_csd(con, ont_csds),
        "pow_ct": lambda: load_pow_ct(con, ont_cts),
        "res_2021": lambda: load_res_2021(con, ont_csds),
        "res_series": lambda: load_res_series(con, ont_csds),
        "res_2016": lambda: load_res_2016(con, ont_csds),
        "population": lambda: load_population(con, ont_csds),
        "components": lambda: load_components(con),
        "commute": lambda: load_commute(con, ont_csds),
        "business_counts": lambda: load_business_counts(con, ont_csds),
        "io": lambda: load_io(con),
        "io_summary": lambda: load_io_summary(con),
        "ct_population": lambda: load_ct_population(con, ont_cts),
    }
    for s in stages:
        if s == "meta":
            run[s]()
            continue
        if s == "business_counts":
            con.execute("DELETE FROM business_counts")
        if s == "io":
            con.execute("DELETE FROM io_multiplier")
        if s == "io_summary":
            con.execute("DELETE FROM io_summary")
        if s == "components":
            con.execute("DELETE FROM population_components")
        run[s]()

    log("\nsummary")
    for q, label in (
            ("SELECT level, COUNT(*) FROM geo GROUP BY level", "geo levels"),
            ("SELECT basis, measure, year, COUNT(*) FROM employment "
             "GROUP BY basis, measure, year ORDER BY basis, year", "employment"),
            ("SELECT COUNT(*) FROM commute", "commute flows"),
            ("SELECT COUNT(*) FROM business_counts", "business counts"),
            ("SELECT COUNT(*) FROM io_multiplier", "io multipliers")):
        log("  %s: %s" % (label, list(con.execute(q))))
    con.execute("VACUUM")
    con.close()
    log("\nbuilt %s (%.1f MB)" % (DB, os.path.getsize(DB) / 1e6))


if __name__ == "__main__":
    main([a for a in sys.argv[1:] if not a.startswith("-")] or None)
