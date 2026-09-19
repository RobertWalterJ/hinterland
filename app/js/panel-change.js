/* ==========================================================================
   Change over time, as a story.

   The first Change screen was one method - a shift-share decomposition of
   one pair of census years - with controls and method above the answer and
   one chart. Both reviews (design/audits/2026-09-19-*) found it "not about
   time". This screen leads with what happened, in words, then shows all five
   censuses:

     1. the answer        three or four plain sentences, each figure tested
                          against sampling error before it is stated
     2. the picture       working residents, place against Ontario, indexed
                          to the first year, every census, with the 2016
                          counting change drawn as a seam
     3. the industries    each sector's share of working residents across
                          twenty years, as small lines with both ends labelled
     4. grew / shrank     2016 to 2021, the latest pair counted the same way
     5. what was going on the sourced Ontario timeline, for the same years
     6. folds             "Why it changed" (the decomposition, unchanged) and
                          "Choosing the years" live below, not above

   Basis, said on screen: WHERE PEOPLE LIVE. Home counts jobs located in a
   place; this counts the people who live there and work anywhere. Census
   place-of-work by industry before 2021 is not held (see the feature
   audit, item 14), so this is the only industry series across five
   censuses.

   Two breaks are real and shown, never hidden: 2001-2011 count the labour
   force (working or looking), 2016 and 2021 count the employed; 2011 was the
   voluntary National Household Survey. Comparing a place with Ontario across
   the seam is fair (both carry it); reading the jump itself is not.
   ========================================================================== */

