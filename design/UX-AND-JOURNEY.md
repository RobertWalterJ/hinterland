# Hinterland — user experience and journey design

## Who uses this and what for

Three jobs, in the order they come up in practice.

1. **The fast answer.** A client, a councillor or a colleague asks something like
   "is manufacturing actually leaving Brantford, or does it just feel that way?"
   The answer needs to arrive in under a minute, be defensible, and be quotable.
2. **The report section.** Someone is writing the economic-context chapter of a
   planning justification report, a secondary plan, or a CPPS background study.
   They need a paragraph, two figures, a table, and a citation that survives
   scrutiny at the Ontario Land Tribunal.
3. **The GIS input.** Someone wants the numbers joined to boundaries in QGIS or
   ArcGIS, mapped to their own cartographic standard, in a project file.

The tool is designed so the fast answer is the front door and the other two are
one click from it. Nobody should have to learn the tool to get job 1.

## The spine of the journey

Every screen answers one question, and the questions are always in the same
order. This is the whole interaction model:

```
  WHERE            →   COMPARED TO WHAT   →   WHAT IS THERE   →   WHAT CHANGED
  a place              a benchmark            structure           shift-share
                                                  ↓                    ↓
                                             WHO IS LIKE IT   →   TAKE IT AWAY
                                                 peers            export
```

Two settings, chosen once, follow the user everywhere and are always visible in
the header: **the place** and **the benchmark**. Changing either re-computes
every panel. There is no hidden state and no modal that traps a setting — if a
number is on screen, the two things that determine it are on screen too.

### 1. Where — choosing a place

The opening screen is a single search box and a map. Type three letters and the
list narrows across all 577 municipalities, 49 census divisions, 11 economic
regions, 47 census metropolitan areas and agglomerations, and 2,534 census
tracts. Each result carries its kind and its size, so "Hamilton" resolves
unambiguously between the city, the census division and the CMA.

- The map is a selector, not decoration. Click a polygon to pick it.
- Recent places persist locally, because planners return to the same files.
- A neighbourhood (census tract) can be reached either by search or by drilling
  into a municipality, which is how people actually think about it.

**Empty state.** "Nothing picked yet. Ontario is large — start anywhere."

### 2. Compared to what — the benchmark

This is the decision that most tools hide and it is the one that changes the
answer most. A municipality that looks like it is failing against Ontario often
looks fine against its own census division. The tool makes the benchmark a
first-class control with five options, plainly labelled:

| Benchmark | When it is the right one |
|---|---|
| Ontario | The default. Provincial policy conversations, OLT evidence. |
| Canada | National-scale questions; cross-provincial comparisons. |
| Its census division | Regional-municipality context — Peel, York, Durham. |
| Its economic region | Labour-market context; the unit Statistics Canada uses. |
| Its CMA or CA | Metropolitan context; how a suburb reads against its region. |
| A peer group | Like-for-like: the eight statistically closest municipalities. |

Switching benchmark animates the numbers rather than replacing them, so the
user sees *that* the answer moved and by how much. That is the point.

### 3. What is there — structure

One screen, three reads, top to bottom:

- **The headline.** Jobs located here, employed residents, and the jobs-to-
  residents ratio as a hero number with a plain-language gloss: "1.34 jobs per
  employed resident — a net importer of workers."
- **The mix.** Twenty sectors as a ranked bar chart, with the location quotient
  beside each. Sorted by size by default, switchable to sort by LQ. Bars are one
  hue; the accent marks the sector under the cursor. Twenty colours would be
  twenty colours, which is no encoding at all.
- **The indices.** Specialisation, diversity, Hachman, and the economic-base
  multiplier, each as a small labelled dial with its own one-line explanation of
  what high and low mean. Never a composite score — four separate questions stay
  four separate answers.

### 4. What changed — shift-share

The analytical heart, and the screen that has to work hardest, because the
concept is unfamiliar to most people who need the result.

The page opens with the decomposition as a **waterfall**: observed change,
broken into the three effects, landing on the total. Read left to right it is a
sentence: *the province grew, which would have given you this; your mix of
industries was better or worse than average, worth this; and then your own
performance added or cost you that.*

- The three components use the diverging pair — cool for gain, warm for loss —
  with a grey zero line. Never a rainbow.
- A second panel breaks the competitive effect down by sector, so "we lost 900
  jobs of competitive share" becomes "and 740 of them were manufacturing."
- The Esteban-Marquillas split is available as a toggle, not a default. The
  four-quadrant reading — competitive advantage, specialised disadvantage,
  unexploited advantage, unspecialised disadvantage — is presented as a labelled
  scatter, because that is the only form in which the quadrants are legible.
- **Period is a control.** Any two of 2001, 2006, 2011, 2016, 2021, plus a
  chained option that runs every interval and sums the components, and a "skip
  2011" option because the 2011 National Household Survey was a voluntary
  survey and is not a like-for-like observation.
