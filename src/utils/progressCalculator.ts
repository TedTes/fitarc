import { DailyAdherenceLog, PhasePlan, ProgressEstimate } from '../types/domain';

export const calculateProgress = (
  phase: PhasePlan,
  adherenceLogs: DailyAdherenceLog[]
): ProgressEstimate => {
  const phaseLogs = adherenceLogs.filter(log => log.phasePlanId === phase.id);

  if (phaseLogs.length === 0) {
    return {
      phasePlanId: phase.id,
      lastUpdated: new Date().toISOString(),
      progressPercent: 0,
      averageAdherence: 0,
      weeksElapsed: 0,
    };
  }

  const startDate = new Date(phase.startDate);
  const today = new Date();
  const daysElapsed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const weeksElapsed = daysElapsed / 7;

  const recentLogs = phaseLogs.slice(-14);
  const totalScore = recentLogs.reduce((sum, log) => sum + log.adherenceScore, 0);
  const averageAdherence = recentLogs.length > 0 ? totalScore / recentLogs.length : 0;

  let progressGainPerWeek = 0;
  if (averageAdherence >= 80) {
    progressGainPerWeek = 15;
  } else if (averageAdherence >= 60) {
    progressGainPerWeek = 10;
  } else if (averageAdherence >= 40) {
    progressGainPerWeek = 5;
  } else {
    progressGainPerWeek = 2;
  }

  let progressPercent = Math.min(100, Math.floor(weeksElapsed * progressGainPerWeek));

  const minWeeksForCompletion = phase.expectedWeeks * 0.75;
  if (weeksElapsed < minWeeksForCompletion) {
    progressPercent = Math.min(progressPercent, 70);
  }

  return {
    phasePlanId: phase.id,
    lastUpdated: new Date().toISOString(),
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
    averageAdherence: Math.round(averageAdherence),
    weeksElapsed: Math.round(weeksElapsed * 10) / 10,
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