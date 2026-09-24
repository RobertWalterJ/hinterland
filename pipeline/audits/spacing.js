/* AUDIT 2a - THE SCHEDULER: spacing versus sameness.

   The 90-day study (pipeline/quiz_simulate.js) drives ONE sitting a day and
   asks whether the backlog stays bounded and whether what the scheduler
   calls "learned" is still remembered. It cannot see the fault Robert
   actually feels, because that fault only shows up with a REALISTIC playing
   pattern: a couple of short sittings in one day, every day, for a fortnight.
   At that pace a four-hour cool-down is no protection at all - the evening
   sitting is six hours after the morning one - and an interval of one day
   means "again tomorrow, and the day after, and the day after that".

   So this drives the REAL scheduler (app/js/quiz-sched.js, through
   pipeline/audits/harness.js) through that fortnight and counts how often
   the same question comes back, and how fast.

   Nothing here models the scheduler. S.plan / S.answer / S.endSession are
   the app's own functions, over the app's own bank.

   ------------------------------------------------------------------ the play
     14 days, no days missed (this is the "keen fortnight", the worst case
     for repetition). Two sittings a day: morning at about 08:00 and evening
     at about 14:00 - six hours apart, so the scheduler's four-hour
     cool-down has expired and everything is eligible again. Session size 12.
     Time-of-day jitter of a few minutes, seeded.

   --------------------------------------------------------- the answer model
     Stated plainly, because the numbers depend on it:

     - Every question has a hidden STRENGTH in days, starting at zero.
     - The first time a question is asked, the learner already knows the
       answer with probability 0.25 (some of this is real prior knowledge,
       some is reasoning from the options).
     - After that, the chance of RECALLING it is exp(-gapDays / strength):
       the standard exponential forgetting curve.
     - Recall or not, the learner then answers. If they did not recall it
       they guess, and get it right 1/k of the time on a k-option question
       (this bank has both two- and three-option questions).
     - Reading the answer card is a learning event. A successful recall
       more than doubles the strength (the spacing effect); a miss leaves a
       small residue that grows a little each time the card is read.
       Constants: right -> strength = max(1.8, strength * 2.2 + 1.2);
       wrong -> strength = max(0.70 * 1.6^(misses-1), strength * 0.50).
     - Confidence is reported honestly: 'sure' when recalled, 'guess' when not.

     Calibration: this produces 58% correct overall across the fortnight,
     49% on a first sighting and 61% on a question already seen - inside the
     55-70% band asked for, and better on the familiar. The exact figures are
     printed at the top of every run, so they can be checked, not trusted.

   Run:
     node pipeline/audits/spacing.js
     node pipeline/audits/spacing.js --json
     node pipeline/audits/spacing.js --seed 4242
*/
'use strict';
const { load, bank, rng, report } = require('./harness');

const DAY = 86400000;
const ARGV = process.argv.slice(2);
const JSON_OUT = ARGV.includes('--json');
const SEED = (() => {
  const i = ARGV.indexOf('--seed');
  return i >= 0 && ARGV[i + 1] ? (+ARGV[i + 1] >>> 0) : 20260924;
})();
const DAYS = 14;
const SIZE = 12;

/* ------------------------------------------------------------ the learner */

function makeLearner(rnd) {
  const mem = {};                 /* hidden from the scheduler, as it must be */
  return {
    /* returns {right, recalled, fresh, k} and updates the hidden memory */
    ask(item, now) {
      const k = item.options.length;
      let m = mem[item.id];
      const fresh = !m;
      if (!m) m = mem[item.id] = { strength: 0, seen: null, misses: 0 };
      let recalled;
      if (m.seen == null) recalled = rnd() < 0.25;
      else recalled = rnd() < Math.exp(-((now - m.seen) / DAY) / Math.max(m.strength, 1e-6));
      const right = recalled || rnd() < 1 / k;
      if (recalled) {
        m.strength = Math.max(1.8, m.strength * 2.2 + 1.2);
      } else {
        m.misses++;
        m.strength = Math.max(0.70 * Math.pow(1.6, m.misses - 1), m.strength * 0.50);
      }
      m.seen = now;
      return { right, recalled, fresh, k };
    }
  };
}

/* ------------------------------------------------------------------- run */

