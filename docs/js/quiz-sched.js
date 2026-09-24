/* ==========================================================================
   The quiz scheduler.

   ONE scheduler. Each question already seen carries a small forgetting
   model (an interval and an ease, in the SM-2 family Landfall verified). A
   review falls due when its predicted recall would drop to about 90%, and
   due reviews are ordered by how far past that point they are.

   Version 3 brings over what Palimpsest learned from being played:

     - NO REPEATS inside a session. The first version put a missed question
       back four places later ("learning steps"). Played, that reads as the
       same question again; the answer card is the teaching, and the miss
       comes back the next day instead.
     - A MINIMUM GAP of three days between sightings. The first version had a
       four-hour cool-down, which could never bite: no interval was ever
       shorter than a day, so "tomorrow" was the default answer to a miss and
       a fortnight of keen play put a third of all asks on consecutive days
       and showed only 72 distinct questions.
     - SIMILAR QUESTIONS KEPT APART: one question per place per session, at
       most three of one form, and the order spread so the same idea does
       not come twice running where it can be avoided.
     - THE SET GROWS WITH THE READER. Questions belong to big ideas
       (quiz-ideas.js), which open in order, and each idea's levels - the
       basics, places, surprises - open as the level before is partly known.
     - PACE FOLLOWS THE REVIEWS: more new questions when few are due, fewer
       when many are, never none while any remain.
     - GROWTH IS RECORDED: what you can answer now, day by day, and which
       questions you missed once and later got right.

   Two counts are shown. "Can answer": the questions whose last answer was
   right - observed, not modelled, and it can fall. "Held": answered right a
   week or more after first meeting it, by more than a guess - only rises.

   Dyslexia rules still hold here: no due or overdue count is ever returned
   for display, overdue is capped, a return from a break opens warm, and a
   session may stop at any point and counts in full.

   Pure functions over a plain state object, so pipeline/quiz_simulate.js can
   drive it with seeded learners and no browser.
   ========================================================================== */

