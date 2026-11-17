import { useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { CircuitComponent, ComponentResult, ComponentType, GridPoint, Netlist, SolveResult } from '../contracts/netlist'
import { solve } from '../physics'
import { playClip, sonify, stopAll, stopSonify } from '../audio'
import { haptic, hapticDurationMs, hapticForCircuitStatus, type HapticName } from '../audio/haptics'
import { alarm, classifyCircuitStatus, playCircuitStatusSound } from '../audio/feedbackSounds'
import { RUN_STARTING_TEXT } from '../audio/runSequence'
import { useLanguage, useT } from '../app/lang'
import { tWith, type TranslationKey } from '../app/i18n'
import './build.css'
import { removeSelectedBuildPart, selectBuildPart, undoBuildAction, type BuildEditorState } from './editorState'
import { middlePartSegment, resolveBuildTapTarget, type TapDot, type PartHitSegment } from './tapTarget'
import { createBuildComponent } from './componentFactory'
import { componentsOverlap, extendWireDragPath, wireSegmentsForDragPath } from './wirePath'

const PLACE_HAPTIC: Record<ComponentType, HapticName> = {
  wire: 'place_wire', battery: 'place_battery', bulb: 'place_bulb', resistor: 'place_resistor', switch: 'place_switch',
  ammeter: 'place_ammeter' as HapticName, voltmeter: 'place_voltmeter' as HapticName, fuse: 'place_fuse' as HapticName,
}

const parts: { type: ComponentType; key: TranslationKey; icon: string }[] = [
  { type: 'battery', key: 'battery', icon: '▤' }, { type: 'bulb', key: 'bulb', icon: '◉' },
  { type: 'resistor', key: 'resistor', icon: '⌁' }, { type: 'switch', key: 'switch', icon: '⌑' }, { type: 'wire', key: 'wire', icon: '—' },
  { type: 'ammeter', key: 'ammeter', icon: 'A' }, { type: 'voltmeter', key: 'voltmeter', icon: 'V' }, { type: 'fuse', key: 'fuse', icon: '▱' },
]
const initialNetlist: Netlist = { gridSize: 5, components: [], source: 'build' }
const xAt = (point: GridPoint) => 34 + point.col * 73
const yAt = (point: GridPoint) => 34 + point.row * 73
const isVertical = (component: CircuitComponent) => component.from.col === component.to.col
const labelFor = (component: CircuitComponent, translate: (key: TranslationKey) => string) => component.type === 'battery' ? `${component.value ?? 3} V` : component.type === 'resistor' ? `${component.value ?? 10} Ω` : component.type === 'fuse' ? `${component.value ?? .5} A` : component.type === 'switch' ? (component.closed === false ? translate('open') : translate('closed')) : translate(component.type)
const formatValue = (value: number) => String(value)
const componentValueLabel = (component: CircuitComponent) => component.type === 'battery' ? `${formatValue(component.value ?? 3)} V` : component.type === 'resistor' || component.type === 'bulb' ? `${formatValue(component.value ?? 10)} Ω` : component.type === 'fuse' ? `${formatValue(component.value ?? .5)} A` : null
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

function SymbolGraphic({ component, result, selected, onPointerDown, translate, interactive, ghost }: { component: CircuitComponent; result?: ComponentResult; selected: boolean; onPointerDown?: (event: ReactPointerEvent<SVGGElement>) => void; translate: (key: TranslationKey) => string; interactive: boolean; ghost?: 'valid' | 'invalid' }) {
  const x1 = xAt(component.from), y1 = yAt(component.from), x2 = xAt(component.to), y2 = yAt(component.to)
  const vertical = isVertical(component)
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
  const length = Math.hypot(x2 - x1, y2 - y1)
  const radius = Math.max(13, Math.min(20, length * .23))
  const glow = component.type === 'bulb' ? `bulb-${result?.state ?? 'off'}` : ''
  const current = Math.abs(result?.current ?? 0)
  const duration = Math.max(.22, Math.min(1.8, 1.8 / (1 + current)))
  const hit = middlePartSegment(component.id, { x: x1, y: y1 }, { x: x2, y: y2 })
  const fuseBlown = component.type === 'fuse' && result?.state === 'blown'
  const meterValue = component.type === 'ammeter' ? Math.abs(result?.current ?? 0) : component.type === 'voltmeter' ? Math.abs(result?.voltage ?? 0) : null
  const badgeX = vertical ? cx + (component.from.col === 4 ? -radius - 38 : radius + 38) : cx
  const badgeY = vertical ? cy : cy - radius - 23
  const brokenStart = vertical ? { x: cx, y: cy - 5 } : { x: cx - 5, y: cy }
  const brokenEnd = vertical ? { x: cx, y: cy + 5 } : { x: cx + 5, y: cy }
  return <g className={`${selected ? 'selected-part' : ''} ${glow} ${fuseBlown ? 'fuse-blown' : ''} ${ghost ? `move-ghost move-ghost-${ghost}` : ''}`} onPointerDown={onPointerDown} pointerEvents={interactive ? 'auto' : 'none'} role="button" tabIndex={interactive ? 0 : -1} aria-label={`${translate(component.type)}, ${labelFor(component, translate)}`}>
    {fuseBlown
      ? <><line x1={x1} y1={y1} x2={brokenStart.x} y2={brokenStart.y} className="part-line fuse-broken-line" /><line x1={brokenEnd.x} y1={brokenEnd.y} x2={x2} y2={y2} className="part-line fuse-broken-line" /></>
      : <line x1={x1} y1={y1} x2={x2} y2={y2} className="part-line" />}
    {result && current > 0 && <line x1={x1} y1={y1} x2={x2} y2={y2} className="flow-line" style={{ '--flow-duration': `${duration}s` } as CSSProperties} />}
    <g transform={`translate(${cx} ${cy}) rotate(${vertical ? 90 : 0})`}>
      {component.type === 'battery' && <><rect x={-radius - 8} y={-radius} width={(radius + 8) * 2} height={radius * 2} rx="5" className="part-symbol" /><line x1="-5" y1={-radius + 4} x2="-5" y2={radius - 4} stroke="#18345f" strokeWidth="3" /><line x1="5" y1={-radius * .62} x2="5" y2={radius * .62} stroke="#18345f" strokeWidth="3" /></>}
      {component.type === 'bulb' && <><circle r={radius * (result?.state === 'bright' ? 2.8 : result?.state === 'dim' ? 1.5 : 2.2)} className={`bulb-halo bulb-halo-${result?.state ?? 'off'}`} fill={`url(#bulbGlow-${result?.state ?? 'off'})`} /><circle r={radius} className="part-symbol bulb-core" /><path d={`M ${-radius * .48} ${-radius * .35} Q 0 ${radius * .55} ${radius * .48} ${-radius * .35} M ${-radius * .28} ${radius * .64} H ${radius * .28}`} fill="none" stroke="#18345f" strokeWidth="2.6" /></>}
      {component.type === 'resistor' && <><rect x={-radius - 8} y={-radius * .58} width={(radius + 8) * 2} height={radius * 1.16} rx="4" className="part-symbol" /><polyline points={`${-radius},0 ${-radius * .65},${-radius * .38} ${-radius * .3},${radius * .38} 0,${-radius * .38} ${radius * .3},${radius * .38} ${radius * .65},${-radius * .38} ${radius},0`} fill="none" stroke="#18345f" strokeWidth="2" /></>}
      {component.type === 'switch' && <><rect x={-radius - 8} y={-radius * .58} width={(radius + 8) * 2} height={radius * 1.16} rx="4" className="part-symbol" /><circle cx={-radius * .68} cy="0" r="3.5" fill="#18345f" /><circle cx={radius * .68} cy="0" r="3.5" fill="#18345f" /><line x1={-radius * .62} y1="0" x2={component.closed === false ? radius * .35 : radius * .62} y2={component.closed === false ? -radius * .52 : 0} stroke="#18345f" strokeWidth="2.5" /><text x="0" y={radius + 14} className="part-text">{component.closed === false ? translate('open') : translate('closed')}</text></>}
      {component.type === 'wire' && <><circle r="7" className="part-symbol" /><text x="0" y="1" className="part-text">·</text></>}
      {(component.type === 'ammeter' || component.type === 'voltmeter') && <><circle r={radius} className="part-symbol" /><text x="0" y="1" className="part-text meter-symbol-text">{component.type === 'ammeter' ? 'A' : 'V'}</text></>}
      {component.type === 'fuse' && <><rect x={-radius - 8} y={-radius * .58} width={(radius + 8) * 2} height={radius * 1.16} rx="3" className="part-symbol fuse-symbol" />{fuseBlown ? <><line x1={-radius} y1="0" x2="-4" y2="0" className="fuse-inner-line fuse-broken-line" /><line x1="4" y1="0" x2={radius} y2="0" className="fuse-inner-line fuse-broken-line" /></> : <line x1={-radius} y1="0" x2={radius} y2="0" className="fuse-inner-line" />}{fuseBlown && <text x="0" y={radius + 14} className="part-text fuse-label">{translate('blown')}</text>}</>}
    </g>
    {componentValueLabel(component) && <text x={cx + (vertical ? (component.from.col === 4 ? -radius - 16 : radius + 16) : 0)} y={cy + (vertical ? 4 : -radius - 8)} className="part-value-label">{componentValueLabel(component)}</text>}
    {meterValue !== null && result && <g className="meter-reading" transform={`translate(${badgeX} ${badgeY})`}><rect x="-32" y="-12" width="64" height="24" rx="12" /><text y="1">{meterValue.toFixed(2)} {component.type === 'ammeter' ? 'A' : 'V'}</text></g>}
    <line x1={hit.from.x} y1={hit.from.y} x2={hit.to.x} y2={hit.to.y} stroke="transparent" strokeWidth="20" strokeLinecap="butt" pointerEvents="stroke" className="part-hit-area" />
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
      setPlacing(null); setFirstPoint(null); setNotice(translate('hintStart'))
      return
    }
    setPlacing(type); setFirstPoint(null); setSelectedId(null)
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
    const newComponent = createBuildComponent(type, `build-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, from, to)
    if (type !== 'wire' && netlist.components.some((component) => componentsOverlap(newComponent, component))) {
      haptic('invalid'); setNotice(translate('hintOccupiedWire')); setFirstPoint(null); return
    }
    haptic(PLACE_HAPTIC[type])
    saveNetlist({ ...netlist, source: 'build', components: [...netlist.components, newComponent] })
    if (type !== 'wire') {
      setPlacing(null); setSelectedId(newComponent.id)
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
    event.stopPropagation()
    if (placing) return
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
    if (placing === 'wire' && suppressWireClickRef.current) {
      suppressWireClickRef.current = false
      return
    }
    const point = canvasPoint(event, event.currentTarget)
    const dots: TapDot[] = Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => ({ row, col, x: xAt({ row, col }), y: yAt({ row, col }) }))).flat()
    const segments: PartHitSegment[] = netlist.components.map((component) => middlePartSegment(component.id, { x: xAt(component.from), y: yAt(component.from) }, { x: xAt(component.to), y: yAt(component.to) }))
    const target = resolveBuildTapTarget(point, dots, segments, placing !== null)
    if (target.kind === 'dot') {
      setSelectedId(null)
      if (placing) tapDot(target.row, target.col)
      return
    }
    if (placing) return
    if (target.kind === 'part') {
      setSelectedId(selectBuildPart(editorState(), target.id).selectedId)
      return
    }
    setSelectedId(null)
  }

  function updateSelected(changes: Partial<CircuitComponent>) {
    if (!selectedId) return
    haptic('select')
    saveNetlist({ ...netlist, components: netlist.components.map((component) => component.id === selectedId ? { ...component, ...changes } : component) }, true)
  }
  function editorState(): BuildEditorState { return { netlist, undoStack, selectedId } }
  function removeSelected() {
    if (!selectedId || !netlist.components.some((component) => component.id === selectedId)) return
    const next = removeSelectedBuildPart(editorState())
    haptic('delete')
    setNetlist(next.netlist); setUndoStack(next.undoStack); setSelectedId(next.selectedId)
    setResult(null); stopSonify()
  }
  function friendlyErrorTextFor(solveResult: SolveResult): string {
    if (solveResult.errors.length === 0) return translate('fallbackError')
    return solveResult.errors
      .map((error) => error === 'no_battery' || error === 'empty' ? translate('noBattery') : error === 'short_circuit' ? translate('shortCircuit') : error === 'open_circuit' ? translate('openCircuit') : translate('otherError'))
      .join(' ')
  }
  // The fixed run sequence (src/audio/runSequence.ts), shared with Sparsh: announce the run,
  // then (once that ends) the status haptic+sound, then (once that pattern clears) the existing
  // result text, then always start sonify() — Build never had any of this before, including the
  // continuous sonify() tone.
  async function runCircuit() {
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
    await playClip(lang, 'run_starting', RUN_STARTING_TEXT[lang])
    const status = classifyCircuitStatus(next)
    const hasBlownFuse = next.components.some((component) => component.state === 'blown')
    const statusHaptic = hasBlownFuse ? 'circuit_broken' : hapticForCircuitStatus(status)
    if (hasBlownFuse) {
      haptic(statusHaptic, { essential: true })
      alarm()
    } else {
      haptic(statusHaptic, { essential: true })
      playCircuitStatusSound(status)
    }
    await new Promise<void>((resolveDelay) => { setTimeout(resolveDelay, Math.max(hapticDurationMs(statusHaptic), hasBlownFuse ? 850 : 0) + 60) })
    await playClip(lang, next.ok ? 'build_run_ok' : 'build_run_error', next.ok ? translate('resultsUpdated') : friendlyErrorTextFor(next))
    sonify(next)
  }
  const friendlyErrors = result?.errors.map((error) => error === 'no_battery' || error === 'empty' ? translate('noBattery') : error === 'short_circuit' ? translate('shortCircuit') : error === 'open_circuit' ? translate('openCircuit') : translate('otherError'))
  function clearCircuit() {
    saveNetlist(initialNetlist)
    setSelectedId(null); setPlacing(null); setFirstPoint(null); setNotice(translate('circuitCleared'))
  }

  function undoLast() {
    const next = undoBuildAction(editorState())
    if (next === editorState()) return
    haptic('undo')
    setNetlist(next.netlist); setUndoStack(next.undoStack); setSelectedId(next.selectedId); setResult(null); stopSonify(); setNotice(translate('hintStart'))
  }

  function replaceSelectedFuse() {
    if (selected?.type !== 'fuse' || resultMap.get(selected.id)?.state !== 'blown') return
    setResult(null)
    stopSonify()
    setNotice(translate('fuseReplaced'))
  }

  return <main className="builder">
    <header className="builder-top"><Link to="/" className="back-link" aria-label={translate('backHome')}>←</Link><div><p className="eyebrow">PAHUNCH · {translate('circuitLab')}</p><h1>{translate('buildTitle')}</h1></div></header>
    {loadedNetlist && <p className="loaded-note" role="status">{translate('loadedDrawing')}</p>}
    <div className="builder-card"><svg className={`circuit-svg${placing === 'wire' ? ' wire-active' : ''}`} viewBox="0 0 360 360" role="img" aria-label={translate('gridLabel')} onPointerDown={startWireDrag} onPointerMove={moveWireDrag} onPointerUp={finishWireDrag} onPointerCancel={finishWireDrag} onClick={handleGridClick}>
      <defs>{['off', 'dim', 'normal', 'bright', 'overload'].map((state) => <radialGradient key={state} id={`bulbGlow-${state}`}><stop offset="0" stopColor={state === 'overload' ? '#ff3030' : state === 'dim' ? '#ff9d2e' : '#ffd54a'} stopOpacity=".85" /><stop offset="1" stopColor={state === 'overload' ? '#ff3030' : state === 'dim' ? '#ff9d2e' : '#ffd54a'} stopOpacity="0" /></radialGradient>)}</defs>
      {Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => <g key={`dot-${row}-${col}`} className="grid-cell" role="button" tabIndex={0} aria-label={`${translate('tapDot')} ${row + 1}, ${col + 1}`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') tapDot(row, col) }} pointerEvents="none"><circle cx={xAt({ row, col })} cy={yAt({ row, col })} r={firstPoint?.row === row && firstPoint.col === col ? 7 : 5} className="grid-dot" /></g>))}
      {netlist.components.map((component) => <SymbolGraphic key={component.id} component={component} result={resultMap.get(component.id)} selected={component.id === selectedId} translate={translate} interactive={!placing} onPointerDown={(event) => beginPartDrag(component, event)} />)}
      {movePreview && <SymbolGraphic component={movePreview.component} selected={false} translate={translate} interactive={false} ghost={movePreview.valid ? 'valid' : 'invalid'} />}
      {wirePreview && <line x1={xAt(wirePreview.from)} y1={yAt(wirePreview.from)} x2={wirePreview.to.x} y2={wirePreview.to.y} className="wire-preview" />}
      {Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => <circle key={`dot-hit-${row}-${col}`} className="dot-hit-area" cx={xAt({ row, col })} cy={yAt({ row, col })} r="18" />))}
    </svg></div>
    <p className="builder-hint" aria-live="polite">{notice}</p>
    <section className="tray" aria-label={translate('trayLabel')}>{parts.map((part) => <button key={part.type} aria-pressed={placing === part.type} onClick={() => choosePart(part.type)}><span aria-hidden="true">{part.icon}</span>{translate(part.key)}</button>)}</section>
    <div className="action-row">
      <button className="action-button primary" onClick={runCircuit}>▶ {translate('run')}</button>
      <button className="action-button" onClick={() => navigate('/learn', { state: { netlist, mode: 'predict' } })}>{translate('predict')}</button>
      <button className="action-button" onClick={undoLast} disabled={undoStack.length === 0}>{translate('undo')}</button>
      <button className="action-button" onClick={clearCircuit}>{translate('clear')}</button>
    </div>
    {selected && <section className="selection-bar" role="region" aria-label={translate('selectedComponent')}>
      <div className="selection-heading"><strong>{translate(selected.type)}</strong><button className="remove-part" onClick={removeSelected}>{tWith('removePart', lang, { part: translate(selected.type).toLowerCase() })}</button></div>
      {selected.type === 'battery' && <div className="preset-row">{[1.5, 3, 4.5, 6, 9].map((value) => <button key={value} aria-pressed={(selected.value ?? 3) === value} onClick={() => updateSelected({ value })}>{formatValue(value)} V</button>)}</div>}
      {selected.type === 'resistor' && <div className="preset-row">{[5, 10, 20, 50, 100].map((value) => <button key={value} aria-pressed={(selected.value ?? 10) === value} onClick={() => updateSelected({ value })}>{value} Ω</button>)}</div>}
      {selected.type === 'bulb' && <div className="preset-row">{[5, 10, 20].map((value) => <button key={value} aria-pressed={(selected.value ?? 10) === value} onClick={() => updateSelected({ value })}>{value} Ω</button>)}</div>}
      {selected.type === 'fuse' && <div className="preset-row">{[.25, .5, 1, 2].map((value) => <button key={value} aria-pressed={(selected.value ?? .5) === value} onClick={() => updateSelected({ value })}>{value} A</button>)}</div>}
      {selected.type === 'switch' && <div className="preset-row"><button aria-pressed={selected.closed !== false} onClick={() => updateSelected({ closed: true })}>{translate('closed')}</button><button aria-pressed={selected.closed === false} onClick={() => updateSelected({ closed: false })}>{translate('open')}</button></div>}
      {selected.type === 'fuse' && resultMap.get(selected.id)?.state === 'blown' && <button className="replace-fuse" onClick={replaceSelectedFuse}>{translate('replaceFuse')}</button>}
      {resultMap.has(selected.id) && <span className="selected-readout">{translate('voltage')}: {resultMap.get(selected.id)!.voltage.toFixed(2)} V · {translate('current')}: {resultMap.get(selected.id)!.current.toFixed(3)} A · {translate('power')}: {resultMap.get(selected.id)!.power.toFixed(3)} W</span>}
    </section>}
    {result && <section className="result-panel" aria-live="polite" aria-label={translate('runResults')}>
      {friendlyErrors?.length ? <div className="result-banner">{friendlyErrors.join(' ')}</div> : !result.ok ? <div className="result-banner">{translate('fallbackError')}</div> : null}
      {result.warnings.length > 0 && <p>{translate('warnings')}</p>}
      {netlist.components.map((component) => { const item = resultMap.get(component.id); return item ? <p key={item.id}><strong>{translate(component.type)}</strong> · {item.voltage.toFixed(2)} V · {item.current.toFixed(3)} A · {item.power.toFixed(3)} W · {translate(item.state)}</p> : null })}
    </section>}
  </main>
}
