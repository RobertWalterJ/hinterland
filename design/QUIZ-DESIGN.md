# Hinterland Quiz — design, v2

*Revised after four independent reviews (rigour, learning science, dyslexia and
accessibility, engagement). Status: designed, not built. §14 maps every
must-fix finding to the change that answers it. v1 is summarised in §15 so the
reasons for each change stay visible.*

## 1. What it is for

Hinterland answers questions about Ontario's economy when you already know what
to ask. The quiz is for the opposite situation. It puts the questions in front
of you, in an order that builds up a working picture of the province one place
and one relationship at a time.

**The unit of learning is an insight about a place, not a number** (the
Commonplace thesis). The screen after the answer is the product.

**What changed most after review:** the single most important finding was that
"what is the largest sector in X?" — the obvious form of *what do people do
here* — has a defensible single answer in only **96 of 368** municipalities.
In 79 places the answer depends on whether home-workers are counted. So the
quiz answers *what do people do here* the way the data can support it: with a
**profile** — the mix of the top few sectors — not a single winner.

## 2. Principles

Carried over from Halyard, Wordhoard, Commonplace and Landfall, and sharpened by
review:

1. **Accuracy by construction.** Nothing writes a fact. **This now covers the
   answer card, not just the question** — v1 broke it with a hand-written
   "steel town… hospital system" sentence that no generator produced. Only
   engine-generated sentences reach the screen.
2. **Nothing indistinguishable is ever the answer** — and **nothing a card
   states is indistinguishable either.** v1 separated the answer from the
   runner-up, then stated an unseparated rank on the card ("retail is second",
   on a 3% gap). Every comparison on screen passes the same test.
3. **An answer must not depend on a measurement choice.** New. If "total" and
   "usual place of work" disagree, the item is not asked.
4. **Nothing may hand you its own answer**, including by name — Guelph/Eramosa
   must never offer Guelph.
5. **Difficulty is not population.**
6. **Progress is per (item, facet).**
7. **No timer, anywhere.** And no hidden substitute for one. (§10.)

## 3. Strands, not a ladder

v1 had seven tiers in a single ladder. Review found the ladder broken in plain
arithmetic — tier 3 had 12 items and the unlock rule demanded 15 — and found
that the ordering was by kind of data, not by what depends on what. v2 has
**four strands**. Only one of them is a genuine dependency chain.

| strand | what it builds | question forms | defensible items (v2 gates) |
|---|---|---|---|
| **A. Size** | how big places are, and how they compare within a region | estimate on a bar · bigger of two · put four in order | **2,096** within-division pairs, plus one size estimate per place |
| **B. What people do** | the profile of work in a place, then what makes it distinctive | fingerprint · top-three · odd one out · most concentrated of four | **96** single-answer places; **33** regional concentration items; profiles for every place with a stable top three |
| **C. Connections** | where workers go, where they come from, which places are twins | largest share of commuters · whose economy resembles X | **151** commuting items; twins from the findings engine |
| **D. The long view** | demography | yes/no with a reason | **28** census-division items |

**Strand B is the only true chain:** a concept item on what a sector profile is,
then profiles, then concentration. **A, C and D run in parallel** — knowing
which city is bigger does not help you learn where its commuters go.

Within each strand, specificity grows **by geography** — region, then its anchor
city, then its members — which is how Landfall scaffolded, and which is what
"general to specific" should mean here.

### Cut from v1, and why

- **Change over time (shift-share).** Out of v1 entirely. Review showed 38 of 62
  candidate answers flip if the two COVID-hit sectors are removed — the
  question was measuring pandemic exposure, not economic structure — and that
  "did the mix help or hurt" asserts causation for an accounting identity. It
  can return later as a descriptive question once the 2021 reference-week
  problem has a better answer.
- **"Past its population peak."** Collapses from 61 to **3** once peaks at the
  series' first year (2001, where the real peak is unknown) and places under
  5,000 are excluded.
- **A single "Ontario at a glance" tier.** Its only example depended on measure
  and filter. Province-wide facts return as job-weighted concept items inside
  the strands.

### Unlocking

A strand's next stage opens when a **delayed** check holds: the items met in the
stage below are answered correctly at a review at least **seven days** after they
were learned, over at least **60% of that stage's items**, with guessing
corrected for the number of options. Nothing is locked behind time spent, and
**nothing ever relocks.** "Jump ahead" remains.

