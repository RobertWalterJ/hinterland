/* ==========================================================================
   Ontario's economy over time.

   Two kinds of history, kept visibly apart because they are held to
   different standards:

   1. HISTORY THE DATA TELLS. Generated from the census series and the
      components of population change, through the same gates as everything
      else - so it cannot be wrong about a number. It is also bounded by the
      data: 2001 to 2021 for industry, 1986 onward for population change,
      and every comparison stays within one labour-force universe
      (METHODS 7.0).

   2. THE LONGER ARC. Dated events the tables cannot supply - trade
      agreements, municipal restructuring, provincial plans. Nothing here is
      written from memory. Every entry was checked against the primary
      source it cites (a treaty register, a statute, a government record),
      and an entry that could not be verified was left out: CUSMA is absent
      for exactly that reason. pipeline/validate.py fails if an entry lacks a
      source on an authoritative domain.

   The two are juxtaposed, never joined by "because". An entry may say what
   the data shows over the same years; it may not claim the event caused it.
   Causation is a claim the data cannot support, and a learning tool that
   teaches a false cause is worse than one that teaches nothing.
   ========================================================================== */

(function (root) {
  'use strict';

  var H = {};
  var D, M, C, U;
  function init() {
    D = root.GRA.data; M = root.GRA.methods; C = root.GRA.charts; U = root.GRA.ui;
  }
  function esc(s) { return C.esc(s == null ? '' : String(s)); }

  /* ------------------------------------------------ 1. the sourced arc

     `fact` is written in plain words from the source; `seeAlso` names what
     the data shows around the same time, as a separate observation. Each
     `verified` note records what the source itself confirmed. */
  H.timeline = [
    { year: 1965, date: '16 January 1965',
      title: 'The Canada–US Auto Pact',
      fact: 'Canada and the United States signed an agreement on automotive ' +
        'products that let vehicles and parts cross the border without ' +
        'tariffs for qualifying makers. It came into force in September 1966.',
      source: { name: 'Government of Canada, treaty register',
                url: 'https://www.treaty-accord.gc.ca/text-texte.aspx?id=100604' },
      verified: 'Signed 16 January 1965, Johnson City, Texas; in force 16 September 1966.',
      seeAlso: 'manufacturing' },

    { year: 1989, date: '1 January 1989',
      title: 'Canada–US Free Trade Agreement',
      fact: 'The Canada–United States Free Trade Agreement came into force, ' +
        'setting out to remove tariffs between the two countries.',
      source: { name: 'Global Affairs Canada',
                url: 'https://www.international.gc.ca/trade-commerce/trade-agreements-accords-commerciaux/agr-acc/cusma-aceum/history-multilateral-historique-multilateraux.aspx?lang=eng' },
      verified: 'In force by 1 January 1989.' },

    { year: 1994, date: '1 January 1994',
      title: 'NAFTA',
      fact: 'The North American Free Trade Agreement, adding Mexico, came into ' +
        'force and replaced the Canada–US agreement.',
      source: { name: 'Global Affairs Canada',
                url: 'https://www.international.gc.ca/trade-commerce/trade-agreements-accords-commerciaux/agr-acc/cusma-aceum/history-multilateral-historique-multilateraux.aspx?lang=eng' },
      verified: 'Came into effect 1 January 1994.' },

    { year: 1998, date: '1 January 1998',
      title: 'The new City of Toronto',
      fact: 'Metropolitan Toronto and its six municipalities — East York, ' +
        'Etobicoke, North York, Scarborough, Toronto and York — were ' +
        'dissolved into a single City of Toronto.',
      source: { name: 'Legislative Assembly of Ontario, Bill 103 (City of Toronto Act, 1997)',
                url: 'https://www.ola.org/en/legislative-business/bills/parliament-36/session-1/bill-103' },
      verified: 'New city constituted 1 January 1998; Royal Assent 21 April 1997.',
      seeAlso: 'restructuring' },

    { year: 2001, date: '1 January 2001',
      title: 'Hamilton, Ottawa and Greater Sudbury restructured',
      fact: 'Four regional municipalities were replaced by the Cities of ' +
        'Hamilton, Ottawa and Greater Sudbury and the Towns of Haldimand ' +
        'and Norfolk.',
      source: { name: 'Legislative Assembly of Ontario, Bill 25 (Fewer Municipal Politicians Act, 1999)',
                url: 'https://www.ola.org/en/legislative-business/bills/parliament-37/session-1/bill-25' },
      verified: 'Implemented 1 January 2001.',
      seeAlso: 'restructuring' },

    { year: 2001, date: '18 February 2001',
      title: 'The Auto Pact’s duty exemption ends',
      fact: 'After a World Trade Organization ruling against it, adopted in ' +
        'June 2000, Canada withdrew the duty-free treatment the Auto Pact ' +
        'had given qualifying car makers.',
      source: { name: 'World Trade Organization, dispute DS142',
                url: 'https://www.wto.org/english/tratop_e/dispu_e/cases_e/ds142_e.htm' },
      verified: 'Appellate Body report adopted 19 June 2000; Canada complied as of 18 February 2001.',
      seeAlso: 'manufacturing' },

    { year: 2005, date: '2005',
      title: 'Ontario’s Greenbelt',
      fact: 'The Greenbelt Act created a protected belt of farmland and natural ' +
        'areas of over 800,000 hectares, running about 325 km from Rice Lake ' +
        'to the Niagara River.',
      source: { name: 'Government of Ontario',
                url: 'https://www.ontario.ca/page/ontarios-greenbelt' },
      verified: 'Created 2005 under the Greenbelt Act, 2005; over 800,000 hectares.',
      seeAlso: 'growth' },

    { year: 2006, date: '16 June 2006',
      title: 'The Growth Plan for the Greater Golden Horseshoe',
      fact: 'Ontario’s first growth plan directed growth to built-up areas ' +
        'and urban growth centres, and planned the region to 2031.',
      source: { name: 'Government of Ontario',
                url: 'https://www.ontario.ca/document/built-boundary-growth-plan-greater-golden-horseshoe-2006/introduction' },
      verified: 'Released 16 June 2006 under the Places to Grow Act, 2005.',
      seeAlso: 'growth' },

    { year: 2009, date: '2009',
      title: 'Rescuing the car makers',
      fact: 'The federal and Ontario governments committed up to US$9.5 billion ' +
        'to the restructuring of General Motors’ Canadian operations, ' +
        'alongside support for Chrysler.',
      source: { name: 'Government of Canada, news archive',
                url: 'https://www.canada.ca/en/news/archive/2009/06/backgrounder-canada-ontario-joint-support-general-motors-restructuring.html' },
      verified: 'Package of up to US$9.5 billion for GM, jointly from Canada and Ontario.',
      seeAlso: 'manufacturing' },

    { year: 2021, date: '2–8 May 2021',
      title: 'The census counts a pandemic week',
      fact: 'The 2021 Census measured work in one week of May 2021, during the ' +
        'pandemic’s third wave, when an unusual number of people were on ' +
        'reduced hours or laid off.',
      source: { name: 'Statistics Canada, 2021 Census labour reference guide',
                url: 'https://www12.statcan.gc.ca/census-recensement/2021/ref/98-500/012/98-500-x2021012-eng.cfm' },
      verified: 'Reference week Sunday 2 May to Saturday 8 May 2021.',
      seeAlso: 'pandemic' }
  ];

  /* ------------------------------------------- 2. what the data tells */

  /* Sector leadership among RESIDENTS, 2001 against 2011. Both legs are on
     the Census Profile universe (METHODS 7.0), so they can be compared; 2011
     is the voluntary household survey. A place counts only where its leader
     clearly beats the runner-up in that year - the separation gate, applied
     to history as to everything else. */
  function leadership(year) {
    var out = {}, n = 0;
    (D.byLevel.CSD || []).forEach(function (p) {
      var d = D.res.data[p.code];
      var v = d && d[String(year)];
      if (!v) return;
      var tot = 0; v.forEach(function (x) { tot += x || 0; });
      if (tot < 1000) return;
      var r = v.map(function (x, i) { return { i: i, x: x || 0 }; })
        .sort(function (a, b) { return b.x - a.x; });
      if (!M.clearlyLarger(r[0].x, r[1].x, 3)) return;
      var k = D.naics[r[0].i].short;
      out[k] = (out[k] || 0) + 1; n++;
    });
    return { counts: out, n: n };
  }

  /* Census divisions recording more deaths than births, year by year - two
     series on two boundary vintages, shown side by side and never spliced. */
  function naturalDecrease() {
    var out = {};
    var comp = D.components && D.components.data;
    if (!comp) return out;
    Object.keys(comp).forEach(function (vint) {
      var years = {};
      Object.keys(comp[vint]).forEach(function (cd) {
        var byyr = comp[vint][cd];
        Object.keys(byyr).forEach(function (y) {
          years[y] = years[y] || { dec: 0, n: 0 };
          years[y].n++;
          if ((byyr[y].deaths || 0) > (byyr[y].births || 0)) years[y].dec++;
        });
      });
      out[vint] = Object.keys(years).sort().map(function (y) {
        return { year: +y, dec: years[y].dec, n: years[y].n };
      });
    });
    return out;
  }

  H.stories = function () {
    init();
    var a = leadership(2001), b = leadership(2011);
    /* the story continues on the pair counted the same way (both years
       count the employed): 2016 and 2021 */
    var c16 = leadership(2016), c21 = leadership(2021);
    var mf = D.naics.filter(function (n) { return n.code === '31-33'; })[0].short;
    var hs = D.naics.filter(function (n) { return n.code === '62'; })[0].short;
    var on = D.pop.data['35'] || {};
    return {
      manufacturing2001: a.counts[mf] || 0, manufacturing2011: b.counts[mf] || 0,
      health2001: a.counts[hs] || 0, health2011: b.counts[hs] || 0,
      manufacturing2016: c16.counts[mf] || 0, manufacturing2021: c21.counts[mf] || 0,
      health2016: c16.counts[hs] || 0, health2021: c21.counts[hs] || 0,
      leaders2001: a, leaders2011: b,
      natural: naturalDecrease(),
      pop2001: on['2001'], pop2025: on['2025']
    };
  };

  /* ------------------------------------------------------------ render */

  function seeAlsoText(key, s) {
    if (key === 'manufacturing') {
      return 'Over 2001 to 2011, the data shows manufacturing as the clear ' +
        'largest employer of residents in ' + s.manufacturing2001 + ' ' +
        'municipalities at the start and ' + s.manufacturing2011 + ' at the end.';
    }
    if (key === 'restructuring') {
      return 'This is why the tool’s municipal population series begins in ' +
        '2001: most municipalities before the restructuring no longer exist ' +
        'as the same places.';
    }
    if (key === 'growth') {
      return 'Ontario’s population grew from about ' +
        Math.round(s.pop2001 / 1e5) / 10 + ' million in 2001 to about ' +
        Math.round(s.pop2025 / 1e5) / 10 + ' million in 2025.';
    }
    if (key === 'pandemic') {
      return 'Every 2021 figure in this tool comes from that week. Restaurants, ' +
        'arts and retail are understated, and working from home overstated.';
    }
    return '';
  }

  H.card = function () {
    init();
    var s = H.stories();
    var c = U.card('Ontario’s economy over time',
      'Two kinds of history, kept apart. <b>What the data shows</b> is ' +
      'calculated from Statistics Canada’s census and population ' +
      'estimates, like everything else in the tool. <b>The longer story</b> ' +
      'is a timeline of dated events, each checked against the official ' +
      'record it cites. The timeline gives context. It does not claim an ' +
      'event caused what the data shows.');

    /* what the data shows */
    var nd = s.natural['2021b'] || [];
    var ndOld = s.natural['2011b'] || [];
    var first = ndOld.length ? ndOld[0] : null;
    var last = nd.length ? nd[nd.length - 1] : null;
    var peak = nd.reduce(function (m, r) { return !m || r.dec > m.dec ? r : m; }, null);
    var data = document.createElement('div');
    data.innerHTML =
      '<h3 class="subh">What the data shows</h3>' +
      '<p class="explain-plain"><b>The decade the towns stopped being factory ' +
      'towns.</b> In 2001, manufacturing was clearly the largest employer of ' +
      'residents in <b>' + s.manufacturing2001 + '</b> Ontario municipalities. ' +
      'By 2011 it was <b>' + s.manufacturing2011 + '</b>. Over the same decade, ' +
      'places led by health and social services went from ' + s.health2001 +
      ' to ' + s.health2011 + '.' +
      (s.manufacturing2021 < s.manufacturing2016 && s.health2021 > s.health2016
        ? ' It has not stopped: from 2016 to 2021, counted the same way both years, ' +
          'manufacturing-led places went from ' + s.manufacturing2016 + ' to ' +
          s.manufacturing2021 + ', and health-led places from ' + s.health2016 +
          ' to ' + s.health2021 + '.'
        : '') + '</p>' +
      (first && peak
        ? '<p class="explain-plain"><b>Deaths overtaking births.</b> In ' +
          first.year + ', ' + first.dec + ' of Ontario’s ' + first.n +
          ' census divisions recorded more deaths than births. By ' +
          peak.year + ', ' + peak.dec + ' did' +
          (last && last.year !== peak.year ? ' (' + last.dec + ' in ' +
            last.year + ', the latest, preliminary year)' : '') + '.</p>'
        : '') +
      (s.pop2001 && s.pop2025
        ? '<p class="explain-plain"><b>A province that kept growing.</b> ' +
          'Ontario went from about ' + Math.round(s.pop2001 / 1e5) / 10 +
          ' million people in 2001 to about ' +
          Math.round(s.pop2025 / 1e5) / 10 + ' million in 2025.</p>'
        : '') +
      '<p class="card-foot">Industry is by where residents live, and 2001 and ' +
      '2011 are compared on the same census definition; 2011 comes from the ' +
      'voluntary National Household Survey. A place is counted only where its ' +
      'largest sector clearly beats the next, beyond sampling error. Deaths ' +
      'and births are by census division, on two boundary series that are ' +
      'shown separately, not joined.</p>';
    c.appendChild(data);

    /* the longer story */
    var tl = document.createElement('div');
    tl.className = 'timeline';
    tl.innerHTML = '<h3 class="subh">The longer story</h3>' +
      H.timeline.map(function (e) {
        var also = e.seeAlso ? seeAlsoText(e.seeAlso, s) : '';
        /* a scannable list of dates and names; each opens to its story */
        return '<details class="tl-item"><summary><span class="tl-date">' +
          esc(e.date) + '</span><span class="tl-title">' + esc(e.title) +
          '</span></summary><div class="tl-body"><p class="tl-fact">' +
          esc(e.fact) + '</p>' +
          (also ? '<p class="tl-also"><span class="tl-also-k">In the data:</span> ' +
            esc(also) + '</p>' : '') +
          '<p class="tl-src">Source: <a href="' + esc(e.source.url) +
          '" target="_blank" rel="noopener">' + esc(e.source.name) + '</a></p>' +
          '</div></details>';
      }).join('');
    c.appendChild(tl);
    return c;
  };

  root.GRA = root.GRA || {};
  root.GRA.history = H;
}(this));
