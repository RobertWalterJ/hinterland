/* ==========================================================================
   Application shell: state, the analysis context, pickers, routing.

   There are exactly two settings that drive everything - the place and the
   benchmark - and both are always visible in the header. Any panel can read
   the whole analysis from ctx; none of them recompute it.
   ========================================================================== */

(function (root) {
  'use strict';

  var D, M, C, X;
  var A = {};

  A.state = {
    place: '3520005',            /* Toronto, as somewhere to land */
    benchmark: 'ON',
    basis: 'work',               /* work | residence */
    measure: 'total',            /* total | usual */
    y0: 2016, y1: 2021,
    chain: false,
    skip2011: true,
    tab: 'overview',
    sortStructure: 'jobs',
    emView: false,
    peerK: 8,
    peerFeatures: null,
    peerPinned: [],
    peerRemoved: [],
    peerMode: 'similar',         /* similar | structural */
    started: false,              /* has the reader chosen a place yet? */
    homeView: 'jobs',            /* jobs | people, on the home answer */
    mapVar: null
  };

  var PEER_FEATURES = [
    { key: 'fPop', label: 'Population', help: 'log of 2021 population' },
    { key: 'fGrowth', label: 'Population growth', help: '2011 to 2021' },
    { key: 'fJobDensity', label: 'Employment density', help: 'log of jobs per km²' },
    { key: 'fGoods', label: 'Goods-producing share', help: 'NAICS 11-33' },
    { key: 'fKnow', label: 'Knowledge-services share', help: 'NAICS 51-56' },
    { key: 'fPublic', label: 'Public and institutional share', help: 'NAICS 61, 62, 91' },
    { key: 'fSelf', label: 'Self-containment', help: 'residents who work locally' }
  ];
  A.PEER_FEATURES = PEER_FEATURES;

  var TABS = [
    { id: 'overview', label: 'Home' },
    { id: 'structure', label: 'Known for' },
    { id: 'change', label: 'Change' },
    { id: 'population', label: 'Growth' },
    { id: 'peers', label: 'Compare' },
    { id: 'impact', label: 'If jobs arrived' },
    { id: 'hoods', label: 'Neighbourhoods' },
    { id: 'map', label: 'Map' },
    { id: 'brief', label: 'Brief' },
    { id: 'learn', label: 'Learn' },
    { id: 'sources', label: 'Sources' }
  ];

  /* The phone has four destinations. Every other screen is a step down
     from Home, and Home stays lit while you are there - an unlit bar on
     Structure or Peers left Robert not knowing where he was. */
  var SECTION = { overview: 'overview', structure: 'overview', change: 'overview',
    population: 'overview', impact: 'overview', hoods: 'overview', brief: 'overview',
    sources: 'overview', peers: 'peers', map: 'map', learn: 'learn' };
  A.SECTION = SECTION;
  /* The question each step-down screen answers: its title bar says it. */
  var TITLES = { structure: 'What is it known for?', change: 'How has work changed?',
    population: 'Is it growing?', impact: 'What if new jobs arrived?',
    hoods: 'How do its neighbourhoods differ?', brief: 'The brief',
    sources: 'Where the numbers come from', peers: 'Which places are like it?',
    map: 'Explore the map' };
  A.TITLES = TITLES;
  A.TABS = TABS;

  /* ------------------------------------------------------------- booting */

  var BOOT_LINES = [
    'Counting jobs, one sector at a time',
    'Sorting 577 municipalities',
    'Teaching Ontario to hold still',
    'Checking the arithmetic twice'
  ];

  A.boot = function () {
    D = root.GRA.data; M = root.GRA.methods;
    C = root.GRA.charts; X = root.GRA.exp;

    var bootEl = document.getElementById('boot');
    var msg = document.getElementById('bootMsg');
    var i = 0;
    var spin = setInterval(function () {
      msg.textContent = BOOT_LINES[i++ % BOOT_LINES.length] + '…';
    }, 900);
    msg.textContent = BOOT_LINES[0] + '…';

    restore();

    D.load().then(function () {
      clearInterval(spin);
      if (!D.byCode[A.state.place]) A.state.place = '3520005';
      buildChrome();
      A.render();
      /* A restored or linked place can be a census tract, whose employment
         payload loads on demand. Without this the first paint reports the
         missing fetch as a suppression. */
      var first = D.byCode[A.state.place];
      if (first && first.level === 'CT') D.loadTracts().then(A.render);
      wireReader();
      initHistory();
      bootEl.classList.add('gone');
      setTimeout(function () { if (bootEl.remove) bootEl.remove(); }, 400);
      /* The tract layer and the polygons are not needed to answer the first
         question, so they arrive after the first paint. */
      D.loadBoundaries('csd');
      registerWorker();
    }).catch(function (e) {
      clearInterval(spin);
      msg.innerHTML = '<b style="color:var(--brand)">Could not load the data.</b><br>' +
        C.esc(e.message) +
        '<br><br style="font-size:12px">Open the app with <b>Launch Hinterland.bat' +
        '</b> rather than by double-clicking index.html — the data files have ' +
        'to be served over http.';
      console.error(e);
    });
  };

  /* The offline cache is worth having - this is a tool you might open in a
     council chamber - but it is registered only once the app is up and idle,
     so its pre-caching never competes with the app's own first load. */
  function registerWorker() {
    /* Not on the published build: that runs in a sandboxed viewer where a
       service worker is at best unreliable and at worst a stale copy of the
       app pinned to an origin nobody can clear. The local launcher is where
       offline matters. */
    if (root.GRA_HOSTED) return;
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol.indexOf('http') !== 0) return;
    setTimeout(function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }, 2500);
  }

  /* ------------------------------------------------------- persistence */

  function restore() {
    try {
      var s = JSON.parse(localStorage.getItem('gra.state') || '{}');
      Object.keys(s).forEach(function (k) {
        if (k in A.state) A.state[k] = s[k];
      });
      A.recent = JSON.parse(localStorage.getItem('gra.recent') || '[]');
    } catch (e) { A.recent = []; }
    A.recent = A.recent || [];
    if (location.hash.length > 1) {
      var h = new URLSearchParams(location.hash.slice(1));
      if (h.get('p')) {
        /* a link to a particular place lands on its answer, not the question */
        if (h.get('p') !== A.state.place) A.state.started = true;
        A.state.place = h.get('p');
      }
      if (h.get('b')) A.state.benchmark = h.get('b');
      if (h.get('t')) A.state.tab = h.get('t');
    }
  }

  function persist() {
    try {
      localStorage.setItem('gra.state', JSON.stringify(A.state));
      localStorage.setItem('gra.recent', JSON.stringify(A.recent.slice(0, 12)));
    } catch (e) { /* private window; carry on */ }
    /* The shareable hash is a convenience, and some embedded viewers refuse
       history writes. Losing the hash must never cost the render. */
    try {
      var hp = { p: A.state.place, b: A.state.benchmark, t: A.state.tab };
      if (A.state.tab === 'learn' && A.state.learnView) hp.v = A.state.learnView;
      var h = new URLSearchParams(hp);
      var hash = '#' + h.toString();
      var moved = navKey(hash) !== navKey(lastHash);
      if (histReady && moved && !fromPop) {
        var m0 = document.querySelector('main');
        try {
          history.replaceState(Object.assign({}, history.state || {},
            { scroll: m0 ? m0.scrollTop : 0 }), '', lastHash);
        } catch (x) {}
        history.pushState({ hl: 'nav' }, '', hash);
      } else {
        history.replaceState(history.state, '', hash);
      }
      lastHash = hash;
    } catch (e2) { /* sandboxed; the app works without a shareable URL */ }
  }

  /* ------------------------------------------------------------ back

     The phone's back gesture must go back, not close the app. The first
     version only ever REPLACED its one history entry, so there was nothing
     to go back to. Now every change of place or screen is its own entry, and
     back is handled in this order:
       1. an open sheet (the place picker, export) closes;
       2. a quiz session steps out - to its summary, then to Learn;
       3. otherwise the previous place and screen come back.
     Only from the very first screen does back leave the app. A base entry
     sits under the first screen so that steps 1 and 2 work even there. */
  var lastHash = '', histReady = false, fromPop = false;
  function navKey(hash) {
    var h = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    return (h.get('p') || '') + '|' + (h.get('t') || '') + '|' + (h.get('v') || '');
  }
  function initHistory() {
    try {
      var hash = location.hash || lastHash;
      history.replaceState({ hl: 'base' }, '', hash);
      history.pushState({ hl: 'nav' }, '', hash);
      lastHash = hash;
      histReady = true;
    } catch (e) { return; }
    window.addEventListener('popstate', function (e) {
      function stay() {
        try { history.pushState({ hl: 'nav' }, '', lastHash); } catch (x) {}
      }
      if (document.getElementById('sheet')) { closeSheet(); stay(); return; }
      var QU = root.GRA.quizUI;
      if (QU && QU.active()) {
        /* back pauses a session; from the pause it ends; from the summary
           it leaves */
        var ph = QU.phase();
        if (ph === 'done') QU.leave();
        else if (ph === 'paused') QU.stop();
        else QU.pause();
        stay(); return;
      }
      if (e.state && e.state.hl === 'base') {
        /* Back from the first screen: leave, as the platform expects. In an
           installed app there may be nothing to leave to and the app stays
           put; history must keep recording (switching it off here meant the
           NEXT back closed the app from wherever the reader had gone). Any
           further navigation pushes on top of this entry as normal; another
           back from here closes the app. */
        history.back();
        return;
      }
      var h = new URLSearchParams(location.hash.replace(/^#/, ''));
      fromPop = true;
      try {
        if (h.get('b')) A.state.benchmark = h.get('b');
        A.state.learnView = h.get('v') || null;
        var p = h.get('p'), t = h.get('t');
        if (t) A.state.tab = t;
        if (p && p !== A.state.place && D.byCode[p]) A.setPlace(p);
        else A.render();
        if (t && A.state.tab !== t) { A.state.tab = t; A.render(); }
      } finally { fromPop = false; }
      lastHash = location.hash;
      /* back to where you were on that screen, once it has drawn */
      var want = e.state && e.state.scroll;
      if (want) {
        /* a timer, not animation frames: charts lay out after a tick, and a
           hidden page never paints */
        setTimeout(function () { jump(want); }, 60);
      }
    });
  }

  /* ---------------------------------------------------------- the chrome */

  /* Read-aloud lives in the chrome rather than in a panel, because the
     panels that most need it - Sources, the spatial writeup, the population
     reading - are the ones nobody would think to build a reader into. It reads
     whatever is currently rendered. */
  function wireReader() {
    var R = root.GRA.read;
    var btn = document.getElementById('readBtn');
    var stop = document.getElementById('readStopBtn');
    if (!btn || !R) return;
    if (!R.available()) { btn.hidden = true; if (stop) stop.hidden = true; return; }

    function paint(st) {
      var playing = st === 'reading';
      btn.querySelector('.play').style.display = playing ? 'none' : '';
      btn.querySelector('.pause').style.display = playing ? '' : 'none';
      btn.setAttribute('aria-label',
        playing ? 'Pause reading'
          : st === 'paused' ? 'Continue reading' : 'Read this page aloud');
      btn.title = btn.getAttribute('aria-label');
      btn.classList.toggle('is-on', st !== 'idle');
      stop.hidden = (st === 'idle');
    }
    R.onChange(paint);
    paint('idle');

    btn.addEventListener('click', function () {
      R.toggle(document.getElementById('view'));
    });
    stop.addEventListener('click', function () { R.stop(); });
  }

  function buildChrome() {
    var tabs = document.getElementById('tabs');
    tabs.innerHTML = TABS.map(function (t) {
      return '<button class="tab" role="tab" data-tab="' + t.id + '">' +
        t.label + '</button>';
    }).join('');
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (b) A.go(b.getAttribute('data-tab'));
    });

    document.getElementById('nav').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (!b) return;
      A.go(b.getAttribute('data-tab'));
    });
    document.getElementById('menuBtn').addEventListener('click', A.openMenu);

    document.getElementById('placeChip')
      .addEventListener('click', A.openPlacePicker);
    document.getElementById('benchChip')
      .addEventListener('click', A.openBenchmarkPicker);
    document.getElementById('exportBtn')
      .addEventListener('click', function () { root.GRA.exportUI.open(A.ctx); });
    document.getElementById('themeBtn')
      .addEventListener('click', toggleTheme);

    var sb = document.getElementById('soundBtn');
    var snd = root.GRA.sound;
    function paintSound() {
      sb.setAttribute('aria-pressed', String(snd.enabled));
      sb.title = snd.enabled ? 'Sound on' : 'Sound off';
      sb.setAttribute('aria-label',
        snd.enabled ? 'Turn sound off' : 'Turn sound on');
      document.body.classList.toggle('sound-on', snd.enabled);
    }
    snd.restore();
    paintSound();
    sb.addEventListener('click', function () {
      /* The first wake has to happen inside this gesture - browsers refuse to
         start audio any other way. */
      var on = snd.setEnabled(!snd.enabled);
      paintSound();
      if (on) snd.hello();
      A.render();
    });
  }

  function toggleTheme() {
    var r = document.documentElement;
    var cur = r.getAttribute('data-theme');
    var dark = cur ? cur === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    r.setAttribute('data-theme', dark ? 'light' : 'dark');
    try { localStorage.setItem('gra.theme', r.getAttribute('data-theme')); } catch (e) {}
    A.render();
  }

  /* main has scroll-behavior: smooth, so a plain scrollTop animates - a
     new screen must simply start at the top, and a returning one at its
     old place, at once */
  function jump(top) {
    var m = document.querySelector('main');
    if (!m) return;
    try { m.scrollTo({ top: top || 0, behavior: 'instant' }); }
    catch (e) { m.scrollTop = top || 0; }
  }
  A.jump = jump;

  A.go = function (tab) {
    /* the Learn tab always opens on its four doors */
    if (tab === 'learn' && A.state.tab !== 'learn' && A.state.learnView !== 'story') {
      A.state.learnView = null;
    }
    A.state.tab = tab;
    A.render();
    jump(0);
  };

  A.setPlace = function (code) {
    if (!D.byCode[code]) return;
    A.state.place = code;
    A.state.started = true;
    A.recent = [code].concat((A.recent || []).filter(function (c) {
      return c !== code;
    }));
    /* A benchmark that does not exist for the new place silently becomes
       Ontario rather than producing an empty panel. */
    var p = D.byCode[code];
    var b = A.state.benchmark;
    if ((b === 'CD' && !p.cd) || (b === 'ER' && !p.er) || (b === 'CMA' && !p.cma) ||
        (p.level !== 'CSD' && (b === 'CD' || b === 'ER' || b === 'CMA' || b === 'PEERS'))) {
      A.state.benchmark = p.level === 'CT' ? 'CMA' : 'ON';
      if (p.level === 'CT' && !p.cma) A.state.benchmark = 'ON';
    }
    A.state.peerPinned = []; A.state.peerRemoved = [];
    /* Carrying the current tab across a place change can strand the reader on
       a panel the new place cannot answer. Tabs are a view onto a place, so
       the place wins. */
    var NEEDS = { change: 'change', population: 'population',
                  peers: 'peers', hoods: 'neighbourhoods' };
    var need = NEEDS[A.state.tab];
    if (need) {
      var ok = { change: p.level !== 'CT',
                 population: p.level !== 'CT',
                 peers: p.level === 'CSD' || p.level === 'CT',
                 neighbourhoods: true }[need];
      if (!ok) A.state.tab = 'overview';
    }
    if (p.level === 'CT') {
      D.loadTracts().then(A.render);
    }
    A.render();
    /* a new place starts at the top of its answer, wherever it was chosen */
    jump(0);
  };

  A.setBenchmark = function (id) {
    A.state.benchmark = id;
    A.render();
  };

  /* =======================================================================
     The analysis context
     ===================================================================== */

  A.compute = function () {
    var st = A.state;
    var place = D.byCode[st.place];
    var ctx = {
      state: st, place: place,
      level: place.level,
      naics: D.naics, groups: D.naicsGroups,
      warnings: []
    };

    ctx.can = {
      population: place.level !== 'CT',
      impact: true,
      change: place.level !== 'CT',
      neighbourhoods: ['CSD', 'CD', 'ER', 'CMA', 'CT']
                        .indexOf(place.level) >= 0,
      peers: place.level === 'CSD' || place.level === 'CT',
      commuting: place.level === 'CSD'
    };

    /* ---------------------------------------------- structure, 2021 */
    /* Statistics Canada publishes place-of-work employment for census
       subdivisions, census divisions, the province and Canada - but NOT for
       economic regions or census metropolitan areas, whose codes appear
       nowhere in that table. Those levels are summed from their member
       municipalities, because otherwise the app reports that nothing was
       published when in fact it was published one level down. */
    var measure = st.measure;
    ctx.local = localVector(place, measure);
    ctx.localAggregated = !!(ctx.local && place.level !== 'CT' &&
                             !D.work.data[place.code]);

    ctx.ref = D.reference(st.benchmark, place, {
      basis: 'work', measure: measure, peerCodes: peerCodes(ctx)
    });
    if (!ctx.ref && st.benchmark !== 'ON') {
      ctx.ref = D.reference('ON', place, { basis: 'work', measure: measure });
      ctx.warnings.push('That benchmark has no published figures for this ' +
        'place, so Ontario is used instead.');
    }

    if (ctx.local && ctx.ref) {
      ctx.lq = M.locationQuotients(ctx.local, ctx.ref.vec);
      ctx.indices = M.structureIndices(ctx.local, ctx.ref.vec);
      ctx.base = M.economicBase(ctx.local, ctx.ref.vec);
      ctx.refIndices = M.structureIndices(ctx.ref.vec, ctx.ref.vec);
      ctx.jobs = M.sum(ctx.local);
    }

    /* -------------------------------- employed residents, all workers */
    /* The residence-basis vector is the only complete count of employed
       residents - the commuting table omits home workers and those with no
       fixed workplace. Aggregated levels are summed from their members. */
    var resVec = D.resVec(place.code, 2021);
    if (!resVec && (place.level === 'CD' || place.level === 'ER' ||
                    place.level === 'CMA')) {
      resVec = D.aggregate(D.membersOf(place.level, place), function (c) {
        return D.resVec(c, 2021);
      }).vec;
    }
    ctx.employedResidents = resVec ? M.sum(resVec) : null;
    /* The comparable denominator, aggregated for levels that have no published
       row of their own. */
    ctx.residentWorkersFixed = fixedWorkers(place);
    ctx.jobsRatio = (ctx.jobs != null && ctx.residentWorkersFixed)
      ? ctx.jobs / ctx.residentWorkersFixed : null;

    /* ---------------------------------------------------- commuting */
    if (ctx.can.commuting && place.liveAndWork != null) {
      ctx.commute = M.commutingProfile(place.liveAndWork, place.inCommuters,
                                       place.outCommuters,
                                       { allJobs: ctx.jobs,
                                         allEmployedResidents: ctx.employedResidents,
                                         residentWorkersFixed: ctx.residentWorkersFixed });
    }

    /* ----------------------------------------------- change over time */
    if (ctx.can.change) {
      ctx.change = computeChange(ctx);
    }

    /* -------------------------------------------------------- peers */
    if (ctx.can.peers) {
      ctx.peers = computePeers(ctx);
      if (st.benchmark === 'PEERS' && ctx.peers && ctx.peers.rows.length) {
        /* Recompute the reference now that the peer group is known. */
        var pr = D.reference('PEERS', place, {
          basis: 'work', measure: measure,
          peerCodes: ctx.peers.rows.map(function (r) { return r.code; })
        });
        if (pr) {
          ctx.ref = pr;
          ctx.lq = M.locationQuotients(ctx.local, ctx.ref.vec);
          ctx.indices = M.structureIndices(ctx.local, ctx.ref.vec);
          ctx.base = M.economicBase(ctx.local, ctx.ref.vec);
        }
      }
    }

    A.ctx = ctx;
    return ctx;
  };

  /* The place-of-work vector for any geography the app offers, whether or not
     Statistics Canada publishes one for it directly. */
  function localVector(place, measure) {
    if (place.level === 'CT') {
      return D.ctWork ? D.workVec(place.code, measure) : null;
    }
    var direct = D.workVec(place.code, measure);
    if (direct) return direct;
    var members = D.membersOf(place.level, place);
    if (!members.length) return null;
    var agg = D.aggregate(members, function (c) {
      return D.workVec(c, measure);
    });
    return agg.vec;
  }

  /* Workers who can be matched against a place-of-work count: those who worked
     at home or at a usual workplace. Summed from members where Statistics
     Canada publishes no row for the level. */
  function fixedWorkers(place) {
    var direct = D.res.measures_2021 ? D.res.measures_2021[place.code] : null;
    if (direct) return (direct.home || 0) + (direct.usual || 0);
    var members = D.membersOf(place.level, place);
    if (!members.length) return null;
    var t = 0, any = false;
    members.forEach(function (c) {
      var m = D.res.measures_2021 ? D.res.measures_2021[c] : null;
      if (!m) return;
      t += (m.home || 0) + (m.usual || 0);
      any = true;
    });
    return any ? t : null;
  }

  function peerCodes(ctx) {
    return (ctx.peers && ctx.peers.rows)
      ? ctx.peers.rows.map(function (r) { return r.code; }) : [];
  }

  /* ------------------------------------------------- change over time */

  function computeChange(ctx) {
    var st = A.state, place = ctx.place;
    var years = D.res.years.slice();
    if (st.skip2011) years = years.filter(function (y) { return y !== 2011; });

    /* Aggregated levels have no residence-basis series of their own, so they
       are summed from their member municipalities on a balanced panel. */
    var localAt = function (y) {
      if (place.level === 'CSD' || place.level === 'PR' || place.level === 'CA') {
        return D.resVec(place.code === '35' ? '35' : place.code, y);
      }
      var members = D.membersOf(place.level, place);
      if (!members.length) return null;
      var a = D.aggregate(members, function (c) { return D.resVec(c, y); });
      return a.vec;
    };

    var have = years.filter(function (y) { return !!localAt(y); });
    var out = { years: years, available: have, basis: 'residence' };

    if (have.length < 2) {
      out.error = 'This place has published industry figures for fewer than ' +
        'two census years, so no change can be decomposed.';
      return out;
    }

    var y0 = st.y0, y1 = st.y1;
    if (have.indexOf(y0) < 0) y0 = have[0];
    if (have.indexOf(y1) < 0) y1 = have[have.length - 1];
    if (y0 >= y1) { y0 = have[0]; y1 = have[have.length - 1]; }
    out.y0 = y0; out.y1 = y1;

    var refP = D.referencePeriod(st.benchmark, place, y0, y1,
                                { peerCodes: peerCodes(ctx) });
    if (!refP) {
      refP = D.referencePeriod('ON', place, y0, y1);
      out.refFallback = true;
    }
    out.ref = refP;
    if (!refP) { out.error = 'No reference economy is available for that period.'; return out; }

    /* the pair on a balanced panel: the same member towns in both years */
    var pair = D.resSeries(place, [y0, y1]);
    out.local0 = pair.vecs[y0];
    out.local1 = pair.vecs[y1];
    if (pair.members) out.coverage = { used: pair.used, members: pair.members };
    if (!out.local0 || !out.local1) {
      out.error = 'Not enough of this area’s municipalities were published in both ' +
        y0 + ' and ' + y1 + ' to compare them fairly.';
      return out;
    }
    out.result = M.estebanMarquillas(out.local0, out.local1, refP.v0, refP.v1);

    /* The identity is arithmetic, not an approximation, so it is checked and
       shown rather than assumed. */
    var t = out.result.total;
    out.identity = t.actual - (t.national + t.mix + t.competitive);
    out.emIdentity = t.competitive - (t.emCompetitive + t.emAllocation);

    if (st.chain) {
      /* balanced across the whole span, for the place and the benchmark */
      var span = have.filter(function (y) { return y >= y0 && y <= y1; });
      var ls = D.resSeries(place, span);
      var rs = D.referencePeriod(st.benchmark, place, span[0], span[span.length - 1],
                                 { peerCodes: peerCodes(ctx), years: span }) ||
               D.referencePeriod('ON', place, span[0], span[span.length - 1], { years: span });
      if (rs && rs.series) out.dynamic = M.dynamicShiftShare(ls.vecs, rs.series, span);
    }

    /* one standard deviation of the change, from sampling and rounding */
    out.uncertainty = M.changeSd(out.local0, out.local1);
    return out;
  }

  /* ------------------------------------------------------------ peers */

  function computePeers(ctx) {
    var st = A.state, place = ctx.place;
    var feats = st.peerFeatures ||
      PEER_FEATURES.map(function (f) { return f.key; });

    var pool;
    if (place.level === 'CT') {
      if (!D.ctWork) return null;
      pool = (D.byLevel.CT || []).filter(function (p) {
        return p.cma === place.cma && D.ctWork.data[p.code];
      });
      if (pool.length < 12) {
        pool = (D.byLevel.CT || []).filter(function (p) {
          return D.ctWork.data[p.code];
        });
      }
    } else {
      /* Restrict candidates to settlements of a comparable kind before any
         distance is computed. A town two hours from a city is not made
         comparable to a suburb by arithmetic. */
      pool = (D.byLevel.CSD || []).filter(function (p) {
        return p.sac === place.sac && p.jobs > 200;
      });
      if (pool.length < 12) {
        pool = (D.byLevel.CSD || []).filter(function (p) { return p.jobs > 200; });
        ctx.warnings.push('Too few municipalities share this one’s ' +
          'settlement type, so the peer search ran across all of Ontario.');
      }
    }
    if (pool.indexOf(place) < 0) pool = [place].concat(pool);

    var groups = D.naicsGroups;
    var rows = pool.map(function (p) {
      var v = place.level === 'CT' ? D.ctWork.data[p.code][0] : D.workVec(p.code, 'total');
      var tot = v ? M.sum(v) : 0;
      function shr(codes) {
        if (!v || !tot) return null;
        var s = 0;
        D.naics.forEach(function (n, i) {
          if (codes.indexOf(n.code) >= 0) s += v[i] || 0;
        });
        return s / tot;
      }
      var selfC = p.selfContainmentUsual;
      return {
        code: p.code, place: p, vec: v, jobs: tot,
        fPop: p.pop2021 ? Math.log(p.pop2021 + 1) : null,
        fGrowth: p.popGrowth1121 != null ? p.popGrowth1121 : null,
        fJobDensity: (p.area_km2 > 0 && tot) ? Math.log(tot / p.area_km2 + 1) : null,
        fGoods: shr(['11', '21', '22', '23', '31-33']),
        fKnow: shr(['51', '52', '53', '54', '55', '56']),
        fPublic: shr(['61', '62', '91']),
        fSelf: selfC
      };
    });

    var ti = 0;
    rows.forEach(function (r, i) { if (r.code === place.code) ti = i; });

    var result;
    if (st.peerMode === 'structural') {
      var mine = rows[ti].vec;
      result = rows.map(function (r, i) {
        return { index: i, d2: null,
                 distance: (i === ti || !r.vec) ? null : M.mixDistance(mine, r.vec) };
      }).filter(function (r) { return r.distance != null; })
        .sort(function (a, b) { return a.distance - b.distance; });
      result = { peers: result.slice(0, st.peerK), all: result,
                 keys: ['industry mix'], degenerate: false };
    } else {
      result = M.mahalanobisPeers(ti, rows, feats, st.peerK + 6);
    }

    var chosen = [];
    st.peerPinned.forEach(function (code) {
      var idx = -1;
      rows.forEach(function (r, i) { if (r.code === code) idx = i; });
      if (idx >= 0) chosen.push({ index: idx, distance: null, pinned: true });
    });
    result.peers.forEach(function (p) {
      var code = rows[p.index].code;
      if (st.peerRemoved.indexOf(code) >= 0) return;
      if (st.peerPinned.indexOf(code) >= 0) return;
      if (chosen.length >= st.peerK) return;
      chosen.push(p);
    });

    return {
      target: rows[ti], rows: chosen.map(function (p) {
        return Object.assign({}, rows[p.index],
          { distance: p.distance, pinned: !!p.pinned });
      }),
      all: rows, allRanked: result.all, features: feats,
      poolSize: rows.length - 1, degenerate: result.degenerate,
      mode: st.peerMode
    };
  }

  /* ====================================================== rendering */

  A.render = function () {
    var ctx = A.compute();
    persist();
    renderChips(ctx);
    renderTabs();
    var host = document.getElementById('view');
    var P = root.GRA.panels;
    if (!P || !host || !host.appendChild) return;   /* headless (node self-tests) */
    var phone = window.matchMedia('(max-width: 720px)').matches;
    var tab = A.state.tab;

    /* Tabs the phone layout folds into others. */
    /* (Structure used to fold into the overview on a phone. The phone home
       now links to it directly - "What is it known for?" - so it opens as
       its own screen.) */

    var fn = P[tab] || P.overview;
    /* The reader holds references into the panel being replaced, so it has
       to be stopped before the DOM goes - otherwise the app keeps reading a
       page that is no longer on screen, with no control left to stop it. */
    if (root.GRA.read) root.GRA.read.stop();
    host.innerHTML = '';
    document.body.classList.remove('is-landing');
    document.body.classList.remove('quiz-mode');
    try {
      if (TITLES[tab] && tab !== 'overview') host.appendChild(titleBar(tab, ctx));
      fn(host, ctx, phone);
      if (phone && root.GRA.ui.foldLong) root.GRA.ui.foldLong(host);
    } catch (e) {
      console.error(e);
      host.innerHTML = '<div class="card"><h3>That did not render.</h3>' +
        '<p class="card-note">' + C.esc(e.message) + '</p></div>';
    }
    if (ctx.warnings.length) {
      var w = document.createElement('div');
      w.className = 'card';
      w.style.borderLeft = '3px solid var(--warning)';
      w.innerHTML = '<div class="eyebrow">Worth knowing</div>' +
        ctx.warnings.map(function (t) {
          return '<p class="card-note" style="margin-bottom:0">' + t + '</p>';
        }).join('');
      host.appendChild(w);
    }
  };

  /* "‹ Thunder Bay   How has work changed?" - where you are, and the way
     back, on every step-down screen. The benchmark lives here too on the
     screens that use it, instead of in the header of every screen. */
  function titleBar(tab, ctx) {
    var bar = document.createElement('div');
    bar.className = 'titlebar';
    var name = ctx.place.level === 'CT' ? D.tractLabel(ctx.place.code).title : ctx.place.name;
    var usesRef = tab === 'structure' || tab === 'change';
    var root_ = SECTION[tab] === tab;     /* a tab of its own: no way "back" to show */
    bar.innerHTML = (root_ ? '' : '<button type="button" class="tb-back" aria-label="Back to ' +
      C.esc(name.split(' / ')[0]) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>' +
      '<span>' + C.esc(name.split(' / ')[0]) + '</span></button>') +
      '<h1 class="tb-title">' + C.esc(TITLES[tab]) + '</h1>' +
      (usesRef ? '<button type="button" class="tb-ref">Compared with ' +
        C.esc(ctx.ref ? ctx.ref.label : 'Ontario') + ' \u25be</button>' : '');
    var bk = bar.querySelector('.tb-back');
    if (bk) bk.addEventListener('click', A.back);
    var r = bar.querySelector('.tb-ref');
    if (r) r.addEventListener('click', A.openBenchmarkPicker);
    return bar;
  }

  /* Back, as the on-screen chevron: the same as the phone's gesture when
     there is history to go back through, otherwise up to Home. */
  A.back = function () {
    if (histReady && history.state && history.state.hl === 'nav' && history.length > 2) {
      history.back();
    } else {
      A.go('overview');
    }
  };

  /* The header's "More" sheet: the things every screen used to carry. */
  A.openMenu = function () {
    var snd = root.GRA.sound;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') &&
       window.matchMedia('(prefers-color-scheme: dark)').matches);
    var el = sheet('More',
      '<div class="sheet-body"><div class="menu">' +
      '<button type="button" class="menu-i" data-m="bench">Compared with: <b>' +
      C.esc(A.ctx && A.ctx.ref ? A.ctx.ref.label : 'Ontario') + '</b></button>' +
      '<button type="button" class="menu-i" data-m="theme">' +
      (dark ? 'Switch to light' : 'Switch to dark') + '</button>' +
      '<button type="button" class="menu-i" data-m="sound">Sound: <b>' +
      (snd && snd.enabled ? 'on' : 'off') + '</b></button>' +
      '<button type="button" class="menu-i" data-m="export">Share or save these figures</button>' +
      '<button type="button" class="menu-i" data-m="sources">Where the numbers come from</button>' +
      '</div></div>');
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]');
      if (!b) return;
      var m = b.getAttribute('data-m');
      closeSheet();
      if (m === 'bench') A.openBenchmarkPicker();
      else if (m === 'theme') toggleTheme();
      else if (m === 'sound') document.getElementById('soundBtn').click();
      else if (m === 'export') root.GRA.exportUI.open(A.ctx);
      else if (m === 'sources') A.go('sources');
    });
  };

  function renderChips(ctx) {
    var phone = window.matchMedia('(max-width: 720px)').matches;
    var p = ctx.place;
    var pc = document.getElementById('placeChip');
    if (!pc || !pc.querySelector || !pc.querySelector('.v')) return;   /* no header (node test harness) */
    pc.querySelector('.v').textContent =
      p.level === 'CT' ? D.tractLabel(p.code).title : p.name;
    /* On a phone the chips share one row, so the labels shorten rather than
       wrapping and pushing the value out of view. */
    pc.querySelector('.k').textContent = phone ? 'in' : p.kind;
    pc.title = p.kind + ' — tap to change';
    var b = D.BENCHMARKS.filter(function (x) { return x.id === A.state.benchmark; })[0];
    var bc = document.getElementById('benchChip');
    var label = ctx.ref ? ctx.ref.label : (b ? b.label : '—');
    bc.querySelector('.v').textContent = label;
    bc.querySelector('.k').textContent = phone ? 'vs' : 'compared with';
    bc.title = 'Compared with ' + label + ' — tap to change';
  }

  function renderTabs() {
    var avail = A.ctx.can;
    Array.prototype.forEach.call(document.querySelectorAll('#tabs .tab'),
      function (b) {
        var t = b.getAttribute('data-tab');
        b.setAttribute('aria-selected', String(t === A.state.tab));
        var off = (t === 'change' && !avail.change) ||
                  (t === 'peers' && !avail.peers) ||
                  (t === 'population' && !avail.population) ||
                  (t === 'impact' && !avail.impact) ||
                  (t === 'hoods' && !avail.neighbourhoods);
        b.style.display = off ? 'none' : '';
      });
    Array.prototype.forEach.call(document.querySelectorAll('#nav button'),
      function (b) {
        var t = b.getAttribute('data-tab');
        b.setAttribute('aria-selected', String(t === (SECTION[A.state.tab] || A.state.tab)));
        b.hidden = t === 'peers' && !avail.peers;
      });
    document.body.setAttribute('data-screen', A.state.tab);
  }

  /* ====================================================== the pickers */

  function sheet(title, bodyHTML, opts) {
    opts = opts || {};
    closeSheet();
    var scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.id = 'scrim';
    var el = document.createElement('div');
    el.className = 'sheet' + (opts.wide ? ' wide' : '');
    el.id = 'sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML =
      '<div class="sheet-head"><h3>' + C.esc(title) + '</h3>' +
      '<button class="iconbtn" data-close aria-label="Close">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' + bodyHTML;
    document.body.appendChild(scrim);
    document.body.appendChild(el);
    scrim.addEventListener('click', closeSheet);
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeSheet();
    });
    document.addEventListener('keydown', escClose);
    return el;
  }
  function escClose(e) { if (e.key === 'Escape') closeSheet(); }
  function closeSheet() {
    var s = document.getElementById('sheet');
    var c = document.getElementById('scrim');
    if (s) s.remove();
    if (c) c.remove();
    document.removeEventListener('keydown', escClose);
  }
  A.sheet = sheet;
  A.closeSheet = closeSheet;

  A.openPlacePicker = function () {
    var el = sheet('Where?',
      '<div class="sheet-head" style="border:0;padding-bottom:0">' +
      '<input class="search" id="q" placeholder="Municipality, region, or neighbourhood…" ' +
      'autocomplete="off" spellcheck="false">' +
      (root.GRA.home && 'geolocation' in navigator
        ? '<button type="button" class="btn home-btn pick-here" id="pickHere">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 ' +
          '7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>' +
          '<span>Use where I am</span></button>' +
          '<div class="home-msg" id="pickHereMsg" hidden role="status" aria-live="polite"></div>'
        : '') +
      '</div>' +
      '<div class="sheet-body"><div class="optlist" id="results"></div></div>' +
      '<div class="sheet-foot" id="pickFoot">577 municipalities · 49 census divisions · ' +
      '11 economic regions · 47 metropolitan areas · 2,533 neighbourhoods</div>');

    var q = el.querySelector('#q');
    var results = el.querySelector('#results');
    var here = el.querySelector('#pickHere');
    if (here) here.addEventListener('click', function () {
      root.GRA.home.locate(el.querySelector('#pickHereMsg'), here);
    });
    var cur = -1, list = [];

    function paint() {
      var text = q.value.trim();
      var wantTracts = text.length >= 2;
      if (wantTracts && !D.ctWork) {
        D.loadTracts().then(paint);
      }
      list = D.search(text, { includeTracts: wantTracts && !!D.ctWork });

      var html = '';
      if (!text && A.recent && A.recent.length) {
        html += '<div class="group-label">Recently</div>';
        A.recent.slice(0, 5).forEach(function (code) {
          var p = D.byCode[code];
          if (p) html += optHTML(p);
        });
        html += '<div class="group-label">Largest</div>';
      }
      if (!list.length) {
        html += '<div class="empty" style="padding:30px 10px">' +
          '<div class="big">Nothing by that name.</div>' +
          '<div>Try fewer letters, or a nearby larger place.</div></div>';
      } else {
        var lastLevel = null;
        list.forEach(function (p) {
          if (text && p.level !== lastLevel) {
            html += '<div class="group-label">' + levelPlural(p.level) + '</div>';
            lastLevel = p.level;
          }
          html += optHTML(p);
        });
      }
      results.innerHTML = html;
      cur = -1;
    }

    function optHTML(p) {
      var label = p.level === 'CT' ? D.tractLabel(p.code) : null;
      var sub = label ? label.sub : subtitleFor(p);
      return '<button class="opt" data-code="' + p.code + '" role="option" ' +
        'aria-selected="' + (p.code === A.state.place) + '">' +
        '<span class="nm">' + C.esc(label ? label.title : p.name) +
        (sub ? '<small>' + C.esc(sub) + '</small>' : '') + '</span>' +
        '<span class="kind">' + C.esc(shortKind(p)) + '</span>' +
        '<span class="sz">' + (p.pop2021 ? C.fmt(p.pop2021) : '—') + '</span></button>';
    }

    q.addEventListener('input', paint);
    q.addEventListener('keydown', function (e) {
      var opts = results.querySelectorAll('.opt');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (cur >= 0 && opts[cur]) opts[cur].classList.remove('cur');
        cur += e.key === 'ArrowDown' ? 1 : -1;
        cur = Math.max(0, Math.min(opts.length - 1, cur));
        if (opts[cur]) {
          opts[cur].classList.add('cur');
          opts[cur].scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter') {
        var pick = cur >= 0 ? opts[cur] : opts[0];
        if (pick) { A.setPlace(pick.getAttribute('data-code')); closeSheet(); }
      }
    });
    results.addEventListener('click', function (e) {
      var b = e.target.closest('[data-code]');
      if (b) { A.setPlace(b.getAttribute('data-code')); closeSheet(); }
    });
    paint();
    setTimeout(function () { q.focus(); }, 60);
  };

  function subtitleFor(p) {
    var bits = [];
    if (p.level === 'CSD') {
      if (p.cd && D.geo.cd_names[p.cd]) bits.push(D.geo.cd_names[p.cd]);
      if (p.cma && D.geo.cma_names[p.cma]) bits.push(D.geo.cma_names[p.cma]);
    }
    if (p.level === 'CMA') bits.push('metropolitan area or agglomeration');
    if (p.level === 'ER') bits.push('economic region');
    return bits.join(' · ');
  }
  A.subtitleFor = subtitleFor;

  function shortKind(p) {
    /* words, not codes: "ER" and "CMA/CA" meant nothing to a reader */
    return { CSD: D.CSD_TYPE[p.csd_type] || 'Municipality', CD: 'County or district',
             ER: 'Region', CMA: 'Metro area', CT: 'Neighbourhood', PR: 'Province',
             CA: 'Canada' }[p.level] || p.level;
  }
  A.shortKind = shortKind;

  function levelPlural(l) {
    return { CSD: 'Municipalities', CD: 'Census divisions',
             ER: 'Economic regions', CMA: 'Metropolitan areas and agglomerations',
             CT: 'Neighbourhoods (census tracts)', PR: 'Province',
             CA: 'Country' }[l] || l;
  }

  A.openBenchmarkPicker = function () {
    var p = A.ctx.place;
    var rows = D.BENCHMARKS.filter(function (b) {
      if (b.id === 'CD') return !!p.cd && p.level === 'CSD';
      if (b.id === 'ER') return !!p.er && p.level === 'CSD';
      if (b.id === 'CMA') return !!p.cma && (p.level === 'CSD' || p.level === 'CT');
      if (b.id === 'PEERS') return A.ctx.can.peers;
      if (b.id === 'CA') return p.level !== 'CA';
      return true;
    });

    var el = sheet('Compared with what?',
      '<div class="sheet-body"><p class="card-note" style="padding:0 8px">' +
      'This is the choice that moves the answer most. A municipality that looks ' +
      'like it is struggling against Ontario often looks unremarkable against ' +
      'its own region.</p><div class="optlist">' +
      rows.map(function (b) {
        var name = b.label;
        if (b.id === 'CD' && D.geo.cd_names[p.cd]) name = D.geo.cd_names[p.cd];
        if (b.id === 'ER' && D.geo.er_names[p.er]) name = D.geo.er_names[p.er];
        if (b.id === 'CMA' && D.geo.cma_names[p.cma]) name = D.geo.cma_names[p.cma];
        return '<button class="opt" data-b="' + b.id + '" ' +
          'aria-selected="' + (b.id === A.state.benchmark) + '">' +
          '<span class="nm">' + C.esc(name) +
          '<small>' + C.esc(b.why) + '</small></span></button>';
      }).join('') + '</div></div>');

    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-b]');
      if (b) { A.setBenchmark(b.getAttribute('data-b')); closeSheet(); }
    });
  };

  /* ------------------------------------------------------------ helpers */

  A.sectorRows = function (ctx, valueOf, opt) {
    opt = opt || {};
    var rows = D.naics.map(function (n, i) {
      return {
        i: i, code: n.code, label: opt.longLabels ? n.name : n.short,
        group: n.group, value: valueOf(i)
      };
    });
    if (opt.sort !== false) {
      rows.sort(function (a, b) {
        return (b.value || 0) - (a.value || 0);
      });
    }
    return rows;
  };

  root.GRA = root.GRA || {};
  root.GRA.app = A;

  /* Theme stamp before first paint, so there is no flash. */
  try {
    var th = localStorage.getItem('gra.theme');
    if (th) document.documentElement.setAttribute('data-theme', th);
  } catch (e) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', A.boot);
  } else {
    A.boot();
  }
}(this));
