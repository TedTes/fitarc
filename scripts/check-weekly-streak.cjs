require('./lib/load-typescript.cjs');
const assert = require('node:assert/strict');
const { weeklyStreak } = require('../src/runtime/weeklyStreak.ts');
const { localDate } = require('../src/runtime/planDates.ts');
assert.equal(weeklyStreak([], '2026-10-19'), 0);
assert.equal(weeklyStreak(['2026-10-12','2026-10-15','2026-10-18'], '2026-10-18'), 1, 'Monday, Thursday and Sunday belong to the same week');
assert.equal(weeklyStreak(['2026-10-11','2026-10-12'], '2026-10-12'), 2, 'Sunday/Monday crosses a week boundary');
assert.equal(weeklyStreak(['2026-10-05','2026-10-12','2026-10-12'], '2026-10-19'), 2, 'Grace for this unfinished week and no duplicate counting');
assert.equal(weeklyStreak(['2026-10-05'], '2026-10-19'), 0, 'Missing a full week breaks the streak');
assert.equal(weeklyStreak(['2026-12-27','2026-12-28','2027-01-04'], '2027-01-04'), 3);
assert.equal(weeklyStreak(['2026-10-19'], '2026-10-18'), 0, 'Future workouts cannot extend the streak');
for (const zone of ['America/Toronto','Pacific/Auckland','Asia/Tokyo']) {
  process.env.TZ=zone;
  const sunday=new Date(2026,9,18,23,59),monday=new Date(2026,9,19,0,1);
  assert.equal(weeklyStreak(['2026-10-11','2026-10-18'],localDate(sunday)),2);
  assert.equal(weeklyStreak(['2026-10-11','2026-10-18','2026-10-19'],localDate(monday)),3);
  assert.equal(weeklyStreak(['2026-03-02','2026-03-09'],localDate(new Date(2026,2,9))),2,'DST does not alter week length');
}
console.log('Weekly streak: Monday boundaries, grace week, gaps, duplicates, year change, local midnight and DST passed.');
