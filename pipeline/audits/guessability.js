/* AUDIT 4 - guessability: how many items can be answered without knowing
   anything?

   pipeline/quiz_selftest.js already guards the STRUCTURE of an option set -
   exactly one right answer, no repeated option text, a universe chip, a
   date, no two place names a reader could confuse by spelling, a spoken
   form for every option, and stems and card sentences short enough to read
   aloud. None of that compares the KEY with the DISTRACTORS, which is the
   whole of test-wiseness: a reader who knows no Ontario economics can still
   beat chance if the right answer is the long one, the hedged one, the only
   one that echoes the stem, or always in the same place.

   The measurement here is deliberately not "how many items have a cue".
   A cue only pays if it POINTS AT THE KEY more often than chance does, so
   every cue below is counted three ways:

     present      items where the cue fires at all, whichever option it
                  picks out
     points at    of those, how often the option it picks out is correct
     chance       what a coin would have got on the same items (sum of 1/k,
                  because two- and three-option items are mixed)

   The ratio of the last two is the LIFT: 1.0 means the cue is worthless to
   a guesser and the item is safe, however ugly it looks. A strategy
   simulation at the end puts the surviving cues together and scores a
   know-nothing player against chance over the whole pool.

   Run:  node pipeline/audits/guessability.js
         node pipeline/audits/guessability.js --json
*/
'use strict';
const { load, bank } = require('./harness');

const JSON_OUT = process.argv.includes('--json');

/* The length rule, in characters. Characters rather than words because
   length is seen before it is read: on a phone an option is a shape, and
   1.5x is about where the key's shape visibly outruns the others in a
   three-option list. Word ratios are reported beside it as a check, and a
   sweep over 1.25x to 3x is printed so the threshold can be argued. */
