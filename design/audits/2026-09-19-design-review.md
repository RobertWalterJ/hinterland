# Hinterland: adversarial design review

19 September 2026. Reviewer: senior product and UX design pass, in the browser (375 x 812 phone emulation, dark and light, plus 1280 x 800 desktop) and in the code. Measurements came from `getComputedStyle` and `getBoundingClientRect` on the running app at http://localhost:8791/.

**Timing note.** Commit `9efa50a` ("Back gesture goes back; quiz Next no longer floats over the answer") landed at 12:55, while this review was running. I tested both builds. Findings on those two complaints describe the **current** build and say what the fix did and did not solve. One side effect: quiz answers from test sessions are now in this browser pane's localStorage for `localhost:8791`. The phone's data is on a different origin and is untouched.

---

## (a) Verdict

The front door now works. On a phone, the landing screen asks "What do people do here?", and one tap on a place gives a plain sentence and three labelled bars: "The largest group is health & social, at 23% of the jobs located here…". That is the best screen in the app, and it shows what the rest should look like.

The design stops meeting its purpose one tap later. Every drill-down drops back into the older desktop "instrument panel" pattern:

- Controls and method come first, and the answer comes last. On Change and Peers, not one plain finding appears above the fold.
- Text shrinks from 17px to 10.5 to 14.5px.
- Jargon is back ("LQ", "Mahalanobis", "allocation effect", raw census codes).
- Nothing tells Robert where he is. The bottom nav highlights nothing on Structure or Peers.

Three structural problems cause most of the complaints:

1. **There is no navigation model.** There are 11 destinations on desktop and 7 bottom tabs on the phone. One of those tabs (Place) is an action, not a destination. Four screens (Impact, Neighbourhoods, Sources and, apart from a Home link, Structure) have no phone entry at all. Until today, back left the app.
2. **Change over time is not about time.** The Change screen is a two-year shift-share decomposition with a single chart. The only census-by-census line chart in the app is buried under Home's "All the numbers" fold. The screen also quietly switches from "jobs here" (place of work) to "resident labour force" (place of residence).
3. **The Learn side is one 9,080px scroll.** It has 1,179 words and 123 controls, and the quiz sits inside it. The quiz screen still carries the full analysis chrome, including a filled "Export" button as the loudest thing on the screen, and it has no per-item audio.

The analysis underneath is rigorous and honest. The failure is in wayfinding, hierarchy and storytelling.

---

## (b) The journey as it is (phone, dark mode)

