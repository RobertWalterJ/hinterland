/* ==========================================================================
   The quiz question bank.

   Nothing in here writes a fact. Every question, every option and every
   answer-card sentence is generated from the payloads the analysis panels
   read, through the same functions (see design/QUIZ-DESIGN.md, principle 1).
   What IS hand-written is phrasing: the templates below. A template can be
   badly worded; it cannot be wrong about Ontario, because it carries no
   number of its own.

   Every candidate passes a set of gates before it is allowed to be a
   question. They are named as in the design:

     G1  separation  - the right answer beats every alternative by 3 standard
                       deviations of the difference, on measured sampling
                       error (METHODS 7.2) - and so does every comparison the
                       answer card states
     G2  floor       - no answer, option or card figure at or below 50
     G3  base size   - concentration items need a real base
     G4  universe    - every item says which population it counts
     G5  currency    - every item carries its date
     G8  invariance  - a jobs answer must hold with AND without home-workers
     G9  names       - no option gives the answer away by name, and no two
                       options can be confused by spelling

   Options are three, not four: the fourth adds reading for little
   discrimination. Stems stay under about twelve words; the universe and the
   date travel in a chip above the stem instead of in it.

   The bank is built once, deterministically, in the browser from data
   already loaded - no new payload, and no second copy of any fact.
   ========================================================================== */

