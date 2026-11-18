/**
 * src/learn/GlowCircuitSVG.tsx — CircuitSVG extended with glowing bulbs.
 *
 * Accepts an optional `solveResult` and `revealed` flag; when both are set
 * and a bulb is lit, it glows with a warmer, brighter incandescent core
 * and soft radial gradient halo matching Build mode.
 */
import type { Netlist, SolveResult, ComponentResult } from '../contracts/netlist'

interface Props {
  netlist: Netlist
  solveResult?: SolveResult
  revealed?: boolean
  /** Optional: highlight this component id (Fault Hunt) */
  highlightId?: string
  /** Tap-able component ids → handler (Fault Hunt) */
  onComponentTap?: (id: string) => void
}

const CELL = 48
const PAD = 24

function pt(row: number, col: number) {
  return { x: PAD + col * CELL, y: PAD + row * CELL }
}

function mid(r1: number, c1: number, r2: number, c2: number) {
  return { x: PAD + ((c1 + c2) / 2) * CELL, y: PAD + ((r1 + r2) / 2) * CELL }
}

interface BulbHaloConfig {
  haloRadius: number
  gradientId: string
  opacity: number
  className: string
  coreFill: string
  coreStroke: string
  filamentStroke: string
}

function getBulbRenderConfig(state?: string): BulbHaloConfig | null {
  if (!state || state === 'off') return null
  switch (state) {
    case 'bright':
      return {
        haloRadius: 28, // ~2.8x bulb radius
        gradientId: 'glow-bulb-halo-bright',
        opacity: 0.85,
        className: 'bulb-halo-bright',
        coreFill: '#ffe066',
        coreStroke: '#ffd54a',
        filamentStroke: '#18345f',
      }
    case 'normal':
      return {
        haloRadius: 22, // ~2.2x bulb radius (R=10)
        gradientId: 'glow-bulb-halo-normal',
        opacity: 0.7, // opacity ~0.7
        className: 'bulb-halo-normal',
        coreFill: '#ffd54a', // warm yellow core #ffd54a
        coreStroke: '#ffd54a',
        filamentStroke: '#18345f',
      }
    case 'dim':
      return {
        haloRadius: 17, // ~1.7x bulb radius
        gradientId: 'glow-bulb-halo-dim',
        opacity: 0.4, // faint orange halo
        className: 'bulb-halo-dim',
        coreFill: '#ffb74d',
        coreStroke: '#ffa726',
        filamentStroke: '#18345f',
      }
    case 'overload':
      return {
        haloRadius: 23, // ~2.3x bulb radius
        gradientId: 'glow-bulb-halo-overload',
        opacity: 0.75, // red halo
        className: 'bulb-halo-overload',
        coreFill: '#ef5350',
        coreStroke: '#d32f2f',
        filamentStroke: '#ffffff',
      }
    default:
      return null
  }
}

type ComponentProps = {
  r1: number; c1: number; r2: number; c2: number
  glow?: string
  state?: string
  highlight?: boolean
  onTap?: () => void
}

function Battery({ r1, c1, r2, c2, highlight, onTap }: ComponentProps) {
  const a = pt(r1, c1); const b = pt(r2, c2)
  const m = mid(r1, c1, r2, c2)
  const isHoriz = r1 === r2
  const halfGap = 6; const longLine = 14; const shortLine = 9

  const longProps = isHoriz
    ? { x1: m.x - halfGap, y1: m.y - longLine, x2: m.x - halfGap, y2: m.y + longLine }
    : { x1: m.x - longLine, y1: m.y - halfGap, x2: m.x + longLine, y2: m.y - halfGap }
  const shortProps = isHoriz
    ? { x1: m.x + halfGap, y1: m.y - shortLine, x2: m.x + halfGap, y2: m.y + shortLine }
    : { x1: m.x - shortLine, y1: m.y + halfGap, x2: m.x + shortLine, y2: m.y + halfGap }
  const wireA = isHoriz
    ? { x1: a.x, y1: a.y, x2: m.x - halfGap, y2: m.y }
    : { x1: a.x, y1: a.y, x2: m.x, y2: m.y - halfGap }
  const wireB = isHoriz
    ? { x1: m.x + halfGap, y1: m.y, x2: b.x, y2: b.y }
    : { x1: m.x, y1: m.y + halfGap, x2: b.x, y2: b.y }

  const stroke = highlight ? '#EF5350' : 'var(--clr-accent, #4FC3F7)'
  return (
    <g stroke={stroke} strokeWidth={highlight ? 3 : 2} fill="none" onClick={onTap} style={onTap ? { cursor: 'pointer' } : undefined}>
      <line {...wireA} /><line {...wireB} />
      <line {...longProps} strokeWidth={highlight ? 4 : 3} />
      <line {...shortProps} />
    </g>
  )
}