| Step | What happens | Friction |
|---|---|---|
| 1. First visit | Landing card: question, a fake search field (a button that opens a sheet), "Use where I am", "Explore the map", five place chips. | The top-left of the screen is three unlabelled 34px icons (read, stop, sound). The **stop icon shows even when nothing is playing** (see C3). The bottom nav already offers Change, Population, Map and Brief before any place is chosen. |
| 2. Search | Sheet "Where?". Typing "ham" lists the **economic region, the CMA and the census division before the City of Hamilton**, then Hamilton Township (with a bilingual "Strong metropolitan influenced zone" label), Chatham-Kent and Durham. | The place Robert means is fourth. Kind badges are codes (ER, CD, CMA/CA). The input is squeezed to half width by "Use where I am". Input text is 15.5px. |
| 3. Home (Thunder Bay) | Answer sentence and top-three bars, then "people live / jobs are here / jobs per worker", then "Dig deeper" (6 questions), then "All the numbers". 171 words. | Good. However, "108,843 people live here" (2021 Census) and the Population screen's "117,671 residents, 2025" are never reconciled. |
| 4. "What is it known for?" | Opens Structure: two segmented controls (5 options, including "By NAICS code"), then a 20-row list, **then** the sentence "Mining & oil/gas stands out… 2.7 times". 433 words, 14 controls. | The answer to the question just asked is below 20 rows. There is no screen title echoing the question. **No bottom-nav item is selected.** Rows are sorted by LQ, but the bar shows share of jobs and the number shows a count, so the top row (Mining, 580) has the shortest bar. Meta text is 12.5px. |
| 5. Back gesture | Before `9efa50a` this closed the app (only `replaceState` was used, and `history.length` never changed). Now each screen change pushes an entry. | Scroll position is not restored: `A.go` zeroes it (`app.js:323`) and popstate does not bring it back, so returning to Home does not land at "Dig deeper". |
| 6. Change | Year selects, three checkboxes, a pandemic warning, "Where the change came from" with a "Why and how" fold, three big numbers, a waterfall (axis text 10.5px), then the sentence, then a sector list. 287 words, 13 controls, **1 chart**. | Six controls come before any content. The answer sentence is at about 1.5 screens. The sector list pairs "Accommodation & food 4,060 → 3,060 jobs" with **"+353"** (the competitive effect, not the change). A reader sees a loss of 1,000 labelled plus 353. The screen promises "back to 2001" but shows 2016 to 2021 only. |
| 7. Population | Title, fold, 117,671, +4,373, +3.9%, +0.2% a year, a line chart (y-axis from 112,000; labels 10.5px), then components **for the census division**, with a note "This is the census division, not Thunder Bay." | No plain answer to "Is it growing?". The real story (decline from 2004 to 2016, then a rebound) is visible but never said. |
| 8. Peers | Two-way toggle, then "How these peers were chosen… Mahalanobis distance", then 7 checkboxes, then "What these mean". **No peer is named above the fold.** The peer list is hidden behind "Show the table (9 rows)". | The method comes first. The labour-market prose prints raw codes: "It groups with **1103025, 1315011**, … **4602053**". |
| 9. Map | A select with 12 variables (including "Competitive shift, per 100 base jobs…"). The map fills the card, and the legend overlays about a third of it. | Workable. The tap-a-place card is good ("See the full answer"). |
| 10. Brief | First paragraph, then "Read the rest (9 more paragraphs)". | Reasonable. It has its own read-aloud, which duplicates the header reader. |
| 11. Learn | One page: session start, nine ideas, settings, history, glossary, method map. 1,179 words, 123 controls, 9,080px tall. | Too much for a phone. The hub said "About twelve questions", but the session had 8. |
| 12. Quiz question | "Question 1 of 8 · Stop here", source chip, stem (20px), "How sure are you? (optional)" with three 40px chips, then options (56px). The header still shows the place and benchmark chips, **Export**, and the read, stop, sound and theme icons. | No progress bar. No back chevron. No speaker on the stem or options. The confidence row is an extra decision before every answer. |
| 13. Wrong answer | The correct option gets a 2.5px solid outline and a ✓. The chosen option gets a 1.5px **dashed** outline and a ✕. The third option drops to 72% opacity. The verdict reads "Not this time — it's Public administration." | See M9. |
| 14. Next | In the current build, Next sits in the flow after the explanation sentence. It is full width, 54px, and visible above the nav at 629 to 683px. | Fixed. But "Part of…", the source, "Tell me more" and "That was a misread" now come after the primary action, and most readers will never see them. |
| 15. Back mid-quiz | After answering and before pressing Next, the back gesture ends the session: **"Session finished. You answered 0 questions."** | The answer is discarded, because it is only committed on Next (`quiz-ui.js` around line 124). The quiz stops instead of pausing, and the message undercounts. |
| 16. End of session | "You answered 8 questions, 8 of them new. 12 questions you can answer now, up 3." Buttons: Another session, See your progress. | No review of what was missed, no takeaway for each idea, and no link to the places asked about. |
| 17. Export (phone) | "Take it away", 212 words, 19 controls, offering Shapefile, DBF, GeoJSON, xlsx, CSV and text. | The design doc says the shapefile is desktop-only and the phone gets a share sheet. Neither is true. |

---

## (c) Findings, ranked

### Critical

