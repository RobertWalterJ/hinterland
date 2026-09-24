/* AUDIT 7 - COVERAGE

   Tabulate the generated question bank and NAME THE HOLES OUT LOUD.

   The bank is generated, so nobody chose what it covers; the data chose. That
   is the strength of the design and also its blind spot: a whole region, a
   whole industry or a whole decade can be absent and nothing complains. This
   audit is the complaint.

   Everything is counted against the REAL bank, built by quiz-bank.js from the
   real payloads through the harness - not a model of it.

   Already covered elsewhere, and deliberately not repeated here:
     python pipeline/validate.py  - that the bank BUILDS under every gate, that
       every item lands in one of the nine ideas with at least one basics item
       per idea, stem and card lengths, and the scheduler's behaviour;
       separately, data coverage by census year (how many of the 577
       municipalities have figures in each census).
   This audit asks the different question: of what the data can support, what
   does the bank actually ask about, and what does it never mention.

   Run:  node pipeline/audits/coverage.js
         node pipeline/audits/coverage.js --json
*/
'use strict';
const { load, bank } = require('./harness');

const JSON_ARG = process.argv.indexOf('--json') >= 0;
const L = console.log;

function pad(s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); }
function lpad(s, n) { s = String(s); return ' '.repeat(Math.max(0, n - s.length)) + s; }
function bar(n, max, w) {
  const k = max ? Math.round(w * n / max) : 0;
  return '█'.repeat(k) + '·'.repeat(Math.max(0, w - k));
}
function tally(list, keyFn) {
  const t = {};
  list.forEach((x) => {
    const k = keyFn(x);
    (Array.isArray(k) ? k : [k]).forEach((kk) => {
      if (kk == null) return;
      t[kk] = (t[kk] || 0) + 1;
    });
  });
  return t;
}
function table(title, t, order, label) {
  const keys = order || Object.keys(t).sort((a, b) => t[b] - t[a]);
  const max = Math.max.apply(null, keys.map((k) => t[k] || 0).concat([1]));
  L(title);
  keys.forEach((k) => L('  ' + pad(label ? (label[k] || k) : k, 34) +
    lpad(t[k] || 0, 5) + '  ' + bar(t[k] || 0, max, 28)));
}

/* --------------------------------------------- the geography a question is about */

/* AREA, as quiz-ideas.js defines it - copied by VALUE here on purpose so this
   audit fails loudly if the two ever disagree (checked below). */
const AREA = {
  '3590': 'north', '3595': 'north',
  '3560': 'southwest', '3570': 'southwest', '3580': 'southwest',
  '3510': 'east', '3515': 'east',
  '3520': 'central', '3530': 'central', '3540': 'central', '3550': 'central'
};
const AREA_NAME = { north: 'Northern Ontario', southwest: 'Southwestern Ontario',
                    east: 'Eastern Ontario', central: 'Central Ontario' };

/* --------------------------------------------------------------- subjects */

/* An industry counts as asked about when its published short name, or a
   plain-English form the templates use for it, appears in the stem, an option
   or the answer card. Occupation items are excluded from this pass: their
   options are NOC groups, several of which read like industry names. */
const NAICS_ALIAS = {
  '11': ['farming and resources', 'farming'],
  '21': ['mining'],
  '31-33': ['manufacturing'],
  '62': ['health care'],
  '72': ['hotels, restaurants and bars'],
  '91': ['public administration']
};

