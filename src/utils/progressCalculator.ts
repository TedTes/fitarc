import { DailyLog, PhasePlan, ProgressEstimate } from '../types/domain';

export const calculateProgress = (
  phase: PhasePlan,
  dailyLogs: DailyLog[]
): ProgressEstimate => {
  const phaseLogs = dailyLogs.filter(log => log.phasePlanId === phase.id && log.loggedActivity);

  const startDate = new Date(phase.startDate);
  const today = new Date();
  const daysElapsed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  const expectedDays = phase.expectedWeeks * 7;
  const daysLogged = phaseLogs.length;
  
  // Progress = (days logged / expected days) * 100, capped at 100%
  const progressPercent = Math.min(100, Math.floor((daysLogged / expectedDays) * 100));

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