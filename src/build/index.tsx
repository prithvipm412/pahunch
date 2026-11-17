import { useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { CircuitComponent, ComponentResult, ComponentType, GridPoint, Netlist, SolveResult } from '../contracts/netlist'
import { solve } from '../physics'
import { stopAll, stopSonify } from '../audio'
import { haptic, hapticForCircuitStatus, type HapticName } from '../audio/haptics'
import { classifyCircuitStatus, playCircuitStatusSound } from '../audio/feedbackSounds'
import { useLanguage, useT } from '../app/lang'
import { tWith, type TranslationKey } from '../app/i18n'
import { componentsOverlap, extendWireDragPath, wireSegmentsForDragPath } from './wirePath'

const PLACE_HAPTIC: Record<ComponentType, HapticName> = {
  wire: 'place_wire', battery: 'place_battery', bulb: 'place_bulb', resistor: 'place_resistor', switch: 'place_switch',
}

const parts: { type: ComponentType; key: TranslationKey; icon: string }[] = [
  { type: 'battery', key: 'battery', icon: '▤' }, { type: 'bulb', key: 'bulb', icon: '◉' },
  { type: 'resistor', key: 'resistor', icon: '⌁' }, { type: 'switch', key: 'switch', icon: '⌑' }, { type: 'wire', key: 'wire', icon: '—' },
]
const initialNetlist: Netlist = { gridSize: 5, components: [], source: 'build' }
const xAt = (point: GridPoint) => 34 + point.col * 73
const yAt = (point: GridPoint) => 34 + point.row * 73
const isVertical = (component: CircuitComponent) => component.from.col === component.to.col
const labelFor = (component: CircuitComponent, translate: (key: TranslationKey) => string) => component.type === 'battery' ? `${component.value ?? 3} V` : component.type === 'resistor' ? `${component.value ?? 10} Ω` : component.type === 'switch' ? (component.closed === false ? translate('open') : translate('closed')) : translate(component.type)
const formatValue = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1)
const componentValueLabel = (component: CircuitComponent) => component.type === 'battery' ? `${formatValue(component.value ?? 3)} V` : component.type === 'resistor' || component.type === 'bulb' ? `${formatValue(component.value ?? 10)} Ω` : null
const samePath = (first: readonly GridPoint[], second: readonly GridPoint[]) => first.length === second.length && first.every((point, index) => point.row === second[index].row && point.col === second[index].col)

interface WireDrag {
  pointerId: number
  startNetlist: Netlist
  path: GridPoint[]
  addedComponents: CircuitComponent[]
}

interface PartDrag {
  pointerId: number
  component: CircuitComponent
  startX: number
  startY: number
  offsetX: number
  offsetY: number
  candidate: CircuitComponent
  valid: boolean
  moved: boolean
}

