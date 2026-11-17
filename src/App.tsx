import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import BuildScreen from './build'
import DrawScreen from './draw'
import SparshScreen from './sparsh'
import LearnScreen from './learn'
import { LanguageProvider, useLanguage, useT } from './app/lang'
import CircuitBackground from './app/CircuitBackground'
import HeroCircuit from './app/HeroCircuit'
import './app/app.css'
import { stopAll, unlockAudio } from './audio'
import { haptic, isHapticsEnabled, setHapticsEnabled } from './audio/haptics'

function AudioLifecycle() {
  const location = useLocation()
  const routeKey = useRef(location.key)

  useLayoutEffect(() => {
    if (routeKey.current !== location.key) stopAll()
    routeKey.current = location.key
  }, [location.key])

  useEffect(() => {
    const stopWhenHidden = () => { if (document.visibilityState === 'hidden') stopAll() }
    window.addEventListener('pagehide', stopAll)
    window.addEventListener('beforeunload', stopAll)
    document.addEventListener('visibilitychange', stopWhenHidden)
    return () => {
      window.removeEventListener('pagehide', stopAll)
      window.removeEventListener('beforeunload', stopAll)
      document.removeEventListener('visibilitychange', stopWhenHidden)
    }
  }, [])

  return null
}

function ResistorIcon() {
  return (
    <svg viewBox="0 0 48 24" aria-hidden="true">
      <path d="M2 12h8l4-10 8 20 8-20 4 10h12" fill="none" stroke="#2f8f88" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PencilWireIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 40l6-16L34 4l6 6-20 20z" fill="none" stroke="#e2672e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 40l16-4" stroke="#e2672e" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function HandIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M16 44c-6-2-10-10-10-16V18a3 3 0 0 1 6 0v6M12 24V8a3 3 0 0 1 6 0v12M18 20V6a3 3 0 0 1 6 0v14M24 20V9a3 3 0 0 1 6 0v17l4-3a3 3 0 0 1 4 4l-6 10c-2 4-5 7-9 7h-3z"
        fill="none"
        stroke="#f1e6cf"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BulbBrainIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="20" r="13" fill="none" stroke="#e6c79c" strokeWidth="3" />
      <path d="M18 31h12M20 36h8" stroke="#e6c79c" strokeWidth="3" strokeLinecap="round" />
      <path d="M17 16c2 5 3 8 7 8s5-3 7-8" stroke="#2f8f88" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Home() {
  const { lang, setLang } = useLanguage()
  const t = useT()
  const [vibrationOn, setVibrationOn] = useState(() => isHapticsEnabled())
  const links = [
    { to: '/build', label: t('build'), Icon: ResistorIcon },
    { to: '/draw', label: t('draw'), Icon: PencilWireIcon },
    { to: '/sparsh', label: t('sparsh'), Icon: HandIcon },
    { to: '/learn', label: t('learn'), Icon: BulbBrainIcon },
  ]
  const toggleVibration = () => {
    const next = !vibrationOn
    setHapticsEnabled(next)
    setVibrationOn(next)
    if (next) haptic('tap', { essential: true })
  }
  return (
    <main className="home-shell">
      <header className="home-header">
        <div className="brand-mark" aria-hidden="true">P</div>
        <div className="language-toggle" aria-label={t('language')}>
          <button aria-pressed={lang === 'en'} onClick={() => { haptic('tap'); stopAll(); setLang('en') }}>EN</button>
          <span aria-hidden="true">/</span>
          <button aria-pressed={lang === 'kn'} onClick={() => { haptic('tap'); stopAll(); setLang('kn') }}>ಕನ್ನಡ</button>
          <span aria-hidden="true">/</span>
          <button aria-pressed={vibrationOn} onClick={toggleVibration}>{vibrationOn ? t('vibrationOn') : t('vibrationOff')}</button>
        </div>
      </header>
      <section className="home-intro">
        <p className="eyebrow">{t('homeEyebrow')}</p>
        <HeroCircuit />
        <p className="hero-tagline">{t('welcome')}</p>
      </section>
      <nav className="mode-grid" aria-label={t('homeModes')}>
        {links.map((item, index) => <Link className="mode-card" to={item.to} key={item.to} style={{ animationDelay: `${index * 70}ms` }} onClick={() => haptic('tap')}><span className="mode-icon" aria-hidden="true"><item.Icon /></span><span>{item.label}</span><span className="mode-arrow" aria-hidden="true">→</span></Link>)}
      </nav>
      <p className="home-footer">{t('homeFooter')}</p>
    </main>
  )
}

function App() {
  return <LanguageProvider><div className="app-frame" onPointerDownCapture={() => { stopAll(); void unlockAudio() }} onKeyDownCapture={() => { stopAll(); void unlockAudio() }}><BrowserRouter><AudioLifecycle /><CircuitBackground /><div className="app-content"><Routes><Route path="/" element={<Home />} /><Route path="/build" element={<BuildScreen />} /><Route path="/draw" element={<DrawScreen />} /><Route path="/sparsh" element={<SparshScreen />} /><Route path="/learn" element={<LearnScreen />} /></Routes></div></BrowserRouter></div></LanguageProvider>
}

export default App
