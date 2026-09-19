# Hinterland

Shift-share, competitive and comparative analysis for Ontario municipalities and
neighbourhoods, on open Statistics Canada data. Runs entirely on this machine —
no account, no server, no network once it is built.

**To open it: double-click `Launch Hinterland.bat`.**
Run `Create Desktop Shortcut.bat` once and it lives on the Desktop.

---

## What it covers

| geography | how many | what you get |
|---|---|---|
| Municipalities (census subdivisions) | 577 | structure 2021 + shift-share across five censuses |
| Census divisions | 49 | the same |
| Economic regions | 11 | the same |
| Metropolitan areas and agglomerations | 47 | the same |
| Neighbourhoods (census tracts) | 2,533 | structure 2021 only — see below |

Twenty NAICS sectors throughout. Census years 2001, 2006, 2011, 2016 and 2021.

Census tracts are the finest geography for which Statistics Canada publishes
industry of employment, so they are as granular as this analysis can honestly
go. They exist only inside metropolitan areas and tracted agglomerations, so
rural Ontario has no neighbourhood tier, and their boundaries are redrawn
between censuses, so the tool does structure at that scale and refuses to
difference it over time.

## What it does

- **Shift-share** — the classic three-way decomposition, the
  Esteban-Marquillas split of the competitive effect into competitive and
  allocation components with its four-quadrant reading, and Barff-Knight
  chaining across intervals. The algebraic identity is displayed, not assumed.
- **Competitive analysis** — against a benchmark you choose: Ontario, Canada,
  the census division, the economic region, the CMA, or a statistically
  selected peer group. Changing the benchmark changes the answer, so it is a
  visible control rather than a hidden default.
- **Comparative analysis** — peer groups by Mahalanobis distance on a stated
  feature vector within the same settlement type, or by industry-mix distance
  regardless of size. Scorecards show the value, the peer median, the rank, the
  percentile and the whole distribution.
- **Structure** — location quotients, Krugman specialisation, Herfindahl and
  Shannon concentration, the Hachman index, and a location-quotient-excess
  economic base with its multiplier.
- **Commuting** — self-containment, net commuting and the jobs balance, on a
  clearly-labelled usual-workplace basis.
- **Maps** — choropleths of any of the above across all 577 municipalities or
  the tracts of a region, drawn in the Statistics Canada Lambert projection.
  It opens on **what people do here** — the broad kind of work that employs
  most people in each municipality — and clicking one answers that question in
  words before it gives you any counts.
- **Spatial statistics** — Moran's I with a permutation test, LISA cluster
  maps and Getis-Ord hot spots, with false-discovery-rate control. Answers
  whether the pattern on the map is real before anyone reads a story into it.
- **Functional labour markets** — travel-to-work areas rebuilt from the
  commuting matrix, so the region is where people actually travel to work
  rather than where a boundary falls.
- **Demography** — municipal population 2001–2025, and components of change by
  census division back to 1986: births, deaths, and migration split into
  within-Ontario, inter-provincial and international. Answers *why* a place
  grew, not just that it did.
- **A written brief** — led by a findings engine that ranks everything it can
  test against the provincial distribution and opens with whatever is actually
  distinctive about *this* place, rather than the same headings every time. With
  read-aloud.
- **Sound** — off by default, and it carries information rather than decorating
  clicks: the sector mix and the shift-share decomposition can be played as
  well as read, which is a fast way to hear the shape of a distribution and the
  only way a screen-reader user gets at the charts at all.
- **Exports** — Excel, CSV, DBF, shapefile and GeoJSON, every one carrying its
  provenance.

Full statement of every method, with its literature reference and its known
biases: **[METHODS.md](METHODS.md)**. What the source metadata actually says,
and the errors that audit found: **[design/DATA-AUDIT.md](design/DATA-AUDIT.md)**. The interaction design and what the tool
deliberately refuses to do: **[design/UX-AND-JOURNEY.md](design/UX-AND-JOURNEY.md)**.

## Phone

The app installs to a phone home screen and runs offline. Open the same address
on the phone while the launcher is running (the terminal window prints it), then
use the browser's *Add to Home Screen*. Phone mode is a different shape, not a
narrowed desktop: six thumb-reachable tabs, one hero number per screen, charts
with their labels drawn on instead of needing a cursor, and no timers anywhere.

## Exports, and getting them into GIS

Every export opens on a sheet naming the place, the benchmark, the period, the
basis, every method used, every caveat that applies and the full Statistics
Canada citations. A number that leaves this tool can be traced back to a table
number without asking anyone.

- **Excel (.xlsx)** — one sheet per analysis plus the cover sheet.
- **CSV** — one file per table, UTF-8 with a byte-order mark so Excel opens
  accented place names correctly.
- **DBF** — dBase III attributes for joining to boundaries already in a QGIS or
  ArcGIS project. Join on `CSDUID` or `CTUID`, which match the Statistics Canada
  2021 boundary files. Field names are abbreviated to the 10-character DBF limit
  and the mapping ships in `FIELD-NAMES.txt`.