(function (root) {
  'use strict';

  var Q = {};
  var D, M, T;

  function init() {
    D = root.GRA.data; M = root.GRA.methods; T = root.GRA.terms;
  }

  var FLOOR = 50;              /* G2 */
  var Z = 3;                   /* G1 */

  /* ---------------------------------------------------------- helpers */

  /* A small deterministic generator, so a bank built today and tomorrow is
     the same bank and progress keyed to item ids survives a reload. */
  function rng(seedStr) {
    var h = 2166136261;
    for (var i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h += 0x6D2B79F5;
      var t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, seed) {
    var r = rng(seed), a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Numbers for a card are rounded to two significant figures and said as
     "about": the precision of a census count does not survive to the third
     figure, and a reader does not need it to learn the point. */
  function about(n) {
    if (n == null || !isFinite(n)) return '';
    var a = Math.abs(n);
    if (a < 100) return String(Math.round(a));
    var p = Math.pow(10, Math.floor(Math.log10(a)) - 1);
    return 'about ' + (Math.round(a / p) * p).toLocaleString('en-CA');
  }
  function pct(x) { return Math.round(100 * x) + '%'; }

  /* G1 on counts that have no published interval: the borrowed model. */
  function clear(a, b) { return M.clearlyLarger(a, b, Z); }

  /* G1 on counts that DO carry a published interval. */
  function sdCI(lo, hi, n) {
    return (lo != null && hi != null && hi > lo) ? (hi - lo) / 2 / 1.96
                                                 : M.countSd(n);
  }
  function clearCI(a, b) {
    return (a.n - b.n) >= Z * Math.sqrt(Math.pow(sdCI(a.lo, a.hi, a.n), 2) +
                                        Math.pow(sdCI(b.lo, b.hi, b.n), 2));
  }

  /* ---------------------------------------------------------- G9 names */

  /* The name a place is shown by in an option. Bilingual forms are cut to
     the English, and names too unwieldy to read as an answer are refused
     outright rather than squeezed. */
  function optName(p) {
    if (!p) return null;
    var n = String(p.name || '').split(' / ')[0].trim();
    if (/Unorganized|\(Part\)|,/.test(n)) return null;
    if (n.length > 28) return null;
    return n;
  }
  function lead(s) { return String(s).toLowerCase().split(/[\s\/-]+/)[0]; }
  function lev(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1,
          d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[m][n];
  }
  /* Could a reader confuse these two by spelling? Then they may not share a
     question: that would test decoding, not economics. */
  function confusable(a, b) {
    if (lead(a) === lead(b)) return true;
    if (a.slice(0, 5).toLowerCase() === b.slice(0, 5).toLowerCase()) return true;
    /* one name inside the other: Lincoln / West Lincoln, Hawkesbury / East
       Hawkesbury. Both were offered in the same question, and a reader who
       spots the containment can delete one without knowing anything. */
    var la = a.toLowerCase(), lb = b.toLowerCase();
    if (la.indexOf(lb) >= 0 || lb.indexOf(la) >= 0) return true;
    return lev(a, b) <= 3;
  }
  /* Words that say what KIND of place something is, or which way it lies,
     and so carry no clue to identity: "Haldimand County" and "Norfolk
     County" share a word but not a hint. */
  var GENERIC = { north: 1, south: 1, east: 1, west: 1, upper: 1, lower: 1,
    central: 1, greater: 1, county: 1, counties: 1, township: 1, town: 1,
    city: 1, village: 1, municipality: 1, united: 1, and: 1, the: 1, of: 1,
    les: 1, des: 1, de: 1, la: 1, le: 1 };
  function sigWords(s) {
    return String(s).toLowerCase().split(/[^a-zà-ÿ]+/)
      .filter(function (w) { return w.length > 3 && !GENERIC[w]; });
  }
  /* Does an option share a telling word with the place in the question?
     First-word matching alone let "East Hawkesbury -> Hawkesbury" and
     "Central Huron -> Huron East" through: the answer was in the question. */
  function sharesWord(a, b) {
    var wb = sigWords(b);
    return sigWords(a).some(function (w) { return wb.indexOf(w) >= 0; });
  }

  function namesOk(names, stemName) {
    /* every name must exist before any pair is compared - the inner loop
       looks ahead */
    if (names.some(function (n) { return !n; })) return false;
    for (var i = 0; i < names.length; i++) {
      /* an option that contains the stem's name, or is contained by it, is a
         free answer: "Where do the most BRANT commuters go?" beside
         "BRANTford" needs no knowledge at all (audit 4, R2b) */
      var ln = names[i].toLowerCase(), ls = String(stemName || '').toLowerCase();
      if (stemName && ls && (ln.indexOf(ls) >= 0 || ls.indexOf(ln) >= 0)) return false;
      if (stemName && (lead(names[i]) === lead(stemName) ||
                       sharesWord(names[i], stemName))) return false;
      for (var j = i + 1; j < names.length; j++) {
        if (confusable(names[i], names[j])) return false;
      }
    }
    return true;
  }

  /* ---------------------------------------------------------- items */

  /* options: [{label, correct}] - three of them. `say` is what read-aloud
     speaks, with the option's letter, so "A" and "Health care" do not run
     together into "AHealth care". */
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function item(o) {
    if (o.card) {
      o.card.sentence = cap(o.card.sentence);
      if (o.card.more) o.card.more = cap(o.card.more);
    }
    var opts = shuffle(o.options, o.id);
    opts.forEach(function (x, i) {
      x.key = 'ABC'[i];
      x.say = 'Option ' + x.key + '. ' + x.label + '.';
    });
    return {
      id: o.id, strand: o.strand, form: o.form, facet: o.facet || o.form,
      place: o.place || null, cd: o.cd || null, region: o.region || null,
      chip: o.chip, stem: o.stem, prompt: o.prompt || null,
      options: opts, card: o.card, more: o.more || null,
      tags: o.tags || [], surprise: o.surprise || 0,
      prior: o.prior == null ? 0.5 : o.prior, terms: o.terms || [],
      idea: o.idea || null, level: o.level || null
    };
  }

  var CHIP = {
    work: { universe: 'Where people work', when: 'May 2021' },
    live: { universe: 'Where people live', when: 'May 2021' },
    commute: { universe: 'Commuters with a usual workplace', when: 'May 2021' },
    people: { universe: 'Population', when: '' },
    method: { universe: 'Method', when: '' }
  };

  function vec(code, m) { return D.workVec(code, m); }
  function total(v) { var s = 0; if (v) v.forEach(function (x) { s += x || 0; }); return s; }
  function csds() {
    return (D.byLevel.CSD || []).filter(function (p) { return optName(p); });
  }

  /* ===================================================== strand A: size */

  /* A1 - which of two has more jobs located in it, within one census
     division: the comparisons a reader can hold in mind, and a stated rule
     rather than an arbitrary pairing radius. Invariant under G8. */
  function genBigger(out) {
    var byCD = {};
    csds().forEach(function (p) {
      var t = total(vec(p.code, 'total')), u = total(vec(p.code, 'usual'));
      if (t > FLOOR && u > FLOOR) (byCD[p.cd] = byCD[p.cd] || []).push(p);
    });
    /* How many questions any one place may appear in. Audit 2b found seven
       items with the same stem and the same answer, all of them Pickle Lake:
       a pairing rule that takes every pair inside a division gives a small
       division's places a question each time they are paired. */
    var seen = {};
    Object.keys(byCD).forEach(function (cd) {
      var ps = byCD[cd];
      for (var i = 0; i < ps.length; i++) {
        for (var j = i + 1; j < ps.length; j++) {
          var a = ps[i], b = ps[j];
          var ta = total(vec(a.code, 'total')), tb = total(vec(b.code, 'total'));
          var hi = ta >= tb ? a : b, lo = hi === a ? b : a;
          var th = Math.max(ta, tb), tl = Math.min(ta, tb);
          var uh = total(vec(hi.code, 'usual')), ul = total(vec(lo.code, 'usual'));
          if (!clear(th, tl) || !clear(uh, ul)) continue;           /* G1, G8 */
          if (!namesOk([optName(hi), optName(lo)])) continue;         /* G9 */
          if ((seen[hi.code] || 0) >= 4 || (seen[lo.code] || 0) >= 4) continue;
          seen[hi.code] = (seen[hi.code] || 0) + 1;
          seen[lo.code] = (seen[lo.code] || 0) + 1;
          var ratio = th / tl;
          out.push(item({
            id: 'A1:' + [a.code, b.code].sort().join('-'),
            strand: 'A', form: 'bigger', place: hi.code, cd: cd,
            chip: CHIP.work,
            stem: 'Which has more jobs located in it?',
            options: [{ label: optName(hi), correct: true },
                      { label: optName(lo), correct: false }],
            card: {
              sentence: optName(hi) + ' has ' + about(th) + ' jobs located ' +
                'in it, against ' + about(tl) + ' in ' + optName(lo) + '.',
              picture: { kind: 'pair', a: hi.code, b: lo.code }
            },
            prior: ratio > 3 ? 0.2 : ratio > 1.5 ? 0.45 : 0.7,
            terms: ['place-of-work']
          }));
        }
      }
    });
  }

  /* A2 - roughly how many jobs. Three magnitudes a factor of three apart,
     so the options are always separated and a close miss is visibly close. */
  function genHowMany(out) {
    csds().forEach(function (p) {
      var t = total(vec(p.code, 'total'));
      if (t < 1000) return;
      var round2 = function (x) {
        var e = Math.pow(10, Math.floor(Math.log10(x)) - 1);
        return Math.round(x / e) * e;
      };
      var right = round2(t);
      var r = rng('A2' + p.code)();
      /* where the right answer sits among the three varies, so its position
         cannot give it away */
      var mults = r < 1 / 3 ? [1, 3, 9] : r < 2 / 3 ? [1 / 3, 1, 3] : [1 / 9, 1 / 3, 1];
      var opts = mults.map(function (m) {
        var v = round2(t * m);
        return { label: 'About ' + v.toLocaleString('en-CA'), correct: m === 1 };
      });
      if (opts.some(function (o) { return /About 0$/.test(o.label); })) return;
      out.push(item({
        id: 'A2:' + p.code, strand: 'A', form: 'howmany', place: p.code,
        chip: CHIP.work,
        stem: 'Roughly how many jobs are located in ' + optName(p) + '?',
        options: opts,
        card: {
          sentence: optName(p) + ' has ' + about(right) + ' jobs located in it.',
          picture: { kind: 'place', code: p.code }
        },
        prior: 0.55, terms: ['place-of-work']
      }));
    });
  }

  /* ========================================= strand B: what people do */

  /* B1 - fingerprint: a sector profile with no name on it. Which place is it?
     A PROFILE survives where a single largest-sector answer does not, which
     is why it is the main form for "what do people do here". Distractors are
     from the same economic region and must look clearly different. */
  function genFingerprint(out) {
    var byER = {};
    csds().forEach(function (p) {
      var v = vec(p.code, 'total');
      if (v && total(v) >= 2000 && p.er) (byER[p.er] = byER[p.er] || []).push(p);
    });
    Object.keys(byER).forEach(function (er) {
      var ps = byER[er];
      ps.forEach(function (p) {
        var v = vec(p.code, 'total');
        var others = ps.filter(function (q) {
          if (q === p) return false;
          var d = M.mixDistance(v, vec(q.code, 'total'));
          return d != null && d > 0.12;                   /* visibly different */
        });
        if (others.length < 2) return;
        var pick = shuffle(others, 'B1' + p.code).slice(0, 2);
        var names = [optName(p)].concat(pick.map(optName));
        if (!namesOk(names)) return;
        out.push(item({
          id: 'B1:' + p.code, strand: 'B', form: 'fingerprint', place: p.code,
          region: er, chip: CHIP.work,
          stem: 'Whose jobs look like this?',
          prompt: { kind: 'profile', code: p.code },
          options: [{ label: names[0], correct: true },
                    { label: names[1], correct: false },
                    { label: names[2], correct: false }],
          card: {
            sentence: 'That is ' + optName(p) + '. Its jobs are ' +
              topWords(v) + '.',
            picture: { kind: 'profile', code: p.code }
          },
          prior: 0.55, terms: ['place-of-work']
        }));
      });
    });
  }

  /* G1 applies to everything the screen states, not only to the answer
     (QUIZ-DESIGN principle 2). A second sector is named only where it clearly
     beats the THIRD - otherwise it is not the second - and the two are put in
     order only where the first clearly beats the second. Where either test
     fails the card names the largest group and stops: still true, and shorter
     to read. The accuracy audit found this stating 202 ungated ranks, one of
     them between two sectors tied at 520 workers. */
  function topWords(v) {
    var t = total(v);
    var r = v.map(function (x, i) { return { i: i, x: x || 0 }; })
      .sort(function (a, b) { return b.x - a.x; });
    var one = D.naics[r[0].i].short.toLowerCase() + ' (' + pct(r[0].x / t) + ')';
    if (!clear(r[0].x, r[1].x) || !clear(r[1].x, r[2].x)) return 'led by ' + one;
    return 'led by ' + one + ' and ' + D.naics[r[1].i].short.toLowerCase() +
      ' (' + pct(r[1].x / t) + ')';
  }

  /* B2 - the largest sector, where there IS a single answer: G1 against the
     runner-up on BOTH measures (G8), and every distractor above the floor.
     The place's most DISTINCTIVE sector is always offered as a distractor
     when it differs - it is what a place is known for, and so the likeliest
     wrong guess - and items where it differs are marked as surprising. */
  function genLargest(out) {
    var on = vec('35', 'total'), onT = total(on);
    csds().forEach(function (p) {
      var vt = vec(p.code, 'total'), vu = vec(p.code, 'usual');
      if (!vt || !vu || total(vt) < 200) return;
      var rank = function (v) {
        return v.map(function (x, i) { return { i: i, x: x || 0 }; })
          .sort(function (a, b) { return b.x - a.x; });
      };
      var rt = rank(vt), ru = rank(vu);
      if (rt[0].i !== ru[0].i) return;                              /* G8 */
      if (!clear(rt[0].x, rt[1].x) || !clear(ru[0].x, ru[1].x)) return; /* G1 */
      var tt = total(vt);
      /* most distinctive: highest location quotient on a solid base */
      var dist = null;
      vt.forEach(function (x, i) {
        if (!x || x < 200 || !on[i]) return;
        var lq = (x / tt) / (on[i] / onT);
        if (!dist || lq > dist.lq) dist = { i: i, lq: lq };
      });
      var wrong = [rt[1].i];
      var useDist = dist && dist.i !== rt[0].i && dist.lq >= 1.5;
      /* the distinctive sector can BE the runner-up - never offer it twice */
      wrong.push(useDist && dist.i !== rt[1].i ? dist.i : rt[2].i);
      if (wrong.some(function (i) { return (vt[i] || 0) <= FLOOR; })) return; /* G2 */
      var surprise = dist && dist.i !== rt[0].i && dist.lq >= 1.5 ? 1 : 0;
      out.push(item({
        id: 'B2:' + p.code, strand: 'B', form: 'largest', place: p.code,
        chip: CHIP.work,
        stem: 'The largest group of jobs in ' + optName(p) + '?',
        options: [{ label: D.naics[rt[0].i].short, correct: true }].concat(
          wrong.map(function (i) { return { label: D.naics[i].short, correct: false }; })),
        card: {
          sentence: D.naics[rt[0].i].short + ' is ' + pct(rt[0].x / tt) +
            ' of the jobs located in ' + optName(p) + '.',
          more: surprise ? 'It is best known for ' +
            D.naics[dist.i].short.toLowerCase() + ', which is more ' +
            'concentrated here than in Ontario, but smaller.' : null,
          picture: { kind: 'profile', code: p.code }
        },
        surprise: surprise, prior: surprise ? 0.7 : 0.45,
        terms: surprise ? ['place-of-work', 'location-quotient'] : ['place-of-work']
      }));
    });
  }

  /* B3 - the most common occupation among residents, on PUBLISHED intervals. */
  function genOccupation(out) {
    /* No answer may carry more than a fifth of this form. The commonest work
       in most Ontario municipalities is sales and service or trades and
       transport, so 111 of the 123 items this generator used to make had one
       of those two answers, and "say sales and service" scored nine in ten
       of them (audit 2b, 24 Sept). The places kept are the ones where the
       answer is NOT one of the two, first, and then a sample of the rest -
       which is also the interesting half of Ontario. */
    var CAP = 25, used = {};
    var order = csds().slice().sort(function (a, b) {
      var oa = D.occupationFor(a.code), ob = D.occupationFor(b.code);
      var ca = oa && oa[0] ? oa[0].short : '', cb = ob && ob[0] ? ob[0].short : '';
      var ra = /sales|trades/i.test(ca) ? 1 : 0, rb = /sales|trades/i.test(cb) ? 1 : 0;
      return ra - rb || (a.code < b.code ? -1 : 1);
    });
    order.forEach(function (p) {
      var occ = D.occupationFor(p.code);
      if (!occ || occ.length < 3 || !occ[0].n || occ[0].n < 200) return;
      if (!clearCI(occ[0], occ[1])) return;                          /* G1 */
      if (occ[1].n <= FLOOR || occ[2].n <= FLOOR) return;            /* G2 */
      if ((used[occ[0].short] || 0) >= CAP) return;
      used[occ[0].short] = (used[occ[0].short] || 0) + 1;
      out.push(item({
        id: 'B3:' + p.code, strand: 'B', form: 'occupation', place: p.code,
        chip: CHIP.live,
        stem: 'The most common work of people living in ' + optName(p) + '?',
        options: [{ label: occ[0].short, correct: true },
                  { label: occ[1].short, correct: false },
                  { label: occ[2].short, correct: false }],
        card: {
          sentence: pct(occ[0].share) + ' of working residents of ' +
            optName(p) + ' are in ' + occ[0].short.toLowerCase() + '.',
          picture: { kind: 'occupation', code: p.code }
        },
        prior: 0.5, terms: ['place-of-residence', 'industry-occupation']
      }));
    });
  }

  /* B4 - most concentrated of three, in one economic region. The regional
     form is what makes this strand viable: province-wide, only four sectors
     have a defensible single most-concentrated place. G3 base size, and
     separation on the log location quotient with sampling error. */
  function genConcentrated(out) {
    var on = vec('35', 'total'), onT = total(on);
    var byER = {};
    csds().forEach(function (p) {
      if (p.er) (byER[p.er] = byER[p.er] || []).push(p);
    });
    Object.keys(byER).forEach(function (er) {
      for (var k = 0; k < 20; k++) {
        var cand = [];
        byER[er].forEach(function (p) {
          var vt = vec(p.code, 'total'), vu = vec(p.code, 'usual');
          if (!vt || !vu) return;
          var tt = total(vt);
          if (tt < 2000 || !vt[k] || vt[k] < 500 || !vu[k] || vu[k] <= FLOOR) return; /* G3 */
          cand.push({ p: p, lq: (vt[k] / tt) / (on[k] / onT), n: vt[k] });
        });
        if (cand.length < 3) continue;
        cand.sort(function (a, b) { return b.lq - a.lq; });
        var c0 = cand[0], c1 = cand[1];
        if (c0.lq < 1.25) continue;
        var se = Math.sqrt(Math.pow(M.countSd(c0.n) / c0.n, 2) +
                           Math.pow(M.countSd(c1.n) / c1.n, 2));
        if (Math.log(c0.lq) - Math.log(c1.lq) < Z * se) continue;   /* G1 */
        var pick = [c0, c1, cand[cand.length - 1]];
        var names = pick.map(function (c) { return optName(c.p); });
        if (!namesOk(names)) continue;                                /* G9 */
        var sector = D.naics[k].short.toLowerCase();
        out.push(item({
          id: 'B4:' + er + ':' + D.naics[k].code, strand: 'B', form: 'concentrated',
          place: c0.p.code, region: er, chip: CHIP.work,
          stem: 'Most concentrated in ' + sector + '?',
          options: [{ label: names[0], correct: true },
                    { label: names[1], correct: false },
                    { label: names[2], correct: false }],
          card: {
            sentence: names[0] + ' has about ' + c0.lq.toFixed(1) + ' times ' +
              'Ontario’s share of jobs in ' + sector + '.',
            picture: { kind: 'profile', code: c0.p.code }
          },
          prior: 0.65, terms: ['location-quotient']
        }));
      }
    });
  }

  /* ======================================= strand C: connections */

  /* C1 / C2 - the largest share of out- or in-commuters. "The largest
     share", never "most": Mississauga sends 49.8% to Toronto, not most. */
  function genCommute(out, dir) {
    var tf = D.commute && D.commute.top_flows;
    if (!tf) return;
    /* A mirrored pair is one fact asked twice: "where do most Ajax commuters
       go" and "where do most people working in Toronto live" can have the
       same card. 53 such pairs (audit 2b). The OUT item is the one dropped,
       because out-items outnumbered in-items 154 to 101 and the reader was
       seeing one direction of travel far more often than the other. */
    function mirrored(p) {
      var o = tf[p.code + '|out'], i = tf[p.code], back;
      if (!o || !o.length) return false;
      /* the two questions about THIS place have the same answer: most of its
         commuters go to Ottawa, and most of the people working here live in
         Ottawa */
      if (i && i.length && i[0][0] === o[0][0]) return true;
      /* or the pair is asked from both ends: A's commuters go to B, and B's
         workers come from A */
      back = tf[o[0][0]];
      return !!(back && back.length && back[0][0] === p.code);
    }
    csds().forEach(function (p) {
      if (dir === 'out' && mirrored(p)) return;
      var raw = tf[dir === 'out' ? p.code + '|out' : p.code];
      if (!raw) return;
      var flows = raw.filter(function (f) { return f[0] !== p.code && D.byCode[f[0]]; });
      if (flows.length < 3) return;
      if (flows.slice(0, 3).some(function (f) { return f[1] <= FLOOR; })) return; /* G2 */
      if (!clear(flows[0][1], flows[1][1])) return;                   /* G1 */
      var ops = flows.slice(0, 3).map(function (f) { return D.byCode[f[0]]; });
      var names = ops.map(optName);
      if (!namesOk(names, optName(p))) return;                       /* G9 */
      var base = dir === 'out' ? p.outCommuters : p.inCommuters;
      out.push(item({
        id: (dir === 'out' ? 'C1:' : 'C2:') + p.code, strand: 'C',
        form: dir === 'out' ? 'commute-out' : 'commute-in', place: p.code,
        chip: CHIP.commute,
        stem: dir === 'out'
          ? 'Where do the most ' + optName(p) + ' commuters go?'
          : 'Where do the most people working in ' + optName(p) + ' live?',
        options: names.map(function (n, i) { return { label: n, correct: i === 0 }; }),
        card: {
          sentence: dir === 'out'
            ? about(flows[0][1]) + ' people commute from ' + optName(p) +
              ' to ' + names[0] + (base ? ', ' + pct(flows[0][1] / base) +
              ' of those who leave.' : '.')
            : about(flows[0][1]) + ' people come from ' + names[0] + ' to work ' +
              'in ' + optName(p) + (base ? ', ' + pct(flows[0][1] / base) +
              ' of those who travel in.' : '.'),
          picture: { kind: 'flows', code: p.code, dir: dir }
        },
        prior: 0.5, terms: ['self-containment']
      }));
    });
  }

  /* C3 - whose economy is most like X's: the structural twin. There is no
     sampling model for a distance, so the gate is relative: the twin must be
     clearly closer than the next candidate. */
  function genTwin(out) {
    var ps = csds().filter(function (p) { return total(vec(p.code, 'total')) >= 2000; });
    ps.forEach(function (p) {
      var v = vec(p.code, 'total');
      var d = ps.filter(function (q) { return q !== p; }).map(function (q) {
        return { q: q, d: M.mixDistance(v, vec(q.code, 'total')) };
      }).filter(function (x) { return x.d != null; }).sort(function (a, b) { return a.d - b.d; });
      if (d.length < 10 || d[0].d > 0.12 || d[0].d > 0.8 * d[1].d) return;
      /* "of a similar size" has to mean something: the pool was every place
         with 2,000 jobs, so a 67,000-job city was called the same size as a
         16,500-job one. Within a factor of two, or the item is not asked. */
      var tw = total(vec(d[0].q.code, 'total')), tp = total(v);
      if (!tw || Math.max(tw, tp) / Math.min(tw, tp) > 2) return;
      var far = d[Math.floor(d.length / 2)].q;           /* a clearly different one */
      var names = [optName(d[0].q), optName(d[1].q), optName(far)];
      if (!namesOk(names, optName(p))) return;
      out.push(item({
        id: 'C3:' + p.code, strand: 'C', form: 'twin', place: p.code,
        chip: CHIP.work,
        stem: 'Whose jobs are most like ' + optName(p) + '’s?',
        options: names.map(function (n, i) { return { label: n, correct: i === 0 }; }),
        card: {
          sentence: names[0] + ' has the most similar mix of jobs to ' +
            optName(p) + ' of any place of a similar size in Ontario.',
          picture: { kind: 'pair', a: p.code, b: d[0].q.code }
        },
        prior: 0.7, terms: ['mix-distance']
      }));
    });
  }

  /* =========================================== strand D: long view */

  /* D1 - natural decrease, by CENSUS DIVISION. These are never recorded
     against a municipality, and the stem always names the division with its
     type: 19 municipalities share a name with a division. Both answers are
     generated so "yes" cannot be guessed. */
  function genNatural(out) {
    var comp = D.components && D.components.data && D.components.data['2021b'];
    if (!comp) return;
    /* More divisions have had more deaths than births for five years running
       than have not, so the generated pool ran 28 "yes" to 13 "no" and
       answering yes took more than two thirds of them (audit 2b). The
       majority answer is capped at a little over the minority, which leaves
       the cue inside chance without throwing away the finding itself - it is
       still on the card, and in the Learn tab. */
    var yes = 0, no = 0, CAP = 18;
    Object.keys(comp).sort().forEach(function (cd) {
      var rows = D.componentSummary(comp[cd], '2021b');
      if (rows.length < 6) return;
      var last5 = rows.slice(-5);
      var allDown = last5.every(function (r) { return r.natural < 0; });
      var allUp = last5.every(function (r) { return r.natural > 0; });
      if (!allDown && !allUp) return;          /* mixed years: no clean answer */
      var name = D.geo.cd_names[cd];
      if (!name) return;
      if (allDown && yes >= CAP) return;
      if (allDown) yes++; else no++;
      var gap = last5.reduce(function (s, r) { return s + r.natural; }, 0);
      out.push(item({
        id: 'D1:' + cd, strand: 'D', form: 'yesno', cd: cd,
        chip: { universe: 'Census division · population',
                when: last5[0].year + '–' + last5[4].year },
        stem: 'More deaths than births each year in ' + name + '?',
        options: [
          { label: 'Yes — more deaths than births', correct: allDown },
          { label: 'No — more births than deaths', correct: allUp }
        ],
        card: {
          sentence: allDown
            ? 'Yes: ' + about(-gap) + ' more deaths than births over those five years.'
            : 'No: ' + about(gap) + ' more births than deaths over those five years.',
          /* true by identity: population change = natural change + migration */
          more: allDown ? 'So any growth in ' + name + ' now comes from people ' +
            'moving in.' : null,
          picture: { kind: 'components', cd: cd }
        },
        surprise: allDown ? 0.5 : 0, prior: 0.4,
        terms: ['natural-increase', 'components']
      }));
    });
  }

  /* ============================================ strand E: methods */

  /* E1 - which method answers this question? Built from the method map, so
     it cannot disagree with it. Distractors come from other rows. */
  function genWhichMethod(out) {
    T.map.forEach(function (row, ri) {
      row.ids.forEach(function (id, k) {
        if (k > 0) return;                   /* one item per question */
        var t = T.byId[id];
        var others = T.map.filter(function (r, j) { return j !== ri; })
          .map(function (r) { return T.byId[r.ids[0]]; })
          .filter(function (o) { return o.kind === 'method'; });
        var pick = shuffle(others, 'E1' + id).slice(0, 2);
        out.push(item({
          id: 'E1:' + id, strand: 'E', form: 'which-method',
          chip: CHIP.method,
          stem: row.q,
          options: [{ label: t.name, correct: true }].concat(pick.map(function (o) {
            return { label: o.name, correct: false };
          })),
          card: { sentence: t.name + ': ' + t.plain, picture: null },
          more: { term: id },
          prior: 0.5, terms: [id]
        }));
      });
    });
  }

  /* E2 - what a method CANNOT tell you. The limit is the part of a method
     people forget, and the one that stops a result being overread. */
  function genCannot(out) {
    T.list.filter(function (t) { return t.kind === 'method'; }).forEach(function (t) {
      var others = T.list.filter(function (o) {
        return o.kind === 'method' && o.group !== t.group;
      });
      var pick = shuffle(others, 'E2' + t.id).slice(0, 2);
      out.push(item({
        id: 'E2:' + t.id, strand: 'E', form: 'cannot',
        chip: CHIP.method,
        stem: 'A limit of the ' + t.name.toLowerCase() + '?',
        options: [{ label: t.cant, correct: true }].concat(pick.map(function (o) {
          return { label: o.cant, correct: false };
        })),
        card: { sentence: t.cant, picture: null },
        more: { term: t.id },
        prior: 0.65, terms: [t.id]
      }));
    });
  }

  /* E3 - read the number: what does a location quotient of X mean? */
  function genReadLQ(out) {
    [[0.4, 0], [1.0, 1], [1.6, 2], [3.2, 3]].forEach(function (pair) {
      var lq = pair[0];
      var bands = ['has much less than its share', 'has about its share',
                   'is specialised in it', 'is strongly specialised in it'];
      var right = pair[1];
      var wrong = [0, 1, 2, 3].filter(function (i) { return i !== right; });
      /* bands 2 and 3 are "specialised" and "strongly specialised": the
         second entails the first, so a reader can rule BOTH out at once.
         They are never offered together. */
      if (right === 3) wrong = wrong.filter(function (i) { return i !== 2; });
      if (right === 2) wrong = wrong.filter(function (i) { return i !== 3; });
      var pick = shuffle(wrong, 'E3' + lq).slice(0, 2);
      out.push(item({
        id: 'E3:' + lq, strand: 'E', form: 'read-number',
        chip: CHIP.method,
        stem: 'A location quotient of ' + lq.toFixed(1) + ' means the place…',
        options: [{ label: bands[right], correct: true }].concat(pick.map(function (i) {
          return { label: bands[i], correct: false };
        })),
        card: {
          sentence: 'At ' + lq.toFixed(1) + ', the industry is ' +
            T.lqBand(lq) + ': its share here is ' + lq.toFixed(1) +
            ' times its share in the reference.',
          picture: null
        },
        more: { term: 'location-quotient' },
        prior: 0.35, terms: ['location-quotient']
      }));
    });
  }

  /* ============================================ strand F: history */

  /* F1 - which came first? Pairs from the SOURCED timeline (history.js),
     each entry checked against its primary record. At least four years
     apart, so the order is never a matter of months. */
  function genWhichFirst(out) {
    var H = root.GRA.history;
    if (!H || !H.timeline) return;
    /* Pairs close together in time first, and a cap on how often any one
       event can appear. Every pair of ten events is 45 questions under one
       stem that says nothing on its own - "Which came first?" - so the
       reader met the same sentence with the same answer eight times (audit
       2b). The near pairs are also the ones worth asking: 1989 against 1994
       is a question, 1965 against 2021 is not. */
    var tl = H.timeline.slice().sort(function (x, y) { return x.year - y.year; });
    var asked = {}, wins = {};
    for (var i = 0; i < tl.length; i++) {
      for (var j = i + 1; j < tl.length; j++) {
        var a = tl[i], b = tl[j];
        if (j - i > 4) continue;             /* near in sequence, not across it */
        if (Math.abs(a.year - b.year) < 4) continue;
        /* 'The Auto Pact' before 'The Auto Pact's exemption ends' is logic,
           not history: a shared word gives the order away */
        if (sharesWord(a.title, b.title)) continue;
        var early = a.year < b.year ? a : b, late = early === a ? b : a;
        if ((wins[early.title] || 0) >= 2) continue;
        if ((asked[early.title] || 0) >= 4 || (asked[late.title] || 0) >= 4) continue;
        wins[early.title] = (wins[early.title] || 0) + 1;
        asked[early.title] = (asked[early.title] || 0) + 1;
        asked[late.title] = (asked[late.title] || 0) + 1;
        out.push(item({
          id: 'F1:' + early.year + '-' + late.year + ':' +
            early.title.slice(0, 12) + '/' + late.title.slice(0, 12),
          strand: 'F', form: 'which-first',
          chip: { universe: 'Ontario’s economic history', when: '' },
          stem: 'Which came first?',
          /* the short label, so the options are of a size with each other:
             a five-character option beside a fifty-character one is a cue */
          options: [{ label: early.label || early.title, correct: true },
                    { label: late.label || late.title, correct: false }],
          card: {
            sentence: early.title + ' came first, in ' + early.year +
              '. ' + late.title + ' followed in ' + late.year + '.',
            more: early.fact,
            picture: null
          },
          prior: Math.abs(a.year - b.year) > 15 ? 0.3 : 0.55,
          terms: []
        }));
      }
    }
  }

  /* F2 - history the data tells: questions generated from the same figures
     the Learn tab shows, so the quiz and the page cannot disagree. */
  function genDataHistory(out) {
    var H = root.GRA.history;
    if (!H || !H.stories) return;
    var s = H.stories();
    if (s.manufacturing2001 && s.manufacturing2011 &&
        s.manufacturing2011 < s.manufacturing2001) {
      out.push(item({
        id: 'F2:manufacturing', strand: 'F', form: 'data-history',
        chip: { universe: 'Where people live', when: '2001 to 2011' },
        stem: 'Towns led by manufacturing, 2001 to 2011?',
        options: [
          { label: 'Far fewer', correct: true },
          { label: 'About the same', correct: false },
          { label: 'Far more', correct: false }],
        card: {
          sentence: 'Far fewer: from ' + s.manufacturing2001 + ' municipalities to ' +
            s.manufacturing2011 + '.',
          more: 'Counted where manufacturing clearly led, beyond sampling error.',
          picture: null
        },
        prior: 0.35, terms: ['place-of-residence']
      }));
    }
    var nd = s.natural['2011b'] || [];
    var nd2 = s.natural['2021b'] || [];
    var first = nd[0], peak = nd2.reduce(function (m, r) {
      return !m || r.dec > m.dec ? r : m; }, null);
    if (first && peak && peak.dec >= 3 * Math.max(1, first.dec)) {
      var opts = [first.dec, Math.round(peak.dec / 3), peak.dec];
      if (new Set(opts).size === 3) {
        out.push(item({
          id: 'F2:natural-' + first.year, strand: 'F', form: 'data-history',
          chip: { universe: 'Census division · population', when: String(first.year) },
          stem: 'Divisions with more deaths than births, ' + first.year + '?',
          options: opts.map(function (v) {
            return { label: v + ' of ' + first.n, correct: v === first.dec };
          }),
          card: {
            sentence: first.dec + ' of ' + first.n + ' in ' + first.year +
              '. By ' + peak.year + ' it was ' + peak.dec + '.',
            picture: null
          },
          surprise: 0.5, prior: 0.6, terms: ['natural-increase']
        }));
      }
    }
  }


  /* A3 - put three places in order, most jobs to fewest, inside one census
     division. Audit 3 found half the bank doing one task - a place is named,
     pick the fact - and no task anywhere that asks for a SEQUENCE by size.
     The gates are the strictest in the bank because two comparisons have to
     hold at once: G1 on BOTH adjacent pairs and on BOTH measures (G8), every
     place above the floor (G2), and no two names confusable (G9). The three
     options are the same three names in different orders, so the longest
     option is never the answer. */
  function genOrderThree(out) {
    var byCD = {};
    csds().forEach(function (p) {
      var t = total(vec(p.code, 'total')), u = total(vec(p.code, 'usual'));
      if (t > FLOOR && u > FLOOR) (byCD[p.cd] = byCD[p.cd] || []).push(p);
    });
    Object.keys(byCD).sort().forEach(function (cd) {
      var ps = byCD[cd].slice().sort(function (x, y) {
        return total(vec(y.code, 'total')) - total(vec(x.code, 'total'));
      });
      var made = 0, i = 0;
      /* consecutive triples down the size order, so the three items a
         division yields are about different places rather than three
         re-shuffles of its three biggest */
      while (i + 2 < ps.length && made < 3) {
        var a = ps[i], b = ps[i + 1], c = ps[i + 2];
        var ta = total(vec(a.code, 'total')), tb = total(vec(b.code, 'total')),
            tc = total(vec(c.code, 'total'));
        var ua = total(vec(a.code, 'usual')), ub = total(vec(b.code, 'usual')),
            uc = total(vec(c.code, 'usual'));
        var names = [optName(a), optName(b), optName(c)];
        if (clear(ta, tb) && clear(tb, tc) &&                       /* G1 */
            clear(ua, ub) && clear(ub, uc) &&                       /* G8 */
            namesOk(names)) {                                       /* G9 */
          var order = function (x, y, z) { return x + ', then ' + y + ', then ' + z; };
          out.push(item({
            id: 'A3:' + [a.code, b.code, c.code].join('-'),
            strand: 'A', form: 'order-three', place: a.code, cd: cd,
            chip: CHIP.work,
            stem: 'Which order, from most jobs to fewest?',
            options: [
              { label: order(names[0], names[1], names[2]), correct: true },
              { label: order(names[1], names[0], names[2]), correct: false },
              { label: order(names[2], names[1], names[0]), correct: false }
            ],
            card: {
              sentence: names[0] + ' has ' + about(ta) + ' jobs, ' + names[1] +
                ' ' + about(tb) + ', and ' + names[2] + ' ' + about(tc) + '.',
              /* no chart: a two-place picture shows two of the three places
                 the question is about, and it put Next 55 px below the fold
                 on a 375x812 screen (measured, audit 5) */
              picture: null
            },
            prior: 0.5, terms: ['place-of-work']
          }));
          made++;
          i += 3;
        } else {
          i += 1;
        }
      }
    });
  }

  /* B5 - is this place's share of a sector bigger than Ontario's? A location
     quotient, asked without the words. Two thirds of the bank names a place
     and asks for a fact about it; this asks the reader to hold a place
     against the province, which is the comparison the whole tool is built on.

     The first version of this shape asked whether the sector a place is KNOWN
     for is the one that employs most people there. It was thrown away before
     it shipped: the answer was in the sector name. Naming farming or mining
     meant "false" in 24 items out of 24, naming health or manufacturing meant
     "true" in 28 out of 29, so a reader who knew nothing about Ontario but
     knew that few people farm could take most of them. The version below is
     balanced sector by sector - every sector that appears at all appears as
     often true as false - so the name of the sector carries no information,
     and one item per place so no place is over-asked. */
  function genShareVsOntario(out) {
    var on = vec('35', 'total'), onT = total(on);
    var bySector = {};
    csds().forEach(function (p) {
      var vt = vec(p.code, 'total'), vu = vec(p.code, 'usual');
      if (!vt || !vu) return;
      var tt = total(vt), tu = total(vu);
      if (tt < 500) return;
      var best = null;
      vt.forEach(function (x, i) {
        if (!x || x < 200 || !on[i]) return;
        /* the gate is on COUNTS, not on the ratio: the place's own count
           against the count the province's share would predict, separated by
           the same rule as everywhere else (G1). And it must hold on both
           measures (G8), so the answer does not turn on who was at work in
           the reference week. */
        var e = tt * (on[i] / onT), eu = tu * (on[i] / onT);
        var over = clear(x, e) && clear(vu[i] || 0, eu);
        var under = clear(e, x) && clear(eu, vu[i] || 0);
        if (!over && !under) return;
        var lift = Math.abs(Math.log((x / tt) / (on[i] / onT)));
        if (!best || lift > best.lift) {
          best = { i: i, x: x, e: e, tt: tt, over: over, lift: lift, p: p, vt: vt };
        }
      });
      if (best) (bySector[best.i] = bySector[best.i] || []).push(best);
    });
    var picked = [];
    Object.keys(bySector).forEach(function (k) {
      var over = [], under = [];
      bySector[k].slice().sort(function (a, b) { return a.p.code < b.p.code ? -1 : 1; })
        .forEach(function (r) { (r.over ? over : under).push(r); });
      /* as many true as false, and never more than six of one sector */
      var n = Math.min(over.length, under.length, 6);
      picked = picked.concat(over.slice(0, n), under.slice(0, n));
    });
    picked.forEach(function (r) {
      var name = D.naics[r.i].short;
      out.push(item({
        id: 'B5:' + r.p.code, strand: 'B', form: 'share-vs-on', place: r.p.code,
        chip: CHIP.work,
        /* asked as a question, not as "True or false: ...". The prefix put
           the word "false" in the stem and in exactly one option, which is
           the stem-echo cue the guessability audit watches - an artefact
           worth none of the 42 items it marked. */
        /* "share", not "more": the question is about proportion, and a
           stem that reads as a count would be a different question. Kept
           inside the twelve-word limit the read-aloud check enforces. */
        stem: 'Bigger share of ' + optName(r.p) + '’s jobs in ' +
          name.toLowerCase() + ' than Ontario’s?',
        options: [{ label: 'True', correct: r.over },
                  { label: 'False', correct: !r.over }],
        card: {
          sentence: name + ' is ' + pct(r.x / r.tt) + ' of the jobs located in ' +
            optName(r.p) + ', against ' + pct(on[r.i] / onT) + ' across Ontario.',
          /* no chart: the card states both shares, and the whole sector
             profile underneath pushed Next below the fold on a phone
             (measured at 1,046 px against an 812 px screen, audit 5) */
          picture: null
        },
        surprise: r.lift > 1.6 ? 1 : 0, prior: 0.5,
        terms: ['location-quotient', 'place-of-work']
      }));
    });
  }

  /* ---------------------------------------------------------- build */

  Q.build = function () {
    init();
    if (Q._bank) return Q._bank;
    var out = [];
    genBigger(out); genHowMany(out); genOrderThree(out);
    genFingerprint(out); genLargest(out); genOccupation(out); genConcentrated(out);
    genShareVsOntario(out);
    genCommute(out, 'out'); genCommute(out, 'in'); genTwin(out);
    genNatural(out);
    genWhichMethod(out); genCannot(out); genReadLQ(out);
    genWhichFirst(out); genDataHistory(out);
    /* every question belongs to a big idea and a level, or it is not asked
       (quiz-ideas.js); the ideas add their own questions first */
    var I = root.GRA.quizIdeas;
    if (I) {
      I.generate(out);
      out = out.filter(function (it) { return I.classify(it); });
    }
    var byId = {}, byIdea = {};
    out.forEach(function (it) {
      byId[it.id] = it;
      (byIdea[it.idea] = byIdea[it.idea] || []).push(it);
    });
    Q._bank = { items: out, byId: byId, byIdea: byIdea };
    return Q._bank;
  };

  Q.summary = function () {
    var b = Q.build(), s = {};
    b.items.forEach(function (it) {
      var k = it.strand + '/' + it.form;
      s[k] = (s[k] || 0) + 1;
    });
    return s;
  };

  /* exposed for the self-test */
  Q._gates = { namesOk: namesOk, confusable: confusable, optName: optName, about: about };
  /* the helpers quiz-ideas.js builds its questions with, so its questions
     pass the same gates */
  Q._h = { item: item, about: about, clear: clear, namesOk: namesOk,
           optName: optName, shuffle: shuffle, total: total, vec: vec,
           csds: csds, FLOOR: FLOOR };

  root.GRA = root.GRA || {};
  root.GRA.quizBank = Q;
}(this));
