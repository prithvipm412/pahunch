import { useEffect, useRef, useState } from 'react'
import './heroCircuit.css'

const PAD = 14
const SPARK_DELAY_MS = 400
const TRAVEL_MS = 2000

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

// Small "live circuit" that wraps the hero title: a wire runs from a battery (bottom-left) up
// and around to a bulb above the title's "a"; a spark travels the wire and lights the bulb.
// The title itself stays real, selectable HTML text — this only draws an absolutely positioned
// decorative overlay sized to it via ResizeObserver.
export default function HeroCircuit() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const aRef = useRef<HTMLSpanElement>(null)
  const sparkRef = useRef<SVGGElement>(null)
  const trailRef = useRef<SVGPathElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [aX, setAX] = useState(0)
  const [pathLength, setPathLength] = useState(0)
  const [sparkRunning, setSparkRunning] = useState(false)
  const [bulbLit, setBulbLit] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const measure = () => {
      const wrapRect = wrap.getBoundingClientRect()
      setBox({ w: wrapRect.width, h: wrapRect.height })
      if (aRef.current) {
        const aRect = aRef.current.getBoundingClientRect()
        setAX(aRect.left - wrapRect.left + aRect.width / 2)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => ro.disconnect()
  }, [])

  const left = PAD / 2
  const top = PAD / 2
  const right = Math.max(box.w - PAD / 2, left + 1)
  const bottom = Math.max(box.h - PAD / 2, top + 1)
  const bulbX = box.w > 0 ? Math.min(Math.max(aX, left + 12), right - 12) : 0
  const pathD = box.w > 0 && box.h > 0 ? `M ${left} ${bottom} L ${right} ${bottom} L ${right} ${top} L ${bulbX} ${top}` : ''

  useEffect(() => {
    if (trailRef.current && pathD) setPathLength(trailRef.current.getTotalLength())
  }, [pathD])

  useEffect(() => {
    if (sparkRef.current && pathD) sparkRef.current.style.setProperty('offset-path', `path("${pathD}")`)
  }, [pathD])

  useEffect(() => {
    if (!pathD) return
    if (reducedMotion) {
      setBulbLit(true)
      return
    }
    const startSpark = setTimeout(() => setSparkRunning(true), SPARK_DELAY_MS)
    const lightBulb = setTimeout(() => setBulbLit(true), SPARK_DELAY_MS + TRAVEL_MS)
    return () => {
      clearTimeout(startSpark)
      clearTimeout(lightBulb)
    }
  }, [pathD, reducedMotion])

  return (
    <div className="hero-circuit-wrap" ref={wrapRef}>
      <h1 className="hero-title">
        P<span ref={aRef}>a</span>hunch
      </h1>
      {box.w > 0 && (
        <svg
          className="hero-circuit-svg"
          aria-hidden="true"
          width={box.w}
          height={box.h}
          viewBox={`0 0 ${box.w} ${box.h}`}
        >
          <path
            className="hero-wire"
            d={pathD}
            fill="none"
            stroke="#f1e6cf"
            strokeOpacity="0.7"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {!reducedMotion && (
            <path
              ref={trailRef}
              className={sparkRunning ? 'hero-trail hero-trail-run' : 'hero-trail'}
              d={pathD}
              fill="none"
              stroke="#e2672e"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="36 2000"
              style={pathLength ? ({ '--path-length': `${pathLength}px` } as React.CSSProperties) : undefined}
            />
          )}
          <g transform={`translate(${left + 10} ${bottom})`}>
            <path d="M-9 0h7M2 0h7" stroke="#f1e6cf" strokeWidth="2" strokeLinecap="round" />
            <path d="M-2.5 -6v12M-6.5 -3v6" stroke="#e2672e" strokeWidth="1.8" strokeLinecap="round" />
          </g>
          <g transform={`translate(${bulbX} ${top - 9})`}>
            {bulbLit && (
              <circle className={reducedMotion ? 'hero-bulb-halo hero-bulb-halo-static' : 'hero-bulb-halo'} r="15" />
            )}
            <circle
              r="8.5"
              className="hero-bulb-glass"
              fill={bulbLit ? 'rgba(226, 103, 46, 0.22)' : 'none'}
              stroke="#f1e6cf"
              strokeWidth="1.8"
            />
            <path
              d="M-3 -3l6 6M-3 3l6 -6"
              stroke={bulbLit ? '#e2672e' : '#f1e6cf'}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path d="M-3 8.5h6M-2 11h4" stroke="#e6c79c" strokeWidth="1.5" strokeLinecap="round" />
          </g>
          {!reducedMotion && (
            <g ref={sparkRef} className={sparkRunning ? 'hero-spark hero-spark-run' : 'hero-spark'}>
              <path d="M-1.5 -6l-3.5 7h3l-2 5 6.5 -8.5h-3.2z" fill="#e2672e" stroke="#f1e6cf" strokeWidth="0.6" />
            </g>
          )}
        </svg>
      )}
    </div>
  )
}
