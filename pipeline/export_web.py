"""Write the compact JSON payloads the app loads.

The app computes every index, decomposition and peer distance in the browser
rather than reading precomputed answers, because the benchmark, the period and
the peer group are all user choices and precomputing their combinations would
be a combinatorial mess. So what ships is the raw employment matrix plus the
geography spine - small enough to sit in memory on a phone, complete enough that
nothing has to be recomputed server-side.

Payloads are arrays of numbers keyed by code, not arrays of objects: the same
data as objects is roughly four times the bytes, all of it repeated key names.

Run:  python pipeline/export_web.py
"""
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DB = os.path.join(ROOT, "data", "analyst.db")
OUT = os.path.join(ROOT, "app", "data")

sys.path.insert(0, HERE)
import build as B     # noqa: E402
import io_concordance as IOC  # noqa: E402  (for the NAICS list)
import methods as MM  # noqa: E402  (for the reliability constants)

NAICS_CODES = B.NAICS_CODES
IDX = dict((c, i) for i, c in enumerate(NAICS_CODES))
YEARS = [2001, 2006, 2011, 2016, 2021]


import sources as SRC              # noqa: E402  (licence text travels here)
from sources import SOURCES        # noqa: E402

SOURCE_BY_KEY = {s.key: s for s in SOURCES}


def write(name, obj):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"))
    print("  %-22s %7.2f MB" % (name, os.path.getsize(path) / 1048576.0))


def r1(x):
    """Employment counts are published in multiples of 5; one decimal is more
    than enough for anything derived and keeps the payload small."""
    return None if x is None else (int(x) if float(x).is_integer() else round(x, 1))


