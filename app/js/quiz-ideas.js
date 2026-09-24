/* ==========================================================================
   Big ideas: what the questions add up to.

   The first quiz asked good single questions - which place has more jobs,
   what is the largest industry in X - but they added up to nothing in
   particular, and 1,854 of 2,954 were one form ("which has more jobs?").
   Palimpsest's lesson, carried over: every question belongs to a bigger
   picture, the picture is taught before it is tested, and the reader can
   see which pictures they are building.

   Nine big ideas, in the order they open - from what anyone might know to
   what only the data shows:

     1  Ontario's key industries
     2  What every place has            (commonalities, big and small)
     3  What small towns are like
     4  What big cities are like
     5  Small towns are not all alike   (among small places)
     6  Big cities are not all alike    (among large places)
     7  How places connect
     8  How work in Ontario has changed
     9  Reading the numbers

   Each idea has a LESSON: two or three short sentences, every figure
   computed here from the same payloads as the questions - nothing written
   from memory, and nothing stated that a gate would refuse in a question.
   Its questions then test the lesson and go past it, in three levels:

     1  the basics     province-wide and class-wide facts (the lesson itself)
     2  places         the pattern, in particular places
     3  surprises      where the obvious answer is wrong, and why

   A level opens when the one before it is partly known, so the set grows
   with the reader (quiz-sched.js decides; this file only labels).

   Size classes are census population, 2021, over MUNICIPALITIES only:
   First Nations reserves and unorganised areas are left out of "small
   towns" - they are not towns, and a class average would say nothing true
   about either.
   ========================================================================== */

