/* ==========================================================================
   Two panels that treat Ontario as a space rather than a list.

   `spatialCard`  attaches to the Map tab and asks whether the variable on
                  screen is actually spatially patterned, with a permutation
                  test, and can repaint the map as LISA clusters.

   `labourMarketCard` attaches to the Peers tab and rebuilds the subject's
                  functional labour market from the commuting matrix, because
                  a statistical peer group and a real economic region are
                  different answers to different questions.
   ========================================================================== */

(function (root) {
  'use strict';

  var D, M, C, A, U, SP, TT;

  function init() {
    D = root.GRA.data; M = root.GRA.methods; C = root.GRA.charts;
    A = root.GRA.app; U = root.GRA.ui;
    SP = root.GRA.spatial; TT = root.GRA.ttwa;
  }

  var CLUSTER_COLOR = {
    HH: '--loss', LL: '--gain', HL: '--loss-3', LH: '--gain-3', ns: '--mid'
  };

  /* Getis-Ord shares the diverging pair but uses only its ends: a hot spot is
     not "bad" and a cold one is not "good", so the intermediate steps that
     carry that reading in the LISA legend are deliberately not reused. */
  var GI_COLOR = { hot: '--loss', cold: '--gain', ns: '--mid' };

  /* ------------------------------------------------------- spatial card */

  /* `vals` is the map's own value object, keyed by code. */
  function spatialCard(host, ctx, vals, title, fmt, onCluster) {
    init();
    var h = U.h, card = U.card, afterLayout = U.afterLayout;

    var codes = D.csdCodes.filter(function (c) {
      var p = D.byCode[c];
      return p && p.lat != null && p.lon != null &&
             vals[c] != null && isFinite(vals[c]);
    });

    var c = card('Is that pattern real?',
      'Every other measure in this tool treats 577 municipalities as 577 ' +
      'independent observations. They are not — neighbours share labour ' +
      'markets, highways and histories. Moran’s I asks whether the ' +
      'pattern on the map above is more clustered than chance would produce, ' +
      'and the answer comes from reshuffling the values across Ontario ' +
      'thousands of times rather than from a formula that assumes normality.');

    if (codes.length < 30) {
      c.appendChild(h('<div class="card-note">Too few municipalities have a ' +
        'usable figure for this variable to test its spatial pattern.</div>'));
      host.appendChild(c);
      return;
    }

    var body = h('<div></div>');
    c.appendChild(body);
    body.innerHTML = '<div class="skel" style="height:96px"></div>';
    host.appendChild(c);

    /* The permutation test is a few hundred milliseconds; run it off the
       paint so the map appears first. */
    afterLayout(function () {
      setTimeout(function () {
        var pts = codes.map(function (code) {
          var p = D.byCode[code];
          return { lat: p.lat, lon: p.lon };
        });
        var series = codes.map(function (code) { return vals[code]; });
        var W = SP.knnWeights(pts, 6);
        var m = SP.moranI(series, W, { permutations: 999, seed: 20260917 });
        if (!m) { body.innerHTML = ''; return; }
        var li = SP.lisa(series, W, { seed: 20260917 });

        var counts = li.counts || {};
        body.innerHTML =
          '<div class="hero" style="margin-bottom:12px">' +
          U.stat(m.I.toFixed(3), 'Moran’s I',
                 'expected ' + m.expected.toFixed(3) + ' under randomness') +
          U.stat(m.p <= 0.001 ? '< 0.001' : m.p.toFixed(3), 'p-value',
                 m.permutations + ' permutations') +
          U.stat((m.z == null ? '—' : m.z.toFixed(1)), 'standard deviations',
                 'from the permutation mean') +
          '</div>' +
          '<div class="gloss">' + SP.describe(m) + '</div>';

        if (m.p <= 0.05) {
          var sig = (counts.HH || 0) + (counts.LL || 0) +
                    (counts.HL || 0) + (counts.LH || 0);
          if (!sig) {
            body.appendChild(h('<div class="card-foot">' +
              (li.underpowered
                ? '<span class="flag flag-weak">underpowered</span> No local ' +
                  'cluster survives the false-discovery-rate correction, but ' +
                  'with ' + li.permutations + ' permutations the smallest ' +
                  'attainable p-value is ' + li.pFloor.toFixed(4) + ', which is ' +
                  'above the strictest threshold the correction applies. The ' +
                  'test could not have rejected, so this is a statement about ' +
                  'the test and not about Ontario.'
                : 'No local cluster survives the false-discovery-rate ' +
                  'correction. ' + li.uncorrected + ' would be significant at ' +
                  'an uncorrected 5%, which is close to the ' +
                  Math.round(codes.length * li.alpha) + ' that pure noise ' +
                  'would produce across this many simultaneous tests — so ' +
                  'the province clusters overall without any single ' +
                  'municipality standing out from its neighbours.') +
              '</div>'));
          }
          var legend = h('<div style="margin-top:14px"></div>');
          if (!sig) legend.hidden = true;
          legend.innerHTML =
            '<div class="eyebrow">Local clusters</div>' +
            '<p class="card-note" style="margin:4px 0 8px">' + sig +
            ' of ' + codes.length + ' municipalities sit in a statistically ' +
            'significant local cluster, after controlling the false discovery ' +
            'rate at ' + (li.alpha * 100) + '% — without that correction, ' +
            'running ' + codes.length + ' simultaneous tests would produce ' +
            'about ' + Math.round(codes.length * li.alpha) + ' false clusters ' +
            'from noise alone.</p>' +
            '<div class="legend">' +
            [['HH', 'high, among high'], ['LL', 'low, among low'],
             ['HL', 'high, among low'], ['LH', 'low, among high']]
              .map(function (p) {
                return '<span class="item"><span class="sw" style="background:' +
                  C.cssVar(CLUSTER_COLOR[p[0]]) + '"></span>' + p[1] +
                  ' · ' + (counts[p[0]] || 0) + '</span>';
              }).join('') + '</div>';
          var btn = h('<button class="btn" style="margin-top:12px">' +
            'Show clusters on the map</button>');
          var showing = false;
          btn.addEventListener('click', function () {
            showing = !showing;
            btn.textContent = showing ? 'Show the values again'
                                      : 'Show clusters on the map';
            if (!onCluster) return;
            if (!showing) { onCluster(null); return; }
            var byCode = {};
            li.rows.forEach(function (r) { byCode[codes[r.i]] = r; });
            onCluster(byCode);
          });
          legend.appendChild(btn);
          body.appendChild(legend);
        }

        /* ---------------------------------------- hot and cold spots

           Moran's I says whether the province clusters; LISA says which
           municipalities sit inside or against a cluster. Neither answers the
           question a reader usually arrives with, which is simply "where is
           this high, and where is it low" - a run of moderately high values
           surrounded by moderately high values is a hot spot and not a LISA
           cluster, because it is not an outlier. Gi* is the statistic for
           that, and it includes the place itself in its own neighbourhood. */
        var gi = SP.getisOrd(series, W, { alpha: 0.05 });
        if (gi) {
          var gc = { hot: 0, cold: 0, ns: 0 };
          var byCodeGi = {};
          gi.rows.forEach(function (r) {
            gc[r.band]++;
            byCodeGi[codes[r.i]] = r;
          });
          var mine = byCodeGi[ctx.place.code];
          var gwrap = h('<div style="margin-top:18px"></div>');
          gwrap.innerHTML =
            '<div class="eyebrow">Hot and cold spots</div>' +
            '<p class="card-note" style="margin:4px 0 8px">' +
            (gc.hot + gc.cold === 0
              ? 'No municipality sits in a statistically significant ' +
                'concentration of high or low values once the false-discovery ' +
                'rate is controlled at 5%. The variable is spread across the ' +
                'province rather than pooled in particular regions.'
              : C.fmt(gc.hot) + ' ' + (gc.hot === 1 ? 'municipality sits' :
                  'municipalities sit') + ' in a significant <b>high</b> ' +
                'concentration and ' + C.fmt(gc.cold) + ' in a significant ' +
                '<b>low</b> one, after controlling the false discovery rate ' +
                'at 5%. This is a different question from the clusters above: ' +
                'Getis-Ord asks where values <i>pool</i>, counting each place ' +
                'within its own neighbourhood, where the local Moran statistic ' +
                'asks which places stand <i>apart from</i> their neighbours. A ' +
                'place can sit deep inside a hot spot and raise no local ' +
                'Moran flag at all, precisely because it resembles everything ' +
                'around it.') +
            (mine
              ? ' <b>' + C.esc(ctx.place.name) + '</b> ' +
                (mine.band === 'hot'
                  ? 'is inside a high concentration (Gi* ' +
                    mine.G.toFixed(2) + ').'
                  : mine.band === 'cold'
                    ? 'is inside a low concentration (Gi* ' +
                      mine.G.toFixed(2) + ').'
                    : 'is not in either (Gi* ' + mine.G.toFixed(2) + ').')
              : '') +
            '</p>' +
            '<div class="legend">' +
            [['hot', 'high concentration'], ['cold', 'low concentration'],
             ['ns', 'neither']].map(function (p) {
              return '<span class="item"><span class="sw" style="background:' +
                C.cssVar(GI_COLOR[p[0]]) + '"></span>' + p[1] + ' \u00b7 ' +
                gc[p[0]] + '</span>';
            }).join('') + '</div>';

          if (gc.hot + gc.cold > 0 && onCluster) {
            var gbtn = h('<button class="btn" style="margin-top:12px">' +
              'Show hot and cold spots on the map</button>');
            var gshow = false;
            gbtn.addEventListener('click', function () {
              gshow = !gshow;
              gbtn.textContent = gshow ? 'Show the values again'
                                       : 'Show hot and cold spots on the map';
              onCluster(gshow ? byCodeGi : null, 'Hot and cold spots');
            });
            gwrap.appendChild(gbtn);
          }
          body.appendChild(gwrap);
        }

        body.appendChild(h('<div class="card-foot">Weights: ' +
          C.esc(m.weights) + '. Contiguity was not used because Ontario has ' +
          'island municipalities and reserves with no land neighbour, which ' +
          'a contiguity matrix drops from the statistic silently. Inference ' +
          'is by conditional permutation with a fixed seed, so a figure ' +
          'quoted from this screen reproduces exactly.</div>'));
      }, 30);
    });
  }

  /* -------------------------------------------------- labour market card */

  function labourMarketCard(host, ctx) {
    init();
    var h = U.h, card = U.card, table = U.table, afterLayout = U.afterLayout;
    if (ctx.place.level !== 'CSD') return;

    var c = card('Its actual labour market',
      'A municipality is an administrative object; a labour market is a ' +
      'functional one, and they rarely coincide. This rebuilds Ontario’s ' +
      'labour markets from the commuting matrix — grouping municipalities ' +
      'until each group contains most of its own commuting — so the region ' +
      'is defined by where people actually travel to work rather than by where ' +
      'a boundary falls.');
    var body = h('<div><div class="skel" style="height:80px"></div></div>');
    c.appendChild(body);
    host.appendChild(c);

    afterLayout(function () {
      setTimeout(function () {
        var res = D._ttwa;
        if (!res) {
          var flows = [];
          var top = D.commute.data;
          Object.keys(top).forEach(function (code) { /* ensure every node */ });
          /* The full matrix lives in commute.top_flows plus the diagonal in
             commute.data; rebuild the flow list from both. */
          Object.keys(D.commute.data).forEach(function (code) {
            var d = D.commute.data[code];
            if (d && d[0]) flows.push({ o: code, d: code, w: d[0] });
          });
          Object.keys(D.commute.top_flows).forEach(function (k) {
            if (k.indexOf('|out') < 0) return;
            var origin = k.slice(0, k.indexOf('|'));
            D.commute.top_flows[k].forEach(function (f) {
              if (f[0] === origin) return;
              flows.push({ o: origin, d: f[0], w: f[1] });
            });
          });
          res = D._ttwa = TT.build(flows, {});
        }
        if (!res) { body.innerHTML = '<p class="card-note">No commuting data.</p>'; return; }

        var area = TT.areaFor(res, ctx.place.code);
        if (!area) {
          body.innerHTML = '<p class="card-note">This municipality does not ' +
            'appear in the commuting matrix, which means fewer than the ' +
            'publication threshold of its residents have a usual place of ' +
            'work recorded.</p>';
          return;
        }
        var nameOf = function (code) {
          return D.byCode[code] ? D.byCode[code].name : code;
        };
        var jobsOf = function (code) {
          return D.byCode[code] ? D.byCode[code].jobs : 0;
        };
        var label = TT.label(area, jobsOf, nameOf);

        body.innerHTML =
          '<div class="hero" style="margin-bottom:10px">' +
          U.stat(C.esc(label.split(' area (')[0]), 'anchored on',
                 area.members.length + ' municipalit' +
                 (area.members.length === 1 ? 'y' : 'ies')) +
          U.stat(C.fmt(area.jobs), 'jobs in the area') +
          U.stat(C.pct(area.containment, 0), 'self-contained',
                 'of commuting stays inside') +
          '</div>' +
          (area.members.length === 1
            ? '<div class="gloss">' + C.esc(ctx.place.name) + ' is its own ' +
              'labour market on this evidence: it already contains enough of ' +
              'its own commuting to stand alone.</div>'
            : '<div class="gloss">On commuting evidence ' +
              C.esc(ctx.place.name) + ' is not a free-standing labour market. ' +
              'It groups with ' + C.esc(area.members.filter(function (m) {
                return m !== ctx.place.code;
              }).map(nameOf).slice(0, 6).join(', ')) +
              (area.members.length > 7 ? ' and others' : '') +
              '. Housing, transport and employment-land decisions in any one ' +
              'of these places land on all of them.</div>');

        var rows = area.members.map(function (code) {
          var p = D.byCode[code] || {};
          return {
            name: nameOf(code), code: code,
            jobs: p.jobs == null ? null : Math.round(p.jobs),
            residents: p.usualResidents == null ? null : Math.round(p.usualResidents),
            selfc: p.selfContainmentUsual,
            subject: code === ctx.place.code ? '▸' : ''
          };
        }).sort(function (a, b) { return (b.jobs || 0) - (a.jobs || 0); });
        body.appendChild(table([
          { key: 'subject', label: '' },
          { key: 'name', label: 'Municipality' },
          { key: 'jobs', label: 'Jobs' },
          { key: 'residents', label: 'Resident workers' },
          { key: 'selfc', label: 'Own self-containment', type: 'pct', dp: 0 }
        ], rows));

        body.appendChild(h('<div class="card-foot">' +
          C.fmt(res.areas.length) + ' labour market areas across Ontario, from ' +
          C.fmt(res.municipalities) + ' municipalities in the commuting ' +
          'matrix, at a ' + C.pct(res.params.targetContainment, 0) +
          ' self-containment target. Simplified Coombes-Bond: the same ' +
          'interaction measure and size trade-off national agencies use for ' +
          'travel-to-work areas, without the full multi-stage validation, so ' +
          'treat these boundaries as indicative. Built from usual-place-of-work ' +
          'commuters only, and the May 2021 reference week left work-at-home ' +
          'commuters out of the matrix entirely, which makes areas look more ' +
          'self-contained than they usually are.</div>'));
      }, 30);
    });
  }

  function attach() {
    if (root.GRA && root.GRA.ui) {
      root.GRA.regionPanels = { spatialCard: spatialCard,
                                labourMarketCard: labourMarketCard };
    } else {
      setTimeout(attach, 20);
    }
  }
  attach();
}(this));
