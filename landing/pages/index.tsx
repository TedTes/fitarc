import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Head from 'next/head'

export default function Home() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(false)
  const carouselRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Trigger entrance animations
    setIsVisible(true)

    // Intersection Observer for scroll animations
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active')
          }
        })
      },
      { threshold: 0.1 }
    )

    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [])

  const screenshots = [
    { src: '/images/workouts.jpg', label: 'Workout Tracking', alt: 'Workouts' },
    { src: '/images/dashboard_diet.jpg', label: 'Meal Planning', alt: 'Nutrition' },
    { src: '/images/progress.png', label: 'Progress Insights', alt: 'Progress' },
    { src: '/images/settings.jpg', label: 'Personalization', alt: 'Settings' }
  ]

  const features = [
    {
      icon: '📊',
      title: 'Your Phase, Your Path',
      description: 'Set your current level and target. Build a clear, measurable 4-8 week training phase that gets you there.'
    },
    {
      icon: '💪',
      title: 'Daily Workouts',
      description: 'Simple completion toggles for every exercise. Track your training volume and watch your strength trend upward.'
    },
    {
      icon: '🍽️',
      title: 'Meal Tracking',
      description: 'Breakfast, lunch, dinner, snacks—one tap to complete. Build consistency without the complexity.'
    },
    {
      icon: '📈',
      title: 'Progress Insights',
      description: 'Visualize your volume, strength trends, and movement balance. Track what matters as you level up.'
    },
    {
      icon: '🔥',
      title: 'Consistency First',
      description: 'Streak-friendly UI with clear empty states. Stay motivated with visual feedback for every completed day.'
    },
    {
      icon: '🎯',
      title: 'Phase-Based Growth',
      description: 'Stop chasing distant goals. Focus on your current phase and build momentum one level at a time.'
    }
  ]

  const stats = [
    { number: '4-8 weeks', label: 'Per Phase' },
    { number: '100%', label: 'Completion Focused' },
    { number: 'Zero', label: 'Fluff' }
  ]

  const showcaseItems = [
    {
      emoji: '✅',
      title: 'Binary Tracking',
      text: 'Check the box. Move forward. No complicated logging.'
    },
    {
      emoji: '📱',
      title: 'Mobile First',
      text: 'Built for your phone. Track anywhere, anytime.'
    },
    {
      emoji: '🎨',
      title: 'Clean Design',
      text: 'Zero clutter. Pure focus on what matters.'
    }
  ]

  const scrollToIndex = (index: number) => {
    const track = carouselRef.current
    if (!track) return
    const itemWidth = 320
    track.scrollTo({ left: index * itemWidth, behavior: 'smooth' })
    setCurrentIndex(index)
  }

  const startAutoScroll = () => {
    autoScrollRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % screenshots.length
        scrollToIndex(next)
        return next
      })
    }, 4000)
  }

  const stopAutoScroll = () => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current)
      autoScrollRef.current = null
    }
  }

  useEffect(() => {
    startAutoScroll()
    return () => stopAutoScroll()
  }, [])

  const handleAppStore = () => {
    window.open('https://apps.apple.com/ca/app/fitarc/id6757266123', '_blank')
  }

  const handlePlayStore = () => {
    window.open('https://play.google.com', '_blank')
  }

  return (
    <>
      <Head>
        <title>FitArc - Build Your Next Phase</title>
        <meta name="description" content="Transform your physique with structure and clarity." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Syne:wght@600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="landing-page">
        {/* Background Particles */}
        <div className="bg-particles">
          <div className="particle particle-1"></div>
          <div className="particle particle-2"></div>
          <div className="particle particle-3"></div>
          <div className="particle particle-4"></div>
        </div>

        <div className="container">
          {/* Header */}
          <header className={`header ${isVisible ? 'fade-in' : ''}`}>
            <div className="logo">FITARC</div>
          </header>

          {/* Hero Section */}
          <section className="hero">
            <div className="gradient-mesh"></div>
            <div className="hero-grid">
              <div className={`hero-content ${isVisible ? 'slide-in-left' : ''}`}>
                <h1 className="hero-headline">
                  Build Your <span className="highlight">Next Phase</span>.<br />
                  Track Every Rep.<br />
                  Stay Consistent.
                </h1>
                
                <p className="hero-subhead">
                  One plan, one dashboard, zero clutter. Transform your physique with structure and clarity.
                </p>

                <div className="cta-container">
                  <button onClick={handleAppStore} className="store-button">
                    <svg className="store-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                    </svg>
                    <div className="store-info">
                      <span className="store-label">Download on the</span>
                      <span className="store-name">App Store</span>
                    </div>
                  </button>

                  <button onClick={handlePlayStore} className="store-button">
                    <svg className="store-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.5,12.92 20.16,13.19L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" />
                    </svg>
                    <div className="store-info">
                      <span className="store-label">Get it on</span>
                      <span className="store-name">Google Play</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className={`hero-images ${isVisible ? 'slide-in-right' : ''}`}>
                <div className="hero-meals">
                  <div className="hero-meals-frame">
                    <Image
                      src="/images/dashboard_diet.jpg"
                      alt="Fitarc meals dashboard preview"
                      fill
                      sizes="(max-width: 720px) 260px, 300px"
                      style={{ objectFit: 'contain' }}
                    />
                  </div>
                </div>
                <div className="hero-visual">
                  <div className="hero-frame">
                    <Image
                      src="/images/dashboard_workout.jpg"
                      alt="Fitarc dashboard preview"
                      fill
                      sizes="(max-width: 720px) 260px, 300px"
                      style={{ objectFit: 'contain' }}
                      priority
                    />
                  </div>
        
                </div>
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section className="features reveal">
            <div className="features-grid">
              {features.map((feature, index) => (
                <div 
                  key={index} 
                  className="feature-card"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="feature-icon">{feature.icon}</div>
                  <h3 className="feature-title">{feature.title}</h3>
                  <p className="feature-description">{feature.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Screenshots Section */}
          <section className="screenshots reveal">
            <h2 className="section-title">Your Transformation, Visualized</h2>
            <p className="section-subtitle">Clean interfaces designed for focused lifters</p>

            <div className="screenshot-carousel">
              <div 
                className="carousel-track" 
                ref={carouselRef}
                onMouseEnter={stopAutoScroll}
                onMouseLeave={startAutoScroll}
                onTouchStart={stopAutoScroll}
                onTouchEnd={startAutoScroll}
              >
                {screenshots.map((screenshot, index) => (
                  <div 
                    key={index} 
                    className="phone-mockup"
                  >
                    <div className="phone-frame">
                      <div className="phone-notch"></div>
                      <div className="phone-screen">
                        <Image
                          src={screenshot.src}
                          alt={screenshot.alt}
                          width={276}
                          height={626}
                          priority={index < 2}
                        />
                      </div>
                    </div>
                    <div className="phone-label">{screenshot.label}</div>
                  </div>
                ))}
              </div>

              <div className="carousel-dots">
                {screenshots.map((_, index) => (
                  <div
                    key={index}
                    className={`dot ${index === currentIndex ? 'active' : ''}`}
                    onClick={() => {
                      scrollToIndex(index)
                      stopAutoScroll()
                      startAutoScroll()
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="feature-showcase">
              {showcaseItems.map((item, index) => (
                <div key={index} className="showcase-item">
                  <span className="showcase-emoji">{item.emoji}</span>
                  <div className="showcase-title">{item.title}</div>
                  <div className="showcase-text">{item.text}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Stats */}
          <section className="stats-section reveal">
            <h2 className="section-title">Built for Real Progress</h2>
            <div className="stats-grid">
              {stats.map((stat, index) => (
                <div key={index} className="stat-item">
                  <div className="stat-number">{stat.number}</div>
                  <div className="stat-label">{stat.label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Social Proof */}
          <section className="social-proof reveal">
            <div className="proof-container">
              <p className="proof-text">
                Fitarc turns your training into a clear, measurable phase. No fluff. Just results.
              </p>
            </div>
          </section>

          {/* Footer */}
          <footer className="footer">
            <div className="footer-content">
              <div className="footer-links">
                <a href="#" className="footer-link">Features</a>
                <a href="#" className="footer-link">About</a>
                <a href="#" className="footer-link">Support</a>
                <a href="/privacy" className="footer-link">Privacy</a>
              </div>
              <div className="footer-copyright">
                © 2025 Fitarc. Built for discipline.
              </div>
            </div>
          </footer>
        </div>
      </div>
    </>
  )
}
