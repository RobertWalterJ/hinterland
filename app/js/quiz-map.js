/* ==========================================================================
   Where is this place?

   Robert played a sitting on his phone and stopped at "Which of these is a
   factory town? Dysart et al / Cramahe / North Kawartha". He is a planner who
   has worked across this province, and he could not place any of the three.
   A question about somewhere you cannot find is not a question about Ontario,
   it is a vocabulary test.

   So every question that names a place now carries two things: a small map,
   and a sentence saying where the place is in words. The sentence matters as
   much as the map - it is read aloud, it survives a screenshot, and for a
   reader who knows Belleville it does the whole job on its own.

   WHAT IS DRAWN, AND WHAT IS DELIBERATELY NOT
   The basemap is app/data/locator.json: the outline of Ontario traced from a
   raster of the 577 subdivisions (pipeline/make_locator.py), 4 KB gzipped,
   fetched once on the first question that needs it. Not the 286 KB boundary
   file, which audit 6 took off the boot path and which is not coming back for
   a two-inch picture.

   The window is fitted to the question and then pulled out until it holds at
   least two cities a reader will know, so it never comes back as an empty
   patch of lake - and the drawn shape is held to one aspect ratio, so the
   province reads the same way every time.

   THE ONE RULE ABOUT WHAT MAY BE SHOWN
   On the question screen, only the place the STEM names is drawn. Drawing the
   options would hand over questions like "where do the most X commuters go?",
   where the nearest big dot is usually the answer - a map cue the guessability
   audit cannot see, because it only reads text. Where the options ARE the
   places and the stem names none of them ("which of these is a factory
   town?"), all three are drawn: that is Robert's case, and knowing where
   three towns sit is reasoning, not leakage. The answer screen draws
   everything.
   ========================================================================== */

