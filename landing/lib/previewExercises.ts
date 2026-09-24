// Display snapshot of src/runtime/exerciseCatalog.ts. Workout numbers in the tour are examples.
export type PreviewExercise = { id: string; name: string; primaryMuscles: string[]; secondaryMuscles: string[]; equipment: string[]; compound: boolean; incrementKg: number };
export const PREVIEW_EXERCISES: PreviewExercise[] = [
  {"id":"back_squat","name":"Back squat","primaryMuscles":["quads","glutes"],"secondaryMuscles":["hamstrings","core"],"equipment":["barbell","rack"],"compound":true,"incrementKg":2.5},
  {"id":"hack_squat","name":"Hack squat","primaryMuscles":["quads","glutes"],"secondaryMuscles":["hamstrings"],"equipment":["machine"],"compound":true,"incrementKg":5},
  {"id":"leg_press","name":"Leg press","primaryMuscles":["quads","glutes"],"secondaryMuscles":["hamstrings"],"equipment":["machine"],"compound":true,"incrementKg":5},
  {"id":"goblet_squat","name":"Goblet squat","primaryMuscles":["quads","glutes"],"secondaryMuscles":["core"],"equipment":["dumbbell"],"compound":true,"incrementKg":2},
  {"id":"romanian_deadlift","name":"Romanian deadlift","primaryMuscles":["hamstrings","glutes"],"secondaryMuscles":["back"],"equipment":["barbell"],"compound":true,"incrementKg":2.5},
  {"id":"seated_leg_curl","name":"Seated leg curl","primaryMuscles":["hamstrings"],"secondaryMuscles":[],"equipment":["machine"],"compound":false,"incrementKg":2.5},
  {"id":"hip_thrust","name":"Hip thrust","primaryMuscles":["glutes"],"secondaryMuscles":["hamstrings"],"equipment":["barbell","bench"],"compound":true,"incrementKg":2.5},
  {"id":"bench_press","name":"Bench press","primaryMuscles":["chest"],"secondaryMuscles":["triceps","delts"],"equipment":["barbell","bench"],"compound":true,"incrementKg":2.5},
  {"id":"incline_db_press","name":"Incline dumbbell press","primaryMuscles":["chest"],"secondaryMuscles":["triceps","delts"],"equipment":["dumbbell","bench"],"compound":true,"incrementKg":2},
  {"id":"machine_chest_press","name":"Machine chest press","primaryMuscles":["chest"],"secondaryMuscles":["triceps","delts"],"equipment":["machine"],"compound":true,"incrementKg":2.5},
  {"id":"overhead_press","name":"Overhead press","primaryMuscles":["delts"],"secondaryMuscles":["triceps","core"],"equipment":["barbell","rack"],"compound":true,"incrementKg":2.5},
  {"id":"neutral_grip_floor_press","name":"Neutral-grip floor press","primaryMuscles":["chest"],"secondaryMuscles":["triceps","delts"],"equipment":["dumbbell"],"compound":true,"incrementKg":2},
  {"id":"machine_lateral_raise","name":"Machine lateral raise","primaryMuscles":["delts"],"secondaryMuscles":[],"equipment":["machine"],"compound":false,"incrementKg":2.5},
  {"id":"lat_pulldown","name":"Lat pulldown","primaryMuscles":["back"],"secondaryMuscles":["biceps"],"equipment":["cable"],"compound":true,"incrementKg":2.5},
  {"id":"pull_up","name":"Pull-up","primaryMuscles":["back"],"secondaryMuscles":["biceps"],"equipment":["pullup_bar"],"compound":true,"incrementKg":2.5},
  {"id":"chest_supported_row","name":"Chest-supported row","primaryMuscles":["back"],"secondaryMuscles":["biceps","delts"],"equipment":["dumbbell","bench"],"compound":true,"incrementKg":2},
  {"id":"cable_row","name":"Cable row","primaryMuscles":["back"],"secondaryMuscles":["biceps","delts"],"equipment":["cable"],"compound":true,"incrementKg":2.5},
  {"id":"lateral_raise","name":"Lateral raise","primaryMuscles":["delts"],"secondaryMuscles":[],"equipment":["dumbbell"],"compound":false,"incrementKg":1},
  {"id":"cable_fly","name":"Cable fly","primaryMuscles":["chest"],"secondaryMuscles":["delts"],"equipment":["cable"],"compound":false,"incrementKg":2.5},
  {"id":"biceps_curl","name":"Dumbbell curl","primaryMuscles":["biceps"],"secondaryMuscles":[],"equipment":["dumbbell"],"compound":false,"incrementKg":1},
  {"id":"triceps_pressdown","name":"Triceps pressdown","primaryMuscles":["triceps"],"secondaryMuscles":[],"equipment":["cable"],"compound":false,"incrementKg":2.5},
  {"id":"calf_raise","name":"Standing calf raise","primaryMuscles":["calves"],"secondaryMuscles":[],"equipment":["machine"],"compound":false,"incrementKg":2.5},
  {"id":"cable_crunch","name":"Cable crunch","primaryMuscles":["core"],"secondaryMuscles":[],"equipment":["cable"],"compound":false,"incrementKg":2.5}
];
export const previewExercise = (id: string) => PREVIEW_EXERCISES.find(exercise => exercise.id === id)!;
