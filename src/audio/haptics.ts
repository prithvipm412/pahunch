/**
 * src/audio/haptics.ts — named vibration patterns wrapping navigator.vibrate safely.
 *
 * - Feature-detected and wrapped in try/catch, so it silently no-ops on iOS/unsupported browsers.
 * - Throttled: every call cancels any in-flight pattern first (`vibrate(0)`) so patterns never
 *   overlap/stack.
 * - Gated on a global on/off setting saved in localStorage, default on (see isHapticsEnabled /
 *   setHapticsEnabled — the Home screen's "Vibration: On/Off" toggle reads and writes this).
 * - Respects prefers-reduced-motion for decorative taps only. A circuit-status or Learn
 *   correct/wrong result is informational, not decorative, so those names are always "essential"
 *   regardless of caller; Sparsh additionally passes `essential: true` on every call it makes
 *   (vibration there is blind students' primary feedback channel, not a decorative flourish).
 */
export type HapticName =
  | 'tap'
  | 'select'
  | 'send'
  | 'place_wire'
  | 'place_battery'
  | 'place_bulb'
  | 'place_resistor'
  | 'place_switch'
  | 'toggle_switch'
  | 'delete'
  | 'undo'
  | 'invalid'
  | 'circuit_working'
  | 'circuit_not_working'
  | 'circuit_broken'
  | 'learn_correct'
  | 'learn_wrong'
  | 'scan_success'

export const HAPTIC_PATTERNS: Record<HapticName, number | number[]> = {
  tap: 10,
  select: 15,
  send: 25,
  place_wire: 20,
  place_battery: [60, 40, 60],
  place_bulb: 40,
  place_resistor: [15, 30, 15, 30, 15],
  place_switch: [10, 20, 30],
  toggle_switch: 30,
  delete: [30, 60, 10],
  undo: [10, 40, 30],
  invalid: [50, 30, 50],
  circuit_working: 600,
  circuit_not_working: 80,
  circuit_broken: [120, 60, 120, 60, 120],
  learn_correct: [30, 50, 30],
  learn_wrong: 80,
  scan_success: [30, 50, 30],
}

// Informational outcomes — never suppressed by prefers-reduced-motion, in any module.
const ALWAYS_ESSENTIAL: ReadonlySet<HapticName> = new Set([
  'circuit_working',
  'circuit_not_working',
  'circuit_broken',
  'learn_correct',
  'learn_wrong',
])

const HAPTICS_ENABLED_KEY = 'pahunch_haptics_enabled'

/** Whether the global vibration setting is on (default: on). */
export function isHapticsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(HAPTICS_ENABLED_KEY)
    return raw === null ? true : raw === 'on'
  } catch {
    return true
  }
}

/** Persists the global vibration on/off setting. */
export function setHapticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HAPTICS_ENABLED_KEY, enabled ? 'on' : 'off')
  } catch { /* localStorage may be unavailable (private mode, quota). */ }
}

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches === true
  } catch {
    return false
  }
}

function supportsVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/** Fires a named vibration pattern. See the file header for the on/off and reduced-motion rules. */
export function haptic(name: HapticName, opts?: { essential?: boolean }): void {
  if (!isHapticsEnabled()) return
  const essential = opts?.essential === true || ALWAYS_ESSENTIAL.has(name)
  if (!essential && prefersReducedMotion()) return
  if (!supportsVibrate()) return
  try {
    navigator.vibrate(0) // cancel any in-flight pattern first, so patterns never overlap
    navigator.vibrate(HAPTIC_PATTERNS[name])
  } catch { /* Vibration may be unsupported or blocked by the browser. */ }
}

/** Maps a classified circuit status (see src/audio/feedbackSounds.ts) to its haptic name. */
export function hapticForCircuitStatus(status: 'working' | 'not_working' | 'broken'): HapticName {
  if (status === 'working') return 'circuit_working'
  if (status === 'broken') return 'circuit_broken'
  return 'circuit_not_working'
}