function Bulb({ r1, c1, r2, c2, state, highlight, onTap }: ComponentProps) {
  const a = pt(r1, c1); const b = pt(r2, c2)
  const m = mid(r1, c1, r2, c2)
  const R = 10; const isHoriz = r1 === r2
  const wireA = isHoriz
    ? { x1: a.x, y1: a.y, x2: m.x - R, y2: m.y }
    : { x1: a.x, y1: a.y, x2: m.x, y2: m.y - R }
  const wireB = isHoriz
    ? { x1: m.x + R, y1: m.y, x2: b.x, y2: b.y }
    : { x1: m.x, y1: m.y + R, x2: b.x, y2: b.y }
  const cr = R * 0.6

  const haloConfig = getBulbRenderConfig(state)
  const isLit = haloConfig !== null

  const wireStroke = highlight ? '#EF5350' : 'var(--clr-accent, #4FC3F7)'
  const coreFill = isLit ? haloConfig.coreFill : '#ffffff'
  const coreStroke = highlight
    ? '#EF5350'
    : isLit
      ? haloConfig.coreStroke
      : 'var(--clr-accent, #4FC3F7)'
  const filamentStroke = highlight
    ? '#EF5350'
    : isLit
      ? haloConfig.filamentStroke
      : 'var(--clr-accent, #4FC3F7)'

  return (
    <g
      strokeWidth={highlight ? 3 : 2}
      fill="none"
      onClick={onTap}
      style={onTap ? { cursor: 'pointer' } : undefined}
    >
      {/* Soft outer halo with gentle breathing pulse */}
      {haloConfig && (
        <g transform={`translate(${m.x}, ${m.y})`}>
          <circle
            cx={0}
            cy={0}
            r={haloConfig.haloRadius}
            fill={`url(#${haloConfig.gradientId})`}
            className={haloConfig.className}
            opacity={haloConfig.opacity}
            stroke="none"
            pointerEvents="none"
          />
        </g>
      )}

      {/* Wire leads connecting to bulb edge */}
      <line {...wireA} stroke={wireStroke} strokeWidth={2} />
      <line {...wireB} stroke={wireStroke} strokeWidth={2} />

      {/* Bulb core circle */}
      <circle
        cx={m.x}
        cy={m.y}
        r={R}
        fill={coreFill}
        stroke={coreStroke}
        strokeWidth={2}
      />

      {/* Bright state subtle central shine */}
      {state === 'bright' && (
        <circle cx={m.x} cy={m.y} r={R * 0.45} fill="#ffffff" opacity={0.45} stroke="none" pointerEvents="none" />
      )}

      {/* Filament cross lines */}
      <line
        x1={m.x - cr}
        y1={m.y - cr}
        x2={m.x + cr}
        y2={m.y + cr}
        stroke={filamentStroke}
        strokeWidth={isLit ? 2.4 : 2}
      />
      <line
        x1={m.x + cr}
        y1={m.y - cr}
        x2={m.x - cr}
        y2={m.y + cr}
        stroke={filamentStroke}
        strokeWidth={isLit ? 2.4 : 2}
      />
    </g>
  )
}

