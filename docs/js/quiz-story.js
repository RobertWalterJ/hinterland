/* ==========================================================================
   The story behind the number.

   Robert, on his own app: "there are opportunities to tell compelling stories
   - for instance that Brockville has a major hospital and serves a large
   surrounding catchment, and is also a popular retirement city offering the
   services of a city on the St Lawrence."

   Every one of those clauses except the river is IN the payloads, and none of
   them was on screen. Brockville has 10,705 jobs against 7,365 working
   residents, health and social work is a quarter of them, and across Leeds
   and Grenville deaths have outnumbered births every year for a decade while
   the population keeps rising - a thousand people a year arriving from
   elsewhere in Ontario. That is the hospital, the catchment and the
   retirement town, and the app can say all three from what it already holds.

   THE RULE THIS MODULE LIVES BY
   Nothing here is written about a place. Each sentence is a template with a
   gate in front of it, and the gate is the same separation test the question
   bank uses: a comparison is only stated when the counts are clearly apart at
   z = 3, a share only when the base carries it. A sentence that would need a
   fact the data does not hold - the river, the lifestyle, the hospital's name
   - is not written. The strongest line a place can earn is that the shape of
   its numbers is the shape a hospital town has; that is offered as a reading,
   in those words, not as a fact about a building.

   The story is generated when the answer is drawn, never baked into an item,
   so pipeline/audits/accuracy.js re-derives every sentence for every place
   and checks the figures against the payloads (section: the stories).
   ========================================================================== */

