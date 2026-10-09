import Head from 'next/head'
import { TrainingPreview, CompletionPreview } from '../components/TrainingPreview'
import { WeekExplorer } from '../components/WeekExplorer'
import { FAQ_ITEMS, FaqSection, LoopSection, SystemSection } from '../components/Sections'

const APP_STORE_URL = 'https://apps.apple.com/ca/app/fitarc/id6757266123'
const DESCRIPTION = 'Build your exercise pools, train your next session and see every logged set on the muscle map. FitArc connects your routine, workouts and progress.'

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

const faqStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map(item => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
}

export default function Home() {
  return <>
    <Head>
      <title>FitArc — Your routine. Your body. Your next session.</title>
      <meta name="description" content={DESCRIPTION} />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="theme-color" content="#090B0F" />
      <meta name="color-scheme" content="dark" />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="FitArc" />
      <meta property="og:title" content="FitArc — Your routine. Your body. Your next session." />
      <meta property="og:description" content={DESCRIPTION} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content="FitArc — Your routine. Your body. Your next session." />
      <meta name="twitter:description" content={DESCRIPTION} />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }} />
    </Head>
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="landing-page">
      <header className="site-header shell">
        <a className="wordmark" href="#top" aria-label="fitarc, back to top">fitarc<span>.</span></a>
        <nav aria-label="Main navigation"><a href="#runtime">how it works</a><a href="#anatomy">muscle map</a><a href="#system">system</a><a href="#faq">faq</a></nav>
        <AppStoreButton compact />
      </header>
      <main id="main">
        <section className="hero shell" id="top">
          <div className="hero-copy">
            <p className="terminal-line">YOUR ROUTINE, CONNECTED <i className="terminal-cursor" aria-hidden="true" /></p>
            <div className="identity-chip">upper → lower → repeat</div>
            <h1>Every session.<br />Part of <em>your arc.</em></h1>
            <p className="hero-lede">Start with the way you like to train. Build your exercise pools, log your sets, and see what you trained on your muscle map—with the next session ready to review.</p>
            <div className="hero-actions"><AppStoreButton /><a className="text-link" href="#runtime">See how it works <Arrow /></a></div>
            <ul className="compile-log" aria-label="What FitArc does">
              <li><b aria-hidden="true">✓</b><span>setup</span>upper / lower · push / pull / legs · full body</li>
              <li><b aria-hidden="true">✓</b><span>choose</span>your exercises, grouped into pools</li>
              <li><b aria-hidden="true">✓</b><span>see</span>completed muscles · next session · progress</li>
            </ul>
          </div>
          <TrainingPreview />
        </section>
        <section className="signal-strip" aria-label="FitArc training loop"><div className="shell"><span>routine</span><i aria-hidden="true">→</i><span>session</span><i aria-hidden="true">→</i><span className="hot">train</span><i aria-hidden="true">→</i><span>muscles</span><i aria-hidden="true">→</i><span>next</span></div></section>
        <LoopSection />
        <section className="anatomy-section" id="anatomy"><div className="shell anatomy-grid"><WeekExplorer /></div></section>
        <SystemSection />
        <CompletionPreview />
        <FaqSection />
        <section className="final-cta shell"><p className="eyebrow">READY TO RUN</p><h2>Stop guessing the next move.</h2><p>Choose your pattern. Fill your exercise pools. Make your next session count.</p><AppStoreButton /></section>
      </main>
      <footer className="site-footer shell"><a className="wordmark" href="#top" aria-label="fitarc, back to top">fitarc<span>.</span></a><p>Your routine, workouts and progress.</p><div><a href="/privacy">privacy</a><a href="mailto:tedtfu@gmail.com">support</a></div><small>© 2026 FitArc</small></footer>
    </div>
  </>
}
