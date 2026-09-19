"""Regional-science methods - reference implementation.

This module is the authority on what each number means. app/js/methods.js is a
line-for-line port of it, and pipeline/validate.py checks the two against each
other on real Ontario data plus worked examples from the literature. If they
ever disagree, this file is right and the port is wrong.

Notation, used consistently everywhere:

    e[i][j]   employment in industry i, region j
    e_j       total employment in region j        = sum_i e[i][j]
    E_i       employment in industry i, reference = sum over reference regions
    E         total reference employment
    s_ij      e[i][j] / e_j       local industry share
    s_i       E_i / E             reference industry share
    superscript 0 = start of period, 1 = end of period

References
----------
Dunn, E.S. (1960) "A statistical and analytical technique for regional
    analysis." Papers of the Regional Science Association 6: 97-112.
Esteban-Marquillas, J.M. (1972) "A reinterpretation of shift-share analysis."
    Regional and Urban Economics 2(3): 249-255.
Arcelus, F.J. (1984) "An extension of shift-share analysis." Growth and Change
    15(1): 3-8.
Barff, R.A. and Knight, P.L. (1988) "Dynamic shift-share analysis." Growth and
    Change 19(2): 1-10.
Haig, R.M. / Isard, W. (1960) Methods of Regional Analysis - location quotient
    and the economic base.
Flegg, A.T. and Webber, C.D. (1997, 2000) "On the appropriate use of location
    quotients in generating regional input-output tables" and "Regional size,
    regional specialization and the FLQ formula." Regional Studies.
Hachman, F. - Hachman index of economic diversity, as used by the University of
    Utah Bureau of Economic and Business Research.
Krugman, P. (1991) Geography and Trade - the specialisation index.
Shannon, C.E. (1948) - entropy, applied here as an industrial diversity index.
"""

import math

# --------------------------------------------------------------------------- #
# Tolerances and reliability floors
# --------------------------------------------------------------------------- #

# Census counts are randomly rounded to a multiple of 5, and the whole
# reliability floor is derived from the variance that introduces.
#
# Statistics Canada's random rounding is unbiased: a count with remainder
# r = v mod 5 is published as v - r with probability (5-r)/5, and as
# v + (5-r) with probability r/5. So the error is zero-mean and
#
#     E[e^2] = r^2 (5-r)/5 + (5-r)^2 r/5 = r(5-r)
#
# which, averaged over r uniform on {0,1,2,3,4}, gives
#
#     Var = (0 + 4 + 6 + 6 + 4)/5 = 4        ->  sd = 2.0
#
# Note this is NOT the sd of an error uniform on {-2,...,2} (which would be
# sqrt(2) ~= 1.414); the error ranges over (-5, +5), not (-2.5, +2.5).
# pipeline/validate.py confirms the figure empirically against the 64,470
# published place-of-work cells, where the total and its two components are
# each rounded independently: the observed spread of (total - home - usual)
# implies a per-cell sd of 2.02 against the theoretical 2.00.
ROUNDING_SD = 2.0

# Cells at or below this many workers are withheld: the rounding error is a
# large fraction of the value and the cell carries no usable signal.
MIN_RELIABLE_CELL = 25

# Cells at or below this are shown but marked weak.
WEAK_CELL = 50

EPS = 1e-12


# --------------------------------------------------------------------------- #
# 1. Shift-share: classic three-way decomposition (Dunn 1960)
# --------------------------------------------------------------------------- #

