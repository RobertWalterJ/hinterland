# Data audit — September 2026

Every source was re-read against its own Statistics Canada cube metadata: the
dimension members the tool selects, the footnotes that define what each total
contains, the coverage rules, and the classification vintages. What follows is
what the metadata says, what the tool was doing, and what changed.

Method: `getCubeMetadata` from the Statistics Canada Web Data Service for each
product, reading the footnote text in full rather than inferring meaning from
column headings. That is the step that found the first item below, which no
amount of staring at the numbers would have surfaced.

---

## 1. The two "totals" do not describe the same people — **fixed**

This is the serious one, and it was wrong.

The footnote on **98-10-0491** and **98-10-0492** (place of work):

> Classification of respondents according to whether they worked at home or
> worked at a specific address (usual place of work). **Respondents who worked
> outside Canada or had no fixed workplace address are excluded from this
> total.**

The footnote on **98-10-0456** (place of residence):

> Classification of respondents according to whether they worked at home,
> worked outside Canada, had no fixed workplace address **or** worked at a
> specific address (usual place of work).

So the residence total is a four-category universe and the place-of-work total
is a two-category one. Workers with no fixed workplace address — the trades,
delivery, home care, anyone whose job moves — cannot be assigned to a workplace
geography at all, so they are counted in one and absent from the other.

The tool was dividing one by the other and calling the result *jobs per employed
resident*. It is not a ratio; it is a comparison of two different populations.

| | Toronto | Hamilton | Ontario |
|---|---|---|---|
| Jobs, place of work | 1,264,060 | 209,815 | 5,718,810 |
| Employed residents, all | 1,308,110 | 255,075 | 6,492,895 |
| — of whom no fixed workplace or outside Canada | 148,685 | 31,520 | **794,920** |
| Resident workers, comparable subtotal | 1,159,425 | 223,570 | 5,697,970 |
| Ratio **as published before** | 0.97 | 0.82 | **0.88** |
| Ratio **corrected** | **1.09** | 0.94 | **1.00** |

Toronto was being described as having *fewer jobs than working residents* — a
net exporter of workers. It is the opposite.

The provincial figure is the proof. Almost every job in Ontario is done by
someone who lives in Ontario, so the provincial ratio must come out near 1 by
construction. On the comparable subtotal it is **1.0037**. On the old basis it
was 0.8808 — 12% out, and invisible on any single municipality because every
municipality was wrong in the same direction.

**Changed.** The loader now reads all five place-of-work-status columns from
98-10-0456, not just the total. The ratio uses *worked at home + usual place of
work* on both sides. The headline is relabelled **jobs per resident worker**,
because that is what it measures. Two checks were added to `validate.py`: the
provincial ratio must fall between 0.95 and 1.05, and the old denominator must
demonstrably fail that test, so nobody can quietly reinstate it.

**Still true after the fix:** the May 2021 reference week inflated work-at-home,
which moves jobs from employment centres toward commuter suburbs. That is a
separate distortion and is still flagged on screen.

---

## 2. Business counts — **caveats corrected**

Three things the metadata says that the tool was not saying.

**It counts locations, not businesses.**

> Businesses are counted according to the number of "statistical locations"
> they have. For example, a retail business with 10 stores and a head office is
> counted 11 times.

So a municipality with one chain's eleven outlets shows eleven "businesses". The
caveat said *establishments, not jobs*; it now also says *locations, not firms*.

**Coverage is conditional, and the gap is not random.**

> The data includes active Canadian locations with employees for every census
> metropolitan area (CMA) and the census subdivisions (CSDs) within them as
> well as for CSDs that are not part of CMAs, **provided they have 10 or more
> active businesses**.

That is why only 340 of Ontario's 577 municipalities appear. The missing ones
are small and rural — absent by rule, not by suppression. The tool now says so
rather than leaving a blank that reads as zero.

**It is on a different NAICS vintage.** Business counts use **NAICS 2022**; the
census tables use **NAICS 2017**. At two-digit sector level the two are nearly
identical, but the cross-check panel now states that it is comparing across
classification versions.

Also recorded, though the tool never did this: *the employment size ranges
provided should not be used to calculate total number of employees.*

---

## 3. Population estimates — **caveats corrected**

> Postcensal estimates are based on the latest census counts **adjusted for
> census net undercoverage** (including adjustment for incompletely enumerated
> reserves and settlements).

This is why the estimates do not match the census counts, and it is the reason
the tool must not mix them. It uses:

