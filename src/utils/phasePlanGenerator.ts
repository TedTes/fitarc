import { PhasePlan, User } from '../types/domain';

export const generatePhase = (
  user: User,
  currentLevelId: number,
  targetLevelId: number
): PhasePlan => {
  const startDate = new Date();
  const levelGap = targetLevelId - currentLevelId;
  const expectedWeeks = levelGap * 8; // 8 weeks per level
  
  const expectedEndDate = new Date(startDate);
  expectedEndDate.setDate(expectedEndDate.getDate() + expectedWeeks * 7);

  return {
    id: `phase_${Date.now()}`,
    currentLevelId,
    targetLevelId,
    name: `Arc ${startDate.getFullYear()}`,
    goalType: 'general',
    startDate: startDate.toISOString(),
    expectedEndDate: expectedEndDate.toISOString(),
    expectedWeeks,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
};
