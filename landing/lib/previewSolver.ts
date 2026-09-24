// A small, faithful mirror of the runtime's set-to-set rules so the interactive preview behaves like the
// app. Sources: solveNextSet() in src/runtime/setSolver.ts, hardSetCredit()/secondaryMuscleCredit/roundLoad()
// in src/runtime/trainingPolicy.ts, and the weekly credit maths in src/runtime/status.ts.
// Only the accumulate/deload distinction matters here. Loads, reps and weights in the tour are examples.

/** A set earns full credit only when the reported reps in reserve are at or under the target. */
export const hardSetCredit = (reportedRir: number, targetRir: number) => (reportedRir <= targetRir ? 1 : 0)

/** Assisting muscles earn half of whatever the set earns. */
export const secondaryMuscleCredit = 0.5

export const roundLoad = (loadKg: number, incrementKg: number) => {
  const increment = Math.max(0.5, incrementKg)
  return Math.max(0, Math.round(loadKg / increment) * increment)
}

export type SetSignal = {
  load: number
  reps: number
  rir: number
  minReps: number
  maxReps: number
  incrementKg: number
  deload?: boolean
}

/** The load the next set is prescribed, from the set you just logged. */
export const nextLoad = ({ load, reps, rir, minReps, maxReps, incrementKg, deload }: SetSignal): number => {
  if (deload) return load
  const missedBy = minReps - reps
  if (missedBy >= 3) return roundLoad(load * 0.9, incrementKg)
  if (missedBy > 0) return roundLoad(load * 0.95, incrementKg)
  if (rir === 0) return roundLoad(load * 0.95, incrementKg)
  if (reps >= maxReps && rir >= 2) return roundLoad(load + incrementKg, incrementKg)
  return load
}

const kg = (value: number) => `${Number.isInteger(value) ? value : Number(value.toFixed(2))} kg`
export const formatKg = kg

/** The frame's `rule` line, worded exactly like the app: "last reps hit + RIR3 → +2.5 kg". */
export const frameRule = (last: { load: number; reps: number; rir: number } | null, load: number, minReps: number) => {
  if (!last) return 'no prior signal → establish baseline'
  const change = Number((load - last.load).toFixed(2))
  return `${last.reps >= minReps ? 'last reps hit' : 'last reps missed'} + RIR${last.rir} → ${change > 0 ? `+${kg(change)}` : change < 0 ? `−${kg(Math.abs(change))}` : 'hold'}`
}