## 4. Question forms

v1 had two sentence shapes and would have felt like a spreadsheet with buttons.
v2 mixes forms inside every session, and several open on something to look at
rather than something to read — which is also what makes them easier for a
dyslexic reader.

- **Fingerprint.** A sector proportion bar with no name. Which of three places
  is it? The prompt is a picture; the profile is the answer, so it survives
  where a single largest-sector question does not.
- **Estimate on a bar.** "About what share of the people working in Hamilton in
  May 2021 were in health care?" Drag the bar. Scored by distance, so a close
  miss is visibly close — Landfall found miss-distance its most sensitive
  progress signal.
- **Top three.** "Which three sectors employ the most people in Barrie?" — only
  the boundary between third and fourth needs to be separated.
- **Odd one out.** "Three of these are more concentrated in manufacturing than
  Ontario. Which isn't?"
- **Put in order.** Four places by size, within a region. Accepted only if every
  adjacent pair passes the separation gate.
- **Most concentrated of four**, within one economic region.
- **Largest share of commuters.** Never "most", which is false for Mississauga's
  49.8%.
- **Whose economy is most like X?** From the structural-twin detector.
- **Yes / no with a reason** for strand D — buttons that restate the outcome:
  "Yes — more deaths than births", not "True".
- **Where is it?** Tap the map. The first question for any new place — you
  cannot learn about somewhere you cannot find. **Moved into v1 from "v2"**,
  because it is both the most engaging and the most dyslexia-friendly form:
  nothing to decode.

Every choice question has **three options, not four.** The fourth adds reading
load for little discrimination (Rodriguez 2005).

## 5. The rigour gates

**G1 — Separation, on real uncertainty.** The answer must beat each alternative
by **three standard deviations of the difference**, with the standard deviation
of a count taken as **1.92 × √count**, combined with rounding. That figure is
measured, not assumed: it is the median fit to the 4,997 Ontario municipality
cells in 98-10-0456 that carry **published 95% confidence intervals** — the
intervals the pipeline has been discarding. It is borrowed for the place-of-work
tables, which publish none, and the card says so. v1's flat 10% margin was
scaled the wrong way: it passed coin-flips among small places and rejected
clear answers among large ones.

**G1 applies to everything the screen states**, not only the answer.

**G2 — Reliability floor on every option.** No answer, distractor or card figure
at or below 50 workers.

**G3 — Base size.** Concentration items need 2,000 jobs in the place and 500 in
the sector; separation is tested on the log location quotient with sampling
error, so Muskoka Lakes cannot win on 170 cottage-country real-estate jobs.

**G4 — Universe, in words.** "People working in", "residents of", "commuters
with a usual workplace" — and a fixed chip above every stem saying which.

**G5 — Currency.** "May 2021", not "2021": it is a reference week, and a
pandemic one.

**G8 — Measure invariance.** New. An answer and its separation must hold on
both "total" and "usual place of work". This is what removes Clarence-Rockland,
where 1,560 of 1,865 public-administration workers were Ottawa public servants
working from home.

**G9 — Names.** No option may share a leading word with the stem place. No two
options may be within a small edit distance of each other or share their first
five letters (Whitby / Whitchurch-Stouffville, North Dundas / North Dumfries):
confusing them is a reading test, not economics. **Census-division facts are
never recorded against a municipality** and always name the division with its
type — "Essex (census division)" — because 19 municipalities share a name with
a division and several sit in a different one.

## 6. What drives selection

**Surprise first.** v1 allowed surprise but never looked for it. The data
carries a proxy for the wrong guess: a place's **most distinctive** sector is
what it is known for. Where that differs from its largest sector, the question
is likely to overturn a belief, and it is weighted up — with the distinctive
sector always offered as a distractor.

**A confidence tap.** Before the options, one optional tap: *sure / think so /
guessing*. No clock. A confident wrong answer is the one best remembered once
corrected (Butterfield & Metcalfe 2001), and the card can say so.

**Home places.** At first launch, pick a home region and the places you know.
They are introduced first, and cards compare to them: "Guelph has roughly a
third as many people working in it as Hamilton."

## 7. Scheduling, and the honest limit of measurement

