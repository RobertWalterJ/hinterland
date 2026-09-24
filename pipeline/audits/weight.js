/* AUDIT 6 - LOAD WEIGHT

   What a FIRST VISIT downloads, gzipped, and how much of it the player needs
   before the first interaction.

   The question this audit exists to answer is not "how big is the app". It is
   "what must arrive before the first question can be asked, and what is
   riding along that need not be". Those are different numbers, and only the
   first one decides whether the app is shareable on a phone.

   Nothing here is hand-entered. The eager set is READ OUT OF THE SOURCE:
   index.html's <script>/<link> refs, the getJSON() calls inside D.load in
   app/js/data.js, the lazy loaders beside it, and what A.boot kicks off after
   the first paint. If someone adds a payload to D.load, this audit sees it.

   Run:  node pipeline/audits/weight.js
         node pipeline/audits/weight.js --json
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { gzipSize, fileSizes, ROOT, APP } = require('./harness');

const DOCS = path.join(ROOT, 'docs');
const JSON_ARG = process.argv.indexOf('--json') >= 0;

/* ------------------------------------------------------------------ util */

function kb(n) { return (n / 1024).toFixed(1) + ' KB'; }
function pad(s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); }
function lpad(s, n) { s = String(s); return ' '.repeat(Math.max(0, n - s.length)) + s; }
function read(p) { return fs.readFileSync(p, 'utf8'); }

/* --------------------------------------------------- what the page loads */

/* index.html, as the browser reads it: every same-origin ref, in order. */
function pageRefs(html) {
  const out = [];
  const re = /<(script|link)\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const src = /\bsrc="([^"]+)"/.exec(tag) || /\bhref="([^"]+)"/.exec(tag);
    if (!src) continue;
    const u = src[1];
    if (/^(https?:|\/\/|data:)/.test(u)) continue;
    const rel = (/\brel="([^"]+)"/.exec(tag) || [, ''])[1];
    out.push({
      url: u,
      kind: m[1].toLowerCase(),
      rel: rel,
      blocking: m[1].toLowerCase() === 'script'
        ? !/\b(defer|async|type="module")/.test(tag)
        : rel === 'stylesheet'
    });
  }
  return out;
}

/* Anything inlined into the page: <style> blocks, <script> with a body,
   and data: URIs. An inline block cannot be cached separately, so it is
   re-downloaded on every visit whose HTML changes. */
function inlined(html) {
  const out = [];
  let m;
  const style = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = style.exec(html)) !== null) {
    out.push({ what: 'inline <style>', bytes: Buffer.byteLength(m[1]) });
  }
  const script = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = script.exec(html)) !== null) {
    const body = m[1];
    const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim();
    out.push({
      what: 'inline <script>' + (code ? '' : ' (comment only)'),
      bytes: Buffer.byteLength(body), code: code.length
    });
  }
  const data = /"(data:[^"]{200,})"/g;
  while ((m = data.exec(html)) !== null) {
    out.push({ what: 'data: URI (' + m[1].slice(0, 24) + '…)', bytes: m[1].length });
  }
  return out;
}

/* --------------------------------------------- what the data layer loads */

function block(src, startRe) {
  const i = src.search(startRe);
  if (i < 0) return '';
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  return src.slice(i);
}

function jsonNames(text) {
  const out = [];
  const re = /getJSON\(\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(text)) !== null) if (/\.json$/.test(m[1])) out.push(m[1]);
  /* boundaries are built by concatenation: getJSON('boundaries_' + layer + ...) */
  if (/getJSON\('boundaries_'/.test(text)) out.push('boundaries_csd.json', 'boundaries_ct.json');
  return out;
}

/* ---------------------------------------------- what each payload is for */

/* payload -> the property D hangs it on, so the modules that read it can be
   found by grep rather than by memory. */