function run(G, b, seed) {
  const S = G.quizSched;
  const rnd = rng(seed);
  const st = S.fresh();
  const learner = makeLearner(rnd);
  const t0 = Date.UTC(2026, 8, 7, 8);        /* a Monday morning */

  const asks = [];            /* {id, day, sitting, t, right, fresh} */
  const sittings = [];        /* one row per sitting */
  const lastAskDay = {};      /* id -> day index of previous ask */
  const lastAskT = {};        /* id -> timestamp of previous ask */
  const count = {};           /* id -> how many times asked */

  for (let d = 0; d < DAYS; d++) {
    for (let s = 0; s < 2; s++) {
      /* morning ~08:00, evening ~14:00: six hours apart, past the 4h cool-down */
      const hour = s === 0 ? 8 : 14;
      const jitter = Math.floor(rnd() * 25) * 60000;
      const now = t0 + d * DAY + (hour - 8) * 3600000 + jitter;

      /* what the scheduler is holding BEFORE it plans: reviews waiting */
      const cool = now - S.P.coolHours * 3600000;
      const dueAll = Object.keys(st.items).filter(
        (id) => b.byId[id] && S.isDue(st.items[id], now)).length;
      const dueEligible = Object.keys(st.items).filter(
        (id) => b.byId[id] && (st.seen[id] || 0) <= cool && S.isDue(st.items[id], now)).length;

      const plan = S.plan(st, b, now, { size: SIZE });
      let fresh = 0, right = 0, recalled = 0;
      const gapsHere = [];
      for (const id of plan) {
        const it = b.byId[id];
        if (it.idea && !st.lessons[it.idea]) st.lessons[it.idea] = now;  /* lesson screen */
        const a = learner.ask(it, now);
        S.answer(st, it, a.right, now, { conf: a.recalled ? 'sure' : 'guess',
                                         chose: a.right ? null : 'x' });
        if (a.fresh) fresh++;
        if (a.right) right++;
        if (a.recalled) recalled++;
        const prev = lastAskDay[id];
        asks.push({ id, day: d, sitting: s, fresh: a.fresh, right: a.right,
                    gapDays: prev == null ? null : d - prev,
                    gapHours: lastAskT[id] == null ? null : (now - lastAskT[id]) / 3600000,
                    form: it.form, idea: it.idea });
        if (prev != null) gapsHere.push(d - prev);
        lastAskDay[id] = d;
        lastAskT[id] = now;
        count[id] = (count[id] || 0) + 1;
      }
      S.endSession(st, now);
      sittings.push({ day: d, sitting: s, label: (s === 0 ? 'am' : 'pm'),
                      asked: plan.length, fresh, right, recalled,
                      dueWaiting: dueAll, dueEligible,
                      repeatsFromYesterday: gapsHere.filter((g) => g === 1).length,
                      sameDay: gapsHere.filter((g) => g === 0).length });
    }
  }
  return { st, asks, sittings, count };
}

/* -------------------------------------------------------------- measures */

