# Audit 2 — Repetition

**24 September 2026.** Two separate problems, measured separately.

New scripts, both run from the project root:

```
node pipeline/audits/spacing.js        (--json, --seed N)
node pipeline/audits/duplicates.js     (--json, --all, --rule N)
```

Both drive the real app modules through `pipeline/audits/harness.js`. Nothing
here is a model of the scheduler. Both runs are deterministic.

*Bank size at the time of this run: **1,000 questions**. Other agents are
editing `quiz-bank.js` in the same repo, so re-run the scripts if the count has
moved — every cluster count below was identical at 1,004 and at 1,000 items, but
do not assume that holds for a larger change.*

---

## The short version

**The scheduler is the bigger problem, and one parameter causes most of it.**

In a fortnight of keen play — 14 days, two sittings a day, 12 questions a
sitting — the reader sees **72 different questions out of 1,000**. Forty-one
of those 72 are asked **five or more times**. One ask in three (**105 of 320**)
comes **the day after** the same question was last asked.

The cause is not the four-hour cool-down. It is that the shortest interval the
scheduler can hold is **one day**, so "tomorrow" is the default answer to
almost everything.

**The pack is a smaller problem but a real one.** Of 1,000 questions, **755
sit in at least one cluster of questions that test the same thing**. The two
worst single clusters are 56 and 55 questions that differ only by a place name
and share the same right answer.

---

## Part A — the scheduler

### What the audit does

`pipeline/audits/spacing.js` drives `app/js/quiz-sched.js` — `S.plan`,
`S.answer`, `S.endSession`, the app's own functions over the app's own
1,000-question bank — through a fortnight of realistic play.

- 14 days, no days missed. This is the worst case for repetition, on purpose.
- Two sittings a day: about 08:00 and about 14:00. Six hours apart, so the
  scheduler's four-hour cool-down has already expired by the second sitting.
- 12 questions a sitting. Seeded, so the run repeats exactly.

The learner model is written out in full at the top of the script. In short:
each question has a hidden strength in days; recall follows the standard
exponential forgetting curve; reading the answer card more than doubles the
strength after a success and leaves a small growing residue after a miss; an
unrecalled question is still guessed right one time in two or three.

It comes out at **58% right overall — 49% on a first sighting, 61% on a
question already seen.** That is inside the 55–70% band asked for, and better
on the familiar, which is the behaviour that matters. The figures print at the
top of every run so the model can be checked rather than trusted.

Across four seeds the headline numbers move very little: 72–77 distinct,
38–44 seen five or more times, 31–33% of asks on consecutive days.

### The measured fault (seed 20260924)

| Measure | Value |
|---|---|
| Asks in the fortnight | 320 |
| **Distinct questions seen** | **72** (7% of the bank) |
| Seen 3 or more times | 59 |
| **Seen 5 or more times** | **41** |
| Seen 8 or more times | 1 |
| Most-repeated question | 8 times |
| Mean sightings per distinct question | 4.44 |
| **Asks the day after the last sighting** | **105 of 320 — 33%** |

Gap since the last sighting, over the 248 repeat asks:

| Gap | Asks | Share of repeats |
|---|---|---|
| Same day | 0 | 0% |
| **1 day** | **105** | **42%** |
| 2 days | 76 | 31% |
| 3–6 days | 61 | 25% |
| 7 or more days | 6 | 2% |

Three further counts that point at the cause:

- **Got it right first time, then asked again the very next day: 16.**
- **Missed it, then asked again the very next day: 58.**
- Questions missed three times or more: 21.

New questions per sitting: mean **2.57**, lowest 1, highest 8.

| Reviews waiting when the sitting was planned | Sittings | Mean new | Lowest |
|---|---|---|---|
| 0–3 | 4 | 8.0 | 8 |
| 4–8 | 1 | 7.0 | 7 |
| 9–14 | 10 | 2.0 | 2 |
| 15 or more | 13 | 1.0 | 1 |

No sitting ever got zero new questions. But **13 of 28 sittings got exactly
one** while more than eight reviews were waiting.

### How this compares to the app that went through this before

| | Comparison app | Hinterland |
|---|---|---|
| Distinct questions | 66 | 72 |
| Seen 5 or more times | 17 | **41** |
| Asks on consecutive days | 115 of 266 (43%) | 105 of 320 (33%) |

Hinterland's consecutive-day share is a little better. Its **five-or-more
count is two and a half times worse**. The reader covers barely more ground
and grinds far harder over it.

### Why the same-day column is empty

