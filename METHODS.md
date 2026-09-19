# Hinterland — methods

Every method the tool uses, what it assumes, and what it cannot be trusted to
say. The reference implementation is `pipeline/methods.py`; `app/js/methods.js`
is a port of it, and `pipeline/validate.py` runs both over the same Ontario data
and asserts they agree to 1 × 10⁻⁹.

Notation throughout:

| symbol | meaning |
|---|---|
| eᵢⱼ | employment in industry *i*, area *j* |
| eⱼ | total employment in area *j* = Σᵢ eᵢⱼ |
| Eᵢ | employment in industry *i* in the reference economy |
| E | total reference employment |
| sᵢⱼ | eᵢⱼ / eⱼ — local industry share |
| sᵢ | Eᵢ / E — reference industry share |
| superscript 0, 1 | start and end of the period |

---

## 1. What is being counted

Two different concepts of employment are in play, and the tool never mixes
them. This is the single most common way municipal economic analysis goes
wrong.

**Place of work** (Statistics Canada tables 98-10-0491 and 98-10-0492) counts
jobs *located in* an area. It is the local employment base, and it is what a
competitive analysis of an economy is actually about. Available for 2021 only,
at census subdivision, census division and census tract level.

**Place of residence** (98-10-0456 and the earlier census and NHS profiles)
counts workers *living in* an area, by the industry they work in. It is the
skill profile of the resident workforce. A commuter suburb shows a large
professional-services labour force with almost no professional-services
establishments. It is the only industry series published across five censuses,
so it is what the shift-share decomposition runs on.

The interface labels every figure with its basis, and the change decomposition
carries a standing note that it describes the resident workforce rather than the
jobs located in the place.

A third distinction matters for commuting. The origin-destination table
(98-10-0459) covers only workers with a **usual place of work**. People who
worked at home, had no fixed workplace address, or worked outside Canada are not
in it at all. In 2021 that gap is enormous — the commuting table knows about
649,000 Toronto resident workers, while the city had 1,308,100 employed
residents. So the tool reports commuting measures on the usual-workplace basis,
says so, and never divides a place-of-work total by a commuting-derived
denominator.

---

## 2. Shift-share

### 2.1 Classic three-way decomposition (Dunn 1960)

With G = (E¹ − E⁰)/E⁰ the overall reference growth rate and Gᵢ = (Eᵢ¹ − Eᵢ⁰)/Eᵢ⁰
the reference growth rate of industry *i*:

| component | formula | reading |
|---|---|---|
| reference growth | eᵢⱼ⁰ · G | what the reference economy's overall growth alone would have delivered |
| industry mix | eᵢⱼ⁰ · (Gᵢ − G) | the bonus or penalty from starting out concentrated in industries that grew faster or slower than the whole |
| competitive | (eᵢⱼ¹ − eᵢⱼ⁰) − eᵢⱼ⁰ · Gᵢ | the residual: local performance in that industry against the same industry in the reference |

The three sum to the observed change **exactly**. That is an algebraic identity,
not an approximation, and the tool displays the residual rather than assuming
it. `validate.py` checks it over every Ontario municipality and every pair of
census years — 4,667 decompositions — with a worst residual of 3 × 10⁻¹¹ jobs,
which is floating-point noise.

The competitive term is computed as a residual rather than as eᵢⱼ⁰(gᵢⱼ − Gᵢ) so
that a zero base year cannot divide by zero. The two forms are algebraically
identical wherever gᵢⱼ exists. Where an industry had no base-year employment,
its growth rate does not exist, the whole observed change lands in the
competitive term, and the row is flagged — the tool says so rather than
crediting the place with competitiveness it did not earn.

### 2.2 Competitive and allocation effects (Esteban-Marquillas 1972)

Dunn's competitive term is proportional to the employment the area already held
in the industry, so a place that happens to be concentrated in an industry gets
a larger competitive score for the same relative performance. Specialisation
contaminates the measure of competitiveness.

The fix is *homothetic employment* — what the area would hold in industry *i* if
it had the reference industry mix at its own total size:

```
hᵢⱼ = eⱼ⁰ · (Eᵢ⁰ / E⁰)

competitive = hᵢⱼ · (gᵢⱼ − Gᵢ)             performance, size-neutral
allocation  = (eᵢⱼ⁰ − hᵢⱼ) · (gᵢⱼ − Gᵢ)     specialisation × performance
```

