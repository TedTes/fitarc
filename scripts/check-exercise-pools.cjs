require('./lib/load-typescript.cjs');
const assert=require('node:assert/strict');
const {RUNTIME_EXERCISES:catalog}=require('../src/runtime/exerciseCatalog.ts');
const {emptyDraft,sourceFromDraft,draftFromRoutine}=require('../src/routineSetup/draft.ts');
const {groupDraft,suggestPoolExercises}=require('../src/routineSetup/pools.ts');
const {selectPoolPlans,GROUP_TEMPLATES,matchesGroup}=require('../src/runtime/exercisePools.ts');
const {emptyRuntimeState}=require('../src/runtime/runtimePersistence.ts');
const {compileTrainingBlock,previewTrainingSession,solveTrainingSession,recordRuntimeSet,skipRemainingRuntimeSets,commitRuntimeSession,skipRuntimeExercise,substituteRuntimeExercise,getSwapCandidates,addRuntimeExercise,reorderRuntimeExercises,finishAndUpdateRoutine}=require('../src/runtime/runtimeService.ts');
const {nextRoutineSlot}=require('../src/runtime/sequence.ts');
const {nextWorkoutPreview}=require('../src/runtime/nextWorkout.ts');
const {computeWeeklyStatus}=require('../src/runtime/status.ts');
const {localDate,datePlusDays}=require('../src/runtime/planDates.ts');
const {toStoredTraining,fromStoredTraining}=require('../src/runtime/trainingState.ts');
const {editableRoutine}=require('../src/runtime/routine.ts');
const source={id:'pool-source',userId:'pool-user',version:1,goal:'hypertrophy',experience:'intermediate',daysPerWeek:4,sessionMinutes:60,equipment:[...new Set(catalog.flatMap(e=>e.equipment))],excludedExerciseIds:[],limitations:[],seedWorkingSets:[],createdAt:new Date().toISOString()};
const date=localDate(),context={date,minutesAvailable:60,recovery:'yes',unavailableEquipment:[],unavailableExerciseIds:[]};
const makeDraft=pattern=>{let draft=groupDraft(emptyDraft(),pattern,catalog);draft.workouts.forEach(w=>{draft=suggestPoolExercises(draft,w.id,source,catalog);});return draft;};
const makeState=pattern=>compileTrainingBlock({...emptyRuntimeState(),catalog},sourceFromDraft(makeDraft(pattern),source,catalog));
const ids=session=>session.exercises.map(e=>e.exercise.id);
const logFirst=state=>{const session=state.activeSession,e=session.exercises[0],set=e.sets.find(s=>s.status==='pending');return recordRuntimeSet(state,{prescriptionId:session.id,setId:set.id,exerciseId:e.exercise.id,prescribedLoadKg:set.loadKg,actualLoadKg:40,prescribedMinReps:set.minReps,prescribedMaxReps:set.maxReps,targetRir:set.targetRir,completedReps:10,reportedRir:2,completedAt:new Date().toISOString()});};
let ready=makeState('upper_lower'),before=JSON.stringify(ready);
assert.deepEqual(ready.block.slots.map(s=>s.label),['Upper','Lower']);
const p=previewTrainingSession(ready,context);
assert.deepEqual(ids(p),ids(previewTrainingSession(ready,context)));
assert.equal(JSON.stringify(ready),before,'preview is read-only');
assert(p.exercises.length<=5&&p.exercises.length>1);
assert(p.estimatedMinutes<=60);
assert(p.exercises.every(e=>matchesGroup(e.exercise,GROUP_TEMPLATES.upper_lower[0])));
assert(ready.block.slots[0].plannedExercises.length>p.exercises.length,'pool is bigger than the session');
assert(computeWeeklyStatus(ready.block,[],[]).muscles.every(m=>m.completedSets===0),'pool and preview never credit actual progress');
assert.equal(nextRoutineSlot(ready.block,[p],date).label,'Upper','opening does not advance');
assert.equal(nextRoutineSlot(ready.block,[{...p,status:'committed'}],date).label,'Upper','empty completion does not advance');
let active=solveTrainingSession(ready,context);assert.deepEqual(ids(active.activeSession),ids(p));
let logged=logFirst(active),finished=commitRuntimeSession(skipRemainingRuntimeSets(logged));
assert.equal(nextRoutineSlot(finished.block,finished.sessions,datePlusDays(date,12)).label,'Lower','rest days do not advance');
const preview=nextWorkoutPreview(finished,date);
const lower=previewTrainingSession(finished,{...context,date:preview.date});
assert.deepEqual(preview.exercises.map(e=>e.exercise.id),ids(lower),'next preview and actual proposal agree');
assert.deepEqual(preview.exercises.map(e=>e.sets),lower.exercises.map(e=>e.sets.length));
assert(lower.exercises.every(e=>matchesGroup(e.exercise,GROUP_TEMPLATES.upper_lower[1])));
finished=commitRuntimeSession(skipRemainingRuntimeSets(logFirst(solveTrainingSession(finished,{...context,date:datePlusDays(date,1)}))));
assert.equal(nextRoutineSlot(finished.block,finished.sessions).label,'Upper');
for(const pattern of ['push_pull_legs','full_body']){
 const state=makeState(pattern);assert.deepEqual(state.block.slots.map(s=>s.label),GROUP_TEMPLATES[pattern].map(g=>g.name));
 for(let i=0;i<state.block.slots.length;i++){
   const session=previewTrainingSession(state,{...context,workoutId:state.block.slots[i].id});
   assert(session.exercises.every(e=>matchesGroup(e.exercise,GROUP_TEMPLATES[pattern][i])));
 }
}
// Constraints and time cannot be bypassed by an exercise pool.
const blocked=p.exercises[0].exercise.id;
const limited=previewTrainingSession(ready,{...context,minutesAvailable:20,unavailableExerciseIds:[blocked]});
assert(limited.estimatedMinutes<=20&&!ids(limited).includes(blocked));
const constrained={...ready,source:{...ready.source,excludedExerciseIds:[blocked],equipment:ready.source.equipment.filter(e=>e!=='barbell')}};
assert(previewTrainingSession(constrained,context).exercises.every(e=>e.exercise.id!==blocked&&!e.exercise.equipment.includes('barbell')));
// Session-only mutations retain both logged work and the saved pool.
const routineBefore=JSON.stringify(logged.source.routine),setBefore=JSON.stringify(logged.setResults);
const target=logged.activeSession.exercises[0].exercise.id;
const swapped=substituteRuntimeExercise(logged,target,getSwapCandidates(logged,target)[0].id);
assert.equal(JSON.stringify(swapped.source.routine),routineBefore);assert.equal(JSON.stringify(swapped.setResults),setBefore);
const skipped=skipRuntimeExercise(logged,target,false);
assert.equal(skipped.activeSession.exercises[0].sets.filter(s=>s.status==='completed').length,1);
assert(!skipped.activeSession.exercises[0].sets.some(s=>s.status==='pending'));
assert.equal(JSON.stringify(skipped.source.routine),routineBefore);
const extra=catalog.find(e=>!ids(logged.activeSession).includes(e.id));
const added=addRuntimeExercise(logged,{exerciseId:extra.id,sets:2,minReps:8,maxReps:12,targetRir:2});
const ordered=reorderRuntimeExercises(added,[...ids(added.activeSession)].reverse());
assert.equal(JSON.stringify(ordered.source.routine),routineBefore);assert.equal(JSON.stringify(ordered.setResults),setBefore);
const updatedPool=finishAndUpdateRoutine(skipRemainingRuntimeSets(logged));
assert.deepEqual(updatedPool.source.routine.workouts.map(w=>w.exercises.map(e=>e.exerciseId)),ready.source.routine.workouts.map(w=>w.exercises.map(e=>e.exerciseId)),'explicit routine update does not discard unselected pool exercises');
const actual=computeWeeklyStatus(finished.block,finished.sessions,finished.setResults);
assert(actual.muscles.some(m=>m.completedSets>0),'completed sets feed Progress');
const restored=fromStoredTraining(toStoredTraining(ready));
assert.equal(restored.source.routine.selectionMode,'pools');
assert.deepEqual(draftFromRoutine(editableRoutine(restored.block),restored.source,catalog).workouts.map(w=>w.exercises.length),makeDraft('upper_lower').workouts.map(w=>w.exercises.length));
// Deterministic rotation of equivalent accessories, with a stable main lift and priority to coverage.
const definitions=[catalog.find(e=>e.id==='back_squat'),...['a','b','c'].map(id=>({...catalog.find(e=>e.id==='calf_raise'),id}))];
const plans=definitions.map(e=>({exerciseId:e.id,sets:3,selection:{reasons:[]}}));
const slot={id:'rotation',label:'Lower',targetMuscles:['quads','calves'],plannedExercises:plans};
const first=selectPoolPlans(slot,source,definitions,{...context,minutesAvailable:30});
const history=[{status:'committed',context,createdAt:'2026-01-01',exercises:first.map(p=>({exercise:definitions.find(e=>e.id===p.exerciseId),sets:[{status:'completed',result:{completedReps:10}}]}))}];
const second=selectPoolPlans(slot,source,definitions,{...context,minutesAvailable:30},history);
assert.equal(second[0].exerciseId,first[0].exerciseId);assert(second.some(e=>!first.some(p=>p.exerciseId===e.exerciseId)),'rotate equivalent less-recent accessories');
// Hundreds of catalog entries stay in the pool, without inflating a workout or forecast.
const many=Array.from({length:120},(_,i)=>({...catalog.find(e=>e.id==='calf_raise'),id:`bulk_${i}`}));
let large=makeDraft('upper_lower');large.workouts[1].exercises.push(...many.map(e=>({...large.workouts[1].exercises[0],id:e.id,exerciseId:e.id,name:e.name})));
const largeState=compileTrainingBlock({...emptyRuntimeState(),catalog:[...catalog,...many]},sourceFromDraft(large,source,[...catalog,...many]));
const largeSession=previewTrainingSession(largeState,{...context,workoutId:largeState.block.slots[1].id});
assert(largeSession.exercises.length<=5&&largeSession.estimatedMinutes<=60);
assert(computeWeeklyStatus(largeState.block,[],[]).muscles.every(m=>m.scheduledSets<100));
console.log('Exercise pools: patterns, sequence, coverage, rotation, constraints, time, previews, session-only edits, progress, persistence and 120 imported alternatives passed.');