function SymbolGraphic({ component, result, selected, onClick, onPointerDown, translate, interactive, ghost }: { component: CircuitComponent; result?: ComponentResult; selected: boolean; onClick: () => void; onPointerDown?: (event: ReactPointerEvent<SVGGElement>) => void; translate: (key: TranslationKey) => string; interactive: boolean; ghost?: 'valid' | 'invalid' }) {
  const x1 = xAt(component.from), y1 = yAt(component.from), x2 = xAt(component.to), y2 = yAt(component.to)
  const vertical = isVertical(component)
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
  const length = Math.hypot(x2 - x1, y2 - y1)
  const radius = Math.max(13, Math.min(20, length * .23))
  const glow = component.type === 'bulb' ? `bulb-${result?.state ?? 'off'}` : ''
  const current = Math.abs(result?.current ?? 0)
  const duration = Math.max(.22, Math.min(1.8, 1.8 / (1 + current)))
  return <g className={`${selected ? 'selected-part' : ''} ${glow} ${ghost ? `move-ghost move-ghost-${ghost}` : ''}`} onPointerDown={onPointerDown} onClick={(event) => { if (interactive) { event.stopPropagation(); onClick() } }} pointerEvents={interactive ? 'auto' : 'none'} role="button" tabIndex={interactive ? 0 : -1} aria-label={`${translate(component.type)}, ${labelFor(component, translate)}`}>
    <line x1={x1} y1={y1} x2={x2} y2={y2} className="part-line" />
    {result && current > 0 && <line x1={x1} y1={y1} x2={x2} y2={y2} className="flow-line" style={{ '--flow-duration': `${duration}s` } as CSSProperties} />}
    <g transform={`translate(${cx} ${cy}) rotate(${vertical ? 90 : 0})`}>
      {component.type === 'battery' && <><rect x={-radius - 8} y={-radius} width={(radius + 8) * 2} height={radius * 2} rx="5" className="part-symbol" /><line x1="-5" y1={-radius + 4} x2="-5" y2={radius - 4} stroke="#18345f" strokeWidth="3" /><line x1="5" y1={-radius * .62} x2="5" y2={radius * .62} stroke="#18345f" strokeWidth="3" /></>}
      {component.type === 'bulb' && <><circle r={radius} className="part-symbol" fill={result?.state && result.state !== 'off' ? '#ffd86b' : '#fff'} /><path d={`M ${-radius * .48} ${-radius * .35} Q 0 ${radius * .55} ${radius * .48} ${-radius * .35} M ${-radius * .28} ${radius * .64} H ${radius * .28}`} fill="none" stroke="#18345f" strokeWidth="2.6" /></>}
      {component.type === 'resistor' && <><rect x={-radius - 8} y={-radius * .58} width={(radius + 8) * 2} height={radius * 1.16} rx="4" className="part-symbol" /><polyline points={`${-radius},0 ${-radius * .65},${-radius * .38} ${-radius * .3},${radius * .38} 0,${-radius * .38} ${radius * .3},${radius * .38} ${radius * .65},${-radius * .38} ${radius},0`} fill="none" stroke="#18345f" strokeWidth="2" /></>}
      {component.type === 'switch' && <><rect x={-radius - 8} y={-radius * .58} width={(radius + 8) * 2} height={radius * 1.16} rx="4" className="part-symbol" /><circle cx={-radius * .68} cy="0" r="3.5" fill="#18345f" /><circle cx={radius * .68} cy="0" r="3.5" fill="#18345f" /><line x1={-radius * .62} y1="0" x2={component.closed === false ? radius * .35 : radius * .62} y2={component.closed === false ? -radius * .52 : 0} stroke="#18345f" strokeWidth="2.5" /><text x="0" y={radius + 14} className="part-text">{component.closed === false ? translate('open') : translate('closed')}</text></>}
      {component.type === 'wire' && <><circle r="7" className="part-symbol" /><text x="0" y="1" className="part-text">·</text></>}
    </g>
    {componentValueLabel(component) && <text x={cx + (vertical ? (component.from.col === 4 ? -radius - 16 : radius + 16) : 0)} y={cy + (vertical ? 4 : -radius - 8)} className="part-value-label">{componentValueLabel(component)}</text>}
    <rect x={Math.min(x1, x2) - 14} y={Math.min(y1, y2) - 14} width={Math.abs(x2 - x1) + 28} height={Math.abs(y2 - y1) + 28} fill="transparent" />
  </g>
}

