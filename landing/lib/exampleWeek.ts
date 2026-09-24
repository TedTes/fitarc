// Illustrative example week for the marketing page: the numbers are examples, not user data.
// Labels mirror MUSCLE_LABEL in src/screens/runtime/copy.ts and the status rule mirrors rowStatus()
// in src/screens/runtime/WeekSurface.tsx, so a row here reads exactly like a row in the app.

export type WeekTone = 'success' | 'warning' | 'danger'
export type WeekRow = { muscle: string; label: string; done: number; projected: number; plan: number; min: number; max: number }

export const EXAMPLE_WEEK: WeekRow[] = [
  { muscle: 'chest', label: 'Chest', done: 6, projected: 12, plan: 12, min: 10, max: 16 },
  { muscle: 'back', label: 'Back', done: 6, projected: 12, plan: 12, min: 10, max: 16 },
  { muscle: 'delts', label: 'Shoulders', done: 4, projected: 8, plan: 8, min: 6, max: 12 },
  { muscle: 'biceps', label: 'Biceps', done: 3, projected: 6, plan: 6, min: 6, max: 10 },
  { muscle: 'triceps', label: 'Triceps', done: 2, projected: 4, plan: 6, min: 6, max: 10 },
  { muscle: 'core', label: 'Core', done: 2, projected: 4, plan: 4, min: 4, max: 8 },
  { muscle: 'quads', label: 'Quads', done: 3, projected: 6, plan: 10, min: 8, max: 14 },
  { muscle: 'hamstrings', label: 'Hamstrings', done: 6, projected: 10, plan: 10, min: 8, max: 14 },
  { muscle: 'glutes', label: 'Glutes', done: 12, projected: 18, plan: 14, min: 8, max: 14 },
  { muscle: 'calves', label: 'Calves', done: 2, projected: 4, plan: 8, min: 6, max: 10 },
]

export const TONE_COLOR: Record<WeekTone, string> = { success: '#5be08a', warning: '#f5c04a', danger: '#f87171' }

export const muscleName = (muscle: string) => EXAMPLE_WEEK.find(row => row.muscle === muscle)?.label ?? muscle
export const weekRow = (muscle: string) => EXAMPLE_WEEK.find(row => row.muscle === muscle)

/** Same formatting as formatSets() in the app: whole numbers stay whole, halves show one decimal. */
export const fmt = (sets: number) => (Number.isInteger(sets) ? String(sets) : sets.toFixed(1))

export const weekStatus = (row: Pick<WeekRow, 'min' | 'max'>, value: number): { label: string; tone: WeekTone; glyph: string } => {
  if (value > row.max) return { label: `${fmt(value - row.max)} over`, tone: 'danger', glyph: '↑' }
  if (value < row.min) return { label: `${fmt(row.min - value)} under`, tone: 'warning', glyph: '↓' }
  if (value >= row.max) return { label: 'high', tone: 'warning', glyph: '↑' }
  return { label: 'in range', tone: 'success', glyph: '✓' }
}

/** The dose number's colour in the app's table: over max is red, below plan is amber, otherwise green. */
export const doseTone = (row: Pick<WeekRow, 'plan' | 'max'>, value: number): WeekTone =>
  value > row.max ? 'danger' : value < row.plan ? 'warning' : 'success'

export const LOWER_BODY = ['quads', 'hamstrings', 'glutes', 'calves']
