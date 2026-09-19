/* ==========================================================================
   Learning: the plain-English layer, and the Learn tab.

   `explain()` is the one component every panel uses to put a number in front
   of a reader. It carries the four layers from terms.js:

     1. what it says          a plain sentence about THIS place      shown
     2. what it's called      the term, as a chip, with the value    shown
     3. how it works          on tap
     4. when to use it, and what it cannot tell you                  on tap

   As a term is learned, layer 1 steps back and layer 2 leads - the interface
   visibly gets less wordy as the reader gets more fluent. Nothing is ever
   hidden for good: "explain again" brings a faded term back.

   The Learn tab is the other half: the method map (which question each method
   answers), and every term with its status - new, being met, learned, or
   already known. Wherever the current place has a figure for a term, the
   entry shows the method applied to that place, because a definition without
   an instance is the part nobody remembers.
   ========================================================================== */

(function (root) {
  'use strict';

  var L = {};
  var T, C, D, M, U, A;

  function init() {
    T = root.GRA.terms; C = root.GRA.charts; D = root.GRA.data;
    M = root.GRA.methods; U = root.GRA.ui; A = root.GRA.app;
  }

  function esc(s) { return C.esc(s == null ? '' : String(s)); }

  var seq = 0;

  /* ------------------------------------------------------------ explain */

  L.explain = function (id, plainHTML, opts) {
    init();
    opts = opts || {};
    var t = T.byId[id];
    var wrap = document.createElement('div');
    if (!t) {
      wrap.innerHTML = '<p class="explain-plain">' + plainHTML + '</p>';
      return wrap;
    }
    T.record(id, 'met');
    var faded = T.faded(id);
    var panelId = 'xp-' + id + '-' + (++seq);
    var label = t.name + (opts.value != null ? ': ' + opts.value : '');

    wrap.className = 'explain' + (faded ? ' is-faded' : '');
    var plain = '<p class="explain-plain">' + plainHTML + '</p>';
    var chip = '<button type="button" class="term-chip" aria-expanded="false" ' +
      'aria-controls="' + panelId + '" data-say="' +
      esc(label + '. Tap to learn what this means.') + '">' +
      '<span class="term-name">' + esc(label) + '</span>' +
      '<span class="term-i" aria-hidden="true">?</span></button>';
    wrap.innerHTML = faded ? chip + plain : plain + chip;

    var more = document.createElement('div');
    more.className = 'explain-more';
    more.id = panelId;
    more.hidden = true;
    more.innerHTML = layers(t) + actions(t, faded);
    wrap.appendChild(more);

    var btn = wrap.querySelector('.term-chip');
    btn.addEventListener('click', function () {
      var open = more.hidden;
      more.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) T.record(id, 'opened');
    });
    wireActions(more, t);
    return wrap;
  };

  function layers(t) {
    return '<dl class="layers">' +
      '<dt>How it works</dt><dd>' + esc(t.how) + '</dd>' +
      '<dt>When to use it</dt><dd>' + esc(t.when) + '</dd>' +
      '<dt>What it cannot tell you</dt><dd>' + esc(t.cant) + '</dd>' +
      '</dl>';
  }

  function actions(t, faded) {
    return '<div class="layer-actions">' +
      (faded
        ? '<button type="button" class="linkbtn" data-act="again">Explain it in full again</button>'
        : '<button type="button" class="linkbtn" data-act="know">I know this one</button>') +
      '<button type="button" class="linkbtn" data-act="learn">More in Learn</button>' +
      '</div>';
  }

  function wireActions(host, t) {
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'know') { T.record(t.id, 'know'); A.render(); }
      if (act === 'again') { T.record(t.id, 'again'); A.render(); }
      if (act === 'learn') {
        A.state.learnFocus = t.id;
        A.go('learn');
      }
    });
  }

  /* ------------------------------------------------------------- chips

     A row of term chips with no plain sentence, for places where the plain
     reading is already on screen - a hero tile, a gloss - and only the names
     and their layers need adding. One opens at a time, below the row. */
  L.chips = function (ids, opts) {
    init();
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'chiprow';
    if (opts.label) {
      wrap.appendChild(Object.assign(document.createElement('span'),
        { className: 'chiprow-label', textContent: opts.label }));
    }
    var panel = document.createElement('div');
    panel.className = 'explain-more';
    panel.hidden = true;
    var openId = null;
    ids.forEach(function (id) {
      var t = T.byId[id];
      if (!t) return;
      T.record(id, 'met');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'term-chip';
      b.setAttribute('aria-expanded', 'false');
      b.setAttribute('data-say', t.name + '. Tap to learn what this means.');
      b.innerHTML = '<span class="term-name">' + esc(t.name) + '</span>' +
        '<span class="term-i" aria-hidden="true">?</span>';
      b.addEventListener('click', function () {
        var closing = openId === id;
        Array.prototype.forEach.call(wrap.querySelectorAll('.term-chip'),
          function (x) { x.setAttribute('aria-expanded', 'false'); });
        if (closing) { panel.hidden = true; openId = null; return; }
        openId = id;
        panel.innerHTML = '<p class="explain-plain" style="font-weight:600">' +
          esc(t.plain) + '</p>' + layers(t) + actions(t, T.faded(id));
        panel.hidden = false;
        b.setAttribute('aria-expanded', 'true');
        T.record(id, 'opened');
        wireActions(panel, t);
      });
      wrap.appendChild(b);
    });
    var out = document.createElement('div');
    out.appendChild(wrap);
    out.appendChild(panel);
    return out;
  };

  /* ------------------------------------------- what do people do here?

     The question the tool is asked most, answered in words, from both sides:
     the jobs located in a place (industry, place of work) and the people who
     live there (occupation, place of residence). They are different
     questions and usually have different answers - Hamilton's largest
     industry is health care, but health care is only its residents' fifth
     most common occupation, because the health industry employs clerks,
     cleaners, cooks and technicians as well as clinicians.

     Every ORDER stated here has to clear the data's own uncertainty, the
     rule the quiz review made general: "the largest is X" only where X
     clearly exceeds the runner-up; otherwise "X and Y are about equally
     common". Residence counts use their PUBLISHED 95% intervals; place-of-
     work counts have none, so they use the variance model borrowed from them
     (METHODS 7.2). */
  /* A missing interval must never read as zero uncertainty - that would state
     every order as settled. Fall back to the borrowed model. */
  function sdFromCI(t) {
    if (t && t.hi != null && t.lo != null && t.hi > t.lo) {
      return (t.hi - t.lo) / 2 / 1.96;
    }
    return M.countSd(t ? t.n : null) || 0;
  }

  function separated(a, b, sda, sdb) {
    if (!a || !b) return true;
    var sd = Math.sqrt(sda * sda + sdb * sdb);
    return (a.n - b.n) >= 3 * sd;
  }

  /* An explicit rank is claimed only where the gap clears the uncertainty.
     Everywhere else the numbers are shown side by side and the reader can
     see how close they are - which is more honest than a confident order,
     and the parentheses keep labels that contain their own "and" ("trades
     and transport") from running into each other, on screen and aloud. */
  function orderSentence(rows, sdOf, noun) {
    var r = rows.filter(function (x) { return x.n > 0; });
    if (r.length < 2) return null;
    var sep = function (i, j) {
      return separated(r[i], r[j], sdOf(r[i]), sdOf(r[j]));
    };
    var name = function (x) { return '<b>' + esc(x.label.toLowerCase()) + '</b>'; };
    var pct = function (x) { return Math.round(100 * x.share) + '%'; };
    var withPct = function (x) { return name(x) + ' (' + pct(x) + ')'; };
    var s;
    var leader = sep(0, 1);
    if (leader) {
      s = 'The largest group is ' + name(r[0]) + ', at ' + pct(r[0]) +
        ' of ' + noun + '.';
    } else {
      s = withPct(r[0]) + ' and ' + withPct(r[1]) + ' are about equally ' +
        'common — too close to say which is larger.';
    }
    /* Only name a "top three" if the third clearly beats the fourth. */
    if (r.length >= 4 && sep(2, 3)) {
      if (leader) {
        s += ' Next come ' + withPct(r[1]) + ' and ' + withPct(r[2]) +
          (sep(1, 2) ? '.' : ', about the same size.');
      } else {
        s += ' Then ' + withPct(r[2]) + '.';
      }
    } else if (r.length >= 3) {
      s += ' Several others are close behind.';
    }
    return capFirst(s);
  }

  /* A sentence that opens with a tied pair begins with a label, and labels
     are lowercased for the middle of sentences. Capitalise the first letter
     after any markup. */
  function capFirst(s) {
    return s.replace(/^((?:<[^>]+>)*)([a-z])/, function (m, tags, ch) {
      return tags + ch.toUpperCase();
    });
  }

  /* "Jobs located here" includes people working from home - Statistics
     Canada's place-of-work total counts them at home. In May 2021 that was a
     large group, and in a few places it is most of the answer: in
     Clarence-Rockland, 1,560 of the 1,865 public-administration "jobs" were
     Ottawa public servants at their kitchen tables. Where the largest sector
     changes once home-workers are set aside, say so, and say what it becomes.
     The quiz rigour review's measure-invariance rule, applied to prose. */
  function homeWorkNote(code) {
    var tot = D.workVec(code, 'total');
    var usu = D.workVec(code, 'usual');
    var home = D.workVec(code, 'home');
    if (!tot || !usu || !home) return '';
    var top = function (v) {
      var best = 0;
      for (var i = 1; i < v.length; i++) if ((v[i] || 0) > (v[best] || 0)) best = i;
      return best;
    };
    var a = top(tot), b = top(usu);
    if (a === b) return '';
    /* Blame home-working only where it is actually the cause. A flip between
       two near-tied sectors is noise, not working from home: require that a
       real share of the leader's jobs were at home, and that the workplace
       leader clearly beats it on the workplace count. */
    if ((home[a] || 0) / (tot[a] || 1) < 0.25) return '';
    if (!M.clearlyLarger(usu[b], usu[a], 3)) return '';
    /* Not for farming. A farmer works at home because the farm IS home -
       that is the normal case, not a pandemic one - and it is the
       workplace-only count that misrepresents a farming township, by leaving
       its farmers out. Saying "counting only jobs at a workplace, the largest
       group is manufacturing" would teach the opposite of the truth. */
    if (D.naics[a].code === '11') return '';
    return ' <span class="homenote">Many of the ' +
      esc(D.naics[a].short.toLowerCase()) + ' jobs counted here are people ' +
      'working from home: ' + C.fmt(home[a] || 0) + ' of ' + C.fmt(tot[a] || 0) +
      '. Counting only jobs at a workplace, the largest group is <b>' +
      esc(D.naics[b].short.toLowerCase()) + '</b>.</span>';
  }

  function bars(rows, n) {
    var max = rows[0] ? rows[0].share : 1;
    return rows.slice(0, n).map(function (x) {
      return '<div class="sectorrow"><div><div class="nm">' + esc(x.label) +
        '</div><div class="meta">' + C.fmt(x.n) + ' · ' +
        Math.round(100 * x.share) + '%</div></div>' +
        '<div class="track"><i style="width:' +
        Math.max(2, 100 * x.share / max) + '%"></i></div></div>';
    }).join('');
  }

  L.whatPeopleDo = function (ctx, phone) {
    init();
    var name = esc(ctx.place.name);
    var c = U.card('What do people do here?', null);

    /* the jobs located here: industry, place of work */
    var jobs = null;
    if (ctx.local) {
      var tot = M.sum(ctx.local);
      jobs = ctx.local.map(function (v, i) {
        return { label: D.naics[i].short, n: v || 0, share: tot ? (v || 0) / tot : 0 };
      }).sort(function (a, b) { return b.n - a.n; });
    }
    /* the people who live here: occupation, place of residence */
    var occ = ctx.place.level === 'CSD' ? D.occupationFor(ctx.place.code) : null;
    var people = occ ? occ.map(function (o) {
      return { label: o.short, n: o.n || 0, share: o.share || 0, lo: o.lo, hi: o.hi };
    }) : null;

    var wrap = document.createElement('div');
    wrap.className = 'grid g2';

    if (jobs) {
      var a = document.createElement('div');
      a.innerHTML = '<h3 class="subh">The jobs located in ' + name + '</h3>' +
        '<p class="explain-plain">' + (orderSentence(jobs, function (x) {
          return M.countSd(x.n);
        }, 'the jobs located here') || '') +
        (A.state.measure === 'usual' ? '' : homeWorkNote(ctx.place.code)) +
        '</p>' +
        '<div class="bars">' + bars(jobs, 5) + '</div>';
      a.appendChild(L.chips(['place-of-work', 'sampling-error']));
      wrap.appendChild(a);
    }
    if (people) {
      var b = document.createElement('div');
      b.innerHTML = '<h3 class="subh">The people who live in ' + name + '</h3>' +
        '<p class="explain-plain">' + (orderSentence(people, sdFromCI,
          'working residents') || '') + '</p>' +
        '<div class="bars">' + bars(people, 5) + '</div>';
      b.appendChild(L.chips(['place-of-residence', 'confidence-interval']));
      wrap.appendChild(b);
    }
    c.appendChild(wrap);

    if (jobs && people) {
      c.appendChild(L.explain('industry-occupation',
        'These are two different questions. The left side sorts <b>jobs</b> by ' +
        'what the employer does. The right side sorts <b>people</b> by what they ' +
        'do, wherever they work. A hospital employs nurses, but also clerks, ' +
        'cooks and cleaners.'));
    }
    c.appendChild(U.h('<div class="card-foot">May 2021 census. Jobs located ' +
      'here include people working from home. Occupation covers employed ' +
      'residents wherever they work, and carries published margins of error ' +
      'because it comes from one household in four.</div>'));
    return c;
  };

  /* --------------------------------------------- the method on this place

     A term is remembered when it is attached to something the reader already
     knows. So each entry, where the current place has the figure, says what
     the method shows HERE. Every sentence below is generated from the data
     through the same functions the panels use; none states a figure the
     analysis does not produce. */
  function example(id, ctx) {
    if (!ctx || !ctx.place) return null;
    var name = esc(ctx.place.name);
    var ref = ctx.ref ? esc(ctx.ref.label) : 'the reference';
    switch (id) {
      case 'location-quotient': {
        if (!ctx.lq) return null;
        var top = ctx.lq.filter(function (r) {
          return r.flag === 'ok' && r.lq != null;
        }).sort(function (a, b) { return b.lq - a.lq; })[0];
        if (!top) return null;
        return 'In ' + name + ', ' +
          esc(D.naics[top.i].short.toLowerCase()) + ' has a location ' +
          'quotient of ' + top.lq.toFixed(2) + ': about ' +
          top.lq.toFixed(1) + ' times its share in ' + ref + '. That is ' +
          esc(T.lqBand(top.lq)) + '.';
      }
      case 'specialisation':
        return ctx.indices ? 'Against ' + ref + ', ' + name + ' scores ' +
          ctx.indices.coefSpecialisation.toFixed(2) + ', on a scale where 0 ' +
          'is the same mix and 1 is no overlap at all.' : null;
      case 'diversity':
        return ctx.indices ? name + ' scores ' +
          ctx.indices.entropyNormalised.toFixed(2) + ', where 1 would be jobs ' +
          'spread perfectly evenly across all twenty industries.' : null;
      case 'hachman':
        return ctx.indices && ctx.indices.hachman != null ? name + ' scores ' +
          ctx.indices.hachman.toFixed(2) + ' against ' + ref + '. A score ' +
          'of 1 would make it a miniature of ' + ref + '.' : null;
      case 'economic-base':
        return ctx.base && ctx.base.multiplier ? 'On this method, each job ' +
          'serving outside demand in ' + name + ' goes with about ' +
          ctx.base.multiplier.toFixed(1) + ' jobs in total. The method runs ' +
          'high, so treat that as an upper reading.' : null;
      case 'jobs-ratio':
        return ctx.place.jobsRatio ? name + ' has ' +
          ctx.place.jobsRatio.toFixed(2) + ' jobs for each resident worker ' +
          'with a fixed workplace.' : null;
      case 'self-containment':
        return ctx.place.selfContainmentUsual != null ? 'Of ' + name +
          '’s residents with a usual workplace, ' +
          Math.round(100 * ctx.place.selfContainmentUsual) + ' in 100 also ' +
          'work there.' : null;
      case 'industry-occupation': {
        var occ = D.occupationFor(ctx.place.code);
        if (!occ || !ctx.local || occ.length < 2) return null;
        var js = ctx.local.map(function (v, i) { return { i: i, v: v || 0 }; })
          .sort(function (a, b) { return b.v - a.v; });
        /* "The largest" only where it clearly is - the same separation test
           every stated comparison in the tool has to pass. */
        var jobClear = M.clearlyLarger(js[0].v, js[1].v, 3);
        var o0 = occ[0], o1 = occ[1];
        var occClear = (o0.n - o1.n) >= 3 * Math.sqrt(
          Math.pow(sdFromCI(o0), 2) + Math.pow(sdFromCI(o1), 2));
        var ind = function (k) { return esc(D.naics[js[k].i].short.toLowerCase()); };
        var oc = function (o) { return esc(o.short.toLowerCase()); };
        return (jobClear
            ? 'The largest industry among the jobs located in ' + name + ' is ' + ind(0) + '.'
            : 'Among the jobs located in ' + name + ', ' + ind(0) + ' and ' + ind(1) +
              ' are about equally large.') + ' ' +
          (occClear
            ? 'The most common occupation among the people who live there is ' + oc(o0) + '.'
            : 'Among the people who live there, ' + oc(o0) + ' and ' + oc(o1) +
              ' are about equally common occupations.');
      }
      case 'shift-share': {
        var ch = ctx.change;
        if (!ch || !ch.result) return null;
        var tt = ch.result.total;
        return 'From ' + ch.y0 + ' to ' + ch.y1 + ', ' + name + '’s ' +
          'resident workforce changed by ' + C.signed(Math.round(tt.actual)) +
          '. The wider economy accounts for ' +
          C.signed(Math.round(tt.national)) + ', its industry mix for ' +
          C.signed(Math.round(tt.mix)) + ', and local factors for ' +
          C.signed(Math.round(tt.competitive)) + '.';
      }
      default: return null;
    }
  }

  /* ------------------------------------------------------------ the tab */

  function badge(status) {
    var txt = { new: 'New', meeting: 'Meeting it', learned: 'Learned',
                known: 'You know this' }[status];
    return '<span class="lbadge lbadge-' + status + '">' + txt + '</span>';
  }

  function entry(t, ctx, open) {
    var ex = example(t.id, ctx);
    var faded = T.faded(t.id);
    var el = document.createElement('details');
    el.className = 'lentry';
    el.id = 'term-' + t.id;
    if (open) el.open = true;
    el.innerHTML =
      '<summary><span class="lname">' + esc(t.name) +
      (t.aka ? ' <span class="laka">(' + esc(t.aka.join(', ')) + ')</span>' : '') +
      '</span>' + badge(T.status(t.id)) +
      '<span class="lplain">' + esc(t.plain) + '</span></summary>' +
      layers(t) +
      (ex ? '<p class="lexample"><b>Here:</b> ' + ex + '</p>' : '') +
      '<p class="lsource">From METHODS.md, section ' +
      esc(t.methods) + '.</p>' +
      actions(t, faded).replace(
        '<button type="button" class="linkbtn" data-act="learn">More in Learn</button>', '');
    el.addEventListener('toggle', function () {
      if (el.open) T.record(t.id, 'opened');
    });
    wireActions(el, t);
    return el;
  }

  L.panel = function (host, ctx, phone) {
    init();
    var h = U.h, card = U.card;

    /* A quiz session in progress takes the whole view: one question per
       screen, nothing else competing for attention. */
    var QU = root.GRA.quizUI;
    if (QU && QU.active()) { QU.render(host); return; }
    var focus = A.state.learnFocus;
    A.state.learnFocus = null;
    if (focus) A.state.learnView = 'words';
    var view = A.state.learnView || null;

    /* Learn was one 9,000-pixel page with 123 controls. It is now four
       doors, each its own screen with a way back. */
    if (!view) { landing(host); return; }
    host.appendChild(subBar(view));
    if (view === 'practise') { if (QU) host.appendChild(QU.hub('practise')); return; }
    if (view === 'ideas') { if (QU) host.appendChild(QU.hub('ideas')); return; }
    if (view === 'story') {
      if (root.GRA.history) host.appendChild(root.GRA.history.card());
      return;
    }
    var n = T.counts();

    var intro = card('Learn',
      'Hinterland teaches regional science as you use it. Every number in ' +
      'the tool comes with a plain sentence first and its technical name ' +
      'second. Tap the name to see how it works, when to use it, and — ' +
      'most usefully — what it cannot tell you. As you learn a term, the ' +
      'plain sentence steps back and the name leads.');
    intro.appendChild(h('<div class="hero" style="margin-top:6px">' +
      U.stat(C.fmt(n.learned + n.known), 'terms learned or known',
             'of ' + T.list.length) +
      U.stat(C.fmt(n.meeting), 'being met', 'seen, not yet held') +
      U.stat(C.fmt(n.new), 'still new', null) +
      '</div>'));
    intro.appendChild(h('<p class="card-foot">A term counts as learned when ' +
      'you answer it correctly in the quiz at least a week after you first ' +
      'met it. You can also mark one as known yourself, and bring any term ' +
      'back in full.</p>'));
    host.appendChild(intro);

    /* Which method answers which question. */
    var mp = card('Which method answers which question',
      'Knowing a definition is the easy part. The skill is choosing: faced ' +
      'with a question, which method answers it, and what should make you ' +
      'doubt the answer.');
    var list = document.createElement('div');
    list.className = 'mmap';
    T.map.forEach(function (row) {
      var r = document.createElement('div');
      r.className = 'mrow';
      r.innerHTML = '<p class="mq">' + esc(row.q) + '</p>' +
        '<div class="mids">' + row.ids.map(function (id) {
          var t = T.byId[id];
          return '<button type="button" class="term-chip" data-jump="' + id +
            '" data-say="' + esc(t.name) + '"><span class="term-name">' +
            esc(t.name) + '</span></button>';
        }).join('') + '</div>';
      list.appendChild(r);
    });
    list.addEventListener('click', function (e) {
      var b = e.target.closest('[data-jump]');
      if (!b) return;
      var el = document.getElementById('term-' + b.getAttribute('data-jump'));
      if (el) {
        var grp = el.closest('details.home-more');
        if (grp) grp.open = true;
        el.open = true;
        try { el.scrollIntoView({ block: 'center' }); } catch (x) {}
      }
    });
    mp.appendChild(list);
    host.appendChild(mp);

    /* Every term, by group. */
    /* every term, by group - each group folded, so the page is a list of
       nine headings rather than six thousand pixels */
    var gh = h('<h2 class="subh" style="margin:10px 2px 0">Every term</h2>');
    host.appendChild(gh);
    Object.keys(T.GROUP).forEach(function (g) {
      var terms = T.list.filter(function (t) { return t.group === g; });
      if (!terms.length) return;
      var d = document.createElement('details');
      d.className = 'home-more';
      d.innerHTML = '<summary>' + esc(T.GROUP[g]) + ' (' + terms.length + ')</summary>';
      var c = card(null, null);
      terms.forEach(function (t) { c.appendChild(entry(t, ctx, t.id === focus)); });
      if (terms.some(function (t) { return t.id === focus; })) d.open = true;
      d.appendChild(c);
      host.appendChild(d);
    });

    if (focus) {
      setTimeout(function () {
        var el = document.getElementById('term-' + focus);
        if (el) try { el.scrollIntoView({ block: 'start' }); } catch (x) {}
      }, 60);
    }
  };

  var TILES = [
    { v: 'practise', t: 'Practise', a: 'Short quiz sessions. No timer.' },
    { v: 'ideas', t: 'Big ideas', a: 'The nine things the questions add up to, and your progress' },
    { v: 'story', t: 'Ontario\u2019s story', a: 'How the province\u2019s work has changed, and why' },
    { v: 'words', t: 'Words and methods', a: 'What each term means, and which method answers which question' }
  ];

  function landing(host) {
    var QU = root.GRA.quizUI, S = root.GRA.quizSched;
    var can = 0;
    try { can = S.canAnswer(S.load()); } catch (e) {}
    var c = U.card(null, null, { className: 'home-card' });
    c.innerHTML = '<h1 class="home-q1">Learn</h1>' +
      '<p class="home-lede">Regional science, Ontario\u2019s economic history and what ' +
      'the numbers mean, a little at a time.' +
      (can ? ' You can answer <b>' + can + '</b> questions so far.' : '') + '</p>' +
      '<div class="qnextbar"><button type="button" class="btn btn-primary lrn-start">' +
      'Start a session</button></div>';
    host.appendChild(c);
    c.querySelector('.lrn-start').addEventListener('click', function () {
      if (QU && !QU.start()) {
        A.state.learnView = 'practise'; A.render();
      }
    });
    var t = U.card(null, null, { className: 'home-card' });
    var list = document.createElement('div');
    list.className = 'home-qs';
    list.innerHTML = TILES.map(function (x) {
      return '<button type="button" class="home-q" data-v="' + x.v + '">' +
        '<span class="hq-t" style="grid-column:1 / 3"><span class="hq-q">' + esc(x.t) +
        '</span><span class="hq-a">' + esc(x.a) + '</span></span>' +
        '<span class="hq-go" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M9 6l6 6-6 6"/></svg></span></button>';
    }).join('');
    list.addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]');
      if (!b) return;
      A.state.learnView = b.getAttribute('data-v');
      A.render();
      if (A.jump) A.jump(0);
    });
    t.appendChild(list);
    host.appendChild(t);
  }

  function subBar(view) {
    var tile = TILES.filter(function (x) { return x.v === view; })[0] || TILES[0];
    var bar = document.createElement('div');
    bar.className = 'titlebar';
    bar.innerHTML = '<button type="button" class="tb-back" aria-label="Back to Learn">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>' +
      '<span>Learn</span></button><h1 class="tb-title">' + esc(tile.t) + '</h1>';
    bar.querySelector('.tb-back').addEventListener('click', function () {
      A.back();
    });
    return bar;
  }

  /* ---------------------------------------------- panel readings

     Every analysis card ends the same way: one sentence saying what the
     result means for THIS place, in words, then the terms it used as chips.
     The sentence says nothing the card's own numbers do not support - a
     difference inside the sampling or rounding noise is said to be noise. */

  L.teach = function (cardEl, ids, plainHTML) {
    init();
    if (!cardEl) return;
    var box = document.createElement('div');
    box.className = 'teach';
    if (plainHTML) {
      box.appendChild(Object.assign(document.createElement('p'),
        { className: 'explain-plain teach-says', innerHTML: plainHTML }));
    }
    if (ids && ids.length) box.appendChild(L.chips(ids, { label: 'What these mean:' }));
    cardEl.appendChild(box);
  };

  /* Structure: the industry most over-represented here, only where the
     excess clears sampling error and the count is above the floor. */
  L.readMix = function (rows, placeName, refLabel) {
    init();
    var best = null;
    rows.forEach(function (r) {
      if (r.lq == null || r.flag !== 'ok' || (r.employment || 0) < 50) return;
      var expected = r.employment / r.lq;
      if (r.lq < 1.25 || !M.clearlyLarger(r.employment, expected, 3)) return;
      if (!best || r.lq > best.lq) best = r;
    });
    if (!best) {
      return 'No industry in ' + esc(placeName) + ' is clearly more concentrated ' +
        'than in ' + esc(refLabel) + ' once sampling error is allowed for. Its ' +
        'mix of jobs looks broadly like the benchmark’s.';
    }
    var times = best.lq >= 1.95 ? (Math.round(best.lq * 10) / 10) + ' times'
                                : 'about ' + Math.round((best.lq - 1) * 100) + '% more than';
    return '<b>' + esc(D.naics[best.i].short) + '</b> stands out: its share of ' +
      'jobs in ' + esc(placeName) + ' is ' + times + ' its share in ' +
      esc(refLabel) + '. A concentration like that usually means the place ' +
      'serves customers, patients or buyers from beyond its borders - money ' +
      'coming in, which is why it matters for the local economy.';
  };

  /* Economic base, in tens. Withheld when the base is unstable. */
  L.readBase = function (base, refLabel) {
    init();
    if (!base || base.unstable || base.basicShare == null) return null;
    var tenths = Math.round(base.basicShare * 10);
    if (tenths < 1) return null;
    return 'Roughly <b>' + tenths + ' in 10</b> jobs here look like they bring ' +
      'money in from outside, judged against ' + esc(refLabel) + '. The rest ' +
      'mostly serve the people who live here. Treat it as a rough split, not a ' +
      'count: the method tends to understate the export share.';
  };

  /* Shift-share, as a sentence. Components smaller than the rounding
     uncertainty are called "too small to call", not given a sign. */
  L.readShiftShare = function (t, ch, placeName, emView) {
    init();
    var noise = 2 * (ch.uncertainty || 0);
    function part(v, up, down) {
      if (v == null) return '';
      if (Math.abs(v) <= noise) return 'made no difference we can measure';
      return (v > 0 ? up : down) + ' about ' + C.fmt(Math.abs(Math.round(v)));
    }
    var comp = emView ? t.emCompetitive : t.competitive;
    var s = 'If ' + esc(placeName) + ' had simply changed at ' +
      esc(ch.ref.label) + '’s rate, its resident workforce would have ' +
      (t.national >= 0 ? 'gained' : 'lost') + ' about ' +
      C.fmt(Math.abs(Math.round(t.national))) + '. Its mix of industries ' +
      part(t.mix, 'added', 'took away') + '. How its industries did against the ' +
      'same industries elsewhere ' + part(comp, 'added', 'took away') + '.';
    var verdict;
    if (Math.abs(comp) <= noise && Math.abs(t.mix) <= noise) {
      verdict = ' In short, it moved with the benchmark.';
    } else if (Math.abs(comp) > Math.abs(t.mix)) {
      verdict = ' The bigger story is local performance, not the industries it ' +
        'started with.';
    } else {
      verdict = ' The bigger story is the industries it started with, not how ' +
        'well it did in them.';
    }
    return s + verdict;
  };

  /* shared with the phone home screen (home.js) */
  L.orderSentence = function (a, b, c) { init(); return orderSentence(a, b, c); };
  L.sdFromCI = function (t) { init(); return sdFromCI(t); };
  L.homeWorkNote = function (code) { init(); return homeWorkNote(code); };

  function attach() {
    if (root.GRA && root.GRA.panels && root.GRA.ui) {
      root.GRA.panels.learn = L.panel;
      root.GRA.learn = L;
    } else {
      setTimeout(attach, 20);
    }
  }
  attach();
}(this));
