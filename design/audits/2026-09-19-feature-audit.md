# Hinterland: feature audit

19 September 2026. This audit covers the code at commit `9efa50a`. That commit ("Back gesture goes back; quiz Next no longer floats over the answer") landed while the audit was running, so both of those issues are judged against the fixed code. I read the code, ran the pipeline checks, and ran my own read-only scripts against `app/data/*.json` in a temp folder. I did not use a browser. Anything that depends on how the page looks on screen is inferred from the code and CSS, and says so.

Check results at the time of writing:

- `python pipeline/validate.py`: **all 143 checks pass**.
- `node pipeline/quiz_selftest.js`: 1,004 questions, 0 problems.
- `node pipeline/quiz_simulate.js`: all guards pass. See the quiz notes in (b) and item 13 in (e).
- `node pipeline/findings_selftest.js`: runs over all 577 municipalities, with 16 of 17 detectors leading at least one brief. It prints a harmless `TypeError` stack first (bug D13).

---

## (a) Verdict

For the first question ("what do people do here?") Hinterland is a serious, honest tool. Home answers it in one screen with jobs and residents. The 2021 structure, location quotient, economic base, peers, commuting, spatial statistics and impact panels are careful and well caveated, and the validator, the quiz bank and the findings engine are unusually rigorous for a personal project.

Robert's complaint about change over time is correct, and it goes deeper than "limited". The Change tab is one method (a shift-share decomposition for a single pair of years) with no trend view. It opens on 2016–2021 by default, which is the least typical period in the series (a lockdown reference week plus a classification break in NAICS 55). It calls residents "jobs". Its "too small to call" test counts only census rounding and ignores sampling error, which is about 100 times larger. For census divisions, regions and metro areas it sums a different set of municipalities in different years, which moves results by up to 10 percentage points in the north. The Population tab is one line chart plus census-division components, and it is **empty** for economic regions and metro areas.

Most of what a planner would expect is already in the data the app ships: five censuses of sector detail for 381+ municipalities, annual population for 2001–2025, and 38 years of components. Two more views (occupation change and work-from-home change, 2016–2021) are sitting in a raw file already on disk. The gap is in the interface, not the data.

On a phone, three whole panels (Impact, Neighbourhoods, Sources) cannot be reached at all.

---

## (b) Feature table

Status: **solid** = complete and correct for its purpose · **thin** = works but falls short of the stated purpose · **broken** = wrong output or unusable · **missing** = not built.