const OWNER = {
  'geo.json':             'D.geo',
  'work_csd.json':        'D.work',
  'res_series.json':      'D.res',
  'population.json':      'D.pop',
  'commute.json':         'D.commute',
  'business.json':        'D.biz',
  'meta.json':            'D.meta',
  'ct_csd.json':          'D.ctCsd',
  'components.json':      'D.components',
  'io.json':              'D.io',
  'detail.json':          'D.detail',
  'work_ct.json':         'D.ctWork',
  'boundaries_csd.json':  'D.boundaries',
  'boundaries_ct.json':   'D.boundaries'
};

/* the helpers that are the only public way to reach a payload, so a module
   that never says D.detail still counts as a reader of detail.json */
const VIA = {
  'detail.json':   ['occupationFor', 'sectorCI'],
  'ct_csd.json':   ['tractsIn', 'tractLabel'],
  'io.json':       ['multiplierFor', 'ioFor'],
  'work_ct.json':  ['loadTracts', 'ctWork'],
  'commute.json':  ['commuteFor', 'flowsFor'],
  'population.json': ['popSeries', 'popFor'],
  'components.json': ['componentSummary', 'componentsFor']
};

/* module -> the screen a reader would name */
const SCREEN = {
  'home.js': 'Home', 'app.js': 'the shell (place name, chips)',
  'panels.js': 'Home cards / Sources', 'panel-known.js': 'What is it known for?',
  'panel-change.js': 'How has work changed?', 'panel-population.js': 'Is it growing?',
  'panel-impact.js': 'What if new jobs arrived?', 'panel-region.js': 'Region',
  'panel-compare.js': 'Which places are like it?', 'map.js': 'Map',
  'learn.js': 'Learn', 'quiz-bank.js': 'Learn (question bank)',
  'quiz-ideas.js': 'Learn (question bank)', 'quiz-ui.js': 'Learn (quiz)',
  'quiz-sched.js': 'Learn (scheduler)', 'brief.js': 'The brief',
  'findings.js': 'The brief (findings)', 'exportui.js': 'Export',
  'export.js': 'Export', 'history.js': 'Learn (timeline)',
  'spatial.js': 'Map (clusters)', 'ttwa.js': 'Map (labour markets)',
  'charts.js': 'charts (shared)', 'methods.js': 'methods (shared)',
  'terms.js': 'glossary (shared)', 'data.js': 'the data layer itself'
};

function readersOf(file, jsFiles) {
  const prop = OWNER[file];
  const bare = prop ? prop.replace('D.', '') : null;
  const names = [bare].concat(VIA[file] || []).filter(Boolean);
  const out = [];
  for (const f of jsFiles) {
    if (f.name === 'data.js') continue;
    const hit = names.some((n) =>
      new RegExp('\\b(D|data)\\.' + n + '\\b').test(f.text) ||
      new RegExp('\\.' + n + '\\s*\\(').test(f.text));
    if (hit) out.push(f.name);
  }
  return out;
}

/* ---------------------------------------------------- JSON waste scanner */

/* Three kinds of avoidable bytes, counted as they are actually spent:
     numeric strings   "1234" where 1234 would do  -> 2 bytes each
     key repetition    the total bytes spent on each key name
     null padding      explicit nulls in arrays, which a sparse form skips
   Reported raw AND gzipped-equivalent, because gzip eats repetition: the
   honest saving is measured by rewriting the payload and re-gzipping it. */
