import { DailyConsistencyLog, PhasePlan, ProgressEstimate } from '../types/domain';

export const calculateProgress = (
  phase: PhasePlan,
  dailyConsistency: DailyConsistencyLog[]
): ProgressEstimate => {
  const phaseLogs = dailyConsistency.filter(
    log => log.phasePlanId === phase.id && log.isConsistent
  );

  const startDate = new Date(phase.startDate);
  const today = new Date();
  const daysElapsed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  const expectedDays = phase.expectedWeeks * 7;
  const daysLogged = phaseLogs.length;
  
  // Time factor: how far through the expected duration (0-1, capped at 1)
  const timeFactor = Math.min(1, daysElapsed / expectedDays);
  
  // Adherence factor: ratio of consistent days to days elapsed (0-1)
  const adherenceFactor = daysElapsed > 0 ? Math.min(1, daysLogged / daysElapsed) : 0;
  
  // Progress: weighted combination (60% time, 40% adherence)
  const progressPercent = Math.min(100, Math.floor((timeFactor * 0.6 + adherenceFactor * 0.4) * 100));

  return {
    phasePlanId: phase.id,
    lastUpdated: new Date().toISOString(),
    progressPercent,
    daysActive: daysElapsed,
    daysLogged,
  };
};

export const shouldPromptPhotoCheckin = (
  phase: PhasePlan,
  photoCheckins: any[]
): boolean => {
  const phasePhotos = photoCheckins.filter(p => p.phasePlanId === phase.id);
  
  if (phasePhotos.length === 0) {
    const startDate = new Date(phase.startDate);
    const today = new Date();
    const daysElapsed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysElapsed >= 7;
  }

  const lastPhoto = phasePhotos[phasePhotos.length - 1];
  const lastPhotoDate = new Date(lastPhoto.date);
  const today = new Date();
  const daysSinceLastPhoto = Math.floor((today.getTime() - lastPhotoDate.getTime()) / (1000 * 60 * 60 * 24));
  
  return daysSinceLastPhoto >= 7;
};

export const isPhaseComplete = (
  phase: PhasePlan,
  progressEstimate: ProgressEstimate | null
): boolean => {
  if (!progressEstimate) return false;

  // Phase complete when progress >= 70% AND minimum 75% of expected time passed
  const minDays = phase.expectedWeeks * 7 * 0.75;
  const hasMetTimeRequirement = progressEstimate.daysActive >= minDays;
  const hasMetProgressRequirement = progressEstimate.progressPercent >= 70;

  return hasMetTimeRequirement && hasMetProgressRequirement;
};