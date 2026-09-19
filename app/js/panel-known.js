/* ==========================================================================
   "What is it known for?" - the Structure screen, answer first.

   The design review measured the old screen: two segmented controls, then
   twenty rows, THEN the sentence that answered the question just asked. It
   sorted by concentration, drew bars of share and printed counts, so the
   top row (the most concentrated) had the shortest bar.

   Now:
     1. the answer: what it has more of than Ontario, in words
     2. one picture that matches the answer - how many times Ontario's share,
        drawn around 1x, for the industries clearly above it
     3. "less than Ontario", folded
     4. the full industry list, table, export base and the settings, folded
        below as "The full picture"

   Only differences beyond sampling error are called "more" or "less": a
   location quotient of 1.3 on forty jobs is noise.
   ========================================================================== */

(function (root) {
  'use strict';

  var D, M, C, U, A;
  function init() {
    D = root.GRA.data; M = root.GRA.methods; C = root.GRA.charts;
    U = root.GRA.ui; A = root.GRA.app;
  }
  function esc(s) { return C.esc(s == null ? '' : String(s)); }

  function times(lq) {
    return lq >= 1.95 ? (Math.round(lq * 10) / 10) + '×'
      : '+' + Math.round((lq - 1) * 100) + '%';
  }

  function render(host, ctx, phone, full) {
    init();
    if (!ctx.lq || !ctx.ref) { full(host); return; }
    var name = ctx.place.level === 'CT' ? D.tractLabel(ctx.place.code).title
      : ctx.place.name.split(' / ')[0];
    var ref = ctx.ref.label;
    var rows = ctx.lq.filter(function (r) {
      return r.lq != null && r.employment != null && r.flag !== 'withheld' && r.flag !== 'missing';
    }).map(function (r) {
      var expected = r.employment / r.lq;
      return { r: r, more: r.lq >= 1.15 && r.employment >= 50 &&
                 M.clearlyLarger(r.employment, expected, 2),
               less: r.lq <= 0.87 && M.clearlyLarger(expected, r.employment, 2) };
    });
    /* Ranked by the EXTRA jobs above the benchmark's share, not by the
       ratio alone: a ratio of 1.8 on 0.8% of Toronto's jobs (head offices)
       is not what Toronto is known for; 60,000 extra finance jobs are. */
    rows.forEach(function (x) { x.extra = x.r.employment - x.r.employment / x.r.lq; });
    var more = rows.filter(function (x) { return x.more; })
      .sort(function (a, b) { return b.extra - a.extra; });
    var less = rows.filter(function (x) { return x.less; })
      .sort(function (a, b) { return a.r.lq - b.r.lq; });

    /* 1. the answer */
    var c = U.card(null, null, { className: 'chg-answer' });
    var lines = [];
    if (more.length) {
      var top = more.slice(0, 3);
      var names = top.map(function (x) {
        return '<b>' + esc(D.naics[x.r.i].short.toLowerCase()) + '</b>'; });
      lines.push('Compared with ' + esc(ref) + ', ' + esc(name) + ' has more of its jobs in ' +
        (names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
                          : names[0]) + '.');
      var t0 = more[0].r;
      lines.push(D.naics[t0.i].short + ' is ' + C.pct(t0.share) + ' of jobs here, against ' +
        C.pct(t0.refShare) + ' in ' + esc(ref) + ' (' + times(t0.lq) +
        (t0.lq >= 1.95 ? ' the share' : '') + '). Work concentrated like this usually serves ' +
        'people from beyond the place: it is what brings money in.');
    } else {
      lines.push('No industry in ' + esc(name) + ' is clearly more concentrated than in ' +
        esc(ref) + ', once sampling error is allowed for. Its jobs look much like the ' +
        'benchmark’s: a bit of everything.');
    }
    /* the largest, which is often not what it is known for */
    var biggest = ctx.lq.slice().sort(function (a, b) {
      return (b.employment || 0) - (a.employment || 0); })[0];
    if (biggest && (!more.length || biggest.i !== more[0].r.i)) {
      lines.push('Its biggest employer is still ' + esc(D.naics[biggest.i].short.toLowerCase()) +
        ' (' + C.pct(biggest.share) + '): the largest industry and the most distinctive ' +
        'one are often different.');
    }
    c.innerHTML = lines.map(function (l) { return '<p class="answer-p">' + l + '</p>'; }).join('');
    host.appendChild(c);

    /* 2. the picture: times the benchmark's share, around 1x */
    if (more.length) {
      var cP = U.card('More than ' + esc(ref), null);
      var max = Math.max.apply(null, more.map(function (x) { return x.r.lq; }).concat([2]));
      cP.appendChild(U.h('<div class="kn-rows">' + more.slice(0, 8).sort(function (a, b) {
        return b.r.lq - a.r.lq; }).map(function (x) {
        var r = x.r;
        var w = Math.min(100, (r.lq - 1) / (max - 1) * 100);
        return '<div class="kn-row" data-say="' + esc(D.naics[r.i].short + ', ' +
            (Math.round(r.lq * 10) / 10) + ' times ' + ref + '’s share, ' +
            C.fmt(r.employment) + ' jobs') + '">' +
          '<div class="kn-top"><span class="kn-name">' + esc(D.naics[r.i].short) + '</span>' +
          '<span class="kn-v">' + (Math.round(r.lq * 10) / 10).toFixed(1) + '×</span></div>' +
          '<div class="kn-track"><i style="width:' + Math.max(4, w) + '%"></i></div>' +
          '<div class="kn-sub">' + C.fmt(r.employment) + ' jobs, ' + C.pct(r.share) +
          ' of all jobs here</div></div>';
      }).join('') + '</div>' +
        '<p class="card-foot">How many times ' + esc(ref) + '’s share of jobs each ' +
        'industry has here. 1× would be exactly the same share. Only industries clearly ' +
        'above it, beyond sampling error, are shown.</p>'));
      if (root.GRA.learn) root.GRA.learn.teach(cP, ['location-quotient', 'reference-economy'], null);
      host.appendChild(cP);
    }

    /* 3. less than the benchmark */
    if (less.length) {
      var dl = document.createElement('details');
      dl.className = 'home-more';
      dl.innerHTML = '<summary>Less than ' + esc(ref) + ' (' + less.length + ')</summary>' +
        '<div class="card"><ul class="chg-list">' + less.map(function (x) {
          return '<li><b>' + esc(D.naics[x.r.i].short) + '</b> ' + C.pct(x.r.share) +
            ' of jobs here, ' + C.pct(x.r.refShare) + ' in ' + esc(ref) + '</li>';
        }).join('') + '</ul></div>';
      host.appendChild(dl);
    }

    /* 4. the full picture and the settings */
    var d = document.createElement('details');
    d.className = 'home-more';
    d.innerHTML = '<summary>The full picture, and how we worked it out</summary>';
    var inner = document.createElement('div');
    inner.className = 'grid';
    d.appendChild(inner);
    var built = false;
    d.addEventListener('toggle', function () {
      A.state.knownOpen = d.open;
      if (d.open && !built) { built = true; full(inner); }
    });
    if (A.state.knownOpen) { d.open = true; built = true; full(inner); }
    host.appendChild(d);
  }

  function attach() {
    var P = root.GRA.panels;
    if (!P || !P.structure) { setTimeout(attach, 20); return; }
    if (P._knownFirst) return;
    var old = P.structure;
    P._knownFirst = true;
    P.structure = function (host, ctx, phone) {
      render(host, ctx, phone, function (h) { old(h, ctx, phone); });
    };
  }
  attach();
}(this));
