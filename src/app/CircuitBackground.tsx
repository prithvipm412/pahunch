import { useLocation } from 'react-router-dom'
import './circuitBackground.css'

// --- One 600x600 tile, original hand-drawn circuit motifs, repeated via <pattern>. ---

function Resistor({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <path
        d="M-30 0h10l6-14 10 28 10-28 10 28 10-28 6 14h10"
        fill="none"
        stroke="#e6c79c"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="-11" y="-13" width="4" height="26" fill="#e2672e" />
      <rect x="-1" y="-13" width="4" height="26" fill="#2f8f88" />
      <rect x="9" y="-13" width="4" height="26" fill="#f1e6cf" />
    </g>
  )
}

function Battery({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-24" y="-14" width="42" height="28" rx="3" fill="none" stroke="#f1e6cf" strokeWidth="3" />
      <rect x="18" y="-8" width="8" height="16" fill="#f1e6cf" />
      <path d="M-14 0h10M-9 -5v10" stroke="#e2672e" strokeWidth="3" strokeLinecap="round" />
      <path d="M2 0h10" stroke="#2f8f88" strokeWidth="3" strokeLinecap="round" />
    </g>
  )
}

function Bulb({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="0" cy="0" r="17" fill="none" stroke="#f1e6cf" strokeWidth="3" />
      <path d="M-7 -7l14 14M-7 7l14 -14" stroke="#e2672e" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M-6 17h12M-4 22h8" stroke="#e6c79c" strokeWidth="3" strokeLinecap="round" />
    </g>
  )
}

function Capacitor({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <path d="M-26 0h18M8 0h18" stroke="#f1e6cf" strokeWidth="3" strokeLinecap="round" />
      <path d="M-8 -16v32M8 -16v32" stroke="#2f8f88" strokeWidth="4" />
    </g>
  )
}

function Switch({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="-16" cy="8" r="4" fill="#e2672e" />
      <circle cx="16" cy="8" r="4" fill="#e2672e" />
      <path d="M-26 8h10M16 8h10M-12 8l24 -18" stroke="#f1e6cf" strokeWidth="3" strokeLinecap="round" />
    </g>
  )
}