// Previously saved or imported pools must not leak lower-body work into Upper.
const upperSlot=ready.block.slots[0];
const legPlan={exerciseId:'leg_press',sets:3,selection:{reasons:[]}};
const mixedSlot={...upperSlot,plannedExercises:[legPlan,...upperSlot.plannedExercises]};
const mixed={...ready,block:{...ready.block,slots:[mixedSlot,...ready.block.slots.slice(1)]}};
const poolBefore=JSON.stringify(mixed);
assert(!selectPoolPlans(mixedSlot,mixed.source,catalog,context).some(p=>p.exerciseId==='leg_press'));
assert(previewTrainingSession(mixed,context).exercises.every(e=>matchesGroup(e.exercise,GROUP_TEMPLATES.upper_lower[0])));
assert.equal(JSON.stringify(mixed),poolBefore,'filter incompatible legacy entries without rewriting history or the saved pool');
assert.equal(selectPoolPlans({...upperSlot,plannedExercises:[legPlan]},ready.source,catalog,context).length,0,'an invalid Upper pool must not become a leg workout');
// A stale availability window must not provide a different name than the solved session.
const future=datePlusDays(date,2),wrongSlot=finished.block.slots[1];
const stale={...finished,block:{...finished.block,remainingWeek:{week:1,windows:[{...context,date:future,slotId:wrongSlot.id,workout:lower}],explanation:[]}}};
const solved=previewTrainingSession(stale,{...context,date:future});
const next=nextWorkoutPreview(stale,date);
assert.equal(next.slotId,solved.slotId,'next-session identity must come from the same proposal as its exercises');
assert.equal(next.name,stale.block.slots.find(s=>s.id===solved.slotId).label);
assert.deepEqual(next.exercises.map(e=>e.exercise.id),ids(solved));
console.log('Session group regression: legacy pool contamination and mismatched preview title/slot passed.');

const fixedMixed={...mixed,source:{...mixed.source,routine:{...mixed.source.routine,selectionMode:'fixed'}}};
assert(!previewTrainingSession(fixedMixed,context).exercises.some(e=>e.exercise.id==='leg_press'),'standard Upper also excludes leg press in saved fixed workouts');
