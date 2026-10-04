import { addRuntimeExercise, commitRuntimeSession, compileTrainingBlock, solveTrainingSession } from './runtimeService';
import { defaultRoutine, editableRoutine, routineCatalog } from './routine';
import { createRuntimeId } from './id';
import { localDate, planWeek } from './planDates';
import { RUNTIME_EXERCISES } from './exerciseCatalog';
import { MUSCLES, phasesFor, RULE_VERSION, weeklyTargetsFor } from './trainingPolicy';
import type { Muscle, RuntimeState, TrainingSource } from './types';

/** Start only on explicit acceptance. Store the snapshot needed by the logger, without a recurring plan. */
export const startUnplannedWorkout = (state: RuntimeState, defaults: TrainingSource, exerciseId: string, date = localDate()): RuntimeState => {
  if (state.activeSession) throw Error('Finish your active workout first.');
  if (state.block && state.block.kind !== 'workout') throw Error('Start from your existing plan.');
  const source: TrainingSource = {
    ...(state.source ?? defaults), version: (state.source?.version ?? 0) + 1,
    routine: { ...defaultRoutine(), split: 'custom', workouts: [{ id: createRuntimeId(), name: 'Workout',
      exercises: [{ exerciseId, sets: 3, minReps: 8, maxReps: 12, targetRir: 2 }] }] },
  };
  const compiled = compileTrainingBlock(state, source);
  const ready: RuntimeState = { ...compiled, block: { ...compiled.block!, kind: 'workout' },
    blockHistory: [...new Map([...(state.blockHistory ?? []), ...(state.block ? [state.block] : [])].map(plan => [plan.id, plan])).values()] };
  return solveTrainingSession(ready, { date, minutesAvailable: source.sessionMinutes, recovery: 'yes', unavailableEquipment: [], unavailableExerciseIds: source.excludedExerciseIds, extraWorkout: true });
};

/** A separate workout shares the log, but never changes the user's saved routine or its order. */
export const startAdditionalWorkout = (
  state: RuntimeState, defaults: TrainingSource, exercises: import('./types').RoutineExercise[],
  name = 'Workout', date = localDate(),
): RuntimeState => {
  if (state.activeSession) throw Error('Finish your active workout first.');
  if (new Set(exercises.map(item => item.exerciseId)).size !== exercises.length) throw Error('Choose each exercise once.');
  let ready = state;
  if (!ready.block || !ready.source) {
    const source: TrainingSource = { ...(state.source ?? defaults),
      routine: { ...defaultRoutine(), split: 'custom', workouts: [{id:createRuntimeId(),name,exercises}] },
    };
    if (exercises.length) {
      ready = compileTrainingBlock(ready,source);
      ready = {...ready,block:{...ready.block!,kind:'workout'}};
    } else {
      // A blank logger needs a persistence snapshot, not an invented recurring routine.
      source.routine = { ...defaultRoutine(), customExercises: (state.source ?? defaults).routine?.customExercises };
      const id=createRuntimeId();
      ready={...ready,source,block:{id,groupId:id,kind:'workout',userId:source.userId,version:1,
        sourceId:source.id,sourceVersion:source.version,preferences:source,ruleVersion:RULE_VERSION,
        catalog:routineCatalog(source,state.catalog??RUNTIME_EXERCISES),goal:source.goal,
        startedOn:date,durationWeeks:6,currentWeek:1,scheduling:'sequence',phases:phasesFor(source.goal),slots:[],
        weeklySetBudget:Object.fromEntries(MUSCLES.map(muscle=>[muscle,0])) as Record<Muscle,number>,
        weeklyTargets:weeklyTargetsFor(source.goal,source.experience),createdAt:new Date().toISOString()}};
    }
  }
  const block={...ready.block!,currentWeek:planWeek(ready.block!,date)},source=ready.source!;
  ready={...ready,block};
  const session: import('./types').SessionPrescription = {
    id:createRuntimeId(),name,blockId:block.id,planGroupId:block.groupId??block.id,blockVersion:block.version,
    slotId:createRuntimeId(),context:{date,minutesAvailable:source.sessionMinutes,recovery:'yes',unavailableEquipment:[],unavailableExerciseIds:source.excludedExerciseIds,extraWorkout:true},
    phase:block.phases.find(p=>block.currentWeek>=p.startWeek&&block.currentWeek<=p.endWeek)?.kind??block.phases[0].kind,
    estimatedMinutes:0,exercises:[],status:'active',explanation:'',createdAt:new Date().toISOString(),
  };
  ready={...ready,activeSession:session,sessions:[...ready.sessions,session]};
  for (const item of exercises) ready=addRuntimeExercise(ready,item);
  return ready;
};

/** Repeat the structure of performed work; results, IDs and timestamps are always new. */
export const repeatWorkoutExercises = (session: import('./types').SessionPrescription): import('./types').RoutineExercise[] =>
  session.exercises.flatMap(entry=>{
    const completed=entry.sets.filter(set=>set.status==='completed' && (set.result?.completedReps??0)>0);
    if(!completed.length)return [];
    return [{exerciseId:entry.exercise.id,sets:completed.length,minReps:completed[0].minReps,maxReps:completed[0].maxReps,targetRir:completed[0].targetRir}];
  });

/** Opt-in only: add today's completed workout to the recurring routine. */
export const finishAndSaveNewWorkout = (state: RuntimeState): RuntimeState => {
  if (!state.activeSession || !state.block || !state.source) throw Error('No workout to save.');
  const session=state.activeSession;
  const exercises=repeatWorkoutExercises(session);
  if (!exercises.length) throw Error('Record a set before saving a routine.');
  const routine=state.block.kind==='workout'?{...defaultRoutine(),split:'custom' as const,workouts:[]}:editableRoutine(state.block);
  const source={...state.source,version:state.source.version+1,routine:{...routine,split:'custom' as const,workouts:[...routine.workouts,{id:createRuntimeId(),name:session.name??'Workout',exercises}]}};
  const updated=compileTrainingBlock(commitRuntimeSession(state),source);
  return {...updated,blockHistory:[...(state.blockHistory??[]).filter(block=>block.id!==state.block!.id),state.block]};
};
