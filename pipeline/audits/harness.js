/* Shared loader for the audit scripts in this folder.

   Every audit runs against the REAL app modules and the REAL payloads - the
   same files the phone loads - rather than a copy or a model of them. Nothing
   here stubs an app behaviour; the only stubs are the browser globals the
   modules touch on load (window, localStorage, fetch).

   Usage:
     const { load } = require('./harness');
     const G = await load();            // G.quizBank, G.quizSched, G.data, ...

   Run any audit with plain node from the project root, e.g.
     node pipeline/audits/spacing.js
     node pipeline/audits/spacing.js --json
*/
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'app');

/* the app modules that run without a DOM, in load order */
const HEADLESS = ['methods.js', 'charts.js', 'data.js', 'terms.js', 'history.js',
                  'quiz-bank.js', 'quiz-ideas.js', 'quiz-sched.js'];

let cached = null;

async function load() {
  if (cached) return cached;
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.fetch = (u) => {
    const f = path.join(APP, 'data', String(u).split('/').pop());
    const ok = fs.existsSync(f);
    return Promise.resolve({
      ok, status: ok ? 200 : 404,
      json: () => Promise.resolve(JSON.parse(fs.readFileSync(f, 'utf8')))
    });
  };
  const geval = eval;
  for (const f of HEADLESS) geval(fs.readFileSync(path.join(APP, 'js', f), 'utf8'));
  const G = globalThis.GRA;
  await G.data.load();
  cached = G;
  return G;
}

function bank(G) { return G.quizBank.build(); }

/* every place the payloads know, by code */
function place(G, code) { return G.data.byCode[code] || null; }

function gzipSize(buf) { return zlib.gzipSync(buf, { level: 9 }).length; }

function fileSizes(dir, filter) {
  const out = [];
  (function walk(d, rel) {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const r = rel ? rel + '/' + name : name;
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p, r);
      else if (!filter || filter(r)) {
        const buf = fs.readFileSync(p);
        out.push({ path: r, bytes: st.size, gzip: gzipSize(buf) });
      }
    }
  })(dir, '');
  return out;
}

/* deterministic pseudo-random, so an audit run is reproducible */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* the numbers a sentence states, as written: 1,234 / 12.3% / 1.4x / 8 in 10 */
function numbersIn(text) {
  const out = [];
  const re = /(-?\d[\d,]*(?:\.\d+)?)\s*(%|×|x(?![a-z])|in 10|in every 100)?/gi;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const v = parseFloat(m[1].replace(/,/g, ''));
    if (!isFinite(v)) continue;
    out.push({ raw: m[0].trim(), value: v, unit: (m[2] || '').toLowerCase(), index: m.index });
  }
  return out;
}

function report(name, lines) {
  console.log('=== ' + name + ' ===');
  lines.forEach((l) => console.log(l));
}

module.exports = { load, bank, place, gzipSize, fileSizes, rng, numbersIn, report,
                   ROOT, APP };
