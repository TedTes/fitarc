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
  mockFile('src/screens/runtime/EmptyWorkoutLogger.tsx',{EmptyWorkoutLogger:'EmptyWorkoutLogger'});
  mockFile('src/screens/runtime/TodayExercisePicker.tsx',{TodayExercisePicker:'TodayExercisePicker'});
  mockFile('src/screens/runtime/ExerciseCard.tsx',{ExerciseSectionHeader:'ExerciseSectionHeader'});
  mockFile('src/screens/runtime/SetNumberPicker.tsx',{SetNumberPicker:'SetNumberPicker'});
  const {SetLogger}=require('../src/screens/runtime/SetLogger.tsx');
  const {EditableSetRow}=require('../src/screens/runtime/EditableSetRow.tsx');
  let loggerState=service.solveTrainingSession(base(),context),undo;
  const loggerApply=transform=>{try{loggerState=transform(loggerState);return {ok:true,state:loggerState};}catch(error){return {ok:false,error};}};
  tree=await render(React.createElement(SetLogger,{state:loggerState,apply:loggerApply,notify:event=>{if(event.action?.label==='Undo')undo=event.action.run;},onDockChange:()=>{}}));
  await act(async()=>tree.root.findAllByType(EditableSetRow)[0].props.onChange({load:'30'}));
  const logHandler=tree.root.findAllByType(EditableSetRow)[0].props.onConfirm;
  const deleteHandler=tree.root.findAllByType(SwipeDeleteCard).find(x=>x.props.onComplete).props.onDelete;
  await act(async()=>{logHandler();deleteHandler();});
  assert.equal(loggerState.setResults.length,0);assert(undo);
  await act(async()=>undo());assert.equal(loggerState.setResults.length,1,'Undo restores a set logged immediately before deletion');
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
  console.log('Workout interactions: swipe directions/cancellation, rapid preview edits/logging, swaps, delete/undo, completion, reopening and isolated foreground timers passed.');
}
main().then(()=>h.restore()).catch(e=>{h.restore();console.error(e);process.exitCode=1;});