function Resistor({ r1, c1, r2, c2, highlight, onTap }: ComponentProps) {
  const a = pt(r1, c1); const b = pt(r2, c2)
  const m = mid(r1, c1, r2, c2)
  const isHoriz = r1 === r2
  const rw = isHoriz ? 18 : 8; const rh = isHoriz ? 8 : 18
  const wireA = isHoriz
    ? { x1: a.x, y1: a.y, x2: m.x - rw, y2: m.y }
    : { x1: a.x, y1: a.y, x2: m.x, y2: m.y - rh }
  const wireB = isHoriz
    ? { x1: m.x + rw, y1: m.y, x2: b.x, y2: b.y }
    : { x1: m.x, y1: m.y + rh, x2: b.x, y2: b.y }
  const stroke = highlight ? '#EF5350' : 'var(--clr-accent, #4FC3F7)'
  return (
    <g stroke={stroke} strokeWidth={highlight ? 3 : 2} fill="none" onClick={onTap} style={onTap ? { cursor: 'pointer' } : undefined}>
      <line {...wireA} /><line {...wireB} />
      <rect x={m.x - rw} y={m.y - rh} width={rw * 2} height={rh * 2} />
    </g>
  )
}

function Switch({ r1, c1, r2, c2, closed, highlight, onTap }: ComponentProps & { closed?: boolean }) {
  const a = pt(r1, c1); const b = pt(r2, c2)
  const m = mid(r1, c1, r2, c2)
  const isHoriz = r1 === r2; const gap = 10
  const wireA = isHoriz
    ? { x1: a.x, y1: a.y, x2: m.x - gap, y2: m.y }
    : { x1: a.x, y1: a.y, x2: m.x, y2: m.y - gap }
  const wireB = isHoriz
    ? { x1: m.x + gap, y1: m.y, x2: b.x, y2: b.y }
    : { x1: m.x, y1: m.y + gap, x2: b.x, y2: b.y }
  const leverProps = closed
    ? isHoriz
      ? { x1: m.x - gap, y1: m.y, x2: m.x + gap, y2: m.y }
      : { x1: m.x, y1: m.y - gap, x2: m.x, y2: m.y + gap }
    : isHoriz
      ? { x1: m.x - gap, y1: m.y, x2: m.x + gap, y2: m.y - 12 }
      : { x1: m.x, y1: m.y - gap, x2: m.x + 12, y2: m.y + gap }
  const stroke = highlight ? '#EF5350' : 'var(--clr-accent, #4FC3F7)'
  return (
    <g stroke={stroke} strokeWidth={highlight ? 3 : 2} fill="none" onClick={onTap} style={onTap ? { cursor: 'pointer' } : undefined}>
      <line {...wireA} /><line {...wireB} /><line {...leverProps} />
    </g>
  )
}

function formatReading(val: number, unit: string): string {
  const mag = Math.abs(val)
  if (mag < 0.0005) return `0 ${unit}`
  if (mag >= 100) return `${Math.round(mag)} ${unit}`
  if (mag >= 10) return `${mag.toFixed(1)} ${unit}`
  const str = mag.toFixed(2).replace(/\.?0+$/, '')
  return `${str} ${unit}`
}

function getLabelPlacement(r1: number, c1: number, r2: number, c2: number) {
  const m = mid(r1, c1, r2, c2)
  const isHoriz = r1 === r2
  if (isHoriz) {
    const placeBelow = r1 === 0
    return {
      x: m.x,
      y: placeBelow ? m.y + 18 : m.y - 18,
      textAnchor: 'middle' as const,
      dominantBaseline: 'central' as const,
    }
  } else {
    const placeLeft = c1 >= 4
    return {
      x: placeLeft ? m.x - 18 : m.x + 18,
      y: m.y,
      textAnchor: placeLeft ? ('end' as const) : ('start' as const),
      dominantBaseline: 'central' as const,
    }
  }
}

