# Learning engine, version 3

September 2026. Robert's brief: cut or remove repeated questions; high-quality
questions; a question set that grows with what the reader knows; questions
that teach something that is tested later; visible progress; and questions
that add up to something significant ("key industries in Ontario, the nature
of small towns, commonalities between small and large places, among small
places, among large places"). The model is Palimpsest's engine (v1.2–v1.8),
carried over where it fits.

## What changed

| Brief | Built | Where |
|---|---|---|
| Questions add up to something | Nine **big ideas**; every question belongs to one, at one of three levels (basics, places, surprises). Questions that fit none are not asked. | `app/js/quiz-ideas.js` |
| Teach, then test | Each idea opens with a **lesson** of two or three sentences. Every figure is computed from the data, and a sentence whose figure fails its gate is dropped, not softened. The idea's questions follow at once, grouped after the lesson. | `I.lesson`, `S.spread` |
| Grows with the reader | Ideas open in order. Within an idea, levels open when the level before has 3 answered right or 6 met. When what is open runs short, the next step fills the gap, not more of the same. | `S.ideas`, `S.plan` (ahead pool) |
| No repeats | No question twice in a session: the same-session re-ask is gone. Nothing is re-asked within 4 hours across sessions. No place twice in a session. Two of one kind at most, and never the same wording twice for new questions. Kinds and ideas are spread so neither comes twice running. | `S.plan`, `fits()` |
| High quality | 2,107 size questions ("which has more jobs?" ×1,854, "roughly how many?" ×253) cut. The one kept teaches something: *X has more people; which has more jobs?* (commuting). 71 new class-level and place-type questions, all through the existing gates (G1 separation, G2 floor, G9 names). | `I.generate`, `I.classify` |
| Show progress | Learn tab: "you can answer N" (observed: last answer right), "held for a week or more" (only rises), "missed once, right later", a day-by-day chart, and the nine ideas, each with a three-part bar (basics / places / surprises), its lesson and "what you have learned here". The session end shows growth and any idea that opened. | `QU.hub`, `renderDone` |

## The nine ideas, and what the data says (2021 Census, place of work)

1. **Ontario's key industries.** Health and social assistance is the largest (about 13 in 100 jobs), then retail, professional services and manufacturing. Industry clusters are checked from economic-region totals built from municipalities.
2. **What every place has.** Education, health and public administration take about the same share everywhere: 27% of jobs in small towns, 28% in big cities. This is local-serving work, which leads to the idea of the economic base.
3. **What small towns are like.** Farming and resources are 9.3% of their jobs, against 0.4% in big cities. In 177 of 242 small towns there are fewer jobs than working residents.
4. **What big cities are like.** 28 cities hold 74% of Ontario's jobs. They lean to finance, information and professional services. About 6 in 10 of their working residents work in the city, against about 3 in 10 in a small town.
5. **Small towns are not all alike.** Small towns differ from one another about twice as much as big cities do. There are 28 farming towns, 8 mining towns (all in the north) and 10 factory towns.
6. **Big cities are not all alike.** Each has its own lean (Ottawa and public administration, for example), yet they resemble each other more than small towns do.
7. **How places connect.** Commuting, what share of residents work locally, and why a smaller place can have more jobs.
8. **How work in Ontario has changed.** Manufacturing towns went from 125 to 37 (2001–2011), natural decrease, and the sourced timeline.
9. **Reading the numbers.** The methods, and how far to trust them.

"Small towns" means municipalities under 10,000 people. First Nations reserves and unorganised areas are excluded: they are not towns, and a class average would describe neither.

## A bug found while building

Economic-region and census-division codes are both four digits and collide in the payload: 3540 is both the Kitchener–Waterloo–Barrie region and Huron County. Reading regions by code put Ontario's agriculture cluster in Kitchener at 10 times its share. Region totals are now summed from municipalities.

## The trade-off, stated

Removing the same-session re-ask means a missed question comes back on a later day, not a few minutes later. In simulation (7 learners, 90 days) about half of what has been met is due on a given day, against about four in ten before. Of the questions the engine calls learned, 69% are remembered at their next review on average (57% at worst). The validator guards both numbers, with the reasons written beside the checks.

The simulated learner's model changed in one respect, stated in `pipeline/quiz_simulate.js`. Reading an answer card after a miss now adds a little memory each time. Without that, a question missed twice could never be learned, which is a fault of the model, not of readers.
