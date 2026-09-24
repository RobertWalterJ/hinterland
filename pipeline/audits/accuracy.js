/* AUDIT 1 - ACCURACY.  Does every question claim only what its source says?

   Run from the project root:
     node pipeline/audits/accuracy.js            human table
     node pipeline/audits/accuracy.js --json     machine readable
     node pipeline/audits/accuracy.js --all      list soft notes too
   Exit code 1 if any HARD failure remains.

   ---------------------------------------------------------------------------
   WHAT THIS CHECKS, AND WHAT IT DELIBERATELY DOES NOT

   The app's rule is accuracy by construction: no question, option or answer
   card sentence is hand-written with a fact in it. Everything is generated
   from the payloads in app/data by quiz-bank.js and quiz-ideas.js, from the
   glossary in terms.js and from the sourced timeline in history.js. So the
   question "does every item claim only what its source says?" has five
   enforceable parts, and this file is organised as those five:

     (a) NUMBERS      every number in a stem, an option or a card sentence
                      recomputes from the payload it came from, within a
                      stated tolerance (see TOLERANCE below)
     (b) NAMES        every place, industry, occupation, region, method and
                      date named exists in the payload or glossary it claims
     (c) COMPARISONS  every comparison the screen states - "more", "largest",
                      "led by", "most concentrated", "about the same" - still
                      passes the app's own separation test (methods.js
                      M.clearlyLarger / M.countSd) at the z it claims
     (d) HISTORY      timeline items match their cited source entry's year and
                      title, and assert no cause
     (e) METHODS      strand E restates terms.js verbatim, every number in a
                      term appears in the METHODS.md section it cites, and no
                      sentence anywhere claims a power that a method's own
                      "cant" layer denies

   It does NOT re-check what pipeline/validate.py section 10 already checks
   through pipeline/quiz_selftest.js: one correct option, duplicate option
   labels, the universe chip (G4), the date chip (G5), confusable option
   names (G9), stem and card word length, id collisions, bank size, and idea
   coverage. Those are structural; this file is about truth.

   ---------------------------------------------------------------------------
   TOLERANCE, AND WHY IT IS WHAT IT IS

   A checker that cries wolf does not get run. Every numeric rule here has a
   tolerance built from exactly two things, and no fudge factor:

     1. PRINTING. Counts print at two significant figures behind the word
        "about" (quiz-bank.js `about()`); percentages print whole (`pct()`)
        or to one decimal below 10% (quiz-ideas.js `pc()`); location
        quotients print to one decimal; rates print as "N in 10". Whatever
        the format, the printed value may sit up to HALF OF ITS LAST PRINTED
        DIGIT from the true one. That half-step is read off the printed
        string itself, so no format needs its own rule.

     2. CENSUS ROUNDING. Every published cell is randomly rounded to a
        multiple of 5; METHODS 7.1 derives sd = 2.0 per cell and 2*sqrt(m)
        for a sum of m cells. Two of those, 4*sqrt(m), is the envelope used
        here. It only bites on small counts, where the half-step is small.

     tolerance = half-step + 4*sqrt(cells)

   SAMPLING ERROR IS NOT ADDED. Both sides of every numeric check are the
   same published estimate read twice, so sampling error is common to both
   and cancels. Adding it would gut the check: 1.92*sqrt(n) on a 10,000-job
   cell is 190 jobs, which would let a generator be wrong by 190 and pass.
   Sampling error belongs where the app puts it - in the separation gate for
   comparisons, part (c) - not in the recomputation of a printed figure.

   HARD vs SOFT. A HARD failure is a claim the data does not support: a
   number that does not recompute, a name that is not in the payload, a
   comparison that fails the app's own gate, an asserted cause. A SOFT note
   is a formatting or wording risk that is still true: an awkward phrase, a
   figure printed at a precision it cannot carry, a near-miss on a gate.
   Only HARD failures set the exit code.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { load, bank, numbersIn, ROOT, APP } = require('./harness');

const JSON_OUT = process.argv.includes('--json');
const SHOW_ALL = process.argv.includes('--all');

/* ------------------------------------------------------------- findings */

const findings = [];
const counted = { number: 0, name: 0, comparison: 0, date: 0, method: 0 };
let itemsChecked = 0;

/* where a generator wrote the line, resolved by searching the source */
const SRC = {};
function srcLine(file, needle) {
  const key = file + '\u0000' + needle;
  if (SRC[key] !== undefined) return SRC[key];
  let out = file;
  try {
    const lines = fs.readFileSync(path.join(APP, 'js', file), 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(needle) >= 0) { out = file + ':' + (i + 1); break; }
    }
  } catch (e) { /* the file moved; the rule still reports */ }
  SRC[key] = out;
  return out;
}

function flag(sev, rule, kind, id, claim, stated, recomputed, where, note) {
  findings.push({ sev, rule, kind, id, claim, stated, recomputed, where, note: note || '' });
}
const hard = (...a) => flag('HARD', ...a);
const soft = (...a) => flag('SOFT', ...a);

/* --------------------------------------------------------- number tools */

function halfStepAbout(printed) {
  /* "about 4,200" prints at two significant figures, so its quantum is read
     off its trailing zeros: 4,200 -> 100 -> half-step 50. */
  const s = String(printed).replace(/,/g, '');
  if (s.indexOf('.') >= 0) return halfStepPrinted(s);
  const zeros = /0*$/.exec(s)[0].length;
  return 0.5 * Math.pow(10, zeros);
}
function halfStepPrinted(printed) {
  const s = String(printed).replace(/,/g, '');
  const dot = s.indexOf('.');
  return dot < 0 ? 0.5 : 0.5 * Math.pow(10, -(s.length - dot - 1));
}
function roundingEnvelope(cells) { return 4 * Math.sqrt(Math.max(1, cells || 1)); }

/* Check one printed number against a recomputed one.
   mode: 'about'   two-significant-figure count behind "about"
         'exact'   an integer the app printed in full (a count of places)
         'print'   printed at its own precision (percent, x times, N in 10) */
function num(sev, id, claim, printed, recomputed, mode, cells, where) {
  counted.number++;
  const stated = typeof printed === 'string'
    ? parseFloat(String(printed).replace(/,/g, '')) : printed;
  if (recomputed == null || !isFinite(recomputed) || !isFinite(stated)) {
    hard('N', 'number', id, claim, printed, String(recomputed), where,
         'nothing to recompute against');
    return false;
  }
  const half = mode === 'about' ? halfStepAbout(printed)
             : mode === 'exact' ? 0.5
             : halfStepPrinted(printed);
  const tol = half + (mode === 'exact' ? 0 : roundingEnvelope(cells));
  const off = Math.abs(stated - recomputed);
  if (off > tol) {
    flag(sev, 'N', 'number', id, claim, String(printed),
         fmt(recomputed), where,
         'off by ' + fmt(off) + ', tolerance ' + fmt(tol));
    return false;
  }
  return true;
}
function fmt(x) {
  if (x == null || !isFinite(x)) return String(x);
  return Math.abs(x) >= 100 ? String(Math.round(x))
       : String(Math.round(x * 1000) / 1000);
}

/* ------------------------------------------------------------- run */

