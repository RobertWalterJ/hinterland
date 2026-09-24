/* AUDIT 3 - question shapes: what is the player actually being asked to do?

   The quiz bank is counted everywhere else by STRAND and FORM, which are
   data-structure labels: 'class-fact' holds a comparison, a share and a
   rate, and 'bigger' and 'on-pair' are the same job on different nouns.
   This audit counts the pool by the TASK instead - what the reader has to
   do with their head to get it right - and then checks WHERE each task
   sits in the introduction order, by driving the REAL scheduler.

   That second half is the part that matters. A shape can exist in the bank
   and still never be met: the comparison app's audit found new shapes
   appended to the end of the pack, where no player would ever reach them.
   Hinterland gates its pool by big idea and level (quiz-sched.js), so the
   same failure is possible here and is invisible in a count.

   Three new shapes are then costed - their yield under the gates as
   written - from material the app has already verified. Nothing here
   writes a fact and nothing here is implemented in app/.

   Run:  node pipeline/audits/shapes.js
         node pipeline/audits/shapes.js --json
*/
'use strict';
const { load, bank } = require('./harness');

const JSON_OUT = process.argv.includes('--json');

/* ======================================================= the taxonomy */

/* Nine tasks. Each says what the reader must DO, and carries the demand it
   makes, from the vocabulary the audit brief set: recall, compare,
   identify-from-evidence, read-a-number, judge-a-method, order-in-time,
   true-or-false.

   The classifier reads the item, not its form name, wherever a form holds
   more than one task (class-fact does). */
const TASKS = [
  { id: 'compare-two-named', demand: 'compare',
    what: 'Two or three things are NAMED. Rank them on one measure: which has more jobs, which employs more people, which class of place keeps more of its workers.' },
  { id: 'place-to-fact', demand: 'recall',
    what: 'A place is named in the stem. Pick the fact that is true of it: its largest industry, its commonest occupation, where its commuters go, its structural twin. Nothing on screen helps; you either know the place or you do not.' },
  { id: 'fact-to-place', demand: 'recall',
    what: 'A description is given, three places are offered. Which place fits? The same knowledge as place-to-fact, run backwards.' },
  { id: 'identify-from-evidence', demand: 'identify-from-evidence',
    what: 'A sector profile is DRAWN on screen with no name on it. Read the picture, then say whose it is. The only task in the bank where the evidence is in front of the reader.' },
  { id: 'class-rule', demand: 'recall',
    what: 'A general rule about a whole class - small towns, big cities, Ontario. Recall of the lesson itself, no particular place involved.' },
  { id: 'read-a-number', demand: 'read-a-number',
    what: 'A figure is stated or has to be sized: what a location quotient of 0.4 means, what share of jobs sit in the big cities, how many in ten work where they live.' },
  { id: 'judge-a-method', demand: 'judge-a-method',
    what: 'Which method answers this question, what a method cannot tell you, why a pattern holds. About the instruments, not about Ontario.' },
  { id: 'order-in-time', demand: 'order-in-time',
    what: 'Which of two events came first. Sequence, not size.' },
  { id: 'true-or-false', demand: 'true-or-false',
    what: 'A yes/no claim about one place, with the reason restated in each button.' }
];
const TASK_IDS = TASKS.map((t) => t.id);

/* Forms that sit wholly in one task. */
const BY_FORM = {
  bigger: 'compare-two-named',
  'on-pair': 'compare-two-named',
  largest: 'place-to-fact',
  occupation: 'place-to-fact',
  'commute-out': 'place-to-fact',
  'commute-in': 'place-to-fact',
  twin: 'place-to-fact',
  concentrated: 'fact-to-place',
  'type-which': 'fact-to-place',
  'big-lean': 'fact-to-place',
  'er-cluster': 'fact-to-place',
  fingerprint: 'identify-from-evidence',
  'on-top': 'class-rule',
  'on-leads': 'class-rule',
  'class-lean': 'class-rule',
  'class-level': 'class-rule',
  'type-area': 'class-rule',
  'read-number': 'read-a-number',
  'which-method': 'judge-a-method',
  cannot: 'judge-a-method',
  concept: 'judge-a-method',
  'which-first': 'order-in-time',
  yesno: 'true-or-false'
};

