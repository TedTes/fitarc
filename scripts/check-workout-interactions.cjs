const assert=require('node:assert/strict');
const h=require('./lib/react-harness.cjs');
const {React,act,render,advance,appState,mockFile}=h;
const {emptyRuntimeState}=require('../src/runtime/runtimePersistence.ts');
const {prepareOnboardingTraining}=require('../src/runtime/onboarding.ts');
const {RUNTIME_EXERCISES}=require('../src/runtime/exerciseCatalog.ts');
const service=require('../src/runtime/runtimeService.ts');
const {removeSessionExercise,restoreSessionExercise}=require('../src/runtime/removeExercise.ts');
const {fromStoredTraining,toStoredTraining}=require('../src/runtime/trainingState.ts');
const {localDate}=require('../src/runtime/planDates.ts');
const {SwipeDeleteCard}=require('../src/screens/runtime/SwipeDeleteCard.tsx');
const {useWorkoutWorkspace}=require('../src/screens/runtime/useWorkoutWorkspace.ts');
const {completeRuntimeExercise}=require('../src/runtime/completeExercise.ts');
const {WorkoutElapsed,WorkoutRestDock}=require('../src/screens/runtime/WorkoutTimers.tsx');
const base=()=>prepareOnboardingTraining({...emptyRuntimeState(),catalog:RUNTIME_EXERCISES},{id:'test',trainingSplit:'upper_lower',experienceLevel:'beginner',planPreferences:{daysPerWeek:4,sessionMinutes:60,equipmentLevel:'full_gym',injuries:[]}},()=>0.4);
const context={date:localDate(),minutesAvailable:60,recovery:'yes',unavailableEquipment:[],unavailableExerciseIds:[]};
function result(s,entry=s.activeSession.exercises[0],set=entry.sets.find(x=>x.status==='pending')){return {prescriptionId:s.activeSession.id,setId:set.id,exerciseId:entry.exercise.id,prescribedLoadKg:set.loadKg,actualLoadKg:30,prescribedMinReps:set.minReps,prescribedMaxReps:set.maxReps,targetRir:set.targetRir,completedReps:10,reportedRir:2,completedAt:new Date(Date.now()).toISOString()};}
async function main(){
  let deleted=0,completed=0;
  let tree=await render(React.createElement(SwipeDeleteCard,{label:'exercise',onDelete:()=>deleted++,onComplete:()=>completed++},React.createElement('Card')));
  const pan=()=>tree.root.findAllByType('AnimatedView').find(x=>x.props.onPanResponderMove).props;
  await act(async()=>tree.root.findByType('View').props.onLayout({nativeEvent:{layout:{width:300}}}));
  assert.equal(pan().onMoveShouldSetPanResponder(null,{dx:15,dy:40}),false,'Vertical scrolling does not delete');
  await act(async()=>{pan().onPanResponderGrant();pan().onPanResponderMove(null,{dx:-70});pan().onPanResponderRelease();});
  assert.equal(deleted,0);assert.equal(tree.root.findByProps({accessibilityLabel:'Delete exercise'}).props.accessibilityElementsHidden,false);
  await act(async()=>{pan().onPanResponderGrant();pan().onPanResponderMove(null,{dx:-150});});assert.equal(deleted,0,'Crossing threshold alone does not delete');
  await act(async()=>pan().onPanResponderRelease());assert.equal(deleted,1);
  await act(async()=>{pan().onPanResponderGrant();pan().onPanResponderMove(null,{dx:210});pan().onPanResponderRelease();});assert.equal(completed,1);assert.equal(deleted,1,'Right swipe never deletes');
  await act(async()=>{pan().onPanResponderGrant();pan().onPanResponderMove(null,{dx:-250});pan().onPanResponderTerminate();});assert.equal(deleted,1,'Interrupted gesture never commits');
  await act(async()=>tree.unmount());

  let state=base(),api;
  const proposal=service.previewTrainingSessionDetailed(state,context);
  const apply=transform=>{try{state=transform(state);return {ok:true,state};}catch(error){return {ok:false,error};}};
  function Workspace(){api=useWorkoutWorkspace(state,proposal,apply);return null;}
  tree=await render(React.createElement(Workspace));
  const ids=api.workspace.activeSession.exercises.map(x=>x.id);
  await act(async()=>{assert.equal(api.update(s=>removeSessionExercise(s,ids[0])).ok,true);assert.equal(api.update(s=>removeSessionExercise(s,ids[1])).ok,true);});
  assert(!api.workspace.activeSession.exercises.some(x=>ids.slice(0,2).includes(x.id)),'Two fast preview edits must both survive');assert.equal(state.activeSession,null,'Preview does not start a workout');
  const payload=result(api.workspace);let first,second;
  await act(async()=>{first=api.update(s=>service.recordRuntimeSet(s,payload));second=api.update(s=>service.recordRuntimeSet(s,payload));});
  assert(first.ok);assert.equal(second.ok,false);assert.equal(state.setResults.length,1,'Fast double log records once');
  assert.equal(state.activeSession.exercises.length,ids.length-2);
  await act(async()=>tree.unmount());

  let workout=service.solveTrainingSession(base(),context);
  workout=service.recordRuntimeSet(workout,result(workout));
  const original=workout.activeSession.exercises[0];
  const replacement=service.getSwapCandidates(workout,original.exercise.id,8)[0];assert(replacement);
  workout=service.substituteRuntimeExercise(workout,original.exercise.id,replacement.id);
  assert.equal(workout.setResults.length,1,'Swap preserves recorded sets');
  assert(workout.activeSession.exercises.some(x=>x.exercise.id===replacement.id));
  assert.equal(new Set(workout.activeSession.exercises.map(x=>x.id)).size,workout.activeSession.exercises.length);
  assert.throws(()=>service.addRuntimeExercise(workout,{exerciseId:replacement.id,sets:3,minReps:8,maxReps:12,targetRir:2}),/already/);
  const index=workout.activeSession.exercises.findIndex(x=>x.exercise.id===replacement.id);
  const removed={sessionId:workout.activeSession.id,index,entry:workout.activeSession.exercises[index]};
  workout=removeSessionExercise(workout,removed.entry.id);
  const other=workout.activeSession.exercises.find(x=>x.sets.some(s=>s.status==='pending'));
  workout=service.recordRuntimeSet(workout,result(workout,other));
  workout=restoreSessionExercise(workout,removed);assert.equal(workout.setResults.length,2,'Undo preserves sets logged elsewhere');
  workout=fromStoredTraining(JSON.parse(JSON.stringify(toStoredTraining(workout))));assert.equal(workout.activeSession.exercises[index].id,removed.entry.id);
  const finished=service.commitRuntimeSession(service.skipRemainingRuntimeSets(workout));
  assert.equal(finished.activeSession,null);assert.equal(finished.setResults.length,2);assert.equal(finished.committedSessionIds.length,1);
  assert.throws(()=>service.commitRuntimeSession(finished),/active_session/);
  assert.throws(()=>restoreSessionExercise(finished,removed),/ended/);
  assert.equal(fromStoredTraining(JSON.parse(JSON.stringify(toStoredTraining(finished)))).sessions.at(-1).status,'committed');

  // Actual logger handlers: logging then deleting before React renders must make
  // Undo restore the just-recorded set, not an old render's copy.
  mockFile('src/screens/runtime/useLayoutMotion.ts', {useLayoutMotion:()=>({animate(){}})});
  mockFile('src/screens/runtime/WeightSettings.tsx', {useWeightSettings:()=>({unit:'kg',ranges:{}}),WeightRangeSheet:'WeightRangeSheet'});
  mockFile('src/screens/runtime/WorkoutCelebration.tsx',{WorkoutCelebration:'WorkoutCelebration'});
  mockFile('src/screens/runtime/EmptyWorkoutLogger.tsx',{EmptyWorkoutLogger:'EmptyWorkoutLogger'});
  mockFile('src/screens/runtime/TodayExercisePicker.tsx',{TodayExercisePicker:'TodayExercisePicker'});
  mockFile('src/screens/runtime/ExerciseCard.tsx',{ExerciseSectionHeader:'ExerciseSectionHeader'});
  mockFile('src/screens/runtime/SetNumberPicker.tsx',{SetNumberPicker:'SetNumberPicker'});
  const {SetLogger}=require('../src/screens/runtime/SetLogger.tsx');
  const {EditableSetRow}=require('../src/screens/runtime/EditableSetRow.tsx');
  let loggerState=service.solveTrainingSession(base(),context),undo,refresh;
  const loggerApply=transform=>{try{loggerState=transform(loggerState);refresh();return {ok:true,state:loggerState};}catch(error){return {ok:false,error};}};
  function Logger(){const [,force]=React.useReducer(x=>x+1,0);refresh=force;return React.createElement(SetLogger,{state:loggerState,apply:loggerApply,notify:event=>{if(event.action?.label==='Undo')undo=event.action.run;},onDockChange:()=>{}});}
  tree=await render(React.createElement(Logger));
  assert.equal(tree.root.findAllByType('Pressable').filter(x=>/^Log set/.test(x.props.accessibilityLabel)).length,0,'No per-set confirmation buttons');
  const rows=tree.root.findAllByType(EditableSetRow),count=rows.length;
  assert(rows.every(row=>row.props.value.load!==''),'All rows have editable default weights');
  await act(async()=>rows.forEach((row,index)=>row.props.onChange({load:String(30+index)})));
  const doneButton=()=>tree.root.findAllByType('Pressable').find(x=>/^Done with /.test(x.props.accessibilityLabel));
  const doneHandler=doneButton().props.onPress;
  await act(async()=>{doneHandler();doneHandler();});
  assert.equal(loggerState.setResults.length,count,'Done records the exercise once despite rapid taps');
  assert.deepEqual(loggerState.setResults.map(x=>x.actualLoadKg),Array.from({length:count},(_,i)=>30+i),'Done preserves each displayed weight');
  assert(loggerState.activeSession.exercises.slice(1).every(e=>e.sets.every(s=>s.status==='pending')),'Other exercises stay pending');
  assert.equal(tree.root.findAllByProps({testID:'active-exercise-card'}).length,1,'Next exercise automatically replaces the completed dock');
  assert.equal(tree.root.findAllByType('ExerciseSectionHeader').find(x=>x.props.active).props.entry.id,loggerState.activeSession.exercises[1].id,'Dock follows the unfinished routine order');
  assert.equal(tree.root.findAllByType('WorkoutCelebration').length,1,'Completion triggers a single confetti burst');
  const completedEntry=loggerState.activeSession.exercises[0];
  await advance(2000);
  await act(async()=>tree.root.findAllByType('ExerciseSectionHeader').find(x=>x.props.entry.id===completedEntry.id).props.onPress());
  assert.equal(doneButton(),undefined,'Completed exercises have no Done button');
  assert.equal(tree.root.findAllByProps({testID:'completed-exercise-status'}).length,1);
  assert.equal(tree.root.findAllByType(SwipeDeleteCard).find(x=>x.props.label===completedEntry.exercise.name).props.onComplete,undefined,'Completed exercise cannot be completed again by swiping');
  const originalTime=loggerState.setResults[0].completedAt;
  await act(async()=>tree.root.findAllByType(EditableSetRow)[0].props.onChange({load:'38',reps:'11'}));
  assert.equal(loggerState.setResults[0].actualLoadKg,38,'Completed-set corrections save immediately');
  assert.equal(loggerState.setResults[0].completedReps,11);
  assert.equal(loggerState.setResults[0].completedAt,originalTime);
  assert.equal(loggerState.setResults.length,count,'Correction does not log extra sets');
  assert.equal(tree.root.findAllByType('WorkoutCelebration').length,0,'Correction never celebrates again');
  assert.equal(tree.root.findAllByType('ExerciseSectionHeader').find(x=>x.props.active).props.entry.id,completedEntry.id,'Corrections leave the completed exercise docked');

  const deleteHandler=tree.root.findAllByType(SwipeDeleteCard).find(x=>x.props.label===completedEntry.exercise.name).props.onDelete;
  await act(async()=>deleteHandler());assert.equal(loggerState.setResults.length,0);assert(undo);
  await act(async()=>undo());assert.equal(loggerState.setResults.length,count,'Undo restores all completed sets');
  await act(async()=>tree.root.findAllByType(EditableSetRow)[0].props.onChange({load:'40'}));
  assert.equal(doneButton(),undefined);
  assert.equal(loggerState.setResults[0].actualLoadKg,40,'Restored completed cards still autosave corrections');
  while(loggerState.activeSession){
    const next=loggerState.activeSession.exercises.find(entry=>entry.sets.some(set=>set.status==='pending'));
    const header=tree.root.findAllByType('ExerciseSectionHeader').find(x=>x.props.entry.id===next.id);
    if(!header.props.active)await act(async()=>header.props.onPress());
    await act(async()=>doneButton().props.onPress());
    if(loggerState.activeSession){
      const following=loggerState.activeSession.exercises.find(entry=>entry.sets.some(set=>set.status==='pending'));
      assert.equal(tree.root.findAllByType('ExerciseSectionHeader').find(x=>x.props.active).props.entry.id,following.id);
    }
  }
  assert.equal(tree.root.findAllByProps({testID:'active-exercise-card'}).length,0,'Final exercise closes the dock');
  await act(async()=>tree.unmount());

  loggerState=service.solveTrainingSession(base(),context);
  const savedRoutine=JSON.stringify(loggerState.source.routine);
  tree=await render(React.createElement(Logger));
  await act(async()=>tree.root.findByProps({accessibilityLabel:'Exercise options'}).props.onPress());
  await act(async()=>tree.root.findByProps({accessibilityLabel:'Start from scratch'}).props.onPress());
  assert.equal(loggerState.activeSession.exercises.length,0);
  assert.equal(JSON.stringify(loggerState.source.routine),savedRoutine,'Starting from scratch does not erase the saved routine');
  assert.equal(loggerState.setResults.length,0,'Starting from scratch does not record any sets');
  const blank=tree.root.findByType('EmptyWorkoutLogger');
  await act(async()=>blank.props.apply(current=>service.addRuntimeExercise(current,{exerciseId:RUNTIME_EXERCISES[0].id,sets:2,minReps:8,maxReps:12,targetRir:2})));
  assert.equal(tree.root.findAllByType(EditableSetRow).length,2,'A scratch exercise populates the editable dock');
  await act(async()=>tree.unmount());

  let batch=service.solveTrainingSession(base(),context);
  const firstEntry=batch.activeSession.exercises[0],sessionId=batch.activeSession.id;
  const values=entry=>entry.sets.filter(set=>set.status!=='skipped').map(set=>({setId:set.id,actualLoadKg:25,completedReps:10,reportedRir:2}));
  const invalid=values(firstEntry);invalid[invalid.length-1].actualLoadKg=NaN;
  assert.throws(()=>completeRuntimeExercise(batch,sessionId,firstEntry.id,invalid),/Check weight/);
  assert.equal(batch.setResults.length,0,'Validation failure never partially logs an exercise');
  assert.throws(()=>completeRuntimeExercise(batch,'old-session',firstEntry.id,values(firstEntry)),/changed/);
  batch=completeRuntimeExercise(batch,sessionId,firstEntry.id,values(firstEntry));
  const recordedAt=batch.setResults[0].completedAt;
  assert.throws(()=>completeRuntimeExercise(batch,sessionId,firstEntry.id,values(firstEntry)),/already completed/,'Completion cannot be repeated even through a stale handler');
  for(const value of values(firstEntry))batch=service.correctRuntimeSet(batch,value.setId,{...value,actualLoadKg:27});
  assert.equal(batch.setResults.length,firstEntry.sets.length,'Reopening and correcting does not append duplicate sets');
  assert.equal(batch.setResults[0].completedAt,recordedAt);
  for(const entry of batch.activeSession.exercises.slice(1))batch=completeRuntimeExercise(batch,sessionId,entry.id,values(entry));
  assert.equal(batch.activeSession,null,'Last exercise completes the session');
  assert.equal(batch.committedSessionIds.filter(id=>id===sessionId).length,1);
  assert.equal(fromStoredTraining(JSON.parse(JSON.stringify(toStoredTraining(batch)))).setResults.length,batch.setResults.length);
  await advance(2000);

  // A fresh single-exercise preview is committed in one tap, without an intermediate
  // active-session render. It must still celebrate on Today.
  for(const name of ['WorkoutCalendar','NextWorkoutPreview','EmptyToday','WorkoutAlternatives'])mockFile(`src/screens/runtime/${name}.tsx`,{[name]:name});
  const {TodaySurface}=require('../src/screens/runtime/TodaySurface.tsx');
  const fresh=base();let single=service.solveTrainingSession(fresh,context);
  for(const entry of single.activeSession.exercises.slice(1))single=removeSessionExercise(single,entry.id);
  const one=single.activeSession.exercises[0],oneSession=single.activeSession.id;
  single=completeRuntimeExercise(single,oneSession,one.id,values(one));
  const todayProps={state:fresh,apply:()=>{},notify:()=>{},active:true,onDockChange:()=>{},onOpenSource:()=>{},onOpenWeek:()=>{},onNewWorkout:()=>{}};
  tree=await render(React.createElement(TodaySurface,todayProps));
  await act(async()=>tree.update(React.createElement(TodaySurface,{...todayProps,state:single})));
  assert.equal(tree.root.findByType('NextWorkoutPreview').props.celebrationId,oneSession,'Single-exercise Done celebrates after committing');
  await act(async()=>tree.unmount());

  // Timer state must stay in the readouts, including the rest dock, not their parent.
  let parentRenders=0,expired=0;
  const start=new Date(Date.now()).toISOString(),dock={until:Date.now()+60000,durationSeconds:60,onSkip:()=>expired++};
  function Timers(){parentRenders++;return React.createElement(React.Fragment,null,React.createElement(WorkoutElapsed,{startedAt:start,completed:1,total:3}),React.createElement(WorkoutRestDock,{dock}));}
  tree=await render(React.createElement(Timers));const renders=parentRenders;
  await advance(5000);assert.equal(parentRenders,renders);assert(JSON.stringify(tree.toJSON()).includes('00:05 elapsed'));
  await act(async()=>appState('background'));assert.equal(h.timers.size,0,'No clock intervals while backgrounded');
  await advance(60000);assert.equal(expired,0);
  await act(async()=>appState('active'));assert.equal(expired,1,'Expired rest completes immediately on resume');assert(JSON.stringify(tree.toJSON()).includes('01:05 elapsed'));
  await act(async()=>tree.unmount());assert.equal(h.listeners.size,0);assert.equal(h.timers.size,0);
  console.log('Workout interactions: swipe directions/cancellation, rapid preview edits/logging, Done batching, default weights, swaps, delete/undo, completion, reopening and isolated foreground timers passed.');
}
main().then(()=>h.restore()).catch(e=>{h.restore();console.error(e);process.exitCode=1;});
