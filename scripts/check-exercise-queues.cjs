require('./lib/load-typescript.cjs');
const assert=require('node:assert/strict');
const {GROUP_TEMPLATES,selectPoolPlans}=require('../src/runtime/exercisePools.ts');
const {RUNTIME_EXERCISES}=require('../src/runtime/exerciseCatalog.ts');
const {emptyRuntimeState}=require('../src/runtime/runtimePersistence.ts');
const {defaultProgression}=require('../src/runtime/routine.ts');
const {compileTrainingBlock,previewTrainingSession,solveTrainingSession,recordRuntimeSet,skipRemainingRuntimeSets,commitRuntimeSession,discardRuntimeSession}=require('../src/runtime/runtimeService.ts');
const {toStoredTraining,fromStoredTraining}=require('../src/runtime/trainingState.ts');
const {nextRoutineSlot,scheduledOccurrences}=require('../src/runtime/sequence.ts');
const {computeWeeklyStatus}=require('../src/runtime/status.ts');
const {datePlusDays,localDate}=require('../src/runtime/planDates.ts');
const {useSavedRoutine,renameSavedRoutine}=require('../src/runtime/savedRoutines.ts');
const date=localDate();
const context={date,minutesAvailable:45,recovery:'yes',unavailableEquipment:[],unavailableExerciseIds:[]};
const ids=session=>session.exercises.map(entry=>entry.exercise.id);
const fixture=(pattern='upper_lower',length=8)=>{
  const groups=pattern==='custom'?[{name:'A',muscles:['chest','back']},{name:'B',muscles:['quads','hamstrings']}]:GROUP_TEMPLATES[pattern];
  const catalog=groups.flatMap((group,g)=>Array.from({length},(_,i)=>({...RUNTIME_EXERCISES[0],id:`g${g}_${i}`,name:`${group.name} exercise ${i}`,
    primaryMuscles:[group.muscles[i<length/2?0:1]],secondaryMuscles:[],compound:false,setupMinutes:0,equipment:[],contraindications:[],movementPattern:group.name==='Pull'?'horizontal_pull':group.name==='Push'?'horizontal_push':'isolation'})));
  const source={id:'queue-source',userId:'queue-user',version:1,goal:'hypertrophy',experience:'intermediate',daysPerWeek:4,sessionMinutes:45,equipment:[],excludedExerciseIds:[],limitations:[],seedWorkingSets:[],createdAt:new Date().toISOString(),routine:{split:'custom',preferredSplit:pattern,selectionMode:'pools',progression:defaultProgression(),workouts:groups.map((group,g)=>({id:`queue-${g}`,name:group.name,targetMuscles:group.muscles,exercises:catalog.filter(e=>e.id.startsWith(`g${g}_`)).map(e=>({exerciseId:e.id,sets:2,minReps:8,maxReps:12,targetRir:2}))}))}};
  return compileTrainingBlock({...emptyRuntimeState(),catalog},source);
};
const log=state=>{
  const s=state.activeSession,e=s.exercises[0],set=e.sets[0];
  return recordRuntimeSet(state,{prescriptionId:s.id,setId:set.id,exerciseId:e.exercise.id,prescribedLoadKg:set.loadKg,actualLoadKg:20,prescribedMinReps:set.minReps,prescribedMaxReps:set.maxReps,targetRir:set.targetRir,completedReps:10,reportedRir:2,completedAt:`${s.context.date}T12:00:00.000Z`});
};
const finish=state=>commitRuntimeSession(skipRemainingRuntimeSets(log(state)));
for(const pattern of ['upper_lower','push_pull_legs','full_body','custom']){
  let state=fixture(pattern),initial=JSON.stringify(state),queues=JSON.stringify(state.source.routine);
  const groups=state.block.slots.length;
  const first=previewTrainingSession(state,context);
  assert.equal(ids(first).length,4);
  assert(ids(first).every(id=>id.startsWith('g0_')));
  assert.deepEqual(ids(previewTrainingSession(state,context)),ids(first));assert.equal(JSON.stringify(state),initial,'Preview never writes');
  const empty=commitRuntimeSession(skipRemainingRuntimeSets(solveTrainingSession(state,context)));
  assert.deepEqual(ids(previewTrainingSession(empty,context)),ids(first),'Empty completion does not advance');
  const abandoned=discardRuntimeSession(log(solveTrainingSession(state,context)));
  assert.deepEqual(ids(previewTrainingSession(abandoned,context)),ids(first),'Discarded work does not advance');
  const visited=Array.from({length:groups},()=>new Set());
  for(let turn=0;turn<groups*3;turn++){
    const day={...context,date:datePlusDays(date,turn*3)};
    const group=turn%groups,start=(Math.floor(turn/groups)%2)*4;
    const expected=ids(previewTrainingSession(state,day));
    assert.equal(new Set(expected).size,4);
    assert(expected.every(id=>id.startsWith(`g${group}_`)),`${pattern} keeps group queues independent`);
    expected.forEach(id=>visited[group].add(id));
    let active=log(solveTrainingSession(state,day));
    assert.equal(active.sessions.filter(s=>s.status==='committed').length,turn);
    const slot=state.block.slots[group];
    assert.deepEqual(selectPoolPlans(slot,state.source,state.block.catalog,day,active.sessions).map(p=>p.exerciseId),expected,'Logging alone does not advance');
    state=commitRuntimeSession(skipRemainingRuntimeSets(active));
    assert.equal(JSON.stringify(state.source.routine),queues,'Completion must not shrink or reorder the saved queue');
    assert.throws(()=>commitRuntimeSession(state),/active_session/,'Retry cannot advance twice');
    state=fromStoredTraining(JSON.parse(JSON.stringify(toStoredTraining(state))));
  }
  visited.forEach(group=>assert.equal(group.size,8,'Every deferred exercise is eventually offered'));
}
// Different batch sizes, wrap inside a session, and a singleton queue.
let state=fixture('full_body',6);
state=finish(solveTrainingSession(state,context));
assert.deepEqual(ids(previewTrainingSession(state,{...context,date:datePlusDays(date,1)})),['g0_4','g0_5','g0_0','g0_1']);
assert.deepEqual(ids(previewTrainingSession(fixture('full_body',1),context)),['g0_0']);
let small=fixture('full_body',1);small=finish(solveTrainingSession(small,context));
assert.deepEqual(ids(previewTrainingSession(small,{...context,date:datePlusDays(date,1)})),['g0_0']);
// Unavailable entries are bypassed without reordering/deleting the saved queue.
state=fixture();const before=JSON.stringify(state);
assert.deepEqual(ids(previewTrainingSession(state,{...context,unavailableExerciseIds:['g0_1']})),['g0_0','g0_2','g0_3','g0_4']);
assert.equal(JSON.stringify(state),before);
assert.throws(()=>previewTrainingSession(state,{...context,unavailableExerciseIds:state.block.slots[0].plannedExercises.map(p=>p.exerciseId)}),/No work/,'Do not fill Upper from Lower');
// Both manual type overrides and extra workouts leave the normal rotation unchanged.
for(const override of [{workoutId:state.block.slots[1].id},{extraWorkout:true}]){
  const alternate=finish(solveTrainingSession(state,{...context,...override}));
  assert.equal(nextRoutineSlot(alternate.block,alternate.sessions).id,state.block.slots[0].id);
  assert.deepEqual(ids(previewTrainingSession(alternate,context)),['g0_0','g0_1','g0_2','g0_3']);
}
// Correcting recorded performance later cannot rewind a completed batch.
const completed=finish(solveTrainingSession(state,context));
const corrected=JSON.parse(JSON.stringify(completed));
corrected.sessions[0].exercises.forEach(e=>e.sets.forEach(set=>{if(set.result)set.result.completedReps=0;}));
assert.deepEqual(selectPoolPlans(corrected.block.slots[0],corrected.source,corrected.block.catalog,context,corrected.sessions).map(p=>p.exerciseId),['g0_4','g0_5','g0_6','g0_7']);
// A legacy reuseSelection flag must not pin the batch or expand it to the whole queue.
const legacy={...state,source:{...state.source,routine:{...state.source.routine,workouts:state.source.routine.workouts.map(w=>({...w,reuseSelection:true}))}}};
assert.equal(previewTrainingSession(legacy,context).exercises.length,4);
// Rename/activation keeps the same queue identity; explicit reordering starts the edited order.
state=finish(solveTrainingSession(state,context));
const rename=renameSavedRoutine(state,state.block.id,'My routine');
const activated=useSavedRoutine(rename,rename.block.id);
assert.deepEqual(selectPoolPlans(activated.block.slots[0],activated.source,activated.block.catalog,context,activated.sessions).map(p=>p.exerciseId),['g0_4','g0_5','g0_6','g0_7']);
const reordered=compileTrainingBlock(state,{...state.source,version:2,routine:{...state.source.routine,workouts:state.source.routine.workouts.map(w=>({...w,exercises:[...w.exercises].reverse()}))}});
assert.deepEqual(selectPoolPlans(reordered.block.slots[0],reordered.source,reordered.block.catalog,context,reordered.sessions).map(p=>p.exerciseId),['g0_7','g0_6','g0_5','g0_4']);
// Forecast both future Upper batches instead of multiplying the first batch's muscle volume.
const fresh=fixture();const status=computeWeeklyStatus(fresh.block,[],[]);
assert.equal(status.muscles.find(m=>m.muscle==='chest').scheduledSets,8);
assert.equal(status.muscles.find(m=>m.muscle==='back').scheduledSets,8);
const activeForecast=solveTrainingSession(fresh,context);
assert.deepEqual(scheduledOccurrences(activeForecast.block,activeForecast.sessions,1).map(item=>item.slot.label),['Upper','Lower','Upper','Lower'],'Forecast after an untouched active batch advances only the projected rotation');
const activeStatus=computeWeeklyStatus(activeForecast.block,activeForecast.sessions,[]);
assert.equal(activeStatus.muscles.find(m=>m.muscle==='back').scheduledSets,8,'Forecast continues past the frozen active batch');
// Tight time budgets advance only past exercises actually offered, not trimmed tail entries.
const tight={...fresh,block:{...fresh.block,catalog:fresh.block.catalog.map(e=>({...e,setupMinutes:5}))}};
const short=solveTrainingSession(tight,{...context,minutesAvailable:10});
assert(short.activeSession.exercises.length<3);
const lastIndex=Number(ids(short.activeSession).at(-1).split('_')[1]);
assert.equal(short.activeSession.exerciseQueue.nextExerciseId,`g0_${lastIndex+1}`);
console.log('Exercise queues: independent per-type batches, wrap, all styles, no preview/log/discard movement, completion-only continuation, serialization, overrides, constraints, edits and forecasts passed.');