/* A magnitude option set - every option is a quantity of the same kind -
   means the reader is sizing a number, whatever the form is called. */
function magnitudeSet(it) {
  const labs = it.options.map((o) => String(o.label));
  const numeric = labs.filter((l) => /^(About )?[\d.,]+( ?%| in 10| of \d+)?$/i.test(l.trim()));
  return numeric.length === labs.length && labs.length >= 2;
}
/* A comparison in words: the options name the things being ranked. */
const COMPARE_WORDS = /^(In |About the same$)|^(Small towns|Big cities|Fewer|More)\b/;

function classify(it) {
  if (BY_FORM[it.form]) return BY_FORM[it.form];
  if (magnitudeSet(it)) return 'read-a-number';
  if (it.form === 'class-fact') {
    const labs = it.options.map((o) => String(o.label));
    if (labs.every((l) => COMPARE_WORDS.test(l))) return 'compare-two-named';
    return 'class-rule';
  }
  if (it.form === 'data-history') return magnitudeSet(it) ? 'read-a-number' : 'class-rule';
  return 'class-rule';
}

/* ===================================================== the simulation */

/* The same learner model pipeline/quiz_simulate.js uses, which validate.py
   already runs: a true difficulty near the item's prior, a small chance of
   knowing an item before meeting it, exponential forgetting with a
   stability that grows on recall, and a one-in-k guess. It is here to drive
   the REAL scheduler through forty sittings, not to measure learning. */
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const DAY = 86400000;

function sittings(G, B, seed, n) {
  const S = G.quizSched;
  const rnd = mulberry(seed);
  const st = S.fresh();
  const mem = {};
  const t0 = Date.UTC(2026, 0, 5, 9);
  const asked = [];                       /* [{sitting, id}] in play order */
  for (let d = 0; d < n; d++) {
    const now = t0 + d * DAY;
    const plan = S.plan(st, B, now);
    for (const id of plan) {
      const it = B.byId[id];
      if (it.idea && !st.lessons[it.idea]) st.lessons[it.idea] = now;
      const k = it.options.length;
      let m = mem[it.id];
      if (!m) {
        const diff = Math.min(1, Math.max(0, it.prior + (rnd() - 0.5) * 0.3));
        m = mem[it.id] = { diff, stab: 0, seen: null };
      }
      const recalled = !m.seen ? rnd() < 0.35 * (1 - m.diff)
                               : rnd() < Math.exp(-((now - m.seen) / DAY) / m.stab);
      const right = recalled || rnd() < 1 / k;
      S.answer(st, it, right, now, { conf: recalled ? 'sure' : 'guess',
                                     chose: right ? null : 'x' });
      const R = m.seen ? Math.exp(-((now - m.seen) / DAY) / m.stab) : 0;
      if (recalled) {
        m.stab = m.stab ? m.stab * (1.2 + 3.5 * (1 - R) + 1.2 * (1 - m.diff))
                        : 3 * (1.3 - 0.6 * m.diff);
      } else {
        m.fails = (m.fails || 0) + 1;
        m.stab = Math.max(m.stab ? m.stab * 0.4 : 0, 0.4 * Math.pow(1.6, m.fails - 1));
      }
      m.seen = now;
      asked.push({ sitting: d + 1, id });
    }
    S.endSession(st, now);
  }
  return asked;
}

function median(a) {
  const s = a.filter((x) => x != null).slice().sort((x, y) => x - y);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
}

/* ============================================ costing the new shapes */

/* Every proposal is priced against the gates as written in quiz-bank.js -
   the same helper functions, not a copy of them - so the yields below are
   what the app would actually get, not what a design note hopes for. */