**C1. There is no coherent navigation model, so Robert cannot tell where he is.**
- *Principles:* Nielsen #1 (visibility of system status), #4 (consistency), wayfinding and information scent, Material navigation guidance (3 to 5 destinations).
- *Evidence:*
  - `index.html` has 7 bottom buttons: Place, Home, Change, Population, Map, Brief, Learn. "Place" is an action that opens a sheet, not a destination.
  - `app.js:48-60` defines 11 desktop tabs.
  - On the phone, Structure and Peers are reachable only from Home links. Impact, Neighbourhoods and Sources are not reachable at all: there is no `A.go('impact'|'hoods'|'sources')` anywhere, and `.tabs` is hidden below 720px (`app.css:896`).
  - On Structure and Peers, `#nav` has **no** `aria-selected="true"`.
  - Nav labels are 10.5px. The chrome takes 151 of 812px (the 91px header plus the 60px nav).
  - The design doc promised 5 tabs (Place · Now · Change · Peers · Map); a different 7 were built.
- *Why it matters for Robert:* he is dyslexic, so he leans on spatial memory and on a stable "you are here". Reading labels is costly for him, and every unlit screen makes him reorient from scratch.
- *Fix:* adopt the model in (d). Use 4 bottom tabs (Place, Explore, Map, Learn), put a title bar with a back chevron on every drill-down, and make the place a header control rather than a tab.

**C2. Change over time is a two-point decomposition, not a story about time.** This is Robert's complaint, confirmed.
- *Principles:* form fits the job (data-vis), answer then evidence then method, progressive disclosure.
- *Evidence:*
  - `P.change` (`panels.js:743` onward) renders controls, a pandemic card, stat tiles, one `C.waterfall`, a sentence and a per-sector competitive list.
  - Five censuses (2001 to 2021, `res_series.json`) and annual population (2001 to 2025) are loaded. Yet the only multi-year industry chart (`trendChart`, `panels.js:491`) appears only inside Home's "All the numbers" fold (`panels.js:375-384`).
  - There are no sector trajectories, no indexed comparison with Ontario, no rank changes and no link to the history timeline.
  - The Home link says "2016 to 2021, and back to 2001", but the screen defaults to 2016 to 2021.
  - The basis silently changes from place-of-work jobs on Home to resident labour force here.
  - The sector list shows the competitive effect beside a start → end count that moves the other way ("4,060 → 3,060 jobs +353").
- *Why it matters:* this is the drill-down with the richest story (Thunder Bay manufacturing 2,700 → 1,780; the provincial slide from 125 manufacturing towns to 37), and it reads as a statistics exercise. For a dyslexic reader, a signed number next to a contradicting pair of counts is a trap.
- *Fix:* rebuild Change as a "story over time" screen:
  1. Lead with one sentence: "Thunder Bay's workforce shrank 6% from 2016 to 2021, three times Ontario's rate, mostly in manufacturing and public administration."
  2. Draw an indexed line (place against Ontario, 2001 = 100) across all five censuses, with the 2011 point hollow and labelled.
  3. Add a slope chart or small multiples of the top 6 sectors, 2001 to 2021, direct-labelled.
  4. Add "what grew, what shrank": two short ranked lists of **absolute** change, with the effect shown only as a second line.
  5. Pin annotations from `history.js` events (Auto Pact end 2001, 2008 to 2009) onto the line.
  6. Move shift-share lower, as "Why did it change?", with the waterfall and a plain reading.
  7. Put the year controls in a "Change the years" fold at the bottom.
  8. Label the basis switch in the title: "Where residents work".

**C3. The "Stop reading" icon is always visible.**
- *Principles:* Nielsen #1 and #8, the state of controls.
- *Evidence:* `readStopBtn` has `hidden=true`, but its computed `display` is `grid`, because `.iconbtn { display: grid }` (`app.css:317`) overrides the UA `[hidden]` rule. Only `.playbtn[hidden]` is reset (`app.css:349`). It renders as a bare square beside the read button on every screen, the landing included.
- *Why it matters:* an unlabelled icon that does nothing is exactly the kind of noise Robert has to decode. It also makes the read-aloud pair look broken, and read-aloud is the feature he most needs.
- *Fix:* add `[hidden] { display: none !important; }` globally. Better, merge play, pause and stop into one labelled "Listen" control.

