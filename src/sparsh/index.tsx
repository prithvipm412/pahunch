import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { CircuitComponent, GridPoint } from '../contracts/netlist'
import { solve } from '../physics'
import { playClip, sonify, stopAll, stopSonify, vibrate } from '../audio'
import { useLanguage } from '../app/lang'
import { fallbackFor } from './clips'
import { classifySwipe, isPairedTap, pointFromClient } from './gestures'
import { createInitialState, sparshReducer, type SparshEffect, type SparshEvent, type SparshState } from './machine'
import './sparsh.css'

const SWIPE_THRESHOLD = 26
const TAP_MOVE_THRESHOLD = 18
const DOUBLE_TAP_WINDOW_MS = 350
const DOUBLE_TAP_MAX_DIST = 44
const LONG_PRESS_MS = 600
const REST_MS = 500
const TWO_FINGER_SWIPE_THRESHOLD = 50
const TWO_FINGER_TAP_MAX_DURATION_MS = 500

interface GestureTracker {
  twoFinger: boolean
  twoFingerSwiped: boolean
  moved: boolean
  swipeDispatched: boolean
  longPressFired: boolean
  startX: number
  startY: number
  startTime: number
  lastTapTime: number
  lastTapX: number
  lastTapY: number
  lastTwoFingerTapTime: number
  lastTwoFingerTapX: number
  lastTwoFingerTapY: number
  longPressTimer: number | null
  restTimer: number | null
  pendingTwoFingerTapTimer: number | null
}

function createGestureTracker(): GestureTracker {
  return {
    twoFinger: false,
    twoFingerSwiped: false,
    moved: false,
    swipeDispatched: false,
    longPressFired: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    lastTapTime: 0,
    lastTapX: 0,
    lastTapY: 0,
    lastTwoFingerTapTime: 0,
    lastTwoFingerTapX: 0,
    lastTwoFingerTapY: 0,
    longPressTimer: null,
    restTimer: null,
    pendingTwoFingerTapTimer: null,
  }
}

function pointsEqual(a: GridPoint, b: GridPoint): boolean {
  return a.row === b.row && a.col === b.col
}

