/* ==========================================================================
   The population panel.

   Every planning conversation starts from population change, and "it grew 12%"
   is the least informative way to say it. Growth from natural increase, from
   people moving within Ontario, and from immigration are three different
   phenomena with three different levers, and in most of southern Ontario they
   are moving in opposite directions at the same time in the same place.
   Toronto in 2019 took in 49,000 immigrants and lost 35,600 people to the rest
   of Ontario. A single growth rate hides that completely.

   Loaded after panels.js, which it extends.
   ========================================================================== */

(function (root) {
  'use strict';

  var D, M, C, A, U;

  function init() {
    D = root.GRA.data; M = root.GRA.methods; C = root.GRA.charts;
    A = root.GRA.app; U = root.GRA.ui;
  }

  var STREAMS = [
    { key: 'natural', label: 'natural increase', slot: '--grp-1' },
    { key: 'international', label: 'international', slot: '--grp-3' },
    { key: 'intraprovincial', label: 'within Ontario', slot: '--grp-2' },
    { key: 'interprovincial', label: 'other provinces', slot: '--grp-4' }
  ];

  var NAME = {
    natural: 'natural increase',
    international: 'immigration',
    intraprovincial: 'migration within Ontario',
    interprovincial: 'migration from other provinces'
  };

  function populationPanel(host, ctx, phone) {
    init();
    var h = U.h, card = U.card, table = U.table, stat = U.stat;
    var afterLayout = U.afterLayout;
    var place = ctx.place;

    /* ---------------------------------------- the municipal series */
    var pp = D.pop.data[place.code];
    if (pp) {
      var years = Object.keys(pp).map(Number)
        .sort(function (a, b) { return a - b; });
      var y0 = years[0], y1 = years[years.length - 1];
      var first = pp[y0], last = pp[y1];
      var cagr = Math.pow(last / first, 1 / (y1 - y0)) - 1;

      var c = card('Population, ' + y0 + ' to ' + y1,
        'Statistics Canada annual estimates, harmonised onto 2021 boundaries. ' +
        'These are adjusted for census net undercoverage, so they deliberately ' +
        'do not match census counts, and the most recent year is preliminary.');
      c.appendChild(h('<div class="hero">' +
        stat(C.fmt(last), 'residents, ' + y1) +
        stat(C.signed(last - first), 'change since ' + y0, null,
             last >= first ? 'pos' : 'neg') +
        stat(C.signedPct((last - first) / first), 'total change', null,
             last >= first ? 'pos' : 'neg') +
        stat(C.signedPct(cagr), 'a year, compounded') +
        '</div>'));
      var ph = document.createElement('div');
      ph.style.minHeight = '200px';
      c.appendChild(ph);
      afterLayout(function () {
        /* named so it does not announce as an unnamed graphic */
        C.lines(ph, [{ name: 'population', color: C.cssVar('--gain'),
                       points: years.map(function (y) { return [y, pp[y]]; }) }],
                { zeroBased: false,
                  xTicks: years.filter(function (y) { return y % 5 === 0; }) });
      });
      c.appendChild(h('<div class="card-foot">The municipal series begins in ' +
        '2001, and that is not an oversight. There is no boundary-harmonised ' +
        'municipal population series before it, and raw counts either side of ' +
        '2001 are not comparable in Ontario: the 1998–2001 restructuring ' +
        'abolished and recreated most of the province’s municipalities, so ' +
        'a 1996 figure and a 2021 figure under the same name usually describe ' +
        'different places. The components below reach back to 1986, because ' +
        'census divisions came through that reorganisation largely intact.' +
        '</div>'));
      host.appendChild(c);
    }

    /* ------------------------------------- components of change */
    var comp = D.componentsFor(place);
    if (!comp) {
      host.appendChild(card('No components of change for this geography',
        'Statistics Canada publishes births, deaths and migration by census ' +
        'division and no finer. Choose a municipality, census division or ' +
        'economic region and this fills in.'));
      return;
    }

    var isCD = place.level === 'CD';
    var cc = card('Why it changed — ' + C.esc(comp.cdName) +
      (isCD ? '' : ' (census division)'),
      (isCD ? '' : '<b>This is the census division, not ' +
        C.esc(place.name) + '.</b> Components of change are not published ' +
        'below this level, so a fast-growing municipality inside a ' +
        'slow-growing division is invisible here. ') +
      'Natural increase is births minus deaths. The three migration streams ' +
      'are kept separate because they are different phenomena with different ' +
      'causes: people moving within Ontario, people moving between provinces, ' +
      'and people arriving from outside Canada.');

    var vints = Object.keys(comp.series).sort();
    vints.forEach(function (v) {
      var meta = D.components.vintages[v] || { label: v, source: '' };
      var rows = D.componentSummary(comp.series[v], v);
      if (!rows.length) return;
      cc.appendChild(h('<div class="eyebrow" style="margin:16px 0 4px">' +
        C.esc(meta.label) + ' · Statistics Canada ' +
        C.esc(meta.source) + '</div>'));
      var ch = document.createElement('div');
      ch.style.minHeight = '230px';
      cc.appendChild(ch);
      afterLayout(function () {
        C.lines(ch, STREAMS.map(function (s) {
          return {
            name: s.label, color: C.cssVar(s.slot),
            points: rows.map(function (r) { return [r.year, r[s.key]]; })
          };
        }), { zeroBased: false,
              xTicks: rows.map(function (r) { return r.year; })
                .filter(function (y) { return y % 5 === 0; }) });
      });
    });

    cc.appendChild(h('<div class="legend">' + STREAMS.map(function (s) {
      return '<span class="item"><span class="sw" style="background:' +
        C.cssVar(s.slot) + '"></span>' + C.esc(s.label) + '</span>';
    }).join('') + '</div>'));

    /* ------------------------------------------------- the reading */
    var latest = vints.indexOf('2021b') >= 0 ? '2021b' : vints[vints.length - 1];
    var rows = D.componentSummary(comp.series[latest], latest);
    var recent = rows.slice(-5);
    if (recent.length) {
      var avg = {};
      STREAMS.forEach(function (s) {
        avg[s.key] = recent.reduce(function (a, r) { return a + r[s.key]; }, 0)
          / recent.length;
      });
      var total = STREAMS.reduce(function (a, s) { return a + avg[s.key]; }, 0);
      var driver = STREAMS.slice().sort(function (a, b) {
        return Math.abs(avg[b.key]) - Math.abs(avg[a.key]);
      })[0].key;
      var losing = avg.intraprovincial < -Math.abs(total) * 0.25;

      cc.appendChild(h('<div class="gloss">Over the last five years on record, ' +
        C.esc(comp.cdName) + ' ' +
        (total >= 0 ? 'gained about ' : 'lost about ') +
        C.fmt(Math.abs(Math.round(total))) + ' people a year on these ' +
        'components. The largest single one is <b>' + NAME[driver] +
        '</b> at ' + C.signed(Math.round(avg[driver])) + ' a year. ' +
        (losing
          ? 'It is <b>losing people to the rest of Ontario</b> (' +
            C.signed(Math.round(avg.intraprovincial)) + ' a year) while gaining ' +
            'them from abroad — the signature of an expensive region that ' +
            'grows by immigration and exports its population to cheaper places. ' +
            'Housing supply is the lever that acts on the outflow; nothing ' +
            'municipal acts on the inflow.'
          : avg.intraprovincial > 0
            ? 'It is <b>gaining people from elsewhere in Ontario</b> (' +
              C.signed(Math.round(avg.intraprovincial)) + ' a year). That ' +
              'stream is the one most sensitive to what gets built and what it ' +
              'costs, which makes it the component a municipality can actually ' +
              'influence.'
            : 'Migration within Ontario is close to balanced.') +
        '</div>'));
    }

    /* ------------------------------------------------- the numbers */
    var cols = [
      { key: 'year', label: 'Year' },
      { key: 'births', label: 'Births' },
      { key: 'deaths', label: 'Deaths' },
      { key: 'natural', label: 'Natural increase', signed: true },
      { key: 'international', label: 'Net international', signed: true },
      { key: 'intraprovincial', label: 'Net within Ontario', signed: true },
      { key: 'interprovincial', label: 'Net other provinces', signed: true },
      { key: 'net', label: 'Sum of components', signed: true }
    ];
    var trows = rows.map(function (r) {
      var o = {};
      Object.keys(r).forEach(function (k) { o[k] = r[k]; });
      o.net = r.natural + r.international + r.intraprovincial +
              r.interprovincial;
      return o;
    }).reverse();
    cc.appendChild(table(cols, trows));
    cc.appendChild(h('<div class="card-foot">Estimates, not counts: recent ' +
      'years are postcensal and will be revised. Migration within Ontario is ' +
      'derived from tax records, so it lags moves by people who do not file. ' +
      'The components will not sum exactly to the change in population, ' +
      'because Statistics Canada carries a residual term that is excluded ' +
      'here.</div>'));
    if (root.GRA.learn) root.GRA.learn.teach(cc, ['components', 'natural-increase'], null);
    host.appendChild(cc);
  }

  function attach() {
    if (root.GRA && root.GRA.panels) {
      root.GRA.panels.population = populationPanel;
    } else {
      setTimeout(attach, 20);
    }
  }
  attach();
}(this));