function Coil({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x - 30} ${y} q7 -16 14 0 q7 -16 14 0 q7 -16 14 0 q7 -16 14 0`}
      fill="none"
      stroke="#e6c79c"
      strokeWidth="3"
      strokeLinecap="round"
    />
  )
}

function Diode({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <path d="M-20 0h14M14 0h6" stroke="#f1e6cf" strokeWidth="3" strokeLinecap="round" />
      <path d="M-6 -13l20 13l-20 13z" fill="#2f8f88" />
      <path d="M14 -13v26" stroke="#2f8f88" strokeWidth="4" />
    </g>
  )
}

function Meter({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="0" cy="0" r="22" fill="none" stroke="#f1e6cf" strokeWidth="3" />
      <path d="M-11 8l0 0M11 8l0 0M0 -10l0 0" stroke="#e6c79c" strokeWidth="2" strokeLinecap="round" />
      <path d="M0 2l-9 -12" stroke="#e2672e" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  )
}

function Plug({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-16" y="-12" width="32" height="24" rx="4" fill="none" stroke="#f1e6cf" strokeWidth="3" />
      <path d="M-6 -12v-8M6 -12v-8" stroke="#d4452b" strokeWidth="3.5" strokeLinecap="round" />
    </g>
  )
}

function Lamp({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="0" cy="0" r="13" fill="none" stroke="#e2672e" strokeWidth="2.5" />
      <path d="M-6 -6l12 12M-6 6l12 -12" stroke="#e2672e" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  )
}

function PlusMark({ x, y }: { x: number; y: number }) {
  return <path d={`M${x - 8} ${y}h16M${x} ${y - 8}v16`} stroke="#d4452b" strokeWidth="3" strokeLinecap="round" />
}

function Node({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r="4" fill="#f1e6cf" />
}

function TileWires() {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 80h80v100h100" stroke="#2f8f88" strokeWidth="2.5" />
      <path d="M250 80h90v60" stroke="#e6c79c" strokeWidth="2.5" />
      <path d="M410 90h60v100h50" stroke="#e2672e" strokeWidth="2.5" opacity="0.7" />
      <path d="M90 250v100h130" stroke="#2f8f88" strokeWidth="2.5" opacity="0.8" />
      <path d="M380 260v80h120" stroke="#e6c79c" strokeWidth="2.5" />
      <path d="M60 410h110v90" stroke="#e2672e" strokeWidth="2.5" opacity="0.6" />
      <path d="M320 420h100v90" stroke="#2f8f88" strokeWidth="2.5" />
      <path d="M150 530h200" stroke="#e6c79c" strokeWidth="2.5" />
    </g>
  )
}

function CircuitTile() {
  return (
    <>
      <TileWires />
      {[
        [50, 80], [230, 100], [410, 90], [460, 90], [90, 250], [220, 250],
        [380, 260], [500, 260], [60, 410], [170, 410], [320, 420], [420, 420],
        [150, 530], [350, 530],
      ].map(([x, y], i) => (
        <Node key={i} x={x} y={y} />
      ))}
      <Resistor x={80} y={80} />
      <Battery x={260} y={90} />
      <Bulb x={420} y={90} />
      <Capacitor x={510} y={100} rotate={90} />
      <Switch x={90} y={230} />
      <Coil x={260} y={210} />
      <Diode x={440} y={240} />
      <Meter x={540} y={270} />
      <Plug x={60} y={400} />
      <Lamp x={200} y={400} />
      <PlusMark x={320} y={420} />
      <Resistor x={460} y={420} rotate={90} />
      <Capacitor x={150} y={530} />
      <Switch x={380} y={540} />
    </>
  )
}

// --- Sparse animated overlay (not tiled) — electrons, flickering bulbs, a swinging meter
// needle, a "breathing" coil, a toggling switch. ~13 animated elements total. ---

const WIRE_PATHS = [
  'M -20 100 C 100 60, 160 220, 300 190 S 380 380, 220 460',
  'M 420 40 C 300 90, 340 220, 180 280 S 60 420, 260 560',
  'M 40 620 C 160 580, 220 680, 360 650 S 440 500, 340 420',
  'M 380 700 C 260 660, 300 560, 180 520',
]

function AnimatedOverlay() {
  return (
    <svg className="circuit-overlay-svg" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" strokeLinecap="round">
        {WIRE_PATHS.map((d, i) => (
          <path
            key={i}
            className="wire-flow"
            d={d}
            stroke={i % 2 === 0 ? '#e2672e' : '#f1e6cf'}
            strokeOpacity="0.45"
            strokeWidth="2"
            strokeDasharray="3 14"
            style={{ animationDuration: `${2.4 + i * 0.5}s` }}
          />
        ))}
      </g>
      {/* meter needle, gently swinging */}
      <g transform="translate(70 120)">
        <circle r="20" fill="none" stroke="#f1e6cf" strokeOpacity="0.5" strokeWidth="2" />
        <line x1="0" y1="2" x2="0" y2="-14" stroke="#e2672e" strokeWidth="2.5" strokeLinecap="round" className="meter-needle" />
      </g>
      {/* breathing coil */}
      <path
        className="breathing-coil"
        d="M300 60 q6 -14 12 0 q6 -14 12 0 q6 -14 12 0"
        stroke="#e6c79c"
        strokeOpacity="0.5"
        strokeWidth="2.5"
      />
      {/* toggling switch */}
      <g transform="translate(330 300)" className="toggling-switch">
        <circle cx="-14" cy="8" r="3" fill="#e2672e" />
        <circle cx="14" cy="8" r="3" fill="#e2672e" />
        <path d="M-22 8h8M14 8h8" stroke="#f1e6cf" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />
        <path className="switch-lever" d="M-10 8l20 -14" stroke="#f1e6cf" strokeOpacity="0.6" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  )
}

const FLICKER_BULBS = [
  { cx: 110, cy: 460, r: 14, duration: 4.2 },
  { cx: 310, cy: 610, r: 11, duration: 5.6 },
  { cx: 60, cy: 700, r: 12, duration: 6.8 },
]

function FlickerBulbs() {
  return (
    <svg className="circuit-overlay-svg flicker-bulbs" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {FLICKER_BULBS.map((b, i) => (
        <circle
          key={i}
          cx={b.cx}
          cy={b.cy}
          r={b.r}
          fill="#e2672e"
          className="flicker-bulb"
          style={{ animationDuration: `${b.duration}s`, animationDelay: `${i * 0.7}s` }}
        />
      ))}
    </svg>
  )
}

// Fixed, full-screen decorative layer: a repeating circuit-illustration tile that drifts
// slowly, plus a sparse animated overlay. Mounted once behind the routes (see App.tsx); never
// rendered on /sparsh, which must stay plain and high-contrast for blind/low-vision students.
export default function CircuitBackground() {
  const location = useLocation()
  if (location.pathname.startsWith('/sparsh')) return null

  return (
    <div className="circuit-background" aria-hidden="true">
      <div className="circuit-tile-layer">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="circuit-tile" width="600" height="600" patternUnits="userSpaceOnUse">
              <CircuitTile />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#circuit-tile)" />
        </svg>
      </div>
      <AnimatedOverlay />
      <FlickerBulbs />
    </div>
  )
}
