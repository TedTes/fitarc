const assert=require('node:assert/strict');
const h=require('./lib/react-harness.cjs');
const {React,act,render,mockFile}=h;
mockFile('src/screens/runtime/SourceIntake.tsx',{SourceIntake:'SourceIntake'});
const {PlanSurface}=require('../src/screens/runtime/PlanSurface.tsx');
const {TodayPlanContext}=require('../src/screens/runtime/TodayPlanContext.tsx');
const {prepareOnboardingTraining}=require('../src/runtime/onboarding.ts');
const {emptyRuntimeState}=require('../src/runtime/runtimePersistence.ts');
const {RUNTIME_EXERCISES}=require('../src/runtime/exerciseCatalog.ts');
const base=()=>prepareOnboardingTraining({...emptyRuntimeState(),catalog:RUNTIME_EXERCISES},{id:'test',trainingSplit:'upper_lower',experienceLevel:'beginner',planPreferences:{daysPerWeek:4,sessionMinutes:45,equipmentLevel:'full_gym',injuries:[]}},()=>0.4);
async function main(){
 let state=base(),setState;const defaults=state.source;
 const apply=fn=>{try{state=fn(state);setState(state);return {ok:true,state};}catch(error){return {ok:false,error};}};
 function Plan(){const [value,set]=React.useState(state);setState=set;return React.createElement(PlanSurface,{state:value,defaults,apply,active:true,sync:'synced'});}
 let tree=await render(React.createElement(Plan));
 const press=async(label)=>act(async()=>(tree.root.findAllByProps({label})[0]??tree.root.findByProps({accessibilityLabel:label})).props.onPress());
 assert.equal(tree.root.findAllByProps({accessibilityRole:'tab'}).length,0,'Goal and style live in Plan settings, not tabs');
 const settings=()=>tree.root.findByProps({title:'Plan settings'});
 const initial=JSON.stringify(state);
 await press('Plan settings');
 assert(settings().props.visible);
 assert.equal(tree.root.findAllByProps({label:'Apply goal'}).length,0,'No review until a different goal is picked');
 await press('Strength');
 assert.equal(JSON.stringify(state),initial,'Choosing a goal only previews');
 await act(async()=>settings().props.onClose());
 assert.equal(JSON.stringify(state),initial,'Cancel does not save');
 await press('Plan settings');await press('Strength');
 await press('Apply suggested reps and RIR to existing queue exercises');await press('Apply goal');
 assert.equal(state.source.goal,'strength');
 assert.equal(state.block.slots[0].plannedExercises[0].prescription.maxReps,8);
 await press('Plan settings');await press('Push / Pull / Legs');
 assert.equal(settings().props.visible,false,'Choosing a style closes Plan settings');
 assert.equal(state.source.trainingSplit,'push_pull_legs');
 await press('Edit queues');assert.equal(tree.root.findByType('SourceIntake').props.initial.routine.preferredSplit,'push_pull_legs');
 await act(async()=>tree.unmount());
 function Today(){const [value,set]=React.useState(state);setState=set;return React.createElement(TodayPlanContext,{state:value,defaults,apply,active:true});}
 tree=await render(React.createElement(Today));
 await act(async()=>tree.root.findByProps({accessibilityLabel:'Switch training style or group'}).props.onPress());
 await press('Upper / Lower');assert.equal(state.source.trainingSplit,'upper_lower');
 await act(async()=>tree.root.findByProps({accessibilityLabel:'Switch training style or group'}).props.onPress());
 await press('Lower');assert.equal(state.activeSession.slotId,state.block.slots.find(s=>s.label==='Lower').id);
 await act(async()=>tree.unmount());
 console.log('Plan UI: goal review/cancel/accept, target opt-in, settings sheet, queue editor and Today group switch passed.');
}
main().then(()=>h.restore()).catch(error=>{h.restore();console.error(error);process.exitCode=1;});