and competitive + allocation equals Dunn's competitive term exactly (also
asserted in validation). The sign pair gives a four-quadrant reading:

| specialised? | outperforming? | reading |
|---|---|---|
| yes | yes | competitive advantage |
| yes | no | specialised disadvantage |
| no | yes | unexploited advantage |
| no | no | unspecialised disadvantage |

The allocation effect is the interesting one for planning work, because its sign
answers whether a place is concentrated in the right things.

### 2.3 Chained decomposition (Barff and Knight 1988)

A single 2001-to-2021 decomposition weights everything by the industry mix of
2001, which by 2021 describes a manufacturing economy that no longer exists.
Twenty years is long enough for the base-year mix to quietly become the answer.
Chaining runs the decomposition over each interval with that interval's own
starting weights and sums the components. It also shows *where in the period*
the shift happened, which is usually the real question.

Where the single-period and chained competitive effects diverge sharply, the
base-year mix was doing a lot of work and the chained figure is the one to
quote. The interface says so on the panel.

### 2.4 What shift-share cannot do

The competitive effect is a **residual**. It is what is left after the reference
growth rate and the industry mix are accounted for, and it carries every local
factor and every measurement error in one number — a single plant closing, a
hospital opening, a boundary quirk, census rounding. It identifies where to
look. It does not say why.

The tool therefore does not extrapolate it. There are no forecasts, because
extrapolating a residual is not a projection.

---

## 3. Concentration and the economic base

### 3.1 Location quotient

```
LQᵢⱼ = (eᵢⱼ / eⱼ) / (Eᵢ / E) = sᵢⱼ / sᵢ
```

A concentration measure and nothing more. A high LQ says an industry is
over-represented, not that it is growing, profitable, or worth keeping. The
conventional bands the interface uses:

| LQ | reading |
|---|---|
| < 0.75 | under-represented |
| 0.75 – 1.25 | roughly at reference share |
| 1.25 – 2.0 | a specialisation |
| > 2.0 | a strong specialisation |

### 3.2 Economic base, by location-quotient excess

Employment above the reference share is treated as serving demand from outside:

```
basicᵢ = max(0, eᵢⱼ − eⱼ · sᵢ)
base multiplier = eⱼ / Σᵢ basicᵢ
```

Two known biases, both stated on screen rather than buried:

- The method assumes the area has the reference economy's productivity and
  consumption patterns. It never does.
- It cannot see cross-hauling. An area that both imports and exports the same
  good looks purely local.

Both push the basic share down, so the multiplier generally runs **high**. It is
a structural indicator, not a forecasting tool, and the tool does not use it to
project anything.

### 3.3 Flegg-Webber size adjustment

The plain LQ, used to scale a national or provincial coefficient down to a
region, ignores region size — and small regions leak far more of their spending
than large ones. Flegg and Webber multiply by

```
λ* = [log₂(1 + eⱼ/E)]^δ
```

which is below 1 for any region smaller than the reference and falls as the
region shrinks. δ is an elasticity fitted from survey-based regional tables;
Flegg and Webber (2000) put it in the 0.1–0.3 range and Flegg and Tohmo (2013)
settle near 0.25, which is the default here.

This is used only to temper provincial input-output multipliers before they are
applied to a municipality. It reduces the well-known upward bias; it does not
eliminate it, and no LQ-based adjustment substitutes for a survey-based regional
table.

### 3.4 Input-output impact

The impact panel answers "what would N more jobs in this industry imply?" with
Statistics Canada's Ontario input-output multipliers (36-10-0113), scaled down
to the municipality by the Flegg-Webber factor above.

**Why the 33-industry summary table and not the 246-industry detail table.**
The rest of the tool works in the 20 NAICS sectors. Aggregating 246 detail
industries into 20 sectors would need each industry's output as a weight, and
the multiplier tables do not publish output — so those weights would have to be
invented, and an invented weight is indistinguishable from a result. The 33
summary industries map onto NAICS with a concordance that fits on a page and is
checked in `pipeline/io_concordance.py`. Three industries span more than one
NAICS sector (finance, insurance, real estate and holding companies; non-profit
institutions) and are left whole rather than split on invented weights.
Owner-occupied dwellings, an imputed industry with no employment, is excluded.

