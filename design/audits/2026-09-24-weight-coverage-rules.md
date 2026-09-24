# Hinterland — load weight, coverage, standing rules

**24 September 2026.** Audits 6, 7 and 8, on the question and learning module.

Three new scripts, each runnable on its own and each with a `--json` mode:

```
node pipeline/audits/weight.js        # AUDIT 6  load weight
node pipeline/audits/coverage.js      # AUDIT 7  coverage
node pipeline/audits/rules.js         # AUDIT 8  standing rules (exits 1 on a hard breach)
```

They all run against the real app modules and the real payloads, through
`pipeline/audits/harness.js`. Nothing in them is a model of the app.

**A note on the numbers below.** Four other agents were editing this repo while
these ran. The question bank moved from 1,004 items to 1,000 during the session,
and `docs/` is momentarily behind `app/` on two files. The scripts are the
source of truth; treat every figure here as a reading taken on 24 September.

---

## What was already covered, and is not repeated

`python pipeline/validate.py` runs 143 checks. On this ground it already
covers: that the question bank **builds** under every gate (separation, floor,
base size, universe, currency, invariance, names); that every item lands in one
of the nine big ideas with at least one basics item per idea; stem and card
sentence lengths; the scheduler's behaviour over seven simulated learners; data
coverage **by census year** (how many of the 577 municipalities have published
figures in each census); and asset consistency between `app/`, `sw.js` and the
build.

`python pipeline/make_deploy.py` already refuses to build if a file the page or
the service-worker `SHELL` names is missing, if `index.html` uses a
root-absolute path, or if `sw.js` calls the global `caches.match()`. It prints
the built site's **raw** size.

So the three audits here ask the questions those do not: how heavy the first
visit is *gzipped and split into eager and lazy*; what the bank is *about*, and
what it is never about; and whether the app keeps its four standing promises to
its reader.

---

## AUDIT 6 — Load weight

### The number that decides whether the app is shareable

| | gzipped |
|---|---|
| **Eager, before the first question** | **636 KB** |
|  — the shell: HTML + CSS + 28 blocking scripts | 234 KB |
|  — the 11 payloads `D.load` fetches at once | **401 KB** |
| Then automatically, after the first paint (`boundaries_csd.json`) | 286 KB |
| **First visit, downloaded without being asked** | **922 KB** |
| Held back until a screen asks (`work_ct.json`, `boundaries_ct.json`) | 409 KB |
| Whole site, every file | 1,335 KB gzipped / 5.4 MB raw |

The 401 KB of data is on the critical path in the strict sense: `A.boot` shows
the boot screen, calls `D.load()`, and `D.load` is a single `Promise.all` over
eleven `getJSON` calls. Nothing renders until all eleven resolve. So the app
cannot answer its first question in under 636 KB as it stands.

The lazy tier is already right. `work_ct.json` (121 KB) and
`boundaries_ct.json` (288 KB) — the two biggest files in the project — are
behind `D.loadTracts()` and `D.loadBoundaries('ct')`, and most sessions never
open the neighbourhood tier. That decision alone keeps 409 KB off the first
visit.

### The biggest movable payload

Three eager payloads are read by no module that renders the first screen:

| payload | gzipped | first screen that needs it |
|---|---|---|
| `population.json` | **47.6 KB** | Is it growing? / The brief / Learn (timeline) |
| `components.json` | **45.2 KB** | Is it growing? / The brief / Learn (question bank) |
| `io.json` | 3.9 KB | What if new jobs arrived? |

Moving all three behind a loader like `D.loadTracts()` takes the eager load
from **636 KB to 539 KB**, a 15% cut, and nothing on Home or in the first
question changes.

The single biggest number, though, is not in that table: **`boundaries_csd.json`
at 286 KB.** `A.boot` fires `D.loadBoundaries('csd')` unconditionally after the
first paint, for a Map tab the reader may never open. It is already lazy in
form — `loadBoundaries` memoises and the map panel calls it — so the fix is to
delete one line from `A.boot` and let the Map tab ask. That drops the automatic
first visit from **922 KB to 636 KB**, a 31% cut, with no change to any screen
the reader has not chosen to open.

