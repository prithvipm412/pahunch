import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import BuildScreen from './build'
import DrawScreen from './draw'
import SparshScreen from './sparsh'
import LearnScreen from './learn'
import { LanguageProvider, useLanguage } from './app/lang'
import './app/app.css'

function Home() {
  const { lang, setLang } = useLanguage()
  const labels = lang === 'kn'
    ? { welcome: 'ಕಲಿಕೆಗೆ ಸ್ವಾಗತ', build: 'ನಿರ್ಮಿಸಿ', draw: 'ಚಿತ್ರಿಸಿ', sparsh: 'ಸ್ಪರ್ಶ', learn: 'ಕಲಿಯಿರಿ' }
    : { welcome: 'Learn by making', build: 'Build', draw: 'Draw', sparsh: 'Sparsh', learn: 'Learn' }
  const links = [
    { to: '/build', label: labels.build, icon: '⌁' },
    { to: '/draw', label: labels.draw, icon: '✎' },
    { to: '/sparsh', label: labels.sparsh, icon: '◉' },
    { to: '/learn', label: labels.learn, icon: '✦' },
  ]
  return (
    <main className="home-shell">
      <header className="home-header">
        <div className="brand-mark" aria-hidden="true">P</div>
        <div className="language-toggle" aria-label="Language">
          <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
          <span aria-hidden="true">/</span>
          <button aria-pressed={lang === 'kn'} onClick={() => setLang('kn')}>ಕನ್ನಡ</button>
        </div>
      </header>
      <section className="home-intro"><p className="eyebrow">PAHUŅCH · ವಿದ್ಯುತ್ ವಲಯಗಳು</p><h1>Pahunch</h1><p>{labels.welcome}</p></section>
      <nav className="mode-grid" aria-label="Learning modes">
        {links.map((item, index) => <Link className="mode-card" to={item.to} key={item.to} style={{ animationDelay: `${index * 70}ms` }}><span className="mode-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span><span className="mode-arrow" aria-hidden="true">→</span></Link>)}
      </nav>
      <p className="home-footer">Explore circuits at your own pace</p>
    </main>
  )
}

function App() {
  return <LanguageProvider><div className="app-frame"><BrowserRouter><Routes><Route path="/" element={<Home />} /><Route path="/build" element={<BuildScreen />} /><Route path="/draw" element={<DrawScreen />} /><Route path="/sparsh" element={<SparshScreen />} /><Route path="/learn" element={<LearnScreen />} /></Routes></BrowserRouter></div></LanguageProvider>
}

export default App