**C4. Every drill-down puts controls and method above the answer.**
- *Principles:* inverted pyramid and storytelling, visual hierarchy, Hick's law.
- *Evidence (above the fold at 375 x 812):*
  - Structure: 5 toggle options, then a 20-row list; the answer sentence comes after row 20.
  - Change: 6 controls and a warning card; no finding.
  - Peers: toggle, method paragraph and 7 checkboxes; no peer named.
  - Impact: opens with "If jobs arrived in [select of about 30 long NAICS names]", 646 words.
- *Why it matters:* Home proved that Robert gets the answer when it comes first. On the other screens he has to read past jargon to find it, which is costly and discouraging.
- *Fix:* use one template on every screen (see (d)): answer sentence, then one hero visual, then "Why" evidence, then "How we worked it out" (method, controls, table). Controls move into a "Change the settings" fold at the bottom or into a sheet.

### Major

**M1. The back gesture works now, but it is only half a model.**
- *Principles:* platform conventions (Android predictive back), the History API.
- *Evidence:* `9efa50a` adds `pushState` and `popstate` (`app.js` `initHistory`). Remaining gaps:
  1. Scroll position is not restored. `A.go` sets `scrollTop = 0`, and popstate re-renders at whatever offset `main` happened to have.
  2. Mid-quiz back **stops** the session. After answering and before Next, it shows "You answered 0 questions", because the answer is committed only on Next.
  3. Sheets do not push an entry. Back pops the underlying screen entry and then pushes it again, which also wipes forward history.
  4. There is no visible back affordance anywhere (no chevron), so the gesture is the only way back and its behaviour is invisible.
- *Fix:*
  - Store `{tab, place, scrollTop}` in `history.state` and restore it on pop.
  - Push a history entry when a sheet opens.
  - In the quiz, commit the answer when it is chosen. Keep "misread" as an undo, and make back mean "pause": "Paused at question 4 of 8. Carry on?"
  - Show a "‹ Home" chevron on every drill-down title bar.

**M2. Drill-down text is too small for a dyslexic reader on a phone.**
- *Principles:* BDA style guide (12 to 14pt, about 16 to 19px), WCAG 1.4.4.
- *Evidence:* phone `body` is 15.5px (`app.css:878`). Measured sizes: sector names 14.5px, meta ("1.3% of jobs · LQ 2.75") 12.5px, card notes 13.5px, stat hints 11.5px, stat labels 12px, bottom-nav labels 10.5px, chart axis and labels 10.5 to 11.5px, year-control labels 13px (inline style, `panels.js` about 787), chip keys 10px. Home and the quiz use 17 to 20px, so the drop is inconsistent as well as small. Contrast is fine (5.4:1 and up).
- *Fix:* set a floor. Phone body 17px, secondary 15px, nothing below 14px, chart labels 13px or more. Where text no longer fits, the answer is fewer columns and words, not smaller type.

**M3. Jargon and raw identifiers leak into plain-English screens.**
- *Principles:* plain language, Nielsen #2 (match the real world).
- *Evidence:*
  - "LQ 2.75" on every Structure row.
  - "By NAICS code", "Usual workplace only", "Split out the allocation effect", "Chain each interval", "Mahalanobis distance".
  - "Statistical Area Classification: Census metropolitan area".
  - The picker badges ER, CD and CMA/CA.
  - Waterfall categories "Reference growth / Industry mix / Competitive".
  - The raw census codes 1103025, 1315011 and 4602053 in the Peers labour-market sentence (a data bug: unnamed CSDs, probably reserves or unorganised areas, printed as IDs).
- *Fix:*
  - Rename in the UI and keep technical names in the glossary chip: "2.7× Ontario's share" instead of "LQ 2.75"; "the province" / "its industries" / "its own performance"; "sorted by: biggest / most unusual".
  - Resolve every code to a name or drop it ("and 3 small unnamed areas").
  - Move method words behind the "How we worked it out" fold.