Nothing is ever asked twice in one day, even though the two sittings are six
hours apart and the cool-down is four hours. That is not the cool-down working.
It is the intervals: `firstInterval` is 1 day, and a miss sets
`ivl = max(1, ivl * 0.4)`, so no interval can ever be shorter than a day, and
`S.isDue` needs a full interval to elapse.

**The `coolHours: 4` rule is dead code in practice.** It cannot bite, because
nothing is due that soon anyway. Anyone reading the scheduler would assume the
cool-down is what keeps sittings fresh. It is not doing anything.

### Which of the four candidate fixes Hinterland needs

The comparison app applied four. Each was tested here on its own and in
combination, against both studies — the fortnight above and the existing
90-day retention study. Fortnight figures are seed 20260924; 90-day figures are
means over the seven seeded learners.

| Change | Distinct | Seen 5+ | Consec. | 90-day: met | learned | recall at review | learned held |
|---|---|---|---|---|---|---|---|
| **baseline** | 72 | 41 | 105 | 86 | 65 | 38% | 69% |
| two-day minimum gap | 77 | 34 | 0 | 86 | 60 | 31% | 62% |
| three days when right first time | 77 | 37 | **101** | 83 | 60 | 32% | 65% |
| back-off for repeated misses | 89 | 26 | 58 | 89 | 55 | 25% | 59% |
| floor under new items | 82 | 35 | 56 | **140** | 55 | 28% | 58% |
| three-day minimum gap | 97 | 11 | 0 | 93 | 56 | 26% | 65% |

**1. A minimum gap between sightings — YES, and at three days, not two.**

The two-day gap takes consecutive-day asks from 105 to **zero**, because it is
the only change that addresses the cause directly. But it leaves 34 questions
still seen five or more times, because at a two-day floor a question can still
appear seven times in a fortnight. At a **three-day** floor the ceiling is five
sightings, and the count falls from 41 to **11**, with distinct coverage rising
from 72 to 97.

Three days is also the app's own existing notion of "stop hammering this" —
`leechFloor` is already 3 days for anything missed three times. The change makes
that the floor for everything, not only for leeches.

**2. Three days when something was right first time — NO.**

Measured: only **16 of 320 asks** are "right first time, then asked again the
very next day". Applying the change removes **four** consecutive-day asks
(105 → 101) and costs retention (learned-held 69% → 65%). Hinterland's
repetition is made of **misses** (58 asks), not clean first passes.

And a three-day minimum gap subsumes it entirely: all 16 are gone anyway. Added
on top of the three-day gap it changes seen-5+ from 5 to 6 — noise. **Skip it.**

**3. A back-off for repeated misses — YES, but for the backlog, not the
repetition.**

Measured: **58 of 320 asks** were "missed, then asked again the very next day",
and 21 questions were missed three times or more. The three-day gap already
stops every one of those coming back tomorrow, so the back-off earns nothing on
the repetition count.

It earns its place on the **backlog**. Without it, the three-day gap pushes the
review backlog to a peak of **0.672 of questions met** — and `validate.py`'s
existing bound is `dueShareLate <= 0.67`. Adding the back-off brings the peak
to **0.645**, back inside the bound. That is the whole argument for it.

**4. A floor under how many new questions a round may introduce — NO.**

The symptom is real: **13 of 28 sittings** introduced exactly one new question
while more than eight reviews waited. But Hinterland is not jamming. No sitting
in the fortnight got **zero** new questions, the mean is 2.57, and
`quiz_simulate.js` reports `starvedSessions: 0` on all seven seeds.

And the cure is worse than the symptom. A floor of two takes questions met over
90 days from 86 to **140–150** and the backlog share from 0.51 to **0.75–0.78**,
well past the 0.67 bound, with "learned" falling from 65 to 47–55. It floods the
reader. **Do not apply it.**

There is, however, a **real bug next to it**, which is worth fixing on its own:
the pace rule counts only the reviews it is *allowed* to serve. Once a minimum
gap exists, a blocked review disappears from `due.length`, the scheduler reads
"no reviews waiting", and pours in eight new questions. Counting every review
that has fallen due — served or blocked — is a three-line change and it improves
both studies: with it, the three-day gap's backlog peak drops from 0.700 to
0.672 and learned-held rises from 65% to 68%.

### The patch

Do not apply this from the report — apply it to `app/js/quiz-sched.js` and
re-run both scripts. Three edits and two new parameters.

**Edit 1 — the parameters.** Find:

```js
    firstInterval: 1,
```

Replace with:

```js
    firstInterval: 1,
    minGapDays: 3,           /* never the same question inside three days */
    lapseBackoff: [2, 3],    /* days after a first miss, then a second */
```

**Edit 2 — a minimum gap, not a four-hour cool-down.** In `S.plan`, find:

```js
    var cool = now - P.coolHours * 3600000;
```

Replace with:

```js
    var cool = now - Math.max(P.coolHours * 3600000, P.minGapDays * DAY);
```

**Edit 3 — the pace counts every review that has fallen due.** In `S.plan`,
find:

```js
    var ids = Object.keys(state.items);
    var due = ids.filter(function (id) {
      return bank.byId[id] && !cooling(id) && S.isDue(state.items[id], now);
    }).sort
```

Replace with:

```js
    var ids = Object.keys(state.items);
    var waiting = ids.filter(function (id) {
      return bank.byId[id] && S.isDue(state.items[id], now);
    }).length;
    var due = ids.filter(function (id) {
      return bank.byId[id] && !cooling(id) && S.isDue(state.items[id], now);
    }).sort
```

…and, a little further down in the same function, find:

```js
      : due.length <= 3 ? (early ? 8 : 6)
      : due.length <= 8 ? 4
      : due.length <= 14 ? 2 : 1;
```

Replace with:

```js
      : waiting <= 3 ? (early ? 8 : 6)
      : waiting <= 8 ? 4
      : waiting <= 14 ? 2 : 1;
```

**Edit 4 — a miss backs off instead of returning tomorrow.** In `S.answer`,
find:

```js
      r.ivl = Math.max(r.lapses >= S.P.leechLapses ? S.P.leechFloor : 1,
                       r.ivl * S.P.lapseFactor);
```

Replace with:

```js
      r.ivl = Math.max(r.lapses >= S.P.leechLapses ? S.P.leechFloor
                       : S.P.lapseBackoff[r.lapses - 1],
                       r.ivl * S.P.lapseFactor);
```

While you are in the file, the comment block at the top says "A SOFT COOL-DOWN
across sessions: nothing asked in the last four hours is asked again". That
should now read three days, and it should say what the measurement showed: the
four-hour version could never bite, because no interval was ever shorter than a
day.

### What the patch measures (already checked, before you apply it)

Applied to a working copy and reverted, so `app/` was never left changed:

| | Before | After |
|---|---|---|
| Distinct questions in a fortnight | 72 | **95** |
| Seen 5 or more times | 41 | **2** |
| Asks on consecutive days | 105 of 320 (33%) | **0 of 306 (0%)** |
| Gap distribution | 42% at 1 day | **100% at 3–6 days** |
| New questions per sitting | 2.57 | 3.39 |
| `quiz_selftest.js` problems | 0 | 0 |

---

## Proving the wider spacing did not cost retention

The existing 90-day study is the arbiter:

```
node pipeline/quiz_simulate.js --table
```

Seven seeded learners, one sitting a day, 90 days, a 14-day break in the
middle. **These are the numbers BEFORE any change.** Re-run after the patch
and compare against this table.

| Seed | Sessions | Met | Learned | Recall at review | Learned held at next review | Peak due | Final due | Backlog share (late) | Ideas with something learned |
|---|---|---|---|---|---|---|---|---|---|
| 11 | 65 | 85 | 64 | 37% | 68% of 224 | 54 | 50 | 0.540 | 9 |
| 23 | 62 | 82 | 60 | 36% | 57% of 228 | 55 | 45 | 0.583 | 9 |
| 47 | 68 | 89 | 72 | 43% | 70% of 267 | 45 | 28 | 0.371 | 9 |
| 59 | 60 | 82 | 62 | 37% | 69% of 179 | 49 | 48 | 0.564 | 9 |
| 71 | 63 | 85 | 68 | 40% | 73% of 222 | 47 | 34 | 0.488 | 9 |
| 83 | 67 | 89 | 61 | 34% | 74% of 181 | 51 | 49 | 0.556 | 9 |
| 97 | 68 | 90 | 69 | 41% | 71% of 262 | 50 | 39 | 0.481 | 9 |
| **mean** | | **86.0** | **65.1** | **38.3%** | **68.9%** | | **41.9** | **0.512** | **9** |

Other baseline facts from the same run: longest interval 60 days on six of the
seven seeds (40.7 on seed 23); `starvedSessions` 0 on all seven; ideas opened 9 of 9 on all
seven; zero sessions with a repeated question or a repeated place; the learned
count never falls on any seed.

`validate.py` section 10 turns four of these into pass/fail gates:

- `starvedSessions <= 3` on every seed
- `dueShareLate <= 0.67` on every seed
- mean `learnedHeldAtNextReview >= 0.60`, and no seed below 0.50
- `ideasOpened == 9` and `ideasLearned >= 8` on every seed

### What the patch does to those numbers

Measured on a working copy, seven seeds:

| | Before | After | Gate |
|---|---|---|---|
| Questions met | 86.0 | **91.6** | — |
| Learned | 65.1 | **57.3** | — |
| Recall at review | 38.3% | **26.6%** | — |
| Learned held at next review (mean) | 68.9% | **62.4%** | ≥ 60% — **passes** |
| Learned held (lowest seed) | 57.5% | **56.4%** | ≥ 50% — **passes** |
| Backlog share, peak seed | 0.583 | **0.645** | ≤ 0.67 — **passes** |
| Sessions with no new question | 0 | **0** | ≤ 3 — **passes** |
| Ideas with something learned, lowest seed | 9 | **6** | ≥ 8 — **FAILS** |

**Read this honestly. Retention holds; breadth-of-ideas does not.**

The retention gate is the one that matters and it passes with room: what the
scheduler calls "learned" is still recalled at its next review 62% of the time,
against 69% before, and no learner falls below 56%. Recall at the moment a
review falls due drops from 38% to 27%, which is what wider spacing means by
definition — a question reviewed after four days is less well remembered than
one reviewed after one. That is the trade being bought, not a fault.

The gate that breaks is `ideasLearned >= 8`. Before the patch, all seven
learners finish 90 days with something held in all nine big ideas. After it,
the lowest learner has six. The reason is arithmetic, not pedagogy: "held"
requires a right answer **seven days or more** after first meeting a question,
and a three-day floor means each question gets fewer chances inside 90 days.
The two last-opening ideas are the ones that miss out.

**Someone has to decide this, and it is not a decision this audit can make.**
Three options, in the order I would try them:

1. **Lower the bound to `ideasLearned >= 6`** and say why in the comment. The
   check exists to catch a hard idea blocking everything after it; nine ideas
   still *open* on every seed, so nothing is blocked. This is the cheapest
   honest answer.
2. **Lengthen the study to 120 days.** The 90-day window was chosen when
   intervals were shorter. If the only problem is that a three-day floor needs
   more calendar to show the same result, give it more calendar.
3. **Apply a two-day floor instead of three.** It keeps `ideasLearned >= 7`
   (still failing the gate, but less), keeps learned-held at 65%, and keeps the
   backlog at 0.623 — but it leaves **26–34 questions still seen five or more
   times**, which is most of the problem unsolved. I do not recommend it.

---

## Part B — the pack

`pipeline/audits/duplicates.js` lays all 1,000 questions side by side and
clusters them by **what they rest on**, not by their text. Six detectors, plus
one tight sub-case.

| Detector | Clusters | Items |
|---|---|---|
| 1. Same place, same measure | 208 | 461 |
| 1b. One commute pair, asked both ways, same answer | 55 | 110 |
| 2. Same correct answer inside one big idea (3+) | 73 | 552 |
| 3. A class-level item duplicating place items | 12 | 62 |
| 4. Stems differing only by a place name, same answer | 91 | 530 |
| 5. An answer written out in another item's card | 141 | 292 |
| 6. Identical stem, identical answer | 8 | 38 |
| **Total clusters** | **588** | **755 distinct items touched** |

The detectors overlap heavily and deliberately: 505 of the items in detector 2
are also in detector 4, and 257 of detector 1's are. Each overlap is a different
reason the same pair is the same question, and each needs a different fix, so
they are reported separately rather than merged.

### What each detector found

**1. Same place, same measure (208 clusters).** Two questions about one place
that both rest on the same underlying vector. The clearest example is Waterloo:
a fingerprint item, three "most concentrated in…" items and a "which big city
leads in education" item, all five computed from one industry-mix vector.
Answering the fingerprint tells you a lot about the other four.

*Keep the fingerprint.* It carries a whole profile with no name on it; the
others carry a label.

**1b. One commute pair, asked both ways (55 clusters).** Champlain's largest
outward flow is Hawkesbury and its largest inward flow is also Hawkesbury. Two
questions, one fact, asked from both ends — **55 places are affected.** The
script keeps the commute-IN item in all 55 (its card sentence carries the
count and the share).

**2. Same correct answer inside one big idea (73 clusters, 552 items).**
The biggest single clusters are **56 questions in the idea "key" that all
answer "Sales and service"** and **55 that all answer "Trades and transport"**.

**3. A class-level item duplicating place items (12 clusters).** The clearest:
`G2:level:62` — "Which is about the same share of jobs everywhere, big or
small? → Health & social" — sits in the idea "every" alongside **12 place items
in the same idea** whose answer is also "Health & social". The class item states
the rule; the twelve place items are the same rule twelve times.

