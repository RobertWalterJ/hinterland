/* What a minimum gap costs and buys.

   Audit 2 found a third of a fortnight's asks landing the day after the last
   sighting. The fix is a minimum gap, but a gap trades coverage against
   consolidation: the wider it is, the more questions a player meets and the
   weaker each memory is when it comes back. This sweeps the parameter and
   prints both sides, so the choice is made on numbers rather than on taste.

   It edits app/js/quiz-sched.js in place, runs the two existing studies for
   each value, and ALWAYS puts the file back (including on a crash).

   Run:  node pipeline/audits/gap_sweep.js  [2 3 4 ...]
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SCHED = path.join(ROOT, 'app', 'js', 'quiz-sched.js');
const original = fs.readFileSync(SCHED, 'utf8');
const values = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const GAPS = values.length ? values : [1, 2, 3, 4];

function setGap(n) {
  const out = original.replace(/minGapDays: \d+,/, 'minGapDays: ' + n + ',');
  if (out === original && n !== 3) throw new Error('minGapDays not found');
  fs.writeFileSync(SCHED, out);
}

function run(script, args) {
  const out = execFileSync('node', [path.join(__dirname, '..', script)].concat(args || []),
                           { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf('{')));
}

const rows = [];
try {
  for (const g of GAPS) {
    setGap(g);
    const sp = run('audits/spacing.js', ['--json']);
    const sim = run('quiz_simulate.js', []);
    const held = sim.runs.map((r) => r.learnedHeldAtNextReview || 0);
    const ideas = sim.runs.map((r) => r.ideasLearned);
    rows.push({
      gapDays: g,
      distinct: sp.distinct, seen5plus: sp.seen5,
      consecutivePct: Math.round(100 * sp.consecutiveDay / sp.asks),
      metMean: +(sim.runs.reduce((a, r) => a + r.seen, 0) / sim.runs.length).toFixed(1),
      heldMean: +(held.reduce((a, b) => a + b, 0) / held.length).toFixed(3),
      heldMin: +Math.min.apply(null, held).toFixed(3),
      ideasMin: Math.min.apply(null, ideas),
      dueShareMax: +Math.max.apply(null, sim.runs.map((r) => r.dueShareLate)).toFixed(3)
    });
  }
} finally {
  fs.writeFileSync(SCHED, original);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows }, null, 2));
} else {
  console.log('=== minimum gap: what it costs and what it buys ===\n');
  console.log('  gap  distinct  seen5+  next-day  met(90d)  held  heldMin  ideasMin  backlog');
  rows.forEach((r) => {
    console.log('  ' + String(r.gapDays).padStart(3) + String(r.distinct).padStart(10) +
      String(r.seen5plus).padStart(8) + (r.consecutivePct + '%').padStart(10) +
      String(r.metMean).padStart(10) + (Math.round(100 * r.heldMean) + '%').padStart(6) +
      (Math.round(100 * r.heldMin) + '%').padStart(9) + String(r.ideasMin).padStart(10) +
      String(r.dueShareMax).padStart(9));
  });
  console.log('\n  distinct / seen5+ / next-day: one fortnight of keen play (spacing.js)');
  console.log('  met / held / ideas / backlog: 90 days, 7 seeded learners (quiz_simulate.js)');
  console.log('  the build requires held mean >= 0.60, held min >= 0.50, backlog <= 0.67');
}