function Wire({ r1, c1, r2, c2, highlight, onTap }: ComponentProps) {
  const a = pt(r1, c1); const b = pt(r2, c2)
  const stroke = highlight ? '#EF5350' : 'var(--clr-accent, #4FC3F7)'
  return (
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
      stroke={stroke} strokeWidth={highlight ? 4 : 2}
      onClick={onTap} style={onTap ? { cursor: 'pointer' } : undefined}
    />
  )
}

function Ammeter({ r1, c1, r2, c2, reading, highlight, onTap }: ComponentProps & { reading?: string }) {
  const a = pt(r1, c1); const b = pt(r2, c2)
  const m = mid(r1, c1, r2, c2)
  const isHoriz = r1 === r2
  const R = 12
  const wireA = isHoriz
    ? { x1: a.x, y1: a.y, x2: m.x - R, y2: m.y }
    : { x1: a.x, y1: a.y, x2: m.x, y2: m.y - R }
  const wireB = isHoriz
    ? { x1: m.x + R, y1: m.y, x2: b.x, y2: b.y }
    : { x1: m.x, y1: m.y + R, x2: b.x, y2: b.y }

  const stroke = highlight ? '#EF5350' : 'var(--clr-accent, #4FC3F7)'
  const labelPos = getLabelPlacement(r1, c1, r2, c2)

  return (
    <g
      strokeWidth={highlight ? 3 : 2}
      fill="none"
      onClick={onTap}
      style={onTap ? { cursor: 'pointer' } : undefined}
    >
      <line {...wireA} stroke={stroke} />
      <line {...wireB} stroke={stroke} />
      <circle cx={m.x} cy={m.y} r={R} stroke={stroke} strokeWidth={highlight ? 3 : 2} fill="#0f0f0f" />
      <text
        x={m.x}
        y={m.y}
        textAnchor="middle"
        dominantBaseline="central"
        fill={stroke}
        fontSize="12"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        A
      </text>
      {reading && (
        <text
          x={labelPos.x}
          y={labelPos.y}
          textAnchor={labelPos.textAnchor}
          dominantBaseline={labelPos.dominantBaseline}
          fill={highlight ? '#EF5350' : '#81D4FA'}
          fontSize="10"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {reading}
        </text>
      )}
    </g>
  )
}

function Voltmeter({ r1, c1, r2, c2, reading, highlight, onTap }: ComponentProps & { reading?: string }) {
  const a = pt(r1, c1); const b = pt(r2, c2)
  const m = mid(r1, c1, r2, c2)
  const isHoriz = r1 === r2
  const R = 12
  const wireA = isHoriz
    ? { x1: a.x, y1: a.y, x2: m.x - R, y2: m.y }
    : { x1: a.x, y1: a.y, x2: m.x, y2: m.y - R }
  const wireB = isHoriz
    ? { x1: m.x + R, y1: m.y, x2: b.x, y2: b.y }
    : { x1: m.x, y1: m.y + R, x2: b.x, y2: b.y }

  const stroke = highlight ? '#EF5350' : 'var(--clr-accent, #4FC3F7)'
  const labelPos = getLabelPlacement(r1, c1, r2, c2)

  return (
    <g
      strokeWidth={highlight ? 3 : 2}
      fill="none"
      onClick={onTap}
      style={onTap ? { cursor: 'pointer' } : undefined}
    >
      <line {...wireA} stroke={stroke} />
      <line {...wireB} stroke={stroke} />
      <circle cx={m.x} cy={m.y} r={R} stroke={stroke} strokeWidth={highlight ? 3 : 2} fill="#0f0f0f" />
      <text
        x={m.x}
        y={m.y}
        textAnchor="middle"
        dominantBaseline="central"
        fill={stroke}
        fontSize="12"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        V
      </text>
      {reading && (
        <text
          x={labelPos.x}
          y={labelPos.y}
          textAnchor={labelPos.textAnchor}
          dominantBaseline={labelPos.dominantBaseline}
          fill={highlight ? '#EF5350' : '#81D4FA'}
          fontSize="10"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {reading}
        </text>
      )}
    </g>
  )
}

