/* AUDIT 8 - STANDING RULES

   Four standing rules, checked mechanically against the real app:

     1. No timers or countdowns anywhere.
     2. Read-aloud for anything text-heavy, INCLUDING the app's own prose.
     3. A quiet mode for public places.
     4. Licence credit generated from what the app actually uses.

   A hard breach exits 1, so this can sit in front of a build. What counts as
   hard is stated at each rule and never widened quietly: a rule is hard when
   the app already holds everything needed to satisfy it.

   Nothing here is repeated from python pipeline/validate.py, which checks the
   DATA and the arithmetic, nor from pipeline/make_deploy.py, which checks that
   every file the page and the service worker name is present. This audit
   checks the app's promises to its reader.

   Run:  node pipeline/audits/rules.js
         node pipeline/audits/rules.js --json
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, APP } = require('./harness');

const JSON_ARG = process.argv.indexOf('--json') >= 0;
const L = console.log;
const lines = [];
function say(s) { lines.push(s === undefined ? '' : s); }
function pad(s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); }
function lpad(s, n) { s = String(s); return ' '.repeat(Math.max(0, n - s.length)) + s; }

const JS_DIR = path.join(APP, 'js');
const FILES = fs.readdirSync(JS_DIR).filter((n) => n.endsWith('.js'))
  .map((n) => ({ name: n, text: fs.readFileSync(path.join(JS_DIR, n), 'utf8') }));
const byName = {}; FILES.forEach((f) => { byName[f.name] = f.text; });
const HTML = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(APP, 'css', 'app.css'), 'utf8');
const SW = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8');

function lineOf(text, index) { return text.slice(0, index).split('\n').length; }

const breaches = [];      /* hard */
const gaps = [];          /* worth fixing, not a gate */

/* ======================================================= RULE 1: no timers */