(function (root) {
  'use strict';

  var D, M, C, U, A, L;
  function init() {
    D = root.GRA.data; M = root.GRA.methods; C = root.GRA.charts;
    U = root.GRA.ui; A = root.GRA.app; L = root.GRA.learn;
  }
  function esc(s) { return C.esc(s == null ? '' : String(s)); }
  function pct(x, dp) { return (x * 100).toFixed(dp == null ? 0 : dp) + '%'; }
  function tot(v) { return v ? M.sum(v) : 0; }
  function low(i) { return D.naics[i].short.toLowerCase(); }

  /* sd of a share k/T from sampling */
  function shareSd(n, T) { return T ? M.countSd(n || 0) / T : 0; }

  function series(place) {
    var years = D.res.years.slice();
    var have = years.filter(function (y) {
      if (place.level === 'CSD' || place.level === 'PR' || place.level === 'CA') {
        return !!D.resVec(place.code, y);
      }
      return true;
    });
    /* Balanced over every year shown. For an area, coverage is judged by
       WORKERS, not by town count: the towns missing from early censuses are
       mostly small, partly enumerated reserves, and dropping twenty years
       because of them (by count) threw away Kenora's whole story. Years are
       dropped only if the fixed set would hold under 90% of today's working
       residents. */
    function cover(s, ys) {
      if (!s.members) return 1;
      var last = ys[ys.length - 1];
      var all = D.membersOf(place.level, place), inAll = 0, inKept = 0;
      var kept = {};
      all.forEach(function (c) {
        if (ys.every(function (y) { return D.hasRes(c, y); })) kept[c] = 1;
        var v = D.resVec(c, last); var t = v ? M.sum(v) : 0;
        inAll += t; if (kept[c]) inKept += t;
      });
      return inAll ? inKept / inAll : 0;
    }
    var s = D.resSeries(place, have);
    s.cover = cover(s, have);
    if (s.members && s.cover < 0.85) {
      /* 2011 is usually the culprit: the voluntary survey went unpublished
         for many small northern places. Leaving it out keeps the story back
         to 2001 for the north (Kenora 88%, the Northeast 97% of workers). */
      var no11 = function (y) { return y !== 2011; };
      var best = null;
      [have.filter(no11),
       have.filter(function (y) { return y >= 2006; }),
       have.filter(function (y) { return y >= 2006 && no11(y); }),
       have.filter(function (y) { return y >= 2016; })].forEach(function (ys) {
        if (best || ys.length < 2) return;
        var t = D.resSeries(place, ys);
        t.cover = cover(t, ys);
        if (t.cover >= 0.85) best = { ys: ys, s: t };
      });
      if (best) { have = best.ys; s = best.s; }
    }
    var ys = have.filter(function (y) { return s.vecs[y]; });
    return { years: ys, vecs: s.vecs, used: s.used, members: s.members, cover: s.cover };
  }

  /* ------------------------------------------------------------ story */

  function story(place, sr) {
    var name = esc(place.name.split(' / ')[0]);
    var out = [];
    var ys = sr.years;
    if (ys.length < 2) return out;
    var on = function (y) { return D.resVec('35', y); };

    /* 1. the latest pair counted the same way */
    if (sr.vecs[2016] && sr.vecs[2021] && on(2016) && on(2021)) {
      var a = sr.vecs[2016], b = sr.vecs[2021];
      var ta = tot(a), tb = tot(b);
      var g = (tb - ta) / ta, go = (tot(on(2021)) - tot(on(2016))) / tot(on(2016));
      var sd = M.changeSd(a, b) / ta;
      var diff = g - go;
      var verdict = Math.abs(diff) <= 2 * sd ? 'about in step with Ontario'
        : diff > 0 ? 'better than Ontario' : 'worse than Ontario';
      var dir = Math.abs(tb - ta) <= 2 * M.changeSd(a, b) ? 'stayed about the same'
        : (tb > ta ? 'rose' : 'fell') + ' ' + pct(Math.abs(g), 1);
      out.push('From 2016 to 2021 the number of working residents of ' + name +
        ' ' + dir + ', from ' + C.fmt(ta) + ' to ' + C.fmt(tb) + '. Ontario’s ' +
        (go >= 0 ? 'rose ' : 'fell ') + pct(Math.abs(go), 1) + ', so ' + name +
        ' did <b>' + verdict + '</b>.');
    }

    /* 2. the long view, in shares - much less exposed to the counting
       change, which moves every sector's level together */
    var y0 = ys[0], y1 = ys[ys.length - 1];
    var v0 = sr.vecs[y0], v1 = sr.vecs[y1], T0 = tot(v0), T1 = tot(v1);
    var moves = v0.map(function (x, k) {
      var s0 = (x || 0) / T0, s1 = (v1[k] || 0) / T1;
      var sd = Math.sqrt(Math.pow(shareSd(x, T0), 2) + Math.pow(shareSd(v1[k], T1), 2));
      return { k: k, s0: s0, s1: s1, d: s1 - s0, sure: Math.abs(s1 - s0) > 2 * sd &&
               Math.abs(s1 - s0) >= 0.015 };
    }).filter(function (m) { return m.sure; });
    var down = moves.filter(function (m) { return m.d < 0; }).sort(function (x, y) { return x.d - y.d; })[0];
    var up = moves.filter(function (m) { return m.d > 0; }).sort(function (x, y) { return y.d - x.d; })[0];
    if (y1 - y0 >= 10 && (down || up)) {
      var bits = [];
      if (down) bits.push('<b>' + esc(low(down.k)) + '</b> fell from ' + pct(down.s0) +
        ' of working residents to ' + pct(down.s1));
      if (up) bits.push('<b>' + esc(low(up.k)) + '</b> rose from ' + pct(up.s0) +
        ' to ' + pct(up.s1));
      out.push('Over ' + (y1 - y0) + ' years the work people do changed: ' +
        bits.join('; ') + '.');
    } else if (y1 - y0 >= 10) {
      out.push('Over ' + (y1 - y0) + ' years the mix of work changed little: no ' +
        'industry’s share moved by more than the census can measure.');
    }

    /* 3. against Ontario over the whole span */
    if (on(y0) && on(y1) && y1 - y0 >= 10) {
      var gl = T1 / T0, go2 = tot(on(y1)) / tot(on(y0));
      var sdl = M.changeSd(v0, v1) / T0;
      if (Math.abs(gl - go2) > 2 * sdl) {
        out.push('Since ' + y0 + ' its working population has grown ' +
          (gl > go2 ? '<b>faster</b>' : '<b>more slowly</b>') + ' than Ontario’s' +
          (gl < 1 ? ', and is smaller now than then' : '') + '.');
      }
    }
    return out;
  }

  /* ------------------------------------------------------------ pictures */

  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /* Place against Ontario, indexed to the first year = 100. Direct labels at
     the line ends, 13px type, the 2011 point hollow, the counting seam as a
     dashed rule. */
  function indexChart(host, place, sr, phone) {
    var ys = sr.years, a = {}, b = {};
    ys.forEach(function (y) {
      a[y] = tot(sr.vecs[y]);
      var v = D.resVec('35', y); if (v) b[y] = tot(v);
    });
    return indexLines(host, { years: ys, mine: a, ont: b,
      name: place.name.split(' / ')[0], hollow: [2011],
      seam: ys.indexOf(2011) >= 0 && ys.indexOf(2016) >= 0 ? [2011, 2016] : null,
      what: 'working residents', dots: true }, phone);
  }

  /* Two lines indexed to their first year = 100: this place and Ontario.
     Shared with the Population screen. */
  function indexLines(host, o, phone) {
    var ys = o.years;
    var base = o.mine[ys[0]], onBase = o.ont[ys[0]];
    var mine = ys.map(function (y) { return [y, 100 * o.mine[y] / base]; });
    var ont = ys.filter(function (y) { return o.ont[y] != null; })
      .map(function (y) { return [y, 100 * o.ont[y] / onBase]; });
    var place = { name: o.name };
    var w = host.clientWidth || (phone ? 340 : 620), h = phone ? 230 : 260;
    var padL = 44, padR = phone ? 96 : 120, padT = 18, padB = 34;
    var svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h, width: '100%', role: 'img',
      class: 'chg-chart', 'aria-label': o.what + ', indexed to ' + ys[0] + ' = 100' });
    var all = mine.concat(ont).map(function (p) { return p[1]; });
    var lo = Math.min.apply(null, all.concat([100])), hi = Math.max.apply(null, all.concat([100]));
    var pad = Math.max(3, (hi - lo) * 0.12);
    lo = Math.floor((lo - pad) / 5) * 5; hi = Math.ceil((hi + pad) / 5) * 5;
    var X = function (y) { return padL + (y - ys[0]) / ((ys[ys.length - 1] - ys[0]) || 1) * (w - padL - padR); };
    var Y = function (v) { return padT + (hi - v) / ((hi - lo) || 1) * (h - padT - padB); };
    [lo, 100, hi].forEach(function (t) {
      el('line', { x1: padL, x2: w - padR, y1: Y(t), y2: Y(t), class: t === 100 ? 'chg-base' : 'chg-grid' }, svg);
      el('text', { x: padL - 8, y: Y(t) + 4.5, 'text-anchor': 'end', class: 'chg-ax' }, svg).textContent = t;
    });
    var tickYs = ys.length <= 6 ? ys : ys.filter(function (y) { return y % 5 === 0; });
    tickYs.forEach(function (y) {
      el('text', { x: X(y), y: h - 10, 'text-anchor': 'middle', class: 'chg-ax' }, svg).textContent = y;
    });
    if (o.seam) {
      var sx = (X(o.seam[0]) + X(o.seam[1])) / 2;
      el('line', { x1: sx, x2: sx, y1: padT, y2: h - padB, class: 'chg-seam' }, svg);
    }
    function line(pts, cls, label) {
      el('polyline', { points: pts.map(function (p) { return X(p[0]) + ',' + Y(p[1]); }).join(' '),
                       class: 'chg-line ' + cls }, svg);
      pts.forEach(function (p, i) {
        if (!o.dots && i !== pts.length - 1) return;
        el('circle', { cx: X(p[0]), cy: Y(p[1]), r: 4.5,
                       class: 'chg-dot ' + cls + ((o.hollow || []).indexOf(p[0]) >= 0 ? ' is-hollow' : '') }, svg);
      });
      var last = pts[pts.length - 1];
      el('text', { x: X(last[0]) + 10, y: Y(last[1]) + 4.5, class: 'chg-lab ' + cls }, svg)
        .textContent = label + ' ' + Math.round(last[1]);
    }
    line(ont, 'is-on', 'Ontario');
    line(mine, 'is-me', place.name.split(' / ')[0].slice(0, phone ? 11 : 16));
    host.appendChild(svg);
    /* the chart, said in words - read-aloud skips pictures */
    var m1 = mine[mine.length - 1][1], o1 = ont.length ? ont[ont.length - 1][1] : null;
    return 'For every 100 ' + o.what + ' in ' + ys[0] + ', there were ' +
      Math.round(m1) + ' in ' + ys[ys.length - 1] + (o1 != null ? '; across Ontario, ' +
      Math.round(o1) + '.' : '.');
  }

  function spark(vals, years, w, h) {
    /* at least a six-point range, centred: scaling each line to its own
       extremes made a one-point wobble look as dramatic as a collapse */
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var mid = (hi + lo) / 2, half = Math.max((hi - lo) / 2, 0.03);
    lo = mid - half; hi = mid + half;
    var svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, class: 'chg-spark',
                          'aria-hidden': 'true' });
    var X = function (i) { return 4 + i / ((vals.length - 1) || 1) * (w - 8); };
    var Y = function (v) { return 4 + (hi - v) / (hi - lo) * (h - 8); };
    el('polyline', { points: vals.map(function (v, i) { return X(i) + ',' + Y(v); }).join(' '),
                     class: 'chg-line is-me' }, svg);
    vals.forEach(function (v, i) {
      el('circle', { cx: X(i), cy: Y(v), r: 3, class: 'chg-dot is-me' +
        (years[i] === 2011 ? ' is-hollow' : '') }, svg);
    });
    return svg;
  }

  /* ------------------------------------------------------------ screen */

  function render(host, ctx, phone, why) {
    init();
    var place = ctx.place;
    if (place.level === 'CT') { why(host); return; }
    var sr = series(place);
    var U_ = U;

    /* 1. the answer */
    var ans = U_.card(null, null, { className: 'chg-answer' });
    var lines = story(place, sr);
    ans.innerHTML = '<p class="eyebrow-s">Working residents: people who live here, ' +
      'wherever they work</p>' +
      '<h2 class="screen-q">How has work here changed?</h2>' +
      (lines.length ? lines.map(function (l) { return '<p class="answer-p">' + l + '</p>'; }).join('')
        : '<p class="answer-p">Statistics Canada published this place’s industry ' +
          'figures for too few census years to tell a story of change.</p>');
    host.appendChild(ans);
    if (sr.years.length < 2) { why(host); return; }

    /* 2. the picture */
    var cP = U_.card('Working residents, every census', null);
    var ph = document.createElement('div');
    ph.className = 'chg-host';
    cP.appendChild(ph);
    host.appendChild(cP);
    var said = indexChart(ph, place, sr, phone);
    cP.appendChild(U_.h('<p class="chart-says" data-read>' + esc(said) + '</p>' +
      '<p class="card-foot">' + (sr.years.indexOf(2016) >= 0 && sr.years[0] < 2016
        ? 'The dashed line marks a change in counting: up to 2011 the census counted ' +
          'everyone working or looking for work; from 2016, only those working. ' +
          'Ontario carries the same change, so compare the two lines, not the jump. '
        : '') +
      (sr.years.indexOf(2011) >= 0 ? 'The hollow 2011 point is the voluntary survey. ' : '') +
      (sr.members && sr.used < sr.members ? 'Summed from the ' + sr.used + ' of ' +
        sr.members + ' member municipalities published in every year shown, which hold ' +
        Math.round(100 * (sr.cover || 0)) + '% of its working residents today. ' : '') +
      '</p>'));

    /* 3. the industries over twenty years */
    var ys = sr.years;
    var rows = D.naics.map(function (n, k) {
      var sh = ys.map(function (y) { var v = sr.vecs[y]; return (v[k] || 0) / tot(v); });
      return { k: k, sh: sh, first: sh[0], last: sh[sh.length - 1],
               n1: sr.vecs[ys[ys.length - 1]][k] || 0 };
    });
    var big = rows.slice().sort(function (a, b) { return b.last - a.last; }).slice(0, 6);
    var movers = rows.filter(function (r) { return big.indexOf(r) < 0; })
      .sort(function (a, b) { return Math.abs(b.last - b.first) - Math.abs(a.last - a.first); })
      .slice(0, 2);
    var show = big.concat(movers.filter(function (r) { return Math.abs(r.last - r.first) >= 0.02; }));
    var cS = U_.card('The work people do, ' + ys[0] + ' to ' + ys[ys.length - 1], null);
    var list = document.createElement('div');
    list.className = 'chg-rows';
    show.forEach(function (r) {
      var T0 = tot(sr.vecs[ys[0]]), T1 = tot(sr.vecs[ys[ys.length - 1]]);
      var sd = Math.sqrt(Math.pow(shareSd(sr.vecs[ys[0]][r.k], T0), 2) +
                         Math.pow(shareSd(r.n1, T1), 2));
      var d = r.last - r.first;
      var word = Math.abs(d) <= 2 * sd || Math.abs(d) < 0.005 ? 'about the same'
        : (d > 0 ? 'up ' : 'down ') + Math.abs(Math.round(d * 100)) + ' point' +
          (Math.abs(Math.round(d * 100)) === 1 ? '' : 's');
      var row = document.createElement('div');
      row.className = 'chg-row';
      row.setAttribute('data-say', D.naics[r.k].short + ': ' + pct(r.first) + ' of working ' +
        'residents in ' + ys[0] + ', ' + pct(r.last) + ' in ' + ys[ys.length - 1] + ', ' + word + '.');
      row.innerHTML = '<div class="chg-name">' + esc(D.naics[r.k].short) + '</div>' +
        '<div class="chg-ends"><span>' + pct(r.first) + '</span><span class="chg-arrow">→</span>' +
        '<b>' + pct(r.last) + '</b></div><div class="chg-word">' + word + '</div>';
      row.insertBefore(spark(r.sh, ys, phone ? 88 : 120, 30), row.children[1]);
      list.appendChild(row);
    });
    cS.appendChild(list);
    cS.appendChild(U_.h('<p class="card-foot">Share of working residents in each industry. ' +
      'Shares are fairer across the counting change than head counts. "About the same" ' +
      'means the change is within what a census sample can measure.</p>'));
    host.appendChild(cS);

    /* 4. what grew, what shrank - the latest pair counted the same way */
    if (sr.vecs[2016] && sr.vecs[2021]) {
      var a = sr.vecs[2016], b = sr.vecs[2021];
      var ch = D.naics.map(function (n, k) {
        var sd = Math.sqrt(Math.pow(M.countSd(a[k] || 0), 2) + Math.pow(M.countSd(b[k] || 0), 2));
        return { k: k, d: (b[k] || 0) - (a[k] || 0), a: a[k] || 0, b: b[k] || 0,
                 sure: Math.abs((b[k] || 0) - (a[k] || 0)) > 2 * sd };
      }).filter(function (x) { return x.sure; });
      var grew = ch.filter(function (x) { return x.d > 0; }).sort(function (x, y) { return y.d - x.d; }).slice(0, 3);
      var shrank = ch.filter(function (x) { return x.d < 0; }).sort(function (x, y) { return x.d - y.d; }).slice(0, 3);
      var cG = U_.card('What grew and what shrank, 2016 to 2021', null);
      function col(title, arr) {
        return '<div class="chg-col"><h3 class="subh">' + title + '</h3>' + (arr.length
          ? '<ul class="chg-list">' + arr.map(function (x) {
              return '<li><b>' + esc(D.naics[x.k].short) + '</b> ' + C.signed(x.d) +
                ' <span class="chg-sub">(' + C.fmt(x.a) + ' → ' + C.fmt(x.b) + ')</span></li>';
            }).join('') + '</ul>'
          : '<p class="answer-p">Nothing clearly beyond what the census sample can measure.</p>') +
          '</div>';
      }
      cG.appendChild(U_.h('<div class="chg-cols">' + col('Grew', grew) + col('Shrank', shrank) +
        '</div><p class="card-foot">Working residents by industry. 2021 was counted in one ' +
        'week of May 2021, during pandemic closures: restaurants, arts and retail read low ' +
        'that year.</p>'));
      host.appendChild(cG);
    }

    /* 5. what was going on in Ontario */
    var Hs = root.GRA.history;
    if (Hs && Hs.timeline) {
      var ev = Hs.timeline.filter(function (e) {
        return e.year >= ys[0] - 5 && e.year <= ys[ys.length - 1];
      });
      if (ev.length) {
        var cE = U_.card('Meanwhile in Ontario', null);
        cE.appendChild(U_.h('<ul class="chg-events">' + ev.map(function (e) {
          return '<li><b>' + e.year + '</b> ' + esc(e.title) + '</li>';
        }).join('') + '</ul><p class="card-foot">Events from the same years, from the ' +
          'sourced timeline. They are context, not causes: the data cannot say what ' +
          'caused a change in one place.</p>'));
        var go = U_.h('<button type="button" class="linkbtn">Ontario’s story in Learn</button>');
        go.addEventListener('click', function () { A.state.learnView = 'story'; A.go('learn'); });
        cE.appendChild(go);
        host.appendChild(cE);
      }
    }

    /* 6. the method, below */
    var d = document.createElement('details');
    d.className = 'home-more';
    d.innerHTML = '<summary>Why it changed, and choosing the years</summary>';
    var inner = document.createElement('div');
    inner.className = 'grid';
    d.appendChild(inner);
    var built = false;
    d.addEventListener('toggle', function () {
      A.state.changeOpen = d.open;      /* the year pickers inside redraw the page */
      if (d.open && !built) { built = true; why(inner); }
    });
    if (A.state.changeOpen) { d.open = true; built = true; why(inner); }
    host.appendChild(d);
  }

  root.GRA = root.GRA || {};
  root.GRA.chgCharts = { indexLines: function (host, o, phone) { init(); return indexLines(host, o, phone); } };

  function attach() {
    var P = root.GRA.panels;
    if (!P || !P.change || P._changeStory) { if (!P) setTimeout(attach, 20); return; }
    var old = P.change;
    P._changeStory = true;
    P.change = function (host, ctx, phone) {
      render(host, ctx, phone, function (h) { old(h, ctx, phone); });
    };
  }
  attach();
}(this));
