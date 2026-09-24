# Hinterland quiz: question shapes, and guessing

24 September 2026. Two audits of the 1,004-question bank.

- **Audit 3** counts the pool by the *task* the reader has to do, then checks where each task sits in the introduction order by driving the real scheduler.
- **Audit 4** counts how many questions can be answered by someone who knows nothing about Ontario.

Both run from the project root and print plain text, or JSON with `--json`:

```
node pipeline/audits/shapes.js
node pipeline/audits/guessability.js
```

They load the real app modules and the real payloads through `pipeline/audits/harness.js`. Nothing was changed in `app/`.

**Timing note.** Other agents were editing `app/js/quiz-bank.js` and `app/js/quiz-ideas.js` while this audit ran, on top of commit `418f7ca`. The tables below were measured on a bank of **1,004** items; a re-run near the end of the audit gave **1,000** (the `C/twin` form lost four items). Every finding and every count of a problem is unchanged. Re-run either script for current figures — they read the live modules, never a snapshot.

---

## The three numbers that matter

1. **Half the bank is one task.** 504 of 1,004 questions (50.2%) are "a place is named, pick the fact about it". Add the two other single-place tasks and it is 782 questions, 77.9% of the pool.
2. **Three of the nine tasks are never met in the first fortnight**, and one of them is 19% of the whole bank. A learner playing every day for a year would first see a fingerprint question on day 77 and would **never** see an `A/bigger` question at all.
3. **81 questions can be answered with certainty by someone who knows nothing.** The stem names one of the two options, and the named one is wrong every single time — 81 out of 81.

---

## What the existing checks already cover

`pipeline/quiz_selftest.js` (wired into `pipeline/validate.py` section 10) already enforces, on every item:

- exactly one correct option, and no duplicate item ids;
- no two options with the same text;
- a universe chip (G4) and, for strands A–C, a date (G5);
- a card sentence on every item;
- G9 confusable place names — Levenshtein distance, shared leading word, shared first five letters — on the six place-name forms;
- the G9 stem giveaway, but **only** on `commute-out`, `commute-in` and `twin`;
- a spoken form on every option, carrying its letter;
- stem and card word counts, per strand.

`pipeline/quiz_simulate.js` already checks scheduler behaviour: breadth never jams, the backlog drains, intervals stay capped, every idea opens, no question or place twice in a session, and "learned" means remembered.

Neither file counts the pool by task, checks whether a shape is ever reached, or compares the key against the distractors. That is what these two audits add. **Audit 4 found that the G9 stem-giveaway check, which exists, is not applied to the one form that most needs it** — see R2 below.

---

# Audit 3 — what is the player actually being asked to do?

## The taxonomy

The bank names itself by strand and form, which are data-structure labels. `G/class-fact` holds a comparison, a share and a rate. `A/bigger` and `G/on-pair` do the same job on different nouns. So the audit builds nine **tasks** from what the reader must actually do, and tags each with the demand it makes.

| Task | Demand | What the reader does |
|---|---|---|
| `place-to-fact` | recall | A place is named. Pick the fact true of it — largest industry, commonest occupation, where its commuters go, its structural twin. Nothing on screen helps. |
| `identify-from-evidence` | identify-from-evidence | A sector profile is drawn with no name on it. Read the picture, say whose it is. The only task where the evidence is in front of the reader. |
| `compare-two-named` | compare | Two or three things are named. Rank them on one measure. |
| `fact-to-place` | recall | A description is given, three places offered. Which fits? The same knowledge run backwards. |
| `true-or-false` | true-or-false | A yes/no claim about one place, with the reason restated in each button. |
| `order-in-time` | order-in-time | Which of two events came first. Sequence, not size. |
| `judge-a-method` | judge-a-method | Which method answers this, what a method cannot tell you, why a pattern holds. |
| `class-rule` | recall | A general rule about a whole class — small towns, big cities, Ontario. |
| `read-a-number` | read-a-number | A figure is stated or must be sized. |

## The pool, by task

