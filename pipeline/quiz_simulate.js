/* Simulate seeded learners through the quiz scheduler, before any screen.

   The learning-science review asked for this explicitly, as Landfall's
   scheduler was tested: a scheduler's faults - depth starving breadth, a
   backlog that grows without limit, a return from a break that opens on a
   wall of forgotten items - are invisible in code review and obvious in a
   ninety-day simulation.

   The learner model is deliberately simple and standard:
     - each question has a true difficulty, near its prior;
     - before first meeting a question, the learner knows it with a small
       probability that is larger for easy questions;
     - after seeing an answer card, memory decays exponentially with a
       stability that grows after each successful recall (the spacing
       effect) and falls after a failure;
     - a question not recalled is still answered right one time in three by
       guessing, on three-option questions.

   It checks behaviour, not a learning rate: the scheduler cannot claim to
   know how fast anyone learns, and the test does not pretend it does.

   Prints JSON for validate.py; `--table` for a readable trace.
*/
'use strict';
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'app');
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.fetch = (u) => {
  const f = path.join(APP, 'data', String(u).split('/').pop());
  return Promise.resolve({ ok: true, status: 200,
    json: () => Promise.resolve(JSON.parse(fs.readFileSync(f, 'utf8'))) });
};
const geval = eval;
for (const f of ['methods.js', 'charts.js', 'data.js', 'terms.js',
                 'quiz-bank.js', 'quiz-sched.js']) {
  geval(fs.readFileSync(path.join(APP, 'js', f), 'utf8'));
}
const G = globalThis.GRA;
const DAY = 86400000;

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(bank, seed, days) {
  const S = G.quizSched;
  const rnd = mulberry(seed);
  const st = S.fresh();
  const mem = {};                    /* the learner's TRUE memory, hidden from S */
  const t0 = Date.UTC(2026, 0, 5, 9);
  const trace = [];
  let post = null;
  let reviews = 0, recalledAtReview = 0, learnedReviews = 0, learnedRecalled = 0;

  for (let d = 0; d < days; d++) {
    const now = t0 + d * DAY;
    const onBreak = d >= 40 && d < 54;           /* a two-week break */
    if (onBreak || rnd() < 0.15) continue;       /* and some missed days */

    const isFirstBack = d === 54;
    let firstBackRecalled = 0, firstBackAsked = 0;
    const plan = S.plan(st, bank, now);
    const stopEarly = rnd() < 0.1;               /* "stop here", half-way */
    const take = stopEarly ? Math.ceil(plan.length / 2) : plan.length;

    let fresh = 0, correct = 0, asked = 0;
    const odAtStart = plan.map((id) => {
      const r = st.items[id];
      return r ? Math.min(2, ((now - r.last) / DAY) / Math.max(r.ivl, 1e-6)) : null;
    });

    const queue = plan.slice(0, take);
    const reasked = {};
    for (let i = 0; i < queue.length; i++) {
      const it = bank.byId[queue[i]];
      if (reasked[it.id] === 'pending') {
        /* the learning step: minutes after seeing the card */
        reasked[it.id] = 'done';
        const m2 = mem[it.id];
        const rec2 = rnd() < 0.85;
        S.reasked(st, it, rec2 || rnd() < 1 / it.options.length, now);
        if (rec2) m2.stab = Math.max(m2.stab, 1.2 + 1.5 * (1 - m2.diff));
        m2.seen = now;
        continue;
      }
      const k = it.options.length;
      let m = mem[it.id];
      if (!m) {
        fresh++;
        const diff = Math.min(1, Math.max(0, it.prior + (rnd() - 0.5) * 0.3));
        m = mem[it.id] = { diff, stab: 0, seen: null };
      }
      let recalled;
      if (!m.seen) recalled = rnd() < 0.35 * (1 - m.diff);
      else recalled = rnd() < Math.exp(-((now - m.seen) / DAY) / m.stab);
      const right = recalled || rnd() < 1 / k;
      if (isFirstBack && i < 3 && m.seen) { firstBackAsked++; if (recalled) firstBackRecalled++; }
      const conf = recalled ? 'sure' : 'guess';
      S.answer(st, it, right, now, { conf, chose: right ? null : 'x' });
      if (!right && !reasked[it.id]) {
        reasked[it.id] = 'pending';
        queue.splice(S.reaskPosition(queue, i), 0, it.id);
      }
      /* The answer card is a learning event, right or wrong. A successful
         recall strengthens memory MORE when it was harder - retrievability
         R was lower - which is the principle behind FSRS. A flat gain let
         intervals outrun memory for ever, so recall sat near 50% at every
         review and nothing could consolidate. */
      const R = m.seen ? Math.exp(-((now - m.seen) / DAY) / m.stab) : 0;
      /* Starting stabilities from FSRS-4.5's published defaults: about 0.4
         days after a failed first attempt, about 3 after a good one. */
      if (recalled) {
        m.stab = m.stab ? m.stab * (1.2 + 3.5 * (1 - R) + 1.2 * (1 - m.diff))
                        : 3 * (1.3 - 0.6 * m.diff);
      } else {
        m.stab = m.stab ? Math.max(0.4, m.stab * 0.4) : 0.4;
      }
      if (m.seen && it.id in st.items) {
        reviews++;
        if (recalled) recalledAtReview++;
        if (st.learnedIds[it.id] && m.wasLearned) {
          learnedReviews++; if (recalled) learnedRecalled++;
        }
      }
      m.wasLearned = !!st.learnedIds[it.id];
      m.seen = now;
      asked++; if (right) correct++;
    }
    S.endSession(st, now);

    const due = Object.keys(st.items).filter((id) => S.isDue(st.items[id], now + DAY)).length;
    const maxIvl = Math.max(0, ...Object.values(st.items).map((r) => r.ivl));
    const row = { day: d, planned: plan.length, asked, fresh, correct,
                  learned: Object.keys(st.learnedIds).length,
                  seen: Object.keys(st.items).length, dueTomorrow: due, maxIvl };
    trace.push(row);
    if (isFirstBack) {
      const reviews = odAtStart.filter((x) => x != null);
      post = { firstThreeRecalled: firstBackRecalled + ' of ' + firstBackAsked,
               reviews: reviews.length,
               atCap: reviews.filter((x) => x >= 1.99).length,
               lowRisk: reviews.filter((x) => x < 1.5).length };
    }
  }

  /* true retention of what the scheduler says is learned, at the end */
  const end = t0 + days * DAY;
  const learnedIds = Object.keys(st.learnedIds);
  const ret = learnedIds.map((id) => {
    const m = mem[id];
    return m && m.seen ? Math.exp(-((end - m.seen) / DAY) / m.stab) : 0;
  });
  const meanRet = ret.length ? ret.reduce((a, b) => a + b, 0) / ret.length : 0;
  const strandsLearned = [...new Set(learnedIds.map((id) => id.charAt(0)))].sort();
  return { trace, post, meanRet, strandsLearned, state: st,
           recallAtReview: reviews ? recalledAtReview / reviews : 0,
           learnedHeld: learnedReviews ? learnedRecalled / learnedReviews : null,
           learnedReviews };
}