**What the numbers are.** Type I multipliers count **direct plus indirect**
effects — the jobs in this industry and in its supply chain. Type II adds
**induced** effects — jobs supported when the workers in both spend their
wages. Both are dimensionless ratios of total to direct, so an employment
impact needs only a job count, not dollar output.

**What they cannot tell you.** They are **provincial** multipliers. Applying
them to a municipality overstates local capture, because a smaller economy buys
more of its inputs from outside itself; the Flegg-Webber factor reduces that
bias without removing it. They assume fixed technical coefficients, no capacity
constraints and no price response, so they say what the current structure
implies, not what will happen. The induced part rests on household spending
patterns holding, and is the least reliable part.

---

## 4. Specialisation and diversity

Four separate questions, deliberately not combined into a score. Diversity and
specialisation are not opposites and the tool never plots them on one axis: a
place can be broadly diversified and still hold one real specialisation.

| index | formula | range | question |
|---|---|---|---|
| Krugman specialisation | Σᵢ \|sᵢⱼ − sᵢ\| | 0 – 2 | how different is this mix from the reference mix? |
| coefficient of specialisation | Krugman / 2 | 0 – 1 | the same, rescaled |
| Herfindahl-Hirschman | Σᵢ sᵢⱼ² | 1/n – 1 | concentration within the area itself, no reference needed |
| HHI normalised | (HHI − 1/n)/(1 − 1/n) | 0 – 1 | the same, rescaled |
| Shannon entropy | −Σᵢ sᵢⱼ ln sᵢⱼ | 0 – ln n | diversity, weighting small industries more generously than HHI |
| entropy normalised | H / ln n | 0 – 1 | the same, rescaled |
| Hachman | 1 / Σᵢ (sᵢⱼ²/sᵢ) | 0 – 1 | how closely the area resembles the reference economy; 1 is a scale model of it |
| specialisations | count of LQ ≥ 1.25 | 0 – 20 | ignoring cells below the reliability floor |

Validation checks the known answers: an area identical to the reference scores
Krugman 0, Hachman 1, LQ 1 on every sector and zero basic employment; and every
index stays inside its theoretical range across all 3,068 Ontario geographies.

**Industry-mix distance** between two areas is ½ Σᵢ |sᵢⱼ − sᵢₖ| — Bray-Curtis
dissimilarity on compositional data, which is the same arithmetic as a Krugman
index taken between two areas rather than against a reference. Zero means
identical mixes, one means no overlap. It answers "who has an economy shaped
like this one", which is a different question from "who is our size".

---

## 5. Peer selection

An unexplained peer list is worthless in front of a council, so the method is
visible in the interface and every element of it can be overridden.

**Step 1 — restrict the candidates.** Only municipalities of a comparable kind,
using the Statistical Area Classification (census metropolitan area, tracted or
untracted agglomeration, strong / moderate / weak metropolitan influenced zone,
or no metropolitan influence). Arithmetic does not make a town two hours from a
city comparable to a suburb. Municipalities with fewer than 200 jobs are
excluded because their indices are dominated by rounding. If fewer than twelve
candidates survive, the search widens to the province and says so.

**Step 2 — rank by Mahalanobis distance** on a standardised feature vector:
log population, population change 2011–2021, log employment density, the
goods-producing share, the knowledge-services share, the public and
institutional share, and self-containment. Each feature can be switched off.

```
d² = (x − y)ᵀ S⁻¹ (x − y)
```

Mahalanobis rather than plain Euclidean because population, job count and
density are nearly the same variable wearing three hats: an area that differs on
size differs on all three and gets pushed away three times over. Dividing
through by the covariance structure makes correlated features count once. A
small ridge (10⁻³) is added to the covariance diagonal, because with these
features the raw matrix is close to singular; it is small enough not to disturb
the ranking and large enough to keep the inverse stable. If the inverse is still
degenerate the tool falls back to standardised Euclidean distance **and says
so** on the panel.

**Step 3 — the alternative question.** A second mode ranks by industry-mix
distance alone, ignoring size.

Results are reported as a scorecard with the peer's value, the peer median, the
rank and the percentile — and the whole peer distribution is drawn, because a
rank without its distribution hides whether the gap matters.

When "its peer group" is chosen as the benchmark, the subject is excluded from
its own reference economy.

---

## 6. Reference economies