Taken together — the boot line plus the three payloads — the automatic first
visit goes **922 KB → 539 KB**, a 42% cut.

One caveat on `components.json`: it is read by `quiz-bank.js`, which builds the
whole bank on boot, so making it lazy means either deferring the bank build or
letting the demography strand (`D1`, 41 items) appear once the payload lands.
The second is easy and invisible — the scheduler already draws from a pool.

### Proposed patch — `app/js/data.js`

```js
  D.load = function (onStep) {
    var step = onStep || function () {};
    step('Unpacking Ontario');
    return Promise.all([
      getJSON('geo.json'), getJSON('work_csd.json'), getJSON('res_series.json'),
      getJSON('commute.json'),
      getJSON('business.json'), getJSON('meta.json'), getJSON('ct_csd.json'),
      getJSON('detail.json')
    ]).then(function (r) {
      D.geo = r[0]; D.work = r[1]; D.res = r[2];
      D.commute = r[3]; D.biz = r[4]; D.meta = r[5]; D.ctCsd = r[6];
      D.detail = r[7];
      step('Sorting 577 municipalities');
      index();
      D.ready = true;
      return D;
    });
  };

  /* Population, the components behind it, and the input-output multipliers are
     not needed to answer the first question: they belong to "Is it growing?",
     "What if new jobs arrived?" and the brief. 97 KB gzipped, on demand. */
  D.loadGrowth = function () {
    if (D._growthPromise) return D._growthPromise;
    D._growthPromise = Promise.all([
      getJSON('population.json'), getJSON('components.json'), getJSON('io.json')
    ]).then(function (r) {
      D.pop = r[0]; D.components = r[1]; D.io = r[2];
      return D;
    });
    return D._growthPromise;
  };
```

### Proposed patch — `app/js/app.js`, in `A.boot`

```js
      bootEl.classList.add('gone');
      setTimeout(function () { if (bootEl.remove) bootEl.remove(); }, 400);
      /* The polygons are 286 KB gzipped and belong to one tab out of four.
         The Map panel already calls D.loadBoundaries('csd') itself, and
         loadBoundaries memoises, so warming it here only spends the bytes of
         every reader who never opens the map. */
      registerWorker();
```

Each panel that needs the growth payloads then guards on it, the same shape
`P.hoods` already uses for tracts:

```js
    if (!D.pop) { D.loadGrowth().then(A.render); return skeleton(host); }
```

### Service-worker pre-cache

`app/sw.js SHELL` lists **31 files, 234 KB gzipped** — the HTML, the CSS, the
28 scripts and the manifest, and **no payload at all**. That is the right list:
the 401 KB of data is cached as the app asks for it, so the worker never
competes with the first load. It is warmed one file at a time, 2.5 s after the
data lands, and only on the local build (`GRA_HOSTED` short-circuits it on the
published site). `SHELL` and the page agree exactly — no file in one and not
the other.

### Inlined, orphaned, wasteful

- **Inlined in `index.html`:** one `<script>` block that is a comment only
  (0.3 KB, explaining why the worker is not registered there), and one 0.4 KB
  `data:image/svg+xml` favicon. Both fine. The favicon as a data URI is
  arguably better than a file: it is one fewer request and it cannot 404 at the
  `/hinterland/` subpath. Nothing that should be a separate file is inlined,
  and no CSS is inlined at all.
- **Shipped but never read:** none. All 14 payloads are fetched, and every one
  is read by at least one module. `ct_csd.json` (16 KB) comes closest to an
  orphan — nothing outside `data.js` names `D.ctCsd` — but `D.tractsIn` and
  `D.tractLabel` read it and eight modules call those.
- **Numbers stored as strings:** yes, 15,771 in `geo.json` and 8,432 in
  `commute.json` — but they are geography codes (`"3520005"`, `"3557"`), which
  **must** stay strings. 30.8 KB raw looks like a lot; re-gzipping without the
  quotes saves **0.5 KB**. Leave them alone.
- **Fields no module names:** two, both in `res_series.json`
  (`measures_note`, `naics_order`), worth 0.2 KB gzipped.