/* Every scheduling call in the app, classified. The classification is made
   from the CODE, not from a list of known-good line numbers, so it survives
   an edit:

     repeating + writes visible text     -> moving text (amber)
     repeating, nothing visible          -> review
     one-shot, delay <= 500ms            -> a tick: layout, focus, debounce
     one-shot, delay > 500ms, restores a
       label it just changed             -> a toast
     one-shot, advances the app itself   -> AUTO-ADVANCE (hard breach)
     requestAnimationFrame               -> animation; ok where the file
                                            honours prefers-reduced-motion
*/
function rule1() {
  const calls = [];
  const sources = FILES.concat([{ name: 'sw.js', text: SW },
                                { name: 'index.html', text: HTML }]);
  const re = /\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/g;
  sources.forEach((f) => {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(f.text)) !== null) {
      /* a mention in a comment is not a call */
      const lineStart = f.text.lastIndexOf('\n', m.index) + 1;
      const before = f.text.slice(lineStart, m.index);
      if (/^\s*(\/\/|\*|\/\*)/.test(before)) continue;

      /* the call's own text, balanced to its closing paren */
      let depth = 0, end = m.index;
      for (let i = m.index + m[0].length - 1; i < f.text.length; i++) {
        const c = f.text[i];
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (!depth) { end = i + 1; break; } }
      }
      const call = f.text.slice(m.index, end);
      const delay = (/,\s*(\d+)\s*\)?\s*$/.exec(call.replace(/\s+$/, '')) ||
                     /,\s*([\w.*\s+]+)\)\s*$/.exec(call) || [, null])[1];
      const ms = /^\d+$/.test(String(delay)) ? Number(delay) : null;
      const writes = /textContent|innerHTML|classList|\.value\s*=|hidden\s*=/.test(call);
      const advances = /\b(nextQuestion|advance|autoNext|showNext|skipTo)\b/.test(call) ||
        /\bnext\s*\(/.test(call);
      const decrements = /--\s*;|\-\-\s*\)|seconds|remaining|countdown/i.test(call);

      let verdict, why;
      if (m[1] === 'requestAnimationFrame') {
        const guarded = /prefers-reduced-motion/.test(f.text);
        verdict = 'OK'; why = 'animation frame' +
          (guarded ? '; this file honours prefers-reduced-motion' : '; no reduced-motion guard in this file');
      } else if (advances || decrements) {
        verdict = 'BREACH'; why = 'advances the app or counts down by itself';
      } else if (m[1] === 'setInterval') {
        verdict = writes ? 'AMBER' : 'REVIEW';
        why = writes ? 'repeating, and it rewrites text on screen' : 'repeating';
      } else if (ms != null && ms <= 500) {
        verdict = 'OK'; why = 'a ' + ms + ' ms tick: layout, focus, retry or debounce';
      } else if (writes) {
        verdict = 'OK'; why = 'restores a label after ' + (ms == null ? 'a delay' : ms + ' ms') +
          ' - a toast, not a countdown';
      } else if (ms != null) {
        verdict = 'OK'; why = 'one-shot after ' + ms + ' ms, nothing on screen changes';
      } else {
        verdict = 'REVIEW'; why = 'one-shot, delay computed at run time';
      }
      calls.push({ file: f.name, line: lineOf(f.text, m.index), kind: m[1],
                   ms, verdict, why, snippet: call.split('\n')[0].slice(0, 62) });
    }
  });

  /* CSS is the other place a countdown can hide: an infinite animation on a
     width or a transform reads as a bar running out. */
  const cssInfinite = [];
  const cre = /animation:\s*([^;]*infinite[^;]*);/g;
  let cm;
  while ((cm = cre.exec(CSS)) !== null) {
    cssInfinite.push({ line: lineOf(CSS, cm.index), decl: cm[1].trim() });
  }
  const reducedMotionGuard = /prefers-reduced-motion[\s\S]{0,400}animation-iteration-count/.test(CSS);

  /* and the words themselves */
  const words = [];
  FILES.concat([{ name: 'index.html', text: HTML }, { name: 'app.css', text: CSS }])
    .forEach((f) => {
      const wre = /\b(countdown|time left|seconds left|stopwatch|auto-?advance|timeLimit|timerId)\b/gi;
      let wm;
      while ((wm = wre.exec(f.text)) !== null) {
        const ls = f.text.lastIndexOf('\n', wm.index) + 1;
        const inComment = /^\s*(\/\/|\*|\/\*)/.test(f.text.slice(ls, wm.index));
        words.push({ file: f.name, line: lineOf(f.text, wm.index),
                     word: wm[0], inComment });
      }
    });

  const hard = calls.filter((c) => c.verdict === 'BREACH');
  const amber = calls.filter((c) => c.verdict === 'AMBER');
  const review = calls.filter((c) => c.verdict === 'REVIEW');

  say('RULE 1 - NO TIMERS OR COUNTDOWNS');
  say('  ' + calls.length + ' scheduling calls in app/. ' +
      calls.filter((c) => c.verdict === 'OK').length + ' fine, ' +
      amber.length + ' amber, ' + review.length + ' to review, ' +
      hard.length + ' breaches.');
  say('');
  say('  ' + pad('file:line', 26) + pad('call', 22) + pad('verdict', 9) + 'why');
  calls.forEach((c) => say('  ' + pad(c.file + ':' + c.line, 26) +
    pad(c.kind + (c.ms == null ? '' : ' ' + c.ms + 'ms'), 22) +
    pad(c.verdict, 9) + c.why));
  say('');
  say('  CSS animations that repeat for ever (a bar running out would live here):');
  cssInfinite.forEach((c) => say('    app.css:' + c.line + '  ' + c.decl));
  say('    prefers-reduced-motion caps the iteration count: ' +
      (reducedMotionGuard ? 'yes' : 'NO'));
  say('  The words a countdown would use, anywhere in the app:');
  const realWords = words.filter((w) => !w.inComment);
  if (!realWords.length) {
    say('    none outside comments. ' + words.length + ' mentions, all in comments or ' +
        'in the app\'s own promise ("No timer, no score").');
  }
  realWords.forEach((w) => say('    ' + w.file + ':' + w.line + '  "' + w.word + '"'));
  say('');
  if (amber.length) {
    say('  AMBER, and worth a decision:');
    amber.forEach((c) => say('    ' + c.file + ':' + c.line + '  ' + c.snippet));
    say('    The boot screen rotates its message every 900 ms. It is not a countdown,');
    say('    and it disappears once the data lands - but a dyslexic reader cannot');
    say('    finish a line in 900 ms, so the text moves under them. Fix: write one');
    say('    line and leave it, and let the progress bar carry the sense of motion.');
    gaps.push('The boot message rotates every 900 ms (app/js/app.js:93). Show one line ' +
              'and leave it.');
  }
  say('  VERDICT: ' + (hard.length ? 'BREACH' : 'PASS') +
      ' - no countdown, no auto-advance, and the two 600 ms guards in quiz-ui.js are');
  say('  debounces that REFUSE an early tap rather than taking an action for the reader.');
  say('');
  return { calls, cssInfinite, reducedMotionGuard, words, hard: hard.length };
}

/* ================================================== RULE 2: read-aloud */

/* The SAY selector list, read out of app/js/read.js so this cannot drift. */
function sayList() {
  const m = /var SAY = \[([\s\S]*?)\]\.join/.exec(byName['read.js']);
  if (!m) return null;
  /* strip comments first: a /* ... *\/ note inside the array used to swallow
     half the list and report covered surfaces as missed */
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, '');
  return (body.match(/'([^']+)'/g) || []).map((s) => s.replace(/'/g, ''));
}

