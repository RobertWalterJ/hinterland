/* ==========================================================================
   Chart primitives - inline SVG, no dependencies.

   House rules, applied here once so no individual chart has to remember them:
     - thin marks, 4px rounded ends on the free end of a bar, square against
       the baseline
     - a 2px surface-coloured gap between adjacent fills, so bars read as
       separate objects rather than one block
     - recessive grid and axes; the data is the darkest thing on screen
     - selective direct labels, never a number on every mark
     - a hover tooltip on every plotted form
     - ranked bars are ONE hue with an accent for the mark under the cursor:
       twenty sectors means twenty bars, and twenty colours would encode
       nothing
     - colour encodes sign or magnitude, never identity-by-rank
   ========================================================================== */

(function (root) {
  'use strict';

  var C = {};
  var SVGNS = 'http://www.w3.org/2000/svg';
  var tip = null;

  /* ------------------------------------------------------------ helpers */

  function el(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function svgRoot(host, w, h, label) {
    host.textContent = '';
    var s = el('svg', {
      class: 'chart', viewBox: '0 0 ' + w + ' ' + h,
      preserveAspectRatio: 'xMinYMin meet',
      role: 'img'
    }, host);
    /* Without a name every chart in the app announces as an unnamed
       graphic. A <title> child is what assistive technology reads off an
       inline SVG; aria-label alone is unreliable on <svg>. */
    if (label) {
      var t = el('title', {}, s);
      t.textContent = label;
      s.setAttribute('aria-label', label);
    }
    s.style.height = h + 'px';
    return s;
  }

  function ensureTip() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tip';
      document.body.appendChild(tip);
    }
    return tip;
  }

  C.showTip = function (html, ev) {
    var t = ensureTip();
    t.innerHTML = html;
    t.classList.add('on');
    var r = t.getBoundingClientRect();
    var x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - 14;
    t.style.left = Math.max(8, x) + 'px';
    t.style.top = Math.max(8, y) + 'px';
  };

  C.hideTip = function () { if (tip) tip.classList.remove('on'); };

  function hover(node, html) {
    node.addEventListener('mousemove', function (e) { C.showTip(html(), e); });
    node.addEventListener('mouseleave', C.hideTip);
    node.addEventListener('click', function (e) { C.showTip(html(), e); });
  }

  /* Rounded rect with only the far end rounded, so the mark is anchored to
     the baseline rather than floating. */
  function barPath(x, y, w, h, r, dir) {
    r = Math.min(r, Math.max(0, dir === 'h' ? w : h));
    if (r <= 0.5) return 'M' + x + ',' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z';
    if (dir === 'h') {
      if (w >= 0) {
        return 'M' + x + ',' + y + 'h' + (w - r) +
          'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
          'v' + (h - 2 * r) +
          'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r +
          'h' + (-(w - r)) + 'Z';
      }
      var aw = -w;
      return 'M' + x + ',' + y + 'h' + (-(aw - r)) +
        'a' + r + ',' + r + ' 0 0 0 ' + (-r) + ',' + r +
        'v' + (h - 2 * r) +
        'a' + r + ',' + r + ' 0 0 0 ' + r + ',' + r +
        'h' + (aw - r) + 'Z';
    }
    // vertical, h negative means upward
    if (h <= 0) {
      var ah = -h;
      return 'M' + x + ',' + y + 'v' + (-(ah - r)) +
        'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) +
        'h' + (w - 2 * r) +
        'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
        'v' + (ah - r) + 'Z';
    }
    return 'M' + x + ',' + y + 'v' + (h - r) +
      'a' + r + ',' + r + ' 0 0 0 ' + r + ',' + r +
      'h' + (w - 2 * r) +
      'a' + r + ',' + r + ' 0 0 0 ' + r + ',' + (-r) +
      'v' + (-(h - r)) + 'Z';
  }

  C.fmt = function (v, dp) {
    if (v == null || !isFinite(v)) return '—';
    dp = dp == null ? 0 : dp;
    return v.toLocaleString('en-CA', { minimumFractionDigits: dp,
                                       maximumFractionDigits: dp });
  };
  C.signed = function (v, dp) {
    if (v == null || !isFinite(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? '−' : '') + C.fmt(Math.abs(v), dp);
  };
  C.pct = function (v, dp) {
    if (v == null || !isFinite(v)) return '—';
    return (v * 100).toFixed(dp == null ? 1 : dp) + '%';
  };
  C.signedPct = function (v, dp) {
    if (v == null || !isFinite(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? '−' : '') +
      Math.abs(v * 100).toFixed(dp == null ? 1 : dp) + '%';
  };

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  C.cssVar = cssVar;

  /* Nice round tick step for an axis. */
  function ticks(min, max, want) {
    if (min === max) { min -= 1; max += 1; }
    var span = max - min;
    var raw = span / (want || 5);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var stepN = norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1;
    var step = stepN * mag;
    var out = [];
    for (var t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) {
      out.push(Math.abs(t) < step * 1e-9 ? 0 : t);
    }
    return out;
  }
  C.ticks = ticks;

  /* ------------------------------------------------- 1. ranked bars */

  /* rows: [{label, value, note, accent, flag}]
     One hue. The bar under the cursor takes the accent. */
  C.rankedBars = function (host, rows, opt) {
    opt = opt || {};
    var w = opt.width || host.clientWidth || 560;
    var rowH = opt.rowH || 22, gap = 2;
    var padL = opt.labelWidth || 150, padR = opt.valueWidth || 66, padT = 16, padB = 22;
    var h = padT + rows.length * rowH + padB;
    var s = svgRoot(host, w, h, opt.title ||
      (opt.valueName || 'Value') + ' by category, ranked');
    var plotW = Math.max(40, w - padL - padR);

    var vals = rows.map(function (r) { return r.value || 0; });
    var max = Math.max.apply(null, vals.concat([0]));
    var min = Math.min.apply(null, vals.concat([0]));
    var zeroAtLeft = min >= 0;
    var lo = zeroAtLeft ? 0 : min, hi = max;
    var scale = function (v) { return (v - lo) / (hi - lo || 1) * plotW; };
    var x0 = padL + scale(0);

    ticks(lo, hi, 4).forEach(function (t) {
      var x = padL + scale(t);
      el('line', { class: t === 0 ? 'zero-line' : 'grid-line',
                   x1: x, x2: x, y1: padT - 6, y2: h - padB + 2 }, s);
      el('text', { class: 'ax', x: x, y: h - padB + 15,
                   'text-anchor': 'middle' }, s)
        .textContent = C.fmt(t);
    });

    rows.forEach(function (r, i) {
      var g = el('g', { class: 'row' }, s);
      var y = padT + i * rowH;
      var v = r.value || 0;
      var bw = scale(v) - scale(0);
      var accent = r.accent ? cssVar('--bar-ink') : cssVar('--bar');

      el('path', {
        class: 'bar', d: barPath(x0, y + 1, bw, rowH - gap - 1, 4, 'h'),
        fill: r.color || accent
      }, g);

      var lab = el('text', { class: 'lbl', x: padL - 9, y: y + rowH / 2 + 3,
                             'text-anchor': 'end' }, g);
      lab.textContent = r.label;

      el('text', { class: 'val', x: w - padR + 6, y: y + rowH / 2 + 3 }, g)
        .textContent = r.display != null ? r.display : C.fmt(v);

      var hit = el('rect', { class: 'hit', x: 0, y: y, width: w, height: rowH }, g);
      hover(hit, function () {
        return '<b>' + esc(r.label) + '</b>' +
          '<div class="r"><span>' + (opt.valueName || 'Value') + '</span><span>' +
          (r.display != null ? r.display : C.fmt(v)) + '</span></div>' +
          (r.note ? '<div style="color:var(--ink-3);margin-top:3px">' + r.note + '</div>' : '');
      });
      if (opt.onPick) hit.addEventListener('click', function () { opt.onPick(r, i); });
    });
    return s;
  };

  /* -------------------------------------------------- 2. waterfall */

  /* The shift-share decomposition, read left to right as a sentence.
     items: [{label, value, kind}] where kind is 'start'|'component'|'total'. */
  C.waterfall = function (host, items, opt) {
    opt = opt || {};
    var w = opt.width || host.clientWidth || 620;
    var h = opt.height || 260;
    var padL = 54, padR = 14, padT = 26, padB = 52;
    var s = svgRoot(host, w, h, opt.title || 'Decomposition, ' +
      (opt.valueName || 'contributions') + ' by component');
    var plotW = w - padL - padR, plotH = h - padT - padB;
    var n = items.length;
    var colW = plotW / n;
    var barW = Math.min(64, colW - 14);

    /* Running extent, including every intermediate top. */
    var run = 0, tops = [0];
    items.forEach(function (it) {
      if (it.kind === 'total' || it.kind === 'start') { tops.push(it.value); }
      else { run += it.value; tops.push(run); }
    });
    var base = items[0] && items[0].kind === 'start' ? items[0].value : 0;
    // recompute as cumulative from the start value
    run = base; tops = [base];
    items.forEach(function (it, i) {
      if (i === 0 && it.kind === 'start') return;
      if (it.kind === 'total') tops.push(it.value);
      else { run += it.value; tops.push(run); }
    });
    var lo = Math.min.apply(null, tops.concat([0]));
    var hi = Math.max.apply(null, tops);
    if (opt.zeroBased !== false) { lo = Math.min(0, lo); }
    var pad = (hi - lo) * 0.08 || 1;
    lo -= pad; hi += pad;
    var y = function (v) { return padT + plotH - (v - lo) / (hi - lo) * plotH; };

    ticks(lo, hi, 4).forEach(function (t) {
      el('line', { class: t === 0 ? 'zero-line' : 'grid-line',
                   x1: padL - 6, x2: w - padR, y1: y(t), y2: y(t) }, s);
      el('text', { class: 'ax', x: padL - 10, y: y(t) + 3.5,
                   'text-anchor': 'end' }, s).textContent = C.fmt(t);
    });

    var cursor = base;
    items.forEach(function (it, i) {
      var g = el('g', { class: 'row' }, s);
      var cx = padL + i * colW + colW / 2;
      var x = cx - barW / 2;
      var top, bot, fill;

      if (it.kind === 'start' || it.kind === 'total') {
        top = Math.max(it.value, 0); bot = Math.min(it.value, 0);
        fill = cssVar('--ink-3');
        if (it.kind === 'total') fill = cssVar('--ink-2');
        cursor = it.value;
      } else {
        var from = cursor, to = cursor + it.value;
        top = Math.max(from, to); bot = Math.min(from, to);
        fill = it.value >= 0 ? cssVar('--gain') : cssVar('--loss');
        cursor = to;
        /* connector to the previous column */
        if (i > 0) {
          el('line', { class: 'grid-line', 'stroke-dasharray': '3 3',
                       x1: cx - colW / 2 - (colW - barW) / 2 + 1, x2: x,
                       y1: y(from), y2: y(from) }, s);
        }
      }
      var yt = y(top), hh = Math.max(2, y(bot) - y(top));
      el('path', {
        class: 'bar',
        d: barPath(x, yt + hh, barW, -hh, 4, 'v'),
        fill: fill
      }, g);

      var lab = el('text', { class: 'ax', x: cx, y: h - padB + 16,
                             'text-anchor': 'middle' }, s);
      wrapText(lab, it.label, barW + 22, cx);

      el('text', { class: 'val', x: cx,
                   y: (it.kind === 'component' && it.value < 0) ? y(bot) + 15 : yt - 7,
                   'text-anchor': 'middle' }, g)
        .textContent = it.kind === 'component' ? C.signed(it.value) : C.fmt(it.value);

      var hit = el('rect', { class: 'hit', x: cx - colW / 2, y: padT - 10,
                             width: colW, height: plotH + 20 }, g);
      hover(hit, function () {
        return '<b>' + esc(it.label) + '</b>' +
          '<div class="r"><span>' + (it.kind === 'component' ? 'Effect' : 'Jobs') +
          '</span><span>' + (it.kind === 'component' ? C.signed(it.value) : C.fmt(it.value)) +
          '</span></div>' +
          (it.note ? '<div style="color:var(--ink-3);margin-top:4px;max-width:230px">' +
            it.note + '</div>' : '');
      });
    });
    return s;
  };

  function wrapText(textNode, str, maxW, cx) {
    var words = String(str).split(' ');
    var perLine = Math.max(1, Math.floor(maxW / 5.6));
    var lines = [], cur = '';
    words.forEach(function (wd) {
      if ((cur + ' ' + wd).trim().length > perLine && cur) { lines.push(cur); cur = wd; }
      else cur = (cur + ' ' + wd).trim();
    });
    if (cur) lines.push(cur);
    lines.slice(0, 3).forEach(function (ln, i) {
      var t = el('tspan', { x: cx, dy: i === 0 ? 0 : 12 }, textNode);
      t.textContent = ln;
    });
  }

  /* ------------------------------------------- 3. diverging bars */

  /* Sector-level contributions around a zero line. Sign is the encoding. */
  C.divergingBars = function (host, rows, opt) {
    opt = opt || {};
    var w = opt.width || host.clientWidth || 560;
    var rowH = opt.rowH || 21, gap = 2;
    var padL = opt.labelWidth || 150, padR = 66, padT = 18, padB = 24;
    var h = padT + rows.length * rowH + padB;
    var s = svgRoot(host, w, h, opt.title ||
      (opt.valueName || 'Effect') + ' by sector, gains and losses');
    var plotW = Math.max(40, w - padL - padR);

    var mx = 0;
    rows.forEach(function (r) { mx = Math.max(mx, Math.abs(r.value || 0)); });
    mx = mx || 1;
    var mid = padL + plotW / 2;
    var scale = function (v) { return v / mx * (plotW / 2); };

    ticks(-mx, mx, 4).forEach(function (t) {
      var x = mid + scale(t);
      el('line', { class: t === 0 ? 'zero-line' : 'grid-line',
                   x1: x, x2: x, y1: padT - 6, y2: h - padB + 2 }, s);
      el('text', { class: 'ax', x: x, y: h - padB + 15, 'text-anchor': 'middle' }, s)
        .textContent = C.signed(t);
    });

    rows.forEach(function (r, i) {
      var g = el('g', { class: 'row' }, s);
      var y = padT + i * rowH;
      var v = r.value || 0;
      var bw = scale(v);
      el('path', {
        class: 'bar',
        d: barPath(mid, y + 1, bw, rowH - gap - 1, 4, 'h'),
        fill: v >= 0 ? cssVar('--gain') : cssVar('--loss')
      }, g);

      el('text', { class: 'lbl', x: padL - 9, y: y + rowH / 2 + 3,
                   'text-anchor': 'end' }, g).textContent = r.label;
      el('text', { class: 'val', x: w - padR + 6, y: y + rowH / 2 + 3 }, g)
        .textContent = r.display != null ? r.display : C.signed(v);

      var hit = el('rect', { class: 'hit', x: 0, y: y, width: w, height: rowH }, g);
      hover(hit, function () {
        return '<b>' + esc(r.label) + '</b>' +
          '<div class="r"><span>' + (opt.valueName || 'Effect') + '</span><span>' +
          C.signed(v) + '</span></div>' +
          (r.note ? '<div style="color:var(--ink-3);margin-top:3px;max-width:230px">' +
            r.note + '</div>' : '');
      });
    });
    return s;
  };

  /* ------------------------------------------------ 4. quadrant scatter */

  /* The Esteban-Marquillas reading. x = specialisation (actual minus
     homothetic employment), y = growth gap against the reference. The
     quadrants are the finding, so they are drawn and named. */
  C.quadrantScatter = function (host, pts, opt) {
    opt = opt || {};
    var w = opt.width || host.clientWidth || 560;
    var h = opt.height || 380;
    var padL = 60, padR = 18, padT = 24, padB = 46;
    var s = svgRoot(host, w, h, opt.title || 'Scatter plot, ' +
      (opt.xName || 'x') + ' against ' + (opt.yName || 'y'));
    var pw = w - padL - padR, ph = h - padT - padB;

    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var xm = Math.max(1, Math.max.apply(null, xs.map(Math.abs)));
    var ym = Math.max(0.01, Math.max.apply(null, ys.map(Math.abs)));
    var X = function (v) { return padL + (v + xm) / (2 * xm) * pw; };
    var Y = function (v) { return padT + ph - (v + ym) / (2 * ym) * ph; };

    /* quadrant washes, very light */
    var q = [
      { x: X(0), y: padT, w: pw / 2, h: ph / 2, fill: cssVar('--gain-4'),
        t: 'competitive advantage', anchor: 'end', tx: w - padR - 8, ty: padT + 14 },
      { x: padL, y: padT, w: pw / 2, h: ph / 2, fill: cssVar('--mid'),
        t: 'unexploited advantage', anchor: 'start', tx: padL + 8, ty: padT + 14 },
      { x: X(0), y: padT + ph / 2, w: pw / 2, h: ph / 2, fill: cssVar('--loss-4'),
        t: 'specialised disadvantage', anchor: 'end', tx: w - padR - 8, ty: padT + ph - 6 },
      { x: padL, y: padT + ph / 2, w: pw / 2, h: ph / 2, fill: cssVar('--mid'),
        t: 'unspecialised disadvantage', anchor: 'start', tx: padL + 8, ty: padT + ph - 6 }
    ];
    q.forEach(function (r) {
      el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: r.fill,
                   opacity: .45 }, s);
    });
    q.forEach(function (r) {
      el('text', { class: 'ax', x: r.tx, y: r.ty, 'text-anchor': r.anchor,
                   'font-weight': 650 }, s).textContent = r.t;
    });

    el('line', { class: 'zero-line', x1: X(0), x2: X(0), y1: padT, y2: padT + ph }, s);
    el('line', { class: 'zero-line', x1: padL, x2: padL + pw, y1: Y(0), y2: Y(0) }, s);

    el('text', { class: 'ax', x: padL + pw / 2, y: h - 8,
                 'text-anchor': 'middle' }, s)
      .textContent = 'more specialised  →';
    var yl = el('text', { class: 'ax', x: 14, y: padT + ph / 2,
                          'text-anchor': 'middle',
                          transform: 'rotate(-90 14 ' + (padT + ph / 2) + ')' }, s);
    yl.textContent = 'growing faster than the reference  →';

    pts.forEach(function (p) {
      var g = el('g', { class: 'row' }, s);
      var r = Math.max(4.5, Math.min(17, Math.sqrt(Math.abs(p.size || 0)) / 3.2));
      el('circle', {
        cx: X(p.x), cy: Y(p.y), r: r,
        fill: p.y >= 0 ? cssVar('--gain') : cssVar('--loss'),
        'fill-opacity': .72,
        stroke: cssVar('--surface-1'), 'stroke-width': 2
      }, g);
      if (p.label && r >= 9) {
        el('text', { class: 'ax', x: X(p.x), y: Y(p.y) - r - 5,
                     'text-anchor': 'middle' }, g).textContent = p.short || p.label;
      }
      var hit = el('circle', { class: 'hit', cx: X(p.x), cy: Y(p.y),
                               r: Math.max(12, r + 6) }, g);
      hover(hit, function () {
        return '<b>' + esc(p.label) + '</b>' +
          '<div class="r"><span>Quadrant</span><span>' + esc(p.quadrant || '') + '</span></div>' +
          '<div class="r"><span>Allocation effect</span><span>' + C.signed(p.alloc) + '</span></div>' +
          '<div class="r"><span>Competitive effect</span><span>' + C.signed(p.comp) + '</span></div>' +
          '<div class="r"><span>Jobs at start</span><span>' + C.fmt(p.size) + '</span></div>';
      });
    });
    return s;
  };

  /* --------------------------------------------- 5. peer distribution */

  /* A strip of peers with the subject marked. Rank without the distribution
     is a bad habit, so the distribution is drawn. */
  C.strip = function (host, values, subject, opt) {
    opt = opt || {};
    var w = opt.width || host.clientWidth || 300;
    var h = 46;
    var padL = 8, padR = 8, padT = 12;
    var s = svgRoot(host, w, h, opt.title ||
      'Distribution across Ontario, with this place marked');
    var pw = w - padL - padR;
    var vals = values.filter(function (v) { return v != null && isFinite(v); });
    if (!vals.length) return s;
    var lo = Math.min.apply(null, vals.concat([subject]));
    var hi = Math.max.apply(null, vals.concat([subject]));
    if (lo === hi) { lo -= 1; hi += 1; }
    var X = function (v) { return padL + (v - lo) / (hi - lo) * pw; };

    el('line', { class: 'grid-line', x1: padL, x2: padL + pw,
                 y1: padT + 8, y2: padT + 8 }, s);
    vals.forEach(function (v) {
      el('circle', { cx: X(v), cy: padT + 8, r: 3.4,
                     fill: cssVar('--bar'), 'fill-opacity': .95 }, s);
    });
    var med = opt.median;
    if (med != null) {
      el('line', { x1: X(med), x2: X(med), y1: padT, y2: padT + 16,
                   stroke: cssVar('--ink-3'), 'stroke-width': 1.5,
                   'stroke-dasharray': '2 2' }, s);
    }
    if (subject != null && isFinite(subject)) {
      el('circle', { cx: X(subject), cy: padT + 8, r: 5.5,
                     fill: cssVar('--brand'), stroke: cssVar('--surface-1'),
                     'stroke-width': 2 }, s);
    }
    el('text', { class: 'ax', x: padL, y: h - 4 }, s)
      .textContent = opt.fmt ? opt.fmt(lo) : C.fmt(lo);
    var hiT = el('text', { class: 'ax', x: padL + pw, y: h - 4,
                           'text-anchor': 'end' }, s);
    hiT.textContent = opt.fmt ? opt.fmt(hi) : C.fmt(hi);
    return s;
  };

  /* ------------------------------------------------------- 6. lines */

  /* Employment across census years. series: [{name, points:[[x,y]], color}] */
  C.lines = function (host, series, opt) {
    opt = opt || {};
    var w = opt.width || host.clientWidth || 560;
    var h = opt.height || 220;
    var padL = 56, padR = 16, padT = 16, padB = 34;
    var s = svgRoot(host, w, h, opt.title || 'Time series, ' +
      (opt.valueName || 'value') + ' by year');
    var pw = w - padL - padR, ph = h - padT - padB;

    var xs = [], ys = [];
    series.forEach(function (se) {
      se.points.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); });
    });
    if (!xs.length) return s;
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = opt.zeroBased === false ? Math.min.apply(null, ys) : 0;
    var y1 = Math.max.apply(null, ys);
    var pad = (y1 - y0) * 0.08 || 1;
    y1 += pad;
    if (opt.zeroBased === false) y0 -= pad;
    var X = function (v) { return padL + (v - x0) / ((x1 - x0) || 1) * pw; };
    var Y = function (v) { return padT + ph - (v - y0) / ((y1 - y0) || 1) * ph; };

    ticks(y0, y1, 4).forEach(function (t) {
      el('line', { class: 'grid-line', x1: padL, x2: padL + pw, y1: Y(t), y2: Y(t) }, s);
      el('text', { class: 'ax', x: padL - 9, y: Y(t) + 3.5, 'text-anchor': 'end' }, s)
        .textContent = C.fmt(t);
    });
    (opt.xTicks || xs.filter(function (v, i, a) { return a.indexOf(v) === i; }))
      .forEach(function (t) {
        el('text', { class: 'ax', x: X(t), y: h - padB + 16,
                     'text-anchor': 'middle' }, s).textContent = t;
      });

    series.forEach(function (se, si) {
      var d = se.points.map(function (p, i) {
        return (i ? 'L' : 'M') + X(p[0]) + ',' + Y(p[1]);
      }).join('');
      el('path', { d: d, fill: 'none', stroke: se.color || cssVar('--gain'),
                   'stroke-width': 2, 'stroke-linejoin': 'round',
                   'stroke-linecap': 'round' }, s);
      se.points.forEach(function (p) {
        var g = el('g', null, s);
        el('circle', { cx: X(p[0]), cy: Y(p[1]), r: 4.5,
                       fill: se.color || cssVar('--gain'),
                       stroke: cssVar('--surface-1'), 'stroke-width': 2 }, g);
        var hit = el('circle', { class: 'hit', cx: X(p[0]), cy: Y(p[1]), r: 14 }, g);
        hover(hit, function () {
          return '<b>' + esc(se.name) + '</b>' +
            '<div class="r"><span>' + p[0] + '</span><span>' + C.fmt(p[1]) + '</span></div>' +
            (p[2] ? '<div style="color:var(--ink-3);margin-top:3px">' + p[2] + '</div>' : '');
        });
      });
      /* direct label at the last point, for four series or fewer */
      if (series.length <= 4 && se.points.length) {
        var last = se.points[se.points.length - 1];
        el('text', { class: 'ax', x: X(last[0]) - 2, y: Y(last[1]) - 10,
                     'text-anchor': 'end', 'font-weight': 650,
                     fill: se.color || cssVar('--gain') }, s).textContent = se.name;
      }
    });
    return s;
  };

  /* -------------------------------------------------------- 7. meter */

  /* A labelled track with a marker - a dial would imply a target the index
     does not have. */
  C.meter = function (host, value, opt) {
    opt = opt || {};
    var w = opt.width || host.clientWidth || 240;
    var h = 40;
    var padL = 4, padR = 4;
    var s = svgRoot(host, w, h, opt.title ||
      (opt.label || 'Index') + ' shown on its scale');
    var pw = w - padL - padR;
    var lo = opt.min == null ? 0 : opt.min;
    var hi = opt.max == null ? 1 : opt.max;
    var X = function (v) {
      return padL + Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1))) * pw;
    };

    el('rect', { x: padL, y: 12, width: pw, height: 7, rx: 3.5,
                 fill: cssVar('--surface-sunk') }, s);
    if (opt.ramp) {
      var stops = ['--seq-1', '--seq-3', '--seq-5', '--seq-7'];
      stops.forEach(function (v, i) {
        el('rect', { x: padL + i * pw / 4, y: 12, width: pw / 4 + 0.5, height: 7,
                     fill: cssVar(v), opacity: .5 }, s);
      });
    }
    if (opt.reference != null) {
      el('line', { x1: X(opt.reference), x2: X(opt.reference), y1: 8, y2: 23,
                   stroke: cssVar('--ink-3'), 'stroke-width': 1.5,
                   'stroke-dasharray': '2 2' }, s);
      el('text', { class: 'ax', x: X(opt.reference), y: h - 2,
                   'text-anchor': 'middle' }, s)
        .textContent = opt.referenceLabel || 'ref';
    }
    if (value != null && isFinite(value)) {
      el('rect', { x: padL, y: 12, width: Math.max(3, X(value) - padL), height: 7,
                   rx: 3.5, fill: cssVar('--bar-ink') }, s);
      el('circle', { cx: X(value), cy: 15.5, r: 5.5, fill: cssVar('--brand'),
                     stroke: cssVar('--surface-1'), 'stroke-width': 2 }, s);
    }
    el('text', { class: 'ax', x: padL, y: 8 }, s)
      .textContent = opt.loLabel || String(lo);
    el('text', { class: 'ax', x: padL + pw, y: 8, 'text-anchor': 'end' }, s)
      .textContent = opt.hiLabel || String(hi);
    return s;
  };

  /* ------------------------------------------------------ 8. count-up */

  /* Numbers move to their new value rather than being replaced, so a change
     of benchmark reads as a change rather than a redraw. */
  C.countTo = function (node, to, fmt, ms) {
    var from = parseFloat(node.getAttribute('data-v'));
    if (!isFinite(from)) from = 0;
    node.setAttribute('data-v', to);
    if (!isFinite(to)) { node.textContent = '—'; return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.textContent = fmt(to); return;
    }
    var dur = ms || 480, t0 = performance.now();
    function frame(t) {
      var k = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  C.esc = esc;

  /* Colour for a sector group, in fixed slot order. */
  C.groupColor = function (groups, group) {
    var i = groups.indexOf(group);
    return cssVar('--grp-' + (((i < 0 ? 0 : i) % 5) + 1));
  };

  /* Sequential ramp step for a 0-1 position. */
  C.seqColor = function (t) {
    if (t == null || !isFinite(t)) return cssVar('--surface-sunk');
    var k = Math.max(1, Math.min(7, Math.round(t * 6) + 1));
    return cssVar('--seq-' + k);
  };

  /* Diverging ramp step for a value against a symmetric extent. */
  C.divColor = function (v, extent) {
    if (v == null || !isFinite(v) || !extent) return cssVar('--surface-sunk');
    var t = Math.max(-1, Math.min(1, v / extent));
    var a = Math.abs(t);
    var band = a < .08 ? 0 : a < .3 ? 1 : a < .6 ? 2 : a < .85 ? 3 : 4;
    if (band === 0) return cssVar('--mid');
    var names = t > 0
      ? ['', '--gain-4', '--gain-3', '--gain-2', '--gain']
      : ['', '--loss-4', '--loss-3', '--loss-2', '--loss'];
    return cssVar(names[band]);
  };

  root.GRA = root.GRA || {};
  root.GRA.charts = C;
}(this));