- **Total avoidable bytes across all 14 payloads: 2.5 KB gzipped, 0.4% of the
  eager load.** The payloads are clean. The weight is in *when* they are
  fetched, not in how they are written — which is why the eager/lazy split is
  the only lever worth pulling.

---

## AUDIT 7 — Coverage

1,000 generated questions. Every table below is in the script; this section is
what the tables mean.

### By big idea and level

| # | big idea | basics | places | surprises | total |
|---|---|---|---|---|---|
| 1 | Ontario's key industries | 7 | 173 | 113 | 293 |
| 2 | What every place has | 3 | 2 | 38 | 43 |
| 3 | What small towns are like | 4 | 24 | 0 | 28 |
| 4 | What big cities are like | 5 | 9 | 0 | 14 |
| 5 | Small towns are not all alike | 2 | 50 | 52 | 104 |
| 6 | Big cities are not all alike | 3 | 9 | 38 | 50 |
| 7 | How places connect | 2 | 259 | 92 | 353 |
| 8 | How work in Ontario has changed | 2 | 79 | 0 | 81 |
| 9 | Reading the numbers | 10 | 4 | 20 | 34 |
| | **all** | **38** | **609** | **353** | **1,000** |

Two ideas carry 65% of the bank between them (key industries 293, how places
connect 353) and two carry 4% (small towns 28, big cities 14). Ideas 3, 4 and 8
have **no surprises level at all**. And the basics are 38 questions out of
1,000 — the level every learner meets first is the thinnest part of the pool.

### By strand and form

Seven strands: B what people do 445, C connections 281, A size 81, G the big
ideas 78, D the long view 41, F history 40, E methods 34.

Twenty-four forms, and the distribution is extremely uneven: `B/fingerprint`
191 and `C/commute-out` 155 at the top; **eleven forms have five items or
fewer**, and `G/on-top` has one. The eleven small forms are all the *conceptual*
ones — the ones that teach an idea rather than a place.

### By geography

| area | questions | municipalities | per municipality |
|---|---|---|---|
| Central Ontario | 464 | 110 | 4.2 |
| Southwestern Ontario | 282 | 78 | 3.6 |
| Eastern Ontario | 202 | 82 | 2.5 |
| **Northern Ontario** | **136** | **144** | **0.9** |

Northern Ontario has a third of Ontario's municipalities and an eighth of the
questions. Per municipality it is asked about **4.6 times less often than
Central Ontario.** By economic region the extremes are Kitchener–Waterloo–Barrie
(180 questions over 41 municipalities) and Northwest (44 over 34).

By size class: small towns under 10k get 1.2 questions per place (312 over 263),
mid-sized 3.4 (413 over 123), big cities 4.7 (131 over 28). The 163 census
subdivisions that are reserves or unorganized areas get 2 questions between
them — correctly, since they have no size class and mostly no published figures.

All **49 census divisions** carry at least one question. Thinnest: Manitoulin 3,
Haliburton 4, Toronto 5 (one CSD), Kawartha Lakes 5.

### How many municipalities appear

Of 577 census subdivisions, 414 are municipalities with a published population.

- Named in at least one question, as subject or as an option: **318 of 414 (77%)**
- The **subject** of at least one question: **285 of 414 (69%)**
- Never named at all: **96**

The biggest absences: Leeds and the Thousand Islands (9,804), Trent Lakes
(6,439), Central Frontenac (4,892), Northern Bruce Peninsula (4,404),
Greenstone (4,309), Marmora and Lake (4,267), Bonnechere Valley (3,898),
Mulmur (3,571), Powassan (3,346), North Algona Wilberforce (3,111).

The audit diagnoses each one, and the answer is not one thing:

| why | n |
|---|---|
| the name is refused as an option (`optName`: a comma, a bracket, or over 28 characters) | 7 |
| no published industry figures at all — every cell withheld | 20 |
| fewer than 500 jobs, so it cannot clear the separation and floor gates | 53 |
| **500+ jobs, a usable name, and still never chosen** | **16** |

No place with more than **1,760 jobs** is missing. So the bank covers Ontario's
working population well even where it does not cover Ontario's municipal list —
which is the honest way to state it. The 7 name refusals are the cheapest fix in
this whole audit: Leeds and the Thousand Islands is absent because its name is
30 characters and `optName` stops at 28.