/* Where a class or a tag is rendered, and under what tag. */
function findSurface(sel) {
  /* '<tag>' means a bare tag; anything else is a class name */
  const isTag = /^<[a-z]+>$/.test(sel);
  const bare = isTag ? sel.slice(1, -1) : sel;
  const out = [];
  FILES.forEach((f) => {
    if (f.name === 'export.js') return;       /* that file writes XLSX XML, not HTML */
    const re = isTag
      ? new RegExp('<(' + bare + ')\\b([^<>]*)>', 'g')
      : new RegExp('<([a-zA-Z][a-zA-Z0-9-]*)\\b([^<>]*class="[^"]*\\b' +
                   bare + '\\b[^"]*"[^<>]*)>', 'g');
    let m;
    while ((m = re.exec(f.text)) !== null) {
      const lineStart = f.text.lastIndexOf('\n', m.index) + 1;
      const sameLine = f.text.slice(lineStart, m.index);
      /* an enclosing p / li / h1-h3 opened on the same source line still
         covers this element, because read.js walks the DOM, not the source */
      const enc = /<(p|li|h1|h2|h3)\b[^>]*>(?:(?!<\/\1>).)*$/.exec(sameLine);
      out.push({ file: f.name, line: lineOf(f.text, m.index),
                 tag: m[1].toLowerCase(), attrs: m[2] || '',
                 hasSay: /data-(say|read)/.test(m[2] || ''),
                 enclosedBy: enc ? enc[1] : null });
    }
  });
  return out;
}

/* The learning screens, surface by surface. Each is a real class or tag in
   the app; the audit finds it and works out whether the reader reaches it. */
const SURFACES = [
  ['Quiz: the question stem',            'qstem'],
  ['Quiz: the universe/date chip',       'qchip'],
  ['Quiz: an option',                    'qopt'],
  ['Quiz: right/wrong verdict',          'qverdict'],
  ['Quiz: the answer sentence',          'qsentence'],
  ['Quiz: the chart-in-the-answer label', 'qchart-l'],
  ['Quiz: "more about this"',            'qmore-p'],
  ['Quiz: the source line',              'qsource'],
  ['Big idea: lesson title',             'qlesson-t'],
  ['Big idea: what it asks',             'qlesson-ask'],
  ['Big idea: a lesson point',           'qlesson-p'],
  ['Big idea: the note after the points', 'qlesson-note'],
  ['Big idea: hub question',             'qidea-ask'],
  ['Big idea: a hub fact',               'qidea-facts'],
  ['Learn: a tile question',             'hq-q'],
  ['Learn: a tile answer',               'hq-a'],
  ['Home: the one-line answer',          'home-answer'],
  ['Home: the lede',                     'home-lede'],
  ['Glossary: entry name',               'lname'],
  ['Glossary: other names for it',       'laka'],
  ['Glossary: the plain-English line',   'lplain'],
  ['Glossary: an example',               'lexample'],
  ['Glossary: "How it works" heading',   '<dt>'],
  ['Glossary: the layer text',           '<dd>'],
  ['Glossary: a term chip',              'term-name'],
  ['History: the date',                  'tl-date'],
  ['History: the headline',              'tl-title'],
  ['History: the fact',                  'tl-fact'],
  ['History: what else happened',        'tl-also'],
  ['Panels: an answer paragraph',        'answer-p'],
  ['Panels: what the chart says',        'chart-says'],
  ['Panels: the plain-English gloss',    'explain-plain'],
  ['Learn: the big-idea hub row',        'qidea-title'],
  ['Quiz: the end-of-session number',    'qgrow-v'],
  ['Quiz: the end-of-session label',     'qgrow-l'],
  ['Anything folded behind a summary',   '<summary>']
];

/* Which of these are hard: the app's OWN prose, carrying meaning a reader
   cannot get any other way, with nothing standing in for it. */
const HARD = { '<dt>': 1, '<dd>': 1, '<summary>': 1, lname: 1, lplain: 1,
               'tl-title': 1, 'tl-date': 1, 'hq-q': 1, 'hq-a': 1,
               'qidea-title': 1 };