| Task | Items | Share | Forms |
|---|---:|---:|---|
| place-to-fact | **504** | **50.2%** | B/largest 96, B/occupation 123, C/commute-in 104, C/commute-out 155, C/twin 26 |
| identify-from-evidence | 191 | 19.0% | B/fingerprint 191 |
| compare-two-named | 90 | 9.0% | A/bigger 81, G/class-fact 3, G/on-pair 6 |
| fact-to-place | 87 | 8.7% | B/concentrated 35, G/type-which 44, G/er-cluster 5, G/big-lean 3 |
| true-or-false | 41 | 4.1% | D/yesno 41 |
| order-in-time | 38 | 3.8% | F/which-first 38 |
| judge-a-method | 32 | 3.2% | E/cannot 20, E/which-method 10, G/concept 2 |
| class-rule | 13 | 1.3% | G/class-lean 6, G/class-level 3, G/type-area 2, G/on-top 1, F/data-history 1 |
| read-a-number | 8 | 0.8% | E/read-number 4, G/class-fact 3, F/data-history 1 |

**One shape dominates.** `place-to-fact` is half the bank on its own. Take the three tasks that are all "one place at a time" — place-to-fact, fact-to-place and identify-from-evidence — and that is 782 questions, 77.9%.

The counterweight is thin on purpose and thin by accident. The two tasks that ask the reader to *reason* rather than *remember* — `read-a-number` (8 items) and `judge-a-method` (32 items) — are 4% of the bank between them. `class-rule`, which is the lesson itself, is 13 items. Those three are where the nine big ideas actually live, and they are 5.3% of the pool.

The reason is structural. Every "one place at a time" task scales with 577 municipalities. Every rule-level task is written once per rule. Nothing is wrong with the individual items; the pool is simply the shape of the data, not the shape of the curriculum.

## Where each shape sits in the introduction order

This is the finding that mattered most in the comparison app: new shapes had been appended to the end of the pack, so a player would never have reached them.

Method: seven seeded learners, 40 daily sittings each, driven through the **real** `quiz-sched.js`. The learner model is the one `quiz_simulate.js` already uses and `validate.py` already runs — a true difficulty near the item's prior, exponential forgetting, one-in-k guessing. Every learner is asked 476 questions over the 40 sittings. Shares of the first 100 are pooled over all seven learners, so the column sums to 100%.

| Task | First sitting (median, range) | Share of the first 100 | Met at all in 40 | Met in the first 14 |
|---|---|---:|---|---|
| place-to-fact | 1 (1–1) | 31.1% | 7/7 | 7/7 |
| class-rule | 1 (1–1) | 25.6% | 7/7 | 7/7 |
| compare-two-named | 1 (1–1) | 17.3% | 7/7 | 7/7 |
| fact-to-place | 1 (1–1) | 17.0% | 7/7 | 7/7 |
| judge-a-method | 2 (2–2) | 8.1% | 7/7 | 7/7 |
| read-a-number | 9 (7–17) | 0.9% | 7/7 | 6/7 |
| **identify-from-evidence** | **21** | **0.0%** | **1/7** | **0/7** |
| **true-or-false** | **36 (30–38)** | **0.0%** | **5/7** | **0/7** |
| **order-in-time** | **never** | **0.0%** | **0/7** | **0/7** |

**Three tasks are not met in the first fortnight: `identify-from-evidence`, `order-in-time`, `true-or-false`.**

The first is the serious one. `identify-from-evidence` is 19% of the bank and the only task where the reader looks at something rather than decoding a sentence — the form the design calls out as the most dyslexia-friendly (`QUIZ-DESIGN.md` §4). One learner in seven met it inside 40 sittings.

The two pieces of the curriculum that make the quiz feel like a subject rather than a lookup table — the long view (`order-in-time`, `true-or-false`) and reading numbers (`read-a-number`) — together account for **0.9% of the first 100 questions.**

### How long before a shape is reached at all

One learner, 365 daily sittings, 4,376 questions.

| Form | Items | First sitting |
|---|---:|---|
| B/largest, B/occupation, G/on-top, G/on-pair, G/er-cluster, G/class-level | 234 | 1 |
| G/concept, G/class-lean, G/class-fact | 14 | 2 |
| G/type-area | 2 | 14 |
| G/type-which | 44 | 15 |
| G/big-lean | 3 | 19 |
| B/concentrated | 35 | 23 |
| C/commute-out | 155 | 27 |
| F/data-history | 2 | 30 |
| D/yesno | 41 | 32 |
| E/which-method | 10 | 33 |
| E/read-number | 4 | 40 |
| F/which-first | 38 | 46 |
| C/commute-in | 104 | 74 |
| **B/fingerprint** | **191** | **77** |
| E/cannot | 20 | 100 |
| C/twin | 26 | 104 |
| **A/bigger** | **81** | **never in a year** |

