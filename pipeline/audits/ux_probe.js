/* ===========================================================================
   ux_probe.js — Hinterland phone UX probe (audit 5)

   WHAT IT IS
   A single self-contained expression. Paste the whole file into the browser
   console (or a javascript-eval tool) while a screen is open and it returns a
   plain JSON-able object of measurements for THAT screen. Nothing is written
   to the page and nothing is left behind: the text-size test puts the root
   font-size back the way it found it.

   HOW TO RUN IT — the screens, in order
   ---------------------------------------------------------------------------
   0. Serve the app and open it at 375 x 812, once with the browser in light
      and once in dark. The app's scroll container is <main>, and <main> has
      scroll-behavior: smooth, so anything that jumps must use
        document.querySelector('main').scrollTo({top: 0, behavior: 'instant'})

   1. LEARN LANDING           GRA.app.state.learnView = null;
                              GRA.app.go('learn'); GRA.app.render();
   2. PRACTISE tile           GRA.app.state.learnView = 'practise';
                              GRA.app.render();
      (open its Settings disclosure to measure the checkboxes:
       document.querySelector('.qsettings').open = true)
   3. BIG IDEAS tile          GRA.app.state.learnView = 'ideas';
                              GRA.app.render();
      (and again with document.querySelector('.qidea').open = true)
   4. ONTARIO'S STORY tile    GRA.app.state.learnView = 'story';
   5. WORDS AND METHODS tile  GRA.app.state.learnView = 'words';

      Note: GRA.app.go('learn') alone keeps whatever sub-view you were on —
      the tile is held in GRA.app.state.learnView, so set it explicitly.

   6. LESSON screen           from Practise: document.querySelector(
                              '.qhub-top .btn').click().  A lesson screen
                              appears only when a NEW big idea opens (it ends
                              with "Got it, ask me"). To force one, clear the
                              quiz state first (below) and reload.
   7. QUESTION screen         document.querySelector('.qgo').click()
                              (the button debounces for 600 ms — wait first)
   8. ANSWER screen           document.querySelectorAll('.qopt')[0].click()
                              Measure TWICE: as it arrives, and again with
                              document.querySelector('.qmore').open = true,
                              because "More about this answer" hides the
                              misread link and the term chips.
   9. END OF SESSION          click .qnext until the summary appears.

   ONE SET-UP NOTE (headless / automated panes only)
      .card carries `animation: rise .34s both`. In a pane whose compositor is
      not ticking, that animation never advances and the card sits at
      opacity 0, which makes every contrast reading come back as 1:1. Before
      measuring, paste once:
        document.head.insertAdjacentHTML('beforeend',
          '<style id="__noanim">*,*::before,*::after{animation:none!important;' +
          'transition:none!important}</style>');
      This is exactly what the app's own prefers-reduced-motion rule does, so
      it measures a real reader's screen, not an artificial one.

   Reset between runs:
      localStorage.removeItem('hinterland.quiz.v1');
      localStorage.removeItem('hinterland.quiz.settings');
      location.reload();

   WHAT IT RETURNS  (keys map 1:1 to the audit's numbered items)
      screen        what it thinks is open, plus the URL hash and theme
      geometry      item 1 — scroll height, viewport, screenfuls, fold count
      lines         item 2 — characters per line, avg / max / min, per text role
      actions       item 3 — y of each named action, above/below the 812 fold
      taps          item 4 — every interactive element's box; fails under 44x44
      contrast      item 5 — ratio + AA verdict for the text that carries meaning
      textSize      item 6 — what moves when the reader's text size moves
      flags         item 8 — justified text, italics, all-caps, motion

   DEPENDENCIES: none. Works on any Chromium/WebKit/Gecko of the last decade.
   =========================================================================== */

