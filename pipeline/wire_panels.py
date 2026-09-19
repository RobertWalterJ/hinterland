"""One-off wiring: register the new tabs and attach the new cards.

Kept as a script rather than done by hand so the edits are reviewable and
repeatable. Safe to run twice - every replacement is guarded.
"""
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def patch(rel, pairs, must=True):
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding="utf-8").read()
    before = s
    for old, new in pairs:
        if new in s:                      # already applied
            continue
        if old not in s:
            if must:
                raise SystemExit("pattern not found in %s:\n%s" % (rel, old[:160]))
            continue
        s = s.replace(old, new, 1)
    if s != before:
        io.open(p, "w", encoding="utf-8").write(s)
        print("patched", rel)
    else:
        print("no change", rel)


# --------------------------------------------------------------- index.html
patch("app/index.html", [
    ('<script src="js/findings.js"></script>',
     '<script src="js/findings.js"></script>\n'
     '<script src="js/spatial.js"></script>\n'
     '<script src="js/ttwa.js"></script>'),
    ('<script src="js/app.js"></script>',
     '<script src="js/panel-population.js"></script>\n'
     '<script src="js/panel-region.js"></script>\n'
     '<script src="js/app.js"></script>'),
    # phone nav: population earns a slot; peers is a desktop analysis
    ('''  <button data-tab="peers">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
      <circle cx="8" cy="9" r="3"/><circle cx="17" cy="9" r="3"/>
      <path d="M3 20c0-2.8 2.2-5 5-5s5 2.2 5 5M14 20c0-2.8 1.6-5 4-5"/>
    </svg>
    Peers
  </button>''',
     '''  <button data-tab="population">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
      <circle cx="9" cy="7" r="3.2"/>
      <path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/>
      <path d="M17 4.5a3.2 3.2 0 0 1 0 6M18.5 13.8c1.9.9 3 2.8 3 5.2"/>
    </svg>
    People
  </button>'''),
])

# ------------------------------------------------------------------ app.js
patch("app/js/app.js", [
    ("""    { id: 'peers', label: 'Peers' },""",
     """    { id: 'peers', label: 'Peers' },
    { id: 'population', label: 'People' },"""),
    # population works at every level that has a census division
    ("""    ctx.can = {
      change: place.level !== 'CT',""",
     """    ctx.can = {
      population: place.level !== 'CT',
      change: place.level !== 'CT',"""),
    ("""        var off = (t === 'change' && !avail.change) ||
                  (t === 'peers' && !avail.peers) ||
                  (t === 'hoods' && !avail.neighbourhoods);""",
     """        var off = (t === 'change' && !avail.change) ||
                  (t === 'peers' && !avail.peers) ||
                  (t === 'population' && !avail.population) ||
                  (t === 'hoods' && !avail.neighbourhoods);"""),
])

# ---------------------------------------------------------------- panels.js
patch("app/js/panels.js", [
    # spatial card under the map, with cluster repaint
    ("""    afterLayout(function () {
      D.loadBoundaries('csd').then(function (fc) {
        var mp = root.GRA.map.create(mh, {
          layer: 'csd',
          onPick: function (code) { mp.select(code); showPeek(code); }
        });""",
     """    var mapRef = { mp: null, vals: vals, fmt: fmt, title: title, type: type };
    afterLayout(function () {
      D.loadBoundaries('csd').then(function (fc) {
        var mp = root.GRA.map.create(mh, {
          layer: 'csd',
          onPick: function (code) { mp.select(code); showPeek(code); }
        });
        mapRef.mp = mp;"""),
    ("""    ctx.mapTable = { rows: ranked, title: title, fmt: fmt };""",
     """    ctx.mapTable = { rows: ranked, title: title, fmt: fmt };

    /* Whether the pattern on the map is real, and the local clusters. */
    if (root.GRA.regionPanels) {
      root.GRA.regionPanels.spatialCard(host, ctx, vals, title, fmt,
        function (clusters) {
          if (!mapRef.mp) return;
          if (!clusters) {
            mapRef.mp.setData(mapRef.vals,
              { type: mapRef.type, title: mapRef.title, fmt: mapRef.fmt });
            return;
          }
          var CL = { HH: '--loss', LL: '--gain', HL: '--loss-3',
                     LH: '--gain-3', ns: '--mid' };
          var shown = {};
          Object.keys(clusters).forEach(function (code) {
            shown[code] = clusters[code].cluster;
          });
          mapRef.mp.colorOf = function () { return C.cssVar('--mid'); };
          mapRef.mp.values = mapRef.vals;
          Object.keys(mapRef.mp.nodes || {}).forEach(function (id) {
            var cl = shown[id] || 'ns';
            mapRef.mp.nodes[id].setAttribute('fill', C.cssVar(CL[cl]));
          });
          mapRef.mp.title = 'Local clusters';
          mapRef.mp.legendEl.hidden = true;
        });
    }"""),
    # functional labour market on the peers tab
    ("""    /* mix comparison against the peer aggregate */""",
     """    if (root.GRA.regionPanels) {
      root.GRA.regionPanels.labourMarketCard(host, ctx);
    }

    /* mix comparison against the peer aggregate */"""),
])

# --------------------------------------------------------------------- sw.js
patch("app/sw.js", [
    ("""  'js/export.js', 'js/sound.js', 'js/findings.js', 'js/brief.js',
  'js/exportui.js', 'js/panels.js', 'js/app.js',""",
     """  'js/export.js', 'js/sound.js', 'js/findings.js', 'js/spatial.js',
  'js/ttwa.js', 'js/brief.js', 'js/exportui.js', 'js/panels.js',
  'js/panel-population.js', 'js/panel-region.js', 'js/app.js',"""),
    ("var VERSION = 'gra-v5';", "var VERSION = 'gra-v6';"),
])

# ------------------------------------------------------- build_artifact.py
patch("pipeline/build_artifact.py", [
    ('''    "js/export.js", "js/sound.js", "js/findings.js", "js/brief.js",
    "js/exportui.js", "js/panels.js", "js/app.js",''',
     '''    "js/export.js", "js/sound.js", "js/findings.js", "js/spatial.js",
    "js/ttwa.js", "js/brief.js", "js/exportui.js", "js/panels.js",
    "js/panel-population.js", "js/panel-region.js", "js/app.js",'''),
    ('"data/business.json", "data/meta.json", "data/ct_csd.json",',
     '"data/business.json", "data/meta.json", "data/ct_csd.json",\n'
     '    "data/components.json",'),
])

print("done")