The benchmark is the choice that moves the answer most, so it is a first-class
control rather than a hidden default. Six options: Ontario, Canada, the
municipality's census division, its economic region, its census metropolitan
area or agglomeration, or its peer group.

Ontario, Canada and census divisions are **published** Statistics Canada
figures. Economic regions, CMAs and peer groups are **aggregated** from
municipalities here, and the interface states which of the two any given
reference is, plus how complete the aggregate was.

For a shift-share period, an aggregated reference is built on a **balanced
panel** — the same set of municipalities in both years. Otherwise the reference
growth rate is contaminated by areas entering and leaving the sample, which is
the difference between a defensible growth rate and a fictional one. The
interface reports how many municipalities contributed and how many were
excluded.

---

## 7. Reliability

### 7.0 Labour-force universes across the five censuses

The five-census residence series does not sit on a single labour-force
universe, and this section records where the seam is, how big it is, and why it
is where it is.

**2016 and 2021 are directly comparable.** Both count the **employed** labour
force aged 15 and over, by place of residence, with the same five
place-of-work-status categories and the same twenty NAICS sectors:

| year | table | universe |
|---|---|---|
| 2021 | 98-10-0456 | employed labour force |
| 2016 | 98-400-X2016321 | employed labour force |

This was not originally the case. The 2016 leg was first taken from the Census
Profile, which counts everyone who **reported** an industry — including
unemployed people who last worked in one. Differencing that against 2021 put
approximately the unemployment rate into the change, and because unemployment
incidence varies sharply by industry the error did not cancel: on Ontario 2016
the gap ran from **3.0%** in finance and health care to **10.1%** in mining,
administrative services and the arts. It therefore landed on the industry-mix
and competitive terms, which is what the decomposition is read for. Summed
across sectors, Canada's series appeared to **fall 5.2%** between 2016 and 2021
— a period in which the employed labour force in fact grew. Re-sourcing 2016
from 98-400-X2016321 turns that into **+0.5%**.

**2001, 2006 and 2011 remain on the Census Profile universe.** Statistics
Canada does not publish an employed-labour-force industry tabulation below the
census division for those cycles: the 2011 National Household Survey equivalent
(99-012-X2011049) stops at census divisions, and the 2006 and 2001 highlight
tables cover only municipalities above 5,000 population. The break cannot be
closed from the published record at municipality level, so the tool states it
rather than hiding it, and shows the caveat whenever a chosen period spans
2011 to 2016 or earlier.

Two consequences worth holding onto:

- The period the tool opens on, **2016 to 2021, carries no labour-force
  universe break** — but it is not clean in two other respects. It carries
  the May 2021 reference week (section 1). And **one sector carries a
  classification break**: management of companies (NAICS 55) roughly
  doubles, from 11,890 to 25,260 in Ontario (+112%) and by +59% across
  Canada, and it does so almost uniformly — the median Ontario municipality
  with at least 100 such workers in 2016 exactly doubled. Growth does not
  arrive everywhere at once in equal measure; a change in how respondents
  were classified does. The 2016 leg is coded to NAICS 2012 and the 2021 leg
  to NAICS 2017, which is the likeliest cause, though the tool has not
  confirmed it against the concordance. Its sector-level competitive effect
  for this period is unreadable, and the Change panel says so. The sector is
  small — about 0.4% of Ontario's employed labour force — so its effect on
  a place's *total* is modest except in head-office municipalities.
  *This was missed when 2016 was re-sourced, and found by the quiz rigour
  review.*
- A decomposition reaching back before 2016 should be read as indicative at
  sector level. The 2011 leg additionally comes from the voluntary National
  Household Survey, whose non-response bias is not comparable to a census;
  the interface offers a *Skip 2011* toggle and a chained decomposition for
  exactly this reason.

`pipeline/validate.py` asserts that 2016 and 2021 agree on a universe — by
checking that Canada's total does not move in a direction the published
employed-labour-force figures rule out — so a future rebuild cannot silently
reintroduce the seam.

### 7.1 Random rounding

Census counts are randomly rounded to a multiple of 5, and the whole reliability
floor is derived from the variance that introduces.

Statistics Canada's random rounding is unbiased: a count with remainder
r = v mod 5 is published as v − r with probability (5−r)/5 and as v + (5−r) with
probability r/5. So the error is zero-mean with

