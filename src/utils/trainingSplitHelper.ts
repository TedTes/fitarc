import { TrainingSplit } from '../types/domain';

export type BodyPart = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core';

/**
 * Get today's focus body parts based on training split and day of week
 * @param trainingSplit - User's training split preference
 * @param dayIndex - Day of week (0 = Sunday, 1 = Monday, etc.)
 * @returns Array of body parts to focus on today
 */
export const getTodayFocusAreas = (
  trainingSplit: TrainingSplit,
  dayIndex: number
): BodyPart[] => {
  // Normalize to 0-6 (Sunday-Saturday)
  const day = dayIndex % 7;

  switch (trainingSplit) {
    case 'full_body':
      // Train full body 3x per week (Mon, Wed, Fri)
      if (day === 1 || day === 3 || day === 5) {
        return ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];
      }
      return [];

    case 'upper_lower':
      // Upper: Mon, Thu | Lower: Tue, Fri
      if (day === 1 || day === 4) {
        return ['chest', 'back', 'shoulders', 'arms'];
      }
      if (day === 2 || day === 5) {
        return ['legs', 'core'];
      }
      return [];

    case 'push_pull_legs':
      // Push: Mon, Thu | Pull: Tue, Fri | Legs: Wed, Sat
      if (day === 1 || day === 4) {
        return ['chest', 'shoulders', 'arms'];
      }
      if (day === 2 || day === 5) {
        return ['back', 'arms'];
      }
      if (day === 3 || day === 6) {
        return ['legs', 'core'];
      }
      return [];

    case 'bro_split':
      // Mon: Chest | Tue: Back | Wed: Shoulders | Thu: Arms | Fri: Legs
      if (day === 1) return ['chest'];
      if (day === 2) return ['back'];
      if (day === 3) return ['shoulders'];
      if (day === 4) return ['arms'];
      if (day === 5) return ['legs', 'core'];
      return [];

    case 'custom':
      // For custom, rotate through body parts based on day
      const rotation: BodyPart[][] = [
        [], // Sunday - rest
        ['chest', 'arms'], // Monday
        ['back'], // Tuesday
        ['legs', 'core'], // Wednesday
        ['shoulders', 'arms'], // Thursday
        ['chest', 'back'], // Friday
        [], // Saturday - rest
      ];
      return rotation[day] || [];

    default:
      return [];
  }
};

/**
 * Get a friendly label for a body part
 */
export const getBodyPartLabel = (bodyPart: BodyPart): string => {
  const labels: Record<BodyPart, string> = {
    chest: 'Chest',
    back: 'Back',
    legs: 'Legs',
    shoulders: 'Shoulders',
    arms: 'Arms',
    core: 'Core',
  };
  return labels[bodyPart];
};

/**
 * Get emoji icon for a body part
 */
export const getBodyPartEmoji = (bodyPart: BodyPart): string => {
  const emojis: Record<BodyPart, string> = {
    chest: '💪',
    back: '🔙',
    legs: '🦵',
    shoulders: '🔺',
    arms: '💪',
    core: '⭕',
  };
  return emojis[bodyPart];
};

/**
 * Check if today is a training day
 */
export const isTrainingDay = (
  trainingSplit: TrainingSplit,
  dayIndex: number
): boolean => {
  return getTodayFocusAreas(trainingSplit, dayIndex).length > 0;
};