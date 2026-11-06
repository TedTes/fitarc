require('./lib/load-typescript.cjs');
const assert=require('node:assert/strict');
const {RUNTIME_EXERCISES:catalog}=require('../src/runtime/exerciseCatalog.ts');
const {GROUP_TEMPLATES,selectPoolPlans,exerciseQueueOrder,exerciseQueueProgress}=require('../src/runtime/exercisePools.ts');
const {missingBalance}=require('../src/runtime/workoutBalance.ts');
const {prepareOnboardingTraining}=require('../src/runtime/onboarding.ts');
const {emptyRuntimeState}=require('../src/runtime/runtimePersistence.ts');
const {solveSession}=require('../src/runtime/sessionSolver.ts');
const {localDate}=require('../src/runtime/planDates.ts');
const context={date:localDate(),minutesAvailable:30,recovery:'yes',unavailableEquipment:[],unavailableExerciseIds:[]};
const state=prepareOnboardingTraining({...emptyRuntimeState(),catalog},{id:'balance',trainingSplit:'upper_lower',experienceLevel:'beginner',planPreferences:{daysPerWeek:4,sessionMinutes:30,equipmentLevel:'full_gym',injuries:[]}},()=>0.4);
const source=state.source;
const makeSlot=(name,ids)=>({...state.block.slots[0],label:name,targetMuscles:Object.values(GROUP_TEMPLATES).flat().find(g=>g.name===name).muscles,plannedExercises:ids.map(id=>({...state.block.slots[0].plannedExercises[0],exerciseId:id,sets:2}))});
const ids=plans=>plans.map(p=>p.exerciseId);
const definitions=plans=>plans.map(p=>catalog.find(e=>e.id===p.exerciseId));
// Audit local seed metadata used by balance rules (database seed parity is checked by data:check).
for(const e of catalog){
 assert(e.primaryMuscles.length&&e.substitutionGroup&&e.movementPattern);
 if(e.movementPattern.includes('push'))assert(e.primaryMuscles.some(m=>['chest','delts','triceps'].includes(m)),e.id);
 if(e.movementPattern.includes('pull'))assert(e.primaryMuscles.some(m=>['back','delts','biceps'].includes(m)),e.id);
 if(['squat','single_leg'].includes(e.movementPattern))assert(e.primaryMuscles.includes('quads'),e.id);
 if(e.movementPattern==='hinge')assert(e.primaryMuscles.some(m=>['glutes','hamstrings'].includes(m)),e.id);
}
let slot=makeSlot('Upper',['bench_press','incline_db_press','machine_chest_press','cable_row','biceps_curl','overhead_press']);
const snapshot=JSON.stringify(slot);
let batch=selectPoolPlans(slot,source,catalog,context);
assert.deepEqual(ids(batch),['bench_press','cable_row','biceps_curl']);
assert.deepEqual(missingBalance(slot,definitions(batch)),[]);
assert.equal(JSON.stringify(slot),snapshot);
let order=exerciseQueueOrder(slot,context,[]);
const seen=new Set();
for(let i=0;i<6;i++){
 batch=selectPoolPlans(slot,source,catalog,context,[],order);
 ids(batch).forEach(id=>seen.add(id));
 assert.deepEqual(missingBalance(slot,definitions(batch)),[]);
 const next=exerciseQueueProgress(slot,ids(batch),true,order);
 order=JSON.parse(JSON.stringify(next)).pendingOrder;
 assert.equal(new Set(order).size,slot.plannedExercises.length);
}
assert.equal(seen.size,slot.plannedExercises.length,'Deferred exercises eventually offered');
for(const [name,list] of [
 ['Lower',['leg_press','hack_squat','romanian_deadlift','calf_raise']],
 ['Push',['bench_press','incline_db_press','triceps_pressdown','lateral_raise']],
 ['Pull',['cable_row','chest_supported_row','lat_pulldown','biceps_curl']],
 ['Full body',['bench_press','incline_db_press','cable_row','leg_press']]]){
 const group=makeSlot(name,list);
 assert.deepEqual(missingBalance(group,definitions(selectPoolPlans(group,source,catalog,context))),[],name);
}
const unavailable={...context,unavailableExerciseIds:['cable_row']};
assert(missingBalance(slot,definitions(selectPoolPlans(slot,source,catalog,unavailable))).includes('pulling'));
assert(!ids(selectPoolPlans(slot,source,catalog,unavailable)).includes('cable_row'));
const block={...state.block,slots:[slot]};
const full=solveSession({source,block,context,workingSets:{}});
assert.deepEqual(missingBalance(slot,full.exercises.map(e=>e.exercise)),[]);
const tight=solveSession({source,block,context:{...context,minutesAvailable:11},workingSets:{}});
assert(tight.estimatedMinutes<=11);
assert.deepEqual(missingBalance(slot,tight.exercises.map(e=>e.exercise)),[],'Accessories trimmed before required patterns');
const impossible=solveSession({source,block,context:{...context,minutesAvailable:4},workingSets:{}});
assert(impossible.explanation.startsWith('Limited coverage:'));
const offered=new Set(tight.exercises.map(e=>e.exercise.id));
assert.deepEqual(tight.exerciseQueue.pendingOrder.slice(0,slot.plannedExercises.length-offered.size),slot.plannedExercises.map(p=>p.exerciseId).filter(id=>!offered.has(id)));
const costly=catalog.map(e=>e.id==='bench_press'?{...e,setupMinutes:25}:e);
const affordable=selectPoolPlans(slot,source,costly,{...context,minutesAvailable:15});
assert.equal(affordable[0].exerciseId,'incline_db_press','Use a feasible alternative before dropping required coverage');
const singleton=makeSlot('Upper',['bench_press']);
assert.equal(selectPoolPlans(singleton,source,catalog,context).length,1);
const custom={...slot,label:'My upper',targetMuscles:['chest','back']};
assert.deepEqual(missingBalance(custom,definitions(selectPoolPlans(custom,source,catalog,context))),[]);
const arms={...slot,label:'Arms',targetMuscles:['biceps','triceps']};
assert.deepEqual(missingBalance(arms,[catalog.find(e=>e.id==='biceps_curl'),catalog.find(e=>e.id==='triceps_pressdown')]),[]);
console.log('Workout balance: metadata, clustered queues, all splits/custom, deferred rotation, constraints, time trimming and coverage explanations passed.');
