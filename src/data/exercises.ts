import { BodyPart } from '../utils/trainingSplitHelper';

export type Exercise = {
  name: string;
  bodyParts: BodyPart[];
};

export const exercises: Exercise[] = [
  // Chest
  { name: 'Barbell Bench Press', bodyParts: ['chest', 'arms'] },
  { name: 'Incline Dumbbell Press', bodyParts: ['chest', 'shoulders'] },
  { name: 'Push-Ups', bodyParts: ['chest', 'arms'] },
  { name: 'Cable Fly', bodyParts: ['chest'] },
  { name: 'Dips', bodyParts: ['chest', 'arms'] },
  
  // Back
  { name: 'Pull-Ups', bodyParts: ['back', 'arms'] },
  { name: 'Barbell Row', bodyParts: ['back'] },
  { name: 'Lat Pulldown', bodyParts: ['back', 'arms'] },
  { name: 'Cable Row', bodyParts: ['back'] },
  { name: 'Deadlift', bodyParts: ['back', 'legs'] },
  
  // Legs
  { name: 'Barbell Squat', bodyParts: ['legs'] },
  { name: 'Romanian Deadlift', bodyParts: ['legs', 'back'] },
  { name: 'Leg Press', bodyParts: ['legs'] },
  { name: 'Walking Lunges', bodyParts: ['legs'] },
  { name: 'Leg Curl', bodyParts: ['legs'] },
  
  // Shoulders
  { name: 'Overhead Press', bodyParts: ['shoulders', 'arms'] },
  { name: 'Lateral Raises', bodyParts: ['shoulders'] },
  { name: 'Face Pulls', bodyParts: ['shoulders', 'back'] },
  { name: 'Arnold Press', bodyParts: ['shoulders'] },
  
  // Arms
  { name: 'Barbell Curl', bodyParts: ['arms'] },
  { name: 'Tricep Pushdowns', bodyParts: ['arms'] },
  { name: 'Hammer Curls', bodyParts: ['arms'] },
  { name: 'Overhead Tricep Extension', bodyParts: ['arms'] },
  
  // Core
  { name: 'Planks', bodyParts: ['core'] },
  { name: 'Ab Wheel Rollouts', bodyParts: ['core'] },
  { name: 'Hanging Leg Raises', bodyParts: ['core'] },
  { name: 'Cable Crunches', bodyParts: ['core'] },
];

/**
 * Get random exercises for given body parts
 */
const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};

const seededRandom = (seed: string) => {
  let state = hashString(seed);
  return () => {
    state = (state * 1664525 + 1013904223) % 0xffffffff;
    return Math.abs(state / 0xffffffff);
  };
};

const shuffleWithSeed = <T>(input: T[], seed: string): T[] => {
  const array = [...input];
  const random = seededRandom(seed);
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const FALLBACK_BODY_PARTS: BodyPart[] = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];

export const getExercisesForBodyParts = (
  bodyParts: BodyPart[],
  count: number = 5,
  seed: string = ''
): string[] => {
  const targets = bodyParts.length ? bodyParts : FALLBACK_BODY_PARTS;
  const matching = exercises.filter((exercise) =>
    exercise.bodyParts.some((bp) => targets.includes(bp))
  );
  const shuffled = seed ? shuffleWithSeed(matching, seed) : [...matching];
  if (!seed) {
    shuffled.sort(() => Math.random() - 0.5);
  }
  return shuffled.slice(0, count).map((exercise) => exercise.name);
};