(function (root) {
  'use strict';

  var S = {};

  S.P = {
    sessionSize: 12,
    maxInterval: 60,           /* days */
    firstInterval: 1,
    minGapDays: 3,             /* never the same question inside three days:
                                  measured, a fortnight of keen play put a
                                  third of all asks on consecutive days */
    lapseBackoff: [2, 2],      /* days after a first miss, then a second: a
                                  miss used to mean "tomorrow", every time.
                                  Swept against both studies: [1,1] held 68%
                                  but left the backlog over its bound, [2,3]
                                  drained it further but cost 3 more points of
                                  retention. [2,2] keeps 65% (the weakest
                                  learner 60%, the best of the three) with the
                                  backlog inside 0.67. */
    ease0: 2.4, easeMin: 1.4, easeMax: 3.0,
    lapseFactor: 0.4,          /* a miss SHRINKS the interval; it does not
                                  restart it (a reset made every miss due again
                                  today, and the backlog climbed without limit) */
    leechLapses: 3, leechFloor: 3,
    tasteEvery: 1,             /* every Nth sitting may spend ONE slot on a
                                  kind of question the reader has never been
                                  set, from beyond the ladder. Swept: 1 fires
                                  too often and crowds out the fingerprint. */
    heldAfterDays: 7,          /* the only definition of "held" */
    overdueCap: 2.0,
    gapDays: 7,                /* a break this long opens the session warm */
    coolHours: 4,              /* not asked again within this, across sessions */
    perPlace: 1,               /* questions about one place in one session */
    perForm: 2,                /* questions of one form in one session */
    openAfterCan: 3,           /* a level or idea opens when the one before has
                                  this many you can answer... */
    openAfterMet: 6            /* ...or this many met, so a hard idea cannot
                                  block everything after it */
  };

  var DAY = 86400000;

  S.fresh = function () {
    return { items: {}, sessions: 0, lastSession: null, confusions: {},
             learnedIds: {}, seen: {}, days: {}, opened: {}, lessons: {},
             version: 1 };
  };

  function upgrade(st) {
    ['items', 'confusions', 'learnedIds', 'seen', 'days', 'opened', 'lessons']
      .forEach(function (k) { if (!st[k]) st[k] = {}; });
    return st;
  }

  function overdue(r, now) {
    var elapsed = (now - r.last) / DAY;
    return Math.min(S.P.overdueCap, elapsed / Math.max(r.ivl, 1e-6));
  }
  S.isDue = function (r, now) { return overdue(r, now) >= 1; };
  function dayKey(t) {
    var d = new Date(t);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }
  S.dayKey = dayKey;

  /* ------------------------------------------------------------ answer */

  S.answer = function (state, item, correct, now, opts) {
    opts = opts || {};
    upgrade(state);
    var r = state.items[item.id];
    var first = !r;
    if (!r) {
      r = state.items[item.id] = {
        first: now, last: now, ivl: 0, ease: S.P.ease0,
        reps: 0, lapses: 0, strand: item.strand
      };
    }
    if (opts.misread) return r;
    state.seen[item.id] = now;

    if (correct) {
      /* a correct GUESS says nothing about memory: no growth */
      var grow = opts.conf === 'guess' ? 1.0 : r.ease;
      r.ivl = r.reps === 0 || r.ivl < S.P.firstInterval
        ? S.P.firstInterval
        : Math.min(S.P.maxInterval, r.ivl * grow);
      r.reps++;
      if (opts.conf === 'sure') r.ease = Math.min(S.P.easeMax, r.ease + 0.05);
      r.streak = (r.streak || 0) + 1;
      var sinceFirst = (now - r.first) / DAY;
      var trusted = opts.conf === 'sure' || opts.conf === 'think' ||
                    (opts.conf == null && r.streak >= 2);
      if (!first && sinceFirst >= S.P.heldAfterDays && trusted &&
          opts.conf !== 'guess') {
        if (!state.learnedIds[item.id]) state.learnedIds[item.id] = now;
      }
      /* turned around: missed once, right later on another day */
      if (r.missedAt && !r.turned && dayKey(now) !== dayKey(r.missedAt)) r.turned = now;
    } else {
      r.lapses++;
      r.ivl = Math.max(r.lapses >= S.P.leechLapses ? S.P.leechFloor
                       : (S.P.lapseBackoff[r.lapses - 1] || S.P.leechFloor),
                       r.ivl * S.P.lapseFactor);
      r.ease = Math.max(S.P.easeMin, r.ease - 0.2);
      r.streak = 0;
      if (!r.missedAt) r.missedAt = now;
      if (opts.chose) {
        state.confusions[item.id + '|' + opts.chose] = { at: now, session: state.sessions };
      }
    }
    r.right = !!correct;
    r.last = now;
    if (correct) {
      Object.keys(state.confusions).forEach(function (k) {
        if (k.indexOf(item.id + '|') === 0 &&
            state.confusions[k].session < state.sessions) delete state.confusions[k];
      });
    }
    return r;
  };

  /* ------------------------------------------------------ ideas & levels */

  /* Where the reader is in each big idea: what is open, what they have met,
     what they can answer. Ideas open in order; within an idea the levels do.
     Everything is derived from the answers, so nothing can drift out of step
     with them. */
  S.ideas = function (state, bank, I) {
    upgrade(state);
    I = I || root.GRA.quizIdeas;
    var list = I ? I.IDEAS : [];
    var out = {}, prevOpen = true, prevReady = true;
    list.forEach(function (idea) {
      var lv = { 1: { total: 0, met: 0, can: 0 }, 2: { total: 0, met: 0, can: 0 },
                 3: { total: 0, met: 0, can: 0 } };
      (bank.byIdea[idea.id] || []).forEach(function (it) {
        var L = lv[it.level] || lv[3];
        L.total++;
        var r = state.items[it.id];
        if (r) { L.met++; if (r.right) L.can++; }
      });
      var met = lv[1].met + lv[2].met + lv[3].met;
      var can = lv[1].can + lv[2].can + lv[3].can;
      var total = lv[1].total + lv[2].total + lv[3].total;
      var open = !!state.jumpAhead || (prevOpen && prevReady);
      function ready(L) {
        return L.total === 0 || L.can >= Math.min(S.P.openAfterCan, L.total) ||
               L.met >= Math.min(S.P.openAfterMet, L.total);
      }
      var level = !open ? 0 : state.jumpAhead ? 3
        : ready(lv[1]) ? (ready(lv[2]) ? 3 : 2) : 1;
      var learned = (bank.byIdea[idea.id] || []).filter(function (it) {
        return state.learnedIds[it.id]; }).length;
      out[idea.id] = { id: idea.id, n: idea.n, title: idea.title, open: open,
                       level: level, met: met, can: can, total: total,
                       learned: learned, levels: lv };
      prevOpen = open;
      /* the next idea opens once this one has a foothold */
      prevReady = open && (can >= S.P.openAfterCan || met >= S.P.openAfterMet ||
                           met >= total);
    });
    return out;
  };

  S.available = function (state, it, status) {
    var s = status && status[it.idea];
    if (!s) return !!state.jumpAhead;
    return s.open && (it.level || 1) <= s.level;
  };

  /* ------------------------------------------------------------ plan */

  /* How many questions the bank holds of each kind, worked out once. */
  var formSizeCache = null;
  function formSize(bank) {
    if (formSizeCache) return formSizeCache;
    var c = {};
    bank.items.forEach(function (it) { c[it.form] = (c[it.form] || 0) + 1; });
    formSizeCache = c;
    return c;
  }

  /* Build one session, as item ids in play order. */
  S.plan = function (state, bank, now, opts) {
    opts = opts || {};
    upgrade(state);
    var P = S.P;
    var size = opts.size || P.sessionSize;
    var status = S.ideas(state, bank);
    var cool = now - Math.max(P.coolHours * 3600000, P.minGapDays * DAY);
    function cooling(id) { return (state.seen[id] || 0) > cool; }

    /* record ideas as they open, so the reader is told once, with a lesson */
    Object.keys(status).forEach(function (k) {
      if (status[k].open && !state.opened[k]) state.opened[k] = now;
    });

    var ids = Object.keys(state.items);
    /* every review that has fallen due, including the ones the minimum gap is
       holding back: the pace rule read a blocked review as "no backlog" and
       poured eight new questions in on top of it */
    var waiting = ids.filter(function (id) {
      return bank.byId[id] && S.isDue(state.items[id], now);
    }).length;
    var due = ids.filter(function (id) {
      return bank.byId[id] && !cooling(id) && S.isDue(state.items[id], now);
    }).sort(function (a, b) {
      return overdue(state.items[b], now) - overdue(state.items[a], now);
    });

    /* after a long break, open on two well-held questions */
    var sinceLast = state.lastSession ? (now - state.lastSession) / DAY : 0;
    var warm = [];
    if (sinceLast >= P.gapDays) {
      warm = ids.filter(function (id) {
        return bank.byId[id] && state.learnedIds[id] && !cooling(id);
      }).sort(function (a, b) {
        return state.items[b].ivl - state.items[a].ivl;
      }).slice(0, 2);
      due = due.filter(function (id) { return warm.indexOf(id) < 0; });
      due.sort(function (a, b) { return state.items[b].ease - state.items[a].ease; });
    }

    var unseen = bank.items.filter(function (it) {
      return !state.items[it.id] && S.available(state, it, status);
    });
    /* When what is open runs short, the NEXT step fills the gap - the next
       level of an open idea, or the basics of the next idea - rather than
       more of the same kind. */
    /* The next TWO ideas, not one. Audit 3 found two whole shapes - put three
       things in order, and true-or-false - unreachable in a fortnight because
       they live in ideas 8 and 9. A taster of what is coming keeps every kind
       of question in circulation without opening the ladder out of order. */
    var shut = Object.keys(status).filter(function (k) { return !status[k].open; })
      .sort(function (a, b) { return status[a].n - status[b].n; }).slice(0, 2);
    var ahead = bank.items.filter(function (it) {
      if (state.items[it.id] || S.available(state, it, status)) return false;
      var s = status[it.idea];
      return s && ((s.open && it.level === s.level + 1) ||
                   (shut.indexOf(it.idea) >= 0 && it.level === 1));
    });

    /* One question of a kind the reader has NEVER been set, held back for a
       single slot a sitting. Two shapes - put three things in order, and
       true-or-false - sit at level 2 of the eighth big idea, so a reader met
       neither in a fortnight of two sittings a day even after the round-robin
       fix. A taster is one item, of one unmet kind, ahead of the ladder; the
       ladder itself is untouched. */
    var metForms = {};
    ids.forEach(function (id) {
      var b = bank.byId[id]; if (b) metForms[b.form] = 1;
    });
    unseen.concat(ahead).forEach(function (it) { metForms[it.form] = 1; });
    var taste = [], tasteForm = {};
    bank.items.forEach(function (it) {
      if (state.items[it.id] || metForms[it.form] || tasteForm[it.form]) return;
      tasteForm[it.form] = 1;
      taste.push(it);
    });

    /* pace follows the reviews: never none while any remain */
    var early = state.sessions < 3;
    var nNew = !(unseen.length + ahead.length + taste.length) ? 0
      : waiting <= 3 ? (early ? 8 : 6)
      : waiting <= 8 ? 4
      : waiting <= 14 ? 2 : 1;

    /* the spread rules, shared by reviews and new questions */
    var usedPlace = {}, usedForm = {}, usedStem = {};
    function fits(it, review) {
      if (it.place && (usedPlace[it.place] || 0) >= P.perPlace) return false;
      if ((usedForm[it.form] || 0) >= (review ? 2 * P.perForm : P.perForm)) return false;
      /* the same words twice in one session read as the same question,
         whatever the options: played, six "Which employs more people in
         Ontario?" in a row was the repetition Robert asked to be rid of */
      /* a due review may share its wording with one other question - holding
         reviews back for wording alone let memory lapse in simulation */
      if ((usedStem[it.stem] || 0) >= (review ? 2 : 1)) return false;
      return true;
    }
    function take(it) {
      if (it.place) usedPlace[it.place] = (usedPlace[it.place] || 0) + 1;
      usedForm[it.form] = (usedForm[it.form] || 0) + 1;
      usedStem[it.stem] = (usedStem[it.stem] || 0) + 1;
    }

    var chosen = [];
    warm.forEach(function (id) { take(bank.byId[id]); chosen.push(id); });

    var roomRev = Math.max(0, size - warm.length - nNew);
    var reviews = [];
    for (var i = 0; i < due.length && reviews.length < roomRev; i++) {
      var r = bank.byId[due[i]];
      if (!fits(r, true)) continue;    /* waits for another session */
      take(r); reviews.push(r.id);
    }
    /* room the reviews did not use goes to new questions - at most eight,
       so a session is never a wall of the unfamiliar */
    nNew = Math.min(unseen.length + ahead.length + taste.length, 8,
                    Math.max(nNew, size - warm.length - reviews.length));
    state._plannedNew = nNew;

    var fresh = S.pickNew(state, unseen, nNew, { home: opts.home, status: status,
      fits: fits, take: take, now: now, ahead: ahead, taste: taste, bank: bank,
      formSize: formSize(bank),
      placeUsed: function (pl) { return (usedPlace[pl] || 0) >= P.perPlace; } });
    return S.spread(warm.concat(fresh, reviews), bank, state);
  };

  /* Choose new questions. Idea first - whichever open idea has had least of
     the reader's attention, with a just-opened idea going first so its lesson
     is tested straight away - then the lowest open level within it, then
     surprise, home region and ease. */
  S.pickNew = function (state, unseen, n, opts) {
    if (!n) return [];
    opts = opts || {};
    var home = opts.home || {};
    var status = opts.status || {};
    var fits = opts.fits || function () { return true; };
    var take = opts.take || function () {};
    var pool = {};
    unseen.forEach(function (it) { (pool[it.idea] = pool[it.idea] || []).push(it); });
    /* How many of each KIND of question the reader has already met. Audit 3
       found the order broken twice over: a level penalty of -3 per level
       meant level 3 could never outrank level 2, and ties inside a level
       broke on the item id, so all 155 commute-out items came before the
       first commute-in one. Whole shapes were unreachable - the fingerprint
       first appeared at sitting 77, and "which has more jobs" never. */
    var metForm = {};
    Object.keys(state.items).forEach(function (id) {
      var b = opts.bank && opts.bank.byId[id];
      if (b) metForm[b.form] = (metForm[b.form] || 0) + 1;
    });
    function score(it) {
      return -(it.level || 1) * 1.2 + (it.surprise || 0) * 1.2 +
             ((it.place && home[it.place]) ? 2 : 0) - it.prior * 0.8;
    }
    /* Within an idea, take the kind of question the reader has met least:
       round-robin by shape, so no two sittings set the same task and every
       shape is reached. */
    function leastMetForm(list) {
      var seen = {}, bestForm = null, bestN = Infinity;
      list.forEach(function (it) {
        if (seen[it.form]) return;
        seen[it.form] = 1;
        var n = (metForm[it.form] || 0) + (usedForm[it.form] || 0) * 10;
        if (n < bestN) { bestN = n; bestForm = it.form; }
      });
      return bestForm;
    }
    var usedForm = {};
    Object.keys(pool).forEach(function (k) {
      pool[k].sort(function (x, y) { return score(y) - score(x) || (x.id < y.id ? -1 : 1); });
    });
    var metBy = {};
    Object.keys(status).forEach(function (k) { metBy[k] = status[k].met; });
    var out = [];
    /* the one taster, first, and only when there is room for the sitting's
       own work as well */
    /* Biggest kind first. Two orderings were tried and measured before this
       one: by idea number (which spent the early slots on the ninth idea's
       method questions and left "which came first" until sitting 30) and by
       level (which spent them on the hardest forms and was worse). Ordering
       by how much of the bank a form accounts for puts the fingerprint - 190
       questions, the shape this whole tool is built around - in the reader's
       second sitting, and still reaches every other unmet kind inside a
       week, because the pool shrinks by one each time. */
    var formSize = opts.formSize || {};
    var taste = (opts.taste || []).slice().sort(function (x, y) {
      return (formSize[y.form] || 0) - (formSize[x.form] || 0) ||
             (x.level || 1) - (y.level || 1) ||
             score(y) - score(x) || (x.id < y.id ? -1 : 1);
    });
    /* never at the very first sitting: a reader's first question should be
       the first big idea's, with its lesson, not a taste of the ninth */
    /* one new question is enough room: the taster rides on top of it, it
       does not take its place. Requiring two held the taster back to the
       first week, because the pace rule drops the sitting to a single new
       question as soon as the reviews build up - and "which came first" was
       not met until sitting 25. */
    var tasteNow = taste.length && n >= 1 && (state.sessions || 0) >= 1 &&
      ((state.sessions || 0) % (S.P.tasteEvery || 1) === 0);
    var tasted = 0;
    for (var t = 0; tasteNow && t < taste.length && !out.length; t++) {
      if (!fits(taste[t])) continue;
      take(taste[t]); out.push(taste[t].id); tasted = 1;
      usedForm[taste[t].form] = (usedForm[taste[t].form] || 0) + 1;
      metForm[taste[t].form] = (metForm[taste[t].form] || 0) + 1;
    }
    /* the taster rides ON TOP of the sitting's own new questions rather than
       taking one of their places: spending a slot on it pushed the
       fingerprint - the hardest and most valuable shape - from sitting 5 out
       to 33 for some readers. The sitting is one question longer, and only
       until every kind has been met once. */
    n += tasted;
    var guard = 0;
    while (out.length < n && guard++ < 400) {
      var best = null, bestScore = Infinity;
      Object.keys(pool).forEach(function (k) {
        if (!pool[k].length) return;
        /* a newly opened idea (under three met) is served first */
        var sc = (metBy[k] || 0) < 3 ? -1000 + (status[k] ? status[k].n : 0) : (metBy[k] || 0);
        if (sc < bestScore) { bestScore = sc; best = k; }
      });
      if (!best) break;
      var list = pool[best], pickI = -1;
      var want = leastMetForm(list);
      for (var i = 0; i < list.length; i++) {
        if (list[i].form === want && fits(list[i])) { pickI = i; break; }
      }
      if (pickI < 0) {
        for (var j = 0; j < list.length; j++) if (fits(list[j])) { pickI = j; break; }
      }
      if (pickI < 0) { delete pool[best]; continue; }
      var it = list.splice(pickI, 1)[0];
      take(it); out.push(it.id);
      usedForm[it.form] = (usedForm[it.form] || 0) + 1;
      metForm[it.form] = (metForm[it.form] || 0) + 1;
      metBy[best] = (metBy[best] || 0) + 1;
    }
    /* a shape the reader has never met comes first out of the taster pool */
    [opts.ahead || []].forEach(function (list) {
      list.slice().sort(function (x, y) {
        var nx = (metForm[x.form] || 0) === 0 ? 1 : 0, ny = (metForm[y.form] || 0) === 0 ? 1 : 0;
        return (ny - nx) || score(y) - score(x) || (x.id < y.id ? -1 : 1);
      })
        .forEach(function (it) {
          if (out.length >= n || out.indexOf(it.id) >= 0 || !fits(it)) return;
          take(it); out.push(it.id);
        });
    });
    return out;
  };

  /* Order a session so neither the same kind of question nor the same idea
     comes twice running where that can be avoided; the first stays first. */
  S.spread = function (ids, bank, state) {
    if (ids.length < 3) return ids;
    /* Teach, then test: a big idea met for the first time keeps its
       questions together straight after its lesson, basics first. Those
       groups lead the session; everything else is spread. */
    var lessons = (state && state.lessons) || {};
    var fresh = {}, order = [];
    ids.forEach(function (id) {
      var it = bank.byId[id];
      if (it.idea && !lessons[it.idea]) {
        if (!fresh[it.idea]) { fresh[it.idea] = []; order.push(it.idea); }
        fresh[it.idea].push(id);
      }
    });
    var grouped = [];
    order.forEach(function (k) {
      fresh[k].sort(function (a, b) {
        return (bank.byId[a].level || 1) - (bank.byId[b].level || 1);
      });
      /* basics first, but no kind of question twice running */
      var g = fresh[k].slice(), o = [g.shift()];
      while (g.length) {
        var f = bank.byId[o[o.length - 1]].form, j = 0;
        while (j < g.length && bank.byId[g[j]].form === f) j++;
        o.push(g.splice(j < g.length ? j : 0, 1)[0]);
      }
      grouped = grouped.concat(o);
    });
    ids = grouped.concat(ids.filter(function (id) { return grouped.indexOf(id) < 0; }));
    var keep = grouped.length || 1;
    var rest = ids.slice(keep), out = ids.slice(0, keep);
    if (!rest.length) return out;
    function clash(a, b, byIdea) {
      var x = bank.byId[a], y = bank.byId[b];
      return x.form === y.form || (byIdea && x.idea === y.idea);
    }
    while (rest.length) {
      var last = out[out.length - 1], j = -1, k;
      for (k = 0; k < rest.length; k++) if (!clash(last, rest[k], true)) { j = k; break; }
      if (j < 0) for (k = 0; k < rest.length; k++) if (!clash(last, rest[k], false)) { j = k; break; }
      if (j < 0) j = 0;
      out.push(rest.splice(j, 1)[0]);
    }
    return out;
  };

  /* ------------------------------------------------------------ growth */

  S.canAnswer = function (state) {
    var n = 0;
    Object.keys(state.items).forEach(function (id) { if (state.items[id].right) n++; });
    return n;
  };

  S.progress = function (state, bank) {
    upgrade(state);
    var turned = 0;
    Object.keys(state.items).forEach(function (id) { if (state.items[id].turned) turned++; });
    var keys = Object.keys(state.days).sort();
    var today = dayKey(Date.now());
    var weekAgo = null;
    var cutoff = dayKey(Date.now() - 7 * DAY);
    keys.forEach(function (k) { if (k <= cutoff) weekAgo = state.days[k]; });
    return {
      can: S.canAnswer(state),
      learned: Object.keys(state.learnedIds).length,
      seen: Object.keys(state.items).length,
      turned: turned,
      weekAgoCan: weekAgo ? weekAgo.can : null,
      history: keys.slice(-14).map(function (k) {
        return { day: k, can: state.days[k].can, today: k === today };
      }),
      ideas: bank ? S.ideas(state, bank) : null
    };
  };

  S.snapshot = function (state, now) {
    upgrade(state);
    state.days[dayKey(now)] = { can: S.canAnswer(state),
                                learned: Object.keys(state.learnedIds).length,
                                met: Object.keys(state.items).length };
  };

  S.endSession = function (state, now) {
    upgrade(state);
    state.sessions++;
    state.lastSession = now;
    state.sessionsWithoutNew = state._plannedNew ? 0 : (state.sessionsWithoutNew || 0) + 1;
    delete state._plannedNew;
    S.snapshot(state, now);
  };

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
        if (st && st.version === 1) return upgrade(st);
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
