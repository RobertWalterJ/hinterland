/* ==========================================================================
   Read aloud, for any panel.

   This started life inside brief.js and could only ever read the brief - one
   surface out of nine, in a tool whose other eight are the ones carrying the
   caveats. It also had a single Stop button, so the only way to interrupt a
   reading was to lose your place in it entirely, and its position marker was
   a wash that measured 1.17:1 against the page behind it, which is to say
   invisible.

   So: one reader, driven by whatever is on screen. It walks the rendered panel
   in document order and turns it into a queue of utterances, reading the
   things that carry meaning - headings, prose, the caveat notes under cards,
   the hero numbers - and declining to read out a twenty-row table, which no
   one wants spoken and which the export exists for.

   It offers Pause as well as Stop, because a reader who wants to look at
   something for a moment should not have to start again from the top.
   ========================================================================== */

(function (root) {
  'use strict';

  var R = {};
  var state = 'idle';           /* idle | reading | paused */
  var queue = [];
  var idx = 0;
  var marked = null;
  var listeners = [];
  var token = 0;                /* invalidates callbacks from a stopped run */

  R.available = function () {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  };

  R.state = function () { return state; };

  R.onChange = function (fn) { listeners.push(fn); };

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(state); } catch (e) {}
    });
  }

  /* ------------------------------------------------------------ the queue */

  /* Read these, in document order. The selector doubles as the definition of
     "what this panel actually says": everything else on screen is either a
     control, a chart, or a table that speech cannot usefully carry. */
  var SAY = [
    '[data-read]', '[data-say]', 'h1', 'h2', 'h3', 'p', 'li',
    '.card-note', '.card-foot', '.gloss', '.empty', '.stat', '.peek-answer'
  ].join(',');

  function clean(s) {
    return String(s || '')
      .replace(/\s+/g, ' ')
      /* An em dash read as a word is worse than a pause. */
      .replace(/—/g, ', ')
      .replace(/−/g, 'minus ')
      .trim();
  }

  /* Numbers are the point of this tool, and a screen reader voice handles
     "1,264,060" better than the glyphs suggest - but percentages and the
     location-quotient abbreviation do need expanding. */
  function speakable(s) {
    return s
      .replace(/\bLQ\b/g, 'location quotient')
      .replace(/\bNAICS\b/g, 'NAICS')
      .replace(/(\d)–(\d)/g, '$1 to $2')
      .replace(/%/g, ' percent');
  }

  function build(container) {
    var out = [];
    var seen = [];
    var nodes = container.querySelectorAll(SAY);
    Array.prototype.forEach.call(nodes, function (n) {
      /* A .card-note inside an already-queued .empty would be read twice. */
      for (var i = 0; i < seen.length; i++) {
        if (seen[i].contains(n)) return;
      }
      if (n.closest && n.closest('table')) return;
      /* Hidden. offsetParent is null for position:fixed elements too, which
         would silently skip anything in a pinned bar or bottom sheet. */
      if (!n.getClientRects().length) return;

      var text;
      if (n.hasAttribute('data-say')) {
        /* An element that knows how it should sound. Needed wherever the
           visible text would be read wrongly - "A" and "Health care" in two
           spans come out of textContent as "AHealth care". */
        text = clean(n.getAttribute('data-say'));
      } else if (n.classList.contains('stat')) {
        var v = n.querySelector('.v'), l = n.querySelector('.l');
        if (!v || !l) return;
        text = clean(v.textContent) + ', ' + clean(l.textContent);
      } else {
        text = clean(n.textContent);
      }
      if (!text || text.length < 2) return;
      seen.push(n);
      out.push({ text: speakable(text), node: n });
    });

    /* Tables are announced rather than read: a reader wants to know one is
       there, not to hear two hundred numbers. */
    Array.prototype.forEach.call(container.querySelectorAll('table.data'),
      function (t) {
        var rows = t.querySelectorAll('tbody tr').length;
        var cols = t.querySelectorAll('thead th').length;
        var cap = t.closest('.card');
        var title = cap && cap.querySelector('h3')
          ? clean(cap.querySelector('h3').textContent) : 'A table';
        out.push({
          text: title + ': a table of ' + rows + ' rows and ' + cols +
                ' columns follows. Use Export to work with it.',
          node: t
        });
      });

    return out;
  }

  /* ---------------------------------------------------------- the marker */

  function clearMark() {
    if (marked) marked.classList.remove('reading');
    marked = null;
  }

  function mark(node) {
    clearMark();
    if (!node) return;
    node.classList.add('reading');
    marked = node;
    /* The old reader never scrolled, so on a long panel the position marker
       was correct and off screen. But scrolling when the node is already in
       view moves the page under a reader's thumb for no reason, so only
       scroll when it is not. */
    var r = node.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    if (r.top >= 64 && r.bottom <= vh - 64) return;
    var smooth = !(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    try { node.scrollIntoView({ block: 'center',
                                behavior: smooth ? 'smooth' : 'auto' }); }
    catch (e) { try { node.scrollIntoView(); } catch (e2) {} }
  }

  /* ---------------------------------------------------------- the voice */

  var chosen = null;
  function voice() {
    if (chosen) return chosen;
    var all = [];
    try { all = window.speechSynthesis.getVoices() || []; } catch (e) {}
    if (!all.length) return null;
    var pick = function (re) {
      for (var i = 0; i < all.length; i++) {
        if (re.test(all[i].lang || '')) return all[i];
      }
      return null;
    };
    chosen = pick(/^en[-_]CA/i) || pick(/^en[-_]GB/i) || pick(/^en/i);
    return chosen;
  }

  /* ---------------------------------------------------------- the engine */

  function step(mine) {
    if (mine !== token || state !== 'reading') return;
    if (idx >= queue.length) { R.stop(); return; }
    var item = queue[idx++];
    mark(item.node);
    var utt = new SpeechSynthesisUtterance(item.text);
    utt.rate = 0.98;
    /* A Canadian voice where one is installed: a US default mispronounces
       half the province. Voices load asynchronously, so this is looked up at
       speak time rather than once at start-up. */
    var v = voice();
    if (v) { utt.voice = v; utt.lang = v.lang; }
    utt.onend = function () { step(mine); };
    utt.onerror = function () { step(mine); };
    window.speechSynthesis.speak(utt);
  }

  R.start = function (container) {
    if (!R.available() || !container) return false;
    R.stop();
    queue = build(container);
    if (!queue.length) return false;
    idx = 0;
    token++;
    state = 'reading';
    emit();
    step(token);
    return true;
  };

  /* The engine's own pause() cannot be trusted. On Android Chrome it behaves
     like cancel: the current utterance errors out while paused, step() sees
     the paused state and stops, and the old resume() never restarted it - so
     the button said "playing" over silence, on exactly the phone this is
     used on. Pause is therefore a cancel that remembers where it was, and
     resume re-reads the current paragraph from its start. Paragraph-level
     resume, identical on every browser. */
  R.pause = function () {
    if (state !== 'reading') return;
    token++;                          /* orphan the cancelled utterance */
    idx = Math.max(0, idx - 1);       /* back to the item being spoken */
    try { window.speechSynthesis.cancel(); } catch (e) {}
    state = 'paused';
    emit();
  };

  R.resume = function () {
    if (state !== 'paused') return;
    state = 'reading';
    emit();
    step(token);
  };

  R.stop = function () {
    token++;
    idx = 0;
    queue = [];
    clearMark();
    try { if (R.available()) window.speechSynthesis.cancel(); } catch (e) {}
    if (state !== 'idle') { state = 'idle'; emit(); }
  };

  /* One thing, now: the speaker button beside a question, an option or a
     sentence. Reads that element (its data-say if it has one) and nothing
     after it. Pressing the same speaker again while it is speaking stops. */
  R.one = function (node) {
    if (!R.available() || !node) return false;
    var again = state === 'reading' && queue.length === 1 && queue[0].node === node;
    R.stop();
    if (again) return false;
    var text = node.hasAttribute('data-say') ? node.getAttribute('data-say') : node.textContent;
    text = speakable(clean(text));
    if (!text) return false;
    queue = [{ text: text, node: node }];
    idx = 0;
    token++;
    state = 'reading';
    emit();
    step(token);
    return true;
  };

  /* Play / pause on the same control; a long press is not discoverable, so
     Stop is always a separate button. */
  R.toggle = function (container) {
    if (state === 'reading') { R.pause(); return state; }
    if (state === 'paused') { R.resume(); return state; }
    R.start(container);
    return state;
  };

  root.GRA = root.GRA || {};
  root.GRA.read = R;
}(this));
