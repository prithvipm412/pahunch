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
const TWO_FINGER_SWIPE_THRESHOLD = 50
const TAP_MOVE_THRESHOLD = 18
const TAP_COUNT_WINDOW_MS = 350
const DOUBLE_TAP_WINDOW_MS = 350
const DOUBLE_TAP_MAX_DIST = 44
const HOLD_MS = 600
const REST_MS = 500
const TAP_MAX_DURATION_MS = 500

interface GestureTracker {
  fingerCount: number
  moved: boolean
  swipeDispatched: boolean
  holdFired: boolean
  startX: number
  startY: number
  startTime: number
  holdTimer: number | null
  tapFinalizeTimer: number | null
  restTimer: number | null
  lastTwoFingerTapTime: number
  lastTwoFingerTapX: number
  lastTwoFingerTapY: number
  pendingTwoFingerTapTimer: number | null
}

function createGestureTracker(): GestureTracker {
  return {
    fingerCount: 0,
    moved: false,
    swipeDispatched: false,
    holdFired: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    holdTimer: null,
    tapFinalizeTimer: null,
    restTimer: null,
    lastTwoFingerTapTime: 0,
    lastTwoFingerTapX: 0,
    lastTwoFingerTapY: 0,
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

  const clearHoldTimer = () => {
    const g = gestureRef.current
    if (g.holdTimer !== null) {
      window.clearTimeout(g.holdTimer)
      g.holdTimer = null
    }
  }

  const clearTapFinalizeTimer = () => {
    const g = gestureRef.current
    if (g.tapFinalizeTimer !== null) {
      window.clearTimeout(g.tapFinalizeTimer)
      g.tapFinalizeTimer = null
    }
  }

  const clearRestTimer = () => {
    const g = gestureRef.current
    if (g.restTimer !== null) {
      window.clearTimeout(g.restTimer)
      g.restTimer = null
    }
  }

  const clearPendingTwoFingerTapTimer = () => {
    const g = gestureRef.current
    if (g.pendingTwoFingerTapTimer !== null) {
      window.clearTimeout(g.pendingTwoFingerTapTimer)
      g.pendingTwoFingerTapTimer = null
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
    clearHoldTimer()

    g.fingerCount = e.touches.length
    g.moved = false
    g.swipeDispatched = false
    g.holdFired = false
    g.startTime = Date.now()

    if (g.fingerCount >= 3) return // resolved entirely on touchend

    if (g.fingerCount === 2) {
      // A different finger pattern abandons any one-finger tap count in progress.
      clearTapFinalizeTimer()
      dispatch({ type: 'TAP_RESET' })
      const [a, b] = [e.touches[0], e.touches[1]]
      g.startX = (a.clientX + b.clientX) / 2
      g.startY = (a.clientY + b.clientY) / 2
      g.holdTimer = window.setTimeout(() => {
        if (!g.moved) {
          g.holdFired = true
          dispatch({ type: 'TWO_FINGER_HOLD' })
        }
      }, HOLD_MS)
      return
    }

    // One finger. Pause (don't reset) the tap-finalize countdown while this press is being
    // evaluated — otherwise a legitimate "tap, then hold" would have its tap finalized out from
    // under it before the hold had a chance to fire.
    clearTapFinalizeTimer()
    const t = e.touches[0]
    g.startX = t.clientX
    g.startY = t.clientY
    g.holdTimer = window.setTimeout(() => {
      if (!g.moved) {
        g.holdFired = true
        dispatch({ type: 'HOLD' })
      }
    }, HOLD_MS)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gestureRef.current
    if (g.fingerCount >= 3) return

    if (g.fingerCount === 2) {
      if (e.touches.length < 2) return
      const [a, b] = [e.touches[0], e.touches[1]]
      const x = (a.clientX + b.clientX) / 2
      const y = (a.clientY + b.clientY) / 2
      const dx = x - g.startX
      const dy = y - g.startY
      if (!g.moved && Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
        g.moved = true
        clearHoldTimer()
      }
      if (!g.swipeDispatched) {
        const direction = classifySwipe(dx, dy, TWO_FINGER_SWIPE_THRESHOLD)
        if (direction === 'left') {
          g.swipeDispatched = true
          dispatch({ type: 'TWO_FINGER_SWIPE_LEFT' })
        } else if (direction === 'down') {
          g.swipeDispatched = true
          dispatch({ type: 'TWO_FINGER_SWIPE_DOWN' })
        } else if (direction === 'up') {
          g.swipeDispatched = true
          dispatch({ type: 'TWO_FINGER_SWIPE_UP' })
        }
        // 'right': no two-finger-swipe-right gesture is defined — ignore it.
      }
      return
    }

    // One finger.
    const t = e.touches[0]
    const dx = t.clientX - g.startX
    const dy = t.clientY - g.startY
    if (!g.moved && Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
      g.moved = true
      clearHoldTimer()
      clearTapFinalizeTimer()
      dispatch({ type: 'TAP_RESET' })
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
    clearHoldTimer()

    if (g.fingerCount >= 3) {
      if (e.touches.length === 0 && !g.moved && Date.now() - g.startTime < TAP_MAX_DURATION_MS) {
        dispatch({ type: 'THREE_FINGER_TAP' })
      }
      return
    }

    if (g.fingerCount === 2) {
      if (e.touches.length === 0 && !g.holdFired && !g.swipeDispatched && Date.now() - g.startTime < TAP_MAX_DURATION_MS) {
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
      return
    }

    // One finger.
    if (stateRef.current.mode === 'explore') {
      clearRestTimer()
      return
    }

    if (g.holdFired) return // HOLD already dispatched; this lift is not also a tap
    if (g.moved) return // movement already dispatched TAP_RESET (and maybe a SWIPE)

    dispatch({ type: 'TAP' })
    g.tapFinalizeTimer = window.setTimeout(() => {
      g.tapFinalizeTimer = null
      dispatch({ type: 'TAP_FINALIZE' })
    }, TAP_COUNT_WINDOW_MS)
  }

  const onTouchCancel = () => {
    clearHoldTimer()
    clearRestTimer()
    clearTapFinalizeTimer()
    clearPendingTwoFingerTapTimer()
    dispatch({ type: 'TAP_RESET' })
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
        <span className="sparsh-mode-badge">
          {state.mode === 'explore'
            ? 'Explore'
            : state.buildSub.kind === 'partChosen'
              ? `Build · ${state.buildSub.partType}`
              : 'Build'}
        </span>
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