def shift_share(e0, e1, E0, E1):
    """Classic three-way shift-share for one region against one reference.

    e0, e1 : dict industry -> region employment at start and end
    E0, E1 : dict industry -> reference employment at start and end

    Returns a dict with a row per industry and a 'total' row. Each row holds:

        national     e0_i * G            growth the region would have seen had
                                         every industry grown at the overall
                                         reference rate
        mix          e0_i * (G_i - G)    the bonus or penalty from starting out
                                         concentrated in industries that grew
                                         faster or slower than the whole
        competitive  actual - e0_i*G_i   what is left: the region's own
                                         performance in that industry relative
                                         to the same industry elsewhere

    The three sum exactly to the observed change. That is an algebraic identity,
    not an approximation, and validate.py asserts it.

    Zero base years: if an industry had no employment at the start, its growth
    rate is undefined; national and mix are zero and the whole of the observed
    change lands in competitive. The row is flagged so the interface can say so
    rather than crediting the region with competitiveness it did not earn.
    """
    inds = sorted(set(list(e0.keys()) + list(e1.keys())))
    tot0, tot1 = _sum(E0), _sum(E1)
    G = (tot1 - tot0) / tot0 if tot0 > EPS else 0.0

    rows = {}
    agg = _blank_row()
    for i in inds:
        a0, a1 = e0.get(i, 0.0), e1.get(i, 0.0)
        n0, n1 = E0.get(i, 0.0), E1.get(i, 0.0)
        Gi = (n1 - n0) / n0 if n0 > EPS else 0.0
        actual = a1 - a0

        national = a0 * G
        mix = a0 * (Gi - G)
        # Written as a residual, not as a0*(g-Gi), so a zero base year cannot
        # divide by zero. Algebraically identical where g is defined.
        competitive = actual - a0 * Gi

        rows[i] = {
            "industry": i,
            "start": a0, "end": a1, "actual": actual,
            "national": national, "mix": mix, "competitive": competitive,
            "local_growth": (actual / a0) if a0 > EPS else None,
            "ref_growth": Gi,
            "zero_base": a0 <= EPS and a1 > EPS,
        }
        for k in ("start", "end", "actual", "national", "mix", "competitive"):
            agg[k] += rows[i][k]

    agg["ref_growth"] = G
    agg["local_growth"] = (agg["actual"] / agg["start"]) if agg["start"] > EPS else None
    agg["industry"] = "total"
    return {"rows": rows, "total": agg, "reference_growth": G}


def _blank_row():
    return {"start": 0.0, "end": 0.0, "actual": 0.0,
            "national": 0.0, "mix": 0.0, "competitive": 0.0}


def _sum(d):
    return sum(d.values())


# --------------------------------------------------------------------------- #
# 2. Esteban-Marquillas four-way decomposition (1972)
# --------------------------------------------------------------------------- #

def esteban_marquillas(e0, e1, E0, E1):
    """Split the competitive shift into a clean competitive effect and an
    allocation effect.

    The complaint Esteban-Marquillas made about Dunn is fair: the competitive
    term e0_i * (g_i - G_i) is proportional to how much employment the region
    already had in industry i, so a region that happens to be concentrated in an
    industry gets a bigger competitive score for the same relative performance.
    Specialisation contaminates the measure of competitiveness.

    The fix is homothetic employment - what the region would hold in industry i
    if it had the reference industry mix at its own total size:

        h_i = e_j0 * (E_i0 / E0)

    Then

        competitive  = h_i * (g_i - G_i)          performance, size-neutral
        allocation   = (e0_i - h_i) * (g_i - G_i) specialisation x performance

    and competitive + allocation equals Dunn's competitive term exactly.

    The allocation effect is the interesting one for planning work, because its
    sign tells you whether a place is concentrated in the right things:

        specialised     and competitive     -> competitive advantage
        specialised     and uncompetitive   -> specialised disadvantage
        not specialised and competitive     -> unexploited advantage
        not specialised and uncompetitive   -> unspecialised disadvantage
    """
    base = shift_share(e0, e1, E0, E1)
    tot0 = _sum(E0)
    e_j0 = _sum(e0)

    for i, r in base["rows"].items():
        n0 = E0.get(i, 0.0)
        h = e_j0 * (n0 / tot0) if tot0 > EPS else 0.0
        a0 = r["start"]
        Gi = r["ref_growth"]

        if a0 > EPS:
            gap = (r["actual"] / a0) - Gi          # g_i - G_i
            comp = h * gap
            alloc = (a0 - h) * gap
        else:
            # No base employment: the differential growth rate does not exist.
            # Do not invent a split - hand the whole change to competitive and
            # say why.
            comp, alloc, gap = r["competitive"], 0.0, None

        r["homothetic"] = h
        r["em_competitive"] = comp
        r["em_allocation"] = alloc
        r["growth_gap"] = gap
        r["specialised"] = (a0 - h) > 0
        r["quadrant"] = _quadrant(a0 - h, gap)

    t = base["total"]
    t["em_competitive"] = sum(r["em_competitive"] for r in base["rows"].values())
    t["em_allocation"] = sum(r["em_allocation"] for r in base["rows"].values())
    t["homothetic"] = sum(r["homothetic"] for r in base["rows"].values())
    return base


