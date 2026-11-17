import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import BuildScreen from './build'
import DrawScreen from './draw'
import SparshScreen from './sparsh'
import LearnScreen from './learn'

const navyStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0B1B3F',
  color: '#ffffff',
}

function Home() {
  const linkStyle: React.CSSProperties = {
    display: 'block',
    padding: '24px',
    margin: '16px 0',
    fontSize: '1.5rem',
    textAlign: 'center',
    color: '#ffffff',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '16px',
    textDecoration: 'none',
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ textAlign: 'center' }}>Pahunch</h1>
      <Link to="/build" style={linkStyle}>
        Build
      </Link>
      <Link to="/draw" style={linkStyle}>
        Draw
      </Link>
      <Link to="/sparsh" style={linkStyle}>
        Sparsh
      </Link>
      <Link to="/learn" style={linkStyle}>
        Learn
      </Link>
    </div>
  )
}

function App() {
  return (
    <div style={navyStyle}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/build" element={<BuildScreen />} />
          <Route path="/draw" element={<DrawScreen />} />
          <Route path="/sparsh" element={<SparshScreen />} />
          <Route path="/learn" element={<LearnScreen />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