(function () {
  'use strict';

  var VIEW_H = 812;          /* the phone fold we are auditing against */
  var TAP_MIN = 44;          /* CSS px, WCAG 2.5.5 / platform guidance */
  var MAX_CHARS = 1200;      /* per element, so the per-character walk stays cheap */

  var main = document.querySelector('main') || document.scrollingElement;
  var doc = document.documentElement;

  /* The visible height a screen actually gets. <main> is a grid item that
     shrinks to its content, so main.clientHeight is NOT the fold when the
     screen is short — the fold is the height of the content area it sits in
     (the window, less the header and the tab bar; in quiz-mode both are
     hidden, so it is the whole window). */
  var FOLD = (function () {
    if (!main || !main.getBoundingClientRect) return window.innerHeight;
    var mt = main.getBoundingClientRect().top + (main.scrollTop ? 0 : 0);
    var bottom = window.innerHeight;
    Array.prototype.forEach.call(document.querySelectorAll('body *'), function (n) {
      var cs = getComputedStyle(n);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      var b = n.getBoundingClientRect();
      if (b.height <= 0 || b.width <= 0) return;
      if (b.top > window.innerHeight * 0.55 && b.top < bottom) bottom = b.top;
    });
    return Math.max(120, Math.round(bottom - Math.max(0, mt)));
  })();

  function $$(sel, root) {
    try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
    catch (e) { return []; }
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function r1(n) { return Math.round(n * 10) / 10; }
  /* Chrome keeps a stale layout box for the contents of a CLOSED <details>
     (content-visibility: hidden), so getBoundingClientRect alone reports
     hidden disclosure content as if it were on screen. It is not: the reader
     has to open the disclosure first. Treat it as hidden, and say so. */
  function inClosedDetails(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      var p = n.parentElement;
      if (p && p.tagName === 'DETAILS' && !p.open && n.tagName !== 'SUMMARY') return p;
      n = p;
    }
    return null;
  }
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    if (inClosedDetails(el)) return false;
    var b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  }
  /* a short, human-readable selector for the report */
  function sel(el) {
    if (!el) return '(none)';
    var s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    var c = (el.className && el.className.baseVal !== undefined ? el.className.baseVal
      : (el.className || '')).toString().trim().split(/\s+/).filter(Boolean).slice(0, 3);
    return s + (c.length ? '.' + c.join('.') : '');
  }

  /* ----------------------------------------------------------- colour --- */

  function parseColor(str) {
    if (!str) return null;
    var m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(/[,\s/]+/).filter(function (x) { return x !== ''; }).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function over(fg, bg) {                       /* alpha-composite fg onto bg */
    var a = fg.a;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a), a: 1
    };
  }
  function lum(c) {
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  function ratio(fg, bg) {
    var a = lum(fg), b = lum(bg);
    var hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }
  /* the real background behind an element: walk up through anything see-through */
  function bgOf(el) {
    var stack = [];
    var n = el;
    while (n && n.nodeType === 1) {
      var c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; }
      n = n.parentElement;
    }
    var base = { r: 255, g: 255, b: 255, a: 1 };
    for (var i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  }
  /* AA: 4.5 normal, 3.0 for >=24px, or >=18.66px when bold (>=700) */
  function aaNeed(fontPx, weight) {
    var w = parseInt(weight, 10) || 400;
    return (fontPx >= 24 || (fontPx >= 18.66 && w >= 700)) ? 3 : 4.5;
  }

  /* ------------------------------------------------- characters per line --- */
  /* Walks the element character by character with a Range and buckets each one
     by the top of its own rect. That gives the REAL line breaks, not an
     estimate from the container width. */
  function linesOf(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !/\S/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        var p = n.parentElement;
        if (!p || !visible(p)) return NodeFilter.FILTER_REJECT;
        /* skip decorative keys and icons — they are not the reading line */
        if (p.closest('.qkey, .qvicon, svg, .qspk')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var buckets = {}, order = [], seen = 0, node;
    var rng = document.createRange();
    while ((node = walker.nextNode()) && seen < MAX_CHARS) {
      var txt = node.nodeValue;
      for (var i = 0; i < txt.length && seen < MAX_CHARS; i++) {
        seen++;
        try { rng.setStart(node, i); rng.setEnd(node, i + 1); } catch (e) { continue; }
        var rc = rng.getBoundingClientRect();
        if (!rc || (rc.width === 0 && rc.height === 0)) continue;
        var key = Math.round(rc.top / 3) * 3;      /* 3px tolerance */
        if (!(key in buckets)) { buckets[key] = 0; order.push(key); }
        buckets[key]++;
      }
    }
    var counts = order.sort(function (a, b) { return a - b; })
      .map(function (k) { return buckets[k]; })
      .filter(function (n) { return n > 0; });
    if (!counts.length) return null;
    /* the last line of a paragraph is a ragged remainder, not a measure of
       line length — drop it when there is more than one line */
    var body = counts.length > 1 ? counts.slice(0, -1) : counts;
    var sum = body.reduce(function (a, b) { return a + b; }, 0);
    return {
      lines: counts.length,
      avg: r1(sum / body.length),
      max: Math.max.apply(null, counts),
      min: Math.min.apply(null, body),
      truncated: seen >= MAX_CHARS
    };
  }

  /* ------------------------------------------------------ what screen? --- */

  function whichScreen() {
    var b = document.body;
    if (b.classList.contains('quiz-mode')) {
      if (document.querySelector('.qlesson')) return 'quiz:lesson';
      if (document.querySelector('.qdone, .qsummary, .qstrands')) return 'quiz:done';
      if (document.querySelector('.qpaused, .qpause')) return 'quiz:paused';
      if (document.querySelector('.qcard')) return 'quiz:answer';
      if (document.querySelector('.qopts')) return 'quiz:question';
      return 'quiz:?';
    }
    if (document.querySelector('.qhub-top')) return 'learn:practise';
    if (document.querySelector('.qideas')) return 'learn:big-ideas';
    if (document.querySelector('.tl-item, .tl-title')) return "learn:ontario's-story";
    if (document.querySelector('.lname, .layers, .lplain')) return 'learn:words-and-methods';
    if (document.querySelector('.home-qs .home-q') && document.querySelector('.lrn-start')) {
      return 'learn:landing';
    }
    return 'other:' + (location.hash || '#');
  }

  /* ---------------------------------------------------- 1. geometry ------ */

  function geometry() {
    var sh = main ? main.scrollHeight : doc.scrollHeight;
    var ch = main ? main.clientHeight : window.innerHeight;
    return {
      scrollHeight: Math.round(sh),
      viewportHeight: Math.round(ch),
      windowInnerHeight: window.innerHeight,
      foldHeight: FOLD,
      chromeHeight: window.innerHeight - FOLD,
      screenfuls: r2(sh / FOLD),
      screenfuls_vs_812: r2(sh / VIEW_H),
      overflows: sh > FOLD + 2,
      hiddenBelowFold: Math.max(0, Math.round(sh - FOLD)),
      horizontalOverflow: main ? main.scrollWidth > main.clientWidth + 1 : false,
      scrollTop: main ? Math.round(main.scrollTop) : 0
    };
  }

  /* ---------------------------------------------------- 2. lines --------- */

  var TEXT_ROLES = [
    ['question stem', '.qstem'],
    ['option label', '.qopt .qlabel'],
    ['answer verdict', '.qverdict'],
    ['answer sentence', '.qsentence'],
    ['answer tag', '.qtag'],
    ['chip', '.qchip'],
    ['more paragraph', '.qmore-p'],
    ['source line', '.qsource'],
    ['lesson point', '.qlesson-pts li'],
    ['lesson ask', '.qlesson-ask'],
    ['card foot', '.card-foot'],
    ['progress text', '.qprog-t'],
    ['prose', '.prose p'],
    ['plain sentence', '.lplain'],
    ['example', '.lexample'],
    ['timeline fact', '.tl-fact'],
    ['big idea sub', '.qidea-s'],
    ['hub sub', '.qhub-sub'],
    ['card note', '.card-note'],
    ['learn lede', '.home-lede'],
    ['tile title', '.hq-q'],
    ['tile sub', '.hq-a'],
    ['big idea title', '.qidea-title'],
    ['strand chip', '.qstrand'],
    ['paused text', '.qpaused p, .qpause p'],
    ['look again item', '.qidea-facts li'],
    ['growth label', '.qgrow-l'],
    ['new idea opened', '.qopened'],
    ['sub-heading', '.subh']
  ];

  function lines() {
    var out = {};
    TEXT_ROLES.forEach(function (row) {
      var els = $$(row[1]).filter(visible);
      if (!els.length) return;
      var per = [], all = [];
      els.slice(0, 12).forEach(function (el) {
        var m = linesOf(el);
        if (!m) return;
        per.push(m);
        all.push(m);
      });
      if (!per.length) return;
      var avgs = per.map(function (m) { return m.avg; });
      var cs = getComputedStyle(els[0]);
      out[row[0]] = {
        selector: row[1],
        n: els.length,
        fontPx: parseFloat(cs.fontSize),
        lineHeight: cs.lineHeight,
        widthPx: Math.round(els[0].getBoundingClientRect().width),
        avgCharsPerLine: r1(avgs.reduce(function (a, b) { return a + b; }, 0) / avgs.length),
        maxCharsOnALine: Math.max.apply(null, per.map(function (m) { return m.max; })),
        minCharsOnALine: Math.min.apply(null, per.map(function (m) { return m.min; })),
        linesEach: per.map(function (m) { return m.lines; }),
        band: null
      };
      var a = out[row[0]].avgCharsPerLine;
      out[row[0]].band = a < 40 ? 'CHOPPY (<40)' : a > 75 ? 'TOO WIDE (>75)' : 'ok (45-75)';
      if (a >= 40 && a < 45) out[row[0]].band = 'narrow (40-45)';
    });
    return out;
  }

  /* ------------------------------------------- 3. where the actions sit -- */
  /* y is measured from the top of the SCREEN's content (scroll position taken
     out), so it answers "how far down would the reader have to go". */

  var ACTIONS = [
    ['back / pause chevron', '.qback, .tb-back'],
    ['stop', '.qstop'],
    ['speaker: question', '.qask .qspk'],
    ['speaker: any', '.qspk'],
    ['first option', '.qopt'],
    ['last option', '.qopt:last-of-type'],
    ['more about this answer', '.qmore > summary'],
    ['that was a misread', '.qmisread'],
    ['were you sure (first)', '.qconf-b'],
    ['show me in full', '.qshow'],
    ['next / finish', '.qnext'],
    ['got it, ask me', '.qgo'],
    ['done (end of session)', '.qdone'],
    ['another session', '.qagain'],
    ['carry on (paused)', '.qresume'],
    ['end this session (paused)', '.qend'],
    ['start a session', '.qhub-top .btn'],
    ['term chip', '.term-chip'],
    ['big idea row', '.qidea > summary'],
    ['tab bar', '.tabbar, nav.tabs'],
    ['learn tile (first)', '.home-qs .home-q'],
    ['learn tile (last)', '.home-qs .home-q:last-child'],
    ['start a session (landing)', '.lrn-start'],
    ['place chip', '#placeChip'],
    ['read-aloud toggle', '.qset .btn, .qset button']
  ];

  function actionY(el) {
    var b = el.getBoundingClientRect();
    var mb = main ? main.getBoundingClientRect() : { top: 0 };
    var contentTop = b.top - mb.top + (main ? main.scrollTop : 0);
    return { viewportY: Math.round(b.top), contentY: Math.round(contentTop) };
  }

  function actions() {
    var out = [];
    ACTIONS.forEach(function (row) {
      var els = $$(row[1]).filter(visible);
      if (!els.length) return;
      var el = els[0];
      var y = actionY(el);
      out.push({
        action: row[0],
        selector: sel(el),
        n: els.length,
        viewportY: y.viewportY,
        contentY: y.contentY,
        bottomY: y.contentY + Math.round(el.getBoundingClientRect().height),
        aboveFold812: y.contentY + el.getBoundingClientRect().height <= VIEW_H,
        aboveRealFold: y.contentY + el.getBoundingClientRect().height <= FOLD,
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)
      });
    });
    out.sort(function (a, b) { return a.contentY - b.contentY; });
    /* actions the reader cannot reach without first opening a disclosure */
    ACTIONS.forEach(function (row) {
      $$(row[1]).forEach(function (el) {
        var d = inClosedDetails(el);
        if (!d) return;
        if (out.some(function (o) { return o.action === row[0] && o.hiddenBehind; })) return;
        out.push({
          action: row[0], selector: sel(el), n: 1,
          viewportY: null, contentY: null, bottomY: null,
          aboveFold812: false, aboveRealFold: false,
          hiddenBehind: (d.querySelector('summary') || {}).textContent || 'a closed disclosure',
          text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)
        });
      });
    });
    return out;
  }

  /* ----------------------------------------------------- 4. tap targets -- */

  var INTERACTIVE = 'a[href], button, summary, input, select, textarea, label, ' +
    '[role="button"], [tabindex]:not([tabindex="-1"])';

  function taps() {
    var all = $$(INTERACTIVE).filter(visible);
    var rows = all.map(function (el) {
      var b = el.getBoundingClientRect();
      /* a small control inside a <label> is really tapped through the label,
         so report the label's box as the true target */
      var lab = el.tagName === 'INPUT' || el.tagName === 'SELECT'
        ? el.closest('label') : null;
      var lb = lab ? lab.getBoundingClientRect() : null;
      var tw = lb ? Math.max(b.width, lb.width) : b.width;
      var th = lb ? Math.max(b.height, lb.height) : b.height;
      return {
        selector: sel(el),
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 34),
        w: Math.round(b.width), h: Math.round(b.height),
        effectiveW: Math.round(tw), effectiveH: Math.round(th),
        viaLabel: lab ? sel(lab) : null,
        pass: tw >= TAP_MIN - 0.5 && th >= TAP_MIN - 0.5
      };
    });
    var fails = rows.filter(function (r) { return !r.pass; });
    /* smallest gap between two tap targets — crowding costs mis-taps */
    var minGap = null, gapPair = null;
    for (var i = 0; i < all.length; i++) {
      for (var j = i + 1; j < all.length; j++) {
        var a = all[i].getBoundingClientRect(), b2 = all[j].getBoundingClientRect();
        if (all[i].contains(all[j]) || all[j].contains(all[i])) continue;
        var dx = Math.max(0, Math.max(a.left, b2.left) - Math.min(a.right, b2.right));
        var dy = Math.max(0, Math.max(a.top, b2.top) - Math.min(a.bottom, b2.bottom));
        var d = Math.sqrt(dx * dx + dy * dy);
        if (minGap === null || d < minGap) { minGap = d; gapPair = [sel(all[i]), sel(all[j])]; }
      }
    }
    return {
      total: rows.length,
      failing: fails.length,
      fails: fails,
      all: rows,
      minGapPx: minGap === null ? null : r1(minGap),
      minGapBetween: gapPair
    };
  }

  /* -------------------------------------------------------- 5. contrast -- */

  var MEANING = [
    ['question stem', '.qstem'],
    ['option label', '.qopt .qlabel'],
    ['option key letter', '.qkey'],
    ['dimmed option label', '.qopts.is-answered .qopt:not(.is-right):not(.is-chosen) .qlabel'],
    ['dimmed option key', '.qopts.is-answered .qopt:not(.is-right):not(.is-chosen) .qkey'],
    ['answer tag', '.qtag'],
    ['chip', '.qchip'],
    ['answer verdict', '.qverdict'],
    ['answer sentence', '.qsentence'],
    ['source line', '.qsource'],
    ['card foot', '.card-foot'],
    ['card note', '.card-note'],
    ['progress text', '.qprog-t'],
    ['more summary', '.qmore > summary'],
    ['more paragraph', '.qmore-p'],
    ['misread link', '.qmisread'],
    ['were you sure label', '.qconf-l'],
    ['confidence button', '.qconf-b'],
    ['stop button', '.qstop'],
    ['next button', '.qnext'],
    ['lesson title', '.qlesson-t'],
    ['lesson kicker', '.qlesson-n'],
    ['lesson point', '.qlesson-pts li'],
    ['lesson note', '.qlesson-note'],
    ['strand chip', '.qstrand'],
    ['hub sub', '.qhub-sub'],
    ['big idea title', '.qidea-title'],
    ['big idea sub', '.qidea-s'],
    ['term chip', '.term-chip'],
    ['look again item', '.qidea-facts li'],
    ['growth label', '.qgrow-l'],
    ['new idea opened', '.qopened'],
    ['learn lede', '.home-lede'],
    ['tile title', '.hq-q'],
    ['tile sub', '.hq-a'],
    ['timeline fact', '.tl-fact'],
    ['plain sentence', '.lplain']
  ];

  function textContrast() {
    var out = [];
    MEANING.forEach(function (row) {
      var el = $$(row[1]).filter(visible)[0];
      if (!el) return;
      var cs = getComputedStyle(el);
      var fgc = parseColor(cs.color);
      if (!fgc) return;
      var bg = bgOf(el);
      var fg = fgc.a < 1 ? over(fgc, bg) : fgc;
      /* honour an opacity set on an ancestor (dimmed non-chosen options) */
      var op = 1, n = el;
      while (n && n.nodeType === 1) { op *= parseFloat(getComputedStyle(n).opacity || 1); n = n.parentElement; }
      if (op < 1) fg = over({ r: fg.r, g: fg.g, b: fg.b, a: op }, bg);
      var px = parseFloat(cs.fontSize);
      var need = aaNeed(px, cs.fontWeight);
      var rr = ratio(fg, bg);
      out.push({
        role: row[0], selector: row[1],
        fontPx: px, weight: cs.fontWeight,
        ancestorOpacity: r2(op),
        color: cs.color, bg: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')',
        ratio: r2(rr), needAA: need, passAA: rr >= need,
        passAAA: rr >= (need === 3 ? 4.5 : 7)
      });
    });
    /* non-text: the progress bar's fill against its track */
    var fill = document.querySelector('.qprog i');
    if (fill && visible(fill)) {
      var f = parseColor(getComputedStyle(fill).backgroundColor);
      var track = bgOf(fill.parentElement);
      if (f) {
        var fr = f.a < 1 ? over(f, track) : f;
        out.push({
          role: 'progress bar fill vs track', selector: '.qprog i',
          fontPx: null, weight: null, ancestorOpacity: 1,
          color: getComputedStyle(fill).backgroundColor,
          bg: 'rgb(' + [track.r, track.g, track.b].map(Math.round).join(',') + ')',
          ratio: r2(ratio(fr, track)), needAA: 3,
          passAA: ratio(fr, track) >= 3, passAAA: null, nonText: true
        });
      }
      var page = bgOf(fill.parentElement.parentElement || document.body);
      var trk = parseColor(getComputedStyle(fill.parentElement).backgroundColor);
      if (trk) {
        var tr = trk.a < 1 ? over(trk, page) : trk;
        out.push({
          role: 'progress bar track vs page', selector: '.qprog',
          fontPx: null, weight: null, ancestorOpacity: 1,
          color: getComputedStyle(fill.parentElement).backgroundColor,
          bg: 'rgb(' + [page.r, page.g, page.b].map(Math.round).join(',') + ')',
          ratio: r2(ratio(tr, page)), needAA: 3,
          passAA: ratio(tr, page) >= 3, passAAA: null, nonText: true
        });
      }
    }
    /* the answer picture's bar track: the 100% reference the bars are read
       against, so it has to be visible */
    var bfill = document.querySelector('.qbar-t i');
    if (bfill && visible(bfill)) {
      var bf = parseColor(getComputedStyle(bfill).backgroundColor);
      var btrackEl = bfill.parentElement;
      var bt = parseColor(getComputedStyle(btrackEl).backgroundColor);
      var bcard = bgOf(btrackEl.parentElement);
      if (bf && bt) {
        out.push({
          role: 'answer bar fill vs track', selector: '.qbar-t i',
          fontPx: null, weight: null, ancestorOpacity: 1,
          color: getComputedStyle(bfill).backgroundColor,
          bg: getComputedStyle(btrackEl).backgroundColor,
          ratio: r2(ratio(bf, bt)), needAA: 3, passAA: ratio(bf, bt) >= 3,
          passAAA: null, nonText: true
        });
        out.push({
          role: 'answer bar track vs card', selector: '.qbar-t',
          fontPx: null, weight: null, ancestorOpacity: 1,
          color: getComputedStyle(btrackEl).backgroundColor,
          bg: 'rgb(' + [bcard.r, bcard.g, bcard.b].map(Math.round).join(',') + ')',
          ratio: r2(ratio(bt, bcard)), needAA: 3, passAA: ratio(bt, bcard) >= 3,
          passAAA: null, nonText: true
        });
      }
    }
    /* the chosen/right option borders carry meaning too */
    ['.qopt.is-right', '.qopt.is-chosen'].forEach(function (s) {
      var el = document.querySelector(s);
      if (!el || !visible(el)) return;
      var bc = parseColor(getComputedStyle(el).borderTopColor);
      if (!bc) return;
      var bg = bgOf(el.parentElement);
      var c = bc.a < 1 ? over(bc, bg) : bc;
      out.push({
        role: 'option border ' + s, selector: s,
        fontPx: null, weight: null, ancestorOpacity: 1,
        color: getComputedStyle(el).borderTopColor,
        bg: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')',
        ratio: r2(ratio(c, bg)), needAA: 3,
        passAA: ratio(c, bg) >= 3, passAAA: null, nonText: true
      });
    });
    return out;
  }

  /* ---------------------------------------------- 6. the reader's text size */
  /* Two things are being asked:
       (a) does the element's size come from a px literal (so the reader's own
           default-font-size setting does NOTHING), or from rem/em/% (so it
           scales)?  Tested by moving the ROOT font-size and seeing what moves.
       (b) does the layout survive the bigger text — or does something clip?
     The root font-size is restored before returning. */

  var SIZE_PROBE = ['.qstem', '.qopt', '.qopt .qlabel', '.qkey', '.qsentence', '.qtag',
    '.qchip', '.qverdict', '.qmore > summary', '.qmore-p', '.qsource', '.qmisread',
    '.qconf-b', '.qconf-l', '.qnext', '.qprog-t', '.qstop', '.qlesson-t', '.qlesson-ask',
    '.qlesson-pts li', '.qlesson-note', '.qcount', '.qstrand', '.qidea-title', '.qidea-s',
    '.qhub-sub', '.card-foot', '.qpart', 'body'];

  function snapshot() {
    var s = {};
    SIZE_PROBE.forEach(function (q) {
      var el = $$(q).filter(visible)[0];
      if (!el) return;
      var cs = getComputedStyle(el);
      var b = el.getBoundingClientRect();
      s[q] = {
        fontPx: r2(parseFloat(cs.fontSize)),
        h: r1(b.height), w: r1(b.width),
        scrollH: el.scrollHeight, clientH: el.clientHeight
      };
    });
    s.__doc = { scrollHeight: (main || doc).scrollHeight, scrollWidth: (main || doc).scrollWidth };
    return s;
  }

  function textSize() {
    var had = doc.style.fontSize;
    var base = snapshot();
    var res = {};
    [20, 24].forEach(function (px) {
      doc.style.fontSize = px + 'px';
      void doc.offsetHeight;
      res['root' + px] = snapshot();
    });
    doc.style.fontSize = had;
    void doc.offsetHeight;

    var rows = [];
    Object.keys(base).forEach(function (q) {
      if (q === '__doc') return;
      var b = base[q], a20 = res.root20[q], a24 = res.root24[q];
      if (!a20 || !a24) return;
      rows.push({
        selector: q,
        fontAt16: b.fontPx,
        fontAtRoot20: a20.fontPx,
        fontAtRoot24: a24.fontPx,
        scalesWithReaderTextSize: a24.fontPx > b.fontPx + 0.25,
        growthPct: r1(100 * (a24.fontPx - b.fontPx) / b.fontPx)
      });
    });
    var fixed = rows.filter(function (r) { return !r.scalesWithReaderTextSize; });
    return {
      note: 'root font-size moved 16 -> 20 -> 24px, then restored. A selector that ' +
        'does not grow is sized in px and ignores the reader\'s own text-size setting.',
      docScrollHeight: {
        at16: base.__doc.scrollHeight,
        atRoot20: res.root20.__doc.scrollHeight,
        atRoot24: res.root24.__doc.scrollHeight
      },
      measured: rows.length,
      ignoringReaderTextSize: fixed.length,
      allIgnore: fixed.length === rows.length && rows.length > 0,
      rows: rows,
      fixedSelectors: fixed.map(function (r) { return r.selector; })
    };
  }

  /* --------------------------------------------------- 8. reading hazards */

  function flags() {
    var out = { justified: [], italic: [], allCaps: [], textOverImage: [], animated: [], underlinedBody: [] };
    $$('p, li, h1, h2, h3, span, button, summary, div').filter(visible).slice(0, 900)
      .forEach(function (el) {
        var cs = getComputedStyle(el);
        var own = Array.prototype.filter.call(el.childNodes, function (n) {
          return n.nodeType === 3 && /\S/.test(n.nodeValue);
        }).length > 0;
        if (!own) return;
        if (cs.textAlign === 'justify') out.justified.push(sel(el));
        if (cs.fontStyle === 'italic' || cs.fontStyle === 'oblique') out.italic.push(sel(el));
        if (cs.textTransform === 'uppercase') out.allCaps.push(sel(el) + ' "' +
          el.textContent.trim().slice(0, 24) + '"');
        var bi = cs.backgroundImage;
        if (bi && bi !== 'none' && /url\(/.test(bi)) out.textOverImage.push(sel(el));
        if (cs.animationName && cs.animationName !== 'none') {
          out.animated.push(sel(el) + ' @' + cs.animationDuration);
        }
      });
    Object.keys(out).forEach(function (k) {
      out[k] = out[k].filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 25);
    });
    /* labels cut off with an ellipsis: the reader loses the end of the word */
    out.clippedText = $$('*').filter(function (el) {
      if (!visible(el) || el.children.length) return false;
      var cs = getComputedStyle(el);
      if (cs.textOverflow !== 'ellipsis' && cs.overflow === 'visible') return false;
      return el.scrollWidth > el.clientWidth + 1;
    }).slice(0, 20).map(function (el) {
      return sel(el) + ' "' + el.textContent.trim().slice(0, 30) + '"';
    });
    /* line spacing below 1.5, which the BDA guidance asks for */
    out.tightLineHeight = [];
    ['.qopt', '.qlabel', '.qtag', '.qkey', '.qstem', '.qsentence', '.qlesson-pts li',
     '.qchip', '.qmore-p', '.qverdict'].forEach(function (q) {
      var el = $$(q).filter(visible)[0];
      if (!el) return;
      var cs = getComputedStyle(el);
      var fs = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight);
      if (!fs || !lh) return;
      var f = lh / fs;
      if (f < 1.5) out.tightLineHeight.push(q + ' ' + r2(f));
    });
    out.prefersReducedMotionHonoured = (function () {
      var found = false;
      try {
        Array.prototype.forEach.call(document.styleSheets, function (ss) {
          try {
            Array.prototype.forEach.call(ss.cssRules, function (r) {
              if (r.media && /prefers-reduced-motion/.test(r.media.mediaText)) found = true;
            });
          } catch (e) {}
        });
      } catch (e) {}
      return found;
    })();
    return out;
  }

  /* ----------------------------------------------------------- assemble -- */

  return {
    screen: {
      guess: whichScreen(),
      hash: location.hash,
      theme: doc.getAttribute('data-theme') ||
        (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark (system)' : 'light (system)'),
      bodyClass: document.body.className,
      viewport: window.innerWidth + 'x' + window.innerHeight,
      dpr: window.devicePixelRatio,
      at: new Date().toISOString()
    },
    geometry: geometry(),
    lines: lines(),
    actions: actions(),
    taps: taps(),
    contrast: textContrast(),
    textSize: textSize(),
    flags: flags()
  };
})()