def _quadrant(spec, gap):
    if gap is None:
        return "undefined"
    if spec > 0 and gap > 0:
        return "competitive advantage"
    if spec > 0 and gap <= 0:
        return "specialised disadvantage"
    if spec <= 0 and gap > 0:
        return "unexploited advantage"
    return "unspecialised disadvantage"


# --------------------------------------------------------------------------- #
# 3. Dynamic shift-share (Barff and Knight 1988)
# --------------------------------------------------------------------------- #

def dynamic_shift_share(local_series, ref_series, years):
    """Chain the decomposition across successive intervals and sum components.

    A single 2001-to-2021 decomposition weights everything by the industry mix
    of 2001, which by 2021 describes a manufacturing economy that no longer
    exists. Twenty years is long enough for that to matter: the base-year mix
    silently becomes the answer. Barff and Knight's remedy is to run the
    decomposition over each short interval with that interval's own starting
    weights, then add the components up.

    local_series, ref_series : dict year -> (dict industry -> employment)
    years                    : ordered list of years to chain through

    Returns the summed components plus the per-interval detail, so the interface
    can show where in the period a shift actually happened - which is usually
    the question a planner is really asking.
    """
    years = [y for y in years if y in local_series and y in ref_series]
    if len(years) < 2:
        return None

    total = _blank_row()
    total["em_competitive"] = 0.0
    total["em_allocation"] = 0.0
    per_industry = {}
    intervals = []

    for a, b in zip(years[:-1], years[1:]):
        step = esteban_marquillas(local_series[a], local_series[b],
                                  ref_series[a], ref_series[b])
        intervals.append({"from": a, "to": b,
                          "total": dict(step["total"]),
                          "rows": step["rows"]})
        for k in ("actual", "national", "mix", "competitive",
                  "em_competitive", "em_allocation"):
            total[k] += step["total"][k]
        for i, r in step["rows"].items():
            acc = per_industry.setdefault(i, {"industry": i, "actual": 0.0,
                                              "national": 0.0, "mix": 0.0,
                                              "competitive": 0.0,
                                              "em_competitive": 0.0,
                                              "em_allocation": 0.0})
            for k in ("actual", "national", "mix", "competitive",
                      "em_competitive", "em_allocation"):
                acc[k] += r[k]

    total["start"] = _sum(local_series[years[0]])
    total["end"] = _sum(local_series[years[-1]])
    for i in per_industry:
        per_industry[i]["start"] = local_series[years[0]].get(i, 0.0)
        per_industry[i]["end"] = local_series[years[-1]].get(i, 0.0)

    return {"rows": per_industry, "total": total, "intervals": intervals,
            "years": years}


# --------------------------------------------------------------------------- #
# 4. Location quotients, economic base, FLQ
# --------------------------------------------------------------------------- #

def location_quotients(e, E):
    """LQ_i = (e_i / e_j) / (E_i / E).

    Above 1 means the place has more of its employment in that industry than the
    reference does. It is a concentration measure and nothing more: a high LQ
    says an industry is over-represented, not that it is growing, profitable, or
    worth keeping.

    The conventional reading, which the interface uses:
        LQ < 0.75   under-represented
        0.75-1.25   roughly at reference share
        1.25-2.0    a specialisation
        > 2.0       a strong specialisation
    """
    e_j, tot = _sum(e), _sum(E)
    out = {}
    for i in sorted(set(list(e.keys()) + list(E.keys()))):
        s_local = e.get(i, 0.0) / e_j if e_j > EPS else 0.0
        s_ref = E.get(i, 0.0) / tot if tot > EPS else 0.0
        lq = (s_local / s_ref) if s_ref > EPS else None
        out[i] = {"industry": i, "employment": e.get(i, 0.0),
                  "share": s_local, "ref_share": s_ref, "lq": lq,
                  "reliable": e.get(i, 0.0) > MIN_RELIABLE_CELL,
                  "weak": MIN_RELIABLE_CELL < e.get(i, 0.0) <= WEAK_CELL}
    return out


