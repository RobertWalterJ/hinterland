/* AUDIT 2b - THE PACK: questions that test the same thing.

   pipeline/quiz_selftest.js already checks each item ON ITS OWN - one right
   answer, options that cannot be confused, short enough to read aloud, no id
   collisions. What it cannot see is two items that are each perfectly good
   and, between them, test one fact twice. That is invisible item by item and
   obvious once the whole pack is laid out side by side.

   So this clusters the bank by WHAT AN ITEM RESTS ON, not by its text. Six
   detectors, each a different way for two questions to be the same question:

     1  SAME PLACE, SAME MEASURE
        Two items about one place that both rest on the same underlying
        number - Hamilton's industry mix, say. Answering one tells you the
        other. Sub-case called out separately: a place's commute-OUT and
        commute-IN questions that have the SAME answer, which is one fact
        about one pair of towns asked from both ends.

     2  SAME CORRECT ANSWER INSIDE ONE BIG IDEA
        Not a duplicate on its own - "which is the most common work here"
        answered "sales and service" in fifty towns is the pattern, and the
        pattern is the point. It becomes a duplicate when the run is long
        enough that the reader learns the ANSWER rather than the idea. So it
        is counted, ranked, and reported as pressure rather than as error.

     3  A CLASS-LEVEL ITEM DUPLICATING A PLACE ITEM
        "Small towns have far more of their jobs in agriculture" and "the
        largest group of jobs in Adelaide-Metcalfe is agriculture" are the
        same claim at two scales, inside one idea.

     4  STEMS THAT DIFFER ONLY BY A PLACE NAME, WITH THE SAME ANSWER
        The sharpest detector. Strip every place name from the stem; if two
        items then read identically AND have the same correct answer, they
        are one question wearing two hats.

     5  AN ANSWER STATED VERBATIM IN ANOTHER ITEM'S CARD SENTENCE
        The card is the teaching. If one item's card already says the words
        that are another item's right answer, the second item is graded on
        whether the reader remembers a sentence they were shown.

     6  IDENTICAL STEM AND IDENTICAL ANSWER
        Near-certain duplicates; kept separate because they need no judgement.

   Every cluster carries a KEEP: which item to keep, and why. The rule is
   written out above FORM_RANK below and applied the same way everywhere, so
   the answer does not depend on who reads the list. Each detector also
   carries a WHAT TO DO (see ADVICE), because for some of them cutting is the
   wrong answer and a cap or a rewrite is the right one.

   The run is deterministic: no random numbers, and every sort ends in an id
   comparison, so the same bank gives the same clusters and the same keeps.

   FALSE POSITIVES ARE EXPECTED and are named, per detector, in the noise
   section at the end of the report. A detector that reports nothing but
   true duplicates is a detector set too tight to find anything.

   Run:
     node pipeline/audits/duplicates.js
     node pipeline/audits/duplicates.js --json
     node pipeline/audits/duplicates.js --all      (every cluster, not a sample)
     node pipeline/audits/duplicates.js --rule 4   (one detector only)
*/
'use strict';
const { load, bank, report } = require('./harness');

const ARGV = process.argv.slice(2);
const JSON_OUT = ARGV.includes('--json');
const ALL = ARGV.includes('--all');
const ONLY = (() => { const i = ARGV.indexOf('--rule'); return i >= 0 ? +ARGV[i + 1] : 0; })();
const SHOW = ALL ? 1e9 : 6;          /* clusters printed per detector */

/* ------------------------------------------------------------- the measure

   What an item actually rests on. Two items with the same measure key are
   computed from the same underlying vector, so one constrains the other. */
const MEASURE = {
  bigger: 'jobs-count', howmany: 'jobs-count',
  fingerprint: 'industry-mix', largest: 'industry-mix',
  concentrated: 'industry-mix', 'type-which': 'industry-mix',
  'big-lean': 'industry-mix', 'er-cluster': 'industry-mix',
  occupation: 'occupation-mix',
  'commute-out': 'commute-matrix', 'commute-in': 'commute-matrix',
  twin: 'industry-mix-distance',
  yesno: 'births-and-deaths',
  'which-method': 'method', cannot: 'method', 'read-number': 'method',
  'which-first': 'dates', 'data-history': 'time-series',
  'on-top': 'province-industry', 'on-pair': 'province-industry',
  'class-level': 'class-industry', 'class-lean': 'class-industry',
  'class-fact': 'class-jobs-ratio', 'type-area': 'class-geography',
  concept: 'class-industry'
};

/* forms that make a claim about a CLASS of places or the province, with no
   one place in the stem */