function measure(b, r) {
  const { asks, sittings, count, st } = r;
  const total = asks.length;
  const ids = Object.keys(count);
  const distinct = ids.length;
  const seen5 = ids.filter((id) => count[id] >= 5).length;
  const seen3 = ids.filter((id) => count[id] >= 3).length;
  const seen8 = ids.filter((id) => count[id] >= 8).length;
  const maxTimes = ids.reduce((m, id) => Math.max(m, count[id]), 0);
  const top = ids.sort((a, x) => count[x] - count[a] || (a < x ? -1 : 1)).slice(0, 8)
    .map((id) => ({ id, times: count[id], stem: b.byId[id].stem }));

  const repeats = asks.filter((a) => a.gapDays != null);
  const buckets = { same: 0, d1: 0, d2: 0, d3to6: 0, d7plus: 0 };
  repeats.forEach((a) => {
    const g = a.gapDays;
    if (g === 0) buckets.same++;
    else if (g === 1) buckets.d1++;
    else if (g === 2) buckets.d2++;
    else if (g <= 6) buckets.d3to6++;
    else buckets.d7plus++;
  });
  const consecutive = buckets.d1;

  /* a "tight" ask: back within a day of the last sighting, either way */
  const tight = buckets.same + buckets.d1;

  /* first-time-right items that still came back the next day: the exact case
     the comparison app fixed with a three-day gap after a clean first pass */
  let firstRightThenNextDay = 0;
  const firstAsk = {}, firstRight = {};
  asks.forEach((a) => {
    if (firstAsk[a.id] == null) { firstAsk[a.id] = a.day; firstRight[a.id] = a.right; }
  });
  asks.forEach((a) => {
    if (a.gapDays === 1 && firstRight[a.id] && a.day === firstAsk[a.id] + 1) {
      firstRightThenNextDay++;
    }
  });

  /* misses that came back tomorrow again and again: the back-off case */
  const missChains = {};
  asks.forEach((a) => {
    if (!a.right) missChains[a.id] = (missChains[a.id] || 0) + 1;
  });
  const repeatMissed = Object.keys(missChains).filter((id) => missChains[id] >= 3).length;
  let missedThenNextDay = 0;
  {
    const lastWrongDay = {};
    asks.forEach((a) => {
      if (lastWrongDay[a.id] != null && a.day === lastWrongDay[a.id] + 1) missedThenNextDay++;
      if (!a.right) lastWrongDay[a.id] = a.day; else delete lastWrongDay[a.id];
    });
  }

  /* new questions per sitting, against the reviews that were waiting */
  const newPer = sittings.map((s) => s.fresh);
  const byLoad = [
    { label: '0-3 reviews waiting', lo: 0, hi: 3 },
    { label: '4-8 reviews waiting', lo: 4, hi: 8 },
    { label: '9-14 reviews waiting', lo: 9, hi: 14 },
    { label: '15+ reviews waiting', lo: 15, hi: Infinity }
  ].map((bk) => {
    const rows = sittings.filter((s) => s.dueWaiting >= bk.lo && s.dueWaiting <= bk.hi);
    return { label: bk.label, sittings: rows.length,
             meanNew: rows.length ? +(rows.reduce((a, s) => a + s.fresh, 0) / rows.length).toFixed(2) : null,
             minNew: rows.length ? Math.min(...rows.map((s) => s.fresh)) : null,
             zeroNew: rows.filter((s) => s.fresh === 0).length };
  });
  const starved = sittings.filter((s) => s.fresh === 0 && s.asked > 0).length;
  const starvedWithBacklog = sittings.filter((s) => s.fresh === 0 && s.dueWaiting > 0).length;
  const thin = sittings.filter((s) => s.fresh <= 1 && s.dueWaiting > 8).length;

  const rightN = asks.filter((a) => a.right).length;
  const freshAsks = asks.filter((a) => a.fresh);
  const seenAsks = asks.filter((a) => !a.fresh);

  return {
    days: DAYS, sittings: sittings.length, asks: total,
    distinct, seen3, seen5, seen8, maxTimes, top,
    consecutiveDay: consecutive,
    consecutiveShare: +(consecutive / total).toFixed(3),
    tightAsks: tight, tightShare: +(tight / total).toFixed(3),
    repeatAsks: repeats.length,
    gaps: buckets,
    gapShareOfRepeats: {
      same: +(buckets.same / Math.max(1, repeats.length)).toFixed(3),
      d1: +(buckets.d1 / Math.max(1, repeats.length)).toFixed(3),
      d2: +(buckets.d2 / Math.max(1, repeats.length)).toFixed(3),
      d3to6: +(buckets.d3to6 / Math.max(1, repeats.length)).toFixed(3),
      d7plus: +(buckets.d7plus / Math.max(1, repeats.length)).toFixed(3)
    },
    firstRightThenNextDay, missedThenNextDay, repeatMissed,
    newPerSitting: { mean: +(newPer.reduce((a, x) => a + x, 0) / newPer.length).toFixed(2),
                     min: Math.min(...newPer), max: Math.max(...newPer),
                     series: newPer },
    newByReviewLoad: byLoad,
    starvedSittings: starved, starvedWithBacklog, thinWithBacklog: thin,
    accuracy: +(rightN / total).toFixed(3),
    accuracyFirstSighting: +(freshAsks.filter((a) => a.right).length /
                             Math.max(1, freshAsks.length)).toFixed(3),
    accuracyOnSeen: +(seenAsks.filter((a) => a.right).length /
                      Math.max(1, seenAsks.length)).toFixed(3),
    bankItems: b.items.length,
    canAnswerEnd: Object.keys(st.items).filter((id) => st.items[id].right).length,
    meanTimesSeen: +(total / Math.max(1, distinct)).toFixed(2),
    dueAtEnd: sittings[sittings.length - 1].dueWaiting
  };
}

/* ------------------------------------------------------------------ main */

