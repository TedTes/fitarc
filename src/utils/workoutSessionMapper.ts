import { formatDateInTimeZone } from '../utils/time';
import { formatLocalDateYMD } from '../utils/date';
import { mapMuscleNameToGroup } from '../utils/workoutAnalytics';
import { MuscleGroup, WorkoutSessionEntry } from '../types/domain';

const extractBodyParts = (exerciseRow: any): MuscleGroup[] => {
  const links = Array.isArray(exerciseRow)
    ? exerciseRow
    : exerciseRow?.exercise?.muscle_links || [];

  return Array.from(
    new Set(
      links
        .map((link: any) => mapMuscleNameToGroup(link?.muscle?.name))
        .filter((m: MuscleGroup | null | undefined): m is MuscleGroup => !!m)
    )
  );
};

export const mapSessionRow = (
  session: any,
  phasePlanId: string | undefined,
  timeZone: string
): WorkoutSessionEntry => {
  const sessionExercises = session.session_exercises || [];
  const performedAtRaw = session.performed_at;
  let sessionDate = formatLocalDateYMD(new Date());
  if (performedAtRaw) {
    if (typeof performedAtRaw === 'string') {
      if (!performedAtRaw.includes('T')) {
        sessionDate = performedAtRaw;
      } else {
        const [datePart, timePartWithZone = ''] = performedAtRaw.split('T');
        const timePart = timePartWithZone.split('.')[0];
        const isMidnightUtc =
          timePart.startsWith('00:00:00') &&
          (timePartWithZone.includes('Z') || timePartWithZone.includes('+00:00'));
        sessionDate = isMidnightUtc
          ? datePart
          : formatDateInTimeZone(new Date(performedAtRaw), timeZone);
      }
    } else {
      sessionDate = formatDateInTimeZone(new Date(performedAtRaw), timeZone);
    }
  }
  return {
    id: session.id,
    phasePlanId: phasePlanId ?? session.plan_id,
    date: sessionDate,
    exercises: sessionExercises.map((se: any) => ({
      id: se.id,
      exerciseId: se.exercise?.id,
      name: se.exercise?.name || 'Unknown',
      bodyParts: extractBodyParts(se.exercise?.muscle_links || []),
      sets: 4,
      reps: '8-12',
      completed: se.complete || false,
      displayOrder: se.display_order,
      notes: se.notes,
      setDetails: (se.sets || []).map((s: any) => ({
        setNumber: s.set_number,
        reps: s.reps,
        weight: s.weight,
        rpe: s.rpe,
        restSeconds: s.rest_seconds,
      })),
    })),
    notes: session.notes,
    completed: session.complete || false,
  };
};