const LONG_RATIO = 1.5;
const SWEEP = [1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

/* ------------------------------------------------------------ words */

function norm(s) {
  return String(s == null ? '' : s)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').toLowerCase();
}
function tokens(s) { return norm(s).split(/[^a-z0-9']+/).filter(Boolean); }
function chars(s) { return norm(s).replace(/\s+/g, ' ').trim().length; }
function words(s) { return tokens(s).length; }

/* Words that hedge a claim. The classic giveaway: a cautious statement is
   harder to falsify, so a lone cautious option is often the key. */
const HEDGE = new Set(['about', 'often', 'usually', 'may', 'might', 'can',
  'could', 'sometimes', 'typically', 'generally', 'roughly', 'around',
  'nearly', 'almost', 'mostly', 'tend', 'tends', 'largely', 'partly',
  'fairly', 'somewhat', 'likely', 'approximately']);

/* Words that negate. The same giveaway upside down. */
const NEG = new Set(['not', 'no', 'never', 'cannot', "can't", 'nothing',
  'none', 'without', "isn't", "doesn't", "don't", "won't", 'nor', 'neither',
  'nowhere', 'unable']);

/* Too common in this bank to count as a distinctive echo. */
const STOP = new Set(['about', 'above', 'after', 'again', 'against', 'their',
  'there', 'these', 'those', 'which', 'while', 'where', 'whose', 'would',
  'could', 'should', 'other', 'others', 'every', 'place', 'places', 'people',
  'share', 'shares', 'ontario', 'more', 'most', 'than', 'that', 'this',
  'with', 'from', 'have', 'been', 'being', 'they', 'them', 'were', 'what',
  'when', 'does', 'many', 'much', 'some', 'into', 'over', 'under',
  'between', 'because', 'anything', 'something', 'their', 'work', 'works',
  /* the GENERIC list from quiz-bank.js: words that say what KIND of place
     something is, or which way it lies, and so carry no clue to identity.
     "Haldimand County" and "Norfolk County" share a word but not a hint. */
  'north', 'south', 'east', 'west', 'upper', 'lower', 'central', 'greater',
  'county', 'counties', 'township', 'village', 'municipality', 'united',
  'district', 'region', 'regional', 'township']);

/* Pure function words and intensifiers. Stripping these must never change
   what an option MEANS, so "more" and "less" are deliberately absent. */
const FILLER = new Set(['a', 'an', 'the', 'is', 'are', 'it', 'its', 'in',
  'of', 'to', 'at', 'and', 'or', 'be', 'has', 'have', 'that', 'this',
  'strongly', 'very', 'clearly', 'quite', 'really']);

function sig(s) {
  return tokens(s).filter((w) => w.length >= 5 && !STOP.has(w) && !/^\d+$/.test(w));
}
function core(s) { return tokens(s).filter((w) => !FILLER.has(w)).sort().join(' '); }
function numberless(s) { return norm(s).replace(/[\d.,]+/g, '#').replace(/\s+/g, ' ').trim(); }

/* ---------------------------------------------- cues, as pointers */

/* Every cue returns the INDEX of the option it points at, or null. Whether
   that option happens to be the key is measured afterwards, never assumed. */

/* A name cannot be shortened to match its neighbour: "Perth" beside
   "Drummond/North Elmsley" is Ontario's toponymy, and "Retail" beside
   "Finance & insurance" is the industry classification. Neither is a
   formatting fault, and the sweep shows the long option is the key only a
   quarter of the time at 3x. Items whose options are all drawn from a fixed
   vocabulary - place names, industry names - are measured but not failed. */
const PLACE_NAMES = new Set();

function allPlaceNames(it) {
  return it.options.every((o) => PLACE_NAMES.has(String(o.label).toLowerCase()));
}

function pointLongest(it, ratio) {
  const cs = it.options.map((o) => chars(o.label));
  let bi = 0;
  cs.forEach((c, i) => { if (c > cs[bi]) bi = i; });
  const rest = cs.filter((_, i) => i !== bi);
  const second = Math.max.apply(null, rest);
  if (!(cs[bi] >= ratio * Math.max(1, second))) return null;
  const ws = it.options.map((o) => words(o.label));
  const wrest = ws.filter((_, i) => i !== bi);
  return { i: bi, charRatio: cs[bi] / Math.max(1, second),
           wordRatio: ws[bi] / Math.max(1, Math.max.apply(null, wrest)) };
}

function pointHedge(it) {
  const h = [];
  it.options.forEach((o, i) => {
    if (tokens(o.label).some((w) => HEDGE.has(w))) h.push(i);
  });
  return h.length === 1 ? { i: h[0] } : null;
}

function pointNeg(it) {
  const n = [];
  it.options.forEach((o, i) => {
    if (tokens(o.label).some((w) => NEG.has(w)) ||
        /\bdoes not\b|\bis not\b|\bdo not\b/.test(norm(o.label))) n.push(i);
  });
  return n.length === 1 ? { i: n[0] } : null;
}

/* The strongest form of the echo, and the one the selftest's G9 name gate
   already forbids on three forms: the stem quotes an option WORD FOR WORD.
   Whichever way it points, a reader needs to know nothing at all. */
function pointNamed(it) {
  const stem = ' ' + norm(it.stem).replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const hits = [];
  it.options.forEach((o, i) => {
    const lab = norm(o.label).replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (lab.length >= 4 && stem.indexOf(' ' + lab + ' ') >= 0) hits.push(i);
  });
  return hits.length === 1 ? { i: hits[0] } : null;
}

function pointEcho(it) {
  if (pointNamed(it)) return null;          /* counted once, as the stronger cue */
  const stem = new Set(sig(it.stem));
  if (!stem.size) return null;
  const hits = [];
  it.options.forEach((o, i) => {
    const w = sig(o.label).filter((x) => stem.has(x));
    if (w.length) hits.push({ i, word: w[0] });
  });
  return hits.length === 1 ? hits[0] : null;
}

/* Two options are variants of one another: one contains the other, or they
   are the same sentence with a different number - while a third option is
   neither. The cue points at the PAIR, so a guesser who spots it answers
   inside it and scores 1/2 on a three-option item. */
function pointVariant(it) {
  const opts = it.options;
  if (opts.length < 3) return null;
  const pairs = [];
  for (let i = 0; i < opts.length; i++) {
    for (let j = i + 1; j < opts.length; j++) {
      const a = norm(opts[i].label).trim(), b = norm(opts[j].label).trim();
      let kind = null;
      if (a.length !== b.length && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) kind = 'substring';
      else if (numberless(a) === numberless(b) && a !== b) kind = 'same-but-a-number';
      if (kind) pairs.push({ i, j, kind });
    }
  }
  const all = opts.length * (opts.length - 1) / 2;
  /* every pair a number-variant is a magnitude set: that IS the question */
  if (!pairs.length || pairs.length === all) return null;
  return { pair: [pairs[0].i, pairs[0].j], kind: pairs[0].kind };
}

/* Two options that say the same thing. Under one-right-answer both must be
   wrong, so a reasoner eliminates two options at once. */
function pointSame(it) {
  /* An ORDERING item offers the same names in different orders, and the
     order is the whole answer. core() sorts its tokens to catch a paraphrase,
     which made all three orderings identical and failed 36 honest items on
     24 Sept, the day the shape was added. A set of options that are all
     permutations of one another is exempt - and only that set: two options
     out of three sharing a multiset is still a duplicate. */
  const cores = it.options.map((o) => core(o.label));
  const seqs = it.options.map((o) => tokens(o.label).filter((w) => !FILLER.has(w)).join(' '));
  if (it.options.length > 1 && cores.every((c) => c === cores[0]) &&
      new Set(seqs).size === seqs.length) return null;
  const seen = {};
  for (let i = 0; i < it.options.length; i++) {
    const c = core(it.options[i].label);
    if (!c) continue;
    if (seen[c] != null) return { pair: [seen[c], i], core: c };
    seen[c] = i;
  }
  return null;
}

/* ------------------------------------------------------------ stats */

function chi2(counts) {
  const n = counts.reduce((s, x) => s + x, 0);
  const e = n / counts.length;
  if (!e) return { x2: 0, df: 0, n: 0 };
  return { x2: counts.reduce((s, x) => s + Math.pow(x - e, 2) / e, 0),
           df: counts.length - 1, n: n };
}
function lgamma(z) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function chiP(x2, df) {
  if (df <= 0) return 1;
  const k = df / 2, x = x2 / 2;
  if (x <= 0) return 1;
  if (x < k + 1) {
    let sum = 1 / k, term = sum;
    for (let i = 1; i < 500; i++) { term *= x / (k + i); sum += term; if (term < 1e-14) break; }
    return Math.max(0, 1 - sum * Math.exp(-x + k * Math.log(x) - lgamma(k)));
  }
  let b = x + 1 - k, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - k);
    b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + k * Math.log(x) - lgamma(k)) * h;
}
/* Two-sided p that `hits` of `n` trials came from a coin of the given
   expected total, by the normal approximation with a continuity correction.
   The trials have different k, so the variance is summed per item. */
function pointP(hits, probs) {
  const mu = probs.reduce((s, p) => s + p, 0);
  const sd = Math.sqrt(probs.reduce((s, p) => s + p * (1 - p), 0));
  if (!sd) return 1;
  const z = (Math.abs(hits - mu) - 0.5) / sd;
  /* two-sided normal tail */
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
            t * (-1.821255978 + t * 1.330274429))));
  return Math.min(1, 2 * p);
}

