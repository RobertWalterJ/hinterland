/* ==========================================================================
   Panels - one renderer per tab.

   Each renderer reads the finished analysis off ctx and draws it. None of them
   compute an index; that happens once, in app.js, against methods.js.

   Every panel that shows a chart also shows the table behind it, because a
   chart is a reading of the numbers and the numbers are the evidence.
   ========================================================================== */

(function (root) {
  'use strict';

  var P = {};
  var D, M, C, A;

  function init() {
    D = root.GRA.data; M = root.GRA.methods;
    C = root.GRA.charts; A = root.GRA.app;
  }

  /* ------------------------------------------------------------ builders */

  function h(html) {
    var t = document.createElement('div');
    t.innerHTML = html.trim();
    return t.firstElementChild;
  }

  function card(title, noteHTML, opts) {
    opts = opts || {};
    var c = document.createElement('div');
    c.className = 'card' + (opts.className ? ' ' + opts.className : '');
    if (opts.style) c.setAttribute('style', opts.style);
    var head = '';
    if (title) {
      head = '<div class="card-head"><h3>' + C.esc(title) + '</h3>' +
        (opts.badge ? '<span class="eyebrow">' + C.esc(opts.badge) + '</span>' : '') +
        '</div>';
    }
    c.innerHTML = head + (noteHTML ? '<p class="card-note">' + noteHTML + '</p>' : '');
    return c;
  }

  function stat(value, label, hint, cls) {
    return '<div class="stat"><div class="v ' + (cls || '') + '">' + value +
      '</div><div class="l">' + label + '</div>' +
      (hint ? '<div class="h">' + hint + '</div>' : '') + '</div>';
  }

  function table(columns, rows, opts) {
    opts = opts || {};
    var w = document.createElement('div');
    w.className = 'tbl-wrap';
    var html = '<table class="data"><thead><tr>' +
      columns.map(function (c) {
        return '<th' + (c.title ? ' title="' + C.esc(c.title) + '"' : '') + '>' +
          C.esc(c.label) + '</th>';
      }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr>' + columns.map(function (c) {
          var v = r[c.key];
          var cls = c.signed && typeof v === 'number'
            ? (v > 0 ? 'pos' : v < 0 ? 'neg' : '') : '';
          return '<td class="' + cls + '">' + (c.render ? c.render(r) : cellText(v, c)) +
            '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody>' +
      (opts.totals
        ? '<tfoot><tr>' + columns.map(function (c) {
            var v = opts.totals[c.key];
            return '<td>' + (c.render && opts.renderTotals ? c.render(opts.totals)
              : cellText(v, c)) + '</td>';
          }).join('') + '</tr></tfoot>'
        : '') +
      '</table>';
    w.innerHTML = html;
    return w;
  }

  function cellText(v, c) {
    if (v == null) return '<span style="color:var(--ink-3)">—</span>';
    if (typeof v !== 'number') return C.esc(v);
    if (c.type === 'pct') return C.pct(v, c.dp == null ? 1 : c.dp);
    if (c.type === 'spct') return C.signedPct(v, c.dp == null ? 1 : c.dp);
    if (c.type === 'dec') return C.fmt(v, c.dp == null ? 2 : c.dp);
    if (c.signed) return C.signed(v, c.dp || 0);
    return C.fmt(v, c.dp || 0);
  }

  function flagChip(flag) {
    if (flag === 'ok') return '';
    var label = { weak: 'weak', withheld: 'too small', missing: 'not published' }[flag];
    return '<span class="flag flag-' + flag + '">' + label + '</span>';
  }

  function seg(items, current, onPick) {
    var s = document.createElement('div');
    s.className = 'seg';
    s.innerHTML = items.map(function (it) {
      return '<button data-v="' + it.v + '" aria-pressed="' +
        (it.v === current) + '"' +
        (it.title ? ' title="' + C.esc(it.title) + '"' : '') + '>' +
        C.esc(it.label) + '</button>';
    }).join('');
    s.addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]');
      if (b) onPick(b.getAttribute('data-v'));
    });
    return s;
  }

  /* A control that plays a chart rather than changing it. Hidden entirely
     when sound is off, so it never advertises a feature that would do
     nothing. */
  function playBtn(label, fn) {
    var b = h('<button class="playbtn" title="Play this as sound">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M8 5v14l11-7z"/></svg>' + C.esc(label) + '</button>');
    if (!root.GRA.sound.enabled) b.hidden = true;
    b.addEventListener('click', fn);
    return b;
  }

  function chartHost(height) {
    var d = document.createElement('div');
    if (height) d.style.minHeight = height + 'px';
    return d;
  }

  /* Charts need a measured width, so they are drawn after layout.

     requestAnimationFrame alone is not enough: a browser suspends it entirely
     while the tab or window is hidden, so a reader who switches away during a
     load comes back to a page of empty boxes that never fill. The timer is the
     safety net, and whichever fires first wins. */
  function afterLayout(fn) {
    var done = false;
    function once() {
      if (done) return;
      done = true;
      fn();
    }
    requestAnimationFrame(function () { requestAnimationFrame(once); });
    setTimeout(once, 120);
  }

  function measureNote(ctx) {
    return ctx.state.measure === 'usual'
      ? 'Counting only workers with a usual place of work — offices, plants and ' +
        'shops. In May 2021 many office workers were recorded at home instead, ' +
        'so this understates the office-based economy.'
      : 'Counting all jobs located here, including people working at home. In ' +
        'May 2021 that pushed jobs toward residential municipalities.';
  }

  function refLine(ctx) {
    if (!ctx.ref) return '';
    return 'Compared with <b>' + C.esc(ctx.ref.label) + '</b>. ' +
      C.esc(ctx.ref.note);
  }

  /* ===================================================== 1. OVERVIEW */

  P.overview = function (host, ctx, phone) {
    init();
    if (!ctx.local || !ctx.ref) {
      host.appendChild(noData(ctx));
      return;
    }
    var p = ctx.place;
    var cm = ctx.commute;

    /* Headline. Two different employment concepts are in play and they are
       kept visibly apart: the all-workers pair (place of work against
       employed residents) and the usual-workplace pair that the commuting
       table supports. Mixing them is the classic way to get this wrong. */
    var top = card(null, null, { className: 'card' });
    var ratio = ctx.jobsRatio;
    var ratioTxt = ratio == null ? null : ratio.toFixed(2);
    top.innerHTML =
      '<div class="eyebrow">' + C.esc(p.kind) +
      (p.level === 'CSD' && p.cd && D.geo.cd_names[p.cd]
        ? ' · ' + C.esc(D.geo.cd_names[p.cd]) : '') + '</div>' +
      '<h2 style="font-size:26px;margin:2px 0 14px">' +
      C.esc(p.level === 'CT' ? D.tractLabel(p.code).title : p.name) + '</h2>' +
      '<div class="hero">' +
      stat(C.fmt(ctx.jobs), 'jobs located here',
           '2021 Census, place of work, including work at home') +
      (ctx.residentWorkersFixed
        ? stat(C.fmt(ctx.residentWorkersFixed), 'resident workers',
               'living here, working at home or at a fixed workplace') : '') +
      (ratioTxt
        ? stat(ratioTxt, 'jobs per resident worker',
               ratio >= 1 ? 'more jobs here than resident workers'
                          : 'fewer jobs here than resident workers',
               ratio >= 1 ? 'pos' : '') : '') +
      (cm ? stat(C.pct(cm.selfContainmentUsual, 0), 'work in the municipality',
                 'of residents with a usual workplace') : '') +
      (p.pop2021 ? stat(C.fmt(p.pop2021), 'residents', '2021 Census count') : '') +
      '</div>' +
      '<div class="gloss">' + glossFor(ctx) + '</div>';
    host.appendChild(top);

    if (cm) {
      var cCom = card('Commuting, and what it can and cannot tell you',
        'The origin-destination table covers only workers with a <b>usual ' +
        'place of work</b>. People who worked at home, had no fixed workplace ' +
        'address, or worked outside Canada are not in it at all — in 2021 that ' +
        'is a very large group. So the commuting measures below use a smaller ' +
        'denominator than the headline figures above, and the two are not ' +
        'interchangeable.');
      cCom.appendChild(h('<div class="hero">' +
        stat(C.fmt(cm.usualResidents), 'residents with a usual workplace',
             'of ' + C.fmt(ctx.employedResidents || 0) + ' employed residents, ' +
             C.fmt(ctx.residentWorkersFixed || 0) + ' of whom can be matched ' +
             'to a workplace') +
        stat(C.fmt(cm.liveAndWork), 'live and work here') +
        stat(C.fmt(cm.inCommuters), 'commute in') +
        stat(C.fmt(cm.outCommuters), 'commute out') +
        stat(C.signed(cm.netCommuting), 'net commuting', null,
             cm.netCommuting >= 0 ? 'pos' : 'neg') +
        stat(cm.jobsRatioUsual == null ? '—' : cm.jobsRatioUsual.toFixed(2),
             'jobs per resident worker',
             'usual-workplace basis only') +
        '</div>'));
      cCom.appendChild(h('<div class="card-foot">In the May 2021 reference ' +
        'week a resident working from home was recorded as working in their own ' +
        'municipality. That moved jobs out of employment centres and into ' +
        'commuter suburbs, pushed self-containment up, and suppressed ' +
        'in-commuting. It is the single largest caveat on this page.</div>'));
      host.appendChild(cCom);
    }

    var grid = h('<div class="grid g-main"></div>');
    host.appendChild(grid);

    /* what it is concentrated in */
    var specs = ctx.lq.map(function (r) { return r; })
      .filter(function (r) { return r.lq != null && r.flag !== 'withheld' && r.flag !== 'missing'; })
      .sort(function (a, b) { return b.lq - a.lq; });

    var cSpec = card('What it is concentrated in',
      'Location quotient: employment share here against the same share in ' +
      C.esc(ctx.ref.label) + '. Above 1.25 counts as a specialisation. ' +
      'Concentration is not the same as growth.');
    var lqHost = chartHost(phone ? 0 : 240);
    cSpec.appendChild(lqHost);
    if (phone) {
      lqHost.innerHTML = specs.slice(0, 8).map(function (r) {
        var n = D.naics[r.i];
        return '<div class="sectorrow"><div><div class="nm">' + C.esc(n.short) +
          '</div><div class="meta">' + C.fmt(r.employment) + ' jobs · ' +
          M.lqBand(r.lq) + ' ' + flagChip(r.flag) + '</div></div>' +
          '<div class="big">' + r.lq.toFixed(2) + '</div>' +
          '<div class="track"><i style="width:' +
          Math.min(100, r.lq / 4 * 100) + '%"></i></div></div>';
      }).join('');
    } else {
      afterLayout(function () {
        C.rankedBars(lqHost, specs.slice(0, 10).map(function (r) {
          return {
            label: D.naics[r.i].short, value: r.lq, accent: r.lq >= 1.25,
            display: r.lq.toFixed(2),
            note: C.fmt(r.employment) + ' jobs · ' + C.pct(r.share) +
              ' of local jobs vs ' + C.pct(r.refShare) + ' in the reference'
          };
        }), { valueName: 'Location quotient', rowH: 22 });
      });
    }
    cSpec.appendChild(h('<div class="card-foot">' + refLine(ctx) + '</div>'));
    grid.appendChild(cSpec);

    /* right column */
    var right = h('<div class="grid" style="align-content:start"></div>');
    grid.appendChild(right);

    /* change summary */
    if (ctx.change && ctx.change.result) {
      var t = ctx.change.result.total;
      var cc = card('What changed, ' + ctx.change.y0 + ' to ' + ctx.change.y1,
        'Resident labour force by industry, decomposed. Full detail on the ' +
        'Change tab.');
      cc.appendChild(h(
        '<div class="hero" style="gap:18px 26px">' +
        stat(C.signed(t.actual), 'jobs, observed change', null,
             t.actual >= 0 ? 'pos' : 'neg') +
        stat(C.signed(t.mix), 'industry mix effect', null,
             t.mix >= 0 ? 'pos' : 'neg') +
        stat(C.signed(t.competitive), 'competitive effect', null,
             t.competitive >= 0 ? 'pos' : 'neg') +
        '</div>'));
      cc.appendChild(h('<div class="card-foot">' + competitiveGloss(ctx) + '</div>'));
      right.appendChild(cc);
    }

    /* indices */
    if (ctx.indices) {
      var ci = card('Shape of the economy', null);
      ci.appendChild(indexBlock(ctx, phone));
      right.appendChild(ci);
    }

    /* map + trend, desktop */
    if (!phone) {
      var cm2 = card('Where it is', 'Click any municipality to switch to it.');
      var mh = h('<div class="mapbox" style="height:300px"></div>');
      cm2.appendChild(mh);
      host.appendChild(cm2);
      afterLayout(function () { miniMap(mh, ctx); });
    }

    if (ctx.change && ctx.change.available.length > 2) {
      var ct2 = card('Resident labour force across five censuses',
        'Place of residence, not place of work. The 2021 dip is partly real and ' +
        'partly an artefact of a May 2021 reference week during a lockdown.');
      var th = chartHost(220);
      ct2.appendChild(th);
      host.appendChild(ct2);
      afterLayout(function () { trendChart(th, ctx); });
    }
  };

  function glossFor(ctx) {
    var bits = [];
    var cm = ctx.commute;
    var ind = ctx.indices;
    var r = ctx.jobsRatio;
    if (r != null) {
      bits.push(r >= 1.15
        ? 'An employment centre: it holds more jobs than it has working residents.'
        : r <= 0.75
          ? 'Largely a place people live rather than work.'
          : 'Jobs and working residents are roughly in balance.');
    }
    var strong = ctx.lq.filter(function (r) {
      return r.lq != null && r.lq >= 1.5 && r.flag === 'ok';
    }).sort(function (a, b) { return b.employment - a.employment; });
    if (strong.length) {
      bits.push('Most concentrated in ' +
        strong.slice(0, 2).map(function (r) {
          return '<b>' + C.esc(D.naics[r.i].short.toLowerCase()) + '</b>';
        }).join(' and ') + '.');
    } else {
      bits.push('No sector stands out strongly against ' +
        C.esc(ctx.ref.label) + '.');
    }
    if (ind && ind.hachman != null) {
      bits.push(ind.hachman > 0.85
        ? 'Overall its mix is close to a scale model of the reference economy.'
        : 'Its mix is distinctly different from the reference economy.');
    }
    return bits.join(' ');
  }

  function competitiveGloss(ctx) {
    var t = ctx.change.result.total;
    var u = ctx.change.uncertainty;
    var sig = Math.abs(t.competitive) > 2 * u;
    if (!sig) {
      return 'The competitive effect is within the noise that census rounding ' +
        'alone can produce (about ±' + C.fmt(2 * u) + ' jobs). Treat it as ' +
        'no measurable local advantage or disadvantage either way.';
    }
    return t.competitive > 0
      ? 'Its industries grew faster here than the same industries did in ' +
        C.esc(ctx.change.ref.label) + ', worth about ' +
        C.fmt(Math.abs(t.competitive)) + ' jobs.'
      : 'Its industries grew more slowly here than the same industries did in ' +
        C.esc(ctx.change.ref.label) + ', costing about ' +
        C.fmt(Math.abs(t.competitive)) + ' jobs.';
  }

  function indexBlock(ctx, phone) {
    var ind = ctx.indices, base = ctx.base;
    var wrap = document.createElement('div');
    var items = [
      { label: 'Specialisation', v: ind.coefSpecialisation, max: 0.6,
        fmt: function (x) { return x.toFixed(3); },
        lo: 'same mix as reference', hi: 'very different',
        help: 'Half the sum of absolute differences between this economy’s ' +
          'industry shares and the reference’s. Zero means an identical mix.' },
      { label: 'Diversity', v: ind.entropyNormalised, max: 1,
        fmt: function (x) { return x.toFixed(3); },
        lo: 'one industry', hi: 'perfectly even',
        help: 'Shannon entropy across the twenty sectors, on a nought-to-one ' +
          'scale. High means employment is spread evenly, not that the economy ' +
          'is strong.' },
      { label: 'Hachman index', v: ind.hachman, max: 1,
        fmt: function (x) { return x == null ? '—' : x.toFixed(3); },
        lo: 'unlike reference', hi: 'a scale model',
        help: 'How closely the industry mix resembles the reference economy. ' +
          'One means it is a scale model of it.' },
      { label: 'Economic base multiplier', v: base.multiplier, max: 6,
        fmt: function (x) { return x == null ? '—' : x.toFixed(2); },
        lo: '1', hi: '6+',
        help: 'For each job in the export base, this many jobs exist in total. ' +
          'Derived from location-quotient excess, which cannot see cross-hauling ' +
          'and so tends to run high. Structural indicator, not a forecast.' }
    ];
    items.forEach(function (it) {
      var row = document.createElement('div');
      row.style.cssText = 'margin-bottom:14px';
      row.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
        '<span style="font-weight:550;font-size:13.5px">' + it.label + '</span>' +
        '<span class="num" style="font-weight:650">' + it.fmt(it.v) + '</span></div>';
      var mh = document.createElement('div');
      row.appendChild(mh);
      row.appendChild(h('<div style="font-size:11.5px;color:var(--ink-3);' +
        'line-height:1.45;margin-top:2px">' + it.help + '</div>'));
      wrap.appendChild(row);
      afterLayout(function () {
        C.meter(mh, it.v, {
          min: 0, max: it.max, loLabel: it.lo, hiLabel: it.hi,
          title: it.label + ', ' + (it.fmt ? it.fmt(it.v) : it.v) +
            ', on a scale from ' + it.lo + ' to ' + it.hi
        });
      });
    });
    wrap.appendChild(h('<div class="card-foot">' +
      C.fmt(ind.specialisations) + ' of 20 sectors sit at a location quotient of ' +
      '1.25 or more. Diversity and specialisation are different questions and ' +
      'are never combined into a score here.</div>'));
    return wrap;
  }

  function trendChart(hostEl, ctx) {
    var ch = ctx.change;
    var pts = ch.available.map(function (y) {
      var v = y === ch.y0 ? ch.local0 : null;
      var vec = D.resVec(ctx.place.code, y);
      if (!vec && ctx.place.level !== 'CSD') {
        var mem = D.membersOf(ctx.place.level, ctx.place);
        vec = D.aggregate(mem, function (c) { return D.resVec(c, y); }).vec;
      }
      return vec ? [y, M.sum(vec), y === 2011 ? 'National Household Survey, voluntary' : null] : null;
    }).filter(Boolean);
    if (pts.length < 2) return;
    /* named for the reader who hears the page rather than sees it */
    C.lines(hostEl, [{ name: 'labour force', points: pts,
                       color: C.cssVar('--gain') }],
            { zeroBased: true, xTicks: pts.map(function (p) { return p[0]; }),
              title: 'Resident labour force by census year, ' +
                pts[0][0] + ' to ' + pts[pts.length - 1][0] });
  }

  function miniMap(hostEl, ctx) {
    D.loadBoundaries('csd').then(function (fc) {
      var mp = root.GRA.map.create(hostEl, {
        layer: 'csd',
        onPick: function (code) { A.setPlace(code); }
      });
      mp.labelFor = function (id) {
        return D.byCode[id] ? D.byCode[id].name : id;
      };
      mp.setGeometry(fc);
      var vals = {};
      D.csdCodes.forEach(function (c) {
        var p = D.byCode[c];
        vals[c] = (p.jobs != null && p.area_km2 > 0) ? p.jobs / p.area_km2 : null;
      });
      mp.setData(vals, { type: 'seq', title: 'Jobs per km²',
                         fmt: function (v) { return C.fmt(v, 0); } });
      mp.select(ctx.place.level === 'CSD' ? ctx.place.code : null);
      if (ctx.place.level === 'CSD') {
        var neigh = ctx.place.cd
          ? D.membersOf('CD', ctx.place) : [ctx.place.code];
        mp.fitToCodes(neigh.length > 1 ? neigh : [ctx.place.code]);
      }
    });
  }

  function noData(ctx) {
    /* Still fetching is not the same as never published, and saying the second
       when the first is true puts a false statement about the source in front
       of the reader. */
    if (ctx.place.level === 'CT' && !D.ctWork) {
      var l = card('Fetching the neighbourhood figures', null);
      l.appendChild(h('<div class="empty"><div class="big">One moment.</div>' +
        '<div>Census tract employment is a separate three-megabyte file and ' +
        'is on its way.</div></div>'));
      return l;
    }
    var c = card('Nothing published for this one', null);
    c.appendChild(h('<div class="empty"><div class="big">' +
      'Statistics Canada did not publish industry figures for ' +
      C.esc(ctx.place.name) + '.</div><div>Small areas are suppressed to ' +
      'protect confidentiality. Try the census division it sits in.</div></div>'));
    return c;
  }

  /* A place can be perfectly well published and still not support a given
     analysis. Saying "not published" in that case blames the source for a
     limit of the method. */
  function cannotAnswer(title, lead, why) {
    var c = card(title, null);
    c.appendChild(h('<div class="empty"><div class="big">' + C.esc(lead) +
      '</div><div>' + why + '</div></div>'));
    return c;
  }

  /* ==================================================== 2. STRUCTURE */

  P.structure = function (host, ctx, phone) {
    init();
    if (!ctx.local || !ctx.ref) { host.appendChild(noData(ctx)); return; }

    var ctl = h('<div class="ctlrow"></div>');
    ctl.appendChild(seg([
      { v: 'total', label: 'All jobs here',
        title: 'Including people working at home' },
      { v: 'usual', label: 'Usual workplace only',
        title: 'Offices, plants and shops only' }
    ], ctx.state.measure, function (v) {
      ctx.state.measure = v; A.render();
    }));
    ctl.appendChild(seg([
      { v: 'jobs', label: 'By size' },
      { v: 'lq', label: 'By concentration' },
      { v: 'naics', label: 'By NAICS code' }
    ], ctx.state.sortStructure, function (v) {
      ctx.state.sortStructure = v; A.render();
    }));
    host.appendChild(ctl);

    var rows = ctx.lq.slice();
    if (ctx.state.sortStructure === 'jobs') {
      rows.sort(function (a, b) { return (b.employment || 0) - (a.employment || 0); });
    } else if (ctx.state.sortStructure === 'lq') {
      rows.sort(function (a, b) { return (b.lq || -1) - (a.lq || -1); });
    }

    var cMix = card('Industry mix', measureNote(ctx));
    var bh = chartHost(phone ? 0 : 470);
    cMix.appendChild(bh);
    if (phone) {
      var maxJ = Math.max.apply(null, rows.map(function (r) { return r.employment || 0; }));
      bh.innerHTML = rows.map(function (r) {
        var n = D.naics[r.i];
        return '<div class="sectorrow"><div><div class="nm">' + C.esc(n.short) +
          '</div><div class="meta">' + C.pct(r.share) + ' of jobs · LQ ' +
          (r.lq == null ? '—' : r.lq.toFixed(2)) + ' ' + flagChip(r.flag) +
          '</div></div><div class="big">' +
          (r.employment == null ? '—' : C.fmt(r.employment)) + '</div>' +
          '<div class="track"><i style="width:' +
          (maxJ ? (r.employment || 0) / maxJ * 100 : 0) + '%"></i></div></div>';
      }).join('');
    } else {
      afterLayout(function () {
        C.rankedBars(bh, rows.map(function (r) {
          var n = D.naics[r.i];
          return {
            label: n.short,
            value: r.employment || 0,
            accent: r.lq != null && r.lq >= 1.25,
            note: 'LQ ' + (r.lq == null ? '—' : r.lq.toFixed(2)) + ' · ' +
              M.lqBand(r.lq) + ' · ' + C.pct(r.share) + ' of local jobs' +
              (r.flag !== 'ok' ? ' · ' + r.flag : '')
          };
        }), { valueName: 'Jobs', rowH: 22 });
      });
    }
    var foot = h('<div class="card-foot">Bars in the accent colour sit at ' +
      'a location quotient of 1.25 or more. ' + refLine(ctx) + ' </div>');
    foot.appendChild(playBtn('Hear the mix', function () {
      root.GRA.sound.series(rows.map(function (r) {
        return { v: r.employment, flag: r.flag };
      }));
    }));
    cMix.appendChild(foot);
    host.appendChild(cMix);

    /* the table */
    var cols = [
      { key: 'sector', label: 'Sector' },
      { key: 'naics', label: 'NAICS' },
      { key: 'jobs', label: 'Jobs' },
      { key: 'share', label: 'Share here', type: 'pct' },
      { key: 'refShare', label: 'Share in reference', type: 'pct' },
      { key: 'lq', label: 'LQ', type: 'dec' },
      { key: 'band', label: 'Reading' },
      { key: 'basic', label: 'Basic (export) jobs' },
      { key: 'quality', label: 'Quality' }
    ];
    var trows = rows.map(function (r) {
      var n = D.naics[r.i];
      return {
        sector: n.name, naics: n.code, jobs: r.employment,
        share: r.share, refShare: r.refShare, lq: r.lq,
        band: M.lqBand(r.lq),
        basic: ctx.base.detail[r.i] ? Math.round(ctx.base.detail[r.i].basic) : null,
        quality: r.flag
      };
    });
    var cTbl = card('The numbers', 'Every figure behind the chart. Export it ' +
      'from the button in the header.');
    cTbl.appendChild(table(cols, trows, {
      totals: { sector: 'Total', jobs: ctx.jobs, share: 1, refShare: 1,
                basic: Math.round(ctx.base.basic) }
    }));
    host.appendChild(cTbl);

    /* economic base */
    var cB = card('Export base',
      'Employment above the reference share is treated as serving demand from ' +
      'outside. Two known biases: the method assumes this place has the ' +
      'reference’s productivity and spending patterns, and it cannot see ' +
      'cross-hauling. Both push the basic share down, so the multiplier ' +
      'generally runs high.');
    cB.appendChild(h('<div class="hero">' +
      stat(C.fmt(Math.round(ctx.base.basic)), 'basic (export) jobs',
           C.pct(ctx.base.basicShare, 0) + ' of all jobs here') +
      stat(C.fmt(Math.round(ctx.base.nonBasic)), 'local-serving jobs') +
      stat(ctx.base.multiplier == null ? '—' : ctx.base.multiplier.toFixed(2),
           'base multiplier', 'total jobs per basic job') +
      '</div>'));
    if (ctx.base.unstable) {
      cB.appendChild(h('<div class="card-foot">' +
        '<span class="flag flag-weak">unstable</span> Only ' +
        C.pct(ctx.base.basicShare, 0) + ' of employment sits above ' +
        C.esc(ctx.ref.label) + '’s industry shares, so the multiplier is ' +
        'dividing by a small number and is not a figure to quote. This is what ' +
        'happens when the benchmark closely resembles the subject — a ' +
        'diversified city measured against the province it sits in has almost ' +
        'no location-quotient excess by construction. For a usable export base, ' +
        'benchmark against Canada, or against a peer group.</div>'));
    }
    host.appendChild(cB);

    /* business counts cross-check */
    var biz = D.biz.data[ctx.place.code];
    if (biz && biz['Total, with employees']) {
      var bvec = biz['Total, with employees'];
      var bTot = M.sum(bvec);
      var cBiz = card('Cross-check: business establishments',
        'An independent, non-census read on structure, from the Business ' +
        'Register. It counts establishments, not jobs — a ' +
        '900-person plant and a 9-person shop each count once — so ' +
        'establishment shares are not employment shares. Never used in the ' +
        'shift-share calculation.');
      var bcols = [
        { key: 'sector', label: 'Sector' },
        { key: 'est', label: 'Establishments with employees' },
        { key: 'eshare', label: 'Share of establishments', type: 'pct' },
        { key: 'jshare', label: 'Share of jobs (2021 census)', type: 'pct' },
        { key: 'gap', label: 'Difference', type: 'spct' }
      ];
      /* A null is suppressed or absent, NOT zero. Coercing it to zero
         manufactures a 0% share and then a full-size negative gap against the
         real job share - nineteen of them in the worst case here. The cell is
         left blank and the difference withheld with it. */
      var nSupp = 0;
      var brows = D.naics.map(function (n, i) {
        var e = bvec[i];
        if (e == null) nSupp++;
        var es = (e != null && bTot) ? e / bTot : null;
        var js = ctx.jobs ? (ctx.local[i] || 0) / ctx.jobs : null;
        return { sector: n.name, est: e, eshare: es, jshare: js,
                 gap: (es != null && js != null) ? es - js : null };
      }).sort(function (a, b) { return (b.est || 0) - (a.est || 0); });
      cBiz.appendChild(table(bcols, brows,
        { totals: { sector: 'Total', est: bTot, eshare: 1, jshare: 1 } }));
      if (nSupp) {
        cBiz.appendChild(h('<div class="card-foot">' + nSupp + ' of ' +
          D.naics.length + ' sectors are blank above — suppressed or absent ' +
          'from the Business Register extract, which is not the same as ' +
          'having no establishments. The shares in this table are therefore ' +
          'shares of what is published, not of the true total, and they will ' +
          'read slightly high for the sectors that do appear.</div>'));
      }
      host.appendChild(cBiz);
    }
  };

  /* ======================================================= 3. CHANGE */

  P.change = function (host, ctx, phone) {
    init();
    var ch = ctx.change;
    if (!ch && ctx.place.level === 'CT') {
      host.appendChild(cannotAnswer(
        'Change cannot be measured for a neighbourhood',
        'Use the municipality instead.',
        'Census tract boundaries are redrawn between censuses, so a tract in ' +
        '2021 is not the same piece of ground as the tract with that number ' +
        'in 2016. Differencing them would produce a number, and the number ' +
        'would be meaningless, so this tool does not. The industry series ' +
        'behind every other year is also published only down to the ' +
        'municipality. <b>Use the municipality this neighbourhood sits in</b> ' +
        'for change over time, and the neighbourhood tier for 2021 structure.'));
      return;
    }
    if (!ch) { host.appendChild(noData(ctx)); return; }
    if (ch.error) {
      var e = card('No change to decompose', ch.error);
      host.appendChild(e);
      return;
    }

    /* controls */
    var ctl = h('<div class="ctlrow"></div>');
    var yearOpts = ch.available;
    var selFrom = h('<select class="sel" aria-label="From year">' +
      yearOpts.map(function (y) {
        return '<option value="' + y + '"' + (y === ch.y0 ? ' selected' : '') +
          '>' + y + '</option>';
      }).join('') + '</select>');
    var selTo = h('<select class="sel" aria-label="To year">' +
      yearOpts.map(function (y) {
        return '<option value="' + y + '"' + (y === ch.y1 ? ' selected' : '') +
          '>' + y + '</option>';
      }).join('') + '</select>');
    selFrom.addEventListener('change', function () {
      ctx.state.y0 = +selFrom.value; A.render();
    });
    selTo.addEventListener('change', function () {
      ctx.state.y1 = +selTo.value; A.render();
    });
    ctl.appendChild(h('<span style="font-size:13px;color:var(--ink-3)">From</span>'));
    ctl.appendChild(selFrom);
    ctl.appendChild(h('<span style="font-size:13px;color:var(--ink-3)">to</span>'));
    ctl.appendChild(selTo);

    var t1 = h('<label class="toggle"><input type="checkbox"' +
      (ctx.state.chain ? ' checked' : '') + '> Chain each interval</label>');
    t1.querySelector('input').addEventListener('change', function (ev) {
      ctx.state.chain = ev.target.checked; A.render();
    });
    ctl.appendChild(t1);

    var t2 = h('<label class="toggle"><input type="checkbox"' +
      (ctx.state.skip2011 ? ' checked' : '') + '> Skip 2011 (voluntary survey)</label>');
    t2.querySelector('input').addEventListener('change', function (ev) {
      ctx.state.skip2011 = ev.target.checked; A.render();
    });
    ctl.appendChild(t2);

    var t3 = h('<label class="toggle"><input type="checkbox"' +
      (ctx.state.emView ? ' checked' : '') + '> Split out the allocation effect</label>');
    t3.querySelector('input').addEventListener('change', function (ev) {
      ctx.state.emView = ev.target.checked; A.render();
    });
    ctl.appendChild(t3);
    host.appendChild(ctl);

    /* 2016 and 2021 are both on the employed labour force, so the period the
       tool opens on is clean. 2001 to 2011 still come from the Census Profile,
       which counted the wider labour force, so a period crossing 2011-2016
       carries a definitional break and has to say so. METHODS.md section 7.0.*/
    if (ch.y0 <= 2011 && ch.y1 >= 2016) {
      host.appendChild(card('This period crosses a definitional break',
        '2016 and 2021 count the <b>employed</b> labour force. 2001, 2006 and ' +
        '2011 count everyone who reported an industry, which also includes ' +
        'unemployed people who last worked in one — roughly the unemployment ' +
        'rate more, and not spread evenly. Measured on Ontario in 2016 the ' +
        'gap ran from 3.0% in finance and health care to 10.1% in mining, ' +
        'administrative services and the arts, so it lands on the ' +
        'industry-mix and competitive terms rather than cancelling out. ' +
        '<b>Across this span, treat a sector-level competitive effect as ' +
        'indicative rather than measured.</b> Statistics Canada does not ' +
        'publish an employed-labour-force industry table below the census ' +
        'division for those years, so the break cannot be closed from the ' +
        'published record. Periods from 2016 onward do not carry this ' +
        'break, though see the note on management of companies below.',
        { className: 'card-break' }));
    }

    /* Separately, and for any period ending in 2021. */
    if (ch.y1 === 2021) {
      host.appendChild(card('The 2021 count is a pandemic reference week',
        'The 2021 Census measured the week of 2–8 May 2021, during ' +
        'public-health closures. Accommodation and food, arts and recreation, ' +
        'and retail are understated against a normal year, and working at ' +
        'home is overstated. That is a real measurement of an unusual week, ' +
        'not an error — but it is not a normal year, and a competitive ' +
        'effect in those sectors should be read with it in mind. ' +
        '<b>Management of companies</b> needs more care still: across ' +
        'Ontario it roughly doubles between 2016 and 2021, and it does so ' +
        'almost uniformly from place to place, which is the signature of a ' +
        'change in how people were classified rather than of growth. Treat ' +
        'its bar below as unreadable for this period.',
        { className: 'card-break' }));
    }

    var t = ch.result.total;

    /* the waterfall */
    var cW = card('Where the change came from, ' + ch.y0 + ' to ' + ch.y1,
      'Resident labour force by industry — where workers live, not where the ' +
      'jobs are. Read left to right: the reference economy grew, which alone ' +
      'would have given this place one figure; its starting industry mix was ' +
      'better or worse than average, worth a second; and its own performance ' +
      'in those industries accounts for the rest.');

    /* The chart plots the change components only, not the levels. A waterfall
       anchored at the 1.4 million starting level renders three effects of a few
       thousand jobs as invisible slivers; the levels are stated above it as
       text instead, where they read perfectly well. */
    cW.appendChild(h('<div class="hero" style="margin:2px 0 14px">' +
      stat(C.fmt(t.start), ch.y0 + ' labour force', null, 'sm') +
      stat(C.fmt(t.end), ch.y1 + ' labour force', null, 'sm') +
      stat(C.signed(t.actual), 'observed change',
           C.signedPct(t.localGrowth) + ' against ' +
           C.signedPct(t.refGrowth) + ' in ' + C.esc(ch.ref.label),
           t.actual >= 0 ? 'pos' : 'neg') +
      '</div>'));

    var items = [
      { label: 'Reference growth', value: t.national, kind: 'component',
        note: 'What ' + C.esc(ch.ref.label) + '’s overall growth rate of ' +
          C.signedPct(t.refGrowth) + ' would have delivered on its own.' },
      { label: 'Industry mix', value: t.mix, kind: 'component',
        note: 'The bonus or penalty from starting out concentrated in ' +
          'industries that grew faster or slower than the reference economy ' +
          'as a whole.' }
    ];
    if (ctx.state.emView) {
      items.push({ label: 'Competitive', value: t.emCompetitive, kind: 'component',
                   note: 'Local performance, with the effect of specialisation ' +
                     'removed (Esteban-Marquillas).' });
      items.push({ label: 'Allocation', value: t.emAllocation, kind: 'component',
                   note: 'Specialisation multiplied by performance: positive ' +
                     'means this place is concentrated in the industries it is ' +
                     'actually good at.' });
    } else {
      items.push({ label: 'Competitive', value: t.competitive, kind: 'component',
                   note: 'How this place’s industries performed against the ' +
                     'same industries in the reference economy.' });
    }
    items.push({ label: 'Observed change', value: t.actual, kind: 'total',
                 note: 'The three effects to the left sum to exactly this.' });

    var wh = chartHost(280);
    cW.appendChild(wh);
    afterLayout(function () {
      C.waterfall(wh, items, { height: phone ? 300 : 280 });
    });

    var wfoot0 = playBtn('Hear the decomposition', function () {
      root.GRA.sound.decomposition(t);
    });
    var exact = Math.abs(ch.identity) < 0.5;
    var identityNote = h('<div class="card-foot">' +
      '<span class="flag flag-' + (exact ? 'ok' : 'withheld') + '">' +
      (exact ? 'identity holds' : 'identity off by ' + ch.identity.toFixed(2)) +
      '</span> Components sum to the observed change of ' + C.signed(t.actual) +
      ' jobs' + (exact ? ' exactly' : '') + '. ' +
      'Census rounding alone can move any one component by roughly ±' +
      C.fmt(2 * ch.uncertainty) + ' jobs, so treat anything smaller than that ' +
      'as no finding. ' + C.esc(ch.ref.note) +
      (ch.refFallback ? ' The chosen benchmark had no data for this period, so ' +
        'Ontario was used.' : '') + ' </div>');
    identityNote.appendChild(wfoot0);
    cW.appendChild(identityNote);
    host.appendChild(cW);

    /* competitive by sector */
    var rows = ch.result.rows.slice();
    var key = ctx.state.emView ? 'emCompetitive' : 'competitive';
    rows.sort(function (a, b) { return Math.abs(b[key]) - Math.abs(a[key]); });

    var cS = card('Which sectors drove the ' +
      (ctx.state.emView ? 'competitive' : 'competitive') + ' effect',
      'Positive means the sector grew faster here than the same sector did in ' +
      C.esc(ch.ref.label) + '. This is where a headline number becomes a ' +
      'sentence you can use.');
    var sh = chartHost(phone ? 0 : 450);
    cS.appendChild(sh);
    if (phone) {
      var mx = Math.max.apply(null, rows.map(function (r) { return Math.abs(r[key]); })) || 1;
      sh.innerHTML = rows.slice(0, 12).map(function (r) {
        var n = D.naics[r.i];
        var v = r[key];
        return '<div class="sectorrow"><div><div class="nm">' + C.esc(n.short) +
          '</div><div class="meta">' + C.fmt(r.start) + ' → ' + C.fmt(r.end) +
          ' jobs</div></div><div class="big" style="color:' +
          (v >= 0 ? 'var(--gain)' : 'var(--loss)') + '">' + C.signed(v) +
          '</div><div class="track"><i style="width:' +
          (Math.abs(v) / mx * 100) + '%;background:' +
          (v >= 0 ? 'var(--gain)' : 'var(--loss)') + '"></i></div></div>';
      }).join('');
    } else {
      afterLayout(function () {
        C.divergingBars(sh, rows.map(function (r) {
          var n = D.naics[r.i];
          return {
            label: n.short, value: r[key],
            note: C.fmt(r.start) + ' → ' + C.fmt(r.end) + ' jobs. Grew ' +
              C.signedPct(r.localGrowth) + ' here against ' +
              C.signedPct(r.refGrowth) + ' in the reference.' +
              (r.zeroBase ? ' No base-year employment, so the whole change ' +
                'lands in the competitive term.' : '')
          };
        }), { valueName: 'Competitive effect' });
      });
    }
    host.appendChild(cS);

    /* Esteban-Marquillas quadrants */
    if (ctx.state.emView && !phone) {
      var cQ = card('Is it concentrated in the right things?',
        'The Esteban-Marquillas reading. Horizontal: how much more (or less) ' +
        'employment the sector holds here than it would with the reference mix. ' +
        'Vertical: how much faster (or slower) it grew than the same sector ' +
        'elsewhere. Top right is the good corner — specialised in something ' +
        'it is also good at. Bubble size is jobs at the start of the period.');
      var qh = chartHost(400);
      cQ.appendChild(qh);
      afterLayout(function () {
        C.quadrantScatter(qh, ch.result.rows
          .filter(function (r) { return r.growthGap != null && r.start > 40; })
          .map(function (r) {
            var n = D.naics[r.i];
            return {
              x: r.start - r.homothetic, y: r.growthGap, size: r.start,
              label: n.name, short: n.short, quadrant: r.quadrant,
              alloc: r.emAllocation, comp: r.emCompetitive
            };
          }), {});
      });
      cQ.appendChild(h('<div class="card-foot">Sectors with fewer than 40 jobs at ' +
        'the start are left out: their growth rates are dominated by census ' +
        'rounding.</div>'));
      host.appendChild(cQ);
    }

    /* chained intervals */
    if (ch.dynamic && ch.dynamic.intervals.length > 1) {
      var cD = card('Chained by interval',
        'A single decomposition over twenty years weights everything by the ' +
        'industry mix of the first year, which by the end describes an economy ' +
        'that no longer exists. Chaining runs each interval with its own ' +
        'starting weights and adds the components up, which also shows where ' +
        'in the period the shift actually happened.');
      var dcols = [
        { key: 'span', label: 'Interval' },
        { key: 'actual', label: 'Observed change', signed: true },
        { key: 'national', label: 'Reference growth', signed: true },
        { key: 'mix', label: 'Industry mix', signed: true },
        { key: 'competitive', label: 'Competitive', signed: true }
      ];
      var drows = ch.dynamic.intervals.map(function (iv) {
        return { span: iv.from + '–' + iv.to, actual: iv.total.actual,
                 national: iv.total.national, mix: iv.total.mix,
                 competitive: iv.total.competitive };
      });
      var dt = ch.dynamic.total;
      cD.appendChild(table(dcols, drows, {
        totals: { span: 'Chained total', actual: dt.actual, national: dt.national,
                  mix: dt.mix, competitive: dt.competitive }
      }));
      cD.appendChild(h('<div class="card-foot">Single-period competitive effect: ' +
        C.signed(t.competitive) + ' jobs. Chained: ' + C.signed(dt.competitive) +
        ' jobs. A large gap between the two means the base-year mix was doing ' +
        'a lot of work, and the chained figure is the one to quote.</div>'));
      host.appendChild(cD);
    }

    /* full table */
    var fcols = [
      { key: 'sector', label: 'Sector' },
      { key: 'naics', label: 'NAICS' },
      { key: 'start', label: ch.y0 + ' jobs' },
      { key: 'end', label: ch.y1 + ' jobs' },
      { key: 'actual', label: 'Change', signed: true },
      { key: 'localGrowth', label: 'Local growth', type: 'spct' },
      { key: 'refGrowth', label: 'Reference growth', type: 'spct' },
      { key: 'national', label: 'Reference growth effect', signed: true, dp: 0 },
      { key: 'mix', label: 'Industry mix effect', signed: true, dp: 0 },
      { key: 'competitive', label: 'Competitive effect', signed: true, dp: 0 },
      { key: 'emCompetitive', label: 'Competitive (E-M)', signed: true, dp: 0 },
      { key: 'emAllocation', label: 'Allocation (E-M)', signed: true, dp: 0 },
      { key: 'quadrant', label: 'Reading' }
    ];
    var frows = ch.result.rows.map(function (r) {
      var n = D.naics[r.i];
      return {
        sector: n.name, naics: n.code, start: r.start, end: r.end,
        actual: r.actual, localGrowth: r.localGrowth, refGrowth: r.refGrowth,
        national: Math.round(r.national), mix: Math.round(r.mix),
        competitive: Math.round(r.competitive),
        emCompetitive: Math.round(r.emCompetitive),
        emAllocation: Math.round(r.emAllocation),
        quadrant: r.quadrant === 'undefined' ? '' : r.quadrant
      };
    });
    var cF = card('Full decomposition', null);
    cF.appendChild(table(fcols, frows, {
      totals: { sector: 'Total', start: t.start, end: t.end, actual: t.actual,
                localGrowth: t.localGrowth, refGrowth: t.refGrowth,
                national: Math.round(t.national), mix: Math.round(t.mix),
                competitive: Math.round(t.competitive),
                emCompetitive: Math.round(t.emCompetitive),
                emAllocation: Math.round(t.emAllocation) }
    }));
    host.appendChild(cF);
  };

  /* ======================================================== 4. PEERS */

  P.peers = function (host, ctx, phone) {
    init();
    var pe = ctx.peers;
    if (!pe) {
      host.appendChild(card('No peer group available',
        'Peer matching runs on municipalities and neighbourhoods. Pick one of ' +
        'those and it will appear here.'));
      return;
    }

    var ctl = h('<div class="ctlrow"></div>');
    ctl.appendChild(seg([
      { v: 'similar', label: 'Similar places',
        title: 'Mahalanobis distance on size, growth, density and mix' },
      { v: 'structural', label: 'Similar economies',
        title: 'Closest industry mix, regardless of size' }
    ], ctx.state.peerMode, function (v) {
      ctx.state.peerMode = v; A.render();
    }));
    ctl.appendChild(h('<span style="font-size:13px;color:var(--ink-3)">' +
      'from a pool of ' + C.fmt(pe.poolSize) + '</span>'));
    host.appendChild(ctl);

    /* method, visible and adjustable */
    var cM = card('How these peers were chosen',
      ctx.state.peerMode === 'structural'
        ? 'Ranked by industry-mix distance — half the sum of absolute ' +
          'differences between the two economies’ sector shares. Zero ' +
          'would mean an identical mix. Size is ignored entirely, which is the ' +
          'point: this answers "who has an economy shaped like ours", which is ' +
          'a different question from "who is our size".'
        : 'Candidates are first restricted to settlements of a comparable kind ' +
          '(Statistical Area Classification: ' +
          C.esc(D.geo.sac_labels[ctx.place.sac] || 'n/a').split(' /')[0] +
          '), then ranked by Mahalanobis distance on the features below. ' +
          'Mahalanobis rather than plain Euclidean distance because population, ' +
          'job count and density are close to the same variable three times ' +
          'over, and dividing through by the covariance makes them count once.');

    if (ctx.state.peerMode === 'similar') {
      var feats = ctx.state.peerFeatures ||
        A.PEER_FEATURES.map(function (f) { return f.key; });
      var fr = h('<div class="ctlrow" style="margin:6px 0 0"></div>');
      A.PEER_FEATURES.forEach(function (f) {
        var on = feats.indexOf(f.key) >= 0;
        var lb = h('<label class="toggle" title="' + C.esc(f.help) + '">' +
          '<input type="checkbox"' + (on ? ' checked' : '') + '> ' +
          C.esc(f.label) + '</label>');
        lb.querySelector('input').addEventListener('change', function (ev) {
          var next = feats.slice();
          if (ev.target.checked) next.push(f.key);
          else next = next.filter(function (k) { return k !== f.key; });
          if (!next.length) { A.render(); return; }
          ctx.state.peerFeatures = next;
          A.render();
        });
        fr.appendChild(lb);
      });
      cM.appendChild(fr);
      if (pe.degenerate) {
        cM.appendChild(h('<div class="card-foot"><span class="flag flag-weak">' +
          'note</span> With these features the covariance matrix is singular, ' +
          'so the ranking fell back to standardised Euclidean distance.</div>'));
      }
    }
    host.appendChild(cM);

    /* the peer list */
    var pcols = [
      { key: 'name', label: 'Municipality' },
      { key: 'dist', label: ctx.state.peerMode === 'structural'
          ? 'Mix distance' : 'Distance', type: 'dec', dp: 3 },
      { key: 'pop', label: 'Population' },
      { key: 'jobs', label: 'Jobs' },
      { key: 'ratio', label: 'Jobs per resident worker', type: 'dec' },
      { key: 'spec', label: 'Specialisation', type: 'dec', dp: 3 },
      { key: 'div', label: 'Diversity', type: 'dec', dp: 3 },
      { key: 'act', label: '', render: function (r) {
          return r._self ? '' :
            '<button class="btn btn-ghost" style="padding:2px 8px;font-size:12px" ' +
            'data-drop="' + r._code + '">remove</button>';
        } }
    ];

    function peerRow(r, isSelf) {
      var p = r.place;
      var ref = ctx.ref ? ctx.ref.vec : null;
      var ind = (r.vec && ref) ? M.structureIndices(r.vec, ref) : null;
      var selfC = p.selfContainmentUsual;
      return {
        _code: r.code, _self: isSelf,
        name: (isSelf ? '▸ ' : '') +
          (p.level === 'CT' ? D.tractLabel(p.code).title : p.name) +
          (r.pinned ? ' (pinned)' : ''),
        dist: r.distance, pop: p.pop2021, jobs: Math.round(r.jobs),
        ratio: p.jobsRatio,
        spec: ind ? ind.coefSpecialisation : null,
        div: ind ? ind.entropyNormalised : null,
        self: selfC
      };
    }

    var selfRow = peerRow(pe.target, true);
    var peerRows = pe.rows.map(function (r) { return peerRow(r, false); });

    var cL = card('The peer group', 'Remove any that do not belong — an ' +
      'unexplained peer list is worthless in front of a council.');
    var tb = table(pcols, [selfRow].concat(peerRows));
    tb.addEventListener('click', function (e) {
      var b = e.target.closest('[data-drop]');
      if (!b) return;
      ctx.state.peerRemoved = ctx.state.peerRemoved.concat([b.getAttribute('data-drop')]);
      A.render();
    });
    cL.appendChild(tb);
    if (ctx.state.peerRemoved.length) {
      var rb = h('<div class="card-foot">' + ctx.state.peerRemoved.length +
        ' removed. <button class="btn btn-ghost" style="padding:2px 8px;' +
        'font-size:12px">restore all</button></div>');
      rb.querySelector('button').addEventListener('click', function () {
        ctx.state.peerRemoved = []; A.render();
      });
      cL.appendChild(rb);
    }
    host.appendChild(cL);

    /* scorecard with distributions */
    var metrics = [
      { label: 'Jobs located here', get: function (r) { return r.jobs; },
        fmt: function (v) { return C.fmt(v); } },
      { label: 'Jobs per km²',
        get: function (r) {
          return r.place.area_km2 > 0 ? r.jobs / r.place.area_km2 : null;
        }, fmt: function (v) { return C.fmt(v, 0); } },
      { label: 'Jobs per employed resident',
        get: function (r) {
          var p = r.place;
          return p.jobsRatio;
        }, fmt: function (v) { return v == null ? '—' : v.toFixed(2); } },
      { label: 'Work in the municipality',
        get: function (r) {
          var p = r.place;
          return p.selfContainmentUsual;
        }, fmt: function (v) { return C.pct(v, 0); } },
      { label: 'Population growth 2011–2021',
        get: function (r) { return r.place.popGrowth1121; },
        fmt: function (v) { return C.signedPct(v); } },
      { label: 'Specialisation index',
        get: function (r) {
          var i = (r.vec && ctx.ref) ? M.structureIndices(r.vec, ctx.ref.vec) : null;
          return i ? i.coefSpecialisation : null;
        }, fmt: function (v) { return v == null ? '—' : v.toFixed(3); } },
      { label: 'Diversity index',
        get: function (r) {
          var i = (r.vec && ctx.ref) ? M.structureIndices(r.vec, ctx.ref.vec) : null;
          return i ? i.entropyNormalised : null;
        }, fmt: function (v) { return v == null ? '—' : v.toFixed(3); } }
    ];

    var cSc = card('Scorecard', 'Each row shows this place against its peers, ' +
      'with the whole peer distribution drawn. The red dot is this place; the ' +
      'dashed line is the peer median. A rank without its distribution hides ' +
      'whether the gap matters.');
    var grid = h('<div class="grid ' + (phone ? '' : 'g2') + '"></div>');
    metrics.forEach(function (mt) {
      var mine = mt.get(pe.target);
      var vals = pe.rows.map(mt.get)
        .filter(function (v) { return v != null && isFinite(v); });
      var med = M.median(vals);
      var sorted = vals.slice().sort(function (a, b) { return a - b; });
      var pctl = (mine != null && sorted.length) ? M.percentile(sorted, mine) : null;
      var rank = (mine != null && sorted.length)
        ? sorted.filter(function (v) { return v > mine; }).length + 1 : null;

      var box = h('<div style="padding:10px 0;border-bottom:1px solid var(--line)">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">' +
        '<span style="font-weight:550;font-size:13.5px">' + C.esc(mt.label) + '</span>' +
        '<span class="num" style="font-weight:650">' + mt.fmt(mine) + '</span></div>' +
        '<div style="font-size:12px;color:var(--ink-3)">peer median ' +
        mt.fmt(med) + (rank ? ' · ranks ' + rank + ' of ' + (sorted.length + 1) : '') +
        (pctl != null ? ' · ' + Math.round(pctl * 100) + 'th percentile' : '') +
        '</div></div>');
      var sh = document.createElement('div');
      box.appendChild(sh);
      grid.appendChild(box);
      afterLayout(function () {
        C.strip(sh, vals, mine, { median: med, fmt: mt.fmt });
      });
    });
    cSc.appendChild(grid);
    host.appendChild(cSc);

    if (root.GRA.regionPanels) {
      root.GRA.regionPanels.labourMarketCard(host, ctx);
    }

    /* mix comparison against the peer aggregate */
    if (ctx.ref && pe.rows.length) {
      var agg = D.aggregate(pe.rows.map(function (r) { return r.code; }),
        function (c) {
          return ctx.place.level === 'CT'
            ? (D.ctWork.data[c] ? D.ctWork.data[c][0] : null)
            : D.workVec(c, ctx.state.measure);
        });
      if (agg.vec) {
        var lqP = M.locationQuotients(ctx.local, agg.vec);
        var cMx = card('Mix against the peer group',
          'Location quotients computed against the peer group rather than the ' +
          'province. This is the like-for-like read: over-represented compared ' +
          'with places of the same kind and size.');
        var mh = chartHost(phone ? 0 : 450);
        cMx.appendChild(mh);
        var srt = lqP.slice().sort(function (a, b) { return (b.lq || 0) - (a.lq || 0); });
        afterLayout(function () {
          C.rankedBars(mh, srt.map(function (r) {
            return {
              label: D.naics[r.i].short,
              value: r.lq == null ? 0 : r.lq,
              accent: r.lq != null && r.lq >= 1.25,
              display: r.lq == null ? '—' : r.lq.toFixed(2),
              note: C.fmt(r.employment) + ' jobs here · ' + C.pct(r.share) +
                ' of local jobs against ' + C.pct(r.refShare) + ' across the peers'
            };
          }), { valueName: 'LQ vs peers', rowH: 22 });
        });
        host.appendChild(cMx);
      }
    }
  };

  /* ============================================== 5. NEIGHBOURHOODS */

  P.hoods = function (host, ctx, phone) {
    init();
    if (!D.ctWork) {
      var c = card('Neighbourhoods', 'Loading the census tract layer…');
      c.appendChild(h('<div class="skel" style="height:120px"></div>'));
      host.appendChild(c);
      D.loadTracts().then(A.render);
      return;
    }

    var place = ctx.place;
    var tracts;
    if (place.level === 'CT') {
      tracts = (D.byLevel.CT || []).filter(function (p) {
        return p.cma === place.cma;
      }).map(function (p) { return p.code; });
    } else if (place.level === 'CSD') {
      tracts = D.tractsIn(place.code).map(function (t) { return t.ct; });
    } else if (place.level === 'CMA') {
      tracts = (D.byLevel.CT || []).filter(function (p) {
        return p.cma === place.code;
      }).map(function (p) { return p.code; });
    } else if (place.level === 'ER') {
      tracts = (D.byLevel.CT || []).filter(function (p) {
        return p.er === place.er;
      }).map(function (p) { return p.code; });
    } else {
      tracts = (D.byLevel.CT || []).filter(function (p) {
        return p.cd === place.cd;
      }).map(function (p) { return p.code; });
    }
    tracts = tracts.filter(function (c) { return D.ctWork.data[c]; });

    if (!tracts.length) {
      host.appendChild(card('No neighbourhood tier here',
        'Census tracts exist only inside census metropolitan areas and tracted ' +
        'census agglomerations, so rural and small-town Ontario has no ' +
        'neighbourhood geography at all. This is a limit of the published data, ' +
        'not of the tool: below the municipality there is nothing finer with ' +
        'industry of employment attached.'));
      return;
    }

    var intro = card('Neighbourhood tier — ' + C.fmt(tracts.length) +
      ' census tracts',
      'Census tracts hold 2,500 to 8,000 residents and are the finest ' +
      'geography for which Statistics Canada publishes industry of employment. ' +
      '<b>Structure only, 2021.</b> Tract boundaries are redrawn between ' +
      'censuses, so this tool never differences tract figures across census ' +
      'years — a change measured across redrawn boundaries is not a change. ' +
      'At this scale random rounding to 5 bites hard: cells at or below ' +
      M.MIN_RELIABLE_CELL + ' workers are withheld.');
    host.appendChild(intro);

    /* sector selector for the map and ranking */
    var sectorSel = h('<select class="sel" aria-label="Sector">' +
      '<option value="-1">All sectors</option>' +
      D.naics.map(function (n, i) {
        return '<option value="' + i + '"' +
          (ctx.state.hoodSector == i ? ' selected' : '') + '>' +
          C.esc(n.name) + '</option>';
      }).join('') + '</select>');
    var si = ctx.state.hoodSector == null ? -1 : +ctx.state.hoodSector;
    sectorSel.addEventListener('change', function () {
      ctx.state.hoodSector = +sectorSel.value; A.render();
    });
    var ctl = h('<div class="ctlrow"></div>');
    ctl.appendChild(h('<span style="font-size:13px;color:var(--ink-3)">Show</span>'));
    ctl.appendChild(sectorSel);
    host.appendChild(ctl);

    var refVec = ctx.ref ? ctx.ref.vec : null;
    var rows = tracts.map(function (code) {
      var v = D.ctWork.data[code][0];
      var tot = M.sum(v);
      var p = D.byCode[code];
      var lab = D.tractLabel(code);
      var lq = null, val = tot, flag = 'ok';
      if (si >= 0) {
        val = v[si];
        flag = M.reliabilityFlag(val);
        if (refVec && tot) {
          var sr = M.sum(refVec) ? (refVec[si] || 0) / M.sum(refVec) : 0;
          lq = sr ? ((val || 0) / tot) / sr : null;
        }
      }
      var ind = (refVec && tot) ? M.structureIndices(v, refVec) : null;
      return {
        _id: code, code: code, name: lab.title, host: lab.sub,
        jobs: Math.round(tot), value: val, lq: lq, flag: flag,
        pop: p ? p.pop2021 : null,
        jobsPerRes: (p && p.pop2021) ? tot / p.pop2021 : null,
        density: (p && p.area_km2 > 0) ? tot / p.area_km2 : null,
        spec: ind ? ind.coefSpecialisation : null,
        div: ind ? ind.entropyNormalised : null,
        selected: code === place.code
      };
    }).sort(function (a, b) { return (b.value || 0) - (a.value || 0); });

    /* map */
    var cMap = card(si >= 0 ? D.naics[si].name + ' by neighbourhood'
                            : 'Jobs by neighbourhood',
      'Click a tract to make it the subject.');
    var mh = h('<div class="mapbox" style="height:' + (phone ? 320 : 460) +
      'px"></div>');
    cMap.appendChild(mh);
    host.appendChild(cMap);
    afterLayout(function () {
      D.loadBoundaries('ct').then(function (fc) {
        var subset = {
          type: 'FeatureCollection',
          features: fc.features.filter(function (f) {
            return tracts.indexOf(f.properties.id) >= 0;
          })
        };
        var mp = root.GRA.map.create(mh, {
          layer: 'ct', onPick: function (code) { A.setPlace(code); }
        });
        mp.labelFor = function (id) {
          var l = D.tractLabel(id);
          return l.title + (l.sub ? ' — ' + l.sub : '');
        };
        mp.setGeometry(subset);
        var vals = {};
        rows.forEach(function (r) {
          vals[r.code] = (r.flag === 'withheld' || r.flag === 'missing')
            ? null : r.value;
        });
        mp.setData(vals, {
          type: 'seq',
          title: si >= 0 ? D.naics[si].short + ' jobs' : 'Jobs located here',
          fmt: function (v) { return C.fmt(v, 0); }
        });
        if (place.level === 'CT') mp.select(place.code);
      });
    });

    /* table */
    var cols = [
      { key: 'name', label: 'Tract' },
      { key: 'host', label: 'Municipality' },
      { key: 'pop', label: 'Residents' },
      { key: 'jobs', label: 'Jobs, all sectors' }
    ];
    if (si >= 0) {
      cols.push({ key: 'value', label: D.naics[si].short + ' jobs' });
      cols.push({ key: 'lq', label: 'LQ', type: 'dec' });
      cols.push({ key: 'flag', label: 'Quality',
                  render: function (r) {
                    return r.flag === 'ok'
                      ? '<span style="color:var(--ink-3)">ok</span>'
                      : flagChip(r.flag);
                  } });
    }
    cols.push({ key: 'density', label: 'Jobs per km²', dp: 0 });
    cols.push({ key: 'jobsPerRes', label: 'Jobs per resident', type: 'dec' });
    cols.push({ key: 'spec', label: 'Specialisation', type: 'dec', dp: 3 });

    var cT = card('The neighbourhood table', null);
    cT.appendChild(table(cols, rows.slice(0, 250)));
    if (rows.length > 250) {
      cT.appendChild(h('<div class="card-foot">Showing the 250 largest of ' +
        C.fmt(rows.length) + ' tracts. The export carries all of them.</div>'));
    }
    host.appendChild(cT);
  };

  /* ========================================================== 6. MAP */

  /* Three groups, not twenty sectors and not five groups. A choropleth is read
     as every pair of colours at once, not just neighbouring ones in a legend,
     and past three categories the fills stop being reliably distinguishable:
     five sector groups were run against the colourblind-safety gates and
     failed on normal vision alone. The exact sector is named in the preview
     and in the table, so nothing is lost - only the colouring is coarsened to
     what the eye can actually do. */
  var DOING = [
    { label: 'Making and building things', slot: '--grp-1',
      codes: ['11', '21', '22', '23', '31-33'] },
    { label: 'Selling, moving and serving', slot: '--grp-2',
      codes: ['41', '44-45', '48-49', '51', '52', '53', '54', '55', '56',
              '71', '72', '81'] },
    { label: 'Teaching, care and government', slot: '--grp-3',
      codes: ['61', '62', '91'] }
  ];

  function naicsIndex() {
    var idx = {};
    D.naics.forEach(function (n, i) { idx[n.code] = i; });
    return idx;
  }

  function doingShares(vec) {
    var idx = naicsIndex();
    var tot = M.sum(vec);
    return DOING.map(function (g) {
      var s = 0;
      g.codes.forEach(function (c) { s += vec[idx[c]] || 0; });
      return { group: g, jobs: s, share: tot ? s / tot : 0 };
    });
  }

  function doingGroupOf(vec) {
    if (!vec || !M.sum(vec)) return null;
    var parts = doingShares(vec);
    var best = 0;
    parts.forEach(function (p, i) { if (p.jobs > parts[best].jobs) best = i; });
    return best;
  }

  var MAP_VARS = [
    { id: 'jobs', label: 'Jobs located here', type: 'seq',
      get: function (p) { return p.jobs; }, fmt: function (v) { return C.fmt(v); } },
    { id: 'jobdens', label: 'Jobs per km²', type: 'seq',
      get: function (p) { return p.area_km2 > 0 ? p.jobs / p.area_km2 : null; },
      fmt: function (v) { return C.fmt(v, 0); } },
    { id: 'ratio', label: 'Jobs per employed resident', type: 'seq',
      get: function (p) {
        return p.jobsRatio;
      }, fmt: function (v) { return v == null ? '—' : v.toFixed(2); } },
    { id: 'selfc', label: 'Share of residents working locally', type: 'seq',
      get: function (p) {
        return p.selfContainmentUsual;
      }, fmt: function (v) { return C.pct(v, 0); } },
    { id: 'popgrowth', label: 'Population change 2011–2021', type: 'div',
      get: function (p) { return p.popGrowth1121; },
      fmt: function (v) { return C.signedPct(v); } }
  ];

  P.map = function (host, ctx, phone) {
    init();
    var st = ctx.state;
    if (!st.mapVar) st.mapVar = 'doing';
    if (st.mapSector == null) st.mapSector = -1;

    var ctl = h('<div class="ctlrow"></div>');
    var varSel = h('<select class="sel" aria-label="Variable">' +
      '<option value="doing"' + (st.mapVar === 'doing' ? ' selected' : '') +
      '>What people do here</option>' +
      MAP_VARS.map(function (v) {
        return '<option value="' + v.id + '"' +
          (v.id === st.mapVar ? ' selected' : '') + '>' + C.esc(v.label) +
          '</option>';
      }).join('') +
      '<option value="lq"' + (st.mapVar === 'lq' ? ' selected' : '') +
      '>Location quotient for a sector…</option>' +
      '<option value="share"' + (st.mapVar === 'share' ? ' selected' : '') +
      '>Share of jobs in a sector…</option>' +
      '<option value="compshift"' + (st.mapVar === 'compshift' ? ' selected' : '') +
      '>Competitive shift, per 100 base jobs…</option>' +
      '<option value="spec"' + (st.mapVar === 'spec' ? ' selected' : '') +
      '>Specialisation index</option>' +
      '<option value="div"' + (st.mapVar === 'div' ? ' selected' : '') +
      '>Diversity index</option>' +
      (ctx.place.level === 'CSD'
        ? '<option value="flows"' + (st.mapVar === 'flows' ? ' selected' : '') +
          '>Where its workers travel</option>'
        : '') +
      '</select>');
    varSel.addEventListener('change', function () {
      st.mapVar = varSel.value; A.render();
    });
    ctl.appendChild(varSel);

    var needsSector = ['lq', 'share'].indexOf(st.mapVar) >= 0;
    if (needsSector) {
      var ss = h('<select class="sel" aria-label="Sector">' +
        D.naics.map(function (n, i) {
          return '<option value="' + i + '"' +
            (i === +st.mapSector ? ' selected' : '') + '>' + C.esc(n.name) +
            '</option>';
        }).join('') + '</select>');
      if (+st.mapSector < 0) { st.mapSector = 4; ss.value = '4'; }
      ss.addEventListener('change', function () {
        st.mapSector = +ss.value; A.render();
      });
      ctl.appendChild(ss);
    }
    host.appendChild(ctl);

    var vals = {}, type = 'seq', fmt = C.fmt, title = '', mapBase = null;

    var onVec = D.workVec('35', 'total');
    var onTot = M.sum(onVec);

    /* The flow view is not a choropleth. Every polygon stays neutral and
       the lines carry the whole statement, because shading the map as well
       would have two variables competing for the same shapes. Declaring it
       categorical with no categories also keeps the spatial-statistics card
       off: Moran's I of a blank surface is meaningless. */
    var flowLines = null;
    if (st.mapVar === 'flows' && ctx.place.level === 'CSD') {
      type = 'cat';
      title = 'Where its workers travel';
      fmt = function () { return ''; };
      var me = ctx.place;
      var mine = [me.lon, me.lat];
      var mk = function (rows, dir, limit) {
        return (rows || []).filter(function (f) {
          return f[0] !== me.code && D.byCode[f[0]] &&
                 D.byCode[f[0]].lon != null;
        }).slice(0, limit).map(function (f) {
          var o = D.byCode[f[0]];
          return {
            code: f[0], name: o.name, value: f[1], dir: dir,
            label: dir === 'in' ? o.name + ' \u2192 ' + me.name
                                : me.name + ' \u2192 ' + o.name,
            from: dir === 'in' ? [o.lon, o.lat] : mine,
            to: dir === 'in' ? mine : [o.lon, o.lat]
          };
        });
      };
      flowLines = mk(D.commute.top_flows[me.code], 'in', 10)
        .concat(mk(D.commute.top_flows[me.code + '|out'], 'out', 10));
    } else if (st.mapVar === 'doing') {
      D.csdCodes.forEach(function (c) {
        vals[c] = doingGroupOf(D.workVec(c, 'total'));
      });
      type = 'cat';
      title = 'What most people here do';
      fmt = function (v) {
        return (v == null || !DOING[v]) ? 'no published figure' : DOING[v].label;
      };
    } else if (needsSector) {
      var si = +st.mapSector;
      D.csdCodes.forEach(function (c) {
        var v = D.workVec(c, 'total');
        if (!v) { vals[c] = null; return; }
        var tot = M.sum(v);
        if (!tot || v[si] == null || v[si] <= M.MIN_RELIABLE_CELL) { vals[c] = null; return; }
        var share = v[si] / tot;
        vals[c] = st.mapVar === 'share' ? share
          : share / ((onVec[si] || 0) / onTot);
      });
      type = 'seq';
      fmt = st.mapVar === 'share'
        ? function (v) { return C.pct(v, 1); }
        : function (v) { return v == null ? '—' : v.toFixed(2); };
      title = (st.mapVar === 'share' ? 'Share of jobs in ' : 'LQ, ')
        + D.naics[si].short;
    } else if (st.mapVar === 'spec' || st.mapVar === 'div') {
      D.csdCodes.forEach(function (c) {
        var v = D.workVec(c, 'total');
        var ind = v ? M.structureIndices(v, onVec) : null;
        vals[c] = ind ? (st.mapVar === 'spec' ? ind.coefSpecialisation
                                              : ind.entropyNormalised) : null;
      });
      fmt = function (v) { return v == null ? '—' : v.toFixed(3); };
      title = st.mapVar === 'spec' ? 'Specialisation vs Ontario' : 'Diversity';
    } else if (st.mapVar === 'compshift') {
      var y0 = ctx.change && ctx.change.y0 ? ctx.change.y0 : 2016;
      var y1 = ctx.change && ctx.change.y1 ? ctx.change.y1 : 2021;
      var r0 = D.resVec('35', y0), r1 = D.resVec('35', y1);
      /* A rate needs a denominator big enough to carry it. The competitive
         effect has a rounding uncertainty of about ±25 jobs at two standard
         deviations, so expressed per 100 base jobs that is ±25/base×100: a
         municipality with 250 workers carries ±10 per 100 and can top the
         ranking on rounding alone. At 500 the band is ±5, which is small
         relative to the spread being mapped. Below that the figure is not
         withheld out of caution - it genuinely carries no signal. */
      var MIN_BASE = 500;
      mapBase = {};
      D.csdCodes.forEach(function (c) {
        var a = D.resVec(c, y0), b = D.resVec(c, y1);
        if (!a || !b || !r0 || !r1) { vals[c] = null; return; }
        var base = M.sum(a);
        if (base < MIN_BASE) { vals[c] = null; return; }
        var ss = M.shiftShare(a, b, r0, r1);
        mapBase[c] = base;
        vals[c] = ss.total.competitive / base * 100;
      });
      type = 'div';
      fmt = function (v) { return v == null ? '—' : C.signed(v, 1); };
      title = 'Competitive shift ' + y0 + '–' + y1 + ', per 100 base jobs';
    } else {
      var mv = MAP_VARS.filter(function (v) { return v.id === st.mapVar; })[0]
        || MAP_VARS[1];
      D.csdCodes.forEach(function (c) { vals[c] = mv.get(D.byCode[c]); });
      type = mv.type; fmt = mv.fmt; title = mv.label;
    }

    var cMap = card(title, st.mapVar === 'flows'
      ? 'The commuting links between ' + C.esc(ctx.place.name) + ' and the ' +
        'rest of Ontario, from the 2021 census flow table. Every other view ' +
        'here colours municipalities one at a time; this one draws what ' +
        'passes <i>between</i> them. Hover a line for its size, or tap any ' +
        'municipality to see what people do there.'
      : mapNote(st.mapVar) +
        ' Tap any municipality to see what people do there, then open the ' +
        'full analysis.');
    var mh = h('<div class="mapbox" style="height:' + (phone ? 400 : 620) +
      'px"></div>');
    cMap.appendChild(mh);

    /* Browsing is a different act from committing. A click previews the
       municipality without throwing away the map you are reading, and the
       preview carries the button that switches the whole app to it. */
    /* The peek IS the answer to the question the panel asks, and it is
       written in after a click rather than being on the page. Without a
       live region it lands silently. */
    var peek = h('<div id="mapPeek" role="status" aria-live="polite"></div>');
    cMap.appendChild(peek);
    host.appendChild(cMap);

    /* The preview answers one question: what do people do here? So it opens
       with the industry mix in words and a proportion bar, and the counts
       follow underneath as support. A jobs total on its own tells nobody what
       a place is. */
    function showPeek(code) {
      var p = D.byCode[code];
      if (!p) { peek.innerHTML = ''; return; }
      var isSubject = code === ctx.place.code;
      var vec = D.workVec(code, 'total');
      var onVec = D.workVec('35', 'total');
      var tot = vec ? M.sum(vec) : 0;

      var sentence, bar = '', distinct = '';
      if (!vec || !tot) {
        sentence = 'Statistics Canada published no industry figures here — ' +
          'too few workers to report without identifying people.';
      } else {
        var ranked = D.naics.map(function (n, i) {
          return { i: i, n: n, v: vec[i] || 0 };
        }).sort(function (a, b) { return b.v - a.v; });
        sentence = 'Most people working here are in ' +
          ranked.slice(0, 3).map(function (r) {
            return '<b>' + C.esc(r.n.short.toLowerCase()) + '</b> (' +
              C.pct(r.v / tot, 0) + ')';
          }).join(', ') + '.';

        var stand = M.locationQuotients(vec, onVec).filter(function (r) {
          return r.lq != null && r.lq >= 1.4 && r.flag === 'ok';
        }).sort(function (a, b) { return b.lq - a.lq; })[0];
        if (stand) {
          distinct = '<div class="peek-distinct">Unusually concentrated in ' +
            C.esc(D.naics[stand.i].short.toLowerCase()) + ' — ' +
            stand.lq.toFixed(1) + '× the Ontario share.</div>';
        }

        var parts = doingShares(vec);
        bar = '<div class="peek-bar">' + parts.map(function (q) {
          if (!q.jobs) return '';
          return '<i style="width:' + (q.share * 100) + '%;background:' +
            C.cssVar(q.group.slot) + '"></i>';
        }).join('') + '</div>' +
        '<div class="peek-barkey">' + parts.map(function (q) {
          return '<span><i style="background:' + C.cssVar(q.group.slot) +
            '"></i>' + C.esc(q.group.label.toLowerCase()) + ' ' +
            C.pct(q.share, 0) + '</span>';
        }).join('') + '</div>';
      }

      peek.innerHTML =
        '<div class="peek">' +
        '<div class="peek-head">' +
        '<div><div class="peek-name">' + C.esc(p.name) + '</div>' +
        '<div class="peek-sub">' + C.esc(p.kind) +
        (p.cd && D.geo.cd_names[p.cd]
          ? ' · ' + C.esc(D.geo.cd_names[p.cd]) : '') + '</div></div>' +
        '<button class="btn btn-primary" data-open="' + code + '">' +
        (isSubject ? 'Open full analysis' : 'Open ' + C.esc(p.name)) +
        '</button></div>' +
        '<div class="peek-answer">' + sentence + '</div>' +
        distinct + bar +
        '<div class="peek-stats">' +
        peekStat(p.jobs == null ? '—' : C.fmt(p.jobs), 'jobs here') +
        peekStat(p.pop2021 == null ? '—' : C.fmt(p.pop2021), 'residents') +
        peekStat(p.jobsRatio == null ? '—' : p.jobsRatio.toFixed(2),
                 'jobs per resident worker') +
        peekStat(p.selfContainmentUsual == null ? '—'
                 : C.pct(p.selfContainmentUsual, 0), 'work locally') +
        '</div></div>';
    }
    function peekStat(v, l) {
      return '<div><div class="peek-v num">' + v + '</div>' +
        '<div class="peek-l">' + C.esc(l) + '</div></div>';
    }
    peek.addEventListener('click', function (e) {
      var b = e.target.closest('[data-open]');
      if (!b) return;
      A.setPlace(b.getAttribute('data-open'));
      A.go('overview');
    });

    var mapRef = { mp: null, vals: vals, fmt: fmt, title: title, type: type };
    afterLayout(function () {
      D.loadBoundaries('csd').then(function (fc) {
        var mp = root.GRA.map.create(mh, {
          layer: 'csd',
          onPick: function (code) { mp.select(code); showPeek(code); }
        });
        mapRef.mp = mp;
        mp.labelFor = function (id) {
          return D.byCode[id] ? D.byCode[id].name : id;
        };
        mp.setGeometry(fc);
        mp.setData(vals, { type: type, title: title, fmt: fmt,
                           categories: st.mapVar === 'flows' ? [] : DOING });
        if (ctx.place.level === 'CSD') mp.select(ctx.place.code);
        if (flowLines && flowLines.length) {
          mp.setFlows(flowLines);
          mp.legendEl.hidden = true;
          /* The lines carry the measurement, but a line has to land somewhere
             legible: against a uniform basemap a reader cannot see WHICH
             municipality a flow reaches. The places at the ends of the lines
             are washed in, and only those - tinting everything would put a
             second variable back on the map. */
          flowLines.forEach(function (l) {
            var n = mp.nodes && mp.nodes[l.code];
            if (n) {
              n.setAttribute('fill', C.cssVar(
                l.dir === 'in' ? '--gain-4' : '--loss-4'));
            }
          });
          var sn = mp.nodes && mp.nodes[ctx.place.code];
          if (sn) sn.setAttribute('fill', C.cssVar('--brand-wash'));
          /* Frame the labour shed, not the province: these links are mostly
             local and fitting to Ontario leaves them a knot over one city. */
          var involved = flowLines.map(function (l) { return l.code; });
          involved.push(ctx.place.code);
          mp.fitToCodes(involved);
        }
      });
    });

    /* The flow view maps relationships, not a variable, so the ranked list of
       municipalities underneath it would be a ranking of nothing. It gets the
       flows themselves instead. */
    if (flowLines && !flowLines.length) {
      /* No published flows is itself a finding, and a common one for small
         and remote places: every link this municipality has falls under the
         suppression threshold. An empty table would imply nobody commutes. */
      host.appendChild(cannotAnswer('No commuting flows are published here',
        'Every link is below the threshold.',
        'Statistics Canada withholds commuting flows small enough to identify ' +
        'individuals, and for a place this size that can be all of them. It ' +
        'does not mean nobody travels to or from ' +
        C.esc(ctx.place.name) + ' — it means each single origin-destination ' +
        'pair is too small to publish. The commuting table also covers only ' +
        'workers with a usual place of work, which excludes anyone who worked ' +
        'at home in the May 2021 reference week.'));
    } else if (flowLines) {
      var cm = ctx.commute;
      var fRows = flowLines.slice().sort(function (a, b) {
        return b.value - a.value;
      }).map(function (l, i) {
        var o = D.byCode[l.code];
        return {
          _id: l.code, rank: i + 1, name: l.name,
          dirn: l.dir === 'in' ? 'comes here to work'
                               : 'goes there to work',
          workers: l.value,
          shareOf: l.dir === 'in'
            ? (cm && cm.inCommuters ? l.value / cm.inCommuters : null)
            : (cm && cm.outCommuters ? l.value / cm.outCommuters : null),
          cd: o ? (D.geo.cd_names[o.cd] || '') : ''
        };
      });

      var inN = flowLines.filter(function (l) { return l.dir === 'in'; }).length;
      var outN = flowLines.length - inN;
      var cF = card('Its labour shed',
        'Every line is a commuting flow between this municipality and ' +
        'another, drawn from the 2021 census flow table. <b>Red lines lead ' +
        'away</b> — residents who leave to work somewhere else. <b>Blue ' +
        'lines lead in</b> — people who live elsewhere and travel here to ' +
        'work. The dot marks the workplace end, and line width follows the ' +
        'square root of the flow, so a link ten times larger is drawn about ' +
        'three times heavier rather than ten: the eye reads quantity in a ' +
        'line\u2019s area. The ' + inN + ' largest inbound and ' + outN +
        ' largest outbound links are shown. ' +
        '<b>This is the only measure in the tool that is inherently about ' +
        'more than one municipality</b>, which is usually the point: a labour ' +
        'market rarely stops at a boundary, and the question of who should be ' +
        'in the room follows the lines rather than the border.');

      cF.appendChild(table([
        { key: 'rank', label: '#' },
        { key: 'name', label: 'Municipality' },
        { key: 'cd', label: 'Census division' },
        { key: 'dirn', label: 'Direction' },
        { key: 'workers', label: 'Workers' },
        { key: 'shareOf', label: 'Share of that direction', type: 'pct' }
      ], fRows));

      cF.appendChild(h('<div class="card-foot">Commuting counts only the ' +
        'employed labour force with a <b>usual place of work</b> — it ' +
        'excludes everyone who worked at home, which in the May 2021 ' +
        'reference week was an unusually large group, and everyone with no ' +
        'fixed workplace address. Flows below the suppression threshold are ' +
        'withheld, so these are the largest links rather than all of them, ' +
        'and they will not sum to the totals on the Overview tab.</div>'));
      host.appendChild(cF);
      ctx.mapTable = { rows: fRows, title: 'Commuting flows',
                       fmt: function (v) { return C.fmt(v); } };
    }

    /* the ranked table behind the map */
    var ranked = flowLines ? [] : D.csdCodes.map(function (c) {
      return { _id: c, name: D.byCode[c].name, kind: D.byCode[c].kind,
               cd: D.geo.cd_names[D.byCode[c].cd] || '',
               value: vals[c], jobs: D.byCode[c].jobs,
               base: mapBase ? mapBase[c] : null,
               pop: D.byCode[c].pop2021 };
    }).filter(function (r) { return r.value != null && isFinite(r.value); })
      .sort(function (a, b) { return b.value - a.value; });

    var cols = [
      { key: 'rank', label: '#' },
      { key: 'name', label: 'Municipality' },
      { key: 'cd', label: 'Census division' },
      { key: 'value', label: title,
        render: function (r) { return fmt(r.value); },
        signed: type === 'div' }
    ];
    /* A rate is unreadable without its denominator, so when the variable is a
       rate the denominator is a column rather than a footnote. */
    if (mapBase) {
      cols.push({ key: 'base', label: 'Base-year labour force', dp: 0 });
      cols.push({ key: 'band', label: 'Rounding band',
                  render: function (r) {
                    return r.base ? '±' + (2 * M.shiftShareUncertainty(20) /
                      r.base * 100).toFixed(1) : '—';
                  } });
    }
    cols.push({ key: 'jobs', label: 'Jobs' });
    cols.push({ key: 'pop', label: 'Residents' });

    if (!flowLines) {
      var cT = card('Ranked', C.fmt(ranked.length) + ' municipalities have a ' +
        'usable figure for this variable; the rest are suppressed, too small ' +
        'to read, or not applicable.');
      cT.appendChild(table(cols, ranked.map(function (r, i) {
        r.rank = i + 1; return r;
      })));
      host.appendChild(cT);
      ctx.mapTable = { rows: ranked, title: title, fmt: fmt };
    }

    /* Whether the pattern on the map is real, and the local clusters. */
    if (root.GRA.regionPanels && type !== 'cat') {
      root.GRA.regionPanels.spatialCard(host, ctx, vals, title, fmt,
        function (clusters, overlayTitle) {
          if (!mapRef.mp) return;
          if (!clusters) {
            mapRef.mp.setData(mapRef.vals,
              { type: mapRef.type, title: mapRef.title, fmt: mapRef.fmt,
                categories: DOING });
            return;
          }
          /* Two statistics paint this layer and they have different
             vocabularies: LISA returns HH/LL/HL/LH, Getis-Ord hot/cold. */
          var CL = { HH: '--loss', LL: '--gain', HL: '--loss-3',
                     LH: '--gain-3', ns: '--mid',
                     hot: '--loss', cold: '--gain' };
          var shown = {};
          Object.keys(clusters).forEach(function (code) {
            shown[code] = clusters[code].cluster || clusters[code].band;
          });
          mapRef.mp.colorOf = function () { return C.cssVar('--mid'); };
          mapRef.mp.values = mapRef.vals;
          Object.keys(mapRef.mp.nodes || {}).forEach(function (id) {
            var cl = shown[id] || 'ns';
            mapRef.mp.nodes[id].setAttribute('fill', C.cssVar(CL[cl]));
          });
          mapRef.mp.title = overlayTitle || 'Local clusters';
          mapRef.mp.legendEl.hidden = true;
        });
    }
  };

  function mapNote(v) {
    if (v === 'compshift') {
      return 'Residence-basis labour force, scaled by base-year size so small ' +
        'and large municipalities are comparable. Municipalities with fewer ' +
        'than 500 workers at the start are excluded: below that, census ' +
        'rounding alone moves the rate by more than ±5 per 100 base jobs and ' +
        'the figure carries no signal. The table shows each municipality’s ' +
        'rounding band alongside its rate.';
    }
    if (v === 'selfc' || v === 'ratio') {
      return 'From the 2021 commuting flows. The May 2021 reference week ' +
        'counted people working from home as working in their own ' +
        'municipality, which inflates both measures for commuter suburbs.';
    }
    if (v === 'lq' || v === 'share') {
      return 'Place of work, 2021. Cells at or below ' + M.MIN_RELIABLE_CELL +
        ' workers are withheld rather than mapped.';
    }
    return 'Place of work, 2021 Census.';
  }

  /* ====================================================== 7. SOURCES */

  P.sources = function (host, ctx) {
    init();
    var meta = D.meta;
    var built = new Date(meta.built_at);

    host.appendChild(card('Where every number comes from',
      'Built ' + built.toLocaleDateString('en-CA', { year: 'numeric',
        month: 'long', day: 'numeric' }) + '. Each source below states what ' +
      'the tool uses it for and what it cannot be trusted to say. Nothing in ' +
      'the app draws on a source that is not listed here.'));

    var cov = card('Coverage by census year',
      'How many of Ontario’s 577 municipalities have published industry ' +
      'figures in each census. A municipality missing from a year is shown as ' +
      'missing, never as zero.');
    cov.appendChild(table([
      { key: 'year', label: 'Census' },
      { key: 'n', label: 'Municipalities with data' },
      { key: 'share', label: 'Of 577', type: 'pct', dp: 0 },
      { key: 'note', label: 'Instrument' }
    ], Object.keys(meta.csd_coverage_by_year).map(function (y) {
      return {
        year: y, n: meta.csd_coverage_by_year[y],
        share: meta.csd_coverage_by_year[y] / 577,
        note: y === '2011' ? 'National Household Survey (voluntary)'
          : 'Census long form (mandatory)'
      };
    })));
    host.appendChild(cov);

    meta.sources.forEach(function (s) {
      var c = card(s.title, null, { badge: s.vintage || '' });
      c.appendChild(h('<p style="font-size:13.5px;line-height:1.6;margin:4px 0 10px">' +
        '<b>Used for:</b> ' + C.esc(s.purpose) + '</p>'));
      c.appendChild(h('<p style="font-size:13.5px;line-height:1.6;margin:0 0 10px;' +
        'color:var(--ink-2)"><b>Cannot be trusted to say:</b> ' +
        C.esc(s.caveats) + '</p>'));
      c.appendChild(h('<div class="card-foot" style="font-family:var(--mono);' +
        'font-size:11.5px">' + C.esc(s.cite || '') +
        (s.rows_loaded ? '<br>' + C.fmt(s.rows_loaded) + ' rows loaded' : '') +
        '</div>'));
      host.appendChild(c);
    });

    host.appendChild(card('Reliability floor',
      C.esc(meta.reliability.note) + ' The rounding error on a single cell has ' +
      'a standard deviation of about ' + meta.reliability.rounding_sd_per_cell +
      ' workers, so a sum of <i>n</i> cells carries about ' + meta.reliability.rounding_sd_per_cell + '√<i>n</i>. That is ' +
      'the floor below which a number cannot be read, and it is separate from — ' +
      'and smaller than — the census long-form sampling error.'));

    host.appendChild(card('Methods',
      'The full statement of every method, with its literature reference and ' +
      'its known biases, is in <b>METHODS.md</b> beside the app. In short: ' +
      'classic three-way shift-share after Dunn (1960); the competitive term ' +
      'split into competitive and allocation effects after Esteban-Marquillas ' +
      '(1972); chained decomposition after Barff and Knight (1988); location ' +
      'quotients and location-quotient-excess economic base; Krugman ' +
      'specialisation, Herfindahl and Shannon concentration, and the Hachman ' +
      'index; Flegg-Webber size adjustment where a location quotient is used ' +
      'to scale a provincial coefficient; and Mahalanobis distance on a stated ' +
      'feature vector for peer selection.'));
  };

  /* Brief lives in brief.js */
  P.brief = function (host, ctx, phone) {
    init();
    root.GRA.brief.render(host, ctx, phone);
  };

  root.GRA = root.GRA || {};
  root.GRA.panels = P;
  root.GRA.ui = { card: card, table: table, h: h, seg: seg, stat: stat,
                  afterLayout: afterLayout, flagChip: flagChip };
}(this));
