import type { ExerciseDefinition } from '../runtime/types';
import { draftFromExtraction, type ExtractedRoutine } from './interpretation';

const numberWords:Record<string,string>={one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10',eleven:'11',twelve:'12',fifteen:'15',twenty:'20',thirty:'30',forty:'40',sixty:'60'};
const numbers=(text:string)=>text.toLowerCase().replace(/forty[- ]five/g,'45').replace(/seventy[- ]five/g,'75').replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|sixty)\b/g,w=>numberWords[w]);

/** Offline fallback: literal clauses, with unsupported prose retained for the user to review. */
export const interpretLocally=(text:string,catalog:ExerciseDefinition[])=>{
  if(!text.trim()||text.length>12000)throw Error('Enter a routine description of up to 12,000 characters.');
  const normalized=numbers(text);
  const extraction:ExtractedRoutine={days:Number(normalized.match(/\b([1-7])\s*(?:days|times)(?:\s+(?:a|per|each))?\s*(?:a\s+)?week\b/)?.[1])||null,
    minutes:Number(normalized.match(/\b(\d{2,3})\s*(?:minutes|mins?|m)\b/)?.[1])||null,goal:/\bstrength|stronger\b/.test(normalized)?'strength':/\bhypertrophy|build muscle\b/.test(normalized)?'hypertrophy':null,workouts:[],notes:[]};
  let current:ExtractedRoutine['workouts'][number]|undefined;
  const addWorkout=(name:string)=>{current={name:name.trim().replace(/\s+/g,' ').slice(0,80),exercises:[]};extraction.workouts.push(current);};
  const chunks=text.split(/\n|;|(?<=[.!?])\s+/).flatMap(line=>line.split(/,(?!\d)\s*(?:then\s+)?|\s+then\s+/));
  for(let original of chunks){
    original=original.trim();if(!original)continue;
    const header=original.match(/^(?:my\s+)?((?:push|pull|leg|legs|upper|lower|full[ -]?body)(?:\s+day)?|(?:day|workout)\s+[a-z0-9]+|[a-z][a-z0-9 -]{0,35})\s*:\s*(.*)$/i);
    if(header){addWorkout(header[1]);original=header[2].trim();if(!original)continue;}
    // Scheduling/goal sentences are metadata, not exercises.
    if(/^(?:i\s+(?:train|work out|usually|have|want)|usually|about|my goal)\b/i.test(original)&&!header)continue;
    const clause=numbers(original);
    if(/\b(?:seconds|metres|meters|kilometers|miles|laps)\b/.test(clause)){extraction.notes.push(`Timed/distance work needs manual review: ${original.slice(0,400)}`);continue;}
    const numericOnly=/^(?:\d|for\s+\d|at\s+\d|with\s+\d)/.test(clause);
    const prior=current?.exercises[current.exercises.length-1];
    const exercise=numericOnly&&prior?prior:{name:'',sets:null,minReps:null,maxReps:null,rir:null,weight:null,unit:null,basis:null,evidence:original} as ExtractedRoutine['workouts'][number]['exercises'][number];
    const range=clause.match(/\b(\d+)\s*(?:x|×|sets?\s*(?:of|for)?)\s*(\d+)(?:\s*[-–]\s*(\d+))?/);
    const sets=clause.match(/\b(\d+)\s*sets?\b/);
    const reps=clause.match(/\b(\d+)(?:\s*[-–]\s*(\d+))?\s*reps?\b/);
    const load=clause.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilos?|kilograms?|lb|lbs|pounds?)\b/);
    const unitted=clause.match(/\b(?:at|@)\s*(\d+(?:[.,]\d+)?)/);
    if(range){exercise.sets=Number(range[1]);exercise.minReps=Number(range[2]);exercise.maxReps=Number(range[3]??range[2]);}
    else{if(sets)exercise.sets=Number(sets[1]);if(reps){exercise.minReps=Number(reps[1]);exercise.maxReps=Number(reps[2]??reps[1]);}}
    if(load||unitted){exercise.weight=Number((load??unitted)![1].replace(',','.'));exercise.unit=load?(/^(?:lb|pound)/.test(load[2])?'lb':'kg'):null;}
    if(/\bper\s+(?:hand|dumbbell)|\beach\b/.test(clause))exercise.basis='per_hand';
    else if(/\btotal|combined|both\b/.test(clause))exercise.basis='total';
    const rir=clause.match(/\b(?:rir\s*(\d)|([0-5])\s*reps?\s*(?:left|in reserve))/);if(rir)exercise.rir=Number(rir[1]??rir[2]);
    if(numericOnly&&prior){exercise.evidence=text.slice(text.indexOf(prior.evidence),text.indexOf(original,text.indexOf(prior.evidence))+original.length);continue;}
    exercise.name=original.replace(/\s+(?:for\s+)?\d.*$/,'').replace(/\s+(?:at|with)\s+.*$/i,'').replace(/\s+(?:for\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:sets?|reps?).*$/i,'').replace(/[.!]+$/,'').trim();
    if(!exercise.name||/^(?:\d|for |at )/.test(exercise.name)){extraction.notes.push(`Check this part of your description: ${original.slice(0,400)}`);continue;}
    // Split a bare list, but leave equipment/name qualifiers intact.
    const names=exercise.sets===null&&exercise.weight===null?exercise.name.split(/\s+and\s+/i):[exercise.name];
    if(!current)addWorkout('My workout');
    for(const name of names)current!.exercises.push({...exercise,name});
  }
  return draftFromExtraction(extraction,text,catalog);
};
