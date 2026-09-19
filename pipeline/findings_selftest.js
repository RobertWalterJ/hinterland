/* Drive app/js/findings.js over every Ontario municipality and report how each
   detector actually behaves.

   "Which of these findings is filler?" is an empirical question, not a matter
   of taste: a detector that fires for four places in five is describing the
   province rather than the place, and one that fires for none is dead code
   wearing a comment. This harness loads the real payloads, runs the engine
   under the app's default state, and prints firing rates, how often each
   detector reaches the brief, and how often it LEADS it - which is the number
   that decides whether a reader meets the same sentence every time.

   Consumed by pipeline/validate.py; also runnable on its own for a table.
*/
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
/* A DOM stub wide enough for the modules to evaluate. Nothing here renders;
   the harness only ever calls compute(). */
const el = () => ({
  style: {}, classList: { add() {}, remove() {}, toggle() {} },
  appendChild() {}, addEventListener() {}, setAttribute() {},
  querySelector: () => null, querySelectorAll: () => [],
  insertAdjacentHTML() {}, focus() {}, innerHTML: '', textContent: ''
});
globalThis.document = {
  createElement: el, createElementNS: el, body: el(),
  documentElement: el(),
  getElementById: el, querySelector: () => null,
  querySelectorAll: () => [], addEventListener() {}
};
/* data.js fetches its payloads; here they come off disk, so the real
   D.load() path runs and its private index() builds the place objects the
   detectors read - jobsRatio, selfContainmentUsual, popGrowth and the rest. */
globalThis.fetch = (u) => {
  const name = String(u).split('/').pop();
  const f = path.join(APP, 'data', name);
  if (!fs.existsSync(f)) return Promise.reject(new Error('no ' + name));
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(JSON.parse(fs.readFileSync(f, 'utf8'))),
    text: () => Promise.resolve(fs.readFileSync(f, 'utf8'))
  });
};
globalThis.matchMedia = () => ({ matches: false, addListener() {},
                                 addEventListener() {} });
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.location = { hash: '', search: '' };
globalThis.history = { replaceState() {} };
try { globalThis.navigator = { userAgent: 'node' }; } catch (e) {}

const geval = eval;
for (const f of ['methods.js', 'charts.js', 'data.js', 'findings.js',
                 'spatial.js', 'ttwa.js', 'sound.js', 'app.js']) {
  geval(fs.readFileSync(path.join(APP, 'js', f), 'utf8'));
}
const G = globalThis.GRA;
const D = G.data, M = G.methods;

const A = G.app;

const stats = {};
const note = (id, field) => {
  stats[id] = stats[id] || { fired: 0, inBrief: 0, led: 0 };
  stats[id][field]++;
};

async function main() {
/* app.js boots itself on evaluation and calls D.load(); calling it a second
   time re-runs the private index() and doubles every place list. Wait for the
   boot it already started instead. */
for (let i = 0; i < 400 && !D.ready; i++) {
  await new Promise((r) => setTimeout(r, 25));
}
if (!D.ready) throw new Error('payloads did not load');

const places = (D.byLevel.CSD || []);
let examined = 0;
const samples = {};

for (const p of places) {
  A.state.place = p.code;
  let built = null;
  try { built = A.compute(); } catch (e) { built = null; }
  if (!built) continue;
  examined++;
  let found = [];
  try { found = G.findings.compute(built) || []; } catch (e) { continue; }
  for (const f of found) {
    note(f.id, 'fired');
    if (!samples[f.id]) samples[f.id] = { place: p.name, text: f.text };
  }
  const shown = [];
  const seenTag = new Set();
  for (const f of found) {
    if (seenTag.has(f.tag)) continue;
    seenTag.add(f.tag);
    shown.push(f);
    if (shown.length >= 4) break;
  }
  shown.forEach((f, i) => {
    note(f.id, 'inBrief');
    if (i === 0) note(f.id, 'led');
  });
}

const rows = Object.keys(stats).map((id) => ({
  id,
  fired: stats[id].fired,
  firedPct: +(100 * stats[id].fired / examined).toFixed(1),
  inBrief: stats[id].inBrief,
  led: stats[id].led,
  ledPct: +(100 * stats[id].led / examined).toFixed(1),
})).sort((a, b) => b.fired - a.fired);

const out = {
  examined,
  detectors: rows,
  dead: rows.filter((r) => r.fired === 0).map((r) => r.id),
  ubiquitous: rows.filter((r) => r.firedPct > 90).map((r) => r.id),
  monopolists: rows.filter((r) => r.ledPct > 40).map((r) => r.id),
  leadConcentration: (() => {
    const led = rows.filter((r) => r.led > 0).sort((a, b) => b.led - a.led);
    const top2 = led.slice(0, 2).reduce((s, r) => s + r.led, 0);
    const all = led.reduce((s, r) => s + r.led, 0);
    return all ? +(100 * top2 / all).toFixed(1) : null;
  })(),
  distinctLeaders: rows.filter((r) => r.led > 0).length,
};

if (process.argv.includes('--table')) {
  const pad = (v, n, right) => right
    ? String(v).padStart(n) : String(v).padEnd(n);
  console.log('examined ' + examined + ' municipalities');
  console.log(pad('detector', 22) + pad('fires', 7) + pad('fires%', 9) +
              pad('in brief', 10) + pad('leads', 8) + pad('leads%', 8));
  for (const r of rows) {
    console.log(pad(r.id, 22) + pad(r.fired, 7) +
      pad(r.firedPct.toFixed(1) + '%', 9) + pad(r.inBrief, 10) +
      pad(r.led, 8) + pad((100 * r.led / examined).toFixed(1) + '%', 8));
  }
  console.log('');
  console.log('dead (never fire):       ' + (out.dead.join(', ') || 'none'));
  console.log('fire for >90% of places: ' + (out.ubiquitous.join(', ') || 'none'));
  console.log('lead >40% of briefs:     ' + (out.monopolists.join(', ') || 'none'));
  console.log('top two take ' + out.leadConcentration +
              '% of all openings; ' + out.distinctLeaders + ' distinct leaders');
  if (process.argv.includes('--samples')) {
    console.log('');
    for (const id of Object.keys(samples)) {
      console.log('--- ' + id + ' (' + samples[id].place + ')');
      console.log(samples[id].text);
      console.log('');
    }
  }
} else {
  console.log(JSON.stringify(out));
}
}

main().catch((e) => { console.error(e); process.exit(1); });