function costProposals(G, B) {
  const D = G.data, h = G.quizBank._h;
  const out = {};

  /* --- N1: put three places in ORDER, biggest first, inside one census
     division. Gate: G1 on BOTH adjacent pairs and on both measures (G8),
     G2 floor, G9 names, G4/G5 chips from CHIP.work. --- */
  const byCD = {};
  h.csds().forEach((p) => {
    const t = h.total(h.vec(p.code, 'total')), u = h.total(h.vec(p.code, 'usual'));
    if (t > h.FLOOR && u > h.FLOOR) (byCD[p.cd] = byCD[p.cd] || []).push({ p, t, u });
  });
  let n1triples = 0, n1cds = 0, n1capped = 0;
  Object.keys(byCD).forEach((cd) => {
    const ps = byCD[cd].slice().sort((a, b) => b.t - a.t);
    let here = 0;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        for (let k = j + 1; k < ps.length; k++) {
          const a = ps[i], b = ps[j], c = ps[k];
          if (!h.clear(a.t, b.t) || !h.clear(b.t, c.t)) continue;       /* G1 */
          if (!h.clear(a.u, b.u) || !h.clear(b.u, c.u)) continue;       /* G8 */
          if (!h.namesOk([h.optName(a.p), h.optName(b.p), h.optName(c.p)])) continue;
          here++;
        }
      }
    }
    n1triples += here;
    if (here) { n1cds++; n1capped += Math.min(here, 3); }   /* 3 per division */
  });
  out.N1 = { qualifying: n1triples, divisions: n1cds, capped3PerCD: n1capped,
             ofCDs: Object.keys(byCD).length };

  /* --- N2: provenance. Which source is a figure from, and which of two
     figures is the more recent? Built from app/data/meta.json only. --- */
  const meta = D.meta || {};
  const src = (meta.sources || []);
  const withCite = src.filter((s) => s.cite && s.vintage && s.title);
  /* a source is askable when its purpose names a figure the app shows */
  const askable = withCite.filter((s) => /jobs|labour force|commut|population|multiplier|business|boundar|tract/i.test(String(s.purpose || '') + s.title));
  /* distinct vintage years, for the "which is more recent" pair form */
  const yearOf = (s) => {
    const m = String(s.vintage).match(/(19|20)\d{2}/g);
    return m ? Math.max.apply(null, m.map(Number)) : null;
  };
  const yrs = withCite.map((s) => ({ s, y: yearOf(s) })).filter((x) => x.y);
  let n2pairs = 0;
  for (let i = 0; i < yrs.length; i++) {
    for (let j = i + 1; j < yrs.length; j++) {
      if (Math.abs(yrs[i].y - yrs[j].y) >= 4) n2pairs++;    /* 4 years apart, as F1 */
    }
  }
  out.N2 = { sources: src.length, askable: askable.length, datedPairs: n2pairs,
             whichSource: askable.length, capped: Math.min(askable.length, 14) + Math.min(n2pairs, 20) };

  /* --- N3: true against a common myth. Two generators.
     (a) place level: the place's most DISTINCTIVE sector is not its
         largest - the bank already finds and flags this (surprise), so the
         claim and its refutation are both already verified.
     (b) class level: "most jobs in small towns are in farming" - false
         wherever the class's most distinctive sector is under half its
         jobs and a different sector clearly leads. --- */
  const surpriseB2 = B.items.filter((it) => it.form === 'largest' && it.surprise).length;
  const I = G.quizIdeas, ctx = I._ctx();
  let n3class = 0;
  const classNames = ['small', 'mid', 'big'];
  classNames.forEach((cl) => {
    const sh = ctx.sh[cl];
    if (!sh) return;
    const rank = sh.map((x, k) => ({ k, x })).sort((a, b) => b.x - a.x);
    const lq = sh.map((x, k) => ({ k, lq: x / (ctx.on[k] / ctx.onT || 1e-9), x }))
      .sort((a, b) => b.lq - a.lq);
    for (let i = 0; i < 3; i++) {
      const d = lq[i];
      if (!d || d.k === rank[0].k) continue;      /* the myth must be wrong */
      if (d.x >= 0.5) continue;                   /* "most" would be true */
      if (d.lq < 1.5) continue;                   /* not what it is known for */
      if (rank[0].x < 1.4 * d.x) continue;        /* the real leader must clearly lead */
      n3class++;
    }
  });
  out.N3 = { placeLevel: surpriseB2, classLevel: n3class, total: surpriseB2 + n3class };

  /* --- N4 (noted, not proposed first): cloze on a generated lesson
     sentence. Yield is the number of lesson sentences carrying exactly one
     blankable figure or sector name. --- */
  let n4 = 0;
  (I.IDEAS || []).forEach((idea) => {
    (I.lesson(idea.id) || []).forEach((s) => {
      const plain = String(s).replace(/<[^>]+>/g, '');
      const nums = plain.match(/\b\d[\d,.]*%?\b/g) || [];
      if (nums.length >= 1) n4++;
    });
  });
  out.N4 = { lessonSentences: n4 };
  return out;
}

