import type { SolveResult } from '../contracts/netlist'

interface ClipTask {
  lang: 'en' | 'kn'
  name: string
  fallbackText?: string
  generation: number
  resolve: () => void
}

let generation = 0
const clipQueue: ClipTask[] = []
let drainingQueue = false
let currentPlayback: { cancel: () => void } | null = null
let context: AudioContext | null = null
let oscillator: OscillatorNode | null = null
let gain: GainNode | null = null
const activeAudioNodes = new Set<AudioNode>()
const pendingTimers = new Set<number>()
let sonifyTimer: number | null = null

/** Returns the single shared AudioContext (same instance sonify()/unlockAudio() use), or null
 * if Web Audio is unavailable. Exported so feedbackSounds.ts can play its stingers through it
 * rather than opening a second context. */
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioContextConstructor = window.AudioContext
  if (!AudioContextConstructor) return null
  context ??= new AudioContextConstructor()
  return context
}

/** Returns the current cancellation generation for long-running screen actions. */
export function getAudioGeneration(): number {
  return generation
}

/** Checks whether an async action still belongs to the current audio generation. */
export function isAudioGenerationCurrent(token: number): boolean {
  return token === generation
}

/** Creates and resumes the shared audio context after a user gesture. */
export async function unlockAudio(): Promise<void> {
  try {
    const audioContext = getAudioContext()
    if (audioContext?.state === 'suspended') await audioContext.resume()
  } catch { /* Audio can remain unavailable when the browser blocks it. */ }
}

/** Queues a named language clip, with optional spoken fallback text. */
export function playClip(lang: 'en' | 'kn', name: string, fallbackText?: string): Promise<void> {
  return enqueueClip(lang, name, fallbackText, generation)
}

function enqueueClip(lang: 'en' | 'kn', name: string, fallbackText: string | undefined, token: number): Promise<void> {
  if (token !== generation) return Promise.resolve()
  return new Promise((resolve) => {
    clipQueue.push({ lang, name, fallbackText, generation: token, resolve })
    void drainClipQueue()
  })
}

async function drainClipQueue(): Promise<void> {
  if (drainingQueue) return
  drainingQueue = true
  while (clipQueue.length > 0) {
    const task = clipQueue.shift()!
    if (task.generation !== generation) {
      task.resolve()
      continue
    }
    try { await playQueuedClip(task) }
    catch { console.warn(`Audio playback failed: ${task.lang}/${task.name}`) }
  }
  drainingQueue = false
  if (clipQueue.length > 0) void drainClipQueue()
}

function playQueuedClip(task: ClipTask): Promise<void> {
  return new Promise((resolve) => {
    if (task.generation !== generation) { resolve(); return }
    let audio: HTMLAudioElement
    try { audio = new Audio(`/audio/${task.lang}/${encodeURIComponent(task.name)}.mp3`) }
    catch {
      console.warn(`Audio clip missing or unavailable: ${task.lang}/${task.name}`)
      resolve()
      return
    }
    let settled = false
    let missing = false
    const finish = () => {
      if (settled) return
      settled = true
      audio.removeEventListener('ended', finish)
      audio.removeEventListener('error', onError)
      if (currentPlayback?.cancel === cancel) currentPlayback = null
      task.resolve()
      resolve()
    }
    const cancel = () => {
      try { audio.pause(); audio.currentTime = 0 } catch { /* The media element may not have loaded. */ }
      finish()
    }
    const onError = () => {
      missing = true
      console.warn(`Audio clip missing or unavailable: ${task.lang}/${task.name}`)
      finish()
    }
    currentPlayback = { cancel }
    audio.addEventListener('ended', finish, { once: true })
    audio.addEventListener('error', onError, { once: true })
    try { void audio.play().catch(async (error: unknown) => {
      if (settled) return
      const errorName = error instanceof DOMException ? error.name : ''
      if (task.generation !== generation || errorName === 'AbortError') { finish(); return }
      if (audio.error || errorName === 'NotSupportedError') {
        if (!missing) console.warn(`Audio clip missing or unavailable: ${task.lang}/${task.name}`)
        finish()
        return
      }
      try {
        audio.pause()
        audio.currentTime = 0
      } catch { /* Ignore incomplete media state. */ }
      try { await speakFallback(task.fallbackText, task.generation) } catch { /* Speech fallback is optional. */ }
      finish()
    }) } catch {
      console.warn(`Audio clip missing or unavailable: ${task.lang}/${task.name}`)
      finish()
    }
  })
}

