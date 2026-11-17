import { useMemo, useState, type CSSProperties } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { CircuitComponent, ComponentResult, ComponentType, GridPoint, Netlist, SolveResult } from '../contracts/netlist'
import { solve } from '../physics'
import { stopSonify, sonify } from '../audio'

const parts: { type: ComponentType; title: string; icon: string }[] = [
  { type: 'battery', title: 'Battery', icon: '▤' }, { type: 'bulb', title: 'Bulb', icon: '◉' },
  { type: 'resistor', title: 'Resistor', icon: '⌁' }, { type: 'switch', title: 'Switch', icon: '⌑' }, { type: 'wire', title: 'Wire', icon: '—' },
]
const initialNetlist: Netlist = { gridSize: 5, components: [], source: 'build' }
const xAt = (point: GridPoint) => 34 + point.col * 73
const yAt = (point: GridPoint) => 34 + point.row * 73
const isVertical = (component: CircuitComponent) => component.from.col === component.to.col
const labelFor = (component: CircuitComponent) => component.type === 'battery' ? `${component.value ?? 3} V` : component.type === 'resistor' ? `${component.value ?? 10} Ω` : component.type === 'switch' ? (component.closed === false ? 'Open' : 'Closed') : component.type

function SymbolGraphic({ component, result, selected, onClick }: { component: CircuitComponent; result?: ComponentResult; selected: boolean; onClick: () => void }) {
  const x1 = xAt(component.from), y1 = yAt(component.from), x2 = xAt(component.to), y2 = yAt(component.to)
  const vertical = isVertical(component)
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
  const length = Math.hypot(x2 - x1, y2 - y1)
  const radius = Math.max(13, Math.min(20, length * .23))
  const glow = component.type === 'bulb' ? `bulb-${result?.state ?? 'off'}` : ''
  const current = Math.abs(result?.current ?? 0)
  const duration = Math.max(.22, Math.min(1.8, 1.8 / (1 + current)))
  return <g className={`${selected ? 'selected-part' : ''} ${glow}`} onClick={(event) => { event.stopPropagation(); onClick() }} role="button" tabIndex={0} aria-label={`${component.type}, ${labelFor(component)}`}>
    <line x1={x1} y1={y1} x2={x2} y2={y2} className="part-line" />
    {result && current > 0 && <line x1={x1} y1={y1} x2={x2} y2={y2} className="flow-line" style={{ '--flow-duration': `${duration}s` } as CSSProperties} />}
    <g transform={`translate(${cx} ${cy}) rotate(${vertical ? 90 : 0})`}>
      {component.type === 'battery' && <><rect x={-radius - 8} y={-radius} width={(radius + 8) * 2} height={radius * 2} rx="5" className="part-symbol" /><line x1="-5" y1={-radius + 4} x2="-5" y2={radius - 4} stroke="#18345f" strokeWidth="3" /><line x1="5" y1={-radius * .62} x2="5" y2={radius * .62} stroke="#18345f" strokeWidth="3" /><text x="0" y={radius + 13} className="part-text">{component.value ?? 3}V</text></>}
      {component.type === 'bulb' && <><circle r={radius} className="part-symbol" fill={result?.state && result.state !== 'off' ? '#ffd86b' : '#fff'} /><path d={`M ${-radius * .48} ${-radius * .35} Q 0 ${radius * .55} ${radius * .48} ${-radius * .35} M ${-radius * .28} ${radius * .64} H ${radius * .28}`} fill="none" stroke="#18345f" strokeWidth="2.6" /></>}
      {component.type === 'resistor' && <><rect x={-radius - 8} y={-radius * .58} width={(radius + 8) * 2} height={radius * 1.16} rx="4" className="part-symbol" /><polyline points={`${-radius},0 ${-radius * .65},${-radius * .38} ${-radius * .3},${radius * .38} 0,${-radius * .38} ${radius * .3},${radius * .38} ${radius * .65},${-radius * .38} ${radius},0`} fill="none" stroke="#18345f" strokeWidth="2" /><text x="0" y={radius + 14} className="part-text">{component.value ?? 10}Ω</text></>}
      {component.type === 'switch' && <><rect x={-radius - 8} y={-radius * .58} width={(radius + 8) * 2} height={radius * 1.16} rx="4" className="part-symbol" /><circle cx={-radius * .68} cy="0" r="3.5" fill="#18345f" /><circle cx={radius * .68} cy="0" r="3.5" fill="#18345f" /><line x1={-radius * .62} y1="0" x2={component.closed === false ? radius * .35 : radius * .62} y2={component.closed === false ? -radius * .52 : 0} stroke="#18345f" strokeWidth="2.5" /><text x="0" y={radius + 14} className="part-text">{component.closed === false ? 'OPEN' : 'CLOSED'}</text></>}
      {component.type === 'wire' && <><circle r="7" className="part-symbol" /><text x="0" y="1" className="part-text">·</text></>}
    </g>
    <rect x={Math.min(x1, x2) - 14} y={Math.min(y1, y2) - 14} width={Math.abs(x2 - x1) + 28} height={Math.abs(y2 - y1) + 28} fill="transparent" />
  </g>
}

