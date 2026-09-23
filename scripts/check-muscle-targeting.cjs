// Pure display contracts: exercise roles must match the catalog and every target must be visible.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const loadData = (file) => {
  const exports = {};
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  // These modules contain only data and pure helpers; type-only imports are erased.
  new Function('exports', outputText)(exports);
  return exports;
};
const { RUNTIME_EXERCISES } = loadData('src/runtime/exerciseCatalog.ts');
const { MUSCLE_MASKS, MUSCLE_MAP_SIZE } = loadData('src/screens/runtime/muscleMasks.ts');
const { muscleTargetRole, preferredTargetView, isMuscleVisible, viewForMuscle } = loadData('src/screens/runtime/muscleTargeting.ts');
const exercise = (id) => RUNTIME_EXERCISES.find((item) => item.id === id);

assert.equal(preferredTargetView(exercise('bench_press')), 'front');
assert.equal(preferredTargetView(exercise('romanian_deadlift')), 'back');
assert.equal(preferredTargetView(exercise('seated_leg_curl')), 'back');
assert.equal(preferredTargetView(exercise('back_squat')), 'front');
assert.equal(preferredTargetView(exercise('triceps_pressdown')), 'back');
assert.equal(muscleTargetRole(exercise('bench_press'), 'chest'), 'primary');
assert.equal(muscleTargetRole(exercise('bench_press'), 'triceps'), 'secondary');
assert.equal(muscleTargetRole(exercise('bench_press'), 'quads'), null);
assert.equal(muscleTargetRole({ primaryMuscles: ['back'], secondaryMuscles: ['back'] }, 'back'), 'primary');
assert.equal(viewForMuscle('hamstrings', 'front'), 'back');
assert.equal(viewForMuscle('calves', 'back'), 'back');

const groups = new Set(Object.values(MUSCLE_MASKS).flat().map((mask) => mask.muscle));
for (const view of ['front', 'back']) {
  const visible = new Set(MUSCLE_MASKS[view].map((mask) => mask.muscle));
  for (const group of groups) assert.equal(isMuscleVisible(group, view), visible.has(group), `${group} visibility on ${view}`);
  const image = fs.readFileSync(path.join(root, `assets/images/muscle-map/athlete-${view}-v2.png`));
  assert.equal(image.readUInt32BE(16), MUSCLE_MAP_SIZE.width, `${view} image/overlay width`);
  assert.equal(image.readUInt32BE(20), MUSCLE_MAP_SIZE.height, `${view} image/overlay height`);
}
for (const lift of RUNTIME_EXERCISES) {
  for (const muscle of [...lift.primaryMuscles, ...lift.secondaryMuscles]) {
    assert(groups.has(muscle), `${lift.name}: ${muscle} has no visible muscle mask`);
  }
  assert(lift.primaryMuscles.some((muscle) => isMuscleVisible(muscle, preferredTargetView(lift))), `${lift.name}: default view hides all primary targets`);
}
console.log(`Muscle targeting contracts passed for ${RUNTIME_EXERCISES.length} exercises and both registered images.`);