export default function SparshScreen() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const [unlocked, setUnlocked] = useState(false)
  const [state, setState] = useState<SparshState>(() => createInitialState())
  const [caption, setCaption] = useState('')
  const stateRef = useRef(state)
  const gestureRef = useRef<GestureTracker>(createGestureTracker())
  const gridRef = useRef<HTMLDivElement | null>(null)

  const runEffects = useCallback(
    async (effects: SparshEffect[]) => {
      for (const effect of effects) {
        if (effect.type === 'speak') {
          setCaption(effect.clips.map(fallbackFor).join(' · '))
          for (const clip of effect.clips) {
            await playClip(lang, clip, fallbackFor(clip))
          }
        } else if (effect.type === 'vibrate') {
          vibrate(effect.pattern)
        } else if (effect.type === 'solve') {
          const result = solve(stateRef.current.netlist)
          dispatch({ type: 'SOLVE_RESULT', result })
        } else if (effect.type === 'sonifyStart') {
          sonify(effect.result)
        } else if (effect.type === 'sonifyStop') {
          stopSonify()
        } else if (effect.type === 'stopAll') {
          stopAll()
        } else if (effect.type === 'navigateHome') {
          navigate('/')
        }
      }
    },
    [lang, navigate],
  )

  const dispatch = useCallback(
    (event: SparshEvent) => {
      const { state: next, effects } = sparshReducer(stateRef.current, event)
      stateRef.current = next
      setState(next)
      void runEffects(effects)
    },
    [runEffects],
  )

  const clearLongPressTimer = () => {
    const g = gestureRef.current
    if (g.longPressTimer !== null) {
      window.clearTimeout(g.longPressTimer)
      g.longPressTimer = null
    }
  }

  const clearRestTimer = () => {
    const g = gestureRef.current
    if (g.restTimer !== null) {
      window.clearTimeout(g.restTimer)
      g.restTimer = null
    }
  }

  const scheduleRest = (point: GridPoint) => {
    clearRestTimer()
    gestureRef.current.restTimer = window.setTimeout(() => dispatch({ type: 'REST', point }), REST_MS)
  }

  const handleUnlock = () => {
    setUnlocked(true)
    dispatch({ type: 'INIT' })
  }

  const onTouchStart = (e: React.TouchEvent) => {
    const g = gestureRef.current
    clearLongPressTimer()

    if (e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      g.twoFinger = true
      g.twoFingerSwiped = false
      g.startX = (a.clientX + b.clientX) / 2
      g.startY = (a.clientY + b.clientY) / 2
      g.startTime = Date.now()
      return
    }

    g.twoFinger = false
    g.moved = false
    g.swipeDispatched = false
    g.longPressFired = false
    const t = e.touches[0]
    g.startX = t.clientX
    g.startY = t.clientY
    g.startTime = Date.now()
    g.longPressTimer = window.setTimeout(() => {
      if (!g.moved) {
        g.longPressFired = true
        dispatch({ type: 'LONG_PRESS' })
      }
    }, LONG_PRESS_MS)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gestureRef.current

    if (g.twoFinger) {
      if (e.touches.length < 2) return
      const [a, b] = [e.touches[0], e.touches[1]]
      const x = (a.clientX + b.clientX) / 2
      const dx = x - g.startX
      if (!g.twoFingerSwiped && dx < -TWO_FINGER_SWIPE_THRESHOLD) {
        g.twoFingerSwiped = true
        dispatch({ type: 'TWO_FINGER_SWIPE_LEFT' })
      }
      return
    }

    const t = e.touches[0]
    const dx = t.clientX - g.startX
    const dy = t.clientY - g.startY
    if (!g.moved && Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
      g.moved = true
      clearLongPressTimer()
    }

    if (stateRef.current.mode === 'explore') {
      const rect = gridRef.current?.getBoundingClientRect()
      if (rect) {
        const point = pointFromClient(t.clientX, t.clientY, rect, stateRef.current.netlist.gridSize)
        dispatch({ type: 'DRAG', point })
        scheduleRest(point)
      }
      return
    }

    if (!g.swipeDispatched) {
      const direction = classifySwipe(dx, dy, SWIPE_THRESHOLD)
      if (direction) {
        g.swipeDispatched = true
        dispatch({ type: 'SWIPE', direction })
      }
    }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const g = gestureRef.current
    clearLongPressTimer()

    if (g.twoFinger) {
      if (e.touches.length === 0) {
        if (!g.twoFingerSwiped && Date.now() - g.startTime < TWO_FINGER_TAP_MAX_DURATION_MS) {
          const now = Date.now()
          if (
            isPairedTap(
              now,
              g.lastTwoFingerTapTime,
              g.lastTwoFingerTapX,
              g.lastTwoFingerTapY,
              g.startX,
              g.startY,
              DOUBLE_TAP_WINDOW_MS,
              DOUBLE_TAP_MAX_DIST,
            )
          ) {
            clearPendingTwoFingerTapTimer()
            g.lastTwoFingerTapTime = 0
            dispatch({ type: 'TWO_FINGER_DOUBLE_TAP' })
          } else {
            // Defer the single tap until the window closes, in case a second tap pairs with it —
            // otherwise the double-tap would fire the single-tap action (run/explore-toggle) too.
            g.lastTwoFingerTapTime = now
            g.lastTwoFingerTapX = g.startX
            g.lastTwoFingerTapY = g.startY
            g.pendingTwoFingerTapTimer = window.setTimeout(() => {
              g.pendingTwoFingerTapTimer = null
              dispatch({ type: 'TWO_FINGER_TAP' })
            }, DOUBLE_TAP_WINDOW_MS)
          }
        }
        g.twoFinger = false
      }
      return
    }

    if (stateRef.current.mode === 'explore') {
      clearRestTimer()
      return
    }

    if (g.moved || g.swipeDispatched || g.longPressFired) return

    const now = Date.now()
    if (isPairedTap(now, g.lastTapTime, g.lastTapX, g.lastTapY, g.startX, g.startY, DOUBLE_TAP_WINDOW_MS, DOUBLE_TAP_MAX_DIST)) {
      g.lastTapTime = 0
      dispatch({ type: 'DOUBLE_TAP' })
    } else {
      g.lastTapTime = now
      g.lastTapX = g.startX
      g.lastTapY = g.startY
    }
  }

  const clearPendingTwoFingerTapTimer = () => {
    const g = gestureRef.current
    if (g.pendingTwoFingerTapTimer !== null) {
      window.clearTimeout(g.pendingTwoFingerTapTimer)
      g.pendingTwoFingerTapTimer = null
    }
  }

  const onTouchCancel = () => {
    clearLongPressTimer()
    clearRestTimer()
    clearPendingTwoFingerTapTimer()
    gestureRef.current.twoFinger = false
  }

  if (!unlocked) {
    return (
      <button type="button" className="sparsh-unlock-overlay" onClick={handleUnlock}>
        <span>Tap anywhere to start</span>
      </button>
    )
  }

  const gridSize = state.netlist.gridSize
  const cellSize = 400 / (gridSize - 1)
  const toXY = (p: GridPoint) => ({ x: p.col * cellSize, y: p.row * cellSize })
  const fingerPoint = state.mode === 'explore' ? state.explore?.point ?? null : null

  return (
    <div className="sparsh-screen">
      <div className="sparsh-topbar">
        <Link className="back-link" to="/" aria-label="Back home">
          ←
        </Link>
        <h1>Sparsh</h1>
        <span className="sparsh-mode-badge">{state.mode === 'explore' ? 'Explore' : 'Build'}</span>
      </div>

      <div
        className="sparsh-surface"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        <div className="sparsh-grid" ref={gridRef}>
          <svg viewBox="-20 -20 440 440" aria-hidden="true">
            {Array.from({ length: gridSize }, (_, row) =>
              Array.from({ length: gridSize - 1 }, (_, col) => {
                const a = toXY({ row, col })
                const b = toXY({ row, col: col + 1 })
                return <line key={`h-${row}-${col}`} className="sparsh-wire" x1={a.x} y1={a.y} x2={b.x} y2={b.y} opacity={0.15} />
              }),
            )}
            {Array.from({ length: gridSize }, (_, col) =>
              Array.from({ length: gridSize - 1 }, (_, row) => {
                const a = toXY({ row, col })
                const b = toXY({ row: row + 1, col })
                return <line key={`v-${col}-${row}`} className="sparsh-wire" x1={a.x} y1={a.y} x2={b.x} y2={b.y} opacity={0.15} />
              }),
            )}

            {state.netlist.components.map((component: CircuitComponent) => {
              const from = toXY(component.from)
              const to = toXY(component.to)
              const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
              const isActive = state.explore?.overComponentId === component.id
              const closedClass = component.type === 'switch' ? (component.closed ? 'is-closed' : '') : ''
              return (
                <g key={component.id}>
                  <line
                    className={`sparsh-part-line type-${component.type} ${closedClass} ${isActive ? 'is-active' : ''}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                  />
                  {component.type !== 'wire' && (
                    <>
                      <circle className="sparsh-part-badge" cx={mid.x} cy={mid.y} r={16} />
                      <text className="sparsh-part-label" x={mid.x} y={mid.y}>
                        {component.type[0].toUpperCase()}
                      </text>
                    </>
                  )}
                </g>
              )
            })}

            {Array.from({ length: gridSize }, (_, row) =>
              Array.from({ length: gridSize }, (_, col) => {
                const p = toXY({ row, col })
                const isCursor = state.mode === 'build' && pointsEqual(state.cursor, { row, col })
                const isFinger = fingerPoint !== null && pointsEqual(fingerPoint, { row, col })
                return (
                  <circle
                    key={`dot-${row}-${col}`}
                    className={`sparsh-dot ${isCursor ? 'is-cursor' : ''} ${isFinger ? 'is-finger' : ''}`}
                    cx={p.x}
                    cy={p.y}
                    r={isCursor || isFinger ? 11 : 6}
                  />
                )
              }),
            )}
          </svg>
        </div>
      </div>

      <div className="sparsh-caption" aria-live="polite">
        {caption}
      </div>
    </div>
  )
}