def main():
    os.makedirs(OUT, exist_ok=True)
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    print("exporting from %s" % DB)

    # ---------------------------------------------------------------- geo
    places, cd_names, er_names, cma_names = [], {}, {}, {}
    for r in con.execute("""SELECT code, level, name, csd_type, cd_code, cd_name,
               er_code, er_name, cma_code, cma_name, sac_type, sac_label,
               pop_2021, area_km2, lat, lon
        FROM geo WHERE is_ontario=1 OR code='CA' ORDER BY level, name"""):
        places.append([
            r["code"], r["level"], r["name"], r["csd_type"] or "",
            r["cd_code"] or "", r["er_code"] or "", r["cma_code"] or "",
            r["sac_type"] or "", r["pop_2021"],
            round(r["area_km2"], 3) if r["area_km2"] else None,
            round(r["lat"], 5) if r["lat"] else None,
            round(r["lon"], 5) if r["lon"] else None,
        ])
        if r["level"] == "CD":
            cd_names[r["code"]] = r["name"]
        if r["level"] == "ER":
            # Economic regions are keyed in geo under an "ER" prefix because
            # their codes collide with census-division codes; the name lookup
            # is keyed by the bare code, which is what CSD rows carry.
            er_names[r["er_code"]] = r["name"]
        if r["level"] == "CMA":
            cma_names[r["code"]] = r["name"]

    naics = [{"code": c, "name": n, "short": s, "group": g}
             for c, n, s, g in B.NAICS]

    write("geo.json", {
        "fields": ["code", "level", "name", "csd_type", "cd", "er", "cma",
                   "sac", "pop2021", "area_km2", "lat", "lon"],
        "places": places,
        "cd_names": cd_names, "er_names": er_names, "cma_names": cma_names,
        "sac_labels": B.SAC_LABEL,
        "naics": naics,
    })

    # ------------------------------------------------- place of work, 2021
    def pow_payload(levels):
        codes = set(r[0] for r in con.execute(
            "SELECT code FROM geo WHERE level IN (%s) AND (is_ontario=1 OR code='CA')"
            % ",".join("?" * len(levels)), levels))
        data = {}
        for r in con.execute("""SELECT geo_code, naics, measure, jobs
                FROM employment WHERE basis='work' AND year=2021"""):
            if r["geo_code"] not in codes or r["naics"] not in IDX:
                continue
            slot = data.setdefault(r["geo_code"], [[None] * 20, [None] * 20,
                                                   [None] * 20])
            m = {"total": 0, "home": 1, "usual": 2}[r["measure"]]
            slot[m][IDX[r["naics"]]] = r1(r["jobs"])
        return data

    write("work_csd.json", {
        "year": 2021, "basis": "place of work",
        "measures": ["total", "home", "usual"],
        "naics_order": NAICS_CODES,
        "data": pow_payload(["CSD", "CD", "PR", "CA"]),
    })
    write("work_ct.json", {
        "year": 2021, "basis": "place of work",
        "measures": ["total", "home", "usual"],
        "naics_order": NAICS_CODES,
        "data": pow_payload(["CT"]),
    })

    # ------------------------------------------- residence series 2001-2021
    res = {}
    for r in con.execute("""SELECT geo_code, year, naics, jobs FROM employment
            WHERE basis='residence' AND measure='total'"""):
        if r["naics"] not in IDX:
            continue
        byyear = res.setdefault(r["geo_code"], {})
        vec = byyear.setdefault(str(r["year"]), [None] * 20)
        vec[IDX[r["naics"]]] = r1(r["jobs"])
    # The place-of-work-status split for 2021, all industries. This is what
    # makes a jobs-to-residents ratio honest: the place-of-work tables count
    # only people who worked at home or at a usual workplace, so the comparable
    # denominator is home + usual, not the residence total, which also carries
    # everyone with no fixed workplace address or working outside Canada.
    res_measures = {}
    q = ("SELECT geo_code, measure, jobs FROM employment "
         "WHERE basis='residence' AND year=2021 AND naics='TOTAL'")
    for r in con.execute(q):
        res_measures.setdefault(r["geo_code"], {})[r["measure"]] = r1(r["jobs"])

    write("res_series.json", {
        "years": YEARS, "basis": "place of residence",
        "naics_order": NAICS_CODES, "data": res,
        "measures_2021": res_measures,
        "measures_note": ("home + usual is the only subtotal comparable with a "
                          "place-of-work figure; the residence total also "
                          "includes workers with no fixed workplace address and "
                          "those working outside Canada, who cannot be assigned "
                          "to a workplace geography."),
    })

    # ---------------------------------------------------------- population
    pop = {}
    for code, year, v in con.execute(
            "SELECT geo_code, year, population FROM population"):
        pop.setdefault(code, {})[str(year)] = int(v)
    write("population.json", {"source": "17-10-0155", "data": pop})

    # ------------------------------------------- components of change
    comps = {}
    for code, year, comp, val, vintage in con.execute(
            "SELECT geo_code, year, component, value, vintage "
            "FROM population_components"):
        comps.setdefault(vintage, {}).setdefault(code, {}) \
             .setdefault(str(year), {})[comp] = r1(val)
    write("components.json", {
        "level": "census division",
        "vintages": {
            "2021b": {"label": "2001-2024, 2021 boundaries",
                      "source": "17-10-0153", "net": True},
            "2011b": {"label": "1986-2006, earlier boundaries",
                      "source": "17-10-0038", "net": False},
        },
        "note": ("Two series, not one. They overlap between 2001 and 2006 but "
                 "sit on different boundary vintages and define migration "
                 "slightly differently, so they are never joined into a single "
                 "line without the break being shown."),
        "data": comps,
    })

    # ----------------------------------------------------------- commuting
    flows_in, flows_out, lw = {}, {}, {}
    top = {}
    for o, d, w in con.execute(
            "SELECT origin_code, dest_code, workers FROM commute WHERE year=2021"):
        if o == d:
            lw[o] = lw.get(o, 0.0) + w
        else:
            flows_out[o] = flows_out.get(o, 0.0) + w
            flows_in[d] = flows_in.get(d, 0.0) + w
            top.setdefault(d, []).append([o, w])
            top.setdefault(o + "|out", []).append([d, w])
    for k in top:
        top[k].sort(key=lambda x: -x[1])
        del top[k][12:]
    codes = set(list(flows_in) + list(flows_out) + list(lw))
    write("commute.json", {
        "year": 2021,
        "fields": ["live_and_work", "in_commuters", "out_commuters"],
        "data": dict((c, [r1(lw.get(c, 0.0)), r1(flows_in.get(c, 0.0)),
                          r1(flows_out.get(c, 0.0))]) for c in codes),
        "top_flows": dict((k, [[c, r1(v)] for c, v in vs])
                          for k, vs in top.items()),
    })

    # ----------------------------------------------------- business counts
    bands = sorted(set(r[0] for r in con.execute(
        "SELECT DISTINCT size_band FROM business_counts")))
    biz = {}
    for code, nc, band, v in con.execute(
            "SELECT geo_code, naics, size_band, establishments FROM business_counts"):
        if nc not in IDX:
            continue
        biz.setdefault(code, {}).setdefault(band, [None] * 20)[IDX[nc]] = r1(v)
    write("business.json", {"bands": bands, "naics_order": NAICS_CODES,
                            "data": biz})

    # ------------------------------------------------ impact multipliers
    yr = con.execute("SELECT MAX(year) FROM io_summary").fetchone()[0]
    io_rows = {}
    if yr:
        q = ("SELECT io_code, industry, variable, mult_type, value "
             "FROM io_summary WHERE geo_code='35' AND year=? "
             "AND coverage='Within province'")
        for code, ind, var, mt, val in con.execute(q, (yr,)):
            if not code or code in IOC.EXCLUDE:
                continue
            io_rows.setdefault(code, {"code": code, "label": ind, "m": {}})
            io_rows[code]["m"].setdefault(var, {})[mt] = r1(val)
    for code, rec in io_rows.items():
        meta = IOC.IO_NAICS.get(code)
        rec["naics"] = meta[1] if meta else []
        rec["note"] = meta[2] if meta else ""
    write("io.json", {
        "year": yr,
        "geography": "Ontario",
        "coverage": "Within province",
        "source": "36-10-0113",
        "note": ("Type I and Type II multipliers are dimensionless ratios - "
                 "total per direct - so an employment impact needs only a job "
                 "count. Provincial multipliers: applying them to a "
                 "municipality overstates local capture, which is why the "
                 "interface scales the indirect and induced parts by a "
                 "Flegg-Webber factor."),
        "industries": io_rows,
        "sector_index": dict((sec, IOC.industries_for(sec))
                             for sec in IOC.NAICS_SECTORS),
    })

    # ------------------------------------ occupation, and sampling error
    # Both from 98-10-0456, both RESIDENCE basis: what the people who live in a
    # place do, and how uncertain each published count is. Occupation answers
    # "what do people do here?" in the words people use - nurse, trades,
    # teacher - where industry answers it in NAICS. Kept as [count, lo, hi]
    # triples so the interface never shows a number without its interval.
    nocs = sorted(set(r[0] for r in con.execute(
        "SELECT DISTINCT noc FROM occupation")), key=int)
    noc_idx = dict((n, i) for i, n in enumerate(nocs))
    labels = dict(con.execute(
        "SELECT noc, label FROM occupation GROUP BY noc"))
    occ = {}
    for code, noc, n, lo, hi in con.execute(
            "SELECT geo_code, noc, workers, ci_lo, ci_hi FROM occupation "
            "WHERE year=2021"):
        slot = occ.setdefault(code, [None] * len(nocs))
        slot[noc_idx[noc]] = [r1(n), r1(lo), r1(hi)]
    ci = {}
    for code, nc, lo, hi in con.execute(
            "SELECT geo_code, naics, ci_lo, ci_hi FROM employment_ci "
            "WHERE year=2021 AND basis='residence' AND measure='total'"):
        if nc not in IDX:
            continue
        ci.setdefault(code, [None] * 20)[IDX[nc]] = [r1(lo), r1(hi)]
    write("detail.json", {
        "year": 2021, "basis": "place of residence",
        "source": "98-10-0456",
        "noc_order": nocs,
        "noc_labels": [labels[n] for n in nocs],
        "occupation": occ,
        "naics_order": NAICS_CODES,
        "sector_ci95": ci,
        "note": ("Residence basis: the employed people who LIVE in each place. "
                 "Every count carries its published 95% confidence interval; "
                 "these are the only measure of long-form sampling error in "
                 "the tool, which dominates rounding for any cell above a few "
                 "dozen workers."),
    })

    # -------------------------------------------------- correspondence + meta
    cc = {}
    for ct, csd, pop_, share, prim in con.execute(
            "SELECT ct_code, csd_code, pop, share, is_primary FROM ct_csd"):
        cc.setdefault(ct, []).append([csd, pop_, round(share, 4), prim])
    write("ct_csd.json", {"note": ("Census tracts do not nest inside "
                                  "municipalities. Each tract lists every "
                                  "municipality it overlaps, with the share of "
                                  "its resident population in each; the primary "
                                  "flag marks the largest."),
                          "data": cc})

    sources = []
    for r in con.execute("""SELECT key,title,url,purpose,caveats,vintage,cite,
               built_at,rows_loaded FROM source_meta ORDER BY key"""):
        d = dict(r)
        # the licence travels with the source declaration, so the credit on
        # screen is generated from what was actually loaded (audit 8)
        src = SOURCE_BY_KEY.get(d["key"])
        if src is not None:
            d["licence"] = src.licence
            d["licence_url"] = src.licence_url
            d["attribution"] = src.attribution
        elif (d.get("title") or "").startswith("Statistics Canada"):
            # the five-census series is declared as a tuple rather than a
            # Source (sources.LEGACY_SERIES); it carries the same licence, and
            # the clause is still generated from the title that was loaded
            d["licence"] = SRC.STATCAN_LICENCE
            d["licence_url"] = SRC.STATCAN_LICENCE_URL
            d["attribution"] = SRC.statcan_attribution(
                d["title"].replace("Statistics Canada. ", "").rstrip("."))
        sources.append(d)

    coverage = {}
    for year in YEARS:
        n = con.execute("""SELECT COUNT(DISTINCT geo_code) FROM employment
            WHERE basis='residence' AND year=? AND geo_code IN
            (SELECT code FROM geo WHERE level='CSD')""", (year,)).fetchone()[0]
        coverage[str(year)] = n

    write("meta.json", {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": sources,
        "csd_coverage_by_year": coverage,
        "counts": dict((lvl, n) for lvl, n in con.execute(
            "SELECT level, COUNT(*) FROM geo WHERE is_ontario=1 GROUP BY level")),
        "reliability": {
            "withheld_at_or_below": MM.MIN_RELIABLE_CELL,
            "weak_at_or_below": MM.WEAK_CELL,
            "rounding_sd_per_cell": MM.ROUNDING_SD,
            "note": ("Census counts are randomly rounded to a multiple of 5. "
                     "Cells at or below 25 workers are withheld; 26 to 50 are "
                     "shown and marked weak."),
        },
    })
    con.close()
    print("done")


if __name__ == "__main__":
    main()
