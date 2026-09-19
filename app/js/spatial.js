/* ==========================================================================
   Spatial statistics.

   Everything else in this tool treats 577 municipalities as 577 independent
   observations. They are not. Places next to each other share labour markets,
   highways, industrial histories and shocks, and that dependence is not a
   nuisance to be corrected away - it is usually the finding. "Manufacturing
   decline is concentrated in a contiguous belt along the 401" is a different
   and more useful statement than a list of municipalities sorted by a number.

   What is implemented:

     - spatial weights, k-nearest-neighbour and distance-band
     - global Moran's I, with a permutation test
     - local Moran's I (LISA) with per-area permutation inference, and the
       four-quadrant cluster reading
     - Getis-Ord Gi*, the hot-spot statistic
     - false discovery rate control, because running 577 simultaneous tests at
       p < 0.05 produces about 29 "significant" results from pure noise

   Inference is by conditional permutation rather than a normal approximation.
   The normal approximation for local Moran's I is known to be poor, and with
   577 areas and 999 permutations the honest version costs a few hundred
   milliseconds, so there is no reason to use the sloppy one.

   References
   ----------
   Moran, P.A.P. (1950) "Notes on continuous stochastic phenomena."
       Biometrika 37: 17-23.
   Anselin, L. (1995) "Local indicators of spatial association - LISA."
       Geographical Analysis 27(2): 93-115.
   Getis, A. and Ord, J.K. (1992) "The analysis of spatial association by use
       of distance statistics." Geographical Analysis 24(3): 189-206.
   Benjamini, Y. and Hochberg, Y. (1995) "Controlling the false discovery
       rate." JRSS B 57(1): 289-300.
   ========================================================================== */

