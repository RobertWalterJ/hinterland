/* ==========================================================================
   Functional labour markets.

   A municipality is an administrative object. A labour market is a functional
   one, and the two rarely coincide: Oakville's economy is not bounded by
   Oakville's council. Every comparison in this tool so far has used
   administrative boundaries because that is how the data arrives, and this
   module is the correction - it rebuilds Ontario's labour markets from the
   commuting matrix, so a region is defined by where people actually travel to
   work rather than by where a boundary happens to fall.

   The algorithm is the self-containment family used by national statistical
   agencies for travel-to-work areas: start with every municipality as its own
   area, repeatedly take the least self-contained area and merge it into
   whichever area it interacts with most strongly, and stop when every area
   clears a self-containment target and a minimum size. This is a simplified
   Coombes-Bond: it uses the same interaction measure and the same
   size/self-containment trade-off, but not the full multi-stage validation
   pass, so the boundaries it produces are indicative rather than official.

   The interaction measure between areas i and j is the standard one:

       I(i,j) = T_ij^2 / (O_i * D_j)  +  T_ji^2 / (O_j * D_i)

   where T is the flow, O the resident workers of the origin and D the jobs of
   the destination. Squaring the flow and dividing by both margins is what
   stops a large area from absorbing everything simply by being large.

   Reference
   ---------
   Coombes, M.G., Green, A.E. and Openshaw, S. (1986) "An efficient algorithm
       to generate official statistical reporting areas." Journal of the
       Operational Research Society 37(10): 943-953.
   Office for National Statistics (2015) Travel to Work Areas methodology.
   ========================================================================== */