v1 ran two schedulers against each other — Leitner deciding what was due, Elo
choosing what was near 70% — and used Elo to rate items, which cannot work with
one player: the item ratings would simply record his own learning.

**v2 has one scheduler.** Each item already seen carries a **forgetting model**
(half-life regression, in the family FSRS uses), which is built for a single
learner. Reviews are ordered by predicted chance of recall, due when it falls
to about 90%. New items are admitted by a frontier rule that keeps depth from
starving breadth — the problem Landfall hit — and **the scheduler is tested in a
seeded simulation before anything is built**, as Landfall's was.

The prior from v1 (strand, closeness of options, familiarity) survives only to
choose **which new item to introduce next**. It never claims to measure
anything.

**The quiz makes no claim to measure how much you know about Ontario.** It
tracks one thing it can observe honestly: whether an item **held at a review a
week or more later**. That is what "learned" means everywhere on screen.

**One real measure of understanding.** A held-out set of places is never used
for practice. Occasionally the quiz asks about one — "a census agglomeration
with a university: which sector is it most likely concentrated in?" Getting
those right is the only evidence of understanding, as opposed to memory, that a
single-player quiz can collect.

## 8. Sessions and routes

v1 drew twelve items by overdueness, which gave Guelph's size, then Kenora's
sector, then Mississauga's commuters: a bag of facts. v2 builds each session as
a **route**.

- **Opens** on the most surprising item waiting.
- **The middle** is four to six linked new items on one theme, with reviews
  around them in short blocks of about four by strand — not shuffled across
  strands, which adds switching cost and buys nothing when the categories are
  not confusable (Carvalho & Goldstone 2014).
- **Closes** on a card that ties the route into one claim, with one map.

Routes are generated, not hand-picked, from the findings engine's tags:
*the 401 west*, *hospital towns*, *bedroom and boardroom* (the jobs-ratio
extremes in one region), *where the workforce comes from*, *deaths outnumber
births*. Place membership comes from the generators.

**Daily**: a place of the day, five questions about one place, ending in its
dossier. No streak.

## 9. The answer card

v1's card had six parts after every question. For a dyslexic reader across a
twelve-item session, that is a reading marathon. v2 has **two layers**.

**Shown, and read aloud automatically:**

1. The verdict, in words: *"Right."* or *"Not this time — it's health care."*
   Never "Wrong". The cross is drawn in ink, not red — red is already this
   tool's colour for decline.
2. **One sentence**, twenty words or fewer, carrying one number: *"About one job
   in five here is in health care."*
3. The picture — the proportion bar, the desire lines, the population curve.
4. The source and date, one line.

**Behind "Tell me more":** why it matters (from the findings engine, trimmed),
what your chosen option actually is (only if that comparison is separated),
the exact figures, and **"Show me"** into the full panel.

Numbers on cards: rounded to two significant figures ("about 210,000"), whole
percentages, no location-quotient decimals, one kind of number per sentence,
losses in words ("lost about 1,200").

A **"that was a misread"** tap voids an answer, so a mis-decoded place name is
not scored as not knowing the economy.

## 10. Accessibility, and hidden time pressure

**No timer, anywhere.** Review found four ways v1 brought pressure back
without one, and v2 removes each:

- **No due, overdue or backlog count is ever shown.** Overdueness is capped;
  after a break, recently learned items are blended in rather than a run of the
  most forgotten.
- **No "three in a row".** Confusion drills clear on a correct answer in a
  *later* session.
- **Nothing ever goes down on screen.** "Places learned" only rises. An item
  slipping back is scheduling, not a loss.
- **"Stop here"** at every step. A partial session counts fully. There is no
  such thing as an unfinished session.

**Read-aloud**, through the shared engine, which review found would not have
worked:

- It never matched option **buttons** — its selector reads headings and prose.
  Every option now carries a spoken form (`data-say="Option A. Health care."`),
  which the engine now prefers over its visible text. *(Engine change made.)*
- **Resume went silent on Android**, where `pause()` behaves like cancel.
  *(Fixed: pause now remembers the paragraph and resume re-reads it.)*
- It **scrolled the page under the thumb** on every paragraph. *(Fixed: only
  when the paragraph is off screen.)*
- It used a US voice. *(Fixed: prefers an English-Canada voice.)*
- Still to build for the quiz: a setting, asked once and on by default, to read
  each question automatically; reading just the card; re-hearing one option;
  and stopping speech when an option is tapped or Next is pressed.