### Why — three separate mechanisms

**1. Level 3 is the grave.** `S.pickNew` scores a candidate at `-(level) * 3 + surprise * 1.2 - prior * 0.8`. Three points per level swamps everything else, so a level-3 item can never outrank a level-2 item in the same idea. `A/bigger` (81 items) and `C/twin` (26) sit at level 3 of the `links` idea, behind 259 level-2 items in `commute-out` and `commute-in`. `B/fingerprint` (191 items) sits at level 3 of `smalldiff`, `bigdiff` and `key`.

**2. Ties are broken by item id.** Within one idea and one level, candidates are sorted by score and then by `x.id < y.id`. `commute-out` ids begin `C1:` and `commute-in` ids begin `C2:`, and both have `prior: 0.5`, so **all 155 out-commuting questions are served before the first in-commuting question.** That is not a design decision, it is alphabetical order, and it is exactly the "appended to the end of the pack" failure. The same effect puts all 41 `D/yesno` items ahead of all 38 `F/which-first` items inside `change` level 2 — which is why one shape arrives at sitting 32 and its neighbour at sitting 46.

**3. Ideas 6 to 9 are a long way down.** Ideas open strictly in order, so `change` (idea 8) and `methods` (idea 9) cannot start until the first seven have a foothold. `E/cannot` — what a method cannot tell you, which is the whole point of the methods idea — arrives on day 100.

### What to do about the order

Three changes, in order of value:

1. **Flatten the level penalty and make it relative.** Drop the level term from `-3 × level` to about `-1 × level`, so surprise, home region and prior can still move an item. A level-3 item with `surprise = 1` should be able to outrank a dull level-2 item.
2. **Round-robin the forms inside an idea and level, instead of sorting by id.** When two forms share an idea and a level, alternate between them. On the counts above that should bring `commute-in` forward from sitting 74 to roughly where `commute-out` arrives now (27), and `which-first` from 46 to roughly where `yesno` arrives now (32), at no cost. Re-run `shapes.js` after the change to confirm.
3. **Cap how many items of one form one idea-level can serve before another form gets a turn.** `perForm` already caps within a session; the pool needs the same cap across sessions.

There is also a bank-side fix worth making: `B/fingerprint` should not be level 3. It is a picture-reading task, it is 19% of the pool, and the design says it is the easiest form for a dyslexic reader. It belongs at level 1 or 2.

## Three new shapes, from material already verified

Each is costed by running the real gate helpers in `quiz-bank.js` (`_h.clear`, `_h.namesOk`, `_h.optName`, `FLOOR`), not by estimate. None is implemented here.

### N1 — Put three places in order, biggest first

**Data.** `app/data/work_csd.json` totals via `D.workVec(code, 'total')` and `'usual'`, grouped by census division from `geo.json`. No new data.

**Gates.** G1 separation on **both** adjacent pairs, not just the ends — the middle place must clearly beat the third. G8 measure invariance: the same order must hold on `total` and on `usual`, which is what stops a work-from-home artefact ordering the list. G2 floor of 50 on all three. G9 `namesOk` across all three names. G4 universe chip `CHIP.work`, G5 date "May 2021". One new gate is needed: **no two of the three may be within a factor a reader cannot see** — the G1 test already provides this, but the answer card must state all three figures, and G1 applies to everything the screen states.

**Yield.** 4,735 triples pass every gate, across 40 of 49 census divisions. That is far too many — it would re-create the v1 problem where one form was 63% of the bank. **Capped at three per division: 115 items.**

**Where it must sit.** Level 2 of `key` for a province-wide triple, and level 2 of `big` and `small` for within-class triples. Not `links`, and never level 3 — that is where `A/bigger` went to die. At idea 1–4 level 2 it is reached by about sitting 15.

### N2 — Where does this number come from?

**Data.** `app/data/meta.json` only: 19 sources, each with `title`, `purpose`, `vintage`, `caveats` and `cite`. All 19 pass the audit's relevance filter — every one names a figure the app displays somewhere — but only about 14 are worth asking about, the rest being boundary and attribute files a reader never sees.

Two sub-forms:

- *Which source?* — the stem names a figure the app displays ("the count of jobs by industry in each municipality"), the options are three source labels. 19 candidates.
- *Which is more recent?* — two source vintages at least four years apart, as `F1/which-first` already requires for events. **107 qualifying pairs.**