(function (root) {
  'use strict';

  var Q = {};
  var D, M;

  function init() {
    if (!D) { D = root.GRA.data; M = root.GRA.methods; }
  }

  function sum(v) {
    var t = 0;
    if (v) v.forEach(function (x) { t += x || 0; });
    return t;
  }
  function clear(a, b) { return M.clearlyLarger(a, b, 3); }
  /* The question bank's own rounding, borrowed rather than re-invented: a
     second ladder of its own rounded 15,670 to "15,500", which is a bigger
     step than the census's own uncertainty and the accuracy audit caught it
     as an unsupported figure. One rule for the whole app. */
  function about(n) {
    var B = root.GRA.quizBank;
    return B && B._h && B._h.about ? B._h.about(n) : String(Math.round(n));
  }
  function fmt(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function pct(x) { return Math.round(100 * x) + '%'; }

  /* What a shape of numbers usually means. These are readings of a pattern,
     offered as such - "that is the shape of ..." - and every one of them
     needs BOTH a concentration and an inflow of workers before it is said. */
  var READING = {
    '62': 'a hospital town: the care is here, and most of the people it serves are not',
    '61': 'a school and college town',
    '91': 'a seat of government, where the administration of a wider area sits',
    '72': 'a visitor town, working for people who do not live there',
    '31-33': 'a factory town, making things for somewhere else',
    '11': 'a farming district that processes what it grows',
    '21': 'a resource town'
  };

  /* --------------------------------------------------------------- work */

  function workLine(p) {
    var j = p.jobs, w = p.residentWorkersFixed;
    if (!j || !w) return null;
    if (clear(j, w)) {
      return { kind: 'pull',
        text: p.name + ' has ' + about(j) + ' jobs and ' + about(w) +
          ' working residents. More work is done here than is done BY the ' +
          'people here, so the difference travels in.' };
    }
    if (clear(w, j)) {
      return { kind: 'push',
        text: p.name + ' has ' + about(w) + ' working residents and ' +
          about(j) + ' jobs. Most of the working day happens somewhere else.' };
    }
    return null;
  }

  /* ---------------------------------------------------- what it lives on */

  function sectorLine(p) {
    var vt = D.workVec(p.code, 'total'), vu = D.workVec(p.code, 'usual');
    if (!vt || !vu) return null;
    var on = D.workVec('35', 'total'), onT = sum(on), tt = sum(vt), tu = sum(vu);
    if (!tt || tt < 500) return null;
    var best = null;
    vt.forEach(function (x, i) {
      if (!x || x < 200 || !on[i]) return;
      var e = tt * (on[i] / onT), eu = tu * (on[i] / onT);
      /* clearly above what the province's own share would predict, on both
         measures - the same gate the question bank uses */
      if (!clear(x, e) || !clear(vu[i] || 0, eu)) return;
      var lift = (x / tt) / (on[i] / onT);
      if (lift < 1.5) return;
      if (!best || lift > best.lift) best = { i: i, x: x, lift: lift };
    });
    if (!best) return null;
    var n = D.naics[best.i];
    return { kind: 'sector', i: best.i, code: n.code,
      text: n.short + ' is ' + pct(best.x / tt) + ' of the work here, against ' +
        pct(on[best.i] / onT) + ' across Ontario.' };
  }

  function readingLine(p, work, sector) {
    if (!work || work.kind !== 'pull' || !sector) return null;
    var r = READING[sector.code];
    return r ? { kind: 'reading', text: 'That is the shape of ' + r + '.' } : null;
  }

  /* ------------------------------------------------------------- people */

  /* Births, deaths and migration are published for CENSUS DIVISIONS, never
     for a municipality, so the sentence names the division out loud rather
     than quietly attributing its figures to the town inside it. */
  function peopleLine(p) {
    if (!p.cd || !D.geo || !D.geo.cd_names) return null;
    var comp = D.componentsFor({ level: 'CD', code: p.cd });
    if (!comp || !comp.series || !comp.series['2021b']) return null;
    var rows = D.componentSummary(comp.series['2021b'], '2021b');
    if (!rows || rows.length < 5) return null;
    /* How far back the run actually goes, rather than however many years
       this happens to have kept: "every year since 2001" is both truer and
       worth more than "every year since 2020". */
    var i = rows.length - 1;
    while (i >= 0 && rows[i].natural < -50) i--;
    var run = rows.slice(i + 1);
    if (run.length < 5) return null;
    var last = run.slice(-5);
    var moved = last.reduce(function (s, r) {
      return s + (r.intraprovincial || 0) + (r.interprovincial || 0) +
             (r.international || 0);
    }, 0) / last.length;
    if (moved < 100) return null;
    var grew = p.pop2025 && p.pop2021est && p.pop2025 > p.pop2021est;
    var name = D.geo.cd_names[p.cd];
    return { kind: 'people',
      text: 'Across ' + name + ', deaths have outnumbered births every year ' +
        'since ' + run[0].year + ', and ' + about(moved) + ' more people ' +
        'a year arrive than leave' +
        (grew ? '. ' + p.name + ' has grown anyway: everything it adds, it ' +
          'adds by people moving in.' : '.') };
  }

  /* ---------------------------------------------------------------- api */

  /* Up to three sentences for a municipality, strongest first, or none. */
  Q.forPlace = function (code) {
    init();
    var p = D.byCode[code];
    if (!p || p.level !== 'CSD') return [];
    var work = workLine(p);
    var sector = sectorLine(p);
    var out = [];
    if (work) out.push(work);
    if (sector) out.push(sector);
    var reading = readingLine(p, work, sector);
    if (reading) out.push(reading);
    var people = peopleLine(p);
    if (people) out.push(people);
    return out;
  };

  /* The one sentence worth putting on the card itself: the reading if the
     place has earned one, otherwise what it lives on, otherwise the work.

     `said` is what the card has ALREADY told the reader. Without it the
     answer to "the largest group of jobs in Brockville?" read "Health &
     social is 23% of the jobs located in Brockville" and then, immediately
     underneath, "Health & social is 23% of the work here" - the same
     sentence twice, in a place where the room is measured in pixels. */
  Q.lead = function (code, said) {
    var all = Q.forPlace(code);
    if (!all.length) return null;
    var reading = all.filter(function (s) { return s.kind === 'reading'; })[0];
    var sector = all.filter(function (s) { return s.kind === 'sector'; })[0];
    if (sector && said && D.naics[sector.i] &&
        said.indexOf(D.naics[sector.i].short) >= 0) {
      sector = null;
    }
    if (reading && sector) return { text: sector.text + ' ' + reading.text };
    if (reading) return reading;
    if (sector) return sector;
    return all.filter(function (s) { return s.kind !== 'reading'; })[0] || null;
  };

  root.GRA = root.GRA || {};
  root.GRA.quizStory = Q;
}(this));
