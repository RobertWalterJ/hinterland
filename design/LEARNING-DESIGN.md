# Hinterland as a learning tool — design, v1

*Status: direction set by Robert, 19 Sept 2026; designed, not built, and not
yet audited. The quiz design in `design/QUIZ-DESIGN.md` is one part of this.*

## 1. The reframe

Hinterland began as an analysis tool with explanations attached. The direction
now is the other way round: **a learning tool that happens to do rigorous
analysis.** Someone who uses it for a year should come away with three things
they did not have before:

1. **A working picture of contemporary Ontario** — what people do in its
   places, how those places connect, how they compare.
2. **Regional-science literacy** — what each method is, what its numbers
   signify, *when to reach for which method*, and what a result can and
   cannot tell you.
3. **A sense of Ontario's economic history** — how the province came to have
   the economy it has.

The technical vocabulary stays. Location quotient, shift-share, Moran's I are
the words the field uses, and a learner should end up fluent in them. What
changes is that **no term ever arrives before its plain meaning.**

## 2. Plain English first, everywhere: the four layers

Every number the tool shows gets the same four layers, in this order:

| layer | example | always shown? |
|---|---|---|
| **1. What it says** | "Hamilton has about 1.3 times Ontario's share of health-care jobs." | yes |
| **2. What it's called** | "That ratio is a *location quotient*: 1.3." | yes |
| **3. How it works** | "Local share divided by the reference share. Above 1, the place has more than its share." | on tap |
| **4. When you'd use it, and what it can't tell you** | "Use it to spot specialisation. It says nothing about growth, and it can't see a firm selling locally what it also exports." | on tap |

Layers 3 and 4 come from `METHODS.md`, which already states every method with
its literature and its known biases. That is the methods equivalent of accuracy
by construction: **the tool never claims anything about a method that
METHODS.md does not**, and METHODS.md is the one place a claim about method has
to be defended.

### Fading, so that learning shows

Scaffolding that helps a novice gets in an expert's way — the expertise reversal
effect (Kalyuga et al. 2003). So the layers fade as they are learned. The tool
keeps a small record of which terms you have met, opened, and answered correctly
in the quiz, and once a term has *held* (the same test the quiz uses: right at a
review a week later), layer 1 shrinks and layer 2 leads. The Brief starts using
the term without defining it.

A reader can always say *"I know this"* to fade a term early, or *"explain
again"* to bring it back. Nothing is hidden for good.

This is what "you should learn the significance of the analysis and the numbers
over time" means in the interface: **the app visibly gets less wordy as you get
more fluent**, and you can see which terms have faded.

## 3. The methods curriculum: learning *when to use which*

Definitions are the easy part and the least useful. What a planner needs is
judgement: faced with a question, which method answers it, and what should make
them doubt the answer. That is taught by problems, not glossaries.

**A method map**, one page, built from METHODS.md:

| the question someone brings | the method | what the answer tells you | what it can't |
|---|---|---|---|
| "Are we unusually dependent on one industry?" | location quotient; specialisation and diversity indices | concentration against a reference | anything about growth or performance |
| "Did we lose jobs because of the province, our industry mix, or ourselves?" | shift-share | an accounting split of change | *why* — it is an identity, not a cause |
| "What happens if this plant opens or closes?" | input-output multipliers | the order of magnitude of knock-on jobs | local capture precisely; it is provincial, scaled down |
| "Is this pattern regional, or just this place?" | Moran's I, LISA, Getis-Ord | whether neighbours resemble each other | the reason they do |
| "Where does our labour market actually stop?" | travel-to-work areas | the functional boundary | anything about workers who work from home |
| "Who should we compare ourselves with?" | peer matching | places structurally like you | whether they are doing well |

**Quiz strand E — Methods**, built on that map. Four kinds of item:

- **Which method?** "A council wants to know whether its drop in manufacturing
  jobs was a provincial trend or a local failing. Which method?" → shift-share.
- **What does this number mean?** "A location quotient of 0.4 for retail. Most
  likely?" → the place under-serves itself, or residents shop elsewhere.