**4. Stems differing only by a place name, same answer (91 clusters, 530
items).** The sharpest detector and the largest finding. Strip the place name
and two stems read identically; the answer is identical too. Top clusters: 55,
54, 33, 33, 28 items.

**5. An answer written out in another item's card (141 clusters).** The real
find here is systematic. A fingerprint card reads "That is Oshawa. Its jobs are
led by health & social (…)" — and `B2:3518013` asks "The largest group of jobs
in Oshawa?" with the answer "Health & social". **The card for one question is
the answer key for another about the same place.**

**6. Identical stem, identical answer (8 clusters, 38 items).** Every
"Which came first?" item and two "Which employs more people in Ontario?" items.

### Which clusters are the detector's own noise, and why

This matters as much as the counts. Each detector's blind spot is printed at
the end of every run; in short:

**Detector 2 is the noisiest, on purpose.** Two towns whose most common work is
"sales and service" are **not** a duplicate — that repetition *is* the pattern
the idea teaches, and showing a pattern in fifty places is the point of level 2.
What the 552 measures is *pressure*: how much of an idea a reader can pass by
learning one word. Treat it as a cap to impose in the bank, not as items to
delete. **Do not cut anything on the strength of detector 2 alone.**

**Detector 6 is half noise, and the noisy half is the interesting half.** All
eight clusters have **different distractors** (`sameOptions: false` on every
one), so strictly none is a duplicate: knowing the answer to "Which came first?"
was NAFTA once does not answer it when NAFTA faces a different event. What the
detector actually found is a **wording** fault — 38 items that read word for
word the same, because the stem names neither of the two things being compared.
The scheduler already has a `usedStem` rule fighting this, which is evidence
the fault is real. The cure belongs in the stem, not in the scheduler.

**Detector 1 has one systematic false positive.** Commute-out and commute-in
for one place rest on the same matrix but usually name *different* towns, and
then they are two facts, not one. Detector 1b is the part that is genuinely one
fact. A smaller false positive: a fingerprint item and a "most concentrated"
item share a place and a vector while testing opposite ends of it — which place
has this profile, versus which place leads in this industry.

**Detector 3 has judgement noise.** Sometimes the class claim and the place
claim are two steps of one argument: the class item states the rule, the place
item is the worked instance, and meeting both in order *is* the teaching. The
duplicate is only real when the place item adds no new figure — which its card
sentence shows.

**Detector 4 is close to noise-free by construction**: identical wording,
identical answer. Its one residual risk is place names that are ordinary words
("The Nation", "Perth") being stripped out of a stem where they were not a
place, collapsing two stems that were not really the same.

**Detector 5's noise was large enough to filter rather than report.** Two
passes were removed. Without the same-place restriction it found 657
"clusters", nearly all a card that happened to name a town which was some
far-away question's right answer — two items the same reader would never meet
in the same week. Then, because a card about a place always names that place,
any item whose *answer* is its own place name matched every other card about
it; that was three in four of what remained, and it is the bank's house style,
not a giveaway. 657 → 143 → **141** clusters. What survives is the real case.

### What to do, per detector

The script prints a **WHAT TO DO** line for each, because cutting is the right
answer for some and the wrong answer for others.

| Detector | Action |
|---|---|
| 1 | **Cut** to the KEEP. |
| 1b | **Cut** the commute-OUT twin in all 55 places. |
| 2 | **Cap**, do not cut: about six items per (idea, answer) pair, spread across regions and size classes. |
| 3 | **Keep the class item** — it is the lesson — and cap the place items that only restate it. |
| 4 | **Cut hardest.** Cap each template-and-answer pair at three or four items. |
| 5 | **Rewrite** the card so it teaches around the other item's answer instead of stating it. |
| 6 | **Rewrite the stem.** Name the two things being compared. |

Every cluster in every detector carries a KEEP and a reason. The rule is
written down in the script and applied identically everywhere, in this order:
keep the surprising one; then the richer form (a profile beats a label); then
the one that opens earliest; then the one whose card says most; then the lower
id, so the answer never moves between runs.

### One note on scale

If detectors 1b, 4 and 6 were acted on at the caps suggested above, the bank
would fall from 1,000 to somewhere near 600–700 questions. Given that a keen
fortnight currently shows the reader **72** of them, and even after the
scheduler patch only **95**, a smaller and sharper bank costs nothing in
coverage and buys a great deal in feel.

---

## Files

- `pipeline/audits/spacing.js` — part A
- `pipeline/audits/duplicates.js` — part B
- `pipeline/audits/harness.js` — the shared loader (not written by this audit)
- `app/js/quiz-sched.js` — **not edited**; the patch above is for someone else
  to apply
