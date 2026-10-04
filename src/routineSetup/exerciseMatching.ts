import type { ExerciseDefinition } from '../runtime/types';
const normalize=(text:string)=>text.toLowerCase().replace(/\bdumbbells?\b|\bdb\b/g,'dumbbell').replace(/\bbb\b/g,'barbell').replace(/[^a-z0-9]+/g,' ').trim();
const aliases:Record<string,string>={
  'barbell bench press':'bench_press','flat barbell bench press':'bench_press','barbell squat':'back_squat','barbell back squat':'back_squat',
  'barbell rdl':'romanian_deadlift','romanian deadlifts':'romanian_deadlift','lat pulldowns':'lat_pulldown',
  'pull ups':'pull_up','pullups':'pull_up','dumbbell curls':'biceps_curl','dumbbell biceps curl':'biceps_curl',
  'incline dumbbells':'incline_db_press','incline dumbbell bench press':'incline_db_press','lateral raises':'lateral_raise',
  'tricep pushdowns':'triceps_pressdown','triceps pushdown':'triceps_pressdown',
};
const normalizedAliases=Object.fromEntries(Object.entries(aliases).map(([name,id])=>[normalize(name),id]));
export const matchExercise=(name:string,catalog:ExerciseDefinition[])=>{
  const query=normalize(name);
  const exact=catalog.filter(x=>normalize(x.name)===query || normalize(x.id)===query || x.id===normalizedAliases[query]);
  if(exact.length===1)return {exerciseId:exact[0].id,candidates:exact};
  const words=query.split(' ').filter(x=>x.length>2);
  const candidates=catalog.map(exercise=>({exercise,score:words.reduce((sum,w)=>sum+(normalize(exercise.name).includes(w)?1:0),0)}))
    .filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.exercise.name.localeCompare(b.exercise.name)).map(x=>x.exercise);
  // A partial/fuzzy match is a suggestion, never an automatic selection.
  return {exerciseId:null,candidates:exact.length?exact:candidates};
};