function Fuse({ r1, c1, r2, c2, isBlown, reading, highlight, onTap }: ComponentProps & { isBlown?: boolean; reading?: string }) {
  const a = pt(r1, c1); const b = pt(r2, c2)
  const m = mid(r1, c1, r2, c2)
  const isHoriz = r1 === r2
  const rw = isHoriz ? 16 : 8
  const rh = isHoriz ? 8 : 16

  const stroke = isBlown ? '#EF5350' : highlight ? '#EF5350' : 'var(--clr-accent, #4FC3F7)'
  const labelPos = getLabelPlacement(r1, c1, r2, c2)
  const labelFill = isBlown || highlight ? '#EF5350' : '#81D4FA'
  const gap = 5

  return (
    <g
      stroke={stroke}
      strokeWidth={highlight ? 3 : 2}
      fill="none"
      onClick={onTap}
      style={onTap ? { cursor: 'pointer' } : undefined}
    >
      {isBlown ? (
        isHoriz ? (
          <>
            <line x1={a.x} y1={a.y} x2={m.x - gap} y2={m.y} />
            <line x1={m.x + gap} y1={m.y} x2={b.x} y2={b.y} />
          </>
        ) : (
          <>
            <line x1={a.x} y1={a.y} x2={m.x} y2={m.y - gap} />
            <line x1={m.x} y1={m.y + gap} x2={b.x} y2={b.y} />
          </>
        )
      ) : (
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      )}
      <rect
        x={m.x - rw}
        y={m.y - rh}
        width={rw * 2}
        height={rh * 2}
        strokeWidth={highlight ? 3 : 2}
        fill={isBlown ? 'rgba(239, 83, 80, 0.15)' : 'rgba(79, 195, 247, 0.05)'}
      />
      {reading && (
        <text
          x={labelPos.x}
          y={labelPos.y}
          textAnchor={labelPos.textAnchor}
          dominantBaseline={labelPos.dominantBaseline}
          fill={labelFill}
          fontSize="10"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
          stroke="none"
        >
          {reading}
        </text>
      )}
    </g>
  )
}

