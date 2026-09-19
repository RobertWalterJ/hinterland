/* ==========================================================================
   The quiz scheduler.

   ONE scheduler. The first design ran two against each other - Leitner boxes
   deciding what was due, and an Elo rating choosing what was near 70% - and
   rated the QUESTIONS by Elo too, which cannot work with one player: an item
   rating estimated from a single learner just records that learner's
   learning. The learning-science review is why this file looks as it does.

   Each question already seen carries a small forgetting model (an interval
   and an ease, in the SM-2 family that Landfall's scheduler verified). A
   review falls due when its predicted recall would drop to about 90%, and due
   reviews are ordered by how far past that point they are - most at risk
   first. New questions are admitted by a frontier rule that keeps depth from
   starving breadth, the fault Landfall's simulation found.

   Nothing here measures how much anyone knows about Ontario, and nothing on
   screen claims it. "Learned" means one observable thing: answered correctly
   at a review at least SEVEN days after the question was first met.

   The dyslexia review's rules on hidden time pressure are enforced here too:
     - no due or overdue count is ever returned for display;
     - how overdue an item can become is capped, and after a break recent,
       easier items are blended in rather than a run of the most forgotten;
     - nothing learned is ever taken away from the "learned" count;
     - a session may stop at any point and still counts in full.

   Pure functions over a plain state object, so pipeline/quiz_simulate.js can
   drive it with seeded learners and no browser.
   ========================================================================== */