- **What can't you conclude?** "The competitive effect was minus 2,000. Can you
  say the local economy performed badly?" → not safely: 2021 was a pandemic
  reference week, and the tool shows its known breaks.
- **Read the result.** A real panel from a real place; three plain-English
  readings; which one is right?

Every answer card for a methods item shows the method applied to a real place,
and "Show me" opens that panel.

The third kind matters most. A learner who can say what a result *cannot* tell
them has understood the method; one who can only define it has not.

## 4. The history curriculum

This is the one part of the tool the data cannot fully supply, so it needs two
disciplines, kept apart and labelled.

### 4a. History the data tells — accuracy by construction

The five-census series and the components of population change carry real
economic history, and it can be generated exactly as the quiz generates
everything else. Measured, within one labour-force universe:

- **Ontario's manufacturing labour force fell 29% between 2001 and 2011** —
  about 984,000 to 698,000 workers, from 16% of the labour force to 10%.
- Over the same decade, **health and social services rose to meet it**, both at
  10.4% in 2011; by 2021 health care was clearly larger, 12.6% against 9.3%.
- Components of population change reach back to **1986**: the shift from growth
  driven by births to growth driven by migration is visible division by
  division.

Two caveats travel with every such item: comparisons stay **within a
labour-force universe** (2001–2011, or 2016–2021 — METHODS §7.0), and the 2011
point is the voluntary National Household Survey.

### 4b. The longer arc and its causes — sourced, never written from memory

Why manufacturing fell, what the Auto Pact did to a handful of Ontario cities,
what the 2008–09 recession cost, how the resource towns came to be — none of
that is in these tables. It can only be written, and anything written is where
a learning tool can quietly start teaching things that are not true.

So the discipline is Commonplace's: **curated entries, each verified against a
source, and dropped if it cannot be.** Every history entry is:

- a dated claim, one or two sentences, in plain English;
- **a citation** to an authoritative source — Statistics Canada, the Ontario
  Ministry of Finance, the Bank of Canada, Library and Archives Canada, or the
  peer-reviewed literature;
- **a link to what the data shows today**, wherever there is one — the history
  exists to explain the present structure, not to stand beside it.

*Example of the shape (content not yet sourced):* an entry on the Canada–US
Auto Pact would carry its date and citation, then link to the places whose
manufacturing location quotient is still highest, and to how their share moved
2001–2011.

**No history entries have been written yet, deliberately.** Building this strand
means a sourcing pass first, and a check — like the one Commonplace runs on its
quotations — that every entry resolves to its cited source.

**Quiz strand F — History:** order events; link an event to the places it
shaped; "which change does the data show between 2001 and 2011?" Always tied
back to a map or a number.

## 5. How the pieces fit

| part of the tool | learning role |
|---|---|
| Every panel | the four layers, fading as terms are learned |
| The Brief | tells a place's story; uses only terms the reader has met, defining the rest |
| The method map | a single page on when to use which method |
| The quiz, strands A–D | contemporary Ontario: size, what people do, connections, demography |
| The quiz, strand E | regional-science judgement |
| The quiz, strand F | economic history, data-told and sourced |
| The atlas | what you know about places, filling in |
| A glossary page | every term, which have faded for you, and "explain again" |

## 6. What this changes elsewhere

- **The phone version** should be built around this, not around the dashboard:
  one idea per screen, plain English first, a picture, "tell me more". The
  quiz, the four layers and the fading all work better on a phone than the
  analysis panels do.
- **Occupation.** "What do people do here?" in plain English means *nurse,
  trucker, teacher*, not *health care sector*. The 2021 table the tool already
  downloads publishes ten occupation categories and the pipeline discards
  them. Loading them answers the question in the words people use.
- **The confidence intervals** in the same table should be loaded at the same
  time: the fourth layer — *what this can't tell you* — is much stronger when it
  can say "give or take about 8%".

## 7. Not yet audited

Strands E and F, the four-layer pattern and fading are designed here and have
had **no independent review**. They should go through the same four lenses the
quiz did — rigour, learning science, dyslexia and accessibility, engagement —
before any of it is built. The history strand in particular needs its own
review of the sourcing discipline.
