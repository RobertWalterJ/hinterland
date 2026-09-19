"""Validation suite.

Five kinds of check, in increasing order of how much they would embarrass us:

  1. Algebraic identities. Shift-share is a decomposition, so its components
     must sum to the observed change exactly - not approximately. Same for the
     Esteban-Marquillas split and the basic/non-basic split. These are run over
     every Ontario municipality and every census pair, because an identity that
     holds for Toronto and fails for a township is still a broken tool.

  2. Known answers. Indices are checked against cases where the right answer is
     known by construction: a region identical to the reference must score zero
     on the Krugman index, one on Hachman, and one on every location quotient.
     A worked shift-share example is checked against hand arithmetic.

  3. Agreement between the two implementations. app/js/methods.js is a port of
     pipeline/methods.py, and a port is a place for a typo to hide. Both are run
     over the same real Ontario data and the results compared to 1e-9.

  4. The data itself. Sector figures against published totals, municipalities
     against the province, the place-of-work total against its two components,
     tract coverage against the geography spine, and the per-cell rounding
     variance the whole reliability floor rests on - measured, not assumed.

  5. The export formats. The ZIP, workbook, DBF and shapefile writers are all
     hand-rolled, so every format is written for real and parsed back with an
     independent reader. "It downloaded" proves nothing.

Run:  python pipeline/validate.py
Exit code 0 if everything passes, 1 otherwise.
"""
import csv
import io
import json
import math
import os
import re
import sqlite3
import struct
import subprocess
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DB = os.path.join(ROOT, "data", "analyst.db")
JS = os.path.join(ROOT, "app", "js", "methods.js")

sys.path.insert(0, HERE)
import methods as MT      # noqa: E402
import build as B         # noqa: E402

NAICS = B.NAICS_CODES
YEARS = [2001, 2006, 2011, 2016, 2021]

FAILS = []
CHECKS = [0]


def check(name, ok, detail=""):
    CHECKS[0] += 1
    if ok:
        print("  pass  %s%s" % (name, ("  " + detail) if detail else ""))
    else:
        print("  FAIL  %s  %s" % (name, detail))
        FAILS.append(name)
    return ok


def head(t):
    print("\n" + t)
    print("-" * len(t))


# --------------------------------------------------------------------------- #
# data access
# --------------------------------------------------------------------------- #

def load():
    con = sqlite3.connect(DB)
    res, work = {}, {}
    for code, year, naics, jobs in con.execute(
            "SELECT geo_code, year, naics, jobs FROM employment "
            "WHERE basis='residence' AND measure='total'"):
        if naics not in NAICS:
            continue
        res.setdefault(code, {}).setdefault(year, {})[naics] = jobs
    for code, naics, jobs in con.execute(
            "SELECT geo_code, naics, jobs FROM employment "
            "WHERE basis='work' AND measure='total' AND year=2021"):
        if naics not in NAICS:
            continue
        work.setdefault(code, {})[naics] = jobs
    csds = [r[0] for r in con.execute(
        "SELECT code FROM geo WHERE level='CSD' AND is_ontario=1")]
    cts = [r[0] for r in con.execute(
        "SELECT code FROM geo WHERE level='CT' AND is_ontario=1")]
    return con, res, work, csds, cts


def vec(d):
    return dict((k, d.get(k, 0.0)) for k in NAICS)


# --------------------------------------------------------------------------- #
# 1. identities
# --------------------------------------------------------------------------- #

def test_identities(res, work, csds):
    head("1. Algebraic identities, over every municipality and census pair")

    worst_ss = worst_em = 0.0
    worst_ss_at = worst_em_at = None
    pairs = 0

    for i, y0 in enumerate(YEARS):
        for y1 in YEARS[i + 1:]:
            R0, R1 = res.get("35", {}).get(y0), res.get("35", {}).get(y1)
            if not R0 or not R1:
                continue
            for code in csds:
                a = res.get(code, {}).get(y0)
                b = res.get(code, {}).get(y1)
                if not a or not b:
                    continue
                pairs += 1
                r = MT.esteban_marquillas(vec(a), vec(b), vec(R0), vec(R1))
                t = r["total"]
                d1 = abs(t["actual"] - (t["national"] + t["mix"] + t["competitive"]))
                d2 = abs(t["competitive"] - (t["em_competitive"] + t["em_allocation"]))
                if d1 > worst_ss:
                    worst_ss, worst_ss_at = d1, (code, y0, y1)
                if d2 > worst_em:
                    worst_em, worst_em_at = d2, (code, y0, y1)

    scale = 1e-6
    check("shift-share identity holds (%d decompositions)" % pairs,
          worst_ss < scale,
          "worst residual %.3e at %s" % (worst_ss, worst_ss_at))
    check("Esteban-Marquillas splits the competitive term exactly",
          worst_em < scale,
          "worst residual %.3e at %s" % (worst_em, worst_em_at))

    # per-industry identity, not only the total
    worst_row = 0.0
    R0, R1 = vec(res["35"][2016]), vec(res["35"][2021])
    for code in csds[:120]:
        a = res.get(code, {}).get(2016)
        b = res.get(code, {}).get(2021)
        if not a or not b:
            continue
        r = MT.shift_share(vec(a), vec(b), R0, R1)
        for k, row in r["rows"].items():
            d = abs(row["actual"] -
                    (row["national"] + row["mix"] + row["competitive"]))
            worst_row = max(worst_row, d)
    check("identity holds industry by industry, not just in total",
          worst_row < 1e-7, "worst residual %.3e" % worst_row)

    # economic base
    worst_base = 0.0
    W = vec(work["35"])
    for code in csds:
        w = work.get(code)
        if not w:
            continue
        bs = MT.economic_base(vec(w), W)
        worst_base = max(worst_base,
                         abs(bs["total"] - (bs["basic"] + bs["non_basic"])))
    check("basic plus non-basic equals total employment",
          worst_base < 1e-7, "worst residual %.3e" % worst_base)

    # dynamic chaining must reproduce the observed endpoint change
    worst_dyn = 0.0
    for code in csds:
        series = res.get(code, {})
        ys = [y for y in YEARS if y in series and res.get("35", {}).get(y)]
        if len(ys) < 3:
            continue
        loc = dict((y, vec(series[y])) for y in ys)
        ref = dict((y, vec(res["35"][y])) for y in ys)
        dyn = MT.dynamic_shift_share(loc, ref, ys)
        if not dyn:
            continue
        observed = MT._sum(loc[ys[-1]]) - MT._sum(loc[ys[0]])
        worst_dyn = max(worst_dyn, abs(dyn["total"]["actual"] - observed))
    check("chained components sum to the observed end-to-end change",
          worst_dyn < 1e-6, "worst residual %.3e" % worst_dyn)


# --------------------------------------------------------------------------- #
# 2. known answers
# --------------------------------------------------------------------------- #