/* ================================================================ run */

(async function main() {
  const G = await load();
  /* every place name the payloads know, for the R1 exemption */
  (G.data.places || []).forEach((p) => {
    PLACE_NAMES.add(String(p.name).toLowerCase());
    PLACE_NAMES.add(String(p.name).split(' / ')[0].toLowerCase());
  });
  (G.data.naics || []).forEach((n) => {
    PLACE_NAMES.add(String(n.short).toLowerCase());
    PLACE_NAMES.add(String(n.name).toLowerCase());
  });
  (G.data.NOC_SHORT ? Object.keys(G.data.NOC_SHORT) : []).forEach((k) => {
    PLACE_NAMES.add(String(G.data.NOC_SHORT[k]).toLowerCase());
  });
  const B = bank(G);
  const items = B.items;
  const N = items.length;
  const keyOf = (it) => it.options.findIndex((o) => o.correct);

  /* ---- every cue, measured as a pointer ---- */
  const CUE_DEFS = [
    { id: 'longest', label: 'one option ' + LONG_RATIO + 'x longer than every other',
      point: (it) => pointLongest(it, LONG_RATIO), kind: 'single' },
    { id: 'lone-hedge', label: 'exactly one option hedges',
      point: pointHedge, kind: 'single' },
    { id: 'lone-negation', label: 'exactly one option negates',
      point: pointNeg, kind: 'single' },
    { id: 'stem-names-option', label: 'the stem quotes exactly one option word for word',
      point: pointNamed, kind: 'single' },
    { id: 'stem-echo', label: 'a distinctive stem word in exactly one option',
      point: pointEcho, kind: 'single' },
    { id: 'variant-pair', label: 'two options are variants of each other',
      point: pointVariant, kind: 'pair' },
    { id: 'two-options-same', label: 'two options say the same thing',
      point: pointSame, kind: 'pair' }
  ];

  const cue = {};
  const perItem = {};
  items.forEach((it) => { perItem[it.id] = { id: it.id, form: it.strand + '/' + it.form, cues: [] }; });

  CUE_DEFS.forEach((C) => {
    const ids = [], hitIds = [], probs = [];
    let hits = 0;
    let ratioSum = 0, ratioN = 0, wordRatioSum = 0;
    items.forEach((it) => {
      const p = C.point(it);
      if (!p) return;
      const k = it.options.length;
      ids.push(it.id);
      const ki = keyOf(it);
      let hit, chance;
      if (C.kind === 'single') { hit = p.i === ki; chance = 1 / k; }
      else { hit = p.pair.indexOf(ki) >= 0; chance = p.pair.length / k; }
      probs.push(chance);
      if (hit) { hits++; hitIds.push(it.id); }
      if (p.charRatio) { ratioSum += p.charRatio; ratioN++; wordRatioSum += p.wordRatio; }
      perItem[it.id].cues.push({ cue: C.id, pointsAtKey: hit,
                                 charRatio: p.charRatio || null,
                                 word: p.word || null, kind: p.kind || null });
    });
    const chance = probs.reduce((s, x) => s + x, 0);
    cue[C.id] = {
      label: C.label, present: ids.length, pointsAtKey: hits,
      chance: chance, lift: chance ? hits / chance : null,
      p: pointP(hits, probs), ids: ids, hitIds: hitIds,
      meanCharRatio: ratioN ? ratioSum / ratioN : null,
      meanWordRatio: ratioN ? wordRatioSum / ratioN : null
    };
  });

  /* the length rule at several thresholds, so the bar can be argued */
  const sweep = SWEEP.map((r) => {
    let present = 0, hits = 0; const probs = [];
    items.forEach((it) => {
      const p = pointLongest(it, r);
      if (!p) return;
      present++; probs.push(1 / it.options.length);
      if (p.i === keyOf(it)) hits++;
    });
    const chance = probs.reduce((s, x) => s + x, 0);
    return { ratio: r, present: present, pointsAtKey: hits, chance: chance,
             lift: chance ? hits / chance : null, p: pointP(hits, probs) };
  });

  /* ---- position bias ---- */
  const posBy = { 2: [0, 0], 3: [0, 0, 0] }, posByForm = {};
  items.forEach((it) => {
    const k = it.options.length, i = keyOf(it);
    if (posBy[k]) posBy[k][i]++;
    const f = it.strand + '/' + it.form;
    posByForm[f] = posByForm[f] || { 2: [0, 0], 3: [0, 0, 0] };
    if (posByForm[f][k]) posByForm[f][k][i]++;
  });
  const position = {};
  [2, 3].forEach((k) => {
    const c = chi2(posBy[k]);
    position[k] = { counts: posBy[k], n: c.n, x2: c.x2, df: c.df, p: chiP(c.x2, c.df),
                    shares: posBy[k].map((x) => (c.n ? x / c.n : 0)) };
  });
  const formBias = [];
  Object.keys(posByForm).sort().forEach((f) => {
    [2, 3].forEach((k) => {
      const counts = posByForm[f][k], n = counts.reduce((s, x) => s + x, 0);
      if (n < 20) return;
      const c = chi2(counts);
      formBias.push({ form: f, k: k, n: n, counts: counts,
                      topShare: Math.max.apply(null, counts) / n,
                      x2: c.x2, p: chiP(c.x2, c.df) });
    });
  });
  formBias.sort((a, b) => a.p - b.p);

  const h = G.quizBank._h;
  const probe = [{ label: 'one' }, { label: 'two' }, { label: 'three' }];
  const s1 = h.shuffle(probe, 'B1:3520005').map((x) => x.label).join('|');
  const s2 = h.shuffle(probe, 'B1:3520005').map((x) => x.label).join('|');
  const s3 = h.shuffle(probe, 'B1:3520006').map((x) => x.label).join('|');

  /* ---- the know-nothing strategy ----
     One pass over the pool. A cue is used in whichever DIRECTION the pool
     says it runs: where the cue almost never points at the key, the rule is
     "avoid the option it picks out", and that is worth more than a rule that
     follows it. The score is the expected number right, against the expected
     number right from pure chance on the same items.

     A cue is only used at all when the pool says its direction is real:
     ten items or more and a two-sided p under 0.05. Without that test the
     strategy picks up coin flips - "longest" points at the key on 36.5% of
     293 items against 37.0% expected, and reading that 0.5-point shortfall
     as a rule invents four points of gain out of nothing. */
  const USE_MIN = 10, USE_P = 0.05;
  const follow = {}, useCue = {};
  Object.keys(cue).forEach((k) => {
    const c = cue[k];
    useCue[k] = c.present >= USE_MIN && c.p < USE_P;
    follow[k] = c.present ? (c.pointsAtKey / c.present) >= (c.chance / c.present) : true;
  });
  let chanceScore = 0;
  const used = { named: 0, longest: 0, echo: 0, same: 0, variant: 0 };
  const gain = {};
  items.forEach((it) => {
    const k = it.options.length, ki = keyOf(it);
    const ch = 1 / k;
    chanceScore += ch;
    let got = ch, tag = null;
    const single = (id, p, counter) => {
      if (got !== ch || !p || !useCue[id]) return false;
      got = follow[id] ? (p.i === ki ? 1 : 0)
                       : (p.i === ki ? 0 : 1 / (k - 1));
      tag = (follow[id] ? 'pick ' : 'avoid ') + id;
      used[counter]++;
      return true;
    };
    const Nm = pointNamed(it);
    single('stem-names-option', Nm, 'named');
    if (got === ch) single('longest', pointLongest(it, LONG_RATIO), 'longest');
    if (got === ch) single('stem-echo', pointEcho(it), 'echo');
    /* the two logic checks are used whatever their count: "two options say
       the same thing, so both are wrong" is deduction, not a base rate */
    if (got === ch) {
      const Sm = pointSame(it);
      if (Sm && k > 2) {           /* both of a matching pair must be wrong */
        got = (Sm.pair.indexOf(ki) >= 0 ? 0 : 1 / Math.max(1, k - 2));
        tag = 'delete the matching pair'; used.same++;
      }
    }
    if (got === ch) {
      const V = pointVariant(it);
      if (V) {
        got = (V.pair.indexOf(ki) >= 0 ? 1 / 2 : 0);
        tag = 'answer inside the variant pair'; used.variant++;
      }
    }
    gain[it.id] = { got: got, chance: ch, gain: got - ch, rule: tag };
  });
  const stratScore = Object.keys(gain).reduce((s, id) => s + gain[id].got, 0);

  /* ---- worst items ----
     Ranked by how much a know-nothing player gains on THAT item, which is
     the thing that matters: a cue whose option is almost never the key is
     just as exploitable as one whose option almost always is. */
  const scored = items.map((it) => {
    const d = perItem[it.id], g = gain[it.id];
    const ratio = (d.cues.find((c) => c.charRatio) || {}).charRatio || null;
    return { id: it.id, form: d.form, cues: d.cues.map((c) => c.cue),
             rule: g.rule, gain: g.gain, expected: g.got, chance: g.chance,
             charRatio: ratio };
  }).filter((x) => x.rule && x.gain > 0)
    .sort((a, b) => b.gain - a.gain || b.cues.length - a.cues.length ||
                    (b.charRatio || 0) - (a.charRatio || 0) ||
                    (a.id < b.id ? -1 : 1));

  /* A second list, because the worst-by-gain list is one form over and over:
     items carrying two or more flags, or either logic flaw, whether or not
     the flag currently pays. These are the badly FORMED items. */
  const malformed = items.map((it) => {
    const d = perItem[it.id];
    const logic = d.cues.some((c) => c.cue === 'variant-pair' || c.cue === 'two-options-same');
    return { id: it.id, form: d.form, cues: d.cues.map((c) => c.cue), logic: logic,
             charRatio: (d.cues.find((c) => c.charRatio) || {}).charRatio || null };
  }).filter((x) => x.logic || x.cues.length >= 2)
    .sort((a, b) => (b.logic ? 1 : 0) - (a.logic ? 1 : 0) ||
                    b.cues.length - a.cues.length || (a.id < b.id ? -1 : 1));
  const anyCuePointsAtKey = items.filter((it) =>
    perItem[it.id].cues.some((c) => c.pointsAtKey)).length;
  const exploitable = scored.length;

  /* ---- build-failing rules ---- */
  const bigForms = formBias.filter((f) => f.n >= 30);
  const rules = [
    { id: 'R1', name: 'no option more than three times the length of another',
      rule: 'FAIL any item where one option is at least 3.0x the longest other option in characters, whichever option it is',
      fails: items.filter((it) => pointLongest(it, 3.0) && !allPlaceNames(it)).length,
      why: 'below 3x the length cue carries nothing - the long option is the key ' +
           (100 * (sweep.find((s) => s.ratio === 1.5).pointsAtKey /
                   Math.max(1, sweep.find((s) => s.ratio === 1.5).present))).toFixed(0) +
           '% of the time at 1.5x against ' +
           (100 * (sweep.find((s) => s.ratio === 1.5).chance /
                   Math.max(1, sweep.find((s) => s.ratio === 1.5).present))).toFixed(0) +
           '% expected, so failing at 1.5x or 2.0x would delete ' +
           sweep.find((s) => s.ratio === 2.0).present +
           ' honest items for nothing. At 3x it has flipped (key ' +
           (100 * (sweep.find((s) => s.ratio === 3.0).pointsAtKey /
                   Math.max(1, sweep.find((s) => s.ratio === 3.0).present))).toFixed(0) +
           '%) and a five-character option beside a fifty-character one is a formatting fault anyway' },
    { id: 'R2', name: 'the stem never quotes an option',
      rule: 'FAIL any item whose stem contains one option\'s label word for word - extend the selftest\'s G9 name gate from commute-out / commute-in / twin to EVERY form, and re-run it after quiz-ideas.js has rewritten a stem',
      fails: cue['stem-names-option'].present,
      why: 'the quoted option is the key ' + cue['stem-names-option'].pointsAtKey +
           ' times in ' + cue['stem-names-option'].present +
           ', so "never pick the one the question names" answers all of them without any knowledge' },
    /* R2b is measured, not gated: the echoed option is the key 1 time in 2,
       which is chance, so failing the build on it would delete honest items
       to fix nothing. It is listed so a regression shows up. */
    { id: 'R2b', gate: false, name: 'no lone distinctive stem word either',
      rule: 'FAIL any item where a five-letter-or-longer non-stop stem word appears in exactly one option',
      fails: cue['stem-echo'].present,
      why: 'the echoed option is the key in only ' + cue['stem-echo'].pointsAtKey +
           ' of ' + cue['stem-echo'].present + ' of the residue' },
    { id: 'R3', name: 'options mutually exclusive',
      rule: 'FAIL any item where two options say the same thing after function words are removed, or one option contains another',
      fails: cue['two-options-same'].present + cue['variant-pair'].present,
      why: 'both members of such a pair cannot be right, so a reasoner deletes two options at once' },
    { id: 'R4', name: 'position uniform across the pool',
      rule: 'FAIL the build when the correct position is not uniform: chi-square p < 0.01 for either option-count group, or for any single form with 30 items or more',
      fails: (position[2].p < 0.01 ? 1 : 0) + (position[3].p < 0.01 ? 1 : 0) +
             bigForms.filter((f) => f.p < 0.01).length,
      why: 'the pool is uniform today (p = ' + position[3].p.toFixed(2) +
           ' on three-option items), so this rule costs nothing and stops a regression' },
    { id: 'R5', name: 'no cue may predict the key across the pool',
      rule: 'for every cue with 30 items or more, the share of times it points at the key must be within a binomial p of 0.01 of chance. This is the general rule and the other four are special cases of it',
      fails: Object.keys(cue).filter((k) => cue[k].present >= 30 && cue[k].p < 0.01).length,
      why: 'failing cues today: ' +
           (Object.keys(cue).filter((k) => cue[k].present >= 30 && cue[k].p < 0.01)
             .map((k) => k + ' (' + cue[k].pointsAtKey + '/' + cue[k].present + ' against ' +
                  cue[k].chance.toFixed(0) + ' expected)').join('; ') || 'none') },
    { id: 'R6', name: 'lone hedge and lone negation - WATCH, do not fail',
      rule: 'report only',
      fails: 0,
      why: 'a lone hedge points at the key ' + cue['lone-hedge'].pointsAtKey + ' of ' +
           cue['lone-hedge'].present + ' times (lift ' +
           (cue['lone-hedge'].lift || 0).toFixed(2) + '), a lone negation ' +
           cue['lone-negation'].pointsAtKey + ' of ' + cue['lone-negation'].present +
           ' (lift ' + (cue['lone-negation'].lift || 0).toFixed(2) +
           '): at or below chance, so failing the build on them would delete honest items for nothing' }
  ];

  const result = {
    items: N, longRatio: LONG_RATIO, cues: cue, lengthSweep: sweep,
    position: position, formBias: formBias,
    shuffle: { deterministic: s1 === s2, variesById: s1 !== s3 },
    strategy: { expectedRight: stratScore, chanceRight: chanceScore,
                lift: stratScore / chanceScore,
                pointsOverChance: (stratScore - chanceScore) / N,
                used: used, cueDirection: follow, cueUsed: useCue,
                directionTest: { minItems: USE_MIN, p: USE_P } },
    malformed: malformed,
    anyCuePointsAtKey: anyCuePointsAtKey,
    anyCuePointsAtKeyShare: anyCuePointsAtKey / N,
    exploitable: exploitable, exploitableShare: exploitable / N,
    worst20: scored.slice(0, 20),
    rules: rules
  };

  if (JSON_OUT) { console.log(JSON.stringify(result)); return; }

  const pc = (x) => (100 * x).toFixed(1) + '%';
  console.log('=== AUDIT 4  guessability ===\n');
  console.log(N + ' questions. quiz_selftest.js already guards one-correct-option,');
  console.log('repeated option text, the universe chip, the date chip, confusable');
  console.log('place names, spoken forms, and stem / card word length. It never');
  console.log('compares the key with the distractors. These checks do.\n');

  console.log('-- each cue, and whether it actually pays --\n');
  console.log('  cue                              present  points at key   chance   lift    p');
  CUE_DEFS.forEach((C) => {
    const c = cue[C.id];
    console.log('  ' + C.id.padEnd(20) + String(c.present).padStart(12) +
                String(c.pointsAtKey).padStart(13) + '   ' +
                c.chance.toFixed(1).padStart(7) + '   ' +
                (c.lift == null ? '  -  ' : c.lift.toFixed(2).padStart(5)) + '   ' +
                (c.p < 0.001 ? '<0.001' : c.p.toFixed(3)));
  });
  console.log('\n  "chance" is the number a coin would get on the same items, summing');
  console.log('  1/k because two- and three-option items are mixed. Lift 1.00 means');
  console.log('  the cue is worth nothing to a guesser.\n');
  console.log('  items where at least one cue points at the key: ' + anyCuePointsAtKey +
              ' (' + pc(anyCuePointsAtKey / N) + ')');

  console.log('\n-- the length rule at different bars --\n');
  console.log('  ratio   items flagged   key is the long one   lift     p');
  sweep.forEach((s) => {
    console.log('  ' + s.ratio.toFixed(2).padStart(5) + String(s.present).padStart(14) +
                String(s.pointsAtKey).padStart(20) + ' (' +
                pc(s.present ? s.pointsAtKey / s.present : 0) + ')   ' +
                (s.lift == null ? ' -  ' : s.lift.toFixed(2)) + '   ' +
                (s.p < 0.001 ? '<0.001' : s.p.toFixed(3)));
  });
  if (cue.longest.meanCharRatio) {
    console.log('\n  at ' + LONG_RATIO + 'x the flagged option averages ' +
                cue.longest.meanCharRatio.toFixed(2) + 'x in characters and ' +
                cue.longest.meanWordRatio.toFixed(2) + 'x in words.');
  }

  console.log('\n-- position of the correct option --\n');
  [3, 2].forEach((k) => {
    const p = position[k];
    if (!p.n) return;
    console.log('  ' + k + '-option items (' + p.n + '): ' +
                p.counts.map((c, i) => 'ABC'[i] + ' ' + c + ' (' + pc(p.shares[i]) + ')').join('  '));
    console.log('     chi-square ' + p.x2.toFixed(2) + ' on ' + p.df + ' df, p = ' +
                (p.p < 0.001 ? '<0.001' : p.p.toFixed(3)) +
                (p.p < 0.01 ? '   NOT UNIFORM' : '   uniform'));
  });
  console.log('\n  the shuffle is deterministic for a given id: ' + result.shuffle.deterministic);
  console.log('  and it does change with the id: ' + result.shuffle.variesById);
  console.log('\n  the least uniform forms (20 items or more):');
  formBias.slice(0, 5).forEach((f) => {
    console.log('    ' + f.form.padEnd(18) + String(f.n).padStart(5) + ' items  ' +
                f.counts.slice(0, f.k).map((c, i) => 'ABC'[i] + ' ' + c).join(' ') +
                '   top ' + pc(f.topShare) + '   p=' + f.p.toFixed(3));
  });

  console.log('\n-- a know-nothing player, using the cues --\n');
  const st = result.strategy;
  console.log('  expected right over all ' + N + ' items: ' + st.expectedRight.toFixed(1) +
              ' (' + pc(st.expectedRight / N) + ')');
  console.log('  pure chance on the same items:      ' + st.chanceRight.toFixed(1) +
              ' (' + pc(st.chanceRight / N) + ')');
  console.log('  gain: ' + (100 * st.pointsOverChance).toFixed(1) +
              ' percentage points, lift ' + st.lift.toFixed(3));
  console.log('  rules used: avoid-the-quoted-option ' + st.used.named + ', longest ' +
              st.used.longest + ', echo ' + st.used.echo +
              ', same-pair ' + st.used.same + ', variant-pair ' + st.used.variant);
  console.log('  items where a cue leaves the player better off than chance: ' +
              exploitable + ' (' + pc(exploitable / N) + ')');
  console.log('  ...of which answered with certainty, knowing nothing: ' +
              scored.filter((x) => x.expected === 1).length);

  console.log('\n-- the worst 20 items, by what a know-nothing player gains --\n');
  scored.slice(0, 20).forEach((x, i) => {
    console.log('  ' + String(i + 1).padStart(2) + '. ' + x.id.slice(0, 24).padEnd(26) +
                x.form.padEnd(15) + (100 * x.chance).toFixed(0).padStart(3) + '% -> ' +
                (100 * x.expected).toFixed(0).padStart(3) + '%   ' + x.rule +
                (x.charRatio ? '  (' + x.charRatio.toFixed(2) + 'x)' : ''));
  });
  console.log('\n  (only cues whose direction is real are used: ' + USE_MIN +
              ' items or more and p < ' + USE_P + '. Used: ' +
              Object.keys(useCue).filter((k) => useCue[k]).join(', ') + '.)');

  console.log('\n-- badly formed, whether or not it currently pays --');
  console.log('   items with two flags or with a logic flaw: ' + malformed.length);
  const notNamed = malformed.filter((x) => x.cues.indexOf('stem-names-option') < 0);
  console.log('   of these, ' + (malformed.length - notNamed.length) +
              ' are A/bigger items that R2 already removes. The rest:\n');
  notNamed.forEach((x) => {
    console.log('    ' + x.id.slice(0, 24).padEnd(26) + x.form.padEnd(15) + x.cues.join(', '));
  });

  console.log('\n-- what should FAIL THE BUILD, and what it costs today --\n');
  rules.forEach((r) => {
    console.log('  ' + r.id + '  ' + r.name);
    console.log('      rule:   ' + r.rule);
    console.log('      today:  ' + r.fails + ' would fail. ' + r.why);
    console.log('');
  });
})().catch((e) => { console.error(e); process.exit(1); });