**Gates.** The existing gates mostly do not apply, because no count is being asserted, so this shape needs two of its own: **(a) distinct families** — no two options may be different tables from the same collection, or the question becomes a test of reading catalogue numbers rather than of provenance; **(b) a plain label** — the option must be a human phrase ("the 2021 census, May reference week"), never a catalogue number, or it fails the same readability bar the stems are held to. G4 universe becomes "Sources", G5 the date is the answer. G9 confusability applies to the labels: "Table 98-10-0456" and "Table 98-10-0459" would fail it, which is the point.

**Yield.** Capped: about 14 "which source" and 20 "which is more recent" — **34 items.** 

**Where it must sit.** Not in `methods`: that is idea 9 and `E/cannot` arrives on day 100. Put the three or four that carry the most weight — the May 2021 reference week, residence basis against workplace basis, the business-register snapshot that is not a job count — at **level 1 of `every`**, where they are reached on sitting 1 or 2. The remainder go to `methods` level 1.

### N3 — True against a common myth

**Data.** Two generators, both from figures already computed and already gated.

- *Place level.* The bank already finds, flags and explains the case where a place's most **distinctive** sector is not its **largest** — `genLargest` sets `surprise: 1` and writes the card sentence for it. Turn that into a claim: "True or false: the biggest group of jobs in Owen Sound is manufacturing." False, and the card already says what it is. **38 places qualify today.**
- *Class level.* From `quiz-ideas.js` `compute()`: for each size class, the sector with the highest location quotient against Ontario — what the class is *known for* — where its share is under half and a different sector clearly leads. "Most jobs in small towns are in farming" is false, and the data says agriculture is a minority and health and social care leads. **4 class-level myths qualify.**

**Gates.** G1 on the comparison that refutes the myth — the true leader must clearly beat the myth sector, on both measures (G8). G2 floor on both figures. The distinctive sector must reach LQ 1.5, so the myth is one a reader might actually hold rather than a straw man. G4 and G5 as usual. One new gate: **the myth must be stated as a claim, never as a question** — "most jobs in small towns are in farming: true or false", not "are most jobs in small towns in farming?", because the second reads as a hint.

**Yield. 42 items.**

**Where it must sit.** The four class-level myths belong at **level 1 of `every`**, directly under the lesson sentence that already says "the largest industry in a place is often not the one it is known for". The 38 place-level ones stay where their source items already are, at level 3 of `every` — and will only be reached if the level penalty is flattened.

### N4 — spare: fill the gap in a generated lesson sentence

13 of the lesson sentences that `I.lesson()` already generates carry exactly one blankable figure. Cloze on a sentence the reader has just been shown is the cheapest "teach then test" shape in the app and needs no new gate beyond the ones the lesson already passes. Worth building if `read-a-number` is to stop being 0.8% of the bank.

---

# Audit 4 — guessability

## The method, and why it is not "count the ugly items"

The usual way to audit this is to count items with a cue. That over-reports badly. A cue only helps a guesser if it **points at the key more often than chance does**. So every cue below is measured three ways:

- **present** — items where the cue fires at all, whichever option it picks out;
- **points at key** — of those, how often the option it picks out is correct;
- **chance** — what a coin would have scored on the same items, summed as 1/k because two- and three-option items are mixed.

The ratio of the last two is the **lift**. Lift 1.00 means the cue is worth nothing, however ugly the item looks.

## The counts

| Cue | Present | Points at key | Chance | Lift | p |
|---|---:|---:|---:|---:|---|
| one option 1.5× longer than every other | 293 (29.2%) | 107 | 108.3 | 0.99 | 0.92 |
| exactly one option hedges | 16 (1.6%) | 5 | 5.3 | 0.94 | 0.93 |
| exactly one option negates | 44 (4.4%) | 15 | 21.5 | 0.70 | 0.07 |
| **the stem quotes one option word for word** | **81 (8.1%)** | **0** | **40.5** | **0.00** | **<0.001** |
| a distinctive stem word in exactly one option | 2 (0.2%) | 1 | 0.7 | 1.50 | 0.80 |
| two options are variants of each other | 2 (0.2%) | 2 | 1.3 | 1.50 | 0.80 |
| two options say the same thing | 1 (0.1%) | 1 | 0.7 | 1.50 | 0.72 |