```
E[e²] = r²(5−r)/5 + (5−r)²r/5 = r(5−r)
```

which, averaged over r uniform on {0,1,2,3,4}, gives **Var = 4, sd = 2.0**.

Note this is *not* the standard deviation of an error uniform on {−2,…,2}, which
would be √2 ≈ 1.41 — the error ranges over (−5, +5), not (−2.5, +2.5). An
earlier version of this tool used √2 and understated the uncertainty band by
about 40%.

The figure is confirmed empirically rather than assumed. The place-of-work
tables publish a total and its two components, each rounded independently, so
the spread of (total − home − usual) across all 64,470 Ontario cells implies a
per-cell standard deviation of **2.02** against the theoretical 2.00. Every
discrepancy is a multiple of five, the distribution is centred on zero, and the
largest is 20 jobs — exactly the signature of independent random rounding.
`validate.py` asserts all of this.

Consequences, applied throughout:

- A sum of *n* published cells carries sd = 2√n.
- A shift-share component aggregated over 20 industries across two years
  carries sd ≈ 2√40 ≈ 12.6 jobs, so the interface treats anything inside
  roughly ±25 jobs as no finding and says so on the panel.
- Cells at or below **25** workers are withheld; at or below **50** they are
  shown and flagged weak. The floor is stated on screen, not buried in a note.
- A municipality missing from a census year is shown as missing, never as zero.
  Zero and unknown are different facts.

This rounding error is separate from — and smaller than — the census long-form
sampling error, which the tool does not attempt to quantify.

---

### 7.2 Sampling error

Rounding is the floor below which a number cannot be read; **sampling error is
what actually dominates.** Industry and occupation come from the 2021 long-form
questionnaire, sent to one household in four, so every count is an estimate.

Table 98-10-0456 publishes a **95% confidence interval** for every count it
carries. Across the 4,997 Ontario municipal sector cells of at least 50
workers, the interval's half-width, divided by 1.96 and by the square root of
the count, has a median of **1.92**. So the standard deviation of a published
count runs at about

```
sd ≈ 1.92 × √count
```

— about 19 for a cell of 100 workers, about 190 for a cell of 10,000, against a
flat 2 for rounding. The two are combined in quadrature. The constant lives in
`methods.py` and `methods.js` (`SAMPLE_K`), and `validate.py` re-derives it from
the published intervals and fails if the two drift apart.

Where Statistics Canada publishes an interval, the tool uses it directly.
Where it does not — the place-of-work tables — the model above is borrowed, and
the interface says so.

**Every comparison the tool states is tested against this.** "A is larger than
B" is only stated where the gap exceeds three standard deviations of the
difference.

## 8. Geography

The geography spine is aggregated from the 137,867 Ontario dissemination blocks
in the 2021 geographic attribute file (92-151-X), which is the only source
carrying the full nesting — block to census subdivision to census division to
economic region to CMA to census tract — together with block population,
dwellings and land area. Aggregating up from blocks makes the population and
area denominators internally consistent at every level, and produces the census
tract to municipality correspondence for free. Census subdivision and census
division populations agree exactly (14,223,942 both ways), which is the check
that the aggregation is sound.

Two traps worth recording, both found and fixed during the build:

- **Census division and economic region codes collide.** Both are four digits,
  and 3510 is Frontenac as a census division and Ottawa as an economic region;
  five more pairs collide the same way. Stored naively in one table keyed by
  code, six census divisions silently vanished. Economic regions are now stored
  under an `ER` prefix.
- **There is a residual pseudo-tract.** Statistics Canada uses CMA codes
  997–999 for "outside any CMA or CA", and the tract identifier attached to
  them (9935.00) collects all non-tracted territory in the province — 2.2
  million people in a single row. It is not a neighbourhood and is excluded.

Boundaries are the 2021 cartographic (generalised) files, reprojected from
Statistics Canada Lambert (EPSG:3347) to WGS 84 with an inverse Lambert
conformal conic, and simplified with Douglas-Peucker at 250 m for
municipalities and 60 m for tracts — 1.1% and 6.0% of vertices retained. Every
area survives simplification, however small, because several First Nations
reserves and downtown tracts are smaller than the island-dropping threshold and
losing them would leave holes exactly where the data is most worth showing.

