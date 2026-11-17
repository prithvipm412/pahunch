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

interface BulbHaloConfig {
  haloRadius: number
  gradientId: string
  opacity: number
  className: string
  coreFill: string
  coreStroke: string
  filamentStroke: string
}

function getDrawBulbRenderConfig(state?: string): BulbHaloConfig | null {
  if (!state || state === 'off') return null
  switch (state) {
    case 'bright':
      return {
        haloRadius: 28, // ~2.8x bulb radius
        gradientId: 'draw-bulb-halo-bright',
        opacity: 0.85,
        className: 'bulb-halo-bright',
        coreFill: '#ffe066',
        coreStroke: '#ffd54a',
        filamentStroke: '#18345f',
      }
    case 'normal':
      return {
        haloRadius: 22, // ~2.2x bulb radius (R=10)
        gradientId: 'draw-bulb-halo-normal',
        opacity: 0.7, // opacity ~0.7
        className: 'bulb-halo-normal',
        coreFill: '#ffd54a', // warm yellow core #ffd54a
        coreStroke: '#ffd54a',
        filamentStroke: '#18345f',
      }
    case 'dim':
      return {
        haloRadius: 17, // ~1.7x bulb radius
        gradientId: 'draw-bulb-halo-dim',
        opacity: 0.4, // faint orange halo
        className: 'bulb-halo-dim',
        coreFill: '#ffb74d',
        coreStroke: '#ffa726',
        filamentStroke: '#18345f',
      }
    case 'overload':
      return {
        haloRadius: 23, // ~2.3x bulb radius
        gradientId: 'draw-bulb-halo-overload',
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

interface CompDrawProps {
  r1: number
  c1: number
  r2: number
  c2: number
  isSelected?: boolean
  isSuspect?: boolean
  state?: string
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

/** Render a bulb (circle with cross) with soft radial halo and warm core when lit. */
function Bulb({ r1, c1, r2, c2, isSelected, state }: CompDrawProps) {
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
  const haloConfig = getDrawBulbRenderConfig(state)
  const isLit = haloConfig !== null

  const wireStroke = isSelected ? '#FFD54F' : 'var(--clr-accent, #4FC3F7)'
  const coreFill = isLit ? haloConfig.coreFill : '#ffffff'
  const coreStroke = isSelected
    ? '#FFD54F'
    : isLit
      ? haloConfig.coreStroke
      : 'var(--clr-accent, #4FC3F7)'
  const filamentStroke = isSelected
    ? '#FFD54F'
    : isLit
      ? haloConfig.filamentStroke
      : 'var(--clr-accent, #4FC3F7)'

  return (
    <g strokeWidth={2} fill="none">
      {/* Soft outer halo with breathing pulse */}
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
      <line {...wireA} stroke={wireStroke} />
      <line {...wireB} stroke={wireStroke} />

      {/* Bulb core circle */}
      <circle
        cx={m.x}
        cy={m.y}
        r={R}
        fill={coreFill}
        stroke={coreStroke}
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
      <defs>
        {/* Normal: warm yellow gradient (yellow → transparent) */}
        <radialGradient id="draw-bulb-halo-normal" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd54a" stopOpacity="1" />
          <stop offset="45%" stopColor="#ffd54a" stopOpacity="0.7" />
          <stop offset="75%" stopColor="#ffb300" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ffd54a" stopOpacity="0" />
        </radialGradient>

        {/* Bright: stronger/larger brilliant yellow gradient */}
        <radialGradient id="draw-bulb-halo-bright" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff9c4" stopOpacity="1" />
          <stop offset="35%" stopColor="#ffd54a" stopOpacity="0.88" />
          <stop offset="70%" stopColor="#ffc107" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#ffd54a" stopOpacity="0" />
        </radialGradient>

        {/* Dim: faint orange gradient */}
        <radialGradient id="draw-bulb-halo-dim" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff9800" stopOpacity="0.75" />
          <stop offset="50%" stopColor="#ff8a65" stopOpacity="0.35" />
          <stop offset="85%" stopColor="#e2672e" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#e2672e" stopOpacity="0" />
        </radialGradient>

        {/* Overload: red gradient */}
        <radialGradient id="draw-bulb-halo-overload" cx="50%" cy="50%" r="50%">
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
        const a = pt(r1, c1)
        const b = pt(r2, c2)

        const drawProps: CompDrawProps = {
          r1,
          c1,
          r2,
          c2,
          isSelected,
          isSuspect,
          state,
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
