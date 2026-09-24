import { useState } from 'react'
import { MUSCLE_MAP_SIZE, MUSCLE_MASKS, type MuscleMapView } from '../lib/muscleMasks'
import { EXAMPLE_WEEK, LOWER_BODY, TONE_COLOR, doseTone, fmt, muscleName, weekRow, weekStatus, type WeekRow } from '../lib/exampleWeek'
import { liftsFor } from '../lib/muscleParts'
import type { PreviewExercise } from '../lib/previewExercises'
import { ExerciseDetails } from './TrainingPreview'

type Selection = { muscle: string; part: string | null }
const ALL_MASKS = [...MUSCLE_MASKS.front, ...MUSCLE_MASKS.back]
const partLabel = (part: string) => ALL_MASKS.find(mask => mask.part === part && mask.label)?.label
const visibleIn = (muscle: string, view: MuscleMapView) => MUSCLE_MASKS[view].some(mask => mask.muscle === muscle)

/** Done and projected set credits against the productive range, like the app's Meter (band + fills). */
function RangeMeter({ row }: { row: WeekRow }) {
  const scale = Math.max(row.max, row.projected) * 1.15
  const pct = (value: number) => `${Math.min(100, (value / scale) * 100)}%`
  const color = TONE_COLOR[weekStatus(row, row.projected).tone]
  return <div className="range-meter" role="img" aria-label={`${fmt(row.done)} logged, ${fmt(row.projected)} projected, productive range ${row.min} to ${row.max} set credits`}>
    <i className="band" style={{ left: pct(row.min), width: pct(row.max - row.min) }} />
    <i className="projected" style={{ width: pct(row.projected), background: color }} />
    <i className="done" style={{ width: pct(row.done), background: color }} />
  </div>
}

const Legend = () => <div className="legend"><span><i className="green" />in range</span><span><i className="amber" />under / high</span><span><i className="red" />over</span></div>