(function (root) {
  'use strict';

  var M = {};
  var D = root.GRA.data;
  var base = null;              /* the basemap, once fetched */
  var pending = null;

  /* The window is fitted to the question, not fixed. A fixed frame of the
     whole south was tried first: three towns near Brockville came out as
     three dots in one corner with most of the picture given over to places
     the question was not about. The window is fitted to the marks and then
     PULLED OUT until it holds at least two cities a reader will know, which
     is what stops a fitted window from ever coming back empty. */
  var MIN_LON = 2.7;            /* degrees; about 210 km across, so there is
                                   always some coastline to recognise */
  var MIN_LAT = 1.6;
  var ASPECT = 1.55;            /* width to height, drawn */
  var PAD = 0.16;

  M.ready = function () { return !!base; };

  /* Fetched once, on the first question that wants it, and never again. */
  M.load = function () {
    if (base) return Promise.resolve(base);
    if (pending) return pending;
    pending = fetch('data/locator.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { base = j; pending = null; return base; })
      .catch(function () { pending = null; return null; });
    return pending;
  };

  /* ------------------------------------------------------ in words */

  var COMPASS = ['north', 'north-east', 'east', 'south-east',
                 'south', 'south-west', 'west', 'north-west'];

  function km(a, b) {
    var r = Math.PI / 180;
    var la1 = a.lat * r, la2 = b.lat * r;
    var h = Math.pow(Math.sin((la2 - la1) / 2), 2) +
            Math.cos(la1) * Math.cos(la2) *
            Math.pow(Math.sin((b.lon - a.lon) * r / 2), 2);
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* Bearing FROM the reference TO the place, as a compass word: the sentence
     reads "Cramahe is 20 km west of Trenton", so the direction is the one a
     reader would travel from the place they know. */
  function heading(from, to) {
    var r = Math.PI / 180;
    var dy = (to.lat - from.lat);
    var dx = (to.lon - from.lon) * Math.cos((from.lat + to.lat) / 2 * r);
    var deg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    return COMPASS[Math.round(deg / 45) % 8];
  }

  function round5(d) {
    return d < 12 ? Math.round(d) : d < 100 ? 5 * Math.round(d / 5)
                                            : 10 * Math.round(d / 10);
  }

  /* Every municipality big enough that a reader might have heard of it. The
     list is the payload's own, so it cannot drift from the data. */
  var cities = null;
  function cityList() {
    if (cities) return cities;
    cities = (D.byLevel.CSD || []).filter(function (p) {
      return p.pop2021 >= 15000 && p.lat != null && p.lon != null;
    });
    return cities;
  }

  /* A census division as something the map can draw: the question about
     births and deaths is always about a county, and a reader who cannot
     place Cramahe certainly cannot place Stormont, Dundas and Glengarry. */
  M.county = function (cd) {
    if (!base || !base.county_names) return null;
    var c = base.county_names.filter(function (x) { return x.cd === cd; })[0];
    return c ? { code: 'cd:' + cd, name: c.name, lat: c.lat, lon: c.lon,
                 level: 'CD', cd: cd } : null;
  };

  /* "About 20 km west of Quinte West, and 140 km east of Toronto." */
  M.where = function (code) {
    var p = (code && code.indexOf && code.indexOf('cd:') === 0)
      ? M.county(code.slice(3)) : D.byCode[code];
    if (!p || p.lat == null) return '';
    /* The reference has to be a place the reader has heard of, or the
       sentence explains one unknown with another: the first version of this
       told Robert that Brockville is "45 km south of North Grenville". */
    var near = null, big = null;
    cityList().forEach(function (q) {
      if (q.code === p.code) return;
      var d = km(p, q);
      if (q.pop2021 >= 25000 && d <= 200 && (!near || d < near.d)) {
        near = { q: q, d: d };
      }
      if (q.pop2021 >= 150000 && d <= 300 && (!big || d < big.d)) {
        big = { q: q, d: d };
      }
    });
    if (!near) {
      /* the far north: the nearest city of any size, however far */
      cityList().forEach(function (q) {
        if (q.code === p.code) return;
        var d = km(p, q);
        if (!near || d < near.d) near = { q: q, d: d };
      });
    }
    if (!near) return '';
    function leg(x) {
      var d = round5(x.d);
      return (d < 8 ? 'next to ' : 'about ' + d + ' km ' +
              heading(x.q, p) + ' of ') + x.q.name;
    }
    var out = leg(near);
    if (big && big.q.code !== near.q.code && big.d > near.d * 1.4) {
      out += ', and ' + leg(big);
    }
    return out.charAt(0).toUpperCase() + out.slice(1) + '.';
  };

  /* ------------------------------------------------------ the picture

     A CARTOGRAPHIC AUDIT, after Robert said the first version was "still a
     bit confusing". Six things were wrong with it, and each is a rule any
     reference map is expected to keep:

     1. FIGURE AND GROUND. Land was near-white and water was light grey, a
        difference of about 4% in value, and the convention was the wrong way
        round: the eye reads the darker, tinted field as water. You could not
        tell which side of the line you were on. Water is now the tinted
        ground, land the lighter figure, with the coastline carrying the
        boundary.
     2. NOTHING NAMED THE WATER. The strongest orientation cue on any map of
        this province is the lakes, and none of them was labelled. "Cramahe,
        on a grey shape" tells a reader nothing; "Cramahe, on the north shore
        of Lake Ontario" tells them everything. Hydrography is labelled in
        italic, as it has been for two centuries.
     3. NO SENSE OF SCALE. Two dots 40 km apart and two dots 400 km apart
        drew identically, because the window was fitted to whatever the
        question happened to need. There is now a scale bar, and the window
        snaps to a short ladder of fixed widths, so the same distance draws
        the same length from one question to the next.
     4. NO EXTENT CUE. A zoomed window with no indication of WHERE in the
        province it sits is the thing Robert was complaining about in the
        first place. Every map now carries a key map of the whole of Ontario
        with the window drawn on it - the standard answer, and the one the
        first version skipped.
     5. NO HIERARCHY. The places the question was about and the cities given
        for reference were drawn at almost the same weight. The subject is
        now a filled disc with a ring and a bold name; reference cities are
        small hollow rings with quieter names; water names are quieter still.
     6. NO KEY. Nothing on screen said which dot was which. The caption does
        that in words - it is also what read-aloud speaks.                */

  /* Fixed window widths, in degrees of longitude, so that scale is
     comparable between questions instead of fitted to each one. */
  var STEPS = [1.2, 2.0, 3.2, 5.2, 8.5, 14.0, 22.0];
  var ASPECT = 1.5;             /* width to height, as drawn */
  var PAD = 1.25;               /* of the marks' own spread */
  var SCALE_KM = [10, 20, 25, 50, 100, 200, 500, 1000];

  function projector(f) {
    var k = Math.cos((f[1] + f[3]) / 2 * Math.PI / 180);
    return {
      w: (f[2] - f[0]) * k, h: (f[3] - f[1]),
      x: function (lon) { return (lon - f[0]) * k; },
      y: function (lat) { return f[3] - lat; }
    };
  }

  function windowFor(marks) {
    var lo = { lon: Infinity, lat: Infinity }, hi = { lon: -Infinity, lat: -Infinity };
    marks.forEach(function (p) {
      lo.lon = Math.min(lo.lon, p.lon); hi.lon = Math.max(hi.lon, p.lon);
      lo.lat = Math.min(lo.lat, p.lat); hi.lat = Math.max(hi.lat, p.lat);
    });
    var cx = (lo.lon + hi.lon) / 2, cy = (lo.lat + hi.lat) / 2;
    var k = Math.cos(cy * Math.PI / 180);
    var need = Math.max((hi.lon - lo.lon) * PAD,
                        (hi.lat - lo.lat) * PAD * ASPECT / k);
    function frame(w) {
      var h = w * k / ASPECT;
      return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    }
    function holds(f, n) {
      var c = base.anchors.filter(function (a) {
        return a.lon > f[0] && a.lon < f[2] && a.lat > f[1] && a.lat < f[3];
      }).length;
      return c >= n;
    }
    /* the smallest step that holds the marks AND at least one city a reader
       knows - a window with no known city in it is a window with no meaning */
    for (var i = 0; i < STEPS.length; i++) {
      if (STEPS[i] < need) continue;
      var f = frame(STEPS[i]);
      if (holds(f, 1) || i === STEPS.length - 1) return f;
    }
    return frame(STEPS[STEPS.length - 1]);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function pathFor(X, Y, lines) {
    return (lines || base.lines).map(function (line) {
      var d = '';
      for (var i = 0; i < line.length; i++) {
        d += (i ? 'L' : 'M') + X(line[i][0]).toFixed(1) + ' ' +
             Y(line[i][1]).toFixed(1);
      }
      return d + 'Z';
    }).join('');
  }

  /* The key map: the whole province, the window drawn on it. Small, flat,
     and always the same shape, so it becomes the reader's mental Ontario. */
  function keyMap(f, W) {
    var whole = [base.bbox[0], base.bbox[1], base.bbox[2], base.bbox[3]];
    var P = projector(whole);
    var w = Math.round(W * 0.2), h = Math.round(w * P.h / P.w);
    var s = w / P.w;
    var X = function (lon) { return P.x(lon) * s; };
    var Y = function (lat) { return P.y(lat) * s; };
    var box = [X(f[0]), Y(f[3]), X(f[2]) - X(f[0]), Y(f[1]) - Y(f[3])];
    /* never smaller than a visible mark */
    var bw = Math.max(box[2], 7), bh = Math.max(box[3], 7);
    return { w: w, h: h,
      svg: '<rect class="lm-key-water" x="0" y="0" width="' + w + '" height="' + h +
        '" rx="6"/><path class="lm-key-land" fill-rule="evenodd" d="' +
        pathFor(X, Y) + '"/><rect class="lm-key-box" x="' +
        (box[0] - (bw - box[2]) / 2).toFixed(1) + '" y="' +
        (box[1] - (bh - box[3]) / 2).toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + bh.toFixed(1) + '" rx="2"/>' };
  }

  /* A bar of a round number of kilometres, about a quarter of the width. */
  function scaleBar(f, W, H) {
    var wkm = km({ lat: (f[1] + f[3]) / 2, lon: f[0] },
                 { lat: (f[1] + f[3]) / 2, lon: f[2] });
    var want = wkm * 0.25, pick = SCALE_KM[0];
    SCALE_KM.forEach(function (v) { if (v <= want) pick = v; });
    var px = W * pick / wkm;
    var x = 22, y = H - 24;
    return '<g class="lm-scale"><line class="lm-scale-l" x1="' + x + '" y1="' + y +
      '" x2="' + (x + px).toFixed(1) + '" y2="' + y + '"/>' +
      '<line class="lm-scale-l" x1="' + x + '" y1="' + (y - 7) + '" x2="' + x +
      '" y2="' + (y + 7) + '"/><line class="lm-scale-l" x1="' + (x + px).toFixed(1) +
      '" y1="' + (y - 7) + '" x2="' + (x + px).toFixed(1) + '" y2="' + (y + 7) +
      '"/><text class="lm-scale-t" x="' + (x + px / 2).toFixed(1) + '" y="' +
      (y - 14) + '" text-anchor="middle">' + pick + ' km</text></g>';
  }

  /* opts.subject  - the place the question is about (drawn large, named)
     opts.others   - places drawn smaller and named (options, on the answer)
     opts.flowTo   - draw a line from subject to this place (commuting)
     opts.caption  - a line under the map; M.where() when not given       */
  M.svg = function (opts) {
    if (!base) return '';
    opts = opts || {};
    var subject = opts.cd ? M.county(opts.cd)
      : (opts.subject ? D.byCode[opts.subject] : null);
    var others = (opts.others || []).map(function (c) { return D.byCode[c]; })
      .filter(function (p) { return p && p.lat != null; });
    var marks = (subject ? [subject] : []).concat(others);
    if (!marks.length) return '';

    var f = windowFor(marks);
    var P = projector(f);
    var W = 1000, H = Math.round(W * P.h / P.w);
    var s = W / P.w;
    var X = function (lon) { return P.x(lon) * s; };
    var Y = function (lat) { return P.y(lat) * s; };

    var land = pathFor(X, Y);
    /* Counties and built-up areas, which Robert asked for after the first
       map: an outline with two dots on it gives an inland place nothing to
       sit in. The tint is where the people are (Statistics Canada's own
       400-per-square-kilometre rule, applied to census tracts where they
       exist); the hairlines are county boundaries. Both are drawn UNDER
       everything else and kept very quiet - they are the ground the question
       stands on, not the subject. County lines are dropped at the widest
       zooms, where they would be a net of hair over the whole province. */
    /* The county the question is about, filled. A dot in the middle of
       Stormont, Dundas and Glengarry is not where the county IS; the county
       is the shape, and shading it is the difference between a pin and a
       map. */
    var here = '';
    var hereCd = subject && (subject.level === 'CD' ? subject.cd : null);
    if (hereCd && base.county_of && base.county_of[hereCd]) {
      here = '<path class="lm-here" fill-rule="evenodd" d="' +
        pathFor(X, Y, base.county_of[hereCd]) + '"/>';
    }
    var urban = base.urban && base.urban.length
      ? '<path class="lm-urban" fill-rule="evenodd" d="' +
        pathFor(X, Y, base.urban) + '"/>' : '';
    var counties = (base.counties && (f[2] - f[0]) <= 9)
      ? '<path class="lm-county" d="' + pathFor(X, Y, base.counties) + '"/>' : '';

    /* Labels are placed, not just drawn: each claims a box, and one that
       cannot find a free spot beside, above or below its mark is dropped
       rather than printed over its neighbour. The question's own places
       claim theirs first, then cities, then water. */
    var taken = [];
    function free(box) {
      return taken.every(function (t) {
        return box[0] > t[2] || box[2] < t[0] || box[1] > t[3] || box[3] < t[1];
      });
    }
    function place(px, py, text, size, cls, tries) {
      var w = text.length * size * 0.54, h = size * 1.25;
      for (var i = 0; i < tries.length; i++) {
        var dx = tries[i][0], dy = tries[i][1], anc = tries[i][2];
        var x = px + dx, y = py + dy;
        var x0 = anc === 'start' ? x : anc === 'end' ? x - w : x - w / 2;
        var box = [x0 - 3, y - h, x0 + w + 3, y + 4];
        if (box[0] < 2 || box[2] > W - 2 || box[1] < 0 || box[3] > H - 34) continue;
        if (!free(box)) continue;
        taken.push(box);
        return '<text class="' + cls + '" x="' + x.toFixed(1) + '" y="' +
          y.toFixed(1) + '" text-anchor="' + anc + '">' + esc(text) + '</text>';
      }
      return '';
    }
    var BESIDE = [[18, 9, 'start'], [-18, 9, 'end'],
                  [0, -20, 'middle'], [0, 34, 'middle'],
                  [18, -14, 'start'], [-18, -14, 'end']];
    var OVER = [[0, 0, 'middle'], [0, -26, 'middle'], [0, 26, 'middle']];

    /* the key map claims its corner before any label is placed */
    var key = keyMap(f, W);
    var keyX = W - key.w - 12, keyY = 12;
    taken.push([keyX - 8, keyY - 8, keyX + key.w + 8, keyY + key.h + 8]);
    /* and so does the scale bar */
    taken.push([0, H - 74, W * 0.55, H]);

    var dotText = marks.map(function (p) {
      var isSub = subject && p.code === subject.code;
      return place(X(p.lon), Y(p.lat), p.name.split(' /')[0], isSub ? 36 : 31,
                   'lm-text' + (isSub ? ' is-sub' : ''), BESIDE);
    });

    var anchors = base.anchors.filter(function (a) {
      var ax = X(a.lon), ay = Y(a.lat);
      if (ax < 6 || ax > W - 6 || ay < 6 || ay > H - 6) return false;
      return marks.every(function (m) {
        return Math.hypot(X(m.lon) - ax, Y(m.lat) - ay) > W * 0.05;
      });
    }).map(function (a) {
      var ax = X(a.lon), ay = Y(a.lat);
      var label = place(ax, ay, a.name.split(' /')[0], 27, 'lm-atext', BESIDE);
      return label ? '<circle class="lm-adot" cx="' + ax.toFixed(1) + '" cy="' +
        ay.toFixed(1) + '" r="5"/>' + label : '';
    }).join('');

    /* Hydrography, in italic: the lakes are what tell a reader at a glance
       which part of Ontario they are looking at. */
    /* The county the question's place sits in, named the way administrative
       areas have always been named on reference maps: spaced capitals, no
       line of its own. Only one is labelled - the one the reader needs. */
    var countyLabel = '';
    if (subject && subject.cd && subject.level !== 'CD' && base.county_names) {
      var cn = base.county_names.filter(function (c) { return c.cd === subject.cd; })[0];
      if (cn) {
        var cx2 = X(cn.lon), cy2 = Y(cn.lat);
        if (cx2 > 40 && cx2 < W - 40 && cy2 > 30 && cy2 < H - 50) {
          countyLabel = place(cx2, cy2, cn.name.toUpperCase(), 25, 'lm-ctext', OVER);
        }
      }
    }

    var water = (base.water || []).map(function (w) {
      var wx = X(w.lon), wy = Y(w.lat);
      if (wx < 40 || wx > W - 40 || wy < 30 || wy > H - 40) return '';
      return place(wx, wy, w.name, 30, 'lm-wtext', OVER);
    }).join('');

    var flow = '';
    if (opts.flowTo && subject) {
      var t = D.byCode[opts.flowTo];
      if (t && t.lat != null) {
        var x1 = X(subject.lon), y1 = Y(subject.lat);
        var x2 = X(t.lon), y2 = Y(t.lat);
        /* bowed, so the line reads as a journey rather than a ruler */
        var mx = (x1 + x2) / 2 - (y2 - y1) * 0.12;
        var my = (y1 + y2) / 2 + (x2 - x1) * 0.12;
        flow = '<path class="lm-flow" d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
          'Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + x2.toFixed(1) +
          ' ' + y2.toFixed(1) + '"/>';
      }
    }

    var dots = marks.map(function (p, i) {
      var isSub = subject && p.code === subject.code;
      var px = X(p.lon), py = Y(p.lat);
      if (isSub && p.level === 'CD') return dotText[i];   /* the shape is the mark */
      return '<circle class="lm-ring' + (isSub ? ' is-sub' : '') + '" cx="' +
        px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + (isSub ? 13 : 10) +
        '"/><circle class="lm-dot' + (isSub ? ' is-sub' : '') + '" cx="' +
        px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + (isSub ? 8 : 6) +
        '"/>' + dotText[i];
    }).join('');

    var caption = opts.caption != null ? opts.caption
      : (subject ? M.where(subject.code) : '');
    var named = marks.map(function (p) { return p.name.split(' /')[0]; });
    var say = 'Map. ' + (subject ? subject.name + ', with '
      : named.join(', ') + ', on a map of ') + 'southern Ontario. ' + (caption || '');

    return '<figure class="locmap" data-say="' + esc(say) + '">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="lm-svg" ' +
      'role="img" aria-label="' + esc(say) + '">' +
      '<rect class="lm-water" x="0" y="0" width="' + W + '" height="' + H + '"/>' +
      '<path class="lm-land" fill-rule="evenodd" d="' + land + '"/>' +
      here + urban + counties + countyLabel +
      water + flow + anchors + dots +
      scaleBar(f, W, H) +
      '<g transform="translate(' + keyX + ',' + keyY + ')">' + key.svg + '</g>' +
      '</svg>' +
      (caption ? '<figcaption class="lm-cap">' + esc(caption) + '</figcaption>' : '') +
      '</figure>';
  };

  root.GRA = root.GRA || {};
  root.GRA.quizMap = M;
}(this));