(function (root) {
  'use strict';

  var SP = {};
  var EPS = 1e-12;

  /* ------------------------------------------------------------- geometry */

  /* Great-circle distance in kilometres. Ontario spans 15 degrees of latitude,
     so a planar approximation on lat/lon would make northern neighbours look
     closer together than southern ones. */
  function haversine(a, b) {
    var R = 6371.0088;
    var p = Math.PI / 180;
    var dLat = (b.lat - a.lat) * p, dLon = (b.lon - a.lon) * p;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * p) * Math.cos(b.lat * p) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  SP.haversine = haversine;

  /* ------------------------------------------------------------- weights */

  /* k-nearest neighbours on population-weighted centroids.

     Contiguity is the textbook default for areal data, but it fails badly
     here: Ontario has island municipalities and First Nations reserves with no
     land neighbour at all, and a contiguity matrix gives them an empty row,
     which drops them from every statistic silently. k-nearest guarantees every
     area has exactly k neighbours, which also makes the weights comparable
     across the sparse north and the dense south - a Toronto-area municipality
     has dozens of contiguous neighbours and a northern one has two, and under
     contiguity that difference alone drives the result.

     k = 6 is the common default; it is exposed so it can be argued with. */
  SP.knnWeights = function (points, k) {
    k = k || 6;
    var n = points.length;
    var W = [];
    for (var i = 0; i < n; i++) {
      var d = [];
      for (var j = 0; j < n; j++) {
        if (i === j) continue;
        d.push({ j: j, d: haversine(points[i], points[j]) });
      }
      d.sort(function (a, b) { return a.d - b.d; });
      var nb = d.slice(0, Math.min(k, d.length));
      W.push({
        nb: nb.map(function (x) { return x.j; }),
        w: nb.map(function () { return 1 / nb.length; }),   /* row-standardised */
        dist: nb.map(function (x) { return x.d; })
      });
    }
    W.type = 'k-nearest neighbours (k = ' + k + '), row-standardised';
    return W;
  };

  /* Distance band: every area within `km`. Row-standardised, and areas with no
     neighbour inside the band keep their nearest one so nothing drops out. */
  SP.bandWeights = function (points, km) {
    var n = points.length, W = [];
    for (var i = 0; i < n; i++) {
      var nb = [], dist = [];
      var nearest = -1, nearestD = Infinity;
      for (var j = 0; j < n; j++) {
        if (i === j) continue;
        var d = haversine(points[i], points[j]);
        if (d < nearestD) { nearestD = d; nearest = j; }
        if (d <= km) { nb.push(j); dist.push(d); }
      }
      if (!nb.length && nearest >= 0) { nb = [nearest]; dist = [nearestD]; }
      W.push({ nb: nb, dist: dist,
               w: nb.map(function () { return 1 / nb.length; }) });
    }
    W.type = 'distance band (' + km + ' km), row-standardised';
    return W;
  };

  /* -------------------------------------------------------- spatial lag */

  function lag(W, z) {
    var out = new Array(z.length);
    for (var i = 0; i < z.length; i++) {
      var s = 0, wi = W[i];
      for (var q = 0; q < wi.nb.length; q++) s += wi.w[q] * z[wi.nb[q]];
      out[i] = s;
    }
    return out;
  }
  SP.lag = lag;

  function standardise(x) {
    var v = x.filter(function (a) { return a != null && isFinite(a); });
    var n = v.length;
    var m = v.reduce(function (a, b) { return a + b; }, 0) / n;
    var sd = Math.sqrt(v.reduce(function (a, b) {
      return a + (b - m) * (b - m);
    }, 0) / n);
    if (sd < EPS) return null;
    return x.map(function (a) {
      return (a == null || !isFinite(a)) ? 0 : (a - m) / sd;
    });
  }

  /* --------------------------------------------- deterministic shuffling */

  /* A seeded generator, so a published figure can be reproduced exactly.
     Permutation inference with an unseeded shuffle gives a slightly different
     p-value every time the page is opened, which is indefensible in a report. */
  function rng(seed) {
    var s = seed >>> 0 || 88675123;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ------------------------------------------------------ global Moran's I */

  /* I = (n / S0) * (z' W z) / (z' z), with z the deviations from the mean.
     With row-standardised weights and standardised z this reduces to the mean
     of z_i times its spatial lag.

     Inference by permutation: reshuffle the values across areas many times and
     see how often chance produces a pattern this clustered. The pseudo p-value
     is (extreme + 1) / (permutations + 1) - the +1 matters, because a p-value
     of exactly zero is not a thing a permutation test can produce. */
  SP.moranI = function (values, W, opt) {
    opt = opt || {};
    var perms = opt.permutations || 999;
    var z = standardise(values);
    if (!z) return null;
    var n = z.length;

    /* With row-standardised weights the sum of all weights S0 equals n, so the
       n/S0 scaling factor in Moran's general form cancels and I is simply the
       ratio of the cross-product of each value with its spatial lag to the
       total variance. */
    function I(zz) {
      var lz = lag(W, zz), num = 0, den = 0;
      for (var i = 0; i < n; i++) {
        num += zz[i] * lz[i];
        den += zz[i] * zz[i];
      }
      return den < EPS ? 0 : num / den;
    }

    var obs = I(z);
    var rand = rng(opt.seed || 12345);
    var idx = [], more = 0, sum = 0, sumSq = 0;
    for (var q = 0; q < n; q++) idx.push(q);

    for (var p = 0; p < perms; p++) {
      for (var i = n - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var t = idx[i]; idx[i] = idx[j]; idx[j] = t;
      }
      var shuffled = idx.map(function (k) { return z[k]; });
      var v = I(shuffled);
      sum += v; sumSq += v * v;
      if (Math.abs(v) >= Math.abs(obs)) more++;
    }
    var mean = sum / perms;
    var sd = Math.sqrt(Math.max(0, sumSq / perms - mean * mean));

    return {
      I: obs,
      expected: -1 / (n - 1),          /* E[I] under the null */
      permMean: mean, permSd: sd,
      z: sd > EPS ? (obs - mean) / sd : null,
      p: (more + 1) / (perms + 1),
      permutations: perms,
      n: n,
      weights: W.type
    };
  };

  /* ------------------------------------------------------------- LISA */

  /* Local Moran's I: I_i = z_i * sum_j w_ij z_j.

     Inference is CONDITIONAL - area i keeps its own value and the other n-1
     values are reshuffled among its neighbours. That is the correct null for a
     local statistic, and it is why this cannot be done with a single global
     permutation.

     The quadrant is the interpretation:
       HH  a high value surrounded by high values   - a hot spot
       LL  low surrounded by low                    - a cold spot
       HL  a high value surrounded by low           - an outlier, often the
                                                      most interesting case
       LH  a low value surrounded by high */
  SP.lisa = function (values, W, opt) {
    opt = opt || {};
    /* 9,999 rather than 999, and the reason is arithmetic rather than taste.
       A permutation test with P permutations cannot produce a p-value below
       1/(P+1). Benjamini-Hochberg needs the smallest p-value to clear
       alpha/n, and with 489 municipalities that is 0.0001 - which 999
       permutations physically cannot reach, so the correction rejects
       everything no matter how strong the clustering is. At 9,999 the floor
       is 0.0001 and the test can do its job. The cost is about a second. */
    var perms = opt.permutations || 9999;
    var alpha = opt.alpha || 0.05;
    var z = standardise(values);
    if (!z) return null;
    var n = z.length;
    var lz = lag(W, z);
    var rand = rng(opt.seed || 12345);

    var out = [];
    for (var i = 0; i < n; i++) {
      var Ii = z[i] * lz[i];
      var k = W[i].nb.length;
      var more = 0;

      /* Pool of every value except i's own. */
      var pool = [];
      for (var q = 0; q < n; q++) if (q !== i) pool.push(z[q]);

      for (var p = 0; p < perms; p++) {
        /* Partial Fisher-Yates: only the first k draws are needed. */
        var s = 0;
        for (var t = 0; t < k; t++) {
          var r = t + Math.floor(rand() * (pool.length - t));
          var tmp = pool[t]; pool[t] = pool[r]; pool[r] = tmp;
          s += W[i].w[t] * pool[t];
        }
        if (Math.abs(z[i] * s) >= Math.abs(Ii)) more++;
      }

      var pv = (more + 1) / (perms + 1);
      out.push({
        i: i, Ii: Ii, z: z[i], lag: lz[i], p: pv,
        quadrant: z[i] >= 0
          ? (lz[i] >= 0 ? 'HH' : 'HL')
          : (lz[i] >= 0 ? 'LH' : 'LL')
      });
    }

    /* Benjamini-Hochberg. Running 577 tests at 0.05 yields ~29 false
       positives; a map of those is a map of noise with a legend. */
    var order = out.slice().sort(function (a, b) { return a.p - b.p; });
    var crit = 0;
    for (var r2 = 0; r2 < order.length; r2++) {
      if (order[r2].p <= alpha * (r2 + 1) / order.length) crit = order[r2].p;
    }
    out.forEach(function (o) {
      o.significant = o.p <= crit && crit > 0;
      o.cluster = o.significant ? o.quadrant : 'ns';
    });

    /* Whether the test could have rejected at all. If the smallest attainable
       p-value is above the strictest BH threshold, a result of "no clusters"
       says nothing about the data and the interface must not present it as a
       finding. */
    var floor = 1 / (perms + 1);
    var uncorrected = out.filter(function (o) { return o.p <= alpha; }).length;

    return {
      rows: out, fdrCritical: crit, alpha: alpha,
      permutations: perms, weights: W.type,
      pFloor: floor,
      underpowered: floor > alpha / out.length,
      uncorrected: uncorrected,
      counts: out.reduce(function (a, o) {
        a[o.cluster] = (a[o.cluster] || 0) + 1; return a;
      }, {})
    };
  };

  /* --------------------------------------------------------- Getis-Ord Gi* */

  /* Gi* asks a different question from LISA: not "is this area unlike its
     neighbours" but "is this neighbourhood, including the area itself, an
     unusually high or low total". It is the statistic behind the phrase "hot
     spot", and unlike local Moran's I it distinguishes a cluster of high
     values from a cluster of low ones by sign directly. */
  SP.getisOrd = function (values, W, opt) {
    opt = opt || {};
    var alpha = opt.alpha || 0.05;
    var x = values.map(function (v) {
      return (v == null || !isFinite(v)) ? 0 : v;
    });
    var n = x.length;
    var sum = x.reduce(function (a, b) { return a + b; }, 0);
    var mean = sum / n;
    var S = Math.sqrt(x.reduce(function (a, b) {
      return a + (b - mean) * (b - mean);
    }, 0) / n);
    if (S < EPS) return null;

    var out = [];
    for (var i = 0; i < n; i++) {
      /* Gi* includes i itself, so the weight row gains a self-weight. */
      var nb = W[i].nb.concat([i]);
      var w = W[i].w.concat([1 / (W[i].nb.length + 1)]);
      var sw = 0, sw2 = 0, sxw = 0;
      for (var q = 0; q < nb.length; q++) {
        sw += w[q]; sw2 += w[q] * w[q]; sxw += w[q] * x[nb[q]];
      }
      var num = sxw - mean * sw;
      var den = S * Math.sqrt((n * sw2 - sw * sw) / (n - 1));
      var g = den < EPS ? 0 : num / den;
      out.push({ i: i, G: g, p: 2 * (1 - normCdf(Math.abs(g))) });
    }

    var order = out.slice().sort(function (a, b) { return a.p - b.p; });
    var crit = 0;
    for (var r = 0; r < order.length; r++) {
      if (order[r].p <= alpha * (r + 1) / order.length) crit = order[r].p;
    }
    out.forEach(function (o) {
      o.significant = o.p <= crit && crit > 0;
      o.band = !o.significant ? 'ns' : (o.G > 0 ? 'hot' : 'cold');
    });
    return { rows: out, fdrCritical: crit, alpha: alpha, weights: W.type };
  };

  /* Abramowitz and Stegun 26.2.17; plenty accurate for a p-value. */
  function normCdf(x) {
    var b = [0.319381530, -0.356563782, 1.781477937, -1.821255978, 1.330274429];
    var t = 1 / (1 + 0.2316419 * Math.abs(x));
    var d = 0.3989422804014327 * Math.exp(-x * x / 2);
    var p = 0, tt = t;
    for (var i = 0; i < 5; i++) { p += b[i] * tt; tt *= t; }
    p = 1 - d * p;
    return x >= 0 ? p : 1 - p;
  }
  SP.normCdf = normCdf;

  /* ------------------------------------------------------------- reading */

  SP.CLUSTER_LABEL = {
    HH: 'high, among high',
    LL: 'low, among low',
    HL: 'high, among low',
    LH: 'low, among high',
    ns: 'not significant'
  };

  SP.describe = function (m) {
    if (!m) return '';
    if (m.p > 0.05) {
      return 'No detectable spatial pattern: Moran’s I is ' +
        m.I.toFixed(3) + ' against an expected ' + m.expected.toFixed(3) +
        ' under randomness, p = ' + m.p.toFixed(3) + '. On this measure ' +
        'Ontario looks like a shuffled deck, and clusters on the map below ' +
        'should not be read as real.';
    }
    var strength = Math.abs(m.I) > 0.5 ? 'strongly'
      : Math.abs(m.I) > 0.25 ? 'clearly' : 'weakly';
    return m.I > 0
      ? 'This variable is ' + strength + ' spatially clustered: Moran’s I ' +
        'of ' + m.I.toFixed(3) + ' against an expected ' +
        m.expected.toFixed(3) + ', p = ' + m.p.toFixed(3) + ' on ' +
        m.permutations + ' permutations. Neighbouring municipalities resemble ' +
        'each other far more than chance allows, so this is a regional ' +
        'phenomenon and not a municipal one.'
      : 'This variable is spatially dispersed rather than clustered ' +
        '(Moran’s I ' + m.I.toFixed(3) + ', p = ' + m.p.toFixed(3) +
        '): neighbouring municipalities are systematically unlike each other, ' +
        'which usually means the measure is picking up a centre-and-hinterland ' +
        'contrast rather than a regional gradient.';
  };

  root.GRA = root.GRA || {};
  root.GRA.spatial = SP;
}(this));
