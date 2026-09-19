/* ==========================================================================
   The quiz, on screen.

   Lives inside the Learn tab rather than as another tab: Learn is the one
   place the tool teaches, and a phone has no room for an eighth button.

   Designed phone-first, one question per screen, against the rules the
   dyslexia and engagement reviews set:

     - no timer, no countdown, no streak, no score on the question screen;
     - "Stop here" at every step, and a partial session counts in full;
     - three options, full width, at least 52px tall, each with a spoken form;
     - an optional "how sure are you?" tap - never required, never timed;
     - after an answer: the verdict IN WORDS with an ink icon (never red for
       wrong - red is this tool's colour for decline), one sentence, a
       picture, and the source; everything else behind "Tell me more";
     - "That was a misread" puts the question back unscored, so a place name
       decoded wrongly is not recorded as not knowing the economy;
     - Next ignores taps for 600 ms after the card appears, so a double tap
       cannot skip it - a debounce, not a timer;
     - read-aloud on by default: each question, then each card, is read.

   Version 3 (after Palimpsest): no question twice in a session - a missed
   one comes back another day; when a big idea opens, its short lesson comes
   first and its questions test it; every answer card says which big idea it
   is part of; and the Learn tab shows growth by idea, not a bare count.
   ========================================================================== */

(function (root) {
  'use strict';

  var QU = {};
  var D, C, M, T, A, U, S, B, R, I;

  function init() {
    D = root.GRA.data; C = root.GRA.charts; M = root.GRA.methods;
    T = root.GRA.terms; A = root.GRA.app; U = root.GRA.ui;
    S = root.GRA.quizSched; B = root.GRA.quizBank; R = root.GRA.read;
    I = root.GRA.quizIdeas;
  }
  function esc(s) { return C.esc(s == null ? '' : String(s)); }

  var state = null;                /* the scheduler's persisted state */
  var run = null;                  /* the session in progress, if any */

  /* ------------------------------------------------------------ settings */

  var SET_KEY = 'hinterland.quiz.settings';
  function settings() {
    var d = { read: true, homeER: '' };
    try {
      var raw = root.localStorage && root.localStorage.getItem(SET_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) d[k] = s[k];
      }
    } catch (e) { /* defaults */ }
    return d;
  }
  function saveSettings(s) {
    try { root.localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function st() {
    if (!state) state = S.load();
    return state;
  }

  function homeMap() {
    var er = settings().homeER, m = {};
    if (!er) return m;
    (D.byLevel.CSD || []).forEach(function (p) { if (p.er === er) m[p.code] = true; });
    return m;
  }

  /* ------------------------------------------------------------ session */

  QU.active = function () { return !!run; };

  QU.start = function () {
    init();
    var bank = B.build();
    var now = Date.now();
    var queue = S.plan(st(), bank, now, { home: homeMap() });
    if (!queue.length) return false;
    var before = S.ideas(st(), bank);
    run = { queue: queue, i: 0, phase: 'ask', conf: null, chosen: null,
            asked: 0, right: 0, fresh: 0, learnedNow: 0, missed: [],
            startedLearned: Object.keys(st().learnedIds).length,
            startedCan: S.canAnswer(st()),
            openBefore: Object.keys(before).filter(function (k) { return before[k].open; }) };
    lessonCheck();
    A.render();
    return true;
  };

  function current() {
    return run ? B.build().byId[run.queue[run.i]] : null;
  }

  /* Teach, then test: the first question of a big idea the reader has not
     been introduced to is preceded by that idea's lesson. */
  function lessonCheck() {
    var it = current();
    if (it && it.idea && I && !st().lessons[it.idea]) run.phase = 'lesson';
  }

  function stopReading() { if (R) R.stop(); }

  QU.stop = function () {
    stopReading();
    if (run && run.phase !== 'done') {
      S.endSession(st(), Date.now());
      S.save(st());
      run.phase = 'done';
      A.render();
    }
  };

  QU.leave = function () { run = null; A.render(); };
  QU.phase = function () { return run ? run.phase : null; };

  /* The answer is committed the moment it is chosen - so a back gesture or
     a closed tab cannot lose it (it used to wait for Next, and back then
     reported "You answered 0 questions"). A snapshot is kept, so "that was
     a misread" and the "were you sure?" tap can still undo or re-score it. */
  function snapshot(it) {
    var s = st();
    return { item: s.items[it.id] ? JSON.parse(JSON.stringify(s.items[it.id])) : null,
             learned: s.learnedIds[it.id] || null, seen: s.seen[it.id] || null,
             asked: run.asked, right: run.right, fresh: run.fresh, learnedNow: run.learnedNow,
             missed: run.missed.slice() };
  }
  function undo() {
    var it = current(), u = run.undo;
    if (!it || !u) return;
    var s = st();
    if (u.item) s.items[it.id] = u.item; else delete s.items[it.id];
    if (u.learned) s.learnedIds[it.id] = u.learned; else delete s.learnedIds[it.id];
    if (u.seen) s.seen[it.id] = u.seen; else delete s.seen[it.id];
    run.asked = u.asked; run.right = u.right; run.fresh = u.fresh;
    run.learnedNow = u.learnedNow; run.missed = u.missed;
    run.undo = null;
    S.save(s);
  }
  function commit() {
    var it = current();
    if (!it || run.chosen == null) return;
    run.undo = snapshot(it);
    var now = Date.now();
    var opt = it.options[run.chosen];
    var right = !!opt.correct;
    var before = !!st().learnedIds[it.id];
    if (!st().items[it.id]) run.fresh++;
    S.answer(st(), it, right, now, { conf: run.conf, chose: right ? null : opt.label });
    if (!before && st().learnedIds[it.id]) {
      run.learnedNow++;
      /* a question that has held a week later means its terms have too:
         this is what fades the plain-English scaffolding (terms.js) */
      (it.terms || []).forEach(function (id) { T.record(id, 'held'); });
    }
    run.asked++; if (right) run.right++; else run.missed.push(it.id);
    S.save(st());
  }

  function next() {
    stopReading();
    run.undo = null;
    run.i++;
    run.phase = run.i >= run.queue.length ? 'done' : 'ask';
    run.conf = null; run.chosen = null;
    if (run.phase === 'ask') lessonCheck();
    if (run.phase === 'done') { S.endSession(st(), Date.now()); S.save(st()); }
    A.render();
  }

  /* ------------------------------------------------------------ pictures

     The picture carries the answer; the sentence supports it. Each is drawn
     from the same payloads as the question, and none states a figure the
     card sentence does not already rest on. */
  function bars(rows) {
    var max = rows.length ? rows[0].v : 1;
    return '<div class="qbars">' + rows.map(function (r) {
      return '<div class="qbar-row"><span class="qbar-l">' + esc(r.l) +
        '</span><span class="qbar-t"><i style="width:' +
        Math.max(3, 100 * r.v / (max || 1)) + '%"></i></span>' +
        '<span class="qbar-v">' + esc(r.t) + '</span></div>';
    }).join('') + '</div>';
  }

  function profileRows(code) {
    var v = D.workVec(code, 'total');
    if (!v) return [];
    var t = 0; v.forEach(function (x) { t += x || 0; });
    return v.map(function (x, i) { return { i: i, x: x || 0 }; })
      .sort(function (a, b) { return b.x - a.x; }).slice(0, 5)
      .map(function (r) {
        return { l: D.naics[r.i].short, v: r.x, t: Math.round(100 * r.x / t) + '%' };
      });
  }

  function picture(pic, masked) {
    if (!pic) return '';
    if (pic.kind === 'profile') {
      return '<div class="qpic" data-say="' +
        esc(masked ? 'A place whose jobs are led by ' : 'Jobs led by ') +
        esc(profileRows(pic.code).slice(0, 3).map(function (r) {
          return r.l + ' ' + r.t; }).join(', ')) + '.">' +
        bars(profileRows(pic.code)) + '</div>';
    }
    if (pic.kind === 'occupation') {
      var occ = D.occupationFor(pic.code) || [];
      return '<div class="qpic">' + bars(occ.slice(0, 5).map(function (o) {
        return { l: o.short, v: o.n || 0, t: Math.round(100 * (o.share || 0)) + '%' };
      })) + '</div>';
    }
    if (pic.kind === 'pair') {
      var a = D.byCode[pic.a], b = D.byCode[pic.b];
      var tot = function (c) { var v = D.workVec(c, 'total'), s = 0;
        if (v) v.forEach(function (x) { s += x || 0; }); return s; };
      var rows = [{ l: a.name, v: tot(pic.a) }, { l: b.name, v: tot(pic.b) }]
        .sort(function (x, y) { return y.v - x.v; })
        .map(function (r) { return { l: r.l, v: r.v, t: C.fmt(r.v) }; });
      return '<div class="qpic">' + bars(rows) + '</div>';
    }
    if (pic.kind === 'flows') {
      var tf = D.commute.top_flows[pic.dir === 'out' ? pic.code + '|out' : pic.code] || [];
      return '<div class="qpic">' + bars(tf.filter(function (f) {
        return D.byCode[f[0]] && f[0] !== pic.code; }).slice(0, 4).map(function (f) {
        return { l: D.byCode[f[0]].name, v: f[1], t: C.fmt(f[1]) };
      })) + '</div>';
    }
    if (pic.kind === 'components') {
      var comp = D.componentsFor({ level: 'CD', code: pic.cd });
      if (!comp || !comp.series['2021b']) return '';
      var yrs = D.componentSummary(comp.series['2021b'], '2021b').slice(-5);
      var mx = Math.max.apply(null, yrs.map(function (y) { return Math.abs(y.natural); })) || 1;
      return '<div class="qpic"><div class="qnat">' + yrs.map(function (y) {
        var up = y.natural >= 0;
        return '<div class="qnat-col"><span class="qnat-v">' +
          (up ? '+' : '−') + C.fmt(Math.abs(Math.round(y.natural))) +
          '</span><span class="qnat-bar ' + (up ? 'is-up' : 'is-down') +
          '" style="height:' + Math.max(4, 44 * Math.abs(y.natural) / mx) +
          'px"></span><span class="qnat-y">' + y.year + '</span></div>';
      }).join('') + '</div><p class="qpic-note">Births minus deaths, each year.</p></div>';
    }
    return '';
  }

  function sourceLine(it) {
    if (it.strand === 'E' || it.form === 'concept') {
      return 'From METHODS.md, the statement of every method.';
    }
    if (it.form === 'class-lean' || it.form === 'class-level' || it.form === 'class-fact' ||
        it.form === 'type-area') {
      return 'Statistics Canada, 2021 Census, place of work (98-10-0491), municipalities ' +
        'grouped by 2021 population.';
    }
    if (it.strand === 'D') return 'Statistics Canada, components of population change (17-10-0153).';
    if (it.form === 'occupation') return 'Statistics Canada, 2021 Census, 98-10-0456.';
    if (it.form.indexOf('commute') === 0) return 'Statistics Canada, 2021 Census commuting flows, 98-10-0459.';
    return 'Statistics Canada, 2021 Census, place of work, 98-10-0491.';
  }

  var SHOW_TAB = { bigger: 'overview', howmany: 'overview', fingerprint: 'overview',
    largest: 'structure', occupation: 'overview', concentrated: 'structure',
    'commute-out': 'map', 'commute-in': 'map', twin: 'peers', yesno: 'population',
    'type-which': 'structure', 'big-lean': 'structure' };

  /* ------------------------------------------------------------ render */

  /* ------------------------------------------------------------ render

     The quiz is its own full screen (body.quiz-mode hides the analysis
     header and the tab bar): a slim bar with back, progress and Stop, then
     one question. Every block that speaks has its own speaker button, as in
     Palimpsest - listening is how a dyslexic reader checks a word. */

  var SPEAK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/>' +
    '<path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  function speaker(label) {
    return '<button type="button" class="qspk" aria-label="Read ' + esc(label) + ' aloud">' +
      SPEAK + '</button>';
  }

  function topBar(label) {
    var n = run.queue.length, i = Math.min(run.i + 1, n);
    return '<div class="qbar">' +
      '<button type="button" class="qback" aria-label="Pause">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<div class="qprog" role="progressbar" aria-valuemin="1" aria-valuemax="' + n +
      '" aria-valuenow="' + i + '" aria-label="' + esc(label || ('Question ' + i + ' of ' + n)) + '">' +
      '<i style="width:' + Math.round(100 * (run.phase === 'card' ? i : i - 1) / n) + '%"></i></div>' +
      '<span class="qprog-t">' + esc(label || (i + ' of ' + n)) + '</span>' +
      '<button type="button" class="linkbtn qstop">Stop</button></div>';
  }

  QU.render = function (host) {
    init();
    host.classList.add('quiz-host');
    document.body.classList.add('quiz-mode');
    if (run.phase === 'done') return renderDone(host);
    if (run.phase === 'paused') return renderPaused(host);
    var it = current();
    if (!it) { run.phase = 'done'; return renderDone(host); }
    if (run.phase === 'lesson') return renderLesson(host, it);

    var wrap = document.createElement('div');
    wrap.className = 'quiz-wrap';

    var chip = it.chip.universe + (it.chip.when ? ' · ' + it.chip.when : '');
    var ask = '<div class="qask">' +
      '<p class="qchip" data-say="' + esc(chip.replace(' · ', ', ')) + '.">' +
      esc(chip) + '</p>' +
      '<div class="qline"><h2 class="qstem">' + esc(it.stem) + '</h2>' +
      speaker('the question') + '</div>' +
      (run.phase === 'ask' && it.prompt ? picture(it.prompt, true) : '') +
      '</div>';

    if (run.phase === 'ask') {
      var opts = '<div class="qopts">' + it.options.map(function (o, i) {
        return '<div class="qline"><button type="button" class="qopt" data-i="' + i +
          '" data-say="' + esc(o.say) + '"><span class="qkey" aria-hidden="true">' + o.key +
          '</span><span class="qlabel">' + esc(o.label) + '</span></button>' +
          speaker('option ' + o.key) + '</div>';
      }).join('') + '</div>';
      wrap.innerHTML = topBar() + ask + opts;
      host.appendChild(wrap);
      wireAsk(wrap, it);
      wireSpeakers(wrap);
      autoRead(wrap.querySelector('.qask').parentNode);
      return;
    }

    /* the answer: both marked rows say in WORDS what they are - a dashed
       outline was the only sign of "your answer", and it read as unselected */
    var opt = it.options[run.chosen];
    var right = !!opt.correct;
    var correct = it.options.filter(function (o) { return o.correct; })[0];
    var marked = '<div class="qopts is-answered">' + it.options.map(function (o, i) {
      var mine = i === run.chosen;
      var cls = (o.correct ? ' is-right' : '') + (mine ? ' is-chosen' : '');
      var tag = o.correct && mine ? '✓ Your answer, right'
        : o.correct ? '✓ Right answer' : mine ? '✕ Your answer' : '';
      return '<div class="qopt' + cls + '"><span class="qkey" aria-hidden="true">' +
        o.key + '</span><span class="qlabel">' + esc(o.label) +
        (tag ? '<span class="qtag">' + tag + '</span>' : '') + '</span></div>';
    }).join('') + '</div>';

    var verdict = right ? 'Right: ' + correct.label + '.'
      : 'You chose ' + opt.label + '. The answer is ' + correct.label + '.';
    var moreBits = (it.card.more ? '<p class="qmore-p">' + esc(it.card.more) + '</p>' : '') +
      (it.idea && I ? '<p class="qpart">Part of the big idea <b>' +
        esc(I.byId[it.idea].title) + '</b></p>' : '') +
      '<div class="qterms"></div>' +
      (it.place ? '<button type="button" class="linkbtn qshow">Show me ' +
        esc(D.byCode[it.place] ? D.byCode[it.place].name : '') + ' in full</button>' : '') +
      '<p class="qsource">' + esc(sourceLine(it)) + '</p>' +
      '<button type="button" class="linkbtn qmisread">That was a misread: ask me again</button>';
    var conf = '<div class="qconf" role="group" aria-label="Were you sure? Optional">' +
      '<span class="qconf-l">Were you sure? (optional)</span>' +
      [['sure', 'Sure'], ['think', 'Think so'], ['guess', 'Guessed']].map(function (c) {
        return '<button type="button" class="qconf-b" data-conf="' + c[0] +
          '" aria-pressed="' + (run.conf === c[0]) + '">' + c[1] + '</button>';
      }).join('') + '</div>';
    var card = '<div class="qcard" role="status">' +
      '<div class="qline"><p class="qverdict ' + (right ? 'is-right' : 'is-wrong') + '">' +
      '<span class="qvicon" aria-hidden="true">' + (right ? '✓' : '✕') + '</span>' +
      '<span>' + esc(verdict) + '</span></p>' + speaker('the answer') + '</div>' +
      '<p class="qsentence">' + esc(it.card.sentence) + '</p>' +
      picture(it.card.picture, false) +
      conf +
      '<details class="qmore"><summary>More about this answer</summary>' + moreBits +
      '</details>' +
      /* Next is the LAST thing, in the flow: never a bar pinned over the
         card (which covered its text), and never above the card's own
         details (which then went unseen) */
      '<div class="qnextbar"><button type="button" class="btn btn-primary qnext">' +
      (run.i + 1 >= run.queue.length ? 'Finish' : 'Next') + '</button></div>' +
      '</div>';
    wrap.innerHTML = topBar() + ask + marked + card;
    host.appendChild(wrap);
    wireCard(wrap, it);
    wireSpeakers(wrap);
    autoRead(wrap.querySelector('.qcard'));
  };

  function autoRead(node) {
    if (!R || !R.available() || !settings().read || !node) return;
    setTimeout(function () { R.start(node); }, 60);
  }

  /* each speaker reads the element it sits beside */
  function wireSpeakers(wrap) {
    Array.prototype.forEach.call(wrap.querySelectorAll('.qspk'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!R) return;
        var line = b.closest('.qline, li');
        var target = line && (line.querySelector('[data-say], .qstem, .qverdict, .qlesson-p') || line);
        if (line && line.tagName === 'LI') target = line.querySelector('.qlesson-p') || line;
        R.one(target);
      });
    });
  }

  function wireCommon(wrap) {
    var s = wrap.querySelector('.qstop');
    if (s) s.addEventListener('click', QU.stop);
    var b = wrap.querySelector('.qback');
    if (b) b.addEventListener('click', QU.pause);
  }

  function wireAsk(wrap, it) {
    wireCommon(wrap);
    wrap.querySelectorAll('.qopt').forEach(function (b) {
      b.addEventListener('click', function () {
        stopReading();
        run.chosen = +b.getAttribute('data-i');
        commit();                       /* counted now, so back can't lose it */
        run.phase = 'card';
        run.cardAt = Date.now();
        A.render();
      });
    });
  }

  function wireCard(wrap, it) {
    wireCommon(wrap);
    var nx = wrap.querySelector('.qnext');
    nx.addEventListener('click', function () {
      if (Date.now() - (run.cardAt || 0) < 600) return;   /* debounce, not a timer */
      next();
    });
    wrap.querySelector('.qmisread').addEventListener('click', function () {
      stopReading();
      undo();
      run.chosen = null; run.phase = 'ask';
      A.render();
    });
    wrap.querySelectorAll('.qconf-b').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = b.getAttribute('data-conf');
        run.conf = run.conf === c ? null : c;
        /* re-score the same answer with the confidence given */
        undo(); commit();
        wrap.querySelectorAll('.qconf-b').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x.getAttribute('data-conf') === run.conf));
        });
      });
    });
    var terms = wrap.querySelector('.qterms');
    if (terms && it.terms && it.terms.length && root.GRA.learn) {
      terms.appendChild(root.GRA.learn.chips(it.terms));
    }
    var show = wrap.querySelector('.qshow');
    if (show) show.addEventListener('click', function () {
      stopReading();
      var tab = SHOW_TAB[it.form] || 'overview';
      run = null;
      document.body.classList.remove('quiz-mode');
      A.setPlace(it.place);
      A.go(tab);
    });
  }

  /* ------------------------------------------------------------ paused */

  QU.pause = function () {
    if (!run || run.phase === 'done') return;
    stopReading();
    if (run.phase !== 'paused') { run.resumeTo = run.phase; run.phase = 'paused'; }
    A.render();
  };

  function renderPaused(host) {
    var wrap = document.createElement('div');
    wrap.className = 'quiz-wrap';
    var n = run.queue.length;
    wrap.innerHTML = topBar('Paused') +
      '<div class="qpaused"><h2 class="qlesson-t">Paused at question ' +
      Math.min(run.i + 1, n) + ' of ' + n + '</h2>' +
      '<p class="qlesson-ask">Everything you have answered is saved.</p>' +
      '<div class="qnextbar"><button type="button" class="btn btn-primary qresume">Carry on</button></div>' +
      '<div class="qnextbar"><button type="button" class="btn qend">End this session</button></div></div>';
    host.appendChild(wrap);
    wireCommon(wrap);
    wrap.querySelector('.qresume').addEventListener('click', function () {
      run.phase = run.resumeTo || 'ask'; A.render();
    });
    wrap.querySelector('.qend').addEventListener('click', QU.stop);
  }

  /* ------------------------------------------------------------ lesson */

  function renderLesson(host, it) {
    var idea = I.byId[it.idea];
    var pts = I.lesson(it.idea);
    var wrap = document.createElement('div');
    wrap.className = 'quiz-wrap';
    wrap.innerHTML = topBar('New big idea') +
      '<div class="qlesson">' +
      '<p class="qlesson-n">Big idea ' + idea.n + ' of ' + I.IDEAS.length + '</p>' +
      '<div class="qline"><h2 class="qlesson-t">' + esc(idea.title) + '</h2>' +
      speaker('the title') + '</div>' +
      '<p class="qlesson-ask">' + esc(idea.ask) + '</p>' +
      '<ul class="qlesson-pts">' + pts.map(function (p) {
        return '<li class="qline"><span class="qlesson-p">' + p + '</span>' +
          speaker('this point') + '</li>'; }).join('') + '</ul>' +
      '<p class="qlesson-note">The next questions test this, then go further.</p>' +
      '</div>' +
      '<div class="qnextbar"><button type="button" class="btn btn-primary qgo">' +
      'Got it, ask me</button></div>';
    host.appendChild(wrap);
    wireCommon(wrap);
    wireSpeakers(wrap);
    var shownAt = Date.now();
    wrap.querySelector('.qgo').addEventListener('click', function () {
      if (Date.now() - shownAt < 600) return;          /* debounce, not a timer */
      stopReading();
      st().lessons[it.idea] = Date.now();
      S.save(st());
      run.phase = 'ask';
      A.render();
    });
    autoRead(wrap.querySelector('.qlesson'));
  }

  /* ------------------------------------------------------------ done */

  function renderDone(host) {
    var bank = B.build();
    var can = S.canAnswer(st());
    var up = can - (run.startedCan || 0);
    var status = S.ideas(st(), bank);
    var opened = Object.keys(status).filter(function (k) {
      return status[k].open && run.openBefore.indexOf(k) < 0;
    });
    var c = U.card('Session finished', null);
    c.appendChild(U.h('<div class="quiz-wrap">' +
      '<p class="qsentence">You answered ' + run.asked + ' question' +
      (run.asked === 1 ? '' : 's') + (run.fresh ? ', ' + run.fresh + ' of them new' : '') +
      '.</p>' +
      '<div class="qgrow"><div class="qgrow-v">' + can + '</div>' +
      '<div class="qgrow-l">questions you can answer now' +
      (up > 0 ? ', <b>up ' + up + '</b> this session' : '') + '</div></div>' +
      (run.learnedNow ? '<p class="explain-plain">' + run.learnedNow + ' held from a week ' +
        'or more ago, so they now count as learned for good.</p>' : '') +
      (run.missed.length ? '<h3 class="subh" style="margin-top:14px">Look again at</h3>' +
        '<ul class="qidea-facts">' + run.missed.slice(0, 3).map(function (id) {
          var it = bank.byId[id];
          return it ? '<li>' + esc(it.card.sentence) + '</li>' : '';
        }).join('') + '</ul><p class="card-foot">These come back on another day.</p>' : '') +
      opened.map(function (k) {
        return '<p class="qopened">New big idea opened: <b>' + esc(status[k].title) +
          '</b>.' + (st().lessons[k] ? '' : ' Its short lesson comes first next time.') +
          '</p>';
      }).join('') +
      '<div class="qnextbar"><button type="button" class="btn btn-primary qdone">Done' +
      '</button></div><div class="qnextbar"><button type="button" class="btn qagain">' +
      'Another session</button></div></div>'));
    host.appendChild(c);
    c.querySelector('.qagain').addEventListener('click', function () {
      run = null;
      if (!QU.start()) { A.render(); }
    });
    c.querySelector('.qdone').addEventListener('click', QU.leave);
  }

  /* ------------------------------------------------------------ hub

     The Learn tab's front: what you can answer, how that has grown, and the
     nine big ideas - which are open, how far in you are, and what you have
     learned in each, as plain statements. No due counts, no streaks. */

  function growthChart(hist) {
    if (!hist || hist.length < 2) return '';
    var max = Math.max.apply(null, hist.map(function (h) { return h.can; })) || 1;
    return '<div class="qchart" role="img" aria-label="Questions you could answer, ' +
      'day by day: ' + hist.map(function (h) { return h.can; }).join(', ') + '.">' +
      hist.map(function (h) {
        return '<span class="qchart-b' + (h.today ? ' is-today' : '') + '" style="height:' +
          Math.max(4, 100 * h.can / max) + '%" title="' + esc(h.day) + ': ' + h.can + '"></span>';
      }).join('') + '</div><p class="qchart-l">Questions you could answer, on each day ' +
      'you played.</p>';
  }

  function learnedFacts(ideaId, bank, n) {
    var s = st();
    return (bank.byIdea[ideaId] || []).filter(function (it) {
      var r = s.items[it.id]; return r && r.right;
    }).sort(function (a, b) { return s.items[b.id].last - s.items[a.id].last; })
      .slice(0, n || 4).map(function (it) { return it.card.sentence; });
  }

  QU.hub = function (mode) {
    init();
    var s = st(), set = settings();
    var bank = B.build();
    var prog = S.progress(s, bank);
    var c = U.card(null, null);

    var weekUp = prog.weekAgoCan != null ? prog.can - prog.weekAgoCan : null;
    var head = '<div class="qhub-top">' +
      '<button type="button" class="btn btn-primary qstart">' +
      (s.sessions ? 'Start a session' : 'Start your first session') + '</button>' +
      '<p class="qhub-sub">About twelve questions. No timer, no score; stop whenever ' +
      'you like.</p></div>';
    var nums = s.sessions ? '<div class="qhub-nums">' +
      '<div><div class="qgrow-v">' + prog.can + '</div><div class="qgrow-l">you can ' +
      'answer now' + (weekUp > 0 ? ', up ' + weekUp + ' on a week ago' : '') + '</div></div>' +
      (prog.learned ? '<div><div class="qgrow-v">' + prog.learned + '</div><div class="qgrow-l">' +
        'held for a week or more</div></div>' : '') +
      (prog.turned ? '<div><div class="qgrow-v">' + prog.turned + '</div><div class="qgrow-l">' +
        'missed once, right later</div></div>' : '') +
      '</div>' + growthChart(prog.history) : '';

    var ideas = I ? I.IDEAS.map(function (idea) {
      var x = prog.ideas[idea.id];
      var status = !x.open ? 'Opens as you learn the one before'
        : x.met === 0 ? 'Open, not started'
        : x.can + ' you can answer · ' + ['', 'basics open', 'basics and places open',
            'everything open'][x.level];
      var facts = x.open ? learnedFacts(idea.id, bank, 4) : [];
      var lesson = x.open ? I.lesson(idea.id) : [];
      return '<details class="qidea' + (x.open ? '' : ' is-locked') + '">' +
        '<summary><span class="qidea-n">' + idea.n + '</span>' +
        '<span class="qidea-t"><span class="qidea-title">' + esc(idea.title) + '</span>' +
        '<span class="qidea-s">' + esc(status) + '</span>' +
        (x.open ? '<span class="qidea-bars" aria-hidden="true">' + [1, 2, 3].map(function (L) {
          var lv = x.levels[L];
          var w = lv.total ? Math.round(100 * lv.can / lv.total) : 0;
          return '<span class="qidea-bar' + (L > x.level ? ' is-shut' : '') + '"><i style="width:' +
            (lv.can ? Math.max(6, w) : 0) + '%"></i></span>';
        }).join('') + '</span><span class="qidea-key">Basics · Places · Surprises</span>' : '') +
        '</span></summary>' +
        (x.open ? '<div class="qidea-body">' +
          '<p class="qidea-ask">' + esc(idea.ask) + '</p>' +
          '<ul class="qlesson-pts">' + lesson.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ul>' +
          (facts.length ? '<p class="qidea-h">What you have learned here</p><ul class="qidea-facts">' +
            facts.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '') +
          '</div>' : '') +
        '</details>';
    }).join('') : '';

    var body = document.createElement('div');
    var showIdeas = mode !== 'practise';
    var showPractise = mode !== 'ideas';
    body.innerHTML = (showPractise ? head + nums : '') +
      (showIdeas ? '<p class="card-note" style="margin-top:4px">Each question is part of one ' +
        'of these. They open in order, from what many people know to what only the data ' +
        'shows. Tap one to see its lesson and what you have learned.</p>' +
        '<div class="qideas">' + ideas + '</div>' : '') +
      (showPractise ? '' : '<div hidden>') +
      '<details class="qsettings"><summary>Settings</summary><div class="qset">' +
      '<label class="toggle"><input type="checkbox" class="qread"' +
      (set.read ? ' checked' : '') + '> Read each question to me</label>' +
      '<label class="toggle"><input type="checkbox" class="qjump"' +
      (s.jumpAhead ? ' checked' : '') + '> Open every big idea now</label>' +
      '<label class="qhome">Your home region: <select class="sel qhomesel">' +
      '<option value="">None</option>' +
      Object.keys(D.geo.er_names).sort(function (a, b) {
        return D.geo.er_names[a] < D.geo.er_names[b] ? -1 : 1;
      }).map(function (er) {
        return '<option value="' + er + '"' + (set.homeER === er ? ' selected' : '') +
          '>' + esc(String(D.geo.er_names[er]).split(' / ')[0].replace(/--/g, '–')) + '</option>';
      }).join('') + '</select></label>' +
      '<p class="card-foot">Questions about your home region come first: new facts ' +
      'stick better when they attach to places you know.</p></div></details>' +
      (showPractise ? '' : '</div>');
    c.appendChild(body);

    var qs = body.querySelector('.qstart');
    if (qs) qs.addEventListener('click', function () {
      if (!QU.start()) qs.textContent = 'Nothing new just now. Come back later.';
    });
    body.querySelector('.qread').addEventListener('change', function (e) {
      var x = settings(); x.read = e.target.checked; saveSettings(x);
    });
    body.querySelector('.qjump').addEventListener('change', function (e) {
      s.jumpAhead = e.target.checked; S.save(s); A.render();
    });
    body.querySelector('.qhomesel').addEventListener('change', function (e) {
      var x = settings(); x.homeER = e.target.value; saveSettings(x);
    });
    return c;
  };

  root.GRA = root.GRA || {};
  root.GRA.quizUI = QU;
}(this));
