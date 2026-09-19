/* ==========================================================================
   The export sheet.

   Every export carries its provenance. A number that leaves this tool can be
   traced back to a Statistics Canada table without anyone having to ask, and
   the workbook's first sheet states the place, the benchmark, the period, the
   basis, every method used and every caveat that applies.
   ========================================================================== */

(function (root) {
  'use strict';

  var E = {};
  var D, M, C, A, X;

  function init() {
    D = root.GRA.data; M = root.GRA.methods; C = root.GRA.charts;
    A = root.GRA.app; X = root.GRA.exp;
  }

  function nm(place) {
    return place.level === 'CT' ? D.tractLabel(place.code).title : place.name;
  }

  /* ------------------------------------------------- the table builders */

  /* Sector structure - the 2021 place-of-work table. */
  function structureTable(ctx) {
    var cols = [
      { key: 'naics', label: 'NAICS sector code', type: 'text', dbf: 'NAICS' },
      { key: 'sector', label: 'Sector name', type: 'text', dbf: 'SECTOR' },
      { key: 'group', label: 'Sector group', type: 'text', dbf: 'GROUP' },
      { key: 'jobs', label: 'Jobs located here, 2021', type: 'int', dbf: 'JOBS' },
      { key: 'share', label: 'Share of local jobs', type: 'pct', dbf: 'SHARE', dp: 5 },
      { key: 'refJobs', label: 'Reference jobs', type: 'int', dbf: 'REF_JOBS' },
      { key: 'refShare', label: 'Share of reference jobs', type: 'pct',
        dbf: 'REF_SHARE', dp: 5 },
      { key: 'lq', label: 'Location quotient', type: 'dec', dbf: 'LQ', dp: 4 },
      { key: 'band', label: 'Location quotient reading', type: 'text', dbf: 'LQ_READ' },
      { key: 'basic', label: 'Basic (export) jobs', type: 'int', dbf: 'BASIC' },
      { key: 'nonBasic', label: 'Local-serving jobs', type: 'int', dbf: 'NONBASIC' },
      { key: 'quality', label: 'Reliability flag', type: 'text', dbf: 'QUALITY' }
    ];
    var refTot = M.sum(ctx.ref.vec);
    var rows = ctx.lq.map(function (r) {
      var n = D.naics[r.i];
      var det = ctx.base.detail[r.i];
      return {
        _id: n.code, naics: n.code, sector: n.name, group: n.group,
        jobs: r.employment, share: r.share,
        refJobs: ctx.ref.vec[r.i], refShare: r.refShare,
        lq: r.lq, band: M.lqBand(r.lq),
        basic: det ? Math.round(det.basic) : null,
        nonBasic: det ? Math.round(det.nonBasic) : null,
        quality: r.flag
      };
    });
    return { name: 'Structure 2021', columns: cols, rows: rows,
             title: nm(ctx.place) + ' — industry structure, 2021 place of work',
             notes: ['Compared with ' + ctx.ref.label + '. ' + ctx.ref.note,
                     'Reference total: ' + C.fmt(refTot) + ' jobs.'],
             totals: { sector: 'Total', jobs: ctx.jobs, share: 1,
                       refJobs: refTot, refShare: 1,
                       basic: Math.round(ctx.base.basic),
                       nonBasic: Math.round(ctx.base.nonBasic) } };
  }

  /* Shift-share decomposition. */
  function changeTable(ctx) {
    var ch = ctx.change;
    if (!ch || !ch.result) return null;
    var cols = [
      { key: 'naics', label: 'NAICS sector code', type: 'text', dbf: 'NAICS' },
      { key: 'sector', label: 'Sector name', type: 'text', dbf: 'SECTOR' },
      { key: 'start', label: 'Labour force ' + ch.y0, type: 'int', dbf: 'LF_' + ch.y0 },
      { key: 'end', label: 'Labour force ' + ch.y1, type: 'int', dbf: 'LF_' + ch.y1 },
      { key: 'actual', label: 'Observed change', type: 'int', dbf: 'CHANGE' },
      { key: 'localGrowth', label: 'Local growth rate', type: 'pct',
        dbf: 'GR_LOCAL', dp: 5 },
      { key: 'refGrowth', label: 'Reference growth rate', type: 'pct',
        dbf: 'GR_REF', dp: 5 },
      { key: 'national', label: 'Reference growth effect', type: 'dec',
        dbf: 'EFF_REF', dp: 1 },
      { key: 'mix', label: 'Industry mix effect', type: 'dec', dbf: 'EFF_MIX', dp: 1 },
      { key: 'competitive', label: 'Competitive effect', type: 'dec',
        dbf: 'EFF_COMP', dp: 1 },
      { key: 'homothetic', label: 'Homothetic employment', type: 'dec',
        dbf: 'HOMOTH', dp: 1 },
      { key: 'emCompetitive', label: 'Competitive effect (Esteban-Marquillas)',
        type: 'dec', dbf: 'EM_COMP', dp: 1 },
      { key: 'emAllocation', label: 'Allocation effect (Esteban-Marquillas)',
        type: 'dec', dbf: 'EM_ALLOC', dp: 1 },
      { key: 'quadrant', label: 'Allocation reading', type: 'text', dbf: 'EM_READ' }
    ];
    var rows = ch.result.rows.map(function (r) {
      var n = D.naics[r.i];
      return {
        _id: n.code, naics: n.code, sector: n.name,
        start: r.start, end: r.end, actual: r.actual,
        localGrowth: r.localGrowth, refGrowth: r.refGrowth,
        national: r.national, mix: r.mix, competitive: r.competitive,
        homothetic: r.homothetic, emCompetitive: r.emCompetitive,
        emAllocation: r.emAllocation,
        quadrant: r.quadrant === 'undefined' ? '' : r.quadrant
      };
    });
    var t = ch.result.total;
    return {
      name: 'Shift-share ' + ch.y0 + '-' + ch.y1,
      columns: cols, rows: rows,
      title: nm(ctx.place) + ' — shift-share decomposition, ' + ch.y0 +
        ' to ' + ch.y1,
      notes: [
        'Basis: labour force by place of RESIDENCE (not place of work). ' +
          'This is the only industry series published across five censuses.',
        'Reference economy: ' + ch.ref.label + '. ' + ch.ref.note,
        'Identity check: the three effects sum to the observed change with a ' +
          'residual of ' + ch.identity.toFixed(6) + '.',
        'Census sampling and rounding can move any aggregate component by roughly ' +
          '+/- ' + C.fmt(Math.round(2 * ch.uncertainty)) + ' working residents.'
      ],
      totals: {
        sector: 'Total', start: t.start, end: t.end, actual: t.actual,
        localGrowth: t.localGrowth, refGrowth: t.refGrowth,
        national: t.national, mix: t.mix, competitive: t.competitive,
        homothetic: t.homothetic, emCompetitive: t.emCompetitive,
        emAllocation: t.emAllocation
      }
    };
  }

  function indexTable(ctx) {
    var ind = ctx.indices, base = ctx.base, cm = ctx.commute;
    var rows = [
      ['Jobs located here (place of work, incl. work at home)', ctx.jobs],
      ['Employed residents (all, place of residence)', ctx.employedResidents],
      ['Jobs per employed resident (all workers)',
       (ctx.employedResidents && ctx.jobs) ? ctx.jobs / ctx.employedResidents : null],
      ['Residents with a usual place of work', cm ? cm.usualResidents : null],
      ['Jobs at a usual workplace here', cm ? cm.usualJobsHere : null],
      ['Live and work here (usual workplace)', cm ? cm.liveAndWork : null],
      ['In-commuters (usual workplace)', cm ? cm.inCommuters : null],
      ['Out-commuters (usual workplace)', cm ? cm.outCommuters : null],
      ['Net commuting (usual workplace)', cm ? cm.netCommuting : null],
      ['Self-containment, usual-workplace basis',
       cm ? cm.selfContainmentUsual : null],
      ['Jobs per resident worker, usual-workplace basis',
       cm ? cm.jobsRatioUsual : null],
      ['Population, 2021 Census', ctx.place.pop2021],
      ['Land area, km2', ctx.place.area_km2],
      ['Jobs per km2', ctx.place.area_km2 > 0 ? ctx.jobs / ctx.place.area_km2 : null],
      ['Krugman specialisation index (0-2)', ind.krugman],
      ['Coefficient of specialisation (0-1)', ind.coefSpecialisation],
      ['Herfindahl-Hirschman index', ind.hhi],
      ['Herfindahl-Hirschman, normalised (0-1)', ind.hhiNormalised],
      ['Shannon entropy', ind.entropy],
      ['Shannon entropy, normalised (0-1)', ind.entropyNormalised],
      ['Hachman index (0-1)', ind.hachman],
      ['Sectors at location quotient 1.25 or more', ind.specialisations],
      ['Basic (export) jobs', base.basic],
      ['Local-serving jobs', base.nonBasic],
      ['Basic share of employment', base.basicShare],
      ['Economic base multiplier', base.multiplier]
    ];
    return {
      name: 'Indices',
      columns: [
        { key: 'indicator', label: 'Indicator', type: 'text', dbf: 'INDICATOR' },
        { key: 'value', label: 'Value', type: 'dec', dbf: 'VALUE', dp: 6 }
      ],
      rows: rows.map(function (r) {
        return { _id: r[0], indicator: r[0], value: r[1] };
      }),
      title: nm(ctx.place) + ' — summary indicators',
      notes: ['All indices computed against ' + ctx.ref.label + '.',
              'Specialisation and diversity are separate questions and are ' +
                'deliberately not combined into a score.']
    };
  }

  function peerTable(ctx) {
    var pe = ctx.peers;
    if (!pe || !pe.rows.length) return null;
    var cols = [
      { key: 'code', label: 'Geographic code', type: 'text', dbf: 'GEOCODE' },
      { key: 'name', label: 'Name', type: 'text', dbf: 'NAME' },
      { key: 'kind', label: 'Type', type: 'text', dbf: 'TYPE' },
      { key: 'role', label: 'Role', type: 'text', dbf: 'ROLE' },
      { key: 'distance', label: pe.mode === 'structural'
          ? 'Industry-mix distance' : 'Mahalanobis distance',
        type: 'dec', dbf: 'DISTANCE', dp: 5 },
      { key: 'pop', label: 'Population 2021', type: 'int', dbf: 'POP2021' },
      { key: 'jobs', label: 'Jobs located here', type: 'int', dbf: 'JOBS' },
      { key: 'jobDens', label: 'Jobs per km2', type: 'dec', dbf: 'JOB_DENS', dp: 2 },
      { key: 'ratio', label: 'Jobs per employed resident', type: 'dec',
        dbf: 'JOB_RATIO', dp: 4 },
      { key: 'selfc', label: 'Self-containment', type: 'pct', dbf: 'SELF_CONT', dp: 5 },
      { key: 'growth', label: 'Population change 2011-2021', type: 'pct',
        dbf: 'POPGROWTH', dp: 5 },
      { key: 'spec', label: 'Coefficient of specialisation', type: 'dec',
        dbf: 'SPEC', dp: 5 },
      { key: 'div', label: 'Diversity (normalised entropy)', type: 'dec',
        dbf: 'DIVERSITY', dp: 5 },
      { key: 'hach', label: 'Hachman index', type: 'dec', dbf: 'HACHMAN', dp: 5 }
    ];
    function row(r, role) {
      var p = r.place;
      var ind = (r.vec && ctx.ref) ? M.structureIndices(r.vec, ctx.ref.vec) : null;
      return {
        _id: r.code, code: r.code, name: nm(p), kind: p.kind, role: role,
        distance: r.distance, pop: p.pop2021, jobs: Math.round(r.jobs),
        jobDens: p.area_km2 > 0 ? r.jobs / p.area_km2 : null,
        ratio: p.jobsRatio,
        selfc: p.selfContainmentUsual,
        growth: p.popGrowth1121,
        spec: ind ? ind.coefSpecialisation : null,
        div: ind ? ind.entropyNormalised : null,
        hach: ind ? ind.hachman : null
      };
    }
    var rows = [row(pe.target, 'subject')].concat(
      pe.rows.map(function (r) { return row(r, r.pinned ? 'peer (pinned)' : 'peer'); }));
    return {
      name: 'Peers', columns: cols, rows: rows,
      title: nm(ctx.place) + ' — peer group',
      notes: [
        pe.mode === 'structural'
          ? 'Peers ranked by industry-mix distance (half the sum of absolute ' +
            'differences in sector shares). Size is not a criterion.'
          : 'Peers ranked by Mahalanobis distance on standardised features: ' +
            pe.features.join(', ') + '. Candidates restricted to the same ' +
            'Statistical Area Classification type before any distance was ' +
            'computed.',
        'Candidate pool: ' + pe.poolSize + '.',
        'Indices computed against ' + ctx.ref.label + '.'
      ]
    };
  }

  function tractTable(ctx) {
    if (!D.ctWork) return null;
    var place = ctx.place;
    var tracts;
    if (place.level === 'CSD') {
      tracts = D.tractsIn(place.code).map(function (t) { return t.ct; });
    } else if (place.level === 'CT') {
      tracts = (D.byLevel.CT || []).filter(function (p) { return p.cma === place.cma; })
        .map(function (p) { return p.code; });
    } else if (place.level === 'CMA') {
      tracts = (D.byLevel.CT || []).filter(function (p) { return p.cma === place.code; })
        .map(function (p) { return p.code; });
    } else if (place.level === 'ER') {
      tracts = (D.byLevel.CT || []).filter(function (p) { return p.er === place.er; })
        .map(function (p) { return p.code; });
    } else {
      tracts = (D.byLevel.CT || []).filter(function (p) { return p.cd === place.cd; })
        .map(function (p) { return p.code; });
    }
    tracts = tracts.filter(function (c) { return D.ctWork.data[c]; });
    if (!tracts.length) return null;

    var refVec = ctx.ref.vec, refTot = M.sum(refVec);
    var cols = [
      { key: 'code', label: 'Census tract UID', type: 'text', dbf: 'CTUID' },
      { key: 'host', label: 'Municipality', type: 'text', dbf: 'CSD_NAME' },
      { key: 'cma', label: 'CMA or CA', type: 'text', dbf: 'CMA_NAME' },
      { key: 'pop', label: 'Residents 2021', type: 'int', dbf: 'POP2021' },
      { key: 'area', label: 'Land area km2', type: 'dec', dbf: 'AREA_KM2', dp: 4 },
      { key: 'jobs', label: 'Jobs located here', type: 'int', dbf: 'JOBS' },
      { key: 'dens', label: 'Jobs per km2', type: 'dec', dbf: 'JOB_DENS', dp: 2 },
      { key: 'perRes', label: 'Jobs per resident', type: 'dec', dbf: 'JOB_PC', dp: 4 },
      { key: 'spec', label: 'Coefficient of specialisation', type: 'dec',
        dbf: 'SPEC', dp: 5 },
      { key: 'div', label: 'Diversity (normalised entropy)', type: 'dec',
        dbf: 'DIVERSITY', dp: 5 },
      { key: 'topSector', label: 'Largest sector', type: 'text', dbf: 'TOP_SECT' },
      { key: 'topLQ', label: 'Highest location quotient sector', type: 'text',
        dbf: 'TOP_LQ_S' }
    ];
    D.naics.forEach(function (n) {
      cols.push({ key: 'n' + n.code, label: n.code + ' ' + n.short + ' jobs',
                  type: 'int', dbf: 'J_' + n.code.replace('-', '') });
    });

    var rows = tracts.map(function (code) {
      var v = D.ctWork.data[code][0];
      var tot = M.sum(v);
      var p = D.byCode[code];
      var lab = D.tractLabel(code);
      var ind = tot ? M.structureIndices(v, refVec) : null;
      var lqs = tot ? M.locationQuotients(v, refVec) : [];
      var topJ = null, topL = null;
      v.forEach(function (x, i) {
        if (x != null && (!topJ || x > topJ.v)) topJ = { i: i, v: x };
      });
      lqs.forEach(function (r) {
        if (r.lq != null && r.flag === 'ok' && (!topL || r.lq > topL.lq)) topL = r;
      });
      var o = {
        _id: code, code: code, host: lab.sub.split(' · ')[0] || '',
        cma: p && p.cma ? (D.geo.cma_names[p.cma] || '') : '',
        pop: p ? p.pop2021 : null, area: p ? p.area_km2 : null,
        jobs: Math.round(tot),
        dens: (p && p.area_km2 > 0) ? tot / p.area_km2 : null,
        perRes: (p && p.pop2021) ? tot / p.pop2021 : null,
        spec: ind ? ind.coefSpecialisation : null,
        div: ind ? ind.entropyNormalised : null,
        topSector: topJ ? D.naics[topJ.i].short : '',
        topLQ: topL ? D.naics[topL.i].short : ''
      };
      D.naics.forEach(function (nn, i) {
        o['n' + nn.code] = (v[i] != null && v[i] > M.MIN_RELIABLE_CELL)
          ? v[i] : null;
      });
      return o;
    }).sort(function (a, b) { return (b.jobs || 0) - (a.jobs || 0); });

    return {
      name: 'Neighbourhoods', columns: cols, rows: rows,
      title: nm(ctx.place) + ' — census tracts, 2021 place of work',
      notes: [
        'Structure only. Census tract boundaries are redrawn between censuses, ' +
          'so tract figures are never differenced across census years.',
        'Sector cells at or below ' + M.MIN_RELIABLE_CELL + ' workers are left ' +
          'blank rather than published: at tract scale random rounding to 5 ' +
          'makes them unreadable.',
        'Indices computed against ' + ctx.ref.label + '.'
      ]
    };
  }

  function provinceTable(ctx) {
    var cols = [
      { key: 'code', label: 'CSDUID', type: 'text', dbf: 'CSDUID' },
      { key: 'name', label: 'Municipality', type: 'text', dbf: 'CSDNAME' },
      { key: 'kind', label: 'Type', type: 'text', dbf: 'CSDTYPE' },
      { key: 'cd', label: 'Census division', type: 'text', dbf: 'CDNAME' },
      { key: 'er', label: 'Economic region', type: 'text', dbf: 'ERNAME' },
      { key: 'cma', label: 'CMA or CA', type: 'text', dbf: 'CMANAME' },
      { key: 'sac', label: 'Settlement type', type: 'text', dbf: 'SACTYPE' },
      { key: 'pop', label: 'Population 2021', type: 'int', dbf: 'POP2021' },
      { key: 'area', label: 'Land area km2', type: 'dec', dbf: 'AREA_KM2', dp: 4 },
      { key: 'jobs', label: 'Jobs located here', type: 'int', dbf: 'JOBS' },
      { key: 'dens', label: 'Jobs per km2', type: 'dec', dbf: 'JOB_DENS', dp: 2 },
      { key: 'res', label: 'Employed residents', type: 'int', dbf: 'EMP_RES' },
      { key: 'ratio', label: 'Jobs per employed resident', type: 'dec',
        dbf: 'JOB_RATIO', dp: 4 },
      { key: 'selfc', label: 'Self-containment', type: 'pct', dbf: 'SELF_CONT', dp: 5 },
      { key: 'growth', label: 'Population change 2011-2021', type: 'pct',
        dbf: 'POPGROWTH', dp: 5 },
      { key: 'spec', label: 'Coefficient of specialisation vs Ontario',
        type: 'dec', dbf: 'SPEC_ON', dp: 5 },
      { key: 'div', label: 'Diversity (normalised entropy)', type: 'dec',
        dbf: 'DIVERSITY', dp: 5 },
      { key: 'hach', label: 'Hachman index vs Ontario', type: 'dec',
        dbf: 'HACHMAN', dp: 5 },
      { key: 'mult', label: 'Economic base multiplier', type: 'dec',
        dbf: 'BASE_MULT', dp: 4 },
      { key: 'compShift', label: 'Competitive effect, jobs', type: 'dec',
        dbf: 'COMP_EFF', dp: 1 },
      { key: 'compPer100', label: 'Competitive effect per 100 base jobs',
        type: 'dec', dbf: 'COMP_P100', dp: 3 },
      { key: 'mixEff', label: 'Industry mix effect, jobs', type: 'dec',
        dbf: 'MIX_EFF', dp: 1 }
    ];
    D.naics.forEach(function (n) {
      cols.push({ key: 'lq' + n.code, label: 'LQ ' + n.code + ' ' + n.short,
                  type: 'dec', dbf: 'LQ_' + n.code.replace('-', ''), dp: 4 });
    });

    var onVec = D.workVec('35', 'total');
    var y0 = ctx.change && ctx.change.y0 ? ctx.change.y0 : 2016;
    var y1 = ctx.change && ctx.change.y1 ? ctx.change.y1 : 2021;
    var r0 = D.resVec('35', y0), r1 = D.resVec('35', y1);

    var rows = D.csdCodes.map(function (code) {
      var p = D.byCode[code];
      var v = D.workVec(code, 'total');
      var tot = v ? M.sum(v) : null;
      var ind = (v && tot) ? M.structureIndices(v, onVec) : null;
      var bs = (v && tot) ? M.economicBase(v, onVec) : null;
      var lqs = (v && tot) ? M.locationQuotients(v, onVec) : [];
      var a = D.resVec(code, y0), b = D.resVec(code, y1);
      var ss = (a && b && r0 && r1) ? M.shiftShare(a, b, r0, r1) : null;
      var base = a ? M.sum(a) : null;
      var o = {
        _id: code, code: code, name: p.name, kind: p.kind,
        cd: D.geo.cd_names[p.cd] || '', er: D.geo.er_names[p.er] || '',
        cma: D.geo.cma_names[p.cma] || '',
        sac: (D.geo.sac_labels[p.sac] || '').split(' /')[0],
        pop: p.pop2021, area: p.area_km2, jobs: tot == null ? null : Math.round(tot),
        dens: (tot != null && p.area_km2 > 0) ? tot / p.area_km2 : null,
        res: p.allEmployedResidents == null ? null : Math.round(p.allEmployedResidents),
        ratio: p.jobsRatio,
        selfc: p.selfContainmentUsual,
        growth: p.popGrowth1121,
        spec: ind ? ind.coefSpecialisation : null,
        div: ind ? ind.entropyNormalised : null,
        hach: ind ? ind.hachman : null,
        mult: bs ? bs.multiplier : null,
        compShift: ss ? ss.total.competitive : null,
        compPer100: (ss && base) ? ss.total.competitive / base * 100 : null,
        mixEff: ss ? ss.total.mix : null
      };
      D.naics.forEach(function (nn, i) {
        o['lq' + nn.code] = lqs[i] ? lqs[i].lq : null;
      });
      return o;
    });

    return {
      name: 'All Ontario municipalities', columns: cols, rows: rows,
      title: 'All 577 Ontario municipalities — structure and shift-share',
      notes: [
        'Structure and location quotients: 2021 Census, place of work, against ' +
          'Ontario.',
        'Shift-share: ' + y0 + ' to ' + y1 + ', labour force by place of ' +
          'residence, against published Ontario totals.',
        'Blank means Statistics Canada published no figure, not zero.',
        'Join key CSDUID matches the Statistics Canada 2021 census subdivision ' +
          'boundary file (lcsd000b21a_e).'
      ]
    };
  }

  /* ------------------------------------------------------- cover sheet */

  function coverSheet(ctx, which) {
    var st = ctx.state;
    var ch = ctx.change;
    var blocks = [];

    blocks.push({ heading: 'What this is', lines: [
      ['Subject', nm(ctx.place) + ' (' + ctx.place.kind + ', code ' +
        ctx.place.code + ')'],
      ['Benchmark', ctx.ref ? ctx.ref.label : '—'],
      ['Benchmark note', ctx.ref ? ctx.ref.note : ''],
      ['Structure basis', st.measure === 'usual'
        ? '2021 Census, place of work, usual workplace only'
        : '2021 Census, place of work, including work at home'],
      ['Change basis', ch && ch.result
        ? ('Labour force by place of residence, ' + ch.y0 + ' to ' + ch.y1)
        : 'not included'],
      ['Sheets included', which.join(', ')],
      ['Produced', new Date().toLocaleString('en-CA')],
      ['Data build', D.meta.built_at],
      ['Tool', 'Hinterland']
    ] });

    blocks.push({ heading: 'Methods used', lines: [
      ['Shift-share', 'Classic three-way decomposition after Dunn (1960). ' +
        'Observed change = reference growth effect + industry mix effect + ' +
        'competitive effect. The three sum exactly to the observed change; ' +
        'the residual on this run was ' +
        (ch && ch.result ? ch.identity.toFixed(8) : 'n/a') + '.'],
      ['Competitive / allocation split', 'Esteban-Marquillas (1972). The ' +
        'competitive term is split using homothetic employment, so that ' +
        'specialisation no longer contaminates the measure of ' +
        'competitiveness. Competitive + allocation equals the classic ' +
        'competitive term.'],
      ['Chained decomposition', 'Barff and Knight (1988), applied when the ' +
        'chain option is on: each interval is decomposed with its own ' +
        'starting weights and the components are summed.'],
      ['Location quotient', 'LQ = (local share of sector) / (reference share ' +
        'of sector). Above 1.25 is read as a specialisation.'],
      ['Economic base', 'Location-quotient excess. Employment above the ' +
        'reference share is treated as basic. Known to understate the basic ' +
        'share because it cannot see cross-hauling, so the multiplier runs high.'],
      ['Specialisation', 'Krugman index (sum of absolute share differences, ' +
        '0 to 2) and the coefficient of specialisation (that halved).'],
      ['Diversity', 'Shannon entropy normalised to 0-1, and the ' +
        'Herfindahl-Hirschman index. Diversity and specialisation are ' +
        'different questions and are not combined.'],
      ['Similarity to reference', 'Hachman index, 1 / sum(s^2 / s_ref).'],
      ['Peer selection', 'Candidates restricted to the same Statistical Area ' +
        'Classification type, then ranked by Mahalanobis distance on ' +
        'standardised features. Mahalanobis rather than Euclidean because the ' +
        'size features are strongly correlated.'],
      ['Reliability', 'Census counts are randomly rounded to a multiple of 5, ' +
        'giving each cell a rounding error with standard deviation ' +
        M.ROUNDING_SD.toFixed(1) + '. ' +
        'Cells at or below ' + M.MIN_RELIABLE_CELL + ' workers are withheld; ' +
        'at or below ' + M.WEAK_CELL + ' they are flagged weak.'],
      ['Full statement', 'METHODS.md, supplied with the tool, gives each ' +
        'method in full with its literature reference and its known biases.']
    ] });

    var cav = [
      ['Definitional break before 2016',
        '2016 and 2021 both count the EMPLOYED labour force and are directly ' +
        'differenceable. 2001, 2006 and 2011 come from the Census Profile, ' +
        'which counted everyone reporting an industry - including unemployed ' +
        'people who last worked in one, roughly the unemployment rate more, ' +
        'and not spread evenly across industries. On Ontario 2016 the gap ' +
        'ran from 3.0% in finance and health care to 10.1% in mining, ' +
        'administrative services and the arts. A decomposition spanning ' +
        '2011 to 2016 or earlier therefore carries a break in the ' +
        'industry-mix and competitive terms. Statistics Canada publishes no ' +
        'employed-labour-force industry table below the census division for ' +
        'those years, so this cannot be closed from the published record.'],
      ['May 2021 reference week', 'The 2021 Census measured 2-8 May 2021, ' +
        'during public-health closures. Accommodation and food, arts and ' +
        'recreation, and retail are understated against a normal year; work at ' +
        'home is overstated. Any comparison ending in 2021 carries this.'],
      ['Two employment concepts', 'Structure uses place of work (the local ' +
        'employment base). Change uses place of residence (the resident ' +
        'workforce), because that is the only industry series published across ' +
        'five censuses. They are not interchangeable.'],
      ['2011', 'The 2011 figures come from the voluntary National Household ' +
        'Survey, whose non-response bias is not comparable to a census.'],
      ['NAICS versions', 'Sector codes are stable but not identical across ' +
        'NAICS 1997, 2002, 2007, 2012 and 2017. Two-digit sector comparisons ' +
        'are sound; do not read small sector-level changes as real.'],
      ['Municipal boundaries', 'Census subdivision codes are 2021 vintage. ' +
        'Ontario\'s large amalgamations predate 2001, but a small number of ' +
        'boundary changes since then are not reconciled.'],
      ['Census tracts', 'Tract boundaries are redrawn between censuses, so no ' +
        'change over time is offered at tract level.'],
      ['Shift-share is a decomposition', 'The competitive effect is a ' +
        'residual. It carries every local factor and every measurement error ' +
        'in one number. It shows where to look; it does not say why.']
    ];
    blocks.push({ heading: 'Caveats that apply to these numbers', lines: cav });

    blocks.push({ heading: 'Sources', lines:
      (D.meta.sources || []).map(function (s) {
        return [s.title, (s.cite || '') + '  —  CAVEATS: ' + s.caveats];
      }) });

    return { name: 'About this export', blocks: blocks,
             title: 'Hinterland — ' + nm(ctx.place) };
  }

  /* --------------------------------------------------------- the sheet */

  E.open = function (ctx) {
    init();
    if (!ctx || !ctx.local) {
      A.sheet('Nothing to export', '<div class="sheet-body"><p class="card-note">' +
        'There are no published figures for this place, so there is nothing to ' +
        'put in a file.</p></div>');
      return;
    }

    var opts = [
      { id: 'structure', label: 'Industry structure, 2021',
        note: '20 sectors, jobs, shares, location quotients, basic/non-basic split',
        on: true },
      { id: 'indices', label: 'Summary indicators',
        note: 'specialisation, diversity, Hachman, base multiplier, commuting',
        on: true },
      { id: 'change', label: 'Shift-share decomposition',
        note: ctx.change && ctx.change.result
          ? 'per sector, all effects, Esteban-Marquillas split'
          : 'not available for this place',
        on: !!(ctx.change && ctx.change.result),
        disabled: !(ctx.change && ctx.change.result) },
      { id: 'peers', label: 'Peer group and scorecard',
        note: ctx.peers && ctx.peers.rows.length
          ? ctx.peers.rows.length + ' peers with distances and indicators'
          : 'not available for this place',
        on: !!(ctx.peers && ctx.peers.rows.length),
        disabled: !(ctx.peers && ctx.peers.rows.length) },
      { id: 'tracts', label: 'Neighbourhood (census tract) table',
        note: 'every tract, all 20 sectors, structure only',
        on: false },
      { id: 'province', label: 'All 577 Ontario municipalities',
        note: 'the full provincial table — structure, indices and shift-share ' +
          'for every municipality. This is the one to join to boundaries.',
        on: false }
    ];

    var body =
      '<div class="sheet-body">' +
      '<p class="card-note" style="padding:0 8px">Every file carries its ' +
      'provenance: the workbook opens on a sheet naming the place, the ' +
      'benchmark, the period, every method used and every caveat that applies.</p>' +
      '<div class="group-label">What to include</div>' +
      opts.map(function (o) {
        return '<label class="opt" style="cursor:pointer">' +
          '<input type="checkbox" data-opt="' + o.id + '"' +
          (o.on ? ' checked' : '') + (o.disabled ? ' disabled' : '') +
          ' style="accent-color:var(--brand)">' +
          '<span class="nm"' + (o.disabled ? ' style="opacity:.5"' : '') + '>' +
          C.esc(o.label) + '<small>' + C.esc(o.note) + '</small></span></label>';
      }).join('') +
      '<div class="group-label">Format</div>' +
      '<div style="padding:4px 8px 12px;display:grid;gap:8px">' +
      (X.canDownload
        ? fmtBtn('xlsx', 'Excel workbook (.xlsx)',
                 'One sheet per table, plus the cover sheet. Frozen headers and filters.') +
          fmtBtn('csv', 'CSV files',
                 'One file per selected table. UTF-8 with a byte-order mark so Excel ' +
                 'opens accented names correctly.') +
          fmtBtn('dbf', 'DBF (.dbf, zipped)',
                 'dBase III attribute table for joining to boundaries already in a ' +
                 'GIS project. Field names are abbreviated to 10 characters and the ' +
                 'mapping ships alongside.') +
          fmtBtn('shp', 'Shapefile (.shp/.shx/.dbf/.prj, zipped)',
                 'Geometry and attributes together, WGS 84. Drag straight into QGIS ' +
                 'or ArcGIS.') +
          fmtBtn('geojson', 'GeoJSON', 'The same, for anything modern.') +
          fmtBtn('brief', 'The brief, as text',
                 'The written finding and its caveats, plus the citations.')
        : fmtBtn('copycsv', 'Copy the tables as CSV',
                 'Goes to the clipboard, ready to paste into a spreadsheet or an ' +
                 'email. Selected tables are separated by a blank line.') +
          fmtBtn('brief', 'Copy the brief',
                 'The written finding, its caveats and the citations.')) +
      '</div></div>' +
      '<div class="sheet-foot" id="expFoot">' +
      (X.canDownload
        ? 'Files save to your Downloads folder.'
        : 'This is the web version, which cannot save files to your device — ' +
          'the clipboard is the way out of it. Excel, DBF, shapefile and ' +
          'GeoJSON are in the desktop version.') +
      '</div>';

    var el = A.sheet('Take it away', body, { wide: true });

    function selected() {
      return opts.filter(function (o) {
        var cb = el.querySelector('[data-opt="' + o.id + '"]');
        return cb && cb.checked;
      }).map(function (o) { return o.id; });
    }

    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fmt]');
      if (!b) return;
      var fmt = b.getAttribute('data-fmt');
      var foot = el.querySelector('#expFoot');
      foot.textContent = 'Building…';
      setTimeout(function () {
        try {
          var r = run(ctx, fmt, selected());
          if (r && r.then) {
            r.then(function (msg) {
              foot.textContent = msg;
              root.GRA.sound.done();
            }).catch(function (err) { fail(foot, err); });
          } else {
            foot.textContent = X.canDownload
              ? 'Saved to your Downloads folder.'
              : 'Copied to the clipboard.';
            root.GRA.sound.done();
          }
        } catch (err) {
          fail(foot, err);
        }
      }, 30);
    });
  };

  function fail(foot, err) {
    console.error(err);
    foot.innerHTML = '<span style="color:var(--loss)">That export failed: ' +
      C.esc(err.message) + '</span>';
  }

  function fmtBtn(id, label, note) {
    return '<button class="opt" data-fmt="' + id + '" style="border:1px solid ' +
      'var(--line);background:var(--surface-2)">' +
      '<span class="nm">' + C.esc(label) + '<small>' + C.esc(note) +
      '</small></span><span class="kind">' +
      (X.canDownload ? 'save' : 'copy') + '</span></button>';
  }

  /* --------------------------------------------------------- execution */

  function build(ctx, ids) {
    var out = [];
    ids.forEach(function (id) {
      var t = null;
      if (id === 'structure') t = structureTable(ctx);
      if (id === 'indices') t = indexTable(ctx);
      if (id === 'change') t = changeTable(ctx);
      if (id === 'peers') t = peerTable(ctx);
      if (id === 'tracts') t = tractTable(ctx);
      if (id === 'province') t = provinceTable(ctx);
      if (t) out.push(t);
    });
    return out;
  }

  function run(ctx, fmt, ids) {
    var base = 'hinterland-' + X.slug(nm(ctx.place));

    if (fmt === 'brief') {
      var txt = root.GRA.brief.lastText
        ? root.GRA.brief.lastText()
        : (function () {
            var c = root.GRA.brief.compose(ctx);
            return c.paras.map(function (p) {
              return String(p.text).replace(/<[^>]+>/g, '');
            }).join('\n\n') + '\n\nWhat this cannot tell you\n\n' +
              c.caveats.map(function (t) {
                return String(t).replace(/<[^>]+>/g, '');
              }).join('\n\n');
          }());
      if (!X.canDownload) {
        return X.copyText(txt).then(function () {
          return 'The brief is on the clipboard.';
        });
      }
      X.downloadText(txt, base + '-brief.txt');
      return;
    }

    /* Clipboard handoff, for the web version where a download is inert. */
    if (fmt === 'copycsv') {
      if (ids.indexOf('tracts') >= 0 && !D.ctWork) {
        return D.loadTracts().then(function () { return run(ctx, fmt, ids); });
      }
      var tabs = build(ctx, ids);
      if (!tabs.length) throw new Error('nothing selected');
      var parts = provenanceLines(ctx, tabs).map(function (l) {
        return '# ' + l;
      });
      tabs.forEach(function (t) {
        parts.push('');
        parts.push('# ' + t.title);
        (t.notes || []).forEach(function (n) { parts.push('# ' + n); });
        parts.push(X.toCSV(t.columns, t.rows).replace(/\r\n$/, ''));
      });
      var text = parts.join('\r\n');
      return X.copyText(text).then(function () {
        var rows = tabs.reduce(function (a, t) { return a + t.rows.length; }, 0);
        return tabs.length + (tabs.length === 1 ? ' table' : ' tables') + ', ' +
          C.fmt(rows) + ' rows, on the clipboard.';
      });
    }

    if (ids.indexOf('tracts') >= 0 && !D.ctWork) {
      D.loadTracts().then(function () { run(ctx, fmt, ids); });
      return;
    }

    var tables = build(ctx, ids);
    if (!tables.length) throw new Error('nothing selected');

    if (fmt === 'xlsx') {
      var sheets = [coverSheet(ctx, tables.map(function (t) { return t.name; }))]
        .concat(tables);
      X.downloadXLSX(sheets, base + '.xlsx');
      return;
    }

    if (fmt === 'csv') {
      tables.forEach(function (t, i) {
        setTimeout(function () {
          X.downloadCSV(t.columns, t.rows,
            base + '-' + X.slug(t.name) + '.csv');
        }, i * 350);
      });
      return;
    }

    var readme = provenanceLines(ctx, tables);

    if (fmt === 'dbf') {
      tables.forEach(function (t, i) {
        setTimeout(function () {
          X.downloadDBF(t.columns, t.rows, base + '-' + X.slug(t.name),
                        readme.concat(t.notes || []));
        }, i * 400);
      });
      return;
    }

    /* Geometry exports need a table keyed to a boundary layer. */
    var geoTable = tables.filter(function (t) {
      return t.name === 'All Ontario municipalities' ||
             t.name === 'Neighbourhoods' || t.name === 'Peers';
    })[0];

    if (!geoTable) {
      throw new Error('a shapefile needs a table with one row per area — ' +
        'select "All 577 Ontario municipalities", the neighbourhood table, or ' +
        'the peer group');
    }

    var layer = geoTable.name === 'Neighbourhoods' ? 'ct' : 'csd';
    D.loadBoundaries(layer).then(function (fc) {
      var want = {};
      geoTable.rows.forEach(function (r) { want[r._id] = true; });
      var feats = fc.features.filter(function (f) { return want[f.properties.id]; });
      var byId = {};
      geoTable.rows.forEach(function (r) { byId[r._id] = r; });
      var ordered = feats.map(function (f) { return byId[f.properties.id]; });

      if (fmt === 'shp') {
        X.downloadShapefile(feats, geoTable.columns, ordered,
          base + '-' + X.slug(geoTable.name),
          readme.concat(geoTable.notes || [],
            ['Geometry: ' + (layer === 'ct'
              ? 'Statistics Canada 2021 census tract cartographic boundaries ' +
                '(lct_000b21a_e), generalised'
              : 'Statistics Canada 2021 census subdivision cartographic ' +
                'boundaries (lcsd000b21a_e), generalised') + ', reprojected to ' +
              'WGS 84 and simplified for display. Not suitable for precise area ' +
              'or boundary determination.']));
      } else {
        X.downloadGeoJSON(feats, ordered, base + '-' + X.slug(geoTable.name),
          { source: 'Hinterland', subject: nm(ctx.place),
            benchmark: ctx.ref.label, built: D.meta.built_at,
            notes: readme.concat(geoTable.notes || []) });
      }
    });
  }

  function provenanceLines(ctx, tables) {
    var ch = ctx.change;
    return [
      'Hinterland — ' + nm(ctx.place),
      'Subject: ' + nm(ctx.place) + ' (' + ctx.place.kind + ', ' +
        ctx.place.code + ')',
      'Benchmark: ' + (ctx.ref ? ctx.ref.label : '—'),
      'Structure: 2021 Census, place of work' +
        (ctx.state.measure === 'usual' ? ', usual workplace only' : ''),
      ch && ch.result
        ? 'Change: ' + ch.y0 + ' to ' + ch.y1 +
          ', labour force by place of residence'
        : 'Change: not included',
      'Produced: ' + new Date().toISOString(),
      'Data build: ' + D.meta.built_at,
      'Source: Statistics Canada. Full citations and caveats are on the ' +
        '"About this export" sheet of the Excel workbook.',
      'Blank means no published figure, not zero.'
    ];
  }

  root.GRA = root.GRA || {};
  root.GRA.exportUI = E;
}(this));
