/* ==========================================================================
   Regional-science methods - browser implementation.

   A port of pipeline/methods.py, which is the authority on what each number
   means and carries the full literature references. pipeline/validate.py runs
   both against the same Ontario data and asserts they agree, so any change
   here has to be made there too.

   Employment vectors are plain arrays of 20 numbers in NAICS sector order,
   with null for a value the census did not publish. Nulls are treated as
   missing, never as zero - a municipality with no published figure for mining
   is not a municipality with no mining.
   ========================================================================== */

(function (root) {
  'use strict';

  var EPS = 1e-12;
  var M = {};

  /* Census counts are randomly rounded to a multiple of 5, and the reliability
     floor is derived from the variance that introduces.

     Statistics Canada's random rounding is unbiased: a count with remainder
     r = v mod 5 publishes as v - r with probability (5-r)/5 and as v + (5-r)
     with probability r/5. So E[e^2] = r(5-r), which averaged over r uniform on
     {0..4} gives Var = 4 and sd = 2. The error ranges over (-5, +5), so this is
     not the sd of an error uniform on {-2..2} (sqrt(2)). Confirmed empirically
     in pipeline/validate.py against the 64,470 published place-of-work cells. */
  M.ROUNDING_SD = 2.0;

  /* Long-form SAMPLING error, which is what actually dominates. The standard
     deviation of a published count runs at about SAMPLE_K x sqrt(count): the
     median fitted to the 4,997 Ontario municipal sector cells that carry
     published 95% intervals in 98-10-0456 (half-width / 1.96 / sqrt(count)).
     pipeline/validate.py re-derives it from those intervals and fails if this
     drifts. For a cell of 10,000 workers it is ~190, against 2 for rounding.
     The place-of-work tables publish no intervals, so this is borrowed for
     them - and every use of it says so. */
  M.SAMPLE_K = 1.92;

  /* Standard deviation of one published count: sampling and rounding. */
  M.countSd = function (n) {
    if (n == null || !isFinite(n)) return null;
    return Math.sqrt(M.SAMPLE_K * M.SAMPLE_K * Math.max(0, n) +
                     M.ROUNDING_SD * M.ROUNDING_SD);
  };

  /* Is `a` larger than `b` by more than z standard deviations of the
     difference? The separation test every comparison the tool STATES must
     pass - not just the headline one. */
  M.clearlyLarger = function (a, b, z) {
    if (a == null || b == null) return false;
    var sd = Math.sqrt(Math.pow(M.countSd(a), 2) + Math.pow(M.countSd(b), 2));
    return (a - b) >= (z == null ? 3 : z) * sd;
  };
  M.MIN_RELIABLE_CELL = 25;
  M.WEAK_CELL = 50;

  /* ---------------------------------------------------------------- utils */

  M.sum = function (v) {
    var t = 0;
    for (var i = 0; i < v.length; i++) if (v[i] != null) t += v[i];
    return t;
  };

  M.addInto = function (acc, v) {
    for (var i = 0; i < v.length; i++) if (v[i] != null) acc[i] = (acc[i] || 0) + v[i];
    return acc;
  };

  M.zeros = function (n) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = 0;
    return a;
  };

  M.shares = function (v) {
    var t = M.sum(v), out = new Array(v.length);
    for (var i = 0; i < v.length; i++) out[i] = t > EPS ? (v[i] || 0) / t : 0;
    return out;
  };

  /* ------------------------------------------------- 1. shift-share (Dunn) */

  /* Classic three-way decomposition of employment change for one area against
     one reference economy.

       national     e0_i * G           what the overall reference growth rate
                                       alone would have delivered
       mix          e0_i * (G_i - G)   the bonus or penalty from the starting
                                       industry composition
       competitive  actual - e0_i*G_i  the residual: local performance in that
                                       industry against the same industry in
                                       the reference

     The three sum exactly to the observed change. Competitive is written as a
     residual rather than e0*(g - G_i) so that a zero base year cannot divide
     by zero; the two forms are algebraically identical wherever g exists. */
  M.shiftShare = function (e0, e1, E0, E1) {
    var n = e0.length;
    var tot0 = M.sum(E0), tot1 = M.sum(E1);
    var G = tot0 > EPS ? (tot1 - tot0) / tot0 : 0;
    var rows = [], agg = blankRow();

    for (var i = 0; i < n; i++) {
      var a0 = e0[i], a1 = e1[i];
      var missing = (a0 == null || a1 == null);
      a0 = a0 || 0; a1 = a1 || 0;
      var n0 = E0[i] || 0, n1 = E1[i] || 0;
      var Gi = n0 > EPS ? (n1 - n0) / n0 : 0;
      var actual = a1 - a0;
      var national = a0 * G;
      var mix = a0 * (Gi - G);
      var competitive = actual - a0 * Gi;

      var r = {
        i: i, start: a0, end: a1, actual: actual,
        national: national, mix: mix, competitive: competitive,
        localGrowth: a0 > EPS ? actual / a0 : null,
        refGrowth: Gi,
        zeroBase: a0 <= EPS && a1 > EPS,
        missing: missing
      };
      rows.push(r);
      if (!missing) {
        agg.start += a0; agg.end += a1; agg.actual += actual;
        agg.national += national; agg.mix += mix; agg.competitive += competitive;
      }
    }
    agg.refGrowth = G;
    agg.localGrowth = agg.start > EPS ? agg.actual / agg.start : null;
    return { rows: rows, total: agg, referenceGrowth: G };
  };

  function blankRow() {
    return {
      start: 0, end: 0, actual: 0, national: 0, mix: 0, competitive: 0,
      emCompetitive: 0, emAllocation: 0, homothetic: 0
    };
  }

  /* ---------------------------------------- 2. Esteban-Marquillas (1972) */

  /* Dunn's competitive term is proportional to the employment the area already
     held in the sector, so specialisation contaminates the measure of
     competitiveness. Esteban-Marquillas separates the two using homothetic
     employment - what the area would hold if it had the reference mix at its
     own total size:

         h_i          = e_j0 * (E_i0 / E0)
         competitive  = h_i * (g_i - G_i)
         allocation   = (e0_i - h_i) * (g_i - G_i)

     and competitive + allocation is exactly Dunn's competitive term. The sign
     pair gives the four-quadrant reading. */
  M.estebanMarquillas = function (e0, e1, E0, E1) {
    var res = M.shiftShare(e0, e1, E0, E1);
    var tot0 = M.sum(E0), ej0 = M.sum(e0);
    var t = res.total;
    t.emCompetitive = 0; t.emAllocation = 0; t.homothetic = 0;

    for (var k = 0; k < res.rows.length; k++) {
      var r = res.rows[k];
      var h = tot0 > EPS ? ej0 * ((E0[r.i] || 0) / tot0) : 0;
      var gap = null, comp, alloc;
      if (r.start > EPS) {
        gap = (r.actual / r.start) - r.refGrowth;
        comp = h * gap;
        alloc = (r.start - h) * gap;
      } else {
        /* The differential growth rate does not exist with no base employment.
           Do not invent a split: hand it all to competitive and say so. */
        comp = r.competitive; alloc = 0;
      }
      r.homothetic = h;
      r.emCompetitive = comp;
      r.emAllocation = alloc;
      r.growthGap = gap;
      r.specialised = (r.start - h) > 0;
      r.quadrant = quadrant(r.start - h, gap);
      if (!r.missing) {
        t.emCompetitive += comp; t.emAllocation += alloc; t.homothetic += h;
      }
    }
    return res;
  };

  M.QUADRANTS = [
    'competitive advantage',
    'specialised disadvantage',
    'unexploited advantage',
    'unspecialised disadvantage',
    'undefined'
  ];

  function quadrant(spec, gap) {
    if (gap == null) return 'undefined';
    if (spec > 0 && gap > 0) return 'competitive advantage';
    if (spec > 0) return 'specialised disadvantage';
    if (gap > 0) return 'unexploited advantage';
    return 'unspecialised disadvantage';
  }

  /* ------------------------------------- 3. dynamic shift-share (1988) */

  /* A single 2001-to-2021 decomposition weights everything by the industry mix
     of 2001, which by 2021 describes an economy that no longer exists. Barff
     and Knight run the decomposition over each short interval with that
     interval's own weights and sum the components. Returns the summed result
     plus per-interval detail, because where in the period a shift happened is
     usually the real question. */
  M.dynamicShiftShare = function (localByYear, refByYear, years) {
    var use = years.filter(function (y) {
      return localByYear[y] && refByYear[y];
    });
    if (use.length < 2) return null;

    var n = localByYear[use[0]].length;
    var total = blankRow();
    var per = [];
    for (var i = 0; i < n; i++) {
      per.push({ i: i, start: 0, end: 0, actual: 0, national: 0, mix: 0,
                 competitive: 0, emCompetitive: 0, emAllocation: 0 });
    }
    var intervals = [];
    var keys = ['actual', 'national', 'mix', 'competitive',
                'emCompetitive', 'emAllocation'];

    for (var s = 0; s < use.length - 1; s++) {
      var a = use[s], b = use[s + 1];
      var step = M.estebanMarquillas(localByYear[a], localByYear[b],
                                     refByYear[a], refByYear[b]);
      intervals.push({ from: a, to: b, total: step.total, rows: step.rows });
      for (var q = 0; q < keys.length; q++) total[keys[q]] += step.total[keys[q]];
      for (var j = 0; j < step.rows.length; j++) {
        for (var p = 0; p < keys.length; p++) {
          per[j][keys[p]] += step.rows[j][keys[p]];
        }
      }
    }

    var first = localByYear[use[0]], last = localByYear[use[use.length - 1]];
    total.start = M.sum(first);
    total.end = M.sum(last);
    total.localGrowth = total.start > EPS ? total.actual / total.start : null;
    for (var z = 0; z < n; z++) {
      per[z].start = first[z] || 0;
      per[z].end = last[z] || 0;
    }
    return { rows: per, total: total, intervals: intervals, years: use };
  };

  /* -------------------------------- 4. location quotients, economic base */

  /* LQ_i = (e_i / e_j) / (E_i / E). A concentration measure and nothing more:
     a high LQ says an industry is over-represented, not that it is growing or
     worth keeping. */
  M.locationQuotients = function (e, E) {
    var ej = M.sum(e), tot = M.sum(E);
    var out = [];
    for (var i = 0; i < e.length; i++) {
      var v = e[i];
      var sl = ej > EPS ? (v || 0) / ej : 0;
      var sr = tot > EPS ? (E[i] || 0) / tot : 0;
      out.push({
        i: i, employment: v, share: sl, refShare: sr,
        lq: sr > EPS ? sl / sr : null,
        flag: M.reliabilityFlag(v)
      });
    }
    return out;
  };

  M.LQ_BANDS = [
    { max: 0.75, label: 'under-represented' },
    { max: 1.25, label: 'at reference share' },
    { max: 2.0, label: 'a specialisation' },
    { max: Infinity, label: 'a strong specialisation' }
  ];

  M.lqBand = function (lq) {
    if (lq == null) return '';
    for (var i = 0; i < M.LQ_BANDS.length; i++) {
      if (lq < M.LQ_BANDS[i].max) return M.LQ_BANDS[i].label;
    }
    return '';
  };

  /* Basic / non-basic split by the location-quotient excess method.
     Employment above the reference share is treated as serving demand from
     outside; the base multiplier is total over basic.

     Two biases, both surfaced in the interface rather than buried here: the
     method assumes the area shares the reference's productivity and
     consumption pattern, and it cannot see cross-hauling. Both push the basic
     share down, so the multiplier generally runs high. */
  M.economicBase = function (e, E) {
    var ej = M.sum(e), tot = M.sum(E);
    var basic = 0, detail = [];
    for (var i = 0; i < e.length; i++) {
      var sr = tot > EPS ? (E[i] || 0) / tot : 0;
      var expected = ej * sr;
      var b = Math.max(0, (e[i] || 0) - expected);
      detail.push({ i: i, basic: b, nonBasic: (e[i] || 0) - b, expected: expected });
      basic += b;
    }
    var share = ej > EPS ? basic / ej : null;
    return {
      total: ej, basic: basic, nonBasic: ej - basic,
      basicShare: share,
      multiplier: basic > EPS ? ej / basic : null,
      /* The multiplier is total over basic, so a small basic share puts a small
         number in the denominator and the multiplier becomes both large and
         unstable. That happens whenever the benchmark resembles the subject -
         a diversified city against the province it sits in can show a 9% basic
         share and a multiplier over 11, which is arithmetically correct and
         practically meaningless. Below 15% the tool reports the figure but
         refuses to let it be quoted without the warning. */
      unstable: share != null && share < 0.15,
      detail: detail
    };
  };

  /* Flegg-Webber size-adjusted location quotient. The plain LQ ignores area
     size, and small areas leak far more of their spending. lambda* =
     [log2(1 + e_j/E)]^delta, below 1 for anything smaller than the reference.
     delta near 0.25 follows Flegg and Tohmo (2013). */
  M.flq = function (e, E, delta) {
    delta = delta == null ? 0.25 : delta;
    var ej = M.sum(e), tot = M.sum(E);
    var lam = (tot > EPS && ej > 0)
      ? Math.pow(Math.log2(1 + ej / tot), delta) : 0;
    var lqs = M.locationQuotients(e, E);
    return {
      lambda: lam, delta: delta,
      rows: lqs.map(function (r) {
        return {
          i: r.i, lq: r.lq,
          flq: r.lq == null ? null : r.lq * lam,
          rpcProxy: r.lq == null ? null : Math.min(1, r.lq * lam)
        };
      })
    };
  };

  /* --------------------------------- 5. specialisation and diversity */

  /* Four separate questions, deliberately not combined into a score.

       krugman            sum |s_ij - s_i|, 0 to 2. Distance from the
                          reference mix.
       coefSpecialisation krugman / 2, same thing on 0 to 1.
       hhi                sum s^2. Concentration within the area itself,
                          independent of any reference.
       hhiNormalised      (hhi - 1/n) / (1 - 1/n).
       entropy            -sum s ln s, and entropyNormalised on 0 to 1.
       hachman            1 / sum (s^2 / s_ref), 0 to 1. How closely the area
                          resembles the reference economy.
       specialisations    industries at LQ >= 1.25, ignoring unreliable cells.

     Diversity and specialisation are not opposites and are never plotted on
     one axis: an area can be broadly diversified and still hold one real
     specialisation. */
  M.structureIndices = function (e, E) {
    var ej = M.sum(e), tot = M.sum(E), n = e.length;
    if (ej <= EPS || tot <= EPS || !n) return null;
    var krug = 0, hhi = 0, ent = 0, hach = 0, spec = 0;
    for (var i = 0; i < n; i++) {
      var s = (e[i] || 0) / ej;
      var sr = (E[i] || 0) / tot;
      krug += Math.abs(s - sr);
      hhi += s * s;
      if (s > EPS) ent -= s * Math.log(s);
      if (sr > EPS) {
        hach += (s * s) / sr;
        if (s / sr >= 1.25 && (e[i] || 0) > M.MIN_RELIABLE_CELL) spec++;
      }
    }
    return {
      krugman: krug,
      coefSpecialisation: krug / 2,
      hhi: hhi,
      hhiNormalised: n > 1 ? (hhi - 1 / n) / (1 - 1 / n) : 0,
      entropy: ent,
      entropyNormalised: n > 1 ? ent / Math.log(n) : 0,
      hachman: hach > EPS ? 1 / hach : null,
      specialisations: spec,
      nIndustries: n,
      employment: ej
    };
  };

  /* Industry-mix distance between two areas: half the sum of absolute share
     differences. Zero means identical mixes, one means no overlap. This is
     Bray-Curtis dissimilarity on compositional data - the same arithmetic as
     a Krugman index taken between two areas rather than against a reference.
     It answers "who has an economy shaped like this one", regardless of size. */
  M.mixDistance = function (a, b) {
    var ta = M.sum(a), tb = M.sum(b);
    if (ta <= EPS || tb <= EPS) return null;
    var d = 0;
    for (var i = 0; i < a.length; i++) {
      d += Math.abs((a[i] || 0) / ta - (b[i] || 0) / tb);
    }
    return d / 2;
  };

  /* ------------------------------------------------ 6. peer selection */

  M.standardise = function (rows, keys) {
    var means = {}, sds = {};
    keys.forEach(function (k) {
      var vals = [];
      rows.forEach(function (r) { if (r[k] != null && isFinite(r[k])) vals.push(r[k]); });
      var m = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 0;
      var v = vals.length > 1
        ? vals.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (vals.length - 1)
        : 1;
      means[k] = m;
      sds[k] = v > EPS ? Math.sqrt(v) : 1;
    });
    var vecs = rows.map(function (r) {
      return keys.map(function (k) {
        var x = (r[k] != null && isFinite(r[k])) ? r[k] : means[k];
        return (x - means[k]) / sds[k];
      });
    });
    return { vecs: vecs, means: means, sds: sds };
  };

  /* Covariance of the standardised features, with a ridge on the diagonal.
     Population, job count and density move together, so the raw matrix is
     close to singular; the ridge is small enough not to disturb the ranking
     and large enough to keep the inverse stable. */
  M.covariance = function (vecs, ridge) {
    ridge = ridge == null ? 1e-3 : ridge;
    var n = vecs.length, p = vecs[0].length, i, a, b;
    var mean = [];
    for (a = 0; a < p; a++) {
      var t = 0;
      for (i = 0; i < n; i++) t += vecs[i][a];
      mean.push(t / n);
    }
    var C = [];
    for (a = 0; a < p; a++) C.push(M.zeros(p));
    for (i = 0; i < n; i++) {
      var d = [];
      for (a = 0; a < p; a++) d.push(vecs[i][a] - mean[a]);
      for (a = 0; a < p; a++) for (b = 0; b < p; b++) C[a][b] += d[a] * d[b];
    }
    for (a = 0; a < p; a++) {
      for (b = 0; b < p; b++) C[a][b] /= (n - 1);
      C[a][a] += ridge;
    }
    return C;
  };

  M.invert = function (Min) {
    var n = Min.length, A = [], i, j, c, r;
    for (i = 0; i < n; i++) {
      var row = Min[i].slice();
      for (j = 0; j < n; j++) row.push(i === j ? 1 : 0);
      A.push(row);
    }
    for (c = 0; c < n; c++) {
      var piv = c;
      for (r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-14) return null;
      var tmp = A[c]; A[c] = A[piv]; A[piv] = tmp;
      var pv = A[c][c];
      for (j = 0; j < 2 * n; j++) A[c][j] /= pv;
      for (r = 0; r < n; r++) {
        if (r === c) continue;
        var f = A[r][c];
        if (!f) continue;
        for (j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
      }
    }
    return A.map(function (row) { return row.slice(n); });
  };

  /* Mahalanobis distance from the target to every candidate.

     Euclidean distance on z-scores double-counts: population, employment and
     density are nearly one variable wearing three hats, so an area that
     differs on size is pushed away three times over. Dividing through by the
     covariance structure makes correlated features count once.

     The candidate set must already be restricted to areas of a comparable
     kind - arithmetic does not make a small town comparable to a downtown. */
  M.mahalanobisPeers = function (targetIdx, rows, keys, k, ridge) {
    k = k || 8;
    var st = M.standardise(rows, keys);
    var Sinv = M.invert(M.covariance(st.vecs, ridge));
    var out = [];
    var t = st.vecs[targetIdx];
    var p = t.length;
    for (var i = 0; i < st.vecs.length; i++) {
      if (i === targetIdx) continue;
      var d = [], a, b;
      for (a = 0; a < p; a++) d.push(st.vecs[i][a] - t[a]);
      var q = 0;
      if (Sinv) {
        for (a = 0; a < p; a++) for (b = 0; b < p; b++) q += d[a] * Sinv[a][b] * d[b];
      } else {
        /* Degenerate covariance: fall back to standardised Euclidean and say so. */
        for (a = 0; a < p; a++) q += d[a] * d[a];
      }
      out.push({ index: i, d2: Math.max(0, q), distance: Math.sqrt(Math.max(0, q)) });
    }
    out.sort(function (x, y) { return x.d2 - y.d2; });
    return { peers: out.slice(0, k), all: out, degenerate: !Sinv, keys: keys };
  };

  /* ------------------------------------------------- 7. commuting */

  /* Commuting flows cover only workers with a USUAL place of work. People who
     worked at home, had no fixed workplace address, or worked outside Canada
     are not in the origin-destination table at all. That matters enormously
     in 2021: for Toronto the commuting table knows about 649,000 resident
     workers, while the city actually had 1,308,000 employed residents.

     So every figure derived from commuting is labelled "usual workplace" and
     is never mixed with a total. The caller supplies the all-workers totals
     separately, and both ratios are returned so the interface can show the
     same question answered on both bases rather than quietly picking one.

     selfContainmentUsual  residents with a usual workplace who work in the
                           area, over all residents with a usual workplace
     jobsRatioUsual        jobs at a usual workplace here, over the same
                           denominator; above 1 is a net importer of workers
     jobsRatioAll          all jobs located here (including work at home) over
                           all employed residents. The honest headline, but in
                           2021 it is dragged down for employment centres and
                           up for commuter suburbs, because a resident working
                           from home counts as a job in their own municipality. */
  M.commutingProfile = function (liveAndWork, inflow, outflow, opt) {
    opt = opt || {};
    var usualResidents = liveAndWork + outflow;
    var usualJobs = liveAndWork + inflow;
    var allJobs = opt.allJobs;
    var allResidents = opt.allEmployedResidents;
    return {
      usualResidents: usualResidents,
      usualJobsHere: usualJobs,
      liveAndWork: liveAndWork,
      inCommuters: inflow,
      outCommuters: outflow,
      netCommuting: inflow - outflow,
      selfContainmentUsual: usualResidents > EPS
        ? liveAndWork / usualResidents : null,
      jobsRatioUsual: usualResidents > EPS ? usualJobs / usualResidents : null,
      allJobs: allJobs == null ? null : allJobs,
      allEmployedResidents: allResidents == null ? null : allResidents,
      residentWorkersFixed: opt.residentWorkersFixed == null
        ? null : opt.residentWorkersFixed,
      jobsRatio: (allJobs != null && opt.residentWorkersFixed > EPS)
        ? allJobs / opt.residentWorkersFixed : null
    };
  };

  /* ------------------------------------------- 8. reliability */

  /* Each published cell carries an independent rounding error with the sd
     derived above, so a sum of n of them carries sd * sqrt(n). This is not
     a sampling error -
     the census long form has one of those too, and it is larger. It is the
     floor below which a number cannot be read. */
  M.roundingSd = function (nCells) {
    return M.ROUNDING_SD * Math.sqrt(Math.max(0, nCells));
  };

  M.shiftShareUncertainty = function (nIndustries) {
    return M.roundingSd(2 * nIndustries);
  };

  M.reliabilityFlag = function (v) {
    if (v == null) return 'missing';
    if (v <= M.MIN_RELIABLE_CELL) return 'withheld';
    if (v <= M.WEAK_CELL) return 'weak';
    return 'ok';
  };

  /* Percentile rank of x within a sorted array of values (nearest-rank). */
  M.percentile = function (sorted, x) {
    if (!sorted.length) return null;
    var lo = 0, hi = sorted.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (sorted[mid] < x) lo = mid + 1; else hi = mid;
    }
    return lo / sorted.length;
  };

  M.median = function (vals) {
    var v = vals.filter(function (x) { return x != null && isFinite(x); })
      .sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };

  root.GRA = root.GRA || {};
  root.GRA.methods = M;
}(this));