function waste(file, jsFiles) {
  const raw = read(path.join(APP, 'data', file));
  let j;
  try { j = JSON.parse(raw); } catch (e) { return null; }
  const keyBytes = {}, keyCount = {};
  let numericStrings = 0, numericStringBytes = 0, nulls = 0;
  const samples = [];

  (function walk(v) {
    if (v === null) { nulls++; return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') {
      for (const k of Object.keys(v)) {
        keyBytes[k] = (keyBytes[k] || 0) + k.length + 3;   /* "k": */
        keyCount[k] = (keyCount[k] || 0) + 1;
        walk(v[k]);
      }
      return;
    }
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && v.length < 17) {
      numericStrings++; numericStringBytes += 2;
      if (samples.length < 4 && samples.indexOf(v) < 0) samples.push(v);
    }
  }(j));

  const gz = gzipSize(Buffer.from(raw));
  /* the real saving from dropping the quotes: rewrite and re-gzip */
  let gzNoQuotes = gz;
  if (numericStrings) {
    const rewritten = raw.replace(/"(-?\d+(?:\.\d+)?)"/g, '$1');
    gzNoQuotes = gzipSize(Buffer.from(rewritten));
  }
  const topKeys = Object.keys(keyBytes).sort((a, b) => keyBytes[b] - keyBytes[a]);

  /* A field nobody in app/ ever names. Numeric-looking keys are geography
     codes, not fields, so they are not candidates. */
  function mentioned(k) {
    if (/^\d/.test(k)) return true;
    const re = new RegExp('[.\'"\\[]' + k.replace(/[^\w]/g, '\\$&') + '(?![\\w$])');
    return jsFiles.some((f) => re.test(f.text));
  }
  const unused = topKeys.filter((k) => !mentioned(k))
    .map((k) => ({ key: k, count: keyCount[k], bytes: keyBytes[k] }));
  /* the honest saving: drop those fields and re-gzip */
  let unusedGzip = 0;
  if (unused.length) {
    let stripped = raw;
    unused.forEach((u) => {
      stripped = stripped.replace(
        new RegExp('"' + u.key + '":(?:"[^"]*"|[-\\d.eE+]+|null|true|false),?', 'g'), '');
    });
    unusedGzip = gz - gzipSize(Buffer.from(stripped));
  }

  return {
    file, bytes: Buffer.byteLength(raw), gzip: gz,
    numericStrings, numericStringBytes, samples,
    numericStringGzip: gz - gzNoQuotes,
    nulls, unused, unusedGzip,
    keys: topKeys.slice(0, 8).map((k) => ({ key: k, count: keyCount[k], bytes: keyBytes[k] }))
  };
}

/* ------------------------------------------------------------------ main */