### By subject

**Industries.** 18 of 20 sectors are asked about. Never the subject of any item:
**55 Management of companies** and **81 Other services**. Four more are nearly
absent: Real estate 1, Admin & waste 1, Wholesale 3, Arts & recreation 3 — against
Health & social 187 and Retail 174. The generators pick sectors by effect size,
so the small ones never surface.

**Glossary.** 26 of 31 terms are attached to at least one question. Never
tested: `reference-week`, `reference-economy`, `random-rounding`,
`confidence-interval`, `false-discovery`. Three of those five are the *trust*
group — random rounding, the 95% interval and the false discovery rate — which
is the part of the app's own ethos it never checks a learner on.

**Method map.** All 10 rows are covered, exactly once each, by the `E1`
"which method answers this?" template. Behind them the term coverage is
lopsided: row 1 (dependence on one industry) touches 126 items and row 10
(can I trust this number?) touches **1**.

### By era

| census year | items mentioning it |
|---|---|
| 2001 | 14 |
| 2006 | 7 |
| 2011 | 1 |
| **2016** | **0** |
| 2021 | 899 |

Items naming more than one year: **6**. Items about **change** rather than a
single year: **81, or 8% of the bank**. Items touching the 2001–2025 population
series: 56.

The bank is a photograph of May 2021. `res_series.json` carries five censuses,
`population.json` carries 25 annual estimates, `components.json` carries births,
deaths and four migration streams — and 92% of the questions ask about one
week in 2021.

### By people

Industry underpins 382 items. **Occupation** — the ten NOC groups in
`detail.json` — appears in **123 items, all of one form** (`B3`, "the most
common work of people living in X"). Two of the ten groups are never named
(Senior managers, Arts/culture/sport), and three are nearly never (Factory and
utilities 1, Health care 4, Science and technology 5), because the form only
ever asks for the *largest* group.

So the app's own opening question — "What do people do here?" — is answered by
industry, and what people *do* is one template out of twenty-four. Nothing asks
how occupation and industry differ, which is one of the two or three genuinely
hard ideas in regional analysis, and no big idea owns it.

### The five holes most worth filling, in order

1. **The basics are 4% of the bank.** 38 of 1,000 items are level 1, and six of
   the nine ideas have three or fewer. *Fill with:* the `class-level`,
   `class-lean` and `concept` templates already in `quiz-ideas.js`, run over all
   20 industries instead of the 3–6 they stop at.
2. **Time barely features:** 8% of items are about change, 2016 is never
   mentioned, and only 6 items name two years. *Fill with:* a "which way did it
   go" template over `res_series.json`, the same shape as `D1` (yes/no on
   natural increase), which already works and already passes the gates.
3. **Northern Ontario gets 0.9 questions per municipality** against Central's
   4.2. *Fill with:* nothing new — `work_csd.json` covers every municipality.
   The binding constraint is `A1`'s one-census-division rule, which pairs a
   small northern town with a city it cannot separate from. Let it pair within a
   size class across divisions instead.
4. **Five glossary terms are never tested,** three of them the trust group
   (random rounding, the 95% interval, the false discovery rate). *Fill with:*
   the `E2` "a limit of…" template, which already generates one item per term —
   it is only fed terms whose `kind` is `method`. `detail.json` carries the
   published intervals a confidence-interval question would need, and it is
   already loaded.
5. **Two industries are never asked about** (Management of companies, Other
   services) and four more almost never. *Fill with:* the same `work_csd.json`
   columns every other sector uses; the generators need a floor on coverage, not
   new data.

Below the top five, and worth noting: **96 municipalities never named** (7 of
them purely because of a 28-character limit), and **occupation as one template
out of twenty-four**.

---

## AUDIT 8 — Standing rules

`node pipeline/audits/rules.js` exits **1**. One rule passes, three are in
breach.

### Rule 1 — No timers or countdowns · **PASS**

28 scheduling calls across `app/`. The script classifies each from the code
itself, so the verdict survives an edit: 24 fine, 1 amber, 3 to review, 0
breaches.

