import Head from 'next/head'
import { useState } from 'react'
import { MUSCLE_MASKS, type MuscleMapView } from '../lib/muscleMasks'

const APP_STORE_URL = 'https://apps.apple.com/ca/app/fitarc/id6757266123'

const Apple = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>
)

const Arrow = () => <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 6l4 4-4 4" /></svg>

const AppStoreButton = ({ compact = false }: { compact?: boolean }) => (
  <a className={`store-button${compact ? ' compact' : ''}`} href={APP_STORE_URL} target="_blank" rel="noreferrer">
    <Apple />
    <span><small>Download on the</small><strong>App Store</strong></span>
  </a>
)

const RuntimePhone = () => (
  <div className="phone-wrap" aria-label="FitArc workout solver preview">
    <div className="phone-glow" />
    <div className="runtime-phone">
      <div className="phone-sensor" />
      <div className="phone-header"><strong>solver()<i>.</i></strong><span>upper.a · 51m left</span></div>
      <p className="runtime-goal">maximize chest_hypertrophy</p>
      <div className="section-line"><b>STACK</b><span>4 / 5 lifts</span></div>
      <div className="stack-panel">
        <div className="stack-row"><small>next</small><strong>Overhead press</strong><span>1/3</span></div>
        <div className="stack-row active"><small>▶ now</small><strong>Cable fly</strong><span>1/3</span></div>
        <div className="stack-row"><small>next</small><strong>Lat pulldown</strong><span>1/3</span></div>
      </div>
      <div className="frame-panel">
        <div className="section-line"><b>FRAME</b><span>cable_fly</span></div>
        <dl><div><dt>last session</dt><dd>none · establish baseline</dd></div><div><dt>this set</dt><dd>10 kg × 12 @ RIR3</dd></div><div><dt>rule</dt><dd>no prior signal → establish</dd></div></dl>
        <div className="adjust"><span>reps done</span><strong>12 <em>/ 8–12</em></strong><i>− &nbsp; +</i></div>
        <div className="adjust"><span>RIR</span><strong className="orange">3 <em>/ target 3</em></strong><i>− &nbsp; +</i></div>
      </div>
      <div className="phone-tabs"><span className="active">solver()</span><span>block</span><span>week</span><span>account</span></div>
    </div>
  </div>
)

const MAP_TONES: Record<string, string> = {
  chest: '#5be08a', back: '#5be08a', delts: '#5be08a', biceps: '#5be08a',
  core: '#f48d4d', quads: '#f5c04a', calves: '#f5c04a', triceps: '#f5c04a',
  glutes: '#f87171', hamstrings: '#f87171',
}

const MAP_DETAILS: Record<string, string> = {
  chest: 'Bench press · Cable fly · Floor press',
  back: 'Lat pulldown · Pull-up · Chest-supported row',
  delts: 'Overhead press · Lateral raise · Cable row',
  biceps: 'Dumbbell curl · Cable curl · Pull-up',
  triceps: 'Cable pressdown · Bench press · Overhead press',
  core: 'Ab wheel · Hanging raise · Squat',
  quads: 'Squat · Split squat · Leg press',
  hamstrings: 'Romanian deadlift · Leg curl · Hip hinge',
  glutes: 'Hip thrust · Squat · Romanian deadlift',
  calves: 'Standing calf raise · Seated calf raise',
}

const LandingMuscleMap = () => {
  const [view, setView] = useState<MuscleMapView>('front')
  const [selection, setSelection] = useState({ muscle: 'chest', part: 'chest', label: 'Chest' })
  const masks = MUSCLE_MASKS[view]

  const showView = (next: MuscleMapView) => {
    setView(next)
    setSelection(next === 'front'
      ? { muscle: 'chest', part: 'chest', label: 'Chest' }
      : { muscle: 'back', part: 'lats', label: 'Latissimus dorsi' })
  }

  return <>
    <div className="console-head">
      <span>MUSCLE MAP</span>
      <div role="group" aria-label="Muscle map view">
        {(['front', 'back'] as MuscleMapView[]).map((side) => <button key={side} className={view === side ? 'active' : ''} type="button" onClick={() => showView(side)}>{side}</button>)}
      </div>
    </div>
    <div className="landing-muscle-map">
      <img src={`/images/muscle-map/athlete-${view}-v2.png`} alt={`${view} anatomy muscle map`} />
      <svg className="muscle-overlay" viewBox="0 0 512 768" aria-label={`Interactive ${view} muscle regions`}>
        {masks.map(({ muscle, part, label, visible, hit }) => {
          const active = selection.part === part
          const select = () => setSelection({ muscle, part, label: label ?? muscle })
          return <g key={`${view}-${part}`} className="muscle-region" role="button" tabIndex={0} aria-label={`Show ${label ?? muscle}`} onClick={select} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') select() }}>
            <path className="muscle-visible" d={visible} fill={MAP_TONES[muscle] ?? '#f48d4d'} fillOpacity={active ? .52 : .2} stroke={MAP_TONES[muscle] ?? '#f48d4d'} strokeOpacity={active ? 1 : .55} strokeWidth={active ? 2 : 1} />
            <path className="muscle-hit" d={hit} />
          </g>
        })}
      </svg>
    </div>
    <p><b>{selection.label.toUpperCase()}</b><span>{MAP_DETAILS[selection.muscle] ?? 'Tap a muscle to inspect its training role'}</span></p>
  </>
}