Items where at least one cue points at the key: 130 (12.9%). Items where a cue leaves a know-nothing player **better off than chance: 83 (8.3%)**. Items answerable **with certainty, knowing nothing: 81**.

### The one real hole: the stem names the answer

All 81 are `A/bigger`. The generator `genBigger` writes the stem "Which has more jobs?" and passes `namesOk([hi, lo])` — fine. Then `quiz-ideas.js` `I.classify` **rewrites the stem after the gate has run**:

```js
it.stem = H.optName(lo) + ' has more people. Which has more jobs?';
```

`lo` is the place with more people and fewer jobs — always the wrong option. So the rule "never pick the place the question names" is right 81 times out of 81. The selftest already has the check that would catch this (`namesOk(labels, stemPlace)`), but it is applied only to `commute-out`, `commute-in` and `twin`, and it runs before the rewrite.

This is currently harmless in practice, because Audit 3 shows `A/bigger` is never reached in a year of daily play. It stops being harmless the moment the introduction order is fixed — which is the first recommendation of Audit 3.

### Length: not a hole

| Ratio | Items flagged | Long option is the key | Lift |
|---:|---:|---:|---:|
| 1.25× | 506 | 163 (32.2%) | 0.89 |
| 1.50× | 293 | 107 (36.5%) | 0.99 |
| 1.75× | 177 | 65 (36.7%) | 0.99 |
| 2.00× | 93 | 34 (36.6%) | 0.93 |
| 2.50× | 32 | 13 (40.6%) | 0.95 |
| 3.00× | 16 | 4 (25.0%) | 0.53 |

**The ratio used is characters, not words**, because length is seen before it is read: on a phone an option is a shape before it is a sentence, and character count is what sets that shape. 1.5× is where the key's line visibly outruns its neighbours in a three-option list at 375px. The word ratio tracks it closely — at the 1.5× character bar the flagged option averages 2.02× in characters and 1.96× in words — so nothing turns on the choice.

Across the pool the correct option is the longest 32.9% of the time against 36.1% expected. "Always pick the long one" loses. This is worth saying plainly: the app has no length bias, and a rule failing the build at 1.5× or 2.0× would delete 93 to 293 honest items to fix a problem that does not exist.

### Hedging and negation: not holes either

A lone hedge points at the key 5 times in 16 (lift 0.94). A lone negation, 15 times in 44 (lift 0.70, p = 0.07) — if anything a lone negation is slightly *less* likely to be the key. Both are at chance. The `E/cannot` form is why the negation count is as high as it is, and there every option is a limitation, so the reader gets nothing.

### Variants and equivalents: three items, all real

- **`E3:3.2`** — "A location quotient of 3.2 means the place…" offers *is specialised in it*, *has much less than its share*, and (the key) *is strongly specialised in it*. At 3.2 the place **is** specialised in it, so the first option is also true. Two options cannot both be right.
- **`B1:3526057`** — options *Lincoln*, *West Lincoln*, *Welland*. "Lincoln" is contained in "West Lincoln".
- **`C2:3502010`** — options *East Hawkesbury*, *Hawkesbury*, *Alfred and Plantagenet*.

The last two are the failure mode G9 exists to prevent, and `quiz-bank.js` names this exact pair in a comment ("East Hawkesbury -> Hawkesbury… the answer was in the question"). But `confusable()` misses it: `lead('east hawkesbury')` is `east`, the first five characters are `east ` against `hawke`, and the edit distance is 5. The fix is one line — add a containment test to `confusable()`.

### Position: clean

| | Counts | Shares | χ² | p |
|---|---|---|---:|---|
| 3-option items (836) | A 278, B 281, C 277 | 33.3 / 33.6 / 33.1% | 0.03 on 2 df | 0.985 |
| 2-option items (168) | A 79, B 89 | 47.0 / 53.0% | 0.60 on 1 df | 0.440 |

The FNV-seeded shuffle in `quiz-bank.js` is deterministic for a given id (verified: the same id twice gives the same order) and does vary with the id. No form of 20 items or more is significantly lopsided; the least uniform are `E/cannot` (20 items, 60% in B, p = 0.02) and `B/fingerprint` (191 items, 41% in C, p = 0.04), neither of which survives correction for the 12 form-and-option-count groups tested.

### A know-nothing player

