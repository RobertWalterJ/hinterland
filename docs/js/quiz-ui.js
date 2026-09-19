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

   A missed question comes back once, a few questions later in the same
   session - the learning step the scheduler simulation showed was needed.
   ========================================================================== */

(function (root) {
  'use strict';

  var QU = {};
  var D, C, M, T, A, U, S, B, R;

  function init() {
    D = root.GRA.data; C = root.GRA.charts; M = root.GRA.methods;
    T = root.GRA.terms; A = root.GRA.app; U = root.GRA.ui;
    S = root.GRA.quizSched; B = root.GRA.quizBank; R = root.GRA.read;
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
    run = { queue: queue, i: 0, phase: 'ask', conf: null, chosen: null,
            reasked: {}, asked: 0, right: 0, fresh: 0, learnedNow: 0,
            startedLearned: Object.keys(st().learnedIds).length };
    A.render();
    return true;
  };

  function current() {
    return run ? B.build().byId[run.queue[run.i]] : null;
  }

  function stopReading() { if (R) R.stop(); }

  QU.stop = function () {
    stopReading();
    if (run) {
      S.endSession(st(), Date.now());
      S.save(st());
      run.phase = 'done';
      A.render();
    }
  };

  QU.leave = function () { run = null; A.render(); };

  /* Commit the pending answer - only when Next is pressed, so "that was a
     misread" can still withdraw it. */
  function commit() {
    var it = current();
    if (!it || run.chosen == null) return;
    var now = Date.now();
    var opt = it.options[run.chosen];
    var right = !!opt.correct;
    var isReask = run.reasked[it.id] === 'pending-shown';
    if (isReask) {
      S.reasked(st(), it, right, now);
      run.reasked[it.id] = 'done';
    } else {
      var before = !!st().learnedIds[it.id];
      if (!st().items[it.id]) run.fresh++;
      S.answer(st(), it, right, now, { conf: run.conf, chose: right ? null : opt.label });
      if (!before && st().learnedIds[it.id]) {
        run.learnedNow++;
        /* a question that has held a week later means its terms have too:
           this is what fades the plain-English scaffolding (terms.js) */
        (it.terms || []).forEach(function (id) { T.record(id, 'held'); });
      }
      if (!right && !run.reasked[it.id]) {
        run.reasked[it.id] = 'pending';
        run.queue.splice(S.reaskPosition(run.queue, run.i), 0, it.id);
      }
    }
    run.asked++; if (right) run.right++;
    S.save(st());
  }

  function next() {
    stopReading();
    commit();
    run.i++;
    run.phase = run.i >= run.queue.length ? 'done' : 'ask';
    run.conf = null; run.chosen = null;
    var nxt = current();
    if (nxt && run.reasked[nxt.id] === 'pending') run.reasked[nxt.id] = 'pending-shown';
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
    if (it.strand === 'E') return 'From METHODS.md, the statement of every method.';
    if (it.strand === 'D') return 'Statistics Canada, components of population change (17-10-0153).';
    if (it.form === 'occupation') return 'Statistics Canada, 2021 Census, 98-10-0456.';
    if (it.form.indexOf('commute') === 0) return 'Statistics Canada, 2021 Census commuting flows, 98-10-0459.';
    return 'Statistics Canada, 2021 Census, place of work, 98-10-0491.';
  }

  var SHOW_TAB = { bigger: 'overview', howmany: 'overview', fingerprint: 'overview',
    largest: 'structure', occupation: 'overview', concentrated: 'structure',
    'commute-out': 'map', 'commute-in': 'map', twin: 'peers', yesno: 'population' };

  /* ------------------------------------------------------------ render */

  QU.render = function (host) {
    init();
    host.classList.add('quiz-host');
    if (run.phase === 'done') return renderDone(host);
    var it = current();
    if (!it) { run.phase = 'done'; return renderDone(host); }

    var wrap = document.createElement('div');
    wrap.className = 'quiz-wrap';

    var top = '<div class="qtop"><span class="qcount">Question ' + (run.i + 1) +
      ' of ' + run.queue.length + '</span>' +
      '<button type="button" class="linkbtn qstop">Stop here</button></div>';

    var chip = it.chip.universe + (it.chip.when ? ' · ' + it.chip.when : '');
    var ask = '<div class="qask">' +
      '<p class="qchip" data-say="' + esc(chip.replace(' · ', ', ')) + '.">' +
      esc(chip) + '</p>' +
      '<h2 class="qstem">' + esc(it.stem) + '</h2>' +
      (it.prompt ? picture(it.prompt, true) : '') +
      '</div>';

    if (run.phase === 'ask') {
      var conf = '<div class="qconf" role="group" aria-label="How sure are you? Optional">' +
        '<span class="qconf-l">How sure are you? (optional)</span>' +
        [['sure', 'Sure'], ['think', 'Think so'], ['guess', 'Guessing']].map(function (c) {
          return '<button type="button" class="qconf-b" data-conf="' + c[0] +
            '" aria-pressed="' + (run.conf === c[0]) + '">' + c[1] + '</button>';
        }).join('') + '</div>';
      var opts = '<div class="qopts">' + it.options.map(function (o, i) {
        return '<button type="button" class="qopt" data-i="' + i + '" data-say="' +
          esc(o.say) + '"><span class="qkey" aria-hidden="true">' + o.key +
          '</span><span class="qlabel">' + esc(o.label) + '</span></button>';
      }).join('') + '</div>';
      wrap.innerHTML = top + ask + conf + opts;
      host.appendChild(wrap);
      wireAsk(wrap, it);
      autoRead(wrap.querySelector('.qask').parentNode);
      return;
    }

    /* the card */
    var opt = it.options[run.chosen];
    var right = !!opt.correct;
    var correct = it.options.filter(function (o) { return o.correct; })[0];
    var marked = '<div class="qopts is-answered">' + it.options.map(function (o, i) {
      var cls = o.correct ? ' is-right' : (i === run.chosen ? ' is-chosen' : '');
      var mark = o.correct ? '<span class="qmark" aria-hidden="true">✓</span>'
        : (i === run.chosen ? '<span class="qmark" aria-hidden="true">✕</span>' : '');
      return '<div class="qopt' + cls + '"><span class="qkey" aria-hidden="true">' +
        o.key + '</span><span class="qlabel">' + esc(o.label) + '</span>' + mark + '</div>';
    }).join('') + '</div>';

    var verdict = right ? 'Right.'
      : 'Not this time — it’s ' + correct.label + '.';
    var more = '';
    if (it.card.more || (it.terms && it.terms.length) || it.place) {
      more = '<details class="qmore"><summary>Tell me more</summary>' +
        (it.card.more ? '<p class="qmore-p">' + esc(it.card.more) + '</p>' : '') +
        (!right ? '<p class="qmore-p">You chose ' + esc(opt.label) + '.</p>' : '') +
        '<div class="qterms"></div>' +
        (it.place ? '<button type="button" class="linkbtn qshow">Show me ' +
          esc(D.byCode[it.place] ? D.byCode[it.place].name : '') + ' in full</button>' : '') +
        '</details>';
    }
    var card = '<div class="qcard" role="status">' +
      '<p class="qverdict ' + (right ? 'is-right' : 'is-wrong') + '">' +
      '<span class="qvicon" aria-hidden="true">' + (right ? '✓' : '✕') + '</span>' +
      esc(verdict) + '</p>' +
      '<p class="qsentence">' + esc(it.card.sentence) + '</p>' +
      picture(it.card.picture, false) +
      '<p class="qsource">' + esc(sourceLine(it)) + '</p>' +
      more +
      '<button type="button" class="linkbtn qmisread">That was a misread — ask me again</button>' +
      '</div>';
    var bar = '<div class="qnextbar"><button type="button" class="btn btn-primary qnext">' +
      (run.i + 1 >= run.queue.length ? 'Finish' : 'Next') + '</button></div>';

    wrap.innerHTML = top + ask.replace(picture(it.prompt, true), '') + marked + card + bar;
    host.appendChild(wrap);
    wireCard(wrap, it);
    autoRead(wrap.querySelector('.qcard'));
  };

  function autoRead(node) {
    if (!R || !R.available() || !settings().read || !node) return;
    setTimeout(function () { R.start(node); }, 60);
  }

  function wireCommon(wrap) {
    wrap.querySelector('.qstop').addEventListener('click', QU.stop);
  }

  function wireAsk(wrap, it) {
    wireCommon(wrap);
    wrap.querySelectorAll('.qconf-b').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = b.getAttribute('data-conf');
        run.conf = run.conf === c ? null : c;
        wrap.querySelectorAll('.qconf-b').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x.getAttribute('data-conf') === run.conf));
        });
      });
    });
    wrap.querySelectorAll('.qopt').forEach(function (b) {
      b.addEventListener('click', function () {
        stopReading();
        run.chosen = +b.getAttribute('data-i');
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
      run.chosen = null; run.phase = 'ask';
      A.render();
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
      A.setPlace(it.place);
      A.go(tab);
    });
  }

  function renderDone(host) {
    var n = Object.keys(st().learnedIds).length;
    var c = U.card('Session finished', null);
    c.appendChild(U.h('<div class="quiz-wrap"><p class="qsentence">You answered ' +
      run.asked + ' question' + (run.asked === 1 ? '' : 's') +
      (run.fresh ? ', ' + run.fresh + ' of them new to you' : '') + '.' +
      (run.learnedNow ? ' ' + run.learnedNow + ' held from a week or more ago, ' +
        'so they now count as learned.' : '') + '</p>' +
      '<p class="explain-plain">Learned so far: <b>' + n + '</b>. That number only ' +
      'ever goes up. A question counts as learned when you answer it a week or ' +
      'more after first meeting it.</p>' +
      '<div class="ctlrow"><button type="button" class="btn btn-primary qagain">' +
      'Another session</button><button type="button" class="btn qback">Back to Learn' +
      '</button></div></div>'));
    host.appendChild(c);
    c.querySelector('.qagain').addEventListener('click', function () {
      run = null; QU.start();
    });
    c.querySelector('.qback').addEventListener('click', QU.leave);
  }

  /* ------------------------------------------------------------ hub */

  QU.hub = function () {
    init();
    var s = st(), set = settings();
    var prog = S.progress(s);
    var names = { A: 'Size', B: 'What people do', C: 'Connections',
                  D: 'The long view', E: 'Methods' };
    var c = U.card('Quiz', 'Short sessions of about twelve questions. No ' +
      'timer, no score, and you can stop at any point. Every answer is drawn ' +
      'from the same Statistics Canada data as the rest of the tool.');

    var body = document.createElement('div');
    body.innerHTML =
      '<div class="ctlrow" style="margin:6px 0 12px">' +
      '<button type="button" class="btn btn-primary qstart">' +
      (s.sessions ? 'Start a session' : 'Start your first session') + '</button></div>' +
      '<p class="explain-plain">Learned so far: <b>' + prog.learned + '</b>' +
      (prog.seen ? ' of the ' + prog.seen + ' questions you have met.' : '.') + '</p>' +
      '<div class="qstrands">' + Object.keys(names).map(function (k) {
        return '<span class="qstrand"><b>' + (prog.byStrand[k] || 0) + '</b> ' +
          esc(names[k]) + '</span>';
      }).join('') + '</div>' +
      '<div class="qset">' +
      '<label class="toggle"><input type="checkbox" class="qread"' +
      (set.read ? ' checked' : '') + '> Read each question to me</label>' +
      '<label class="toggle"><input type="checkbox" class="qjump"' +
      (s.jumpAhead ? ' checked' : '') + '> Open every kind of question now</label>' +
      '<label class="qhome">Your home region: <select class="sel qhomesel">' +
      '<option value="">None</option>' +
      Object.keys(D.geo.er_names).sort(function (a, b) {
        return D.geo.er_names[a] < D.geo.er_names[b] ? -1 : 1;
      }).map(function (er) {
        return '<option value="' + er + '"' + (set.homeER === er ? ' selected' : '') +
          '>' + esc(D.geo.er_names[er]) + '</option>';
      }).join('') + '</select></label></div>' +
      '<p class="card-foot">Questions about your home region come first: ' +
      'new facts stick better when they attach to places you know.</p>';
    c.appendChild(body);

    body.querySelector('.qstart').addEventListener('click', function () {
      if (!QU.start()) {
        body.querySelector('.qstart').textContent = 'Nothing is due just now';
      }
    });
    body.querySelector('.qread').addEventListener('change', function (e) {
      var x = settings(); x.read = e.target.checked; saveSettings(x);
    });
    body.querySelector('.qjump').addEventListener('change', function (e) {
      s.jumpAhead = e.target.checked; S.save(s);
    });
    body.querySelector('.qhomesel').addEventListener('change', function (e) {
      var x = settings(); x.homeER = e.target.value; saveSettings(x);
    });
    return c;
  };

  root.GRA = root.GRA || {};
  root.GRA.quizUI = QU;
}(this));
