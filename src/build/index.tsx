import { useMemo, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { CircuitComponent, ComponentResult, ComponentType, GridPoint, Netlist, SolveResult } from '../contracts/netlist'
import { solve } from '../physics'
import { stopSonify, sonify } from '../audio'
import { useLanguage, useT } from '../app/lang'
import { tWith, type TranslationKey } from '../app/i18n'

const parts: { type: ComponentType; key: TranslationKey; icon: string }[] = [
  { type: 'battery', key: 'battery', icon: '▤' }, { type: 'bulb', key: 'bulb', icon: '◉' },
  { type: 'resistor', key: 'resistor', icon: '⌁' }, { type: 'switch', key: 'switch', icon: '⌑' }, { type: 'wire', key: 'wire', icon: '—' },
]
const initialNetlist: Netlist = { gridSize: 5, components: [], source: 'build' }
const xAt = (point: GridPoint) => 34 + point.col * 73
const yAt = (point: GridPoint) => 34 + point.row * 73
const isVertical = (component: CircuitComponent) => component.from.col === component.to.col
const labelFor = (component: CircuitComponent, translate: (key: TranslationKey) => string) => component.type === 'battery' ? `${component.value ?? 3} V` : component.type === 'resistor' ? `${component.value ?? 10} Ω` : component.type === 'switch' ? (component.closed === false ? translate('open') : translate('closed')) : translate(component.type)

function SymbolGraphic({ component, result, selected, onClick, translate, interactive }: { component: CircuitComponent; result?: ComponentResult; selected: boolean; onClick: () => void; translate: (key: TranslationKey) => string; interactive: boolean }) {
  const x1 = xAt(component.from), y1 = yAt(component.from), x2 = xAt(component.to), y2 = yAt(component.to)
  const vertical = isVertical(component)
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
  const length = Math.hypot(x2 - x1, y2 - y1)
  const radius = Math.max(13, Math.min(20, length * .23))
  const glow = component.type === 'bulb' ? `bulb-${result?.state ?? 'off'}` : ''
  const current = Math.abs(result?.current ?? 0)
  const duration = Math.max(.22, Math.min(1.8, 1.8 / (1 + current)))
  return <g className={`${selected ? 'selected-part' : ''} ${glow}`} onClick={(event) => { event.stopPropagation(); if (interactive) onClick() }} pointerEvents={interactive ? 'auto' : 'none'} role="button" tabIndex={interactive ? 0 : -1} aria-label={`${translate(component.type)}, ${labelFor(component, translate)}`}>
    <line x1={x1} y1={y1} x2={x2} y2={y2} className="part-line" />
    {result && current > 0 && <line x1={x1} y1={y1} x2={x2} y2={y2} className="flow-line" style={{ '--flow-duration': `${duration}s` } as CSSProperties} />}
    <g transform={`translate(${cx} ${cy}) rotate(${vertical ? 90 : 0})`}>
      {component.type === 'battery' && <><rect x={-radius - 8} y={-radius} width={(radius + 8) * 2} height={radius * 2} rx="5" className="part-symbol" /><line x1="-5" y1={-radius + 4} x2="-5" y2={radius - 4} stroke="#18345f" strokeWidth="3" /><line x1="5" y1={-radius * .62} x2="5" y2={radius * .62} stroke="#18345f" strokeWidth="3" /><text x="0" y={radius + 13} className="part-text">{component.value ?? 3}V</text></>}
      {component.type === 'bulb' && <><circle r={radius} className="part-symbol" fill={result?.state && result.state !== 'off' ? '#ffd86b' : '#fff'} /><path d={`M ${-radius * .48} ${-radius * .35} Q 0 ${radius * .55} ${radius * .48} ${-radius * .35} M ${-radius * .28} ${radius * .64} H ${radius * .28}`} fill="none" stroke="#18345f" strokeWidth="2.6" /></>}
      {component.type === 'resistor' && <><rect x={-radius - 8} y={-radius * .58} width={(radius + 8) * 2} height={radius * 1.16} rx="4" className="part-symbol" /><polyline points={`${-radius},0 ${-radius * .65},${-radius * .38} ${-radius * .3},${radius * .38} 0,${-radius * .38} ${radius * .3},${radius * .38} ${radius * .65},${-radius * .38} ${radius},0`} fill="none" stroke="#18345f" strokeWidth="2" /><text x="0" y={radius + 14} className="part-text">{component.value ?? 10}Ω</text></>}
      {component.type === 'switch' && <><rect x={-radius - 8} y={-radius * .58} width={(radius + 8) * 2} height={radius * 1.16} rx="4" className="part-symbol" /><circle cx={-radius * .68} cy="0" r="3.5" fill="#18345f" /><circle cx={radius * .68} cy="0" r="3.5" fill="#18345f" /><line x1={-radius * .62} y1="0" x2={component.closed === false ? radius * .35 : radius * .62} y2={component.closed === false ? -radius * .52 : 0} stroke="#18345f" strokeWidth="2.5" /><text x="0" y={radius + 14} className="part-text">{component.closed === false ? translate('open') : translate('closed')}</text></>}
      {component.type === 'wire' && <><circle r="7" className="part-symbol" /><text x="0" y="1" className="part-text">·</text></>}
    </g>
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
  const [result, setResult] = useState<SolveResult | null>(null)
  const [notice, setNotice] = useState(() => translate('hintStart'))
  const selected = netlist.components.find((item) => item.id === selectedId)
  const resultMap = useMemo(() => new Map((result?.components ?? []).map((item) => [item.id, item])), [result])

  function saveNetlist(next: Netlist) {
    setUndoStack((history) => [...history, netlist].slice(-30))
    setNetlist(next)
    setResult(null)
    stopSonify()
  }

  function choosePart(type: ComponentType) { setPlacing(type); setFirstPoint(null); setSelectedId(null); setNotice(translate('hintChoose')) }
  function addComponent(from: GridPoint, to: GridPoint) {
    if (from.row === to.row && from.col === to.col) { setNotice(translate('hintTwoDots')); setFirstPoint(null); return }
    if (from.row !== to.row && from.col !== to.col) { setNotice(translate('hintSameLine')); setFirstPoint(null); return }
    const type = placing
    if (!type) return
    const newComponent: CircuitComponent = { id: `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, from, to, ...(type === 'battery' ? { value: 3 } : {}), ...(type === 'resistor' ? { value: 10 } : {}), ...(type === 'switch' ? { closed: true } : {}) }
    saveNetlist({ ...netlist, source: 'build', components: [...netlist.components, newComponent] })
    setPlacing(null); setFirstPoint(null); setSelectedId(newComponent.id); setNotice(tWith('partAdded', lang, { part: translate(type) }))
  }
  function tapDot(row: number, col: number) {
    if (!placing) { setNotice(translate('hintSelectPart')); return }
    const point = { row, col }
    if (!firstPoint) { setFirstPoint(point); return }
    addComponent(firstPoint, point)
  }
  function updateSelected(changes: Partial<CircuitComponent>) {
    if (!selectedId) return
    saveNetlist({ ...netlist, components: netlist.components.map((component) => component.id === selectedId ? { ...component, ...changes } : component) })
  }
  function runCircuit() {
    const next = solve(netlist)
    setResult(next); setSelectedId(null)
    if (next.ok) { sonify(next); setNotice(translate('resultsUpdated')) } else { stopSonify(); setNotice(translate('checkCircuit')) }
  }
  const friendlyErrors = result?.errors.map((error) => error === 'no_battery' || error === 'empty' ? translate('noBattery') : error === 'short_circuit' ? translate('shortCircuit') : error === 'open_circuit' ? translate('openCircuit') : translate('otherError'))
  function clearCircuit() {
    saveNetlist(initialNetlist)
    setSelectedId(null); setPlacing(null); setFirstPoint(null); setNotice(translate('circuitCleared'))
  }

  function undoLast() {
    const previous = undoStack[undoStack.length - 1]
    if (!previous) return
    setNetlist(previous); setUndoStack((history) => history.slice(0, -1)); setSelectedId(null); setResult(null); stopSonify(); setNotice(translate('hintStart'))
  }

  return <main className="builder">
    <header className="builder-top"><Link to="/" className="back-link" aria-label={translate('backHome')}>←</Link><div><p className="eyebrow">PAHUNCH · {translate('circuitLab')}</p><h1>{translate('buildTitle')}</h1></div></header>
    {loadedNetlist && <p className="loaded-note" role="status">{translate('loadedDrawing')}</p>}
    <div className="builder-card"><svg className="circuit-svg" viewBox="0 0 360 360" role="img" aria-label={translate('gridLabel')}>
      {Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => <g key={`dot-${row}-${col}`} className="grid-cell" onClick={() => tapDot(row, col)} role="button" tabIndex={0} aria-label={`${translate('tapDot')} ${row + 1}, ${col + 1}`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') tapDot(row, col) }}><rect x={xAt({ row, col }) - 30} y={yAt({ row, col }) - 30} width="60" height="60" fill="transparent" /><circle cx={xAt({ row, col })} cy={yAt({ row, col })} r={firstPoint?.row === row && firstPoint.col === col ? 7 : 5} className="grid-dot" /></g>))}
      {netlist.components.map((component) => <SymbolGraphic key={component.id} component={component} result={resultMap.get(component.id)} selected={component.id === selectedId} translate={translate} interactive={!placing} onClick={() => { setSelectedId(component.id); setPlacing(null) }} />)}
    </svg></div>
    <p className="builder-hint" aria-live="polite">{notice}</p>
    <section className="tray" aria-label={translate('trayLabel')}>{parts.map((part) => <button key={part.type} aria-pressed={placing === part.type} onClick={() => choosePart(part.type)}><span aria-hidden="true">{part.icon}</span>{translate(part.key)}</button>)}</section>
    <div className="action-row">
      <button className="action-button primary" onClick={runCircuit}>▶ {translate('run')}</button>
      <button className="action-button" onClick={() => navigate('/learn', { state: { netlist, mode: 'predict' } })}>{translate('predict')}</button>
      <button className="action-button" onClick={undoLast} disabled={undoStack.length === 0}>{translate('undo')}</button>
      <button className="action-button" onClick={clearCircuit}>{translate('clear')}</button>
    </div>
    {selected && <section className="selection-panel" aria-label={translate('selectedComponent')}><strong>{translate(selected.type)}</strong>
      {(selected.type === 'battery' || selected.type === 'resistor') && <select aria-label={translate('componentValue')} value={selected.value} onChange={(event) => updateSelected({ value: Number(event.target.value) })}>{(selected.type === 'battery' ? [1.5, 3, 6] : [5, 10, 20]).map((value) => <option key={value} value={value}>{value} {selected.type === 'battery' ? 'V' : 'Ω'}</option>)}</select>}
      {selected.type === 'switch' && <button onClick={() => updateSelected({ closed: selected.closed === false })}>{selected.closed === false ? translate('closeSwitch') : translate('openSwitch')}</button>}
      <button onClick={() => { saveNetlist({ ...netlist, components: netlist.components.filter((component) => component.id !== selected.id) }); setSelectedId(null) }}>{translate('delete')}</button>
      {resultMap.has(selected.id) && <span className="selected-readout">{translate('voltage')}: {resultMap.get(selected.id)!.voltage.toFixed(2)} V · {translate('current')}: {resultMap.get(selected.id)!.current.toFixed(3)} A · {translate('power')}: {resultMap.get(selected.id)!.power.toFixed(3)} W</span>}
    </section>}
    {result && <section className="result-panel" aria-live="polite" aria-label={translate('runResults')}>
      {friendlyErrors?.length ? <div className="result-banner">{friendlyErrors.join(' ')}</div> : !result.ok ? <div className="result-banner">{translate('fallbackError')}</div> : null}
      {result.warnings.length > 0 && <p>{translate('warnings')}</p>}
      {netlist.components.map((component) => { const item = resultMap.get(component.id); return item ? <p key={item.id}><strong>{translate(component.type)}</strong> · {item.voltage.toFixed(2)} V · {item.current.toFixed(3)} A · {item.power.toFixed(3)} W · {translate(item.state)}</p> : null })}
    </section>}
  </main>
}
