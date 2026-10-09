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
  // These modules contain only data and pure helpers; type-only imports are erased, relative ones resolve here.
  const localRequire = (spec) => loadData(path.join(path.dirname(file), `${spec}.ts`));
  new Function('exports', 'require', outputText)(exports, localRequire);
  return exports;
};
/** Width and height from a baseline/progressive JPEG's SOF segment. */
const jpegSize = (buf) => {
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const length = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  throw new Error('no JPEG size marker');
};
const { RUNTIME_EXERCISES } = loadData('src/runtime/exerciseCatalog.ts');
const { MUSCLE_MASKS, MUSCLE_MAP_SIZES } = loadData('src/screens/runtime/muscleMasks.ts');
const artwork = fs.readFileSync(path.join(root, 'src/components/athleteArtwork.ts'), 'utf8').split('export const MUSCLE_MAP_ARTWORK')[1];
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
  // Inspect the artwork actually imported by the component, including PNG's native dimensions.
  const source = artwork.match(new RegExp(`${view}: require\\('([^']+)'\\)`))?.[1];
  assert(source, `${view} artwork must be registered`);
  const bytes = fs.readFileSync(path.resolve(root, 'src/components', source));
  const image = bytes.subarray(1, 4).toString() === 'PNG'
    ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
    : jpegSize(bytes);
  assert.equal(image.width, MUSCLE_MAP_SIZES[view].width, `${view} image/overlay width`);
  assert.equal(image.height, MUSCLE_MAP_SIZES[view].height, `${view} image/overlay height`);
  const ids = MUSCLE_MASKS[view].map(mask => mask.part);
  assert.equal(new Set(ids).size, ids.length, `${view} regions must have unique identities`);
  for (const mask of MUSCLE_MASKS[view]) {
    assert(mask.visible && mask.hit, `${view}/${mask.part} needs visible and touch regions`);
  }
}
// The upper-back detail and both calf heads must remain separately selectable.
for (const part of ['infraspinatus', 'teres_minor', 'teres_major', 'erectors', 'gastrocnemius_medial', 'gastrocnemius_lateral']) {
  assert(MUSCLE_MASKS.back.some(mask => mask.part === part), `missing back detail: ${part}`);
}
assert(MUSCLE_MASKS.back.find(mask => mask.part === 'glute_max').covered, 'glutes are covered by shorts');
for (const lift of RUNTIME_EXERCISES) {
  for (const muscle of [...lift.primaryMuscles, ...lift.secondaryMuscles]) {
    assert(groups.has(muscle), `${lift.name}: ${muscle} has no visible muscle mask`);
  }
  assert(lift.primaryMuscles.some((muscle) => isMuscleVisible(muscle, preferredTargetView(lift))), `${lift.name}: default view hides all primary targets`);
}
console.log(`Muscle targeting contracts passed for ${RUNTIME_EXERCISES.length} exercises and both registered images.`);