- **Nineteen are 20–120 ms ticks** — `setTimeout(attach, 20)` in the six panel
  modules waiting for `GRA.panels` to exist, `jump()` and `focus()` after a
  layout, the 30 ms hand-off before the Moran's I permutation test. Layout, not
  time pressure.
- **Two toasts:** `brief.js:495` restores "Copy as text" after 1,600 ms;
  `panel-region.js:254` similar. Nothing is taken away from the reader.
- **Two `requestAnimationFrame` in `charts.js`** animate a number changing over
  480 ms, and `C.countTo` returns early under
  `prefers-reduced-motion: reduce`. Correct.
- **Three "review" entries** (`data.js:36`, `exportui.js:774`, `exportui.js:786`)
  have run-time delays: the 180 ms × attempt fetch backoff, and 350/400 ms
  staggers so a multi-file CSV or DBF download is not blocked by the browser.
  Neither is user-facing.
- **The two 600 ms guards in `quiz-ui.js`** (lines 435, 522) are the important
  ones, and they are the right way round: they **refuse an early tap** so the
  reader cannot skip past an answer card by accident. They never take an action
  on the reader's behalf.
- **CSS:** two infinite animations, the skeleton shimmer and the boot bar slide.
  `prefers-reduced-motion` caps `animation-iteration-count` at 1. Neither is a
  bar running out.
- The word "countdown" appears once in the whole app, in `quiz-ui.js`'s own
  header comment promising there isn't one. The Learn tile says "Short quiz
  sessions. No timer." The app keeps that promise.

**One amber, worth a decision.** `app.js:93` rotates the boot message every
900 ms through four lines. It is not a countdown and it is gone once the data
lands — but a dyslexic reader cannot finish a line in 900 ms, so the text moves
under them. Fix: write one line and leave it, and let the progress bar carry the
motion.

```js
    var msg = document.getElementById('bootMsg');
    /* One line, and it stays. Rotating copy every 900 ms means a reader who
       needs longer than 900 ms per line never finishes one; the bar already
       says the app is working. */
    msg.textContent = 'Counting jobs, one sector at a time…';

    restore();
```

…and delete `spin`, both `clearInterval(spin)` calls and `BOOT_LINES[1..3]`.

### Rule 2 — Read-aloud, including the app's own prose · **BREACH**

`read.js SAY` is `[data-read], [data-say], h1, h2, h3, p, li, .card-note,
.card-foot, .gloss, .empty, .stat, .peek-answer`. Prose written as a `<p>`, an
`<h2>` or an `<li>` is read. Prose written any other way is read only if it
carries `data-say`.

**The good news first.** The two surfaces the brief worried about are fine:
`.answer-p` and `.chart-says` are both `<p>` elements, and `.chart-says` also
carries `data-read`. The quiz's core loop is well covered — the stem is an
`<h2>`, the chip and the verdict and the answer sentence are `<p>`, the options
in the ask phase are `<button>`s with `data-say`, and the big-idea lesson is an
`<h2>` plus `<p>`s plus `<li>`s. Nothing in the quiz's ask-and-answer cycle is
silent.

**Ten surfaces of the app's own prose are skipped.** The pattern behind nine of
them is one thing: *`<summary>` is not in SAY, and `read.js build()` also skips
any element with no client rects — so a closed `<details>` is invisible twice
over.*

| surface | element | file |
|---|---|---|
| Every `<summary>` in the app (14 sites) | `<summary>` | `history.js:293`, `home.js:423`, `learn.js:450`, `quiz-ui.js:631`, `panels.js` (built at run time) |
| Glossary: "How it works" / "When to use it" / "What it cannot tell you" | `<dt>` | `learn.js:83–85` |
| Glossary: the layer text for all 31 terms | `<dd>` | `learn.js:83–85` |
| Glossary: entry name | `span.lname` | `learn.js:450` |
| Glossary: the plain-English definition | `span.lplain` | `learn.js:453` |
| History: the date | `span.tl-date` | `history.js:293` |
| History: the headline | `span.tl-title` | `history.js:294` |
| Learn: the big-idea hub row (name + progress) | `span.qidea-title` | `quiz-ui.js:631` |
| Learn tile: the question | `span.hq-q` | `home.js:312`, `learn.js:598` |
| Learn tile: the answer line | `span.hq-a` | `home.js:313`, `learn.js:599` |

