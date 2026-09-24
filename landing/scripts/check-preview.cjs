// Guard the landing's display snapshots and small solver against drift from the app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const cache = new Map();
function load(relative) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const requireData = specifier => {
    // muscleParts only needs the catalog from the native runtime barrel.
    if (file === path.join(root, 'src/screens/runtime/muscleParts.ts') && specifier === '../../runtime') {
      return load('src/runtime/exerciseCatalog.ts');
    }
    assert(specifier.startsWith('.'), `Unexpected dependency: ${specifier}`);
    return load(path.resolve(path.dirname(file), `${specifier}.ts`));
  };
  new Function('exports', 'require', outputText)(exports, requireData);
  return exports;
}
const catalog = load('src/runtime/exerciseCatalog.ts').RUNTIME_EXERCISES;
const preview = load('landing/lib/previewExercises.ts').PREVIEW_EXERCISES;
assert.equal(preview.length, catalog.length);
for (const exercise of preview) {
  const original = catalog.find(item => item.id === exercise.id);
  assert(original, exercise.id);
  for (const key of Object.keys(exercise)) assert.deepEqual(exercise[key], original[key], `${exercise.id}.${key}`);
}
const appMasks = load('src/screens/runtime/muscleMasks.ts');
assert.deepEqual(load('landing/lib/muscleMasks.ts'), appMasks);
for (const view of ['front', 'back']) {
  assert.deepEqual(fs.readFileSync(path.join(root, `landing/public/images/muscle-map/athlete-${view}-v2.png`)), fs.readFileSync(path.join(root, `assets/images/muscle-map/athlete-${view}-v2.png`)));
}
const { liftsForPart } = load('src/screens/runtime/muscleParts.ts');
const { liftsFor } = load('landing/lib/muscleParts.ts');
const allIds = new Set(catalog.map(item => item.id));
for (const mask of Object.values(appMasks.MUSCLE_MASKS).flat()) {
  if (!mask.label) continue;
  assert.deepEqual(liftsFor(mask.muscle, mask.part).map(({ exercise, role }) => ({ name: exercise.name, role })), liftsForPart(mask.part, allIds), mask.part);
}
const policy = load('src/runtime/trainingPolicy.ts');
const solver = load('src/runtime/setSolver.ts');
const display = load('landing/lib/previewSolver.ts');
assert.equal(display.secondaryMuscleCredit, policy.secondaryMuscleCredit);
let cases = 0;
for (const loadKg of [0, 10, 42.5, 100]) for (const incrementKg of [0.5, 1, 2, 2.5, 5]) {
  for (let reps = 0; reps <= 15; reps++) for (let rir = 0; rir <= 4; rir++) for (const phase of ['accumulate', 'deload']) {
    const result = { prescribedLoadKg: loadKg, prescribedMinReps: 8, prescribedMaxReps: 12, completedReps: reps, reportedRir: rir };
    assert.equal(display.nextLoad({ load: loadKg, reps, rir, minReps: 8, maxReps: 12, incrementKg, deload: phase === 'deload' }), solver.solveNextSet({ result, phase, incrementKg }).nextLoadKg);
    assert.equal(display.hardSetCredit(rir, 3), policy.hardSetCredit(rir, 3));
    cases++;
  }
}
const { weekStatus } = load('landing/lib/exampleWeek.ts');
assert.equal(weekStatus({ min: 8, max: 14 }, 7).label, '1 under');
assert.equal(weekStatus({ min: 8, max: 14 }, 8).label, 'in range');
assert.equal(weekStatus({ min: 8, max: 14 }, 14).label, 'high');
assert.equal(weekStatus({ min: 8, max: 14 }, 15).label, '1 over');
console.log(`Preview parity passed: ${preview.length} exercises, both registered images and masks, part mappings, and ${cases} solver cases.`);