def economic_base(e, E):
    """Basic / non-basic split by the location-quotient excess method.

    Employment above the reference share is treated as serving demand from
    outside the region (basic, or export employment); the rest is treated as
    serving local residents (non-basic).

        basic_i = max(0, e_i - e_j * s_i)
        base multiplier = e_j / sum_i basic_i

    The multiplier says: for each job in the export base, this many jobs exist
    in the local economy in total.

    Two known biases, both stated in the interface rather than buried here. The
    method assumes every region has the same productivity and consumption
    pattern as the reference, which is never true. And it cannot see
    cross-hauling - a region that both imports and exports the same good looks
    purely local. Both push the basic share down, so the multiplier is generally
    an overestimate. It is a structural indicator, not a forecasting tool.
    """
    e_j, tot = _sum(e), _sum(E)
    basic = 0.0
    detail = {}
    for i in sorted(set(list(e.keys()) + list(E.keys()))):
        s_ref = E.get(i, 0.0) / tot if tot > EPS else 0.0
        expected = e_j * s_ref
        b = max(0.0, e.get(i, 0.0) - expected)
        detail[i] = {"industry": i, "basic": b,
                     "non_basic": e.get(i, 0.0) - b, "expected": expected}
        basic += b
    share = (basic / e_j) if e_j > EPS else None
    return {"total": e_j, "basic": basic, "non_basic": e_j - basic,
            "basic_share": share,
            "multiplier": (e_j / basic) if basic > EPS else None,
            # The multiplier is total over basic, so a small basic share puts a
            # small number in the denominator and the multiplier becomes both
            # large and unstable. That happens whenever the benchmark resembles
            # the subject - a diversified city against the province it sits in
            # can show a 9% basic share and a multiplier over 11, which is
            # arithmetically correct and practically meaningless.
            "unstable": share is not None and share < 0.15,
            "detail": detail}


def flq(e, E, delta=0.25):
    """Flegg-Webber location quotient - a size-adjusted LQ.

    The plain LQ, used to scale national coefficients down to a region, ignores
    region size, and small regions leak far more of their spending than large
    ones. Flegg and Webber multiply by

        lambda* = [log2(1 + e_j / E)] ** delta

    which is below 1 for any region smaller than the reference and falls as the
    region gets smaller. delta is an elasticity fitted from survey-based
    regional tables; Flegg and Webber (2000) put it in the 0.1-0.3 range and
    Flegg and Tohmo (2013) settle near 0.25, which is the default here.

    Used in this tool only to temper the provincial input-output multipliers
    before they are applied to a municipality. It reduces the well-known upward
    bias; it does not eliminate it, and no LQ-based adjustment substitutes for a
    survey-based regional table.
    """
    e_j, tot = _sum(e), _sum(E)
    lam = math.pow(math.log(1.0 + e_j / tot, 2), delta) if tot > EPS and e_j > 0 else 0.0
    lqs = location_quotients(e, E)
    out = {}
    for i, r in lqs.items():
        out[i] = {"industry": i, "lq": r["lq"],
                  "flq": (r["lq"] * lam) if r["lq"] is not None else None,
                  "rpc_proxy": min(1.0, r["lq"] * lam) if r["lq"] else None}
    return {"lambda": lam, "delta": delta, "rows": out}


# --------------------------------------------------------------------------- #
# 5. Specialisation and diversity
# --------------------------------------------------------------------------- #

def structure_indices(e, E):
    """Four different questions about industry mix, deliberately kept separate.

    krugman            sum |s_ij - s_i|, range 0 to 2. How different is this
                       place's mix from the reference mix? Zero means identical.
    coef_specialisation krugman / 2, the same thing on a 0-1 scale.
    hhi                sum s_ij^2. Concentration within the place itself,
                       independent of any reference. Minimum 1/n (perfectly
                       even), maximum 1 (one industry).
    hhi_normalised     (hhi - 1/n) / (1 - 1/n), on 0-1.
    entropy            -sum s ln s, and entropy_normalised on 0-1. A diversity
                       measure that weights small industries more generously
                       than the HHI does.
    hachman            1 / sum (s_ij^2 / s_i), range 0 to 1. How closely the
                       place resembles the reference economy; 1 means it is a
                       scale model of the reference.
    specialisations    count of industries at LQ >= 1.25, ignoring cells too
                       small to be reliable.

    Diversity and specialisation are not opposites and the tool never treats
    them as one axis. A place can be diversified overall and still hold one
    genuine specialisation.
    """
    e_j, tot = _sum(e), _sum(E)
    inds = sorted(set(list(e.keys()) + list(E.keys())))
    n = len(inds)
    if e_j <= EPS or tot <= EPS or n == 0:
        return None

    krug = hhi = ent = hach = 0.0
    spec = 0
    for i in inds:
        s = e.get(i, 0.0) / e_j
        sr = E.get(i, 0.0) / tot
        krug += abs(s - sr)
        hhi += s * s
        if s > EPS:
            ent -= s * math.log(s)
        if sr > EPS:
            hach += (s * s) / sr
            if s / sr >= 1.25 and e.get(i, 0.0) > MIN_RELIABLE_CELL:
                spec += 1

    return {
        "krugman": krug,
        "coef_specialisation": krug / 2.0,
        "hhi": hhi,
        "hhi_normalised": (hhi - 1.0 / n) / (1.0 - 1.0 / n) if n > 1 else 0.0,
        "entropy": ent,
        "entropy_normalised": ent / math.log(n) if n > 1 else 0.0,
        "hachman": (1.0 / hach) if hach > EPS else None,
        "specialisations": spec,
        "n_industries": n,
        "employment": e_j,
    }