The map draws with a forward Lambert conformal conic using the same parameters,
so Ontario has the shape people recognise from census cartography rather than
the stretched look of a web-Mercator frame. There is no aerial or street
basemap: imagery under a choropleth competes with the fill and adds nothing at
this scale, and its absence means the tool works with no network at all and
nothing about which places are being studied leaves the machine.

---

## 9. The neighbourhood tier

Census tracts hold 2,500–8,000 residents and are the finest geography for which
Statistics Canada publishes industry of employment. Ontario has 2,533 of them,
and 2,529 have published employment figures.

Three limits, stated in the interface:

- **Structure only, 2021.** Tract boundaries are redrawn between censuses, so
  the tool never differences tract figures across census years. A change
  measured across redrawn boundaries is not a change.
- **Tracts exist only inside CMAs and tracted CAs**, so rural and small-town
  Ontario has no neighbourhood tier at all. This is a limit of the published
  data, not of the tool: below the municipality there is nothing finer with
  industry of employment attached.
- **The reliability floor bites hardest here.** A tract sector cell of 30
  workers carries a rounding error of the same order as the differences being
  discussed. Cells at or below 25 are withheld.

Tracts do not nest inside municipalities. Each tract records every municipality
it overlaps with the share of its resident population in each, and the largest
is flagged as primary. In Ontario only six tracts span a municipal boundary, but
the correspondence is carried rather than assumed.

---

## 10. Exports

All four writers are implemented from scratch so the tool has no network or
package dependency: a store-only ZIP, an OOXML workbook using inline strings, a
dBase III table, and an ESRI polygon shapefile.

Because they are hand-rolled, "it downloaded without throwing" is not evidence.
`pipeline/export_selftest.js` drives them under Node against deliberately
awkward fixtures — accented and non-Latin names, an embedded comma and quote,
nulls in numeric columns, column labels that collide once truncated to ten
characters, and polygons with interior rings and multiple parts — and
`validate.py` parses the bytes back with an independent reader and checks the
structures agree with themselves. Thirty-four checks cover this.

Notes on the formats:

- **Excel** opens on a cover sheet naming the place, the benchmark, the period,
  the basis, every method used, every caveat that applies and the full source
  citations. Headers are frozen and filtered.
- **CSV** carries a byte-order mark, because Excel on Windows otherwise mangles
  any accented place name in a UTF-8 file.
- **DBF** caps field names at 10 characters, so names are abbreviated, collisions
  are made unique (`SPECIALISA`, `SPECIALIS2`), and the mapping ships in a
  companion `FIELD-NAMES.txt`. Text is transliterated to ASCII deliberately
  rather than stripped — Ontario place names are full of en-dashes, and
  "Kitchener-Waterloo" is a usable label where "KitchenerWaterloo" is not. A
  missing numeric is blank, never zero.
- **Shapefile** ships `.shp`, `.shx`, `.dbf`, `.prj` and `.cpg`. The `.prj`
  names WGS 84 so QGIS and ArcGIS open it without prompting. The join key is
  CSDUID or CTUID, which match the Statistics Canada 2021 boundary files.

---

## 11. Spatial dependence

Every method above treats Ontario's municipalities as independent
observations. They are not, and that dependence is usually the finding rather
than a nuisance.

**Weights.** k-nearest neighbours on population-weighted centroids, k = 6,
row-standardised, with great-circle distances. Contiguity is the textbook
default and is wrong here: Ontario has island municipalities and First Nations
reserves with no land neighbour, and a contiguity matrix gives them an empty
row, dropping them from every statistic silently. k-nearest also keeps the
weights comparable between the dense south, where a municipality may touch
twenty others, and the sparse north, where it touches two.

**Global Moran's I**, with the n/S0 term cancelling under row-standardised
weights, so I is the ratio of each value's cross-product with its spatial lag
to the total variance. Inference by permutation, not by the normal
approximation.

**Local Moran's I (LISA)** with *conditional* permutation — area i keeps its
own value while the others are reshuffled among its neighbours, which is the
correct null for a local statistic. The four-quadrant reading (high among high,
low among low, and the two outlier cases) is the interpretation.

**Getis-Ord Gi\*** for hot and cold spots, which asks whether a neighbourhood
including the area itself is an unusually high or low total — a different
question from whether an area is unlike its neighbours.

