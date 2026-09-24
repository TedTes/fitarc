// Mirror of PART_LIFTS in src/screens/runtime/muscleParts.ts. The runtime tracks weekly volume per muscle
// GROUP, so an individual muscle (a "part") can only say which lifts train it. That is anatomy, not
// runtime data, which is why volume for a selected part is always the whole group's volume.
import { PREVIEW_EXERCISES, previewExercise, type PreviewExercise } from './previewExercises'

type PartLifts = { primary: string[]; assist: string[] }
const SQUATS = ['back_squat', 'hack_squat', 'leg_press', 'goblet_squat']
const HAMSTRING_LIFTS: PartLifts = { primary: ['romanian_deadlift', 'seated_leg_curl'], assist: ['hip_thrust'] }

const PART_LIFTS: Record<string, PartLifts> = {
  upper_traps: { primary: [], assist: ['cable_row', 'chest_supported_row', 'overhead_press'] },
  mid_traps: { primary: ['cable_row', 'chest_supported_row'], assist: ['lat_pulldown', 'pull_up'] },
  lower_traps: { primary: ['lat_pulldown', 'pull_up'], assist: ['cable_row'] },
  infraspinatus: { primary: [], assist: ['chest_supported_row', 'cable_row'] },
  teres_major: { primary: ['lat_pulldown', 'pull_up'], assist: ['cable_row', 'chest_supported_row'] },
  lats: { primary: ['lat_pulldown', 'pull_up'], assist: ['cable_row', 'chest_supported_row'] },
  erectors: { primary: ['romanian_deadlift'], assist: ['back_squat'] },
  upper_chest: { primary: ['incline_db_press'], assist: ['bench_press'] },
  lower_chest: { primary: ['bench_press', 'machine_chest_press', 'neutral_grip_floor_press', 'cable_fly'], assist: ['incline_db_press'] },
  vastus_lateralis: { primary: SQUATS, assist: [] },
  rectus_femoris: { primary: SQUATS, assist: [] },
  vastus_medialis: { primary: SQUATS, assist: [] },
  biceps_femoris: HAMSTRING_LIFTS,
  medial_hamstrings: HAMSTRING_LIFTS,
}

export type Lift = { exercise: PreviewExercise; role: 'primary' | 'assist' }

/** Lifts that train a muscle group, or one of its parts, direct work first. */
export const liftsFor = (muscle: string, part: string | null): Lift[] => {
  const spec = part && part !== muscle ? PART_LIFTS[part] : undefined
  if (spec) return [...spec.primary.map(id => ({ exercise: previewExercise(id), role: 'primary' as const })), ...spec.assist.map(id => ({ exercise: previewExercise(id), role: 'assist' as const }))]
  return PREVIEW_EXERCISES
    .filter(exercise => exercise.primaryMuscles.includes(muscle) || exercise.secondaryMuscles.includes(muscle))
    .map(exercise => ({ exercise, role: exercise.primaryMuscles.includes(muscle) ? 'primary' as const : 'assist' as const }))
    .sort((a, b) => Number(b.role === 'primary') - Number(a.role === 'primary'))
}