(async function main() {
  const G = await load();
  const D = G.data, M = G.methods, T = G.terms, H = G.history;
  const B = bank(G);
  const I = G.quizIdeas;
  const items = B.items;

  const sum = (v) => (v ? v.reduce((s, x) => s + (x || 0), 0) : 0);
  const W = (code, m) => D.workVec(code, m || 'total');
  const nOf = (code, m) => sum(W(code, m));
  const CELLS = D.naics.length;                 /* cells behind a place total */
  const clear = (a, b) => M.clearlyLarger(a, b, 3);
  const ONT = W('35', 'total'), ONT_T = sum(ONT);

  /* ---------------------------------------------- (b) the name universes */

  const placeNames = new Set();
  D.places.forEach((p) => {
    placeNames.add(p.name);
    placeNames.add(String(p.name).split(' / ')[0].trim());
  });
  const sectorNames = new Set(D.naics.map((s) => s.short));
  const sectorLower = new Set(D.naics.map((s) => s.short.toLowerCase()));
  const occNames = new Set(Object.keys(D.NOC_SHORT || {}).map((k) => D.NOC_SHORT[k]));
  const erNames = new Set(Object.keys(D.geo.er_names).map(
    (er) => String(D.geo.er_names[er]).split(' / ')[0].replace(/--/g, '–')));
  const cdNames = new Set(Object.keys(D.geo.cd_names).map((cd) => D.geo.cd_names[cd]));
  const termNames = new Set(T.list.map((t) => t.name));
  /* Editorial groupings of whole economic regions, defined in quiz-ideas.js
     AREA. They are not payload names, so they are checked a different way
     below: every region code they group must be a real economic region. */
  const AREA_NAMES = new Set(['Northern Ontario', 'Southwestern Ontario',
                              'Eastern Ontario', 'Central Ontario']);

  function name(id, claim, value, universe, uniName, where) {
    counted.name++;
    if (value && universe.has(value)) return true;
    hard('B', 'name', id, claim, String(value),
         'not in ' + uniName, where, 'the name is not in the payload it claims');
    return false;
  }

  /* the idea engine's own computed context, for the class-wide figures */
  const ctx = I._ctx();

  /* ============================================== small recompute helpers */

  function naicsIdx(code) {
    for (let i = 0; i < D.naics.length; i++) if (D.naics[i].code === code) return i;
    return -1;
  }
  function v2(p, k) { const v = W(p.code); const t = sum(v); return t ? v[k] / t : 0; }
  const MUNI = { C: 1, CY: 1, CV: 1, T: 1, TP: 1, TV: 1, VL: 1, MU: 1, M: 1 };
  function classOf(p) {
    if (!p || p.level !== 'CSD' || !MUNI[p.csd_type] || p.pop2021 == null) return null;
    return p.pop2021 < 10000 ? 'small' : p.pop2021 < 100000 ? 'mid' : 'big';
  }
  function classMembers(cl) {
    return (D.byLevel.CSD || []).filter(
      (p) => classOf(p) === cl && sum(W(p.code)) > 0);
  }
  let _small = null, _big = null;
  function smallTowns() { return (_small = _small || classMembers('small')); }
  function bigCities() { return (_big = _big || classMembers('big')); }
  function med(a) {
    const b = a.filter((x) => x != null).sort((x, y) => x - y);
    return b.length ? b[Math.floor(b.length / 2)] : null;
  }
  const TYPES = [
    { id: 'farm', word: 'farming', code: '11', name: 'a farming town', minShare: 0.2, minLQ: 3 },
    { id: 'mine', word: 'mining', code: '21', name: 'a mining town', minShare: 0.2, minLQ: 3 },
    { id: 'factory', word: 'factory', code: '31-33', name: 'a factory town', minShare: 0.25, minLQ: 2.5 },
    { id: 'tourist', word: 'tourist', code: '72', name: 'a tourist town', minShare: 0.12, minLQ: 2.5 }
  ];
  function typeOf(id) { return TYPES.filter((t) => t.id === id)[0]; }
  function typeByWord(w) { return TYPES.filter((t) => t.word === w)[0]; }
  function townsOfType(ty) {
    const k = naicsIdx(ty.code);
    return smallTowns().filter((p) => {
      const v = W(p.code), t = sum(v);
      if (t < 300 || !v[k]) return false;
      const sh = v[k] / t, lq = sh / (ONT[k] / ONT_T);
      return sh >= ty.minShare && lq >= ty.minLQ && v[k] >= 100;
    });
  }
  const AREA = { 3590: 'north', 3595: 'north', 3560: 'southwest', 3570: 'southwest',
                 3580: 'southwest', 3510: 'east', 3515: 'east', 3520: 'central',
                 3530: 'central', 3540: 'central', 3550: 'central' };
  function areaOf(er) { return AREA[er] || null; }
  function areaKey(nm) {
    return { 'Northern Ontario': 'north', 'Southwestern Ontario': 'southwest',
             'Eastern Ontario': 'east', 'Central Ontario': 'central' }[nm];
  }
  let _erVec = null;
  function erVec(er) {
    if (!_erVec) {
      _erVec = {};
      (D.byLevel.CSD || []).forEach((p) => {
        const v = W(p.code);
        if (!p.er || !v) return;
        if (!_erVec[p.er]) _erVec[p.er] = v.map(() => 0);
        v.forEach((x, i) => { _erVec[p.er][i] += x || 0; });
      });
    }
    return _erVec[er] || ONT.map(() => 0);
  }
  function erShare(er, k) { const v = erVec(er); const t = sum(v); return t ? v[k] / t : 0; }
  function topER(k) {
    return Object.keys(D.geo.er_names)
      .map((er) => ({ er, lq: erShare(er, k) / (ONT[k] / ONT_T) }))
      .sort((a, b) => b.lq - a.lq);
  }
  /* an independent count of the municipalities a sector clearly leads, in
     one census year, on the residence basis - history.js's `leadership` */
  function leadCount(D2, M2, year, code) {
    let n = 0;
    (D2.byLevel.CSD || []).forEach((p) => {
      const v = D2.resVec(p.code, year);
      if (!v) return;
      const tot = v.reduce((s, x) => s + (x || 0), 0);
      if (tot < 1000) return;
      const r = v.map((x, i) => ({ i, x: x || 0 })).sort((a, b) => b.x - a.x);
      if (!M2.clearlyLarger(r[0].x, r[1].x, 3)) return;
      if (D2.naics[r[0].i].code === code) n++;
    });
    return n;
  }
  /* the areas the AREA table groups must all be real economic regions */
  counted.name++;
  Object.keys(AREA).forEach((er) => {
    if (!D.geo.er_names[er]) {
      hard('B', 'name', 'quiz-ideas:AREA', 'grouped region exists', er,
           'not in geo.er_names', srcLine('quiz-ideas.js', 'var AREA = {'));
    }
  });

  /* ================================================== (d) causes */

  /* history.js states the rule this enforces: the sourced arc and the data
     are "juxtaposed, never joined by because", and an entry "may not claim
     the event caused it". These are the words that join them. */
  const CAUSAL = [
    /\bbecause\b/i, /\bcaused?\b/i, /\bled to\b/i, /\bresulted in\b/i,
    /\bshaped\b/i, /\bdue to\b/i, /\bthanks to\b/i, /\bas a result\b/i,
    /\bbrought about\b/i, /\bdrove\b/i, /\btriggered\b/i
  ];
  function causal(id, text, where, what) {
    counted.method++;
    for (const re of CAUSAL) {
      const m = re.exec(text);
      if (m) {
        hard('D', 'method', id, 'the ' + what + ' asserts a cause',
             '"' + trim(text) + '"', 'no source supports the causal link', where,
             'matched "' + m[0] + '"; history.js forbids joining event to data by cause');
        return;
      }
    }
  }

  /* ================================================== (e) method claims */

  /* Built from terms.js itself, not written here: a method's "cant" layer is
     the app's own statement of what that method cannot do. Any sentence
     anywhere that names the method and asserts the denied power contradicts
     the glossary, and through it METHODS.md. */
  const DENIALS = [];
  T.list.filter((t) => t.kind === 'method').forEach((t) => {
    const c = t.cant.toLowerCase();
    if (/does not say why|not a cause|does not explain/.test(c)) {
      DENIALS.push({ term: t, needle: t.name.toLowerCase().split(' ')[0],
                     claim: /\b(says?|tells?|explains?|shows?) (you )?why\b/i,
                     denial: t.cant });
    }
    if (/nothing about growth/.test(c)) {
      DENIALS.push({ term: t, needle: t.name.toLowerCase().split(' ')[0],
                     claim: /\b(says?|shows?|tells?)[^.]{0,30}\bgrow(th|n|s|ing)?\b/i,
                     denial: t.cant });
    }
    if (/cannot forecast|no forecasts/.test(c)) {
      DENIALS.push({ term: t, needle: t.name.toLowerCase().split(' ')[0],
                     claim: /\b(predicts?|forecasts?|will be)\b/i, denial: t.cant });
    }
  });
  function methodContradiction(id, text, where) {
    counted.method++;
    const low = text.toLowerCase();
    for (const d of DENIALS) {
      if (low.indexOf(d.needle) < 0) continue;
      /* only the clause that names the method, so a two-clause sentence does
         not convict the wrong half */
      const clause = text.split(/[;.]/).filter(
        (c) => c.toLowerCase().indexOf(d.needle) >= 0).join(' ');
      if (d.claim.test(clause)) {
        hard('E', 'method', id, 'a claim about ' + d.term.name,
             '"' + trim(clause) + '"',
             'terms.js: "' + d.denial + '"', where,
             'the sentence gives the method a power its own glossary entry denies');
        return;
      }
    }
  }

  /* ============================================================ items */

  for (const it of items) {
    itemsChecked++;
    const card = it.card || {};
    const s = card.sentence || '';
    const P = it.place ? D.byCode[it.place] : null;
    const correct = it.options.filter((o) => o.correct)[0];

    switch (it.form) {

      /* ---------------------------------------------- A/bigger (strand A,
         re-labelled by quiz-ideas.classify into idea "links", level 3).
         Card: "X: about N jobs, against about M. People travel in to work."
         Stem: "Y has more people. Which has more jobs?"                  */
      case 'bigger': {
        const where = srcLine('quiz-ideas.js', 'People travel in to work');
        const hi = D.byCode[card.picture.a], lo = D.byCode[card.picture.b];
        const th = nOf(hi.code), tl = nOf(lo.code);
        /* about() drops the word "about" below 100 (quiz-bank.js), so the
           second figure may arrive bare: "against 95." */
        /* Since 24 Sept the population fact lives on the CARD, not in the
           stem - naming a place in the stem made the other option right every
           time. Card: "L has more people, yet H has more jobs: about N
           against about M." about() drops the word below 100. */
        const m = s.match(/^(.+?) has more people, yet (.+?) has more jobs: (?:about )?([\d,]+) against (?:about )?([\d,]+)\./);
        if (!m) { hard('P', 'number', it.id, 'card shape', s, '(unparsed)', where); break; }
        name(it.id, 'the place with more people', m[1], placeNames, 'the place list', where);
        name(it.id, 'winner named on the card', m[2], placeNames, 'the place list', where);
        num('HARD', it.id, 'jobs in ' + m[2], m[3], th, 'about', CELLS, where);
        num('HARD', it.id, 'jobs in ' + m[1], m[4], tl, 'about', CELLS, where);
        /* (c) the answer, on both measures - G1 and G8 */
        counted.comparison += 2;
        if (!clear(th, tl)) {
          hard('C', 'comparison', it.id, 'has more jobs than', th + ' vs ' + tl,
               'gap ' + fmt(th - tl) + ' < 3sd ' +
               fmt(3 * Math.hypot(M.countSd(th), M.countSd(tl))), where);
        }
        const uh = nOf(hi.code, 'usual'), ul = nOf(lo.code, 'usual');
        if (!clear(uh, ul)) {
          hard('C', 'comparison', it.id, 'still holds without home-workers (G8)',
               uh + ' vs ' + ul, 'not separated', where);
        }
        /* (a) the card's population claim */
        counted.comparison++;
        if (!(lo.pop2021 > hi.pop2021)) {
          hard('C', 'comparison', it.id, 'card: "' + lo.name + ' has more people"',
               lo.pop2021 + ' vs ' + hi.pop2021, 'not more', where);
        }
        /* (c) "People travel in to work" - only true where the winner has
           more jobs than working residents. jobsRatio is jobs over the
           residence subtotal that shares its universe (data.js). */
        counted.comparison++;
        /* The sentence explains the answer by a net inflow of workers. That
           is a comparison, so it is held to the same gate as any other: the
           claim fails only where the residents CLEARLY outnumber the jobs.
           Six items sat between the two - a jobs ratio just under 1, inside
           sampling error - and calling those wrong would be crying wolf, so
           they are soft notes about a sentence that is not earning its keep. */
        /* the clause is only present where the generator judged the inflow
           real, so the check runs only when it is on screen */
        if (/People travel in to work/.test(s) && hi.jobsRatio != null && hi.jobsRatio <= 1) {
          const sep = clear(hi.residentWorkersFixed, hi.jobs);
          flag(sep ? 'HARD' : 'SOFT', 'C', 'comparison', it.id,
               '"People travel in to work"',
               'jobs ratio ' + fmt(hi.jobsRatio),
               hi.jobs + ' jobs, ' + hi.residentWorkersFixed + ' working residents',
               where,
               sep ? 'the card explains the answer with a net inflow the data denies'
                   : 'jobs and working residents are within sampling error of each other');
        }
        break;
      }

      /* ------------------------------------------- B/fingerprint
         Card: "That is X. Its jobs are led by S1 (p%) and S2 (q%)."      */
      case 'fingerprint': {
        const where = srcLine('quiz-bank.js', "return 'led by '");
        const v = W(it.place);
        const r = v.map((x, i) => ({ i, x: x || 0 })).sort((a, b) => b.x - a.x);
        /* Two shapes are legal since the fix of 24 Sept: the card names two
           sectors only where the ranks are separated, and otherwise names the
           largest and stops. Both are parsed, and each is held to the claim
           it actually makes. */
        const m = s.match(/^That is (.+?)\. Its jobs are led by (.+?) \((\d+)%\)(?: and (.+?) \((\d+)%\))?\.$/);
        if (!m) { hard('P', 'number', it.id, 'card shape', s, '(unparsed)', where); break; }
        name(it.id, 'place on the card', m[1], placeNames, 'the place list', where);
        const namesTwo = !!m[4];
        counted.name += namesTwo ? 2 : 1;
        if (!sectorLower.has(m[2])) {
          hard('B', 'name', it.id, 'first sector named', m[2], 'not a NAICS short label', where);
        }
        if (namesTwo && !sectorLower.has(m[4])) {
          hard('B', 'name', it.id, 'second sector named', m[4], 'not a NAICS short label', where);
        }
        const tt = sum(v);
        num('HARD', it.id, 'share of ' + m[2], m[3], 100 * r[0].x / tt, 'print', CELLS, where);
        if (namesTwo) {
          num('HARD', it.id, 'share of ' + m[4], m[5], 100 * r[1].x / tt, 'print', CELLS, where);
        }
        /* (c) "led by A and B" states TWO comparisons: that A outranks B, and
           that B outranks everything else. Naming one sector states neither,
           so the gate is checked the other way round: a card that names two
           must pass it, and a card that names one must have had cause. */
        counted.comparison += 2;
        const rank12 = clear(r[0].x, r[1].x), rank23 = clear(r[1].x, r[2].x);
        if (namesTwo && !(rank12 && rank23)) {
          hard('C', 'comparison', it.id, 'card puts ' + m[2] + ' ahead of ' + m[4],
               r[0].x + ' vs ' + r[1].x,
               'gap ' + fmt(r[0].x - r[1].x) + ' < 3sd ' +
               fmt(3 * Math.hypot(M.countSd(r[0].x), M.countSd(r[1].x))), where,
               'an unseparated rank stated on the card');
        }
        if (!namesTwo && rank12 && rank23) {
          soft('C', 'comparison', it.id, 'card names one sector where two are separated',
               m[2], 'both ranks pass the gate', where,
               'true, but the card could say more than it does');
        }
        /* (c) the ANSWER: the prompt is the place's own profile, so the
           question is only answerable if each distractor's mix is visibly
           different from it - the generator's own 0.12 threshold. */
        it.options.filter((o) => !o.correct).forEach((o) => {
          counted.comparison++;
          /* resolved inside the item's own economic region: the distractors
             are drawn from it, and a bare name lookup can hit a namesake in
             another region (Hamilton the city, Hamilton the township) */
          const q = D.places.filter(
            (x) => x.level === 'CSD' && x.er === it.region &&
                   String(x.name).split(' / ')[0].trim() === o.label)[0];
          if (!q) return;
          const dd = M.mixDistance(v, W(q.code));
          if (dd == null || dd <= 0.12) {
            hard('C', 'comparison', it.id, 'distractor is visibly a different mix',
                 o.label + ' at distance ' + fmt(dd), 'at or under 0.12', where);
          }
        });
        /* only a card that NAMES a second sector claims a second rank */
        if (namesTwo && !clear(r[1].x, r[2].x)) {
          hard('C', 'comparison', it.id, 'card makes ' + m[4] + ' the second sector',
               r[1].x + ' vs ' + r[2].x + ' (' + D.naics[r[2].i].short + ')',
               'gap ' + fmt(r[1].x - r[2].x) + ' < 3sd ' +
               fmt(3 * Math.hypot(M.countSd(r[1].x), M.countSd(r[2].x))), where,
               'an unseparated rank stated on the card');
        }
        break;
      }

      /* ---------------------------------------------------- B/largest    */
      case 'largest': {
        const where = srcLine('quiz-bank.js', "' of the jobs located in '");
        const vt = W(it.place), vu = W(it.place, 'usual'), tt = sum(vt);
        const rt = vt.map((x, i) => ({ i, x: x || 0 })).sort((a, b) => b.x - a.x);
        const ru = vu.map((x, i) => ({ i, x: x || 0 })).sort((a, b) => b.x - a.x);
        const m = s.match(/^(.+?) is (\d+)% of the jobs located in (.+?)\.$/);
        if (!m) { hard('P', 'number', it.id, 'card shape', s, '(unparsed)', where); break; }
        name(it.id, 'sector on the card', m[1], sectorNames, 'the NAICS labels', where);
        name(it.id, 'place on the card', m[3], placeNames, 'the place list', where);
        num('HARD', it.id, 'share of ' + m[1], m[2], 100 * rt[0].x / tt, 'print', CELLS, where);
        counted.comparison += 3;
        if (D.naics[rt[0].i].short !== m[1]) {
          hard('C', 'comparison', it.id, 'largest sector', m[1],
               D.naics[rt[0].i].short, where);
        }
        if (!clear(rt[0].x, rt[1].x)) {
          hard('C', 'comparison', it.id, 'largest beats runner-up (G1)',
               rt[0].x + ' vs ' + rt[1].x, 'not separated at z=3', where);
        }
        if (rt[0].i !== ru[0].i) {
          hard('C', 'comparison', it.id, 'answer holds without home-workers (G8)',
               D.naics[rt[0].i].short, D.naics[ru[0].i].short + ' on "usual"', where);
        }
        /* the surprise line: "It is best known for D, which is more
           concentrated here than in Ontario, but smaller." */
        if (card.more) {
          const w2 = srcLine('quiz-bank.js', "'It is best known for '");
          const mm = card.more.match(/^It is best known for (.+?), which is more/);
          if (mm) {
            const k = D.naics.map((x, i) => i).filter(
              (i) => D.naics[i].short.toLowerCase() === mm[1])[0];
            counted.name++;
            if (k == null) {
              hard('B', 'name', it.id, 'distinctive sector named', mm[1],
                   'not a NAICS short label', w2);
            } else {
              counted.comparison += 2;
              const lq = (vt[k] / tt) / (ONT[k] / ONT_T);
              if (!(lq > 1)) {
                hard('C', 'comparison', it.id,
                     '"more concentrated here than in Ontario"',
                     'LQ ' + fmt(lq), 'at or below 1', w2);
              }
              if (!clear(rt[0].x, vt[k])) {
                hard('C', 'comparison', it.id, '"but smaller" than the largest',
                     vt[k] + ' vs ' + rt[0].x, 'not separated at z=3', w2);
              }
            }
          }
        }
        break;
      }

      /* ------------------------------------------------- B/occupation    */
      case 'occupation': {
        const where = srcLine('quiz-bank.js', "' of working residents of '");
        const occ = D.occupationFor(it.place);
        const m = s.match(/^(\d+)% of working residents of (.+?) are in (.+?)\.$/);
        if (!m) { hard('P', 'number', it.id, 'card shape', s, '(unparsed)', where); break; }
        name(it.id, 'place on the card', m[2], placeNames, 'the place list', where);
        counted.name++;
        if (!occNames.has(occ[0].short)) {
          hard('B', 'name', it.id, 'occupation named', occ[0].short,
               'not an NOC short label', where);
        }
        num('HARD', it.id, 'share in ' + m[3], m[1], 100 * occ[0].share, 'print',
            occ.length, where);
        counted.comparison++;
        /* the app's own published-interval separation (quiz-bank sdCI) */
        const sd = (o) => (o.lo != null && o.hi != null && o.hi > o.lo)
          ? (o.hi - o.lo) / 2 / 1.96 : M.countSd(o.n);
        if ((occ[0].n - occ[1].n) < 3 * Math.hypot(sd(occ[0]), sd(occ[1]))) {
          hard('C', 'comparison', it.id, 'most common occupation (G1 on published CIs)',
               occ[0].n + ' vs ' + occ[1].n, 'not separated at z=3', where);
        }
        break;
      }

      /* ---------------------------------------------- B/concentrated     */
      case 'concentrated': {
        const where = srcLine('quiz-bank.js', "' times ' +");
        const m = s.match(/^(.+?) has about ([\d.]+) times Ontario’s share of jobs in (.+?)\.$/);
        if (!m) { hard('P', 'number', it.id, 'card shape', s, '(unparsed)', where); break; }
        name(it.id, 'place on the card', m[1], placeNames, 'the place list', where);
        counted.name++;
        if (!sectorLower.has(m[3])) {
          hard('B', 'name', it.id, 'sector named', m[3], 'not a NAICS short label', where);
        }
        const k = D.naics.map((x, i) => i).filter(
          (i) => D.naics[i].short.toLowerCase() === m[3])[0];
        const v = W(it.place), tv = sum(v);
        const lq = (v[k] / tv) / (ONT[k] / ONT_T);
        num('HARD', it.id, 'location quotient for ' + m[3], m[2], lq, 'print', 2, where);
        counted.comparison++;
        /* (c) the ANSWER: the named place must be the most concentrated in
           its economic region, and clearly so on the log location quotient
           with sampling error - the gate quiz-bank.js applies.

           Candidates are rebuilt from the REGION, not by looking option
           labels up by name: "Hamilton" is both the city and a township in
           Northumberland, and the name lookup convicted the wrong one. */
        const cands = (D.byLevel.CSD || []).filter((q) => q.er === it.region)
          .map((q) => {
            const vv = W(q.code), uu = W(q.code, 'usual'), tvv = sum(vv);
            if (!vv || !uu || tvv < 2000 || !vv[k] || vv[k] < 500 || !uu[k] || uu[k] <= 50) return null;
            return { q, lq: (vv[k] / tvv) / (ONT[k] / ONT_T), n: vv[k] };
          }).filter(Boolean).sort((a, b) => b.lq - a.lq);
        if (cands.length >= 2) {
          if (cands[0].q.code !== it.place) {
            hard('C', 'comparison', it.id, 'the answer is the most concentrated in its region',
                 m[1], cands[0].q.name, where);
          } else {
            const se = Math.sqrt(Math.pow(M.countSd(cands[0].n) / cands[0].n, 2) +
                                 Math.pow(M.countSd(cands[1].n) / cands[1].n, 2));
            if (Math.log(cands[0].lq) - Math.log(cands[1].lq) < 3 * se) {
              hard('C', 'comparison', it.id, 'answer clearly beats the runner-up (G1)',
                   fmt(cands[0].lq) + ' vs ' + fmt(cands[1].lq),
                   'gap under 3sd on the log quotient', where);
            }
          }
        }
        counted.comparison++;
        /* G3 base size, as the generator states it */
        if (!(tv >= 2000 && v[k] >= 500)) {
          hard('C', 'comparison', it.id, 'G3 base size',
               tv + ' jobs, ' + v[k] + ' in sector', 'below 2,000 / 500', where);
        }
        break;
      }

      /* ------------------------------------------- C/commute-out and -in */
      case 'commute-out':
      case 'commute-in': {
        const out = it.form === 'commute-out';
        const where = srcLine('quiz-bank.js',
          out ? "' people commute from '" : "' people come from '");
        const tf = D.commute.top_flows;
        const raw = tf[out ? it.place + '|out' : it.place] || [];
        const flows = raw.filter((f) => f[0] !== it.place && D.byCode[f[0]]);
        const m = out
          ? s.match(/^About ([\d,]+) people commute from (.+?) to (.+?)(?:, (\d+)% of those who leave)?\.$/)
          : s.match(/^About ([\d,]+) people come from (.+?) to work in (.+?)(?:, (\d+)% of those who travel in)?\.$/);
        if (!m) { hard('P', 'number', it.id, 'card shape', s, '(unparsed)', where); break; }
        const other = out ? m[3] : m[2];
        name(it.id, 'other place on the card', other, placeNames, 'the place list', where);
        num('HARD', it.id, 'commuters on the largest flow', m[1], flows[0][1],
            'about', 1, where);
        counted.comparison += 2;
        if (D.byCode[flows[0][0]] && String(D.byCode[flows[0][0]].name)
            .split(' / ')[0].trim() !== other) {
          hard('C', 'comparison', it.id, 'largest flow goes to the named place',
               other, D.byCode[flows[0][0]].name, where);
        }
        if (!clear(flows[0][1], flows[1][1])) {
          hard('C', 'comparison', it.id, 'largest flow beats the second (G1)',
               flows[0][1] + ' vs ' + flows[1][1], 'not separated at z=3', where);
        }
        if (m[4] != null) {
          const base = out ? P.outCommuters : P.inCommuters;
          num('HARD', it.id, 'share of ' + (out ? 'leavers' : 'arrivals'),
              m[4], 100 * flows[0][1] / base, 'print', 2, where);
        }
        break;
      }

      /* --------------------------------------------------------- C/twin  */
      case 'twin': {
        const where = srcLine('quiz-bank.js', "' has the most similar mix of jobs to '");
        const m = s.match(/^(.+?) has the most similar mix of jobs to (.+?) of any place of a similar size in Ontario\.$/);
        if (!m) { hard('P', 'number', it.id, 'card shape', s, '(unparsed)', where); break; }
        name(it.id, 'twin named', m[1], placeNames, 'the place list', where);
        name(it.id, 'subject named', m[2], placeNames, 'the place list', where);
        /* the generator's own pool: 2,000 jobs or more AND within a factor
           of two of the subject, which is what "a similar size" now means */
        const mine = sum(W(it.place));
        const pool = (D.byLevel.CSD || []).filter((q) => {
          const t = sum(W(q.code));
          return t >= 2000 && Math.max(t, mine) / Math.min(t, mine) <= 2;
        });
        const v = W(it.place);
        const d = pool.filter((q) => q.code !== it.place)
          .map((q) => ({ q, d: M.mixDistance(v, W(q.code)) }))
          .filter((x) => x.d != null).sort((a, b) => a.d - b.d);
        counted.comparison += 2;
        if (d[0].q.code !== card.picture.b) {
          hard('C', 'comparison', it.id, 'nearest mix is the named twin',
               m[1], d[0].q.name, where);
        }
        if (!(d[0].d <= 0.8 * d[1].d)) {
          hard('C', 'comparison', it.id, 'twin clearly closer than the runner-up',
               fmt(d[0].d) + ' vs ' + fmt(d[1].d), 'not 20% closer', where);
        }
        /* "of a similar size" now has a meaning: the generator restricts the
           pool to within a factor of two. This check is what holds it there. */
        const ja = sum(W(card.picture.a)), jb = sum(W(card.picture.b));
        const ratio = Math.max(ja / jb, jb / ja);
        counted.comparison++;
        if (ratio > 2) {
          hard('C', 'comparison', it.id, '"of any place its size"',
               fmt(ja) + ' jobs vs ' + fmt(jb) + ' jobs',
               'a factor of ' + fmt(ratio), where,
               'the twin search is not size-restricted; the card says it is');
        }
        break;
      }

      /* -------------------------------------------------------- D/yesno  */
      case 'yesno': {
        const where = srcLine('quiz-bank.js', "' more deaths than births over those five years.'");
        const comp = D.components.data['2021b'][it.cd];
        const rows = D.componentSummary(comp, '2021b');
        const last5 = rows.slice(-5);
        const gap = last5.reduce((a, r) => a + r.natural, 0);
        const allDown = last5.every((r) => r.natural < 0);
        const allUp = last5.every((r) => r.natural > 0);
        const m = s.match(/^(Yes|No): about ([\d,]+) more (deaths than births|births than deaths) over those five years\.$/);
        if (!m) { hard('P', 'number', it.id, 'card shape', s, '(unparsed)', where); break; }
        num('HARD', it.id, 'five-year natural gap', m[2], Math.abs(gap), 'about', 10, where);
        counted.comparison += 2;
        const saysDown = m[1] === 'Yes';
        if (saysDown !== allDown || (!saysDown) !== allUp) {
          hard('C', 'comparison', it.id, 'every one of five years agrees',
               m[1], 'allDown=' + allDown + ' allUp=' + allUp, where);
        }
        if (saysDown !== (gap < 0)) {
          hard('C', 'comparison', it.id, 'sign of the five-year gap', m[1], fmt(gap), where);
        }
        /* (b) the division is named, with its type, from the payload */
        const nm = it.stem.match(/in (.+?)\?$/);
        name(it.id, 'census division named', nm && nm[1], cdNames,
             'geo.cd_names', where);
        counted.date++;
        const yrs = it.chip.when.split('–');
        if (+yrs[0] !== last5[0].year || +yrs[1] !== last5[4].year) {
          hard('N', 'date', it.id, 'date chip matches the years used',
               it.chip.when, last5[0].year + '-' + last5[4].year, where);
        }
        break;
      }

      /* ------------------------------------------------ strand E: methods */
      case 'which-method': case 'cannot': case 'read-number':
        checkMethodItem(it);
        break;

      /* ------------------------------------------------ strand F: history */
      case 'which-first': {
        const where = srcLine('quiz-bank.js', "' came first, in '");
        const m = s.match(/^(.+?) came first, in (\d{4})\. (.+?) followed in (\d{4})\.$/);
        if (!m) { hard('P', 'date', it.id, 'card shape', s, '(unparsed)', where); break; }
        const e = H.timeline.filter((x) => x.title === m[1])[0];
        const l = H.timeline.filter((x) => x.title === m[3])[0];
        counted.name += 2; counted.date += 2;
        if (!e) hard('D', 'name', it.id, 'earlier title is a timeline entry', m[1],
                     'not in history.js timeline', where);
        if (!l) hard('D', 'name', it.id, 'later title is a timeline entry', m[3],
                     'not in history.js timeline', where);
        if (e && +m[2] !== e.year) {
          hard('D', 'date', it.id, 'year of "' + m[1] + '"', m[2], String(e.year), where);
        }
        if (l && +m[4] !== l.year) {
          hard('D', 'date', it.id, 'year of "' + m[3] + '"', m[4], String(l.year), where);
        }
        counted.comparison++;
        if (e && l && !(e.year < l.year)) {
          hard('D', 'comparison', it.id, 'the earlier one is earlier',
               e.year + ' vs ' + l.year, 'not earlier', where);
        }
        if (e && l && Math.abs(e.year - l.year) < 4) {
          soft('D', 'comparison', it.id, 'years at least four apart',
               Math.abs(e.year - l.year) + ' years', 'under 4', where);
        }
        /* (d) no cause asserted, and the "more" text is the sourced fact */
        causal(it.id, s, where, 'card sentence');
        if (card.more) {
          counted.name++;
          if (e && card.more !== e.fact) {
            hard('D', 'name', it.id, '"more" text is the entry\'s own sourced fact',
                 card.more.slice(0, 40) + '...', 'does not match history.js fact', where);
          }
          causal(it.id, card.more, srcLine('history.js', e ? e.title : 'timeline'),
                 'sourced fact');
        }
        break;
      }

      case 'data-history': {
        if (it.id === 'F2:manufacturing') {
          const where = srcLine('quiz-bank.js', "'Far fewer: from '");
          const st = H.stories();
          const m = s.match(/^Far fewer: from (\d+) municipalities to (\d+)\.$/);
          if (!m) { hard('P', 'number', it.id, 'card shape', s, '(unparsed)', where); break; }
          num('HARD', it.id, 'manufacturing-led municipalities 2001', m[1],
              leadCount(D, M, 2001, '31-33'), 'exact', 0, where);
          num('HARD', it.id, 'manufacturing-led municipalities 2011', m[2],
              leadCount(D, M, 2011, '31-33'), 'exact', 0, where);
          counted.comparison++;
          if (!(st.manufacturing2011 < st.manufacturing2001)) {
            hard('C', 'comparison', it.id, '"Far fewer"',
                 st.manufacturing2001 + ' -> ' + st.manufacturing2011, 'not fewer', where);
          }
          causal(it.id, s + ' ' + (card.more || ''), where, 'card');
        } else {
          const where = srcLine('quiz-bank.js', "' of ' + first.n + ' in ' + first.year");
          const st = H.stories();
          const m = s.match(/^(\d+) of (\d+) in (\d{4})\. By (\d{4}) it was (\d+)\.$/);
          if (!m) { hard('P', 'number', it.id, 'card shape', s, '(unparsed)', where); break; }
          const nd = st.natural['2011b'] || [], nd2 = st.natural['2021b'] || [];
          const first = nd[0];
          const peak = nd2.reduce((a, r) => (!a || r.dec > a.dec ? r : a), null);
          num('HARD', it.id, 'divisions in decrease, first year', m[1], first.dec, 'exact', 0, where);
          num('HARD', it.id, 'divisions counted, first year', m[2], first.n, 'exact', 0, where);
          num('HARD', it.id, 'first year', m[3], first.year, 'exact', 0, where);
          num('HARD', it.id, 'peak year', m[4], peak.year, 'exact', 0, where);
          num('HARD', it.id, 'divisions in decrease, peak', m[5], peak.dec, 'exact', 0, where);
          /* (b) the two legs come from two boundary vintages, which
             history.js says are "shown side by side and never spliced" */
          counted.comparison++;
          soft('C', 'comparison', it.id,
               'the card puts two boundary vintages in one sentence',
               first.year + ' (2011 boundaries) then ' + peak.year + ' (2021 boundaries)',
               first.n + ' divisions then ' + peak.n, where,
               'history.js: the two series are "never spliced"');
        }
        break;
      }

      /* ------------------------------------------ strand G: the big ideas */
      default:
        checkIdeaItem(it);
    }
  }

  /* ================================================ strand E, in detail */

  function checkMethodItem(it) {
    const s = it.card.sentence;
    const tid = (it.more && it.more.term) || it.terms[0];
    const t = T.byId[tid];
    counted.method++;
    counted.name++;
    if (!t) {
      hard('E', 'name', it.id, 'card cites a glossary term', String(tid),
           'not in terms.js', srcLine('quiz-bank.js', 'strand E'));
      return;
    }
    if (it.form === 'which-method') {
      const where = srcLine('quiz-bank.js', "sentence: t.name + ': ' + t.plain");
      if (s !== cap(t.name + ': ' + t.plain)) {
        hard('E', 'method', it.id, 'card restates terms.js verbatim',
             s.slice(0, 50) + '...', t.name + ': ' + t.plain, where);
      }
      /* the question is the method map's own question */
      counted.name++;
      if (!T.map.some((r) => r.q === it.stem)) {
        hard('E', 'name', it.id, 'stem is a question from the method map',
             it.stem, 'not in terms.js T.map', where);
      }
    } else if (it.form === 'cannot') {
      const where = srcLine('quiz-bank.js', 'card: { sentence: t.cant');
      if (s !== cap(t.cant)) {
        hard('E', 'method', it.id, 'card restates the term\'s "cant" verbatim',
             s.slice(0, 50) + '...', t.cant, where);
      }
    } else if (it.form === 'read-number') {
      const where = srcLine('quiz-bank.js', "'At ' + lq.toFixed(1)");
      const m = s.match(/^At ([\d.]+), the industry is (.+?): its share here is ([\d.]+) times/);
      if (!m) { hard('P', 'method', it.id, 'card shape', s, '(unparsed)', where); return; }
      counted.method++;
      if (m[2] !== T.lqBand(parseFloat(m[1]))) {
        hard('E', 'method', it.id, 'band for LQ ' + m[1], m[2],
             T.lqBand(parseFloat(m[1])), where,
             'the band must come from terms.js, not from a second table');
      }
      num('HARD', it.id, 'the quotient restated', m[3], parseFloat(m[1]), 'print', 0, where);
      /* methods.js keeps a SECOND band table; the two must agree */
      counted.method++;
      if (M.lqBand(parseFloat(m[1])) !== T.lqBand(parseFloat(m[1]))) {
        soft('E', 'method', it.id, 'the two band tables agree',
             'methods.js: ' + M.lqBand(parseFloat(m[1])),
             'terms.js: ' + T.lqBand(parseFloat(m[1])),
             srcLine('methods.js', 'M.LQ_BANDS'),
             'two tables for one idea is a drift risk, not yet a wrong claim');
      }
    }
  }

  /* ============================================== strand G: the big ideas */


  function checkIdeaItem(it) {
    const s = it.card.sentence;
    const id = it.id;
    const P = it.place ? D.byCode[it.place] : null;
    let m;

    /* G1:top - "Health & social: about 13 in every 100 jobs in Ontario." */
    if (id === 'G1:top') {
      const where = srcLine('quiz-ideas.js', "' in every 100 jobs in Ontario.'");
      m = s.match(/^(.+?): about (\d+) in every 100 jobs in Ontario\.$/);
      if (!m) return hard('P', 'number', id, 'card shape', s, '(unparsed)', where);
      const top = ONT.map((x, k) => ({ k, x: x || 0 })).sort((a, b) => b.x - a.x);
      name(id, 'sector named', m[1], sectorNames, 'the NAICS labels', where);
      num('HARD', id, 'share of Ontario jobs', m[2], 100 * top[0].x / ONT_T, 'print',
          CELLS, where);
      counted.comparison++;
      if (D.naics[top[0].k].short !== m[1]) {
        hard('C', 'comparison', id, 'largest industry in Ontario', m[1],
             D.naics[top[0].k].short, where);
      }
      if (!clear(top[0].x, top[1].x)) {
        hard('C', 'comparison', id, 'largest beats the runner-up (G1)',
             top[0].x + ' vs ' + top[1].x, 'not separated', where);
      }
      return;
    }

    /* G1:pair - "A has about N jobs in Ontario; b, about M." */
    if (id.startsWith('G1:pair:')) {
      const where = srcLine('quiz-ideas.js', "' jobs in Ontario; '");
      m = s.match(/^(.+?) has about ([\d,]+) jobs in Ontario; (.+?), about ([\d,]+)\.$/);
      if (!m) return hard('P', 'number', id, 'card shape', s, '(unparsed)', where);
      const codes = id.slice('G1:pair:'.length).split('/');
      const ka = naicsIdx(codes[0]), kb = naicsIdx(codes[1]);
      num('HARD', id, 'Ontario jobs in ' + m[1], m[2], ONT[ka], 'about', 1, where);
      num('HARD', id, 'Ontario jobs in ' + m[3], m[4], ONT[kb], 'about', 1, where);
      counted.comparison++;
      if (!clear(ONT[ka], ONT[kb])) {
        hard('C', 'comparison', id, 'the first employs more (G1)',
             ONT[ka] + ' vs ' + ONT[kb], 'not separated', where);
      }
      return;
    }

    /* G1:er - "Region: sector has L times its share of jobs across Ontario." */
    if (id.startsWith('G1:er:')) {
      const where = srcLine('quiz-ideas.js', "' times its share of jobs across Ontario.'");
      m = s.match(/^(.+?): (.+?) has ([\d.]+) times its share of jobs across Ontario\.$/);
      if (!m) return hard('P', 'number', id, 'card shape', s, '(unparsed)', where);
      name(id, 'economic region named', m[1], erNames, 'geo.er_names', where);
      counted.name++;
      if (!sectorLower.has(m[2])) {
        hard('B', 'name', id, 'sector named', m[2], 'not a NAICS short label', where);
      }
      const k = naicsIdx(id.slice('G1:er:'.length));
      const er = Object.keys(D.geo.er_names).filter(
        (e) => String(D.geo.er_names[e]).split(' / ')[0].replace(/--/g, '–') === m[1])[0];
      const lqs = Object.keys(D.geo.er_names).map((e) => ({
        er: e, lq: erShare(e, k) / (ONT[k] / ONT_T) })).sort((a, b) => b.lq - a.lq);
      num('HARD', id, 'regional location quotient', m[3],
          erShare(er, k) / (ONT[k] / ONT_T), 'print', CELLS, where);
      counted.comparison++;
      if (lqs[0].er !== er) {
        hard('C', 'comparison', id, 'most concentrated region', m[1],
             D.geo.er_names[lqs[0].er], where);
      }
      /* separation on the two regional counts behind the quotient */
      const a = erVec(lqs[0].er)[k], b = erVec(lqs[1].er)[k];
      if (!clear(Math.max(a, b), Math.min(a, b))) {
        soft('C', 'comparison', id, 'the winning region clearly beats the next',
             fmt(lqs[0].lq) + ' vs ' + fmt(lqs[1].lq),
             'counts ' + a + ' vs ' + b, where,
             'the generator gates on a 15% quotient margin, not on sampling error');
      }
      return;
    }

    /* G2:level - "Education: 7.5% of jobs in small towns, 8.2% in big cities." */
    if (id.startsWith('G2:level:')) {
      const where = srcLine('quiz-ideas.js', "' in big cities. Every place needs it.'");
      m = s.match(/^(.+?): ([\d.]+)% of jobs in small towns, ([\d.]+)% in big cities\. Every place needs it\.$/);
      if (!m) return hard('P', 'number', id, 'card shape', s, '(unparsed)', where);
      const k = naicsIdx(id.slice('G2:level:'.length));
      name(id, 'sector named', m[1], sectorNames, 'the NAICS labels', where);
      num('HARD', id, 'small-town share', m[2], 100 * ctx.sh.small[k], 'print', CELLS, where);
      num('HARD', id, 'big-city share', m[3], 100 * ctx.sh.big[k], 'print', CELLS, where);
      counted.comparison++;
      const r = ctx.sh.small[k] / ctx.sh.big[k];
      if (!(r >= 0.85 && r <= 1.18)) {
        hard('C', 'comparison', id, '"about the same share everywhere"',
             fmt(100 * ctx.sh.small[k]) + '% vs ' + fmt(100 * ctx.sh.big[k]) + '%',
             'ratio ' + fmt(r) + ' outside 0.85-1.18', where);
      }
      return;
    }

    /* G3/G4 lean - "Sector: 9.3% of jobs in small towns, against 0.4% in big cities." */
    if (id.startsWith('G3:lean:') || id.startsWith('G4:lean:')) {
      const small = id.startsWith('G3:');
      const where = srcLine('quiz-ideas.js',
        small ? "' of jobs in small towns, ' +" : "' of jobs in big cities, ' +");
      m = s.match(/^(.+?): ([\d.]+)% of jobs in (small towns|big cities), against ([\d.]+)% in (small towns|big cities)\.$/);
      if (!m) return hard('P', 'number', id, 'card shape', s, '(unparsed)', where);
      const k = naicsIdx(id.split(':')[2]);
      name(id, 'sector named', m[1], sectorNames, 'the NAICS labels', where);
      const first = m[3] === 'small towns' ? ctx.sh.small[k] : ctx.sh.big[k];
      const second = m[5] === 'small towns' ? ctx.sh.small[k] : ctx.sh.big[k];
      num('HARD', id, 'share in ' + m[3], m[2], 100 * first, 'print', CELLS, where);
      num('HARD', id, 'share in ' + m[5], m[4], 100 * second, 'print', CELLS, where);
      counted.comparison++;
      if (!(first > second)) {
        hard('C', 'comparison', id, '"far more of their jobs in"',
             fmt(100 * first) + '% vs ' + fmt(100 * second) + '%', 'not more', where);
      }
      return;
    }

    /* G3:fewer - "Fewer, in 177 of 242 small towns: ..." */
    if (id === 'G3:fewer') {
      const where = srcLine('quiz-ideas.js', "'Fewer, in '");
      m = s.match(/^Fewer, in (\d+) of (\d+) small towns/);
      if (!m) return hard('P', 'number', id, 'card shape', s, '(unparsed)', where);
      const smalls = smallTowns();
      const withRatio = smalls.filter((p) => p.jobsRatio != null);
      num('HARD', id, 'small towns with fewer jobs than working residents', m[1],
          withRatio.filter((p) => p.jobsRatio < 1).length, 'exact', 0, where);
      num('HARD', id, 'small towns counted', m[2], withRatio.length, 'exact', 0, where);
      counted.comparison++;
      if (!(+m[1] / +m[2] > 0.5)) {
        hard('C', 'comparison', id, '"in most small towns"',
             m[1] + ' of ' + m[2], 'not a majority', where);
      }
      return;
    }

    /* G4:selfc - "Big cities: about 6 in 10 ... against 3 in 10 ..." */
    if (id === 'G4:selfc') {
      const where = srcLine('quiz-ideas.js', "'Big cities: about '");
      m = s.match(/^Big cities: about (\d+) in 10 working residents work there, against (\d+) in 10 in a typical small town\.$/);
      if (!m) return hard('P', 'number', id, 'card shape', s, '(unparsed)', where);
      num('HARD', id, 'big-city self-containment, in tenths', m[1],
          10 * med(bigCities().map((p) => p.selfContainmentUsual)), 'print', 0, where);
      num('HARD', id, 'small-town self-containment, in tenths', m[2],
          10 * med(smallTowns().map((p) => p.selfContainmentUsual)), 'print', 0, where);
      counted.comparison++;
      /* (b) the universe: self-containment is over residents with a USUAL
         workplace, which the card's words do not say */
      soft('B', 'name', id, 'the card says "working residents"',
           'working residents', 'residents with a usual workplace', where,
           'self-containment counts only those the commuting table knows about');
      return;
    }

    /* G4:share - "About 75%: 28 cities ... hold 74% of Ontario's jobs." */
    if (id === 'G4:share') {
      const where = srcLine('quiz-ideas.js', "' cities of 100,000 or more '");
      m = s.match(/^About (\d+)%: (\d+) cities of 100,000 or more people hold (\d+)% of Ontario’s jobs\.$/);
      if (!m) return hard('P', 'number', id, 'card shape', s, '(unparsed)', where);
      const bc = bigCities();
      const share = bc.reduce((a, p) => a + sum(W(p.code)), 0) / ONT_T;
      num('HARD', id, 'number of big cities', m[2], bc.length, 'exact', 0, where);
      num('HARD', id, 'share of Ontario jobs', m[3], 100 * share, 'print', CELLS, where);
      counted.number++;
      if (Math.abs(+m[1] - +m[3]) > 5) {
        hard('N', 'number', id, 'the option and the card agree', m[1] + '%', m[3] + '%',
             where, 'the option rounds to the nearest 5; the card does not');
      } else if (m[1] !== m[3]) {
        soft('N', 'number', id, 'the option and the card print different figures',
             'option: about ' + m[1] + '%', 'card: ' + m[3] + '%', where,
             'both are true; two roundings of one number on one screen read as a mistake');
      }
      return;
    }

    /* G5:area - "Southwestern Ontario: 21 of the 28 small towns built on ..." */
    if (id.startsWith('G5:area:')) {
      const where = srcLine('quiz-ideas.js', "' of the ' +");
      m = s.match(/^(.+?): (\d+) of the (\d+) small towns built on (.+?)\.$/);
      if (!m) return hard('P', 'number', id, 'card shape', s, '(unparsed)', where);
      counted.name++;
      if (!AREA_NAMES.has(m[1])) {
        hard('B', 'name', id, 'area named', m[1], 'not one of the four area groupings', where);
      }
      const ty = typeOf(id.slice('G5:area:'.length));
      const list = townsOfType(ty);
      const inArea = list.filter((p) => areaOf(p.er) === areaKey(m[1])).length;
      num('HARD', id, 'towns of this kind in the area', m[2], inArea, 'exact', 0, where);
      num('HARD', id, 'towns of this kind in Ontario', m[3], list.length, 'exact', 0, where);
      counted.comparison++;
      if (!(inArea >= 0.6 * list.length)) {
        hard('C', 'comparison', id, '"most ... are in"', inArea + ' of ' + list.length,
             'under 60%', where);
      }
      if (inArea === list.length) {
        soft('N', 'number', id, '"N of the N" reads as a slip',
             m[2] + ' of the ' + m[3], 'all of them', where,
             'true, but "8 of the 8" looks like an error to a reader');
      }
      return;
    }

    /* G5:<type>:<code> - "X: 45 in every 100 jobs are in farming and
       resources, against 2 across Ontario." */
    if (/^G5:(farm|mine|factory|tourist):/.test(id)) {
      const where = srcLine('quiz-ideas.js', "' in every 100 jobs are ' +");
      m = s.match(/^(.+?): (\d+) in every 100 jobs are in (.+?), against (\d+) across Ontario\.$/);
      if (!m) return hard('P', 'number', id, 'card shape', s, '(unparsed)', where);
      const ty = typeOf(id.split(':')[1]);
      const k = naicsIdx(ty.code);
      const v = W(it.place), t = sum(v);
      name(id, 'place on the card', m[1], placeNames, 'the place list', where);
      num('HARD', id, 'local share, per 100', m[2], 100 * v[k] / t, 'print', CELLS, where);
      num('HARD', id, 'Ontario share, per 100', m[4], 100 * ONT[k] / ONT_T, 'print',
          CELLS, where);
      counted.comparison += 2;
      const lq = (v[k] / t) / (ONT[k] / ONT_T);
      if (!(v[k] / t >= ty.minShare && lq >= ty.minLQ)) {
        hard('C', 'comparison', id, 'the place qualifies as ' + ty.name,
             'share ' + fmt(100 * v[k] / t) + '%, LQ ' + fmt(lq),
             'needs ' + fmt(100 * ty.minShare) + '% and LQ ' + ty.minLQ, where);
      }
      if (Math.round(100 * ONT[k] / ONT_T) === 0) {
        soft('N', 'number', id, 'the Ontario share rounds to zero',
             m[4] + ' in every 100', fmt(100 * ONT[k] / ONT_T) + ' in every 100', where,
             '"against 0 across Ontario" reads as none at all');
      }
      return;
    }

    /* G5:commuter - "X has 3 jobs for every 10 working residents: most work
       elsewhere." */
    if (id.startsWith('G5:commuter:')) {
      const where = srcLine('quiz-ideas.js', "' jobs for every '");
      m = s.match(/^(.+?) has (\d+) jobs for every 10 working residents: most work elsewhere\.$/);
      if (!m) return hard('P', 'number', id, 'card shape', s, '(unparsed)', where);
      name(id, 'place on the card', m[1], placeNames, 'the place list', where);
      num('HARD', id, 'jobs per ten working residents', m[2], 10 * P.jobsRatio, 'print',
          CELLS, where);
      counted.comparison++;
      if (!(P.selfContainmentUsual < 0.5)) {
        hard('C', 'comparison', id, '"most work elsewhere"',
             fmt(100 * P.selfContainmentUsual) + '% work in the town',
             'not a minority', where);
      }
      return;
    }

    /* G5:spread - "Small towns, about 2 times as much: ..." */
    if (id === 'G5:spread') {
      const where = srcLine('quiz-ideas.js', "'Small towns, about '");
      m = s.match(/^Small towns, about ([\d.]+) times as much/);
      if (!m) return hard('P', 'number', id, 'card shape', s, '(unparsed)', where);
      num('HARD', id, 'spread ratio', m[1], ctx.spread.small / ctx.spread.big, 'print',
          0, where);
      counted.comparison++;
      if (!(ctx.spread.small / ctx.spread.big >= 1.5)) {
        hard('C', 'comparison', id, 'small towns do differ more',
             fmt(ctx.spread.small / ctx.spread.big), 'under 1.5', where);
      }
      soft('N', 'number', id, '"about 2 times" is a mean pairwise distance ratio',
           m[1] + ' times', fmt(ctx.spread.small / ctx.spread.big),
           srcLine('methods.js', 'M.mixDistance = function'),
           'a ratio of two Bray-Curtis means has no stated sampling model');
      return;
    }

    /* G6 - "Ottawa: 25% of its jobs, against 7.1% across big cities." */
    if (id.startsWith('G6:')) {
      const where = srcLine('quiz-ideas.js', "' of its jobs, against '");
      m = s.match(/^(.+?): ([\d.]+)% of its jobs, against ([\d.]+)% across big cities\.$/);
      if (!m) return hard('P', 'number', id, 'card shape', s, '(unparsed)', where);
      const k = naicsIdx(id.slice(3));
      const v = W(it.place), t = sum(v);
      name(id, 'city named', m[1], placeNames, 'the place list', where);
      num('HARD', id, 'the city\'s share', m[2], 100 * v[k] / t, 'print', CELLS, where);
      num('HARD', id, 'the big-city share', m[3], 100 * ctx.sh.big[k], 'print', CELLS, where);
      counted.comparison++;
      const r = bigCities().map((p) => ({ p, s: sum(W(p.code)) ? v2(p, k) : 0 }))
        .sort((a, b) => b.s - a.s);
      if (r[0].p.code !== it.place) {
        hard('C', 'comparison', id, 'biggest share among big cities', m[1],
             r[0].p.name, where);
      }
      return;
    }

    /* G7:selfc - "About 6 in 10 of those with a usual workplace. ..." */
    if (id.startsWith('G7:selfc:')) {
      const where = srcLine('quiz-ideas.js', "' in 10 of those with a usual workplace. '");
      m = s.match(/^About (\d+) in 10 of those with a usual workplace\./);
      if (!m) return hard('P', 'number', id, 'card shape', s, '(unparsed)', where);
      const cl = id.slice('G7:selfc:'.length);
      const pool = cl === 'big' ? bigCities() : smallTowns();
      num('HARD', id, cl + ' self-containment, in tenths', m[1],
          10 * med(pool.map((p) => p.selfContainmentUsual)), 'print', 0, where);
      return;
    }

    /* G2:why and G2:base are concept items: they state no figure, so the
       only accuracy question is whether their card contradicts a method. */
    if (it.form === 'concept') {
      methodContradiction(id, s, srcLine('quiz-ideas.js', id.slice(3)));
      return;
    }

    soft('P', 'number', id, 'no rule covers this item', it.form, '(unchecked)',
         'pipeline/audits/accuracy.js', 'add a rule when this form is used');
  }

  /* ============================================ the nine lessons */

  for (const idea of I.IDEAS) {
    itemsChecked++;
    const pts = I.lesson(idea.id).map((p) => p.replace(/<[^>]+>/g, ''));
    const lid = 'lesson:' + idea.id;
    const where = srcLine('quiz-ideas.js', "if (id === '" + idea.id + "')");
    for (const p of pts) {
      /* point at the sentence itself, not just the idea's branch: a lesson
         sentence is concatenated across source lines, so the longest window
         of its text that still appears in the file locates it. */
      let w = where;
      for (let n = 26; n >= 12 && w === where; n -= 2) {
        for (let i = 0; i + n <= p.length; i++) {
          const got = srcLine('quiz-ideas.js', p.slice(i, i + n));
          if (got !== 'quiz-ideas.js') { w = got; break; }
        }
      }
      methodContradiction(lid, p, w);
      if (idea.id === 'change') causal(lid, p, w, 'lesson');
    }
    checkLesson(idea.id, pts, lid, where);
  }

  function checkLesson(ideaId, pts, lid, where) {
    const txt = pts.join(' ');
    let m;
    if (ideaId === 'key') {
      m = txt.match(/work in (.+?) than in any other industry: about (\d+) in every 100 jobs\. Next come (.+?), (.+?) and (.+?)\./);
      if (m) {
        const top = ONT.map((x, k) => ({ k, x: x || 0 })).sort((a, b) => b.x - a.x);
        counted.name++;
        if (D.naics[top[0].k].short.toLowerCase() !== m[1]) {
          hard('C', 'comparison', lid, 'largest industry', m[1],
               D.naics[top[0].k].short, where);
        }
        num('HARD', lid, 'its share, per 100', m[2], 100 * top[0].x / ONT_T, 'print',
            CELLS, where);
        counted.comparison += 3;
        [[m[3], 1], [m[4], 2], [m[5], 3]].forEach(([nm, rank]) => {
          if (D.naics[top[rank].k].short.toLowerCase() !== nm) {
            hard('C', 'comparison', lid, 'industry at rank ' + (rank + 1), nm,
                 D.naics[top[rank].k].short, where);
          }
          if (!clear(top[rank - 1].x, top[rank].x)) {
            hard('C', 'comparison', lid, 'rank ' + rank + ' beats rank ' + (rank + 1),
                 top[rank - 1].x + ' vs ' + top[rank].x, 'not separated at z=3', where,
                 'the lesson states an order the gate does not support');
          }
        });
      }
      if (/mining in the north, finance in Toronto/.test(txt)) {
        counted.comparison += 2;
        const mineTop = topER(naicsIdx('21'))[0], finTop = topER(naicsIdx('52'))[0];
        if (areaOf(mineTop.er) !== 'north') {
          hard('C', 'comparison', lid, '"mining in the north"',
               D.geo.er_names[mineTop.er], 'not a northern region', where);
        }
        if (finTop.er !== '3530') {
          hard('C', 'comparison', lid, '"finance in Toronto"',
               D.geo.er_names[finTop.er], 'not Toronto', where);
        }
      }
    }
    if (ideaId === 'every') {
      m = txt.match(/Together they are (\d+)% of jobs in small towns and (\d+)% in big cities/);
      if (m) {
        const lv = ctx.level;
        num('HARD', lid, 'level sectors, small-town share', m[1],
            100 * lv.reduce((a, x) => a + x.s, 0), 'print', CELLS, where);
        num('HARD', lid, 'level sectors, big-city share', m[2],
            100 * lv.reduce((a, x) => a + x.b, 0), 'print', CELLS, where);
      }
    }
    if (ideaId === 'small') {
      m = txt.match(/Ontario has (\d+) small towns and townships \(under 10,000 people\)/);
      if (m) num('HARD', lid, 'number of small towns', m[1], smallTowns().length,
                 'exact', 0, where);
      m = txt.match(/In (\d+) of (\d+) small towns there are fewer jobs/);
      if (m) {
        const wr = smallTowns().filter((p) => p.jobsRatio != null);
        num('HARD', lid, 'small towns with fewer jobs', m[1],
            wr.filter((p) => p.jobsRatio < 1).length, 'exact', 0, where);
        num('HARD', lid, 'small towns counted', m[2], wr.length, 'exact', 0, where);
      }
    }
    if (ideaId === 'big') {
      m = txt.match(/Ontario’s (\d+) big cities \(100,000 people or more\) hold (\d+)% of its jobs/);
      if (m) {
        const bc = bigCities();
        num('HARD', lid, 'number of big cities', m[1], bc.length, 'exact', 0, where);
        num('HARD', lid, 'their share of jobs', m[2],
            100 * bc.reduce((a, p) => a + sum(W(p.code)), 0) / ONT_T, 'print', CELLS, where);
      }
    }
    if (ideaId === 'smalldiff') {
      m = txt.match(/about ([\d.]+) times as much as big cities do/);
      if (m) num('HARD', lid, 'spread ratio', m[1], ctx.spread.small / ctx.spread.big,
                 'print', 0, where);
      const kinds = txt.match(/(\d+) are (farming|mining|factory|tourist) towns/g) || [];
      kinds.forEach((kk) => {
        const g = kk.match(/(\d+) are (\w+) towns/);
        const ty = I ? typeByWord(g[2]) : null;
        if (ty) num('HARD', lid, g[2] + ' towns', g[1], townsOfType(ty).length,
                    'exact', 0, where);
      });
      m = txt.match(/(\d+) of the (\d+) mining towns are in Northern Ontario/);
      if (m) {
        const list = townsOfType(typeByWord('mining'));
        num('HARD', lid, 'mining towns in the north', m[1],
            list.filter((p) => areaOf(p.er) === 'north').length, 'exact', 0, where);
        num('HARD', lid, 'mining towns', m[2], list.length, 'exact', 0, where);
        if (m[1] === m[2]) {
          soft('N', 'number', lid, '"N of the N" reads as a slip', m[1] + ' of the ' + m[2],
               'all of them', where, 'true, but it looks like an error');
        }
      }
    }
    if (ideaId === 'links' || ideaId === 'big') {
      const mm = txt.match(/typical small town,? about (\d+) in 10/);
      if (mm) num('HARD', lid, 'small-town self-containment, in tenths', mm[1],
                  10 * med(smallTowns().map((p) => p.selfContainmentUsual)), 'print', 0, where);
    }
    if (ideaId === 'change') {
      m = txt.match(/largest employer of residents in (\d+) Ontario municipalities\. By 2011 it was (\d+)/);
      if (m) {
        num('HARD', lid, 'manufacturing-led municipalities 2001', m[1],
            leadCount(D, M, 2001, '31-33'), 'exact', 0, where);
        num('HARD', lid, 'manufacturing-led municipalities 2011', m[2],
            leadCount(D, M, 2011, '31-33'), 'exact', 0, where);
      }
      if (/Across much of Ontario, deaths now outnumber births/.test(txt)) {
        counted.comparison++;
        const comp = D.components.data['2021b'];
        const cds = Object.keys(comp);
        const dec = cds.filter((cd) => {
          const rows = D.componentSummary(comp[cd], '2021b');
          const last = rows[rows.length - 1];
          return last && last.natural < 0;
        }).length;
        if (!(dec / cds.length > 0.5)) {
          hard('C', 'comparison', lid, '"across much of Ontario"',
               dec + ' of ' + cds.length + ' divisions', 'not most', where);
        }
      }
    }
  }

  /* Every NUMBER a glossary term states must appear in the METHODS.md
     section it cites. This is the enforceable half of "the learning layer
     may not claim anything about a method that METHODS.md does not":
     validate.py already checks the section EXISTS; this checks the section
     SAYS IT. Words are not compared - prose is paraphrased on purpose - but
     a figure cannot be paraphrased. */
  const methodsMd = fs.readFileSync(path.join(ROOT, 'METHODS.md'), 'utf8');
  const sections = {};
  {
    const lines = methodsMd.split(/\r?\n/);
    let cur = null;
    for (const line of lines) {
      const h = /^#{2,3}\s+(.+?)\s*$/.exec(line);
      if (h) { cur = h[1]; sections[cur] = sections[cur] || []; continue; }
      if (cur) sections[cur].push(line);
    }
    Object.keys(sections).forEach((k) => { sections[k] = sections[k].join('\n'); });
  }
  /* Numbers that are part of the plain English of a sentence rather than a
     claim about the method: ordinals, "one household in four", years. */
  /* Numbers that are not claims about a method and so need no counterpart in
     METHODS.md: the reference points of a ratio (0, 1) and the "per 100" of a
     percentage. "Above 1 is an employment centre" states where a jobs ratio
     is neutral, which is arithmetic, not a method claim - flagging it was the
     checker's own noise, not the app's. */
  const NOT_A_CLAIM = new Set([0, 1, 100]);
  const usedTerms = new Set();
  items.forEach((it) => (it.terms || []).forEach((t) => usedTerms.add(t)));
  for (const t of T.list) {
    if (!usedTerms.has(t.id)) continue;
    const body = sections[t.methods];
    counted.method++;
    if (body == null) {
      hard('E', 'method', 'term:' + t.id, 'cited METHODS.md section exists',
           t.methods, 'no such heading', srcLine('terms.js', "id: '" + t.id + "'"));
      continue;
    }
    const inSection = numbersIn(body).map((n) => n.value);
    for (const layer of ['plain', 'how', 'when', 'cant']) {
      if (!t[layer]) continue;
      for (const n of numbersIn(t[layer])) {
        counted.number++;
        if (NOT_A_CLAIM.has(n.value)) continue;
        /* a stated figure matches if the section carries one that agrees to
           the precision the term printed it at */
        const tol = halfStepPrinted(String(n.value)) * 2 + 1e-9;
        if (!inSection.some((x) => Math.abs(x - n.value) <= tol ||
                                   Math.abs(x - n.value) <= 0.05 * Math.abs(n.value))) {
          hard('E', 'method', 'term:' + t.id,
               'the figure "' + n.raw + '" in the ' + layer + ' layer',
               n.raw, 'not in METHODS.md ' + t.methods,
               srcLine('terms.js', "id: '" + t.id + "'"),
               'a glossary figure with no counterpart in the section it cites');
        }
      }
    }
  }

  /* ===================================================== report */
  report();

  function report() {
    const hardF = findings.filter((f) => f.sev === 'HARD');
    const softF = findings.filter((f) => f.sev === 'SOFT');
    const out = {
      itemsChecked, claims: counted,
      claimsTotal: Object.keys(counted).reduce((a, k) => a + counted[k], 0),
      hard: hardF.length, soft: softF.length,
      hardFindings: hardF, softFindings: softF
    };
    if (JSON_OUT) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log('=== AUDIT 1 - ACCURACY ===\n');
      console.log('  items checked        ' + String(itemsChecked).padStart(6));
      console.log('  claims checked       ' + String(out.claimsTotal).padStart(6));
      console.log('    numbers            ' + String(counted.number).padStart(6));
      console.log('    names              ' + String(counted.name).padStart(6));
      console.log('    comparisons        ' + String(counted.comparison).padStart(6));
      console.log('    dates              ' + String(counted.date).padStart(6));
      console.log('    method claims      ' + String(counted.method).padStart(6));
      console.log('\n  HARD failures        ' + String(hardF.length).padStart(6));
      console.log('  SOFT notes           ' + String(softF.length).padStart(6) + '\n');
      group(hardF, 'HARD FAILURES');
      if (SHOW_ALL) group(softF, 'SOFT NOTES');
      else if (softF.length) {
        console.log('  (' + softF.length + ' soft notes; run with --all to list them)');
      }
    }
    process.exit(hardF.length ? 1 : 0);
  }

  /* One defect usually shows up in many items, because one generator line
     writes many cards. Group by the line and the reason, not by the wording,
     so 143 cards from one bad line read as one problem to fix. */
  function group(list, title) {
    if (!list.length) { console.log('  ' + title + ': none\n'); return; }
    console.log('  ' + title + '\n  ' + '-'.repeat(68));
    const by = new Map();
    list.forEach((f) => {
      const k = f.rule + '|' + f.where + '|' + f.note;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(f);
    });
    [...by.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([, g]) => {
      const f0 = g[0];
      const ids = new Set(g.map((f) => f.id)).size;
      console.log('\n  * ' + g.length + ' ' + (g.length === 1 ? 'claim' : 'claims') +
                  ' in ' + ids + ' ' + (ids === 1 ? 'item' : 'items') +
                  '  -  ' + f0.where + '  [' + f0.kind + ']');
      console.log('    ' + (f0.note || f0.claim));
      g.slice(0, 5).forEach((f) => {
        console.log('      ' + f.id.padEnd(22) + f.claim.slice(0, 46).padEnd(48) +
                    'said ' + String(f.stated).slice(0, 30) +
                    '  |  ' + String(f.recomputed).slice(0, 44));
      });
      if (g.length > 5) console.log('      ... and ' + (g.length - 5) + ' more of the same');
    });
    console.log('');
  }
})().catch((e) => { console.error(e); process.exit(2); });

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function trim(s) { s = String(s).trim(); return s.length > 90 ? s.slice(0, 88) + '...' : s; }