**Multiple comparisons.** Running 554 simultaneous local tests at p < 0.05
produces about 28 significant results from pure noise, so a Benjamini-Hochberg
false-discovery-rate correction is applied and the uncorrected count is never
shown as a finding.

**Permutation resolution is a real constraint, not a detail.** A permutation
test with P permutations cannot produce a p-value below 1/(P+1). Benjamini-
Hochberg needs the smallest p-value to clear alpha/n, which for 489
municipalities is 0.0001 — a figure 999 permutations physically cannot reach.
At 999 permutations the correction therefore rejected *everything*, regardless
of how strongly clustered the data was. LISA now runs 9,999 permutations, and
where the test still cannot reject, the interface says the test was
underpowered rather than reporting "no clusters" as though it were a result.

Permutation seeds are fixed, so a p-value quoted from the screen reproduces
exactly. An unseeded shuffle gives a slightly different figure every time the
page is opened, which is indefensible in a report.

*Validated against constructed cases: a spatial gradient returns I = 0.96
(p = 0.002), a checkerboard returns I = −0.83, and random values return I =
−0.014 against an expected −0.007 at p = 0.80.*

**Categorical maps are capped at three colours.** A choropleth is judged on
every pair of fills at once, not just the ones adjacent in a legend, and past
three categories the colours stop being reliably distinguishable. The five
sector groups used elsewhere in the tool were run against the colourblind
safety gates for a choropleth and failed on normal vision alone (worst pair
delta-E 12.9, against a floor of 15). So the "what people do here" map
collapses the twenty NAICS sectors to three groups - making and building,
selling and moving and serving, teaching and care and government - and the
exact sector is named in the preview and the table instead. The colouring is
coarsened to what the eye can do; the information is not.

---

## 12. Functional labour markets

### 12.0 The desire-line map

Every other view in this tool colours municipalities one at a time. A commuting
flow is not a property of a municipality — it is a property of a *pair* of
them — so it cannot be shaded, and the tool draws it instead.

**What is drawn.** For the selected municipality, the ten largest inbound and
ten largest outbound published flows, as curves between the two population-
weighted centroids. Red leads away (residents who leave to work); blue leads in
(people who live elsewhere and travel here to work). A dot marks the workplace
end, because direction on a curve is otherwise guesswork and an arrowhead at
this line weight is mush.

**Why the lines bow.** Municipalities usually exchange workers in both
directions, and two straight lines between the same pair of points lie exactly
on top of each other. The control point is offset perpendicular to the chord,
with the sign taken from the direction, so the two legs of a mutual pair
separate. It also stops a bundle of links reading as a starburst, which hides
which relationships are long and which are local.

**Why width is a square root.** Width is proportional to √(flow), not to the
flow. Linear width makes a 60,000-worker link eighty times heavier than a
750-worker one, at which point every small link disappears; the eye reads
quantity in a mark's *area* in any case. A link ten times larger is drawn about
three times heavier.

**What it cannot tell you.** The commuting table (98-10-0459) covers only the
employed labour force **with a usual place of work**. It excludes everyone who
worked at home — an unusually large group in the May 2021 reference week — and
everyone with no fixed workplace address. Flows below the suppression threshold
are withheld, so these are the largest links and not all of them, and they do
not sum to the totals shown elsewhere. For small and remote municipalities
*every* link can be suppressed, and the tool says so rather than drawing an
empty map.

**Centroids.** Lines run between population-weighted centroids of dissemination
blocks, which puts the endpoint where people actually are rather than in the
geometric middle of a large rural township. Where no population was counted —
32 Ontario places, mostly incompletely enumerated reserves — the weighting
falls back to land area, because a place with no centroid cannot appear on a
map at all and a published flow naming it would silently vanish from the
picture while still counting in the totals. `pipeline/validate.py` asserts that
every municipality and tract is locatable and that both ends of every mappable
flow resolve.

### 12.1 Travel-to-work areas

A municipality is an administrative object; a labour market is a functional
one. This rebuilds Ontario's labour markets from the municipality-to-
municipality commuting matrix, so a region is defined by where people actually
travel to work.

Algorithm: every municipality starts as its own area; repeatedly take the least
self-contained area and merge it into whichever area it interacts with most
strongly; stop when every area clears a self-containment target and a minimum
size. The interaction measure is the standard one,

```
I(i,j) = T_ij² / (O_i · D_j)  +  T_ji² / (O_j · D_i)
```

