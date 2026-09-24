# The eight-audit programme — before and after

24 September 2026. Hinterland's question and learning module, put through the
same programme another app has just been through. Every number below comes from
a script in `pipeline/audits/`, which you can re-run yourself:

```
node pipeline/audits/accuracy.js      # 1  accuracy
node pipeline/audits/spacing.js       # 2a repetition (the scheduler)
node pipeline/audits/duplicates.js    # 2b repetition (the pack)
node pipeline/audits/shapes.js        # 3  question shapes
node pipeline/audits/guessability.js  # 4  guessability
node pipeline/audits/ux_probe.js      # 5  phone UX (paste into the console)
node pipeline/audits/weight.js        # 6  load weight
node pipeline/audits/coverage.js      # 7  coverage
node pipeline/audits/rules.js         # 8  standing rules
node pipeline/audits/gap_sweep.js     # the spacing sweep, for re-deciding
python pipeline/validate.py           # all 146 build checks, audits included
```

Five of the nine now **fail the build** when they regress: accuracy (hard
failures must be zero), guessability (R1–R5 zero), the standing rules, the
scheduler's backlog and spacing, and the retention floor.

---

## The one-page summary

| Audit | Measure | Before | After |
|---|---|---|---|
| 1 accuracy | unsupported claims | **210 in 157 items** | **0** (6,576 claims checked) |
| 1 accuracy | false positives in the checker | 6 of 234 first-draft flags | 0 (15 soft notes, all real wording risks) |
| 2a repetition | seen 5+ times in a fortnight | **41 of 72** | **0 of 97** |
| 2a repetition | asked again the very next day | **105 of 320 asks (33%)** | **0** |
| 2a repetition | shortest gap between sightings | same-day / 1 day | **3 days** |
| 2a retention | held at the next review (120 days) | 63% avg, 61% lowest | **69% avg, 65% lowest** |
| 2b duplicates | clusters / items touched | **620 / 807** | **377 / 574** |
| 2b duplicates | the same sentence, same answer | up to **8 times** | at most **3**, mostly 2 |
| 3 shapes | dominant task's share | **place-to-fact 50.2%** | **38.7%** |
| 3 shapes | tasks reached in a fortnight | **6 of 9** | **10 of 10** |
| 3 shapes | tasks in the bank | 9 | **10** (a new one: put in order) |
| 4 guessability | items a know-nothing wins | 44 certain | **0** |
| 4 guessability | build-failing rules breached | R2 121, R3 36, R2b 44 | **0** (R2b watched at 2) |
| 5 phone UX | quiz parts that obey the reader's text size | **0 of 15** | **15 of 15** |
| 5 phone UX | answer screens with Next below the fold | **5 of 8** | **1 of 8** |
| 5 phone UX | contrast of the letter on a dimmed option | 3.05:1 light | **≥4.5:1** |
| 6 weight | gzipped, first visit, unasked | **922 KB** | **645 KB** |
| 7 coverage | industries never asked about | 2 of 20 | **0** |
| 7 coverage | level-1 "basics" share of the bank | 4% | **7%** |
| 8 rules | breaches | **4** | **0** |

Bank size went 995 → 849. It is smaller on purpose: 244 duplicates cut, 78
questions of two new shapes added, and the Ontario-wide pairs widened from 6 to
26.

---

## 1. Accuracy

**What was measured.** Every number, name, comparison, date and method claim in
every question, card and lesson, recomputed from the payload the app itself
loaded, with the tolerance the app's own rounding implies. 6,576 claims.

**Before: 210 unsupported claims in 157 items, from five root causes.**

1. `topWords()` named two sectors as "led by X and Y" without testing that
   either was clearly ahead of the next — 149 items.
2. The structural twin said "of a similar size" about places up to four times
   apart in job count — 26 items.