/* ================================================================ run */

(async function main() {
  const G = await load();
  const B = bank(G);
  const items = B.items;

  /* ---- 1. the pool, by task ---- */
  const pool = {}, formsIn = {}, ideasIn = {}, levelsIn = {}, optsIn = {};
  TASK_IDS.forEach((t) => { pool[t] = 0; formsIn[t] = {}; ideasIn[t] = {}; levelsIn[t] = {}; optsIn[t] = {}; });
  const taskOf = {};
  items.forEach((it) => {
    const t = classify(it);
    taskOf[it.id] = t;
    pool[t]++;
    formsIn[t][it.strand + '/' + it.form] = (formsIn[t][it.strand + '/' + it.form] || 0) + 1;
    ideasIn[t][it.idea] = (ideasIn[t][it.idea] || 0) + 1;
    levelsIn[t][it.level] = (levelsIn[t][it.level] || 0) + 1;
    optsIn[t][it.options.length] = (optsIn[t][it.options.length] || 0) + 1;
  });
  const N = items.length;
  const shares = {};
  TASK_IDS.forEach((t) => { shares[t] = pool[t] / N; });
  const ranked = TASK_IDS.slice().sort((a, b) => pool[b] - pool[a]);
  const dominant = ranked[0];

  /* ---- 2. where each task sits in the introduction order ---- */
  const SEEDS = [11, 23, 37, 41, 59, 67, 83];
  const SITTINGS = 40;
  const perSeed = SEEDS.map((s) => sittings(G, B, s, SITTINGS));
  const first = {}, inFirst100 = {}, inFirst14 = {}, totalAsked = [];
  TASK_IDS.forEach((t) => { first[t] = []; inFirst100[t] = []; inFirst14[t] = []; });
  perSeed.forEach((asked) => {
    totalAsked.push(asked.length);
    const seen = {};
    asked.forEach((a) => {
      const t = taskOf[a.id];
      if (seen[t] == null) seen[t] = a.sitting;
    });
    const f100 = {}, f14 = {};
    asked.slice(0, 100).forEach((a) => { f100[taskOf[a.id]] = (f100[taskOf[a.id]] || 0) + 1; });
    asked.filter((a) => a.sitting <= 14)
      .forEach((a) => { f14[taskOf[a.id]] = (f14[taskOf[a.id]] || 0) + 1; });
    TASK_IDS.forEach((t) => {
      first[t].push(seen[t] == null ? null : seen[t]);
      inFirst100[t].push(f100[t] || 0);
      inFirst14[t].push(f14[t] || 0);
    });
  });
  const intro = {};
  TASK_IDS.forEach((t) => {
    const f = first[t];
    const met = f.filter((x) => x != null);
    intro[t] = {
      firstSittingMedian: median(met),
      firstSittingRange: met.length ? [Math.min.apply(null, met), Math.max.apply(null, met)] : null,
      learnersWhoNeverMeetIt: f.length - met.length,
      /* pooled over every learner's first 100, so the column sums to 100% */
      ofFirst100Pooled: inFirst100[t].reduce((s, x) => s + x, 0),
      ofFirst100Share: inFirst100[t].reduce((s, x) => s + x, 0) / (100 * SEEDS.length),
      ofFirst100Range: [Math.min.apply(null, inFirst100[t]), Math.max.apply(null, inFirst100[t])],
      inFirstFortnightMedian: median(inFirst14[t]),
      reachedInFortnight: inFirst14[t].filter((x) => x > 0).length + '/' + SEEDS.length
    };
  });
  const unreachable = TASK_IDS.filter((t) => (intro[t].inFirstFortnightMedian || 0) === 0);

  /* also: the same question for FORMS, since that is how the bank names
     itself and a dead form is the concrete thing to fix */
  const formFirst = {};
  perSeed.forEach((asked) => {
    const seen = {};
    asked.forEach((a) => {
      const f = B.byId[a.id].strand + '/' + B.byId[a.id].form;
      if (seen[f] == null) seen[f] = a.sitting;
    });
    Object.keys(seen).forEach((f) => { (formFirst[f] = formFirst[f] || []).push(seen[f]); });
  });
  const allForms = {};
  items.forEach((it) => { allForms[it.strand + '/' + it.form] = (allForms[it.strand + '/' + it.form] || 0) + 1; });
  const formIntro = {};
  Object.keys(allForms).sort().forEach((f) => {
    const hits = formFirst[f] || [];
    formIntro[f] = { items: allForms[f], metBy: hits.length + '/' + SEEDS.length,
                     firstSittingMedian: hits.length ? median(hits) : null };
  });
  const deadForms = Object.keys(formIntro)
    .filter((f) => formIntro[f].firstSittingMedian == null ||
                   formIntro[f].firstSittingMedian > 14);

  /* A shape "never" met in forty sittings still has a date. One learner is
     run out to a year of daily sittings to find it: the answer to "how long
     would Robert have to play" is the finding, not the absence. */
  const LONG = 365;
  const longAsked = sittings(G, B, SEEDS[0], LONG);
  const longFirstForm = {}, longFirstTask = {};
  longAsked.forEach((a) => {
    const it = B.byId[a.id];
    const f = it.strand + '/' + it.form;
    if (longFirstForm[f] == null) longFirstForm[f] = a.sitting;
    const t = taskOf[a.id];
    if (longFirstTask[t] == null) longFirstTask[t] = a.sitting;
  });
  const longRun = { sittings: LONG, seed: SEEDS[0], asked: longAsked.length,
                    firstSittingByForm: longFirstForm, firstSittingByTask: longFirstTask,
                    neverInAYear: Object.keys(allForms).filter((f) => longFirstForm[f] == null) };

  /* ---- 3. what the new shapes would yield ---- */
  const proposals = costProposals(G, B);

  const result = {
    items: N, tasks: TASKS, pool, shares, ranked, dominant,
    formsPerTask: formsIn, ideasPerTask: ideasIn, levelsPerTask: levelsIn,
    optionCounts: optsIn,
    simulation: { seeds: SEEDS, sittings: SITTINGS,
                  questionsAskedPerLearner: totalAsked, intro, unreachable,
                  formIntro, deadForms, longRun },
    proposals
  };

  if (JSON_OUT) { console.log(JSON.stringify(result)); return; }

  const pc = (x) => (100 * x).toFixed(1) + '%';
  console.log('=== AUDIT 3  question shapes ===\n');
  console.log(N + ' questions in the bank, in ' + Object.keys(allForms).length +
              ' generator forms, doing ' + TASK_IDS.length + ' different jobs.\n');

  console.log('-- the pool, by task --\n');
  ranked.forEach((t) => {
    const T = TASKS.find((x) => x.id === t);
    console.log('  ' + t.padEnd(24) + String(pool[t]).padStart(5) + '  ' +
                pc(shares[t]).padStart(7) + '   [' + T.demand + ']');
    console.log('      ' + Object.keys(formsIn[t]).sort().map((f) => f + ' ' + formsIn[t][f]).join(', '));
  });
  console.log('\n  dominant task: ' + dominant + ' at ' + pc(shares[dominant]) +
              ' of the pool.');
  const lookup = pool['place-to-fact'] + pool['fact-to-place'] + pool['identify-from-evidence'];
  console.log('  one-place lookup (place-to-fact + fact-to-place + identify-from-evidence): ' +
              lookup + ', ' + pc(lookup / N) + '.');

  console.log('\n-- where each task sits in the introduction order --');
  console.log('   ' + SEEDS.length + ' seeded learners, ' + SITTINGS +
              ' sittings each, driven through the real scheduler.\n');
  console.log('  task                     first sitting    share of   met at all   met in the');
  console.log('                           (median, range)  first 100  in 40        first 14');
  ranked.forEach((t) => {
    const i = intro[t];
    const fs = i.firstSittingMedian == null ? 'never'
      : i.firstSittingMedian + ' (' + i.firstSittingRange[0] + '-' + i.firstSittingRange[1] + ')';
    const met = (SEEDS.length - i.learnersWhoNeverMeetIt) + '/' + SEEDS.length;
    console.log('  ' + t.padEnd(24) + fs.padEnd(17) +
                pc(i.ofFirst100Share).padStart(7) + '    ' + met.padEnd(13) +
                i.reachedInFortnight);
  });
  if (unreachable.length) {
    console.log('\n  NOT MET IN THE FIRST FORTNIGHT: ' + unreachable.join(', '));
  } else {
    console.log('\n  every task is met inside the first fortnight.');
  }
  console.log('\n  forms not met in the first fortnight by the median learner:');
  if (!deadForms.length) console.log('    none');
  deadForms.forEach((f) => {
    console.log('    ' + f.padEnd(20) + String(formIntro[f].items).padStart(5) +
                ' items, met by ' + formIntro[f].metBy + ' learners, median first sitting ' +
                (formIntro[f].firstSittingMedian == null ? 'never' : formIntro[f].firstSittingMedian));
  });

  console.log('\n-- how long before a shape is reached at all --');
  console.log('   one learner, ' + LONG + ' daily sittings (' + longRun.asked +
              ' questions). First sitting a form appears:\n');
  Object.keys(allForms).sort((a, b) => (longFirstForm[a] || 1e9) - (longFirstForm[b] || 1e9))
    .forEach((f) => {
      console.log('    ' + f.padEnd(20) + String(allForms[f]).padStart(5) + ' items   ' +
                  (longFirstForm[f] == null ? 'never in a year' : 'sitting ' + longFirstForm[f]));
    });

  console.log('\n-- what three new shapes would yield, under the gates as written --\n');
  console.log('  N1  put three places in order, inside one census division');
  console.log('      ' + proposals.N1.qualifying.toLocaleString('en-CA') +
              ' triples pass G1 on both adjacent pairs and both measures, G2 and G9,');
  console.log('      across ' + proposals.N1.divisions + ' of ' + proposals.N1.ofCDs +
              ' divisions. Capped at three per division: ' + proposals.N1.capped3PerCD + ' items.');
  console.log('  N2  where does this number come from?');
  console.log('      ' + proposals.N2.sources + ' sources in meta.json, ' +
              proposals.N2.askable + ' of them naming a figure the app shows;');
  console.log('      ' + proposals.N2.datedPairs + ' source pairs at least four years apart. ' +
              'Capped: about ' + proposals.N2.capped + ' items.');
  console.log('  N3  true against a common myth');
  console.log('      ' + proposals.N3.placeLevel + ' places where the distinctive sector is ' +
              'not the largest (already flagged),');
  console.log('      plus ' + proposals.N3.classLevel + ' class-level myths. ' +
              proposals.N3.total + ' items.');
  console.log('  N4  (spare) fill the gap in a generated lesson sentence: ' +
              proposals.N4.lessonSentences + ' sentences carry a blankable figure.');
  console.log('');
})().catch((e) => { console.error(e); process.exit(1); });