(async function main() {
  await G.data.load();
  const bank = G.quizBank.build();
  const days = 90;
  const runs = [11, 23, 47].map((seed) => ({ seed, ...simulate(bank, seed, days) }));
  const again = simulate(bank, 11, days);
  const deterministic = JSON.stringify(again.trace) === JSON.stringify(runs[0].trace);

  const checks = runs.map((r) => {
    const t = r.trace;
    /* Breadth is about JAMMING: the longest run of sessions in a row with
       no new question while new ones remained. */
    let run = 0, longestRun = 0;
    t.forEach((x) => {
      if (x.fresh === 0 && x.asked > 0 && x.seen < bank.items.length) {
        run++; longestRun = Math.max(longestRun, run);
      } else run = 0;
    });
    const starved = longestRun;
    const maxDue = Math.max(...t.map((x) => x.dueTomorrow));
    const lastDue = t[t.length - 1].dueTomorrow;
    const monotone = t.every((x, i) => i === 0 || x.learned >= t[i - 1].learned);
    return {
      seed: r.seed, sessions: t.length,
      seen: t[t.length - 1].seen, learned: t[t.length - 1].learned,
      starvedSessions: starved, maxDueTomorrow: maxDue, finalDueTomorrow: lastDue,
      maxInterval: Math.max(...t.map((x) => x.maxIvl)),
      learnedNeverFalls: monotone,
      postBreak: r.post, meanRetentionOfLearned: +r.meanRet.toFixed(3),
      recallAtReview: +r.recallAtReview.toFixed(3),
      learnedHeldAtNextReview: r.learnedHeld == null ? null : +r.learnedHeld.toFixed(3),
      learnedReviews: r.learnedReviews,
      strandsLearned: r.strandsLearned.join('')
    };
  });

  const out = { days, bankItems: bank.items.length, deterministic, runs: checks };
  if (process.argv.includes('--table')) {
    console.log('scheduler simulation: ' + days + ' days, ' + bank.items.length +
                ' questions, 3 seeded learners, deterministic: ' + deterministic + '\n');
    for (const c of checks) {
      console.log('seed ' + c.seed + ': ' + c.sessions + ' sessions, ' + c.seen +
        ' questions met, ' + c.learned + ' learned (held a week later)');
      console.log('  longest run of sessions with no new question: ' + c.starvedSessions);
      console.log('  most reviews due on any one day: ' + c.maxDueTomorrow +
                  ' (at the end: ' + c.finalDueTomorrow + ')');
      console.log('  longest interval: ' + c.maxInterval.toFixed(1) + ' days');
      console.log('  learned count never falls: ' + c.learnedNeverFalls);
      if (c.postBreak) {
        console.log('  first session back after 14 days: ' + c.postBreak.reviews +
          ' reviews, ' + c.postBreak.atCap + ' at the overdue cap, ' +
          c.postBreak.lowRisk + ' still well remembered; first three recalled: ' +
          c.postBreak.firstThreeRecalled);
      }
      console.log('  recall at the moment a review falls due: ' +
                  (100 * c.recallAtReview).toFixed(0) + '%');
      console.log('  questions it calls learned, recalled at their next review: ' +
                  (c.learnedHeldAtNextReview == null ? 'n/a'
                   : (100 * c.learnedHeldAtNextReview).toFixed(0) + '% of ' +
                     c.learnedReviews));
      console.log('  strands with something learned: ' + c.strandsLearned + '\n');
    }
    const r0 = runs[0].trace;
    console.log('seed 11, every 10th session:');
    console.log('  day  asked  new  right  learned  seen  due-tomorrow  max-interval');
    r0.filter((_, i) => i % 10 === 0).forEach((x) => {
      console.log('  ' + String(x.day).padStart(3) + String(x.asked).padStart(7) +
        String(x.fresh).padStart(5) + String(x.correct).padStart(7) +
        String(x.learned).padStart(9) + String(x.seen).padStart(6) +
        String(x.dueTomorrow).padStart(14) + String(x.maxIvl.toFixed(1)).padStart(14));
    });
  } else {
    console.log(JSON.stringify(out));
  }
})().catch((e) => { console.error(e); process.exit(1); });
