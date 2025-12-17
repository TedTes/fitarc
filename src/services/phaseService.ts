import { supabase } from '../lib/supabaseClient';
import { PhasePlan, User } from '../types/domain';
import { generateWeekWorkouts, hasExistingWorkouts } from './workoutGenerationService';

type PhaseRow = {
  id: string;
  user_id: string;
  name: string | null;
  goal_type: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  current_physique_level: number | null;
  target_physique_level: number | null;
  created_at: string | null;
  updated_at: string | null;
};

const weeksBetween = (start?: string | null, end?: string | null): number => {
  if (!start || !end) {
    return 12;
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 12;
  }
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24 * 7)));
};

export const mapPhaseRow = (row: PhaseRow): PhasePlan => {
  const currentLevel = row.current_physique_level ?? 1;
  const targetLevel = row.target_physique_level ?? currentLevel + 1;
  const startDate = row.start_date || new Date().toISOString().split('T')[0];
  const endDate = row.end_date || startDate;

  return {
    id: row.id,
    currentLevelId: currentLevel,
    targetLevelId: targetLevel,
    name: row.name ?? undefined,
    goalType: row.goal_type ?? undefined,
    startDate,
    expectedEndDate: endDate,
    expectedWeeks: weeksBetween(row.start_date, row.end_date),
    status: row.status === 'completed' ? 'completed' : 'active',
    createdAt: row.created_at || startDate,
    updatedAt: row.updated_at || undefined,
  };
};

type CreatePhaseInput = {
  name?: string;
  goalType?: string;
  startDate?: string;
  endDate?: string;
  currentLevelId?: number;
  targetLevelId?: number;
};

export const createPhase = async (userId: string, input: CreatePhaseInput = {}) => {
  const now = new Date();
  const startDate = input.startDate || now.toISOString().split('T')[0];
  const targetLevel = input.targetLevelId ?? (input.currentLevelId ?? 1) + 1;
  const levelGap = Math.max(1, targetLevel - (input.currentLevelId ?? 1));
  const expectedWeeks = levelGap * 8;
  const endDate = input.endDate
    ? input.endDate
    : (() => {
        const projected = new Date(startDate);
        projected.setDate(projected.getDate() + expectedWeeks * 7);
        return projected.toISOString().split('T')[0];
      })();

  const { data, error } = await supabase
    .from('fitarc_workout_plans')
    .insert({
      user_id: userId,
      name: input.name ?? `Arc ${now.getFullYear()}`,
      goal_type: input.goalType ?? 'general',
      status: 'active',
      start_date: startDate,
      end_date: endDate,
      current_physique_level: input.currentLevelId ?? 1,
      target_physique_level: targetLevel,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapPhaseRow(data as PhaseRow);
};

/**
 * Creates a phase and automatically generates workout sessions for the week
 * This is the recommended way to create phases for new users
 */
export const createPhaseWithWorkouts = async (
  userId: string,
  trainingSplit: User['trainingSplit'],
  input: CreatePhaseInput = {}
): Promise<PhasePlan> => {
  console.log('📋 Creating phase with auto-generated workouts...');
  
  // 1. Create the phase
  const phase = await createPhase(userId, input);
  console.log(`✅ Phase created: ${phase.id}`);
  
  // 2. Check if workouts already exist (prevent duplicates)
  const alreadyHasWorkouts = await hasExistingWorkouts(userId, phase.id);
  
  if (alreadyHasWorkouts) {
    console.log('ℹ️ Workouts already exist for this phase, skipping generation');
    return phase;
  }
  
  // 3. Auto-generate workout sessions for the week
  const startDate = new Date(phase.startDate);
  
  try {
    await generateWeekWorkouts(userId, phase.id, trainingSplit, startDate);
    console.log('🎉 Phase created with workouts successfully');
  } catch (error) {
    console.error('⚠️ Phase created but workout generation failed:', error);
    // Don't throw - phase is still valid even if workout generation fails
    // User can manually create workouts
  }
  
  return phase;
};

export const completePhase = async (phaseId: string, endDate?: string) => {
  const { error } = await supabase
    .from('fitarc_workout_plans')
    .update({
      status: 'completed',
      end_date: endDate ?? new Date().toISOString().split('T')[0],
    })
    .eq('id', phaseId);

  if (error) {
    throw error;
  }
};

export const ensureActivePhase = async (
  userId: string,
  defaults?: { currentLevelId?: number; targetLevelId?: number }
): Promise<PhasePlan> => {
  const existing = await supabase
    .from('fitarc_workout_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.data) {
    return mapPhaseRow(existing.data as PhaseRow);
  }

  return createPhase(userId, {
    currentLevelId: defaults?.currentLevelId ?? 1,
    targetLevelId: defaults?.targetLevelId ?? (defaults?.currentLevelId ?? 1) + 1,
  });
};

/**
 * Fetch the active phase for a user
 */
export const fetchActivePhase = async (userId: string): Promise<PhasePlan | null> => {
  const { data, error } = await supabase
    .from('fitarc_workout_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching active phase:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  return mapPhaseRow(data as PhaseRow);
};