**Text:** stems of twelve words or fewer, in the sans face at 18 px or more,
with no negative letter-spacing and line height of at least 1.5. **Sentence
case everywhere** — the stylesheet's uppercase label styles are not used.
Sector options use a short-label table of four words or fewer ("Farming and
forestry", not "Agriculture, forestry, fishing and hunting"); the full name is
on the card. Place names drop bilingual forms and type codes, and a few
unwieldy ones are ineligible as options.

**Next** is placed where no option sat, and ignores a tap for 600 ms after an
answer, so a double tap cannot skip the card. That is a debounce, not a timer.

## 11. Phone first

Designed at phone width first. One question per screen; options in the bottom
two-thirds, at least 52 px tall; the card scrolls while Next stays put; works
offline.

## 12. Progress, as a picture that fills in

v1 offered "places and relationships learned" — a count, which brings nobody
back. v2 builds an **atlas**:

- A map of Ontario. Each place carries a ring of four segments, one per strand,
  inked as each holds at a delayed review.
- **Commuting and twin links draw in as lines** once learned, so the web of
  relationships becomes visible. None of the other quiz games can do this; it is
  what this tool is uniquely about.
- Each place opens a **dossier** built from the cards you have earned — the
  storytelling artifact, linked into the analysis panels.
- A private line of competence, never on the question screen: estimate error
  falling over time, and how often "sure" was right.

## 13. What it will not do

No leaderboards. No questions about individual census tracts. No questions
about the future. No shift-share in v1. No look-alike-name mode, even as an
option — it would be a spelling test.

## 14. Every must-fix, and what answers it

| finding | from | change |
|---|---|---|
| No measure specified; 18% of answers flip; Clarence-Rockland is a work-from-home artefact | rigour | G8 measure invariance; universe chip |
| Separation scaled the wrong way; published CIs discarded | rigour | G1 on measured sampling variance, 1.92√count |
| Counts not measured under the gates as written | rigour | table in §3 regenerated under v2 gates |
| Tier 5 measures COVID exposure; implies causation | rigour | cut from v1 |
| Card hand-writes facts and states unseparated ranks | rigour | principle 1 covers the card; G1 covers every stated comparison |
| Ladder breaks at tier 3; 70% target fights 80% gate | learning, engagement | strands, delayed-review unlock, no success target |
| Elo item ratings unidentifiable with one player | learning | one scheduler, per-item forgetting model |
| Disclaims measurement, then relies on it | learning | "learned" = held at a 7-day review; held-out transfer set |
| Tier 2 answerable by rule; tier 1 spacing unit wrong | learning | profiles not single winners; one size belief per place |
| Surprise never sought | engagement | distinctive-vs-largest weighting; confidence tap |
| Spreadsheet with buttons | engagement | ten question forms, several visual; map in v1 |
| Bag of facts, no story | engagement | routes with a closing card; Daily |
| Progress is a count | engagement | atlas with rings, links and dossiers |
| Options never read aloud | dyslexia | `data-say`; engine change made |
| Resume silent on Android | dyslexia | engine fixed |
| Look-alike names by default | dyslexia | G9 orthographic separation |
| Option strings too long | dyslexia | short-label table; three options |
| Card too heavy | dyslexia, learning | two layers |
| Hidden time pressure | dyslexia | no backlog counts, no streaks, nothing goes down, Stop here |

## 15. What v1 got wrong, briefly

v1 was careful about generating questions and careless about everything around
them. It separated answers from runners-up with a margin that ran the wrong way,
never said which of two measures it used, then wrote a card sentence by hand.
Its learning model was two schedulers and a rating that could not work with one
player. It would not have been played a second week. Its accessibility promises
were sincere and, against the actual read-aloud engine, untrue. All four reviews
said to keep its gates, its answer card as the product, its refusal to claim a
calibrated measure, and its absence of a clock — and v2 does.

## 16. Before building

1. Load the published confidence intervals, and the occupation dimension, from
   98-10-0456 — this also closes the tool's own "sampling error not modelled"
   gap and lets *what do people do here* be answered by occupation.
2. Build the generators and re-run this table from real code, not a scratch
   script.
3. Simulate the scheduler with seeded learners before building any screen.
4. Test read-aloud Pause and Resume on the phone itself.
