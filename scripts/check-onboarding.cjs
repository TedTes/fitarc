require('./lib/load-typescript.cjs');
const assert=require('node:assert/strict');
const {prepareOnboardingTraining}=require('../src/runtime/onboarding.ts');
const {emptyRuntimeState}=require('../src/runtime/runtimePersistence.ts');
const {RUNTIME_EXERCISES}=require('../src/runtime/exerciseCatalog.ts');
const {previewTrainingSessionDetailed}=require('../src/runtime/runtimeService.ts');
const {matchesGroup,GROUP_TEMPLATES}=require('../src/runtime/exercisePools.ts');
const {localDate}=require('../src/runtime/planDates.ts');
const {toStoredTraining,fromStoredTraining}=require('../src/runtime/trainingState.ts');
for(const pattern of ['upper_lower','push_pull_legs','full_body']) {
 for(const equipmentLevel of ['full_gym','dumbbells']) {
  const initial={...emptyRuntimeState(),catalog:RUNTIME_EXERCISES};
  const user={id:'onboarding-test',name:'Test',trainingSplit:pattern,experienceLevel:'beginner',planPreferences:{primaryGoal:'build_muscle',daysPerWeek:4,sessionMinutes:45,equipmentLevel,injuries:equipmentLevel==='full_gym'?['knee']:[]}};
  const prepared=prepareOnboardingTraining(initial,user,()=>0.4);
  assert.equal(initial.block,null);
  assert.equal(prepared.activeSession,null);
  assert.equal(prepared.sessions.length,0);
  const first=GROUP_TEMPLATES[pattern][0];
  const context={date:localDate(),minutesAvailable:45,recovery:'yes',unavailableEquipment:[],unavailableExerciseIds:[]};
  const preview=previewTrainingSessionDetailed(prepared,context);
  assert.equal(preview.slot.label,first.name);
  assert(preview.prescription.exercises.length>0);
  for(const {exercise} of preview.prescription.exercises){
   assert(matchesGroup(exercise,first));
   assert(!exercise.contraindications.some(tag=>user.planPreferences.injuries.includes(tag)));
   assert(exercise.equipment.every(e=>prepared.source.equipment.includes(e)));
  }
  const restored={...fromStoredTraining(toStoredTraining(prepared)),catalog:RUNTIME_EXERCISES};
  assert.deepEqual(restored.source.routine,prepared.source.routine);
  assert.equal(prepareOnboardingTraining(prepared,user),prepared,'never regenerate saved training');
  assert.deepEqual(previewTrainingSessionDetailed(restored,context).prescription.exercises.map(e=>e.exercise.id),preview.prescription.exercises.map(e=>e.exercise.id));
 }
}
assert.throws(()=>prepareOnboardingTraining({...emptyRuntimeState(),catalog:[]},{id:'empty',trainingSplit:'upper_lower',planPreferences:{daysPerWeek:4,sessionMinutes:45,equipmentLevel:'full_gym'} }),/No upper exercises/);
console.log('Onboarding passed: three patterns, equipment and injury constraints, first group, no auto-start, stable persisted suggestions, no regeneration.');