| Feature | Status | Evidence |
|---|---|---|
| **Home: "What do people do in X?"** (jobs / residents toggle, top 3, glance, "Dig deeper") | solid | `home.js:187-257` answer with sampling-aware order sentence (`L.orderSentence` + `M.countSd`); `home.js:259-277` glance; `home.js:279-317` next questions |
| Home landing, "Use where I am", "Or try" chips | solid | `home.js:354-378`, geolocation `home.js:94-160` with near-boundary warning |
| Home "Is it growing?" for regions and metro areas | broken | offered whenever `p.level !== 'CT'` (`home.js:286-287`) but the target panel is empty for ER/CMA (bug D5) |
| Home "How has work here changed?" | thin | promises "work here" (`home.js:284`) but opens a *residence*-basis decomposition. The jobs count on Home and the Change totals are different populations (bug D7) |
| **Structure** (industry mix, LQ, economic base, business counts cross-check) | solid | `panels.js:568-740`. Phone reaches it only through Home's "What is it known for?" |
| **Change** (shift-share, E-M, chained) | thin, with bugs | `panels.js:743-1066`. See section (c) and bugs D4, D6, D7, D10, D11 |
| **Population** (annual line + CD components) | thin, and broken for ER/CMA/Ontario | `panel-population.js:46-86` (the line only draws where `D.pop.data[code]` exists: CSD, Ontario, Canada); `data.js:417-426` (components need `place.cd`, which ER/CMA/Ontario don't have); `panel-population.js:91-94` tells the reader "choose … economic region and this fills in", which is false |
| **Peers** (Mahalanobis / structural, pin/remove, scorecard, labour-market card) | solid | `app.js` `computePeers`, `panels.js:1070-1300`, `panel-region.js:241` |
| **Impact** (IO multipliers, Flegg-Webber) | solid on desktop, **unreachable on phone** | `panel-impact.js`. `.tabs{display:none}` on phone (`app.css:897`), and the bottom nav has no Impact button (`index.html:81-126`) |
| **Neighbourhoods** (census tracts, 2021) | solid on desktop, **unreachable on phone** | `panels.js:1303-1530`. Same cause as Impact. A tract can still be *chosen* in the place picker, but the tract table and tract map can't be reached |
| **Sources** | solid on desktop, **unreachable on phone** | `panels.js:2028-2090`. Same cause |
| **Map** (CSD choropleth, peek card, flows, LISA/Getis-Ord card) | solid for 2021; thin for change | `panels.js:1533-2000`. Only two change variables: population change fixed at 2011–2021 (`panels.js:1528`) and competitive shift. Tracts are not on the Map tab |
| Map "competitive shift per 100" | thin | noise floor derived from rounding only (`panels.js:1657-1664`). At 500 base workers the sampling band is about ±12 per 100, not ±5 |
| Spatial statistics (Moran's I, LISA, Getis-Ord, FDR) | solid | `spatial.js`, `panel-region.js:36-235`, `spatial_selftest.js` |
| Labour shed / travel-to-work area | solid (2021 only) | `ttwa.js`, `panels.js:1894` |
| **Brief** (findings engine, 17 detectors) | solid, with one coupling | `findings.js` and `brief.js`. The change detectors read whatever period was last picked on the Change tab (`findings.js:315-366` reads `ctx.change`), so the Brief's wording depends on hidden state from another screen |
| **Export** (CSV/XLSX/DBF/shapefile/GeoJSON; structure, indices, change, peers, tracts, province) | solid for 2021; **missing** for time series | `exportui.js:546-567`. No population series, no components, no five-census sector panel, no occupation, no commuting flows |
| **Learn**: glossary (31 terms), "which method answers which question" (10 rows), per-card readings | solid | `terms.js`, `learn.js:467-547`, readings `learn.js:571-634` |
| Learn: glossary coverage of change and demography | thin | only `shift-share`, `industry-mix-effect`, `competitive-effect`, `allocation-effect`, `chained`, `natural-increase`, `components`. No growth rate/CAGR, index number, balanced panel, universe break, classification drift, participation/employment rate, dependency ratio, age structure, or convergence |
| Learn: history timeline | thin | `history.js`: 10 dated events (1965 onward) and two data stories. Nothing before 1965 (no staples, Innis's "hinterland", hydro, Golden Horseshoe formation). The factory-town story stops at 2011 (see D12) |
| **Quiz** (9 big ideas, lessons, levels, spaced repetition) | solid engine; two UX faults | selftest and simulator pass. Wrong-answer marking is still ambiguous (D3). In simulation new material arrives at about 1 question per 12-question session after the first fortnight, and recall at the moment a review falls due is 34–43% (`quiz_simulate.js` output) |
| Quiz "Next/Finish" bar covering the card | **fixed today** | was `position:sticky; bottom:64px` (`app.css` before `9efa50a`). Now in the flow, `quiz-ui.js:323-326` |
| **Read-aloud** | solid for prose; thin for charts | `read.js`: pause, stop, Canadian voice, tables summarised. Charts are silent: `SAY` (`read.js:51-53`) doesn't include SVG, and charts carry only an `aria-label` title (`charts.js:42-47`). The population and waterfall charts have no spoken summary. There is no speed control (fixed `rate = 0.98`, `read.js:179`) |
| No timers or countdowns | solid | the only interval is the boot message (`app.js:78`). Quiz debounces are documented as not timers (`quiz-ui.js:374, 420`) |
| **Navigation / back gesture** | **fixed today, with a residual bug** | cause and residual in D1 |
| **Offline / PWA** | solid, minor gaps | `sw.js`: network-first, prefix-scoped caches, shell warmed one file at a time. Registered on GitHub Pages (`GRA_HOSTED` is only set by `build_artifact.py:94`). Gaps: no network timeout (D17); tract data is cached only if it was used online; `manifest.webmanifest` has a light `background_color` (dark-mode splash flash) and combined `"any maskable"` icons |
| Data coverage and reliability handling (2021) | solid | withheld ≤25, weak ≤50, `M.countSd` with the 1.92 sampling constant (`methods.js:40-56`), coverage by year shown in Sources (`meta.json csd_coverage_by_year`: 485 / 523 / 429 / 541 / 539 of 577) |
| Reliability handling for change over time | broken | rounding-only band (`methods.js:575-577`), used by the Change panel, the plain-English reading, the "against the tide" detector and the compshift map (D6) |

---

## (c) Change over time: deep dive

### What exists

**Change tab** (`panels.js:743-1066`, computed in `app.js:518-585`):

- **Basis**: place of *residence* only. This is the employed labour force by where workers live, not jobs located in the place.
- **Periods**: any two of 2001, 2006, (2011), 2016 and 2021, through two dropdowns. The default is **2016 → 2021** (`app.js:20`), and "Skip 2011" is on by default (`app.js:22`).
- **Geographies**: municipalities, census divisions, economic regions, metro areas, Ontario and Canada. Tracts are correctly refused (`panels.js:746-757`). Aggregates are summed from member municipalities.
- **Measures**: totals, and the start and end count for each of the 20 sectors.
- **Decompositions**: classic shift-share (reference growth, industry mix, competitive), the Esteban-Marquillas split (competitive and allocation), and a chained (dynamic) version by interval.
- **Charts**: one waterfall of the components; a sector bar chart of the competitive effect (phone: rows; desktop: diverging bars); an E-M quadrant scatter (desktop only); a chained-interval table; a 13-column full table.
- **Narrative**: one generated paragraph (`learn.js:608-634`), plus caveat cards for the 2011/2016 universe break and the May 2021 reference week.
- **Elsewhere**: a "Resident labour force across five censuses" line is buried in Home → "All the numbers" (`panels.js:376-384`). Findings detectors cover `pop-jobs-divergence`, `past-peak`, `against-the-tide` and `natural-decrease`. The Map has population change 2011–2021 and competitive shift.

**Population tab** (`panel-population.js`):

- One line of annual population, 2001–2025 (2021 boundaries, 17-10-0155), with four numbers (level, change, % change, compound annual rate). **This line draws for municipalities, Ontario and Canada only.**
- The **census division's** components of change (natural increase, international, within-Ontario, interprovincial) as two line charts on two boundary vintages (1986–2006 and 2001–2024), a five-year reading, and a year-by-year table.
- **Economic regions, metro areas and Ontario get no components at all. ER and CMA also get no population line**, so their Population tab is a single "no data" card that wrongly suggests economic regions would work.

### What the data can support, versus what the interface shows

Checked directly in `app/data/`:

- **`res_series.json`**: 20 sectors × five censuses for the province and for **381 municipalities with all five years**. Another 180 or so have three or four years. Only 28 municipalities have none. Census divisions have their own published vector for **2016 only**.
  - The interface shows at most two years at a time, except in the chained table (desktop, opt-in) and the buried total line.
  - Nothing shows a sector's own path across 2001–2021.
- **`population.json`**: annual 2001–2025 for all 577 municipalities, Ontario and Canada.
  - Divisions, regions and metro areas can be summed exactly from municipalities on 2021 boundaries, but the app doesn't do it.
  - The Ontario line is never drawn beside a municipality's line.
- **`components.json`**: 49 census divisions, 1986–2024.
  - Economic regions and Ontario can be summed from their divisions, but the app doesn't do it.
- **`detail.json`**: 2021 occupation (10 groups, with 95% confidence intervals). 2021 only.
- **Already on disk, not exported**:
  - `data/raw/98-400-X2016321.ZIP` has a `NOC16BRD` occupation dimension (`build.py:787` filters it to the total), so **2016 occupation by municipality** is one pipeline change away.
  - The same file's five place-of-work-status categories are loaded into `analyst.db` (`build.py:782`), but only `measures_2021` reaches the app. So **work-at-home and no-fixed-workplace change for 2016→2021** is available.
- **Not held at all**:
  - Place-of-*work* (jobs) by industry before 2021.
  - Commuting flows before 2021.
  - Age structure.
  - Anything after the 2021 Census except population and components.

### What a planner expects, and whether it can be built

In priority order for Robert's purpose. **Data now** = the data is in `app/data`. **Local file** = the data is in the raw cache or `analyst.db` and needs a pipeline change. **New data** = needs a new StatCan pull. Table numbers marked *(verify)* are from memory and must be checked before use; per the project's own rule, nothing should be asserted from memory.

1. **The story of change, in plain English, at the top of the Change tab.** *Data now.*
   Three or four sentences:
   - how many working residents then and now, against Ontario's rate;
   - the two sectors that gained most and lost most, in people and in share;
   - whether population and workers moved together;
   - one "what drove it" sentence (mix or local performance), which must go quiet when the effect is inside the *sampling* band.
   This is the missing answer to "how has work here changed?". Today the tab opens on controls and a waterfall.
2. **Every census year on one chart: the resident labour force and each sector over 2001–2021.** *Data now.*
   - Small multiples, or a slope chart of the top 6 to 8 sectors, indexed to 2001 = 100 against the benchmark's line.
   - The 2011/2016 universe break drawn as a visible seam, not a footnote.
   - 2011 marked as the voluntary survey.
   This one view does more for "what changed" than the whole decomposition.
3. **Sector share change (percentage points) as the default measure, with raw counts second.** *Data now.* Shares are much less exposed to the universe break and to the 2021 lockdown week than levels are, because both biases partly cancel within a place. They also read plainly: "manufacturing went from 1 in 5 working residents to 1 in 9".
4. **Growth against the province, the division and peers, for every interval.** *Data now.* A strip or table that says "faster / slower / about the same as Ontario", for population and working residents, across 2001–06, 06–11, 11–16 and 16–21. Use the separation test with `M.countSd`, not rounding only.
5. **Population and workers together.** *Data now.*
   - Annual population and the five census labour-force counts on one indexed chart.
   - Working residents per 100 residents at each census, as a rough proxy (say so).
   - This is the chart behind the existing `pop-jobs-divergence` finding, which the reader never sees.
6. **Fix the Population tab for every level and put the benchmark on it.** *Data now.*
   - Sum population for divisions, regions and metro areas from municipalities.
   - Sum components for regions and Ontario from divisions.
   - Draw the place indexed against Ontario and its division.
   - Add a five-year growth-rate table.
   - Say in one line whether the municipality grew faster or slower than its division, since components aren't published below that level.
7. **Rank changes.** *Data now.* "Kenora ranked 212th of 577 for population growth 2001–2011 and 98th for 2016–2021." Also rank within the division, the peer group and the settlement class, for population growth, labour-force growth and each sector's share.
8. **Peers over time.** *Data now.* The peer group's indexed lines on the same chart as the subject. The peer set is already computed (`computePeers`), and `res_series` covers the peers.
9. **Chained shift-share as a sector × interval heat table on all screens.** *Data now.* `M.dynamicShiftShare` already computes each interval's per-sector effects, but only the interval totals are shown (`panels.js:996-1026`), and only when "Chain each interval" is ticked. Showing where in 2001–2021 each sector's gain or loss happened answers "what drove it, and when".
10. **Choosing the default period honestly.** *Data now.*
    - Open on the longest clean-enough span the place has (for example 2006→2021, with the break card).
    - Or open on the new trend view (item 2) rather than on 2016–2021.
    - At the least, don't make the lockdown-week period the one the tool leads with.
11. **Change on the map.** *Data now.*
    - Population change for any period (2001–2025 annual, not a fixed 2011–2021).
    - Working-resident change for any census pair.
    - Sector share change.
    - Divergent colours, with the spatial-statistics card already built beside them.
12. **Occupation change, 2016→2021.** *Local file.* Re-stream `98-400-X2016321.ZIP` keeping `NOC16BRD` 1–11 instead of `'1'` (`build.py:787`), then compare against `detail.json`. Caveat: the 2016 and 2021 occupation classifications (NOC 2016 and NOC 2021) differ at the broad level for some groups, so show a short concordance note.
13. **Work-from-home and no-fixed-workplace change, 2016→2021.** *Local file.* The PWStat categories are already in `analyst.db` for 2016. This is also the "still open" item in `DATA-AUDIT.md` (the no-fixed-workplace group is invisible).
14. **Jobs located here over time (place of work by industry, 2016, and ideally 2006 and 2011).** *New data.* This is the single most important addition, because Home answers in jobs and Change answers in residents.
    - 2016 Census place-of-work-by-industry tabulations at the census subdivision of work (98-400-X2016 series; exact catalogue *(verify)*).
    - 2011 NHS and 2006 equivalents (99-012-X2011 / 97-561-XCB2006 series *(verify)*).
    - Once loaded, `M.estebanMarquillas` runs unchanged on the work basis.
15. **Commuting change, 2016→2021.** *New data.* The 2016 Census commuting flow table (98-400-X2016391 *(verify)*). It gives change in self-containment, jobs-to-workers ratio and top flows, which are key to how places relate.
16. **Age structure and ageing.** *New data.*
    - Population estimates by age and sex on 2021 boundaries: census divisions 17-10-0152 and metro areas 17-10-0148 *(verify)*.
    - Census 2016/2021 age profiles for municipalities.
    - Gives dependency ratio, the share aged 65+, and why deaths overtake births.
17. **Years since 2021.** *New data.* Labour Force Survey employment by industry, annual, by economic region (14-10-0392 *(verify)*), and unemployment by economic region. The census stops at a lockdown week, and this is the only published way past it. Region level only, and the sampling is heavy.
18. **Participation, employment and unemployment rates, 2016 and 2021.** *New data.* Census profile tables at municipality level (98-10-0446 and 98-401-X2016044 *(verify)*).
19. **Forward look.** *New data, not StatCan.* Ontario Ministry of Finance population projections by census division. If added, label them clearly as projections.
20. *(Low priority.)* Business counts over time. StatCan's Canadian Business Counts come as semi-annual snapshots, but StatCan advises against using them as a time series. If shown at all, show them only as snapshots.

---

## (d) Bugs found

**D1. Phone back gesture closed the app. Fixed today; one residual fault.**
- *Cause (confirmed):* before `9efa50a`, `persist()` only ever called `history.replaceState` (the old `app.js:160-162`). Nothing in the app called `pushState` or listened for `popstate`, so the page always had exactly one history entry, and Android's back gesture left the page. In the installed PWA that closes the app.
- *Fix:* `app.js:163-225` now pushes an entry per place or screen, closes sheets and quiz sessions on back, and keeps a base entry.
- *Residual:* on the base entry, the handler sets `histReady = false` and calls `history.back()` (`app.js:208-212`). In the installed app there is no earlier page, so `history.back()` does nothing: the first back press appears to do nothing, and `histReady` **stays false for the rest of the session**. Every later screen change then uses `replaceState` again, and the next back gesture closes the app from wherever Robert is.
- *To reproduce:* in the installed app, open Home → press back once (nothing happens) → open Change → Population → press back. The app closes.
- *Fix:* don't clear `histReady` (or restore it on the next navigation). Accept that exiting from the first screen takes one press, since the platform closes the app when there's nowhere left to go back to.

**D2. The quiz Next/Finish bar covered the answer card. Fixed today.**
- *Cause:* `.qnextbar{position:sticky;bottom:0}` with `bottom:64px` on phone, which sat over the card text above the fixed bottom nav.
- Now in the normal flow straight after the answer sentence (`quiz-ui.js:323-326`, `app.css:1146`).

**D3. A wrong answer is marked so it can read as if Robert chose the right option. Still present.**
- *Evidence:* `quiz-ui.js:297-302` and `app.css:1113-1115`.
  - The correct option gets `is-right`: a 2.5 px solid dark border, full opacity and a ✓.
  - The option Robert chose gets `is-chosen`: a *dashed* 1.5 px border and a ✕.
  - Every other option drops to 72% opacity.
- The heaviest, most "selected-looking" styling goes to the option he did *not* pick. His own choice looks lighter than the correct one and is identified only by a dashed line, which is a weak cue for a dyslexic reader on a small dark screen.
- "You chose X" appears only inside the collapsed "Tell me more" (`quiz-ui.js:310`). The ✓ and ✕ are `aria-hidden`, so read-aloud never says which one was his.
- *To reproduce:* any quiz question, pick a wrong option.
- *Fix:*
  - Put a visible text tag on the two rows: "Your answer" on the chosen row and "Right answer" on the correct row.
  - Give his chosen row a solid border as well.
  - Move "You chose X" into the verdict line, and make sure read-aloud speaks it.
  - Keep the monochrome palette if that was deliberate for colour blindness; the text tags do the work.

**D4. Divisions, regions and metro areas sum a different set of municipalities in each census.**
- *Cause:* `computeChange` → `localAt` (`app.js:525-533`) and `trendChart` (`panels.js:491-509`) call `D.aggregate` over all members for each year. `D.aggregate` (`data.js:234-245`) skips missing members, so a municipality present in 2021 but suppressed in 2001 counts as growth. The comment says "balanced panel", but only `D.referencePeriod` (`data.js:345-385`) actually balances.
- *Measured* (my script, same data):

  | Place | Years | App (unbalanced) | Balanced | Difference |
  |---|---|---|---|---|
  | Kenora CD | 2001→2021 | −4.1% | −13.7% | 2,635 workers |
  | Northeast ER | 2001→2021 | −7.7% | −10.6% | 7,080 workers |
  | Northwest ER | 2001→2021 | −13.4% | −16.8% | 3,815 workers |
  | Cochrane CD | 2001→2021 | −14.1% | −17.7% | 1,405 workers |

  Parry Sound CD is missing 14 of its 31 members in 2011. The error falls mostly on northern places with First Nations reserves that were incompletely enumerated in some years.
- The trend line also mixes sources: for a division, `D.resVec(code, 2016)` returns the division's own published 2016 vector, while the other years are member sums.
- *To reproduce:* choose Kenora (CD) → Change → from 2001 to 2021.
- *Fix:* balance `localAt` across the chosen years (members present in both), state the coverage as `referencePeriod` already does, and use the same method for every point on the trend line.

**D5. The Population tab is empty or wrong for regions, metro areas and Ontario.**
- *Cause:*
  - The population line needs `D.pop.data[place.code]`, which exists only for municipalities, `35` and `CA` (`panel-population.js:46`).
  - Components need `place.cd` (`data.js:419`), which is empty for ER, CMA and PR (`geo.json`).
- *To reproduce:* choose "Hamilton–Niagara Peninsula" (ER) or "Barrie" (CMA) → Population. The only card says "Choose a municipality, census division or economic region and this fills in", so the economic-region promise is false. Ontario shows a line but "No components".
- The tab and the Home "Is it growing?" button are still offered (`app.js` `ctx.can.population`, `home.js:286`).
- *Fix:* sum population from municipalities and components from divisions (regions are made of whole divisions). For metro areas, show population only and say that components aren't published.

**D6. Uncertainty over time ignores sampling error.**
- *Cause:* `M.shiftShareUncertainty` = rounding over 40 cells ≈ ±25 workers at two standard deviations (`methods.js:575-577`). The residence tables are 25% long-form samples, and the app's own constant says the sampling SD is about 190 for a count of 10,000, against 2 for rounding (`methods.js:36-40`).
- *Consequences:*
  - The Change card says to "treat anything smaller than ±X as no finding" with X ≈ 25 (`panels.js:914-915`), even for Toronto's 1.3 million.
  - The plain-English reading says a component "made no difference we can measure" only when it is under ±25 (`learn.js:610-614`), so it asserts direction for effects that are well inside sampling noise.
  - The `against-the-tide` detector uses the same band (`findings.js:319`).
  - The compshift map's 500-worker floor is justified with the rounding band (`panels.js:1657-1664`). The sampling band at 500 is about ±12 per 100 at two SD.
- This conflicts with the stated purpose ("honest uncertainty") and with Home, Structure and history, which all use `M.countSd`.
- *Fix:* build a change band from `M.countSd` on the start and end vectors (sector level and total), and use it in the card, the reading, the detector and the map floor.

**D7. Residents are called "jobs".**
- *Evidence:* Change `panels.js:912-913` ("sum to the observed change of X jobs"), `panels.js:942` and `955` ("→ jobs"), Home "All the numbers" `panels.js:345` ("jobs, observed change"), findings text `findings.js:332`.
- The card note does say "where workers live, not where the jobs are" (`panels.js:855-856`), but the numbers underneath it say jobs.
- Home counts jobs *located here* (place of work), so Robert sees two different totals for the same town, both called jobs. For Toronto, 2021 working residents = 1,308,100, which is not the Home job count.
- *Fix:* say "working residents" everywhere on the residence basis, and add a one-line bridge on Change: "Home counts jobs located here; this counts people who live here and work anywhere."

**D8. Three panels can't be reached on a phone.** `.tabs{display:none}` under 720 px (`app.css:897`). The bottom nav has Place, Home, Change, Population, Map, Brief and Learn (`index.html:81-126`). A search of all `A.go(` calls finds no link to `impact`, `hoods` or `sources` (only `app.js`, `home.js`, `learn.js`, `quiz-ui.js`, `panels.js:1787` → overview). Robert's main device can't open Impact, Neighbourhoods or Sources.

**D9. The "Resident labour force across five censuses" card shows four points and hides the break.** Title at `panels.js:377`. The chart only plots `ch.available`, which drops 2011 by default (`app.js:521`). The 2011→2016 universe change (the unemployed are in 2001–2011, not in 2016–2021) isn't marked on the line, so a 2011→2016 dip reads as a real fall. The subtitle's "The 2021 dip…" is also printed for every place, including places that grew.

**D10. Chained decomposition against a summed benchmark changes membership each year.** The chain block calls `D.referencePeriod(st.benchmark, place, y, y)` (`app.js:574`), which balances each year only against itself. With a division, region or metro benchmark, the reference vector sums different municipalities in 2001 and 2006, and so on, which puts membership change into "reference growth". Ontario and Canada benchmarks are unaffected. *Fix:* balance once across every year in the span.

**D11. The Change tab opens on its least typical period.** The default is `y0: 2016, y1: 2021` (`app.js:20`). The tab itself says that period has a lockdown reference week and an "unreadable" NAICS 55 (`panels.js:835-849`). This is not a code fault, but it is the first thing a reader sees, and the Brief inherits it.

**D12. The history data story stops at 2011.** `history.js:247-252`: manufacturing-led municipalities 125 → 37 (2001–2011). This holds on a balanced panel (my check: 120 → 37). But the clean 2016→2021 pair continues the story: manufacturing-led municipalities **35 → 23**, health-led **21 → 42** (same separation test, my script). That second half is the more current and more defensible part and isn't told.

**D13. `findings_selftest.js` prints a `TypeError` stack before its results.** `app.js` boots itself inside the Node harness. `renderChips` (`app.js:731-735`) then dereferences `#placeChip`, which the stub DOM doesn't have. The run completes and its numbers are valid, but a real failure would look the same as this noise. *Fix:* stub the chip elements, or guard `renderChips`.

**D14. `DATA-AUDIT.md` "Still open" is out of date.** It says the input-output multipliers are "loaded but unexposed", but `panel-impact.js` exposes them.

**D15. The allocation-effect toggle appears on phone, but its quadrant chart doesn't.** `panels.js:804-809` shows the toggle on every screen; `panels.js:967` draws the quadrant only when `!phone`.

**D16. Map population change is fixed to 2011–2021.** `panels.js:1528` uses `popGrowth1121`, although annual data runs 2001–2025.

**D17. Offline mode waits on a slow network.** The service worker is network-first with no timeout (`sw.js` fetch handler). On a weak signal (the council-chamber case the file names) each request waits for the network to fail before the cache answers, so the app can look frozen. *Fix:* race the network against the cache after about 3 seconds.

---

## (e) Top 15 improvements, ranked by value to Robert's purpose

| # | Improvement | Why it matters | Effort |
|---|---|---|---|
| 1 | **A trend view on the Change tab**: every census year for the total and for each sector, indexed against the benchmark, with the 2011/2016 seam drawn (section c, items 2 and 3) | This is Robert's complaint. The data is already loaded. It turns "change" from one method into a picture of what happened | M |
| 2 | **A plain-English "story of change" at the top of Change, which also opens the tab** (item 1), with a matching Brief paragraph | Purpose 3 (plain, compelling stories). It gives the tab a read-aloud answer before any method | M |
| 3 | **Fix sampling uncertainty over time (D6)** and **the unbalanced aggregates (D4)** | Both produce confident wrong statements. The Kenora and northern-region errors reach 10 percentage points | S–M |
| 4 | **Make the Population tab work at every level, with the benchmark line and population and workers together** (D5, items 5 and 6) | "Is it growing?" is a Home question and fails for regions and metro areas today | M |
| 5 | **Fix the quiz wrong-answer marking (D3)** | A direct report from Robert. Being taught the wrong thing about his own answer undermines the learning loop | S |
| 6 | **Reach Impact, Neighbourhoods and Sources on the phone (D8)**: a "More" button in the bottom nav, or Home "Dig deeper" rows | The phone is the main device, and three finished panels are invisible on it | S |
| 7 | **Fix the residual back-gesture fault (D1)** | Otherwise the fix works only until the first back press on the first screen | S |
| 8 | **Say "working residents", not "jobs", on the residence basis, with a one-line bridge to Home (D7)** | Different totals under the same word are exactly the confusion a learning tool must avoid | S |
| 9 | **Rank and peer comparison over time** (items 7 and 8) | "Comparative status between places" is purpose 3, and there is no over-time view of it | M |
| 10 | **Spoken summaries of charts**: each chart emits one `data-read` sentence ("rose from 75,800 in 2001 to 75,300 in 2021, peaking in 2011") | Read-aloud is a standing rule. Charts are currently silent, and the change screens are mostly charts | S–M |
| 11 | **Occupation and work-from-home change, 2016→2021**, from the file already on disk (items 12 and 13) | Adds the "people" side of "what do people do" to change, at low data cost | M |
| 12 | **Change on the map: any period, working residents and sector share** (item 11, D16) | Purpose 5 (explore by map). Today the map is almost entirely 2021 | M |
| 13 | **Tune the learning pace**: raise new questions per session after the first fortnight above ~1, and target higher recall at review (simulated 34–43% today) | A learner who fails most reviews and meets one new idea per session will feel stuck. Check against the simulator's guards before changing | M |
| 14 | **Grow Learn for change and history**: glossary terms (growth rate, index number, balanced panel, universe break, classification drift, participation rate, dependency ratio, staples/hinterland); a pre-1965 timeline; the 2016→2021 continuation of the factory-town story (D12) | Purposes 4a and 4b (methods and Ontario's economic history) are the thinnest parts of Learn | M |
| 15 | **Load place-of-work jobs by industry for 2016 (and 2006/2011)**, then commuting flows for 2016 (items 14 and 15) | The only way to answer "how has work **here** changed" in the same basis as Home. It needs new StatCan pulls and a concordance check | L |

Also worth doing, small: export the time series (population, components, five-census sector panel, item 1's story) so the new views travel into reports (S–M); open Change on a longer, cleaner default period (D11, S); a network timeout in the service worker (D17, S); clean up the self-test harness noise (D13, S).