(async function main() {
  const G = await load();
  const b = bank(G);

  const r = run(G, b, SEED);
  const m = measure(b, r);

  /* determinism: the same seed must give the same fortnight */
  const again = run(G, b, SEED);
  m.deterministic = JSON.stringify(again.asks) === JSON.stringify(r.asks);
  m.seed = SEED;

  if (JSON_OUT) { console.log(JSON.stringify(m, null, 1)); return; }

  const pc = (x) => (100 * x).toFixed(0) + '%';
  const L = [];
  L.push('A fortnight of keen play, through the real scheduler.');
  L.push('  ' + m.days + ' days, two sittings a day (08:00 and 14:00, six hours apart),');
  L.push('  ' + SIZE + ' questions a sitting, bank of ' + m.bankItems + ' questions, seed ' +
         m.seed + ', deterministic: ' + m.deterministic);
  L.push('');
  L.push('THE LEARNER (check the model before you trust the counts)');
  L.push('  answered right overall: ' + pc(m.accuracy) +
         '   first sighting: ' + pc(m.accuracyFirstSighting) +
         '   already seen: ' + pc(m.accuracyOnSeen));
  L.push('');
  L.push('HOW MUCH GROUND WAS COVERED');
  L.push('  asks in the fortnight ............ ' + m.asks);
  L.push('  DISTINCT questions seen ......... ' + m.distinct +
         '  (' + pc(m.distinct / m.bankItems) + ' of the bank)');
  L.push('  seen 3 or more times ............ ' + m.seen3);
  L.push('  seen 5 OR MORE TIMES ............ ' + m.seen5);
  L.push('  seen 8 or more times ............ ' + m.seen8);
  L.push('  most-repeated question .......... ' + m.maxTimes + ' times');
  L.push('  mean sightings per distinct question: ' + m.meanTimesSeen);
  L.push('  the worst offenders:');
  m.top.forEach((t) => L.push('    ' + String(t.times).padStart(2) + 'x  ' + t.id +
                              '  ' + t.stem.slice(0, 58)));
  L.push('');
  L.push('HOW FAST IT CAME BACK');
  L.push('  asks THE DAY AFTER the last sighting: ' + m.consecutiveDay + ' of ' + m.asks +
         ' asks (' + pc(m.consecutiveShare) + ')');
  L.push('  same day or next day ................ ' + m.tightAsks + ' of ' + m.asks +
         ' asks (' + pc(m.tightShare) + ')');
  L.push('');
  L.push('  gap since the last sighting (' + m.repeatAsks + ' repeat asks)');
  L.push('    same day .... ' + String(m.gaps.same).padStart(4) + '   ' +
         pc(m.gapShareOfRepeats.same));
  L.push('    1 day ....... ' + String(m.gaps.d1).padStart(4) + '   ' +
         pc(m.gapShareOfRepeats.d1));
  L.push('    2 days ...... ' + String(m.gaps.d2).padStart(4) + '   ' +
         pc(m.gapShareOfRepeats.d2));
  L.push('    3-6 days .... ' + String(m.gaps.d3to6).padStart(4) + '   ' +
         pc(m.gapShareOfRepeats.d3to6));
  L.push('    7+ days ..... ' + String(m.gaps.d7plus).padStart(4) + '   ' +
         pc(m.gapShareOfRepeats.d7plus));
  L.push('');
  L.push('  got right FIRST TIME, then asked again the very next day: ' +
         m.firstRightThenNextDay);
  L.push('  missed, then asked again the very next day: ' + m.missedThenNextDay);
  L.push('  questions missed three times or more: ' + m.repeatMissed);
  L.push('');
  L.push('NEW QUESTIONS PER SITTING');
  L.push('  mean ' + m.newPerSitting.mean + ', lowest ' + m.newPerSitting.min +
         ', highest ' + m.newPerSitting.max);
  L.push('  by how many reviews were waiting when the sitting was planned:');
  m.newByReviewLoad.forEach((x) => {
    if (!x.sittings) return;
    L.push('    ' + x.label.padEnd(22) + String(x.sittings).padStart(3) + ' sittings   ' +
           'mean new ' + String(x.meanNew).padStart(5) + '   lowest ' + x.minNew +
           '   with none at all: ' + x.zeroNew);
  });
  L.push('  sittings with no new question at all: ' + m.starvedSittings +
         ' (of which with reviews waiting: ' + m.starvedWithBacklog + ')');
  L.push('  sittings with 1 or fewer new while more than 8 reviews waited: ' +
         m.thinWithBacklog);
  L.push('');
  L.push('  new per sitting, in order (am, pm, am, pm, ...):');
  for (let i = 0; i < m.newPerSitting.series.length; i += 14) {
    L.push('    day ' + String(i / 2 + 1).padStart(2) + '+  ' +
           m.newPerSitting.series.slice(i, i + 14).join(' '));
  }
  report('AUDIT 2a - spacing', L);
})().catch((e) => { console.error(e); process.exit(1); });
