/**
 * src/audio/feedbackSounds.ts — short synthesized Web Audio stingers (no audio files, works
 * offline): a success bell, a soft "not working" tone, and a danger alarm. Reuses the shared
 * AudioContext from ./index (same instance unlockAudio()/sonify() use) rather than opening a
 * second one. There is no existing app-wide sound mute to respect yet (confirmed: nothing in
 * this codebase currently stores a sound-muted setting) — if one is added later, gate these
 * three functions on it the same way haptic() gates on isHapticsEnabled().
 */
import type { SolveResult } from '../contracts/netlist'
import { getAudioContext } from './index'

export type CircuitStatus = 'working' | 'not_working' | 'broken'

/** Classifies a solve() result into the three feedback buckets the task defines. A bulb can be
 * in the dangerous 'overload' state without the solver ever adding a 'short_circuit' error (that
 * error only fires when the *battery's own* current exceeds the limit), so both are checked. */
export function classifyCircuitStatus(result: SolveResult): CircuitStatus {
  const hasOverload = result.components.some((c) => c.state === 'overload')
  if (result.errors.includes('short_circuit') || hasOverload) return 'broken'
  if (!result.ok || result.errors.includes('empty') || result.errors.includes('no_battery') || result.errors.includes('open_circuit')) {
    return 'not_working'
  }
  return 'working'
}

interface ToneOptions {
  freq: number
  freqEnd?: number
  start: number
  duration: number
  peakGain: number
  type?: OscillatorType
}

function playTone(ctx: AudioContext, opts: ToneOptions): void {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = opts.type ?? 'sine'
  oscillator.frequency.setValueAtTime(opts.freq, opts.start)
  if (opts.freqEnd !== undefined) oscillator.frequency.linearRampToValueAtTime(opts.freqEnd, opts.start + opts.duration)
  gain.gain.setValueAtTime(0.0001, opts.start)
  gain.gain.linearRampToValueAtTime(opts.peakGain, opts.start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, opts.start + opts.duration)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(opts.start)
  oscillator.stop(opts.start + opts.duration + 0.03)
  oscillator.onended = () => {
    try { oscillator.disconnect(); gain.disconnect() } catch { /* A node can already be disconnected. */ }
  }
}

function resumeIfSuspended(ctx: AudioContext): void {
  if (ctx.state === 'suspended') void ctx.resume().catch(() => { /* Audio may be blocked until another gesture. */ })
}

/** A pleasant soft bell: a quick 3-note rising arpeggio (C5–E5–G5) with a gentle soft harmonic
 * on each note, quick attack, ~1.2s total decay. */
export function successBell(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const t0 = ctx.currentTime
    const notes = [523.25, 659.25, 783.99] // C5, E5, G5
    notes.forEach((freq, i) => {
      const start = t0 + i * 0.12
      playTone(ctx, { freq, start, duration: 0.9, peakGain: 0.14 })
      playTone(ctx, { freq: freq * 2, start, duration: 0.5, peakGain: 0.04 }) // soft harmonic, one octave up
    })
    resumeIfSuspended(ctx)
  } catch { /* Web Audio may be unavailable. */ }
}

/** A soft, low, non-scary falling "bonk" (~0.25s) for an incomplete or dark circuit. */
export function notWorkingTone(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const t0 = ctx.currentTime
    playTone(ctx, { freq: 220, freqEnd: 140, start: t0, duration: 0.25, peakGain: 0.12, type: 'sine' })
    resumeIfSuspended(ctx)
  } catch { /* Web Audio may be unavailable. */ }
}

/** A clear, moderate-volume (not ear-piercing) two-tone alert for a short circuit or overload:
 * beep-beep, repeated 3 times, ~1s total. */
export function alarm(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const t0 = ctx.currentTime
    const beep = 0.09
    const gap = 0.05
    const cycle = beep * 2 + gap * 2
    for (let i = 0; i < 3; i++) {
      const base = t0 + i * cycle
      playTone(ctx, { freq: 880, start: base, duration: beep, peakGain: 0.16, type: 'triangle' })
      playTone(ctx, { freq: 660, start: base + beep + gap, duration: beep, peakGain: 0.16, type: 'triangle' })
    }
    resumeIfSuspended(ctx)
  } catch { /* Web Audio may be unavailable. */ }
}

/** Plays the right stinger for a classified circuit status. */
export function playCircuitStatusSound(status: CircuitStatus): void {
  if (status === 'working') successBell()
  else if (status === 'broken') alarm()
  else notWorkingTone()
}
