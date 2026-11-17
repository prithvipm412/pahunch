import { useLocation } from 'react-router-dom'
import './spaceBackground.css'

// Deterministic pseudo-random float in [0,1) from a seed — gives "random-looking" but stable
// positions/durations across renders without storing a long literal array.
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

const STAR_COUNT = 60
const stars = Array.from({ length: STAR_COUNT }, (_, i) => ({
  top: rand(i * 1.7 + 1) * 100,
  left: rand(i * 2.3 + 7) * 100,
  size: 1 + rand(i * 3.1 + 2) * 2,
  duration: 2.5 + rand(i * 4.3 + 5) * 3.5,
  delay: rand(i * 5.9 + 3) * 5,
}))

type IconType = 'bulb' | 'resistor' | 'battery' | 'switch' | 'capacitor' | 'atom' | 'lightning'

const ICON_ORDER: IconType[] = [
  'bulb', 'resistor', 'battery', 'switch', 'capacitor', 'atom', 'lightning',
  'bulb', 'resistor', 'battery', 'switch', 'capacitor', 'bulb',
]

const floaters = ICON_ORDER.map((type, i) => ({
  type,
  top: 4 + rand(i * 7.1 + 11) * 84,
  left: 3 + rand(i * 8.3 + 13) * 90,
  size: 28 + rand(i * 9.7 + 17) * 26,
  duration: 12 + rand(i * 10.3 + 19) * 18,
  delay: rand(i * 11.9 + 23) * 10,
  opacity: 0.3 + rand(i * 13.1 + 29) * 0.3,
  variant: (i % 3) + 1,
}))

function FloatingIcon({ type }: { type: IconType }) {
  switch (type) {
    case 'bulb':
      return (
        <svg viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="20" r="13" stroke="#ffd866" strokeWidth="2" />
          <path d="M18 31h12M20 36h8M24 7v4M24 33v6" stroke="#ffd866" strokeWidth="2" strokeLinecap="round" />
          <path d="M18 16c2 4 2 8 6 8s4-4 6-8" stroke="#ffe9a8" strokeWidth="1.5" />
        </svg>
      )
    case 'resistor':
      return (
        <svg viewBox="0 0 64 24" fill="none">
          <path
            d="M2 12h8l4-8 6 16 6-16 6 16 6-16 4 8h8"
            stroke="#6fe3ff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="20" y="4" width="3" height="16" fill="#ffb155" />
          <rect x="30" y="4" width="3" height="16" fill="#b37bff" />
          <rect x="40" y="4" width="3" height="16" fill="#6fe3ff" />
        </svg>
      )
    case 'battery':
      return (
        <svg viewBox="0 0 48 32" fill="none">
          <rect x="4" y="8" width="30" height="16" rx="2" stroke="#9fd8ff" strokeWidth="2" />
          <rect x="34" y="13" width="6" height="6" fill="#9fd8ff" />
          <path d="M12 16h8M16 12v8" stroke="#ffd866" strokeWidth="2" strokeLinecap="round" />
          <path d="M24 16h6" stroke="#ffd866" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'switch':
      return (
        <svg viewBox="0 0 48 24" fill="none">
          <circle cx="8" cy="18" r="3" fill="#6fe3ff" />
          <circle cx="40" cy="18" r="3" fill="#6fe3ff" />
          <path d="M2 18h6M40 18h6M10 18L34 6" stroke="#6fe3ff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'capacitor':
      return (
        <svg viewBox="0 0 40 32" fill="none">
          <path d="M2 16h14M24 16h14" stroke="#b37bff" strokeWidth="2" strokeLinecap="round" />
          <path d="M16 4v24M24 4v24" stroke="#b37bff" strokeWidth="2.5" />
        </svg>
      )
    case 'atom':
      return (
        <svg viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="3" fill="#ffd866" />
          <ellipse cx="24" cy="24" rx="20" ry="8" stroke="#6fe3ff" strokeWidth="1.5" />
          <ellipse cx="24" cy="24" rx="20" ry="8" stroke="#6fe3ff" strokeWidth="1.5" transform="rotate(60 24 24)" />
          <ellipse cx="24" cy="24" rx="20" ry="8" stroke="#6fe3ff" strokeWidth="1.5" transform="rotate(120 24 24)" />
        </svg>
      )
    case 'lightning':
      return (
        <svg viewBox="0 0 32 48" fill="none">
          <path d="M18 2 6 26h8l-4 20 18-26h-9l5-18z" fill="#ffd866" stroke="#ffe9a8" strokeWidth="1" />
        </svg>
      )
  }
}

const WIRE_PATH_D = 'M -20 120 C 120 60, 180 260, 340 220 S 420 480, 260 540 S 80 700, 380 760'

// Fixed, full-screen decorative layer. Mounted once behind the routes (see App.tsx); never
// rendered on /sparsh, which must stay plain and high-contrast for blind/low-vision students.
export default function SpaceBackground() {
  const location = useLocation()
  if (location.pathname.startsWith('/sparsh')) return null

  return (
    <div className="space-background" aria-hidden="true">
      <div className="space-gradient" />
      <div className="starfield">
        {stars.map((s, i) => (
          <span
            key={i}
            className="star"
            style={{
              top: `${s.top}%`,
              left: `${s.left}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              animationDuration: `${s.duration}s`,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}
      </div>
      <svg className="wire-path-svg" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
        <path d={WIRE_PATH_D} fill="none" stroke="#3fd4ff" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="6 10" />
      </svg>
      <div className="electron electron-a" />
      <div className="electron electron-b" />
      {floaters.map((f, i) => (
        <div
          key={i}
          className={`float-item drift-${f.variant}`}
          style={{
            top: `${f.top}%`,
            left: `${f.left}%`,
            width: `${f.size}px`,
            opacity: f.opacity,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
          }}
        >
          <FloatingIcon type={f.type} />
        </div>
      ))}
    </div>
  )
}