**M4. Structure's list encodes one thing, sorts by another and prints a third.**
- *Principle:* data-vis encoding consistency.
- *Evidence:* sorted "By concentration" (LQ), the bar length is share of jobs and the big number is a count. The top row, Mining at 580 jobs, has the shortest bar. The sort choice also persists forever, because Home sets `A.state.sortStructure = 'lq'` (`home.js:311`).
- *Fix:* sort by concentration and draw a **diverging bar around 1× Ontario**, labelled "2.7× Ontario". Show the count as secondary text. Split the list: "More than Ontario" (the answer to "known for") and "Less than Ontario" (folded). Do not persist a sort chosen by a link.

**M5. The quiz screen carries the whole analysis chrome.**
- *Principles:* focus and minimalism (Nielsen #8), cognitive load.
- *Evidence:* during the quiz the header shows the place chip "in Thunder Bay", the "vs Ontario" chip, a filled primary "Export" button (the highest-contrast element on screen), and the read, stop, sound and theme icons, above the 7-item nav. None of it applies to the question.
- *Fix:* make the quiz a full-screen mode. Use a slim top bar with a back chevron, a progress bar reading "4 of 8", and "Stop". Hide the bottom nav and the analysis chips.

**M6. The quiz has no audio at the level of each item.**
- *Principles:* BDA audio support, and parity with his own Palimpsest pattern.
- *Evidence:* there is one global toggle, "Read each question to me" (`quiz-ui.js:549`), and the header reader reads the whole page. There is no speaker beside the stem or each option. On the tested profile the setting was off.
- *Fix:* add a 44px speaker button beside the stem, each option, the verdict and the lesson text, as Palimpsest does. Keep auto-read as the default.

**M7. Progress is shown as text, and the numbers disagree.**
- *Principles:* progress visibility (learning design), Nielsen #1.
- *Evidence:*
  - The counter reads "Question 1 of 8" in 14.5px text, with no bar.
  - The hub says "About twelve questions" while sessions had 8.
  - Idea 3, "What small towns are like", is labelled "Opens as you learn the one before", yet its question ("Small towns have far more of their jobs in…", tagged "Part of What small towns are like") was asked in the same session.
- *Fix:* add a slim top progress bar with "4 of 8". Let the hub say the real session length. Either do not ask locked ideas' questions, or show the idea as open.

**M8. "Teach, then test" is only partly delivered, and the lesson is text-only.**
- *Principles:* worked examples and dual coding (learning design), dyslexia (show, do not tell).
- *Evidence:* the lesson "What every place has" is 108 words in three bullets, with its key figure ("27% of jobs in small towns and 28% in big cities") given only as prose. There is no picture, no speaker button and an all-caps eyebrow ("BIG IDEA 2 OF 9"). "Got it, ask me" is a small, left-aligned button, while Next is full width. When a lesson has been seen before, questions from later ideas arrive with no reminder of the idea.
- *Fix:*
  - Give each lesson one computed picture (two bars: small towns 27%, big cities 28%) and a single sentence.
  - Use the same full-width primary button as Next.
  - Show a one-line "Remember: …" recap chip above the first question from each idea in a session.

**M9. The wrong-answer marking is readable but weak.**
- *Principles:* feedback clarity, Gestalt figure and ground.
- *Evidence (`app.css:1114-1115`):* the right option gets a 2.5px solid outline, a ✓ and full opacity. The chosen option gets a 1.5px dashed outline and a ✕. The others drop to 72% opacity. In dark mode the ✓ and ✕ glyphs are about 20px and the same colour. A dashed hairline on a dark card is the least salient mark on the screen, yet it carries "this is what you picked". Nothing says in words which one was yours until the "Tell me more" fold ("You chose …").
- *Why it matters:* dyslexic readers do not reliably register the difference between dashed and solid lines, and a symbol alone is weak. Both marked cards look "selected".
- *Fix:*
  - Add a word label inside each marked option: "Right answer" on the correct one, "Your answer" on the chosen one.
  - Give the correct option a filled tint (neutral ink wash, not green) plus the solid border.
  - Keep the chosen option at full opacity with a solid 2px border and the ✕.
  - Make the verdict "You chose Finance & insurance. The answer is Public administration."
  - Keep colour out of it, as the codebase rightly insists.

**M10. The Next button's old overlap is fixed, but the answer card is now split around it.**
- *Principle:* hierarchy and action placement.
- *Evidence:* in the current build Next sits between the explanation sentence and "Part of…", the source, "Tell me more" and "That was a misread" (`quiz-ui.js` about lines 319-331).
- *Root cause of the original complaint:* `.qnextbar` was `position: sticky; bottom: 64px` inside the card, with a gradient that did not fully mask the content. It stuck over the card's own text as the page scrolled. Removing sticky fixed that.
- *Fix:* put the secondary items in a folded "More about this answer" **above** Next, or turn "misread" into an icon button beside the verdict. On short cards, place Next at the thumb zone by making the card a flex column that ends with Next. Never pin it over content.

**M11. The Learn tab is a 9,080px single scroll.**
- *Principles:* progressive disclosure, chunking.
- *Evidence:* 1,179 words and 123 controls mixing the quiz hub, the nine ideas, settings, the Ontario history timeline, the glossary and the method map.
- *Fix:* split it into a Learn landing page with four large tiles: Practise (quiz), Big ideas (progress), Ontario's story (history), Words and methods (glossary and method map). Each tile is its own screen with a back chevron.

**M12. Place search ranks regions above municipalities.**
- *Principles:* information scent, recognition over recall.
- *Evidence:* "ham" returns Hamilton–Niagara Peninsula (ER), Hamilton (CMA), Hamilton (CD) and then the City of Hamilton, followed by Hamilton Township, Chatham-Kent and Durham.
- *Fix:*
  - Rank exact and prefix name matches first, and prefer CSDs (the "here" of the question).
  - Collapse same-name siblings into one row with a "Also: the Hamilton region, metro area" expander.
  - Say the kind in words ("city", "the Hamilton metro area").
  - Drop bilingual SAC strings.
  - Give the input a full-width row at 17px or more, with "Use where I am" underneath.

**M13. Numbers disagree across screens with no explanation.**
- *Principle:* consistency.
- *Evidence:*
  - Home says "108,843 people live here" (2021 Census); Population says "117,671 residents, 2025".
  - Home's "jobs here" is place of work; Change's "labour force" is place of residence.
  - Population's components section is for the census division.
- *Fix:* every hero figure carries its year and basis inline ("108,843 in 2021"). Where a screen changes basis, the title says so.

**M14. On a phone, Export is the loudest header control, and it offers GIS formats.**
- *Principles:* frequency-weighted prominence, platform fit.
- *Evidence:* `#exportBtn` is the only filled button in the header on every screen, the quiz included. The sheet offers Shapefile and DBF on the phone, although the design doc says those are desktop-only. There is no share-sheet handoff.
- *Fix:* on the phone, move Export into a "Share or save" item in an overflow menu, or onto the Brief screen. Offer "Share the brief" (`navigator.share`) and CSV there. Keep the GIS formats on desktop.

### Minor

- **m1. Header icon targets are 32 to 34px.** Read, sound and theme measure 34 x 34 and 32 x 32. They pass the WCAG 2.2 AA 24px minimum but miss Android's 48dp. The confidence chips are 40px tall and "Stop here" is 36px. Raise all of them to 44 to 48px.
- **m2. The landing leads with icons, not identity.** The read, stop and sound icons come before the wordmark (flex order on the phone). The wordmark's "land" is low-contrast grey (5.1:1). Put the wordmark first and gather the icons into one "Listen" button plus an overflow menu.
- **m3. There are too many all-caps labels.** Eyebrows, the lesson counter, idea headers and section labels in the picker ("ECONOMIC REGIONS") use `text-transform: uppercase` at 13px with tracking (`app.css:273, 303, 463, 517, 547, 763, 770, 1274, 1287, 1323`). The BDA advises against all caps. Switch to sentence case, bold, 15px.
- **m4. Underline is used for emphasis and for links in headings.** The place name in the Home H1 is a dotted-underlined button. "Use where I am" and "Explore the map" are underlined link-buttons. Prefer a chip with a caret ("Thunder Bay ▾") so that underline is not doing double duty.
- **m5. Dark mode uses pure white text on near-black.** Body ink measures #fff at 17.4:1. The BDA recommends avoiding pure white on black because of glare. Use about #ECE9E1 (still more than 12:1).
- **m6. The confidence row asks for a decision before every answer.** It is optional, but it is 3 buttons and a label. Hide it after the first session, or move it to after the answer ("Were you sure?").
- **m7. Chart axis text is 10.5px** (waterfall, population lines), and the population y-axis starts at 112,000 without saying so. Use 13px labels, direct end labels, and write "axis does not start at zero" in the note, or index to 100.
- **m8. Home's "Dig deeper" duplicates the bottom nav** (Change, Population, Map), and the questions are not reachable from any drill-down. Put "Next question" links at the foot of each drill-down (Structure → "How has that changed?").
- **m9. The Learn and Brief read-aloud buttons duplicate the header reader.** Choose one pattern: a speaker next to each block.
- **m10. Desktop uses a single 640px column** with a large empty right side on Home. The 11-tab strip at 13px is dense. Desktop can afford a two-column answer and evidence layout.
- **m11. The end-of-session screen is thin.** Add "3 to look at again" with the missed facts, the idea each belongs to, and "See Quinte West" links. The data for this already exists.
- **m12. Quiz stems are sometimes fragments** ("The largest group of jobs in Quinte West?"). Write full questions, which are easier to parse when read aloud.

---

## (d) Proposed overhaul

### Information architecture

```
[Header]  ‹ Back (on drill-downs)   Screen title            ◐ Listen   ⋯ (theme, sound, export, sources)
          Place chip: "Thunder Bay ▾"   (compare chip lives on screens that use it)

[Bottom nav: 4 destinations]
  Place ........ the answer for the current place (Home) and its drill-downs
  Compare ...... peers + "compared with" + map of similar places
  Map .......... the second way in (tap a place → its answer)
  Learn ........ Practise · Big ideas · Ontario's story · Words & methods
```

- **Place is a header chip, not a tab.** Tapping it opens the picker sheet, which pushes a history entry.
- **Drill-downs are pushed screens under the Place tab:** Known for (Structure), Change over time, People (Population), Commuting, If jobs arrived (Impact), Neighbourhoods and The brief. Each has a title bar with "‹ Thunder Bay", and the Place tab stays lit.
- **Back behaviour, in this order:** close the sheet; pause the quiz (resumable); pop the drill-down, restoring the saved scroll position; switch to the tab's root; then exit. Store `{tab, screen, place, scroll}` in `history.state`.
- **Sources and method** go to the ⋯ menu and to the "How we worked it out" fold on each screen.
- **Desktop** keeps the same four areas as a left rail, with drill-downs as a second-level list. Desktop and phone share one mental model.

### Phone screen template (every drill-down)

1. **Title bar:** "‹ Thunder Bay · How has work changed?" The question the user tapped is the title.
2. **Answer (at or above the fold, 17 to 19px):** one or two plain sentences with a speaker button. It says the direction, the size and the main driver.
3. **One hero visual** that fits the question, direct-labelled, with 13px or larger text, and no hover needed.
4. **Evidence:** up to 5 rows or cards ("What grew", "What shrank"), each with a count and a plain comparison.
5. **"Why?" fold:** the decomposition, the comparison with the benchmark, and the caveats written for this result.
6. **"How we worked it out" fold:** method, controls (years, basis, benchmark), glossary chips, the table and export for this screen.
7. **"Next question" links** to two related drill-downs.

Budget: no more than 150 words before the first fold, no more than 3 interactive controls above the fold, and body text at 17px or more.

### The Change over time screen, specifically

- Answer: "Fewer people here work than in 2016 (−6%, against −2% in Ontario). Most of the loss was manufacturing and public administration."
- Hero: an indexed line, the place against Ontario, 2001 to 2021. 2011 is a hollow point labelled "voluntary survey", and 2021 carries a "pandemic week" marker.
- A "Sectors over 20 years" slope chart of the top six sectors, direct-labelled at both ends.
- "What grew" and "What shrank" lists in absolute jobs.
- An "Ontario events" strip under the line (Auto Pact 2001, the 2008 to 2009 crisis), linking to Learn → Ontario's story.
- A "Why did it change?" fold holding the waterfall, the sector competitive list (written "did better or worse than the same industry across Ontario"), and the Esteban-Marquillas split.
- A "Change the years" fold holding the selects and chain and skip toggles.

### The quiz screen

```
┌─────────────────────────────────────┐
│ ‹   ▓▓▓▓▓▓░░░░░░  4 of 8       Stop │  slim bar, no analysis chrome, nav hidden
│                                     │
│ Small towns and big cities · 2021   │  chip, 15px sentence case
│ Which kind of work takes about the  │  20px stem + 🔊
│ same share of jobs everywhere? 🔊   │
│                                     │
│ [ A  Public administration      🔊 ]│  56px+, speaker on each
│ [ B  Finance & insurance        🔊 ]│
│ [ C  Agriculture & resources    🔊 ]│
└─────────────────────────────────────┘
After answering:
│ [■ A  Public administration  ✓ Right answer ]   filled neutral tint, solid 2.5px
│ [  B  Finance & insurance    ✕ Your answer  ]   solid 2px, full opacity
│ [  C  Agriculture & resources               ]   60% opacity
│ ┌ You chose Finance. It's Public administration. 🔊
│ │ 6.2% of jobs in small towns, 7.1% in big cities. [two-bar picture]
│ │ ▸ More about this answer (source, part of "What every place has", misread)
│ └ [            Next            ]  full width, in flow, last element
```

- The answer is committed on selection. "That was a misread" is an undo inside the fold.
- Back pauses: "Paused at 4 of 8. Carry on / End session".
- The end screen shows the growth figure, then "Look again at" with up to 3 missed facts, then the idea that opened, then **Done** (primary) and Another session.

---

## (e) Top 15 changes, ranked by impact over effort

| # | Change | Impact | Effort |
|---|---|---|---|
| 1 | Global `[hidden]{display:none!important}`, which removes the phantom stop icon (C3) | Medium | Tiny |
| 2 | Put the answer sentence first on Structure, Change, Peers and Impact, and move controls and method into a bottom "How we worked it out" fold (C4) | High | Small |
| 3 | Add a title bar with a back chevron on every drill-down, keep the Place tab lit, and save and restore scroll in `history.state` (C1, M1) | High | Small |
| 4 | Quiz: commit on select; back pauses rather than ends; fix "You answered 0" (M1) | High | Small |
| 5 | Wrong-answer marking: "Right answer" and "Your answer" labels, a filled tint on the correct option, a solid border on the chosen one (M9) | High | Tiny |
| 6 | Type floor: phone body 17px, secondary 15px or more, charts and nav 13px or more (M2) | High | Small |
| 7 | Quiz full-screen mode: slim progress bar "n of 8", hide the nav, chips and Export (M5, M7) | High | Small |
| 8 | Speaker buttons beside the stem, each option, the verdict and the lesson (M6) | High | Medium |
| 9 | Rebuild Change over time: indexed 2001–2021 line, sector slope chart, grew and shrank lists, shift-share under "Why?" (C2) | Very high | Medium |
| 10 | Reduce the bottom nav to 4 destinations; make Place a header chip; give Impact, Neighbourhoods and Sources a home (C1) | High | Medium |
| 11 | Plain-language pass: remove LQ, NAICS, Mahalanobis and ER/CD codes from the UI; resolve raw CSD codes to names (M3) | High | Small |
| 12 | Search ranking: municipalities and exact matches first; collapse same-name siblings (M12) | Medium | Small |
| 13 | Split Learn into four tiled sub-screens (M11) | Medium | Medium |
| 14 | Structure: a diverging "× Ontario" bar that matches the sort; "More than Ontario" first (M4) | Medium | Small |
| 15 | Phone Export becomes "Share the brief" / CSV via `navigator.share` in the ⋯ menu; GIS formats desktop-only (M14) | Medium | Small |

Next after these: a picture in each lesson and a recap chip (M8); an end screen with "Look again at" (m11); year and basis labels on every hero figure (M13); sentence case instead of all caps (m3); off-white dark ink (m5).