const LoopStep = ({ number, title, copy }: { number: string; title: string; copy: string }) => <article className="loop-step"><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></article>

export default function Home() {
  return <>
    <Head><title>FitArc — Adaptive training, compiled for today</title><meta name="description" content="FitArc compiles your training block around your time, recovery and equipment, then adapts from every set you log." /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content="#090B0F" /><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" /></Head>
    <main className="landing-page">
      <header className="site-header shell"><a className="wordmark" href="#top">fitarc<span>.</span></a><nav aria-label="Main navigation"><a href="#runtime">runtime</a><a href="#anatomy">muscle map</a><a href="#system">system</a></nav><AppStoreButton compact /></header>
      <section className="hero shell" id="top"><div className="hero-copy"><p className="terminal-line"><span>$</span> training --compile <i className="terminal-cursor" /></p><div className="identity-chip">strength · wk 1/6</div><h1>Training that<br />recompiles <em>around you.</em></h1><p className="hero-lede">FitArc turns your goal, schedule, recovery and equipment into today’s exact workout—then learns from every rep.</p><div className="hero-actions"><AppStoreButton /><a className="text-link" href="#runtime">See the runtime <Arrow /></a></div><div className="hero-proof"><span><b>01</b> no generic calendar</span><span><b>02</b> no wasted sets</span><span><b>03</b> every choice explained</span></div></div><RuntimePhone /></section>
      <section className="signal-strip" aria-label="FitArc training loop"><div className="shell"><span>source</span><i>→</i><span>compile</span><i>→</i><span className="hot">solve</span><i>→</i><span>log</span><i>→</i><span>adapt</span></div></section>
      <section className="runtime-section shell" id="runtime"><div className="section-heading"><p>01 / THE RUNTIME</p><h2>One decision loop.<br />Every training day.</h2><span>The plan stays structured while each session responds to real life.</span></div><div className="loop-grid"><LoopStep number="01" title="Declare the constraints" copy="Goal, available days, equipment, time and recovery become explicit inputs." /><LoopStep number="02" title="Compile the block" copy="FitArc builds a phased plan with productive weekly volume for every muscle." /><LoopStep number="03" title="Solve today" copy="The session is trimmed or adjusted without losing the purpose of the block." /><LoopStep number="04" title="Close the loop" copy="Reps and RIR become the signal for the next load, set and session." /></div></section>
      <section className="anatomy-section" id="anatomy"><div className="shell anatomy-grid"><div className="anatomy-copy"><p className="eyebrow">02 / VOLUME, MADE VISIBLE</p><h2>Your body becomes<br />the training dashboard.</h2><p>Tap a muscle to see the lifts that train it. Color shows whether the week is under, inside or over its productive range.</p><div className="legend"><span><i className="green" />in range</span><span><i className="amber" />under</span><span><i className="red" />over</span></div><div className="muscle-ledger"><div><b>Chest</b><span>12 / 12</span><em className="green-text">in range</em></div><div><b>Quads</b><span>6 / 10</span><em className="amber-text">4 under</em></div><div><b>Hamstrings</b><span>18 / 14</span><em className="red-text">4 over</em></div></div></div><div className="map-console"><LandingMuscleMap /></div></div></section>
      <section className="system-section shell" id="system"><div className="section-heading"><p>03 / THE SYSTEM</p><h2>The plan, the session<br />and the evidence.</h2></div><div className="system-grid"><article className="system-card"><div className="card-index">build.block<span>.</span></div><h3>A block with an actual arc.</h3><p>Accumulation, intensification, peak and deload phases keep progression legible.</p><div className="phase-rail"><b>W1–2 accumulate</b><span>W3–4 intensify</span><span>W5 peak</span></div></article><article className="system-card"><div className="card-index">solver()<span>.</span></div><h3>A workout that fits today.</h3><p>Available time and recovery change the dose while the target stays intact.</p><div className="mini-stack"><span>done&nbsp;&nbsp; Bench press</span><b>▶ now&nbsp;&nbsp; Chest-supported row</b><span>next&nbsp;&nbsp; Dumbbell curl</span></div></article><article className="system-card"><div className="card-index">status/week<span>.</span></div><h3>Volume you can act on.</h3><p>See weekly dose against productive ranges before fatigue becomes guesswork.</p><div className="meter-list"><span><b>Chest</b><i style={{width:'72%'}} /></span><span><b>Back</b><i style={{width:'84%'}} /></span><span><b>Quads</b><i className="warn" style={{width:'45%'}} /></span></div></article></div></section>
      <section className="final-cta shell"><p className="eyebrow">READY TO RUN</p><h2>Stop guessing the next move.</h2><p>Compile the block. Train the session. Let the evidence decide what changes.</p><AppStoreButton /></section>
      <footer className="site-footer shell"><a className="wordmark" href="#top">fitarc<span>.</span></a><p>Adaptive strength training, compiled for real life.</p><div><a href="/privacy">privacy</a><a href="mailto:tedtfu@gmail.com">support</a></div><small>© 2026 FitArc</small></footer>
    </main>
  </>
}
