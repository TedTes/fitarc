import { useState } from 'react'
import { TONE_COLOR, fmt, weekRow, weekStatus } from '../lib/exampleWeek'

import { PATTERNS } from './TrainingPreview'

const SOURCE_INPUTS = ['training pattern', 'exercise pools', 'equipment', 'time', 'starting weights']

const chest = weekRow('chest')!
const chestState = weekStatus(chest, chest.projected)

export function LoopSection() {
  return <section className="runtime-section shell" id="runtime">
    <div className="section-heading"><p>01 / HOW IT WORKS</p><h2>One decision loop.<br />Every training day.</h2><span>Your routine sets the direction. Today, the muscle map and Progress keep the work connected.</span></div>
    <ol className="loop-grid">
      <li className="loop-step">
        <span className="loop-number" aria-hidden="true">01</span>
        <h3>Choose your pattern</h3>
        <p>Choose Upper / Lower, Push / Pull / Legs or Full body. Add the exercises you want available in each group.</p>
        <ul className="loop-visual loop-chips" aria-label="Inputs you set">{SOURCE_INPUTS.map(item => <li key={item}>{item}</li>)}</ul>
      </li>
      <li className="loop-step">
        <span className="loop-number" aria-hidden="true">02</span>
        <h3>Build your pools</h3>
        <p>Keep your own exercises together. FitArc selects from the session’s pool using muscle coverage, recent training and your available equipment.</p>
        <div className="loop-visual phase-strip" aria-label="Example rotation"><span className="current">Upper</span><span>→ Lower</span><span>→ Upper</span></div>
      </li>
      <li className="loop-step">
        <span className="loop-number" aria-hidden="true">03</span>
        <h3>Check today’s workout</h3>
        <p>Hold to start your session. Adjust weight, reps and effort in the set rows, swap a lift when needed, and use the rest timer between sets.</p>
        <div className="loop-visual loop-code" role="group" aria-label="Example set frame"><div><span>set 1 ✓</span><code>40 kg × 12 · RIR 2</code></div><div><span>set 2</span><code className="accent">weight · reps · effort</code></div></div>
      </li>
      <li className="loop-step">
        <span className="loop-number" aria-hidden="true">04</span>
        <h3>See what comes next</h3>
        <p>Finish with a muscle map of the work you completed and the next session’s targets. Progress brings your logged and planned volume together.</p>
        <div className="loop-visual loop-week" role="group" aria-label="Example weekly volume row"><b>Chest</b><span>{fmt(chest.projected)} / {fmt(chest.plan)}</span><span>{chest.min}–{chest.max}</span><em className={chestState.tone}><span aria-hidden="true">{chestState.glyph}</span> {chestState.label}</em></div>
      </li>
    </ol>
    <p className="loop-return"><span aria-hidden="true">↺</span> Your pattern connects the sessions. Your logged sets build the picture of your training.</p>
  </section>
}

function PatternCard() {
  const [active, setActive] = useState(0)
  const pattern = PATTERNS[active]
  return <article className="system-card">
    <div className="card-index">Your routine<span>.</span></div>
    <h3>A rhythm you choose.</h3>
    <p>Fill each group with exercises you like. Keep a main lift to compare progress, with other exercises selected for coverage and recent training.</p>
    <div className="phase-picker">
      <div className="pattern-options" role="group" aria-label="Explore training patterns">{PATTERNS.map((item, index) => <button type="button" key={item.name} aria-pressed={index === active} onClick={() => setActive(index)}>{item.name}<span>{index === active ? '✓' : '›'}</span></button>)}</div>
      <p className="phase-purpose" aria-live="polite">{pattern.groups.join(' → ')} → repeat</p>
    </div>
  </article>
}

function VolumeCard() {
  return <article className="system-card">
    <div className="card-index">Progress<span>.</span></div>
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
    <div className="section-heading"><p>03 / THE SYSTEM</p><h2>Your routine, your session<br />and your progress.</h2></div>
    <div className="system-grid">
      <PatternCard />
      <article className="system-card">
        <div className="card-index">Today<span>.</span></div>
        <h3>A workout that fits today.</h3>
        <p>See the relevant exercises for your next group. Inspect their muscle targets, add from that group’s pool, or swap a lift. Log each set where you see it.</p>
        <div className="mini-stack"><span>done&nbsp;&nbsp; Machine chest press</span><b>▶ now&nbsp;&nbsp; Lat pulldown</b><span>next&nbsp;&nbsp; Biceps curl</span></div>
      </article>
      <VolumeCard />
    </div>
  </section>
}

// Every answer below is drawn from how the app behaves today (source intake, setSolver, status, and the swap and pain flows).
export const FAQ_ITEMS: { q: string; a: string }[] = [
  { q: 'What does FitArc need to know about me?', a: 'Your goal (hypertrophy or strength), how many days you train, a time cap for each session, and your equipment: a full gym, or dumbbells and a bench. You can also note limitations and starting weights.' },
  { q: 'How do exercise pools work?', a: 'Choose Upper / Lower, Push / Pull / Legs or Full body, then add exercises to each group. FitArc keeps a main lift for comparison and selects other exercises using muscle coverage and recent training, within your equipment and session time.' },
  { q: 'What do the completed-workout colors mean?', a: 'Green marks muscles trained in the completed session. Blue marks the next session’s targets. A green region with a blue outline belongs to both. These colors describe your sessions, not measured recovery or muscle growth.' },
  { q: 'What is RIR?', a: 'Reps in reserve: how many more reps you could have done. RIR 3 means you stopped with three left. FitArc asks for it after every set because it shows how hard the set really was.' },
  { q: 'What counts toward my weekly volume?', a: 'A set earns a set credit when your reported RIR is at or under the target for that phase. Assisting muscles earn half a credit. Progress compares logged and projected credits with a productive range for each muscle.' },
  { q: 'How does it choose my next load?', a: 'From the set you just logged, using explicit rules. Hit the top of the rep range at RIR 2 or higher and the next set adds one small step. Miss the rep floor or reach RIR 0 and it backs off. Otherwise it holds. In a deload, loads stay put.' },
  { q: 'Can I swap a lift mid-workout?', a: 'Yes. Compare the replacement’s muscle targets and equipment first. Sets you already logged stay, the remaining sets move to the new lift, and a swap can’t be undone.' },
  { q: 'What if something hurts?', a: 'Report pain on a lift and FitArc skips its remaining sets and stops prescribing it until you allow it again. If pain is sharp or lasting, stop training and get it checked.' },
  { q: 'Are the numbers on this page real?', a: 'No. The workouts, loads and weekly volume in these previews are examples. The artwork and muscle contours come from the current app. The interactive tour is a simplified demonstration, and it does not save or send your entries.' },
]

export function FaqSection() {
  return <section className="faq-section shell" id="faq" aria-labelledby="faq-title">
    <div className="faq-intro"><p className="eyebrow">05 / QUESTIONS</p><h2 id="faq-title">Before you<br />download.</h2><p>Straight answers, drawn from how the app works today. Something we didn’t cover? <a href="mailto:tedtfu@gmail.com">Email support</a>.</p></div>
    <div className="faq-list">{FAQ_ITEMS.map(item => <details className="faq-item" key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
  </section>
}
