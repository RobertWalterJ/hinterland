/* ==========================================================================
   Data layer: loading, indexing, and building the reference economies.

   Nothing in here computes an index or a decomposition - that is methods.js.
   What lives here is the question "which numbers are the reference numbers",
   which turns out to be the most consequential thing the tool decides.
   ========================================================================== */

(function (root) {
  'use strict';

  var D = {
    ready: false,
    geo: null, work: null, res: null, pop: null, commute: null,
    biz: null, meta: null, ctWork: null, ctCsd: null,
    boundaries: {},
    places: [], byCode: {}, byLevel: {},
    naics: [], naicsGroups: [],
    csdCodes: [], ctCodes: []
  };

  var BASE = 'data/';

  /* One retry with a short backoff. The local server is a small Python one and
     the first load asks it for eight files at once; an occasional dropped
     connection should not take the whole app down with an unexplained
     "failed to fetch". */
  function getJSON(name, attempt) {
    attempt = attempt || 0;
    return fetch(BASE + name).then(function (r) {
      if (!r.ok) throw new Error(name + ': HTTP ' + r.status);
      return r.json();
    }).catch(function (e) {
      if (attempt >= 2) throw new Error(name + ': ' + e.message);
      return new Promise(function (res) {
        setTimeout(res, 180 * (attempt + 1));
      }).then(function () { return getJSON(name, attempt + 1); });
    });
  }

  /* ------------------------------------------------------------- loading */

  D.load = function (onStep) {
    var step = onStep || function () {};
    step('Unpacking Ontario');
    return Promise.all([
      getJSON('geo.json'), getJSON('work_csd.json'), getJSON('res_series.json'),
      getJSON('population.json'), getJSON('commute.json'),
      getJSON('business.json'), getJSON('meta.json'), getJSON('ct_csd.json'),
      getJSON('components.json'), getJSON('io.json'),
      getJSON('detail.json')
    ]).then(function (r) {
      D.geo = r[0]; D.work = r[1]; D.res = r[2]; D.pop = r[3];
      D.commute = r[4]; D.biz = r[5]; D.meta = r[6]; D.ctCsd = r[7];
      D.components = r[8]; D.io = r[9];
      /* Occupation, and the published 95% intervals, for the people who LIVE
         in each place (98-10-0456). */
      D.detail = r[10];
      step('Sorting 577 municipalities');
      index();
      D.ready = true;
      return D;
    });
  };

  /* Census tracts and their polygons are a few megabytes and most sessions
     never open the neighbourhood tier, so they load on first use. */
  D.loadTracts = function () {
    if (D._ctPromise) return D._ctPromise;
    D._ctPromise = getJSON('work_ct.json').then(function (j) {
      D.ctWork = j;
      D.ctCodes = Object.keys(j.data);
      return j;
    });
    return D._ctPromise;
  };

  D.loadBoundaries = function (layer) {
    var key = 'b_' + layer;
    if (D[key]) return D[key];
    D[key] = getJSON('boundaries_' + layer + '.json').then(function (j) {
      D.boundaries[layer] = j;
      return j;
    }).catch(function (e) {
      /* A map that fails to load must not take the page with it. Clear the
         memo so a later visit to a map panel tries again. */
      console.warn('boundary layer ' + layer + ' unavailable: ' + e.message);
      delete D[key];
      return { type: 'FeatureCollection', features: [] };
    });
    return D[key];
  };

  function index() {
    var f = D.geo.fields, n = f.length;
    D.naics = D.geo.naics;
    D.naicsGroups = [];
    D.naics.forEach(function (s) {
      if (D.naicsGroups.indexOf(s.group) < 0) D.naicsGroups.push(s.group);
    });

    D.places = D.geo.places.map(function (row) {
      var o = {};
      for (var i = 0; i < n; i++) o[f[i]] = row[i];
      /* Statistics Canada writes compound geography names with a double
         hyphen - "Hamilton--Niagara Peninsula", "Kitchener--Waterloo--Barrie".
         That is a transliteration of an en dash, and it looks like a typo on
         screen, so it is repaired for display only; codes are untouched. */
      o.name = String(o.name || '').replace(/--/g, '–');
      o.label = o.name;
      o.kind = kindLabel(o);
      return o;
    });
    D.places.forEach(function (p) {
      D.byCode[p.code] = p;
      (D.byLevel[p.level] = D.byLevel[p.level] || []).push(p);
    });
    D.csdCodes = (D.byLevel.CSD || []).map(function (p) { return p.code; });

    /* Derived counts, computed once. The naming is deliberate and the
       distinction is load-bearing:

         jobs                  all jobs located here (place of work, includes
                               people working at home)
         allEmployedResidents  every employed resident, from the residence-basis
                               industry vector
         usualResidents        residents with a USUAL place of work - the only
                               ones the commuting table knows about, which for
                               Toronto is 649,000 against 1,308,000 employed
                               residents
         usualJobsHere         jobs at a usual workplace here

       Dividing a jobs figure from one basis by a residents figure from the
       other is the classic error here, so the two are never given names that
       invite it. */
    D.places.forEach(function (p) {
      var w = D.work.data[p.code];
      p.jobs = w ? sum(w[0]) : null;
      var rv = D.res.data[p.code] ? D.res.data[p.code]['2021'] : null;
      p.allEmployedResidents = rv ? sum(rv) : null;
      /* The only denominator that can honestly be divided into a
         place-of-work figure. Statistics Canada's place-of-work tables count
         work-at-home and usual-workplace only; workers with no fixed workplace
         address and those working outside Canada are in the residence total but
         cannot belong to any workplace geography. Province-wide that is 794,920
         people - dividing by the wrong one made Ontario look as though it had
         0.88 jobs per resident worker, when by construction it must be near 1. */
      var rm = D.res.measures_2021 ? D.res.measures_2021[p.code] : null;
      p.residentWorkersFixed = rm ? ((rm.home || 0) + (rm.usual || 0)) : null;
      p.residentWorkersMobile = rm ? ((rm.nofixed || 0) + (rm.outside || 0)) : null;
      var c = D.commute.data[p.code];
      if (c) {
        p.liveAndWork = c[0]; p.inCommuters = c[1]; p.outCommuters = c[2];
        p.usualResidents = c[0] + c[2];
        p.usualJobsHere = c[0] + c[1];
        p.selfContainmentUsual = p.usualResidents
          ? c[0] / p.usualResidents : null;
        p.jobsRatioUsual = p.usualResidents
          ? p.usualJobsHere / p.usualResidents : null;
      }
      /* Like for like: place-of-work jobs over the residence subtotal that
         shares its universe. */
      p.jobsRatio = (p.jobs != null && p.residentWorkersFixed)
        ? p.jobs / p.residentWorkersFixed : null;
      var pp = D.pop.data[p.code];
      if (pp) {
        p.pop2021est = pp['2021'] || null;
        p.pop2025 = pp['2025'] || null;
        p.pop2011 = pp['2011'] || null;
        if (p.pop2011 && p.pop2021est) {
          p.popGrowth1121 = (p.pop2021est - p.pop2011) / p.pop2011;
        }
      }
      if (p.pop2021 && p.area_km2 > 0) p.popDensity = p.pop2021 / p.area_km2;
      if (p.jobs != null && p.area_km2 > 0) p.jobDensity = p.jobs / p.area_km2;
    });
  }

  function kindLabel(p) {
    if (p.level === 'CSD') return CSD_TYPE[p.csd_type] || 'Municipality';
    if (p.level === 'CD') return 'Census division';
    if (p.level === 'ER') return 'Economic region';
    if (p.level === 'CMA') return 'Metropolitan area';
    if (p.level === 'CT') return 'Neighbourhood (census tract)';
    if (p.level === 'PR') return 'Province';
    if (p.level === 'CA') return 'Country';
    return p.level;
  }

  var CSD_TYPE = {
    C: 'City', CY: 'City', T: 'Town', TP: 'Township', VL: 'Village',
    MU: 'Municipality', TV: 'Town/village', M: 'Municipality',
    IRI: 'First Nations reserve', S_É: 'Indian settlement',
    NO: 'Unorganised area', RM: 'Rural municipality'
  };
  D.CSD_TYPE = CSD_TYPE;

  function sum(v) {
    var t = 0;
    for (var i = 0; i < v.length; i++) if (v[i] != null) t += v[i];
    return t;
  }

  /* ------------------------------------------------------ raw vectors */

  var MEAS = { total: 0, home: 1, usual: 2 };

  D.workVec = function (code, measure) {
    var m = MEAS[measure || 'total'];
    if (D.ctWork && D.ctWork.data[code]) return D.ctWork.data[code][m];
    var w = D.work.data[code];
    return w ? w[m] : null;
  };

  D.resVec = function (code, year) {
    var r = D.res.data[code];
    return r ? (r[String(year)] || null) : null;
  };

  D.hasRes = function (code, year) { return !!D.resVec(code, year); };

  /* Which census years this area actually has residence-basis data for. */
  D.resYears = function (code) {
    var r = D.res.data[code];
    if (!r) return [];
    return D.res.years.filter(function (y) { return !!r[String(y)]; });
  };

  /* ------------------------------------------------ aggregation */

  /* Sum a set of areas into one vector. `requireAll` restricts the set to
     areas that have data - used to keep a reference economy internally
     consistent across two years. */
  D.aggregate = function (codes, getter) {
    var acc = null, used = [], missing = [];
    codes.forEach(function (c) {
      var v = getter(c);
      if (!v) { missing.push(c); return; }
      if (!acc) { acc = new Array(v.length); for (var z = 0; z < v.length; z++) acc[z] = 0; }
      for (var i = 0; i < v.length; i++) if (v[i] != null) acc[i] += v[i];
      used.push(c);
    });
    return { vec: acc, used: used, missing: missing };
  };

  /* Municipalities that make up a given reference geography. */
  D.membersOf = function (kind, place) {
    var key = { CD: 'cd', ER: 'er', CMA: 'cma' }[kind];
    if (!key) return [];
    var want = place[key];
    if (!want) return [];
    return (D.byLevel.CSD || []).filter(function (p) { return p[key] === want; })
      .map(function (p) { return p.code; });
  };

  /* ------------------------------------------ the reference economies */

  D.BENCHMARKS = [
    { id: 'ON', label: 'Ontario',
      why: 'Provincial policy context. The default, and the right one for most tribunal evidence.' },
    { id: 'CA', label: 'Canada',
      why: 'National context; the only choice that lets Ontario itself be the subject.' },
    { id: 'CD', label: 'Its census division',
      why: 'Regional-municipality context - Peel, York, Durham, or the county.' },
    { id: 'ER', label: 'Its economic region',
      why: 'Labour-market context. The unit Statistics Canada uses for regional labour data.' },
    { id: 'CMA', label: 'Its metropolitan area',
      why: 'How a suburb reads against the region it actually functions inside.' },
    { id: 'PEERS', label: 'Its peer group',
      why: 'Like-for-like: the statistically closest municipalities, excluding this one.' }
  ];

  /* Build a reference vector for one year and basis.

     Returns { vec, label, note, published, contributors, coverage }.

     `published` says whether the figure comes straight from a Statistics
     Canada table or was aggregated from municipalities here. That distinction
     matters: an aggregate is only as complete as its parts, and the note
     records how complete it was. */
  D.reference = function (kind, place, opt) {
    opt = opt || {};
    var basis = opt.basis || 'work';
    var measure = opt.measure || 'total';
    var year = opt.year || 2021;
    var peers = opt.peerCodes || [];

    var getter = basis === 'work'
      ? function (c) { return D.work.data[c] ? D.work.data[c][MEAS[measure]] : null; }
      : function (c) { return D.resVec(c, year); };

    if (kind === 'ON') {
      return published('35', 'Ontario', getter);
    }
    if (kind === 'CA') {
      return published('CA', 'Canada', getter);
    }
    if (kind === 'CD' && basis === 'work' && D.work.data[place.cd]) {
      var cdName = D.geo.cd_names[place.cd] || 'census division';
      return published(place.cd, cdName, getter);
    }

    var codes, label;
    if (kind === 'PEERS') {
      codes = peers.filter(function (c) { return c !== place.code; });
      label = 'peer group (' + codes.length + ' municipalities)';
    } else {
      codes = D.membersOf(kind, place);
      label = ({ CD: D.geo.cd_names[place.cd], ER: D.geo.er_names[place.er],
                 CMA: D.geo.cma_names[place.cma] })[kind] || kind;
    }
    if (!codes.length) return null;

    var agg = D.aggregate(codes, getter);
    if (!agg.vec) return null;
    return {
      vec: agg.vec, label: label, published: false,
      contributors: agg.used.length, expected: codes.length,
      coverage: codes.length ? agg.used.length / codes.length : 0,
      note: agg.missing.length
        ? ('Aggregated from ' + agg.used.length + ' of ' + codes.length +
           ' municipalities; ' + agg.missing.length + ' had no published figure '
           + (basis === 'work' ? '' : 'for ' + year) + '.')
        : ('Aggregated from all ' + agg.used.length + ' municipalities.')
    };

    function published(code, lbl, g) {
      var v = g(code);
      if (!v) return null;
      return {
        vec: v, label: lbl, published: true, contributors: null,
        coverage: 1,
        note: 'Published Statistics Canada figure, not an aggregate.'
      };
    }
  };

  /* A reference economy for a shift-share period: the same set of
     municipalities in both years, so the reference growth rate is not
     contaminated by areas entering or leaving the sample.

     For published references (Ontario, Canada) there is nothing to balance.
     For aggregates there is, and the balancing is the difference between a
     defensible reference growth rate and a fictional one. */
  D.referencePeriod = function (kind, place, y0, y1, opt) {
    opt = opt || {};
    var peers = opt.peerCodes || [];

    if (kind === 'ON' || kind === 'CA') {
      var code = kind === 'ON' ? '35' : 'CA';
      var a = D.resVec(code, y0), b = D.resVec(code, y1);
      if (!a || !b) return null;
      return {
        v0: a, v1: b, label: kind === 'ON' ? 'Ontario' : 'Canada',
        published: true, coverage: 1,
        note: 'Published Statistics Canada figures for both years.'
      };
    }

    var codes = kind === 'PEERS'
      ? peers.filter(function (c) { return c !== place.code; })
      : D.membersOf(kind, place);
    if (!codes.length) return null;

    var balanced = codes.filter(function (c) {
      return D.hasRes(c, y0) && D.hasRes(c, y1);
    });
    if (!balanced.length) return null;

    var A = D.aggregate(balanced, function (c) { return D.resVec(c, y0); });
    var B = D.aggregate(balanced, function (c) { return D.resVec(c, y1); });
    var label = kind === 'PEERS'
      ? 'peer group (' + balanced.length + ' municipalities)'
      : ({ CD: D.geo.cd_names[place.cd], ER: D.geo.er_names[place.er],
           CMA: D.geo.cma_names[place.cma] })[kind] || kind;

    return {
      v0: A.vec, v1: B.vec, label: label, published: false,
      coverage: balanced.length / codes.length,
      contributors: balanced.length, expected: codes.length,
      note: balanced.length === codes.length
        ? ('Aggregated from all ' + codes.length + ' municipalities, present in both years.')
        : ('Aggregated from the ' + balanced.length + ' of ' + codes.length +
           ' municipalities with published figures in both ' + y0 + ' and ' + y1 +
           '. Holding the set fixed keeps the reference growth rate honest; ' +
           'the excluded municipalities are listed in the export.')
    };
  };

  /* ---------------------------------------------- neighbourhood helpers */

  D.tractsIn = function (csdCode) {
    var out = [];
    Object.keys(D.ctCsd.data).forEach(function (ct) {
      D.ctCsd.data[ct].forEach(function (row) {
        if (row[0] === csdCode) out.push({ ct: ct, pop: row[1], share: row[2], primary: !!row[3] });
      });
    });
    out.sort(function (a, b) { return b.pop - a.pop; });
    return out;
  };

  D.tractLabel = function (code) {
    var p = D.byCode[code];
    var cma = p && p.cma ? (D.geo.cma_names[p.cma] || '') : '';
    var host = (D.ctCsd.data[code] || []).filter(function (r) { return r[3]; })[0];
    var hostName = host && D.byCode[host[0]] ? D.byCode[host[0]].name : '';
    return {
      title: 'Tract ' + code.slice(3),
      sub: [hostName, cma].filter(Boolean).join(' · ')
    };
  };

  /* Components of population change are published by census division only, so
     every geography resolves to the CD that contains it - and the interface
     says which one, because a municipality is not its census division. */
  D.componentsFor = function (place) {
    if (!D.components) return null;
    var cd = place.level === 'CD' ? place.code : place.cd;
    if (!cd) return null;
    var out = { cd: cd, cdName: D.geo.cd_names[cd] || cd, series: {} };
    Object.keys(D.components.data).forEach(function (v) {
      if (D.components.data[v][cd]) out.series[v] = D.components.data[v][cd];
    });
    return Object.keys(out.series).length ? out : null;
  };

  /* ------------------------------------------------------- occupation */

  /* Plain-English names for the ten broad occupation groups of the National
     Occupational Classification. Four words or fewer, because they are read
     as answer options; the official title stays alongside for the
     explanation. Labels, not facts - the grouping is Statistics Canada's. */
  D.NOC_SHORT = {
    '0': 'Senior managers',
    '1': 'Office and finance',
    '2': 'Science and technology',
    '3': 'Health care',
    '4': 'Education, law and social',
    '5': 'Arts, culture and sport',
    '6': 'Sales and service',
    '7': 'Trades and transport',
    '8': 'Farming and resources',
    '9': 'Factory and utilities'
  };

  /* What the people who LIVE in a place do for a living, largest first.
     Residence basis - it describes residents wherever they work, which is a
     different question from what the jobs located in the place are. */
  D.occupationFor = function (code) {
    var d = D.detail && D.detail.occupation[code];
    if (!d) return null;
    var tot = 0;
    d.forEach(function (t) { if (t && t[0]) tot += t[0]; });
    if (!tot) return null;
    return D.detail.noc_order.map(function (noc, i) {
      var t = d[i] || [null, null, null];
      return {
        noc: noc, short: D.NOC_SHORT[noc] || noc,
        title: D.detail.noc_labels[i].replace(/^\d+\s+/, ''),
        n: t[0], lo: t[1], hi: t[2],
        share: t[0] != null ? t[0] / tot : null
      };
    }).sort(function (a, b) { return (b.n || 0) - (a.n || 0); });
  };

  /* The published 95% interval on a 2021 residence-basis sector count. */
  D.sectorCI = function (code, i) {
    var d = D.detail && D.detail.sector_ci95[code];
    return d && d[i] ? d[i] : null;
  };

  /* Sampling error for a count that has no published interval - the
     place-of-work tables publish none. The standard deviation of a count runs
     at about 1.92 x sqrt(count): the median fitted to the 4,997 Ontario
     municipal sector cells that DO carry published intervals (98-10-0456).
     Borrowed, and every use of it says so. Combined with rounding (sd 2). */
  D.countSd = function (n) { return root.GRA.methods.countSd(n); };

  /* Natural increase and the three migration streams, per year. */
  D.componentSummary = function (byYear, vintage) {
    var net = vintage === '2021b';
    return Object.keys(byYear).map(function (y) {
      var d = byYear[y];
      var intl = (d.immigrants || 0)
        - (net ? (d.net_emigration || 0) : (d.emigrants || 0))
        + (net ? (d.net_npr || 0) : 0);
      return {
        year: +y,
        natural: (d.births || 0) - (d.deaths || 0),
        intraprovincial: d.net_intraprovincial || 0,
        interprovincial: d.net_interprovincial || 0,
        international: intl,
        births: d.births || 0, deaths: d.deaths || 0,
        immigrants: d.immigrants || 0
      };
    }).sort(function (a, b) { return a.year - b.year; });
  };

  /* -------------------------------------------------------- search */

  D.search = function (q, opts) {
    opts = opts || {};
    var levels = opts.levels || ['CSD', 'CD', 'ER', 'CMA', 'PR', 'CA'];
    q = (q || '').trim().toLowerCase();
    var pool = D.places.filter(function (p) { return levels.indexOf(p.level) >= 0; });
    if (opts.includeTracts && D.ctWork) {
      pool = pool.concat((D.byLevel.CT || []));
    }
    if (!q) {
      return pool.filter(function (p) { return p.level !== 'CT'; })
        .sort(bySize).slice(0, 60);
    }
    var starts = [], has = [];
    pool.forEach(function (p) {
      var n = p.name.toLowerCase();
      if (n.indexOf(q) === 0) starts.push(p);
      else if (n.indexOf(q) > 0 || p.code.indexOf(q) === 0) has.push(p);
    });
    starts.sort(bySize); has.sort(bySize);
    return starts.concat(has).slice(0, 80);
  };

  function bySize(a, b) {
    var lv = { CA: 0, PR: 1, ER: 2, CMA: 3, CD: 4, CSD: 5, CT: 6 };
    if (lv[a.level] !== lv[b.level]) return lv[a.level] - lv[b.level];
    return (b.pop2021 || 0) - (a.pop2021 || 0);
  }

  root.GRA = root.GRA || {};
  root.GRA.data = D;
}(this));
