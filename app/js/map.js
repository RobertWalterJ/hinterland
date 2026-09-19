/* ==========================================================================
   Choropleth map - inline SVG, no tile server, no dependencies.

   There is deliberately no aerial or street basemap. This map exists to show
   one variable across Ontario municipalities or census tracts, and imagery
   under a choropleth competes with the fill for attention while adding
   nothing a planner needs at this scale. It also means the tool works with no
   network at all, and that nothing about which places are being studied
   leaves the machine.

   Geometry is projected with the forward Lambert conformal conic that
   Statistics Canada publishes its boundary files in (NAD83 / Statistics Canada
   Lambert, EPSG:3347), so Ontario has the shape people recognise from census
   cartography rather than the stretched look of a web-Mercator frame.
   ========================================================================== */

(function (root) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------- forward projection */

  var A = 6378137.0, RF = 298.2572221008916;
  var FLAT = 1 / RF, E2 = 2 * FLAT - FLAT * FLAT, E = Math.sqrt(E2);
  var LAT1 = 49 * Math.PI / 180, LAT2 = 77 * Math.PI / 180;
  var LAT0 = 63.390675 * Math.PI / 180;
  var LON0 = -91.86666666666666 * Math.PI / 180;

  function mfn(phi) {
    return Math.cos(phi) / Math.sqrt(1 - E2 * Math.pow(Math.sin(phi), 2));
  }
  function tfn(phi) {
    var s = E * Math.sin(phi);
    return Math.tan(Math.PI / 4 - phi / 2) /
      Math.pow((1 - s) / (1 + s), E / 2);
  }
  var m1 = mfn(LAT1), m2 = mfn(LAT2);
  var t1 = tfn(LAT1), t2 = tfn(LAT2), t0 = tfn(LAT0);
  var nn = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
  var FF = m1 / (nn * Math.pow(t1, nn));
  var rho0 = A * FF * Math.pow(t0, nn);

  /* Returns SVG coordinates, not map coordinates. The projection's second
     component is a northing, which grows towards the north pole, while SVG's y
     axis grows downward - so it is negated here. Miss that and Ontario renders
     upside down, with Moosonee at the bottom of the frame.

     The false easting and northing are left off: the result is fitted to the
     viewport anyway, so a constant offset changes nothing. */
  function project(lon, lat) {
    var phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
    var rho = A * FF * Math.pow(tfn(phi), nn);
    var theta = nn * (lam - LON0);
    return [rho * Math.sin(theta), rho * Math.cos(theta) - rho0];
  }

  /* --------------------------------------------------------- the map */

  function create(host, opt) {
    opt = opt || {};
    var C = root.GRA.charts;
    var map = {
      host: host, layer: opt.layer || 'csd', onPick: opt.onPick || function () {},
      onHover: opt.onHover || null,
      values: null, fmtFn: C.fmt, colorOf: null,
      selected: null, paths: {}, order: [], bbox: null,
      k: 1, tx: 0, ty: 0, W: 100, H: 100
    };

    host.textContent = '';
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('role', 'img');
    /* role="img" without a name announces as an unnamed graphic. The
       caller always knows what it is drawing a map OF. */
    if (opt && opt.title) {
      var mt = document.createElementNS(SVGNS, 'title');
      mt.textContent = opt.title;
      svg.appendChild(mt);
      svg.setAttribute('aria-label', opt.title);
    }
    host.appendChild(svg);
    var gWorld = document.createElementNS(SVGNS, 'g');
    svg.appendChild(gWorld);
    /* Commuting flows sit above the fills and below the labels: a desire line
       that a place name can hide is no use, and a fill that hides the line is
       worse. */
    var gFlow = document.createElementNS(SVGNS, 'g');
    gFlow.setAttribute('pointer-events', 'stroke');
    svg.appendChild(gFlow);
    var gLabel = document.createElementNS(SVGNS, 'g');
    svg.appendChild(gLabel);
    map.svg = svg; map.gWorld = gWorld; map.gFlow = gFlow; map.gLabel = gLabel;

    /* controls */
    var ctl = document.createElement('div');
    ctl.className = 'mapctl';
    ctl.innerHTML =
      '<button data-z="in" title="Zoom in" aria-label="Zoom in">+</button>' +
      '<button data-z="out" title="Zoom out" aria-label="Zoom out">−</button>' +
      '<button data-z="fit" title="Fit Ontario" aria-label="Fit Ontario">⤢</button>';
    host.appendChild(ctl);
    ctl.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var z = b.getAttribute('data-z');
      if (z === 'fit') { map.fit(); return; }
      zoomAt(map.W / 2, map.H / 2, z === 'in' ? 1.5 : 1 / 1.5);
    });

    var legend = document.createElement('div');
    legend.className = 'maplegend';
    legend.hidden = true;
    host.appendChild(legend);
    map.legendEl = legend;

    var note = document.createElement('div');
    note.className = 'mapnote';
    note.textContent = 'Statistics Canada 2021 boundaries';
    host.appendChild(note);

    /* ---------------------------------------------------- geometry */

    map.setGeometry = function (fc) {
      map.paths = {}; map.order = [];
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      fc.features.forEach(function (f) {
        var id = f.properties.id;
        var polys = f.geometry.type === 'Polygon'
          ? [f.geometry.coordinates]
          : f.geometry.coordinates;
        var d = '';
        polys.forEach(function (rings) {
          rings.forEach(function (ring) {
            for (var i = 0; i < ring.length; i++) {
              var p = project(ring[i][0], ring[i][1]);
              if (p[0] < minX) minX = p[0];
              if (p[0] > maxX) maxX = p[0];
              if (p[1] < minY) minY = p[1];
              if (p[1] > maxY) maxY = p[1];
              d += (i ? 'L' : 'M') + (p[0] | 0) + ',' + (p[1] | 0);
            }
            d += 'Z';
          });
        });
        map.paths[id] = d;
        map.order.push(id);
      });
      map.bbox = [minX, minY, maxX, maxY];
      draw();
      map.fit();
      return map;
    };

    function draw() {
      gWorld.textContent = '';
      map.order.forEach(function (id) {
        var p = document.createElementNS(SVGNS, 'path');
        p.setAttribute('class', 'poly');
        p.setAttribute('d', map.paths[id]);
        p.setAttribute('fill', C.cssVar('--surface-sunk'));
        p.setAttribute('data-id', id);
        gWorld.appendChild(p);
      });
      map.nodes = {};
      Array.prototype.forEach.call(gWorld.childNodes, function (n) {
        map.nodes[n.getAttribute('data-id')] = n;
      });
      paint();
    }

    /* ------------------------------------------------------ paint */

    map.setData = function (valuesByCode, o) {
      o = o || {};
      map.values = valuesByCode;
      map.fmtFn = o.fmt || C.fmt;
      map.title = o.title || '';
      map.scaleType = o.type || 'seq';
      var vals = [];
      Object.keys(valuesByCode || {}).forEach(function (k) {
        var v = valuesByCode[k];
        if (v != null && isFinite(v)) vals.push(v);
      });
      vals.sort(function (a, b) { return a - b; });
      map.vals = vals;
      if (!vals.length) { map.colorOf = null; paint(); return map; }

      if (map.scaleType === 'cat') {
        /* Categorical fill. Capped at three hues on purpose: a choropleth is
           judged on every pair of colours at once, not just neighbouring ones
           in a legend, and past three the palette stops being distinguishable
           to a reader with normal colour vision, let alone a colourblind one.
           Five sector groups were tried and failed that gate. */
        map.categories = o.categories || [];
        map.colorOf = function (v) {
          if (v == null || !map.categories[v]) return C.cssVar('--surface-sunk');
          return C.cssVar(map.categories[v].slot);
        };
        map.domain = null;
        paint();
        renderLegend();
        return map;
      }
      if (map.scaleType === 'div') {
        /* Symmetric about zero, clipped to the 95th percentile of magnitude so
           one extreme municipality cannot flatten the rest of the province. */
        var mags = vals.map(Math.abs).sort(function (a, b) { return a - b; });
        var ext = mags[Math.floor(mags.length * 0.95)] || mags[mags.length - 1] || 1;
        map.extent = ext;
        map.colorOf = function (v) { return C.divColor(v, ext); };
        map.domain = [-ext, ext];
      } else {
        /* Quantile bins: economic variables across 577 municipalities are
           heavily skewed, and an equal-interval ramp would show one dark
           Toronto against 576 identical pale shapes. */
        var q = [];
        for (var i = 1; i <= 6; i++) q.push(vals[Math.floor(vals.length * i / 7)]);
        map.domain = [vals[0], vals[vals.length - 1]];
        map.bins = q;
        map.colorOf = function (v) {
          if (v == null || !isFinite(v)) return C.cssVar('--surface-sunk');
          var b = 0;
          while (b < q.length && v >= q[b]) b++;
          return C.cssVar('--seq-' + (b + 1));
        };
      }
      paint();
      renderLegend();
      return map;
    };

    function paint() {
      if (!map.nodes) return;
      Object.keys(map.nodes).forEach(function (id) {
        var n = map.nodes[id];
        var v = map.values ? map.values[id] : null;
        n.setAttribute('fill', map.colorOf ? map.colorOf(v)
                                           : C.cssVar('--surface-sunk'));
        n.classList.toggle('sel', id === map.selected);
      });
      if (map.selected && map.nodes[map.selected]) {
        gWorld.appendChild(map.nodes[map.selected]);   /* raise */
      }
    }

    function renderLegend() {
      if (map.scaleType === 'cat') {
        map.legendEl.hidden = false;
        map.legendEl.innerHTML =
          '<div style="font-weight:650;color:var(--ink-2)">' +
          C.esc(map.title) + '</div>' +
          (map.categories || []).map(function (c) {
            return '<div style="display:flex;align-items:center;gap:6px;' +
              'margin-top:3px"><i style="width:11px;height:11px;border-radius:3px;' +
              'background:' + C.cssVar(c.slot) + ';display:inline-block"></i>' +
              C.esc(c.label) + '</div>';
          }).join('');
        return;
      }
      if (!map.vals || !map.vals.length) { map.legendEl.hidden = true; return; }
      var steps = map.scaleType === 'div'
        ? ['--loss', '--loss-2', '--loss-3', '--loss-4', '--mid',
           '--gain-4', '--gain-3', '--gain-2', '--gain']
        : ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5', '--seq-6', '--seq-7'];
      map.legendEl.hidden = false;
      map.legendEl.innerHTML =
        '<div style="font-weight:650;color:var(--ink-2)">' + C.esc(map.title) + '</div>' +
        '<div class="ramp">' + steps.map(function (s) {
          return '<i style="background:' + C.cssVar(s) + '"></i>';
        }).join('') + '</div>' +
        '<div class="ends"><span>' + map.fmtFn(map.domain[0]) + '</span><span>' +
        map.fmtFn(map.domain[1]) + '</span></div>' +
        (map.scaleType === 'seq'
          ? '<div style="color:var(--ink-3);margin-top:2px">equal-count bins</div>'
          : '<div style="color:var(--ink-3);margin-top:2px">symmetric, clipped at the 95th percentile</div>');
    }

    /* ------------------------------------------------ view transform */

    function applyView() {
      gWorld.setAttribute('transform',
        'translate(' + map.tx + ',' + map.ty + ') scale(' + map.k + ')');
      gLabel.setAttribute('transform',
        'translate(' + map.tx + ',' + map.ty + ') scale(' + map.k + ')');
      gFlow.setAttribute('transform',
        'translate(' + map.tx + ',' + map.ty + ') scale(' + map.k + ')');
    }

    /* ------------------------------------------------ commuting flows

       `lines` is [{ from:[lon,lat], to:[lon,lat], value, dir, label }], where
       `dir` is 'in' for people arriving to work and 'out' for residents
       leaving to work elsewhere. The geometry is drawn in projected map units
       and rides the view transform like everything else, so panning and
       zooming need no special handling - but stroke widths must NOT scale with
       the zoom or a flow becomes a blob at high magnification, hence
       non-scaling-stroke.

       Lines are curved rather than straight for two reasons. A pair of
       municipalities usually exchanges workers in both directions, and two
       straight lines between the same points lie exactly on top of each other;
       bowing them to opposite sides separates the directions. And a bundle of
       straight lines radiating from one centroid reads as a starburst, which
       hides which links are long and which are local.

       Width is proportional to the SQUARE ROOT of the flow. A linear width
       makes Toronto's 60,000-worker link eighty times thicker than a
       750-worker one and the small links vanish; the eye reads quantity in a
       line's area rather than its width anyway.  */
    map.setFlows = function (lines, o) {
      o = o || {};
      gFlow.textContent = '';
      map.flowLines = lines || null;
      if (!lines || !lines.length) return map;

      var max = 0;
      lines.forEach(function (l) { if (l.value > max) max = l.value; });
      if (!max) return map;

      /* A stroke width in MAP units that will survive non-scaling-stroke:
         these are screen pixels, because non-scaling-stroke measures there. */
      var MINW = 1.2, MAXW = 9;

      lines.slice().sort(function (a, b) { return a.value - b.value; })
        .forEach(function (l) {
          var p1 = project(l.from[0], l.from[1]);
          var p2 = project(l.to[0], l.to[1]);
          var dx = p2[0] - p1[0], dy = p2[1] - p1[1];
          var len = Math.sqrt(dx * dx + dy * dy);
          if (!len) return;
          /* Control point offset perpendicular to the chord. The sign is the
             direction, so the two legs of a mutual pair bow apart. */
          var bow = (l.dir === 'in' ? 1 : -1) * len * 0.16;
          var cx = (p1[0] + p2[0]) / 2 - dy / len * bow;
          var cy = (p1[1] + p2[1]) / 2 + dx / len * bow;

          var w = MINW + (MAXW - MINW) * Math.sqrt(l.value / max);
          var path = document.createElementNS(SVGNS, 'path');
          path.setAttribute('d', 'M' + p1[0] + ',' + p1[1] +
            ' Q' + cx + ',' + cy + ' ' + p2[0] + ',' + p2[1]);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', C.cssVar(
            l.dir === 'in' ? '--gain' : '--loss'));
          path.setAttribute('stroke-width', w);
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-opacity', 0.72);
          path.setAttribute('vector-effect', 'non-scaling-stroke');
          path.style.cursor = 'crosshair';

          path.addEventListener('pointerenter', function (ev) {
            path.setAttribute('stroke-opacity', 1);
            C.showTip('<b>' + C.esc(l.label || '') + '</b>' +
              '<div class="r"><span>' +
              (l.dir === 'in' ? 'travel here to work' : 'travel there to work') +
              '</span><span>' + C.fmt(l.value) + '</span></div>', ev);
          });
          path.addEventListener('pointerleave', function () {
            path.setAttribute('stroke-opacity', 0.72);
            C.hideTip();
          });

          gFlow.appendChild(path);

          /* A dot at the WORKPLACE end. Direction on a curve is otherwise
             guesswork, and an arrowhead at this line weight is mush. */
          var dot = document.createElementNS(SVGNS, 'circle');
          dot.setAttribute('cx', p2[0]);
          dot.setAttribute('cy', p2[1]);
          dot.setAttribute('r', Math.max(1.5, w * 0.42));
          dot.setAttribute('fill', C.cssVar(
            l.dir === 'in' ? '--gain' : '--loss'));
          dot.setAttribute('vector-effect', 'non-scaling-stroke');
          dot.style.pointerEvents = 'none';
          gFlow.appendChild(dot);
        });
      return map;
    };

    map.fit = function (codes) {
      var bb = map.bbox;
      if (codes && codes.length) {
        var b = boundsOf(codes);
        if (b) bb = b;
      }
      if (!bb) return;
      var pad = 12;
      var w = bb[2] - bb[0], h = bb[3] - bb[1];
      map.k = Math.min((map.W - pad * 2) / w, (map.H - pad * 2) / h);
      map.tx = (map.W - w * map.k) / 2 - bb[0] * map.k;
      map.ty = (map.H - h * map.k) / 2 - bb[1] * map.k;
      applyView();
    };

    function boundsOf(codes) {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
      codes.forEach(function (c) {
        var d = map.paths[c];
        if (!d) return;
        var nums = d.match(/-?\d+/g);
        if (!nums) return;
        for (var i = 0; i + 1 < nums.length; i += 2) {
          var x = +nums[i], y = +nums[i + 1];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          any = true;
        }
      });
      return any ? [minX, minY, maxX, maxY] : null;
    }
    map.boundsOf = boundsOf;

    function zoomAt(px, py, factor) {
      var k2 = Math.max(0.2, Math.min(600, map.k * factor));
      var f = k2 / map.k;
      map.tx = px - (px - map.tx) * f;
      map.ty = py - (py - map.ty) * f;
      map.k = k2;
      applyView();
    }

    function resize() {
      var r = host.getBoundingClientRect();
      map.W = Math.max(60, r.width);
      map.H = Math.max(60, r.height);
      svg.setAttribute('viewBox', '0 0 ' + map.W + ' ' + map.H);
      svg.setAttribute('width', map.W);
      svg.setAttribute('height', map.H);
    }
    map.resize = function () {
      var oldW = map.W;
      resize();
      if (oldW && map.W !== oldW) map.fit(map.fitCodes);
      applyView();
    };
    resize();

    if (window.ResizeObserver) {
      new ResizeObserver(function () { map.resize(); }).observe(host);
    } else {
      window.addEventListener('resize', map.resize);
    }

    /* --------------------------------------------------- interaction */

    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = svg.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top,
             e.deltaY < 0 ? 1.18 : 1 / 1.18);
    }, { passive: false });

    var drag = null;
    svg.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch' && e.isPrimary === false) return;
      /* Record which polygon was pressed NOW. setPointerCapture retargets
         every later pointer event to the svg, so by the time pointerup fires
         e.target is the svg itself and the polygon under the cursor is no
         longer recoverable from the event. */
      drag = { x: e.clientX, y: e.clientY, tx: map.tx, ty: map.ty, moved: 0,
               id: (e.target && e.target.getAttribute)
                 ? e.target.getAttribute('data-id') : null };
      svg.classList.add('dragging');
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', function (e) {
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        map.tx = drag.tx + dx; map.ty = drag.ty + dy;
        applyView();
        return;
      }
      var id = e.target && e.target.getAttribute
        ? e.target.getAttribute('data-id') : null;
      if (id !== map.hovered) {
        if (map.hovered && map.nodes[map.hovered]) {
          map.nodes[map.hovered].classList.remove('hov');
        }
        map.hovered = id;
        if (id && map.nodes[id]) map.nodes[id].classList.add('hov');
      }
      if (id) {
        var v = map.values ? map.values[id] : null;
        var label = map.labelFor ? map.labelFor(id) : id;
        C.showTip('<b>' + C.esc(label) + '</b>' +
          (map.title ? '<div class="r"><span>' + C.esc(map.title) +
            '</span><span>' + (v == null ? '—' : map.fmtFn(v)) + '</span></div>' : ''),
          e);
      } else {
        C.hideTip();
      }
    });
    function endDrag(e) {
      if (!drag) return;
      var wasClick = drag.moved < 4;
      var id = drag.id;
      drag = null;
      svg.classList.remove('dragging');
      if (wasClick && id) map.onPick(id);
    }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', function () {
      drag = null; svg.classList.remove('dragging');
    });
    svg.addEventListener('pointerleave', function () {
      C.hideTip();
      if (map.hovered && map.nodes[map.hovered]) {
        map.nodes[map.hovered].classList.remove('hov');
      }
      map.hovered = null;
    });
    svg.addEventListener('dblclick', function (e) {
      var r = svg.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, 2);
    });

    /* two-finger pinch */
    var pts = {};
    svg.addEventListener('pointerdown', function (e) { pts[e.pointerId] = e; });
    svg.addEventListener('pointermove', function (e) {
      if (!(e.pointerId in pts)) return;
      pts[e.pointerId] = e;
      var ids = Object.keys(pts);
      if (ids.length !== 2) return;
      drag = null;
      var a = pts[ids[0]], b = pts[ids[1]];
      var dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (map._pinch) {
        var r = svg.getBoundingClientRect();
        zoomAt((a.clientX + b.clientX) / 2 - r.left,
               (a.clientY + b.clientY) / 2 - r.top,
               dist / map._pinch);
      }
      map._pinch = dist;
    });
    function clearPt(e) { delete pts[e.pointerId]; map._pinch = null; }
    svg.addEventListener('pointerup', clearPt);
    svg.addEventListener('pointercancel', clearPt);

    map.select = function (code, zoom) {
      map.selected = code;
      paint();
      if (zoom && map.paths[code]) {
        var b = boundsOf([code]);
        if (b) {
          var grow = Math.max((b[2] - b[0]), (b[3] - b[1])) * 1.4;
          var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
          map.fitCodes = null;
          var pad = 16;
          map.k = Math.min((map.W - pad * 2) / grow, (map.H - pad * 2) / grow);
          map.tx = map.W / 2 - cx * map.k;
          map.ty = map.H / 2 - cy * map.k;
          applyView();
        }
      }
      return map;
    };

    map.fitToCodes = function (codes) {
      map.fitCodes = codes;
      map.fit(codes);
      return map;
    };

    return map;
  }

  root.GRA = root.GRA || {};
  root.GRA.map = { create: create, project: project };
}(this));