- **Shapefile** — geometry and attributes together in WGS 84, with a `.prj`, so
  it opens without prompting. Drag the zip straight into QGIS.
- **GeoJSON** — the same, for anything modern.

For a provincial map, pick **All 577 Ontario municipalities** in the export
sheet: it carries structure, all twenty location quotients, the summary indices
and the shift-share effects for every municipality in one table.

## Checking it

```bash
python pipeline/validate.py
```

98 checks, all passing at the time of writing. Algebraic identities over all
4,667 municipality-by-census-pair decompositions; indices against cases where
the answer is known by construction; a worked shift-share example against hand
arithmetic; the Python reference implementation against the JavaScript port to
1 × 10⁻⁹ on real data; the data against published Statistics Canada totals; the
per-cell census rounding variance measured rather than assumed; and every export
format written for real and parsed back with an independent reader.

## Rebuilding the data

Only needed when Statistics Canada publishes something new, or after a fresh
checkout. The launcher does it automatically if the data is missing.

```bash
python pipeline/fetch.py          # downloads the sources (~470 MB, one time)
python pipeline/build.py          # builds data/analyst.db  (~10 minutes)
python pipeline/boundaries.py     # simplifies the map layers
python pipeline/export_web.py     # writes the app's JSON payloads
python pipeline/validate.py       # checks the result
```

`build.py` takes stage names, so one parser can be fixed and re-run without
re-reading fifty million CSV rows:

```bash
python pipeline/build.py business_counts io
```

After a rebuild, bump `VERSION` in `app/sw.js` to evict the offline cache.

## How it is put together

```
Hinterland/
├── Launch Hinterland.bat   ← double-click this
├── Create Desktop Shortcut.bat
├── METHODS.md                        ← every method, assumption and bias
├── README.md
├── design/UX-AND-JOURNEY.md            ← interaction design
├── pipeline/
│   ├── sources.py        every dataset, its purpose and its caveats
│   ├── fetch.py          downloads, reusing any local cache
│   ├── build.py          builds data/analyst.db
│   ├── boundaries.py     shapefile → simplified GeoJSON, pure stdlib
│   ├── export_web.py     database → the app's JSON payloads
│   ├── methods.py        the reference implementation of every method
│   ├── build_artifact.py builds the publishable web copy
│   ├── validate.py       the check suite
│   ├── export_selftest.js  drives the exporters under Node for validation
│   └── serve.py          the local server the launcher runs
├── data/
│   ├── analyst.db        87 MB SQLite — the built database
│   ├── legacy_residence_series.csv   the durable 2001-2016 series
│   └── raw/              the downloaded source files
└── app/
    ├── index.html
    ├── css/app.css
    ├── js/  methods.js data.js charts.js map.js export.js sound.js
    │         findings.js spatial.js ttwa.js brief.js exportui.js
    │         panels.js panel-population.js panel-region.js app.js
    └── data/             the JSON payloads the app loads (~4 MB)
```

No frameworks and no CDN. The charts, the map projection, the shapefile
reader, the ZIP writer, the Excel writer, the DBF writer and the shapefile
writer are all in the tree, which is why it works with the network off.

## Sources

All open Statistics Canada data. Declared with purpose and caveats in
`pipeline/sources.py`, surfaced in the app's Sources tab, and carried into every
export.

| table | what it is |
|---|---|
| 98-10-0491 | industry by place of work, municipalities and census divisions, 2021 |
| 98-10-0492 | industry by place of work, census tracts, 2021 |
| 98-10-0456 | industry by place of residence, 2021 |
| 95F0495XCB2001001, 94-581-XCB2006001, 99-004-XWE2011001, 98-401-X2016055 | industry by place of residence, 2001–2016 |
| 98-10-0459 | commuting flows, municipality to municipality, 2021 |
| 17-10-0155 | annual municipal population 2001–2025, on 2021 boundaries |
| 33-10-1097 | business counts by municipality, July 2025 |
| 36-10-0595 | Ontario input-output multipliers, 2022 |
| 92-151-X | 2021 geographic attribute file |
| 92-160-X | 2021 cartographic boundary files |

## Known limits

Read the *Not yet built* section of METHODS.md before relying on this for
anything load-bearing. The three that matter most:

1. **2021 was not a normal year.** The census measured 2–8 May 2021, during
   public-health closures. Accommodation and food, arts and recreation, and
   retail are understated; working at home is overstated, which moved jobs out
   of employment centres and into commuter suburbs. Every comparison ending in
   2021 carries this.
2. **Structure and change use different employment concepts.** Structure counts
   jobs by place of work; the change decomposition counts workers by place of
   residence, because that is the only industry series published across five
   censuses. They are not interchangeable, and the app says so on every panel.
3. **The competitive effect is a residual.** It carries every local factor and
   every measurement error in one number. It shows where to look. It does not
   say why, and the tool will not extrapolate it.

---

A personal tool. Statistics Canada data is used under the Statistics Canada
Open Licence; the analysis, the interpretation and any errors are mine.