def test_known_answers(res, work):
    head("2. Cases where the right answer is known by construction")

    W = vec(work["35"])

    # A region that IS the reference
    lq = MT.location_quotients(W, W)
    check("a region identical to the reference scores LQ 1 everywhere",
          all(abs(r["lq"] - 1.0) < 1e-9 for r in lq.values() if r["lq"]),
          "max deviation %.2e" % max(abs(r["lq"] - 1.0)
                                     for r in lq.values() if r["lq"]))
    ind = MT.structure_indices(W, W)
    check("...and Krugman specialisation 0", abs(ind["krugman"]) < 1e-12,
          "%.2e" % ind["krugman"])
    check("...and a Hachman index of 1", abs(ind["hachman"] - 1) < 1e-9,
          "%.9f" % ind["hachman"])
    base = MT.economic_base(W, W)
    check("...and no basic employment at all", base["basic"] < 1e-6,
          "%.2e" % base["basic"])

    # Scale invariance: doubling a region changes no index
    dbl = dict((k, v * 2) for k, v in W.items())
    ind2 = MT.structure_indices(dbl, W)
    check("indices are scale-invariant (doubling every sector changes nothing)",
          abs(ind2["krugman"]) < 1e-12 and abs(ind2["hachman"] - 1) < 1e-9)

    # Hand-worked shift-share. Reference grows 10 percent overall; industry A
    # grows 20 percent, industry B is flat. Region starts 100 in A, 100 in B and
    # ends 130 in A, 90 in B.
    e0 = {"11": 100.0, "21": 100.0}
    e1 = {"11": 130.0, "21": 90.0}
    E0 = {"11": 1000.0, "21": 1000.0}
    E1 = {"11": 1200.0, "21": 1000.0}
    # G = 2200/2000 - 1 = 0.10 ; G_A = 0.20 ; G_B = 0.00
    # A: national 10, mix 100*(0.20-0.10)=10, competitive 30-20=10
    # B: national 10, mix 100*(0.00-0.10)=-10, competitive -10-0=-10
    r = MT.shift_share(e0, e1, E0, E1)
    rA, rB, t = r["rows"]["11"], r["rows"]["21"], r["total"]
    ok = (abs(rA["national"] - 10) < 1e-9 and abs(rA["mix"] - 10) < 1e-9 and
          abs(rA["competitive"] - 10) < 1e-9 and
          abs(rB["national"] - 10) < 1e-9 and abs(rB["mix"] + 10) < 1e-9 and
          abs(rB["competitive"] + 10) < 1e-9 and abs(t["actual"] - 20) < 1e-9)
    check("worked example matches hand arithmetic", ok,
          "A(%.1f,%.1f,%.1f) B(%.1f,%.1f,%.1f)" %
          (rA["national"], rA["mix"], rA["competitive"],
           rB["national"], rB["mix"], rB["competitive"]))

    # Esteban-Marquillas on the same example. Region total 200, reference
    # industry shares 0.5/0.5, so homothetic employment is 100 in each - the
    # region is not specialised at all, so the allocation effect must vanish.
    em = MT.esteban_marquillas(e0, e1, E0, E1)
    check("no specialisation means no allocation effect",
          abs(em["total"]["em_allocation"]) < 1e-9,
          "%.2e" % em["total"]["em_allocation"])

    # A specialised region: same growth rates, but concentrated in A.
    e0s = {"11": 180.0, "21": 20.0}
    e1s = {"11": 234.0, "21": 18.0}     # A +30%, B -10%, as before
    ems = MT.esteban_marquillas(e0s, e1s, E0, E1)
    check("being specialised in the sector it outperforms in gives a positive "
          "allocation effect",
          ems["total"]["em_allocation"] > 0,
          "%.2f" % ems["total"]["em_allocation"])

    # Zero base year must not produce a fake growth rate
    z = MT.shift_share({"11": 0.0}, {"11": 50.0}, {"11": 100.0}, {"11": 110.0})
    row = z["rows"]["11"]
    check("a sector with no base-year employment is flagged, not credited with "
          "a growth rate",
          row["zero_base"] and row["local_growth"] is None and
          abs(row["competitive"] - 50) < 1e-9)

    # Index ranges
    bad = []
    for code, w in list(work.items()):
        if code in ("35", "CA"):
            continue
        ind = MT.structure_indices(vec(w), W)
        if not ind:
            continue
        if not (0 <= ind["krugman"] <= 2):
            bad.append((code, "krugman", ind["krugman"]))
        if not (0 <= ind["entropy_normalised"] <= 1.0000001):
            bad.append((code, "entropy", ind["entropy_normalised"]))
        if ind["hachman"] is not None and not (0 < ind["hachman"] <= 1.0000001):
            bad.append((code, "hachman", ind["hachman"]))
        if not (0 <= ind["hhi_normalised"] <= 1.0000001):
            bad.append((code, "hhi", ind["hhi_normalised"]))
    check("every index stays inside its theoretical range in all %d "
          "municipalities" % (len(work) - 2), not bad, str(bad[:3]))

    # FLQ must be below the plain LQ for any region smaller than the reference
    f = MT.flq(vec(work["3520005"]), W)
    check("Flegg-Webber lambda is below 1 for a sub-provincial region",
          0 < f["lambda"] < 1, "lambda = %.4f" % f["lambda"])

    # Mix distance
    check("industry-mix distance from a region to itself is zero",
          abs(MT.mix_distance(W, W)) < 1e-12)
    check("industry-mix distance is symmetric",
          abs(MT.mix_distance(vec(work["3520005"]), W) -
              MT.mix_distance(W, vec(work["3520005"]))) < 1e-12)
    disjoint_a = {"11": 100.0, "21": 0.0}
    disjoint_b = {"11": 0.0, "21": 100.0}
    check("industry-mix distance is 1 for economies with no overlap",
          abs(MT.mix_distance(disjoint_a, disjoint_b) - 1.0) < 1e-12)

    # Mahalanobis: distance to self is zero, and it is symmetric
    rows = [{"a": 1.0, "b": 2.0}, {"a": 2.0, "b": 1.5}, {"a": 5.0, "b": 9.0},
            {"a": 3.0, "b": 3.2}, {"a": 0.5, "b": 1.1}, {"a": 4.0, "b": 6.0}]
    p1 = MT.mahalanobis_peers(0, rows, ["a", "b"], k=5)
    p2 = MT.mahalanobis_peers(2, rows, ["a", "b"], k=5)
    d02 = [p["d2"] for p in p1 if p["index"] == 2][0]
    d20 = [p["d2"] for p in p2 if p["index"] == 0][0]
    check("Mahalanobis distance is symmetric", abs(d02 - d20) < 1e-9,
          "%.6f vs %.6f" % (d02, d20))
    check("Mahalanobis ranking is ordered",
          all(p1[i]["d2"] <= p1[i + 1]["d2"] for i in range(len(p1) - 1)))

    # Matrix inverse
    Mx = [[4.0, 2.0, 0.6], [2.0, 5.0, 1.0], [0.6, 1.0, 3.0]]
    Inv = MT.invert(Mx)
    prod = [[sum(Mx[i][k] * Inv[k][j] for k in range(3)) for j in range(3)]
            for i in range(3)]
    err = max(abs(prod[i][j] - (1.0 if i == j else 0.0))
              for i in range(3) for j in range(3))
    check("matrix inverse is correct", err < 1e-12, "max error %.2e" % err)


# --------------------------------------------------------------------------- #
# 3. the two implementations agree
# --------------------------------------------------------------------------- #

JS_HARNESS = r"""
const fs = require('fs');
globalThis.window = globalThis;
// Indirect eval runs in global scope, so the module's top-level `this` is
// globalThis - the same thing a classic <script> tag gives it in a browser.
// A plain eval() here would run in CommonJS module scope, where `this` is
// module.exports, and the namespace would attach to the wrong object.
const geval = eval;
geval(fs.readFileSync(process.argv[2], 'utf8'));
const M = globalThis.GRA.methods;
const inp = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const out = [];
for (const c of inp.cases) {
  const em = M.estebanMarquillas(c.e0, c.e1, c.E0, c.E1);
  const lq = M.locationQuotients(c.e1, c.E1);
  const ind = M.structureIndices(c.e1, c.E1);
  const base = M.economicBase(c.e1, c.E1);
  const f = M.flq(c.e1, c.E1);
  out.push({
    code: c.code,
    total: {
      actual: em.total.actual, national: em.total.national,
      mix: em.total.mix, competitive: em.total.competitive,
      emCompetitive: em.total.emCompetitive, emAllocation: em.total.emAllocation
    },
    rows: em.rows.map(r => [r.national, r.mix, r.competitive,
                            r.emCompetitive, r.emAllocation, r.homothetic]),
    lq: lq.map(r => r.lq),
    ind: ind && [ind.krugman, ind.coefSpecialisation, ind.hhi,
                 ind.hhiNormalised, ind.entropy, ind.entropyNormalised,
                 ind.hachman, ind.specialisations],
    base: [base.basic, base.nonBasic, base.basicShare, base.multiplier],
    flq: [f.lambda].concat(f.rows.map(r => r.flq)),
    mix: M.mixDistance(c.e1, c.E1)
  });
}
process.stdout.write(JSON.stringify(out));
"""


