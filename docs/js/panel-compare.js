/* ==========================================================================
   Compare (peers) and Impact: the answer before the method.

   The design review found no peer NAMED above the fold: the screen opened
   on a toggle, "Mahalanobis distance" and seven checkboxes. Now it opens on
   who the places most like this one are, and where it stands out among
   them; the method, the choices and the scorecard follow unchanged.

   Impact opened on a sentence built from a number box and a thirty-item
   industry list. Its answer card now comes first and the settings follow.
   ========================================================================== */

(function (root) {
  'use strict';

  var D, C, U, A;
  function init() {
    D = root.GRA.data; C = root.GRA.charts; U = root.GRA.ui; A = root.GRA.app;
  }
  function esc(s) { return C.esc(s == null ? '' : String(s)); }
  function nm(p) { return String(p.name || '').split(' / ')[0]; }

  var MEASURES = [
    { key: 'jobsRatio', hi: 'most jobs for each working resident',
      lo: 'fewest jobs for each working resident' },
    { key: 'popGrowth1121', hi: 'fastest population growth (2011–2021)',
      lo: 'slowest population growth (2011–2021)' },
    { key: 'selfContainmentUsual', hi: 'largest share of residents working locally',
      lo: 'smallest share of residents working locally' }
  ];

  function answer(ctx) {
    var pe = ctx.peers;
    var me = ctx.place;
    var peers = pe.rows.map(function (r) { return r.place || D.byCode[r.code]; })
      .filter(Boolean);
    var c = U.card(null, null, { className: 'chg-answer' });
    if (!peers.length) {
      c.innerHTML = '<p class="answer-p">No close matches were found.</p>';
      return c;
    }
    var names = peers.slice(0, 3).map(function (p) { return '<b>' + esc(nm(p)) + '</b>'; });
    var lines = ['The places most like ' + esc(nm(me)) + ' are ' +
      names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + '.',
      pe.mode === 'structural'
        ? 'They are matched on the mix of work alone, whatever their size.'
        : 'They are matched on size, growth, density and the kind of work people do.'];
    /* where it stands out: top or bottom of the group on a measure */
    var stand = [];
    MEASURES.forEach(function (m) {
      var mine = me[m.key];
      var vals = peers.map(function (p) { return p[m.key]; })
        .filter(function (v) { return v != null && isFinite(v); });
      if (mine == null || vals.length < 3) return;
      if (mine > Math.max.apply(null, vals)) stand.push(m.hi);
      else if (mine < Math.min.apply(null, vals)) stand.push(m.lo);
    });
    if (stand.length) {
      lines.push('Among them it has the ' + stand.slice(0, 2).join(', and the ') + '.');
    } else {
      lines.push('It sits in the middle of the group on jobs, growth and commuting.');
    }
    c.innerHTML = lines.map(function (l) { return '<p class="answer-p">' + l + '</p>'; }).join('') +
      '<div class="cmp-chips">' + peers.slice(0, 8).map(function (p) {
        return '<button type="button" class="home-chip" data-code="' + esc(p.code) + '">' +
          esc(nm(p)) + '</button>';
      }).join('') + '</div><p class="card-foot">Tap a place to see what people do there.</p>';
    c.addEventListener('click', function (e) {
      var b = e.target.closest('[data-code]');
      if (b) { A.setPlace(b.getAttribute('data-code')); A.go('overview'); }
    });
    return c;
  }

  function attach() {
    var P = root.GRA.panels;
    if (!P || !P.peers || !P.impact) { setTimeout(attach, 20); return; }
    if (P._compareFirst) return;
    P._compareFirst = true;
    var oldPeers = P.peers, oldImpact = P.impact;
    P.peers = function (host, ctx, phone) {
      init();
      if (ctx.peers) host.appendChild(answer(ctx));
      oldPeers(host, ctx, phone);
    };
    P.impact = function (host, ctx, phone) {
      init();
      oldImpact(host, ctx, phone);
      /* the settings row follows the answer card, not the other way round */
      var ctl = host.querySelector(':scope > .ctlrow');
      var first = ctl && ctl.nextElementSibling;
      while (first && !first.classList.contains('card')) first = first.nextElementSibling;
      if (ctl && first) {
        ctl.insertAdjacentHTML('afterbegin',
          '<span class="ctl-lead">Try a different number or industry:</span>');
        first.parentNode.insertBefore(ctl, first.nextSibling);
      }
    };
  }
  attach();
}(this));
