import { useEffect, useLayoutEffect, useRef } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import BuildScreen from './build'
import DrawScreen from './draw'
import SparshScreen from './sparsh'
import LearnScreen from './learn'
import { LanguageProvider, useLanguage, useT } from './app/lang'
import SpaceBackground from './app/SpaceBackground'
import './app/app.css'
import { stopAll, unlockAudio } from './audio'

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

function Home() {
  const { lang, setLang } = useLanguage()
  const t = useT()
  const links = [
    { to: '/build', label: t('build'), icon: '🔌' },
    { to: '/draw', label: t('draw'), icon: '✏️' },
    { to: '/sparsh', label: t('sparsh'), icon: '✋' },
    { to: '/learn', label: t('learn'), icon: '🧠' },
  ]
  return (
    <main className="home-shell">
      <header className="home-header">
        <div className="brand-mark" aria-hidden="true">P</div>
        <div className="language-toggle" aria-label={t('language')}>
          <button aria-pressed={lang === 'en'} onClick={() => { stopAll(); setLang('en') }}>EN</button>
          <span aria-hidden="true">/</span>
          <button aria-pressed={lang === 'kn'} onClick={() => { stopAll(); setLang('kn') }}>ಕನ್ನಡ</button>
        </div>
      </header>
      <section className="home-intro">
        <p className="eyebrow">{t('homeEyebrow')}</p>
        <h1 className="hero-title">
          Pahunch
          <svg className="hero-bulb" viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="20" r="13" stroke="#ffd866" strokeWidth="2.5" />
            <path d="M18 31h12M20 36h8M24 33v6" stroke="#ffd866" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M18 16c2 4 2 8 6 8s4-4 6-8" stroke="#ffe9a8" strokeWidth="1.5" />
          </svg>
        </h1>
        <p className="hero-tagline">{t('welcome')}</p>
      </section>
      <nav className="mode-grid" aria-label={t('homeModes')}>
        {links.map((item, index) => <Link className="mode-card" to={item.to} key={item.to} style={{ animationDelay: `${index * 70}ms` }}><span className="mode-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span><span className="mode-arrow" aria-hidden="true">→</span></Link>)}
      </nav>
      <p className="home-footer">{t('homeFooter')}</p>
    </main>
  )
}

function App() {
  return <LanguageProvider><div className="app-frame" onPointerDownCapture={() => { stopAll(); void unlockAudio() }} onKeyDownCapture={() => { stopAll(); void unlockAudio() }}><BrowserRouter><AudioLifecycle /><SpaceBackground /><div className="app-content"><Routes><Route path="/" element={<Home />} /><Route path="/build" element={<BuildScreen />} /><Route path="/draw" element={<DrawScreen />} /><Route path="/sparsh" element={<SparshScreen />} /><Route path="/learn" element={<LearnScreen />} /></Routes></div></BrowserRouter></div></LanguageProvider>
}

export default App