(function (root) {
  'use strict';

  var S = {};

  S.P = {
    sessionSize: 12,
    newPerSession: 4,          /* steady state */
    newEarly: 8,               /* the first sessions are mostly new: re-asking
                                  things never known is not practice */
    earlySessions: 3,
    maxInterval: 60,           /* days */
    firstInterval: 1,
    ease0: 2.4, easeMin: 1.4, easeMax: 3.0,
    lapseFactor: 0.4,          /* a miss SHRINKS the interval; it does not
                                  restart it. Resetting to zero turned every
                                  miss into a review due again today, and the
                                  simulation showed the backlog climbing
                                  without limit. */
    reviewBudget: 9,           /* above this many due reviews, new
                                  questions slow down... */
    newFloor: 1,               /* ...but never below one a session while any
                                  remain. Pausing new questions entirely met
                                  only 44 of 2,927 in ninety simulated days
                                  (depth starving breadth, as Landfall found);
                                  a floor of two overloaded a 12-question
                                  session, reviews ran days late, and recall
                                  at review fell to one in ten. One is what a
                                  short session can sustain. */
    reaskGap: 4,               /* LEARNING STEP: a missed question comes back
                                  once, this many questions later in the same
                                  session, while it is still fresh. Without it
                                  a missed fact went a whole day on a memory
                                  minutes old, and failed again. Once only -
                                  never "three in a row". */
    leechLapses: 4,            /* a question missed this often is not being
                                  learned by drilling it daily; space it out */
    leechFloor: 3,             /* days */
    mix: { A: 0.18, B: 0.28, C: 0.18, D: 0.08, E: 0.18, F: 0.10 },  /* target share of new
                                  questions by strand, so none starves */
    heldAfterDays: 7,          /* the only definition of "learned" */
    overdueCap: 2.0,           /* an item is never treated as more than 2x overdue */
    gapDays: 7,                /* a break this long triggers the blend */
    blockSize: 4               /* reviews run in short blocks by strand */
  };

  var DAY = 86400000;

  S.fresh = function () {
    return { items: {}, sessions: 0, lastSession: null, confusions: {},
             learnedIds: {}, version: 1 };
  };

  function rec(state, id) {
    return state.items[id] || null;
  }

  /* Predicted recall falls as elapsed time outruns the interval; this is the
     quantity reviews are ordered by. Capped, so a long break does not make a
     handful of items look infinitely urgent. */
  function overdue(r, now) {
    var elapsed = (now - r.last) / DAY;
    return Math.min(S.P.overdueCap, elapsed / Math.max(r.ivl, 1e-6));
  }

  S.isDue = function (r, now) { return overdue(r, now) >= 1; };

  /* ------------------------------------------------------------ answer */

  /* Record one answer. `conf` is the optional confidence tap: 'sure',
     'think', 'guess'. A correct GUESS does not grow the interval as much -
     on a three-option question a third of blind taps are right. */
  S.answer = function (state, item, correct, now, opts) {
    opts = opts || {};
    var r = rec(state, item.id);
    var first = !r;
    if (!r) {
      r = state.items[item.id] = {
        first: now, last: now, ivl: 0, ease: S.P.ease0,
        reps: 0, lapses: 0, strand: item.strand
      };
    }
    if (opts.misread) return r;       /* "that was a misread" voids it */

    if (correct) {
      /* A correct GUESS says nothing about memory, so it does not lengthen
         the interval at all. Letting it grow (x1.3) drifted weakly held
         questions out to long intervals, and the simulation showed them
         forgotten when they came back. */
      var grow = opts.conf === 'guess' ? 1.0 : r.ease;
      r.ivl = r.reps === 0 || r.ivl < S.P.firstInterval
        ? S.P.firstInterval
        : Math.min(S.P.maxInterval, r.ivl * grow);
      r.reps++;
      if (opts.conf === 'sure') r.ease = Math.min(S.P.easeMax, r.ease + 0.05);
      r.streak = (r.streak || 0) + 1;
      /* Held: right at a review a week or more after first meeting it - and
         not by a lucky guess. On a three-option question a third of blind
         taps are right, and the simulation showed "learned" questions being
         remembered only a third to a half of the time because of it. So a
         tap marked "guessing" never counts, and without a confidence tap it
         takes two correct reviews in a row. */
      var sinceFirst = (now - r.first) / DAY;
      var trusted = opts.conf === 'sure' || opts.conf === 'think' ||
                    (opts.conf == null && r.streak >= 2);
      if (!first && sinceFirst >= S.P.heldAfterDays && trusted &&
          opts.conf !== 'guess') {
        if (!state.learnedIds[item.id]) state.learnedIds[item.id] = now;
      }
    } else {
      r.lapses++;
      r.ivl = Math.max(r.lapses >= S.P.leechLapses ? S.P.leechFloor : 1,
                       r.ivl * S.P.lapseFactor);
      r.ease = Math.max(S.P.easeMin, r.ease - 0.2);
      r.streak = 0;
      if (opts.chose) {
        var k = item.id + '|' + opts.chose;
        state.confusions[k] = { at: now, session: state.sessions };
      }
    }
    r.last = now;
    /* a confusion clears only on a correct answer in a LATER session */
    if (correct) {
      Object.keys(state.confusions).forEach(function (k) {
        if (k.indexOf(item.id + '|') === 0 &&
            state.confusions[k].session < state.sessions) {
          delete state.confusions[k];
        }
      });
    }
    return r;
  };

  /* LEARNING STEPS. After a miss, the session runner puts the question
     back `reaskGap` places later - once. The re-ask is recorded here and
     moves nothing on the day scale except to settle the next review at one
     day: a correct re-ask means "seen, corrected, recalled minutes later",
     which is a start, not a memory. */
  S.reaskPosition = function (queue, idx) {
    return Math.min(queue.length, idx + 1 + S.P.reaskGap);
  };
  S.reasked = function (state, item, correct, now) {
    var r = state.items[item.id];
    if (!r) return null;
    r.ivl = S.P.firstInterval;
    r.last = now;
    r.reasks = (r.reasks || 0) + 1;
    return r;
  };

  /* Counts for display. Deliberately NO due / overdue / backlog figure: a
     number that grows while you are away is pressure without a clock. */
  S.progress = function (state) {
    var byStrand = {};
    Object.keys(state.learnedIds).forEach(function (id) {
      var s = id.charAt(0);
      byStrand[s] = (byStrand[s] || 0) + 1;
    });
    return { learned: Object.keys(state.learnedIds).length,
             seen: Object.keys(state.items).length, byStrand: byStrand };
  };

  /* ------------------------------------------------------------ plan */

  /* Build one session. Returns item ids in play order.

     - Due reviews, most at risk first - but after a long break, blended with
       items still well-remembered, so the first thing met on return is not a
       run of what has been forgotten.
     - New items admitted every session while any remain (breadth is never
       starved), more of them early on.
     - Reviews grouped in short blocks by strand: switching question type
       costs effort and buys nothing when the kinds are not confusable. */
  S.plan = function (state, bank, now, opts) {
    opts = opts || {};
    var P = S.P;
    var size = opts.size || P.sessionSize;
    var ids = Object.keys(state.items);

    var due = ids.filter(function (id) {
      return bank.byId[id] && S.isDue(state.items[id], now);
    }).sort(function (a, b) {
      return overdue(state.items[b], now) - overdue(state.items[a], now);
    });

    /* After a break, everything due sits at the overdue cap together, so
       alternating most and least at risk has nothing to alternate. Open
       instead with two questions that are well remembered - long intervals,
       not yet due - so the first minutes back are recognition rather than a
       run of what has been forgotten. */
    var sinceLast = state.lastSession ? (now - state.lastSession) / DAY : 0;
    var warm = [];
    if (sinceLast >= P.gapDays) {
      /* the MOST CONSOLIDATED learned questions, due or not: after a long
         break almost everything is due, and "not yet due" left nothing to
         warm up with */
      warm = ids.filter(function (id) {
        return bank.byId[id] && state.learnedIds[id];
      }).sort(function (a, b) {
        return state.items[b].ivl - state.items[a].ivl;
      }).slice(0, 2);
      due = due.filter(function (id) { return warm.indexOf(id) < 0; });
      /* among the due, easier (higher ease) first */
      due.sort(function (a, b) { return state.items[b].ease - state.items[a].ease; });
    }

    var early = state.sessions < P.earlySessions;
    var wantNew = early ? P.newEarly : P.newPerSession;
    var unseen = bank.items.filter(function (it) {
      return !state.items[it.id] && S.available(state, it);
    });
    /* New questions wait while reviews are heavy, but never for more than a
       few sessions running: depth must not block breadth. */
    /* Intake responds to review load smoothly. Light load: the full
       allowance. Heavy: one. Very heavy: one every third session - so the
       review pool can drain, but breadth never JAMS, which was Landfall's
       lesson (not "a new question in every session", which a simulation
       showed overloads a twelve-question session). */
    var starvedFor = state.sessionsWithoutNew || 0;
    var nNew;
    if (!unseen.length) nNew = 0;
    else if (early || due.length <= P.reviewBudget) nNew = wantNew;
    else if (due.length <= 2 * P.reviewBudget) nNew = P.newFloor;
    else nNew = starvedFor >= 2 ? P.newFloor : 0;
    nNew = Math.min(nNew, unseen.length, size - warm.length);
    var nRev = Math.min(due.length, size - nNew - warm.length);
    state._plannedNew = nNew;

    var fresh = S.pickNew(state, unseen, nNew, opts);
    var reviews = due.slice(0, nRev);

    /* reviews in short blocks by strand */
    var byStrand = {};
    reviews.forEach(function (id) {
      var s = bank.byId[id].strand;
      (byStrand[s] = byStrand[s] || []).push(id);
    });
    var blocks = [];
    Object.keys(byStrand).forEach(function (s) {
      var list = byStrand[s];
      for (var i = 0; i < list.length; i += P.blockSize) {
        blocks.push(list.slice(i, i + P.blockSize));
      }
    });

    /* after a break, open warm; otherwise open on the most surprising new
       item; then the new run; then reviews */
    var order = warm.slice();
    if (fresh.length) order.push(fresh.shift());
    order = order.concat(fresh);
    blocks.forEach(function (b) { order = order.concat(b); });
    return order.slice(0, size);
  };

  /* Prerequisites. Only strand B is a real chain: concentration only makes
     sense once "what a place's jobs are" is familiar. Everything else runs in
     parallel, and "jump ahead" (opts.all) opens everything. */
  S.available = function (state, it) {
    if (it.form !== 'concentrated') return true;
    var learnedB = Object.keys(state.learnedIds).filter(function (id) {
      return id.indexOf('B1:') === 0 || id.indexOf('B2:') === 0;
    }).length;
    return learnedB >= 5 || !!state.jumpAhead;
  };

  /* Choose new items: surprising first, then spread across strands so no
     strand is starved, then a gentle difficulty ramp. Home places, if set,
     come first - a learner anchors new facts to places they know. */
  S.pickNew = function (state, unseen, n, opts) {
    if (!n) return [];
    opts = opts || {};
    var home = opts.home || {};
    var mix = S.P.mix;

    /* Pick the STRAND first - whichever is furthest below its target share
       of questions met so far - then the best question within it. Scoring
       questions directly let the surprise bonus win every slot, and the
       simulation showed three strands never reaching "learned" at all. */
    var met = {}, total = 0;
    Object.keys(state.items).forEach(function (id) {
      var st = id.charAt(0); met[st] = (met[st] || 0) + 1; total++;
    });
    var pool = {};
    unseen.forEach(function (it) {
      (pool[it.strand] = pool[it.strand] || []).push(it);
    });

    function score(it) {
      var sc = 0;
      sc += (it.surprise || 0) * 1.5;                 /* numeric, not truthy */
      sc += (it.place && home[it.place]) ? 2 : 0;
      sc -= it.prior * 0.8;                           /* easier first */
      return sc;
    }
    Object.keys(pool).forEach(function (st) {
      pool[st].sort(function (x, y) {
        return score(y) - score(x) || (x.id < y.id ? -1 : 1);
      });
    });

    var out = [];
    while (out.length < n) {
      var best = null, bestGap = -Infinity;
      Object.keys(pool).forEach(function (st) {
        if (!pool[st].length) return;
        var share = total ? (met[st] || 0) / total : 0;
        var gap = (mix[st] || 0.1) - share;
        if (gap > bestGap) { bestGap = gap; best = st; }
      });
      if (!best) break;
      var it = pool[best].shift();
      out.push(it.id);
      met[best] = (met[best] || 0) + 1; total++;
    }
    return out;
  };

  S.endSession = function (state, now) {
    state.sessions++;
    state.lastSession = now;
    state.sessionsWithoutNew = state._plannedNew ? 0
      : (state.sessionsWithoutNew || 0) + 1;
    delete state._plannedNew;
  };

  /* Accuracy corrected for guessing, for honest self-report: on a k-option
     question a rate r implies a knowledge rate (r - 1/k) / (1 - 1/k). */
  S.corrected = function (rate, k) {
    return Math.max(0, (rate - 1 / k) / (1 - 1 / k));
  };

  /* ------------------------------------------------------ persistence */

  var KEY = 'hinterland.quiz.v1';
  S.load = function () {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      if (raw) {
        var st = JSON.parse(raw);
        if (st && st.version === 1) return st;
      }
    } catch (e) { /* private window, blocked storage: start fresh */ }
    return S.fresh();
  };
  S.save = function (state) {
    try {
      if (root.localStorage) root.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* progress is lost on this device, nothing else */ }
  };

  root.GRA = root.GRA || {};
  root.GRA.quizSched = S;
}(this));