const CLASS_FORMS = new Set(['class-level', 'class-lean', 'class-fact', 'type-area',
                             'on-top', 'on-pair', 'er-cluster', 'concept',
                             'data-history', 'big-lean']);

/* ----------------------------------------------------------- the keep rule

   Applied in order, first difference wins:
     1  keep the SURPRISING one - an item marked surprise teaches something
        the obvious answer gets wrong, and that is the whole point of level 3;
     2  keep the RICHER FORM - a profile or a number teaches more than a
        label (rank below); a question whose card carries a figure teaches
        more than one whose card restates the option;
     3  keep the one that opens EARLIER (lower level), so the reader meets
        the fact when the idea is introduced rather than later;
     4  keep the one whose card sentence says MORE (longer card = more
        teaching), capped so a rambling card cannot win on length alone;
     5  keep the lower id, so the answer is the same on every run. */
const FORM_RANK = {
  fingerprint: 9,      /* a whole profile, no name on it */
  twin: 8, concentrated: 7, 'er-cluster': 7,
  occupation: 6, largest: 6, 'big-lean': 6, 'type-which': 6,
  'commute-out': 5, 'commute-in': 5,
  howmany: 4, bigger: 4, yesno: 4,
  cannot: 4, 'read-number': 4, 'which-method': 3,
  'which-first': 3, 'data-history': 3,
  'on-top': 2, 'on-pair': 2, concept: 2,
  'class-level': 1, 'class-lean': 1, 'class-fact': 1, 'type-area': 1
};

function keepOf(items) {
  const scored = items.slice().sort((a, x) => {
    const d1 = (x.surprise || 0) - (a.surprise || 0); if (d1) return d1;
    const d2 = (FORM_RANK[x.form] || 0) - (FORM_RANK[a.form] || 0); if (d2) return d2;
    const d3 = (a.level || 9) - (x.level || 9); if (d3) return d3;
    const la = Math.min(22, words(a.card.sentence)), lx = Math.min(22, words(x.card.sentence));
    if (lx !== la) return lx - la;
    return a.id < x.id ? -1 : 1;
  });
  const k = scored[0];
  const why = [];
  if (k.surprise) why.push('it is the surprising one');
  if ((FORM_RANK[k.form] || 0) > Math.max(0, ...items.filter((i) => i !== k)
      .map((i) => FORM_RANK[i.form] || 0))) why.push('its form teaches most (' + k.form + ')');
  if (items.some((i) => i !== k && (i.level || 9) > (k.level || 9))) {
    why.push('it opens earliest (level ' + k.level + ')');
  }
  if (!why.length) why.push('its card says most; ties broken by id so the answer never moves');
  return { keep: k, why: why.join('; ') };
}

/* --------------------------------------------------------------- helpers */