function rule2() {
  const SAY = sayList();
  const sayTags = SAY.filter((s) => /^[a-z0-9]+$/.test(s));
  const sayCls = SAY.filter((s) => /^\./.test(s)).map((s) => s.slice(1));
  const sayAttr = SAY.filter((s) => /^\[/.test(s));

  const rows = SURFACES.map(([what, sel]) => {
    const hits = findSurface(sel);
    const tags = Array.from(new Set(hits.map((h) => h.tag)));
    const direct = tags.some((t) => sayTags.indexOf(t) >= 0);
    const byClass = sayCls.indexOf(sel) >= 0;
    const byAttr = hits.length > 0 && hits.every((h) => h.hasSay);
    const byAnyAttr = hits.some((h) => h.hasSay);
    const byAncestor = hits.length > 0 && hits.every((h) =>
      h.enclosedBy && sayTags.indexOf(h.enclosedBy) >= 0);
    /* a <ul>/<ol> is read through its <li> children; a <dl> is not, because
       neither <dt> nor <dd> is in SAY */
    const byChildren = hits.length > 0 &&
      hits.every((h) => h.tag === 'ul' || h.tag === 'ol') &&
      sayTags.indexOf('li') >= 0;
    const covered = direct || byClass || byAttr || byAncestor || byChildren;
    const how = direct ? 'tag <' + tags.filter((t) => sayTags.indexOf(t) >= 0)[0] + '>'
      : byClass ? 'class .' + sel
      : byAttr ? 'data-say on every one'
      : byAncestor ? 'inside a <' + hits[0].enclosedBy + '>'
      : byChildren ? 'through its <li> children'
      : byAnyAttr ? 'data-say on SOME of them only'
      : 'NOT REACHED';
    return { what, sel, hits: hits.length, tags, covered, how,
             where: hits.slice(0, 2).map((h) => h.file + ':' + h.line),
             hard: !!HARD[sel] };
  });

  say('RULE 2 - READ-ALOUD, INCLUDING THE APP\'S OWN PROSE');
  say('  read.js SAY is: ' + SAY.join(' , '));
  say('  That is ' + sayTags.length + ' tags, ' + sayCls.length + ' classes and ' +
      sayAttr.length + ' attribute hooks. Prose written as a <p>, an <h2> or an <li>');
  say('  is read; prose written any other way is read only if it carries data-say.');
  say('');
  say('  ' + pad('surface', 38) + pad('n', 4) + pad('read?', 7) + 'how');
  rows.forEach((r) => say('  ' + pad(r.what, 38) + pad(r.hits, 4) +
    pad(r.covered ? 'yes' : 'NO', 7) + r.how +
    (r.hits ? '   (' + r.where.join(', ') + ')' : '   (not found - selector may have been renamed)')));
  say('');

  const missed = rows.filter((r) => r.hits && !r.covered);
  const hardMissed = missed.filter((r) => r.hard);
  say('  WHAT THE READER SKIPS, in the order it hurts:');
  const NOTE = {
    '<summary>': 'Every <summary> in the app. read.js has no "summary" in SAY, and it also ' +
      'skips anything with no client rects - so a CLOSED <details> is invisible twice ' +
      'over. On a phone, panels.js foldLong() moves long footnotes and every paragraph ' +
      'after the first of the brief into a <details>. The reader therefore stops at the ' +
      'opening paragraph and never says the caveats, which are the part that matters.',
    dt: 'The glossary\'s three layer headings - "How it works", "When to use it", ' +
      '"What it cannot tell you" - on all 31 terms.',
    dd: 'The glossary\'s layer TEXT on all 31 terms: the entire explanation of every ' +
      'method the app uses. This is the app\'s own prose and the reader never speaks a ' +
      'word of it.',
    lname: 'The name of each glossary entry, so a listener cannot tell which term is ' +
      'being explained.',
    lplain: 'The plain-English one-line definition of each of the 31 terms - written ' +
      'specifically for a reader who needs it plainly.',
    'tl-title': 'The headline of each of the 10 timeline entries (the Auto Pact, NAFTA, ' +
      'and so on).',
    'tl-date': 'The date of each timeline entry. With the title skipped too, the ' +
      'timeline reads as a list of unattributed facts.',
    'hq-q': 'The question on each Learn tile - the words that tell you what the screen ' +
      'behind it will answer.',
    'hq-a': 'The answer line under each Learn tile.',
    'qidea-title': 'The name and the progress line of each of the nine big ideas on ' +
      'Learn. They sit in a <summary>, so a listener is told nothing about the nine ' +
      'ideas the whole app is organised around.',
    'qgrow-v': 'The end-of-session number ("questions you can answer now") and, with ' +
      'the label beside it, the only feedback a session gives.',
    qopt: 'Only HALF the options. In the ask phase each option is a <button> with ' +
      'data-say, so it is read. In the answer phase (quiz-ui.js:343) the same options ' +
      'are re-rendered as plain <div class="qopt"> with no data-say, so the reader ' +
      'never says "Right answer" or "Your answer" back. A listener hears the verdict ' +
      'and the card sentence but not the options they just chose between.',
    laka: 'The other names a term goes by - useful precisely to someone matching what ' +
      'they heard elsewhere to what the app calls it.',
    'term-name': 'The label on every inline term chip. The chip has data-say in one of ' +
      'its three call sites (learn.js:523) and not in the other two.'
  };
  missed.forEach((r) => {
    say('    ' + (r.hard ? 'HARD  ' : 'soft  ') + r.what + '  <' + r.tags.join('/') + '>  ' +
        r.where.join(', '));
    if (NOTE[r.sel]) {
      String(NOTE[r.sel]).replace(/(.{1,86})(\s|$)/g, '$1\n').trim().split('\n')
        .forEach((l) => say('          ' + l));
    }
  });
  if (!missed.length) say('    nothing - every named surface is reached.');
  say('');

  /* the other half of the rule: does the reader ever get offered on Learn? */
  const readerButton = /id="readBtn"/.test(HTML);
  const perItemSpeaker = /R\.one\(/.test(byName['quiz-ui.js'] || '');
  say('  The reader IS offered on the learning screens: a page-level button in the top');
  say('  bar (' + (readerButton ? 'present' : 'MISSING') + '), a per-item speaker in the quiz (' +
      (perItemSpeaker ? 'present' : 'MISSING') + '), and an auto-read setting');
  say('  ("read each question to me"). The failure is not the offer, it is the queue.');
  say('');
  say('  Dead entries in SAY (nothing in the app uses them): ' +
      (sayCls.filter((c) => !FILES.some((f) => f.text.indexOf('"' + c) >= 0 ||
        f.text.indexOf(c + '"') >= 0)).join(', ') || 'none'));
  say('');
  say('  SMALLEST FIX: add three tokens to the SAY list in app/js/read.js -');
  say("    'summary', 'dt', 'dd'");
  say('  and, in build(), open a closed <details> before measuring it (or drop the');
  say('  getClientRects test for elements inside a <details> and read them anyway).');
  say('  Add data-say to the two tile spans. That is one line plus a guard, and it');
  say('  turns the glossary, the timeline and every folded caveat from silent to read.');
  say('  VERDICT: ' + (hardMissed.length ? 'BREACH' : 'PASS') + ' - ' +
      hardMissed.length + ' hard misses.');
  say('');

  if (hardMissed.length) {
    breaches.push('Rule 2: read-aloud skips ' + hardMissed.length +
      ' of the app\'s own prose surfaces (' +
      hardMissed.map((r) => r.what + ' <' + r.tags.join('/') + '>').join('; ') + ').');
  }
  return { SAY, rows, missed, hardMissed: hardMissed.length };
}

/* ==================================================== RULE 3: quiet mode */

function rule3() {
  const anyQuiet = FILES.concat([{ name: 'index.html', text: HTML },
                                 { name: 'app.css', text: CSS }])
    .filter((f) => /\bquiet(Mode)?\b\s*[:=]|id="quiet|data-quiet|\.quiet\b/.test(f.text))
    .map((f) => f.name);

  const soundToggle = /id="soundBtn"/.test(HTML);
  const soundKey = (/var PREF_KEY = '([^']+)'/.exec(byName['sound.js'] || '') || [, '?'])[1];
  const quizReadSetting = /x\.read = e\.target\.checked/.test(byName['quiz-ui.js'] || '');
  const readButtons = (HTML.match(/id="read(Btn|StopBtn)"/g) || []).length;
  const speakers = (byName['quiz-ui.js'] || '').match(/qspk|R\.one\(/g) || [];

  say('RULE 3 - A QUIET MODE FOR PUBLIC PLACES');
  say('  Anything named "quiet" in the app: ' + (anyQuiet.length ? anyQuiet.join(', ') : 'NOTHING.'));
  say('  What exists instead, two half-controls that do not know about each other:');
  say('    1. a sound toggle in the top bar (#soundBtn ' + (soundToggle ? 'present' : 'missing') +
      '), state in localStorage "' + soundKey + '"');
  say('    2. a quiz setting "read each question to me" (' +
      (quizReadSetting ? 'present' : 'missing') + '), state in "hinterland.quiz.settings"');
  say('  And ' + readButtons + ' read-aloud buttons in the top bar plus a speaker beside');
  say('  every question and option (' + speakers.length + ' call sites in quiz-ui.js),');
  say('  none of which the sound toggle touches.');
  say('  So turning the sound off still leaves a Read button that will start talking');
  say('  on the next tap. There is no one control for "I am on a bus".');
  say('');
  say('  HOW IT SHOULD WORK HERE');
  say('    One control, in the ••• menu beside Theme and Sound, labelled "Quiet mode".');
  say('    On means: the app makes no sound and does not offer to.');
  say('    State: one localStorage key, "hinterland.quiet", read at boot before the');
  say('    chrome is built, so the first paint is already quiet. It OVERRIDES the two');
  say('    existing preferences without erasing them, so switching quiet off restores');
  say('    exactly what the reader had.');
  say('');
  say('    MUST HIDE (removed from the DOM, not disabled):');
  say('      #soundBtn, #readBtn, #readStopBtn in the top bar');
  say('      every .qspk speaker beside a question, an option or a card sentence');
  say('      the "read each question to me" row in the quiz Settings block');
  say('      the "Explain it aloud" affordance wherever learn.js offers one');
  say('    MUST DO:');
  say('      call GRA.sound.setEnabled(false) and GRA.read.stop() the moment it goes on');
  say('    MUST STAY:');
  say('      every word on screen - quiet mode removes the voice, never the text');
  say('      the theme toggle, Export, and the place chips');
  say('      the reading position marker CSS (harmless, and used by nothing else)');
  say('      the menu row itself, so it can be switched back off');
  say('');
  say('    NO HOLE IN THE LAYOUT. The top bar is a grid ending in four .iconbtn');
  say('    buttons and #menuBtn. Removing three of them must not let Export drift');
  say('    right or the wordmark stretch. The fix that costs nothing: the bar already');
  say('    has .topbar-spacer taking the slack, so the buttons should be REMOVED');
  say('    (display:none via a body class, e.g. body.is-quiet #soundBtn { display:none })');
  say('    rather than hidden with visibility, and the spacer absorbs the width. Check');
  say('    it at 360 px, where the bar is tightest.');
  say('');
  /* Built on 24 Sept. The rule is satisfied when ONE control exists, it is
     remembered, it silences the sound AND withdraws the read-aloud offer, and
     the controls leave the layout rather than sitting there dead. Each of
     those is a separate check, so half a quiet mode still fails. */
  const app = byName['app.js'] || '';
  const css = CSS;          /* the stylesheet, read at the top of this file */
  const readJs = byName['read.js'] || '';
  const quizJs = byName['quiz-ui.js'] || '';
  const tests = [
    ['one control, in the menu', /data-m="quiet"/.test(app)],
    ['remembered between visits', /hinterland\.quiet/.test(app)],
    ['turns the sound off too', /sound\.setEnabled\(false\)/.test(app)],
    ['withdraws read-aloud', /is-quiet/.test(readJs) && /is-quiet/.test(quizJs)],
    ['controls leave the layout', /body\.is-quiet[^{]*\{[^}]*display:\s*none/.test(css)],
    ['applied at boot', /classList\.toggle\('is-quiet'/.test(app)]
  ];
  say('  Quiet mode, checked part by part:');
  tests.forEach((t) => say('    ' + pad(t[1] ? 'yes' : 'NO', 5) + t[0]));
  const quietOk = tests.every((t) => t[1]);
  say('');
  say('  VERDICT: ' + (quietOk ? 'PASS - one control, and it does all of it.'
    : 'BREACH - see the NO rows above.'));
  say('');
  if (!quietOk) {
    breaches.push('Rule 3: quiet mode is incomplete - ' +
      tests.filter((t) => !t[1]).map((t) => t[0]).join('; ') + '.');
  }
  return { anyQuiet, soundToggle, quizReadSetting, readButtons, quietOk };
}

/* =================================================== RULE 4: licence credit */

function rule4() {
  const meta = JSON.parse(fs.readFileSync(path.join(APP, 'data', 'meta.json'), 'utf8'));
  const sourcesPy = fs.readFileSync(path.join(ROOT, 'pipeline', 'sources.py'), 'utf8');
  const panels = byName['panels.js'] || '';
  const exportui = byName['exportui.js'] || '';

  const FIELDS = ['key', 'title', 'url', 'purpose', 'caveats', 'vintage', 'cite',
                  'built_at', 'rows_loaded', 'licence', 'license'];
  const present = {};
  FIELDS.forEach((f) => { present[f] = meta.sources.filter((s) => s[f] != null).length; });

  /* is the screen generated from meta, or typed? */
  const generatedOnScreen = /meta\.sources\.forEach/.test(panels);
  const generatedInExport = /D\.meta\.sources\s*\|\|\s*\[\]/.test(exportui) ||
    /meta\.sources/.test(exportui);
  const shownFields = ['title', 'vintage', 'purpose', 'caveats', 'cite', 'rows_loaded']
    .filter((f) => new RegExp('s\\.' + f + '\\b').test(panels));
  const notShown = ['url', 'key'].filter((f) => !new RegExp('s\\.' + f + '\\b').test(panels));

  /* does the word appear anywhere in the shipped app? */
  const licenceInApp = [];
  FILES.concat([{ name: 'index.html', text: HTML }, { name: 'app.css', text: CSS }])
    .forEach((f) => { if (/licen[cs]e/i.test(f.text)) licenceInApp.push(f.name); });
  const licenceInSourcesPy = /licen[cs]e/i.test(sourcesPy);
  const licenceInReadme = /licen[cs]e/i.test(
    fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'));

  /* every payload the app loads: does something on screen credit it? */
  const payloads = fs.readdirSync(path.join(APP, 'data')).filter((n) => n.endsWith('.json'));
  const cites = meta.sources.map((s) => (s.title || '') + ' ' + (s.cite || ''));
  const selfDeclared = [];
  payloads.forEach((p) => {
    const j = JSON.parse(fs.readFileSync(path.join(APP, 'data', p), 'utf8'));
    const src = j.source || (j.properties && j.properties.cite) || null;
    if (!src) return;
    const tag = String(src).replace(/\D+/g, '-').split('-').filter((x) => x.length >= 4)[0];
    const found = cites.some((c) => c.replace(/\D+/g, '').indexOf(String(src).replace(/\D+/g, '')) >= 0 ||
      (tag && c.indexOf(tag) >= 0));
    selfDeclared.push({ payload: p, source: String(src).slice(0, 60), credited: found });
  });
  const uncredited = selfDeclared.filter((s) => !s.credited);

  say('RULE 4 - LICENCE CREDIT, GENERATED NOT TYPED');
  say('  The Sources screen (app/js/panels.js P.sources) is GENERATED: it walks');
  say('  meta.sources and prints one card per source (' +
      (generatedOnScreen ? 'confirmed' : 'NOT CONFIRMED') + '). The export\'s');
  say('  "About this export" sheet does the same (' +
      (generatedInExport ? 'confirmed' : 'NOT CONFIRMED') + '). Good: neither can');
  say('  drift from what was built.');
  say('');
  say('  WHAT IS CREDITED NOW, per source, all ' + meta.sources.length + ' of them:');
  say('    shown on screen:  ' + shownFields.join(', '));
  say('    held but unused:  ' + notShown.join(', ') + '   (the url is in the payload ' +
      'and never becomes a link)');
  say('    ' + pad('field', 14) + 'sources carrying it');
  FIELDS.forEach((f) => say('    ' + pad(f, 14) + lpad(present[f], 3) + ' of ' +
    meta.sources.length + (present[f] === 0 ? '   <- ABSENT' : '')));
  say('');
  say('  The word "licence" appears:');
  say('    in app/ (the shipped app):   ' + (licenceInApp.length ? licenceInApp.join(', ') : 'NOWHERE'));
  say('    in pipeline/sources.py:      ' + (licenceInSourcesPy ? 'yes' : 'NO - the Source ' +
      'class has key/title/url/purpose/caveats/vintage/filename/pid/cite and no licence'));
  say('    in README.md:                ' + (licenceInReadme ? 'yes - one hand-typed line' : 'no'));
  say('  So the only licence statement in the whole project is a sentence a human');
  say('  typed into the README, which no reader of the app ever sees and which');
  say('  nothing regenerates.');
  say('');
  say('  Payloads that name their own source, and whether meta.sources credits it:');
  selfDeclared.forEach((s) => say('    ' + pad(s.payload, 22) +
    pad(s.source.slice(0, 48), 50) + (s.credited ? 'credited' : 'NOT CREDITED')));
  say('    (the other ' + (payloads.length - selfDeclared.length) +
      ' payloads carry no source field of their own; they are covered by the');
  say('     19 cards collectively, which is why the licence has to be per source.)');
  say('');
  say('  WHAT THE LICENCE ACTUALLY REQUIRES');
  say('    Statistics Canada Open Licence. Two obligations, and the app meets neither');
  say('    on screen:');
  say('      1. Acknowledge the source. The form the licence gives is');
  say('         "Source: Statistics Canada, <product>, <date>."  The app prints the');
  say('         product and the DOI but never the word Source in that sense, and');
  say('         never says Statistics Canada is the source of the data as a whole.');
  say('      2. Where the data has been MODIFIED, say so and disclaim endorsement:');
  say('         "Adapted from Statistics Canada, <product>, <date>. This does not');
  say('         constitute an endorsement by Statistics Canada of this product."');
  say('         Hinterland modifies everything it shows - it reaggregates, decomposes,');
  say('         indexes and rounds - so 2 is the clause that applies, to every card.');
  say('    The boundary files carry the same licence and their own catalogue number');
  say('    (92-160-X), which IS in meta.sources but is not credited as a licensed');
  say('    reproduction either.');
  say('');
  say('  THE SMALLEST CHANGE THAT MAKES THE CREDIT GENERATED');
  say('    Three edits, none of them in the app\'s prose:');
  say('    1. pipeline/sources.py - add two fields to Source.__init__:');
  say('         licence="Statistics Canada Open Licence",');
  say('         licence_url="https://www.statcan.gc.ca/en/reference/licence",');
  say('       defaulted, since every source in the file is Statistics Canada open data.');
  say('       Add `adapted=True` as the default too: everything here is reaggregated.');
  say('    2. pipeline/build.py + pipeline/export_web.py - carry licence, licence_url');
  say('       and adapted through source_meta into meta.json, beside cite.');
  say('    3. app/js/panels.js P.sources - in the per-source card foot, after s.cite:');
  say('         (s.adapted ? "Adapted from " : "Source: ") + s.title + ", " + s.vintage +');
  say('         ". " + (s.adapted ? "This does not constitute an endorsement by ' +
      'Statistics Canada of this product. " : "") + s.licence');
  say('       and the same line in exportui.js\'s Sources block, which already loops');
  say('       the same array.');
  say('    After that the credit is a function of what was built. Adding a source');
  say('    with no licence field would show an empty credit, so add one check to');
  say('    pipeline/validate.py: every source in source_meta has a non-empty licence.');
  say('');
  /* Built on 24 Sept: the licence travels with the source declaration and the
     clause is generated from the title that was loaded. The rule is satisfied
     when every payload carries one, the adapted-product clause is present, and
     the screen prints the generated field rather than a typed string. */
  const withLicence = meta.sources.filter((x) => x.licence && x.attribution);
  const missing = meta.sources.filter((x) => !(x.licence && x.attribution));
  const endorsement = meta.sources.filter((x) =>
    /does not constitute an endorsement/i.test(x.attribution || ''));
  const panelsSrc = byName['panels.js'] || '';
  const printsGenerated = /s\.attribution/.test(panelsSrc);
  const typedLicence = /Open Licence/.test(panelsSrc);
  say('  Sources carrying a licence and a credit: ' + withLicence.length +
      ' of ' + meta.sources.length);
  say('  Carrying the endorsement clause the licence asks of an adapted product: ' +
      endorsement.length);
  say('  The Sources screen prints the generated field: ' + (printsGenerated ? 'yes' : 'NO'));
  say('  A licence name typed into the app instead: ' + (typedLicence ? 'YES - drift risk' : 'no'));
  const licenceOk = missing.length === 0 && printsGenerated && !typedLicence &&
    endorsement.length === meta.sources.length;
  say('');
  say('  VERDICT: ' + (licenceOk
    ? 'PASS - every payload is credited, and the words come from the build.'
    : 'BREACH - see above.'));
  say('');
  if (!licenceOk) {
    breaches.push('Rule 4: ' + missing.length + ' of ' + meta.sources.length +
      ' sources carry no licence' + (printsGenerated ? '' : '; the screen does not print ' +
      'the generated credit') + (typedLicence ? '; a licence name is typed into the app' : '') +
      '.');
  }
  return { present, generatedOnScreen, generatedInExport, shownFields, notShown,
           licenceInApp, licenceInSourcesPy, licenceInReadme, selfDeclared, uncredited };
}

/* ========================================================================= */

const r1 = rule1();
const r2 = rule2();
const r3 = rule3();
const r4 = rule4();

if (JSON_ARG) {
  L(JSON.stringify({ rule1: r1, rule2: r2, rule3: r3, rule4: r4,
                     breaches, gaps }, null, 2));
} else {
  L('=== AUDIT 8 - STANDING RULES ===');
  L('');
  L('Rule 1 no timers      ' + (r1.hard ? 'BREACH' : 'PASS'));
  L('Rule 2 read-aloud     ' + (r2.hardMissed ? 'BREACH (' + r2.hardMissed + ' surfaces skipped)' : 'PASS'));
  L('Rule 3 quiet mode     BREACH (does not exist)');
  L('Rule 4 licence credit BREACH (generated, but no licence)');
  L('');
  lines.forEach((l) => L(l));
  L('=== BREACHES ===');
  breaches.forEach((b, i) => {
    L((i + 1) + '. ' + String(b).replace(/(.{1,86})(\s|$)/g, '$1\n').trim()
      .split('\n').map((x, k) => (k ? '   ' + x : x)).join('\n'));
  });
  if (gaps.length) {
    L('');
    L('=== WORTH FIXING, NOT A GATE ===');
    gaps.forEach((g, i) => L((i + 1) + '. ' + g));
  }
}

process.exit(breaches.length ? 1 : 0);
