export type RuntimeGoal = 'hypertrophy' | 'strength';
export type RuntimeExperience = 'intermediate' | 'advanced';
export type RecoveryState = 'yes' | 'meh' | 'no';
export type BlockPhaseKind = 'accumulate' | 'intensify' | 'peak' | 'deload';
export type Muscle =
  | 'chest'
  | 'back'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'delts'
  | 'biceps'
  | 'triceps'
  | 'calves'
  | 'core';

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'single_leg'
  | 'isolation'
  | 'carry';

export type SeedWorkingSet = {
  exerciseId: string;
  loadKg: number;
  reps: number;
  rir?: number;
};

export type TrainingSource = {
  id: string;
  userId: string;
  version: number;
  goal: RuntimeGoal;
  experience: RuntimeExperience;
  daysPerWeek: 3 | 4 | 5;
  sessionMinutes: 30 | 45 | 60 | 75;
  equipment: string[];
  excludedExerciseIds: string[];
  limitations: string[];
  seedWorkingSets: SeedWorkingSet[];
  createdAt: string;
};

export type BlockPhase = {
  kind: BlockPhaseKind;
  startWeek: number;
  endWeek: number;
  volumeMultiplier: number;
  targetRir: number;
  minReps: number;
  maxReps: number;
  intensityCap: number;
};

export type TrainingSlot = {
  id: string;
  dayIndex: number;
  label: string;
  targetMuscles: Muscle[];
  movementPatterns: MovementPattern[];
  muscleSetBudget: Partial<Record<Muscle, number>>;
  plannedExercises: PlannedExercise[];
};

export type ExerciseSelectionTrace = {
  originalExerciseId: string;
  originalExerciseName: string;
  selectedExerciseId: string;
  selectedExerciseName: string;
  substituted: boolean;
  forced: boolean;
  reasons: string[];
  avoidedLimitations: string[];
};

export type PlannedExercise = {
  exerciseId: string;
  sets: number;
  selection: ExerciseSelectionTrace;
};

export type TrainingBlock = {
  id: string;
  userId: string;
  version: number;
  sourceVersion: number;
  ruleVersion: string;
  goal: RuntimeGoal;
  startedOn: string;
  durationWeeks: number;
  currentWeek: number;
  phases: BlockPhase[];
  slots: TrainingSlot[];
  weeklySetBudget: Record<Muscle, number>;
  weeklyTargets: Record<Muscle, { min: number; max: number }>;
  createdAt: string;
};

export type ExerciseDefinition = {
  id: string;
  name: string;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  movementPattern: MovementPattern;
  equipment: string[];
  contraindications: string[];
  fatigueCost: number;
  setupMinutes: number;
  incrementKg: number;
  substitutionGroup: string;
  compound: boolean;
};

export type WorkingSetState = {
  exerciseId: string;
  loadKg: number;
  reps: number;
  rir: number;
  rirConfidence: number;
  updatedAt: string;
};

export type SessionContext = {
  date: string;
  minutesAvailable: 30 | 45 | 60 | 75;
  recovery: RecoveryState;
  unavailableExerciseIds: string[];
  unavailableEquipment: string[];
};

export type SetPrescription = {
  id: string;
  setNumber: number;
  loadKg: number;
  minReps: number;
  maxReps: number;
  targetRir: number;
  status: 'pending' | 'completed' | 'skipped';
};

export type PrescribedExercise = {
  id: string;
  exercise: ExerciseDefinition;
  priority: number;
  reason: string;
  sets: SetPrescription[];
};

export type SessionPrescription = {
  id: string;
  blockId: string;
  blockVersion: number;
  slotId: string;
  context: SessionContext;
  phase: BlockPhaseKind;
  estimatedMinutes: number;
  exercises: PrescribedExercise[];
  status: 'proposed' | 'active' | 'committed';
  explanation: string;
  createdAt: string;
};

export type SetResult = {
  prescriptionId: string;
  setId: string;
  exerciseId: string;
  prescribedLoadKg: number;
  prescribedMinReps: number;
  prescribedMaxReps: number;
  targetRir: number;
  completedReps: number;
  reportedRir: number;
  completedAt: string;
};

export type DecisionAction = 'increase' | 'hold' | 'decrease' | 'stop';

export type RuntimeDecision = {
  action: DecisionAction;
  nextLoadKg: number;
  nextMinReps: number;
  nextMaxReps: number;
  reasonCode: string;
  explanation: string;
  ruleVersion: string;
};

export type ExerciseDiff = {
  exerciseId: string;
  exerciseName: string;
  previous?: { loadKg: number; reps: number; rir: number };
  current: { loadKg: number; reps: number; rir: number };
  outcome: 'progressed' | 'held' | 'stalled';
  change: string;
};

export type SessionDiff = {
  sessionId: string;
  outcome: 'progressed' | 'held' | 'stalled';
  exercises: ExerciseDiff[];
};

export type WeeklyMuscleStatus = {
  muscle: Muscle;
  completedSets: number;
  scheduledSets: number;
  projectedSets: number | null;
  min: number;
  max: number;
  state: 'scheduled' | 'on_track' | 'projected_miss' | 'under' | 'in_range' | 'over';
};

export type WeeklyStatus = {
  weekState: 'in_progress' | 'complete';
  sessionsLogged: number;
  totalSessions: number;
  muscles: WeeklyMuscleStatus[];
  fatiguePercent: number;
  headroomSessions: number;
  deloadRecommended: boolean;
  reasons: string[];
};

export type RuntimeState = {
  updatedAt: string;
  source: TrainingSource | null;
  block: TrainingBlock | null;
  activeSession: SessionPrescription | null;
  sessions: SessionPrescription[];
  setResults: SetResult[];
  workingSets: Record<string, WorkingSetState>;
  decisions: RuntimeDecision[];
  committedSessionIds: string[];
  lastBlockDiff: string[];
};
