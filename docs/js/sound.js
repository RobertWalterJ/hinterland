/* ==========================================================================
   Sound.

   The rule this follows: sound carries information, or it does not play.
   An interface that chirps at every click teaches you to mute it, and a muted
   interface has no sound design - it has a switch you turned off.

   So there are no click sounds, no success chimes, no whooshes. What there is:

     - Data sonification. A sector list, a shift-share decomposition and a
       peer distribution can each be *heard* as well as read, which is a
       genuinely faster way to tell "one big thing and nineteen small ones"
       from "twenty even things", and it is the only part of this app a person
       who cannot read the screen can use at all.
     - Two earcons, and only two: one when a figure is withheld as unreliable,
       one when an export completes. Both mark a state change you would
       otherwise have to notice visually.
     - The reading voice, which already existed for the brief.

   Everything is synthesised through the Web Audio API - no files, nothing to
   download, nothing to load. The palette is a soft triangle-and-sine voice
   through a lowpass filter: closer to a marimba than a synth, because the
   sound plays over people talking in meetings.

   Off by default. Browsers block audio until a gesture anyway, and a planning
   tool that makes noise unbidden in a council chamber is a tool nobody opens
   twice.
   ========================================================================== */

(function (root) {
  'use strict';

  var S = { enabled: false, ready: false, ctx: null, master: null };

  var PREF_KEY = 'gra.sound';

  /* A pentatonic set avoids the semitone clashes that make arbitrary data
     sound wrong rather than merely low. Values map to scale degrees, so a
     rising series is always consonant. */
  var SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
  var ROOT_HZ = 196.00;                     /* G3 */

  function hz(degree) {
    var i = Math.max(0, Math.min(SCALE.length - 1, Math.round(degree)));
    return ROOT_HZ * Math.pow(2, SCALE[i] / 12);
  }

  /* ------------------------------------------------------------- lifecycle */

  S.restore = function () {
    try { S.enabled = localStorage.getItem(PREF_KEY) === 'on'; } catch (e) {}
    return S.enabled;
  };

  S.setEnabled = function (on) {
    S.enabled = !!on;
    try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch (e) {}
    /* Muting has to stop what is already scheduled. Notes are queued on the
       audio clock up to two seconds ahead, so merely setting a flag leaves
       the room playing after the button says it is off. */
    if (!on) { S.stop(); return S.enabled; }
    if (on) S.wake();
    return S.enabled;
  };

  /* Must be called from inside a user gesture the first time. */
  S.wake = function () {
    if (S.ready) {
      if (S.ctx.state === 'suspended') S.ctx.resume();
      return true;
    }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try {
      S.ctx = new AC();
      S.master = S.ctx.createGain();
      S.master.gain.value = 0.22;           /* deliberately quiet */
      var comp = S.ctx.createDynamicsCompressor();
      S.master.connect(comp);
      comp.connect(S.ctx.destination);
      S.ready = true;
      return true;
    } catch (e) {
      return false;
    }
  };

  function live() {
    if (!S.enabled) return false;
    if (!S.ready && !S.wake()) return false;
    if (S.ctx.state === 'suspended') S.ctx.resume();
    return true;
  }

  /* ---------------------------------------------------------------- voice */

  /* One note. `tone` picks the timbre: 'soft' for data, 'wood' for marks. */
  function note(freq, at, dur, gain, tone) {
    var t = S.ctx.currentTime + at;
    var osc = S.ctx.createOscillator();
    var g = S.ctx.createGain();
    var f = S.ctx.createBiquadFilter();

    osc.type = tone === 'wood' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, t);

    f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.min(6000, freq * 6), t);
    f.Q.value = 0.6;

    /* A short attack and an exponential tail: percussive, no click. */
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(f); f.connect(g); g.connect(S.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /* ------------------------------------------------- 1. sonified series */

  /* Play a list of values as pitch over time.

     Pitch carries magnitude, so a ranked sector list descends; the ear hears
     the shape of a distribution in about a second and a half, which is faster
     than reading twenty rows. A withheld cell is played as a dull, detuned
     tick rather than a pitch, and a weak one arrives quieter and blurred by a
     second note underneath it: unreliable data must not sound like data. */
  S.series = function (values, opt) {
    if (!live()) return;
    opt = opt || {};

    /* Accepts bare numbers or {v, flag} records. The flag matters: the visual
       channel marks a suppressed cell and an audio channel that played it as
       an ordinary pitch would quietly launder that uncertainty away. */
    var items = values.map(function (x) {
      if (x != null && typeof x === 'object') {
        return { v: x.v, flag: x.flag || 'ok' };
      }
      return { v: x, flag: 'ok' };
    });

    var vals = items.filter(function (it) {
      return it.v != null && isFinite(it.v) &&
        it.flag !== 'withheld' && it.flag !== 'missing';
    }).map(function (it) { return Math.abs(it.v); });
    if (!vals.length) return;
    var max = Math.max.apply(null, vals);
    if (!max) return;
    var step = opt.step || 0.075;
    var dur = opt.dur || 0.38;

    items.forEach(function (it, i) {
      var at = i * step;
      var v = it.v;

      /* Nothing there, or withheld for disclosure: a dull detuned tick, never
         a pitch. The listener hears a hole in the row, which is the truth. */
      if (v == null || !isFinite(v) || it.flag === 'withheld' ||
          it.flag === 'missing') {
        note(103, at, 0.05, 0.03, 'wood');
        note(110, at, 0.05, 0.025, 'wood');
        return;
      }

      var norm = Math.abs(v) / max;
      var deg = norm * (SCALE.length - 1);
      /* Louder for bigger values, but compressed so the tail stays audible. */
      var gain = 0.05 + 0.10 * Math.sqrt(norm);

      if (it.flag === 'weak') {
        /* Published but near the floor. Played quieter and shorter, with a
           second note a whole tone under it, so it arrives hedged rather than
           confident - audible as "about this much" instead of "this much". */
        note(hz(deg), at, dur * 0.55, gain * 0.55, 'soft');
        note(hz(Math.max(0, deg - 1)), at + 0.02, dur * 0.4, gain * 0.3, 'soft');
        return;
      }

      note(hz(deg), at, dur, gain, 'soft');
    });
  };

  /* --------------------------------------- 2. the shift-share decomposition */

  /* Three effects, played as an interval against a drone.

     The drone is the reference economy. Each effect is a note above it for a
     gain and below it for a loss, with the interval sized by magnitude, so a
     place that grew against a shrinking province sounds like a rising figure
     over a falling one. This is the one sonification that says something the
     chart does not: you hear the *tension* between mix and competitive
     directly, because consonance and dissonance do that work. */
  S.decomposition = function (total, opt) {
    if (!live()) return;
    opt = opt || {};
    var base = Math.max(1, Math.abs(total.start) || 1);
    var parts = [
      { v: total.national, at: 0.00 },
      { v: total.mix, at: 0.50 },
      { v: total.competitive, at: 1.00 }
    ];

    /* drone: the reference, steady underneath */
    note(ROOT_HZ / 2, 0, 1.9, 0.045, 'soft');
    note(ROOT_HZ / 2 * Math.pow(2, 7 / 12), 0, 1.9, 0.03, 'soft');

    parts.forEach(function (p) {
      var rel = p.v / base;                       /* share of starting size */
      var mag = Math.min(1, Math.abs(rel) / 0.15);
      var deg = 3 + (p.v >= 0 ? 1 : -1) * mag * 5;
      note(hz(deg), p.at, 0.55, 0.06 + 0.07 * mag, 'wood');
    });
  };

  /* ------------------------------------------- 3. where a value sits */

  /* A single value placed in a distribution: low pitch at the bottom of the
     range, high at the top. Used on the peer scorecard, where the question is
     always "is this place unusual?" and the answer is a position. */
  S.position = function (percentile) {
    if (!live()) return;
    if (percentile == null || !isFinite(percentile)) return;
    var deg = percentile * (SCALE.length - 1);
    note(hz(deg), 0, 0.5, 0.11, 'wood');
  };

  /* ----------------------------------------------------------- 4. earcons */

  /* Withheld: two dull, close tones. Deliberately unmusical - it marks an
     absence, and it should not be pleasant. */
  S.withheld = function () {
    if (!live()) return;
    note(174.6, 0, 0.16, 0.05, 'wood');
    note(164.8, 0.06, 0.20, 0.045, 'wood');
  };

  /* Done: a rising fifth. The only unambiguously positive sound in the app,
     and it fires once, when a file has actually been written. */
  S.done = function () {
    if (!live()) return;
    note(hz(4), 0, 0.22, 0.09, 'wood');
    note(hz(7), 0.10, 0.42, 0.09, 'wood');
  };

  /* A soft confirmation that sound is now on, so the toggle proves itself. */
  S.hello = function () {
    if (!live()) return;
    note(hz(2), 0, 0.28, 0.07, 'wood');
    note(hz(5), 0.11, 0.30, 0.06, 'wood');
    note(hz(9), 0.22, 0.45, 0.05, 'soft');
  };

  S.stop = function () {
    if (S.ctx && S.ready) {
      try { S.ctx.close(); } catch (e) {}
      S.ready = false; S.ctx = null; S.master = null;
    }
  };

  root.GRA = root.GRA || {};
  root.GRA.sound = S;
}(this));
