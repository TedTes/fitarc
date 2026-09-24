import { useEffect, useRef, useState } from 'react'
import { MUSCLE_MASKS, type MuscleMapView } from '../lib/muscleMasks'
import { previewExercise, type PreviewExercise } from '../lib/previewExercises'
import { LOWER_BODY, doseTone, fmt, muscleName, weekRow, weekStatus } from '../lib/exampleWeek'
import { formatKg, frameRule, hardSetCredit, nextLoad, secondaryMuscleCredit } from '../lib/previewSolver'

export { muscleName }
const defaultView = (exercise: PreviewExercise): MuscleMapView =>
  MUSCLE_MASKS.front.some(mask => mask.muscle === exercise.primaryMuscles[0]) ? 'front' : 'back'

export function TargetFigure({ exercise, view = defaultView(exercise), zoom = false, compact = false, selected, onSelect }: {
  exercise: PreviewExercise; view?: MuscleMapView; zoom?: boolean; compact?: boolean;
  selected?: string | null; onSelect?: (muscle: string, label: string) => void;
}) {
  const legs = LOWER_BODY.includes(selected ?? exercise.primaryMuscles[0])
  const bounds = zoom || compact ? (legs ? '140 305 232 370' : '115 105 280 225') : '0 0 512 768'
  return <svg className={compact ? 'target-figure compact' : 'target-figure'} viewBox={bounds} role={onSelect ? 'group' : undefined} aria-hidden={onSelect ? undefined : true} aria-label={onSelect ? `${view} exercise targets` : undefined}>
    <image href={`/images/muscle-map/athlete-${view}-v2.png`} width="512" height="768" />
    {MUSCLE_MASKS[view].map(mask => {
      const primary = exercise.primaryMuscles.includes(mask.muscle)
      const secondary = exercise.secondaryMuscles.includes(mask.muscle)
      return primary || secondary || selected === mask.muscle ? <path key={mask.part} d={mask.visible} fill="#f48d4d" fillOpacity={primary ? .55 : secondary ? .18 : 0} stroke={selected === mask.muscle ? '#f3f5f8' : '#f48d4d'} strokeOpacity={selected === mask.muscle ? 1 : primary ? .85 : .4} strokeWidth={selected === mask.muscle ? 2 : 1} /> : null
    })}
    {onSelect && MUSCLE_MASKS[view].map(mask => <g className="muscle-region" key={mask.part} role="button" tabIndex={0} aria-label={mask.label ? `Inspect ${mask.label}, part of ${muscleName(mask.muscle).toLowerCase()}` : `Inspect ${muscleName(mask.muscle)}`} onClick={() => onSelect(mask.muscle, mask.label ?? muscleName(mask.muscle))} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(mask.muscle, mask.label ?? muscleName(mask.muscle)) } }}><path className="muscle-hit" d={mask.hit} /></g>)}
  </svg>
}

