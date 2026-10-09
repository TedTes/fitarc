import { useEffect, useRef, useState } from 'react'
import { MUSCLE_MAP_SIZES, MUSCLE_MASKS, type MuscleMapView } from '../lib/muscleMasks'
import { previewExercise, type PreviewExercise } from '../lib/previewExercises'
import { LOWER_BODY, fmt, muscleName } from '../lib/exampleWeek'
import { hardSetCredit, secondaryMuscleCredit } from '../lib/previewSolver'
import { MUSCLE_MAP_ARTWORK } from '../lib/athleteArtwork'
import { groupMasks, mapBounds } from '../lib/mapDisplay'

export { muscleName }
const defaultView = (exercise: PreviewExercise): MuscleMapView =>
  MUSCLE_MASKS.front.some(mask => mask.muscle === exercise.primaryMuscles[0]) ? 'front' : 'back'

export function TargetFigure({ exercise, view = defaultView(exercise), zoom = false, compact = false, selected, onSelect }: {
  exercise: PreviewExercise; view?: MuscleMapView; zoom?: boolean; compact?: boolean;
  selected?: string | null; onSelect?: (muscle: string, label: string) => void;
}) {
  const legs = LOWER_BODY.includes(selected ?? exercise.primaryMuscles[0])
  const bounds = mapBounds(view, zoom || compact, legs)
  const size = MUSCLE_MAP_SIZES[view]
  return <svg className={compact ? 'target-figure compact' : 'target-figure'} viewBox={bounds} role={onSelect ? 'group' : undefined} aria-hidden={onSelect ? undefined : true} aria-label={onSelect ? `${view} exercise targets` : undefined}>
    <image href={MUSCLE_MAP_ARTWORK[view]} width={size.width} height={size.height} />
    {groupMasks(view).map(mask => {
      const primary = exercise.primaryMuscles.includes(mask.muscle)
      const secondary = exercise.secondaryMuscles.includes(mask.muscle)
      return primary || secondary || selected === mask.muscle ? <path key={mask.part} d={mask.visible} fill="#f48d4d" fillOpacity={(primary ? .32 : secondary ? .14 : 0) * (mask.covered ? .6 : 1)} stroke={selected === mask.muscle ? '#f3f5f8' : '#f48d4d'} strokeOpacity={selected === mask.muscle ? 1 : primary ? .85 : .4} strokeWidth={selected === mask.muscle ? 3 : 1} strokeDasharray={mask.covered ? "8 6" : undefined} /> : null
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

// A small, local-only tour of the current app. Sample exercises and numbers, never user data.
export const PATTERNS = [
  { name: 'Upper / Lower', groups: ['Upper', 'Lower'] },
  { name: 'Push / Pull / Legs', groups: ['Push', 'Pull', 'Legs'] },
  { name: 'Full body', groups: ['Full body'] },
]
const POOLS: Record<string, string[]> = {
  Upper: ['machine_chest_press', 'cable_row', 'overhead_press', 'biceps_curl'],
  Lower: ['back_squat', 'romanian_deadlift', 'seated_leg_curl', 'leg_press'],
  Push: ['machine_chest_press', 'overhead_press', 'triceps_pressdown', 'incline_db_press'],
  Pull: ['cable_row', 'lat_pulldown', 'biceps_curl', 'chest_supported_row'],
  Legs: ['back_squat', 'romanian_deadlift', 'seated_leg_curl', 'leg_press'],
  'Full body': ['machine_chest_press', 'back_squat', 'cable_row', 'romanian_deadlift'],
}
const musclesFor = (ids: string[]) => Array.from(new Set(ids.flatMap(id => previewExercise(id).primaryMuscles)))
type SetRow = { kg: number; reps: number; rir: number; done: boolean }
const freshRows = (): SetRow[] => Array.from({ length: 3 }, () => ({ kg: 40, reps: 12, rir: 2, done: false }))
const initialRows = (ids: string[]) => Object.fromEntries(ids.map(id => [id, freshRows()]))

export function SessionBodies({ completed, next }: { completed: string[]; next: string[] }) {
  return <div className="session-comparison">
    <div className="session-bodies">{(['front', 'back'] as const).map(view => {
      const size = MUSCLE_MAP_SIZES[view]
      return <svg key={view} viewBox={mapBounds(view)} role="img" aria-label={`${view} muscle map. Completed: ${completed.map(muscleName).join(', ') || 'none'}. Next: ${next.map(muscleName).join(', ') || 'none'}.`}>
        <image href={MUSCLE_MAP_ARTWORK[view]} width={size.width} height={size.height} />
        {groupMasks(view).map(mask => {
          const done = completed.includes(mask.muscle), upcoming = next.includes(mask.muscle)
          if (!done && !upcoming) return null
          return <path key={mask.part} d={mask.visible} fill={done ? '#2BCB7D' : '#60A5FA'} fillOpacity={mask.covered ? .2 : .4} stroke={upcoming ? '#60A5FA' : '#2BCB7D'} strokeWidth={done && upcoming ? 5 : 2} strokeDasharray={mask.covered ? '8 6' : undefined} />
        })}
      </svg>
    })}</div>
    <div className="session-legend">{completed.length > 0 && <span><i className="done" />Completed</span>}{next.length > 0 && <span><i className="next" />Next session</span>}{completed.some(m => next.includes(m)) && <span><i className="both" />Both</span>}</div>
  </div>
}

function HoldStart({ onStart }: { onStart: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [holding, setHolding] = useState(false)
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; setHolding(false) }
  const begin = () => { if (timer.current) return; setHolding(true); timer.current = setTimeout(() => { timer.current = null; setHolding(false); onStart() }, 700) }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return <button type="button" className={`hold-start${holding ? ' holding' : ''}`} aria-label="Hold to start workout" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); begin() }} onPointerUp={cancel} onPointerCancel={cancel} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); begin() } }} onKeyUp={cancel} onBlur={cancel} onClick={event => { if (event.detail === 0 && !timer.current) onStart() }}><span aria-hidden="true">▶</span>{holding ? 'Keep holding…' : 'Hold to start'}</button>
}

