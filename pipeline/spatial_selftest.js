/* Drive app/js/spatial.js and app/js/ttwa.js under Node against cases where
   the right answer is known by construction, and print a JSON verdict for
   pipeline/validate.py to assert on. */
'use strict';
const fs = require('fs');
const path = require('path');
globalThis.window = globalThis;
const geval = eval;
geval(fs.readFileSync(path.join(__dirname, '..', 'app', 'js', 'spatial.js'), 'utf8'));
geval(fs.readFileSync(path.join(__dirname, '..', 'app', 'js', 'ttwa.js'), 'utf8'));
const SP = globalThis.GRA.spatial, TT = globalThis.GRA.ttwa;

const pts = [];
for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) {
  pts.push({ lat: 43 + r * 0.25, lon: -80 + c * 0.25 });
}
const W = SP.knnWeights(pts, 4);
const gradient = [], checker = [];
for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) {
  gradient.push(r); checker.push((r + c) % 2);
}
let s = 42;
const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const random = Array.from({ length: pts.length }, rnd);

const mg = SP.moranI(gradient, W, { permutations: 499, seed: 7 });
const mc = SP.moranI(checker, W, { permutations: 499, seed: 7 });
const mr = SP.moranI(random, W, { permutations: 499, seed: 7 });
const m1 = SP.moranI(gradient, W, { permutations: 499, seed: 7 });
const li = SP.lisa(gradient, W, { permutations: 499, seed: 7 });
const go = SP.getisOrd(gradient, W, {});

/* Two clearly separate labour markets: A/B commute to each other, C/D to each
   other, and almost nobody crosses between the pairs. */
const flows = [
  { o: 'A', d: 'A', w: 7000 }, { o: 'A', d: 'B', w: 3000 },
  { o: 'B', d: 'B', w: 6000 }, { o: 'B', d: 'A', w: 3000 },
  { o: 'C', d: 'C', w: 7000 }, { o: 'C', d: 'D', w: 3000 },
  { o: 'D', d: 'D', w: 6000 }, { o: 'D', d: 'C', w: 3000 },
  { o: 'A', d: 'C', w: 40 }, { o: 'C', d: 'A', w: 40 }
];
const t = TT.build(flows, { targetContainment: 0.70, minWorkers: 2000 });
const groups = t.areas.map(a => a.members.slice().sort().join('')).sort();

console.log(JSON.stringify({
  moranGradient: mg.I, pGradient: mg.p,
  moranChecker: mc.I, pChecker: mc.p,
  moranRandom: mr.I, pRandom: mr.p, expected: mr.expected,
  deterministic: Math.abs(mg.I - m1.I) < 1e-12 && mg.p === m1.p,
  lisaCounts: li.counts, lisaFdr: li.fdrCritical,
  getisBands: go.rows.reduce((a, o) => { a[o.band] = (a[o.band] || 0) + 1; return a; }, {}),
  normCdf196: SP.normCdf(1.96), normCdf0: SP.normCdf(0),
  ttwaGroups: groups, ttwaCount: t.areas.length,
  ttwaContainment: t.areas.map(a => +a.containment.toFixed(3)).sort(),
  weightsEveryRowFilled: W.every(r => r.nb.length === 4)
}));