export default function GlowCircuitSVG({ netlist, solveResult, revealed, highlightId, onComponentTap }: Props) {
  const GRID = netlist.gridSize
  const size = PAD * 2 + (GRID - 1) * CELL

  // Build a map from component id → state and result for fast lookup
  const stateMap = new Map<string, string>()
  const resultMap = new Map<string, ComponentResult>()
  if (solveResult) {
    for (const cr of solveResult.components) {
      stateMap.set(cr.id, cr.state)
      resultMap.set(cr.id, cr)
    }
  }

  const resultsActive = Boolean(solveResult && (revealed === undefined || revealed === true))

  return (
    <svg
      width={size} height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ background: '#0f0f0f', borderRadius: '12px', maxWidth: '100%' }}
      aria-label="Circuit diagram"
      role="img"
    >
      <defs>
        {/* Normal: warm yellow gradient (yellow → transparent) */}
        <radialGradient id="glow-bulb-halo-normal" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd54a" stopOpacity="1" />
          <stop offset="45%" stopColor="#ffd54a" stopOpacity="0.7" />
          <stop offset="75%" stopColor="#ffb300" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ffd54a" stopOpacity="0" />
        </radialGradient>

        {/* Bright: stronger/larger brilliant yellow gradient */}
        <radialGradient id="glow-bulb-halo-bright" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff9c4" stopOpacity="1" />
          <stop offset="35%" stopColor="#ffd54a" stopOpacity="0.88" />
          <stop offset="70%" stopColor="#ffc107" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#ffd54a" stopOpacity="0" />
        </radialGradient>

        {/* Dim: faint orange gradient */}
        <radialGradient id="glow-bulb-halo-dim" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff9800" stopOpacity="0.75" />
          <stop offset="50%" stopColor="#ff8a65" stopOpacity="0.35" />
          <stop offset="85%" stopColor="#e2672e" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#e2672e" stopOpacity="0" />
        </radialGradient>

        {/* Overload: red gradient */}
        <radialGradient id="glow-bulb-halo-overload" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff5252" stopOpacity="1" />
          <stop offset="50%" stopColor="#ef5350" stopOpacity="0.65" />
          <stop offset="80%" stopColor="#d32f2f" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#b71c1c" stopOpacity="0" />
        </radialGradient>
      </defs>

      <style>{`
        @keyframes bulb-halo-breathe-normal {
          0%, 100% {
            transform: scale(1);
            opacity: 0.65;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.85;
          }
        }
        @keyframes bulb-halo-breathe-bright {
          0%, 100% {
            transform: scale(1);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.22);
            opacity: 0.98;
          }
        }
        @keyframes bulb-halo-breathe-dim {
          0%, 100% {
            transform: scale(1);
            opacity: 0.35;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.5;
          }
        }
        @keyframes bulb-halo-breathe-overload {
          0%, 100% {
            transform: scale(1);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.45;
          }
        }
        .bulb-halo-normal {
          animation: bulb-halo-breathe-normal 2.4s ease-in-out infinite;
          transform-origin: 0 0;
        }
        .bulb-halo-bright {
          animation: bulb-halo-breathe-bright 2.0s ease-in-out infinite;
          transform-origin: 0 0;
        }
        .bulb-halo-dim {
          animation: bulb-halo-breathe-dim 2.8s ease-in-out infinite;
          transform-origin: 0 0;
        }
        .bulb-halo-overload {
          animation: bulb-halo-breathe-overload 0.5s ease-in-out infinite;
          transform-origin: 0 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .bulb-halo-normal,
          .bulb-halo-bright,
          .bulb-halo-dim,
          .bulb-halo-overload {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* Grid dots */}
      {Array.from({ length: GRID }, (_, row) =>
        Array.from({ length: GRID }, (_, col) => {
          const p = pt(row, col)
          return <circle key={`${row}-${col}`} cx={p.x} cy={p.y} r={2} fill="rgba(255,255,255,0.2)" />
        })
      )}

      {netlist.components.map((c) => {
        const r1 = c.from.row; const c1 = c.from.col
        const r2 = c.to.row; const c2 = c.to.col
        const state = stateMap.get(c.id)
        const bulbState = revealed && state ? state : undefined
        const highlight = c.id === highlightId
        const onTap = onComponentTap ? () => onComponentTap(c.id) : undefined

        const compResult = resultsActive ? resultMap.get(c.id) : undefined
        const isBlown = compResult?.state === 'blown'
        let reading: string | undefined
        if (compResult) {
          if (c.type === 'ammeter') {
            reading = formatReading(compResult.current, 'A')
          } else if (c.type === 'voltmeter') {
            reading = formatReading(compResult.voltage, 'V')
          } else if (c.type === 'fuse') {
            reading = isBlown ? 'BLOWN' : formatReading(compResult.current, 'A')
          }
        }

        switch (c.type) {
          case 'battery':
            return <Battery key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} highlight={highlight} onTap={onTap} />
          case 'bulb':
            return <Bulb key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} state={bulbState} highlight={highlight} onTap={onTap} />
          case 'resistor':
            return <Resistor key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} highlight={highlight} onTap={onTap} />
          case 'switch':
            return <Switch key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} closed={c.closed} highlight={highlight} onTap={onTap} />
          case 'wire':
            return <Wire key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} highlight={highlight} onTap={onTap} />
          case 'ammeter':
            return <Ammeter key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} reading={reading} highlight={highlight} onTap={onTap} />
          case 'voltmeter':
            return <Voltmeter key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} reading={reading} highlight={highlight} onTap={onTap} />
          case 'fuse':
            return <Fuse key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} isBlown={isBlown} reading={reading} highlight={highlight} onTap={onTap} />
          default:
            return null
        }
      })}
    </svg>
  )
}
