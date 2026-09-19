/* ==========================================================================
   The brief - the finding, written out.

   This is a first draft a planner edits, not a fact to be pasted. It names the
   place, the benchmark, the period and the basis, states the direction and
   size of each effect, names the sectors driving it, and then states the
   caveats that apply to this particular result rather than a generic
   disclaimer.

   It reads aloud, because long analytical prose is easier to check by ear.
   ========================================================================== */

(function (root) {
  'use strict';

  var B = {};
  var D, M, C, A, U;

  function init() {
    D = root.GRA.data; M = root.GRA.methods; C = root.GRA.charts;
    A = root.GRA.app; U = root.GRA.ui;
  }

  function nm(place) {
    return place.level === 'CT' ? D.tractLabel(place.code).title : place.name;
  }

  function list(items, conj) {
    conj = conj || 'and';
    if (!items.length) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return items[0] + ' ' + conj + ' ' + items[1];
    return items.slice(0, -1).join(', ') + ' ' + conj + ' ' + items[items.length - 1];
  }

  function n(v, dp) { return C.fmt(v, dp); }

  /* ----------------------------------------------------- the paragraphs */

  B.compose = function (ctx) {
    var paras = [], cav = [];
    var place = ctx.place;
    var name = nm(place);

    if (!ctx.local || !ctx.ref) {
      /* Paragraphs are objects everywhere else; returning bare strings here
         rendered the word "undefined" on screen. */
      return {
        paras: [{ lede: true, text: 'Statistics Canada did not publish ' +
          'industry figures for ' + name + ', so there is nothing to ' +
          'summarise. Small areas are suppressed to protect confidentiality.' }],
        caveats: ['Try the census division or the economic region this sits ' +
          'inside - the same economy is usually published one level up.']
      };
    }

    /* ---- 1. what actually stands out about THIS place

       The findings engine ranks every proposition it can test against the
       provincial distribution. It is computed FIRST and its strongest result
       opens the brief, because a brief that always begins with the same three
       numbers is a template, and the jobs count, the jobs-per-resident ratio
       and self-containment are already the three hero tiles on the Overview
       tab - repeating them here spent the one paragraph a reader is certain
       to read. */
    var found = (root.GRA.findings ? root.GRA.findings.compute(ctx) : []) || [];
    var used = {};
    var lead = [];
    found.forEach(function (f) {
      /* One finding per theme, so the brief does not spend four paragraphs on
         commuting. */
      if (lead.length >= 4) return;
      if (used[f.tag] && f.score < 0.8) return;
      used[f.tag] = true;
      lead.push(f);
    });
    ctx._findings = found;

    var opener = null;
    for (var li = 0; li < lead.length; li++) {
      if (lead[li].canLede !== false) { opener = lead.splice(li, 1)[0]; break; }
    }
    if (opener) {
      /* Findings are written to sit INSIDE a brief, where "It" already has an
         antecedent. Promoted to the first sentence there is nothing in front
         of it, so a leading pronoun has to become the name. */
      var otext = opener.text
        .replace(/^It\b/, name)
        .replace(/^Its\b/, name + '’s');
      paras.push({ text: otext, lede: true });
    }

    /* ---- 2. what it is, in the round */
    var cm = ctx.commute;
    var lede = name + ' held ' + n(ctx.jobs) + ' jobs in the 2021 Census, ' +
      'counted where the work is done.';
    var ratio = ctx.jobsRatio;
    if (ratio != null) {
      lede += ' Set against the ' + n(ctx.residentWorkersFixed) + ' resident ' +
        'workers who can be matched to a workplace, that is ' +
        ratio.toFixed(2) + ' jobs for every ' +
        'resident worker — ' +
        (ratio >= 1.15 ? 'a net importer of workers, and on that ' +
            'measure an employment centre in its own right'
          : ratio <= 0.75 ? 'a net exporter of workers, which is to say ' +
            'more a place people live than a place people work'
          : 'close enough to balance that it is neither clearly an employment ' +
            'centre nor clearly a bedroom community') + '.';
    }
    if (cm) {
      lede += ' Of the ' + n(cm.usualResidents) + ' residents who have a usual ' +
        'place of work — the only ones the commuting table covers — ' +
        C.pct(cm.selfContainmentUsual, 0) + ' both live and work in the ' +
        'municipality.';
    }
    paras.push({ text: lede, lede: !opener });

    if (lead.length) {
      paras.push({ heading: 'What else stands out' });
      lead.forEach(function (f) { paras.push({ text: f.text }); });
    }

    /* ---- 3. structure */
    var specs = ctx.lq.filter(function (r) {
      return r.lq != null && r.lq >= 1.25 && r.flag === 'ok';
    }).sort(function (a, b) { return b.employment - a.employment; });

    var big = ctx.lq.slice().sort(function (a, b) {
      return (b.employment || 0) - (a.employment || 0);
    });

    var s2 = 'Its largest sectors are ' + list(big.slice(0, 3).map(function (r) {
      return D.naics[r.i].short.toLowerCase() + ' (' + n(r.employment) +
        ' jobs, ' + C.pct(r.share, 0) + ' of the total)';
    })) + '. ';

    if (specs.length) {
      s2 += 'Measured against ' + ctx.ref.label + ', it is over-represented in ' +
        list(specs.slice(0, 4).map(function (r) {
          return D.naics[r.i].short.toLowerCase() + ' (location quotient ' +
            r.lq.toFixed(2) + ')';
        })) + '. A location quotient above one means a larger share of local ' +
        'employment sits in that sector than in the reference economy; it says ' +
        'nothing about whether the sector is growing or profitable.';
    } else {
      s2 += 'No sector is meaningfully over-represented against ' +
        ctx.ref.label + ': on industry composition this is an unremarkable ' +
        'economy, which is itself worth saying plainly.';
    }
    paras.push({ text: s2 });

    var ind = ctx.indices;
    var s3 = 'On the summary indices, its specialisation against ' +
      ctx.ref.label + ' is ' + ind.coefSpecialisation.toFixed(3) +
      ' on a nought-to-one scale and its diversity is ' +
      ind.entropyNormalised.toFixed(3) + '. ' +
      (ind.hachman != null
        ? 'The Hachman index is ' + ind.hachman.toFixed(3) + ', so its mix ' +
          (ind.hachman > 0.85 ? 'is close to a scale model of the reference economy'
            : ind.hachman > 0.6 ? 'broadly tracks the reference economy with ' +
              'real departures'
            : 'departs substantially from the reference economy') + '. '
        : '');
    if (ctx.base.multiplier && !ctx.base.unstable) {
      s3 += 'By the location-quotient-excess method, ' +
        n(Math.round(ctx.base.basic)) + ' jobs — ' +
        C.pct(ctx.base.basicShare, 0) + ' of the total — serve demand from ' +
        'outside, implying a base multiplier of ' +
        ctx.base.multiplier.toFixed(2) + ' total jobs for every job in the ' +
        'export base. That method cannot see cross-hauling and assumes local ' +
        'productivity and spending match the reference, both of which push the ' +
        'multiplier up, so read it as a structural indicator rather than a ' +
        'forecasting tool.';
    } else if (ctx.base.multiplier) {
      s3 += 'The location-quotient-excess export base is not usable against ' +
        'this benchmark: only ' + C.pct(ctx.base.basicShare, 0) + ' of ' +
        'employment sits above ' + ctx.ref.label + '’s industry shares, ' +
        'so the multiplier divides by a small number and comes out at ' +
        ctx.base.multiplier.toFixed(1) + ', which is arithmetically correct ' +
        'and practically meaningless. A diversified economy measured against ' +
        'the region it sits inside has almost no location-quotient excess by ' +
        'construction. Benchmark against Canada, or against a peer group, ' +
        'before quoting an export base.';
    }
    paras.push({ text: s3 });

    /* ---- 3. change */
    var ch = ctx.change;
    if (ch && ch.result) {
      var t = ch.result.total;
      var u = ch.uncertainty;
      var s4 = 'Between ' + ch.y0 + ' and ' + ch.y1 + ', the resident labour ' +
        'force of ' + name + ' ' +
        (t.actual >= 0 ? 'grew by ' : 'fell by ') + n(Math.abs(t.actual)) +
        ' — from ' + n(t.start) + ' to ' + n(t.end) + ', a change of ' +
        C.signedPct(t.localGrowth) + ' against ' + C.signedPct(t.refGrowth) +
        ' in ' + ch.ref.label + '. Decomposed, ' + ch.ref.label +
        '’s own growth accounts for ' + C.signed(Math.round(t.national)) +
        ' jobs; its starting industry mix for ' + C.signed(Math.round(t.mix)) +
        '; and its own performance within those industries for ' +
        C.signed(Math.round(t.competitive)) + '.';
      paras.push({ text: s4 });

      var s5 = '';
      if (Math.abs(t.mix) > 2 * u) {
        s5 += t.mix > 0
          ? 'The mix effect is positive, which means it began the period ' +
            'concentrated in industries that went on to grow faster than the ' +
            'reference economy as a whole — a structural tailwind it did not ' +
            'have to earn. '
          : 'The mix effect is negative, which means it began the period ' +
            'concentrated in industries that went on to grow more slowly than ' +
            'the reference economy as a whole — a structural headwind that is ' +
            'not a reflection of local performance. ';
      } else {
        s5 += 'The mix effect is negligible: its starting composition was ' +
          'close to neutral against the reference. ';
      }

      if (Math.abs(t.competitive) > 2 * u) {
        s5 += t.competitive > 0
          ? 'The competitive effect is positive, so its industries did better ' +
            'here than the same industries did elsewhere. '
          : 'The competitive effect is negative, so its industries did worse ' +
            'here than the same industries did elsewhere. ';
      } else {
        s5 += 'The competitive effect of ' + C.signed(Math.round(t.competitive)) +
          ' jobs is inside the range that census rounding alone can produce ' +
          '(roughly ±' + n(2 * u) + '), so it should not be read as evidence of ' +
          'local advantage or disadvantage in either direction. ';
      }

      var drivers = ch.result.rows.slice()
        .filter(function (r) { return Math.abs(r.competitive) > 2 * u; })
        .sort(function (a, b) { return Math.abs(b.competitive) - Math.abs(a.competitive); });
      var gains = drivers.filter(function (r) { return r.competitive > 0; }).slice(0, 3);
      var losses = drivers.filter(function (r) { return r.competitive < 0; }).slice(0, 3);
      if (gains.length) {
        s5 += 'The competitive gains are concentrated in ' +
          list(gains.map(function (r) {
            return D.naics[r.i].short.toLowerCase() + ' (' +
              C.signed(Math.round(r.competitive)) + ')';
          })) + '. ';
      }
      if (losses.length) {
        s5 += 'The competitive losses are concentrated in ' +
          list(losses.map(function (r) {
            return D.naics[r.i].short.toLowerCase() + ' (' +
              C.signed(Math.round(r.competitive)) + ')';
          })) + '. ';
      }
      if (!gains.length && !losses.length) {
        s5 += 'No single sector’s competitive effect is large enough to ' +
          'stand out from rounding noise.';
      }
      paras.push({ text: s5 });

      /* allocation reading */
      var adv = ch.result.rows.filter(function (r) {
        return r.quadrant === 'competitive advantage' && r.start > 100;
      }).sort(function (a, b) { return b.emAllocation - a.emAllocation; });
      var dis = ch.result.rows.filter(function (r) {
        return r.quadrant === 'specialised disadvantage' && r.start > 100;
      }).sort(function (a, b) { return a.emAllocation - b.emAllocation; });
      if (adv.length || dis.length) {
        var s6 = 'Separating specialisation from performance in the ' +
          'Esteban-Marquillas manner, ';
        if (adv.length) {
          s6 += 'it is concentrated in — and also outperforming in — ' +
            list(adv.slice(0, 2).map(function (r) {
              return D.naics[r.i].short.toLowerCase();
            })) + ', which is the combination worth building on. ';
        }
        if (dis.length) {
          s6 += 'It is concentrated in — but underperforming in — ' +
            list(dis.slice(0, 2).map(function (r) {
              return D.naics[r.i].short.toLowerCase();
            })) + ', which is where a specialisation is working against it. ';
        }
        s6 += 'The allocation effect over all sectors comes to ' +
          C.signed(Math.round(t.emAllocation)) + ' jobs.';
        paras.push({ text: s6 });
      }
    }

    /* ---- 4. peers */
    var pe = ctx.peers;
    if (pe && pe.rows.length) {
      var s7 = 'Among the ' + pe.rows.length + ' most comparable ' +
        (place.level === 'CT' ? 'neighbourhoods' : 'municipalities') +
        ' — ' + list(pe.rows.slice(0, 4).map(function (r) {
          return nm(r.place);
        })) + (pe.rows.length > 4 ? ' and others' : '') + ' — ';
      var vals = pe.rows.map(function (r) {
        return r.place.area_km2 > 0 ? r.jobs / r.place.area_km2 : null;
      }).filter(function (v) { return v != null; });
      var mine = place.area_km2 > 0 ? ctx.jobs / place.area_km2 : null;
      var med = M.median(vals);
      if (mine != null && med != null) {
        s7 += name + ' carries ' + n(mine, 0) + ' jobs per square kilometre ' +
          'against a peer median of ' + n(med, 0) + '. ';
      }
      var sVals = pe.rows.map(function (r) {
        var i = r.vec ? M.structureIndices(r.vec, ctx.ref.vec) : null;
        return i ? i.coefSpecialisation : null;
      }).filter(function (v) { return v != null; });
      var sMed = M.median(sVals);
      if (sMed != null) {
        s7 += 'Its specialisation index of ' + ind.coefSpecialisation.toFixed(3) +
          ' is ' + (ind.coefSpecialisation > sMed * 1.15 ? 'above'
            : ind.coefSpecialisation < sMed * 0.85 ? 'below' : 'in line with') +
          ' the peer median of ' + sMed.toFixed(3) + '. ';
      }
      s7 += 'Peers were selected ' +
        (pe.mode === 'structural'
          ? 'by closeness of industry mix, ignoring size'
          : 'by Mahalanobis distance on ' + pe.features.length +
            ' standardised features, within the same settlement type') +
        ', and the method is set out on the Peers tab so it can be argued with.';
      paras.push({ text: s7 });
    }

    /* ---------------------------------------------------- the caveats */

    cav.push('<b>2021 was not a normal year.</b> The census measured the week ' +
      'of 2 to 8 May 2021, during public-health closures. Accommodation and ' +
      'food services, arts and recreation, and retail are understated against a ' +
      'normal year, and working at home is overstated. Any comparison that ' +
      'ends in 2021 carries that distortion, and the reference-growth term ' +
      'absorbs most but not all of it.');

    if (ctx.change && ctx.change.result) {
      cav.push('<b>Two different concepts of employment are in play.</b> The ' +
        'structural figures above count jobs by <i>place of work</i> — the ' +
        'local employment base. The change decomposition uses labour force by ' +
        '<i>place of residence</i>, because that is the only industry series ' +
        'Statistics Canada publishes across five censuses. Read the ' +
        'decomposition as a statement about the resident workforce, not about ' +
        'the jobs located here.');
    }

    if (ctx.change && ctx.change.available.indexOf(2011) >= 0 &&
        !ctx.state.skip2011) {
      cav.push('<b>2011 is a voluntary survey.</b> The National Household ' +
        'Survey replaced the mandatory long form that year, and its ' +
        'non-response bias is not comparable to a census. Any period that ' +
        'starts or ends in 2011 inherits that. The Change tab can chain around ' +
        'it.');
    }

    if (ctx.change && ctx.change.ref && !ctx.change.ref.published) {
      cav.push('<b>The reference economy is an aggregate.</b> ' +
        ctx.change.ref.note);
    }

    var weak = ctx.lq.filter(function (r) {
      return r.flag === 'weak' || r.flag === 'withheld';
    }).length;
    if (weak) {
      cav.push('<b>' + weak + ' of 20 sectors are at or below the reliability ' +
        'floor here.</b> Census counts are randomly rounded to a multiple of ' +
        'five, so a cell of 30 workers carries an error of the same order as ' +
        'the differences being discussed. Cells at or below ' +
        M.MIN_RELIABLE_CELL + ' are withheld and those at or below ' +
        M.WEAK_CELL + ' are marked weak.');
    }

    if (place.level === 'CT') {
      cav.push('<b>This is a census tract, not a neighbourhood as residents ' +
        'would draw it.</b> Tracts are statistical areas of 2,500 to 8,000 ' +
        'residents, and they are redrawn between censuses, which is why no ' +
        'change over time is offered at this scale.');
    }

    cav.push('<b>Shift-share is a decomposition, not an explanation.</b> The ' +
      'competitive effect is a residual: it is what is left after the ' +
      'reference growth rate and the industry mix are accounted for, and it ' +
      'carries every local factor — a single plant closing, a hospital ' +
      'opening, a boundary quirk, measurement error — in one number. It ' +
      'identifies where to look. It does not say why.');

    return { paras: paras, caveats: cav };
  };

  /* ----------------------------------------------------------- render */

  B.render = function (host, ctx, phone) {
    init();
    var out = B.compose(ctx);
    var place = ctx.place;

    var head = U.card(null, null);
    head.innerHTML =
      '<div class="eyebrow">Draft brief</div>' +
      '<h2 style="font-size:23px;margin:3px 0 8px">' + C.esc(nm(place)) +
      ' — economic context</h2>' +
      '<div style="font-size:13px;color:var(--ink-3);line-height:1.6">' +
      C.esc(place.kind) + ' · compared with ' + C.esc(ctx.ref ? ctx.ref.label : '—') +
      (ctx.change && ctx.change.result
        ? ' · change measured ' + ctx.change.y0 + ' to ' + ctx.change.y1 : '') +
      ' · 2021 Census' +
      '</div>';

    var btns = root.GRA.ui.h('<div class="ctlrow" style="margin:14px 0 0"></div>');
    var readBtn = root.GRA.ui.h('<button class="btn">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5z"/>' +
      '<path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg> Read it aloud</button>');
    var copyBtn = root.GRA.ui.h('<button class="btn">Copy as text</button>');
    btns.appendChild(readBtn);
    btns.appendChild(copyBtn);
    head.appendChild(btns);
    host.appendChild(head);

    var body = U.card(null, null);
    var prose = document.createElement('div');
    prose.className = 'prose';
    prose.innerHTML = out.paras.map(function (p, i) {
      if (p.heading) {
        return '<h3 style="font-size:14px;margin:1.6em 0 .5em;' +
          'text-transform:uppercase;letter-spacing:.07em;font-weight:650;' +
          'color:var(--ink-3)">' + C.esc(p.heading) + '</h3>';
      }
      return '<p' + (p.lede ? ' class="lede"' : '') + ' data-para="' + i + '">' +
        p.text + '</p>';
    }).join('');
    body.appendChild(prose);
    host.appendChild(body);

    var cav = U.card('What this cannot tell you',
      'These are the caveats that apply to this particular result, not a ' +
      'generic disclaimer. They belong in the report alongside the finding.');
    cav.appendChild(root.GRA.ui.h('<div class="prose"><div class="cav">' +
      out.caveats.map(function (t) { return '<p>' + t + '</p>'; }).join('') +
      '</div></div>'));
    host.appendChild(cav);

    var cite = U.card('How to cite this',
      'Paste this into the sources section. Every figure above traces to one ' +
      'of these tables.');
    var citations = (D.meta.sources || [])
      .filter(function (s) { return s.cite; })
      .map(function (s) { return s.cite; });
    cite.appendChild(root.GRA.ui.h('<div style="font-family:var(--mono);' +
      'font-size:12px;line-height:1.75;color:var(--ink-2)">' +
      citations.map(C.esc).join('<br>') + '</div>'));
    host.appendChild(cite);

    /* ------------------------------------------------- read aloud */

    function plainText() {
      var L = [nm(place) + ' — economic context.'];
      out.paras.forEach(function (p) {
        L.push(p.heading ? p.heading + '.' : strip(p.text));
      });
      L.push('What this cannot tell you.');
      out.caveats.forEach(function (t) { L.push(strip(t)); });
      return L.join('\n\n');
    }
    function strip(s) {
      return String(s).replace(/<[^>]+>/g, '')
        .replace(/—/g, ' — ').replace(/\s+/g, ' ').trim();
    }

    /* Read-aloud is a shared service (app/js/read.js) driven from the
       toolbar, so that every panel has it and not only this one. The brief
       keeps a button because this is the surface a reader expects one on, but
       it is the same engine: one queue, one position marker, and a Pause that
       does not lose your place. */
    var RD = root.GRA.read;
    if (!RD || !RD.available()) {
      readBtn.textContent = 'Read-aloud is not available in this browser';
      readBtn.disabled = true;
    } else {
      var paintRead = function (st) {
        readBtn.innerHTML = st === 'reading' ? 'Pause reading'
          : st === 'paused' ? 'Continue reading' : 'Read it aloud';
      };
      RD.onChange(paintRead);
      readBtn.addEventListener('click', function () {
        RD.toggle(document.getElementById('view'));
      });
    }

    copyBtn.addEventListener('click', function () {
      var text = plainText() + '\n\nSources\n' + citations.join('\n');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          copyBtn.textContent = 'Copied';
          setTimeout(function () { copyBtn.textContent = 'Copy as text'; }, 1600);
        });
      } else {
        root.GRA.exp.downloadText(text, 'brief.txt');
      }
    });

    B.lastText = function () {
      return plainText() + '\n\nSources\n' + citations.join('\n');
    };
  };

  root.GRA = root.GRA || {};
  root.GRA.brief = B;
}(this));