(function (root) {
  'use strict';

  var T = {};
  var EPS = 1e-12;

  /* Defaults. The ONS uses 75% self-containment with a 3,500-worker floor,
     relaxing toward 66.7% for areas above 25,000. Ontario is far emptier than
     Britain, so the floor is lower here - a 3,500-worker minimum would merge
     most of the north into a handful of enormous areas and say nothing. */
  T.DEFAULTS = {
    targetContainment: 0.70,
    minWorkers: 2500,
    relaxedContainment: 0.65,
    relaxedAbove: 20000
  };

  /* -------------------------------------------------------------- build */

  /* flows: [{o, d, w}] - origin code, destination code, workers.
     Returns { areas, iterations, params, unassigned } */
  T.build = function (flows, opt) {
    opt = Object.assign({}, T.DEFAULTS, opt || {});

    /* ---- index the matrix ---- */
    var codes = {}, list = [];
    function idx(c) {
      if (!(c in codes)) { codes[c] = list.length; list.push(c); }
      return codes[c];
    }
    flows.forEach(function (f) { idx(f.o); idx(f.d); });
    var n = list.length;
    if (!n) return null;

    /* Area membership: each area starts as one municipality. */
    var areaOf = [];                 /* municipality index -> area id */
    var members = [];                /* area id -> [municipality indices] */
    for (var i = 0; i < n; i++) { areaOf.push(i); members.push([i]); }

    /* Flow matrix between AREAS, kept sparse. */
    var M = [];                      /* M[a] = { b: workers } */
    for (var a = 0; a < n; a++) M.push({});
    flows.forEach(function (f) {
      var o = codes[f.o], d = codes[f.d];
      M[o][d] = (M[o][d] || 0) + f.w;
    });

    var alive = [];
    for (var z = 0; z < n; z++) alive.push(true);

    function rowSum(a) {             /* resident workers of area a */
      var s = 0; for (var b in M[a]) s += M[a][b]; return s;
    }
    function colSum(a) {             /* jobs in area a */
      var s = 0;
      for (var q = 0; q < n; q++) {
        if (!alive[q]) continue;
        if (M[q][a]) s += M[q][a];
      }
      return s;
    }

    /* Cached margins, recomputed lazily after each merge. */
    var O = new Array(n), Dm = new Array(n);
    function margins() {
      for (var q = 0; q < n; q++) { O[q] = 0; Dm[q] = 0; }
      for (var r = 0; r < n; r++) {
        if (!alive[r]) continue;
        for (var c in M[r]) {
          var ci = +c;
          if (!alive[ci]) continue;
          O[r] += M[r][ci];
          Dm[ci] += M[r][ci];
        }
      }
    }
    margins();

    function containment(a) {
      var self = M[a][a] || 0;
      var supply = O[a] > EPS ? self / O[a] : 1;   /* of residents, work here */
      var demand = Dm[a] > EPS ? self / Dm[a] : 1; /* of jobs, filled locally */
      return Math.min(supply, demand);
    }

    /* The ONS trade-off: a big area may be less self-contained and still
       stand on its own, because size itself makes it a real labour market. */
    function passes(a) {
      var c = containment(a);
      var size = Math.max(O[a], Dm[a]);
      if (size < opt.minWorkers) return false;
      if (c >= opt.targetContainment) return true;
      return size >= opt.relaxedAbove && c >= opt.relaxedContainment;
    }

    function interaction(a, b) {
      var tab = M[a][b] || 0, tba = M[b][a] || 0;
      var s = 0;
      if (tab && O[a] > EPS && Dm[b] > EPS) s += (tab * tab) / (O[a] * Dm[b]);
      if (tba && O[b] > EPS && Dm[a] > EPS) s += (tba * tba) / (O[b] * Dm[a]);
      return s;
    }

    /* ---- merge loop ---- */
    var iterations = 0;
    var guard = n * 3;
    while (iterations < guard) {
      iterations++;

      /* the worst failing area */
      var worst = -1, worstScore = Infinity;
      for (var a2 = 0; a2 < n; a2++) {
        if (!alive[a2]) continue;
        if (passes(a2)) continue;
        /* Rank by self-containment, then by size, so tiny fragments go first */
        var sc = containment(a2) + Math.max(O[a2], Dm[a2]) / 1e9;
        if (sc < worstScore) { worstScore = sc; worst = a2; }
      }
      if (worst < 0) break;                       /* everything passes */

      /* the area it is most strongly tied to */
      var best = -1, bestI = -1;
      for (var b2 = 0; b2 < n; b2++) {
        if (!alive[b2] || b2 === worst) continue;
        var ii = interaction(worst, b2);
        if (ii > bestI) { bestI = ii; best = b2; }
      }
      if (best < 0 || bestI <= 0) {
        /* No commuting link at all - an isolated area cannot be merged on the
           evidence, so it is left alone and marked. */
        alive[worst] = true;
        members[worst].isolated = true;
        /* stop it being chosen again */
        var stillFailing = false;
        for (var c2 = 0; c2 < n; c2++) {
          if (alive[c2] && !passes(c2) && !members[c2].isolated) {
            stillFailing = true; break;
          }
        }
        if (!stillFailing) break;
        continue;
      }

      /* merge worst into best */
      for (var d2 in M[worst]) {
        M[best][+d2] = (M[best][+d2] || 0) + M[worst][+d2];
      }
      for (var r2 = 0; r2 < n; r2++) {
        if (!alive[r2]) continue;
        if (M[r2][worst]) {
          M[r2][best] = (M[r2][best] || 0) + M[r2][worst];
          delete M[r2][worst];
        }
      }
      delete M[best][worst];
      members[best] = members[best].concat(members[worst]);
      members[worst] = [];
      alive[worst] = false;
      margins();
    }

    /* ---- report ---- */
    var areas = [];
    for (var k = 0; k < n; k++) {
      if (!alive[k] || !members[k].length) continue;
      var self = M[k][k] || 0;
      areas.push({
        id: k,
        members: members[k].map(function (m) { return list[m]; }),
        residentWorkers: Math.round(O[k]),
        jobs: Math.round(Dm[k]),
        liveAndWork: Math.round(self),
        supplyContainment: O[k] > EPS ? self / O[k] : null,
        demandContainment: Dm[k] > EPS ? self / Dm[k] : null,
        containment: containment(k),
        isolated: !!members[k].isolated,
        passes: passes(k)
      });
    }
    areas.sort(function (a, b) { return b.jobs - a.jobs; });

    return {
      areas: areas, iterations: iterations, params: opt,
      municipalities: n,
      note: 'Simplified Coombes-Bond travel-to-work areas. Indicative, not official.'
    };
  };

  /* Which area contains a given municipality. */
  T.areaFor = function (result, code) {
    if (!result) return null;
    for (var i = 0; i < result.areas.length; i++) {
      if (result.areas[i].members.indexOf(code) >= 0) return result.areas[i];
    }
    return null;
  };

  /* A name for an area: its largest member by jobs, plus a count. */
  T.label = function (area, jobsOf, nameOf) {
    if (!area || !area.members.length) return '';
    var best = area.members[0], bestJ = -1;
    area.members.forEach(function (c) {
      var j = jobsOf(c) || 0;
      if (j > bestJ) { bestJ = j; best = c; }
    });
    var nm = nameOf(best) || best;
    if (area.members.length === 1) return nm;
    return nm + ' area (' + area.members.length + ' municipalities)';
  };

  root.GRA = root.GRA || {};
  root.GRA.ttwa = T;
}(this));