What that adds up to, in plain terms:

- **The glossary is silent.** The reader speaks the example sentence (`p.lexample`)
  and nothing else: not the term's name, not its plain-English definition, not
  the three layers that are the actual explanation of every method the app uses.
  That is the most text-heavy prose in the app, written specifically for a
  reader who needs it plainly, and the reader never says a word of it.
- **The history timeline reads as unattributed facts.** The `<p>`s inside each
  `<details>` are read *once opened*; the date and the headline in the
  `<summary>` never are. Closed, the whole timeline is skipped.
- **The nine big ideas are silent on Learn.** The hub is
  `<details><summary><span class="qidea-title">`, so a listener is told nothing
  about the nine ideas the app is organised around.
- **The worst case is `panels.js foldLong()`.** On a phone it moves long
  footnotes, and every paragraph after the first of the brief, into a
  `<details>`. So the reader says the opening paragraph and stops — and what is
  folded away is the caveats, which is the part that matters most.

Two soft misses worth naming:

- **Options are read in the ask phase and not in the answer phase.** At
  `quiz-ui.js:343` the same options are re-rendered as plain
  `<div class="qopt">` with no `data-say`, so the reader never says "✓ Right
  answer" or "✕ Your answer" back. The verdict and the card sentence do carry
  the answer, so a listener is not lost — but they do not hear the options they
  chose between.