where squaring the flow and dividing by both margins is what stops a large area
absorbing everything simply by being large.

Defaults: 70% self-containment, a 2,500-worker floor, relaxing to 65% above
20,000 workers. The ONS uses 75% and 3,500 for Britain; Ontario is far emptier,
and a British floor merges most of the north into a handful of enormous areas
that say nothing.

This is a **simplified** Coombes-Bond: the same interaction measure and
size/self-containment trade-off national agencies use, without the full
multi-stage validation pass. The boundaries are indicative, not official. And
they are built from usual-place-of-work commuters only — the May 2021 reference
week left work-at-home commuters out of the matrix entirely, which makes every
area look more self-contained than it normally is.

---

## 13. Demography

**Municipal population**, 2001–2025, from the annual estimates harmonised onto
2021 boundaries. The series begins in 2001 and that is not an oversight: there
is no boundary-harmonised municipal series before it, and raw counts either
side of 2001 are not comparable in Ontario because the 1998–2001 restructuring
abolished and recreated most of the province's municipalities. A 1996 figure
and a 2021 figure under the same name usually describe different places.

**Components of population change**, by census division, annual, from 1986.
Births, deaths, immigration, emigration, and net inter-provincial and
intra-provincial migration, kept separate because they are different phenomena
with different levers. Census divisions came through the reorganisation largely
intact, which is why the depth is available there and not at municipal level.

Two series, deliberately not spliced: 17-10-0153 runs 2001–2024 on 2021
boundaries and reports net migration; 17-10-0038 runs 1986–2006 on earlier
boundaries and reports in- and out-migration separately, so the nets are
derived. They overlap but sit on different boundary vintages, and joining them
into one line would draw it through a discontinuity. The interface shows both
with the break visible.

The components do not sum exactly to the change in population: Statistics
Canada carries a residual term, which is loaded but excluded from the
summaries.

---

## 14. Not yet built

Stated here rather than left to be discovered.

- **Census tract change over time.** Would need the Statistics Canada
  2016-to-2021 tract correspondence file, and honest handling of split and
  merged tracts. The current answer — structure only, and say why — is the
  defensible one.
- **Place-of-work industry before 2021.** Statistics Canada published the
  place-of-work-geography industry tables for the first time in the 2021 cycle,
  so a workplace-basis time series would have to be reconstructed from the
  earlier place-of-work products and is not attempted.
- **Arcelus (1984) decomposition.** The regional-growth and regional-industry-mix
  extension is not implemented; the Esteban-Marquillas split covers the question
  it was built to answer.
- **Sampling error on the place-of-work tables.** Sampling error is now modelled
  (section 7.2), from the 95% confidence intervals that 98-10-0456 publishes for
  every residence-basis count. The place-of-work tables publish none, so for
  them the variance model is *borrowed* from the residence table — a reasonable
  stand-in, since both come from the same 25% long-form sample, but not a
  measurement.
- **Employed-labour-force industry counts before 2016 below the census
  division** (section 7.0). Not published; the pre-2016 legs stay on the wider
  labour-force universe.

---

## References

Barff, R.A. and Knight, P.L. (1988) "Dynamic shift-share analysis." *Growth and
Change* 19(2): 1–10.

Dunn, E.S. (1960) "A statistical and analytical technique for regional
analysis." *Papers of the Regional Science Association* 6: 97–112.

Esteban-Marquillas, J.M. (1972) "A reinterpretation of shift-share analysis."
*Regional and Urban Economics* 2(3): 249–255.

Flegg, A.T. and Webber, C.D. (2000) "Regional size, regional specialization and
the FLQ formula." *Regional Studies* 34(6): 563–569.

Flegg, A.T. and Tohmo, T. (2013) "Regional input-output tables and the FLQ
formula: a case study of Finland." *Regional Studies* 47(5): 703–721.

Isard, W. (1960) *Methods of Regional Analysis*. MIT Press — location quotient
and the economic base.

Krugman, P. (1991) *Geography and Trade*. MIT Press — the specialisation index.

Shannon, C.E. (1948) "A mathematical theory of communication." *Bell System
Technical Journal* 27: 379–423 — entropy, applied here as an industrial
diversity index.

Statistics Canada. *Random rounding and area suppression*, 2021 Census of
Population guide, catalogue 98-304-X.
