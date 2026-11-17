/**
 * CircuitSVG.tsx — renders a Netlist as a clean SVG on a 5×5 grid.
 *
 * Supports Tap-to-Fix interactive mode:
 *  - Tapping a component selects it and/or cycles its type
 *  - Selected component has a golden glowing outline
 *  - Bulbs glow when solveResult reports active states (bright/normal/dim/overload)
 *  - Tapping between two dots adds a wire
 *  - Tapping dot A then dot B adds a wire between them
 */
import type { Netlist, GridPoint, SolveResult } from '../contracts/netlist'

export interface CircuitSVGProps {
  netlist: Netlist
  solveResult?: SolveResult
  selectedId?: string | null
  suspectWireIds?: string[]
  activeDot?: GridPoint | null
  interactive?: boolean
  onComponentTap?: (id: string) => void
  onDotTap?: (pt: GridPoint) => void
  onAddWire?: (from: GridPoint, to: GridPoint) => void
}

const CELL = 48 // px per grid cell
const PAD = 24  // padding around the grid
const GRID = 5

/** Map grid point to SVG coordinates. */
function pt(row: number, col: number) {
  return { x: PAD + col * CELL, y: PAD + row * CELL }
}

/** Midpoint between two grid points. */
function mid(r1: number, c1: number, r2: number, c2: number) {
  return {
    x: PAD + ((c1 + c2) / 2) * CELL,
    y: PAD + ((r1 + r2) / 2) * CELL,
  }
}

/** Glow color for bulb states */
function bulbGlowColor(state?: string): string {
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

interface CompDrawProps {
  r1: number
  c1: number
  r2: number
  c2: number
  isSelected?: boolean
  isSuspect?: boolean
  glow?: string
}

/** Render a battery symbol (two parallel lines perpendicular to wire direction). */
function Battery({ r1, c1, r2, c2, isSelected }: CompDrawProps) {
  const a = pt(r1, c1)
  const b = pt(r2, c2)
  const m = mid(r1, c1, r2, c2)
  const isHoriz = r1 === r2
  const halfGap = 6
  const longLine = 14
  const shortLine = 9

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

  const stroke = isSelected ? '#FFD54F' : 'var(--clr-accent, #4FC3F7)'

  return (
    <g stroke={stroke} strokeWidth={2} fill="none">
      <line {...wireA} />
      <line {...wireB} />
      <line {...longProps} strokeWidth={isSelected ? 4 : 3} />
      <line {...shortProps} strokeWidth={isSelected ? 3 : 2} />
    </g>
  )
}

/** Render a bulb (circle with cross) with optional glow. */
function Bulb({ r1, c1, r2, c2, isSelected, glow }: CompDrawProps) {
  const a = pt(r1, c1)
  const b = pt(r2, c2)
  const m = mid(r1, c1, r2, c2)
  const R = 10
  const isHoriz = r1 === r2

  const wireA = isHoriz
    ? { x1: a.x, y1: a.y, x2: m.x - R, y2: m.y }
    : { x1: a.x, y1: a.y, x2: m.x, y2: m.y - R }
  const wireB = isHoriz
    ? { x1: m.x + R, y1: m.y, x2: b.x, y2: b.y }
    : { x1: m.x, y1: m.y + R, x2: b.x, y2: b.y }

  const cr = R * 0.6
  const hasGlow = glow && glow !== 'transparent'
  const stroke = isSelected ? '#FFD54F' : (hasGlow ? glow : 'var(--clr-accent, #4FC3F7)')

  return (
    <g stroke={stroke} strokeWidth={2} fill="none">
      {hasGlow && (
        <circle cx={m.x} cy={m.y} r={R + 8} fill={glow} opacity={0.3} stroke="none" />
      )}
      <line {...wireA} />
      <line {...wireB} />
      <circle cx={m.x} cy={m.y} r={R} fill={hasGlow ? `${glow}44` : 'none'} />
      <line x1={m.x - cr} y1={m.y - cr} x2={m.x + cr} y2={m.y + cr} />
      <line x1={m.x + cr} y1={m.y - cr} x2={m.x - cr} y2={m.y + cr} />
    </g>
  )
}

/** Render a resistor (rectangle). */
function Resistor({ r1, c1, r2, c2, isSelected }: CompDrawProps) {
  const a = pt(r1, c1)
  const b = pt(r2, c2)
  const m = mid(r1, c1, r2, c2)
  const isHoriz = r1 === r2
  const rw = isHoriz ? 18 : 8
  const rh = isHoriz ? 8 : 18

  const wireA = isHoriz
    ? { x1: a.x, y1: a.y, x2: m.x - rw, y2: m.y }
    : { x1: a.x, y1: a.y, x2: m.x, y2: m.y - rh }
  const wireB = isHoriz
    ? { x1: m.x + rw, y1: m.y, x2: b.x, y2: b.y }
    : { x1: m.x, y1: m.y + rh, x2: b.x, y2: b.y }

  const stroke = isSelected ? '#FFD54F' : 'var(--clr-accent, #4FC3F7)'

  return (
    <g stroke={stroke} strokeWidth={2} fill="none">
      <line {...wireA} />
      <line {...wireB} />
      <rect
        x={m.x - rw}
        y={m.y - rh}
        width={rw * 2}
        height={rh * 2}
        strokeWidth={isSelected ? 3 : 2}
        fill={isSelected ? 'rgba(255, 213, 79, 0.15)' : 'none'}
      />
    </g>
  )
}

/** Render a switch (line with a gap or lever). */
function Switch({
  r1,
  c1,
  r2,
  c2,
  closed,
  isSelected,
}: CompDrawProps & { closed?: boolean }) {
  const a = pt(r1, c1)
  const b = pt(r2, c2)
  const m = mid(r1, c1, r2, c2)
  const isHoriz = r1 === r2
  const gap = 10

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

  const stroke = isSelected ? '#FFD54F' : 'var(--clr-accent, #4FC3F7)'

  return (
    <g stroke={stroke} strokeWidth={isSelected ? 3 : 2} fill="none">
      <line {...wireA} />
      <line {...wireB} />
      <line {...leverProps} />
    </g>
  )
}

/** Render a wire (straight line). */
function Wire({ r1, c1, r2, c2, isSelected, isSuspect }: CompDrawProps) {
  const a = pt(r1, c1)
  const b = pt(r2, c2)
  const stroke = isSelected ? '#FFD54F' : isSuspect ? '#FF9800' : 'var(--clr-accent, #4FC3F7)'
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke={stroke}
      strokeWidth={isSelected ? 4 : isSuspect ? 4 : 2}
    />
  )
}