export function ExerciseDetails({ exercise }: { exercise: PreviewExercise }) {
  const [view, setView] = useState<MuscleMapView>(() => defaultView(exercise))
  const [zoom, setZoom] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedLabel, setSelectedLabel] = useState('')
  const inspect = (muscle: string) => {
    if (!MUSCLE_MASKS[view].some(mask => mask.muscle === muscle)) setView(view === 'front' ? 'back' : 'front')
    setSelected(muscle)
    setSelectedLabel(muscleName(muscle))
  }
  return <div className="exercise-demo">
    <p className="preview-muted">{exercise.compound ? 'Compound lift' : 'Isolation lift'} · {exercise.equipment.join(' · ')}</p>
    <div className="preview-toolbar">
      <div className="preview-segments" role="group" aria-label="Exercise muscle view">{(['front', 'back'] as const).map(side => <button key={side} type="button" aria-pressed={view === side} onClick={() => { setView(side); setSelected(null) }}>{side}</button>)}</div>
      <button className="preview-text-button" type="button" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>{zoom ? 'Full body' : 'Zoom'}</button>
    </div>
    <TargetFigure exercise={exercise} view={view} zoom={zoom} selected={selected} onSelect={(muscle, label) => { setSelected(muscle); setSelectedLabel(label) }} />
    <div className="target-legend"><span><i />Primary</span><span><i className="assisting" />Assisting</span></div>
    {[{ label: 'Primary', muscles: exercise.primaryMuscles }, { label: 'Assisting', muscles: exercise.secondaryMuscles }].filter(group => group.muscles.length).map(group => <div className="target-group" key={group.label}><span>{group.label}</span><div>{group.muscles.map(muscle => <button type="button" key={muscle} aria-pressed={selected === muscle} onClick={() => inspect(muscle)}>{muscleName(muscle)}</button>)}</div></div>)}
    <p className="preview-muted" aria-live="polite">{selected ? `${selectedLabel} · ${exercise.primaryMuscles.includes(selected) ? 'primary target' : exercise.secondaryMuscles.includes(selected) ? 'assisting muscle' : 'not a listed target for this lift'}` : 'Tap the body or select a muscle group to inspect.'}</p>
    <p className="preview-footnote">Highlights show the lift’s muscle groups. Effort and weekly volume are tracked separately.</p>
  </div>
}

function TargetButton({ exercise, onClick, label }: { exercise: PreviewExercise; onClick: () => void; label: string }) {
  return <button className="preview-target-button" type="button" onClick={onClick} aria-label={`Inspect ${exercise.name} muscle targets`}>
    <TargetFigure exercise={exercise} compact />
    <span><small>{label}</small><strong>{exercise.primaryMuscles.map(muscleName).join(' · ')}</strong><small>Assists · {exercise.secondaryMuscles.map(muscleName).join(' · ') || 'none listed'}</small></span><span aria-hidden="true" className="preview-target-arrow">↗</span>
  </button>
}

// ── Sample session ─────────────────────────────────────────────────────────────────────────────
// The tour mirrors the app's set-to-set rules (see lib/previewSolver.ts). Every load, rep and volume
// figure below is an example, and nothing here is stored or sent anywhere.
const TOTAL_SETS = 3
const MIN_REPS = 8
const MAX_REPS = 12
const TARGET_RIR = 3
const REST_SECONDS = 120 // prescribed by the runtime for a compound lift in a hypertrophy block

type PreviewTab = 'solver()' | 'block' | 'week'
type Detail = { exercise: PreviewExercise; replacement?: boolean }
type Frame = { load: number; last: { load: number; reps: number; rir: number; inSession: boolean } | null }
type LoggedSet = { exerciseId: string; credit: number }
type TourStep = 'inspect' | 'compare' | 'week'

const START_LOAD: Record<string, number> = { machine_chest_press: 42.5, bench_press: 30 }
const openingFrame = (id: string): Frame => id === 'machine_chest_press'
  ? { load: START_LOAD[id], last: { load: 40, reps: 12, rir: 3, inSession: false } }
  : { load: START_LOAD[id] ?? 10, last: null }
const rirText = (value: number) => (value === 4 ? '4+' : String(value))

const BLOCK_DAYS = {
  'upper.a': ['machine_chest_press', 'lat_pulldown', 'biceps_curl'],
  'lower.a': ['back_squat', 'romanian_deadlift', 'seated_leg_curl'],
} as const
const WEEK_LIFT: Record<string, string> = { chest: 'machine_chest_press', triceps: 'triceps_pressdown', quads: 'back_squat', hamstrings: 'romanian_deadlift' }
const WEEK_ROWS = ['chest', 'triceps', 'quads', 'hamstrings']
const PHASES = [{ weeks: 'W1–2', name: 'acc' }, { weeks: 'W3–4', name: 'int' }, { weeks: 'W5', name: 'peak' }, { weeks: 'W6', name: 'deload' }]