- **The end-of-session number** (`div.qgrow-v` / `div.qgrow-l`, "N questions you
  can answer now") is the only feedback a session gives, and it is not read.

The offer is not the problem — there is a page-level Read button, a Stop button,
a speaker beside every question and option, and a "read each question to me"
setting. **The queue is the problem.**

**Smallest fix** — three tokens and one guard in `app/js/read.js`:

```js
  var SAY = [
    '[data-read]', '[data-say]', 'h1', 'h2', 'h3', 'p', 'li',
    /* A <summary> is prose, and often the only prose: the glossary entry name,
       the timeline headline, the name of a big idea. And foldLong() puts the
       caveats behind one. */
    'summary', 'dt', 'dd',
    '.card-note', '.card-foot', '.gloss', '.empty', '.stat', '.peek-answer'
  ].join(',');
```

…and, in `build()`, stop treating a folded `<details>` as hidden. It is not
hidden from a reader who asked for the page to be read aloud; it is folded:

```js
      /* Hidden. offsetParent is null for position:fixed elements too, which
         would silently skip anything in a pinned bar or bottom sheet.
         A closed <details> is a special case: it is FOLDED, not hidden, and
         what foldLong() folds away is the caveats. Read it. */
      var fold = n.closest && n.closest('details:not([open])');
      if (!fold && !n.getClientRects().length) return;
```

Then two `data-say` attributes for the tiles, in `home.js:310` and
`learn.js:597`:

```js
      return '<button type="button" class="home-q" data-v="' + x.v + '"' +
        ' data-say="' + esc(x.t + '. ' + x.a) + '">' +
```

That is one line, one guard and two attributes. It turns the glossary, the
timeline, the nine big ideas, the Learn tiles and every folded caveat from
silent to read.

### Rule 3 — A quiet mode for public places · **BREACH (it does not exist)**

Nothing in the app is named "quiet". What exists is two half-controls that do
not know about each other:

1. a sound toggle, `#soundBtn` in the top bar, state in `localStorage`
   `"gra.sound"`, default off;
2. a quiz setting "read each question to me", state in
   `"hinterland.quiz.settings"`.

And separately: two read-aloud buttons in the top bar (`#readBtn`,
`#readStopBtn`), and a speaker beside every question, option and card sentence.
**The sound toggle touches none of them.** Turn the sound off and the Read
button will still start talking on the next tap. There is no one control for
"I am on a bus".

**How it should work here.**

One row in the ••• menu, beside Theme and Sound, labelled **Quiet mode**. On
means: *the app makes no sound and does not offer to.*

- **State:** one key, `localStorage["hinterland.quiet"]`, read in `restore()`
  before `buildChrome()`, so the first paint is already quiet. It **overrides**
  the two existing preferences without erasing them, so switching quiet off
  restores exactly what the reader had.
- **On switching on:** call `GRA.sound.setEnabled(false)` and `GRA.read.stop()`
  immediately. Do not write to `gra.sound` — that is the reader's own setting.
- **Must hide** (removed from the layout, not disabled — a disabled button is
  still a button you have to think about):
  - `#soundBtn`, `#readBtn`, `#readStopBtn` in the top bar
  - every `.qspk` speaker beside a question, an option or a card sentence
  - the "read each question to me" row inside the quiz Settings `<details>`
    (that row is `<label class="toggle"><input class="qread">` at
    `quiz-ui.js:659`; give the label a second class, `qset-read`, so the CSS
    below can reach it without `:has()`)
  - any "explain it aloud" affordance `learn.js` offers
- **Must stay:**
  - every word on screen — quiet mode removes the voice, never the text
  - the theme toggle, Export, and the two place chips
  - the `.reading` position-marker CSS, which costs nothing and is used by
    nothing else
  - the menu row itself, so it can be switched back off
- **No hole in the layout.** The top bar is a grid ending in four `.iconbtn`
  buttons and `#menuBtn`, with `.topbar-spacer` taking the slack before them.
  So the buttons must be **removed from flow**, not made invisible:

```css
/* Quiet mode: the voice goes, the words stay, and .topbar-spacer absorbs the
   width so Export does not drift and the wordmark does not stretch. */
body.is-quiet #soundBtn,
body.is-quiet #readBtn,
body.is-quiet #readStopBtn,
body.is-quiet .qspk,
body.is-quiet .qset-read { display: none; }
```

`visibility: hidden` would leave three 34 px gaps in a bar that is already tight
at 360 px. Check it at 360.

### Rule 4 — Licence credit, generated not typed · **BREACH**

**The generated half is already right.** `P.sources` in `app/js/panels.js` walks
`meta.sources` and prints one card per source; `exportui.js`'s "About this
export" sheet loops the same array. Neither is typed, and neither can drift from
what was built. `meta.json`'s 19 sources come from `source_meta` in the SQLite
build, which comes from `pipeline/sources.py`. That chain is sound.

**What is credited now,** per source, all 19 of them: `title`, `vintage` (as the
card badge), `purpose` ("Used for:"), `caveats` ("Cannot be trusted to say:"),
`cite` (the DOI line in the card foot), and `rows_loaded` where present. Held in
the payload and never shown: `url` — every source has one and it never becomes
a link.

**What is missing:**

| field | sources carrying it |
|---|---|
| `licence` | **0 of 19** |
| `license` | **0 of 19** |

The word "licence" appears **nowhere in the shipped app** — not in any JS, not
in `index.html`, not in the CSS, not in any payload. It appears nowhere in
`pipeline/sources.py`: the `Source` class takes
`key/title/url/purpose/caveats/vintage/filename/pid/cite` and no licence. The
only licence statement in the whole project is one hand-typed line at the bottom
of `README.md`, which no reader of the app ever sees and which nothing
regenerates.

Every payload's own declared source *is* credited — the two boundary files
(92-160-X), `detail.json` (98-10-0456), `io.json` (36-10-0113) and
`population.json` (17-10-0155) all trace to a card. So the problem is not
attribution. It is the licence.

**What the licence requires.** Statistics Canada Open Licence, two obligations:

1. **Acknowledge the source**, in the form
   `Source: Statistics Canada, <product>, <date>.`
   The app prints the product and the DOI but never states that Statistics
   Canada is the source of the data.
2. **Where the data has been modified, say so and disclaim endorsement:**
   `Adapted from Statistics Canada, <product>, <date>. This does not constitute
   an endorsement by Statistics Canada of this product.`
   Hinterland modifies everything it shows — it reaggregates, decomposes,
   indexes and rounds — so clause 2 is the one that applies, to every card. The boundary files carry the same licence.

**The smallest change that makes the credit generated rather than typed.**
Three edits, none of them in the app's prose.

1 — `pipeline/sources.py`, in `Source.__init__`. Every source in this file is
Statistics Canada open data and every one is reaggregated, so both fields
default and no call site changes:

```python
class Source:
    def __init__(self, key, title, url, purpose, caveats, vintage, filename,
                 pid=None, cite=None,
                 licence="Statistics Canada Open Licence",
                 licence_url="https://www.statcan.gc.ca/en/reference/licence",
                 adapted=True):
        self.key, self.title, self.url = key, title, url
        self.purpose, self.caveats = purpose, caveats
        self.vintage, self.filename = vintage, filename
        self.pid, self.cite = pid, cite
        # The licence is a property of the source, not a sentence someone
        # remembers to write. adapted=True because the tool reaggregates and
        # decomposes everything it shows, which is the clause of the Open
        # Licence that requires the endorsement disclaimer.
        self.licence, self.licence_url, self.adapted = licence, licence_url, adapted
```

2 — carry the three fields through the build. In `pipeline/build.py`, add
`licence TEXT, licence_url TEXT, adapted INTEGER` to the `source_meta` table and
to both `record_source` inserts; in `pipeline/export_web.py`, add them to the
`SELECT`:

```python
    for r in con.execute("""SELECT key,title,url,purpose,caveats,vintage,cite,
               licence,licence_url,adapted,built_at,rows_loaded
               FROM source_meta ORDER BY key"""):
        sources.append(dict(r))
```

3 — `app/js/panels.js`, in the per-source card foot inside `P.sources`. One
expression, and it says whatever the build said:

```js
      c.appendChild(h('<div class="card-foot" style="font-family:var(--mono);' +
        'font-size:11.5px">' + C.esc(s.cite || '') +
        (s.rows_loaded ? '<br>' + C.fmt(s.rows_loaded) + ' rows loaded' : '') +
        /* Generated from the source row, so it cannot drift from what was
           built and cannot be forgotten when a source is added. */
        '<br>' + C.esc((s.adapted ? 'Adapted from ' : 'Source: ') + s.title +
          ', ' + (s.vintage || '') + '. ' +
          (s.adapted ? 'This does not constitute an endorsement by Statistics ' +
            'Canada of this product. ' : '') + (s.licence || '')) +
        '</div>'));
```

…and the same line in `exportui.js`'s Sources block, which already loops
`D.meta.sources`.

4 — one new check in `pipeline/validate.py`, so the credit cannot go missing
again:

```python
    blank = [k for k, lic in con.execute(
        "SELECT key, licence FROM source_meta") if not (lic or "").strip()]
    check("every source declares a licence, so the on-screen credit is "
          "generated and cannot be forgotten", not blank, ", ".join(blank))
```

After that the credit is a function of what was built: adding a source without a
licence fails the 144th check instead of shipping a silent omission.

---

## Summary of breaches

| rule | verdict | smallest fix |
|---|---|---|
| 1 no timers or countdowns | **PASS** (1 amber: the 900 ms boot rotator) | delete `spin` in `app.js:93`, keep one boot line |
| 2 read-aloud incl. the app's own prose | **BREACH** — 10 surfaces skipped | add `'summary', 'dt', 'dd'` to `SAY`; read inside a closed `<details>`; two `data-say` on the tiles |
| 3 a quiet mode | **BREACH** — does not exist | one ••• menu row, `localStorage["hinterland.quiet"]`, `body.is-quiet` `display:none` on 3 buttons + `.qspk` + the read setting |
| 4 licence credit generated | **BREACH** — 0 of 19 sources carry a licence | 3 default fields in `sources.py`, carry them through the build, one generated line in `P.sources` and `exportui.js`, one new `validate.py` check |

## Summary of weight

| | gzipped |
|---|---|
| eager, before the first question | **636 KB** |
| automatic first visit (eager + `boundaries_csd.json`) | **922 KB** |
| after moving `boundaries_csd.json` off boot | 636 KB |
| after also deferring `population`/`components`/`io` | **539 KB** |

## Summary of coverage

1,000 questions. The three largest holes: **the basics are 4% of the bank**
(38 items, six ideas with three or fewer); **time is 8%** (2016 never
mentioned, only 6 items name two years); **Northern Ontario gets 0.9 questions
per municipality** against Central Ontario's 4.2. All three can be filled from
payloads the app already loads.