export default function CircuitSVG({
  netlist,
  solveResult,
  selectedId,
  suspectWireIds,
  activeDot,
  interactive,
  onComponentTap,
  onDotTap,
  onAddWire,
}: CircuitSVGProps) {
  const size = PAD * 2 + (GRID - 1) * CELL

  // Map component id -> bulb state for fast glow lookup
  const bulbStateMap = new Map<string, string>()
  if (solveResult) {
    for (const comp of solveResult.components) {
      bulbStateMap.set(comp.id, comp.state)
    }
  }

  // Pre-calculate which adjacent dot pairs have components
  const occupiedSegments = new Set<string>()
  for (const c of netlist.components) {
    const k1 = `${c.from.row},${c.from.col}-${c.to.row},${c.to.col}`
    const k2 = `${c.to.row},${c.to.col}-${c.from.row},${c.from.col}`
    occupiedSegments.add(k1)
    occupiedSegments.add(k2)
  }

  // Find all open adjacent slots where a wire can be added by tapping
  const openSlots: Array<{ p1: GridPoint; p2: GridPoint }> = []
  if (interactive && onAddWire) {
    // Horizontal segments
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID - 1; c++) {
        const key = `${r},${c}-${r},${c + 1}`
        if (!occupiedSegments.has(key)) {
          openSlots.push({ p1: { row: r, col: c }, p2: { row: r, col: c + 1 } })
        }
      }
    }
    // Vertical segments
    for (let r = 0; r < GRID - 1; r++) {
      for (let c = 0; c < GRID; c++) {
        const key = `${r},${c}-${r + 1},${c}`
        if (!occupiedSegments.has(key)) {
          openSlots.push({ p1: { row: r, col: c }, p2: { row: r + 1, col: c } })
        }
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{
        background: '#0f0f0f',
        borderRadius: '12px',
        maxWidth: '100%',
        touchAction: 'manipulation',
      }}
      aria-label="Interpreted circuit diagram"
      role="img"
    >
      {/* Open wire slots between adjacent dots — Tap to add wire */}
      {openSlots.map(({ p1, p2 }) => {
        const a = pt(p1.row, p1.col)
        const b = pt(p2.row, p2.col)
        const key = `slot-${p1.row},${p1.col}-${p2.row},${p2.col}`
        return (
          <g
            key={key}
            onClick={(e) => {
              e.stopPropagation()
              onAddWire?.(p1, p2)
            }}
            style={{ cursor: 'pointer' }}
          >
            {/* Subtle dashed guide line */}
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="rgba(255,255,255,0.07)"
              strokeDasharray="2 4"
              strokeWidth={2}
            />
            {/* Wide invisible touch/click hitbox */}
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="transparent"
              strokeWidth={30}
              style={{ pointerEvents: 'stroke' }}
            />
          </g>
        )
      })}

      {/* Grid dots */}
      {Array.from({ length: GRID }, (_, row) =>
        Array.from({ length: GRID }, (_, col) => {
          const p = pt(row, col)
          const isActiveDot = activeDot?.row === row && activeDot?.col === col
          return (
            <g
              key={`dot-${row}-${col}`}
              onClick={(e) => {
                if (interactive && onDotTap) {
                  e.stopPropagation()
                  onDotTap({ row, col })
                }
              }}
              style={interactive ? { cursor: 'pointer' } : undefined}
            >
              {/* Invisible large touch target for dot */}
              {interactive && (
                <circle cx={p.x} cy={p.y} r={16} fill="transparent" />
              )}
              {/* Active dot highlight */}
              {isActiveDot && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={8}
                  fill="rgba(255,213,79,0.3)"
                  stroke="#FFD54F"
                  strokeWidth={2}
                />
              )}
              {/* Standard dot */}
              <circle
                cx={p.x}
                cy={p.y}
                r={isActiveDot ? 3 : 2}
                fill={isActiveDot ? '#FFD54F' : 'rgba(255,255,255,0.2)'}
              />
            </g>
          )
        }),
      )}

      {/* Components */}
      {netlist.components.map((c) => {
        const r1 = c.from.row
        const c1 = c.from.col
        const r2 = c.to.row
        const c2 = c.to.col
        const isSelected = selectedId === c.id
        const isSuspect = Boolean(suspectWireIds?.includes(c.id))
        const state = bulbStateMap.get(c.id)
        const glow = bulbGlowColor(state)
        const a = pt(r1, c1)
        const b = pt(r2, c2)

        const drawProps: CompDrawProps = {
          r1,
          c1,
          r2,
          c2,
          isSelected,
          isSuspect,
          glow,
        }

        let symbolNode = null
        switch (c.type) {
          case 'battery':
            symbolNode = <Battery {...drawProps} />
            break
          case 'bulb':
            symbolNode = <Bulb {...drawProps} />
            break
          case 'resistor':
            symbolNode = <Resistor {...drawProps} />
            break
          case 'switch':
            symbolNode = <Switch {...drawProps} closed={c.closed} />
            break
          case 'wire':
            symbolNode = <Wire {...drawProps} />
            break
          default:
            symbolNode = null
        }

        return (
          <g
            key={c.id}
            onClick={(e) => {
              if (interactive && onComponentTap) {
                e.stopPropagation()
                onComponentTap(c.id)
              }
            }}
            style={interactive ? { cursor: 'pointer' } : undefined}
          >
            {/* Suspect wire orange halo */}
            {isSuspect && !isSelected && (
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#FF9800"
                strokeWidth={14}
                opacity={0.4}
                strokeLinecap="round"
              />
            )}
            {/* Selection halo */}
            {isSelected && (
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#FFD54F"
                strokeWidth={14}
                opacity={0.3}
                strokeLinecap="round"
              />
            )}
            {/* Drawn component symbol */}
            {symbolNode}
            {/* Wide invisible tap hitbox for touch screens */}
            {interactive && (
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={32}
                style={{ pointerEvents: 'stroke' }}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