function speakFallback(text: string | undefined, token: number): Promise<void> {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window) || token !== generation) return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en'
    const finish = () => {
      if (settled) return
      settled = true
      utterance.onend = null
      utterance.onerror = null
      if (currentPlayback?.cancel === cancel) currentPlayback = null
      resolve()
    }
    const cancel = () => {
      window.speechSynthesis.cancel()
      finish()
    }
    utterance.onend = finish
    utterance.onerror = finish
    currentPlayback = { cancel }
    try { window.speechSynthesis.speak(utterance) } catch { finish() }
  })
}

/** Plays clips in order; cancellation prevents remaining clips from starting. */
export async function playSequence(
  lang: 'en' | 'kn',
  names: string[],
  fallbackText?: (name: string) => string | undefined,
): Promise<void> {
  const token = generation
  for (const name of names) {
    if (token !== generation) return
    await enqueueClip(lang, name, fallbackText?.(name), token)
  }
}

/** Stops clips, speech, sonification, timers, and vibration; invalidates async continuations. */
export function stopAll(): void {
  generation += 1
  for (const task of clipQueue.splice(0)) task.resolve()
  currentPlayback?.cancel()
  currentPlayback = null
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  if (typeof window !== 'undefined') {
    for (const timer of pendingTimers) window.clearTimeout(timer)
  }
  pendingTimers.clear()
  stopSonify()
  for (const node of activeAudioNodes) {
    try { node.disconnect() } catch { /* A node can already be disconnected. */ }
  }
  activeAudioNodes.clear()
  try { if (typeof navigator !== 'undefined') navigator.vibrate?.(0) } catch { /* Vibration may be unsupported. */ }
}

/** Starts a continuous tone shaped by total bulb power and circuit current. */
export function sonify(result: SolveResult): void {
  const totalPower = result.components.reduce((sum, component) => sum + Math.max(0, component.power), 0)
  const totalCurrent = result.components.reduce((sum, component) => sum + Math.abs(component.current), 0)
  try {
    const audioContext = getAudioContext()
    if (!audioContext) return
    if (!oscillator || !gain) {
      oscillator = audioContext.createOscillator()
      gain = audioContext.createGain()
      activeAudioNodes.add(oscillator)
      activeAudioNodes.add(gain)
      oscillator.type = 'sine'
      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.start()
    }
    const now = audioContext.currentTime
    oscillator.frequency.setTargetAtTime(180 + Math.min(totalCurrent, 3) * 180, now, 0.12)
    gain.gain.setTargetAtTime(Math.min(0.16, 0.018 + Math.sqrt(totalPower) * 0.025), now, 0.16)
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => { /* Audio may be blocked until another gesture. */ })
    if (sonifyTimer !== null) {
      window.clearTimeout(sonifyTimer)
      pendingTimers.delete(sonifyTimer)
    }
    sonifyTimer = window.setTimeout(() => {
      if (sonifyTimer !== null) pendingTimers.delete(sonifyTimer)
      sonifyTimer = null
      stopSonify()
    }, 1500)
    pendingTimers.add(sonifyTimer)
  } catch { stopSonify() }
}

/** Stops and disconnects the continuous circuit tone. */
export function stopSonify(): void {
  if (sonifyTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(sonifyTimer)
    pendingTimers.delete(sonifyTimer)
    sonifyTimer = null
  }
  if (context && gain) {
    try { gain.gain.setTargetAtTime(0, context.currentTime, 0.025) } catch { /* Context may be closed. */ }
  }
  try { oscillator?.stop() } catch { /* It may already have stopped. */ }
  try { oscillator?.disconnect() } catch { /* It may already be disconnected. */ }
  try { gain?.disconnect() } catch { /* It may already be disconnected. */ }
  if (oscillator) activeAudioNodes.delete(oscillator)
  if (gain) activeAudioNodes.delete(gain)
  oscillator = null
  gain = null
}

/** Vibrates when the browser supports device vibration. */
export function vibrate(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern) } catch { /* Unsupported or blocked by the browser. */ }
}