Applying only the cues whose direction the pool actually supports (10 items or more, two-sided p < 0.05) plus the two logic deductions:

- expected right over all 1,004 items: **403.2 (40.2%)**
- pure chance on the same items: **362.7 (36.1%)**
- gain: **4.0 percentage points**, lift 1.112

All of that gain comes from the 81 stem-naming items and the 3 logic flaws. Fix those 84 and the bank is at chance.

### The worst 20 items

All 20 are `A/bigger`, all go from 50% to 100% for a player who knows nothing, listed here by how badly the length gap compounds it:

`A1:3509010-3509021`, `A1:3543068-3543072`, `A1:3543014-3543052`, `A1:3526037-3526047`, `A1:3552023-3552092`, `A1:3542045-3542047`, `A1:3543015-3543072`, `A1:3549014-3549022`, `A1:3549014-3549056`, `A1:3557011-3557091`, `A1:3542029-3542053`, `A1:3552028-3552031`, `A1:3523001-3523017`, `A1:3538019-3538035`, `A1:3542004-3542045`, `A1:3542015-3542029`, `A1:3549022-3549046`, `A1:3554042-3554056`, `A1:3512020-3512061`, `A1:3548001-3548031`

Because that list is one form repeated, the audit also prints the **badly formed** items — two or more flags, or a logic flaw — whether or not the flag currently pays. Excluding the 41 `A/bigger` items that R2 removes anyway, there are seven:

`B1:3526057`, `C2:3502010`, `E3:3.2`, `E2:diversity`, `E2:multiplier`, `E2:self-containment`, `F2:manufacturing`

---

## What should fail the build

Four rules to fail on, two to note. Thresholds are exact, and the cost today is measured.

| | Rule | Threshold | Fails today |
|---|---|---|---:|
| **R1** | No option more than three times the length of another | one option ≥ **3.0×** the longest other option, in characters, whichever option it is | **16** |
| **R2** | The stem never quotes an option | the stem contains one option's label word for word, as a whole phrase of 4 characters or more | **81** |
| **R2b** | No lone distinctive stem word either | a word of 5 letters or more, not a stop word and not a generic place-type word, appears in exactly one option | **2** |
| **R3** | Options mutually exclusive | two options reduce to the same core tokens once function words are removed, **or** one option's text contains another's | **3** |
| **R4** | Position uniform | χ² of the correct position against uniform, p < 0.01, for either option-count group or for any single form of 30 items or more | **0** |
| **R5** | No cue may predict the key across the pool | for any cue firing on 30 items or more, the share pointing at the key must be within a binomial p of 0.01 of chance | **1 cue** |
| R6 | Lone hedge, lone negation | **note only** | 0 |

### Why these thresholds

**R2 is the one that matters.** 81 items, lift 0.00, p < 0.001. The check already exists in `quiz_selftest.js`; it needs extending from three forms to all of them, and it needs to run **after** `quiz-ideas.js` has rewritten stems, not before. That ordering is the actual bug.

**R1 at 3.0×, not 1.5×.** Below 3× the length cue carries no information at all (lift 0.93 to 0.99, p ≥ 0.64), so failing at 1.5× would delete 293 honest items and at 2.0× would delete 93, for nothing. At 3× the direction has flipped — the long option is the key only 25% of the time — and a 5-character option beside a 49-character one (`F1:1994-2001:NAFTA/Hamilton…`, 9.8×) is a formatting fault whether or not it is exploitable. 16 items is a cheap, honest bar.

**R3 costs three items and removes a logical contradiction**, which is worth failing over on its own terms. The containment half of the rule also closes the `Lincoln` / `West Lincoln` gap in G9.

**R4 costs nothing today.** That is the argument for it: the pool is uniform, so the rule is pure regression insurance against a future generator that stops shuffling.

**R5 is the general rule and the other four are special cases of it.** It is the right long-run gate: any new cue anyone thinks of can be added to the list, and the build fails only if it actually predicts the key. It fails on one cue today, `stem-names-option`, 0 of 81 against 41 expected.

**R6 should not fail the build.** A lone hedge and a lone negation both sit at chance in this bank. Failing on them would delete honest items — most of `E/cannot`, which is the only form that teaches what a method cannot do — to fix nothing.

---

*Audit scripts: `pipeline/audits/shapes.js`, `pipeline/audits/guessability.js`. Both take `--json`. Neither writes anything.*