def mix_distance(a, b):
    """Industry-mix distance between two places: half the sum of absolute share
    differences. Zero means identical mixes, one means no overlap at all.

    This is the Bray-Curtis dissimilarity on compositional data, which is the
    same arithmetic as a Krugman index computed between two regions instead of
    against a reference. Used for the structural-peer search, where the question
    is which other places have an economy shaped like this one - regardless of
    size.
    """
    ta, tb = _sum(a), _sum(b)
    if ta <= EPS or tb <= EPS:
        return None
    inds = set(list(a.keys()) + list(b.keys()))
    return 0.5 * sum(abs(a.get(i, 0.0) / ta - b.get(i, 0.0) / tb) for i in inds)


# --------------------------------------------------------------------------- #
# 6. Peer selection
# --------------------------------------------------------------------------- #

def standardise(rows, keys):
    """Z-score each feature across the candidate set. Returns vectors, means, sds."""
    n = len(rows)
    means, sds = {}, {}
    for k in keys:
        vals = [r[k] for r in rows if r.get(k) is not None]
        m = sum(vals) / len(vals) if vals else 0.0
        v = sum((x - m) ** 2 for x in vals) / (len(vals) - 1) if len(vals) > 1 else 1.0
        means[k], sds[k] = m, math.sqrt(v) if v > EPS else 1.0
    vecs = []
    for r in rows:
        vecs.append([((r.get(k) if r.get(k) is not None else means[k]) - means[k]) / sds[k]
                     for k in keys])
    return vecs, means, sds


def covariance(vecs, ridge=1e-3):
    """Covariance of standardised features, with a ridge added to the diagonal.

    Several of the features are strongly correlated - population, job count and
    density move together - so the raw covariance matrix is close to singular
    and its inverse is numerically unstable. The ridge is small enough not to
    distort the ranking and large enough to keep the inverse well behaved.
    """
    n, p = len(vecs), len(vecs[0])
    mean = [sum(v[j] for v in vecs) / n for j in range(p)]
    C = [[0.0] * p for _ in range(p)]
    for v in vecs:
        d = [v[j] - mean[j] for j in range(p)]
        for a in range(p):
            for b in range(p):
                C[a][b] += d[a] * d[b]
    for a in range(p):
        for b in range(p):
            C[a][b] /= (n - 1)
        C[a][a] += ridge
    return C


def invert(M):
    """Gauss-Jordan inverse with partial pivoting. Small matrices only."""
    n = len(M)
    A = [row[:] + [1.0 if i == j else 0.0 for j in range(n)]
         for i, row in enumerate(M)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(A[r][c]))
        if abs(A[p][c]) < 1e-14:
            raise ValueError("singular matrix")
        A[c], A[p] = A[p], A[c]
        pv = A[c][c]
        A[c] = [x / pv for x in A[c]]
        for r in range(n):
            if r != c and abs(A[r][c]) > 0:
                f = A[r][c]
                A[r] = [x - f * y for x, y in zip(A[r], A[c])]
    return [row[n:] for row in A]


