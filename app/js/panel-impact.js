/* ==========================================================================
   The impact panel.

   The question this answers: if N jobs arrived here in a given industry, what
   does the current structure imply about the jobs, income and output that
   would follow? That is the question every employment-land and economic
   development report asks, and the one most often answered badly.

   It is answered here with published Statistics Canada input-output
   multipliers rather than a number someone invented, and it is hedged hard,
   because the honest version of this calculation is much less impressive than
   the version consultants usually present.

   Three things make it defensible:

     1. Type I and Type II multipliers are dimensionless ratios - total per
        direct - so a job count goes in and a job count comes out, with no
        invented dollar figures anywhere in the chain.
     2. The multipliers are PROVINCIAL. Applying them to a municipality
        overstates local capture, because a smaller economy buys more of its
        inputs from outside itself. The indirect and induced parts are scaled
        down by a Flegg-Webber factor derived from the municipality's size.
     3. Induced effects are shown separately and never folded silently into a
        headline, because they are the least reliable part of the calculation.
   ========================================================================== */

(function (root) {
  'use strict';

  var D, M, C, A, U;

  function init() {
    D = root.GRA.data; M = root.GRA.methods; C = root.GRA.charts;
    A = root.GRA.app; U = root.GRA.ui;
  }

  function mult(rec, variable, type) {
    var v = rec && rec.m && rec.m[variable];
    return v && v[type] != null ? v[type] : null;
  }

  /* The share of provincial indirect and induced activity a local economy of
     this size can plausibly capture. Flegg-Webber: lambda* = [log2(1 + e/E)]^d.
     It falls steeply for small places, which is the correct behaviour - a town
     of two thousand jobs supplies almost none of its own inputs. */
  function localCapture(ctx) {
    var onVec = D.workVec('35', 'total');
    var E = M.sum(onVec);
    var e = ctx.jobs;
    if (!e || !E) return null;
    var lam = Math.pow(Math.log2(1 + e / E), 0.25);
    return Math.max(0, Math.min(1, lam));
  }

  function impactPanel(host, ctx, phone) {
    init();
    var h = U.h, card = U.card, table = U.table, stat = U.stat;
    var st = ctx.state;

    if (!D.io || !D.io.industries) {
      host.appendChild(card('Impact', 'The multiplier data did not load.'));
      return;
    }
    if (!ctx.local) {
      host.appendChild(card('Impact',
        'This needs a local employment figure, and Statistics Canada published ' +
        'none for this place.'));
      return;
    }

    var codes = Object.keys(D.io.industries).sort(function (a, b) {
      return D.io.industries[a].label.localeCompare(D.io.industries[b].label);
    });
    if (!st.impactIndustry || !D.io.industries[st.impactIndustry]) {
      /* Open on whatever the place actually does most of, not on an
         alphabetical accident. */
      var big = null;
      D.naics.forEach(function (n, i) {
        var v = ctx.local[i] || 0;
        if (!big || v > big.v) big = { v: v, code: n.code };
      });
      var cand = big ? (D.io.sector_index[big.code] || []) : [];
      st.impactIndustry = cand[0] || 'BS3A0';
    }
    if (!st.impactJobs) st.impactJobs = 100;

    var rec = D.io.industries[st.impactIndustry];
    var capture = localCapture(ctx);

    /* ------------------------------------------------------- controls */
    var ctl = h('<div class="ctlrow"></div>');
    ctl.appendChild(h('<span style="font-size:13px;color:var(--ink-3)">If</span>'));
    var num = h('<input class="search" type="number" min="1" max="100000" ' +
      'step="10" value="' + st.impactJobs + '" ' +
      'style="width:110px;padding:6px 10px" aria-label="Number of jobs">');
    num.addEventListener('change', function () {
      var v = Math.max(1, Math.min(100000, +num.value || 100));
      st.impactJobs = v; A.render();
    });
    ctl.appendChild(num);
    ctl.appendChild(h('<span style="font-size:13px;color:var(--ink-3)">' +
      'jobs arrived in</span>'));

    var sel = h('<select class="sel" aria-label="Industry" ' +
      'style="max-width:min(460px,70vw)">' +
      codes.map(function (c) {
        return '<option value="' + c + '"' +
          (c === st.impactIndustry ? ' selected' : '') + '>' +
          C.esc(D.io.industries[c].label) + '</option>';
      }).join('') + '</select>');
    sel.addEventListener('change', function () {
      st.impactIndustry = sel.value; A.render();
    });
    ctl.appendChild(sel);
    host.appendChild(ctl);

    /* --------------------------------------------------- the numbers */
    var N = st.impactJobs;
    var jd = mult(rec, 'Jobs', 'Direct multiplier');
    var ji = mult(rec, 'Jobs', 'Indirect multiplier');
    var ju = mult(rec, 'Jobs', 'Induced multiplier');
    if (!jd) {
      host.appendChild(card('No employment multiplier for this industry',
        'Statistics Canada publishes no jobs multiplier for ' +
        C.esc(rec.label) + '.'));
      return;
    }

    /* Ratios to direct, which is what makes this work from a job count alone. */
    var rIndirect = ji / jd;
    var rInduced = ju / jd;
    var indirectProv = N * rIndirect;
    var inducedProv = N * rInduced;
    var indirectLocal = indirectProv * capture;
    var inducedLocal = inducedProv * capture;

    var c = card('What ' + C.fmt(N) + ' jobs in ' +
      C.esc(rec.label.toLowerCase()) + ' would imply',
      'Direct jobs are the ones that arrive. Indirect jobs are in the supply ' +
      'chain that serves them. Induced jobs come from those workers spending ' +
      'their wages. The provincial figures are what Ontario as a whole would ' +
      'capture; the local figures are what a place this size plausibly keeps.');

    c.appendChild(h('<div class="hero">' +
      stat(C.fmt(N), 'direct jobs', 'the ones that arrive') +
      stat(C.fmt(Math.round(indirectLocal)), 'indirect, locally',
           'of ' + C.fmt(Math.round(indirectProv)) + ' province-wide') +
      stat(C.fmt(Math.round(inducedLocal)), 'induced, locally',
           'of ' + C.fmt(Math.round(inducedProv)) + ' province-wide') +
      stat(C.fmt(Math.round(N + indirectLocal + inducedLocal)),
           'total jobs, locally',
           (1 + (indirectLocal + inducedLocal) / N).toFixed(2) +
           ' per direct job') +
      '</div>'));

    c.appendChild(h('<div class="gloss">A place with ' + C.fmt(ctx.jobs) +
      ' jobs is ' + C.pct(ctx.jobs / M.sum(D.workVec('35', 'total')), 1) +
      ' of Ontario’s economy, so it can supply only a fraction of its own ' +
      'inputs. The Flegg-Webber factor for a place this size is <b>' +
      capture.toFixed(2) + '</b>, meaning roughly ' + C.pct(capture, 0) +
      ' of the provincial indirect and induced effect is assumed to stay here ' +
      'and the rest to leak to the rest of Ontario and beyond. That adjustment ' +
      'reduces a well-known upward bias; it does not eliminate it.</div>'));

    /* the full multiplier picture, provincial */
    var rows = [];
    ['Jobs', 'Output', 'Gross domestic product (GDP) at basic prices',
     'Labour income'].forEach(function (v) {
      var d = mult(rec, v, 'Direct multiplier');
      if (d == null) return;
      rows.push({
        variable: v === 'Gross domestic product (GDP) at basic prices'
          ? 'GDP at basic prices' : v,
        direct: d,
        indirect: mult(rec, v, 'Indirect multiplier'),
        induced: mult(rec, v, 'Induced multiplier'),
        simple: mult(rec, v, 'Simple multiplier'),
        total: mult(rec, v, 'Total multiplier'),
        t1: mult(rec, v, 'Type I multiplier'),
        t2: mult(rec, v, 'Type II multiplier')
      });
    });
    c.appendChild(table([
      { key: 'variable', label: 'Per $1 of output' },
      { key: 'direct', label: 'Direct', type: 'dec', dp: 3 },
      { key: 'indirect', label: 'Indirect', type: 'dec', dp: 3 },
      { key: 'induced', label: 'Induced', type: 'dec', dp: 3 },
      { key: 'simple', label: 'Direct + indirect', type: 'dec', dp: 3 },
      { key: 'total', label: 'All three', type: 'dec', dp: 3 },
      { key: 't1', label: 'Type I ratio', type: 'dec' },
      { key: 't2', label: 'Type II ratio', type: 'dec' }
    ], rows));
    c.appendChild(h('<div class="card-foot">Jobs are per million dollars of ' +
      'output; the rest are per dollar. Type I is direct plus indirect over ' +
      'direct; Type II adds induced. Ontario ' + D.io.year +
      ', within-province coverage, Statistics Canada ' + D.io.source +
      '.</div>'));
    if (root.GRA.learn) root.GRA.learn.teach(c, ['multiplier', 'flegg-webber'], null);
    host.appendChild(c);

    /* ----------------------------------------- how it compares */
    var cmp = card('How this industry compares',
      'Two industries with the same number of direct jobs can pull very ' +
      'different amounts behind them, and the ranking is not the one most ' +
      'people expect.');
    var all = codes.map(function (code) {
      var r = D.io.industries[code];
      var d = mult(r, 'Jobs', 'Direct multiplier');
      var t2 = mult(r, 'Jobs', 'Type II multiplier');
      return { code: code, label: r.label, jobsPerM: d, t2: t2 };
    }).filter(function (r) { return r.jobsPerM && r.t2; })
      .sort(function (a, b) { return b.t2 - a.t2; });

    var bh = document.createElement('div');
    cmp.appendChild(bh);
    U.afterLayout(function () {
      C.rankedBars(bh, all.map(function (r) {
        return {
          label: r.label.length > 34 ? r.label.slice(0, 32) + '…' : r.label,
          value: r.t2, accent: r.code === st.impactIndustry,
          display: r.t2.toFixed(2),
          note: r.jobsPerM.toFixed(2) + ' direct jobs per $1M of output'
        };
      }), { valueName: 'Total jobs per direct job', rowH: 21,
            labelWidth: phone ? 130 : 230 });
    });
    cmp.appendChild(h('<div class="card-foot">A high ratio means each direct ' +
      'job pulls a lot of other activity with it — typically manufacturing ' +
      'and construction, with long domestic supply chains. A low ratio is ' +
      'usually a labour-intensive service that creates many jobs per dollar ' +
      'but buys little: health care produces about six times as many direct ' +
      'jobs per dollar as manufacturing, and pulls roughly half as much behind ' +
      'each one. Neither is better; they are different instruments.</div>'));
    host.appendChild(cmp);

    /* ----------------------------------------- what it maps to locally */
    var sectors = rec.naics || [];
    var localJobs = 0;
    var names = [];
    sectors.forEach(function (sc) {
      var i = -1;
      D.naics.forEach(function (n, k) { if (n.code === sc) i = k; });
      if (i >= 0) {
        localJobs += ctx.local[i] || 0;
        names.push(D.naics[i].short.toLowerCase());
      }
    });
    var link = card('What this is here',
      'Input-output industries and NAICS sectors are different ' +
      'classifications, so the link has to be stated rather than assumed.');
    link.appendChild(h('<div class="hero">' +
      stat(C.fmt(Math.round(localJobs)), 'existing jobs here',
           'in ' + C.esc(names.join(', '))) +
      stat(sectors.length > 1 ? sectors.length + ' sectors' : '1 sector',
           'this industry spans') +
      (localJobs ? stat(C.pct(N / localJobs, 1), 'the size of the shock',
                        'relative to what is already here') : '') +
      '</div>'));
    if (rec.note) {
      link.appendChild(h('<div class="card-foot"><span class="flag ' +
        'flag-weak">note</span> ' + C.esc(rec.note) + '</div>'));
    }
    if (localJobs && N > localJobs * 0.25) {
      link.appendChild(h('<div class="card-foot"><span class="flag ' +
        'flag-withheld">large shock</span> ' + C.fmt(N) + ' jobs is ' +
        C.pct(N / localJobs, 0) + ' of the existing sector here. Input-output ' +
        'multipliers assume fixed technical coefficients and no capacity ' +
        'constraints, which is a reasonable approximation for a marginal ' +
        'change and a poor one for a shock this size. Treat the result as an ' +
        'upper bound.</div>'));
    }
    host.appendChild(link);

    /* ------------------------------------------------- the caveats */
    var cav = card('What this cannot tell you',
      'This is the calculation most often misused in economic development, ' +
      'so the limits are worth stating plainly rather than in a footnote.');
    cav.appendChild(h('<div class="prose"><div class="cav">' +
      '<p><b>These are provincial multipliers.</b> Statistics Canada does not ' +
      'publish municipal ones, and no adjustment can manufacture them. The ' +
      'Flegg-Webber scaling used here is a size-based approximation, not a ' +
      'regional input-output table.</p>' +
      '<p><b>It is not a forecast.</b> It answers what the current structure ' +
      'implies if the jobs arrive and nothing else changes. Nothing else ever ' +
      'stays the same.</p>' +
      '<p><b>Fixed coefficients, no capacity limits, no price response.</b> ' +
      'Every industry is assumed to buy inputs in the same proportions ' +
      'regardless of scale, and to find the workers and materials it needs at ' +
      'today’s prices.</p>' +
      '<p><b>Induced effects are the weakest part.</b> They assume households ' +
      'spend as the average Ontario household does, and that the spending ' +
      'stays local. They are shown separately for that reason and should not ' +
      'be quoted as though they were as solid as the direct figure.</p>' +
      '<p><b>Gross, not net.</b> This counts activity created, not activity ' +
      'displaced. If the jobs come at the expense of an existing employer, or ' +
      'from a competitor down the road, the net effect on Ontario is smaller ' +
      'and may be zero.</p>' +
      '</div></div>'));
    host.appendChild(cav);
  }

  function attach() {
    if (root.GRA && root.GRA.panels) {
      root.GRA.panels.impact = impactPanel;
    } else {
      setTimeout(attach, 20);
    }
  }
  attach();
}(this));
