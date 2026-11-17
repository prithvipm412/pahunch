/**
 * CircuitSVG.tsx — renders a Netlist as a clean SVG on a 5×5 grid.
 */
import type { Netlist } from '../contracts/netlist'

interface Props {
  netlist: Netlist
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

/** Render a battery symbol (two parallel lines perpendicular to wire direction). */
function Battery({ r1, c1, r2, c2 }: { r1: number; c1: number; r2: number; c2: number }) {
  const a = pt(r1, c1)
  const b = pt(r2, c2)
  const m = mid(r1, c1, r2, c2)
  const isHoriz = r1 === r2
  const halfGap = 6
  const longLine = 14
  const shortLine = 9

  // Positive plate (long) and negative plate (short)
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

  return (
    <g stroke="var(--clr-accent)" strokeWidth={2} fill="none">
      <line {...wireA} />
      <line {...wireB} />
      <line {...longProps} strokeWidth={3} />
      <line {...shortProps} />
    </g>
  )
}

/** Render a bulb (circle with cross). */
function Bulb({ r1, c1, r2, c2 }: { r1: number; c1: number; r2: number; c2: number }) {
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
  return (
    <g stroke="var(--clr-accent)" strokeWidth={2} fill="none">
      <line {...wireA} />
      <line {...wireB} />
      <circle cx={m.x} cy={m.y} r={R} />
      <line x1={m.x - cr} y1={m.y - cr} x2={m.x + cr} y2={m.y + cr} />
      <line x1={m.x + cr} y1={m.y - cr} x2={m.x - cr} y2={m.y + cr} />
    </g>
  )
}

/** Render a resistor (rectangle). */
function Resistor({ r1, c1, r2, c2 }: { r1: number; c1: number; r2: number; c2: number }) {
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

  return (
    <g stroke="var(--clr-accent)" strokeWidth={2} fill="none">
      <line {...wireA} />
      <line {...wireB} />
      <rect x={m.x - rw} y={m.y - rh} width={rw * 2} height={rh * 2} />
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
}: {
  r1: number
  c1: number
  r2: number
  c2: number
  closed?: boolean
}) {
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

  // Lever: closed → straight, open → angled
  const leverProps = closed
    ? isHoriz
      ? { x1: m.x - gap, y1: m.y, x2: m.x + gap, y2: m.y }
      : { x1: m.x, y1: m.y - gap, x2: m.x, y2: m.y + gap }
    : isHoriz
      ? { x1: m.x - gap, y1: m.y, x2: m.x + gap, y2: m.y - 12 }
      : { x1: m.x, y1: m.y - gap, x2: m.x + 12, y2: m.y + gap }

  return (
    <g stroke="var(--clr-accent)" strokeWidth={2} fill="none">
      <line {...wireA} />
      <line {...wireB} />
      <line {...leverProps} />
    </g>
  )
}

/** Render a wire (straight line). */
function Wire({ r1, c1, r2, c2 }: { r1: number; c1: number; r2: number; c2: number }) {
  const a = pt(r1, c1)
  const b = pt(r2, c2)
  return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--clr-accent)" strokeWidth={2} />
}

export default function CircuitSVG({ netlist }: Props) {
  const size = PAD * 2 + (GRID - 1) * CELL

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', maxWidth: '100%' }}
      aria-label="Interpreted circuit diagram"
      role="img"
    >
      {/* Grid dots */}
      {Array.from({ length: GRID }, (_, row) =>
        Array.from({ length: GRID }, (_, col) => {
          const p = pt(row, col)
          return (
            <circle
              key={`${row}-${col}`}
              cx={p.x}
              cy={p.y}
              r={2}
              fill="rgba(255,255,255,0.2)"
            />
          )
        }),
      )}

      {/* Components */}
      {netlist.components.map((c) => {
        const r1 = c.from.row
        const c1 = c.from.col
        const r2 = c.to.row
        const c2 = c.to.col
        switch (c.type) {
          case 'battery':
            return <Battery key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} />
          case 'bulb':
            return <Bulb key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} />
          case 'resistor':
            return <Resistor key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} />
          case 'switch':
            return <Switch key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} closed={c.closed} />
          case 'wire':
            return <Wire key={c.id} r1={r1} c1={c1} r2={r2} c2={c2} />
          default:
            return null
        }
      })}
    </svg>
  )
}