def mahalanobis_peers(target_idx, rows, keys, k=8, ridge=1e-3):
    """Rank candidates by Mahalanobis distance from the target.

    Euclidean distance on z-scores would double-count: population, employment
    and density are nearly the same variable wearing three hats, so a place that
    differs on size differs on all three and gets pushed away three times over.
    Mahalanobis distance divides through by the covariance structure, so
    correlated features count once.

        d^2 = (x - y)' S^-1 (x - y)

    The candidate set should already be restricted to settlements of a
    comparable kind - a small town is not made comparable to a downtown by
    arithmetic. The tool restricts on Statistical Area Classification type
    before it ever computes a distance.
    """
    vecs, _, _ = standardise(rows, keys)
    Sinv = invert(covariance(vecs, ridge))
    t = vecs[target_idx]
    out = []
    for i, v in enumerate(vecs):
        if i == target_idx:
            continue
        d = [v[j] - t[j] for j in range(len(t))]
        q = sum(d[a] * Sinv[a][b] * d[b] for a in range(len(d)) for b in range(len(d)))
        out.append({"index": i, "d2": max(0.0, q), "distance": math.sqrt(max(0.0, q))})
    out.sort(key=lambda r: r["d2"])
    return out[:k]


# --------------------------------------------------------------------------- #
# 7. Commuting: self-containment and the jobs balance
# --------------------------------------------------------------------------- #

def commuting_profile(code, inflow, outflow, live_and_work,
                      all_jobs=None, all_employed_residents=None,
                      resident_workers_fixed=None):
    """Does this place supply its own jobs, import workers, or export them?

    Commuting flows cover only workers with a USUAL place of work. People who
    worked at home, had no fixed workplace address, or worked outside Canada do
    not appear in the origin-destination table at all. In 2021 that gap is
    enormous: the commuting table knows about 649,000 Toronto resident workers,
    while the city had 1,308,000 employed residents.

    So everything derived from commuting carries "usual" in its name and is
    never mixed with a total. Both ratios are returned:

    self_containment_usual  residents with a usual workplace who work in the
                            municipality, over all residents with a usual
                            workplace
    jobs_ratio_usual        jobs at a usual workplace here over the same
                            denominator; above 1 is a net importer of workers
    jobs_ratio              all jobs located here over the residence subtotal
                            that shares its universe (worked at home + usual
                            place of work). Workers with no fixed workplace
                            address cannot belong to a workplace geography, so
                            they are excluded from BOTH sides. Dividing by the
                            residence total instead understates the ratio badly:
                            province-wide it turns a true 1.00 into 0.88.
    """
    usual_residents = live_and_work + outflow
    usual_jobs = live_and_work + inflow
    return {
        "code": code,
        "usual_residents": usual_residents,
        "usual_jobs_here": usual_jobs,
        "live_and_work": live_and_work,
        "in_commuters": inflow,
        "out_commuters": outflow,
        "net_commuting": inflow - outflow,
        "self_containment_usual": (live_and_work / usual_residents)
                                  if usual_residents > EPS else None,
        "jobs_ratio_usual": (usual_jobs / usual_residents)
                            if usual_residents > EPS else None,
        "all_jobs": all_jobs,
        "all_employed_residents": all_employed_residents,
        "resident_workers_fixed": resident_workers_fixed,
        "jobs_ratio": (all_jobs / resident_workers_fixed)
                      if (all_jobs is not None and resident_workers_fixed
                          and resident_workers_fixed > EPS) else None,
    }


# --------------------------------------------------------------------------- #
# 8. Reliability propagation
# --------------------------------------------------------------------------- #

def rounding_sd(n_cells):
    """Standard deviation contributed by random rounding to a sum of n cells.

    Each published cell carries an independent rounding error with sd sqrt(2),
    so a sum of n of them carries sd sqrt(2n). A change between two years is a
    difference of two such sums.

    This is not a sampling error - the census long form has one of those too,
    and it is larger. It is the floor below which a number cannot be read, and
    the interface shows it so that a competitive shift of 30 jobs in a small
    municipality is not mistaken for a finding.
    """
    return ROUNDING_SD * math.sqrt(max(0, n_cells))


def shift_share_uncertainty(n_industries):
    """Indicative sd on a shift-share component aggregated over n industries,
    across two reference years. Two years x n industries x (local and reference
    cells), treated as independent."""
    return rounding_sd(2 * n_industries)


def reliability_flag(value):
    if value is None:
        return "missing"
    if value <= MIN_RELIABLE_CELL:
        return "withheld"
    if value <= WEAK_CELL:
        return "weak"
    return "ok"
