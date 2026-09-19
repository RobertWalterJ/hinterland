/* ==========================================================================
   The terms of regional science, in plain English.

   Hinterland is a learning tool that happens to do rigorous analysis. The
   technical words stay - a learner should end up fluent in them - but no term
   ever arrives before its plain meaning. Every term here carries four layers:

     plain   what it tells you, with no jargon            always shown
     name    what it is called                             always shown
     how     how it is worked out                          on tap
     when    when you would reach for it                   on tap
     cant    what it cannot tell you                       on tap

   The discipline is the one the rest of the tool keeps for numbers: nothing
   here may claim anything about a method that METHODS.md does not. Each term
   names the METHODS.md section it is drawn from, and pipeline/validate.py
   fails if that section does not exist. METHODS.md is the one place a claim
   about method has to be defended; this file only restates it plainly.

   Plain-layer sentences are kept short - about twenty words, no semicolons -
   because they are read aloud and read by people who find long sentences
   hard. The "cant" layer is the one that matters most: someone who can say
   what a result cannot tell them has understood the method.
   ========================================================================== */

(function (root) {
  'use strict';

  var T = {};

  /* kind: 'concept' (a way of counting) or 'method' (a way of analysing).
     group: where it sits on the method map. */
  T.list = [

    /* ---------------------------------------------- what is being counted */

    { id: 'place-of-work', kind: 'concept', group: 'counting',
      name: 'Place of work',
      plain: 'Counts jobs where the work is done, whoever does it and wherever they live.',
      how: 'Each worker is counted at their workplace. People who worked at home count at home.',
      when: 'Use it to describe a place as an employment centre: what the jobs located there are.',
      cant: 'It cannot say what the residents do. A commuter town has few jobs and many working residents.',
      methods: '1. What is being counted' },

    { id: 'place-of-residence', kind: 'concept', group: 'counting',
      name: 'Place of residence',
      plain: 'Counts workers where they live, wherever their job is.',
      how: 'Each employed person is counted at their home address, whatever their workplace.',
      when: 'Use it for the skills and work of the people who live in a place, and for change over time.',
      cant: 'It says nothing about the jobs located in the place. Many residents may work elsewhere.',
      methods: '1. What is being counted' },

    { id: 'industry-occupation', kind: 'concept', group: 'counting',
      name: 'Industry and occupation',
      plain: 'Industry is what an employer does. Occupation is what a person does.',
      how: 'A nurse and a hospital accountant share an industry, health care, but not an occupation.',
      when: 'Ask "what do people here do?" with occupation. Ask "what kind of economy is this?" with industry.',
      cant: 'Neither alone describes a place. The biggest industry here can employ many occupations.',
      methods: '1. What is being counted' },

    { id: 'reference-week', kind: 'concept', group: 'counting',
      name: 'The census reference week',
      plain: 'The 2021 census counted work in one week of May 2021, during pandemic closures.',
      how: 'People reported the job they held in that week, 2 to 8 May 2021.',
      when: 'Keep it in mind for any 2021 figure on restaurants, arts, retail or working from home.',
      cant: 'It was a real count of an unusual week, not a normal year.',
      methods: '1. What is being counted' },

    { id: 'reference-economy', kind: 'concept', group: 'comparing',
      name: 'Reference economy',
      plain: 'The place a result is measured against. Change it and most answers change.',
      how: 'Ontario, Canada, the census division, the region, the metro area, or a group of peers.',
      when: 'Choose the reference that matches the question. A town is not a small Toronto.',
      cant: 'No reference is "correct". Each asks a slightly different question.',
      methods: '6. Reference economies' },

    /* ----------------------------------------------------- reliability */

    { id: 'sampling-error', kind: 'concept', group: 'reliability',
      name: 'Sampling error',
      plain: 'Industry and occupation come from one household in four, so every count is an estimate.',
      how: 'Statistics Canada publishes a 95% range for each count. Typical error is about 1.9 times the square root of the count.',
      when: 'Before saying one number is bigger than another, check the gap is larger than this error.',
      cant: 'The range covers sampling, not everything. Reporting mistakes are not in it.',
      methods: '7.2 Sampling error' },

    { id: 'random-rounding', kind: 'concept', group: 'reliability',
      name: 'Random rounding',
      plain: 'Census counts are rounded to a multiple of 5, up or down, to protect privacy.',
      how: 'Each count moves by up to 4. Its typical error is about 2.',
      when: 'It matters for very small numbers. Below about 25 workers, a count cannot be read.',
      cant: 'It is small beside sampling error for any count above a few dozen.',
      methods: '7.1 Random rounding' },

    { id: 'confidence-interval', kind: 'concept', group: 'reliability',
      name: '95% confidence interval',
      plain: 'The range the true number very probably lies in.',
      how: 'If the survey were repeated many times, 95 in 100 such ranges would contain the true value.',
      when: 'Use it to judge whether two numbers really differ. If their ranges overlap a lot, they may not.',
      cant: 'It is not a guarantee. One time in twenty the true value lies outside it.',
      methods: '7.2 Sampling error' },

    /* ------------------------------------------------- concentration */

    { id: 'location-quotient', kind: 'method', group: 'concentration',
      name: 'Location quotient',
      aka: ['LQ'],
      plain: 'How much more, or less, of an industry a place has than the reference economy.',
      how: 'The industry’s share of jobs here, divided by its share in the reference. Above 1 is more than its share.',
      when: 'Use it to spot what a place specialises in, and to compare places of different sizes.',
      cant: 'It says nothing about growth, profit or whether the industry is worth keeping.',
      bands: [[0.75, 'under-represented'], [1.25, 'about its share'],
              [2.0, 'a specialisation'], [Infinity, 'a strong specialisation']],
      methods: '3.1 Location quotient' },

    { id: 'economic-base', kind: 'method', group: 'concentration',
      name: 'Economic base',
      plain: 'The jobs that sell to the outside world and bring money into a place.',
      how: 'Jobs above the reference share are treated as serving outside demand. The rest serve local needs.',
      when: 'Use it to see what a place lives on, and how many local jobs each export job supports.',
      cant: 'It runs high. It cannot see a place that both imports and exports the same thing.',
      methods: '3.2 Economic base, by location-quotient excess' },

    { id: 'specialisation', kind: 'method', group: 'concentration',
      name: 'Specialisation index',
      aka: ['Krugman index', 'coefficient of specialisation'],
      plain: 'How different a place’s mix of industries is from the reference economy’s.',
      how: 'Add up the gaps between each industry’s share here and in the reference. Zero means the same mix.',
      when: 'Use it to ask whether a place is shaped differently from its region or the province.',
      cant: 'It says a place is different, not in what way, and not whether that is good.',
      methods: '4. Specialisation and diversity' },

    { id: 'diversity', kind: 'method', group: 'concentration',
      name: 'Diversity index',
      aka: ['Shannon entropy'],
      plain: 'How evenly jobs are spread across the twenty industries.',
      how: 'Shannon entropy, scaled so 0 means one industry and 1 means perfectly even.',
      when: 'Use it to judge exposure to one industry’s fortunes.',
      cant: 'A diverse economy is not a strong one. It can be evenly spread and still shrinking.',
      methods: '4. Specialisation and diversity' },

    { id: 'hachman', kind: 'method', group: 'concentration',
      name: 'Hachman index',
      plain: 'How closely a place’s economy resembles the reference economy.',
      how: 'Weights each industry’s share against the reference. 1 means a scale model of it.',
      when: 'Use it to see whether a place is a miniature of its region or something distinct.',
      cant: 'Resembling the province is neither good nor bad in itself.',
      methods: '4. Specialisation and diversity' },

    { id: 'mix-distance', kind: 'method', group: 'comparing',
      name: 'Industry-mix distance',
      plain: 'How different two places’ mixes of industries are, from 0 (identical) to 1 (no overlap).',
      how: 'Half the sum of the gaps between the two places’ industry shares.',
      when: 'Use it to find places shaped like this one, whatever their size.',
      cant: 'Two places can share a mix and still differ completely in size and prospects.',
      methods: '4. Specialisation and diversity' },

    /* ------------------------------------------------------ change */

    { id: 'shift-share', kind: 'method', group: 'change',
      name: 'Shift-share analysis',
      plain: 'Splits a place’s job change into three parts: the wider economy, its mix of industries, and itself.',
      how: 'What the reference economy’s growth alone would give, plus the effect of the starting mix, plus a remainder.',
      when: 'Use it to ask whether a place grew or shrank because of the province, its industries, or local factors.',
      cant: 'It does not say why. It is an accounting split, not a cause, and it cannot forecast.',
      methods: '2.1 Classic three-way decomposition (Dunn 1960)' },

    { id: 'industry-mix-effect', kind: 'method', group: 'change',
      name: 'Industry-mix effect',
      plain: 'The boost or drag from starting out in industries that grew fast or slowly everywhere.',
      how: 'Each industry’s starting jobs times how much faster or slower it grew than the whole reference.',
      when: 'Use it to see how much of a place’s fortune was simply its inheritance.',
      cant: 'It depends on the reference economy and on how industries are grouped.',
      methods: '2.1 Classic three-way decomposition (Dunn 1960)' },

    { id: 'competitive-effect', kind: 'method', group: 'change',
      name: 'Competitive effect',
      plain: 'The part of the change left over once the wider economy and the industry mix are accounted for.',
      how: 'Actual change minus what the reference’s growth in each industry would have delivered.',
      when: 'Use it to find where local performance differed from the same industries elsewhere.',
      cant: 'It is a remainder. A plant closing, a boundary quirk and measurement error all land in it.',
      methods: '2.4 What shift-share cannot do' },

    { id: 'allocation-effect', kind: 'method', group: 'change',
      name: 'Allocation effect',
      plain: 'Whether a place is concentrated in the industries it is doing well in.',
      how: 'Separates specialisation from performance, so a big industry does not inflate the score.',
      when: 'Use it to ask whether a place is specialised in the right things.',
      cant: 'Like the rest of shift-share, it describes a period and does not explain it.',
      methods: '2.2 Competitive and allocation effects (Esteban-Marquillas 1972)' },

    { id: 'chained', kind: 'method', group: 'change',
      name: 'Chained shift-share',
      plain: 'Runs the split one census period at a time, so the starting mix stays current.',
      how: 'Each period uses its own starting weights, and the parts are added up.',
      when: 'Use it over long periods, where a twenty-year-old industry mix would distort the answer.',
      cant: 'Each period still carries the data breaks between censuses.',
      methods: '2.3 Chained decomposition (Barff and Knight 1988)' },

    /* ------------------------------------------------------ impact */

    { id: 'multiplier', kind: 'method', group: 'impact',
      name: 'Input-output multiplier',
      aka: ['Type I', 'Type II'],
      plain: 'How many jobs in total go with each job in an industry, counting its suppliers and its workers’ spending.',
      how: 'Type I counts the supply chain. Type II adds jobs supported by workers spending their wages.',
      when: 'Use it for the rough size of the knock-on effect of a plant opening or closing.',
      cant: 'These are Ontario-wide. A single town keeps less of the effect, and it is not a forecast.',
      methods: '3.4 Input-output impact' },

    { id: 'flegg-webber', kind: 'method', group: 'impact',
      name: 'Flegg-Webber adjustment',
      plain: 'Shrinks a province-wide multiplier to allow for a smaller place buying more from outside.',
      how: 'A factor below 1 that falls as the place gets smaller relative to Ontario.',
      when: 'Use it whenever a provincial multiplier is applied to one municipality.',
      cant: 'It reduces the overstatement. It does not remove it.',
      methods: '3.3 Flegg-Webber size adjustment' },

    /* ----------------------------------------------------- space */

    { id: 'morans-i', kind: 'method', group: 'space',
      name: 'Moran’s I',
      plain: 'Whether places near each other tend to have similar values.',
      how: 'Compares each place with its six nearest neighbours, then checks against thousands of random shuffles.',
      when: 'Use it to ask whether a pattern is regional or scattered.',
      cant: 'It says a pattern is clustered, not why, and not where.',
      methods: '11. Spatial dependence' },

    { id: 'lisa', kind: 'method', group: 'space',
      name: 'Local clusters (LISA)',
      aka: ['local Moran’s I'],
      plain: 'Which particular places sit in a cluster, or stand out from their neighbours.',
      how: 'A Moran test for each place, corrected so hundreds of tests do not find clusters in noise.',
      when: 'Use it to find the places that are unlike their surroundings.',
      cant: 'A place deep inside a large hot area can show nothing, because it resembles its neighbours.',
      methods: '11. Spatial dependence' },

    { id: 'getis-ord', kind: 'method', group: 'space',
      name: 'Hot and cold spots (Getis-Ord)',
      aka: ['Gi*'],
      plain: 'Where high or low values pool together across neighbouring places.',
      how: 'Adds up each place and its neighbours, and asks whether that total is unusually high or low.',
      when: 'Use it to ask where something is concentrated across a region.',
      cant: 'It finds pooling. It does not find places that stand apart from their neighbours.',
      methods: '11. Spatial dependence' },

    { id: 'false-discovery', kind: 'concept', group: 'space',
      name: 'False discovery rate',
      plain: 'A correction so that running hundreds of tests does not find patterns in pure chance.',
      how: 'Tightens the threshold for each test according to how many are run at once.',
      when: 'Any time many places are each tested for the same thing.',
      cant: 'It controls the share of false findings. It does not make any single one certain.',
      methods: '11. Spatial dependence' },

    /* ----------------------------------------------- labour markets */

    { id: 'jobs-ratio', kind: 'method', group: 'labour',
      name: 'Jobs per resident worker',
      plain: 'How many jobs a place has for each of its own working residents.',
      how: 'Jobs located here, divided by residents who work at home or at a usual workplace.',
      when: 'Above 1 is an employment centre that draws people in. Below 1 is a place people commute out of.',
      cant: 'It cannot say who fills the jobs. A ratio of 1 can hide heavy commuting both ways.',
      methods: '1. What is being counted' },

    { id: 'self-containment', kind: 'method', group: 'labour',
      name: 'Self-containment',
      plain: 'The share of a place’s working residents who also work there.',
      how: 'Residents who live and work in the place, divided by all residents with a usual workplace.',
      when: 'Use it to judge whether a place is a labour market in its own right.',
      cant: 'It leaves out everyone who worked from home, which in May 2021 was many people.',
      methods: '12.1 Travel-to-work areas' },

    { id: 'ttwa', kind: 'method', group: 'labour',
      name: 'Travel-to-work area',
      plain: 'A labour market drawn by where people actually commute, not by municipal borders.',
      how: 'Places are merged step by step until each area mostly keeps its own workers.',
      when: 'Use it when the question is about a labour market, which rarely stops at a boundary.',
      cant: 'These boundaries are indicative, not official, and built from 2021 commuters only.',
      methods: '12.1 Travel-to-work areas' },

    { id: 'peers', kind: 'method', group: 'comparing',
      name: 'Peer places',
      plain: 'The places most like this one, chosen by several measures at once.',
      how: 'Places of a similar kind, ranked by a distance that stops related measures counting twice.',
      when: 'Use it to compare a place fairly, against others that could reasonably be alike.',
      cant: 'Being alike says nothing about which of them is doing well.',
      methods: '5. Peer selection' },

    /* ----------------------------------------------------- people */

    { id: 'natural-increase', kind: 'concept', group: 'demography',
      name: 'Natural increase',
      plain: 'Births minus deaths. When deaths are higher, it is called natural decrease.',
      how: 'Counted each year by census division, alongside the migration streams.',
      when: 'Use it to see whether a place could grow without people moving in.',
      cant: 'It is published for census divisions, not municipalities.',
      methods: '13. Demography' },

    { id: 'components', kind: 'concept', group: 'demography',
      name: 'Components of population change',
      plain: 'The separate streams behind population change: births, deaths, and people moving in and out.',
      how: 'Births and deaths, plus moves within Ontario, from other provinces and from abroad.',
      when: 'Use it to see why a place grew. Each stream has different causes and different levers.',
      cant: 'By census division only, and the latest years are preliminary estimates.',
      methods: '13. Demography' }
  ];

  T.byId = {};
  T.list.forEach(function (t) { T.byId[t.id] = t; });

  /* The method map: the question someone brings, and the method that answers
     it. Built from the terms, so it cannot disagree with them. */
  T.map = [
    { q: 'Are we unusually dependent on one industry?',
      ids: ['location-quotient', 'specialisation', 'diversity'] },
    { q: 'What does this place live on?',
      ids: ['economic-base'] },
    { q: 'Did we gain or lose jobs because of the province, our industries, or ourselves?',
      ids: ['shift-share', 'industry-mix-effect', 'competitive-effect'] },
    { q: 'Are we concentrated in the industries we are good at?',
      ids: ['allocation-effect'] },
    { q: 'What happens if a plant opens or closes?',
      ids: ['multiplier', 'flegg-webber'] },
    { q: 'Is this pattern regional, or just this place?',
      ids: ['morans-i', 'lisa', 'getis-ord'] },
    { q: 'Where does our labour market actually stop?',
      ids: ['ttwa', 'self-containment', 'jobs-ratio'] },
    { q: 'Who should we compare ourselves with?',
      ids: ['peers', 'mix-distance'] },
    { q: 'Why did the population change?',
      ids: ['components', 'natural-increase'] },
    { q: 'Can I trust this number?',
      ids: ['sampling-error', 'confidence-interval', 'random-rounding'] }
  ];

  T.GROUP = {
    counting: 'What is being counted', comparing: 'Comparing places',
    reliability: 'How far to trust a number', concentration: 'Concentration',
    change: 'Change over time', impact: 'Impact',
    space: 'Patterns across space', labour: 'Labour markets',
    demography: 'Population'
  };

  /* A plain reading of a location quotient, used wherever one is shown. */
  T.lqBand = function (lq) {
    if (lq == null || !isFinite(lq)) return null;
    var b = T.byId['location-quotient'].bands;
    for (var i = 0; i < b.length; i++) if (lq < b[i][0]) return b[i][1];
    return b[b.length - 1][1];
  };

  /* ---------------------------------------------------------- fading

     Scaffolding that helps a novice gets in an expert's way (the expertise
     reversal effect - Kalyuga et al. 2003), so the plain layer fades as a
     term is learned. A term fades when it has HELD: answered correctly in the
     quiz at a review at least a week after it was first met - the same test
     of "learned" the quiz uses everywhere. A reader can also fade a term by
     hand ("I know this") or bring it back ("explain again").

     Kept per device in localStorage. Every read and write is guarded: a
     private window or blocked storage must leave the tool fully usable, with
     every explanation simply shown in full. */
  var KEY = 'hinterland.terms.v1';
  var state = null;

  function load() {
    if (state) return state;
    state = {};
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      if (raw) state = JSON.parse(raw) || {};
    } catch (e) { state = {}; }
    return state;
  }
  function save() {
    try {
      if (root.localStorage) root.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* storage unavailable: nothing is lost but the memory */ }
  }

  T.record = function (id, event) {
    var s = load();
    var r = s[id] || (s[id] = { met: 0, opened: 0, first: Date.now() });
    if (event === 'met') r.met++;
    if (event === 'opened') r.opened++;
    if (event === 'held') r.held = Date.now();
    if (event === 'know') r.manual = 'faded';
    if (event === 'again') r.manual = 'shown';
    save();
  };

  /* Has the plain layer faded for this term? */
  T.faded = function (id) {
    var r = load()[id];
    if (!r) return false;
    if (r.manual === 'shown') return false;
    if (r.manual === 'faded') return true;
    return !!r.held;
  };

  T.status = function (id) {
    var r = load()[id];
    if (!r) return 'new';
    if (T.faded(id)) return r.manual === 'faded' ? 'known' : 'learned';
    return r.met || r.opened ? 'meeting' : 'new';
  };

  T.counts = function () {
    var c = { new: 0, meeting: 0, learned: 0, known: 0 };
    T.list.forEach(function (t) { c[T.status(t.id)]++; });
    return c;
  };

  root.GRA = root.GRA || {};
  root.GRA.terms = T;
}(this));