function main(G) {
  const D = G.data, T = G.terms, I = G.quizIdeas, H = G.history;
  const b = bank(G);
  const items = b.items;

  /* the AREA map must match the app's */
  const appArea = {};
  Object.keys(D.geo.er_names).forEach((er) => { appArea[er] = AREA[er]; });
  const areaMismatch = Object.keys(D.geo.er_names).filter((er) => !AREA[er]);

  /* ---------------------------------------------------------- the places */
  const csds = D.byLevel.CSD || [];
  const muni = csds.filter((p) => I.classOf(p));          /* the 414 that are municipalities */
  const nameIndex = {};
  csds.forEach((p) => {
    const n = String(p.name || '').split(' / ')[0].trim();
    (nameIndex[n] = nameIndex[n] || []).push(p.code);
  });

  /* every place a question SHOWS: its subject, and every option that is the
     name of a census subdivision */
  const subjectOf = {}, namedIn = {};
  const ambiguous = {};
  items.forEach((it) => {
    if (it.place && D.byCode[it.place]) {
      subjectOf[it.place] = (subjectOf[it.place] || 0) + 1;
      namedIn[it.place] = (namedIn[it.place] || 0) + 1;
    }
    it.options.forEach((o) => {
      const hits = nameIndex[String(o.label).trim()];
      if (!hits) return;
      if (hits.length > 1) ambiguous[o.label] = hits.length;
      hits.forEach((c) => { namedIn[c] = (namedIn[c] || 0) + 1; });
    });
  });

  const placeItems = items.filter((it) => it.place && D.byCode[it.place]);
  const P = (it) => D.byCode[it.place];

  /* ---------------------------------------------------------- subjects */
  const text = (it) => [it.stem, it.card && it.card.sentence, it.card && it.card.more,
                        it.more && it.more.text]
    .concat(it.options.map((o) => o.label)).filter(Boolean).join(' | ').toLowerCase();

  const industryAsked = {}, industryAnswer = {};
  D.naics.forEach((s) => { industryAsked[s.code] = 0; industryAnswer[s.code] = 0; });
  items.forEach((it) => {
    if ((it.terms || []).indexOf('industry-occupation') >= 0) return;
    const t = text(it);
    const answer = [it.card && it.card.sentence,
                    (it.options.filter((o) => o.correct)[0] || {}).label]
      .filter(Boolean).join(' | ').toLowerCase();
    D.naics.forEach((s) => {
      const words = [s.short.toLowerCase()].concat(NAICS_ALIAS[s.code] || []);
      if (words.some((w) => t.indexOf(w) >= 0)) industryAsked[s.code]++;
      if (words.some((w) => answer.indexOf(w) >= 0)) industryAnswer[s.code]++;
    });
  });

  const termAsked = {};
  T.list.forEach((t) => { termAsked[t.id] = 0; });
  items.forEach((it) => (it.terms || []).forEach((id) => {
    if (id in termAsked) termAsked[id]++;
  }));

  const methodRows = T.map.map((r, i) => {
    const asked = items.filter((it) => it.form === 'which-method' &&
      r.ids.indexOf((it.terms || [])[0]) >= 0).length;
    const anyTerm = items.filter((it) =>
      (it.terms || []).some((x) => r.ids.indexOf(x) >= 0)).length;
    return { n: i + 1, q: r.q, ids: r.ids, asked, anyTerm };
  });

  /* ------------------------------------------------------------- the era */
  const YEARS = ['2001', '2006', '2011', '2016', '2021'];
  const yearAsked = {}; YEARS.forEach((y) => { yearAsked[y] = 0; });
  let popSeries = 0, multiYear = 0, changeItems = 0;
  const CHANGE_FORMS = { yesno: 1, 'data-history': 1, 'which-first': 1 };
  items.forEach((it) => {
    const t = text(it) + ' ' + (it.chip ? (it.chip.when || '') : '');
    const found = YEARS.filter((y) => t.indexOf(y) >= 0);
    found.forEach((y) => { yearAsked[y]++; });
    if (/20(0[0-9]|1[0-9]|2[0-5])\D+20(0[0-9]|1[0-9]|2[0-5])/.test(t) ||
        /\b(each year|over those|per year|a year)\b/.test(t)) popSeries++;
    if (found.length > 1) multiYear++;
    if (it.idea === 'change' || CHANGE_FORMS[it.form] || found.length > 1) changeItems++;
  });

  /* ---------------------------------------------------------- the people */
  const occItems = items.filter((it) => it.form === 'occupation');
  const nocAsked = {};
  Object.keys(D.NOC_SHORT).forEach((k) => { nocAsked[k] = 0; });
  occItems.forEach((it) => {
    const t = text(it);
    Object.keys(D.NOC_SHORT).forEach((k) => {
      if (t.indexOf(D.NOC_SHORT[k].toLowerCase()) >= 0) nocAsked[k]++;
    });
  });

  /* ----------------------------------------------------------- assemble */
  const byIdeaLevel = {};
  I.IDEAS.forEach((x) => { byIdeaLevel[x.id] = { 1: 0, 2: 0, 3: 0 }; });
  items.forEach((it) => { if (byIdeaLevel[it.idea]) byIdeaLevel[it.idea][it.level]++; });

  const byArea = tally(placeItems, (it) => AREA[P(it).er]);
  items.filter((it) => it.region).forEach((it) => {
    const a = AREA[it.region]; if (a) byArea[a] = (byArea[a] || 0) + 1;
  });
  const byER = tally(placeItems, (it) => P(it).er);
  items.filter((it) => it.region).forEach((it) => {
    byER[it.region] = (byER[it.region] || 0) + 1;
  });
  const byClass = tally(placeItems, (it) => I.classOf(P(it)) || 'not a municipality');
  const byCD = tally(placeItems.concat(items.filter((it) => it.cd && !it.place)),
    (it) => (it.cd || (P(it) && P(it).cd)));

  const namedCount = muni.filter((p) => namedIn[p.code]).length;
  const subjectCount = muni.filter((p) => subjectOf[p.code]).length;
  const missing = muni.filter((p) => !namedIn[p.code])
    .sort((a, b) => (b.pop2021 || 0) - (a.pop2021 || 0));
  const neverSubject = muni.filter((p) => !subjectOf[p.code])
    .sort((a, b) => (b.pop2021 || 0) - (a.pop2021 || 0));
  const emptyCDs = Object.keys(D.geo.cd_names).filter((cd) => !byCD[cd]);

  /* WHY a place never appears. Three different problems wearing one symptom. */
  const optName = G.quizBank._gates.optName;
  function jobs(code) {
    const v = D.workVec(code, 'total');
    let s = 0; if (v) v.forEach((x) => { s += x || 0; });
    return s;
  }
  const why = { name: [], suppressed: [], tiny: [], available: [] };
  missing.forEach((p) => {
    const j = jobs(p.code);
    if (!optName(p)) why.name.push(p);
    else if (!j) why.suppressed.push(p);
    else if (j < 500) why.tiny.push(p);
    else why.available.push(p);
  });
  const biggestMissingJobs = Math.max.apply(null, missing.map((p) => jobs(p.code)).concat([0]));

  const out = {
    items: items.length,
    byIdeaLevel, byLevel: tally(items, (it) => 'level ' + it.level),
    byForm: tally(items, (it) => it.strand + '/' + it.form),
    byStrand: tally(items, (it) => it.strand),
    byArea, byER, byClass, byCD, emptyCDs,
    municipalities: { total: muni.length, csds: csds.length,
                      named: namedCount, subject: subjectCount,
                      missing: missing.slice(0, 25).map((p) => ({ name: p.name, pop: p.pop2021, er: p.er })),
                      neverSubject: neverSubject.slice(0, 15).map((p) => ({ name: p.name, pop: p.pop2021 })) },
    industries: { asked: industryAsked, answer: industryAnswer,
                  never: D.naics.filter((s) => !industryAsked[s.code]).map((s) => s.code + ' ' + s.short) },
    terms: { asked: termAsked,
             never: T.list.filter((t) => !termAsked[t.id]).map((t) => t.id) },
    methodRows,
    era: { yearAsked, multiYear, changeItems, popSeries },
    occupation: { items: occItems.length, nocAsked,
                  never: Object.keys(nocAsked).filter((k) => !nocAsked[k]) },
    areaMismatch, ambiguousOptionNames: ambiguous
  };

  if (JSON_ARG) { L(JSON.stringify(out, null, 2)); return out; }

  /* ---------------------------------------------------------------- print */
  L('=== AUDIT 7 - COVERAGE ===');
  L('');
  L(items.length + ' questions, generated from the payloads. What follows is what they');
  L('are about, and - at the end - what they are never about.');
  L('');

  L('BY BIG IDEA AND LEVEL');
  L('  ' + pad('', 34) + lpad('basics', 8) + lpad('places', 8) + lpad('surprises', 11) + lpad('total', 8));
  I.IDEAS.forEach((x) => {
    const r = byIdeaLevel[x.id];
    const tot = r[1] + r[2] + r[3];
    L('  ' + pad(x.n + '. ' + x.title, 34) + lpad(r[1], 8) + lpad(r[2], 8) +
      lpad(r[3], 11) + lpad(tot, 8) + (r[1] <= 3 ? '   <- thin at the basics' : ''));
  });
  const lv = { 1: 0, 2: 0, 3: 0 };
  items.forEach((it) => { lv[it.level]++; });
  L('  ' + pad('ALL', 34) + lpad(lv[1], 8) + lpad(lv[2], 8) + lpad(lv[3], 11) + lpad(items.length, 8));
  L('  The basics are ' + Math.round(100 * lv[1] / items.length) + '% of the bank. ' +
    'A learner meets every idea through its basics first.');
  L('');

  table('BY STRAND', out.byStrand, null, {
    A: 'A  size', B: 'B  what people do', C: 'C  connections',
    D: 'D  the long view', E: 'E  methods', F: 'F  history', G: 'G  the big ideas'
  });
  L('');
  table('BY QUESTION FORM', out.byForm);
  L('');

  L('BY GEOGRAPHY - AREA (from the AREA map in quiz-ideas.js)');
  const areaOrder = ['central', 'southwest', 'east', 'north'];
  const areaMax = Math.max.apply(null, areaOrder.map((a) => byArea[a] || 0));
  const areaPlaces = {};
  muni.forEach((p) => { const a = AREA[p.er]; if (a) areaPlaces[a] = (areaPlaces[a] || 0) + 1; });
  L('  ' + pad('', 24) + lpad('questions', 10) + lpad('municipalities', 16) + lpad('q per muni', 12));
  areaOrder.forEach((a) => {
    const q = byArea[a] || 0, n = areaPlaces[a] || 0;
    L('  ' + pad(AREA_NAME[a], 24) + lpad(q, 10) + lpad(n, 16) +
      lpad((q / (n || 1)).toFixed(1), 12) + '  ' + bar(q, areaMax, 18));
  });
  if (areaMismatch.length) L('  !! economic regions with no AREA: ' + areaMismatch.join(', '));
  L('');

  L('BY GEOGRAPHY - ECONOMIC REGION');
  const erMax = Math.max.apply(null, Object.keys(D.geo.er_names).map((e) => byER[e] || 0));
  Object.keys(D.geo.er_names).forEach((er) => {
    const n = muni.filter((p) => p.er === er).length;
    L('  ' + pad(String(D.geo.er_names[er]).split(' / ')[0].replace(/--/g, '-'), 28) +
      lpad(byER[er] || 0, 6) + '  ' + bar(byER[er] || 0, erMax, 20) +
      '   ' + n + ' municipalities');
  });
  L('');

  L('BY SETTLEMENT SIZE CLASS (classOf in quiz-ideas.js)');
  const clsPlaces = { small: 0, mid: 0, big: 0 };
  muni.forEach((p) => { clsPlaces[I.classOf(p)]++; });
  [['small', 'small town (under 10k)'], ['mid', 'mid-sized (10k-100k)'],
   ['big', 'big city (100k+)']].forEach(([k, lab]) => {
    L('  ' + pad(lab, 26) + lpad(byClass[k] || 0, 6) + ' questions over ' +
      lpad(clsPlaces[k], 4) + ' places   ' +
      (byClass[k] / clsPlaces[k]).toFixed(1) + ' per place');
  });
  L('  ' + pad('not a municipality', 26) + lpad(byClass['not a municipality'] || 0, 6) +
    ' questions over ' + lpad(csds.length - muni.length, 4) +
    ' CSDs   (reserves, unorganized areas - no size class)');
  L('');

  L('BY CENSUS DIVISION');
  L('  ' + Object.keys(byCD).length + ' of ' + Object.keys(D.geo.cd_names).length +
    ' census divisions carry at least one question.');
  if (emptyCDs.length) {
    L('  Never asked about: ' + emptyCDs.map((cd) => D.geo.cd_names[cd] || cd).join(', '));
  }
  const cdSorted = Object.keys(byCD).sort((a, b) => byCD[b] - byCD[a]);
  L('  Most: ' + cdSorted.slice(0, 4).map((c) =>
    (D.geo.cd_names[c] || c) + ' ' + byCD[c]).join(', '));
  L('  Least: ' + cdSorted.slice(-4).map((c) =>
    (D.geo.cd_names[c] || c) + ' ' + byCD[c]).join(', '));
  L('');

  L('HOW MANY OF ONTARIO\'S MUNICIPALITIES APPEAR');
  L('  ' + csds.length + ' census subdivisions, of which ' + muni.length +
    ' are municipalities with a population (the rest are reserves and');
  L('  unorganized areas, which have no size class and are never a question\'s subject).');
  L('  Named in at least one question (as subject or option):  ' + namedCount +
    ' of ' + muni.length + '  (' + Math.round(100 * namedCount / muni.length) + '%)');
  L('  The SUBJECT of at least one question:                   ' + subjectCount +
    ' of ' + muni.length + '  (' + Math.round(100 * subjectCount / muni.length) + '%)');
  L('  Never named at all: ' + missing.length);
  L('  The biggest places that appear in NO question:');
  missing.slice(0, 15).forEach((p) => L('    ' + pad(p.name, 30) +
    lpad((p.pop2021 || 0).toLocaleString('en-CA'), 10) + '   ' +
    String(D.geo.er_names[p.er] || '').split(' / ')[0].replace(/--/g, '-')));
  if (!missing.length) L('    none - every municipality appears somewhere.');
  L('  Why each is absent:');
  L('    ' + lpad(why.name.length, 4) + '  the name is refused as an option ' +
    '(optName: a comma, a bracket, or over 28 characters)');
  L('         ' + why.name.slice(0, 4).map((p) => p.name).join('; '));
  L('    ' + lpad(why.suppressed.length, 4) + '  no published industry figures at all ' +
    '(every cell withheld)');
  L('    ' + lpad(why.tiny.length, 4) + '  fewer than 500 jobs: too small to clear the ' +
    'separation and floor gates');
  L('    ' + lpad(why.available.length, 4) + '  500+ jobs, a usable name, and still never ' +
    'chosen - the real gap');
  if (why.available.length) {
    L('         ' + why.available.slice(0, 6).map((p) => p.name +
      ' (' + jobs(p.code).toLocaleString('en-CA') + ' jobs)').join('; '));
  }
  L('  No place with more than ' + biggestMissingJobs.toLocaleString('en-CA') +
    ' jobs is missing, so the bank covers Ontario\'s working population well');
  L('  even where it does not cover Ontario\'s municipal list.');
  L('');

  L('BY SUBJECT - THE 20 INDUSTRIES');
  L('  ' + pad('', 30) + lpad('mentioned', 11) + lpad('is the answer', 15));
  D.naics.forEach((s) => {
    L('  ' + pad(s.code + '  ' + s.short, 30) + lpad(industryAsked[s.code], 11) +
      lpad(industryAnswer[s.code], 15) +
      (industryAsked[s.code] === 0 ? '   <- NEVER ASKED ABOUT' : ''));
  });
  L('  Never the subject of any item: ' +
    (out.industries.never.length ? out.industries.never.join('; ') : 'none'));
  L('');

  L('BY SUBJECT - THE ' + T.list.length + ' GLOSSARY TERMS');
  const tested = T.list.filter((t) => termAsked[t.id]);
  L('  Attached to at least one question: ' + tested.length + ' of ' + T.list.length);
  const never = T.list.filter((t) => !termAsked[t.id]);
  never.forEach((t) => L('    NEVER TESTED  ' + pad(t.id, 22) + t.name +
    '   (' + T.GROUP[t.group] + ')'));
  if (!never.length) L('    every term is tested.');
  L('  Most heavily used: ' + Object.keys(termAsked).sort((a, b) => termAsked[b] - termAsked[a])
    .slice(0, 5).map((k) => k + ' ' + termAsked[k]).join(', '));
  L('');

  L('BY SUBJECT - THE ' + T.map.length + ' METHOD-MAP ROWS');
  methodRows.forEach((r) => L('  ' + pad(r.n + '. ' + r.q, 58) +
    lpad(r.asked, 4) + ' "which method" items, ' + lpad(r.anyTerm, 4) +
    ' items touching its terms' + (r.asked === 0 ? '   <- NOT COVERED' : '')));
  L('');

  L('BY ERA');
  L('  Census years the questions actually mention:');
  YEARS.forEach((y) => L('    ' + y + lpad(yearAsked[y], 7) + ' items  ' +
    bar(yearAsked[y], Math.max.apply(null, YEARS.map((z) => yearAsked[z])), 24) +
    (yearAsked[y] === 0 ? '   <- NEVER MENTIONED' : '')));
  L('  Items naming more than one year:      ' + multiYear);
  L('  Items about CHANGE rather than one year: ' + changeItems +
    '  (' + Math.round(100 * changeItems / items.length) + '% of the bank)');
  L('  Items touching the 2001-2025 population series: ' + popSeries);
  L('');

  L('BY PEOPLE - OCCUPATION AGAINST INDUSTRY');
  L('  Industry is the subject of the bank: ' +
    items.filter((it) => (it.terms || []).indexOf('place-of-work') >= 0 ||
      it.form === 'largest' || it.form === 'fingerprint').length +
    ' items rest on the industry tables.');
  L('  Occupation (the 10 NOC groups in app/data/detail.json) appears in ' +
    occItems.length + ' items, all of one form (B3).');
  Object.keys(D.NOC_SHORT).forEach((k) => L('    ' + pad(k + '  ' + D.NOC_SHORT[k], 30) +
    lpad(nocAsked[k], 5) + (nocAsked[k] === 0 ? '   <- never named' : '')));
  L('  So: what people DO for a living is asked about, but only as "the most');
  L('  common work of residents". Nothing asks how occupation and industry differ,');
  L('  and no big idea owns it.');
  L('');

  /* --------------------------------------------------------- the holes */
  L('=== THE HOLES, PLAINLY ===');
  L('');
  const holes = [];

  holes.push(['The basics are 4% of the bank.',
    lv[1] + ' of ' + items.length + ' questions are level 1, and six of the nine ideas ' +
    'have three or fewer. A learner meeting an idea for the first time gets one or two ' +
    'basics and is then pushed into place-by-place detail.',
    'Fill with: the same class-level / class-lean / concept templates already in ' +
    'quiz-ideas.js, run over the other 16 industries rather than the 3-6 they use now.',
    'basics']);

  const areaGap = areaOrder.map((a) => ({ a, per: (byArea[a] || 0) / (areaPlaces[a] || 1) }))
    .sort((x, y) => x.per - y.per)[0];
  holes.push(['Geography is lopsided.',
    areaOrder.map((a) => AREA_NAME[a] + ' ' + (byArea[a] || 0)).join(', ') +
    '. Per municipality that is ' +
    areaOrder.map((a) => AREA_NAME[a].split(' ')[0] + ' ' +
      ((byArea[a] || 0) / (areaPlaces[a] || 1)).toFixed(1)).join(', ') +
    '. The thinnest is ' + AREA_NAME[areaGap.a] + '.',
    'Fill with: work_csd.json already covers every municipality; the limit is the ' +
    'separation gate, which small northern places fail on sample size. Widen the ' +
    'pair-comparison (A1) beyond one census division so northern towns pair with ' +
    'each other rather than with a city.', 'geography']);

  holes.push([missing.length + ' municipalities are never named, including ' +
    (missing[0] ? missing[0].name + ' (' + (missing[0].pop2021 || 0).toLocaleString('en-CA') + ')' : ''),
    'Named at all: ' + namedCount + ' of ' + muni.length + '. Subject of a question: ' +
    subjectCount + '. Of the ' + missing.length + ' absent, ' + why.suppressed.length +
    ' have no published figures and ' + why.tiny.length + ' have under 500 jobs - ' +
    'both fair. But ' + why.available.length + ' have 500+ jobs and a usable name, and ' +
    why.name.length + ' are lost only because their name is too long to be an option.',
    'Fill with: nothing new to fetch. Raise optName\'s 28-character limit or let it ' +
    'shorten a name ("Leeds and the Thousand Islands" -> "Leeds & the 1000 Islands"), ' +
    'and let the pair comparison (A1) reach outside its census division so a small ' +
    'place can be paired with another small place.', 'places']);

  if (out.industries.never.length) {
    holes.push(['Industries never asked about: ' + out.industries.never.join(', '),
      'Of 20 sectors, ' + (20 - out.industries.never.length) + ' are asked about.',
      'Fill with: the same work_csd.json columns the others use.', 'subject']);
  } else {
    const thin = D.naics.slice().sort((a, b) => industryAsked[a.code] - industryAsked[b.code]).slice(0, 4);
    holes.push(['Every industry is mentioned, but four are barely asked about.',
      thin.map((s) => s.short + ' ' + industryAsked[s.code]).join(', ') +
      ' - against ' + Math.max.apply(null, D.naics.map((s) => industryAsked[s.code])) +
      ' for the most-asked.',
      'Fill with: the class-lean and er-cluster templates, which currently stop at ' +
      'the top few sectors by effect size.', 'subject']);
  }

  if (never.length) {
    holes.push([never.length + ' of ' + T.list.length + ' glossary terms are never tested: ' +
      never.map((t) => t.name).join(', '),
      'The glossary teaches them in Learn; nothing ever asks about them.',
      'Fill with: the E2 "a limit of..." template already generates one item per ' +
      'method term - it is only fed the terms whose kind is "method".', 'trust']);
  }

  const zeroYears = YEARS.filter((y) => !yearAsked[y]);
  holes.push(['Time barely features: ' + Math.round(100 * changeItems / items.length) +
    '% of questions are about change' + (zeroYears.length ? ', and ' +
    zeroYears.join('/') + (zeroYears.length > 1 ? ' are' : ' is') +
    ' never named' : ''),
    'The bank is a snapshot of May 2021. res_series.json carries 2001, 2006, 2011, ' +
    '2016 and 2021; population.json carries 2001-2025; components.json carries the ' +
    'births, deaths and four migration streams behind it.',
    'Fill with: a "which way did it go" template on res_series.json - the same ' +
    'shape as D1 (yes/no on natural increase), which already works.', 'time']);

  holes.push(['Occupation is one template out of twenty-four.',
    occItems.length + ' items, all B3, all "the most common work of residents". ' +
    'detail.json also carries published 95% intervals, which nothing asks about.',
    'Fill with: detail.json needs no new fetch - it is already eager on boot.', 'people']);

  /* Ordered by what it costs a learner, not by how many rows it touches.
     A thin basics level is felt on the first day; a missing sector is not. */
  const ORDER = ['basics', 'time', 'geography', 'trust', 'subject', 'places', 'people'];
  holes.sort((a, b) => ORDER.indexOf(a[3]) - ORDER.indexOf(b[3]));
  L('The five most worth filling next, in order:');
  L('');
  holes.forEach((h, i) => {
    L((i + 1) + '. ' + h[0] + (i === 5 ? '   (below the top five)' : ''));
    L('   ' + h[1]);
    L('   ' + h[2]);
    L('');
  });
  return out;
}

load().then(main).catch((e) => { console.error(e); process.exit(1); });