export default function BuildScreen() {
  const location = useLocation()
  const routeNetlist = (location.state as { netlist?: Netlist } | null)?.netlist
  const [netlist, setNetlist] = useState<Netlist>(() => routeNetlist?.gridSize === 5 ? { ...routeNetlist, source: 'build' } : initialNetlist)
  const [placing, setPlacing] = useState<ComponentType | null>(null)
  const [firstPoint, setFirstPoint] = useState<GridPoint | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [result, setResult] = useState<SolveResult | null>(null)
  const [notice, setNotice] = useState('Tap a part, then choose two dots in a straight line.')
  const selected = netlist.components.find((item) => item.id === selectedId)
  const resultMap = useMemo(() => new Map((result?.components ?? []).map((item) => [item.id, item])), [result])

  function choosePart(type: ComponentType) { setPlacing(type); setFirstPoint(null); setSelectedId(null); setNotice('Choose the first dot, then a second dot in a straight line.') }
  function addComponent(from: GridPoint, to: GridPoint) {
    if (from.row === to.row && from.col === to.col) { setNotice('Choose two different dots.'); setFirstPoint(null); return }
    if (from.row !== to.row && from.col !== to.col) { setNotice('Choose dots in the same row or column.'); setFirstPoint(null); return }
    const type = placing
    if (!type) return
    const newComponent: CircuitComponent = { id: `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, from, to, ...(type === 'battery' ? { value: 3 } : {}), ...(type === 'resistor' ? { value: 10 } : {}), ...(type === 'switch' ? { closed: true } : {}) }
    setNetlist((current) => ({ ...current, source: 'build', components: [...current.components, newComponent] }))
    setPlacing(null); setFirstPoint(null); setSelectedId(newComponent.id); setResult(null); stopSonify(); setNotice(`${parts.find((item) => item.type === type)?.title} added.`)
  }
  function tapDot(row: number, col: number) {
    if (!placing) { setNotice('Select a part from the tray first.'); return }
    const point = { row, col }
    if (!firstPoint) { setFirstPoint(point); return }
    addComponent(firstPoint, point)
  }
  function updateSelected(changes: Partial<CircuitComponent>) {
    if (!selectedId) return
    setNetlist((current) => ({ ...current, components: current.components.map((component) => component.id === selectedId ? { ...component, ...changes } : component) }))
    setResult(null); stopSonify()
  }
  function runCircuit() {
    const next = solve(netlist)
    setResult(next); setSelectedId(null)
    if (next.ok) { sonify(next); setNotice('Circuit results updated.') } else { stopSonify(); setNotice('Check the circuit and try again.') }
  }
  const friendlyErrors = result?.errors.map((error) => /short/i.test(error) ? 'There may be a short circuit. Check the battery connections.' : /open/i.test(error) ? 'The circuit is open. Close the switch or complete the path.' : error)

  return <main className="builder">
    <header className="builder-top"><Link to="/" className="back-link" aria-label="Back home">←</Link><div><p className="eyebrow">PAHUNCH · CIRCUIT LAB</p><h1>Build a circuit</h1></div></header>
    <div className="builder-card"><svg className="circuit-svg" viewBox="0 0 360 360" role="img" aria-label="Five by five circuit building grid">
      {Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => <circle key={`dot-${row}-${col}`} cx={xAt({ row, col })} cy={yAt({ row, col })} r={firstPoint?.row === row && firstPoint.col === col ? 7 : 5} className="grid-dot" onClick={() => tapDot(row, col)} />))}
      {netlist.components.map((component) => <SymbolGraphic key={component.id} component={component} result={resultMap.get(component.id)} selected={component.id === selectedId} onClick={() => { setSelectedId(component.id); setPlacing(null) }} />)}
    </svg></div>
    <p className="builder-hint" aria-live="polite">{notice}</p>
    <section className="tray" aria-label="Component tray">{parts.map((part) => <button key={part.type} aria-pressed={placing === part.type} onClick={() => choosePart(part.type)}><span aria-hidden="true">{part.icon}</span>{part.title}</button>)}</section>
    <div className="action-row"><button className="action-button primary" onClick={runCircuit}>▶ Run circuit</button><button className="action-button" onClick={() => { setNetlist(initialNetlist); setResult(null); setSelectedId(null); setPlacing(null); stopSonify(); setNotice('Circuit cleared. Select a part from the tray.') }}>Clear</button></div>
    {selected && <section className="selection-panel" aria-label="Selected component"><strong>{selected.type[0].toUpperCase() + selected.type.slice(1)}</strong>
      {(selected.type === 'battery' || selected.type === 'resistor') && <select aria-label="Component value" value={selected.value} onChange={(event) => updateSelected({ value: Number(event.target.value) })}>{(selected.type === 'battery' ? [1.5, 3, 6] : [5, 10, 20]).map((value) => <option key={value} value={value}>{value} {selected.type === 'battery' ? 'V' : 'Ω'}</option>)}</select>}
      {selected.type === 'switch' && <button onClick={() => updateSelected({ closed: selected.closed === false })}>{selected.closed === false ? 'Close switch' : 'Open switch'}</button>}
      <button onClick={() => { setNetlist((current) => ({ ...current, components: current.components.filter((component) => component.id !== selected.id) })); setSelectedId(null); setResult(null); stopSonify() }}>Delete</button>
      {resultMap.has(selected.id) && <span className="selected-readout">{resultMap.get(selected.id)!.voltage.toFixed(2)} V · {resultMap.get(selected.id)!.current.toFixed(3)} A · {resultMap.get(selected.id)!.power.toFixed(3)} W</span>}
    </section>}
    {result && <section className="result-panel" aria-live="polite">
      {friendlyErrors?.length ? <div className="result-banner">{friendlyErrors.join(' ')}</div> : !result.ok ? <div className="result-banner">The circuit needs another look.</div> : null}
      {result.warnings.length > 0 && <p>{result.warnings.join(' ')}</p>}
      {netlist.components.map((component) => { const item = resultMap.get(component.id); return item ? <p key={item.id}><strong>{component.type}</strong> · {item.voltage.toFixed(2)} V · {item.current.toFixed(3)} A · {item.power.toFixed(3)} W · {item.state}</p> : null })}
    </section>}
  </main>
}