- **The identity check is shown, not hidden.** A quiet line under the waterfall:
  "components sum to observed change: exact." If it ever does not, the tool says
  so rather than rounding the discrepancy away.

### 5. Who is like it — peers

Peer selection is presented as a method the user can see and override, because
an unexplained peer list is worthless in front of a council.

- Candidates are first restricted to municipalities of a comparable **kind**,
  using the Statistical Area Classification. A town of 8,000 two hours from a
  city is not made comparable to a suburb by arithmetic.
- Within that pool, the eight closest by Mahalanobis distance on a stated
  feature vector: population, population growth, employment density, goods share,
  knowledge share, public-sector share, and self-containment.
- The feature list is visible and each feature can be switched off. The
  distances are shown. The user can pin or remove any peer by hand.
- A second tab offers **structural peers** — the municipalities whose industry
  mix is closest, regardless of size. "Who has an economy shaped like ours" is a
  different question from "who is our size," and conflating them is how peer
  groups go wrong.
- Results are a scorecard: the place's value, the peer median, its rank, and its
  percentile, per indicator. Rank without the distribution is a bad habit, so the
  distribution is drawn.

### 6. Take it away — export

The export button is in the header on every screen, never buried at the end of
a flow. It opens one sheet with the options set out plainly:

- **Excel (.xlsx)** — a workbook, not a dump: one sheet per analysis, a cover
  sheet carrying the place, benchmark, period, every method used, the full source
  citations with their caveats, and the build date.
- **CSV** — the current table, flat, UTF-8 with a BOM so Excel opens it cleanly.
- **DBF (dBase III)** — attributes only, for joining to boundaries already in a
  GIS project. Field names are truncated to the 10-character DBF limit and the
  mapping is written into the workbook and a companion `.txt`.
- **Shapefile (.shp/.shx/.dbf/.prj)** — geometry and attributes together, WGS 84,
  ready to drag into QGIS or ArcGIS.
- **GeoJSON** — the same, for anything modern.

Every export carries provenance. A number that leaves this tool can be traced
back to a Statistics Canada table number without asking anyone.

## The brief

A seventh screen, and the one that will get used most: **the brief**. The tool
writes the finding in plain English — three or four paragraphs naming the place,
the benchmark, the period, the direction and size of each effect, the sectors
driving it, and the caveats that apply to that specific result. It is a first
draft a planner edits, not a fact to be pasted.

It has a **read-aloud** button. Long analytical prose is exactly the kind of text
that is easier to check by ear.

## Phone mode

Not a narrowed desktop. A different shape for a different moment — standing in a
council chamber or a client's boardroom needing one number.

- Five bottom tabs: **Place · Now · Change · Peers · Map**. Thumb-reachable.
- One question per screen, one hero number per screen, and the supporting detail
  below the fold rather than beside it.
- Sector detail is a vertical list of tappable rows, not a chart that needs a
  cursor. Charts that require hover to be read are replaced by charts with their
  labels drawn on.
- Export on phone offers share-sheet handoff for the CSV and the brief; the
  shapefile path is desktop-only, because nobody opens a shapefile on a phone.
- It installs to the home screen and runs offline. All the data is local; there
  is no server to be out of reach of.
- **No timers and no countdowns**, anywhere, on either mode.

## Tone and feel

Contemporary, light, and quietly good-humoured — the way a well-made instrument
is pleasant to pick up. Specifically:

- Generous white space, a near-white canvas, ink for the chrome and colour
  reserved for data (the diverging blue-red pair means grew/shrank), type
  set in the system's variable sans so it looks native and loads instantly.
- Numbers in tabular figures so columns line up and changing values do not jitter.
- Motion is short and purposeful: numbers count to their new value when the
  benchmark changes, bars settle rather than snap, panels cross-fade. Nothing
  bounces.
- The whimsy lives in the microcopy and the empty states, never in the findings.
  Loading says "Counting jobs, one sector at a time." A result of exactly zero
  competitive shift says "Dead average. It happens."
- **The findings themselves stay sober.** No emoji in a number's label, no
  exclamation marks in a result, no traffic lights on a value that is merely
  different from the median. This is evidence that may end up in front of a
  tribunal, and it should read like it.

## What the tool refuses to do

Design is also what you leave out.

- **No composite ranking.** No "economic health score." Weighting indicators
  into a single number hides the weights and invites league tables that the data
  cannot support.
- **No forecasts.** Shift-share is a decomposition of what happened. The tool
  will not extrapolate a competitive effect forward, because the competitive
  effect is a residual and extrapolating a residual is not a projection.
- **No unreliable cells presented as findings.** Counts at or below 25 workers
  are withheld and labelled; between 26 and 50 they are shown and marked weak.
  The floor is stated on screen, not buried in a note.
- **No shift-share on census tracts.** Tract boundaries are redrawn between
  censuses. The tool does structure at tract level and says why it stops there.
- **No silent zeros.** A municipality missing from a census year is shown as
  missing, never as zero. Zero and unknown are different facts.
