import { groupDraft } from '../../routineSetup/pools';
import { isPoolPattern } from '../../runtime/exercisePools';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { ExerciseDefinition, RoutineDefinition, TrainingSource } from '../../runtime/types';
import { compileBlock } from '../../runtime/blockCompiler';
import { defaultRoutine, editableRoutine } from '../../runtime/routine';
import { draftFromRoutine, type RoutineDraft } from '../../routineSetup/draft';
import { Button, Choice, Txt } from './ui';
import { FULL_GYM, DUMBBELLS } from './constants';
import { space } from './theme';
import { setupInputStyle } from './RoutineDraftReview';

export const GuidedRoutine=({initial,catalog,onReview,onBack}:{initial:TrainingSource;catalog:ExerciseDefinition[];onReview:(draft:RoutineDraft)=>void;onBack:()=>void})=>{
  const [step,setStep]=useState(0),[source,setSource]=useState(initial),[split,setSplit]=useState<RoutineDefinition['split']>(()=>{const preferred=initial.routine?.preferredSplit??initial.routine?.split;return preferred&&preferred!=='custom'?preferred:'auto';}),[error,setError]=useState('');
  const titles=['What would you like to focus on?','How often can you train?','How much time do you have?','Where will you train?','Any preferred workout structure?'];
  const review=()=>{
    try{
      if(!Number.isInteger(source.daysPerWeek)||source.daysPerWeek<1||source.daysPerWeek>7)throw Error('Choose 1–7 days per week.');
      if(!Number.isInteger(source.sessionMinutes)||source.sessionMinutes<10||source.sessionMinutes>180)throw Error('Choose 10–180 minutes.');
      const proposed={...source,routine:{...defaultRoutine(),progression:initial.routine?.progression??defaultRoutine().progression,split,preferredSplit:split}};
      const plan=compileBlock(proposed,undefined,undefined,catalog);
      if(!plan.slots.length||plan.slots.some(s=>!s.plannedExercises.length))throw Error('Could not build every workout with these preferences. Try different equipment or adjust your limitations.');
      const draft=draftFromRoutine(editableRoutine(plan),proposed,catalog,'guided');
      const pattern=isPoolPattern(split)?split:source.daysPerWeek<=3?'full_body':source.daysPerWeek===4?'upper_lower':'push_pull_legs';
      onReview(groupDraft(draft,pattern,catalog));
    }catch(e){setError(e instanceof Error?e.message:'Could not prepare a routine.');}
  };
  return <View style={{gap:space.md}}>
    <Txt variant="caption" tone="secondary">{step+1} of {titles.length}</Txt><Txt variant="heading">{titles[step]}</Txt>
    {step===0?(['hypertrophy','strength'] as const).map(goal=><Choice key={goal} label={goal==='strength'?'Get stronger':'Build muscle'} selected={source.goal===goal} onPress={()=>setSource({...source,goal})} />):null}
    {step===1?<><Txt variant="caption">Days per week (1–7)</Txt><TextInput style={setupInputStyle} keyboardType="number-pad" accessibilityLabel="Training days" value={String(source.daysPerWeek||'')} onChangeText={text=>setSource({...source,daysPerWeek:Number(text) as TrainingSource['daysPerWeek']})} /></>:null}
    {step===2?<TextInput style={setupInputStyle} keyboardType="number-pad" accessibilityLabel="Workout duration in minutes" value={String(source.sessionMinutes||'')} onChangeText={text=>setSource({...source,sessionMinutes:Number(text)})} />:null}
    {step===3?<><Choice label="Full gym" selected={source.equipment.includes('barbell')} onPress={()=>setSource({...source,equipment:FULL_GYM})} /><Choice label="Dumbbells and bench" selected={!source.equipment.includes('barbell')} onPress={()=>setSource({...source,equipment:DUMBBELLS})} /></>:null}
    {step===4?([['auto','Suggest a structure'],['full_body','Full body'],['upper_lower','Upper / lower'],['push_pull_legs','Push / pull / legs']] as const).map(([value,label])=><Choice key={value} label={label} selected={split===value} onPress={()=>setSplit(value)} />):null}
    {error?<Txt tone="danger">{error}</Txt>:null}
    <Button label={step===4?'Review suggested routine':'Continue'} onPress={()=>{setError('');if(step===1&&(!Number.isInteger(source.daysPerWeek)||source.daysPerWeek<1||source.daysPerWeek>7)){setError('Choose 1–7 days.');return;}if(step===2&&(!Number.isInteger(source.sessionMinutes)||source.sessionMinutes<10||source.sessionMinutes>180)){setError('Choose 10–180 minutes.');return;}if(step===4)review();else setStep(step+1);}} />
    <Button label="Back" variant="secondary" onPress={()=>{setError('');if(step)setStep(step-1);else onBack();}} />
  </View>;
};
