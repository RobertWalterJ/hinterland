/* ==========================================================================
   The findings engine.

   A brief that always says the same things in the same order is a template,
   and a reader learns to skim it. This module asks a different question: of
   everything that can be computed about this place, what is actually worth
   saying about THIS one?

   Each detector below tests one proposition, and returns prose plus a
   salience score. Salience is a percentile against every comparable place in
   Ontario, not an absolute threshold - "third-most manufacturing-dependent
   municipality in the province" earns its place in a brief; "manufacturing is
   14% of jobs" does not. The brief then takes the strongest few.

   Detectors must be honest about reliability: anything resting on a cell below
   the reliability floor, or on a base too small to carry a rate, is not
   allowed to score.
   ========================================================================== */

(function (root) {
  'use strict';

  var F = {};
  var D, M, C;

  function init() {
    D = root.GRA.data; M = root.GRA.methods; C = root.GRA.charts;
  }

  /* ------------------------------------------------- the comparison universe */

  /* Province-wide distributions, computed once and cached. Every salience
     score is a position in one of these. */
  function universe(level) {
    D._uni = D._uni || {};
    if (D._uni[level]) return D._uni[level];

    var onVec = D.workVec('35', 'total');
    var onTot = M.sum(onVec);
    var y0 = 2016, y1 = 2021;
    var r0 = D.resVec('35', y0), r1 = D.resVec('35', y1);

    var rows = [];
    (D.byLevel[level] || []).forEach(function (p) {
      var v = level === 'CT'
        ? (D.ctWork && D.ctWork.data[p.code] ? D.ctWork.data[p.code][0] : null)
        : D.workVec(p.code, 'total');
      if (!v) return;
      var tot = M.sum(v);
      if (tot < 200) return;              /* too small to rank on anything */
      var ind = M.structureIndices(v, onVec);
      var lqs = M.locationQuotients(v, onVec);
      var row = {
        code: p.code, place: p, vec: v, jobs: tot,
        hhi: ind ? ind.hhiNormalised : null,
        entropy: ind ? ind.entropyNormalised : null,
        spec: ind ? ind.coefSpecialisation : null,
        hachman: ind ? ind.hachman : null,
        density: p.area_km2 > 0 ? tot / p.area_km2 : null,
        ratio: p.jobsRatio,
        selfc: p.selfContainmentUsual,
        popGrowth: p.popGrowth1121,
        lq: lqs.map(function (r) {
          /* an LQ resting on a withheld cell is not a fact about the place */
          return (r.flag === 'ok') ? r.lq : null;
        }),
        share: lqs.map(function (r) { return r.share; })
      };
      /* How different the work done IN a place is from the work its residents
         do. A dormitory suburb and an employment area both score high, for
         opposite reasons, which is why the detector reads the direction too. */
      if (level !== 'CT') {
        var rv = D.resVec(p.code, 2021);
        if (rv && M.sum(rv) >= 500) row.workResGap = M.mixDistance(v, rv);
      }
      if (level !== 'CT' && r0 && r1) {
        var a = D.resVec(p.code, y0), b = D.resVec(p.code, y1);
        if (a && b) {
          var base = M.sum(a);
          if (base >= 500) {
            var ss = M.shiftShare(a, b, r0, r1);
            row.compPer100 = ss.total.competitive / base * 100;
            row.mixPer100 = ss.total.mix / base * 100;
            row.base = base;
          }
        }
      }
      rows.push(row);
    });

    var u = { rows: rows, byCode: {}, onVec: onVec, onTot: onTot };
    rows.forEach(function (r) { u.byCode[r.code] = r; });

    /* sorted value arrays, for percentile lookups */
    u.dist = {};
    ['jobs', 'hhi', 'entropy', 'spec', 'density', 'ratio', 'selfc',
     'popGrowth', 'compPer100', 'mixPer100',
     'workResGap'].forEach(function (k) {
      u.dist[k] = rows.map(function (r) { return r[k]; })
        .filter(function (v) { return v != null && isFinite(v); })
        .sort(function (a, b) { return a - b; });
    });
    u.lqDist = D.naics.map(function (_, i) {
      return rows.map(function (r) { return r.lq[i]; })
        .filter(function (v) { return v != null && isFinite(v); })
        .sort(function (a, b) { return a - b; });
    });

    D._uni[level] = u;
    return u;
  }
  F.universe = universe;

  function pct(sorted, x) {
    if (x == null || !isFinite(x) || !sorted.length) return null;
    return M.percentile(sorted, x);
  }

  /* Rank from the top, 1-based. */
  function rankHigh(sorted, x) {
    if (x == null || !isFinite(x) || !sorted.length) return null;
    var above = 0;
    for (var i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i] > x) above++; else break;
    }
    return above + 1;
  }

  function ordinal(n) {
    if (n == null) return '';
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  F.ordinal = ordinal;

  function noun(level, plural) {
    var m = { CSD: ['municipality', 'municipalities'],
              CT: ['neighbourhood', 'neighbourhoods'] };
    return (m[level] || ['place', 'places'])[plural ? 1 : 0];
  }

  /* A finding only earns a place if it sits in a tail. This converts a
     percentile into a salience score that peaks at both ends. */
  function tailScore(p) {
    if (p == null) return 0;
    return Math.max(0, Math.abs(p - 0.5) * 2 - 0.55) / 0.45;
  }

  /* ------------------------------------------------------------ detectors */

  var DETECTORS = [];
  function detector(id, fn) { DETECTORS.push({ id: id, fn: fn }); }

  /* 1. The strongest specialisation, placed in the provincial ranking. */
  detector('top-lq', function (ctx, u, me) {
    if (!me) return null;
    var best = null;
    me.lq.forEach(function (lq, i) {
      if (lq == null || lq < 1.25) return;
      var r = rankHigh(u.lqDist[i], lq);
      if (!best || r < best.rank) best = { i: i, lq: lq, rank: r };
    });
    if (!best) return null;
    var n = D.naics[best.i];
    var total = u.lqDist[best.i].length;
    var strong = best.rank <= Math.max(3, total * 0.02);
    /* The weak branch used to reach 0.82 and open three briefs in five, on
       ranks as poor as 102nd of 360 - which is not a finding, it is a number.
       It is now capped below every genuinely ranked detector, and suppressed
       entirely outside the top decile: "its strongest specialisation" is only
       worth saying when the specialisation is actually strong. */
    if (!strong && best.rank > total * 0.1) return null;
    return {
      score: strong ? 1.0 : 0.30 + 0.20 * (1 - best.rank / (total * 0.1)),
      tag: 'specialisation',
      text: (strong
        ? 'The most distinctive thing about ' + ctx.name + ' is ' +
          n.short.toLowerCase() + ': at a location quotient of ' +
          best.lq.toFixed(2) + ' it is the ' + ordinal(best.rank) +
          ' most ' + n.short.toLowerCase() + '-concentrated ' +
          noun(ctx.level) + ' in Ontario, of ' + C.fmt(total) + ' with a usable figure.'
        : 'Its strongest specialisation is ' + n.short.toLowerCase() +
          ' (location quotient ' + best.lq.toFixed(2) + '), which ranks ' +
          ordinal(best.rank) + ' of ' + C.fmt(total) + ' in Ontario.') +
        ' That is a statement about concentration, not about growth.'
    };
  });

  /* 2. One sector carrying an unusual share of the whole economy. */
  detector('concentration', function (ctx, u, me) {
    if (!me || me.hhi == null) return null;
    var p = pct(u.dist.hhi, me.hhi);
    if (p == null || p < 0.9) return null;
    var big = null;
    me.share.forEach(function (s, i) {
      if (!big || s > big.s) big = { s: s, i: i };
    });
    return {
      score: 0.55 + (p - 0.9) * 4,
      tag: 'concentration',
      text: 'Its employment is unusually concentrated — more so than ' +
        Math.min(99, Math.round(p * 100)) + '% of Ontario ' + noun(ctx.level, true) +
        '. ' + D.naics[big.i].short + ' alone accounts for ' +
        C.pct(big.s, 0) + ' of all jobs here. Concentration is not a fault in ' +
        'itself, but it is the mechanism by which a single closure becomes a ' +
        'municipal problem.'
    };
  });

  /* 3. Or the opposite: an unusually even spread. */
  detector('diversity', function (ctx, u, me) {
    if (!me || me.entropy == null) return null;
    var p = pct(u.dist.entropy, me.entropy);
    if (p == null || p < 0.93) return null;
    return {
      score: 0.4 + (p - 0.93) * 3,
      tag: 'diversity',
      text: 'Employment here is spread more evenly across sectors than in ' +
        Math.min(99, Math.round(p * 100)) + '% of Ontario ' + noun(ctx.level, true) +
        ', with no sector dominating. A diversified base is more robust to a ' +
        'single shock and harder to market as a specialism.'
    };
  });

  /* 4. Employment centre or bedroom community, ranked. */
  detector('jobs-ratio', function (ctx, u, me) {
    if (!me || me.ratio == null) return null;
    var p = pct(u.dist.ratio, me.ratio);
    var s = tailScore(p);
    if (s < 0.25) return null;
    var high = me.ratio >= 1;
    return {
      score: 0.5 + s * 0.45,
      tag: 'commuting',
      text: high
        ? 'It draws workers in: ' + me.ratio.toFixed(2) + ' jobs for every ' +
          'resident worker, which is higher than ' + Math.round(p * 100) +
          '% of Ontario ' + noun(ctx.level, true) + '. Places like this carry ' +
          'daytime populations well above their census count, with the ' +
          'servicing and transport implications that follow.'
        : 'It is strongly residential: ' + me.ratio.toFixed(2) + ' jobs for ' +
          'every resident worker, lower than ' + Math.round((1 - p) * 100) +
          '% of Ontario ' + noun(ctx.level, true) + ' have. Most working ' +
          'residents leave the ' + noun(ctx.level) + ' to work.'
    };
  });

  /* 5. Where the out-commuters actually go. */
  detector('commute-destination', function (ctx, u, me) {
    if (ctx.level !== 'CSD' || !D.commute.top_flows) return null;
    var out = D.commute.top_flows[ctx.code + '|out'];
    var cm = ctx.ctx.commute;
    if (!out || !out.length || !cm || !cm.outCommuters) return null;
    var top = out.filter(function (f) { return f[0] !== ctx.code; })[0];
    if (!top) return null;
    var share = top[1] / cm.outCommuters;
    if (share < 0.3) return null;
    var dest = D.byCode[top[0]];
    if (!dest) return null;

    /* Two things have to be true before this is a dependency rather than
       simply a neighbour. Out-commuting has to matter here at all - "36% of
       out-commuters" says nothing if only a tenth of the workforce leaves -
       and the destination has to be the larger employment centre. Hamilton
       sends more workers to Burlington than anywhere else, but Hamilton is
       three times Burlington's size and is nobody's satellite. */
    var leaveShare = cm.usualResidents ? cm.outCommuters / cm.usualResidents : 0;
    var destBigger = (dest.jobs || 0) > (ctx.ctx.jobs || 0);
    var dependent = leaveShare >= 0.45 && destBigger && share >= 0.35;
    /* Every municipality has a largest commuting link, so "its largest link is
       to X" is true everywhere and worth saying nowhere. It used to take a
       lead slot in the brief more than two hundred times. */
    if (!dependent) return null;

    return {
      score: 0.30 + share * 0.55,
      tag: 'commuting',
      text: dependent
        ? C.pct(leaveShare, 0) + ' of its resident workers leave to work, and ' +
          C.pct(share, 0) + ' of those go to one place, ' + dest.name + ' (' +
          C.fmt(top[1]) + ' people). On the commuting evidence this is less a ' +
          'free-standing labour market than part of ' + dest.name + '’s.'
        : 'Its largest single commuting link is to ' + dest.name + ': ' +
          C.fmt(top[1]) + ' people, ' + C.pct(share, 0) + ' of everyone who ' +
          'commutes out. With ' + C.pct(leaveShare, 0) + ' of resident workers ' +
          'leaving at all, that is a connection rather than a dependency.'
    };
  });

  /* 6. Competitive performance, ranked provincially. */
  detector('competitive', function (ctx, u, me) {
    if (!me || me.compPer100 == null) return null;
    var p = pct(u.dist.compPer100, me.compPer100);
    var s = tailScore(p);
    if (s < 0.3) return null;
    var ch = ctx.ctx.change;
    var band = ch ? 2 * ch.uncertainty / me.base * 100 : 0;
    if (Math.abs(me.compPer100) < band) return null;
    var good = me.compPer100 > 0;
    return {
      score: 0.55 + s * 0.4,
      tag: 'change',
      text: 'Between 2016 and 2021 its industries ' +
        (good ? 'outperformed' : 'underperformed') + ' the same industries ' +
        'elsewhere in Ontario by ' + Math.abs(me.compPer100).toFixed(1) +
        ' jobs per 100 it started with — ' +
        (good ? 'better' : 'worse') + ' than ' +
        Math.round((good ? p : 1 - p) * 100) + '% of Ontario ' +
        noun(ctx.level, true) + '. The rounding band on that figure is ±' +
        band.toFixed(1) + ', so it is a real difference rather than noise.'
    };
  });

  /* 7. Mix and competitive pulling in opposite directions. */
  detector('against-the-tide', function (ctx, u, me) {
    var ch = ctx.ctx.change;
    if (!ch || !ch.result) return null;
    var t = ch.result.total;
    var band = 2 * ch.uncertainty;
    if (Math.abs(t.mix) < band || Math.abs(t.competitive) < band) return null;
    if ((t.mix > 0) === (t.competitive > 0)) return null;
    var tailwind = t.mix > 0;
    return {
      score: 0.7,
      tag: 'change',
      text: tailwind
        ? 'Its industry mix and its own performance point in opposite ' +
          'directions: the sectors it started in were growing ones, worth ' +
          C.signed(Math.round(t.mix)) + ' jobs, but it captured less of that ' +
          'growth than the same sectors did elsewhere, costing ' +
          C.fmt(Math.abs(Math.round(t.competitive))) + '. It had the right ' +
          'industries and lost ground in them.'
        : 'It gained ground against a structural headwind. Its starting ' +
          'industry mix cost it ' + C.fmt(Math.abs(Math.round(t.mix))) +
          ' jobs, because those sectors were shrinking province-wide — but it ' +
          'held on to ' + C.signed(Math.round(t.competitive)) + ' more than ' +
          'the same sectors managed elsewhere. The problem is the inheritance, ' +
          'not the performance.'
    };
  });

  /* 8. Population and employment moving apart. */
  detector('pop-jobs-divergence', function (ctx, u, me) {
    var ch = ctx.ctx.change;
    var p = ctx.ctx.place;
    if (!ch || !ch.result) return null;
    var jobsGrowth = ch.result.total.localGrowth;
    if (jobsGrowth == null) return null;

    /* Both sides must cover the SAME years. This compared a fixed 2011-2021
       population change against a labour-force change over whatever period the
       reader had selected - five years by default - and so reported that
       growth was "residential rather than economic" for 96% of Ontario, which
       is a statement about the arithmetic and not about the province. The
       population estimates are annual, so the matching years are always
       available. */
    var pp = D.pop.data[p.code];
    if (!pp) return null;
    var a = pp[String(ch.y0)], b = pp[String(ch.y1)];
    if (!a || !b) return null;
    var popGrowth = (b - a) / a;
    var gap = popGrowth - jobsGrowth;
    if (Math.abs(gap) < 0.12) return null;
    return {
      score: 0.4 + Math.min(0.45, Math.abs(gap)),
      tag: 'change',
      text: gap > 0
        ? 'Population and workforce have pulled apart: over the same ' +
          (ch.y1 - ch.y0) + ' years the population moved ' +
          C.signedPct(popGrowth) + ' while the resident labour force moved ' +
          C.signedPct(jobsGrowth) + '. Growth here has been residential ' +
          'rather than economic, which is the pattern that produces ' +
          'commuting pressure and a thin non-residential assessment base. ' +
          '(Population is from the annual estimates, which are adjusted for ' +
          'census undercoverage; the labour force is an unadjusted census ' +
          'count, so a few points of the gap are definitional.)'
        : 'Its labour force has held up better than its population: over ' +
          'the same ' + (ch.y1 - ch.y0) + ' years the population moved ' +
          C.signedPct(popGrowth) + ' against ' + C.signedPct(jobsGrowth) +
          ' for the resident workforce.'
    };
  });

  /* 9. REMOVED - `allocation`. It fired for two places in three and, when
     it reached the brief, restated the Esteban-Marquillas paragraph that
     brief.js prints unconditionally. A finding that duplicates fixed text
     is worse than no finding: it spends a slot and teaches the reader
     that the brief repeats itself. */

  /* 10. The place whose economy looks most like this one. */
  detector('structural-twin', function (ctx, u, me) {
    if (!me) return null;
    var best = null;
    u.rows.forEach(function (r) {
      if (r.code === me.code) return;
      if (Math.abs(Math.log(r.jobs / me.jobs)) > 1.2) return;  /* similar size */
      var d = M.mixDistance(me.vec, r.vec);
      if (d == null) return;
      if (!best || d < best.d) best = { d: d, r: r };
    });
    if (!best || best.d > 0.1) return null;
    /* "The Ontario municipality whose economy most resembles this one is Y" is
       a sentence planners repeat out loud, and a fixed 0.3 meant it never once
       led a brief. The closer the twin, the more it earns. */
    return {
      score: 0.35 + 0.5 * (1 - best.d / 0.1),
      tag: 'peers',
      text: 'Of all Ontario ' + noun(ctx.level, true) + ' of comparable size, ' +
        'the one whose industry mix most closely resembles this one is ' +
        best.r.place.name + ' — an industry-mix distance of only ' +
        best.d.toFixed(3) + ', where zero would mean identical. Whatever is ' +
        'being planned here, it is worth knowing what they did.'
    };
  });

  /* 11. A public-sector town. */
  detector('institutional', function (ctx, u, me) {
    if (!me) return null;
    var idx = {};
    D.naics.forEach(function (n, i) { idx[n.code] = i; });
    var share = ['61', '62', '91'].reduce(function (a, c) {
      return a + (me.share[idx[c]] || 0);
    }, 0);
    var onShare = ['61', '62', '91'].reduce(function (a, c) {
      return a + (u.onVec[idx[c]] || 0) / u.onTot;
    }, 0);
    if (share < onShare * 1.5 || share < 0.3) return null;
    return {
      score: 0.45 + (share - onShare),
      tag: 'structure',
      text: C.pct(share, 0) + ' of employment here is in education, health or ' +
        'public administration, against ' + C.pct(onShare, 0) + ' across ' +
        'Ontario. An institutional base is stable through a downturn and ' +
        'largely outside the reach of local economic development — it moves ' +
        'on provincial and federal decisions, not municipal ones.'
    };
  });

  /* 12. REMOVED - `reversal`. It asked for a sector whose competitive effect
     changed sign between the first and last chained interval, which is a good
     question, but it required the chained view to be switched on AND at least
     two intervals, which the default five-year span cannot produce: it fired
     for 0 of 368 municipalities. It is not resurrected here because chaining
     far enough back to give it two intervals now crosses the 2011-2016
     labour-force universe seam (METHODS section 7.0), so a sign change would
     as often be the definition turning over as the economy. */

  /* 13. Density out of step with size. */
  detector('density', function (ctx, u, me) {
    if (!me || me.density == null) return null;
    var p = pct(u.dist.density, me.density);
    if (p == null || p < 0.95) return null;
    var r = rankHigh(u.dist.density, me.density);
    return {
      score: 0.35,
      tag: 'structure',
      text: 'At ' + C.fmt(me.density, 0) + ' jobs per square kilometre it is ' +
        (r === 1
          ? 'the densest ' + noun(ctx.level) + ' in Ontario by employment'
          : 'the ' + ordinal(r) + ' densest ' + noun(ctx.level) +
            ' in Ontario by employment') +
        ', which usually means a compact employment core rather than ' +
        'dispersed industrial land.'
    };
  });

  /* 14. Nothing unusual at all - which is itself worth saying plainly. */
  detector('unremarkable', function (ctx, u, me) {
    if (!me || me.hachman == null) return null;
    if (me.hachman < 0.93) return null;
    return {
      score: 0.55,
      tag: 'structure',
      text: 'On industry composition this is a scale model of Ontario: a ' +
        'Hachman index of ' + me.hachman.toFixed(3) + ' means its mix tracks ' +
        'the provincial mix almost exactly. That is a finding, not an absence ' +
        'of one — it means sector-targeted strategy has little to grip, and ' +
        'the case for intervention has to rest on something other than ' +
        'industrial structure.'
    };
  });

  /* ------------------------------------------------ 15-19. added Sept 2026

     Five propositions the payloads already supported and nothing was asking.
     Each answers a question a planner actually brings to a municipal profile,
     and none can be read off the tables the other panels draw. */

  /* 15. The census is already out of date here. */
  detector('census-stale', function (ctx, u, me) {
    if (ctx.level !== 'CSD') return null;
    var pp = D.pop.data[ctx.code];
    if (!pp) return null;
    var a = pp['2016'], b = pp['2021'], c = pp['2025'];
    if (!a || !b || !c || b < 5000) return null;
    /* Annualised, so a five-year and a four-year span are comparable. */
    var was = Math.pow(b / a, 1 / 5) - 1;
    var now = Math.pow(c / b, 1 / 4) - 1;
    var shift = now - was;
    if (Math.abs(shift) < 0.015) return null;
    return {
      score: 0.5 + Math.min(0.45, Math.abs(shift) * 12),
      tag: 'currency',
      /* Phrased as a comment on everything else, so it cannot open a brief. */
      canLede: false,
      text: 'Everything above is a 2021 picture, and this place has moved ' +
        'since. Population grew ' + C.signedPct(was, 1) + ' a year between ' +
        '2016 and 2021 and ' + C.signedPct(now, 1) + ' a year since, on the ' +
        'annual estimates that run to 2025. ' +
        (shift > 0
          ? 'Read the structure above as a floor rather than a description.'
          : 'The structure above was measured while it was still growing ' +
            'faster than it is now.')
    };
  });

  /* 16. Deaths outnumber births, and have for years. */
  detector('natural-decrease', function (ctx, u, me) {
    var comp = D.componentsFor(ctx.ctx.place);
    if (!comp || !comp.series['2021b']) return null;
    var rows = D.componentSummary(comp.series['2021b'], '2021b');
    if (rows.length < 4) return null;
    /* Walk back from the most recent year for as long as deaths exceed
       births. A single bad year is noise; a run is a structure. */
    var run = 0, i;
    for (i = rows.length - 1; i >= 0; i--) {
      if (rows[i].natural < 0) run++; else break;
    }
    if (run < 5) return null;
    var since = rows[rows.length - run].year;
    var last = rows[rows.length - 1];
    var migration = last.intraprovincial + last.interprovincial +
                    last.international;
    return {
      /* Capped below the municipality-specific detectors on purpose: this
         describes the census division, and 32 of Ontario's 49 divisions are
         in natural decrease, so leading with it would give two-thirds of the
         province the same opening sentence. */
      score: 0.40 + Math.min(0.22, run / 90),
      tag: 'demography',
      text: 'In ' + comp.cdName + ', the census division this sits in, ' +
        'deaths have outnumbered births every year since ' + since + ' - ' +
        run + ' years running. ' +
        (migration > 0
          ? 'Its entire population growth is now migration. If net migration ' +
            'went to zero the population would fall, which is a different ' +
            'planning problem from slow growth: it puts the housing and ' +
            'settlement policy that attracts people at the centre of the ' +
            'demographic question rather than beside it.'
          : 'Migration is not currently offsetting it.') +
        ' Components of change are published for census divisions, not ' +
        'municipalities, so this describes the wider area.'
    };
  });

  /* 17. The jobs here are not the work the residents do. */
  detector('work-residence-gap', function (ctx, u, me) {
    if (!me || me.workResGap == null) return null;
    var p = pct(u.dist.workResGap, me.workResGap);
    if (p == null || p < 0.9) return null;
    var rv = D.resVec(ctx.code, 2021);
    if (!rv) return null;
    var rTot = M.sum(rv), wTot = M.sum(me.vec);
    if (!rTot || !wTot) return null;
    /* Name the sector most over-represented on each side - that is the
       sentence, not the distance. */
    var bestW = null, bestR = null;
    D.naics.forEach(function (n, i) {
      if (me.vec[i] == null || rv[i] == null) return;
      var ws = me.vec[i] / wTot, rs = rv[i] / rTot;
      if (me.vec[i] > 50 && (!bestW || ws - rs > bestW.d)) {
        bestW = { i: i, d: ws - rs };
      }
      if (rv[i] > 50 && (!bestR || rs - ws > bestR.d)) {
        bestR = { i: i, d: rs - ws };
      }
    });
    if (!bestW || !bestR) return null;
    return {
      score: 0.62 + (p - 0.9) * 3.5,
      tag: 'structure',
      text: 'What is done in ' + ctx.name + ' and what its residents do for a ' +
        'living are unusually different: an industry-mix distance of ' +
        me.workResGap.toFixed(2) + ' between the two, wider than ' +
        C.pct(p, 0) + ' of Ontario municipalities. The jobs here lean to ' +
        D.naics[bestW.i].short.toLowerCase() + '; its residents lean to ' +
        D.naics[bestR.i].short.toLowerCase() + '. That gap is the ' +
        'employment-land argument in one number - it says the local economy ' +
        'and the local workforce are not the same subject.'
    };
  });

  /* 18. The population peaked, and it was a while ago. */
  detector('past-peak', function (ctx, u, me) {
    if (ctx.level !== 'CSD') return null;
    var pp = D.pop.data[ctx.code];
    if (!pp) return null;
    var years = Object.keys(pp).map(Number)
      .sort(function (a, b) { return a - b; });
    if (years.length < 10) return null;
    var last = years[years.length - 1];
    var peakY = null, peakV = -1;
    years.forEach(function (y) {
      if (pp[y] > peakV) { peakV = pp[y]; peakY = y; }
    });
    if (peakY == null || last - peakY < 5) return null;
    var now = pp[last];
    var off = (now - peakV) / peakV;
    /* Intercensal estimates for small municipalities are modelled rather than
       counted and carry meaningful error, so the drop has to clear a floor
       that scales with how little there is to measure. */
    if (peakV < 1000) return null;
    if (off > (peakV < 5000 ? -0.03 : -0.02)) return null;
    /* The province over the same span, so the sentence has a yardstick. */
    var on = D.pop.data['35'];
    var onGrowth = (on && on[peakY]) ? (on[last] - on[peakY]) / on[peakY] : null;
    return {
      score: 0.55 + Math.min(0.4, Math.abs(off) * 5),
      tag: 'demography',
      text: 'Its population peaked in ' + peakY + ' at ' + C.fmt(peakV) +
        ' and is ' + C.pct(Math.abs(off), 1) + ' below that in ' + last +
        (onGrowth != null
          ? ', in a province that grew ' + C.signedPct(onGrowth) +
            ' over the same years'
          : '') + '. Planning for a smaller population is a different ' +
        'exercise from planning for a slower-growing one, and the difference ' +
        'shows up first in servicing and school capacity.'
    };
  });

  /* 19. Where the workforce actually comes from. */
  detector('workforce-origin', function (ctx, u, me) {
    if (ctx.level !== 'CSD' || !D.commute.top_flows) return null;
    var p = ctx.ctx.place;
    var ins = D.commute.top_flows[ctx.code];
    if (!ins || !p.usualJobsHere || !p.inCommuters) return null;
    var inShare = p.inCommuters / p.usualJobsHere;
    if (inShare < 0.4) return null;
    /* A share is not a scale. Half the workers in a township of four hundred
       commuting from the next township along is true, and says nothing about
       a regional labour shed. */
    if (p.inCommuters < 400) return null;
    var top = ins.filter(function (f) { return f[0] !== ctx.code; })[0];
    if (!top) return null;
    var conc = top[1] / p.inCommuters;
    if (conc < 0.3) return null;
    var origin = D.byCode[top[0]];
    if (!origin) return null;
    return {
      score: 0.45 + conc * 0.5,
      tag: 'labour-shed',
      text: C.pct(inShare, 0) + ' of the people working in ' + ctx.name +
        ' live somewhere else, and ' + C.pct(conc, 0) + ' of those come from ' +
        'one place, ' + origin.name + ' (' + C.fmt(top[1]) + ' people). Its ' +
        'employment area is a regional asset before it is a local one, which ' +
        'matters for who should be at the table when its future is decided. ' +
        '(Commuting counts only workers with a usual place of work, so it ' +
        'misses everyone who worked from home in May 2021.)'
    };
  });

  /* ------------------------------------------------------------- compose */

  F.compute = function (ctx) {
    init();
    var place = ctx.place;
    var level = place.level;
    if (level !== 'CSD' && level !== 'CT') return [];
    if (level === 'CT' && !D.ctWork) return [];

    var u;
    try { u = universe(level); } catch (e) { return []; }
    var me = u.byCode[place.code];

    var env = {
      ctx: ctx, place: place, level: level, code: place.code,
      name: level === 'CT' ? D.tractLabel(place.code).title : place.name
    };

    var out = [];
    DETECTORS.forEach(function (d) {
      var r;
      try { r = d.fn(env, u, me); } catch (e) { r = null; }
      if (r && r.score > 0 && r.text) {
        r.id = d.id;
        out.push(r);
      }
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  };

  root.GRA = root.GRA || {};
  root.GRA.findings = F;
}(this));