3. `bigger` put the population fact in the stem, which made the *other* option
   right every time — 81 items (this one is also audit 4's worst finding).
4. Two lesson sentences asserted cause where the data shows only association.
5. "People travel in to work" was said on two cards where the winner sent more
   workers out than it drew in.

**After: 0 hard failures, 15 soft notes.** Every fix was to the generator, not
to a sentence: the gate now refuses to make the claim rather than the checker
flagging it afterwards. `validate.py` fails the build if a hard failure returns.

**Cost of quiet.** The first draft of the checker produced 234 flags, 6 of them
false. Tuning the parsers (bilingual place names, `about()` dropping the word
below 100, one-or-two-sector fingerprints) took the false positives to zero
without weakening a single rule. The checker runs in under a second.

---

## 2a. Repetition — the scheduler

**What was measured.** A fortnight of keen play (14 days, two sittings a day,
twelve questions a sitting) driven through the *real* `quiz-sched.js`, not a
model of it.

| | before | after |
|---|---|---|
| distinct questions seen | 72 (7% of the bank) | 97 (11%) |
| seen 5 or more times | 41 | **0** |
| most-repeated question | 8 times | 4 |
| asked again the next day | 105 of 320 asks | **0** |
| right first time, then asked tomorrow | 16 | **0** |
| missed, then asked tomorrow | 58 | **0** |
| gaps of 3–6 days | 25% of repeats | **100%** |

**What changed.** A minimum gap of three days (`minGapDays: 3`); a cool-down
that respects it across sittings; a lapse back-off of `[2, 2]` days rather than
"again tomorrow"; a leech floor of three days after three lapses; and a pace
rule that counts reviews *blocked by the gap* as waiting, so the planner stops
pouring eight new questions on top of a backlog it could not see.

**And the thing I got wrong.** I assumed — and so did the agent that ran the
first pass — that widening the spacing would cost retention, and that the fix
was a trade. It is not. `gap_sweep.js` (written for exactly this question,
re-runnable) sweeps the minimum gap and re-runs the learning simulation:

| minimum gap | seen 5+ | held at next review |
|---|---|---|
| 1 day | 34 | 63% |
| 2 days | 12 | 62% |
| 3 days | 2 | 62% |
| 4 days | 2 | 61% |

Held is flat. The repetition was buying nothing. The 2-point dip came from the
lapse back-off, not the gap, and an ablation isolated it: all three edits 62.4%,
"a miss returns tomorrow" 67.7% but with a backlog 0.672 over the bound, the
pace rule reverted 61.0%. `[2, 2]` recovered it — and the final number, with the
new shapes and the duplicate cuts in place, is **69% average, 65% lowest**:
higher than where it started.

A second belief fell with it: the 90-day study was too short to judge the new
spacing. At 90 days some learners had only 6 of 9 ideas going, which read as
damage; at 120 days every learner reaches 9 of 9. The build now runs 120 days.

---

## 2b. Repetition — the pack itself

Seven detectors over the whole pack. **620 clusters touching 807 items before;
377 touching 574 after.**

| detector | before | after | what was done |
|---|---|---|---|
| same place, same measure | 206 / 457 | 137 / 303 | pairs capped at 4 appearances a place |
| one commute pair, both ways, same answer | 53 / 106 | **0** | the out-item is dropped when the in-item says the same thing |
| same answer inside one big idea | 74 / 591 | 44 / 344 | occupation capped at 25 a answer; natural-decrease balanced |
| a class item duplicating place items | 12 / 62 | 17 / 69 | left (see below) |
| stems differing only by a place name | 101 / 567 | 63 / 327 | fell out of the other cuts |
| an answer written out in another card | 147 / 316 | 95 / 208 | fell out of the other cuts |
| identical stem, identical answer | 27 / 94, up to 8 deep | 21 / 44, at most 3 | history pairs capped; near-in-time pairs only |

Two of these were answer-balance problems as much as duplication, and those are
the ones worth naming:

- **The commonest work.** 111 of the 123 occupation items had one of two
  answers — sales and service, or trades and transport. Saying "sales and
  service" scored nine in ten of them without knowing anything about the place.
  No answer may now carry more than a fifth of the form, and the places kept
  are the ones where the answer is *not* one of those two, first.
- **Natural decrease.** 28 "yes" against 13 "no": answering yes took more than
  two thirds. The majority answer is capped at 18.

**Left alone, deliberately.** Detectors 3, 4 and 5 are mostly what a *generated*
bank looks like: 577 places through one template will share a stem shape, and
one item's card will often state a fact another item asks for. The scheduler
already keeps same-wording and same-place items out of one sitting, and the
card that gives away a later answer is, under spaced repetition, a teaching aid
rather than a leak. Cutting them would cost coverage for no measurable gain.

---

## 3. Question shapes

**What was measured.** The pool counted by the **task** — what the reader has to
do with their head — not by the data structure, and then *where each task sits
in the introduction order*, by driving seven seeded learners through the real
scheduler.

| task | before | after |
|---|---|---|
| place-to-fact (recall) | **504 — 50.2%** | 329 — 38.7% |
| identify-from-evidence | 191 — 19.0% | 190 — 22.3% |
| fact-to-place | 87 — 8.7% | 87 — 10.2% |
| true-or-false | 41 — 4.1% | 73 — 8.6% |
| compare-two-named | 90 — 9.0% | 69 — 8.1% |
| **put in order (new)** | — | 36 — 4.2% |
| judge-a-method | 32 — 3.2% | 32 — 3.8% |
| order-in-time | 38 — 3.8% | 14 — 1.6% |
| class-rule | 13 — 1.3% | 13 — 1.5% |
| read-a-number | 8 — 0.8% | 8 — 0.9% |

**The introduction order was the real finding, and it was worse than the mix.**
Before: three whole tasks were met by **0 of 7** learners in a fortnight. The
fingerprint — the shape this tool is built around — first appeared at sitting
**77**. "Which has more jobs" *never* appeared in 40 sittings, and "what the
data cannot tell you" at sitting 100.

Two bugs and one design gap caused it. The level penalty in `pickNew` was −3 a
level, so a level-3 item could never outrank a level-2 one; ties broke on the
item id, so all 154 commute-out items came before the first commute-in one; and
nothing rotated the *kind* of question.

**What changed.** `pickNew` now round-robins by form, taking the kind the
reader has met least and penalising a kind already used in this sitting. The
"what comes next" pool reaches two ideas ahead rather than one. And one slot a
sitting — riding *on top of* the sitting's new questions, not in place of one —
goes to a kind of question the reader has **never** been set, ordered biggest
kind first. The sitting is one question longer, and only until every kind has
been met once.

| task | first sitting, before | after |
|---|---|---|
| place-to-fact | 1 | 1 |
| compare-two-named | 1 | 1 |
| class-rule | 1 | 1 |
| fact-to-place | 2 | 2 |
| **identify-from-evidence** | **77** | **2** |
| put in order | — | 3 |
| judge-a-method | 2 | 3 |
| read-a-number | 11 | 5 |
| order-in-time | never in 14 | 10 |
| true-or-false | never in 14 | 1 |

**Every task is now met inside the first fortnight, by every simulated
learner.** Three orderings of the taster pool were tried and measured before
this one; by idea number left "which came first" until sitting 30, and by level
was worse. The comments in `quiz-sched.js` record which and why.

**Two new shapes, both generated from already-verified material.**

- **Put three places in order** (36 items, `A/order-three`). The strictest gates
  in the bank, because two comparisons must hold at once: separation on both
  adjacent pairs *and* on both measures, every place above the floor, no two
  names confusable. The three options are the same three names in different
  orders, so the longest option is never the answer. Sits at level 2 of idea 2,
  and is reached at sitting 3.
- **Is this place's share bigger than Ontario's?** (42 items, `B/share-vs-on`).
  A location quotient asked without the words, balanced sector by sector so the
  name of the sector carries no information. Level 2 of idea 1; reached at
  sitting 1.

A third shape was **built and thrown away before it shipped**, and it is worth
recording why. It asked whether the sector a place is *known for* is the one
that employs most people there — the myth this whole tool exists to puncture.
The answer turned out to be in the sector name: naming farming or mining meant
"false" in 24 items out of 24, naming health or manufacturing meant "true" in 28
of 29. A reader who knew nothing about Ontario but knew that few people farm
could take most of them. The shape that replaced it tests the same idea with the
cue removed.

A fourth (provenance — which source a figure comes from) was **costed and
dropped**: the options would have to be built from source titles that contain
the answer (the year is in the title), or from hand-written short labels, which
would break the rule that no sentence in the app states a fact a script did not
generate. Ten items is not worth that.

---

## 4. Guessability

**What was measured.** Eleven cues, each returning the option it points at, and
then — separately — how often that option happens to be the key. A cue is only a
problem if it *predicts*.

| | before | after |
|---|---|---|
| items a know-nothing wins with certainty | **44** | **0** |
| R1 one option ≥3× the length of another | 0 | 0 |
| R2 the stem quotes an option | **121** | **0** |
| R2b a lone distinctive stem word (watched) | 44 | 2 |
| R3 two options not mutually exclusive | **36** | **0** |
| R4 position bias | 0 | 0 |
| R5 any cue predicting the key | 0 | 0 |

The five real cues fixed: the population fact moved out of the `bigger` stem
onto the card; containment added to the name gate (Lincoln / West Lincoln,
Brant / Brantford); "specialised" never offered beside "strongly specialised",
because the second entails the first; short labels for timeline options so a
five-character option does not sit beside a fifty-character one; and the new
true/false stem asked as a question, because "True or false:" put the word
*false* in the stem and in exactly one option.

**What I expected to find and did not.** Longer answer (lift 0.98), lone hedge
(0.94) and lone negation (0.70) pay **nothing** in this bank — at or below
chance. Failing the build on them would have deleted honest items to fix
nothing. They are watched, not gated. R1 fails only at 3×, which is a formatting
fault anyway, and never for a fixed vocabulary of place or industry names.

---

## 5. Phone UX, measured

375 × 812, both themes, every screen. The probe is `ux_probe.js` — paste it into
the console and it returns the measurements for whatever screen is open.

| # | finding | before | after |
|---|---|---|---|
| F1 | quiz parts that grow with the reader's text size | **0 of 15** | 15 of 15 |
| F2 | answer screens with Next below the fold | 5 of 8 | **1 of 8** |
| F3 | taps to correct a misread | 2 taps + a scroll | 1 tap, on the answer screen |
| F4 | contrast of the A/B/C letter on a dimmed option | 3.05:1 light, 4.32:1 dark | ≥4.5:1 both |
| F5/F6 | characters a line, options / stems | 14.7 / 27.6 | ~39 / ~40 |
| F7 | line-height on options | 1.35 | 1.5 |
| F8 | clipped bar labels | 3 of 5 | 0 |

**F1 is the one that mattered most, and it is the second thing I had wrong.**
The app had 201 `font-size` declarations and every one was in pixels. Moving the
browser's root size from 16 to 24 px changed *nothing*: the page height stayed at
exactly 1,095 px at all three settings. The reader's own text size — the single
accessibility setting a dyslexic reader is most likely to have changed — was
being ignored by the entire app, while the quiz *looked* like it obeyed it
because the stem had its own size. All 201 are now rem.

**F2's recommended fix was overruled.** The design review proposed
`position: sticky` for the Next button. You have already told me the next button
seemed to float over things, so the card was shortened instead: the misread link
came out of the fold, the answered chip and speaker are dropped once answered,
bar charts are capped at three rows, and the two new shapes carry no chart
because their cards state every figure in words. Five of eight became one of
eight — the sector-profile answer, 1,060 px against an 812 px screen, Next 61 px
below the fold. One short scroll on one card; shortening it further would mean
dropping the chart that is the teaching.

Every back button on every screen was checked: none dead-ends.

---

## 6. Load weight

| | before | after |
|---|---|---|
| eager, gzipped, before the first question | 636 KB | 645 KB |
| fetched automatically after first paint | 286 KB (`boundaries_csd.json`) | **0** |
| **first visit, downloaded without being asked** | **922 KB** | **645 KB** |
| held back until a screen needs it | 409 KB | 695 KB |

The whole saving is one line: the map boundary file was being pre-fetched at
boot for a screen most sittings never open. Nothing else was worth touching, and
the audit says so with numbers: the "wasted bytes" in the payloads (numbers
stored as strings, nulls written out, fields no module reads) come to **2.5 KB
gzipped across all fourteen — 0.4% of the load.** Raw savings look large and
vanish under gzip. No payload is shipped unread.

---

## 7. Coverage

Tabulated by big idea and level, strand, form, area, economic region, size
class, census division, industry, glossary term, method row, era and occupation.
`coverage.js` prints all of it and then names the holes.

Filled in this pass:

- **Every industry is now asked about.** Management of companies and other
  services were never the subject of a question, because the Ontario-wide pair
  comparison only ever looked at the eight largest sectors. It now looks at all
  twenty, three pairs an industry, two wins an industry: 6 items became 26.
- **The basics went from 4% to 7% of the bank** (38 to 60 level-1 items), which
  matters because a learner meets every idea through its basics first.

Named and left, with the fill costed in the report:

1. **Time barely features** — 6% of questions are about change and **2016 is
   never named**, though `res_series.json` carries it. The fill is a
   "which way did it go" template on that file.
2. **Geography is lopsided** — Central Ontario 3.9 questions a municipality
   against Northern Ontario 0.8. Not bias: the separation gate refuses small
   northern places paired against cities. The fill is to let the pair
   comparison reach outside its census division so northern towns pair with
   each other.
3. **104 of 414 municipalities are never named.** 20 have no published figures
   and 56 have under 500 jobs — both fair. 21 have 500+ jobs and a usable name,
   and 7 are lost only because their name is too long to be an option. No place
   with more than 1,935 jobs is missing, so the bank covers Ontario's working
   population even where it does not cover its municipal list.
4. **5 of 31 glossary terms are never tested** — reference week, reference
   economy, random rounding, confidence interval, false discovery rate. The
   glossary teaches them; nothing asks.
5. **Occupation is thin** — 62 items, all one form, and four of the ten groups
   never named. Nothing asks how occupation and industry differ, and no big idea
   owns it.

---

## 8. Standing rules

| rule | before | after |
|---|---|---|
| no timers or countdowns | **pass** — 0 timers, 0 countdowns, 0 time pressure anywhere | pass |
| read-aloud for anything text-heavy, including the app's own prose | **breach** — 8 surfaces spoke, 6 did not; closed folds were skipped; the glossary, timeline and big-idea rows were unreadable | **pass** — the reader now speaks `summary`, `dt`, `dd` and the app's own prose spans, opens the fold it is reading, and every question, option and card has its own speaker |
| a quiet mode | **breach** — a sound toggle and a quiz-read setting existed; nothing turned off sound *and* withdrew the read-aloud offer | **pass** — one switch in the menu, remembered, silences sound, withdraws every read-aloud control, and takes them out of the layout rather than leaving dead buttons |
| licence credit generated, not typed | **breach** — 0 of 19 sources carried a licence field and the word "licence" appeared nowhere on screen | **pass** — 19 of 19 carry a generated credit including the endorsement clause the Statistics Canada licence asks of an adapted product, and the Sources screen prints the generated field |

The rules audit is a build gate: `rules.js` exits non-zero on a breach, and
tests the quiet mode part by part, so half a quiet mode still fails.

One thing it flags that is **not** a gate and I have left: the boot message
rotates every 900 ms. It is not a timer and nothing depends on it, but a moving
line of text is the wrong way to open an app for a dyslexic reader. Say so and
it goes.

---

## Three things I believed that turned out to be false

1. **That wider spacing would cost retention.** It cost nothing. Held-at-next-
   review was flat across gaps of 1 to 4 days while "seen five or more times"
   fell from 34 to 2. The repetition was buying no memory at all — and the
   final figure is higher than where we started, at 69%.
2. **That the app respected the reader's text size because the question did.**
   It respected nothing. 201 font sizes in pixels; the page was byte-identical
   in height at 16, 20 and 24 px root. The one accessibility setting most
   likely to be turned on was inert.
3. **That the question bank's variety was a mix problem.** It was an *order*
   problem. The mix was lopsided (one task, half the pool) but fixable by
   adding shapes; the order was broken outright — three tasks unreachable in a
   fortnight and the fingerprint, the shape the whole tool is built around,
   first appearing at sitting 77. Counting the bank would never have shown it.
   Only driving learners through the real scheduler did.