(function (root) {
  'use strict';

  var I = {};
  var D, M, T, H;

  function init() {
    D = root.GRA.data; M = root.GRA.methods; T = root.GRA.terms;
    H = root.GRA.quizBank._h;
  }

  /* ------------------------------------------------------------ the ideas */

  I.IDEAS = [
    { id: 'key', title: 'Ontario’s key industries',
      ask: 'Which industries does Ontario’s work rest on?' },
    { id: 'every', title: 'What every place has',
      ask: 'What do big and small places have in common?' },
    { id: 'small', title: 'What small towns are like',
      ask: 'How is work in a small town different?' },
    { id: 'big', title: 'What big cities are like',
      ask: 'What do big cities do that small towns don’t?' },
    { id: 'smalldiff', title: 'Small towns are not all alike',
      ask: 'What kinds of small town are there, and where?' },
    { id: 'bigdiff', title: 'Big cities are not all alike',
      ask: 'What makes each big city different?' },
    { id: 'links', title: 'How places connect',
      ask: 'Do people work where they live?' },
    { id: 'change', title: 'How work in Ontario has changed',
      ask: 'What changed, and when?' },
    { id: 'methods', title: 'Reading the numbers',
      ask: 'Which method answers which question, and how far to trust it?' }
  ];
  I.byId = {};
  I.IDEAS.forEach(function (x, i) { x.n = i + 1; I.byId[x.id] = x; });
  I.LEVELS = ['', 'The basics', 'Places', 'Surprises'];

  /* ------------------------------------------------------------ classes */

  var MUNI = { C: 1, CY: 1, CV: 1, T: 1, TP: 1, TV: 1, VL: 1, MU: 1, M: 1 };
  I.classOf = function (p) {
    if (!p || p.level !== 'CSD' || !MUNI[p.csd_type] || p.pop2021 == null) return null;
    return p.pop2021 < 10000 ? 'small' : p.pop2021 < 100000 ? 'mid' : 'big';
  };
  var CLASS_WORD = { small: 'small towns', mid: 'mid-sized places', big: 'big cities' };

  var ctx = null;          /* computed once per bank build */

  function share(v, k) { var t = H.total(v); return t ? (v[k] || 0) / t : 0; }
  function idx(code) {
    for (var i = 0; i < D.naics.length; i++) if (D.naics[i].code === code) return i;
    return -1;
  }
  function low(k) { return D.naics[k].short.toLowerCase(); }
  function pc(x) { return (Math.round(x * 1000) / 10).toFixed(x < 0.1 ? 1 : 0) + '%'; }
  function pct0(x) { return Math.round(100 * x) + '%'; }
  function erName(er) {
    return String(D.geo.er_names[er] || er).split(' / ')[0].replace(/--/g, '–');
  }

  /* Region groups a reader can hold in mind, from economic regions. */
  var AREA = {
    '3590': 'north', '3595': 'north',
    '3560': 'southwest', '3570': 'southwest', '3580': 'southwest',
    '3510': 'east', '3515': 'east',
    '3520': 'central', '3530': 'central', '3540': 'central', '3550': 'central'
  };
  var AREA_NAME = { north: 'Northern Ontario', southwest: 'Southwestern Ontario',
                    east: 'Eastern Ontario', central: 'Central Ontario' };

  /* Kinds of small town, by the one industry they are built around. */
  var TYPES = [
    { id: 'farm', code: '11', name: 'a farming town', word: 'farming and resources',
      minShare: 0.2, minLQ: 3 },
    { id: 'mine', code: '21', name: 'a mining town', word: 'mining', minShare: 0.2, minLQ: 3 },
    { id: 'factory', code: '31-33', name: 'a factory town', word: 'manufacturing',
      minShare: 0.25, minLQ: 2.5 },
    { id: 'tourist', code: '72', name: 'a tourist town', word: 'hotels, restaurants and bars',
      minShare: 0.12, minLQ: 2.5 }
  ];

  function compute() {
    var agg = { small: null, mid: null, big: null }, n = { small: 0, mid: 0, big: 0 };
    var members = { small: [], mid: [], big: [] };
    (D.byLevel.CSD || []).forEach(function (p) {
      var c = I.classOf(p), v = H.vec(p.code, 'total');
      if (!c || !v || !H.total(v)) return;
      n[c]++; members[c].push(p);
      if (!agg[c]) agg[c] = v.map(function () { return 0; });
      v.forEach(function (x, i) { agg[c][i] += x || 0; });
    });
    var sh = {};
    Object.keys(agg).forEach(function (c) {
      var t = H.total(agg[c]);
      sh[c] = agg[c].map(function (x) { return x / t; });
    });
    var on = H.vec('35', 'total');
    var onT = H.total(on);

    /* Economic-region vectors, summed from their census subdivisions. NOT
       read by code: ER and census-division codes are both four digits and
       collide in the payload (3540 is the Kitchener-Waterloo-Barrie region
       AND Huron County), which first put Ontario's agriculture cluster in
       Kitchener at 10 times its share. */
    var erVec = {};
    (D.byLevel.CSD || []).forEach(function (p) {
      var v = H.vec(p.code, 'total');
      if (!p.er || !v) return;
      if (!erVec[p.er]) erVec[p.er] = v.map(function () { return 0; });
      v.forEach(function (x, i) { erVec[p.er][i] += x || 0; });
    });

    /* sectors that lean small, lean big, or sit level - with the mid class
       in line too, so "the same everywhere" is not a U-shape */
    var lean = D.naics.map(function (s, k) {
      var r = sh.small[k] / (sh.big[k] || 1e-9);
      var rm = sh.mid[k] / (sh.big[k] || 1e-9);
      return { k: k, r: r, rm: rm, s: sh.small[k], m: sh.mid[k], b: sh.big[k] };
    });
    var smallLean = lean.filter(function (x) { return x.r >= 1.6 && x.s >= 0.02; })
      .sort(function (a, b) { return b.r - a.r; });
    var bigLean = lean.filter(function (x) { return x.r <= 0.62 && x.b >= 0.025; })
      .sort(function (a, b) { return a.r - b.r; });
    var level = lean.filter(function (x) {
      return x.r >= 0.85 && x.r <= 1.18 && x.rm >= 0.85 && x.rm <= 1.18 &&
             x.s >= 0.05 && x.b >= 0.05;
    });

    /* how different places of a class are from one another */
    function spread(ps) {
      ps = ps.filter(function (p) { return H.total(H.vec(p.code, 'total')) >= 300; });
      var s = 0, k = 0;
      for (var i = 0; i < ps.length; i++) {
        for (var j = i + 1; j < ps.length; j++) {
          var d = M.mixDistance(H.vec(ps[i].code, 'total'), H.vec(ps[j].code, 'total'));
          if (d != null) { s += d; k++; }
        }
      }
      return k ? s / k : null;
    }
    function median(a) {
      a = a.filter(function (x) { return x != null; }).sort(function (x, y) { return x - y; });
      return a.length ? a[Math.floor(a.length / 2)] : null;
    }

    /* the largest employer, counted over municipalities where it clearly is */
    var leads = {};
    members.small.concat(members.mid, members.big).forEach(function (p) {
      var v = H.vec(p.code, 'total');
      var r = v.map(function (x, i) { return { i: i, x: x || 0 }; })
        .sort(function (a, b) { return b.x - a.x; });
      if (H.clear(r[0].x, r[1].x)) leads[r[0].i] = (leads[r[0].i] || 0) + 1;
    });
    var leadRank = Object.keys(leads).map(function (k) { return { k: +k, n: leads[k] }; })
      .sort(function (a, b) { return b.n - a.n; });

    /* small towns by kind */
    var types = {};
    TYPES.forEach(function (ty) {
      var k = idx(ty.code);
      var list = members.small.filter(function (p) {
        var v = H.vec(p.code, 'total'), t = H.total(v);
        if (t < 300 || !v[k]) return false;
        var s = v[k] / t, lq = s / (on[k] / onT);
        return s >= ty.minShare && lq >= ty.minLQ && v[k] >= 100;
      });
      var none = members.small.filter(function (p) {
        var v = H.vec(p.code, 'total'), t = H.total(v);
        return t >= 300 && (v[k] || 0) / t <= 0.03;
      });
      var byArea = {};
      list.forEach(function (p) { var a = AREA[p.er]; if (a) byArea[a] = (byArea[a] || 0) + 1; });
      types[ty.id] = { ty: ty, k: k, list: list, none: none, byArea: byArea };
    });
    var commuter = members.small.filter(function (p) {
      return p.pop2021 >= 1000 && p.jobsRatio != null && p.jobsRatio < 0.5;
    });

    var bigJobs = members.big.reduce(function (s, p) {
      return s + H.total(H.vec(p.code, 'total')); }, 0);

    return {
      n: n, members: members, sh: sh, on: on, onT: onT,
      smallLean: smallLean, bigLean: bigLean, level: level,
      spread: { small: spread(members.small), big: spread(members.big) },
      selfc: { small: median(members.small.map(function (p) { return p.selfContainmentUsual; })),
               big: median(members.big.map(function (p) { return p.selfContainmentUsual; })) },
      fewerJobs: {
        small: members.small.filter(function (p) { return p.jobsRatio != null && p.jobsRatio < 1; }).length,
        smallN: members.small.filter(function (p) { return p.jobsRatio != null; }).length,
        big: members.big.filter(function (p) { return p.jobsRatio != null && p.jobsRatio > 1; }).length,
        bigN: members.big.filter(function (p) { return p.jobsRatio != null; }).length
      },
      leadRank: leadRank, types: types, commuter: commuter, erVec: erVec,
      bigJobShare: bigJobs / onT
    };
  }

  /* ------------------------------------------------------------ lessons */

  /* Each lesson: at most three sentences, every figure from compute(). A
     sentence whose figure fails its test is left out, not softened. */
  I.lesson = function (id) {
    init();
    if (!ctx) ctx = compute();
    var c = ctx, pts = [];
    if (id === 'key') {
      var top = c.on.map(function (x, k) { return { k: k, x: x || 0 }; })
        .sort(function (a, b) { return b.x - a.x; });
      pts.push('More people in Ontario work in <b>' + low(top[0].k) + '</b> than in ' +
        'any other industry: about ' + Math.round(100 * top[0].x / c.onT) + ' in every ' +
        '100 jobs. Next come ' + low(top[1].k) + ', ' + low(top[2].k) + ' and ' +
        low(top[3].k) + '.');
      var L = c.leadRank;
      if (L.length > 1 && L[0].n >= 1.4 * L[1].n) {
        pts.push('It is also the largest employer in more municipalities than any ' +
          'other industry: ' + L[0].n + ' of them.');
      }
      pts.push('Other industries cluster in particular regions: mining in the north, ' +
        'finance in Toronto. Where an industry clusters says what a region sells.');
      /* the last sentence's two examples are checked in keyRegionItems: if
         either stopped being true, the lesson says the general point only */
      if (!keyRegionClaimHolds()) {
        pts[pts.length - 1] = 'Other industries cluster in particular regions. ' +
          'Where an industry clusters says what a region sells.';
      }
    } else if (id === 'every') {
      var lv = c.level;
      if (lv.length >= 2) {
        var sS = lv.reduce(function (s, x) { return s + x.s; }, 0);
        var sB = lv.reduce(function (s, x) { return s + x.b; }, 0);
        pts.push('Some work is needed wherever people live: ' + list(lv.map(function (x) {
          return low(x.k); })) + '. Together they are ' + pct0(sS) + ' of jobs in small ' +
          'towns and ' + pct0(sB) + ' in big cities. Almost the same.');
      }
      pts.push('This is <b>local-serving</b> work: it follows the people. What makes a ' +
        'place different is the work it sells to the outside world: its <b>economic base</b>.');
      pts.push('So the largest industry in a place is often not the one it is known for.');
    } else if (id === 'small') {
      var sl = c.smallLean.slice(0, 2);
      pts.push('Ontario has ' + c.n.small + ' small towns and townships (under 10,000 ' +
        'people). ' + (sl.length ? cap(low(sl[0].k)) + ' is ' + pc(sl[0].s) +
        ' of their jobs, against ' + pc(sl[0].b) + ' in big cities.' : ''));
      if (c.bigLean.length) {
        pts.push('They have far fewer office jobs: ' + low(c.bigLean[0].k) + ' is ' +
          pc(c.bigLean[0].s) + ' of jobs in small towns, ' + pc(c.bigLean[0].b) +
          ' in big cities.');
      }
      var f = c.fewerJobs;
      if (f.smallN && f.small / f.smallN >= 0.6) {
        pts.push('In ' + f.small + ' of ' + f.smallN + ' small towns there are fewer ' +
          'jobs than working residents: many people work somewhere else.');
      }
    } else if (id === 'big') {
      pts.push('Ontario’s ' + c.n.big + ' big cities (100,000 people or more) hold ' +
        pct0(c.bigJobShare) + ' of its jobs.');
      var bl = c.bigLean.slice(0, 3);
      if (bl.length) {
        pts.push('Their jobs lean to ' + list(bl.map(function (x) { return low(x.k); })) +
          ': ' + low(bl[0].k) + ' is ' + pc(bl[0].b) + ' of big-city jobs, ' +
          pc(bl[0].s) + ' in small towns.');
      }
      if (c.selfc.big != null && c.selfc.small != null &&
          c.selfc.big - c.selfc.small >= 0.1) {
        pts.push('In a typical big city about ' + Math.round(10 * c.selfc.big) + ' in 10 ' +
          'working residents also work there; in a typical small town, about ' +
          Math.round(10 * c.selfc.small) + ' in 10.');
      }
    } else if (id === 'smalldiff') {
      var r = c.spread.small / c.spread.big;
      if (r >= 1.5) {
        pts.push('Small towns differ from one another about ' +
          (Math.round(r * 2) / 2) + ' times as much as big cities do.');
      }
      var kinds = TYPES.map(function (ty) {
        return { ty: ty, n: c.types[ty.id].list.length }; })
        .filter(function (x) { return x.n >= 5; });
      if (kinds.length) {
        pts.push('Many are built around one kind of work: ' + list(kinds.map(function (x) {
          return x.n + ' are ' + x.ty.name.replace(/^a /, '') + 's'; })) + '.');
      }
      var m = c.types.mine;
      if (m && m.list.length >= 5 && (m.byArea.north || 0) >= 0.6 * m.list.length) {
        pts.push('Geography decides a lot: ' + m.byArea.north + ' of the ' + m.list.length +
          ' mining towns are in Northern Ontario.');
      }
    } else if (id === 'bigdiff') {
      var ex = bigExamples().slice(0, 3);
      pts.push('Big cities have much in common, but each has its own lean' +
        (ex.length ? ': ' + list(ex.map(function (e) {
          return e.name + '’s ' + low(e.k); })) : '') + '.');
      if (c.spread.small / c.spread.big >= 1.5) {
        pts.push('Even so, big cities resemble each other more than small towns do: ' +
          'a big economy has room for a bit of everything.');
      }
    } else if (id === 'links') {
      pts.push('Many people do not work where they live. Where the two differ, ' +
        'commuting ties places together.');
      if (c.selfc.small != null) {
        pts.push('In a typical small town about ' + Math.round(10 * c.selfc.small) +
          ' in 10 working residents with a usual workplace work in the town itself.');
      }
      pts.push('A place with more jobs than working residents draws people in; one with ' +
        'fewer sends them out. Groups of places that share workers form a labour market.');
    } else if (id === 'change') {
      var Hs = root.GRA.history;
      var s = Hs && Hs.stories ? Hs.stories() : null;
      if (s && s.manufacturing2001 && s.manufacturing2011 < s.manufacturing2001) {
        pts.push('In 2001 manufacturing was the largest employer of residents in ' +
          s.manufacturing2001 + ' Ontario municipalities. By 2011 it was ' +
          s.manufacturing2011 + '.');
      }
      pts.push('Across much of Ontario, deaths now outnumber births, so growth depends ' +
        'on people moving in.');
      /* history.js keeps the sourced arc and the data juxtaposed, never
         joined by "because". "Shaped" was a cause. */
      pts.push('Trade deals, the auto industry and new municipal boundaries run ' +
        'alongside these numbers. The timeline dates them; it does not explain them.');
    } else if (id === 'methods') {
      /* terms.js and METHODS 2.4 both say shift-share does NOT say why: it is
         an accounting split. The lesson may not claim more than the method. */
      pts.push('Every number here comes from a method with a name. A <b>location ' +
        'quotient</b> says how concentrated work is; <b>shift-share</b> splits a ' +
        'change in jobs into three parts.');
      pts.push('Every census count has some uncertainty. A small difference may be noise, ' +
        'so the tool only calls a difference when it is clearly bigger than that.');
    }
    return pts.filter(Boolean);
  };

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function list(a) {
    if (a.length <= 1) return a.join('');
    return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  }

  /* the region claims in the key lesson, checked against the data */
  function erShare(er, k) { var v = ctx.erVec[er]; return v ? share(v, k) : 0; }
  function topER(k) {
    var ers = Object.keys(D.geo.er_names);
    var r = ers.map(function (er) {
      return { er: er, lq: erShare(er, k) / (ctx.on[k] / ctx.onT) };
    }).sort(function (a, b) { return b.lq - a.lq; });
    return r;
  }
  function keyRegionClaimHolds() {
    var mine = topER(idx('21'))[0], fin = topER(idx('52'))[0];
    return mine && fin && AREA[mine.er] === 'north' && fin.er === '3530';
  }
  function bigExamples() {
    var out = [];
    ['31-33', '91', '52', '61'].forEach(function (code) {
      var k = idx(code);
      var r = ctx.members.big.map(function (p) {
        return { p: p, s: share(H.vec(p.code, 'total'), k) };
      }).sort(function (a, b) { return b.s - a.s; });
      if (r.length > 2 && r[0].s >= 1.15 * r[1].s && r[0].s >= 1.4 * ctx.sh.big[k]) {
        out.push({ name: H.optName(r[0].p), k: k, s: r[0].s, r: r });
      }
    });
    return out;
  }

  /* ------------------------------------------------------ new questions */

  var CHIP_CLASS = { universe: 'Small towns and big cities', when: 'May 2021' };
  var CHIP_ON = { universe: 'Where people work, all Ontario', when: 'May 2021' };

  function it(o) {
    o.strand = 'G';
    var x = H.item(o);
    x.idea = o.idea; x.level = o.level;
    return x;
  }

  I.generate = function (out) {
    init();
    ctx = compute();
    var c = ctx;

    /* ---- key: Ontario's key industries ---- */
    var top = c.on.map(function (x, k) { return { k: k, x: x || 0 }; })
      .sort(function (a, b) { return b.x - a.x; });
    out.push(it({
      id: 'G1:top', idea: 'key', level: 1, form: 'on-top', chip: CHIP_ON,
      stem: 'Which industry employs the most people in Ontario?',
      options: [top[0], top[4], top[8]].map(function (x, i) {
        return { label: D.naics[x.k].short, correct: i === 0 }; }),
      card: { sentence: D.naics[top[0].k].short + ': about ' +
        Math.round(100 * top[0].x / c.onT) + ' in every 100 jobs in Ontario.', picture: null },
      prior: 0.5, terms: ['place-of-work']
    }));
    /* Pairs across ALL twenty industries, not the eight largest. Audit 7
       found the basics 5% of the bank, and two industries - management of
       companies, and other services - never asked about at all, because this
       loop only ever looked at the top eight. Each industry may appear in
       three pairs, so widening it adds basics without flooding the idea. */
    var pairSeen = {}, pairWins = {};
    for (var a = 0; a < top.length; a++) {
      for (var b = a + 2; b < top.length; b += 3) {
        var A_ = top[a], B_ = top[b];
        if (!A_.x || !B_.x || B_.x < 2000) continue;
        if (A_.x < 1.25 * B_.x) continue;
        if (!H.clear(A_.x, B_.x)) continue;
        /* three appearances each, and no industry the right answer more than
           twice: the stem is the same sentence every time, so a repeated
           winner reads as the same question (audit 2b, detector 6) */
        if ((pairSeen[A_.k] || 0) >= 3 || (pairSeen[B_.k] || 0) >= 3) continue;
        if ((pairWins[A_.k] || 0) >= 2) continue;
        pairWins[A_.k] = (pairWins[A_.k] || 0) + 1;
        pairSeen[A_.k] = (pairSeen[A_.k] || 0) + 1;
        pairSeen[B_.k] = (pairSeen[B_.k] || 0) + 1;
        out.push(it({
          id: 'G1:pair:' + D.naics[A_.k].code + '/' + D.naics[B_.k].code,
          idea: 'key', level: 1, form: 'on-pair', chip: CHIP_ON,
          stem: 'Which employs more people in Ontario?',
          options: [{ label: D.naics[A_.k].short, correct: true },
                    { label: D.naics[B_.k].short, correct: false }],
          card: { sentence: cap(low(A_.k)) + ' has ' + H.about(A_.x) +
            ' jobs in Ontario; ' + low(B_.k) + ', ' + H.about(B_.x) + '.', picture: null },
          prior: 0.5, terms: ['place-of-work']
        }));
      }
    }
    var L = c.leadRank;
    if (L.length > 3 && L[0].n >= 1.4 * L[1].n) {
      out.push(it({
        id: 'G1:leads', idea: 'key', level: 1, form: 'on-leads', chip: CHIP_ON,
        stem: 'The largest employer in the most Ontario municipalities?',
        options: [L[0], L[2], L[L.length - 1]].map(function (x, i) {
          return { label: D.naics[x.k].short, correct: i === 0 }; }),
        card: { sentence: D.naics[L[0].k].short + ' is the largest employer in ' +
          L[0].n + ' municipalities, more than any other industry.', picture: null },
        prior: 0.55, terms: ['place-of-work']
      }));
    }
    /* where an industry clusters, by economic region */
    ['11', '21', '31-33', '52', '91', '51', '72', '48-49'].forEach(function (code) {
      var k = idx(code), r = topER(k);
      if (r.length < 6 || r[0].lq < 1.3 || r[0].lq < 1.15 * r[1].lq) return;
      var far = r.slice(Math.ceil(r.length / 2));
      var pick = H.shuffle(far, 'G1er' + code).slice(0, 2);
      var names = [erName(r[0].er)].concat(pick.map(function (x) { return erName(x.er); }));
      if (!H.namesOk(names)) return;
      out.push(it({
        id: 'G1:er:' + code, idea: 'key', level: 2, form: 'er-cluster',
        chip: { universe: 'Where people work, by economic region', when: 'May 2021' },
        stem: 'Where in Ontario is ' + low(k) + ' most concentrated?',
        options: names.map(function (n, i) { return { label: n, correct: i === 0 }; }),
        card: { sentence: names[0] + ': ' + low(k) + ' has ' + r[0].lq.toFixed(1) +
          ' times its share of jobs across Ontario.', picture: null },
        prior: 0.5, terms: ['location-quotient']
      }));
    });

    /* ---- every: what all places share ---- */
    var small1 = c.smallLean[0], big1 = c.bigLean[0];
    c.level.forEach(function (x) {
      if (!small1 || !big1) return;
      out.push(it({
        id: 'G2:level:' + D.naics[x.k].code, idea: 'every', level: 1, form: 'class-level',
        chip: CHIP_CLASS,
        stem: 'Which is about the same share of jobs everywhere, big or small?',
        options: [{ label: D.naics[x.k].short, correct: true },
                  { label: D.naics[small1.k].short, correct: false },
                  { label: D.naics[big1.k].short, correct: false }],
        card: { sentence: D.naics[x.k].short + ': ' + pc(x.s) + ' of jobs in small towns, ' +
          pc(x.b) + ' in big cities. Every place needs it.', picture: null },
        prior: 0.5, terms: ['economic-base']
      }));
    });
    out.push(it({
      id: 'G2:why', idea: 'every', level: 2, form: 'concept', chip: { universe: 'Idea', when: '' },
      stem: 'Why is health care a similar share of jobs everywhere?',
      options: [{ label: 'It serves the people who live there', correct: true },
                { label: 'The province spreads it out evenly by law', correct: false },
                { label: 'Hospitals are built only in small towns', correct: false }],
      card: { sentence: 'It is local-serving work: it follows the population, so its ' +
        'share is much the same wherever people live.', picture: null },
      prior: 0.4, terms: ['economic-base']
    }));
    out.push(it({
      id: 'G2:base', idea: 'every', level: 2, form: 'concept', chip: { universe: 'Idea', when: '' },
      stem: 'What makes one place’s economy different from another’s?',
      options: [{ label: 'The work it sells to people elsewhere', correct: true },
                { label: 'Its shops and schools', correct: false },
                { label: 'Its number of residents', correct: false }],
      card: { sentence: 'Its economic base: work that brings money in from outside. ' +
        'Shops and schools mostly serve the people already there.', picture: null },
      prior: 0.5, terms: ['economic-base']
    }));

    /* ---- small and big: the class contrasts ---- */
    var lv0 = c.level[0];
    c.smallLean.forEach(function (x) {
      if (!big1 || !lv0) return;
      out.push(it({
        id: 'G3:lean:' + D.naics[x.k].code, idea: 'small', level: 1, form: 'class-lean',
        chip: CHIP_CLASS,
        stem: 'Small towns have far more of their jobs in…',
        options: [{ label: D.naics[x.k].short, correct: true },
                  { label: D.naics[lv0.k].short, correct: false },
                  { label: D.naics[big1.k].short, correct: false }],
        card: { sentence: D.naics[x.k].short + ': ' + pc(x.s) + ' of jobs in small towns, ' +
          'against ' + pc(x.b) + ' in big cities.', picture: null },
        prior: 0.45, terms: ['place-of-work']
      }));
    });
    var f = c.fewerJobs;
    if (f.smallN && f.small / f.smallN >= 0.6) {
      out.push(it({
        id: 'G3:fewer', idea: 'small', level: 1, form: 'class-fact', chip: CHIP_CLASS,
        stem: 'In most small towns, jobs are…',
        options: [{ label: 'Fewer than working residents', correct: true },
                  { label: 'More than working residents', correct: false }],
        card: { sentence: 'Fewer, in ' + f.small + ' of ' + f.smallN + ' small towns: ' +
          'many residents work somewhere else.', picture: null },
        prior: 0.4, terms: ['jobs-ratio']
      }));
    }
    c.bigLean.forEach(function (x) {
      if (!small1 || !lv0) return;
      out.push(it({
        id: 'G4:lean:' + D.naics[x.k].code, idea: 'big', level: 1, form: 'class-lean',
        chip: CHIP_CLASS,
        stem: 'Big cities have far more of their jobs in…',
        options: [{ label: D.naics[x.k].short, correct: true },
                  { label: D.naics[lv0.k].short, correct: false },
                  { label: D.naics[small1.k].short, correct: false }],
        card: { sentence: D.naics[x.k].short + ': ' + pc(x.b) + ' of jobs in big cities, ' +
          'against ' + pc(x.s) + ' in small towns.', picture: null },
        prior: 0.45, terms: ['place-of-work']
      }));
    });
    if (c.selfc.big != null && c.selfc.small != null && c.selfc.big - c.selfc.small >= 0.1) {
      out.push(it({
        id: 'G4:selfc', idea: 'big', level: 1, form: 'class-fact', chip: CHIP_CLASS,
        stem: 'Where do more residents work in their own municipality?',
        options: [{ label: 'In big cities', correct: true },
                  { label: 'In small towns', correct: false }],
        card: { sentence: 'Big cities: about ' + Math.round(10 * c.selfc.big) + ' in 10 ' +
          'working residents work there, against ' + Math.round(10 * c.selfc.small) +
          ' in 10 in a typical small town.', picture: null },
        prior: 0.4, terms: ['self-containment']
      }));
    }
    var bs = Math.round(20 * c.bigJobShare) * 5;
    if (bs >= 55 && bs <= 85) {
      out.push(it({
        id: 'G4:share', idea: 'big', level: 1, form: 'class-fact', chip: CHIP_ON,
        stem: 'What share of Ontario’s jobs are in its ' + c.n.big + ' big cities?',
        options: [{ label: 'About ' + bs + '%', correct: true },
                  { label: 'About ' + (bs - 25) + '%', correct: false },
                  { label: 'About ' + (bs - 50) + '%', correct: false }],
        card: { sentence: 'About ' + bs + '%: ' + c.n.big + ' cities of 100,000 or more ' +
          'people hold ' + pct0(c.bigJobShare) + ' of Ontario’s jobs.', picture: null },
        prior: 0.55, terms: ['place-of-work']
      }));
    }

    /* ---- smalldiff: kinds of small town ---- */
    TYPES.forEach(function (ty) {
      var T_ = c.types[ty.id];
      if (!T_ || T_.list.length < 3 || T_.none.length < 5) return;
      /* where they are */
      var areas = Object.keys(T_.byArea).map(function (k) { return { a: k, n: T_.byArea[k] }; })
        .sort(function (x, y) { return y.n - x.n; });
      if (T_.list.length >= 5 && areas.length && areas[0].n >= 0.6 * T_.list.length) {
        var others = Object.keys(AREA_NAME).filter(function (a) { return a !== areas[0].a; });
        var pickA = H.shuffle(others, 'G5area' + ty.id).slice(0, 2);
        out.push(it({
          id: 'G5:area:' + ty.id, idea: 'smalldiff', level: 1, form: 'type-area',
          chip: CHIP_CLASS,
          stem: 'Most of Ontario’s ' + ty.name.replace(/^a /, '') + 's are in…',
          options: [areas[0].a].concat(pickA).map(function (a, i) {
            return { label: AREA_NAME[a], correct: i === 0 }; }),
          card: { sentence: AREA_NAME[areas[0].a] + ': ' + areas[0].n + ' of the ' +
            T_.list.length + ' small towns built on ' + ty.word + '.', picture: null },
          prior: 0.45, terms: ['location-quotient']
        }));
      }
      /* which of these is one - capped, so one kind cannot flood the set */
      H.shuffle(T_.list, 'G5' + ty.id).slice(0, 18).forEach(function (p) {
        var v = H.vec(p.code, 'total'), s = share(v, T_.k);
        var near = T_.none.filter(function (q) { return q.er === p.er; });
        var pool = near.length >= 2 ? near : T_.none;
        var pick = H.shuffle(pool, 'G5n' + p.code).slice(0, 2);
        var names = [H.optName(p)].concat(pick.map(H.optName));
        if (!H.namesOk(names)) return;
        out.push(it({
          id: 'G5:' + ty.id + ':' + p.code, idea: 'smalldiff', level: 2, form: 'type-which',
          place: p.code, chip: { universe: 'Where people work, small towns', when: 'May 2021' },
          stem: 'Which of these is ' + ty.name + '?',
          options: names.map(function (n, i) { return { label: n, correct: i === 0 }; }),
          card: { sentence: names[0] + ': ' + Math.round(100 * s) + ' in every 100 jobs are ' +
            'in ' + ty.word + ', against ' + Math.round(100 * c.on[T_.k] / c.onT) +
            ' across Ontario.', picture: { kind: 'profile', code: p.code } },
          prior: 0.5, terms: ['location-quotient']
        }));
      });
    });
    H.shuffle(c.commuter, 'G5c').slice(0, 12).forEach(function (p) {
      var hi = c.members.small.filter(function (q) {
        return q.er === p.er && q.jobsRatio != null && q.jobsRatio >= 0.95 &&
               q.pop2021 >= 1000;
      });
      var pick = H.shuffle(hi, 'G5cn' + p.code).slice(0, 2);
      if (pick.length < 2) return;
      var names = [H.optName(p)].concat(pick.map(H.optName));
      if (!H.namesOk(names)) return;
      out.push(it({
        id: 'G5:commuter:' + p.code, idea: 'smalldiff', level: 2, form: 'type-which',
        place: p.code, chip: { universe: 'Jobs and working residents', when: 'May 2021' },
        stem: 'Which of these is a commuter town?',
        options: names.map(function (n, i) { return { label: n, correct: i === 0 }; }),
        card: { sentence: names[0] + ' has ' + Math.round(10 * p.jobsRatio) + ' jobs for every ' +
          '10 working residents: most work elsewhere.', picture: null },
        prior: 0.55, terms: ['jobs-ratio']
      }));
    });
    if (c.spread.small / c.spread.big >= 1.5) {
      out.push(it({
        id: 'G5:spread', idea: 'smalldiff', level: 3, form: 'class-fact', chip: CHIP_CLASS,
        stem: 'Whose economies differ more from one another?',
        options: [{ label: 'Small towns', correct: true },
                  { label: 'Big cities', correct: false },
                  { label: 'About the same', correct: false }],
        card: { sentence: 'Small towns, about ' + (Math.round(2 * c.spread.small / c.spread.big) / 2) +
          ' times as much: a small economy is often built on one thing.', picture: null },
        prior: 0.5, terms: ['mix-distance']
      }));
    }

    /* ---- bigdiff: each big city's lean ---- */
    ['31-33', '91', '52', '61', '54', '51', '48-49', '72', '62', '44-45'].forEach(function (code) {
      var k = idx(code);
      var r = c.members.big.map(function (p) {
        return { p: p, s: share(H.vec(p.code, 'total'), k) };
      }).sort(function (x, y) { return y.s - x.s; });
      if (r.length < 6 || r[0].s < 1.08 * r[1].s || r[0].s < 1.25 * c.sh.big[k]) return;
      var t0 = H.total(H.vec(r[0].p.code, 'total')), t1 = H.total(H.vec(r[1].p.code, 'total'));
      /* separation on the counts behind the shares (G1) */
      if (!H.clear(r[0].s * t0 * (t1 / t0), r[1].s * t1)) return;
      var far = r.slice(Math.ceil(r.length / 2));
      var pick = H.shuffle(far, 'G6' + code).slice(0, 2);
      var names = [H.optName(r[0].p)].concat(pick.map(function (x) { return H.optName(x.p); }));
      if (!H.namesOk(names)) return;
      out.push(it({
        id: 'G6:' + code, idea: 'bigdiff', level: 1, form: 'big-lean', place: r[0].p.code,
        chip: { universe: 'Where people work, big cities', when: 'May 2021' },
        stem: 'Which big city has the biggest share in ' + low(k) + '?',
        options: names.map(function (n, i) { return { label: n, correct: i === 0 }; }),
        card: { sentence: names[0] + ': ' + pc(r[0].s) + ' of its jobs, against ' +
          pc(c.sh.big[k]) + ' across big cities.', picture: { kind: 'profile', code: r[0].p.code } },
        prior: 0.5, terms: ['location-quotient']
      }));
    });

    /* ---- links: how many work where they live ---- */
    ['small', 'big'].forEach(function (cl) {
      var v = c.selfc[cl];
      if (v == null) return;
      var right = Math.round(10 * v);
      var opts = [right, right <= 3 ? right + 3 : right - 3, right <= 5 ? right + 5 : right - 5]
        .filter(function (x, i, a) { return x >= 1 && x <= 9 && a.indexOf(x) === i; });
      if (opts.length < 3) return;
      out.push(it({
        id: 'G7:selfc:' + cl, idea: 'links', level: 1, form: 'class-fact', chip: CHIP_CLASS,
        stem: 'In a typical ' + (cl === 'big' ? 'big city' : 'small town') +
          ', how many working residents work there?',
        options: opts.map(function (x, i) { return { label: 'About ' + x + ' in 10', correct: i === 0 }; }),
        card: { sentence: 'About ' + right + ' in 10 of those with a usual workplace. ' +
          'The rest commute out.', picture: null },
        prior: 0.55, terms: ['self-containment']
      }));
    });
  };

  /* ------------------------------------------------ the existing forms */

  /* Every question the bank already makes is placed in an idea and a level
     here - or dropped. The two size forms (1,854 "which has more jobs?" and
     253 "roughly how many?") taught little and crowded out everything else;
     only the size question that teaches something survives: where the place
     with FEWER people has MORE jobs, which is how commuting shows itself. */
  I.classify = function (it) {
    if (it.idea) return true;
    var p = it.place ? D.byCode[it.place] : null;
    var cl = I.classOf(p);
    switch (it.form) {
      case 'howmany': return false;
      case 'bigger': {
        var pair = it.card && it.card.picture;
        var hi = pair && D.byCode[pair.a], lo = pair && D.byCode[pair.b];
        if (!hi || !lo || !hi.pop2021 || !lo.pop2021) return false;
        if (lo.pop2021 < 1.2 * hi.pop2021) return false;
        it.idea = 'links'; it.level = 3;
        /* The stem must not name an option. Naming the place with more PEOPLE
           made the other option right every time: 81 of 81, so a reader who
           knew nothing scored every one of them (audit 4, 24 Sept). The
           surprise moves to the card, where it teaches instead of telling. */
        it.stem = 'Which of these two has more jobs?';
        /* The closing clause is a comparison, so it is gated like the rest:
           said only where jobs clearly outnumber working residents. Two items
           had it the wrong way round - the winner sent more workers out than
           it drew in. */
        var inflow = H.clear(hi.jobs, hi.residentWorkersFixed);
        it.card.sentence = H.optName(lo) + ' has more people, yet ' + H.optName(hi) +
          ' has more jobs: ' + H.about(H.total(H.vec(hi.code, 'total'))) + ' against ' +
          H.about(H.total(H.vec(lo.code, 'total'))) +
          (inflow ? '. People travel in to work.' : '.');
        it.surprise = 1;
        return true;
      }
      case 'largest':
        if (it.surprise) { it.idea = 'every'; it.level = 3; return true; }
        it.idea = cl === 'small' ? 'small' : cl === 'big' ? 'big' : 'key';
        it.level = 2; return true;
      case 'occupation': it.idea = 'key'; it.level = 2; return true;
      /* put three in order: plain size, no method in it, so it sits with the
         other things true of every place (audit 3, 24 Sept) */
      case 'order-three': it.idea = 'every'; it.level = 2; return true;
      /* the myth belongs with the key industries: it is the whole point of a
         location quotient, stated as a claim */
      case 'share-vs-on': it.idea = 'key'; it.level = 2; return true;
      case 'fingerprint':
        it.idea = cl === 'small' ? 'smalldiff' : cl === 'big' ? 'bigdiff' : 'key';
        it.level = 3; return true;
      case 'concentrated':
        it.idea = cl === 'small' ? 'smalldiff' : cl === 'big' ? 'bigdiff' : 'key';
        it.level = 2; return true;
      case 'commute-out': case 'commute-in': it.idea = 'links'; it.level = 2; return true;
      case 'twin': it.idea = cl === 'small' ? 'smalldiff' : cl === 'big' ? 'bigdiff' : 'links';
        it.level = 3; return true;
      case 'yesno': it.idea = 'change'; it.level = 2; return true;
      case 'data-history': it.idea = 'change'; it.level = 1; return true;
      case 'which-first': it.idea = 'change'; it.level = 2; return true;
      case 'which-method': it.idea = 'methods'; it.level = 1; return true;
      case 'read-number': it.idea = 'methods'; it.level = 2; return true;
      case 'cannot': it.idea = 'methods'; it.level = 3; return true;
    }
    return false;
  };

  I._ctx = function () { init(); if (!ctx) ctx = compute(); return ctx; };

  root.GRA = root.GRA || {};
  root.GRA.quizIdeas = I;
}(this));
