/**
 * src/learn/GlowCircuitSVG.tsx — CircuitSVG extended with glowing bulbs.
 *
 * Accepts an optional `solveResult` and `revealed` flag; when both are set
 * and a bulb is lit, it glows with a coloured radial gradient.
 */
import type { Netlist, SolveResult } from '../contracts/netlist'

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

/** Map bulb state → glow colour */
function glowColour(state: string): string {
  switch (state) {
    case 'bright':
      return '#FFF176'
    case 'normal':
      return '#FFD54F'
    case 'dim':
      return '#FF8A65'
    case 'overload':
      return '#EF5350'
    default:
      return 'transparent'
  }
}

type ComponentProps = {
  r1: number; c1: number; r2: number; c2: number
  glow?: string
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

function Bulb({ r1, c1, r2, c2, glow, highlight, onTap }: ComponentProps) {
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
  const hasGlow = glow && glow !== 'transparent'
  const stroke = highlight ? '#EF5350' : (hasGlow ? glow! : 'var(--clr-accent, #4FC3F7)')

  return (
    <g stroke={stroke} strokeWidth={highlight ? 3 : 2} fill="none" onClick={onTap} style={onTap ? { cursor: 'pointer' } : undefined}>
      {hasGlow && (
        <circle cx={m.x} cy={m.y} r={R + 8} fill={glow} opacity={0.25} />
      )}
      <line {...wireA} /><line {...wireB} />
      <circle cx={m.x} cy={m.y} r={R} fill={hasGlow ? glow! + '44' : 'none'} />
      <line x1={m.x - cr} y1={m.y - cr} x2={m.x + cr} y2={m.y + cr} />
      <line x1={m.x + cr} y1={m.y - cr} x2={m.x - cr} y2={m.y + cr} />
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

export default function GlowCircuitSVG({ netlist, solveResult, revealed, highlightId, onComponentTap }: Props) {
  const GRID = netlist.gridSize
  const size = PAD * 2 + (GRID - 1) * CELL

  // Build a map from component id → state for fast lookup
  const stateMap = new Map<string, string>()
  if (solveResult) {
    for (const cr of solveResult.components) stateMap.set(cr.id, cr.state)
  }

  return (
    <svg
      width={size} height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ background: '#0f0f0f', borderRadius: '12px', maxWidth: '100%' }}
      aria-label="Circuit diagram"
      role="img"
    >
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
        const glow = revealed && state ? glowColour(state) : undefined
        const highlight = c.id === highlightId
        const onTap = onComponentTap ? () => onComponentTap(c.id) : undefined

        switch (c.type) {
          case 'battery':
            return <Battery key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} highlight={highlight} onTap={onTap} />
          case 'bulb':
            return <Bulb key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} glow={glow} highlight={highlight} onTap={onTap} />
          case 'resistor':
            return <Resistor key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} highlight={highlight} onTap={onTap} />
          case 'switch':
            return <Switch key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} closed={c.closed} highlight={highlight} onTap={onTap} />
          case 'wire':
            return <Wire key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} highlight={highlight} onTap={onTap} />
          default:
            return null
        }
      })}
    </svg>
  )
}