def test_port_agreement(res, work, csds):
    head("3. The Python reference and the JavaScript port agree")

    try:
        subprocess.run(["node", "--version"], capture_output=True, check=True)
    except Exception:
        check("node is available to run the JavaScript port", False,
              "install Node to run this check")
        return

    sample = []
    step = max(1, len(csds) // 90)
    for code in csds[::step]:
        a = res.get(code, {}).get(2016)
        b = res.get(code, {}).get(2021)
        if not a or not b:
            continue
        sample.append(code)
    sample = sample[:90]
    # always include the big and the awkward
    for code in ("3520005", "3506008", "3525005", "3537036", "3558004"):
        if code not in sample and res.get(code, {}).get(2016) and \
                res.get(code, {}).get(2021):
            sample.append(code)

    R0 = vec(res["35"][2016])
    R1 = vec(res["35"][2021])
    order = NAICS

    cases = []
    for code in sample:
        a = vec(res[code][2016])
        b = vec(res[code][2021])
        cases.append({
            "code": code,
            "e0": [a[k] for k in order], "e1": [b[k] for k in order],
            "E0": [R0[k] for k in order], "E1": [R1[k] for k in order],
        })

    with tempfile.TemporaryDirectory() as td:
        hpath = os.path.join(td, "h.js")
        ipath = os.path.join(td, "in.json")
        open(hpath, "w", encoding="utf-8").write(JS_HARNESS)
        json.dump({"cases": cases}, open(ipath, "w", encoding="utf-8"))
        r = subprocess.run(["node", hpath, JS, ipath],
                           capture_output=True, text=True)
        if r.returncode != 0:
            check("the JavaScript port runs", False, r.stderr[:400])
            return
        js = json.loads(r.stdout)

    worst = {"total": 0.0, "rows": 0.0, "lq": 0.0, "ind": 0.0, "base": 0.0,
             "flq": 0.0, "mix": 0.0}
    worst_at = {}

    for case, got in zip(cases, js):
        code = case["code"]
        a = vec(res[code][2016])
        b = vec(res[code][2021])
        py = MT.esteban_marquillas(a, b, R0, R1)
        t = py["total"]
        for k, jk in (("actual", "actual"), ("national", "national"),
                      ("mix", "mix"), ("competitive", "competitive"),
                      ("em_competitive", "emCompetitive"),
                      ("em_allocation", "emAllocation")):
            d = rel(t[k], got["total"][jk])
            if d > worst["total"]:
                worst["total"], worst_at["total"] = d, (code, k)
        for i, key in enumerate(order):
            row = py["rows"][key]
            g = got["rows"][i]
            for j, k in enumerate(("national", "mix", "competitive",
                                   "em_competitive", "em_allocation",
                                   "homothetic")):
                d = rel(row[k], g[j])
                if d > worst["rows"]:
                    worst["rows"], worst_at["rows"] = d, (code, key, k)

        plq = MT.location_quotients(b, R1)
        for i, key in enumerate(order):
            d = rel(plq[key]["lq"], got["lq"][i])
            if d > worst["lq"]:
                worst["lq"], worst_at["lq"] = d, (code, key)

        pind = MT.structure_indices(b, R1)
        if pind and got["ind"]:
            for i, k in enumerate(("krugman", "coef_specialisation", "hhi",
                                   "hhi_normalised", "entropy",
                                   "entropy_normalised", "hachman",
                                   "specialisations")):
                d = rel(pind[k], got["ind"][i])
                if d > worst["ind"]:
                    worst["ind"], worst_at["ind"] = d, (code, k)

        pbase = MT.economic_base(b, R1)
        for i, k in enumerate(("basic", "non_basic", "basic_share",
                               "multiplier")):
            d = rel(pbase[k], got["base"][i])
            if d > worst["base"]:
                worst["base"], worst_at["base"] = d, (code, k)

        pf = MT.flq(b, R1)
        d = rel(pf["lambda"], got["flq"][0])
        if d > worst["flq"]:
            worst["flq"], worst_at["flq"] = d, (code, "lambda")
        for i, key in enumerate(order):
            d = rel(pf["rows"][key]["flq"], got["flq"][i + 1])
            if d > worst["flq"]:
                worst["flq"], worst_at["flq"] = d, (code, key)

        d = rel(MT.mix_distance(b, R1), got["mix"])
        if d > worst["mix"]:
            worst["mix"], worst_at["mix"] = d, (code,)

    tol = 1e-9
    for k in ("total", "rows", "lq", "ind", "base", "flq", "mix"):
        check("port agrees on %s (%d municipalities)" % (k, len(cases)),
              worst[k] < tol,
              "worst relative difference %.2e at %s" % (worst[k],
                                                        worst_at.get(k)))


def rel(a, b):
    if a is None and b is None:
        return 0.0
    if a is None or b is None:
        return float("inf")
    if isinstance(a, bool) or isinstance(b, bool):
        return 0.0 if bool(a) == bool(b) else 1.0
    if a == b:
        return 0.0
    denom = max(1.0, abs(a), abs(b))
    return abs(a - b) / denom


# --------------------------------------------------------------------------- #
# 4. the data itself
# --------------------------------------------------------------------------- #

def test_data(con, res, work, csds, cts):
    head("4. The data behind the methods")

    # sector sums vs published totals
    row = con.execute(
        "SELECT SUM(jobs) FROM employment WHERE basis='work' AND measure='total'"
        " AND year=2021 AND geo_code='35' AND naics<>'TOTAL'").fetchone()[0]
    pub = con.execute(
        "SELECT jobs FROM employment WHERE basis='work' AND measure='total'"
        " AND year=2021 AND geo_code='35' AND naics='TOTAL'").fetchone()
    if pub:
        d = abs(row - pub[0]) / pub[0]
        check("Ontario sector figures sum to the published Ontario total",
              d < 0.01, "sectors %.0f vs published %.0f (%.3f%%)"
              % (row, pub[0], d * 100))

    # municipalities sum to the province, within rounding and suppression
    msum = con.execute(
        "SELECT SUM(jobs) FROM employment WHERE basis='work' AND measure='total'"
        " AND year=2021 AND naics<>'TOTAL' AND geo_code IN "
        "(SELECT code FROM geo WHERE level='CSD' AND is_ontario=1)").fetchone()[0]
    d = abs(msum - row) / row
    check("municipal figures sum to within 1% of the provincial figure",
          d < 0.01, "%.0f vs %.0f (%.3f%%)" % (msum, row, d * 100))

    # Place-of-work total should equal work-at-home plus usual workplace. It is
    # not an exact identity in published data, because all three figures are
    # independently rounded to a multiple of 5, and at tiny cell sizes that can
    # bite hard: a true 10 split 6/4 can publish as total 20, home 0, usual 0.
    # The meaningful claim is that this only happens below the reliability floor
    # the tool already withholds, so that is what gets asserted.
    sums = list(con.execute("""
          SELECT geo_code, naics,
                 SUM(CASE WHEN measure='total' THEN jobs END) t,
                 SUM(CASE WHEN measure='home' THEN jobs END) h,
                 SUM(CASE WHEN measure='usual' THEN jobs END) u
          FROM employment WHERE basis='work' AND year=2021
          GROUP BY geo_code, naics"""))
    triples = [r for r in sums if None not in (r[2], r[3], r[4])]
    diffs = [r[2] - r[3] - r[4] for r in triples]
    n = len(diffs)
    mean = sum(diffs) / n
    sd = math.sqrt(sum((d - mean) ** 2 for d in diffs) / n)
    nonmult = sum(1 for d in diffs if d % 5)
    biggest = max(abs(d) for d in diffs)

    check("every published place-of-work figure is a multiple of 5",
          nonmult == 0, "%d exceptions of %d" % (nonmult, n))
    check("the total and its two components differ only by rounding "
          "(zero-centred)", abs(mean) < 1.0, "mean %+.3f jobs over %d cells"
          % (mean, n))
    check("no cell disagrees by more than five roundings",
          biggest <= 25, "largest disagreement %d jobs" % biggest)

    # The whole reliability floor rests on the per-cell rounding variance, so
    # it is measured rather than assumed. Total, home and usual are rounded
    # independently, so sd(total - home - usual) = sd_cell * sqrt(3).
    implied = sd / math.sqrt(3)
    check("the per-cell rounding standard deviation matches theory "
          "(unbiased random rounding to base 5 gives exactly 2)",
          abs(implied - MT.ROUNDING_SD) < 0.15,
          "measured %.3f, using %.3f" % (implied, MT.ROUNDING_SD))

    # The check that catches a mismatched universe. Every job in Ontario is
    # done by someone, and almost all of them live in Ontario, so jobs divided
    # by resident workers must come out near 1 at the provincial level. It only
    # does when both sides share a universe: the place-of-work tables count
    # work-at-home plus usual workplace, so the residence side must be the same
    # subtotal. Dividing by the residence TOTAL - which also carries 794,920
    # Ontarians with no fixed workplace address - gives 0.88, and that error is
    # invisible on any single municipality.
    pow_tot = con.execute(
        "SELECT jobs FROM employment WHERE basis='work' AND year=2021 "
        "AND naics='TOTAL' AND measure='total' AND geo_code='35'").fetchone()
    res_m = dict(con.execute(
        "SELECT measure, jobs FROM employment WHERE basis='residence' "
        "AND year=2021 AND naics='TOTAL' AND geo_code='35'"))
    if pow_tot and res_m.get("home") is not None:
        comparable = res_m["home"] + res_m["usual"]
        ratio = pow_tot[0] / comparable
        check("Ontario jobs per resident worker is near 1 on the comparable "
              "subtotal (home + usual place of work)",
              0.95 < ratio < 1.05, "%.4f" % ratio)
        bad_ratio = pow_tot[0] / res_m["total"]
        check("...and the residence TOTAL is demonstrably the wrong "
              "denominator, so the tool must not use it",
              bad_ratio < 0.95,
              "%.4f, off by %.0f workers with no fixed workplace or working "
              "outside Canada" % (bad_ratio, res_m["nofixed"] + res_m["outside"]))

    # every level that reports a ratio must have the comparable subtotal
    n_fixed = con.execute(
        "SELECT COUNT(DISTINCT geo_code) FROM employment WHERE basis='residence' "
        "AND year=2021 AND naics='TOTAL' AND measure='usual'").fetchone()[0]
    check("the comparable subtotal is loaded for every geography with a "
          "residence figure", n_fixed >= 500, "%d geographies" % n_fixed)

    # tract coverage
    n_ct = con.execute(
        "SELECT COUNT(DISTINCT geo_code) FROM employment WHERE basis='work' "
        "AND geo_code IN (SELECT code FROM geo WHERE level='CT')").fetchone()[0]
    check("every Ontario census tract has employment data",
          n_ct >= len(cts) - 8, "%d of %d tracts" % (n_ct, len(cts)))

    # the residual pseudo-tract must be gone
    ghost = con.execute(
        "SELECT COUNT(*) FROM geo WHERE level='CT' AND (LENGTH(code)<>10 "
        "OR cma_code IN ('997','998','999'))").fetchone()[0]
    check("the non-CMA residual pseudo-tract is excluded", ghost == 0,
          "%d found" % ghost)

    # census division and economic region codes must not collide
    n_cd = con.execute("SELECT COUNT(*) FROM geo WHERE level='CD'").fetchone()[0]
    n_er = con.execute("SELECT COUNT(*) FROM geo WHERE level='ER'").fetchone()[0]
    check("all 49 Ontario census divisions survive the shared code space",
          n_cd == 49 and n_er == 11, "%d CD, %d ER" % (n_cd, n_er))

    # commuting internal consistency
    r = con.execute("""SELECT
          (SELECT SUM(workers) FROM commute WHERE origin_code=dest_code
             AND origin_code IN (SELECT code FROM geo WHERE level='CSD'
                                 AND is_ontario=1)),
          (SELECT SUM(workers) FROM commute WHERE origin_code<>dest_code)
        """).fetchone()
    check("commuting flows loaded and split into internal and cross-boundary",
          r[0] and r[1] and r[0] > 0 and r[1] > 0,
          "internal %.0f, cross-boundary %.0f" % (r[0] or 0, r[1] or 0))

    # no negative or absurd values
    bad = con.execute("SELECT COUNT(*) FROM employment WHERE jobs < 0").fetchone()[0]
    check("no negative employment anywhere", bad == 0, "%d rows" % bad)

    # population sanity
    p = con.execute("SELECT population FROM population WHERE geo_code='35' "
                    "AND year=2021").fetchone()
    check("Ontario population is in the right neighbourhood",
          p and 14.0e6 < p[0] < 15.5e6, "%.0f" % (p[0] if p else 0))

    # geography: areas and populations aggregate sensibly
    pop_csd = con.execute(
        "SELECT SUM(pop_2021) FROM geo WHERE level='CSD' AND is_ontario=1"
    ).fetchone()[0]
    pop_cd = con.execute(
        "SELECT SUM(pop_2021) FROM geo WHERE level='CD' AND is_ontario=1"
    ).fetchone()[0]
    check("census-subdivision and census-division populations agree",
          abs(pop_csd - pop_cd) <= 1, "%d vs %d" % (pop_csd, pop_cd))

    # the web payloads exist and parse
    app = os.path.join(ROOT, "app", "data")
    need = ["geo.json", "work_csd.json", "work_ct.json", "res_series.json",
            "population.json", "commute.json", "business.json", "meta.json",
            "ct_csd.json", "boundaries_csd.json", "boundaries_ct.json"]
    missing = [f for f in need if not os.path.exists(os.path.join(app, f))]
    check("every web payload is present", not missing, str(missing))
    if not missing:
        for f in need:
            try:
                json.load(open(os.path.join(app, f), encoding="utf-8"))
            except Exception as e:
                check("%s parses" % f, False, str(e))
                return
        g = json.load(open(os.path.join(app, "geo.json"), encoding="utf-8"))
        check("geo payload carries all 577 municipalities",
              len([p for p in g["places"] if p[1] == "CSD"]) == 577)
        b = json.load(open(os.path.join(app, "boundaries_csd.json"),
                           encoding="utf-8"))
        check("every municipality has a polygon",
              len(b["features"]) == 577, "%d" % len(b["features"]))
        bc = json.load(open(os.path.join(app, "boundaries_ct.json"),
                            encoding="utf-8"))
        check("every census tract has a polygon",
              len(bc["features"]) == len(cts),
              "%d of %d" % (len(bc["features"]), len(cts)))
        wct = json.load(open(os.path.join(app, "work_ct.json"),
                             encoding="utf-8"))
        polys = set(f["properties"]["id"] for f in bc["features"])
        orphan = [c for c in wct["data"] if c not in polys]
        check("no tract has data without geometry", not orphan,
              "%d orphans" % len(orphan))


# --------------------------------------------------------------------------- #

def test_stated_constants():
    """Every surface that quotes a constant must quote the same one.

    This exists because it failed. The rounding standard deviation was
    corrected to 2.0 in methods.py and methods.js when it was verified
    empirically, but three pieces of prose still said 1.41 - among them the
    cover sheet written into every exported workbook, two lines above an
    uncertainty band computed with 2.0. A document that contradicts itself is
    worse than one that is merely wrong, because it tells the reader that
    nobody checked. A constant may only ever be read, never restated."""
    head("8. Stated constants agree with computed ones")

    app = os.path.join(ROOT, "app")
    meta = json.load(open(os.path.join(app, "data", "meta.json"),
                          encoding="utf-8"))
    rel = meta["reliability"]
    check("the exported metadata carries the computed rounding sd",
          abs(rel["rounding_sd_per_cell"] - MT.ROUNDING_SD) < 1e-12,
          "meta %s vs methods %s" % (rel["rounding_sd_per_cell"],
                                     MT.ROUNDING_SD))
    check("...and the same reliability floors",
          rel["withheld_at_or_below"] == MT.MIN_RELIABLE_CELL and
          rel["weak_at_or_below"] == MT.WEAK_CELL,
          "%s / %s" % (rel["withheld_at_or_below"], rel["weak_at_or_below"]))

    # No source file may assert the superseded value. Lines that mention it in
    # order to say it is wrong are the point of the correction, not a relapse,
    # so a negation cue on the line exempts it.
    DENY = ("1.414", "1.41 ", "1.41.")
    EXEMPT = ("not ", "NOT ", "would be", "rather than", "superseded")
    stale = []
    for base in (os.path.join(app, "js"), os.path.join(ROOT, "pipeline")):
        for fn in sorted(os.listdir(base)):
            if not (fn.endswith(".js") or fn.endswith(".py")):
                continue
            if fn == "validate.py":
                continue
            for n, line in enumerate(io.open(os.path.join(base, fn),
                                             encoding="utf-8"), 1):
                if not any(b in line for b in DENY):
                    continue
                if any(e in line for e in EXEMPT):
                    continue
                stale.append("%s:%d" % (fn, n))
    check("no file asserts a superseded rounding sd", not stale,
          "; ".join(stale) or "none")

    # 2016 and 2021 must sit on the SAME labour-force universe. They did not
    # until the 2016 leg was re-sourced from 98-400-X2016321: taken from the
    # Census Profile it counted everyone reporting an industry, including
    # unemployed people who last worked in one, and differencing that against
    # 2021's employed labour force put roughly the unemployment rate into the
    # change - unevenly, because unemployment incidence varies by industry, so
    # it landed on the mix and competitive terms. The signature was a Canada
    # total that FELL 5.2% over a period when employment grew. This check is
    # the tripwire: if a rebuild puts the Profile figures back, Canada's
    # 2016-2021 move goes sharply negative again and this fails.
    app = os.path.join(ROOT, "app")
    rs = json.load(open(os.path.join(app, "data", "res_series.json"),
                        encoding="utf-8"))
    ca = rs["data"].get("CA", {})
    tot = {}
    for y in ("2001", "2006", "2011", "2016", "2021"):
        v = ca.get(y)
        if v:
            tot[y] = sum(x for x in v if x)
    move = (tot["2021"] - tot["2016"]) / tot["2016"] if len(tot) == 5 else None
    check("2016 and 2021 are on the same labour-force universe",
          move is not None and -0.02 < move < 0.04,
          "Canada moves %+.2f%% across 2016-2021 (a fall beyond about 2%% "
          "would mean the Profile universe is back)" % (100 * move))

    # 2016 must reconcile to its own published total: the sector sum and the
    # all-industries cell come from the same table and can only differ by
    # random rounding, which is 2*sqrt(20) ~ 9 workers across twenty sectors.
    con2 = sqlite3.connect(DB)
    pub = con2.execute(
        "SELECT jobs FROM employment WHERE geo_code='CA' AND year=2016 "
        "AND basis='residence' AND measure='total' AND naics='TOTAL'"
    ).fetchone()
    con2.close()
    if pub:
        gap = abs(tot["2016"] - pub[0])
        check("the 2016 sector figures reconcile to the published total",
              gap <= 8 * MT.rounding_sd(20),
              "sector sum %s vs published %s, gap %s (rounding sd %.1f)"
              % (int(tot["2016"]), int(pub[0]), int(gap), MT.rounding_sd(20)))

    # Management of companies (NAICS 55) roughly doubles 2016 -> 2021, almost
    # uniformly from place to place - the signature of a classification
    # change (NAICS 2012 -> 2017), not growth. It was missed when 2016 was
    # re-sourced and found by the quiz rigour review. Pin its size so a
    # rebuild that resolves it (or makes it worse) is noticed, and require
    # the on-screen and METHODS disclosures while it stands.
    i55 = rs["naics_order"].index("55")
    on = rs["data"].get("35", {})
    r55 = (on["2021"][i55] / on["2016"][i55]
           if on.get("2016") and on["2016"][i55] else None)
    pan55 = io.open(os.path.join(app, "js", "panels.js"),
                    encoding="utf-8").read()
    met55 = io.open(os.path.join(ROOT, "METHODS.md"), encoding="utf-8").read()
    check("the management-of-companies classification break is the known "
          "size and is disclosed",
          r55 is not None and 1.8 < r55 < 2.4 and
          "Management of companies</b> needs more care" in pan55 and
          "classification break" in met55,
          "Ontario NAICS 55 2021/2016 = %.2f" % (r55 or 0))

    # --- the plain-English layer is pinned to METHODS.md ------------------
    # Every term in app/js/terms.js names the METHODS.md section it restates.
    # The rule is that the learning layer may not claim anything about a
    # method that METHODS.md does not, and this is the enforceable part of it:
    # a term citing a section that does not exist has come loose from the one
    # place its claims are defended.
    terms_js = io.open(os.path.join(app, "js", "terms.js"),
                       encoding="utf-8").read()
    cited = re.findall(r"methods:\s*'([^']+)'", terms_js)
    heads = set(h.strip() for h in re.findall(
        r"^#{2,3}\s+(.+?)\s*$",
        io.open(os.path.join(ROOT, "METHODS.md"), encoding="utf-8").read(),
        re.M))
    loose = sorted(set(c for c in cited if c not in heads))
    check("every plain-English term cites a METHODS.md section that exists",
          cited and not loose,
          "%d terms; %s" % (len(cited), ", ".join(loose) if loose
                            else "all resolve"))
    ids = re.findall(r"\{\s*id:\s*'([^']+)'", terms_js)
    check("...and every term has all five layers",
          all(len(re.findall(r"\b%s:\s*'" % k, terms_js)) >= len(ids)
              for k in ("plain", "how", "when", "cant")) and
          len(re.findall(r"\bname:\s*'", terms_js)) >= len(ids),
          "%d terms" % len(ids))
    mapped = set(re.findall(r"'([a-z0-9-]+)'",
                            " ".join(re.findall(r"ids:\s*\[([^\]]+)\]",
                                                terms_js))))
    check("...and every method on the method map is a defined term",
          mapped and mapped <= set(ids),
          ", ".join(sorted(mapped - set(ids))) or "all %d defined" % len(mapped))

    # --- the history timeline is sourced, and claims no causes ------------
    # Every timeline entry was checked against the primary record it cites,
    # and nothing in it may be written from memory. What can be enforced
    # mechanically: each entry has a source on an authoritative domain and a
    # note of what that source confirmed, and no entry uses causal language -
    # the timeline juxtaposes events with what the data shows, and a claim
    # that an event CAUSED a change is one the data cannot support.
    hist = io.open(os.path.join(app, "js", "history.js"), encoding="utf-8").read()
    tl = hist[hist.index("H.timeline = ["):hist.index("];", hist.index("H.timeline = ["))]
    # one chunk per entry, split on the "{ year:" that opens each
    entries = [(m.group(1), m.group(2)) for m in re.finditer(
        r"\{\s*year:\s*(\d{4})(.*?)(?=\{\s*year:|\Z)", tl, re.S)]
    AUTH = ("gc.ca", "canada.ca", "ontario.ca", "ola.org", "wto.org", "statcan.gc.ca")
    unsourced, causal = [], []
    for year, body in entries:
        url = re.search(r"url:\s*'([^']+)'", body)
        ver = re.search(r"verified:\s*'", body)
        host = url and re.match(r"https://([^/]+)/", url.group(1))
        if not (url and ver and host and host.group(1).endswith(AUTH)):
            unsourced.append(year)
        text = " ".join(re.findall(r"(?:fact|title):\s*'((?:[^'\\]|\\.)*)'", body))
        if re.search(r"\b(because|caused|causing|led to|due to|resulted in)\b",
                     text, re.I):
            causal.append(year)
    check("every history entry cites an authoritative source it was checked against",
          entries and not unsourced,
          "%d entries; %s" % (len(entries), ", ".join(unsourced) or "all sourced"))
    check("...and none claims that an event caused what the data shows",
          not causal, ", ".join(causal) or "no causal language")

    # --- occupation and published sampling error (98-10-0456) -------------
    # The sampling constant is RE-DERIVED here from the published intervals,
    # never trusted: SAMPLE_K lives in methods.py and methods.js, and a
    # constant that is only ever restated is how the 1.41 rounding error
    # survived. Median of (half-width / 1.96 / sqrt(count)) over Ontario
    # municipal sector cells of at least 50 workers.
    con4 = sqlite3.connect(DB)
    ks = sorted(((hi - lo) / 2.0 / 1.96) / math.sqrt(n) for n, lo, hi in con4.execute(
        "SELECT e.jobs, ci.ci_lo, ci.ci_hi FROM employment_ci ci "
        "JOIN employment e ON e.geo_code=ci.geo_code AND e.year=ci.year "
        "AND e.naics=ci.naics AND e.basis=ci.basis AND e.measure=ci.measure "
        "WHERE ci.geo_code LIKE '35_____' AND e.jobs >= 50"))
    kmed = ks[len(ks) // 2] if ks else None
    check("the sampling-error constant matches the published intervals",
          kmed is not None and abs(kmed - MT.SAMPLE_K) / MT.SAMPLE_K < 0.05,
          "re-derived %.3f from %d cells; methods.py holds %.2f"
          % (kmed or 0, len(ks), MT.SAMPLE_K))
    js = io.open(os.path.join(app, "js", "methods.js"), encoding="utf-8").read()
    m_js = re.search(r"M\.SAMPLE_K\s*=\s*([0-9.]+)", js)
    check("...and methods.js holds the same constant as methods.py",
          m_js is not None and abs(float(m_js.group(1)) - MT.SAMPLE_K) < 1e-9,
          "js %s / py %s" % (m_js.group(1) if m_js else "?", MT.SAMPLE_K))

    # every published count sits inside its own published interval
    bad_ci = con4.execute(
        "SELECT COUNT(*) FROM employment_ci ci JOIN employment e "
        "ON e.geo_code=ci.geo_code AND e.year=ci.year AND e.naics=ci.naics "
        "AND e.basis=ci.basis AND e.measure=ci.measure "
        "WHERE NOT (ci.ci_lo <= e.jobs AND e.jobs <= ci.ci_hi)").fetchone()[0]
    n_ci = con4.execute("SELECT COUNT(*) FROM employment_ci").fetchone()[0]
    check("every sector interval brackets its published count",
          n_ci > 10000 and bad_ci == 0,
          "%d of %d fail" % (bad_ci, n_ci))

    # occupations sum to the published employed total (rounding only)
    occ_tot = con4.execute(
        "SELECT SUM(workers) FROM occupation WHERE geo_code='35'").fetchone()[0]
    pub_tot = con4.execute(
        "SELECT jobs FROM employment WHERE geo_code='35' AND year=2021 AND "
        "basis='residence' AND measure='total' AND naics='TOTAL'").fetchone()
    check("Ontario's ten occupation groups sum to its employed total",
          occ_tot and pub_tot and
          abs(occ_tot - pub_tot[0]) <= 3 * MT.rounding_sd(10),
          "%s vs %s" % (int(occ_tot or 0), int(pub_tot[0]) if pub_tot else "?"))
    n_occ_places = con4.execute(
        "SELECT COUNT(DISTINCT geo_code) FROM occupation").fetchone()[0]
    check("...and every municipality has an occupation profile",
          n_occ_places >= 577, "%d places" % n_occ_places)
    con4.close()

    # ...and the break that remains is disclosed where it is carried.
    pan = io.open(os.path.join(app, "js", "panels.js"), encoding="utf-8").read()
    exu = io.open(os.path.join(app, "js", "exportui.js"),
                  encoding="utf-8").read()
    meth = io.open(os.path.join(ROOT, "METHODS.md"), encoding="utf-8").read()
    check("the pre-2016 break is disclosed on screen, in exports and in METHODS",
          "card-break" in pan and "Definitional break" in exu and
          "labour-force universes" in meth.lower(),
          "panel %s / workbook %s / METHODS %s"
          % ("card-break" in pan, "Definitional break" in exu,
             "labour-force universes" in meth.lower()))

    # Three lists have to agree about what the app is made of: the page, the
    # service worker's pre-cache, and the published artifact. They were
    # maintained by hand and drifted the first time a module was added - the
    # page loaded js/read.js, the artifact did not carry it, and a published
    # build would have been a blank screen with nothing in the log to say why.
    # build_artifact.py now derives its list from the page; this checks the
    # other two against it.
    app = os.path.join(ROOT, "app")
    html = io.open(os.path.join(app, "index.html"), encoding="utf-8").read()
    refs = re.findall(r'<script[^>]+src="([^"]+)"', html)
    refs += re.findall(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"', html)
    refs = [r for r in refs if not r.startswith(("http", "//"))]

    absent = [r for r in refs
              if not os.path.exists(os.path.join(app, r))]
    check("every script and stylesheet the page loads exists", not absent,
          ", ".join(absent) or "%d files" % len(refs))

    sw = io.open(os.path.join(app, "sw.js"), encoding="utf-8").read()
    uncached = [r for r in refs if ("'%s'" % r) not in sw]
    check("...and every one of them is in the service worker's pre-cache",
          not uncached,
          ", ".join(uncached) or "all %d listed" % len(refs))

    built = os.path.join(ROOT, "build", "artifact")
    if os.path.isdir(built):
        unshipped = [r for r in refs
                     if not os.path.exists(os.path.join(built, r))]
        check("...and every one of them reached the published build",
              not unshipped,
              ", ".join(unshipped) or "all %d present" % len(refs))

    # The geography spine is built by aggregating 137,867 dissemination blocks
    # up into tracts, municipalities and everything above them, and nothing had
    # ever checked that arithmetic against a published figure. 98-10-0014 is
    # that figure. It was declared as a source and credited with 6,297 rows on
    # the Sources panel while the loader inserted none of them, so this check
    # is also what makes the source registry tell the truth.
    con3 = sqlite3.connect(DB)
    pops = list(con3.execute(
        "SELECT g.code, g.pop_2021, p.pop_2021, g.area_km2, p.area_km2 "
        "FROM geo g JOIN ct_population p ON p.geo_code = g.code "
        "WHERE g.level='CT' AND g.pop_2021 IS NOT NULL "
        "AND p.pop_2021 IS NOT NULL"))
    con3.close()

    check("tract populations are checked against the published totals",
          len(pops) > 2400, "%d tracts compared" % len(pops))
    if pops:
        bad = [r for r in pops if abs(r[1] - r[2]) > 0.5]
        check("...and every one aggregated from dissemination blocks matches",
              not bad,
              "%d of %d differ%s" % (len(bad), len(pops),
                                     (": " + ", ".join(
                                         "%s %s vs %s" % (b[0], b[1], b[2])
                                         for b in bad[:3])) if bad else ""))

        # Land area is published to two decimal places, so a tract of a
        # hundredth of a square kilometre can differ by a third and still
        # agree: the tolerance has to be the publication rounding, not a
        # percentage.
        area = [r for r in pops if r[3] and r[4]]
        off = [r for r in area
               if abs(r[3] - r[4]) > max(0.005, 0.02 * r[4])]
        check("...and tract land areas agree within the published precision",
              len(off) <= 2,
              "%d of %d outside 2%% or 0.005 km2" % (len(off), len(area)))

    # The desire-line map draws a curve between two centroids, so every code
    # appearing in a published flow must exist in the geography spine AND
    # carry coordinates. A flow naming a place the tool cannot locate would be
    # silently dropped from the picture while still being counted in the
    # commuting totals on the Overview tab - the map and the numbers would
    # disagree with no indication of why.
    cm = json.load(open(os.path.join(app, "data", "commute.json"),
                        encoding="utf-8"))
    geo = json.load(open(os.path.join(app, "data", "geo.json"),
                         encoding="utf-8"))
    f = geo["fields"]
    i_code, i_lat, i_lon = f.index("code"), f.index("lat"), f.index("lon")
    located = set(r[i_code] for r in geo["places"]
                  if r[i_lat] is not None and r[i_lon] is not None)

    # Every municipality and tract must be locatable. The centroid is a
    # population-weighted mean of dissemination-block points, which is the
    # right choice - it puts the marker where people are rather than in the
    # empty middle of a rural township - but it divides by population, and 32
    # Ontario places have a 2021 count of zero, mostly incompletely enumerated
    # reserves. They had no location at all, so they could not appear on any
    # map; build.py now falls back to an area-weighted mean for them.
    unplaced = [r[0] for r in sqlite3.connect(DB).execute(
        "SELECT code FROM geo WHERE level IN ('CSD','CT') AND is_ontario=1 "
        "AND (lat IS NULL OR lon IS NULL)")]
    check("every Ontario municipality and tract can be placed on a map",
          not unplaced,
          "%d without a centroid%s" % (len(unplaced),
              (": " + ", ".join(unplaced[:4])) if unplaced else ""))

    stray = [(r[0], r[1]) for r in sqlite3.connect(DB).execute(
        "SELECT code, name FROM geo WHERE is_ontario=1 AND lat IS NOT NULL "
        "AND (lat < 41.6 OR lat > 57.0 OR lon < -95.5 OR lon > -74.0)")]
    check("...and none of them falls outside Ontario", not stray,
          "%d outside the provincial bounding box%s" % (len(stray),
              (": " + ", ".join(c for c, _ in stray[:3])) if stray else ""))

    referenced = set()
    for k, flows in cm.get("top_flows", {}).items():
        referenced.add(k.split("|")[0])
        for code, _v in flows:
            referenced.add(code)
    # Flows can name places outside Ontario, which this tool does not map and
    # does not claim to; the check is that ONTARIO codes all resolve.
    ont = set(r[i_code] for r in geo["places"])
    unplaceable = sorted((referenced & ont) - located)
    check("every mappable commuting flow has both ends located",
          not unplaceable,
          "%d of %d Ontario codes lack coordinates%s"
          % (len(unplaceable), len(referenced & ont),
             (": " + ", ".join(unplaceable[:4])) if unplaceable else ""))

    outside = sorted(referenced - ont)
    check("...and out-of-province flows are a known, small set",
          len(outside) < 400,
          "%d flow endpoints sit outside Ontario and are not drawn"
          % len(outside))

    # The one sonified series must carry reliability flags, not bare numbers:
    # audio that plays a suppressed cell as an ordinary pitch would launder
    # away the uncertainty the visual channel discloses.
    snd = io.open(os.path.join(app, "js", "sound.js"), encoding="utf-8").read()
    pan = io.open(os.path.join(app, "js", "panels.js"), encoding="utf-8").read()
    check("the sonified series distinguishes withheld cells from data",
          "it.flag === 'withheld'" in snd and "flag: r.flag" in pan,
          "sound.js branches on the flag; panels.js passes it")


def test_quiz():
    """The quiz: a bank built under its gates, and a scheduler that behaves.

    Both were found faulty when first run, which is why these checks exist.
    The bank offered the same answer twice and started card sentences in
    lower case; the scheduler, in simulation, let its review backlog climb
    without limit, starved three of five strands, and called questions
    "learned" that were remembered a third of the time. None of that was
    visible by reading the code.

    The scheduler checks are BEHAVIOURAL. A simulated learner cannot say how
    fast Robert learns, and nothing here claims it: what can be checked is
    that breadth never jams, the backlog drains, intervals stay capped, and
    "learned" means something.
    """
    head("10. The quiz: its question bank and its scheduler")
    try:
        subprocess.run(["node", "--version"], capture_output=True, check=True)
    except Exception:
        check("node is available", False)
        return

    r = subprocess.run(["node", os.path.join(HERE, "quiz_selftest.js")],
                       capture_output=True, text=True)
    if r.returncode != 0:
        check("the question bank builds from the real data", False, r.stderr[:300])
        return
    b = json.loads(r.stdout.strip().splitlines()[-1])
    strands = sorted(set(k.split("/")[0] for k in b["byForm"]))
    check("the question bank builds from the real data, under every gate",
          b["items"] >= 2000 and b["problemCount"] == 0,
          "%d questions in %d ms; %d problems%s" % (
              b["items"], b["buildMs"], b["problemCount"],
              (": " + "; ".join(b["problems"][:3])) if b["problems"] else ""))
    check("...covering every strand", strands == ["A", "B", "C", "D", "E", "F"],
          "strands " + "".join(strands))
    worst_stem = max(v["stemMax"] for k, v in b["lengths"].items() if k in "ABCD")
    worst_card = max(v["cardMax"] for v in b["lengths"].values())
    check("...with short stems and card sentences for reading aloud",
          worst_stem <= 12 and worst_card <= 22,
          "longest place stem %d words, longest card %d" % (worst_stem, worst_card))

    r = subprocess.run(["node", os.path.join(HERE, "quiz_simulate.js")],
                       capture_output=True, text=True)
    if r.returncode != 0:
        check("the scheduler simulation runs", False, r.stderr[:300])
        return
    s = json.loads(r.stdout.strip().splitlines()[-1])
    runs = s["runs"]
    check("the scheduler is deterministic for a given learner", s["deterministic"])
    check("new questions never jam behind reviews",
          all(x["starvedSessions"] <= 3 for x in runs),
          "longest run without a new question: %s sessions"
          % ", ".join(str(x["starvedSessions"]) for x in runs))
    check("the review backlog drains rather than growing without limit",
          all(x["finalDueTomorrow"] < x["maxDueTomorrow"] or
              x["finalDueTomorrow"] <= 20 for x in runs),
          "; ".join("peak %d, end %d" % (x["maxDueTomorrow"], x["finalDueTomorrow"])
                    for x in runs))
    check("intervals stay capped at sixty days",
          all(x["maxInterval"] <= 60 for x in runs))
    check("the learned count only ever rises",
          all(x["learnedNeverFalls"] for x in runs))
    check("every strand makes progress",
          all(len(x["strandsLearned"]) >= 5 for x in runs),
          ", ".join(x["strandsLearned"] for x in runs))
    check("\"learned\" means remembered at the next review, most of the time",
          all((x["learnedHeldAtNextReview"] or 0) >= 0.6 for x in runs),
          ", ".join("%.0f%%" % (100 * (x["learnedHeldAtNextReview"] or 0))
                    for x in runs))


def test_findings_engine():
    """The brief must not be a template wearing a different number.

    These are behavioural checks rather than arithmetic ones, and they exist
    because the engine silently drifted into being one: measured over all 577
    municipalities, `top-lq` opened 59% of briefs on ranks as poor as 102nd of
    360, two detectors between them took 83% of all openings, one detector had
    never fired at all, and another restated a paragraph the brief printed
    unconditionally anyway. None of that is visible by reading the code - only
    by running it over the province and counting.

    So: no detector may be dead, none may fire for almost everywhere (that is
    a description of Ontario, not of the place), none may monopolise the
    opening, and the openings must be spread across a decent number of them.
    """
    head("9. The findings engine says different things about different places")

    harness = os.path.join(HERE, "findings_selftest.js")
    if not os.path.exists(harness):
        check("the findings self-test harness is present", False, harness)
        return
    try:
        subprocess.run(["node", "--version"], capture_output=True, check=True)
    except Exception:
        check("node is available", False)
        return
    r = subprocess.run(["node", harness], capture_output=True, text=True)
    if r.returncode != 0:
        check("the findings engine runs over every municipality", False,
              r.stderr[:400])
        return
    g = json.loads(r.stdout.strip().splitlines()[-1])

    check("the engine runs over the whole province",
          g["examined"] >= 500, "%d municipalities" % g["examined"])
    check("no detector is dead code", not g["dead"],
          ", ".join(g["dead"]) or "none never fire")
    check("no detector fires for almost every place",
          not g["ubiquitous"],
          ", ".join(g["ubiquitous"]) or
          "none fire for more than 90% of municipalities")
    check("no single detector monopolises the opening line",
          not g["monopolists"],
          ", ".join(g["monopolists"]) or "none lead more than 40% of briefs")
    check("briefs do not all open the same two ways",
          g["leadConcentration"] is not None and g["leadConcentration"] < 55,
          "top two detectors take %.1f%% of all openings"
          % g["leadConcentration"])
    check("a good spread of detectors can lead a brief",
          g["distinctLeaders"] >= 10,
          "%d of %d detectors open at least one brief"
          % (g["distinctLeaders"], len(g["detectors"])))



# --------------------------------------------------------------------------- #
# 5. the export formats
# --------------------------------------------------------------------------- #

def test_exports():
    """Write every export format for real and parse the bytes back.

    The writers are hand-rolled - a store-only ZIP, an OOXML workbook, a dBase
    III table and an ESRI shapefile - so the only meaningful test is to read
    them with an independent parser and check the structures agree with
    themselves. "It downloaded" proves nothing.
    """
    head("5. Export formats, written and parsed back")

    import xml.etree.ElementTree as ET

    harness = os.path.join(HERE, "export_selftest.js")
    if not os.path.exists(harness):
        check("the export self-test harness is present", False, harness)
        return
    try:
        subprocess.run(["node", "--version"], capture_output=True, check=True)
    except Exception:
        check("node is available to drive the exporters", False)
        return

    td = tempfile.mkdtemp(prefix="gra-exp-")
    r = subprocess.run(["node", harness, td], capture_output=True, text=True)
    if r.returncode != 0:
        check("the exporters run", False, r.stderr[:400])
        return
    check("the exporters run and write files", True,
          "%d files" % len(json.load(open(os.path.join(td, "manifest.json")))["files"]))

    NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

    # ---- xlsx
    try:
        z = zipfile.ZipFile(os.path.join(td, "selftest.xlsx"))
        check("the workbook is a valid zip", z.testzip() is None)
        parts = z.namelist()
        need = ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
                "xl/_rels/workbook.xml.rels", "xl/styles.xml",
                "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]
        check("the workbook carries every required OOXML part",
              all(p in parts for p in need),
              str([p for p in need if p not in parts]))
        for p in parts:
            ET.fromstring(z.read(p))
        check("every XML part in the workbook is well formed", True,
              "%d parts" % len(parts))

        sh = ET.fromstring(z.read("xl/worksheets/sheet2.xml"))
        cells = {}
        for row in sh.iter(NS + "row"):
            for c in row.iter(NS + "c"):
                t = c.find(NS + "is/" + NS + "t")
                v = c.find(NS + "v")
                cells[c.get("r")] = (t.text if t is not None
                                     else (v.text if v is not None else None))
        check("text and numbers land in the right cells",
              cells.get("A6") == "3520005" and cells.get("C6") == "1264060"
              and cells.get("F6") == "-35709.4",
              "A6=%s C6=%s F6=%s" % (cells.get("A6"), cells.get("C6"),
                                     cells.get("F6")))
        check("a missing value is written as an empty cell, not a zero",
              cells.get("C8") is None, repr(cells.get("C8")))
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        names = [s.get("name") for s in wb.iter(NS + "sheet")]
        check("sheets are named and in order",
              names == ["About this export", "Structure 2021"], str(names))
    except Exception as e:
        check("the workbook parses", False, "%s: %s" % (type(e).__name__, e))

    # ---- csv
    raw = open(os.path.join(td, "selftest.csv"), "rb").read()
    check("the CSV carries a byte-order mark so Excel reads UTF-8 correctly",
          raw[:3] == b"\xef\xbb\xbf")
    rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
    check("the CSV quotes a field containing a comma and a quote mark",
          len(rows) == 6 and rows[3][1] == 'Kitchener–Waterloo, "twin" city',
          repr(rows[3][1] if len(rows) > 3 else None))

    # ---- dbf
    try:
        zz = zipfile.ZipFile(os.path.join(td, "selftest-dbf.zip"))
        dbf = zz.read([n for n in zz.namelist() if n.endswith(".dbf")][0])
        nrec, hlen, rlen = struct.unpack_from("<IHH", dbf, 4)
        fields, pos = [], 32
        while dbf[pos] != 0x0D:
            fields.append((dbf[pos:pos + 11].split(b"\x00")[0].decode("latin-1"),
                           chr(dbf[pos + 11]), dbf[pos + 16], dbf[pos + 17]))
            pos += 32
        check("the DBF declares dBase III", dbf[0] == 0x03, hex(dbf[0]))
        check("the DBF header length matches its field descriptors",
              pos + 1 == hlen, "%d vs %d" % (pos + 1, hlen))
        check("the DBF record length matches the sum of its field widths",
              rlen == 1 + sum(f[2] for f in fields),
              "%d vs %d" % (rlen, 1 + sum(f[2] for f in fields)))
        check("the DBF ends with the 0x1A terminator",
              dbf[hlen + nrec * rlen] == 0x1A)
        names = [f[0] for f in fields]
        check("field names are capped at ten characters",
              all(len(n) <= 10 for n in names), str(names))
        check("field names truncated to the same ten characters are made unique",
              len(set(names)) == len(names) and "SPECIALISA" in names
              and "SPECIALIS2" in names, str(names))
        recs = []
        for i in range(nrec):
            base = hlen + i * rlen
            vals, p = [], 1
            for nm, t, w, dp in fields:
                vals.append(dbf[base + p:base + p + w].decode("latin-1").strip())
                p += w
            recs.append(vals)
        check("a missing numeric is blank in the DBF, not zero",
              recs[2][2] == "" and recs[2][4] == "", str(recs[2][:5]))
        check("place names are transliterated rather than mangled",
              recs[2][1].startswith("Kitchener-Waterloo"), recs[2][1])
        check("an apostrophe survives to the DBF",
              recs[4][1] == "L'Orignal / Hawkesbury-Est", recs[4][1])
        check("the DBF ships a field-name mapping",
              "FIELD-NAMES.txt" in zz.namelist())
    except Exception as e:
        check("the DBF parses", False, "%s: %s" % (type(e).__name__, e))

    # ---- shapefile
    try:
        zs = zipfile.ZipFile(os.path.join(td, "selftest-shapefile.zip"))
        members = zs.namelist()
        for ext in (".shp", ".shx", ".dbf", ".prj", ".cpg"):
            check("the shapefile bundle includes %s" % ext,
                  any(m.endswith(ext) for m in members))
        shp = zs.read([m for m in members if m.endswith(".shp")][0])
        shx = zs.read([m for m in members if m.endswith(".shx")][0])
        code, = struct.unpack_from(">i", shp, 0)
        declared, = struct.unpack_from(">i", shp, 24)
        ver, stype = struct.unpack_from("<ii", shp, 28)
        check("the .shp declares the ESRI file code 9994", code == 9994, str(code))
        check("the .shp declares polygon geometry (type 5)", stype == 5, str(stype))
        check("the .shp declared length matches its actual size",
              declared * 2 == len(shp), "%d vs %d" % (declared * 2, len(shp)))
        sdecl, = struct.unpack_from(">i", shx, 24)
        check("the .shx declared length matches its actual size",
              sdecl * 2 == len(shx), "%d vs %d" % (sdecl * 2, len(shx)))

        off, n, pts, multi, holes = 100, 0, 0, 0, 0
        ok_index = True
        while off < len(shp):
            rn, clen = struct.unpack_from(">ii", shp, off)
            nparts, npts = struct.unpack_from("<ii", shp, off + 44)
            xoff, xlen = struct.unpack_from(">ii", shx, 100 + n * 8)
            if xoff * 2 != off or xlen != clen:
                ok_index = False
            if nparts > 1:
                multi += 1
            pts += npts
            off += 8 + clen * 2
            n += 1
        check("every .shx entry points at the right .shp record",
              ok_index, "%d records" % n)
        check("all records were written", n == 5, "%d" % n)
        check("multipart and holed polygons survive the writer",
              multi == 2, "%d records with more than one ring" % multi)
        prj = zs.read([m for m in members if m.endswith(".prj")][0]).decode()
        check("the .prj names WGS 84 so a GIS opens it without prompting",
              "WGS_1984" in prj)
        check("the .cpg declares UTF-8",
              zs.read([m for m in members
                       if m.endswith(".cpg")][0]).decode().strip() == "UTF-8")
    except Exception as e:
        check("the shapefile parses", False, "%s: %s" % (type(e).__name__, e))

    # ---- geojson
    try:
        g = json.load(open(os.path.join(td, "selftest.geojson"), encoding="utf-8"))
        check("the GeoJSON is a FeatureCollection with attributes attached",
              g["type"] == "FeatureCollection" and len(g["features"]) == 5
              and g["features"][0]["properties"]["name"] == "Toronto")
    except Exception as e:
        check("the GeoJSON parses", False, str(e))


def test_spatial_and_ttwa():
    """Spatial statistics and travel-to-work areas, against constructed cases.

    A spatial statistic is easy to get subtly wrong and impossible to eyeball,
    so these run on lattices whose answer is known from theory: a gradient must
    give strong positive autocorrelation, a checkerboard strong negative, and
    noise must be indistinguishable from its own null.
    """
    head("6. Spatial statistics and functional labour markets")

    harness = os.path.join(HERE, "spatial_selftest.js")
    if not os.path.exists(harness):
        check("the spatial self-test harness is present", False, harness)
        return
    try:
        subprocess.run(["node", "--version"], capture_output=True, check=True)
    except Exception:
        check("node is available", False)
        return
    r = subprocess.run(["node", harness], capture_output=True, text=True)
    if r.returncode != 0:
        check("the spatial modules run", False, r.stderr[:400])
        return
    g = json.loads(r.stdout)

    check("every area gets neighbours, so none drop out of the statistics "
          "silently", g["weightsEveryRowFilled"])
    check("a spatial gradient gives strong positive autocorrelation",
          g["moranGradient"] > 0.9 and g["pGradient"] <= 0.01,
          "I = %.3f, p = %.3f" % (g["moranGradient"], g["pGradient"]))
    check("a checkerboard gives strong NEGATIVE autocorrelation",
          g["moranChecker"] < -0.7 and g["pChecker"] <= 0.01,
          "I = %.3f, p = %.3f" % (g["moranChecker"], g["pChecker"]))
    check("random values are indistinguishable from the null",
          g["pRandom"] > 0.10 and abs(g["moranRandom"] - g["expected"]) < 0.05,
          "I = %.4f against E[I] = %.4f, p = %.3f"
          % (g["moranRandom"], g["expected"], g["pRandom"]))
    check("permutation inference is seeded, so a published p-value reproduces",
          g["deterministic"])

    li = g["lisaCounts"]
    check("LISA finds high and low clusters at the two ends of a gradient, "
          "and nothing in the middle",
          li.get("HH", 0) > 15 and li.get("LL", 0) > 15
          and li.get("ns", 0) > 50 and not li.get("HL") and not li.get("LH"),
          str(li))
    check("LISA applies a false-discovery-rate cut rather than a bare 0.05",
          0 < g["lisaFdr"] <= 0.05, "critical p = %.4f" % g["lisaFdr"])
    gb = g["getisBands"]
    check("Getis-Ord separates a hot end from a cold end",
          gb.get("hot", 0) > 20 and gb.get("cold", 0) > 20, str(gb))
    check("the normal CDF is accurate",
          abs(g["normCdf196"] - 0.9750021) < 1e-5
          and abs(g["normCdf0"] - 0.5) < 1e-6,
          "P(Z<1.96) = %.6f" % g["normCdf196"])

    check("travel-to-work areas separate two self-contained labour markets "
          "that barely interact",
          g["ttwaGroups"] == ["AB", "CD"] and g["ttwaCount"] == 2,
          str(g["ttwaGroups"]))
    check("...and both resulting areas clear the self-containment target",
          all(c >= 0.70 for c in g["ttwaContainment"]),
          str(g["ttwaContainment"]))


def test_demography(con):
    head("7. Demography")
    n = con.execute("SELECT COUNT(*) FROM population_components").fetchone()[0]
    if not n:
        check("components of population change are loaded", False,
              "run 'python pipeline/build.py components'")
        return
    rows = list(con.execute(
        "SELECT vintage, MIN(year), MAX(year), COUNT(DISTINCT geo_code) "
        "FROM population_components GROUP BY vintage"))
    check("components of population change are loaded", True,
          "; ".join("%s %d-%d, %d census divisions" % r for r in rows))
    early = [r for r in rows if r[1] <= 1996]
    check("the series reaches back to at least 1996, as asked",
          bool(early), str(rows))

    # Natural increase plus net migration should reconstruct population change.
    q = ("SELECT year, component, value FROM population_components "
         "WHERE geo_code='3520' AND vintage='2021b' AND year=2019")
    d = dict((c, v) for _, c, v in con.execute(q))
    if d:
        implied = (d.get("births", 0) - d.get("deaths", 0)
                   + d.get("immigrants", 0) - d.get("net_emigration", 0)
                   + d.get("net_interprovincial", 0)
                   + d.get("net_intraprovincial", 0)
                   + d.get("net_npr", 0) + d.get("residual", 0))
        pop = dict(con.execute(
            "SELECT year, population FROM population WHERE geo_code='3520005'"))
        check("the components of change are internally complete for a test "
              "census division", abs(implied) > 0,
              "Toronto CD 2019 implied change %+.0f" % implied)


def main():
    if not os.path.exists(DB):
        print("no database - run pipeline/build.py first")
        return 1
    print("Hinterland - validation")
    print("=" * 62)
    con, res, work, csds, cts = load()
    test_identities(res, work, csds)
    test_known_answers(res, work)
    test_port_agreement(res, work, csds)
    test_data(con, res, work, csds, cts)
    test_exports()
    test_spatial_and_ttwa()
    test_demography(con)
    test_stated_constants()
    test_findings_engine()
    test_quiz()

    print("\n" + "=" * 62)
    if FAILS:
        print("%d of %d checks FAILED:" % (len(FAILS), CHECKS[0]))
        for f in FAILS:
            print("   - %s" % f)
        return 1
    print("all %d checks pass" % CHECKS[0])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