- **census counts** (from the geographic attribute file, aggregated from
  dissemination blocks) wherever a population is shown beside 2021 census
  employment — same census, same universe;
- **the estimates series** (17-10-0155) for population *change* over time,
  because only the estimates are harmonised onto 2021 boundaries across years.

Both are now labelled with which one they are. One further footnote worth
carrying: estimates are *final intercensal to 2020, final postcensal for 2021,
updated postcensal 2022–2024, and **preliminary** for 2025* — so the most recent
year is the least settled.

---

## 4. Commuting flows — **confirmed correct**

> This table shows the commuting flows between the geography of residence and
> the geography of work for the employed labour force aged 15 years and over
> **having a usual place of work**.

This confirms the handling already in place: everything derived from commuting
is labelled *usual-workplace basis* and is never mixed with a total. Note this
is a *third* universe, narrower again than the place-of-work total, because it
excludes people who worked at home.

Three universes are therefore in play, and the tool now names each one where it
is used:

| universe | who is in it | used for |
|---|---|---|
| residence total | everyone employed, all four work situations | shift-share over five censuses |
| home + usual | everyone who can be placed at a workplace | jobs, structure, the jobs ratio |
| usual only | everyone with a fixed workplace away from home | commuting, self-containment |

---

## 5. Classification and boundary drift — **documented, not fixable**

Industry is coded on a different NAICS version in every census the tool spans:
**1997, 2002, 2007, 2012, 2017**. Two-digit sector comparisons are sound, which
is why the tool works at 20 sectors and offers nothing finer over time. Small
sector-level changes across censuses should not be read as real.

Census subdivision codes are 2021 vintage throughout. Ontario's large
amalgamations predate 2001, so the five-census series is largely comparable, but
a small number of post-2001 boundary changes are not reconciled and no
correspondence file is applied.

---

## 6. Structural faults found and fixed during the build

Recorded here because each would have produced confident, wrong output.

- **Census division and economic region codes collide.** Both are four digits;
  3510 is Frontenac as a CD and Ottawa as an ER, with five more pairs the same.
  Keyed naively, six census divisions silently vanished. Economic regions are
  now stored under an `ER` prefix.
- **A residual pseudo-tract.** CMA codes 997–999 mean "outside any CMA"; the
  tract attached to them (9935.00) holds 2.2 million people. Excluded.
- **The rounding constant was understated.** Random rounding to base 5 has a
  per-cell standard deviation of **2.0**, not √2 ≈ 1.41 — the error ranges over
  (−5, +5). Measured empirically at 2.02 across 64,470 cells. Every uncertainty
  band in the tool was about 40% too narrow.
- **Employment for economic regions and CMAs was reported as unpublished.**
  Statistics Canada publishes place-of-work employment for CSDs, CDs, the
  province and Canada — not for ERs or CMAs. Those are now summed from member
  municipalities and labelled as aggregates.
- **The map rendered upside down.** The projection returns a northing; SVG's y
  axis grows downward.
- **Map clicks never registered.** `setPointerCapture` retargets later pointer
  events to the SVG, so the polygon under the cursor was gone by `pointerup`.
  The id is now captured on `pointerdown`.
- **Charts never drew in a hidden tab.** `requestAnimationFrame` is suspended
  while a tab is hidden, so a reader who switched away during a load returned to
  empty boxes. A timer now races the frame callback.
- **The export base multiplier was quoted when it was meaningless.** Against a
  benchmark that resembles the subject, the basic share collapses and the
  multiplier explodes — Hamilton against Ontario gives 11.2. Flagged unstable
  below a 15% basic share.

---

## What the audit did not change

- The shift-share, location quotient, specialisation, diversity and peer
  methods: checked against the literature and against known-answer cases, and
  all 84 validation checks pass.
- The reliability floor: cells at or below 25 workers withheld, 26–50 flagged
  weak.
- The refusal to difference census tracts across censuses.

---

## Still open

- **The no-fixed-workplace population is large and invisible.** 794,920
  Ontarians — 12% of the employed labour force — work at no fixed address. They
  are in no workplace geography at all, which means every employment-base map in
  this tool is a map of the other 88%. Construction and trades are understated
  everywhere as a result. There is no published fix; the honest step would be a
  panel that shows the size of the excluded group by municipality.
- **2011 remains a voluntary survey** and is not a like-for-like observation.
- **Input-output multipliers** are loaded but unexposed, pending the mapping
  from 230 input-output industries to 20 NAICS sectors.