export function TrainingPreview() {
  const scroll = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<PreviewTab>('solver()')
  const [exercise, setExercise] = useState(() => previewExercise('machine_chest_press'))
  const [detail, setDetail] = useState<Detail | null>(null)
  const [swapping, setSwapping] = useState(false)
  const [day, setDay] = useState<keyof typeof BLOCK_DAYS>('upper.a')
  const [phase, setPhase] = useState<'ready' | 'active' | 'rest'>('ready')
  const [sets, setSets] = useState<LoggedSet[]>([])
  const [frame, setFrame] = useState<Frame>(() => openingFrame('machine_chest_press'))
  const [reps, setReps] = useState(MAX_REPS)
  const [rir, setRir] = useState(TARGET_RIR)
  const [notice, setNotice] = useState('')

  const complete = sets.length >= TOTAL_SETS
  const earned = sets.reduce((sum, set) => sum + set.credit, 0)
  useEffect(() => { scroll.current?.scrollTo(0, 0) }, [tab, detail?.exercise.id, swapping])

  const changeTab = (next: PreviewTab) => { setTab(next); setDetail(null); setSwapping(false); setNotice('') }
  const replacements = ['bench_press', 'neutral_grip_floor_press', 'machine_chest_press'].map(previewExercise).filter(lift => lift.id !== exercise.id)
  const restartSession = () => { setPhase('ready'); setSets([]); setFrame(openingFrame('machine_chest_press')); setExercise(previewExercise('machine_chest_press')); setReps(MAX_REPS); setRir(TARGET_RIR); setNotice('') }
  const reset = () => { changeTab('solver()'); restartSession() }

  const finishSet = () => {
    const next = nextLoad({ load: frame.load, reps, rir, minReps: MIN_REPS, maxReps: MAX_REPS, incrementKg: exercise.incrementKg })
    const credit = hardSetCredit(rir, TARGET_RIR)
    const logged = [...sets, { exerciseId: exercise.id, credit }]
    setSets(logged)
    setFrame({ load: next, last: { load: frame.load, reps, rir, inSession: true } })
    setReps(MAX_REPS); setRir(TARGET_RIR)
    const change = Number((next - frame.load).toFixed(2))
    const counted = credit ? '' : ` RIR ${rirText(rir)} is above the target of ${TARGET_RIR}, so this set adds no set credit.`
    if (logged.length >= TOTAL_SETS) {
      setPhase('ready')
      setNotice(`${exercise.name} done · ${logged.reduce((sum, set) => sum + set.credit, 0)} of ${TOTAL_SETS} sets earned credit.${counted}`)
    } else {
      setPhase('rest')
      setNotice(`Logged ${reps} reps at RIR ${rirText(rir)}. Next set: ${formatKg(next)}${change > 0 ? ` (+${formatKg(change)})` : change < 0 ? ` (−${formatKg(Math.abs(change))})` : ' · hold'}.${counted}`)
    }
  }
  const primary = () => {
    if (complete) return changeTab('week')
    if (phase === 'ready') { setPhase('active'); setNotice('Set started. Adjust your reps and RIR, then finish.') }
    else if (phase === 'active') finishSet()
    else { setPhase('ready'); setNotice('Ready for the next set.') }
  }
  const replaceLift = (lift: PreviewExercise) => {
    setExercise(lift); setFrame(openingFrame(lift.id)); setReps(MAX_REPS); setRir(TARGET_RIR)
    setDetail(null); setSwapping(false)
    setNotice(`Lift replaced. ${sets.length ? `Your ${sets.length} logged ${sets.length === 1 ? 'set stays' : 'sets stay'}.` : 'Nothing was logged yet.'} A swap can’t be undone.`)
  }

  // Guided tour: the three buttons under the phone drive it into the states they describe.
  const active: TourStep | null = detail ? (detail.replacement ? 'compare' : 'inspect') : swapping ? 'compare' : tab === 'week' ? 'week' : null
  const tour = (step: TourStep) => {
    setNotice('')
    if (step === 'week') return changeTab('week')
    setTab('solver()')
    if (step === 'inspect') { setSwapping(false); setDetail({ exercise }) }
    else { if (complete) restartSession(); else if (phase === 'active') setPhase('ready'); setDetail(null); setSwapping(true) }
  }

  // Weekly volume for the Week tab: the example week plus the credit this session's sets earned.
  // A logged set moves one planned set into "done", so projected only changes when a set earns no credit.
  const sessionEffect = (muscle: string) => sets.reduce((acc, set) => {
    const lift = previewExercise(set.exerciseId)
    const weight = lift.primaryMuscles.includes(muscle) ? 1 : lift.secondaryMuscles.includes(muscle) ? secondaryMuscleCredit : 0
    return { done: acc.done + set.credit * weight, projected: acc.projected + (set.credit - 1) * weight }
  }, { done: 0, projected: 0 })

  const phaseLabel = complete ? 'exercise complete' : phase === 'active' ? 'set in progress' : phase === 'rest' ? `rest · ${Math.floor(REST_SECONDS / 60)}:${String(REST_SECONDS % 60).padStart(2, '0')}` : 'ready'
  const currentSet = Math.min(sets.length + 1, TOTAL_SETS)
  const inputsLocked = phase === 'rest' || complete

  return <div className="phone-wrap">
    <div className="phone-glow" />
    <div className="tour" role="group" aria-label="Guided preview">
      <span className="tour-label">TRY THE PREVIEW</span>
      <button type="button" aria-current={active === 'inspect' ? 'step' : undefined} onClick={() => tour('inspect')}><b>01</b> Inspect a lift</button>
      <button type="button" aria-current={active === 'compare' ? 'step' : undefined} onClick={() => tour('compare')}><b>02</b> Swap a lift</button>
      <button type="button" aria-current={active === 'week' ? 'step' : undefined} onClick={() => tour('week')}><b>03</b> Weekly volume</button>
    </div>
    <section className="runtime-phone product-preview" aria-label="Interactive app preview">
      <div className="phone-sensor" />
      <div className="preview-disclaimer"><span>INTERACTIVE PREVIEW · SAMPLE DATA</span><button type="button" onClick={reset}>Reset</button></div>
      <div className="preview-scroll" ref={scroll}>
        {detail ? <>
          <button className="preview-text-button preview-back" type="button" autoFocus onClick={() => setDetail(null)}>← {swapping ? 'Compare lifts' : `Back to ${tab}`}</button>
          <p className="preview-title">{detail.exercise.name}</p>
          {detail.replacement && <p className="preview-muted">Replacing {exercise.name}. {sets.length ? `Your ${sets.length} logged ${sets.length === 1 ? 'set stays' : 'sets stay'}.` : 'Nothing is logged yet.'}</p>}
          <ExerciseDetails key={detail.exercise.id} exercise={detail.exercise} />
          {detail.replacement && <button className="preview-primary" type="button" onClick={() => replaceLift(detail.exercise)}>Use {detail.exercise.name}</button>}
        </> : swapping ? <>
          <button className="preview-text-button preview-back" type="button" autoFocus onClick={() => setSwapping(false)}>← Back to solver()</button>
          <p className="preview-title">Compare before you swap.</p>
          <p className="preview-muted">Current: {exercise.name}. Inspect a replacement’s targets and equipment. Logged sets stay; the remaining sets move to the new lift.</p>
          {replacements.map(lift => <button className="preview-lift" type="button" key={lift.id} onClick={() => setDetail({ exercise: lift, replacement: true })}><span><strong>{lift.name}</strong><small>{lift.equipment.join(' · ')} · {lift.primaryMuscles.map(muscleName).join(', ')}</small></span><span aria-hidden="true">↗</span></button>)}
          <p className="preview-footnote">In the app, replacements reflect your equipment and limitations.</p>
        </> : tab === 'solver()' ? <>
          <div className="phone-header"><strong>solver()<i>.</i></strong><span>upper.a · set {currentSet} of {TOTAL_SETS}</span></div>
          <p className="runtime-goal">maximize chest_hypertrophy</p>
          <div className="section-line"><b>STACK</b><span>{sets.length} of {TOTAL_SETS} sets logged</span></div>
          <div className="preview-current"><span>▶ now</span><strong>{exercise.name}</strong><button type="button" onClick={() => setSwapping(true)} disabled={phase !== 'ready' || complete}>Swap</button></div>
          <div className="frame-panel">
            <div className="section-line"><b>FRAME</b><span>{phaseLabel}</span></div>
            <TargetButton exercise={exercise} label={phase === 'rest' ? 'NEXT SET · MUSCLES' : 'MUSCLES WORKED'} onClick={() => setDetail({ exercise })} />
            <div className="frame-facts">
              <div className="frame-row"><span>this set</span><code>{formatKg(frame.load)} × {MAX_REPS} @ RIR{TARGET_RIR}</code></div>
              <div className="frame-row"><span>rule</span><code className="frame-rule">{frameRule(frame.last, frame.load, MIN_REPS)}</code></div>
              <div className={`frame-row frame-adjust${inputsLocked ? ' locked' : ''}`}><label htmlFor="preview-reps">reps done</label><input id="preview-reps" type="number" inputMode="numeric" min="1" max="99" value={reps} onChange={event => setReps(Math.max(1, Math.min(99, Math.trunc(Number(event.target.value)) || 1)))} disabled={inputsLocked} /><em>/ {MIN_REPS}–{MAX_REPS}</em></div>
              <div className={`frame-row frame-adjust${inputsLocked ? ' locked' : ''}`}><label htmlFor="preview-rir">RIR</label><select id="preview-rir" value={rir} onChange={event => setRir(Number(event.target.value))} disabled={inputsLocked}>{[0, 1, 2, 3, 4].map(value => <option value={value} key={value}>{rirText(value)}</option>)}</select><em>/ target {TARGET_RIR}</em></div>
              <div className="frame-row"><span>{frame.last?.inSession ? 'last committed' : 'last session'}</span><code>{frame.last ? `${formatKg(frame.last.load)} × ${frame.last.reps} @ RIR${frame.last.rir}` : 'none · establishes baseline'}</code></div>
            </div>
            <p className="preview-muted">Reps are the main signal; RIR fine-tunes the next load. A set counts toward weekly volume when RIR is at or under target.</p>
          </div>
        </> : tab === 'block' ? <>
          <div className="phone-header"><strong>build.block<i>.</i></strong></div>
          <p className="preview-muted">Week 1 of 6 · accumulate</p>
          <div className="phase-strip" role="group" aria-label="Six-week block phases">{PHASES.map((item, index) => <span key={item.weeks} className={index === 0 ? 'current' : undefined}>{index === 0 && <i />}{item.weeks} {item.name}</span>)}</div>
          <div className="preview-segments" role="group" aria-label="Sample training day">{(Object.keys(BLOCK_DAYS) as Array<keyof typeof BLOCK_DAYS>).map(item => <button key={item} type="button" aria-pressed={day === item} onClick={() => setDay(item)}>{item}</button>)}</div>
          <p className="preview-title">See the purpose of every lift.</p>
          <p className="preview-muted">Open an exercise to inspect its equipment and primary and assisting muscles.</p>
          {BLOCK_DAYS[day].map(id => { const lift = previewExercise(id); return <button className="preview-lift" type="button" key={id} onClick={() => setDetail({ exercise: lift })}><span><strong>{lift.name}</strong><small>3 × 8–12 · RIR 3</small></span><span aria-hidden="true">↗</span></button> })}
          <div className="preview-block-note"><span>THE SIX-WEEK ARC</span><p>Accumulate → intensify → peak → deload</p></div>
        </> : <>
          <div className="phone-header"><strong>status/week<i>.</i></strong></div>
          <p className="preview-muted">Week 1 · example set credits</p>
          <p className="preview-title">What you did.<br />What’s still planned.</p>
          <p className="preview-muted">{sets.length ? `Includes your ${sets.length} sample ${sets.length === 1 ? 'set' : 'sets'}: ${fmt(earned)} earned credit. Assisting muscles earn half.` : 'Log a sample set in solver() and watch this update. Assisting muscles earn half credit.'}</p>
          <div className="week-mini" role="group" aria-label="Example weekly muscle volume">
            <div className="week-mini-head" aria-hidden="true"><span>MUSCLE</span><span>DOSE / PLAN</span><span>RANGE</span><span>STATE</span></div>
            {WEEK_ROWS.map(muscle => {
              const row = weekRow(muscle)!
              const effect = sessionEffect(muscle)
              const value = row.projected + effect.projected
              const done = row.done + effect.done
              const state = weekStatus(row, value)
              return <button className="week-mini-row" type="button" key={muscle} onClick={() => setDetail({ exercise: previewExercise(WEEK_LIFT[muscle]) })} aria-label={`${row.label}. ${fmt(value)} of ${fmt(row.plan)} planned set credits, ${fmt(done)} done. Range ${row.min} to ${row.max}. ${state.label}. Inspect a lift for this muscle.`}>
                <strong>{row.label}</strong>
                <span className={`dose ${doseTone(row, value)}`}>{fmt(value)}<em> / {fmt(row.plan)}</em><small>{fmt(done)} done{effect.done > 0 && <b> +{fmt(effect.done)}</b>}</small></span>
                <span>{row.min}–{row.max}</span>
                <span className={`state ${state.tone}`}>{state.glyph} {state.label}</span>
              </button>
            })}
          </div>
          <p className="preview-footnote">Tap a row to inspect a lift for that muscle. The full weekly map below connects every region to its lifts.</p>
        </>}
      </div>
      {!detail && !swapping && tab === 'solver()' && <div className="preview-dock">
        <button className="preview-primary" type="button" onClick={primary}>{complete ? 'See volume in week ↗' : phase === 'ready' ? '▶ Start set' : phase === 'active' ? 'Finish set & start rest' : 'Skip rest'}</button>
        <div className="preview-dock-row"><p className="preview-notice" role="status">{notice || 'Sample workout · try the controls'}</p>{sets.length > 0 && !complete && <button className="preview-text-button" type="button" onClick={() => changeTab('week')}>See volume ↗</button>}</div>
      </div>}
      <nav className="phone-tabs preview-tabs" aria-label="App preview screens">{(['solver()', 'block', 'week'] as const).map(item => <button key={item} type="button" aria-current={tab === item ? 'page' : undefined} onClick={() => changeTab(item)}>{item}</button>)}</nav>
    </section>
  </div>
}