export function TrainingPreview() {
  const scroll = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<'Today' | 'Progress' | 'Profile'>('Today')
  const [pattern, setPattern] = useState(0)
  const [session, setSession] = useState(0)
  const groups = PATTERNS[pattern].groups
  const group = groups[session % groups.length]
  const nextGroup = groups[(session + 1) % groups.length]
  const [ids, setIds] = useState(POOLS.Upper.slice(0, 2))
  const [nextIds, setNextIds] = useState(POOLS.Lower.slice(0, 2))
  const [rows, setRows] = useState<Record<string, SetRow[]>>(() => initialRows(POOLS.Upper.slice(0, 2)))
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)
  const [rest, setRest] = useState(0)
  const [detail, setDetail] = useState<PreviewExercise | null>(null)
  const [picker, setPicker] = useState<string | 'add' | null>(null)
  const [notice, setNotice] = useState('')
  const [expanded, setExpanded] = useState(ids[0])
  const count = ids.reduce((sum, id) => sum + rows[id].filter(row => row.done).length, 0)
  const total = ids.length * 3
  const completeMuscles = musclesFor(ids.filter(id => rows[id].some(row => row.done)))
  useEffect(() => { scroll.current?.scrollTo(0, 0) }, [tab, detail?.id, picker, finished])
  useEffect(() => {
    if (!rest) return
    const timer = setInterval(() => setRest(value => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [rest > 0])
  const changeTab = (value: typeof tab) => { setTab(value); setPicker(null); setDetail(null) }
  const setup = (p: number, n = 0, list = POOLS[PATTERNS[p].groups[n % PATTERNS[p].groups.length]].slice(0, 2)) => {
    setPattern(p); setSession(n); setIds(list); setRows(initialRows(list)); setExpanded(list[0]); setStarted(false); setFinished(false); setRest(0); setNotice('')
    setNextIds(POOLS[PATTERNS[p].groups[(n + 1) % PATTERNS[p].groups.length]].slice(0, 2))
  }
  const update = (id: string, index: number, patch: Partial<SetRow>) => setRows(current => ({ ...current, [id]: current[id].map((row, i) => i === index ? { ...row, ...patch } : row) }))
  const log = (id: string, index: number) => {
    if (rows[id][index].done) { update(id, index, { done: false }); setRest(0); return }
    update(id, index, { done: true }); setStarted(true)
    const exerciseDone = rows[id].filter(row => row.done).length === 2
    setRest(exerciseDone ? 0 : 120)
    const following = ids.find(key => key !== id && rows[key].some(row => !row.done))
    if (exerciseDone && following) setExpanded(following)
    setNotice(count + 1 === total ? 'All sets logged. Finish to see your muscle summary.' : exerciseDone ? 'Exercise complete. Move to your next lift.' : 'Set logged. Rest when you need it.')
  }
  const finish = () => { if (!count) return; setFinished(true); setRest(0); setStarted(false); setNotice('') }
  const tourComplete = () => { setRows(current => Object.fromEntries(Object.entries(current).map(([id, sets]) => [id, sets.map(row => ({ ...row, done: true }))]))); setFinished(true); setStarted(false); setRest(0); changeTab('Today'); setNotice('') }
  const pickerGroup = finished ? nextGroup : group
  const listed = finished ? nextIds : ids
  const choose = (id: string) => {
    if (finished) setNextIds(current => [...current, id])
    else {
      setIds(current => picker === 'add' ? [...current, id] : current.map(key => key === picker ? id : key))
      setRows(current => ({ ...current, [id]: freshRows() })); setExpanded(id)
    }
    setPicker(null)
  }
  return <div className="phone-wrap">
    <div className="phone-glow" />
    <div className="tour" role="group" aria-label="Guided preview"><span className="tour-label">EXPLORE THE CURRENT APP · SAMPLE DATA</span>
      <button type="button" onClick={() => { setup(pattern); changeTab('Today') }}><b>01</b> Today</button>
      <button type="button" onClick={tourComplete}><b>02</b> After workout</button>
      <button type="button" onClick={() => changeTab('Progress')}><b>03</b> Progress</button>
    </div>
    <section className="runtime-phone product-preview" aria-label="Interactive app preview">
      <div className="phone-sensor" /><div className="preview-disclaimer"><span>INTERACTIVE PREVIEW · SAMPLE DATA</span><button type="button" onClick={() => { setup(0); changeTab('Today') }}>Reset</button></div>
      <div className="preview-scroll" ref={scroll}>
        {detail ? <><button className="preview-text-button preview-back" type="button" aria-label="Back to preview" onClick={() => setDetail(null)}>‹</button><p className="preview-title">{detail.name}</p><ExerciseDetails exercise={detail} key={detail.id} /></>
        : picker ? <><div className="session-heading"><button className="preview-text-button" type="button" aria-label="Back to workout" onClick={() => setPicker(null)}>‹</button><h3>{picker === 'add' ? 'Add to' : 'Swap in'} {pickerGroup}</h3></div><p className="preview-muted">Exercises from this session’s sample pool.</p>{POOLS[pickerGroup].filter(id => !listed.includes(id)).map(id => { const lift = previewExercise(id); return <button className="preview-lift" type="button" key={id} onClick={() => choose(id)}><TargetFigure exercise={lift} compact /><span><strong>{lift.name}</strong><small>{lift.primaryMuscles.map(muscleName).join(' · ')}</small></span><span>+</span></button> })}{POOLS[pickerGroup].every(id => listed.includes(id)) && <p className="preview-muted">All sample exercises are already included.</p>}</>
        : tab === 'Today' ? <>
          <div className="session-heading"><h3>Today</h3>{started && !finished ? <button className="preview-text-button" type="button" disabled={!count} onClick={finish}>Finish</button> : <button type="button" className="preview-text-button" aria-label={`Add exercise to ${finished ? nextGroup : group}`} onClick={() => setPicker('add')}>+ Add</button>}</div>
          {finished ? <><p className="completion-title">✓ Workout complete <small>{count} sets</small></p><SessionBodies completed={completeMuscles} next={musclesFor(nextIds)} /><div className="next-session"><small>NEXT SESSION</small><h3>{nextGroup}</h3><p>{nextIds.length} exercises · {nextIds.length * 3} sets</p></div>{nextIds.map(id => <button className="preview-lift" type="button" key={id} onClick={() => setDetail(previewExercise(id))}><TargetFigure exercise={previewExercise(id)} compact /><span><strong>{previewExercise(id).name}</strong><small>3 × 8–12</small></span><span>›</span></button>)}<button type="button" className="preview-primary" onClick={() => setup(pattern, session + 1, nextIds)}>Preview {nextGroup} session →</button></>
          : <><p className="runtime-goal">{group} · {PATTERNS[pattern].name}</p>
            {!started ? <><SessionBodies completed={[]} next={musclesFor(ids)} /><div className="start-session"><div><strong>{group}</strong><small>{ids.length} exercises · {total} sets</small></div><HoldStart onStart={() => { setStarted(true); setNotice('Choose your weight, reps and RIR in each row.') }} /></div>{ids.map(id => <button key={id} type="button" className="preview-lift" onClick={() => setDetail(previewExercise(id))}><TargetFigure exercise={previewExercise(id)} compact /><span><strong>{previewExercise(id).name}</strong><small>3 × 8–12 · 2:00 rest</small></span><span>›</span></button>)}</>
            : <><div className="set-progress" aria-label={`${count} of ${total} sets logged`}>{ids.flatMap(id => rows[id].map((row, index) => <i key={`${id}-${index}`} className={row.done ? 'done' : ''} />))}</div><p className="preview-muted">{count} of {total} sets logged</p>
              {[expanded, ...ids.filter(id => id !== expanded)].map(id => <div key={id} className="exercise-card"><div className="exercise-card-heading"><button type="button" onClick={() => setExpanded(id)} aria-expanded={expanded === id}><strong>{previewExercise(id).name}</strong><small>{rows[id].filter(row => row.done).length}/3 · 8–12 reps</small></button><button className="preview-text-button" type="button" aria-label={`Inspect ${previewExercise(id).name}`} onClick={() => setDetail(previewExercise(id))}>↗</button></div>{expanded === id && <><div className="set-table-head"><span>SET</span><span>KG</span><span>REPS</span><span>RIR</span><span className="sr-only">Log</span></div>{rows[id].map((row, index) => <div key={index} className={`editable-set${row.done ? ' logged' : ''}`}><span>{index + 1}</span>{(['kg', 'reps', 'rir'] as const).map(field => <select key={field} aria-label={`${previewExercise(id).name} set ${index + 1} ${field}`} value={row[field]} onChange={event => update(id, index, { [field]: Number(event.target.value) })}>{Array.from({ length: field === 'kg' ? 61 : field === 'reps' ? 30 : 5 }, (_, i) => field === 'kg' ? i * 2.5 : field === 'reps' ? i + 1 : i).map(value => <option key={value} value={value}>{field === 'rir' && value === 4 ? '4+' : value}</option>)}</select>)}<button type="button" aria-label={`${row.done ? 'Unlog' : 'Log'} ${previewExercise(id).name} set ${index + 1}`} aria-pressed={row.done} onClick={() => log(id, index)}>✓</button></div>)}{!rows[id].some(row => row.done) && <button className="preview-text-button" type="button" onClick={() => setPicker(id)}>Swap exercise</button>}</>}</div>)}</>}
          </>}
          {notice && <p className="preview-notice" role="status">{notice}</p>}
        </> : tab === 'Progress' ? <><div className="session-heading"><h3>Progress</h3></div><p className="preview-muted">Your sample session, muscle by muscle.</p><SessionBodies completed={completeMuscles} next={[]} /><div className="session-volume">{Array.from(new Set(ids.flatMap(id => [...previewExercise(id).primaryMuscles, ...previewExercise(id).secondaryMuscles]))).map(muscle => {
          const credits = ids.reduce((sum, id) => { const lift = previewExercise(id); const weight = lift.primaryMuscles.includes(muscle) ? 1 : lift.secondaryMuscles.includes(muscle) ? secondaryMuscleCredit : 0; return sum + rows[id].reduce((n, row) => n + (row.done ? hardSetCredit(row.rir, 2) * weight : 0), 0) }, 0)
          return <div key={muscle}><span>{muscleName(muscle)}</span><strong>{fmt(credits)} <small>set credits</small></strong></div>
        })}</div><p className="preview-footnote">Log sets in Today to update this sample. Explore the weekly map below for logged and planned volume.</p></>
        : <><div className="session-heading"><h3>Profile</h3></div><p className="preview-title">Your routine, your rhythm.</p><p className="preview-muted">Choose a pattern. Each group has a pool of exercises to draw from.</p><div className="pattern-options" role="group" aria-label="Training pattern">{PATTERNS.map((item, i) => <button type="button" key={item.name} aria-pressed={pattern === i} onClick={() => setup(i)}>{item.name}<span>{pattern === i ? '✓' : '›'}</span></button>)}</div><p className="rotation-line">{groups.join(' → ')} → repeat</p><p className="preview-footnote">Changing the pattern resets this sample. In the app, edit your pools, equipment and starting weight ranges in training preferences.</p><button className="preview-primary" type="button" onClick={() => changeTab('Today')}>See {group} in Today →</button></>}
      </div>
      {rest > 0 && tab === 'Today' && !detail && !picker ? <div className="rest-dock" role="status"><span><strong>{Math.floor(rest / 60)}:{String(rest % 60).padStart(2, '0')}</strong> resting</span><button type="button" className="preview-text-button" onClick={() => setRest(0)}>Skip ›</button><progress value={rest} max={120} aria-label="Rest time remaining" /></div> : <nav className="phone-tabs preview-tabs" aria-label="App preview screens">{(['Today', 'Progress', 'Profile'] as const).map(item => <button type="button" key={item} aria-current={tab === item ? 'page' : undefined} onClick={() => changeTab(item)}><span aria-hidden="true">{{ Today: '↔', Progress: '▥', Profile: '◎' }[item]}</span>{item}</button>)}</nav>}
    </section>
  </div>
}

export function CompletionPreview() {
  return <section className="welcome-section shell" aria-labelledby="completion-title"><div><p className="eyebrow">04 / SEE WHAT YOU TRAINED</p><h2 id="completion-title">Finish with a picture<br />of your progress.</h2><p>Your completed muscles light up in green. The next session’s targets appear in blue. See both sides of the body, then review the exercises coming next.</p><p>With Upper / Lower, an Upper session leads to Lower. Your chosen pattern connects today’s work to your next visit.</p><a className="text-link" href="#top">Try “After workout” in the preview ↑</a></div><div className="completion-feature"><p className="completion-title">✓ Workout complete</p><SessionBodies completed={musclesFor(POOLS.Upper.slice(0, 2))} next={musclesFor(POOLS.Lower.slice(0, 2))} /><div className="next-session"><small>NEXT SESSION</small><h3>Lower</h3><p>Back squat · Romanian deadlift</p></div><p className="preview-footnote">Illustrative session · current app artwork</p></div></section>
}