function words(s) { return String(s || '').trim().split(/\s+/).filter(Boolean).length; }
function correctOf(it) { return it.options.find((o) => o.correct).label; }
function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/&/g, 'and')
    .replace(/[^a-z0-9' -]/g, ' ').replace(/\s+/g, ' ').trim();
}
function push(map, key, it) { (map[key] = map[key] || []).push(it); }
function groups(map, min) {
  return Object.keys(map).filter((k) => map[k].length >= (min || 2))
    .sort((a, b) => map[b].length - map[a].length || (a < b ? -1 : 1))
    .map((k) => ({ key: k, items: map[k] }));
}

/* ------------------------------------------------------------- detectors */

function detect(G, b) {
  const items = b.items;
  const out = {};

  /* all place names the payloads know, longest first, so "North Dundas" is
     stripped before "Dundas" */
  const names = [];
  Object.keys(G.data.byCode).forEach((c) => {
    const p = G.data.byCode[c];
    [p.name, p.label].forEach((n) => { if (n && n.length > 2) names.push(n); });
  });
  const uniqNames = [...new Set(names)].sort((a, x) => x.length - a.length);
  function stripPlaces(s) {
    let t = ' ' + norm(s) + ' ';
    for (const n of uniqNames) {
      const nn = ' ' + norm(n) + ' ';
      while (t.indexOf(nn) >= 0) t = t.split(nn).join(' <place> ');
    }
    return t.replace(/\s+/g, ' ').trim();
  }

  /* --- 1. same place, same measure ------------------------------------- */
  const m1 = {};
  items.forEach((it) => {
    if (!it.place) return;
    const meas = MEASURE[it.form] || it.form;
    push(m1, it.place + ' | ' + meas, it);
  });
  out.rule1 = groups(m1).map((g) => ({
    key: g.key, why: 'same place, same underlying measure (' + g.key.split(' | ')[1] + ')',
    items: g.items
  }));
  /* the tight sub-case: both directions of one commute pair, same answer */
  out.rule1b = out.rule1.filter((g) => g.key.endsWith('commute-matrix'))
    .filter((g) => new Set(g.items.map((i) => norm(correctOf(i)))).size === 1)
    .map((g) => ({ ...g, why: 'the commute out and the commute in name the same town: one fact, asked from both ends' }));

  /* --- 2. same correct answer inside one big idea ---------------------- */
  const m2 = {};
  items.forEach((it) => push(m2, it.idea + ' | ' + norm(correctOf(it)), it));
  out.rule2 = groups(m2, 3).map((g) => ({
    key: g.key, why: g.items.length + ' items in the idea "' + g.key.split(' | ')[0] +
      '" all answer "' + correctOf(g.items[0]) + '"', items: g.items
  }));

  /* --- 3. a class-level item duplicating a place item ------------------ */
  const m3 = {};
  const classItems = items.filter((it) => CLASS_FORMS.has(it.form));
  const placeItems = items.filter((it) => it.place && !CLASS_FORMS.has(it.form));
  classItems.forEach((c) => {
    const ans = norm(correctOf(c));
    const same = placeItems.filter((p) => p.idea === c.idea && norm(correctOf(p)) === ans);
    if (same.length) m3[c.id] = [c].concat(same);
  });
  out.rule3 = groups(m3).map((g) => ({
    key: g.key,
    why: 'the class-level item "' + g.items[0].stem + '" and ' + (g.items.length - 1) +
      ' place item(s) in the same idea all answer "' + correctOf(g.items[0]) + '"',
    items: g.items
  }));

  /* --- 4. stems differing only by a place name, same answer ------------ */
  const m4 = {};
  items.forEach((it) => push(m4, stripPlaces(it.stem) + ' || ' + norm(correctOf(it)), it));
  out.rule4 = groups(m4).map((g) => ({
    key: g.key,
    why: 'identical once the place name is removed, and the same right answer',
    items: g.items
  }));

  /* --- 5. an answer stated verbatim in another item's card ------------- */
  /* Restricted to items that share a place. Without that restriction the
     detector found 657 "clusters", nearly all of them a card naming a town
     that happened to be some far-away question's right answer - two items a
     reader would never meet together. Sharing a place is what makes the two
     items land in the same reader's week. */
  const byPlaceCards = {};
  items.forEach((it) => { if (it.place) push(byPlaceCards, it.place, it); });
  const r5 = [], seen5 = new Set();
  items.forEach((p) => {
    if (!p.place) return;
    const lab = norm(correctOf(p));
    if (lab.length < 6) return;                         /* too short to be telling */
    /* A card about a place names that place - so an item whose ANSWER is its
       own place name matches every card about it. That is the detector
       describing the bank's house style, not a giveaway, and it was 3 in 4 of
       the raw hits. Dropped. */
    const home = G.data.byCode[p.place];
    if (home && (lab === norm(home.name) || lab === norm(home.label) ||
                 lab === norm(G.quizBank._gates.optName(home)))) return;
    const hits = (byPlaceCards[p.place] || []).filter((it) =>
      it.id !== p.id && (' ' + norm(it.card.sentence) + ' ').indexOf(' ' + lab + ' ') >= 0);
    if (!hits.length) return;
    const sig = [p.id].concat(hits.map((h) => h.id)).sort().join('|');
    if (seen5.has(sig)) return;                         /* the mirror of one already held */
    seen5.add(sig);
    r5.push({ key: p.id, why: 'the right answer "' + correctOf(p) +
      '" is written out word for word in ' + hits.length +
      ' other card sentence(s) about the same place', items: [p].concat(hits) });
  });
  out.rule5 = r5.sort((a, x) => x.items.length - a.items.length || (a.key < x.key ? -1 : 1));

  /* --- 6. identical stem, identical answer ----------------------------- */
  const m6 = {};
  items.forEach((it) => push(m6, norm(it.stem) + ' || ' + norm(correctOf(it)), it));
  const optSig = (it) => it.options.map((o) => norm(o.label)).sort().join(' / ');
  out.rule6 = groups(m6).map((g) => {
    const sameOptions = new Set(g.items.map(optSig)).size === 1;
    return { key: g.key, sameOptions,
      why: sameOptions
        ? 'the same stem, the same right answer AND the same options: a true duplicate'
        : 'word-for-word the same stem and the same right answer, but different ' +
          'distractors - the stem carries no information at all, so the reader meets ' +
          'the same sentence ' + g.items.length + ' times',
      items: g.items };
  });

  return out;
}

/* ------------------------------------------------------------------ main */

const TITLES = {
  rule1: '1. SAME PLACE, SAME MEASURE',
  rule1b: '1b. ONE COMMUTE PAIR, ASKED BOTH WAYS, SAME ANSWER',
  rule2: '2. SAME CORRECT ANSWER INSIDE ONE BIG IDEA (3 or more)',
  rule3: '3. A CLASS-LEVEL ITEM DUPLICATING PLACE ITEMS',
  rule4: '4. STEMS DIFFERING ONLY BY A PLACE NAME, SAME ANSWER',
  rule5: '5. AN ANSWER WRITTEN OUT IN ANOTHER ITEM’S CARD',
  rule6: '6. IDENTICAL STEM, IDENTICAL ANSWER'
};

/* What to DO about each detector's clusters. The per-cluster KEEP below says
   which single item survives if you cut; this says whether cutting is even the
   right answer for that kind of cluster. */
const ADVICE = {
  rule1: 'Cut to the KEEP. Two items resting on one vector for one place are ' +
    'one question; the richest form survives.',
  rule1b: 'Cut to the KEEP: keep the commute-IN item and drop its OUT twin ' +
    'wherever both name the same town.',
  rule2: 'Do NOT cut. Cap instead: no more than about six items per (idea, ' +
    'answer) pair, spread across regions and size classes, so an idea cannot ' +
    'be passed by learning one word.',
  rule3: 'Keep the CLASS item - it is the lesson the idea is built on - and cap ' +
    'the place items that merely restate it, keeping the ones whose card carries ' +
    'a figure the class item does not.',
  rule4: 'Cut hardest here. This is one question wearing many hats, and the ' +
    'clusters are large: cap each template-and-answer pair at three or four items.',
  rule5: 'Rewrite, do not cut: change the card sentence so it teaches around the ' +
    'other item\u2019s answer instead of stating it.',
  rule6: 'Rewrite the STEM. \u201cWhich came first?\u201d and \u201cWhich employs more people ' +
    'in Ontario?\u201d say nothing, so every item in the family reads identically. ' +
    'Name the two things being compared and the family stops looking like one ' +
    'question.'
};

/* what each detector gets WRONG, stated as plainly as what it gets right */
const NOISE = {
  rule1: 'Mostly true, with one systematic false positive: commute-OUT and ' +
    'commute-IN for the same place rest on the same matrix but usually name ' +
    'different towns, and then they are two facts, not one. Detector 1b is ' +
    'the part of this that is genuinely one fact. A second, smaller false ' +
    'positive: a fingerprint item and a concentrated item can share a place ' +
    'and the industry-mix vector while testing opposite ends of it (which ' +
    'place has this profile / which place leads in this industry).',
  rule1b: 'Low noise. The residual risk is a place whose largest flow out and ' +
    'largest flow in are the same town for different reasons (a neighbour ' +
    'that both commutes in and receives commuters); that is still one town ' +
    'name learned once and recalled twice.',
  rule2: 'THE NOISIEST DETECTOR, and deliberately so. Two towns whose most ' +
    'common work is "sales and service" are not a duplicate - that repetition ' +
    'IS the pattern the idea teaches. What the number measures is pressure: ' +
    'how much of an idea a reader can pass by learning one word. Treat the ' +
    'long runs as a cap to impose in the bank (how many items per answer per ' +
    'idea), not as items to delete.',
  rule3: 'Some noise where the class claim and the place claim are genuinely ' +
    'different steps of one argument - the class item states the rule, the ' +
    'place item is a worked instance, and meeting both in order is the ' +
    'teaching. The duplicate is only real when the place item adds no new ' +
    'figure, which the card sentence shows.',
  rule4: 'The cleanest detector, and close to noise-free by construction: the ' +
    'wording is identical and the answer is identical. Residual noise: place ' +
    'names that are ordinary words ("The Nation", "Perth") can be stripped ' +
    'out of a stem where they were not a place, collapsing two stems that ' +
    'were not really the same.',
  rule5: 'Two false positives were large enough to be worth naming, and both ' +
    'are now filtered out rather than reported. First, without the same-place ' +
    'restriction the detector found 657 clusters, nearly all of them a card ' +
    'that happened to name a town which was some far-away item\u2019s right ' +
    'answer - two items the same reader would never meet in the same week. ' +
    'Second, a card about a place always names that place, so any item whose ' +
    'ANSWER is its own place name matched every other card about it; that was ' +
    'three in four of what remained, and it is the bank\u2019s house style, not a ' +
    'giveaway. What survives is the real case: a card that spells out another ' +
    'item\u2019s answer about the same place - above all the fingerprint card, ' +
    'which names a place\u2019s top two sectors and so hands over the answer to ' +
    'that place\u2019s \u201clargest group of jobs\u201d question.',
  rule6: 'Half noise, and the noisy half is the interesting half. Every cluster ' +
    'here has DIFFERENT distractors, so strictly none is a duplicate: knowing ' +
    'that the answer to \u201cWhich came first?\u201d was NAFTA once does not answer it ' +
    'when NAFTA is up against a different event. What the detector has actually ' +
    'found is a WORDING fault rather than a duplicated fact - items that read ' +
    'word for word the same. Read the sameOptions flag: a cluster with ' +
    'sameOptions true would be a real duplicate. The cure belongs in the stem, ' +
    'not in the scheduler.'
};

function line(it) {
  return '      ' + it.id.padEnd(22) + ' [' + it.idea + ' ' + it.level + ' ' + it.form + ']  ' +
    it.stem + '  ->  ' + correctOf(it);
}

(async function main() {
  const G = await load();
  const b = bank(G);
  const d = detect(G, b);

  const order = ['rule1', 'rule1b', 'rule2', 'rule3', 'rule4', 'rule5', 'rule6'];
  const counts = {};
  order.forEach((k) => {
    counts[k] = { clusters: d[k].length,
                  items: new Set([].concat(...d[k].map((g) => g.items.map((i) => i.id)))).size };
  });
  const allIds = new Set();
  order.forEach((k) => d[k].forEach((g) => g.items.forEach((i) => allIds.add(i.id))));

  if (JSON_OUT) {
    console.log(JSON.stringify({
      bankItems: b.items.length,
      totalClusters: order.reduce((a, k) => a + d[k].length, 0),
      itemsInAtLeastOneCluster: allIds.size,
      byRule: counts,
      clusters: order.reduce((acc, k) => {
        acc[k] = d[k].map((g) => {
          const { keep, why } = keepOf(g.items);
          return { key: g.key, why: g.why, keep: keep.id, keepWhy: why,
                   sameOptions: g.sameOptions,
                   items: g.items.map((i) => ({ id: i.id, idea: i.idea, level: i.level,
                     form: i.form, place: i.place, stem: i.stem, answer: correctOf(i) })) };
        });
        return acc;
      }, {}),
      advice: ADVICE, noise: NOISE
    }, null, 1));
    return;
  }

  const L = [];
  L.push('The whole pack laid side by side: ' + b.items.length + ' questions.');
  L.push('');
  L.push('  detector                                        clusters   items');
  order.forEach((k) => L.push('  ' + TITLES[k].slice(0, 46).padEnd(48) +
    String(counts[k].clusters).padStart(6) + String(counts[k].items).padStart(8)));
  L.push('  ' + 'TOTAL CLUSTERS'.padEnd(48) +
    String(order.reduce((a, k) => a + d[k].length, 0)).padStart(6) +
    String(allIds.size).padStart(8) + '  (distinct items touched)');
  L.push('');

  order.forEach((k) => {
    if (ONLY && +k.replace(/\D/g, '') !== ONLY) return;
    L.push('');
    L.push('=' .repeat(74));
    L.push(TITLES[k] + '   -   ' + d[k].length + ' clusters');
    L.push('=' .repeat(74));
    if (!d[k].length) { L.push('  none.'); return; }
    L.push('  WHAT TO DO: ' + ADVICE[k]);
    d[k].slice(0, SHOW).forEach((g, i) => {
      const { keep, why } = keepOf(g.items);
      L.push('');
      L.push('  [' + (i + 1) + '] ' + g.why);
      const show = ALL ? g.items : g.items.slice(0, 8);
      show.forEach((it) => L.push(line(it)));
      if (g.items.length > show.length) {
        L.push('      ... and ' + (g.items.length - show.length) +
               ' more items in this cluster');
      }
      L.push('      KEEP  ' + keep.id + '  -  ' + why);
    });
    if (d[k].length > SHOW) {
      L.push('');
      L.push('  ... and ' + (d[k].length - SHOW) + ' more. Run with --all, or --rule ' +
             k.replace(/\D/g, '') + ' --all, to see them.');
    }
  });

  L.push('');
  L.push('=' .repeat(74));
  L.push('WHERE THE DETECTOR IS WRONG ABOUT ITSELF');
  L.push('=' .repeat(74));
  order.forEach((k) => {
    L.push('');
    L.push('  ' + TITLES[k]);
    NOISE[k].match(/.{1,70}(\s|$)/g).forEach((s) => L.push('    ' + s.trim()));
  });
  report('AUDIT 2b - duplicates', L);
})().catch((e) => { console.error(e); process.exit(1); });