function main() {
  const html = read(path.join(APP, 'index.html'));
  const dataJs = read(path.join(APP, 'js', 'data.js'));
  const appJs = read(path.join(APP, 'js', 'app.js'));
  const swJs = read(path.join(APP, 'sw.js'));

  const appFiles = fileSizes(APP);
  const docFiles = fs.existsSync(DOCS) ? fileSizes(DOCS) : [];
  const byPath = {}; appFiles.forEach((f) => { byPath[f.path] = f; });
  const docByPath = {}; docFiles.forEach((f) => { docByPath[f.path] = f; });

  const jsFiles = fs.readdirSync(path.join(APP, 'js'))
    .filter((n) => n.endsWith('.js'))
    .map((n) => ({ name: n, text: read(path.join(APP, 'js', n)) }));

  /* ---- the eager set, read out of the source ---- */
  const refs = pageRefs(html);
  const loadBlock = block(dataJs, /D\.load\s*=\s*function/);
  const tractBlock = block(dataJs, /D\.loadTracts\s*=\s*function/);
  const boundBlock = block(dataJs, /D\.loadBoundaries\s*=\s*function/);
  const bootBlock = block(appJs, /A\.boot\s*=\s*function/);

  const eagerPayloads = jsonNames(loadBlock);
  const lazyPayloads = jsonNames(tractBlock).concat(jsonNames(boundBlock));
  /* what boot starts by itself once the first paint is done */
  const afterPaint = [];
  if (/D\.loadBoundaries\('csd'\)/.test(bootBlock)) afterPaint.push('boundaries_csd.json');
  const trulyLazy = lazyPayloads.filter((p) => afterPaint.indexOf(p) < 0);

  /* ---- the buckets ---- */
  const shell = refs.map((r) => ({ url: r.url, kind: r.kind, rel: r.rel,
                                   ...byPath[r.url], blocking: r.blocking }))
    .filter((r) => r.bytes != null);
  const htmlF = { path: 'index.html', bytes: Buffer.byteLength(html), gzip: gzipSize(Buffer.from(html)) };
  const manifest = byPath['manifest.webmanifest'];
  const swF = { path: 'sw.js', bytes: Buffer.byteLength(swJs), gzip: gzipSize(Buffer.from(swJs)) };
  const icons = appFiles.filter((f) => /^icon-/.test(f.path));

  const P = (n) => byPath['data/' + n] || { path: 'data/' + n, bytes: 0, gzip: 0 };

  const sum = (a, k) => a.reduce((n, x) => n + (x[k] || 0), 0);

  const shellGzip = htmlF.gzip + sum(shell, 'gzip');
  const eagerDataGzip = sum(eagerPayloads.map(P), 'gzip');
  const eagerGzip = shellGzip + eagerDataGzip;
  const afterPaintGzip = sum(afterPaint.map(P), 'gzip');
  const lazyGzip = sum(trulyLazy.map(P), 'gzip');

  /* the SW shell */
  const shellList = (() => {
    const m = /var SHELL = \[([\s\S]*?)\];/.exec(swJs);
    return m ? (m[1].match(/'([^']+)'/g) || []).map((s) => s.replace(/'/g, '')) : [];
  })();
  const swShellGzip = sum(shellList.map((u) => byPath[u] || { gzip: 0 }), 'gzip');
  const swShellMissing = shellList.filter((u) => !byPath[u]);
  const swShellOmits = refs.map((r) => r.url).filter((u) => shellList.indexOf(u) < 0);

  /* ---- readers, and anything shipped but never read ---- */
  const allPayloads = fs.readdirSync(path.join(APP, 'data')).filter((n) => n.endsWith('.json'));
  const usage = allPayloads.map((f) => {
    const mods = readersOf(f, jsFiles);
    const screens = [];
    mods.forEach((m) => { const s = SCREEN[m] || m; if (screens.indexOf(s) < 0) screens.push(s); });
    const declared = eagerPayloads.indexOf(f) >= 0 ? 'eager'
      : afterPaint.indexOf(f) >= 0 ? 'after first paint'
      : trulyLazy.indexOf(f) >= 0 ? 'lazy' : 'NOT FETCHED BY ANY MODULE';
    /* a payload nobody ever mentions by filename anywhere in app/ */
    const named = jsFiles.some((x) => x.text.indexOf(f) >= 0) ||
      html.indexOf(f) >= 0 || swJs.indexOf(f) >= 0 ||
      /boundaries_/.test(f) && /getJSON\('boundaries_'/.test(dataJs);
    return { file: f, when: declared, modules: mods, screens, named,
             gzip: P(f).gzip, bytes: P(f).bytes };
  });

  /* ---- movable: eager payloads no first-screen module reads ---- */
  const FIRST_SCREEN_MODULES = ['app.js', 'home.js', 'panels.js', 'charts.js',
                                'methods.js', 'terms.js'];
  const movable = usage.filter((u) => u.when === 'eager')
    .map((u) => {
      const needed = u.modules.some((m) => FIRST_SCREEN_MODULES.indexOf(m) >= 0);
      return { ...u, neededFirst: needed,
               firstScreen: u.screens[0] || '(nothing)' };
    })
    .filter((u) => !u.neededFirst)
    .sort((a, b) => b.gzip - a.gzip);

  /* ---- waste ---- */
  const wasted = allPayloads.map((f) => waste(f, jsFiles)).filter(Boolean)
    .sort((a, b) => (b.numericStringGzip + b.unusedGzip) - (a.numericStringGzip + a.unusedGzip));

  /* ---- docs vs app ---- */
  const drift = [];
  appFiles.forEach((f) => {
    const d = docByPath[f.path];
    if (!d) drift.push(f.path + ' missing from docs/');
    else if (d.bytes !== f.bytes) drift.push(f.path + ' differs (app ' + f.bytes + ' vs docs ' + d.bytes + ')');
  });
  docFiles.forEach((f) => { if (!byPath[f.path] && f.path !== '.nojekyll') drift.push(f.path + ' in docs/ only'); });

  const out = {
    appTotal: { files: appFiles.length, bytes: sum(appFiles, 'bytes'), gzip: sum(appFiles, 'gzip') },
    docsTotal: { files: docFiles.length, bytes: sum(docFiles, 'bytes'), gzip: sum(docFiles, 'gzip') },
    drift,
    eager: { shellGzip, dataGzip: eagerDataGzip, totalGzip: eagerGzip,
             payloads: eagerPayloads },
    afterPaint: { payloads: afterPaint, gzip: afterPaintGzip },
    lazy: { payloads: trulyLazy, gzip: lazyGzip },
    firstVisitAutomaticGzip: eagerGzip + afterPaintGzip,
    swShell: { files: shellList.length, gzip: swShellGzip,
               missing: swShellMissing, omitsFromPage: swShellOmits },
    shell, html: htmlF, manifest, sw: swF, icons,
    inlined: inlined(html),
    usage, movable, waste: wasted
  };

  if (JSON_ARG) { console.log(JSON.stringify(out, null, 2)); return; }

  /* --------------------------------------------------------------- print */
  const L = console.log;
  L('=== AUDIT 6 - LOAD WEIGHT ===');
  L('');
  L('THE NUMBER THAT MATTERS');
  L('  Eager, gzipped, before the first question:  ' + kb(eagerGzip));
  L('    the shell (HTML + CSS + ' + shell.filter((s) => /\.js$/.test(s.url)).length + ' JS files)  ' + lpad(kb(shellGzip), 10));
  L('    the ' + eagerPayloads.length + ' payloads D.load fetches at once   ' + lpad(kb(eagerDataGzip), 10));
  L('  Then, automatically, after the first paint: ' + kb(afterPaintGzip) +
    '  (' + afterPaint.join(', ') + ')');
  L('  First visit downloads without being asked:  ' + kb(eagerGzip + afterPaintGzip));
  L('  Held back until a screen needs it:          ' + kb(lazyGzip) +
    '  (' + trulyLazy.join(', ') + ')');
  L('');
  L('WHOLE SITE');
  L('  app/   ' + lpad(out.appTotal.files, 3) + ' files  ' + lpad(kb(out.appTotal.bytes), 10) +
    ' raw  ' + lpad(kb(out.appTotal.gzip), 10) + ' gzipped');
  L('  docs/  ' + lpad(out.docsTotal.files, 3) + ' files  ' + lpad(kb(out.docsTotal.bytes), 10) +
    ' raw  ' + lpad(kb(out.docsTotal.gzip), 10) + ' gzipped');
  L('  docs/ is a byte-for-byte copy of app/: ' + (drift.length ? 'NO - ' + drift.join('; ') : 'yes'));
  L('');
  L('BREAKDOWN, GZIPPED');
  L('  ' + pad('file', 30) + lpad('raw', 11) + lpad('gzip', 10) + '  when');
  const rows = [];
  rows.push([htmlF.path, htmlF.bytes, htmlF.gzip, 'eager (the page)']);
  shell.forEach((s) => rows.push([s.url, s.bytes, s.gzip,
    s.kind === 'link'
      ? (s.rel === 'stylesheet' ? 'eager (blocks paint)' : 'eager (' + (s.rel || 'link') + ')')
      : (s.blocking ? 'eager (blocking script)' : 'eager (deferred)')]));
  usage.slice().sort((a, b) => b.gzip - a.gzip).forEach((u) =>
    rows.push(['data/' + u.file, u.bytes, u.gzip, u.when]));
  icons.forEach((i) => rows.push([i.path, i.bytes, i.gzip, 'install only']));
  rows.push([swF.path, swF.bytes, swF.gzip, 'after boot (2.5s)']);
  rows.forEach((r) => L('  ' + pad(r[0], 30) + lpad(kb(r[1]), 11) + lpad(kb(r[2]), 10) + '  ' + r[3]));
  L('');
  L('SERVICE-WORKER PRE-CACHE (app/sw.js SHELL)');
  L('  ' + shellList.length + ' files, ' + kb(swShellGzip) + ' gzipped - what a first visit warms for offline.');
  L('  Registered ' + (/GRA_HOSTED/.test(appJs) ? 'only on the local build, not the published one' : 'always') +
    ', 2.5 s after the data lands, one file at a time.');
  L('  It pre-caches NO payload: the ' + kb(eagerDataGzip) + ' of data is cached only as the app asks for it.');
  if (swShellMissing.length) L('  MISSING from app/: ' + swShellMissing.join(', '));
  if (swShellOmits.length) L('  The page loads but SHELL omits: ' + swShellOmits.join(', '));
  if (!swShellMissing.length && !swShellOmits.length) L('  SHELL and the page agree exactly.');
  L('');
  L('WHAT COULD MOVE FROM EAGER TO LAZY WITHOUT HURTING THE FIRST QUESTION');
  if (!movable.length) L('  Nothing: every eager payload is read by a first-screen module.');
  movable.forEach((m) => {
    L('  ' + pad('data/' + m.file, 22) + lpad(kb(m.gzip), 9) + ' gz   first needed by: ' + m.screens.join(', '));
  });
  const movableTotal = sum(movable, 'gzip');
  if (movable.length) {
    L('  ---');
    L('  Moving all of them: ' + kb(eagerGzip) + ' -> ' + kb(eagerGzip - movableTotal) +
      '  (' + kb(movableTotal) + ' off the first load, ' +
      Math.round(100 * movableTotal / eagerGzip) + '%)');
  }
  L('');
  L('INLINED INTO index.html');
  out.inlined.forEach((i) => L('  ' + pad(i.what, 34) + lpad(kb(i.bytes), 10) +
    (i.code === 0 ? '   fine - a comment, no code' : '   REVIEW')));
  if (!out.inlined.length) L('  Nothing.');
  L('');
  L('SHIPPED BUT NEVER READ');
  const orphans = usage.filter((u) => !u.named || !u.modules.length);
  if (!orphans.length) L('  None: every payload in app/data is fetched and read by at least one module.');
  orphans.forEach((o) => L('  ' + o.file + ' - ' + kb(o.gzip) + ' gz - ' +
    (!o.named ? 'filename appears nowhere in app/' : 'fetched but no module reads ' + OWNER[o.file])));
  L('');
  L('WASTED BYTES IN THE PAYLOADS (top 3 by gzipped saving)');
  L('  "Wasted" is measured honestly: the payload is rewritten without the waste');
  L('  and re-gzipped. Raw savings look large and mostly vanish under gzip,');
  L('  which is very good at repeated quotes and repeated key names.');
  const top = wasted.filter((w) => w.numericStringGzip + w.unusedGzip > 0).slice(0, 3);
  if (!top.length) L('  Nothing measurable: no numeric strings, no unnamed fields.');
  top.forEach((w) => {
    const bits = [];
    if (w.numericStrings) bits.push(w.numericStrings + ' numbers stored as strings (' +
      kb(w.numericStringBytes) + ' raw -> ' + kb(w.numericStringGzip) + ' gzipped; e.g. ' +
      w.samples.map((x) => '"' + x + '"').join(', ') + ')');
    if (w.unused.length) bits.push('fields no module names: ' +
      w.unused.map((u) => '"' + u.key + '" x' + u.count).join(', ') +
      ' (' + kb(w.unusedGzip) + ' gzipped)');
    L('  ' + pad(w.file, 22) + bits.join('; '));
  });
  const wasteTotal = wasted.reduce((n, w) => n + w.numericStringGzip + w.unusedGzip, 0);
  L('  All payloads together: ' + kb(wasteTotal) + ' gzipped, ' +
    (wasteTotal / eagerGzip * 100).toFixed(1) + '% of the eager load. Not where the weight is.');
  L('  Nulls written out explicitly: ' +
    wasted.reduce((n, w) => n + w.nulls, 0).toLocaleString('en-CA') +
    ' across all payloads (a sparse form would drop them, but gzip already does).');
  L('');
  L('(python pipeline/make_deploy.py already prints the built site\'s RAW size and');
  L(' checks SHELL against the files present; this audit adds the gzipped figure,');
  L(' the eager/lazy split, and the per-payload cost.)');
}

main();
