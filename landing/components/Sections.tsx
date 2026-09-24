import { useState } from 'react'
import { TONE_COLOR, fmt, weekRow, weekStatus } from '../lib/exampleWeek'

// Phase names, short names and one-line purposes are the app's own words (PHASE_COPY in src/screens/runtime/copy.ts).
const PHASES = [
  { id: 'accumulate', weeks: 'W1–2', short: 'acc', plain: 'build volume', purpose: 'Build volume at a comfortable effort.' },
  { id: 'intensify', weeks: 'W3–4', short: 'int', plain: 'raise load', purpose: 'Loads climb and sets get harder.' },
  { id: 'peak', weeks: 'W5', short: 'peak', plain: 'test the top', purpose: 'The hardest week, closest to failure. Where new bests happen.' },
  { id: 'deload', weeks: 'W6', short: 'deload', plain: 'recover', purpose: 'About half the sets at lighter loads. Clears fatigue before the next block.' },
]

const SOURCE_INPUTS = ['goal', 'days per week', 'time cap', 'equipment', 'limitations']

const chest = weekRow('chest')!
const chestState = weekStatus(chest, chest.projected)

export function LoopSection() {
  return <section className="runtime-section shell" id="runtime">
    <div className="section-heading"><p>01 / THE RUNTIME</p><h2>One decision loop.<br />Every training day.</h2><span>A clear next set, muscle targets a tap away, and replacements you can inspect before you choose.</span></div>
    <ol className="loop-grid">
      <li className="loop-step">
        <span className="loop-number" aria-hidden="true">01</span>
        <h3>Declare the constraints</h3>
        <p>Goal, training days, session time, equipment and any limitations become explicit inputs.</p>
        <ul className="loop-visual loop-chips" aria-label="Inputs you set">{SOURCE_INPUTS.map(item => <li key={item}>{item}</li>)}</ul>
      </li>
      <li className="loop-step">
        <span className="loop-number" aria-hidden="true">02</span>
        <h3>Compile the block</h3>
        <p>A six-week block with a real arc. Open a planned lift to see its muscle targets and why it was chosen.</p>
        <div className="loop-visual phase-strip" role="group" aria-label="Six-week block phases">{PHASES.map((phase, index) => <span key={phase.id} className={index === 0 ? 'current' : undefined}>{index === 0 && <i />}{phase.weeks} {phase.short}</span>)}</div>
      </li>
      <li className="loop-step">
        <span className="loop-number" aria-hidden="true">03</span>
        <h3>Solve today</h3>
        <p>Start your set, log reps and RIR, and compare a lift’s muscle targets before you swap it.</p>
        <div className="loop-visual loop-code" role="group" aria-label="Example set frame"><div><span>this set</span><code>42.5 kg × 12 @ RIR3</code></div><div><span>rule</span><code className="accent">last reps hit + RIR3 → +2.5 kg</code></div></div>
      </li>
      <li className="loop-step">
        <span className="loop-number" aria-hidden="true">04</span>
        <h3>Close the loop</h3>
        <p>Sets at your target effort earn weekly volume credit, and logged effort feeds a fatigue budget so a deload can arrive when recovery calls for it.</p>
        <div className="loop-visual loop-week" role="group" aria-label="Example weekly volume row"><b>Chest</b><span>{fmt(chest.projected)} / {fmt(chest.plan)}</span><span>{chest.min}–{chest.max}</span><em className={chestState.tone}><span aria-hidden="true">{chestState.glyph}</span> {chestState.label}</em></div>
      </li>
    </ol>
    <p className="loop-return"><span aria-hidden="true">↺</span> Reps and RIR go in. The next load, your rest and your weekly plan come out.</p>
  </section>
}

function PhaseCard() {
  const [active, setActive] = useState(0)
  const phase = PHASES[active]
  return <article className="system-card">
    <div className="card-index">build.block<span>.</span></div>
    <h3>A block with an actual arc.</h3>
    <p>Six weeks that move through accumulation, intensification, peak and deload. Tap any planned lift to see its muscle targets and why it was selected.</p>
    <div className="phase-picker">
      <div className="phase-tabs" role="group" aria-label="Block phases">{PHASES.map((item, index) => <button type="button" key={item.id} aria-pressed={index === active} onClick={() => setActive(index)}><b>{item.weeks}</b><span>{item.short}</span></button>)}</div>
      <p className="phase-purpose" aria-live="polite"><b>{phase.id}</b> · {phase.plain}. {phase.purpose}</p>
    </div>
  </article>
}