export function WeekExplorer() {
  const [view, setView] = useState<MuscleMapView>('front')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [inspected, setInspected] = useState<PreviewExercise | null>(null)
  const [zoom, setZoom] = useState(false)
  // Hovering (or focusing) a table row or a region previews its group on the other side, like linked brushing.
  const [hovered, setHovered] = useState<string | null>(null)

  const selectedRow = selection ? weekRow(selection.muscle) : undefined
  const partName = selection?.part ? partLabel(selection.part) : undefined
  const lifts = selection ? liftsFor(selection.muscle, selection.part).slice(0, 4) : []
  const legs = Boolean(selection && LOWER_BODY.includes(selection.muscle))
  const viewBox = zoom ? (legs ? '140 305 232 370' : '115 105 280 225') : `0 0 ${MUSCLE_MAP_SIZE.width} ${MUSCLE_MAP_SIZE.height}`

  const showView = (next: MuscleMapView) => {
    setView(next)
    setZoom(false)
    if (selection && !visibleIn(selection.muscle, next)) setSelection(null)
  }
  // Choosing a whole group (from the table) mirrors the app: select the group and bring its side of the body forward.
  const chooseGroup = (muscle: string) => {
    if (!visibleIn(muscle, view)) setView(view === 'front' ? 'back' : 'front')
    setSelection({ muscle, part: null })
    setInspected(null)
  }
  const clear = () => { setSelection(null); setZoom(false) }
  const attention = EXAMPLE_WEEK.map(row => ({ row, state: weekStatus(row, row.projected) })).filter(item => item.state.tone !== 'success')
  const inRange = EXAMPLE_WEEK.length - attention.length

  return <>
    <div className="anatomy-copy">
      <p className="eyebrow">02 / VOLUME, MADE VISIBLE</p>
      <h2>Your body becomes<br />the training dashboard.</h2>
      <p>See your weekly volume at a glance, then select a region to inspect the lifts that train it. Open a lift to compare primary and assisting muscles.</p>
      <Legend />
      <p className="preview-footnote">Example week · set credits, projected against each muscle’s productive range</p>
      <table className="week-table">
        <caption className="sr-only">Example week: projected set credits per muscle. Select a muscle to highlight it on the body map.</caption>
        <thead><tr><th scope="col">MUSCLE</th><th scope="col">DOSE / PLAN</th><th scope="col">RANGE</th><th scope="col">STATE</th></tr></thead>
        <tbody>
          {EXAMPLE_WEEK.map(row => {
            const state = weekStatus(row, row.projected)
            const selected = selection?.muscle === row.muscle
            return <tr key={row.muscle} className="week-row" data-selected={selected} data-hover={hovered === row.muscle} onClick={() => chooseGroup(row.muscle)} onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(row.muscle) }} onPointerLeave={() => setHovered(null)}>
              <th scope="row"><button type="button" aria-pressed={selected} onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setHovered(row.muscle) }} onBlur={() => setHovered(null)} aria-label={`${row.label}: ${fmt(row.projected)} of ${fmt(row.plan)} planned set credits, ${fmt(row.done)} done, range ${row.min} to ${row.max}, ${state.label}. Show on the body map.`}>{row.label}</button></th>
              <td className={`dose ${doseTone(row, row.projected)}`}>{fmt(row.projected)}<span> / {fmt(row.plan)}</span><small>{fmt(row.done)} done</small></td>
              <td>{row.min}–{row.max}</td>
              <td className={`state ${state.tone}`}><span aria-hidden="true">{state.glyph}</span> {state.label}</td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
    <div className="map-console">
      {inspected ? <div className="map-exercise-details">
        <button type="button" autoFocus className="preview-text-button" onClick={() => setInspected(null)}>← Back to weekly map</button>
        <h3>{inspected.name}</h3>
        <ExerciseDetails key={inspected.id} exercise={inspected} />
      </div> : <>
        <div className="console-head">
          <span>MUSCLE MAP</span>
          <div role="group" aria-label="Muscle map view">
            {(['front', 'back'] as MuscleMapView[]).map(side => <button key={side} className={view === side ? 'active' : ''} aria-pressed={view === side} type="button" onClick={() => showView(side)}>{side}</button>)}
          </div>
        </div>
        <div className="landing-muscle-map">
          {/* One coordinate system for the artwork and its masks: the masks were traced from these exact images. */}
          <svg className="muscle-overlay" viewBox={viewBox} role="group" aria-label={`Interactive ${view} muscle regions`}>
            <image href={`/images/muscle-map/athlete-${view}-v2.png`} width={MUSCLE_MAP_SIZE.width} height={MUSCLE_MAP_SIZE.height} />
            {MUSCLE_MASKS[view].map(({ muscle, part, label, visible, hit }) => {
              const whole = part === muscle
              const active = Boolean(selection && selection.muscle === muscle && (selection.part === null || selection.part === part))
              const tone = TONE_COLOR[weekStatus(weekRow(muscle) ?? { min: 0, max: 99 }, weekRow(muscle)?.projected ?? 0).tone]
              const select = () => setSelection({ muscle, part: whole ? null : part })
              const preview = hovered === muscle && !active
              const fill = active ? .52 : preview ? (selection ? .3 : .55) : selection ? .06 : hovered ? .12 : .28
              return <g key={`${view}-${part}`} className="muscle-region" role="button" tabIndex={0} aria-label={label ? `Select ${label}, part of ${muscleName(muscle).toLowerCase()}` : `Select ${muscleName(muscle)}`} aria-pressed={active} onClick={select} onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(muscle) }} onPointerLeave={() => setHovered(null)} onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setHovered(muscle) }} onBlur={() => setHovered(null)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select() } }}>
                <path className="muscle-visible" d={visible} fill={tone} fillOpacity={fill} stroke={tone} strokeOpacity={active ? 1 : preview ? .9 : selection ? 0 : .45} strokeWidth={active || preview ? 2 : 1} />
                <path className="muscle-hit" d={hit} />
              </g>
            })}
          </svg>
          <button type="button" className="map-zoom" aria-pressed={zoom} aria-label={zoom ? 'Show the full body' : legs ? 'Zoom to the legs' : 'Zoom to the upper body'} onClick={() => setZoom(!zoom)}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d={zoom ? 'M8 3v5H3M12 17v-5h5M17 8h-5V3M3 12h5v5' : 'M3 8V3h5M17 12v5h-5M12 3h5v5M8 17H3v-5'} /></svg>{zoom ? 'full' : 'zoom'}
          </button>
        </div>
        <div className="map-dose">
          <div aria-live="polite">
            <div className="map-dose-head">
              <b>{selection ? (partName ?? muscleName(selection.muscle)).toUpperCase() : 'YOUR WEEK, AT A GLANCE'}</b>
              {selection && <button type="button" className="preview-text-button" onClick={clear}>all muscles</button>}
            </div>
            <p>{selectedRow ? `${fmt(selectedRow.done)} logged · ${fmt(selectedRow.projected)} projected · range ${selectedRow.min}–${selectedRow.max} set credits` : `Example week · ${inRange} in range, ${attention.length} need attention.`}</p>
          </div>
          {selectedRow && <RangeMeter row={selectedRow} />}
          {!selection && <div className="week-focus"><span className="map-lifts-label">Tap one to see what trains it</span><div>{attention.map(({ row, state }) => <button type="button" key={row.muscle} className={`focus-chip ${state.tone}`} onClick={() => chooseGroup(row.muscle)}><b>{row.label}</b> <span aria-hidden="true">{state.glyph}</span> {state.label}</button>)}</div></div>}
          {selection && <p className="map-lifts-label">Example lifts · tap to inspect</p>}
          {lifts.map(({ exercise, role }) => <button className="preview-lift" type="button" key={exercise.id} onClick={() => setInspected(exercise)} aria-label={`Inspect ${exercise.name}${role === 'assist' ? ', assisting lift' : ''}`}><span><strong>{exercise.name}</strong><small>{role === 'primary' ? 'Primary target' : 'Assisting muscle'}</small></span><span aria-hidden="true">↗</span></button>)}
          {partName && <p className="map-footnote">Part of {muscleName(selection!.muscle).toLowerCase()}. Sets are counted for the whole group.</p>}
        </div>
      </>}
    </div>
  </>
}
