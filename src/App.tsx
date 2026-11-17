import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import BuildScreen from './build'
import DrawScreen from './draw'
import SparshScreen from './sparsh'
import LearnScreen from './learn'
import { LanguageProvider, useLanguage, useT } from './app/lang'
import { tWith } from './app/i18n'
import CircuitBackground from './app/CircuitBackground'
import HeroCircuit from './app/HeroCircuit'
import './app/app.css'
import { stopAll, stopAllUnlessAlmostDone, unlockAudio, warmUpVoice } from './audio'
import { haptic, isHapticsEnabled, setHapticsEnabled } from './audio/haptics'

const STUDENT_NAME_KEY = 'pahunch-student-name'

function AccountButton() {
  const { lang } = useLanguage()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(() => {
    try { return localStorage.getItem(STUDENT_NAME_KEY) ?? '' } catch { return '' }
  })
  const [vibrationOn, setVibrationOn] = useState(() => isHapticsEnabled())
  const buttonRef = useRef<HTMLButtonElement>(null)

  const closePanel = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }
  const openPanel = () => { haptic('tap'); setOpen(true) }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closePanel() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value.trim().slice(0, 30)
    setName(next)
    try { localStorage.setItem(STUDENT_NAME_KEY, next) } catch { /* Storage may be disabled. */ }
  }

  const toggleVibration = () => {
    const next = !vibrationOn
    setHapticsEnabled(next)
    setVibrationOn(next)
    if (next) haptic('tap', { essential: true })
  }

  const initial = name.trim().charAt(0).toUpperCase()

  return (
    <div className="account-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="brand-mark"
        aria-label={t('account')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? closePanel() : openPanel())}
      >P</button>
      {open && <>
        <div className="account-backdrop" onClick={closePanel} />
        <section className="account-panel" role="dialog" aria-modal="true" aria-label={t('account')} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="account-close" aria-label={t('accountClose')} onClick={closePanel}>✕</button>
          {name && <p className="account-greeting">{tWith('hiName', lang, { name })}</p>}
          <div className="account-avatar-row">
            <span className="account-avatar" aria-hidden="true">{initial || '?'}</span>
            <div className="account-name-field">
              <label htmlFor="student-name">{t('yourName')}</label>
              <input id="student-name" type="text" value={name} maxLength={30} placeholder={t('namePlaceholder')} onChange={handleNameChange} />
            </div>
          </div>
          <div className="account-vibration-row">
            <span>{vibrationOn ? t('vibrationOn') : t('vibrationOff')}</span>
            <button type="button" className="account-switch" role="switch" aria-checked={vibrationOn} aria-pressed={vibrationOn} onClick={toggleVibration}>
              <span className="account-switch-knob" aria-hidden="true" />
            </button>
          </div>
        </section>
      </>}
    </div>
  )
}

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
  const links = [
    { to: '/build', label: t('build'), Icon: ResistorIcon },
    { to: '/draw', label: t('draw'), Icon: PencilWireIcon },
    { to: '/sparsh', label: t('sparsh'), Icon: HandIcon },
    { to: '/learn', label: t('learn'), Icon: BulbBrainIcon },
  ]
  return (
    <main className="home-shell">
      <header className="home-header">
        <AccountButton />
        <div className="language-toggle" aria-label={t('language')}>
          <button aria-pressed={lang === 'en'} onClick={() => { haptic('tap'); stopAll(); setLang('en') }}>EN</button>
          <span aria-hidden="true">/</span>
          <button aria-pressed={lang === 'kn'} onClick={() => { haptic('tap'); stopAll(); setLang('kn') }}>ಕನ್ನಡ</button>
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
  // stopAllUnlessAlmostDone(), not a blanket stopAll(), on every single tap/key anywhere in the
  // app: cutting off a clip that had <150ms left anyway (just to immediately start a new one)
  // was producing a choppy stop-start overlap when parts were placed quickly in succession.
  // warmUpVoice() primes speechSynthesis on the first gesture; it's a no-op after that.
  const onFirstGesture = () => { stopAllUnlessAlmostDone(); void unlockAudio(); warmUpVoice() }
  return <LanguageProvider><div className="app-frame" onPointerDownCapture={onFirstGesture} onKeyDownCapture={onFirstGesture}><BrowserRouter><AudioLifecycle /><CircuitBackground /><div className="app-content"><Routes><Route path="/" element={<Home />} /><Route path="/build" element={<BuildScreen />} /><Route path="/draw" element={<DrawScreen />} /><Route path="/sparsh" element={<SparshScreen />} /><Route path="/learn" element={<LearnScreen />} /></Routes></div></BrowserRouter></div></LanguageProvider>
}

export default App
