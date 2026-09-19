/* Build the quiz bank from the real payloads and check every item.

   The design's gates are only worth what the code enforces, and the design
   review found its counts "not measured under the gates as written". So this
   builds the bank with the SAME module the app uses, from the same data, and
   checks each item as validate.py checks everything else: exactly one right
   answer, options that cannot be confused by spelling, stems and card
   sentences short enough to read, and no id collisions.

   Prints JSON for validate.py; `--table` prints counts per strand and form.
*/
'use strict';
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'app');
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.fetch = (u) => {
  const f = path.join(APP, 'data', String(u).split('/').pop());
  return Promise.resolve({
    ok: fs.existsSync(f), status: fs.existsSync(f) ? 200 : 404,
    json: () => Promise.resolve(JSON.parse(fs.readFileSync(f, 'utf8')))
  });
};

const geval = eval;
for (const f of ['methods.js', 'charts.js', 'data.js', 'terms.js', 'quiz-bank.js']) {
  geval(fs.readFileSync(path.join(APP, 'js', f), 'utf8'));
}
const G = globalThis.GRA;

function words(s) { return String(s || '').trim().split(/\s+/).filter(Boolean).length; }

(async function main() {
  await G.data.load();
  const t0 = Date.now();
  const bank = G.quizBank.build();
  const ms = Date.now() - t0;
  const items = bank.items;

  const problems = [];
  const seen = new Set();
  const byForm = {};
  const stemWords = {}, cardWords = {};
  for (const it of items) {
    byForm[it.strand + '/' + it.form] = (byForm[it.strand + '/' + it.form] || 0) + 1;
    if (seen.has(it.id)) problems.push('duplicate id ' + it.id);
    seen.add(it.id);

    const right = it.options.filter((o) => o.correct).length;
    if (right !== 1) problems.push(it.id + ': ' + right + ' correct options');

    const labels = it.options.map((o) => o.label);
    if (new Set(labels).size !== labels.length) problems.push(it.id + ': repeated option');

    if (!it.chip || !it.chip.universe) problems.push(it.id + ': no universe chip (G4)');
    if (['A', 'B', 'C'].includes(it.strand) && !it.chip.when) {
      problems.push(it.id + ': no date (G5)');
    }
    if (!it.card || !it.card.sentence) problems.push(it.id + ': no card sentence');

    /* G9 for every place-name option set */
    if (['bigger', 'fingerprint', 'concentrated', 'commute-out', 'commute-in', 'twin']
        .includes(it.form)) {
      if (!G.quizBank._gates.namesOk(labels)) {
        problems.push(it.id + ': confusable option names ' + labels.join(' / '));
      }
    }
    /* every option carries its spoken form, with its letter */
    if (it.options.some((o) => !/^Option [ABC]\. /.test(o.say || ''))) {
      problems.push(it.id + ': option without a spoken form');
    }

    const sw = words(it.stem), cw = words(it.card.sentence);
    (stemWords[it.strand] = stemWords[it.strand] || []).push(sw);
    (cardWords[it.strand] = cardWords[it.strand] || []).push(cw);
  }

  const q = (arr, p) => {
    const a = arr.slice().sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(p * a.length))];
  };
  const len = {};
  for (const s of Object.keys(stemWords)) {
    len[s] = { stemMax: Math.max(...stemWords[s]), stemP90: q(stemWords[s], 0.9),
               cardMax: Math.max(...cardWords[s]), cardP90: q(cardWords[s], 0.9) };
  }

  const out = {
    items: items.length, buildMs: ms, byForm, lengths: len,
    problems: problems.slice(0, 20), problemCount: problems.length,
    surprising: items.filter((i) => i.surprise > 0).length
  };

  if (process.argv.includes('--table')) {
    console.log('quiz bank: ' + items.length + ' items, built in ' + ms + ' ms\n');
    for (const k of Object.keys(byForm).sort()) {
      console.log('  ' + k.padEnd(22) + String(byForm[k]).padStart(6));
    }
    console.log('\n  surprising items (distinctive sector is not the largest): ' + out.surprising);
    console.log('\n  words, max / 90th percentile:');
    for (const s of Object.keys(len).sort()) {
      console.log('    strand ' + s + '  stem ' + len[s].stemMax + ' / ' + len[s].stemP90 +
                  '   card ' + len[s].cardMax + ' / ' + len[s].cardP90);
    }
    console.log('\n  problems: ' + (problems.length ? '\n    ' + problems.slice(0, 20).join('\n    ') : 'none'));
    if (process.argv.includes('--samples')) {
      const pick = ['A1', 'A2', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'D1', 'E1', 'E2', 'E3'];
      for (const pre of pick) {
        const it = items.find((i) => i.id.startsWith(pre + ':') && (pre !== 'B2' || i.surprise));
        if (!it) continue;
        console.log('\n[' + it.id + ']  ' + it.chip.universe + (it.chip.when ? ' · ' + it.chip.when : ''));
        console.log('  ' + it.stem);
        it.options.forEach((o) => console.log('    ' + (o.correct ? '*' : ' ') + ' ' + o.key + '. ' + o.label));
        console.log('  -> ' + it.card.sentence);
      }
    }
  } else {
    console.log(JSON.stringify(out));
  }
})().catch((e) => { console.error(e); process.exit(1); });
