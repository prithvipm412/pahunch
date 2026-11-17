import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { CircuitComponent, GridPoint } from '../contracts/netlist'
import { solve } from '../physics'
import { getAudioGeneration, isAudioGenerationCurrent, playSequence, sonify, stopAll, stopSonify, vibrate } from '../audio'
import { useLanguage } from '../app/lang'
import { fallbackFor } from './clips'
import { classifySwipe, isEdgeStart, isPairedTap, pointFromClient, resolveFingerClass } from './gestures'
import { createInitialState, sparshReducer, type SparshEffect, type SparshEvent, type SparshState } from './machine'
import './sparsh.css'

// A single movement threshold for every swipe, 1-, 2-, or 3-finger alike.
const MOVEMENT_THRESHOLD = 40
const TAP_COUNT_WINDOW_MS = 350
const DOUBLE_TAP_WINDOW_MS = 350
const DOUBLE_TAP_MAX_DIST = 44
const HOLD_MS = 600
const REST_MS = 500
const TAP_MAX_DURATION_MS = 500
// Android's system back-gesture zone, left and right edge of the screen.
const EDGE_ZONE_PX = 24

interface GestureTracker {
  active: boolean // from the first finger touching down until the last one lifts
  committedClass: number // 0 (no gesture yet), else the gesture's finger count, 1-3 — only ever increases during a gesture
  fingerSamples: number[] // touches.length at every touchstart/move/end this gesture, for resolveFingerClass
  startX: number
  startY: number
  startTime: number
  moved: boolean
  swipeDispatched: boolean
  holdFired: boolean
  edgeIgnored: boolean // this gesture started inside the system-back-gesture zone
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
    active: false,
    committedClass: 0,
    fingerSamples: [],
    startX: 0,
    startY: 0,
    startTime: 0,
    moved: false,
    swipeDispatched: false,
    holdFired: false,
    edgeIgnored: false,
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

function midpoint(touches: React.TouchList): { x: number; y: number } {
  let x = 0
  let y = 0
  for (let i = 0; i < touches.length; i++) {
    x += touches[i].clientX
    y += touches[i].clientY
  }
  return { x: x / touches.length, y: y / touches.length }
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
      let token = getAudioGeneration()
      for (const effect of effects) {
        if (!isAudioGenerationCurrent(token)) return
        if (effect.type === 'speak') {
          setCaption(effect.clips.map(fallbackFor).join(' · '))
          await playSequence(lang, effect.clips, (clip) => fallbackFor(clip as Parameters<typeof fallbackFor>[0]))
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
          token = getAudioGeneration()
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

  // The popstate listener below is installed once, on mount, so it must read the latest
  // `dispatch` through a ref rather than closing over a possibly-stale one.
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch

  useEffect(() => {
    window.history.pushState({ sparshGuard: true }, '')
    const onPopState = () => {
      // Cancel the back navigation by immediately pushing another entry, and explain how to
      // actually leave instead.
      window.history.pushState({ sparshGuard: true }, '')
      dispatchRef.current({ type: 'BACK_INTERCEPTED' })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

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

  const clearGestureTimers = () => {
    clearHoldTimer()
    clearTapFinalizeTimer()
    clearRestTimer()
    clearPendingTwoFingerTapTimer()
  }

  useEffect(() => {
    const stopAndClearOnHide = () => {
      if (document.visibilityState !== 'hidden') return
      clearGestureTimers()
      stopAll()
    }
    document.addEventListener('visibilitychange', stopAndClearOnHide)
    return () => {
      document.removeEventListener('visibilitychange', stopAndClearOnHide)
      clearGestureTimers()
      stopAll()
    }
  }, [])

  const scheduleRest = (point: GridPoint) => {
    clearRestTimer()
    gestureRef.current.restTimer = window.setTimeout(() => dispatch({ type: 'REST', point }), REST_MS)
  }

  // Commits the gesture to a (higher) finger class — called the moment resolveFingerClass says
  // more fingers have touched down than we'd committed to so far. Starts whatever timer that
  // class needs, using the *current* touch positions (not the original 1-finger start), since a
  // 2- or 3-finger gesture's "start" is from the moment all its fingers are down.
  const commitClass = (cls: number, touches: React.TouchList) => {
    const g = gestureRef.current
    clearHoldTimer()
    if (g.committedClass === 1 && cls >= 2) {
      // Upgrading away from a 1-finger gesture abandons any one-finger tap count in progress.
      clearTapFinalizeTimer()
      dispatch({ type: 'TAP_RESET' })
    }
    g.committedClass = cls
    if (cls === 1) {
      const t = touches[0]
      g.startX = t.clientX
      g.startY = t.clientY
      g.holdTimer = window.setTimeout(() => {
        if (!g.moved) {
          g.holdFired = true
          dispatch({ type: 'HOLD' })
        }
      }, HOLD_MS)
    } else if (cls === 2) {
      const mid = midpoint(touches)
      g.startX = mid.x
      g.startY = mid.y
      g.holdTimer = window.setTimeout(() => {
        if (!g.moved) {
          g.holdFired = true
          dispatch({ type: 'TWO_FINGER_HOLD' })
        }
      }, HOLD_MS)
    } else {
      const mid = midpoint(touches)
      g.startX = mid.x
      g.startY = mid.y
      // 3 fingers: no hold gesture is defined, nothing further to start.
    }
  }

  const handleUnlock = () => {
    setUnlocked(true)
    dispatch({ type: 'INIT' })
  }

  const onTouchStart = (e: React.TouchEvent) => {
    const g = gestureRef.current
    if (!g.active) {
      g.active = true
      g.fingerSamples = []
      g.committedClass = 0
      g.moved = false
      g.swipeDispatched = false
      g.holdFired = false
      g.startTime = Date.now()
      const t = e.touches[0]
      g.edgeIgnored = isEdgeStart(t.clientX, window.innerWidth, EDGE_ZONE_PX)
    }
    g.fingerSamples.push(e.touches.length)
    const resolved = resolveFingerClass(g.fingerSamples)
    if (resolved > g.committedClass) commitClass(resolved, e.touches)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gestureRef.current
    if (!g.active) return

    g.fingerSamples.push(e.touches.length)
    const resolved = resolveFingerClass(g.fingerSamples)
    if (resolved > g.committedClass) commitClass(resolved, e.touches)

    if (g.committedClass === 3) return // no movement handling for a 3-finger gesture

    if (g.committedClass === 2) {
      if (e.touches.length < 2) return
      const mid = midpoint(e.touches)
      const dx = mid.x - g.startX
      const dy = mid.y - g.startY
      if (!g.moved && Math.hypot(dx, dy) > MOVEMENT_THRESHOLD) {
        g.moved = true
        clearHoldTimer()
      }
      if (!g.swipeDispatched && !g.edgeIgnored) {
        const direction = classifySwipe(dx, dy, MOVEMENT_THRESHOLD)
        if (direction === 'left') {
          g.swipeDispatched = true
          dispatch({ type: 'TWO_FINGER_SWIPE_LEFT', now: Date.now() })
        } else if (direction === 'right') {
          g.swipeDispatched = true
          dispatch({ type: 'TWO_FINGER_SWIPE_RIGHT' })
        } else if (direction === 'down') {
          g.swipeDispatched = true
          dispatch({ type: 'TWO_FINGER_SWIPE_DOWN' })
        } else if (direction === 'up') {
          g.swipeDispatched = true
          dispatch({ type: 'TWO_FINGER_SWIPE_UP' })
        }
      }
      return
    }

    // committedClass === 1
    const t = e.touches[0]
    const dx = t.clientX - g.startX
    const dy = t.clientY - g.startY
    if (!g.moved && Math.hypot(dx, dy) > MOVEMENT_THRESHOLD) {
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

    if (!g.swipeDispatched && !g.edgeIgnored) {
      const direction = classifySwipe(dx, dy, MOVEMENT_THRESHOLD)
      if (direction) {
        g.swipeDispatched = true
        dispatch({ type: 'SWIPE', direction })
      }
    }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const g = gestureRef.current
    if (!g.active) return
    clearHoldTimer()

    g.fingerSamples.push(e.touches.length)
    const resolved = resolveFingerClass(g.fingerSamples)
    if (resolved > g.committedClass) commitClass(resolved, e.touches)

    if (e.touches.length > 0) return // more fingers still down — not the end of the gesture yet

    // Last finger lifted. Classify the WHOLE gesture now, using the maximum finger count it
    // ever had — never using whatever the count happened to be at any single instant.
    g.active = false

    if (g.committedClass === 3) {
      if (!g.moved && Date.now() - g.startTime < TAP_MAX_DURATION_MS) {
        dispatch({ type: 'THREE_FINGER_TAP' })
      }
      return
    }

    if (g.committedClass === 2) {
      if (g.holdFired || g.swipeDispatched || Date.now() - g.startTime >= TAP_MAX_DURATION_MS) return
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
      return
    }

    // committedClass === 1
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
    const g = gestureRef.current
    g.active = false
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