export default function BuildScreen() {
  const location = useLocation()
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const translate = useT()
  const routeNetlist = (location.state as { netlist?: Netlist } | null)?.netlist
  const isUsableNetlist = (candidate?: Netlist): candidate is Netlist => Boolean(candidate && candidate.gridSize === 5 && Array.isArray(candidate.components) && candidate.components.every((component) => component.from && component.to && Number.isInteger(component.from.row) && Number.isInteger(component.from.col) && Number.isInteger(component.to.row) && Number.isInteger(component.to.col) && component.from.row >= 0 && component.from.row < 5 && component.from.col >= 0 && component.from.col < 5 && component.to.row >= 0 && component.to.row < 5 && component.to.col >= 0 && component.to.col < 5))
  const loadedNetlist = isUsableNetlist(routeNetlist) ? { ...routeNetlist, source: 'build' as const } : null
  const [netlist, setNetlist] = useState<Netlist>(() => loadedNetlist ?? initialNetlist)
  const [undoStack, setUndoStack] = useState<Netlist[]>([])
  const [placing, setPlacing] = useState<ComponentType | null>(null)
  const [firstPoint, setFirstPoint] = useState<GridPoint | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [movePreview, setMovePreview] = useState<{ component: CircuitComponent; valid: boolean } | null>(null)
  const [result, setResult] = useState<SolveResult | null>(null)
  const [notice, setNotice] = useState(() => translate('hintStart'))
  const [wirePreview, setWirePreview] = useState<{ from: GridPoint; to: { x: number; y: number } } | null>(null)
  const wireDragRef = useRef<WireDrag | null>(null)
  const partDragRef = useRef<PartDrag | null>(null)
  const suppressWireClickRef = useRef(false)
  const suppressPartClickRef = useRef(false)
  const selected = netlist.components.find((item) => item.id === selectedId)
  const resultMap = useMemo(() => new Map((result?.components ?? []).map((item) => [item.id, item])), [result])

  function saveNetlist(next: Netlist, recalculate = false) {
    const hadResults = result !== null
    setUndoStack((history) => [...history, netlist].slice(-30))
    setNetlist(next)
    if (recalculate && hadResults) {
      const nextResult = solve(next)
      setResult(nextResult)
      stopSonify()
    } else {
      setResult(null)
      stopSonify()
    }
  }

  function choosePart(type: ComponentType) {
    if (type === 'wire' && placing === 'wire') {
      setPlacing(null); setFirstPoint(null); setEditOpen(false); setNotice(translate('hintStart'))
      return
    }
    setPlacing(type); setFirstPoint(null); setSelectedId(null); setEditOpen(false)
    setNotice(type === 'wire' ? translate('wireHint') : translate('hintChoose'))
  }
  function addComponent(from: GridPoint, to: GridPoint) {
    if (from.row === to.row && from.col === to.col) { haptic('invalid'); setNotice(translate('hintTwoDots')); setFirstPoint(null); return }
    if (from.row !== to.row && from.col !== to.col) { haptic('invalid'); setNotice(translate('hintSameLine')); setFirstPoint(null); return }
    const type = placing
    if (!type) return
    if (type === 'wire') {
      const expectedEdges = Math.abs(to.row - from.row) + Math.abs(to.col - from.col)
      if (wireSegmentsForDragPath([from, to], netlist.components).length !== expectedEdges) {
        haptic('invalid'); setNotice(translate('hintOccupiedWire')); setFirstPoint(null); return
      }
    }
    const newComponent: CircuitComponent = { id: `build-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, from, to, ...((type === 'battery' || type === 'bulb' || type === 'resistor') ? { value: type === 'battery' ? 3 : 10 } : {}), ...(type === 'switch' ? { closed: true } : {}) }
    if (type !== 'wire' && netlist.components.some((component) => componentsOverlap(newComponent, component))) {
      haptic('invalid'); setNotice(translate('hintOccupiedWire')); setFirstPoint(null); return
    }
    haptic(PLACE_HAPTIC[type])
    saveNetlist({ ...netlist, source: 'build', components: [...netlist.components, newComponent] })
    if (type !== 'wire') {
      setPlacing(null); setSelectedId(newComponent.id)
      setEditOpen(type === 'battery' || type === 'resistor')
    }
    setFirstPoint(null); setNotice(type === 'wire' ? translate('wireHint') : tWith('partAdded', lang, { part: translate(type) }))
  }
  function tapDot(row: number, col: number) {
    if (!placing) { setNotice(translate('hintSelectPart')); return }
    const point = { row, col }
    if (!firstPoint) { setFirstPoint(point); return }
    addComponent(firstPoint, point)
  }

  function canvasPoint(event: { clientX: number; clientY: number }, svg: SVGSVGElement) {
    const matrix = svg.getScreenCTM()
    if (matrix) {
      const point = svg.createSVGPoint()
      point.x = event.clientX
      point.y = event.clientY
      const transformed = point.matrixTransform(matrix.inverse())
      return { x: transformed.x, y: transformed.y }
    }
    const bounds = svg.getBoundingClientRect()
    return { x: ((event.clientX - bounds.left) / bounds.width) * 360, y: ((event.clientY - bounds.top) / bounds.height) * 360 }
  }

  function nearestGridPoint(point: { x: number; y: number }): GridPoint | null {
    const col = Math.round((point.x - 34) / 73)
    const row = Math.round((point.y - 34) / 73)
    if (row < 0 || row > 4 || col < 0 || col > 4) return null
    const snapped = { row, col }
    return Math.hypot(point.x - xAt(snapped), point.y - yAt(snapped)) <= 73 * 0.4 ? snapped : null
  }

  function appendDragWires(drag: WireDrag) {
    const oldIds = new Set(drag.addedComponents.map((component) => component.id))
    const segments = wireSegmentsForDragPath(drag.path, drag.startNetlist.components)
    const added = segments.map((segment): CircuitComponent => ({
      id: `build-wire-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'wire',
      from: segment.from,
      to: segment.to,
    }))
    drag.addedComponents = added
    setNetlist((current) => ({ ...current, source: 'build', components: [...current.components.filter((component) => !oldIds.has(component.id)), ...added] }))
    if (oldIds.size > 0 || added.length > 0) { setResult(null); stopSonify() }
  }

  function beginPartDrag(component: CircuitComponent, event: ReactPointerEvent<SVGGElement>) {
    if (placing) return
    event.stopPropagation()
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    const point = canvasPoint(event, svg)
    svg.setPointerCapture(event.pointerId)
    const fromX = xAt(component.from), fromY = yAt(component.from)
    const drag: PartDrag = {
      pointerId: event.pointerId, component, startX: point.x, startY: point.y,
      offsetX: point.x - fromX, offsetY: point.y - fromY,
      candidate: component, valid: true, moved: false,
    }
    partDragRef.current = drag
  }

  function movePartDrag(drag: PartDrag, point: { x: number; y: number }) {
    const dx = point.x - drag.startX, dy = point.y - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < 8) return
    drag.moved = true
    const horizontal = Math.abs(dx) + Math.abs(dy) < 18
      ? drag.component.from.row === drag.component.to.row
      : Math.abs(dx) >= Math.abs(dy)
    const span = Math.max(1, Math.abs(drag.component.to.row - drag.component.from.row), Math.abs(drag.component.to.col - drag.component.from.col))
    const desired = { x: point.x - drag.offsetX, y: point.y - drag.offsetY }
    let col = Math.round((desired.x - 34) / 73), row = Math.round((desired.y - 34) / 73)
    if (horizontal) { row = Math.max(0, Math.min(4, row)); col = Math.max(0, Math.min(4 - span, col)) }
    else { col = Math.max(0, Math.min(4, col)); row = Math.max(0, Math.min(4 - span, row)) }
    const from = { row, col }
    const to = horizontal ? { row, col: col + span } : { row: row + span, col }
    const candidate = { ...drag.component, from, to }
    const valid = !netlist.components.some((part) => part.id !== drag.component.id && componentsOverlap(candidate, part))
    drag.candidate = candidate
    drag.valid = valid
    setMovePreview({ component: candidate, valid })
  }

  function finishPartDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = partDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return false
    if (event.type === 'pointerup' && drag.moved && drag.valid) {
      haptic('tap')
      saveNetlist({ ...netlist, source: 'build', components: netlist.components.map((component) => component.id === drag.component.id ? drag.candidate : component) }, true)
      setSelectedId(drag.component.id)
      setEditOpen(false)
      suppressPartClickRef.current = true
      setNotice(translate('partMoving'))
    } else if (drag.moved && !drag.valid) {
      haptic('invalid')
      suppressPartClickRef.current = true
      setNotice(translate('moveBlocked'))
    }
    partDragRef.current = null
    setMovePreview(null)
    return true
  }

  function startWireDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (placing !== 'wire') return
    const point = canvasPoint(event, event.currentTarget)
    const snapped = nearestGridPoint(point)
    if (!snapped) return
    haptic('tap')
    event.currentTarget.setPointerCapture(event.pointerId)
    suppressWireClickRef.current = false
    const drag: WireDrag = { pointerId: event.pointerId, startNetlist: netlist, path: [snapped], addedComponents: [] }
    wireDragRef.current = drag
    setFirstPoint(null)
    setWirePreview({ from: snapped, to: point })
  }

  function moveWireDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const partDrag = partDragRef.current
    if (partDrag && partDrag.pointerId === event.pointerId) {
      event.preventDefault()
      movePartDrag(partDrag, canvasPoint(event, event.currentTarget))
      return
    }
    const drag = wireDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    const point = canvasPoint(event, event.currentTarget)
    const snapped = nearestGridPoint(point)
    if (snapped) {
      const nextPath = extendWireDragPath(drag.path, snapped)
      if (!samePath(nextPath, drag.path)) {
        drag.path = nextPath
        appendDragWires(drag)
      }
    }
    setWirePreview({ from: drag.path[drag.path.length - 1], to: point })
  }

  function finishWireDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (finishPartDrag(event)) return
    let drag = wireDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.type === 'pointerup') {
      const point = canvasPoint(event, event.currentTarget)
      const snapped = nearestGridPoint(point)
      if (snapped) {
        const nextPath = extendWireDragPath(drag.path, snapped)
        if (!samePath(nextPath, drag.path)) {
          drag.path = nextPath
          appendDragWires(drag)
        }
      }
    }
    drag = wireDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.addedComponents.length > 0) {
      setUndoStack((history) => [...history, drag.startNetlist].slice(-30))
      suppressWireClickRef.current = true
    }
    wireDragRef.current = null
    setWirePreview(null)
  }

  function handleGridClick(event: ReactMouseEvent<SVGSVGElement>) {
    if (suppressPartClickRef.current) {
      suppressPartClickRef.current = false
      return
    }
    if (!placing) return
    if (placing === 'wire' && suppressWireClickRef.current) {
      suppressWireClickRef.current = false
      return
    }
    const snapped = nearestGridPoint(canvasPoint(event, event.currentTarget))
    if (snapped) tapDot(snapped.row, snapped.col)
  }

  function updateSelected(changes: Partial<CircuitComponent>) {
    if (!selectedId) return
    haptic('select')
    saveNetlist({ ...netlist, components: netlist.components.map((component) => component.id === selectedId ? { ...component, ...changes } : component) }, true)
  }
  function runCircuit() {
    stopAll()
    let next: SolveResult
    try {
      next = solve(netlist)
      setResult(next); setSelectedId(null)
      if (next.ok) setNotice(translate('resultsUpdated'))
      else setNotice(translate('checkCircuit'))
    } finally {
      stopAll()
    }
    // Fired after stopAll()'s own navigator.vibrate(0) cleanup above, so it isn't immediately cancelled.
    const status = classifyCircuitStatus(next)
    haptic(hapticForCircuitStatus(status), { essential: true })
    playCircuitStatusSound(status)
  }
  const friendlyErrors = result?.errors.map((error) => error === 'no_battery' || error === 'empty' ? translate('noBattery') : error === 'short_circuit' ? translate('shortCircuit') : error === 'open_circuit' ? translate('openCircuit') : translate('otherError'))
  function clearCircuit() {
    saveNetlist(initialNetlist)
    setSelectedId(null); setEditOpen(false); setPlacing(null); setFirstPoint(null); setNotice(translate('circuitCleared'))
  }

  function undoLast() {
    const previous = undoStack[undoStack.length - 1]
    if (!previous) return
    haptic('undo')
    setNetlist(previous); setUndoStack((history) => history.slice(0, -1)); setSelectedId(null); setEditOpen(false); setResult(null); stopSonify(); setNotice(translate('hintStart'))
  }

  return <main className="builder">
    <header className="builder-top"><Link to="/" className="back-link" aria-label={translate('backHome')}>←</Link><div><p className="eyebrow">PAHUNCH · {translate('circuitLab')}</p><h1>{translate('buildTitle')}</h1></div></header>
    {loadedNetlist && <p className="loaded-note" role="status">{translate('loadedDrawing')}</p>}
    <div className="builder-card"><svg className={`circuit-svg${placing === 'wire' ? ' wire-active' : ''}`} viewBox="0 0 360 360" role="img" aria-label={translate('gridLabel')} onPointerDown={startWireDrag} onPointerMove={moveWireDrag} onPointerUp={finishWireDrag} onPointerCancel={finishWireDrag} onClick={handleGridClick}>
      {Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => <g key={`dot-${row}-${col}`} className="grid-cell" role="button" tabIndex={0} aria-label={`${translate('tapDot')} ${row + 1}, ${col + 1}`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') tapDot(row, col) }}><rect x={xAt({ row, col }) - 30} y={yAt({ row, col }) - 30} width="60" height="60" fill="transparent" /><circle cx={xAt({ row, col })} cy={yAt({ row, col })} r={firstPoint?.row === row && firstPoint.col === col ? 7 : 5} className="grid-dot" /></g>))}
      {netlist.components.map((component) => <SymbolGraphic key={component.id} component={component} result={resultMap.get(component.id)} selected={component.id === selectedId} translate={translate} interactive={!placing} onPointerDown={(event) => beginPartDrag(component, event)} onClick={() => { if (suppressPartClickRef.current) { suppressPartClickRef.current = false; return } setSelectedId(component.id); setPlacing(null); setEditOpen(true) }} />)}
      {movePreview && <SymbolGraphic component={movePreview.component} selected={false} translate={translate} interactive={false} ghost={movePreview.valid ? 'valid' : 'invalid'} onClick={() => undefined} />}
      {wirePreview && <line x1={xAt(wirePreview.from)} y1={yAt(wirePreview.from)} x2={wirePreview.to.x} y2={wirePreview.to.y} className="wire-preview" />}
    </svg></div>
    <p className="builder-hint" aria-live="polite">{notice}</p>
    <section className="tray" aria-label={translate('trayLabel')}>{parts.map((part) => <button key={part.type} aria-pressed={placing === part.type} onClick={() => choosePart(part.type)}><span aria-hidden="true">{part.icon}</span>{translate(part.key)}</button>)}</section>
    <div className="action-row">
      <button className="action-button primary" onClick={runCircuit}>▶ {translate('run')}</button>
      <button className="action-button" onClick={() => navigate('/learn', { state: { netlist, mode: 'predict' } })}>{translate('predict')}</button>
      <button className="action-button" onClick={undoLast} disabled={undoStack.length === 0}>{translate('undo')}</button>
      <button className="action-button" onClick={clearCircuit}>{translate('clear')}</button>
    </div>
    {editOpen && selected && <div className="edit-overlay" onClick={() => setEditOpen(false)}><section className="edit-dialog" role="dialog" aria-modal="true" aria-label={translate('selectedComponent')} onClick={(event) => event.stopPropagation()}>
      <strong>{selected.type === 'battery' ? translate('howManyVolts') : selected.type === 'resistor' || selected.type === 'bulb' ? translate('howManyOhms') : translate(selected.type)}</strong>
      {selected.type === 'battery' && <div className="preset-row">{[1.5, 3, 4.5, 6, 9].map((value) => <button key={value} aria-pressed={(selected.value ?? 3) === value} onClick={() => updateSelected({ value })}>{formatValue(value)} V</button>)}</div>}
      {selected.type === 'resistor' && <div className="preset-row">{[5, 10, 20, 50, 100].map((value) => <button key={value} aria-pressed={(selected.value ?? 10) === value} onClick={() => updateSelected({ value })}>{value} Ω</button>)}</div>}
      {selected.type === 'bulb' && <div className="preset-row">{[5, 10, 20].map((value) => <button key={value} aria-pressed={(selected.value ?? 10) === value} onClick={() => updateSelected({ value })}>{value} Ω</button>)}</div>}
      {selected.type === 'switch' && <div className="preset-row"><button aria-pressed={selected.closed !== false} onClick={() => updateSelected({ closed: true })}>{translate('closed')}</button><button aria-pressed={selected.closed === false} onClick={() => updateSelected({ closed: false })}>{translate('open')}</button></div>}
      <div className="edit-actions"><button onClick={() => { haptic('delete'); saveNetlist({ ...netlist, components: netlist.components.filter((component) => component.id !== selected.id) }); setSelectedId(null); setEditOpen(false) }}>{translate('delete')}</button><button className="edit-done" onClick={() => setEditOpen(false)}>{translate('done')}</button></div>
      {resultMap.has(selected.id) && <span className="selected-readout">{translate('voltage')}: {resultMap.get(selected.id)!.voltage.toFixed(2)} V · {translate('current')}: {resultMap.get(selected.id)!.current.toFixed(3)} A · {translate('power')}: {resultMap.get(selected.id)!.power.toFixed(3)} W</span>}
    </section></div>}
    {result && <section className="result-panel" aria-live="polite" aria-label={translate('runResults')}>
      {friendlyErrors?.length ? <div className="result-banner">{friendlyErrors.join(' ')}</div> : !result.ok ? <div className="result-banner">{translate('fallbackError')}</div> : null}
      {result.warnings.length > 0 && <p>{translate('warnings')}</p>}
      {netlist.components.map((component) => { const item = resultMap.get(component.id); return item ? <p key={item.id}><strong>{translate(component.type)}</strong> · {item.voltage.toFixed(2)} V · {item.current.toFixed(3)} A · {item.power.toFixed(3)} W · {translate(item.state)}</p> : null })}
    </section>}
  </main>
}
