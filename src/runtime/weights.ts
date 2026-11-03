import type { RuntimeState, TrainingSource } from './types';

export type WeightUnit='kg'|'lb';
export type WeightRange={minKg:number;maxKg:number;stepKg?:number};
export const fromKg=(kg:number,unit:WeightUnit)=>unit==='lb'?kg*2.2046226218:kg;
export const toKg=(weight:number,unit:WeightUnit)=>unit==='lb'?weight/2.2046226218:weight;
// Round converted pounds for display; retain the original kg value in storage.
export const weightText=(kg:number,unit:WeightUnit,step=unit==='lb'?1:0.25)=>String(Number((Math.round(fromKg(kg,unit)/step)*step).toFixed(2)));
export const rangeLoad=(range:WeightRange,index:number,count:number)=>{const value=range.minKg+(range.maxKg-range.minKg)*(count>1?index/(count-1):0);const step=range.stepKg??0.25;return Math.min(range.maxKg,Math.max(range.minKg,Number((Math.round(value/step)*step).toFixed(6))));};
export const saveWeightSettings=(state:RuntimeState,defaults:TrainingSource,patch:{weightUnit?:WeightUnit;exerciseId?:string;range?:WeightRange|null}):RuntimeState=>{
  if(patch.weightUnit&&patch.weightUnit!=='kg'&&patch.weightUnit!=='lb')throw Error('Choose kg or lb.');
  if(patch.range&&(!Number.isFinite(patch.range.minKg)||!Number.isFinite(patch.range.maxKg)||patch.range.minKg<0||patch.range.maxKg<patch.range.minKg))throw Error('Enter a valid minimum and maximum weight.');
  if(patch.range?.stepKg!==undefined&&(!Number.isFinite(patch.range.stepKg)||patch.range.stepKg<=0))throw Error('Choose a valid weight increment.');
  const source={...(state.source??defaults),...(patch.weightUnit?{weightUnit:patch.weightUnit}:{})};
  if(patch.exerciseId){
    source.weightRanges={...source.weightRanges};
    if(patch.range)source.weightRanges[patch.exerciseId]=patch.range;else delete source.weightRanges[patch.exerciseId];
  }
  const range=patch.range;
  const session=range&&state.activeSession?{...state.activeSession,exercises:state.activeSession.exercises.map(entry=>entry.exercise.id!==patch.exerciseId?entry:{
    ...entry,needsBaseline:false,sets:entry.sets.map((set,index)=>set.status==='pending'?{...set,loadKg:rangeLoad(range,index,entry.sets.length)}:set),
  })}:state.activeSession;
  return {...state,source,activeSession:session,sessions:session?state.sessions.map(item=>item.id===session.id?session:item):state.sessions};
};
