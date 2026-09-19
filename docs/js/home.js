/* ==========================================================================
   The phone home screen, and "where am I?".

   On a phone the Overview was a report: five headline figures, two ranked
   lists side by side, a commuting table with a paragraph of caveats, and
   three more cards below. All of it correct; too much of it at once for a
   first look, and hard going for a dyslexic reader.

   The phone home does three things, in this order:
     1. says where you are, with two big ways to change it - "use where I am"
        and "choose a place";
     2. answers the question the tool is asked most - what do people do
        here? - in one sentence and three bars, with a switch between the
        jobs located here and the people who live here;
     3. offers the next questions as big buttons, each one a plain question
        that opens the screen that answers it.
   Everything else is one tap away under "All the numbers", built only when
   opened. Nothing is removed; it is just not all shown at once.

   Location: the phone's position is turned into a municipality on the phone
   itself, by testing it against the 2021 boundary file already used for the
   map. The position is never stored and never sent anywhere.
   ========================================================================== */

(function (root) {
  'use strict';

  var H = {};
  var C, D, M, U, A, L;

  function init() {
    C = root.GRA.charts; D = root.GRA.data; M = root.GRA.methods;
    U = root.GRA.ui; A = root.GRA.app; L = root.GRA.learn;
  }
  function esc(s) { return C.esc(s == null ? '' : String(s)); }

  var ICON = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V13M10 20V7M16 20v-5M22 20H2"/></svg>',
    change: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v5h-5"/></svg>',
    people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="9" cy="7" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/><path d="M17 4.5a3.2 3.2 0 0 1 0 6M18.5 13.8c1.9.9 3 2.8 3 5.2"/></svg>',
    commute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="6" r="2.2"/><path d="M7 17c6-1 4-9 10-10"/></svg>',
    peers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="10" width="5" height="10" rx="1"/><rect x="10" y="6" width="5" height="14" rx="1"/><rect x="17" y="11" width="4" height="9" rx="1"/></svg>',
    learn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
  };

  /* ------------------------------------------------------------ location */

  var boxes = null;   /* per-feature bounding boxes, built once */

  function ringContains(ring, x, y) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) &&
          (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function polyContains(poly, x, y) {
    if (!ringContains(poly[0], x, y)) return false;
    for (var k = 1; k < poly.length; k++) if (ringContains(poly[k], x, y)) return false;
    return true;
  }
  function featureContains(f, x, y) {
    var g = f.geometry;
    if (!g) return false;
    if (g.type === 'Polygon') return polyContains(g.coordinates, x, y);
    if (g.type === 'MultiPolygon') {
      return g.coordinates.some(function (p) { return polyContains(p, x, y); });
    }
    return false;
  }
  function bbox(f) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    var g = f.geometry;
    if (!g) return b;
    var polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    polys.forEach(function (p) {
      p[0].forEach(function (c) {
        if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1];
        if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1];
      });
    });
    return b;
  }

  /* Which municipality holds this point? The boundary file is simplified to
     about 250 m, so a point within a few hundred metres of a boundary can
     land on the wrong side - the answer says so when it is close to one. */
  H.findCSD = function (lon, lat) {
    init();
    var fc = D.boundaries.csd;
    if (!fc || !fc.features) return null;
    if (!boxes) boxes = fc.features.map(bbox);
    for (var i = 0; i < fc.features.length; i++) {
      var b = boxes[i];
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      var f = fc.features[i];
      if (featureContains(f, lon, lat)) {
        var id = f.properties.id;
        /* near a boundary? test four points about 300 m away */
        var dLat = 0.0027, dLon = 0.0027 / Math.cos(lat * Math.PI / 180);
        var near = [[lon + dLon, lat], [lon - dLon, lat], [lon, lat + dLat], [lon, lat - dLat]]
          .some(function (q) { return !featureContains(f, q[0], q[1]); });
        return { code: id, nearEdge: near };
      }
    }
    return null;
  };

  function say(msgEl, html, kind) {
    if (!msgEl) return;
    msgEl.hidden = false;
    msgEl.className = 'home-msg' + (kind ? ' is-' + kind : '');
    msgEl.innerHTML = html;
  }

  /* No timeout on the reader: the phone may take a while to find itself,
     and the only thing on screen is a plain "finding you" line. */
  H.locate = function (msgEl, btn) {
    init();
    if (!('geolocation' in navigator)) {
      say(msgEl, 'This browser cannot share its location. Use <b>Choose a ' +
        'place</b> instead.', 'warn');
      return;
    }
    if (btn) btn.disabled = true;
    say(msgEl, 'Finding where you are…');
    var done = function () { if (btn) btn.disabled = false; };
    Promise.resolve(D.loadBoundaries('csd')).then(function () {
      navigator.geolocation.getCurrentPosition(function (pos) {
        done();
        var hit = H.findCSD(pos.coords.longitude, pos.coords.latitude);
        if (!hit || !D.byCode[hit.code]) {
          say(msgEl, 'You seem to be outside Ontario, or somewhere the census ' +
            'boundary file does not cover. Use <b>Choose a place</b> instead.',
            'warn');
          return;
        }
        A.state.located = { code: hit.code, nearEdge: hit.nearEdge };
        A.state.tab = 'overview';
        if (A.closeSheet) A.closeSheet();
        A.setPlace(hit.code);
      }, function (err) {
        done();
        var why = err && err.code === 1
          ? 'Location is turned off for this page. You can allow it in your ' +
            'browser’s site settings, or use <b>Choose a place</b>.'
          : 'Your phone could not find its position just now. Try again ' +
            'outdoors, or use <b>Choose a place</b>.';
        /* Inside the claude.ai viewer the page runs in a frame that may not
           be allowed to ask. The GitHub Pages copy can. */
        if (err && err.code === 1 && window.top !== window) {
          why += ' If you are viewing this inside claude.ai, open the website ' +
            'version, which can ask for your location.';
        }
        say(msgEl, why, 'warn');
      }, { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 });
    });
  };

  /* ------------------------------------------------------------ the home */

  function topRows(vals, labelOf, n) {
    var tot = vals.reduce(function (s, x) { return s + (x.n || 0); }, 0);
    return vals.map(function (x) {
      return { label: labelOf(x), n: x.n || 0, share: tot ? (x.n || 0) / tot : 0,
               lo: x.lo, hi: x.hi };
    }).sort(function (a, b) { return b.n - a.n; }).slice(0, n || 3);
  }

  function barsHTML(rows) {
    var max = rows[0] ? rows[0].share : 1;
    return rows.map(function (x) {
      return '<div class="hbar"><div class="hbar-top"><span class="hbar-nm">' +
        esc(x.label) + '</span><span class="hbar-v">' +
        Math.round(100 * x.share) + '%</span></div>' +
        '<div class="track"><i style="width:' +
        Math.max(3, 100 * x.share / max) + '%"></i></div></div>';
    }).join('');
  }

  function doing(ctx) {
    var name = esc(ctx.place.name);
    var jobs = null, people = null;
    if (ctx.local) {
      jobs = topRows(ctx.local.map(function (v, i) { return { i: i, n: v || 0 }; }),
        function (x) { return D.naics[x.i].short; }, 20);
    }
    var occ = ctx.place.level === 'CSD' ? D.occupationFor(ctx.place.code) : null;
    if (occ) {
      people = occ.map(function (o) {
        return { label: o.short, n: o.n || 0, share: o.share || 0, lo: o.lo, hi: o.hi };
      }).sort(function (a, b) { return b.n - a.n; });
    }
    var view = A.state.homeView === 'people' && people ? 'people' : 'jobs';

    var c = U.card('What do people do here?', null, { className: 'home-card' });
    if (jobs && people) {
      var seg = document.createElement('div');
      seg.className = 'home-seg';
      seg.setAttribute('role', 'tablist');
      seg.innerHTML =
        '<button type="button" role="tab" data-v="jobs" aria-selected="' +
          (view === 'jobs') + '">Jobs here</button>' +
        '<button type="button" role="tab" data-v="people" aria-selected="' +
          (view === 'people') + '">Residents</button>';
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('[data-v]');
        if (!b || b.getAttribute('data-v') === view) return;
        A.state.homeView = b.getAttribute('data-v');
        A.render();
      });
      c.appendChild(seg);
    }

    var body = document.createElement('div');
    if (view === 'jobs' && jobs) {
      body.innerHTML = '<p class="home-answer">' +
        (L.orderSentence(jobs, function (x) { return M.countSd(x.n); },
          'the jobs located here') || '') +
        (A.state.measure === 'usual' ? '' : L.homeWorkNote(ctx.place.code)) +
        '</p><div class="hbars">' + barsHTML(jobs.slice(0, 3)) + '</div>' +
        '<p class="home-small">Jobs in ' + name + ', sorted by what the ' +
        'employer does. May 2021.</p>';
    } else if (people) {
      body.innerHTML = '<p class="home-answer">' +
        (L.orderSentence(people, L.sdFromCI, 'working residents') || '') +
        '</p><div class="hbars">' + barsHTML(people.slice(0, 3)) + '</div>' +
        '<p class="home-small">People who live in ' + name + ', sorted by ' +
        'the work they do, wherever they work. May 2021.</p>';
    }
    c.appendChild(body);
    if (L) c.appendChild(L.chips([view === 'jobs' ? 'place-of-work' : 'place-of-residence',
      'industry-occupation']));
    return c;
  }

  function glance(ctx) {
    var p = ctx.place;
    var items = [];
    if (p.pop2021) items.push([C.fmt(p.pop2021), 'people live here']);
    if (ctx.jobs) items.push([C.fmt(ctx.jobs), 'jobs are here']);
    if (ctx.jobsRatio != null) {
      var r = ctx.jobsRatio;
      items.push([r.toFixed(2), r >= 1.1 ? 'jobs per worker: people come here to work'
        : r <= 0.9 ? 'jobs per worker: many leave to work'
        : 'jobs per worker: about in balance']);
    }
    if (!items.length) return null;
    var c = U.card(null, null, { className: 'home-card' });
    c.innerHTML = '<div class="home-glance">' + items.map(function (x) {
      return '<div><div class="hg-v">' + x[0] + '</div><div class="hg-l">' +
        x[1] + '</div></div>';
    }).join('') + '</div>';
    return c;
  }

  function nextQuestions(ctx) {
    var p = ctx.place;
    var qs = [
      { icon: 'star', q: 'What is it known for?', a: 'The industries it has more of',
        go: 'structure', sort: 'lq', ok: !!ctx.lq },
      { icon: 'change', q: 'How has work here changed?', a: '2016 to 2021, and back to 2001',
        go: 'change', ok: p.level !== 'CT' },
      { icon: 'people', q: 'Is it growing?', a: 'Population, births, deaths and moves',
        go: 'population', ok: p.level !== 'CT' },
      { icon: 'commute', q: 'Where do people commute?', a: 'Who comes in, who goes out',
        go: 'map', map: 'flows', ok: p.level === 'CSD' && !!ctx.commute },
      { icon: 'peers', q: 'Which places are like it?', a: 'Compare with its peers',
        go: 'peers', ok: p.level === 'CSD' || p.level === 'CT' },
      { icon: 'learn', q: 'Test yourself', a: 'A short quiz, no timer',
        go: 'learn', ok: true }
    ].filter(function (x) { return x.ok; });

    var c = U.card('Find out more', null, { className: 'home-card' });
    var list = document.createElement('div');
    list.className = 'home-qs';
    list.innerHTML = qs.map(function (x, i) {
      return '<button type="button" class="home-q" data-i="' + i + '">' +
        '<span class="hq-i" aria-hidden="true">' + ICON[x.icon] + '</span>' +
        '<span class="hq-t"><span class="hq-q">' + esc(x.q) + '</span>' +
        '<span class="hq-a">' + esc(x.a) + '</span></span>' +
        '<span class="hq-go" aria-hidden="true">' + ICON.arrow + '</span></button>';
    }).join('');
    list.addEventListener('click', function (e) {
      var b = e.target.closest('.home-q');
      if (!b) return;
      var x = qs[+b.getAttribute('data-i')];
      if (x.map) A.state.mapVar = x.map;
      if (x.sort) A.state.sortStructure = x.sort;
      A.go(x.go);
      try { window.scrollTo(0, 0); } catch (err) {}
    });
    c.appendChild(list);
    return c;
  }

  H.render = function (host, ctx, full) {
    init();
    var p = ctx.place;

    /* 1. where */
    var w = U.card(null, null, { className: 'home-card home-where' });
    var located = A.state.located && A.state.located.code === p.code;
    w.innerHTML =
      '<div class="eyebrow">' + (located ? 'You are in' : esc(p.kind)) + '</div>' +
      '<h2 class="home-name">' +
        esc(p.level === 'CT' ? D.tractLabel(p.code).title : p.name) + '</h2>' +
      (located && A.state.located.nearEdge
        ? '<p class="home-small">You are close to a boundary, so this might be ' +
          'the place next door. Check the name.</p>' : '') +
      '<div class="home-actions">' +
        '<button type="button" class="btn btn-primary home-btn" data-act="here">' +
          ICON.pin + '<span>Use where I am</span></button>' +
        '<button type="button" class="btn home-btn" data-act="pick">' +
          ICON.search + '<span>Choose a place</span></button>' +
      '</div>' +
      '<div class="home-msg" hidden role="status" aria-live="polite"></div>';
    var msg = w.querySelector('.home-msg');
    w.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.getAttribute('data-act') === 'here') H.locate(msg, b);
      else A.openPlacePicker();
    });
    host.appendChild(w);

    if (!ctx.local || !ctx.ref) return false;

    /* 2. the answer */
    host.appendChild(doing(ctx));
    var g = glance(ctx);
    if (g) host.appendChild(g);

    /* 3. the next questions */
    host.appendChild(nextQuestions(ctx));

    /* everything else, built only when asked for */
    var more = document.createElement('details');
    more.className = 'home-more';
    more.innerHTML = '<summary>All the numbers for ' + esc(p.name) + '</summary>';
    var inner = document.createElement('div');
    inner.className = 'grid';
    more.appendChild(inner);
    var built = false;
    more.addEventListener('toggle', function () {
      if (more.open && !built) { built = true; full(inner); }
    });
    host.appendChild(more);
    return true;
  };

  root.GRA = root.GRA || {};
  root.GRA.home = H;
})(window);