function VolumeCard() {
  return <article className="system-card">
    <div className="card-index">status/week<span>.</span></div>
    <h3>Volume you can act on.</h3>
    <p>Compare done and projected set credits with each muscle’s productive range. Select a muscle, inspect its lifts, and zoom in on the upper or lower body.</p>
    <div className="meter-list">
      {['chest', 'quads', 'glutes'].map(muscle => {
        const row = weekRow(muscle)!
        const state = weekStatus(row, row.projected)
        const scale = Math.max(row.max, row.projected) * 1.15
        const pct = (value: number) => `${Math.min(100, (value / scale) * 100)}%`
        return <div className="meter-row" key={muscle}>
          <b>{row.label}</b>
          <div className="meter-track" role="img" aria-label={`${row.label}: ${fmt(row.projected)} projected, range ${row.min} to ${row.max}, ${state.label}`}>
            <i className="band" style={{ left: pct(row.min), width: pct(row.max - row.min) }} />
            <i className="fill" style={{ width: pct(row.projected), background: TONE_COLOR[state.tone] }} />
          </div>
          <span className={`state ${state.tone}`}><span aria-hidden="true">{state.glyph}</span> {state.label}</span>
        </div>
      })}
    </div>
  </article>
}

export function SystemSection() {
  return <section className="system-section shell" id="system">
    <div className="section-heading"><p>03 / THE SYSTEM</p><h2>The plan, the session<br />and the evidence.</h2></div>
    <div className="system-grid">
      <PhaseCard />
      <article className="system-card">
        <div className="card-index">solver()<span>.</span></div>
        <h3>A workout that fits today.</h3>
        <p>See the muscles worked beside your set controls. Compare a replacement’s targets and equipment before switching; your logged sets stay.</p>
        <div className="mini-stack"><span>done&nbsp;&nbsp; Machine chest press</span><b>▶ now&nbsp;&nbsp; Lat pulldown</b><span>next&nbsp;&nbsp; Dumbbell curl</span></div>
      </article>
      <VolumeCard />
    </div>
  </section>
}

// Every answer below is drawn from how the app behaves today (source intake, setSolver, status, and the swap and pain flows).
export const FAQ_ITEMS: { q: string; a: string }[] = [
  { q: 'What does FitArc need to know about me?', a: 'Your goal (hypertrophy or strength), how many days you train, a time cap for each session, and your equipment: a full gym, or dumbbells and a bench. You can also note limitations and starting weights.' },
  { q: 'What is RIR?', a: 'Reps in reserve: how many more reps you could have done. RIR 3 means you stopped with three left. FitArc asks for it after every set because it shows how hard the set really was.' },
  { q: 'What counts toward my weekly volume?', a: 'A set earns a set credit when your reported RIR is at or under the target for that phase. Assisting muscles earn half a credit. The week view compares logged and projected credits with a productive range for each muscle.' },
  { q: 'How does it choose my next load?', a: 'From the set you just logged, using explicit rules. Hit the top of the rep range at RIR 2 or higher and the next set adds one small step. Miss the rep floor or reach RIR 0 and it backs off. Otherwise it holds. In a deload, loads stay put.' },
  { q: 'Can I swap a lift mid-workout?', a: 'Yes. Compare the replacement’s muscle targets and equipment first. Sets you already logged stay, the remaining sets move to the new lift, and a swap can’t be undone.' },
  { q: 'What if something hurts?', a: 'Report pain on a lift and FitArc skips its remaining sets and stops prescribing it until you allow it again. If pain is sharp or lasting, stop training and get it checked.' },
  { q: 'Are the numbers on this page real?', a: 'No. The workouts, loads and weekly volume in these previews are examples. The muscle map, exercise targets and set-to-set rules mirror how the app works.' },
]

export function FaqSection() {
  return <section className="faq-section shell" id="faq" aria-labelledby="faq-title">
    <div className="faq-intro"><p className="eyebrow">05 / QUESTIONS</p><h2 id="faq-title">Before you<br />download.</h2><p>Straight answers, drawn from how the app works today. Something we didn’t cover? <a href="mailto:tedtfu@gmail.com">Email support</a>.</p></div>
    <div className="faq-list">{FAQ_ITEMS.map(item => <details className="faq-item" key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
  </section>
}