export function WelcomePreview() {
  const [loading, setLoading] = useState(false)
  return <section className="welcome-section shell" aria-labelledby="welcome-title">
    <div><p className="eyebrow">04 / READY WHEN YOU ARE</p><h2 id="welcome-title">A familiar start.<br />A clear next step.</h2><p>Open FitArc, restore your training, and get back to your next session. The same athlete artwork greets you at sign-in and while your training loads.</p><div className="preview-segments" role="group" aria-label="Welcome screen preview"><button type="button" aria-pressed={!loading} onClick={() => setLoading(false)}>Sign-in screen</button><button type="button" aria-pressed={loading} onClick={() => setLoading(true)}>Loading screen</button></div></div>
    <div className="welcome-preview" role="img" aria-label={loading ? 'Loading screen preview with athlete artwork and restoring your training message' : 'Sign-in screen preview with athlete artwork'}>
      <img src="/images/muscle-map/athlete-front-v2.png" alt="" width="512" height="768" loading="lazy" decoding="async" />
      {!loading && <div className="welcome-terminal">training.runtime<br /><span>$ auth --login</span></div>}
      <div className="welcome-copy">{loading ? <><span className="wordmark">fitarc<span>.</span></span><span className="welcome-spinner" /><p>Restoring your training…</p></> : <><h3>Compile your<br />next block.</h3><p>Sign in once. The runtime handles the rest.</p><span className="welcome-button">Continue with Apple</span><span className="welcome-email">or sign in with email</span></>}</div>
      <span className="welcome-label">APP SCREEN PREVIEW</span>
    </div>
  </section>
}
